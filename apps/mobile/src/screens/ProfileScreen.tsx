import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TabBar } from '../components/TabBar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useSignOut } from '../hooks/useAuth';
import { theme } from '../theme';

export const ProfileScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const signOut = useSignOut();
  const [activeTab, setActiveTab] = React.useState<'home' | 'earnings' | 'profile'>('profile');

  const handleTabPress = (tab: 'home' | 'earnings' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate('Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
  };

  const handleSignOut = () => {
    signOut.mutate();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.profileCard} padding={theme.spacing.lg}>
          <View style={styles.avatar}>
            <Text style={styles.avatarIcon}>👤</Text>
          </View>
          <Text style={styles.name}>Carlos Gomez</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>342</Text>
              <Text style={styles.statLabel}>Viajes</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>4.9</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>2</Text>
              <Text style={styles.statLabel}>Anos</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Mi vehiculo</Text>
          <Text style={styles.vehicleInfo}>Toyota Corolla 2020 · ABC 123</Text>
          <Text style={styles.vehicleColor}>Blanco</Text>
        </Card>

        <Button
          title="Cerrar sesion"
          variant="danger"
          onPress={handleSignOut}
          style={styles.button}
          textStyle={{ color: theme.colors.dangerRed, fontWeight: theme.fontWeight.medium }}
        />
      </ScrollView>

      <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
  },
  header: {
    height: 56,
    backgroundColor: theme.colors.deepBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  profileCard: {
    width: 343,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.mediumGray,
    backgroundColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: {
    fontSize: 32,
    color: theme.colors.mediumGray,
  },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: theme.spacing.sm,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.turquoise,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
  },
  cardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  vehicleInfo: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  vehicleColor: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    marginTop: 4,
  },
  button: {
    width: 327,
    borderColor: theme.colors.dangerRed,
  },
});
