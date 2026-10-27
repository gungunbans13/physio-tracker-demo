import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { initDatabase } from '../database';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
  Platform,
  Alert,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AlertButton,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

const WEB_AUTH_STORAGE_KEY = 'baker_buddy_web_auth_token';
const FALLBACK_NETLIFY_BASE = 'https://baker-buddy.netlify.app';

function getWebLoginEndpoint(): string {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${FALLBACK_NETLIFY_BASE}/.netlify/functions/web-login`;
    }
  }
  return '/.netlify/functions/web-login';
}

let webAlertListener: ((state: WebAlertState) => void) | null = null;

if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const resolvedButtons: AlertButton[] =
      buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    if (webAlertListener) {
      webAlertListener({
        visible: true,
        title: title || '',
        message: message || '',
        buttons: resolvedButtons,
      });
    } else if (typeof window !== 'undefined') {
      window.alert([title, message].filter(Boolean).join('\n\n'));
    }
  };
}

export default function RootLayout() {
  const [dbInitialized, setDbInitialized] = useState(false);

  // Web-only Authentication State (Android is always authenticated)
  const [webAuthenticated, setWebAuthenticated] = useState<boolean>(Platform.OS !== 'web');
  const [checkingWebAuth, setCheckingWebAuth] = useState<boolean>(Platform.OS === 'web');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [webAlert, setWebAlert] = useState<WebAlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      webAlertListener = setWebAlert;
      return () => {
        webAlertListener = null;
      };
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const verifyExistingSession = async () => {
      try {
        const savedToken = typeof window !== 'undefined' ? window.localStorage.getItem(WEB_AUTH_STORAGE_KEY) : null;
        if (!savedToken) {
          setCheckingWebAuth(false);
          return;
        }

        const res = await fetch(getWebLoginEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', token: savedToken }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setWebAuthenticated(true);
            setCheckingWebAuth(false);
            return;
          }
        }
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(WEB_AUTH_STORAGE_KEY);
        }
      } catch (e) {
        // If offline on iPhone PWA after already logging in previously, allow cached token
        const savedToken = typeof window !== 'undefined' ? window.localStorage.getItem(WEB_AUTH_STORAGE_KEY) : null;
        if (savedToken) {
          setWebAuthenticated(true);
        }
      } finally {
        setCheckingWebAuth(false);
      }
    };

    verifyExistingSession();
  }, []);

  const handleWebLogin = async () => {
    const cleanUser = loginUsername.trim();
    if (!cleanUser || !loginPassword) {
      setLoginError('Please enter both Login ID and Password.');
      return;
    }

    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await fetch(getWebLoginEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          password: loginPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.authenticated && data.token) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, data.token);
        }
        setWebAuthenticated(true);
        setLoginPassword('');
      } else {
        setLoginError(data.error || 'Invalid Login ID or Password.');
      }
    } catch (e) {
      setLoginError('Unable to reach authentication server. Please check your internet connection.');
    } finally {
      setIsLoggingIn(false);
    }
  };

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

  if (!dbInitialized || checkingWebAuth) {
    return null;
  }

  if (Platform.OS === 'web' && !webAuthenticated) {
    return (
      <View style={styles.loginPage}>
        <View style={styles.loginCard}>
          <View style={styles.loginIconCircle}>
            <Ionicons name="lock-closed" size={32} color="#EC4899" />
          </View>
          <Text style={styles.loginTitle}>Baker Buddy</Text>
          <Text style={styles.loginSubtitle}>Sign in to access your bakery workspace</Text>

          {!!loginError && (
            <View style={styles.loginErrorBox}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.loginErrorText}>{loginError}</Text>
            </View>
          )}

          <Text style={styles.loginLabel}>Login ID</Text>
          <TextInput
            style={styles.loginInput}
            value={loginUsername}
            onChangeText={(t) => {
              setLoginUsername(t);
              if (loginError) setLoginError('');
            }}
            placeholder="Enter your Login ID"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.loginLabel}>Password</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={[styles.loginInput, { marginBottom: 0, paddingRight: 44 }]}
              value={loginPassword}
              onChangeText={(t) => {
                setLoginPassword(t);
                if (loginError) setLoginError('');
              }}
              placeholder="Enter your Password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleWebLogin}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((prev) => !prev)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, isLoggingIn && { opacity: 0.7 }]}
            onPress={handleWebLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>

      {Platform.OS === 'web' &&
        webAlert.visible &&
        typeof document !== 'undefined' &&
        require('react-dom').createPortal(
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
          </View>,
          document.body
        )}
    </>
  );
}

const styles = StyleSheet.create({
  loginPage: {
    flex: 1,
    backgroundColor: '#FFFDFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#FECDD3',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  loginIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3E2723',
    textAlign: 'center',
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#795548',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  loginErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  loginErrorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  loginLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5D4037',
    marginBottom: 6,
  },
  loginInput: {
    backgroundColor: '#FFFDFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1F2937',
    marginBottom: 16,
  },
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 24,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  loginButton: {
    backgroundColor: '#EC4899',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  alertOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2147483647,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
