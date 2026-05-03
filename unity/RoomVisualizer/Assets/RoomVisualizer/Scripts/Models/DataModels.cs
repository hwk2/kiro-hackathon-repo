using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoomVisualizer
{
    // ── Scene serialisation ──────────────────────────────────────────────────

    [Serializable]
    public class SceneData
    {
        public RoomDimensionsData Room;
        public List<PlacedObjectData> Objects;
        public Dictionary<string, MaterialData> Surfaces; // keyed by SurfaceId name
        public LightingData Lighting;
        public string SaveFormatVersion = "1.0";
    }

    [Serializable]
    public class RoomDimensionsData
    {
        public float Width;
        public float Depth;
        public float Height;
    }

    [Serializable]
    public class PlacedObjectData
    {
        public string AssetPath;
        public SerializableVector3 Position;
        public SerializableVector3 EulerAngles;
        public SerializableVector3 Scale;
    }

    [Serializable]
    public class MaterialData
    {
        public SerializableColor Color;
        public string TexturePath; // null if no texture
    }

    [Serializable]
    public class LightingData
    {
        public float AmbientIntensity;
        public List<PointLightData> PointLights;
    }

    [Serializable]
    public class PointLightData
    {
        public SerializableVector3 Position;
        public SerializableColor Color;
        public float Intensity;
    }

    [Serializable]
    public struct SerializableVector3
    {
        public float X, Y, Z;

        public SerializableVector3(float x, float y, float z) { X = x; Y = y; Z = z; }
        public SerializableVector3(Vector3 v) { X = v.x; Y = v.y; Z = v.z; }
        public Vector3 ToVector3() => new Vector3(X, Y, Z);
    }

    [Serializable]
    public struct SerializableColor
    {
        public float R, G, B, A;

        public SerializableColor(float r, float g, float b, float a = 1f) { R = r; G = g; B = b; A = a; }
        public SerializableColor(Color c) { R = c.r; G = c.g; B = c.b; A = c.a; }
        public Color ToColor() => new Color(R, G, B, A);
    }

    // ── Operation results ────────────────────────────────────────────────────

    public class LoadResult
    {
        public bool Success;
        public GameObject InstantiatedObject; // null on failure
        public string ErrorMessage;
        public bool HasMissingTextures;
    }

    public class LoadSceneResult
    {
        public bool Success;
        public SceneData Data;
        public string ErrorMessage;
        public List<MissingAssetWarning> MissingAssets = new List<MissingAssetWarning>();
    }

    public class MissingAssetWarning
    {
        public string AssetPath;
        public string Message;
    }

    public class OperationResult
    {
        public bool Success;
        public string OperationName;
        public string Message;
        public object Payload;
    }

    public class ImportResult
    {
        public bool Success;
        public int BlocksImported;
        public int BlocksFailed;
        public List<string> Warnings = new List<string>();
    }

    // ── BlockModel (incoming from AI Pipeline — read-only mapping) ───────────

    [Serializable]
    public class BlockModelData
    {
        public string model_id;
        public string created_at;
        public BlockRoomDimensions room_dimensions;
        public List<BlockEntry> blocks;
        public string version;
    }

    [Serializable]
    public class BlockRoomDimensions
    {
        public float width;
        public float height;
        public float depth;
        public string unit; // always "meters"
    }

    [Serializable]
    public class BlockEntry
    {
        public string block_id;
        public string category;
        public string label;
        public string description;
        public float confidence_score;
        public bool low_confidence;
        public BlockVector3 position;
        public BlockVector3 dimensions;
        public BlockRotation rotation;
        public List<string> source_images;
    }

    [Serializable]
    public class BlockVector3
    {
        public float x, y, z;
        public Vector3 ToVector3() => new Vector3(x, y, z);
    }

    [Serializable]
    public class BlockRotation
    {
        public float pitch, yaw, roll;
    }

    // ── Material / Lighting params (used by UIBridge HTTP endpoints) ─────────

    [Serializable]
    public class MaterialParams
    {
        public SerializableColor Color;
        public string TexturePath; // null if color-only
    }

    [Serializable]
    public class LightingParams
    {
        public bool IsAmbient;
        public float Intensity;
        public SerializableColor Color;
        public SerializableVector3 Position; // used for point lights
    }
}
