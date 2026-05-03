using UnityEngine;

namespace RoomVisualizer
{
    public interface ILightingManager
    {
        void SetAmbientIntensity(float intensity);
        bool AddPointLight(Vector3 position, Color color, float intensity);
        void RemovePointLight(int index);
        int PointLightCount { get; }
    }
}
