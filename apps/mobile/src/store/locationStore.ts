import { create } from 'zustand';

interface LocationState {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  setLocation: (lat: number, lng: number, heading?: number | null) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  lat: null,
  lng: null,
  heading: null,
  setLocation: (lat, lng, heading = null) => set({ lat, lng, heading }),
  clearLocation: () => set({ lat: null, lng: null, heading: null }),
}));
