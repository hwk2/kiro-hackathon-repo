using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Detects collisions between placed objects and checks room boundary containment.
    /// Implements <see cref="ICollisionSystem"/>.
    /// </summary>
    /// <remarks>
    /// Room surfaces have no colliders (removed in <see cref="RoomController"/>), so
    /// <see cref="Physics.OverlapBox"/> only detects other placed-object colliders.
    /// </remarks>
    public class CollisionSystem : MonoBehaviour, ICollisionSystem
    {
        // ── Inspector reference ──────────────────────────────────────────────

        [SerializeField]
        [Tooltip("Reference to the IRoomController. Auto-resolved via FindObjectOfType<RoomController> if not set.")]
        private RoomController _roomControllerRef;

        // ── Internal state ───────────────────────────────────────────────────

        private IRoomController _roomController;

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Use the inspector-assigned reference if available; otherwise fall back.
            if (_roomControllerRef != null)
            {
                _roomController = _roomControllerRef;
            }
            else
            {
                _roomController = FindObjectOfType<RoomController>();

                if (_roomController == null)
                {
                    Debug.LogError(
                        "[CollisionSystem] No IRoomController found in the scene. " +
                        "Assign one via the inspector or ensure a RoomController exists.");
                }
            }
        }

        // ── ICollisionSystem implementation ──────────────────────────────────

        /// <summary>
        /// Returns <c>true</c> if placing an object with <paramref name="objectBounds"/>
        /// at <paramref name="proposedPosition"/> would overlap any existing collider in the scene.
        /// </summary>
        /// <remarks>
        /// The bounds centre is offset by <paramref name="proposedPosition"/> so the check
        /// is performed at the intended world-space location.
        /// Room surfaces have no colliders, so they are never reported as overlaps.
        /// </remarks>
        public bool WouldCollide(Bounds objectBounds, Vector3 proposedPosition)
        {
            // Compute the world-space centre of the object at the proposed position.
            // objectBounds.center is the local offset from the object's pivot; adding
            // proposedPosition gives the world-space centre.
            Vector3 worldCenter = proposedPosition + objectBounds.center;
            Vector3 halfExtents = objectBounds.extents;

            // Use the identity rotation — objects are axis-aligned by default.
            // A non-zero rotation could be passed in if needed in future.
            Collider[] overlaps = Physics.OverlapBox(
                worldCenter,
                halfExtents,
                Quaternion.identity);

            return overlaps.Length > 0;
        }

        /// <summary>
        /// Returns <c>true</c> if the object's bounds (centred at <paramref name="position"/>)
        /// are fully contained within the room bounds.
        /// </summary>
        public bool IsWithinRoomBounds(Bounds objectBounds, Vector3 position)
        {
            if (_roomController == null)
            {
                Debug.LogWarning("[CollisionSystem] IRoomController is null; IsWithinRoomBounds returning false.");
                return false;
            }

            Bounds roomBounds = _roomController.GetRoomBounds();

            // Build the object's world-space bounds at the given position.
            Bounds worldObjectBounds = new Bounds(
                position + objectBounds.center,
                objectBounds.size);

            // The object is within bounds only if the room contains both its min and max corners.
            return roomBounds.Contains(worldObjectBounds.min)
                && roomBounds.Contains(worldObjectBounds.max);
        }
    }
}
