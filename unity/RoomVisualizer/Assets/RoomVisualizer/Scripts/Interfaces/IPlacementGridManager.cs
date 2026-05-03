using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Manages per-surface placement grids, converting between grid coordinates and
    /// world-space positions, and tracking cell occupancy.
    /// Requirement 15.
    /// </summary>
    public interface IPlacementGridManager
    {
        /// <summary>Side length of one grid cell in metres (default 0.5).</summary>
        float CellSize { get; }

        /// <summary>
        /// Returns the world-space centre position of the specified grid cell on the
        /// given surface.
        /// </summary>
        Vector3 GridToWorld(SurfaceId surface, int gridX, int gridY);

        /// <summary>
        /// Returns the nearest grid cell coordinates for a given world-space position
        /// on the specified surface. Result is clamped to valid grid bounds.
        /// </summary>
        Vector2Int WorldToGrid(SurfaceId surface, Vector3 worldPosition);

        /// <summary>Returns <c>true</c> if the cell is already occupied.</summary>
        bool IsCellOccupied(SurfaceId surface, int gridX, int gridY);

        /// <summary>
        /// Marks all cells in the <paramref name="width"/> x <paramref name="height"/>
        /// rectangle anchored at (<paramref name="gridX"/>, <paramref name="gridY"/>) as occupied.
        /// </summary>
        void MarkOccupied(SurfaceId surface, int gridX, int gridY, int width, int height);

        /// <summary>
        /// Clears all cells in the <paramref name="width"/> x <paramref name="height"/>
        /// rectangle anchored at (<paramref name="gridX"/>, <paramref name="gridY"/>).
        /// </summary>
        void MarkUnoccupied(SurfaceId surface, int gridX, int gridY, int width, int height);

        /// <summary>
        /// Rebuilds grid extents from the current room dimensions and clears all
        /// occupancy data. Called automatically when room dimensions change.
        /// </summary>
        void RecalculateGrids();
    }
}
