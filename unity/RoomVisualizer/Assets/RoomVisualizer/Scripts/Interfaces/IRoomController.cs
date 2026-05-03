using UnityEngine;

namespace RoomVisualizer
{
    public interface IRoomController
    {
        Vector3 Dimensions { get; }
        bool SetDimensions(float width, float depth, float height);
        Bounds GetRoomBounds();
        GameObject GetSurface(SurfaceId surfaceId);

        event System.Action<string> OnValidationError;
    }
}
