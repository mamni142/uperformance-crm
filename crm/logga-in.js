/* Uperformance – inloggningssidan.
   Demoläget: logga in som demoroll utan lösenord. Rollen sparas i webbläsaren (up-crm-inloggad + up-crm-jag)
   och CRM:et släpper in den som är inloggad.
   Skarpt läge (node server/server.js): e-postadress → engångskod (6 siffror) → sessionskaka från servern.
   Lokalt skickas ingen e-post – koden skrivs i serverns konsol och i server/data/utkorg/. */
(() => {
  'use strict';
  const L = window.UPLager;
  const SKARP = !!(L && L.skarp);
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  // Vart man var på väg i CRM:et – bara interna vägar (#/…), aldrig en extern adress
  const nasta = /^#\/[\w/-]*$/.test(q.get('nasta') || '') ? q.get('nasta') : '';
  const lasInloggad = () => { try { return JSON.parse(localStorage.getItem('up-crm-inloggad') || 'null'); } catch (err) { return null; } };

  // Redan inloggad: direkt in i CRM:et (som Kaster). Efter utloggning visas sidan med en bekräftelse.
  if ((SKARP ? L.inloggad() : lasInloggad()) && !q.has('utloggad')) { location.replace('./' + nasta); return; }

  $('[data-ar]').textContent = new Date().getFullYear();

  // Hälsning efter tid på dygnet (samma gränser som översikten i CRM:et)
  const tim = new Date().getHours();
  const halsning = tim < 5 ? 'God natt' : tim < 10 ? 'God morgon' : tim < 17 ? 'Hej' : 'God kväll'; // samma som översikten i CRM:et
  document.querySelectorAll('[data-li-halsning]').forEach((el) => { el.textContent = halsning; });

  function toast(text) {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = `<svg class="ikon" aria-hidden="true"><use href="#i-bock"/></svg><span>${e(text)}</span>`;
    $('[data-toaster]').appendChild(t);
    setTimeout(() => { t.setAttribute('data-ut', ''); setTimeout(() => t.remove(), 320); }, 3200);
  }
  if (q.has('utloggad')) { toast('Du är utloggad'); history.replaceState(null, '', location.pathname); }

  // Gemensam utgång: tona ut sidan och gå in i CRM:et (testteamet börjar i sina projekt, sälj på översikten)
  let valt = false;
  function ganIn(roll) {
    setTimeout(() => document.body.setAttribute('data-lamnar', ''), lugn ? 0 : 380);
    setTimeout(() => { location.href = './' + (nasta || (roll === 'test' ? '#/projekt' : '')); }, lugn ? 0 : 950); // admin börjar på kontrollcentralen (#/)
  }

  if (!SKARP) {
    // Den roll man senast var inloggad som (demo) får en liten "Senast"-bricka
    let senast = null;
    try { senast = localStorage.getItem('up-crm-jag'); } catch (err) { /* privat läge */ }
    const senastKort = ['gs', 'ma', 'dr', 'ad'].includes(senast) && document.querySelector(`[data-roll="${senast}"]`);
    const bricka = senastKort && $('[data-li-senast]', senastKort); if (bricka) bricka.hidden = false;

    // Logga in som demokonto: markera raden (eller knappen), tona ut sidan och gå in i CRM:et
    function loggaInSom(id, roll, markera) {
      if (valt) return; valt = true;
      try {
        localStorage.setItem('up-crm-jag', id);
        localStorage.setItem('up-crm-inloggad', JSON.stringify({ id, tid: new Date().toISOString(), demo: true }));
      } catch (err) { /* privat läge – CRM:et släpper då in ändå */ }
      if (markera) markera.setAttribute(markera.matches('.li-knapp') ? 'data-klar' : 'data-valjer', '');
      ganIn(roll);
    }
    const ROLL = { gs: 'salj', ma: 'salj', dr: 'test', ad: 'admin' }; // Gustav och Magnus är säljare
    document.addEventListener('click', (ev) => { const knapp = ev.target.closest('[data-roll]'); if (knapp) loggaInSom(knapp.dataset.roll, ROLL[knapp.dataset.roll] || 'salj', knapp); });
    // E-post i demon: demokontonas adresser (förslag i listan) loggar in direkt – inget lösenord och ingen kod i demoläget
    const demoForm = $('[data-li-demo]');
    if (demoForm) {
      const aktiv = (u) => u.aktiv !== false && u.aktiv !== 0; // samma som arAktiv i crm.js
      const konton = () => { const d = exempel(); return ((d && d.anvandare) || []).filter((u) => u.epost && aktiv(u)); };
      const lista = $('[data-li-demo-adresser]'); if (lista) lista.innerHTML = konton().map((u) => `<option value="${e(u.epost)}">${e(u.namn)}</option>`).join('');
      const fel = $('[data-li-demo-fel]'); const falt = $('[data-li-demo-epost]');
      const visa = (text) => { $('span', fel).textContent = text; fel.hidden = !text; if (text) falt.setAttribute('aria-invalid', 'true'); else falt.removeAttribute('aria-invalid'); };
      falt.addEventListener('input', () => visa(''));
      demoForm.addEventListener('submit', (ev) => {
        ev.preventDefault(); if (valt) return;
        const v = falt.value.trim().toLowerCase();
        if (!v) { visa('Skriv e-postadressen till ett demokonto – eller välj ett konto nedan.'); falt.focus(); return; }
        const alla = ((exempel() || {}).anvandare || []);
        if (alla.some((x) => x.epost && x.epost.toLowerCase() === v && !aktiv(x))) { visa('Kontot är inaktiverat. Kontakta administratören.'); falt.focus(); falt.select(); return; }
        const u = konton().find((x) => x.epost.toLowerCase() === v);
        if (!u) { visa('Ingen demoanvändare har den adressen. Välj ett konto nedan.'); falt.focus(); falt.select(); return; }
        const rad = document.querySelector(`[data-roll="${u.id}"]`); if (rad) rad.setAttribute('data-valjer', '');
        loggaInSom(u.id, u.roll === 'test' ? 'test' : u.roll === 'admin' ? 'admin' : 'salj', $('[data-li-demo-knapp]'));
      });
    }
    // Tangenterna 1–4 väljer konto (inte när man skriver någonstans)
    document.addEventListener('keydown', (ev) => {
      if (valt || ev.ctrlKey || ev.metaKey || ev.altKey || (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]'))) return;
      const kort = { 1: 'gs', 2: 'ma', 3: 'dr', 4: 'ad' }[ev.key]; const k = kort && document.querySelector(`[data-roll="${kort}"]`);
      if (k) { ev.preventDefault(); k.focus({ preventScroll: true }); k.click(); }
    });
  } else startaSkarp();

  // Tillbaka med bakåtknappen: visa sidan igen i stället för den urtonade
  addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    if (SKARP) { location.reload(); return; } // skarpt läge: kontrollera inloggningen på nytt hos servern i stället för ett fruset kodsteg
    valt = false; document.body.removeAttribute('data-lamnar');
    document.querySelectorAll('[data-valjer]').forEach((k) => k.removeAttribute('data-valjer'));
    const kn = $('[data-li-knapp-kod]'); if (kn) { kn.removeAttribute('data-klar'); kn.disabled = false; }
    const dk = $('[data-li-demo-knapp]'); if (dk) dk.removeAttribute('data-klar');
    const rutor = $('.li-rutor'); if (rutor) rutor.removeAttribute('data-klar');
  });

  /* Skarpt läge: e-post och engångskod ------------------------------------------------- */
  function startaSkarp() {
    const form = $('[data-li-form]'); if (!form) return;
    const falt = { epost: $('[data-li-epost]'), kod: $('[data-li-kod]') };
    const felRuta = $('[data-li-fel]');
    const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/; // samma mönster som EPOST_MONSTER i data.js
    const KOD_GILTIG_S = 10 * 60; // samma som KOD_GILTIG i server/auth.js
    const NY_KOD_VANTA_S = 20; // "Skicka en ny kod" vilar en stund – servern tillåter 3 koder per 15 min
    const INGEN_KOD_S = 30; // tips om stavning om ingen har loggat in efter en halv minut
    let steg = 'epost'; let epost = ''; let skickar = false;

    const miljo = L.lage.miljo;
    const eyebrow = $('[data-li-eyebrow]');
    if (eyebrow) eyebrow.textContent = miljo === 'lokal' ? 'Lokal testmiljö' : miljo === 'test' ? 'Testmiljö' : 'Uperformance CRM';
    if (miljo === 'lokal') $('[data-li-konsol]').hidden = false;
    // Hälsoformuläret är avstängt i skarpt läge som standard – dölj exempellänken dit
    const halsa = $('[data-li-halsa]'); if (halsa && !L.lage.halsoformular) halsa.hidden = true;

    /* De sex rutorna visar det som står i det (osynliga) inmatningsfältet */
    const rutorEl = $('.li-rutor', form);
    const rutor = rutorEl ? [...rutorEl.querySelectorAll('i')] : [];
    function ritaKod() {
      if (!rutor.length) return;
      const v = falt.kod.value; const fokus = document.activeElement === falt.kod;
      const start = falt.kod.selectionStart ?? v.length; const slut = falt.kod.selectionEnd ?? v.length;
      const markerat = fokus && slut > start;
      rutor.forEach((r, i) => {
        const siffra = v[i] || '';
        if (r.textContent !== siffra) {
          r.textContent = siffra;
          if (siffra) { r.removeAttribute('data-fylld'); void r.offsetWidth; } // starta om den lilla studsen
        }
        r.toggleAttribute('data-fylld', !!siffra);
        r.toggleAttribute('data-aktiv', fokus && !markerat && i === Math.min(start, rutor.length - 1));
        r.toggleAttribute('data-vald', markerat && i >= start && i < slut);
      });
    }
    const markeraFel = (pa) => {
      if (!rutorEl) return;
      rutorEl.removeAttribute('data-fel');
      if (pa) { void rutorEl.offsetWidth; rutorEl.setAttribute('data-fel', ''); }
    };
    ['focus', 'blur', 'keyup', 'click', 'select'].forEach((h) => falt.kod.addEventListener(h, ritaKod));
    document.addEventListener('selectionchange', () => { if (document.activeElement === falt.kod) ritaKod(); });

    /* Nedräkning: koden gäller i 10 minuter från att den skickades */
    const giltig = $('[data-li-giltig]'); const giltigText = $('[data-li-giltig-text]'); const stapel = $('[data-li-stapel]');
    const nyKod = form.querySelector('[data-li="ny-kod"]'); const ingenKod = $('[data-li-ingenkod]');
    let kodSkickad = 0; let tickare = 0; let kodSlut = false; // kodSlut: servern säger att koden inte gäller längre
    const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    function tick() {
      if (!kodSkickad || !giltig) return;
      const gatt = (Date.now() - kodSkickad) / 1000;
      const kvar = kodSlut ? 0 : Math.max(0, Math.ceil(KOD_GILTIG_S - gatt));
      if (kvar > 0) {
        const b = document.createElement('b'); b.textContent = mmss(kvar);
        giltigText.replaceChildren('Koden gäller i ', b);
      } else giltigText.textContent = kodSlut ? 'Koden gäller inte längre – skicka en ny kod.' : 'Koden har gått ut – skicka en ny kod.';
      giltig.dataset.lage = kvar === 0 ? 'ute' : kvar <= 60 ? 'snart' : '';
      stapel.style.transform = `scaleX(${(kvar / KOD_GILTIG_S).toFixed(4)})`;
      if (!skickar) {
        const vila = Math.max(0, Math.ceil(NY_KOD_VANTA_S - gatt));
        nyKod.disabled = vila > 0;
        nyKod.textContent = vila > 0 ? `Skicka en ny kod (${vila})` : 'Skicka en ny kod';
      }
      nyKod.toggleAttribute('data-viktig', kvar === 0); form.toggleAttribute('data-kod-ute', kvar === 0);
      if (ingenKod) ingenKod.hidden = !(gatt >= INGEN_KOD_S && kvar > 0);
      if (kvar === 0 && gatt >= NY_KOD_VANTA_S) stoppaNedrakning(true);
    }
    function startaNedrakning() {
      stoppaNedrakning();
      kodSkickad = Date.now(); kodSlut = false;
      if (stapel) { stapel.style.transition = 'none'; stapel.style.transform = 'scaleX(1)'; void stapel.offsetWidth; stapel.style.transition = ''; }
      tick(); tickare = setInterval(tick, 1000);
    }
    function stoppaNedrakning(behall) {
      clearInterval(tickare); tickare = 0;
      if (!behall) { kodSkickad = 0; form.removeAttribute('data-kod-ute'); nyKod.disabled = false; nyKod.textContent = 'Skicka en ny kod'; nyKod.removeAttribute('data-viktig'); if (ingenKod) ingenKod.hidden = true; }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    const visaFel = (text) => { $('span', felRuta).textContent = text; felRuta.hidden = !text; };
    // Utloggad av servern (CRM:et skickar med orsaken): säg varför i stället för att bara visa inloggningen
    const ORSAK_TEXT = { inaktiverad: 'Ditt konto har inaktiverats – kontakta administratören.', 'utloggad-av-admin': 'En administratör har loggat ut dig. Logga in igen med en ny kod.' };
    if (ORSAK_TEXT[q.get('orsak')]) visaFel(ORSAK_TEXT[q.get('orsak')]);
    const visaSteg = (nytt) => {
      steg = nytt;
      document.querySelectorAll('[data-li-steg]').forEach((s) => { s.hidden = s.dataset.liSteg !== nytt; });
      if (nytt === 'kod') { $('[data-li-till]').textContent = epost; falt.kod.value = ''; markeraFel(false); falt.kod.focus(); ritaKod(); } else { stoppaNedrakning(); falt.epost.focus(); }
    };
    const vantaText = (sek) => { const m = Math.ceil((Number(sek) || 60) / 60); return m <= 1 ? 'en minut' : `${m} minuter`; };
    const feltext = (svar) => {
      switch (svar.fel) {
        case 'natverk': return 'Kunde inte nå servern. Kontrollera att den är igång och försök igen.';
        case 'ogiltig': return 'E-postadressen ser inte rätt ut.';
        case 'for-manga-forsok': return `För många försök. Vänta ${vantaText(svar.vantaSek)} och försök igen.`;
        case 'fel-kod': return Number.isFinite(svar.kvar) && svar.kvar > 0 ? `Fel kod – ${svar.kvar} försök kvar.` : 'Fel kod. Begär en ny kod.';
        case 'kod-utgangen': return 'Koden har gått ut eller använts för många gånger. Begär en ny kod.';
        default: return svar.meddelande || 'Något gick fel. Försök igen.';
      }
    };
    const lasKnappar = (las) => { form.querySelectorAll('button').forEach((b) => { b.disabled = las; }); if (!las) tick(); };

    async function begar(varde = falt.epost.value.trim()) {
      if (!EPOST.test(varde)) { visaFel('Skriv en giltig e-postadress, t.ex. namn@foretag.se.'); falt.epost.setAttribute('aria-invalid', 'true'); falt.epost.focus(); return; }
      falt.epost.removeAttribute('aria-invalid');
      skickar = true; lasKnappar(true); visaFel('');
      const svar = await L.begarKod(varde);
      skickar = false; lasKnappar(false);
      if (!svar.ok) { visaFel(feltext(svar)); return; }
      epost = varde; visaSteg('kod'); startaNedrakning();
      toast(miljo === 'lokal' ? 'Koden finns i serverns konsol' : 'Koden är skickad – kolla din e-post');
    }
    async function verifiera() {
      const kod = falt.kod.value.replace(/\s/g, '');
      if (!/^\d{6}$/.test(kod)) { visaFel('Koden består av 6 siffror.'); falt.kod.setAttribute('aria-invalid', 'true'); markeraFel(true); falt.kod.focus(); return; }
      falt.kod.removeAttribute('aria-invalid');
      skickar = true; lasKnappar(true); visaFel('');
      const svar = await L.loggaIn(epost, kod);
      if (!svar.ok) {
        skickar = false; lasKnappar(false); visaFel(feltext(svar));
        if (svar.fel === 'fel-kod') { falt.kod.focus(); falt.kod.select(); falt.kod.setAttribute('aria-invalid', 'true'); markeraFel(true); ritaKod(); }
        if (svar.fel === 'kod-utgangen' || (svar.fel === 'fel-kod' && svar.kvar === 0)) { kodSlut = true; markeraFel(true); tick(); }
        return;
      }
      valt = true; stoppaNedrakning(true);
      const knapp = $('[data-li-knapp-kod]'); knapp.setAttribute('data-klar', '');
      if (rutorEl) rutorEl.setAttribute('data-klar', '');
      ganIn(svar.jag && svar.jag.roll);
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (skickar || valt) return;
      if (steg === 'epost') begar(); else verifiera();
    });
    // Sex siffror inskrivna (eller inklistrade, även "123 456") – logga in direkt
    falt.kod.addEventListener('input', () => {
      const ren = falt.kod.value.replace(/\D/g, '').slice(0, 6);
      if (ren !== falt.kod.value) falt.kod.value = ren;
      markeraFel(false); falt.kod.removeAttribute('aria-invalid');
      ritaKod();
      if (ren.length === 6 && !skickar && !valt) verifiera();
    });
    form.addEventListener('click', (ev) => {
      const k = ev.target.closest('[data-li]'); if (!k || skickar) return;
      if (k.dataset.li === 'byt-epost') { visaFel(''); visaSteg('epost'); falt.epost.select(); }
      if (k.dataset.li === 'ny-kod' && !k.disabled) begar(epost);
    });
    if (!matchMedia('(max-width: 640px)').matches) falt.epost.focus();
  }

  /* Exempeldatan i hjälten och på kontona ------------------------------------------------------------------------- */
  // Demo: samma data som CRM:et i den här webbläsaren (om versionen stämmer), annars ny exempeldata. Skarpt läge: bara
  // exempeldata – inloggningssidan läser aldrig riktiga kunder. Allt är dekor (aria-hidden) och märkt "bilden visar exempeldata".
  function exempel() {
    if (typeof skapaExempeldata !== 'function') return null;
    let ny = null; try { ny = skapaExempeldata(); } catch (err) { return null; }
    if (SKARP) return ny;
    try { const sparad = JSON.parse(localStorage.getItem('up-crm-v1') || 'null'); if (sparad && sparad.version === ny.version && Array.isArray(sparad.affarer)) return sparad; } catch (err) { /* privat läge */ }
    return ny;
  }
  const kr = (v) => v >= 995000 ? `${(v / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} Mkr` : v >= 1000 ? `${Math.round(v / 1000).toLocaleString('sv-SE')} tkr` : `${Math.round(v).toLocaleString('sv-SE')} kr`;
  const plural = (n, en, flera) => `${n} ${n === 1 ? en : flera}`;
  const nar = (iso) => {
    const d = new Date(iso); if (Number.isNaN(+d)) return '';
    const dagar = Math.round((new Date().setHours(12, 0, 0, 0) - new Date(d).setHours(12, 0, 0, 0)) / 864e5);
    const kl = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return dagar <= 0 ? `idag ${kl}` : dagar === 1 ? `igår ${kl}` : dagar < 7 ? `${dagar} dagar sedan` : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  };
  // datumraden: veckodagen, datumet och veckan (ISO 8601)
  const datum = $('[data-li-datum]');
  if (datum) {
    const nu = new Date(); const t = new Date(Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate())); const dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn); const v = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
    datum.innerHTML = `<b>${e(nu.toLocaleDateString('sv-SE', { weekday: 'long' }))}</b><span>${e(nu.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }))}</span><em>V ${v}</em>`;
  }
  const db = exempel();
  if (db) {
    const anv = Object.fromEntries((db.anvandare || []).map((u) => [u.id, u]));
    const narv = Object.fromEntries((typeof NARVARO !== 'undefined' ? NARVARO : []).map((n) => [n.id, n]));
    // Närvaron på kontona (som i kontomenyn) – osynliga visas inte
    if (!SKARP) document.querySelectorAll('[data-li-status]').forEach((el) => {
      const u = anv[el.dataset.liStatus];
      // inaktiverat konto: knappen går inte att välja (samma regel som arAktiv i CRM:et)
      const knapp = el.closest('[data-roll]');
      if (u && (u.aktiv === false || u.aktiv === 0) && knapp) { knapp.disabled = true; knapp.setAttribute('data-inaktiv', ''); $('small', knapp).textContent = 'Inaktiverat konto'; return; }
      // statusen gäller till sluttiden (status.till) – sedan är man online igen, som narvaro() i ledning.js
      const giltig = u && u.status && (!u.status.till || Date.parse(u.status.till) > Date.now());
      const st = u && (giltig ? narv[u.status.kod] : narv.online);
      if (!st || ['osynlig', 'offline'].includes(st.id)) return;
      el.style.setProperty('--narv', st.farg);
      $('span', el).textContent = giltig && u.status.text ? `${st.namn} · ${u.status.text}` : st.namn;
      el.title = $('span', el).textContent; el.hidden = false;
    });
    const varde = (a) => { try { return prisaOffert(a.offert || {}).total || 0; } catch (err) { return 0; } };
    const affarer = db.affarer || [];
    const oppna = affarer.filter((a) => !['signerad', 'forlorad'].includes(a.steg));
    const signerade = affarer.filter((a) => a.steg === 'signerad');
    const summa = (lista) => lista.reduce((s, a) => s + varde(a), 0);
    const projekt = (db.projekt || []).filter((p) => p.steg !== 'klar');
    const klubbar = (db.kunder || []).filter((k) => k.klubbavtal); const viaKlubb = (db.kunder || []).filter((k) => k.viaKlubb);
    // Öppen pipeline: värdet och en stapel per steg (säljtavlans steg utom Order signerad)
    const pipe = summa(oppna); const pipeEl = $('[data-li-pipe]');
    if (pipeEl) { const [tal, enhet] = kr(pipe).split(' '); pipeEl.innerHTML = `${e(tal)}<small>${e(enhet)}</small>`; }
    const STEGF = { kontakt: '#5b8fd0', besok: '#3aa9c9', offert: '#5ad1c8', underlag: '#7ee0c3' };
    const KORT = { kontakt: 'Ny kontakt', besok: 'Kundbesök', offert: 'Offert', underlag: 'Underlag' };
    const steg = (typeof SALJSTEG !== 'undefined' ? SALJSTEG : []).filter((st) => STEGF[st.id]).map((st) => ({ ...st, v: summa(oppna.filter((a) => a.steg === st.id)), n: oppna.filter((a) => a.steg === st.id).length }));
    const max = Math.max(1, ...steg.map((st) => st.v)); const staplar = $('[data-li-staplar]');
    if (staplar && steg.length) {
      staplar.style.setProperty('--n', steg.length);
      staplar.innerHTML = steg.map((st, i) => `<span style="--hojd:${Math.round((st.v / max) * 100)}%;--i:${i};--f:${STEGF[st.id]}"><i></i><b>${e(st.v ? kr(st.v) : '–')}</b><small>${e(KORT[st.id] || st.namn)}</small></span>`).join('');
    }
    const chips = $('[data-li-chips]');
    if (chips) chips.innerHTML = `<span>${e(plural(oppna.length, 'öppen affär', 'öppna affärer'))}</span><span>${e(plural(projekt.length, 'projekt', 'projekt'))}</span>`;
    // Nyckeltalen
    const tal = $('[data-li-tal]');
    if (tal) {
      const rad = [[kr(pipe), plural(oppna.length, 'öppen affär', 'öppna affärer')], [kr(summa(signerade)), plural(signerade.length, 'signerad order', 'signerade ordrar')],
        [String(projekt.length), 'pågår hos testteamet'], [plural(klubbar.length, 'klubb', 'klubbar'), `${plural(viaKlubb.length, 'kund', 'kunder')} via klubbar`]];
      [...tal.children].forEach((g, i) => { const r = rad[i]; if (!r) return; $('strong', g).textContent = r[0]; $('small', g).textContent = r[1]; });
    }
    // Senaste meddelandet i chatten (bara text – exempeldata)
    const medd = ((db.chatt && db.chatt.meddelanden) || []).filter((m) => m && m.text && !m.borttagen && !m.system).sort((a, b) => String(b.tid).localeCompare(String(a.tid)))[0];
    // länkar i chattexten ([[kund:id]]/[[affar:id]]) visas som #Namn – som klartext() i chatt.js
    const klartext = (t) => String(t || '').replace(/\[\[(kund|affar):([\w-]+)\]\]/g, (m, typ, id) => { const x = ((typ === 'kund' ? db.kunder : db.affarer) || []).find((y) => y.id === id); return x ? `#${x.namn || x.titel}` : '#borttagen'; });
    const fran = medd && anv[medd.av];
    if (fran) {
      const av = $('[data-li-chatt-av]'); av.textContent = fran.initialer || fran.id.toUpperCase(); av.classList.toggle('li-avatar-test', fran.roll === 'test');
      $('[data-li-chatt-namn]').textContent = `${fran.namn} · ${nar(medd.tid)}`;
      const txt = klartext(medd.text);
      $('[data-li-chatt-text]').textContent = txt.length > 90 ? `${txt.slice(0, 88).trim()} …` : txt;
    }
    // Senaste aktiviteten: två händelser med kunden och när
    const TYP = { mote: ['mote', 'Möte'], samtal: ['prat', 'Samtal'], mejl: ['mejl', 'Mejl'], anteckning: ['dokument', 'Anteckning'], system: ['underlag', 'Händelse'] };
    const kunder = Object.fromEntries((db.kunder || []).map((k) => [k.id, k]));
    const akt = (db.aktiviteter || []).filter((x) => x && x.text && kunder[x.kundId]).sort((a, b) => String(b.tid).localeCompare(String(a.tid))).slice(0, 2);
    // rubriken = första satsen (före punkt, kolon eller tankstreck), kortad vid ett ord
    const kortText = (t) => { const f = String(t).split(/[.:!?]\s|\s[–—-]\s/)[0].replace(/[.:]$/, '').trim(); return f.length > 48 ? `${f.slice(0, 46).replace(/\s+\S*$/, '')} …` : f; };
    const flode = $('[data-li-flode]');
    if (flode && akt.length === 2) flode.innerHTML = akt.map((x, i) => { const [ik] = TYP[x.typ] || TYP.system; return `<li style="--r:${i}"><span class="li-ikon li-emo-ruta"><svg class="ikon" aria-hidden="true"><use href="#i-${ik}"/></svg></span><span><strong>${e(kortText(x.text))}</strong><small>${e(kunder[x.kundId].namn)} · ${e(nar(x.tid))}</small></span></li>`; }).join('');
  }

  // Scenen: framstegsringen och kort som följer muspekaren i djupled
  // Skarpt läge med hälsoformuläret avstängt: ringkortet visar kundunderlag i stället för hälsosvar
  // (det skarpa CRM:et hanterar kunddata, inte hälsodata)
  const utanHalsa = SKARP && !L.lage.halsoformular;
  const plats = $('[data-scen-ring]');
  if (plats && window.UPPortal) {
    plats.innerHTML = utanHalsa ? UPPortal.ring(80, { tal: 4, enhet: '/5', etikett: 'klara', aria: '4 av 5 klara' }) : UPPortal.ring(80, { tal: 4, enhet: '/5', etikett: 'svar', aria: '4 av 5 svar' });
    UPPortal.startaRing();
  }
  const ringEtikett = $('[data-scen-ring-etikett]');
  if (utanHalsa && ringEtikett) ringEtikett.innerHTML = '<svg class="ikon"><use href="#i-lank"/></svg>Kundunderlag';
  const scen = $('[data-scen]');
  if (scen && !lugn && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let ram = 0; let sista = null;
    addEventListener('pointermove', (ev) => {
      sista = ev; if (ram) return;
      ram = requestAnimationFrame(() => {
        ram = 0; const b = scen.getBoundingClientRect();
        scen.style.setProperty('--px', (((sista.clientX - b.left) / b.width) * 2 - 1).toFixed(3));
        scen.style.setProperty('--py', (((sista.clientY - b.top) / b.height) * 2 - 1).toFixed(3));
      });
    }, { passive: true });
  }

  // Det som rör sig hela tiden står still när fliken är dold eller scenen inte syns (≤1000 px är den dold)
  const vila = () => document.documentElement.toggleAttribute('data-li-vilar', document.hidden);
  document.addEventListener('visibilitychange', vila); vila();
  if (scen && 'IntersectionObserver' in window) {
    new IntersectionObserver(([p]) => scen.toggleAttribute('data-li-vilar', !p.isIntersecting)).observe(scen);
  }
})();
