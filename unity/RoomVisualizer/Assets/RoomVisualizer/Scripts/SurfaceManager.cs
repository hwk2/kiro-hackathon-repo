using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages surface materials for the six room surfaces (walls, floor, ceiling).
    /// Each SurfaceId maps to a distinct Material instance, allowing independent
    /// colour and texture assignments per surface.
    /// Implements ISurfaceManager.
    /// </summary>
    public class SurfaceManager : MonoBehaviour, ISurfaceManager
    {
        // ── Constants ────────────────────────────────────────────────────────

        private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

        // Default texture tiling (1×1 = no tiling; configurable via Inspector)
        [SerializeField] private float _defaultTileX = 1f;
        [SerializeField] private float _defaultTileY = 1f;

        // ── Dependencies ─────────────────────────────────────────────────────

        /// <summary>
        /// Reference to the RoomController. Assign in the Inspector or leave null
        /// to fall back to <see cref="FindObjectOfType{T}"/> at Awake time.
        /// </summary>
        [SerializeField] private RoomController _roomController;

        // ── ISurfaceManager ──────────────────────────────────────────────────

        /// <inheritdoc/>
        public event Action<string> OnValidationError;

        // ── Internal state ───────────────────────────────────────────────────

        // One Material instance per surface, created from the surface's sharedMaterial.
        private readonly Dictionary<SurfaceId, Material> _materials =
            new Dictionary<SurfaceId, Material>();

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Resolve the IRoomController dependency.
            IRoomController roomController = _roomController != null
                ? (IRoomController)_roomController
                : FindObjectOfType<RoomController>();

            if (roomController == null)
            {
                Debug.LogError("[SurfaceManager] No IRoomController found. " +
                               "Assign a RoomController in the Inspector or ensure one exists in the scene.");
                return;
            }

            // For each surface, obtain the MeshRenderer and create an independent
            // Material instance so that changing one surface does not affect others.
            foreach (SurfaceId id in Enum.GetValues(typeof(SurfaceId)))
            {
                GameObject surface = roomController.GetSurface(id);
                if (surface == null)
                {
                    Debug.LogWarning($"[SurfaceManager] Surface GameObject for {id} is null; skipping.");
                    continue;
                }

                MeshRenderer renderer = surface.GetComponent<MeshRenderer>();
                if (renderer == null)
                {
                    Debug.LogWarning($"[SurfaceManager] Surface {id} has no MeshRenderer; skipping.");
                    continue;
                }

                // Create a new Material instance from the shared material so each
                // surface is fully independent (Requirement 5.4).
                Material instanceMaterial = new Material(renderer.sharedMaterial);
                renderer.material = instanceMaterial;
                _materials[id] = instanceMaterial;
            }
        }

        // ── ISurfaceManager implementation ───────────────────────────────────

        /// <summary>
        /// Applies <paramref name="color"/> to the material of the specified surface.
        /// The change is visible within the current rendered frame (Requirement 5.1).
        /// </summary>
        public void SetSurfaceColor(SurfaceId surfaceId, Color color)
        {
            Material mat = GetMaterialOrWarn(surfaceId);
            if (mat == null) return;

            mat.color = color;
        }

        /// <summary>
        /// Loads a PNG or JPG texture from <paramref name="filePath"/> and applies it
        /// to the specified surface with tiling (Requirement 5.2).
        /// Returns <c>false</c> and raises <see cref="OnValidationError"/> if the file
        /// exceeds 10 MB (Requirement 5.3) or cannot be loaded.
        /// </summary>
        public async Task<bool> SetSurfaceTextureAsync(SurfaceId surfaceId, string filePath)
        {
            Material mat = GetMaterialOrWarn(surfaceId);
            if (mat == null) return false;

            // ── File existence check ─────────────────────────────────────────
            if (!File.Exists(filePath))
            {
                string msg = $"[SurfaceManager] Texture file not found: {filePath}";
                Debug.LogError(msg);
                OnValidationError?.Invoke(msg);
                return false;
            }

            // ── File size check (≤ 10 MB) ────────────────────────────────────
            long fileSize = new FileInfo(filePath).Length;
            if (fileSize > MaxFileSizeBytes)
            {
                string msg = $"[SurfaceManager] Texture file '{filePath}' exceeds the 10 MB size limit " +
                             $"({fileSize / (1024 * 1024.0):F2} MB). File rejected.";
                Debug.LogWarning(msg);
                OnValidationError?.Invoke(msg);
                return false;
            }

            // ── Load texture bytes asynchronously ────────────────────────────
            byte[] bytes;
            try
            {
                bytes = await Task.Run(() => File.ReadAllBytes(filePath));
            }
            catch (Exception ex)
            {
                string msg = $"[SurfaceManager] Failed to read texture file '{filePath}': {ex.Message}";
                Debug.LogError(msg);
                OnValidationError?.Invoke(msg);
                return false;
            }

            // ── Decode into a Texture2D ──────────────────────────────────────
            // Texture2D.LoadImage must run on the main thread (Unity API restriction).
            Texture2D texture = new Texture2D(2, 2);
            if (!texture.LoadImage(bytes))
            {
                string msg = $"[SurfaceManager] Failed to decode texture from '{filePath}'. " +
                             "Ensure the file is a valid PNG or JPG.";
                Debug.LogError(msg);
                OnValidationError?.Invoke(msg);
                UnityEngine.Object.Destroy(texture);
                return false;
            }

            // ── Apply texture and tiling to the material ─────────────────────
            mat.mainTexture = texture;
            mat.mainTextureScale = new Vector2(_defaultTileX, _defaultTileY);

            return true;
        }

        /// <summary>
        /// Returns the <see cref="Material"/> instance assigned to the specified surface.
        /// Returns <c>null</c> if the surface has not been initialised.
        /// </summary>
        public Material GetSurfaceMaterial(SurfaceId surfaceId)
        {
            _materials.TryGetValue(surfaceId, out Material mat);
            return mat;
        }

        // ── Private helpers ──────────────────────────────────────────────────

        private Material GetMaterialOrWarn(SurfaceId surfaceId)
        {
            if (_materials.TryGetValue(surfaceId, out Material mat))
                return mat;

            Debug.LogWarning($"[SurfaceManager] No material found for surface {surfaceId}. " +
                             "Ensure Awake() completed successfully.");
            return null;
        }
    }
}
