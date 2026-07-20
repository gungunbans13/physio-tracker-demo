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
  const [apptReminder, setApptReminder] = useState('1');
  const [payReminder, setPayReminder] = useState('7');
  const [conflictBuffer, setConflictBuffer] = useState('60');
  
  const [settingsVisible, setSettingsVisible] = useState(false);

  const loadData = () => {
    try {
      // Load Settings
      const settingsRows = db.getAllSync<{key: string, value: string}>('SELECT * FROM Settings');
      const settingsMap: Record<string, string> = {};
      settingsRows.forEach(row => settingsMap[row.key] = row.value);
      
      if (settingsMap['currency']) setCurrency(settingsMap['currency']);
      if (settingsMap['timezone']) setTimezone(settingsMap['timezone']);
      if (settingsMap['appointmentReminderHours']) setApptReminder(settingsMap['appointmentReminderHours']);
      if (settingsMap['paymentReminderDays']) setPayReminder(settingsMap['paymentReminderDays']);
      if (settingsMap['timeConflictBufferMinutes']) setConflictBuffer(settingsMap['timeConflictBufferMinutes']);
      
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
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', apptReminder, 'appointmentReminderHours');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', payReminder, 'paymentReminderDays');
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', conflictBuffer, 'timeConflictBufferMinutes');
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
          <Text style={styles.greeting}>Welcome, Doctor</Text>
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Ionicons name="settings-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>
        <Text style={styles.date}>{new Date().toDateString()}</Text>
      </View>

      <View style={styles.statsContainer}>
        <TouchableOpacity style={styles.statCard} onPress={() => router.push('/calendar')}>
          <Ionicons name="calendar" size={32} color="#3B82F6" />
          <Text style={styles.statValue}>{appointmentsCount}</Text>
          <Text style={styles.statLabel}>Visits Today</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statCard} onPress={() => router.push('/billing')}>
          <Ionicons name="card" size={32} color="#EF4444" />
          <Text style={styles.statValue}>{currency}{pendingPayments.toFixed(2)}</Text>
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
          
          <ScrollView style={styles.form}>
            <Text style={styles.label}>Currency Symbol</Text>
            <TextInput style={styles.input} value={currency} onChangeText={setCurrency} />

            <Text style={styles.label}>Timezone</Text>
            <TextInput style={styles.input} value={timezone} onChangeText={setTimezone} />

            <Text style={styles.label}>Default Appointment Reminder (Hours before)</Text>
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
  statCard: { flex: 1, backgroundColor: 'white', padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginTop: 12 },
  statLabel: { fontSize: 14, color: '#6B7280', marginTop: 4 },
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
