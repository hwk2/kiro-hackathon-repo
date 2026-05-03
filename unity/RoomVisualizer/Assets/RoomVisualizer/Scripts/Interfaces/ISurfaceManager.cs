using System.Threading.Tasks;
using UnityEngine;

namespace RoomVisualizer
{
    public interface ISurfaceManager
    {
        void SetSurfaceColor(SurfaceId surfaceId, Color color);
        Task<bool> SetSurfaceTextureAsync(SurfaceId surfaceId, string filePath);
        Material GetSurfaceMaterial(SurfaceId surfaceId);

        event System.Action<string> OnValidationError;
    }
}
