import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, Platform } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { getDb } from '../../database';

type Appointment = {
  id: number;
  patientId: number;
  date: string;
  status: string;
  patientName?: string;
  paymentId?: number;
};

type Patient = {
  id: number;
  name: string;
};

export default function CalendarScreen() {
  const db = getDb();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currency, setCurrency] = useState('₹');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [appointmentTime, setAppointmentTime] = useState(new Date());
  
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [activeAppointmentId, setActiveAppointmentId] = useState<number | null>(null);
  const [activeAppointmentDate, setActiveAppointmentDate] = useState<string>('');

  const loadData = (dateStr: string) => {
    try {
      const cRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'currency'");
      if (cRow) setCurrency(cRow.value);

      const rows = db.getAllSync<Appointment>(
        `SELECT A.*, P.name as patientName, 
          (SELECT id FROM Payments WHERE appointmentId = A.id LIMIT 1) as paymentId 
         FROM Appointments A 
         JOIN Patients P ON A.patientId = P.id 
         WHERE A.date LIKE ? ORDER BY A.date ASC`,
         [`${dateStr}%`]
      );
      setAppointments(rows);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData(selectedDate);
      try {
        const pts = db.getAllSync<Patient>('SELECT id, name FROM Patients ORDER BY name ASC');
        setPatients(pts);
      } catch (e) {
        console.error(e);
      }
    }, [selectedDate])
  );

  const handleDayPress = (day: any) => setSelectedDate(day.dateString);

  const handleOpenNew = () => {
    setEditingId(null);
    setSelectedPatientId(null);
    setAppointmentTime(new Date());
    setModalVisible(true);
  };

  const handleEdit = (item: Appointment) => {
    setEditingId(item.id);
    setSelectedPatientId(item.patientId);
    setAppointmentTime(new Date(item.date));
    setModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Are you sure you want to delete this appointment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        try {
          db.runSync('DELETE FROM Appointments WHERE id = ?', id);
          loadData(selectedDate);
        } catch (e) {
          console.error(e);
        }
      }}
    ]);
  };

  const openTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: appointmentTime,
        mode: 'time',
        is24Hour: false,
        onChange: (event, date) => {
          if (date) setAppointmentTime(date);
        },
      });
    }
  };

  const handleSaveAppointment = () => {
    if (!selectedPatientId) return alert('Please select a patient.');
    
    const dt = new Date(selectedDate);
    dt.setHours(appointmentTime.getHours(), appointmentTime.getMinutes(), 0, 0);
    const dateString = dt.toISOString();

    // Prevent backdating for NEW appointments
    if (!editingId && dt < new Date()) {
      return alert('Cannot schedule an appointment in the past.');
    }

    try {
      if (editingId) {
        db.runSync('UPDATE Appointments SET patientId = ?, date = ? WHERE id = ?', selectedPatientId, dateString, editingId);
      } else {
        db.runSync('INSERT INTO Appointments (patientId, date, status) VALUES (?, ?, ?)', selectedPatientId, dateString, 'Scheduled');
      }
      setModalVisible(false);
      loadData(selectedDate);
    } catch (e) {
      console.error(e);
      alert('Error saving appointment');
    }
  };

  const handleStatusChange = (nextStatus: string) => {
    if (!activeAppointmentId) return;
    
    const now = new Date();
    const apptTime = new Date(activeAppointmentDate);
    const apptEndTime = new Date(apptTime.getTime() + 60 * 60 * 1000); // 1 hr duration
    
    if (nextStatus === 'Cancelled' && now >= apptTime) {
      alert('Cannot cancel an appointment after its scheduled start time.');
      setStatusMenuVisible(false);
      return;
    }
    
    if (nextStatus === 'Missed' && now <= apptEndTime) {
      alert('Cannot mark as missed before the appointment end time (1 hour duration).');
      setStatusMenuVisible(false);
      return;
    }

    try {
      db.runSync('UPDATE Appointments SET status = ? WHERE id = ?', nextStatus, activeAppointmentId);
      loadData(selectedDate);
      setStatusMenuVisible(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCollectPayment = (appt: Appointment) => {
    try {
      // Create a default payment record for this appointment. Assuming a standard fee of 500.
      db.runSync(
        'INSERT INTO Payments (patientId, appointmentId, amount, date, status) VALUES (?, ?, ?, ?, ?)',
        appt.patientId, appt.id, 500.00, new Date().toISOString(), 'Received'
      );
      loadData(selectedDate);
      alert('Payment collected successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to log payment.');
    }
  };

  const renderItem = ({ item }: { item: Appointment }) => {
    const apptTime = new Date(item.date);
    const time = apptTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isPast = new Date() >= apptTime;
    
    let badgeStyle = styles.badgeScheduled;
    let textStyle = styles.textScheduled;
    if (item.status === 'Completed') { badgeStyle = styles.badgeCompleted; textStyle = styles.textCompleted; }
    if (item.status === 'Missed') { badgeStyle = styles.badgeMissed; textStyle = styles.textMissed; }
    if (item.status === 'Cancelled') { badgeStyle = styles.badgeCancelled; textStyle = styles.textCancelled; }

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color="#4F46E5" />
              <Text style={styles.timeText}>{time}</Text>
            </View>
            <View style={styles.timeRow}>
              <Ionicons name="person-outline" size={16} color="#6B7280" />
              <Text style={styles.patientName}>{item.patientName}</Text>
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.statusBadge, badgeStyle]}
            onPress={() => { setActiveAppointmentId(item.id); setActiveAppointmentDate(item.date); setStatusMenuVisible(true); }}
          >
            <Text style={[styles.statusText, textStyle]}>{item.status}  ▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardFooter}>
          {item.status === 'Completed' && (
            item.paymentId ? (
              <View style={styles.paidPill}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.paidText}>Paid</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.collectBtn} onPress={() => handleCollectPayment(item)}>
                <Ionicons name="card" size={16} color="white" />
                <Text style={styles.collectBtnText}>Collect Payment</Text>
              </TouchableOpacity>
            )
          )}
          
          <View style={{ flex: 1 }} />
          
          {!isPast && (
            <TouchableOpacity style={styles.actionIcon} onPress={() => handleEdit(item)}>
              <Ionicons name="pencil" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={{ [selectedDate]: { selected: true, selectedColor: '#4F46E5' } }}
        theme={{ todayTextColor: '#4F46E5', arrowColor: '#4F46E5', textDayFontWeight: '500', textMonthFontWeight: 'bold' }}
      />
      
      <View style={styles.listHeader}>
        <Ionicons name="calendar-outline" size={20} color="#374151" />
        <Text style={styles.listTitle}>{new Date(selectedDate).toDateString()}</Text>
      </View>

      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cafe-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No appointments today.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleOpenNew}>
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      {/* Appointment Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Appointment' : 'New Appointment'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          <View style={styles.form}>
            <Text style={styles.label}>Select Patient</Text>
            <FlatList 
              data={patients}
              keyExtractor={item => item.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 60, marginBottom: 20 }}
              renderItem={({item}) => (
                <TouchableOpacity 
                  style={[styles.patientPill, selectedPatientId === item.id && styles.patientPillSelected]}
                  onPress={() => setSelectedPatientId(item.id)}
                >
                  <Text style={[styles.patientPillText, selectedPatientId === item.id && styles.patientPillTextSelected]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <Text style={styles.label}>Select Time</Text>
            <TouchableOpacity style={styles.timeSelector} onPress={openTimePicker}>
              <Ionicons name="time" size={24} color="#4F46E5" />
              <Text style={styles.timeSelectorText}>{appointmentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveAppointment}>
              <Text style={styles.saveButtonText}>Save Visit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Status ActionSheet Modal */}
      <Modal visible={statusMenuVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.menuBox}>
            <Text style={styles.menuTitle}>Change Status</Text>
            <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={() => handleStatusChange('Scheduled')}>
              <Text style={[styles.menuBtnText, styles.textScheduled]}>Scheduled</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuBtn, styles.badgeCompleted]} onPress={() => handleStatusChange('Completed')}>
              <Text style={[styles.menuBtnText, styles.textCompleted]}>Completed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuBtn, styles.badgeMissed]} onPress={() => handleStatusChange('Missed')}>
              <Text style={[styles.menuBtnText, styles.textMissed]}>Missed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuBtn, styles.badgeCancelled]} onPress={() => handleStatusChange('Cancelled')}>
              <Text style={[styles.menuBtnText, styles.textCancelled]}>Cancelled</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setStatusMenuVisible(false)}>
              <Text style={styles.menuCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  listHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 8 },
  listTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 18, fontWeight: '800', color: '#111827' },
  patientName: { fontSize: 15, color: '#4B5563', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: '700' },
  badgeScheduled: { backgroundColor: '#E0E7FF' }, textScheduled: { color: '#4338CA' },
  badgeCompleted: { backgroundColor: '#D1FAE5' }, textCompleted: { color: '#047857' },
  badgeMissed: { backgroundColor: '#FEF3C7' }, textMissed: { color: '#B45309' },
  badgeCancelled: { backgroundColor: '#FEE2E2' }, textCancelled: { color: '#B91C1C' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  actionIcon: { padding: 8, backgroundColor: '#F9FAFB', borderRadius: 12, marginLeft: 12 },
  collectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F46E5', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 6 },
  collectBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  paidPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 },
  paidText: { color: '#047857', fontWeight: 'bold', fontSize: 13 },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  fab: { position: 'absolute', right: 24, bottom: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB', paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: 'white' },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  form: { padding: 24 },
  label: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 12 },
  patientPill: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, marginRight: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E5E7EB' },
  patientPillSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  patientPillText: { color: '#4B5563', fontWeight: '600' },
  patientPillTextSelected: { color: 'white', fontWeight: 'bold' },
  timeSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 40, gap: 12 },
  timeSelectorText: { fontSize: 24, color: '#111827', fontWeight: 'bold' },
  saveButton: { backgroundColor: '#4F46E5', padding: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  menuBox: { backgroundColor: 'white', width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
  menuTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 20 },
  menuBtn: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  menuBtnText: { fontSize: 16, fontWeight: 'bold' },
  menuCancel: { marginTop: 12, padding: 16, width: '100%', alignItems: 'center' },
  menuCancelText: { color: '#6B7280', fontSize: 16, fontWeight: '600' }
});
