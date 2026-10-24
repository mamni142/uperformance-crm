/* Uperformance CRM – filskannern (2026-10-23). Varje fil som laddas upp i CRM:et (alla filfält och släppytor, även chatten)
   kontrolleras i webbläsaren innan koden som tar emot den får den: namnet (farliga och dubbla filändelser, dolda riktningstecken),
   storleken, innehållet mot filtypen (filsignaturen i de första byten), körbar kod (Windows, Linux, Mac), skript i HTML/SVG,
   makron och program i Office-/zip-filer, JavaScript och startåtgärder i PDF, formler som kör kommandon i CSV och EICAR-
   testsignaturen. Blockerade filer når aldrig CRM:et; varningar släpps igenom med en markering. Reglerna står i filregler.js
   (2026-10-24) – samma regler kör servern på varje uppladdad fil, så kontrollen gäller även om webbläsaren kringgås. CSV:
   formler som kör program (cmd|, DDE) stoppas, formler mot webben ger en varning och andra formler en låg varning.
   I skarp drift ska servern dessutom skanna med ett antivirusprogram innan filen sparas (server/FLYTT.md).
   Laddas före crm.js så att lyssnarna (capture) går först: filfältet får bara de godkända filerna och ett nytt change-event,
   släppytan ett nytt drop-event. Panelen nere till höger visar förloppet per fil. Händelsen up-filskanning (detail: resultaten)
   loggas av säkerhetshubben. API: window.UPFilskanner = { skanna(fil), granska(filer) → godkända filer, resultat(fil) }. */
