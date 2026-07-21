import { create } from 'zustand';
import type { Trip, TripStatus } from '../api/types';

export type { TripStatus };

interface TripState {
  activeTripId: string | null;
  tripStatus: TripStatus | null;
  trip: Trip | null;
  setActiveTrip: (trip: Trip) => void;
  setTripStatus: (status: TripStatus) => void;
  clearTrip: () => void;
}

export const useTripStore = create<TripState>()((set) => ({
  activeTripId: null,
  tripStatus: null,
  trip: null,
  setActiveTrip: (trip) =>
    set({
      activeTripId: trip.id,
      tripStatus: trip.status,
      trip,
    }),
  setTripStatus: (tripStatus) => set({ tripStatus }),
  clearTrip: () => set({ activeTripId: null, tripStatus: null, trip: null }),
}));
