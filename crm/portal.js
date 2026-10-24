/* Uperformance – premiumlager för kundsidorna (window.UPPortal): kundlänken, hälsoformuläret och offerten.
   Framstegsringen, räkneverk, ljus som följer musen, magnetiska knappar, panelbyten, konfetti och toasten.
   PRESTANDA (som sajten): det som rör sig hela tiden är bara transform/opacity på egna lager, och allt
   pausas utanför bild och när fliken är dold (data-vilar). Allt respekterar "minska rörelse". */
(() => {
  'use strict';
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finMus = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ik = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;

  /* Räkneverk: rullar ett tal från det som visas till det nya värdet ----------------------- */
  function rakna(el, till, { tid = 1400, format = (v) => Math.round(v).toLocaleString('sv-SE') } = {}) {
    if (!el) return;
    const fran = parseFloat(el.dataset.varde ?? till); el.dataset.varde = till;
    if (lugn || fran === till) { el.textContent = format(till); return; }
    const t0 = performance.now(); const id = (el._rakna = (el._rakna || 0) + 1);
    const steg = (t) => {
      if (el._rakna !== id || !el.isConnected) return;
      const p = Math.min(1, (t - t0) / tid); const k = 1 - Math.pow(1 - p, 4);
      el.textContent = format(fran + (till - fran) * k);
      if (p < 1) requestAnimationFrame(steg);
    };
    requestAnimationFrame(steg);
  }

  /* Framstegsringen ------------------------------------------------------------------------
     Bågen ritas med stroke-dasharray som styrs av --p (registrerad @property, så den kan animeras när
     värdet ändras). 60 streck runt om tänds i takt med bågen och ett glödande huvud följer spetsen.
     Det som rör sig i vila – strecken som glimmar, glansen som löper i bågen och huvudets puls – ligger
     i egna HTML-lager som bara ändrar opacitet eller vrids (inga SVG-animationer, ingen ommålning).
     Glimten och glansen maskas till den fyllda delen med en konisk mask som bara ändras med --p. */
  let senast = null; // senast visade värde, så att en omritning av sidan inte startar om animeringen
  const ARIA = (p, etikett) => `${p} procent ${etikett}`;
  function ring(p, { tal = p, enhet = '%', etikett = 'klart', aria, tyst = false } = {}) {
    p = Math.max(0, Math.min(100, Math.round(p)));
    const start = lugn ? { p, tal } : senast || { p: 0, tal: 0 };
    const streck = (cls) => `<svg class="ring-svg" viewBox="0 0 140 140" aria-hidden="true"><circle class="${cls}" cx="70" cy="70" r="65" pathLength="120"/></svg>`;
    return `<div class="ring" data-ring data-mal="${p}" data-tal-mal="${e(tal)}" data-etikett="${e(etikett)}" style="--p:${start.p}" ${start.p <= 0 ? 'data-tom' : ''} ${start.p >= 100 ? 'data-klar' : ''} ${tyst ? 'data-tyst' : ''} role="img" aria-label="${e(aria || ARIA(p, etikett))}">
      <span class="ring-halo" aria-hidden="true"></span>
      <svg class="ring-svg" viewBox="0 0 140 140" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="130" y2="130">
            <stop offset="0" stop-color="#a7d2ff"/><stop offset=".55" stop-color="#7ee0c3"/><stop offset="1" stop-color="#e9fff7"/>
          </linearGradient>
          <mask id="ring-kil" maskUnits="userSpaceOnUse" x="0" y="0" width="140" height="140"><circle class="ring-kil" cx="70" cy="70" r="59" pathLength="100" transform="rotate(-90 70 70)"/></mask>
        </defs>
        <circle class="ring-streck" cx="70" cy="70" r="65" pathLength="120"/>
        <circle class="ring-spar" cx="70" cy="70" r="52"/>
        <g mask="url(#ring-kil)"><circle class="ring-streck ring-streck-tand" cx="70" cy="70" r="65" pathLength="120"/></g>
        <circle class="ring-bage" cx="70" cy="70" r="52" pathLength="100" transform="rotate(-90 70 70)"/>
      </svg>
      <span class="ring-lager ring-glimt" aria-hidden="true">${streck('ring-streck ring-streck-ljus')}</span>
      <span class="ring-lager ring-glans" aria-hidden="true"><svg class="ring-svg" viewBox="0 0 140 140" aria-hidden="true"><circle class="ring-glans-streck" cx="70" cy="70" r="52" pathLength="100"/></svg></span>
      <span class="ring-huvud" aria-hidden="true"><i></i></span>
      <span class="ring-mitt"><strong><span data-ring-tal data-varde="${e(start.tal)}">${e(start.tal)}</span><small>${e(enhet)}</small></strong><small>${e(etikett)}</small></span>
      <span class="ring-klar" aria-hidden="true">${ik('bock')}</span>
    </div>`;
  }
  // aria: skärmläsartexten följer alltid talet som visas
  function satRing(p, tal = p, aria) {
    const r = $('[data-ring]'); if (!r) return;
    p = Math.max(0, Math.min(100, Math.round(p)));
    const fore = senast ? senast.p : 0;
    r.dataset.mal = p; r.style.setProperty('--p', p);
    r.toggleAttribute('data-tom', p <= 0);
    r.setAttribute('aria-label', aria || ARIA(p, r.dataset.etikett || 'klart'));
    rakna($('[data-ring-tal]', r), tal);
    const blevKlar = p >= 100 && fore < 100 && senast !== null && !r.hasAttribute('data-tyst');
    senast = { p, tal };
    if (p >= 100) setTimeout(() => { if (+r.dataset.mal >= 100) { r.setAttribute('data-klar', ''); if (blevKlar) fira(r); } }, lugn ? 0 : 1300);
    else r.removeAttribute('data-klar');
  }
  // Efter att sidan ritats: animera ringen från förra värdet (eller noll) till det nya
  function startaRing() {
    const r = $('[data-ring]'); if (!r) return;
    const p = +r.dataset.mal; const tal = +r.dataset.talMal; const aria = r.getAttribute('aria-label');
    if (lugn) { senast = { p, tal }; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => satRing(p, tal, aria)));
  }
  function fira(r) {
    r.setAttribute('data-firar', ''); setTimeout(() => r.removeAttribute('data-firar'), 1600);
    const b = r.getBoundingClientRect(); konfetti(b.left + b.width / 2, b.top + b.height / 2);
  }

  /* Konfetti i 3D (samma uttryck som i CRM:et) --------------------------------------------- */
  function konfetti(cx, cy, antal = 54) {
    if (lugn) return;
    const farger = ['#7ee0c3', '#a7d2ff', '#f0b545', '#ffffff', '#2fae8a', '#183653'];
    const lager = document.createElement('div'); lager.className = 'konfetti-lager'; lager.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < antal; i++) {
      const b = document.createElement('i'); const v = Math.random() * Math.PI * 2; const kraft = 90 + Math.random() * 190;
      b.style.cssText = `left:${cx}px;top:${cy}px;background:${farger[i % farger.length]};--dx:${(Math.cos(v) * kraft).toFixed(0)}px;--dy:${(Math.sin(v) * kraft - 80).toFixed(0)}px;--rx:${(Math.random() * 720 - 360).toFixed(0)}deg;--ry:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 100).toFixed(0)}ms`;
      lager.appendChild(b);
    }
    document.body.appendChild(lager); setTimeout(() => lager.remove(), 2000);
  }
  const konfettiFran = (el) => { if (!el) return; const b = el.getBoundingClientRect(); konfetti(b.left + b.width / 2, b.top + b.height / 2); };

  /* Panelbyte med riktning (framåt vrids in från höger, bakåt från vänster) ----------------- */
  function panelIn(el, riktning) {
    if (!el || lugn) return;
    el.setAttribute('data-in', riktning);
    el.addEventListener('animationend', () => el.removeAttribute('data-in'), { once: true });
  }

  /* En kort markering av det man hoppade till (engångsrörelse, transform/opacitet) ----------- */
  function markera(el) {
    if (!el) return;
    el.removeAttribute('data-markerad'); void el.offsetWidth; el.setAttribute('data-markerad', '');
    setTimeout(() => el.removeAttribute('data-markerad'), 1600);
  }

  /* Sidan har visats en gång: entréanimationerna körs bara vid första besöket ---------------- */
  function forstaVisning() {
    if (document.body.hasAttribute('data-visad')) return;
    setTimeout(() => document.body.setAttribute('data-visad', ''), lugn ? 0 : 1800);
  }

  /* Toast: ikon per typ (bock, varning, info), fet rad med ev. underrad, en åtgärd (t.ex. Ångra) och
     en tidsstapel som krymper med scaleX. Pausar när musen är över, stängs vid klick.
     typ 'varning' visas längre (6 s) och i gul ton; med åtgärd visas den 6,5 s. */
  function toast(text, { typ = 'ok', under = '', atgard = null, tid } = {}) {
    const lada = $('[data-toaster]'); if (!lada) return null;
    const ms = tid || (atgard ? 6500 : typ === 'varning' ? 6000 : 3600);
    const t = document.createElement('div'); t.className = 'ptoast';
    if (typ !== 'ok') t.dataset.typ = typ;
    t.style.setProperty('--tid', `${ms}ms`);
    t.innerHTML = `<span class="ptoast-ikon">${ik(typ === 'varning' ? 'varning' : typ === 'info' ? 'info' : 'bock')}</span>
      <span class="ptoast-text"><b>${e(text)}</b>${under ? `<small>${e(under)}</small>` : ''}</span>
      ${atgard ? `<button type="button" class="ptoast-atgard">${e(atgard.text)}</button>` : ''}<i class="ptoast-tid" aria-hidden="true"></i>`;
    let kvar = ms; let start = performance.now(); let timer = 0; let stangd = false;
    const stang = () => { if (stangd) return; stangd = true; clearTimeout(timer); t.setAttribute('data-ut', ''); setTimeout(() => t.remove(), 320); };
    const kor = () => { start = performance.now(); timer = setTimeout(() => { if (atgard && atgard.vidTid) atgard.vidTid(); stang(); }, kvar); };
    t.addEventListener('mouseenter', () => { clearTimeout(timer); kvar = Math.max(1200, kvar - (performance.now() - start)); t.setAttribute('data-paus', ''); });
    t.addEventListener('mouseleave', () => { t.removeAttribute('data-paus'); kvar = Math.min(kvar, 1800); kor(); });
    t.addEventListener('click', (ev) => {
      if (atgard && ev.target.closest('.ptoast-atgard')) { atgard.fn(); stang(); return; }
      if (atgard && atgard.vidTid) atgard.vidTid();
      stang();
    });
    lada.appendChild(t); kor();
    return { stang };
  }

  /* Vila: det som rör sig hela tiden står still utanför bild och när fliken är dold ----------- */
  const VILA = '.valkommen, .kl-hjalte, .summering, .ring, .mini-summering';
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((poster) => poster.forEach((p) => p.target.toggleAttribute('data-vilar', !p.isIntersecting)), { rootMargin: '80px 0px' });
    const sedda = new WeakSet(); let vantar = 0;
    const leta = () => { vantar = 0; document.querySelectorAll(VILA).forEach((el) => { if (!sedda.has(el)) { sedda.add(el); io.observe(el); } }); };
    new MutationObserver(() => { if (!vantar) vantar = requestAnimationFrame(leta); }).observe(document.documentElement, { childList: true, subtree: true });
    leta();
  }
  const dold = () => document.documentElement.toggleAttribute('data-dold', document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', dold); dold();

  /* Ljus som följer musen på kort och välkomstkortet, ringen lutar mot pekaren,
     accentknappar dras lätt mot muspekaren --------------------------------------------------- */
  if (finMus && !lugn) {
    let ram = 0; let sista = null;
    const uppdatera = () => {
      ram = 0; const ev = sista; if (!ev) return;
      const yta = ev.target.closest && ev.target.closest('.kort, .valkommen, .kl-hjalte, .summering, .skickat');
      if (yta) { const b = yta.getBoundingClientRect(); yta.style.setProperty('--mx', `${ev.clientX - b.left}px`); yta.style.setProperty('--my', `${ev.clientY - b.top}px`); }
      const r = $('[data-ring]');
      if (r) {
        const b = r.getBoundingClientRect(); const dx = (ev.clientX - (b.left + b.width / 2)) / innerWidth; const dy = (ev.clientY - (b.top + b.height / 2)) / innerHeight;
        r.style.setProperty('--rx', `${(-dy * 18).toFixed(2)}deg`); r.style.setProperty('--ry', `${(dx * 18).toFixed(2)}deg`);
      }
      const knapp = ev.target.closest && ev.target.closest('.knapp-accent:not(:disabled)');
      if (knapp) { const b = knapp.getBoundingClientRect(); knapp.style.setProperty('--mag-x', `${((ev.clientX - b.left - b.width / 2) * 0.18).toFixed(1)}px`); knapp.style.setProperty('--mag-y', `${((ev.clientY - b.top - b.height / 2) * 0.3).toFixed(1)}px`); }
    };
    document.addEventListener('pointermove', (ev) => { sista = ev; if (!ram) ram = requestAnimationFrame(uppdatera); }, { passive: true });
    document.addEventListener('pointerout', (ev) => {
      const knapp = ev.target.closest && ev.target.closest('.knapp-accent');
      if (knapp && !knapp.contains(ev.relatedTarget)) { knapp.style.removeProperty('--mag-x'); knapp.style.removeProperty('--mag-y'); }
      const yta = ev.target.closest && ev.target.closest('.kort, .valkommen, .kl-hjalte, .summering, .skickat');
      if (yta && !yta.contains(ev.relatedTarget)) { yta.style.removeProperty('--mx'); yta.style.removeProperty('--my'); }
    });
  }

  window.UPPortal = { ring, satRing, startaRing, rakna, konfetti, konfettiFran, panelIn, markera, forstaVisning, toast, lugn };
})();
