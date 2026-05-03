# Room Vision AI — Mobile App (Member 1)

Cross-platform mobile app for capturing room images and transferring them to the desktop visualization engine over encrypted Bluetooth. Built with **Expo (React Native)** and **TypeScript**.

## Current Status

- ✅ Expo project scaffolded (TypeScript)
- ✅ Home screen with capture flow entry
- ✅ Capture Guide screen (instructions, tips, minimum requirements, dismiss for future sessions)
- ✅ Capture screen (camera + gallery + file manager import, resolution validation, progress tracking)
- ✅ Review screen (image grid, metadata display, remove/clear, transfer placeholder)
- ✅ BLE library installed and configured (`react-native-ble-plx` with Expo plugin + iOS permissions)
- ✅ BLE permission request flow (iOS CBCentralManager authorization check/request)
- ✅ BLE scanning and device discovery with PairingScreen UI
- ✅ Pairing confirmation dialog, ECDH key exchange, pairing persistence
- ✅ Connection status display (ConnectionStatusBar component)
- ✅ Auto-reconnect (3 attempts at 5s intervals), failure notification with re-pair option
- ✅ Unpair action (confirmation dialog, clear stored pairing data)
- ✅ BLE transport layer (chunked writes over BLE characteristics)
- ✅ Authenticated encryption (XSalsa20-Poly1305 via tweetnacl)
- ✅ Bluetooth protocol message envelope (v1.0, typed payloads, JSON serialization)
- ✅ Image transfer message builder (encrypted data + checksum + metadata)
- ✅ Sequential batch transfer with per-image progress
- ✅ Transfer progress UI (TransferProgressView component)
- ✅ Transfer ack handling (checksum verification from desktop)
- ✅ Auto-retry on checksum mismatch (up to 2 retries per image)
- ✅ Transfer failure notification with manual retry option
- ✅ Protocol version validation with error response
- ✅ Integration tests: end-to-end pipeline, gallery formats, resolution rejection
- ✅ Integration tests: Bluetooth pairing (Windows + macOS), auto-reconnect, batch transfer
- ✅ Integration tests: capture guide dismissal persistence, data privacy verification
- 🔲 Android-specific testing (iOS-first approach)

## Tech Stack

- **Framework**: Expo SDK (React Native)
- **Language**: TypeScript
- **Key packages**: expo-camera, expo-image-picker, expo-document-picker, expo-file-system, expo-crypto, @react-native-async-storage/async-storage, react-native-ble-plx, tweetnacl
- **Target**: iOS first, Android later

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo Go app installed on your iPhone (free from App Store)
- iPhone and development machine on the same Wi-Fi network

### Install & Run

```bash
cd mobile/ios-app
npm install
npx expo start
```

This starts the Expo dev server. You'll see a QR code in the terminal.

### Get It On Your iPhone

1. Open the **Camera app** on your iPhone
2. Point it at the QR code shown in the terminal
3. Tap the notification banner to open in **Expo Go**
4. The app loads directly on your phone — no Mac or Xcode needed

### Troubleshooting

- **"Network response timed out"**: Make sure your phone and computer are on the same Wi-Fi network
- **QR code not scanning**: Press `s` in the terminal to switch to Expo Go mode, or type the URL manually in Expo Go
- **Camera not working**: Expo Go needs camera permissions — check Settings → Expo Go → Camera

## Project Structure

