/* Uperformance – samma mjuka utgång som när man loggar in: sidan tonar ut med lite oskärpa
   innan nästa sida öppnas. Gäller länkarna mellan hemsidan, inloggningen och CRM:et (och Logga ut).
   Inloggningssidan tonar ut med sin egen animation (body[data-lamnar] .li-rutnat), övriga sidor
   med ett lager som tonar in över sidan (html[data-lamnar]::after i overgang.css). */
(() => {
  'use strict';
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TID = 760; // samma längd som utgången på inloggningssidan
  let pagar = false;

  function lamna(url) {
    if (pagar) return; pagar = true;
    if (lugn) { location.href = url; return; }
    document.documentElement.setAttribute('data-lamnar', '');
    document.body.setAttribute('data-lamnar', '');
    setTimeout(() => { location.href = url; }, TID);
  }
  // Länkar till hemsidan, inloggningen eller CRM:et (inte ankare på samma sida eller vägar inne i CRM:et)
  const mellanSidor = (a) => {
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    if (u.pathname === location.pathname && u.hash) return false;
    const p = u.pathname.replace(/\.html$/, '').replace(/^\/[^/]+(?=\/crm(\/|$))/, ''); // GitHub Pages: /<repo>/crm/…
    return p === '/' || p === '/index' || p === '/crm/logga-in' || p === '/crm/' || p === '/crm' || p === '/crm/index';
  };
  document.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || !mellanSidor(a)) return;
    ev.preventDefault(); lamna(a.href);
  });
  // Kommer man tillbaka med bakåtknappen ska sidan inte ligga kvar urtonad
  addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    pagar = false;
    document.documentElement.removeAttribute('data-lamnar');
    document.body && document.body.removeAttribute('data-lamnar');
  });

  window.UPLamna = lamna;
})();
