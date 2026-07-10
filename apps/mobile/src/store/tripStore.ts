import { create } from 'zustand';
import type { TripStatus } from '../api/types';

export type { TripStatus };

interface TripState {
  activeTripId: string | null;
  tripStatus: TripStatus | null;
  setActiveTrip: (tripId: string, status: TripStatus) => void;
  setTripStatus: (status: TripStatus) => void;
  clearTrip: () => void;
}

export const useTripStore = create<TripState>()((set) => ({
  activeTripId: null,
  tripStatus: null,
  setActiveTrip: (activeTripId, tripStatus) => set({ activeTripId, tripStatus }),
  setTripStatus: (tripStatus) => set({ tripStatus }),
  clearTrip: () => set({ activeTripId: null, tripStatus: null }),
}));
