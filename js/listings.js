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

  /* Developments with a bespoke landing page (richer than the generic
     development.html/property.html template) — cross-linked below. */
  var BESPOKE_DEV_PAGES = {
    "ongpin-tower": "ongpin-tower",
    "laya-by-shang-properties": "laya-by-shang",
    "botanika-nature-residences": "botanika-tower-one",
    "two-botanika": "two-botanika"
  };

  /* — Shared photo-grid lightbox (masonry click-to-view, listing + development detail) — */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fadeIn(el) {
    if (reduceMotion) { el.classList.add("is-in"); return; }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add("is-in"); });
    });
  }
  var wirePhotoGridLightbox = (function () {
    var lightbox = document.getElementById("gallery-lightbox");
    if (!lightbox) return null;
    var img = document.getElementById("gallery-lightbox-img");
    var caption = document.getElementById("gallery-lightbox-caption");
    var closeBtn = document.getElementById("gallery-lightbox-close");
    var prevBtn = document.getElementById("gallery-lightbox-prev");
    var nextBtn = document.getElementById("gallery-lightbox-next");
    var items = [];
    var index = 0;
    var lastFocused = null;

    function showSlide(i) {
      index = (i + items.length) % items.length;
      var item = items[index];
      img.src = item.url;
      img.alt = item.alt;
      caption.textContent = item.alt + " · " + (index + 1) + " / " + items.length;
    }
    function open(list, startIndex) {
      items = list;
      lastFocused = document.activeElement;
      showSlide(startIndex);
      lightbox.hidden = false;
      fadeIn(lightbox);
      closeBtn.focus();
    }
    function close() {
      lightbox.classList.remove("is-in");
      if (reduceMotion) {
        lightbox.hidden = true;
        img.src = "";
      } else {
        var onEnd = function (e) {
          if (e.target !== lightbox) return;
          lightbox.removeEventListener("transitionend", onEnd);
          lightbox.hidden = true;
          img.src = "";
        };
        lightbox.addEventListener("transitionend", onEnd);
      }
      if (lastFocused) lastFocused.focus();
    }
    closeBtn.addEventListener("click", close);
    prevBtn.addEventListener("click", function () { showSlide(index - 1); });
    nextBtn.addEventListener("click", function () { showSlide(index + 1); });
    lightbox.addEventListener("click", function (e) { if (e.target === lightbox) close(); });
    document.addEventListener("keydown", function (e) {
      if (lightbox.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") showSlide(index - 1);
      if (e.key === "ArrowRight") showSlide(index + 1);
    });

    return function (gridEl, list) {
      gridEl.querySelectorAll("figure").forEach(function (fig, i) {
        fig.addEventListener("click", function () { open(list, i); });
      });
    };
  })();

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

  /* — Listing card partial — shared by the collection gallery and any
   * development page's "linked units" grid. When a row carries an
   * embedded `development` (via a `development:developments(name,slug)`
   * select), a small "Part of <name>" note is added under the meta line. */
  function listingCardHTML(l, i) {
    var imgAttrs = i === 0 ? 'fetchpriority="high"' : 'loading="lazy"';
    var devNote = l.development ? '<p class="plisting__meta">Part of ' + esc(l.development.name) + "</p>" : "";
    var heroUrl = l.hero_image_url || (l.development && l.development.hero_image_url) || "";
    return (
      '<a class="plisting is-in" href="property?slug=' + encodeURIComponent(l.slug) + '"' +
      ' data-status="' + esc(l.status) + '" data-collection="' + esc((l.collections || []).join(" ")) + '">' +
        '<div class="frame frame--hover" style="aspect-ratio:' + esc(l.aspect || "4/3") + ';position:relative">' +
          (l.tag ? '<span class="plisting__tag">' + esc(l.tag) + "</span>" : "") +
          '<img src="' + esc(heroUrl) + '" alt="' + esc(l.image_alt || l.title) + '" ' + imgAttrs + '>' +
        "</div>" +
        '<div class="plisting__head"><span class="plisting__title">' + esc(l.title) + "</span>" +
          '<span class="plisting__rule"></span><span class="plisting__price">' + esc(l.price_display || "Price on application") + "</span></div>" +
        '<p class="plisting__meta">' + esc(l.meta_line || l.location_label || "") + "</p>" +
        devNote +
      "</a>"
    );
  }

  /* — Collection gallery — */
  var gallery = document.querySelector(".gallery[data-listings]");
  if (gallery) {
    gallery.setAttribute("data-is-loading", "");
    api("listings?select=*,development:developments(name,slug,hero_image_url)&published=eq.true&order=sort_order.asc").then(function (rows) {
      gallery.removeAttribute("data-is-loading");
      if (!rows.length) return;
      gallery.innerHTML = rows.map(listingCardHTML).join("");
      document.dispatchEvent(new CustomEvent("listings:rendered"));
    }).catch(function () { gallery.removeAttribute("data-is-loading"); /* static sample gallery stands */ });
  }

  /* — Property detail — */
  var detail = document.querySelector("[data-listing-detail]");
  var slug = new URLSearchParams(location.search).get("slug");
  if (detail && slug) {
    detail.setAttribute("data-is-loading", "");
    api("listings?select=*,development:developments(name,slug,overview,hero_image_url,image_alt,gallery_images)&slug=eq." + encodeURIComponent(slug) + "&limit=1").then(function (rows) {
      detail.removeAttribute("data-is-loading");
      var l = rows[0];
      if (!l) return;
      document.title = l.title + " · Private Presentation · Properties by Chel";

      // A listing with no photos/overview of its own falls back to its
      // parent development's, so linking it is enough to make it presentable.
      var dev = l.development || null;
      var heroUrl = l.hero_image_url || (dev && dev.hero_image_url) || "";

      var setMeta = function (selector, attr, value) {
        var el = document.querySelector(selector);
        if (el && value) el.setAttribute(attr, value);
      };
      var pageUrl = "https://www.propertiesbychel.com/property?slug=" + encodeURIComponent(l.slug);
      var pageTitle = l.title + (l.location_label ? ", " + l.location_label : "") + " · Private Presentation · Properties by Chel";
      setMeta('link[rel="canonical"]', "href", pageUrl);
      setMeta('meta[property="og:url"]', "content", pageUrl);
      setMeta('meta[property="og:title"]', "content", pageTitle);
      setMeta('meta[name="twitter:title"]', "content", pageTitle);
      if (heroUrl) {
        setMeta('meta[property="og:image"]', "content", heroUrl);
        setMeta('meta[name="twitter:image"]', "content", heroUrl);
      }
      if (l.meta_description) {
        setMeta('meta[name="description"]', "content", l.meta_description);
        setMeta('meta[property="og:description"]', "content", l.meta_description);
        setMeta('meta[name="twitter:description"]', "content", l.meta_description);
      }

      var bind = function (name, text) {
        document.querySelectorAll('[data-l="' + name + '"]').forEach(function (el) { el.textContent = text; });
      };
      bind("title", l.title);
      bind("location", l.location_label || "");
      bind("meta", l.meta_line || "");
      bind("price", l.price_display || "Price on application");
      bind("status", l.status === "lease" ? "For Lease" : l.status === "investment" ? "Investment" : "For Sale");

      var hero = document.querySelector("[data-l-img]");
      if (hero && heroUrl) { hero.src = heroUrl; hero.alt = l.image_alt || (dev && dev.image_alt) || l.title; }

      var galleryImages = (Array.isArray(l.gallery_images) && l.gallery_images.length) ? l.gallery_images :
        ((dev && Array.isArray(dev.gallery_images)) ? dev.gallery_images : []);
      var galleryMount = document.getElementById("dyn-gallery");
      var galleryGrid = document.getElementById("dyn-gallery-grid");
      if (galleryMount && galleryGrid && galleryImages.length) {
        galleryGrid.innerHTML = galleryImages.map(function (g, i) {
          return '<figure data-reveal style="transition-delay:' + (Math.min(i, 11) * 60) + 'ms"><div class="frame frame--hover">' +
            '<img src="' + esc(g.url) + '" alt="' + esc(g.alt || l.title) + '" loading="lazy"></div></figure>';
        }).join("");
        galleryMount.hidden = false;
        document.dispatchEvent(new CustomEvent("listings:rendered"));
        if (wirePhotoGridLightbox) {
          wirePhotoGridLightbox(galleryGrid, galleryImages.map(function (g) { return { url: g.url, alt: g.alt || l.title }; }));
        }
      }

      var overview = document.querySelector("[data-l-overview]");
      if (overview) {
        overview.innerHTML = "<p>" + esc(l.overview || (dev && dev.overview) ||
          "Full particulars, photography, and diligence materials for this residence are shared within the private presentation.") + "</p>";
      }

      // Bespoke developments get their own richer page; everything else falls
      // back to the generic development template.
      var devNoteEl = document.querySelector("[data-l-dev-note]");
      if (devNoteEl && dev && dev.slug) {
        var devHref = BESPOKE_DEV_PAGES[dev.slug] || "development?slug=" + encodeURIComponent(dev.slug);
        devNoteEl.querySelector("[data-l-dev-link]").href = devHref;
        devNoteEl.querySelector("[data-l-dev-name]").textContent = dev.name;
        devNoteEl.hidden = false;
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

  /* — Development detail — */
  var devDetail = document.querySelector("[data-development-detail]");
  var devSlug = new URLSearchParams(location.search).get("slug");
  if (devDetail && devSlug) {
    devDetail.setAttribute("data-is-loading", "");
    api("developments?select=*&slug=eq." + encodeURIComponent(devSlug) + "&limit=1").then(function (rows) {
      devDetail.removeAttribute("data-is-loading");
      var d = rows[0];
      if (!d) return;
      document.title = d.name + " · Properties by Chel";

      var setMeta = function (selector, attr, value) {
        var el = document.querySelector(selector);
        if (el && value) el.setAttribute(attr, value);
      };
      var pageUrl = "https://www.propertiesbychel.com/development?slug=" + encodeURIComponent(d.slug);
      var pageTitle = d.name + (d.location_label ? ", " + d.location_label : "") + " · Properties by Chel";
      setMeta('link[rel="canonical"]', "href", pageUrl);
      setMeta('meta[property="og:url"]', "content", pageUrl);
      setMeta('meta[property="og:title"]', "content", pageTitle);
      setMeta('meta[name="twitter:title"]', "content", pageTitle);
      if (d.hero_image_url) {
        setMeta('meta[property="og:image"]', "content", d.hero_image_url);
        setMeta('meta[name="twitter:image"]', "content", d.hero_image_url);
      }
      if (d.meta_description) {
        setMeta('meta[name="description"]', "content", d.meta_description);
        setMeta('meta[property="og:description"]', "content", d.meta_description);
        setMeta('meta[name="twitter:description"]', "content", d.meta_description);
      }

      var bindD = function (name, text) {
        document.querySelectorAll('[data-d="' + name + '"]').forEach(function (el) { el.textContent = text; });
      };
      bindD("name", d.name);
      bindD("developer_name", d.developer_name || "");
      bindD("tagline", d.tagline || "A considered building.");
      bindD("meta_line", d.meta_line || "");
      bindD("location_label", d.location_label || "");
      bindD("developer_line", d.developer_name ? "Developed by " + d.developer_name + "." : "");

      // Bespoke developments get their own richer page alongside this
      // dashboard-managed one.
      var fullSiteNote = document.querySelector("[data-d-full-site]");
      if (fullSiteNote && BESPOKE_DEV_PAGES[d.slug]) {
        fullSiteNote.querySelector("[data-d-full-site-link]").href = BESPOKE_DEV_PAGES[d.slug];
        fullSiteNote.hidden = false;
      }

      var hero = document.querySelector("[data-d-img]");
      if (hero && d.hero_image_url) { hero.src = d.hero_image_url; hero.alt = d.image_alt || d.name; }

      var galleryMount = document.getElementById("dyn-gallery");
      var galleryGrid = document.getElementById("dyn-gallery-grid");
      if (galleryMount && galleryGrid && Array.isArray(d.gallery_images) && d.gallery_images.length) {
        galleryGrid.innerHTML = d.gallery_images.map(function (g, i) {
          return '<figure data-reveal style="transition-delay:' + (Math.min(i, 11) * 60) + 'ms"><div class="frame frame--hover">' +
            '<img src="' + esc(g.url) + '" alt="' + esc(g.alt || d.name) + '" loading="lazy"></div></figure>';
        }).join("");
        galleryMount.hidden = false;
        document.dispatchEvent(new CustomEvent("listings:rendered"));
        if (wirePhotoGridLightbox) {
          wirePhotoGridLightbox(galleryGrid, d.gallery_images.map(function (g) { return { url: g.url, alt: g.alt || d.name }; }));
        }
      }

      var overview = document.querySelector("[data-d-overview]");
      if (overview) {
        overview.innerHTML = "<p>" + esc(d.overview ||
          "Full particulars for this development are shared within the private presentation.") + "</p>";
      }

      var amenitiesSection = document.getElementById("dev-amenities");
      var amenitiesList = document.getElementById("dev-amenities-list");
      if (amenitiesSection && amenitiesList && Array.isArray(d.amenities) && d.amenities.length) {
        amenitiesList.innerHTML = d.amenities.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("");
        amenitiesSection.hidden = false;
      }

      var mapSection = document.getElementById("location-map-section");
      var mapConfig = window.GOOGLE_MAPS_CONFIG || {};
      if (mapSection && d.map_lat != null && d.map_lng != null && mapConfig.apiKey) {
        var featuresTable = document.getElementById("location-features-table");
        if (featuresTable && Array.isArray(d.location_features) && d.location_features.length) {
          featuresTable.innerHTML = d.location_features.map(function (f) {
            return "<tr><th scope=\"row\">" + esc(f.label) + "</th><td>" + esc(f.value) + "</td></tr>";
          }).join("");
        }
        loadGoogleMaps(mapConfig.apiKey).then(function () {
          var mapEl = document.getElementById("development-map");
          if (!mapEl) return;
          var center = { lat: d.map_lat, lng: d.map_lng };
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

      // Carry provenance into the funnel
      document.querySelectorAll('a[href^="presentation"]').forEach(function (a) {
        a.href = "presentation?development=" + encodeURIComponent(d.slug);
      });

      // Linked units
      var unitsSection = document.getElementById("dev-units");
      var unitsGrid = document.querySelector("[data-development-listings]");
      if (unitsSection && unitsGrid) {
        api("listings?select=*&development_id=eq." + encodeURIComponent(d.id) + "&published=eq.true&order=sort_order.asc").then(function (units) {
          if (!units.length) return;
          unitsGrid.innerHTML = units.map(listingCardHTML).join("");
          unitsSection.hidden = false;
          document.dispatchEvent(new CustomEvent("listings:rendered"));
        }).catch(function () { /* section stays hidden */ });
      }
    }).catch(function () { devDetail.removeAttribute("data-is-loading"); });
  }

  /* — Home spotlight (featured listing OR featured development — whichever
     has the lower sort_order wins the single slot; a tie favors the listing,
     matching this section's original listing-only behavior). — */
  var spot = document.querySelector("[data-featured-spotlight]");
  if (spot) {
    spot.setAttribute("data-is-loading", "");
    Promise.all([
      api("listings?select=*&published=eq.true&featured=eq.true&order=sort_order.asc&limit=1").catch(function () { return []; }),
      api("developments?select=*&published=eq.true&featured=eq.true&order=sort_order.asc&limit=1").catch(function () { return []; })
    ]).then(function (results) {
      spot.removeAttribute("data-is-loading");
      var l = results[0][0];
      var d = results[1][0];
      var winner = l;
      var isDev = false;
      if (d && (!l || (d.sort_order || 100) < (l.sort_order || 100))) { winner = d; isDev = true; }
      if (!winner) return;

      var t = spot.querySelector("[data-f-title]");
      var m = spot.querySelector("[data-f-meta]");
      var img = spot.querySelector("[data-f-img]");
      var link = spot.querySelector("[data-f-link]");
      var ov = spot.querySelector("[data-f-overview]");
      if (t) t.textContent = isDev ? winner.name : winner.title;
      if (m) m.textContent = winner.meta_line || winner.location_label || "";
      if (img && winner.hero_image_url) { img.src = winner.hero_image_url; img.alt = winner.image_alt || (isDev ? winner.name : winner.title); }
      if (link) link.href = isDev ? (BESPOKE_DEV_PAGES[winner.slug] || "development?slug=" + encodeURIComponent(winner.slug)) : "property?slug=" + encodeURIComponent(winner.slug);
      if (ov && winner.overview) ov.textContent = winner.overview;
      var sample = spot.querySelector("[data-sample-only]");
      if (sample) sample.hidden = true;
    }).catch(function () { spot.removeAttribute("data-is-loading"); /* static spotlight stands */ });
  }
})();
