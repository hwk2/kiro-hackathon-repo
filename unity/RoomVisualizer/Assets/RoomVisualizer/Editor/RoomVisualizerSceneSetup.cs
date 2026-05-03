using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace RoomVisualizer.Editor
{
    /// <summary>
    /// Editor utility that creates and opens a ready-to-play RoomVisualizer scene.
    /// Access via: Tools -> RoomVisualizer -> Create Playtest Scene
    /// </summary>
    public static class RoomVisualizerSceneSetup
    {
        private const string ScenePath      = "Assets/RoomVisualizer/Scenes/RoomVisualizer.unity";
        private const string PrefabFolder   = "Assets/RoomVisualizer/Prefabs/Starter";

        [MenuItem("Tools/RoomVisualizer/Create Playtest Scene")]
        public static void CreatePlaytestScene()
        {
            // Make sure starter prefabs exist first — offer to create them if not.
            bool prefabsExist = AssetDatabase.IsValidFolder(PrefabFolder) &&
                                AssetDatabase.FindAssets("t:Prefab", new[] { PrefabFolder }).Length > 0;

            if (!prefabsExist)
            {
                bool create = EditorUtility.DisplayDialog(
                    "Starter Prefabs Missing",
                    "No prefabs found in:\n" + PrefabFolder +
                    "\n\nCreate them now? (Runs 'RoomVisualizer → Create Starter Prefabs' automatically)",
                    "Yes, create them", "Skip");

                if (create)
                    StarterPrefabCreator.CreateStarterPrefabs();
            }

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                return;

            // ── New empty scene ───────────────────────────────────────────────
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // ── Lighting — neutral daylight ───────────────────────────────────
            // Clean white key light from upper-left
            var lightGo = new GameObject("Key Light");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(0.95f, 0.95f, 1.0f);   // near-white with slight cool tint
            light.intensity = 1.0f;
            lightGo.transform.rotation = Quaternion.Euler(40f, -45f, 0f);

            // Soft cool fill from the opposite side
            var fillGo = new GameObject("Fill Light");
            var fill = fillGo.AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.color = new Color(0.75f, 0.82f, 0.95f);   // cool blue-grey fill
            fill.intensity = 0.35f;
            fillGo.transform.rotation = Quaternion.Euler(20f, 135f, 0f);

            // Neutral grey ambient — even, clean illumination
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.38f, 0.40f, 0.44f);
            RenderSettings.ambientIntensity = 1f;

            // ── Bootstrap + input ─────────────────────────────────────────────
            var bootstrapGo = new GameObject("Bootstrap");
            bootstrapGo.AddComponent<RoomVisualizerBootstrapper>();
            var inputHandler = bootstrapGo.AddComponent<GameInputHandler>();

            // Load all starter prefabs from the AssetDatabase and assign them to
            // GameInputHandler now, while we are still in Editor context.
            // This means the list is serialised into the scene — no runtime loading needed.
            var assignedPrefabs = new List<GameObject>();
            var slotLog = new StringBuilder();

            // Load in the canonical StarterPrefabData order so keys 1-9 are predictable.
            for (int i = 0; i < StarterPrefabData.All.Length; i++)
            {
                string id   = StarterPrefabData.All[i].Id;
                string path = $"{PrefabFolder}/{id}.prefab";
                var prefab  = AssetDatabase.LoadAssetAtPath<GameObject>(path);

                if (prefab != null)
                {
                    assignedPrefabs.Add(prefab);
                    int key = assignedPrefabs.Count; // 1-based
                    slotLog.AppendLine($"  {key} — {StarterPrefabData.All[i].DisplayName} ({id})");
                }
                else
                {
                    Debug.LogWarning($"[SceneSetup] Prefab not found at '{path}'. " +
                                     "Run 'RoomVisualizer → Create Starter Prefabs' first.");
                }
            }

            // Use SerializedObject to set the private-serialised list on GameInputHandler.
            var so = new SerializedObject(inputHandler);
            var prefabsProp = so.FindProperty("_placementPrefabs");
            prefabsProp.ClearArray();
            for (int i = 0; i < assignedPrefabs.Count; i++)
            {
                prefabsProp.InsertArrayElementAtIndex(i);
                prefabsProp.GetArrayElementAtIndex(i).objectReferenceValue = assignedPrefabs[i];
            }
            so.ApplyModifiedPropertiesWithoutUndo();

            // ── HTTP listener ─────────────────────────────────────────────────
            var httpGo = new GameObject("HttpListenerService");
            var httpService = httpGo.AddComponent<HttpListenerService>();
            httpService.Port = 8322;

            // ── Camera — fixed isometric overview, zoomed out to see the whole room ─
            // CameraController is added directly to this GameObject so the Bootstrapper
            // picks it up via _existingCameraController and does NOT create a second camera.
            var cameraGo = new GameObject("Main Camera");
            cameraGo.tag = "MainCamera";
            var cam = cameraGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.08f, 0.06f, 0.05f);
            cam.nearClipPlane = 0.05f;
            cam.fieldOfView = 50f;

            // Add CameraController here so it owns this Camera component.
            // Initial values: zoomed out (distance=14), high angle (pitch=42), 45° yaw.
            var camCtrl = cameraGo.AddComponent<CameraController>();
            var camCtrlSo = new SerializedObject(camCtrl);
            camCtrlSo.FindProperty("_initialDistance").floatValue = 10f;
            camCtrlSo.FindProperty("_initialPitch").floatValue    = 42f;
            camCtrlSo.FindProperty("_initialYaw").floatValue      = 45f;
            camCtrlSo.ApplyModifiedPropertiesWithoutUndo();

            // Wire the CameraController into the Bootstrapper so ResolveOrCreate reuses it.
            var bootstrapSo = new SerializedObject(bootstrapGo.GetComponent<RoomVisualizerBootstrapper>());
            bootstrapSo.FindProperty("_existingCameraController").objectReferenceValue = camCtrl;
            bootstrapSo.ApplyModifiedPropertiesWithoutUndo();

            // ── Save ──────────────────────────────────────────────────────────
            if (!AssetDatabase.IsValidFolder("Assets/RoomVisualizer/Scenes"))
                AssetDatabase.CreateFolder("Assets/RoomVisualizer", "Scenes");

            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.Refresh();

            string slotSummary = assignedPrefabs.Count > 0
                ? slotLog.ToString()
                : "  (none — run 'RoomVisualizer → Create Starter Prefabs' first)\n";

            EditorUtility.DisplayDialog(
                "Playtest Scene Created",
                "Scene saved to:\n" + ScenePath + "\n\n" +
                "Prefab slots assigned (" + assignedPrefabs.Count + "):\n" +
                slotSummary + "\n" +
                "Press Play (▶) to start.\n\n" +
                "Controls:\n" +
                "  1-9            — place prefab by slot\n" +
                "  R (placing)    — rotate preview 15°\n" +
                "  Left-click     — confirm placement / select object\n" +
                "  R (selected)   — rotate selected object 15°\n" +
                "  Delete         — remove selected object\n" +
                "  Escape         — cancel / deselect\n" +
                "  [ / ]          — decrease / increase room depth\n" +
                "  F1             — full controls list",
                "OK");
        }

        [MenuItem("Tools/RoomVisualizer/Open Playtest Scene")]
        public static void OpenPlaytestScene()
        {
            if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(ScenePath) == null)
            {
                EditorUtility.DisplayDialog("Scene Not Found",
                    "No scene at " + ScenePath + ".\nRun 'Create Playtest Scene' first.", "OK");
                return;
            }

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                return;

            EditorSceneManager.OpenScene(ScenePath);
        }
    }
}
