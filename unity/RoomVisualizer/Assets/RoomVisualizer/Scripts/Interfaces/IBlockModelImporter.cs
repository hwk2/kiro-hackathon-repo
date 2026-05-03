using System.Threading.Tasks;

namespace RoomVisualizer
{
    public interface IBlockModelImporter
    {
        Task<ImportResult> ImportAsync(BlockModelData blockModel);
    }
}
