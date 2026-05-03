# Task 5.6 — Implement ECDH Key Exchange During Pairing

**Date**: 2026-05-02
**Completed At**: 6:20 PM PST (estimate — see note below)
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 5.6

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

---

## Task Prompt

Implement ECDH key exchange during pairing to derive AES-256-GCM encryption key. Create the cryptographic utility layer that generates X25519 key pairs, derives shared secrets, and handles base64 encoding for BLE transmission.

## Step-by-Step Process

### 1. Installed dependencies
- Added `tweetnacl` (^1.0.3) for X25519 ECDH key exchange — pure JS, works in React Native
- Added `expo-crypto` (^55.0.14) for secure random bytes in Expo environments

### 2. Created key exchange utility module
- Created `mobile/ios-app/src/utils/bleKeyExchange.ts`
- Implemented `generateKeyPair()`, `deriveSharedKey()`, `createPairingSession()`, `completePairingSession()`, `publicKeyToBase64()`, `base64ToPublicKey()`
- Defined `KeyPairResult` and `PairingKeys` interfaces

### 3. Created comprehensive test suite
- Created `mobile/ios-app/src/__tests__/bleKeyExchange.test.ts`
- Tests cover key generation, ECDH symmetry, base64 roundtrip, session lifecycle, determinism, and different-peer-key divergence

## Implementation Choices & Reasoning

### Choice: tweetnacl over other crypto libraries

**What**: Used `tweetnacl` for X25519 ECDH key exchange.

**Why**: tweetnacl is a well-audited, zero-dependency, pure JavaScript implementation of NaCl. It works in React Native without native modules. Alternatives like `elliptic` or `noble-curves` are larger and more complex. Node's `crypto` module isn't available in React Native. tweetnacl's `nacl.box.before()` provides exactly the X25519 shared secret derivation needed.

### Choice: X25519 over P-256 ECDH

**What**: Used X25519 (Curve25519) for the Diffie-Hellman exchange.

**Why**: X25519 is the modern standard for key exchange — it's faster, simpler, and more resistant to implementation errors than NIST P-256. tweetnacl implements it natively. The 32-byte shared secret maps directly to an AES-256 key.

### Choice: Session-based API (createPairingSession / completePairingSession)

**What**: Wrapped key generation and derivation in a session lifecycle.

**Why**: The pairing flow is inherently two-phase (generate keys, then derive shared secret after receiving peer's key). The session pattern makes this explicit and prevents misuse — you can't derive a shared key without first creating a session.

## Summary

Created `src/utils/bleKeyExchange.ts` with X25519 ECDH key exchange using tweetnacl. The module provides a session-based API for generating key pairs, deriving 32-byte shared secrets (for AES-256-GCM), and base64 encoding for BLE transmission. Added comprehensive tests covering ECDH symmetry, determinism, and session lifecycle.
