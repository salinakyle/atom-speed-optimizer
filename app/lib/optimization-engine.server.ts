import type { OptimizationSettings, ScriptRule } from "@prisma/client";

/**
 * Generates the complete storefront optimization script based on shop settings.
 * This script is injected via a Shopify Theme App Extension <script> block.
 * It runs entirely client-side on the merchant's storefront.
 */
export function generateOptimizationScript(
  settings: OptimizationSettings,
  scriptRules: ScriptRule[]
): string {
  const parts: string[] = [];
  parts.push(`(function(){`);
  parts.push(`'use strict';`);

  // ─── Image Lazy Loading ───────────────────────────────────────────────
  if (settings.lazyLoadImages) {
    parts.push(`
// Lazy-load all images that don't already have loading attribute
(function lazyLoadImages(){
  if(!('loading' in HTMLImageElement.prototype)){return;}
  document.querySelectorAll('img:not([loading])').forEach(function(img){
    img.setAttribute('loading','lazy');
  });
  // Observer for dynamically added images
  if(window.MutationObserver){
    new MutationObserver(function(ms){
      ms.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.nodeType===1){
            if(n.tagName==='IMG'&&!n.getAttribute('loading'))n.setAttribute('loading','lazy');
            n.querySelectorAll&&n.querySelectorAll('img:not([loading])').forEach(function(img){
              img.setAttribute('loading','lazy');
            });
          }
        });
      });
    }).observe(document.body,{childList:true,subtree:true});
  }
})();`);
  }

  // ─── LCP Image Preload ─────────────────────────────────────────────────
  if (settings.lcpPreloadEnabled && settings.lcpPreloadUrl) {
    parts.push(`
// Inject LCP preload hint dynamically (also set in <head> via App Proxy for best effect)
(function(){
  var l=document.createElement('link');
  l.rel='preload';l.as='image';l.fetchPriority='high';
  l.href=${JSON.stringify(settings.lcpPreloadUrl)};
  document.head.appendChild(l);
})();`);
  }

  // ─── DNS Prefetch + Preconnect ─────────────────────────────────────────
  if (settings.dnsPrefetchEnabled || settings.preconnectEnabled) {
    const KNOWN_THIRD_PARTY = [
      { origin: "https://fonts.googleapis.com", preconnect: true },
      { origin: "https://fonts.gstatic.com", preconnect: true, crossorigin: true },
      { origin: "https://www.googletagmanager.com", preconnect: false },
      { origin: "https://www.google-analytics.com", preconnect: false },
      { origin: "https://connect.facebook.net", preconnect: false },
      { origin: "https://cdn.shopify.com", preconnect: true },
      { origin: "https://monorail-edge.shopifysvc.com", preconnect: false },
    ];

    parts.push(`
// Inject resource hints
(function(){
  var h=document.head;
  var added={};
  function hint(rel,href,co){
    if(added[rel+href])return;
    added[rel+href]=1;
    var l=document.createElement('link');
    l.rel=rel;l.href=href;
    if(co)l.crossOrigin='anonymous';
    h.appendChild(l);
  }
  ${KNOWN_THIRD_PARTY.map((o) => {
    const lines = [];
    if (settings.dnsPrefetchEnabled) {
      lines.push(`hint('dns-prefetch',${JSON.stringify(o.origin)});`);
    }
    if (settings.preconnectEnabled && o.preconnect) {
      lines.push(`hint('preconnect',${JSON.stringify(o.origin)},${o.crossorigin ? "true" : "false"});`);
    }
    return lines.join("\n  ");
  }).join("\n  ")}
})();`);
  }

  // ─── Prefetch on Hover ─────────────────────────────────────────────────
  if (settings.prefetchOnHover) {
    parts.push(`
// Predictive prefetch on link hover (like instant.page)
(function(){
  var prefetched={};
  var timer=null;
  function prefetch(url){
    if(prefetched[url])return;
    prefetched[url]=1;
    var l=document.createElement('link');
    l.rel='prefetch';l.href=url;
    document.head.appendChild(l);
  }
  function onEnter(e){
    var a=e.target.closest('a[href]');
    if(!a)return;
    var href=a.href;
    if(!href||href.startsWith('javascript')||href.startsWith('mailto')||href.startsWith('tel'))return;
    if(new URL(href).origin!==location.origin)return;
    timer=setTimeout(function(){prefetch(href);},65);
  }
  function onLeave(){clearTimeout(timer);}
  document.addEventListener('mouseover',onEnter,{passive:true});
  document.addEventListener('mouseout',onLeave,{passive:true});
  // Touch: prefetch on touchstart for mobile
  document.addEventListener('touchstart',function(e){
    var a=e.target.closest('a[href]');
    if(a)prefetch(a.href);
  },{passive:true});
})();`);
  }

  // ─── font-display: swap ────────────────────────────────────────────────
  if (settings.fontDisplaySwap) {
    parts.push(`
// Inject font-display:swap via CSS override for any @font-face that lacks it
(function(){
  try{
    Array.from(document.styleSheets).forEach(function(ss){
      try{
        Array.from(ss.cssRules||[]).forEach(function(r){
          if(r.type===CSSRule.FONT_FACE_RULE){
            if(!r.style.getPropertyValue('font-display')){
              r.style.setProperty('font-display','swap');
            }
          }
        });
      }catch(e){}
    });
  }catch(e){}
})();`);
  }

  // ─── Third-Party Script Delaying ───────────────────────────────────────
  const enabledRules = scriptRules.filter((r) => r.enabled && r.action === "DELAY");
  if (settings.delayThirdPartyJs && enabledRules.length > 0) {
    const patterns = enabledRules.map((r) => r.pattern);
    const trigger = settings.delayTrigger;

    parts.push(`
// Delay matching third-party scripts until user interaction
(function(){
  var patterns=${JSON.stringify(patterns)};
  var triggered=false;
  var delayed=[];

  // Intercept script loading by overriding document.createElement for scripts
  var origCreate=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=origCreate(tag);
    if(tag.toLowerCase()==='script'){
      var origSrcDesc=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');
      var _src='';
      Object.defineProperty(el,'src',{
        get:function(){return _src;},
        set:function(v){
          _src=v;
          var matched=patterns.some(function(p){return v&&v.indexOf(p)>-1;});
          if(matched&&!triggered){
            delayed.push({el:el,src:v});
            // Block the actual src assignment until triggered
            return;
          }
          if(origSrcDesc&&origSrcDesc.set)origSrcDesc.set.call(el,v);
        },
        configurable:true,
      });
    }
    return el;
  };

  function loadDelayed(){
    if(triggered)return;
    triggered=true;
    document.createElement=origCreate; // restore
    delayed.forEach(function(d){
      d.el.src=d.src;
    });
    delayed=[];
  }

  ${trigger === "interaction" ? `
  var events=['scroll','click','keydown','touchstart','mousemove'];
  function onInteract(){
    events.forEach(function(ev){document.removeEventListener(ev,onInteract,{passive:true});});
    loadDelayed();
  }
  events.forEach(function(ev){document.addEventListener(ev,onInteract,{once:true,passive:true});});
  ` : trigger === "scroll" ? `
  document.addEventListener('scroll',function(){loadDelayed();},{once:true,passive:true});
  ` : `
  if('requestIdleCallback' in window){
    requestIdleCallback(loadDelayed,{timeout:5000});
  }else{
    setTimeout(loadDelayed,5000);
  }
  `}
  // Fallback timer — always fire within 8s to avoid breaking sites
  setTimeout(loadDelayed,8000);
})();`);
  }

  // ─── JS Defer (for inline scripts added by theme) ─────────────────────
  // Note: actual defer attribute is set via the Theme App Extension liquid snippet,
  // not JS. Here we just mark fetchpriority on resource-critical scripts.
  if (settings.deferJsEnabled) {
    parts.push(`
// Downgrade priority of non-critical scripts loaded after DOMContentLoaded
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('script[src]:not([fetchpriority]):not([type="module"])').forEach(function(s){
    // Only mark scripts that loaded after initial parse
    if(!s.async&&!s.defer)s.setAttribute('fetchpriority','low');
  });
},{once:true,passive:true});`);
  }

  parts.push(`})()`);
  return parts.join("\n");
}

