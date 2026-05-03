using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages ambient and point lighting for the Room.
    /// Provides a default ambient light on creation and supports up to four
    /// simultaneous point lights (Requirement 6.1, 6.4).
    /// Implements ILightingManager.
    /// </summary>
    public class LightingManager : MonoBehaviour, ILightingManager
    {
        // ── Internal state ───────────────────────────────────────────────────

        /// <summary>
        /// Tracks all active point light GameObjects created via <see cref="AddPointLight"/>.
        /// </summary>
        private readonly List<GameObject> _pointLights = new List<GameObject>();

        // ── Constants ────────────────────────────────────────────────────────

        /// <summary>Maximum number of simultaneous point lights (Requirement 6.4).</summary>
        private const int MaxPointLights = 4;

        /// <summary>Default ambient intensity applied on room creation (Requirement 6.1).</summary>
        private const float DefaultAmbientIntensity = 1.0f;

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            // Set up a default ambient light active on room creation (Requirement 6.1).
            // Use Flat (uniform) ambient mode so the intensity slider maps directly to
            // RenderSettings.ambientIntensity without directional bias.
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientIntensity = DefaultAmbientIntensity;
        }

        // ── ILightingManager implementation ──────────────────────────────────

        /// <summary>
        /// Sets the scene ambient light intensity by writing directly to
        /// <see cref="RenderSettings.ambientIntensity"/> (Requirement 6.2).
        /// The change is reflected in the next rendered frame.
        /// </summary>
        /// <param name="intensity">Ambient intensity value (typically [0, 1]).</param>
        public void SetAmbientIntensity(float intensity)
        {
            RenderSettings.ambientIntensity = intensity;
        }

        /// <summary>
        /// Creates a new point light at the specified world position with the given
        /// colour and intensity (Requirement 6.3).
        /// Returns <c>false</c> without creating a light if the maximum of four point
        /// lights is already reached (Requirement 6.4).
        /// </summary>
        /// <param name="position">World-space position for the new point light.</param>
        /// <param name="color">Light colour.</param>
        /// <param name="intensity">Light intensity.</param>
        /// <returns><c>true</c> if the light was created; <c>false</c> if the limit was reached.</returns>
        public bool AddPointLight(Vector3 position, Color color, float intensity)
        {
            if (_pointLights.Count >= MaxPointLights)
            {
                Debug.LogWarning($"[LightingManager] Cannot add point light: maximum of {MaxPointLights} already reached.");
                return false;
            }

            // Create a child GameObject to hold the Light component.
            GameObject lightGO = new GameObject($"PointLight_{_pointLights.Count}");
            lightGO.transform.SetParent(transform, worldPositionStays: false);
            lightGO.transform.position = position;

            // Configure the Light component.
            Light light = lightGO.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.intensity = intensity;

            _pointLights.Add(lightGO);
            return true;
        }

        /// <summary>
        /// Destroys the point light at the given index and removes it from the internal list.
        /// Does nothing if <paramref name="index"/> is out of range (Requirement 6.3).
        /// </summary>
        /// <param name="index">Zero-based index of the point light to remove.</param>
        public void RemovePointLight(int index)
        {
            if (index < 0 || index >= _pointLights.Count)
            {
                Debug.LogWarning($"[LightingManager] RemovePointLight: index {index} is out of range " +
                                 $"(PointLightCount = {_pointLights.Count}). No action taken.");
                return;
            }

            GameObject lightGO = _pointLights[index];
            _pointLights.RemoveAt(index);
            Destroy(lightGO);
        }

        /// <summary>
        /// Returns the current number of active point lights.
        /// </summary>
        public int PointLightCount => _pointLights.Count;
    }
}
