import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import type { DriverStatus } from '../api/types';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { STEP_ROUTE, routeForDriverStatus } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';

const PUBLIC_ROUTES = ['', 'register', 'forgot-password'];

export function AuthRedirectWatcher() {
  const needsRedirect = useAuthStore((s) => s.needsRedirect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);
  const driverStatus = useAuthStore((s) => s.driverStatus);
  const resetRedirect = useAuthStore((s) => s.resetRedirect);
  const router = useRouter();
  const segments = useSegments();
  const { replace } = useAppNavigation();

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

  // When an authenticated user lands on a public route (app cold start, deep
  // link, etc.), route them to their real onboarding stage — NOT blindly to the
  // app home. This is what keeps a half-onboarded driver on the KYC gate
  // instead of letting them slip into the app with identity unverified.
  useEffect(() => {
    if (!isAuthenticated || !PUBLIC_ROUTES.includes(segments[0] ?? '')) return;

    const target = onboardingStep ? STEP_ROUTE[onboardingStep] : undefined;
    const fallback = routeForDriverStatus({
      status: driverStatus ?? 'pending',
      step: onboardingStep as DriverStatus['step'],
    });
    const screen = target?.screen || fallback.screen || 'OnboardingStep1';

    InteractionManager.runAfterInteractions(() => {
      replace(screen);
    });
  }, [isAuthenticated, segments, onboardingStep, driverStatus, replace]);

  return null;
}
