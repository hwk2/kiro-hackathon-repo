using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages the room geometry: dimensions, surface child GameObjects, and validation.
    /// Implements IRoomController.
    /// </summary>
    public class RoomController : MonoBehaviour, IRoomController
    {
        // ── Constants ────────────────────────────────────────────────────────

        private const float MinDimension = 1f;
        private const float MaxDimension = 50f;

        // Default room size: 5 m wide × 5 m deep × 3 m tall
        private const float DefaultWidth  = 5f;
        private const float DefaultDepth  = 5f;
        private const float DefaultHeight = 3f;

        // ── IRoomController ──────────────────────────────────────────────────

        /// <inheritdoc/>
        public Vector3 Dimensions { get; private set; }

        /// <inheritdoc/>
        public event Action<string> OnValidationError;

        // ── Internal state ───────────────────────────────────────────────────

        // Maps each SurfaceId to its child GameObject
        private readonly Dictionary<SurfaceId, GameObject> _surfaces =
            new Dictionary<SurfaceId, GameObject>();

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Initialise dimensions to defaults
            Dimensions = new Vector3(DefaultWidth, DefaultHeight, DefaultDepth);

            // Create the six surface child GameObjects
            CreateSurfaces();

            // Position / scale them to match the default dimensions
            UpdateSurfaceTransforms();
        }

        // ── IRoomController implementation ───────────────────────────────────

        /// <summary>
        /// Sets the room dimensions. All three values must be in [1, 50] metres.
        /// Returns <c>false</c> and raises <see cref="OnValidationError"/> if any value is out of range.
        /// </summary>
        public bool SetDimensions(float width, float depth, float height)
        {
            if (!IsValidDimension(width))
            {
                OnValidationError?.Invoke(
                    $"Width {width} m is out of range. Must be between {MinDimension} and {MaxDimension} metres.");
                return false;
            }

            if (!IsValidDimension(depth))
            {
                OnValidationError?.Invoke(
                    $"Depth {depth} m is out of range. Must be between {MinDimension} and {MaxDimension} metres.");
                return false;
            }

            if (!IsValidDimension(height))
            {
                OnValidationError?.Invoke(
                    $"Height {height} m is out of range. Must be between {MinDimension} and {MaxDimension} metres.");
                return false;
            }

            Dimensions = new Vector3(width, height, depth);
            UpdateSurfaceTransforms();
            return true;
        }

        /// <summary>
        /// Returns an axis-aligned <see cref="Bounds"/> centred at the world origin
        /// whose extents match the current room dimensions.
        /// </summary>
        public Bounds GetRoomBounds()
        {
            // Dimensions: x = width, y = height, z = depth
            return new Bounds(Vector3.zero, Dimensions);
        }

        /// <summary>
        /// Returns the child <see cref="GameObject"/> representing the given surface.
        /// </summary>
        public GameObject GetSurface(SurfaceId surfaceId)
        {
            _surfaces.TryGetValue(surfaceId, out GameObject surface);
            return surface;
        }

        // ── Private helpers ──────────────────────────────────────────────────

        private static bool IsValidDimension(float value)
        {
            return value >= MinDimension && value <= MaxDimension;
        }

        /// <summary>
        /// Creates the six surface child GameObjects as Quad primitives.
        /// Called once in Awake.
        /// </summary>
        private void CreateSurfaces()
        {
            foreach (SurfaceId id in Enum.GetValues(typeof(SurfaceId)))
            {
                // Create a Quad primitive (flat, unit-sized plane)
                GameObject surface = GameObject.CreatePrimitive(PrimitiveType.Quad);
                surface.name = id.ToString();
                surface.transform.SetParent(transform, worldPositionStays: false);

                // Remove the collider added by CreatePrimitive — the room surfaces
                // should not participate in Physics.OverlapBox queries for object placement.
                Collider col = surface.GetComponent<Collider>();
                if (col != null)
                    Destroy(col);

                _surfaces[id] = surface;
            }
        }

        /// <summary>
        /// Repositions and rescales all six surface GameObjects to match
        /// the current <see cref="Dimensions"/>.
        /// </summary>
        private void UpdateSurfaceTransforms()
        {
            float w = Dimensions.x; // width  (X axis)
            float h = Dimensions.y; // height (Y axis)
            float d = Dimensions.z; // depth  (Z axis)

            float halfW = w * 0.5f;
            float halfH = h * 0.5f;
            float halfD = d * 0.5f;

            // ── Floor ────────────────────────────────────────────────────────
            // Lies flat on the XZ plane at Y = 0 (bottom of the room).
            // A Quad's default normal faces +Z; rotate -90° around X to face +Y.
            SetSurfaceTransform(SurfaceId.Floor,
                position: new Vector3(0f, 0f, 0f),
                eulerAngles: new Vector3(90f, 0f, 0f),
                scale: new Vector3(w, d, 1f));

            // ── Ceiling ──────────────────────────────────────────────────────
            // Lies flat at Y = h, normal facing -Y (inward).
            SetSurfaceTransform(SurfaceId.Ceiling,
                position: new Vector3(0f, h, 0f),
                eulerAngles: new Vector3(-90f, 0f, 0f),
                scale: new Vector3(w, d, 1f));

            // ── WallNorth ────────────────────────────────────────────────────
            // Faces -Z (north wall at +Z edge), normal facing -Z (inward).
            SetSurfaceTransform(SurfaceId.WallNorth,
                position: new Vector3(0f, halfH, halfD),
                eulerAngles: new Vector3(0f, 180f, 0f),
                scale: new Vector3(w, h, 1f));

            // ── WallSouth ────────────────────────────────────────────────────
            // Faces +Z (south wall at -Z edge), normal facing +Z (inward).
            SetSurfaceTransform(SurfaceId.WallSouth,
                position: new Vector3(0f, halfH, -halfD),
                eulerAngles: new Vector3(0f, 0f, 0f),
                scale: new Vector3(w, h, 1f));

            // ── WallEast ─────────────────────────────────────────────────────
            // Faces -X (east wall at +X edge), normal facing -X (inward).
            SetSurfaceTransform(SurfaceId.WallEast,
                position: new Vector3(halfW, halfH, 0f),
                eulerAngles: new Vector3(0f, 90f, 0f),
                scale: new Vector3(d, h, 1f));

            // ── WallWest ─────────────────────────────────────────────────────
            // Faces +X (west wall at -X edge), normal facing +X (inward).
            SetSurfaceTransform(SurfaceId.WallWest,
                position: new Vector3(-halfW, halfH, 0f),
                eulerAngles: new Vector3(0f, -90f, 0f),
                scale: new Vector3(d, h, 1f));
        }

        private void SetSurfaceTransform(
            SurfaceId id,
            Vector3 position,
            Vector3 eulerAngles,
            Vector3 scale)
        {
            if (!_surfaces.TryGetValue(id, out GameObject surface) || surface == null)
                return;

            Transform t = surface.transform;
            t.localPosition = position;
            t.localEulerAngles = eulerAngles;
            t.localScale = scale;
        }
    }
}
