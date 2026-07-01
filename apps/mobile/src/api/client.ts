import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import type { z } from 'zod';
import { useAuthStore } from '../store/authStore';
import { ApiError, apiErrorSchema } from './types';

function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && !host.includes('ngrok')) return `http://${host}:3000/api`;
  }

  return 'http://localhost:3000/api';
}

const API_URL = getApiUrl();

if (__DEV__) {
  console.log('[API] Backend URL:', API_URL);
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export async function getValidated<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const response = await apiClient.get(url);
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new ApiError({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'La respuesta del servidor no coincide con el formato esperado.',
        status: 500,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
  return parsed.data;
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        let newToken: string | null = null;
        let newRefreshToken: string | null = null;

        try {
          const { data } = await apiClient.post('/auth/refresh', {
            refresh_token: refreshToken,
          });
          if (data?.access_token) {
            newToken = data.access_token;
            newRefreshToken = data.refresh_token ?? refreshToken;
          }
        } catch {
          // backend refresh failed
        }

        if (!newToken) {
          throw new Error('Refresh failed');
        }

        useAuthStore.getState().setTokens(newToken, newRefreshToken ?? refreshToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.data) {
      const parsed = apiErrorSchema.safeParse(error.response.data);
      if (parsed.success) {
        return Promise.reject(new ApiError(parsed.data));
      }
      return Promise.reject(
        new ApiError({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error inesperado del servidor.',
            status: error.response.status,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      );
    }

    if (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ERR_TIMEOUT' ||
      error.code === 'ERR_CANCELED'
    ) {
      const errorMap: Record<string, string> = {
        ERR_NETWORK: 'Sin conexion. Verifica que el backend este corriendo y tu internet funcione.',
        ERR_TIMEOUT: 'Tiempo de espera agotado. El servidor no responde.',
        ERR_CANCELED: 'Solicitud cancelada.',
      };
      return Promise.reject(
        new ApiError({
          error: {
            code: 'NETWORK_ERROR',
            message: errorMap[error.code] ?? 'Sin conexion. Verifica tu internet.',
            status: 0,
          },
          meta: { timestamp: new Date().toISOString() },
        }),
      );
    }

    return Promise.reject(error);
  },
);
