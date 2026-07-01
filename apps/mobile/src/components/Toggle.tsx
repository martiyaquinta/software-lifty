import type React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';

interface ToggleProps {
  value: boolean;
  onToggle: (value: boolean) => void;
}

export const Toggle: React.FC<ToggleProps> = ({ value, onToggle }) => {
  return (
    <TouchableOpacity
      style={[styles.container, value && styles.containerActive]}
      onPress={() => onToggle(!value)}
      activeOpacity={0.8}
    >
      <View style={[styles.thumb, value ? styles.thumbActive : styles.thumbInactive]} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 52,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.mediumGray,
    justifyContent: 'center',
    padding: theme.spacing.xs,
  },
  containerActive: {
    backgroundColor: theme.colors.turquoise,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
  },
  thumbActive: {
    alignSelf: 'flex-end',
  },
  thumbInactive: {
    alignSelf: 'flex-start',
  },
});
