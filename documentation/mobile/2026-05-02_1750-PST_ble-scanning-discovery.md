# Task 5.3 — Implement BLE Scanning to Discover Nearby Desktop Instances

**Date**: 2026-05-02
**Completed At**: 5:50 PM PST (estimate — see note below)
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 5.3

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

---

## Task Prompt

Implement BLE scanning to discover nearby Desktop instances advertising Room Vision AI service UUID. The mobile app needs to scan for BLE peripherals (desktop computers running the Room Vision AI desktop app) and report discovered devices to the UI layer.

## Step-by-Step Process

### 1. Assessed prerequisites
- Confirmed task 5.1 (BLE library install) and 5.2 (permission flow) were complete
- Read `blePermissions.ts` to understand the permission API that scanning depends on
- Read existing test patterns from `blePermissions.test.ts` and `imageValidation.test.ts`

### 2. Created BLE scanner utility module
- Created `mobile/ios-app/src/utils/bleScanner.ts`
- Defined `ROOM_VISION_SERVICE_UUID` constant for filtering BLE advertisements
- Defined `DiscoveredDevice` interface with `id`, `name`, `rssi`, `discoveredAt`
- Implemented `startScanning()` with permission check, UUID-filtered scan, and device deduplication
- Implemented `stopScanning()` as a simple wrapper around `manager.stopDeviceScan()`

### 3. Created comprehensive test suite
- Created `mobile/ios-app/src/__tests__/bleScanner.test.ts` with 15 tests
- Mocked both `react-native-ble-plx` and `blePermissions` module
- Tested all scanning scenarios: permission granted/denied, device mapping, deduplication, error handling, cleanup

### 4. Verified implementation
- Ran full test suite: all 67 tests pass (15 new + 52 existing)

## Implementation Choices & Reasoning

### Choice: Dedicated service UUID constant

**What**: Defined `ROOM_VISION_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc'` as a shared constant.

**Why**: The desktop app (Member 2) will advertise this same UUID. Having it as a named constant makes it easy to find and update, and ensures the mobile and desktop apps agree on the service identifier.

### Choice: Set-based device deduplication

**What**: Used a `Set<string>` keyed by device ID to track seen devices during a scan session.

**Why**: BLE scanning continuously reports the same devices as they re-advertise. Without deduplication, the UI would receive hundreds of duplicate callbacks. A Set provides O(1) lookup and is the simplest correct approach. The set is scoped to the scan session (created inside `startScanning`), so a new scan starts fresh.

### Choice: Async function returning cleanup function

**What**: `startScanning` is async (because it awaits permission check) and returns a `() => void` cleanup function.

**Why**: The async nature is required because `requestBlePermission` is async. Returning a cleanup function follows the React pattern for effects — the caller can store it and call it on unmount or when stopping the scan. When BLE is unavailable, a no-op function is returned so the caller doesn't need null checks.

### Choice: Name fallback chain (name → localName → "Unknown Device")

**What**: Device name resolution uses `device.name ?? device.localName ?? 'Unknown Device'`.

**Why**: BLE devices can advertise their name in two fields (`name` and `localName`). Some devices only populate one. Falling back through both before defaulting to "Unknown Device" gives the best chance of showing a meaningful name to the user.

## Summary

Created `src/utils/bleScanner.ts` with a UUID-filtered BLE scanning utility that checks permissions before scanning, deduplicates discovered devices by ID, and maps raw BLE devices to a clean `DiscoveredDevice` interface. Added 15 unit tests covering all scanning scenarios. All 67 tests pass.
