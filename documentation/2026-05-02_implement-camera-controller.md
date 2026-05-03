# Task: Implement CameraController MonoBehaviour

**Date:** 2026-05-02  
**Spec:** `.kiro/specs/3d-room-visualizer/tasks.md` — Task 6.1  
**Unity Version:** 6000.3.1f1  
**File:** `unity/RoomVisualizer/Assets/RoomVisualizer/Scripts/CameraController.cs`

---

## Task Prompt

Implement `CameraController` MonoBehaviour with:
- `Translate(delta)` — moves the camera pivot on the XZ plane, clamped to room bounds
- `Orbit(yawDelta, pitchDelta)` — orbits around the room centre using spherical coordinates; pitch clamped to [−80, 80]°
- `Zoom(delta)` — adjusts `DistanceFromCenter`, clamped to [1, 20] m
- `ToggleTopDownView()` — switches between Perspective and Orthographic projection; saves and restores perspective state

---

## Step-by-Step Process

1. **Read the interface contract** — reviewed `ICameraController` in `Assets/RoomVisualizer/Interfaces/` to confirm method signatures, `DistanceFromCenter` property, and any events.

2. **Created `CameraController.cs`** in `Assets/RoomVisualizer/Scripts/` with the `RoomVisualizer` namespace and `MonoBehaviour, ICameraController` inheritance.

3. **Defined constants and serialised fields** — `MinDistance = 1f`, `MaxDistance = 20f`, `MinPitch = -80f`, `MaxPitch = 80f`, `TopDownPitch = 89.9f`, default distance, and a `SerializeField` reference to `IRoomController` (with `FindObjectOfType` fallback in `Awake`).

4. **Chose spherical coordinate storage** — the controller stores `_yaw`, `_pitch`, and `_distance` as the canonical state. `ApplySphericalToCamera()` converts these to a world-space camera position and `LookAt` call each frame, keeping the camera always pointed at the pivot.

5. **Implemented `Orbit(yawDelta, pitchDelta)`** — adds deltas to `_yaw` and `_pitch`, clamps pitch to [−80, 80]°, then calls `ApplySphericalToCamera()`.

6. **Implemented `Zoom(delta)`** — subtracts delta from `_distance`, clamps to [1, 20] m, then calls `ApplySphericalToCamera()`.

7. **Implemented `Translate(delta)`** — computes yaw-relative forward and right vectors (XZ plane only, Y zeroed), moves the pivot by `delta.x * right + delta.z * forward`, clamps each axis to room bounds via `ClampToRoomBounds()`, then calls `SyncAnglesFromPosition()` followed by `ApplySphericalToCamera()`.

8. **Implemented `SyncAnglesFromPosition()`** — recomputes `_yaw` and `_pitch` from the current camera-to-pivot vector so that subsequent `Orbit` or `Zoom` calls remain consistent with the translated pivot position.

9. **Implemented `ToggleTopDownView()`** — on first call, saves `_savedYaw`, `_savedPitch`, `_savedDistance`, and `_savedOrthographic`, then sets `_pitch = TopDownPitch`, switches `Camera.main.orthographic = true`, and calls `ApplySphericalToCamera()`. On second call, restores all saved values and switches back to perspective.

10. **Implemented `ClampToRoomBounds()`** — retrieves `IRoomController.GetRoomBounds()` and uses `Mathf.Clamp` on each axis of the pivot position independently.

11. **Verified compilation** — opened the Unity project and confirmed no CS errors in the console; ran the existing property-based test suite to ensure no regressions.

---

## Implementation Choices and Reasoning

### Spherical coordinates (yaw/pitch/distance) for orbit
Storing the camera state as `(_yaw, _pitch, _distance)` rather than a raw `Transform.position` means that `Orbit` and `Zoom` are exact: distance is never corrupted by floating-point drift from repeated vector arithmetic. This directly satisfies the spec property that `DistanceFromCenter` must equal the requested value after a `Zoom` call.

### `SyncAnglesFromPosition()` after Translate
After `Translate` moves the pivot, the camera's world position is unchanged but the pivot has shifted, so the implied yaw/pitch/distance are now stale. Calling `SyncAnglesFromPosition()` re-derives `_yaw` and `_pitch` from the camera-to-pivot vector before the next `ApplySphericalToCamera()` call. Without this step, the first `Orbit` after a `Translate` would snap the camera to the old angles.

### Yaw-relative forward/right vectors for Translate
The `delta` passed to `Translate` is in a "camera-facing" frame: `delta.z` should move the pivot away from the camera, not along world +Z. Computing `forward` and `right` from `_yaw` (ignoring pitch) gives an intuitive WASD feel regardless of where the camera is orbiting.

### Pitch clamped to [−80, 80]°
At exactly ±90° the camera's up vector becomes parallel to the look direction, causing gimbal flip. Clamping to ±80° leaves a comfortable margin while still allowing a nearly overhead view.

### `TopDownPitch = 89.9°` (near-vertical)
Setting pitch to exactly 90° would hit the gimbal-lock boundary. 89.9° is visually indistinguishable from straight down but keeps the spherical-coordinate math well-conditioned and avoids a degenerate `LookAt` call.

### Save/restore perspective state on `ToggleTopDownView`
The toggle is designed to be reversible: the user can return to exactly the orbit angle and distance they had before entering top-down mode. Saving `_savedYaw`, `_savedPitch`, `_savedDistance`, and `_savedOrthographic` as a snapshot on the first toggle and restoring them on the second achieves this without any additional state machine.

### `ClampToRoomBounds` using `Mathf.Clamp` per axis
`IRoomController.GetRoomBounds()` returns a `Bounds` centred at the world origin. Clamping each axis of the pivot independently with `Mathf.Clamp(value, bounds.min.axis, bounds.max.axis)` is the simplest correct approach and avoids projecting onto a bounding sphere (which would allow the pivot to drift outside a rectangular room).

---

## Summary

Task 6.1 is complete. `CameraController` is a MonoBehaviour that fully implements `ICameraController` using spherical coordinates as its canonical state. `Orbit` and `Zoom` manipulate `_yaw`, `_pitch`, and `_distance` directly; `Translate` moves the pivot in a yaw-relative XZ frame and re-syncs the angles; `ToggleTopDownView` snaps to a near-vertical orthographic view and restores the previous perspective state on the second call. All bounds and angle limits are enforced via `Mathf.Clamp`. Ready for Task 6.2 (property tests for CameraController) and Task 7 (SurfaceManager).
