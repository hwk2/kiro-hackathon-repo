using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// Minimal IUIBridge stand-in for HttpListenerService tests.
    /// Records calls and fires OnOperationComplete synchronously.
    /// Plain class (not MonoBehaviour) so it works in EditMode tests.
    /// </summary>
    public class FakeUIBridge : IUIBridge
    {
        public event Action<OperationResult> OnOperationComplete;

        public List<string> LoadBlockModelCalls = new List<string>();
        public OperationResult NextResult = new OperationResult
        {
            Success = true,
            OperationName = "LoadBlockModel",
            Message = "ok"
        };

        public void LoadBlockModel(string json)
        {
            LoadBlockModelCalls.Add(json);
            OnOperationComplete?.Invoke(NextResult);
        }

        // Remaining IUIBridge members — fire a generic success result
        public void LoadAsset(string filePath)                                => Fire("LoadAsset");
        public void PlaceObject(string assetRef, Vector3 position)            => Fire("PlaceObject");
        public void MoveObject(string objectId, Vector3 delta)                => Fire("MoveObject");
        public void RotateObject(string objectId, int steps)                  => Fire("RotateObject");
        public void RemoveObject(string objectId)                             => Fire("RemoveObject");
        public void SetSurfaceMaterial(SurfaceId surfaceId, MaterialParams p) => Fire("SetSurfaceMaterial");
        public void SetLightingParameter(LightingParams p)                    => Fire("SetLightingParameter");
        public void SaveScene(string filePath)                                => Fire("SaveScene");
        public void LoadScene(string filePath)                                => Fire("LoadScene");

        private void Fire(string opName) =>
            OnOperationComplete?.Invoke(new OperationResult { Success = true, OperationName = opName });
    }
}
