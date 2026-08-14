/* Properties by Chel — Motion-powered micro-interactions
 * Progressive enhancement layered on top of js/site.js: a quieter, more premium
 * feel for buttons, property frames, the full-screen menu, and form feedback.
 * Requires js/vendor/motion.js. Safe to remove; nothing here is load-bearing.
 */
(function () {
  "use strict";
  if (!window.Motion) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var animate = window.Motion.animate;
  var stagger = window.Motion.stagger;

  var REST = { type: "spring", visualDuration: 0.35, bounce: 0 };
  var PRESS = { type: "spring", visualDuration: 0.18, bounce: 0 };

  /* — Buttons & CTAs: a quiet lift on hover, a tactile press on tap — */
  document.querySelectorAll(".btn, .masthead__cta").forEach(function (btn) {
    var pressed = false;
    function isInert() {
      return btn.disabled || btn.classList.contains("is-disabled") || Boolean(btn.dataset.state);
    }
    btn.addEventListener("pointerenter", function () {
      if (isInert()) return;
      animate(btn, { y: -3, scale: 1.012 }, REST);
    });
    btn.addEventListener("pointerleave", function () {
      pressed = false;
      if (isInert()) return;
      animate(btn, { y: 0, scale: 1 }, REST);
    });
    btn.addEventListener("pointerdown", function () {
      if (isInert()) return;
      pressed = true;
      animate(btn, { y: 0, scale: 0.965 }, PRESS);
    });
    ["pointerup", "pointercancel"].forEach(function (evt) {
      btn.addEventListener(evt, function () {
        if (!pressed) return;
        pressed = false;
        if (isInert()) return;
        animate(btn, btn.matches(":hover") ? { y: -3, scale: 1.012 } : { y: 0, scale: 1 }, REST);
      });
    });
  });

  /* — Property frames: the 3D pointer-tilt this used to do (rotateX/rotateY on
   * the image, inside a zero-radius overflow:hidden frame, with no CSS
   * `perspective` set anywhere) kept producing a hairline gap at one corner
   * on hover no matter which element it rotated -- an orthographic rotation
   * shrinks the rotated element along that axis by a cos(angle) factor,
   * and the fixed scale-up wasn't reliably covering that shrink at every
   * pointer position. Removed entirely: the CSS-only `:hover` scale in
   * css/site.css (a flat, non-rotated zoom -- no clip-edge geometry to get
   * wrong) is the hover effect on every .frame--hover element now. */

  /* — Full-screen menu: staggered entrance on open (site.js dispatches menu:toggle) — */
  document.addEventListener("menu:toggle", function (e) {
    if (!e.detail || !e.detail.open) return;
    var overlay = document.querySelector(".menu-overlay");
    if (!overlay) return;
    var items = overlay.querySelectorAll(".menu-overlay__list a, .menu-overlay__foot a");
    if (!items.length) return;
    animate(items, { opacity: [0, 1], y: [16, 0] }, {
      delay: stagger(0.055),
      type: "spring", visualDuration: 0.45, bounce: 0
    });
  });

  /* — Enquiry forms: a small shake on error, so failure doesn't feel silent — */
  document.querySelectorAll("form[data-enquiry] button[type='submit']").forEach(function (btn) {
    var mo = new MutationObserver(function () {
      if (btn.dataset.state === "error") {
        animate(btn, { x: [0, -8, 8, -6, 6, 0] }, { duration: 0.4, ease: "easeInOut" });
      }
    });
    mo.observe(btn, { attributes: true, attributeFilter: ["data-state"] });
  });
})();
