import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';

const MOCK_TRIP_ID = 'mock-trip-123';

export const IncomingRequestScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { setActiveTrip } = useTripStore();
  const [seconds, setSeconds] = useState(8);
  const [accepted, setAccepted] = useState(false);
  const timedOut = useRef(false);

  useEffect(() => {
    if (accepted || timedOut.current) return;
    if (seconds <= 0) {
      timedOut.current = true;
      apiClient
        .put(`/trips/${MOCK_TRIP_ID}/respond`, { action: 'timeout' })
        .catch(() => {})
        .finally(() => {
          navigation.goBack();
        });
      return;
    }
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds, accepted]);

  const handleAccept = async () => {
    try {
      await apiClient.put(`/trips/${MOCK_TRIP_ID}/respond`, { action: 'accept' });
      setActiveTrip(MOCK_TRIP_ID, 'accepted');
      setAccepted(true);
      navigation.navigate('Navigation');
    } catch {}
  };

  const handleReject = async () => {
    try {
      await apiClient.put(`/trips/${MOCK_TRIP_ID}/respond`, { action: 'reject' });
    } catch {}
    navigation.navigate('Online');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.spacer} />
      <Text style={styles.newRequest}>Nueva solicitud</Text>

      <View style={styles.timerCircle}>
        <Text style={styles.timerText}>{accepted ? '✓' : `0:0${seconds}`}</Text>
      </View>

      <Card style={styles.routeCard}>
        <View style={styles.routePoint}>
          <Text style={styles.routeIconStart}>📍</Text>
          <Text style={styles.routeText}>Av. San Martin 450</Text>
        </View>
        <View style={styles.routeLine}>
          <Text style={styles.distanceText}>3.2 km</Text>
        </View>
        <View style={styles.routePoint}>
          <Text style={styles.routeIconEnd}>📍</Text>
          <Text style={styles.routeText}>Terminal de Omnibus</Text>
        </View>
      </Card>

      <View style={{ height: theme.spacing.md }} />

      <Text style={styles.earningsLabel}>Ganaras</Text>
      <Text style={styles.earningsAmount}>$2.500</Text>

      <View style={{ height: theme.spacing.lg }} />

      {accepted ? (
        <Text style={styles.acceptedText}>Viaje aceptado!</Text>
      ) : (
        <>
          <Button title="ACEPTAR" variant="cta" onPress={handleAccept} style={styles.button} />
          <TouchableOpacity onPress={handleReject}>
            <Text style={styles.rejectLink}>Rechazar</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  spacer: {
    height: 32,
  },
  newRequest: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  timerCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    borderWidth: 4,
    borderColor: theme.colors.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  routeCard: {
    width: 310,
    gap: theme.spacing.sm,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  routeIconStart: {
    fontSize: 16,
  },
  routeIconEnd: {
    fontSize: 16,
  },
  routeText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
  },
  routeLine: {
    height: 24,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  distanceText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  earningsLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
  },
  earningsAmount: {
    fontSize: theme.fontSize['4xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  button: {
    width: 327,
  },
  rejectLink: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mediumGray,
    marginTop: theme.spacing.sm,
  },
  acceptedText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
});
