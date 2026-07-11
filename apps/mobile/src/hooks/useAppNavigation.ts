import { useRouter } from 'expo-router';

const SCREEN_TO_ROUTE = {
  Welcome: '/',
  Auth: '/auth',
  Register: '/register',
  LoginPhone: '/login-phone',
  LoginOTP: '/login-otp',
  LoginCredentials: '/login-credentials',
  ForgotPassword: '/forgot-password',
  Terms: '/terms',
  OnboardingStep1: '/onboarding-step1',
  OnboardingStep2: '/onboarding-step2',
  OnboardingVehicle: '/onboarding-vehicle',
  UploadDocument: '/upload-document',
  KYCVerify: '/kyc-verify',
  KYCWebView: '/kyc-webview',
  DNIScan: '/dni-scan',
  Selfie: '/selfie',
  UnderReview: '/under-review',
  Online: '/online',
  Active: '/active',
  IncomingRequest: '/incoming-request',
  Navigation: '/navigation',
  WaitingPassenger: '/waiting-passenger',
  TripInProgress: '/trip-in-progress',
  TripComplete: '/trip-complete',
  Earnings: '/earnings',
  Profile: '/profile',
  PaymentMethod: '/payment-method',
} as const;

export type ScreenName = keyof typeof SCREEN_TO_ROUTE;

export interface ScreenParams {
  KYCWebView: { url: string };
  UploadDocument: { docType: string; docLabel: string; mode?: string };
  TripComplete: { amount?: string; commission?: string; driverEarnings?: string };
}

export function useAppNavigation() {
  const router = useRouter();

  const push = (screen: string, params?: Record<string, string>) => {
    const route = SCREEN_TO_ROUTE[screen as ScreenName];
    if (!route) return;
    if (params && Object.keys(params).length > 0) {
      router.push({ pathname: route, params });
    } else {
      router.push(route);
    }
  };

  const replace = (screen: string, params?: Record<string, string>) => {
    const route = SCREEN_TO_ROUTE[screen as ScreenName];
    if (!route) return;
    if (params && Object.keys(params).length > 0) {
      router.replace({ pathname: route, params });
    } else {
      router.replace(route);
    }
  };

  return {
    navigate: push,
    goBack: () => router.back(),
    replace,
  };
}
