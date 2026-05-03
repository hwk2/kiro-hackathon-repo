using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Bridges the Desktop Visualization Engine (and HTTP layer) to the Unity game-engine
    /// subsystems. All public methods are non-blocking; async operations complete by raising
    /// <see cref="OnOperationComplete"/> exactly once with a non-null <see cref="OperationResult"/>
    /// carrying a non-null <see cref="OperationResult.OperationName"/>.
    ///
    /// Requirements: 8.1, 8.2, 8.3
    /// </summary>
    public class UIBridge : MonoBehaviour, IUIBridge
    {
        // ── Inspector-injected subsystem references ──────────────────────────

        [SerializeField]
        [Tooltip("RoomController MonoBehaviour in the scene.")]
        private RoomController _roomController;

        [SerializeField]
        [Tooltip("AssetLoader MonoBehaviour in the scene.")]
        private AssetLoader _assetLoader;

        [SerializeField]
        [Tooltip("ObjectPlacer MonoBehaviour in the scene.")]
        private ObjectPlacer _objectPlacer;

        [SerializeField]
        [Tooltip("CameraController MonoBehaviour in the scene.")]
        private CameraController _cameraController;

        [SerializeField]
        [Tooltip("SurfaceManager MonoBehaviour in the scene.")]
        private SurfaceManager _surfaceManager;

        [SerializeField]
        [Tooltip("LightingManager MonoBehaviour in the scene.")]
        private LightingManager _lightingManager;

        /// <summary>
        /// Optional reference to a BlockModelImporter (Task 13 — may be null until implemented).
        /// </summary>
        [SerializeField]
        [Tooltip("BlockModelImporter MonoBehaviour (optional — Task 13). Leave null until implemented.")]
        private MonoBehaviour _blockModelImporterRef;

        // ── Typed interface references (resolved in Awake) ───────────────────

        private IRoomController _iRoomController;
        private IAssetLoader _iAssetLoader;
        private IObjectPlacer _iObjectPlacer;
        private ICameraController _iCameraController;
        private ISurfaceManager _iSurfaceManager;
        private ILightingManager _iLightingManager;
        private ISceneSerializer _sceneSerializer;
        private IBlockModelImporter _iBlockModelImporter;

        // ── Object registry: objectId → placed GameObject ────────────────────

        private readonly Dictionary<string, GameObject> _objectRegistry =
            new Dictionary<string, GameObject>();

        private int _nextObjectId;

        // ── Events ───────────────────────────────────────────────────────────

        /// <summary>
        /// Raised exactly once per public method call with a non-null
        /// <see cref="OperationResult"/> carrying a non-null
        /// <see cref="OperationResult.OperationName"/>.
        /// </summary>
        public event Action<OperationResult> OnOperationComplete;

        // ── Programmatic wiring ──────────────────────────────────────────────

        /// <summary>
        /// Injects all subsystem references programmatically.
        /// Called by <see cref="RoomVisualizerBootstrapper"/> when the scene is assembled
        /// at runtime (Requirement 8.3). Must be called before <see cref="Awake"/> resolves
        /// the typed interface references, or immediately after if called post-Awake.
        /// </summary>
        public void SetSubsystems(
            RoomController roomController,
            AssetLoader assetLoader,
            ObjectPlacer objectPlacer,
            CameraController cameraController,
            SurfaceManager surfaceManager,
            LightingManager lightingManager)
        {
            _roomController    = roomController;
            _assetLoader       = assetLoader;
            _objectPlacer      = objectPlacer;
            _cameraController  = cameraController;
            _surfaceManager    = surfaceManager;
            _lightingManager   = lightingManager;

            // Re-resolve typed interface references immediately so callers that invoke
            // UIBridge methods after SetSubsystems (but before the next Awake) get valid refs.
            _iRoomController   = _roomController;
            _iAssetLoader      = _assetLoader;
            _iObjectPlacer     = _objectPlacer;
            _iCameraController = _cameraController;
            _iSurfaceManager   = _surfaceManager;
            _iLightingManager  = _lightingManager;
        }

        /// <summary>
        /// Injects all subsystem interface references programmatically (interface-typed overload).
        /// Used by tests and the bootstrapper when concrete MonoBehaviour references are not available.
        /// Parameters: roomController, assetLoader, objectPlacer, cameraController,
        ///             surfaceManager, lightingManager, sceneSerializer, blockModelImporter.
        /// Any parameter may be null.
        /// </summary>
        public void SetDependencies(
            IRoomController roomController,
            IAssetLoader assetLoader,
            IObjectPlacer objectPlacer,
            ICameraController cameraController,
            ISurfaceManager surfaceManager,
            ILightingManager lightingManager,
            ISceneSerializer sceneSerializer,
            IBlockModelImporter blockModelImporter)
        {
            _iRoomController      = roomController;
            _iAssetLoader         = assetLoader;
            _iObjectPlacer        = objectPlacer;
            _iCameraController    = cameraController;
            _iSurfaceManager      = surfaceManager;
            _iLightingManager     = lightingManager;
            if (sceneSerializer != null)
                _sceneSerializer  = sceneSerializer;
            _iBlockModelImporter  = blockModelImporter;
        }

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Resolve typed interface references from the serialised concrete types.
            _iRoomController = _roomController;
            _iAssetLoader = _assetLoader;
            _iObjectPlacer = _objectPlacer;
            _iCameraController = _cameraController;
            _iSurfaceManager = _surfaceManager;
            _iLightingManager = _lightingManager;

            // SceneSerializer is a plain C# class — create a new instance here.
            _sceneSerializer = new SceneSerializer();

            // BlockModelImporter is optional (Task 13).
            if (_blockModelImporterRef != null)
                _iBlockModelImporter = _blockModelImporterRef as IBlockModelImporter;

            LogMissingDependencies();
        }

        // ── Public API ───────────────────────────────────────────────────────

        /// <summary>
        /// Loads a glTF/GLB asset from <paramref name="filePath"/> and registers the
        /// resulting GameObject in the object registry.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void LoadAsset(string filePath)
        {
            FireAndForget(nameof(LoadAsset), async () =>
            {
                if (_iAssetLoader == null)
                    return Failure(nameof(LoadAsset), "AssetLoader subsystem is not available.");

                LoadResult loadResult = await _iAssetLoader.LoadGltfAsync(filePath);

                if (!loadResult.Success)
                    return Failure(nameof(LoadAsset), loadResult.ErrorMessage ?? "Asset load failed.");

                string objectId = GenerateObjectId();
                _objectRegistry[objectId] = loadResult.InstantiatedObject;

                string msg = loadResult.HasMissingTextures
                    ? $"Asset loaded with missing textures. ObjectId='{objectId}'"
                    : $"Asset loaded successfully. ObjectId='{objectId}'";

                return Success(nameof(LoadAsset), msg, new { objectId, hasMissingTextures = loadResult.HasMissingTextures });
            });
        }

        /// <summary>
        /// Confirms placement of the currently previewed object at <paramref name="position"/>.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void PlaceObject(string assetRef, Vector3 position)
        {
            FireAndForget(nameof(PlaceObject), async () =>
            {
                if (_iObjectPlacer == null)
                    return Failure(nameof(PlaceObject), "ObjectPlacer subsystem is not available.");

                PlacementResult placementResult = _iObjectPlacer.ConfirmPlacement(position);

                if (placementResult == PlacementResult.Blocked)
                    return Failure(nameof(PlaceObject), "Placement blocked: collision detected.");

                if (placementResult == PlacementResult.OutOfBounds)
                    return Failure(nameof(PlaceObject), "Placement blocked: position is out of room bounds.");

                var placed = _iObjectPlacer.PlacedObjects;
                if (placed == null || placed.Count == 0)
                    return Failure(nameof(PlaceObject), "Placement succeeded but no object was found in PlacedObjects.");

                GameObject placedObj = placed[placed.Count - 1];
                string objectId = GenerateObjectId();
                _objectRegistry[objectId] = placedObj;

                await Task.CompletedTask;
                return Success(nameof(PlaceObject), $"Object placed. ObjectId='{objectId}'", new { objectId });
            });
        }

        /// <summary>
        /// Moves the object identified by <paramref name="objectId"/> by <paramref name="delta"/>.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void MoveObject(string objectId, Vector3 delta)
        {
            FireAndForget(nameof(MoveObject), async () =>
            {
                if (_iObjectPlacer == null)
                    return Failure(nameof(MoveObject), "ObjectPlacer subsystem is not available.");

                if (!TryGetObject(objectId, nameof(MoveObject), out GameObject obj, out OperationResult err))
                    return err;

                _iObjectPlacer.MoveObject(obj, delta);

                await Task.CompletedTask;
                return Success(nameof(MoveObject), $"Object '{objectId}' moved by {delta}.");
            });
        }

        /// <summary>
        /// Rotates the object identified by <paramref name="objectId"/> by
        /// <paramref name="steps"/> × 15 degrees around the Y axis.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void RotateObject(string objectId, int steps)
        {
            FireAndForget(nameof(RotateObject), async () =>
            {
                if (_iObjectPlacer == null)
                    return Failure(nameof(RotateObject), "ObjectPlacer subsystem is not available.");

                if (!TryGetObject(objectId, nameof(RotateObject), out GameObject obj, out OperationResult err))
                    return err;

                _iObjectPlacer.RotateObject(obj, steps);

                await Task.CompletedTask;
                return Success(nameof(RotateObject), $"Object '{objectId}' rotated by {steps * 15f}°.");
            });
        }

        /// <summary>
        /// Removes the object identified by <paramref name="objectId"/> from the scene.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void RemoveObject(string objectId)
        {
            FireAndForget(nameof(RemoveObject), async () =>
            {
                if (_iObjectPlacer == null)
                    return Failure(nameof(RemoveObject), "ObjectPlacer subsystem is not available.");

                if (!TryGetObject(objectId, nameof(RemoveObject), out GameObject obj, out OperationResult err))
                    return err;

                _iObjectPlacer.RemoveObject(obj);
                _objectRegistry.Remove(objectId);

                await Task.CompletedTask;
                return Success(nameof(RemoveObject), $"Object '{objectId}' removed.");
            });
        }

        /// <summary>
        /// Applies a material (colour or texture) to the specified room surface.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void SetSurfaceMaterial(SurfaceId surfaceId, MaterialParams p)
        {
            FireAndForget(nameof(SetSurfaceMaterial), async () =>
            {
                if (_iSurfaceManager == null)
                    return Failure(nameof(SetSurfaceMaterial), "SurfaceManager subsystem is not available.");

                if (p == null)
                    return Failure(nameof(SetSurfaceMaterial), "MaterialParams must not be null.");

                if (!string.IsNullOrEmpty(p.TexturePath))
                {
                    bool textureOk = await _iSurfaceManager.SetSurfaceTextureAsync(surfaceId, p.TexturePath);
                    if (!textureOk)
                        return Failure(nameof(SetSurfaceMaterial),
                            $"Failed to apply texture '{p.TexturePath}' to surface '{surfaceId}'.");

                    return Success(nameof(SetSurfaceMaterial), $"Texture applied to surface '{surfaceId}'.");
                }

                _iSurfaceManager.SetSurfaceColor(surfaceId, p.Color.ToColor());
                return Success(nameof(SetSurfaceMaterial), $"Color applied to surface '{surfaceId}'.");
            });
        }

        /// <summary>
        /// Applies a lighting parameter (ambient intensity or point light).
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void SetLightingParameter(LightingParams p)
        {
            FireAndForget(nameof(SetLightingParameter), async () =>
            {
                if (_iLightingManager == null)
                    return Failure(nameof(SetLightingParameter), "LightingManager subsystem is not available.");

                if (p == null)
                    return Failure(nameof(SetLightingParameter), "LightingParams must not be null.");

                if (p.IsAmbient)
                {
                    _iLightingManager.SetAmbientIntensity(p.Intensity);
                    await Task.CompletedTask;
                    return Success(nameof(SetLightingParameter), $"Ambient intensity set to {p.Intensity}.");
                }

                bool added = _iLightingManager.AddPointLight(
                    p.Position.ToVector3(),
                    p.Color.ToColor(),
                    p.Intensity);

                await Task.CompletedTask;

                if (!added)
                    return Failure(nameof(SetLightingParameter),
                        "Cannot add point light: maximum of 4 point lights already reached.");

                return Success(nameof(SetLightingParameter),
                    $"Point light added at {p.Position.ToVector3()} with intensity {p.Intensity}.");
            });
        }

        /// <summary>
        /// Saves the current scene to <paramref name="filePath"/> as JSON.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void SaveScene(string filePath)
        {
            FireAndForget(nameof(SaveScene), async () =>
            {
                if (_sceneSerializer == null)
                    return Failure(nameof(SaveScene), "SceneSerializer is not available.");

                SceneData sceneData = BuildSceneData();
                bool saved = await _sceneSerializer.SaveAsync(filePath, sceneData);

                if (!saved)
                    return Failure(nameof(SaveScene), $"Failed to save scene to '{filePath}'.");

                return Success(nameof(SaveScene), $"Scene saved to '{filePath}'.");
            });
        }

        /// <summary>
        /// Loads a scene from <paramref name="filePath"/> and restores the room state.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void LoadScene(string filePath)
        {
            FireAndForget(nameof(LoadScene), async () =>
            {
                if (_sceneSerializer == null)
                    return Failure(nameof(LoadScene), "SceneSerializer is not available.");

                LoadSceneResult loadResult = await _sceneSerializer.LoadAsync(filePath);

                if (!loadResult.Success)
                    return Failure(nameof(LoadScene),
                        loadResult.ErrorMessage ?? $"Failed to load scene from '{filePath}'.");

                if (loadResult.Data?.Room != null && _iRoomController != null)
                {
                    _iRoomController.SetDimensions(
                        loadResult.Data.Room.Width,
                        loadResult.Data.Room.Depth,
                        loadResult.Data.Room.Height);
                }

                string msg = $"Scene loaded from '{filePath}'.";
                if (loadResult.MissingAssets != null && loadResult.MissingAssets.Count > 0)
                    msg += $" {loadResult.MissingAssets.Count} missing asset(s) skipped.";

                return Success(nameof(LoadScene), msg, loadResult);
            });
        }

        /// <summary>
        /// Imports a <see cref="BlockModelData"/> from its JSON representation and
        /// populates the scene with the detected objects.
        /// Non-blocking — result delivered via <see cref="OnOperationComplete"/>.
        /// </summary>
        public void LoadBlockModel(string blockModelJson)
        {
            FireAndForget(nameof(LoadBlockModel), async () =>
            {
                if (_iBlockModelImporter == null)
                    return Failure(nameof(LoadBlockModel),
                        "BlockModelImporter subsystem is not available (Task 13 not yet implemented).");

                BlockModelData blockModel;
                try
                {
                    blockModel = Newtonsoft.Json.JsonConvert.DeserializeObject<BlockModelData>(blockModelJson);
                }
                catch (Exception ex)
                {
                    return Failure(nameof(LoadBlockModel), $"Failed to parse BlockModel JSON: {ex.Message}");
                }

                if (blockModel == null)
                    return Failure(nameof(LoadBlockModel), "BlockModel JSON deserialised to null.");

                ImportResult importResult = await _iBlockModelImporter.ImportAsync(blockModel);

                if (!importResult.Success)
                    return Failure(nameof(LoadBlockModel),
                        $"BlockModel import failed. Blocks imported: {importResult.BlocksImported}, " +
                        $"failed: {importResult.BlocksFailed}.");

                string msg = $"BlockModel imported. Blocks: {importResult.BlocksImported} ok, " +
                             $"{importResult.BlocksFailed} failed.";
                if (importResult.Warnings != null && importResult.Warnings.Count > 0)
                    msg += $" Warnings: {importResult.Warnings.Count}.";

                return Success(nameof(LoadBlockModel), msg, importResult);
            });
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Fires an async operation without awaiting it (fire-and-forget).
        /// Catches all exceptions and raises <see cref="OnOperationComplete"/> with a
        /// failure result so the caller always receives exactly one event.
        /// </summary>
        private async void FireAndForget(string operationName, Func<Task<OperationResult>> operation)
        {
            OperationResult result;
            try
            {
                result = await operation();
            }
            catch (Exception ex)
            {
                Debug.LogError($"[UIBridge] Unhandled exception in '{operationName}': {ex}");
                result = Failure(operationName, $"Unexpected error: {ex.Message}");
            }

            if (result.OperationName == null)
                result.OperationName = operationName;

            OnOperationComplete?.Invoke(result);
        }

        private static OperationResult Success(string operationName, string message, object payload = null)
        {
            return new OperationResult
            {
                Success = true,
                OperationName = operationName,
                Message = message,
                Payload = payload
            };
        }

        private static OperationResult Failure(string operationName, string message, object payload = null)
        {
            Debug.LogWarning($"[UIBridge] {operationName} failed: {message}");
            return new OperationResult
            {
                Success = false,
                OperationName = operationName,
                Message = message,
                Payload = payload
            };
        }

        private bool TryGetObject(
            string objectId,
            string operationName,
            out GameObject obj,
            out OperationResult errorResult)
        {
            if (string.IsNullOrEmpty(objectId))
            {
                obj = null;
                errorResult = Failure(operationName, "objectId must not be null or empty.");
                return false;
            }

            if (!_objectRegistry.TryGetValue(objectId, out obj) || obj == null)
            {
                errorResult = Failure(operationName, $"No object found with objectId='{objectId}'.");
                return false;
            }

            errorResult = null;
            return true;
        }

        private string GenerateObjectId()
        {
            return $"obj_{_nextObjectId++}";
        }

        private SceneData BuildSceneData()
        {
            var data = new SceneData
            {
                Objects = new List<PlacedObjectData>(),
                Surfaces = new Dictionary<string, MaterialData>(),
                Lighting = new LightingData
                {
                    AmbientIntensity = RenderSettings.ambientIntensity,
                    PointLights = new List<PointLightData>()
                }
            };

            if (_iRoomController != null)
            {
                Vector3 dims = _iRoomController.Dimensions;
                data.Room = new RoomDimensionsData
                {
                    Width = dims.x,
                    Depth = dims.z,
                    Height = dims.y
                };
            }

            if (_iObjectPlacer != null)
            {
                foreach (GameObject go in _iObjectPlacer.PlacedObjects)
                {
                    if (go == null) continue;
                    data.Objects.Add(new PlacedObjectData
                    {
                        AssetPath = go.name,
                        Position = new SerializableVector3(go.transform.position),
                        EulerAngles = new SerializableVector3(go.transform.eulerAngles),
                        Scale = new SerializableVector3(go.transform.localScale)
                    });
                }
            }

            if (_iSurfaceManager != null)
            {
                foreach (SurfaceId id in Enum.GetValues(typeof(SurfaceId)))
                {
                    Material mat = _iSurfaceManager.GetSurfaceMaterial(id);
                    if (mat != null)
                    {
                        data.Surfaces[id.ToString()] = new MaterialData
                        {
                            Color = new SerializableColor(mat.color)
                        };
                    }
                }
            }

            return data;
        }

        private void LogMissingDependencies()
        {
            if (_iRoomController == null)
                Debug.LogWarning("[UIBridge] IRoomController is not assigned.");
            if (_iAssetLoader == null)
                Debug.LogWarning("[UIBridge] IAssetLoader is not assigned.");
            if (_iObjectPlacer == null)
                Debug.LogWarning("[UIBridge] IObjectPlacer is not assigned.");
            if (_iCameraController == null)
                Debug.LogWarning("[UIBridge] ICameraController is not assigned.");
            if (_iSurfaceManager == null)
                Debug.LogWarning("[UIBridge] ISurfaceManager is not assigned.");
            if (_iLightingManager == null)
                Debug.LogWarning("[UIBridge] ILightingManager is not assigned.");
            if (_iBlockModelImporter == null)
                Debug.LogWarning("[UIBridge] IBlockModelImporter is not assigned (Task 13 — expected).");
        }
    }
}
