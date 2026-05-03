using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Marker component added to GameObjects imported from a BlockModel block
    /// where low_confidence is true (confidence_score < 0.5).
    /// The renderer uses this tag to apply a translucent overlay matching
    /// the Desktop Visualization Engine's low-confidence visual treatment.
    /// </summary>
    public class LowConfidenceTag : MonoBehaviour
    {
        [Tooltip("The confidence score from the AI Pipeline (0.0 - 1.0)")]
        public float ConfidenceScore;

        private void Start()
        {
            ApplyLowConfidenceVisual();
        }

        private void ApplyLowConfidenceVisual()
        {
            var renderers = GetComponentsInChildren<Renderer>();
            foreach (var r in renderers)
            {
                // Apply translucent overlay by modifying material color alpha
                foreach (var mat in r.materials)
                {
                    // Enable transparency
                    mat.SetFloat("_Mode", 3); // Transparent mode (Standard shader)
                    mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
                    mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                    mat.SetInt("_ZWrite", 0);
                    mat.DisableKeyword("_ALPHATEST_ON");
                    mat.EnableKeyword("_ALPHABLEND_ON");
                    mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                    mat.renderQueue = 3000;

                    var color = mat.color;
                    color.a = 0.5f; // 50% transparent for low-confidence objects
                    mat.color = color;
                }
            }
        }
    }
}
