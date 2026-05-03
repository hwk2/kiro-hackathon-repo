# Task 4.5: Implement "dismiss for future sessions" toggle with AsyncStorage persistence

**Date**: 2026-05-02
**Completed At**: 5:25 PM PST (estimate — see note below)
**Spec**: `.kiro/specs/room-vision-ai/tasks-member1-mobile.md`
**Task**: 4.5

> **Note**: This timestamp is an estimate. Due to an implementation oversight, accurate completion times were not recorded for tasks completed on 2026-05-02. Future tasks will have accurate timestamps recorded automatically by the task-completion-docs hook.

## Task Prompt

Implement a "dismiss for future sessions" toggle on the Capture Guide screen that persists the user's preference using AsyncStorage, so the guide is automatically skipped on subsequent app launches.

## Step-by-Step Process

1. **Read existing code** — Reviewed `CaptureGuideScreen.tsx`, `App.tsx`, `CaptureScreen.tsx`, `HomeScreen.tsx`, and `package.json` to understand the current screen flow and navigation logic.

2. **Install dependency** — Added `@react-native-async-storage/async-storage` to the project (user ran `npm install` manually due to terminal environment constraints).

3. **Add dismiss toggle to CaptureGuideScreen.tsx**:
   - Imported `useState` from React, `Switch` from React Native, and `AsyncStorage`.
   - Exported a `CAPTURE_GUIDE_DISMISSED_KEY` constant for the storage key (shared with `App.tsx`).
   - Added `dismissForFuture` local state (boolean, defaults to `false`).
   - Created `handleContinue` async handler that writes `'true'` to AsyncStorage when the toggle is on, then calls `onContinue`.
   - Added a styled `dismissRow` with a `Switch` component and label text, placed between the last instruction card and the "Got it" button.
   - Added `accessibilityLabel` and `accessibilityRole` to the Switch for screen reader support.

4. **Update App.tsx to respect the persisted preference**:
   - Added `guideDismissed` state (boolean, defaults to `false`).
   - Added a `useEffect` that reads the AsyncStorage key on mount and sets `guideDismissed` to `true` if found.
   - Created `handleStartCapture` callback that navigates to `'capture'` directly when dismissed, or `'guide'` otherwise.
   - Created `handleGuideContinue` callback that sets `guideDismissed` to `true` in memory (so the current session also skips the guide on subsequent captures) and navigates to `'capture'`.
   - Wired both callbacks into the JSX.

5. **Verified no TypeScript errors** — Ran diagnostics on both files, clean.

6. **Updated documentation** — Updated steering doc (`mobile-development.md`), README (`mobile/README.md`), and task status.

## Implementation Choices & Reasoning

### AsyncStorage key as an exported constant
- **Choice**: Export `CAPTURE_GUIDE_DISMISSED_KEY` from `CaptureGuideScreen.tsx` and import it in `App.tsx`.
- **Why**: Avoids magic strings and ensures the key is always consistent between the write site and read site. A single source of truth.

### `@react-native-async-storage/async-storage` over Expo SecureStore
- **Choice**: Used `@react-native-async-storage/async-storage` for persistence.
- **Why**: This is a non-sensitive boolean preference, not a secret. AsyncStorage is the standard React Native key-value store for preferences. SecureStore would be overkill and adds unnecessary complexity for a UI preference flag.

### In-memory `guideDismissed` state in App.tsx
- **Choice**: Maintain a `guideDismissed` React state in addition to AsyncStorage.
- **Why**: AsyncStorage is async and only read on mount. The in-memory state ensures that once the user dismisses the guide (either from storage or from the current session toggle), subsequent "Start Capture" presses within the same session also skip the guide immediately without another async read.

### `handleGuideContinue` sets `guideDismissed` to `true` in memory
- **Choice**: When the user continues from the guide (regardless of toggle state), mark `guideDismissed = true` in memory.
- **Why**: Even if the user doesn't toggle "Don't show again", they've already seen the guide this session. The in-memory flag means they won't see it again during this app session. On next app launch, if they didn't toggle it, AsyncStorage won't have the key and the guide will show again — correct behavior.

### Graceful error handling on AsyncStorage operations
- **Choice**: Wrap both `getItem` and `setItem` in try/catch with no-op error handling.
- **Why**: Storage failures (rare but possible on device) should not break the app flow. If the write fails, the guide simply shows again next time. If the read fails, the guide shows as a safe default.

### Switch component with accessibility attributes
- **Choice**: Used React Native's built-in `Switch` with `accessibilityLabel` and `accessibilityRole`.
- **Why**: Ensures screen readers can identify and interact with the toggle. Follows accessibility best practices without adding external dependencies.

## Summary

Added a "Don't show this guide again" toggle to the Capture Guide screen. When enabled and the user taps "Got it", the preference is saved to AsyncStorage. On app launch, `App.tsx` reads this preference and skips the guide screen, navigating directly to the capture screen. The implementation is resilient to storage failures and accessible to screen readers.
