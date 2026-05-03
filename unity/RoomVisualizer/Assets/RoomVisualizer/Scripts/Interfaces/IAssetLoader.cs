using System;
using System.Threading.Tasks;

namespace RoomVisualizer
{
    public interface IAssetLoader
    {
        Task<LoadResult> LoadGltfAsync(string filePath);
        event Action<LoadResult> OnLoadComplete;
    }
}
