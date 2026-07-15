import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native';
import { apiClient, getValidated } from '../api/client';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const UnderReviewScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const hasNavigated = useRef(false);
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);
  const kycSessionId = useAuthStore((s) => s.kycSessionId);
  const setKycSessionId = useAuthStore((s) => s.setKycSessionId);
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  const { data, failureCount, refetch } = useQuery({
    queryKey: ['driverStatus'],
    queryFn: async () => {
      // In dev (no webhooks), refresh the DIDIT decision first so the DB
      // stays in sync. Production webhooks make this a no-op.
      if (kycSessionId) {
        try {
          await apiClient.get(`/kyc/decision/${kycSessionId}`);
        } catch {
          // best-effort; real result comes from webhook or next poll
        }
      }

      const statusData = await getValidated('/drivers/me/status', driverStatusSchema);
      return statusData;
    },
    refetchInterval: 10_000,
    retry: 3,
  });

  useEffect(() => {
    if (!data || hasNavigated.current) return;

    setDriverStatus(data.status);
    setOnboardingStep(data.step ?? null);

    if (data.status === 'approved') {
      hasNavigated.current = true;
      setKycSessionId(null);
      navigation.replace('Online');
      return;
    }

    if (data.status === 'rejected') {
      hasNavigated.current = true;
      setKycSessionId(null);
      setRejectedMessage('Tu verificacion fue rechazada. Por favor intenta nuevamente.');
      const timer = setTimeout(() => {
        navigation.replace('KYCVerify');
      }, 2500);
      return () => clearTimeout(timer);
    }

    // KYC just got approved → the flow continues (vehicle / documents). Advance
    // the user to whatever step is now pending instead of leaving them waiting.
    if (data.step && data.step !== 'review' && data.step !== 'kyc') {
      const route = STEP_ROUTE[data.step];
      if (route?.screen) {
        hasNavigated.current = true;
        setKycSessionId(null);
        navigation.replace(route.screen);
      }
    }
  }, [data, navigation, setKycSessionId, setDriverStatus, setOnboardingStep]);

  const showError = failureCount >= 3;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        {showError ? (
          <>
            <Text style={styles.errorTitle}>No pudimos verificar tu estado. Reintenta.</Text>
            <Button title="Reintentar" onPress={() => refetch()} style={styles.button} />
          </>
        ) : (
          <>
            <View style={styles.iconCircle}>
              <Text style={styles.clockIcon}>⏳</Text>
            </View>

            {rejectedMessage ? (
              <Text style={styles.rejectedText}>{rejectedMessage}</Text>
            ) : data?.step === 'kyc' ? (
              <>
                <Text style={styles.title}>Tu identidad esta siendo verificada</Text>
                <Text style={styles.subtitle}>
                  DIDIT esta revisando tus datos biometricos. Te avisaremos cuando este lista.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Tus datos estan siendo verificados</Text>
                <Text style={styles.subtitle}>
                  Te avisaremos por WhatsApp cuando tu cuenta este verificada
                </Text>
              </>
            )}
          </>
        )}
      </View>

      <Button
        title="Salir"
        variant="secondary"
        onPress={() => BackHandler.exitApp()}
        style={styles.exitButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0, 194, 179, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 280,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
    lineHeight: 24,
  },
  errorTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 280,
  },
  rejectedText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: 280,
  },
  button: {
    marginTop: theme.spacing.md,
  },
  exitButton: {
    alignSelf: 'center',
    marginBottom: theme.spacing.xl,
  },
});
