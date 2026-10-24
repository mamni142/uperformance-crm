/* Uperformance CRM – mötesinspelning (window.UPInspelning).
   Spelar in ljudet från ett kundmöte i webbläsaren (MediaRecorder) – både på Kundmöte-sidan (#/mote) och inne i
   presentationsläget (.mote) – och sparar inspelningen som ett dokument på affären/kunden (kategori "mote"), precis som
   uppladdade filer: db.dokument + aktivitet, och i skarpt läge laddas ljudfilen upp till servern (POST /api/filer/:id).

   Flöde: knappen "Spela in" → samtyckeskortet (deltagarna informeras – GDPR) → inspelning med ljusnivå, tid, paus och stopp
   → "Spara på affären" (eller "Släng"). Transkribering byggs i ett senare steg (texten läggs då i samma dokument).

   Regler: inga inline-händelser (CSP), all text genom e(), ständiga animationer bara transform/opacity (ljudnivån sätts som
   transform på staplarna, max 20 bilder/s). Mikrofonen stängs alltid av när inspelningen slutar eller sidan lämnas.
   Mobil: Safari saknar audio/webm – första stödda typen i ORDNING används (audio/mp4 på iPhone).

   Aldrig osynligt (2026-10-24): kortet flyttas som element mellan presentationen och sidan (flytta) – förut ritades det om inne i
   presentationen som sedan togs bort, och mikrofonen spelade in vidare utan kort. Så länge det finns en inspelning (spelar, pausad
   eller klar att spara) och kortet är gömt syns pillret .insp-piller i hela CRM:et; det öppnar kortet. Pillret vilar när en Spela
   in-knapp redan syns (dockan på Kundmöte-sidan, presentationens topprad – de visar tiden själva). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  let C = null; // window.UPCRM (finns när crm.js kört)
  const e = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ik = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORDNING = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  const MAX_MS = 3 * 60 * 60 * 1000;    // 3 h – räcker för ett långt möte, under serverns 25 MB vid 32 kbit/s
  const MAX_BYTES = 24 * 1024 * 1024;   // marginal mot serverns gräns (25 MB)
  const stod = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && ORDNING.some((t) => MediaRecorder.isTypeSupported(t)));

  let st = null; // { lage: 'samtycke'|'spelar'|'paus'|'klar', ström, rec, bitar, typ, start, pausad, pausStart, kundId, affarId, vard, ljud, raf, timer, blob, urlObj }

  const tidText = (ms) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(r).padStart(2, '0'); };
  const forflutet = () => (!st || !st.start ? 0 : (st.lage === 'paus' ? st.pausStart : performance.now()) - st.start - st.pausad);
  const filandelse = (typ) => (/mp4/.test(typ) ? 'm4a' : /ogg/.test(typ) ? 'ogg' : 'webm');
  const rentTyp = (typ) => String(typ || '').split(';')[0].trim() || 'audio/webm';

  /* Kund och affär läses när de behövs (kortets text, Spara): på Kundmöte-sidan ur formuläret – även tomt, då finns ingen kund
     vald – annars ur presentationens attribut (data-insp-kund/-affar), sist det som gällde när kortet öppnades. Den som börjar
     med "Generellt" kan alltså välja kund efteråt, och en kund som väljs bort används inte. */
  const lasMal = () => {
    const f = document.querySelector('form[data-form="starta-mote"]');
    if (f && f.kundId) return { kundId: f.kundId.value || null, affarId: (f.affarId && f.affarId.value) || null };
    const k = st && st.vard ? (st.vard.closest && st.vard.closest('[data-insp-kund]')) || (st.vard.querySelector && st.vard.querySelector('[data-insp-kund]')) : null;
    if (k) return { kundId: k.dataset.inspKund || null, affarId: k.dataset.inspAffar || null };
    return { kundId: st ? st.kundId : null, affarId: st ? st.affarId : null };
  };
  const mbText = (bytes) => { const mb = bytes / 1048576; return mb < 0.1 ? 'under 0,1 MB' : `${mb.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB`; };

  /* ---- markup --------------------------------------------------------------------------------- */
  const knappHtml = (klass = '') => `<button type="button" class="insp-knapp ${klass}" data-insp="oppna" aria-haspopup="dialog"><span class="insp-prick" aria-hidden="true"></span>${ik('mote')}<span class="insp-knapp-text">Spela in</span></button>`;
  const kortHtml = () => {
    const mal = lasMal(); const kund = mal.kundId && C ? C.kund(mal.kundId) : null; const affar = mal.affarId && C ? C.affar(mal.affarId) : null;
    const vem = affar ? `${(C.kund(affar.kundId) || {}).namn || ''} · ${affar.titel}` : kund ? kund.namn : 'Generellt möte – sparas på kunden du väljer under Vem träffar du?';
    const staplar = Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    // Stäng/Göm står sist (Tab-ordningen följer raden i presentationen: Pausa, Stoppa, Göm) och ligger uppe till höger i kortet (CSS)
    const huvud = '<div class="insp-huvud"><span class="insp-ogon"><i class="insp-live" aria-hidden="true"></i>Mötesinspelning</span></div>';
    const stang = `<button type="button" class="insp-stang" data-insp="stang" aria-label="${st.lage === 'klar' || st.lage === 'spelar' || st.lage === 'paus' ? 'Göm kortet' : 'Stäng'}">${ik('stang')}</button>`;
    if (st.lage === 'samtycke') return `${huvud}
      <h3 class="insp-rubrik">Spela in <em>mötet?</em></h3>
      <p class="insp-text">Ljudet sparas som ett dokument på <strong>${e(vem)}</strong> och syns bara för teamet.</p>
      <label class="insp-samtycke"><input type="checkbox" data-insp="samtycke"><span>Jag har berättat för alla i rummet att mötet spelas in, och alla är med på det.<small>Gäller även på distans. Inspelningen innehåller personuppgifter – radera den när den inte behövs.</small></span></label>
      <div class="insp-knappar"><button type="button" class="insp-primar" data-insp="starta" disabled>${ik('mote')}Starta inspelning</button><button type="button" class="insp-sekundar" data-insp="stang">Avbryt</button></div>${stang}`;
    if (st.lage === 'klar') return `${huvud}
      <h3 class="insp-rubrik">Inspelningen är <em>klar.</em></h3>
      <p class="insp-text"><strong data-insp-langd>${e(tidText(st.langd || 0))}</strong> · ${e(mbText(st.blob ? st.blob.size : 0))} · sparas på <strong>${e(vem)}</strong></p>
      <audio class="insp-spelare" controls preload="metadata" src="${e(st.urlObj || '')}"></audio>
      <div class="insp-knappar"><button type="button" class="insp-primar" data-insp="spara">${ik('bock')}${affar ? 'Spara på affären' : 'Spara på kunden'}</button><button type="button" class="insp-sekundar insp-fara" data-insp="slang">${ik('papperskorg')}Släng</button></div>${stang}`;
    return `${huvud}
      <div class="insp-rad">
        <div class="insp-niva" aria-hidden="true">${staplar}</div>
        <div class="insp-tid"><span data-insp-tid>${e(tidText(forflutet()))}</span><small>${st.lage === 'paus' ? 'Pausad' : 'Spelar in'}</small></div>
      </div>
      <p class="insp-text insp-text-liten">${e(vem)}</p>
      <div class="insp-knappar"><button type="button" class="insp-sekundar" data-insp="${st.lage === 'paus' ? 'fortsatt' : 'paus'}">${ik(st.lage === 'paus' ? 'presentation' : 'klocka')}${st.lage === 'paus' ? 'Fortsätt' : 'Pausa'}</button><button type="button" class="insp-primar insp-stopp" data-insp="stopp"><span class="insp-stopp-ruta" aria-hidden="true"></span>Stoppa</button></div>${stang}`;
  };
  // Kortet som visas (ett kort som tonar ut efter Göm/Stäng har data-ut och räknas inte)
  const aktivtKort = () => document.querySelector('.insp-kort:not([data-ut])');
  // nyVard: dit kortet ska (presentationen eller sidan, se flytta). Annars: den öppna presentationen, eller där kortet bodde om
  // det finns kvar och inte ligger i en presentation som stängs.
  function rita(nyVard) {
    if (!st) return;
    const mote = nyVard ? null : document.querySelector('.mote:not([data-stanger])');
    if (nyVard || mote) st.vard = nyVard || mote;
    else if (!st.vard || !st.vard.isConnected || (st.vard.closest && st.vard.closest('.mote'))) st.vard = document.querySelector('[data-insp-plats]') || document.body;
    let kort = aktivtKort();
    if (kort && kort.parentElement !== st.vard) st.vard.appendChild(kort); // flyttas – ritas inte om där det försvinner
    if (!kort) { kort = document.createElement('section'); kort.className = 'insp-kort'; kort.setAttribute('role', 'dialog'); kort.setAttribute('aria-label', 'Mötesinspelning'); st.vard.appendChild(kort); requestAnimationFrame(() => kort.setAttribute('data-in', '')); }
    st.dold = false;
    kort.dataset.lage = st.lage;
    kort.innerHTML = kortHtml();
    const f = $('[data-insp="starta"], [data-insp="stopp"], [data-insp="spara"]', kort); if (f) f.focus({ preventScroll: true });
    uppdateraKnappar();
  }
  // Kortet tonar ut och tas bort (en gång – ett kort som redan tonar ut lämnas)
  const tonaUt = (kort) => { if (!kort || kort.hasAttribute('data-ut')) return; kort.setAttribute('data-ut', ''); kort.removeAttribute('data-in'); setTimeout(() => kort.remove(), 260); };
  // Knapparna ute i gränssnittet (Kundmöte-sidans docka + presentationens topprad) visar läget
  function uppdateraKnappar() {
    document.querySelectorAll('.insp-knapp').forEach((k) => {
      const spelar = !!st && (st.lage === 'spelar' || st.lage === 'paus');
      k.classList.toggle('insp-knapp-aktiv', spelar); k.setAttribute('aria-pressed', String(spelar));
      const t = $('.insp-knapp-text', k); if (t) t.textContent = spelar ? (st.lage === 'paus' ? 'Pausad' : tidText(forflutet())) : 'Spela in';
    });
    uppdateraPiller();
  }

  /* Pillret: syns i hela CRM:et när det finns en inspelning och varken kortet eller en Spela in-knapp syns (en knapp räknas när
     den ligger i bild och tar emot klick – dockan som vilar har pointer-events: none, sidan bakom presentationen är inert) */
  let pillerTid = 0;
  const knappSynlig = () => [...document.querySelectorAll('.insp-knapp')].some((k) => {
    if (k.closest('[inert]')) return false;
    const r = k.getBoundingClientRect(); if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
    return document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).some((x) => k.contains(x));
  });
  function uppdateraPiller() {
    let p = document.querySelector('.insp-piller');
    const visa = !!st && (st.lage === 'spelar' || st.lage === 'paus' || st.lage === 'klar') && !aktivtKort() && !knappSynlig();
    if (!visa) { if (p) p.hidden = true; return; }
    if (!p) { p = document.createElement('button'); p.type = 'button'; p.className = 'insp-piller'; p.setAttribute('data-insp', 'oppna'); p.setAttribute('aria-haspopup', 'dialog'); p.setAttribute('data-mork-yta', ''); document.body.appendChild(p); }
    const klar = st.lage === 'klar';
    const tid = klar ? 'Inspelning' : tidText(forflutet()); const under = klar ? 'Spara eller släng' : st.lage === 'paus' ? 'Pausad' : 'Spelar in';
    if (p.dataset.lage !== st.lage || p.dataset.tid !== tid) {
      p.dataset.lage = st.lage; p.dataset.tid = tid;
      p.innerHTML = `<span class="insp-prick" aria-hidden="true"></span><b>${e(tid)}</b><small>${e(under)}</small>`;
      p.setAttribute('aria-label', klar ? 'Mötesinspelningen är klar – visa kortet och spara eller släng den' : `Mötesinspelningen ${st.lage === 'paus' ? 'är pausad' : 'pågår'}, ${tid} – visa kortet`);
    }
    p.hidden = false;
  }
  const startaPiller = () => { clearInterval(pillerTid); pillerTid = setInterval(uppdateraPiller, 700); };
  const stoppaPiller = () => { clearInterval(pillerTid); pillerTid = 0; uppdateraPiller(); };

  /* ---- inspelningen ------------------------------------------------------------------------------- */
  async function starta() {
    let strom;
    try { strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (err) { meddela(err && err.name === 'NotAllowedError' ? 'Mikrofonen är blockerad – tillåt den i webbläsarens adressfält och försök igen.' : 'Ingen mikrofon hittades.', true); return; }
    const typ = ORDNING.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(strom, typ ? { mimeType: typ, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
    st.strom = strom; st.rec = rec; st.bitar = []; st.typ = rec.mimeType || typ || 'audio/webm'; st.bytes = 0;
    rec.addEventListener('dataavailable', (ev) => { if (ev.data && ev.data.size) { st.bitar.push(ev.data); st.bytes += ev.data.size; if (st.bytes > MAX_BYTES) { meddela('Inspelningen närmar sig största tillåtna storlek och stoppas.', true); stoppa(); } } });
    rec.addEventListener('stop', () => klar());
    rec.start(2000);
    st.lage = 'spelar'; st.start = performance.now(); st.pausad = 0;
    startaNiva(strom);
    st.timer = setInterval(() => { const el = $('[data-insp-tid]'); if (el) el.textContent = tidText(forflutet()); uppdateraKnappar(); if (forflutet() > MAX_MS) stoppa(); }, 500);
    addEventListener('beforeunload', varnaVidLamna);
    startaPiller(); // går tills inspelningen är sparad eller slängd (även i läget klar, då tiden står still)
    rita();
  }
  const varnaVidLamna = (ev) => { if (st && (st.lage === 'spelar' || st.lage === 'paus')) { ev.preventDefault(); ev.returnValue = ''; } };
  function pausa() { if (!st || st.lage !== 'spelar') return; st.rec.pause(); st.lage = 'paus'; st.pausStart = performance.now(); rita(); }
  function fortsatt() { if (!st || st.lage !== 'paus') return; st.pausad += performance.now() - st.pausStart; st.rec.resume(); st.lage = 'spelar'; rita(); }
  function stoppa() { if (!st || !st.rec || st.rec.state === 'inactive') return; if (st.lage === 'paus') st.pausad += performance.now() - st.pausStart; st.langd = performance.now() - st.start - st.pausad; st.rec.stop(); }
  function klar() {
    if (!st) return;
    slappStrom();
    st.blob = new Blob(st.bitar, { type: rentTyp(st.typ) }); st.urlObj = URL.createObjectURL(st.blob);
    st.lage = 'klar'; rita();
  }
  function slappStrom() {
    if (!st) return;
    clearInterval(st.timer); st.timer = 0; cancelAnimationFrame(st.raf); st.raf = 0;
    if (st.ljud) { try { st.ljud.ctx.close(); } catch (err) { /* redan stängd */ } st.ljud = null; }
    if (st.strom) { st.strom.getTracks().forEach((t) => t.stop()); st.strom = null; }
    removeEventListener('beforeunload', varnaVidLamna);
    uppdateraKnappar();
  }
  // Ljudnivån: 24 staplar som skalas med transform (ingen ommålning av annat), högst 20 bilder/s
  function startaNiva(strom) {
    let ctx; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { return; }
    const an = ctx.createAnalyser(); an.fftSize = 64; an.smoothingTimeConstant = 0.75;
    ctx.createMediaStreamSource(strom).connect(an);
    const data = new Uint8Array(an.frequencyBinCount); let senast = 0;
    st.ljud = { ctx, an };
    const steg = (t) => {
      if (!st || !st.ljud) return;
      st.raf = requestAnimationFrame(steg);
      if (t - senast < 50 || st.lage !== 'spelar') return; senast = t;
      an.getByteFrequencyData(data);
      const staplar = document.querySelectorAll('.insp-niva i'); if (!staplar.length) return;
      staplar.forEach((s, i) => { const v = data[Math.min(data.length - 1, Math.floor(i * data.length / staplar.length))] / 255; s.style.transform = `scaleY(${(0.08 + v * 0.92).toFixed(3)})`; });
    };
    st.raf = requestAnimationFrame(steg);
  }

  /* ---- spara som dokument ---------------------------------------------------------------------- */
  function spara() {
    if (!st || !st.blob || !C) return;
    const db = C.db; const mal = lasMal(); const affar = mal.affarId ? C.affar(mal.affarId) : null;
    const kundId = affar ? affar.kundId : mal.kundId;
    if (!kundId) { meddela('Välj kund under Vem träffar du? först, så att inspelningen hamnar rätt.', true); return; }
    const d = new Date(); const datum = d.toLocaleDateString('sv-SE'); const kl = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const kundNamn = (C.kund(kundId) || {}).namn || 'kund';
    const namn = `Mötesinspelning ${datum} ${kl.replace(':', '.')} – ${kundNamn}.${filandelse(st.typ)}`;
    const fil = new File([st.blob], namn, { type: rentTyp(st.typ) });
    const id = C.nyId('d'); const skarp = !!(C.lage && C.lage.lage === 'skarp') || !!(window.UP_SKARPT && window.UP_SKARPT.lage === 'skarp');
    db.dokument.push({ id, kundId, affarId: affar ? affar.id : null, kategori: 'mote', namn, storlek: fil.size, langd: Math.round((st.langd || 0) / 1000), tid: d.toISOString(), av: C.jag, ...(skarp ? { fil: true, typ: fil.type } : {}) });
    db.aktiviteter.push({ id: C.nyId('x'), kundId, affarId: affar ? affar.id : null, typ: 'mote', text: `Spelade in mötet (${tidText(st.langd || 0)}).`, av: C.jag, tid: d.toISOString() });
    if (skarp) {
      // Dokumentposten måste vara sparad innan filen laddas upp (serverregel) – samma väg som uppladdade filer i crm.js
      if (typeof C.laddaUppNarSparat === 'function') C.laddaUppNarSparat([[id, fil]]);
      else Promise.resolve(C.spara()).then(async () => { const L = window.UPLager; const svar = L && L.filer ? await L.filer.laddaUpp(id, fil) : { ok: false }; if (!svar.ok) { const dok = db.dokument.find((x) => x.id === id); if (dok) { dok.fil = false; C.spara(); } meddela(`Kunde inte ladda upp inspelningen: ${svar.meddelande || 'okänt fel'}`, true); } });
    } else {
      // Demoläget: filen lever bara under sessionen (objekt-URL) – registrera den hos crm.js om det går
      if (C.registreraFil) C.registreraFil(id, st.urlObj); else C.spara();
      if (!C.registreraFil) C.spara();
    }
    if (skarp) C.spara();
    const urlObj = st.urlObj; st.urlObj = null; // objekt-URL:en ägs nu av dokumentet i demoläget
    // I presentationen syns inte CRM:ets toaster (helskärm, inert) – bekräftelsen står i presentationens egna notiser
    const iMote = !!(st.vard && st.vard.closest && st.vard.closest('.mote:not([data-stanger])'));
    stang(true);
    if (!skarp && !C.registreraFil) URL.revokeObjectURL(urlObj);
    const mening = `Inspelningen är sparad på ${kundNamn}${affar ? ` – ${affar.titel}` : ''}`;
    if (!(iMote && window.UPMote && UPMote.meddela && UPMote.meddela(mening))) C.toast(`Inspelningen är sparad på ${kundNamn}`, affar ? { href: `#/affar/${affar.id}`, text: 'Visa affär' } : { href: `#/kund/${kundId}`, text: 'Visa kund' }, C.EMO && C.EMO.akt ? C.EMO.akt.mote : '');
    if (location.hash.startsWith('#/affar/') || location.hash.startsWith('#/kund/')) C.rendera();
  }

  /* ---- öppna/stäng --------------------------------------------------------------------------- */
  function oppna({ kundId = null, affarId = null, vard = null } = {}) {
    if (!C) C = window.UPCRM || null;
    if (!stod()) { meddela('Inspelning stöds inte i den här webbläsaren – prova Chrome, Edge eller Safari 14.1+.', true); return; }
    if (st) { st.oppnare = document.activeElement; rita(vard || undefined); return; } // redan igång eller klar: visa kortet igen
    const plats = vard || $('.mote:not([data-stanger])') || $('[data-insp-plats]') || document.body;
    st = { lage: 'samtycke', kundId, affarId, vard: plats, bitar: [], pausad: 0, oppnare: document.activeElement };
    rita(plats);
  }
  // Fokus tillbaka till knappen som öppnade kortet (pillret, eller en Spela in-knapp) – kortet tas bort med fokus i sig
  const syns = (el) => !!el && el.isConnected && !el.hidden && el.getClientRects().length > 0 && !el.closest('[inert]');
  const fokusTillbaka = (oppnare) => { const m = syns(oppnare) ? oppnare : [document.querySelector('.insp-piller'), ...document.querySelectorAll('.insp-knapp')].find(syns); if (m && m.focus) m.focus({ preventScroll: true }); };
  function stang(tyst) {
    if (!st) return;
    if (!tyst && (st.lage === 'spelar' || st.lage === 'paus' || st.lage === 'klar')) { // kortet göms – inspelningen fortsätter eller väntar på Spara (knappen eller pillret visar läget)
      tonaUt(aktivtKort()); st.dold = true;
      uppdateraPiller(); fokusTillbaka(st.oppnare);
      return;
    }
    const oppnare = st.oppnare;
    slappStrom();
    if (st.urlObj) URL.revokeObjectURL(st.urlObj);
    tonaUt(aktivtKort());
    st = null; stoppaPiller(); uppdateraKnappar(); fokusTillbaka(oppnare);
  }
  function meddela(text, varning) {
    if (st && st.vard && st.vard.closest && st.vard.closest('.mote') && window.UPMote && UPMote.meddela) { UPMote.meddela(text, { varning }); return; }
    if (C && C.toast) C.toast(text, null, varning ? 'varning' : ''); else alert(text);
  }

  // In i presentationen (när den ritas) och ut igen (innan den tas bort): själva kortet flyttas med. Ett gömt kort förblir gömt –
  // då visar presentationens knapp eller pillret läget.
  const flytta = (vard) => {
    if (!st || !vard) return;
    st.vard = vard;
    if (!st.dold) rita(vard); else uppdateraPiller();
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-insp]'); if (!el) return;
    const g = el.dataset.insp;
    if (g === 'oppna') {
      // Kund och affär läses live: på Kundmöte-sidan ur formuläret (kan ha ändrats efter att dockan ritades), annars ur attributen
      const k = el.closest('[data-insp-kund]'); const f = document.querySelector('form[data-form="starta-mote"]');
      const kundId = (f && f.kundId && f.kundId.value) || el.dataset.kund || (k && k.dataset.inspKund) || null;
      const affarId = (f && f.affarId && f.affarId.value) || el.dataset.affar || (k && k.dataset.inspAffar) || null;
      oppna({ kundId, affarId, vard: el.closest('.mote') || null });
    }
    else if (g === 'stang') stang(false);
    else if (g === 'starta') starta();
    else if (g === 'paus') pausa();
    else if (g === 'fortsatt') fortsatt();
    else if (g === 'stopp') stoppa();
    else if (g === 'spara') spara();
    else if (g === 'slang') { if (confirm('Släng inspelningen? Den går inte att få tillbaka.')) stang(true); }
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.matches && ev.target.matches('[data-insp="samtycke"]')) { const b = $('[data-insp="starta"]'); if (b) b.disabled = !ev.target.checked; return; }
    // Formuläret fyller i affären efter kunden (crm.js) – rita när det har satt sig
    if (st && st.lage !== 'spelar' && st.lage !== 'paus' && ev.target.closest && ev.target.closest('form[data-form="starta-mote"]')) setTimeout(() => { if (st && aktivtKort()) rita(); }, 80);
  });
  // Mikrofonen släpps alltid när sidan stängs
  addEventListener('pagehide', () => { if (st) slappStrom(); });
  // Ny vy: pillret räknas om direkt (dockans knapp kan ha kommit eller försvunnit)
  addEventListener('hashchange', () => { if (st) requestAnimationFrame(uppdateraPiller); });

  window.UPInspelning = { oppna, stang, stoppa, flytta, knappHtml, stod, get aktiv() { return !!st && (st.lage === 'spelar' || st.lage === 'paus'); }, get lage() { return st ? st.lage : null; } };
})();
