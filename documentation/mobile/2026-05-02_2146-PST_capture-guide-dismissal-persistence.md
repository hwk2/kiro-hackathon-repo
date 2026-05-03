# Task 7.7 — Test Capture Guide Dismissal Persistence Across App Restarts

**Date**: 2026-05-02
**Completed At**: 9:46 PM PST
**Spec**: .kiro/specs/room-vision-ai/tasks-member1-mobile.md
**Task ID**: 7.7

---

## Task Prompt

Test Capture Guide dismissal persistence across app restarts. Verify that the "Don't show this guide again" toggle persists via AsyncStorage and correctly skips the guide on subsequent app launches.

## Step-by-Step Process

### 1. Analyzed the dismissal implementation
- Read CaptureGuideScreen.tsx to understand the toggle/AsyncStorage flow
- Read App.tsx to understand how the dismissed state is loaded on mount

### 2. Implemented dismissal flow tests
- Toggle ON → Continue → verify AsyncStorage write
- Toggle OFF → Continue → verify no AsyncStorage write
- Full restart simulation: dismiss → unmount → render App → verify guide skipped

### 3. Implemented persistence verification
- Direct AsyncStorage read/write roundtrip
- Multiple reads after single write (simulating multiple restarts)

### 4. Implemented edge case tests
- AsyncStorage write failure → onContinue still called (graceful degradation)
- AsyncStorage read failure → guide shows as safe default

## Implementation Choices & Reasoning

### Choice: Rendering full App component for restart simulation

**What**: The "skips guide on restart" test renders the actual `App` component (not just CaptureGuideScreen) to simulate a real app restart.

**Why**: The guide-skipping logic lives in App.tsx (reads AsyncStorage on mount, sets `guideDismissed` state, conditionally renders CaptureGuideScreen). Testing only CaptureGuideScreen wouldn't verify the integration between the two components. Rendering App exercises the real flow.

### Choice: Testing safe defaults on storage failure

**What**: Separate tests for write failure (guide continues) and read failure (guide shows).

**Why**: These are the two failure modes that matter for user experience. Write failure means the dismissal won't persist (minor inconvenience). Read failure means the guide shows even if dismissed (safe default — better to show extra info than skip it). Both should be graceful, not crashes.

### Choice: In-memory AsyncStorage mock with module-level store

**What**: Used a module-level `store` object that persists across test renders within a single test case, cleared in `beforeEach`.

**Why**: The restart simulation test needs the store to persist between the CaptureGuideScreen render (which writes) and the App render (which reads). A per-render mock wouldn't work. The module-level store simulates real AsyncStorage persistence.

## Summary

Created `src/__tests__/integration/captureGuideDismissal.test.ts` with 8 integration tests covering the dismissal flow (toggle + continue + AsyncStorage), persistence verification (read/write roundtrip, multiple restarts), and edge cases (storage failures with graceful degradation). Uses @testing-library/react-native to render real components.
