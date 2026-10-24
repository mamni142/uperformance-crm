/* Uperformance CRM – datalagret (window.UPLager). Allt som läser eller skriver CRM-data går härigenom.

   Demoläge (python -m http.server, file://, Vercel): allt ligger i webbläsarens localStorage ('up-crm-v1',
   version 5) precis som i prototypen, och flikar synkar via storage-händelsen.
   Skarpt läge (sidorna serveras av node server/server.js, som sätter window.UP_SKARPT i skarpt.js):
   servern äger datan. Ändringar skickas som versionerade poster (allt eller inget per anrop), andras
   ändringar hämtas med polling. Ingen CRM-data sparas i webbläsaren.

   Kontraktet står i server/ARKITEKTUR.md (avsnitt 6 och 8). Filen får inte kräva data.js eller
   kundlogik.js när den laddas – bara när en funktion som behöver dem anropas. */
(() => {
  'use strict';

  /* 01-läge --------------------------------------------------------------------------- */
  const LAGRING = 'up-crm-v1';
  // Exempeldatans version (skapaExempeldata i data.js): sparad demodata med en annan version ersätts med ny exempeldata
  const DATAVERSION = 9;
  const S = window.UP_SKARPT && typeof window.UP_SKARPT === 'object' && window.UP_SKARPT.lage === 'skarp' ? window.UP_SKARPT : null;
  const skarp = !!S;
  const lage = Object.freeze(skarp
    ? { lage: 'skarp', miljo: String(S.miljo || 'lokal'), version: String(S.version || ''), halsoformular: !!S.halsoformular, aterstallning: !!S.aterstallning, filer: S.filer !== false }
    : { lage: 'demo', miljo: 'demo', version: 'demo', halsoformular: true, aterstallning: true, filer: false });
  let inloggadNu = skarp ? !!S.inloggad : false;
  let jagNu = skarp && S.jag ? { ...S.jag } : null;
  let lamnar = false; // sidan är på väg till inloggningen – varna inte för osparat

  const VANTA = [2000, 5000, 10000, 15000]; // omförsök efter nätverksfel (högst 15 s – och direkt när servern svarar igen)
  const POLL_MS = 15000;
  const enc = encodeURIComponent;
  const vanta = (ms) => new Promise((r) => setTimeout(r, ms));
  const nuISO = () => new Date().toISOString();
  const kopia = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
  const demoFel = () => ({ ok: false, fel: 'demo', status: 501, meddelande: 'Finns bara i den skarpa versionen.' });
  const KROCK = 'Någon annan hann ändra samma sak – din senaste ändring sparades inte. Försök igen.';

  const kanal = (() => {
    if (!skarp || typeof BroadcastChannel === 'undefined') return null;
    try { return new BroadcastChannel('up-crm'); } catch (err) { return null; }
  })();
  const sandKanal = (m) => { try { if (kanal) kanal.postMessage(m); } catch (err) { /* ignorera */ } };

  /* 02-anrop till servern ---------------------------------------------------------------
     Löser alltid med ett Svar – avvisar aldrig. Nätverksfel ger { ok: false, fel: 'natverk', status: 0 }. */
  async function anrop(metod, vag, kropp, opt = {}) {
    const rubriker = { Accept: 'application/json' };
    const init = { method: metod, headers: rubriker, credentials: 'same-origin', cache: 'no-store' };
    if (metod !== 'GET' && metod !== 'HEAD') {
      rubriker['X-UP'] = '1';
      if (opt.fil) {
        rubriker['Content-Type'] = opt.fil.type || 'application/octet-stream';
        rubriker['X-Filnamn'] = enc(opt.fil.name || 'fil');
        init.body = opt.fil;
      } else {
        rubriker['Content-Type'] = 'application/json';
        init.body = typeof kropp === 'string' ? kropp : JSON.stringify(kropp || {});
      }
    }
    if (opt.bakgrund) rubriker['X-UP-Bakgrund'] = '1';
    if (opt.keepalive) init.keepalive = true;
    let svar;
    try { svar = await fetch(vag, init); } catch (err) { return { ok: false, fel: 'natverk', status: 0, meddelande: 'Kunde inte nå servern.' }; }
    let data = null;
    try { data = await svar.json(); } catch (err) { data = null; }
    if (svar.ok && (!data || data.ok !== false)) return { ...(data || {}), ok: true, status: svar.status };
    return {
      ...(data || {}), ok: false, status: svar.status,
      fel: (data && data.fel) || (svar.status === 404 ? 'saknas' : 'serverfel'),
      meddelande: (data && data.meddelande) || `Servern svarade med fel (${svar.status}).`,
    };
  }

  /* 03-inloggning ------------------------------------------------------------------------ */
  let pavag = false;
  // orsak (från servern, 401): inaktiverad | utloggad-av-admin – inloggningssidan säger varför
  const ORSAKER = ['inaktiverad', 'utloggad-av-admin'];
  function tillInloggning(orsak) {
    lamnar = true;
    if (pavag) return; pavag = true; // bara en omdirigering
    const h = location.hash; const q = new URLSearchParams();
    if (/^#\/[\w\/-]+$/.test(h)) q.set('nasta', h);
    if (ORSAKER.includes(orsak)) q.set('orsak', orsak);
    location.replace('logga-in.html' + (q.toString() ? '?' + q : ''));
  }
  function inloggad() {
    if (skarp) return inloggadNu;
    try { return !!localStorage.getItem('up-crm-inloggad'); } catch (err) { return true; } // privat läge – släpp in (som förut)
  }
  const jag = () => (skarp && jagNu ? { ...jagNu } : null);
  async function begarKod(epost) {
    if (!skarp) return demoFel();
    return anrop('POST', '/api/inloggning/kod', { epost: String(epost || '').trim() });
  }
  async function loggaIn(epost, kod) {
    if (!skarp) return demoFel();
    const svar = await anrop('POST', '/api/inloggning/verifiera', { epost: String(epost || '').trim(), kod: String(kod || '').replace(/\s/g, '') });
    if (svar.ok) {
      inloggadNu = true; jagNu = svar.jag ? { ...svar.jag } : null;
      sandKanal({ typ: 'inloggad', id: jagNu && jagNu.id });
    }
    return svar;
  }
  async function loggaUt() {
    if (!skarp) { try { localStorage.removeItem('up-crm-inloggad'); } catch (err) { /* ignorera */ } return; }
    window.UP_LOGGAR_UT = true; // inloggningsvakten i den här fliken ska inte reagera på vårt eget meddelande
    try { await tomSpara(); } catch (err) { /* ignorera */ }
    stoppaPolling();
    await anrop('POST', '/api/utloggning', {});
    inloggadNu = false; jagNu = null; lamnar = true;
    sandKanal({ typ: 'utloggad' });
    try { localStorage.setItem('up-crm-utloggning', String(Date.now())); } catch (err) { /* ignorera */ }
  }
  function blevUtloggad(svar) {
    if (lamnar) return;
    inloggadNu = false; stoppaPolling();
    meddela({ db: dbRef, orsak: 'utloggad', andrade: null });
    tillInloggning(svar && svar.orsak);
  }

  /* 04-demoläget: localStorage som i prototypen ------------------------------------------ */
  const lasLagring = () => {
    try { const r = localStorage.getItem(LAGRING); if (r) { const d = JSON.parse(r); if (d && d.version === DATAVERSION) return d; } } catch (err) { /* privat läge */ }
    return null;
  };
  const skrivLagring = (d) => { try { localStorage.setItem(LAGRING, JSON.stringify(d)); } catch (err) { /* fullt eller privat läge */ } };
  const sakra = (d) => { d.kundlankar = d.kundlankar || {}; d.offerter = d.offerter || {}; d.halsoformular = d.halsoformular || {}; return d; };
  // Kunden kan ha ändrat sin länk (eller godkänt en offert) i en annan flik – behåll den nyaste versionen av varje
  function demoSpara(db) {
    try {
      const lagrad = JSON.parse(localStorage.getItem(LAGRING) || 'null');
      ['kundlankar', 'offerter', 'halsoformular'].forEach((s) => {
        if (!lagrad || !lagrad[s]) return;
        Object.entries(lagrad[s]).forEach(([t, x]) => { const var_ = db[s][t]; if (!var_ || String(x.andrad || '') > String(var_.andrad || '')) db[s][t] = x; });
      });
      localStorage.setItem(LAGRING, JSON.stringify(db));
    } catch (err) { /* fullt eller privat läge */ }
  }

  /* 05-skarpt läge: ögonblicksbild, sparande och polling ---------------------------------- */
  const LISTOR = ['kunder', 'affarer', 'projekt', 'aktiviteter', 'todos', 'dokument'];
  const KARTOR = ['kundlankar', 'offerter'];
  const SKRIVBARA = [...LISTOR, ...KARTOR];
  const ALLA_LISTOR = ['anvandare', ...LISTOR];
  const ALLA_KARTOR = [...KARTOR, 'halsoformular'];
  const ALLA = [...ALLA_LISTOR, ...ALLA_KARTOR];
  let dbRef = null;               // samma objekt som ladda() gav – ändras alltid på plats
  const bild = new Map();         // 'samling\0id' → { json, version } som servern senast bekräftade
  let sekvens = 0;                // markören för polling
  const lyssnare = new Set();
  // 'samling\0id' → kontot som senast sparade posten på servern (polling, krockar, egna sparningar) – arket i crm.js
  // säger vem som ändrade samma fält ("Magnus ändrade telefonen till …"). Bara i minnet.
  const andradAv = new Map();
  const nyckel = (s, id) => s + '\u0000' + id;
  const arLista = (s) => ALLA_LISTOR.includes(s);
  const poster = (db, s) => (arLista(s) ? (db[s] || []).filter((x) => x && x.id != null).map((x) => [String(x.id), x]) : Object.entries(db[s] || {}));
  const hamtaPost = (db, s, id) => (arLista(s) ? (db[s] || []).find((x) => x && String(x.id) === id) : (db[s] || {})[id]);
  const ersattInnehall = (gammal, ny) => { Object.keys(gammal).forEach((k) => { delete gammal[k]; }); return Object.assign(gammal, ny); };
  // Byt ut en post på plats (samma objekt behålls, så att referenser i gränssnittet fortsätter gälla)
  function sattPost(db, s, id, data) {
    const ny = kopia(data);
    if (arLista(s)) {
      db[s] = db[s] || [];
      const i = db[s].findIndex((x) => x && String(x.id) === id);
      if (i >= 0 && db[s][i] && typeof db[s][i] === 'object') ersattInnehall(db[s][i], ny);
      else if (i >= 0) db[s][i] = ny; else db[s].push(ny);
    } else {
      db[s] = db[s] || {};
      const g = db[s][id];
      if (g && typeof g === 'object' && !Array.isArray(g)) ersattInnehall(g, ny); else db[s][id] = ny;
    }
  }
  function taBortPost(db, s, id) {
    if (arLista(s)) { const i = (db[s] || []).findIndex((x) => x && String(x.id) === id); if (i >= 0) db[s].splice(i, 1); }
    else if (db[s]) delete db[s][id];
  }
  function fyllPaPlats(mal, ny) {
    mal.version = DATAVERSION;
    ALLA_LISTOR.forEach((s) => { if (!Array.isArray(mal[s])) mal[s] = []; mal[s].length = 0; ((ny && ny[s]) || []).forEach((x) => mal[s].push(x)); });
    ALLA_KARTOR.forEach((s) => {
      if (!mal[s] || typeof mal[s] !== 'object' || Array.isArray(mal[s])) mal[s] = {};
      Object.keys(mal[s]).forEach((k) => { delete mal[s][k]; });
      Object.assign(mal[s], (ny && ny[s]) || {});
    });
    return mal;
  }
  function byggBild(db, versioner) {
    bild.clear(); andradAv.clear();
    ALLA.forEach((s) => poster(db, s).forEach(([id, el]) => {
      const v = versioner && versioner[s] && versioner[s][id];
      bild.set(nyckel(s, id), { json: JSON.stringify(el), version: Number.isFinite(v) ? v : 1 });
    }));
  }
  // Allt som skiljer sig från ögonblicksbilden: nytt, ändrat – och borttaget. En post som servern har bekräftat men som
  // gränssnittet har tagit bort (ta bort kund, aktivitet) skickas som raderad. Servern raderar bara åt administratörer;
  // för andra blir det 403 och posten läggs tillbaka (aterstallBatch).
  function osparade(db) {
    const ut = [];
    if (!db) return ut;
    const lokala = new Set();
    SKRIVBARA.forEach((s) => poster(db, s).forEach(([id, el]) => {
      const k = nyckel(s, id); lokala.add(k);
      const json = JSON.stringify(el); const b = bild.get(k);
      if (!b) ut.push({ samling: s, id, version: 0, json });
      else if (b.json !== json) ut.push({ samling: s, id, version: b.version, json });
    }));
    bild.forEach((b, k) => {
      if (b.json == null || lokala.has(k)) return;
      const [s, id] = k.split('\u0000');
      if (SKRIVBARA.includes(s)) ut.push({ samling: s, id, version: b.version, raderad: true });
    });
    return ut;
  }
  const kroppFor = (lista) => '{"andringar":[' + lista.map((a) => (a.raderad
    ? `{"samling":${JSON.stringify(a.samling)},"id":${JSON.stringify(a.id)},"version":${a.version},"raderad":true}`
    : `{"samling":${JSON.stringify(a.samling)},"id":${JSON.stringify(a.id)},"version":${a.version},"data":${a.json}}`)).join(',') + ']}';
  function meddela(h) { lyssnare.forEach((fn) => { try { fn(h); } catch (err) { console.error(err); } }); }

  async function ladda(opt = {}) {
    if (!skarp) return sakra(lasLagring() || skapaExempeldata());
    // Inte inloggad enligt servern (skarpt.js): inloggningsvakten i index.html är redan på väg till inloggningen
    if (!inloggadNu) { lamnar = true; if (!window.UP_OMDIRIGERAR) tillInloggning(); return new Promise(() => {}); }
    for (let forsok = 0; ; forsok++) {
      const svar = await anrop('GET', '/api/allt');
      if (svar.ok && svar.db) {
        const db = fyllPaPlats(dbRef || {}, svar.db);
        dbRef = db; byggBild(db, svar.versioner); sekvens = Number(svar.sekvens) || 0;
        if (svar.jag) { jagNu = { ...svar.jag }; inloggadNu = true; }
        startaPolling();
        return db;
      }
      if (svar.status === 401) { inloggadNu = false; tillInloggning(svar.orsak); return new Promise(() => {}); }
      if (typeof opt.vidFel === 'function') { try { opt.vidFel(svar, forsok); } catch (err) { /* ignorera */ } }
      await vanta(VANTA[Math.min(forsok, VANTA.length - 1)]);
    }
  }
  // Hämtar allt på nytt och ersätter innehållet på plats (för många ändringar, återställning, okänt fel)
  async function laddaOm(orsak, meddelande) {
    const svar = await anrop('GET', '/api/allt');
    if (!svar.ok || !svar.db) { if (svar.status === 401) blevUtloggad(svar); return svar; }
    fyllPaPlats(dbRef, svar.db); byggBild(dbRef, svar.versioner); sekvens = Number(svar.sekvens) || 0;
    if (svar.jag) jagNu = { ...svar.jag };
    if (orsak) meddela({ db: dbRef, orsak, andrade: null, meddelande });
    return { ok: true, db: dbRef };
  }

  // Spara: samlas 250 ms efter senaste anropet (högst 2 s), ett anrop i taget
  let sparTimer = 0; let forstaVantan = 0; let vantare = []; let igang = null;
  let omforsokTimer = 0; let natverkForsok = 0; let natverkVisat = false;
  function skarpSpara(db) {
    if (db && !dbRef) dbRef = db;
    return new Promise((losa) => {
      vantare.push(losa);
      const nu = Date.now(); if (!forstaVantan) forstaVantan = nu;
      clearTimeout(sparTimer);
      sparTimer = setTimeout(kor, Math.max(0, Math.min(250, forstaVantan + 2000 - nu)));
    });
  }
  function kor() {
    clearTimeout(sparTimer); sparTimer = 0;
    if (igang) return igang; // körs igen när det pågående anropet är klart
    const mina = vantare; vantare = []; forstaVantan = 0;
    const p = (async () => {
      let svar;
      try { svar = await skickaAndringar(); } catch (err) { console.error(err); svar = { ok: false, fel: 'serverfel', status: 500, meddelande: String((err && err.message) || err) }; }
      mina.forEach((f) => f(svar));
      return svar;
    })();
    igang = p;
    p.then(() => { igang = null; if (vantare.length && !sparTimer) sparTimer = setTimeout(kor, 0); });
    return p;
  }
  // Skicka allt som väntar nu (före utloggning)
  async function tomSpara() {
    if (!skarp || !dbRef) return;
    for (let i = 0; i < 4; i++) {
      if (igang) await igang;
      if (!osparade(dbRef).length) { const v = vantare; vantare = []; forstaVantan = 0; clearTimeout(sparTimer); sparTimer = 0; v.forEach((f) => f({ ok: true, skickade: 0 })); return; }
      const svar = await kor();
      if (!svar || !svar.ok) return;
    }
  }
  async function skickaAndringar() {
    const db = dbRef;
    if (!db || !inloggadNu) return { ok: true, skickade: 0 };
    const lista = osparade(db);
    if (!lista.length) return { ok: true, skickade: 0 };
    let skickade = 0;
    for (let i = 0; i < lista.length; i += 200) {
      const del = lista.slice(i, i + 200);
      const svar = await anrop('POST', '/api/andringar', kroppFor(del));
      if (svar.ok) { tillampaResultat(db, del, svar.resultat); skickade += del.length; continue; }
      if (svar.status === 0 || svar.status >= 500) { natverksfel(); return svar; }
      natverkKlart();
      if (svar.status === 401) { blevUtloggad(svar); return svar; }
      aterstallBatch(db, del, svar);
      return svar;
    }
    natverkKlart();
    sandKanal({ typ: 'sparat' });
    return { ok: true, skickade };
  }
  let natverkKoll = 0; // så länge något inte är sparat: fråga servern var 3:e sekund – då sparas det direkt när den svarar igen
  function natverksfel() {
    const v = VANTA[Math.min(natverkForsok++, VANTA.length - 1)];
    if (!natverkVisat) { natverkVisat = true; meddela({ db: dbRef, orsak: 'natverk', andrade: [], meddelande: 'Kunde inte spara – försöker igen' }); }
    if (!natverkKoll) natverkKoll = setInterval(() => { if (!natverkVisat) { clearInterval(natverkKoll); natverkKoll = 0; return; } polla(false); }, 3000);
    clearTimeout(omforsokTimer);
    omforsokTimer = setTimeout(() => { omforsokTimer = 0; if (!sparTimer && !igang && osparade(dbRef).length) kor(); }, v);
  }
  function natverkKlart() {
    if (natverkVisat) meddela({ db: dbRef, orsak: 'natverk-klart', andrade: [], meddelande: 'Allt är sparat igen' });
    natverkForsok = 0; natverkVisat = false; clearTimeout(omforsokTimer); omforsokTimer = 0; clearInterval(natverkKoll); natverkKoll = 0;
  }
  function tillampaResultat(db, del, resultat) {
    const per = new Map((resultat || []).map((r) => [nyckel(r.samling, String(r.id)), r]));
    del.forEach((a) => {
      const r = per.get(nyckel(a.samling, a.id)); if (!r) return;
      if (jagNu && jagNu.id) andradAv.set(nyckel(a.samling, a.id), jagNu.id);
      if (a.raderad) { bild.set(nyckel(a.samling, a.id), { json: null, version: r.version }); return; }
      if (r.data) {
        // Servern ändrade posten (t.ex. satte författaren) – ta in den om ingen hunnit ändra lokalt under tiden
        const lokal = hamtaPost(db, a.samling, a.id);
        if (lokal !== undefined && JSON.stringify(lokal) === a.json) sattPost(db, a.samling, a.id, r.data);
        bild.set(nyckel(a.samling, a.id), { json: JSON.stringify(r.data), version: r.version });
      } else bild.set(nyckel(a.samling, a.id), { json: a.json, version: r.version });
    });
  }
  function feltext(svar) {
    if (svar.fel === 'krock') return KROCK;
    if (svar.fel === 'last') return 'Kunden har redan godkänt eller signerat dokumentet – din ändring sparades inte.';
    if (svar.fel === 'behorighet') return 'Ändringen är inte tillåten – den sparades inte.';
    if (svar.fel === 'halsoformular-av') return 'Hälsoformuläret är avstängt – ändringen sparades inte.';
    if (svar.fel === 'ogiltig') { const d = Array.isArray(svar.detaljer) && svar.detaljer[0]; return `Ändringen kunde inte sparas${d && d.meddelande ? ': ' + d.meddelande : '.'}`; }
    return svar.meddelande || 'Ändringen kunde inte sparas.';
  }
  // Ingenting sparades: varje post i anropet återställs till serverns läge. bas = det den lokala ändringen utgick från
  // (bilden före krocken) – med bas, fore (min version) och efter (serverns) kan crm.js göra om ändringen fält för fält.
  function aterstallBatch(db, del, svar) {
    const meddelande = feltext(svar);
    if (!Array.isArray(svar.aktuella)) { laddaOm('konflikt', meddelande); return; }
    const andrade = [];
    svar.aktuella.forEach((p) => {
      if (!p || !ALLA.includes(p.samling)) return;
      const s = p.samling; const id = String(p.id); const k = nyckel(s, id);
      const lokal = hamtaPost(db, s, id); const fore = lokal === undefined ? null : kopia(lokal);
      const b = bild.get(k); let bas = null; try { bas = b && b.json != null ? JSON.parse(b.json) : null; } catch (err) { bas = null; }
      if (p.andradAv) andradAv.set(k, String(p.andradAv));
      if (!p.data || p.raderad) { if (lokal !== undefined) taBortPost(db, s, id); if (p.data === null && !p.raderad) bild.delete(k); else bild.set(k, { json: null, version: p.version }); }
      else { sattPost(db, s, id, p.data); bild.set(k, { json: JSON.stringify(p.data), version: p.version }); }
      andrade.push({ samling: s, id, fore, efter: p.data && !p.raderad ? kopia(p.data) : null, bas });
    });
    meddela({ db, orsak: 'konflikt', andrade, meddelande, fel: svar.fel });
    // Hämta kollegornas ändringar direkt, så att nästa försök utgår från det aktuella läget
    // (t.ex. ett offertnummer som en kollega just tog – annars räknas samma nummer fram igen)
    polla(false);
  }

  // Polling: var 15:e sekund i bakgrunden, direkt när fliken får fokus; pausar när fliken är dold
  let pollTimer = 0; let pollar = false; let pollStartad = false; let pollStoppad = false; let senastPoll = 0;
  function startaPolling() {
    if (pollStartad) return; pollStartad = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') polla(false); else { clearTimeout(pollTimer); pollTimer = 0; } });
    addEventListener('focus', () => polla(false));
    if (kanal) {
      kanal.addEventListener('message', (ev) => {
        const m = ev.data || {};
        if (m.typ === 'sparat') polla(false);
        // Någon loggade in som en annan person i en annan flik – sessionskakan är delad, så börja om
        if (m.typ === 'inloggad' && jagNu && m.id && m.id !== jagNu.id) { lamnar = true; location.reload(); }
      });
    }
    nastaPoll();
  }
  function stoppaPolling() { pollStoppad = true; clearTimeout(pollTimer); pollTimer = 0; }
  function nastaPoll() {
    clearTimeout(pollTimer); pollTimer = 0;
    if (pollStoppad || !inloggadNu || document.visibilityState === 'hidden') return;
    pollTimer = setTimeout(() => polla(true), POLL_MS);
  }
  async function polla(bakgrund) {
    if (!skarp || !dbRef || pollStoppad || !inloggadNu || pollar) return;
    if (!bakgrund && Date.now() - senastPoll < 1000) { clearTimeout(pollTimer); pollTimer = setTimeout(() => polla(false), 1000); return; }
    pollar = true; clearTimeout(pollTimer); pollTimer = 0; senastPoll = Date.now();
    try {
      const svar = await anrop('GET', '/api/andringar?sedan=' + enc(sekvens), null, { bakgrund });
      if (svar.ok) {
        if (svar.forMycket) await laddaOm('aterstalld');
        else { tillampaPoster(svar.poster || []); if (Number.isFinite(svar.sekvens)) sekvens = Math.max(sekvens, svar.sekvens); }
        // Servern svarar igen efter ett nätverksfel: spara det som väntar direkt i stället för att vänta på nästa omförsök
        if (natverkVisat && !igang && !sparTimer) { if (osparade(dbRef).length) { clearTimeout(omforsokTimer); omforsokTimer = 0; kor(); } else natverkKlart(); }
      } else if (svar.status === 401) blevUtloggad(svar);
    } finally { pollar = false; nastaPoll(); }
  }
  function tillampaPoster(lista) {
    const db = dbRef; const andrade = [];
    lista.forEach((p) => {
      if (!p || !ALLA.includes(p.samling)) return;
      const s = p.samling; const id = String(p.id); const k = nyckel(s, id); const b = bild.get(k);
      if (b && p.version <= b.version) return; // eget eko eller redan känt
      if (p.andradAv) andradAv.set(k, String(p.andradAv));
      const lokal = hamtaPost(db, s, id);
      if (lokal !== undefined && (!b || JSON.stringify(lokal) !== b.json)) return; // osparade lokala ändringar – krocken syns när de sparas
      const fore = lokal === undefined ? null : kopia(lokal);
      const borta = p.raderad || !p.data;
      if (borta) { if (lokal !== undefined) taBortPost(db, s, id); bild.set(k, { json: null, version: p.version }); }
      else { sattPost(db, s, id, p.data); bild.set(k, { json: JSON.stringify(p.data), version: p.version }); }
      if (fore || !borta) andrade.push({ samling: s, id, fore, efter: borta ? null : kopia(p.data) });
    });
    if (andrade.length) meddela({ db, orsak: 'synk', andrade });
  }

  // Försök spara nu (knappen "Försök nu" i sparstatusen och när datorn kommer tillbaka på nätet)
  function forsokNu() {
    if (!skarp || !dbRef) return Promise.resolve({ ok: true, skickade: 0 });
    clearTimeout(omforsokTimer); omforsokTimer = 0;
    if (igang) return igang;
    if (osparade(dbRef).length) return kor();
    if (natverkVisat) natverkKlart();
    polla(false);
    return Promise.resolve({ ok: true, skickade: 0 });
  }
  if (skarp) {
    addEventListener('online', () => { if (natverkVisat || (dbRef && osparade(dbRef).length)) forsokNu(); else polla(false); });
    // Varna innan sidan stängs med ändringar som inte hunnit sparas …
    addEventListener('beforeunload', (ev) => {
      if (lamnar || !dbRef || !inloggadNu) return;
      if (sparTimer || igang || osparade(dbRef).length) { ev.preventDefault(); ev.returnValue = ''; }
    });
    // … och skicka det som väntar när sidan ändå lämnas
    addEventListener('pagehide', () => {
      if (!dbRef || !inloggadNu || igang) return;
      const lista = osparade(dbRef).slice(0, 200); if (!lista.length) return;
      try { fetch('/api/andringar', { method: 'POST', keepalive: true, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-UP': '1' }, body: kroppFor(lista) }).catch(() => {}); } catch (err) { /* för stort för keepalive */ }
    });
  }

  /* 06-CRM:ets gränssnitt ------------------------------------------------------------------ */
  function spara(db) {
    if (!skarp) { demoSpara(db); return Promise.resolve({ ok: true, skickade: 0 }); }
    return skarpSpara(db);
  }
  function prenumerera(fn) {
    if (typeof fn !== 'function') return () => {};
    if (skarp) { lyssnare.add(fn); return () => lyssnare.delete(fn); }
    const hantera = (ev) => {
      if (ev.key !== LAGRING || !ev.newValue) return;
      let farsk; try { farsk = JSON.parse(ev.newValue); } catch (err) { return; }
      if (!farsk || farsk.version !== DATAVERSION) return;
      fn({ db: sakra(farsk), orsak: 'lagring', andrade: null });
    };
    addEventListener('storage', hantera);
    return () => removeEventListener('storage', hantera);
  }
  const synka = () => (skarp ? polla(false) : Promise.resolve());
  async function aterstallExempeldata() {
    if (!skarp) {
      // Återställningen skriver den nya datan rakt in – sammanslagningen i demoSpara skulle behålla ändrade offerter och kundlänkar
      const ny = sakra(skapaExempeldata()); skrivLagring(ny);
      return { ok: true, db: ny };
    }
    if (igang) await igang;
    const svar = await crmAnrop('POST', '/api/admin/aterstall', {});
    if (!svar.ok) return svar;
    const ny = await laddaOm(null);
    if (!ny.ok) return ny;
    sandKanal({ typ: 'sparat' });
    return { ok: true, db: dbRef };
  }
  async function crmAnrop(metod, vag, kropp, opt) {
    const svar = await anrop(metod, vag, kropp, opt);
    if (svar.status === 401) blevUtloggad(svar);
    return svar;
  }
  // Hämta allt på nytt (t.ex. när den egna rollen har ändrats – servern visar andras konton olika för olika roller)
  const hamtaOm = () => (skarp && dbRef ? laddaOm('aterstalld') : Promise.resolve({ ok: true }));
  const filer = {
    async laddaUpp(dokumentId, fil) {
      if (!skarp) return demoFel();
      if (!dokumentId || !fil) return { ok: false, fel: 'ogiltig', status: 400, meddelande: 'Ingen fil vald.' };
      return crmAnrop('POST', '/api/filer/' + enc(dokumentId), null, { fil });
    },
    url: (dokumentId) => (skarp && dokumentId ? '/api/filer/' + enc(dokumentId) : null),
    // Filskannerns stopp och varningar till serverns säkerhetslogg (alla inloggade; högst 10 filer per anrop)
    skanning: async (kalla, resultat) => (skarp ? crmAnrop('POST', '/api/filskanning', { kalla: String(kalla || 'uppladdning'), resultat: (resultat || []).slice(0, 10) }) : demoFel()),
  };
  // Loggens filter (server/api-admin.js loggFilter): vem, typ, kund, fran, till, utanHamtningar
  const loggFraga = (opt = {}) => {
    const q = new URLSearchParams();
    if (opt.antal) q.set('antal', String(opt.antal));
    if (opt.fore) q.set('fore', String(opt.fore));
    ['vem', 'typ', 'kund', 'fran', 'till'].forEach((k) => { if (opt[k]) q.set(k, String(opt[k])); });
    if (opt.utanHamtningar) q.set('utanHamtningar', '1');
    return q.toString() ? '?' + q : '';
  };
  const efterAdmin = (svar) => { if (svar.ok) polla(false); return svar; };
  /* Kontots egna uppgifter (skarpt läge, server/api-konto.js): servern svarar med kontots post och version – den tas in
     direkt (samma objekt i db.anvandare), så att polling känner igen sitt eget eko. Demoläget: { ok: false, fel: 'demo' }. */
  function tillampaKonto(svar) {
    if (!svar.ok || !svar.anvandare || !dbRef) return svar;
    const id = String(svar.anvandare.id);
    sattPost(dbRef, 'anvandare', id, svar.anvandare);
    if (Number.isFinite(svar.version)) bild.set(nyckel('anvandare', id), { json: JSON.stringify(svar.anvandare), version: svar.version });
    return { ...svar, anvandare: hamtaPost(dbRef, 'anvandare', id) };
  }
  const kontoVag = (id) => '/api/konto/' + enc(id);
  const konto = {
    // { status, titel, tel, om, bild } för det egna kontot; { titel, tel, om, bild, mal, arbetsdagar } för den som leder
    andra: async (id, andring) => (skarp ? tillampaKonto(await crmAnrop('PATCH', kontoVag(id), andring || {})) : demoFel()),
    // { fid?, typ, fran, till, notering } – ny eller ändrad frånvaro (svaret har franvaro = raden med sin status)
    franvaro: async (id, post) => (skarp ? tillampaKonto(await crmAnrop('POST', kontoVag(id) + '/franvaro', post || {})) : demoFel()),
    taBortFranvaro: async (id, fid) => (skarp ? tillampaKonto(await crmAnrop('DELETE', kontoVag(id) + '/franvaro/' + enc(fid), {})) : demoFel()),
    // status 'godkand' | 'nekad' (skal = valfritt skäl vid nekad) – 'ansokt' ångrar det egna beslutet inom tio minuter
    beslut: async (id, fid, status, skal) => (skarp ? tillampaKonto(await crmAnrop('POST', kontoVag(id) + '/franvaro/' + enc(fid) + '/beslut', { status, ...(skal ? { skal } : {}) })) : demoFel()),
  };
  /* Testteamet markerar att en deltagare med medicinskt hinder är kontaktad (skarpt läge, server/api-crm.js POST
     /api/halsoformular/kontaktad – ARKITEKTUR.md 6.8). Uppgiften sparas på hälsoformuläret, som CRM:et inte skriver själv:
     svaret är formulärets post (med pseudonymen som id) och tas in direkt, så att polling känner igen sitt eget eko.
     lank = kundlänkens nyckel, deltagare = deltagarens id i länken. Demoläget: { ok: false, fel: 'demo' } (crm.js skriver i db). */
  async function halsoKontakt(lank, deltagare, kontaktad) {
    if (!skarp) return demoFel();
    const svar = await crmAnrop('POST', '/api/halsoformular/kontaktad', { lank: String(lank || ''), deltagare: String(deltagare || ''), kontaktad: !!kontaktad });
    if (svar.ok && svar.post && svar.post.data && dbRef) {
      const id = String(svar.post.id);
      sattPost(dbRef, 'halsoformular', id, svar.post.data);
      if (Number.isFinite(svar.post.version)) bild.set(nyckel('halsoformular', id), { json: JSON.stringify(svar.post.data), version: svar.post.version });
    }
    return svar;
  }
  const admin = {
    lista: async () => (skarp ? crmAnrop('GET', '/api/admin/anvandare') : demoFel()),
    skapa: async (u) => (skarp ? efterAdmin(await crmAnrop('POST', '/api/admin/anvandare', u || {})) : demoFel()),
    uppdatera: async (id, andring) => (skarp ? efterAdmin(await crmAnrop('PATCH', '/api/admin/anvandare/' + enc(id), andring || {})) : demoFel()),
    // Makulera ett låst dokument (godkänd offert / signerad order) – loggas på servern
    makulera: async (id, orsak) => (skarp ? efterAdmin(await crmAnrop('POST', '/api/admin/makulera', { samling: 'offerter', id: String(id || ''), orsak: String(orsak || '') })) : demoFel()),
    logg: async (opt = {}) => (skarp ? crmAnrop('GET', '/api/admin/logg' + loggFraga(opt)) : demoFel()),
    // Säkerhetshubben på servern: senaste skanningen, historiken och säkerhetsloggen; en klar skanning; händelser (installning, rensning)
    sakerhet: async () => (skarp ? crmAnrop('GET', '/api/admin/sakerhet') : demoFel()),
    skanning: async (kontroller, vad) => (skarp ? crmAnrop('POST', '/api/admin/sakerhet/skanning', { kontroller: kontroller || {}, vad: String(vad || '') }) : demoFel()),
    handelse: async (typ, text) => (skarp ? crmAnrop('POST', '/api/admin/handelse', { typ: String(typ || ''), text: String(text || '').slice(0, 300) }) : demoFel()),
    /* Exporten byggs och loggas på servern – svaret är filen: { ok, blob, namn } eller ett fel */
    exportera: async ({ utanPnr = true, utanHalsa = true } = {}) => {
      if (!skarp) return demoFel();
      let svar;
      try { svar = await fetch(`/api/admin/export?utanPnr=${utanPnr ? 1 : 0}&utanHalsa=${utanHalsa ? 1 : 0}`, { credentials: 'same-origin', cache: 'no-store' }); } catch (err) { return { ok: false, fel: 'natverk', status: 0, meddelande: 'Kunde inte nå servern.' }; }
      if (!svar.ok) {
        let data = null; try { data = await svar.json(); } catch (err) { data = null; }
        const fel = { ...(data || {}), ok: false, status: svar.status, fel: (data && data.fel) || 'serverfel', meddelande: (data && data.meddelande) || `Servern svarade med fel (${svar.status}).` };
        if (svar.status === 401) blevUtloggad(fel);
        return fel;
      }
      const m = String(svar.headers.get('content-disposition') || '').match(/filename="([^"]+)"/);
      return { ok: true, status: svar.status, blob: await svar.blob(), namn: m ? m[1] : 'Uperformance-CRM.json' };
    },
    // Grundverktygen: sessioner per konto, logga ut (en enhet eller överallt), häv kontospärr, inbjudan igen, registerutdrag
    sessioner: async (id) => (skarp ? crmAnrop('GET', '/api/admin/anvandare/' + enc(id) + '/sessioner') : demoFel()),
    loggaUt: async (id, sid) => (skarp ? crmAnrop('DELETE', '/api/admin/anvandare/' + enc(id) + '/sessioner' + (sid ? '/' + enc(sid) : ''), {}) : demoFel()),
    havSparr: async (id) => (skarp ? crmAnrop('POST', '/api/admin/anvandare/' + enc(id) + '/hav-sparr', {}) : demoFel()),
    inbjudan: async (id) => (skarp ? crmAnrop('POST', '/api/admin/anvandare/' + enc(id) + '/inbjudan', {}) : demoFel()),
    registerutdrag: async (q) => (skarp ? crmAnrop('GET', '/api/admin/registerutdrag?q=' + enc(String(q || ''))) : demoFel()),
    loggCsv: (opt) => (skarp ? '/api/admin/logg.csv' + loggFraga({ ...(opt || {}), antal: 0, fore: 0 }) : null),
  };

  /* 07-kundsidorna: kundlänk, offert och hälsoformulär --------------------------------------
     Demoläget kör KUNDLOGIK (kundlogik.js) mot localStorage, skarpt läge anropar servern som kör samma logik. */
  const KL = () => (typeof KUNDLOGIK !== 'undefined' && KUNDLOGIK ? KUNDLOGIK : null);
  const OPT_DEMO = { halsoformular: true };
  const saknasLogik = () => ({ ok: false, fel: 'kundlogik-saknas', status: 503, meddelande: 'Kundlogiken (kundlogik.js) kunde inte laddas.' });
  const saknasNyckel = () => ({ ok: false, fel: 'saknas', status: 404, meddelande: 'Länken är inte giltig.' });
  // Som kundsidorna gjorde förut: finns ingen data skapas exempeldatan och sparas
  const lasKundDemo = () => { const d = lasLagring(); if (d) return d; const ny = skapaExempeldata(); skrivLagring(ny); return ny; };
  async function sakert(fn) {
    try { return await fn(); } catch (err) { console.error(err); return { ok: false, fel: 'serverfel', status: 500, meddelande: 'Något gick fel: ' + ((err && err.message) || err) }; }
  }
  const senasteVy = new Map(); // senaste vyn per sida – lyssna() meddelar bara när något faktiskt ändrats
  const minns = (typ, n, svar) => { if (svar && svar.ok && svar.vy) senasteVy.set(typ + ':' + n, JSON.stringify(svar.vy)); return svar; };
  function demoAndra(typ, n, gor, efter) {
    const L = KL(); if (!L) return saknasLogik();
    const db = lasKundDemo(); const nu = nuISO();
    const r = gor(L, db, nu);
    if (!r || !r.ok) return r || { ok: false, fel: 'serverfel', status: 500, meddelande: 'Okänt fel.' };
    skrivLagring(db);
    return minns(typ, n, { ok: true, ...(efter ? efter(L, db, r) : {}) });
  }
  function demoLas(typ, n, giltig, oppna, vy) {
    const L = KL(); if (!L) return saknasLogik();
    const db = lasKundDemo(); const nu = nuISO();
    const g = giltig(L, db, nu); if (!g || !g.ok) return g;
    const markerad = !!oppna(L, db, nu).andrat;
    if (markerad) skrivLagring(db);
    return minns(typ, n, { ok: true, vy: vy(L, db), ...(markerad ? { markeradOppnad: true } : {}) });
  }
  // Ett anrop i taget per nyckel. Väntar flera sparningar slås de ihop och bara den senaste skickas.
  const koer = new Map();
  const ko = (id) => { let k = koer.get(id); if (!k) { k = { svans: Promise.resolve(), spara: null }; koer.set(id, k); } return k; };
  function iKo(id, gor) {
    const k = ko(id); k.spara = null;
    const p = k.svans.then(gor); k.svans = p.then(() => {}, () => {});
    return p;
  }
  function sparaIKo(id, andring, gor) {
    const k = ko(id);
    if (k.spara && !k.spara.startad) { k.spara.andring = { ...k.spara.andring, ...andring }; return k.spara.lofte; }
    const post = { andring: { ...andring }, startad: false }; k.spara = post;
    post.lofte = k.svans.then(() => { post.startad = true; if (k.spara === post) k.spara = null; return gor(post.andring); });
    k.svans = post.lofte.then(() => {}, () => {});
    return post.lofte;
  }
  function lyssnaPa(typ, n, fn, byggDemo) {
    if (typeof fn !== 'function' || !n) return () => {};
    const id = typ + ':' + n;
    const nytt = (vy) => { const json = JSON.stringify(vy); if (senasteVy.get(id) === json) return; senasteVy.set(id, json); fn({ vy }); };
    if (!skarp) {
      const hantera = (ev) => {
        if (ev.key !== LAGRING) return;
        const L = KL(); if (!L) return;
        let svar; try { svar = byggDemo(L, lasKundDemo()); } catch (err) { console.error(err); return; }
        if (svar && svar.ok) nytt(svar.vy); else if (svar) fn({ ogiltig: true, fel: svar });
      };
      addEventListener('storage', hantera);
      return () => removeEventListener('storage', hantera);
    }
    let aktiv = true; let timer = 0; let pagar = false; let senast = null;
    const kolla = async () => {
      if (!aktiv || pagar) return;
      pagar = true; clearTimeout(timer); timer = 0;
      try {
        const s = await anrop('GET', `/api/${typ}/${enc(n)}/lage`, null, { bakgrund: true });
        if (!aktiv) return;
        if (s.ok) {
          if (senast !== null && s.sekvens !== senast) {
            // Bakgrundshämtning: servern loggar den inte som en ny öppning av länken
            const h = await anrop('GET', `/api/${typ}/${enc(n)}`, null, { bakgrund: true });
            if (!aktiv) return;
            if (h.ok && h.vy) nytt(h.vy);
            else if (h.status === 404 || h.status === 410) { aktiv = false; fn({ ogiltig: true, fel: h }); return; }
          }
          senast = s.sekvens;
        } else if (s.status === 404 || s.status === 410) { aktiv = false; fn({ ogiltig: true, fel: s }); }
      } finally {
        pagar = false;
        if (aktiv && document.visibilityState !== 'hidden') timer = setTimeout(kolla, POLL_MS);
      }
    };
    const synlig = () => { if (document.visibilityState === 'visible') kolla(); else { clearTimeout(timer); timer = 0; } };
    document.addEventListener('visibilitychange', synlig);
    addEventListener('focus', kolla);
    kolla();
    return () => { aktiv = false; clearTimeout(timer); document.removeEventListener('visibilitychange', synlig); removeEventListener('focus', kolla); };
  }
  const bara = (lista, ...falt) => (Array.isArray(lista) ? lista.map((x) => Object.fromEntries(falt.map((f) => [f, x[f]]))) : []);

  const kundlank = {
    hamta: (n) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return minns('kundlank', n, await anrop('GET', `/api/kundlank/${enc(n)}`));
      return demoLas('kundlank', n, (L, db, nu) => L.giltigLank(db, n, nu.slice(0, 10)), (L, db, nu) => L.oppnaLank(db, n, nu), (L, db) => L.vyKundlank(db, n, OPT_DEMO));
    }),
    spara: (n, andring) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return sparaIKo('kundlank:' + n, andring || {}, async (a) => minns('kundlank', n, await anrop('PUT', `/api/kundlank/${enc(n)}`, a)));
      return demoAndra('kundlank', n, (L, db, nu) => L.sparaLank(db, n, andring || {}, nu, OPT_DEMO), (L, db) => ({ vy: L.vyKundlank(db, n, OPT_DEMO) }));
    }),
    skickaHalsa: (n, ids) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return iKo('kundlank:' + n, async () => minns('kundlank', n, await anrop('POST', `/api/kundlank/${enc(n)}/halsa/skicka`, { deltagarIds: ids || [] })));
      return demoAndra('kundlank', n, (L, db, nu) => L.skickaHalsa(db, n, ids || [], nu), (L, db, r) => ({ vy: L.vyKundlank(db, n, OPT_DEMO), skickade: bara(r.skickade, 'deltagareId', 'namn') }));
    }),
    paminn: (n, ids) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return iKo('kundlank:' + n, async () => minns('kundlank', n, await anrop('POST', `/api/kundlank/${enc(n)}/halsa/paminn`, { deltagarIds: ids || [] })));
      return demoAndra('kundlank', n, (L, db, nu) => L.paminnHalsa(db, n, ids || [], nu), (L, db, r) => ({ vy: L.vyKundlank(db, n, OPT_DEMO), paminda: bara(r.paminda, 'deltagareId', 'namn') }));
    }),
    skickaIn: (n) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return iKo('kundlank:' + n, async () => minns('kundlank', n, await anrop('POST', `/api/kundlank/${enc(n)}/skicka`, {})));
      return demoAndra('kundlank', n, (L, db, nu) => L.skickaIn(db, n, nu, OPT_DEMO), (L, db) => ({ vy: L.vyKundlank(db, n, OPT_DEMO) }));
    }),
    lyssna: (n, fn) => lyssnaPa('kundlank', n, fn, (L, db) => { const g = L.giltigLank(db, n, nuISO().slice(0, 10)); return g.ok ? { ok: true, vy: L.vyKundlank(db, n, OPT_DEMO) } : g; }),
  };

  const offert = {
    hamta: (n) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return minns('offert', n, await anrop('GET', `/api/offert/${enc(n)}`));
      return demoLas('offert', n, (L, db) => L.giltigOffert(db, n), (L, db, nu) => L.oppnaOffert(db, n, nu), (L, db) => L.vyOffert(db, n));
    }),
    godkann: (n, uppg = {}) => sakert(async () => {
      if (!n) return saknasNyckel();
      const kropp = { namn: String(uppg.namn || ''), roll: String(uppg.roll || ''), behorig: uppg.behorig === true };
      if (skarp) return iKo('offert:' + n, async () => minns('offert', n, await anrop('POST', `/api/offert/${enc(n)}/godkann`, kropp)));
      return demoAndra('offert', n, (L, db, nu) => L.godkannOffert(db, n, kropp, nu), (L, db) => ({ vy: L.vyOffert(db, n) }));
    }),
  };

  const halsa = {
    hamta: (n) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return minns('halsa', n, await anrop('GET', `/api/halsa/${enc(n)}`));
      return demoLas('halsa', n, (L, db) => L.giltigHalsa(db, n), (L, db, nu) => L.oppnaHalsa(db, n, nu), (L, db) => L.vyHalsa(db, n));
    }),
    sparaUtkast: (n, utkast) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return sparaIKo('halsa:' + n, { utkast: utkast || {} }, (a) => anrop('PUT', `/api/halsa/${enc(n)}/utkast`, a));
      return demoAndra('halsa', n, (L, db, nu) => L.sparaHalsoutkast(db, n, utkast || {}, nu), null);
    }),
    skicka: (n, svar) => sakert(async () => {
      if (!n) return saknasNyckel();
      if (skarp) return iKo('halsa:' + n, async () => minns('halsa', n, await anrop('POST', `/api/halsa/${enc(n)}/svar`, { svar: svar || {} })));
      return demoAndra('halsa', n, (L, db, nu) => L.skickaHalsosvar(db, n, svar || {}, nu), (L, db) => ({ vy: L.vyHalsa(db, n) }));
    }),
    lyssna: (n, fn) => lyssnaPa('halsa', n, fn, (L, db) => { const g = L.giltigHalsa(db, n); return g.ok ? { ok: true, vy: L.vyHalsa(db, n) } : g; }),
  };

  // Vem som senast sparade en post på servern (konto-id, 'kund' eller 'system') – null i demoläget och när det inte är känt
  const senastAndrad = (samling, id) => (skarp ? andradAv.get(nyckel(String(samling), String(id))) || null : null);

  window.UPLager = Object.freeze({
    skarp, lage, inloggad, jag, begarKod, loggaIn, loggaUt, tillInloggning,
    ladda, spara, prenumerera, synka, forsokNu, aterstallExempeldata, hamtaOm, senastAndrad, halsoKontakt,
    filer: Object.freeze(filer), admin: Object.freeze(admin), konto: Object.freeze(konto),
    kundlank: Object.freeze(kundlank), offert: Object.freeze(offert), halsa: Object.freeze(halsa),
  });
})();
