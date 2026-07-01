import React from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const MOCK_ROUTE: Array<[number, number]> = [
  [-65.1833, -31.9333],
  [-65.182, -31.9345],
  [-65.181, -31.936],
  [-65.1795, -31.9375],
  [-65.1785, -31.939],
];

export const TripInProgressScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const activeTripId = useTripStore((s) => s.activeTripId);
  const [completing, setCompleting] = React.useState(false);

  const handleCompleteTrip = async () => {
    if (!activeTripId) return;
    setCompleting(true);
    try {
      const response = await apiClient.put(`/trips/${activeTripId}/complete`);
      const { amount, commission, driver_earnings } = response.data;
      navigation.navigate('TripComplete', {
        amount: String(amount ?? 2500),
        commission: String(commission ?? 500),
        driverEarnings: String(driver_earnings ?? 2000),
      });
    } catch {
      navigation.navigate('TripComplete');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapArea}>
        <MapView followUserLocation routeLine={MOCK_ROUTE} />
      </View>
      <View style={styles.bottomCard}>
        <Text style={styles.label}>En viaje</Text>
        <Text style={styles.destination}>Terminal de Omnibus</Text>
        <Text style={styles.eta}>~5 min · 3.2 km</Text>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
        <Button
          title="FINALIZAR VIAJE"
          onPress={handleCompleteTrip}
          loading={completing}
          style={styles.button}
        />
        <TouchableOpacity>
          <Text style={styles.wazeLink}>Abrir en Waze</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  mapArea: {
    height: 609,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCard: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  destination: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  eta: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.lightGray,
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.turquoise,
    width: '55%',
  },
  button: {
    width: 327,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  wazeLink: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
});
