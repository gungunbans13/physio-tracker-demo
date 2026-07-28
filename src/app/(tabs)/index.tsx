import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database';

export default function TodayScreen() {
  const db = getDb();
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [currency, setCurrency] = useState('₹');
  const [timezone, setTimezone] = useState('IST');
  const [apptReminder, setApptReminder] = useState('60');
  const [payReminder, setPayReminder] = useState('7');
  const [conflictBuffer, setConflictBuffer] = useState('60');
  
  // Doctor Profile state
  const [doctorName, setDoctorName] = useState('Dr. Smith');
  const [clinicName, setClinicName] = useState('Physio Clinic');
  const [specialization, setSpecialization] = useState('Physiotherapist');

  // Work Schedule state
  const [workingHourStart, setWorkingHourStart] = useState('10');
  const [workingHourEnd, setWorkingHourEnd] = useState('18');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  
  const [settingsVisible, setSettingsVisible] = useState(false);

  const loadData = () => {
    try {
      // Load Settings
      const settingsRows = db.getAllSync<{key: string, value: string}>('SELECT * FROM Settings');
      const settingsMap: Record<string, string> = {};
      settingsRows.forEach(row => settingsMap[row.key] = row.value);
      
      if (settingsMap['currency']) setCurrency(settingsMap['currency']);
      if (settingsMap['timezone']) setTimezone(settingsMap['timezone']);
      if (settingsMap['appointmentReminderMinutes']) setApptReminder(settingsMap['appointmentReminderMinutes']);
      if (settingsMap['paymentReminderDays']) setPayReminder(settingsMap['paymentReminderDays']);
      if (settingsMap['timeConflictBufferMinutes']) setConflictBuffer(settingsMap['timeConflictBufferMinutes']);
      if (settingsMap['doctorName']) setDoctorName(settingsMap['doctorName']);
      if (settingsMap['clinicName']) setClinicName(settingsMap['clinicName']);
      if (settingsMap['specialization']) setSpecialization(settingsMap['specialization']);
      if (settingsMap['workingHourStart']) setWorkingHourStart(settingsMap['workingHourStart']);
      if (settingsMap['workingHourEnd']) setWorkingHourEnd(settingsMap['workingHourEnd']);
      if (settingsMap['workingDays']) {
        setWorkingDays(settingsMap['workingDays'].split(',').map(Number));
      }
      
      // Load Stats
      const today = new Date().toISOString().split('T')[0];
      const apps = db.getAllSync<any>('SELECT COUNT(*) as cnt FROM Appointments WHERE date LIKE ?', [`${today}%`]);
      if (apps && apps.length > 0) setAppointmentsCount(apps[0].cnt);

      const pays = db.getAllSync<any>("SELECT SUM(amount) as total FROM Payments WHERE status = 'Pending'");
      if (pays && pays.length > 0 && pays[0].total) setPendingPayments(pays[0].total);
      else setPendingPayments(0);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveSettings = () => {
    try {
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', currency, 'currency');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', timezone, 'timezone');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', apptReminder, 'appointmentReminderMinutes');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', payReminder, 'paymentReminderDays');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', conflictBuffer, 'timeConflictBufferMinutes');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', doctorName, 'doctorName');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', clinicName, 'clinicName');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', specialization, 'specialization');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', workingHourStart, 'workingHourStart');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', workingHourEnd, 'workingHourEnd');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', workingDays.join(','), 'workingDays');
      setSettingsVisible(false);
      loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to save settings');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Welcome, {doctorName}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 2 }}>{clinicName}</Text>
          </View>
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Ionicons name="settings-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>
        <Text style={styles.date}>{new Date().toDateString()}</Text>
      </View>

      <View style={styles.statsContainer}>
        <TouchableOpacity style={[styles.statCard, styles.statCardToday]} onPress={() => router.push('/calendar')}>
          <Ionicons name="calendar" size={32} color="#4F46E5" />
          <Text style={[styles.statValue, styles.statValueToday]}>{appointmentsCount}</Text>
          <Text style={styles.statLabel}>Visits Today</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.statCard, styles.statCardDues]} onPress={() => router.push('/billing')}>
          <Ionicons name="card" size={32} color="#EF4444" />
          <Text style={[styles.statValue, styles.statValueDues]}>{currency}{pendingPayments.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Pending Dues</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.tipContainer}>
        <Ionicons name="bulb-outline" size={24} color="#F59E0B" style={{marginBottom: 10}}/>
        <Text style={styles.tipText}>Use the Calendar tab to schedule your home visits, and the Billing tab to track patient payments.</Text>
      </View>

      {/* Settings Modal */}
      <Modal visible={settingsVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Global Settings</Text>
            <TouchableOpacity onPress={() => setSettingsVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 60 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4F46E5', marginBottom: 16 }}>Doctor Profile</Text>
            
            <Text style={styles.label}>Doctor Name</Text>
            <TextInput style={styles.input} value={doctorName} onChangeText={setDoctorName} placeholder="e.g. Dr. Jane Smith" />

            <Text style={styles.label}>Clinic Name</Text>
            <TextInput style={styles.input} value={clinicName} onChangeText={setClinicName} placeholder="e.g. Hope Physiotherapy" />

            <Text style={styles.label}>Specialization</Text>
            <TextInput style={styles.input} value={specialization} onChangeText={setSpecialization} placeholder="e.g. Cardiorespiratory Physio" />

            <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4F46E5', marginBottom: 16 }}>Work Schedule</Text>

            <Text style={styles.label}>Working Hour Start (24hr, e.g. 10 for 10 AM)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={workingHourStart} onChangeText={setWorkingHourStart} />

            <Text style={styles.label}>Working Hour End (24hr, e.g. 18 for 6 PM)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={workingHourEnd} onChangeText={setWorkingHourEnd} />

            <Text style={styles.label}>Working Days</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'S', value: 0 },
                { label: 'M', value: 1 },
                { label: 'T', value: 2 },
                { label: 'W', value: 3 },
                { label: 'T', value: 4 },
                { label: 'F', value: 5 },
                { label: 'S', value: 6 },
              ].map((day) => {
                const isSelected = workingDays.includes(day.value);
                return (
                  <TouchableOpacity
                    key={day.value}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: isSelected ? '#4F46E5' : '#E5E7EB',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      if (workingDays.includes(day.value)) {
                        setWorkingDays(workingDays.filter((d) => d !== day.value));
                      } else {
                        setWorkingDays([...workingDays, day.value].sort());
                      }
                    }}
                  >
                    <Text style={{ color: isSelected ? 'white' : '#4B5563', fontWeight: 'bold' }}>{day.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4F46E5', marginBottom: 16 }}>App Settings</Text>

            <Text style={styles.label}>Currency Symbol</Text>
            <TextInput style={styles.input} value={currency} onChangeText={setCurrency} />

            <Text style={styles.label}>Timezone</Text>
            <TextInput style={styles.input} value={timezone} onChangeText={setTimezone} />

            <Text style={styles.label}>Default Appointment Reminder (Minutes before)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={apptReminder} onChangeText={setApptReminder} />

            <Text style={styles.label}>Default Payment Reminder (Days after)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={payReminder} onChangeText={setPayReminder} />

            <Text style={styles.label}>Time Conflict Buffer (Minutes)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={conflictBuffer} onChangeText={setConflictBuffer} />
            
            <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { padding: 24, backgroundColor: '#111827', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  date: { fontSize: 16, color: '#9CA3AF', marginTop: 4 },
  statsContainer: { flexDirection: 'row', padding: 16, gap: 16, marginTop: -20 },
  statCard: { flex: 1, padding: 20, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4, borderWidth: 1 },
  statCardToday: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', shadowColor: '#4F46E5' },
  statCardDues: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2', shadowColor: '#EF4444' },
  statValue: { fontSize: 28, fontWeight: 'bold', marginTop: 12 },
  statValueToday: { color: '#1E1B4B' },
  statValueDues: { color: '#7F1D1D' },
  statLabel: { fontSize: 14, color: '#4B5563', marginTop: 4, fontWeight: '600' },
  tipContainer: { margin: 16, padding: 20, backgroundColor: '#FEF3C7', borderRadius: 16 },
  tipText: { fontSize: 15, color: '#92400E', lineHeight: 22 },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB', paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  form: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: 'white', padding: 16, borderRadius: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  saveButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});
