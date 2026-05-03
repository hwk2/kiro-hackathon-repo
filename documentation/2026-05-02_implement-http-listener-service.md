# Task 14.1 — Implement HttpListenerService MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 14.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/HttpListenerService.cs`

---

## Task Prompt

Implement `HttpListenerService` MonoBehaviour that starts `System.Net.HttpListener` on `localhost:8322`, routes HTTP requests to `UIBridge` methods, returns `OperationResult` JSON responses, and handles port-in-use gracefully.

---

## Step-by-Step Process

1. Reviewed the design's endpoint routing table and `UIBridge` public API.
2. Created `HttpListenerService.cs` with `System.Net.HttpListener` started in `Awake()`.
3. Implemented background thread (`ListenLoop`) accepting connections.
4. Implemented `ConcurrentQueue<Action>` drained in `Update()` for main-thread dispatch.
5. Implemented `GET /health` responding immediately without main-thread dispatch.
6. Implemented `DispatchAndWait()` using `TaskCompletionSource<OperationResult>` to block the thread-pool thread until `UIBridge.OnOperationComplete` fires.
7. Implemented `InvokeBridgeMethod()` switch statement routing all 11 endpoints.
8. Added HTTP 400 response for malformed JSON bodies.
9. Added port-in-use handling: catch `HttpListenerException` in `Awake()`, log error, `enabled = false`.
10. Added `OnDestroy()` to stop listener and join background thread.

---

## Implementation Choices & Reasoning

### `System.Net.HttpListener` (built-in .NET)
No third-party dependency required. Available in Unity's Mono runtime. Non-blocking via background thread.

### `ConcurrentQueue<Action>` drained in `Update()`
Unity's API is not thread-safe. All Unity calls must be on the main thread. The queue is the standard Unity pattern for main-thread marshalling from background threads.

### `TaskCompletionSource<OperationResult>` for blocking the thread-pool thread
Allows the background thread to wait for `UIBridge.OnOperationComplete` without polling. The event handler sets the result, unblocking the thread-pool thread. 30-second timeout prevents indefinite hangs.

### Subscribe to `OnOperationComplete` before enqueuing the UIBridge call
Prevents a race condition where the event fires before the subscription is set up. The subscription happens on the main thread immediately before the UIBridge method call.

### `GET /health` responds immediately without main-thread dispatch
Health checks should be fast and not depend on Unity's game loop. Responding directly from the background thread avoids a round-trip through the main-thread queue.

### Port-in-use: `enabled = false` without crashing
Requirement 11.6 — the Unity scene must remain usable even if the HTTP interface fails to start. Setting `enabled = false` disables `Update()` and prevents further processing without throwing.

---

## Summary

`HttpListenerService` embeds a local HTTP server on `localhost:8322`. A background thread accepts connections; Unity API calls are marshalled to the main thread via `ConcurrentQueue`. Each POST request blocks the thread-pool thread until `UIBridge.OnOperationComplete` fires, then returns the `OperationResult` as JSON. Port-in-use is handled gracefully by disabling the component.
