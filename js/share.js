/* Share panel: editable caption + LinkedIn / Facebook / WhatsApp / native share / copy.
 * Facebook and LinkedIn ignore pre-filled text in share links, so for those the caption is
 * copied to the clipboard as the tab opens; WhatsApp and the native sheet carry caption and
 * link directly. The caption is built only from the page's own saved fields.
 *
 * Two ways in:
 *  - Templates (property.html, development.html) already contain [data-share-root] and
 *    js/listings.js calls PBCShare.init(fields, url) once the row has loaded.
 *  - Hand-built pages include <script src="js/share.js" data-auto></script>; the panel is
 *    injected before the footer and filled from the page's og:title / og:description / canonical. */
(function () {
  var ROOT_HTML =
    '<div class="share" data-share-root hidden>' +
      '<button type="button" class="link-line" data-share-toggle aria-expanded="false" aria-controls="share-panel">Share this <span data-share-noun>development</span> <span class="arr">\u2192</span></button>' +
      '<div class="share__panel" id="share-panel" hidden>' +
        '<label class="meta" for="share-caption">Caption</label>' +
        '<textarea id="share-caption" class="share__caption" rows="8"></textarea>' +
        '<p class="share__note">Edit it freely. The link is added for you where the platform needs it.</p>' +
        '<div class="share__actions">' +
          '<button type="button" class="btn" data-share-action="copy">Copy caption and link</button>' +
          '<a class="btn" data-share-action="linkedin" target="_blank" rel="noopener noreferrer">LinkedIn</a>' +
          '<a class="btn" data-share-action="facebook" target="_blank" rel="noopener noreferrer">Facebook</a>' +
          '<a class="btn" data-share-action="whatsapp" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
          '<button type="button" class="btn" data-share-action="native" hidden>More options</button>' +
        '</div>' +
        '<p class="share__status" role="status" aria-live="polite" data-share-status></p>' +
      '</div>' +
    '</div>';

  function init(l, pageUrl) {
    var root = document.querySelector("[data-share-root]");
    if (!root || root.dataset.shareReady) return;
    root.dataset.shareReady = "1";
    var toggle = root.querySelector("[data-share-toggle]");
    var panel = root.querySelector(".share__panel");
    var box = root.querySelector("#share-caption");
    var statusEl = root.querySelector("[data-share-status]");
    var act = function (name) { return root.querySelector('[data-share-action="' + name + '"]'); };

    var firstSentence = function (text) {
      var t = String(text || "").replace(/\s+/g, " ").trim();
      var m = t.match(/^.{40,}?[.!?](?=\s|$)/);
      return (m ? m[0] : t).slice(0, 240);
    };
    var lines = [];
    lines.push(l.title + (l.location_label ? " \u00b7 " + l.location_label : ""));
    var facts = [(l.meta_line && l.meta_line.length <= 80) ? l.meta_line : "", l.price_display].filter(Boolean).join(" \u00b7 ");
    if (facts) lines.push(facts);
    var blurb = firstSentence(l.meta_description || l.overview);
    if (blurb) lines.push("", blurb);
    lines.push("", "Enquire for a private viewing.");
    box.value = lines.join("\n");

    var say = function (msg) { statusEl.textContent = msg; };
    var withUrl = function () { return box.value.trim() + "\n\n" + pageUrl; };
    var copy = function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      return Promise.resolve(ok);
    };

    act("linkedin").href = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(pageUrl);
    act("facebook").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(pageUrl);
    var wa = act("whatsapp");
    var refreshWa = function () { wa.href = "https://wa.me/?text=" + encodeURIComponent(withUrl()); };
    refreshWa();
    box.addEventListener("input", refreshWa);

    ["linkedin", "facebook"].forEach(function (name) {
      act(name).addEventListener("click", function () {
        copy(box.value.trim()).then(function (ok) {
          say(ok ? "Caption copied. Paste it into your post; the link preview is added for you." : "Select the caption above and copy it, then paste it into your post.");
        });
      });
    });
    act("copy").addEventListener("click", function () {
      copy(withUrl()).then(function (ok) { say(ok ? "Caption and link copied." : "Select the caption above and copy it."); });
    });
    var nativeBtn = act("native");
    if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", function () {
        navigator.share({ title: l.title, text: box.value.trim(), url: pageUrl }).catch(function () {});
      });
    }
    toggle.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    root.hidden = false;
  }

  window.PBCShare = { init: init };

  var me = document.currentScript;
  if (me && me.hasAttribute("data-auto")) {
    var run = function () {
      var footer = document.querySelector("footer");
      if (!footer || document.querySelector("[data-share-root]")) return;
      var meta = function (sel) { var el = document.querySelector(sel); return el ? el.getAttribute("content") || el.getAttribute("href") || "" : ""; };
      var title = meta('meta[property="og:title"]').replace(/\s*\u00b7\s*Properties by Chel\s*$/, "") || document.title;
      var url = meta('link[rel="canonical"]') || meta('meta[property="og:url"]') || location.href.split("#")[0];
      var sec = document.createElement("section");
      sec.className = "share-section";
      sec.innerHTML = '<div class="shell">' + ROOT_HTML + '</div>';
      footer.parentNode.insertBefore(sec, footer);
      init({ title: title, meta_description: meta('meta[property="og:description"]') }, url);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  }
})();
