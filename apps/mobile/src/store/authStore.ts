import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type DriverStatusValue = 'pending' | 'approved' | 'under_review' | 'rejected' | 'suspended' | null;

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  driverId: string | null;
  isAuthenticated: boolean;
  needsRedirect: boolean;
  phone: string | null;
  driverStatus: DriverStatusValue;
  setTokens: (token: string, refreshToken: string) => void;
  setDriverId: (driverId: string) => void;
  clearAuth: () => void;
  resetRedirect: () => void;
  setPhone: (phone: string) => void;
  setDriverStatus: (status: DriverStatusValue) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      driverId: null,
      isAuthenticated: false,
      needsRedirect: false,
      phone: null,
      driverStatus: null,
      setTokens: (token, refreshToken) => set({ token, refreshToken, isAuthenticated: true }),
      setDriverId: (driverId) => set({ driverId }),
      clearAuth: () =>
        set({
          token: null,
          refreshToken: null,
          driverId: null,
          isAuthenticated: false,
          needsRedirect: true,
          phone: null,
          driverStatus: null,
        }),
      resetRedirect: () => set({ needsRedirect: false }),
      setPhone: (phone) => set({ phone }),
      setDriverStatus: (driverStatus) => set({ driverStatus }),
    }),
    {
      name: 'lifty-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        driverId: state.driverId,
        isAuthenticated: state.isAuthenticated,
        driverStatus: state.driverStatus,
      }),
    },
  ),
);
