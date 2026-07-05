import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient, getValidated } from '../api/client';
import { earningsDailySchema } from '../api/types';
import type { EarningsDaily } from '../api/types';
import { Card } from '../components/Card';
import { MapView } from '../components/MapView';
import { SideMenu } from '../components/SideMenu';
import { TabBar } from '../components/TabBar';
import { Toggle } from '../components/Toggle';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { stopTracking } from '../lib/location';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

export const OnlineScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const setOnline = useOnlineStore((s) => s.setOnline);
  const [activeTab, setActiveTab] = useState<'home' | 'earnings' | 'profile'>('home');
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const signOut = useSignOut();

  useEffect(() => {
    apiClient
      .get('/drivers/me')
      .then((res) => {
        setAvatarUrl(res.data?.avatar_url ?? null);
      })
      .catch(() => {});
  }, []);

  const {
    data: earnings,
    isLoading: earningsLoading,
    isError: earningsIsError,
    error: earningsError,
    refetch: refetchEarnings,
  } = useQuery<EarningsDaily>({
    queryKey: ['earnings-daily'],
    queryFn: () => getValidated('/drivers/me/earnings/daily', earningsDailySchema),
    refetchInterval: 60_000,
  });

  const handleToggle = useCallback(
    async (newValue: boolean) => {
      setToggleError(null);

      try {
        await apiClient.put('/drivers/me/online', { is_online: newValue });
        setOnline(newValue);

        if (newValue) {
          navigation.replace('Active');
        } else {
          const ref = useOnlineStore.getState().heartbeatIntervalRef;
          if (ref) clearInterval(ref);
          useOnlineStore.getState().setHeartbeatRef(null);

          stopTracking();
        }
      } catch (err: unknown) {
        setToggleError(err instanceof Error ? err.message : 'Error al cambiar estado');
      }
    },
    [setOnline, navigation],
  );

  const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  const menuItems = useMemo(
    () => [
      {
        label: 'Inicio',
        icon: '🏠',
        onPress: () => {
          if (isOnline) {
            navigation.navigate('Active');
          }
        },
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
    [navigation, signOut, isOnline],
  );

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderEarningsCard = () => {
    if (earningsLoading) {
      return <SkeletonCard style={styles.earningsCard} />;
    }

    if (earningsIsError) {
      const message =
        earningsError instanceof Error ? earningsError.message : 'Error al cargar ganancias';
      return (
        <Card style={styles.earningsCard} padding={theme.spacing.lg}>
          <Text style={styles.earningsLabel}>Ganaste hoy</Text>
          <Text style={styles.earningsErrorText}>No se pudo cargar</Text>
          <Text style={styles.earningsErrorDetail}>{message}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetchEarnings()}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </Card>
      );
    }

    if (!earnings || earnings.total === 0) {
      return (
        <Card style={styles.earningsCard} padding={theme.spacing.lg}>
          <Text style={styles.earningsLabel}>Ganaste hoy</Text>
          <Text style={styles.earningsAmount}>$0</Text>
          <Text style={styles.earningsSubtext}>Todavia no hiciste viajes hoy</Text>
        </Card>
      );
    }

    return (
      <Card style={styles.earningsCard} padding={theme.spacing.lg}>
        <Text style={styles.earningsLabel}>Ganaste hoy</Text>
        <Text style={styles.earningsAmount}>{formatCurrency(earnings.total)}</Text>
        <View style={styles.earningsBreakdown}>
          <View style={styles.earningsBreakdownItem}>
            <Text style={styles.breakdownLabel}>Efectivo</Text>
            <Text style={styles.breakdownValue}>{formatCurrency(earnings.cash)}</Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.earningsBreakdownItem}>
            <Text style={styles.breakdownLabel}>Transferencia</Text>
            <Text style={styles.breakdownValue}>{formatCurrency(earnings.transfer)}</Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.menuButton}
          activeOpacity={0.7}
          onPress={() => setMenuVisible(true)}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.avatarButton}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profile')}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>👤</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.toggleSection}>
          <Text style={[styles.statusLabel, isOnline ? styles.statusOnline : styles.statusOffline]}>
            {isOnline ? 'Estas conectado' : 'Estas desconectado'}
          </Text>
          <Toggle value={isOnline} onToggle={handleToggle} />
          {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}
        </View>

        <View style={styles.mapContainer}>
          <MapView followUserLocation />
        </View>

        {renderEarningsCard()}

        <View style={styles.spacer} />
      </View>

      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} menuItems={menuItems} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  header: {
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
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
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
  },
  avatarText: {
    fontSize: 20,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  toggleSection: {
    alignItems: 'center',
    gap: theme.spacing.sm + 2,
  },
  statusLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  statusOnline: {
    color: theme.colors.turquoise,
  },
  statusOffline: {
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  mapContainer: {
    width: '100%',
    height: 240,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.lightGray,
  },
  earningsCard: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  earningsLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  earningsAmount: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  earningsBreakdown: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  earningsBreakdownItem: {
    alignItems: 'center',
    gap: 2,
  },
  breakdownLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  breakdownValue: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.lightGray,
  },
  earningsErrorText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  earningsErrorDetail: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginTop: 2,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.buttonRadius,
    backgroundColor: theme.colors.deepBlue,
  },
  retryButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  earningsSubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  spacer: {
    flex: 1,
  },
});
