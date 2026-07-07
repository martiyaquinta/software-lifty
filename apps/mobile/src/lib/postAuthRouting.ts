import { apiClient } from '../api/client';
import type { DriverStatus } from '../api/types';
import { driverStatusSchema } from '../api/types';
import { useAuthStore } from '../store/authStore';

type DriverStatusValue = DriverStatus['status'] | null;

// Maps the backend driver status (+ onboarding step) to the screen the user
// should land on right after authenticating.
const STATUS_ROUTE: Record<string, { screen: string; storeStatus: DriverStatusValue }> = {
  'pending:step1': { screen: 'Terms', storeStatus: 'pending' },
  'pending:step2': { screen: 'OnboardingStep1', storeStatus: 'pending' },
  'pending:step3': { screen: 'OnboardingStep2', storeStatus: 'pending' },
  pending: { screen: 'Terms', storeStatus: 'pending' },
  under_review: { screen: 'UnderReview', storeStatus: 'under_review' },
  approved: { screen: 'Online', storeStatus: 'approved' },
  rejected: { screen: '', storeStatus: 'rejected' },
  suspended: { screen: '', storeStatus: 'suspended' },
};

export interface PostAuthRoute {
  /** Target screen name (empty string when the account is blocked). */
  screen: string;
  status: DriverStatusValue;
  /** Present when the account cannot proceed (rejected / suspended). */
  blockedMessage?: string;
}

/**
 * Resolves where a freshly-authenticated user goes next.
 *
 * Hitting `/drivers/me/status` also triggers backend profile creation: the auth
 * middleware upserts the `users` row keyed by the Supabase user id, so a new
 * user gets a profile automatically (no duplicates) and is routed into the
 * onboarding flow. Existing users are routed straight to their current stage.
 */
export async function resolvePostAuthRoute(): Promise<PostAuthRoute> {
  try {
    const { data: body } = await apiClient.get('/drivers/me/status');
    const payload = body?.data ?? body;
    const parsed = driverStatusSchema.safeParse(payload);
    const driverData = parsed.success ? parsed.data : (payload as DriverStatus);
    const status = driverData.status;
    const step = driverData.step;

    if (status) {
      useAuthStore.getState().setDriverStatus(status);
    }

    if (status === 'rejected') {
      return {
        screen: '',
        status,
        blockedMessage: 'Tu cuenta ha sido rechazada. Contacta a soporte.',
      };
    }
    if (status === 'suspended') {
      return { screen: '', status, blockedMessage: 'Tu cuenta ha sido suspendida.' };
    }

    const key = step ? `${status}:${step}` : status;
    const route = STATUS_ROUTE[key] ?? STATUS_ROUTE.approved;
    return { screen: route.screen, status: route.storeStatus };
  } catch {
    // Just authenticated but status could not be read (new user / transient
    // error) — send them to the onboarding entry so they can complete setup.
    useAuthStore.getState().setDriverStatus('pending');
    return { screen: 'Terms', status: 'pending' };
  }
}
