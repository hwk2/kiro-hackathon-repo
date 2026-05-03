using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// ScriptableObject that maps AI Pipeline category IDs to local glTF/GLB asset paths
    /// and provides per-entry metadata for the Object Palette UI.
    /// Requirements: 10.2, 20.3, 20.4, 21.1
    /// </summary>
    [CreateAssetMenu(fileName = "AssetLibraryConfig", menuName = "RoomVisualizer/Asset Library Config")]
    public class AssetLibraryConfig : ScriptableObject
    {
        /// <summary>
        /// A single entry in the asset library, combining the category/prefab ID,
        /// the asset path, and UI metadata for the Object Palette.
        /// </summary>
        [Serializable]
        public class AssetLibraryEntry
        {
            /// <summary>
            /// Unique key used by BlockModelImporter (matches AI Pipeline category ID)
            /// and by ObjectPlacer/SceneSerializer (matches PlacedObjectData.PrefabId).
            /// e.g. "bed", "power_outlet"
            /// </summary>
            public string PrefabId;

            /// <summary>
            /// Path to the glTF/GLB file or Unity Prefab asset.
            /// e.g. "Assets/RoomVisualizer/Prefabs/Starter/bed.prefab"
            /// </summary>
            public string AssetPath;

            /// <summary>Human-readable label shown in the Object Palette. e.g. "Bed"</summary>
            public string DisplayName;

            /// <summary>128x128 sprite shown as the button thumbnail in the Object Palette.</summary>
            public Sprite Thumbnail;

            /// <summary>
            /// Category group for palette organisation.
            /// e.g. "Furniture", "Decoration", "Lighting", "Architecture"
            /// </summary>
            public string Category;
        }

        /// <summary>All entries in the library. Editable in the Unity Editor inspector.</summary>
        [SerializeField]
        public List<AssetLibraryEntry> Entries = new List<AssetLibraryEntry>();

        // Fast lookup by PrefabId (built lazily)
        private Dictionary<string, AssetLibraryEntry> _entryLookup;

        private void OnEnable()
        {
            BuildLookup();
        }

        private void BuildLookup()
        {
            _entryLookup = new Dictionary<string, AssetLibraryEntry>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in Entries)
            {
                if (!string.IsNullOrEmpty(entry.PrefabId))
                    _entryLookup[entry.PrefabId] = entry;
            }
        }

        private void EnsureLookup()
        {
            if (_entryLookup == null) BuildLookup();
        }

        /// <summary>
        /// Returns the asset path for a given prefab/category ID, or null if not found.
        /// Backward-compatible with the original CategoryMapping-based API.
        /// </summary>
        public string GetAssetPath(string prefabId)
        {
            EnsureLookup();
            return _entryLookup.TryGetValue(prefabId, out var entry) ? entry.AssetPath : null;
        }

        /// <summary>Returns the full AssetLibraryEntry for a given prefab/category ID, or null.</summary>
        public AssetLibraryEntry GetEntry(string prefabId)
        {
            EnsureLookup();
            _entryLookup.TryGetValue(prefabId, out var entry);
            return entry;
        }

        /// <summary>Returns true if the library contains an entry for the given prefab/category ID.</summary>
        public bool HasMapping(string prefabId)
        {
            EnsureLookup();
            return _entryLookup.ContainsKey(prefabId);
        }

        /// <summary>
        /// Returns the <see cref="AssetLibraryEntry"/> whose <see cref="AssetLibraryEntry.PrefabId"/>
        /// matches <paramref name="prefabId"/> (case-insensitive), or <c>null</c> if not found.
        /// Used by <c>BlockModelImporter</c> to resolve assets by prefab/category key.
        /// </summary>
        public AssetLibraryEntry GetEntryByPrefabId(string prefabId)
        {
            if (string.IsNullOrEmpty(prefabId)) return null;
            EnsureLookup();
            _entryLookup.TryGetValue(prefabId, out var entry);
            return entry;
        }

        /// <summary>
        /// Returns the first <see cref="AssetLibraryEntry"/> whose
        /// <see cref="AssetLibraryEntry.Category"/> matches <paramref name="category"/>
        /// (case-insensitive), or <c>null</c> if no entry belongs to that category.
        /// Provided for backward compatibility with the old Dictionary lookup by category ID.
        /// </summary>
        public AssetLibraryEntry GetEntryByCategory(string category)
        {
            if (string.IsNullOrEmpty(category)) return null;
            foreach (var entry in Entries)
            {
                if (string.Equals(entry.Category, category, System.StringComparison.OrdinalIgnoreCase))
                    return entry;
            }
            return null;
        }
    }
}
