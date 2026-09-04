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
  var transitioning = false;

  var qs = new URLSearchParams(location.search);

  // Carry ?listing=<slug> or ?development=<slug> into the submission so the CRM shows provenance
  var slugParam = qs.get("listing") || qs.get("development");
  if (slugParam) {
    var hidden = form.querySelector('input[name="listing_slug"]');
    if (hidden) hidden.value = slugParam;
  }

  // Prefill districts of interest when arriving from a district-specific CTA
  var districtParam = qs.get("district");
  if (districtParam) {
    var districtField = form.querySelector('#f-district');
    if (districtField) districtField.value = districtParam;
  }

  // Humanize a slug like "the-arton-by-rockwell" into "The Arton by Rockwell"
  var LOWER_WORDS = ["a", "an", "the", "of", "by", "at", "in", "on", "for", "and"];
  function humanizeSlug(slug) {
    return slug.split("-").map(function (word, i) {
      var lower = word.toLowerCase();
      if (i > 0 && LOWER_WORDS.indexOf(lower) !== -1) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(" ");
  }

  var intentParam = qs.get("intent");
  var propertyName = slugParam ? humanizeSlug(slugParam) : "";

  function setStep(n, backwards) {
    if (transitioning) return;
    var prev = form.querySelector('.funnel-step.is-active');
    var next = form.querySelector('.funnel-step[data-step="' + n + '"]');
    if (!next || next === prev) return;
    current = n;

    if (prev && !reduceMotion) {
      transitioning = true;
      prev.classList.add(backwards ? "is-leaving-back" : "is-leaving");
      window.setTimeout(function () {
        prev.classList.remove("is-active", "is-leaving", "is-leaving-back");
        next.classList.add("is-active", backwards ? "is-entering-back" : "is-entering");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            next.classList.remove("is-entering", "is-entering-back");
          });
        });
        transitioning = false;
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

  // Arriving with a known intent: pre-select the matching Step-1 choice and
  // reword the header for context, same as if the visitor had chosen it themselves.
  var eyebrow = document.getElementById("adm-eyebrow");
  var heading = document.getElementById("adm-h");
  var lede = document.getElementById("adm-lede");

  if (intentParam === "viewing") {
    var viewingRadio = form.querySelector('input[name="intent"][value="Arranging a viewing"]');
    if (viewingRadio) {
      viewingRadio.checked = true;
      if (eyebrow) eyebrow.textContent = "Scheduling a Viewing";
      if (heading) heading.innerHTML = "Arrange a<br>Viewing";
      if (lede) {
        lede.textContent = propertyName
          ? "You've asked to view " + propertyName + ". A few considered questions, enough to prepare the viewing properly, and nothing more."
          : "You've asked to arrange a viewing. A few considered questions, enough to prepare it properly, and nothing more.";
      }
      viewingRadio.dispatchEvent(new Event("change"));
    }
  } else if (intentParam === "advice") {
    var adviceRadio = form.querySelector('input[name="intent"][value="Not yet sure, seeking advice"]');
    if (adviceRadio) {
      adviceRadio.checked = true;
      if (lede && districtParam) {
        lede.textContent = "You're asking about " + districtParam + ". A few considered questions, enough to prepare a useful reply, and nothing more.";
      }
      adviceRadio.dispatchEvent(new Event("change"));
    }
  }

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
