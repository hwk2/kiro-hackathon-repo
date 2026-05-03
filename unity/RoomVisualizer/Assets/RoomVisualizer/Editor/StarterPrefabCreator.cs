using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace RoomVisualizer.Editor
{
    /// <summary>
    /// Editor utility that programmatically creates the 13 low-poly starter prefabs
    /// under <c>Assets/RoomVisualizer/Prefabs/Starter/</c>.
    ///
    /// Each prefab is built from a Unity primitive (Cube) scaled to approximate
    /// real-world dimensions, with a single coloured material and a pre-configured
    /// <see cref="PlaceableObject"/> component.
    ///
    /// Access via: RoomVisualizer → Create Starter Prefabs
    /// Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
    /// </summary>
    public static class StarterPrefabCreator
    {
        private const string PrefabOutputFolder = "Assets/RoomVisualizer/Prefabs/Starter";

        [MenuItem("RoomVisualizer/Create Starter Prefabs")]
        public static void CreateStarterPrefabs()
        {
            EnsureFolderExists(PrefabOutputFolder);

            int created = 0;
            int skipped = 0;

            foreach (var config in StarterPrefabData.All)
            {
                string prefabPath = $"{PrefabOutputFolder}/{config.Id}.prefab";

                // Build the prefab in memory
                GameObject go = BuildPrefabGameObject(config);

                // Save as a prefab asset (overwrite if it already exists)
                bool success;
                PrefabUtility.SaveAsPrefabAsset(go, prefabPath, out success);

                // Destroy the temporary scene object
                Object.DestroyImmediate(go);

                if (success)
                {
                    Debug.Log($"[StarterPrefabCreator] Created prefab: {prefabPath}");
                    created++;
                }
                else
                {
                    Debug.LogWarning($"[StarterPrefabCreator] Failed to save prefab: {prefabPath}");
                    skipped++;
                }
            }

            AssetDatabase.Refresh();

            EditorUtility.DisplayDialog(
                "Starter Prefabs Created",
                $"Created: {created}\nFailed: {skipped}\n\nPrefabs saved to:\n{PrefabOutputFolder}",
                "OK");
        }

        // -----------------------------------------------------------------------
        // Internal helpers
        // -----------------------------------------------------------------------

        /// <summary>
        /// Builds a temporary scene <see cref="GameObject"/> representing the prefab.
        /// The caller is responsible for destroying it after saving.
        /// </summary>
        private static GameObject BuildPrefabGameObject(StarterPrefabData.PrefabConfig config)
        {
            // Create a Cube primitive — provides MeshRenderer, MeshFilter, and BoxCollider
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = config.Id;

            // Apply scale
            go.transform.localScale = config.Scale;

            // Apply material colour
            var renderer = go.GetComponent<MeshRenderer>();
            if (renderer != null)
            {
                // Create a new material instance so each prefab has its own asset
                var mat = new Material(Shader.Find("Standard"));
                mat.color = config.MaterialColor;

                // Save the material as an asset alongside the prefab
                string matPath = $"{PrefabOutputFolder}/{config.Id}_mat.mat";
                AssetDatabase.CreateAsset(mat, matPath);
                renderer.sharedMaterial = mat;
            }

            // Ensure BoxCollider is present (CreatePrimitive adds one for Cube)
            if (go.GetComponent<BoxCollider>() == null)
                go.AddComponent<BoxCollider>();

            // Add and configure PlaceableObject component
            var placeable = go.AddComponent<PlaceableObject>();
            placeable.PrefabId       = config.Id;
            placeable.DisplayName    = config.DisplayName;
            placeable.GridWidth      = config.GridWidth;
            placeable.GridHeight     = config.GridHeight;
            placeable.AllowedSurfaces = new List<SurfaceId>(config.AllowedSurfaces);

            return go;
        }

        /// <summary>
        /// Creates the folder hierarchy for <paramref name="folderPath"/> if it does not exist.
        /// Handles nested paths by creating each missing segment in turn.
        /// </summary>
        private static void EnsureFolderExists(string folderPath)
        {
            // Split path into segments and create each missing folder
            string[] parts = folderPath.Split('/');
            string current = parts[0]; // "Assets"

            for (int i = 1; i < parts.Length; i++)
            {
                string next = current + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(current, parts[i]);
                    Debug.Log($"[StarterPrefabCreator] Created folder: {next}");
                }
                current = next;
            }
        }
    }
}
