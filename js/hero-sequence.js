/* — Cinematic hero walkthrough: scroll-scrubbed frame sequence on canvas — */
(function () {
  "use strict";

  var isLightTier = !window.matchMedia("(min-width: 800px)").matches;
  var FRAME_COUNT = isLightTier ? 40 : 80;
  var FRAME_BASE = isLightTier ? "images/hero-sequence-mobile/frame-" : "images/hero-sequence/frame-";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduceMotion || saveData) return;

  var cine = document.querySelector(".cine");
  var canvas = cine && cine.querySelector(".cine__sequence");
  if (!cine || !canvas) return;

  var ctx = canvas.getContext("2d");
  var frames = new Array(FRAME_COUNT);
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var canvasW = 0, canvasH = 0;
  var currentIndex = -1;

  function pad(n) {
    var s = String(n);
    return s.length < 3 ? ("00" + s).slice(-3) : s;
  }

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width * dpr);
    var h = Math.round(rect.height * dpr);
    if (w === canvasW && h === canvasH) return false;
    canvasW = canvas.width = w;
    canvasH = canvas.height = h;
    return true;
  }

  function draw(index) {
    var img = frames[index];
    if (!img || !img.complete || !img.naturalWidth) return;
    currentIndex = index;
    var scale = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh);
  }

  function loadFrame(i, onDone) {
    var img = new Image();
    img.onload = function () { onDone(true); };
    img.onerror = function () { onDone(false); };
    img.src = FRAME_BASE + pad(i + 1) + ".jpg";
    frames[i] = img;
  }

  function loadRest(i) {
    if (i >= FRAME_COUNT) return;
    var next = function () { loadRest(i + 1); };
    loadFrame(i, function () {
      if ("requestIdleCallback" in window) requestIdleCallback(next, { timeout: 300 });
      else setTimeout(next, 16);
    });
  }

  var api = { ready: false, setProgress: function () {} };
  window.heroSequence = api;

  loadFrame(0, function (ok) {
    if (!ok) return;
    resizeCanvas();
    draw(0);
    requestAnimationFrame(function () { cine.classList.add("is-sequence-ready"); });
    api.ready = true;
    api.setProgress = function (p) {
      var resized = resizeCanvas();
      var index = Math.round(clamp(p) * (FRAME_COUNT - 1));
      if (resized || index !== currentIndex) draw(index);
    };
    loadRest(1);
  });

  window.addEventListener("resize", function () {
    if (resizeCanvas() && currentIndex >= 0) draw(currentIndex);
  });
})();
