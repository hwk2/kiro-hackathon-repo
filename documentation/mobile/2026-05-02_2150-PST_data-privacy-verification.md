# Task 7.8 — Verify No Data Stored Outside Local Device

**Date**: 2026-05-02
**Completed At**: 9:50 PM PST
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 7.8

---

## Task Prompt

Verify no data stored outside local device (no network calls, no cloud). Ensure the privacy-first design is enforced at the code level through static analysis of source files and dependencies.

## Step-by-Step Process

### 1. Designed static analysis approach
- Chose to scan actual source files using Node's `fs` module rather than mocking
- Identified 4 categories: no network calls, no cloud storage, no user accounts, data stays local

### 2. Implemented source file scanning
- Built `collectFiles()` helper to recursively find .ts/.tsx files under src/
- Built `scanFilesForPattern()` to search files for regex patterns with file/line reporting
- Excluded test files and node_modules from source scanning

### 3. Implemented 12 tests across 4 categories
- No network calls: fetch/XMLHttpRequest/axios, external URLs, forbidden npm packages, BLE transport purity
- No cloud storage: cloud API references, AsyncStorage-only persistence, no remote storage packages
- No user accounts: no auth patterns, no account state in App.tsx
- Data stays local: Bluetooth-only data flows, local key storage, local file URIs

### 4. Fixed captureGuideDismissal test
- Renamed `store` variable to `mockStore` to comply with Jest's mock variable scoping rules (variables inside `jest.mock()` must be prefixed with `mock`)

## Implementation Choices & Reasoning

### Choice: Static source code analysis over runtime checks

**What**: Tests read actual source files with `fs.readFileSync` and search for forbidden patterns using regex.

**Why**: Runtime tests can only verify behavior that's exercised. Static analysis catches violations that might exist in unused code paths, commented-out code, or conditional branches. It's also faster and doesn't require mocking the entire app. This approach acts as a guardrail — if someone adds `fetch()` or `axios` to any source file, the test fails immediately.

### Choice: Scanning package.json dependencies

**What**: Tests check `package.json` for known network/cloud/analytics libraries.

**Why**: Even if no source file calls `fetch()`, having `axios` or `firebase` in dependencies signals a privacy violation waiting to happen. Catching it at the dependency level is earlier and more reliable than scanning for usage patterns.

### Choice: Excluding test files from source scanning

**What**: `getNonTestSourceFiles()` filters out `__tests__/` directories and `.test.ts` files.

**Why**: Test files legitimately reference patterns like "fetch" in test descriptions or mock setups. Scanning them would produce false positives. The privacy requirement applies to production source code, not test infrastructure.

### Choice: Targeted auth pattern regex

**What**: Used specific patterns like `signIn`, `signUp`, `userRegist`, `OAuth`, `JWT` rather than broad patterns like `auth`.

**Why**: Broad patterns would match legitimate code like "authorization" in BLE permission descriptions or "authenticate" in encryption contexts. The targeted patterns catch actual authentication implementations without false positives.

## Summary

Created `src/__tests__/integration/dataPrivacy.test.ts` with 12 static analysis tests verifying the privacy-first design: no network calls (fetch/axios/external URLs), no cloud storage (Firebase/AWS/iCloud), no user accounts (login/OAuth/JWT), and data stays local (Bluetooth-only, local AsyncStorage, file:// URIs). Also fixed a Jest mock scoping issue in captureGuideDismissal.test.ts. All 459 tests pass across 28 suites.
