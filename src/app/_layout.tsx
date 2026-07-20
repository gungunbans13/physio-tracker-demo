import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../database';

SplashScreen.preventAutoHideAsync();

// 3-day testing build expiration (July 20 + 3 days = July 23)
const EXPIRY_DATE = new Date('2026-07-23T23:59:59');

export default function RootLayout() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (new Date() > EXPIRY_DATE) {
      setIsExpired(true);
    }
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
