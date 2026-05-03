using System.Collections;
using System.IO;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// PlayMode integration test: full HTTP → BlockModel → scene flow.
    ///
    /// Validates the end-to-end path that Member 2 (Desktop bridge) and
    /// Member 3 (AI Pipeline) depend on:
    ///   POST /load-block-model  →  BlockModelImporter  →  objects in scene
    ///
    /// Requirements: 10.1, 10.4, 11.2, 11.3, 11.4
    ///
    /// NOTE: Requires HttpListenerService (Task 14.1) to be implemented.
    /// </summary>
    [TestFixture]
    public class HttpToBlockModelIntegrationTests
    {
        private const int TestPort = 18323; // separate port from EditMode tests
        private const string BaseUrl = "http://localhost:18323";

        private GameObject _root;
        private HttpListenerService _service;
        private UIBridge _bridge;
        private BlockModelImporter _importer;

        [UnitySetUp]
        public IEnumerator SetUp()
        {
            // Build a minimal scene: RoomController + ObjectPlacer + BlockModelImporter + UIBridge + HttpListenerService
            _root = new GameObject("IntegrationRoot");

            var roomGo = new GameObject("RoomController");
            var room = roomGo.AddComponent<RoomController>();

            var placerGo = new GameObject("ObjectPlacer");
            var placer = placerGo.AddComponent<ObjectPlacer>();

            var importerGo = new GameObject("BlockModelImporter");
            _importer = importerGo.AddComponent<BlockModelImporter>();
            _importer.SetDependencies(room, null, placer, null); // no AssetLoader → uses primitives

            var bridgeGo = new GameObject("UIBridge");
            _bridge = bridgeGo.AddComponent<UIBridge>();
            _bridge.SetDependencies(room, null, placer, null, null, null, null, _importer);

            var serviceGo = new GameObject("HttpListenerService");
            _service = serviceGo.AddComponent<HttpListenerService>();
            _service.Port = TestPort;
            _service.Bridge = _bridge;
            _service.StartListening();

            yield return null; // let Awake/Start run
        }

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            _service.StopListening();
            Object.Destroy(_root);
            foreach (var go in Object.FindObjectsOfType<GameObject>())
                Object.Destroy(go);
            yield return null;
        }

        // ── Full pipeline: HTTP POST → scene populated ───────────────────────

        [UnityTest]
        public IEnumerator PostLoadBlockModel_SingleBlock_AppearsInScene()
        {
            int objectsBefore = Object.FindObjectsOfType<GameObject>().Length;

            // Send the request on a background thread, then wait for the scene to update
            bool done = false;
            int statusCode = 0;
            string responseBody = null;

            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                (statusCode, responseBody) = PostSync($"{BaseUrl}/load-block-model", BuildBlockModelJson(1));
                done = true;
            });

            // Wait up to 3 seconds for the HTTP round-trip + main-thread dispatch
            float elapsed = 0f;
            while (!done && elapsed < 3f)
            {
                _service.DrainMainThreadQueue(); // pump the ConcurrentQueue
                elapsed += Time.deltaTime;
                yield return null;
            }

            Assert.IsTrue(done, "HTTP request did not complete within 3 seconds");
            Assert.AreEqual(200, statusCode, $"Expected 200, got {statusCode}. Body: {responseBody}");

            OperationResult result = JsonConvert.DeserializeObject<OperationResult>(responseBody);
            Assert.IsNotNull(result);
            Assert.IsTrue(result.Success, $"OperationResult.Success was false: {result.Message}");

            // At least one new GameObject should have been added to the scene
            int objectsAfter = Object.FindObjectsOfType<GameObject>().Length;
            Assert.Greater(objectsAfter, objectsBefore, "No new GameObjects were added to the scene");
        }

        [UnityTest]
        public IEnumerator PostLoadBlockModel_ThreeBlocks_AllAppearInScene()
        {
            bool done = false;
            int statusCode = 0;
            string responseBody = null;

            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                (statusCode, responseBody) = PostSync($"{BaseUrl}/load-block-model", BuildBlockModelJson(3));
                done = true;
            });

            float elapsed = 0f;
            while (!done && elapsed < 3f)
            {
                _service.DrainMainThreadQueue();
                elapsed += Time.deltaTime;
                yield return null;
            }

            Assert.IsTrue(done, "HTTP request timed out");
            Assert.AreEqual(200, statusCode);

            OperationResult result = JsonConvert.DeserializeObject<OperationResult>(responseBody);
            Assert.IsNotNull(result?.Payload);

            // Payload should carry ImportResult with BlocksImported == 3
            var importResult = JsonConvert.DeserializeObject<ImportResult>(
                JsonConvert.SerializeObject(result.Payload));
            Assert.AreEqual(3, importResult.BlocksImported);
        }

        [UnityTest]
        public IEnumerator PostLoadBlockModel_RoomDimensions_AppliedToScene()
        {
            string json = JsonConvert.SerializeObject(new
            {
                model_id = "dim-test",
                version = "1.0",
                room_dimensions = new { width = 10f, depth = 8f, height = 4f, unit = "meters" },
                blocks = new object[0]
            });

            bool done = false;
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                PostSync($"{BaseUrl}/load-block-model", json);
                done = true;
            });

            float elapsed = 0f;
            while (!done && elapsed < 3f)
            {
                _service.DrainMainThreadQueue();
                elapsed += Time.deltaTime;
                yield return null;
            }

            var room = Object.FindObjectOfType<RoomController>();
            Assert.IsNotNull(room);
            Assert.AreEqual(10f, room.Dimensions.x, 0.01f, "Room width not applied");
            Assert.AreEqual(8f, room.Dimensions.z, 0.01f, "Room depth not applied");
        }

        [UnityTest]
        public IEnumerator PostLoadBlockModel_MalformedJson_Returns400AndSceneUnchanged()
        {
            int objectsBefore = Object.FindObjectsOfType<GameObject>().Length;

            bool done = false;
            int statusCode = 0;

            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                (statusCode, _) = PostSync($"{BaseUrl}/load-block-model", "{ bad json !!!");
                done = true;
            });

            float elapsed = 0f;
            while (!done && elapsed < 3f)
            {
                _service.DrainMainThreadQueue();
                elapsed += Time.deltaTime;
                yield return null;
            }

            Assert.AreEqual(400, statusCode, "Malformed JSON must return HTTP 400");
            int objectsAfter = Object.FindObjectsOfType<GameObject>().Length;
            Assert.AreEqual(objectsBefore, objectsAfter, "Scene must be unchanged after a bad request");
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static string BuildBlockModelJson(int blockCount)
        {
            var blocks = new object[blockCount];
            for (int i = 0; i < blockCount; i++)
            {
                blocks[i] = new
                {
                    block_id = $"b{i}",
                    category = $"object_{i}",
                    label = $"Object {i}",
                    confidence_score = 0.85f,
                    low_confidence = false,
                    position = new { x = (float)i, y = 0f, z = (float)i },
                    dimensions = new { x = 0.5f, y = 0.5f, z = 0.5f },
                    rotation = new { pitch = 0f, yaw = 0f, roll = 0f }
                };
            }

            return JsonConvert.SerializeObject(new
            {
                model_id = "integration-test",
                version = "1.0",
                room_dimensions = new { width = 10f, depth = 10f, height = 3f, unit = "meters" },
                blocks
            });
        }

        /// <summary>Synchronous HTTP POST for use on a background thread.</summary>
        private static (int statusCode, string body) PostSync(string url, string json)
        {
            try
            {
                var request = WebRequest.CreateHttp(url);
                request.Method = "POST";
                request.ContentType = "application/json";
                request.Timeout = 3000;

                byte[] bytes = Encoding.UTF8.GetBytes(json);
                request.ContentLength = bytes.Length;

                using var reqStream = request.GetRequestStream();
                reqStream.Write(bytes, 0, bytes.Length);

                using var response = (HttpWebResponse)request.GetResponse();
                using var reader = new StreamReader(response.GetResponseStream()!);
                return ((int)response.StatusCode, reader.ReadToEnd());
            }
            catch (WebException ex) when (ex.Response is HttpWebResponse errResp)
            {
                using var reader = new StreamReader(errResp.GetResponseStream()!);
                return ((int)errResp.StatusCode, reader.ReadToEnd());
            }
        }
    }
}
