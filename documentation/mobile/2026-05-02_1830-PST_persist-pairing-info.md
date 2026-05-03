# Task 5.7 — Persist Pairing Info Locally (AsyncStorage)

**Date**: 2026-05-02
**Completed At**: 6:30 PM PST (estimate — see note below)
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 5.7

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

---

## Task Prompt

Persist pairing info locally (AsyncStorage) so re-pairing is not needed. Create a persistence layer that stores BLE pairing information (device ID, device name, encryption keys) so the app can reconnect to a previously paired desktop without repeating the pairing flow.

## Step-by-Step Process

### 1. Created pairing store utility
- Created `mobile/ios-app/src/utils/blePairingStore.ts`
- Defined `StoredPairingInfo` interface with device info and base64-encoded keys
- Implemented `savePairingInfo()` with validation (throws if keys incomplete)
- Implemented `loadPairingInfo()` with shape validation and graceful error handling
- Implemented `clearPairingInfo()` and `hasPairingInfo()` helpers

### 2. Created test suite
- Created `mobile/ios-app/src/__tests__/blePairingStore.test.ts` with 11 tests
- Mocked AsyncStorage with an in-memory store
- Tested save/load roundtrip, null handling, corrupted JSON, missing fields, clear, and existence check

## Implementation Choices & Reasoning

### Choice: Base64 encoding for key storage

**What**: All Uint8Array keys are converted to base64 strings before JSON serialization.

**Why**: AsyncStorage stores strings. Uint8Array can't be directly JSON-serialized. Base64 is the standard encoding for binary data in JSON — it's compact, safe, and reversible using the existing `publicKeyToBase64`/`base64ToPublicKey` helpers from `bleKeyExchange.ts`.

### Choice: Shape validation on load

**What**: `loadPairingInfo()` validates that all required fields are present strings before returning.

**Why**: AsyncStorage data can be corrupted (app crash during write, manual tampering, schema changes between versions). Returning null for invalid data is safer than crashing — the app simply treats it as "not paired" and the user re-pairs.

### Choice: Storing the shared key directly

**What**: The derived shared key is stored alongside the key pair, rather than re-deriving it on load.

**Why**: Re-deriving requires calling `nacl.box.before()` which is a crypto operation. Storing the result avoids the computation and keeps the load path simple. The shared key is already in memory during pairing, so storing it adds no security risk beyond what's already in AsyncStorage.

## Summary

Created `src/utils/blePairingStore.ts` with AsyncStorage-backed persistence for BLE pairing info. The module stores device identity and base64-encoded encryption keys, with validation on save (rejects incomplete sessions) and load (handles corrupted data gracefully). Added 11 tests. All 104 tests pass.
