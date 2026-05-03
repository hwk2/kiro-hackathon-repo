using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Component attached to each furniture or decoration prefab that declares
    /// the allowed placement surfaces and the grid footprint (width × height in
    /// cells) for that prefab.
    ///
    /// All fields are exposed via [SerializeField] so they can be configured in
    /// the Unity Editor inspector without requiring code changes.
    /// </summary>
    /// <remarks>
    /// Requirements: 16.1, 16.2, 16.5
    /// </remarks>
    [RequireComponent(typeof(MeshRenderer))]
    public class PlaceableObject : MonoBehaviour
    {
        /// <summary>
        /// The surfaces on which this prefab is allowed to be placed.
        /// Any combination of Floor, WallNorth, WallSouth, WallEast, WallWest.
        /// </summary>
        [SerializeField]
        public List<SurfaceId> AllowedSurfaces = new List<SurfaceId>();

        /// <summary>
        /// Width of the object's grid footprint in whole grid cells.
        /// </summary>
        [SerializeField]
        public int GridWidth = 1;

        /// <summary>
        /// Height of the object's grid footprint in whole grid cells.
        /// </summary>
        [SerializeField]
        public int GridHeight = 1;

        /// <summary>
        /// Unique identifier matching the corresponding AssetLibraryConfig key.
        /// </summary>
        [SerializeField]
        public string PrefabId;

        /// <summary>
        /// Human-readable name shown in the Object Palette UI.
        /// </summary>
        [SerializeField]
        public string DisplayName;

        /// <summary>
        /// Thumbnail sprite shown in the Object Palette button for this prefab.
        /// </summary>
        [SerializeField]
        public Sprite Thumbnail;
    }
}
