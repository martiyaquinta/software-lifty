import type React from 'react';
import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const KYCVerifyScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const driverStatus = useAuthStore((s) => s.driverStatus);
  const setKycSessionId = useAuthStore((s) => s.setKycSessionId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (driverStatus === 'approved') {
      navigation.replace('Online');
    } else if (driverStatus === 'under_review') {
      navigation.navigate('UnderReview');
    }
  }, [driverStatus]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/kyc/me/session');
      if (!data?.session_url) throw new Error('No se pudo iniciar la verificacion');
      setKycSessionId(data.session_id ?? null);
      navigation.navigate('KYCWebView', { url: data.session_url });
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo iniciar la verificacion');
    } finally {
      setLoading(false);
    }
  };

  if (driverStatus === 'approved' || driverStatus === 'under_review') {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Verificacion" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
        <Text style={styles.title}>Verifica tu identidad</Text>
        <Text style={styles.description}>
          Para garantizar la seguridad de todos, necesitamos verificar tu identidad con nuestro
          sistema DIDIT. Vas a necesitar tu DNI y acceso a la camara.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          title="COMENZAR VERIFICACION"
          onPress={handleStart}
          loading={loading}
          style={styles.button}
        />
        <Text style={styles.footer}>Verificacion por DIDIT</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
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
  lockIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
    lineHeight: 24,
  },
  button: {
    width: 343,
  },
  error: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: 280,
  },
  footer: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
});