```
mobile/ios-app/
├── App.tsx                          # Root component, screen navigation, image state
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx           # Landing screen with "Start Capture" and "Pair Desktop" buttons
│   │   ├── CaptureGuideScreen.tsx   # Step-by-step capture instructions
│   │   ├── CaptureScreen.tsx        # Camera/gallery/file-manager capture with progress bar
│   │   ├── ReviewScreen.tsx         # Image grid review, remove, transfer
│   │   └── PairingScreen.tsx        # BLE device discovery and connection UI
│   ├── utils/
│   │   ├── imageValidation.ts       # Image resolution/format validation helpers
│   │   ├── blePermissions.ts        # BLE permission check/request for iOS
│   │   ├── bleScanner.ts            # BLE scanning and device discovery
│   │   ├── bleKeyExchange.ts        # ECDH key exchange for AES-256-GCM encryption
│   │   ├── blePairingStore.ts       # Pairing info persistence via AsyncStorage
│   │   ├── bleConnectionManager.ts  # Connection state types and display helpers
│   │   ├── bleAutoReconnect.ts      # Auto-reconnect (3 attempts, 5s intervals)
│   │   ├── bleReconnectNotification.ts # Failure notification with re-pair option
│   │   ├── bleUnpair.ts             # Unpair confirmation and data cleanup
│   │   ├── bleTransport.ts          # BLE transport abstraction (chunked writes)
│   │   ├── bleEncryption.ts         # Authenticated encryption (XSalsa20-Poly1305)
│   │   ├── bleProtocol.ts           # Protocol message envelope (v1.0)
│   │   ├── bleImageTransfer.ts      # Image transfer message builder
│   │   ├── bleTransferManager.ts    # Sequential batch transfer with progress
│   │   ├── bleAckHandler.ts         # Transfer ack parsing and verification
│   │   ├── bleRetryTransfer.ts      # Auto-retry on checksum mismatch
│   │   ├── bleTransferFailureNotification.ts # Transfer failure Alert
│   │   └── bleVersionValidator.ts   # Protocol version validation
│   ├── components/
│   │   ├── ConnectionStatusBar.tsx  # Reusable BLE connection status indicator
│   │   └── TransferProgressView.tsx # Image transfer progress display
│   └── __tests__/
│       ├── imageValidation.test.ts
│       ├── blePermissions.test.ts
│       ├── bleScanner.test.ts
│       ├── bleKeyExchange.test.ts
│       ├── blePairingStore.test.ts
│       ├── bleConnectionManager.test.ts
│       ├── bleAutoReconnect.test.ts
│       ├── bleReconnectNotification.test.ts
│       ├── bleUnpair.test.ts
│       ├── bleTransport.test.ts
│       ├── bleEncryption.test.ts
│       ├── bleProtocol.test.ts
│       ├── bleImageTransfer.test.ts
│       ├── bleTransferManager.test.ts
│       ├── bleAckHandler.test.ts
│       ├── bleRetryTransfer.test.ts
│       ├── bleTransferFailureNotification.test.ts
│       ├── bleVersionValidator.test.ts
│       ├── TransferProgressView.test.tsx
│       └── PairingScreen.test.tsx
├── package.json
├── tsconfig.json
└── app.json                         # Expo configuration
```

## Image Requirements

| Property | Requirement |
|----------|------------|
| Minimum resolution | 480×480 pixels |
| Supported formats | JPEG, PNG, HEIC |
| Minimum images | 4 (one per wall) |
| Recommended images | 8-12 (walls + ceiling + floor + corners) |
| Overlap | ~30% between adjacent images |

## Running on Web

Since native device builds require an Apple Developer account, the web preview is the primary development workflow:

```bash
cd mobile/ios-app
npx expo start --web
```

This opens the app in your browser with hot reload. Camera and gallery features are native-only, but all UI, navigation, and state management work normally.

## Privacy

- All images are stored locally on the device only
- No user accounts, no cloud storage, no telemetry
- Bluetooth transfer uses AES-256-GCM encryption (when implemented)
- No data leaves the device except via explicit Bluetooth transfer to a paired desktop

## Related Docs

- [Requirements](../.kiro/specs/room-vision-ai/requirements-member1-mobile.md)
- [Tasks](../.kiro/specs/room-vision-ai/tasks-member1-mobile.md)
- [Design](../.kiro/specs/room-vision-ai/design.md)
