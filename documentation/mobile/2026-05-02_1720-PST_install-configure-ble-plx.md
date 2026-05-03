# Task 5.1 — Install and Configure react-native-ble-plx for BLE Support

**Date**: 2026-05-02
**Completed At**: 5:20 PM PST (estimate — see note below)
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 5.1

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

---

## Task Prompt

Install and configure `react-native-ble-plx` for BLE support in the Expo React Native mobile app (`mobile/ios-app/`). This is the first step in the Bluetooth pairing and discovery feature set (Section 5 of the mobile tasks).

## Step-by-Step Process

### 1. Assessed the current project state
- Read `package.json` to confirm existing dependencies (Expo SDK 55, React Native 0.81.5)
- Read `app.json` to check current Expo configuration (no Bluetooth plugins or permissions present)
- Read `App.tsx` to understand the app structure and confirm no existing BLE code

### 2. Installed react-native-ble-plx
- Ran `npm install react-native-ble-plx` in `mobile/ios-app/`
- Package resolved to version `3.5.1`, compatible with React Native 0.81.5

### 3. Configured Expo config plugin in app.json
- Added `react-native-ble-plx` to the `plugins` array in `app.json`
- Configured plugin options:
  - `isBackgroundEnabled: false` — no background BLE scanning needed for this use case
  - `modes: ["central"]` — mobile acts as BLE central to discover desktop peripherals
  - Custom permission description strings for iOS Bluetooth prompts

### 4. Added iOS Bluetooth permissions via infoPlist
- Added `NSBluetoothAlwaysUsageDescription` — required for BLE discovery/pairing
- Added `NSBluetoothPeripheralUsageDescription` — required for BLE communication
- Both descriptions explain the app's Bluetooth usage in user-friendly language

### 5. Verified the installation
- Confirmed TypeScript compilation passes
- Confirmed all 27 existing tests pass
- Confirmed package.json and app.json are correctly updated

## Implementation Choices & Reasoning

### Choice: `react-native-ble-plx` over alternatives

**What**: Selected `react-native-ble-plx` as the BLE library.

**Why over alternatives**:
- `expo-bluetooth` does not yet exist as a stable Expo module — the steering doc noted it as a future possibility
- `react-native-ble-manager` is another option but `react-native-ble-plx` has broader community adoption, better TypeScript support, and an official Expo config plugin
- `react-native-ble-plx` provides a clean API for BLE central mode (scanning, connecting, reading/writing characteristics) which maps directly to the design's BLE discovery/pairing requirements

**Optimality**: Best fit for the Expo managed workflow since it ships with a config plugin that handles native iOS/Android configuration automatically via `expo prebuild`.

### Choice: Central mode only (no peripheral)

**What**: Configured `modes: ["central"]` — the mobile app only acts as a BLE central device.

**Why**: Per the design document, the desktop app runs the Bluetooth server (peripheral/advertiser) and the mobile app discovers and connects to it. The mobile app never needs to advertise itself.

**Optimality**: Reduces the iOS permission surface and avoids requesting unnecessary Bluetooth peripheral capabilities.

### Choice: Background BLE disabled

**What**: Set `isBackgroundEnabled: false`.

**Why**: The app only needs BLE during active use — scanning for desktop devices and pairing. There's no requirement for background Bluetooth activity (no background transfers, no beacon monitoring).

**Optimality**: Simpler permission model, no need for iOS background mode entitlements, and avoids App Store review complications around background Bluetooth usage.

### Choice: Dual permission approach (plugin + infoPlist)

**What**: Added Bluetooth permission strings both in the plugin config and in `ios.infoPlist`.

**Why**: The Expo config plugin handles permission injection during `expo prebuild`, but explicitly setting `infoPlist` entries provides a safety net and makes the permissions visible in the app.json for documentation purposes.

**Optimality**: Belt-and-suspenders approach ensures permissions are present regardless of plugin behavior changes across Expo SDK versions.

## Summary

Installed `react-native-ble-plx@3.5.1` in the mobile Expo project and configured it as an Expo config plugin with BLE central mode and iOS Bluetooth permissions. The library is ready for use in subsequent tasks (5.2–5.11) which will implement BLE scanning, device discovery, pairing, and connection management. No code changes to existing screens were needed — this was purely a dependency and configuration task.
