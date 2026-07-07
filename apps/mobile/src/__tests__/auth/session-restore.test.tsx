const mockRouterReplace = jest.fn();
let mockNeedsRedirect = false;
let mockIsAuthenticated = false;
let mockSegments: (string | undefined)[] = [''];
const mockResetRedirect = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: jest.fn(), back: jest.fn() }),
  useSegments: () => mockSegments,
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      needsRedirect: mockNeedsRedirect,
      isAuthenticated: mockIsAuthenticated,
      resetRedirect: mockResetRedirect,
    }),
}));

import { act, render } from '@testing-library/react-native';
import React from 'react';
import { InteractionManager } from 'react-native';
import { AuthRedirectWatcher } from '../../components/AuthRedirectWatcher';

describe('AuthRedirectWatcher', () => {
  beforeEach(() => {
    mockRouterReplace.mockClear();
    mockResetRedirect.mockClear();
    mockNeedsRedirect = false;
    mockIsAuthenticated = false;
    mockSegments = [''];
    // Run scheduled interactions synchronously in tests.
    jest
      .spyOn(InteractionManager, 'runAfterInteractions')
      .mockImplementation((task?: (() => void) | { gen?: () => void }) => {
        if (typeof task === 'function') task();
        return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as never;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not redirect when the user is not authenticated', async () => {
    mockIsAuthenticated = false;

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  test('redirects to /online when authenticated on a public route', async () => {
    mockIsAuthenticated = true;
    mockSegments = [''];

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/online');
  });

  test('does not redirect to /online when authenticated on a private route', async () => {
    mockIsAuthenticated = true;
    mockSegments = ['online'];

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/online');
  });
});
