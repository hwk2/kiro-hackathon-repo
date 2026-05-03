# Task 5.2 — Implement Bluetooth Permission Request Flow (iOS: CBCentralManager Authorization)

**Date**: 2026-05-02
**Completed At**: 5:40 PM PST (estimate — see note below)
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 5.2

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

---

## Task Prompt

Implement the runtime Bluetooth permission request flow for iOS. On iOS, even with Info.plist permission strings configured (done in task 5.1), the app must check and request Bluetooth authorization at runtime via CBCentralManager. The `react-native-ble-plx` library exposes this through its `BleManager` class. This task creates the utility layer that future BLE screens (scanning, pairing) will use to ensure permissions are granted before attempting Bluetooth operations.

## Step-by-Step Process

### 1. Assessed the current project state
- Read `App.tsx`, `package.json`, `app.json` to confirm `react-native-ble-plx@3.5.1` was installed and configured (task 5.1 complete)
- Read existing screens (`HomeScreen.tsx`, `CaptureScreen.tsx`) and utilities (`imageValidation.ts`) to understand code patterns, style conventions, and project structure
- Read `jest.config.js` and `imageValidation.test.ts` to understand the testing setup and patterns
- Confirmed no existing BLE runtime code existed — only the library install and `app.json` config plugin from task 5.1

### 2. Created BLE permissions utility module
- Created `mobile/ios-app/src/utils/blePermissions.ts`
- Defined `BlePermissionStatus` type with six possible values: `ready`, `powered_off`, `unauthorized`, `unsupported`, `unknown`, `resetting`
- Defined `BlePermissionResult` interface with `available` (boolean), `status`, `rawState` (from react-native-ble-plx), and `message` (user-friendly string)
- Implemented `buildPermissionResult(state)` — pure function mapping a raw `State` enum to a `BlePermissionResult`
- Implemented `checkBlePermission(manager?)` — reads the current BLE state from an existing or new BleManager
- Implemented `requestBlePermission(manager?, timeoutMs?)` — triggers the iOS CBCentralManager authorization prompt and waits for the state to settle

### 3. Created comprehensive test suite
- Created `mobile/ios-app/src/__tests__/blePermissions.test.ts` with 25 tests
- Mocked `react-native-ble-plx` BleManager with controlled `state()` and `onStateChange()` behavior
- Tested all six BLE states for `buildPermissionResult`
- Tested `checkBlePermission` for all states plus auto-creation of BleManager
- Tested `requestBlePermission` for immediate resolution (definitive states), waiting for state changes (Unknown → PoweredOn), timeout behavior, idempotent settling, and auto-creation

### 4. Verified implementation
- Ran full test suite: all 52 tests pass (25 new + 27 existing)
- No TypeScript diagnostics

### 5. Updated documentation
- Updated `.kiro/steering/mobile-development.md` with BLE permissions utility info
- Updated `mobile/README.md` with current status and project structure

## Implementation Choices & Reasoning

### Choice: Utility module pattern (not a React hook or screen)

**What**: Created a standalone utility module at `src/utils/blePermissions.ts` with pure functions and async helpers, rather than a React hook or a new screen.

**Why**: The permission check/request logic is framework-agnostic — it doesn't need React state or lifecycle. Future tasks (5.3–5.11) will build BLE scanning and pairing screens that consume these utilities. Keeping the logic in a utility module makes it testable without React rendering, reusable across multiple screens, and consistent with the existing `imageValidation.ts` pattern.

**Why over alternatives**: A React hook (`useBlePermission`) would couple the logic to React's rendering cycle and make it harder to test. A screen component would be premature — the task only asks for the permission flow, not the UI.

### Choice: Three-function API (buildPermissionResult, checkBlePermission, requestBlePermission)

**What**: Exported three functions at different abstraction levels.

**Why**:
- `buildPermissionResult` is a pure mapper — easy to test, useful for converting states anywhere in the app
- `checkBlePermission` is a simple one-shot read — useful when you just want to know the current state
- `requestBlePermission` handles the full iOS flow — triggers the permission dialog, waits for state to settle, handles timeout

This layered API lets consumers pick the right level of abstraction. A scanning screen might call `requestBlePermission` on mount, while a status indicator might call `checkBlePermission` periodically.

### Choice: Optional BleManager parameter with auto-creation

**What**: Both `checkBlePermission` and `requestBlePermission` accept an optional `BleManager` instance, creating one if not provided.

**Why**: On iOS, creating a `BleManager` instance triggers the CBCentralManager authorization prompt. By making the parameter optional, callers can either pass an existing manager (for reuse) or let the function create one (which triggers the permission dialog). This is the key mechanism for requesting Bluetooth permission on iOS.

**Why over alternatives**: A singleton pattern would hide the permission-triggering side effect. Requiring a manager parameter would force callers to manage lifecycle. The optional parameter gives flexibility while keeping the API simple.

### Choice: Timeout-based settling for Unknown state

**What**: When the initial state is `Unknown`, `requestBlePermission` subscribes to state changes and waits up to `timeoutMs` (default 10s) for a definitive state.

**Why**: On iOS, the BLE state starts as `Unknown` while CBCentralManager initializes and the user responds to the permission dialog. The state transitions to `PoweredOn`, `PoweredOff`, or `Unauthorized` once resolved. A timeout prevents the promise from hanging indefinitely if something goes wrong.

**Why 10 seconds default**: The iOS permission dialog typically resolves in 1-3 seconds. 10 seconds provides generous headroom for slow devices or delayed user interaction, while still failing within a reasonable time.

### Choice: Settled flag to prevent double-resolution

**What**: The `requestBlePermission` function uses a `settled` boolean flag to ensure the promise resolves exactly once, even if both the state change listener and the timeout fire.

**Why**: Race conditions between the `onStateChange` callback and the `setTimeout` callback could cause the promise to resolve twice. The settled flag is a simple, reliable guard against this.

### Choice: User-friendly messages for each state

**What**: Each BLE state maps to a human-readable message (e.g., "Bluetooth is turned off. Please enable Bluetooth in Settings.").

**Why**: These messages will be displayed in UI alerts or status indicators in future tasks. Having them centralized in the utility module ensures consistency and makes localization easier later.

## Summary

Created `src/utils/blePermissions.ts` with a clean three-function API for checking and requesting iOS Bluetooth permissions via `react-native-ble-plx`'s BleManager. The module handles all six CBCentralManager states, provides user-friendly messages, and supports both one-shot checks and the full permission request flow with timeout. Added 25 unit tests covering all states, the async waiting flow, timeout behavior, and edge cases. All 52 tests pass.
