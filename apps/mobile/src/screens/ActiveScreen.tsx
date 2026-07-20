import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { MapView } from '../components/MapView';
import { SideMenu } from '../components/SideMenu';
import { Toggle } from '../components/Toggle';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { startTracking, stopTracking } from '../lib/location';
import { subscribeToDriverChannel } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

export const ActiveScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const setOnline = useOnlineStore((s) => s.setOnline);
  const driverId = useAuthStore((s) => s.driverId);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const disconnectedRef = useRef(false);
  const signOut = useSignOut();

  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      apiClient.put('/drivers/me/heartbeat').catch(() => {});
    }, 30_000);
    useOnlineStore.getState().setHeartbeatRef(heartbeatInterval);

    startTracking();

    return () => {
      if (!disconnectedRef.current) {
        clearInterval(heartbeatInterval);
        useOnlineStore.getState().setHeartbeatRef(null);
        stopTracking();
      }
    };
  }, []);

  useEffect(() => {
    if (!driverId) return;

    const unsubscribe = subscribeToDriverChannel(driverId, () => {
      navigation.navigate('IncomingRequest');
    });

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/trips/active');
        if (data && data.status === 'request_received') {
          navigation.navigate('IncomingRequest');
        }
      } catch {}
    }, 5_000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [driverId, navigation]);

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      if (newValue) return;

      setToggleError(null);

      try {
        await apiClient.put('/drivers/me/online', { is_online: false });
        setOnline(false);
        disconnectedRef.current = true;

        const ref = useOnlineStore.getState().heartbeatIntervalRef;
        if (ref) clearInterval(ref);
        useOnlineStore.getState().setHeartbeatRef(null);

        stopTracking();

        navigation.replace('Online');
      } catch (err: unknown) {
        setToggleError(err instanceof Error ? err.message : 'Error al cambiar estado');
      }
    },
    [setOnline, navigation],
  );

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: '🏠',
        onPress: () => {},
      },
      {
        label: 'Ganancias',
        icon: '💰',
        onPress: () => navigation.navigate('Earnings'),
      },
      {
        label: 'Metodo de cobro',
        icon: '💳',
        onPress: () => navigation.navigate('PaymentMethod'),
      },
      {
        label: 'Perfil',
        icon: '👤',
        onPress: () => navigation.navigate('Profile'),
      },
      {
        label: 'Cerrar sesion',
        icon: '🚪',
        onPress: () => signOut.mutateAsync(),
        danger: true,
        dividerTop: true,
      },
    ],
    [navigation, signOut],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />

      <MapView style={StyleSheet.absoluteFill as any} followUserLocation />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.menuButton}
          activeOpacity={0.7}
          onPress={() => setMenuVisible(true)}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <View style={styles.connectedBadge}>
            <Text style={styles.connectedBadgeText}>Conectado</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.floatingCard}>
        <View style={styles.toggleRow}>
          <Text style={styles.statusOnline}>Estas conectado</Text>
          <Toggle value={true} onToggle={handleToggle} />
        </View>
        <Text style={styles.statusOffline}>Desconectado</Text>
        {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}
      </View>

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    zIndex: 10,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  connectedBadge: {
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 4,
  },
  connectedBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: theme.fontWeight.medium,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
  },
  floatingCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  statusOnline: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.turquoise,
  },
  statusOffline: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
});
