import { useRouter } from 'expo-router';

const SCREEN_TO_ROUTE: Record<string, string> = {
  Welcome: '/',
  Register: '/register',
  LoginPhone: '/login-phone',
  LoginOTP: '/login-otp',
  LoginCredentials: '/login-credentials',
  ForgotPassword: '/forgot-password',
  Terms: '/terms',
  OnboardingStep1: '/onboarding-step1',
  OnboardingStep2: '/onboarding-step2',
  UploadDocument: '/upload-document',
  KYCVerify: '/kyc-verify',
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
};

type RouteParams = Record<string, string>;

export function useAppNavigation() {
  const router = useRouter();
  return {
    navigate: (screen: string, params?: RouteParams) => {
      const route = SCREEN_TO_ROUTE[screen];
      if (!route) return;
      if (params) {
        router.push({ pathname: route as any, params });
      } else {
        router.push(route as any);
      }
    },
    goBack: () => router.back(),
    replace: (screen: string, params?: RouteParams) => {
      const route = SCREEN_TO_ROUTE[screen];
      if (!route) return;
      if (params) {
        router.replace({ pathname: route as any, params });
      } else {
        router.replace(route as any);
      }
    },
  };
}
