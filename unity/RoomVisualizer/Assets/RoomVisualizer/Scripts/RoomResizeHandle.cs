using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// A single draggable handle sphere on one edge of the room floor.
    /// Highlights on hover, turns cyan while dragging.
    ///
    /// When dragging inward (shrinking the room), the new dimension is clamped so
    /// the wall never overlaps any placed object. The minimum safe dimension is
    /// computed by scanning all placed objects and finding the furthest extent along
    /// this handle's axis.
    /// </summary>
    public class RoomResizeHandle : MonoBehaviour
    {
        // ── Configuration (set by RoomResizer) ───────────────────────────────

        /// <summary>Which axis this handle moves along: Vector3.right (X) or Vector3.forward (Z).</summary>
        public Vector3 Axis { get; set; }

        /// <summary>+1 = positive side of the axis (East/North), -1 = negative side (West/South).</summary>
        public float Sign { get; set; }

        /// <summary>RoomController to resize.</summary>
        public RoomController Room { get; set; }

        /// <summary>ObjectPlacer used to query placed objects for collision clamping.</summary>
        public ObjectPlacer Placer { get; set; }

        /// <summary>Base colour including alpha, set by RoomResizer at creation time.</summary>
        public Color NormalColor { get; set; } = new Color(0.9f, 0.2f, 0.2f, 0.55f);

        private Color HoverColor => new Color(1f, 0.85f, 0f, NormalColor.a);
        private Color DragColor  => new Color(0f, 0.85f, 1f, NormalColor.a);

        // ── Internal state ────────────────────────────────────────────────────

        private Renderer _renderer;
        private bool     _isDragging;
        private Vector3  _dragStartMouseWorld;
        private float    _dragStartDimension;

        // ── Unity lifecycle ───────────────────────────────────────────────────

        private void Awake()
        {
            _renderer = GetComponent<Renderer>();
        }

        private void OnMouseEnter()
        {
            if (!_isDragging) SetColor(HoverColor);
        }

        private void OnMouseExit()
        {
            if (!_isDragging) SetColor(NormalColor);
        }

        private void OnMouseDown()
        {
            _isDragging = true;
            SetColor(DragColor);
            _dragStartMouseWorld = MouseOnFloorPlane();
            _dragStartDimension  = CurrentDimension();
        }

        private void OnMouseDrag()
        {
            if (!_isDragging || Room == null) return;

            Vector3 delta    = MouseOnFloorPlane() - _dragStartMouseWorld;
            float axisDelta  = Vector3.Dot(delta, Axis) * Sign;
            float rawDim     = _dragStartDimension + axisDelta;

            // Clamp to [minSafe, 50] so the wall never overlaps a placed object.
            float minSafe = MinSafeDimension();
            float newDim  = Mathf.Clamp(rawDim, minSafe, 50f);

            Vector3 dims = Room.Dimensions;
            if (Axis == Vector3.right)
                Room.SetDimensions(newDim, dims.z, dims.y);
            else
                Room.SetDimensions(dims.x, newDim, dims.y);
        }

        private void OnMouseUp()
        {
            _isDragging = false;
            SetColor(NormalColor);
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private float CurrentDimension() =>
            Room == null ? 5f : (Axis == Vector3.right ? Room.Dimensions.x : Room.Dimensions.z);

        /// <summary>
        /// Returns the minimum dimension (width or depth) that keeps all placed objects
        /// clear of the wall this handle controls.
        ///
        /// For each placed object, we find the furthest extent of its world-space bounds
        /// along this handle's axis (on the same side as this handle). The wall must stay
        /// at least that far out, plus a small clearance gap.
        /// </summary>
        private float MinSafeDimension()
        {
            const float Clearance = 0.05f; // 5 cm gap between object and wall
            const float AbsMin    = 1f;    // hard minimum from RoomController

            if (Placer == null || Placer.PlacedObjects == null)
                return AbsMin;

            float maxExtent = 0f;

            foreach (GameObject obj in Placer.PlacedObjects)
            {
                if (obj == null) continue;

                Renderer[] renderers = obj.GetComponentsInChildren<Renderer>();
                if (renderers.Length == 0) continue;

                // Compute world-space bounds of this object.
                Bounds b = renderers[0].bounds;
                for (int i = 1; i < renderers.Length; i++)
                    b.Encapsulate(renderers[i].bounds);

                // Find the extent of this object along the handle's axis on this handle's side.
                // e.g. East handle (Axis=right, Sign=+1): we care about b.max.x
                //      West handle (Axis=right, Sign=-1): we care about -b.min.x
                float extent;
                if (Axis == Vector3.right)
                    extent = Sign > 0 ? b.max.x : -b.min.x;
                else
                    extent = Sign > 0 ? b.max.z : -b.min.z;

                if (extent > maxExtent)
                    maxExtent = extent;
            }

            // The dimension must be at least 2 * maxExtent (symmetric room) + clearance.
            // But the room is centred at origin, so the wall is at ±dim/2.
            // Wall position = dim/2. Object extent = maxExtent. Constraint: dim/2 >= maxExtent.
            // Therefore: dim >= maxExtent * 2 + clearance * 2.
            float minFromObjects = maxExtent * 2f + Clearance * 2f;
            return Mathf.Max(AbsMin, minFromObjects);
        }

        private static Vector3 MouseOnFloorPlane()
        {
            if (Camera.main == null) return Vector3.zero;
            Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            Plane plane = new Plane(Vector3.up, Vector3.zero);
            return plane.Raycast(ray, out float enter) ? ray.GetPoint(enter) : Vector3.zero;
        }

        private void SetColor(Color c)
        {
            if (_renderer != null)
                _renderer.material.color = c;
        }
    }
}
