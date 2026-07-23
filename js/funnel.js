/* Properties by Chel — multi-step inquiry funnel (presentation.html)
 * Steps advance one at a time; choosing an intent auto-advances; Back returns.
 * Final submission is handled by the shared data-enquiry handler in site.js.
 */
(function () {
  "use strict";
  var form = document.querySelector("form[data-funnel]");
  if (!form) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var steps = Array.prototype.slice.call(form.querySelectorAll(".funnel-step"));
  var progress = document.querySelector("[data-funnel-progress]");
  var current = 1;

  // Carry ?listing=<slug> into the submission so the CRM shows provenance
  var listingParam = new URLSearchParams(location.search).get("listing");
  if (listingParam) {
    var hidden = form.querySelector('input[name="listing_slug"]');
    if (hidden) hidden.value = listingParam;
  }

  function setStep(n, backwards) {
    var prev = form.querySelector('.funnel-step.is-active');
    var next = form.querySelector('.funnel-step[data-step="' + n + '"]');
    if (!next || next === prev) return;
    current = n;

    if (prev && !reduceMotion) {
      prev.classList.add(backwards ? "is-leaving-back" : "is-leaving");
      window.setTimeout(function () {
        prev.classList.remove("is-active", "is-leaving", "is-leaving-back");
        next.classList.add("is-active", backwards ? "is-entering-back" : "is-entering");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            next.classList.remove("is-entering", "is-entering-back");
          });
        });
      }, 220);
    } else {
      if (prev) prev.classList.remove("is-active");
      next.classList.add("is-active");
    }

    if (progress) {
      progress.querySelectorAll("[data-prog]").forEach(function (el) {
        var p = Number(el.dataset.prog);
        el.classList.toggle("is-current", p === n);
        el.classList.toggle("is-done", p < n);
      });
    }

    // Focus management: first focusable field of the new step
    window.setTimeout(function () {
      var focusable = next.querySelector("input:not([type=hidden]), select, textarea");
      if (focusable && n > 1) focusable.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 300);
  }

  // Step 1: choosing an intent auto-advances after a beat
  form.querySelectorAll('.funnel-choice input[type="radio"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      window.setTimeout(function () { setStep(2); }, reduceMotion ? 0 : 260);
    });
  });

  form.querySelectorAll("[data-funnel-next]").forEach(function (btn) {
    btn.addEventListener("click", function () { setStep(current + 1); });
  });
  form.querySelectorAll("[data-funnel-back]").forEach(function (btn) {
    btn.addEventListener("click", function () { setStep(current - 1, true); });
  });

  // Enter advances on steps 1–2 instead of submitting early
  form.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && current < 3 && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (current === 1) {
        if (form.querySelector('input[name="intent"]:checked')) setStep(2);
      } else {
        setStep(current + 1);
      }
    }
  });
})();
