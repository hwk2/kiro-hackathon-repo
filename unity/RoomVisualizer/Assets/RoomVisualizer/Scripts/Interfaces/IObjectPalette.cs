using System;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages the in-game UI panel that displays available prefabs as clickable
    /// buttons and initiates placement sessions when a button is clicked.
    /// Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
    /// </summary>
    public interface IObjectPalette
    {
        /// <summary>
        /// Populates the palette with buttons from the given AssetLibraryConfig.
        /// Buttons are grouped by Category.
        /// </summary>
        void Populate(AssetLibraryConfig config);

        /// <summary>
        /// Highlights the button for the given prefabId to indicate the active selection.
        /// </summary>
        void SetActiveEntry(string prefabId);

        /// <summary>
        /// Clears the active button highlight (e.g., after placement is cancelled or confirmed).
        /// </summary>
        void ClearActiveEntry();

        /// <summary>
        /// Raised when a prefab button is clicked. Carries the prefabId of the selected entry.
        /// </summary>
        event Action<string> OnPrefabSelected;
    }
}
