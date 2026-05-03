using System;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Controls camera navigation: translation on the XZ plane, orbit around the room
    /// centre, zoom (distance from centre), top-down orthographic view toggle, and
    /// isometric mode with four-step yaw rotation.
    /// Implements <see cref="ICameraController"/> and <see cref="IIsometricCameraController"/>.
    /// </summary>
    /// <remarks>
    /// Attach this component to the same GameObject as the <see cref="Camera"/> component,
    /// or assign the camera via the <see cref="_camera"/> inspector field.
    ///
    /// The camera always looks at the room centre (<see cref="Vector3.zero"/>).
    /// Its position is described in spherical coordinates:
    ///   - <see cref="DistanceFromCenter"/> — radial distance [1, 20] metres
    ///   - <see cref="_yaw"/>               — horizontal angle around Y axis (degrees)
    ///   - <see cref="_pitch"/>             — vertical angle above XZ plane (degrees), clamped to [-80, 80]
    ///
    /// After every operation the position is clamped to the room bounding volume so the
    /// camera never escapes the room (Requirement 4.5).
    /// </remarks>
    public class CameraController : MonoBehaviour, ICameraController, IIsometricCameraController
    {
        // ── Constants ────────────────────────────────────────────────────────

        private const float MinDistance    = 1f;
        private const float MaxDistance    = 20f;
        private const float MinPitch       = -80f;
        private const float MaxPitch       =  80f;

        // Top-down view: camera sits directly above the room centre looking straight down.
        private const float TopDownPitch   = 89.9f;  // near-vertical to avoid gimbal issues
        private const float TopDownYaw     = 0f;

        // ── Inspector fields ─────────────────────────────────────────────────

        [SerializeField]
        [Tooltip("The Camera to control. Defaults to the Camera on this GameObject.")]
        private Camera _camera;

        [SerializeField]
        [Tooltip("Reference to the IRoomController used for bounding-volume clamping. " +
                 "Auto-resolved via FindObjectOfType<RoomController> if not set.")]
        private RoomController _roomControllerRef;

        [SerializeField]
        [Tooltip("Translation speed in metres per unit of input.")]
        private float _translateSpeed = 5f;

        [SerializeField]
        [Tooltip("Orbit sensitivity in degrees per unit of mouse delta.")]
        private float _orbitSensitivity = 0.3f;

        [SerializeField]
        [Tooltip("Zoom speed: distance change per unit of scroll delta.")]
        private float _zoomSpeed = 2f;

        [SerializeField]
        [Tooltip("Initial distance from the room centre in metres.")]
        private float _initialDistance = 10f;

        [SerializeField]
        [Tooltip("Initial yaw angle in degrees.")]
        private float _initialYaw = 45f;

        [SerializeField]
        [Tooltip("Initial pitch angle in degrees.")]
        private float _initialPitch = 30f;

        [SerializeField]
        [Tooltip("World-space point the camera orbits around and looks at. " +
                 "Set to (0, 1.5, 0) to centre on a default 3m-tall room.")]
        private Vector3 _orbitTarget = new Vector3(0f, 1.5f, 0f);

        // ── ICameraController ────────────────────────────────────────────────

        /// <inheritdoc/>
        public float DistanceFromCenter { get; private set; }

        // ── IIsometricCameraController ───────────────────────────────────────

        /// <inheritdoc/>
        public int YawStepIndex { get; private set; }

        /// <inheritdoc/>
        public bool IsIsometricMode { get; private set; }

        /// <inheritdoc/>
        public event Action<int> OnYawStepChanged;

        // ── Internal state ───────────────────────────────────────────────────

        private IRoomController _roomController;

        // Spherical-coordinate angles describing the camera's orbit position.
        private float _yaw;
        private float _pitch;

        // Current projection mode.
        private ProjectionType _projectionType = ProjectionType.Perspective;

        // Saved perspective state so we can restore it when leaving top-down mode.
        private float _savedYaw;
        private float _savedPitch;
        private float _savedDistance;

        // ── Isometric mode state ─────────────────────────────────────────────

        // Fixed pitch angle used in isometric mode (Requirement 12.1).
        private float _isometricPitch = 30f;

        // Saved perspective state for isometric toggle (separate from _savedYaw etc.
        // which are used by ToggleTopDownView).
        private float _savedPerspectiveYaw;
        private float _savedPerspectivePitch;
        private float _savedPerspectiveDistance;

        // Yaw lerp animation state for RotateStep transitions.
        private float _targetYaw;
        private float _yawTransitionDuration = 0.3f;
        private float _yawTransitionTimer    = 0f;
        private bool  _isTransitioning       = false;
        private float _startYaw;

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Resolve camera reference.
            if (_camera == null)
                _camera = GetComponent<Camera>();

            if (_camera == null)
                Debug.LogError("[CameraController] No Camera component found. " +
                               "Assign one via the inspector or attach this script to a Camera GameObject.");

            // Resolve room controller dependency.
            if (_roomControllerRef != null)
            {
                _roomController = _roomControllerRef;
            }
            else
            {
                _roomController = FindObjectOfType<RoomController>();

                if (_roomController == null)
                    Debug.LogWarning("[CameraController] No IRoomController found in the scene. " +
                                     "Camera bounding-volume clamping will be skipped.");
            }

            // Initialise spherical coordinates.
            DistanceFromCenter = Mathf.Clamp(_initialDistance, MinDistance, MaxDistance);
            _yaw   = _initialYaw;
            _pitch = Mathf.Clamp(_initialPitch, MinPitch, MaxPitch);

            // Position the camera immediately.
            ApplySphericalPosition();
        }

        // ── ICameraController implementation ─────────────────────────────────

        /// <summary>
        /// Translates the camera on the XZ plane.
        /// <paramref name="input"/>.x moves right/left; <paramref name="input"/>.y moves forward/back.
        /// Speed is scaled by <see cref="_translateSpeed"/>.
        /// The resulting position is clamped to the room bounding volume.
        /// </summary>
        /// <remarks>Requirement 4.1 — keyboard WASD/arrow-key navigation on the horizontal plane.</remarks>
        public void Translate(Vector2 input)
        {
            if (_camera == null)
                return;

            // Build a horizontal forward vector from the camera's current yaw so that
            // "forward" always means "towards the room centre projected on XZ".
            float yawRad = _yaw * Mathf.Deg2Rad;
            Vector3 forward = new Vector3(Mathf.Sin(yawRad), 0f, Mathf.Cos(yawRad));
            Vector3 right   = new Vector3(forward.z, 0f, -forward.x); // 90° clockwise on XZ

            Vector3 delta = (right * input.x + forward * input.y) * _translateSpeed;

            // Move the camera position (Y is preserved — horizontal plane only).
            Vector3 newPosition = _camera.transform.position;
            newPosition.x += delta.x;
            newPosition.z += delta.z;

            _camera.transform.position = ClampToRoomBounds(newPosition);

            // Update the spherical angles to reflect the new position so that subsequent
            // Orbit/Zoom calls remain consistent.
            SyncAnglesFromPosition();
        }

        /// <summary>
        /// Orbits the camera around the room centre (Vector3.zero).
        /// <paramref name="mouseDelta"/>.x controls yaw; <paramref name="mouseDelta"/>.y controls pitch.
        /// Pitch is clamped to [-80, 80] degrees to prevent flipping.
        /// Distance from centre is preserved (Requirement 4.2 / Property 9).
        /// Orbit input is ignored while <see cref="IsIsometricMode"/> is true (Requirement 12.2).
        /// </summary>
        public void Orbit(Vector2 mouseDelta)
        {
            if (IsIsometricMode) return; // Req 12.2

            _yaw   += mouseDelta.x * _orbitSensitivity;
            _pitch -= mouseDelta.y * _orbitSensitivity; // subtract so dragging up raises the camera
            _pitch  = Mathf.Clamp(_pitch, MinPitch, MaxPitch);

            ApplySphericalPosition();
        }

        /// <summary>
        /// Adjusts <see cref="DistanceFromCenter"/> by <paramref name="scrollDelta"/> * zoom speed,
        /// clamped to [1, 20] metres (Requirement 4.3 / Property 10).
        /// In isometric mode, adjusts the orthographic size instead (Requirement 12.3).
        /// Updates the camera position to maintain the current orbit direction.
        /// </summary>
        public void Zoom(float scrollDelta)
        {
            if (IsIsometricMode && _camera != null)
            {
                // Adjust orthographic size instead of distance (Req 12.3).
                _camera.orthographicSize = Mathf.Clamp(
                    _camera.orthographicSize - scrollDelta * _zoomSpeed,
                    MinDistance, MaxDistance);
                return;
            }

            DistanceFromCenter -= scrollDelta * _zoomSpeed;
            DistanceFromCenter  = Mathf.Clamp(DistanceFromCenter, MinDistance, MaxDistance);

            ApplySphericalPosition();
        }

        /// <summary>
        /// Toggles between <see cref="ProjectionType.Perspective"/> and
        /// <see cref="ProjectionType.Orthographic"/> (Requirement 4.4).
        /// In top-down mode the camera is positioned directly above the room centre looking down.
        /// Exiting top-down mode restores the previous perspective position.
        /// </summary>
        public void ToggleTopDownView()
        {
            if (_camera == null)
                return;

            if (_projectionType == ProjectionType.Perspective)
            {
                // Save current perspective state.
                _savedYaw      = _yaw;
                _savedPitch    = _pitch;
                _savedDistance = DistanceFromCenter;

                // Switch to top-down orthographic.
                _projectionType    = ProjectionType.Orthographic;
                _camera.orthographic = true;

                _yaw   = TopDownYaw;
                _pitch = TopDownPitch;
                // Keep the same distance so the orthographic size feels proportional.

                ApplySphericalPosition();
            }
            else
            {
                // Restore perspective state.
                _projectionType    = ProjectionType.Perspective;
                _camera.orthographic = false;

                _yaw              = _savedYaw;
                _pitch            = _savedPitch;
                DistanceFromCenter = _savedDistance;

                ApplySphericalPosition();
            }
        }

        // ── IIsometricCameraController implementation ────────────────────────

        /// <summary>
        /// Toggles between isometric (orthographic, pitch=30°, yaw locked to step) and
        /// the previously active perspective view. Preserves zoom level across the toggle
        /// (Requirement 12.4, 12.5).
        /// </summary>
        public void ToggleIsometricMode()
        {
            if (_camera == null)
                return;

            if (!IsIsometricMode)
            {
                // Save current perspective state (separate from ToggleTopDownView saves).
                _savedPerspectiveYaw      = _yaw;
                _savedPerspectivePitch    = _pitch;
                _savedPerspectiveDistance = DistanceFromCenter;

                IsIsometricMode = true;

                // Switch to orthographic projection.
                _projectionType      = ProjectionType.Orthographic;
                _camera.orthographic = true;

                // Lock pitch to 30 degrees (Req 12.1).
                _pitch = _isometricPitch;

                // Snap yaw to nearest 90-degree step (offset by 45 degrees).
                // Steps: 0->45, 1->135, 2->225, 3->315
                // Normalise to [0,360) then floor-divide by 90 to get the step index.
                float normYaw = ((_yaw % 360f) + 360f) % 360f;
                YawStepIndex = Mathf.FloorToInt(normYaw / 90f) % 4;
                _yaw = 45f + YawStepIndex * 90f;

                // Bug fix: set orthographicSize proportional to DistanceFromCenter so the
                // initial isometric view matches the perspective zoom level (Req 12.3).
                _camera.orthographicSize = DistanceFromCenter;

                ApplySphericalPosition();
            }
            else
            {
                IsIsometricMode = false;

                // Switch back to perspective projection.
                _projectionType      = ProjectionType.Perspective;
                _camera.orthographic = false;

                // Bug fix: sync DistanceFromCenter from orthographicSize so that zooming
                // in isometric mode is reflected when returning to perspective (Req 12.4).
                DistanceFromCenter = Mathf.Clamp(
                    _camera.orthographicSize, MinDistance, MaxDistance);

                // Restore saved perspective yaw and pitch.
                _yaw   = _savedPerspectiveYaw;
                _pitch = _savedPerspectivePitch;

                ApplySphericalPosition();
            }
        }

        /// <summary>
        /// Advances the yaw step by <paramref name="direction"/> (+1 or -1), modulo 4.
        /// Animates the yaw transition over no more than 0.3 seconds (Requirement 13.1, 13.3).
        /// Raises <see cref="OnYawStepChanged"/> with the new step index.
        /// Only has effect when <see cref="IsIsometricMode"/> is true.
        /// </summary>
        public void RotateStep(int direction)
        {
            if (!IsIsometricMode)
                return;

            YawStepIndex = ((YawStepIndex + direction) % 4 + 4) % 4;
            float rawTarget = 45f + YawStepIndex * 90f;

            // Bug fix: ensure the angular delta is at most 90 degrees so LerpAngle always
            // takes the short arc. Without this, step 3->0 would be 315->45 (+90 short arc)
            // but LerpAngle could choose the -270 long arc depending on _yaw's current value.
            float delta = Mathf.DeltaAngle(_yaw, rawTarget);
            _targetYaw = _yaw + delta;

            // Start lerp animation.
            _startYaw           = _yaw;
            _yawTransitionTimer = 0f;
            _isTransitioning    = true;

            OnYawStepChanged?.Invoke(YawStepIndex);
        }

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Update()
        {
            if (_isTransitioning)
            {
                _yawTransitionTimer += Time.deltaTime;
                float t = Mathf.Clamp01(_yawTransitionTimer / _yawTransitionDuration);
                _yaw = Mathf.LerpAngle(_startYaw, _targetYaw, t);
                ApplySphericalPosition();
                if (t >= 1f)
                {
                    _yaw             = _targetYaw;
                    _isTransitioning = false;
                }
            }
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Converts the current spherical coordinates (_yaw, _pitch, DistanceFromCenter)
        /// to a Cartesian camera position, clamps it to the room bounds, and orients the
        /// camera to look at the room centre.
        /// In isometric mode, uses <see cref="_isometricPitch"/> instead of <see cref="_pitch"/>.
        /// </summary>
        private void ApplySphericalPosition()
        {
            if (_camera == null)
                return;

            float effectivePitch = IsIsometricMode ? _isometricPitch : _pitch;
            Vector3 position = _orbitTarget + SphericalToCartesian(_yaw, effectivePitch, DistanceFromCenter);
            position = ClampToRoomBounds(position);

            _camera.transform.position = position;
            _camera.transform.LookAt(_orbitTarget);
        }

        /// <summary>
        /// Converts spherical coordinates to a Cartesian world-space position.
        /// </summary>
        /// <param name="yawDeg">Horizontal angle around Y axis in degrees.</param>
        /// <param name="pitchDeg">Vertical angle above the XZ plane in degrees.</param>
        /// <param name="distance">Radial distance from the origin.</param>
        private static Vector3 SphericalToCartesian(float yawDeg, float pitchDeg, float distance)
        {
            float yawRad   = yawDeg   * Mathf.Deg2Rad;
            float pitchRad = pitchDeg * Mathf.Deg2Rad;

            float cosPitch = Mathf.Cos(pitchRad);
            float x = distance * cosPitch * Mathf.Sin(yawRad);
            float y = distance * Mathf.Sin(pitchRad);
            float z = distance * cosPitch * Mathf.Cos(yawRad);

            return new Vector3(x, y, z);
        }

        /// <summary>
        /// After a <see cref="Translate"/> call the camera position may no longer lie on the
        /// original sphere. This method back-calculates yaw, pitch, and distance from the
        /// current camera position so that subsequent orbit/zoom operations remain consistent.
        /// </summary>
        private void SyncAnglesFromPosition()
        {
            if (_camera == null)
                return;

            // Compute position relative to the orbit target.
            Vector3 pos = _camera.transform.position - _orbitTarget;
            float distance = pos.magnitude;

            if (distance < Mathf.Epsilon)
                return;

            DistanceFromCenter = Mathf.Clamp(distance, MinDistance, MaxDistance);
            _pitch = Mathf.Asin(Mathf.Clamp(pos.y / distance, -1f, 1f)) * Mathf.Rad2Deg;
            _pitch = Mathf.Clamp(_pitch, MinPitch, MaxPitch);
            _yaw   = Mathf.Atan2(pos.x, pos.z) * Mathf.Rad2Deg;
        }

        /// <summary>
        /// Clamps <paramref name="position"/> so it lies within the room bounding volume.
        /// If no <see cref="IRoomController"/> is available the position is returned unchanged.
        /// </summary>
        private Vector3 ClampToRoomBounds(Vector3 position)
        {
            if (_roomController == null)
                return position;

            Bounds bounds = _roomController.GetRoomBounds();
            return new Vector3(
                Mathf.Clamp(position.x, bounds.min.x, bounds.max.x),
                Mathf.Clamp(position.y, bounds.min.y, bounds.max.y),
                Mathf.Clamp(position.z, bounds.min.z, bounds.max.z));
        }
    }
}
