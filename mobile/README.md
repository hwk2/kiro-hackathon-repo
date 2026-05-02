# Room Vision AI — Mobile App (Member 1)

Cross-platform mobile app for capturing room images and transferring them to the desktop visualization engine over encrypted Bluetooth. Built with **Expo (React Native)** and **TypeScript**.

## Current Status

- ✅ Expo project scaffolded (TypeScript)
- ✅ Home screen with capture flow entry
- ✅ Capture Guide screen (instructions, tips, minimum requirements)
- ✅ Capture screen (camera + gallery import, resolution validation, progress tracking)
- ✅ Review screen (image grid, metadata display, remove/clear, transfer placeholder)
- 🔲 Bluetooth pairing and encrypted transfer (next milestone)
- 🔲 Android-specific testing (iOS-first approach)

## Tech Stack

- **Framework**: Expo SDK (React Native)
- **Language**: TypeScript
- **Key packages**: expo-camera, expo-image-picker, expo-file-system
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
│   └── screens/
│       ├── HomeScreen.tsx           # Landing screen with "Start Capture" button
│       ├── CaptureGuideScreen.tsx   # Step-by-step capture instructions
│       ├── CaptureScreen.tsx        # Camera/gallery capture with progress bar
│       └── ReviewScreen.tsx         # Image grid review, remove, transfer
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

## Building a Standalone App (No Expo Go)

When ready to distribute outside of Expo Go:

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo account (free)
eas login

# Build for iOS (cloud build, no Mac needed)
eas build --platform ios --profile preview

# This generates an .ipa file you can install via TestFlight
```

**Note**: For App Store distribution, you'll need an Apple Developer account ($99/year). For testing on your own devices, the free tier with Expo Go is sufficient.

## Privacy

- All images are stored locally on the device only
- No user accounts, no cloud storage, no telemetry
- Bluetooth transfer uses AES-256-GCM encryption (when implemented)
- No data leaves the device except via explicit Bluetooth transfer to a paired desktop

## Related Docs

- [Requirements](../.kiro/specs/room-vision-ai/requirements-member1-mobile.md)
- [Tasks](../.kiro/specs/room-vision-ai/tasks-member1-mobile.md)
- [Design](../.kiro/specs/room-vision-ai/design.md)
