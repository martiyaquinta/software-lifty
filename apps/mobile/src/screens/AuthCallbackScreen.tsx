import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export function AuthCallbackScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const globalRef = globalThis as unknown as { location?: { href: string } };
    const location = globalRef.location;
    if (Platform.OS !== 'web' || !location) {
      router.replace('/');
      return;
    }

    const run = async () => {
      try {
        const url = new URL(location.href);
        const params = url.searchParams;
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

        const errorDescription = params.get('error_description') ?? params.get('error');
        if (errorDescription) throw new Error(errorDescription);

        const code = params.get('code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (accessToken && refreshToken) {
          const { error: setError2 } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setError2) throw setError2;
        }

        router.replace('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo completar el inicio de sesión.');
      }
    };

    run();
  }, [router]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.title}>Error al iniciar sesión</Text>
          <Text style={styles.message}>{error}</Text>
          <Button title="Volver" onPress={() => router.replace('/auth')} style={styles.button} />
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
          <Text style={styles.message}>Iniciando sesión...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.deepBlue,
  },
  message: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  button: {
    marginTop: theme.spacing.md,
  },
});