(() => {
  'use strict';
  // Reglerna finns i filregler.js (samma på servern) – utan dem stoppas allt hellre än att släppas igenom okontrollerat
  const R = window.UPFilregler || null;
  const MAX = R ? R.MAX : 25 * 1024 * 1024;
  const STEG = ['Namn och storlek', 'Filtyp och signatur', 'Körbar kod och makron', 'Skript och testvirus', 'Fingeravtryck (SHA-256)'];
  const storlek = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString('sv-SE')} kB`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ikon = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;
  const reducerad = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paus = () => new Promise((r) => setTimeout(r, reducerad() ? 20 : 150 + Math.random() * 120));
  const resultat = new WeakMap();
  // Skarpt läge: servern jämför filtypen med innehållet och tar inte emot en fil som inte stämmer – säg det redan här
  const skarp = () => !!(window.UPLager && window.UPLager.skarp);

  async function skanna(fil, vidSteg = () => {}) {
    const fynd = [];
    const namn = String(fil.name || 'fil');
    if (!R) fynd.push({ allvar: 'blockera', text: 'Filkontrollen kunde inte laddas – ladda om sidan och försök igen' });
    vidSteg(0, STEG[0]);
    if (R) fynd.push(...R.namnFynd(namn, fil.size));
    await paus();
    vidSteg(1, STEG[1]);
    let huvud = new Uint8Array(0);
    try { huvud = new Uint8Array(await fil.slice(0, 4096).arrayBuffer()); } catch (err) { fynd.push({ allvar: 'blockera', text: 'Filen gick inte att läsa' }); }
    if (R) { if (skarp()) fynd.push(...R.typFynd(String(fil.type || '').split(';')[0].trim().toLowerCase(), namn, huvud)); fynd.push(...R.signaturFynd(namn, huvud, fil.size)); }
    await paus();
    vidSteg(2, STEG[2]);
    let zip = '';
    if (huvud[0] === 0x50 && huvud[1] === 0x4b) {
      // zip-baserat (Office m.fl.): filnamnen i arkivet ligger okomprimerade – leta efter makron och program
      try { zip = R.latin1(new Uint8Array(await fil.slice(0, Math.min(fil.size, 8 * 1024 * 1024)).arrayBuffer())); } catch (err) { /* läsfel hanteras ovan */ }
    }
    if (R) fynd.push(...R.kodFynd(namn, huvud, zip));
    await paus();
    vidSteg(3, STEG[3]);
    let innehall = '';
    try { innehall = R ? R.latin1(new Uint8Array(await fil.slice(0, Math.min(fil.size, 3 * 1024 * 1024)).arrayBuffer())) : ''; } catch (err) { /* hanterat */ }
    if (R) fynd.push(...R.innehallFynd(namn, innehall, String(fil.type || '').split(';')[0].trim().toLowerCase()));
    await paus();
    vidSteg(4, STEG[4]);
    let hash = '';
    try { if (window.crypto && crypto.subtle && fil.size <= MAX) { const d = await crypto.subtle.digest('SHA-256', await fil.arrayBuffer()); hash = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); } } catch (err) { /* ingen säker kontext */ }
    const sedda = new Set(); const unika = fynd.filter((x) => { const k = x.allvar + x.text; if (sedda.has(k)) return false; sedda.add(k); return true; });
    const status = unika.some((x) => x.allvar === 'blockera') ? 'blockerad' : unika.length ? 'varning' : 'ren';
    const svar = { namn, storlek: fil.size, typ: fil.type || '', status, fynd: unika, hash, tid: new Date().toISOString() };
    try { resultat.set(fil, svar); } catch (err) { /* ok */ }
    return svar;
  }

  /* panelen: ett kort per fil med ring, stegen och resultatet */
  let panel = null;
  function nyttKort(fil) {
    if (!panel || !panel.isConnected) { panel = document.createElement('div'); panel.className = 'fs-panel'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite'); if ('showPopover' in panel) panel.setAttribute('popover', 'manual'); document.body.appendChild(panel); }
    // översta lagret (popover): syns även över ett öppet ark – visas om så att panelen hamnar över det senast öppnade
    try { if (panel.hasAttribute('popover')) { if (panel.matches(':popover-open')) panel.hidePopover(); panel.showPopover(); } } catch (err) { /* ok */ }
    const el = document.createElement('article');
    el.className = 'fs-kort'; el.setAttribute('data-lage', 'kor'); el.setAttribute('data-mork-yta', ''); el.style.setProperty('--p', '0');
    el.innerHTML = `<span class="fs-ring" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="fs-spar"/><circle cx="22" cy="22" r="19" class="fs-bage" pathLength="100"/></svg><span class="fs-ikon">${ikon('skanna')}</span></span>
      <div class="fs-text"><span class="fs-rubrik"><strong title="${esc(fil.name)}">${esc(fil.name)}</strong><small>${esc(storlek(fil.size))}</small></span>
        <span class="fs-steg" data-fs-steg>Startar virusskanningen …</span>
        <ul class="fs-stegrad" aria-hidden="true">${STEG.map(() => '<li></li>').join('')}</ul>
        <ul class="fs-fynd" hidden></ul></div>
      <button type="button" class="fs-stang" aria-label="Stäng">${ikon('stang')}</button>`;
    el.querySelector('.fs-stang').addEventListener('click', () => stang(el));
    panel.appendChild(el);
    return el;
  }
  function stang(el) { if (!el.isConnected || el.hasAttribute('data-stanger')) return; el.setAttribute('data-stanger', ''); setTimeout(() => { el.remove(); if (panel && !panel.children.length) { panel.remove(); panel = null; } }, 320); }
  function visaSteg(el, i, text) {
    el.style.setProperty('--p', String((i + 0.5) / STEG.length));
    const s = el.querySelector('[data-fs-steg]'); if (s) s.textContent = `${text} …`;
    el.querySelectorAll('.fs-stegrad li').forEach((li, j) => { li.toggleAttribute('data-klar', j < i); li.toggleAttribute('data-nu', j === i); });
  }
  function visaSvar(el, r) {
    el.style.setProperty('--p', '1'); el.setAttribute('data-lage', r.status);
    el.querySelectorAll('.fs-stegrad li').forEach((li) => { li.setAttribute('data-klar', ''); li.removeAttribute('data-nu'); });
    el.querySelector('.fs-ikon').innerHTML = ikon(r.status === 'ren' ? 'skold' : r.status === 'varning' ? 'varning' : 'skold-larm');
    const baraLag = r.status === 'varning' && r.fynd.every((x) => x.allvar === 'lag');
    el.querySelector('[data-fs-steg]').textContent = r.status === 'ren' ? 'Ren – inga hot hittades' : baraLag ? 'Släppt igenom – en sak att känna till' : r.status === 'varning' ? 'Släppt igenom med varning' : 'Stoppad – laddas inte upp';
    if (r.fynd.length) { const ul = el.querySelector('.fs-fynd'); ul.hidden = false; ul.innerHTML = r.fynd.map((x) => `<li data-allvar="${x.allvar}">${esc(x.text)}</li>`).join(''); }
    setTimeout(() => stang(el), r.status === 'ren' ? 2400 : r.status === 'varning' ? 7000 : 14000);
  }

  // Granskar filerna (en i taget, med panel) och ger tillbaka de som får laddas upp
  async function granska(filer, { kalla = 'uppladdning', visa = true } = {}) {
    const lista = [...filer]; const svar = [];
    for (const fil of lista) {
      const el = visa ? nyttKort(fil) : null;
      const r = await skanna(fil, (i, text) => { if (el) visaSteg(el, i, text); });
      if (el) visaSvar(el, r);
      svar.push(r);
    }
    try { document.dispatchEvent(new CustomEvent('up-filskanning', { detail: { kalla, resultat: svar } })); } catch (err) { /* ok */ }
    return lista.filter((f, i) => svar[i].status !== 'blockerad');
  }

  /* filfälten: change fångas först, filerna granskas och fältet får ett nytt change-event med bara de godkända */
  const KLAR = new WeakSet();
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'file' || !t.files || !t.files.length || KLAR.has(ev) || t.hasAttribute('data-fs-av')) return;
    ev.stopImmediatePropagation();
    const kalla = t.closest('[data-ch-rum]') ? 'chatt' : t.hasAttribute('data-lp-bild') ? 'profilbild' : t.hasAttribute('data-adm-import') ? 'import' : 'uppladdning';
    granska(t.files, { kalla }).then((ok) => {
      if (!t.isConnected) return;
      if (!ok.length) { t.value = ''; return; }
      try { const dt = new DataTransfer(); ok.forEach((f) => dt.items.add(f)); t.files = dt.files; } catch (err) { /* äldre webbläsare: filerna går vidare som de är */ }
      const nytt = new Event('change', { bubbles: true }); KLAR.add(nytt); t.dispatchEvent(nytt);
    });
  }, true);
  /* släppytorna (dokument och chatten): samma sak för drop */
  const ZON = '[data-uppladdning], [data-ch-slapp]';
  document.addEventListener('drop', (ev) => {
    if (KLAR.has(ev) || !ev.dataTransfer || !ev.dataTransfer.files || !ev.dataTransfer.files.length) return;
    const zon = ev.target.closest && ev.target.closest(ZON); if (!zon) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    const mal = ev.target; const filer = [...ev.dataTransfer.files];
    zon.removeAttribute('data-drag');
    granska(filer, { kalla: zon.matches('[data-ch-slapp]') ? 'chatt' : 'uppladdning' }).then((ok) => {
      if (!ok.length || !mal.isConnected) return;
      const dt = new DataTransfer(); ok.forEach((f) => dt.items.add(f));
      const nytt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }); KLAR.add(nytt); mal.dispatchEvent(nytt);
    });
  }, true);

  window.UPFilskanner = { skanna, granska, resultat: (fil) => resultat.get(fil) || null, STEG, max: MAX };
})();
