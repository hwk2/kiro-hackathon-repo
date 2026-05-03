import { Platform } from 'react-native';
import { isWeb, isNative } from '../utils/platformDetect';

describe('platformDetect', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    // Restore original Platform.OS
    Object.defineProperty(Platform, 'OS', { value: originalOS });
  });

  describe('isWeb', () => {
    it('returns true when Platform.OS is "web"', () => {
      Object.defineProperty(Platform, 'OS', { value: 'web' });
      expect(isWeb()).toBe(true);
    });

    it('returns false when Platform.OS is "ios"', () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      expect(isWeb()).toBe(false);
    });

    it('returns false when Platform.OS is "android"', () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      expect(isWeb()).toBe(false);
    });
  });

  describe('isNative', () => {
    it('returns true when Platform.OS is "ios"', () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      expect(isNative()).toBe(true);
    });

    it('returns true when Platform.OS is "android"', () => {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      expect(isNative()).toBe(true);
    });

    it('returns false when Platform.OS is "web"', () => {
      Object.defineProperty(Platform, 'OS', { value: 'web' });
      expect(isNative()).toBe(false);
    });
  });
});
