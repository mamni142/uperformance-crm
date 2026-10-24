/* Uperformance – kundsidornas affärslogik (kundlänk, offert/order och hälsoformulär).
   En källa för båda lägena: körs i webbläsaren i demoläget (via UPLager i lager.js) och på servern
   i skarpt läge (server/, med node:vm). Därför bara ECMAScript, crypto.getRandomValues, console och
   globalerna i data.js – inga window, document, localStorage, URL, fetch, setTimeout eller structuredClone.
   Funktionerna muterar db direkt (som spara(extra) i kund.js, offert.js och halsa.js gjorde tidigare)
   och tål en ofullständig db där bara de poster som behövs finns med.
   Kontraktet står i server/ARKITEKTUR.md, avsnitt 7.2. */
var KUNDLOGIK = (() => {
  'use strict';

  /* Små hjälpare --------------------------------------------------------------------------- */
  const NYCKELTECKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const IDTECKEN = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const slump = (antal, tecken) => {
    const b = new Uint32Array(antal); crypto.getRandomValues(b);
    let s = ''; for (let i = 0; i < antal; i++) s += tecken[b[i] % tecken.length];
    return s;
  };
  // 22 tecken, samma alfabet som kundlänkens hälsonycklar alltid har haft
  const nyNyckel = () => slump(22, NYCKELTECKEN);
  const nyttId = (prefix) => String(prefix || '') + Date.now().toString(36) + slump(4, IDTECKEN);
  const krText = (n) => Math.round(n || 0).toLocaleString('sv-SE') + ' kr';

  const har = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const arObjekt = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  const kopia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const idagFran = (nu) => String(nu || new Date().toISOString()).slice(0, 10);
  const fel = (status, kod, meddelande, detaljer) => {
    const f = { ok: false, fel: kod, status, meddelande };
    if (detaljer !== undefined) f.detaljer = detaljer;
    return f;
  };
  const sakra = (db) => {
    db.anvandare = db.anvandare || []; db.kunder = db.kunder || []; db.affarer = db.affarer || [];
    db.aktiviteter = db.aktiviteter || []; db.todos = db.todos || [];
    db.kundlankar = db.kundlankar || {}; db.offerter = db.offerter || {}; db.halsoformular = db.halsoformular || {};
    return db;
  };
  const hittaKund = (db, id) => (db.kunder || []).find((k) => k && k.id === id) || null;
  const hittaAffar = (db, id) => (db.affarer || []).find((a) => a && a.id === id) || null;
  const hittaSaljare = (db, affar) => {
    const u = affar ? (db.anvandare || []).find((x) => x && x.id === affar.ansvarig) : null;
    if (!u) return { namn: 'Uperformance', kort: 'oss' };
    // E-post bara när användarposten har en (kundsidorna visar då en mejllänk – annars bara namnet)
    const s = { namn: u.namn, kort: u.kort };
    if (typeof u.epost === 'string' && EPOST_MONSTER.test(u.epost)) s.epost = u.epost;
    return s;
  };
  const kanSkickas = (d) => !!String(d.namn || '').trim() && EPOST_MONSTER.test(String(d.epost || '').trim());

  /* Giltighet ------------------------------------------------------------------------------ */
  function giltigLank(db, nyckel, idag) {
    const lank = db && typeof nyckel === 'string' && har(db.kundlankar, nyckel) ? db.kundlankar[nyckel] : null;
    if (!arObjekt(lank)) return fel(404, 'saknas', 'Länken finns inte.');
    if (lank.sparrad) return fel(410, 'sparrad', 'Länken är spärrad.');
    if (lank.utgar && lank.utgar < (idag || idagFran())) return fel(410, 'utgangen', 'Länken har gått ut.');
    return { ok: true, lank };
  }
  // Ersatta och utgångna offerter går att läsa – sidan visar själv att de inte gäller
  function giltigOffert(db, nyckel) {
    const off = db && typeof nyckel === 'string' && har(db.offerter, nyckel) ? db.offerter[nyckel] : null;
    if (!arObjekt(off)) return fel(404, 'saknas', 'Offerten finns inte.');
    return { ok: true, off };
  }
  function giltigHalsa(db, nyckel) {
    const form = db && typeof nyckel === 'string' && har(db.halsoformular, nyckel) ? db.halsoformular[nyckel] : null;
    if (!arObjekt(form)) return fel(404, 'saknas', 'Hälsoformuläret finns inte.');
    if (form.makulerad) return fel(410, 'makulerad', 'Länken har ersatts eller tagits bort.');
    const lank = har(db.kundlankar, form.lank) ? db.kundlankar[form.lank] : null;
    if (!arObjekt(lank) || lank.sparrad) return fel(410, 'sparrad', 'Beställningslänken är spärrad.');
    return { ok: true, form, lank };
  }

  /* Vyer – det kundsidorna får se ------------------------------------------------------------ */
  function vyKundlank(db, nyckel, opt) {
    const pa = !!(opt && opt.halsoformular);
    const lank = har(db && db.kundlankar, nyckel) ? db.kundlankar[nyckel] : {};
    const kund = hittaKund(db, lank.kundId);
    const halsoformular = {};
    if (pa && db.halsoformular) {
      Object.keys(db.halsoformular).forEach((t) => {
        const f = db.halsoformular[t];
        if (!arObjekt(f) || f.lank !== nyckel) return;
        // Bara status – svar, utkast och födelsedag lämnar aldrig hälsoformulärets egen vy
        const v = { status: f.status, skickad: f.skickad, forifyllt: { namn: (f.forifyllt || {}).namn || '', epost: (f.forifyllt || {}).epost || '' } };
        ['oppnad', 'paminnd', 'besvarad', 'makulerad'].forEach((k) => { if (f[k] !== undefined) v[k] = f[k]; });
        halsoformular[t] = v;
      });
    }
    return { nyckel, lank: kopia(lank), kund: { namn: kund ? kund.namn : '' }, saljare: hittaSaljare(db, hittaAffar(db, lank.affarId)), halsoformular, halsoformularPa: pa, dokument: dokumentLage(db, lank.affarId) };
  }
  /* Affärens offert och order som kundlänkens resa visar (2026-10-24): den nyaste versionen av varje som inte är makulerad eller
     ersatt – bara nummer, läge och datum. Nyckeln till dokumentet följer aldrig med (kundlänken länkar inte till offerten). */
  function dokumentLage(db, affarId) {
    const ut = { offert: null, order: null };
    if (!affarId) return ut;
    Object.keys(db.offerter || {}).forEach((t) => {
      const d = db.offerter[t];
      if (!arObjekt(d) || d.affarId !== affarId || d.makulerad || d.status === 'ersatt' || d.status === 'makulerad' || d.ersattAv) return;
      const typ = d.typ === 'order' ? 'order' : 'offert';
      if (ut[typ] && String(ut[typ].skapad || '') >= String(d.skapad || '')) return;
      const v = { nummer: String(d.nummer || ''), status: String(d.status || ''), skapad: d.skapad || null, giltigTill: d.giltigTill || null };
      if (d.godkand) v.godkand = d.godkand;
      ut[typ] = v;
    });
    return ut;
  }
  // Kundens vy av offerten/ordern: kundlänkens nyckel (offert.underlag) leder till deltagarlistan med personnummer och följer aldrig
  // med, och en makulering syns bara som att dokumentet inte gäller längre – vem som makulerade och varför stannar hos Uperformance.
  // En nyare version av samma dokument (offert eller order) på samma affär – den nyaste som inte är makulerad, eller null
  function nyareVersion(db, kalla) {
    if (!arObjekt(kalla) || !kalla.affarId) return null;
    const typ = kalla.typ || 'offert'; const skapad = String(kalla.skapad || '');
    let nyast = null;
    Object.keys(db.offerter || {}).forEach((t) => {
      const d = db.offerter[t];
      if (!arObjekt(d) || d === kalla || d.affarId !== kalla.affarId || (d.typ || 'offert') !== typ || d.makulerad) return;
      if (String(d.skapad || '') <= skapad) return;
      if (!nyast || String(d.skapad || '') > String(nyast.skapad || '')) nyast = d;
    });
    return nyast;
  }
  function vyOffert(db, nyckel) {
    const kalla = har(db && db.offerter, nyckel) ? db.offerter[nyckel] : null;
    const off = kopia(kalla);
    if (off && off.offert && typeof off.offert === 'object') delete off.offert.underlag;
    if (off && off.makulerad) off.makulerad = { tid: off.makulerad.tid || null };
    // Ersatt eller en nyare version finns: kundens sida säger att den här inte gäller längre – bara den nya versionens nummer följer med
    if (off && off.ersattAv) off.ersattAv = { nummer: String(off.ersattAv.nummer || ''), tid: off.ersattAv.tid || null };
    else if (off) { const ny = nyareVersion(db, kalla); if (ny) off.nyareVersion = { nummer: String(ny.nummer || '') }; }
    if (off) Object.assign(off, underlagLage(db, kalla));
    return { nyckel, offert: off };
  }
  /* Kundunderlaget på samma affär, som offertsidan säger något om (2026-10-24) – bara som sant/falskt och, för en offert som
     bygger på det inskickade underlaget, deltagarnas namn, paket och tillval (som orderns bilaga – aldrig e-post eller personnummer).
     harUnderlag: underlaget är inskickat. underlagPagar: en kundlänk är skickad men inte inskickad. Nyckeln följer aldrig med. */
  function underlagLage(db, kalla) {
    const ut = { harUnderlag: false, underlagPagar: false };
    if (!arObjekt(kalla) || !kalla.affarId) return ut;
    const idag = idagFran();
    Object.keys(db.kundlankar || {}).forEach((t) => {
      const l = db.kundlankar[t];
      if (!arObjekt(l) || l.affarId !== kalla.affarId || l.sparrad) return;
      if (l.status === 'inskickad') ut.harUnderlag = true;
      else if (!l.utgar || l.utgar >= idag) ut.underlagPagar = true;
    });
    const o = arObjekt(kalla.offert) ? kalla.offert : {};
    const l = typeof o.underlag === 'string' && har(db.kundlankar, o.underlag) ? db.kundlankar[o.underlag] : null;
    const rader = Array.isArray(o.deltagare) ? o.deltagare : [];
    // Namnen bara när offerten byggdes på just den listan (samma antal och paket, rad för rad)
    if ((kalla.typ || 'offert') === 'offert' && arObjekt(l) && l.status === 'inskickad' && Array.isArray(l.deltagare) && rader.length && l.deltagare.length === rader.length
      && l.deltagare.every((d, i) => arObjekt(d) && arObjekt(rader[i]) && d.paket === rader[i].paket)) {
      ut.deltagarBilaga = l.deltagare.map((d) => ({ namn: String(d.namn || '').trim(), paket: d.paket, tillval: Array.isArray(d.tillval) ? d.tillval.filter((x) => typeof x === 'string') : [] }));
    }
    return ut;
  }
  function vyHalsa(db, nyckel) {
    const form = har(db && db.halsoformular, nyckel) ? db.halsoformular[nyckel] : {};
    const lank = har(db.kundlankar, form.lank) ? db.kundlankar[form.lank] : {};
    const kund = hittaKund(db, form.kundId || lank.kundId);
    const foretag = lank.foretag || {};
    const formular = { status: form.status, skickad: form.skickad, forifyllt: kopia(form.forifyllt || { namn: '', epost: '', fodd: '' }) };
    ['oppnad', 'besvarad'].forEach((k) => { if (form[k] !== undefined) formular[k] = form[k]; });
    if (form.svar !== undefined) formular.svar = kopia(form.svar);
    if (form.utkast !== undefined) formular.utkast = kopia(form.utkast);
    return {
      nyckel, formular,
      foretag: { namn: foretag.namn || (kund ? kund.namn : ''), period: foretag.period || '' },
      kund: { namn: kund ? kund.namn : '' },
      saljare: (() => { const s = hittaSaljare(db, hittaAffar(db, form.affarId || lank.affarId)); return s.epost ? { namn: s.namn, epost: s.epost } : { namn: s.namn }; })(),
    };
  }

  /* Öppna – sätter bara något första gången ----------------------------------------------- */
  function oppnaLank(db, nyckel, nu) {
    const g = giltigLank(db, nyckel, idagFran(nu)); if (!g.ok) return { andrat: false };
    const l = g.lank; let andrat = false;
    if (!l.oppnad) { l.oppnad = nu; andrat = true; }
    if (l.status === 'skickad') { l.status = 'oppnad'; andrat = true; }
    if (andrat) l.andrad = nu;
    return { andrat };
  }
  function oppnaOffert(db, nyckel, nu) {
    const g = giltigOffert(db, nyckel); if (!g.ok) return { andrat: false };
    if (g.off.status !== 'skickad') return { andrat: false };
    g.off.status = 'oppnad'; g.off.oppnad = nu; g.off.andrad = nu;
    return { andrat: true };
  }
  function oppnaHalsa(db, nyckel, nu) {
    const g = giltigHalsa(db, nyckel); if (!g.ok) return { andrat: false };
    if (g.form.status !== 'skickad') return { andrat: false };
    g.form.status = 'oppnad'; g.form.oppnad = nu; g.form.andrad = nu;
    return { andrat: true };
  }

  /* Kundlänken: autosparning ----------------------------------------------------------------- */
  const FORETAG_MAX = { faktura: 1000 };
  const ID_MONSTER = /^[A-Za-z0-9_-]{1,40}$/;
  // Kontrollerar ett paketval och dess tillval; ger felmeddelande eller null
  function kontrolleraVal(paket, tillval) {
    if (typeof paket !== 'string' || !har(PRISER.paket, paket)) return 'okänt paket';
    if (!Array.isArray(tillval)) return 'tillval ska vara en lista';
    const sedda = {};
    for (let i = 0; i < tillval.length; i++) {
      const t = tillval[i];
      if (typeof t !== 'string' || !har(PRISER.tillval, t)) return 'okänt tillval';
      if (sedda[t]) return 'samma tillval två gånger';
      sedda[t] = true;
    }
    return null;
  }
  const strang = (v, max) => (v === undefined || v === null ? '' : typeof v === 'string' && v.length <= max ? v : null);
  // Som strang, men ett oförändrat befintligt värde godtas även om det är längre än gränsen
  // (äldre data från prototypen kortades aldrig – annars kunde ingenting alls sparas på länken)
  const strangEllerSamma = (v, max, fore) => (typeof v === 'string' && v === fore ? v : strang(v, max));

  function sparaLank(db, nyckel, andring, nu, opt) {
    sakra(db);
    const g = giltigLank(db, nyckel, idagFran(nu)); if (!g.ok) return g;
    const lank = g.lank;
    if (lank.status === 'inskickad') return fel(409, 'inskickad', 'Underlaget är redan inskickat och kan inte ändras här.');
    if (!arObjekt(andring)) return fel(400, 'ogiltig', 'Ändringen kunde inte läsas.', [{ falt: '', meddelande: 'Ska vara ett objekt' }]);

    // 1. Kontrollera allt först – ingenting ändras om något är fel (inget kortas eller trimmas tyst)
    const detaljer = []; const ny = {};
    const nej = (falt, meddelande) => detaljer.push({ falt, meddelande });
    if (har(andring, 'foretag')) {
      if (!arObjekt(andring.foretag)) nej('foretag', 'Ska vara ett objekt');
      else {
        ny.foretag = {};
        FORETAG_FALT.forEach((f) => {
          if (!har(andring.foretag, f.id)) return;
          const max = FORETAG_MAX[f.id] || 300; const v = andring.foretag[f.id];
          if (v === null || v === undefined) ny.foretag[f.id] = '';
          else if (typeof v !== 'string') nej('foretag.' + f.id, 'Ska vara text');
          else if (v.length > max && v !== (lank.foretag || {})[f.id]) nej('foretag.' + f.id, `Högst ${max} tecken`);
          else ny.foretag[f.id] = v;
        });
      }
    }
    if (har(andring, 'deltagare')) {
      const lista = andring.deltagare;
      if (!Array.isArray(lista)) nej('deltagare', 'Ska vara en lista');
      else if (lista.length > 2000) nej('deltagare', 'Högst 2000 deltagare');
      else {
        const befintliga = {}; (lank.deltagare || []).forEach((d) => { if (d && d.id) befintliga[d.id] = d; });
        const sedda = {}; ny.deltagare = [];
        lista.forEach((d, i) => {
          const falt = `deltagare.${i}`;
          if (!arObjekt(d)) { nej(falt, 'Ska vara ett objekt'); return; }
          if (typeof d.id !== 'string' || !ID_MONSTER.test(d.id)) { nej(falt + '.id', 'Ogiltigt id'); return; }
          if (sedda[d.id]) { nej(falt + '.id', 'Samma id två gånger'); return; }
          sedda[d.id] = true;
          const fore = befintliga[d.id] || {};
          const namn = strangEllerSamma(d.namn, 200, fore.namn); const epost = strangEllerSamma(d.epost, 254, fore.epost); const pnr = strangEllerSamma(d.pnr, 20, fore.pnr);
          if (namn === null) nej(falt + '.namn', 'Text, högst 200 tecken');
          if (epost === null) nej(falt + '.epost', 'Text, högst 254 tecken');
          if (pnr === null) nej(falt + '.pnr', 'Text, högst 20 tecken');
          const tillval = d.tillval === undefined || d.tillval === null ? [] : d.tillval;
          const valFel = kontrolleraVal(d.paket, tillval);
          if (valFel) nej(falt + '.paket', valFel);
          // Utgå från den befintliga raden (okända extra fält och hälsonyckeln ligger kvar). Hälsonyckeln
          // styrs av servern: klientens värde ignoreras, det befintliga för samma id behålls.
          const rad = befintliga[d.id] ? kopia(befintliga[d.id]) : {};
          Object.assign(rad, { id: d.id, namn, epost, pnr, paket: d.paket, tillval: Array.isArray(tillval) ? tillval.slice() : [] });
          ny.deltagare.push(rad);
        });
      }
    }
    if (har(andring, 'standard')) {
      const s = andring.standard;
      if (!arObjekt(s)) nej('standard', 'Ska vara ett objekt');
      else {
        const tillval = s.tillval === undefined || s.tillval === null ? [] : s.tillval;
        const valFel = kontrolleraVal(s.paket, tillval);
        if (valFel) nej('standard', valFel); else ny.standard = { paket: s.paket, tillval: tillval.slice() };
      }
    }
    if (har(andring, 'steg')) {
      if (!Number.isInteger(andring.steg) || andring.steg < 1 || andring.steg > 4) nej('steg', 'Heltal 1–4');
      else ny.steg = andring.steg;
    }
    ['bekraftelse1', 'bekraftelse2'].forEach((k) => {
      if (!har(andring, k)) return;
      if (typeof andring[k] !== 'boolean') nej(k, 'Ska vara sant eller falskt'); else ny[k] = andring[k];
    });
    if (har(andring, 'meddelande')) {
      const m = strang(andring.meddelande, 4000);
      if (m === null) nej('meddelande', 'Text, högst 4000 tecken'); else ny.meddelande = m;
    }
    if (detaljer.length) return fel(400, 'ogiltig', 'Några uppgifter kunde inte sparas.', detaljer);

    // 2. Ändra – bara det som faktiskt skiljer sig
    const lika = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    let andrat = false; let innehall = false;
    if (ny.foretag) {
      const foretag = { ...(lank.foretag || {}), ...ny.foretag };
      if (!lika(foretag, lank.foretag || {})) { lank.foretag = foretag; andrat = innehall = true; }
    }
    if (ny.deltagare) {
      const fore = lank.deltagare || [];
      if (!lika(ny.deltagare, fore)) {
        // Rader som försvinner: deras hälsoformulär makuleras (länken slutar gälla)
        const kvar = {}; ny.deltagare.forEach((d) => { kvar[d.id] = true; });
        fore.forEach((d) => {
          if (!d || kvar[d.id] || !d.halsa || !har(db.halsoformular, d.halsa)) return;
          const h = db.halsoformular[d.halsa];
          if (arObjekt(h) && !h.makulerad) { h.makulerad = true; h.andrad = nu; }
        });
        lank.deltagare = ny.deltagare; andrat = innehall = true;
      }
    }
    if (ny.standard && !lika(ny.standard, lank.standard)) { lank.standard = ny.standard; andrat = innehall = true; }
    if (ny.meddelande !== undefined && ny.meddelande !== (lank.meddelande || '')) { lank.meddelande = ny.meddelande; andrat = innehall = true; }
    if (ny.steg !== undefined && ny.steg !== lank.steg) { lank.steg = ny.steg; andrat = true; }
    ['bekraftelse1', 'bekraftelse2'].forEach((k) => { if (ny[k] !== undefined && ny[k] !== !!lank[k]) { lank[k] = ny[k]; andrat = true; } });
    if (innehall && (lank.status === 'skickad' || lank.status === 'oppnad')) lank.status = 'paborjad';
    if (andrat) lank.andrad = nu;
    return { ok: true };
  }

  /* Hälsoformulär: skicka och påminna (från kundlänken) -------------------------------------- */
  const idLista = (ids) => (Array.isArray(ids) && ids.length <= 2000 && ids.every((x) => typeof x === 'string') ? ids.filter((x, i) => ids.indexOf(x) === i) : null);

  function skickaHalsa(db, nyckel, deltagarIds, nu) {
    sakra(db);
    const g = giltigLank(db, nyckel, idagFran(nu)); if (!g.ok) return g;
    const lank = g.lank;
    if (lank.status === 'inskickad') return fel(409, 'inskickad', 'Underlaget är redan inskickat.');
    const ids = idLista(deltagarIds);
    if (!ids) return fel(400, 'ogiltig', 'Listan med deltagare kunde inte läsas.', [{ falt: 'deltagarIds', meddelande: 'Ska vara en lista med id' }]);
    const hl = halsoLage(lank, db.halsoformular);
    const skickade = [];
    ids.forEach((id) => {
      const d = (lank.deltagare || []).find((x) => x && x.id === id);
      if (!d || !hl.per[d.id] || hl.per[d.id].status !== 'ej-skickat' || !kanSkickas(d)) return;
      let t = nyNyckel(); while (har(db.halsoformular, t)) t = nyNyckel();
      d.halsa = t;
      db.halsoformular[t] = {
        lank: nyckel, deltagare: d.id, kundId: lank.kundId, affarId: lank.affarId,
        status: 'skickad', skickad: nu, andrad: nu,
        forifyllt: { namn: d.namn.trim(), epost: d.epost.trim(), fodd: fodelsedagFranPnr(d.pnr) },
      };
      skickade.push({ deltagareId: d.id, nyckel: t, namn: d.namn.trim(), epost: d.epost.trim() });
    });
    if (skickade.length) lank.andrad = nu;
    return { ok: true, skickade };
  }

  function paminnHalsa(db, nyckel, deltagarIds, nu) {
    sakra(db);
    const g = giltigLank(db, nyckel, idagFran(nu)); if (!g.ok) return g;
    const lank = g.lank;
    if (lank.status === 'inskickad') return fel(409, 'inskickad', 'Underlaget är redan inskickat.');
    const ids = idLista(deltagarIds);
    if (!ids) return fel(400, 'ogiltig', 'Listan med deltagare kunde inte läsas.', [{ falt: 'deltagarIds', meddelande: 'Ska vara en lista med id' }]);
    const paminda = [];
    ids.forEach((id) => {
      const d = (lank.deltagare || []).find((x) => x && x.id === id);
      if (!d || !d.halsa || !har(db.halsoformular, d.halsa)) return;
      const h = db.halsoformular[d.halsa];
      if (!arObjekt(h) || h.makulerad || (h.status !== 'skickad' && h.status !== 'oppnad')) return;
      const namn = String(d.namn || '').trim(); const epost = String(d.epost || '').trim();
      h.paminnd = nu; h.andrad = nu; h.forifyllt = { ...(h.forifyllt || {}), namn, epost };
      paminda.push({ deltagareId: d.id, nyckel: d.halsa, namn, epost });
    });
    return { ok: true, paminda };
  }

  /* Kunden skickar in underlaget --------------------------------------------------------------- */
  function skickaIn(db, nyckel, nu, opt) {
    sakra(db);
    const g = giltigLank(db, nyckel, idagFran(nu)); if (!g.ok) return g;
    const lank = g.lank; const halsaPa = !!(opt && opt.halsoformular);
    if (lank.status === 'inskickad') return { ok: true };
    const s = summeraUnderlag(lank);
    const hl = halsaPa ? halsoLage(lank, db.halsoformular) : null;
    const saknas = [];
    s.foretagFel.forEach((f) => saknas.push(f));
    if (!s.antal) saknas.push('Lägg till minst en deltagare');
    if (s.varningar) saknas.push(`${s.varningar} ${s.varningar === 1 ? 'deltagarrad' : 'deltagarrader'} att rätta`);
    if (hl && s.antal && !hl.alla) saknas.push(`Hälsoformulär saknas från ${hl.totalt - hl.klara} deltagare`);
    if (!lank.bekraftelse1 || !lank.bekraftelse2) saknas.push('Bekräftelserna är inte ikryssade');
    if (saknas.length || !s.komplett) return fel(422, 'ofullstandigt', 'Underlaget är inte komplett.', saknas.length ? saknas : ['Underlaget är inte komplett']);

    lank.status = 'inskickad'; lank.inskickad = nu; lank.andrad = nu;
    const text = `Kunden skickade in underlaget: ${s.antal} deltagare${halsaPa ? ' (alla har svarat på hälsoformuläret)' : ''}, preliminärt ${krText(s.total)}${s.hjartkarl ? ` (+ ${s.hjartkarl} Hjärt-/kärlpaket på offert)` : ''}.${lank.meddelande ? ' Meddelande: ' + lank.meddelande : ''}`;
    db.aktiviteter.push({ id: nyttId('x'), kundId: lank.kundId, affarId: lank.affarId, typ: 'dokument', text, av: 'kund', tid: nu });
    const a = hittaAffar(db, lank.affarId);
    if (a) {
      a.check = { ...(a.check || {}), info: true };
      db.todos.push({ id: nyttId('t'), text: 'Granska inskickat kundunderlag och ta fram order', kundId: lank.kundId, ansvarig: a.ansvarig, datum: nu.slice(0, 10), klar: false });
    }
    return { ok: true };
  }

  /* Kunden godkänner offerten eller signerar ordern ------------------------------------------- */
  function godkannOffert(db, nyckel, uppgifter, nu) {
    sakra(db);
    const g = giltigOffert(db, nyckel); if (!g.ok) return g;
    const off = g.off; const u = arObjekt(uppgifter) ? uppgifter : {};
    const namn = typeof u.namn === 'string' ? u.namn.trim() : '';
    const roll = u.roll === undefined || u.roll === null ? '' : typeof u.roll === 'string' ? u.roll.trim() : null;
    const detaljer = [];
    if (u.behorig !== true) detaljer.push({ falt: 'behorig', meddelande: 'Bekräfta att du har behörighet att beställa' });
    if (!namn) detaljer.push({ falt: 'namn', meddelande: 'Skriv ditt namn' });
    else if (u.namn.length > 200) detaljer.push({ falt: 'namn', meddelande: 'Högst 200 tecken' });
    if (roll === null || (typeof u.roll === 'string' && u.roll.length > 200)) detaljer.push({ falt: 'roll', meddelande: 'Text, högst 200 tecken' });
    if (detaljer.length) return fel(400, 'ogiltig', 'Namn och behörighet behövs.', detaljer);
    if (off.status === 'godkand' || off.status === 'signerad') return fel(409, 'redan-klar', off.typ === 'order' ? 'Ordern är redan signerad.' : 'Offerten är redan godkänd.');
    if (off.status === 'ersatt') return fel(409, 'ersatt', 'Det finns en nyare version.');
    if (off.giltigTill && off.giltigTill < idagFran(nu)) return fel(410, 'utgangen', 'Giltighetstiden har gått ut.');

    const arOrder = off.typ === 'order';
    off.status = arOrder ? 'signerad' : 'godkand'; off.godkand = nu; off.andrad = nu;
    off.godkandAv = { namn, roll };
    // Äldre godkända/signerade versioner av samma dokument på affären gäller inte längre. Bara markeringen ersattAv sätts –
    // det låsta dokumentets innehåll och godkännande står kvar som historik (CRM:ets arkiv och kundens gamla länk säger "Ersatt av …").
    Object.keys(db.offerter).forEach((t) => {
      const d = db.offerter[t];
      if (t === nyckel || !arObjekt(d) || !off.affarId || d.affarId !== off.affarId || (d.typ || 'offert') !== (off.typ || 'offert')) return;
      if ((d.status !== 'godkand' && d.status !== 'signerad') || d.ersattAv || d.makulerad) return;
      d.ersattAv = { nummer: String(off.nummer || ''), tid: nu }; d.andrad = nu;
    });
    db.aktiviteter.push({ id: nyttId('x'), kundId: off.kundId, affarId: off.affarId, typ: 'dokument', text: `${off.godkandAv.namn} ${arOrder ? 'signerade' : 'godkände'} ${arOrder ? 'order' : 'offert'} ${off.nummer} (${krText(prisaOffert(off.offert || {}).total)} exkl. moms).`, av: 'kund', tid: nu });
    const a = hittaAffar(db, off.affarId);
    if (a) {
      if (['kontakt', 'besok', 'offert'].includes(a.steg)) { a.steg = 'underlag'; a.stegAndrad = nu.slice(0, 10); }
      if (arOrder) { a.check = { ...(a.check || {}), order: true }; a.orderSignerad = nu; }
      // Uppgiften till säljaren följer läget: finns en kundlänk (inskickad eller inte) och är PUB-avtalet/samtyckena redan klara?
      // Märkt auto + affarId – en ny godkänd version ersätter den öppna uppgiften i stället för att lägga till en likadan.
      const lankar = Object.values(db.kundlankar || {}).filter((l) => arObjekt(l) && l.affarId === a.id && !l.sparrad);
      const harUnderlag = lankar.some((l) => l.status === 'inskickad');
      const c = a.check || {};
      const ordna = [!c.pub && 'PUB-avtal', !c.samtycke && 'samtycken'].filter(Boolean).join(' och ');
      const text = arOrder ? 'Ordern är signerad – skicka förskottsfaktura (25 %) och överlämna till testteamet'
        : harUnderlag ? (ordna ? `Offerten är godkänd – ordna ${ordna} och skapa ordern` : 'Offerten är godkänd – skapa ordern')
          : lankar.length ? (c.pub ? 'Offerten är godkänd – påminn kunden om underlaget i kundlänken' : 'Offerten är godkänd – påminn kunden om kundlänken och ordna PUB-avtal')
            : c.pub ? 'Offerten är godkänd – skicka kundlänk för underlaget' : 'Offerten är godkänd – skicka kundlänk för underlag och PUB-avtal';
      const auto = arOrder ? 'signerad' : 'godkand'; const borjan = arOrder ? 'Ordern är signerad – ' : 'Offerten är godkänd – ';
      // Äldre uppgifter utan märkning (före 2026-10-24) med samma början räknas som samma uppgift
      const finns = db.todos.find((t) => arObjekt(t) && !t.klar && ((t.auto === auto && t.affarId === a.id) || (!t.auto && t.kundId === off.kundId && String(t.text || '').startsWith(borjan))));
      if (finns) Object.assign(finns, { text, auto, affarId: a.id, ansvarig: a.ansvarig, datum: nu.slice(0, 10) });
      else db.todos.push({ id: nyttId('t'), text, kundId: off.kundId, affarId: a.id, auto, ansvarig: a.ansvarig, datum: nu.slice(0, 10), klar: false });
    }
    return { ok: true };
  }

  /* Hälsoformuläret: utkast och svar från deltagaren --------------------------------------------- */
  // Tillåtna nycklar: frågornas id + samtycke. Text högst 200 tecken, samtycket sant/falskt.
  function tvattaHalsosvar(s) {
    if (!arObjekt(s)) return { fel: [{ falt: '', meddelande: 'Ska vara ett objekt' }] };
    const tillatna = {}; HALSOFRAGOR.forEach((f) => { tillatna[f.id] = true; });
    const ut = {}; const felLista = [];
    Object.keys(s).forEach((k) => {
      const v = s[k];
      if (k === 'samtycke') { if (typeof v === 'boolean') ut.samtycke = v; else felLista.push({ falt: k, meddelande: 'Ska vara sant eller falskt' }); return; }
      if (!tillatna[k]) { felLista.push({ falt: k, meddelande: 'Okänd fråga' }); return; }
      if (typeof v !== 'string' || v.length > 200) { felLista.push({ falt: k, meddelande: 'Text, högst 200 tecken' }); return; }
      ut[k] = v;
    });
    return felLista.length ? { fel: felLista } : { svar: ut };
  }

  function sparaHalsoutkast(db, nyckel, utkast, nu) {
    sakra(db);
    const g = giltigHalsa(db, nyckel); if (!g.ok) return g;
    const t = tvattaHalsosvar(utkast);
    if (t.fel) return fel(400, 'ogiltig', 'Utkastet kunde inte sparas.', t.fel);
    g.form.utkast = t.svar; g.form.andrad = nu;
    return { ok: true };
  }

  function skickaHalsosvar(db, nyckel, svar, nu) {
    sakra(db);
    const g = giltigHalsa(db, nyckel); if (!g.ok) return g;
    const t = tvattaHalsosvar(svar);
    if (t.fel) return fel(400, 'ogiltig', 'Svaren kunde inte läsas.', t.fel);
    const felObj = kontrolleraHalsosvar(t.svar);
    if (Object.keys(felObj).length) return fel(422, 'ogiltigt', 'Några svar saknas eller behöver rättas.', felObj);
    const form = g.form; const forstaGangen = form.status !== 'besvarad';
    form.status = 'besvarad'; form.besvarad = nu; form.andrad = nu;
    form.svar = { ...t.svar, vikt: String(t.svar.vikt).replace(',', '.'), langd: String(t.svar.langd).replace(',', '.') };
    delete form.utkast;
    if (forstaGangen) {
      // Sista deltagaren som svarar: samtyckena är insamlade för hela beställningen
      const hl = halsoLage(g.lank, db.halsoformular);
      if (hl.alla) {
        db.aktiviteter.push({ id: nyttId('x'), kundId: form.kundId, affarId: form.affarId, typ: 'system', text: `Alla ${hl.totalt} deltagare har svarat på hälsoformuläret – samtycken insamlade.`, av: 'kund', tid: nu });
        const a = hittaAffar(db, form.affarId);
        if (a) a.check = { ...(a.check || {}), samtycke: true };
      }
    }
    return { ok: true };
  }

  return {
    nyNyckel, nyttId, krText,
    giltigLank, giltigOffert, giltigHalsa,
    vyKundlank, vyOffert, vyHalsa,
    oppnaLank, sparaLank, skickaHalsa, paminnHalsa, skickaIn,
    oppnaOffert, godkannOffert,
    oppnaHalsa, sparaHalsoutkast, skickaHalsosvar,
  };
})();
