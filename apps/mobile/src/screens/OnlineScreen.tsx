import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient, getValidated } from '../api/client';
import { earningsDailySchema } from '../api/types';
import type { EarningsDaily } from '../api/types';
import { Card } from '../components/Card';
import { MapView } from '../components/MapView';
import { TabBar } from '../components/TabBar';
import { Toggle } from '../components/Toggle';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { startTracking, stopTracking } from '../lib/location';
import { useOnlineStore } from '../store/onlineStore';
import { theme } from '../theme';

export const OnlineScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const isOnline = useOnlineStore((s) => s.isOnline);
  const setOnline = useOnlineStore((s) => s.setOnline);
  const [activeTab, setActiveTab] = useState<'home' | 'earnings' | 'profile'>('home');
  const [showConnectedBadge, setShowConnectedBadge] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const {
    data: earnings,
    isLoading: earningsLoading,
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
        await apiClient.put('/drivers/me/online', { online: newValue });
        setOnline(newValue);

        if (newValue) {
          setShowConnectedBadge(true);
          setTimeout(() => setShowConnectedBadge(false), 2000);

          startTracking();

          const interval = setInterval(() => {
            apiClient.put('/drivers/me/heartbeat').catch(() => {});
          }, 30_000);
          useOnlineStore.getState().setHeartbeatRef(interval);
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
    [setOnline],
  );

  const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <View style={styles.header}>
        <Text style={styles.menuIcon}>☰</Text>
        <View style={styles.headerRight}>
          {isOnline && showConnectedBadge && (
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedBadgeText}>Conectado</Text>
            </View>
          )}
          <TouchableOpacity style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.toggleSection}>
          <Text style={styles.statusLabel}>Estas {isOnline ? 'conectado' : 'desconectado'}</Text>
          <Toggle value={isOnline} onToggle={handleToggle} />
          {toggleError && <Text style={styles.errorText}>{toggleError}</Text>}
        </View>

        <View style={styles.mapContainer}>
          <MapView followUserLocation />
        </View>

        {earningsLoading ? (
          <SkeletonCard />
        ) : earningsError ? (
          <Card style={styles.earningsCard} padding={theme.spacing.lg}>
            <Text style={styles.earningsLabel}>Ganaste hoy</Text>
            <Text style={styles.earningsError}>No se pudo cargar</Text>
            <TouchableOpacity onPress={() => refetchEarnings()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        ) : earnings && earnings.total > 0 ? (
          <Card style={styles.earningsCard} padding={theme.spacing.lg}>
            <Text style={styles.earningsLabel}>Ganaste hoy</Text>
            <Text style={styles.earningsAmount}>{formatCurrency(earnings.total)}</Text>
            <View style={styles.earningsBreakdown}>
              <Text style={styles.earningsBreakdownItem}>
                Efectivo {formatCurrency(earnings.cash)}
              </Text>
              <Text style={styles.earningsBreakdownItem}>
                Transferencia {formatCurrency(earnings.transfer)}
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={styles.earningsCard} padding={theme.spacing.lg}>
            <Text style={styles.earningsLabel}>Ganaste hoy</Text>
            <Text style={styles.earningsAmount}>$0</Text>
            <Text style={styles.earningsSubtext}>Todavia no hiciste viajes hoy</Text>
          </Card>
        )}

        <View style={{ flex: 1 }} />
      </View>

      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.lg,
  },
  header: {
    height: 56,
    backgroundColor: theme.colors.deepBlue,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  connectedBadge: {
    backgroundColor: theme.colors.turquoise,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  connectedBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: theme.fontWeight.medium,
  },
  menuIcon: {
    color: theme.colors.white,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  toggleSection: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.lg,
  },
  statusLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  mapContainer: {
    width: 343,
    height: 200,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  earningsCard: {
    width: 343,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  earningsLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  earningsAmount: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  earningsBreakdown: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  earningsBreakdownItem: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  earningsError: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
    marginTop: theme.spacing.sm,
  },
  earningsSubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
});
