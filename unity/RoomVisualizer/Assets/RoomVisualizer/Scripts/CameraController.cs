using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Controls camera navigation: translation on the XZ plane, orbit around the room
    /// centre, zoom (distance from centre), and top-down orthographic view toggle.
    /// Implements <see cref="ICameraController"/>.
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
    public class CameraController : MonoBehaviour, ICameraController
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

        // ── ICameraController ────────────────────────────────────────────────

        /// <inheritdoc/>
        public float DistanceFromCenter { get; private set; }

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
            // Y is intentionally unchanged (Requirement 4.1 / Property 8).

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
        /// </summary>
        public void Orbit(Vector2 mouseDelta)
        {
            _yaw   += mouseDelta.x * _orbitSensitivity;
            _pitch -= mouseDelta.y * _orbitSensitivity; // subtract so dragging up raises the camera
            _pitch  = Mathf.Clamp(_pitch, MinPitch, MaxPitch);

            ApplySphericalPosition();
        }

        /// <summary>
        /// Adjusts <see cref="DistanceFromCenter"/> by <paramref name="scrollDelta"/> * zoom speed,
        /// clamped to [1, 20] metres (Requirement 4.3 / Property 10).
        /// Updates the camera position to maintain the current orbit direction.
        /// </summary>
        public void Zoom(float scrollDelta)
        {
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

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Converts the current spherical coordinates (_yaw, _pitch, DistanceFromCenter)
        /// to a Cartesian camera position, clamps it to the room bounds, and orients the
        /// camera to look at the room centre.
        /// </summary>
        private void ApplySphericalPosition()
        {
            if (_camera == null)
                return;

            Vector3 position = SphericalToCartesian(_yaw, _pitch, DistanceFromCenter);
            position = ClampToRoomBounds(position);

            _camera.transform.position = position;
            _camera.transform.LookAt(Vector3.zero);
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

            Vector3 pos = _camera.transform.position;
            float distance = pos.magnitude;

            if (distance < Mathf.Epsilon)
            {
                // Camera is at the origin — keep existing angles.
                return;
            }

            DistanceFromCenter = Mathf.Clamp(distance, MinDistance, MaxDistance);

            // Pitch: angle above the XZ plane.
            _pitch = Mathf.Asin(Mathf.Clamp(pos.y / distance, -1f, 1f)) * Mathf.Rad2Deg;
            _pitch = Mathf.Clamp(_pitch, MinPitch, MaxPitch);

            // Yaw: angle around Y axis (atan2 of X and Z components).
            _yaw = Mathf.Atan2(pos.x, pos.z) * Mathf.Rad2Deg;
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
