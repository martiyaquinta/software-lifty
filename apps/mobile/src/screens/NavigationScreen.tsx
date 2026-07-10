import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, StatusBar, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const PASSENGER_COORD: [number, number] = [-65.1833, -31.9333];

export const NavigationScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [loading, setLoading] = useState(false);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const tripStatus = useTripStore((s) => s.tripStatus);
  const setTripStatus = useTripStore((s) => s.setTripStatus);
  const enRouteSent = useRef(false);

  useEffect(() => {
    if (!activeTripId || tripStatus !== 'accepted' || enRouteSent.current) return;
    enRouteSent.current = true;
    apiClient
      .post(`/trips/${activeTripId}/en-route`)
      .then(() => setTripStatus('en_route'))
      .catch(() => {});
  }, [activeTripId, tripStatus, setTripStatus]);

  const handleArrive = async () => {
    if (!activeTripId) return;
    setLoading(true);
    try {
      await apiClient.post(`/trips/${activeTripId}/arrived`);
      setTripStatus('waiting');
      navigation.navigate('WaitingPassenger');
    } catch {
      Alert.alert('Error', 'No se pudo confirmar la llegada.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mapArea}>
        <MapView
          followUserLocation
          markers={[
            {
              id: 'pickup',
              coordinate: PASSENGER_COORD,
              title: 'Pasajero',
              color: theme.colors.dangerRed,
            },
          ]}
        />
      </View>
      <View style={styles.bottomCard}>
        <Text style={styles.label}>Rumbo al pasajero</Text>
        <Text style={styles.address}>Av. San Martin 450</Text>
        <Text style={styles.eta}>4 min · 1.8 km</Text>
        <View style={styles.navButtons}>
          <Button
            title="Abrir en Waze"
            variant="secondary"
            onPress={() => {}}
            style={styles.navButton}
            textStyle={styles.navButtonText}
          />
          <Button
            title="Abrir en Maps"
            variant="secondary"
            onPress={() => {}}
            style={styles.navButton}
            textStyle={styles.navButtonText}
          />
        </View>
        <Button
          title="LLEGUE"
          onPress={handleArrive}
          loading={loading}
          style={styles.arrivedButton}
        />
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
    height: 528,
    backgroundColor: theme.colors.lightGray,
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
  address: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  eta: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  navButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  navButton: {
    flex: 1,
    height: 40,
  },
  navButtonText: {
    fontSize: theme.fontSize.sm,
  },
  arrivedButton: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
});
