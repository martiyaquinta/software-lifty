import { create } from 'zustand';

type TripStatus =
  | 'requested'
  | 'accepted'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

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
