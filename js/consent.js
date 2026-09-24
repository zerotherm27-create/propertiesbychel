/* Properties by Chel — cookie notice.
 * Shows a small notice until the visitor accepts or declines the one cookie used for
 * first-party visit statistics (see js/visit.js). Nothing is recorded, and no cookie is set,
 * until "Accept". The choice is kept in localStorage (pbc_consent) for 12 months, can be
 * changed at any time from the Cookies section of the legal page or the footer link, and
 * withdrawing it stops recording and clears the session cookie.
 * Browsers sending Do Not Track / Global Privacy Control never see a choice: nothing is recorded.
 */
(function () {
  "use strict";
  var KEY = "pbc_consent";
  var TTL = 365 * 24 * 3600 * 1000;
  var bar = null;

  function signal() {
    return navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  }
  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && (c.v === "granted" || c.v === "denied") && Date.now() - c.t < TTL) return c.v;
    } catch (e) { /* storage blocked or corrupt */ }
    return null;
  }
  function write(value) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: value, t: Date.now() })); } catch (e) { /* ignore */ }
  }
  function announce(value) {
    document.dispatchEvent(new CustomEvent("pbc-consent", { detail: value }));
  }

  function injectStyles() {
    if (document.getElementById("pbc-cookie-css")) return;
    var css =
      ".pbc-cookie{position:fixed;z-index:1000;left:var(--margin,1rem);bottom:max(1rem,env(safe-area-inset-bottom));max-width:34rem;" +
      "background:var(--paper,#F9F6F2);color:var(--ink,#152B5A);border:1px solid var(--line-strong,rgba(21,43,90,.32));" +
      "box-shadow:0 10px 30px rgba(11,29,58,.14);padding:1.25rem 1.5rem;font:400 .8125rem/1.6 var(--font-body,'Work Sans','Helvetica Neue',sans-serif)}" +
      ".pbc-cookie[hidden]{display:none}" +
      ".pbc-cookie__label{display:block;margin:0 0 .5rem;font-size:.6875rem;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--brass-deep,#896200)}" +
      ".pbc-cookie p{margin:0 0 1rem;color:var(--ink-soft,#505357)}" +
      ".pbc-cookie a{color:var(--ink,#152B5A);text-decoration:underline;text-underline-offset:2px}" +
      ".pbc-cookie__actions{display:flex;gap:.75rem;flex-wrap:wrap}" +
      ".pbc-cookie button{font:600 .6875rem/1 var(--font-body,'Work Sans','Helvetica Neue',sans-serif);letter-spacing:.14em;text-transform:uppercase;" +
      "padding:.85rem 1.5rem;border:1px solid var(--ink,#152B5A);border-radius:0;cursor:pointer;background:transparent;color:var(--ink,#152B5A);" +
      "transition:background .2s,color .2s}" +
      ".pbc-cookie button:hover{background:var(--ink,#152B5A);color:var(--paper,#F9F6F2)}" +
      ".pbc-cookie button:focus-visible,.pbc-cookie a:focus-visible{outline:2px solid var(--focus,#3f6db5);outline-offset:3px}" +
      "@media (max-width:640px){.pbc-cookie{left:.75rem;right:.75rem;max-width:none}.pbc-cookie__actions button{flex:1}}" +
      "@media (prefers-reduced-motion:reduce){.pbc-cookie button{transition:none}}";
    var style = document.createElement("style");
    style.id = "pbc-cookie-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function button(label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function hide() { if (bar) bar.hidden = true; }

  function choose(value) {
    write(value);
    hide();
    announce(value);
  }

  function build(focus) {
    injectStyles();
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "pbc-cookie";
      bar.setAttribute("role", "region");
      bar.setAttribute("aria-label", "Cookie notice");
      document.body.appendChild(bar);
    }
    bar.replaceChildren();

    var label = document.createElement("span");
    label.className = "pbc-cookie__label";
    label.textContent = "Cookies";
    var text = document.createElement("p");
    var actions = document.createElement("div");
    actions.className = "pbc-cookie__actions";

    if (signal()) {
      text.textContent = "Your browser is sending a Do Not Track or Global Privacy Control signal, so this site records nothing about your visit.";
      actions.appendChild(button("OK", hide));
    } else {
      text.appendChild(document.createTextNode(
        "This site uses one cookie to count visits — which pages are read, and roughly where from — so we can improve it. " +
        "No advertising, no third parties. "));
      var link = document.createElement("a");
      link.href = "legal#cookies";
      link.textContent = "Cookie policy";
      text.appendChild(link);
      text.appendChild(document.createTextNode("."));
      actions.appendChild(button("Decline", function () { choose("denied"); }));
      actions.appendChild(button("Accept", function () { choose("granted"); }));
    }
    bar.append(label, text, actions);
    bar.hidden = false;
    if (focus) actions.querySelector("button").focus();
  }

  // "Cookies" in the footer, next to Privacy, so the choice can be changed from any page.
  function addFooterLink() {
    var privacy = document.querySelector('footer a[href="legal#privacy"]');
    if (!privacy || document.querySelector("[data-cookie-footer]")) return;
    var link = document.createElement("a");
    link.href = "legal#cookies";
    link.textContent = "Cookies";
    link.setAttribute("data-cookie-footer", "");
    privacy.after(document.createTextNode("  ·  "), link);
  }

  function init() {
    addFooterLink();
    if (!signal() && read() === null) build(false);
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-cookie-settings]")) build(true);
  });

  window.pbcConsent = { get: read, open: function () { build(true); } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
