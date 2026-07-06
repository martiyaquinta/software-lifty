import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import WebView from 'react-native-webview/lib/WebView';
import type { WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

// Must match DIDIT_CALLBACK_URL configured on the backend. DIDIT redirects the
// hosted flow here (with ?status=&verificationSessionId=) when it finishes.
const CALLBACK_PREFIX = 'https://lifty.app/kyc/callback';

export const KYCWebViewScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { url } = useLocalSearchParams<{ url: string }>();
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  const finish = () => {
    if (done) return;
    setDone(true);
    navigation.replace('UnderReview');
  };

  const handleRequest = (request: WebViewNavigation): boolean => {
    if (request.url.startsWith(CALLBACK_PREFIX)) {
      finish();
      return false;
    }
    return true;
  };

  if (!url) {
    return (
      <View style={styles.container}>
        <Navbar title="Verificacion" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>No se pudo abrir la verificacion.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Verificacion" onBack={() => navigation.goBack()} />
      <WebView
        source={{ uri: url }}
        onShouldStartLoadWithRequest={handleRequest}
        onNavigationStateChange={(navState) => {
          if (navState.url.startsWith(CALLBACK_PREFIX)) finish();
        }}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        style={styles.webview}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  webview: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
});
