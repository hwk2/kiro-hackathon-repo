using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Reads keyboard and mouse input every frame and drives object placement,
    /// selection, rotation, and removal. Camera is fixed — no movement controls.
    ///
    /// Controls:
    ///   1-9            — begin placement of starter prefab by slot index
    ///   Left-click     — confirm placement / select a placed object
    ///   R              — rotate selected object 15°
    ///   Delete/Backspace — remove selected object
    ///   Escape         — cancel placement / deselect
    ///   F1             — print controls to Console
    /// </summary>
    [RequireComponent(typeof(RoomVisualizerBootstrapper))]
    public class GameInputHandler : MonoBehaviour
    {
        // ── Inspector ────────────────────────────────────────────────────────

        [Header("Prefabs to place with keys 1-9")]
        [Tooltip("Assign starter prefabs here in order. Key 1 = index 0, Key 2 = index 1, etc.")]
        [SerializeField] private List<GameObject> _placementPrefabs = new List<GameObject>();

        // ── Cached subsystem references ──────────────────────────────────────

        private ObjectPlacer _objectPlacer;
        private RoomVisualizerBootstrapper _bootstrapper;

        // ── State ────────────────────────────────────────────────────────────

        private bool _isPlacing;
        private int  _selectedPrefabIndex = -1;

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Start()
        {
            _bootstrapper = GetComponent<RoomVisualizerBootstrapper>();
            _objectPlacer = _bootstrapper.ObjectPlacer;
            PrintControls();
        }

        private void Update()
        {
            HandlePlacementInput();
            HandleSelectionInput();

            if (Input.GetKeyDown(KeyCode.F1))
                PrintControls();
        }

        // ── Placement ────────────────────────────────────────────────────────

        private void HandlePlacementInput()
        {
            if (_objectPlacer == null) return;

            // Number keys 1-9 — begin placement
            for (int i = 0; i < 9; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1 + i))
                {
                    BeginPlacement(i);
                    break;
                }
            }

            if (!_isPlacing) return;

            // Update cursor world position from mouse raycast against the floor plane
            if (Camera.main != null)
            {
                Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
                Plane floorPlane = new Plane(Vector3.up, Vector3.zero);
                if (floorPlane.Raycast(ray, out float enter))
                {
                    _objectPlacer.CursorWorldPosition = ray.GetPoint(enter);
                    _objectPlacer.CurrentSurface = SurfaceId.Floor;
                }
            }

            // R — rotate the preview object while placing
            if (Input.GetKeyDown(KeyCode.R))
                _objectPlacer.RotatePreview(1);

            // Left-click — confirm placement
            if (Input.GetMouseButtonDown(0))
            {
                PlacementResult result = _objectPlacer.ConfirmPlacement(_objectPlacer.CursorWorldPosition);
                if (result == PlacementResult.Success)
                {
                    string name = _selectedPrefabIndex >= 0 && _selectedPrefabIndex < _placementPrefabs.Count
                        ? _placementPrefabs[_selectedPrefabIndex]?.name ?? "object"
                        : "object";
                    Debug.Log($"[Input] Placed '{name}' successfully.");
                    _isPlacing = false;
                    _selectedPrefabIndex = -1;
                }
                else
                {
                    Debug.LogWarning($"[Input] Placement blocked: {result}");
                }
            }

            // Escape — cancel
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                _objectPlacer.CancelPlacement();
                _isPlacing = false;
                _selectedPrefabIndex = -1;
                Debug.Log("[Input] Placement cancelled.");
            }
        }

        private void BeginPlacement(int index)
        {
            if (index >= _placementPrefabs.Count || _placementPrefabs[index] == null)
            {
                Debug.LogWarning($"[Input] No prefab at slot {index + 1}. " +
                                 "Run 'Tools → RoomVisualizer → Create Playtest Scene' to auto-assign prefabs.");
                return;
            }

            _objectPlacer.BeginPlacement(_placementPrefabs[index]);
            _isPlacing = true;
            _selectedPrefabIndex = index;
            Debug.Log($"[Input] Placing '{_placementPrefabs[index].name}' — left-click to confirm, Escape to cancel.");
        }

        // ── Selection ────────────────────────────────────────────────────────

        private void HandleSelectionInput()
        {
            if (_objectPlacer == null || _isPlacing) return;

            // Left-click — try to select a placed object via raycast
            if (Input.GetMouseButtonDown(0) && Camera.main != null)
            {
                Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
                if (Physics.Raycast(ray, out RaycastHit hit))
                {
                    GameObject clicked = hit.collider.gameObject;
                    foreach (GameObject placed in _objectPlacer.PlacedObjects)
                    {
                        if (placed == clicked || clicked.transform.IsChildOf(placed.transform))
                        {
                            _objectPlacer.SelectObject(placed);
                            Debug.Log($"[Input] Selected '{placed.name}'.");
                            return;
                        }
                    }
                }
                // Clicked empty space — deselect
                _objectPlacer.DeselectCurrent();
            }

            // R — rotate the selected object
            if (Input.GetKeyDown(KeyCode.R) && _objectPlacer.HasSelection)
            {
                _objectPlacer.RotateObject(_objectPlacer.SelectedObject, 1);
            }

            // Delete / Backspace — remove the selected object
            if ((Input.GetKeyDown(KeyCode.Delete) || Input.GetKeyDown(KeyCode.Backspace))
                && _objectPlacer.HasSelection)
            {
                GameObject toRemove = _objectPlacer.SelectedObject;
                Debug.Log($"[Input] Removing '{toRemove.name}'.");
                _objectPlacer.RemoveObject(toRemove);
            }

            // Escape — deselect
            if (Input.GetKeyDown(KeyCode.Escape))
                _objectPlacer.DeselectCurrent();
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static void PrintControls()
        {
            Debug.Log(
                "=== RoomVisualizer Controls ===\n" +
                "  1-9        — place prefab by slot\n" +
                "  Left-click — confirm placement / select object\n" +
                "  R          — rotate selected object 15°\n" +
                "  Delete     — remove selected object\n" +
                "  Escape     — cancel placement / deselect\n" +
                "  F1         — show this help\n" +
                "================================");
        }
    }
}
