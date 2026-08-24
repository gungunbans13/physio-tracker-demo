import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, Linking, ActivityIndicator, Platform, FlatList } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import { getDb, closeDb, initDatabase } from '../../database';
import RNRestart from 'react-native-restart';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts/legacy';

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
  
  // WhatsApp Multimodal states
  const [whatsappInput, setWhatsappInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [orderModalVisible, setOrderModalVisible] = useState(false);

  // Parsed Order details form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [price, setPrice] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Phone Contacts states
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<any[]>([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsPermission, setContactsPermission] = useState<boolean | null>(null);
  const [notificationsPermission, setNotificationsPermission] = useState<boolean | null>(null);

  // Link to Existing Patient states
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchModalVisible, setPatientSearchModalVisible] = useState(false);

  const checkNotificationsPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationsPermission(status === 'granted');
    } catch (e) {
      console.error(e);
    }
  };

  const openSettingsModal = () => {
    checkNotificationsPermission();
    setSettingsVisible(true);
  };

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

      // Load Patients for Linking
      const patients = db.getAllSync<any>('SELECT * FROM Patients ORDER BY name ASC');
      setAllPatients(patients);
      setFilteredPatients(patients);
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

  const NETLIFY_API_URL = 'https://vermillion-pithivier-e0466f.netlify.app/.netlify/functions/parse-chat';

  const handleAnalyzePayload = async (payload: { chatText?: string; chatImageBase64?: string; mimeType?: string }) => {
    setIsParsing(true);
    try {
      const response = await fetch(NETLIFY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to reach serverless parser');
      }

      const data = await response.json();
      setSelectedPatientId(null);
      setCustomerName(data.customerName || '');
      setCustomerPhone(data.customerPhone || '');
      setOrderDescription(data.orderDescription || '');
      setDeliveryDate(data.deliveryDate || '');
      setPrice(data.price ? String(data.price) : '');
      setDeliveryAddress(data.deliveryAddress || '');
      
      setOrderModalVisible(true);
    } catch (e) {
      console.error(e);
      setSelectedPatientId(null);
      Alert.alert(
        'Parsing Error',
        'Could not analyze with Gemini AI. Please fill in details manually.',
        [{ text: 'Continue', onPress: () => {
          setCustomerName('');
          setCustomerPhone('');
          setOrderDescription(payload.chatText ? payload.chatText.substring(0, 100) : 'Imported Screenshot Order');
          setDeliveryDate(new Date().toISOString().split('T')[0]);
          setPrice('');
          setDeliveryAddress('');
          setOrderModalVisible(true);
        }}]
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleTextAnalyze = () => {
    if (!whatsappInput.trim()) {
      alert('Please paste some text first.');
      return;
    }
    handleAnalyzePayload({ chatText: whatsappInput.trim() });
    setWhatsappInput('');
  };

  const handleUploadScreenshot = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Permission to access camera roll is required to upload screenshots.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        base64: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        alert('Could not read image file data.');
        return;
      }

      handleAnalyzePayload({
        chatImageBase64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg'
      });
    } catch (e) {
      console.error(e);
      alert('Failed to pick screenshot.');
    }
  };

  const handleSaveOrder = () => {
    if (!customerName.trim()) {
      alert('Please enter a customer name.');
      return;
    }

    try {
      let patientId = selectedPatientId;
      if (!patientId) {
        const existing = db.getFirstSync<{id: number}>(
          'SELECT id FROM Patients WHERE name = ? OR (phone IS NOT NULL AND phone = ? AND phone != \'\')',
          customerName.trim(),
          customerPhone.trim()
        );
        if (existing) {
          patientId = existing.id;
        } else {
          db.runSync(
            'INSERT INTO Patients (name, phone, ailment) VALUES (?, ?, ?)',
            customerName.trim(),
            customerPhone.trim() || null,
            orderDescription.trim() || 'Bakery Order'
          );
          const fresh = db.getFirstSync<{id: number}>('SELECT id FROM Patients WHERE name = ?', customerName.trim());
          patientId = fresh.id;
        }
      }

      const finalDate = deliveryDate.trim() || new Date().toISOString().split('T')[0];
      db.runSync(
        'INSERT INTO Appointments (patientId, date, status, notes, deliveryAddress) VALUES (?, ?, ?, ?, ?)',
        patientId,
        finalDate + ' 12:00:00',
        'Scheduled',
        orderDescription.trim() || null,
        deliveryAddress.trim() || null
      );

      const appt = db.getFirstSync<{id: number}>(
        'SELECT id FROM Appointments WHERE patientId = ? AND date LIKE ? ORDER BY id DESC',
        patientId,
        finalDate + '%'
      );

      const finalPrice = price ? Number(price) : 0;
      if (appt) {
        db.runSync(
          'INSERT INTO Payments (patientId, appointmentId, amount, date, status) VALUES (?, ?, ?, ?, ?)',
          patientId,
          appt.id,
          finalPrice,
          finalDate,
          'Pending'
        );
      }

      Alert.alert(
        'Success',
        'WhatsApp Order successfully imported and saved!',
        [{ text: 'OK', onPress: () => {
          setOrderModalVisible(false);
          setSelectedPatientId(null);
          setDeliveryAddress('');
          loadData();
        } }]
      );
    } catch (e) {
      console.error(e);
      alert('Failed to save order: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const checkContactsPermission = async () => {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      setContactsPermission(status === 'granted');
    } catch(e) {
      console.error(e);
    }
  };

  const handleImportContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setContactsPermission(status === 'granted');

      if (status !== 'granted') {
        Alert.alert(
          'Enable Contacts Access',
          'To import patient details, please allow Contacts access in your phone Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      setContactsSearch('');
      setContactsModalVisible(true);
      setIsLoadingContacts(true);

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        pageSize: 20,
      });

      const valid = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0);
      setDeviceContacts(valid);
      setFilteredContacts(valid);
      setIsLoadingContacts(false);
    } catch (e) {
      console.error(e);
      setIsLoadingContacts(false);
      alert('Failed to read device contacts: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const searchContactsOnDemand = async (text: string) => {
    const sanitized = text.replace(/[^a-zA-Z0-9 ]/g, '');
    setContactsSearch(sanitized);
    if (!sanitized.trim()) {
      setFilteredContacts(deviceContacts);
      return;
    }
    setIsLoadingContacts(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        name: sanitized,
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        pageSize: 50,
      });
      const valid = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0);
      setFilteredContacts(valid);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const selectContactForOrder = (contact: any) => {
    if (contact.name) {
      setCustomerName(contact.name);
    }
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      const num = contact.phoneNumbers[0].number || '';
      const digits = num.replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91')) {
        setCustomerPhone(digits.substring(2));
      } else {
        setCustomerPhone(digits);
      }
    }
    setContactsModalVisible(false);
  };

  const searchPatientsOnDemand = (text: string) => {
    setPatientSearch(text);
    if (!text.trim()) {
      setFilteredPatients(allPatients);
      return;
    }
    const query = text.toLowerCase();
    const filtered = allPatients.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.phone && p.phone.includes(query))
    );
    setFilteredPatients(filtered);
  };

  const selectPatientForOrder = (patient: any) => {
    setSelectedPatientId(patient.id);
    setCustomerName(patient.name);
    setCustomerPhone(patient.phone || '');
    setPatientSearchModalVisible(false);
  };

  const handleExportBackup = () => {
    Alert.alert(
      'Create App Backup',
      'This will pack all your patient files, appointments, and billing logs into a backup file.\n\nAfter clicking "Continue", please choose "Save to Files", "Google Drive", or email it to yourself.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: async () => {
          try {
            try {
              db.execSync('PRAGMA wal_checkpoint(FULL);');
            } catch (err) {
              console.error('Checkpoint failed:', err);
            }

            const dbFile = new File(Paths.document, 'SQLite', 'physio_tracker.db');
            if (!dbFile.exists) {
              alert('Database file not found. Please create some records first.');
              return;
            }

            if (!(await Sharing.isAvailableAsync())) {
              alert('Sharing is not available on this platform.');
              return;
            }

            // Copy to cache directory first to resolve Android private path sharing permissions
            const cacheFile = new File(Paths.cache, 'physio_tracker_backup.db');
            if (cacheFile.exists) {
              cacheFile.delete();
            }
            await dbFile.copy(cacheFile);

            await Sharing.shareAsync(cacheFile.uri, {
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
            const dbDir = new Directory(Paths.document, 'SQLite');
            if (!dbDir.exists) {
              dbDir.create({ idempotent: true });
            }

            closeDb();

            const dbFile = new File(Paths.document, 'SQLite', 'physio_tracker.db');
            if (dbFile.exists) {
              dbFile.delete();
            }

            const walFile = new File(Paths.document, 'SQLite', 'physio_tracker.db-wal');
            if (walFile.exists) {
              walFile.delete();
            }

            const shmFile = new File(Paths.document, 'SQLite', 'physio_tracker.db-shm');
            if (shmFile.exists) {
              shmFile.delete();
            }

            const pickedFile = new File(selectedFile.uri);
            await pickedFile.copy(dbFile);

            initDatabase();

            Alert.alert(
              'Restore Successful!',
              'All your patient profiles, schedules, and payments have been loaded. The app will now restart to apply changes.',
              [{ text: 'OK', onPress: () => {
                RNRestart.restart();
              }}]
            );
          } catch (e) {
            console.error(e);
            alert('Failed to restore backup: ' + (e instanceof Error ? e.message : String(e)));
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
          <TouchableOpacity onPress={openSettingsModal}>
            <Ionicons name="settings-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>
        <Text style={styles.date}>{new Date().toDateString()}</Text>
      </View>

      {/* WhatsApp Import Widget */}
      <View style={{ margin: 16, padding: 16, backgroundColor: 'white', borderRadius: 16, borderColor: '#E5E7EB', borderWidth: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 }}>
          📦 Import WhatsApp Order
        </Text>
        <TextInput
          style={{
            backgroundColor: '#F3F4F6',
            padding: 12,
            borderRadius: 10,
            fontSize: 14,
            minHeight: 50,
            textAlignVertical: 'top',
            marginBottom: 10
          }}
          value={whatsappInput}
          onChangeText={setWhatsappInput}
          placeholder="Paste WhatsApp chat transcript here..."
          multiline
          onSubmitEditing={handleTextAnalyze}
          returnKeyType="done"
          blurOnSubmit={true}
        />
        
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: '#3B82F6', padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
            onPress={handleTextAnalyze}
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Analyze Text</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: '#10B981', padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
            onPress={handleUploadScreenshot}
          >
            <Ionicons name="image-outline" size={18} color="white" />
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Upload Screenshot</Text>
          </TouchableOpacity>
        </View>
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
      <Modal visible={settingsVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSettingsVisible(false)}>
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

            {notificationsPermission === false && (
              <View style={{ backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="warning" size={20} color="#D97706" />
                  <Text style={{ fontSize: 13, color: '#B45309', fontWeight: '500', flex: 1 }}>
                    Visit reminders are disabled in your phone settings.
                  </Text>
                </View>
                <TouchableOpacity 
                  style={{ backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  onPress={() => Linking.openSettings()}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Turn On</Text>
                </TouchableOpacity>
              </View>
            )}

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
      {/* Parsing Loading Overlay */}
      {isParsing && (
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: 'white', marginTop: 16, fontSize: 16, fontWeight: '600' }}>
            Gemini AI is analyzing WhatsApp chat...
          </Text>
        </View>
      )}

      {/* Confirm Order details Modal */}
      <Modal visible={orderModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOrderModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📦 Confirm WhatsApp Order</Text>
            <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
              AI has pre-filled the details. Please verify before saving.
            </Text>

            {/* Quick Contacts Import Button */}
            <TouchableOpacity
              style={{
                backgroundColor: '#EFF6FF',
                borderColor: '#3B82F6',
                borderWidth: 1,
                padding: 14,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
                gap: 8
              }}
              onPress={handleImportContact}
            >
              <Ionicons name="people-outline" size={18} color="#3B82F6" />
              <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 14 }}>
                Quick Import from Phone Contacts
              </Text>
            </TouchableOpacity>

            {/* Link to Existing Patient Button */}
            <TouchableOpacity
              style={{
                backgroundColor: '#F0FDF4',
                borderColor: '#22C55E',
                borderWidth: 1,
                padding: 14,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                gap: 8
              }}
              onPress={() => {
                setPatientSearch('');
                setFilteredPatients(allPatients);
                setPatientSearchModalVisible(true);
              }}
            >
              <Ionicons name="link-outline" size={18} color="#22C55E" />
              <Text style={{ color: '#22C55E', fontWeight: 'bold', fontSize: 14 }}>
                Link to Existing Patient
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Customer Name</Text>
            <TextInput
              style={styles.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="e.g. John Doe"
            />

            <Text style={styles.label}>Contact Phone</Text>
            <TextInput
              style={styles.input}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 9876543210"
            />

            <Text style={styles.label}>Order Details</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={orderDescription}
              onChangeText={setOrderDescription}
              multiline
              placeholder="e.g. Chocolate Cake 1kg"
            />

            <Text style={styles.label}>Delivery Date</Text>
            <TextInput
              style={styles.input}
              value={deliveryDate}
              onChangeText={setDeliveryDate}
              placeholder="YYYY-MM-DD"
            />

            <Text style={styles.label}>Delivery Address (Optional)</Text>
            <TextInput
              style={styles.input}
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              placeholder="e.g. 123 Sector 4, Park Street"
            />

            <Text style={styles.label}>Price (Rs.)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="e.g. 1500"
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveOrder}
            >
              <Text style={styles.saveButtonText}>Confirm & Save Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 14, alignItems: 'center' }}
              onPress={() => setOrderModalVisible(false)}
            >
              <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Contact Selector Modal */}
      <Modal visible={contactsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setContactsModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Contact</Text>
            <TouchableOpacity onPress={() => setContactsModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'white',
            borderRadius: 12,
            margin: 16,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            height: 50
          }}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, fontSize: 16, color: '#111827' }}
              placeholder="Search contacts..."
              value={contactsSearch}
              onChangeText={searchContactsOnDemand}
            />
          </View>
          
          {isLoadingContacts ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#6B7280' }}>Loading contacts...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item, index) => index.toString()}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => selectContactForOrder(item)}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 16 }}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>{item.name}</Text>
                    <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>{item.phoneNumbers[0].number}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Patient Selector Modal */}
      <Modal visible={patientSearchModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPatientSearchModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Link Existing Patient</Text>
            <TouchableOpacity onPress={() => setPatientSearchModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'white',
            borderRadius: 12,
            margin: 16,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            height: 50
          }}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, fontSize: 16, color: '#111827' }}
              placeholder="Search patients by name or phone..."
              value={patientSearch}
              onChangeText={searchPatientsOnDemand}
            />
          </View>
          
          <FlatList
            data={filteredPatients}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' }}
                onPress={() => selectPatientForOrder(item)}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 16 }}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>{item.name}</Text>
                  {item.phone ? (
                    <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>{item.phone}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />
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
