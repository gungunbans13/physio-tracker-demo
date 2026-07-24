import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, Platform, ScrollView, TextInput, Linking } from 'react-native';
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
  patientPhone?: string;
  paymentId?: number;
  paymentStatus?: string;
  seriesId?: string;
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
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  
  const [repeatType, setRepeatType] = useState<'None' | 'Daily' | 'Weekly'>('None');
  const [occurrences, setOccurrences] = useState('5');
  
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  const loadData = (dateStr: string) => {
    try {
      const cRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'currency'");
      if (cRow) setCurrency(cRow.value);

      const rows = db.getAllSync<any>(
        `SELECT A.*, P.name as patientName, P.phone as patientPhone,
          (SELECT id FROM Payments WHERE appointmentId = A.id LIMIT 1) as paymentId,
          (SELECT status FROM Payments WHERE appointmentId = A.id LIMIT 1) as paymentStatus
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
    setEditingSeriesId(null);
    setRepeatType('None');
    setOccurrences('5');
    setModalVisible(true);
  };

  const handleEdit = (item: Appointment) => {
    setEditingId(item.id);
    setSelectedPatientId(item.patientId);
    setAppointmentTime(new Date(item.date));
    setEditingSeriesId(item.seriesId || null);
    setRepeatType('None');
    setOccurrences('1');
    setModalVisible(true);
  };

  const handleDelete = (appt: Appointment) => {
    if (appt.seriesId) {
      Alert.alert(
        'Delete Recurring Visit',
        'This visit is part of a recurring series. How would you like to delete it?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Only This Visit', style: 'destructive', onPress: () => deleteSingle(appt.id) },
          { text: 'This & All Future', style: 'destructive', onPress: () => deleteFuture(appt) }
        ]
      );
    } else {
      Alert.alert('Delete', 'Are you sure you want to delete this appointment?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSingle(appt.id) }
      ]);
    }
  };

  const deleteSingle = (id: number) => {
    try {
      db.runSync('DELETE FROM Payments WHERE appointmentId = ?', id);
      db.runSync('DELETE FROM Appointments WHERE id = ?', id);
      loadData(selectedDate);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFuture = (appt: Appointment) => {
    try {
      const futureAppts = db.getAllSync<{id: number}>('SELECT id FROM Appointments WHERE seriesId = ? AND date >= ?', [appt.seriesId, appt.date]);
      const ids = futureAppts.map(a => a.id);
      if (ids.length > 0) {
        db.withTransactionSync(() => {
          db.runSync(`DELETE FROM Payments WHERE appointmentId IN (${ids.join(',')})`);
          db.runSync(`DELETE FROM Appointments WHERE id IN (${ids.join(',')})`);
        });
      }
      loadData(selectedDate);
    } catch (e) {
      console.error(e);
    }
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

    // Fetch time conflict buffer from Settings
    let bufferMin = 60;
    try {
      const sRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'timeConflictBufferMinutes'");
      if (sRow) bufferMin = parseInt(sRow.value);
    } catch(e) {}

    const performSave = (allFuture: boolean) => {
      try {
        if (editingId) {
          if (!allFuture) {
            // Check conflicts for this single appointment
            if (checkSingleConflict(dt, editingId, bufferMin)) return;
            db.runSync('UPDATE Appointments SET patientId = ?, date = ? WHERE id = ?', selectedPatientId, dateString, editingId);
          } else {
            // Updating this and future instances
            const currentAppt = db.getFirstSync<{seriesId: string, date: string}>('SELECT seriesId, date FROM Appointments WHERE id = ?', [editingId]);
            if (currentAppt && currentAppt.seriesId) {
              const futureAppts = db.getAllSync<{id: number, date: string}>(
                'SELECT id, date FROM Appointments WHERE seriesId = ? AND date >= ?',
                [currentAppt.seriesId, currentAppt.date]
              );

              // Validate conflicts for all future instances
              for (const fut of futureAppts) {
                const futDate = new Date(fut.date);
                futDate.setHours(appointmentTime.getHours(), appointmentTime.getMinutes(), 0, 0);
                if (checkSingleConflict(futDate, fut.id, bufferMin)) return;
              }

              db.withTransactionSync(() => {
                for (const fut of futureAppts) {
                  const futDate = new Date(fut.date);
                  futDate.setHours(appointmentTime.getHours(), appointmentTime.getMinutes(), 0, 0);
                  db.runSync(
                    'UPDATE Appointments SET patientId = ?, date = ? WHERE id = ?',
                    selectedPatientId, futDate.toISOString(), fut.id
                  );
                }
              });
            } else {
              if (checkSingleConflict(dt, editingId, bufferMin)) return;
              db.runSync('UPDATE Appointments SET patientId = ?, date = ? WHERE id = ?', selectedPatientId, dateString, editingId);
            }
          }
        } else {
          // Creating new appointments (check recurring status)
          if (repeatType === 'None') {
            if (checkSingleConflict(dt, null, bufferMin)) return;
            db.runSync('INSERT INTO Appointments (patientId, date, status) VALUES (?, ?, ?)', selectedPatientId, dateString, 'Scheduled');
          } else {
            const numOccurrences = parseInt(occurrences);
            if (isNaN(numOccurrences) || numOccurrences <= 0 || numOccurrences > 50) {
              alert("Please enter a valid number of occurrences (1 - 50).");
              return;
            }

            const seriesId = 'series_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const timesToSave: Date[] = [];
            for (let i = 0; i < numOccurrences; i++) {
              const nextDt = new Date(dt.getTime());
              if (repeatType === 'Daily') {
                nextDt.setDate(dt.getDate() + i);
              } else if (repeatType === 'Weekly') {
                nextDt.setDate(dt.getDate() + i * 7);
              }
              timesToSave.push(nextDt);
            }

            // Verify conflicts for all instances before transactional write
            for (const timeInst of timesToSave) {
              if (checkSingleConflict(timeInst, null, bufferMin)) return;
            }

            db.withTransactionSync(() => {
              for (const timeInst of timesToSave) {
                db.runSync(
                  'INSERT INTO Appointments (patientId, date, status, seriesId) VALUES (?, ?, ?, ?)',
                  selectedPatientId, timeInst.toISOString(), 'Scheduled', seriesId
                );
              }
            });
          }
        }
        setModalVisible(false);
        loadData(selectedDate);
      } catch (e) {
        console.error(e);
        alert('Error saving appointment');
      }
    };

    if (editingId && editingSeriesId) {
      Alert.alert(
        'Edit Recurring Visit',
        'This visit is part of a recurring series. Do you want to update only this visit, or this and all future visits in the series?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Only This Visit', onPress: () => performSave(false) },
          { text: 'This & Future', onPress: () => performSave(true) }
        ]
      );
    } else {
      performSave(false);
    }
  };

  const checkSingleConflict = (targetDt: Date, excludeId: number | null, bufferMin: number): boolean => {
    try {
      const instDateStr = targetDt.toISOString().split('T')[0];
      const startOfDay = `${instDateStr}%`;
      const sameDayAppts = db.getAllSync<{id: number, date: string, patientName: string}>(
        `SELECT A.id, A.date, P.name as patientName 
         FROM Appointments A 
         JOIN Patients P ON A.patientId = P.id
         WHERE A.date LIKE ? AND A.status != 'Cancelled'`,
        [startOfDay]
      );

      for (const other of sameDayAppts) {
        if (excludeId && other.id === excludeId) continue;

        const otherTime = new Date(other.date);
        const diffMs = Math.abs(targetDt.getTime() - otherTime.getTime());
        const diffMin = diffMs / (1000 * 60);

        if (diffMin < bufferMin) {
          alert(`Time conflict: A visit for "${other.patientName}" is already scheduled within ${bufferMin} minutes of ${targetDt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} on ${instDateStr}.`);
          return true;
        }
      }
    } catch(e) {
      console.error(e);
    }
    return false;
  };

  const handleStatusChange = (nextStatus: string) => {
    if (!activeAppointment) return;
    
    const now = new Date();
    const apptTime = new Date(activeAppointment.date);
    const apptEndTime = new Date(apptTime.getTime() + 60 * 60 * 1000); // 1 hr duration

    if (activeAppointment.status === 'Completed') {
      alert('Completed visits cannot be reverted or cancelled. If this visit was logged in error, please delete the record.');
      setStatusMenuVisible(false);
      return;
    }

    if (activeAppointment.status === 'Cancelled') {
      alert('Cancelled visits cannot be directly activated. Please use the Reschedule option to pick a new date and time.');
      setStatusMenuVisible(false);
      return;
    }

    if (nextStatus === 'Completed' && now < apptTime) {
      alert('Cannot mark visit as Completed before its scheduled date and time.');
      setStatusMenuVisible(false);
      return;
    }
    
    if (nextStatus === 'Missed' && now <= apptEndTime) {
      alert('Cannot mark visit as Missed before the scheduled visit end time.');
      setStatusMenuVisible(false);
      return;
    }

    if (nextStatus === 'Cancelled' && now >= apptTime) {
      alert('Cannot cancel a visit whose start time has already passed.');
      setStatusMenuVisible(false);
      return;
    }

    try {
      db.runSync('UPDATE Appointments SET status = ? WHERE id = ?', nextStatus, activeAppointment.id);
      
      // Auto-create Pending payment when marked Completed
      if (nextStatus === 'Completed') {
        const existing = db.getFirstSync<{id: number}>('SELECT id FROM Payments WHERE appointmentId = ?', [activeAppointment.id]);
        if (!existing) {
          const pRow = db.getFirstSync<{defaultFee: number}>('SELECT defaultFee FROM Patients WHERE id = ?', [activeAppointment.patientId]);
          const fee = pRow ? pRow.defaultFee : 500.00;
          db.runSync(
            'INSERT INTO Payments (patientId, appointmentId, amount, date, status) VALUES (?, ?, ?, ?, ?)',
            activeAppointment.patientId, activeAppointment.id, fee, activeAppointment.date, 'Pending'
          );
        }
      }
      
      loadData(selectedDate);
      setStatusMenuVisible(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRescheduleFromMenu = () => {
    if (!activeAppointment) return;
    setStatusMenuVisible(false);
    
    setEditingId(activeAppointment.id);
    setSelectedPatientId(activeAppointment.patientId);
    setAppointmentTime(new Date(activeAppointment.date));
    setEditingSeriesId(activeAppointment.seriesId || null);
    setRepeatType('None');
    setOccurrences('1');
    setModalVisible(true);
  };

  const handleCollectPayment = (appt: Appointment) => {
    try {
      const existing = db.getFirstSync<{id: number}>('SELECT id FROM Payments WHERE appointmentId = ?', [appt.id]);
      if (existing) {
        db.runSync('UPDATE Payments SET status = ? WHERE id = ?', 'Paid', existing.id);
      } else {
        const pRow = db.getFirstSync<{defaultFee: number}>('SELECT defaultFee FROM Patients WHERE id = ?', [appt.patientId]);
        const fee = pRow ? pRow.defaultFee : 500.00;
        db.runSync(
          'INSERT INTO Payments (patientId, appointmentId, amount, date, status) VALUES (?, ?, ?, ?, ?)',
          appt.patientId, appt.id, fee, new Date().toISOString(), 'Paid'
        );
      }
      loadData(selectedDate);
      alert('Payment collected successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to log payment.');
    }
  };

  const handleSendReminder = (appt: any) => {
    if (!appt.patientPhone) return;

    const dateStr = new Date(appt.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = new Date(appt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const whatsappMsg = `Hello *${appt.patientName}*, this is a reminder for your physiotherapy visit scheduled for *${dateStr}* at *${timeStr}*. Please let us know if there are any changes. Thanks!`;
    const smsMsg = `Hello ${appt.patientName}, this is a reminder for your physiotherapy visit scheduled for ${dateStr} at ${timeStr}. Thanks!`;

    Alert.alert(
      'Send Appointment Reminder',
      `Send reminder to ${appt.patientName} (${appt.patientPhone})`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send via WhatsApp', onPress: () => {
          const url = `whatsapp://send?phone=${appt.patientPhone}&text=${encodeURIComponent(whatsappMsg)}`;
          Linking.openURL(url).catch(() => alert('WhatsApp is not installed on this device.'));
        }},
        { text: 'Send via SMS', onPress: () => {
          const separator = Platform.OS === 'ios' ? '&' : '?';
          const url = `sms:${appt.patientPhone}${separator}body=${encodeURIComponent(smsMsg)}`;
          Linking.openURL(url).catch(() => alert('Could not open SMS application.'));
        }}
      ]
    );
  };

  const handleShareAvailability = () => {
    try {
      const settingsRows = db.getAllSync<{key: string, value: string}>('SELECT * FROM Settings');
      const settingsMap: Record<string, string> = {};
      settingsRows.forEach(row => settingsMap[row.key] = row.value);

      const startHr = parseInt(settingsMap['workingHourStart'] || '10');
      const endHr = parseInt(settingsMap['workingHourEnd'] || '18');
      const bufferMin = parseInt(settingsMap['timeConflictBufferMinutes'] || '60');
      const daysStr = settingsMap['workingDays'] || '1,2,3,4,5,6';
      const workDaysList = daysStr.split(',').map(Number);
      const timezone = settingsMap['timezone'] || 'IST';

      const availableSlotsByDay: Record<string, string[]> = {};

      // Scan next 7 days starting tomorrow
      for (let i = 1; i <= 7; i++) {
        const dayDt = new Date();
        dayDt.setDate(dayDt.getDate() + i);
        const dayOfWeek = dayDt.getDay(); // 0-6

        // Check if this day is a working day
        if (!workDaysList.includes(dayOfWeek)) continue;

        const dateKey = dayDt.toISOString().split('T')[0];
        const dayName = dayDt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        
        const daySlots: string[] = [];

        // Loop over operating hours
        for (let hr = startHr; hr < endHr; hr++) {
          const slotDt = new Date(dayDt.getTime());
          slotDt.setHours(hr, 0, 0, 0);

          const startOfDay = `${dateKey}%`;
          const sameDayAppts = db.getAllSync<{date: string}>(
            `SELECT date FROM Appointments WHERE date LIKE ? AND status != 'Cancelled'`,
            [startOfDay]
          );
          
          let isConflicting = false;
          for (const other of sameDayAppts) {
            const otherTime = new Date(other.date);
            const diffMs = Math.abs(slotDt.getTime() - otherTime.getTime());
            const diffMin = diffMs / (1000 * 60);
            if (diffMin < bufferMin) {
              isConflicting = true;
              break;
            }
          }

          if (!isConflicting) {
            const timeLabel = slotDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            daySlots.push(timeLabel);
          }
        }

        if (daySlots.length > 0) {
          availableSlotsByDay[dayName] = daySlots;
        }
      }

      let textMessage = `Hello! Here are my available physiotherapy slots for the upcoming week:\n\n`;
      const dayKeys = Object.keys(availableSlotsByDay);
      if (dayKeys.length === 0) {
        alert('No free slots found in your work schedule for the next 7 days!');
        return;
      }

      for (const day of dayKeys) {
        textMessage += `*${day}:* ${availableSlotsByDay[day].join(', ')} (${timezone})\n`;
      }
      textMessage += `\nPlease let me know which slot works best for you. Thanks!`;

      Alert.alert(
        'Share Available Slots',
        'Send your upcoming free slots to your patients.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send via WhatsApp', onPress: () => {
            const url = `whatsapp://send?text=${encodeURIComponent(textMessage)}`;
            Linking.openURL(url).catch(() => alert('WhatsApp is not installed on this device.'));
          }},
          { text: 'Send via SMS', onPress: () => {
            const separator = Platform.OS === 'ios' ? '&' : '?';
            const url = `sms:${separator}body=${encodeURIComponent(textMessage)}`;
            Linking.openURL(url).catch(() => alert('Could not open SMS application.'));
          }}
        ]
      );
    } catch (e) {
      console.error(e);
      alert('Failed to generate slots.');
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
            onPress={() => { setActiveAppointment(item); setStatusMenuVisible(true); }}
          >
            <Text style={[styles.statusText, textStyle]}>{item.status}  ▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardFooter}>
          {item.status === 'Completed' && (
            item.paymentStatus === 'Paid' ? (
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
          
          {item.patientPhone ? (
            <TouchableOpacity style={styles.actionIcon} onPress={() => handleSendReminder(item)}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            </TouchableOpacity>
          ) : null}
          
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleDelete(item)}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Ionicons name="calendar-outline" size={20} color="#374151" />
          <Text style={styles.listTitle}>{new Date(selectedDate).toDateString()}</Text>
        </View>
        <TouchableOpacity style={styles.shareSlotsBtn} onPress={handleShareAvailability}>
          <Ionicons name="share-social-outline" size={16} color="white" />
          <Text style={styles.shareSlotsBtnText}>Share Slots</Text>
        </TouchableOpacity>
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
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 40 }}>
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

            {!editingId && (
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.label}>Repeat Visit</Text>
                <View style={styles.repeatToggleContainer}>
                  <TouchableOpacity 
                    style={[styles.repeatToggle, repeatType === 'None' && styles.repeatToggleSelected]}
                    onPress={() => setRepeatType('None')}
                  >
                    <Text style={[styles.repeatToggleText, repeatType === 'None' && styles.repeatToggleTextSelected]}>None</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.repeatToggle, repeatType === 'Daily' && styles.repeatToggleSelected]}
                    onPress={() => setRepeatType('Daily')}
                  >
                    <Text style={[styles.repeatToggleText, repeatType === 'Daily' && styles.repeatToggleTextSelected]}>Daily</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.repeatToggle, repeatType === 'Weekly' && styles.repeatToggleSelected]}
                    onPress={() => setRepeatType('Weekly')}
                  >
                    <Text style={[styles.repeatToggleText, repeatType === 'Weekly' && styles.repeatToggleTextSelected]}>Weekly</Text>
                  </TouchableOpacity>
                </View>

                {repeatType !== 'None' && (
                  <View style={{ marginTop: 15 }}>
                    <Text style={styles.label}>Number of Sessions (1-50)</Text>
                    <TextInput 
                      style={styles.input} 
                      keyboardType="numeric" 
                      value={occurrences} 
                      onChangeText={setOccurrences} 
                      placeholder="e.g. 10"
                    />
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveAppointment}>
              <Text style={styles.saveButtonText}>Save Visit</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Custom Status ActionSheet Modal */}
      <Modal visible={statusMenuVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.menuBox}>
            <Text style={styles.menuTitle}>Manage Visit Lifecycle</Text>

            {activeAppointment?.status === 'Scheduled' && (
              <>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeCompleted]} onPress={() => handleStatusChange('Completed')}>
                  <Text style={[styles.menuBtnText, styles.textCompleted]}>Mark Completed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeMissed]} onPress={() => handleStatusChange('Missed')}>
                  <Text style={[styles.menuBtnText, styles.textMissed]}>Mark Missed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeCancelled]} onPress={() => handleStatusChange('Cancelled')}>
                  <Text style={[styles.menuBtnText, styles.textCancelled]}>Cancel Visit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Reschedule Visit</Text>
                </TouchableOpacity>
              </>
            )}

            {activeAppointment?.status === 'Completed' && (
              <>
                <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#047857', fontWeight: 'bold', fontSize: 16 }}>Completed Visit (Locked)</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 4 }}>Completed visits are locked to preserve medical and payment logs.</Text>
                </View>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled, { marginTop: 10 }]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Schedule Follow-Up Visit</Text>
                </TouchableOpacity>
              </>
            )}

            {activeAppointment?.status === 'Missed' && (
              <>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Reschedule Visit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeCompleted]} onPress={() => handleStatusChange('Completed')}>
                  <Text style={[styles.menuBtnText, styles.textCompleted]}>Mark Completed (Correction)</Text>
                </TouchableOpacity>
              </>
            )}

            {activeAppointment?.status === 'Cancelled' && (
              <>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Reschedule Visit</Text>
                </TouchableOpacity>
              </>
            )}

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
  listHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 8, justifyContent: 'space-between' },
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
  menuCancelText: { color: '#6B7280', fontSize: 16, fontWeight: '600' },
  repeatToggleContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  repeatToggle: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: 'white' },
  repeatToggleSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  repeatToggleText: { fontSize: 15, fontWeight: '600', color: '#4B5563' },
  repeatToggleTextSelected: { color: 'white', fontWeight: 'bold' },
  input: { backgroundColor: 'white', padding: 16, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  shareSlotsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F46E5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 },
  shareSlotsBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 }
});
