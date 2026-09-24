/* Properties by Chel — first-party visit statistics.
 * Sends one page view per load (and a light heartbeat while the tab is visible) to this
 * site's own endpoints, api/site/visit and api/site/heartbeat, which keep no IP address.
 * No third party, no advertising tracker. Honors Do Not Track / Global Privacy Control.
 * Never throws and never blocks the page.
 */
(function () {
  "use strict";
  try {
    if (/^\/dashboard/.test(location.pathname)) return;
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
    // The owner can switch off counting for their own browser from the dashboard's Analytics tab.
    try { if (localStorage.getItem("pbc_no_track") === "1") return; } catch (e) {}

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

    function beat() {
      try { navigator.sendBeacon("/api/site/heartbeat"); } catch (e) {}
    }
    var timer = null;
    function start() { if (!timer) timer = setInterval(beat, 15000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") start();
      else { stop(); beat(); }
    });
    window.addEventListener("pagehide", beat);
  } catch (e) { /* analytics must never break a page */ }
})();
