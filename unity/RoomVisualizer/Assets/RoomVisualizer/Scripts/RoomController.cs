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

        /// <summary>
        /// Raised after SetDimensions succeeds, carrying the new dimensions.
        /// Subscribers (e.g. PlacementGridManager) use this to recalculate grids.
        /// </summary>
        public event Action<Vector3> OnDimensionsChanged;

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
            OnDimensionsChanged?.Invoke(Dimensions);
            return true;
        }

        /// <summary>
        /// Returns an axis-aligned <see cref="Bounds"/> whose bottom face sits on Y=0
        /// (the floor plane) and whose extents match the current room dimensions.
        /// The centre is at (0, height/2, 0) so the room spans Y from 0 to height.
        /// </summary>
        public Bounds GetRoomBounds()
        {
            // Dimensions: x = width, y = height, z = depth.
            // Centre at half-height so the floor is at Y=0 and ceiling at Y=height.
            return new Bounds(
                new Vector3(0f, Dimensions.y * 0.5f, 0f),
                Dimensions);
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
        /// Creates the six surface child GameObjects as Plane primitives with double-sided
        /// materials so they are visible from both inside and outside the room.
        /// Called once in Awake.
        /// </summary>
        private void CreateSurfaces()
        {
            foreach (SurfaceId id in Enum.GetValues(typeof(SurfaceId)))
            {
                // Use Plane primitive — it is 10×10 units by default (we rescale it).
                // Planes are visible from both sides in Unity's Standard shader by default
                // when the camera is inside the room bounds.
                GameObject surface = GameObject.CreatePrimitive(PrimitiveType.Plane);
                surface.name = id.ToString();
                surface.transform.SetParent(transform, worldPositionStays: false);

                // Remove the collider — room surfaces must not block Physics.OverlapBox.
                Collider col = surface.GetComponent<Collider>();
                if (col != null)
                    Destroy(col);

                // Apply a distinct default color per surface so the room is immediately
                // readable without any SurfaceManager configuration.
                MeshRenderer rend = surface.GetComponent<MeshRenderer>();
                if (rend != null)
                {
                    Material mat = new Material(Shader.Find("Standard"));
                    mat.name = $"{id}_Material";
                    switch (id)
                    {
                        case SurfaceId.Floor:   mat.color = new Color(0.55f, 0.45f, 0.35f); break; // warm tan
                        case SurfaceId.Ceiling: mat.color = new Color(0.92f, 0.92f, 0.92f); break; // off-white
                        default:                mat.color = new Color(0.80f, 0.78f, 0.75f); break; // light grey walls
                    }
                    rend.sharedMaterial = mat;
                }

                _surfaces[id] = surface;
            }
        }

        /// <summary>
        /// Repositions and rescales all six surface GameObjects to match
        /// the current <see cref="Dimensions"/>.
        ///
        /// Unity's Plane primitive is 10×10 units, so we divide by 10 to get metre-scale.
        /// Planes are rendered double-sided by default, so all surfaces are visible from
        /// inside the room regardless of camera angle.
        /// </summary>
        private void UpdateSurfaceTransforms()
        {
            float w = Dimensions.x; // width  (X axis)
            float h = Dimensions.y; // height (Y axis)
            float d = Dimensions.z; // depth  (Z axis)

            float halfW = w * 0.5f;
            float halfH = h * 0.5f;
            float halfD = d * 0.5f;

            // Plane is 10×10 units — divide by 10 to convert to metres.
            const float S = 0.1f;

            // ── Floor ────────────────────────────────────────────────────────
            // Plane default normal faces +Y — no rotation needed.
            SetSurfaceTransform(SurfaceId.Floor,
                position: new Vector3(0f, 0f, 0f),
                eulerAngles: new Vector3(0f, 0f, 0f),
                scale: new Vector3(w * S, 1f, d * S));

            // ── Ceiling ──────────────────────────────────────────────────────
            // Flip 180° around Z so the normal faces -Y (downward, into the room).
            SetSurfaceTransform(SurfaceId.Ceiling,
                position: new Vector3(0f, h, 0f),
                eulerAngles: new Vector3(180f, 0f, 0f),
                scale: new Vector3(w * S, 1f, d * S));

            // ── WallNorth ────────────────────────────────────────────────────
            // Rotate 90° around X so the plane stands upright, then 180° around Y
            // so the normal faces -Z (inward toward room centre).
            SetSurfaceTransform(SurfaceId.WallNorth,
                position: new Vector3(0f, halfH, halfD),
                eulerAngles: new Vector3(90f, 180f, 0f),
                scale: new Vector3(w * S, 1f, h * S));

            // ── WallSouth ────────────────────────────────────────────────────
            // Normal faces +Z (inward).
            SetSurfaceTransform(SurfaceId.WallSouth,
                position: new Vector3(0f, halfH, -halfD),
                eulerAngles: new Vector3(90f, 0f, 0f),
                scale: new Vector3(w * S, 1f, h * S));

            // ── WallEast ─────────────────────────────────────────────────────
            // Normal faces -X (inward).
            SetSurfaceTransform(SurfaceId.WallEast,
                position: new Vector3(halfW, halfH, 0f),
                eulerAngles: new Vector3(90f, -90f, 0f),
                scale: new Vector3(d * S, 1f, h * S));

            // ── WallWest ─────────────────────────────────────────────────────
            // Normal faces +X (inward).
            SetSurfaceTransform(SurfaceId.WallWest,
                position: new Vector3(-halfW, halfH, 0f),
                eulerAngles: new Vector3(90f, 90f, 0f),
                scale: new Vector3(d * S, 1f, h * S));
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
