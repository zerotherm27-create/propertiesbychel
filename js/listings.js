/* Properties by Chel — public data hydration (plain fetch, no SDK)
 * While js/supabase-config.js is unconfigured this file does nothing and the
 * built-in sample content stands. Once configured:
 *   · properties.html gallery renders from the `listings` table
 *   · property.html?slug=… fills in that listing
 *   · index.html hero photo + featured spotlight, about.html portrait hydrate
 */
(function () {
  "use strict";
  var SB = window.SUPABASE_CONFIG || {};
  if (!SB.url || !SB.anonKey) return;

  function api(path) {
    return fetch(SB.url + "/rest/v1/" + path, {
      headers: { "apikey": SB.anonKey, "Authorization": "Bearer " + SB.anonKey }
    }).then(function (r) {
      if (!r.ok) throw new Error("supabase read failed: " + r.status);
      return r.json();
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* — Site photos (hero background, portrait) — */
  var settingImgs = document.querySelectorAll("[data-setting-img]");
  if (settingImgs.length) {
    api("site_settings?select=key,value").then(function (rows) {
      var map = {};
      rows.forEach(function (r) { map[r.key] = r.value || {}; });
      settingImgs.forEach(function (img) {
        var v = map[img.dataset.settingImg];
        if (v && v.url) img.src = v.url;
      });
    }).catch(function () { /* fallback content stands */ });
  }

  /* — Collection gallery — */
  var gallery = document.querySelector(".gallery[data-listings]");
  if (gallery) {
    api("listings?select=*&published=eq.true&order=sort_order.asc").then(function (rows) {
      if (!rows.length) return;
      gallery.innerHTML = rows.map(function (l, i) {
        var imgAttrs = i === 0 ? 'fetchpriority="high"' : 'loading="lazy"';
        return (
          '<a class="plisting is-in" href="property.html?slug=' + encodeURIComponent(l.slug) + '"' +
          ' data-status="' + esc(l.status) + '" data-collection="' + esc((l.collections || []).join(" ")) + '">' +
            '<div class="frame frame--hover" style="aspect-ratio:' + esc(l.aspect || "4/3") + ';position:relative">' +
              (l.tag ? '<span class="plisting__tag">' + esc(l.tag) + "</span>" : "") +
              '<img src="' + esc(l.hero_image_url) + '" alt="' + esc(l.image_alt || l.title) + '" ' + imgAttrs + '>' +
            "</div>" +
            '<div class="plisting__head"><span class="plisting__title">' + esc(l.title) + "</span>" +
              '<span class="plisting__rule"></span><span class="plisting__price">' + esc(l.price_display || "Price on application") + "</span></div>" +
            '<p class="plisting__meta">' + esc(l.meta_line || l.location_label || "") + "</p>" +
          "</a>"
        );
      }).join("");
      document.dispatchEvent(new CustomEvent("listings:rendered"));
    }).catch(function () { /* static sample gallery stands */ });
  }

  /* — Property detail — */
  var detail = document.querySelector("[data-listing-detail]");
  var slug = new URLSearchParams(location.search).get("slug");
  if (detail && slug) {
    api("listings?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1").then(function (rows) {
      var l = rows[0];
      if (!l) return;
      document.title = l.title + " — Private Presentation · Properties by Chel";

      var bind = function (name, text) {
        document.querySelectorAll('[data-l="' + name + '"]').forEach(function (el) { el.textContent = text; });
      };
      bind("title", l.title);
      bind("location", l.location_label || "");
      bind("meta", l.meta_line || "");
      bind("price", l.price_display ? "Guide " + l.price_display : "Price on application");
      bind("status", l.status === "lease" ? "For Lease" : l.status === "investment" ? "Investment" : "For Sale");

      var hero = document.querySelector("[data-l-img]");
      if (hero && l.hero_image_url) { hero.src = l.hero_image_url; hero.alt = l.image_alt || l.title; }

      var galleryMount = document.getElementById("dyn-gallery");
      var galleryGrid = document.getElementById("dyn-gallery-grid");
      if (galleryMount && galleryGrid && Array.isArray(l.gallery_images) && l.gallery_images.length) {
        galleryGrid.innerHTML = l.gallery_images.map(function (g) {
          return '<figure><div class="frame frame--hover" style="aspect-ratio:4/3">' +
            '<img src="' + esc(g.url) + '" alt="' + esc(g.alt || l.title) + '" loading="lazy"></div></figure>';
        }).join("");
        galleryMount.hidden = false;
      }

      var overview = document.querySelector("[data-l-overview]");
      if (overview) {
        overview.innerHTML = "<p>" + esc(l.overview ||
          "Full particulars, photography, and diligence materials for this residence are shared within the private presentation.") + "</p>";
      }

      // Sections written for the sample residence don't apply to other listings
      if (l.slug !== "the-zenith-penthouse") {
        document.querySelectorAll("[data-sample-only]").forEach(function (el) { el.hidden = true; });
        var generic = document.querySelector("[data-generic-spec]");
        if (generic) generic.hidden = false;
        var heading = document.querySelector("[data-l-heading]");
        if (heading) heading.textContent = "The residence, in brief.";
      }

      // Carry provenance into the funnel
      document.querySelectorAll('a[href^="presentation.html"]').forEach(function (a) {
        a.href = "presentation.html?listing=" + encodeURIComponent(l.slug);
      });
    }).catch(function () { /* sample content stands */ });
  }

  /* — Home spotlight (featured listing) — */
  var spot = document.querySelector("[data-featured-spotlight]");
  if (spot) {
    api("listings?select=*&published=eq.true&featured=eq.true&order=sort_order.asc&limit=1").then(function (rows) {
      var l = rows[0];
      if (!l) return;
      var t = spot.querySelector("[data-f-title]");
      var m = spot.querySelector("[data-f-meta]");
      var img = spot.querySelector("[data-f-img]");
      var link = spot.querySelector("[data-f-link]");
      var ov = spot.querySelector("[data-f-overview]");
      if (t) t.textContent = l.title;
      if (m) m.textContent = l.meta_line || l.location_label || "";
      if (img && l.hero_image_url) { img.src = l.hero_image_url; img.alt = l.image_alt || l.title; }
      if (link) link.href = "property.html?slug=" + encodeURIComponent(l.slug);
      if (ov && l.overview) ov.textContent = l.overview;
      // the sample spec table only describes the original featured residence
      if (l.slug !== "the-zenith-penthouse") {
        var sample = spot.querySelector("[data-sample-only]");
        if (sample) sample.hidden = true;
      }
    }).catch(function () { /* static spotlight stands */ });
  }
})();
