using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Creates four drag handles on the edges of the room floor (North, South, East, West).
    /// Handles are hidden by default and shown only when the floor is selected.
    /// Call <see cref="ShowHandles"/> / <see cref="HideHandles"/> to toggle visibility.
    /// </summary>
    public class RoomResizer : MonoBehaviour
    {
        [SerializeField]
        [Tooltip("RoomController to resize. Auto-resolved if not set.")]
        private RoomController _roomController;

        [SerializeField]
        [Tooltip("ObjectPlacer used for collision clamping. Auto-resolved if not set.")]
        private ObjectPlacer _objectPlacer;

        [SerializeField]
        [Tooltip("Radius of each handle sphere in metres.")]
        private float _handleRadius = 0.22f;

        // Semi-transparent colours — alpha 0.55 so they're clearly visible but not opaque.
        // Red for X axis (East/West), blue for Z axis (North/South), matching Unity gizmo convention.
        private static readonly Color EastColor  = new Color(0.9f, 0.2f, 0.2f, 0.55f);
        private static readonly Color WestColor  = new Color(0.9f, 0.2f, 0.2f, 0.55f);
        private static readonly Color NorthColor = new Color(0.2f, 0.45f, 0.95f, 0.55f);
        private static readonly Color SouthColor = new Color(0.2f, 0.45f, 0.95f, 0.55f);

        private RoomResizeHandle _north, _south, _east, _west;

        public bool IsVisible { get; private set; }

        private void Start()
        {
            if (_roomController == null)
                _roomController = FindObjectOfType<RoomController>();

            if (_objectPlacer == null)
                _objectPlacer = FindObjectOfType<ObjectPlacer>();

            if (_roomController == null)
            {
                Debug.LogWarning("[RoomResizer] No RoomController found — resize handles disabled.");
                return;
            }

            CreateHandles();
            _roomController.OnDimensionsChanged += _ => UpdateHandlePositions();

            // Hidden by default — shown when the floor is clicked.
            HideHandles();
        }

        // ── Public API ────────────────────────────────────────────────────────

        public void ShowHandles()
        {
            IsVisible = true;
            SetHandlesActive(true);
        }

        public void HideHandles()
        {
            IsVisible = false;
            SetHandlesActive(false);
        }

        public void ToggleHandles()
        {
            if (IsVisible) HideHandles();
            else ShowHandles();
        }

        // ── Private helpers ───────────────────────────────────────────────────

        private void SetHandlesActive(bool active)
        {
            if (_north != null) _north.gameObject.SetActive(active);
            if (_south != null) _south.gameObject.SetActive(active);
            if (_east  != null) _east.gameObject.SetActive(active);
            if (_west  != null) _west.gameObject.SetActive(active);
        }

        private void CreateHandles()
        {
            _north = CreateHandle("Handle_North", Vector3.forward,  +1f, NorthColor);
            _south = CreateHandle("Handle_South", Vector3.forward,  -1f, SouthColor);
            _east  = CreateHandle("Handle_East",  Vector3.right,    +1f, EastColor);
            _west  = CreateHandle("Handle_West",  Vector3.right,    -1f, WestColor);

            UpdateHandlePositions();
        }

        private RoomResizeHandle CreateHandle(string handleName, Vector3 axis, float sign, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = handleName;
            go.transform.SetParent(transform, worldPositionStays: false);
            go.transform.localScale = Vector3.one * (_handleRadius * 2f);

            var rend = go.GetComponent<Renderer>();
            if (rend != null)
            {
                var mat = new Material(Shader.Find("Standard"));

                // Enable transparency on the Standard shader.
                mat.SetFloat("_Mode", 3); // Transparent
                mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                mat.SetInt("_ZWrite", 0);
                mat.DisableKeyword("_ALPHATEST_ON");
                mat.EnableKeyword("_ALPHABLEND_ON");
                mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                mat.renderQueue = 3000;
                mat.color = color;

                // Slight emission so the handle is readable in low ambient light.
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", new Color(color.r, color.g, color.b) * 0.3f);

                rend.sharedMaterial = mat;
            }

            var handle = go.AddComponent<RoomResizeHandle>();
            handle.Axis        = axis;
            handle.Sign        = sign;
            handle.Room        = _roomController;
            handle.Placer      = _objectPlacer;
            handle.NormalColor = color;

            return handle;
        }

        private void UpdateHandlePositions()
        {
            if (_roomController == null) return;

            Vector3 d = _roomController.Dimensions;
            float halfW = d.x * 0.5f;
            float halfD = d.z * 0.5f;
            float y = _handleRadius;

            if (_north != null) _north.transform.position = new Vector3(0f,     y,  halfD);
            if (_south != null) _south.transform.position = new Vector3(0f,     y, -halfD);
            if (_east  != null) _east.transform.position  = new Vector3( halfW, y,  0f);
            if (_west  != null) _west.transform.position  = new Vector3(-halfW, y,  0f);
        }
    }
}
