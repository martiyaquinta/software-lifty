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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const { data } = await apiClient.post('/auth/verify', { email, code });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useResendCode() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data } = await apiClient.post('/auth/resend-code', { email });
      return data as { message: string };
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data } = await apiClient.post('/auth/forgot-password', { email });
      return data as { message: string };
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({
      email,
      code,
      password,
    }: {
      email: string;
      code: string;
      password: string;
    }) => {
      const { data } = await apiClient.post('/auth/reset-password', { email, code, password });
      return data as { message: string };
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
    onSuccess: (data) => {
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
