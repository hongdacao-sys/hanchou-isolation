/* 翰畴隔震 — interactive 360° product viewer (CHC / CHD / JZ / JTD / JTE / JW).
   Classic (non-module) script. Expects window.THREE from assets/vendor/three.min.js.
   GLB files cannot be fetched from file:// in Chrome; a short note is shown instead. */
(function () {
  "use strict";

  var BG_DARK = 0x0b0b0c;
  var BG_LIGHT = 0xe8e8e2;
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isLightScheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  function canvasBg() {
    return isLightScheme() ? BG_LIGHT : BG_DARK;
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function showNote(root, text, detail) {
    var box = $(".model-fallback", root) || root;
    box.hidden = false;
    var p = box.querySelector("[data-fallback-main]") || box.querySelector("p");
    if (p) p.textContent = text;
    var d = box.querySelector("[data-fallback-detail]");
    if (d && detail) d.textContent = detail;
    var loading = $(".model-loading", root);
    if (loading) loading.hidden = true;
  }

  function hideLoading(root) {
    var loading = $(".model-loading", root);
    if (loading) loading.hidden = true;
  }

  function isFileProtocol() {
    return location.protocol === "file:";
  }

  function localServerHint() {
    return "在解压后的预览目录执行 python3 -m http.server 8765，或运行 preview.sh，然后访问 http://127.0.0.1:8765/";
  }

  function makeContactShadow(radius) {
    var size = 256;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    var g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48);
    g.addColorStop(0, "rgba(0,0,0,0.7)");
    g.addColorStop(0.4, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    var mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 1.85, radius * 1.85), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.00015;
    mesh.renderOrder = -1;
    mesh.name = "contact-shadow";
    return mesh;
  }

  function makeStudioEnv(renderer) {
    var scn = new THREE.Scene();
    scn.background = new THREE.Color(0x3a3c40);

    function card(w, h, color, pos, rot) {
      var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide })
      );
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      scn.add(mesh);
    }

    // Neutral studio: mid-grey box + a few white light cards. Avoid warm/yellow fills.
    card(12, 12, 0x4a4c50, [0, 6, 0], [-Math.PI / 2, 0, 0]); // ceiling
    card(12, 12, 0x2a2b2e, [0, -2.5, 0], [Math.PI / 2, 0, 0]); // floor
    card(12, 10, 0x5c5e62, [0, 2, -6], [0, 0, 0]); // back
    card(12, 10, 0x7a7c80, [0, 2, 6], [0, Math.PI, 0]);
    card(12, 10, 0x6a6c70, [-6, 2, 0], [0, Math.PI / 2, 0]);
    card(12, 10, 0x6a6c70, [6, 2, 0], [0, -Math.PI / 2, 0]);
    card(6.0, 2.8, 0xffffff, [-2.0, 5.4, 3.6], [-1.05, 0.25, 0]); // key
    card(3.2, 2.0, 0xf4f6fa, [4.0, 3.0, 2.2], [-0.5, -0.7, 0]); // fill
    card(2.4, 6.0, 0xffffff, [-4.8, 2.6, -3.0], [0.1, 0.85, 0]); // rim

    var pmrem = new THREE.PMREMGenerator(renderer);
    var tex = pmrem.fromScene(scn, 0.04).texture;
    pmrem.dispose();
    return tex;
  }

  function frameCamera(model, camera, controls, series) {
    var box = new THREE.Box3().setFromObject(model);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var radius = Math.max(size.length() * 0.5, 0.05);
    // Look at a point slightly above the geometric mid-height so bases sit naturally.
    var target = new THREE.Vector3(center.x, Math.max(center.y * 0.92, size.y * 0.42), center.z);
    var FRAMING = {
      JZ:  { yaw: 26, elev: 14, dist: 2.9 },
      CHD: { yaw: 22, elev: 16, dist: 2.85 },
      JTD: { yaw: 22, elev: 16, dist: 2.75 },
      JTE: { yaw: 22, elev: 16, dist: 2.75 },
      JW:  { yaw: 28, elev: 18, dist: 2.7 },
      JHD: { yaw: 28, elev: 18, dist: 2.7 }
    };
    var frame = FRAMING[series] || { yaw: 24, elev: 18, dist: 2.65 };
    var yaw = frame.yaw;
    var elev = frame.elev;
    var dist = radius * frame.dist;
    // Portrait / narrow viewports have a tighter horizontal FOV; back the camera up so the full product fits.
    var aspect = camera.aspect || 1;
    if (aspect < 1.05) {
      var vfov = (camera.fov * Math.PI) / 180;
      var hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      var fit = (radius * 1.22) / Math.sin(Math.min(vfov, hfov) / 2);
      dist = Math.max(dist, fit);
    }
    var theta = THREE.MathUtils.degToRad(yaw);
    var phi = THREE.MathUtils.degToRad(90 - elev);
    var pos = new THREE.Vector3().setFromSphericalCoords(dist, phi, theta).add(target);
    camera.position.copy(pos);
    camera.near = Math.max(dist / 120, 0.01);
    camera.far = dist * 20;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = radius * 0.85;
    controls.maxDistance = radius * 5.5;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI - 0.18;
    controls.update();
    return { target: target.clone(), position: pos.clone(), radius: radius };
  }

  function initViewer(wrap) {
    if (wrap.__hcViewer) return wrap.__hcViewer;
    var THREERef = window.THREE;
    if (!THREERef || !THREERef.WebGLRenderer || !THREERef.GLTFLoader || !THREERef.OrbitControls) {
      showNote(wrap, "三维查看器脚本未正确载入。", "请确认 assets/vendor/three.min.js 与本页在同一预览包内。");
      return null;
    }

    var canvasHost = $(".model-canvas", wrap) || wrap;
    var series = (wrap.getAttribute("data-series") || "").toUpperCase();
    var url = wrap.getAttribute("data-model");
    if (!url) {
      showNote(wrap, "未指定三维模型文件。");
      return null;
    }

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
    } catch (err) {
      showNote(wrap, "当前浏览器无法创建 WebGL 上下文。", String(err && err.message ? err.message : err));
      return null;
    }

    renderer.setClearColor(canvasBg(), 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.domElement.className = "model-canvas-el";
    renderer.domElement.setAttribute("aria-hidden", "true");
    canvasHost.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(canvasBg());
    scene.environment = makeStudioEnv(renderer);

    var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.zoomSpeed = 0.85;
    controls.rotateSpeed = 0.72;
    controls.autoRotate = !REDUCE;
    controls.autoRotateSpeed = 1.15;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    // Key / fill / rim — keep hues neutral so anodized aluminum stays silver.
    var hemi = new THREE.HemisphereLight(0xe8eef4, 0x161618, 0.42);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xfff7f0, 2.05);
    key.position.set(2.8, 4.0, 2.4);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xdde4ee, 0.32);
    fill.position.set(-3.0, 1.2, 1.4);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xf3f6fb, 1.15);
    rim.position.set(-0.8, 2.8, -3.6);
    scene.add(rim);
    var bounce = new THREE.DirectionalLight(0xc8ccd0, 0.18);
    bounce.position.set(0.2, -2.2, 0.4);
    scene.add(bounce);

    var contactShadow = null;

    function applyScheme() {
      var light = isLightScheme();
      var bg = light ? BG_LIGHT : BG_DARK;
      renderer.setClearColor(bg, 1);
      scene.background.setHex(bg);
      hemi.groundColor.setHex(light ? 0xc8c8c4 : 0x161618);
      if (contactShadow && contactShadow.material) {
        contactShadow.material.opacity = light ? 0.5 : 0.85;
      }
      renderer.toneMappingExposure = light ? 1.34 : 1.28;
    }

    applyScheme();

    var schemeMql = window.matchMedia("(prefers-color-scheme: light)");
    function onSchemeChange() {
      applyScheme();
    }
    if (schemeMql.addEventListener) schemeMql.addEventListener("change", onSchemeChange);
    else if (schemeMql.addListener) schemeMql.addListener(onSchemeChange);

    var state = {
      ready: false,
      framing: null,
      autoWanted: !REDUCE,
      resumeTimer: 0,
      raf: 0,
      disposed: false,
      model: null,
      userMoved: false,
    };

    function resize() {
      var w = wrap.clientWidth || canvasHost.clientWidth || 640;
      var h = wrap.clientHeight || canvasHost.clientHeight || 480;
      if (w < 2 || h < 2) return;
      var aspectChanged = Math.abs((camera.aspect || 1) - w / h) > 0.04;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Re-frame only when the aspect actually changes (e.g. first layout), not on every mobile URL-bar resize.
      if (state.ready && state.model && aspectChanged && !state.userMoved) {
        state.framing = frameCamera(state.model, camera, controls, series);
      }
    }

    var ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    function tick() {
      if (state.disposed) return;
      state.raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    }

    function pauseAuto() {
      if (!state.autoWanted) return;
      controls.autoRotate = false;
      if (state.resumeTimer) clearTimeout(state.resumeTimer);
      state.resumeTimer = setTimeout(function () {
        if (state.autoWanted && !REDUCE) controls.autoRotate = true;
      }, 2200);
    }

    renderer.domElement.addEventListener("pointerdown", function () { state.userMoved = true; pauseAuto(); });
    renderer.domElement.addEventListener("wheel", pauseAuto, { passive: true });
    renderer.domElement.addEventListener("touchstart", pauseAuto, { passive: true });

    // One-finger vertical swipe scrolls the page; horizontal drag orbits; two-finger pinch-zooms.
    var touchStart = null;
    var touchLast = null;
    var touchMode = null;
    var canvasEl = renderer.domElement;
    canvasEl.style.touchAction = "pan-y";
    canvasEl.addEventListener("touchstart", function (ev) {
      if (ev.touches.length === 1) {
        touchStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        touchLast = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        touchMode = null;
        controls.enabled = false;
      } else {
        touchStart = null;
        touchLast = null;
        touchMode = "orbit";
        controls.enabled = true;
        state.userMoved = true;
      }
    }, { passive: true, capture: true });
    canvasEl.addEventListener("touchmove", function (ev) {
      if (!touchStart || ev.touches.length !== 1) return;
      var x = ev.touches[0].clientX;
      var y = ev.touches[0].clientY;
      var dx = x - touchStart.x;
      var dy = y - touchStart.y;
      if (!touchMode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        touchMode = Math.abs(dy) > Math.abs(dx) * 1.15 ? "scroll" : "orbit";
        if (touchMode === "orbit") {
          state.userMoved = true;
          pauseAuto();
        }
      }
      if (touchMode === "orbit") {
        var ox = x - touchLast.x;
        var oy = y - touchLast.y;
        var offset = camera.position.clone().sub(controls.target);
        var sph = new THREE.Spherical().setFromVector3(offset);
        sph.theta -= ox * 0.005;
        sph.phi -= oy * 0.005;
        sph.phi = THREE.MathUtils.clamp(sph.phi, controls.minPolarAngle, controls.maxPolarAngle);
        sph.makeSafe();
        camera.position.setFromSpherical(sph).add(controls.target);
        controls.update();
      }
      touchLast = { x: x, y: y };
    }, { passive: true, capture: true });
    canvasEl.addEventListener("touchend", function () {
      touchStart = null;
      touchLast = null;
      touchMode = null;
      controls.enabled = true;
    }, { passive: true });
    canvasEl.addEventListener("touchcancel", function () {
      touchStart = null;
      touchLast = null;
      touchMode = null;
      controls.enabled = true;
    }, { passive: true });

    function resetCamera() {
      if (!state.framing) return;
      camera.position.copy(state.framing.position);
      controls.target.copy(state.framing.target);
      controls.update();
    }

    function setAutoRotate(on) {
      state.autoWanted = !!on && !REDUCE;
      controls.autoRotate = state.autoWanted;
      var btn = document.querySelector('[data-model-autorotate][data-for="' + wrap.id + '"]') ||
        wrap.parentElement.querySelector("[data-model-autorotate]");
      if (btn) {
        btn.setAttribute("aria-pressed", state.autoWanted ? "true" : "false");
        btn.textContent = state.autoWanted ? "停止旋转" : "自动旋转";
      }
    }

    var loader = new THREE.GLTFLoader();
    loader.load(
      url,
      function (gltf) {
        var model = gltf.scene || gltf.scenes[0];
        model.traverse(function (obj) {
          if (!obj.isMesh || !obj.material) return;
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (m) {
            var n = (m.name || "").toLowerCase();
            if (n.indexOf("aluminum") >= 0 || n.indexOf("steel") >= 0) m.envMapIntensity = 1.2;
            else if (n.indexOf("spring") >= 0) m.envMapIntensity = 0.85;
            else m.envMapIntensity = 0.55;
            m.needsUpdate = true;
          });
          obj.castShadow = false;
          obj.receiveShadow = false;
        });
        scene.add(model);
        state.model = model;
        resize();
        state.framing = frameCamera(model, camera, controls, series);
        contactShadow = makeContactShadow(state.framing.radius);
        scene.add(contactShadow);
        applyScheme();
        hideLoading(wrap);
        var fallback = $(".model-fallback", wrap);
        if (fallback) fallback.hidden = true;
        state.ready = true;
        setAutoRotate(state.autoWanted);
      },
      undefined,
      function (err) {
        var file = isFileProtocol();
        showNote(
          wrap,
          file ? "三维模型需通过本地服务器打开。" : "三维模型未能载入。",
          file ? localServerHint() : String((err && err.message) || err || "")
        );
      }
    );

    wrap.addEventListener("keydown", function (ev) {
      if (!state.ready) return;
      var step = 0.08;
      var zoom = 1.06;
      var handled = true;
      var offset, sph;
      function spherical() {
        offset = camera.position.clone().sub(controls.target);
        sph = new THREE.Spherical().setFromVector3(offset);
      }
      function applySpherical() {
        sph.phi = THREE.MathUtils.clamp(sph.phi, controls.minPolarAngle, controls.maxPolarAngle);
        sph.radius = THREE.MathUtils.clamp(sph.radius, controls.minDistance, controls.maxDistance);
        sph.makeSafe();
        camera.position.setFromSpherical(sph).add(controls.target);
      }
      if (ev.key === "ArrowLeft") { spherical(); sph.theta += step; applySpherical(); }
      else if (ev.key === "ArrowRight") { spherical(); sph.theta -= step; applySpherical(); }
      else if (ev.key === "ArrowUp") { spherical(); sph.phi -= step; applySpherical(); }
      else if (ev.key === "ArrowDown") { spherical(); sph.phi += step; applySpherical(); }
      else if (ev.key === "+" || ev.key === "=") { spherical(); sph.radius /= zoom; applySpherical(); }
      else if (ev.key === "-" || ev.key === "_") { spherical(); sph.radius *= zoom; applySpherical(); }
      else if (ev.key === "0" || ev.key === "Home") resetCamera();
      else handled = false;
      if (handled) {
        ev.preventDefault();
        pauseAuto();
        controls.update();
      }
    });

    tick();

    var api = {
      reset: resetCamera,
      setAutoRotate: setAutoRotate,
      orbitBy: function (dTheta, dPhi) {
        var offset = camera.position.clone().sub(controls.target);
        var sph = new THREE.Spherical().setFromVector3(offset);
        if (dTheta) sph.theta += dTheta;
        if (dPhi) sph.phi += dPhi;
        sph.phi = THREE.MathUtils.clamp(sph.phi, controls.minPolarAngle, controls.maxPolarAngle);
        sph.makeSafe();
        camera.position.setFromSpherical(sph).add(controls.target);
        controls.update();
      },
      get autoWanted() {
        return state.autoWanted;
      },
      dispose: function () {
        state.disposed = true;
        cancelAnimationFrame(state.raf);
        ro.disconnect();
        if (schemeMql.removeEventListener) schemeMql.removeEventListener("change", onSchemeChange);
        else if (schemeMql.removeListener) schemeMql.removeListener(onSchemeChange);
        controls.dispose();
        renderer.dispose();
      },
    };
    wrap.__hcViewer = api;
    return api;
  }

  function bindToolbar(section, wrap) {
    var resetBtn = section.querySelector("[data-model-reset]");
    var autoBtn = section.querySelector("[data-model-autorotate]");
    if (autoBtn) {
      autoBtn.setAttribute("aria-pressed", REDUCE ? "false" : "true");
      autoBtn.textContent = REDUCE ? "自动旋转" : "停止旋转";
      if (REDUCE) autoBtn.disabled = true;
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (wrap.__hcViewer) wrap.__hcViewer.reset();
      });
    }
    if (autoBtn && !REDUCE) {
      autoBtn.addEventListener("click", function () {
        var api = wrap.__hcViewer;
        if (!api) return;
        api.setAutoRotate(!api.autoWanted);
      });
    }
  }

  function setup(section) {
    var wrap = section.querySelector(".model-viewport") || section.querySelector("[data-model]");
    if (!wrap) return;
    bindToolbar(section, wrap);

    if (isFileProtocol()) {
      showNote(wrap, "三维模型需通过本地服务器打开。", localServerHint());
      // Still allow a manual retry if a browser can load it, but do not start WebGL yet.
      return;
    }

    var once = false;
    function start() {
      if (once) return;
      once = true;
      initViewer(wrap);
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              start();
              io.disconnect();
            }
          });
        },
        { rootMargin: "240px 0px", threshold: 0.01 }
      );
      io.observe(section);
    } else {
      start();
    }

    if (location.hash === "#model") start();
  }

  function boot() {
    var sections = document.querySelectorAll("section#model, .model-section");
    sections.forEach(setup);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
