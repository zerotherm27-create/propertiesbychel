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

  /* — Brand-styled Google Map (listing detail pages with coordinates set) — */
  var BRAND_MAP_STYLE = [
    { elementType: "geometry", stylers: [{ color: "#f1eee6" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#5f5e5a" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#faf8f4" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#e3ded1" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a6b14" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#d4c9a8" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9d3d9" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9c4b5" }] }
  ];
  var BRAND_PIN_ICON = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">' +
    '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#8A6B14"/>' +
    '<circle cx="15" cy="15" r="5.5" fill="#FAF8F4"/></svg>'
  );

  var mapsLoadPromise = null;
  function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) return Promise.resolve();
    if (!mapsLoadPromise) {
      mapsLoadPromise = new Promise(function (resolve, reject) {
        var cbName = "__initGoogleMaps" + Date.now();
        window[cbName] = function () { delete window[cbName]; resolve(); };
        var script = document.createElement("script");
        script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(apiKey) + "&callback=" + cbName;
        script.async = true;
        script.onerror = function () { reject(new Error("Google Maps script failed to load")); };
        document.head.appendChild(script);
      });
    }
    return mapsLoadPromise;
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
    gallery.setAttribute("data-is-loading", "");
    api("listings?select=*&published=eq.true&order=sort_order.asc").then(function (rows) {
      gallery.removeAttribute("data-is-loading");
      if (!rows.length) return;
      gallery.innerHTML = rows.map(function (l, i) {
        var imgAttrs = i === 0 ? 'fetchpriority="high"' : 'loading="lazy"';
        return (
          '<a class="plisting is-in" href="property?slug=' + encodeURIComponent(l.slug) + '"' +
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
    }).catch(function () { gallery.removeAttribute("data-is-loading"); /* static sample gallery stands */ });
  }

  /* — Property detail — */
  var detail = document.querySelector("[data-listing-detail]");
  var slug = new URLSearchParams(location.search).get("slug");
  if (detail && slug) {
    detail.setAttribute("data-is-loading", "");
    api("listings?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1").then(function (rows) {
      detail.removeAttribute("data-is-loading");
      var l = rows[0];
      if (!l) return;
      document.title = l.title + " · Private Presentation · Properties by Chel";

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

      var mapSection = document.getElementById("location-map-section");
      var mapConfig = window.GOOGLE_MAPS_CONFIG || {};
      if (mapSection && l.map_lat != null && l.map_lng != null && mapConfig.apiKey) {
        var featuresTable = document.getElementById("location-features-table");
        if (featuresTable && Array.isArray(l.location_features) && l.location_features.length) {
          featuresTable.innerHTML = l.location_features.map(function (f) {
            return "<tr><th scope=\"row\">" + esc(f.label) + "</th><td>" + esc(f.value) + "</td></tr>";
          }).join("");
        }
        loadGoogleMaps(mapConfig.apiKey).then(function () {
          var mapEl = document.getElementById("listing-map");
          if (!mapEl) return;
          var center = { lat: l.map_lat, lng: l.map_lng };
          var map = new google.maps.Map(mapEl, {
            center: center,
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: true,
            styles: BRAND_MAP_STYLE
          });
          new google.maps.Marker({ position: center, map: map, icon: BRAND_PIN_ICON });
        }).catch(function () { /* map section stays hidden if the script fails to load */ });
        mapSection.hidden = false;
      }

      // Sections written for the static fallback markup don't apply once real data has loaded,
      // regardless of what slug that data happens to carry.
      document.querySelectorAll("[data-sample-only]").forEach(function (el) { el.hidden = true; });
      var generic = document.querySelector("[data-generic-spec]");
      if (generic) generic.hidden = false;
      var heading = document.querySelector("[data-l-heading]");
      if (heading) heading.textContent = "The residence, in brief.";

      // Carry provenance into the funnel
      document.querySelectorAll('a[href^="presentation"]').forEach(function (a) {
        a.href = "presentation?listing=" + encodeURIComponent(l.slug);
      });
    }).catch(function () { detail.removeAttribute("data-is-loading"); /* sample content stands */ });
  }

  /* — Home spotlight (featured listing) — */
  var spot = document.querySelector("[data-featured-spotlight]");
  if (spot) {
    spot.setAttribute("data-is-loading", "");
    api("listings?select=*&published=eq.true&featured=eq.true&order=sort_order.asc&limit=1").then(function (rows) {
      spot.removeAttribute("data-is-loading");
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
      if (link) link.href = "property?slug=" + encodeURIComponent(l.slug);
      if (ov && l.overview) ov.textContent = l.overview;
      // the sample spec table only describes the original featured residence
      if (l.slug !== "the-zenith-penthouse") {
        var sample = spot.querySelector("[data-sample-only]");
        if (sample) sample.hidden = true;
      }
    }).catch(function () { spot.removeAttribute("data-is-loading"); /* static spotlight stands */ });
  }
})();
