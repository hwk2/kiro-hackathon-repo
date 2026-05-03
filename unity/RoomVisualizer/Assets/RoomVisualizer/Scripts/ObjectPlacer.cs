using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages object placement, selection, movement, rotation, and removal in the room.
    /// Implements <see cref="IObjectPlacer"/>.
    ///
    /// Extended in task 18.1 to support:
    ///   - Grid snapping via <see cref="IPlacementGridManager"/>
    ///   - Surface-type validation via <see cref="PlaceableObject.AllowedSurfaces"/>
    ///   - Green/red validity-color preview material
    ///   - Occupancy tracking via <see cref="IPlacementGridManager.MarkOccupied"/> /
    ///     <see cref="IPlacementGridManager.MarkUnoccupied"/>
    ///
    /// Requirements: 16.3, 16.4, 17.1, 17.2, 17.3, 17.4, 17.5,
    ///               18.1, 18.2, 18.3, 18.4, 18.5,
    ///               19.1, 19.2, 19.3, 19.4, 19.5, 19.6
    /// </summary>
    public class ObjectPlacer : MonoBehaviour, IObjectPlacer
    {
        // ── Inspector references ─────────────────────────────────────────────

        /// <summary>
        /// Kept for backward compatibility. Initialized to the green valid-preview material
        /// in Awake. Callers that assigned a custom material via the inspector will have it
        /// overridden by the validity-color system.
        /// </summary>
        [SerializeField]
        [Tooltip("Legacy preview material field — kept for backward compatibility. " +
                 "The validity-color system (green/red) is used at runtime.")]
        private Material _previewMaterial;

        [SerializeField]
        [Tooltip("Material applied to the selected object as a highlight. " +
                 "Auto-created if not assigned.")]
        private Material _highlightMaterial;

        [SerializeField]
        [Tooltip("Reference to the ICollisionSystem. Auto-resolved via FindObjectOfType<CollisionSystem> if not set.")]
        private CollisionSystem _collisionSystemRef;

        [SerializeField]
        [Tooltip("Reference to the IPlacementGridManager. Auto-resolved via FindObjectOfType<PlacementGridManager> if not set.")]
        private PlacementGridManager _gridManagerRef;

        // ── Public state ─────────────────────────────────────────────────────

        /// <summary>
        /// World-space position of the cursor. Set externally each frame (e.g. from a raycast).
        /// The preview object follows the snapped grid position derived from this in <see cref="Update"/>.
        /// </summary>
        public Vector3 CursorWorldPosition { get; set; }

        /// <summary>
        /// The surface the cursor is currently hovering over. Set externally (e.g. from a raycast
        /// that identifies which surface was hit). Defaults to <see cref="SurfaceId.Floor"/>.
        /// </summary>
        public SurfaceId CurrentSurface { get; set; } = SurfaceId.Floor;

        /// <summary>
        /// <c>true</c> when the last <see cref="ConfirmPlacement"/> call was blocked by a collision.
        /// </summary>
        public bool IsColliding { get; private set; }

        /// <summary>
        /// <c>true</c> when an object is currently selected.
        /// </summary>
        public bool HasSelection => _selectedObject != null;

        /// <summary>
        /// The currently selected <see cref="GameObject"/>, or <c>null</c> if nothing is selected.
        /// </summary>
        public GameObject SelectedObject => _selectedObject;

        // ── IObjectPlacer ────────────────────────────────────────────────────

        /// <inheritdoc/>
        public IReadOnlyList<GameObject> PlacedObjects => _placedObjects.AsReadOnly();

        // ── Internal state ───────────────────────────────────────────────────

        private readonly List<GameObject> _placedObjects = new List<GameObject>();

        private GameObject _previewObject;
        private GameObject _selectedObject;
        private ICollisionSystem _collisionSystem;
        private IPlacementGridManager _gridManager;

        // PlaceableObject data read from the prefab at BeginPlacement time.
        private PlaceableObject _currentPlaceableObject;

        // Valid/invalid preview materials (green/red).
        private Material _validPreviewMaterial;
        private Material _invalidPreviewMaterial;

        // Original materials per renderer on the selected object, so we can restore them.
        private readonly Dictionary<Renderer, Material[]> _originalMaterials =
            new Dictionary<Renderer, Material[]>();

        // Tracks grid data for each placed object so we can call MarkUnoccupied on removal.
        private readonly Dictionary<GameObject, PlacedObjectGridData> _placedGridData =
            new Dictionary<GameObject, PlacedObjectGridData>();

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Resolve collision system dependency.
            if (_collisionSystemRef != null)
            {
                _collisionSystem = _collisionSystemRef;
            }
            else
            {
                _collisionSystem = FindObjectOfType<CollisionSystem>();

                if (_collisionSystem == null)
                {
                    Debug.LogWarning(
                        "[ObjectPlacer] No ICollisionSystem found in the scene. " +
                        "Assign one via the inspector or ensure a CollisionSystem exists.");
                }
            }

            // Resolve grid manager dependency.
            if (_gridManagerRef != null)
            {
                _gridManager = _gridManagerRef;
            }
            else
            {
                _gridManager = FindObjectOfType<PlacementGridManager>();
                // Not a hard error — grid snapping is optional if no manager is present.
            }

            // ── Create validity-color preview materials ───────────────────────

            _validPreviewMaterial   = CreateTransparentMaterial(new Color(0f, 1f, 0f, 0.4f), "ValidPreviewMaterial");
            _invalidPreviewMaterial = CreateTransparentMaterial(new Color(1f, 0f, 0f, 0.4f), "InvalidPreviewMaterial");

            // Keep _previewMaterial pointing at the valid (green) material for backward compat.
            if (_previewMaterial == null)
                _previewMaterial = _validPreviewMaterial;

            // Create a default highlight material if none was assigned.
            if (_highlightMaterial == null)
            {
                _highlightMaterial = new Material(Shader.Find("Standard"));
                _highlightMaterial.name = "HighlightMaterial";
                _highlightMaterial.EnableKeyword("_EMISSION");
                _highlightMaterial.SetColor("_EmissionColor", Color.yellow * 0.5f);
            }
        }

        private void Update()
        {
            if (_previewObject == null)
                return;

            // Snap preview to nearest valid grid cell (Req 17.3).
            Vector3 snappedPos = SnapToGrid(CurrentSurface, CursorWorldPosition);

            // For floor placement, lift the preview so its base sits on Y=0
            // rather than its centre (which would half-sink it into the floor).
            if (CurrentSurface == SurfaceId.Floor)
            {
                Bounds b = ComputeWorldBounds(_previewObject);
                snappedPos.y = b.extents.y;
            }

            _previewObject.transform.position = snappedPos;

            // Determine anchor cell for the current footprint.
            int width  = _currentPlaceableObject != null ? _currentPlaceableObject.GridWidth  : 1;
            int height = _currentPlaceableObject != null ? _currentPlaceableObject.GridHeight : 1;

            Vector2Int cell = _gridManager != null
                ? _gridManager.WorldToGrid(CurrentSurface, snappedPos)
                : Vector2Int.zero;

            int anchorX = cell.x - width  / 2;
            int anchorY = cell.y - height / 2;

            // Clamp anchor so even-sized footprints near the grid edge don't go negative.
            if (_gridManager != null)
            {
                var gridSize = (_gridManager as PlacementGridManager)?.GetGridSize(CurrentSurface)
                               ?? Vector2Int.zero;
                anchorX = Mathf.Clamp(anchorX, 0, Mathf.Max(0, gridSize.x - width));
                anchorY = Mathf.Clamp(anchorY, 0, Mathf.Max(0, gridSize.y - height));
            }

            // Update preview color based on current validity (Req 18.3).
            bool valid = IsPlacementValid(CurrentSurface, anchorX, anchorY, width, height);
            Material previewMat = valid ? _validPreviewMaterial : _invalidPreviewMaterial;
            ApplyMaterialToAllRenderers(_previewObject, previewMat);
        }

        // ── IObjectPlacer implementation ─────────────────────────────────────

        /// <summary>
        /// Instantiates <paramref name="prefab"/> as a preview object and attaches it to the cursor.
        /// Reads the <see cref="PlaceableObject"/> component from the prefab to determine allowed
        /// surfaces and grid footprint. Falls back to floor-only 1x1 if the component is absent
        /// (Req 16.4).
        /// </summary>
        public void BeginPlacement(GameObject prefab)
        {
            if (prefab == null)
            {
                Debug.LogWarning("[ObjectPlacer] BeginPlacement called with a null prefab.");
                return;
            }

            // Destroy any existing preview before starting a new one.
            CancelPlacement();

            // Read PlaceableObject component from the prefab (not the instance).
            _currentPlaceableObject = prefab.GetComponent<PlaceableObject>();
            if (_currentPlaceableObject == null)
            {
                // Req 16.4: treat as floor-only 1x1 and log a warning.
                Debug.LogWarning(
                    $"[ObjectPlacer] Prefab '{prefab.name}' has no PlaceableObject component. " +
                    "Defaulting to Floor-only, 1x1 grid footprint.");
            }

            _previewObject = Instantiate(prefab, CursorWorldPosition, Quaternion.identity);
            _previewObject.name = $"{prefab.name}_Preview";

            // Apply the valid (green) preview material initially.
            ApplyMaterialToAllRenderers(_previewObject, _validPreviewMaterial);

            // Disable colliders on the preview so it doesn't interfere with overlap checks.
            foreach (Collider col in _previewObject.GetComponentsInChildren<Collider>())
            {
                col.enabled = false;
            }
        }

        /// <summary>
        /// Attempts to confirm placement at <paramref name="cursorWorldPos"/>.
        /// Performs surface-type, grid-bounds, and occupancy checks in addition to the
        /// existing collision check. On success, snaps the object to the grid and marks
        /// the footprint cells as occupied.
        /// </summary>
        public PlacementResult ConfirmPlacement(Vector3 cursorWorldPos)
        {
            IsColliding = false;

            if (_previewObject == null)
            {
                Debug.LogWarning("[ObjectPlacer] ConfirmPlacement called but no placement is in progress.");
                return PlacementResult.Blocked;
            }

            int width  = _currentPlaceableObject != null ? _currentPlaceableObject.GridWidth  : 1;
            int height = _currentPlaceableObject != null ? _currentPlaceableObject.GridHeight : 1;

            // ── 1. Surface-type check (Req 19.1) ─────────────────────────────
            if (_currentPlaceableObject != null &&
                _currentPlaceableObject.AllowedSurfaces != null &&
                _currentPlaceableObject.AllowedSurfaces.Count > 0 &&
                !_currentPlaceableObject.AllowedSurfaces.Contains(CurrentSurface))
            {
                return PlacementResult.Blocked;
            }

            // ── 2. Grid-bounds and occupancy checks (Req 19.2, 19.3) ─────────
            // Use the same snapped XZ position the preview is showing so the
            // validity check in Update and ConfirmPlacement always agree.
            Vector3 snappedCursor = SnapToGrid(CurrentSurface, cursorWorldPos);
            Vector2Int cell = _gridManager != null
                ? _gridManager.WorldToGrid(CurrentSurface, snappedCursor)
                : Vector2Int.zero;

            // Anchor: top-left corner of the footprint, clamped so it never goes
            // negative (which would cause a false OutOfBounds for even-sized footprints
            // near the grid origin).
            int anchorX = cell.x - width  / 2;
            int anchorY = cell.y - height / 2;

            if (_gridManager != null)
            {
                var gridSize = (_gridManager as PlacementGridManager)?.GetGridSize(CurrentSurface)
                               ?? Vector2Int.zero;

                // Clamp anchor so the footprint stays within the grid.
                anchorX = Mathf.Clamp(anchorX, 0, Mathf.Max(0, gridSize.x - width));
                anchorY = Mathf.Clamp(anchorY, 0, Mathf.Max(0, gridSize.y - height));

                // Grid-bounds check (Req 19.2).
                if (anchorX + width > gridSize.x || anchorY + height > gridSize.y)
                {
                    return PlacementResult.OutOfBounds;
                }

                // Occupancy check (Req 19.3).
                for (int dx = 0; dx < width; dx++)
                    for (int dy = 0; dy < height; dy++)
                        if (_gridManager.IsCellOccupied(CurrentSurface, anchorX + dx, anchorY + dy))
                        {
                            IsColliding = true;
                            return PlacementResult.Blocked;
                        }
            }

            // ── 3. Snap placement position to grid (Req 17.1, 17.2) ──────────
            Vector3 placementPosition;
            if (_gridManager != null)
            {
                // Anchor cell -> world centre of the footprint.
                int centreX = anchorX + width  / 2;
                int centreY = anchorY + height / 2;
                placementPosition = _gridManager.GridToWorld(CurrentSurface, centreX, centreY);

                // GridToWorld returns the surface plane position (Y=0 for floor).
                // The object pivot is at its centre, so we must lift it by half its
                // world-space height so the base sits on the surface rather than
                // clipping through it.
                if (CurrentSurface == SurfaceId.Floor)
                {
                    Bounds b = ComputeWorldBounds(_previewObject);
                    float halfHeight = b.extents.y;
                    placementPosition.y = halfHeight;
                }
            }
            else
            {
                // Fallback: snap Y so the base rests on the floor.
                Bounds objectBounds = ComputeWorldBounds(_previewObject);
                float snappedY = objectBounds.extents.y;
                placementPosition = new Vector3(cursorWorldPos.x, snappedY, cursorWorldPos.z);
            }

            // ── 4. Room-bounds check ──────────────────────────────────────────
            // Use world-space bounds of the preview (already positioned at placementPosition)
            // rather than local bounds + position offset, which would double-count the Y lift.
            if (_collisionSystem != null)
            {
                // Temporarily move the preview to the placement position so world bounds are accurate.
                Vector3 prevPos = _previewObject.transform.position;
                _previewObject.transform.position = placementPosition;
                Bounds worldBounds = ComputeWorldBounds(_previewObject);
                _previewObject.transform.position = prevPos;

                Bounds roomBounds = _collisionSystem.GetRoomBounds();
                bool inBounds = roomBounds.Contains(worldBounds.min) && roomBounds.Contains(worldBounds.max);
                if (!inBounds)
                    return PlacementResult.OutOfBounds;
            }

            // ── 5. Collision check with existing objects (Req 19.4) ───────────
            if (_collisionSystem != null && _collisionSystem.WouldCollide(ComputeLocalBounds(_previewObject), placementPosition))
            {
                IsColliding = true;
                return PlacementResult.Blocked;
            }

            // ── 6. Promote preview to placed object ───────────────────────────
            foreach (Collider col in _previewObject.GetComponentsInChildren<Collider>(includeInactive: true))
                col.enabled = true;

            RestoreOriginalMaterials(_previewObject);

            _previewObject.transform.position = placementPosition;
            _previewObject.name = _previewObject.name.Replace("_Preview", string.Empty);

            // Mark grid cells occupied (Req 19.5).
            if (_gridManager != null)
            {
                _gridManager.MarkOccupied(CurrentSurface, anchorX, anchorY, width, height);
                _placedGridData[_previewObject] = new PlacedObjectGridData(
                    CurrentSurface, anchorX, anchorY, width, height);
            }

            _placedObjects.Add(_previewObject);
            _previewObject = null;
            _currentPlaceableObject = null;

            return PlacementResult.Success;
        }

        /// <summary>
        /// Places an already-instantiated <paramref name="go"/> at <paramref name="position"/>
        /// without calling Instantiate. Used by BlockModelImporter which creates GameObjects
        /// itself before handing them to the placer.
        /// Snaps to grid if <see cref="IPlacementGridManager"/> is available.
        /// </summary>
        public PlacementResult PlaceDirect(GameObject go, Vector3 position)
        {
            IsColliding = false;

            if (go == null)
            {
                Debug.LogWarning("[ObjectPlacer] PlaceDirect called with a null GameObject.");
                return PlacementResult.Blocked;
            }

            Vector3 placementPosition = position;

            if (_gridManager != null)
            {
                // Snap to nearest grid cell on the floor (PlaceDirect is floor-only for BlockModel).
                Vector2Int snappedCell = _gridManager.WorldToGrid(SurfaceId.Floor, position);
                placementPosition = _gridManager.GridToWorld(SurfaceId.Floor, snappedCell.x, snappedCell.y);
            }
            else
            {
                Bounds objectBounds = ComputeLocalBounds(go);
                float snappedY = objectBounds.extents.y - objectBounds.center.y;
                placementPosition = new Vector3(position.x, snappedY, position.z);
            }

            Bounds bounds = ComputeLocalBounds(go);

            if (_collisionSystem != null && !_collisionSystem.IsWithinRoomBounds(bounds, placementPosition))
                return PlacementResult.OutOfBounds;

            if (_collisionSystem != null && _collisionSystem.WouldCollide(bounds, placementPosition))
            {
                IsColliding = true;
                return PlacementResult.Blocked;
            }

            go.transform.position = placementPosition;
            _placedObjects.Add(go);
            return PlacementResult.Success;
        }

        /// <summary>
        /// Selects <paramref name="obj"/>, applying a highlight effect and setting
        /// <see cref="HasSelection"/> to <c>true</c>.
        /// </summary>
        public void SelectObject(GameObject obj)
        {
            // Deselect any previously selected object first.
            DeselectCurrent();

            if (obj == null)
            {
                Debug.LogWarning("[ObjectPlacer] SelectObject called with a null object.");
                return;
            }

            _selectedObject = obj;

            // Apply highlight by enabling emission on all renderers.
            foreach (Renderer rend in obj.GetComponentsInChildren<Renderer>())
            {
                // Store original materials so we can restore them on deselect.
                if (!_originalMaterials.ContainsKey(rend))
                {
                    _originalMaterials[rend] = rend.sharedMaterials;
                }

                // Apply emission highlight to each material instance.
                Material[] highlightedMaterials = new Material[rend.sharedMaterials.Length];
                for (int i = 0; i < highlightedMaterials.Length; i++)
                {
                    // Create a material instance to avoid modifying the shared asset.
                    Material mat = new Material(rend.sharedMaterials[i]);
                    mat.EnableKeyword("_EMISSION");
                    mat.SetColor("_EmissionColor", Color.yellow * 0.4f);
                    highlightedMaterials[i] = mat;
                }
                rend.materials = highlightedMaterials;
            }
        }

        /// <summary>
        /// Moves <paramref name="obj"/> by <paramref name="delta"/>, constraining to the XZ plane
        /// (Y position is preserved). Snaps to the nearest grid cell after the move (Req 17.4).
        /// </summary>
        public void MoveObject(GameObject obj, Vector3 delta)
        {
            if (obj == null)
            {
                Debug.LogWarning("[ObjectPlacer] MoveObject called with a null object.");
                return;
            }

            Vector3 current = obj.transform.position;
            // Apply delta only on X and Z; preserve Y.
            Vector3 moved = new Vector3(current.x + delta.x, current.y, current.z + delta.z);

            if (_gridManager != null)
            {
                // Determine which surface this object is on (use stored data if available).
                SurfaceId surface = SurfaceId.Floor;
                if (_placedGridData.TryGetValue(obj, out PlacedObjectGridData data))
                    surface = data.Surface;

                Vector2Int snappedCell = _gridManager.WorldToGrid(surface, moved);
                Vector3 snapped = _gridManager.GridToWorld(surface, snappedCell.x, snappedCell.y);
                // Preserve Y for floor objects (GridToWorld returns Y=0 for floor).
                if (surface == SurfaceId.Floor)
                    snapped.y = current.y;
                moved = snapped;
            }

            obj.transform.position = moved;
        }

        /// <summary>
        /// Rotates <paramref name="obj"/> by <c><paramref name="steps"/> * 15</c> degrees around the Y axis.
        /// </summary>
        public void RotateObject(GameObject obj, int steps)
        {
            if (obj == null)
            {
                Debug.LogWarning("[ObjectPlacer] RotateObject called with a null object.");
                return;
            }

            float degrees = steps * 15f;
            obj.transform.Rotate(Vector3.up, degrees, Space.World);
        }

        /// <summary>
        /// Destroys <paramref name="obj"/> and removes it from <see cref="PlacedObjects"/>.
        /// Calls <see cref="IPlacementGridManager.MarkUnoccupied"/> for the object's footprint
        /// (Req 19.6).
        /// Does nothing if <paramref name="obj"/> is null or not in the placed objects list.
        /// </summary>
        public void RemoveObject(GameObject obj)
        {
            if (obj == null)
            {
                // Silently ignore null — do not throw.
                return;
            }

            if (!_placedObjects.Contains(obj))
            {
                // Object is not tracked — do nothing.
                return;
            }

            // Mark grid cells unoccupied (Req 19.6).
            if (_gridManager != null && _placedGridData.TryGetValue(obj, out PlacedObjectGridData gridData))
            {
                _gridManager.MarkUnoccupied(gridData.Surface, gridData.GridX, gridData.GridY,
                                            gridData.GridWidth, gridData.GridHeight);
                _placedGridData.Remove(obj);
            }

            // If the object being removed is currently selected, deselect it first.
            if (_selectedObject == obj)
            {
                _selectedObject = null;
                _originalMaterials.Remove(obj.GetComponentInChildren<Renderer>());
            }

            _placedObjects.Remove(obj);
            Destroy(obj);
        }

        // ── Public helpers ───────────────────────────────────────────────────

        /// <summary>
        /// Cancels an in-progress placement, destroying the preview object.
        /// </summary>
        public void CancelPlacement()
        {
            if (_previewObject != null)
            {
                Destroy(_previewObject);
                _previewObject = null;
            }

            _currentPlaceableObject = null;
            IsColliding = false;
        }

        /// <summary>
        /// Rotates the current placement preview by <c><paramref name="steps"/> * 15</c>
        /// degrees around the Y axis. Has no effect if no placement is in progress.
        /// </summary>
        public void RotatePreview(int steps)
        {
            if (_previewObject == null) return;
            _previewObject.transform.Rotate(Vector3.up, steps * 15f, Space.World);
        }

        /// <summary>
        /// Deselects the currently selected object, restoring its original materials.
        /// </summary>
        public void DeselectCurrent()
        {
            if (_selectedObject == null)
                return;

            // Restore original materials on all renderers.
            foreach (Renderer rend in _selectedObject.GetComponentsInChildren<Renderer>())
            {
                if (_originalMaterials.TryGetValue(rend, out Material[] originals))
                {
                    rend.sharedMaterials = originals;
                }
            }

            _originalMaterials.Clear();
            _selectedObject = null;
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Returns <c>true</c> when the footprint anchored at
        /// (<paramref name="anchorX"/>, <paramref name="anchorY"/>) on <paramref name="surface"/>
        /// is valid: surface type allowed, all cells within bounds, and no cell occupied.
        /// </summary>
        private bool IsPlacementValid(SurfaceId surface, int anchorX, int anchorY, int width, int height)
        {
            // 1. Surface type check.
            if (_currentPlaceableObject != null &&
                _currentPlaceableObject.AllowedSurfaces != null &&
                _currentPlaceableObject.AllowedSurfaces.Count > 0 &&
                !_currentPlaceableObject.AllowedSurfaces.Contains(surface))
                return false;

            // 2. Grid bounds and occupancy checks.
            if (_gridManager != null)
            {
                var gridSize = (_gridManager as PlacementGridManager)?.GetGridSize(surface)
                               ?? Vector2Int.zero;

                if (anchorX < 0 || anchorY < 0 ||
                    anchorX + width > gridSize.x || anchorY + height > gridSize.y)
                    return false;

                // 3. Occupancy check.
                for (int dx = 0; dx < width; dx++)
                    for (int dy = 0; dy < height; dy++)
                        if (_gridManager.IsCellOccupied(surface, anchorX + dx, anchorY + dy))
                            return false;
            }

            return true;
        }

        /// <summary>
        /// Snaps <paramref name="worldPos"/> to the nearest grid cell centre on
        /// <paramref name="surface"/>. Returns <paramref name="worldPos"/> unchanged if no
        /// grid manager is available.
        /// </summary>
        private Vector3 SnapToGrid(SurfaceId surface, Vector3 worldPos)
        {
            if (_gridManager == null)
                return worldPos;

            Vector2Int cell = _gridManager.WorldToGrid(surface, worldPos);
            return _gridManager.GridToWorld(surface, cell.x, cell.y);
        }

        /// <summary>
        /// Creates a new Standard-shader material with transparency enabled and the given color.
        /// </summary>
        private static Material CreateTransparentMaterial(Color color, string name)
        {
            var mat = new Material(Shader.Find("Standard"));
            mat.name = name;
            mat.SetFloat("_Mode", 3); // Transparent
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            mat.SetInt("_ZWrite", 0);
            mat.DisableKeyword("_ALPHATEST_ON");
            mat.EnableKeyword("_ALPHABLEND_ON");
            mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            mat.renderQueue = 3000;
            mat.color = color;
            return mat;
        }

        /// <summary>
        /// Applies <paramref name="mat"/> to every renderer on <paramref name="root"/> and its children.
        /// </summary>
        private void ApplyMaterialToAllRenderers(GameObject root, Material mat)
        {
            foreach (Renderer rend in root.GetComponentsInChildren<Renderer>())
            {
                // Build a uniform array of the preview material.
                Material[] previewMats = new Material[rend.sharedMaterials.Length];
                for (int i = 0; i < previewMats.Length; i++)
                    previewMats[i] = mat;

                rend.materials = previewMats;
            }
        }

        /// <summary>
        /// Restores the original materials on all renderers of <paramref name="root"/>.
        /// Called when a preview is promoted to a real placed object.
        /// </summary>
        private void RestoreOriginalMaterials(GameObject root)
        {
            // The preview object had its materials replaced; we need to restore them.
            // Since we didn't store originals for the preview (it was instantiated fresh),
            // we simply clear the override so Unity uses the prefab's shared materials.
            foreach (Renderer rend in root.GetComponentsInChildren<Renderer>())
            {
                // Assign sharedMaterials back to itself to clear any per-instance overrides.
                rend.materials = rend.sharedMaterials;
            }
        }

        /// <summary>
        /// Computes the combined world-space <see cref="Bounds"/> of all renderers on
        /// <paramref name="root"/> and its children.
        /// Falls back to a unit cube centred at the root's position if no renderers are found.
        /// Unlike <see cref="ComputeLocalBounds"/>, this returns bounds in world space so
        /// <c>extents.y</c> directly gives the half-height needed to lift the pivot to the floor.
        /// </summary>
        private static Bounds ComputeWorldBounds(GameObject root)
        {
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>();

            if (renderers.Length == 0)
                return new Bounds(root.transform.position, Vector3.one);

            Bounds combined = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
                combined.Encapsulate(renderers[i].bounds);

            return combined;
        }

        /// <summary>
        /// Computes the combined local-space <see cref="Bounds"/> of all renderers on
        /// <paramref name="root"/> and its children, expressed relative to the root's pivot.
        /// Falls back to a unit cube if no renderers are found.
        /// </summary>
        private static Bounds ComputeLocalBounds(GameObject root)
        {
            Renderer[] renderers = root.GetComponentsInChildren<Renderer>();

            if (renderers.Length == 0)
            {
                // No renderers — use a default unit-cube bounds centred at the pivot.
                return new Bounds(Vector3.zero, Vector3.one);
            }

            // Start with the first renderer's bounds and encapsulate the rest.
            Bounds combined = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
            {
                combined.Encapsulate(renderers[i].bounds);
            }

            // Convert world-space bounds centre to local space relative to the root pivot.
            Vector3 localCenter = root.transform.InverseTransformPoint(combined.center);
            return new Bounds(localCenter, combined.size);
        }
    }

    // ── Supporting data class ────────────────────────────────────────────────

    /// <summary>
    /// Records the grid placement data for a placed object so that
    /// <see cref="ObjectPlacer.RemoveObject"/> can call
    /// <see cref="IPlacementGridManager.MarkUnoccupied"/> with the correct footprint.
    /// </summary>
    internal sealed class PlacedObjectGridData
    {
        public readonly SurfaceId Surface;
        public readonly int GridX;
        public readonly int GridY;
        public readonly int GridWidth;
        public readonly int GridHeight;

        public PlacedObjectGridData(SurfaceId surface, int gridX, int gridY, int gridWidth, int gridHeight)
        {
            Surface    = surface;
            GridX      = gridX;
            GridY      = gridY;
            GridWidth  = gridWidth;
            GridHeight = gridHeight;
        }
    }
}
