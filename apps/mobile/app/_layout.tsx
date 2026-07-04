import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { apiClient } from '../src/api/client';
import { driverStatusSchema } from '../src/api/types';
import { ConnectivityBanner } from '../src/components/feedback/ConnectivityBanner';
import { ErrorBoundary } from '../src/components/feedback/ErrorBoundary';
import { useAppNavigation } from '../src/hooks/useAppNavigation';
import {
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { useAuthStore } from '../src/store/authStore';
import { theme } from '../src/theme';

const PUBLIC_ROUTES = ['', 'register', 'forgot-password'];

function AuthRedirectWatcher() {
  const needsRedirect = useAuthStore((s) => s.needsRedirect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const resetRedirect = useAuthStore((s) => s.resetRedirect);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (needsRedirect) {
      console.log(
        '[AuthRedirectWatcher] needsRedirect triggered, segments:',
        segments[0],
        '→ replacing to /',
      );
      resetRedirect();
      if (segments[0] !== undefined) {
        InteractionManager.runAfterInteractions(() => {
          router.replace('/');
        });
      }
    }
  }, [needsRedirect, resetRedirect, router, segments]);

  useEffect(() => {
    console.log(
      '[AuthRedirectWatcher] isAuthenticated:',
      isAuthenticated,
      '| segments[0]:',
      segments[0],
    );
    if (isAuthenticated && PUBLIC_ROUTES.includes(segments[0] ?? '')) {
      console.log('[AuthRedirectWatcher] → redirecting to /online');
      InteractionManager.runAfterInteractions(() => {
        router.replace('/online');
      });
    }
  }, [isAuthenticated, segments, router]);

  return null;
}

function SessionRestore() {
  useEffect(() => {
    const restore = async () => {
      const token = useAuthStore.getState().token;
      console.log('[SessionRestore] token present:', !!token);
      if (!token) return;

      try {
        const response = await apiClient.get('/auth/me');
        const user = response.data;
        if (user?.id) {
          console.log('[SessionRestore] auth/me returned user:', user.id);
          useAuthStore.getState().setDriverId(user.id);
        }

        try {
          console.log('[SessionRestore] Fetching /drivers/me/status...');
          const statusRes = await apiClient.get('/drivers/me/status');
          console.log(
            '[SessionRestore] /drivers/me/status response:',
            JSON.stringify(statusRes.data),
          );
          const parsed = driverStatusSchema.safeParse(statusRes.data?.data ?? statusRes.data);
          if (parsed.success) {
            console.log('[SessionRestore] setting driverStatus:', parsed.data.status);
            useAuthStore.getState().setDriverStatus(parsed.data.status);
          } else {
            console.log('[SessionRestore] parse failed, could not set driverStatus');
          }
        } catch (statusErr: any) {
          console.log('[SessionRestore] /drivers/me/status ERROR:', statusErr?.message);
        }
      } catch (err: any) {
        console.log('[SessionRestore] /auth/me ERROR:', err?.message);
      }
    };
    restore();
  }, []);

  return null;
}

function ActiveTripRecovery() {
  const driverId = useAuthStore((s) => s.driverId);
  const router = useRouter();

  useEffect(() => {
    if (!driverId) return;
    const check = async () => {
      try {
        const response = await apiClient.get('/trips/active');
        const trip = response.data?.data ?? response.data;
        if (trip) {
          InteractionManager.runAfterInteractions(() => {
            switch (trip.status) {
              case 'accepted':
                router.replace('/navigation');
                break;
              case 'driver_arrived':
                router.replace('/waiting-passenger');
                break;
              case 'in_progress':
                router.replace('/trip-in-progress');
                break;
              case 'requested':
                router.replace('/incoming-request');
                break;
              default:
                break;
            }
          });
        }
      } catch {
        // no active trip or API error — stay on current screen
      }
    };
    check();
  }, [driverId, router]);

  return null;
}

function NotificationSetup() {
  const { navigate } = useAppNavigation();

  useEffect(() => {
    setupNotificationHandler();

    registerForPush().then((token) => {
      if (token) {
        console.log('Expo push token:', token);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, navigate);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <View style={styles.root}>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: theme.colors.white },
            }}
          />
          <AuthRedirectWatcher />
          <SessionRestore />
          <ActiveTripRecovery />
          <NotificationSetup />
          <ConnectivityBanner />
        </View>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