/**
 * Generates the <head> HTML fragment injected via App Proxy or Theme App Extension.
 * Includes: critical resource hints, LCP preload, performance mark.
 */
export function generateHeadInjection(settings: OptimizationSettings): string {
  const lines: string[] = [];

  if (settings.lcpPreloadEnabled && settings.lcpPreloadUrl) {
    lines.push(
      `<link rel="preload" as="image" fetchpriority="high" href="${escapeAttr(settings.lcpPreloadUrl)}">`
    );
  }

  if (settings.preconnectEnabled) {
    lines.push(`<link rel="preconnect" href="https://cdn.shopify.com">`);
    lines.push(`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
    lines.push(`<link rel="preconnect" href="https://fonts.googleapis.com">`);
  }

  if (settings.dnsPrefetchEnabled) {
    lines.push(`<link rel="dns-prefetch" href="https://www.googletagmanager.com">`);
    lines.push(`<link rel="dns-prefetch" href="https://connect.facebook.net">`);
    lines.push(`<link rel="dns-prefetch" href="https://analytics.tiktok.com">`);
    lines.push(`<link rel="dns-prefetch" href="https://static.klaviyo.com">`);
  }

  // Performance mark for RUM beacon timing
  lines.push(`<script>performance&&performance.mark&&performance.mark('speed-opt-start');</script>`);

  return lines.join("\n");
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Calculates a simple composite performance score from CWV metrics.
 * Mirrors Lighthouse's weighted scoring but simplified for RUM data.
 */
export function calculateCompositeScore(metrics: {
  lcp?: number | null;
  inp?: number | null;
  cls?: number | null;
  fcp?: number | null;
  ttfb?: number | null;
}): number {
  const weights = { lcp: 0.35, inp: 0.30, cls: 0.20, fcp: 0.10, ttfb: 0.05 };

  const metricScore = (metric: string, value: number | null | undefined): number => {
    if (value == null) return 50; // neutral if missing
    const good: Record<string, number> = { lcp: 2500, inp: 200, cls: 100, fcp: 1800, ttfb: 800 };
    const poor: Record<string, number> = { lcp: 4000, inp: 500, cls: 250, fcp: 3000, ttfb: 1800 };
    const g = good[metric]!;
    const p = poor[metric]!;
    if (value <= g) return 100;
    if (value >= p) return 0;
    // Linear interpolation between good and poor
    return Math.round(100 - ((value - g) / (p - g)) * 100);
  };

  let totalScore = 0;
  let totalWeight = 0;

  for (const [metric, weight] of Object.entries(weights)) {
    const val = metrics[metric as keyof typeof metrics];
    if (val != null) {
      totalScore += metricScore(metric, val) * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round(totalScore / totalWeight);
}
