using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Fades the two front-facing walls to a configurable transparency when the camera
    /// yaw step changes, and restores the previously front-facing walls to fully opaque.
    ///
    /// Subscribes to <see cref="CameraController.OnYawStepChanged"/> in <c>Start</c>.
    /// Uses <c>renderer.material</c> (not <c>sharedMaterial</c>) to obtain per-instance
    /// materials so that shared material assets are never modified (Requirement 14.4).
    ///
    /// Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
    /// </summary>
    public class WallVisibilityManager : MonoBehaviour, IWallVisibilityManager
    {
        // ── Inspector fields ─────────────────────────────────────────────────

        [SerializeField]
        [Tooltip("Reference to the CameraController. Auto-resolved via FindObjectOfType if not set.")]
        private CameraController _cameraControllerRef;

        [SerializeField]
        [Tooltip("Reference to the RoomController. Auto-resolved via FindObjectOfType if not set.")]
        private RoomController _roomControllerRef;

        [SerializeField]
        [Tooltip("Target alpha for front-facing (faded) walls. Default 0.15.")]
        private float _fadeAlpha = 0.15f;

        [SerializeField]
        [Tooltip("Duration in seconds for the fade/restore transition. Default 0.2s.")]
        private float _fadeDuration = 0.2f;

        // ── IWallVisibilityManager ───────────────────────────────────────────

        /// <inheritdoc/>
        public float FadeAlpha
        {
            get => _fadeAlpha;
            set => _fadeAlpha = value;
        }

        /// <inheritdoc/>
        public float FadeDuration
        {
            get => _fadeDuration;
            set => _fadeDuration = value;
        }

        // ── Wall-pair mapping ────────────────────────────────────────────────

        // Maps each yaw step index to the two front-facing wall SurfaceIds.
        // step 0 (45 deg)  → WallNorth, WallEast
        // step 1 (135 deg) → WallNorth, WallWest
        // step 2 (225 deg) → WallSouth, WallWest
        // step 3 (315 deg) → WallSouth, WallEast
        private static readonly SurfaceId[][] WallPairs = new SurfaceId[][]
        {
            new[] { SurfaceId.WallNorth, SurfaceId.WallEast  }, // step 0
            new[] { SurfaceId.WallNorth, SurfaceId.WallWest  }, // step 1
            new[] { SurfaceId.WallSouth, SurfaceId.WallWest  }, // step 2
            new[] { SurfaceId.WallSouth, SurfaceId.WallEast  }, // step 3
        };

        // ── Internal state ───────────────────────────────────────────────────

        private IRoomController _roomController;
        private IIsometricCameraController _cameraController;

        // The wall pair that is currently faded (front-facing).
        private SurfaceId[] _currentFadedPair;

        // Active coroutines per wall, keyed by SurfaceId, so we can stop them before
        // starting new ones to avoid conflicting alpha animations.
        private readonly Dictionary<SurfaceId, Coroutine> _activeCoroutines =
            new Dictionary<SurfaceId, Coroutine>();

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Start()
        {
            // Resolve RoomController dependency.
            if (_roomControllerRef != null)
            {
                _roomController = _roomControllerRef;
            }
            else
            {
                _roomController = FindObjectOfType<RoomController>();
                if (_roomController == null)
                    Debug.LogWarning("[WallVisibilityManager] No RoomController found in the scene. " +
                                     "Wall GameObjects cannot be resolved.");
            }

            // Resolve CameraController dependency.
            if (_cameraControllerRef != null)
            {
                _cameraController = _cameraControllerRef;
            }
            else
            {
                CameraController found = FindObjectOfType<CameraController>();
                _cameraController = found;
                if (_cameraController == null)
                    Debug.LogWarning("[WallVisibilityManager] No CameraController found in the scene. " +
                                     "Wall visibility will not respond to yaw step changes.");
            }

            // Subscribe to yaw step changes.
            if (_cameraController != null)
                _cameraController.OnYawStepChanged += OnYawStepChanged;

            // Apply initial fade for the current yaw step (if camera is already in isometric mode).
            if (_cameraController != null)
            {
                _currentFadedPair = WallPairs[_cameraController.YawStepIndex];
                FadeWallsImmediate(_currentFadedPair, _fadeAlpha);
            }
        }

        private void OnDestroy()
        {
            // Unsubscribe to avoid dangling event references.
            if (_cameraController != null)
                _cameraController.OnYawStepChanged -= OnYawStepChanged;
        }

        // ── IWallVisibilityManager implementation ────────────────────────────

        /// <summary>
        /// Called when the camera yaw step changes. Fades the new front-facing walls
        /// and restores the previously front-facing walls.
        /// </summary>
        public void OnYawStepChanged(int yawStepIndex)
        {
            if (yawStepIndex < 0 || yawStepIndex >= WallPairs.Length)
            {
                Debug.LogWarning($"[WallVisibilityManager] Invalid yaw step index: {yawStepIndex}");
                return;
            }

            SurfaceId[] newPair = WallPairs[yawStepIndex];
            SurfaceId[] previousPair = _currentFadedPair;

            _currentFadedPair = newPair;

            // Restore previously faded walls that are NOT in the new faded pair.
            if (previousPair != null)
            {
                foreach (SurfaceId surfaceId in previousPair)
                {
                    bool isInNewPair = false;
                    foreach (SurfaceId newId in newPair)
                    {
                        if (newId == surfaceId) { isInNewPair = true; break; }
                    }

                    if (!isInNewPair)
                        StartFadeCoroutine(surfaceId, _fadeAlpha, 1.0f);
                }
            }

            // Fade new front-facing walls from opaque to FadeAlpha.
            foreach (SurfaceId surfaceId in newPair)
            {
                StartFadeCoroutine(surfaceId, 1.0f, _fadeAlpha);
            }
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Stops any existing coroutine for <paramref name="surfaceId"/> and starts a new
        /// fade coroutine from <paramref name="fromAlpha"/> to <paramref name="toAlpha"/>.
        /// </summary>
        private void StartFadeCoroutine(SurfaceId surfaceId, float fromAlpha, float toAlpha)
        {
            // Stop existing coroutine for this wall to avoid conflicts.
            if (_activeCoroutines.TryGetValue(surfaceId, out Coroutine existing) && existing != null)
                StopCoroutine(existing);

            GameObject wallGO = _roomController?.GetSurface(surfaceId);
            if (wallGO == null)
            {
                Debug.LogWarning($"[WallVisibilityManager] Wall GameObject not found for surface: {surfaceId}");
                return;
            }

            Coroutine coroutine = StartCoroutine(FadeWall(wallGO, fromAlpha, toAlpha));
            _activeCoroutines[surfaceId] = coroutine;
        }

        /// <summary>
        /// Immediately sets the alpha of the given walls without animation.
        /// Used for the initial state on Start.
        /// </summary>
        private void FadeWallsImmediate(SurfaceId[] walls, float alpha)
        {
            if (walls == null || _roomController == null) return;

            foreach (SurfaceId surfaceId in walls)
            {
                GameObject wallGO = _roomController.GetSurface(surfaceId);
                if (wallGO == null) continue;

                Renderer rend = wallGO.GetComponent<Renderer>();
                if (rend == null) continue;

                Material mat = rend.material;
                EnsureTransparentMode(mat);
                Color c = mat.color;
                c.a = alpha;
                mat.color = c;
            }
        }

        /// <summary>
        /// Coroutine that smoothly interpolates the alpha of a wall's material instance
        /// from <paramref name="fromAlpha"/> to <paramref name="toAlpha"/> over
        /// <see cref="_fadeDuration"/> seconds.
        ///
        /// Uses <c>renderer.material</c> (not <c>sharedMaterial</c>) to obtain a
        /// per-instance material. Preserves <c>mainTexture</c> and <c>mainTextureScale</c>;
        /// only <c>color.a</c> is modified (Requirements 14.4, 14.5).
        /// </summary>
        private IEnumerator FadeWall(GameObject wallGO, float fromAlpha, float toAlpha)
        {
            Renderer rend = wallGO?.GetComponent<Renderer>();
            if (rend == null) yield break;

            // Use renderer.material (not sharedMaterial) to get per-instance material.
            Material mat = rend.material;
            EnsureTransparentMode(mat);

            float elapsed = 0f;
            while (elapsed < _fadeDuration)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / _fadeDuration);
                Color c = mat.color;
                c.a = Mathf.Lerp(fromAlpha, toAlpha, t);
                mat.color = c;
                yield return null;
            }

            // Ensure final value is exact.
            Color final = mat.color;
            final.a = toAlpha;
            mat.color = final;
        }

        /// <summary>
        /// Switches the given material to Unity Standard shader Transparent rendering mode
        /// so that alpha changes are visible. This is a no-op if the material already
        /// supports transparency.
        /// </summary>
        private static void EnsureTransparentMode(Material mat)
        {
            if (mat == null) return;

            mat.SetFloat("_Mode", 3); // Transparent
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.SetInt("_ZWrite", 0);
            mat.DisableKeyword("_ALPHATEST_ON");
            mat.EnableKeyword("_ALPHABLEND_ON");
            mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            mat.renderQueue = 3000;
        }
    }
}
