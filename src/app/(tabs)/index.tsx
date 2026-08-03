import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
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
  
  // Trial status
  const [appUnlocked, setAppUnlocked] = useState('false');
  const [licenseInput, setLicenseInput] = useState('');

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
      if (settingsMap['appUnlocked']) setAppUnlocked(settingsMap['appUnlocked']);
      
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
      
      let nextUnlocked = appUnlocked;
      if (licenseInput.trim() === 'PHYSIO2026') {
        nextUnlocked = 'true';
        setAppUnlocked('true');
        alert('Premium Version unlocked successfully!');
        setLicenseInput('');
      } else if (licenseInput.trim().length > 0) {
        alert('Invalid License Code. Please try again.');
      }
      db.runSync('UPDATE Settings SET value = ? WHERE key = ?', nextUnlocked, 'appUnlocked');

      setSettingsVisible(false);
      loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to save settings');
    }
  };

  const handleExportBackup = () => {
    Alert.alert(
      'Create App Backup',
      'This will pack all your patient files, appointments, and billing logs into a backup file.\n\nAfter clicking "Continue", please choose "Save to Files", "Google Drive", or email it to yourself.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: async () => {
          try {
            const dbDir = `${FileSystem.documentDirectory}SQLite/`;
            const dbPath = `${dbDir}physio_tracker.db`;
            
            const fileInfo = await FileSystem.getInfoAsync(dbPath);
            if (!fileInfo.exists) {
              alert('Database file not found. Please create some records first.');
              return;
            }

            if (!(await Sharing.isAvailableAsync())) {
              alert('Sharing is not available on this platform.');
              return;
            }

            // Copy to cache directory first to resolve Android private path sharing permissions
            const cachePath = `${FileSystem.cacheDirectory}physio_tracker_backup.db`;
            await FileSystem.copyAsync({
              from: dbPath,
              to: cachePath
            });

            await Sharing.shareAsync(cachePath, {
              mimeType: 'application/octet-stream',
              dialogTitle: 'Save physio_tracker.db Backup',
              UTI: 'public.data'
            });
          } catch (e) {
            console.error(e);
            alert('Failed to export backup: ' + (e instanceof Error ? e.message : String(e)));
          }
        }}
      ]
    );
  };

  const handleImportBackup = () => {
    Alert.alert(
      'Restore Patient Data',
      'WARNING: This will overwrite your current app data with the database backup file you select.\n\nAfter clicking "Continue", please select your previously saved backup file.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: '*/*',
              copyToCacheDirectory: true
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
              return;
            }

            const selectedFile = result.assets[0];
            const dbDir = `${FileSystem.documentDirectory}SQLite/`;
            const dbPath = `${dbDir}physio_tracker.db`;

            // Overwrite database file
            await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
            await FileSystem.copyAsync({
              from: selectedFile.uri,
              to: dbPath
            });

            Alert.alert(
              'Restore Successful!',
              'All your patient profiles, schedules, and payments have been loaded.\n\nPlease close the app completely and open it again to refresh your screen.',
              [{ text: 'OK', onPress: () => setSettingsVisible(false) }]
            );
          } catch (e) {
            console.error(e);
            alert('Failed to restore backup. Ensure it is a valid backup file.');
          }
        }}
      ]
    );
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
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4F46E5', marginBottom: 16 }}>License Activation</Text>
            
            <View style={{ marginBottom: 20, padding: 16, borderRadius: 12, backgroundColor: appUnlocked === 'true' ? '#D1FAE5' : '#FEF3C7', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={appUnlocked === 'true' ? 'checkmark-circle' : 'lock-closed'} size={20} color={appUnlocked === 'true' ? '#047857' : '#D97706'} />
              <Text style={{ color: appUnlocked === 'true' ? '#047857' : '#D97706', fontWeight: 'bold', fontSize: 14 }}>
                Status: {appUnlocked === 'true' ? 'Pro Version (Unlimited)' : 'Trial Version (Limit 2 patients)'}
              </Text>
            </View>

            {appUnlocked === 'false' && (
              <>
                <Text style={styles.label}>Enter License Code</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="License Key" 
                  value={licenseInput} 
                  onChangeText={setLicenseInput} 
                  autoCapitalize="characters"
                />
              </>
            )}

            <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4F46E5', marginBottom: 16 }}>Backup & Recovery</Text>
            
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', padding: 14, borderRadius: 12, gap: 8 }} 
                onPress={handleExportBackup}
              >
                <Ionicons name="cloud-upload-outline" size={20} color="#1E40AF" />
                <Text style={{ color: '#1E40AF', fontWeight: 'bold', fontSize: 14 }}>Export Backup</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB', padding: 14, borderRadius: 12, gap: 8 }} 
                onPress={handleImportBackup}
              >
                <Ionicons name="cloud-download-outline" size={20} color="#374151" />
                <Text style={{ color: '#374151', fontWeight: 'bold', fontSize: 14 }}>Import Backup</Text>
              </TouchableOpacity>
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
