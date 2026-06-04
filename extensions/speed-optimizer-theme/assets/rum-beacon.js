/**
 * Speed Optimizer — Real User Monitoring beacon.
 * Collects Core Web Vitals via the web-vitals measurement patterns.
 * < 2KB minified. No dependencies. Runs passively.
 *
 * Injected via the Theme App Extension liquid snippet.
 */
(function () {
  'use strict';

  if (!('performance' in window) || !('PerformanceObserver' in window)) return;

  var ENDPOINT = window.__speedOptEndpoint || '/apps/speedopt/rum';
  var metrics = {};
  var sent = false;

  function getDevice() {
    var w = window.innerWidth;
    if (w <= 768) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  function send() {
    if (sent || Object.keys(metrics).length === 0) return;
    sent = true;

    var payload = Object.assign({}, metrics, {
      url: location.href,
      device: getDevice(),
      ts: Date.now(),
    });

    // Use sendBeacon when available for reliability during page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, JSON.stringify(payload));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      }).catch(function () {});
    }
  }

  // ─── LCP (Largest Contentful Paint) ────────────────────────────────────
  try {
    var lcpObs = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      var last = entries[entries.length - 1];
      if (last) metrics.lcp = Math.round(last.startTime);
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  // ─── CLS (Cumulative Layout Shift) ─────────────────────────────────────
  try {
    var clsValue = 0;
    var clsObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        // Only count layout shifts without recent user input
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          metrics.cls = Math.round(clsValue * 1000) / 1000;
        }
      });
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  // ─── FID (First Input Delay) — legacy, kept for coverage ───────────────
  try {
    var fidObs = new PerformanceObserver(function (list) {
      var entry = list.getEntries()[0];
      if (entry) metrics.fid = Math.round(entry.processingStart - entry.startTime);
    });
    fidObs.observe({ type: 'first-input', buffered: true });
  } catch (e) {}

  // ─── INP (Interaction to Next Paint) ───────────────────────────────────
  try {
    var inpValue = 0;
    var inpObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        var duration = entry.processingEnd - entry.startTime;
        if (duration > inpValue) {
          inpValue = duration;
          metrics.inp = Math.round(inpValue);
        }
      });
    });
    inpObs.observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch (e) {}

  // ─── FCP (First Contentful Paint) ──────────────────────────────────────
  try {
    var fcpObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.name === 'first-contentful-paint') {
          metrics.fcp = Math.round(entry.startTime);
        }
      });
    });
    fcpObs.observe({ type: 'paint', buffered: true });
  } catch (e) {}

  // ─── TTFB (Time to First Byte) ─────────────────────────────────────────
  try {
    var navObs = new PerformanceObserver(function (list) {
      var entry = list.getEntries()[0];
      if (entry) {
        metrics.ttfb = Math.round(entry.responseStart - entry.requestStart);
      }
    });
    navObs.observe({ type: 'navigation', buffered: true });
  } catch (e) {}

  // ─── Send on page hide / visibility change ─────────────────────────────
  // visibilitychange is the most reliable cross-browser trigger for
  // sending metrics "at end of session" without blocking navigation.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') send();
  });

  // Fallback: send after 10s for pages that stay open
  setTimeout(send, 10000);
})();
