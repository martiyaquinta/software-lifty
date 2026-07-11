import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { apiClient } from '../src/api/client';
import { driverStatusSchema } from '../src/api/types';
import { AuthRedirectWatcher } from '../src/components/AuthRedirectWatcher';
import { ConnectivityBanner } from '../src/components/feedback/ConnectivityBanner';
import { ErrorBoundary } from '../src/components/feedback/ErrorBoundary';
import { LoadingOverlay } from '../src/components/feedback/LoadingOverlay';
import { AuthProvider } from '../src/context/AuthContext';
import { useAppNavigation } from '../src/hooks/useAppNavigation';
import {
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/store/authStore';
import { useTripStore } from '../src/store/tripStore';
import { theme } from '../src/theme';

function SessionRestore() {
  useEffect(() => {
    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        useAuthStore.getState().clearAuth();
        return;
      }
      useAuthStore.getState().setSession(token, data.session?.user?.id ?? null);

      try {
        const response = await apiClient.get('/auth/me');
        const user = response.data;
        if (user?.id) {
          useAuthStore.getState().setDriverId(user.id);
        }

        try {
          const statusRes = await apiClient.get('/drivers/me/status');
          const parsed = driverStatusSchema.safeParse(statusRes.data?.data ?? statusRes.data);
          if (parsed.success) {
            useAuthStore.getState().setDriverStatus(parsed.data.status);
            // Persist the onboarding step so AuthRedirectWatcher can route a
            // returning user to exactly where they left off (e.g. the KYC gate)
            // instead of dropping them on the app home.
            useAuthStore.getState().setOnboardingStep(parsed.data.step ?? null);
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
  const routerRef = useRef(router);
  routerRef.current = router;
  const navigatedRef = useRef(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driverId || navigatedRef.current) return;
    let cancelled = false;
    const check = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get('/trips/active');
        if (cancelled) return;
        const trip = response.data?.data ?? response.data;
        if (trip) {
          useTripStore.getState().setActiveTrip(trip.id, trip.status);
          navigatedRef.current = true;
          InteractionManager.runAfterInteractions(() => {
            if (cancelled) return;
            switch (trip.status) {
              case 'request_received':
                routerRef.current.replace('/incoming-request');
                break;
              case 'accepted':
              case 'en_route':
                routerRef.current.replace('/navigation');
                break;
              case 'waiting':
                routerRef.current.replace('/waiting-passenger');
                break;
              case 'in_trip':
                routerRef.current.replace('/trip-in-progress');
                break;
              default:
                break;
            }
          });
        }
      } catch (err: any) {
        console.log('[ActiveTripRecovery] /trips/active ERROR:', err?.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  if (loading) {
    return <LoadingOverlay visible />;
  }

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
        <AuthProvider>
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
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
