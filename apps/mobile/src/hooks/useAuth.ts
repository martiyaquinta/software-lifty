import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data } = await apiClient.post('/auth/register', { email, password });
      return data;
    },
  });
}

export function useVerifyEmail() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setDriverId = useAuthStore((s) => s.setDriverId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const { data } = await apiClient.post('/auth/verify', { email, code });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries();
    },
  });
}

export function useLogin() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setDriverId = useAuthStore((s) => s.setDriverId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data } = await apiClient.post('/auth/login', { email, password });
      return data as {
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string; role: string };
      };
    },
    onSuccess: (data) => {
      setTokens(data.access_token, data.refresh_token);
      setDriverId(data.user.id);
      queryClient.invalidateQueries();
    },
  });
}

export function useRefreshToken() {
  const setTokens = useAuthStore((s) => s.setTokens);

  return useMutation({
    mutationFn: async (refreshToken: string) => {
      const { data } = await apiClient.post('/auth/refresh', { refresh_token: refreshToken });
      return data as { access_token: string; refresh_token: string };
    },
    onSuccess: (data, oldToken) => {
      setTokens(data.access_token, data.refresh_token);
    },
  });
}

export function useSignOut() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (token) {
        try {
          await apiClient.post('/auth/logout');
        } catch {
          /* best-effort */
        }
      }
    },
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
    },
  });
}
