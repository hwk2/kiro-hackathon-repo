using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using NUnit.Framework;
using UnityEngine;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// EditMode tests for HttpListenerService — validates the Desktop bridge integration
    /// (Member 2 → Member 4 boundary).
    ///
    /// Design Property covered:
    ///   Property 19: HTTP listener returns OperationResult for every request
    /// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
    ///
    /// NOTE: HttpListenerService (Task 14.1) must be implemented before these tests compile.
    /// Tests are written against the spec interface defined in design.md.
    /// </summary>
    [TestFixture]
    public class HttpListenerServiceTests
    {
        private const int TestPort = 18322; // offset from 8322 to avoid conflicts in CI
        private const string BaseUrl = "http://localhost:18322";

        private GameObject _serviceGo;
        private HttpListenerService _service;
        private FakeUIBridge _bridge;

        [SetUp]
        public void SetUp()
        {
            _serviceGo = new GameObject("HttpListenerService");
            _bridge = _serviceGo.AddComponent<FakeUIBridge>();
            _service = _serviceGo.AddComponent<HttpListenerService>();
            _service.Port = TestPort;
            _service.Bridge = _bridge;
            _service.StartListening(); // explicit start so tests control lifecycle
        }

        [TearDown]
        public void TearDown()
        {
            _service.StopListening();
            UnityEngine.Object.DestroyImmediate(_serviceGo);
        }

        // ── GET /health (Requirement 11.2) ───────────────────────────────────

        [Test]
        public async Task GetHealth_Returns200WithStatusOk()
        {
            string body = await GetAsync($"{BaseUrl}/health");

            Assert.IsNotNull(body);
            StringAssert.Contains("ok", body);
            StringAssert.Contains("version", body);
        }

        [Test]
        public async Task GetHealth_ResponseIsValidJson()
        {
            string body = await GetAsync($"{BaseUrl}/health");

            Assert.DoesNotThrow(() => JsonConvert.DeserializeObject(body),
                "Health response must be valid JSON");
        }

        // ── POST /load-block-model (Requirements 11.2, 11.3, 11.4) ──────────

        [Test]
        public void PostLoadBlockModel_ValidJson_Returns200WithSuccessResult()
        {
            string sampleBlockModel = BuildSampleBlockModelJson();

            bool done = false;
            int statusCode = 0;
            string body = null;
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                (statusCode, body) = PostSync($"{BaseUrl}/load-block-model", sampleBlockModel);
                done = true;
            });

            var deadline = System.DateTime.UtcNow.AddSeconds(3);
            while (!done && System.DateTime.UtcNow < deadline)
            {
                _service.DrainMainThreadQueue();
                System.Threading.Thread.Sleep(10);
            }

            Assert.IsTrue(done, "HTTP request did not complete within 3 seconds");
            Assert.AreEqual(200, statusCode);
            OperationResult result = JsonConvert.DeserializeObject<OperationResult>(body);
            Assert.IsNotNull(result);
            Assert.IsNotNull(result.OperationName, "OperationName must not be null (Property 19)");
            Assert.IsTrue(result.Success);
        }

        [Test]
        public void PostLoadBlockModel_ValidJson_ForwardsBodyToUIBridge()
        {
            string sampleBlockModel = BuildSampleBlockModelJson();

            // Run the POST on a background thread so the test thread can drain the queue.
            bool done = false;
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                PostSync($"{BaseUrl}/load-block-model", sampleBlockModel);
                done = true;
            });

            // Drain the main-thread queue until the request completes (max 3 seconds).
            var deadline = System.DateTime.UtcNow.AddSeconds(3);
            while (!done && System.DateTime.UtcNow < deadline)
            {
                _service.DrainMainThreadQueue();
                System.Threading.Thread.Sleep(10);
            }

            Assert.IsTrue(done, "HTTP request did not complete within 3 seconds");
            Assert.AreEqual(1, _bridge.LoadBlockModelCalls.Count,
                "UIBridge.LoadBlockModel must be called exactly once");
            StringAssert.Contains("test-model", _bridge.LoadBlockModelCalls[0]);
        }

        // ── Malformed JSON (Requirement 11.3 error path) ─────────────────────

        [Test]
        public async Task PostLoadBlockModel_MalformedJson_Returns400()
        {
            (int statusCode, string body) = await PostAsync($"{BaseUrl}/load-block-model", "{ not valid json }}}");

            Assert.AreEqual(400, statusCode);
        }

        [Test]
        public async Task PostLoadBlockModel_MalformedJson_ResponseBodyIsOperationResultWithFailure()
        {
            // Property 19: even error responses must be valid OperationResult JSON
            (int _, string body) = await PostAsync($"{BaseUrl}/load-block-model", "{ not valid json }}}");

            OperationResult result = JsonConvert.DeserializeObject<OperationResult>(body);
            Assert.IsNotNull(result);
            Assert.IsFalse(result.Success);
            Assert.IsNotNull(result.OperationName, "OperationName must not be null even on failure");
        }

        [Test]
        public async Task PostLoadBlockModel_EmptyBody_Returns400()
        {
            (int statusCode, string _) = await PostAsync($"{BaseUrl}/load-block-model", "");

            Assert.AreEqual(400, statusCode);
        }

        // ── Port-in-use (Requirement 11.6) ───────────────────────────────────

        [Test]
        public void StartListening_PortAlreadyBound_DisablesComponentWithoutThrowing()
        {
            // Bind the port ourselves first
            var blocker = new HttpListener();
            blocker.Prefixes.Add($"http://localhost:{TestPort + 1}/");
            blocker.Start();

            try
            {
                var go2 = new GameObject("HttpListenerService2");
                var service2 = go2.AddComponent<HttpListenerService>();
                service2.Port = TestPort + 1;
                service2.Bridge = _bridge;

                Assert.DoesNotThrow(() => service2.StartListening(),
                    "Port-in-use must not throw — service should disable itself gracefully");

                Assert.IsFalse(service2.IsListening,
                    "Service must mark itself as not listening when port is taken");

                UnityEngine.Object.DestroyImmediate(go2);
            }
            finally
            {
                blocker.Stop();
                blocker.Close();
            }
        }

        // ── Unknown endpoint ─────────────────────────────────────────────────

        [Test]
        public async Task UnknownEndpoint_Returns404()
        {
            (int statusCode, string _) = await PostAsync($"{BaseUrl}/does-not-exist", "{}");

            Assert.AreEqual(404, statusCode);
        }

        // ── HTTP helpers ─────────────────────────────────────────────────────

        private static async Task<string> GetAsync(string url)
        {
            var request = WebRequest.CreateHttp(url);
            request.Method = "GET";
            request.Timeout = 3000;

            using var response = (HttpWebResponse)await request.GetResponseAsync();
            using var reader = new StreamReader(response.GetResponseStream()!);
            return await reader.ReadToEndAsync();
        }

        private static async Task<(int statusCode, string body)> PostAsync(string url, string json)
        {
            var request = WebRequest.CreateHttp(url);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = 3000;

            byte[] bytes = Encoding.UTF8.GetBytes(json);
            request.ContentLength = bytes.Length;

            try
            {
                using var reqStream = await request.GetRequestStreamAsync();
                await reqStream.WriteAsync(bytes, 0, bytes.Length);

                using var response = (HttpWebResponse)await request.GetResponseAsync();
                using var reader = new StreamReader(response.GetResponseStream()!);
                return ((int)response.StatusCode, await reader.ReadToEndAsync());
            }
            catch (WebException ex) when (ex.Response is HttpWebResponse errResp)
            {
                using var reader = new StreamReader(errResp.GetResponseStream()!);
                return ((int)errResp.StatusCode, await reader.ReadToEndAsync());
            }
        }

        /// <summary>Synchronous HTTP POST for use on a background thread.</summary>
        private static (int statusCode, string body) PostSync(string url, string json)
        {
            try
            {
                var request = WebRequest.CreateHttp(url);
                request.Method = "POST";
                request.ContentType = "application/json";
                request.Timeout = 5000;

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

        private static string BuildSampleBlockModelJson() => JsonConvert.SerializeObject(new
        {
            model_id = "test-model",
            version = "1.0",
            created_at = "2026-05-02T00:00:00Z",
            room_dimensions = new { width = 5f, depth = 5f, height = 3f, unit = "meters" },
            blocks = new[]
            {
                new
                {
                    block_id = "b1",
                    category = "chair",
                    label = "Chair",
                    confidence_score = 0.9f,
                    low_confidence = false,
                    position = new { x = 1f, y = 0f, z = 1f },
                    dimensions = new { x = 0.6f, y = 0.9f, z = 0.6f },
                    rotation = new { pitch = 0f, yaw = 0f, roll = 0f }
                }
            }
        });
    }
}
