import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useAuthStore } from '../store/authStore';

const PUBLIC_ROUTES = ['', 'register', 'forgot-password'];

export function AuthRedirectWatcher() {
  const needsRedirect = useAuthStore((s) => s.needsRedirect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const resetRedirect = useAuthStore((s) => s.resetRedirect);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (needsRedirect) {
      resetRedirect();
      if (segments[0] !== undefined) {
        InteractionManager.runAfterInteractions(() => {
          router.replace('/');
        });
      }
    }
  }, [needsRedirect, resetRedirect, router, segments]);

  useEffect(() => {
    if (isAuthenticated && PUBLIC_ROUTES.includes(segments[0] ?? '')) {
      InteractionManager.runAfterInteractions(() => {
        router.replace('/online');
      });
    }
  }, [isAuthenticated, segments, router]);

  return null;
}
