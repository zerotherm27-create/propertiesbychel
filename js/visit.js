/* Properties by Chel — first-party visit statistics.
 * Sends one page view per load (and a light heartbeat while the tab is visible) to this
 * site's own endpoints, api/site/visit and api/site/heartbeat, which keep no IP address.
 * No third party, no advertising tracker. Only runs after the visitor accepts the cookie notice;
 * honors Do Not Track / Global Privacy Control.
 * Never throws and never blocks the page.
 */
(function () {
  "use strict";
  try {
    if (/^\/dashboard/.test(location.pathname)) return;
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
    // The owner can switch off counting for their own browser from the dashboard's Analytics tab.
    try { if (localStorage.getItem("pbc_no_track") === "1") return; } catch (e) {}

    // Nothing is sent, and no cookie is set, until the visitor has accepted the cookie notice
    // (js/consent.js). Withdrawing later stops recording and clears the session cookie.
    var started = false;
    var timer = null;

    function consentGranted() {
      try {
        var c = JSON.parse(localStorage.getItem("pbc_consent") || "null");
        return !!c && c.v === "granted" && Date.now() - c.t < 365 * 24 * 3600 * 1000;
      } catch (e) { return false; }
    }

    function beat() {
      try { navigator.sendBeacon("/api/site/heartbeat"); } catch (e) {}
    }
    function startTimer() { if (started && !timer) timer = setInterval(beat, 15000); }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function begin() {
      if (started) return;
      started = true;

      // Send only what the server keeps: the page's ?slug= (which property/article) and utm_* tags.
      var kept = new URLSearchParams();
      new URLSearchParams(location.search).forEach(function (value, key) {
        if (key === "slug" || key.indexOf("utm_") === 0) kept.set(key, value);
      });

      fetch("/api/site/visit", {
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          path: location.pathname,
          query: kept.toString(),
          referrer: document.referrer,
          touch: (navigator.maxTouchPoints || 0) > 1
        })
      }).catch(function () {});

      if (document.visibilityState === "visible") startTimer();
    }

    function withdraw() {
      started = false;
      stopTimer();
      // Ask the server to expire the httpOnly session cookie (script can't touch it).
      fetch("/api/site/visit", {
        method: "POST", keepalive: true, credentials: "same-origin",
        headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ optout: true })
      }).catch(function () {});
    }

    document.addEventListener("pbc-consent", function (e) {
      if (e.detail === "granted") begin();
      else withdraw();
    });
    document.addEventListener("visibilitychange", function () {
      if (!started) return;
      if (document.visibilityState === "visible") startTimer();
      else { stopTimer(); beat(); }
    });
    window.addEventListener("pagehide", function () { if (started) beat(); });

    if (consentGranted()) begin();
  } catch (e) { /* analytics must never break a page */ }
})();
