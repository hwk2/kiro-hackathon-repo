using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// In-memory IObjectPlacer for EditMode tests — records placements without Physics calls.
    ///
    /// Key difference from real ObjectPlacer:
    ///   BeginPlacement stores the GO directly (BlockModelImporter passes an already-instantiated
    ///   object, not a prefab). The real ObjectPlacer calls Instantiate; we must NOT do that here
    ///   or we'd double-instantiate and the original GO would never be placed.
    /// </summary>
    public class FakeObjectPlacer : IObjectPlacer
    {
        public PlacementResult PlacementResultToReturn = PlacementResult.Success;

        // IObjectPlacer requires IsColliding
        public bool IsColliding { get; private set; }

        private readonly List<GameObject> _placed = new List<GameObject>();
        private GameObject _pending;

        public IReadOnlyList<GameObject> PlacedObjects => _placed;

        /// <summary>
        /// Stores the already-instantiated GO as pending (does NOT call Instantiate).
        /// </summary>
        public void BeginPlacement(GameObject prefab) => _pending = prefab;

        public PlacementResult ConfirmPlacement(Vector3 cursorWorldPos)
        {
            IsColliding = false;

            if (PlacementResultToReturn == PlacementResult.Blocked)
            {
                IsColliding = true;
                return PlacementResult.Blocked;
            }

            if (PlacementResultToReturn == PlacementResult.OutOfBounds)
                return PlacementResult.OutOfBounds;

            if (_pending != null)
            {
                // Mirror real ObjectPlacer: only update X and Z; Y is snapped by the placer.
                _pending.transform.position = new Vector3(cursorWorldPos.x, _pending.transform.position.y, cursorWorldPos.z);
                _placed.Add(_pending);
                _pending = null;
            }

            return PlacementResult.Success;
        }

        public PlacementResult PlaceDirect(GameObject go, Vector3 position)
        {
            if (PlacementResultToReturn != PlacementResult.Success)
            {
                IsColliding = PlacementResultToReturn == PlacementResult.Blocked;
                return PlacementResultToReturn;
            }

            if (go != null)
            {
                go.transform.position = new Vector3(position.x, go.transform.position.y, position.z);
                _placed.Add(go);
            }

            return PlacementResult.Success;
        }

        public void SelectObject(GameObject obj) { }
        public void MoveObject(GameObject obj, Vector3 delta) { }
        public void RotateObject(GameObject obj, int steps) { }

        public void RemoveObject(GameObject obj)
        {
            _placed.Remove(obj);
            Object.DestroyImmediate(obj);
        }
    }
}
