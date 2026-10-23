import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { initDatabase } from '../database';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform, Alert, Modal, View, Text, TouchableOpacity, StyleSheet, AlertButton } from 'react-native';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

type WebAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
};

export default function RootLayout() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [webAlert, setWebAlert] = useState<WebAlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
        const resolvedButtons: AlertButton[] =
          buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
        setWebAlert({
          visible: true,
          title: title || '',
          message: message || '',
          buttons: resolvedButtons,
        });
      };
    }
  }, []);

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
    } catch (e) {
      console.error('Failed to initialize database', e);
    } finally {
      setDbInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (dbInitialized) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [dbInitialized]);

  if (!dbInitialized) {
    return null;
  }

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>

      {Platform.OS === 'web' && (
        <Modal
          visible={webAlert.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setWebAlert((prev) => ({ ...prev, visible: false }))}
        >
          <View style={styles.alertOverlay}>
            <View style={styles.alertBox}>
              {!!webAlert.title && <Text style={styles.alertTitle}>{webAlert.title}</Text>}
              {!!webAlert.message && <Text style={styles.alertMessage}>{webAlert.message}</Text>}
              <View style={styles.alertButtonsContainer}>
                {webAlert.buttons.map((btn, idx) => {
                  const isDestructive = btn.style === 'destructive';
                  const isCancel = btn.style === 'cancel';
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.alertButton,
                        isDestructive
                          ? styles.alertButtonDestructive
                          : isCancel
                          ? styles.alertButtonCancel
                          : styles.alertButtonPrimary,
                      ]}
                      onPress={() => {
                        setWebAlert((prev) => ({ ...prev, visible: false }));
                        if (btn.onPress) {
                          setTimeout(() => btn.onPress?.(), 10);
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.alertButtonText,
                          isDestructive
                            ? styles.alertButtonTextDestructive
                            : isCancel
                            ? styles.alertButtonTextCancel
                            : styles.alertButtonTextPrimary,
                        ]}
                      >
                        {btn.text || 'OK'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3E2723',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 14,
    color: '#5D4037',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  alertButtonsContainer: {
    gap: 10,
  },
  alertButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertButtonPrimary: {
    backgroundColor: '#EC4899',
  },
  alertButtonDestructive: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  alertButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  alertButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  alertButtonTextPrimary: {
    color: 'white',
  },
  alertButtonTextDestructive: {
    color: '#DC2626',
  },
  alertButtonTextCancel: {
    color: '#4B5563',
  },
});
