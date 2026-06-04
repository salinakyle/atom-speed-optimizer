/**
 * Speed Optimizer — Storefront Engine
 * Reads data-* attributes from the <script> tag to configure behavior.
 * Auto-detects settings injected by the Liquid block.
 *
 * This file is served as a static asset via the Theme App Extension.
 * The App Proxy version is dynamically generated per-shop.
 */
(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var scripts = document.querySelectorAll('script[data-lazy-images]');
    return scripts[scripts.length - 1];
  })();

  var cfg = {
    deferJs: script && script.getAttribute('data-defer-js') === 'true',
    delayThirdParty: script && script.getAttribute('data-delay-third-party') === 'true',
    delayTrigger: (script && script.getAttribute('data-delay-trigger')) || 'interaction',
    lazyImages: script && script.getAttribute('data-lazy-images') !== 'false',
    prefetchHover: script && script.getAttribute('data-prefetch-hover') !== 'false',
    fontSwap: script && script.getAttribute('data-font-swap') !== 'false',
  };

  // ─── 1. Lazy-load images ──────────────────────────────────────────────
  if (cfg.lazyImages && 'loading' in HTMLImageElement.prototype) {
    document.querySelectorAll('img:not([loading])').forEach(function (img) {
      img.setAttribute('loading', 'lazy');
    });
  }

  // ─── 2. font-display: swap ────────────────────────────────────────────
  if (cfg.fontSwap) {
    try {
      Array.from(document.styleSheets).forEach(function (ss) {
        try {
          Array.from(ss.cssRules || []).forEach(function (r) {
            if (r.type === CSSRule.FONT_FACE_RULE && !r.style.getPropertyValue('font-display')) {
              r.style.setProperty('font-display', 'swap');
            }
          });
        } catch (e) { /* cross-origin stylesheet — skip */ }
      });
    } catch (e) {}
  }

  // ─── 3. Prefetch on hover ─────────────────────────────────────────────
  if (cfg.prefetchHover) {
    var prefetched = {};
    var hoverTimer = null;

    document.addEventListener('mouseover', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || !a.href || a.href.indexOf(location.origin) !== 0) return;
      hoverTimer = setTimeout(function () {
        if (prefetched[a.href]) return;
        prefetched[a.href] = 1;
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = a.href;
        document.head.appendChild(link);
      }, 65);
    }, { passive: true });

    document.addEventListener('mouseout', function () {
      clearTimeout(hoverTimer);
    }, { passive: true });

    document.addEventListener('touchstart', function (e) {
      var a = e.target.closest('a[href]');
      if (a && a.href && !prefetched[a.href]) {
        prefetched[a.href] = 1;
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = a.href;
        document.head.appendChild(link);
      }
    }, { passive: true });
  }

  // ─── 4. Third-party script delay ─────────────────────────────────────
  if (cfg.delayThirdParty) {
    // Patterns fetched from the App Proxy at runtime and stored in sessionStorage
    var STORAGE_KEY = 'speedopt_patterns';
    var endpoint = window.__speedOptEndpoint;
    var patterns = [];

    try {
      var cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) patterns = JSON.parse(cached);
    } catch (e) {}

    if (!patterns.length && endpoint) {
      // Fetch patterns async — they'll be ready before user interaction
      fetch(endpoint.replace('/rum', '/patterns'), { method: 'GET' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          patterns = data.patterns || [];
          try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(patterns)); } catch (e) {}
        })
        .catch(function () {});
    }

    var triggered = false;
    var delayedScripts = [];
    var origAppendChild = Node.prototype.appendChild;
    var origInsertBefore = Node.prototype.insertBefore;

    function shouldDelay(src) {
      if (!src || !patterns.length) return false;
      return patterns.some(function (p) { return src.indexOf(p) > -1; });
    }

    function interceptScript(script) {
      if (script.tagName !== 'SCRIPT') return script;
      var origSrc = script.getAttribute('src');
      if (origSrc && shouldDelay(origSrc) && !triggered) {
        script.setAttribute('data-speedopt-src', origSrc);
        script.removeAttribute('src');
        delayedScripts.push(script);
      }
      return script;
    }

    Node.prototype.appendChild = function (node) {
      interceptScript(node);
      return origAppendChild.call(this, node);
    };

    Node.prototype.insertBefore = function (node, ref) {
      interceptScript(node);
      return origInsertBefore.call(this, node, ref);
    };

    function loadDelayed() {
      if (triggered) return;
      triggered = true;
      Node.prototype.appendChild = origAppendChild;
      Node.prototype.insertBefore = origInsertBefore;

      delayedScripts.forEach(function (s) {
        var src = s.getAttribute('data-speedopt-src');
        if (src) s.setAttribute('src', src);
      });
    }

    var trigger = cfg.delayTrigger;

    if (trigger === 'scroll') {
      document.addEventListener('scroll', loadDelayed, { once: true, passive: true });
    } else if (trigger === 'idle') {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(loadDelayed, { timeout: 5000 });
      } else {
        setTimeout(loadDelayed, 5000);
      }
    } else {
      // Default: first interaction
      var interactionEvents = ['scroll', 'click', 'keydown', 'touchstart', 'mousemove'];
      function onInteract() {
        interactionEvents.forEach(function (ev) {
          document.removeEventListener(ev, onInteract);
        });
        loadDelayed();
      }
      interactionEvents.forEach(function (ev) {
        document.addEventListener(ev, onInteract, { once: true, passive: true });
      });
    }

    // Safety net — always fire within 8s
    setTimeout(loadDelayed, 8000);
  }
})();
