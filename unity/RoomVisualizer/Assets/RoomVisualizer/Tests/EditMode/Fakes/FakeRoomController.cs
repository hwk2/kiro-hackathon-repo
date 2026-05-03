using System;
using UnityEngine;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// In-memory IRoomController for EditMode tests — no MonoBehaviour lifecycle required.
    /// </summary>
    public class FakeRoomController : IRoomController
    {
        // RoomController stores Dimensions as (width, height, depth) → (x, y, z)
        public Vector3 Dimensions { get; private set; } = new Vector3(5f, 3f, 5f);
        public bool SetDimensionsReturnValue = true;

        public event Action<string> OnValidationError;

        public bool SetDimensions(float width, float depth, float height)
        {
            if (!SetDimensionsReturnValue)
            {
                OnValidationError?.Invoke("Fake validation error");
                return false;
            }
            // Mirror RoomController: Dimensions = new Vector3(width, height, depth)
            Dimensions = new Vector3(width, height, depth);
            return true;
        }

        public Bounds GetRoomBounds() =>
            new Bounds(Vector3.zero, Dimensions);

        public GameObject GetSurface(SurfaceId surfaceId) => null;
    }
}
