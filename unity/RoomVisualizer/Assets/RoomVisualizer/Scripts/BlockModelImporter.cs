using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Translates an incoming <see cref="BlockModelData"/> (produced by the AI Pipeline)
    /// into a populated Unity scene by resolving assets, setting room dimensions, placing
    /// objects, and tagging low-confidence blocks.
    ///
    /// Implements <see cref="IBlockModelImporter"/>.
    /// Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
    /// </summary>
    public class BlockModelImporter : MonoBehaviour, IBlockModelImporter
    {
        // ── Inspector references ─────────────────────────────────────────────

        [SerializeField]
        [Tooltip("RoomController MonoBehaviour. Auto-resolved via FindObjectOfType if not set.")]
        private RoomController _roomControllerRef;

        [SerializeField]
        [Tooltip("AssetLoader MonoBehaviour. Auto-resolved via FindObjectOfType if not set.")]
        private AssetLoader _assetLoaderRef;

        [SerializeField]
        [Tooltip("ObjectPlacer MonoBehaviour. Auto-resolved via FindObjectOfType if not set.")]
        private ObjectPlacer _objectPlacerRef;

        [SerializeField]
        [Tooltip("AssetLibraryConfig ScriptableObject mapping category IDs to glTF/GLB paths.")]
        private AssetLibraryConfig _assetLibraryConfig;

        // ── Typed interface references (resolved in Awake) ───────────────────

        private IRoomController _roomController;
        private IAssetLoader _assetLoader;
        private IObjectPlacer _objectPlacer;

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            _roomController = _roomControllerRef != null
                ? (IRoomController)_roomControllerRef
                : FindObjectOfType<RoomController>();

            _assetLoader = _assetLoaderRef != null
                ? (IAssetLoader)_assetLoaderRef
                : FindObjectOfType<AssetLoader>();

            _objectPlacer = _objectPlacerRef != null
                ? (IObjectPlacer)_objectPlacerRef
                : FindObjectOfType<ObjectPlacer>();

            if (_roomController == null)
                Debug.LogWarning("[BlockModelImporter] No IRoomController found in the scene.");
            if (_assetLoader == null)
                Debug.LogWarning("[BlockModelImporter] No IAssetLoader found in the scene.");
            if (_objectPlacer == null)
                Debug.LogWarning("[BlockModelImporter] No IObjectPlacer found in the scene.");
            if (_assetLibraryConfig == null)
                Debug.LogWarning("[BlockModelImporter] AssetLibraryConfig is not assigned. " +
                                 "All blocks will use default primitives.");
        }

        // ── Programmatic dependency injection ────────────────────────────────

        /// <summary>
        /// Injects all subsystem dependencies programmatically (for bootstrapper or tests).
        /// </summary>
        public void SetDependencies(
            IRoomController roomController,
            IAssetLoader assetLoader,
            IObjectPlacer objectPlacer,
            AssetLibraryConfig assetLibraryConfig)
        {
            _roomController = roomController;
            _assetLoader = assetLoader;
            _objectPlacer = objectPlacer;
            _assetLibraryConfig = assetLibraryConfig;
        }

        // ── IBlockModelImporter implementation ──────────────────────────────

        /// <inheritdoc/>
        public async Task<ImportResult> ImportAsync(BlockModelData blockModel)
        {
            var result = new ImportResult { Warnings = new List<string>() };

            // 1. Null guard
            if (blockModel == null)
            {
                Debug.LogError("[BlockModelImporter] ImportAsync called with a null BlockModelData.");
                result.Success = false;
                return result;
            }

            // 2. Apply room dimensions
            if (blockModel.room_dimensions != null && _roomController != null)
            {
                bool dimensionsSet = _roomController.SetDimensions(
                    blockModel.room_dimensions.width,
                    blockModel.room_dimensions.depth,
                    blockModel.room_dimensions.height);

                if (!dimensionsSet)
                {
                    result.Warnings.Add(
                        $"room_dimensions ({blockModel.room_dimensions.width} x " +
                        $"{blockModel.room_dimensions.depth} x " +
                        $"{blockModel.room_dimensions.height}) were out of the valid [1, 50] metre range " +
                        "and were not applied.");
                }
            }

            // 3-7. Process each block
            if (blockModel.blocks != null)
            {
                foreach (BlockEntry block in blockModel.blocks)
                {
                    if (block == null)
                    {
                        result.BlocksFailed++;
                        result.Warnings.Add("Encountered a null block entry — skipped.");
                        continue;
                    }

                    await ProcessBlockAsync(block, result);
                }
            }

            result.Success = true;
            return result;
        }

        // ── Private helpers ──────────────────────────────────────────────────

        private async Task ProcessBlockAsync(BlockEntry block, ImportResult result)
        {
            GameObject resolvedObject = null;
            bool usedDefaultPrimitive = false;

            // 3a. Look up category in AssetLibraryConfig
            string assetPath = _assetLibraryConfig?.GetAssetPath(block.category);

            if (!string.IsNullOrEmpty(assetPath))
            {
                // 3b. Known category — load the glTF/GLB asset
                if (_assetLoader != null)
                {
                    LoadResult loadResult = await _assetLoader.LoadGltfAsync(assetPath);

                    if (!loadResult.Success || loadResult.InstantiatedObject == null)
                    {
                        result.Warnings.Add(
                            $"Block '{block.block_id}' (category: '{block.category}'): " +
                            $"failed to load asset '{assetPath}'. Error: {loadResult.ErrorMessage ?? "unknown"}");
                        result.BlocksFailed++;
                        return;
                    }

                    resolvedObject = loadResult.InstantiatedObject;
                }
                else
                {
                    result.Warnings.Add(
                        $"Block '{block.block_id}' (category: '{block.category}'): " +
                        "IAssetLoader is unavailable; using default primitive.");
                    resolvedObject = CreateDefaultPrimitive(block);
                    usedDefaultPrimitive = true;
                }
            }
            else
            {
                // 3c. Unknown category — create a default box primitive
                resolvedObject = CreateDefaultPrimitive(block);
                usedDefaultPrimitive = true;
                result.Warnings.Add(
                    $"Unknown category: '{block.category}' — used default primitive " +
                    $"(block_id: '{block.block_id}').");
            }

            if (resolvedObject == null)
            {
                result.Warnings.Add($"Block '{block.block_id}': resolved object is null — skipped.");
                result.BlocksFailed++;
                return;
            }

            // 3d. Set position
            Vector3 worldPosition = block.position != null ? block.position.ToVector3() : Vector3.zero;
            resolvedObject.transform.position = worldPosition;

            // 3e. Set rotation (yaw → Y axis)
            if (block.rotation != null)
                resolvedObject.transform.rotation = Quaternion.Euler(0f, block.rotation.yaw, 0f);

            // 3f. Place via PlaceDirect — skips Instantiate (the GO is already live).
            // BeginPlacement is intentionally not used here: it calls Instantiate treating
            // the passed GO as a prefab, which would double-instantiate an already-live object.
            if (_objectPlacer != null)
            {
                PlacementResult placementResult = _objectPlacer.PlaceDirect(resolvedObject, worldPosition);

                if (placementResult == PlacementResult.Blocked || placementResult == PlacementResult.OutOfBounds)
                {
                    result.Warnings.Add(
                        $"Block '{block.block_id}' (category: '{block.category}'): " +
                        $"placement {placementResult} at {worldPosition} — skipped.");
                    result.BlocksFailed++;

                    if (usedDefaultPrimitive && resolvedObject != null)
                    {
#if UNITY_EDITOR
                        DestroyImmediate(resolvedObject);
#else
                        Destroy(resolvedObject);
#endif
                    }

                    return;
                }
            }
            else
            {
                resolvedObject.transform.SetParent(transform, worldPositionStays: true);
            }

            // 3g. Tag low-confidence objects
            if (block.low_confidence && resolvedObject != null)
            {
                LowConfidenceTag tag = resolvedObject.AddComponent<LowConfidenceTag>();
                tag.ConfidenceScore = block.confidence_score;
            }

            // 3h. Increment success counter
            result.BlocksImported++;
        }

        private static GameObject CreateDefaultPrimitive(BlockEntry block)
        {
            GameObject primitive = GameObject.CreatePrimitive(PrimitiveType.Cube);
            primitive.name = $"DefaultPrimitive_{block.block_id ?? "unknown"}";

            if (block.dimensions != null)
            {
                primitive.transform.localScale = new Vector3(
                    block.dimensions.x,
                    block.dimensions.y,
                    block.dimensions.z);
            }

            return primitive;
        }
    }
}
