using System;
using System.Threading.Tasks;
using UnityEngine;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// In-memory IAssetLoader for EditMode tests — returns pre-built GameObjects without file I/O.
    /// </summary>
    public class FakeAssetLoader : IAssetLoader
    {
        public bool ShouldSucceed = true;
        public string ErrorMessage = "Fake load failure";

        public event Action<LoadResult> OnLoadComplete;

        public Task<LoadResult> LoadGltfAsync(string filePath)
        {
            LoadResult result;
            if (ShouldSucceed)
            {
                var go = new GameObject($"FakeAsset_{filePath}");
                result = new LoadResult { Success = true, InstantiatedObject = go };
            }
            else
            {
                result = new LoadResult { Success = false, ErrorMessage = ErrorMessage };
            }

            OnLoadComplete?.Invoke(result);
            return Task.FromResult(result);
        }
    }
}
