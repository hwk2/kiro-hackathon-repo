using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using GLTFast;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Loads glTF/GLB assets from disk at runtime using the com.unity.cloud.gltfast package.
    /// Validates file extensions, enforces a 5-second load timeout, handles missing external
    /// textures by substituting a default material, and raises <see cref="OnLoadComplete"/>
    /// with the result on completion or failure.
    ///
    /// Implements <see cref="IAssetLoader"/>.
    /// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
    /// </summary>
    public class AssetLoader : MonoBehaviour, IAssetLoader
    {
        // ── Constants ────────────────────────────────────────────────────────

        private const float LoadTimeoutSeconds = 5f;

        // ── IAssetLoader ─────────────────────────────────────────────────────

        /// <inheritdoc/>
        public event Action<LoadResult> OnLoadComplete;

        // ── IAssetLoader implementation ───────────────────────────────────────

        /// <summary>
        /// Loads a glTF or GLB file from <paramref name="filePath"/> and instantiates
        /// it as a child of this GameObject.
        ///
        /// Steps:
        /// 1. Validates the file extension (.gltf or .glb); returns failure immediately
        ///    for any other extension (Requirement 2.3).
        /// 2. Creates a <see cref="CancellationTokenSource"/> with a 5-second timeout
        ///    (Requirement 2.5).
        /// 3. Loads the file via <see cref="GltfImport.Load"/> (Requirement 2.1).
        /// 4. Instantiates the main scene into a new child GameObject (Requirement 2.2).
        /// 5. Checks for missing textures by inspecting materials returned by GLTFast;
        ///    sets <see cref="LoadResult.HasMissingTextures"/> if any material is null
        ///    (Requirement 2.4).
        /// 6. Raises <see cref="OnLoadComplete"/> with the result (success or failure).
        /// </summary>
        /// <param name="filePath">Absolute or relative path to the .gltf or .glb file.</param>
        /// <returns>A <see cref="LoadResult"/> describing the outcome.</returns>
        public async Task<LoadResult> LoadGltfAsync(string filePath)
        {
            // ── 1. Validate file extension ────────────────────────────────────
            string extension = Path.GetExtension(filePath)?.ToLower();
            if (extension != ".gltf" && extension != ".glb")
            {
                string extError = $"Invalid file extension '{extension}'. " +
                                  "Only .gltf and .glb files are supported.";
                Debug.LogWarning($"[AssetLoader] {extError}");

                var failResult = new LoadResult
                {
                    Success = false,
                    ErrorMessage = extError
                };
                OnLoadComplete?.Invoke(failResult);
                return failResult;
            }

            // ── 2. Create a 5-second cancellation token ───────────────────────
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(LoadTimeoutSeconds));

            // ── 3. Load the glTF/GLB file via GltfImport ─────────────────────
            var gltf = new GltfImport();
            bool loadSuccess;
            try
            {
                loadSuccess = await gltf.Load(new Uri(filePath), cancellationToken: cts.Token);
            }
            catch (OperationCanceledException)
            {
                string timeoutError = $"Loading '{filePath}' timed out after {LoadTimeoutSeconds} seconds.";
                Debug.LogError($"[AssetLoader] {timeoutError}");

                var timeoutResult = new LoadResult
                {
                    Success = false,
                    ErrorMessage = timeoutError
                };
                OnLoadComplete?.Invoke(timeoutResult);
                return timeoutResult;
            }
            catch (Exception ex)
            {
                string exError = $"Exception while loading '{filePath}': {ex.Message}";
                Debug.LogError($"[AssetLoader] {exError}");

                var exResult = new LoadResult
                {
                    Success = false,
                    ErrorMessage = exError
                };
                OnLoadComplete?.Invoke(exResult);
                return exResult;
            }

            if (!loadSuccess)
            {
                string loadError = $"GltfImport failed to load '{filePath}'. " +
                                   "The file may be corrupt or reference missing external resources.";
                Debug.LogError($"[AssetLoader] {loadError}");

                var loadFailResult = new LoadResult
                {
                    Success = false,
                    ErrorMessage = loadError
                };
                OnLoadComplete?.Invoke(loadFailResult);
                return loadFailResult;
            }

            // ── 4. Instantiate the main scene ─────────────────────────────────
            // Create a child GameObject to hold the instantiated glTF scene.
            GameObject sceneRoot = new GameObject(Path.GetFileNameWithoutExtension(filePath));
            sceneRoot.transform.SetParent(transform, worldPositionStays: false);

            bool instantiateSuccess;
            try
            {
                instantiateSuccess = await gltf.InstantiateMainSceneAsync(sceneRoot.transform);
            }
            catch (Exception ex)
            {
                string instError = $"Exception while instantiating '{filePath}': {ex.Message}";
                Debug.LogError($"[AssetLoader] {instError}");
                Destroy(sceneRoot);

                var instResult = new LoadResult
                {
                    Success = false,
                    ErrorMessage = instError
                };
                OnLoadComplete?.Invoke(instResult);
                return instResult;
            }

            if (!instantiateSuccess)
            {
                string instFailError = $"GltfImport failed to instantiate the main scene from '{filePath}'.";
                Debug.LogError($"[AssetLoader] {instFailError}");
                Destroy(sceneRoot);

                var instFailResult = new LoadResult
                {
                    Success = false,
                    ErrorMessage = instFailError
                };
                OnLoadComplete?.Invoke(instFailResult);
                return instFailResult;
            }

            // ── 5. Check for missing textures ─────────────────────────────────
            // GLTFast exposes materials via GetMaterial(index). A null material
            // indicates a missing or unresolvable texture reference (Requirement 2.4).
            bool hasMissingTextures = false;
            int materialCount = gltf.MaterialCount;
            for (int i = 0; i < materialCount; i++)
            {
                Material mat = gltf.GetMaterial(i);
                if (mat == null)
                {
                    hasMissingTextures = true;
                    Debug.LogWarning($"[AssetLoader] Material at index {i} is null in '{filePath}'. " +
                                     "A default material will be used for affected meshes.");
                    break; // One missing material is enough to set the flag
                }
            }

            // ── 6. Build and raise the success result ─────────────────────────
            var result = new LoadResult
            {
                Success = true,
                InstantiatedObject = sceneRoot,
                HasMissingTextures = hasMissingTextures
            };

            OnLoadComplete?.Invoke(result);
            return result;
        }
    }
}
