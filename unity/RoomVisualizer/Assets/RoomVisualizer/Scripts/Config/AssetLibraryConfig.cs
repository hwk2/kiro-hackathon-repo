using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    [CreateAssetMenu(fileName = "AssetLibraryConfig", menuName = "RoomVisualizer/Asset Library Config")]
    public class AssetLibraryConfig : ScriptableObject
    {
        [Serializable]
        public class CategoryMapping
        {
            public string CategoryId;   // e.g. "power_outlet"
            public string AssetPath;    // e.g. "Assets/RoomVisualizer/AssetLibrary/power_outlet.glb"
        }

        [SerializeField]
        private List<CategoryMapping> _mappings = new List<CategoryMapping>();

        private Dictionary<string, string> _lookup;

        private void OnEnable()
        {
            BuildLookup();
        }

        private void BuildLookup()
        {
            _lookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var m in _mappings)
            {
                if (!string.IsNullOrEmpty(m.CategoryId))
                    _lookup[m.CategoryId] = m.AssetPath;
            }
        }

        /// <summary>Returns the asset path for a category ID, or null if not found.</summary>
        public string GetAssetPath(string categoryId)
        {
            if (_lookup == null) BuildLookup();
            _lookup.TryGetValue(categoryId, out var path);
            return path;
        }

        /// <summary>Returns true if the category has a mapped asset.</summary>
        public bool HasMapping(string categoryId)
        {
            if (_lookup == null) BuildLookup();
            return _lookup.ContainsKey(categoryId);
        }
    }
}
