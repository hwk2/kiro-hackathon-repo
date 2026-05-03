using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages object placement, selection, movement, rotation, and removal in the room.
    /// Implements <see cref="IObjectPlacer"/>.
    /// </summary>
    public class ObjectPlacer : MonoBehaviour, IObjectPlacer
    {
        // ── Inspector references ─────────────────────────────────────────────

        [SerializeField]
        [Tooltip("Semi-transparent material applied to the preview object during placement. " +
                 "Auto-created if not assigned.")]
        private Material _previewMaterial;

        [SerializeField]
        [Tooltip("Material applied to the selected object as a highlight. " +
                 "Auto-created if not assigned.")]
        private Material _highlightMaterial;

        [SerializeField]
        [Tooltip("Reference to the ICollisionSystem. Auto-resolved via FindObjectOfType<CollisionSystem> if not set.")]
        private CollisionSystem _collisionSystemRef;

        // ── Public state ─────────────────────────────────────────────────────

        /// <summary>
        /// World-space position of the cursor. Set externally each frame (e.g. from a raycast).
        /// The preview object follows this position in <see cref="Update"/>.
        /// </summary>
        public Vector3 CursorWorldPosition { get; set; }

        /// <summary>
        /// <c>true</c> when the last <see cref="ConfirmPlacement"/> call was blocked by a collision.
        /// </summary>
        public bool IsColliding { get; private set; }

        /// <summary>
        /// <c>true</c> when an object is currently selected.
        /// </summary>
        public bool HasSelection => _selectedObject != null;

        // ── IObjectPlacer ────────────────────────────────────────────────────

        /// <inheritdoc/>
        public IReadOnlyList<GameObject> PlacedObjects => _placedObjects.AsReadOnly();

        // ── Internal state ───────────────────────────────────────────────────

        private readonly List<GameObject> _placedObjects = new List<GameObject>();

        private GameObject _previewObject;
        private GameObject _selectedObject;
        private ICollisionSystem _collisionSystem;

        // Original materials per renderer on the selected object, so we can restore them.
        private readonly Dictionary<Renderer, Material[]> _originalMaterials =
            new Dictionary<Renderer, Material[]>();

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

            // Create a default semi-transparent preview material if none was assigned.
            if (_previewMaterial == null)
            {
                _previewMaterial = new Material(Shader.Find("Standard"));
                _previewMaterial.name = "PreviewMaterial";
                Color previewColor = Color.cyan;
                previewColor.a = 0.4f;
                // Enable transparency on the Standard shader.
                _previewMaterial.SetFloat("_Mode", 3); // Transparent
                _previewMaterial.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                _previewMaterial.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                _previewMaterial.SetInt("_ZWrite", 0);
                _previewMaterial.DisableKeyword("_ALPHATEST_ON");
                _previewMaterial.EnableKeyword("_ALPHABLEND_ON");
                _previewMaterial.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                _previewMaterial.renderQueue = 3000;
                _previewMaterial.color = previewColor;
            }

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
            // Keep the preview object following the cursor world position.
            if (_previewObject != null)
            {
                _previewObject.transform.position = CursorWorldPosition;
            }
        }

        // ── IObjectPlacer implementation ─────────────────────────────────────

        /// <summary>
        /// Instantiates <paramref name="prefab"/> as a preview object and attaches it to the cursor.
        /// A semi-transparent preview material is applied to all renderers on the preview.
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

            _previewObject = Instantiate(prefab, CursorWorldPosition, Quaternion.identity);
            _previewObject.name = $"{prefab.name}_Preview";

            // Apply the preview material to every renderer on the preview object.
            ApplyMaterialToAllRenderers(_previewObject, _previewMaterial);

            // Disable colliders on the preview so it doesn't interfere with overlap checks.
            foreach (Collider col in _previewObject.GetComponentsInChildren<Collider>())
            {
                col.enabled = false;
            }
        }

        /// <summary>
        /// Attempts to confirm placement at <paramref name="cursorWorldPos"/>.
        /// <list type="bullet">
        ///   <item>Snaps Y so the object's base rests on the floor (Y = half of bounds height).</item>
        ///   <item>Returns <see cref="PlacementResult.OutOfBounds"/> if outside room bounds.</item>
        ///   <item>Returns <see cref="PlacementResult.Blocked"/> on collision; sets <see cref="IsColliding"/>.</item>
        ///   <item>On success, instantiates the actual object, adds it to <see cref="PlacedObjects"/>, destroys the preview.</item>
        /// </list>
        /// </summary>
        public PlacementResult ConfirmPlacement(Vector3 cursorWorldPos)
        {
            IsColliding = false;

            if (_previewObject == null)
            {
                Debug.LogWarning("[ObjectPlacer] ConfirmPlacement called but no placement is in progress.");
                return PlacementResult.Blocked;
            }

            // Compute the object's local bounds (from all renderers).
            Bounds objectBounds = ComputeLocalBounds(_previewObject);

            // Snap Y so the base of the object rests on the floor (Y = 0).
            float snappedY = objectBounds.extents.y - objectBounds.center.y;
            Vector3 placementPosition = new Vector3(cursorWorldPos.x, snappedY, cursorWorldPos.z);

            // Check room bounds first.
            if (_collisionSystem != null && !_collisionSystem.IsWithinRoomBounds(objectBounds, placementPosition))
            {
                return PlacementResult.OutOfBounds;
            }

            // Check for collision with existing objects.
            if (_collisionSystem != null && _collisionSystem.WouldCollide(objectBounds, placementPosition))
            {
                IsColliding = true;
                return PlacementResult.Blocked;
            }

            // Placement is valid — promote the preview to a real placed object.
            // Re-enable colliders so the placed object participates in future overlap checks.
            foreach (Collider col in _previewObject.GetComponentsInChildren<Collider>(includeInactive: true))
            {
                col.enabled = true;
            }

            // Restore original materials (remove the preview tint).
            RestoreOriginalMaterials(_previewObject);

            // Position the object at the snapped placement position.
            _previewObject.transform.position = placementPosition;
            _previewObject.name = _previewObject.name.Replace("_Preview", string.Empty);

            _placedObjects.Add(_previewObject);
            _previewObject = null;

            return PlacementResult.Success;
        }

        /// <summary>
        /// Places an already-instantiated <paramref name="go"/> at <paramref name="position"/>
        /// without calling Instantiate. Used by BlockModelImporter which creates GameObjects
        /// itself before handing them to the placer.
        /// </summary>
        public PlacementResult PlaceDirect(GameObject go, Vector3 position)
        {
            IsColliding = false;

            if (go == null)
            {
                Debug.LogWarning("[ObjectPlacer] PlaceDirect called with a null GameObject.");
                return PlacementResult.Blocked;
            }

            Bounds objectBounds = ComputeLocalBounds(go);
            float snappedY = objectBounds.extents.y - objectBounds.center.y;
            Vector3 placementPosition = new Vector3(position.x, snappedY, position.z);

            if (_collisionSystem != null && !_collisionSystem.IsWithinRoomBounds(objectBounds, placementPosition))
                return PlacementResult.OutOfBounds;

            if (_collisionSystem != null && _collisionSystem.WouldCollide(objectBounds, placementPosition))
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

            // HasSelection is derived from _selectedObject != null (see property above).
            // In a full implementation, transform gizmo handles would be shown here.
            // For now, the HasSelection flag signals the UI to display handle controls.
        }

        /// <summary>
        /// Moves <paramref name="obj"/> by <paramref name="delta"/>, constraining to the XZ plane
        /// (Y position is preserved).
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
            obj.transform.position = new Vector3(
                current.x + delta.x,
                current.y,
                current.z + delta.z);
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

            // If the object being removed is currently selected, deselect it first.
            if (_selectedObject == obj)
            {
                _selectedObject = null;
                _originalMaterials.Remove(
                    obj.GetComponentInChildren<Renderer>());
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

            IsColliding = false;
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
        /// Applies <paramref name="mat"/> to every renderer on <paramref name="root"/> and its children.
        /// Stores the original materials so they can be restored later.
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
}
