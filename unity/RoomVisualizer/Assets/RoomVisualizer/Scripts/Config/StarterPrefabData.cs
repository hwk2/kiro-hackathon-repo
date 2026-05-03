using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Static data class that defines all 13 starter prefab configurations.
    /// Used as a reference/documentation source and by the Editor tool
    /// <c>StarterPrefabCreator</c> to drive programmatic prefab creation.
    /// Requirements: 21.1, 21.2, 21.3, 21.5
    /// </summary>
    public static class StarterPrefabData
    {
        /// <summary>
        /// Describes the configuration for a single starter prefab.
        /// </summary>
        public class PrefabConfig
        {
            /// <summary>Lowercase identifier matching the AssetLibraryConfig PrefabId.</summary>
            public string Id;

            /// <summary>Human-readable display name shown in the Object Palette.</summary>
            public string DisplayName;

            /// <summary>World-space scale applied to the Unity primitive.</summary>
            public Vector3 Scale;

            /// <summary>Grid footprint width in cells.</summary>
            public int GridWidth;

            /// <summary>Grid footprint height in cells.</summary>
            public int GridHeight;

            /// <summary>Surfaces on which this prefab may be placed.</summary>
            public List<SurfaceId> AllowedSurfaces;

            /// <summary>Category group for Object Palette organisation.</summary>
            public string Category;

            /// <summary>Single material colour for the low-poly mesh.</summary>
            public Color MaterialColor;
        }

        // -----------------------------------------------------------------------
        // Category colour constants
        // -----------------------------------------------------------------------

        /// <summary>Wood-brown colour used for Furniture prefabs.</summary>
        public static readonly Color FurnitureColor = new Color(0.6f, 0.4f, 0.2f);

        /// <summary>Blue-grey colour used for Decoration prefabs.</summary>
        public static readonly Color DecorationColor = new Color(0.4f, 0.6f, 0.8f);

        /// <summary>Warm-yellow colour used for Lighting prefabs.</summary>
        public static readonly Color LightingColor = new Color(1.0f, 0.9f, 0.5f);

        /// <summary>Light-blue colour used for Architecture prefabs.</summary>
        public static readonly Color ArchitectureColor = new Color(0.7f, 0.9f, 1.0f);

        // -----------------------------------------------------------------------
        // Shared surface lists (avoids repeated allocation)
        // -----------------------------------------------------------------------

        private static readonly List<SurfaceId> FloorOnly = new List<SurfaceId>
        {
            SurfaceId.Floor
        };

        private static readonly List<SurfaceId> AllWalls = new List<SurfaceId>
        {
            SurfaceId.WallNorth,
            SurfaceId.WallSouth,
            SurfaceId.WallEast,
            SurfaceId.WallWest
        };

        // -----------------------------------------------------------------------
        // All 13 starter prefab configurations
        // -----------------------------------------------------------------------

        /// <summary>
        /// Static readonly array of all 13 starter prefab configurations.
        /// Iterate this to create or register prefabs programmatically.
        /// </summary>
        public static readonly PrefabConfig[] All = new PrefabConfig[]
        {
            // ---- Floor-only: Furniture ----------------------------------------
            new PrefabConfig
            {
                Id            = "bed",
                DisplayName   = "Bed",
                Scale         = new Vector3(1.0f, 0.5f, 1.5f),
                GridWidth     = 2,
                GridHeight    = 3,
                AllowedSurfaces = FloorOnly,
                Category      = "Furniture",
                MaterialColor = FurnitureColor
            },
            new PrefabConfig
            {
                Id            = "desk",
                DisplayName   = "Desk",
                Scale         = new Vector3(1.0f, 0.75f, 1.0f),
                GridWidth     = 2,
                GridHeight    = 2,
                AllowedSurfaces = FloorOnly,
                Category      = "Furniture",
                MaterialColor = FurnitureColor
            },
            new PrefabConfig
            {
                Id            = "chair",
                DisplayName   = "Chair",
                Scale         = new Vector3(0.5f, 0.9f, 0.5f),
                GridWidth     = 1,
                GridHeight    = 1,
                AllowedSurfaces = FloorOnly,
                Category      = "Furniture",
                MaterialColor = FurnitureColor
            },
            new PrefabConfig
            {
                Id            = "wardrobe",
                DisplayName   = "Wardrobe",
                Scale         = new Vector3(1.0f, 2.0f, 0.5f),
                GridWidth     = 2,
                GridHeight    = 2,
                AllowedSurfaces = FloorOnly,
                Category      = "Furniture",
                MaterialColor = FurnitureColor
            },
            new PrefabConfig
            {
                Id            = "shelves",
                DisplayName   = "Shelves",
                Scale         = new Vector3(0.5f, 1.5f, 0.3f),
                GridWidth     = 1,
                GridHeight    = 2,
                AllowedSurfaces = FloorOnly,
                Category      = "Furniture",
                MaterialColor = FurnitureColor
            },
            new PrefabConfig
            {
                Id            = "rug",
                DisplayName   = "Rug",
                Scale         = new Vector3(1.5f, 0.05f, 1.0f),
                GridWidth     = 3,
                GridHeight    = 2,
                AllowedSurfaces = FloorOnly,
                Category      = "Furniture",
                MaterialColor = FurnitureColor
            },

            // ---- Floor-only: Lighting -----------------------------------------
            new PrefabConfig
            {
                Id            = "lamp",
                DisplayName   = "Lamp",
                Scale         = new Vector3(0.2f, 1.5f, 0.2f),
                GridWidth     = 1,
                GridHeight    = 1,
                AllowedSurfaces = FloorOnly,
                Category      = "Lighting",
                MaterialColor = LightingColor
            },

            // ---- Floor-only: Decoration ---------------------------------------
            new PrefabConfig
            {
                Id            = "guitar",
                DisplayName   = "Guitar",
                Scale         = new Vector3(0.3f, 1.0f, 0.1f),
                GridWidth     = 1,
                GridHeight    = 2,
                AllowedSurfaces = FloorOnly,
                Category      = "Decoration",
                MaterialColor = DecorationColor
            },
            new PrefabConfig
            {
                Id            = "books",
                DisplayName   = "Books",
                Scale         = new Vector3(0.3f, 0.2f, 0.2f),
                GridWidth     = 1,
                GridHeight    = 1,
                AllowedSurfaces = FloorOnly,
                Category      = "Decoration",
                MaterialColor = DecorationColor
            },
            new PrefabConfig
            {
                Id            = "laptop",
                DisplayName   = "Laptop",
                Scale         = new Vector3(0.35f, 0.02f, 0.25f),
                GridWidth     = 1,
                GridHeight    = 1,
                AllowedSurfaces = FloorOnly,
                Category      = "Decoration",
                MaterialColor = DecorationColor
            },

            // ---- Wall-only: Decoration ----------------------------------------
            new PrefabConfig
            {
                Id            = "poster",
                DisplayName   = "Poster",
                Scale         = new Vector3(0.5f, 1.0f, 0.02f),
                GridWidth     = 1,
                GridHeight    = 2,
                AllowedSurfaces = AllWalls,
                Category      = "Decoration",
                MaterialColor = DecorationColor
            },
            new PrefabConfig
            {
                Id            = "hook",
                DisplayName   = "Hook",
                Scale         = new Vector3(0.1f, 0.1f, 0.1f),
                GridWidth     = 1,
                GridHeight    = 1,
                AllowedSurfaces = AllWalls,
                Category      = "Decoration",
                MaterialColor = DecorationColor
            },

            // ---- Wall-only: Architecture --------------------------------------
            new PrefabConfig
            {
                Id            = "window",
                DisplayName   = "Window",
                Scale         = new Vector3(1.0f, 1.0f, 0.05f),
                GridWidth     = 2,
                GridHeight    = 2,
                AllowedSurfaces = AllWalls,
                Category      = "Architecture",
                MaterialColor = ArchitectureColor
            },
        };
    }
}
