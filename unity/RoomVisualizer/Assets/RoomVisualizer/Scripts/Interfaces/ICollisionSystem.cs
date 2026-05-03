using UnityEngine;

namespace RoomVisualizer
{
    public interface ICollisionSystem
    {
        bool WouldCollide(Bounds objectBounds, Vector3 proposedPosition);
        bool IsWithinRoomBounds(Bounds objectBounds, Vector3 position);
    }
}
