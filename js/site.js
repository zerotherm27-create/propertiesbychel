/* Properties by Chel — shared behaviour
 * masthead state · overlay menu · reveal observer · cinematic hero scrub · gallery filters · form states
 */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* — Masthead scroll state — */
  var masthead = document.querySelector(".masthead");
  function onScrollHead() {
    if (!masthead) return;
    masthead.classList.toggle("is-scrolled", window.scrollY > 60);
  }
  window.addEventListener("scroll", onScrollHead, { passive: true });
  onScrollHead();

  /* — Overlay menu — */
  var toggle = document.querySelector(".masthead__toggle");
  var overlay = document.querySelector(".menu-overlay");
  var closeBtn = overlay && overlay.querySelector("[data-menu-close]");
  function setMenu(open) {
    if (!overlay) return;
    overlay.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    if (open) (closeBtn || overlay).focus();
    document.dispatchEvent(new CustomEvent("menu:toggle", { detail: { open: open } }));
  }
  if (toggle) toggle.addEventListener("click", function () { setMenu(true); });
  if (closeBtn) closeBtn.addEventListener("click", function () { setMenu(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setMenu(false);
  });

  /* — Staggered reveal groups — */
  if (!reduceMotion) {
    document.querySelectorAll("[data-reveal-stagger]").forEach(function (group) {
      group.querySelectorAll("[data-reveal]").forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i, 5) * 40 + "ms";
      });
    });
  }

  /* — Reveal on scroll — */
  var io = (!reduceMotion && "IntersectionObserver" in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" })
    : null;
  function observeReveals() {
    document.querySelectorAll("[data-reveal]:not(.is-in)").forEach(function (el) {
      if (io) io.observe(el); else el.classList.add("is-in");
    });
  }
  observeReveals();
  // Dynamically-injected content (listings, articles) may add new [data-reveal]
  // elements after this initial scan — re-observe them so they aren't stuck at opacity:0.
  document.addEventListener("listings:rendered", observeReveals);

  /* — Partners marquee pause toggle (touch users have no hover to pause with) — */
  var marqueeToggle = document.getElementById("partners-toggle");
  var marquee = document.getElementById("partners-marquee");
  if (marqueeToggle && marquee) {
    marqueeToggle.addEventListener("click", function () {
      var paused = marquee.classList.toggle("is-paused");
      marqueeToggle.textContent = paused ? "Play" : "Pause";
      marqueeToggle.setAttribute("aria-pressed", String(paused));
    });
  }

  /* — Cinematic hero scrub (home) — */
  var cine = document.querySelector(".cine");
  if (cine && !reduceMotion) {
    var lines = cine.querySelectorAll(".cine__line");
    var eyebrow = cine.querySelector(".cine__title .eyebrow");
    var close = cine.querySelector(".cine__close");
    var cue = cine.querySelector(".cine__scrollcue");
    var ticking = false;
    var scrubbing = false;

    var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
    var seg = function (p, a, b) { return clamp((p - a) / (b - a)); };
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

    // Let the browser paint the resting (opacity:0) entrance state once before
    // triggering the CSS transition, so the plate/headline actually fade+drift in.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { cine.classList.add("is-ready"); });
    });

    function frame() {
      ticking = false;
      var rect = cine.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var p = clamp(-rect.top / total);

      var exit = seg(p, 0.2, 0.42);
      lines.forEach(function (ln, i) {
        var drift = ease(exit) * (60 + i * 34);
        ln.style.transform = "translateY(" + (-drift) + "px)";
        ln.style.opacity = String(1 - exit);
      });
      if (eyebrow) eyebrow.style.opacity = String(1 - seg(p, 0.1, 0.3));
      if (cue) cue.style.opacity = String(1 - seg(p, 0.02, 0.15));

      var arrive = ease(seg(p, 0.6, 0.85));
      close.style.opacity = String(arrive);
      close.style.transform = "translateY(" + (24 * (1 - arrive)) + "px)";
      close.classList.toggle("is-live", arrive > 0.6);

      if (window.heroSequence && window.heroSequence.ready) window.heroSequence.setProgress(p);
    }
    function requestFrame() {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }
    function onScroll() {
      if (!scrubbing && window.scrollY > 0) { scrubbing = true; cine.classList.add("is-scrubbing"); }
      requestFrame();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestFrame);
    frame();
  }

  /* — Gallery filters (collection page) — */
  var filterbars = document.querySelectorAll("[data-filter-group]");
  if (filterbars.length) {
    var state = { status: "all", collection: "all" };
    function applyFilters() {
      // queried live so dynamically rendered listings keep filtering
      document.querySelectorAll("[data-status]").forEach(function (c) {
        var okStatus = state.status === "all" || c.dataset.status === state.status;
        var okColl = state.collection === "all" || (c.dataset.collection || "").split(" ").indexOf(state.collection) !== -1;
        c.style.display = okStatus && okColl ? "" : "none";
      });
    }
    filterbars.forEach(function (bar) {
      var group = bar.dataset.filterGroup;
      bar.querySelectorAll(".chip[data-value]").forEach(function (chip) {
        chip.addEventListener("click", function () {
          bar.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
          chip.setAttribute("aria-pressed", "true");
          state[group] = chip.dataset.value;
          applyFilters();
        });
      });
    });
    document.addEventListener("listings:rendered", applyFilters);
  }

  /* — Enquiry forms → Supabase leads (falls back to local success while unconfigured) — */
  var SB = window.SUPABASE_CONFIG || {};

  function leadFromForm(form) {
    var fd = new FormData(form);
    return {
      name: fd.get("name") || null,
      email: fd.get("email") || null,
      phone: fd.get("phone") || null,
      intent: fd.get("intent") || null,
      districts: fd.get("districts") || null,
      budget_range: fd.get("range") || null,
      timeframe: fd.get("timeframe") || null,
      notes: fd.get("notes") || fd.get("message") || null,
      listing_slug: fd.get("listing_slug") || null,
      source_page: location.pathname.split("/").pop() || "index.html"
    };
  }

  function submitLead(payload) {
    if (!SB.url || !SB.anonKey) {
      // Backend not configured yet — simulate success so the site remains usable.
      return new Promise(function (res) { window.setTimeout(res, 700); });
    }
    return fetch(SB.url + "/rest/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB.anonKey,
        "Authorization": "Bearer " + SB.anonKey,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error("lead submit failed: " + r.status);
    });
  }

  function fieldWrap(input) { return input.closest(".field"); }
  function clearFieldError(input) {
    var wrap = fieldWrap(input);
    if (!wrap) return;
    wrap.classList.remove("field--error");
    var msg = wrap.querySelector(".field__error");
    if (msg) msg.remove();
  }
  function setFieldError(input) {
    var wrap = fieldWrap(input);
    if (!wrap) return;
    wrap.classList.add("field--error");
    var msg = wrap.querySelector(".field__error");
    if (!msg) {
      msg = document.createElement("p");
      msg.className = "field__error";
      wrap.appendChild(msg);
    }
    msg.textContent = input.validationMessage;
  }
  function validateForm(form) {
    var firstInvalid = null;
    form.querySelectorAll(".field input, .field select, .field textarea").forEach(function (input) {
      if (input.checkValidity()) { clearFieldError(input); return; }
      setFieldError(input);
      if (!firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  }

  document.querySelectorAll("form[data-enquiry]").forEach(function (form) {
    form.querySelectorAll(".field input, .field select, .field textarea").forEach(function (input) {
      input.addEventListener("input", function () { if (input.checkValidity()) clearFieldError(input); });
      input.addEventListener("blur", function () { if (!input.checkValidity()) setFieldError(input); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var note = form.querySelector("[data-form-note]");
      var firstInvalid = validateForm(form);
      if (firstInvalid) { firstInvalid.focus(); return; }
      btn.dataset.state = "loading";
      submitLead(leadFromForm(form)).then(function () {
        btn.dataset.state = "success";
        btn.textContent = "Received, thank you";
        if (note) note.textContent = "Your request has been noted. Expect a personal reply within one business day.";
        form.querySelectorAll("input, select, textarea, button").forEach(function (f) { f.disabled = true; });
      }).catch(function () {
        btn.dataset.state = "error";
        btn.textContent = "Try again";
        if (note) note.textContent = "Something went wrong sending your request. Please retry, or write directly to concierge@propertiesbychel.com.";
        window.setTimeout(function () { delete btn.dataset.state; }, 2500);
      });
    });
  });
})();
