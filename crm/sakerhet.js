/* Uperformance CRM – adminpanelen (#/admin) och säkerhetshubben (#/sakerhet), 2026-10-23.
   Laddas före crm.js; crm.js anropar window.UPAdmin(K, LED) sist (16b) och tar in vägarna, handlarna och formulären.
   Säkerhetshubbens kontroller är riktiga och körs i webbläsaren mot sidans kod och CRM:ets data – inget visas som påhittat:
     skadlig kod (skript, ramar, händelseattribut och farliga mönster i lagrad text), uppdateringar (versionerna på servern mot de
     laddade), buggar (fel sedan sidan laddades och trasiga kopplingar i datan), läckor (personnummer och kortnummer i fritext,
     personnummer kvar i gamla kundlänkar), intrångsförsök (spärrade/utgångna kundlänkar som öppnats, serverns logg i skarpt läge),
     avvikande beteende (ovanligt många ändringar på kort tid, nattaktivitet, exporter och rolländringar) och trasigt (bilder,
     ikoner, vägar, lagring, 3D). Demoläget har ingen inloggning med lösenord – det skyddet finns i den skarpa servern och sägs.
   Resultaten sparas i db.sakerhet (senaste per kontroll + historik) och syns som räknare vid Säkerhet i menyn. */
(() => {
  // Felinsamlaren startar direkt när filen laddas (före crm.js) – fel i skript och bilder/filer som inte kunde laddas
  const lista = [];
  try { const gamla = JSON.parse(sessionStorage.getItem('up-crm-fel') || '[]'); if (Array.isArray(gamla)) lista.push(...gamla.slice(-30).map((x) => ({ ...x, tidigare: true }))); } catch (err) { /* ingen lagring */ }
  const spara = () => { try { sessionStorage.setItem('up-crm-fel', JSON.stringify(lista.filter((x) => !x.tidigare).slice(-30))); } catch (err) { /* full */ } };
  addEventListener('error', (ev) => {
    const t = ev.target;
    if (t && t !== window && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')) lista.push({ tid: new Date().toISOString(), typ: 'fil', text: `Kunde inte ladda ${t.tagName.toLowerCase()}: ${(t.src || t.href || '').split('/').pop().slice(0, 80)}` });
    else lista.push({ tid: new Date().toISOString(), typ: 'skript', text: String(ev.message || 'Okänt fel').slice(0, 200), kalla: `${String(ev.filename || '').split('/').pop()}${ev.lineno ? `:${ev.lineno}` : ''}` });
    spara();
  }, true);
  addEventListener('unhandledrejection', (ev) => { const r = ev.reason; lista.push({ tid: new Date().toISOString(), typ: 'lofte', text: `Ohanterat fel: ${String((r && r.message) || r || '').slice(0, 200)}` }); spara(); });
  window.UPFelLogg = { lista, rensa: () => { lista.length = 0; try { sessionStorage.removeItem('up-crm-fel'); } catch (err) { /* ok */ } } };
})();

window.UPAdmin = (K, LED) => {
  'use strict';
  const { e, ik, kr, krKort, pct, sum, plural, glasKort, sparkline, oppnaArk, arkHuvud, bekrafta, toast, relTid, datumText, idag, nyId, $, $$,
    SKARP, L, anv, arAktiv, spara, rendera, logga, kund } = K;
  const db = () => K.db;
  const jag = () => K.jag;
  const mig = () => anv(jag());
  const arAdm = (u) => (LED ? LED.arAdm(u) : !!u && (u.roll === 'admin' || !!u.admin));
  const av = (u, storlek = 's') => (LED ? LED.avatarHtml(u, { storlek }) : `<span class="avatar">${e(u.initialer || '?')}</span>`);
  const sak = () => { const d = db(); d.sakerhet = d.sakerhet || {}; d.sakerhet.senast = d.sakerhet.senast || {}; d.sakerhet.historik = d.sakerhet.historik || []; d.sakerhet.logg = d.sakerhet.logg || []; return d.sakerhet; };
  // Säkerhetsloggen: känsliga handlingar (exporter, importer, rolländringar, rensningar, skanningar) – max 200.
  // Skarpt läge: servern äger loggen (api-admin.js) – inställningar och rensningar skickas dit, skanningar, exporter, filskannerns
  // stopp och kontoändringar loggar servern själv. Raden här syns direkt och ersätts av serverns när loggen hämtas igen.
  const TILL_SERVERN = new Set(['installning', 'rensning']);
  const sakLogg = (typ, text) => {
    const S = sak(); S.logg.unshift({ id: nyId('s'), tid: new Date().toISOString(), av: jag(), typ, text }); S.logg.length = Math.min(S.logg.length, 200);
    if (SKARP && L.admin && TILL_SERVERN.has(typ) && arAdm(mig())) L.admin.handelse(typ, text).then((svar) => { serverSak.tid = 0; if (!svar.ok) toast(`Händelsen kunde inte loggas på servern: ${svar.meddelande || 'okänt fel'}`, null, 'varning'); });
  };
  const laddaNerBlob = (namn, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = namn; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const laddaNer = (namn, innehall, typ) => laddaNerBlob(namn, new Blob([innehall], { type: typ }));
  /* Skarpt läge: skanningarna och säkerhetsloggen ligger på servern (GET /api/admin/sakerhet) och hämtas när hubben, adminpanelen
     eller kontrollcentralen visas (högst var 20:e sekund) – så finns de kvar efter en omladdning och syns för alla administratörer.
     Serverns loggrader blir säkerhetsloggens rader: typ (för filtren och beteendekontrollen) och text i klartext (K.loggText). */
  const serverSak = { tid: 0, hamtar: null };
  const SAK_TYP = { 'anvandare-skapa': 'konto', 'sessioner-avsluta': 'konto', 'hav-sparr': 'konto', 'inbjudan-igen': 'konto', export: 'export', 'logg-export': 'logg',
    registerutdrag: 'utdrag', skanning: 'skanning', 'fil-blockerad': 'fil', 'fil-varning': 'fil', installning: 'installning', rensning: 'rensning', makulera: 'makulera',
    'konto-sparrat': 'inloggning', 'logga-in-misslyckad': 'inloggning', aterstall: 'rensning' };
  const serverRad = (x) => {
    const vem = String(x.vem || ''); const av = vem.startsWith('personal:') ? vem.slice(9) : vem;
    const typ = x.handling === 'anvandare-andra' ? (/(^|, )roll: /.test(x.detalj || '') ? 'roll' : 'konto') : SAK_TYP[x.handling] || 'sakerhet';
    return { id: `s${x.id}`, tid: x.tid, av, typ, text: K.loggText ? K.loggText(x) : `${anv(av).namn}: ${x.handling}${x.detalj ? ` – ${x.detalj}` : ''}`, server: true };
  };
  function hamtaServerSak(tvinga) {
    if (!SKARP || !L.admin || !arAdm(mig())) return Promise.resolve(null);
    if (serverSak.hamtar) return serverSak.hamtar;
    if (!tvinga && Date.now() - serverSak.tid < 20000) return Promise.resolve(null);
    serverSak.hamtar = L.admin.sakerhet().then((svar) => {
      serverSak.hamtar = null; serverSak.tid = Date.now();
      if (!svar.ok) return null;
      const S = sak();
      if (svar.skanning) { S.senast = svar.skanning.senast || {}; S.historik = svar.skanning.historik || []; }
      if (Array.isArray(svar.logg)) S.logg = svar.logg.map(serverRad);
      raknare();
      // Vyn ritas om när den visar något härifrån (inte mitt i en skanning – den ritar om själv när den är klar)
      if (!skan.kor && (/^#\/(sakerhet|admin)$/.test(location.hash) || (/^#?\/?$/.test(location.hash) && document.documentElement.hasAttribute('data-bara-admin')))) rendera();
      return svar;
    }, () => { serverSak.hamtar = null; return null; });
    return serverSak.hamtar;
  }
  const SAMLINGAR = ['kunder', 'affarer', 'projekt', 'aktiviteter', 'todos', 'dokument'];
  const SAMLNAMN = { kunder: 'Kunder', affarer: 'Affärer', projekt: 'Projekt', aktiviteter: 'Aktiviteter', todos: 'Att göra', dokument: 'Dokument', kundlankar: 'Kundlänkar', offerter: 'Offerter och ordrar', halsoformular: 'Hälsoformulär', anvandare: 'Konton' };
  const antal = (k) => { const v = db()[k]; return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0; };
  const lagringBytes = () => { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^up-/.test(k)) n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (err) { /* ingen lagring */ } return n; };
  const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1024).toLocaleString('sv-SE')} kB`);
  const lasHjalte = (titel, text) => `<section class="sidhjalte" data-sidhjalte data-mork-yta><div class="sidhjalte-text"><span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Admin</span><h1>${e(titel)}</h1><p class="sidhjalte-ingress">${e(text)}</p><div class="sidhjalte-knappar"><a class="knapp knapp-accent" href="#/">Till översikten</a></div></div></section>`;

  /* 01-säkerhetskontrollerna ------------------------------------------------------------------------- */
  const ALLVAR = { hog: { namn: 'Hög', minus: 15 }, medel: { namn: 'Medel', minus: 6 }, lag: { namn: 'Låg', minus: 2 }, info: { namn: 'Info', minus: 0 } };
  // Reservlistan över CRM:ets egna skript (också de som laddas efter hand: 3D-scenerna och three.js). Skanningen läser dessutom
  // index.html från servern – allt som den laddar räknas som känt, så att en ny modul aldrig flaggas som okänd.
  const KANDA_SKRIPT = /^(skarpt|data|lager|crm|ledning|sakerhet|chatt|filskanner|filregler|mote|inspelning|motescen|scener|scen3d|scen-[a-z]+|kund|kundlogik|halsa|offert|portal|logga-in|valj|kalender|overgang|three[\w.-]*|[\w-]+\.module)\.js$/;
  async function skriptIIndex() {
    try {
      const r = await fetch(`index.html?kontroll=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return null;
      return new Set([...(await r.text()).matchAll(/<script\b[^>]*\bsrc="([^"?#]+)/g)].map((m) => m[1].split('/').pop()));
    } catch (err) { return null; }
  }
  const luhn = (s) => { let t = 0; for (let i = 0; i < s.length; i++) { let d = +s[s.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; } return t % 10 === 0; };
  // Personnummer i fritext: ÅÅMMDD-XXXX eller ÅÅÅÅMMDD-XXXX med giltig kontrollsiffra och rimligt datum
  const hittaPnr = (text) => {
    const ut = []; const re = /\b(?:19|20)?(\d{2})(\d{2})(\d{2})[-+ ]?(\d{4})\b/g; let m;
    while ((m = re.exec(String(text)))) { const mm = +m[2], dd = +m[3]; if (mm < 1 || mm > 12 || dd < 1 || dd > 91) continue; if (luhn(`${m[1]}${m[2]}${m[3]}${m[4]}`)) ut.push(m[0]); }
    return ut;
  };
  const hittaKort = (text) => (String(text).match(/\b(?:\d[ -]?){13,19}\b/g) || []).map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 13 && x.length <= 19 && luhn(x));
  const FARLIGT = [[/<\s*script/i, 'skript-tagg'], [/javascript\s*:/i, 'javascript:-länk'], [/\bon(error|load|click|mouseover)\s*=/i, 'händelseattribut'], [/<\s*iframe/i, 'iframe'], [/data\s*:\s*text\/html/i, 'data:text/html'], [/\beval\s*\(/i, 'eval()'], [/document\.cookie/i, 'document.cookie']];
  // Alla strängar i datan med var de ligger (samling, id, fält) – för mönster- och persondatakontrollerna
  function strangar() {
    const ut = []; const d = db();
    const gå = (v, samling, id, falt, djup) => {
      if (djup > 6 || v == null) return;
      if (typeof v === 'string') { if (v.length > 2 && !/^data:image\//.test(v)) ut.push({ samling, id, falt, text: v }); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => gå(x, samling, id, `${falt}[${i}]`, djup + 1)); return; }
      if (typeof v === 'object') for (const [k, x] of Object.entries(v)) gå(x, samling, id, falt ? `${falt}.${k}` : k, djup + 1);
    };
    for (const s of SAMLINGAR) for (const x of d[s] || []) gå(x, s, x.id, '', 0);
    for (const s of ['kundlankar', 'offerter']) for (const [id, x] of Object.entries(d[s] || {})) gå(x, s, id, '', 0);
    return ut;
  }
  // Trasiga kopplingar mellan posterna – samling, id, text och vems post det är (ansvarig/författare)
  function kopplingsBrott() {
    const d = db(); const brott = [];
    const kundId = new Set(d.kunder.map((k) => k.id)), affarId = new Set(d.affarer.map((a) => a.id)), anvId = new Set(d.anvandare.map((u) => u.id).concat(['kund', 'system']));
    for (const a of d.affarer) { if (!kundId.has(a.kundId)) brott.push({ samling: 'affarer', id: a.id, vem: a.ansvarig, text: `Affären ”${a.titel}” pekar på en kund som saknas` }); if (a.ansvarig && !anvId.has(a.ansvarig)) brott.push({ samling: 'affarer', id: a.id, vem: a.ansvarig, text: `Affären ”${a.titel}” har en ansvarig som saknas (${a.ansvarig})` }); }
    for (const p of d.projekt) if (!affarId.has(p.affarId)) brott.push({ samling: 'projekt', id: p.id, vem: p.ansvarigTest, text: 'Ett projekt pekar på en affär som saknas' });
    for (const t of d.todos) { if (t.kundId && !kundId.has(t.kundId)) brott.push({ samling: 'todos', id: t.id, vem: t.ansvarig, text: `Uppgiften ”${String(t.text).slice(0, 40)}” pekar på en kund som saknas` }); if (t.ansvarig && !anvId.has(t.ansvarig)) brott.push({ samling: 'todos', id: t.id, vem: t.ansvarig, text: `Uppgiften ”${String(t.text).slice(0, 40)}” har en ansvarig som saknas` }); }
    for (const x of d.aktiviteter) if (x.kundId && !kundId.has(x.kundId)) brott.push({ samling: 'aktiviteter', id: x.id, vem: x.av, text: 'En händelse pekar på en kund som saknas' });
    for (const [tok, o] of Object.entries(d.offerter || {})) if (o.affarId && !affarId.has(o.affarId)) brott.push({ samling: 'offerter', id: tok, vem: o.av, text: `${o.nummer || 'Ett dokument'} pekar på en affär som saknas` });
    return brott;
  }
  const lankFor = (samling, id) => { const d = db(); if (samling === 'kunder') return `#/kund/${id}`; if (samling === 'affarer') return `#/affar/${id}`; if (samling === 'projekt') return `#/projekt/${id}`;
    const x = (d[samling] || []).find ? (d[samling] || []).find((y) => y.id === id) : (d[samling] || {})[id]; return x && x.kundId ? `#/kund/${x.kundId}` : ''; };
  const postText = (samling, id) => { const d = db(); const x = Array.isArray(d[samling]) ? d[samling].find((y) => y.id === id) : (d[samling] || {})[id]; const k = x && kund(x.kundId || (samling === 'kunder' ? x.id : '')); return `${SAMLNAMN[samling] || samling}${k ? ` · ${k.namn}` : ''}`; };

  const KONTROLLER = [
    { id: 'kod', namn: 'Skadlig kod', under: 'Okända skript, ramar och farlig kod i sidan och i lagrad data', ikon: 'bugg', steg: ['Sidans skript och stilmallar', 'Ramar (iframes) och händelseattribut', 'Lagrad data – farliga mönster', 'Service workers och lagringsnycklar'],
      async kor(logg) {
        const f = [];
        const skript = $$('script');
        logg(`Kontrollerar ${skript.length} skript och ${$$('link[rel=stylesheet]').length} stilmallar`);
        const iIndex = await skriptIIndex();
        if (iIndex) logg(`Jämför med de ${iIndex.size} skript som index.html på servern laddar`);
        for (const s of skript) {
          if (!s.src) continue;
          let u; try { u = new URL(s.src, location.href); } catch (err) { f.push({ allvar: 'hog', text: `Skript med ogiltig adress: ${s.getAttribute('src')}` }); continue; }
          const fil = u.pathname.split('/').pop();
          if (u.origin !== location.origin) f.push({ allvar: 'hog', text: `Skript från en annan webbplats: ${u.host}${u.pathname}` });
          else if (!(iIndex && iIndex.has(fil)) && !KANDA_SKRIPT.test(fil)) f.push({ allvar: 'medel', text: `Okänt skript: ${u.pathname}` });
        }
        for (const l of $$('link[rel=stylesheet]')) { try { const u = new URL(l.href, location.href); if (u.origin !== location.origin && u.host !== 'fonts.googleapis.com') f.push({ allvar: 'medel', text: `Stilmall från en annan webbplats: ${u.host}` }); } catch (err) { /* ok */ } }
        await vila();
        logg('Letar efter ramar, händelseattribut och javascript:-länkar i sidan');
        const ramar = $$('iframe, object, embed'); if (ramar.length) f.push({ allvar: 'hog', text: `${plural(ramar.length, 'inbäddad ram', 'inbäddade ramar')} i sidan (förväntat: inga)` });
        const attr = $$('*').filter((x) => [...x.attributes].some((a) => /^on/i.test(a.name))); if (attr.length) f.push({ allvar: 'hog', text: `${plural(attr.length, 'element', 'element')} med händelseattribut (on…=) – sidan använder inga` });
        const jsl = $$('a[href^="javascript:" i]'); if (jsl.length) f.push({ allvar: 'hog', text: `${plural(jsl.length, 'javascript:-länk', 'javascript:-länkar')} i sidan` });
        await vila();
        const st = strangar(); logg(`Söker efter farliga mönster i ${st.length.toLocaleString('sv-SE')} textfält i datan`);
        for (const s of st) for (const [re, namn] of FARLIGT) if (re.test(s.text)) { f.push({ allvar: 'hog', text: `${namn} i lagrad text (${postText(s.samling, s.id)}, ${s.falt})`, lank: lankFor(s.samling, s.id), atgard: { g: 'sh-neutralisera', data: { samling: s.samling, id: s.id, falt: s.falt }, text: 'Neutralisera' } }); break; }
        await vila();
        logg('Kontrollerar service workers och webbläsarens lagring');
        try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) { const r = await navigator.serviceWorker.getRegistrations(); if (r.length) f.push({ allvar: 'medel', text: `${plural(r.length, 'service worker', 'service workers')} registrerad – CRM:et använder ingen` }); } } catch (err) { /* ok */ }
        try { const okanda = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^up-/.test(k)) okanda.push(k); } if (okanda.length) f.push({ allvar: 'info', text: `${plural(okanda.length, 'okänd nyckel', 'okända nycklar')} i webbläsarens lagring: ${okanda.slice(0, 4).join(', ')}` }); } catch (err) { /* ok */ }
        return f;
      } },
    { id: 'uppdatering', namn: 'Uppdateringar', under: 'Versionerna på servern jämförs med det som är laddat', ikon: 'uppgradera', steg: ['Hämtar senaste versionen', 'Jämför skript och stilmallar', 'Exempeldatans version'],
      async kor(logg) {
        const f = [];
        logg('Hämtar index.html från servern (utan cache)');
        let html = '';
        try { const r = await fetch(`index.html?kontroll=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' }); if (r.ok) html = await r.text(); else f.push({ allvar: 'lag', text: `Servern svarade ${r.status} – kunde inte kontrollera uppdateringar` }); } catch (err) { f.push({ allvar: 'lag', text: 'Ingen kontakt med servern – kunde inte kontrollera uppdateringar' }); }
        if (html) {
          logg('Jämför versionerna (?v=) med de laddade filerna');
          const pa = new Map(); for (const m of html.matchAll(/(?:src|href)="([\w./-]+\.(?:js|css))\?v=(\d+)"/g)) pa.set(m[1].split('/').pop(), +m[2]);
          const laddat = new Map(); for (const x of [...$$('script[src]'), ...$$('link[rel=stylesheet]')]) { const m = String(x.getAttribute('src') || x.getAttribute('href') || '').match(/([\w.-]+\.(?:js|css))\?v=(\d+)/); if (m) laddat.set(m[1], +m[2]); }
          const nya = [...pa].filter(([fil, v]) => laddat.has(fil) && laddat.get(fil) < v);
          if (nya.length) f.push({ allvar: 'medel', text: `Ny version finns: ${nya.slice(0, 4).map(([fil, v]) => `${fil} v${laddat.get(fil)} → v${v}`).join(', ')}${nya.length > 4 ? ' …' : ''}`, atgard: { g: 'sh-uppdatera', text: 'Uppdatera nu' } });
          else logg(`Alla ${laddat.size} filer har senaste versionen`);
        }
        await vila();
        logg('Kontrollerar exempeldatans version');
        try { if (!SKARP && typeof skapaExempeldata === 'function') { const v = skapaExempeldata().version; if (db().version && db().version < v) f.push({ allvar: 'lag', text: `Datan har version ${db().version} – senaste är ${v}`, atgard: { g: 'aterstall', text: 'Återställ exempeldata' } }); } } catch (err) { /* ok */ }
        return f;
      } },
    { id: 'buggar', namn: 'Buggar och fel', under: 'Fel sedan sidan laddades och trasiga kopplingar i datan', ikon: 'nyckelverktyg', steg: ['Fel i skript och filer', 'Kopplingar mellan posterna', 'Dubbletter och ogiltiga värden', 'Lagringen går att skriva'],
      async kor(logg) {
        const f = []; const d = db();
        const fel = (window.UPFelLogg ? window.UPFelLogg.lista : []).filter((x) => !x.tidigare);
        logg(`Fel sedan sidan laddades: ${fel.length}`);
        const grupp = new Map(); for (const x of fel) grupp.set(x.text, (grupp.get(x.text) || 0) + 1);
        for (const [text, n] of [...grupp].slice(0, 6)) f.push({ allvar: /^Kunde inte ladda/.test(text) ? 'lag' : 'medel', text: `${text}${n > 1 ? ` (${n} gånger)` : ''}`, atgard: { g: 'sh-rensa-fel', text: 'Rensa loggen' } });
        await vila();
        logg(`Kontrollerar kopplingarna i ${d.affarer.length} affärer, ${d.projekt.length} projekt, ${d.todos.length} uppgifter och ${d.aktiviteter.length} händelser`);
        const brott = kopplingsBrott();
        for (const { text } of brott.slice(0, 8)) f.push({ allvar: 'medel', text });
        if (brott.length > 8) f.push({ allvar: 'medel', text: `… och ${brott.length - 8} trasiga kopplingar till` });
        await vila();
        logg('Letar efter dubbletter och ogiltiga värden');
        for (const s of SAMLINGAR) { const sett = new Set(); for (const x of d[s] || []) { if (sett.has(x.id)) f.push({ allvar: 'medel', text: `Dubblett-id i ${SAMLNAMN[s]}: ${x.id}` }); sett.add(x.id); } }
        for (const a of d.affarer) { const v = K.affarVarde ? (() => { try { return K.affarVarde(a); } catch (err) { return NaN; } })() : 0; if (!isFinite(v)) f.push({ allvar: 'medel', text: `Affären ”${a.titel}” har ett värde som inte går att räkna`, lank: `#/affar/${a.id}` }); }
        for (const t of d.todos) if (t.datum && isNaN(Date.parse(t.datum))) f.push({ allvar: 'lag', text: `Uppgiften ”${String(t.text).slice(0, 40)}” har ett ogiltigt datum` });
        await vila();
        logg('Provar att skriva och läsa webbläsarens lagring');
        if (!SKARP) { try { localStorage.setItem('up-crm-test', '1'); if (localStorage.getItem('up-crm-test') !== '1') throw new Error(); localStorage.removeItem('up-crm-test'); } catch (err) { f.push({ allvar: 'hog', text: 'Webbläsarens lagring går inte att skriva – ändringar sparas inte' }); } }
        return f;
      } },
    { id: 'lacka', namn: 'Läckor och persondata', under: 'Personnummer och kortnummer där de inte hör hemma', ikon: 'fingeravtryck', steg: ['Personnummer i fritext', 'Kortnummer och lösenord i text', 'Adressfältet', 'Gamla kundlänkar med personnummer'],
      async kor(logg) {
        const f = []; const d = db();
        const fritext = strangar().filter((s) => !(s.samling === 'kundlankar' && /deltagare/.test(s.falt)) && !/^(id|kundId|affarId|token|nummer|orgnr|tel|epost)$/.test(String(s.falt).split('.').pop()));
        logg(`Söker efter personnummer i ${fritext.length.toLocaleString('sv-SE')} fritextfält (deltagarlistorna undantas – där hör de hemma)`);
        for (const s of fritext) { const p = hittaPnr(s.text); if (p.length) f.push({ allvar: 'hog', text: `Personnummer i fritext: ${postText(s.samling, s.id)} (${s.falt})`, lank: lankFor(s.samling, s.id) }); }
        await vila();
        logg('Söker efter kortnummer och lösenord i text');
        for (const s of fritext) { if (hittaKort(s.text).length) f.push({ allvar: 'hog', text: `Kortnummer i text: ${postText(s.samling, s.id)} (${s.falt})`, lank: lankFor(s.samling, s.id) }); else if (/\b(lösenord|password|pinkod)\s*[:=]\s*\S+/i.test(s.text)) f.push({ allvar: 'medel', text: `Något som ser ut som ett lösenord i text: ${postText(s.samling, s.id)}`, lank: lankFor(s.samling, s.id) }); }
        await vila();
        logg('Kontrollerar adressfältet');
        if (hittaPnr(decodeURIComponent(location.href)).length || /@/.test(decodeURIComponent(location.hash))) f.push({ allvar: 'hog', text: 'Adressfältet innehåller personuppgifter' });
        await vila();
        const gamla = Object.values(d.kundlankar || {}).filter((l) => (l.sparrad || (l.utgar && l.utgar < K.omDagar(-30))) && (l.deltagare || []).some((x) => x.pnr));
        logg(`Kundlänkar som gått ut eller spärrats men har personnummer kvar: ${gamla.length}`);
        if (gamla.length) f.push({ allvar: 'medel', text: `${plural(gamla.length, 'utgången kundlänk har', 'utgångna kundlänkar har')} personnummer kvar (${sum(gamla.map((l) => (l.deltagare || []).filter((x) => x.pnr).length))} st)`, atgard: { g: 'sh-rensa-pnr', text: 'Rensa personnumren' } });
        return f;
      } },
    { id: 'intrang', namn: 'Intrångsförsök', under: 'Försök att ta sig in och skyddet mot det', ikon: 'skold-larm', steg: ['Inloggningsskyddet', 'Spärrade och utgångna kundlänkar', 'Serverns logg (skarpt läge)'],
      async kor(logg) {
        const f = []; const d = db();
        logg(SKARP ? 'Skarpt läge: engångskoder, spärrar och IP-gränser på servern' : 'Demoläget: ingen inloggning med lösenord – skyddet finns i den skarpa servern');
        if (!SKARP) f.push({ allvar: 'info', text: 'Demoläget saknar riktig inloggning (rollerna väljs fritt). Den skarpa servern har engångskoder via e-post, spärr efter felaktiga koder, gränser per IP, CSP utan inline-skript och logg över alla inloggningar.' });
        await vila();
        const forsok = Object.values(d.kundlankar || {}).filter((l) => (l.sparrad && l.oppnad && Date.parse(l.oppnad) > Date.parse(l.sparrad)) || (l.utgar && l.oppnad && l.oppnad.slice(0, 10) > l.utgar));
        logg(`Kundlänkar som öppnats efter att de spärrats eller gått ut: ${forsok.length}`);
        for (const l of forsok.slice(0, 5)) f.push({ allvar: 'medel', text: `Kundlänken till ${(kund(l.kundId) || {}).namn || 'en kund'} öppnades efter att den ${l.sparrad ? 'spärrats' : 'gått ut'}`, lank: l.kundId ? `#/kund/${l.kundId}` : '' });
        await vila();
        if (SKARP && L.admin && arAdm(mig())) {
          logg('Hämtar serverns logg (inloggningar och spärrar)');
          try {
            const svar = await L.admin.logg({ antal: 200 });
            const rader = (svar && (svar.logg || svar.rader || svar.lista)) || [];
            const dygn = rader.filter((r) => Date.now() - Date.parse(r.tid || r.skapad || 0) < 864e5);
            const misslyckade = dygn.filter((r) => r.handling === 'logga-in-misslyckad').length, sparrar = dygn.filter((r) => r.handling === 'konto-sparrat').length;
            if (misslyckade >= 5) f.push({ allvar: misslyckade >= 20 ? 'hog' : 'medel', text: `${misslyckade} misslyckade inloggningar senaste dygnet` });
            if (sparrar) f.push({ allvar: 'hog', text: `${plural(sparrar, 'konto spärrades', 'konton spärrades')} tillfälligt senaste dygnet (för många felaktiga koder)` });
            if (!misslyckade && !sparrar) logg('Inga misslyckade inloggningar eller spärrar senaste dygnet');
          } catch (err) { f.push({ allvar: 'lag', text: 'Serverns logg kunde inte hämtas' }); }
        }
        return f;
      } },
    { id: 'beteende', namn: 'Avvikande beteende', under: 'Ovanliga mönster i vad kontona gör', ikon: 'puls', steg: ['Många ändringar på kort tid', 'Aktivitet mitt i natten', 'Exporter, importer och rolländringar'],
      async kor(logg) {
        const f = []; const d = db(); const S = sak();
        const handelser = [...d.aktiviteter.map((x) => ({ av: x.av, tid: x.tid, text: x.text })), ...S.logg.map((x) => ({ av: x.av, tid: x.tid, text: x.text, typ: x.typ }))].filter((x) => x.tid && Date.now() - Date.parse(x.tid) < 7 * 864e5);
        logg(`Analyserar ${handelser.length} händelser de senaste sju dagarna`);
        const perAnv = new Map(); for (const x of handelser) { if (!perAnv.has(x.av)) perAnv.set(x.av, []); perAnv.get(x.av).push(Date.parse(x.tid)); }
        for (const [vem, tider] of perAnv) { tider.sort((a, b) => a - b); let max = 0; for (let i = 0, j = 0; i < tider.length; i++) { while (tider[i] - tider[j] > 10 * 6e4) j++; max = Math.max(max, i - j + 1); } if (max >= 25) f.push({ allvar: 'medel', text: `${anv(vem).namn} gjorde ${max} ändringar inom tio minuter` }); }
        await vila();
        const natt = handelser.filter((x) => { const h = new Date(x.tid).getHours(); return h >= 0 && h < 5 && x.av !== 'kund' && x.av !== 'system'; });
        logg(`Aktivitet mellan 00 och 05: ${natt.length}`);
        if (natt.length) { const vem = [...new Set(natt.map((x) => anv(x.av).namn))]; f.push({ allvar: 'lag', text: `${plural(natt.length, 'händelse', 'händelser')} mitt i natten (00–05) av ${vem.join(', ')}` }); }
        await vila();
        const exp = S.logg.filter((x) => (x.typ === 'export' || x.typ === 'import') && Date.now() - Date.parse(x.tid) < 864e5);
        const roll = S.logg.filter((x) => x.typ === 'roll' && Date.now() - Date.parse(x.tid) < 7 * 864e5);
        logg(`Exporter och importer senaste dygnet: ${exp.length} · rolländringar senaste veckan: ${roll.length}`);
        if (exp.length >= 3) f.push({ allvar: 'medel', text: `${exp.length} exporter/importer av all data senaste dygnet` });
        for (const x of roll.slice(0, 3)) f.push({ allvar: 'info', text: x.text });
        return f;
      } },
    { id: 'trasigt', namn: 'Trasigt', under: 'Bilder, ikoner, vägar, lagring och 3D', ikon: 'varning', steg: ['Bilder och ikoner', 'Menyns vägar', 'Lagringsutrymme', 'Typsnitt och 3D'],
      async kor(logg) {
        const f = [];
        const bilder = $$('img').filter((x) => x.complete && x.naturalWidth === 0 && x.getAttribute('src'));
        const ikoner = [...new Set($$('use').map((u) => u.getAttribute('href') || '').filter((h) => h.startsWith('#')))].filter((h) => !document.getElementById(h.slice(1)));
        logg(`Bilder i sidan: ${$$('img').length} · ikoner som används: ${new Set($$('use').map((u) => u.getAttribute('href'))).size}`);
        if (bilder.length) f.push({ allvar: 'lag', text: `${plural(bilder.length, 'bild', 'bilder')} som inte kunde visas` });
        if (ikoner.length) f.push({ allvar: 'lag', text: `Ikoner som saknas i spriten: ${ikoner.slice(0, 5).join(', ')}` });
        await vila();
        const lankar = [...new Set($$('a[href^="#/"]').map((a) => a.getAttribute('href').split('?')[0]))];
        const fel = lankar.filter((h) => !K.harVag(h));
        logg(`Kontrollerar ${lankar.length} länkar i sidan och menyn`);
        if (fel.length) f.push({ allvar: 'medel', text: `Länkar som inte leder någonstans: ${fel.slice(0, 4).join(', ')}` });
        await vila();
        let est = null; try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (err) { est = null; }
        const anvant = lagringBytes();
        logg(`CRM:ets lagring: ${kb(anvant)}${est && est.quota ? ` · webbläsarens utrymme ${kb(est.quota)}` : ''}`);
        if (!SKARP && anvant > 4 * 1048576) f.push({ allvar: 'medel', text: `CRM:ets data i webbläsaren är ${kb(anvant)} – nära gränsen (ca 5 MB)` });
        await vila();
        const poppins = document.fonts && document.fonts.check ? document.fonts.check('600 12px Poppins') : true;
        if (!poppins) f.push({ allvar: 'lag', text: 'Typsnittet Poppins har inte laddats (reservtypsnitt visas)' });
        const webgl = (() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch (err) { return false; } })();
        logg(`3D (WebGL2): ${webgl ? 'finns' : 'saknas'}${install('3d') === 'av' ? ' · avstängt i inställningarna' : ''}`);
        if (!webgl) f.push({ allvar: 'info', text: 'Webbläsaren saknar WebGL2 – 3D-scenerna visas som platta versioner' });
        return f;
      } },
  ];
  const vila = () => new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 160 + Math.random() * 180));
  const poang = (fynd) => Math.max(0, 100 - sum(fynd.map((x) => (ALLVAR[x.allvar] || ALLVAR.info).minus)));
  const allaSenaste = () => { const S = sak(); return KONTROLLER.map((k) => S.senast[k.id]).filter(Boolean); };
  const totalPoang = () => { const s = allaSenaste(); return s.length ? poang(s.flatMap((x) => x.fynd)) : null; };
  const oppnaFynd = () => allaSenaste().flatMap((x) => x.fynd).filter((x) => x.allvar === 'hog' || x.allvar === 'medel').length;
  function raknare() {
    const n = oppnaFynd(); const S = sak(); const senast = S.historik[0];
    const gammal = !senast || Date.now() - Date.parse(senast.tid) > 7 * 864e5;
    // Som menyns andra räknare (uppdateraRaknare i crm.js): dold när den är tom, bärnsten (rakna-varm) när något väntar
    $$('[data-rakna="sakerhet"]').forEach((x) => { const paminn = gammal && arAdm(mig()) && install('skanpaminn') !== 'av'; x.textContent = n ? String(n) : paminn ? '!' : ''; x.hidden = !x.textContent; x.toggleAttribute('data-varm', !!n || paminn); x.classList.toggle('rakna-varm', !!n || paminn); });
  }

  /* 02-skanningen: kontrollerna körs i tur och ordning med förlopp, logg och radar ------------------------- */
  const skan = { kor: false, logg: [] };
  async function skanna(ids) {
    if (skan.kor) return; skan.kor = true;
    const valda = KONTROLLER.filter((k) => !ids || ids.includes(k.id));
    const rot = $('[data-sh-hub]'); if (rot) rot.setAttribute('data-skannar', '');
    skan.logg = [];
    const skriv = (text, ton = '') => { skan.logg.push({ text, ton }); const t = $('[data-sh-terminal]'); if (t) { const rad = document.createElement('p'); rad.className = `sh-rad${ton ? ` sh-rad-${ton}` : ''}`; rad.textContent = `› ${text}`; t.appendChild(rad); while (t.children.length > 60) t.firstElementChild.remove(); t.scrollTop = t.scrollHeight; } };
    skriv(`Startar ${valda.length === KONTROLLER.length ? 'full skanning' : valda.map((k) => k.namn.toLowerCase()).join(', ')} – ${new Date().toLocaleTimeString('sv-SE')}`, 'start');
    // Skarpt läge: de andra kontrollernas senaste resultat och säkerhetsloggen (beteendekontrollen) från servern först
    if (SKARP) await hamtaServerSak(true);
    const S = sak(); const alla = [];
    for (const k of valda) {
      const kort = $(`[data-sh-kontroll="${k.id}"]`);
      if (kort) { kort.setAttribute('data-lage', 'kor'); kort.style.setProperty('--forlopp', '0'); }
      const lampor = $$(`[data-sh-modul="${k.id}"]`); lampor.forEach((x) => x.setAttribute('data-lage', 'kor'));
      const nr = valda.indexOf(k); const pctEl = $('[data-sh-pct]'); const satt = (x) => { if (pctEl) pctEl.textContent = `${Math.round(((nr + x) / valda.length) * 100)} %`; };
      satt(0);
      let n = 0; const stegLogg = (text) => { n++; skriv(text); satt(Math.min(0.95, n / (k.steg.length + 1))); if (kort) kort.style.setProperty('--forlopp', String(Math.min(0.95, n / (k.steg.length + 1)))); };
      let fynd = [];
      try { fynd = await k.kor(stegLogg); } catch (err) { fynd = [{ allvar: 'lag', text: `Kontrollen kunde inte köras klart: ${err.message || err}` }]; }
      S.senast[k.id] = { tid: new Date().toISOString(), fynd };
      alla.push(...fynd);
      const varst = fynd.find((x) => x.allvar === 'hog') ? 'hog' : fynd.find((x) => x.allvar === 'medel') ? 'medel' : fynd.find((x) => x.allvar === 'lag') ? 'lag' : 'ok';
      skriv(`${k.namn}: ${fynd.filter((x) => x.allvar !== 'info').length ? plural(fynd.filter((x) => x.allvar !== 'info').length, 'fynd', 'fynd') : 'inga fynd'}`, varst === 'ok' ? 'ok' : varst);
      if (kort) { kort.style.setProperty('--forlopp', '1'); kort.setAttribute('data-lage', varst); }
      lampor.forEach((x) => x.setAttribute('data-lage', varst)); satt(1);
      await vila();
    }
    let p = totalPoang();
    const vad = valda.length === KONTROLLER.length ? 'allt' : valda.map((k) => k.id).join(',');
    if (SKARP && L.admin) {
      // Servern sparar resultaten, räknar poängen och loggar skanningen – så syns den för alla administratörer och efter omladdning
      const kontroller = {}; for (const k of valda) kontroller[k.id] = { fynd: (S.senast[k.id] || { fynd: [] }).fynd.slice(0, 60).map((x) => ({ ...x, text: String(x.text).slice(0, 400) })) };
      const svar = await L.admin.skanning(kontroller, vad);
      if (svar.ok && svar.skanning) { S.senast = svar.skanning.senast || S.senast; S.historik = svar.skanning.historik || S.historik; p = totalPoang(); serverSak.tid = 0; skriv('Resultatet är sparat på servern och loggat'); }
      else { skriv(`Resultatet kunde inte sparas på servern: ${svar.meddelande || 'okänt fel'}`, 'medel'); toast('Skanningen kunde inte sparas på servern – den syns bara här tills du laddar om', null, 'varning'); }
    } else {
      S.historik.unshift({ tid: new Date().toISOString(), poang: p, fynd: oppnaFynd(), av: jag(), vad });
      S.historik.length = Math.min(S.historik.length, 24);
      sakLogg('skanning', `${mig().namn} körde säkerhetsskanning (${vad === 'allt' ? 'allt' : valda.map((k) => k.namn.toLowerCase()).join(', ')}): ${p} av 100`);
    }
    skriv(`Klart. Säkerhetspoäng ${p} av 100 · ${plural(oppnaFynd(), 'fynd att åtgärda', 'fynd att åtgärda')}`, 'klar');
    spara();
    skan.kor = false;
    if (rot) rot.removeAttribute('data-skannar');
    raknare();
    if (/^#\/sakerhet/.test(location.hash)) { rendera(); const t = $('[data-sh-terminal]'); if (t) t.scrollTop = t.scrollHeight; }
    toast(`Skanningen är klar – ${p} av 100`, null, p >= 90 ? 'skold' : 'skold-larm');
  }

  /* 03-säkerhetshubben (#/sakerhet) ----------------------------------------------------------------------- */
  const KORT_NAMN = { kod: 'SKADLIG KOD', uppdatering: 'UPPDATERING', buggar: 'BUGGAR', lacka: 'LÄCKOR', intrang: 'INTRÅNG', beteende: 'BETEENDE', trasigt: 'TRASIGT' };
  const lageFor = (r) => (!r ? 'ny' : r.fynd.some((x) => x.allvar === 'hog') ? 'hog' : r.fynd.some((x) => x.allvar === 'medel') ? 'medel' : r.fynd.some((x) => x.allvar === 'lag') ? 'lag' : 'ok');
  /* Säkerhetskärnan (samma formspråk som kontrollcentralens): en ring per kontroll i kontrollens färg – full ring = inga fynd,
     kortare = poängavdrag, röd/gul = fynd med hög/medel allvarlighet, svag = inte körd. Under skanningen löper ett ljus runt den ring
     som kontrolleras och mitten visar förloppet. Tre banor i 3D, lutar efter musen (data-sh-tilt). */
  const SH_FARG = { kod: '#7ee0c3', uppdatering: '#a7d2ff', buggar: '#b49cff', lacka: '#ff9ecb', intrang: '#5fd4e8', beteende: '#ffc857', trasigt: '#c6f36b' };
  const SH_NAMN = { kod: 'Skadlig kod', uppdatering: 'Uppdatering', buggar: 'Buggar', lacka: 'Läckor', intrang: 'Intrång', beteende: 'Beteende', trasigt: 'Trasigt' };
  function karnaSak(S, p, status) {
    const R = [108, 98.5, 89, 79.5, 70, 60.5, 51];
    let streck = ''; for (let i = 0; i < 72; i++) { const v = (i / 72) * Math.PI * 2; const r0 = i % 6 ? 115 : 112; streck += `M${(120 + Math.cos(v) * r0).toFixed(1)} ${(120 + Math.sin(v) * r0).toFixed(1)}L${(120 + Math.cos(v) * 119).toFixed(1)} ${(120 + Math.sin(v) * 119).toFixed(1)}`; }
    const ringar = KONTROLLER.map((k, i) => { const r = R[i]; const l = 2 * Math.PI * r; const rk = S.senast[k.id]; const andel = rk ? poang(rk.fynd) / 100 : 1; const d = SH_FARG[k.id];
      return `<g class="sh-ring" data-sh-modul="${k.id}" data-lage="${lageFor(rk)}"><circle cx="120" cy="120" r="${r}" class="ao-ring-spar"/><circle cx="120" cy="120" r="${r}" class="ao-ring-bage" style="--d:${d};--o:${(l * andel).toFixed(1)};animation-delay:${(i * 0.08).toFixed(2)}s" stroke-dasharray="${(l * andel).toFixed(1)} ${l.toFixed(1)}"/>
        <g class="sh-komet"><circle cx="120" cy="120" r="${r}" class="sh-komet-bage" style="--d:${d}" stroke-dasharray="${(l * 0.18).toFixed(1)} ${l.toFixed(1)}"/></g></g>`; }).join('');
    const lugn = p == null
      ? `<span class="sh-k-ikon">${ik('skold')}</span><small>Säkerhet</small><span>Redo att skanna</span>`
      : `<strong>${p}</strong><small>Säkerhetspoäng</small><span>${e(status)}</span>`;
    return `<div class="ao-karna sh-karna" data-sh-tilt data-rorelse aria-hidden="true"><div class="ao-scen">
        <i class="ao-golv"></i><i class="ao-orbit ao-o1"><b></b></i><i class="ao-orbit ao-o2"><b></b></i><i class="ao-orbit ao-o3"><b></b></i>
        <svg class="ao-ringar" viewBox="0 0 240 240"><path d="${streck}" class="ao-streck"/>${ringar}</svg>
        <div class="ao-mitt sh-k-mitt"><div class="sh-k-lugn">${lugn}</div><div class="sh-k-skannar"><small>Skannar</small><strong data-sh-pct>0 %</strong><span>Sju kontroller</span></div></div>
      </div></div>`;
  }
  // Förklaringen: en rad per kontroll i ringens färg med poängen, sist totalen
  const shDelar = (S, p, status, ton) => `<ul class="sh-delar">${KONTROLLER.map((k) => { const r = S.senast[k.id];
      return `<li data-sh-modul="${k.id}" data-lage="${lageFor(r)}" style="--d:${SH_FARG[k.id]}" title="${e(k.namn)}"><i aria-hidden="true"></i><span>${e(SH_NAMN[k.id])}</span><strong>${r ? poang(r.fynd) : '–'}</strong></li>`; }).join('')}
      <li class="sh-del-total" data-ton="${ton}">${ik(p == null ? 'radar' : p >= 90 ? 'skold' : 'skold-larm')}<span>${e(status)}</span><strong>${p == null ? '–' : p}</strong></li></ul>`;

  const shUi = { oppen: null };
  function visaSakerhet() {
    if (!arAdm(mig())) return lasHjalte('Säkerhetshubben', 'Säkerhetshubben är till för administratörer.');
    hamtaServerSak();
    const S = sak(); const p = totalPoang(); const senast = S.historik[0];
    const ton = p == null ? 'is' : p >= 90 ? 'mint' : p >= 70 ? 'gul' : 'rod';
    const status = p == null ? 'Inte skannat ännu' : p >= 90 ? 'Skyddat' : p >= 70 ? 'Bör ses över' : 'Åtgärda nu';
    const knapp = (ids, ikon, text, accent) => `<button type="button" class="${accent ? 'sh-knapp sh-knapp-accent' : 'sh-knapp'}" data-g="sh-skanna" data-ids="${e(ids)}" ${skan.kor ? 'disabled' : ''}>${ik(ikon)}<span>${e(text)}</span></button>`;
    const hjalte = `
      <section class="sh-hjalte" data-sh-hub data-mork-yta data-ton="${ton}" ${skan.kor ? 'data-skannar' : ''}>
        <div class="sh-rutnat" aria-hidden="true"></div>
        <div class="sh-text">
          <span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Säkerhetshubben · ${SKARP ? 'skarpt läge' : 'demoläget'}</span>
          <h1>Säkerhet <em>i realtid.</em></h1>
          <p class="sh-ingress">Kontrollerna körs i webbläsaren mot sidans kod och CRM:ets data – skadlig kod, uppdateringar, buggar, läckor, intrångsförsök, avvikande beteende och sådant som är trasigt.</p>
          <div class="sh-knappar">${knapp('', 'radar', 'Skanna allt', true)}${knapp('uppdatering', 'uppgradera', 'Sök uppdateringar')}${knapp('buggar', 'nyckelverktyg', 'Kontrollera buggar')}${knapp('lacka', 'fingeravtryck', 'Läckkontroll')}${knapp('intrang,beteende', 'skold-larm', 'Intrång och beteende')}</div>
          ${shDelar(S, p, status, ton)}
          <p class="sh-senast">${senast ? `Senast skannat ${e(relTid(senast.tid))} av ${e(anv(senast.av).kort)}` : 'Ingen skanning gjord ännu – kör en för att få säkerhetspoängen.'}</p>
        </div>
        <div class="sh-karnkol">${karnaSak(S, p, status)}</div>
      </section>`;
    const kontrollKort = KONTROLLER.map((k) => {
      const r = S.senast[k.id]; const f = r ? r.fynd : [];
      const varst = !r ? 'ny' : f.some((x) => x.allvar === 'hog') ? 'hog' : f.some((x) => x.allvar === 'medel') ? 'medel' : f.some((x) => x.allvar === 'lag') ? 'lag' : 'ok';
      const viktiga = f.filter((x) => x.allvar !== 'info');
      const text = !r ? 'Inte körd ännu' : viktiga.length ? plural(viktiga.length, 'fynd', 'fynd') : 'Inga fynd';
      const oppen = shUi.oppen === k.id;
      return `<article class="sh-kontroll" data-sh-kontroll="${e(k.id)}" data-lage="${varst}">
        <span class="sh-forlopp" aria-hidden="true"><i></i></span>
        <header><span class="sh-kontroll-ikon">${ik(k.ikon)}</span><div><h3>${e(k.namn)}</h3><p>${e(k.under)}</p></div><span class="sh-lampa" title="${e(text)}"></span></header>
        <div class="sh-kontroll-fot"><strong>${e(text)}</strong><small>${r ? e(relTid(r.tid)) : ''}</small>
          <button type="button" class="knapp knapp-glas knapp-liten" data-g="sh-skanna" data-ids="${e(k.id)}" ${skan.kor ? 'disabled' : ''}>${ik('radar')}Kör</button>
          ${r ? `<button type="button" class="knapp knapp-spok knapp-liten" data-g="sh-visa" data-id="${e(k.id)}" aria-expanded="${oppen}">${oppen ? 'Dölj' : 'Detaljer'}</button>` : ''}</div>
        ${oppen && r ? `<ul class="sh-steg">${k.steg.map((s) => `<li>${ik('bock')}${e(s)}</li>`).join('')}</ul>
          ${f.length ? `<ul class="sh-fynd">${f.map((x) => `<li data-allvar="${e(x.allvar)}"><span class="sh-allvar">${e(ALLVAR[x.allvar].namn)}</span><span class="sh-fynd-text">${e(x.text)}</span>${x.lank ? `<a class="knapp knapp-spok knapp-liten" href="${e(x.lank)}">Visa</a>` : ''}${x.atgard ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="${e(x.atgard.g)}" ${Object.entries(x.atgard.data || {}).map(([a, v]) => `data-${e(a)}="${e(v)}"`).join(' ')}>${e(x.atgard.text)}</button>` : ''}</li>`).join('')}</ul>` : '<p class="sh-inga">Allt såg bra ut.</p>'}` : ''}
      </article>`;
    }).join('');
    const hist = S.historik.slice(0, 12).reverse();
    const terminal = `<section class="lp-band lp-band-halv sh-terminal-kort" data-mork-yta><header class="lp-band-huvud"><div><p class="lp-ogon">Logg</p><h2>Skanningens <em>logg</em></h2></div></header>
      <div class="sh-terminal" data-sh-terminal role="log" aria-live="polite">${(skan.logg.length ? skan.logg : [{ text: senast ? `Senaste skanningen: ${senast.poang} av 100 (${new Date(senast.tid).toLocaleString('sv-SE')})` : 'Redo. Tryck på Skanna allt.', ton: 'start' }]).map((x) => `<p class="sh-rad${x.ton ? ` sh-rad-${x.ton}` : ''}">› ${e(x.text)}</p>`).join('')}</div></section>`;
    const historik = `<section class="lp-band lp-band-halv" data-mork-yta><header class="lp-band-huvud"><div><p class="lp-ogon">Historik</p><h2>Poängen <em>över tid</em></h2></div>${hist.length ? `<span class="lp-band-tal">${plural(S.historik.length, 'skanning', 'skanningar')}</span>` : ''}</header>
      ${hist.length > 1 ? `<div class="lp-spark-stor sh-historik">${sparkline(hist.map((x) => x.poang || 0), 360, 70)}</div>` : ''}
      ${S.historik.length ? `<ul class="sh-histlista">${S.historik.slice(0, 5).map((x) => `<li><strong data-ton="${x.poang >= 90 ? 'mint' : x.poang >= 70 ? 'gul' : 'rod'}">${x.poang}</strong><span>${e(x.vad === 'allt' ? 'Full skanning' : String(x.vad).split(',').map((id) => (KONTROLLER.find((k) => k.id === id) || {}).namn || id).join(', '))}<small>${e(anv(x.av).kort)} · ${e(relTid(x.tid))} · ${plural(x.fynd, 'fynd', 'fynd')}</small></span></li>`).join('')}</ul>` : '<p class="lp-tom">Ingen skanning ännu.</p>'}
      <div class="sh-sakl"><p class="lp-ogon">Säkerhetsloggen</p>${S.logg.length ? `<ul class="lp-flode sh-sakl-lista">${S.logg.slice(0, 5).map((x) => `<li>${av(anv(x.av))}<span>${e(String(x.text).slice(0, 96))}<small>${e(relTid(x.tid))}</small></span></li>`).join('')}</ul>` : '<p class="lp-tom">Inga exporter, importer, rolländringar eller rensningar ännu.</p>'}</div></section>`;
    return `${hjalte}<section class="lp-band" data-mork-yta aria-labelledby="sh-h-k"><header class="lp-band-huvud"><div><p class="lp-ogon">01 · Kontroller</p><h2 id="sh-h-k">Sju <em>kontroller</em></h2><p class="lp-ingress">Varje kontroll kan köras för sig. Fynd med åtgärd har en knapp – inget ändras utan att du bekräftar.</p></div></header>
      <div class="sh-kontroller">${kontrollKort}
        <article class="sh-kontroll sh-kontroll-total" data-lage="${p == null ? 'ny' : p >= 90 ? 'ok' : p >= 70 ? 'medel' : 'hog'}">
          <header><span class="sh-kontroll-ikon">${ik('skold')}</span><div><h3>Hela skyddet</h3><p>Alla sju kontroller i en skanning – tar några sekunder.</p></div><span class="sh-lampa"></span></header>
          <div class="sh-kontroll-fot"><strong>${p == null ? 'Inte skannat' : `${p} av 100`}</strong><small>${senast ? e(relTid(senast.tid)) : ''}</small>
            <button type="button" class="knapp knapp-accent knapp-liten" data-g="sh-skanna" data-ids="" ${skan.kor ? 'disabled' : ''}>${ik('radar')}Skanna allt</button></div></article></div></section>
      <div class="lp-tvakol">${terminal}${historik}</div>`;
  }

  /* 04-adminpanelen (#/admin) -------------------------------------------------------------------------- */
  // Det som bör åtgärdas (adminpanelen och översikten): profiler, mål, ansvariga, skanningen, säkerhetsfynd och fel
  function adminForslag() {
    const d = db(); const S = sak(); const aktiva = d.anvandare.filter(arAktiv); const forslag = [];
    // Ansökningar om ledighet som väntar på beslut – administratören godkänner dem under Försäljning (#/chef), som chefen
    const ansoker = aktiva.filter((u) => u.id !== jag() && (u.franvaro || []).some((f) => f.status === 'ansokt'));
    const antalAns = sum(ansoker.map((u) => (u.franvaro || []).filter((f) => f.status === 'ansokt').length));
    if (antalAns) forslag.push({ ikon: 'flyg', text: `${plural(antalAns, 'ansökan om ledighet väntar på beslut', 'ansökningar om ledighet väntar på beslut')}`, under: ansoker.map((u) => u.kort).join(', '), lank: '#/chef', knapp: 'Granska' });
    const utanBild = aktiva.filter((u) => !u.bild); if (utanBild.length) forslag.push({ ikon: 'kamera', text: `${plural(utanBild.length, 'konto saknar', 'konton saknar')} profilbild`, under: utanBild.map((u) => u.kort).join(', '), lank: `#/profil/${utanBild[0].id}`, knapp: 'Komplettera' });
    const utanMal = aktiva.filter((u) => u.roll === 'salj' && !u.mal); if (utanMal.length) forslag.push({ ikon: 'mal', text: `${plural(utanMal.length, 'säljare saknar', 'säljare saknar')} mål`, under: utanMal.map((u) => u.kort).join(', '), g: 'lp-mal', knapp: 'Sätt mål' });
    const foraldralosa = d.affarer.filter((a) => ['kontakt', 'besok', 'offert', 'underlag'].includes(a.steg) && (!a.ansvarig || !arAktiv(anv(a.ansvarig)) || anv(a.ansvarig).namn === 'Okänd'));
    if (foraldralosa.length) forslag.push({ ikon: 'flytta', text: `${plural(foraldralosa.length, 'öppen affär saknar', 'öppna affärer saknar')} aktiv ansvarig`, under: foraldralosa.slice(0, 3).map((a) => a.titel).join(', '), g: 'lp-fordela', data: { affar: foraldralosa[0].id }, knapp: 'Fördela' });
    const senast = S.historik[0]; if (!senast || Date.now() - Date.parse(senast.tid) > 7 * 864e5) forslag.push({ ikon: 'radar', text: senast ? 'Ingen säkerhetsskanning på över en vecka' : 'Ingen säkerhetsskanning gjord ännu', under: 'Skanningen tar några sekunder', g: 'sh-skanna-ga', knapp: 'Skanna' });
    if (oppnaFynd()) forslag.push({ ikon: 'skold-larm', text: `${plural(oppnaFynd(), 'säkerhetsfynd', 'säkerhetsfynd')} att åtgärda`, under: 'Från senaste skanningen', lank: '#/sakerhet', knapp: 'Visa' });
    const felN = (window.UPFelLogg ? window.UPFelLogg.lista : []).filter((x) => !x.tidigare).length; if (felN) forslag.push({ ikon: 'bugg', text: `${plural(felN, 'fel', 'fel')} sedan sidan laddades`, under: 'Skript eller filer som inte fungerade', g: 'sh-skanna-ga', data: { ids: 'buggar' }, knapp: 'Kontrollera' });
    return forslag;
  }
  const forslagRader = (forslag) => forslag.map((x) => `<li class="lp-upp-rad" data-ton="is"><span class="lp-upp-ikon">${ik(x.ikon)}</span><span class="lp-upp-text"><strong>${e(x.text)}</strong><small>${e(x.under)}</small></span><span class="lp-upp-knappar">${x.lank ? `<a class="knapp knapp-glas knapp-liten" href="${e(x.lank)}">${e(x.knapp)}</a>` : `<button type="button" class="knapp knapp-glas knapp-liten" data-g="${e(x.g)}" ${Object.entries(x.data || {}).map(([a, v]) => `data-${e(a)}="${e(v)}"`).join(' ')}>${e(x.knapp)}</button>`}</span></li>`).join('');
  const admUi = { filter: 'alla', sok: '', logg: 'alla' };
  /* Skarpt läge: e-post och senaste inloggning finns bara i serverns kontolista (posterna i db.anvandare har ingen e-post) –
     hämtas när adminpanelen visas (högst var 30:e sekund) och vyn ritas om när den kommit */
  const server = { lista: null, tid: 0, hamtar: false };
  function hamtaServerKonton() {
    if (!SKARP || !L.admin || server.hamtar || Date.now() - server.tid < 30000) return;
    server.hamtar = true;
    L.admin.lista().then((svar) => {
      server.hamtar = false; server.tid = Date.now();
      if (svar.ok) { server.lista = svar.anvandare || []; if (/^#\/admin/.test(location.hash)) rendera(); }
    }, () => { server.hamtar = false; });
  }
  const serverKonto = (u) => (server.lista || []).find((x) => x.id === u.id) || null;
  const epostFor = (u) => u.epost || (serverKonto(u) || {}).epost || '';
  const senastText = (u) => {
    if (LED && LED.doljTid && LED.doljTid(u)) return '–'; // osynlig: offline utan tid
    const s = serverKonto(u); const t = u.senastAktiv || (s && (s.senastAktiv || s.senastInloggad));
    if (t) return relTid(t);
    return SKARP && server.lista ? 'Inte inloggad än' : '–';
  };
  const install = (nyckel) => { try { return localStorage.getItem(`up-crm-${nyckel}`) || ''; } catch (err) { return ''; } };
  function visaAdmin() {
    if (!arAdm(mig())) return lasHjalte('Adminpanelen', 'Adminpanelen är till för administratörer.');
    hamtaServerKonton(); hamtaServerSak();
    const d = db(); const S = sak(); const anvandare = d.anvandare;
    const aktiva = anvandare.filter(arAktiv); const nu = aktiva.filter((u) => LED && LED.arAktivNu(u)).length;
    const poster = sum([...SAMLINGAR, 'kundlankar', 'offerter'].map(antal)); const p = totalPoang();
    const hjalte = `<section class="sidhjalte lp-adminhjalte" data-sidhjalte data-mork-yta>
        <div class="sidhjalte-text"><span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Administration · ${SKARP ? 'skarpt läge' : 'demoläget'}</span>
          <h1>Kontrollrummet <em>för CRM:et.</em></h1>
          <p class="sidhjalte-ingress">Konton och roller, behörigheter, data och system, loggen och säkerheten – och förslag på det som bör åtgärdas.</p>
          <div class="sidhjalte-knappar"><button class="knapp knapp-accent" type="button" data-g="lp-ny-anstalld">${ik('anvandare-plus')}Lägg till konto</button>
            <a class="knapp knapp-glas" href="#/sakerhet">${ik('radar')}Säkerhetshubben</a><button class="knapp knapp-glas" type="button" data-g="adm-export">${ik('ladda-ner')}Exportera data</button></div></div>
        <div class="sidhjalte-tal" data-antal="4">${[
          glasKort({ emo: 'anstallda', etikett: 'Konton', varde: aktiva.length, under: `${anvandare.length - aktiva.length ? `${plural(anvandare.length - aktiva.length, 'inaktiverat', 'inaktiverade')} · ` : ''}${nu} ${nu === 1 ? 'aktiv' : 'aktiva'} nu` }),
          glasKort({ emo: 'databas', etikett: 'Poster i CRM:et', varde: poster, under: `${kb(lagringBytes())} i webbläsaren` }),
          glasKort({ emo: 'puls', etikett: 'Händelser 7 dagar', varde: d.aktiviteter.filter((x) => x.typ !== 'franvaro' && Date.now() - Date.parse(x.tid) < 7 * 864e5).length, under: 'i tidslinjerna' }),
          glasKort({ emo: 'skold', etikett: 'Säkerhetspoäng', text: p == null ? 'Ej skannat' : `${p} / 100`, under: S.historik[0] ? `skannat ${relTid(S.historik[0].tid)}` : 'kör en skanning', href: '#/sakerhet', ton: p != null && p < 70 ? 'gul' : '' }),
        ].join('')}</div></section>`;
    // konton
    const filtrerade = anvandare.filter((u) => (admUi.filter === 'alla' ? true : admUi.filter === 'inaktiva' ? !arAktiv(u) : admUi.filter === 'ledning' ? (u.chef || u.roll === 'admin' || u.admin) : u.roll === admUi.filter) && (!admUi.sok || `${u.namn} ${epostFor(u)} ${u.titel || ''}`.toLowerCase().includes(admUi.sok.toLowerCase())));
    const fk = (id, namn) => `<button type="button" class="lp-filter" data-g="adm-filter" data-filter="${id}" aria-pressed="${admUi.filter === id}">${namn}</button>`;
    const admins = anvandare.filter((u) => arAktiv(u) && (u.roll === 'admin' || u.admin));
    const konton = `<section class="lp-band" data-mork-yta aria-labelledby="adm-h-k"><header class="lp-band-huvud"><div><p class="lp-ogon">01 · Konton</p><h2 id="adm-h-k">Konton <em>och roller</em></h2><p class="lp-ingress">Vem som finns i CRM:et, vilka roller de har, deras status och när de senast var aktiva.</p></div>
        <div class="lp-filterrad" role="group" aria-label="Visa">${fk('alla', 'Alla')}${fk('salj', 'Sälj')}${fk('test', 'Testteam')}${fk('ledning', 'Ledning')}${fk('inaktiva', 'Inaktiverade')}<input class="falt adm-sok" type="search" placeholder="Sök konto …" value="${e(admUi.sok)}" data-adm-sok aria-label="Sök konto"></div></header>
      <div class="adm-tabell-ram"><div class="adm-tabell" role="table" aria-label="Konton"><div class="adm-rad adm-rad-huvud" role="row"><span role="columnheader">Konto</span><span role="columnheader">Roller</span><span role="columnheader">Status</span><span role="columnheader">Senast aktiv</span><span role="columnheader"><span class="sr">Åtgärder</span></span></div>
        ${filtrerade.map((u) => { const sistaAdmin = (u.roll === 'admin' || u.admin) && admins.length <= 1 && arAktiv(u); return `<div class="adm-rad${arAktiv(u) ? '' : ' adm-inaktiv'}" role="row">
          <a class="adm-vem" role="cell" href="#/profil/${e(u.id)}">${av(u, 'm')}<span><strong>${e(u.namn)}${u.id === jag() ? ' <small class="adm-du">du</small>' : ''}</strong><small>${e(epostFor(u) || '–')}</small></span></a>
          <span role="cell" class="adm-roller">${LED ? LED.roller(u).map((r) => `<span class="lp-roll" data-roll="${e(r)}">${e(r)}</span>`).join('') : e(K.rollText(u))}</span>
          <span role="cell">${LED ? `<span class="lp-narv" style="--narv:${e(LED.narvaro(u).farg)}" title="${e(arAktiv(u) ? LED.statusText(u) : 'Inaktiverat')}"><i aria-hidden="true"></i><span>${e(arAktiv(u) ? LED.statusText(u) : 'Inaktiverat')}</span></span>` : ''}</span>
          <span role="cell" class="adm-senast">${e(senastText(u))}</span>
          <span role="cell" class="adm-atgarder"><button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-andra-profil" data-id="${e(u.id)}" title="Ändra ${e(u.namn)}">${ik('redigera')}<span class="adm-knapptext">Ändra</span></button>
            ${!SKARP && u.id !== jag() && arAktiv(u) ? `<button type="button" class="knapp knapp-spok knapp-liten adm-ikonknapp" data-g="lp-logga-in-som" data-id="${e(u.id)}" title="Logga in som ${e(u.kort)}">${ik('logga-ut')}<span class="sr">Logga in som ${e(u.kort)}</span></button>` : '<span class="adm-plats" aria-hidden="true"></span>'}
            ${u.id !== jag() && !SKARP ? `<button type="button" class="knapp knapp-spok knapp-liten" data-g="adm-aktiv" data-id="${e(u.id)}" title="${arAktiv(u) ? 'Inaktivera' : 'Aktivera'} ${e(u.namn)}" ${sistaAdmin ? 'disabled title="Det måste finnas minst en aktiv administratör"' : ''}>${ik(arAktiv(u) ? 'las' : 'bock')}<span class="adm-knapptext">${arAktiv(u) ? 'Inaktivera' : 'Aktivera'}</span></button>` : '<span class="adm-plats" aria-hidden="true"></span>'}</span></div>`; }).join('') || '<p class="lp-tom">Inga konton matchar.</p>'}
      </div></div>${SKARP ? `<p class="lp-not">Skarpt läge: inbjudningar, roller och inaktivering görs under <a href="#/anvandare">Användare</a> (servern äger kontona).</p>` : ''}</section>`;
    // behörigheter (så som koden faktiskt fungerar)
    const RATT = [
      ['Kunder, affärer och säljtavlan', ['ja', 'ja', 'läsa', 'ja']], ['Offerter, ordrar och kundlänkar', ['ja', 'ja', 'läsa', 'ja']], ['Projekt och testdagar', ['läsa', 'läsa', 'ja', 'ja']],
      ['Hälsoformulärens svar', ['nej', 'nej', 'ja', 'nej']], ['Försäljningsledning, mål och fördelning', ['nej', 'ja', 'nej', 'ja']], ['Lägga till anställda', ['nej', 'ja', 'nej', 'ja']],
      ['Adminpanelen och säkerhetshubben', ['nej', 'nej', 'nej', 'ja']], ['Exportera all data', ['nej', 'nej', 'nej', 'ja']], [SKARP ? 'Återställa exempeldata' : 'Återställa exempeldata (demo: alla)', SKARP ? ['nej', 'nej', 'nej', 'ja'] : ['ja', 'ja', 'ja', 'ja']],
    ];
    const behorighet = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="adm-h-b"><header class="lp-band-huvud"><div><p class="lp-ogon">03 · Behörigheter</p><h2 id="adm-h-b">Vem får <em>göra vad</em></h2></div></header>
      <div class="adm-matris" role="table"><div class="adm-matris-rad adm-matris-huvud" role="row"><span role="columnheader"></span>${[['Sälj', 'Sälj'], ['Chef', 'Försäljningschef'], ['Test', 'Testteam'], ['Admin', 'Admin']].map(([k, l]) => `<span role="columnheader" title="${l}" aria-label="${l}">${k}</span>`).join('')}</div>
      ${RATT.map(([namn, v]) => `<div class="adm-matris-rad" role="row"><span role="rowheader">${e(namn)}</span>${v.map((x) => `<span role="cell" data-ratt="${x}">${x === 'ja' ? ik('bock') : x === 'nej' ? '<i aria-hidden="true">–</i>' : e(x)}<span class="sr">${x}</span></span>`).join('')}</div>`).join('')}</div>
      <p class="lp-not">${SKARP ? 'Servern kontrollerar varje ändring (bara kunden signerar, bara admin raderar).' : 'Demoläget: rollerna väljs fritt i sidomenyn – i skarpt läge loggar var och en in med e-post och engångskod.'}</p></section>`;
    // system och data
    const max = Math.max(1, ...[...SAMLINGAR, 'kundlankar', 'offerter'].map(antal));
    const system = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="adm-h-s"><header class="lp-band-huvud"><div><p class="lp-ogon">05 · System</p><h2 id="adm-h-s">Data <em>och system</em></h2></div></header>
      <ul class="adm-data">${[...SAMLINGAR, 'kundlankar', 'offerter'].map((s) => `<li><span>${e(SAMLNAMN[s])}</span><span class="lp-stapel" style="--andel:${(antal(s) / max).toFixed(3)}" aria-hidden="true"><i></i></span><strong>${antal(s).toLocaleString('sv-SE')}</strong></li>`).join('')}</ul>
      <dl class="lp-fakta adm-fakta"><div><dt>Läge</dt><dd>${SKARP ? `Skarpt (${e((L.lage && L.lage.miljo) || 'server')})` : 'Demo – allt i den här webbläsaren'}</dd></div>
        <div><dt>Version</dt><dd>${e(($('script[src*="crm.js"]') || {}).getAttribute ? ($('script[src*="crm.js"]').getAttribute('src').split('?v=')[1] || '–') : '–')} · data ${e(d.version || '–')}</dd></div>
        <div><dt>Lagring</dt><dd>${kb(lagringBytes())}${SKARP ? ' (servern: SQLite)' : ' av ca 5 MB'}</dd></div>
        <div><dt>3D-scener</dt><dd>${install('3d') === 'av' ? 'Avstängda' : 'På'}</dd></div></dl>
      <div class="adm-knappar"><button type="button" class="knapp knapp-glas knapp-liten" data-g="adm-export">${ik('ladda-ner')}Exportera (JSON)</button>${!SKARP ? `<label class="knapp knapp-glas knapp-liten">${ik('uppladdning')}Importera<input type="file" accept="application/json,.json" data-adm-import hidden></label>` : ''}${K.kanAterstalla() ? `<button type="button" class="knapp knapp-spok knapp-liten" data-g="aterstall">${ik('aterstall')}Återställ exempeldata</button>` : ''}</div></section>`;
    // förslag
    const forslag = adminForslag();
    const snabb = [['lp-ny-anstalld', 'anvandare-plus', 'Lägg till konto'], ['sh-skanna-ga', 'radar', 'Skanna nu'], ['adm-export', 'ladda-ner', 'Exportera data'], ['lp-mal', 'mal', 'Säljmål']];
    const forslagHtml = `<section class="lp-band adm-forslag" data-mork-yta aria-labelledby="adm-h-f"><header class="lp-band-huvud"><div><p class="lp-ogon">02 · Förslag</p><h2 id="adm-h-f">Bör <em>åtgärdas</em></h2></div><div class="adm-snabb" role="group" aria-label="Snabbåtgärder">${snabb.map(([g, i, t]) => `<button type="button" class="knapp knapp-glas knapp-liten" data-g="${g}">${ik(i)}${t}</button>`).join('')}</div></header>
      ${forslag.length ? `<ul class="lp-upp">${forslag.map((x) => `<li class="lp-upp-rad" data-ton="is"><span class="lp-upp-ikon">${ik(x.ikon)}</span><span class="lp-upp-text"><strong>${e(x.text)}</strong><small>${e(x.under)}</small></span><span class="lp-upp-knappar">${x.lank ? `<a class="knapp knapp-glas knapp-liten" href="${e(x.lank)}">${e(x.knapp)}</a>` : `<button type="button" class="knapp knapp-glas knapp-liten" data-g="${e(x.g)}" ${Object.entries(x.data || {}).map(([a, v]) => `data-${e(a)}="${e(v)}"`).join(' ')}>${e(x.knapp)}</button>`}</span></li>`).join('')}</ul>`
        : `<div class="lp-lugnt">${ik('skold')}<div><strong>Inget att åtgärda</strong><small>Profiler, mål, ansvariga och säkerheten ser bra ut.</small></div></div>`}</section>`;
    // logg
    const handelser = [...d.aktiviteter.map((x) => ({ tid: x.tid, av: x.av, text: x.text, typ: x.typ === 'system' ? 'andring' : 'crm', kundId: x.kundId })), ...S.logg.map((x) => ({ tid: x.tid, av: x.av, text: x.text, typ: x.typ === 'roll' || x.typ === 'konto' ? 'konto' : 'sakerhet' }))]
      .filter((x) => admUi.logg === 'alla' || x.typ === admUi.logg).sort((a, b) => (a.tid < b.tid ? 1 : -1)).slice(0, 8);
    const lk = (id, namn) => `<button type="button" class="lp-filter" data-g="adm-logg" data-filter="${id}" aria-pressed="${admUi.logg === id}">${namn}</button>`;
    const logg = `<section class="lp-band lp-band-halv adm-loggband" data-mork-yta aria-labelledby="adm-h-l"><header class="lp-band-huvud"><div><p class="lp-ogon">06 · Logg</p><h2 id="adm-h-l">Granskning<em>sloggen</em></h2></div>
        <div class="lp-filterrad" role="group" aria-label="Visa">${lk('alla', 'Allt')}${lk('andring', 'Ändringar')}${lk('konto', 'Konton')}${lk('sakerhet', 'Säkerhet')}</div></header>
      ${handelser.length ? `<ul class="lp-flode adm-logg">${handelser.map((x) => `<li>${av(anv(x.av))}<span>${e(String(x.text).slice(0, 110))}<small>${e(anv(x.av).namn)} · ${e(relTid(x.tid))}</small></span></li>`).join('')}</ul>` : '<p class="lp-tom">Inget i loggen med det filtret.</p>'}
      ${SKARP ? '<p class="lp-not">Serverns fullständiga logg (inloggningar, läsningar) finns under <a href="#/anvandare">Användare</a>.</p>' : ''}</section>`;
    // inställningar (som faktiskt gör något)
    const valt = (n, v) => (install(n) === v ? 'selected' : '');
    const installningar = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="adm-h-i"><header class="lp-band-huvud"><div><p class="lp-ogon">04 · Inställningar</p><h2 id="adm-h-i">För den här <em>webbläsaren</em></h2></div></header>
      <div class="adm-installning"><div><strong>3D-scenerna</strong><small>Översikten, säljtavlan, Klubbmotorn och kundmötet. Av = platta versioner (snabbare på svaga datorer).</small></div>
        <select class="falt" data-adm-install="3d" aria-label="3D-scenerna"><option value="pa">På</option><option value="av" ${valt('3d', 'av')}>Av</option></select></div>
      <div class="adm-installning"><div><strong>Logga ut vid inaktivitet</strong><small>Utloggning efter så här lång tid utan klick eller tangenttryck.</small></div>
        <select class="falt" data-adm-install="utlogg" aria-label="Logga ut vid inaktivitet"><option value="0">Aldrig</option><option value="15" ${valt('utlogg', '15')}>15 minuter</option><option value="30" ${valt('utlogg', '30')}>30 minuter</option><option value="60" ${valt('utlogg', '60')}>En timme</option></select></div>
      <div class="adm-installning"><div><strong>Påminnelse om skanning</strong><small>Utropstecken vid Säkerhet i menyn när det gått en vecka sedan senaste skanningen.</small></div>
        <select class="falt" data-adm-install="skanpaminn" aria-label="Påminnelse om skanning"><option value="pa">På</option><option value="av" ${valt('skanpaminn', 'av')}>Av</option></select></div></section>`;
    return `${hjalte}${konton}${forslagHtml}<div class="lp-tvakol">${behorighet}${installningar}</div><div class="lp-tvakol">${system}${logg}</div>`;
  }

  /* 04b-översikten för adminkontot (#/ när rollen är admin) ---------------------------------------------------------
     Kontrollcentralen: hur hela CRM:et mår – säkerheten (senaste skanningen), kontona (aktivitet, förfallna uppgifter, stilla
     affärer/projekt, trasiga kopplingar i deras poster, profilen), datan (kopplingar, dubbletter, ogiltiga värden) och driften
     (fel sedan sidan laddades, lagringen, nätet). Allt räknas ur datan och kontrollerna – systemhälsan är snittet av delarna
     (säkerheten räknas först när en skanning finns). Kärnan i hjälten är 3D (ringar i preserve-3d, lutar efter musen). */
  const dagarSedan = (iso) => (iso && !isNaN(Date.parse(iso)) ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 864e5)) : null);
  const OPPNA_STEG = ['kontakt', 'besok', 'offert', 'underlag'];
  const LAGE_NAMN = { bra: 'Mår bra', se: 'Bör ses över', hjalp: 'Behöver hjälp', av: 'Inaktiverat' };
  function kontoHalsa(u, brott) {
    const d = db(); const punkter = []; let p = 100;
    // Osynlig syns som Offline utan tid även för administratören (ledning.js doljTid) – då räknas inte aktiviteten in i poängen
    const dold = !!(LED && LED.doljTid && LED.doljTid(u));
    const ds = dold ? null : dagarSedan(u.senastAktiv); const nu = !!(LED && LED.arAktivNu(u));
    if (!nu && !dold) { if (ds == null) p -= 25; else if (ds > 14) p -= 35; else if (ds > 7) p -= 18; }
    punkter.push({ ikon: 'puls', namn: 'Aktivitet', ok: nu || dold || (ds != null && ds <= 7), text: dold ? 'Offline' : nu ? 'Aktiv nu' : ds == null ? 'Aldrig inloggad' : `Senast ${relTid(u.senastAktiv)}` });
    const forf = d.todos.filter((t) => t.ansvarig === u.id && !t.klar && t.datum && t.datum < idag());
    p -= Math.min(30, forf.length * 8);
    punkter.push({ ikon: 'todo', namn: 'Uppgifter', ok: !forf.length, text: forf.length ? plural(forf.length, 'förfallen', 'förfallna') : 'Inga förfallna' });
    if (u.roll === 'salj') {
      const oppna = d.affarer.filter((a) => a.ansvarig === u.id && OPPNA_STEG.includes(a.steg)); const stilla = oppna.filter((a) => dagarSedan(a.stegAndrad) >= 14);
      p -= Math.min(24, stilla.length * 6);
      punkter.push({ ikon: 'salj', namn: 'Affärer', ok: !stilla.length, text: stilla.length ? `${plural(stilla.length, 'stilla', 'stilla')} i 14+ d` : `${plural(oppna.length, 'öppen', 'öppna')}, ingen stilla` });
    } else if (u.roll === 'test') {
      const pr = d.projekt.filter((x) => x.ansvarigTest === u.id && x.steg !== 'klar'); const stilla = pr.filter((x) => dagarSedan(x.stegAndrad) >= 21);
      p -= Math.min(24, stilla.length * 6);
      punkter.push({ ikon: 'projekt', namn: 'Projekt', ok: !stilla.length, text: stilla.length ? `${plural(stilla.length, 'står', 'står')} still 21+ d` : `${pr.length} pågående, inget stilla` });
    } else {
      const s = sak().historik[0]; const ok = !!s && dagarSedan(s.tid) <= 7; if (!ok) p -= 10;
      punkter.push({ ikon: 'radar', namn: 'Säkerhet', ok, text: s ? `Skannat ${relTid(s.tid)}` : 'Ingen skanning än' });
    }
    const mina = brott.filter((b) => b.vem === u.id); p -= Math.min(30, mina.length * 15);
    punkter.push({ ikon: 'nyckelverktyg', namn: 'Data', ok: !mina.length, text: mina.length ? plural(mina.length, 'trasig koppling', 'trasiga kopplingar') : 'Buggfritt' });
    const saknas = [!u.bild && 'bild', !u.tel && 'telefon', !SKARP && !u.epost && 'e-post'].filter(Boolean); p -= saknas.length * 3; // skarpt läge: e-posten är inloggningen och finns alltid
    punkter.push({ ikon: 'anstallda', namn: 'Profil', ok: !saknas.length, text: saknas.length ? `Saknar ${saknas.join(', ')}` : 'Komplett' });
    p = Math.max(0, Math.min(100, Math.round(p)));
    return { poang: p, lage: !arAktiv(u) ? 'av' : p >= 85 ? 'bra' : p >= 60 ? 'se' : 'hjalp', punkter };
  }
  function dataLage(brott) {
    const d = db(); let dubb = 0;
    for (const s of SAMLINGAR) { const sett = new Set(); for (const x of d[s] || []) { if (sett.has(x.id)) dubb++; sett.add(x.id); } }
    const ogiltiga = d.affarer.filter((a) => { try { return !isFinite(K.affarVarde(a)); } catch (err) { return true; } }).length + d.todos.filter((t) => t.datum && isNaN(Date.parse(t.datum))).length;
    return { brott: brott.length, dubb, ogiltiga, poang: Math.max(0, 100 - brott.length * 8 - dubb * 10 - ogiltiga * 6) };
  }
  function driftLage() {
    const fel = (window.UPFelLogg ? window.UPFelLogg.lista : []).filter((x) => !x.tidigare);
    let skriv = true; if (!SKARP) { try { localStorage.setItem('up-crm-test', '1'); localStorage.removeItem('up-crm-test'); } catch (err) { skriv = false; } }
    const bytes = lagringBytes(); const online = navigator.onLine !== false; const full = !SKARP && bytes > 4 * 1048576;
    return { fel, skriv, bytes, online, full, poang: Math.max(0, 100 - Math.min(50, fel.length * 10) - (skriv ? 0 : 40) - (full ? 20 : 0) - (online ? 0 : 20)) };
  }
  const dagar14 = () => Array.from({ length: 14 }, (_, i) => K.omDagar(i - 13));
  // Frånvaro och ledighetsbeslut (typ 'franvaro', ledning.js) räknas inte som aktivitet
  const perDag = (u, dagar) => dagar.map((dag) => db().aktiviteter.filter((x) => x.av === u.id && x.typ !== 'franvaro' && String(x.tid).slice(0, 10) === dag).length);
  const tonFor = (p) => (p == null ? 'is' : p >= 85 ? 'mint' : p >= 60 ? 'gul' : 'rod');
  // Kärnan: fyra ringar (säkerhet, konton, data, drift) runt systemhälsan, tre banor i 3D som snurrar runt
  function karna(delar, total) {
    const R = [104, 88, 72, 56];
    const ringar = delar.map((x, i) => { const r = R[i]; const l = 2 * Math.PI * r; const p = x.p == null ? 0 : x.p / 100;
      return `<circle cx="120" cy="120" r="${r}" class="ao-ring-spar"/><circle cx="120" cy="120" r="${r}" class="ao-ring-bage" data-del="${x.id}" style="--o:${(l * p).toFixed(1)}" stroke-dasharray="${(l * p).toFixed(1)} ${l.toFixed(1)}"/>`; }).join('');
    let streck = ''; for (let i = 0; i < 72; i++) { const v = (i / 72) * Math.PI * 2; const r0 = i % 6 ? 114 : 111; streck += `M${(120 + Math.cos(v) * r0).toFixed(1)} ${(120 + Math.sin(v) * r0).toFixed(1)}L${(120 + Math.cos(v) * 118).toFixed(1)} ${(120 + Math.sin(v) * 118).toFixed(1)}`; }
    return `<div class="ao-karna" data-sh-tilt data-rorelse aria-hidden="true"><div class="ao-scen">
        <i class="ao-golv"></i>
        <i class="ao-orbit ao-o1"><b></b></i><i class="ao-orbit ao-o2"><b></b></i><i class="ao-orbit ao-o3"><b></b></i>
        <svg class="ao-ringar" viewBox="0 0 240 240"><path d="${streck}" class="ao-streck"/>${ringar}</svg>
        <div class="ao-mitt"><strong>${total == null ? '–' : total}</strong><small>Systemhälsa</small><span>${total == null ? 'Kör en skanning' : LAGE_NAMN[total >= 85 ? 'bra' : total >= 60 ? 'se' : 'hjalp']}</span></div>
      </div></div>`;
  }
  function visaAdminOversikt() {
    hamtaServerSak();
    const d = db(); const u0 = mig(); const S = sak();
    const brott = kopplingsBrott(); const dl = dataLage(brott); const dr = driftLage();
    const alla = d.anvandare; const aktiva = alla.filter(arAktiv);
    const konton = alla.map((u) => ({ u, h: kontoHalsa(u, brott) }));
    const aktivaH = konton.filter((x) => arAktiv(x.u));
    const kontoP = aktivaH.length ? Math.round(sum(aktivaH.map((x) => x.h.poang)) / aktivaH.length) : null;
    const sakP = totalPoang(); const senast = S.historik[0];
    const delar = [{ id: 'sakerhet', namn: 'Säkerhet', p: sakP }, { id: 'konton', namn: 'Konton', p: kontoP }, { id: 'data', namn: 'Data', p: dl.poang }, { id: 'drift', namn: 'Drift', p: dr.poang }];
    const giltiga = delar.filter((x) => x.p != null); const total = giltiga.length ? Math.round(sum(giltiga.map((x) => x.p)) / giltiga.length) : null;
    const nuN = aktiva.filter((u) => LED && LED.arAktivNu(u)).length;
    const fyndAlla = allaSenaste().flatMap((x) => x.fynd); const fyndN = (a) => fyndAlla.filter((x) => x.allvar === a).length;
    const h = new Date().getHours(); const halsning = h < 5 ? 'God natt' : h < 10 ? 'God morgon' : h < 17 ? 'Hej' : 'God kväll';
    const poster = sum([...SAMLINGAR, 'kundlankar', 'offerter'].map(antal));
    const handelser7 = d.aktiviteter.filter((x) => x.typ !== 'franvaro' && Date.now() - Date.parse(x.tid) < 7 * 864e5).length;
    const remsa = [
      { ikon: 'skold', etikett: 'Säkerhet', varde: sakP == null ? '–' : `${sakP}/100`, under: senast ? relTid(senast.tid) : 'ej skannat', ton: tonFor(sakP), href: '#/sakerhet' },
      { ikon: 'anstallda', etikett: 'I tjänst nu', varde: `${nuN}/${aktiva.length}`, under: `${aktivaH.filter((x) => x.h.lage === 'bra').length} mår bra`, ton: 'is', href: '#/admin' },
      { ikon: 'bugg', etikett: 'Fel i sidan', varde: String(dr.fel.length), under: dr.fel.length ? 'sedan laddning' : 'buggfritt', ton: dr.fel.length ? 'gul' : 'mint' },
      { ikon: 'nyckelverktyg', etikett: 'Kopplingar', varde: dl.brott ? `${dl.brott} fel` : 'OK', under: dl.brott ? 'trasiga' : 'allt hänger ihop', ton: dl.brott ? 'gul' : 'mint' },
      { ikon: 'databas', etikett: 'Poster', varde: poster.toLocaleString('sv-SE'), under: kb(lagringBytes()), ton: 'lila' },
      { ikon: 'puls', etikett: 'Händelser', varde: String(handelser7), under: 'senaste 7 dagarna', ton: 'is' },
    ];
    const knapp = (attr, ikon, text, accent) => `<${attr.startsWith('href') ? 'a' : 'button type="button"'} class="sh-knapp${accent ? ' sh-knapp-accent' : ''}" ${attr}>${ik(ikon)}<span>${e(text)}</span></${attr.startsWith('href') ? 'a' : 'button'}>`;
    const hjalte = `<section class="ao-hjalte" data-mork-yta data-ton="${tonFor(total)}">
        <div class="sh-rutnat" aria-hidden="true"></div>
        <div class="ao-text">
          <span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Kontrollcentralen · ${SKARP ? 'skarpt läge' : 'demoläget'} · ${e(new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
          <h1>${e(halsning)}, ${e(u0.kort || u0.namn.split(' ')[0])}. <em>Hela CRM:et i en blick.</em></h1>
          <p class="ao-ingress">Säkerheten, kontona, datan och driften – hur allt mår just nu, räknat ur CRM:ets data och säkerhetskontrollerna. Klicka på en del för detaljerna.</p>
          <div class="sh-knappar">${knapp('data-g="sh-skanna-ga"', 'radar', 'Skanna allt', true)}${knapp('href="#/admin"', 'server', 'Adminpanelen')}${knapp('href="#/sakerhet"', 'skold', 'Säkerhet')}${knapp('data-g="lp-ny-anstalld"', 'anvandare-plus', 'Nytt konto')}</div>
          <p class="sh-senast">${senast ? `Senaste skanningen ${e(relTid(senast.tid))} av ${e(anv(senast.av).kort)} – ${senast.poang} av 100` : 'Ingen säkerhetsskanning gjord ännu – systemhälsan räknar säkerheten först när en finns.'}</p>
        </div>
        <div class="ao-karnkol">${karna(delar, total)}
          <ul class="ao-delar">${delar.map((x) => `<li data-del="${x.id}"><i aria-hidden="true"></i><span>${e(x.namn)}</span><strong>${x.p == null ? '–' : x.p}</strong></li>`).join('')}</ul>
        </div>
        <div class="ao-remsa">${remsa.map((x) => `<${x.href ? `a href="${x.href}"` : 'div'} class="ao-tal" data-ton="${x.ton}"><span class="ao-tal-ikon">${ik(x.ikon)}</span><span class="ao-tal-text"><small>${e(x.etikett)}</small><strong>${e(x.varde)}</strong><em>${e(x.under)}</em></span></${x.href ? 'a' : 'div'}>`).join('')}</div>
      </section>`;
    // 01 kontona: ett kort per konto – hur det mår och varför
    const dagar = dagar14();
    const ordning = { hjalp: 0, se: 1, bra: 2, av: 3 };
    const kort = [...konton].sort((a, b) => ordning[a.h.lage] - ordning[b.h.lage] || a.h.poang - b.h.poang).map(({ u, h: hl }) => {
      const n = LED ? LED.narvaro(u) : { farg: '#7ee0c3', namn: '' }; const pd = perDag(u, dagar); const l = 2 * Math.PI * 18;
      return `<article class="ao-konto" data-lage="${hl.lage}" style="--narv:${e(n.farg)}">
        <header class="ao-konto-topp"><a class="ao-konto-vem" href="#/profil/${e(u.id)}">${av(u, 'l')}<span><strong>${e(u.namn)}</strong><small>${e(LED ? LED.roller(u).join(' · ') : K.rollText(u))}</small></span></a>
          <span class="ao-matare" title="Hälsa ${hl.poang} av 100"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="ao-matare-spar"/><circle cx="22" cy="22" r="18" class="ao-matare-bage" style="--o:${((hl.poang / 100) * l).toFixed(1)}" stroke-dasharray="${((hl.poang / 100) * l).toFixed(1)} ${l.toFixed(1)}"/></svg><b>${hl.poang}</b></span></header>
        <div class="ao-konto-rad">${LED ? `<span class="lp-narv" style="--narv:${e(n.farg)}"><i aria-hidden="true"></i><span>${e(arAktiv(u) ? LED.statusText(u) : 'Inaktiverat')}</span></span>` : ''}<span class="ao-lage">${e(LAGE_NAMN[hl.lage])}</span></div>
        <ul class="ao-punkter">${hl.punkter.map((x) => `<li data-ok="${x.ok ? 1 : 0}"><span class="ao-p-ikon">${ik(x.ikon)}</span><span class="ao-p-namn">${e(x.namn)}</span><em title="${e(x.text)}">${e(x.text)}</em><i class="ao-p-lampa" aria-label="${x.ok ? 'OK' : 'Behöver ses över'}"></i></li>`).join('')}</ul>
        <footer class="ao-konto-fot"><span class="ao-spark">${sparkline(pd, 132, 28)}</span><small>${plural(sum(pd), 'händelse', 'händelser')} · 14 d</small><a class="ao-pil" href="#/profil/${e(u.id)}" aria-label="Profilen för ${e(u.namn)}">${ik('pil')}</a></footer>
      </article>`; }).join('');
    const antalLage = (l) => aktivaH.filter((x) => x.h.lage === l).length;
    const kontoBand = `<section class="lp-band" data-mork-yta aria-labelledby="ao-h-k"><header class="lp-band-huvud"><div><p class="lp-ogon">01 · Konton</p><h2 id="ao-h-k">Hur kontona <em>mår</em></h2><p class="lp-ingress">Aktivitet, förfallna uppgifter, affärer eller projekt som står still, trasiga kopplingar i deras poster och profilen – sämst först.</p></div>
        <div class="ao-sammanfatt">${[['bra', 'mår bra'], ['se', 'bör ses över'], ['hjalp', 'behöver hjälp']].map(([l, t]) => `<span data-lage="${l}"><b>${antalLage(l)}</b>${t}</span>`).join('')}</div></header>
      <div class="ao-konton">${kort}</div></section>`;
    // 02 säkerheten och 03 datan
    const sakBand = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="ao-h-s"><header class="lp-band-huvud"><div><p class="lp-ogon">02 · Säkerhet</p><h2 id="ao-h-s">Skyddet <em>just nu</em></h2></div><span class="ao-chip" data-ton="${tonFor(sakP)}">${sakP == null ? 'Ej skannat' : `${sakP} / 100`}</span></header>
      <div class="ao-allvar">${[['hog', 'Hög'], ['medel', 'Medel'], ['lag', 'Låg']].map(([a, t]) => `<span data-allvar="${a}"><b>${fyndN(a)}</b>${t}</span>`).join('')}</div>
      <ul class="ao-lista">${KONTROLLER.map((k) => { const r = S.senast[k.id]; const lage = lageFor(r); const v = r ? r.fynd.filter((x) => x.allvar !== 'info').length : 0;
        return `<li data-lage="${lage}"><span class="ao-l-ikon">${ik(k.ikon)}</span><span class="ao-l-namn">${e(k.namn)}</span><em>${!r ? 'Inte körd' : v ? plural(v, 'fynd', 'fynd') : 'Inga fynd'}</em><i class="ao-p-lampa" aria-hidden="true"></i></li>`; }).join('')}</ul>
      <div class="ao-fot"><button type="button" class="knapp knapp-accent knapp-liten" data-g="sh-skanna-ga">${ik('radar')}Skanna allt</button><a class="knapp knapp-glas knapp-liten" href="#/sakerhet">${ik('skold')}Säkerhetshubben</a></div></section>`;
    const lacka = S.senast.lacka; const lackaN = lacka ? lacka.fynd.filter((x) => x.allvar === 'hog' || x.allvar === 'medel').length : null;
    const integ = [
      { ikon: 'lank', namn: 'Kopplingar mellan posterna', ok: !dl.brott, text: dl.brott ? plural(dl.brott, 'trasig', 'trasiga') : 'Alla hänger ihop' },
      { ikon: 'databas', namn: 'Dubbletter', ok: !dl.dubb, text: dl.dubb ? plural(dl.dubb, 'dubblett', 'dubbletter') : 'Inga' },
      { ikon: 'kalkyl', namn: 'Ogiltiga värden', ok: !dl.ogiltiga, text: dl.ogiltiga ? plural(dl.ogiltiga, 'ogiltigt', 'ogiltiga') : 'Inga' },
      { ikon: 'fingeravtryck', namn: 'Persondata på fel ställe', ok: lackaN === 0, text: lackaN == null ? 'Inte kontrollerat' : lackaN ? plural(lackaN, 'fynd', 'fynd') : 'Inga fynd', ny: lackaN == null },
    ];
    const samlingar = [...SAMLINGAR, 'kundlankar', 'offerter']; const max = Math.max(1, ...samlingar.map(antal));
    const dataBand = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="ao-h-d"><header class="lp-band-huvud"><div><p class="lp-ogon">03 · Data</p><h2 id="ao-h-d">Datan <em>och kopplingarna</em></h2></div><span class="ao-chip" data-ton="${tonFor(dl.poang)}">Kvalitet ${dl.poang} %</span></header>
      <ul class="ao-lista">${integ.map((x) => `<li data-lage="${x.ny ? 'ny' : x.ok ? 'ok' : 'medel'}"><span class="ao-l-ikon">${ik(x.ikon)}</span><span class="ao-l-namn">${e(x.namn)}</span><em>${e(x.text)}</em><i class="ao-p-lampa" aria-hidden="true"></i></li>`).join('')}</ul>
      <ul class="ao-samlingar">${samlingar.map((s) => `<li><span>${e(SAMLNAMN[s])}</span><strong>${antal(s).toLocaleString('sv-SE')}</strong><i style="--andel:${(antal(s) / max).toFixed(3)}" aria-hidden="true"></i></li>`).join('')}</ul>
      <div class="ao-fot"><button type="button" class="knapp knapp-glas knapp-liten" data-g="sh-skanna-ga" data-ids="buggar,lacka">${ik('nyckelverktyg')}Kontrollera datan</button><button type="button" class="knapp knapp-glas knapp-liten" data-g="adm-export">${ik('ladda-ner')}Exportera</button></div></section>`;
    // 04 aktiviteten och händelserna
    const folk = aktiva; const varden = folk.map((u) => perDag(u, dagar)); const maxV = Math.max(1, ...varden.flat());
    const karta = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="ao-h-a"><header class="lp-band-huvud"><div><p class="lp-ogon">04 · Aktivitet</p><h2 id="ao-h-a">Vem gör <em>vad och när</em></h2></div><span class="lp-band-tal">14 dagar</span></header>
      <p class="lp-forklaring">Händelser i tidslinjerna per konto och dag – möten, samtal, mejl, anteckningar och ändringar. Mörkare ruta = fler händelser.</p>
      <div class="lp-karta ao-karta" data-summa style="--dagar:${dagar.length}" role="table" aria-label="Aktivitet per dag"><span></span>${dagar.map((d, i) => `<span class="lp-karta-dag${((new Date(`${d}T12:00:00`).getDay() + 6) % 7) >= 5 ? ' lp-karta-helg' : ''}${i === dagar.length - 1 ? ' lp-karta-nu' : ''}"><small>${['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'][((new Date(`${d}T12:00:00`).getDay() + 6) % 7)]}</small><b>${+d.slice(8)}</b></span>`).join('')}<span class="lp-karta-sumrubrik">Summa</span>
        ${folk.map((u, r) => `<a class="lp-karta-vem" href="#/profil/${e(u.id)}">${av(u, 's')}<span>${e(u.kort)}</span></a>${varden[r].map((v, c) => { const d = dagar[c]; return `<i class="${((new Date(`${d}T12:00:00`).getDay() + 6) % 7) >= 5 ? 'lp-karta-helg' : ''}${c === dagar.length - 1 ? ' lp-karta-nu' : ''}" style="--v:${(v / maxV).toFixed(3)}" title="${e(u.kort)} · ${e(datumText(d))}: ${plural(v, 'händelse', 'händelser')}">${v || ''}</i>`; }).join('')}<strong class="lp-karta-sum">${sum(varden[r])}</strong>`).join('')}</div>
      <div class="lp-karta-skala" aria-hidden="true"><span>Färre</span>${[0.1, 0.35, 0.6, 0.85, 1].map((v) => `<i style="--v:${v}"></i>`).join('')}<span>Fler</span></div>
      ${(() => { const tot = folk.map((u, r) => ({ u, n: sum(varden[r]), dagar: varden[r].filter((v) => v > 0).length })); const mest = [...tot].sort((a, b) => b.n - a.n)[0];
        const tyst = tot.filter((x) => !x.n);
        return `<div class="ao-statrad"><div><small>Händelser 14 d</small><strong>${sum(tot.map((x) => x.n))}</strong><em>i tidslinjerna</em></div><div><small>Mest aktiv</small><strong>${mest && mest.n ? e(mest.u.kort) : '–'}</strong><em>${mest && mest.n ? plural(mest.n, 'händelse', 'händelser') : 'ingen aktivitet'}</em></div><div><small>Tysta konton</small><strong>${tyst.length}</strong><em>${tyst.length ? e(tyst.map((x) => x.u.kort).join(', ')) : 'alla har varit aktiva'}</em></div></div>`; })()}</section>`;
    const flode = [...d.aktiviteter.map((x) => ({ tid: x.tid, av: x.av, text: x.text, typ: 'crm' })), ...S.logg.map((x) => ({ tid: x.tid, av: x.av, text: x.text, typ: 'sakerhet' }))].filter((x) => x.tid).sort((a, b) => (a.tid < b.tid ? 1 : -1)).slice(0, 7);
    const flodeBand = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="ao-h-h"><header class="lp-band-huvud"><div><p class="lp-ogon">05 · Händelser</p><h2 id="ao-h-h">Senast <em>i CRM:et</em></h2></div><a class="knapp knapp-glas knapp-liten" href="#/admin">Hela loggen</a></header>
      ${flode.length ? `<ul class="lp-flode ao-flode">${flode.map((x) => `<li data-typ="${x.typ}">${av(anv(x.av))}<span>${e(String(x.text).slice(0, 96))}${String(x.text).length > 96 ? '…' : ''}<small>${e(anv(x.av).namn)} · ${e(relTid(x.tid))}${x.typ === 'sakerhet' ? ' · säkerhetsloggen' : ''}</small></span></li>`).join('')}</ul>` : '<p class="lp-tom">Inga händelser ännu.</p>'}</section>`;
    // 06 driften och 07 förslagen
    const version = (($('script[src*="crm.js"]') || { getAttribute: () => '' }).getAttribute('src') || '').split('?v=')[1] || '–';
    const driftBand = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="ao-h-dr"><header class="lp-band-huvud"><div><p class="lp-ogon">06 · Drift</p><h2 id="ao-h-dr">System <em>och fel</em></h2></div><span class="ao-chip" data-ton="${tonFor(dr.poang)}">${dr.poang} / 100</span></header>
      <ul class="ao-lista">${[
        { ikon: 'bugg', namn: 'Fel sedan sidan laddades', ok: !dr.fel.length, text: dr.fel.length ? plural(dr.fel.length, 'fel', 'fel') : 'Inga' },
        { ikon: 'databas', namn: 'Lagringen', ok: dr.skriv && !dr.full, text: !dr.skriv ? 'Går inte att skriva' : `${kb(dr.bytes)}${SKARP ? ' (servern: SQLite)' : ' av ca 5 MB'}` },
        { ikon: 'server', namn: 'Läge och version', ok: true, text: `${SKARP ? 'Skarpt' : 'Demo'} · crm v${version} · data ${d.version || '–'}` },
        { ikon: 'lank', namn: 'Nätverket', ok: dr.online, text: dr.online ? 'Uppkopplad' : 'Ingen uppkoppling' },
      ].map((x) => `<li data-lage="${x.ok ? 'ok' : 'medel'}"><span class="ao-l-ikon">${ik(x.ikon)}</span><span class="ao-l-namn">${e(x.namn)}</span><em>${e(x.text)}</em><i class="ao-p-lampa" aria-hidden="true"></i></li>`).join('')}</ul>
      ${dr.fel.length ? `<ul class="ao-fel">${dr.fel.slice(-3).reverse().map((x) => `<li><code>${e(x.text)}</code><small>${e(x.kalla || x.typ)} · ${e(relTid(x.tid))}</small></li>`).join('')}</ul>` : '<p class="ao-lugnt">' + ik('bock') + 'Inga fel i skript eller filer sedan sidan laddades.</p>'}
      <div class="ao-fot">${dr.fel.length ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="sh-rensa-fel">${ik('aterstall')}Rensa felloggen</button>` : ''}<button type="button" class="knapp knapp-glas knapp-liten" data-g="sh-skanna-ga" data-ids="trasigt,uppdatering">${ik('uppgradera')}Sök uppdateringar</button></div></section>`;
    const forslag = adminForslag();
    const forslagBand = `<section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="ao-h-f"><header class="lp-band-huvud"><div><p class="lp-ogon">07 · Förslag</p><h2 id="ao-h-f">Bör <em>åtgärdas</em></h2></div>${forslag.length ? `<span class="lp-band-tal">${forslag.length}</span>` : ''}</header>
      ${forslag.length ? `<ul class="lp-upp">${forslagRader(forslag.slice(0, 5))}</ul>` : `<div class="lp-lugnt">${ik('skold')}<div><strong>Inget att åtgärda</strong><small>Profiler, mål, ansvariga och säkerheten ser bra ut.</small></div></div>`}
      <div class="ao-snabb" role="group" aria-label="Snabbåtgärder">${[['lp-ny-anstalld', 'anvandare-plus', 'Lägg till konto'], ['sh-skanna-ga', 'radar', 'Skanna nu'], ['adm-export', 'ladda-ner', 'Exportera data'], ['lp-mal', 'mal', 'Säljmål']].map(([g, i, t]) => `<button type="button" class="ao-snabbknapp" data-g="${g}">${ik(i)}<span>${t}</span></button>`).join('')}</div></section>`;
    return `${hjalte}${kontoBand}<div class="lp-tvakol">${sakBand}${dataBand}</div><div class="lp-tvakol">${karta}${flodeBand}</div><div class="lp-tvakol">${driftBand}${forslagBand}</div>`;
  }
  // 3D-kärnan (och radarn) lutar efter musen – bara med mus, bara transform
  let tiltRaf = 0;
  document.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return; const el = ev.target.closest && ev.target.closest('[data-sh-tilt]'); if (!el) return;
    cancelAnimationFrame(tiltRaf); tiltRaf = requestAnimationFrame(() => { const r = el.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`); el.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`); });
  }, { passive: true });
  document.addEventListener('pointerout', (ev) => { const el = ev.target.closest && ev.target.closest('[data-sh-tilt]'); if (el && !el.contains(ev.relatedTarget)) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); } });

  /* 05-export, import, rensning ------------------------------------------------------------------------ */
  function exportera() {
    oppnaArk(`${arkHuvud('Exportera all data', 'En JSON-fil med allt i CRM:et – för säkerhetskopia eller flytt.', 'ladda-ner')}
      <form data-form="adm-export" class="ark-kropp"><label class="kryss"><input type="checkbox" name="utanPnr" checked><span>Utan personnummer (rekommenderas – deltagarnas personnummer tas bort i filen)</span></label>
        <label class="kryss"><input type="checkbox" name="utanHalsa" checked><span>${SKARP ? 'Utan hälsoformulären (svaren följer aldrig med härifrån – bara status)' : 'Utan hälsoformulärens svar (känsliga personuppgifter)'}</span></label>
        <p class="falt-hint">${SKARP ? 'Filen byggs på servern och exporten loggas där – vem, när och om personnumren var med.' : 'Exporten loggas i säkerhetsloggen i den här webbläsaren.'} Spara filen säkert – den innehåller kunduppgifter.</p></form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('ladda-ner')}Exportera</button></div>`);
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches && t.matches('[data-adm-install]')) {
      const n = t.dataset.admInstall; const v = ['pa', '0', ''].includes(t.value) ? '' : t.value; try { if (v) localStorage.setItem(`up-crm-${n}`, v); else localStorage.removeItem(`up-crm-${n}`); } catch (err) { /* ok */ }
      sakLogg('installning', `${mig().namn} ändrade inställningen ${n === '3d' ? '3D-scenerna' : n === 'utlogg' ? 'utloggning vid inaktivitet' : 'påminnelse om skanning'} till ${t.selectedOptions[0] ? t.selectedOptions[0].textContent : t.value}`); spara();
      if (n === '3d') toast('3D-inställningen gäller när sidan laddas om', null, 'info', { atgard: { text: 'Ladda om', fn: () => location.reload() } });
      else if (n === 'utlogg') { startaUtlogg(); toast(v ? `Utloggning efter ${t.selectedOptions[0].textContent.toLowerCase()} utan aktivitet` : 'Ingen automatisk utloggning', null, 'las'); }
      else { raknare(); toast('Inställningen är sparad'); }
      return;
    }
    if (t.matches && t.matches('[data-adm-import]') && t.files && t.files[0]) {
      const fil = t.files[0]; t.value = '';
      fil.text().then((text) => {
        let data; try { data = JSON.parse(text); } catch (err) { toast('Filen är inte giltig JSON', null, 'varning'); return; }
        const d = data && data.format === 'uperformance-crm-export' ? data.data : data;
        const fel = !d || typeof d !== 'object' ? 'tom' : ['kunder', 'affarer', 'anvandare'].find((k) => !Array.isArray(d[k]));
        if (fel) { toast(`Filen ser inte ut som en CRM-export (saknar ${fel})`, null, 'varning'); return; }
        importVantar = d;
        bekrafta({ titel: 'Importera och ersätta all data?', sym: 'uppladdning', text: `Filen har ${plural(d.kunder.length, 'kund', 'kunder')}, ${plural(d.affarer.length, 'affär', 'affärer')} och ${plural(d.anvandare.length, 'konto', 'konton')}. Allt som finns i CRM:et nu ersätts. Exportera först om du vill kunna gå tillbaka.`, knapp: 'Importera', g: 'adm-import-ok', fara: true });
      });
    }
  });
  let importVantar = null;
  document.addEventListener('input', (ev) => { if (ev.target.matches && ev.target.matches('[data-adm-sok]')) { admUi.sok = ev.target.value; clearTimeout(admSokT); admSokT = setTimeout(() => { rendera(); const f = $('[data-adm-sok]'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 180); } });
  let admSokT = 0;
  /* Utloggning vid inaktivitet (inställningen ovan) – demoläget och skarpt läge. Inaktiviteten räknas för hela webbläsaren:
     varje flik skriver sin senaste rörelse till localStorage ('up-crm-rorelse', högst var 10:e sekund) och jämför med den senaste
     av alla flikars. Utloggningen gäller alla flikar (i skarpt läge avslutas sessionen på servern) – därför loggas man aldrig ut
     så länge man arbetar i någon flik. En minut före visas en nedräkning med Fortsätt (rörelse i en annan flik stänger den). */
  const RORELSE = 'up-crm-rorelse'; const VARNA_MS = 60000;
  let utloggT = 0, senastRorelse = Date.now(), senastDelad = 0, varning = null;
  const deladRorelse = () => { try { return Number(localStorage.getItem(RORELSE)) || 0; } catch (err) { return 0; } };
  const delaRorelse = (t) => { senastDelad = t; try { localStorage.setItem(RORELSE, String(t)); } catch (err) { /* privat läge: bara den här fliken räknas */ } };
  const sistaRorelse = () => Math.max(senastRorelse, deladRorelse());
  function stangVarning() { if (!varning) return; clearInterval(varning.t); if (varning.el && varning.el.isConnected) varning.el.click(); varning = null; }
  function visaVarning() {
    if (varning) return;
    const text = () => { const s = Math.max(0, Math.ceil((sistaRorelse() + (+install('utlogg')) * 6e4 - Date.now()) / 1000)); return `Ingen aktivitet på en stund – du loggas ut om ${s} s. Klicka var som helst eller tryck på Fortsätt.`; };
    const el = toast(text(), null, 'las', { rubrik: 'Du loggas snart ut', tid: VARNA_MS + 2000, atgard: { text: 'Fortsätt', fn: () => rorelse() } });
    varning = { el, t: setInterval(() => { const s = el && el.querySelector('.toast-text > span'); if (s) s.textContent = text(); }, 1000) };
    if (el) el.addEventListener('click', () => { if (varning && varning.el === el) { clearInterval(varning.t); varning = null; } });
  }
  function rorelse() {
    senastRorelse = Date.now();
    if (senastRorelse - senastDelad >= 10000) delaRorelse(senastRorelse);
    if (varning) stangVarning();
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => document.addEventListener(t, rorelse, { passive: true, capture: true }));
  // En annan flik rörde sig: stäng nedräkningen här
  addEventListener('storage', (ev) => { if (ev.key === RORELSE && varning && Number(ev.newValue) > Date.now() - VARNA_MS) stangVarning(); });
  async function kollaUtlogg() {
    const min = +install('utlogg'); if (!min) { clearInterval(utloggT); stangVarning(); return; }
    const kvar = sistaRorelse() + min * 6e4 - Date.now();
    if (kvar > VARNA_MS) { stangVarning(); return; }
    if (kvar > 0) { visaVarning(); return; }
    clearInterval(utloggT); stangVarning();
    try { await L.loggaUt(); } catch (err) { /* ok */ }
    location.href = 'logga-in.html?utloggad=1';
  }
  function startaUtlogg() {
    clearInterval(utloggT); stangVarning(); const min = +install('utlogg'); if (!min) return;
    delaRorelse(senastRorelse = Math.max(senastRorelse, Date.now() - 1000));
    utloggT = setInterval(kollaUtlogg, 5000);
  }
  startaUtlogg();

  /* 06-handlare och formulär ------------------------------------------------------------------------- */
  const G = {
    'sh-skanna': (el) => { const ids = (el.dataset.ids || '').split(',').filter(Boolean); skanna(ids.length ? ids : null); },
    'sh-skanna-ga': (el) => { const ids = (el.dataset.ids || '').split(',').filter(Boolean); location.hash = '#/sakerhet'; setTimeout(() => skanna(ids.length ? ids : null), 450); },
    'sh-visa': (el) => { shUi.oppen = shUi.oppen === el.dataset.id ? null : el.dataset.id; rendera(); },
    'sh-uppdatera': () => { toast('Laddar den senaste versionen …', null, 'uppgradera'); setTimeout(() => location.reload(), 400); },
    'sh-rensa-fel': () => { if (window.UPFelLogg) window.UPFelLogg.rensa(); const S = sak(); if (S.senast.buggar) S.senast.buggar.fynd = S.senast.buggar.fynd.filter((x) => !(x.atgard && x.atgard.g === 'sh-rensa-fel')); spara(); raknare(); rendera(); toast('Felloggen är rensad'); },
    'sh-rensa-pnr': () => bekrafta({ titel: 'Rensa personnummer i gamla kundlänkar?', sym: 'fingeravtryck', text: 'Personnumren tas bort från deltagarna i kundlänkar som spärrats eller gått ut för mer än 30 dagar sedan. Namn och paket står kvar. Det går inte att ångra.', knapp: 'Rensa', g: 'sh-rensa-pnr-ok', fara: true }),
    'sh-rensa-pnr-ok': () => {
      let n = 0;
      for (const l of Object.values(db().kundlankar || {})) if (l.sparrad || (l.utgar && l.utgar < K.omDagar(-30))) for (const x of l.deltagare || []) if (x.pnr) { delete x.pnr; n++; l.andrad = new Date().toISOString(); }
      sakLogg('rensning', `${mig().namn} rensade ${n} personnummer från gamla kundlänkar`);
      const S = sak(); if (S.senast.lacka) S.senast.lacka.fynd = S.senast.lacka.fynd.filter((x) => !(x.atgard && x.atgard.g === 'sh-rensa-pnr'));
      spara(); K.stangArk(); raknare(); rendera(); toast(`${plural(n, 'personnummer', 'personnummer')} borttagna`, null, 'fingeravtryck');
    },
    'sh-neutralisera': (el) => {
      const { samling, id, falt } = el.dataset; const d = db();
      const post = Array.isArray(d[samling]) ? d[samling].find((x) => x.id === id) : (d[samling] || {})[id]; if (!post) return;
      const delar = String(falt).split(/\.|\[(\d+)\]/).filter((x) => x !== undefined && x !== ''); let o = post; for (let i = 0; i < delar.length - 1; i++) o = o && o[delar[i]];
      const sista = delar[delar.length - 1]; if (!o || typeof o[sista] !== 'string') return;
      o[sista] = o[sista].replace(/<[^>]*>/g, '').replace(/javascript\s*:/gi, '').replace(/\bon\w+\s*=/gi, '');
      sakLogg('rensning', `${mig().namn} neutraliserade farlig text i ${SAMLNAMN[samling] || samling} (${falt})`);
      const S = sak(); if (S.senast.kod) S.senast.kod.fynd = S.senast.kod.fynd.filter((x) => !(x.atgard && x.atgard.data && x.atgard.data.id === id && x.atgard.data.falt === falt));
      spara(); raknare(); rendera(); toast('Texten är neutraliserad (taggar och skriptlänkar borttagna)', null, 'skold');
    },
    'adm-filter': (el) => { admUi.filter = el.dataset.filter; rendera(); },
    'adm-logg': (el) => { admUi.logg = el.dataset.filter; rendera(); },
    'adm-export': () => exportera(),
    'adm-import-ok': () => {
      const d = importVantar; importVantar = null; if (!d) return;
      const nu = db(); for (const k of Object.keys(nu)) if (k !== 'version') delete nu[k]; Object.assign(nu, d); nu.version = nu.version || 6;
      sakLogg('import', `${mig().namn} importerade data från fil (${nu.kunder.length} kunder)`);
      if (!nu.anvandare.some((u) => u.id === jag())) toast('Ditt konto finns inte i den importerade datan – byt användare.', null, 'varning');
      spara(); K.stangArk(); K.fyllAnvandarval(); rendera(true); toast('Datan är importerad', null, 'uppladdning');
    },
    'adm-aktiv': (el) => {
      const u = db().anvandare.find((x) => x.id === el.dataset.id); if (!u || u.id === jag()) return;
      const blirInaktiv = arAktiv(u);
      if (blirInaktiv && (u.roll === 'admin' || u.admin) && db().anvandare.filter((x) => arAktiv(x) && (x.roll === 'admin' || x.admin)).length <= 1) { toast('Det måste finnas minst en aktiv administratör.', null, 'varning'); return; }
      u.aktiv = !blirInaktiv;
      sakLogg('konto', `${mig().namn} ${blirInaktiv ? 'inaktiverade' : 'aktiverade'} kontot för ${u.namn}`);
      spara(); K.fyllAnvandarval(); rendera(); toast(`${u.namn} är ${blirInaktiv ? 'inaktiverad – kan inte logga in' : 'aktiverad igen'}`, null, blirInaktiv ? 'las' : 'bock');
    },
  };
  const FORM = {
    'adm-export': async (f, d) => {
      if (SKARP) {
        // Skarpt läge: servern bygger filen ur databasen och loggar exporten (GET /api/admin/export)
        const knapp = $('[data-g="skicka-ark"]'); if (knapp) knapp.disabled = true;
        const svar = await L.admin.exportera({ utanPnr: d.get('utanPnr') === 'on', utanHalsa: d.get('utanHalsa') === 'on' });
        if (knapp && knapp.isConnected) knapp.disabled = false;
        if (!svar.ok) { toast(`Exporten misslyckades: ${svar.meddelande || 'okänt fel'}`, null, 'varning'); return; }
        laddaNerBlob(svar.namn, svar.blob); serverSak.tid = 0;
        K.stangArk(); toast('Exporten är nedladdad och loggad på servern', null, 'ladda-ner');
        return;
      }
      const kopia = JSON.parse(JSON.stringify(db()));
      if (d.get('utanPnr') === 'on') for (const l of Object.values(kopia.kundlankar || {})) for (const x of l.deltagare || []) delete x.pnr;
      if (d.get('utanHalsa') === 'on') kopia.halsoformular = {};
      for (const u of kopia.anvandare || []) delete u.bild;
      laddaNer(`Uperformance-CRM-${idag()}.json`, JSON.stringify({ format: 'uperformance-crm-export', skapad: new Date().toISOString(), av: mig().namn, utanPnr: d.get('utanPnr') === 'on', utanHalsa: d.get('utanHalsa') === 'on', data: kopia }, null, 1), 'application/json');
      sakLogg('export', `${mig().namn} exporterade all data${d.get('utanPnr') === 'on' ? ' (utan personnummer)' : ' (med personnummer)'}`);
      spara(); K.stangArk(); toast('Exporten är nedladdad', null, 'ladda-ner');
    },
  };
  const vagar = [
    [/^#\/admin$/, visaAdmin, 'admin', 'Adminpanelen'],
    [/^#\/sakerhet$/, visaSakerhet, 'sakerhet', 'Säkerhetshubben'],
  ];
  document.addEventListener('up-filskanning', (ev) => {
    const lista = (ev.detail && ev.detail.resultat) || []; if (!lista.length || !mig() || !mig().id) return;
    // Skarpt läge: stopp och varningar till serverns säkerhetslogg – för alla inloggade, även filer som aldrig laddas upp
    const rapport = lista.filter((r) => r.status !== 'ren').map((r) => ({ namn: r.namn, status: r.status, fynd: (r.fynd || []).map((x) => ({ allvar: x.allvar, text: x.text })) }));
    if (SKARP && L.filer && L.filer.skanning && rapport.length) L.filer.skanning((ev.detail && ev.detail.kalla) || 'uppladdning', rapport).then(() => { serverSak.tid = 0; });
    const S = sak(); S.filer = S.filer || { skannade: 0, stoppade: 0, varningar: 0 };
    for (const r of lista) {
      S.filer.skannade++;
      if (r.status === 'blockerad') { S.filer.stoppade++; sakLogg('fil', `Filskannern stoppade ${r.namn} (${mig().namn}, ${ev.detail.kalla}): ${r.fynd.filter((x) => x.allvar === 'blockera').map((x) => x.text).join('; ')}`); }
      else if (r.status === 'varning') { S.filer.varningar++; sakLogg('fil', `Filskannern släppte igenom ${r.namn} med varning (${mig().namn}): ${r.fynd.map((x) => x.text).join('; ')}`); }
    }
    spara();
  });
  setTimeout(raknare, 0);
  addEventListener('hashchange', () => setTimeout(raknare, 0));
  return { vagar, G, FORM, raknare, skanna, sakLogg, oversikt: visaAdminOversikt };
};
