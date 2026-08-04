import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../database';

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

// Calculate 3-day build expiration based on injected buildTime config (72 hours duration)
const buildTimeStr = Constants.expoConfig?.extra?.buildTime;
const EXPIRY_DATE = buildTimeStr 
  ? new Date(new Date(buildTimeStr).getTime() + 3 * 24 * 60 * 60 * 1000) 
  : new Date('2026-07-31T23:59:59'); // Fallback if buildTime is missing

export default function RootLayout() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (new Date() > EXPIRY_DATE) {
      setIsExpired(true);
    }
  }, []);

  useEffect(() => {
    const requestPermissions = async () => {
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

  if (isExpired) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="lock-closed-outline" size={80} color="#EF4444" style={{ marginBottom: 20 }} />
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: 12 }}>
          Beta Build Expired
        </Text>
        <Text style={{ fontSize: 16, color: '#9CA3AF', textAlign: 'center', lineHeight: 24 }}>
          This testing build has expired (3-day limit reached). Please contact the developer for a fresh update.
        </Text>
      </View>
    );
  }

  if (!dbInitialized) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
