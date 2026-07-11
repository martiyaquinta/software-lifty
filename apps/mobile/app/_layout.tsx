import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { AppInitializer } from '../src/components/AppInitializer';
import { ConnectivityBanner } from '../src/components/feedback/ConnectivityBanner';
import { ErrorBoundary } from '../src/components/feedback/ErrorBoundary';
import { AuthProvider } from '../src/context/AuthContext';
import { queryClient } from '../src/lib/queryClient';
import { theme } from '../src/theme';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <View style={styles.root}>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: theme.colors.white },
              }}
            />
            <AppInitializer />
            <ConnectivityBanner />
          </View>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
