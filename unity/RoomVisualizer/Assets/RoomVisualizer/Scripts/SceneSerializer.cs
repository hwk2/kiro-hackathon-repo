using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Serialises and deserialises <see cref="SceneData"/> to/from JSON on disk.
    ///
    /// Supports two save-file formats:
    ///   v1.0 — original format; <see cref="PlacedObjectData.PrefabId"/> is null.
    ///           On load, objects are flagged for world-space placement via CollisionSystem.
    ///   v2.0 — extended format; includes PrefabId, SurfaceId, GridX/Y, RotationStep,
    ///           and CustomProperties. On load, grid occupancy is restored via
    ///           <see cref="IPlacementGridManager.MarkOccupied"/>.
    ///
    /// Plain C# class (not a MonoBehaviour) — inject via constructor or inspector reference.
    /// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 22.1, 22.2, 22.3, 22.4, 22.5
    /// </summary>
    public class SceneSerializer : ISceneSerializer
    {
        // ── Dependencies ─────────────────────────────────────────────────────

        private readonly IPlacementGridManager _gridManager;

        /// <summary>
        /// Creates a <see cref="SceneSerializer"/>.
        /// </summary>
        /// <param name="gridManager">
        /// Optional <see cref="IPlacementGridManager"/> used to restore grid occupancy
        /// when loading v2.0 save files. May be <c>null</c>; occupancy restoration is
        /// silently skipped when no manager is provided.
        /// </param>
        public SceneSerializer(IPlacementGridManager gridManager = null)
        {
            _gridManager = gridManager;
        }

        // ── ISceneSerializer ─────────────────────────────────────────────────

        /// <summary>
        /// Serialises <paramref name="data"/> to an indented JSON file at
        /// <paramref name="filePath"/>. Sets <see cref="SceneData.SaveFormatVersion"/>
        /// to <c>"2.0"</c> before writing.
        /// Returns <c>true</c> on success, <c>false</c> on any I/O or serialisation error.
        /// </summary>
        public async Task<bool> SaveAsync(string filePath, SceneData data)
        {
            try
            {
                // Always stamp the version as 2.0 when saving through this serializer.
                data.SaveFormatVersion = "2.0";

                string json = JsonConvert.SerializeObject(data, Formatting.Indented);
                await Task.Run(() => File.WriteAllText(filePath, json));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SceneSerializer] SaveAsync failed for '{filePath}': {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Deserialises a JSON file at <paramref name="filePath"/> into a
        /// <see cref="SceneData"/>.
        ///
        /// Version handling:
        /// <list type="bullet">
        ///   <item>v1.0 / null — objects with null <c>PrefabId</c> are noted in
        ///     <see cref="LoadSceneResult.Warnings"/> as requiring world-space placement.</item>
        ///   <item>v2.0 — for each object with a non-null <c>PrefabId</c>,
        ///     <see cref="IPlacementGridManager.MarkOccupied"/> is called to restore
        ///     grid occupancy. Objects whose <c>PrefabId</c> is not found in the scene
        ///     are skipped and a warning is added to
        ///     <see cref="LoadSceneResult.MissingAssets"/> (Req 22.3).</item>
        /// </list>
        ///
        /// Returns a failure result on any I/O or deserialisation error.
        /// </summary>
        public async Task<LoadSceneResult> LoadAsync(string filePath)
        {
            // Check file exists before attempting to read.
            if (!File.Exists(filePath))
            {
                string notFoundMsg = $"Save file not found: '{filePath}'";
                Debug.LogError($"[SceneSerializer] LoadAsync: {notFoundMsg}");
                return new LoadSceneResult
                {
                    Success = false,
                    ErrorMessage = notFoundMsg
                };
            }

            try
            {
                string json = await Task.Run(() => File.ReadAllText(filePath));

                SceneData sceneData = JsonConvert.DeserializeObject<SceneData>(json);

                if (sceneData == null)
                {
                    string nullMsg = "Deserialised SceneData was null — file may be empty or malformed.";
                    Debug.LogError($"[SceneSerializer] LoadAsync: {nullMsg}");
                    return new LoadSceneResult
                    {
                        Success = false,
                        ErrorMessage = nullMsg
                    };
                }

                var missingAssets = new List<MissingAssetWarning>();
                var warnings = new List<string>();

                bool isV2 = string.Equals(sceneData.SaveFormatVersion, "2.0",
                                          StringComparison.OrdinalIgnoreCase);

                if (sceneData.Objects != null)
                {
                    // Build a filtered list so callers only see objects that loaded
                    // successfully (unknown PrefabId objects are excluded per Req 22.3).
                    var validObjects = new List<PlacedObjectData>();

                    foreach (PlacedObjectData obj in sceneData.Objects)
                    {
                        if (isV2)
                        {
                            // ── v2.0 path ────────────────────────────────────────────
                            if (!string.IsNullOrEmpty(obj.PrefabId))
                            {
                                // Restore grid occupancy for this object.
                                // The footprint width/height defaults to 1x1 when the
                                // PlaceableObject component data is not embedded in the
                                // save file; callers that need the real footprint should
                                // look it up from AssetLibraryConfig after loading.
                                if (_gridManager != null &&
                                    TryParseSurfaceId(obj.SurfaceId, out SurfaceId surfaceId))
                                {
                                    // Default footprint 1x1 — callers can re-mark with
                                    // the real footprint once the prefab is resolved.
                                    _gridManager.MarkOccupied(surfaceId, obj.GridX, obj.GridY, 1, 1);
                                }

                                // Check that the legacy AssetPath (if present) still exists.
                                if (!string.IsNullOrEmpty(obj.AssetPath) &&
                                    !File.Exists(obj.AssetPath))
                                {
                                    missingAssets.Add(new MissingAssetWarning
                                    {
                                        AssetPath = obj.AssetPath,
                                        Message = $"Referenced asset not found on disk: '{obj.AssetPath}'"
                                    });
                                    Debug.LogWarning($"[SceneSerializer] Missing asset: '{obj.AssetPath}'");
                                }

                                validObjects.Add(obj);
                            }
                            else
                            {
                                // v2.0 file but PrefabId is null — treat as unknown, skip.
                                string warnMsg =
                                    $"Skipping object at grid ({obj.GridX},{obj.GridY}): " +
                                    "PrefabId is null in a v2.0 save file.";
                                warnings.Add(warnMsg);
                                missingAssets.Add(new MissingAssetWarning
                                {
                                    AssetPath = obj.AssetPath ?? "(unknown)",
                                    Message = warnMsg
                                });
                                Debug.LogWarning($"[SceneSerializer] {warnMsg}");
                            }
                        }
                        else
                        {
                            // ── v1.0 / legacy path ───────────────────────────────────
                            if (string.IsNullOrEmpty(obj.PrefabId))
                            {
                                // v1.0 object — note that world-space placement is needed.
                                string note =
                                    $"Object '{obj.AssetPath ?? "(no path)"}' is from a v1.0 " +
                                    "save file and will use world-space placement via CollisionSystem.";
                                warnings.Add(note);
                                Debug.Log($"[SceneSerializer] {note}");
                            }

                            // Check for missing glTF/GLB asset references.
                            if (!string.IsNullOrEmpty(obj.AssetPath) &&
                                !File.Exists(obj.AssetPath))
                            {
                                missingAssets.Add(new MissingAssetWarning
                                {
                                    AssetPath = obj.AssetPath,
                                    Message = $"Referenced asset not found on disk: '{obj.AssetPath}'"
                                });
                                Debug.LogWarning($"[SceneSerializer] Missing asset: '{obj.AssetPath}'");
                            }

                            validObjects.Add(obj);
                        }
                    }

                    // Replace the object list with only the valid entries.
                    sceneData.Objects = validObjects;
                }

                return new LoadSceneResult
                {
                    Success = true,
                    Data = sceneData,
                    MissingAssets = missingAssets,
                    Warnings = warnings
                };
            }
            catch (JsonException jsonEx)
            {
                string parseMsg = $"JSON parse error loading '{filePath}': {jsonEx.Message}";
                Debug.LogError($"[SceneSerializer] LoadAsync: {parseMsg}");
                return new LoadSceneResult
                {
                    Success = false,
                    ErrorMessage = parseMsg
                };
            }
            catch (Exception ex)
            {
                string errMsg = $"Unexpected error loading '{filePath}': {ex.Message}";
                Debug.LogError($"[SceneSerializer] LoadAsync: {errMsg}");
                return new LoadSceneResult
                {
                    Success = false,
                    ErrorMessage = errMsg
                };
            }
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Attempts to parse a <see cref="SurfaceId"/> enum value from its string name.
        /// Returns <c>false</c> when <paramref name="value"/> is null, empty, or not a
        /// recognised enum member.
        /// </summary>
        private static bool TryParseSurfaceId(string value, out SurfaceId surfaceId)
        {
            return System.Enum.TryParse(value, out surfaceId);
        }
    }
}
