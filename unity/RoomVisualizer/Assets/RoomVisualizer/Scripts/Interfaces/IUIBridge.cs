using System;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Abstraction over UIBridge used by HttpListenerService so that tests can
    /// substitute a fake implementation without subclassing the concrete MonoBehaviour.
    /// </summary>
    public interface IUIBridge
    {
        event Action<OperationResult> OnOperationComplete;

        void LoadAsset(string filePath);
        void PlaceObject(string assetRef, Vector3 position);
        void MoveObject(string objectId, Vector3 delta);
        void RotateObject(string objectId, int steps);
        void RemoveObject(string objectId);
        void SetSurfaceMaterial(SurfaceId surfaceId, MaterialParams p);
        void SetLightingParameter(LightingParams p);
        void SaveScene(string filePath);
        void LoadScene(string filePath);
        void LoadBlockModel(string blockModelJson);
    }
}
