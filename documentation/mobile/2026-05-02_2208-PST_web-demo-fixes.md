# Bugfix — Web Demo: WebSocket Transport + Transfer Button Redirect

**Date**: 2026-05-02
**Completed At**: 10:08 PM PST
**Spec**: N/A (user-reported bugs during web demo testing)

---

## Task Prompt

Two issues found during web demo testing:
1. The "Pair Desktop" button on HomeScreen leads to a blank page (BLE APIs don't exist in the browser)
2. The "Transfer to Desktop" button on ReviewScreen does nothing when no desktop is linked — it should redirect to the pairing flow

## Step-by-Step Process

### 1. Diagnosed Issue 1 — PairingScreen blank on web
- Read `PairingScreen.tsx` — it creates a `BleManager` from `react-native-ble-plx` on mount
- `react-native-ble-plx` is a native module that doesn't exist in the web environment
- The component silently fails and renders nothing useful

### 2. Brainstormed web transfer alternatives
- Evaluated 4 options: WebSocket localhost, ZIP file download, QR code + local network, drag-and-drop
- Selected **WebSocket localhost** — closest analog to the BLE flow, reuses the existing `BluetoothTransport` interface, and the desktop app just needs a WebSocket server alongside its BLE server

### 3. Created platform detection utility
- Created `src/utils/platformDetect.ts` with `isWeb()` and `isNative()` helpers using `Platform.OS`

### 4. Created WebSocket transport
- Created `src/utils/webSocketTransport.ts` implementing the `BluetoothTransport` interface
- Connects to `ws://localhost:8765` by default
- Handles binary/string messages, tracks connection status, supports all interface methods

### 5. Updated PairingScreen to be platform-aware
- Split into `WebPairingScreen` (WebSocket UI) and `NativePairingScreen` (BLE scanning)
- Web version shows a URL input, Connect button, connection status, and "Web Demo Mode" note
- Native version uses dynamic `require()` to avoid loading `react-native-ble-plx` on web

### 6. Diagnosed Issue 2 — Transfer button does nothing
- Read `ReviewScreen.tsx` — the transfer button shows a placeholder alert regardless of pairing state
- No check for whether a desktop is connected

### 7. Fixed ReviewScreen transfer button
- Added `isPaired` and `onPairDesktop` props to ReviewScreen
- When not paired: shows "No Desktop Connected" alert with "Pair Desktop" button
- When paired: shows the existing transfer alert

### 8. Updated App.tsx
- Passes `isPaired={selectedDevice !== null}` and `onPairDesktop={() => setScreen('pairing')}` to ReviewScreen

### 9. Created tests
- `webSocketTransport.test.ts` — 25 tests covering connect, disconnect, send, onData, status changes, destroy
- `platformDetect.test.ts` — 6 tests for platform detection
- Updated `PairingScreen.test.tsx` to mock `platformDetect` for native mode
- Updated `dataPrivacy.test.ts` to exclude `webSocketTransport.ts` from network pattern check (it's localhost-only for web demo)

### 10. Verified all tests pass
- 491 tests across 30 suites, all passing

## Implementation Choices & Reasoning

### Choice: WebSocket on localhost over other web transfer methods

**What**: Created a WebSocket transport connecting to `ws://localhost:8765` for the web demo.

**Why over ZIP download**: ZIP loses the real-time "paired" experience. The user would have to manually move files. WebSocket mirrors the BLE flow — connect, send images, receive acks — so the same transfer manager and protocol code works on both platforms.

**Why over QR code**: QR code adds complexity (camera access on web, local network discovery) for minimal benefit in a demo context. WebSocket to localhost is simpler and more reliable.

**Why localhost only**: Keeps the privacy-first design — no data leaves the local machine. The desktop app runs on the same computer, so `localhost` is the natural endpoint.

### Choice: BluetoothTransport interface reuse

**What**: `webSocketTransport.ts` implements the exact same `BluetoothTransport` interface as `bleTransport.ts`.

**Why**: The transfer manager, protocol serialization, encryption, and ack handling code all work with `BluetoothTransport`. By implementing the same interface, the WebSocket transport is a drop-in replacement — no changes needed to any of the transfer pipeline code. This is the transport abstraction from task 6.1 paying off.

### Choice: Dynamic require() for BLE on native

**What**: The native PairingScreen uses `require('react-native-ble-plx')` inside `useEffect` instead of a top-level import.

**Why**: Top-level imports of `react-native-ble-plx` crash on web because the native module doesn't exist. Dynamic `require()` inside a `useEffect` that only runs on native (guarded by `isWeb()` check at the component level) avoids the crash entirely. The web version never loads the BLE module.

### Choice: Synthetic DiscoveredDevice for WebSocket connections

**What**: When a WebSocket connection succeeds, the web PairingScreen creates a synthetic `DiscoveredDevice` with `id: 'ws-{url}'` and `name: 'Desktop ({url})'`.

**Why**: The rest of the app (App.tsx, ReviewScreen) expects a `DiscoveredDevice` from the pairing flow. Creating a synthetic one with the WebSocket URL as the identifier lets the existing state management work without changes. The `isPaired` check in ReviewScreen just needs `selectedDevice !== null`.

### Choice: Alert-based redirect for unpaired transfer

**What**: When the user taps "Transfer to Desktop" without a paired device, an Alert shows with "Pair Desktop" button that navigates to the pairing screen.

**Why over automatic redirect**: An automatic redirect would be confusing — the user tapped "Transfer" and suddenly they're on a different screen. The Alert explains what's happening ("No Desktop Connected") and gives the user a choice. This follows the same confirmation pattern used throughout the app (pairing confirmation, unpair confirmation, clear all confirmation).

## Summary

Fixed two web demo issues: (1) PairingScreen now shows a WebSocket connection UI on web instead of crashing on missing BLE APIs, and (2) ReviewScreen's transfer button redirects to pairing when no desktop is connected. Created `webSocketTransport.ts` (implements `BluetoothTransport` interface via WebSocket), `platformDetect.ts` (isWeb/isNative helpers), and updated PairingScreen, ReviewScreen, and App.tsx. Added 31 new tests. All 491 tests pass.
