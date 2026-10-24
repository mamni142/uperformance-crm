/* Uperformance – väljare i stället för webbläsarens rullgardinslistor (hemsidan och CRM:et).
   Varje <select> får en knapp och en egen lista i samma stil som resten av sidan. Den riktiga
   select-rutan ligger kvar (dold) och får samma värde och samma input/change-händelser –
   så formulär och all befintlig kod fungerar precis som förut. Nya listor (när CRM:et ritar om)
   förbereds automatiskt. Listan öppnas i webbläsarens översta lager (popover), så den hamnar
   rätt även i dialogrutor och i presentationsläget. På mobilen blir den ett ark underifrån. */
(() => {
  'use strict';
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const somArk = () => matchMedia('(max-width: 640px)').matches;
  const harPopover = 'showPopover' in HTMLElement.prototype;
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PIL = '<svg class="valj-pil" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const BOCK = '<svg class="valj-bock" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const SOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  let nr = 0;
  let oppen = null; // { s, k, p, ark, aktiv, filter }
  let sokText = ''; let sokTid = 0;

  // Rubriken till listan: aria-label, etiketten i <label> eller etiketten som pekar på rutan
  function etikettFor(s) {
    if (s.getAttribute('aria-label')) return s.getAttribute('aria-label');
    const l = s.labels && s.labels[0]; if (!l) return '';
    const t = l.querySelector('.etikett, .sr'); if (t && !t.contains(s)) return t.textContent.trim();
    const kopia = l.cloneNode(true); kopia.querySelectorAll('select, button').forEach((x) => x.remove());
    return kopia.textContent.replace(/\s+/g, ' ').trim();
  }

  /* Förbered en select ----------------------------------------------------------------- */
  function forbered(s) {
    if (s.dataset.valj || s.multiple || s.size > 1 || s.hasAttribute('data-nativ')) return;
    s.dataset.valj = String(++nr);
    const overlay = s.classList.contains('anv-valjare'); // användarkortet i CRM:ets sidomeny – hela kortet är knappen
    const k = document.createElement('button');
    k.type = 'button';
    k.className = overlay ? 'valj-knapp valj-overlay' : `valj-knapp ${[...s.classList].join(' ')}`;
    k.id = `valj-knapp-${nr}`;
    // Knappen är en select-only combobox: då läser skärmläsare upp alternativet som aria-activedescendant pekar på
    k.setAttribute('role', 'combobox'); k.setAttribute('aria-haspopup', 'listbox'); k.setAttribute('aria-expanded', 'false');
    k.innerHTML = `<span class="valj-text"></span>${PIL}`;
    if (s.getAttribute('style')) k.setAttribute('style', s.getAttribute('style'));
    s.after(k);
    s.classList.add('valj-dold'); s.tabIndex = -1;
    s._valjKnapp = k; k._valjSelect = s;
    synka(s);
    new MutationObserver(() => synka(s)).observe(s, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    s.addEventListener('change', () => { synka(s); k.removeAttribute('data-ogiltig'); });
    s.addEventListener('focus', () => { if (!s._valjOgiltig) k.focus(); });
    // Formulärvalidering: markera knappen i stället för att fokus hamnar i den dolda rutan
    s.addEventListener('invalid', () => { k.setAttribute('data-ogiltig', ''); s._valjOgiltig = true; setTimeout(() => { s._valjOgiltig = false; k.focus(); }, 60); });
  }
  function synka(s) {
    const k = s._valjKnapp; if (!k) return;
    const o = s.options[s.selectedIndex];
    const t = k.querySelector('.valj-text');
    t.textContent = o ? o.text : '';
    t.toggleAttribute('data-tom', !o || o.value === '');
    k.disabled = s.disabled;
    const etikett = etikettFor(s);
    k.setAttribute('aria-label', `${etikett}${etikett ? ': ' : ''}${o ? o.text : 'inget valt'}`);
    if (oppen && oppen.s === s) { rita(); visaAktiv(); }
  }
  const alla = (rot) => { if (rot.matches && rot.matches('select')) forbered(rot); if (rot.querySelectorAll) rot.querySelectorAll('select').forEach(forbered); };

  /* Öppna, rita, placera, stäng ------------------------------------------------------------ */
  function oppna(s) {
    if (oppen) stang(false);
    const k = s._valjKnapp; if (!k || k.disabled) return;
    const ark = somArk();
    const etikett = etikettFor(s) || 'Välj';
    const p = document.createElement('div');
    p.className = 'valj-panel'; p.id = `valj-lista-${s.dataset.valj}`;
    p.setAttribute('role', 'listbox'); p.setAttribute('aria-label', etikett);
    if (ark) p.setAttribute('data-ark', '');
    if (k.closest('.mote, .sido, .kort-mork, [data-mork-yta]')) p.setAttribute('data-mork', '');
    const sok = s.options.length > 8;
    p.innerHTML = `${ark ? `<div class="valj-ark-titel">${e(etikett)}</div>` : ''}${sok ? `<label class="valj-sok">${SOK}<input type="search" placeholder="Sök…" aria-label="Sök bland alternativen" autocomplete="off" enterkeyhint="done"></label>` : ''}<div class="valj-lista"></div>`;
    (s.closest('dialog, .mote') || document.body).appendChild(p);
    if (harPopover) { p.popover = 'manual'; p.showPopover(); } else p.setAttribute('data-utan-popover', '');
    oppen = { s, k, p, ark, aktiv: s.selectedIndex, filter: '' };
    rita(); placera();
    k.setAttribute('aria-expanded', 'true'); k.setAttribute('aria-controls', p.id);
    const falt = p.querySelector('.valj-sok input');
    if (falt && !ark) { falt.setAttribute('aria-controls', p.id); falt.focus({ preventScroll: true }); }
    visaAktiv(true);
  }
  function rita() {
    const { s, p, filter } = oppen; const lista = p.querySelector('.valj-lista');
    let html = ''; let grupp = null; let rad = 0;
    [...s.options].forEach((o, i) => {
      if (o.hidden || (filter && !o.text.toLowerCase().includes(filter))) return;
      const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
      if (g !== grupp) { grupp = g; if (g) html += `<div class="valj-grupp" role="presentation">${e(g)}</div>`; }
      // "Rubrik · detalj · detalj" visas som rubrik med en mindre rad under
      const [titel, ...rest] = o.text.split(' · ');
      html += `<div class="valj-alt" role="option" id="${p.id}-${i}" data-i="${i}" style="--r:${Math.min(rad++, 12)}" aria-selected="${i === s.selectedIndex}" ${o.disabled ? 'aria-disabled="true"' : ''}><span class="valj-alt-text"><span>${e(titel)}</span>${rest.length ? `<small>${e(rest.join(' · '))}</small>` : ''}</span>${BOCK}</div>`;
    });
    lista.innerHTML = html || '<div class="valj-tom">Inga träffar</div>';
  }
  function placera() {
    if (!oppen || oppen.ark) return;
    const { k, p } = oppen; const r = k.getBoundingClientRect(); const marg = 8;
    if (r.bottom < 0 || r.top > innerHeight) { stang(false); return; }
    p.style.minWidth = `${Math.max(r.width, 210)}px`;
    p.style.maxHeight = 'none';
    const onskad = Math.min(p.scrollHeight, 380);
    const nedan = innerHeight - r.bottom - marg * 2; const ovan = r.top - marg * 2;
    const uppat = nedan < Math.min(onskad, 260) && ovan > nedan;
    p.style.maxHeight = `${Math.max(150, Math.min(380, uppat ? ovan : nedan))}px`;
    p.style.left = `${Math.min(Math.max(8, r.left), innerWidth - p.offsetWidth - 8)}px`;
    if (uppat) { p.style.top = 'auto'; p.style.bottom = `${innerHeight - r.top + marg}px`; p.setAttribute('data-uppat', ''); }
    else { p.style.bottom = 'auto'; p.style.top = `${r.bottom + marg}px`; p.removeAttribute('data-uppat'); }
  }
  const synliga = () => [...oppen.p.querySelectorAll('.valj-alt:not([aria-disabled="true"])')];
  function visaAktiv(forsta) {
    if (!oppen) return;
    const { p, k } = oppen; let aktivEl = null;
    p.querySelectorAll('.valj-alt').forEach((el) => { const a = +el.dataset.i === oppen.aktiv; el.toggleAttribute('data-aktiv', a); if (a) aktivEl = el; });
    if (!aktivEl) { const f = synliga()[0]; if (f) { oppen.aktiv = +f.dataset.i; f.setAttribute('data-aktiv', ''); aktivEl = f; } }
    const fokus = p.querySelector('.valj-sok input') || k;
    if (aktivEl) { fokus.setAttribute('aria-activedescendant', aktivEl.id); aktivEl.scrollIntoView({ block: forsta ? 'center' : 'nearest' }); } else fokus.removeAttribute('aria-activedescendant');
  }
  function flytta(steg) {
    const lista = synliga(); if (!lista.length) return;
    const nu = lista.findIndex((el) => +el.dataset.i === oppen.aktiv);
    const ny = steg === 'forsta' ? 0 : steg === 'sista' ? lista.length - 1 : Math.max(0, Math.min(lista.length - 1, (nu < 0 ? -1 : nu) + steg));
    oppen.aktiv = +lista[ny].dataset.i; visaAktiv();
  }
  function stang(tillbaka = true) {
    if (!oppen) return;
    const { k, p } = oppen; oppen = null;
    k.setAttribute('aria-expanded', 'false'); k.removeAttribute('aria-controls'); k.removeAttribute('aria-activedescendant');
    const bort = () => { try { if (harPopover && p.matches(':popover-open')) p.hidePopover(); } catch (err) { /* ignorera */ } p.remove(); };
    if (lugn) bort(); else { p.setAttribute('data-stanger', ''); setTimeout(bort, p.hasAttribute('data-ark') ? 260 : 150); }
    if (tillbaka && k.isConnected) k.focus({ preventScroll: true });
  }
  function valj(i) {
    if (!oppen) return;
    const { s } = oppen; const o = s.options[i]; if (!o || o.disabled) return;
    const andrad = s.selectedIndex !== i;
    s.selectedIndex = i;
    stang(true); synka(s);
    if (andrad) { s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  /* Händelser -------------------------------------------------------------------------------- */
  document.addEventListener('click', (ev) => {
    const k = ev.target.closest('.valj-knapp');
    if (k) { ev.preventDefault(); if (oppen && oppen.k === k) stang(); else oppna(k._valjSelect); return; }
    const alt = ev.target.closest('.valj-alt');
    if (alt && oppen && oppen.p.contains(alt)) { if (alt.getAttribute('aria-disabled') !== 'true') valj(+alt.dataset.i); return; }
    // Klick på etiketten öppnar listan, precis som på en vanlig ruta
    const l = ev.target.closest('label');
    if (l && !ev.target.closest('input, textarea, a, button, .valj-panel')) {
      const s = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('select');
      if (s && s._valjKnapp && !s._valjKnapp.classList.contains('valj-overlay')) { ev.preventDefault(); s._valjKnapp.focus(); oppna(s); }
    }
  });
  document.addEventListener('pointerdown', (ev) => {
    if (!oppen) return;
    const { p, k } = oppen;
    if (k.contains(ev.target)) return;
    if (p.contains(ev.target) && ev.target !== p) return;
    if (ev.target === p) { const b = p.getBoundingClientRect(); if (ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom) return; }
    stang(false);
  }, true);
  document.addEventListener('pointermove', (ev) => {
    if (!oppen || ev.pointerType !== 'mouse') return;
    const alt = ev.target.closest && ev.target.closest('.valj-alt');
    if (alt && oppen.p.contains(alt) && +alt.dataset.i !== oppen.aktiv && alt.getAttribute('aria-disabled') !== 'true') { oppen.aktiv = +alt.dataset.i; visaAktiv(); }
  });
  document.addEventListener('input', (ev) => {
    if (!oppen || !ev.target.closest('.valj-sok')) return;
    oppen.filter = ev.target.value.trim().toLowerCase(); oppen.aktiv = -1;
    rita(); visaAktiv();
  });
  document.addEventListener('keydown', (ev) => {
    const k = ev.target.closest && ev.target.closest('.valj-knapp');
    if (!oppen) {
      if (k && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(ev.key)) { ev.preventDefault(); oppna(k._valjSelect); }
      return;
    }
    const iSok = ev.target.closest && ev.target.closest('.valj-sok');
    if (!k && !iSok) return;
    switch (ev.key) {
      case 'Escape': ev.preventDefault(); ev.stopImmediatePropagation(); stang(); break;
      case 'ArrowDown': ev.preventDefault(); flytta(1); break;
      case 'ArrowUp': ev.preventDefault(); flytta(-1); break;
      case 'Home': if (!iSok) { ev.preventDefault(); flytta('forsta'); } break;
      case 'End': if (!iSok) { ev.preventDefault(); flytta('sista'); } break;
      case 'PageDown': ev.preventDefault(); flytta(8); break;
      case 'PageUp': ev.preventDefault(); flytta(-8); break;
      case 'Enter': ev.preventDefault(); if (oppen.aktiv >= 0) valj(oppen.aktiv); break;
      case ' ': if (!iSok) { ev.preventDefault(); if (oppen.aktiv >= 0) valj(oppen.aktiv); } break;
      case 'Tab': stang(false); break;
      default:
        // Skriv för att hoppa till ett alternativ (när det inte finns någon sökruta)
        if (!iSok && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
          const nu = Date.now(); sokText = (nu - sokTid > 700 ? '' : sokText) + ev.key.toLowerCase(); sokTid = nu;
          const traff = synliga().find((el) => el.textContent.trim().toLowerCase().startsWith(sokText));
          if (traff) { oppen.aktiv = +traff.dataset.i; visaAktiv(); }
        }
    }
  }, true);
  let ram = 0;
  addEventListener('scroll', (ev) => { if (!oppen || oppen.ark || (ev.target && ev.target.closest && ev.target.closest('.valj-panel'))) return; if (!ram) ram = requestAnimationFrame(() => { ram = 0; placera(); }); }, true);
  addEventListener('resize', () => { if (!oppen) return; if (oppen.ark !== somArk()) stang(false); else placera(); });
  addEventListener('hashchange', () => stang(false));

  /* Start: förbered alla listor nu och alla som ritas senare ------------------------------------ */
  const start = () => {
    alla(document);
    // En öppen lista vars ruta ritats bort (vyn ritades om) stängs – annars stod den kvar och valet gick ingenstans
    new MutationObserver((poster) => { if (oppen && !oppen.s.isConnected) stang(false); for (const post of poster) post.addedNodes.forEach((n) => { if (n.nodeType === 1 && !n.classList.contains('valj-panel')) alla(n); }); })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // form.reset() ändrar rutorna utan change – knapparna visar då samma värde som rutorna igen
  document.addEventListener('reset', (ev) => setTimeout(() => { if (ev.target && ev.target.querySelectorAll) ev.target.querySelectorAll('select').forEach((s) => { if (s._valjKnapp) synka(s); }); }, 0), true);

  window.UPValj = { forbered, stang };
})();
