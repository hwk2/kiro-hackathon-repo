using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Programmatic scene bootstrapper for the 3D Room Visualizer.
    /// Creates a root "RoomVisualizer" GameObject hierarchy at runtime, adds one child
    /// GameObject per subsystem, and wires all dependencies into UIBridge.
    /// Requirements: 8.3
    /// </summary>
    public class RoomVisualizerBootstrapper : MonoBehaviour
    {
        [Header("Optional — leave null to create programmatically")]
        [SerializeField] private RoomController _existingRoomController;
        [SerializeField] private CollisionSystem _existingCollisionSystem;
        [SerializeField] private ObjectPlacer _existingObjectPlacer;
        [SerializeField] private CameraController _existingCameraController;
        [SerializeField] private SurfaceManager _existingSurfaceManager;
        [SerializeField] private LightingManager _existingLightingManager;
        [SerializeField] private AssetLoader _existingAssetLoader;
        [SerializeField] private UIBridge _existingUIBridge;

        public RoomController RoomController { get; private set; }
        public CollisionSystem CollisionSystem { get; private set; }
        public ObjectPlacer ObjectPlacer { get; private set; }
        public CameraController CameraController { get; private set; }
        public SurfaceManager SurfaceManager { get; private set; }
        public LightingManager LightingManager { get; private set; }
        public AssetLoader AssetLoader { get; private set; }
        public UIBridge UIBridge { get; private set; }

        private void Awake()
        {
            GameObject root = new GameObject("RoomVisualizer");

            RoomController = ResolveOrCreate<RoomController>(_existingRoomController, root, "RoomController");
            CollisionSystem = ResolveOrCreate<CollisionSystem>(_existingCollisionSystem, root, "CollisionSystem");
            ObjectPlacer = ResolveOrCreate<ObjectPlacer>(_existingObjectPlacer, root, "ObjectPlacer");

            CameraController = ResolveOrCreate<CameraController>(
                _existingCameraController, root, "CameraController",
                go => { if (go.GetComponent<Camera>() == null) go.AddComponent<Camera>(); });

            SurfaceManager = ResolveOrCreate<SurfaceManager>(_existingSurfaceManager, root, "SurfaceManager");
            LightingManager = ResolveOrCreate<LightingManager>(_existingLightingManager, root, "LightingManager");
            AssetLoader = ResolveOrCreate<AssetLoader>(_existingAssetLoader, root, "AssetLoader");
            UIBridge = ResolveOrCreate<UIBridge>(_existingUIBridge, root, "UIBridge");

            UIBridge.SetSubsystems(RoomController, AssetLoader, ObjectPlacer, CameraController, SurfaceManager, LightingManager);

            Debug.Log("[RoomVisualizerBootstrapper] All subsystems wired successfully.");
        }

        private static T ResolveOrCreate<T>(T existing, GameObject parent, string childName, System.Action<GameObject> configure = null)
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
