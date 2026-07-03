import type React from 'react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { driverStatusSchema } from '../api/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useLogin } from '../hooks/useAuth';
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
      await login.mutateAsync({ email: username.trim(), password });
    } catch (err: any) {
      const message = err?.message ?? err?.response?.data?.message ?? 'Error al iniciar sesion';
      setError(message);
      return;
    }

    try {
      const { data: body } = await apiClient.get('/drivers/me/status');
      const payload = body?.data ?? body;
      const parsed = driverStatusSchema.safeParse(payload);
      const status = parsed.success ? parsed.data.status : (payload as { status?: string })?.status;

      switch (status) {
        case 'under_review':
          setDriverStatus('under_review');
          navigation.navigate('UnderReview');
          break;
        case 'approved':
          setDriverStatus('approved');
          navigation.navigate('Online');
          break;
        case 'pending':
          setDriverStatus('pending');
          navigation.navigate('Terms');
          break;
        default:
          setDriverStatus('approved');
          navigation.navigate('Online');
      }
    } catch {
      setDriverStatus('pending');
      navigation.navigate('Terms');
    }
  };

  const isDisabled = !username || !password || login.isPending;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: 16 }} />
          <Text style={styles.title}>Iniciar sesion</Text>
          <Text style={styles.subtitle}>Ingresa tu email y contrasena</Text>
          <View style={{ height: 8 }} />
          <Input
            placeholder="Email"
            value={username}
            onChangeText={setUsername}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={styles.inputField}
          />
          <Input
            placeholder="Contrasena"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            containerStyle={styles.inputField}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.showPasswordRow}
          >
            <Text style={styles.showPasswordText}>{showPassword ? '🙈 Ocultar' : '👁 Mostrar'}</Text>
          </TouchableOpacity>
          <View style={{ height: 8 }} />
          <Button
            title="INICIAR SESION"
            onPress={handleLogin}
            loading={login.isPending}
            disabled={isDisabled}
            style={styles.button}
          />
          {error !== null && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.forgotPassword}>Olvidaste tu contrasena?</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    height: theme.dimensions.navbarHeight,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  backText: {
    color: theme.colors.deepBlue,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
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
    fontSize: 16,
    color: theme.colors.mediumGray,
  },
  showPasswordRow: {
    width: 327,
    alignItems: 'flex-start',
  },
  showPasswordText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  button: {
    width: 327,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    width: 327,
    textAlign: 'center',
  },
  forgotPassword: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
});
