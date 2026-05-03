using UnityEditor;
using UnityEngine;

namespace RoomVisualizer.Editor
{
    /// <summary>
    /// Editor utility that creates or updates the <see cref="AssetLibraryConfig"/>
    /// ScriptableObject asset at <c>Assets/RoomVisualizer/Config/AssetLibraryConfig.asset</c>
    /// with all 13 starter prefab entries.
    ///
    /// Access via: RoomVisualizer → Populate AssetLibraryConfig
    ///
    /// Run <c>StarterPrefabCreator</c> first so the prefab assets exist at the
    /// expected paths before populating the config.
    ///
    /// Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 20.3, 20.4
    /// </summary>
    public static class AssetLibraryConfigPopulator
    {
        private const string ConfigFolder = "Assets/RoomVisualizer/Config";
        private const string ConfigAssetPath = "Assets/RoomVisualizer/Config/AssetLibraryConfig.asset";
        private const string StarterPrefabFolder = "Assets/RoomVisualizer/Prefabs/Starter";

        [MenuItem("RoomVisualizer/Populate AssetLibraryConfig")]
        public static void PopulateAssetLibraryConfig()
        {
            // Load existing asset or create a new one
            var config = AssetDatabase.LoadAssetAtPath<AssetLibraryConfig>(ConfigAssetPath);
            bool isNew = config == null;

            if (isNew)
            {
                config = ScriptableObject.CreateInstance<AssetLibraryConfig>();
                EnsureFolderExists(ConfigFolder);
                AssetDatabase.CreateAsset(config, ConfigAssetPath);
                Debug.Log($"[AssetLibraryConfigPopulator] Created new AssetLibraryConfig at {ConfigAssetPath}");
            }
            else
            {
                Debug.Log($"[AssetLibraryConfigPopulator] Updating existing AssetLibraryConfig at {ConfigAssetPath}");
            }

            // Clear existing entries so we start fresh (idempotent re-run)
            config.Entries.Clear();

            // Populate from StarterPrefabData
            foreach (var prefabConfig in StarterPrefabData.All)
            {
                var entry = new AssetLibraryConfig.AssetLibraryEntry
                {
                    PrefabId    = prefabConfig.Id,
                    AssetPath   = $"{StarterPrefabFolder}/{prefabConfig.Id}.prefab",
                    DisplayName = prefabConfig.DisplayName,
                    Category    = prefabConfig.Category,
                    Thumbnail   = null  // Thumbnails are assigned manually or via a separate tool
                };

                config.Entries.Add(entry);
                Debug.Log($"[AssetLibraryConfigPopulator] Added entry: {entry.PrefabId} ({entry.Category})");
            }

            // Mark dirty and save
            EditorUtility.SetDirty(config);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            EditorUtility.DisplayDialog(
                "AssetLibraryConfig Populated",
                $"Added {config.Entries.Count} entries to:\n{ConfigAssetPath}\n\n" +
                "Thumbnails are null — assign them manually in the Inspector or run a thumbnail-generation tool.",
                "OK");
        }

        // -----------------------------------------------------------------------
        // Internal helpers
        // -----------------------------------------------------------------------

        /// <summary>
        /// Creates the folder hierarchy for <paramref name="folderPath"/> if it does not exist.
        /// </summary>
        private static void EnsureFolderExists(string folderPath)
        {
            string[] parts = folderPath.Split('/');
            string current = parts[0]; // "Assets"

            for (int i = 1; i < parts.Length; i++)
            {
                string next = current + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(current, parts[i]);
                    Debug.Log($"[AssetLibraryConfigPopulator] Created folder: {next}");
                }
                current = next;
            }
        }
    }
}
