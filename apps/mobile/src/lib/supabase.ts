import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { useAuthStore } from '../store/authStore';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase needs the app foreground state to drive token auto-refresh.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// Keep the Zustand auth store in sync with the Supabase session. This fires
// on sign-in, sign-out, token refresh, and initial session restore.
supabase.auth.onAuthStateChange((event, session) => {
  const store = useAuthStore.getState();
  if (session?.access_token) {
    store.setSession(session.access_token, session.user?.id ?? null);
  } else if (event === 'SIGNED_OUT') {
    store.clearAuth();
  }
});
