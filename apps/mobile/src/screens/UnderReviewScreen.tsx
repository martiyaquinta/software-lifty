import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { getValidated } from '../api/client';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const UnderReviewScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const hasNavigated = useRef(false);
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);

  const { data, failureCount, refetch } = useQuery({
    queryKey: ['driverStatus'],
    queryFn: async () => {
      const statusData = await getValidated('/drivers/me/status', driverStatusSchema);
      return statusData;
    },
    refetchInterval: 10_000,
    retry: 3,
  });

  useEffect(() => {
    if (!data || hasNavigated.current) return;
    if (data.status === 'approved') {
      hasNavigated.current = true;
      navigation.replace('Online');
    } else if (data.status === 'rejected') {
      hasNavigated.current = true;
      setRejectedMessage('Tu cuenta fue rechazada. Por favor revisa tus datos.');
      const timer = setTimeout(() => {
        navigation.replace('OnboardingStep2');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [data, navigation]);

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
        onPress={() => navigation.replace('Welcome')}
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
