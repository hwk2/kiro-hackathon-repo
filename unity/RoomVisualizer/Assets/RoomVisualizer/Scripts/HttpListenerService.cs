using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace RoomVisualizer
{
    /// <summary>
    /// Embeds a System.Net.HttpListener on localhost:8322 (configurable via Port).
    /// Routes incoming HTTP requests to UIBridge methods on the Unity main thread via
    /// a ConcurrentQueue drained in Update() / DrainMainThreadQueue().
    ///
    /// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
    /// </summary>
    public class HttpListenerService : MonoBehaviour
    {
        // ── Public configuration ─────────────────────────────────────────────

        public int Port = 8322;

        [SerializeField]
        private UIBridge _bridgeRef;

        /// <summary>Active bridge. Tests assign this directly; runtime uses _bridgeRef.</summary>
        public IUIBridge Bridge;

        /// <summary>True when the listener is actively accepting requests.</summary>
        public bool IsListening { get; private set; }

        // ── Internal state ───────────────────────────────────────────────────

        private HttpListener _listener;
        private Thread _listenerThread;
        private readonly ConcurrentQueue<Action> _mainThreadQueue = new ConcurrentQueue<Action>();

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Awake()
        {
            if (Bridge == null) Bridge = _bridgeRef;
            StartListening();
        }

        private void Update() => DrainMainThreadQueue();

        private void OnDestroy() => StopListening();

        // ── Public API ───────────────────────────────────────────────────────

        public void StartListening()
        {
            if (IsListening) return;

            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://localhost:{Port}/");

            try
            {
                _listener.Start();
            }
            catch (Exception ex)
            {
                Debug.LogError($"[HttpListenerService] Cannot bind port {Port}: {ex.Message}. HTTP interface disabled.");
                _listener = null;
                enabled = false;
                return;
            }

            IsListening = true;
            _listenerThread = new Thread(ListenLoop) { IsBackground = true };
            _listenerThread.Start();
        }

        public void StopListening()
        {
            if (!IsListening) return;
            IsListening = false;
            try { _listener?.Stop(); } catch { /* ignore */ }
            _listener = null;
        }

        /// <summary>
        /// Drains the main-thread action queue. Called automatically in Update();
        /// tests call this manually to simulate Unity's frame loop.
        /// </summary>
        public void DrainMainThreadQueue()
        {
            while (_mainThreadQueue.TryDequeue(out Action action))
            {
                try { action(); }
                catch (Exception ex) { Debug.LogError($"[HttpListenerService] Main-thread action threw: {ex}"); }
            }
        }

        // ── Background listener loop ─────────────────────────────────────────

        private void ListenLoop()
        {
            while (IsListening && _listener != null)
            {
                HttpListenerContext ctx;
                try { ctx = _listener.GetContext(); }
                catch { break; }

                ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
            }
        }

        private void HandleRequest(HttpListenerContext ctx)
        {
            string method = ctx.Request.HttpMethod;
            string path   = ctx.Request.Url.AbsolutePath.TrimEnd('/');

            // ── GET /health ──────────────────────────────────────────────────
            if (method == "GET" && path == "/health")
            {
                Respond(ctx, 200, "{\"status\":\"ok\",\"version\":\"1.0\"}");
                return;
            }

            // ── POST endpoints ───────────────────────────────────────────────
            if (method != "POST")
            {
                Respond(ctx, 404, FailJson("Unknown", $"No endpoint: {method} {path}"));
                return;
            }

            string body;
            try
            {
                using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    body = reader.ReadToEnd();
            }
            catch (Exception ex)
            {
                Respond(ctx, 400, FailJson("ReadBody", ex.Message));
                return;
            }

            if (string.IsNullOrWhiteSpace(body))
            {
                Respond(ctx, 400, FailJson(PathToOpName(path), "Empty request body"));
                return;
            }

            // /load-block-model passes the raw JSON string directly — no pre-parsing needed
            if (path == "/load-block-model")
            {
                DispatchToUIBridge(ctx, "LoadBlockModel", () => Bridge?.LoadBlockModel(body));
                return;
            }

            // All other POST endpoints require a valid JSON object body
            JObject json;
            try { json = JObject.Parse(body); }
            catch
            {
                Respond(ctx, 400, FailJson(PathToOpName(path), "Invalid JSON body"));
                return;
            }

            switch (path)
            {
                case "/load-asset":
                    DispatchToUIBridge(ctx, "LoadAsset",
                        () => Bridge?.LoadAsset(json["filePath"]?.Value<string>() ?? string.Empty));
                    break;

                case "/place-object":
                    DispatchToUIBridge(ctx, "PlaceObject", () =>
                    {
                        string assetRef = json["assetRef"]?.Value<string>() ?? string.Empty;
                        Vector3 pos = ParseVector3(json["position"]);
                        Bridge?.PlaceObject(assetRef, pos);
                    });
                    break;

                case "/move-object":
                    DispatchToUIBridge(ctx, "MoveObject", () =>
                    {
                        string objectId = json["objectId"]?.Value<string>() ?? string.Empty;
                        Vector3 delta = ParseVector3(json["delta"]);
                        Bridge?.MoveObject(objectId, delta);
                    });
                    break;

                case "/rotate-object":
                    DispatchToUIBridge(ctx, "RotateObject", () =>
                    {
                        string objectId = json["objectId"]?.Value<string>() ?? string.Empty;
                        int steps = json["steps"]?.Value<int>() ?? 0;
                        Bridge?.RotateObject(objectId, steps);
                    });
                    break;

                case "/remove-object":
                    DispatchToUIBridge(ctx, "RemoveObject",
                        () => Bridge?.RemoveObject(json["objectId"]?.Value<string>() ?? string.Empty));
                    break;

                case "/set-surface":
                    DispatchToUIBridge(ctx, "SetSurfaceMaterial", () =>
                    {
                        string surfaceIdStr = json["surfaceId"]?.Value<string>() ?? "Floor";
                        SurfaceId surfaceId = Enum.TryParse(surfaceIdStr, true, out SurfaceId sid)
                            ? sid : SurfaceId.Floor;
                        MaterialParams matParams = json["params"]?.ToObject<MaterialParams>()
                            ?? new MaterialParams();
                        Bridge?.SetSurfaceMaterial(surfaceId, matParams);
                    });
                    break;

                case "/set-lighting":
                    DispatchToUIBridge(ctx, "SetLightingParameter", () =>
                    {
                        LightingParams lightParams = json["params"]?.ToObject<LightingParams>()
                            ?? new LightingParams();
                        Bridge?.SetLightingParameter(lightParams);
                    });
                    break;

                case "/save-scene":
                    DispatchToUIBridge(ctx, "SaveScene",
                        () => Bridge?.SaveScene(json["filePath"]?.Value<string>() ?? string.Empty));
                    break;

                case "/load-scene":
                    DispatchToUIBridge(ctx, "LoadScene",
                        () => Bridge?.LoadScene(json["filePath"]?.Value<string>() ?? string.Empty));
                    break;

                default:
                    Respond(ctx, 404, FailJson("Unknown", $"No endpoint: {path}"));
                    break;
            }
        }

        private void DispatchToUIBridge(HttpListenerContext ctx, string opName, Action bridgeCall)
        {
            if (Bridge == null)
            {
                Respond(ctx, 500, FailJson(opName, "UIBridge is not assigned"));
                return;
            }

            var gate = new ManualResetEventSlim(false);
            OperationResult result = null;

            Action<OperationResult> handler = null;
            handler = r =>
            {
                result = r;
                Bridge.OnOperationComplete -= handler;
                gate.Set();
            };
            Bridge.OnOperationComplete += handler;

            _mainThreadQueue.Enqueue(() =>
            {
                try { bridgeCall(); }
                catch (Exception ex)
                {
                    Bridge.OnOperationComplete -= handler;
                    result = new OperationResult { Success = false, OperationName = opName, Message = ex.Message };
                    gate.Set();
                }
            });

            if (!gate.Wait(5000))
            {
                Bridge.OnOperationComplete -= handler;
                Respond(ctx, 504, FailJson(opName, "Timed out waiting for UIBridge response"));
                return;
            }

            Respond(ctx, result?.Success == true ? 200 : 500, JsonConvert.SerializeObject(result));
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static void Respond(HttpListenerContext ctx, int statusCode, string json)
        {
            try
            {
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                ctx.Response.StatusCode = statusCode;
                ctx.Response.ContentType = "application/json";
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                ctx.Response.OutputStream.Close();
            }
            catch (Exception ex)
            {
                Debug.LogError($"[HttpListenerService] Failed to write response: {ex.Message}");
            }
        }

        private static string FailJson(string opName, string message) =>
            JsonConvert.SerializeObject(new OperationResult
            {
                Success = false,
                OperationName = opName,
                Message = message
            });

        private static string PathToOpName(string path) =>
            path.TrimStart('/').Replace("-", "");

        /// <summary>Parses a Vector3 from a JToken with x/y/z or X/Y/Z fields.</summary>
        private static Vector3 ParseVector3(JToken token)
        {
            if (token == null) return Vector3.zero;
            // Support both lowercase (x,y,z) and uppercase (X,Y,Z) field names
            float x = token["x"]?.Value<float>() ?? token["X"]?.Value<float>() ?? 0f;
            float y = token["y"]?.Value<float>() ?? token["Y"]?.Value<float>() ?? 0f;
            float z = token["z"]?.Value<float>() ?? token["Z"]?.Value<float>() ?? 0f;
            return new Vector3(x, y, z);
        }
    }
}
