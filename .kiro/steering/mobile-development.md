---
inclusion: fileMatch
fileMatchPattern: "mobile/**"
---

# Mobile Development Guide

## Framework
Expo (React Native) with TypeScript. iOS-first, Android later.

## Running the App
```bash
cd mobile/ios-app
npm install
npx expo start
```
Scan the QR code with your iPhone camera to open in Expo Go.
Unfortunately, the iPhone testing is limited, we will be doing majority web based testing.

## Screen Flow
1. **HomeScreen** → entry point, "Start Capture" button, "Pair Desktop" button
2. **CaptureGuideScreen** → instructions on how to photograph a room (skipped if user toggled "Don't show again" via AsyncStorage)
3. **CaptureScreen** → camera/gallery/file-manager capture with progress bar (min 4, recommended 8-12)
4. **ReviewScreen** → image grid, remove individual images, transfer to desktop
5. **PairingScreen** → BLE scanning, discovered device list with signal strength, "Connect" button per device

## Image Validation Rules
- Minimum resolution: 480×480 pixels
- Accepted formats: JPEG, PNG, HEIC
- Images below minimum are rejected with a user-facing alert

## Key Packages
- `expo-image-picker` — camera and gallery access
- `expo-document-picker` — file manager import from other apps or file sources
- `expo-camera` — direct camera control (for future use)
- `expo-file-system` — local file operations
- `@react-native-async-storage/async-storage` — persistent key-value storage (capture guide dismissal)
- `@testing-library/react-native` — component testing for React Native screens
- `react-native-ble-plx` — BLE discovery and pairing with desktop (installed, configured as Expo plugin)
- `tweetnacl` — X25519 ECDH key exchange for deriving shared AES-256-GCM encryption keys during BLE pairing
- `expo-crypto` — secure random byte generation for cryptographic operations

## Adding New Screens
1. Create the component in `src/screens/NewScreen.tsx`
2. Add the screen name to the `Screen` type union in `App.tsx`
3. Add state and navigation logic in `App.tsx`
4. Update this steering doc and the mobile README

## Bluetooth
- **BLE (discovery/pairing)**: `react-native-ble-plx` — installed and configured in app.json as an Expo config plugin with `central` mode. iOS Bluetooth permissions set via `infoPlist`.
- **BLE permissions**: `src/utils/blePermissions.ts` — `checkBlePermission()` and `requestBlePermission()` for all iOS CBCentralManager states.
- **BLE scanning**: `src/utils/bleScanner.ts` — `startScanning()` and `stopScanning()`, filtered by Room Vision AI service UUID, deduplicates devices.
- **ECDH key exchange**: `src/utils/bleKeyExchange.ts` — X25519 key pair generation and shared secret derivation via `tweetnacl`.
- **Pairing persistence**: `src/utils/blePairingStore.ts` — save/load/clear pairing info (device ID, keys) in AsyncStorage.
- **Connection state**: `src/utils/bleConnectionManager.ts` — `ConnectionState` type, status helpers, display helpers (message + color).
- **Connection status UI**: `src/components/ConnectionStatusBar.tsx` — compact status bar with colored dot + message.
- **Auto-reconnect**: `src/utils/bleAutoReconnect.ts` — up to 3 attempts at 5-second intervals, cancelable.
- **Failure notification**: `src/utils/bleReconnectNotification.ts` — Alert with "Re-pair" option after reconnect failure.
- **Unpair**: `src/utils/bleUnpair.ts` — confirmation dialog + clear stored pairing data.
- **Bulk transfer**: Custom RFCOMM bridge for large image transfers (upcoming).
- **Encryption**: AES-256-GCM via shared key from ECDH exchange (upcoming).
- **Note**: `react-native-ble-plx` requires a development build (`npx expo prebuild` + native build) — it does not work in Expo Go.
