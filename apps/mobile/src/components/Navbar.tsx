import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

interface NavbarProps {
  title: string;
  onBack?: () => void;
  showBack?: boolean;
  backgroundColor?: string;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  onBack,
  showBack = true,
  backgroundColor = theme.colors.deepBlue,
  rightElement,
  style,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: insets.top,
          height: theme.dimensions.navbarHeight + insets.top,
        },
        style,
      ]}
    >
      {showBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backText, { color: theme.colors.white }]}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
      <Text style={styles.title}>{title}</Text>
      {rightElement ? rightElement : <View style={styles.placeholder} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: theme.dimensions.navbarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    width: '100%',
  },
  backButton: {
    padding: theme.spacing.xs,
    minWidth: 40,
  },
  backText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  title: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    minWidth: 40,
  },
});
