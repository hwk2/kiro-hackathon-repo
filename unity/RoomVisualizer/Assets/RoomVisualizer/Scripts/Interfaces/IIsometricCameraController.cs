using System;

namespace RoomVisualizer
{
    /// <summary>
    /// Extends ICameraController with isometric-mode and four-step yaw rotation.
    /// Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5
    /// </summary>
    public interface IIsometricCameraController : ICameraController
    {
        /// <summary>
        /// Current yaw step index in the range [0, 3].
        /// Maps to yaw angles: 0->45 deg, 1->135 deg, 2->225 deg, 3->315 deg.
        /// </summary>
        int YawStepIndex { get; }

        /// <summary>Whether the camera is currently in isometric (orthographic) mode.</summary>
        bool IsIsometricMode { get; }

        /// <summary>
        /// Advances the yaw step by direction (+1 or -1), modulo 4.
        /// Sets yaw to 45 + YawStepIndex * 90 degrees and animates the transition
        /// over no more than 0.3 seconds. Raises OnYawStepChanged.
        /// </summary>
        void RotateStep(int direction);

        /// <summary>
        /// Toggles between isometric (orthographic, pitch=30 deg, yaw locked to step) and
        /// the previously active perspective view. Preserves zoom level across the toggle.
        /// </summary>
        void ToggleIsometricMode();

        /// <summary>
        /// Raised when the yaw step index changes. Carries the new YawStepIndex.
        /// </summary>
        event Action<int> OnYawStepChanged;
    }
}
