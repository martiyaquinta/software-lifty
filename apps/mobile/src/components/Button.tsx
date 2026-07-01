import type React from 'react';
import {
  ActivityIndicator,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'cta';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: {
      backgroundColor: theme.colors.turquoise,
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
    },
    text: {
      color: theme.colors.white,
    },
  },
  secondary: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
      borderWidth: 1.5,
      borderColor: theme.colors.mediumGray,
    },
    text: {
      color: theme.colors.mediumGray,
    },
  },
  danger: {
    container: {
      backgroundColor: 'transparent',
      height: theme.dimensions.buttonHeight,
      borderRadius: theme.radius.buttonRadius,
      borderWidth: 1.5,
      borderColor: theme.colors.dangerRed,
    },
    text: {
      color: theme.colors.dangerRed,
    },
  },
  cta: {
    container: {
      backgroundColor: theme.colors.turquoise,
      height: theme.dimensions.buttonCTAHeight,
      borderRadius: theme.radius.buttonRadius,
    },
    text: {
      color: theme.colors.white,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
  },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const variantStyle = variantStyles[variant];

  return (
    <TouchableOpacity
      style={[styles.container, variantStyle.container, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text.color} />
      ) : (
        <Text style={[styles.text, variantStyle.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 327,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  disabled: {
    opacity: 0.4,
  },
});
