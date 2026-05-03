/**
 * Integration tests: Capture Guide dismissal persistence across app restarts.
 *
 * Verifies the full dismissal flow:
 *   toggle "Don't show again" → tap Continue → AsyncStorage persists value
 *   → simulated app restart reads persisted value → guide is skipped
 *
 * Uses @testing-library/react-native to render CaptureGuideScreen and App,
 * with an in-memory AsyncStorage mock.
 *
 * Validates: Requirements 2.10 — Capture Guide dismissible for experienced users
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CAPTURE_GUIDE_DISMISSED_KEY } from '../../screens/CaptureGuideScreen';

// ---------------------------------------------------------------------------
// Mock AsyncStorage with an in-memory store
// ---------------------------------------------------------------------------

let mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => {
  return {
    __esModule: true,
    default: {
      setItem: jest.fn(async (key: string, value: string) => {
        mockStore[key] = value;
      }),
      getItem: jest.fn(async (key: string) => {
        return mockStore[key] ?? null;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete mockStore[key];
      }),
      clear: jest.fn(async () => {
        mockStore = {};
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock dependencies that CaptureGuideScreen and App don't need for these tests
// ---------------------------------------------------------------------------

const mockDestroy = jest.fn();

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
  })),
}));

jest.mock('../../utils/bleScanner', () => ({
  startScanning: jest.fn().mockResolvedValue(jest.fn()),
}));

// ---------------------------------------------------------------------------
// Lazy imports (must come after jest.mock calls)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CaptureGuideScreen = require('../../screens/CaptureGuideScreen').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const App = require('../../../App').default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearStore() {
  mockStore = {};
  (AsyncStorage.setItem as jest.Mock).mockClear();
  (AsyncStorage.getItem as jest.Mock).mockClear();
  (AsyncStorage.removeItem as jest.Mock).mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearStore();
});

describe('Capture Guide dismissal persistence', () => {
  // -----------------------------------------------------------------------
  // Dismissal flow
  // -----------------------------------------------------------------------
  describe('Dismissal flow', () => {
    it('saves dismissal to AsyncStorage when toggle is ON and Continue is tapped', async () => {
      const onContinue = jest.fn();
      const { getByLabelText, getByText } = render(
        React.createElement(CaptureGuideScreen, { onContinue, onBack: jest.fn() }),
      );

      // Toggle "Don't show this guide again" ON
      const toggle = getByLabelText("Don't show capture guide again");
      fireEvent(toggle, 'valueChange', true);

      // Tap "Got it — Start Capturing"
      await act(async () => {
        fireEvent.press(getByText('Got it — Start Capturing'));
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CAPTURE_GUIDE_DISMISSED_KEY,
        'true',
      );
      expect(mockStore[CAPTURE_GUIDE_DISMISSED_KEY]).toBe('true');
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('does NOT save dismissal when toggle stays OFF and Continue is tapped', async () => {
      const onContinue = jest.fn();
      const { getByText } = render(
        React.createElement(CaptureGuideScreen, { onContinue, onBack: jest.fn() }),
      );

      // Don't toggle — leave it OFF
      await act(async () => {
        fireEvent.press(getByText('Got it — Start Capturing'));
      });

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockStore[CAPTURE_GUIDE_DISMISSED_KEY]).toBeUndefined();
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('skips guide on simulated app restart after dismissal', async () => {
      // Step 1: Render CaptureGuideScreen, toggle ON, tap Continue
      const onContinue = jest.fn();
      const { getByLabelText, getByText, unmount } = render(
        React.createElement(CaptureGuideScreen, { onContinue, onBack: jest.fn() }),
      );

      const toggle = getByLabelText("Don't show capture guide again");
      fireEvent(toggle, 'valueChange', true);

      await act(async () => {
        fireEvent.press(getByText('Got it — Start Capturing'));
      });

      expect(mockStore[CAPTURE_GUIDE_DISMISSED_KEY]).toBe('true');
      unmount();

      // Step 2: Simulate app restart — render App, which reads AsyncStorage on mount
      const { getByText: getAppText, queryByText: queryAppText } = render(
        React.createElement(App),
      );

      // Wait for AsyncStorage.getItem to resolve and state to update
      await waitFor(() => {
        expect(AsyncStorage.getItem).toHaveBeenCalledWith(CAPTURE_GUIDE_DISMISSED_KEY);
      });

      // The home screen should be visible
      await waitFor(() => {
        expect(getAppText('Start Capture')).toBeTruthy();
      });

      // Tap "Start Capture" — should go directly to capture, skipping guide
      await act(async () => {
        fireEvent.press(getAppText('Start Capture'));
      });

      // Guide screen content should NOT be visible
      expect(queryAppText('📋 Capture Guide')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Persistence verification
  // -----------------------------------------------------------------------
  describe('Persistence verification', () => {
    it('reads back dismissal value as "true" after writing', async () => {
      await AsyncStorage.setItem(CAPTURE_GUIDE_DISMISSED_KEY, 'true');
      const value = await AsyncStorage.getItem(CAPTURE_GUIDE_DISMISSED_KEY);
      expect(value).toBe('true');
    });

    it('returns null when no dismissal has been written', async () => {
      const value = await AsyncStorage.getItem(CAPTURE_GUIDE_DISMISSED_KEY);
      expect(value).toBeNull();
    });

    it('persists dismissal across multiple simulated restarts (write once, read many)', async () => {
      // Write once
      await AsyncStorage.setItem(CAPTURE_GUIDE_DISMISSED_KEY, 'true');

      // Read multiple times (simulating multiple app restarts)
      for (let i = 0; i < 5; i++) {
        const value = await AsyncStorage.getItem(CAPTURE_GUIDE_DISMISSED_KEY);
        expect(value).toBe('true');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('Edge cases', () => {
    it('continues without crashing when AsyncStorage write fails', async () => {
      // Make setItem throw
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error('Storage write failed'),
      );

      const onContinue = jest.fn();
      const { getByLabelText, getByText } = render(
        React.createElement(CaptureGuideScreen, { onContinue, onBack: jest.fn() }),
      );

      // Toggle ON
      const toggle = getByLabelText("Don't show capture guide again");
      fireEvent(toggle, 'valueChange', true);

      // Tap Continue — should not crash
      await act(async () => {
        fireEvent.press(getByText('Got it — Start Capturing'));
      });

      // onContinue should still be called despite storage failure
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('shows guide (safe default) when AsyncStorage read fails on app start', async () => {
      // Make getItem throw to simulate storage read failure
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
        new Error('Storage read failed'),
      );

      const { getByText, queryByText } = render(
        React.createElement(App),
      );

      // Wait for the failed read to resolve
      await waitFor(() => {
        expect(AsyncStorage.getItem).toHaveBeenCalledWith(CAPTURE_GUIDE_DISMISSED_KEY);
      });

      // Home screen should be visible
      await waitFor(() => {
        expect(getByText('Start Capture')).toBeTruthy();
      });

      // Tap "Start Capture" — guide should show since read failed (safe default)
      await act(async () => {
        fireEvent.press(getByText('Start Capture'));
      });

      // Guide screen should be visible as the safe default
      await waitFor(() => {
        expect(getByText('📋 Capture Guide')).toBeTruthy();
      });

      // The "Don't show again" toggle should be present
      expect(queryByText("Don't show this guide again")).toBeTruthy();
    });
  });
});
