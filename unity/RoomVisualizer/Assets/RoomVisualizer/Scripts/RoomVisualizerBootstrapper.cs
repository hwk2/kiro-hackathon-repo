using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Programmatic scene bootstrapper for the 3D Room Visualizer.
    /// Creates a root "RoomVisualizer" GameObject hierarchy at runtime, adds one child
    /// GameObject per subsystem, and wires all dependencies into UIBridge.
    ///
    /// Polishing-phase subsystems (PlacementGridManager, WallVisibilityManager,
    /// ObjectPalette, BlockModelImporter) are wired in Awake alongside the core subsystems.
    ///
    /// Requirements: 8.3, 12.1, 13.1, 14.1, 15.1, 17.1, 19.1, 20.1
    /// </summary>
    public class RoomVisualizerBootstrapper : MonoBehaviour
    {
        // ── Core subsystem inspector fields ──────────────────────────────────

        [Header("Optional — leave null to create programmatically")]
        [SerializeField] private RoomController _existingRoomController;
        [SerializeField] private CollisionSystem _existingCollisionSystem;
        [SerializeField] private ObjectPlacer _existingObjectPlacer;
        [SerializeField] private CameraController _existingCameraController;
        [SerializeField] private SurfaceManager _existingSurfaceManager;
        [SerializeField] private LightingManager _existingLightingManager;
        [SerializeField] private AssetLoader _existingAssetLoader;
        [SerializeField] private UIBridge _existingUIBridge;

        // ── Polishing-phase subsystem inspector fields ────────────────────────

        [Header("Polishing-phase subsystems — leave null to create programmatically")]
        [SerializeField] private PlacementGridManager _existingPlacementGridManager;
        [SerializeField] private WallVisibilityManager _existingWallVisibilityManager;
        [SerializeField] private ObjectPalette _existingObjectPalette;
        [SerializeField] private BlockModelImporter _existingBlockModelImporter;

        // ── Core subsystem public properties ─────────────────────────────────

        public RoomController RoomController { get; private set; }
        public CollisionSystem CollisionSystem { get; private set; }
        public ObjectPlacer ObjectPlacer { get; private set; }
        public CameraController CameraController { get; private set; }
        public SurfaceManager SurfaceManager { get; private set; }
        public LightingManager LightingManager { get; private set; }
        public AssetLoader AssetLoader { get; private set; }
        public UIBridge UIBridge { get; private set; }

        // ── Polishing-phase subsystem public properties ───────────────────────

        public PlacementGridManager PlacementGridManager { get; private set; }
        public WallVisibilityManager WallVisibilityManager { get; private set; }
        public ObjectPalette ObjectPalette { get; private set; }
        public BlockModelImporter BlockModelImporter { get; private set; }
        public RoomResizer RoomResizer { get; private set; }

        private void Awake()
        {
            GameObject root = new GameObject("RoomVisualizer");

            // ── Core subsystems ───────────────────────────────────────────────

            RoomController = ResolveOrCreate<RoomController>(_existingRoomController, root, "RoomController");
            CollisionSystem = ResolveOrCreate<CollisionSystem>(_existingCollisionSystem, root, "CollisionSystem");

            // PlacementGridManager must be created before ObjectPlacer so that
            // ObjectPlacer's Awake() can resolve it via FindObjectOfType.
            PlacementGridManager = ResolveOrCreate<PlacementGridManager>(
                _existingPlacementGridManager, root, "PlacementGridManager");

            ObjectPlacer = ResolveOrCreate<ObjectPlacer>(_existingObjectPlacer, root, "ObjectPlacer");

            CameraController = ResolveOrCreate<CameraController>(
                _existingCameraController, root, "CameraController",
                go => { if (go.GetComponent<Camera>() == null) go.AddComponent<Camera>(); });

            SurfaceManager = ResolveOrCreate<SurfaceManager>(_existingSurfaceManager, root, "SurfaceManager");
            LightingManager = ResolveOrCreate<LightingManager>(_existingLightingManager, root, "LightingManager");
            AssetLoader = ResolveOrCreate<AssetLoader>(_existingAssetLoader, root, "AssetLoader");

            // ── Polishing-phase subsystems ────────────────────────────────────

            WallVisibilityManager = ResolveOrCreate<WallVisibilityManager>(
                _existingWallVisibilityManager, root, "WallVisibilityManager");

            ObjectPalette = ResolveOrCreate<ObjectPalette>(_existingObjectPalette, root, "ObjectPalette");

            BlockModelImporter = ResolveOrCreate<BlockModelImporter>(
                _existingBlockModelImporter, root, "BlockModelImporter");

            // RoomResizer — drag handles for resizing the room floor in X and Z.
            RoomResizer = ResolveOrCreate<RoomResizer>(null, root, "RoomResizer");

            UIBridge = ResolveOrCreate<UIBridge>(_existingUIBridge, root, "UIBridge");

            // ── Wire core subsystems into UIBridge ────────────────────────────

            UIBridge.SetSubsystems(
                RoomController,
                AssetLoader,
                ObjectPlacer,
                CameraController,
                SurfaceManager,
                LightingManager);

            // ── Wire polishing-phase subsystems into UIBridge via SetDependencies ──
            // Pass a grid-aware SceneSerializer so v2.0 save files restore occupancy.
            var sceneSerializer = new SceneSerializer(PlacementGridManager);

            UIBridge.SetDependencies(
                RoomController,
                AssetLoader,
                ObjectPlacer,
                CameraController,
                SurfaceManager,
                LightingManager,
                sceneSerializer,
                BlockModelImporter,
                PlacementGridManager);

            // ── Subscribe WallVisibilityManager to CameraController yaw changes ──
            // WallVisibilityManager also subscribes itself in Start() via FindObjectOfType,
            // but we wire it explicitly here for clarity and to avoid timing issues.
            var isoCam = CameraController as IIsometricCameraController;
            if (isoCam != null)
                isoCam.OnYawStepChanged += WallVisibilityManager.OnYawStepChanged;

            // ── Subscribe ObjectPalette.OnPrefabSelected to begin placement ────
            ObjectPalette.OnPrefabSelected += OnPrefabSelectedFromPalette;

            Debug.Log("[RoomVisualizerBootstrapper] All subsystems wired successfully.");
        }

        // ── Private helpers ───────────────────────────────────────────────────

        /// <summary>
        /// Handles a prefab selection from the <see cref="ObjectPalette"/>.
        /// Logs the selection for now; full implementation requires resolving the prefab
        /// from <see cref="AssetLibraryConfig"/> and calling
        /// <see cref="ObjectPlacer.BeginPlacement"/>.
        /// </summary>
        private void OnPrefabSelectedFromPalette(string prefabId)
        {
            // Look up the prefab from AssetLibraryConfig and begin placement.
            // For now, log the selection — full implementation requires an
            // AssetLibraryConfig reference to resolve the prefab GameObject.
            Debug.Log($"[RoomVisualizerBootstrapper] Prefab selected from palette: {prefabId}");
            // TODO: Resolve prefab from AssetLibraryConfig and call ObjectPlacer.BeginPlacement
        }

        private static T ResolveOrCreate<T>(
            T existing,
            GameObject parent,
            string childName,
            System.Action<GameObject> configure = null)
            where T : Component
        {
            if (existing != null) return existing;
            var child = new GameObject(childName);
            child.transform.SetParent(parent.transform, false);
            configure?.Invoke(child);
            return child.AddComponent<T>();
        }
    }
}
