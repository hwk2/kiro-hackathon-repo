# Bugfix — Transfer Button Flow: Direct Navigation + Return-to-Review After Pairing

**Date**: 2026-05-02
**Completed At**: 10:14 PM PST
**Spec**: N/A (user-reported bug during web demo testing)

---

## Task Prompt

The "Transfer to Desktop" button on ReviewScreen doesn't work as intended:
1. When no desktop is linked, it should navigate directly to the pairing screen (not show an alert first)
2. After pairing completes, the user should return to the review screen (not home) so they can immediately transfer
3. When paired, the transfer button should show a meaningful confirmation rather than a "coming soon" placeholder

## Step-by-Step Process

### 1. Analyzed the existing behavior
- ReviewScreen's `handleTransfer` showed an Alert with "Pair Desktop" button when not paired — extra friction
- After pairing on PairingScreen, `handleDeviceSelected` always navigated to `'home'` — user lost their place
- When paired, the button showed a "will be available in the next update" placeholder — unhelpful

### 2. Fixed ReviewScreen transfer button
- When not paired: calls `onPairDesktop()` directly — no alert, just navigate to pairing
- When paired: shows a confirmation alert ("Send N images to your paired desktop?") with Cancel/Transfer buttons
- Transfer button triggers a "Transfer Started" alert (placeholder until desktop server is running)

### 3. Added return-after-pairing state to App.tsx
- Added `returnAfterPairing` state (defaults to `'home'`)
- When ReviewScreen triggers pairing: sets `returnAfterPairing` to `'review'`
- When HomeScreen triggers pairing: sets `returnAfterPairing` to `'home'`
- When pairing completes (`handleDeviceSelected`): navigates to `returnAfterPairing` and resets it

### 4. Verified all tests pass
- 491 tests across 30 suites, all passing

## Implementation Choices & Reasoning

### Choice: Direct navigation instead of Alert when not paired

**What**: Tapping "Transfer to Desktop" when not paired now navigates directly to the pairing screen instead of showing an "Are you sure?" alert.

**Why**: The user's intent is clear — they want to transfer images. The only blocker is that no desktop is connected. Showing an alert asking "Would you like to pair?" adds an unnecessary confirmation step. Going directly to pairing is faster and more intuitive. The user can always tap "Back" on the pairing screen if they change their mind.

### Choice: Return-to-review state tracking

**What**: Added a `returnAfterPairing` state in App.tsx that tracks where to navigate after pairing completes.

**Why**: Without this, pairing always returns to home, which breaks the transfer flow — the user has to navigate back to review manually. By tracking the origin screen, the app returns the user to exactly where they were. This is context-sensitive navigation: pairing from home → return to home, pairing from review → return to review.

### Choice: Confirmation alert when paired (not immediate transfer)

**What**: When paired, the transfer button shows a confirmation alert before starting the transfer.

**Why**: Transferring images is a significant action (encrypts and sends data over Bluetooth/WebSocket). A confirmation gives the user a chance to review the image count and cancel if needed. This follows the same pattern as "Clear All" (confirmation before destructive action).

## Summary

Fixed the transfer button flow: navigates directly to pairing when not connected (no intermediate alert), returns to review screen after pairing completes (not home), and shows a meaningful transfer confirmation when paired. Added `returnAfterPairing` state tracking in App.tsx. All 491 tests pass.
