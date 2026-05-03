using UnityEngine;

namespace RoomVisualizer
{
    public interface ICameraController
    {
        void Translate(Vector2 input);
        void Orbit(Vector2 mouseDelta);
        void Zoom(float scrollDelta);
        void ToggleTopDownView();
        float DistanceFromCenter { get; }
    }
}
