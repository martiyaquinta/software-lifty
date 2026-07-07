import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type DriverStatusValue = 'pending' | 'approved' | 'under_review' | 'rejected' | 'suspended' | null;

interface AuthState {
  token: string | null;
  driverId: string | null;
  isAuthenticated: boolean;
  needsRedirect: boolean;
  phone: string | null;
  driverStatus: DriverStatusValue;
  kycSessionId: string | null;
  setSession: (token: string | null, userId?: string | null) => void;
  setDriverId: (driverId: string) => void;
  clearAuth: () => void;
  resetRedirect: () => void;
  setPhone: (phone: string) => void;
  setDriverStatus: (status: DriverStatusValue) => void;
  setKycSessionId: (sessionId: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      driverId: null,
      isAuthenticated: false,
      needsRedirect: false,
      phone: null,
      driverStatus: null,
      kycSessionId: null,
      setSession: (token, userId) =>
        set((state) => ({
          token,
          isAuthenticated: !!token,
          driverId: userId ?? state.driverId,
        })),
      setDriverId: (driverId) => set({ driverId }),
      clearAuth: () =>
        set({
          token: null,
          driverId: null,
          isAuthenticated: false,
          needsRedirect: true,
          phone: null,
          driverStatus: null,
          kycSessionId: null,
        }),
      resetRedirect: () => set({ needsRedirect: false }),
      setPhone: (phone) => set({ phone }),
      setDriverStatus: (driverStatus) => set({ driverStatus }),
      setKycSessionId: (kycSessionId) => set({ kycSessionId }),
    }),
    {
      name: 'lifty-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        driverId: state.driverId,
        isAuthenticated: state.isAuthenticated,
        driverStatus: state.driverStatus,
        kycSessionId: state.kycSessionId,
      }),
    },
  ),
);
