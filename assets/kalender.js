/* Uperformance – datumväljaren (ersätter webbläsarens kalender för <input type="date">). Delas av hemsidan och CRM:et.
   Rutan ligger kvar och går att skriva i som vanligt (dag, månad, år); webbläsarens egen kalenderknapp göms och vår
   kalender öppnas i stället när man klickar i rutan, trycker mellanslag eller Alt+pil ned. Valet skrivs in i rutan med
   samma input/change-händelser som förut, så formulär och befintlig kod fungerar oförändrat. Nya rutor förbereds
   automatiskt. Kalendern öppnas i webbläsarens översta lager (popover) – rätt även i dialogrutor och i presentationsläget.
   På mobilen blir den ett ark underifrån (och webbläsarens egen väljare stoppas). Veckonummer (ISO) i vänsterkanten.
   Undanta en ruta med data-nativ. Ankare: närmaste [data-kal-ankare] runt rutan (t.ex. Att göra-pillret), annars rutan själv.
   Lördag och söndag är dämpade (data-helg). Valfritt på rutan: data-kal-start (ÅÅÅÅ-MM-DD – där kalendern öppnas när rutan är tom,
   t.ex. önskad vecka) och data-kal-markera (datum med komma emellan som får en prick, t.ex. andra testdagar) med förklaringen i
   data-kal-markera-text. */
