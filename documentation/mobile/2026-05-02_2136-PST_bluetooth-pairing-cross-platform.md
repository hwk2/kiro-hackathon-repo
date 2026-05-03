# Task 7.4 — Test Bluetooth Pairing with Windows and macOS Desktop

**Date**: 2026-05-02
**Completed At**: 9:36 PM PST
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 7.4

---

## Task Prompt

Test Bluetooth pairing with Windows and macOS desktop. Verify the pairing flow works correctly regardless of the desktop platform by simulating pairing with Windows-style and macOS-style devices.

## Step-by-Step Process

### 1. Designed cross-platform test scenarios
- Created Windows-style device mock ("DESKTOP-WIN11", MAC address "AA:BB:CC:DD:EE:01")
- Created macOS-style device mock ("MacBook-Pro", MAC address "11:22:33:44:55:66")
- Both exercise the same pairing flow but with platform-specific identifiers

### 2. Implemented full pairing lifecycle tests
- Discover → confirm → ECDH key exchange → persist → load → verify keys match
- Pair → unpair → verify data cleared (integration with bleUnpair)
- Pair → load → re-derive shared key from stored keys (verifies persistence roundtrip)

### 3. Implemented cross-platform key exchange verification
- Simulated both mobile and desktop sides of ECDH for Windows and macOS
- Verified shared key symmetry (both sides derive identical key)
- Tested encrypt/decrypt integration with bleEncryption using the derived key

### 4. Implemented persistence roundtrip tests
- Save/load preserves device ID, name, and all keys for both platforms
- Loaded keys can encrypt/decrypt data correctly

## Implementation Choices & Reasoning

### Choice: Platform-specific device mocks rather than generic ones

**What**: Created distinct Windows ("DESKTOP-WIN11") and macOS ("MacBook-Pro") device mocks with different MAC address formats.

**Why**: The requirement specifically calls out Windows and macOS support. Using platform-specific names and IDs verifies that the pairing logic doesn't make assumptions about device identifier formats. Windows BLE devices often have different MAC address patterns than macOS devices.

### Choice: Simulating both sides of ECDH exchange

**What**: Each test creates both mobile and desktop key pairs and verifies they derive the same shared secret.

**Why**: This is the critical integration point — if the shared key derivation doesn't produce identical results on both sides, encrypted data can't be decrypted. Testing both sides catches subtle bugs in key exchange ordering (e.g., `box.before(peerPub, ownSecret)` vs `box.before(ownPub, peerSecret)`).

### Choice: Testing re-derivation from persisted keys

**What**: One test loads persisted keys from AsyncStorage, re-derives the shared key from the stored secret + peer public key, and verifies it matches the stored shared key.

**Why**: This simulates app restart — the app loads stored keys and needs to reconstruct the shared key. If the base64 encoding/decoding or key derivation has any issues, this test catches it.

## Summary

Created `src/__tests__/integration/bluetoothPairing.test.ts` with 16 integration tests across 4 categories: cross-platform pairing simulation (Windows + macOS), full pairing lifecycle (pair/unpair/re-derive), key exchange verification with encryption integration, and persistence roundtrip tests. Uses real crypto and only mocks AsyncStorage.
