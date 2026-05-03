namespace RoomVisualizer
{
    public enum SurfaceId
    {
        WallNorth,
        WallSouth,
        WallEast,
        WallWest,
        Floor,
        Ceiling
    }

    public enum PlacementResult
    {
        Success,
        Blocked,
        OutOfBounds
    }

    public enum ProjectionType
    {
        Perspective,
        Orthographic
    }
}
