import { create } from 'zustand';

interface OnlineState {
  isOnline: boolean;
  heartbeatIntervalRef: ReturnType<typeof setInterval> | null;
  setOnline: (value: boolean) => void;
  setHeartbeatRef: (ref: ReturnType<typeof setInterval> | null) => void;
}

export const useOnlineStore = create<OnlineState>()((set) => ({
  isOnline: false,
  heartbeatIntervalRef: null,
  setOnline: (isOnline) => set({ isOnline }),
  setHeartbeatRef: (heartbeatIntervalRef) => set({ heartbeatIntervalRef }),
}));
