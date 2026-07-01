import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';

interface TabBarProps {
  activeTab: 'home' | 'earnings' | 'profile';
  onTabPress: (tab: 'home' | 'earnings' | 'profile') => void;
}

interface TabItem {
  key: 'home' | 'earnings' | 'profile';
  label: string;
  icon: string;
}

const tabs: TabItem[] = [
  { key: 'home', label: 'Inicio', icon: '🏠' },
  { key: 'earnings', label: 'Cobros', icon: '💰' },
  { key: 'profile', label: 'Perfil', icon: '👤' },
];

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabPress }) => {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.icon, !isActive && styles.inactiveIcon]}>{tab.icon}</Text>
            <Text style={[styles.label, isActive ? styles.activeLabel : styles.inactiveLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    height: theme.dimensions.tabBarHeight,
    width: 375,
    paddingHorizontal: 32,
    paddingBottom: 8,
  },
  tab: {
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    fontSize: 20,
  },
  inactiveIcon: {
    opacity: 0.4,
  },
  label: {
    fontSize: 10,
    fontWeight: theme.fontWeight.medium,
  },
  activeLabel: {
    color: theme.colors.turquoise,
  },
  inactiveLabel: {
    color: theme.colors.mediumGray,
  },
});
