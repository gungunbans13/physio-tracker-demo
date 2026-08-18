import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, ActivityIndicator, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { getDb, initDatabase } from '../database';

const NETLIFY_API_URL = 'https://physio-tracker-demo.netlify.app/.netlify/functions/parse-chat';

// Platform-guarded lazy loading for expo-share-intent to prevent web crashes
let useShareIntent: any = () => ({ hasShareIntent: false, shareIntent: {}, resetShareIntent: () => {} });
let ShareIntentProvider: any = ({ children }: any) => <>{children}</>;

if (Platform.OS !== 'web') {
  try {
    const shareIntentModule = require('expo-share-intent');
    useShareIntent = shareIntentModule.useShareIntent;
    ShareIntentProvider = shareIntentModule.ShareIntentProvider;
  } catch (e) {
    console.error('Failed to load expo-share-intent:', e);
  }
}

SplashScreen.preventAutoHideAsync();

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function AppContent() {
  const db = getDb();
  const [dbInitialized, setDbInitialized] = useState(false);

  // Share Intent state
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const [isParsing, setIsParsing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Parsed Order details form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [price, setPrice] = useState('');
  const [rawText, setRawText] = useState('');

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'web') return;
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch(e) {
        console.error("Failed to request notification permission:", e);
      }
    };
    requestPermissions();
  }, []);

  useEffect(() => {
    try {
      initDatabase();
      setDbInitialized(true);
    } catch (e) {
      console.error('Failed to initialize database', e);
    }
  }, []);

  useEffect(() => {
    if (dbInitialized) {
      SplashScreen.hideAsync();
    }
  }, [dbInitialized]);

  // Handle incoming shared text
  useEffect(() => {
    if (hasShareIntent && shareIntent?.value && Platform.OS !== 'web') {
      const text = shareIntent.value;
      setRawText(text);
      triggerChatParser(text);
    }
  }, [hasShareIntent, shareIntent]);

  const triggerChatParser = async (text: string) => {
    setIsParsing(true);
    try {
      const response = await fetch(NETLIFY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatText: text })
      });

      if (!response.ok) {
        throw new Error('Failed to reach serverless parser');
      }

      const data = await response.json();
      setCustomerName(data.customerName || '');
      setCustomerPhone(data.customerPhone || '');
      setOrderDescription(data.orderDescription || '');
      setDeliveryDate(data.deliveryDate || '');
      setPrice(data.price ? String(data.price) : '');
      
      setModalVisible(true);
    } catch (e) {
      console.error(e);
      Alert.alert(
        'Parsing Error',
        'Could not analyze chat with Gemini AI. Please fill in details manually.',
        [{ text: 'Continue', onPress: () => {
          setCustomerName('');
          setCustomerPhone('');
          setOrderDescription(text.substring(0, 100));
          setDeliveryDate(new Date().toISOString().split('T')[0]);
          setPrice('');
          setModalVisible(true);
        }}]
      );
    } finally {
      setIsParsing(false);
      resetShareIntent();
    }
  };

  const handleSaveOrder = () => {
    if (!customerName.trim()) {
      alert('Please enter a customer name.');
      return;
    }

    try {
      // 1. Insert or get Patient
      let patientId;
      const existing = db.getFirstSync('SELECT id FROM Patients WHERE name = ?', customerName.trim());
      if (existing) {
        patientId = existing.id;
      } else {
        db.runSync(
          'INSERT INTO Patients (name, phone, ailment) VALUES (?, ?, ?)',
          customerName.trim(),
          customerPhone.trim() || null,
          orderDescription.trim() || 'Bakery Order'
        );
        const fresh = db.getFirstSync('SELECT id FROM Patients WHERE name = ?', customerName.trim());
        patientId = fresh.id;
      }

      // 2. Insert Appointment/Visit
      const finalDate = deliveryDate.trim() || new Date().toISOString().split('T')[0];
      db.runSync(
        'INSERT INTO Appointments (patientId, date, status) VALUES (?, ?, ?)',
        patientId,
        finalDate + ' 12:00:00',
        'Scheduled'
      );

      const appt = db.getFirstSync(
        'SELECT id FROM Appointments WHERE patientId = ? AND date LIKE ? ORDER BY id DESC',
        patientId,
        finalDate + '%'
      );

      // 3. Insert Payment
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
        [{ text: 'OK', onPress: () => setModalVisible(false) }]
      );
    } catch (e) {
      console.error(e);
      alert('Failed to save order: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (!dbInitialized) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>

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
      <Modal visible={modalVisible} animationType="slide" presentationStyle="overFullScreen" transparent={true}>
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            maxHeight: '85%'
          }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 6 }}>
              📦 Confirm Shared WhatsApp Order
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
              AI has pre-filled the details. Please verify before saving.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Customer Name</Text>
              <TextInput
                style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 15 }}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="e.g. John Doe"
              />

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Contact Phone</Text>
              <TextInput
                style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 15 }}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
                placeholder="e.g. 9876543210"
              />

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Order Details</Text>
              <TextInput
                style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 15, minHeight: 60 }}
                value={orderDescription}
                onChangeText={setOrderDescription}
                multiline
                placeholder="e.g. Chocolate Cake 1kg"
              />

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Delivery Date</Text>
              <TextInput
                style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 15 }}
                value={deliveryDate}
                onChangeText={setDeliveryDate}
                placeholder="YYYY-MM-DD"
              />

              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Price (Rs.)</Text>
              <TextInput
                style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 10, marginBottom: 20, fontSize: 15 }}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholder="e.g. 1500"
              />

              <TouchableOpacity
                style={{ backgroundColor: '#10B981', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10 }}
                onPress={handleSaveOrder}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Confirm & Save Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ padding: 14, alignItems: 'center' }}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <AppContent />
    </ShareIntentProvider>
  );
}
