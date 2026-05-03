namespace RoomVisualizer
{
    /// <summary>
    /// Manages wall transparency based on the current camera yaw step.
    /// Fades the two front-facing walls to a configurable alpha and restores
    /// the previously front-facing walls to fully opaque.
    /// Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
    /// </summary>
    public interface IWallVisibilityManager
    {
        /// <summary>
        /// Called when the camera yaw step changes. Triggers fade/restore coroutines
        /// for the appropriate wall pairs.
        /// </summary>
        void OnYawStepChanged(int yawStepIndex);

        /// <summary>
        /// Target alpha for front-facing (faded) walls. Default 0.15.
        /// </summary>
        float FadeAlpha { get; set; }

        /// <summary>
        /// Duration in seconds for the fade/restore transition. Default 0.2s.
        /// </summary>
        float FadeDuration { get; set; }
    }
}
