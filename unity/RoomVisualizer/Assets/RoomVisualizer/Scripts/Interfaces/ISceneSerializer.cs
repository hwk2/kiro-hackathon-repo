using System.Threading.Tasks;

namespace RoomVisualizer
{
    public interface ISceneSerializer
    {
        Task<bool> SaveAsync(string filePath, SceneData data);
        Task<LoadSceneResult> LoadAsync(string filePath);
    }
}
