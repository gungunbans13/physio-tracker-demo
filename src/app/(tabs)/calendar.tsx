import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, Platform, ScrollView, TextInput, Linking, Image } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
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
  notificationId?: string;
  imageUri?: string;
  notes?: string;
  deliveryAddress?: string;
};

type Patient = {
  id: number;
  name: string;
};

function SafeImage({ uri, style }: { uri: string | null | undefined; style: any }) {
  const [error, setError] = useState(false);

  if (error || !uri) {
    return (
      <View style={[style, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="image-outline" size={20} color="#9CA3AF" />
      </View>
    );
  }

  return (
    <Image 
      source={{ uri }} 
      style={style} 
      onError={() => setError(true)} 
    />
  );
}

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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [price, setPrice] = useState('');
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [lightboxImageUri, setLightboxImageUri] = useState<string | null>(null);

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
      
      const menuRows = db.getAllSync<any>('SELECT * FROM Menu ORDER BY name ASC');
      setMenuItems(menuRows);
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
    setImageUri(null);
    setNotes('');
    setDeliveryAddress('');
    setPrice('');
    
    const defaultDate = new Date(selectedDate);
    const now = new Date();
    defaultDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
    setAppointmentTime(defaultDate);
    
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
    setImageUri(item.imageUri || null);
    setNotes(item.notes || '');
    setDeliveryAddress(item.deliveryAddress || '');

    try {
      const payRow = db.getFirstSync<{amount: number}>('SELECT amount FROM Payments WHERE appointmentId = ? LIMIT 1', [item.id]);
      setPrice(payRow ? payRow.amount.toString() : '');
    } catch (e) {
      setPrice('');
    }

    setModalVisible(true);
  };

  const handleDelete = (appt: Appointment) => {
    let warningTitle = 'Delete Delivery';
    let warningMessage = 'Are you sure you want to delete this delivery?';

    if (appt.status === 'Completed') {
      try {
        const payment = db.getFirstSync<{status: string, amount: number}>(
          'SELECT status, amount FROM Payments WHERE appointmentId = ?',
          [appt.id]
        );
        if (payment) {
          if (payment.status === 'Paid') {
            warningTitle = '⚠️ Delete Completed & Paid Delivery';
            warningMessage = `This delivery is Completed and Paid (amount: ₹${payment.amount.toFixed(2)}). Deleting it will also remove this payment from your earnings report.\n\nAre you sure you want to proceed?`;
          } else if (payment.status === 'Pending') {
            warningTitle = '⚠️ Delete Completed & Unpaid Delivery';
            warningMessage = `This delivery is Completed with an outstanding Pending Due of ₹${payment.amount.toFixed(2)}. Deleting this order will permanently delete the billing record and cancel the pending due.\n\nAre you sure you want to proceed?`;
          }
        } else {
          warningTitle = 'Delete Completed Delivery';
          warningMessage = 'This delivery has been marked as Completed. Deleting it will permanently remove the record. Are you sure you want to proceed?';
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (appt.seriesId) {
      Alert.alert(
        appt.status === 'Completed' ? warningTitle : 'Delete Recurring Delivery',
        appt.status === 'Completed' ? warningMessage : 'This delivery is part of a recurring order series. How would you like to delete it?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Only This Delivery', style: 'destructive', onPress: () => deleteSingle(appt.id) },
          { text: 'This & All Future', style: 'destructive', onPress: () => deleteFuture(appt) }
        ]
      );
    } else {
      Alert.alert(warningTitle, warningMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSingle(appt.id) }
      ]);
    }
  };

  const deleteSingle = async (id: number) => {
    try {
      await cancelAppointmentNotification(id);
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
        db.withTransactionSync(async () => {
          for (const fid of ids) {
            await cancelAppointmentNotification(fid);
          }
          db.runSync(`DELETE FROM Payments WHERE appointmentId IN (${ids.join(',')})`);
          db.runSync(`DELETE FROM Appointments WHERE id IN (${ids.join(',')})`);
        });
      }
      loadData(selectedDate);
    } catch (e) {
      console.error(e);
    }
  };

  const cancelAppointmentNotification = async (apptId: number) => {
    try {
      const row = db.getFirstSync<{notificationId: string}>(
        'SELECT notificationId FROM Appointments WHERE id = ?',
        [apptId]
      );
      if (row && row.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(row.notificationId);
        db.runSync('UPDATE Appointments SET notificationId = NULL WHERE id = ?', apptId);
      }
    } catch (e) {
      console.error('Failed to cancel notification:', e);
    }
  };

  const scheduleAppointmentNotification = async (apptId: number) => {
    try {
      const row = db.getFirstSync<{date: string, patientId: number, status: string, notificationId: string}>(
        'SELECT date, patientId, status, notificationId FROM Appointments WHERE id = ?',
        [apptId]
      );
      if (!row) return;

      if (row.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(row.notificationId);
        db.runSync('UPDATE Appointments SET notificationId = NULL WHERE id = ?', apptId);
      }

      if (row.status !== 'Scheduled') return;

      const settingRow = db.getFirstSync<{value: string}>(
        "SELECT value FROM Settings WHERE key = 'appointmentReminderMinutes'"
      );
      const reminderMin = parseInt(settingRow ? settingRow.value : '60');

      const apptTime = new Date(row.date).getTime();
      const triggerTime = apptTime - reminderMin * 60 * 1000;

      if (triggerTime > Date.now()) {
        const patientRow = db.getFirstSync<{name: string}>('SELECT name FROM Patients WHERE id = ?', [row.patientId]);
        const patientName = patientRow ? patientRow.name : 'Customer';
        const timeStr = new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Upcoming Cake Delivery 🎂',
            body: `Reminder: Order delivery for ${patientName} is scheduled at ${timeStr}.`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(triggerTime),
          },
        });

        db.runSync('UPDATE Appointments SET notificationId = ? WHERE id = ?', identifier, apptId);
      }
    } catch (e) {
      console.error('Failed to schedule notification:', e);
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

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: appointmentTime,
        mode: 'date',
        onChange: (event, date) => {
          if (date) {
            const newDate = new Date(appointmentTime);
            newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            setAppointmentTime(newDate);
          }
        },
      });
    }
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "This app needs photo library access to pick custom designs.");
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        const fileUri = selectedAsset.uri;

        // Strict format verification using MIME type (JPEG/PNG only)
        if (selectedAsset.mimeType) {
          const isJpgOrPng = selectedAsset.mimeType === 'image/jpeg' || 
                             selectedAsset.mimeType === 'image/jpg' || 
                             selectedAsset.mimeType === 'image/png';
          if (!isJpgOrPng) {
            Alert.alert("Invalid Format", "Only static JPG, JPEG, and PNG images are supported.");
            return;
          }
        }

        // File size guard using asset metadata size if available (under 5MB)
        if (selectedAsset.fileSize && selectedAsset.fileSize > 5 * 1024 * 1024) {
          Alert.alert("File Too Large", "Selected image is larger than 5MB. Please choose a smaller photo.");
          return;
        }

        setImageUri(fileUri);
      }
    } catch (e) {
      console.error("Error picking reference design:", e);
      Alert.alert("Error", "Could not import the selected image.");
    }
  };

  const handleSaveAppointment = () => {
    if (!selectedPatientId) return alert('Please select a customer.');
    
    const dt = new Date(appointmentTime);
    const dateString = dt.toISOString();

    // Prevent backdating for ALL deliveries (both new and edited) with a 5-minute grace window
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5);
    if (dt < now) {
      return alert('Cannot schedule or reschedule a delivery in the past.');
    }

    // Fetch time conflict buffer from Settings
    let bufferMin = 60;
    try {
      const sRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'timeConflictBufferMinutes'");
      if (sRow) bufferMin = parseInt(sRow.value);
    } catch(e) {}

    const performSave = (allFuture: boolean) => {
      try {
        const savePaymentPrice = (apptId: number, targetPatientId: number, dateStr: string) => {
          const finalPrice = price ? Number(price) : 0;
          const existing = db.getFirstSync<{id: number}>('SELECT id FROM Payments WHERE appointmentId = ? LIMIT 1', [apptId]);
          if (existing) {
            db.runSync('UPDATE Payments SET patientId = ?, amount = ?, date = ? WHERE id = ?', targetPatientId, finalPrice, dateStr, existing.id);
          } else {
            db.runSync('INSERT INTO Payments (patientId, appointmentId, amount, date, status) VALUES (?, ?, ?, ?, ?)', targetPatientId, apptId, finalPrice, dateStr, 'Pending');
          }
        };

        if (editingId) {
          if (!allFuture) {
            // Check conflicts for this single appointment
            if (checkSingleConflict(dt, editingId, bufferMin)) return;
            db.runSync('UPDATE Appointments SET patientId = ?, date = ?, status = ?, imageUri = ?, notes = ?, deliveryAddress = ? WHERE id = ?', selectedPatientId, dateString, 'Scheduled', imageUri, notes.trim() || null, deliveryAddress.trim() || null, editingId);
            savePaymentPrice(editingId, selectedPatientId, dateString.split('T')[0]);
            scheduleAppointmentNotification(editingId);
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
                  const instDateString = futDate.toISOString();
                  db.runSync(
                    'UPDATE Appointments SET patientId = ?, date = ?, status = ?, imageUri = ?, notes = ?, deliveryAddress = ? WHERE id = ?',
                    selectedPatientId, instDateString, 'Scheduled', imageUri, notes.trim() || null, deliveryAddress.trim() || null, fut.id
                  );
                  savePaymentPrice(fut.id, selectedPatientId, instDateString.split('T')[0]);
                }
              });

              for (const fut of futureAppts) {
                scheduleAppointmentNotification(fut.id);
              }
            } else {
              if (checkSingleConflict(dt, editingId, bufferMin)) return;
              db.runSync('UPDATE Appointments SET patientId = ?, date = ?, status = ?, imageUri = ?, notes = ?, deliveryAddress = ? WHERE id = ?', selectedPatientId, dateString, 'Scheduled', imageUri, notes.trim() || null, deliveryAddress.trim() || null, editingId);
              savePaymentPrice(editingId, selectedPatientId, dateString.split('T')[0]);
              scheduleAppointmentNotification(editingId);
            }
          }
        } else {
          // Creating new appointments (check recurring status)
          if (repeatType === 'None') {
            if (checkSingleConflict(dt, null, bufferMin)) return;
            db.runSync('INSERT INTO Appointments (patientId, date, status, imageUri, notes, deliveryAddress) VALUES (?, ?, ?, ?, ?, ?)', selectedPatientId, dateString, 'Scheduled', imageUri, notes.trim() || null, deliveryAddress.trim() || null);
            const ins = db.getFirstSync<{id: number}>('SELECT last_insert_rowid() as id');
            if (ins) {
              savePaymentPrice(ins.id, selectedPatientId, dateString.split('T')[0]);
              scheduleAppointmentNotification(ins.id);
            }
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
                  'INSERT INTO Appointments (patientId, date, status, seriesId, imageUri, notes, deliveryAddress) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  selectedPatientId, timeInst.toISOString(), 'Scheduled', seriesId, imageUri, notes.trim() || null, deliveryAddress.trim() || null
                );
                const ins = db.getFirstSync<{id: number}>('SELECT last_insert_rowid() as id');
                if (ins) {
                  const finalPrice = price ? Number(price) : 0;
                  db.runSync('INSERT INTO Payments (patientId, appointmentId, amount, date, status) VALUES (?, ?, ?, ?, ?)', selectedPatientId, ins.id, finalPrice, timeInst.toISOString().split('T')[0], 'Pending');
                }
              }
            });

            const created = db.getAllSync<{id: number}>('SELECT id FROM Appointments WHERE seriesId = ?', [seriesId]);
            for (const c of created) {
              scheduleAppointmentNotification(c.id);
            }
          }
        }
        setModalVisible(false);
        loadData(selectedDate);
      } catch (e) {
        console.error(e);
        alert('Error saving delivery');
      }
    };

    if (editingId && editingSeriesId) {
      Alert.alert(
        'Edit Recurring Delivery',
        'This delivery is part of a recurring order series. Do you want to update only this delivery, or this and all future deliveries in the series?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Only This Delivery', onPress: () => performSave(false) },
          { text: 'This & Future Deliveries', onPress: () => performSave(true) }
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
          alert(`Time conflict: A delivery for "${other.patientName}" is already scheduled within ${bufferMin} minutes of ${targetDt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} on ${instDateStr}.`);
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
      alert('Completed deliveries cannot be reverted or cancelled. If this delivery was logged in error, please delete the record.');
      setStatusMenuVisible(false);
      return;
    }

    if (activeAppointment.status === 'Cancelled') {
      alert('Cancelled deliveries cannot be directly activated. Please use the Reschedule option to pick a new date and time.');
      setStatusMenuVisible(false);
      return;
    }

    if (nextStatus === 'Completed' && now < apptTime) {
      alert('Cannot mark delivery as Completed before its scheduled date and time.');
      setStatusMenuVisible(false);
      return;
    }
    
    if (nextStatus === 'Missed' && now <= apptEndTime) {
      alert('Cannot mark delivery as Missed before the scheduled delivery end time.');
      setStatusMenuVisible(false);
      return;
    }

    if (nextStatus === 'Cancelled' && now >= apptTime) {
      alert('Cannot cancel a delivery whose start time has already passed.');
      setStatusMenuVisible(false);
      return;
    }

    try {
      db.runSync('UPDATE Appointments SET status = ? WHERE id = ?', nextStatus, activeAppointment.id);
      
      if (nextStatus === 'Scheduled') {
        scheduleAppointmentNotification(activeAppointment.id);
      } else {
        cancelAppointmentNotification(activeAppointment.id);
      }
      
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
    setImageUri(activeAppointment.imageUri || null);
    setNotes(activeAppointment.notes || '');
    setDeliveryAddress(activeAppointment.deliveryAddress || '');

    try {
      const payRow = db.getFirstSync<{amount: number}>('SELECT amount FROM Payments WHERE appointmentId = ? LIMIT 1', [activeAppointment.id]);
      setPrice(payRow ? payRow.amount.toString() : '');
    } catch (e) {
      setPrice('');
    }

    setModalVisible(true);
  };

  const handleFollowUpFromMenu = () => {
    if (!activeAppointment) return;
    setStatusMenuVisible(false);
    
    setEditingId(null); // Creation mode
    setSelectedPatientId(activeAppointment.patientId); // Pre-fill patient
    
    // Default follow-up date to tomorrow at the same time
    const nextDate = new Date(activeAppointment.date);
    nextDate.setDate(nextDate.getDate() + 1);
    setAppointmentTime(nextDate);
    
    setEditingSeriesId(null);
    setRepeatType('None');
    setOccurrences('1');
    setImageUri(activeAppointment.imageUri || null);
    setNotes(activeAppointment.notes || '');
    setDeliveryAddress(activeAppointment.deliveryAddress || '');

    try {
      const payRow = db.getFirstSync<{amount: number}>('SELECT amount FROM Payments WHERE appointmentId = ? LIMIT 1', [activeAppointment.id]);
      setPrice(payRow ? payRow.amount.toString() : '');
    } catch (e) {
      setPrice('');
    }

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

    const whatsappMsg = `Hello *${appt.patientName}*, this is a reminder for your bakery order delivery scheduled for *${dateStr}* at *${timeStr}*. Please let us know if there are any changes. Thanks!`;
    const smsMsg = `Hello ${appt.patientName}, this is a reminder for your bakery order delivery scheduled for ${dateStr} at ${timeStr}. Thanks!`;

    Alert.alert(
      'Send Delivery Reminder',
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

      let textMessage = `Hello! Here are my available cake delivery slots for the upcoming week:\n\n`;
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
        'Share Available Delivery Slots',
        'Send your upcoming free slots to your customers.',
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
          {item.imageUri ? (
            <TouchableOpacity onPress={() => setLightboxImageUri(item.imageUri)}>
              <SafeImage 
                uri={item.imageUri} 
                style={{ width: 54, height: 54, borderRadius: 8, marginRight: 12, borderWidth: 1, borderColor: '#FECDD3' }} 
              />
            </TouchableOpacity>
          ) : null}
          <View style={styles.cardInfo}>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color="#EC4899" />
              <Text style={styles.timeText}>{time}</Text>
            </View>
            <View style={styles.timeRow}>
              <Ionicons name="person-outline" size={16} color="#795548" />
              <Text style={styles.patientName}>{item.patientName}</Text>
            </View>
            {item.notes ? (
              <View style={[styles.timeRow, { marginTop: 4 }]}>
                <Ionicons name="basket-outline" size={16} color="#EC4899" />
                <Text style={{ fontSize: 14, color: '#3E2723', flex: 1, fontWeight: '500' }}>{item.notes}</Text>
              </View>
            ) : null}
            {item.deliveryAddress ? (
              <View style={[styles.timeRow, { marginTop: 4 }]}>
                <Ionicons name="location-outline" size={16} color="#795548" />
                <Text style={{ fontSize: 13, color: '#795548', flex: 1 }}>{item.deliveryAddress}</Text>
              </View>
            ) : null}
          </View>
          
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <TouchableOpacity 
              style={[styles.statusBadge, badgeStyle]}
              onPress={() => { setActiveAppointment(item); setStatusMenuVisible(true); }}
            >
              <Text style={[styles.statusText, textStyle]}>{item.status}  ▼</Text>
            </TouchableOpacity>
          </View>
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

  const getMarkedDates = () => {
    const marks: Record<string, any> = {};
    try {
      const year = new Date(selectedDate).getFullYear();
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day === 0 || day === 6) { // 0 = Sunday, 6 = Saturday
          const dateKey = d.toISOString().split('T')[0];
          marks[dateKey] = {
            customStyles: {
              text: { color: day === 0 ? '#EF4444' : '#D97706', fontWeight: 'bold' }
            }
          };
        }
      }
    } catch (e) {}

    marks[selectedDate] = {
      ...marks[selectedDate],
      selected: true,
      selectedColor: '#EC4899',
      customStyles: {
        container: { backgroundColor: '#EC4899', borderRadius: 20 },
        text: { color: 'white', fontWeight: 'bold' }
      }
    };
    return marks;
  };

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={getMarkedDates()}
        markingType={'custom'}
        theme={{ todayTextColor: '#EC4899', arrowColor: '#EC4899', textDayFontWeight: '500', textMonthFontWeight: 'bold' }}
      />
      
      <View style={styles.listHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Ionicons name="calendar-outline" size={20} color="#5D4037" />
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
            <Text style={styles.emptyText}>No deliveries scheduled today.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleOpenNew}>
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      {/* Appointment Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Delivery' : 'New Delivery'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.label}>Select Customer</Text>
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
            
            {menuItems.length > 0 && (
              <>
                <Text style={styles.label}>Select Product from Menu (Auto-Fills Details & Price)</Text>
                <FlatList 
                  data={menuItems}
                  keyExtractor={item => item.id.toString()}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ maxHeight: 60, marginBottom: 20 }}
                  renderItem={({item}) => (
                    <TouchableOpacity 
                      style={{
                        backgroundColor: '#FFF5F5',
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 20,
                        marginRight: 10,
                        alignSelf: 'flex-start',
                        borderWidth: 1,
                        borderColor: '#FECDD3',
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        const qtyText = item.quantity ? ` (${item.quantity})` : '';
                        setNotes(`${item.name}${qtyText}`);
                        setPrice(item.price.toString());
                      }}
                    >
                      <Text style={{ color: '#EC4899', fontWeight: 'bold', fontSize: 13 }}>
                        {item.name}{item.quantity ? ` (${item.quantity})` : ''} (₹{item.price})
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}

            <Text style={styles.label}>Order Details *</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="e.g. Chocolate Cake"
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

            <Text style={styles.label}>Select Date</Text>
            <TouchableOpacity style={[styles.timeSelector, { marginBottom: 20 }]} onPress={openDatePicker}>
              <Ionicons name="calendar" size={24} color="#EC4899" />
              <Text style={styles.timeSelectorText}>
                {appointmentTime.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Select Time</Text>
            <TouchableOpacity style={styles.timeSelector} onPress={openTimePicker}>
              <Ionicons name="time" size={24} color="#EC4899" />
              <Text style={styles.timeSelectorText}>{appointmentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </TouchableOpacity>

            {!editingId && (
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.label}>Repeat Order</Text>
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

            <Text style={styles.label}>Design Reference Image (Optional)</Text>
            {imageUri ? (
              <View style={{ marginBottom: 20, position: 'relative', width: '100%', height: 160, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
                <SafeImage uri={imageUri} style={{ width: '100%', height: '100%' }} />
                <TouchableOpacity 
                  style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0, 0, 0, 0.6)', padding: 6, borderRadius: 20 }}
                  onPress={() => setImageUri(null)}
                >
                  <Ionicons name="close" size={18} color="white" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'white',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderStyle: 'dashed',
                  padding: 16,
                  borderRadius: 12,
                  marginBottom: 20,
                  gap: 8
                }}
                onPress={handlePickImage}
              >
                <Ionicons name="image-outline" size={20} color="#EC4899" />
                <Text style={{ color: '#EC4899', fontWeight: 'bold', fontSize: 14 }}>Add Design Photo (JPG/PNG)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveAppointment}>
              <Text style={styles.saveButtonText}>Save Delivery</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Custom Status ActionSheet Modal */}
      <Modal visible={statusMenuVisible} transparent animationType="fade" onRequestClose={() => setStatusMenuVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.menuBox}>
            <Text style={styles.menuTitle}>Manage Delivery Status</Text>

            {activeAppointment?.status === 'Scheduled' && (
              <>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeCompleted]} onPress={() => handleStatusChange('Completed')}>
                  <Text style={[styles.menuBtnText, styles.textCompleted]}>Mark Completed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeMissed]} onPress={() => handleStatusChange('Missed')}>
                  <Text style={[styles.menuBtnText, styles.textMissed]}>Mark Missed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeCancelled]} onPress={() => handleStatusChange('Cancelled')}>
                  <Text style={[styles.menuBtnText, styles.textCancelled]}>Cancel Delivery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Reschedule Delivery</Text>
                </TouchableOpacity>
              </>
            )}

            {activeAppointment?.status === 'Completed' && (
              <>
                <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#047857', fontWeight: 'bold', fontSize: 16 }}>Completed Delivery (Locked)</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 4 }}>Completed deliveries are locked to preserve order and payment logs.</Text>
                </View>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled, { marginTop: 10 }]} onPress={handleFollowUpFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Schedule Follow-Up Delivery</Text>
                </TouchableOpacity>
              </>
            )}

            {activeAppointment?.status === 'Missed' && (
              <>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Reschedule Delivery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeCompleted]} onPress={() => handleStatusChange('Completed')}>
                  <Text style={[styles.menuBtnText, styles.textCompleted]}>Mark Completed (Correction)</Text>
                </TouchableOpacity>
              </>
            )}

            {activeAppointment?.status === 'Cancelled' && (
              <>
                <TouchableOpacity style={[styles.menuBtn, styles.badgeScheduled]} onPress={handleRescheduleFromMenu}>
                  <Text style={[styles.menuBtnText, styles.textScheduled]}>Reschedule Delivery</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.menuCancel} onPress={() => setStatusMenuVisible(false)}>
              <Text style={styles.menuCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Lightbox Preview Modal */}
      <Modal visible={lightboxImageUri !== null} transparent animationType="fade" onRequestClose={() => setLightboxImageUri(null)}>
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setLightboxImageUri(null)}>
            <Ionicons name="close-circle" size={42} color="white" />
          </TouchableOpacity>
          {lightboxImageUri && (
            <SafeImage 
              uri={lightboxImageUri} 
              style={styles.lightboxImage} 
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDFB' },
  listHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 8, justifyContent: 'space-between' },
  listTitle: { fontSize: 18, fontWeight: '700', color: '#3E2723' },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 18, fontWeight: '800', color: '#3E2723' },
  patientName: { fontSize: 15, color: '#5D4037', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: '700' },
  badgeScheduled: { backgroundColor: '#FFF1F2' }, textScheduled: { color: '#EC4899' },
  badgeCompleted: { backgroundColor: '#D1FAE5' }, textCompleted: { color: '#047857' },
  badgeMissed: { backgroundColor: '#FEF3C7' }, textMissed: { color: '#B45309' },
  badgeCancelled: { backgroundColor: '#FEE2E2' }, textCancelled: { color: '#B91C1C' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  actionIcon: { padding: 8, backgroundColor: '#FFFDFB', borderRadius: 12, marginLeft: 12 },
  collectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EC4899', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 6 },
  collectBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  paidPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 },
  paidText: { color: '#047857', fontWeight: 'bold', fontSize: 13 },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#A8A29E', fontWeight: '500' },
  fab: { position: 'absolute', right: 24, bottom: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: '#EC4899', justifyContent: 'center', alignItems: 'center', shadowColor: '#EC4899', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#FFFDFB', paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: 'white' },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#3E2723' },
  form: { padding: 24 },
  label: { fontSize: 15, fontWeight: '700', color: '#5D4037', marginBottom: 12 },
  patientPill: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, marginRight: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E5E7EB' },
  patientPillSelected: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
  patientPillText: { color: '#5D4037', fontWeight: '600' },
  patientPillTextSelected: { color: 'white', fontWeight: 'bold' },
  timeSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 40, gap: 12 },
  timeSelectorText: { fontSize: 24, color: '#3E2723', fontWeight: 'bold' },
  saveButton: { backgroundColor: '#EC4899', padding: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#EC4899', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  menuBox: { backgroundColor: 'white', width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
  menuTitle: { fontSize: 18, fontWeight: 'bold', color: '#3E2723', marginBottom: 20 },
  menuBtn: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  menuBtnText: { fontSize: 16, fontWeight: 'bold' },
  menuCancel: { marginTop: 12, padding: 16, width: '100%', alignItems: 'center' },
  menuCancelText: { color: '#795548', fontSize: 16, fontWeight: '600' },
  repeatToggleContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  repeatToggle: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: 'white' },
  repeatToggleSelected: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
  repeatToggleText: { fontSize: 15, fontWeight: '600', color: '#5D4037' },
  repeatToggleTextSelected: { color: 'white', fontWeight: 'bold' },
  input: { backgroundColor: 'white', padding: 16, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  shareSlotsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EC4899', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 },
  shareSlotsBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' },
  lightboxCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  lightboxImage: { width: '90%', height: '80%', resizeMode: 'contain' }
});
