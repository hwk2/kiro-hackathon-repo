using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    public interface IObjectPlacer
    {
        void BeginPlacement(GameObject prefab);
        PlacementResult ConfirmPlacement(Vector3 cursorWorldPos);
        /// <summary>
        /// Places an already-instantiated GameObject directly (no Instantiate call).
        /// Used by BlockModelImporter which creates GOs itself before placement.
        /// </summary>
        PlacementResult PlaceDirect(GameObject go, Vector3 position);
        void SelectObject(GameObject obj);
        void MoveObject(GameObject obj, Vector3 delta);
        void RotateObject(GameObject obj, int steps);
        void RemoveObject(GameObject obj);
        IReadOnlyList<GameObject> PlacedObjects { get; }
        bool IsColliding { get; }
    }
}
