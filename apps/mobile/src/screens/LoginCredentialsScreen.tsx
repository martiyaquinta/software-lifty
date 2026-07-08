import type React from 'react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLogin } from '../hooks/useAuth';
import { routeForDriverStatus } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

export const LoginCredentialsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setDriverStatus = useAuthStore((s) => s.setDriverStatus);

  const login = useLogin();

  const handleLogin = async () => {
    setError(null);
    try {
      const loginResult = await login.mutateAsync({ email: username.trim(), password });
      console.log('[LoginCredentials] Login success, user:', loginResult.user?.id);
    } catch (err: any) {
      const message = err?.message ?? err?.response?.data?.message ?? 'Error al iniciar sesion';
      setError(message);
      return;
    }

    try {
      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const driverData = parsed.success ? parsed.data : (payload as DriverStatus);

      const route = routeForDriverStatus(driverData);
      setDriverStatus(route.status);

      if (route.blockedMessage) {
        setError(route.blockedMessage);
        return;
      }
      if (route.screen) {
        navigation.navigate(route.screen);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'No se pudo verificar el estado de tu cuenta';
      setError(message);
    }
  };

  const isDisabled = !username || !password || login.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.spacerTop} />
        <Text style={styles.title}>Iniciar sesion</Text>
        <View style={styles.gapMd} />
        <Text style={styles.subtitle}>Ingresa tu email y contrasena</Text>
        <View style={styles.spacer} />

        <Input
          placeholder="Email"
          value={username}
          onChangeText={setUsername}
          keyboardType="email-address"
          autoCapitalize="none"
          containerStyle={styles.inputField}
        />
        <View style={styles.gapMd} />
        <Input
          placeholder="Contrasena"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          containerStyle={styles.inputField}
          rightElement={
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          }
        />
        <View style={styles.spacer} />

        <Button
          title="INICIAR SESION"
          onPress={handleLogin}
          loading={login.isPending}
          disabled={isDisabled}
          style={styles.button}
        />
        {error !== null && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.gapMd} />
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotPassword}>Olvidaste tu contrasena?</Text>
        </TouchableOpacity>

        <View style={styles.filler} />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    height: theme.dimensions.navbarHeight,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  backButton: {
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  backText: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  spacerTop: {
    height: 16,
  },
  gapMd: {
    height: theme.spacing.md,
  },
  spacer: {
    height: 8,
  },
  title: {
    fontSize: theme.fontSize['2xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    width: 327,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    width: 327,
  },
  inputField: {
    width: 327,
  },
  eyeIcon: {
    fontSize: theme.fontSize.md,
  },
  button: {
    width: 327,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    width: 327,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  filler: {
    flex: 1,
  },
});
