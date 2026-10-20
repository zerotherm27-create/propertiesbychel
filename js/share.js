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
  var ICON = function (paths) {
    return '<svg class="share__icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  };
  var ICONS = {
    share: ICON('<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 11l8-4M8 13l8 4"/>'),
    copy: ICON('<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
    linkedin: ICON('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8 10.5V16M8 7.8v.1M12 16v-5.5M12 13c0-1.6 1-2.5 2.3-2.5S16.5 11.4 16.5 13v3"/>'),
    facebook: ICON('<path d="M14.5 8H16V5h-2.4C11.3 5 10 6.4 10 8.6V10H8v3h2v6h3v-6h2.3l.4-3H13V8.8c0-.5.3-.8 1.5-.8z"/>'),
    whatsapp: ICON('<path d="M4 20l1.2-4.2A8 8 0 1 1 8.2 18.8L4 20z"/><path d="M9.2 8.8c-.3 2.5 2.6 5.5 5.6 5.7l1-1.3-1.9-1-.9.8c-1-.4-1.9-1.3-2.3-2.3l.8-.9-.9-2z"/>'),
    more: ICON('<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>')
  };
  var tile = function (tag, name, label, extra) {
    return '<' + tag + ' class="share__tile"' + (tag === 'a' ? ' target="_blank" rel="noopener noreferrer"' : ' type="button"') + ' data-share-action="' + name + '"' + (extra || '') + '>' + ICONS[name] + '<span>' + label + '</span></' + tag + '>';
  };
  var ROOT_INNER =
    '<button type="button" class="btn share__trigger" data-share-toggle aria-expanded="false" aria-controls="share-panel">' + ICONS.share + '<span>Share</span></button>' +
    '<div class="share__panel" id="share-panel" hidden>' +
      '<label class="share__label" for="share-caption">Your caption</label>' +
      '<textarea id="share-caption" class="share__caption" rows="7"></textarea>' +
      '<p class="share__note">Edit it freely. The link is added for you where the platform needs it.</p>' +
      '<div class="share__tiles">' +
        tile('button', 'copy', 'Copy') +
        tile('a', 'linkedin', 'LinkedIn') +
        tile('a', 'facebook', 'Facebook') +
        tile('a', 'whatsapp', 'WhatsApp') +
        tile('button', 'more', 'More', ' hidden') +
      '</div>' +
      '<p class="share__status" role="status" aria-live="polite" data-share-status></p>' +
    '</div>';

  function init(l, pageUrl) {
    var root = document.querySelector("[data-share-root]");
    if (!root || root.dataset.shareReady) return;
    root.dataset.shareReady = "1";
    if (!root.children.length) root.innerHTML = ROOT_INNER;
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
      copy(withUrl()).then(function (ok) { say(ok ? "Caption and link copied." : "Select the caption above and copy it.");
        var lab = act("copy").querySelector("span");
        if (ok && lab) { lab.textContent = "Copied"; setTimeout(function () { lab.textContent = "Copy"; }, 1800); }
      });
    });
    var nativeBtn = act("more");
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
      var back = Array.prototype.filter.call(document.querySelectorAll('a[href="properties"]'), function (a) { return /Back to the collection/.test(a.textContent); })[0];
      if (back && back.parentNode) {
        var holder = document.createElement("div");
        holder.className = "share share--band mt-8";
        holder.setAttribute("data-share-root", "");
        holder.hidden = true;
        back.parentNode.parentNode.insertBefore(holder, back.parentNode.nextSibling);
        init({ title: title, meta_description: meta('meta[property="og:description"]') }, url);
        return;
      }
      var sec = document.createElement("section");
      sec.className = "share-section";
      sec.innerHTML = '<div class="shell"><div class="share" data-share-root hidden></div></div>';
      footer.parentNode.insertBefore(sec, footer);
      init({ title: title, meta_description: meta('meta[property="og:description"]') }, url);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  }
})();