(() => {
  'use strict';
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const somArk = () => matchMedia('(max-width: 640px)').matches;
  const harPopover = 'showPopover' in HTMLElement.prototype;
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VECKODAGAR = [['må', 'måndag'], ['ti', 'tisdag'], ['on', 'onsdag'], ['to', 'torsdag'], ['fr', 'fredag'], ['lö', 'lördag'], ['sö', 'söndag']];
  const PIL = (bakat) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${bakat ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'}"/></svg>`;
  let nr = 0;
  let oppen = null; // { i: rutan, k: ankaret, p: panelen, ark, ar, man, fokus: 'ÅÅÅÅ-MM-DD' }

  /* Datum utan tidszonsfel: lokala datum och ISO-text (ÅÅÅÅ-MM-DD, som rutans value) ---------------- */
  const tva = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${tva(d.getMonth() + 1)}-${tva(d.getDate())}`;
  const tolka = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) || d.getDate() !== +m[3] ? null : d; };
  const idag = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const plusDagar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const plusManader = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
  // ISO-veckonummer (måndag första dag, vecka 1 = veckan med 4 januari)
  const vecka = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dag); const ar = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - ar) / 864e5 + 1) / 7); };
  const manadsNamn = (ar, man) => { const t = new Date(ar, man, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const langt = (d) => d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const inom = (i, s) => !(i.min && s < i.min) && !(i.max && s > i.max); // ISO-text jämförs rätt som text

  // Rubriken till arket: aria-label, aria-labelledby eller etiketten runt rutan
  function etikettFor(i) {
    if (i.getAttribute('aria-label')) return i.getAttribute('aria-label');
    const id = i.getAttribute('aria-labelledby'); const via = id && document.getElementById(id); if (via) return via.textContent.trim();
    const l = i.labels && i.labels[0]; if (!l) return 'Datum';
    const t = l.querySelector('.etikett, .sr'); if (t && !t.contains(i)) return t.textContent.trim();
    const kopia = l.cloneNode(true); kopia.querySelectorAll('input, select, button').forEach((x) => x.remove());
    return kopia.textContent.replace(/\s+/g, ' ').trim() || 'Datum';
  }

  /* Förbered en ruta ------------------------------------------------------------------------------ */
  function forbered(i) {
    if (i.dataset.kal || i.hasAttribute('data-nativ')) return;
    i.dataset.kal = String(++nr); i.classList.add('kal-falt');
  }
  const alla = (rot) => { if (rot.matches && rot.matches('input[type="date"]')) forbered(rot); if (rot.querySelectorAll) rot.querySelectorAll('input[type="date"]').forEach(forbered); };

  /* Öppna, rita, placera, stäng -------------------------------------------------------------------- */
  function oppna(i, { fokusera = false } = {}) {
    if (!i || i.disabled || i.readOnly) return;
    if (oppen && oppen.i === i) { if (fokusera) fokuseraDag(); return; }
    if (oppen) stang(false);
    forbered(i);
    const k = i.closest('[data-kal-ankare]') || i;
    const ark = somArk();
    const p = document.createElement('div');
    p.className = 'kal-panel'; p.id = `kal-${i.dataset.kal}`;
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', `${etikettFor(i)} – välj datum`);
    if (ark) p.setAttribute('data-ark', '');
    if (k.closest('.mote, .sido, .kort-mork, [data-mork-yta]')) p.setAttribute('data-mork', '');
    const start = tolka(i.dataset.kalStart || ''); const d = tolka(i.value) || (start && inom(i, iso(start)) ? start : null) || idag();
    oppen = { i, k, p, ark, ar: d.getFullYear(), man: d.getMonth(), fokus: iso(d) };
    p.innerHTML = `${ark ? `<div class="kal-ark-titel">${e(etikettFor(i))}</div>` : ''}
      <div class="kal-huvud"><div class="kal-manad" aria-live="polite"></div><div class="kal-stega"><button type="button" class="kal-steg" data-kal-steg="-1" aria-label="Föregående månad">${PIL(true)}</button><button type="button" class="kal-steg" data-kal-steg="1" aria-label="Nästa månad">${PIL(false)}</button></div></div>
      <div class="kal-rutnat"><div class="kal-rad kal-veckodagar" aria-hidden="true"><span class="kal-v">v.</span>${VECKODAGAR.map(([kort, langtNamn]) => `<span title="${langtNamn}">${kort}</span>`).join('')}</div><div class="kal-dagar"></div></div>
      <div class="kal-fot"><button type="button" class="kal-knapp" data-kal="rensa">Rensa</button>${markerade(i).size ? `<span class="kal-forklaring"><i aria-hidden="true"></i>${e(i.dataset.kalMarkeraText || 'Markerad')}</span>` : ''}<button type="button" class="kal-knapp kal-idag" data-kal="idag">Idag</button></div>`;
    (i.closest('dialog, .mote') || document.body).appendChild(p);
    if (harPopover) { p.popover = 'manual'; p.showPopover(); } else p.setAttribute('data-utan-popover', '');
    rita(); placera();
    i.setAttribute('data-kal-oppen', ''); i.setAttribute('aria-controls', p.id);
    if (fokusera) fokuseraDag();
  }
  const markerade = (i) => new Set(String(i.dataset.kalMarkera || '').split(',').map((x) => x.trim()).filter((x) => tolka(x)));
  function rita(riktning = 0) {
    const { i, p, ar, man } = oppen;
    const mark = markerade(i); const markText = i.dataset.kalMarkeraText || 'Markerad';
    p.querySelector('.kal-manad').textContent = manadsNamn(ar, man);
    const forsta = new Date(ar, man, 1); const start = plusDagar(forsta, -((forsta.getDay() + 6) % 7)); // måndagen i första raden
    const valt = i.value; const nu = iso(idag()); let html = '';
    for (let r = 0; r < 6; r++) { // alltid sex rader – kalendern byter inte höjd mellan månaderna
      const radStart = plusDagar(start, r * 7);
      html += `<div class="kal-rad" style="--r:${r}"><span class="kal-v" aria-hidden="true">${vecka(radStart)}</span>`;
      for (let c = 0; c < 7; c++) {
        const d = plusDagar(radStart, c); const s = iso(d);
        html += `<button type="button" class="kal-dag" data-datum="${s}" tabindex="${s === oppen.fokus ? 0 : -1}" aria-label="${e(langt(d))}${mark.has(s) ? ` – ${e(markText)}` : ''}"${mark.has(s) ? ` title="${e(markText)}" data-markerad` : ''}${c >= 5 ? ' data-helg' : ''}${d.getMonth() !== man ? ' data-annan' : ''}${s === nu ? ' data-idag aria-current="date"' : ''}${s === valt ? ' aria-pressed="true"' : ''}${inom(i, s) ? '' : ' disabled'}>${d.getDate()}</button>`;
      }
      html += '</div>';
    }
    const dagar = p.querySelector('.kal-dagar'); dagar.innerHTML = html;
    if (riktning) dagar.setAttribute('data-riktning', riktning); else dagar.removeAttribute('data-riktning');
    // Stegknapparna slocknar när hela månaden intill ligger utanför min/max; Rensa visas inte för obligatoriska rutor
    p.querySelector('[data-kal-steg="-1"]').disabled = !!i.min && iso(new Date(ar, man, 0)) < i.min;
    p.querySelector('[data-kal-steg="1"]').disabled = !!i.max && iso(new Date(ar, man + 1, 1)) > i.max;
    p.querySelector('[data-kal="idag"]').disabled = !inom(i, nu);
    p.querySelector('[data-kal="rensa"]').hidden = i.required;
  }
  function placera() {
    if (!oppen || oppen.ark) return;
    const { k, p } = oppen; const r = k.getBoundingClientRect(); const marg = 8;
    if (!k.isConnected || r.bottom < 0 || r.top > innerHeight) { stang(false); return; }
    const b = p.offsetWidth; const h = p.offsetHeight;
    const nedan = innerHeight - r.bottom - marg * 2; const ovan = r.top - marg * 2;
    const uppat = nedan < h && ovan > nedan;
    const vanster = r.left + b > innerWidth - 8 ? r.right - b : r.left; // nära högerkanten: ligg kant i kant med ankarets högersida
    p.style.left = `${Math.min(Math.max(8, vanster), innerWidth - b - 8)}px`;
    if (uppat) { p.style.top = 'auto'; p.style.bottom = `${innerHeight - r.top + marg}px`; p.setAttribute('data-uppat', ''); }
    else { p.style.bottom = 'auto'; p.style.top = `${r.bottom + marg}px`; p.removeAttribute('data-uppat'); }
  }
  function fokuseraDag() {
    if (!oppen) return;
    const el = oppen.p.querySelector(`.kal-dag[data-datum="${oppen.fokus}"]:not([disabled])`) || oppen.p.querySelector('.kal-dag:not([data-annan]):not([disabled])');
    if (el) { oppen.p.querySelectorAll('.kal-dag[tabindex="0"]').forEach((x) => { x.tabIndex = -1; }); el.tabIndex = 0; el.focus({ preventScroll: true }); }
  }
  function bytManad(n, behallFokus) {
    if (!oppen) return;
    const d = new Date(oppen.ar, oppen.man + n, 1);
    oppen.ar = d.getFullYear(); oppen.man = d.getMonth();
    if (!behallFokus) { const f = tolka(oppen.fokus) || idag(); const m = plusManader(f, n); oppen.fokus = iso(new Date(oppen.ar, oppen.man, Math.min(f.getDate(), new Date(oppen.ar, oppen.man + 1, 0).getDate()))); void m; }
    const iPanel = oppen.p.contains(document.activeElement);
    rita(n); if (iPanel) fokuseraDag();
  }
  // Flytta fokus i rutnätet (pilar, Home/End, PageUp/PageDown) – byter månad när man går utanför den som visas
  function flyttaFokus(nyttDatum) {
    if (!oppen) return;
    // Inom rutans min och max – PageDown förbi gränsen stannar på sista tillåtna dagen (fokus tappades annars till body)
    const ruta = oppen.i; const grans = (v) => (v ? new Date(`${v}T12:00:00`) : null);
    const min = ruta && grans(ruta.min); const max = ruta && grans(ruta.max);
    if (min && nyttDatum < min) nyttDatum = min; if (max && nyttDatum > max) nyttDatum = max;
    const s = iso(nyttDatum); oppen.fokus = s;
    if (nyttDatum.getFullYear() !== oppen.ar || nyttDatum.getMonth() !== oppen.man) {
      const n = (nyttDatum.getFullYear() - oppen.ar) * 12 + nyttDatum.getMonth() - oppen.man;
      oppen.ar = nyttDatum.getFullYear(); oppen.man = nyttDatum.getMonth(); rita(Math.sign(n));
    }
    fokuseraDag();
  }
  function stang(tillbaka = true) {
    if (!oppen) return;
    const { i, p } = oppen; oppen = null;
    i.removeAttribute('data-kal-oppen'); i.removeAttribute('aria-controls');
    const bort = () => { try { if (harPopover && p.matches(':popover-open')) p.hidePopover(); } catch (err) { /* ignorera */ } p.remove(); };
    if (lugn) bort(); else { p.setAttribute('data-stanger', ''); setTimeout(bort, p.hasAttribute('data-ark') ? 260 : 150); }
    if (tillbaka && i.isConnected) i.focus({ preventScroll: true });
  }
  function valj(s) {
    if (!oppen) return;
    const { i } = oppen; if (s && !inom(i, s)) return;
    const andrad = i.value !== s;
    i.value = s; stang(true);
    if (andrad) { i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  /* Händelser ------------------------------------------------------------------------------------- */
  const rutan = (t) => { const i = t && t.closest && t.closest('input[type="date"]'); return i && i.dataset.kal && !i.hasAttribute('data-nativ') ? i : null; };
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (oppen && oppen.p.contains(t)) {
      const dag = t.closest('.kal-dag'); if (dag) { if (!dag.disabled) valj(dag.dataset.datum); return; }
      const steg = t.closest('[data-kal-steg]'); if (steg) { bytManad(+steg.dataset.kalSteg); return; }
      const kn = t.closest('[data-kal]'); if (kn && !kn.disabled) valj(kn.dataset.kal === 'idag' ? iso(idag()) : '');
      return;
    }
    const i = rutan(t); if (!i) return;
    if (somArk()) ev.preventDefault(); // mobil: webbläsarens egen väljare ska inte öppnas ovanpå arket
    if (oppen && oppen.i === i) stang(false); else oppna(i);
  });
  document.addEventListener('pointerdown', (ev) => {
    if (somArk() && rutan(ev.target)) ev.preventDefault(); // mobil: ingen fokus och inget tangentbord – arket är väljaren
    if (!oppen) return;
    const { p, k, i } = oppen;
    if (k.contains(ev.target) || i.contains(ev.target)) return;
    if (p.contains(ev.target) && ev.target !== p) return;
    if (ev.target === p) { const b = p.getBoundingClientRect(); if (ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom) return; }
    stang(false);
  }, true);
  // Skriver man i rutan (eller byter dag med pilarna i Att göra-pillret) följer kalendern med
  document.addEventListener('input', (ev) => {
    if (!oppen || ev.target !== oppen.i) return;
    const d = tolka(oppen.i.value); if (d) { oppen.ar = d.getFullYear(); oppen.man = d.getMonth(); oppen.fokus = iso(d); }
    rita();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey) return;
    const i = rutan(ev.target);
    if (i) {
      if (ev.key === ' ' || (ev.altKey && ev.key === 'ArrowDown')) { ev.preventDefault(); oppna(i, { fokusera: true }); return; }
      if (!oppen || oppen.i !== i) return;
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); stang(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') stang(false); // Enter skickar formuläret som vanligt
      return;
    }
    if (!oppen || !oppen.p.contains(ev.target)) return;
    const dag = ev.target.closest('.kal-dag'); const f = tolka(oppen.fokus) || idag();
    switch (ev.key) {
      case 'Escape': ev.preventDefault(); ev.stopImmediatePropagation(); stang(); break;
      case 'Tab': ev.preventDefault(); stang(); break;
      case 'ArrowLeft': if (dag) { ev.preventDefault(); flyttaFokus(plusDagar(f, -1)); } break;
      case 'ArrowRight': if (dag) { ev.preventDefault(); flyttaFokus(plusDagar(f, 1)); } break;
      case 'ArrowUp': if (dag) { ev.preventDefault(); flyttaFokus(plusDagar(f, -7)); } break;
      case 'ArrowDown': if (dag) { ev.preventDefault(); flyttaFokus(plusDagar(f, 7)); } break;
      case 'Home': if (dag) { ev.preventDefault(); flyttaFokus(plusDagar(f, -((f.getDay() + 6) % 7))); } break;
      case 'End': if (dag) { ev.preventDefault(); flyttaFokus(plusDagar(f, 6 - (f.getDay() + 6) % 7)); } break;
      case 'PageUp': ev.preventDefault(); flyttaFokus(plusManader(f, ev.shiftKey ? -12 : -1)); break;
      case 'PageDown': ev.preventDefault(); flyttaFokus(plusManader(f, ev.shiftKey ? 12 : 1)); break;
      default:
    }
  }, true);
  let ram = 0;
  addEventListener('scroll', (ev) => { if (!oppen || oppen.ark || (ev.target && ev.target.closest && ev.target.closest('.kal-panel'))) return; if (!ram) ram = requestAnimationFrame(() => { ram = 0; placera(); }); }, true);
  addEventListener('resize', () => { if (!oppen) return; if (oppen.ark !== somArk()) stang(false); else placera(); });
  addEventListener('hashchange', () => stang(false));

  /* Start: förbered alla datumrutor nu och alla som ritas senare; stäng om rutan försvinner ------------ */
  const start = () => {
    alla(document);
    new MutationObserver((poster) => {
      for (const post of poster) post.addedNodes.forEach((n) => { if (n.nodeType === 1 && !n.classList.contains('kal-panel')) alla(n); });
      if (oppen && !oppen.i.isConnected) stang(false);
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.UPKalender = { oppna, stang, forbered };
})();
