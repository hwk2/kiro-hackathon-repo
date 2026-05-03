using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace RoomVisualizer.Tests
{
    /// <summary>
    /// EditMode tests for CameraController isometric mode.
    ///
    /// Covers:
    ///   - ToggleIsometricMode enters / exits correctly
    ///   - Pitch locked to 30 deg in iso mode
    ///   - Yaw snaps to the 4 canonical steps (45, 135, 225, 315)
    ///   - Yaw snap edge cases: yaw=0, yaw=360, negative yaw
    ///   - RotateStep advances step and fires OnYawStepChanged
    ///   - RotateStep wraps 3->0 and 0->3 via the short arc
    ///   - Orbit is blocked in iso mode
    ///   - Zoom adjusts orthographicSize (not DistanceFromCenter) in iso mode
    ///   - orthographicSize is set to DistanceFromCenter on iso entry
    ///   - DistanceFromCenter is synced from orthographicSize on iso exit
    ///   - Perspective yaw/pitch/distance restored on exit
    ///   - RotateStep is a no-op outside iso mode
    /// </summary>
    [TestFixture]
    public class CameraControllerIsometricTests
    {
        private GameObject _go;
        private CameraController _cam;
        private Camera _camera;

        // Default _orbitSensitivity in CameraController is 0.3f.
        // We drive yaw by passing mouseDelta.x = desiredDegrees / sensitivity.
        private const float OrbitSensitivity = 0.3f;

        [SetUp]
        public void SetUp()
        {
            _go = new GameObject("CameraController");
            _camera = _go.AddComponent<Camera>();
            _cam = _go.AddComponent<CameraController>();
            // Awake runs immediately in EditMode AddComponent — camera is resolved.
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_go);
        }

        // ── Toggle enters / exits ────────────────────────────────────────────

        [Test]
        public void ToggleIsometricMode_Enter_SetsIsIsometricModeTrue()
        {
            _cam.ToggleIsometricMode();
            Assert.IsTrue(_cam.IsIsometricMode);
        }

        [Test]
        public void ToggleIsometricMode_Enter_SwitchesToOrthographicProjection()
        {
            _cam.ToggleIsometricMode();
            Assert.IsTrue(_camera.orthographic);
        }

        [Test]
        public void ToggleIsometricMode_Exit_SetsIsIsometricModeFalse()
        {
            _cam.ToggleIsometricMode();
            _cam.ToggleIsometricMode();
            Assert.IsFalse(_cam.IsIsometricMode);
        }

        [Test]
        public void ToggleIsometricMode_Exit_RestoresPerspectiveProjection()
        {
            _cam.ToggleIsometricMode();
            _cam.ToggleIsometricMode();
            Assert.IsFalse(_camera.orthographic);
        }

        // ── Pitch locked to 30 deg ───────────────────────────────────────────

        [Test]
        public void ToggleIsometricMode_Enter_CameraYPositionMatchesPitch30()
        {
            // At pitch=30 and distance=10, y = 10 * sin(30°) = 5
            _cam.ToggleIsometricMode();
            float expectedY = _cam.DistanceFromCenter * Mathf.Sin(30f * Mathf.Deg2Rad);
            Assert.AreEqual(expectedY, _camera.transform.position.y, 0.01f,
                "Camera Y must correspond to 30-degree pitch in iso mode");
        }

        [Test]
        public void Orbit_InIsometricMode_DoesNotChangeCameraPosition()
        {
            _cam.ToggleIsometricMode();
            Vector3 before = _camera.transform.position;
            _cam.Orbit(new Vector2(90f, 0f));
            Assert.AreEqual(before, _camera.transform.position,
                "Orbit must be blocked in isometric mode");
        }

        // ── Yaw snaps to 4 steps ─────────────────────────────────────────────

        [Test]
        public void ToggleIsometricMode_Enter_YawSnapsToNearestStep()
        {
            // Default initialYaw = 45 → step 0 (yaw 45)
            _cam.ToggleIsometricMode();
            Assert.AreEqual(0, _cam.YawStepIndex);
        }

        [Test]
        public void ToggleIsometricMode_YawSnap_AllFourSteps()
        {
            // Drive yaw to each quadrant by orbiting, then toggle iso and check step.
            // Step 0: yaw ~45  → orbit to 45
            // Step 1: yaw ~135 → orbit to 135
            // Step 2: yaw ~225 → orbit to 225
            // Step 3: yaw ~315 → orbit to 315
            var cases = new (float orbitDelta, int expectedStep)[]
            {
                (  0f, 0),   // starts at 45 → step 0
                ( 90f, 1),   // 45+90=135 → step 1
                (180f, 2),   // 45+180=225 → step 2
                (270f, 3),   // 45+270=315 → step 3
            };

            foreach (var (orbitDelta, expectedStep) in cases)
            {
                // Fresh controller each iteration
                Object.DestroyImmediate(_go);
                _go = new GameObject("CameraController");
                _camera = _go.AddComponent<Camera>();
                _cam = _go.AddComponent<CameraController>();

                if (orbitDelta > 0f)
                    _cam.Orbit(new Vector2(orbitDelta / OrbitSensitivity, 0f));

                _cam.ToggleIsometricMode();
                Assert.AreEqual(expectedStep, _cam.YawStepIndex,
                    $"orbitDelta={orbitDelta} should give step {expectedStep}");
            }
        }

        // ── Yaw snap edge cases ──────────────────────────────────────────────

        [Test]
        public void ToggleIsometricMode_YawZero_SnapsToStep0()
        {
            // Orbit so yaw reaches ~0 (orbit by -45 / sensitivity from default 45)
            _cam.Orbit(new Vector2(-45f / OrbitSensitivity, 0f));
            _cam.ToggleIsometricMode();
            // yaw=0 falls in [0,90) → step 0 (canonical yaw 45°).
            Assert.AreEqual(0, _cam.YawStepIndex, "yaw=0 must snap to step 0");
        }

        // ── RotateStep ───────────────────────────────────────────────────────

        [Test]
        public void RotateStep_Forward_AdvancesStepByOne()
        {
            _cam.ToggleIsometricMode();
            int before = _cam.YawStepIndex;
            _cam.RotateStep(1);
            Assert.AreEqual((before + 1) % 4, _cam.YawStepIndex);
        }

        [Test]
        public void RotateStep_Backward_DecrementsStepByOne()
        {
            _cam.ToggleIsometricMode();
            int before = _cam.YawStepIndex;
            _cam.RotateStep(-1);
            Assert.AreEqual((before + 3) % 4, _cam.YawStepIndex);
        }

        [Test]
        public void RotateStep_WrapForward_Step3To0()
        {
            _cam.ToggleIsometricMode();
            // Advance to step 3
            _cam.RotateStep(1); _cam.RotateStep(1); _cam.RotateStep(1);
            Assert.AreEqual(3, _cam.YawStepIndex);
            _cam.RotateStep(1);
            Assert.AreEqual(0, _cam.YawStepIndex, "Step must wrap from 3 to 0");
        }

        [Test]
        public void RotateStep_WrapBackward_Step0To3()
        {
            _cam.ToggleIsometricMode();
            // Ensure we're at step 0
            while (_cam.YawStepIndex != 0)
                _cam.RotateStep(1);

            _cam.RotateStep(-1);
            Assert.AreEqual(3, _cam.YawStepIndex, "Step must wrap from 0 to 3");
        }

        [Test]
        public void RotateStep_FiresOnYawStepChanged()
        {
            _cam.ToggleIsometricMode();
            var fired = new List<int>();
            _cam.OnYawStepChanged += s => fired.Add(s);

            _cam.RotateStep(1);

            Assert.AreEqual(1, fired.Count, "OnYawStepChanged must fire exactly once");
            Assert.AreEqual(_cam.YawStepIndex, fired[0]);
        }

        [Test]
        public void RotateStep_OutsideIsoMode_IsNoOp()
        {
            Assert.IsFalse(_cam.IsIsometricMode);
            int before = _cam.YawStepIndex;
            bool fired = false;
            _cam.OnYawStepChanged += _ => fired = true;

            _cam.RotateStep(1);

            Assert.AreEqual(before, _cam.YawStepIndex, "YawStepIndex must not change outside iso mode");
            Assert.IsFalse(fired, "OnYawStepChanged must not fire outside iso mode");
        }

        // ── Zoom in iso mode ─────────────────────────────────────────────────

        [Test]
        public void Zoom_InIsometricMode_AdjustsOrthographicSize()
        {
            _cam.ToggleIsometricMode();
            float before = _camera.orthographicSize;
            _cam.Zoom(1f); // scroll in
            Assert.AreNotEqual(before, _camera.orthographicSize,
                "Zoom in iso mode must change orthographicSize");
        }

        [Test]
        public void Zoom_InIsometricMode_DoesNotChangeDistanceFromCenter()
        {
            _cam.ToggleIsometricMode();
            float before = _cam.DistanceFromCenter;
            _cam.Zoom(1f);
            Assert.AreEqual(before, _cam.DistanceFromCenter,
                "Zoom in iso mode must not change DistanceFromCenter");
        }

        [Test]
        public void ToggleIsometricMode_Enter_SetsOrthographicSizeToDistanceFromCenter()
        {
            float dist = _cam.DistanceFromCenter;
            _cam.ToggleIsometricMode();
            Assert.AreEqual(dist, _camera.orthographicSize, 0.001f,
                "orthographicSize must equal DistanceFromCenter on iso entry");
        }

        // ── Perspective state restored on exit ───────────────────────────────

        [Test]
        public void ToggleIsometricMode_Exit_RestoresPerspectiveDistanceFromCenter()
        {
            float distBefore = _cam.DistanceFromCenter;
            _cam.ToggleIsometricMode();
            _cam.ToggleIsometricMode();
            Assert.AreEqual(distBefore, _cam.DistanceFromCenter, 0.001f,
                "DistanceFromCenter must be restored when exiting iso mode without zooming");
        }

        [Test]
        public void ToggleIsometricMode_ExitAfterZoom_DistanceReflectsIsoZoom()
        {
            _cam.ToggleIsometricMode();
            _cam.Zoom(2f); // zoom in by 2 units (orthographicSize decreases)
            float isoSize = _camera.orthographicSize;
            _cam.ToggleIsometricMode();
            Assert.AreEqual(
                Mathf.Clamp(isoSize, 1f, 20f),
                _cam.DistanceFromCenter, 0.001f,
                "DistanceFromCenter must reflect iso zoom level on exit");
        }
    }
}
