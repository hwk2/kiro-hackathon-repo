# Task 5.9 — Implement Auto-Reconnect

**Date**: 2026-05-02
**Completed At**: 6:50 PM PST (estimate — see note below)
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 5.9

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

---

## Task Prompt

Implement auto-reconnect: up to 3 attempts at 5-second intervals. When the BLE connection is lost, the app should automatically attempt to reconnect before notifying the user of failure.

## Step-by-Step Process

### 1. Created auto-reconnect utility
- Created `src/utils/bleAutoReconnect.ts` with `attemptReconnect()` and `createCancelableReconnect()`
- Defined constants: `MAX_RECONNECT_ATTEMPTS = 3`, `RECONNECT_INTERVAL_MS = 5000`
- Uses `createConnectionState` from `bleConnectionManager.ts` for all state transitions

### 2. Created test suite
- 10 tests using fake timers to verify timing, state transitions, cancellation, and edge cases

## Implementation Choices & Reasoning

### Choice: Injected `connectFn` parameter

**What**: The reconnect functions accept a `connectFn: (deviceId: string) => Promise<boolean>` rather than directly using BLE APIs.

**Why**: This makes the reconnect logic fully testable without BLE hardware or mocks. The actual BLE connection call is injected by the caller, keeping the reconnect utility pure and reusable.

### Choice: Cancelable variant

**What**: `createCancelableReconnect()` returns both a promise and a `cancel()` function.

**Why**: The user might navigate away, unpair, or manually retry while auto-reconnect is running. The cancel function allows the UI to abort the loop cleanly without leaving dangling timers or promises.

### Choice: Cancelable delay helper

**What**: Internal `cancelableDelay()` function wraps `setTimeout` in a promise that can be rejected early.

**Why**: Standard `setTimeout` can't be canceled once wrapped in a promise. The cancelable delay allows the `cancel()` function to interrupt the wait period between attempts, providing immediate feedback to the user.

## Summary

Created `src/utils/bleAutoReconnect.ts` with a reconnect loop that tries up to 3 times at 5-second intervals, reporting state changes at each step. Includes a cancelable variant for UI integration. Added 10 tests with fake timers.
