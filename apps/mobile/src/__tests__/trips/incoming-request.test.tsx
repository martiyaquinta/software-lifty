const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('../../api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

const mockNavigate = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../lib/location', () => ({ stopTracking: jest.fn() }));

jest.mock('../../components/MapView', () => ({ MapView: () => null }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { IncomingRequestScreen } from '../../screens/IncomingRequestScreen';
import { useTripStore } from '../../store/tripStore';

const REAL_TRIP = {
  id: 'trip-real-1',
  driver_id: 'driver-1',
  passenger_id: 'pax-1',
  status: 'request_received',
  origin_address: 'Origen Real 123',
  origin_lat: -31.4,
  origin_lng: -64.1,
  dest_address: 'Destino Real 456',
  dest_lat: -31.5,
  dest_lng: -64.2,
  distance_km: 5,
  duration_minutes: 12,
  base_fare: 500,
  distance_fare: 1000,
  time_fare: 500,
  total_fare: 2000,
  platform_fee: 400,
  driver_earnings: 1600,
  payment_method: 'cash',
  is_collected: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('IncomingRequestScreen', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockNavigate.mockReset();
    useTripStore.getState().clearTrip();
    mockGet.mockResolvedValue({ data: REAL_TRIP });
    mockPost.mockResolvedValue({ data: { ...REAL_TRIP, status: 'accepted' } });
    mockPut.mockResolvedValue({ data: {} });
  });

  test('fetches the real active trip on mount (no mock id)', async () => {
    await act(async () => {
      render(<IncomingRequestScreen />);
    });
    expect(mockGet).toHaveBeenCalledWith('/trips/active');
  });

  test('shows real trip data, not hardcoded mock values', async () => {
    const { getByText, queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('Origen Real 123')).toBeTruthy());
    expect(getByText('Destino Real 456')).toBeTruthy();
    expect(queryByText('Av. San Martin 450')).toBeNull();
    expect(queryByText('Terminal de Omnibus')).toBeNull();
  });

  test('accept uses the real /accept endpoint with the real trip id', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-real-1/accept');
    });
    expect(mockNavigate).toHaveBeenCalledWith('Navigation');
    expect(useTripStore.getState().tripStatus).toBe('accepted');
    expect(useTripStore.getState().trip).not.toBeNull();
    expect(useTripStore.getState().trip?.id).toBe('trip-real-1');
  });

  test('reject uses the real /reject endpoint with the real trip id', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('Rechazar')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText('Rechazar'));
    });
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-real-1/reject');
    });
  });
});
