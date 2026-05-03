using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Maintains per-surface placement grids for Floor, WallNorth, WallSouth, WallEast,
    /// and WallWest. Converts between grid coordinates and world-space positions, and
    /// tracks cell occupancy.
    ///
    /// Grid coordinate systems:
    ///   Floor      — gridX → world X,  gridY → world Z.  Origin at (-width/2, 0, -depth/2).
    ///   WallNorth  — gridX → world X,  gridY → world Y.  Origin at (-width/2, 0, +depth/2).
    ///   WallSouth  — gridX → world X,  gridY → world Y.  Origin at (-width/2, 0, -depth/2).
    ///   WallEast   — gridX → world Z,  gridY → world Y.  Origin at (+width/2, 0, -depth/2).
    ///   WallWest   — gridX → world Z,  gridY → world Y.  Origin at (-width/2, 0, -depth/2).
    ///
    /// Requirements: 15.1–15.6
    /// </summary>
    public class PlacementGridManager : MonoBehaviour, IPlacementGridManager
    {
        // ── Inspector fields ─────────────────────────────────────────────────

        [SerializeField]
        [Tooltip("Side length of one grid cell in metres.")]
        private float _cellSize = 0.5f;

        [SerializeField]
        [Tooltip("RoomController reference. Auto-resolved via FindObjectOfType if not set.")]
        private RoomController _roomControllerRef;

        // ── IPlacementGridManager ────────────────────────────────────────────

        /// <inheritdoc/>
        public float CellSize => _cellSize;

        // ── Internal state ───────────────────────────────────────────────────

        private IRoomController _roomController;

        // Per-surface grid dimensions (in cells).
        private readonly Dictionary<SurfaceId, Vector2Int> _gridSizes =
            new Dictionary<SurfaceId, Vector2Int>();

        // Per-surface occupancy sets, keyed by (gridX, gridY).
        private readonly Dictionary<SurfaceId, HashSet<Vector2Int>> _occupancy =
            new Dictionary<SurfaceId, HashSet<Vector2Int>>();

        // Surfaces that have placement grids (Ceiling is excluded).
        private static readonly SurfaceId[] PlacementSurfaces =
        {
            SurfaceId.Floor,
            SurfaceId.WallNorth,
            SurfaceId.WallSouth,
            SurfaceId.WallEast,
            SurfaceId.WallWest
        };

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Initialise occupancy sets for all placement surfaces.
            foreach (SurfaceId s in PlacementSurfaces)
                _occupancy[s] = new HashSet<Vector2Int>();

            // Resolve room controller.
            if (_roomControllerRef != null)
            {
                _roomController = _roomControllerRef;
            }
            else
            {
                _roomController = FindObjectOfType<RoomController>();
                if (_roomController == null)
                    Debug.LogWarning("[PlacementGridManager] No RoomController found. " +
                                     "Grid extents will not be calculated until one is available.");
            }

            // Subscribe to dimension changes so grids stay in sync.
            if (_roomControllerRef != null)
                _roomControllerRef.OnDimensionsChanged += _ => RecalculateGrids();
            else if (_roomController is RoomController rc)
                rc.OnDimensionsChanged += _ => RecalculateGrids();

            RecalculateGrids();
        }

        // ── IPlacementGridManager implementation ─────────────────────────────

        /// <inheritdoc/>
        public void RecalculateGrids()
        {
            if (_roomController == null)
                return;

            Vector3 dims = _roomController.Dimensions;
            float w = dims.x; // width
            float h = dims.y; // height
            float d = dims.z; // depth

            // Floor: width × depth
            _gridSizes[SurfaceId.Floor]     = new Vector2Int(CellCount(w), CellCount(d));
            // North/South walls: width × height
            _gridSizes[SurfaceId.WallNorth] = new Vector2Int(CellCount(w), CellCount(h));
            _gridSizes[SurfaceId.WallSouth] = new Vector2Int(CellCount(w), CellCount(h));
            // East/West walls: depth × height
            _gridSizes[SurfaceId.WallEast]  = new Vector2Int(CellCount(d), CellCount(h));
            _gridSizes[SurfaceId.WallWest]  = new Vector2Int(CellCount(d), CellCount(h));

            // Clear all occupancy data — callers (e.g. SceneSerializer) must re-register
            // placed objects after a dimension change.
            foreach (SurfaceId s in PlacementSurfaces)
                _occupancy[s].Clear();
        }

        /// <inheritdoc/>
        public Vector3 GridToWorld(SurfaceId surface, int gridX, int gridY)
        {
            if (_roomController == null)
                return Vector3.zero;

            Vector3 dims = _roomController.Dimensions;
            float w = dims.x;
            float h = dims.y;
            float d = dims.z;
            float half = _cellSize * 0.5f;

            switch (surface)
            {
                case SurfaceId.Floor:
                    // Origin at (-w/2, 0, -d/2); cell centre offset by half a cell.
                    return new Vector3(
                        -w * 0.5f + gridX * _cellSize + half,
                        0f,
                        -d * 0.5f + gridY * _cellSize + half);

                case SurfaceId.WallNorth:
                    // North wall at Z = +d/2, facing inward (-Z).
                    return new Vector3(
                        -w * 0.5f + gridX * _cellSize + half,
                        gridY * _cellSize + half,
                        d * 0.5f);

                case SurfaceId.WallSouth:
                    // South wall at Z = -d/2, facing inward (+Z).
                    return new Vector3(
                        -w * 0.5f + gridX * _cellSize + half,
                        gridY * _cellSize + half,
                        -d * 0.5f);

                case SurfaceId.WallEast:
                    // East wall at X = +w/2, facing inward (-X). gridX maps to Z.
                    return new Vector3(
                        w * 0.5f,
                        gridY * _cellSize + half,
                        -d * 0.5f + gridX * _cellSize + half);

                case SurfaceId.WallWest:
                    // West wall at X = -w/2, facing inward (+X). gridX maps to Z.
                    return new Vector3(
                        -w * 0.5f,
                        gridY * _cellSize + half,
                        -d * 0.5f + gridX * _cellSize + half);

                default:
                    Debug.LogWarning($"[PlacementGridManager] GridToWorld: surface '{surface}' has no grid.");
                    return Vector3.zero;
            }
        }

        /// <inheritdoc/>
        public Vector2Int WorldToGrid(SurfaceId surface, Vector3 worldPosition)
        {
            if (_roomController == null)
                return Vector2Int.zero;

            Vector3 dims = _roomController.Dimensions;
            float w = dims.x;
            float h = dims.y;
            float d = dims.z;

            int gx, gy;

            switch (surface)
            {
                case SurfaceId.Floor:
                    gx = Mathf.FloorToInt((worldPosition.x + w * 0.5f) / _cellSize);
                    gy = Mathf.FloorToInt((worldPosition.z + d * 0.5f) / _cellSize);
                    break;

                case SurfaceId.WallNorth:
                case SurfaceId.WallSouth:
                    gx = Mathf.FloorToInt((worldPosition.x + w * 0.5f) / _cellSize);
                    gy = Mathf.FloorToInt(worldPosition.y / _cellSize);
                    break;

                case SurfaceId.WallEast:
                case SurfaceId.WallWest:
                    gx = Mathf.FloorToInt((worldPosition.z + d * 0.5f) / _cellSize);
                    gy = Mathf.FloorToInt(worldPosition.y / _cellSize);
                    break;

                default:
                    Debug.LogWarning($"[PlacementGridManager] WorldToGrid: surface '{surface}' has no grid.");
                    return Vector2Int.zero;
            }

            // Clamp to valid grid bounds.
            Vector2Int size = GetGridSize(surface);
            gx = Mathf.Clamp(gx, 0, Mathf.Max(0, size.x - 1));
            gy = Mathf.Clamp(gy, 0, Mathf.Max(0, size.y - 1));
            return new Vector2Int(gx, gy);
        }

        /// <inheritdoc/>
        public bool IsCellOccupied(SurfaceId surface, int gridX, int gridY)
        {
            if (!_occupancy.TryGetValue(surface, out HashSet<Vector2Int> set))
                return false;
            return set.Contains(new Vector2Int(gridX, gridY));
        }

        /// <inheritdoc/>
        public void MarkOccupied(SurfaceId surface, int gridX, int gridY, int width, int height)
        {
            if (!_occupancy.TryGetValue(surface, out HashSet<Vector2Int> set))
                return;

            for (int dx = 0; dx < width; dx++)
                for (int dy = 0; dy < height; dy++)
                    set.Add(new Vector2Int(gridX + dx, gridY + dy));
        }

        /// <inheritdoc/>
        public void MarkUnoccupied(SurfaceId surface, int gridX, int gridY, int width, int height)
        {
            if (!_occupancy.TryGetValue(surface, out HashSet<Vector2Int> set))
                return;

            for (int dx = 0; dx < width; dx++)
                for (int dy = 0; dy < height; dy++)
                    set.Remove(new Vector2Int(gridX + dx, gridY + dy));
        }

        // ── Public helpers ───────────────────────────────────────────────────

        /// <summary>
        /// Returns the grid dimensions (columns × rows) for the given surface.
        /// Returns <see cref="Vector2Int.zero"/> for surfaces without a grid (e.g. Ceiling).
        /// </summary>
        public Vector2Int GetGridSize(SurfaceId surface)
        {
            _gridSizes.TryGetValue(surface, out Vector2Int size);
            return size;
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Returns the number of whole cells that fit in <paramref name="metres"/>.
        /// Always at least 1.
        /// </summary>
        private int CellCount(float metres)
        {
            return Mathf.Max(1, Mathf.CeilToInt(metres / _cellSize));
        }
    }
}
