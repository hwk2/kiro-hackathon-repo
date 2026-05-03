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
    /// Plain C# class (not a MonoBehaviour) — inject via constructor or inspector reference.
    /// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
    /// </summary>
    public class SceneSerializer : ISceneSerializer
    {
        /// <summary>
        /// Serialises <paramref name="data"/> to an indented JSON file at <paramref name="filePath"/>.
        /// Returns <c>true</c> on success, <c>false</c> on any I/O or serialisation error.
        /// </summary>
        public async Task<bool> SaveAsync(string filePath, SceneData data)
        {
            try
            {
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
        /// Deserialises a JSON file at <paramref name="filePath"/> into a <see cref="SceneData"/>.
        /// Populates <see cref="LoadSceneResult.MissingAssets"/> for any referenced glTF/GLB files
        /// not found on disk. Returns a failure result on any I/O or deserialisation error.
        /// </summary>
        public async Task<LoadSceneResult> LoadAsync(string filePath)
        {
            // Check file exists before attempting to read
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

                // Check for missing glTF/GLB asset references
                var missingAssets = new List<MissingAssetWarning>();

                if (sceneData.Objects != null)
                {
                    foreach (PlacedObjectData obj in sceneData.Objects)
                    {
                        if (!string.IsNullOrEmpty(obj.AssetPath) && !File.Exists(obj.AssetPath))
                        {
                            missingAssets.Add(new MissingAssetWarning
                            {
                                AssetPath = obj.AssetPath,
                                Message = $"Referenced asset not found on disk: '{obj.AssetPath}'"
                            });

                            Debug.LogWarning($"[SceneSerializer] Missing asset: '{obj.AssetPath}'");
                        }
                    }
                }

                return new LoadSceneResult
                {
                    Success = true,
                    Data = sceneData,
                    MissingAssets = missingAssets
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
    }
}
