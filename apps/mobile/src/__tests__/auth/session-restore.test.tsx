const mockReplace = jest.fn();

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({
    navigate: jest.fn(),
    replace: mockReplace,
    goBack: jest.fn(),
  }),
}));

let mockIsAuthenticated = false;
let mockToken: string | null = null;

jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      token: mockToken,
      refreshToken: null,
      driverId: null,
      isAuthenticated: mockIsAuthenticated,
      needsRedirect: false,
      phone: null,
      driverStatus: null,
      setTokens: jest.fn(),
      setDriverId: jest.fn(),
      clearAuth: jest.fn(),
      resetRedirect: jest.fn(),
      setPhone: jest.fn(),
      setDriverStatus: jest.fn(),
    };
    return selector(state);
  },
}));

jest.mock('../../components/Button', () => ({
  Button: () => null,
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  })),
}));

import { act, render } from '@testing-library/react-native';
import React from 'react';
import { WelcomeScreen } from '../../screens/WelcomeScreen';

describe('WelcomeScreen auth redirect', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockIsAuthenticated = false;
    mockToken = null;
  });

  test('displays normally when user has no token', async () => {
    mockIsAuthenticated = false;
    mockToken = null;

    await act(async () => {
      render(React.createElement(WelcomeScreen));
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('redirects to Online when isAuthenticated is true', async () => {
    mockIsAuthenticated = true;
    mockToken = 'valid-token';

    await act(async () => {
      render(React.createElement(WelcomeScreen));
    });

    expect(mockReplace).toHaveBeenCalledWith('Online');
  });
});
