/* Uperformance CRM. Vanilla JS, hash-routing. All data går genom window.UPLager (lager.js):
   i demoläget ligger allt i den här webbläsaren som i prototypen ("Återställ exempeldata" börjar om),
   i skarpt läge (node server/server.js) på servern och delas mellan alla inloggade. */
(async () => {
  'use strict';

  /* 01-grund ------------------------------------------------------------------ */
  const L = window.UPLager;
  const SKARP = L.skarp;
  const HALSA = L.lage.halsoformular; // hälsoformuläret – alltid på i demoläget, flagga i skarpt läge
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const vy = $('#vy');
  const ark = $('[data-ark]');
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Ledningen (ledning.js) och adminpanelen/säkerhetshubben (sakerhet.js) kopplas in sist (16b) – null tills dess
  let LED = null, ADM = null, CHT = null;

  // Skarpt läge: datan hämtas från servern – stilla skelettkort under tiden (i demoläget finns den direkt)
  const SKELETT = '<div class="skelett" aria-hidden="true"><span></span><span></span><span></span></div>';
  if (SKARP) { vy.innerHTML = `<p class="hamtar" role="status">Hämtar CRM-datan …</p>${SKELETT}`; document.title = 'Uperformance CRM'; }
  let db = await L.ladda({ vidFel: () => { vy.innerHTML = `<p class="hamtar" role="status">Kunde inte nå servern – försöker igen …</p>${SKELETT}`; } });
  db.kundlankar = db.kundlankar || {};
  db.offerter = db.offerter || {};
  db.halsoformular = db.halsoformular || {};
  let jag = SKARP ? (L.jag() || {}).id : (() => { try { return localStorage.getItem('up-crm-jag') || 'gs'; } catch (err) { return 'gs'; } })();
  if (!db.anvandare.some((u) => u.id === jag)) jag = db.anvandare[0].id;
  const filer = new Map(); // dokument-id → objekt-URL, bara under sessionen

  // Demoläget: lagret slår ihop kundens ändringar från andra flikar och skriver till webbläsaren (som förut).
  // Skarpt läge: lagret skickar det som ändrats till servern strax efteråt. Löftet löses med lagrets Svar
  // (i demoläget direkt) – den som behöver veta att servern har sparat kan vänta på det.
  const spara = () => {
    const sparat = L.spara(db);
    uppdateraRaknare();
    if (SKARP) sparStatus('sparar', sparat);
    return sparat;
  };
  // Användare: admin och aktiv finns bara i skarpt läge (saknas aktiv = aktiv)
  const arAktiv = (u) => !!u && u.aktiv !== false && u.aktiv !== 0;
  const arAdmin = () => SKARP && !!anv(jag).admin && arAktiv(anv(jag));
  const kanAterstalla = () => !SKARP || (arAdmin() && L.lage.aterstallning);
  const aktiva = (vald) => db.anvandare.filter((u) => arAktiv(u) || u.id === vald);
  // Rollerna i klartext: Sälj / Testteam / Admin, + Försäljningschef (chef) och admin-flaggan i skarpt läge
  const rollText = (u) => [u.roll === 'test' ? 'Testteam' : u.roll === 'admin' ? 'Admin' : 'Sälj', u.chef ? 'Försäljningschef' : '', u.admin && u.roll !== 'admin' ? 'admin' : ''].filter(Boolean).join(' · ');

  /* 02-hjälpare --------------------------------------------------------------- */
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Värden i CSS-väljare ($(`[data-x="${sel(v)}"]`)) – e() hör bara hemma i HTML
  const sel = (v) => (window.CSS && CSS.escape ? CSS.escape(String(v ?? '')) : String(v ?? '').replace(/["\\]/g, (c) => '\\' + c));
  // Hårt mellanslag före enheten – "kr" och "%" hamnar aldrig ensamma på en ny rad
  const kr = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('sv-SE') + ' kr');
  // Avrundat värde ≥ 1 000 tkr skrivs som Mkr (999 600 kr blev annars "1 000 tkr") – samma gränser i scen-salj.js och scen-oversikt.js
  const krKort = (n) => (n >= 999500 ? (n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 }) + ' Mkr' : n >= 1e4 ? Math.round(n / 1000).toLocaleString('sv-SE') + ' tkr' : kr(n));
  const pct = (n) => (isFinite(n) ? Math.round(n * 100) + ' %' : '–');
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
  const nyId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ik = (namn, extra = '') => `<svg class="ikon" data-i="${namn}" ${extra} aria-hidden="true"><use href="#i-${namn}"/></svg>`;
  // Böjning efter antal: plural(1, 'affär', 'affärer') → "1 affär"
  const plural = (n, en, flera) => `${n} ${n === 1 ? en : flera}`;

  /* Symbolerna – linjeikoner ur spriten (index.html), inga emoji längre (användarens önskemål 2026-10-22: "allt på CRM:et ska synka").
     Bara som markör för en sak, ett steg eller en typ. En enda källa: samma begrepp har samma ikon överallt. Alltid aria-hidden –
     texten bredvid säger samma sak. emo() ritar ikonen (i en ruta med ruta: 's'/'m'/'l'…) och ger den liv i premium.css
     ("Levande ikoner"): linjerna ritas fram när vyn visas, en egen rörelse vid hovring och de stora rutorna rör sig ibland. */
  const UPEMO = Object.freeze({
    salj: { kontakt: 'prat', besok: 'plats', offert: 'dokument', underlag: 'underlag', signerad: 'medalj' },
    proj: { underlag: 'underlag', bokning: 'kalender', test: 'stetoskop', avstamning: 'vag', slutfaktura: 'faktura', uppfoljning: 'kompass', klar: 'flagga' },
    akt: { anteckning: 'anteckning', mote: 'mote', samtal: 'samtal', mejl: 'mejl', dokument: 'gem', system: 'blixt' },
    kundtyp: { alla: 'rutnat', foretag: 'kunder', klubb: 'klubb', lead: 'grodd' },
    grupp: { forfallna: 'larm', idag: 'sol', kommande: 'kalender', utan: 'nal', klara: 'klar' },
    dygn: { morgon: 'soluppgang', dag: 'sol', kvall: 'mane', natt: 'mane' },
    roll: { salj: 'trend', test: 'stetoskop', kontroll: 'skold', admin: 'nyckel' },
    sak: { offert: 'dokument', order: 'order', signering: 'signera', lank: 'lank', underlag: 'underlag', klubb: 'klubb', provision: 'mynt', vantar: 'timglas', konvertering: 'mal', snitt: 'pengar', partner: 'kunder', pipeline: 'portfolj', vunnet: 'medalj', projekt: 'projekt', mote: 'presentation', kalkyl: 'kalkyl', todo: 'todo', tomt: 'gnista', tips: 'glodlampa', varning: 'varning', ekonomi: 'pengar', omtest: 'omtest', uppfoljning: 'kompass', team: 'mote', kontakt: 'anstallda', dokument: 'gem' },
    larm: { forfallen: 'larm', retur: 'retur', inne: 'inkorg', fyller: 'redigera', omtest: 'omtest', uppfoljning: 'kompass', granska: 'underlag', slutfaktura: 'faktura', provision: 'mynt', still: 'klocka', samtal: 'samtal', viktat: 'mal' },
  });
  const arIkon = (x) => /^[a-z-]+$/.test(String(x || ''));
  // Ikonnamn → linjeikon (i en ruta när ruta anges); allt annat ritas som text (reserv för gammal data)
  const emo = (t, { ruta = '', ton = '', titel = '' } = {}) => (!t ? '' : `<span class="emo${ruta ? ` emo-ruta emo-${ruta}` : ''}"${ton ? ` data-ton="${e(ton)}"` : ''}${titel ? ` title="${e(titel)}"` : ''} aria-hidden="true">${arIkon(t) ? ik(t) : e(t)}</span>`);
  // Fältet tar ett ikonnamn (SVG i spriten) – med ruta blir det samma ruta som emo(), annars en ren ikon (knappar, toast)
  const symbol = (x, opt) => (arIkon(x) && !(opt && opt.ruta) ? ik(x) : emo(x, opt));
  // En ikon i ruta med ton – samma som emo(namn, { ruta, ton }) (offerten och Till kunden)
  const ikRuta = (namn, { ruta = 'm', ton = '' } = {}) => emo(namn, { ruta, ton });
  // Att göra: typen läses ur texten ("Ring …" ger telefon). Ordningen avgör.
  const TODO_TYP = [
    [/^ring\b|^ringa\b/i, 'samtal', 'Samtal'], [/offert/i, 'dokument', 'Offert'], [/order|signer/i, 'signera', 'Order'], [/underlag|kundlänk|deltagar/i, 'underlag', 'Underlag'],
    [/faktur/i, 'faktura', 'Faktura'], [/omtest/i, 'omtest', 'Omtest'], [/boka|testdag|testdatum/i, 'kalender', 'Bokning'],
    [/besök/i, 'plats', 'Besök'], [/möte|träff/i, 'mote', 'Möte'], [/coaching|uppföljning|följ upp/i, 'kompass', 'Uppföljning'],
    [/provision|klubb/i, 'klubb', 'Klubb'], [/^ring|samtal|telefon/i, 'samtal', 'Samtal'], [/mejl|mail|skicka/i, 'mejl', 'Mejl'],
  ];
  const todoTyp = (t) => TODO_TYP.find(([re]) => re.test(t || '')) || [null, 'klar', 'Att göra'];

  const lokalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const idag = () => lokalISO(new Date());
  const omDagar = (n, fran) => { const d = fran ? tolka(fran) : new Date(); d.setDate(d.getDate() + n); return lokalISO(d); };
  const tolka = (iso) => { if (!iso) return null; if (iso.length === 10) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); } return new Date(iso); };
  const midnatt = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dagarTill = (iso) => Math.round((midnatt(tolka(iso)) - midnatt(new Date())) / 864e5);
  // gemen: true i löptext ("Kund sedan idag"); chips med datumet först behåller versal ("Idag")
  const datumText = (iso, { ar = 'auto', gemen = false } = {}) => {
    if (!iso) return '';
    const n = dagarTill(iso);
    if (n === 0) return gemen ? 'idag' : 'Idag';
    if (n === 1) return gemen ? 'imorgon' : 'Imorgon';
    if (n === -1) return gemen ? 'igår' : 'Igår';
    const d = tolka(iso);
    const visaAr = ar === true || (ar === 'auto' && d.getFullYear() !== new Date().getFullYear());
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', ...(visaAr ? { year: 'numeric' } : {}) }).replace('.', '');
  };
  const relTid = (t) => {
    if (!t) return '';
    const d = new Date(t);
    const min = (Date.now() - d) / 6e4;
    if (min < 1) return 'nyss';
    if (min < 60) return `för ${Math.round(min)} min sedan`;
    const dagar = -dagarTill(lokalISO(d));
    if (dagar === 0) return 'idag ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    if (dagar === 1) return 'igår';
    if (dagar < 7) return `för ${dagar} dagar sedan`;
    return datumText(lokalISO(d));
  };
  // Kort form för trånga rader ("4 d", "2 tim")
  const relKort = (t) => {
    if (!t) return '';
    const min = (Date.now() - new Date(t)) / 6e4;
    if (min < 1) return 'nyss';
    if (min < 60) return `${Math.round(min)} min`;
    const dagar = -dagarTill(lokalISO(new Date(t)));
    if (dagar === 0) return `${Math.round(min / 60)} tim`;
    if (dagar < 30) return `${dagar} d`;
    return datumText(lokalISO(new Date(t)));
  };
  // Ett datum från ett datumfält: rätt form och inom intervallet (dagar från idag) – webbläsaren släpper annars igenom t.ex. år 202610
  const datumInom = (iso, fran, till) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false; const d = tolka(iso); if (!d || isNaN(d)) return false; const n = dagarTill(iso); return n >= fran && n <= till; };
  // Veckodag + datum i klartext ("fre 24 okt")
  const dagText = (iso) => { const d = tolka(iso); return d ? d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '') : ''; };
  const initialer = (namn) => {
    const ord = String(namn).replace(/\b(AB|HB|KB)\b/g, '').replace(/[&]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return ((ord[0] || '?')[0] + (ord[1] ? ord[1][0] : (ord[0] || '')[1] || '')).toUpperCase();
  };

  /* 03-uppslag och härledda värden -------------------------------------------- */
  const kund = (id) => db.kunder.find((k) => k.id === id);
  const affar = (id) => db.affarer.find((a) => a.id === id);
  const projekt = (id) => db.projekt.find((p) => p.id === id);
  const anv = (id) => (id === 'kund' ? { id, namn: 'Kunden', kort: 'Kunden', initialer: 'K', roll: 'kund' } : db.anvandare.find((u) => u.id === id) || { id, namn: 'Okänd', kort: 'Okänd', initialer: '?', roll: 'salj' });
  const projektForAffar = (affarId) => db.projekt.find((p) => p.affarId === affarId);
  const affarerFor = (kundId) => db.affarer.filter((a) => a.kundId === kundId);
  const primarKontakt = (k) => (k && k.kontakter && k.kontakter[0]) || null;
  const saljStegIndex = (id) => SALJSTEG.findIndex((s) => s.id === id);
  const projStegIndex = (id) => PROJSTEG.findIndex((s) => s.id === id);
  const arOppen = (a) => a.steg !== 'signerad' && a.steg !== 'forlorad';
  // Felregistrerad / dubblett (kryssrutan i Markera som förlorad): ligger kvar på kunden men räknas aldrig som förlorad –
  // inte i vinstgraden, listorna över förlorade eller arenans tavla (scen-oversikt.js och ledning.js räknar likadant)
  const felregistrerad = (a) => a.steg === 'forlorad' && !!(a.forlorad && a.forlorad.felregistrerad);
  const raknasForlorad = (a) => a.steg === 'forlorad' && !felregistrerad(a);
  const klubbar = () => db.kunder.filter((k) => k.typ === 'klubb');

  const prisa = (o) => prisaOffert(o);
  const affarVarde = (a) => prisa(a.offert).total;
  const paketText = (o) => {
    if (o.eget != null) return 'Specialoffert';
    if (o.typ === 'uppfoljning') return `Uppföljning & coaching · ${o.deltagare && o.deltagare.length ? o.deltagare.length : o.antal} pers`;
    if (o.deltagare && o.deltagare.length) {
      const per = {}; o.deltagare.forEach((d) => { per[d.paket] = (per[d.paket] || 0) + 1; });
      return `Kundunderlag · ${o.deltagare.length} pers · ${Object.entries(per).map(([k, n]) => `${(PRISER.paket[k] || {}).namn} ${n}`).join(', ')}`;
    }
    const p = PRISER.paket[o.paket];
    const t = (o.tillval || []).map((x) => PRISER.tillval[x] && PRISER.tillval[x].namn).filter(Boolean);
    return `${p ? p.namn : '–'} · ${o.antal} pers${t.length ? ' · ' + t.join(', ') : ''}`;
  };

  const nyToken = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); const t = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(a, (b) => t[b % t.length]).join(''); };
  const lankFor = (affarId) => Object.entries(db.kundlankar || {}).map(([token, l]) => ({ token, ...l })).filter((l) => l.affarId === affarId && !l.sparrad).sort((a, b) => (a.skapad < b.skapad ? 1 : -1))[0];
  // Spärrade länkar försvinner inte – de visas under "Tidigare" på affären med sin deltagarlista
  const lankHistorik = (affarId) => Object.entries(db.kundlankar || {}).map(([token, l]) => ({ token, ...l })).filter((l) => l.affarId === affarId && l.sparrad).sort((a, b) => (a.skapad < b.skapad ? 1 : -1));
  const lankUtgangen = (l) => !!l && l.status !== 'inskickad' && !!l.utgar && dagarTill(l.utgar) < 0;
  const lankUrl = (token) => new URL(`kund.html#t=${token}`, location.href).href;
  const LANKSTATUS = { skickad: ['Skapad', 'chip-navy'], oppnad: ['Öppnad av kunden', 'chip-is'], paborjad: ['Kunden fyller i', 'chip-gul'], inskickad: ['Inskickat', 'chip-ok'] };
  const kundStatus = (k) => {
    if (k.typ === 'klubb') return 'klubb';
    const af = affarerFor(k.id);
    if (af.some((a) => a.steg === 'signerad')) return 'kund';
    if (af.some(arOppen)) return 'prospekt';
    return 'lead';
  };
  const sistaAktivitet = (kundId) => db.aktiviteter.filter((x) => x.kundId === kundId).sort((a, b) => (a.tid < b.tid ? 1 : -1))[0];

  // Klubbmotorn: 10 % av affärsvärdet till klubben som öppnade dörren
  /* Vilken klubb affären ger provision till: kundens koppling (viaKlubb) – utom när kopplingen har ändrats efter att ordern
     signerades. Då har koppla-klubb frusit klubben och procenten på affären (kickbackKlubb, kickbackProcent; null = ingen klubb),
     så att upplupen, att betala och utbetald provision aldrig flyttar till en annan klubb eller försvinner i efterhand. */
  const klubbFor = (a) => { if (a.kickbackKlubb !== undefined) return a.kickbackKlubb; const k = kund(a.kundId); return (k && k.viaKlubb) || null; };
  const kickback = (a) => {
    if (!kund(a.kundId) || a.steg === 'forlorad') return null;
    const klId = klubbFor(a); if (!klId) return null;
    const kl = kund(klId); if (!kl || !kl.klubbavtal) return null;
    const procent = a.kickbackProcent != null ? a.kickbackProcent : kl.klubbavtal.procent;
    // Hela kronor redan här – raderna och alla summor (översikten, Klubbmotorn, klubbsidan) går då jämnt ihop
    const belopp = Math.round(affarVarde(a) * (procent / 100));
    let status; let vilande = false;
    if (a.steg !== 'signerad') status = 'prognos';
    else if (a.kickbackUtbetald) status = 'utbetald';
    else if (orderMakulerad(a)) { status = 'prognos'; vilande = true; } // ordern gäller inte – provisionen vilar tills en ny är signerad
    else {
      const p = projektForAffar(a.id);
      status = p && projStegIndex(p.steg) >= projStegIndex('uppfoljning') ? 'att-betala' : 'upplupen';
    }
    return { belopp, status, klubb: kl, ...(vilande ? { vilande } : {}) };
  };
  const klubbStat = (kl) => {
    const intro = db.kunder.filter((k) => k.viaKlubb === kl.id);
    // Affärerna som hör till klubben – en frusen affär räknas till klubben den signerades via (klubbFor)
    const af = db.affarer.filter((a) => klubbFor(a) === kl.id);
    const vunnaAffarer = af.filter((a) => a.steg === 'signerad');
    const vunnaKunder = new Set(vunnaAffarer.map((a) => a.kundId));
    const dialogKunder = new Set(af.filter((a) => a.steg !== 'forlorad').map((a) => a.kundId));
    const kb = af.map(kickback).filter(Boolean);
    const summaStatus = (s) => sum(kb.filter((x) => x.status === s).map((x) => x.belopp));
    const varde = sum(vunnaAffarer.map(affarVarde));
    return {
      partners: (kl.klubbavtal && kl.klubbavtal.partners) || 0,
      intro, introducerade: intro.length, dialog: dialogKunder.size, vunna: vunnaKunder.size, vunnaAffarer,
      varde, snitt: vunnaAffarer.length ? varde / vunnaAffarer.length : 0,
      engang: sum(vunnaAffarer.map((a) => prisa(a.offert).engang)), aterkommande: sum(vunnaAffarer.map((a) => prisa(a.offert).aterkommande)),
      utbetalt: summaStatus('utbetald'), attBetala: summaStatus('att-betala'), upplupen: summaStatus('upplupen'), prognos: summaStatus('prognos'),
    };
  };

  const underlagKomplett = (u) => {
    const saknas = UNDERLAG_FALT.filter((f) => f.krav && !String((u && u[f.id]) || '').trim()).map((f) => f.etikett)
      .concat(UNDERLAG_KONTROLL.filter((f) => !(u && u[f.id])).map((f) => f.etikett));
    const totalt = UNDERLAG_FALT.filter((f) => f.krav).length + UNDERLAG_KONTROLL.length;
    return { saknas, klara: totalt - saknas.length, totalt, komplett: saknas.length === 0 };
  };

  // Stänger öppna att göra för en kund vars text matchar – när steget de gällde är klart
  const stangTodos = (kundId, monster) => db.todos.filter((t) => t.kundId === kundId && !t.klar && monster.test(t.text)).forEach((t) => { t.klar = true; t.klarTid = new Date().toISOString(); });
  // Projektets egna öppna uppgifter (projektId – t.ex. "Packa utrustning"): de följer med när testdagen bokas om och föreslås
  // som klara när testet är registrerat
  const projTodos = (p) => db.todos.filter((t) => t.projektId === p.id && !t.klar);
  const logga = (text, { kundId, affarId, typ = 'system' } = {}) => {
    const x = { id: nyId('x'), kundId, affarId, typ, text, av: jag, tid: new Date().toISOString() };
    db.aktiviteter.push(x); return x;
  };

  /* 04-små byggstenar ------------------------------------------------------------ */
  const AKT_TYP = { anteckning: 'Anteckning', mote: 'Möte', samtal: 'Samtal', mejl: 'Mejl', system: 'Händelse', dokument: 'Dokument' };
  const AKT_IKON = { anteckning: 'anteckning', mote: 'mote', samtal: 'samtal', mejl: 'mejl', system: 'system', dokument: 'dokument' };
  // Profilbilden om den finns, annars initialerna – med statusens prick (ledning.js: närvaro)
  const avatar = (id, liten) => { const u = anv(id); const n = LED && u.roll !== 'kund' ? LED.narvaro(u) : null; return `<span class="avatar ${liten ? 'avatar-liten' : ''} ${u.roll === 'test' ? 'avatar-test' : ''}${u.bild ? ' avatar-bild' : ''}"${n ? ` data-narvaro="${e(n.id)}" style="--narv:${e(n.farg)}"` : ''} title="${e(u.namn)}${n ? ` · ${e(n.namn)}` : ''}">${u.bild ? `<img src="${e(u.bild)}" alt="" draggable="false">` : e(u.initialer)}</span>`; };
  const loggaRuta = (k, stor) => `<span class="logga-ruta ${k.typ === 'klubb' ? 'logga-ruta-klubb' : ''} ${stor ? 'logga-ruta-stor' : ''}" aria-hidden="true">${k.typ === 'klubb' && stor ? ik('klubb', 'style="width:26px;height:26px"') : e(initialer(k.namn))}</span>`;
  const statusChip = (k) => ({
    klubb: '<span class="chip chip-klubb">Klubb</span>', kund: '<span class="chip chip-ok chip-prick">Kund</span>',
    prospekt: '<span class="chip chip-is chip-prick">Prospekt</span>', lead: '<span class="chip">Lead</span>',
  }[kundStatus(k)]);
  const klubbChip = (k, lank = true) => {
    if (!k || !k.viaKlubb) return '';
    const kl = kund(k.viaKlubb); if (!kl) return '';
    const inre = `${ik('klubb')}Via ${e(kl.namn)}`;
    return lank ? `<a class="chip chip-klubb" href="#/kund/${e(kl.id)}">${inre}</a>` : `<span class="chip chip-klubb">${inre}</span>`;
  };
  const stegChip = (a) => {
    if (a.steg === 'forlorad') return felregistrerad(a) ? '<span class="chip">Felregistrerad</span>' : '<span class="chip chip-rod">Förlorad</span>';
    if (a.steg === 'signerad') return orderMakulerad(a) ? '<span class="chip chip-gul chip-prick" title="Ordern är makulerad – en ny order behövs">Order makulerad</span>' : '<span class="chip chip-ok chip-prick">Order signerad</span>';
    const s = SALJSTEG.find((x) => x.id === a.steg);
    return `<span class="chip chip-navy">${e(s ? s.namn : a.steg)}</span>`;
  };
  const underlagChip = (p) => ({
    ny: '<span class="chip chip-gul chip-prick">Ej granskat</span>', komplett: '<span class="chip chip-ok chip-prick">Underlag komplett</span>', returnerat: '<span class="chip chip-rod chip-prick">Returnerat till sälj</span>',
  }[p.underlagStatus] || '');
  const kbChip = (s) => ({ prognos: '<span class="chip">Prognos</span>', upplupen: '<span class="chip chip-is">Upplupen</span>', 'att-betala': '<span class="chip chip-orange chip-prick">Att betala</span>', utbetald: '<span class="chip chip-ok">Utbetald</span>' }[s]);
  const AGARE_KORT = { salj: 'Sälj', test: 'Test', kontroll: 'Kontroll' };
  // medKort: även en kort form som visas när det är trångt (stegaren på mobilen)
  const agarband = (agare, medKort = false) => `<span class="agarband agarband-${agare}" title="${e(AGARE[agare])}">${medKort ? `<span class="agarband-lang">${e(AGARE[agare])}</span><span class="agarband-kort">${e(AGARE_KORT[agare] || AGARE[agare])}</span>` : e(AGARE[agare])}</span>`;
  const datumChip = (iso) => { if (!iso) return ''; const n = dagarTill(iso); const cls = n < 0 ? 'chip-rod' : n === 0 ? 'chip-gul' : ''; return `<span class="chip ${cls}">${ik('kalender')}${e(datumText(iso))}</span>`; };
  // Testdagens klockslag (p.testtid, valfritt – utan tid är testdagen en heldag): "08:00–16:00", "från 08:00" eller tomt
  const testtidText = (p) => { const t = (p && p.testtid) || {}; return t.start ? (t.slut ? `${t.start}–${t.slut}` : `från ${t.start}`) : ''; };
  // Datumet och klockslaget som två chips (de bryts var för sig i smala kort på projekttavlan)
  const testdagChip = (p) => { if (!p.testdatum) return ''; const tt = testtidText(p); return `${datumChip(p.testdatum)}${tt ? `<span class="chip">${ik('klocka')}${e(tt)}</span>` : ''}`; };
  // Hur länge något legat i sitt steg: färsk (mint), lugn (is), står still från 14 dagar (röd – samma gräns som filtret och larmet)
  const chipAlder = (d) => (d >= 14
    ? `<span class="chip chip-alder chip-rod" title="${d} dagar i steget" data-rorelse><i class="still-prick" aria-hidden="true"></i>${d} d · står still</span>`
    : `<span class="chip chip-alder ${d <= 3 ? 'chip-ok' : 'chip-is'}" title="${d < 1 ? 'Flyttad hit idag' : `${d} dagar i steget`}">${emo(UPEMO.sak.vantar)}${d < 1 ? 'Idag' : `${d} d`}</span>`);
  // Tomläge: en mening om vad som saknas – med emoji-bricka och en knapp till nästa steg när det finns ett
  const tom = (text, { emo: em = '', knapp = '', ton = 'mint' } = {}) => (em || knapp
    ? `<div class="tomt tomt-rik">${em ? emo(em, { ruta: 'xl', ton }) : ''}<p>${e(text)}</p>${knapp ? `<div class="tomt-knappar">${knapp}</div>` : ''}</div>`
    : `<p class="tomt">${e(text)}</p>`);
  const UTBETALNING = { kontant: 'Kontant', sponsorvarde: 'Värde i sponsorpaket', oklart: 'Inte bestämd ännu' };

  /* Egna aktiviteter (anteckning, möte, samtal, mejl – inte händelser, dokument eller kundens egna) ändras av den som skrev dem
     eller en administratör (samma regel som servern). Ta bort: i skarpt läge bara administratörer (servern raderar bara åt admin),
     i demoläget den som skrev. Tiden och författaren ändras aldrig. */
  const AKT_EGNA = ['anteckning', 'mote', 'samtal', 'mejl'];
  // Kvittot efter en sparad händelse säger vad som sparades
  const AKT_SPARAD = { anteckning: 'Anteckningen är sparad', mote: 'Mötet är sparat', samtal: 'Samtalet är sparat', mejl: 'Mejlet är sparat' };
  const kanAndraAkt = (x) => !!x && AKT_EGNA.includes(x.typ) && x.av !== 'kund' && (x.av === jag || arAdmin());
  const kanRaderaAkt = (x) => !!x && AKT_EGNA.includes(x.typ) && x.av !== 'kund' && (SKARP ? arAdmin() : x.av === jag);
  const aktKnappar = (x) => {
    const andra = kanAndraAkt(x); const radera = kanRaderaAkt(x); if (!andra && !radera) return '';
    const typ = (AKT_TYP[x.typ] || 'aktiviteten').toLowerCase();
    return `<span class="handelse-knappar">${andra ? `<button class="handelse-knapp" type="button" data-g="andra-akt" data-id="${e(x.id)}" aria-label="Ändra ${e(typ)}" title="Ändra">${ik('redigera')}</button>` : ''}${radera ? `<button class="handelse-knapp handelse-knapp-fara" type="button" data-g="radera-akt" data-id="${e(x.id)}" aria-label="Ta bort ${e(typ)}" title="Ta bort">${ik('papperskorg')}</button>` : ''}</span>`;
  };
  const tidslinje = (akt) => {
    if (!akt.length) return tom('Ingen aktivitet ännu.');
    const sorterade = [...akt].sort((a, b) => (a.tid < b.tid ? 1 : -1));
    let ar = null; let html = '';
    const iAr = new Date().getFullYear();
    sorterade.forEach((x) => {
      const y = new Date(x.tid).getFullYear();
      if (y !== ar) { if (ar !== null || y !== iAr) html += `<p class="tidslinje-ar">${y}</p>`; ar = y; }
      html += `<div class="handelse" data-typ="${e(x.typ)}">
        <span class="handelse-ikon">${emo(UPEMO.akt[x.typ] || UPEMO.akt.system)}</span>
        <div><div class="handelse-meta"><strong>${e(AKT_TYP[x.typ] || 'Händelse')}</strong><span>${e(anv(x.av).kort)}</span><span>${e(relTid(x.tid))}</span>${x.andrad ? `<span class="handelse-andrad" title="${e(`Ändrad ${relTid(x.andrad)}${x.andradAv ? ` av ${anv(x.andradAv).kort}` : ''}`)}">ändrad</span>` : ''}${aktKnappar(x)}</div>
        <p class="handelse-text">${e(x.text)}</p></div></div>`;
    });
    return html;
  };

  // Tiden i klartext: "Förfallen 2 dagar", "Idag", "Imorgon", "fre 24 okt"
  const tidsBricka = (iso) => {
    if (!iso) return '';
    const n = dagarTill(iso);
    if (n < 0) return `<span class="chip chip-rod chip-prick">Förfallen ${plural(-n, 'dag', 'dagar')}</span>`;
    if (n === 0) return '<span class="chip chip-gul chip-prick">Idag</span>';
    if (n === 1) return '<span class="chip chip-is">Imorgon</span>';
    return `<span class="chip">${ik('kalender')}${e(dagText(iso))}</span>`;
  };
  // Uppgiftens typsymbol: "Ring …" → telefonen osv. Vanliga uppgifter får en neutral textsymbol (inte bocken – bredvid kryssrutan
  // såg den ut som en ikryssad ruta). Samma ruta och klasser som emoji-symbolen, så raderna står i linje. Används även av Att göra.
  const TODO_NEUTRAL = '<svg class="ikon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5h10M7 12h10M7 15.5h5.5"/></svg>';
  const todoTypIkon = (text, ruta = 'm') => {
    const [re, typEmo, typNamn] = todoTyp(text);
    return re ? emo(typEmo, { ruta, titel: typNamn }) : `<span class="emo emo-ruta emo-${ruta} todo-typ-neutral" title="Uppgift" aria-hidden="true">${TODO_NEUTRAL}</span>`;
  };
  const todoRad = (t, { visaKund = true } = {}) => {
    const k = t.kundId ? kund(t.kundId) : null;
    const kanSkjuta = !t.klar && !!t.datum && dagarTill(t.datum) <= 0;
    return `<div class="todo" data-todo="${e(t.id)}" ${t.klar ? 'data-klar' : ''}>
      <button class="todo-bock" type="button" data-g="todo-klar" data-id="${e(t.id)}" aria-label="${t.klar ? 'Markera som ej klar' : 'Markera som klar'}: ${e(t.text)}">${ik('bock')}</button>
      ${todoTypIkon(t.text)}
      <div class="todo-text">${e(t.text)}
        <div class="todo-meta">${t.klar ? '<span class="chip chip-ok">Klar</span>' : tidsBricka(t.datum)}${visaKund && k ? `<a class="chip" href="#/kund/${e(k.id)}">${e(k.namn)}</a>` : ''}${avatar(t.ansvarig, true)}</div>
      </div>
      ${kanSkjuta ? `<button class="knapp knapp-spok knapp-liten todo-skjut" type="button" data-g="todo-skjut" data-id="${e(t.id)}" title="Ändrar bara datumet">Skjut till imorgon</button>` : ''}</div>`;
  };

  const kundlankRad = (k, hoger = '') => `<a class="lank-rad" href="#/kund/${e(k.id)}">${loggaRuta(k)}<span class="lank-rad-text"><strong>${e(k.namn)}</strong><small>${e([k.bransch, k.stad].filter(Boolean).join(' · '))}</small></span>${hoger}</a>`;

  // Uppladdade filers typ. En inspelning är alltid en inspelning; en fil under Övrigt som heter "…avtal…" eller "…kontrakt…" räknas
  // som avtal (filer från före typen Avtal fanns) – samma tolkning i kundens dokumentlista och i Dokument (#/dokument).
  const DOK_KAT = { offert: 'Offert', order: 'Order', pub: 'PUB-avtal', avtal: 'Avtal', mote: 'Mötesinspelning', ovrigt: 'Övrigt' };
  const filKategori = (d) => (d.kategori === 'mote' || /^audio\//.test(d.typ || '') ? 'mote'
    : d.kategori === 'ovrigt' && /avtal|kontrakt/i.test(d.namn || '') ? 'avtal' : DOK_KAT[d.kategori] ? d.kategori : 'ovrigt');
  const filAndelse = (namn) => (String(namn || '').includes('.') ? String(namn).split('.').pop() : 'FIL').slice(0, 4).toUpperCase();
  const storlekText = (b) => (!b ? '' : b >= 1e6 ? `${(b / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1000))} kB`);
  const langdText = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : '');
  const dokLista = (docs) => docs.length ? docs.sort((a, b) => (a.tid < b.tid ? 1 : -1)).map((d) => {
    const katId = filKategori(d); const kat = DOK_KAT[katId];
    const ljud = katId === 'mote';
    const langd = ljud && d.langd ? ` · ${langdText(d.langd)}` : '';
    return `<div class="dokrad"><span class="dokikon" data-kat="${e(katId)}">${ljud ? ik('mote') : e(filAndelse(d.namn))}</span>
      <span class="lank-rad-text"><strong>${e(d.namn)}</strong><small>${e(kat)}${langd} · ${e(datumText(lokalISO(new Date(d.tid))))} · ${e(anv(d.av).kort)}${d.exempel ? ' · exempel' : ''}</small></span>
      <button class="knapp knapp-spok knapp-liten" type="button" data-g="oppna-dok" data-id="${e(d.id)}">Öppna</button></div>`;
  }).join('') : '';
  // Utan dokument blir uppladdningsytan själva tomläget (inget dubbelt "Inga dokument ännu")
  const uppladdningsYta = (kundId, affarId = '', tomt = false) => `<label class="uppladdning ${tomt ? 'uppladdning-tom' : ''}" data-uppladdning data-kund="${e(kundId)}" data-affar="${e(affarId)}">
    ${tomt ? `${emo(UPEMO.sak.dokument, { ruta: 'l', ton: 'is' })}<strong>Inga dokument ännu</strong><span>Dra hit offert, order eller PUB-avtal – eller klicka för att välja. De syns för hela teamet.</span>`
      : `${ik('uppladdning')}<strong>Ladda upp offert, order eller avtal</strong><span>Dra hit filer eller klicka</span>`}
    <input type="file" multiple data-uppladdning-falt></label>`;

  // emoji: UPEMO.salj eller UPEMO.proj. dagar: hur länge det aktiva steget pågått (visas under det)
  const stegare = (steg, aktiv, { klickbar = false, affarId = '', emoji = null, dagar = null } = {}) => {
    const ai = steg.findIndex((s) => s.id === aktiv);
    // Klickbara steg är knappar i en grupp (en knapp får inte bära rollen listitem); annars en lista med steg
    return `<div class="stegare" ${klickbar ? 'role="group" aria-label="Säljstegen – välj ett steg för att flytta affären"' : 'role="list"'}>${steg.map((s, i) => {
      const status = aktiv === 'klar' || i < ai ? 'klar' : i === ai ? 'aktiv' : 'kommande';
      const under = status === 'aktiv' && dagar != null ? `<small class="steg-dagar">${dagar < 1 ? 'Sedan idag' : `${plural(dagar, 'dag', 'dagar')} i steget`}</small>` : '';
      const inre = `<span class="steg-stapel"></span><strong>${emoji && emoji[s.id] ? emo(emoji[s.id], { ruta: 'xs' }) : ''}<span>${e(s.namn)}</span></strong>${s.agare ? agarband(s.agare, true) : `<small>${e(s.hint || '')}</small>`}${under}`;
      return klickbar ? `<button type="button" class="steg steg-knapp" style="--i:${i}" data-status="${e(status)}" data-g="flytta-till" data-affar="${e(affarId)}" data-steg="${e(s.id)}" title="Flytta till ${e(s.namn)}" ${status === 'aktiv' ? 'aria-current="step"' : ''}>${inre}</button>`
        : `<div class="steg" role="listitem" style="--i:${i}" data-status="${e(status)}" ${status === 'aktiv' ? 'aria-current="step"' : ''}>${inre}</div>`;
    }).join('')}</div>`;
  };


  /* 04b-premium: diagram och 3D-scener -------------------------------------------- */
  const SANNOLIKHET = { kontakt: 0.1, besok: 0.25, offert: 0.5, underlag: 0.75 };
  const viktad = (lista) => sum(lista.filter(arOppen).map((a) => affarVarde(a) * sannolikhet(a).p));
  // Färger per steg: [topp, fram nedtill, fram upptill, sida, glöd]
  const STEGFARG = {
    kontakt: ['#6f93b8', '#132c45', '#2a5277', '#0e2135', 'rgba(111,147,184,.45)'],
    besok: ['#7db3dc', '#173d5f', '#336b9c', '#112d47', 'rgba(125,179,220,.45)'],
    offert: ['#8fd3ec', '#1f5d7e', '#3f98bf', '#174861', 'rgba(143,211,236,.5)'],
    underlag: ['#b6ecf2', '#2b7f90', '#5cc0d1', '#20616e', 'rgba(182,236,242,.5)'],
    vunnet: ['#b9f5e1', '#1f8a6c', '#6fdcbc', '#176a53', 'rgba(126,224,195,.65)'],
  };
  const AGARFARG = { salj: '#3a7bb8', test: '#2fae8a', kontroll: '#f0b545' };
  const formatera = (v, f) => (f === 'kr' ? kr(v) : f === 'krkort' ? krKort(v) : f === 'pct' ? pct(v) : Math.round(v).toLocaleString('sv-SE'));
  const kpiRuta = (ikon, etikett, varde, under, { format = 'antal', mork = false, href = '' } = {}) => {
    const tagg = href ? 'a' : 'div';
    return `<${tagg} ${href ? `href="${e(href)}"` : ''} class="kort kpi ${mork ? 'kort-mork' : ''}" data-tilt="8" style="text-decoration:none"><div class="kpi-etikett">${symbol(ikon, { ruta: 's' })}<span>${e(etikett)}</span></div>
      <div class="kpi-varde tal" data-tal="${e(varde)}" data-format="${e(format)}">${formatera(varde, format)}</div><div class="kpi-under">${under}</div></${tagg}>`;
  };
  // Sidhjälten: sidans rubrik, sammanfattning, knappar och nyckeltal i ett mörkt rundat kort – samma formspråk som översiktens och
  // Klubbmotorns 3D-hjältar (stil i sidor.css modul 01). ogon/titel/accent/text/under/knappar/extra är färdig HTML (anroparen kör e()).
  // tal: [{ emo, etikett, varde, format, under (HTML), href, ton }] – helst 2–4 glaskort, de som förr låg i en ljus kpi-rad.
  // knapp: färdiga attribut (data-g …) – kortet blir en knapp som filtrerar sidan i stället för en länk (Dokument)
  // text: ett värde i ord ("3 dagar") i stället för ett tal som räknas upp; bred: kortet tar hela panelens bredd (sidor.css 18); extra: html sist i kortet
  const glasKort = ({ emo: em, etikett, varde, format = 'antal', text = '', under = '', href = '', ton = '', knapp = '', bred = false, extra = '' }) => {
    const tagg = href ? 'a' : knapp ? 'button' : 'div';
    return `<${tagg} class="glas${ton ? ` glas-${e(ton)}` : ''}${bred ? ' glas-bred' : ''}"${href ? ` href="${e(href)}"` : ''}${knapp ? ` type="button" ${knapp}` : ''}><span class="glas-etikett">${emo(em, { ruta: 's' })}${e(etikett)}</span>`
      + `${text ? `<strong class="glas-varde glas-text">${e(text)}</strong>` : `<strong class="glas-varde" data-tal="${e(varde)}" data-format="${e(format)}">${formatera(varde, format)}</strong>`}${under ? `<span class="glas-under">${under}</span>` : ''}${extra}`
      + `${href || knapp ? `<span class="glas-pil" aria-hidden="true">${ik('pil')}</span>` : ''}</${tagg}>`;
  };
  const sidhjalte = ({ ogon = '', titel = '', accent = '', text = '', under = '', knappar = '', tal = [], extra = '', klass = '', attr = '' }) => `
      <section class="sidhjalte${klass ? ` ${klass}` : ''}" data-sidhjalte data-mork-yta ${attr}>
        <div class="sidhjalte-text">
          ${ogon ? `<span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>${ogon}</span>` : ''}
          <h1>${titel}${accent ? ` <em>${accent}</em>` : ''}</h1>
          ${text ? `<p class="sidhjalte-ingress">${text}</p>` : ''}
          ${under ? `<div class="sidhjalte-under">${under}</div>` : ''}
          ${knappar ? `<div class="sidhjalte-knappar">${knappar}</div>` : ''}
        </div>
        ${tal.length ? `<div class="sidhjalte-tal" data-antal="${tal.length}">${tal.map(glasKort).join('')}</div>` : ''}${extra}
      </section>`;
  const veckonummer = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
  // Mjuk kurva genom punkter (Catmull–Rom till Bézier)
  const mjukLinje = (pts) => pts.reduce((d, p, i, a) => {
    if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const p0 = a[i - 2] || a[i - 1]; const p1 = a[i - 1]; const p3 = a[i + 1] || p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6];
    const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    return `${d} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }, '');
  const sparkline = (varden, b = 120, h = 30) => {
    const max = Math.max(1, ...varden); const steg = b / Math.max(1, varden.length - 1);
    const d = mjukLinje(varden.map((v, i) => [i * steg, h - 2 - (v / max) * (h - 6)]));
    return `<svg class="sparklinje" viewBox="0 0 ${b} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-yta" d="${d} L ${b} ${h} L 0 ${h} Z"/><path class="spark-linje" d="${e(d)}" pathLength="1"/></svg>`;
  };
  const manadsData = () => {
    const nu = new Date(); const man = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1); man.push({ ar: d.getFullYear(), m: d.getMonth(), namn: d.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', ''), varde: 0 }); }
    db.affarer.filter((a) => a.steg === 'signerad').forEach((a) => { const d = tolka(a.stegAndrad); const x = man.find((q) => q.ar === d.getFullYear() && q.m === d.getMonth()); if (x) x.varde += affarVarde(a); });
    return man;
  };
  // Pipelinen som en 3D-stad: en kub per steg, höjd efter värde
  const skylineHtml = (staplar) => {
    const max = Math.max(1, ...staplar.map((s) => s.varde));
    return `<div class="skyline" data-skyline style="--rx:57deg;--rz:45deg" role="img" aria-label="Pipeline per steg: ${e(staplar.map((s) => `${s.namn} ${krKort(s.varde)}`).join(', '))}">
      <div class="golv"><div class="golv-yta"></div><div class="golv-fram"></div><div class="golv-sida"></div>
      ${staplar.map((s, i) => {
        const [topp, fa, fb, sida, glod] = STEGFARG[s.id];
        const h = Math.round(14 + (s.varde / max) * 166);
        // Staplarna ställs längs golvets diagonal, som ser vågrät ut för betraktaren – ingen skymmer någon annan
        const t = (i - (staplar.length - 1) / 2) * 64;
        return `<div class="kub" style="--x:${(128 + t * 0.7071).toFixed(1)}px;--y:${(128 - t * 0.7071).toFixed(1)}px;--mal:${h}px;--i:${i};--topp:${topp};--fram-a:${fa};--fram-b:${fb};--sida:${sida};--glod:${glod}">
          <div class="kub-skugga"></div><div class="kub-fram"></div><div class="kub-sida"></div><div class="kub-topp"></div>
          <div class="kub-etikett"><strong>${krKort(s.varde)}<small>${s.antal} st</small></strong></div></div>`;
      }).join('')}
      </div></div>`;
  };
  // Översiktens intäktsgraf och Klubbmotorns provisionsstapel: obIntaktGraf och obKlubbPengar i modul 05 (05-resultat)

  /* 04c-testhistorik: sälj vidare på genomförda tester ------------------------------ */
  const NASTA_PAKET = { bas: 'basplus', basplus: 'basplusplus', basplusplus: 'basplusplus' };
  const testerFor = (kundId) => db.projekt.filter((p) => p.kundId === kundId && p.testdatum && projStegIndex(p.steg) >= projStegIndex('avstamning')).sort((a, b) => (a.testdatum < b.testdatum ? 1 : -1));
  const deltagareFor = (a) => { const l = a && a.offert && a.offert.underlag ? db.kundlankar[a.offert.underlag] : null; return l && l.deltagare && l.deltagare.length ? l.deltagare : null; };
  const manaderSedan = (iso) => Math.max(0, Math.round(-dagarTill(iso) / 30.4));
  // Var står kunden? 5–10 månader efter testet: uppföljning. 10+ månader: omtest.
  const omtestLage = (kundId) => {
    const p = testerFor(kundId)[0]; if (!p) return null;
    const m = manaderSedan(p.testdatum);
    return { p, manader: m, typ: m >= 10 ? 'omtest' : m >= 5 ? 'uppfoljning' : null, oppen: affarerFor(kundId).find(arOppen), rekommenderat: omDagar(365, p.testdatum) };
  };
  const paketFordelning = (o) => {
    if (o.eget != null) return o.beskrivning || 'Specialoffert';
    if (o.typ === 'uppfoljning') return 'Uppföljning & coaching';
    if (o.deltagare && o.deltagare.length) { const per = {}; o.deltagare.forEach((d) => { per[d.paket] = (per[d.paket] || 0) + 1; }); return Object.entries(per).map(([k, n]) => `${PRISER.paket[k].namn} × ${n}`).join(', '); }
    return `${(PRISER.paket[o.paket] || {}).namn || ''} × ${o.antal}`;
  };
  // Offerten för en ny affär, byggd på ett tidigare test
  const spinnOffert = (fore, typ, valda, antal, program) => {
    const fo = fore.offert;
    if (typ === 'coaching') return { typ: 'uppfoljning', antal, deltagare: valda ? valda.map((d) => ({ paket: d.paket, tillval: [] })) : undefined, ...program };
    if (fo.eget != null) return { eget: fo.eget, beskrivning: fo.beskrivning };
    const uppg = (id) => (typ === 'uppgradera' ? NASTA_PAKET[id] || id : id);
    if (valda) return { deltagare: valda.map((d) => ({ paket: uppg(d.paket), tillval: [...(d.tillval || [])] })), antal: valda.length, ...program };
    if (fo.deltagare && fo.deltagare.length) return { deltagare: fo.deltagare.map((d) => ({ paket: uppg(d.paket), tillval: [...(d.tillval || [])] })), antal: fo.deltagare.length, ...program };
    return { paket: uppg(fo.paket || 'bas'), antal, tillval: [...(fo.tillval || [])], ...program };
  };
  const uppfoljningsmote = (p) => {
    if (!p.testdatum) return null;
    return db.aktiviteter.filter((x) => x.kundId === p.kundId && x.typ === 'mote' && x.tid.slice(0, 10) > p.testdatum && -dagarTill(x.tid.slice(0, 10)) >= 0 && dagarTill(x.tid.slice(0, 10)) - dagarTill(p.testdatum) <= 150).sort((a, b) => (a.tid < b.tid ? -1 : 1))[0] || null;
  };

  const testhistorikHtml = (k) => {
    // Bara genomförda tester – planerade står på sin affär i kortet Affärer & projekt
    const tester = testerFor(k.id); const lage = omtestLage(k.id);
    if (!tester.length) return '';
    let rek = '';
    if (lage) {
      const andel = Math.min(1, lage.manader / 12);
      const rubrik = lage.oppen ? `Nästa affär ligger redan i säljtavlan: ${lage.oppen.titel}` : lage.typ === 'omtest' ? `Dags för omtest – ${lage.manader} månader sedan förra testet` : lage.typ === 'uppfoljning' ? `Läge för uppföljning & coaching – ${lage.manader} månader sedan testet` : `Omtest rekommenderas ${datumText(lage.rekommenderat, { ar: true })}`;
      const text = lage.oppen ? `${stegChip(lage.oppen)} ${kr(affarVarde(lage.oppen))}` : lage.typ === 'uppfoljning' ? `Uppföljning och coaching av deltagarna – ${kr(PRISER.uppfoljning)} per person enligt prislistan.` : 'Omtest av alla deltagare uppdaterar riskprofilen och visar utvecklingen – samma upplägg eller nästa paketnivå.';
      const typChip = lage.oppen ? '' : lage.typ === 'omtest' ? `<span class="chip chip-glas">${emo(UPEMO.sak.omtest)}Omtest</span>` : lage.typ === 'uppfoljning' ? `<span class="chip chip-glas">${emo(UPEMO.sak.uppfoljning)}Uppföljning</span>` : '';
      rek = `<div class="omtestkort">
        <span class="omtest-ring" role="img" aria-label="${lage.manader} av 12 månader"><svg viewBox="0 0 40 40"><circle class="spar" cx="20" cy="20" r="16"/><circle class="fyll" cx="20" cy="20" r="16" pathLength="100" style="stroke-dasharray:${(andel * 100).toFixed(0)} 100"/></svg><b>${lage.manader}<small>mån</small></b></span>
        <div class="omtest-text">${typChip}<strong>${e(rubrik)}</strong><small>${lage.oppen ? text : e(text)}</small></div>
        ${lage.oppen ? `<a class="knapp knapp-kontur knapp-liten omtest-knapp" href="#/affar/${e(lage.oppen.id)}">Öppna affären</a>` : `<button class="knapp knapp-accent knapp-liten" type="button" data-g="spinn" data-projekt="${e(lage.p.id)}" data-typ="${lage.typ === 'uppfoljning' ? 'coaching' : 'omtest'}">${ik('plus')}Sälj vidare</button>`}</div>`;
    }
    const kort = tester.map((p, i) => {
      const a = affar(p.affarId); const d = tolka(p.testdatum); const mote = uppfoljningsmote(p);
      const lista = deltagareFor(a); const bestallda = lista ? lista.length : a.offert.eget != null ? p.genomforda : a.offert.antal;
      return `<article class="testkort" style="--i:${i}">
        <div class="testkort-datum" aria-hidden="true"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '')} ${d.getFullYear()}</span>${lage && lage.p.id === p.id ? '' : `<small>${manaderSedan(p.testdatum)} mån sedan</small>`}</div>
        <div style="min-width:0"><h3>${e(a.titel)}</h3>
          <p class="testkort-under">${e(p.genomforda ?? '–')} av ${e(bestallda ?? '–')} testade · ${e(paketFordelning(a.offert))}</p>
          <div class="testkort-meta">${p.apponboarding ? `<span class="chip chip-ok">${ik('bock')}App-onboarding</span>` : ''}${p.steg === 'klar' ? '<span class="chip">Avslutat</span>' : `<span class="chip chip-gul">${e(PROJSTEG.find((x) => x.id === p.steg).namn)}</span>`}${lista ? `<span class="chip chip-is">${ik('anstallda')}${lista.length} namngivna deltagare</span>` : ''}</div>
          ${mote ? `<p class="testkort-citat"><strong>Från uppföljningsmötet:</strong> ${e(mote.text.replace(/^Uppföljningsmöte\s*[:–-]?\s*/i, ''))}</p>` : ''}
          <div class="testkort-knappar">${lage && lage.oppen ? `<button class="knapp knapp-spok knapp-liten" type="button" data-g="spinn" data-projekt="${e(p.id)}" title="Det finns redan en öppen affär för kunden">${ik('plus')}Ny affär ändå</button>` : lage && lage.p.id === p.id ? '' : `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="spinn" data-projekt="${e(p.id)}">${ik('plus')}Sälj vidare</button>`}${lista ? `<button class="knapp knapp-spok knapp-liten" type="button" data-g="visa-deltagare" data-token="${e(a.offert.underlag)}">Deltagare</button>` : ''}<a class="kortlank testkort-lank" href="#/projekt/${e(p.id)}">Öppna projektet${ik('pil')}</a></div>
        </div></article>`;
    }).join('');
    return `<section class="kort"><div class="kort-huvud"><h2>${ik('trend')}Tester &amp; uppföljning</h2><span class="rakna">${tester.length} ${tester.length === 1 ? 'test' : 'tester'}</span></div>
      ${rek}<div class="testlista">${kort}</div></section>`;
  };

  // Skapar en ny affär som bygger vidare på ett genomfört test
  function skapaFranTest(projektId, val) {
    const p = projekt(projektId); const fore = affar(p.affarId); const k = kund(p.kundId);
    const lista = deltagareFor(fore); const valda = lista ? lista.filter((d) => !val.valdaIds || val.valdaIds.includes(d.id)) : null;
    const antal = valda ? valda.length : Math.max(1, parseInt(val.antal, 10) || p.genomforda || fore.offert.antal || 1);
    const program = { app: !!(val.program && val.program.app), insights: !!(val.program && val.program.insights), uppfoljning: false };
    const offert = spinnOffert(fore, val.typ, valda, antal, program);
    const nu = new Date(); const ar = nu.getFullYear() + (nu.getMonth() >= 8 ? 1 : 0);
    const titel = { omtest: `Omtest ${ar}`, uppgradera: 'Uppgradering av hälsokartläggningen', coaching: 'Uppföljning & coaching' }[val.typ] || 'Omtest';
    const a = { id: nyId('a'), kundId: k.id, titel, steg: val.steg || 'besok', ansvarig: fore.ansvarig, skapad: idag(), stegAndrad: idag(), check: { info: false, samtycke: false, pub: false, order: false }, franTest: p.id, offert };
    db.affarer.push(a);
    let lankText = '';
    // Coaching räknas per person (895 kr) – kundlänken räknar på testpaket, så den skapas bara för omtest och uppgradering
    if (val.lank && valda && valda.length && val.typ !== 'coaching') {
      const token = nyToken(); const stamp = new Date().toISOString(); const gammal = db.kundlankar[fore.offert.underlag] || {};
      db.kundlankar[token] = { affarId: a.id, kundId: k.id, skapad: stamp, andrad: stamp, utgar: omDagar(30), status: 'skickad', steg: 2, franTest: p.id,
        foretag: { ...(gammal.foretag || { namn: k.namn, orgnr: k.orgnr || '' }), period: '' }, standard: { paket: 'bas', tillval: [] },
        deltagare: valda.map((d, i) => ({ id: nyId('d') + i, namn: d.namn, epost: d.epost, pnr: d.pnr || '', paket: offert.deltagare ? offert.deltagare[i].paket : d.paket, tillval: offert.deltagare ? [...offert.deltagare[i].tillval] : [] })) };
      lankText = ' Kundlänk med deltagarna förifyllda är skapad.';
    }
    logga(`Ny affär som bygger på testet ${datumText(p.testdatum, { ar: true })}: ${titel}, ${kr(affarVarde(a))}.${lankText}`, { kundId: k.id, affarId: a.id });
    return a;
  }
  function oppnaSpinn(projektId, typ) {
    const p = projekt(projektId); const fore = affar(p.affarId); const k = kund(p.kundId); const lista = deltagareFor(fore); const lage = omtestLage(k.id);
    const vald = typ || (lage && lage.typ === 'uppfoljning' ? 'coaching' : 'omtest');
    const kanUppgradera = fore.offert.eget == null && fore.offert.typ !== 'uppfoljning';
    const val = [['omtest', 'Omtest', 'Samma upplägg som förra gången', UPEMO.sak.omtest], ...(kanUppgradera ? [['uppgradera', 'Uppgradera', 'Nästa paketnivå för alla', 'uppgradera']] : []), ['coaching', 'Uppföljning & coaching', `${kr(PRISER.uppfoljning)} per person – uppdaterar riskprofilen`, UPEMO.sak.uppfoljning]];
    const tillvalText = (d) => ((d.tillval || []).length ? ' + ' + d.tillval.map((t) => PRISER.tillval[t].namn).join(', ') : '');
    oppnaArk(`${arkHuvud('Sälj vidare på testet', `${k.namn} · testat ${datumText(p.testdatum, { ar: true })} · ${p.genomforda || '–'} deltagare · ${paketFordelning(fore.offert)}`, UPEMO.sak.omtest)}
      <form data-form="spinn" data-projekt="${e(p.id)}" class="ark-kropp">
        <fieldset><legend class="etikett">Vad vill ni erbjuda?</legend><div class="spinnval">${val.map(([v, t, u, i]) => `<label class="spinnkort"><input type="radio" name="typ" value="${e(v)}" ${vald === v ? 'checked' : ''}><span>${emo(i, { ruta: 'l' })}<strong>${t}</strong><small>${e(u)}</small></span></label>`).join('')}</div></fieldset>
        ${lista ? `<fieldset><legend class="etikett">Deltagare från förra testet <em>(bocka ur de som slutat)</em></legend><div class="spinn-deltagare">${lista.map((d) => { const nu = (PRISER.paket[d.paket] || {}).namn || ''; const upp = (PRISER.paket[NASTA_PAKET[d.paket]] || {}).namn || nu; return `<label class="kryss"><input type="checkbox" name="deltagare" value="${e(d.id)}" checked><span>${e(d.namn || '–')}<small data-spinn-paket data-nu="${e(nu + tillvalText(d))}" data-upp="${e((upp === nu ? `${nu} (högsta nivån)` : `${nu} → ${upp}`) + tillvalText(d))}">${e(nu + tillvalText(d))}</small></span></label>`; }).join('')}</div></fieldset>`
          : `<label data-spinn-antal><span class="etikett">Antal deltagare</span><input class="falt" type="number" min="1" name="antal" value="${e(p.genomforda || fore.offert.antal || 10)}"></label>`}
        ${fore.offert.eget != null ? `<p class="falt-hint spinn-eget" data-spinn-eget-hint hidden>${ik('info')}<span>Förra testet hade ett eget pris – omtestet får samma belopp, ${kr(fore.offert.eget)}. Justera priset, antalet och programmen i affärens offertkort efteråt.</span></p>` : ''}
        <div class="tillval-rutnat">
          <label class="kryss" data-spinn-program><input type="checkbox" name="app" ${fore.offert.app ? 'checked' : ''}><span>UPerformance App, 12 mån<small>${kr(PRISER.appManad)} per anställd och månad</small></span></label>
          <label class="kryss" data-spinn-program><input type="checkbox" name="insights" ${fore.offert.insights ? 'checked' : ''}><span>Team Insights<small>Jämför utvecklingen mot förra testet</small></span></label>
          ${lista ? '<label class="kryss" style="grid-column:1/-1" data-spinn-lank><input type="checkbox" name="lank" checked><span>Skicka kundlänk med deltagarna förifyllda<small>Kunden bekräftar, lägger till nya och tar bort de som slutat</small></span></label>' : ''}
          <p class="falt-hint" data-spinn-coaching-hint style="grid-column:1/-1;margin:0" hidden>Coaching räknas per person – ingen kundlänk behövs. Deltagarna följer med från förra testet.</p>
        </div>
        <div class="spinn-summa" data-spinn-summa aria-live="polite"></div>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('plus')}Skapa affär</button></div>`);
    uppdateraSpinn();
  }
  function lasSpinn(f) {
    const d = new FormData(f);
    return { typ: d.get('typ'), valdaIds: f.querySelector('[name="deltagare"]') ? d.getAll('deltagare') : null, antal: d.get('antal'), program: { app: !!d.get('app'), insights: !!d.get('insights') }, lank: !!d.get('lank') };
  }
  function uppdateraSpinn() {
    const f = $('form[data-form="spinn"]', ark); if (!f) return;
    const p = projekt(f.dataset.projekt); const fore = affar(p.affarId); const val = lasSpinn(f);
    const lista = deltagareFor(fore); const valda = lista ? lista.filter((d) => val.valdaIds.includes(d.id)) : null;
    const antal = valda ? valda.length : Math.max(1, parseInt(val.antal, 10) || 1);
    const ny = prisa(spinnOffert(fore, val.typ, valda, antal, { ...val.program, uppfoljning: false })).total; const gammal = affarVarde(fore); const diff = ny - gammal;
    $('[data-spinn-summa]', f).innerHTML = `<div><span>Ny affär</span><strong>${kr(ny)}</strong></div><div><span>Förra testet</span><strong>${kr(gammal)}</strong></div><b class="spinn-skillnad ${diff > 0 ? 'upp' : diff < 0 ? 'ner' : 'lika'}">${diff ? `${diff > 0 ? '+' : '−'}${kr(Math.abs(diff))} mot förra` : 'Samma som förra'}</b>`;
    // Uppgradera: visa vad det innebär per person ("Bas → Bas+"). Coaching: ingen kundlänk.
    $$('[data-spinn-paket]', f).forEach((s) => { s.textContent = val.typ === 'uppgradera' ? s.dataset.upp : s.dataset.nu; });
    const lankRad = $('[data-spinn-lank]', f); if (lankRad) lankRad.hidden = val.typ === 'coaching';
    const hint = $('[data-spinn-coaching-hint]', f); if (hint) hint.hidden = val.typ !== 'coaching' || !lista;
    // Eget pris (specialoffert): omtest och uppgradering behåller beloppet – antal och program påverkar inget, så de visas inte då
    const egetLage = fore.offert.eget != null && val.typ !== 'coaching';
    $$('[data-spinn-antal], [data-spinn-program]', f).forEach((x) => { x.hidden = egetLage; });
    const egetHint = $('[data-spinn-eget-hint]', f); if (egetHint) egetHint.hidden = !egetLage;
    const knapp = $('[data-g="skicka-ark"]', ark); if (knapp) knapp.disabled = !!valda && !valda.length;
  }

  /* 05-vyer: översikt ---------------------------------------------------------- */
  const ovUi = { allaLarm: false, hetAlla: false, fokusId: null };
  const LARM_ORDNING = { rod: 0, orange: 1, gul: 2, is: 3, navy: 3 };
  let vantandeKolumn = null; // översiktens tratt: hoppa till kolumnen när säljtavlan ritats
  // Hälsning efter tid på dygnet – med högst en dygnsemoji som markör
  const halsningNu = (h = new Date().getHours()) => (h < 5 ? ['God natt', UPEMO.dygn.natt] : h < 10 ? ['God morgon', UPEMO.dygn.morgon] : h < 17 ? ['Hej', UPEMO.dygn.dag] : h < 22 ? ['God kväll', UPEMO.dygn.kvall] : ['God kväll', UPEMO.dygn.natt]);
  /* Dygnets märke bredvid hälsningen (översikten, Att göra): en fri himlakropp med sken – ingen ruta. Dag: solen med två lager
     strålar och ett moln som driver förbi. Morgon: solen stiger över horisonten och glittrar i vattnet. Kväll: skärans måne med
     jordsken, tindrande stjärnor och ett stjärnfall. Natt: fullmånen med kratrar, fler stjärnor och stjärnfall.
     Bara HTML-lager som rör transform/opacitet (komponeras, ingen ommålning). Stil i premium.css ("Dygnets märke"). */
  const dygnFas = (h = new Date().getHours()) => (h < 5 ? 'natt' : h < 10 ? 'morgon' : h < 17 ? 'dag' : h < 22 ? 'kvall' : 'natt');
  const DYGN_NAMN = { natt: 'Natt', morgon: 'Morgon', dag: 'Dag', kvall: 'Kväll' };
  const DYGN_KROPP = {
    dag: '<i class="dg-stralar"></i><i class="dg-stralar dg-stralar-2"></i><i class="dg-kropp"></i><i class="dg-moln"></i>',
    morgon: '<i class="dg-upp"><i class="dg-stiger"><i class="dg-stralar"></i><i class="dg-kropp"></i></i></i><i class="dg-linje"></i><i class="dg-spegel"></i>',
    kvall: '<i class="dg-mane"><i class="dg-skugga"></i><i class="dg-kropp"></i></i><i class="dg-fall"></i>',
    natt: '<i class="dg-mane"><i class="dg-kropp"></i></i><i class="dg-fall"></i><i class="dg-fall dg-fall-2"></i>',
  };
  // stjärnor: x, y (% av märket), storlek (em), ordning för tindrandet
  const DYGN_STJARNOR = {
    dag: [[90, 12, 0.1, 0]],
    morgon: [[10, 6, 0.1, 0], [94, 18, 0.07, 1]],
    kvall: [[2, 30, 0.13, 0], [96, 4, 0.09, 1], [6, 92, 0.07, 2], [102, 74, 0.07, 3]],
    natt: [[0, 22, 0.13, 0], [94, -2, 0.1, 1], [8, 94, 0.07, 2], [104, 66, 0.08, 3], [48, -16, 0.06, 4]],
  };
  const dygnMarke = (fas = dygnFas()) => `<span class="dygn" data-fas="${fas}" data-rorelse aria-hidden="true" title="${DYGN_NAMN[fas] || ''}"><i class="dg-halo"></i>${DYGN_KROPP[fas] || DYGN_KROPP.dag}${(DYGN_STJARNOR[fas] || []).map(([x, y, s, i]) => `<i class="dg-stj" style="--x:${x}%;--y:${y}%;--s:${s}em;--i:${i}"></i>`).join('')}</span>`;
  // Översiktens hälsning: orden tonar fram ett och ett (första visningen), namnet får ett ljus som drar förbi då och då
  // (fönster + motfönster som sidfotens stora ord på sajten) och dygnets märke sist. Tonen i hälsningen följer dygnet.
  const halsningHtml = (halsning, namn, fas) => {
    const ord = `${halsning},`.split(' ');
    return `<h1 class="ob-halsning" data-fas="${fas}">${ord.map((o, i) => `<span class="hw" style="--k:${i}">${e(o)}</span>`).join(' ')} <span class="ob-namn" style="--k:${ord.length}"><span class="hn"><em>${e(namn)}</em><span class="hn-ljus" aria-hidden="true"><span>${e(namn)}</span></span></span><span class="hn-punkt">.</span> ${dygnMarke(fas)}</span></h1>`;
  };
  // Översiktens sektionsmeny (Din dag · Affärer · Resultat): hopp med knappar + scrollIntoView – hash-routingen tillåter inga
  // #id-ankare. Den aktiva knappen (aria-current + mint markör) följer scrollen; ingen är aktiv medan hjälten syns.
  const obHopp = (mal) => {
    // Till toppen: fokus på hälsningen (nästa Tab går vidare in i fokuskortet). Pekarraden i listan (fokus): fokuskortets första knapp.
    if (mal === 'topp' || mal === 'fokus') {
      scrollTo({ top: 0, behavior: lugn ? 'auto' : 'smooth' });
      const knapp = mal === 'fokus' ? $('.ob-fokus .ob-fokus-knappar :is(a, button)', vy) : null;
      const h = knapp || $('.hero3d h1', vy); if (h) { if (!knapp) h.tabIndex = -1; h.focus({ preventScroll: true }); }
      return;
    }
    const s = $(`[data-ob-sektion="${sel(mal)}"]`, vy); if (!s) return;
    s.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' });
    const h = $('h2', s); if (h) h.focus({ preventScroll: true });
  };
  let obNavObs = null, obSlutObs = null, obNavRo = null;
  function startaObNav() {
    [obNavObs, obSlutObs, obNavRo].forEach((o) => o && o.disconnect()); obNavObs = obSlutObs = obNavRo = null;
    const nav = $('[data-ob-nav]', vy); if (!nav || !('IntersectionObserver' in window)) return;
    const knappar = $$('button[data-mal]:not([data-mal="topp"])', nav); const markor = $('.ob-nav-markor', nav);
    const syns = new Map(); let slut = false; let senast = null;
    const dag = $('[data-ob-sektion="dag"]', vy);
    const valj = () => {
      if (!nav.isConnected) { [obNavObs, obSlutObs, obNavRo].forEach((o) => o && o.disconnect()); return; }
      // Mellan två sektioner (luften är ibland högre än observatörens band) står den senaste kvar – ingen blinkande markör.
      // Ovanför Din dag (hjälten syns) är ingen knapp aktiv.
      const forbi = !!dag && dag.getBoundingClientRect().top < innerHeight * 0.45;
      let mal = slut ? 'resultat' : ['dag', 'affarer', 'resultat'].filter((m) => syns.get(m)).pop() || null;
      if (!mal && forbi) mal = senast;
      senast = forbi ? mal : null;
      knappar.forEach((b) => b.setAttribute('aria-current', b.dataset.mal === mal ? 'true' : 'false'));
      const b = knappar.find((x) => x.dataset.mal === mal);
      if (markor) { markor.toggleAttribute('data-synlig', !!b); if (b) { markor.style.setProperty('--x', `${b.offsetLeft}px`); markor.style.setProperty('--b', `${b.offsetWidth}px`); } }
    };
    // Första läget räknas direkt och sätts utan glid – annars glider markören in från vänster vid varje omritning
    // (polling, "Visa alla", växeln). Samma band som observatören nedan: 30–40 % av fönsterhöjden.
    const h0 = innerHeight;
    $$('[data-ob-sektion]', vy).forEach((s) => { const r = s.getBoundingClientRect(); syns.set(s.dataset.obSektion, r.top <= h0 * 0.45 && r.bottom >= h0 * 0.3); });
    // Mitt i luften mellan två sektioner vid en omritning: närmaste sektion ovanför räknas som aktiv
    if (![...syns.values()].some(Boolean)) { const ovan = $$('[data-ob-sektion]', vy).filter((s) => s.getBoundingClientRect().top < h0 * 0.3).pop(); if (ovan) senast = ovan.dataset.obSektion; }
    const sl0 = $('[data-ob-slut]', vy); slut = !!sl0 && sl0.getBoundingClientRect().top < h0 && scrollY > 200;
    nav.setAttribute('data-direkt', ''); valj(); void getComputedStyle(markor || nav).transform; nav.removeAttribute('data-direkt');
    obNavObs = new IntersectionObserver((p) => { p.forEach((x) => syns.set(x.target.dataset.obSektion, x.isIntersecting)); valj(); }, { rootMargin: '-30% 0px -55% 0px' });
    $$('[data-ob-sektion]', vy).forEach((s) => obNavObs.observe(s));
    const sl = $('[data-ob-slut]', vy); if (sl) { obSlutObs = new IntersectionObserver((p) => { slut = p[p.length - 1].isIntersecting && scrollY > 200; valj(); }); obSlutObs.observe(sl); }
    if ('ResizeObserver' in window) { obNavRo = new ResizeObserver(valj); obNavRo.observe(nav); }
  }

  /* 05-resultat: översiktens intäktsgraf och Klubbmotorns provisionsstapel (stil i sidor.css avsnitt 08, "03 Resultat") */
  const obTal = (x) => +x.toFixed(2);
  const obManNamn = (q) => new Date(q.ar, q.m, 1).toLocaleDateString('sv-SE', { month: 'long' });
  // Rutnätets steg: 1, 2, 2,5 eller 5 × 10^n – högst fem linjer, toppen minst 10 % över summan (luft för etiketterna)
  const obSkala = (tot) => {
    const M = Math.max(1, tot * 1.1); const p = 10 ** Math.floor(Math.log10(M / 5));
    const steg = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => Math.ceil(M / s) <= 5);
    return { steg, max: Math.ceil(M / steg) * steg };
  };
  const obSkalText = (n) => (!n ? '0' : n >= 1e6 ? `${(n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} Mkr` : n >= 1e3 ? `${(n / 1e3).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} tkr` : `${Math.round(n)} kr`);

  // Intäkterna de senaste tolv månaderna som EN graf (ett vattenfall): det ackumulerade är linjen med mjuk yta, och varje signerad
  // order är en stapel på sitt datum – från förra nivån upp till den nya (stapelns längd = orderns värde, samma skala som linjen).
  // Knoppen överst är länken till affären. Tomma månader är bara en prick på axeln. Etiketterna (värde + kund) placeras av
  // startaObGraf där de får plats; ovanför står en uträknad insikt. Pilarna går mellan ordrarna (en tabbstopp). Smal yta:
  // etiketterna ersätts av en lista under grafen. Returnerar { html, snitt, antal } – korten ovanför använder samma ordrar.
  const obIntaktGraf = (man) => {
    const nu = new Date(); const n = man.length;
    const start = new Date(man[0].ar, man[0].m, 1); const slut = new Date(man[n - 1].ar, man[n - 1].m + 1, 1);
    const xAv = (d) => Math.min(1, Math.max(0, (d - start) / (slut - start)));
    const ordrar = db.affarer.filter((a) => a.steg === 'signerad').map((a) => ({ a, d: tolka(a.stegAndrad), v: affarVarde(a) }))
      .filter((o) => o.d && o.d >= start && o.d < slut).sort((x, y) => x.d - y.d || y.v - x.v);
    const tot = sum(ordrar.map((o) => o.v)); const { steg, max } = obSkala(tot); const yAv = (v) => 1 - v / max;
    const basta = tot ? man.reduce((b, q, i) => (q.varde > man[b].varde ? i : b), 0) : -1;
    let ack = 0;
    ordrar.forEach((o) => {
      o.y0 = yAv(ack); ack += o.v; o.y1 = yAv(ack); o.ack = ack;
      o.x = xAv(new Date(o.d.getFullYear(), o.d.getMonth(), o.d.getDate(), 12));
      o.mi = man.findIndex((q) => q.ar === o.d.getFullYear() && q.m === o.d.getMonth());
      o.k = kund(o.a.kundId) || { namn: 'Kunden' };
      o.datum = o.d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
      o.kort = o.d.getFullYear() === nu.getFullYear() ? o.d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '') : o.datum;
    });
    const idagX = xAv(nu);

    // Linjen i viewBox-enheter (sträcks till ytan; vector-effect håller tjockleken): vågrätt på förra nivån fram till orderns
    // datum och rakt upp till den nya – stapeln täcker steget, så linjen går in i stapelns fot och ut ur knoppen
    const VB = 1000; let d = `M0,${VB}`;
    ordrar.forEach((o) => { const x = obTal(o.x * VB); d += ` L${x},${obTal(o.y0 * VB)} L${x},${obTal(o.y1 * VB)}`; });
    const xSlut = Math.max(ordrar.length ? ordrar[ordrar.length - 1].x : 0, idagX) * VB; d += ` L${obTal(xSlut)},${obTal(yAv(tot) * VB)}`;
    // Inritningen: ett fönster (ob-ig-ram, overflow: hidden) glider in från vänster medan linjen inuti glider tillbaka lika
    // mycket – linjen står still och visas från vänster till höger med bara transform (ingen ommålning per bildruta)
    const svg = `<span class="ob-ig-ram" aria-hidden="true"><svg class="ob-ig-svg" viewBox="0 0 ${VB} ${VB}" preserveAspectRatio="none">
          <defs><linearGradient id="ob-ig-yta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ee0c3" stop-opacity=".3"/><stop offset=".55" stop-color="#7ee0c3" stop-opacity=".1"/><stop offset="1" stop-color="#7ee0c3" stop-opacity=".02"/></linearGradient>
            <linearGradient id="ob-ig-drag" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${VB}" y2="0"><stop offset="0" stop-color="#a7d2ff"/><stop offset=".55" stop-color="#7ee0c3"/><stop offset="1" stop-color="#b9f5e1"/></linearGradient></defs>
          ${tot ? `<path class="ob-ig-fyll" d="${d} L${obTal(xSlut)},${VB} Z"/>` : ''}<path class="ob-ig-glod" d="${d}"/><path class="ob-ig-linje" d="${d}"/></svg></span>`;

    // Rutnätet: hårfina linjer med beloppen i en egen marginal till vänster (aldrig under en prick eller etikett)
    const linjer = [0]; if (tot) for (let v = steg; v <= max + 1e-6; v += steg) linjer.push(v); // utan ordrar: bara nollinjen
    const rutnat = `<div class="ob-ig-rutnat" aria-hidden="true">${linjer.map((v, i) => `<span style="--y:${yAv(v).toFixed(4)}"${i % 2 ? ' data-udda' : ''}${i ? '' : ' data-noll'}><b>${obSkalText(v)}</b></span>`).join('')}</div>`;

    // Ordrarna: staplar med knopp (länkar), etikett och detaljkort. Den senaste ordern bär tabbstoppet.
    const prick = (o, i) => {
      const kant = o.x < 0.24 ? 'v' : o.x > 0.76 ? 'h' : '';
      const mening = `${o.k.namn}, ${kr(o.v)}, signerad ${o.datum}. Ackumulerat ${kr(o.ack)}. Öppna affären.`;
      return `<li class="ob-ig-order" data-ob-order data-x="${o.x.toFixed(4)}" data-y="${o.y1.toFixed(4)}" data-y0="${o.y0.toFixed(4)}" data-v="${Math.round(o.v)}"${o.mi === basta ? ' data-basta' : ''} style="--x:${o.x.toFixed(4)};--y:${o.y1.toFixed(4)};--y0:${o.y0.toFixed(4)};--i:${i}">
          <a class="ob-ig-prick" href="#/affar/${e(o.a.id)}" data-ob-pil tabindex="${i === ordrar.length - 1 ? 0 : -1}" aria-label="${e(mening)}"${kant ? ` data-kant="${kant}"` : ''}>
            <span class="ob-ig-tips" aria-hidden="true"><b>${e(o.datum)}</b><strong>${e(kr(o.v))}</strong><span>${e(o.k.namn)}</span><small>${e(o.a.titel)} · ackumulerat ${e(krKort(o.ack))}</small></span></a>
          <span class="ob-ig-etikett" aria-hidden="true"><b>${e(krKort(o.v))}</b><small>${e(o.k.namn)}</small></span></li>`;
    };

    // Månadsaxeln: kolumnerna lika breda som månaderna är långa (samma skala som trappan). Månader utan order: en prick.
    const dagar = man.map((q) => new Date(q.ar, q.m + 1, 0).getDate());
    const axel = `<ol class="ob-ig-axel" aria-hidden="true" style="grid-template-columns:${dagar.map((x) => `minmax(0, ${x}fr)`).join(' ')}">${man.map((q, i) => {
      const har = ordrar.some((o) => o.mi === i); const arNu = q.ar === nu.getFullYear() && q.m === nu.getMonth();
      const attr = [har ? 'data-har' : '', i === basta ? 'data-basta' : '', arNu ? 'data-nu' : '', i && q.m === 0 ? 'data-arsskifte' : ''].filter(Boolean).join(' ');
      return `<li ${attr}><span class="ob-ig-mlang">${e(q.namn)}</span><span class="ob-ig-mkort">${e(q.namn.charAt(0).toUpperCase())}</span>${i === 0 || q.m === 0 ? `<small>${q.ar}</small>` : ''}</li>`;
    }).join('')}</ol>`;
    const tomma = man.filter((q, i) => !ordrar.some((o) => o.mi === i)).map(obManNamn);

    // Insikten: räknad ur samma ordrar – takten (andelen de senaste 90 dagarna mot en jämn takt på ~25 %) och bästa månaden.
    // De 90 dagarna är markerade i grafen (ob-ig-p90), så att meningen går att se.
    const d90 = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 90);
    const andel90 = tot ? sum(ordrar.filter((o) => o.d >= d90).map((o) => o.v)) / tot : 0;
    const senast = ordrar[ordrar.length - 1]; const sedan = senast ? -dagarTill(lokalISO(senast.d)) : null;
    const bq = basta >= 0 ? man[basta] : null;
    const bastaText = bq ? ` Bästa månaden var ${obManNamn(bq)}${bq.ar !== nu.getFullYear() ? ` ${bq.ar}` : ''} med ${krKort(bq.varde)}.` : '';
    const sedanText = sedan === 0 ? 'idag' : sedan === 1 ? 'igår' : `för ${plural(sedan, 'dag', 'dagar')} sedan`;
    const [ton, rubrik, text] = andel90 >= 0.45 ? ['upp', 'Tempot ökar', `${pct(andel90)} av intäkterna kom de senaste 90 dagarna.`]
      : andel90 < 0.12 && sedan != null && sedan <= 30 ? ['jamn', 'Ny order', `Senaste ordern signerades ${sedanText} – ${pct(andel90)} av intäkterna kom de senaste 90 dagarna.`]
      : andel90 < 0.12 ? ['ner', 'Tempot har sjunkit', `${andel90 ? `Bara ${pct(andel90)}` : 'Inget'} av intäkterna kom de senaste 90 dagarna – senaste ordern signerades ${sedanText}.`]
        : ['jamn', 'Jämn takt', `${pct(andel90)} av intäkterna kom de senaste 90 dagarna.`];
    const insikt = tot ? `<p class="ob-ig-insikt" data-ton="${ton}"><b class="ob-ig-trend">${ik('pil')}${rubrik}<span class="sr">.</span></b><span>${e(text)}${e(bastaText)}</span>${ton === 'ner' ? `<a class="kortlank" href="#/salj">Säljtavlan${ik('pil')}</a>` : ''}</p>` : '';

    // Smal yta: ordrarna som en lista (nyast först) i stället för etiketter i grafen
    const MAX_LISTA = 5; const lista = [...ordrar].reverse();
    const listaHtml = tot ? `<ol class="ob-ig-lista">${lista.slice(0, MAX_LISTA).map((o) => `<li${o.mi === basta ? ' data-basta' : ''}><a class="ob-ig-rad" href="#/affar/${e(o.a.id)}"><span class="ob-ig-rad-datum">${e(o.kort)}</span><span class="ob-ig-rad-namn"><b>${e(o.k.namn)}</b><small>${e(o.a.titel)}</small></span><strong>${e(krKort(o.v))}</strong></a></li>`).join('')}</ol>
        ${lista.length > MAX_LISTA ? `<p class="ob-ig-lista-fler">+ ${plural(lista.length - MAX_LISTA, 'äldre order', 'äldre ordrar')} i grafen</p>` : ''}` : '';

    const tomt = tot ? '' : `<div class="ob-ig-tom">${emo(UPEMO.sak.vunnet, { ruta: 'l', ton: 'mint' })}<span><strong>Inga signerade ordrar de senaste 12 månaderna</strong>Linjen stiger när en affär flyttas till Order signerad.</span><a class="knapp knapp-kontur knapp-liten" href="#/salj">Till säljtavlan</a></div>`;
    const html = `${insikt}
        <div class="ob-ig${tot ? '' : ' ob-ig-utan'}" data-rorelse>
          ${rutnat}
          <div class="ob-ig-yta" data-ob-ig-yta data-idag="${idagX.toFixed(4)}" style="--idag:${idagX.toFixed(4)};--slut-y:${yAv(tot).toFixed(4)}">
            ${tot ? `<i class="ob-ig-p90" aria-hidden="true" style="--fran:${xAv(d90).toFixed(4)}"><span class="ob-ig-p90-bricka"><span class="ob-ig-p90-lang">90 dagar</span><span class="ob-ig-p90-kort">90 d</span></span></i>` : ''}${svg}
            ${tot ? `<i class="ob-ig-nu" aria-hidden="true"><span>idag</span></i>` : ''}
            <ol class="ob-ig-ordrar" aria-label="Signerade ordrar ${e(`${man[0].namn} ${man[0].ar} – ${man[n - 1].namn} ${man[n - 1].ar}`)}">${ordrar.map(prick).join('')}</ol>${tomt}
          </div>
          ${axel}
          ${tomma.length && tot ? `<p class="sr">Månader utan signerade ordrar: ${e(tomma.join(', '))}.</p>` : ''}
        </div>${listaHtml}`;
    return { html, tot, antal: ordrar.length, snitt: ordrar.length ? tot / ordrar.length : 0 };
  };
  // Grafens ordrar är en tabbstopp: pilarna (och Home/End) flyttar fokus mellan ordrarna, Enter öppnar affären
  vy.addEventListener('keydown', (ev) => {
    const k = ev.target.closest && ev.target.closest('[data-ob-pil]'); if (!k || ev.target !== k || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const alla = $$('[data-ob-pil]', k.closest('ol')); const i = alla.indexOf(k);
    const steg = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    const mal = ev.key === 'Home' ? 0 : ev.key === 'End' ? alla.length - 1 : steg ? Math.max(0, Math.min(alla.length - 1, i + steg)) : -1;
    if (mal < 0) return;
    ev.preventDefault(); alla.forEach((x, j) => { x.tabIndex = j === mal ? 0 : -1; }); alla[mal].focus();
  });
  // Etiketterna placeras när grafen har mått (vid varje storleksändring och när typsnitten har laddats): största ordern först.
  // En etikett får ALDRIG ligga över en knopp, en stapel, linjen, "idag", 90-dagarsbandets bricka/kant eller en annan etikett –
  // den står med luft till vänster om knoppen, snett ovanför eller till höger ovanför. Får hela etiketten (värde + kund) inte
  // plats prövas bara värdet (kunden står i detaljkortet och skärmläsartexten); annars visas ingen etikett – ordern finns ändå
  // som stapel med detaljkort (och i listan på smal yta). Etiketten förankras i den kant som vetter mot knoppen (right/bottom),
  // så att den växer bort från knoppen om bredden ändras. Allt räknas ur layouten (offset*), inte getBoundingClientRect –
  // kortet kan luta i sin 3D-entré.
  let obGrafRo = null;
  function startaObGraf() {
    if (obGrafRo) { obGrafRo.disconnect(); obGrafRo = null; }
    const yta = $('[data-ob-ig-yta]', vy); if (!yta) return;
    let tick = false;
    const placera = () => {
      tick = false;
      if (!yta.isConnected) { if (obGrafRo) obGrafRo.disconnect(); return; }
      const W = yta.clientWidth, H = yta.clientHeight; if (!W || !H) return;
      // knoppens radie: (stapelbredd + 7) / 2 + ringen 2,5 px (--ob-bw är registrerad som längd i sidor.css); LUFT runt
      // knopp och stapel (en etikett står aldrig tätt intill en annan orders knopp), MARG mot linjen och GAP mellan knoppen och
      // dess egen etikett (GAP > LUFT, annars stänger den egna knoppen lägena bredvid sig)
      const bw = parseFloat(getComputedStyle(yta).getPropertyValue('--ob-bw')) || 10;
      const r = bw / 2 + 6; const LUFT = 10; const MARG = 7; const GAP = 11;
      const ordrar = $$('[data-ob-order]', yta).map((li) => ({ x: +li.dataset.x * W, y: +li.dataset.y * H, y0: +li.dataset.y0 * H, v: +li.dataset.v, et: $('.ob-ig-etikett', li) }));
      // linjens nivå med knoppens bredd som marginal: helt nådd före x (lägsta punkten i ett spann) och påbörjad före x (högsta)
      const nadd = (x) => ordrar.reduce((y, o) => (o.x + r <= x ? Math.min(y, o.y) : y), H);
      const paborjad = (x) => ordrar.reduce((y, o) => (o.x - r < x ? Math.min(y, o.y) : y), H);
      // hinder: varje knopp (med ring) och varje stapel från knoppen till foten
      const hinder = ordrar.flatMap((o) => [{ L: o.x - r - LUFT, R: o.x + r + LUFT, T: o.y - r - LUFT, B: o.y + r + LUFT },
        { L: o.x - bw / 2 - LUFT, R: o.x + bw / 2 + LUFT, T: o.y, B: Math.max(o.y0, o.y + r) + 2 }]);
      // "idag": brickan nederst och den streckade linjen från slutnivån ned till axeln
      const idagX = +yta.dataset.idag * W;
      const nu = $('.ob-ig-nu span', yta); if (nu && nu.offsetWidth) hinder.push({ L: idagX - nu.offsetWidth / 2 - 4, R: idagX + nu.offsetWidth / 2 + 4, T: H - nu.offsetHeight - 12, B: H });
      if ($('.ob-ig-nu', yta)) hinder.push({ L: idagX - 7, R: idagX + 7, T: (parseFloat(yta.style.getPropertyValue('--slut-y')) || 0) * H - 8, B: H });
      // 90-dagarsbandet: brickan och kantens nedre del (kanten tonas ut uppåt, se sidor.css)
      const p90 = $('.ob-ig-p90', yta);
      if (p90) {
        const x = (parseFloat(p90.style.getPropertyValue('--fran')) || 0) * W; hinder.push({ L: x - 3, R: x + 3, T: H * 0.66, B: H });
        const b = $('.ob-ig-p90-bricka', p90); if (b && b.offsetWidth) hinder.push({ L: x + b.offsetLeft - 4, R: x + b.offsetLeft + b.offsetWidth + 4, T: b.offsetTop - 4, B: b.offsetTop + b.offsetHeight + 4 });
        // Trångt (smalt kort, kort band): "idag"-brickan skulle täcka "90 d" – då står bara strecket och pricken för idag kvar
        // (bandet slutar idag). Brickan döljs med visibility, så att den går att mäta vid nästa placering.
        yta.toggleAttribute('data-trangt', !!(nu && nu.offsetWidth && b && b.offsetWidth && x + b.offsetLeft + b.offsetWidth + 4 > idagX - nu.offsetWidth / 2));
      }
      const krock = (a, b) => a.L < b.R && b.L < a.R && a.T < b.B && b.T < a.B;
      // linjen genom etikettens spann: från dess lägsta till högsta punkt (vågräta delar + steget i varje knopp)
      const overLinjen = (b) => paborjad(b.R) - MARG < b.B && nadd(b.L) + MARG > b.T;
      const fri = (b) => b.L >= 0 && b.R <= W && b.T >= -14 && b.B <= H - 6 && !hinder.some((x) => krock(b, x)) && !overLinjen(b);
      [...ordrar].sort((p, q) => q.v - p.v).forEach((o) => {
        const et = o.et; if (!et) return;
        et.style.left = et.style.right = et.style.top = et.style.bottom = '';
        if (!et.offsetWidth) { et.setAttribute('data-dold', ''); return; } // dold på smal yta (listan tar över)
        // hela etiketten och bara värdet
        et.removeAttribute('data-kompakt'); const hel = [et.offsetWidth, et.offsetHeight];
        et.setAttribute('data-kompakt', ''); const kompakt = [et.offsetWidth, et.offsetHeight];
        const lagen = ([w, h]) => [
          ['v', o.x - r - GAP - w, o.y - h / 2], // till vänster, mitt för knoppen (ytan ovanför linjen är tom)
          ['v', o.x - r - GAP - w, o.y - h + 4], // till vänster, lite högre
          ['ov', o.x + r - w, o.y - r - GAP - h], // snett ovanför till vänster
          ['o', o.x - w / 2, o.y - r - GAP - h], // rakt ovanför
          ['h', o.x + r + GAP, o.y - r - GAP - h + 6], // till höger ovanför
        ].map(([s, l, t]) => ({ s, L: l, R: l + w, T: t, B: t + h }));
        let val = lagen(hel).find(fri); let kort = false;
        if (!val) { val = lagen(kompakt).find(fri); kort = !!val; }
        et.toggleAttribute('data-kompakt', kort);
        et.toggleAttribute('data-dold', !val);
        if (!val) return;
        // förankring i kanten mot knoppen: vänster om knoppen → right, ovanför → bottom
        if (val.s === 'h' || val.s === 'o') et.style.left = `${val.L.toFixed(1)}px`; else et.style.right = `${(W - val.R).toFixed(1)}px`;
        if (val.s === 'v') et.style.top = `${val.T.toFixed(1)}px`; else et.style.bottom = `${(H - val.B).toFixed(1)}px`;
        et.dataset.sida = val.s;
        hinder.push({ L: val.L - 4, R: val.R + 4, T: val.T - 2, B: val.B + 2 });
      });
      yta.setAttribute('data-placerad', '');
    };
    placera();
    // Typsnitten (Google Fonts, display=swap) kan komma efter första placeringen – då ändras etiketternas bredd: placera om
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (yta.isConnected) placera(); });
    if ('ResizeObserver' in window) { obGrafRo = new ResizeObserver(() => { if (!tick) { tick = true; requestAnimationFrame(placera); } }); obGrafRo.observe(yta); }
  }

  // Klubbmotorn: var pengarna står. Summan till klubbarna (intjänat) med samma typografi som Intäkternas tal och EN stapel
  // under: det intjänade delat efter status – utbetalt, att betala, upplupet (Klubbmotorns myntfärger, samma ordning som
  // klubbarnas staplar och rader) – fram till en markerad gräns ("Intjänat | Prognos"), och prognosen efter gränsen som en
  // tunnare, randig förlängning. Under stapeln en ruta per status som har pengar (Att betala står alltid när något är intjänat –
  // "inget väntar" är också ett besked). Att betala är en länk till klubbens provision i Klubbmotorn (betala = { klubbId,
  // etikett }, bara sälj). Ingen provision alls (t.ex. skarp start): en mening i stället för stapel och rutor.
  // delar = [{ s, namn, varde, under }] i OBK_STATUS-ordning (under = text); under/tomText = färdig HTML (anroparen kör e()).
  const OBK_STATUS = [['utbetald', 'Utbetalt', 'utbetalt'], ['att-betala', 'Att betala', 'attBetala'], ['upplupen', 'Upplupet', 'upplupen'], ['prognos', 'I prognos', 'prognos']];
  const obKlubbPengar = (delar, summa, under, { betala = null, tomText = '' } = {}) => {
    const tal = `<dl class="ob-ig-tal obk-tal"><div><dt>Till klubbarna</dt><dd class="ob-ig-tal-varde" data-tal="${e(summa)}" data-format="kr">${kr(summa)}</dd><dd class="ob-ig-tal-under">${under}</dd></div></dl>`;
    const prognos = sum(delar.filter((x) => x.s === 'prognos').map((x) => x.varde));
    if (!summa && !prognos) return `${tal}<p class="obk-tom" data-s="prognos"><i class="obk-mynt" aria-hidden="true"></i><span>${tomText}</span></p>`;
    // Stapeln: två kolumner i proportion (minst så breda som sina etiketter) – det intjänade och prognosen
    const seg = delar.filter((x) => x.s !== 'prognos' && x.varde > 0).map((x, i) => `<i data-s="${e(x.s)}" style="flex-grow:${obTal((x.varde / summa) * 1000)};--i:${i}"></i>`).join('');
    const kol = (v) => `minmax(4.4rem, ${obTal((v / (summa + prognos)) * 1000)}fr)`;
    const stapel = `<div class="obk-total"${summa && prognos ? ' data-delad' : ''} aria-hidden="true" style="grid-template-columns:${[summa ? kol(summa) : '', prognos ? kol(prognos) : ''].filter(Boolean).join(' ')}">
          ${summa ? `<span class="obk-total-fyll">${seg}</span>` : ''}${prognos ? '<span class="obk-total-prognos"><i data-s="prognos"></i></span>' : ''}
          ${prognos ? `${summa ? '<span class="obk-total-etikett">Intjänat</span>' : ''}<span class="obk-total-etikett" data-prognos>Prognos</span>` : ''}</div>`;
    const ruta = (x) => {
      const lank = x.s === 'att-betala' && x.varde > 0 && betala;
      const namn = `<i class="obk-mynt" aria-hidden="true"></i>${e(x.namn)}`;
      return `<li data-s="${e(x.s)}"${x.varde ? '' : ' data-noll'}${lank ? ' data-lank' : ''}>${lank ? `<a class="obk-status-namn" href="#/klubbmotorn" data-ob-betala="${e(betala.klubbId)}" aria-label="${e(betala.etikett)}">${namn}</a>` : `<span class="obk-status-namn">${namn}</span>`}<strong>${kr(x.varde)}</strong><small>${e(x.under)}</small>${lank ? `<span class="obk-status-pil" aria-hidden="true">${ik('pil')}</span>` : ''}</li>`;
    };
    const visas = delar.filter((x) => x.varde > 0 || (x.s === 'att-betala' && summa > 0));
    return `${tal}${stapel}
        <ul class="obk-status" aria-label="Provisionen efter status">${visas.map(ruta).join('')}</ul>`;
  };
  // Att betala (statusrutan och klubbradens Betala) → Klubbmotorn, som rullar till klubbens provision och lägger fokus på
  // "Markera utbetald" (samma flöde som klubbkortets Nästa steg, G['kb-visa-betala']). Engångsflagga: sätts vid klicket
  // (vanligt klick, inte ny flik) och används vid nästa vägbyte – efter att Klubbmotorn har ritats.
  let obBetalaKlubb = null;
  vy.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[data-ob-betala]');
    obBetalaKlubb = a && ev.button === 0 && !(ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) ? a.dataset.obBetala : null;
  });
  addEventListener('hashchange', () => {
    const id = obBetalaKlubb; obBetalaKlubb = null;
    if (id && location.hash === '#/klubbmotorn') requestAnimationFrame(() => { if (location.hash === '#/klubbmotorn') G['kb-visa-betala']({ dataset: { klubb: id } }); });
  });
  function visaOversikt() {
    const mig = anv(jag); const arTest = mig.roll === 'test';
    if (mig.roll === 'admin' && ADM && ADM.oversikt) return ADM.oversikt();
    const nu = new Date();
    const [halsning, dygnEmo] = halsningNu(nu.getHours());
    const oppna = db.affarer.filter(arOppen);
    const iAr = String(nu.getFullYear());
    const vunna = db.affarer.filter((a) => a.steg === 'signerad');
    const vunnaIAr = vunna.filter((a) => String(a.stegAndrad).startsWith(iAr));
    const vunna90 = vunna.filter((a) => -dagarTill(a.stegAndrad) <= 90);
    const aktivaProj = db.projekt.filter((p) => p.steg !== 'klar');
    const attGranska = aktivaProj.filter((p) => p.steg === 'underlag' && p.underlagStatus === 'ny');
    const attBoka = aktivaProj.filter((p) => p.steg === 'bokning');
    const tester14 = aktivaProj.filter((p) => p.steg === 'test' && p.testdatum && dagarTill(p.testdatum) >= 0 && dagarTill(p.testdatum) <= 14);
    const avstamning = aktivaProj.filter((p) => p.steg === 'avstamning');
    const allaKb = db.affarer.map(kickback).filter(Boolean);
    const kbTotalt = sum(allaKb.filter((x) => x.status !== 'prognos').map((x) => x.belopp));
    const pipe = sum(oppna.map(affarVarde)); const vikt = viktad(db.affarer);
    const vunnetIAr = sum(vunnaIAr.map(affarVarde));
    const man = manadsData();
    // Sparklinjen gäller samma period som värdet: innevarande år
    let ackAr = 0; const ackIAr = man.filter((m) => m.ar === nu.getFullYear()).map((m) => (ackAr += m.varde));
    // Din dag: mina öppna att göra de närmaste 7 dagarna (och de utan datum) – alla, listan har egen "Visa alla"
    const koTodos = db.todos.filter((t) => !t.klar && t.ansvarig === jag && (!t.datum || dagarTill(t.datum) <= 7)).sort((a, b) => String(a.datum || '9').localeCompare(String(b.datum || '9')));
    // Frånvaro, ansökningar och beslut (typ 'franvaro', ledning.js) hör inte till teamets tidslinje – de syns bara för personen och ledningen
    const senaste = [...db.aktiviteter].filter((x) => x.typ !== 'franvaro').sort((a, b) => (a.tid < b.tid ? 1 : -1)).slice(0, 7);
    const forfallna = db.todos.filter((t) => !t.klar && t.ansvarig === jag && t.datum && dagarTill(t.datum) < 0).length;
    const idagTodos = db.todos.filter((t) => !t.klar && t.ansvarig === jag && t.datum && dagarTill(t.datum) <= 0).length;
    const kundNamnP = (p) => (kund(p.kundId) || {}).namn || 'Kunden';

    // Kräver åtgärd – med skäl (emoji), vems del och en kort åtgärd
    const larm = [];
    // slag/kundId/affarId: översikten slår ihop larm med att göra för samma kund och flyttar säljlägen till "Sälj vidare"
    if (forfallna) larm.push({ slag: 'forfallen', cls: 'rod', emo: UPEMO.larm.forfallen, agare: 'mig', rubrik: forfallna === 1 ? '1 förfallen uppgift' : `${forfallna} förfallna uppgifter`, text: forfallna === 1 ? 'Ta hand om den eller flytta datumet.' : 'Ta hand om dem eller flytta datumen.', href: '#/att-gora', pill: 'Öppna' });
    db.projekt.filter((p) => p.underlagStatus === 'returnerat').forEach((p) => larm.push({ slag: 'retur', kundId: p.kundId, affarId: p.affarId, cls: 'rod', emo: UPEMO.larm.retur, agare: 'salj', rubrik: `Underlag returnerat: ${kundNamnP(p)}`, text: p.returKommentar || 'Testteamet behöver komplettering.', href: `#/projekt/${p.id}`, pill: 'Komplettera' }));
    Object.entries(db.kundlankar || {}).forEach(([t, l]) => { const a = affar(l.affarId); if (l.status === 'inskickad' && !l.sparrad && a && a.offert.underlag !== t && arOppen(a)) { const sm = summeraUnderlag(l); larm.push({ slag: 'inne', kundId: l.kundId, affarId: l.affarId, cls: 'navy', emo: UPEMO.larm.inne, agare: 'salj', rubrik: `Kundunderlag inskickat: ${kundNamn(l.kundId)}`, text: `${plural(sm.antal, 'deltagare', 'deltagare')} · preliminärt ${krKort(sm.total)}`, href: `#/affar/${l.affarId}`, pill: 'Öppna' }); } });
    db.kunder.forEach((k) => { const l = omtestLage(k.id); if (l && l.typ && !l.oppen) larm.push({ slag: 'lage', kundId: k.id, projektId: l.p.id, typ: l.typ, manader: l.manader, offert: affar(l.p.affarId).offert, cls: 'is', emo: l.typ === 'omtest' ? UPEMO.larm.omtest : UPEMO.larm.uppfoljning, agare: 'salj', rubrik: `${l.typ === 'omtest' ? 'Dags för omtest' : 'Läge för uppföljning'}: ${k.namn}`, text: `${l.manader} månader sedan testet – sälj vidare från kundkortet`, href: `#/kund/${k.id}`, pill: 'Följ upp' }); });
    attGranska.forEach((p) => larm.push({ slag: 'granska', kundId: p.kundId, cls: 'gul', emo: UPEMO.larm.granska, agare: 'test', rubrik: `Underlag att granska: ${kundNamnP(p)}`, text: 'Kontrollera att allt finns innan tid bokas.', href: `#/projekt/${p.id}`, pill: 'Granska' }));
    attBoka.forEach((p) => larm.push({ slag: 'boka', kundId: p.kundId, cls: 'navy', emo: UPEMO.proj.bokning, agare: 'test', bara: 'test', rubrik: `Boka testdag: ${kundNamnP(p)}`, text: p.underlag && p.underlag.period ? `Önskemål: ${p.underlag.period}` : 'Ring kontaktpersonen och boka en dag.', href: `#/projekt/${p.id}`, pill: 'Boka' }));
    avstamning.forEach((p) => larm.push({ slag: 'avstamning', kundId: p.kundId, cls: 'gul', emo: UPEMO.proj.avstamning, agare: 'test', bara: 'test', rubrik: `Avstämning: ${kundNamnP(p)}`, text: 'Stäm av genomfört mot beställt.', href: `#/projekt/${p.id}`, pill: 'Öppna' }));
    db.projekt.filter((p) => p.steg === 'slutfaktura').forEach((p) => larm.push({ slag: 'slutfaktura', kundId: p.kundId, affarId: p.affarId, cls: 'navy', emo: UPEMO.larm.slutfaktura, agare: 'salj', rubrik: `Skicka slutfaktura: ${kundNamnP(p)}`, text: 'Avstämningen är klar.', href: `#/projekt/${p.id}`, pill: 'Öppna' }));
    allaKb.filter((x) => x.status === 'att-betala').forEach((x) => larm.push({ slag: 'provision', kundId: x.klubb.id, cls: 'orange', emo: UPEMO.larm.provision, agare: 'salj', rubrik: `Provision att betala: ${x.klubb.namn}`, text: `${kr(x.belopp)} · ${UTBETALNING[x.klubb.klubbavtal.form] || ''}`, href: '#/klubbmotorn', pill: 'Betala', betala: x.klubb.id }));
    oppna.filter((a) => -dagarTill(a.stegAndrad) >= 14).forEach((a) => larm.push({ slag: 'still', kundId: a.kundId, affarId: a.id, cls: 'gul', emo: UPEMO.larm.still, agare: 'salj', rubrik: `Ingen rörelse på ${-dagarTill(a.stegAndrad)} dagar: ${kundNamn(a.kundId)}`, text: a.titel, href: `#/affar/${a.id}`, pill: 'Följ upp' }));
    // Testteamet ser sin egen del (och sina egna att göra). Sälj ser allt, men testteamets del är märkt.
    const synligaLarm = larm.filter((l) => (arTest ? l.agare === 'test' || l.agare === 'mig' : l.bara !== 'test'))
      .sort((a, b) => (LARM_ORDNING[a.cls] ?? 3) - (LARM_ORDNING[b.cls] ?? 3));
    const delFor = (agare) => {
      if (agare === 'mig' || agare === (arTest ? 'test' : 'salj')) return ['Din del', 'din'];
      if (agare === 'kund') return ['Kundens del', 'kund'];
      return agare === 'test' ? ['Testteamet', 'test'] : ['Sälj', 'salj'];
    };
    // Ett säljlarm på en annan säljares affär är inte ditt: det står under "Väntar på andra" med säljarens namn på brickan
    // (och lyfts aldrig till "Börja här" med fel ringknapp)
    const agareAv = (l) => { const a = l.affarId ? affar(l.affarId) : null; return a && a.ansvarig && a.ansvarig !== jag ? a.ansvarig : null; };
    const egen = (l) => delFor(l.agare)[1] === 'din' && !agareAv(l);
    const larmRad = (l) => { const annan = delFor(l.agare)[1] === 'din' ? agareAv(l) : null; const [del, dc] = annan ? [anv(annan).kort, 'salj'] : delFor(l.agare); return `<a class="larm larm-${l.cls}" href="${e(l.href)}"${l.betala ? ` data-ob-betala="${e(l.betala)}"` : ''}>${emo(l.emo, { ruta: 'l', ton: { rod: 'rod', gul: 'gul', orange: 'orange', is: 'is' }[l.cls] || '' })}<span class="larm-text"><strong>${e(l.rubrik)}</strong><small>${e(l.text)}</small></span><span class="larm-hoger"><span class="del-bricka" data-del="${dc}">${e(del)}</span><span class="larm-pill">${e(l.pill || 'Öppna')}${ik('pil')}</span></span></a>`; };

    const staplar = SALJSTEG.filter((s) => s.id !== 'signerad').map((s) => { const af = oppna.filter((a) => a.steg === s.id); return { id: s.id, namn: s.namn, varde: sum(af.map(affarVarde)), antal: af.length }; })
      .concat([{ id: 'vunnet', namn: 'Vunnet 90 d', varde: sum(vunna90.map(affarVarde)), antal: vunna90.length }]);
    const projSteg = PROJSTEG.filter((s) => s.id !== 'klar');
    const klubbData = klubbar().filter((k) => k.klubbavtal).map((k) => { const st = klubbStat(k); return { k, varde: st.utbetalt + st.attBetala + st.upplupen, intro: st.introducerade }; });
    const kbSumma = sum(klubbData.map((d) => d.varde));
    const trattSteg = SALJSTEG.filter((s) => s.id !== 'signerad');
    const nastaTest = aktivaProj.filter((p) => p.testdatum && dagarTill(p.testdatum) >= 0 && projStegIndex(p.steg) <= projStegIndex('test')).sort((a, b) => (a.testdatum < b.testdatum ? -1 : 1))[0];
    // Nyckeltalen som 3D-hjälten visade i en egen ruta samlas här – en uppsättning, inget står två gånger (samma regler som scen-oversikt.js)
    const minaOppna = oppna.filter((a) => a.ansvarig === jag); const minaVarde = sum(minaOppna.map(affarVarde));
    const forlorade = db.affarer.filter(raknasForlorad).length;
    const vinstgrad = vunna.length + forlorade ? vunna.length / (vunna.length + forlorade) : NaN;
    const dygn = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const tider = vunna.map((a) => { const s0 = tolka(a.skapad), s1 = tolka(a.stegAndrad); return s0 && s1 ? Math.max(0, Math.round((dygn(s1) - dygn(s0)) / 864e5)) : null; }).filter((x) => x != null);
    const tidTillOrder = tider.length ? Math.round(sum(tider) / tider.length) : null;
    const viaKlubbAndel = pipe ? sum(oppna.filter((a) => (kund(a.kundId) || {}).viaKlubb).map(affarVarde)) / pipe : NaN;
    const deltagare = sum(oppna.map((a) => { const o = a.offert || {}; return Array.isArray(o.deltagare) && o.deltagare.length ? o.deltagare.length : +o.antal || 0; }));
    const basta = man.reduce((b, m) => (m.varde > (b ? b.varde : 0) ? m : b), null);
    const namnLista = (lista) => lista.slice(0, 2).map(kundNamnP).join(', ') + (lista.length > 2 ? ` +${lista.length - 2}` : '');
    // Nyckelremsan: hjältens nyckeltal i EN glasremsa – tunna avdelare, en kort rad per tal och små grafer (mätare, kurva,
    // projektstapel) i stället för lösa kort. Ingen siffra upprepas i sammanfattningen ovanför.
    const matare = (andel, text = '') => `<span class="nr-matare"><i style="--andel:${Math.max(0, Math.min(1, isFinite(andel) ? andel : 0)).toFixed(3)}" aria-hidden="true"></i>${text ? `<small>${text}</small>` : ''}</span>`;
    const remsa = (poster) => `<div class="nyckelremsa" data-nyckelremsa data-antal="${poster.length}">${poster.map((p) => `<a class="nr-post${p.ton ? ` nr-${p.ton}` : ''}" href="${e(p.href)}"><span class="nr-etikett">${emo(p.emo, { ruta: 's' })}<span>${e(p.etikett)}</span></span><strong class="nr-varde"${p.tal != null ? ` data-tal="${e(p.tal)}" data-format="${e(p.format || 'antal')}"` : ''}>${p.visa}</strong><span class="nr-under">${p.under}</span>${p.mikro || ''}</a>`).join('')}</div>`;
    const projStapel = `<span class="segmentstapel" aria-hidden="true">${projSteg.map((s, i) => { const n = aktivaProj.filter((p) => p.steg === s.id).length; return n ? `<i style="flex:${n};background:${AGARFARG[s.agare]};--i:${i}" title="${e(s.namn)}: ${n}"></i>` : ''; }).join('') || '<i style="flex:1;background:rgba(255,255,255,.12)"></i>'}</span>`;
    const saljRemsa = remsa([
      { emo: UPEMO.sak.pipeline, etikett: 'Öppen pipeline', href: '#/salj', tal: pipe, format: 'krkort', visa: krKort(pipe), under: `${plural(oppna.length, 'affär', 'affärer')}${deltagare ? ` · ${deltagare} deltagare` : ''}`, mikro: matare(pipe ? minaVarde / pipe : 0, `Dina ${krKort(minaVarde)}`) },
      { emo: UPEMO.sak.vunnet, etikett: 'Vunnet i år', href: '#/salj', tal: vunnetIAr, format: 'krkort', visa: krKort(vunnetIAr), under: plural(vunnaIAr.length, 'signerad order', 'signerade ordrar'), mikro: `<span class="nr-graf"${basta ? ` title="Bästa månad: ${e(basta.namn)} ${basta.ar} · ${e(krKort(basta.varde))}"` : ''}>${sparkline(ackIAr.length > 1 ? ackIAr : [0, ...ackIAr], 160, 26)}</span>` },
      { emo: UPEMO.sak.konvertering, etikett: 'Vinstgrad', href: '#/salj', visa: pct(vinstgrad), under: `${vunna.length} ${vunna.length === 1 ? 'vunnen' : 'vunna'} · ${forlorade} ${forlorade === 1 ? 'förlorad' : 'förlorade'} totalt`, mikro: matare(vinstgrad) },
      { emo: UPEMO.sak.vantar, etikett: 'Tid till order', href: '#/salj', visa: tidTillOrder != null ? `${tidTillOrder}<small> d</small>` : '–', under: 'snitt från ny affär till signerad order' },
      { emo: UPEMO.sak.projekt, etikett: 'Projekt', href: '#/projekt', tal: aktivaProj.length, visa: aktivaProj.length, under: attGranska.length ? `${plural(attGranska.length, 'underlag', 'underlag')} att granska` : 'pågår · inga underlag väntar', mikro: projStapel },
      { emo: UPEMO.sak.provision, etikett: 'Till klubbarna', href: '#/klubbmotorn', ton: 'orange', tal: kbTotalt, format: 'krkort', visa: krKort(kbTotalt), under: isFinite(viaKlubbAndel) ? `${pct(viaKlubbAndel)} av pipelinen via klubb` : 'provision enligt klubbavtalen', mikro: isFinite(viaKlubbAndel) ? matare(viaKlubbAndel) : '' },
    ]);
    const testRemsa = remsa([
      { emo: UPEMO.proj.underlag, etikett: 'Att granska', href: '#/projekt', tal: attGranska.length, visa: attGranska.length, under: attGranska.length ? e(namnLista(attGranska)) : 'Inget väntar på granskning' },
      { emo: UPEMO.proj.bokning, etikett: 'Att boka', href: '#/projekt', tal: attBoka.length, visa: attBoka.length, under: attBoka.length ? e(namnLista(attBoka)) : 'Alla tester är bokade' },
      { emo: UPEMO.proj.test, etikett: 'Tester inom 14 dagar', href: '#/projekt', tal: tester14.length, visa: tester14.length, under: tester14.length ? e(tester14.slice(0, 2).map((p) => `${kundNamnP(p)} ${datumText(p.testdatum, { gemen: true })}`).join(', ')) : 'Inga tester de närmaste två veckorna' },
      { emo: UPEMO.proj.avstamning, etikett: 'Avstämning', href: '#/projekt', tal: avstamning.length, visa: avstamning.length, under: avstamning.length ? e(namnLista(avstamning)) : 'Inget att stämma av' },
    ]);
    const kortLank = (href, text) => `<a class="kortlank" href="${e(href)}">${e(text)}${ik('pil')}</a>`;
    // Ring-länkar (tel:) bara för sälj – testteamet ringer via projektsidan
    const telNr = (pk) => e(String(pk.tel).replace(/[^\d+]/g, ''));
    const ringLank = (k) => { if (arTest) return ''; const pk = primarKontakt(k); if (!pk || !pk.tel) return ''; return `<a class="ob-ring" href="tel:${telNr(pk)}" aria-label="Ring ${e(pk.namn)}, ${e(pk.tel)}" title="Ring ${e(pk.namn)} · ${e(pk.tel)}">${ik('samtal')}</a>`; };
    const ringKnapp = (k) => { if (arTest) return ''; const pk = primarKontakt(k); if (!pk || !pk.tel) return ''; return `<a class="knapp knapp-kontur" href="tel:${telNr(pk)}" aria-label="Ring ${e(pk.namn)}, ${e(pk.tel)}" title="${e(pk.tel)}">${ik('samtal')}Ring ${e(String(pk.namn || '').trim().split(/\s+/)[0])}</a>`; };

    // ── 02 Affärer: topplistan – de öppna affärer som är värda mest just nu (värde × chans; testteamet: chansen att vinna) ──
    const hetKalla = arTest ? oppna.filter((a) => a.steg === 'offert' || a.steg === 'underlag') : (ovUi.hetAlla || !minaOppna.length ? oppna : minaOppna);
    const hetPoang = (a) => (arTest ? sannolikhet(a).p : affarVarde(a) * sannolikhet(a).p);
    const heta = [...hetKalla].sort((x, y) => hetPoang(y) - hetPoang(x)).slice(0, 5);
    // Larmet "står still" döljs för affärer i topplistan – räknat ur en fast lista (egna, annars teamets), så att växeln inte ändrar Din dag
    const hetFast = arTest ? hetKalla : (minaOppna.length ? minaOppna : oppna);
    const hetIds = new Set([...hetFast].sort((x, y) => hetPoang(y) - hetPoang(x)).slice(0, 5).map((a) => a.id));
    const visaAgare = arTest || hetKalla === oppna;
    const lagen = arTest ? [] : synligaLarm.filter((l) => l.slag === 'lage');

    // ── 01 Din dag: att göra och larm i EN lista. Förfallna står redan som rader, säljlägen i "Sälj vidare" och en affär som står
    // still syns som chip i topplistan – inget visas två gånger. Ett larm för samma kund som en uppgift hängs på uppgiften.
    let koLarm = synligaLarm.filter((l) => l.slag !== 'forfallen' && l.slag !== 'lage' && !(l.slag === 'still' && hetIds.has(l.affarId)));
    const VIKBARA = ['retur', 'inne', 'still', 'slutfaktura'];
    const orsaker = new Map();
    koLarm = koLarm.filter((l) => {
      if (!VIKBARA.includes(l.slag) || !egen(l) || !l.kundId) return true;
      const t = koTodos.find((x) => x.kundId === l.kundId);
      if (!t) return true;
      if (!orsaker.has(t.id)) orsaker.set(t.id, []);
      orsaker.get(t.id).push(l);
      return false;
    });
    const TON_RANG = { rod: 0, orange: 1, gul: 2, navy: 3, is: 3, andra: 4 };
    const tonRang = (t) => TON_RANG[t] ?? 4;
    const GRUPPER = [['bradskande', 'Brådskande', UPEMO.grupp.forfallna], ['idag', 'Idag', UPEMO.grupp.idag], ['kommande', 'Kommande', UPEMO.grupp.kommande], ['vantar', 'Väntar på andra', UPEMO.sak.vantar]];
    const todoTon = (t) => (!t.datum ? 'andra' : dagarTill(t.datum) < 0 ? 'rod' : dagarTill(t.datum) === 0 ? 'gul' : 'is');
    const poster = [
      ...koTodos.map((t) => {
        const os = orsaker.get(t.id) || [];
        const ton = [todoTon(t), ...os.map((l) => l.cls)].reduce((a, b) => (tonRang(b) < tonRang(a) ? b : a));
        const d = t.datum ? dagarTill(t.datum) : 99;
        return { typ: 'todo', t, os, ton, grupp: d < 0 || os.some((l) => l.cls === 'rod') ? 'bradskande' : d === 0 ? 'idag' : 'kommande', nyckel: 't:' + t.id };
      }),
      ...koLarm.map((l) => ({ typ: 'larm', l, os: [], ton: l.cls, grupp: !egen(l) ? 'vantar' : l.cls === 'rod' ? 'bradskande' : 'idag', nyckel: `l:${l.slag}:${l.kundId || ''}:${l.rubrik}` })),
    ];
    // Sortering: grupp → samtal före andra uppgifter före larm → ton → datum (stabil, så larmens inbördes ordning står kvar)
    poster.forEach((p) => { p.ordning = [GRUPPER.findIndex(([id]) => id === p.grupp), p.typ === 'todo' ? (todoTyp(p.t.text)[2] === 'Samtal' ? 0 : 1) : 2, tonRang(p.ton), p.typ === 'todo' ? String(p.t.datum || '9') : '']; });
    poster.sort((x, y) => { for (let i = 0; i < x.ordning.length; i++) { if (x.ordning[i] < y.ordning[i]) return -1; if (x.ordning[i] > y.ordning[i]) return 1; } return 0; });
    const forsta = poster.find((p) => p.grupp !== 'vantar') || null; // lyfts till hjältens "Börja här"
    const koVisas = poster.filter((p) => p !== forsta);
    const MAX_KO = 8;
    const koSynliga = ovUi.allaLarm ? koVisas : koVisas.slice(0, MAX_KO);
    // "Saker som kräver åtgärd" = larmen i listan. Ett larm som hängts på en uppgift räknas inte en gång till – uppgiften står redan
    // bland "uppgifter idag". Gruppernas räknare tar med "Börja här" (den står som pekarrad i sin grupp), så meningen och listan går ihop.
    const antalAtgard = poster.filter((p) => p.grupp !== 'vantar' && p.typ === 'larm').length;
    const prick = poster.some((p) => p.grupp === 'bradskande');
    const fokusNy = !!forsta && !!ovUi.fokusId && ovUi.fokusId !== forsta.nyckel;
    ovUi.fokusId = forsta ? forsta.nyckel : null;

    // En mening om dagen – räknad ur samma poster som listan. Finns inget att göra står beskedet EN gång: i fokuskortet.
    const dagMening = !forsta ? '' : idagTodos
      ? `${forfallna === idagTodos
          ? `Du har ${plural(forfallna, 'förfallen uppgift', 'förfallna uppgifter')}`
          : `Du har ${plural(idagTodos, 'uppgift', 'uppgifter')} idag${forfallna ? `, varav ${forfallna} ${forfallna === 1 ? 'förfallen' : 'förfallna'}` : ''}`}${antalAtgard ? ` – och ${plural(antalAtgard, 'sak', 'saker')} till kräver åtgärd.` : '.'}`
      : `Inga uppgifter förfaller idag${antalAtgard ? ` – ${plural(antalAtgard, 'sak', 'saker')} kräver åtgärd.` : ' och inget brådskar.'}`;
    // Testteamet: antalet projekt står i Din dag-huvudet. Nästa test nämns bara när det ligger mer än 14 dagar bort (annars står
    // det i remsan) och inte när det redan är fokuskortet.
    const testFokus = arTest && !forsta && nastaTest ? nastaTest : null;
    const sammanfattning = arTest
      ? [forsta && nastaTest && dagarTill(nastaTest.testdatum) > 14 ? `Nästa test ${e(datumText(nastaTest.testdatum, { gemen: true }))} hos ${e(kundNamnP(nastaTest))}.` : '', !nastaTest ? 'Inget test bokat ännu.' : '', e(dagMening)].filter(Boolean).join(' ')
      : e(dagMening);

    // Hjältens fokuskort "Börja här": dagens första drag med sina knappar
    const TON_EMO = { rod: 'rod', gul: 'gul', orange: 'orange', is: 'is' };
    const fokusOgon = (tid, rubrik = 'Börja här') => `<p class="ob-fokus-ogon"><i class="ob-fokus-puls" aria-hidden="true"></i><span>${e(rubrik)}</span>·<span class="ob-fokus-tid">${e(tid)}</span></p>`;
    const fokusTid = (iso) => { if (!iso) return 'utan datum'; const d = dagarTill(iso); return d < 0 ? `förfallen ${plural(-d, 'dag', 'dagar')}` : d === 0 ? 'idag' : dagText(iso); };
    const fokusHtml = (() => {
      // Testteamet utan något på listan: nästa bokade test är dagens fokus (i stället för "Allt är under kontroll")
      if (testFokus) {
        const p = testFokus; const a = affar(p.affarId); const d = dagarTill(p.testdatum);
        return `<div class="ob-fokus" data-ton="is">${fokusOgon(d === 0 ? 'idag' : d === 1 ? 'imorgon' : `om ${plural(d, 'dag', 'dagar')}`, 'Nästa test')}
            <div class="ob-fokus-rad">${emo(UPEMO.proj.test, { ruta: 'l', ton: 'is' })}<div class="ob-fokus-text"><strong>${e(kundNamnP(p))}</strong><small>${e(datumText(p.testdatum))}${a ? ` · ${e(a.titel)}` : ''}</small></div></div>
            <div class="ob-fokus-knappar"><a class="knapp knapp-accent" href="#/projekt/${e(p.id)}">Öppna projektet${ik('pil')}</a></div></div>`;
      }
      if (!forsta) {
        return `<div class="ob-fokus" data-ton="mint" data-tom>
            <div class="ob-fokus-rad">${emo(UPEMO.sak.tomt, { ruta: 'l', ton: 'mint' })}<div class="ob-fokus-text"><strong>Allt är under kontroll</strong><small>Inget som väntar på dig de närmaste dagarna.</small></div></div>
            <div class="ob-fokus-knappar">${arTest ? kortLank('#/projekt', 'Projekten') : `<button class="knapp knapp-accent" type="button" data-g="ny-affar" data-steg="kontakt">${ik('plus')}Ny affär</button>${kortLank('#/salj', 'Säljtavlan')}`}</div></div>`;
      }
      const ny = fokusNy ? ' data-ny' : '';
      if (forsta.typ === 'todo') {
        const t = forsta.t; const k = t.kundId ? kund(t.kundId) : null; const d = t.datum ? dagarTill(t.datum) : null;
        const tid = fokusTid(t.datum);
        const knappar = [
          `<button class="knapp knapp-accent" type="button" data-g="todo-klar" data-id="${e(t.id)}">${ik('bock')}Klar</button>`,
          ...forsta.os.map((l) => `<a class="knapp knapp-kontur" href="${e(l.href)}">${e(l.pill || 'Öppna')}${ik('pil')}</a>`),
          k ? ringKnapp(k) : '',
          d != null && d <= 0 ? `<button class="knapp knapp-spok ob-fokus-skjut" type="button" data-g="todo-skjut" data-id="${e(t.id)}" title="Ändrar bara datumet">${ik('kalender')}Skjut till imorgon</button>` : '',
        ].join('');
        return `<div class="ob-fokus" data-ton="${e(forsta.ton)}"${ny}>${fokusOgon(tid)}
            <div class="ob-fokus-rad">${emo(todoTyp(t.text)[1], { ruta: 'l', ton: TON_EMO[forsta.ton] || '' })}<div class="ob-fokus-text"><strong>${e(t.text)}</strong>${k ? `<a class="ob-fokus-kund" href="#/kund/${e(k.id)}">${e(k.namn)}</a>` : ''}</div></div>
            ${forsta.os.slice(0, 2).map((l) => `<p class="ob-fokus-orsak" data-ton="${e(l.cls)}">${emo(l.emo)}<span>${e(l.rubrik)} – ${e(l.text)}</span></p>`).join('')}
            <div class="ob-fokus-knappar">${knappar}</div></div>`;
      }
      const l = forsta.l; const k = l.kundId ? kund(l.kundId) : null;
      // "Underlag returnerat: Fjällgren Konsult AB" → rubriken och kunden på var sin rad (kunden som länk), skälet i en egen ruta
      const kolon = l.rubrik.indexOf(': '); const rub = kolon > 0 ? l.rubrik.slice(0, kolon) : l.rubrik; const vem = kolon > 0 ? l.rubrik.slice(kolon + 2) : '';
      const vemHtml = vem ? (k ? `<a class="ob-fokus-kund" href="#/kund/${e(k.id)}">${e(vem)}</a>` : `<span class="ob-fokus-kund">${e(vem)}</span>`) : '';
      return `<div class="ob-fokus" data-ton="${e(forsta.ton)}"${ny}>${fokusOgon(l.cls === 'rod' ? 'brådskande' : 'kräver åtgärd')}
          <div class="ob-fokus-rad">${emo(l.emo, { ruta: 'l', ton: TON_EMO[forsta.ton] || '' })}<div class="ob-fokus-text"><strong>${e(rub)}</strong>${vemHtml}</div></div>
          ${l.text ? `<p class="ob-fokus-beskr">${e(l.text)}</p>` : ''}
          <div class="ob-fokus-knappar"><a class="knapp knapp-accent" href="${e(l.href)}"${l.betala ? ` data-ob-betala="${e(l.betala)}"` : ''}>${e(l.pill || 'Öppna')}${ik('pil')}</a>${l.slag !== 'provision' && k ? ringKnapp(k) : ''}</div></div>`;
    })();

    // Listans rader: att göra (med ringknapp för samtal och larmet som orsaksrad) och larm (samma rad som förut)
    const radHtml = (p) => {
      if (p.typ === 'larm') return `<li class="ob-rad ob-rad-larm" data-ton="${e(p.l.cls)}">${larmRad(p.l)}</li>`;
      const t = p.t; const k = t.kundId ? kund(t.kundId) : null;
      const ring = k && todoTyp(t.text)[2] === 'Samtal' ? ringLank(k) : '';
      const os = p.os.map((l) => `<a class="ob-orsak" data-ton="${e(l.cls)}" href="${e(l.href)}">${emo(l.emo, { ruta: 's' })}<span><strong>${e(l.rubrik)}</strong> ${e(l.text)}</span><span class="larm-pill">${e(l.pill || 'Öppna')}${ik('pil')}</span></a>`).join('');
      return `<li class="ob-rad" data-ton="${e(p.ton)}">${todoRad(t)}${ring}${os}</li>`;
    };
    // "Börja här" står i hjälten – i listan står den som en pekarrad först i sin grupp (knappen rullar upp till fokuskortet).
    // Då är listan komplett och gruppernas räknare stämmer med meningen. En tom lista blir en låg rad (beskedet står i fokuskortet).
    const pekarRad = (p) => `<li class="ob-rad ob-rad-pekare" data-ton="${e(p.ton)}"><button class="ob-pekare" type="button" data-g="ob-hopp" data-mal="fokus" title="Visa i Börja här">
        <span class="ob-pekare-pil" aria-hidden="true">${ik('pil')}</span><span class="ob-pekare-text"><b>Börja här</b><span>${e(p.typ === 'todo' ? p.t.text : p.l.rubrik)}</span></span>
        <span class="ob-pekare-visa">Visa${ik('pil')}</span></button></li>`;
    const grupperHtml = GRUPPER.filter(([id]) => (forsta && forsta.grupp === id) || koSynliga.some((p) => p.grupp === id)).map(([id, namn, ikon]) => `<section class="ob-grupp" data-grupp="${id}" aria-labelledby="ob-g-${id}">
        <h4 class="ob-grupp-namn" id="ob-g-${id}">${emo(ikon)}${namn}<span class="sr">, </span><span class="rakna">${poster.filter((p) => p.grupp === id).length}</span></h4>
        <ul class="ob-rader">${forsta && forsta.grupp === id ? pekarRad(forsta) : ''}${koSynliga.filter((p) => p.grupp === id).map(radHtml).join('')}</ul></section>`).join('');
    const listaHtml = poster.length
      ? `<div class="ob-ko">${grupperHtml}</div>${koVisas.length > MAX_KO ? `<button class="knapp knapp-spok knapp-liten larm-alla" type="button" data-g="larm-alla">${ovUi.allaLarm ? 'Visa färre' : `Visa alla (${poster.length})`}</button>` : ''}`
      : '';
    const nyTodoKnapp = `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="snabb" data-flik="todo">${ik('plus')}Ny att göra</button>`;

    // Teamets senaste aktivitet som en tidslinje grupperad per dag (raderna är desamma som förut)
    const aktDag = (x) => { const d = -dagarTill(lokalISO(new Date(x.tid))); return d <= 0 ? 'Idag' : d === 1 ? 'Igår' : d <= 6 ? 'Senaste veckan' : 'Tidigare'; };
    // Under Idag/Igår står klockslaget (dagen står redan i gruppnamnet), annars den relativa tiden
    const aktKl = (x) => new Date(x.tid).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const aktTid = (x, n) => (n === 'Idag' || n === 'Igår' ? aktKl(x) : n === 'Senaste veckan' ? `${new Date(x.tid).toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')} ${aktKl(x)}` : datumText(lokalISO(new Date(x.tid))));
    const aktRad = (x, n) => { const k = kund(x.kundId); const tid = aktTid(x, n); return `<a class="lank-rad akt-rad ob-akt-rad" href="#/kund/${e(x.kundId)}"><span class="akt-avatar">${avatar(x.av)}<span class="akt-bricka" data-typ="${e(UPEMO.akt[x.typ] ? x.typ : 'system')}" aria-hidden="true">${ik(UPEMO.akt[x.typ] || UPEMO.akt.system)}</span></span><span class="lank-rad-text"><strong>${e(k ? k.namn : '')}</strong><small><b class="akt-typ" data-typ="${e(UPEMO.akt[x.typ] ? x.typ : 'system')}">${e(AKT_TYP[x.typ] || 'Händelse')}</b>${e(x.text)}</small><small class="akt-tid-mobil">${e(tid)}</small></span><span class="lank-rad-hoger akt-tid"><small>${e(tid)}</small></span></a>`; };
    const aktGrupper = []; senaste.forEach((x) => { const n = aktDag(x); if (!aktGrupper.length || aktGrupper[aktGrupper.length - 1][0] !== n) aktGrupper.push([n, []]); aktGrupper[aktGrupper.length - 1][1].push(x); });
    const tidslinjeHtml = senaste.length
      ? aktGrupper.map(([n, xs]) => `<section class="ob-dag-grupp"><h4 class="ob-dagnamn">${n}</h4><div class="ob-akt">${xs.map((x) => aktRad(x, n)).join('')}</div></section>`).join('')
      : tom('Ingen aktivitet ännu. Samtal, möten och anteckningar på kunder och affärer visas här.', { emo: UPEMO.akt.anteckning, knapp: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="snabb" data-flik="anteckning">${ik('plus')}Logga en aktivitet</button>` });

    // Säljtratten som en klickbar stegskena (samma färger som 3D-tratten): värde, antal och viktat per steg + vunnet 90 d.
    // Summan av stegens viktade värde = Viktad pipeline i huvudet.
    const OB_FARG = { kontakt: '#3d86e0', besok: '#30a8e8', offert: '#22c6d8', underlag: '#2fd8b0', vunnet: '#7ee0c3' };
    // Sista stationen leder till säljtavlans kolumn Order signerad – som en väg in: antalet stort, värdet litet. Beloppen för
    // vunnet står stort i remsan (i år) och i Resultat (12 mån), så sidan har inte tre stora "vunnet"-tal med olika perioder.
    const stationer = [...trattSteg.map((s) => { const af = oppna.filter((a) => a.steg === s.id); return { id: s.id, salj: s.id, namn: s.namn, antal: af.length, varde: sum(af.map(affarVarde)), viktat: viktad(af) }; }),
      { id: 'vunnet', salj: 'signerad', namn: 'Vunnet 90 d', antal: vunna90.length, varde: sum(vunna90.map(affarVarde)) }]; // samma namn som i 3D-tratten
    const maxSt = Math.max(1, ...stationer.map((s) => s.varde));
    const stationHtml = (s, i) => {
      const vunnet = s.id === 'vunnet'; const antal = vunnet ? plural(s.antal, 'order', 'ordrar') : plural(s.antal, 'affär', 'affärer');
      // Testteamet: offert och underlag (det som snart blir projekt) står ut, övriga steg tonas ned
      const dov = arTest && s.id !== 'offert' && s.id !== 'underlag';
      return `<a class="ob-steg${dov ? ' ob-steg-dov' : ''}" href="#/salj" data-salj-steg="${e(s.salj)}" style="--i:${i};--andel:${(s.varde / maxSt).toFixed(3)};--farg:${OB_FARG[s.id]}" aria-label="${e(s.namn)}: ${antal}, ${e(kr(s.varde))} – öppna i säljtavlan">
          <span class="ob-steg-topp">${vunnet ? `<b class="ob-steg-nr ob-steg-trofe">${emo(UPEMO.salj.signerad)}</b>` : `<b class="ob-steg-nr">${i + 1}</b>`}<span class="ob-steg-namn">${e(s.namn)}</span></span>
          ${vunnet ? `<strong class="ob-steg-varde"><span data-tal="${e(s.antal)}" data-format="antal">${s.antal}</span><small> ${s.antal === 1 ? 'order' : 'ordrar'}</small></strong>`
            : `<strong class="ob-steg-varde" data-tal="${e(s.varde)}" data-format="krkort">${krKort(s.varde)}</strong>`}
          <small>${vunnet ? `${krKort(s.varde)} i ordervärde` : `${antal} · viktat ${krKort(s.viktat)}`}</small>
          <i class="ob-steg-matare" aria-hidden="true"><i></i></i></a>`;
    };
    // Tid i steget i klartext ("5 d i steget"); från 14 dagar säljtavlans "står still"-chip (ersätter larmet för affären).
    // I steget Ny kontakt säger nästa steg redan dagarna ("… – 9 dagar sedan kontakt") – då står ingen chip till.
    const hetAlder = (a, d) => (d >= 14 ? chipAlder(d) : a.steg === 'kontakt' && d >= 7 ? ''
      : `<span class="chip chip-alder ${d <= 3 ? 'chip-ok' : 'chip-is'}" title="${d < 1 ? 'Flyttad hit idag' : `${d} dagar i steget`}">${emo(UPEMO.sak.vantar)}${d < 1 ? 'Sedan idag' : `${d} d i steget`}</span>`);
    const hetRad = (a, i) => {
      const k = kund(a.kundId) || { namn: 'Kunden' }; const sn = sannolikhet(a); const ns = nastaSteg(a); const d = -dagarTill(a.stegAndrad); const v = affarVarde(a); const p = Math.round(sn.p * 100);
      const steg = (SALJSTEG.find((s) => s.id === a.steg) || {}).namn || a.steg;
      return `<li class="ob-het-rad"${i === 0 ? ' data-forst' : ''} style="--i:${i}">
          <span class="ob-het-nr" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <span class="sannolikhet" data-niva="${sannNiva(sn.p)}" style="--p:${p}" title="Chans att vinna: ${p} %\n${e(sn.skal.join('\n'))}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="spar" cx="18" cy="18" r="15.9"/><circle class="fyll" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b>${p}<small aria-hidden="true">%</small></b><span class="sr"> procents chans att vinna</span></span>
          <a class="ob-het-lank" href="#/affar/${e(a.id)}"><strong>${e(k.namn)}</strong><small>${e(a.titel)} · ${e(steg)}${visaAgare ? ` · ${e(anv(a.ansvarig).kort)}` : ''}</small></a>
          <span class="ob-het-nasta">${ns ? `<span class="ob-nasta${ns.varm ? ' varm' : ''}${ns.klar ? ' klar' : ''}">${ns.emo ? emo(ns.emo) : ik(ns.ikon)}<span>${e(ns.text)}</span></span>` : ''}${hetAlder(a, d)}</span>
          <span class="ob-het-varde"><strong>${kr(v)}</strong><small>viktat ${krKort(v * sn.p)}</small></span>
          ${arTest ? '' : ringLank(k)}</li>`;
    };
    const vaxel = !arTest && minaOppna.length > 0 && minaOppna.length < oppna.length
      ? `<button class="ob-vaxel" type="button" data-g="ob-het"${ovUi.hetAlla ? ' data-team' : ''}>${ovUi.hetAlla ? `Visa mina (${minaOppna.length})` : `Visa teamets (${oppna.length})`}</button>` : '';
    const lageHtml = (l) => `<article class="ob-lage"><p class="ob-lage-ogon">${emo(l.typ === 'omtest' ? UPEMO.sak.omtest : UPEMO.sak.uppfoljning)}${l.typ === 'omtest' ? 'Dags för omtest' : 'Läge för uppföljning'}</p>
        <a class="ob-lage-kund" href="#/kund/${e(l.kundId)}">${e(kundNamn(l.kundId))}</a>
        <p class="ob-lage-text">${e(l.manader)} mån sedan testet · ${e(paketFordelning(l.offert))}</p>
        <div class="ob-lage-knappar"><button class="knapp knapp-accent knapp-liten" type="button" data-g="spinn" data-projekt="${e(l.projektId)}" data-typ="${l.typ === 'uppfoljning' ? 'coaching' : 'omtest'}">${ik('plus')}${l.typ === 'uppfoljning' ? 'Skapa coaching' : 'Skapa omtest'}</button>${ringLank(kund(l.kundId))}</div></article>`;
    // Testteamets "Pågående projekt": vem som har bollen just nu (stegens ägare) – inte samma tal som remsan
    const projHos = (() => { const n = { test: 0, kontroll: 0, salj: 0 }; aktivaProj.forEach((p) => { const s = PROJSTEG.find((x) => x.id === p.steg); if (s && n[s.agare] != null) n[s.agare] += 1; });
      return [n.test ? `${n.test} hos testteamet` : '', n.kontroll ? `${n.kontroll} i kontroll` : '', n.salj ? `${n.salj} hos sälj` : ''].filter(Boolean).join(' · ') || 'inga pågående'; })();

    // ── 03 Resultat: intäkterna (obIntaktGraf – vattenfallet med en stapel per order och en uträknad insikt) och Klubbmotorn
    // (obKlubbPengar – var pengarna står). Summan till klubbarna står överst och stapeln under delar upp den efter status
    // (utbetalt, att betala, upplupet + prognosen) – en uppdelning, ingen dubblett av remsans tal. Regeln står som underrad.
    // Intäkternas tal gäller samma tolv månader som grafen (summan och snittordern räknas ur grafens ordrar). Kortens huvuden har
    // var sin väg vidare: Intäkter → säljtavlans kolumn Order signerad (data-salj-steg), Klubbmotorn → Klubbmotorn.
    const resPeriod = `${man[0].namn} ${man[0].ar} – ${man[man.length - 1].namn} ${man[man.length - 1].ar}`;
    const resGraf = obIntaktGraf(man);
    // Testteamet har inte säljets remsa (där "Vunnet i år" står) – här står årets del som underrad till 12-månaderssumman
    // (innevarande år ligger alltid inom de tolv månaderna), inte som ett tredje, nästan likadant tal
    const resVarav = !arTest || !vunnetIAr ? '' : vunnetIAr >= resGraf.tot - 0.5 ? ' · alla i år'
      : ` · varav <a class="ob-dd-lank" href="#/salj" data-tal="${e(vunnetIAr)}" data-format="kr">${kr(vunnetIAr)}</a> i år`;
    const resProcentLista = [...new Set(klubbData.map((d) => +d.k.klubbavtal.procent).filter((x) => isFinite(x)))].sort((a, b) => a - b);
    const pText = (x) => x.toLocaleString('sv-SE');
    const resProcent = resProcentLista.length > 1 ? `${pText(resProcentLista[0])}–${pText(resProcentLista[resProcentLista.length - 1])}&nbsp;%`
      : `${pText(resProcentLista.length ? resProcentLista[0] : Math.round(KLUBBMOTORN.provision * 100))}&nbsp;%`;
    const resKlubbar = klubbData.map((d) => ({ ...d, st: klubbStat(d.k) }));
    const resSumma = (f) => sum(resKlubbar.map((x) => x.st[f]));
    // En rad per klubb: det som ska betalas först, sedan störst belopp. Stapeln delar klubbens provision efter status (samma
    // skala för alla klubbar, prognosen randig) och raden säger läget i klartext. Att betala → Klubbmotorn (sälj betalar ut).
    const resSkala = Math.max(1, ...resKlubbar.map((x) => x.varde + x.st.prognos));
    const resOrdning = [...resKlubbar].sort((a, b) => (b.st.attBetala > 0) - (a.st.attBetala > 0) || b.varde - a.varde || b.st.prognos - a.st.prognos);
    // Statusrutorna: belopp och vad som händer härnäst. Att betala lyser (orange) och är en länk för sälj – till den klubb som
    // står först (samma ordning som raderna). Testteamet ser beloppet men inte uppmaningen: det är säljs uppgift.
    const resN = (s) => allaKb.filter((x) => x.status === s).length;
    const resForst = resOrdning.find((x) => x.st.attBetala > 0);
    const STATUS_UNDER = { utbetald: 'hittills', 'att-betala': resN('att-betala') ? `${plural(resN('att-betala'), 'provision', 'provisioner')} väntar${arTest ? ' · sälj betalar ut' : ''}` : 'inget väntar',
      upplupen: 'betalas efter slutfaktura', prognos: plural(resN('prognos'), 'öppen affär', 'öppna affärer') };
    const resDelar = OBK_STATUS.map(([s, namn, falt]) => ({ s, namn, varde: resSumma(falt), under: STATUS_UNDER[s] }));
    const resAttBetala = resSumma('attBetala');
    const resBetala = !arTest && resForst ? { klubbId: resForst.k.id, etikett: `Att betala: ${kr(resAttBetala)}${resN('att-betala') > 1 ? ` – ${plural(resN('att-betala'), 'provision', 'provisioner')}, först ${resForst.k.namn}` : ` till ${resForst.k.namn}`} – visa i Klubbmotorn` } : null;
    const resIntro = resSumma('introducerade');
    const resTom = `<strong>Ingen provision ännu.</strong> ${resIntro ? `${e(plural(resIntro, 'företag', 'företag'))} introducerade via klubbarna – provisionen` : 'Provisionen'} börjar räknas vid första ordern via en klubb.`;
    // Regeln står som underrad till summan – då står korten i linje: rubrik, ögonrad, stort tal (som Intäkter)
    const resPengar = obKlubbPengar(resDelar, kbSumma, `intjänad provision · <span title="Provisionen går till klubben som introducerade kunden">${resProcent} av ordervärdet</span>`, { betala: resBetala, tomText: resTom });
    const obkRad = (x, i) => {
      const { k, st } = x; const form = (UTBETALNING[k.klubbavtal.form] || '').toLowerCase();
      // samma ordning som stapeln och statusrutorna: utbetalt, att betala, upplupet
      const delar = [['utbetald', st.utbetalt, 'utbetalt'], ['att-betala', st.attBetala, 'att betala'], ['upplupen', st.upplupen, 'upplupet']].filter(([, v]) => v > 0);
      const status = st.attBetala ? 'att-betala' : st.upplupen ? 'upplupen' : st.utbetalt ? 'utbetald' : st.prognos ? 'prognos' : 'tom';
      const lage = delar.length > 1 ? delar.map(([, v, t]) => `${kr(v)} ${t}`).join(' · ')
        : st.attBetala ? `Att betala${form && k.klubbavtal.form !== 'oklart' ? ` · ${form}` : ''}`
          : st.upplupen ? 'Upplupet · betalas efter slutfaktura' : st.utbetalt ? 'Allt utbetalt'
            : st.prognos ? `${krKort(st.prognos)} i prognos · ${plural(st.dialog, 'företag', 'företag')} i dialog`
              : st.introducerade ? `${plural(st.introducerade, 'företag', 'företag')} introducerade · inga affärer ännu` : 'Inga företag introducerade ännu';
      const seg = [['utbetald', st.utbetalt], ['att-betala', st.attBetala], ['upplupen', st.upplupen], ['prognos', st.prognos]].filter(([, v]) => v > 0)
        .map(([s, v]) => `<i data-s="${s}" style="width:${((v / resSkala) * 100).toFixed(2)}%"></i>`).join('');
      // en klubb utan provision och prognos får ingen tom stapel – läget står i texten
      return `<li class="obk-rad" data-status="${status}" style="--i:${i}">
          <span class="obk-marke" aria-hidden="true">${e(initialer(k.namn))}</span>
          <span class="obk-namn"><a class="obk-lank" href="#/kund/${e(k.id)}">${e(k.namn)}</a><small>${e(lage)}</small></span>
          <span class="obk-hoger"><strong class="obk-belopp">${kr(x.varde)}</strong>${st.attBetala && !arTest ? `<a class="obk-betala" href="#/klubbmotorn" data-ob-betala="${e(k.id)}" aria-label="Betala ${e(kr(st.attBetala))} till ${e(k.namn)} i Klubbmotorn">Betala${ik('pil')}</a>` : ''}</span>
          ${seg ? `<span class="obk-stapel" aria-hidden="true"><span class="obk-fyll">${seg}</span></span>` : ''}</li>`;
    };
    queueMicrotask(startaObGraf); // grafens etiketter placeras när ytan har mått

    queueMicrotask(startaObNav); // sektionsmenyn: observatörerna startas om efter varje omritning
    return `
      <section class="hero3d" data-hero3d data-rorelse>
        <div class="hero3d-text">
          <span class="hero3d-datum"><i class="live" aria-hidden="true"></i><span class="hd-dag">${e(nu.toLocaleDateString('sv-SE', { weekday: 'long' }))}</span> <span class="hd-datum">${e(nu.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' }))}</span><span class="hd-vecka"><span class="sr">, vecka ${veckonummer(nu)}</span><span aria-hidden="true"><span class="hd-v-lang">Vecka </span><span class="hd-v-kort">V </span>${veckonummer(nu)}</span></span></span>
          ${halsningHtml(halsning, mig.kort, dygnFas(nu.getHours()))}
          ${sammanfattning ? `<p class="hero3d-sammanfattning">${sammanfattning}</p>` : ''}
          ${fokusHtml}
        </div>
        <div class="hero3d-scen">${skylineHtml(staplar)}
          <div class="skyline-legend">${staplar.map((s) => `<span><i style="background:${STEGFARG[s.id][0]};color:${STEGFARG[s.id][0]}"></i>${e(s.namn)}</span>`).join('')}</div></div>
        ${arTest ? testRemsa : saljRemsa}
      </section>
      <div class="ob-nav-ram"><nav class="ob-nav" data-ob-nav aria-label="Översiktens delar">
        <i class="ob-nav-markor" aria-hidden="true"></i>
        <button class="ob-nav-topp" type="button" data-g="ob-hopp" data-mal="topp" aria-label="Till toppen" title="Till toppen"><svg class="ob-u" aria-hidden="true"><use href="#u-mark"/></svg></button>
        <button type="button" data-g="ob-hopp" data-mal="dag" aria-current="false">Din dag${prick ? '<i class="ob-nav-prick" aria-hidden="true"></i><span class="sr"> (något är brådskande)</span>' : ''}</button>
        <button type="button" data-g="ob-hopp" data-mal="affarer" aria-current="false">${arTest ? 'På väg' : 'Affärer'}</button>
        <button type="button" data-g="ob-hopp" data-mal="resultat" aria-current="false">Resultat</button>
      </nav></div>

      <section class="ob-sektion ob-dag" data-ob-sektion="dag" aria-labelledby="ob-h-dag">
        <header class="ob-huvud"><div class="ob-huvud-text">
            <p class="ob-ogon"><b class="ob-nr">01</b>Uppgifter och åtgärder</p>
            <h2 id="ob-h-dag" tabindex="-1">Din <em>dag</em></h2>
            <p class="ob-ingress">${poster.length ? 'Det brådskande står först. Bocka av direkt – listan sorterar om sig.' : 'Dina uppgifter de närmaste sju dagarna – och vad teamet har gjort senast.'}</p></div>
          ${arTest ? `<div class="ob-huvud-hoger"><a class="ob-matt" href="#/projekt"><span class="ob-matt-etikett">Pågående projekt</span><strong data-tal="${e(aktivaProj.length)}" data-format="antal">${aktivaProj.length}</strong><small>${e(projHos)}</small></a></div>` : ''}</header>
        <div class="ob-dag-rutnat${poster.length ? '' : ' ob-dag-tom'}">
          <section class="kort ob-kort ob-lista${poster.length ? '' : ' ob-lista-tom'}" aria-labelledby="ob-h-lista">
            <div class="ob-kort-huvud"><h3 id="ob-h-lista">${emo(UPEMO.sak.todo, { ruta: 'm' })}Din lista</h3>${poster.length ? '' : '<p class="ob-lista-tom-text">Inget på listan de närmaste sju dagarna – lägg till nästa sak när den dyker upp.</p>'}<div class="ob-kort-knappar">${kortLank('#/att-gora', 'Alla att göra')}${nyTodoKnapp}</div></div>
            ${listaHtml}</section>
          <section class="ob-team" aria-labelledby="ob-h-team">
            <div class="ob-kort-huvud"><h3 id="ob-h-team">${ik('klocka')}Senaste i teamet</h3></div>
            <div class="ob-tidslinje">${tidslinjeHtml}</div></section>
        </div></section>

      <section class="ob-sektion ob-band" data-ob-sektion="affarer" data-mork-yta aria-labelledby="ob-h-affarer">
        <header class="ob-huvud"><div class="ob-huvud-text">
            <p class="ob-ogon"><b class="ob-nr">02</b>${arTest ? 'Säljets pipeline' : 'Pipeline'}</p>
            <h2 id="ob-h-affarer" tabindex="-1">${arTest ? 'På <em>väg</em>' : '<em>Affärer</em>'}</h2>
            <p class="ob-ingress">${arTest ? 'Säljtratten – det som kan bli projekt hos er. Offert och underlag är närmast.' : 'Var teamets affärer står – klicka på ett steg för att öppna det i säljtavlan.'}</p></div>
          <div class="ob-huvud-hoger">
            ${arTest ? `<a class="ob-matt" href="#/salj"><span class="ob-matt-etikett">Öppen pipeline</span><strong data-tal="${e(pipe)}" data-format="krkort">${krKort(pipe)}</strong><small>${plural(oppna.length, 'affär', 'affärer')} hos sälj</small></a>` : ''}
            <div class="ob-matt" title="Viktning: grundsannolikhet per steg, justerad efter aktivitet, klubbkoppling och kundunderlag."><span class="ob-matt-etikett">Viktad pipeline</span><strong data-tal="${e(vikt)}" data-format="krkort">${krKort(vikt)}</strong><small>värde × chans att vinna</small></div>
            ${kortLank('#/salj', 'Säljtavlan')}</div></header>
        <p class="ob-stegrad-rubrik">Säljtratten · hela teamet</p>
        <nav class="ob-stegrad" data-rorelse aria-label="Säljtratten för hela teamet – öppna steget i säljtavlan">${stationer.map(stationHtml).join('')}</nav>
        <div class="ob-affar-rutnat${lagen.length ? '' : ' ob-utan-lagen'}">
          <section class="ob-het-yta" aria-labelledby="ob-h-het">
            <div class="ob-kort-huvud"><h3 id="ob-h-het">${emo(UPEMO.larm.viktat, { ruta: 'm' })}${arTest ? 'Snart projekt' : 'Hetaste affärerna'}</h3>${vaxel}<small class="ob-kort-not">${arTest ? 'Offert och underlag · sorterat på chansen att vinna' : `${hetKalla === oppna ? 'Teamets' : 'Dina'} öppna affärer · värde × chans`}</small></div>
            ${heta.length ? `<div class="ob-het-kolumner" aria-hidden="true"><span class="k-sann">Chans</span><span class="k-namn">Kund</span><span class="k-nasta">Nästa steg</span><span class="k-varde">Värde</span></div>
              <ol class="ob-het" data-rorelse${arTest ? ' data-utan-ring' : ''}>${heta.map(hetRad).join('')}</ol>`
              : arTest ? tom('Inga affärer i offert eller underlag just nu.') : tom('Inga öppna affärer just nu.', { emo: UPEMO.sak.pipeline, knapp: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="ny-affar" data-steg="kontakt">${ik('plus')}Ny affär</button>` })}</section>
          ${lagen.length ? `<section class="ob-lagen" aria-labelledby="ob-h-lagen"><div class="ob-kort-huvud"><h3 id="ob-h-lagen">${emo(UPEMO.sak.omtest, { ruta: 'm' })}Sälj vidare</h3></div><div class="ob-lage-lista">${lagen.map(lageHtml).join('')}</div></section>` : ''}
        </div></section>

      <section class="ob-sektion ob-band ob-resultat" data-ob-sektion="resultat" data-mork-yta aria-labelledby="ob-h-resultat">
        <header class="ob-huvud"><div class="ob-huvud-text">
            <p class="ob-ogon"><b class="ob-nr">03</b>Intäkter och provision</p>
            <h2 id="ob-h-resultat" tabindex="-1"><em>Resultat</em></h2>
            <p class="ob-ingress">Hur intäkterna har vuxit det senaste året – och var klubbarnas provision står.</p></div></header>
        <div class="ob-resultat-rutnat">
          <section class="kort ob-kort ob-intakt" aria-labelledby="ob-h-intakt">
            <div class="ob-kort-huvud"><h3 id="ob-h-intakt">${ik('trend')}Intäkter</h3><div class="ob-kort-knappar"><span class="ob-ig-period">${e(resPeriod)}</span><a class="kortlank" href="#/salj" data-salj-steg="signerad" title="Öppna kolumnen Order signerad">Säljtavlan${ik('pil')}</a></div></div>
            <dl class="ob-ig-tal">
              <div><dt>Senaste 12 månaderna</dt><dd class="ob-ig-tal-varde" data-tal="${e(resGraf.tot)}" data-format="kr">${kr(resGraf.tot)}</dd><dd class="ob-ig-tal-under">${plural(resGraf.antal, 'signerad order', 'signerade ordrar')}${resVarav}</dd></div>
              <div><dt>Snittorder</dt><dd class="ob-ig-tal-varde"${resGraf.antal ? ` data-tal="${e(resGraf.snitt)}" data-format="kr"` : ''}>${resGraf.antal ? kr(resGraf.snitt) : '–'}</dd><dd class="ob-ig-tal-under">per signerad order</dd></div></dl>
            ${resGraf.html}</section>
          <section class="kort ob-kort ob-klubb" aria-labelledby="ob-h-klubb">
            <div class="ob-kort-huvud"><h3 id="ob-h-klubb">${emo(UPEMO.sak.klubb, { ruta: 'm', ton: 'orange' })}Klubbmotorn</h3>${kortLank('#/klubbmotorn', 'Öppna')}</div>
            ${klubbData.length ? `<div class="ob-kl" data-rorelse${arTest ? ' data-test' : ''}>
              <div class="obk-pengar">${resPengar}</div>
              <div class="obk-klubbar"><p class="obk-rubrik">Per klubb</p><ul class="obk-lista">${resOrdning.map(obkRad).join('')}</ul></div></div>`
              : tom('Inga klubbavtal ännu. När en klubb har avtal syns provisionen per klubb här.', { emo: UPEMO.sak.klubb, ton: 'orange', knapp: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="snabb" data-flik="kund" data-typ="klubb">${ik('plus')}Registrera klubb</button><a class="knapp knapp-spok knapp-liten" href="#/klubbmotorn">Om Klubbmotorn</a>` })}</section>
        </div></section>
      <i class="ob-slut" data-ob-slut aria-hidden="true"></i>`;
  }

  /* 06-vyer: kunder -------------------------------------------------------------- */
  // Kundregistret (stil i sidor.css avsnitt 02). Hjälten: rubrik + "registret i en blick" (fördelningen är själva filtret: rutorna
  // och glasrörets delar, som på dator står i samma kolumner) och
  // sökraden i nederkanten. Listan: tabell på dator (en rad per kund, klick på hela raden), kort på mobilen.
  // kundUi.typ: alla | foretag | klubb (typ) · kund | prospekt | lead (status) · lage (omtest/uppföljning aktuellt).
  // Filter och sökning ritar bara om listan och räknaren (kundUppdatera) – hjälten står kvar, så övergångarna blir mjuka.
  const kundUi = { typ: 'alla', sok: '' };
  const kundLage = (k) => { const l = omtestLage(k.id); return l && l.typ && !l.oppen ? l : null; };
  const kundFilter = () => {
    const q = kundUi.sok.trim().toLowerCase(); const typ = kundUi.typ;
    return db.kunder.filter((k) => {
      if (typ === 'foretag' && k.typ !== 'foretag') return false;
      if (typ === 'klubb' && k.typ !== 'klubb') return false;
      if ((typ === 'kund' || typ === 'prospekt' || typ === 'lead') && kundStatus(k) !== typ) return false;
      if (typ === 'lage' && !kundLage(k)) return false;
      if (!q) return true;
      return [k.namn, k.bransch, k.stad, k.orgnr, ...(k.kontakter || []).map((c) => c.namn)].some((v) => String(v || '').toLowerCase().includes(q));
    }).map((k) => { const s = sistaAktivitet(k.id); return [k, String((s && s.tid) || k.skapad || '')]; })
      .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).map(([k]) => k);
  };
  const KUNDSEGMENT = { alla: 'Alla', foretag: 'Företag', klubb: 'Klubbar', kund: 'Kunder', prospekt: 'Prospekt', lead: 'Leads', lage: 'Omtest & uppföljning' };
  const KUNDEMO = { ...UPEMO.kundtyp, kund: UPEMO.sak.vunnet, prospekt: UPEMO.sak.pipeline, lage: UPEMO.sak.omtest };
  // Senaste aktiviteten kort och i samma form i hela kolumnen: Idag, Igår, 8 okt (året när det inte är i år)
  const kundSenast = (tid) => datumText(lokalISO(new Date(tid)));
  const krTom = '<span class="kr-tom" aria-label="Saknas">–</span>';
  // Senast i registret: senaste aktiviteten – eller när kunden lades till, om inget har hänt än (samma tid som listan sorteras på)
  const krSenast = (k) => { const s = sistaAktivitet(k.id); return s ? { tid: s.tid, typ: AKT_TYP[s.typ] || 'Händelse', ikon: AKT_IKON[s.typ] || 'system' } : k.skapad ? { tid: k.skapad, typ: 'Tillagd', ikon: 'plus' } : null; };
  // Kundens bricka i listan: initialerna i statusens färg (kund mint, prospekt is, lead sand, klubb orange) med en statusprick
  const krAva = (k) => `<span class="kr-ava" data-s="${e(kundStatus(k))}">${loggaRuta(k)}</span>`;
  const krLageText = (l) => (l.typ === 'omtest' ? 'Omtest aktuellt' : 'Läge för uppföljning');
  const krLageEmo = (l) => emo(l.typ === 'omtest' ? UPEMO.sak.omtest : UPEMO.sak.uppfoljning);
  // Klubbkopplingen som chip med texten i ett eget spann (så att långa klubbnamn får ellips i stället för att klippas)
  const krKlubb = (k) => {
    if (k.viaKlubb) { const kl = kund(k.viaKlubb); if (kl) return `<a class="chip chip-klubb kr-chip" href="#/kund/${e(kl.id)}" title="Introducerad av ${e(kl.namn)}">${ik('klubb')}<span>Via ${e(kl.namn)}</span></a>`; }
    if (k.klubbavtal) return `<span class="chip chip-klubb kr-chip">${ik('klubb')}<span>Klubbmotorn · ${e(k.klubbavtal.procent)} %</span></span>`;
    return '';
  };
  const kundRad = (k) => {
    const oppna = affarerFor(k.id).filter(arOppen); const varde = sum(oppna.map(affarVarde));
    const s = krSenast(k); const pk = primarKontakt(k); const l = kundLage(k);
    const fler = (k.kontakter || []).length - 1;
    const under = [k.bransch, k.stad].filter(Boolean).join(' · ');
    const kl = k.viaKlubb ? kund(k.viaKlubb) : null;
    const intro = k.klubbavtal ? db.kunder.filter((x) => x.viaKlubb === k.id).length : 0;
    const klubb = krKlubb(k);
    // Statuscellen: chip + läget (omtest/uppföljning). I den smala listan (ingen klubbkolumn) står klubbkopplingen också där.
    const statusUnder = [l ? `<span class="kr-lage" title="${e(krLageText(l))} · ${l.manader} månader sedan senaste testet">${krLageEmo(l)}<span>${l.typ === 'omtest' ? 'Omtest' : 'Uppföljning'}</span></span>` : '',
      kl ? `<span class="kr-via" title="Introducerad av ${e(kl.namn)}">${ik('klubb')}<span>${e(kl.namn)}</span></span>` : ''].join('');
    return `<tr data-href="#/kund/${e(k.id)}" class="kr-rad">
      <td class="kr-k-kund"><div class="kr-kund">${krAva(k)}<div class="kr-kund-text"><a class="kr-namn" href="#/kund/${e(k.id)}" title="${e(k.namn)}">${e(k.namn)}</a>
        <small class="kr-under" title="${e(under)}">${e(under) || '&nbsp;'}</small></div></div></td>
      <td class="kr-k-status"><div class="kr-chips">${statusChip(k)}</div>${statusUnder ? `<small class="kr-status-under${l ? ' kr-med-lage' : ''}">${statusUnder}</small>` : ''}</td>
      <td class="kr-k-klubb">${klubb ? `<div class="kr-chips">${klubb}</div>${k.klubbavtal ? `<small class="kr-under">${intro ? `${plural(intro, 'företag', 'företag')} introducerade` : 'Inga introducerade ännu'}</small>` : ''}` : krTom}</td>
      <td class="kr-k-kontakt">${pk ? `<div class="kr-pers"><span class="kr-pers-ava" aria-hidden="true">${e(initialer(pk.namn))}</span><div class="kr-pers-text"><span class="kr-text kr-kontakt" title="${e(pk.namn)}${fler > 0 ? ` (+${plural(fler, 'kontakt', 'kontakter')})` : ''}"><span>${e(pk.namn)}</span></span><small class="kr-under">${e(pk.roll || '') || (fler > 0 ? '' : '&nbsp;')}${fler > 0 ? `<em class="kr-fler">+${fler}</em>` : ''}</small></div></div>` : krTom}</td>
      <td class="num kr-k-anst">${k.anstallda ? `<span class="kr-text">${e(Number(k.anstallda).toLocaleString('sv-SE'))}</span>` : krTom}</td>
      <td class="num kr-k-oppet">${varde ? `<span class="kr-belopp" title="${e(kr(varde))}"><span class="kr-b-lang">${kr(varde)}</span><span class="kr-b-kort">${krKort(varde)}</span></span><small class="kr-under">${plural(oppna.length, 'affär', 'affärer')}</small>` : krTom}</td>
      <td class="num kr-k-senast">${s ? `<span class="kr-text" title="${e(s.typ === 'Tillagd' ? `Tillagd ${new Date(s.tid).toLocaleDateString('sv-SE', { dateStyle: 'long' })}` : new Date(s.tid).toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' }))}">${e(kundSenast(s.tid))}</span><small class="kr-under kr-akt">${ik(s.ikon)}${e(s.typ)}</small>` : krTom}</td></tr>`;
  };
  // Mobilen: kort med namnet på en rad, bransch · ort, läget/klubben under – status och öppet värde till höger
  const kundKort = (k) => {
    const l = kundLage(k); const varde = sum(affarerFor(k.id).filter(arOppen).map(affarVarde)); const kl = k.viaKlubb ? kund(k.viaKlubb) : null;
    const s = krSenast(k);
    const extra = [l ? `<span class="kr-kort-lage" title="${e(krLageText(l))}">${krLageEmo(l)}${l.typ === 'omtest' ? 'Omtest' : 'Uppföljning'}</span>` : '', kl ? `<span class="kr-kort-via">Via ${e(kl.namn)}</span>` : ''].filter(Boolean).join('<i aria-hidden="true">·</i>');
    return `<a class="kr-kort" href="#/kund/${e(k.id)}">${krAva(k)}<span class="kr-kort-text"><strong title="${e(k.namn)}">${e(k.namn)}</strong><small>${e([k.bransch, k.stad].filter(Boolean).join(' · '))}</small>${extra ? `<small class="kr-kort-extra">${extra}</small>` : ''}</span>
      <span class="kr-kort-hoger">${statusChip(k)}${varde ? `<b>${krKort(varde)}</b>` : s ? `<small>${e(kundSenast(s.tid))}</small>` : ''}</span></a>`;
  };
  const kundListaHtml = (lista = kundFilter()) => {
    if (!lista.length) {
      const q = kundUi.sok.trim(); const typ = kundUi.typ;
      // Sökningen kanske träffar i ett annat segment – säg det i stället för att bara visa tomt
      const iAlla = q && typ !== 'alla' ? (() => { kundUi.typ = 'alla'; const n = kundFilter().length; kundUi.typ = typ; return n; })() : 0;
      const text = q ? `Ingen kund ${typ === 'alla' ? '' : `i ”${KUNDSEGMENT[typ]}” `}matchar ”${q}”.${iAlla ? ` ${plural(iAlla, 'träff', 'träffar')} i Alla.` : ' Prova namn, bransch, ort eller kontaktperson.'}`
        : typ === 'lage' ? 'Ingen kund är i läge för omtest eller uppföljning just nu.' : typ === 'alla' ? 'Registret är tomt – lägg till den första kunden eller klubben.' : `Inga ${KUNDSEGMENT[typ].toLowerCase()} ännu.`;
      return `<div class="kort kr-tomt">${tom(text, { emo: q ? 'sok' : KUNDEMO[typ], knapp: `${q ? '<button class="knapp knapp-kontur knapp-liten" type="button" data-g="rensa-kundsok">Rensa sökningen</button>' : ''}${iAlla || (!q && typ !== 'alla') ? '<button class="knapp knapp-kontur knapp-liten" type="button" data-g="kund-typ" data-typ="alla">Visa alla</button>' : ''}<button class="knapp knapp-accent knapp-liten" type="button" data-g="snabb" data-flik="kund">${ik('plus')}Ny kund</button>` })}</div>`;
    }
    // Rubrikerna kortas när listan smalnar (kr-th-lang → kr-th-mellan → kr-th-kort, se sidor.css 02) – aldrig klippta
    const th = (klass, lang, kort = '', mellan = lang) => `<th class="${klass}" scope="col"${kort ? ` aria-label="${lang}"` : ''}>${kort ? `<span class="kr-th-lang" aria-hidden="true">${lang}</span><span class="kr-th-mellan" aria-hidden="true">${mellan}</span><span class="kr-th-kort" aria-hidden="true">${kort}</span>` : lang}</th>`;
    return `<div class="kort kundtabell kr-lista"><table class="tabell kr-tabell"><caption class="sr">Kunder och klubbar, senaste aktivitet först</caption>
        <thead><tr>${th('kr-k-kund', 'Kund')}${th('kr-k-status', 'Status')}${th('kr-k-klubb', 'Klubbkoppling')}${th('kr-k-kontakt', 'Kontakt')}${th('num kr-k-anst', 'Anställda')}${th('num kr-k-oppet', 'Öppna affärer', 'Öppet')}${th('num kr-k-senast', 'Senaste aktivitet', 'Senast', 'Senast aktiv')}</tr></thead>
        <tbody>${lista.map(kundRad).join('')}</tbody></table></div>
      <div class="kort kundlista-mobil kr-mobil">${lista.map(kundKort).join('')}</div>`;
  };
  // Räknaren i sökraden: ordningen när man bläddrar, antalet träffar och vart Enter leder när man söker.
  // Gruppens antal står redan i rutan/klammern/lägesknappen och totalen på "Alla" – de upprepas inte här.
  const kundAntalHtml = (lista) => {
    const q = kundUi.sok.trim();
    if (!q) return `<span class="kr-ordning">${ik('klocka')}Senaste aktivitet först</span>`;
    const forst = lista[0] ? `<span class="kr-enter"><kbd>Enter</kbd><span>öppnar ${e(lista[0].namn)}</span></span>` : '';
    return `<span class="kr-traffar"><b>${lista.length}</b> ${lista.length === 1 ? 'träff' : 'träffar'}</span>${forst}`;
  };
  // Nytt filter eller ny sökning: bara listan, räknaren och knapparnas lägen – hjälten står kvar (annars hela vyn)
  function kundUppdatera(mjukt = false) {
    const ruta = $('[data-kundlista]', vy); const hjalte = $('.sidhjalte-kunder', vy);
    if (!ruta || !hjalte) { rendera(); return; }
    const lista = kundFilter();
    ruta.innerHTML = kundListaHtml(lista);
    const antal = $('[data-kund-antal]', hjalte); if (antal) antal.innerHTML = kundAntalHtml(lista);
    hjalte.setAttribute('data-kund-filter', kundUi.typ);
    $$('button[data-g="kund-typ"]', hjalte).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.typ === kundUi.typ)));
    if (mjukt && !lugn && ruta.animate) ruta.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }
  // Samma grupp igen = tillbaka till Alla
  const kundFiltrera = (typ) => { kundUi.typ = typ === kundUi.typ && typ !== 'alla' ? 'alla' : typ || 'alla'; kundUppdatera(true); };
  function visaKunder() {
    const alla = db.kunder; const typ = kundUi.typ;
    const st = { kund: 0, prospekt: 0, lead: 0, klubb: 0 };
    alla.forEach((k) => { st[kundStatus(k)] += 1; });
    const nForetag = alla.filter((k) => k.typ === 'foretag').length;
    const leads = alla.filter((k) => kundStatus(k) === 'lead');
    const utanAffar = leads.filter((k) => !affarerFor(k.id).length).length;
    const lagen = alla.filter(kundLage).length;
    const oppetProspekt = sum(alla.filter((k) => kundStatus(k) === 'prospekt').flatMap((k) => affarerFor(k.id).filter(arOppen).map(affarVarde)));
    const intro = alla.filter((k) => k.viaKlubb).length;
    const tryckt = (id) => `aria-pressed="${typ === id}"`;
    /* Fördelningen = filtret. Dator: rutorna är lika breda som sin del av registret (--kol, med en minsta bredd så att texten får
       plats) och glasröret ovanför har SAMMA kolumner – varje lysande del står exakt över sin ruta, som rutans etikett.
       Mobil (2 × 2 rutor): röret står för sig med exakta proportioner (--ror, bara grupper som finns). Klammern "Företag"
       spänner över de tre företagsgrupperna. Delarna i röret går att klicka på (musgenväg) – tangentbord och skärmläsare använder rutorna. */
    const GRUPPER = ['kund', 'prospekt', 'lead', 'klubb'];
    const delar = GRUPPER.filter((id) => st[id] > 0);
    const nFtgDelar = delar.filter((id) => id !== 'klubb').length;
    const RUTOR = [
      { id: 'kund', namn: 'Kunder', under: 'minst en signerad order' },
      { id: 'prospekt', namn: 'Prospekt', under: oppetProspekt ? `${krKort(oppetProspekt)} i öppna affärer` : 'med öppen affär' },
      { id: 'lead', namn: 'Leads', under: leads.length && utanAffar !== leads.length ? `${utanAffar} utan affär · ${leads.length - utanAffar} ${leads.length - utanAffar === 1 ? 'förlorad' : 'förlorade'}` : 'ingen öppen eller vunnen affär' },
      { id: 'klubb', namn: 'Klubbar', under: `${plural(intro, 'företag', 'företag').replace(' ', ' ')} introducerade` },
    ];
    const namnFor = (id) => RUTOR.find((r) => r.id === id).namn;
    const andel = (n) => (alla.length ? Math.round((n / alla.length) * 100) : 0);
    const kol = GRUPPER.map((id) => `minmax(var(--kr-min), ${alla.length ? st[id] : 1}fr)`).join(' ');
    const rorKol = delar.length ? delar.map((id) => `minmax(10px, ${st[id]}fr)`).join(' ') : '1fr';
    const ror = `<div class="kr-ror">
        ${nFtgDelar && nForetag ? `<button class="kr-klammer" type="button" style="--mspan:${nFtgDelar}" data-g="kund-typ" data-typ="foretag" ${tryckt('foretag')} title="Visa alla företag (kunder, prospekt och leads – utan klubbarna)"><span>Företag</span><b>${nForetag}</b></button>` : ''}
        <i class="kr-ror-bas" aria-hidden="true"></i>${delar.map((id, i) => `<i class="kr-del" data-s="${id}" data-g="kund-typ" data-typ="${id}" style="--d:${GRUPPER.indexOf(id) + 1};--m:${i + 1};--i:${i}"${i ? '' : ' data-forst'}${i === delar.length - 1 ? ' data-sist' : ''} title="${e(namnFor(id))}: ${st[id]} av ${alla.length} (${andel(st[id])} %) – visa bara dem" aria-hidden="true"></i>`).join('')}<i class="kr-ror-glans" aria-hidden="true"></i></div>`;
    const rutor = `<div class="kr-rutor">${RUTOR.map((r, i) => `<button class="kr-ruta" type="button" data-s="${r.id}" style="--i:${i}" data-g="kund-typ" data-typ="${r.id}" ${tryckt(r.id)}>
        <span class="kr-ruta-etikett"><i aria-hidden="true"></i><span>${r.namn}</span></span><strong class="kr-ruta-tal" data-tal="${st[r.id]}" data-format="antal">${st[r.id]}</strong><span class="kr-ruta-under">${e(r.under)}</span></button>`).join('')}</div>`;
    const blick = `<div class="kr-blick" role="group" aria-label="Registret i en blick – välj en grupp för att filtrera listan" style="--kol:${kol};--ror:${rorKol}">
        <div class="kr-blick-huvud"><span class="kr-blick-etikett">Registret<span class="kr-blick-lang">&nbsp;i en blick</span></span>
          <button class="kr-alla" type="button" data-g="kund-typ" data-typ="alla" ${tryckt('alla')} title="Visa hela registret">${emo(UPEMO.kundtyp.alla)}Alla<b>${alla.length}</b></button></div>
        ${ror}${rutor}</div>`;
    const sokrad = `<div class="kr-sokrad"><label class="kr-sok">${ik('sok')}<input type="search" placeholder="Sök kund, ort, kontakt" value="${e(kundUi.sok)}" aria-label="Sök bland kunderna på namn, bransch, ort eller kontaktperson" data-kund-sok autocomplete="off" enterkeyhint="go"><kbd aria-hidden="true">/</kbd></label>
        <p class="kr-antal" data-kund-antal aria-live="polite">${kundAntalHtml(kundFilter())}</p></div>`;
    return `${sidhjalte({
        ogon: 'Kundregistret', titel: 'Kunder', klass: 'sidhjalte-kunder', attr: `data-kund-filter="${e(typ)}"`,
        text: 'Teamets gemensamma register – all historik samlad per kund.<span class="kr-ingress-mer"> Välj en grupp eller sök, och öppna kundkortet direkt.</span>',
        under: lagen ? `<button class="kr-lageknapp" type="button" data-g="kund-typ" data-typ="lage" ${tryckt('lage')}>${emo(UPEMO.sak.omtest)}<span><strong>${plural(lagen, 'kund', 'kunder')}</strong> i läge för omtest eller uppföljning</span>${ik('pil')}</button>` : '',
        knappar: `<button class="knapp knapp-accent" type="button" data-g="snabb" data-flik="kund">${ik('plus')}Ny kund</button><a class="knapp knapp-spok" href="#/klubbmotorn">${ik('klubb')}Klubbmotorn</a>`,
        extra: blick + sokrad,
      })}
      <div data-kundlista>${kundListaHtml()}</div>`;
  }
  // Kundregistrets tangenter: "/" söker, Enter i sökfältet öppnar första träffen, Esc tömmer, pil ned/upp går mellan raderna.
  // Lyssnar på document (före fönstrets globala "/" som annars öppnar paletten).
  document.addEventListener('keydown', (ev) => {
    const sokEl = $('[data-kund-sok]', vy); if (!sokEl || !ev.target.closest || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const rader = () => $$('.kr-namn, .kr-kort', vy).filter((x) => x.getClientRects().length);
    if (ev.key === '/' && !ev.target.closest('input, textarea, select, [contenteditable], dialog') && !document.querySelector('.mote')) { ev.preventDefault(); ev.stopPropagation(); sokEl.focus(); sokEl.select(); return; }
    if (ev.target === sokEl) {
      if (ev.key === 'Enter') { const f = rader()[0]; if (f) { ev.preventDefault(); location.hash = f.getAttribute('href'); } }
      else if (ev.key === 'ArrowDown') { const f = rader()[0]; if (f) { ev.preventDefault(); f.focus(); } }
      else if (ev.key === 'Escape' && sokEl.value) { ev.preventDefault(); sokEl.value = ''; kundUi.sok = ''; kundUppdatera(); }
      return;
    }
    const rad = ev.target.closest('.kr-namn, .kr-kort');
    if (!rad || (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp')) return;
    const alla = rader(); const i = alla.indexOf(rad); if (i < 0) return;
    ev.preventDefault();
    const nasta = ev.key === 'ArrowDown' ? alla[i + 1] : i ? alla[i - 1] : sokEl;
    if (nasta) { nasta.focus(); if (nasta !== sokEl) nasta.closest('tr, .kr-kort').scrollIntoView({ block: 'nearest' }); }
  });

  // Nästa bästa steg för kunden – byggt på nastaSteg() för den öppna affär som väger mest (Att göra-knappen står i sidhjälten)
  const nastaKundHtml = (k, af) => {
    const oppna = af.filter(arOppen).sort((a, b) => affarVarde(b) * sannolikhet(b).p - affarVarde(a) * sannolikhet(a).p);
    const a = oppna[0]; if (!a) return '';
    const ns = nastaSteg(a); if (!ns) return '';
    const d = -dagarTill(a.stegAndrad); const pk = primarKontakt(k);
    return `<section class="kort nasta-kort"><div class="nasta-kort-inre">
        <span class="overrad">Nästa steg${oppna.length > 1 ? ` · ${plural(oppna.length, 'öppen affär', 'öppna affärer')}` : ''}</span>
        <div class="nasta-kort-rad">${emo(ns.emo || UPEMO.salj[a.steg], { ruta: 'l', ton: ns.varm ? 'gul' : 'mint' })}<div><strong>${e(ns.text)}</strong><small>${e(a.titel)} · ${e((SALJSTEG.find((s) => s.id === a.steg) || {}).namn || '')} · ${kr(affarVarde(a))}</small></div></div>
        <div class="nasta-kort-fot">${chipAlder(d)}<a class="knapp knapp-accent knapp-liten" href="#/affar/${e(a.id)}">Öppna affären${ik('pil')}</a>${pk && pk.tel ? `<a class="knapp knapp-kontur knapp-liten" href="tel:${e(pk.tel.replace(/\s/g, ''))}">${ik('samtal')}Ring ${e(pk.namn.split(' ')[0])}</a>` : ''}</div>
      </div></section>`;
  };
  // Kom igång – för leads som saknar kontaktperson, första kontakt eller affär. Allt räknas fram ur datan.
  const komIgangHtml = (k, af, akt) => {
    if (kundStatus(k) !== 'lead' || af.length) return '';
    const punkter = [
      [!!(k.kontakter || []).length, UPEMO.sak.kontakt, 'Lägg till en kontaktperson', 'Vem pratar vi med?', `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="ny-kontakt" data-kund="${e(k.id)}">${ik('plus')}Kontakt</button>`],
      [akt.some((x) => x.typ !== 'system'), UPEMO.akt.anteckning, 'Logga första kontakten', 'Samtal, möte eller mejl – skriv i tidslinjen', `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="fokus-anteckning" data-kund="${e(k.id)}">${ik('anteckning')}Skriv</button>`],
      [af.length > 0, UPEMO.sak.pipeline, 'Skapa en affär', 'Hamnar i säljtavlan med pris från prislistan', `<button class="knapp knapp-accent knapp-liten" type="button" data-g="ny-affar" data-kund="${e(k.id)}">${ik('plus')}Ny affär</button>`],
    ];
    const klara = punkter.filter(([ok]) => ok).length;
    return `<section class="kort komigang"><div class="kort-huvud"><h2>${emo(UPEMO.kundtyp.lead, { ruta: 'm', ton: 'mint' })}Kom igång med ${e(k.namn)}</h2><span class="rakna">${klara} av ${punkter.length} klara</span></div>
      <ol class="komigang-lista">${punkter.map(([ok, em, titel, under, knapp]) => `<li ${ok ? 'data-klar' : ''}>${ok ? `<span class="komigang-bock" aria-hidden="true">${ik('bock')}</span>` : emo(em, { ruta: 'm' })}<span><strong>${e(titel)}</strong><small>${ok ? 'Klart' : e(under)}</small></span>${ok ? '' : knapp}</li>`).join('')}</ol></section>`;
  };
  /* Detaljsidornas sidhjälte (kund, affär, projekt – även när de saknas): samma struktur på alla tre. Ögonrad med vägen tillbaka,
     kundens märke + namnet i h1, en rad klartext om ärendet, chips och fakta, knappar, glaskort med nyckeltalen (tre kort: det
     första är brett) och – på affär och projekt – stegen som en remsa i hjältens fot. Stil i sidor.css avsnitt 03.
     tal: som glasKort, eller { text } för ett värde som inte är ett tal (datum); attr/titel läggs på kortet. text/chips/fakta/knappar/fot är färdig HTML. */
  /* Mätarna i affärens glaskort (värdet och mätaren på samma rad, .glas-rad): ringen i Chans att vinna – bågen är sannolikheten och
     strecket stegets grund, så att man ser om signalerna drar upp eller ner – och två veckors streck i Dagar i steget (ett per dag,
     varma när affären står still från dag 14). Ritas fram en gång när vyn öppnas (vy-in, sidor.css). */
  const glasRing = (p, grund) => {
    const v = Math.max(0, Math.min(1, p)); const g = (Math.max(0, Math.min(1, grund)) * 360 - 90) * Math.PI / 180;
    const x = (r) => (20 + Math.cos(g) * r).toFixed(2); const y = (r) => (20 + Math.sin(g) * r).toFixed(2);
    return `<svg class="glas-ring" viewBox="0 0 40 40" aria-hidden="true" data-lage="${v < .35 ? 'lag' : v >= .7 ? 'hog' : 'mitt'}"><circle class="glas-ring-spar" cx="20" cy="20" r="16"/>`
      + `<circle class="glas-ring-bage" cx="20" cy="20" r="16" pathLength="100" stroke-dasharray="${(v * 100).toFixed(1)} 100" transform="rotate(-90 20 20)"/>`
      + `${grund > 0 && grund < 1 ? `<line class="glas-ring-grund" x1="${x(11.5)}" y1="${y(11.5)}" x2="${x(20.5)}" y2="${y(20.5)}"/>` : ''}</svg>`;
  };
  const glasDagar = (d, grans = 14) => `<span class="glas-dagar" aria-hidden="true"${d >= grans ? ' data-varm' : ''}>${Array.from({ length: grans }, (_, i) => `<i${i < d ? ' data-pa' : ''} style="--i:${i}"></i>`).join('')}</span>`;
  const detaljGlas = (t) => {
    if (t.text == null) {
      let h = glasKort(t);
      if (t.attr) h = h.replace('class="glas-varde"', `class="glas-varde" ${t.attr}`);
      if (t.matt) h = h.replace(/(<strong class="glas-varde"[^>]*>[\s\S]*?<\/strong>)/, (m) => `<span class="glas-rad">${m}${t.matt}</span>`);
      // titeln (t.ex. sannolikhetens förklaring) läggs på öppningstaggen – glasKort skriver ingen data-tilt att haka i
      return t.titel ? h.replace(/^<(a|div) /, (m) => `${m}title="${e(t.titel)}" `) : h;
    }
    // Stilla som talkorten (ingen data-tilt) – en lutande cell bröt panelens hårfina avdelare
    const tagg = t.href ? 'a' : 'div';
    return `<${tagg} class="glas glas-text${t.ton ? ` glas-${e(t.ton)}` : ''}"${t.href ? ` href="${e(t.href)}"` : ''}${t.titel ? ` title="${e(t.titel)}"` : ''}><span class="glas-etikett">${emo(t.emo, { ruta: 's' })}${e(t.etikett)}</span>`
      + `<strong class="glas-varde">${t.text}</strong>${t.under ? `<span class="glas-under">${t.under}</span>` : ''}${t.href ? `<span class="glas-pil" aria-hidden="true">${ik('pil')}</span>` : ''}</${tagg}>`;
  };
  // Datum (datumText: "21 dec 2025", "3 okt") bryts aldrig mitt i – mellanslagen i datumet blir hårda. Körs på klartexten, chipsen och
  // faktan, som redan är färdig HTML (bara mellanslag byts, inget annat ändras). Glaskortens värden lämnas – där får året gå ner på 320 px.
  const helaDatum = (html) => String(html).replace(/(^|[^\d.,])(\d{1,2})[ \u00a0](jan|feb|mars|apr|maj|juni|juli|aug|sep|okt|nov|dec)\b(?:[ \u00a0](\d{4})\b)?/g,
    (m, fore, dag, man, ar) => `${fore}${dag}\u00a0${man}${ar ? `\u00a0${ar}` : ''}`);
  const detaljHjalte = ({ tillbaka, tillbakaText, typ = '', marke = '', titel, text = '', chips = '', fakta = '', knappar = '', tal = [], fot = '', klass = '' }) => sidhjalte({
    ogon: `<a href="${e(tillbaka)}">${ik('pil-v')}${e(tillbakaText)}</a>${typ ? `<span class="detalj-typ">${e(typ)}</span>` : ''}`,
    titel: `${marke ? `<span class="detalj-marke">${marke}</span>` : ''}<span class="detalj-namn">${e(titel)}</span>`,
    text: helaDatum(text), knappar, klass: `sidhjalte-detalj${klass ? ` ${klass}` : ''}`,
    under: `${chips ? `<span class="detalj-chips">${helaDatum(chips)}</span>` : ''}${fakta ? `<span class="detalj-fakta">${helaDatum(fakta)}</span>` : ''}`,
    extra: `${tal.length ? `<div class="sidhjalte-tal" data-antal="${tal.length}">${tal.map(detaljGlas).join('')}</div>` : ''}${fot ? `<div class="detalj-fot">${fot}</div>` : ''}`,
  });
  // Felvyn när kunden/affären/projektet inte finns – samma hjälte, med en väg vidare
  const detaljSaknas = (tillbaka, tillbakaText, titel, knapp) => detaljHjalte({ tillbaka, tillbakaText, marke: emo('sok', { ruta: 'l' }), titel,
    text: 'Den kan ha tagits bort, eller så är länken fel.', knappar: `<a class="knapp knapp-accent" href="${e(tillbaka)}">${e(knapp)}</a>`, klass: 'detalj-saknas' });

  function visaKund(id) {
    const k = kund(id);
    if (!k) return detaljSaknas('#/kunder', 'Kunder', 'Kunden finns inte', 'Till kundregistret');
    const af = affarerFor(k.id).sort((a, b) => (a.skapad < b.skapad ? 1 : -1));
    const proj = db.projekt.filter((p) => p.kundId === k.id);
    const todos = db.todos.filter((t) => t.kundId === k.id && !t.klar).sort((x, y) => (x.datum || '9999').localeCompare(y.datum || '9999'));
    const docs = db.dokument.filter((d) => d.kundId === k.id);
    const akt = db.aktiviteter.filter((x) => x.kundId === k.id);
    const kl = k.viaKlubb ? kund(k.viaKlubb) : null;
    const status = kundStatus(k);
    const st = k.klubbavtal ? klubbStat(k) : null;

    /* Korten under hjälten (stil i sidor.css avsnitt 16, balanseraKund nedan). Huvudkolumnen är arbetet – kom igång/nästa steg,
       affärerna, testerna och tidslinjen; sidokolumnen är kunden – Klubbmotorn, kontaktpersonerna, att göra och dokumenten.
       Varje kort bär data-kd (sin nyckel) och --kd-o (platsen i mobilens enda kolumn). Tomlägen är låga rader, aldrig tomma lådor. */
    const KD_MOBIL = ['komigang', 'nasta', 'affarer', 'attgora', 'kontakter', 'klubb', 'tester', 'tidslinje', 'dokument'];
    const plats = (n) => `data-kd="${n}" style="--kd-o:${KD_MOBIL.indexOf(n)}"`;
    const iPlats = (n, html) => (html ? html.replace(/^\s*<section /, `<section ${plats(n)} `) : '');
    // Tomläge: hela raden är knappen – streckad ram, linjeikon i en tonad cirkel, rubrik + en mening och åtgärden som piller till höger
    // (förut en emoji som såg ut som en ikryssad ruta och en knapp som bröts ner på egen rad). attr bär knappens data-g och data-*.
    const tomrad = ({ ikon, ton, rubrik, under, attr, knapp, knappIkon = 'plus', etikett }) => `<button class="kd-tomrad" type="button" data-ton="${ton}" ${attr} aria-label="${e(`${etikett} – ${rubrik.toLowerCase()}`)}"><span class="kd-tomrad-ikon" aria-hidden="true">${ik(ikon)}</span><span class="kd-rad-text" aria-hidden="true"><strong>${e(rubrik)}</strong><small>${e(under)}</small></span><span class="kd-tomrad-knapp" aria-hidden="true">${ik(knappIkon)}<span>${e(knapp)}</span></span></button>`;
    const KB_TEXT_KUND = { prognos: 'I prognos', upplupen: 'Upplupen', 'att-betala': 'Att betala', utbetald: 'Utbetald' };
    const klubbHuvud = (hoger) => `<div class="kort-huvud"><h3>${emo(UPEMO.sak.klubb, { ruta: 'm', ton: 'orange' })}Klubbmotorn</h3>${hoger}</div>`;
    let klubbKort = '';
    if (k.klubbavtal) {
      // Klubbens tal (partners, introducerade, avtal, provision) står i sidhjälten – kortet har avtalet och partnerna
      klubbKort = `<section class="kort kd-klubb" ${plats('klubb')}>${klubbHuvud(`<span class="chip chip-klubb">${e(k.klubbavtal.procent)}&nbsp;% provision</span>`)}
        <label class="kd-klubb-form"><span class="etikett">Utbetalningsform</span><select class="falt" data-klubbform="${e(k.id)}">${Object.entries(UTBETALNING).map(([v, t]) => `<option value="${e(v)}" ${k.klubbavtal.form === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <small class="falt-hint">Hur klubben vill få sin provision – syns på provisionerna i Klubbmotorn.</small></label>
        <div class="kd-delhuvud"><h4>Partners via klubben${st.intro.length ? `<span class="rakna">${st.intro.length}</span>` : ''}</h4>${st.intro.length ? `<button class="knapp knapp-spok knapp-liten" type="button" data-g="snabb" data-flik="kund" data-via="${e(k.id)}">${ik('plus')}Partner</button>` : ''}</div>
        ${st.intro.length ? `<div class="kd-lista">${st.intro.map((p) => kundlankRad(p, `<span class="lank-rad-hoger">${statusChip(p)}</span>`)).join('')}</div>`
          : tomrad({ ikon: 'kunder', ton: 'orange', rubrik: 'Inga partners ännu', under: 'Företag som klubben introducerar hamnar här', attr: `data-g="snabb" data-flik="kund" data-via="${e(k.id)}"`, knapp: 'Partner', etikett: 'Lägg till en partner via klubben' })}</section>`;
    } else if (k.typ === 'foretag') {
      if (kl) {
        // Klubben som öppnade dörren och vad den får av kundens affärer (samma belopp som i Klubbmotorn – kickback per affär)
        const kbs = af.map(kickback).filter(Boolean); const prov = sum(kbs.map((x) => x.belopp));
        const lagen = [...new Set(kbs.map((x) => x.status).filter((x) => KB_TEXT_KUND[x]))];
        const procent = e(kl.klubbavtal ? kl.klubbavtal.procent : Math.round(KLUBBMOTORN.provision * 100));
        const bricka = (status, text) => `<span class="kd-klubb-status" data-status="${e(status)}">${e(text)}</span>`;
        klubbKort = `<section class="kort kd-klubb" ${plats('klubb')}>${klubbHuvud(`<button class="knapp knapp-spok knapp-liten" type="button" data-g="koppla-klubb" data-id="${e(k.id)}">${ik('redigera')}Ändra</button>`)}
          <a class="kd-klubb-rad" href="#/kund/${e(kl.id)}">${loggaRuta(kl)}<span class="kd-rad-text"><strong>${e(kl.namn)}</strong><small>Introducerade kunden · ${procent}&nbsp;% av affärsvärdet</small></span><span class="kd-klubb-pil" aria-hidden="true">${ik('pil')}</span>
            <span class="kd-klubb-fot"><span class="kd-klubb-etikett">Provision</span><strong>${kbs.length ? kr(prov) : `${procent}&nbsp;%`}</strong>${kbs.length ? lagen.map((x) => bricka(x, KB_TEXT_KUND[x])).join('') : bricka('prognos', 'Vid första affären')}</span></a></section>`;
      } else {
        klubbKort = `<section class="kort kd-klubb" ${plats('klubb')}>${klubbHuvud('')}
          ${tomrad({ ikon: 'klubb', ton: 'orange', rubrik: 'Ingen klubbkoppling', under: 'Kom kunden via en klubbs partnernätverk?', attr: `data-g="koppla-klubb" data-id="${e(k.id)}"`, knapp: 'Koppla', knappIkon: 'lank', etikett: 'Koppla kunden till en klubb' })}</section>`;
      }
    }
    // "Kund sedan" bara för kunder – leads och prospekt finns i registret, klubbar har avtal
    const sedan = k.typ === 'klubb' ? `Klubbavtal sedan ${datumText((k.klubbavtal && k.klubbavtal.sedan) || k.skapad, { ar: true, gemen: true })}`
      : status === 'kund' ? `Kund sedan ${datumText(affarerFor(k.id).filter((a) => a.steg === 'signerad').map((a) => a.stegAndrad).filter(Boolean).sort()[0] || k.skapad, { ar: true, gemen: true })}` : `I registret sedan ${datumText(k.skapad, { ar: true, gemen: true })}`;
    // Stegmätaren: ett segment per säljsteg före signering – klara mint, det aktiva lyser; signerad = alla fyllda, förlorad = röd
    const affarMatare = (a) => { const steg = SALJSTEG.filter((x) => x.id !== 'signerad'); const i = a.steg === 'signerad' ? steg.length : saljStegIndex(a.steg);
      return `<span class="affarrad-matare" data-lage="${a.steg === 'forlorad' ? 'forlorad' : a.steg === 'signerad' ? 'signerad' : 'oppen'}" aria-hidden="true">${steg.map((x, j) => `<i${a.steg !== 'forlorad' && j < i ? ' data-klar' : ''}${j === i && a.steg !== 'signerad' ? ' data-nu' : ''}></i>`).join('')}</span>`; };
    const affarRad = (a) => {
      const l = lankFor(a.id); const sm = l && l.status !== 'inskickad' && arOppen(a) ? summeraUnderlag(l) : null;
      const lankInfo = sm ? `<small class="affarrad-lank">${emo(UPEMO.sak.lank)}${l.status === 'paborjad' ? 'Kunden fyller i' : l.status === 'oppnad' ? 'Kunden har öppnat länken' : 'Kundlänk skickad'}${sm.varningar + sm.foretagFel.length ? ` · ${sm.varningar + sm.foretagFel.length} att rätta` : ''}</small>` : '';
      const projRader = proj.filter((p) => p.affarId === a.id).map(projRad).join('');
      return `<div class="affarrad"><a class="lank-rad" href="#/affar/${e(a.id)}">${a.steg === 'forlorad' ? `<span class="emo emo-ruta emo-s" data-ton="rod" aria-hidden="true">${ik('stang')}</span>` : emo(UPEMO.salj[a.steg], { ruta: 's' })}<span class="lank-rad-text"><strong>${e(a.titel)}</strong><small>${e(paketText(a.offert))} · ${helaDatum(e(datumText(a.skapad, { ar: true })))}</small>${lankInfo}${affarMatare(a)}</span><span class="lank-rad-hoger"><strong>${kr(affarVarde(a))}</strong>${stegChip(a)}</span></a>${projRader}</div>`;
    };
    // Projektet står som en underrad på sin affär (steget och vem som äger det) – testdagen bara när hjälten inte redan visar den
    const pagaende = proj.filter((p) => p.steg !== 'klar').sort((x, y) => String(x.testdatum || '9999').localeCompare(String(y.testdatum || '9999')))[0];
    const projRad = (p) => {
      const s = PROJSTEG.find((x) => x.id === p.steg);
      const visaDatum = p.testdatum && !(p === pagaende && testIHjalten);
      const text = p.steg === 'klar' ? `Projektet är klart${p.testdatum ? ` · test ${e(datumText(p.testdatum, { ar: true, gemen: true }))}` : ''}`
        : `Projekt · ${e(s ? s.namn : p.steg)}${visaDatum ? ` · test ${e(datumText(p.testdatum, { ar: true, gemen: true }))}` : p.testdatum ? '' : ' · testdag inte bokad'}`;
      return `<a class="affarrad-projekt" href="#/projekt/${e(p.id)}">${emo(UPEMO.proj[p.steg], { ruta: 'xs' })}<span class="affarrad-projekt-text">${helaDatum(text)}</span>${p.steg === 'klar' || !s ? '' : agarband(s.agare, true)}<span class="affarrad-pil" aria-hidden="true">${ik('pil')}</span></a>`;
    };

    // Sidhjälten: vad kunden är (en rad), läget (chips) och nyckeltalen. Klubbar visar Klubbmotorns tal – de som förr stod i Klubbmotorn-kortet.
    const oppna = af.filter(arOppen); const vunna = af.filter((a) => a.steg === 'signerad');
    const forfallna = todos.filter((t) => t.datum && dagarTill(t.datum) < 0).length;
    const nastaTodo = todos.filter((t) => t.datum).sort((x, y) => (x.datum < y.datum ? -1 : 1))[0];
    const talOppet = { emo: UPEMO.sak.pipeline, etikett: 'Öppna affärer', varde: sum(oppna.map(affarVarde)), format: 'krkort', href: oppna.length === 1 ? `#/affar/${oppna[0].id}` : '',
      under: oppna.length ? `${plural(oppna.length, 'öppen affär', 'öppna affärer')} · viktat ${krKort(sum(oppna.map((a) => affarVarde(a) * sannolikhet(a).p)))}` : 'Ingen öppen affär just nu' };
    // En makulerad order räknas inte som signerad – affären är vunnen men en ny order behövs (orderMakulerad)
    const makuleradeN = vunna.filter(orderMakulerad).length;
    const talVunnet = { emo: UPEMO.sak.vunnet, etikett: k.typ === 'klubb' ? 'Egna affärer' : 'Vunnet', varde: sum(vunna.map(affarVarde)), format: 'krkort',
      under: !vunna.length ? 'Ingen signerad order ännu' : makuleradeN ? `${vunna.length - makuleradeN ? `${e(plural(vunna.length - makuleradeN, 'signerad order', 'signerade order'))} · ` : ''}<span class="detalj-varm">${e(plural(makuleradeN, 'order makulerad', 'ordrar makulerade'))} – ny order behövs</span>` : plural(vunna.length, 'signerad order', 'signerade order') };
    const talTodo = { emo: UPEMO.sak.todo, etikett: 'Att göra', varde: todos.length,
      under: forfallna ? `<span class="detalj-varm">${plural(forfallna, 'förfallen', 'förfallna')}</span>` : nastaTodo ? `nästa ${e(dagarTill(nastaTodo.datum) <= 1 ? datumText(nastaTodo.datum, { gemen: true }) : dagText(nastaTodo.datum))}` : todos.length ? 'utan datum' : 'Inget planerat' };
    // Leads har inga affärsvärden än – där säger senaste kontakten och affärerna (även förlorade) mer
    const talKontakt = () => {
      const sorterad = [...akt].sort((x, y) => (x.tid < y.tid ? 1 : -1)); const x = sorterad.find((y) => y.typ !== 'system') || sorterad[0];
      return x ? { emo: UPEMO.akt[x.typ] || UPEMO.sak.kontakt, etikett: x.typ === 'system' ? 'Senaste händelse' : 'Senaste kontakt', text: e(relTid(x.tid)), under: `${e(AKT_TYP[x.typ] || 'Händelse')} · ${e(anv(x.av).kort)}` }
        : { emo: UPEMO.sak.kontakt, etikett: 'Senaste kontakt', text: 'Ingen ännu', under: 'Logga första kontakten i tidslinjen' };
    };
    const forlorade = af.filter(raknasForlorad).length; const felreg = af.filter(felregistrerad).length;
    const talAffarer = { emo: UPEMO.sak.pipeline, etikett: 'Affärer', varde: af.length, under: [forlorade && plural(forlorade, 'förlorad', 'förlorade'), felreg && plural(felreg, 'felregistrerad', 'felregistrerade')].filter(Boolean).join(' · ') || 'ingen affär ännu' };
    // Ingen öppen affär men ett pågående projekt: läget är testdagen, inte "0 kr"
    const nPag = pagaende && pagaende.testdatum ? dagarTill(pagaende.testdatum) : null; const sPag = pagaende && PROJSTEG.find((x) => x.id === pagaende.steg);
    const testIHjalten = !st && (status === 'kund' || status === 'prospekt') && !oppna.length && !!pagaende;
    const talLage = testIHjalten ? { emo: UPEMO.proj.test, etikett: 'Testdag', text: pagaende.testdatum ? e(datumText(pagaende.testdatum)) : 'Inte bokad', href: `#/projekt/${pagaende.id}`,
      under: `${nPag == null ? '' : nPag > 0 ? `om ${plural(nPag, 'dag', 'dagar')} · ` : nPag === 0 ? 'idag · ' : `för ${plural(-nPag, 'dag', 'dagar')} sedan · `}${e(sPag ? sPag.namn : '')}` } : talOppet;
    const tal = st ? [
      { emo: UPEMO.sak.partner, etikett: 'Partners', varde: st.introducerade, under: st.partners > 0 && st.partners >= st.introducerade ? `introducerade · av ${e(st.partners)} i nätverket` : 'introducerade · nätverket ej angivet' },
      { emo: UPEMO.sak.konvertering, etikett: 'Avtal', varde: st.vunna, under: st.introducerade ? `${pct(st.vunna / st.introducerade)} av de introducerade` : 'Inga partners introducerade än' },
      { emo: UPEMO.sak.provision, etikett: 'Provision', varde: st.utbetalt + st.attBetala + st.upplupen, format: 'krkort', href: '#/klubbmotorn', ton: 'orange',
        under: st.attBetala ? `${krKort(st.attBetala)} att betala` : `${krKort(st.utbetalt)} utbetalt` },
      talVunnet,
    ] : status === 'kund' ? [talVunnet, talLage, talTodo] : status === 'prospekt' ? [talLage, talVunnet, talTodo] : [talKontakt(), talAffarer, talTodo];
    /* Kundresan: milstolparna ur kundens data (registret, första mötet, offert, order, testdag, uppföljning – för klubbar avtal,
       första partnern, första affären via klubben och första utbetalda provisionen). Klara steg har sitt datum, nästa steg är aktivt. */
    const forst = (lista) => lista.filter(Boolean).map(String).sort()[0] || null;
    const dagHint = (t, framtid = false) => { if (!t) return ''; const iso = String(t).slice(0, 10); const n = dagarTill(iso); return framtid && n > 0 ? `${datumText(iso)} · om ${plural(n, 'dag', 'dagar')}` : datumText(iso, { ar: 'auto' }); };
    let resa;
    if (k.typ === 'klubb' && st) {
      const intro = db.kunder.filter((x) => x.viaKlubb === k.id); const introAf = db.affarer.filter((a) => intro.some((x) => x.id === a.kundId));
      resa = [['avtal', 'Klubbavtal', (k.klubbavtal && k.klubbavtal.sedan) || k.skapad, 'signera'], ['partner', 'Första partnern', forst(intro.map((x) => x.skapad)), 'kunder'],
        ['affar', 'Första affären', forst(introAf.filter((a) => a.steg === 'signerad').map((a) => a.stegAndrad)), 'medalj'], ['provision', 'Provision utbetald', forst(introAf.map((a) => a.kickbackUtbetald)), 'mynt']];
    } else {
      const offerter = [...Object.values(db.offerter || {}).filter((d) => d.kundId === k.id && (d.typ || 'offert') === 'offert').map((d) => d.skapad), ...docs.filter((d) => filKategori(d) === 'offert').map((d) => d.tid)];
      const tester = proj.filter((p) => p.testdatum).map((p) => p.testdatum).sort();
      const testKlar = tester.find((t) => dagarTill(t) <= 0) || null; const testKommande = tester.find((t) => dagarTill(t) > 0) || null;
      resa = [['registret', 'I registret', k.skapad, 'grodd'], ['mote', 'Första mötet', forst(akt.filter((x) => x.typ === 'mote').map((x) => x.tid)), 'mote'],
        ['offert', 'Offert', forst(offerter), 'dokument'], ['order', 'Order signerad', forst(af.filter((a) => a.steg === 'signerad' && !orderMakulerad(a)).map((a) => a.stegAndrad)), 'medalj'],
        ['test', 'Testdag', testKlar, 'stetoskop', testKommande], ['uppfoljning', 'Uppföljning', forst(proj.map((p) => p.uppfoljningDatum || (p.steg === 'klar' ? p.testdatum : null))), 'kompass']];
    }
    // Nästa steg är det första som inte är klart EFTER det sista klara (en planerad testdag visar sitt datum); steg före det som saknar
    // datum (t.ex. inget möte loggat före ordern) räknas som passerade och visar "Inte loggat" – alla klara = hela resan
    const sistaKlar = resa.map((x) => !!x[2]).lastIndexOf(true);
    const nastaResa = resa.slice(sistaKlar + 1).find((x) => !x[2]);
    const resaSteg = resa.map(([id, namn, tid, , plan], i) => ({ id, namn, hint: tid ? dagHint(tid) : plan ? dagHint(plan, true) : id === 'order' && makuleradeN ? 'Ordern makulerad' : nastaResa && nastaResa[0] === id ? 'Nästa steg' : i < sistaKlar ? 'Inte loggat' : '' }));
    const resaHtml = af.length || k.typ === 'klubb' || akt.length ? `<div class="kd-resa"><span class="kd-resa-etikett">${k.typ === 'klubb' ? 'Klubbens resa' : 'Kundresan'}</span>${stegare(resaSteg, nastaResa ? nastaResa[0] : 'klar', { emoji: Object.fromEntries(resa.map((x) => [x[0], x[3]])) })}</div>` : '';
    const fakta = [k.bransch ? `<strong>${e(k.bransch)}</strong>${k.stad ? ` i ${e(k.stad)}` : ''}` : e(k.stad || ''),
      k.anstallda ? `${e(k.anstallda)} ${k.typ === 'klubb' ? 'spelare & ledare' : 'anställda'}` : ''].filter(Boolean);
    // "i registret sedan …" efter bransch och ort – står den först (inget annat ifyllt) börjar raden med stor bokstav
    fakta.push(e(fakta.length ? sedan.charAt(0).toLowerCase() + sedan.slice(1) : sedan));

    return `${detaljHjalte({ tillbaka: '#/kunder', tillbakaText: 'Kunder', typ: k.typ === 'klubb' ? 'Klubb' : 'Företag', marke: loggaRuta(k, true), titel: k.namn, klass: 'detalj-kund', tal, fot: resaHtml,
        text: fakta.join(' · '),
        chips: `${k.typ === 'klubb' ? '' : statusChip(k)}${k.klubbavtal ? `<span class="chip chip-klubb">${emo(UPEMO.sak.klubb)}Klubbmotorn-avtal</span>` : ''}${klubbChip(k)}${k.orgnr ? `<span class="detalj-orgnr">Org.nr ${e(k.orgnr)}</span>` : ''}`,
        knappar: `<button class="knapp knapp-accent" type="button" data-g="ny-affar" data-kund="${e(k.id)}">${ik('plus')}Ny affär</button>${k.typ !== 'klubb' ? `<button class="knapp knapp-kontur" type="button" data-g="starta-mote" data-kund="${e(k.id)}">${ik('presentation')}Kundmöte</button>` : ''}<button class="knapp knapp-kontur" type="button" data-g="ny-todo" data-kund="${e(k.id)}">${ik('todo')}Att göra</button><button class="knapp knapp-kontur detalj-ikonknapp" type="button" data-g="andra-kund" data-kund="${e(k.id)}" aria-label="Ändra uppgifter om ${k.typ === 'klubb' ? 'klubben' : 'kunden'}" title="Ändra uppgifter – namn, bransch, ort, org.nr${k.typ === 'klubb' ? ', provision och nätverk' : ' och anställda'}">${ik('redigera')}</button>${kanRaderaKund() ? `<button class="knapp knapp-kontur detalj-radera" type="button" data-g="radera-kund" data-kund="${e(k.id)}" aria-label="Ta bort ${k.typ === 'klubb' ? 'klubben' : 'kunden'}" title="Ta bort ${k.typ === 'klubb' ? 'klubben' : 'kunden'}">${ik('papperskorg')}</button>` : `<button class="knapp knapp-kontur detalj-radera detalj-radera-las" type="button" data-g="be-admin-radera" data-kund="${e(k.id)}" aria-label="Bara admin tar bort ${k.typ === 'klubb' ? 'klubbar' : 'kunder'} – be admin ta bort ${k.typ === 'klubb' ? 'klubben' : 'kunden'}" title="Bara admin tar bort ${k.typ === 'klubb' ? 'klubbar' : 'kunder'} – be admin ta bort dubbletten">${ik('papperskorg')}</button>`}`,
      })}
      ${kundRum()}`;

    function kundRum() {
      const kontakter = k.kontakter || [];
      // telefon/e-post: en rad med rund ikon, värdet och en pil som visar att raden ringer/mejlar (etiketten står i aria-label)
      const kontaktLank = (typ, href, varde, etikett) => `<a class="kontaktlank" data-typ="${typ}" href="${e(href)}" aria-label="${e(`${typ === 'tel' ? 'Ring' : 'Mejla'} ${varde}`)}"><span class="kontaktlank-ikon">${ik(typ === 'tel' ? 'samtal' : 'mejl')}</span><span class="kontaktlank-text">${e(varde)}</span>${ik('pil')}</a>`;
      const nyKontakt = (text) => `<button class="knapp knapp-${text ? 'kontur' : 'spok'} knapp-liten" type="button" data-g="ny-kontakt" data-kund="${e(k.id)}">${ik('plus')}${text || '<span class="kort-text-lang">Lägg till</span><span class="kort-text-kort">Ny</span>'}</button>`;
      const nyTodo = (kontur) => `<button class="knapp knapp-${kontur ? 'kontur' : 'spok'} knapp-liten" type="button" data-g="ny-todo" data-kund="${e(k.id)}">${ik('plus')}Ny</button>`;
      const affarer = af.length || proj.length
        ? `<section class="kort detalj-affarer" ${plats('affarer')}><div class="kort-huvud"><h2>${ik('salj')}${proj.length ? 'Affärer &amp; projekt' : 'Affärer'}</h2><span class="rakna">${plural(af.length, 'affär', 'affärer')}</span></div>
            <div class="kd-lista">${af.map(affarRad).join('')}${proj.filter((p) => !af.some((a) => a.id === p.affarId)).map((p) => `<div class="affarrad affarrad-ensam">${projRad(p)}</div>`).join('')}</div></section>`
        : status === 'lead' ? '' : `<section class="kort" ${plats('affarer')}><div class="kort-huvud"><h2>${ik('salj')}Affärer</h2><span class="rakna">0</span></div>
            ${tomrad({ ikon: 'salj', ton: 'mint', rubrik: 'Inga affärer ännu', under: 'En ny affär hamnar i säljtavlan med pris från prislistan', attr: `data-g="ny-affar" data-kund="${e(k.id)}"`, knapp: 'Ny affär', etikett: 'Skapa en ny affär' })}</section>`;
      // Tidslinjens början: när kunden lades in i registret (k.skapad) – står alltid sist och binder ihop linjen; utan aktivitet säger den vad man gör
      const startRad = `<div class="kd-start"><span class="kd-start-ikon" aria-hidden="true"></span><span class="kd-rad-text"><strong>${k.typ === 'klubb' ? 'Klubben' : 'Kunden'} lades in i registret</strong><small>${e(datumText(k.skapad, { ar: true }))}${akt.length ? '' : ' · ingen aktivitet ännu – skriv vad som hände ovanför'}</small></span></div>`;
      // Tidslinjen: alla händelser ritas – balanseraKund visar de senaste (minst fyra) när kolumnen annars blir längre än sidokolumnen
      const tidKort = `<section class="kort kd-tidslinje" ${plats('tidslinje')}><div class="kort-huvud"><h2>${ik('klocka')}Tidslinje</h2><span class="rakna">${plural(akt.length, 'händelse', 'händelser')}</span></div>
            <form class="skrivruta" data-form="anteckning" data-kund="${e(k.id)}">
              <div class="typval" role="radiogroup" aria-label="Typ">${['anteckning', 'mote', 'samtal', 'mejl'].map((t, i) => `<label><input type="radio" name="typ" value="${e(t)}" ${i === 0 ? 'checked' : ''}><span>${emo(UPEMO.akt[t])}${AKT_TYP[t]}</span></label>`).join('')}</div>
              <label class="sr" for="ant-${e(k.id)}">Anteckning</label><textarea class="falt" id="ant-${e(k.id)}" name="text" placeholder="${SKARP ? 'Vad hände? Allt du skriver här syns för hela teamet.' : 'Vad hände? Sparas i den här webbläsaren (prototyp).'}" required data-fel="Skriv vad som hände"></textarea>
              <div class="skrivruta-fot"><label class="kryss skrivruta-folj"><input type="checkbox" name="folj"><span>Följ upp <input class="falt" type="date" name="datum" value="${omDagar(3)}" min="${idag()}" max="${omDagar(730)}" data-fel="Välj ett uppföljningsdatum från idag och högst två år framåt" aria-label="Uppföljningsdatum"></span></label>
                <button class="knapp knapp-mork" type="submit">Spara</button></div>
            </form>
            <div class="tidslinje" data-kd-tidslinje>${akt.length ? tidslinje(akt) : ''}${startRad}</div>
            ${akt.length > 4 ? `<button class="kd-fler" type="button" data-g="kd-fler" data-kund="${e(k.id)}" hidden><span data-kd-fler-text>Visa alla händelser</span>${ik('pil')}</button>` : ''}</section>`;
      const kontaktKort = `<section class="kort kd-kontakter" ${plats('kontakter')}><div class="kort-huvud"><h3>${ik('mote')}Kontaktpersoner</h3>${kontakter.length ? nyKontakt() : ''}</div>
            ${kontakter.length ? `<div class="kd-lista">${kontakter.map((c) => `<div class="kontaktkort"><span class="avatar">${e(initialer(c.namn))}</span><div class="kontaktkort-inre"><strong>${e(c.namn)}</strong>${c.roll ? `<small>${e(c.roll)}</small>` : ''}</div>${c.id ? `<button class="handelse-knapp kontaktkort-andra" type="button" data-g="andra-kontakt" data-kund="${e(k.id)}" data-id="${e(c.id)}" aria-label="Ändra ${e(c.namn)}" title="Ändra">${ik('redigera')}</button>` : ''}
              ${c.tel || c.epost ? `<div class="kontaktkort-lankar">${c.tel ? kontaktLank('tel', `tel:${c.tel.replace(/\s/g, '')}`, c.tel, 'Telefon') : ''}${c.epost ? kontaktLank('mejl', `mailto:${c.epost}`, c.epost, 'E-post') : ''}</div>` : ''}</div>`).join('')}</div>`
              : tomrad({ ikon: 'anstallda', ton: 'is', rubrik: 'Inga kontaktpersoner', under: 'Vem pratar vi med hos kunden?', attr: `data-g="ny-kontakt" data-kund="${e(k.id)}"`, knapp: 'Lägg till', etikett: 'Lägg till en kontaktperson' })}</section>`;
      // Att göra och Dokument är svängkort: balanseraKund ställer dem i huvudkolumnen (före tidslinjen) när det gör kolumnerna jämnare
      const todoKort = `<section class="kort kd-attgora" ${plats('attgora')} data-kd-svang><div class="kort-huvud"><h3>${ik('todo')}Att göra</h3>${todos.length ? nyTodo() : ''}</div>
            ${todos.length ? `<div class="kd-lista">${todos.map((t) => todoRad(t, { visaKund: false })).join('')}</div>` : tomrad({ ikon: 'todo', ton: 'mint', rubrik: 'Inget att göra', under: 'Nästa sak för kunden hamnar här och i Att göra', attr: `data-g="ny-todo" data-kund="${e(k.id)}"`, knapp: 'Ny', etikett: 'Lägg till att göra för kunden' })}</section>`;
      // Arkivet i en rad: kundens offerter, ordrar, avtal, underlag och filer (samma poster som Dokument) och det som behöver
      // hanteras – kortet räknade förut bara uppladdade filer (1 för en kund som också har en offert)
      const arkivPoster = dokPoster(k.id); const aktuella = arkivPoster.filter((p) => p.lage !== 'arkiv');
      const perFack = FACK.map((f) => [f, aktuella.filter((p) => p.fack === f.id).length]).filter(([, n]) => n);
      const attHantera = dokAtgarder(arkivPoster, k.id).length;
      const arkivRad = aktuella.length ? `<a class="kd-dok-arkiv" href="#/dokument/${e(k.id)}">${emo(UPEMO.sak.dokument, { ruta: 's', ton: 'is' })}<span><strong>${plural(aktuella.length, 'dokument', 'dokument')} i arkivet</strong><small>${perFack.map(([f, n]) => `${e(f.namn)} ${n}`).join(' · ')}${attHantera ? ` · <b>${plural(attHantera, 'att hantera', 'att hantera')}</b>` : ''}</small></span>${ik('pil')}</a>` : '';
      const dokKort = `<section class="kort kd-dokument" ${plats('dokument')} data-kd-svang><div class="kort-huvud"><h3>${ik('dokument')}Dokument</h3><span class="kd-dok-hoger">${arkivRad ? '' : `<span class="rakna">${docs.length}</span>`}<a class="kortlank" href="#/dokument/${e(k.id)}" title="Offerter, ordrar, avtal, underlag och filer för ${e(k.namn)}">Alla${ik('pil')}</a></span></div>
            ${arkivRad}${docs.length ? `<div class="kd-lista">${dokLista(docs)}</div>` : ''}${affarUppladdning(k.id, '', !docs.length)}</section>`;
      return `<div class="rutnat-2 kd-rum" data-kd-rum data-kd-kund="${e(k.id)}">
        <div class="kd-huvud" data-kd-huvud>${iPlats('komigang', komIgangHtml(k, af, akt))}${iPlats('nasta', nastaKundHtml(k, af))}${affarer}${iPlats('tester', testhistorikHtml(k))}${tidKort}</div>
        <div class="kd-sida" data-kd-sida>${klubbKort}${kontaktKort}${todoKort}${dokKort}</div>
        <div class="kd-bred" data-kd-bred></div>
      </div>`;
    }
  }

  /* 07-vyer: säljtavla och affär ------------------------------------------------- */
  const saljUi = { vem: 'alla', forlorade: false, sok: '', filter: [], ordning: 'senast', vy: 'tavla', sortKol: 'viktat', sortRikt: -1 };
  const stegFarg = (id) => STEGFARG[id === 'signerad' ? 'vunnet' : id] || STEGFARG.kontakt;

  // Smart sannolikhet: grund per steg, justerad efter signaler – varje justering förklaras
  const sannolikhet = (a) => {
    if (a.steg === 'signerad') return { p: 1, skal: ['Order signerad'] };
    if (a.steg === 'forlorad') return { p: 0, skal: ['Förlorad'] };
    // Kunden har signerat ordern (kundlänken) men affären är inte överlämnad än – i praktiken vunnen
    if (a.steg === 'underlag' && orderSignerad(a)) return { p: 0.95, skal: ['95 %: kunden har signerat ordern', 'Räknas som vunnen när den är överlämnad till testteamet'] };
    const steg = SALJSTEG.find((x) => x.id === a.steg);
    let p = SANNOLIKHET[a.steg] || 0; const skal = [`Grundchans ${Math.round(p * 100)} % för ${steg ? steg.namn.toLowerCase() : a.steg}`];
    const d = -dagarTill(a.stegAndrad);
    if (d >= 21) { p -= 0.1; skal.push('−10 %: ingen rörelse på 21+ dagar'); }
    else if (d <= 3) { p += 0.05; skal.push('+5 %: rörelse de senaste dagarna'); }
    const k = kund(a.kundId); if (k && k.viaKlubb) { p += 0.05; skal.push('+5 %: introducerad via klubb'); }
    const l = lankFor(a.id);
    if (l && l.status === 'inskickad') { p += 0.1; skal.push('+10 %: kundunderlaget är inskickat'); }
    else if (l && l.status === 'paborjad') { p += 0.03; skal.push('+3 %: kunden fyller i underlaget'); }
    if (a.steg === 'underlag') { const klara = ['info', 'samtycke', 'pub', 'order'].filter((x) => a.check && a.check[x]).length; if (klara) { p += klara * 0.02; skal.push(`+${klara * 2} %: ${klara} av 4 kontrollpunkter klara`); } }
    p = Math.max(0.02, Math.min(0.95, p));
    return { p, skal };
  };
  const sannNiva = (p) => (p >= 0.6 ? 'hog' : p >= 0.3 ? 'mellan' : 'lag');

  // Vad borde hända härnäst med affären?
  const nastaSteg = (a) => {
    const d = -dagarTill(a.stegAndrad); const l = lankFor(a.id);
    switch (a.steg) {
      case 'kontakt': return d >= 7 ? { text: `Boka kundbesök – ${d} dagar sedan kontakt`, ikon: 'kalender', emo: UPEMO.salj.besok, varm: true } : { text: 'Boka kundbesök', ikon: 'kalender', emo: UPEMO.salj.besok };
      case 'besok': {
        // Offerten finns redan (skapad i kundbesöket): nästa steg är att skicka eller följa upp den – inte att skapa en till
        const o = dokFor(a.id, 'offert');
        if (o && !dokKlar(o) && !dokUtgangen(o)) return o.status === 'oppnad' ? { text: 'Kunden har öppnat offerten – följ upp', ikon: 'samtal', emo: UPEMO.larm.samtal, varm: true } : { text: 'Skicka offerten till kunden', ikon: 'mejl', emo: UPEMO.akt.mejl, varm: d >= 10 };
        return { text: 'Ta fram och skicka offert', ikon: 'dokument', emo: UPEMO.sak.offert, varm: d >= 10 };
      }
      case 'offert': {
        const o = dokFor(a.id, 'offert');
        if (o && dokUtgangen(o)) return { text: 'Offerten har gått ut – skapa en ny version', ikon: 'dokument', emo: UPEMO.sak.offert, varm: true };
        if (o && o.status === 'oppnad') return { text: `Kunden har öppnat offerten – följ upp`, ikon: 'samtal', emo: UPEMO.larm.samtal, varm: true };
        if (o && o.status === 'skickad' && -dagarTill(o.skapad.slice(0, 10)) >= 3) return { text: 'Offerten är inte öppnad ännu', ikon: 'mejl', emo: UPEMO.akt.mejl, varm: true };
        if (!o) return { text: 'Skapa offert till kunden', ikon: 'dokument', emo: UPEMO.sak.offert, varm: d >= 3 };
        return d >= 7 ? { text: `Följ upp offerten (${d} d)`, ikon: 'samtal', emo: UPEMO.larm.samtal, varm: true } : { text: 'Invänta besked på offerten', ikon: 'klocka', emo: UPEMO.sak.vantar };
      }
      case 'underlag': {
        // Signerad order: samma sak som uppgiften i Att göra – fakturera förskottet och överlämna (kontrollpunkterna bockas i överlämningen)
        if (orderSignerad(a)) return { text: 'Ordern är signerad – överlämna till testteamet', ikon: 'bock', emo: UPEMO.sak.signering, klar: true, signerad: true };
        // Ordern makulerades (kontrollpunkten Order står kvar ibockad) – en ny order behövs innan överlämningen
        const makU = orderMakulerad(a);
        if (makU) return { text: makuleradText(a, makU, { fore: false }), ikon: 'varning', emo: UPEMO.sak.varning, varm: true, makulerad: makU };
        if (l && l.status === 'inskickad' && a.offert.underlag !== l.token) return { text: 'Underlaget är inne – gör om till offert', ikon: 'dokument', emo: UPEMO.larm.inne, varm: true, underlag: true };
        if (l && l.status !== 'inskickad') return lankUtgangen(l) ? { text: 'Kundlänken har gått ut – förläng den', ikon: 'lank', emo: UPEMO.sak.lank, varm: true, underlag: true } : { text: 'Kunden fyller i underlaget', ikon: 'lank', emo: UPEMO.larm.fyller, underlag: true, kund: true };
        const saknas = [['info', 'infodokumentet'], ['samtycke', 'samtyckena'], ['pub', 'PUB-avtalet'], ['order', 'ordern']].filter(([x]) => !(a.check && a.check[x])).map(([, n]) => n);
        return saknas.length ? { text: `Väntar på ${saknas[0]}`, ikon: 'varning', emo: UPEMO.sak.vantar, varm: d >= 7 } : { text: 'Redo att signera och överlämna', ikon: 'bock', emo: UPEMO.sak.signering, klar: true };
      }
      case 'signerad': {
        const p = projektForAffar(a.id); const st = p && PROJSTEG.find((x) => x.id === p.steg);
        // Ordern är makulerad: det går före projektets steg (testdagen ska inte bli av utan en giltig order)
        const mak = p && p.steg === 'klar' ? null : orderMakulerad(a);
        if (mak) return { text: makuleradText(a, mak, { fore: !p || projStegIndex(p.steg) <= projStegIndex('test') }), ikon: 'varning', emo: UPEMO.sak.varning, varm: true, makulerad: mak };
        if (!st) return { text: 'Överlämnad', ikon: 'projekt', emo: UPEMO.salj.signerad };
        if (p.steg === 'klar') return { text: 'Projektet är klart', ikon: 'projekt', emo: UPEMO.proj.klar, klar: true };
        // Säljarens tur (PROJSTEG.agare, eller ett returnerat underlag): säg det – annars såg det ut som att inget väntade på säljaren
        const hos = a.ansvarig === jag ? 'Din tur' : `Hos ${anv(a.ansvarig).kort}`;
        if (p.steg === 'underlag' && p.underlagStatus === 'returnerat') return { text: `${hos}: underlaget är returnerat – komplettera`, ikon: 'retur', emo: UPEMO.larm.retur, varm: true };
        if (st.agare === 'salj') return { text: `${hos}: ${st.namn}`, ikon: 'projekt', emo: UPEMO.proj[p.steg], varm: p.steg === 'slutfaktura' };
        return { text: `Hos testteamet: ${st.namn}`, ikon: 'projekt', emo: UPEMO.proj[p.steg] };
      }
      default: return null;
    }
  };

  const saljFilter = (lista) => {
    const q = saljUi.sok.trim().toLowerCase();
    return lista.filter((a) => {
      if (saljUi.vem !== 'alla' && a.ansvarig !== saljUi.vem) return false;
      const k = kund(a.kundId);
      if (q && ![k.namn, a.titel, k.stad, k.bransch].some((v) => String(v || '').toLowerCase().includes(q))) return false;
      if (saljUi.filter.includes('klubb') && !k.viaKlubb) return false;
      if (saljUi.filter.includes('kall') && !(arOppen(a) && -dagarTill(a.stegAndrad) >= 14)) return false;
      if (saljUi.filter.includes('underlag') && !lankFor(a.id)) return false;
      // "Behöver dig idag" (knappen i hjälten): samma urval som antalet där – nästa steg är ditt och brådskar
      if (saljUi.filter.includes('varm')) { const ns = arOppen(a) && nastaSteg(a); if (!(ns && ns.varm && !ns.kund)) return false; }
      return true;
    });
  };
  const ordna = (lista) => {
    const f = { senast: (a) => a.stegAndrad, varde: (a) => affarVarde(a), viktat: (a) => affarVarde(a) * sannolikhet(a).p, aldst: (a) => -dagarTill(a.stegAndrad) }[saljUi.ordning] || ((a) => a.stegAndrad);
    return [...lista].sort((x, y) => (f(x) < f(y) ? 1 : f(x) > f(y) ? -1 : 0));
  };

  // Kortet (stil i sidor.css modul 04): företaget och affären överst i kortets hela bredd, sedan värdet med "viktat" under och
  // sannolikhetsringen till höger (värde × chans = viktat), nästa steg, taggar och foten
  const affarskort = (a, i = 0) => {
    const k = kund(a.kundId); const dagar = -dagarTill(a.stegAndrad); const v = affarVarde(a);
    const oppen = arOppen(a); const sn = sannolikhet(a); const ns = nastaSteg(a);
    const paket = a.offert.eget != null ? 'Idrott' : a.offert.typ === 'uppfoljning' ? 'Coaching' : a.offert.deltagare ? `${a.offert.deltagare.length} pers` : (PRISER.paket[a.offert.paket] || {}).namn;
    const todos = db.todos.filter((t) => t.kundId === a.kundId && !t.klar).length;
    const l = lankFor(a.id);
    // Underlagschippet upprepas inte när nästa steg redan handlar om underlaget
    const underlag = !l || a.steg === 'signerad' || (ns && ns.underlag) ? '' : l.status === 'inskickad' ? '<span class="chip chip-ok">Underlag inne</span>' : l.status === 'paborjad' ? '<span class="chip chip-gul">Kunden fyller i</span>' : '<span class="chip chip-is">Länk skickad</span>';
    const nasta = oppen ? SALJSTEG[saljStegIndex(a.steg) + 1] : null;
    const alder = Math.min(1, dagar / 21);
    const stegNamn = (SALJSTEG.find((s) => s.id === a.steg) || {}).namn || '';
    const etikett = `${k.namn}, ${a.titel}, ${kr(v)}, ${stegNamn}${oppen ? `, ${Math.round(sn.p * 100)} procent sannolikhet` : ''}${ns ? `. Nästa steg: ${ns.text}` : ''}`;
    return `<a class="affarskort" href="#/affar/${e(a.id)}" draggable="false" data-affar="${e(a.id)}" data-tilt="6" style="--k:${i}" aria-label="${e(etikett)}" ${senastFlyttad === a.id ? 'data-landat' : ''}>
      <div class="affarskort-namn"><strong>${e(k.namn)}</strong><small title="${e(a.titel)}">${e(a.titel)}</small></div>
      <div class="affarskort-belopp">
        <div class="affarskort-varde">${kr(v)}${oppen ? `<small>viktat ${krKort(v * sn.p)}</small>` : ''}</div>
        ${oppen ? `<span class="sannolikhet" data-niva="${sannNiva(sn.p)}" style="--p:${Math.round(sn.p * 100)}" title="${e(sn.skal.join('\n'))}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="spar" cx="18" cy="18" r="15.9"/><circle class="fyll" cx="18" cy="18" r="15.9" pathLength="100"/></svg><b>${Math.round(sn.p * 100)}</b><span class="sr"> procent sannolikhet</span></span>` : `<span class="sannolikhet sannolikhet-vunnen" title="Order signerad">${ik('bock')}</span>`}
      </div>
      ${ns ? `<div class="affarskort-nasta ${ns.varm ? 'varm' : ''} ${ns.klar ? 'klar' : ''}">${ns.emo ? emo(ns.emo) : ik(ns.ikon)}<span>${e(ns.text)}</span></div>` : ''}
      <div class="affarskort-taggar"><span class="chip chip-navy">${e(paket)}</span>${klubbChip(k, false)}${underlag}</div>
      <div class="affarskort-fot">${oppen ? chipAlder(dagar) : `<span class="affarskort-dagar">${dagar === 0 ? 'idag' : `${dagar} d`}</span>`}${todos ? `<span class="chip" title="${plural(todos, 'öppen att göra', 'öppna att göra')}">${ik('todo')}${todos}</span>` : ''}${avatar(a.ansvarig, true)}</div>
      ${oppen ? `<span class="varmestapel" data-niva="${alder < 0.34 ? 'ny' : alder < 0.67 ? 'mitt' : 'gammal'}" style="--alder:${Math.max(0.04, alder).toFixed(2)}" aria-hidden="true"></span>` : ''}
      <span class="affarskort-atgarder">
        ${nasta ? `<button type="button" class="atgard" data-g="nasta-steg" data-affar="${e(a.id)}" title="Flytta till ${e(nasta.namn)} (Shift + →)" aria-label="Flytta ${e(k.namn)} till ${e(nasta.namn)}">${ik('pil')}</button>` : ''}
        <button type="button" class="atgard" data-g="snabb" data-flik="anteckning" data-kund="${e(k.id)}" title="Anteckning" aria-label="Anteckning för ${e(k.namn)}">${ik('anteckning')}</button>
        ${a.steg !== 'signerad' ? `<button type="button" class="atgard" data-g="flytta-meny" data-affar="${e(a.id)}" title="Flytta eller markera förlorad" aria-label="Fler val för ${e(k.namn)}">${ik('mer')}</button>` : ''}
      </span></a>`;
  };

  // filtrerat: en sökning eller ett filter är aktivt – då är en tom kolumn "inga träffar", inte ett släppmål
  const kolumnHtml = (s, lista, ki, filtrerat = false) => {
    const f = stegFarg(s.id);
    const summa = sum(lista.map(affarVarde));
    const vsum = sum(lista.filter(arOppen).map((a) => affarVarde(a) * sannolikhet(a).p));
    const snitt = lista.length ? Math.round(sum(lista.map((a) => -dagarTill(a.stegAndrad))) / lista.length) : null;
    const hint = s.id === 'signerad' ? 'Överlämnad till testteamet' : `Grundchans ${Math.round((SANNOLIKHET[s.id] || 0) * 100)} %${snitt == null ? '' : snitt < 1 ? ' · flyttad idag' : ` · ${snitt} d i snitt`}`;
    const aldre = s.id === 'signerad' ? db.affarer.filter((a) => a.steg === 'signerad' && -dagarTill(a.stegAndrad) > 90).length : 0;
    const tomText = filtrerat ? `<p class="kolumn-tom" data-filter>Inga träffar i steget</p>` : s.id === 'signerad' ? '<p class="kolumn-tom" data-filter>Inga ordrar de senaste 90 dagarna</p>' : `<p class="kolumn-tom">${emo(UPEMO.sak.tomt)}Släpp en affär här</p>`;
    return `<section class="kolumn" data-steg="${e(s.id)}" aria-label="${e(s.namn)}, ${plural(lista.length, 'affär', 'affärer')}" style="--steg-farg:${f[2]};--steg-ljus:${f[0]};--kol:${ki}">
      <div class="kolumn-huvud">
        <div class="kolumn-titel" title="${e(s.namn)}${s.kontroll ? ' – kontrollpunkt' : ''}">${emo(UPEMO.salj[s.id], { ruta: 'xs', ton: 'steg' })}<span class="kolumn-namn">${e(s.namn)}</span>${s.kontroll ? '<i class="kontroll-prick" title="Kontrollpunkt" aria-label="Kontrollpunkt"></i>' : ''}<span class="rakna">${lista.length}</span></div>
        <div class="kolumn-tal"><strong>${krKort(summa)}</strong><span>${s.id === 'signerad' ? 'senaste 90 dagarna' : `viktat ${krKort(vsum)}`}</span></div>
        <div class="kolumn-hint" title="${e(s.hint || '')}">${hint}</div>
      </div>
      <div class="kolumn-kort">${lista.map((a, i) => affarskort(a, i)).join('') || tomText}
        ${s.id !== 'signerad' ? `<button class="kolumn-ny" type="button" data-g="ny-affar" data-steg="${e(s.id)}" aria-label="Ny affär i ${e(s.namn)}" title="Ny affär i ${e(s.namn)}">${ik('plus')}<span>Ny affär</span></button>` : aldre ?`<p class="kolumn-fot-text">+ ${plural(aldre, 'äldre order', 'äldre ordrar')} – finns under respektive kund</p>` : ''}</div></section>`;
  };

  const LISTKOLUMNER = [['kund', 'Kund & affär'], ['steg', 'Steg'], ['varde', 'Värde'], ['sannolikhet', 'Sannolikhet'], ['viktat', 'Viktat'], ['dagar', 'I steget'], ['nasta', 'Nästa steg'], ['ansvarig', 'Ansvarig']];
  const listaHtml = (lista) => {
    const oppna = lista.filter(arOppen);
    const nyckel = { kund: (a) => kund(a.kundId).namn, steg: (a) => saljStegIndex(a.steg), varde: affarVarde, sannolikhet: (a) => sannolikhet(a).p, viktat: (a) => affarVarde(a) * sannolikhet(a).p, dagar: (a) => -dagarTill(a.stegAndrad), nasta: (a) => (nastaSteg(a) || {}).text || '', ansvarig: (a) => anv(a.ansvarig).kort };
    const f = nyckel[saljUi.sortKol] || nyckel.viktat;
    // Text sorteras på svenska (Å, Ä, Ö sist i rätt ordning)
    const jamfor = (a, b) => (typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), 'sv') : a > b ? 1 : a < b ? -1 : 0);
    const sorterade = [...oppna].sort((x, y) => jamfor(f(x), f(y)) * saljUi.sortRikt);
    const totVarde = sum(sorterade.map(affarVarde)); const totViktat = sum(sorterade.map((a) => affarVarde(a) * sannolikhet(a).p));
    return `<section class="kort affarslista"><div class="tabell-rulla"><table class="tabell"><thead><tr>${LISTKOLUMNER.map(([id, namn]) => `<th ${['varde', 'sannolikhet', 'viktat', 'dagar'].includes(id) ? 'class="num"' : ''} aria-sort="${saljUi.sortKol === id ? (saljUi.sortRikt > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sorterknapp" data-g="sortera" data-kol="${e(id)}">${namn}${saljUi.sortKol === id ? (saljUi.sortRikt > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${sorterade.map((a, i) => { const k = kund(a.kundId); const sn = sannolikhet(a); const ns = nastaSteg(a); const d = -dagarTill(a.stegAndrad); const p = Math.round(sn.p * 100);
        return `<tr data-href="#/affar/${e(a.id)}" style="--k:${i}"><td><div class="kundcell">${loggaRuta(k)}<div><a href="#/affar/${e(a.id)}">${e(k.namn)}</a><small>${e(a.titel)}</small></div></div></td><td>${stegChip(a)}</td><td class="num">${kr(affarVarde(a))}</td>
          <td class="num" title="${e(sn.skal.join('\n'))}"><span class="sannolikhet-stapel" style="--p:${p}"><i></i></span> ${p} %</td><td class="num">${kr(affarVarde(a) * sn.p)}</td>
          <td class="num" ${d >= 14 ? 'style="color:var(--rod-text);font-weight:600"' : ''}>${d} d</td><td>${ns ? `<span class="nasta-text ${ns.varm ? 'varm' : ''}">${ns.emo ? emo(ns.emo) : ik(ns.ikon)}${e(ns.text)}</span>` : ''}</td><td>${avatar(a.ansvarig, true)}</td></tr>`; }).join('') || `<tr><td colspan="8">${(saljUi.sok || saljUi.filter.length || saljUi.vem !== 'alla' ? tom('Inga affärer matchar filtret.', { knapp: '<button class="knapp knapp-kontur knapp-liten" type="button" data-g="rensa-filter">Rensa filter</button>' }) : tom('Inga öppna affärer just nu.', { knapp: '<button class="knapp knapp-kontur knapp-liten" type="button" data-g="ny-affar" data-steg="kontakt">Ny affär</button>' }))}</td></tr>`}</tbody>
      ${sorterade.length ? `<tfoot><tr><td colspan="2"><strong>Summa · ${plural(sorterade.length, 'affär', 'affärer')}</strong></td><td class="num"><strong>${kr(totVarde)}</strong></td><td></td><td class="num"><strong>${kr(totViktat)}</strong></td><td colspan="3"></td></tr></tfoot>` : ''}</table></div></section>`;
  };

  // Inga träffar på tavlan (stil i sidor.css modul 04). Varje sak sägs en gång: med ETT aktivt filter står en knapp som tar bort
  // just det (filterraden ovanför visar redan vilket); med två eller fler står filtren som chip med × och Rensa filter.
  const SALJ_FILTERNAMN = { klubb: 'Via klubb', kall: 'Stått still 14+ d', underlag: 'Kundunderlag', varm: 'Behöver dig idag' };
  const saljAktivaFilter = (q) => [
    q ? { attr: 'data-g="salj-sok-rensa"', fore: ik('sok'), text: `”${e(q)}”`, aria: `Ta bort sökningen ${e(q)}`, knapp: 'Ta bort sökningen' } : null,
    saljUi.vem !== 'alla' ? { attr: 'data-g="salj-vem" data-vem="alla"', fore: avatar(saljUi.vem, true), text: e(anv(saljUi.vem).kort), aria: `Visa alla säljare, inte bara ${e(anv(saljUi.vem).namn)}`, knapp: 'Visa alla säljare' } : null,
    ...saljUi.filter.map((f) => ({ attr: `data-g="salj-filter" data-filter="${e(f)}"`, fore: '', text: e(SALJ_FILTERNAMN[f] || f), aria: `Ta bort filtret ${e(SALJ_FILTERNAMN[f] || f)}`, knapp: `Ta bort filtret ${e(SALJ_FILTERNAMN[f] || f)}` })),
  ].filter(Boolean);
  const saljChip = (x, klass = '') => `<button type="button" class="st-chip${klass}" ${x.attr} aria-label="${x.aria}">${x.fore}<span>${x.text}</span>${ik('stang')}</button>`;
  const saljTomHtml = (antalOppna, q) => {
    const aktiva = saljAktivaFilter(q);
    const atgard = aktiva.length === 1
      ? `<button class="knapp knapp-accent" type="button" ${aktiva[0].attr}>${ik('stang')}${aktiva[0].knapp}</button>`
      : `${aktiva.length ? `<div class="st-chips" role="group" aria-label="Aktiva filter">${aktiva.map((x) => saljChip(x)).join('')}</div>` : ''}
        <button class="knapp knapp-accent" type="button" data-g="rensa-filter">${ik('aterstall')}Rensa filter</button>`;
    return `<section class="salj-tom" aria-labelledby="salj-tom-rubrik">
        <span class="st-ikon" aria-hidden="true">${ik('sok')}</span>
        <h2 id="salj-tom-rubrik">${q ? `Inga affärer matchar ”${e(q)}”` : 'Inga affärer matchar filtret'}</h2>
        <p>Visar 0 av ${plural(antalOppna, 'öppen affär', 'öppna affärer')}.</p>
        ${atgard}
      </section>`;
  };

  const saljYtaHtml = () => {
    const synliga = saljFilter(db.affarer);
    const antalOppna = db.affarer.filter(arOppen).length; const visasOppna = synliga.filter(arOppen).length;
    const filtrerat = !!(saljUi.sok || saljUi.filter.length || saljUi.vem !== 'alla');
    const q = saljUi.sok.trim();
    // Inga kort alls att visa (tavlan: öppna + signerade 90 d, listan: öppna) → EN tom-ruta i stället för fem tomma kolumner/en tom
    // tabell; annars en rad om hur många som visas
    const paTavlan = synliga.filter((a) => arOppen(a) || (a.steg === 'signerad' && -dagarTill(a.stegAndrad) <= 90)).length;
    const ingaTraffar = filtrerat && (saljUi.vy === 'lista' ? !visasOppna : !paTavlan);
    // "Behöver dig idag" (knappen i hjälten) syns inte i filterraden – här står det som chip med × så att man ser vad som filtrerar.
    // Rensa filter bara när det gör något annat än chippet (fler filter, eller inget chip).
    const varm = saljUi.filter.includes('varm') ? saljAktivaFilter(q).find((x) => x.attr.includes('data-filter="varm"')) : null;
    const info = filtrerat && !ingaTraffar ? `<p class="filterinfo"><span>Visar <strong>${visasOppna}</strong> av ${plural(antalOppna, 'öppen affär', 'öppna affärer')}</span>${varm ? saljChip(varm, ' st-chip-varm') : ''}${!varm || saljAktivaFilter(q).length > 1 ? `<button class="knapp knapp-spok knapp-liten" type="button" data-g="rensa-filter">${ik('aterstall')}Rensa filter</button>` : ''}</p>` : '';
    const felreg = synliga.filter(felregistrerad);
    const forlorade = synliga.filter(raknasForlorad).sort((a, b) => String((b.forlorad || {}).datum || b.stegAndrad).localeCompare(String((a.forlorad || {}).datum || a.stegAndrad)));
    const forlorat = `<button class="knapp knapp-spok knapp-liten forlorade-lank" type="button" data-g="visa-forlorade" aria-expanded="${saljUi.forlorade}">${saljUi.forlorade ? 'Dölj' : 'Visa'} förlorade (${forlorade.length})</button>
      ${saljUi.forlorade ? `<section class="kort" style="margin-top:10px">${forlorade.map((a) => `<div class="lank-rad forlorad-rad"><a class="lank-rad-text" href="#/affar/${e(a.id)}"><strong>${e(kund(a.kundId).namn)} – ${e(a.titel)}</strong><small>${a.forlorad ? `Förlorad ${e(datumText(a.forlorad.datum, { ar: true, gemen: true }))} · ` : ''}${e(anv(a.ansvarig).kort)}${a.forlorad && a.forlorad.orsak ? ` · ${e(a.forlorad.orsak)}` : ''}</small></a><span class="lank-rad-hoger"><strong>${kr(affarVarde(a))}</strong><button class="knapp knapp-kontur knapp-liten" type="button" data-g="ateroppna" data-affar="${e(a.id)}">${ik('aterstall')}Återöppna</button></span></div>`).join('') || tom('Inga förlorade affärer.')}${felreg.length ? `<p class="falt-hint forlorade-felreg">${ik('info')}<span>${plural(felreg.length, 'felregistrerad affär räknas', 'felregistrerade affärer räknas')} inte: ${felreg.map((a) => `<a href="#/affar/${e(a.id)}">${e(kund(a.kundId).namn)} – ${e(a.titel)}</a>`).join(', ')}</span></p>` : ''}</section>` : ''}`;
    // tom-rutan: "Visa förlorade" bara när filtret faktiskt har förlorade affärer (annars öppnar den en tom lista)
    if (ingaTraffar) return saljTomHtml(antalOppna, q) + (forlorade.length ? forlorat : '');
    if (saljUi.vy === 'lista') return info + listaHtml(synliga) + forlorat;
    const kol = SALJSTEG.map((st, ki) => { let af = synliga.filter((a) => a.steg === st.id); if (st.id === 'signerad') af = af.filter((a) => -dagarTill(a.stegAndrad) <= 90); return kolumnHtml(st, ordna(af), ki, filtrerat); }).join('');
    return `${info}<div class="tavla-ram" data-fyll-sida><div class="tavla" data-tavla>${kol}</div></div>${forlorat}
      <p class="kortkommandon">${emo(UPEMO.sak.tips)}<span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> gå mellan kort</span><span><kbd>Shift</kbd> + <kbd>←</kbd>/<kbd>→</kbd> flytta kortet<span class="kk-lang"> bakåt/framåt</span></span><span><kbd>/</kbd> filtrera</span><span><kbd>N</kbd> ny affär</span><span><span class="kk-lang">Dra ett kort – släpp längst ner för att markera som förlorad</span><span class="kk-kort">Dra ett kort längst ner = förlorad</span></span></p>`;
  };

  // Smarta förslag: en rad per affär, företaget först och skälet som överrad – med vems del det är
  const smartaForslag = () => {
    const oppna = db.affarer.filter(arOppen); const ut = []; const sedda = new Set();
    const lagg = (x, forst = false) => { if (x.affarId && sedda.has(x.affarId)) return; if (x.affarId) sedda.add(x.affarId); if (forst) ut.unshift(x); else ut.push(x); };
    db.kunder.forEach((k) => { const l = omtestLage(k.id); if (l && l.typ && !l.oppen) lagg({ emo: l.typ === 'omtest' ? UPEMO.larm.omtest : UPEMO.larm.uppfoljning, skal: l.typ === 'omtest' ? 'Dags för omtest' : 'Läge för uppföljning', namn: k.namn, text: `${l.manader} mån sedan testet · ${paketFordelning(affar(l.p.affarId).offert)}`, del: 'din', knapp: `<button class="knapp knapp-liten puls-knapp" type="button" data-g="spinn" data-projekt="${e(l.p.id)}" data-typ="${l.typ === 'uppfoljning' ? 'coaching' : 'omtest'}">Sälj</button>` }, true); });
    const kalla = oppna.filter((a) => -dagarTill(a.stegAndrad) >= 14);
    if (kalla.length) lagg({ emo: UPEMO.larm.still, skal: 'Stått still i 14+ dagar', namn: kalla.length === 1 ? kundNamn(kalla[0].kundId) : `${kalla.length} affärer`, text: kalla.map((a) => kundNamn(a.kundId)).slice(0, 3).join(', '), del: 'din', knapp: '<button class="knapp knapp-liten puls-knapp" type="button" data-g="filter-kall">Visa</button>' });
    Object.entries(db.kundlankar || {}).forEach(([t, l]) => {
      const a = affar(l.affarId); if (!a || !arOppen(a) || l.sparrad) return; const sm = summeraUnderlag(l);
      if (l.status === 'inskickad' && a.offert.underlag !== t) lagg({ affarId: a.id, emo: UPEMO.larm.inne, skal: 'Kundunderlag inne', namn: kundNamn(a.kundId), text: `${plural(sm.antal, 'deltagare', 'deltagare')} · ${krKort(sm.total)} – gör om till offert`, del: 'din', knapp: `<a class="knapp knapp-liten puls-knapp" href="#/affar/${e(a.id)}">Öppna</a>` });
      // En utgången länk är säljarens del (samma som kortets nästa steg): förläng den – kunden kan inte fylla i
      else if (lankUtgangen(l)) lagg({ affarId: a.id, emo: UPEMO.larm.forfallen, skal: 'Kundlänken har gått ut', namn: kundNamn(a.kundId), text: `Gick ut ${datumText(l.utgar, { gemen: true })} · ${plural(sm.antal, 'deltagare', 'deltagare')} ifyllda`, del: 'din', knapp: `<button class="knapp knapp-liten puls-knapp" type="button" data-g="forlang-lank" data-token="${e(t)}">Förläng</button>` });
      // överraden säger läget, brickan i foten vems del det är ("Kundens del") – inte samma sak två gånger; "att rätta" bara när något finns
      else if (l.status === 'paborjad') lagg({ affarId: a.id, emo: UPEMO.larm.fyller, skal: 'Underlag på gång', namn: kundNamn(a.kundId), text: `${plural(sm.antal, 'deltagare', 'deltagare')} hittills${sm.varningar + sm.foretagFel.length ? ` · ${sm.varningar + sm.foretagFel.length} att rätta` : ''}`, del: 'kund', knapp: `<a class="knapp knapp-liten puls-knapp" href="#/affar/${e(a.id)}">Följ</a>` });
    });
    // Följ upp offerten: bara när en offert finns (osvarad) – dagarna räknas från när den skapades
    oppna.filter((a) => { const o = a.steg === 'offert' && dokFor(a.id, 'offert'); return o && !dokKlar(o) && -dagarTill(dagIso(o.skapad)) >= 7 && !db.todos.some((t) => t.kundId === a.kundId && !t.klar && /offert/i.test(t.text)); })
      .forEach((a) => lagg({ affarId: a.id, emo: UPEMO.larm.samtal, skal: 'Följ upp offerten', namn: kundNamn(a.kundId), text: `Skickad för ${-dagarTill(dagIso(dokFor(a.id, 'offert').skapad))} dagar sedan · ${krKort(affarVarde(a))}`, del: 'din', knapp: `<button class="knapp knapp-liten puls-knapp" type="button" data-g="skapa-uppfoljning" data-affar="${e(a.id)}">Att göra</button>` }));
    // Störst viktat värde: den största affär som inte redan finns i listan
    const narmast = [...oppna].sort((x, y) => affarVarde(y) * sannolikhet(y).p - affarVarde(x) * sannolikhet(x).p).find((a) => !sedda.has(a.id));
    if (narmast) { const sn = sannolikhet(narmast); lagg({ affarId: narmast.id, emo: UPEMO.larm.viktat, skal: 'Störst viktat värde', namn: kundNamn(narmast.kundId), text: `${Math.round(sn.p * 100)} % av ${krKort(affarVarde(narmast))} · ${(nastaSteg(narmast) || {}).text || ''}`, del: 'din', knapp: `<a class="knapp knapp-liten puls-knapp" href="#/affar/${e(narmast.id)}">Öppna</a>` }); }
    return ut.slice(0, 4);
  };

  // Säljtratten i CSS (reserv utan WebGL) – också en navigator: klicka på ett steg för att hoppa till kolumnen.
  // Etiketten är stegets symbol (samma som i kolumnhuvudet), kortnamnet (SS_KORT, samma som 3D-etiketterna i smal scen) och beloppet –
  // antalet står i kolumnerna, här i title/aria.
  const trattHtml = (steg) => {
    const max = Math.max(1, ...steg.map((x) => x.varde));
    return `<div class="tratt3d" data-tratt role="group" aria-label="Säljtratt – välj ett steg för att hoppa dit">
      <div class="tratt3d-scen"><span class="tratt3d-axel" aria-hidden="true"></span>
        ${steg.map((x, i) => { const f = stegFarg(x.id); const w = 172 - i * 26; const etikett = `${x.namn}: ${x.id === 'signerad' ? plural(x.antal, 'order', 'ordrar') : plural(x.antal, 'affär', 'affärer')}, ${kr(x.varde)}`;
          return `<div class="tratt-rad" role="button" tabindex="0" data-g="till-kolumn" data-steg="${e(x.id)}" style="--y:${30 + i * 46}px;--w:${w}px;--c1:${f[0]};--c2:${f[2]};--c3:${f[3]};--glod:${(0.25 + 0.75 * x.varde / max).toFixed(2)};--i:${i}" aria-label="${e(etikett)}" title="${e(etikett)}">
            <span class="tratt-glod"></span>${[3, 2, 1].map((z) => `<span class="tratt-skiva lager" style="--dy:${z * 3}px;--z:${z}"></span>`).join('')}<span class="tratt-skiva topp" style="--dy:0px"></span>
            <span class="tratt-etikett" aria-hidden="true">${emo(UPEMO.salj[x.id], { ruta: 'xs', ton: 'steg' })}<span class="tratt-text"><small>${e(SS_KORT[x.id] || x.namn)}</small><strong>${krKort(x.varde)}</strong></span></span></div>`; }).join('')}
      </div></div>`;
  };

  // Säljare i filtret: bara roll sälj, och bara de som har affärer (eller är du / redan valda)
  const saljareIFilter = () => db.anvandare.filter((u) => u.roll === 'salj' && (arAktiv(u) || u.id === saljUi.vem) && (u.id === jag || u.id === saljUi.vem || db.affarer.some((a) => a.ansvarig === u.id)));
  // knappar får linjeikoner (som sök, Tavla/Lista) – emoji bara som markör i innehållet, aldrig i knappar
  const FILTER = [['klubb', 'Via klubb', 'klubb'], ['kall', 'Stått still 14+ d', 'klocka'], ['underlag', 'Kundunderlag', 'dokument']];
  const saljVerktygHtml = () => {
    const antalFor = (id) => { const f = saljUi.filter; saljUi.filter = [id]; const vem = saljUi.vem; const sok = saljUi.sok; saljUi.vem = 'alla'; saljUi.sok = ''; const n = saljFilter(db.affarer).filter(arOppen).length; saljUi.filter = f; saljUi.vem = vem; saljUi.sok = sok; return n; };
    return `<div class="saljverktyg"><div class="sv-rad">
        <div class="falt-sok">${ik('sok')}<input type="search" placeholder="Filtrera tavlan…" value="${e(saljUi.sok)}" aria-label="Filtrera affärerna på tavlan" data-salj-sok><kbd aria-hidden="true">/</kbd></div>
        <div class="saljfilter rullrad"><div class="vemval rullrad" role="group" aria-label="Ansvarig säljare"><button type="button" aria-pressed="${saljUi.vem === 'alla'}" data-g="salj-vem" data-vem="alla">Alla</button>${saljareIFilter().map((u) => `<button type="button" aria-pressed="${saljUi.vem === u.id}" data-g="salj-vem" data-vem="${e(u.id)}" title="${e(u.namn)}">${avatar(u.id, true)}${e(u.kort)}${u.id === jag ? ' (du)' : ''}</button>`).join('')}</div>
        <div class="filterchips rullrad" role="group" aria-label="Snabbfilter">${FILTER.map(([id, namn, em]) => { const n = antalFor(id); const pa = saljUi.filter.includes(id); return `<button type="button" aria-pressed="${pa}" data-g="salj-filter" data-filter="${e(id)}" ${n ? '' : `data-noll${pa ? '' : ' disabled'}`} title="${e(namn)}: ${e(plural(n, 'öppen affär', 'öppna affärer'))}">${ik(em)}${namn}<span class="rakna">${n}</span></button>`; }).join('')}</div></div>
        <div class="salj-visning">${saljVyvalHtml()}${sortvalHtml()}</div>
      </div></div>`;
  };
  // Vyvalet (Tavla/Lista) och sorteringen står i filterraden, högerställda vid tavlan där de gör sin verkan (sidor.css modul 04)
  const saljVyvalHtml = () => `<div class="segment" role="group" aria-label="Vy"><button type="button" aria-pressed="${saljUi.vy === 'tavla'}" data-g="salj-vy" data-vy="tavla">${ik('projekt')}Tavla</button><button type="button" aria-pressed="${saljUi.vy === 'lista'}" data-g="salj-vy" data-vy="lista">${ik('todo')}Lista</button></div>`;
  // Sorteringen hör till tavlan – visas bara där (listan sorteras i kolumnrubrikerna)
  const sortvalHtml = () => `<label class="sortval" ${saljUi.vy === 'tavla' ? '' : 'hidden'}><span>Sortera</span><select class="falt" data-salj-ordning aria-label="Sortera korten">${[['senast', 'Senast ändrad'], ['varde', 'Högst värde'], ['viktat', 'Högst viktat värde'], ['aldst', 'Längst i steget']].map(([v, t]) => `<option value="${e(v)}" ${saljUi.ordning === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;

  // Säljtrattens steg i 3D (scen-salj.js): samma färger som översiktens tratt – blått → cyan → turkos → mint, vunnet i mint
  const SS_FARG = { kontakt: '#3d86e0', besok: '#30a8e8', offert: '#22c6d8', underlag: '#2fd8b0', signerad: '#7ee0c3' };
  // kortnamnen (smal scen, CSS-reserven): "· 90 d" står kvar på skålen – annars kan beloppet läsas som alla signerade ordrar
  const SS_KORT = { kontakt: 'Kontakt', besok: 'Besök', offert: 'Offert', underlag: 'Underlag', signerad: 'Signerad · 90 d' };
  // Stegets etikett vid ringen: en riktig knapp (data-g="till-kolumn" – samma hopp som stegbandet). scen-salj.js placerar den vid
  // ringen och läser stegets tal och affärer ur data-attributen (data-parlor = JSON [{ i: affärsid, v: värde, n: kund, t: affär }],
  // en lysande pärla per affär – hovra för kund och värde, klicka för att öppna affären).
  const ssEtikett = (x, i) => {
    const antal = x.id === 'signerad' ? plural(x.antal, 'order', 'ordrar') : plural(x.antal, 'affär', 'affärer');
    const parlor = JSON.stringify(x.af.slice(0, 24).map((a) => ({ i: a.id, v: Math.round(affarVarde(a)), n: kundNamn(a.kundId), t: a.titel || '' })));
    return `<button type="button" class="ss-steg" data-g="till-kolumn" data-steg="${e(x.id)}" data-i="${i}" data-antal="${x.antal}" data-varde="${Math.round(x.varde)}" data-parlor="${e(parlor)}" style="--farg:${SS_FARG[x.id] || '#7ee0c3'};--i:${i}" aria-label="${e(x.namn)}: ${e(antal)}, ${e(kr(x.varde))} – hoppa till kolumnen" title="${e(x.namn)}: ${e(antal)} · ${e(kr(x.varde))}">
        <i class="ss-ledare" aria-hidden="true"></i>
        <span class="ss-pill" aria-hidden="true"><span class="ss-namn"><b class="ss-lang">${e(x.namn)}</b><b class="ss-kortnamn">${e(SS_KORT[x.id] || x.namn)}</b></span><span class="ss-tal"><strong>${e(krKort(x.varde))}</strong><small>${e(antal)}</small></span></span></button>`;
  };

  function visaSalj() {
    const oppna = db.affarer.filter(arOppen);
    const pipe = sum(oppna.map(affarVarde)); const vikt = viktad(db.affarer);
    const vunna90 = db.affarer.filter((a) => a.steg === 'signerad' && -dagarTill(a.stegAndrad) <= 90);
    const stegData = SALJSTEG.map((st) => { const af = st.id === 'signerad' ? vunna90 : oppna.filter((a) => a.steg === st.id); return { id: st.id, namn: st.id === 'signerad' ? 'Order signerad · 90 d' : st.namn, antal: af.length, varde: sum(af.map(affarVarde)), af: [...af].sort((x, y) => affarVarde(y) - affarVarde(x)) }; });
    const maxSteg = Math.max(1, ...stegData.map((x) => x.varde));
    const forslag = smartaForslag();
    const egenSalj = anv(jag).roll === 'salj';
    const behover = oppna.filter((a) => { const ns = nastaSteg(a); return ns && ns.varm && !ns.kund && (!egenSalj || a.ansvarig === jag); }).length;
    const tomt = !db.affarer.some((a) => a.steg !== 'forlorad');
    const leadsUtan = db.kunder.filter((k) => k.typ === 'foretag' && !affarerFor(k.id).length);
    const delText = { din: 'Din del', kund: 'Kundens del' };
    // Hjälten (stil i sidor.css modul 04): läget i klartext, "behöver dig idag" och Ny affär till vänster, säljtratten i 3D som
    // hjältens bild (scen-salj.js – CSS-tratten är reserv utan WebGL) och nyckeltalen som EN nyckelremsa i nederkanten (samma som
    // översiktens). Smarta förslag ligger i en luftig rad direkt under hjälten. Varje uppgift visas en gång: stegens belopp och antal
    // står vid ringarna, summan och prognosen i remsan. Vyvalet och sorteringen står i filterraden vid tavlan (saljVerktygHtml).
    const snitt = oppna.length ? pipe / oppna.length : 0;
    const storst = oppna.length ? Math.max(...oppna.map(affarVarde)) : 0;
    const minaVarde = sum(oppna.filter((a) => a.ansvarig === jag).map(affarVarde));
    const visaMina = minaVarde > 0 && (anv(jag) || {}).roll === 'salj'; // "Dina …" bara för säljare med egna affärer
    // Utan egna affärer (admin, testteamet): mätaren visar i stället det öppna steg som bär mest av pipelinen – alla fyra
    // poster har då en mätare och remsan blir lika hög överallt
    const tyngst = stegData.filter((x) => x.id !== 'signerad').reduce((m, x) => (x.varde > m.varde ? x : m), { varde: 0 });
    const vunnaAlla = db.affarer.filter((a) => a.steg === 'signerad').length; const forloradeAlla = db.affarer.filter(raknasForlorad).length;
    const vinstgrad = vunnaAlla + forloradeAlla ? vunnaAlla / (vunnaAlla + forloradeAlla) : NaN;
    const matare = (andel, text = '', titel = '') => `<span class="nr-matare"><i style="--andel:${Math.max(0, Math.min(1, isFinite(andel) ? andel : 0)).toFixed(3)}" aria-hidden="true"></i>${text ? `<small${titel ? ` title="${e(titel)}"` : ''}>${text}</small>` : ''}</span>`;
    const remsa = (poster) => `<div class="nyckelremsa salj-remsa" data-antal="${poster.length}">${poster.map((p) => `<div class="nr-post"><span class="nr-etikett">${emo(p.emo, { ruta: 's' })}<span>${e(p.etikett)}</span></span><strong class="nr-varde"${p.tal != null ? ` data-tal="${e(p.tal)}" data-format="${e(p.format || 'antal')}"` : ''}${p.titel ? ` title="${e(p.titel)}"` : ''}>${p.visa}</strong><span class="nr-under">${p.under}</span>${p.mikro || ''}</div>`).join('')}</div>`;
    const scen = `<div class="salj-scen" data-salj-scen>${trattHtml(stegData)}
        <div class="ss-etiketter" data-ss-etiketter role="group" aria-label="Säljtratten – välj ett steg för att hoppa dit i tavlan">${stegData.map(ssEtikett).join('')}</div></div>`;
    const forslagKort = (x, i) => `<article class="forslag sf-kort" data-del="${e(x.del)}" style="--i:${i}">
        <div class="sf-topp">${emo(x.emo, { ruta: 'm' })}<small class="forslag-skal">${e(x.skal)}</small></div>
        <strong class="sf-namn">${e(x.namn)}</strong><p class="sf-text">${e(x.text)}</p>
        <div class="sf-fot"><div class="sf-knapp">${x.knapp}</div>${x.del ? (() => { const af = x.affarId && affar(x.affarId); const annan = x.del === 'din' && af && af.ansvarig && af.ansvarig !== jag; return `<span class="del-bricka" data-del="${annan ? 'salj' : e(x.del)}">${annan ? `${e(anv(af.ansvarig).kort)}s del` : delText[x.del] || ''}</span>`; })() : ''}</div></article>`;
    const forslagSektion = (rubrik, not, lista) => `<section class="salj-forslag" data-salj-forslag data-saljpuls aria-labelledby="sf-rubrik">
        <div class="sf-huvud"><h2 id="sf-rubrik">${emo(UPEMO.sak.tips, { ruta: 's' })}${rubrik}${lista.length ? `<span class="rakna">${lista.length}</span>` : ''}</h2><p>${not}</p></div>
        ${lista.length ? `<div class="sf-rad" data-antal="${lista.length}">${lista.map(forslagKort).join('')}</div>${lista.length > 2 ? `<button class="knapp knapp-kontur knapp-liten forslag-alla" type="button" data-g="forslag-alla">Visa alla (${lista.length})</button>` : ''}` : ''}</section>`;
    const hjalte = tomt
      ? sidhjalte({
          ogon: 'Pipeline', titel: 'Säljtavla', klass: 'sidhjalte-salj sidhjalte-salj-tom', attr: 'data-saljpuls',
          text: '<strong>Säljtavlan är tom – skapa första affären.</strong> En affär hamnar i steget du väljer och räknas fram från prislistan. Sedan flyttar du den genom stegen tills ordern är signerad.',
          knappar: `<button class="knapp knapp-accent" type="button" data-g="ny-affar" title="Ny affär (N)">${ik('plus')}Ny affär <kbd>N</kbd></button><button class="knapp knapp-kontur" type="button" data-g="snabb" data-flik="kund">${ik('plus')}Ny kund</button>`,
        }) + (leadsUtan.length ? forslagSektion('Kunder utan affär', 'Leads som ännu inte har någon affär – börja med en av dem.', leadsUtan.slice(0, 4).map((k) => ({ emo: UPEMO.kundtyp.lead, skal: 'Lead utan affär', namn: k.namn, text: [k.bransch, k.stad].filter(Boolean).join(' · ') || 'Inga uppgifter ännu', del: '', knapp: `<button class="knapp knapp-liten puls-knapp" type="button" data-g="ny-affar" data-kund="${e(k.id)}">Skapa affär</button>` }))) : '')
      : sidhjalte({
          ogon: 'Pipeline', titel: 'Säljtavla', klass: 'sidhjalte-salj', attr: 'data-saljpuls data-rorelse',
          // Ingressen beskriver sidan – antalet öppna affärer står i remsan (och i menyn), inte här också
          text: oppna.length ? '<strong>Från första kontakt till signerad order</strong> – nästa steg står på varje kort.' : '<strong>Inga öppna affärer</strong> just nu.',
          // Uppmaningen är en knapp: den filtrerar tavlan till just de affärerna (samma urval som antalet, se saljFilter)
          under: behover ? `<button class="behover" type="button" data-g="salj-filter" data-filter="varm"${egenSalj ? ` data-vem="${e(jag)}"` : ''} aria-pressed="${saljUi.filter.includes('varm')}" title="Visa bara dem på tavlan">${plural(behover, 'affär', 'affärer')} ${egenSalj ? 'behöver dig idag' : 'i teamet behöver åtgärd idag'}${ik('pil')}${ik('stang')}</button>` : '',
          knappar: `<button class="knapp knapp-accent" type="button" data-g="ny-affar" title="Ny affär (N)">${ik('plus')}Ny affär</button>`,
          extra: `${scen}${remsa([
            // Samma uppbyggnad i alla fyra: etikett, tal, en rad om vad talet är och en mätare med kort text – mätaren bara där
            // det finns ett riktigt tal att jämföra med
            { emo: UPEMO.sak.pipeline, etikett: 'Öppen pipeline', tal: pipe, format: 'krkort', visa: krKort(pipe), titel: kr(pipe), under: oppna.length ? plural(oppna.length, 'öppen affär', 'öppna affärer') : 'inga öppna affärer', mikro: visaMina ? matare(minaVarde / pipe, `Dina ${krKort(minaVarde)}`) : pipe && tyngst.id ? matare(tyngst.varde / pipe, `Mest i ${e((SS_KORT[tyngst.id] || tyngst.namn).toLowerCase())}`, `Största steget: ${tyngst.namn} – ${kr(tyngst.varde)} (${pct(tyngst.varde / pipe)} av pipelinen)`) : '' },
            { emo: UPEMO.larm.viktat, etikett: 'Viktad prognos', tal: vikt, format: 'krkort', visa: krKort(vikt), titel: kr(vikt), under: 'värde × chansen att vinna', mikro: pipe ? matare(vikt / pipe, `${Math.round((vikt / pipe) * 100)} % av pipelinen`) : '' },
            { emo: UPEMO.sak.snitt, etikett: 'Snitt per affär', tal: snitt, format: 'krkort', visa: krKort(snitt), titel: kr(snitt), under: oppna.length ? 'medel för öppna affärer' : 'inga öppna affärer', mikro: storst ? matare(snitt / storst, `Största ${krKort(storst)}`) : '' },
            { emo: UPEMO.roll.salj, etikett: 'Vinstgrad', tal: isFinite(vinstgrad) ? vinstgrad : null, format: 'pct', visa: pct(vinstgrad), under: isFinite(vinstgrad) ? 'vunna av avgjorda affärer' : 'inga avgjorda affärer än', mikro: isFinite(vinstgrad) ? matare(vinstgrad, `${vunnaAlla} vunna · ${forloradeAlla} ${forloradeAlla === 1 ? 'förlorad' : 'förlorade'} totalt`) : '' },
          ])}`,
        }) + forslagSektion('Smarta förslag', forslag.length ? 'Omtest, uppföljningar och affärer som väntar på dig.' : 'Inget som kräver åtgärd just nu.', forslag);
    // Stegbandet (fast när man rullar): namn och antal – beloppen står i tratten och i kolumnerna (och i title).
    // På dator vilar det osynligt så länge kolumnhuvudena syns och tonas in först när de rullat under det (data-fast, markeraFastBand).
    return `${hjalte}
      <nav class="stegband" data-stegband aria-label="Hoppa till steg">${stegData.map((x) => { const f = stegFarg(x.id); return `<button type="button" data-g="till-kolumn" data-steg="${e(x.id)}" style="--steg-farg:${f[2]}" title="${e(x.namn)}: ${x.id === 'signerad' ? plural(x.antal, 'order', 'ordrar') : plural(x.antal, 'affär', 'affärer')} · ${e(kr(x.varde))}"><span class="stegband-namn">${emo(UPEMO.salj[x.id], { ruta: 'xs', ton: 'steg' })}<span>${e(x.id === 'signerad' ? 'Order signerad' : x.namn)}</span></span><span class="stegband-tal">${x.antal}</span><span class="stegband-fyll" style="width:${((x.varde / maxSteg) * 100).toFixed(1)}%"></span></button>`; }).join('')}</nav>
      ${saljVerktygHtml()}
      <div data-salj-yta>${saljYtaHtml()}</div>`;
  }

  // Ritar bara om korten (sök och sortering) – fokus i sökfältet behålls och inget spelar upp sin intro igen
  function uppdateraSaljYta() {
    const yta = $('[data-salj-yta]', vy); if (!yta) return;
    yta.classList.add('utan-intro');
    const gammal = $('[data-tavla]', yta); const x = gammal ? gammal.scrollLeft : 0;
    const varTom = !!$('.salj-tom', yta);
    yta.innerHTML = saljYtaHtml();
    const ny = $('[data-tavla]', yta); if (ny) ny.scrollLeft = x;
    // tom-rutan tonar in bara när den dyker upp – inte vid varje tangent i sökfältet (sidor.css modul 04)
    const tomRuta = $('.salj-tom', yta); if (tomRuta && !varTom) tomRuta.setAttribute('data-ny', '');
    startaStegband();
  }
  // Filter, säljare och vy: rita om verktygen och korten – inte tratten, förslagen eller stegbandet
  function uppdateraSalj() {
    if (!$('[data-salj-yta]', vy)) { rendera(); return; }
    const v = $('.saljverktyg', vy); const fokus = document.activeElement && document.activeElement.closest('.saljverktyg [data-g]');
    // fokus behålls på samma knapp i filterraden (säljare, snabbfilter, Tavla/Lista – vyvalet och sorteringen står där nu)
    const fAttr = fokus ? { 'salj-vem': 'vem', 'salj-filter': 'filter', 'salj-vy': 'vy' }[fokus.dataset.g] : null;
    const nyckel = fokus && fAttr ? `[data-g="${sel(fokus.dataset.g)}"][data-${fAttr}="${sel(fokus.dataset[fAttr] || '')}"]` : null;
    // filterradens piller rullar i sidled på mobilen – de behåller sitt läge när raden ritas om
    const rullat = v ? $$('.saljfilter > .rullrad', v).map((r) => r.scrollLeft) : [];
    if (v) { v.outerHTML = saljVerktygHtml(); const ny = $('.saljverktyg', vy); if (ny) { ny.classList.add('utan-intro'); $$('.saljfilter > .rullrad', ny).forEach((r, i) => { r.scrollLeft = rullat[i] || 0; }); } }
    $$('[data-g="salj-vy"]', vy).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vy === saljUi.vy)));
    // Hjälten ritas inte om: "behöver dig idag" visar om filtret är på (sorteringen följer vyvalet i filterraden, som ritas om ovan)
    const sv = $('.saljverktyg .sortval', vy); if (sv) sv.hidden = saljUi.vy !== 'tavla';
    $$('.sidhjalte-salj [data-g="salj-filter"]', vy).forEach((b) => b.setAttribute('aria-pressed', String(saljUi.filter.includes(b.dataset.filter))));
    const iTomRuta = !!(document.activeElement && document.activeElement.closest('.salj-tom'));
    const iInfo = !!(document.activeElement && document.activeElement.closest('[data-salj-yta] > .filterinfo'));
    uppdateraSaljYta();
    // ett snabbfilter utan träffar är avstängt när det inte är på – fokus går då till närmaste filter som går att välja
    if (nyckel) { const n = $(nyckel, vy); const m = n && n.disabled ? $('.saljverktyg .filterchips button:not(:disabled)', vy) || $('[data-salj-sok]', vy) : n; if (m) m.focus({ preventScroll: true }); }
    // ett filter togs bort i tom-rutan eller i raden "Visar …": fokus till nästa filter där, annars till sökfältet (tavlan syns igen)
    else if (iTomRuta || iInfo) { const n = $('.salj-tom .st-chip', vy) || $('.salj-tom .knapp', vy) || $('[data-salj-yta] > .filterinfo [data-g]', vy) || $('[data-salj-sok]', vy); if (n) n.focus({ preventScroll: true }); }
  }

  // Kortet flyger i en 3D-båge från sin gamla plats till den nya
  function flipFran(id, fran) {
    const ny = $(`.affarskort[data-affar="${sel(id)}"]`, vy); if (!ny || !fran) return;
    const tavla = ny.closest('[data-tavla]');
    if (tavla) { const kol = ny.closest('.kolumn'); const tr = tavla.getBoundingClientRect(); const kr_ = kol.getBoundingClientRect(); if (kr_.left < tr.left || kr_.right > tr.right) tavla.scrollLeft += kr_.left - tr.left - (tr.width - kr_.width) / 2; }
    // Kortet hamnar överst i sin nya kolumn – rulla så att det står under toppraden och det klistrade stegbandet (mobilen: namnet
    // och värdet hamnade annars under bandet och bara knapparna syntes)
    const band = $('[data-stegband]', vy); const grans = Math.max(toppHojd(), band ? band.getBoundingClientRect().bottom : 0) + 12;
    const nr = ny.getBoundingClientRect();
    if (nr.top < grans) scrollBy(0, nr.top - grans);
    else if (nr.bottom > innerHeight - 12 && nr.height < innerHeight - grans) scrollBy(0, nr.bottom - innerHeight + 12);
    if (lugn) { ny.setAttribute('data-glod', ''); return; }
    const till = ny.getBoundingClientRect();
    const dx = fran.left - till.left; const dy = fran.top - till.top; const r = dx >= 0 ? -1 : 1;
    ny.style.zIndex = 60;
    const anim = ny.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, boxShadow: '0 40px 70px -30px rgba(11,21,32,.55)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 50}px) perspective(900px) rotateY(${r * 26}deg) rotateZ(${-r * 5}deg) scale(1.12)`, boxShadow: '0 70px 90px -30px rgba(11,21,32,.5)', offset: 0.45 },
      { transform: 'translate(0, 0) scale(1)', boxShadow: '0 1px 2px rgba(11,21,32,.04)' },
    ], { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)' });
    anim.onfinish = () => { ny.style.zIndex = ''; ny.setAttribute('data-glod', ''); };
  }

  // Konfetti i 3D när en order signeras från tavlan
  function firaVinst(id) {
    const kort = $(`.affarskort[data-affar="${sel(id)}"]`, vy); if (!kort) return;
    kort.setAttribute('data-glod', ''); if (lugn) return;
    // Kortet utanför bild (mobil/surfplatta: kolumnen Order signerad ligger till höger): rulla tavlan dit först, konfettin en stund senare
    const r0 = kort.getBoundingClientRect(); const tavla = kort.closest('[data-tavla]');
    if (tavla && (r0.right > innerWidth || r0.left < 0)) {
      const tr = tavla.getBoundingClientRect(); tavla.scrollTo({ left: tavla.scrollLeft + r0.left - tr.left - Math.max(0, (tr.width - r0.width) / 2), behavior: 'smooth' });
      setTimeout(() => { if (!kort.isConnected) return; const r = kort.getBoundingClientRect(); konfetti(r.left + r.width / 2, r.top + r.height / 3); }, 450);
      return;
    }
    konfetti(r0.left + r0.width / 2, r0.top + r0.height / 3);
  }
  function konfetti(cx, cy, antal = 46) {
    if (lugn) return;
    const farger = ['#7ee0c3', '#a7d2ff', '#f0b545', '#d9822b', '#ffffff', '#2fae8a'];
    const lager = document.createElement('div'); lager.className = 'konfetti-lager'; lager.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < antal; i++) {
      const b = document.createElement('i'); const v = Math.random() * Math.PI * 2; const kraft = 80 + Math.random() * 170;
      b.style.cssText = `left:${cx}px;top:${cy}px;background:${farger[i % farger.length]};--dx:${(Math.cos(v) * kraft).toFixed(0)}px;--dy:${(Math.sin(v) * kraft - 70).toFixed(0)}px;--rx:${(Math.random() * 720 - 360).toFixed(0)}deg;--ry:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 90).toFixed(0)}ms`;
      lager.appendChild(b);
    }
    document.body.appendChild(lager); setTimeout(() => lager.remove(), 1900);
  }

  // Filterraden på mobilen (sidor.css modul 04): säljarna och snabbfiltren rullar i sidled i var sitt piller – kanten tonas där det
  // finns mer att se (data-mer-hoger/-vanster). Pillren ritas om med filterraden, så varje nytt piller kopplas en gång.
  const kantadeRullrader = new WeakSet();
  function kantaFilterrader() {
    $$('.saljfilter > .rullrad', vy).forEach((r) => {
      const kant = () => { const mer = r.scrollWidth - r.clientWidth; r.toggleAttribute('data-mer-hoger', mer > 2 && r.scrollLeft < mer - 2); r.toggleAttribute('data-mer-vanster', mer > 2 && r.scrollLeft > 2); };
      if (!kantadeRullrader.has(r)) {
        kantadeRullrader.add(r);
        r.addEventListener('scroll', kant, { passive: true });
        if ('ResizeObserver' in window) new ResizeObserver((_, ro) => { if (!r.isConnected) { ro.disconnect(); return; } kant(); }).observe(r);
      }
      kant();
    });
  }
  // Stegbandet och tratten markerar vilka kolumner som syns i tavlan
  function startaStegband() {
    kantaFilterrader();
    const band = $('[data-stegband]', vy); if (!band) return;
    const tavla = $('[data-tavla]', vy); let senastBand = '';
    const markera = () => {
      const synliga = [];
      if (tavla && tavla.isConnected) {
        const tr = tavla.getBoundingClientRect();
        $$('.kolumn', tavla).forEach((k) => { const r = k.getBoundingClientRect(); if (Math.max(0, Math.min(r.right, tr.right) - Math.max(r.left, tr.left)) / r.width > 0.6) synliga.push(k.dataset.steg); });
      }
      const alla = synliga.length >= SALJSTEG.length;
      $$('button', band).forEach((b) => b.toggleAttribute('data-synlig', !alla && synliga.includes(b.dataset.steg)));
      $$('.tratt3d .tratt-rad, [data-ss-etiketter] .ss-steg', vy).forEach((r) => r.toggleAttribute('data-aktiv', !alla && synliga.includes(r.dataset.steg)));
      // På smal skärm rullar bandet i sidled – följ med så att det markerade steget syns
      const b = $('button[data-synlig]', band);
      if (b && b.dataset.steg !== senastBand && band.scrollWidth > band.clientWidth + 2) band.scrollTo({ left: Math.max(0, b.offsetLeft - 12), behavior: lugn ? 'auto' : 'smooth' });
      senastBand = b ? b.dataset.steg : '';
      // Tavlan har mer till höger: tona kanten (även på 1280 px där sista kolumnen kapas). Mätt mot sista kolumnens kant – inte
      // scrollWidth, som korten gör tillfälligt bredare när de fälls in i 3D (kort-dela). Då blev tonen kvar och åt upp högerkanten
      // av "Order signerad" fast alla kolumner fick plats (1440/1920 px).
      if (tavla && tavla.isConnected && tavla.parentElement) {
        const sista = tavla.lastElementChild;
        tavla.parentElement.toggleAttribute('data-mer-hoger', !!sista && sista.getBoundingClientRect().right > tavla.getBoundingClientRect().right + 2);
        tavla.parentElement.toggleAttribute('data-mer-vanster', tavla.scrollLeft > 8);
      }
    };
    if (tavla) { let v = false; tavla.addEventListener('scroll', () => { if (v) return; v = true; requestAnimationFrame(() => { v = false; markera(); }); }, { passive: true }); }
    // Tavlans bredd ändras också utan att fönstret gör det (sidomenyn fälls in/ut) – räkna om när storleken har stannat (120 ms,
    // så att snabba mellanlägen inte hinner markera steg); slutar när tavlan ritats om
    if (tavla && 'ResizeObserver' in window) { let t = 0; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (!tavla.isConnected) { ro.disconnect(); return; } markera(); }, 120); }); ro.observe(tavla); }
    markera();
    band.style.setProperty('--band-h', `${band.offsetHeight}px`);
    markeraFastBand();
  }
  // Dator: stegbandet säger samma sak som kolumnhuvudena – det vilar osynligt så länge de syns och tonas in (data-fast) först
  // när de har rullat in under bandet. Under en dragning visas det alltid som släppmål (body.drar, sidor.css modul 04).
  let bandRaf = 0;
  function markeraFastBand() {
    bandRaf = 0;
    const band = $('[data-stegband]', vy); if (!band) return;
    const huvud = $('[data-tavla] .kolumn-huvud', vy) || $('.affarslista thead', vy);
    const grans = (parseFloat(getComputedStyle(band).top) || 0) + band.offsetHeight;
    band.toggleAttribute('data-fast', !!huvud && huvud.getBoundingClientRect().bottom < grans);
  }
  addEventListener('scroll', () => { if (!bandRaf && $('[data-stegband]', vy)) bandRaf = requestAnimationFrame(markeraFastBand); }, { passive: true });
  // Vid storleksändring byter bandet läge direkt, utan toning (data-utan-overgang, sidor.css modul 04) – annars tonade det ut
  // ovanpå filterraden när fönstret gick från mobil- till datorbredd (syntes också i helsidesbilder, som ändrar fönstrets storlek)
  addEventListener('resize', () => { const band = $('[data-stegband]', vy); if (band) { band.setAttribute('data-utan-overgang', ''); band.style.setProperty('--band-h', `${band.offsetHeight}px`); markeraFastBand(); requestAnimationFrame(() => requestAnimationFrame(() => band.removeAttribute('data-utan-overgang'))); } });
  // Till tavlan (filter från hjälten och smarta förslag): filterraden överst, under toppraden och – på mobilen – stegbandet
  function tillTavlan() {
    const yta = $('.saljverktyg', vy) || $('[data-salj-yta]', vy); if (!yta) return;
    const band = $('[data-stegband]', vy); const bandSyns = band && matchMedia('(max-width: 999px)').matches;
    const topp = toppHojd() + (bandSyns ? band.offsetHeight + 16 : 12);
    scrollTo({ top: Math.max(0, yta.getBoundingClientRect().top + scrollY - topp), behavior: lugn ? 'auto' : 'smooth' });
  }

  // Tratten gungar sakta och följer musen
  function startaTratt(tratt) {
    // Hjälten: entréerna (tratten faller in, förslagen glider in) spelas en gång och stängs sedan av (data-intro-klar, sidor.css
    // modul 04) – annars spelades de upp igen varje gång raderna göms och visas över en brytpunkt
    const hjalte = tratt.closest('.sidhjalte-salj');
    if (hjalte) setTimeout(() => hjalte.setAttribute('data-intro-klar', ''), lugn ? 0 : 2200);
    if (lugn) return;
    const band = tratt.closest('[data-saljpuls]') || tratt; const scen = $('.tratt3d-scen', tratt);
    let mx = 0, my = 0, cx = 0, cy = 0; const t0 = performance.now();
    band.addEventListener('pointermove', (ev) => { const r = tratt.getBoundingClientRect(); mx = Math.max(-1, Math.min(1, (ev.clientX - (r.left + r.width / 2)) / r.width)); my = Math.max(-1, Math.min(1, (ev.clientY - (r.top + r.height / 2)) / r.height)); });
    band.addEventListener('pointerleave', () => { mx = 0; my = 0; });
    slingaISikte(tratt, (t) => {
      cx += (mx - cx) * 0.06; cy += (my - cy) * 0.06; const sek = (t - t0) / 1000;
      scen.style.setProperty('--py', (Math.sin(sek * 0.4) * 9 + cx * 26).toFixed(2) + 'deg');
      scen.style.setProperty('--px', (Math.sin(sek * 0.3) * 3 - cy * 12).toFixed(2) + 'deg');
    });
  }
  // En rAF-slinga som bara går när elementet syns och fliken är aktiv – stannar helt utanför bild (prestandaregeln)
  function slingaISikte(el, steg) {
    let igang = false; let synlig = true; let raf = 0;
    const tick = (t) => { if (!el.isConnected) { avsluta(); return; } steg(t); raf = requestAnimationFrame(tick); };
    const starta = () => { if (igang || !synlig || document.hidden || !el.isConnected) return; igang = true; raf = requestAnimationFrame(tick); };
    const stoppa = () => { igang = false; cancelAnimationFrame(raf); };
    // Pausad slinga vars element ritats bort städas också (observatören och lyssnaren höll annars kvar det gamla trädet)
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([p]) => { if (!el.isConnected) { avsluta(); return; } synlig = p.isIntersecting; if (synlig) starta(); else stoppa(); }) : null;
    if (io) io.observe(el);
    const vis = () => { if (!el.isConnected) { avsluta(); return; } if (document.hidden) stoppa(); else starta(); };
    document.addEventListener('visibilitychange', vis);
    function avsluta() { stoppa(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', vis); }
    starta();
    return avsluta;
  }

  // Testområden, tillval och program i offerten: linjeikoner ur spriten (index.html) i en liten ruta – inga emoji (användarens önskemål)
  const TILLVAL_IKON = { prestation: 'matare', mobilitet: 'rorlighet', styrka: 'styrka', hopp: 'hopp', mjolksyra: 'droppe', funktion: 'skanna', spirometri: 'andning', hjartkarl: 'puls' };
  const tvIkon = (namn) => `<span class="tv-ikon" aria-hidden="true">${ik(namn)}</span>`;
  const lastOffert = (a) => a.steg === 'signerad' || a.steg === 'forlorad';
  const programRutor = (o, medUppfoljning = true) => `
          <label class="kryss"><input type="checkbox" name="app" ${o.app ? 'checked' : ''}><span>${tvIkon('mobil')}UPerformance App, 12 mån<small>${kr(PRISER.appManad)}/anställd/mån</small></span></label>
          <label class="kryss"><input type="checkbox" name="insights" ${o.insights ? 'checked' : ''}><span>${tvIkon('stapel')}Team Insights<small>${kr(PRISER.insightsAr)}/år</small></span></label>
          ${medUppfoljning ? `<label class="kryss"><input type="checkbox" name="uppfoljning" ${o.uppfoljning ? 'checked' : ''}><span>${tvIkon('kompass')}Uppföljning &amp; coaching<small>${kr(PRISER.uppfoljning)}/anställd, ett omtest</small></span></label>` : ''}`;
  const offertFormHtml = (a) => {
    const o = a.offert; const pr = prisa(o);
    // Signerad eller förlorad: offerten är låst och visas som specifikation (ändras bara genom att återöppna)
    if (lastOffert(a)) {
      const rader = offertRader(o);
      return `<div class="kort-inre falt-grupp offert-last"><p class="chip ${a.steg === 'signerad' ? 'chip-ok' : 'chip-rod'} chip-prick" style="justify-self:start">${ik('las')}${a.steg === 'signerad' ? 'Låst – ordern är signerad' : 'Låst – affären är förlorad'}</p>
        ${o.beskrivning && o.eget != null ? `<p style="color:var(--text-2)">${e(o.beskrivning)}</p>` : ''}
        <div class="tabell-rulla"><table class="tabell"><thead><tr><th>Del</th><th class="num">Antal</th><th class="num">Summa</th></tr></thead><tbody>
          ${rader.map((r) => `<tr style="cursor:default"><td>${e(r.text)}${r.detalj ? `<small style="display:block;color:var(--text-3);font-size:.75rem">${e(r.detalj)}</small>` : ''}</td><td class="num">${e(r.antal)}</td><td class="num">${r.summa == null ? 'Offert' : kr(r.summa)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="2"><strong>Ordervärde</strong></td><td class="num"><strong>${kr(pr.total)}</strong></td></tr></tfoot></table></div>
        <p class="falt-hint" style="margin:0">${a.steg === 'signerad' ? 'Ordern är signerad – ändringar görs i en ny affär (Sälj vidare) så att den signerade ordern stämmer.' : 'Återöppna affären för att ändra offerten.'}</p></div>`;
    }
    if (o.eget != null) {
      return `<div class="kort-inre falt-grupp"><p style="color:var(--text-2)">${e(o.beskrivning || 'Specialoffert utanför standardprislistan.')}</p>
        <label><span class="etikett">Ordervärde (kr, exkl. moms)</span><input class="falt" type="number" min="0" step="1000" value="${e(o.eget)}" data-offert-eget="${e(a.id)}"></label></div>`;
    }
    if (o.typ === 'uppfoljning') {
      const n = prisa(o).antal;
      return `<div class="kort-inre falt-grupp"><p class="chip chip-ok" style="justify-self:start">${ik('kompass')}Uppföljning &amp; coaching · ${plural(n, 'deltagare', 'deltagare')} × ${kr(PRISER.uppfoljning)}</p>
        <p style="color:var(--text-2);font-size:.9rem">Omtest som uppdaterar riskprofilen och justerar träningsprogrammet utifrån utvecklingen sedan förra testet.</p>
        ${o.deltagare && o.deltagare.length ? '' : `<label><span class="etikett">Antal deltagare</span><input class="falt" type="number" min="1" max="10000" step="1" value="${e(n)}" data-offert-coaching="${e(a.id)}"></label>`}
        <form data-offert-program="${e(a.id)}"><span class="etikett">Program</span><div class="tillval-rutnat">${programRutor(o, false)}</div></form></div>`;
    }
    if (o.deltagare && o.deltagare.length) {
      const sm = summeraUnderlag({ deltagare: o.deltagare, foretag: {} });
      return `<div class="kort-inre falt-grupp"><p class="chip chip-ok" style="justify-self:start">${ik('underlag')}Från kundunderlaget · ${plural(o.deltagare.length, 'deltagare', 'deltagare')}</p>
        <div class="tabell-rulla"><table class="tabell"><thead><tr><th>Paket</th><th class="num">Antal</th><th class="num">Summa</th></tr></thead><tbody>
          ${['bas', 'basplus', 'basplusplus'].filter((k) => sm.perPaket[k]).map((k) => `<tr style="cursor:default"><td>${e(PRISER.paket[k].namn)}</td><td class="num">${sm.perPaket[k]}</td><td class="num">${kr(PRISER.paket[k].pris * sm.perPaket[k])}</td></tr>`).join('')}
          ${Object.entries(sm.tillval).map(([t, n]) => `<tr style="cursor:default"><td>+ ${e(PRISER.tillval[t].namn)}</td><td class="num">${n}</td><td class="num">${kr(PRISER.tillval[t].pris * n)}</td></tr>`).join('')}
          ${sm.hjartkarl ? `<tr style="cursor:default"><td>+ Hjärt-/kärlpaket</td><td class="num">${sm.hjartkarl}</td><td class="num">Offert</td></tr>` : ''}</tbody></table></div>
        <form data-offert-program="${e(a.id)}"><span class="etikett">Program</span><div class="tillval-rutnat">${programRutor(o)}</div></form>
        <div><button class="knapp knapp-spok knapp-liten" type="button" data-g="manuell-offert" data-affar="${e(a.id)}">Byt till manuell offert</button></div></div>`;
    }
    const tillvalRad = (id) => {
      const tv = PRISER.tillval[id]; const ingar = pr.ingar.has(id);
      return `<label class="kryss" ${ingar ? 'data-ingar' : ''}><input type="checkbox" name="tillval" value="${e(id)}" ${(o.tillval || []).includes(id) && !ingar ? 'checked' : ''} ${ingar ? 'disabled' : ''}><span>${tvIkon(TILLVAL_IKON[id])}${e(tv.namn)}</span><span class="kryss-pris" data-tv-pris="${e(id)}">${ingar ? 'Ingår' : tv.pris == null ? 'Offert' : kr(tv.pris)}</span></label>`;
    };
    const allaIngar = Object.keys(PRISER.tillval).every((id) => pr.ingar.has(id));
    return `<form class="kort-inre falt-grupp" data-offert-form="${e(a.id)}">
      <div class="falt-rad">
        <label><span class="etikett">Paket</span><select class="falt" name="paket">${Object.entries(PRISER.paket).map(([id, p]) => `<option value="${e(id)}" ${o.paket === id ? 'selected' : ''}>${p.namn} – ${kr(p.pris)}/pers</option>`).join('')}</select></label>
        <label><span class="etikett">Antal medarbetare</span><input class="falt" type="number" min="1" max="5000" name="antal" value="${e(o.antal)}" inputmode="numeric"></label>
      </div>
      <div><span class="etikett">Tillval per medarbetare</span>
        <p class="tillval-alla" data-tillval-alla ${allaIngar ? '' : 'hidden'}>${ik('bock')}<span>Alla tillval ingår i <strong data-tillval-paket>${e((PRISER.paket[o.paket] || {}).namn || '')}</strong></span><button class="knapp knapp-spok knapp-liten" type="button" data-g="visa-tillval">Visa</button></p>
        <div class="tillval-rutnat" data-tillval-rutnat ${allaIngar ? 'hidden' : ''}>${Object.keys(PRISER.tillval).map(tillvalRad).join('')}</div></div>
      <div><span class="etikett">Program</span><div class="tillval-rutnat">${programRutor(o)}</div></div></form>`;
  };
  // Affärsvärdets uppdelning och fakturor. Summan (ordervärdet) står i sidhjälten och uppdateras live via data-affar-varde;
  // "varav engångs / återkommande" visas bara när den säger något som raderna ovanför inte redan gör. Låst affär: bara fördelning och fakturor.
  // Affärssidan: fördelningen som en tunn stapel när affären har mer än en del. Prickarna vid raderna har samma färg;
  // låst affär (raderna står i Offert-kortets specifikation) får namnen under stapeln i stället.
  const AF_DELAR = [['test', 'Tester'], ['uppf', 'Uppföljning & coaching'], ['app', 'UPerformance App'], ['ins', 'Team Insights']];
  const afPrick = (del) => `<i class="af-prick" data-del="${del}" aria-hidden="true"></i>`;
  const fordelningHtml = (pr, medNamn) => {
    const delar = AF_DELAR.filter(([id]) => pr[id] > 0);
    if (delar.length < 2 || !pr.total) return '';
    const andel = (id) => pr[id] / pr.total;
    return `<div class="af-fordelning"><div class="af-stapel" role="img" aria-label="${e(`Fördelning: ${delar.map(([id, n]) => `${n} ${pct(andel(id))}`).join(', ')}`)}">${delar.map(([id]) => `<i data-del="${id}" style="flex:${andel(id).toFixed(4)}"></i>`).join('')}</div>`
      + `${medNamn ? `<p class="af-fordelning-namn">${delar.map(([id, n]) => `<span>${afPrick(id)}${e(n)} <b>${pct(andel(id))}</b></span>`).join('')}</p>` : ''}</div>`;
  };
  const prisHtml = (a) => {
    const pr = prisa(a.offert);
    const stapel = pr.eget ? '' : fordelningHtml(pr, lastOffert(a));
    const prick = (del) => (stapel ? afPrick(del) : ''); // prickarna bara när stapeln visas
    const testRad = pr.underlag ? `<div><dt>${prick('test')}Tester (${plural(a.offert.deltagare.length, 'deltagare', 'deltagare')})</dt><dd>${kr(pr.test)}</dd></div>` : `<div><dt>${prick('test')}Tester (${e(a.offert.antal)} × ${kr(pr.per)})</dt><dd>${kr(pr.test)}</dd></div>`;
    const last = lastOffert(a); // låst affär: raderna står redan i Offert-kortets specifikation
    return `${stapel}<dl class="pengar">
      ${last ? '' : pr.eget ? `<div><dt>Specialoffert</dt><dd>${kr(pr.total)}</dd></div>` : `
      ${pr.coaching ? '' : testRad}
      ${pr.app ? `<div><dt>${prick('app')}UPerformance App, 12 mån</dt><dd>${kr(pr.app)}</dd></div>` : ''}
      ${pr.uppf ? `<div><dt>${prick('uppf')}Uppföljning &amp; coaching${pr.coaching ? ` (${pr.antal} × ${kr(PRISER.uppfoljning)})` : ''}</dt><dd>${kr(pr.uppf)}</dd></div>` : ''}
      ${pr.ins ? `<div><dt>${prick('ins')}Team Insights</dt><dd>${kr(pr.ins)}</dd></div>` : ''}`}
      ${pr.aterkommande && pr.engang && (last || (pr.test && pr.uppf) || (pr.app && pr.ins)) ? `<div><dt>${last ? 'Engångs / återkommande' : 'varav engångs / återkommande'}</dt><dd>${kr(pr.engang)} / ${kr(pr.aterkommande)}</dd></div>` : ''}
      ${a.steg === 'forlorad' ? `<div class="pengar-faktura"><dt>Fakturerat</dt><dd>${kr(0)}</dd></div>` : `<div class="pengar-faktura"><dt>Förskottsfaktura 25 %</dt><dd>${kr(fakturaDelar(pr.total).forskott)}</dd></div>
      <div><dt>Slutfaktura 75 %</dt><dd>${kr(fakturaDelar(pr.total).slut)}</dd></div>`}
      ${pr.offert ? '<p class="chip chip-gul" style="white-space:normal;line-height:1.35">Hjärt-/kärlpaketet offereras separat och ingår inte.</p>' : ''}</dl>
      ${a.steg === 'forlorad' ? '<p class="af-varde-not">Förlorad före order – förskotts- och slutfakturan skapas först när en order signeras.</p>' : ''}`;
  };
  const KB_STEG = [['prognos', 'Prognos'], ['upplupen', 'Upplupen'], ['att-betala', 'Att betala'], ['utbetald', 'Utbetald']];
  const kickbackHtml = (a) => {
    const kb = kickback(a); if (!kb) return '';
    const ki = KB_STEG.findIndex(([id]) => id === kb.status);
    // Klubben står (som länk) i sidhjältens chip; statusen visas en gång – i remsan under beloppet
    return `<section class="kort detalj-klubbkort" style="overflow:hidden" data-affar-kb><div class="relation">${emo(UPEMO.sak.klubb, { ruta: 'm', ton: 'orange' })}<span class="lank-rad-text"><small>Klubbmotorn · ${e(kb.klubb.klubbavtal.procent)} % till <a href="#/kund/${e(kb.klubb.id)}">klubben</a></small><strong>${kr(kb.belopp)}</strong><small>${{ prognos: 'Betalas om affären vinns', upplupen: 'Blir att betala när slutfakturan är skickad', 'att-betala': 'Väntar på utbetalning till klubben', utbetald: `Betalades ut ${datumText(a.kickbackUtbetald, { ar: true, gemen: true })}` }[kb.status]}</small></span></div>
      <ol class="kb-steg" aria-label="Provisionens steg">${KB_STEG.map(([id, namn], i) => `<li data-status="${i < ki ? 'klar' : i === ki ? 'aktiv' : 'kommande'}" ${i === ki ? 'aria-current="step"' : ''}>${namn}</li>`).join('')}</ol></section>`;
  };
  // Minitidslinje för kundlänken: Skapad → Öppnad → Påbörjad → Inskickad
  const lankTidslinje = (l) => {
    const paborjad = l.status === 'paborjad' || l.status === 'inskickad' || (l.deltagare || []).length > 0;
    const steg = [['Skapad', l.skapad, true], ['Öppnad', l.oppnad, !!l.oppnad || l.status !== 'skickad'], ['Påbörjad', paborjad ? l.andrad : null, paborjad], ['Inskickad', l.inskickad, l.status === 'inskickad']];
    return `<ol class="lank-steg">${steg.map(([namn, tid, klar]) => `<li ${klar ? 'data-klar' : ''}><span>${namn}</span><small>${klar && tid ? e(relKort(tid)) : '–'}</small></li>`).join('')}</ol>`;
  };
  const sparradeLankarHtml = (a) => {
    const hist = lankHistorik(a.id); if (!hist.length) return '';
    return `<details class="tidigare"><summary>Tidigare kundlänkar (${hist.length})</summary>${hist.map((h) => `<div class="tidigare-rad"><span class="lank-rad-text"><strong>Kundlänk spärrad ${e(datumText(h.sparrad, { ar: true, gemen: true }))}</strong><small>${plural((h.deltagare || []).length, 'deltagare', 'deltagare')} · skapad ${e(datumText((h.skapad || '').slice(0, 10), { ar: true, gemen: true }))}</small></span><span class="chip chip-rod">Spärrad</span>${(h.deltagare || []).length ? `<button class="knapp knapp-spok knapp-liten" type="button" data-g="visa-deltagare" data-token="${e(h.token)}">Deltagarlista</button>` : ''}</div>`).join('')}</details>`;
  };
  // attr: affärssidans platsattribut (data-af, ordningen på mobilen). Utan länk är kortet en låg rad – aldrig en tom låda.
  const kundunderlagHtml = (a, attr = '') => {
    const l = lankFor(a.id);
    const coaching = a.offert.typ === 'uppfoljning';
    if (!l) {
      const hist = sparradeLankarHtml(a);
      const rad = (text, knapp = '') => `<section class="kort af-kompakt" ${attr}><div class="af-rad">${emo(UPEMO.sak.lank, { ruta: 'm', ton: 'is' })}<span class="af-rad-text"><strong>Kundunderlag</strong><small>${text}</small></span>${knapp}</div>${hist ? `<div class="af-kompakt-hist">${hist}</div>` : ''}</section>`;
      // Förlorad: att affären är förlorad (och Återöppna) står i Nästa steg – kortet visas bara för tidigare länkar
      if (a.steg === 'forlorad') return hist ? rad('Återöppna affären för att skicka en ny kundlänk.') : '';
      if (a.steg === 'signerad' || a.offert.eget != null || coaching) return hist ? rad('Tidigare kundlänkar för affären.') : '';
      // Öppen affär utan länk: "Skapa kundlänk" står som en rad i kortet Till kunden (dokumentKortHtml) – här bara tidigare länkar
      return hist ? rad('Tidigare kundlänkar för affären – skapa en ny i kortet Till kunden.') : '';
    }
    const sm = summeraUnderlag(l); const hl = halsoLage(l, db.halsoformular); const url = lankUrl(l.token); const [txt, cls] = LANKSTATUS[l.status] || LANKSTATUS.skickad;
    const anvands = a.offert.underlag === l.token; const k = kund(a.kundId); const pk = primarKontakt(k);
    const utgangen = lankUtgangen(l); const kvar = l.utgar ? dagarTill(l.utgar) : null;
    // Coaching räknas per person – preliminärt värde följer affärens typ, inte testpaketen
    const prel = coaching ? prisa({ ...a.offert, deltagare: (l.deltagare || []).map((d) => ({ paket: d.paket, tillval: [] })) }).total : sm.total;
    // Innan kunden har börjat fylla i finns inget att rätta – tomma obligatoriska fält räknas först när arbetet har börjat
    const borjat = l.status === 'paborjad' || l.status === 'inskickad' || (l.deltagare || []).length > 0; // företagsuppgifterna är förifyllda från CRM:et
    const attRatta = borjat ? sm.varningar + sm.foretagFel.length : '–';
    const rattaText = !borjat ? 'inget ifyllt än' : [sm.varningar ? plural(sm.varningar, 'rad', 'rader') : '', sm.foretagFel.length ? `${sm.foretagFel.length} företag` : ''].filter(Boolean).join(' · ');
    const brodtext = `Hej${pk ? ' ' + pk.namn.split(' ')[0] : ''}!\n\nHär är länken där ni fyller i underlaget inför hälsokartläggningen – företagsuppgifter och en rad per deltagare:\n${url}\n\nLänken är personlig för ${k.namn} och gäller till ${langtDatum(l.utgar)}. Dela den inte vidare.\n\nVänliga hälsningar\n${anv(a.ansvarig).namn}, Uperformance`;
    // Kopiera vid länken är en lugn spökknapp när Nästa bästa steg redan bär "Kopiera kundlänken" (kontakt utan e-post) – en huvudåtgärd i taget
    const kopieraTon = arOppen(a) && a.steg === 'underlag' && l.status !== 'inskickad' && !utgangen && !(pk && pk.epost) ? 'knapp-spok' : 'knapp-kontur';
    // Öppen affär: dagarna kvar står redan i Nästa bästa steg (datumet i meningen nedan) – chipet bara för stängd affär
    const giltighet = l.status === 'inskickad' || utgangen || arOppen(a) ? '' : kvar != null ? `<span class="chip ${kvar <= 5 ? 'chip-gul' : ''}">${ik('klocka')}Gäller ${kvar === 0 ? 'till idag' : `${plural(kvar, 'dag', 'dagar')} till`}</span>` : '';
    return `<section class="kort af-underlag" data-kundunderlag ${attr}><div class="kort-huvud"><h2>${emo(UPEMO.sak.lank, { ruta: 'm' })}Kundunderlag</h2>${utgangen ? '<span class="chip chip-rod chip-prick">Utgången</span>' : `<span class="chip ${cls} chip-prick">${e(txt)}</span>`}</div>
      <div class="kort-inre" style="display:grid;gap:14px">
        ${utgangen ? `<div class="retur" style="margin:0">${ik('klocka')}<div><strong>Länken gick ut ${e(datumText(l.utgar, { ar: true, gemen: true }))}</strong>Kunden kan inte öppna den. Förläng den 30 dagar så fungerar samma länk igen – det som är ifyllt finns kvar.</div></div>`
          : `<div class="lankruta"><input class="falt" readonly value="${e(url)}" aria-label="Kundlänk" data-markera-allt><button class="knapp ${kopieraTon} knapp-liten" type="button" data-g="kopiera-lank" data-token="${e(l.token)}">Kopiera</button></div>`}
        ${lankTidslinje(l)}
        <dl class="klubbkort-tal ${HALSA ? '' : 'klubbkort-tal-3'}"><div><dt>${emo(UPEMO.sak.team)}Deltagare</dt><dd>${sm.antal}</dd></div><div title="${e(rattaText || 'Inget att rätta')}"><dt>${emo(UPEMO.larm.fyller)}Att rätta</dt><dd>${attRatta}${rattaText ? `<small>${e(rattaText)}</small>` : ''}</dd></div>${HALSA ? `<div><dt>Hälsoformulär</dt><dd>${hl.klara}/${hl.totalt}</dd></div>` : ''}<div><dt>${emo(UPEMO.sak.snitt)}Preliminärt</dt><dd>${krKort(prel)}${coaching ? `<small>${sm.antal} × ${kr(PRISER.uppfoljning)}</small>` : ''}</dd></div></dl>
        <p class="falt-hint" style="margin:0">${l.status === 'inskickad' ? `Inskickat ${e(relTid(l.inskickad))}.` : l.oppnad ? `Öppnad ${e(relTid(l.oppnad))} · senast ändrad ${e(relTid(l.andrad))}. Uppdateras live medan kunden fyller i.` : 'Kunden har inte öppnat länken ännu.'}${HALSA && l.status !== 'inskickad' && sm.antal && !hl.alla ? ` Väntar på hälsoformulär från ${plural(hl.totalt - hl.klara, 'deltagare', 'deltagare')} – underlaget kan skickas in först när alla har svarat.` : ''}${utgangen || l.status === 'inskickad' ? '' : ` Gäller till ${e(datumText(l.utgar, { ar: true, gemen: true }))}.`}</p>
        <div class="knapprad">
          ${giltighet}
          ${utgangen ? `<button class="knapp knapp-accent" type="button" data-g="forlang-lank" data-token="${e(l.token)}">${ik('klocka')}Förläng 30 dagar</button>` : ''}
          ${l.status === 'inskickad' && !anvands && !lastOffert(a) ? `<button class="knapp knapp-accent" type="button" data-g="anvand-underlag" data-affar="${e(a.id)}" data-token="${e(l.token)}">${ik('bock')}Använd som offertunderlag</button>` : ''}
          ${anvands ? '<span class="chip chip-ok">Används som offertunderlag</span>' : ''}
          ${utgangen ? '' : `<a class="knapp knapp-kontur knapp-liten" href="${e(url)}" target="_blank" rel="noopener">Öppna som kund</a>`}
          ${!utgangen && pk && pk.epost ? `<a class="knapp knapp-kontur knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent('Underlag inför hälsokartläggningen – ' + k.namn)}&amp;body=${encodeURIComponent(brodtext)}">${ik('mejl')}E-posta länken</a>` : ''}
          <button class="knapp knapp-spok knapp-liten" type="button" data-g="visa-deltagare" data-token="${e(l.token)}">Deltagarlista</button>
          <button class="knapp knapp-spok knapp-liten" type="button" data-g="sparra-lank" data-token="${e(l.token)}">Spärra länken</button>
        </div>${sparradeLankarHtml(a)}</div></section>`;
  };

  const halsoChip = (status) => { const [t, c] = HALSOSTATUS[status] || HALSOSTATUS['ej-skickat']; return `<span class="chip ${c} chip-prick">${t}</span>`; };
  // Deltagarlistan. Inskickade underlag visar brister som neutral text (de går inte att rätta längre).
  // utanEpost: projektets lista – paket och tillval är det testteamet behöver
  const deltagarTabell = (l, { maskera = true, utanEpost = false } = {}) => {
    const fel = kontrolleraDeltagare(l.deltagare || []); const hl = halsoLage(l, db.halsoformular); const inskickad = l.status === 'inskickad';
    // Projektets lista: har ingen deltagare personnummer blir det ingen kolumn – beskedet står en gång ovanför tabellen i stället
    // för på varje rad. data-etikett: rubriken till cellen när raderna blir kort på mobilen (sidor.css 13b).
    const utanPnr = utanEpost && (l.deltagare || []).length > 0 && !(l.deltagare || []).some((d) => String(d.pnr || '').trim());
    const kolumner = 7 + (HALSA ? 1 : 0) - (utanEpost ? 1 : 0) - (utanPnr ? 1 : 0);
    const felHtml = (alla) => { const lista = utanPnr ? alla.filter((f) => f !== 'Personnummer saknas') : alla; return (!lista.length ? '' : inskickad
      ? `<small class="deltagar-brist">${e(lista.map((f) => (f === 'Personnummer saknas' ? 'Personnummer ej ifyllt' : f)).join(' · '))}</small>`
      : `<span class="deltagar-fel">${lista.map((f) => `<span class="chip chip-rod">${e(f)}</span>`).join('')}</span>`); };
    return `${utanPnr ? `<p class="deltagar-pnr-not">${ik('info')}<span>Personnummer är inte ifyllt för någon av deltagarna.</span></p>` : ''}<div class="tabell-rulla"><table class="tabell deltagartabell"><thead><tr><th>#</th><th>Namn</th>${utanEpost ? '' : '<th>E-post</th>'}${utanPnr ? '' : '<th>Personnummer</th>'}<th>Paket</th><th>Tillval</th>${HALSA ? '<th>Hälsoformulär</th>' : ''}<th class="num">Pris</th></tr></thead><tbody>
      ${(l.deltagare || []).map((d, i) => { const r = prisaDeltagare(d.paket, d.tillval); const tv = (d.tillval || []).filter((t) => !r.ingar.has(t)).map((t) => PRISER.tillval[t].namn); return `<tr style="cursor:default"><td class="deltagar-nr">${i + 1}</td><td class="deltagar-namn"><strong style="font-family:var(--font-rubrik);font-weight:600">${e(d.namn || '–')}</strong>${felHtml(fel[i])}</td>${utanEpost ? '' : `<td data-etikett="E-post">${e(d.epost || '–')}</td>`}${utanPnr ? '' : `<td class="tal" data-etikett="Personnummer">${e(maskera ? (/^\d{8}-•{4}$/.test(String(d.pnr || '')) ? d.pnr : maskeraPnr(normaliseraPnr(d.pnr) || '') || '–') : d.pnr)}</td>`}<td class="deltagar-paket" data-etikett="Paket"><span class="chip chip-navy">${e((PRISER.paket[d.paket] || {}).namn || '')}</span></td><td style="font-size:.8rem;color:var(--text-2)" data-etikett="Tillval">${e(tv.join(', ') || '–')}</td>${HALSA ? `<td data-etikett="Hälsoformulär">${halsoChip(hl.per[d.id].status)}</td>` : ''}<td class="num" data-etikett="Pris">${kr(r.pris)}${r.offert ? ' +' : ''}</td></tr>`; }).join('') || `<tr><td colspan="${kolumner}">Inga deltagare ännu.</td></tr>`}
      </tbody></table></div>`;
  };

  /* 07a-hälsoformulär: sälj ser status, testteamet ser svaren ----------------------------- */
  // token: kundlänkens nyckel – Kontaktad sparas via den (testteamet, G['halsa-kontaktad'])
  const halsoKortHtml = (l, token = '') => {
    const hl = halsoLage(l, db.halsoformular); const arTest = anv(jag).roll === 'test';
    const svarade = (l.deltagare || []).map((d) => ({ d, f: hl.per[d.id].f })).filter((x) => x.f && x.f.status === 'besvarad' && x.f.svar);
    const huvud = `<div class="kort-huvud"><h2>${ik('hjarta')}Hälsoformulär</h2><span class="chip ${hl.alla ? 'chip-ok' : 'chip-is'} chip-prick">${hl.klara} av ${hl.totalt} klara</span></div>`;
    if (!arTest) return `<section class="kort">${huvud}<div class="kort-inre"><p class="retur" style="margin:0;background:var(--is-ljus);color:#1d5b8c">${ik('las')}<span><strong>Svaren syns bara för testteamet</strong>Hälsouppgifter delas inte med sälj eller kunden. ${SKARP ? 'Bara den som är inloggad i testteamet ser dem.' : 'Byt användare till testteamet för att se dem.'}</span></p></div></section>`;
    const namn = (lista, medTel) => lista.map((x) => `${x.f.svar.namn}${medTel ? ` (${x.f.svar.tel})` : ''}`).join(', ');
    const hjl = svarade.filter((x) => x.f.svar.hjartlunga === 'ja');
    const kontakt = svarade.filter((x) => x.f.svar.hinder === 'ja-kontakt');
    const ingen = svarade.filter((x) => x.f.svar.hinder === 'ja-ingen-kontakt');
    /* Får kontaktas: varje person med sitt nummer som ring-länk och knappen Kontaktad (tiden sparas på hälsoformuläret, som bara
       testteamet ser – aktiviteten på kunden nämner ingen hälsouppgift). Kvar att ringa först, de kontaktade sist. */
    const kvar = kontakt.filter((x) => !x.f.kontaktad).length;
    const kontaktRad = (x) => {
      const tel = String(x.f.svar.tel || '').trim(); const k = x.f.kontaktad;
      const knapp = (varde, text, klass) => `<button class="knapp ${klass} knapp-liten" type="button" data-g="halsa-kontaktad" data-lank="${e(token)}" data-deltagare="${e(x.d.id)}" data-varde="${varde}" aria-label="${e(varde === '1' ? `Markera ${x.f.svar.namn} som kontaktad` : `Ångra – ${x.f.svar.namn} är inte kontaktad`)}"${token ? '' : ' disabled'}>${text}</button>`;
      return `<li${k ? ' data-kontaktad' : ''}><span class="halso-kontakt-namn"><strong>${e(x.f.svar.namn)}</strong>${tel ? `<a href="tel:${e(tel.replace(/\s/g, ''))}">${ik('samtal')}${e(tel)}</a>` : '<small>Inget telefonnummer</small>'}</span>
        ${k ? `<span class="chip chip-ok">${ik('bock')}Kontaktad ${e(relTid(k.tid))}${k.av && k.av !== jag ? ` av ${e(anv(k.av).kort)}` : ''}</span>${knapp('0', 'Ångra', 'knapp-spok')}` : knapp('1', `${ik('bock')}Kontaktad`, 'knapp-kontur')}</li>`;
    };
    const flaggor = [
      hjl.length && `<div class="halso-flagga" data-niva="rod">${ik('hjarta')}<span><strong>Hjärt- eller lungproblem · ${hjl.length}</strong>${e(namn(hjl))}</span></div>`,
      kontakt.length && `<div class="halso-flagga halso-flagga-kontakt" data-niva="gul">${ik('samtal')}<span><strong>Medicinskt hinder – får kontaktas · ${kontakt.length}</strong>${kvar ? `${plural(kvar, 'person', 'personer')} att ringa före testet` : 'Alla är kontaktade'}<ul class="halso-kontakter">${[...kontakt].sort((x, y) => Number(!!x.f.kontaktad) - Number(!!y.f.kontaktad)).map(kontaktRad).join('')}</ul></span></div>`,
      ingen.length && `<div class="halso-flagga" data-niva="gul">${ik('info')}<span><strong>Medicinskt hinder – vill inte bli kontaktad · ${ingen.length}</strong>${e(namn(ingen))}. Stäm av på plats före testet.</span></div>`,
    ].filter(Boolean);
    const flaggChips = (v) => [v.hjartlunga === 'ja' && '<span class="chip chip-rod">Hjärta/lunga</span>', v.hinder === 'ja-kontakt' && '<span class="chip chip-gul">Hinder · får kontaktas</span>', v.hinder === 'ja-ingen-kontakt' && '<span class="chip chip-gul">Hinder · ej kontakt</span>'].filter(Boolean).join(' ') || '<span style="color:var(--text-3)">–</span>';
    return `<section class="kort">${huvud}
      <div class="halso-flaggor">${flaggor.length ? flaggor.join('') : svarade.length ? `<div class="halso-flagga" data-niva="ok">${ik('bock')}<span><strong>Inga hälsoflaggor</strong>Ingen av de ${svarade.length} som svarat har angett hjärt- eller lungproblem eller medicinska hinder.</span></div>` : ''}</div>
      <div style="padding:10px 6px 14px"><div class="tabell-rulla"><table class="tabell"><thead><tr><th>Namn</th><th class="num">Ålder</th><th class="num">Längd · vikt</th><th>Ben</th><th>Flaggor</th></tr></thead><tbody>
        ${(() => { const vikt = (d) => { const f = hl.per[d.id].f; const v = f && f.status === 'besvarad' && f.svar; if (!v) return 3; return v.hjartlunga === 'ja' ? 0 : v.hinder && v.hinder !== 'nej' ? 1 : 2; }; return [...(l.deltagare || [])].sort((x, y) => vikt(x) - vikt(y)); })().map((d) => { const f = hl.per[d.id].f; const v = f && f.status === 'besvarad' && f.svar;
          if (!v) return `<tr style="cursor:default"><td class="halso-namn"><strong style="font-family:var(--font-rubrik);font-weight:600">${e(d.namn || '–')}</strong></td><td colspan="4" class="halso-status">${halsoChip(hl.per[d.id].status)}</td></tr>`;
          return `<tr style="cursor:default"><td class="halso-namn"><strong style="font-family:var(--font-rubrik);font-weight:600">${e(v.namn)}</strong><br><small style="color:var(--text-3)">${e(v.titel)}</small></td><td class="num" data-etikett="Ålder">${alderFran(v.fodd) ?? '–'}</td><td class="num" style="white-space:nowrap" data-etikett="Längd · vikt">${e(v.langd)} cm · ${e(String(v.vikt).replace('.', ','))} kg</td><td data-etikett="Ben">${e(svarText('ben', v.ben))}</td><td class="halso-flaggchips" data-etikett="Flaggor">${flaggChips(v)}</td></tr>`; }).join('') || '<tr><td colspan="5">Inga deltagare ännu.</td></tr>'}
      </tbody></table></div></div></section>`;
  };

  /* Skarpt läge: en uppladdad fil skickas först när dokumentposten är sparad på servern (servern tar bara
     emot filen till ett befintligt dokument, en gång, från den som skapade det). Nätverksfel → nytt försök. */
  async function laddaUppNarSparat(lista) {
    let svar = await L.spara(db);
    for (let i = 0; !svar.ok && (svar.status === 0 || svar.status >= 500) && i < 4; i++) {
      await new Promise((r) => setTimeout(r, [2000, 5000, 15000, 30000][i]));
      svar = await L.spara(db);
    }
    for (const [id, fil] of lista) {
      const dok = db.dokument.find((x) => x.id === id);
      if (!dok) continue; // dokumentet sparades inte (krock) – lagret har redan visat varför
      const upp = svar.ok ? await L.filer.laddaUpp(id, fil) : svar;
      if (upp.ok) continue;
      const nu = db.dokument.find((x) => x.id === id);
      if (nu) { nu.fil = false; spara(); if (!ark.open) rendera(); }
      toast(`Kunde inte ladda upp ${fil.name}: ${upp.meddelande || 'okänt fel'}`, null, 'varning');
    }
  }

  /* 07b-offert och order till kund ------------------------------------------------------ */
  const DOKSTATUS = { skickad: ['Skapad', 'chip-navy'], oppnad: ['Öppnad av kunden', 'chip-is'], godkand: ['Godkänd', 'chip-ok'], signerad: ['Signerad', 'chip-ok'], ersatt: ['Ersatt', 'chip'], makulerad: ['Makulerad', 'chip-rod'], utgangen: ['Utgången', 'chip-rod'] };
  const dokUrl = (token) => new URL(`offert.html#o=${token}`, location.href).href;
  const dokFor = (affarId, typ) => Object.entries(db.offerter || {}).map(([token, d]) => ({ token, ...d })).filter((d) => d.affarId === affarId && (d.typ || 'offert') === typ && d.status !== 'ersatt').sort((a, b) => (a.skapad < b.skapad ? 1 : -1))[0];
  const dokAndrad = (d, a) => JSON.stringify(d.offert) !== JSON.stringify(a.offert);
  const dokKlar = (d) => d.status === 'godkand' || d.status === 'signerad';
  /* Versionerna av samma dokument (offert eller order) på affären. En godkänd/signerad version ersätts när kunden godkänner en nyare:
     kundlogiken sätter då ersattAv { nummer, tid } (det låsta dokumentet ändras inte i övrigt). Äldre data utan markeringen: en senare
     godkänd version på samma affär räcker. dokNyare = den nyaste versionen efter dokumentet (inte makulerad). */
  const dokVersioner = (d) => Object.entries(db.offerter || {}).map(([token, x]) => ({ token, ...x })).filter((x) => x.affarId === d.affarId && (x.typ || 'offert') === (d.typ || 'offert') && x.nummer !== d.nummer);
  const dokErsattAv = (d) => {
    if (!d || !dokKlar(d) || d.makulerad) return null;
    if (d.ersattAv) return d.ersattAv;
    const senare = dokVersioner(d).filter((x) => dokKlar(x) && !x.makulerad && String(x.godkand || '') > String(d.godkand || '')).sort((x, y) => (String(x.godkand) < String(y.godkand) ? -1 : 1))[0];
    return senare ? { nummer: senare.nummer, tid: senare.godkand } : null;
  };
  const dokNyare = (d) => (d ? dokVersioner(d).filter((x) => !x.makulerad && String(x.skapad || '') > String(d.skapad || '')).sort((x, y) => (x.skapad < y.skapad ? 1 : -1))[0] || null : null);
  // Ersatta och makulerade versioner – och godkända som en nyare version har tagit över – finns kvar som historik under kortet
  const dokHistorik = (affarId) => {
    const nu = { offert: (dokFor(affarId, 'offert') || {}).token, order: (dokFor(affarId, 'order') || {}).token };
    return Object.entries(db.offerter || {}).map(([token, d]) => ({ token, ...d })).filter((d) => d.affarId === affarId && (d.status === 'ersatt' || (dokKlar(d) && nu[d.typ === 'order' ? 'order' : 'offert'] !== d.token))).sort((a, b) => (a.skapad < b.skapad ? 1 : -1));
  };
  const dokUtgangen = (d) => !dokKlar(d) && d.status !== 'ersatt' && !!d.giltigTill && dagarTill(d.giltigTill) < 0;
  // Kunden har signerat ordern via länken (affären står kvar i Underlag & samtycke tills säljaren överlämnar)
  const orderSignerad = (a) => { const o = dokFor(a.id, 'order'); return !!o && o.status === 'signerad'; };
  /* En makulerad order (admin, skarpt läge) som inte har ersatts av en ny signerad order. Affären står kvar i sitt steg – kunden
     har köpt – men ordern gäller inte: Nästa bästa steg, projektets Nästa steg, stegchippet, kundsidan och Klubbmotorn säger det,
     och provisionen vilar (prognos) tills en ny order är signerad. Ger det makulerade dokumentet (med token) eller null. */
  const orderMakulerad = (a) => {
    if (!a) return null;
    const ordrar = Object.entries(db.offerter || {}).map(([token, d]) => ({ token, ...d })).filter((d) => d.affarId === a.id && d.typ === 'order');
    const m = ordrar.filter((d) => d.makulerad).sort((x, y) => (String(x.makulerad.tid || x.skapad) < String(y.makulerad.tid || y.skapad) ? 1 : -1))[0];
    return m && !ordrar.some((d) => !d.makulerad && d.status === 'signerad') ? m : null;
  };
  // Vad som gäller när ordern är makulerad: en ny osignerad order finns redan (kunden ska signera den) eller så ska en skapas
  const makuleradText = (a, mak, { fore = true } = {}) => {
    const ny = dokFor(a.id, 'order');
    return ny ? `Ordern ${mak.nummer} är makulerad – den nya ordern ${ny.nummer} väntar på kundens signatur` : `Ordern ${mak.nummer} är makulerad – skapa en ny order${fore ? ' innan testdagen' : ''}`;
  };
  /* Efter en ny offert eller order – samma regel från Till kunden, Mallar och Kundmötet (mote.js): affären står kvar i sitt steg
     (Nästa bästa steg frågar "Offerten är skickad" när länken har gått till kunden, och kundens godkännande flyttar den till Underlag),
     och en öppen egen uppgift på kunden som handlar om just det dokumentet ("Skicka offert till Tellus") föreslås som klar.
     Toastens text följer kontaktpersonen: utan e-post lovas ingen e-post. Ger { text, atgard, todo }. */
  const dokTodo = (a, typ) => db.todos.find((t) => !t.klar && t.kundId === a.kundId && t.ansvarig === jag && !t.auto && (typ === 'order' ? /\border/i : /\boffert/i).test(t.text || ''));
  function dokSkapatKvitto(affarId, typ) {
    const a = affar(affarId); const k = a ? kund(a.kundId) : null; const pk = k ? primarKontakt(k) : null; const t = a ? dokTodo(a, typ) : null;
    const text = `${typ === 'order' ? 'Ordern' : 'Offerten'} är skapad – ${pk && pk.epost ? 'öppna, kopiera eller e-posta länken' : pk ? `kopiera länken (${pk.namn.split(' ')[0]} saknar e-post)` : 'kopiera länken (kunden saknar kontaktperson)'}${t ? `. Uppgiften ”${t.text}” är kvar` : ''}`;
    const atgard = t ? { text: 'Markera klar', fn: () => { if (t.klar) return; t.klar = true; t.klarTid = new Date().toISOString(); spara(); rendera(); toast(`Klar: ${t.text}`, null, 'bock'); } } : null;
    return { text, atgard, todo: t };
  }
  function skapaDokument(affarId, typ) {
    const a = affar(affarId); const k = kund(a.kundId); const pk = primarKontakt(k);
    const l = (a.offert.underlag && db.kundlankar[a.offert.underlag]) || lankFor(a.id);
    const lf = l && l.status === 'inskickad' ? l.foretag || {} : {};
    // Den version som gäller nu (godkänd eller inte) – den nya säger vilken den ersätter
    const forra = dokFor(a.id, typ);
    Object.values(db.offerter).forEach((d) => { if (d.affarId === a.id && (d.typ || 'offert') === typ && !['godkand', 'signerad'].includes(d.status)) d.status = 'ersatt'; });
    const ar = new Date().getFullYear(); const sammaTyp = Object.values(db.offerter).filter((d) => (d.typ || 'offert') === typ && String(d.nummer || '').includes(`-${ar}-`));
    const nr = (n) => (typ === 'order' ? `UP-O-${ar}-${String(201 + n).padStart(4, '0')}` : `UP-${ar}-${String(101 + n).padStart(4, '0')}`);
    // Löpnumret räknas från antalet dokument som förut, men hoppar över nummer som redan finns (t.ex. efter en radering)
    const tagna = new Set(sammaTyp.map((d) => d.nummer)); let n = sammaTyp.length; while (tagna.has(nr(n))) n++;
    const nummer = nr(n);
    // Den senast godkända offerten (inte en äldre som en nyare version har ersatt)
    const godkand = Object.values(db.offerter).filter((d) => d.affarId === a.id && (d.typ || 'offert') === 'offert' && d.status === 'godkand' && !d.makulerad).sort((x, y) => (String(x.godkand || '') < String(y.godkand || '') ? 1 : -1))[0];
    // Ordern hänvisar bara till den godkända offerten när innehållet är detsamma
    const sammaSomGodkand = godkand && JSON.stringify(godkand.offert) === JSON.stringify(a.offert);
    const token = nyToken(); const nu = new Date().toISOString();
    db.offerter[token] = {
      typ, affarId: a.id, kundId: k.id, nummer, skapad: nu, andrad: nu, giltigTill: omDagar(typ === 'order' ? 14 : 30), status: 'skickad',
      titel: a.titel, offert: JSON.parse(JSON.stringify(a.offert)),
      kund: { namn: lf.namn || k.namn, orgnr: lf.orgnr || k.orgnr || '' },
      kontakt: { namn: lf.kontakt || (pk ? pk.namn : ''), roll: pk ? pk.roll : '', epost: lf.epost || (pk ? pk.epost : ''), tel: lf.tel || (pk ? pk.tel : '') },
      saljare: anv(a.ansvarig).namn, offertNummer: sammaSomGodkand ? godkand.nummer : null, ...(forra ? { ersatter: { nummer: forra.nummer } } : {}),
      intro: typ === 'order' ? `Här är ordern för ${a.titel}${l && l.status === 'inskickad' ? ', baserad på ert inskickade underlag' : ''}. Signera ordern så fakturerar vi förskottet och vårt testteam kontaktar er för att boka testdagen.` : `Tack för ett bra möte. Här är vårt förslag på ${a.titel} för ${k.namn}.`,
      leverans: typ === 'order' ? { plats: lf.plats || '', period: lf.period || '', faktura: lf.faktura || '', underlagInskickat: l && l.inskickad ? l.inskickad : null } : null,
      deltagare: typ === 'order' && l && l.status === 'inskickad' && l.deltagare ? l.deltagare.map((d) => ({ namn: d.namn, paket: d.paket, tillval: [...(d.tillval || [])] })) : null,
    };
    if (typ === 'order') a.check = { ...(a.check || {}), order: true };
    logga(`${typ === 'order' ? 'Order' : 'Offert'} ${nummer} skapad till kund (${kr(affarVarde(a))}).`, { kundId: k.id, affarId: a.id });
    return token;
  }
  const dokumentKortHtml = (a) => {
    const k = kund(a.kundId); const pk = primarKontakt(k);
    const hist = dokHistorik(a.id);
    const historik = hist.length ? `<details class="tidigare"><summary>Tidigare versioner (${hist.length})</summary>${hist.map((d) => {
      const m = d.makulerad; const order = (d.typ || 'offert') === 'order'; const klar = dokKlar(d) && !m; const ers = klar ? dokErsattAv(d) : null; const ny = dokNyare(d);
      const datum = (t) => e(datumText(String(t || '').slice(0, 10), { ar: true, gemen: true }));
      // Godkänd men ersatt av en nyare godkänd version – eller godkänd medan en nyare version väntar på kunden
      const under = m ? `Makulerad ${datum(m.tid)} av ${e(vemText(m.av))}${m.orsak ? ` · ${e(m.orsak)}` : ''}`
        : ers ? `${order ? 'Signerad' : 'Godkänd'} ${datum(d.godkand)} · ersatt av ${e(ers.nummer)}`
          : klar ? `${order ? 'Signerad' : 'Godkänd'} ${datum(d.godkand)} av ${e(d.godkandAv ? d.godkandAv.namn : 'kunden')}${ny ? ` · nyare version ${e(ny.nummer)} ${dokUtgangen(ny) ? 'har gått ut' : ny.status === 'ersatt' ? 'är ersatt' : 'väntar på kunden'}` : ''}`
            : `Ersatt av ${ny ? e(ny.nummer) : 'en nyare version'} · skapad ${datum(d.skapad)}`;
      const [chipText, chipKlass] = m ? ['Makulerad', 'chip-rod'] : klar && !ers ? [order ? 'Signerad' : 'Godkänd', 'chip-ok'] : ['Ersatt', ''];
      return `<div class="tidigare-rad">${ikRuta(order ? 'order' : 'dokument', { ruta: 's' })}<span class="lank-rad-text"><strong>${order ? 'Order' : 'Offert'} ${e(d.nummer)}</strong><small>${under} · ${kr(prisaOffert(d.offert).total)}</small></span><span class="chip ${chipKlass}">${chipText}</span><a class="knapp knapp-spok knapp-liten" href="${e(dokUrl(d.token))}" target="_blank" rel="noopener">Visa</a></div>`; }).join('')}</details>` : '';
    if (a.steg === 'forlorad') return historik ? `<section class="kort" data-affar-dok><div class="kort-huvud"><h3>${ik('mejl')}Till kunden</h3></div><div class="dokkund-lista"><p class="falt-hint" style="margin:0">Affären är förlorad – inga nya dokument skapas förrän den återöppnas.</p>${historik}</div></section>` : '';
    const godkandOffert = dokFor(a.id, 'offert'); const l = (a.offert.underlag && db.kundlankar[a.offert.underlag]) || lankFor(a.id);
    const rad = (typ) => {
      const d = dokFor(a.id, typ); const namn = typ === 'order' ? 'Order' : 'Offert'; const ikon = ikRuta(typ === 'order' ? 'order' : 'dokument', { ton: typ === 'order' ? 'mint' : 'is' });
      if (!d) {
        const kanOrder = typ === 'order' && (a.steg === 'underlag' || a.steg === 'signerad' || !!dokFor(a.id, 'offert'));
        if (typ === 'order' && !kanOrder) return `<div class="dokrad-kund">${ikon}<span class="lank-rad-text"><strong>Order</strong><small>Skapas när offerten är skickad eller affären är i steget Underlag &amp; samtycke.</small></span></div>`;
        // Texten följer läget: vad ordern bygger på, eller att affären signerades utan dokument härifrån
        const makulerad = Object.values(db.offerter || {}).filter((x) => x.affarId === a.id && (x.typ || 'offert') === typ && x.makulerad).sort((x, y) => (x.skapad < y.skapad ? 1 : -1))[0];
        const underText = makulerad ? `${namn} ${makulerad.nummer} är makulerad – skapa en ny version om kunden ska ${typ === 'order' ? 'signera' : 'godkänna'} igen.`
          : a.steg === 'signerad' ? 'Signerades utanför CRM:et – skapa bara om kunden behöver dokumentet.'
          : typ === 'order' ? (l && l.status === 'inskickad' ? `Bygger på kundunderlaget (${plural((l.deltagare || []).length, 'deltagare', 'deltagare')}) – kunden signerar digitalt.` : godkandOffert && dokKlar(godkandOffert) ? `Bygger på offert ${godkandOffert.nummer} – kunden signerar digitalt.` : 'Bygger på offerten i affären – utan deltagarbilaga. Kunden signerar digitalt.')
            : 'Kunden godkänner digitalt – specifikation, betalplan och villkor ingår.';
        // En accentknapp i taget: Nästa bästa steg bär lägets huvudåtgärd. När den åtgärden är just Skapa offert/order (kundbesök,
        // offert utan dokument, eller ordern som sista kontrollpunkt – afOrderNasta) blir knappen här en lugn spökknapp, annars kontur.
        const iNasta = typ === 'offert' ? a.steg === 'besok' || a.steg === 'offert' : afOrderNasta(a);
        const knappTon = a.steg === 'signerad' || iNasta ? 'knapp-spok' : 'knapp-kontur';
        return `<div class="dokrad-kund">${ikon}<span class="lank-rad-text"><strong>${namn}</strong><small>${e(underText)}</small></span>
          <button class="knapp ${knappTon} knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="${e(typ)}">${ik('plus')}Skapa</button></div>`;
      }
      const klar = dokKlar(d); const utgangen = dokUtgangen(d);
      const [txt, cls] = utgangen ? DOKSTATUS.utgangen : DOKSTATUS[d.status] || DOKSTATUS.skickad;
      const url = dokUrl(d.token); const kvar = d.giltigTill ? dagarTill(d.giltigTill) : null;
      const brod = `Hej${pk ? ' ' + pk.namn.split(' ')[0] : ''}!\n\nHär är ${typ === 'order' ? 'ordern' : 'offerten'} (${d.nummer}):\n${url}\n\n${typ === 'order' ? 'Signera den direkt i länken så fakturerar vi förskottet och bokar testdagen.' : 'Godkänn den direkt i länken, eller hör av dig om du har frågor.'}\n\nVänliga hälsningar\n${anv(a.ansvarig).namn}, Uperformance`;
      const skiljer = klar && typ === 'offert' && dokAndrad(d, a) && !lastOffert(a);
      // Offertens dagar kvar och belopp står redan på sidan (Nästa bästa steg resp. sidhjälten) – här bara datumet, och beloppet när det skiljer sig
      const dagarOvan = typ === 'offert' && arOppen(a);
      const giltig = !klar && !utgangen && kvar != null ? ` · gäller till ${datumText(d.giltigTill, { gemen: true })}${dagarOvan ? '' : ` (${kvar === 0 ? 'idag' : `om ${kvar} d`})`}` : '';
      const belopp = dokAndrad(d, a) ? ` · ${kr(prisaOffert(d.offert).total)}` : '';
      return `<div class="dokrad-kund" ${utgangen ? 'data-utgangen' : ''}>${ikon}
        <span class="lank-rad-text"><strong>${namn} <span class="af-nr">${e(d.nummer)}</span></strong><small>${klar ? `${e(txt)} av ${e(d.godkandAv ? d.godkandAv.namn : 'kunden')} ${e(relTid(d.godkand))}` : utgangen ? `Gick ut ${e(datumText(d.giltigTill, { ar: true, gemen: true }))} – kunden kan inte ${typ === 'order' ? 'signera' : 'godkänna'} den` : d.oppnad ? `Öppnad ${e(relTid(d.oppnad))}` : `Skapad ${e(relTid(d.skapad))} · ej öppnad`}${belopp}${e(giltig)}</small></span>
        <span class="chip ${cls} chip-prick">${e(txt)}</span>${!klar && !utgangen && kvar != null && kvar <= 5 && !dagarOvan ? `<span class="chip chip-gul dokrad-snart">Går ut ${kvar === 0 ? 'idag' : `om ${kvar} d`}</span>` : ''}
        ${skiljer ? `<p class="dok-skiljer">${ik('varning')}<span>Affären skiljer sig från den godkända offerten (${kr(prisaOffert(d.offert).total)}). Kunden godkände den versionen.</span></p>` : ''}
        <div class="dokrad-knappar">
          <a class="knapp knapp-kontur knapp-liten" href="${e(url)}" target="_blank" rel="noopener">Öppna</a>
          ${utgangen ? '' : `<button class="knapp knapp-spok knapp-liten" type="button" data-g="kopiera-dokument" data-token="${e(d.token)}">Kopiera länk</button>`}
          ${pk && pk.epost && !klar && !utgangen ? `<a class="knapp knapp-spok knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent(`${namn} ${d.nummer} – Uperformance`)}&amp;body=${encodeURIComponent(brod)}">${ik('mejl')}E-posta</a>` : ''}
          ${utgangen && !lastOffert(a) ? `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="${e(typ)}">${ik('plus')}Skapa ny version</button>` : ''}
          ${!klar && !utgangen && dokAndrad(d, a) && !lastOffert(a) ? `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="${e(typ)}">Affären har ändrats – ny version</button>` : ''}
          ${skiljer ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="aterstall-offert" data-affar="${e(a.id)}" data-token="${e(d.token)}">${ik('aterstall')}Återställ affären till offerten</button><button class="knapp ${avvikerFranGodkand(a) ? 'knapp-kontur' : 'knapp-accent'} knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="offert">Skapa ny offertversion</button>` : ''}
          ${klar && SKARP && arAdmin() ? `<button class="knapp knapp-fara knapp-liten" type="button" data-g="makulera-dokument" data-token="${e(d.token)}" title="Bara för administratörer – åtgärden loggas">Makulera</button>` : ''}
        </div></div>`;
    };
    // Kundlänken som en rad mellan offert och order (i processens ordning) så länge affären är öppen och saknar länk –
    // när länken finns blir den kortet Kundunderlag i huvudkolumnen (kundunderlagHtml)
    const lankRad = !lankFor(a.id) && arOppen(a) && a.offert.eget == null && a.offert.typ !== 'uppfoljning'
      ? `<div class="dokrad-kund dokrad-lank">${ikRuta('lank', { ton: 'is' })}<span class="lank-rad-text"><strong>Kundunderlag</strong><small>Kunden fyller i företag och deltagare via en säker länk.</small></span>
          <button class="knapp knapp-kontur knapp-liten" type="button" data-g="skapa-lank" data-affar="${e(a.id)}" title="Skapa kundlänk">${ik('lank')}Skapa<span class="sr"> kundlänk</span></button></div>` : '';
    const kontaktRad = !arOppen(a) || (pk && pk.epost) ? '' : `<p class="dok-kontakt">${ik('info')}<span>${pk ? `${e(pk.namn)} saknar e-post – lägg till den så kan du e-posta länkarna` : 'Ingen kontaktperson – lägg till en så kan du e-posta länkarna'}</span>${pk
      ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="andra-kontakt" data-kund="${e(k.id)}" data-id="${e(pk.id)}">${ik('redigera')}Lägg till e-post</button>`
      : `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="ny-kontakt" data-kund="${e(k.id)}">${ik('plus')}Lägg till kontakt</button>`}</p>`;
    return `<section class="kort" data-affar-dok><div class="kort-huvud"><h3>${ik('mejl')}Till kunden</h3></div><div class="dokkund-lista">${kontaktRad}${rad('offert')}${lankRad}${rad('order')}${historik}</div></section>`;
  };

  // Affären har ändrats efter att kunden godkände offerten och ingen order är signerad: en order skulle gälla ett belopp som kunden
  // aldrig har godkänt. Nästa bästa steg föreslår då en ny offertversion (eller att återställa affären) i stället för Skapa order.
  // Ger den godkända offerten (med token) eller null.
  const avvikerFranGodkand = (a) => {
    if (!a || lastOffert(a) || orderSignerad(a)) return null;
    const d = dokFor(a.id, 'offert'); return d && dokKlar(d) && dokAndrad(d, a) ? d : null;
  };
  // Ordern är nästa steg (Nästa bästa steg bär "Skapa order"): underlaget är inne och använt (eller saknas helt), infodokument,
  // samtycke och PUB-avtal är klara och ordern saknas. Delas av nastaAffarHtml och dokumentKortHtml (en accentknapp i taget).
  const afOrderNasta = (a) => {
    if (a.steg !== 'underlag' || dokFor(a.id, 'order') || avvikerFranGodkand(a)) return false;
    const l = lankFor(a.id); const c = a.check || {};
    return !(l && (l.status !== 'inskickad' || a.offert.underlag !== l.token)) && !!(c.info && c.samtycke && c.pub) && !c.order;
  };
  // Ett öppet att göra om kundbesöket (eller första mötet) för kunden – då är besöket redan på väg att bokas
  const besokTodo = (k) => db.todos.filter((t) => !t.klar && t.kundId === k.id && /besök|möte/i.test(t.text || '')).sort((x, y) => String(x.datum || '9').localeCompare(String(y.datum || '9')))[0];

  // Nästa bästa steg på affären – byggt på nastaSteg(), med en primär åtgärd, Att göra och Anteckning (hoppar till skrivrutan i
  // tidslinjen). Räkna live står i Offert-kortets huvud. attr: affärssidans platsattribut. Stil: sidor.css avsnitt 13 (.af-nasta).
  // Uppmaningen (rubriken) och huvudknappen säger samma sak; dagar i steget står i sidhjälten och upprepas inte här.
  const nastaAffarHtml = (a, attr = '') => {
    const ns = nastaSteg(a); const k = kund(a.kundId); const pk = primarKontakt(k); const l = lankFor(a.id);
    const offert = dokFor(a.id, 'offert');
    const attGora = `<button class="knapp knapp-spok knapp-liten" type="button" data-g="ny-todo" data-kund="${e(k.id)}">${ik('todo')}Att göra</button>`;
    const anteckning = `<button class="knapp knapp-spok knapp-liten" type="button" data-g="fokus-anteckning" data-kund="${e(k.id)}">${ik('anteckning')}Anteckning</button>`;
    let sekundar = `${attGora}${anteckning}`;
    const kortet = ({ ton = '', ogon = 'Nästa bästa steg', ruta, titel, under, tider = '', knappar }) => `<section class="kort nasta-kort af-nasta" ${attr}${ton ? ` data-af-ton="${ton}"` : ''}><div class="af-nasta-inre">
      <span class="overrad">${ogon}</span>
      <div class="nasta-kort-rad">${ruta}<div><strong>${titel}</strong><small>${under}</small></div></div>
      ${tider ? `<div class="nasta-kort-tider">${tider}</div>` : ''}
      <div class="nasta-kort-fot">${knappar}</div>
    </div></section>`;
    // Att affären är förlorad (och när) står i sidhjälten – här orsaken och vägen tillbaka
    if (felregistrerad(a)) return kortet({ ogon: 'Felregistrerad', ruta: `<span class="emo emo-ruta emo-l" aria-hidden="true">${ik('stang')}</span>`, titel: e((a.forlorad && a.forlorad.orsak) || 'Felregistrerad / dubblett'), under: 'Räknas inte i statistiken. Återöppna om den ändå ska bli en affär – den hamnar då i Kundbesök.',
      knappar: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="ateroppna" data-affar="${e(a.id)}">${ik('aterstall')}Återöppna</button>${sekundar}` });
    if (a.steg === 'forlorad') return kortet({ ton: 'rod', ogon: 'Orsak', ruta: `<span class="emo emo-ruta emo-l" data-ton="rod" aria-hidden="true">${ik('stang')}</span>`, titel: e((a.forlorad && a.forlorad.orsak) || 'Ingen orsak angiven'), under: 'Återöppna när kunden vill gå vidare – affären hamnar då i Kundbesök.',
      knappar: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="ateroppna" data-affar="${e(a.id)}">${ik('aterstall')}Återöppna</button>${sekundar}` });
    if (!ns) return '';
    let primar = ''; let titel = ns.text; let bokat = null;
    if (ns.makulerad) {
      // Makulerad order: en ny order (eller länken till den nya, osignerade) – projektet ligger kvar under Till projektet
      const ny = dokFor(a.id, 'order'); const p = projektForAffar(a.id);
      primar = ny ? `<button class="knapp knapp-accent knapp-liten" type="button" data-g="kopiera-dokument" data-token="${e(ny.token)}">${ik('lank')}Kopiera länken till ordern</button>`
        : `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="order">${ik('plus')}Skapa ny order</button>`;
      if (p) sekundar = `<a class="knapp knapp-spok knapp-liten" href="#/projekt/${e(p.id)}">${ik('projekt')}Till projektet</a>${anteckning}`;
    } else if (avvikerFranGodkand(a)) {
      // Kunden godkände en annan version än affären är nu – ny offertversion först (eller tillbaka till den godkända), sedan ordern
      const d = avvikerFranGodkand(a);
      titel = `Kunden godkände ${kr(prisaOffert(d.offert).total)} – skapa ny offertversion`;
      primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="offert">${ik('plus')}Skapa ny offertversion</button>`;
      sekundar = `<button class="knapp knapp-spok knapp-liten" type="button" data-g="aterstall-offert" data-affar="${e(a.id)}" data-token="${e(d.token)}">${ik('aterstall')}Återställ till ${e(d.nummer)}</button>${anteckning}`;
    } else if (a.steg === 'kontakt') {
      // Boka kundbesök: finns redan ett att göra om besöket ringer man kontakten (eller skapar det annars) – "Besöket är gjort" flyttar affären
      titel = 'Boka kundbesök'; bokat = besokTodo(k);
      const gjort = `<button class="knapp knapp-spok knapp-liten" type="button" data-g="flytta-till" data-affar="${e(a.id)}" data-steg="besok">${ik('bock')}Besöket är gjort</button>`;
      if (bokat && pk && pk.tel) { primar = `<a class="knapp knapp-accent knapp-liten" href="tel:${e(pk.tel.replace(/\s/g, ''))}">${ik('samtal')}Ring ${e(pk.namn.split(' ')[0])}</a>`; sekundar = `${gjort}${anteckning}`; }
      else if (bokat && pk && pk.epost) { primar = `<a class="knapp knapp-accent knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent('Kundbesök – Uperformance')}">${ik('mejl')}Mejla ${e(pk.namn.split(' ')[0])}</a>`; sekundar = `${gjort}${anteckning}`; }
      else if (bokat) { titel = 'Kundbesöket är på väg att bokas'; primar = gjort.replace('knapp-spok', 'knapp-accent'); sekundar = anteckning; }
      else { primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="ny-todo" data-kund="${e(k.id)}" data-text="${e(`Kundbesök hos ${k.namn}`)}">${ik('kalender')}Boka kundbesök</button>`; sekundar = `${gjort}${anteckning}`; }
    } else if (a.steg === 'offert' && offert && dokUtgangen(offert)) { titel = 'Offerten har gått ut – skapa en ny version'; primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="offert">${ik('plus')}Ny version av offerten</button>`; }
    else if (a.steg === 'besok' && offert && !dokKlar(offert) && !dokUtgangen(offert)) {
      // Offerten är skapad i kundbesöket: skicka den (länken står i mejlet) eller ring när kunden har öppnat – "Offerten är skickad" flyttar affären
      const fn = pk ? pk.namn.split(' ')[0] : '';
      primar = offert.status === 'oppnad' && pk && pk.tel ? `<a class="knapp knapp-accent knapp-liten" href="tel:${e(pk.tel.replace(/\s/g, ''))}">${ik('samtal')}Ring ${e(fn)}</a>`
        : pk && pk.epost ? `<a class="knapp knapp-accent knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent(`Offert ${offert.nummer} – Uperformance`)}&amp;body=${encodeURIComponent(`Hej ${fn}!\n\nHär är offerten (${offert.nummer}):\n${dokUrl(offert.token)}\n\nGodkänn den direkt i länken, eller hör av dig om du har frågor.\n\nVänliga hälsningar\n${anv(a.ansvarig).namn}, Uperformance`)}">${ik('mejl')}E-posta offerten</a>`
          : `<button class="knapp knapp-accent knapp-liten" type="button" data-g="kopiera-dokument" data-token="${e(offert.token)}">${ik('lank')}Kopiera länken</button>`;
      sekundar = `<button class="knapp knapp-spok knapp-liten" type="button" data-g="flytta-till" data-affar="${e(a.id)}" data-steg="offert">${ik('bock')}Offerten är skickad</button>${anteckning}`;
    } else if (a.steg === 'besok' || (a.steg === 'offert' && !offert)) primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="offert">${ik('plus')}Skapa offert</button>`;
    else if (a.steg === 'offert' && offert && offert.status === 'oppnad' && pk && pk.tel) primar = `<a class="knapp knapp-accent knapp-liten" href="tel:${e(pk.tel.replace(/\s/g, ''))}">${ik('samtal')}Ring ${e(pk.namn.split(' ')[0])}</a>`;
    else if (a.steg === 'offert' && offert && !dokKlar(offert) && pk && pk.epost) primar = `<a class="knapp knapp-accent knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent(`Offert ${offert.nummer} – Uperformance`)}&amp;body=${encodeURIComponent(`Hej ${pk.namn.split(' ')[0]}!\n\nHar du hunnit titta på offerten?\n${dokUrl(offert.token)}\n\nVänliga hälsningar\n${anv(a.ansvarig).namn}, Uperformance`)}">${ik('mejl')}Påminn via mejl</a>`;
    else if (a.steg === 'underlag' && ns.signerad) primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="overlamna" data-affar="${e(a.id)}">${ik('pil')}Överlämna till testteamet</button>`;
    else if (a.steg === 'underlag' && l && l.status === 'inskickad' && a.offert.underlag !== l.token) primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="anvand-underlag" data-affar="${e(a.id)}" data-token="${e(l.token)}">${ik('bock')}Använd som offertunderlag</button>`;
    else if (a.steg === 'underlag' && l && lankUtgangen(l)) primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="forlang-lank" data-token="${e(l.token)}">${ik('klocka')}Förläng länken 30 dagar</button>`;
    else if (a.steg === 'underlag' && l && l.status !== 'inskickad') {
      // Kunden fyller i: påminn kontakten (länken står i mejlet). Kopiera finns vid länken i kortet Kundunderlag – utan e-post blir den huvudåtgärden här.
      const fn = pk ? pk.namn.split(' ')[0] : '';
      primar = pk && pk.epost ? `<a class="knapp knapp-accent knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent(`Underlaget inför hälsokartläggningen – ${k.namn}`)}&amp;body=${encodeURIComponent(`Hej ${fn}!\n\n${l.oppnad ? 'Tack för att ni har börjat fylla i underlaget. Här är länken igen så att ni kan göra klart det' : 'En påminnelse om underlaget inför hälsokartläggningen – företagsuppgifter och en rad per deltagare'}:\n${lankUrl(l.token)}\n\nLänken gäller till ${langtDatum(l.utgar)}.\n\nVänliga hälsningar\n${anv(a.ansvarig).namn}, Uperformance`)}">${ik('mejl')}Påminn ${e(fn)}</a>`
        : `<button class="knapp knapp-accent knapp-liten" type="button" data-g="kopiera-lank" data-token="${e(l.token)}">${ik('lank')}Kopiera kundlänken</button>`;
    } else if (a.steg === 'underlag' && ns.klar) primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="overlamna" data-affar="${e(a.id)}">${ik('pil')}Överlämna till testteamet</button>`;
    else if (afOrderNasta(a)) { titel = 'Skapa ordern till kunden'; primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="order">${ik('plus')}Skapa order</button>`; }
    else if (a.steg === 'underlag') primar = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="till-checklista">${ik('bock')}Bocka av kontrollpunkterna</button>`;
    else if (a.steg === 'signerad') { const p = projektForAffar(a.id); primar = p ? `<a class="knapp knapp-accent knapp-liten" href="#/projekt/${e(p.id)}">${ik('projekt')}Till projektet</a>` : ''; }
    // Dagar i steget står i sidhjälten (glaskortet) – här bara det som går ut
    const tider = [offert && !dokKlar(offert) && offert.giltigTill && arOppen(a) ? (dokUtgangen(offert) ? '<span class="chip chip-rod">Offerten har gått ut</span>' : `<span class="chip ${dagarTill(offert.giltigTill) <= 5 ? 'chip-gul' : ''}">${emo(UPEMO.sak.offert)}Offerten går ut ${dagarTill(offert.giltigTill) === 0 ? 'idag' : `om ${dagarTill(offert.giltigTill)} d`}</span>`) : '',
      l && l.status !== 'inskickad' && l.utgar && arOppen(a) ? (lankUtgangen(l) ? '<span class="chip chip-rod">Kundlänken har gått ut</span>' : `<span class="chip ${dagarTill(l.utgar) <= 5 ? 'chip-gul' : ''}">${emo(UPEMO.sak.lank)}${dagarTill(l.utgar) === 0 ? 'Kundlänken gäller till idag' : `Kundlänken gäller ${plural(dagarTill(l.utgar), 'dag', 'dagar')} till`}</span>`) : '',
      // Ny kontakt: besöket som redan står i att göra (länk till listan)
      bokat ? (() => { const n = bokat.datum ? dagarTill(bokat.datum) : null; return `<a class="chip ${n != null && n < 0 ? 'chip-gul' : ''}" href="#/att-gora" title="Att göra">${emo(todoTyp(bokat.text)[1])}${e(bokat.text)}${n == null ? '' : ` · ${n === 0 ? 'idag' : n === 1 ? 'i morgon' : n < 0 ? `sedan ${e(dagText(bokat.datum))}` : e(dagText(bokat.datum))}`}</a>`; })() : ''].join('');
    return kortet({ ton: ns.varm ? 'varm' : ns.klar ? 'klar' : '', ruta: emo(ns.emo || UPEMO.salj[a.steg], { ruta: 'l', ton: ns.varm ? 'gul' : ns.klar ? 'mint' : '' }), titel: e(titel),
      under: `${e(k.namn)}${pk ? ` · ${e(pk.namn)}${pk.roll ? `, ${e(pk.roll)}` : ''}` : ''}`, tider, knappar: `${primar}${sekundar}` });
  };

  /* Affärssidan under hjälten (ägare F, stil i sidor.css avsnitt 13): två kolumner. Huvudkolumnen är arbetet i den ordning affärens
     läge kräver (AF_HUVUD – Nästa bästa steg först), sidokolumnen är affärens fakta och historik (värdet med provisionen, dokumenten
     till kunden, tidslinjen, filerna och sist ansvarig säljare). Tidslinjen, filerna och ansvarig är svängkort: balanseraAffar() ställer
     dem i den kolumn som gör kolumnerna jämnast, och sidokolumnen följer med vid scroll. Surfplatta: huvudkolumnen överst och
     sidokolumnens kort i två spalter under, i lägets ordning (murAffar). Mobil: en kolumn i lägets ordning (AF_MOBIL → --af-o). */
  const AF_HUVUD = {
    kontakt: ['nasta', 'offert', 'underlag', 'check'], besok: ['nasta', 'offert', 'underlag', 'check'], offert: ['nasta', 'offert', 'underlag', 'check'],
    underlag: ['nasta', 'underlag', 'check', 'offert'], signerad: ['nasta', 'check', 'offert', 'underlag'], forlorad: ['nasta', 'offert', 'underlag', 'check'],
  };
  const AF_SIDA = ['varde', 'dokkund', 'tidslinje', 'filer', 'ansvarig'];
  const AF_TIDIG = ['nasta', 'offert', 'varde', 'underlag', 'dokkund', 'check', 'tidslinje', 'filer', 'ansvarig'];
  const AF_MOBIL = {
    kontakt: AF_TIDIG, besok: AF_TIDIG,
    offert: ['nasta', 'dokkund', 'offert', 'varde', 'underlag', 'check', 'tidslinje', 'filer', 'ansvarig'],
    underlag: ['nasta', 'underlag', 'check', 'dokkund', 'offert', 'varde', 'tidslinje', 'filer', 'ansvarig'],
    signerad: ['nasta', 'check', 'varde', 'dokkund', 'offert', 'underlag', 'tidslinje', 'filer', 'ansvarig'],
    forlorad: ['nasta', 'offert', 'varde', 'underlag', 'check', 'dokkund', 'tidslinje', 'filer', 'ansvarig'],
  };
  // Klubbmotorns provision som fot i kortet Affärsvärde (projektsidan har kortet kickbackHtml). data-affar-kb: uppdateraPris byter
  // foten live när offerten ändras. Klubbens namn står i sidhjältens chip – här procenten, beloppet, vad som händer och de fyra stegen.
  const KB_TEXT = { prognos: 'Betalas om affären vinns', upplupen: 'Blir att betala när slutfakturan är skickad', 'att-betala': 'Väntar på utbetalning till klubben' };
  const affarKbHtml = (a) => {
    const kb = kickback(a); if (!kb) return '';
    const ki = KB_STEG.findIndex(([id]) => id === kb.status);
    const text = kb.status === 'utbetald' ? `Betalades ut ${datumText(a.kickbackUtbetald, { ar: true, gemen: true })}` : kb.vilande ? 'Vilar – ordern är makulerad. Blir upplupen när en ny order är signerad' : KB_TEXT[kb.status] || '';
    return `<div class="af-kb" data-affar-kb data-af-kb>
      <div class="af-kb-rad">${emo(UPEMO.sak.klubb, { ruta: 's', ton: 'orange' })}<span class="af-kb-text"><strong>Klubbmotorn · ${e(kb.klubb.klubbavtal.procent)}&nbsp;% till <a href="#/kund/${e(kb.klubb.id)}">klubben</a></strong><small>${e(text)}</small></span><strong class="af-kb-belopp">${kr(kb.belopp)}</strong></div>
      <ol class="af-kb-steg" aria-label="Provisionens steg">${KB_STEG.map(([id, namn], i) => `<li data-status="${i < ki ? 'klar' : i === ki ? 'aktiv' : 'kommande'}" ${i === ki ? 'aria-current="step"' : ''}>${namn}</li>`).join('')}</ol>
    </div>`;
  };
  // Tidslinjen på affärs- och projektsidan: skrivrutan är en rad tills man skriver i den (typ, uppföljning och Spara fälls ut med
  // :focus-within – sidor.css 13), sedan de sex senaste händelserna och länken till resten på kundkortet (balanseraAffar kortar listan
  // på dator när tidslinjens kolumn annars blir längre). attr: platsen (data-af, --af-o, svängkort).
  // affarId: valet "Affären" visar bara händelser med affärens id (val per affär i tlVal, förval hela kunden); anteckningar som skrivs
  // här sparas på affären. Utan affarId (eller när affären saknar egna händelser) visas kundens hela historik.
  const tlVal = new Map();
  const tidslinjeKortHtml = (k, aktAlla, attr, { affarId = null } = {}) => {
    const egna = affarId ? aktAlla.filter((x) => x.affarId === affarId) : [];
    const val = affarId && egna.length && tlVal.get(affarId) === 'affar' ? 'affar' : 'kund'; const akt = val === 'affar' ? egna : aktAlla;
    const valHtml = affarId && egna.length && egna.length < aktAlla.length ? `<div class="tl-val" role="group" aria-label="Visa händelser">${[['affar', 'Affären', egna.length], ['kund', 'Hela kunden', aktAlla.length]].map(([id, namn, n]) => `<button type="button" data-g="tl-val" data-affar="${e(affarId)}" data-typ="${id}" aria-pressed="${val === id}">${namn}<b>${n}</b></button>`).join('')}</div>` : '';
    return `<section class="kort af-tidslinje" ${attr}><div class="kort-huvud"><h3>${ik('klocka')}Tidslinje</h3><a class="kortlank" href="#/kund/${e(k.id)}">Kundkortet${ik('pil')}</a></div>${valHtml}
            <form class="skrivruta af-skriv" data-form="anteckning" data-kund="${e(k.id)}"${affarId ? ` data-affar="${e(affarId)}"` : ''}>
              <label class="sr" for="ant-${e(k.id)}">Anteckning</label><textarea class="falt" id="ant-${e(k.id)}" name="text" rows="1" placeholder="Skriv en anteckning…" required data-fel="Skriv en anteckning"></textarea>
              <div class="af-skriv-mer">
                <p class="af-skriv-not">${SKARP ? 'Allt du skriver här syns för hela teamet.' : 'Sparas i den här webbläsaren (prototyp).'}</p>
                <div class="typval" role="radiogroup" aria-label="Typ">${['anteckning', 'mote', 'samtal', 'mejl'].map((t, i) => `<label><input type="radio" name="typ" value="${e(t)}" ${i === 0 ? 'checked' : ''}><span>${emo(UPEMO.akt[t])}${AKT_TYP[t]}</span></label>`).join('')}</div>
                <div class="skrivruta-fot"><label class="kryss skrivruta-folj"><input type="checkbox" name="folj"><span>Följ upp <input class="falt" type="date" name="datum" value="${omDagar(3)}" min="${idag()}" max="${omDagar(730)}" data-fel="Välj ett uppföljningsdatum från idag och högst två år framåt" aria-label="Uppföljningsdatum"></span></label>
                  <button class="knapp knapp-mork knapp-liten" type="submit">Spara</button></div>
              </div>
            </form>
            <div class="tidslinje">${tidslinje(akt.slice(0, 6))}</div>
            <a class="af-tidslinje-fler" href="#/kund/${e(k.id)}" data-af-fler data-totalt="${akt.length}"${akt.length > 6 ? '' : ' hidden'}><span data-af-fler-text>${plural(Math.max(0, akt.length - 6), 'händelse till', 'händelser till')}</span> på kundkortet${ik('pil')}</a></section>`;
  };
  // Filerna på affären: uppladdningsytan som en låg rad (samma data-attribut som uppladdningsYta – dra och släpp fungerar likadant)
  const affarUppladdning = (kundId, affarId, tomt) => `<label class="uppladdning af-uppladdning" data-uppladdning data-kund="${e(kundId)}" data-affar="${e(affarId)}">
    ${emo(UPEMO.sak.dokument, { ruta: 'm', ton: 'is' })}<span class="af-rad-text"><strong>${tomt ? 'Dra hit en fil' : 'Ladda upp fler filer'}</strong><small>${tomt ? 'Offert, order eller PUB-avtal – syns för hela teamet' : 'Dra hit filer eller klicka'}</small></span>
    <span class="knapp knapp-kontur knapp-liten af-uppladdning-knapp">${ik('uppladdning')}Välj fil</span>
    <input type="file" multiple data-uppladdning-falt></label>`;

  function visaAffar(id) {
    const a = affar(id);
    if (!a) return detaljSaknas('#/salj', 'Säljtavla', 'Affären finns inte', 'Till säljtavlan');
    const k = kund(a.kundId); const p = projektForAffar(a.id);
    const docs = db.dokument.filter((d) => d.affarId === a.id);
    const kanSignera = a.steg !== 'signerad' && a.steg !== 'forlorad';
    // Raderna står två och två när kortet är brett – brickan "Kontrollpunkt" ligger då under texten (sidor.css 13)
    const checkRad = (id, text, sub, kontroll) => `<label class="checkrad" ${kontroll ? 'data-kontroll' : ''}><input type="checkbox" data-check="${e(a.id)}" value="${e(id)}" ${a.check && a.check[id] ? 'checked' : ''} ${lastOffert(a) ? 'disabled' : ''}><span>${e(text)}<small>${e(sub)}</small></span>${kontroll ? agarband('kontroll') : ''}</label>`;
    const klaraCheck = ['info', 'samtycke', 'pub', 'order'].filter((x) => a.check && a.check[x]).length;
    // Sidhjälten: affären som ett ärende – kunden, läget (steget som chip och som remsa i foten) och nyckeltalen.
    // Ordervärdet bär data-affar-varde (uppdateras direkt när offerten ändras). Förlorad: inget steg att flytta till, orsaken står i nästa steg.
    // Varje knapp finns en gång: Räkna live i Offert-kortet, Att göra, Anteckning och Återöppna i Nästa bästa steg.
    const dSteg = -dagarTill(a.stegAndrad) || 0; const sn = sannolikhet(a); // || 0: flyttad idag ger 0, inte −0
    const talVarde = { emo: UPEMO.sak.snitt, etikett: 'Ordervärde', varde: affarVarde(a), format: 'kr', attr: 'data-affar-varde', under: 'exkl. moms', titel: 'Uppdelning och fakturor i kortet Affärsvärde' };
    const pTest = a.steg === 'signerad' ? p : null; const nTestA = pTest && pTest.testdatum ? dagarTill(pTest.testdatum) : null;
    // forlorad är valfri i datan (som i saljYtaHtml) – utan den används datumet då steget ändrades
    const fDatum = (a.forlorad && a.forlorad.datum) || a.stegAndrad;
    const tal = a.steg === 'forlorad' ? [talVarde,
      { emo: UPEMO.larm.retur, etikett: 'Förlorad', text: fDatum ? e(datumText(fDatum, { ar: true })) : '–', under: fDatum && -dagarTill(fDatum) > 1 ? `för ${plural(-dagarTill(fDatum), 'dag', 'dagar')} sedan` : '' }]
      : a.steg === 'signerad' ? [talVarde,
        { emo: UPEMO.sak.signering, etikett: 'Order signerad', text: e(datumText(a.stegAndrad, { ar: true })), under: dSteg > 1 ? `för ${plural(dSteg, 'dag', 'dagar')} sedan` : '' },
        { emo: UPEMO.proj.test, etikett: 'Testdag', text: pTest && pTest.testdatum ? e(datumText(pTest.testdatum, { ar: true })) : 'Inte bokad', href: pTest ? `#/projekt/${pTest.id}` : '',
          under: !pTest ? 'Inte överlämnad till testteamet' : pTest.steg === 'klar' ? 'Projektet är klart' : !pTest.testdatum ? 'Testteamet bokar tid med kunden'
            : nTestA > 0 ? `om ${plural(nTestA, 'dag', 'dagar')}` : nTestA === 0 ? 'idag' : `för ${plural(-nTestA, 'dag', 'dagar')} sedan` }]
      : [talVarde,
        { emo: UPEMO.larm.viktat, etikett: 'Chans att vinna', varde: sn.p, format: 'pct', titel: sn.skal.join(' · '), matt: glasRing(sn.p, SANNOLIKHET[a.steg] || 0), under: `grund ${pct(SANNOLIKHET[a.steg] || 0)} för steget${sn.skal.length > 1 ? ` · ${plural(sn.skal.length - 1, 'signal', 'signaler')}` : ''}` },
        { emo: UPEMO.sak.vantar, etikett: 'Dagar i steget', varde: dSteg, matt: glasDagar(dSteg), under: dSteg >= 14 ? `<span class="detalj-varm">står still sedan ${e(datumText(a.stegAndrad, { gemen: true }))}</span>` : `sedan ${e(datumText(a.stegAndrad, { gemen: true }))}` }];
    return `${detaljHjalte({ tillbaka: '#/salj', tillbakaText: 'Säljtavla', typ: 'Affär', marke: loggaRuta(k, true), titel: a.titel, klass: 'detalj-affar', tal,
        text: `<a href="#/kund/${e(k.id)}">${e(k.namn)}</a> · ansvarig ${e(anv(a.ansvarig).namn)} · skapad ${e(datumText(a.skapad, { ar: true, gemen: true }))}`,
        // Steget står i remsan i hjältens fot – förlorad affär saknar remsa, och att den är förlorad (och när) står i nyckeltalet
        chips: `${klubbChip(k)}${a.franTest && projekt(a.franTest) ? `<a class="chip chip-is" href="#/projekt/${e(a.franTest)}">${ik('aterstall')}Bygger på testet ${e(datumText(projekt(a.franTest).testdatum, { ar: true, gemen: true }))}</a>` : ''}`,
        fot: a.steg === 'forlorad' ? '' : stegare(SALJSTEG, a.steg, { klickbar: a.steg !== 'signerad', affarId: a.id, emoji: UPEMO.salj }),
        // Döp om: en rund ikonknapp (som kundens Uppgifter) – inte på en låst affär (signerad eller förlorad)
        knappar: lastOffert(a) ? '' : `<button class="knapp knapp-kontur detalj-ikonknapp" type="button" data-g="andra-affar" data-affar="${e(a.id)}" aria-label="Döp om affären" title="Döp om affären">${ik('redigera')}<span class="detalj-ikon-text" aria-hidden="true">Döp om</span></button>`,
      })}
      ${affarRum(a, { k, p, docs, kanSignera, checkRad, klaraCheck })}`;
  }
  // Korten under affärens hjälte. Varje kort bär data-af (sin nyckel) och --af-o (platsen i mobilens enda kolumn).
  // Kort som byts ut live (dokumenten till kunden – se uppdateraPris) ligger i en .af-plats som bär platsen. Provisionen är en fot
  // i kortet Affärsvärde (affarKbHtml) och byts på samma sätt.
  function affarRum(a, { k, p, docs, kanSignera, checkRad, klaraCheck }) {
    const steg = AF_HUVUD[a.steg] ? a.steg : 'kontakt'; const mob = AF_MOBIL[steg];
    const plats = (n) => `data-af="${n}" style="--af-o:${Math.max(0, mob.indexOf(n))}"`;
    const iPlats = (n, html) => (html ? `<div class="af-plats" ${plats(n)}>${html}</div>` : '');
    const akt = db.aktiviteter.filter((x) => x.kundId === k.id).sort((x, y) => (x.tid < y.tid ? 1 : -1));
    // Sena lägen: offerten är inte längre lägets fokus och får stå i en bred rad under kolumnerna när det gör sidan jämnare (balanseraAffar).
    // Markören (dold) håller offertens plats i huvudkolumnen.
    const kanBred = ['underlag', 'signerad', 'forlorad'].includes(a.steg);
    const kort = {
      nasta: nastaAffarHtml(a, plats('nasta')),
      underlag: kundunderlagHtml(a, plats('underlag')),
      offert: `${kanBred ? '<i hidden data-af-hem></i>' : ''}<section class="kort af-offert" ${plats('offert')}${kanBred ? ' data-af-kan-bred' : ''}><div class="kort-huvud"><h2>${ik('dokument')}Offert</h2>${kanRaknaLive(a) ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="starta-mote" data-affar="${e(a.id)}" data-start="kalkyl" title="Öppna kalkylen i presentationsläget">${ik('presentation')}Räkna live</button>` : '<span class="rakna">Priser exkl. moms</span>'}</div>${offertFormHtml(a)}</section>`,
      // Mätaren i huvudet tänds per ikryssad rad (CSS :has) – den följer kryssen direkt, utan omritning.
      // Tidigt läge (ny kontakt, kundbesök) och låst affär: kontrollpunkterna som en kompakt remsa (data-af-kompakt) och ingen
      // Överlämna-knapp i tidigt läge (stegremsan i hjälten når Order signerad). Förlorad utan ikryssade punkter: inget kort alls.
      check: a.steg === 'forlorad' && !klaraCheck ? '' : `<section class="kort af-check" data-checklista ${plats('check')}${['kontakt', 'besok'].includes(a.steg) || lastOffert(a) ? ' data-af-kompakt' : ''}><div class="kort-huvud"><h2>${ik('bock')}Från offert till order</h2><span class="af-check-status"><span class="af-matare" aria-hidden="true">${['info', 'samtycke', 'pub', 'order'].map((x) => `<i data-v="${x}"></i>`).join('')}</span><span class="rakna">${klaraCheck} av 4 klara</span></span></div>
            <p class="af-check-text">${['kontakt', 'besok'].includes(a.steg) ? 'Blir aktuellt efter offerten – ordern signeras först när underlag och samtycke är klara.' : 'Order signeras först när underlag och samtycke är klara.'}</p>
            <div class="checklista">
              ${checkRad('info', 'Infodokument skickat', 'Personuppgifter och testval från medarbetarna')}
              ${checkRad('samtycke', 'Samtycken insamlade', 'Samtycke enligt GDPR', true)}
              ${checkRad('pub', 'PUB-avtal signerat', 'Personuppgiftsbiträdesavtal', true)}
              ${checkRad('order', 'Order skapad', 'Baserad på ifyllt underlag')}
            </div>
            ${kanSignera && !['kontakt', 'besok'].includes(a.steg) ? `<div class="af-check-fot"><button class="knapp knapp-kontur knapp-bred" type="button" data-g="overlamna" data-affar="${e(a.id)}">${ik('pil')}<span><span class="bara-bred">Order signerad – överlämna</span><span class="af-bara-smal">Överlämna</span> till testteamet</span></button></div>` : ''}
            ${p ? `<a class="lank-rad af-check-projekt" href="#/projekt/${e(p.id)}">${emo(UPEMO.proj[p.steg], { ruta: 's' })}<span class="lank-rad-text"><strong>Överlämnad till testteamet</strong><small>${e(datumText(p.skickad, { ar: true }))}</small></span>${underlagChip(p)}</a>` : ''}
          </section>`,
    };
    const sida = {
      varde: `<section class="kort detalj-pris af-varde" ${plats('varde')}><div class="kort-huvud"><h3>${ik('pengar')}${a.steg === 'signerad' ? 'Fakturering' : 'Affärsvärde'}</h3><span class="rakna">exkl. moms</span></div><div data-affar-pris>${prisHtml(a)}</div>${affarKbHtml(a)}</section>`,
      dokkund: iPlats('dokkund', dokumentKortHtml(a)),
      ansvarig: `<section class="kort af-ansvarig" ${plats('ansvarig')} data-af-svang="sida"><div class="af-ansvarig-inre">
            <label class="af-ansvarig-val"><span class="etikett">Ansvarig säljare</span><select class="falt" data-affar-ansvarig="${e(a.id)}">${saljAlternativ(a.ansvarig)}</select></label>
            ${kanSignera ? `<button class="knapp knapp-fara knapp-liten" type="button" data-g="forlora" data-affar="${e(a.id)}">Markera som förlorad</button>` : ''}
          </div></section>`,
      tidslinje: tidslinjeKortHtml(k, akt, `${plats('tidslinje')} data-af-svang="sida"`, { affarId: a.id }),
      filer: `<section class="kort af-filer" ${plats('filer')} data-af-svang="sida"><div class="kort-huvud"><h3>${ik('dokument')}Dokument</h3><span class="rakna">${docs.length}</span></div>${docs.length ? `<div class="af-filer-lista">${dokLista(docs)}</div>` : ''}${affarUppladdning(k.id, a.id, !docs.length)}</section>`,
    };
    return `<div class="rutnat-2 af-rum" data-af-rum data-steg="${e(a.steg)}">
        <div class="af-huvud" data-af-huvud>${AF_HUVUD[steg].map((n) => kort[n]).join('')}</div>
        <div class="af-sida" data-af-sida>${AF_SIDA.map((n) => sida[n]).join('')}</div>
        <div class="af-bred" data-af-bred></div>
      </div>`;
  }


  /* 08-vyer: projekt ------------------------------------------------------------- */
  const projUi = { visaKlara: false };
  function visaProjektTavla() {
    const aktiva = db.projekt.filter((p) => p.steg !== 'klar');
    const klara = db.projekt.filter((p) => p.steg === 'klar').sort((a, b) => String(b.testdatum || '').localeCompare(String(a.testdatum || '')));
    const steg = PROJSTEG.filter((s) => s.id !== 'klar');
    const attGranska = aktiva.filter((p) => p.steg === 'underlag' && p.underlagStatus === 'ny');
    const nasta = aktiva.filter((p) => p.testdatum && dagarTill(p.testdatum) >= 0 && projStegIndex(p.steg) <= projStegIndex('test')).sort((a, b) => (a.testdatum < b.testdatum ? -1 : 1))[0];
    const kol = steg.map((s) => {
      const pr = aktiva.filter((p) => p.steg === s.id);
      return `<section class="kolumn" data-projsteg="${e(s.id)}" aria-label="${e(s.namn)}, ${plural(pr.length, 'projekt', 'projekt')}" style="--steg-farg:${AGARFARG[s.agare]}"><div class="kolumn-huvud"><div class="kolumn-titel" title="${e(s.namn)}">${emo(UPEMO.proj[s.id], { ruta: 'xs' })}<span class="kolumn-namn">${e(s.namn)}</span><span class="rakna">${pr.length}</span></div>
        <div class="kolumn-hint">${agarband(s.agare)} <span>${e(s.hint)}</span></div></div>
        <div class="kolumn-kort">${pr.map((p) => { const k = kund(p.kundId); const a = affar(p.affarId); const uk = underlagKomplett(p.underlag); const d = -dagarTill(p.stegAndrad || p.skickad);
          // Vems tur: säljets steg (slutfaktura, uppföljning) och returnerat underlag ligger hos säljaren – kortet visar säljarens avatar
          const saljTur = (p.steg === 'underlag' && p.underlagStatus === 'returnerat') || s.agare === 'salj';
          return `<a class="affarskort projektkort" href="#/projekt/${e(p.id)}" style="cursor:pointer" data-tilt="7">
          <strong>${e(k.namn)}</strong><small>${e(a ? paketText(a.offert) : '')}</small>
          ${saljTur ? `<span class="projektkort-vantar"${s.agare === 'salj' ? ' data-salj' : ''}>Väntar på ${e(anv(a ? a.ansvarig : '').kort)} (sälj)</span>` : p.steg === 'underlag' ? `<span class="projektkort-vantar">Väntar på ${e(anv(p.ansvarigTest).kort)} (testteamet)</span>` : ''}
          <div class="affarskort-fot">${p.steg === 'underlag' ? underlagChip(p) : ''}${p.testdatum && projStegIndex(p.steg) <= projStegIndex('test') ? testdagChip(p) : chipAlder(d)}${p.steg === 'underlag' && !uk.komplett ? `<span class="chip chip-rod" title="${uk.klara} av ${uk.totalt} obligatoriska uppgifter">${uk.klara}/${uk.totalt}</span>` : ''}${avatar(saljTur && a ? a.ansvarig : p.ansvarigTest, true)}</div></a>`; }).join('') || `<p class="kolumn-tom">${emo(UPEMO.sak.tomt)}Inget här just nu</p>`}</div></section>`;
    }).join('');
    // Din tur: det som väntar på mig – rollmedvetet som nastaProjektHtml (sälj kompletterar sina returnerade underlag, testteamet granskar och bokar)
    const returnerade = aktiva.filter((p) => p.steg === 'underlag' && p.underlagStatus === 'returnerat');
    const arTest = anv(jag).roll === 'test';
    const minTur = arTest ? [...attGranska, ...aktiva.filter((p) => p.steg === 'bokning'), ...aktiva.filter((p) => p.steg === 'test' && p.testdatum && dagarTill(p.testdatum) <= 0)]
      : [...returnerade, ...aktiva.filter((p) => p.steg === 'slutfaktura' || p.steg === 'uppfoljning')].filter((p) => (affar(p.affarId) || {}).ansvarig === jag);
    const forst = minTur[0];
    const turText = forst ? (forst.steg === 'bokning' ? 'Boka testdag' : forst.steg === 'test' ? 'Genomför testet' : forst.steg === 'slutfaktura' ? 'Skicka slutfakturan' : forst.steg === 'uppfoljning' ? 'Håll uppföljningsmötet' : forst.underlagStatus === 'returnerat' ? 'Komplettera underlaget' : 'Granska underlaget') : '';
    // Nästa testdag är ett datum – eget glaskort utan räkneverk, i samma form som glasKort() (ingen egen lutning: kortet är en cell i glaspanelen)
    const testGlas = nasta
      ? `<a class="glas glas-is" href="#/projekt/${e(nasta.id)}"><span class="glas-etikett">${emo(UPEMO.proj.test, { ruta: 's' })}Nästa testdag</span><strong class="glas-varde">${e(datumText(nasta.testdatum))}</strong><span class="glas-under">${e(kundNamn(nasta.kundId))}</span><span class="glas-pil" aria-hidden="true">${ik('pil')}</span></a>`
      : `<div class="glas"><span class="glas-etikett">${emo(UPEMO.proj.test, { ruta: 's' })}Nästa testdag</span><strong class="glas-varde">–</strong><span class="glas-under">ingen testdag bokad</span></div>`;
    // Rollens eget tal först: testteamet granskar nya underlag, sälj kompletterar returnerade. Antalet avslutade står på "Visa avslutade".
    const kortPagaende = glasKort({ emo: UPEMO.sak.projekt, etikett: 'Pågående', varde: aktiva.length, under: 'från order till uppföljning' });
    const kortGranska = glasKort({ emo: UPEMO.proj.underlag, etikett: 'Att granska', varde: attGranska.length, under: attGranska.length ? 'nya underlag från sälj' : 'inga nya underlag', href: attGranska.length ? `#/projekt/${attGranska[0].id}` : '', ton: attGranska.length && arTest ? 'gul' : '' });
    const kortRetur = glasKort({ emo: UPEMO.larm.retur, etikett: 'Returnerade', varde: returnerade.length, under: returnerade.length ? 'väntar på komplettering' : 'inga hos sälj', href: returnerade.length ? `#/projekt/${(!arTest && minTur[0] ? minTur[0] : returnerade[0]).id}` : '', ton: !arTest && minTur.length ? 'gul' : '' });
    const tal = arTest ? [kortGranska, testGlas, kortPagaende, kortRetur] : [kortRetur, testGlas, kortPagaende, kortGranska];
    // Läget i klartext: det som väntar på mig – annars när nästa test är
    const nTest = nasta ? dagarTill(nasta.testdatum) : null;
    const lageText = forst ? `<strong>${e(kundNamn(forst.kundId))}</strong>${minTur.length > 1 ? ` och ${plural(minTur.length - 1, 'projekt till', 'projekt till')}` : ''} väntar på dig.`
      : `Inget väntar på dig just nu.${nasta ? ` Nästa test är hos <strong>${e(kundNamn(nasta.kundId))}</strong> ${nTest === 0 ? 'idag' : nTest === 1 ? 'imorgon' : `om ${nTest} dagar`}.` : ''}`;
    return `${sidhjalte({
        ogon: 'Testteamet', titel: 'Projekt', klass: 'sidhjalte-projekt',
        // Inga pågående projekt: förklara var de kommer ifrån och visa vägen dit
        text: aktiva.length ? lageText : `Inga pågående projekt just nu. Ett projekt skapas när säljaren överlämnar en signerad order till testteamet${klara.length ? ` (${klara.length} avslutade finns under Visa avslutade)` : ''}.`,
        under: `<div class="agarforklaring"><span>Vem äger steget:</span>${emo(UPEMO.roll.salj)}${agarband('salj')}${emo(UPEMO.roll.test)}${agarband('test')}${emo(UPEMO.roll.kontroll)}${agarband('kontroll')}</div>`,
        knappar: forst ? `<a class="knapp knapp-accent" href="#/projekt/${e(forst.id)}">${e(turText)}${ik('pil')}</a>`
          : nasta ? `<a class="knapp knapp-accent" href="#/projekt/${e(nasta.id)}">Öppna nästa test${ik('pil')}</a>`
            : !aktiva.length ? `<a class="knapp knapp-accent" href="#/salj">${arTest ? 'Se vad som är på väg' : 'Till säljtavlan'}${ik('pil')}</a>` : '',
        extra: `<div class="sidhjalte-tal" data-antal="4">${tal.join('')}</div>`,
      })}
      <nav class="stegband stegband-projekt" aria-label="Hoppa till steg">${steg.map((s) => `<button type="button" data-g="till-projkolumn" data-steg="${e(s.id)}" style="--steg-farg:${AGARFARG[s.agare]}"><span class="stegband-namn">${emo(UPEMO.proj[s.id], { ruta: 'xs' })}<span>${e(s.namn)}</span></span><span class="stegband-tal">${aktiva.filter((p) => p.steg === s.id).length} st</span></button>`).join('')}</nav>
      <div class="tavla-ram" data-fyll-sida><div class="tavla tavla-projekt" data-projtavla>${kol}</div></div>
      <button class="knapp knapp-spok knapp-liten forlorade-lank" type="button" data-g="visa-klara" aria-expanded="${projUi.visaKlara}">${projUi.visaKlara ? 'Dölj' : 'Visa'} avslutade (${klara.length})</button>
      ${projUi.visaKlara ? `<section class="kort" style="margin-top:10px">${klara.map((p) => { const k = kund(p.kundId); const a = affar(p.affarId); return `<div class="lank-rad avslutad-rad"><a class="lank-rad-text" href="#/projekt/${e(p.id)}"><strong>${e(k.namn)}</strong><small>${a ? `${e(a.titel)} · ` : ''}Test ${e(datumText(p.testdatum, { ar: true, gemen: true }))} · ${plural(p.genomforda || 0, 'deltagare', 'deltagare')}</small></a><span class="lank-rad-hoger"><span class="chip chip-ok">${emo(UPEMO.proj.klar)}Klar</span><button class="knapp knapp-kontur knapp-liten" type="button" data-g="spinn" data-projekt="${e(p.id)}">${ik('plus')}Sälj vidare</button></span></div>`; }).join('') || tom('Inga avslutade projekt.')}</section>` : ''}`;
  }

  // Nästa steg i projektet. Rollmedvetet: säljaren godkänner inte sitt eget underlag och testteamet kompletterar inte säljarens.
  /* Projektets Nästa steg – samma kort som affärens Nästa bästa steg (af-nasta): vems tur det är i ögonraden, steget som rubrik med
     en mening, varningar som chips och sist stegets formulär eller knappar. Rollmedvetet: testteamet granskar och bokar, sälj
     kompletterar sina returnerade underlag. Formulären (data-form) och åtgärderna (data-g) är desamma som förut. */
  const PJ_AGARE = { test: 'Testteamet', salj: 'Sälj', kontroll: 'Kontrollpunkt' };
  // Beställt antal deltagare (null för en specialoffert) och avstämningens avvikelse – sparad i p.avvikelse (FORM.avstamning),
  // annars räknad för äldre projekt som redan är avstämda
  const projBestallt = (a) => (a.offert.eget != null ? null : a.offert.typ === 'uppfoljning' ? prisa(a.offert).antal : a.offert.deltagare && a.offert.deltagare.length ? a.offert.deltagare.length : a.offert.antal);
  const projAvvikelse = (p, a) => {
    if (p.avvikelse && p.avvikelse.diff) return p.avvikelse;
    const b = parseInt(projBestallt(a), 10);
    if (p.avvikelse !== undefined || projStegIndex(p.steg) < projStegIndex('slutfaktura') || p.genomforda == null || p.genomforda === '' || !Number.isFinite(b) || +p.genomforda === b) return null;
    return { diff: +p.genomforda - b, bestallt: b, genomforda: +p.genomforda };
  };
  const avvikelseText = (av) => `${av.diff > 0 ? '+' : '−'}${Math.abs(av.diff)} pers`;
  const dagMan = (iso) => { const d = tolka(iso); return d ? d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '') : ''; };
  /* Bokningen: datumväljaren (assets/kalender.js) öppnas på önskad vecka ur underlaget (data-kal-start, "Vecka 46" → måndagen i
     veckan, närmast framåt) och markerar testteamets andra bokade testdagar (data-kal-markera); helgerna är dämpade i kalendern och
     en lördag eller söndag frågar en gång till i FORM.boka. Start- och sluttid är valfria (utan tid är testdagen en heldag). */
  const veckaStart = (text) => {
    const m = /\b(?:vecka|v\.?)\s*(\d{1,2})\b/i.exec(String(text || '')); const v = m ? +m[1] : 0;
    if (v < 1 || v > 53) return '';
    const mandag = (ar) => { const j4 = new Date(ar, 0, 4, 12); const d = new Date(j4); d.setDate(j4.getDate() - ((j4.getDay() + 6) % 7) + (v - 1) * 7); return d; };
    const nu = new Date(); nu.setHours(12, 0, 0, 0);
    let d = mandag(nu.getFullYear()); const sondag = new Date(d); sondag.setDate(d.getDate() + 6);
    if (sondag < nu) d = mandag(nu.getFullYear() + 1);
    return lokalISO(d);
  };
  const helgdag = (iso) => { const d = tolka(iso); return !!d && !isNaN(d) && (d.getDay() === 0 || d.getDay() === 6); };
  const andraTestdagar = (p) => [...new Set(db.projekt.filter((x) => x.id !== p.id && x.testdatum && projStegIndex(x.steg) <= projStegIndex('test') && dagarTill(x.testdatum) >= 0).map((x) => x.testdatum))].sort().slice(0, 60);
  const bokaFalt = (p) => {
    const start = p.testdatum ? '' : veckaStart(p.underlag && p.underlag.period); const t = p.testtid || {};
    return `<div class="pj-form-rad pj-boka-rad"><label class="pj-boka-datum"><span class="etikett">Testdatum</span><input class="falt" type="date" name="datum" required data-fel="Välj ett testdatum från idag och högst två år framåt" min="${idag()}" max="${omDagar(730)}" value="${e(p.testdatum || '')}"${start && dagarTill(start) >= 0 ? ` data-kal-start="${e(start)}"` : ''} data-kal-markera="${e(andraTestdagar(p).join(','))}" data-kal-markera-text="Annan testdag"></label>
      <label><span class="etikett">Starttid <em>(valfritt)</em></span><input class="falt" type="time" name="start" step="300" value="${e(t.start || '')}"></label>
      <label><span class="etikett">Sluttid <em>(valfritt)</em></span><input class="falt" type="time" name="slut" step="300" value="${e(t.slut || '')}"></label></div>
      <input type="hidden" name="helg" value="">`;
  };
  // Kontaktpersonen för bekräftelsen: personen i kundregistret som underlaget nämner som kontakt på plats (med e-post), annars kundens första kontakt
  const testdagKontakt = (p) => {
    const k = kund(p.kundId); const namn = String((p.underlag && p.underlag.kontakt) || '').split(',')[0].trim().toLowerCase();
    const lista = (k && k.kontakter) || [];
    return (namn && lista.find((c) => c.epost && String(c.namn || '').trim().toLowerCase() === namn)) || lista.find((c) => c.epost) || null;
  };
  // Bekräftelsen av testdagen till kunden (mailto – inget skickas från servern): datum, tid, adress, lokal och antal deltagare
  const bekraftelseMejl = (p, a, c) => {
    const k = kund(p.kundId); const u = p.underlag || {}; const tt = testtidText(p); const n = projBestallt(a);
    const dag = tolka(p.testdatum).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const rader = [`Hej ${String(c.namn || '').split(' ')[0]}!`, '', `Här är en bekräftelse av testdagen hos ${k.namn}:`, '',
      `Datum: ${stor(dag)}${tt ? `, ${tt.startsWith('från') ? `från kl. ${tt.slice(5)}` : `kl. ${tt}`}` : ''}`,
      u.adress ? `Adress: ${u.adress}` : null, u.lokal ? `Lokal och utrustning på plats: ${u.lokal}` : null, n ? `Antal deltagare: ${n}` : null,
      u.kontakt ? `Kontaktperson på plats: ${u.kontakt}${u.telefon ? `, ${u.telefon}` : ''}` : null, '',
      'Hör av dig om något har ändrats inför dagen – tider, lokal eller antal deltagare.', '', 'Vänliga hälsningar', `${anv(jag).namn}, Uperformance`];
    return `mailto:${c.epost}?subject=${encodeURIComponent(`Bekräftelse av testdagen ${dagMan(p.testdatum)} – Uperformance`)}&body=${encodeURIComponent(rader.filter((x) => x != null).join('\n'))}`;
  };
  const stor = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const nastaProjektHtml = (p, a, attr = '') => {
    const antal = a.offert.eget != null ? (p.genomforda || '') : a.offert.typ === 'uppfoljning' ? prisa(a.offert).antal : a.offert.deltagare && a.offert.deltagare.length ? a.offert.deltagare.length : a.offert.antal;
    const pr = prisa(a.offert);
    const mig = anv(jag); const arTest = mig.roll === 'test'; const admin = arAdmin();
    const k = kund(p.kundId); const st = PROJSTEG.find((x) => x.id === p.steg);
    // Ordern är makulerad (admin): en varm rad överst med vägen vidare – sälj skapar en ny order, testteamet ser att den behövs
    const mak = p.steg === 'klar' ? null : orderMakulerad(a);
    const makRad = mak ? (() => {
      const ny = dokFor(a.id, 'order'); const kanSkapa = !arTest || admin; const fore = projStegIndex(p.steg) <= projStegIndex('test');
      const text = ny || kanSkapa ? makuleradText(a, mak, { fore }) : `Ordern ${mak.nummer} är makulerad – säljaren behöver skapa en ny order${fore ? ' innan testdagen' : ''}`;
      return `<div class="pj-makulerad" role="note">${ik('varning')}<span>${e(text)}.</span>${!ny && kanSkapa ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="order">${ik('plus')}Skapa order</button>` : ''}</div>`;
    })() : '';
    // vem: vems tur det är när det inte är stegets ägare (returnerat underlag ligger hos sälj)
    const kortet = ({ ton = '', vem = '', titel, under = '', tider = '', form = '', knappar = '' }) => `<section class="kort nasta-kort af-nasta pj-nasta" ${attr}${ton || mak ? ` data-af-ton="${mak ? 'varm' : ton}"` : ''}><div class="af-nasta-inre">
      <span class="overrad">${p.steg === 'klar' ? 'Klart' : `Nästa steg · ${vem || PJ_AGARE[st && st.agare] || 'Testteamet'}`}</span>
      <div class="nasta-kort-rad">${emo(UPEMO.proj[p.steg] || UPEMO.proj.klar, { ruta: 'l', ton: ton === 'varm' || mak ? 'gul' : ton === 'klar' ? 'mint' : '' })}<div><strong>${titel}</strong>${under ? `<small>${under}</small>` : ''}</div></div>
      ${makRad}${tider ? `<div class="nasta-kort-tider">${tider}</div>` : ''}${form}
      ${knappar ? `<div class="nasta-kort-fot">${knappar}</div>` : ''}
    </div></section>`;
    // Rollstyrt som underlagssteget: den som inte äger steget ser vem det väntar på, inte stegets huvudåtgärd. Testteamet bokar,
    // testar och stämmer av; sälj skickar slutfakturan och håller uppföljningen. Admin ser allt.
    const testSteg = ['bokning', 'test', 'avstamning'].includes(p.steg); const saljSteg = ['slutfaktura', 'uppfoljning'].includes(p.steg);
    if (!admin && ((testSteg && !arTest) || (saljSteg && arTest))) {
      const vem = testSteg ? (p.ansvarigTest ? anv(p.ansvarigTest).kort : 'testteamet') : anv(a.ansvarig).kort;
      const gor = { bokning: 'bokar testdagen direkt med kunden', test: 'genomför testet och registrerar hur många som deltog', avstamning: 'stämmer av genomfört mot beställt',
        slutfaktura: `skickar slutfakturan (resterande ${Math.round((1 - PRISER.forskott) * 100)} % av ordervärdet)`, uppfoljning: 'håller uppföljningsmötet med kunden' }[p.steg];
      return kortet({ titel: `Väntar på ${e(vem)}`, under: `${e(vem.charAt(0).toUpperCase() + vem.slice(1))} ${gor}.`, tider: testSteg && p.testdatum ? testdagChip(p) : '' });
    }
    switch (p.steg) {
      case 'underlag': {
        const uk = underlagKomplett(p.underlag);
        // Returkommentaren står i kortet Underlag från sälj (statusrutan) – här bara vems tur det är. Har underlaget legat hos
        // säljaren i två dagar eller mer kan testteamet påminna (säljarens uppgift får dagens datum, G['pamin-saljare']).
        if (p.underlagStatus === 'returnerat') {
          if (arTest && !admin) {
            const retDag = String(p.returnerad || '').slice(0, 10) ? lokalISO(new Date(p.returnerad)) : p.skickad; const dagar = retDag ? -dagarTill(retDag) : 0;
            const pamint = p.paminnd && p.paminnd === idag();
            return kortet({ vem: 'Sälj', titel: `Väntar på ${e(anv(a.ansvarig).kort)}`, under: `Underlaget är returnerat till säljaren, som kompletterar och skickar igen${dagar >= 1 ? ` – returnerat för ${plural(dagar, 'dag', 'dagar')} sedan` : ''}.`,
              tider: pamint ? `<span class="chip chip-ok">${ik('bock')}${e(anv(a.ansvarig).kort)} är påmind idag</span>` : '',
              knappar: dagar >= 2 && !pamint ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="pamin-saljare" data-projekt="${e(p.id)}">${ik('klocka')}Påminn ${e(anv(a.ansvarig).kort)}</button>` : '' });
          }
          return kortet({ ton: 'varm', vem: 'Sälj', titel: 'Komplettera underlaget', under: 'Testteamet har returnerat underlaget. Komplettera och skicka igen.',
            knappar: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="komplettera" data-projekt="${e(p.id)}">${ik('redigera')}Komplettera underlag</button>` });
        }
        if (!arTest && !admin) return kortet({ titel: 'Väntar på testteamet', under: `${e(anv(p.ansvarigTest).kort)} granskar underlaget och bokar sedan tid direkt med kunden.`,
          knappar: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="komplettera" data-projekt="${e(p.id)}">${ik('redigera')}Redigera underlag</button>` });
        // Komplett: godkänn är huvudåtgärden. Något saknas: returnera är huvudåtgärden och godkänn står kvar avstängd.
        return kortet({ ton: uk.komplett ? 'klar' : 'varm', titel: 'Kontrollera underlaget', under: 'Testteamet har ingen relation till kunden. Godkänn bara om allt som behövs finns med.',
          tider: uk.komplett ? '' : `<span class="chip chip-gul chip-prick">${plural(uk.saknas.length, 'sak saknas', 'saker saknas')} – returnera till säljaren</span>`,
          knappar: `<button class="knapp ${uk.komplett ? 'knapp-accent' : 'knapp-kontur'} knapp-liten" type="button" data-g="godkann-underlag" data-projekt="${e(p.id)}" ${uk.komplett ? '' : 'disabled'}>${ik('bock')}Underlag komplett – boka tid</button>
            <button class="knapp ${uk.komplett ? 'knapp-kontur' : 'knapp-accent'} knapp-liten" type="button" data-g="returnera" data-projekt="${e(p.id)}">${ik('retur')}Returnera till sälj</button>` });
      }
      case 'bokning': {
        const tel = p.underlag.telefon ? `<a href="tel:${e(p.underlag.telefon.replace(/\s/g, ''))}">${e(p.underlag.telefon)}</a>` : '–';
        const fn = String(p.underlag.kontakt || '').split(/[\s,]+/)[0];
        return kortet({ titel: 'Boka tid med kunden', under: `Ring ${e(p.underlag.kontakt || 'kontaktpersonen')} · ${tel}. Önskemål: ${e(p.underlag.period || '–')}.`,
          form: `<form class="falt-grupp pj-nasta-form" data-form="boka" data-projekt="${e(p.id)}">${bokaFalt(p)}
          <div class="pj-form-knappar"><button class="knapp knapp-accent" type="submit">${ik('kalender')}Spara testdatum</button>${p.underlag.telefon ? `<a class="knapp knapp-kontur" href="tel:${e(p.underlag.telefon.replace(/\s/g, ''))}">${ik('samtal')}Ring${fn ? ` ${e(fn)}` : ''}</a>` : ''}</div></form>` });
      }
      case 'test': {
        const n = p.testdatum ? dagarTill(p.testdatum) : null;
        // Testdagen står i sidhjälten – här varningen när dagen är här eller har passerat, om bekräftelsen till kunden är skickad
        // och närvaron från testdagslistan (antalet närvarande föreslås som Antal genomförda)
        const lank = a.offert.underlag && db.kundlankar[a.offert.underlag];
        const narvarande = lank ? (lank.deltagare || []).filter((d) => p.narvaro && p.narvaro[d.id]).length : 0;
        const forslag = narvarande || antal;
        const bk = p.bekraftad && p.bekraftad.testdatum === p.testdatum ? p.bekraftad : null;
        return kortet({ ton: n != null && n < 0 ? 'varm' : '', titel: 'Genomför testet', under: e(p.underlag.adress || ''),
          tider: `${n != null && n <= 0 ? `<span class="chip ${n === 0 ? 'chip-gul' : 'chip-rod'} chip-prick">${n === 0 ? 'Testet är idag' : `Testdagen var för ${plural(-n, 'dag', 'dagar')} sedan`}</span>` : ''}${n != null && n > 0 ? (bk ? `<span class="chip chip-ok">${ik('mejl')}Bekräftad till ${e(String(bk.till || 'kunden').split(' ')[0])} ${e(datumText(lokalISO(new Date(bk.tid)), { gemen: true }))}</span>` : testdagKontakt(p) ? '<span class="chip">Inte bekräftad till kunden än</span>' : '<span class="chip">Bekräfta per telefon – ingen kontakt med e-post</span>') : ''}${narvarande ? `<span class="chip chip-is">${ik('bock')}${plural(narvarande, 'närvarande', 'närvarande')} enligt testdagslistan</span>` : ''}`,
          form: `<form class="falt-grupp pj-nasta-form" data-form="genomfort" data-projekt="${e(p.id)}">
            <div class="pj-form-rad"><label><span class="etikett">Antal genomförda${a.offert.eget != null ? '' : ` (beställt ${e(antal)})`}</span><input class="falt" type="number" name="genomforda" min="0" value="${e(forslag)}" required data-fel="Ange hur många som genomförde testet"></label>
            <label class="kryss"><input type="checkbox" name="app" checked><span>Alla onboardade i UPerformance App</span></label></div>
            <div class="pj-form-knappar"><button class="knapp knapp-accent" type="submit">${ik('bock')}Test genomfört</button>
            <button class="knapp knapp-kontur" type="button" data-g="testdagslista" data-projekt="${e(p.id)}">${ik('todo')}Testdagslista</button>
            <button class="knapp knapp-spok" type="button" data-g="omboka" data-projekt="${e(p.id)}">Boka om</button></div></form>` });
      }
      case 'avstamning': {
        const diff = a.offert.eget != null ? 0 : (p.genomforda || 0) - (parseInt(antal, 10) || 0);
        return kortet({ ton: diff !== 0 ? 'varm' : '', titel: 'Avstämning', under: 'Genomfört mot beställt.',
          form: `<div class="pj-tal"><div><span>Beställt</span><strong>${a.offert.eget != null ? 'Specialoffert' : `${e(antal)} pers`}</strong></div><div><span>Genomfört</span><strong>${e(p.genomforda)} pers</strong></div><div${diff !== 0 ? ' data-varm' : ''}><span>Avvikelse</span><strong>${diff === 0 ? 'Ingen' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} pers`}</strong></div></div>
          ${diff !== 0 ? '<p class="pj-not">Stäm av med säljaren innan slutfakturan – ska den justeras?</p>' : ''}
          <form class="falt-grupp pj-nasta-form" data-form="avstamning" data-projekt="${e(p.id)}"><label><span class="etikett">Kommentar till sälj <em>(valfritt)</em></span><textarea class="falt" name="kommentar" rows="2"></textarea></label>
          <div class="pj-form-knappar"><button class="knapp knapp-accent" type="submit">${ik('bock')}Avstämning klar</button></div></form>` });
      }
      case 'slutfaktura': {
        // Avvikelsen från avstämningen (genomfört mot beställt) står som en varm rad – stäm av innan slutfakturan skickas
        const av = projAvvikelse(p, a);
        return kortet({ ton: av ? 'varm' : '', titel: 'Skicka slutfaktura', under: `Resterande ${Math.round((1 - PRISER.forskott) * 100)} % av ordervärdet.`,
          form: `${av ? `<p class="pj-avvikelse" role="note">${ik('varning')}<span><strong>Avvikelse ${e(avvikelseText(av))}</strong> – beställt ${e(av.bestallt ?? '–')}, genomfört ${e(av.genomforda ?? p.genomforda)}. Stäm av innan slutfakturan.${av.kommentar ? ` <q>${e(av.kommentar)}</q>` : ''}</span></p>` : ''}<div class="pj-tal"><div><span>Att fakturera</span><strong>${kr(fakturaDelar(pr.total).slut)}</strong></div></div>`,
          knappar: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="slutfaktura" data-projekt="${e(p.id)}">${ik('pengar')}Slutfaktura skickad</button>` });
      }
      case 'uppfoljning': {
        const forslag = p.testdatum ? omDagar(60, p.testdatum) : omDagar(14);
        return kortet({ titel: 'Uppföljningsmöte', under: `Cirka två månader efter testet – förslag ${e(datumText(forslag, { ar: true, gemen: true }))}.`,
          form: `<form class="falt-grupp pj-nasta-form" data-form="uppfoljning" data-projekt="${e(p.id)}"><label><span class="etikett">Anteckning från mötet</span><textarea class="falt" name="text" rows="3" required data-fel="Skriv kort hur mötet gick" placeholder="Hur gick det? Vad vill kunden göra härnäst?"></textarea></label>
          <label class="kryss"><input type="checkbox" name="omtest"><span>Skapa affär för omtest<small>Hamnar i säljtavlan i steget Kundbesök</small></span></label>
          <div class="pj-form-knappar"><button class="knapp knapp-accent" type="submit">${ik('bock')}Uppföljning klar – avsluta</button></div></form>` });
      }
      default:
        // Testdagen står i sidhjälten
        return kortet({ ton: 'klar', titel: 'Projektet är klart', under: `${p.uppfoljningDatum ? `Uppföljning ${e(datumText(p.uppfoljningDatum, { ar: true, gemen: true }))}. ` : ''}Testet är sparat under ${e(k ? k.namn : 'kunden')}.`,
          knappar: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="spinn" data-projekt="${e(p.id)}">${ik('plus')}Sälj vidare på testet</button>` });
    }
  };
  // Testansvarig: bara testteamet (den som redan är vald visas ändå)
  const testAlternativ = (vald) => aktiva(vald).filter((u) => u.roll === 'test' || u.id === vald).map((u) => `<option value="${e(u.id)}" ${vald === u.id ? 'selected' : ''}>${e(u.namn)}</option>`).join('');
  /* Projektsidan (testteamets ärende, stil i sidor.css 13b): samma rum som affärssidan (.af-rum) – balanseraAffar() ställer
     tidslinjen (svängkort) där kolumnerna blir jämnast och sträcker sista kortet, sidokolumnen följer med vid scroll, murAffar() lägger
     sidokorten i två spalter på surfplatta och --af-o ger mobilens ordning. Huvudkolumnen är arbetet: Nästa steg, underlaget från
     sälj, hälsoformulären och deltagarlistan (som kan stå i en bred rad under kolumnerna). Sidokolumnen: ekonomin med Klubbmotorns
     fot, de ansvariga och tidslinjen. */
  const PJ_HUVUD = ['nasta', 'overlamning', 'halsa', 'deltagare'];
  const PJ_SIDA = ['ekonomi', 'ansvarig', 'tidslinje'];
  const PJ_MOBIL = ['nasta', 'overlamning', 'halsa', 'deltagare', 'ekonomi', 'ansvarig', 'tidslinje'];
  function visaProjekt(id) {
    const p = projekt(id);
    if (!p) return detaljSaknas('#/projekt', 'Projekt', 'Projektet finns inte', 'Till projekten');
    const k = kund(p.kundId); const a = affar(p.affarId);
    const uk = underlagKomplett(p.underlag);
    const r = 20; const omkrets = 2 * Math.PI * r;
    const plats = (n) => `data-af="${n}" style="--af-o:${Math.max(0, PJ_MOBIL.indexOf(n))}"`;
    const tillval = a.offert.eget != null ? a.offert.beskrivning : paketText(a.offert);
    // Ekonomi: statusen följer verkligheten – förskottet enligt att göra-listan, slutfakturan enligt steget
    const slutSkickad = !!p.slutfakturaDatum || projStegIndex(p.steg) > projStegIndex('slutfaktura');
    const forskottKvar = !slutSkickad && db.todos.some((t) => t.kundId === p.kundId && (!t.affarId || t.affarId === p.affarId) && !t.klar && /^Skicka förskottsfaktura/.test(t.text));
    const fakturerat = (forskottKvar ? 0 : PRISER.forskott) + (slutSkickad ? 1 - PRISER.forskott : 0);
    const fd = fakturaDelar(affarVarde(a)); const fp = Math.round(PRISER.forskott * 100);
    const l = a.offert.underlag && db.kundlankar[a.offert.underlag];
    const akt = db.aktiviteter.filter((x) => x.kundId === k.id).sort((x, y) => (x.tid < y.tid ? 1 : -1));
    // Sidhjälten: projektet som ett ärende – affären, vems steget är, testdagen, deltagarna och ordervärdet; stegen som remsa i foten
    const nTest = p.testdatum ? dagarTill(p.testdatum) : null;
    const bestallt = a.offert.eget != null ? null : a.offert.typ === 'uppfoljning' ? prisa(a.offert).antal : a.offert.deltagare && a.offert.deltagare.length ? a.offert.deltagare.length : a.offert.antal;
    const genomford = p.genomforda != null && p.genomforda !== '';
    const deltagare = genomford ? +p.genomforda : bestallt;
    const tt = testtidText(p); const ttUnder = tt ? ` · ${tt.startsWith('från') ? tt : `kl. ${tt}`}` : '';
    const tal = [
      // Igår/idag/imorgon: datumet med veckodag stort och den relativa dagen under (förut "Idag … idag") – klockslaget efter
      { emo: UPEMO.proj.test, etikett: 'Testdag', text: p.testdatum ? e(nTest != null && Math.abs(nTest) <= 1 ? dagText(p.testdatum) : datumText(p.testdatum, { ar: true })) : 'Inte bokad än',
        under: nTest == null ? (p.steg === 'underlag' ? 'Bokas när underlaget är granskat' : 'Testteamet bokar tid med kunden') : `${Math.abs(nTest) <= 1 ? datumText(p.testdatum, { gemen: true }) : nTest > 0 ? `om ${plural(nTest, 'dag', 'dagar')}` : `för ${plural(-nTest, 'dag', 'dagar')} sedan`}${e(ttUnder)}` },
      deltagare == null ? { emo: UPEMO.sak.team, etikett: 'Deltagare', text: '–', under: 'specialoffert' }
        : { emo: UPEMO.sak.team, etikett: 'Deltagare', varde: deltagare, matt: genomford && bestallt ? glasRing(deltagare / bestallt, 0) : '', under: p.genomforda != null && p.genomforda !== '' ? (bestallt != null ? `genomförda av ${e(bestallt)} beställda` : 'genomförda') : 'beställda' },
      { emo: UPEMO.sak.snitt, etikett: 'Ordervärde', varde: affarVarde(a), format: 'kr', under: 'exkl. moms', titel: 'Förskott och slutfaktura i kortet Ekonomi' },
    ];
    // Senaste rundan returnerat → kompletterat (p.underlagHistorik, FORM.overlamning): vad säljaren ändrade och vad testteamet
    // skrev – visas medan underlaget granskas och tiden bokas. Ändrade fält får data-andrad.
    const runda = !['underlag', 'bokning'].includes(p.steg) || p.underlagStatus === 'returnerat' ? null : (p.underlagHistorik || []).slice(-1)[0] || null;
    const andradeFalt = new Set((runda && runda.andradeFalt) || []);
    const FALTNAMN = Object.fromEntries([...UNDERLAG_FALT, ...UNDERLAG_KONTROLL].map((f) => [f.id, f.etikett]));
    // Underlaget: uppgifterna som rutor (saknas = röd ruta, tom valfri = dämpad), telefonen som länk, adressen med en uttrycklig
    // kartlänk (öppnar Google Maps – adressen lämnar CRM:et först när man klickar), kontrollpunkterna med bock
    const faltHtml = UNDERLAG_FALT.map((f) => {
      const v = String(p.underlag[f.id] || '').trim(); const saknas = f.krav && !v;
      const varde = saknas ? '<span class="pj-saknas">Saknas</span>' : !v ? '<span class="pj-tom">Inte ifyllt</span>'
        : f.typ === 'tel' ? `<a href="tel:${e(v.replace(/\s/g, ''))}">${e(v)}</a>`
          : f.id === 'adress' ? `${e(v)} <a class="pj-karta" href="${e(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`)}" target="_blank" rel="noopener noreferrer" title="Öppnar adressen i Google Maps (en tjänst utanför CRM:et)">${ik('plats')}Karta</a>` : e(v);
      return `<div class="pj-f"${f.textarea ? ' data-hel' : ''}${saknas ? ' data-saknas' : ''}${andradeFalt.has(f.id) ? ' data-andrad' : ''}><dt>${e(f.etikett)}${f.krav ? '' : '<em>valfritt</em>'}${andradeFalt.has(f.id) ? '<em class="pj-andrad">Ändrat</em>' : ''}</dt><dd>${varde}</dd></div>`;
    }).join('');
    const kontrollHtml = UNDERLAG_KONTROLL.map((f) => { const ok = !!p.underlag[f.id];
      return `<li${ok ? ' data-ok' : ''}${andradeFalt.has(f.id) ? ' data-andrad' : ''}><span class="pj-k-ikon" aria-hidden="true">${ik(ok ? 'bock' : 'stang')}</span><span>${e(f.etikett)}<small>${ok ? 'Klart' : 'Saknas'}${andradeFalt.has(f.id) ? ' · ändrat' : ''}</small></span></li>`; }).join('');
    const retur = p.underlagStatus === 'returnerat';
    const ukLage = retur ? 'retur' : uk.komplett ? 'komplett' : 'brist';
    const ensam = db.anvandare.filter((u) => u.roll === 'test' && arAktiv(u)).length <= 1;
    const saljare = anv(a.ansvarig);
    const kanRedigera = anv(jag).roll !== 'test' || arAdmin();
    const avv = projAvvikelse(p, a);
    // Bekräftelsen till kunden (mailto) när testdagen är bokad och inte har varit – bara med en kontaktperson som har e-post
    const bekr = p.testdatum && nTest >= 0 && p.steg === 'test' ? testdagKontakt(p) : null;
    // Statusrutan: returnerat underlag säger det (och testteamets kommentar) – aldrig "komplett" med bock i en röd ruta.
    // Säljaren kompletterar härifrån (accentknapp); annars Redigera underlag.
    const statusRubrik = retur ? 'Returnerat till sälj – väntar på komplettering' : uk.komplett ? 'Underlaget är komplett' : `${uk.saknas.length} ${uk.saknas.length === 1 ? 'uppgift saknas' : 'uppgifter saknas'}`;
    const retNar = retur && p.returnerad ? ` · returnerat ${relTid(p.returnerad)}${p.returneradAv ? ` av ${anv(p.returneradAv).kort}` : ''}` : '';
    const statusRad = retur ? `${p.returKommentar ? `<q class="pj-status-citat">${e(p.returKommentar)}</q>` : ''}<small>${uk.klara} av ${uk.totalt} obligatoriska uppgifter klara${uk.komplett ? '' : ' · saknas: ' + e(uk.saknas.join(', '))}${e(retNar)}</small>`
      : `<small>${uk.klara} av ${uk.totalt} obligatoriska uppgifter klara${uk.komplett ? '' : ' · saknas: ' + e(uk.saknas.join(', '))}</small>`;
    const kompletterat = runda && runda.kompletterad && lokalISO(new Date(runda.kompletterad)) === p.skickad;
    const kort = {
      nasta: nastaProjektHtml(p, a, plats('nasta')),
      overlamning: `<section class="kort pj-underlag" ${plats('overlamning')}><div class="kort-huvud"><h2>${ik('underlag')}Underlag från sälj</h2><span class="rakna">${kompletterat ? 'Kompletterat' : 'Skickat'} ${e(datumText(p.skickad, { ar: true, gemen: true }))} av ${e(saljare.kort)}</span></div>
          <div class="pj-underlag-inre">
            <div class="pj-status" data-status="${ukLage}"><span class="ring-liten-yta"><svg class="ring-liten" viewBox="0 0 48 48" aria-hidden="true"><circle class="spar" cx="24" cy="24" r="${e(r)}"/><circle class="fyll" cx="24" cy="24" r="${e(r)}" stroke-dasharray="${e(omkrets)}" stroke-dashoffset="${omkrets * (1 - uk.klara / uk.totalt)}"/></svg>${retur ? `<span class="ring-bock">${ik('retur')}</span>` : uk.komplett ? `<span class="ring-bock">${ik('bock')}</span>` : `<b>${uk.klara}/${uk.totalt}</b>`}</span>
              <span class="pj-status-text"><strong>${e(statusRubrik)}</strong>${statusRad}</span>
              ${kanRedigera ? `<button class="knapp ${retur ? 'knapp-accent' : 'knapp-kontur'} knapp-liten" type="button" data-g="komplettera" data-projekt="${e(p.id)}">${ik('redigera')}${retur ? 'Komplettera underlag' : 'Redigera underlag'}</button>` : ''}</div>
            ${runda ? `<div class="pj-runda">${emo(UPEMO.sak.omtest, { ruta: 's', ton: 'is' })}<span><strong>Kompletterat ${e(relTid(runda.kompletterad))}${runda.kompletteradAv ? ` av ${e(anv(runda.kompletteradAv).kort)}` : ''}</strong><small>${andradeFalt.size ? `Ändrat: ${e([...andradeFalt].map((x) => FALTNAMN[x] || x).join(', '))}` : 'Inga uppgifter ändrades'}</small>${runda.kommentar ? `<small>Returnerades med: <q>${e(runda.kommentar)}</q></small>` : ''}</span></div>` : ''}
            <div class="pj-bestallning">${emo(UPEMO.proj.test, { ruta: 'm', ton: 'is' })}<span><small>Beställning</small><strong>${e(tillval)}</strong></span></div>
            <dl class="pj-falt">${faltHtml}</dl>
            <div class="pj-kontroll"><p class="pj-kontroll-rubrik">Kontrollpunkter</p><ul>${kontrollHtml}</ul></div>
          </div></section>`,
      // Hälsoformulären och deltagarlistan är breda tabeller och flyttar tillsammans till raden under kolumnerna när det gör sidan
      // jämnare (balanseraAffar) – markören före dem håller platsen i huvudkolumnen
      halsa: l && HALSA ? `<i hidden data-af-hem></i>${halsoKortHtml(l, a.offert.underlag).replace('<section class="kort">', `<section class="kort pj-halsa" ${plats('halsa')} data-af-kan-bred>`)}` : '',
      deltagare: l ? `${HALSA ? '' : '<i hidden data-af-hem></i>'}<section class="kort pj-deltagare" ${plats('deltagare')} data-af-kan-bred><div class="kort-huvud"><h2>${ik('mote')}Deltagarlista</h2><span class="pj-deltagare-huvud"><span class="rakna">${plural((l.deltagare || []).length, 'person', 'personer')} · från kundunderlaget</span><button class="knapp knapp-kontur knapp-liten" type="button" data-g="testdagslista" data-projekt="${e(p.id)}" title="Närvarolista att skriva ut eller bocka av i mobilen">${ik('skrivare')}Testdagslista</button></span></div><div class="pj-tabell">${deltagarTabell(l, { utanEpost: true })}</div></section>` : '',
      ekonomi: `<section class="kort pj-ekonomi" ${plats('ekonomi')}><div class="kort-huvud"><h3>${ik('pengar')}Ekonomi</h3><span class="rakna">${Math.round(fakturerat * 100)} % fakturerat</span></div>
          <div class="pj-betal"><div class="pj-betal-stapel" role="img" aria-label="${e(`Förskott ${fp} procent ${forskottKvar ? 'inte fakturerat' : 'fakturerat'}, slutfaktura ${100 - fp} procent ${slutSkickad ? 'skickad' : 'inte skickad'}`)}"><i style="flex:${fp}"${forskottKvar ? '' : ' data-klar'}></i><i style="flex:${100 - fp}"${slutSkickad ? ' data-klar' : ''}></i></div>
            <dl class="pj-betal-rader"><div><dt><b>${fp} %</b>Förskott</dt><dd><strong>${kr(fd.forskott)}</strong>${forskottKvar ? '<span class="chip chip-gul">Att skicka</span>' : '<span class="chip chip-ok">Fakturerat</span>'}</dd></div>
            <div><dt><b>${100 - fp} %</b>Slutfaktura</dt><dd><strong>${kr(fd.slut)}</strong>${slutSkickad ? `<span class="chip chip-ok">Skickad${p.slutfakturaDatum ? ' ' + e(datumText(p.slutfakturaDatum, { gemen: true })) : ''}</span>` : '<span class="chip">Ej skickad</span>'}</dd></div></dl>
            ${avv ? `<p class="pj-avvikelse"${slutSkickad ? ' data-lugn' : ''} role="note">${ik('varning')}<span><strong>Avvikelse ${e(avvikelseText(avv))}</strong> ${slutSkickad ? 'mot beställt vid avstämningen' : '– stäm av innan slutfakturan'}${avv.kommentar ? `. <q>${e(avv.kommentar)}</q>` : '.'}</span></p>` : ''}</div>
          ${affarKbHtml(a)}</section>`,
      // De ansvariga: säljaren (läses, länk till affären) och testansvarig (väljs – bara testteamet)
      ansvarig: `<section class="kort pj-ansvarig" ${plats('ansvarig')}><div class="kort-huvud"><h3>${ik('kunder')}Ansvariga</h3></div>
          <div class="pj-ansvariga">
            <a class="pj-person" href="#/affar/${e(a.id)}">${avatar(a.ansvarig)}<span><small>Sälj</small><strong>${e(saljare.namn)}</strong></span><span class="pj-person-pil" aria-hidden="true">${ik('pil')}</span></a>
            <label class="af-ansvarig-val"><span class="etikett">Testansvarig</span><select class="falt" data-proj-ansvarig="${e(p.id)}">${testAlternativ(p.ansvarigTest)}</select></label>
            ${ensam ? '<p class="falt-hint">Testteamet har en person just nu.</p>' : ''}
          </div></section>`,
      tidslinje: tidslinjeKortHtml(k, akt, `${plats('tidslinje')} data-af-svang="sida"`, { affarId: a.id }),
    };
    return `${detaljHjalte({ tillbaka: '#/projekt', tillbakaText: 'Projekt', typ: 'Testteamet', marke: loggaRuta(k, true), titel: k.namn, klass: 'detalj-projekt', tal,
        text: `<a href="#/affar/${e(a.id)}">${e(a.titel)}</a> · säljare ${e(saljare.kort)} · testansvarig ${e(anv(p.ansvarigTest).kort)}`,
        // Steget och vem som äger det står i remsan i foten, underlagets läge i kortet Underlag från sälj – chips bara för klart och returnerat
        chips: `${p.steg === 'klar' ? `<span class="chip chip-ok">${emo(UPEMO.proj.klar)}Klar</span>` : ''}${p.steg === 'underlag' && p.underlagStatus === 'returnerat' ? underlagChip(p) : ''}${klubbChip(k)}`,
        // Bokad testdag som inte har varit: kalenderfilen (testdag-ics) – adressen, kontakten på plats och beställningen följer med
        knappar: `<a class="knapp knapp-kontur" href="#/kund/${e(k.id)}">${ik('kunder')}Kundkortet</a>${p.testdatum && nTest >= 0 && p.steg !== 'klar' ? `<button class="knapp knapp-kontur" type="button" data-g="testdag-ics" data-projekt="${e(p.id)}" title="Testdagen som kalenderfil (Outlook, Google, Apple)">${ik('kalender')}<span class="bara-bred">Lägg i kalendern</span><span class="af-bara-smal">Kalender</span></button>` : ''}${bekr ? `<a class="knapp knapp-kontur" href="${e(bekraftelseMejl(p, a, bekr))}" data-g="bekrafta-testdag" data-projekt="${e(p.id)}" title="${e(`E-post till ${bekr.namn} med datum, tid, adress och lokal`)}">${ik('mejl')}<span class="bara-bred">E-posta bekräftelse</span><span class="af-bara-smal">Bekräfta</span></a>` : ''}`,
        fot: stegare(PROJSTEG.filter((x) => x.id !== 'klar'), p.steg, { emoji: UPEMO.proj }),
      })}
      <div class="rutnat-2 af-rum pj-rum" data-af-rum data-pj-rum data-steg="${e(p.steg)}">
        <div class="af-huvud" data-af-huvud>${PJ_HUVUD.map((n) => kort[n]).join('')}</div>
        <div class="af-sida" data-af-sida>${PJ_SIDA.map((n) => kort[n]).join('')}</div>
        <div class="af-bred" data-af-bred></div>
      </div>`;
  }

  /* 09-vyer: Klubbmotorn ----------------------------------------------------------- */
  // Under 3D-hjälten (scen-klubb.js): remsan med modellens sex steg och – i samma mörka kort – provisionen som EN glasremsa
  // (tillbaka till klubbarna, att betala, upplupet, prognos – samma mynt som hjältens teckenförklaring). Sedan en ljus yta med
  // provisionerna (en rad per affär: status, belopp, "Markera utbetald") och antagandena mot utfallet, sist klubbarna i ett mörkt
  // band (tratten partners → introducerade → i dialog → avtal, klubbens tal och nästa steg). Inget tal upprepas mellan delarna.
  // Stil: sidor.css avsnitt 10 (prefix kb-). scen-klubb.js hittar klubbkorten via .klubbkort a[href="#/kund/<id>"].
  function visaKlubbmotorn() {
    const arTestKb = anv(jag).roll === 'test'; // testteamet ser provisionerna men betalar inte ut (sälj gör det)
    const kl = klubbar().filter((k) => k.klubbavtal);
    const stat = kl.map((k) => ({ k, s: klubbStat(k) }));
    const tot = (f) => sum(stat.map((x) => x.s[f]));
    const partners = tot('partners'); const vunna = tot('vunna'); const varde = tot('varde'); const intro = tot('introducerade');
    const vunnaAffarer = stat.flatMap((x) => x.s.vunnaAffarer);
    const snitt = vunnaAffarer.length ? varde / vunnaAffarer.length : 0;
    const konv = partners ? vunna / partners : 0;
    const introKonv = intro ? vunna / intro : 0;
    const engang = tot('engang'); const ater = tot('aterkommande'); const intakt = engang + ater;
    const ORDNING = ['att-betala', 'upplupen', 'utbetald'];
    const allaKb = db.affarer.map((a) => ({ a, kb: kickback(a) })).filter((x) => x.kb);
    // Remsans summor räknas ur de avrundade radbeloppen, så att de stämmer på kronan med provisionslistan under
    const summaKb = (s) => sum(allaKb.filter((x) => x.kb.status === s).map((x) => Math.round(x.kb.belopp)));
    const utbetalt = summaKb('utbetald'); const attBetala = summaKb('att-betala'); const upplupen = summaKb('upplupen'); const prognos = summaKb('prognos');
    const tillbaka = utbetalt + attBetala + upplupen;
    const alla = allaKb.filter((x) => x.kb.status !== 'prognos').sort((x, y) => ORDNING.indexOf(x.kb.status) - ORDNING.indexOf(y.kb.status));
    const antalStatus = (s) => allaKb.filter((x) => x.kb.status === s).length;
    const prov = `${Math.round(KLUBBMOTORN.provision * 100)} %`;
    const antKonv = pct(KLUBBMOTORN.antagenKonvertering);
    const loopSteg = [['Elitklubb', 'startpunkten'], ['Data & förtroende', 'bevisar konceptet'], ['Partnernätverk', 'öppnar dörrar'], ['Företagsavtal', `~${antKonv} konverterar (antagande)`], ['Intäkt tillbaka', `${prov} provision`, true], ['Fler klubbar', 'fler vill vara med']];
    const mynt = (s) => `<span class="kb-mynt-ruta" aria-hidden="true"><i class="kb-mynt" data-mynt="${e(s)}"></i></span>`;
    // Totalen = utbetalt + att betala + upplupet: tre mynt i samma ordning som stapeln under beloppet
    const myntTre = `<span class="kb-mynt-ruta kb-mynt-tre" aria-hidden="true">${['utbetald', 'att-betala', 'upplupen'].map((s) => `<i class="kb-mynt" data-mynt="${s}"></i>`).join('')}</span>`;

    // 1. Pengarna: EN glasremsa (översiktens .nyckelremsa) i hjältekortets nederkant. Stapeln under totalen delar den i
    //    utbetalt, att betala och upplupet med myntens färger.
    const segment = tillbaka ? `<span class="kb-segment" aria-hidden="true">${[['utbetald', utbetalt], ['att-betala', attBetala], ['upplupen', upplupen]].filter(([, n]) => n > 0)
      .map(([s, n], i) => `<i data-mynt="${s}" style="flex:${(n / tillbaka).toFixed(4)} 1 0;--i:${i}"></i>`).join('')}</span>` : '';
    const post = ({ ikon, etikett, varde: v, under, ton = '', extra = '' }) => `<div class="nr-post${ton ? ` nr-${ton}` : ''}"><span class="nr-etikett">${ikon}<span>${e(etikett)}</span></span>`
      + `<strong class="nr-varde" data-tal="${e(v)}" data-format="kr">${kr(v)}</strong><span class="nr-under">${under}</span>${extra}</div>`;
    const nBetala = antalStatus('att-betala'); const nPrognos = antalStatus('prognos');
    const remsa = `<div class="nyckelremsa kb-remsa" data-antal="4" role="group" aria-label="Provisionen till klubbarna">
          ${post({ ikon: myntTre, etikett: 'Tillbaka till klubbarna', varde: tillbaka, under: `<i class="kb-mynt kb-mynt-mini" data-mynt="utbetald" aria-hidden="true"></i>${kr(utbetalt)} utbetalt hittills`, extra: segment })}
          ${post({ ikon: mynt('att-betala'), etikett: 'Att betala nu', varde: attBetala, ton: attBetala ? 'orange' : '', under: nBetala ? `${plural(nBetala, 'provision', 'provisioner')} väntar på utbetalning` : 'Inget att betala just nu' })}
          ${post({ ikon: mynt('upplupen'), etikett: 'Upplupet', varde: upplupen, under: 'Blir att betala när slutfakturan är skickad' })}
          ${post({ ikon: mynt('prognos'), etikett: 'I prognos', varde: prognos, under: nPrognos ? `Om ${plural(nPrognos, 'öppen affär', 'öppna affärer')} via klubb vinns` : 'Inga öppna affärer via klubb' })}
        </div>`;

    // 2a. Provisionerna: en rad per affär – status överst (utbetald med datum), affären, klubben och underlaget, beloppet och åtgärden
    const STATUSNAMN = { 'att-betala': 'Att betala', upplupen: 'Upplupen', utbetald: 'Utbetald' };
    const provRad = ({ a, kb }) => {
      const k = kund(a.kundId); const s = kb.status;
      const status = s === 'utbetald' && a.kickbackUtbetald ? `Utbetald ${datumText(a.kickbackUtbetald, { ar: true, gemen: true })}` : STATUSNAMN[s];
      return `<li class="kb-prov" data-status="${e(s)}" data-klubb="${e(kb.klubb.id)}" data-affar="${e(a.id)}">${mynt(s)}
            <div class="kb-prov-text"><span class="kb-prov-status">${e(status)}</span><a href="#/affar/${e(a.id)}">${e(k.namn)}</a><small class="kb-delar"><span><span>Via ${e(kb.klubb.namn)}</span><span>${e(kb.klubb.klubbavtal.procent)}&nbsp;% av&nbsp;${kr(affarVarde(a)).replace(/ /g, ' ')}</span></span></small>
              <span class="kb-prov-spar" data-status="${e(s)}" aria-hidden="true">${['upplupen', 'att-betala', 'utbetald'].map((x, i, l) => `<i${i <= l.indexOf(s) ? ' data-pa' : ''}${x === s ? ' data-nu' : ''}></i>`).join('')}</span></div>
            <div class="kb-prov-hoger"><strong>${kr(kb.belopp)}</strong>${s === 'att-betala' && arTestKb ? '<small class="kb-prov-salj">Sälj betalar ut</small>' : ''}${s === 'att-betala' && !arTestKb ? `<button class="knapp knapp-accent knapp-liten" type="button" data-g="kb-betald" data-affar="${e(a.id)}">${ik('bock')}Markera utbetald</button>` : ''}</div></li>`;
    };
    const provisioner = `<section class="kort kb-kort kb-prov-kort" aria-labelledby="kb-h-prov">
          <div class="kb-kort-huvud"><div><p class="kb-ogon">Per affär</p><h2 id="kb-h-prov">Provisioner</h2></div>${alla.length ? `<span class="kb-antal">${plural(alla.length, 'affär', 'affärer')}</span>` : ''}</div>
          ${alla.length ? `<ul class="kb-prov-lista">${alla.map(provRad).join('')}</ul>` : tom('Inga provisioner ännu. De dyker upp här när ett företag som en klubb introducerat signerar en order.', { emo: UPEMO.sak.provision, ton: 'orange', knapp: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="snabb" data-flik="kund">${ik('plus')}Ny kund via klubb</button>` })}
        </section>`;

    // 2b. Antagandena mot utfallet: utfallet (fylld prick) och antagandet (ring) på samma skala och kvoten i klartext
    const jamfor = ({ etikett, utfall, ant, visa, visaAnt, not }) => {
      const max = Math.max(utfall, ant) * 1.25 || 1;
      const x = (v) => Math.min(96, Math.max(4, (v / max) * 100));
      const kvot = ant ? utfall / ant : NaN;
      const [ton, dom] = !utfall ? ['', 'Inget utfall ännu'] : !isFinite(kvot) ? ['', ''] : kvot >= 1.05 ? ['ok', `${kvot.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} × antagandet`]
        : kvot <= 0.95 ? ['gul', `${pct(kvot)} av antagandet`] : ['ok', 'I nivå med antagandet'];
      const xa = x(ant); const xu = x(utfall);
      return `<div class="kb-jmf"><p class="kb-jmf-etikett">${e(etikett)}</p>
            <div class="kb-jmf-tal"><span class="kb-jmf-utfall"><small><i class="kb-prick" aria-hidden="true"></i>Utfall</small><strong>${e(visa)}</strong></span><span class="kb-jmf-ant"><small><i class="kb-ring" aria-hidden="true"></i>Antagande</small><strong>${e(visaAnt)}</strong></span></div>
            <div class="kb-skala" aria-hidden="true">${utfall ? `<span class="kb-skala-spann" style="left:${Math.min(xa, xu).toFixed(1)}%;width:${Math.abs(xa - xu).toFixed(1)}%"></span>` : ''}<i class="kb-ring" style="left:${xa.toFixed(1)}%"></i>${utfall ? `<i class="kb-prick" style="left:${xu.toFixed(1)}%"></i>` : ''}</div>
            <p class="kb-jmf-fot"><span>${e(not)}</span>${dom ? `<span class="chip${ton ? ` chip-${ton}` : ''}">${e(dom)}</span>` : ''}</p></div>`;
    };
    const modell = `<section class="kort kb-kort kb-modell" aria-labelledby="kb-h-modell">
          <div class="kb-kort-huvud"><div><p class="kb-ogon">Modellen</p><h2 id="kb-h-modell">Antaganden mot utfall</h2></div><span class="chip chip-gul">Räkneexempel, ej bekräftat</span></div>
          <div class="kb-jmf-rad">
            ${jamfor({ etikett: 'Partners som fått avtal', utfall: konv, ant: KLUBBMOTORN.antagenKonvertering, visa: pct(konv), visaAnt: antKonv, not: `${plural(vunna, 'avtal', 'avtal')} av ${plural(partners, 'partner', 'partners')}` })}
            ${jamfor({ etikett: 'Snittaffär per företag', utfall: snitt, ant: KLUBBMOTORN.antagenSnittaffar, visa: kr(snitt), visaAnt: kr(KLUBBMOTORN.antagenSnittaffar), not: vunnaAffarer.length ? `${plural(vunnaAffarer.length, 'vunnen affär', 'vunna affärer')} via klubb` : 'Inga vunna affärer ännu' })}
          </div>
          <div class="kb-fakta">
            <div class="kb-fakta-post"><span class="kb-fakta-etikett">Introducerade som fått avtal</span><strong>${pct(introKonv)}</strong><small>${intro ? `${vunna} av ${intro} introducerade företag` : 'Inga partners introducerade ännu'}</small></div>
            <div class="kb-fakta-post"><span class="kb-fakta-etikett">Intäkt i vunna affärer</span><strong>${intakt ? `${pct(engang / intakt)} / ${pct(ater / intakt)}` : 'Inga vunna affärer ännu'}</strong>
              <div class="kb-fakta-under">${intakt ? `<span class="kb-mix" aria-hidden="true">${engang ? `<i data-mix="engang" style="flex:${(engang / intakt).toFixed(4)} 1 0"></i>` : ''}${ater ? `<i data-mix="ater" style="flex:${(ater / intakt).toFixed(4)} 1 0"></i>` : ''}</span>` : ''}
              <small class="kb-mix-legend"><span><i data-mix="engang" aria-hidden="true"></i>Tester (engångsintäkt)</span><span><i data-mix="ater" aria-hidden="true"></i>App och Team Insights (återkommande)</span></small></div></div>
          </div>
          <p class="kb-fotnot">${ik('info')}<span>Antagandena kommer från Uperformances underlag för Klubbmotorn. Utfallet räknas ur registrerade affärer.</span></p>
        </section>`;

    // 3. Klubbarna: tratten som fyra steg i rad över ett band vars höjd följer antalet (roten ur, så att små tal syns) –
    //    blått nätverk som smalnar av mot orange avtal
    const trattBana = (h) => {
      const B = 400; const m = 28; const n = h.length; const xs = h.map((_, i) => ((i + 0.5) * B) / n);
      const y = (i, ned) => (m + (ned ? 1 : -1) * h[i] * (m - 1)).toFixed(1);
      let kant = `M0,${y(0)} L${xs[0].toFixed(1)},${y(0)}`;
      for (let i = 1; i < n; i++) { const cx = ((xs[i - 1] + xs[i]) / 2).toFixed(1); kant += ` C${cx},${y(i - 1)} ${cx},${y(i)} ${xs[i].toFixed(1)},${y(i)}`; }
      kant += ` L${B},${y(n - 1)}`;
      let d = `${kant} L${B},${y(n - 1, true)} L${xs[n - 1].toFixed(1)},${y(n - 1, true)}`;
      for (let i = n - 1; i > 0; i--) { const cx = ((xs[i - 1] + xs[i]) / 2).toFixed(1); d += ` C${cx},${y(i, true)} ${cx},${y(i - 1, true)} ${xs[i - 1].toFixed(1)},${y(i - 1, true)}`; }
      return { fyll: `${d} L0,${y(0, true)} Z`, kant }; // kant = ovankanten (ljuslinjen)
    };
    const klubbkort = ({ k, s }, ix) => {
      const steg = [[s.partners, s.partners === 1 ? 'partner' : 'partners'], [s.introducerade, s.introducerade === 1 ? 'intro&shy;ducerad' : 'intro&shy;ducerade'], [s.dialog, 'i dialog'], [s.vunna, 'avtal']];
      const max = Math.max(1, ...steg.map(([n]) => n));
      const bana = trattBana(steg.map(([n]) => (n ? Math.max(0.2, Math.sqrt(n / max)) : 0.05)));
      const nastaKlubb = !s.introducerade ? 'Introducera första partnern – lägg in företaget som kund via klubben.' : s.attBetala ? (arTestKb ? 'Provision väntar på utbetalning – sälj betalar ut.' : 'Betala ut provisionen och markera den som utbetald.') : !s.dialog ? 'Ingen i dialog – boka möte med en introducerad partner.' : s.dialog > s.vunna ? `${plural(s.dialog - s.vunna, 'partner', 'partners')} i dialog – följ upp affärerna.` : 'Alla i dialog har avtal – be klubben om fler kontakter.';
      const utanAffarer = !s.introducerade;
      // andelarna med hårt mellanslag ("8 %" bryts aldrig); nätverket och de introducerade i samma mening – utan avtal: en kort rad
      const andel = (n, av) => pct(av ? n / av : 0).replace(' ', ' ');
      const provKlubb = s.utbetalt + s.attBetala + s.upplupen;
      return `<section class="kort klubbkort kb-klubb" aria-label="${e(k.namn)}"><div class="kb-klubb-inre">
          <div class="kb-klubb-topp">${loggaRuta(k)}<div class="kb-klubb-namn"><a href="#/kund/${e(k.id)}">${e(k.namn)}</a><small class="kb-delar"><span><span>Avtal sedan ${e(datumText(k.klubbavtal.sedan, { ar: true, gemen: true }))}</span><span>Utbetalning: ${e((UTBETALNING[k.klubbavtal.form] || '').toLowerCase())}</span></span></small></div><span class="chip chip-klubb">${e(k.klubbavtal.procent)}&nbsp;%</span></div>
          <div class="kb-tratt" role="img" aria-label="${e(`${s.partners} partners i nätverket, ${s.introducerade} introducerade, ${s.dialog} i dialog, ${s.vunna} med avtal${s.vunna ? ` – ${andel(s.vunna, s.partners)} av nätverket och ${andel(s.vunna, s.introducerade)} av de introducerade` : ''}`)}">
            <ol class="kb-tratt-steg" aria-hidden="true">${steg.map(([n, t], i) => `<li${i === 3 && n ? ' data-mal' : ''}><b>${e(n)}</b><span>${t}</span></li>`).join('')}</ol>
            <svg class="kb-tratt-band" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="kb-tf-${ix}" gradientUnits="userSpaceOnUse" x1="0" x2="400" y1="0" y2="0"><stop offset="0" stop-color="#a7d2ff" stop-opacity=".04"/><stop offset=".16" stop-color="#a7d2ff" stop-opacity=".26"/><stop offset=".58" stop-color="#ffb066" stop-opacity=".42"/><stop offset="1" stop-color="#ff9a3d" stop-opacity=".95"/></linearGradient><linearGradient id="kb-tk-${ix}" gradientUnits="userSpaceOnUse" x1="0" x2="400" y1="0" y2="0"><stop offset="0" stop-color="#cfe4ff" stop-opacity="0"/><stop offset=".2" stop-color="#cfe4ff" stop-opacity=".55"/><stop offset="1" stop-color="#ffd2a3" stop-opacity=".95"/></linearGradient></defs><path d="${bana.fyll}" fill="url(#kb-tf-${ix})"/><path d="${bana.kant}" fill="none" stroke="url(#kb-tk-${ix})" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>
            <p class="kb-tratt-not">${s.vunna ? `<strong>${andel(s.vunna, s.partners)}</strong> av nätverket och <strong>${andel(s.vunna, s.introducerade)}</strong> av de introducerade har avtal` : s.introducerade ? 'Inga avtal ännu' : 'Inga partners introducerade ännu'}</p>
          </div>
          ${s.varde || provKlubb ? `<div class="kb-klubb-tal"><div><span>Affärs&shy;värde</span><strong>${krKort(s.varde)}</strong></div><div><span>Provision</span><strong>${krKort(provKlubb)}</strong></div><div${s.attBetala ? ' data-varm' : ''}><span>Att betala</span><strong>${krKort(s.attBetala)}</strong></div></div>`
            : `<p class="kb-klubb-tal-tom"><i class="kb-mynt" data-mynt="prognos" aria-hidden="true"></i><span>Affärsvärdet och provisionen börjar räknas vid första ordern via klubben.</span></p>`}
          ${s.attBetala ? `<button class="kb-nasta" type="button" data-g="kb-visa-betala" data-klubb="${e(k.id)}" title="Visa provisionen i listan">${ik('pil')}<span><b>Nästa steg</b>${e(nastaKlubb)}</span><span class="kb-nasta-mer" aria-hidden="true">Visa</span></button>`
            : `<p class="kb-nasta">${ik('pil')}<span><b>Nästa steg</b>${e(nastaKlubb)}</span></p>`}
          <div class="kb-klubb-knappar"><button class="knapp ${utanAffarer ? 'knapp-accent' : 'knapp-kontur'} knapp-liten" type="button" data-g="snabb" data-flik="kund" data-via="${e(k.id)}">${ik('plus')}Lägg till partner</button><a class="knapp knapp-spok knapp-liten" href="#/kund/${e(k.id)}">Öppna klubb</a>${s.attBetala && !arTestKb ? `<button class="knapp knapp-spok knapp-liten" type="button" data-g="kb-underlag" data-klubb="${e(k.id)}" title="Provisionerna som ska betalas ut – för klubbens kassör">${ik('ladda-ner')}Utbetalningsunderlag</button>` : ''}</div>
        </div></section>`;
    };
    const band = stat.length ? `<section class="kb-band" aria-labelledby="kb-h-klubbar">
        <div class="kb-huvud"><div class="kb-huvud-text"><p class="kb-ogon">Per klubb</p><h2 id="kb-h-klubbar">Klubbarna och <em>deras nätverk</em></h2>
          <p class="kb-ingress">Tratten, provisionen och nästa steg – klubb för klubb.</p></div>
          <button class="knapp knapp-accent" type="button" data-g="snabb" data-flik="kund" data-typ="klubb">${ik('plus')}Registrera klubb</button></div>
        <div class="kb-klubbar">${stat.map(klubbkort).join('')}</div>
      </section>`
      : `<div class="kort kb-tom">${tom('Inga klubbar med avtal ännu. Registrera en klubb och ange procent och utbetalningsform på klubbsidan.', { emo: UPEMO.sak.klubb, ton: 'orange', knapp: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="snabb" data-flik="kund" data-typ="klubb">${ik('plus')}Registrera klubb</button>` })}</div>`;

    return `<section class="kort kort-mork loop" style="margin-bottom:16px" data-rorelse>
        <div><span class="etikett-liten" style="color:var(--text-ljus)">Tillväxtmodell</span><h1 style="margin-top:10px">Klubbmotorn</h1>
          <p>Klubben introducerar företag ur sitt partnernätverk – här följer vi varje relation från introduktion till avtal och provision.</p></div>
        <div class="bana" role="img" aria-label="Loopen: ${e(loopSteg.map(([n]) => n.toLowerCase()).join(', '))}">
          <div class="bana-kamera"><div class="bana-ring"></div><div class="bana-karna"><svg aria-hidden="true"><use href="#u-mark"/></svg></div>
            <div class="bana-snurr">${loopSteg.map(([n, t, p], i) => `<div class="bana-nod ${p ? 'pengar' : ''}" style="--i:${i}">${e(n)}<small>${e(t)}</small></div>`).join('')}</div></div></div>
        <ol class="bana-lista" aria-label="Klubbmotorn steg för steg">${loopSteg.map(([n, t, p]) => `<li ${p ? 'class="pengar"' : ''}><strong>${e(n)}</strong><small>${e(t)}</small></li>`).join('')}</ol>
        ${remsa}
      </section>
      <div class="kb-yta">${provisioner}${modell}</div>
      ${band}`;
  }


  /* 10-vyer: att göra (ägare T) -------------------------------------------------- */
  // "Din dag": hjälten med dagens ring, Först på tur (Klar/Ring/Skjut) och veckan som klickbar glasrad → snabbraden i sömmen →
  // listan, där det som står först på tur inte visas en gång till. Stil i sidor.css avsnitt 11 (prefix td-).
  // dag: vald dag i veckoremsan (ISO) – listan visar bara den dagen och snabbraden föreslår datumet. null = hela listan.
  const todoUi = { vem: 'mina', klara: false, dag: null, forstId: null, allaForslag: false, utkast: '' };
  // Läget styr kryssrutans kant, prickarna och ringens bågar: rod = förfallen, gul = idag, is = kommande
  const tdLage = (t) => (t.klar ? 'klar' : !t.datum ? 'utan' : dagarTill(t.datum) < 0 ? 'rod' : dagarTill(t.datum) === 0 ? 'gul' : 'is');
  // Typen när texten säger något ("Ring …" → telefonen). Vanliga uppgifter får den neutrala textsymbolen (TODO_NEUTRAL, samma som
  // översiktens Din lista) – aldrig bocken, som bredvid kryssrutan såg ut som en ikryssad ruta.
  const tdTyp = (text) => { const [re, em, namn] = todoTyp(text); return re ? { em, namn } : null; };
  // Snabbradens datum i klartext: Idag, Imorgon, Igår – annars "tis 20 okt" (med år om det är ett annat år)
  const tdDatumEtikett = (iso) => {
    if (!iso || !tolka(iso) || isNaN(tolka(iso))) return 'Utan datum';
    const n = dagarTill(iso); if (n >= -1 && n <= 1) return datumText(iso);
    const ar = tolka(iso).getFullYear(); return dagText(iso) + (ar !== new Date().getFullYear() ? ` ${ar}` : '');
  };
  // Kundens telefon – testteamet ringer inte kunder härifrån (samma regel som översikten)
  const tdTel = (k) => {
    if (!k || anv(jag).roll === 'test') return null;
    const pk = primarKontakt(k);
    return pk && pk.tel ? { namn: String(pk.namn || '').trim(), tel: String(pk.tel), nr: String(pk.tel).replace(/[^\d+]/g, '') } : null;
  };
  const tdTelLank = (tel, klass, inre) => `<a class="${klass}" href="tel:${e(tel.nr)}" aria-label="Ring ${e(tel.namn)}, ${e(tel.tel)}" title="Ring ${e(tel.namn)} · ${e(tel.tel)}">${inre}</a>`;
  const tdSkjut = (t) => `<button class="knapp knapp-spok knapp-liten todo-skjut td-skjut" type="button" data-g="todo-skjut" data-id="${e(t.id)}" title="Skjut till imorgon – ändrar bara datumet" aria-label="Skjut till imorgon: ${e(t.text)}">${ik('pil')}<span class="td-skjut-lang">Skjut till imorgon</span></button>`;
  // En rad: kryssruta · typ · text · kund · tid · (ansvarig i Alla) · åtgärd. På bred yta delar raderna ett rutnät (subgrid) så att kund och
  // tid står i raka kolumner (td-meta är då display: contents); i smal bredd blir td-meta en rad under texten med åtgärden längst ut.
  const tdRad = (t, visaVem) => {
    const k = t.kundId ? kund(t.kundId) : null; const typ = tdTyp(t.text); const lage = tdLage(t);
    const tel = typ && typ.namn === 'Samtal' && !t.klar ? tdTel(k) : null;
    return `<li class="todo td-rad" data-todo="${e(t.id)}" data-lage="${lage}"${t.klar ? ' data-klar' : ''}>`
      + `<button class="todo-bock" type="button" data-g="todo-klar" data-id="${e(t.id)}" aria-label="${t.klar ? 'Markera som ej klar' : 'Markera som klar'}: ${e(t.text)}">${ik('bock')}</button>`
      + `<span class="td-typ"${typ ? ` title="${e(typ.namn)}"` : ' data-neutral title="Uppgift"'}>${typ ? emo(typ.em) : TODO_NEUTRAL}</span>`
      + `<span class="td-text">${e(t.text)}</span>`
      + `<span class="td-meta"><span class="td-kund">${k ? `<a class="chip td-kundchip" href="#/kund/${e(k.id)}"><span>${e(k.namn)}</span></a>` : ''}</span>`
      + `<span class="td-tid">${t.klar ? '<span class="chip chip-ok">Klar</span>' : tidsBricka(t.datum)}</span>${visaVem ? `<span class="td-vem">${avatar(t.ansvarig, true)}</span>` : ''}`
      + `<span class="td-atgard">${tel ? tdTelLank(tel, 'td-tel', ik('samtal')) : ''}${lage === 'rod' || lage === 'gul' ? tdSkjut(t) : ''}</span></span></li>`;
  };
  // Grupperna i listan (dagar från idag). Prickens färg = samma läge som i ringen och veckan.
  const TD_GRUPPER = [
    ['forfallna', 'Förfallna', (d) => d < 0, 'Gör dem först – eller skjut dem till imorgon'],
    ['idag', 'Idag', (d) => d === 0, ''],
    ['kommande', 'Kommande', (d) => d > 0 && d < 7, 'Inom en vecka'],
    ['senare', 'Senare', (d) => d >= 7, 'Om en vecka eller mer'],
    ['utan', 'Utan datum', null, 'Ge dem ett datum när det passar'],
  ];
  const tdGrupp = (id, namn, rader, visaVem, hjalp = '') => `<section class="td-grupp" data-grupp="${e(id)}"${namn ? ` aria-labelledby="td-g-${e(id)}"` : ''}>`
    + (namn ? `<h3 class="td-grupp-namn" id="td-g-${e(id)}"><i class="td-prick" aria-hidden="true"></i><span>${e(namn)}</span><span class="sr">, </span><span class="rakna">${rader.length}</span>${hjalp ? `<small>${e(hjalp)}</small>` : ''}</h3>` : '')
    + `<ul class="td-rader">${rader.map((t) => tdRad(t, visaVem)).join('')}</ul></section>`;
  // Dagens ring: en båge per uppgift idag – klara (mint), förfallna (röd), kvar idag (gul). Visar läget redan innan något är klart.
  // Klassen framsteg behövs: konfettin när dagens sista uppgift bockas av utgår från ringen (G['todo-klar']).
  const tdDagring = (klara, forf, kvar) => {
    const tot = klara + forf + kvar;
    const bitar = tot <= 24 ? [...Array(klara).fill('klar'), ...Array(forf).fill('rod'), ...Array(kvar).fill('gul')].map((l) => [l, 1])
      : [['klar', klara], ['rod', forf], ['gul', kvar]].filter(([, x]) => x);
    const glipa = bitar.length > 1 ? 2.6 : 0; let pos = 0;
    const bagar = bitar.map(([l, x], i) => {
      const len = (x / tot) * 100;
      const b = `<circle class="td-seg" data-lage="${l}" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="${Math.max(.6, len - glipa).toFixed(2)} 100" stroke-dashoffset="${(-(pos + glipa / 2)).toFixed(2)}" style="--i:${i}"/>`;
      pos += len; return b;
    }).join('');
    // Mitten: alltid hur många som är kvar idag (bågarna visar hur långt dagen kommit – mint = klara). Bock bara när allt är
    // avbockat; en dag utan något planerat får en neutral kalender (ingen bock – inget är ju gjort). Rubriken bredvid säger vad det är.
    const mitt = !tot ? `<span class="td-dagring-fri">${ik('kalender')}</span>`
      : klara === tot ? `<span class="td-dagring-bock">${ik('bock')}</span>`
        : `<span class="td-dagring-tal"><b>${forf + kvar}</b><small class="td-dagring-not">kvar</small></span>`;
    return `<span class="framsteg td-dagring"${!tot ? ' data-fri' : klara === tot ? ' data-klar' : ''} aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="td-spar" cx="32" cy="32" r="27"/>${bagar}</svg>${mitt}</span>`;
  };
  // Kortets namn: "Först på tur" när uppgiften ska göras nu (förfallen eller idag), annars "Nästa" (framåt eller utan datum).
  // Samma ord i listans hjälptext och ingressen, och bara "Först på tur" har Skjut.
  const tdForstNu = (t) => !!t && !!t.datum && dagarTill(t.datum) <= 0;
  const tdForstEtikett = (t) => (tdForstNu(t) ? 'Först på tur' : 'Nästa');
  // Först på tur: hjältens handlingskort – samma knappar och beteende som raderna (todo-klar, tel:, todo-skjut)
  const tdForst = (t, { mina, ny, teamet = 0, harKlara = false }) => {
    if (!t) {
      // Tomt: lägg till – och i Mina en genväg till teamets uppgifter när det finns sådana. "Allt avbockat" bara när något faktiskt bockats av.
      return `<article class="td-forst" data-lage="klar" data-tom><p class="td-forst-ogon"><span>${harKlara ? 'Allt avbockat' : 'Tom lista'}</span></p>
        <div class="td-forst-rad">${emo(UPEMO.sak.tomt, { ruta: 'l' })}<div class="td-forst-text"><strong>${harKlara ? 'Inget kvar på listan' : 'Inga uppgifter ännu'}</strong><small>Lägg till nästa sak när den dyker upp.</small></div></div>
        <div class="td-forst-knappar"><button class="knapp knapp-accent" type="button" data-g="fokus-ny-todo">${ik('plus')}Lägg till en uppgift</button>${mina && teamet ? `<button class="knapp knapp-kontur" type="button" data-g="todo-vem" data-vem="alla">Visa teamets (${teamet})${ik('pil')}</button>` : ''}</div></article>`;
    }
    const k = t.kundId ? kund(t.kundId) : null; const typ = tdTyp(t.text); const lage = tdLage(t); const tel = tdTel(k);
    const n = t.datum ? dagarTill(t.datum) : null;
    const etikett = tdForstEtikett(t);
    const tid = n == null ? 'utan datum' : n < 0 ? `förfallen ${plural(-n, 'dag', 'dagar')}` : n === 0 ? 'idag' : n === 1 ? 'imorgon' : dagText(t.datum);
    const vem = !mina ? `<span class="td-forst-vem">${avatar(t.ansvarig, true)}${e(anv(t.ansvarig).kort)}</span>` : '';
    // Det senaste som hänt med kunden – underlaget inför samtalet eller mejlet, utan att lämna sidan. Samtal, möten, mejl och
    // anteckningar går före systemhändelser (de visas bara när inget annat finns).
    const akt = k ? db.aktiviteter.filter((x) => x.kundId === k.id).sort((a, b) => (a.tid < b.tid ? 1 : -1)) : [];
    const senast = akt.find((x) => x.typ !== 'system') || akt[0] || null;
    const senastHtml = senast ? `<p class="td-forst-senast">${emo(UPEMO.akt[senast.typ] || UPEMO.akt.system)}<span class="td-forst-senast-inre"><b>Senast · ${e(relTid(senast.tid))}</b><span class="td-forst-senast-text" title="${e(senast.text)}">${e(AKT_TYP[senast.typ] || 'Händelse')}: ${e(senast.text)}</span></span></p>` : '';
    // Utan telefon blir "Öppna kunden" kortets knapp – då står kundnamnet under rubriken som vanlig text (inte två länkar till samma ställe)
    const kundKnapp = !tel && !!k;
    const knappar = [
      `<button class="knapp knapp-accent" type="button" data-g="todo-klar" data-id="${e(t.id)}" aria-label="Markera som klar: ${e(t.text)}">${ik('bock')}Klar</button>`,
      tel ? tdTelLank(tel, 'knapp knapp-kontur', `${ik('samtal')}Ring ${e(tel.namn.split(/\s+/)[0])}`) : kundKnapp ? `<a class="knapp knapp-kontur" href="#/kund/${e(k.id)}">Öppna kunden${ik('pil')}</a>` : '',
      n != null && n <= 0 ? `<button class="knapp knapp-spok td-forst-skjut" type="button" data-g="todo-skjut" data-id="${e(t.id)}" title="Ändrar bara datumet">${ik('pil')}Skjut till imorgon</button>` : '',
    ].join('');
    // Kortet är så högt som sitt innehåll och centreras mot hjältens vänstra spalt – luften hamnar runt kortet, aldrig som ett hål i det
    return `<article class="td-forst" data-lage="${lage}"${ny ? ' data-ny' : ''} aria-labelledby="td-forst-text">
      <p class="td-forst-ogon"><span>${etikett}</span><i aria-hidden="true"></i><span class="td-forst-tid">${e(tid)}</span></p>
      <div class="td-forst-rad">${typ ? emo(typ.em, { ruta: 'l', titel: typ.namn }) : `<span class="emo-ruta emo-l td-forst-ikon" aria-hidden="true">${TODO_NEUTRAL}</span>`}
        <div class="td-forst-text"><strong id="td-forst-text">${e(t.text)}</strong>${k || vem ? `<span class="td-forst-under">${k ? (kundKnapp ? `<span class="td-forst-kund" data-text>${e(k.namn)}</span>` : `<a class="td-forst-kund" href="#/kund/${e(k.id)}">${e(k.namn)}</a>`) : ''}${vem}</span>` : ''}</div></div>
      ${senastHtml}<div class="td-forst-knappar">${knappar}</div></article>`;
  };
  // Veckan: sju dagar som knappar – antal, prickar per uppgift (röd = förfallen), testdagar och idag framhävd. Klick visar dagen i listan.
  // Idag-rutan visar bara prickarna (klara i mint, förfallna röda, idag gula) – antalet står redan i dagens läge ovanför.
  // När allt för idag är avbockat står det "Klart" (med bock) under dagen.
  const tdVecka = (dagar, vald) => `<nav class="td-vecka" aria-label="Veckan framåt – välj en dag för att se dess uppgifter">${dagar.map((d) => {
    const idagN = d.antal - d.forf; const klara = d.klara || 0; const klart = d.i === 0 && !d.antal && klara > 0;
    const lagen = [...Array(klara).fill('klar'), ...Array(d.forf).fill('rod'), ...Array(Math.max(0, idagN)).fill(d.i === 0 ? 'gul' : 'is')];
    const prickar = lagen.slice(0, 5);
    const fler = lagen.length - prickar.length;
    const test = d.tester.map((p) => kundNamn(p.kundId)).join(', ');
    // Antalet i ord bara när remsan är bred ("2 uppgifter") – i smal remsa räcker prickarna (CSS döljer texten).
    // En fri dag skriver ingen text (den dova siffran säger att den är fri) – "+ Planera" visas när man pekar på den
    // (klicket väljer dagen och sätter snabbraden på den). "Klart" (idag) och "Testdag" står kvar: de säger något nytt.
    const friText = klart ? `${ik('bock')}Klart` : d.tester.length ? 'Testdag' : '';
    const antalText = d.antal ? `<span class="td-antal-lang">${plural(d.antal, 'uppgift', 'uppgifter')}</span>`
      : `${friText ? `<span class="td-dag-fri">${friText}</span>` : ''}<span class="td-dag-planera" aria-hidden="true">${ik('plus')}Planera</span>`;
    const etikett = `${d.lang}: ${d.antal ? plural(d.antal, 'uppgift', 'uppgifter') : klart ? 'allt klart' : 'inga uppgifter'}${d.forf ? `, varav ${d.forf} ${d.forf === 1 ? 'förfallen' : 'förfallna'}` : ''}${d.i === 0 && klara && d.antal ? `, ${klara} ${klara === 1 ? 'klar' : 'klara'}` : ''}${test ? `, testdag ${test}` : ''}`;
    const text = d.i === 0 && d.antal ? '' : `<small class="td-dag-antal">${antalText}</small>${d.forf ? `<small class="td-dag-forf">${d.forf} ${d.forf === 1 ? 'förfallen' : 'förfallna'}</small>` : ''}`;
    return `<button type="button" class="td-dag" data-g="todo-dag" data-dag="${e(d.iso)}" aria-pressed="${vald === d.iso}" aria-label="${e(etikett)}" style="--i:${d.i}"${d.i === 0 ? ' data-idag' : ''}${d.antal ? '' : ' data-fri'}${klart ? ' data-klart' : ''}${d.forf ? ' data-forf' : ''}>`
      + `<span class="td-dag-namn"><span class="td-dag-lang">${e(d.namn)}</span><span class="td-dag-kort">${e(d.kort)}</span></span>`
      + `<strong class="td-dag-nr">${d.dag}</strong>`
      + `<span class="td-dag-prickar" aria-hidden="true">${prickar.map((l) => `<i data-lage="${l}"></i>`).join('')}${fler > 0 ? `<b>+${fler}</b>` : ''}${d.tester.length ? emo(UPEMO.proj.test, { titel: `Testdag: ${test}` }) : ''}</span>`
      + `${text}</button>`;
  }).join('')}</nav>`;

  // Föreslagna uppgifter: det CRM:et redan vet blir en uppgift med ett klick (kund, affär och datum idag ifyllda) – dokument att
  // hantera (samma lista som Dokument och menyns räknare), omtest/uppföljning efter testet och affärer som stått still i 14+ dagar.
  // Bara det som är ditt: andra säljares affärer och projekt med en annan testansvarig hoppas över. Ett förslag försvinner när
  // uppgiften finns (todo.forslag = nyckeln), när kunden redan har en öppen uppgift (omtest/still) eller efter "Inte nu" (sessionen).
  const forslagDolda = new Set();
  const gemen = (t) => (/^[A-ZÅÄÖ][a-zåäö]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  // Dokumentens rubriker (dokAtgarder) som uppgifter i samma ton som listan: "Ring Peter om offerten …", "Påminn om PUB-avtalet"
  const FORSLAG_TEXT = [
    [/^Inget svar på (offerten|ordern) (\S+)/, (m, fn) => (fn ? `Ring ${fn} om ${m[1]} ${m[2]}` : `Påminn om ${m[1]} ${m[2]}`)],
    [/^(Offert|Order) (\S+) har gått ut/, (m) => `Skapa en ny version av ${m[1] === 'Order' ? 'ordern' : 'offerten'} ${m[2]}`],
    [/^(Offert|Order) (\S+) är inte öppnad/, (m, fn) => `Påminn ${fn || 'kunden'} om ${m[1] === 'Order' ? 'ordern' : 'offerten'} ${m[2]}`],
    [/^Kundlänken är inte öppnad/, (m, fn) => `Påminn ${fn || 'kunden'} om kundlänken`],
    [/^(Offert|Order) (\S+) går ut/, (m, fn) => `Påminn ${fn || 'kunden'} om ${m[1] === 'Order' ? 'ordern' : 'offerten'} ${m[2]} innan den går ut`],
    [/^Kundlänken har gått ut/, () => 'Förläng kundlänken'],
    [/^Kundlänken går ut/, (m, fn) => `Påminn ${fn || 'kunden'} om kundunderlaget innan länken går ut`],
    [/^Nytt kundunderlag/, () => 'Använd det nya kundunderlaget i offerten'],
    [/^Testteamet returnerade underlaget/, () => 'Komplettera underlaget till testteamet'],
    [/^Nytt underlag att granska/, () => 'Granska underlaget'],
    [/^PUB-avtal saknas/, () => 'Ta fram PUB-avtalet till överlämningen'],
    [/^PUB-avtalet väntar på signatur/, () => 'Påminn om PUB-avtalet'],
    [/^Utbetalningsform saknas/, (m, fn) => `Bestäm utbetalningsform för provisionen${fn ? ` med ${fn}` : ''}`],
  ];
  const forslagText = (rubrik, fn) => { for (const [re, f] of FORSLAG_TEXT) { const m = rubrik.match(re); if (m) return f(m, fn); } return `Följ upp: ${gemen(rubrik)}`; };
  const tdForslag = () => {
    const ut = []; const arTestNu = anv(jag).roll === 'test';
    const oppnaT = db.todos.filter((t) => !t.klar);
    const finns = (nyckel) => oppnaT.some((t) => t.forslag === nyckel);
    const kundHar = (kundId) => oppnaT.some((t) => t.kundId === kundId);
    // Samma sak finns redan som uppgift för kunden: orden i förslaget och i uppgiften stämmer – dokumentnummer och
    // småord räknas inte, och ordens början räcker ("underlaget" = "underlag"). Annars föreslogs t.ex. "Påminn om PUB-avtalet" en gång till.
    const ord = (s) => new Set(String(s || '').toLowerCase().replace(/\bup-[\w-]+/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !['och', 'till', 'med', 'för', 'som'].includes(w)).map((w) => w.slice(0, 6)));
    const delAv = (a, b) => a.size >= 2 && [...a].every((w) => b.has(w));
    const liknande = (kundId, text) => { const f = ord(text); return oppnaT.some((t) => t.kundId === kundId && (() => { const u = ord(t.text); return delAv(f, u) || delAv(u, f); })()); };
    const fnamn = (k) => { const pk = primarKontakt(k); return pk ? pk.namn.split(' ')[0] : ''; };
    const poster = dokPoster(); const perId = new Map(poster.map((p) => [p.id, p]));
    dokAtgarder(poster).forEach((x) => {
      const p = perId.get(x.id);
      const a = p && p.affarId ? affar(p.affarId) : x.href && x.href.startsWith('#/affar/') ? affar(x.href.slice(8)) : null;
      const pr = p && p.projektId ? projekt(p.projektId) : null;
      if (!arTestNu && a && a.ansvarig && a.ansvarig !== jag) return;
      if (arTestNu && pr && pr.ansvarigTest && pr.ansvarigTest !== jag) return;
      const nyckel = `dok:${x.id || x.href}:${x.prio}${x.regel ? `:${x.regel}` : ''}`; const kundId = (p && p.kundId) || (a && a.kundId) || null;
      const uppgift = forslagText(x.rubrik, kundId ? fnamn(kund(kundId)) : '');
      if (liknande(kundId, uppgift)) return;
      ut.push({ nyckel, prio: x.prio, kundId, affarId: a ? a.id : null, ikon: x.ikon, ton: x.ton, uppgift, varfor: x.text });
    });
    if (!arTestNu) {
      db.affarer.filter((a) => arOppen(a) && a.ansvarig === jag && a.stegAndrad && -dagarTill(a.stegAndrad) >= 14).forEach((a) => {
        const k = kund(a.kundId); if (!k || kundHar(k.id)) return; const fn = fnamn(k); const n = -dagarTill(a.stegAndrad);
        const steg = (SALJSTEG.find((x) => x.id === a.steg) || {}).namn || a.steg;
        ut.push({ nyckel: `still:${a.id}:${a.steg}`, prio: 2.5, kundId: k.id, affarId: a.id, ikon: UPEMO.larm.still, ton: 'gul',
          uppgift: fn ? `Ring ${fn} om ${gemen(a.titel)}` : `Följ upp ${gemen(a.titel)}`, varfor: `${k.namn} · ingen rörelse på ${n} dagar i steg ${gemen(steg)}` });
      });
      db.kunder.forEach((k) => {
        const l = omtestLage(k.id); if (!l || !l.typ || l.oppen || kundHar(k.id)) return;
        const fore = affar(l.p.affarId); if (fore && fore.ansvarig && fore.ansvarig !== jag) return;
        const fn = fnamn(k) || k.namn; const omtest = l.typ === 'omtest';
        ut.push({ nyckel: `${l.typ}:${l.p.id}`, prio: 4, kundId: k.id, affarId: null, ikon: omtest ? UPEMO.larm.omtest : UPEMO.larm.uppfoljning, ton: 'is',
          uppgift: omtest ? `Boka omtest med ${fn}` : `Föreslå uppföljning & coaching till ${fn}`, varfor: `${k.namn} · testet hölls för ${plural(l.manader, 'månad', 'månader')} sedan` });
      });
    }
    return ut.filter((f) => !finns(f.nyckel) && !forslagDolda.has(f.nyckel)).sort((a, b) => a.prio - b.prio || a.uppgift.localeCompare(b.uppgift, 'sv'));
  };
  // Snabbraden i Att göra: kunden känns igen i texten – hela namnet ("Mälarhamnen Lager AB", med eller utan AB), första ordet när det
  // är unikt och minst sex tecken ("Mälarhamnen") eller en kontaktpersons för- och efternamn. Den längsta träffen vinner.
  const tdRen = (s) => ` ${String(s || '').toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, ' ').trim()} `;
  const kundIText = (text) => {
    const t = tdRen(text); const forsta = new Map();
    db.kunder.forEach((k) => { const f = tdRen(k.namn).trim().split(' ')[0]; forsta.set(f, (forsta.get(f) || 0) + 1); });
    let bast = null; let langd = 0;
    const prova = (k, namn) => { const n = tdRen(namn); if (n.trim().length >= 5 && n.length > langd && t.includes(n)) { bast = k; langd = n.length; } };
    db.kunder.forEach((k) => {
      prova(k, k.namn); prova(k, String(k.namn || '').replace(/\s(AB|HB|KB)$/, ''));
      const f = tdRen(k.namn).trim().split(' ')[0]; if (f.length >= 6 && forsta.get(f) === 1) prova(k, f);
      (k.kontakter || []).forEach((c) => { if (/\S\s+\S/.test(String(c.namn || '').trim())) prova(k, c.namn); });
    });
    return bast;
  };
  // Tre åt gången (de viktigaste först), resten bakom "Visa alla". En ensam rad ligger på en rad med knapparna till höger.
  const tdForslagHtml = (lista) => {
    if (!lista.length) return '';
    const visa = todoUi.allaForslag ? lista : lista.slice(0, 3);
    return `<section class="td-forslag" aria-labelledby="td-h-forslag">
        <header class="td-forslag-huvud"><h2 id="td-h-forslag">${ik('glodlampa')}Föreslagna uppgifter<span class="rakna">${lista.length}</span></h2>
          <small>Det CRM:et ser just nu – lägg till med ett klick, så fylls kund och datum i.</small>${lista.length > 3 ? `<button class="td-klara-knapp td-forslag-fler" type="button" data-g="todo-forslag-alla" aria-expanded="${!!todoUi.allaForslag}">${ik('chevron')}${todoUi.allaForslag ? 'Visa färre' : `Visa alla ${lista.length}`}</button>` : ''}</header>
        <ul class="td-forslag-lista">${visa.map((f) => `<li class="td-forslag-rad">${emo(f.ikon, { ruta: 's', ton: f.ton })}<span class="td-forslag-text"><strong>${e(f.uppgift)}</strong><small>${e(f.varfor)}</small></span>`
          + `<span class="td-forslag-knappar"><button class="knapp knapp-kontur knapp-liten" type="button" data-g="todo-forslag" data-nyckel="${e(f.nyckel)}">${ik('plus')}Lägg till<span class="sr">: ${e(f.uppgift)}</span></button>`
          + `<button class="td-forslag-dolj" type="button" data-g="todo-forslag-dolj" data-nyckel="${e(f.nyckel)}" title="Inte nu" aria-label="Inte nu: ${e(f.uppgift)}">${ik('stang')}</button></span></li>`).join('')}</ul>
      </section>`;
  };
  function visaTodos() {
    const mig = anv(jag); const mina = todoUi.vem === 'mina';
    const lista = db.todos.filter((t) => !mina || t.ansvarig === jag);
    const oppna = lista.filter((t) => !t.klar).sort((a, b) => String(a.datum || '9').localeCompare(String(b.datum || '9')));
    const forfallnaL = oppna.filter((t) => t.datum && dagarTill(t.datum) < 0);
    const idagL = oppna.filter((t) => t.datum && dagarTill(t.datum) === 0);
    const framat = oppna.filter((t) => t.datum && dagarTill(t.datum) > 0);
    const utanL = oppna.filter((t) => !t.datum);
    const allaKlara = lista.filter((t) => t.klar);
    const klara = [...allaKlara].sort((a, b) => String(b.klarTid || '').localeCompare(String(a.klarTid || ''))).slice(0, 15);
    const klaraIdag = allaKlara.filter((t) => t.klarTid && dagarTill(lokalISO(new Date(t.klarTid))) === 0).length;
    // "Idag" = förfallna + idag: samma tal som menyns räknare, ringen och veckans Idag-knapp
    const forfN = forfallnaL.length; const idagN = idagL.length; const totIdag = klaraIdag + forfN + idagN;
    const [halsning, dygnEmo] = halsningNu();
    const dagar = Array.from({ length: 7 }, (_, i) => {
      const iso = omDagar(i); const d = tolka(iso);
      const vd = d.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '');
      const forf = i === 0 ? forfN : 0;
      return { i, iso, namn: i === 0 ? 'Idag' : i === 1 ? 'Imorgon' : vd, kort: i === 0 ? 'Idag' : vd, dag: d.getDate(), lang: d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }),
        antal: oppna.filter((x) => x.datum === iso).length + forf, forf, klara: i === 0 ? klaraIdag : 0, tester: db.projekt.filter((p) => p.testdatum === iso && ['bokning', 'test'].includes(p.steg)) };
    });
    if (todoUi.dag && !dagar.some((d) => d.iso === todoUi.dag)) todoUi.dag = null; // dagen har passerat
    const vald = dagar.find((d) => d.iso === todoUi.dag) || null;
    const iVald = (t) => (!vald ? true : vald.i === 0 ? !!t.datum && dagarTill(t.datum) <= 0 : t.datum === vald.iso);
    // Först på tur: det äldsta med datum (förfallna först), annars det första utan datum. Lyfts till hjälten och visas inte i listan.
    const forst = oppna.find((t) => t.datum) || oppna[0] || null;
    const ny = !!forst && !!todoUi.forstId && todoUi.forstId !== forst.id;
    todoUi.forstId = forst ? forst.id : null;
    const synliga = oppna.filter((t) => t !== forst && iVald(t));
    const forstHar = !!forst && iVald(forst);
    // Kortets namn ("Först på tur" / "Nästa") återanvänds i listans texter – och "skjut" nämns bara när kortet har Skjut
    const forstNamn = forst ? tdForstEtikett(forst) : ''; const forstNu = tdForstNu(forst);
    const forstVar = forstNu ? 'står först på tur' : 'står som Nästa ovanför';

    // Hjältens vänstra spalt – tre olika saker, ingen säger samma sak: ringen visar hur många som är kvar idag (bågarna hur långt
    // dagen kommit, i samma färger som veckans prickar), rubriken vad det kvarvarande är (förfallet i rött, utan att upprepa talet)
    // och prickraden det som redan är klart och det som ligger utanför idag. Hela läget i klartext för skärmläsare (ringen är dold för dem).
    const kvarIdag = forfN + idagN;
    const forfOrd = (n) => (n === 1 ? 'förfallen' : 'förfallna');
    const rod = (txt) => `<span class="td-lage-rod">${txt}</span>`;
    const lageRubrik = !totIdag ? 'Inget planerat idag' : !kvarIdag ? 'Allt klart för idag'
      : forfN && idagN ? `${rod(`${e(forfN)} ${forfOrd(forfN)}`)} och ${e(idagN)} för idag`
        : forfN ? `${rod(forfN === 1 ? 'Förfallen' : 'Förfallna')} – inget nytt idag` : 'I fas – inget förfallet';
    const lageSr = kvarIdag ? `<span class="sr">${e(plural(kvarIdag, 'uppgift', 'uppgifter'))} kvar idag${klaraIdag ? `, ${e(klaraIdag)} av ${e(totIdag)} klara` : ''}: </span>` : '';
    const delar = [
      klaraIdag ? `<span data-lage="klar"><i></i>${e(klaraIdag)} ${klaraIdag === 1 ? 'klar' : 'klara'}</span>` : '',
      framat.length ? `<span data-lage="is"><i></i>${e(framat.length)} framåt</span>` : '',
      utanL.length ? `<span data-lage="utan"><i></i>${e(utanL.length)} utan datum</span>` : '',
    ].join('');
    const lageHtml = `<div class="td-lage" role="group" aria-label="Dagens läge">${tdDagring(klaraIdag, forfN, idagN)}<div class="td-lage-text">
        <strong>${lageSr}${lageRubrik}</strong>${delar ? `<span class="td-lage-delar">${delar}</span>` : ''}</div></div>`;
    const oppnaFor = (vem) => db.todos.filter((t) => !t.klar && (vem === 'alla' || t.ansvarig === jag)).length;
    const segment = `<div class="segment" role="group" aria-label="Visa uppgifter"><button type="button" aria-pressed="${mina}" data-g="todo-vem" data-vem="mina" title="${e(plural(oppnaFor('mina'), 'öppen uppgift', 'öppna uppgifter'))} för dig">Mina<span class="rakna">${oppnaFor('mina')}</span></button><button type="button" aria-pressed="${!mina}" data-g="todo-vem" data-vem="alla" title="${e(plural(oppnaFor('alla'), 'öppen uppgift', 'öppna uppgifter'))} i teamet">Alla<span class="rakna">${oppnaFor('alla')}</span></button></div>`;

    // Listan: grupper med prick och antal – eller bara den valda dagen
    const visaVem = !mina;
    const gruppHtml = vald && vald.i > 0
      ? (synliga.length ? tdGrupp('dag', '', synliga, visaVem) : '')
      : TD_GRUPPER.map(([id, namn, villkor, hjalp]) => {
        const rader = synliga.filter((t) => (villkor ? !!t.datum && villkor(dagarTill(t.datum)) : !t.datum));
        return rader.length ? tdGrupp(id, namn, rader, visaVem, hjalp) : '';
      }).join('');
    const dagNamn = vald ? (vald.i === 0 ? 'idag' : vald.i === 1 ? 'imorgon' : dagText(vald.iso)) : '';
    const tomtHtml = synliga.length ? ''
      : !oppna.length ? '' /* Först på tur säger redan att inget är kvar */
        : vald ? tom(forstHar ? `Inget mer ${dagNamn} – bara det som ${forstVar}.` : `Inget planerat ${dagNamn}.`, { emo: UPEMO.grupp.kommande, ton: 'is', knapp: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="fokus-ny-todo">${ik('plus')}Lägg till ${e(dagNamn)}</button>` })
          : `<p class="td-tomt">Inget mer på listan – bara det som ${forstVar}.</p>`;
    const rubrik = vald ? vald.lang.charAt(0).toUpperCase() + vald.lang.slice(1) : mina ? 'Din lista' : 'Teamets lista';
    const klaraHtml = todoUi.klara && klara.length ? tdGrupp('klara', 'Klara', klara, visaVem, allaKlara.length > klara.length ? `De ${klara.length} senaste` : '') : '';

    return `${sidhjalte({
        ogon: `Din dag · ${e(new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }))}`, titel: 'Att göra', klass: 'sidhjalte-todo',
        text: `<span class="dag-halsning">${halsning}, ${e(mig.kort)}. ${dygnMarke()}</span> ${!oppna.length ? '' : mina ? `Det viktigaste står först – bocka av${forstNu ? ' eller skjut' : ''} direkt härifrån.` : 'Hela teamets uppgifter, det viktigaste först.'}`,
        under: lageHtml, knappar: segment,
        extra: `${tdForst(forst, { mina, ny, teamet: oppnaFor('alla'), harKlara: allaKlara.length > 0 })}${tdVecka(dagar, todoUi.dag)}`,
      })}
      <div class="td-kommando-ram">
        <form class="td-kommando" data-form="todo-snabb" aria-label="Ny att göra" novalidate${todoUi.dag && todoUi.dag !== idag() ? ' data-datum-vald' : ''}>
          ${(() => { const typ = todoUi.utkast ? tdTyp(todoUi.utkast) : null; return `<span class="td-kommando-typ" data-td-typ aria-hidden="true"${typ ? ` data-typ title="${e(typ.namn)}"` : ''}>${typ ? emo(typ.em) : TODO_NEUTRAL}</span>`; })()}
          <label class="sr" for="todo-ny">Ny att göra</label><span class="td-kommando-falt"><input class="td-kommando-text" id="todo-ny" name="text" placeholder="Ny uppgift – t.ex. Ring Peter" required data-fel="Skriv vad som ska göras" autocomplete="off" enterkeyhint="done" value="${e(todoUi.utkast || '')}"></span>
          <label class="td-kommando-datum" title="Välj datum · pil upp/ned byter dag" data-kal-ankare>${ik('kalender')}<span class="td-datum-text" data-td-datum aria-hidden="true">${e(tdDatumEtikett(todoUi.dag || idag()))}</span><input type="date" name="datum" value="${e(todoUi.dag || idag())}" min="${omDagar(-365)}" max="${omDagar(730)}" aria-label="Datum" aria-describedby="td-datum-hjalp"><span class="sr" id="td-datum-hjalp">Pil upp eller ned byter dag, med Skift en vecka. Mellanslag öppnar kalendern.</span></label>
          <button class="knapp knapp-accent" type="submit">${ik('plus')}<span>Lägg till</span><span class="sr"> uppgiften</span></button>
        </form>
        <p class="td-tips">${emo(UPEMO.sak.tips)}<span>Skriv som du pratar – ”Ring …”, ”Skicka offert …” eller ”Boka testdag …” får rätt symbol av sig själv, och kundens namn kopplar uppgiften till kunden.</span></p>
      </div>
      ${tdForslagHtml(tdForslag())}
      ${(oppna.length || allaKlara.length) && (synliga.length || vald || allaKlara.length) ? `<section class="kort td-kort" data-td-lista aria-labelledby="td-h-lista">
        <header class="td-huvud">
          <div class="td-huvud-text"><h2 id="td-h-lista">${e(rubrik)}${synliga.length ? `<span class="rakna">${synliga.length}</span>` : ''}</h2>${forstHar && synliga.length ? `<small>${forstNu ? 'Den första står i Först på tur ovanför.' : `Den närmaste står som ${e(forstNamn)} ovanför.`}</small>` : ''}</div>
          <div class="td-huvud-hoger">${vald ? `<button class="td-filter" type="button" data-g="todo-dag" data-dag="">${ik('stang')}Visa hela listan</button>` : ''}${allaKlara.length ? `<button class="td-klara-knapp" type="button" data-g="todo-klara" aria-expanded="${todoUi.klara}">${ik('bock')}${todoUi.klara ? 'Dölj' : 'Visa'} klara<span class="rakna">${allaKlara.length}</span></button>` : ''}</div>
        </header>
        <div class="td-lista" data-vem="${mina ? 'mina' : 'alla'}">${gruppHtml}${tomtHtml}${klaraHtml}</div>
      </section>` : ''}`;
  }
  // Snabbraden: symbolen till vänster visar typen medan man skriver ("Ring …" → telefonen) – i vila den neutrala uppgiftssymbolen
  // (samma som listans vanliga uppgifter; inget plus, det har knappen). Ritas bara om när typen byts, så att symbolens
  // entré inte startar om vid varje tangenttryckning.
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'todo-ny') return;
    todoUi.utkast = ev.target.value; // står kvar när listan ritas om (veckoremsan, Klar, Mina/Alla …)
    const ruta = $('[data-td-typ]', vy); if (!ruta) return;
    const typ = tdTyp(ev.target.value); const namn = typ ? typ.namn : '';
    if ((ruta.title || '') === namn) return;
    ruta.innerHTML = typ ? emo(typ.em) : TODO_NEUTRAL; ruta.toggleAttribute('data-typ', !!typ); ruta.title = namn;
  });
  // Telefon: snabbraden fäller ut datumraden när fältet får fokus – rulla så att hela raden står ovanför bottenmenyn
  document.addEventListener('focusin', (ev) => {
    if (ev.target.id !== 'todo-ny' || !matchMedia('(max-width: 560px)').matches) return;
    requestAnimationFrame(() => {
      const f = ev.target.form; if (!f) return;
      const meny = $('.flikrad'); const m = meny && meny.getBoundingClientRect();
      const golv = (m && m.height ? m.top : innerHeight) - 12; const ned = f.getBoundingClientRect().bottom - golv;
      if (ned > 0) scrollBy({ top: ned, behavior: lugn ? 'auto' : 'smooth' });
    });
  });
  // Snabbradens datum i klartext ("Idag", "tis 20 okt"). Det riktiga datumfältet ligger osynligt över hela pillret:
  // klick (och mellanslag) öppnar kalendern, och texten följer värdet – tömt fält = uppgift utan datum.
  const tdDatumFalt = (el) => (el && el.matches && el.matches('.td-kommando-datum input') ? el : null);
  // data-datum-vald: ett annat datum än idag – då står datumraden kvar även när snabbraden är hopfälld på telefon (sidor.css 11)
  const tdDatumVisa = (inp) => {
    const s = $('[data-td-datum]', inp.closest('.td-kommando-datum')); if (s) s.textContent = tdDatumEtikett(inp.value);
    if (inp.form) inp.form.toggleAttribute('data-datum-vald', inp.value !== idag());
  };
  ['input', 'change'].forEach((typ) => document.addEventListener(typ, (ev) => { const inp = tdDatumFalt(ev.target); if (inp) tdDatumVisa(inp); }));
  // Följ upp under anteckningsrutan: den som öppnar datumet vill följa upp – klick på datumet (eller mellanslag/Alt+pil ned,
  // som öppnar kalendern) kryssar i raden även när datumet inte byts. Tab förbi fältet kryssar inte.
  const foljKryss = (inp) => { const k = inp.closest('.skrivruta-folj') && inp.closest('.skrivruta-folj').querySelector('input[type="checkbox"]'); if (k && !k.checked) { k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); } };
  document.addEventListener('click', (ev) => { const inp = ev.target.closest && ev.target.closest('.skrivruta-folj input[type="date"]'); if (inp) foljKryss(inp); }, true);
  document.addEventListener('keydown', (ev) => { if ((ev.key === ' ' || (ev.altKey && ev.key === 'ArrowDown')) && ev.target.matches && ev.target.matches('.skrivruta-folj input[type="date"]')) foljKryss(ev.target); }, true);
  // Väljs ett datum kryssas raden i (den som väljer datum vill följa upp)
  document.addEventListener('change', (ev) => {
    const inp = ev.target; if (!inp.matches || !inp.matches('.skrivruta-folj input[type="date"]') || !inp.value) return;
    const k = inp.closest('.skrivruta-folj').querySelector('input[type="checkbox"]');
    if (k && !k.checked) { k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  /* Antalsfält: webbläsarens små pilar (▲▼) byts mot egna − och + (som väljaren och datumväljaren). Varje .falt[type=number] läggs
     i en .antal-falt med två runda knappar; värdet följer min/max/step och fältet får input + change som om man skrivit. Knapparna är
     utanför tabbordningen och tar aldrig fokus – fältet är redan en spinbutton (piltangenterna fungerar). data-nativ undantar.
     Körs direkt efter varje ritning (rendera, oppnaArk) och av en observatör för delar som ritas om. Stil: crm.css (.antal-falt). */
  const ANTAL_SVG = { '-1': '<path d="M6 12h12"/>', 1: '<path d="M12 6v12M6 12h12"/>' };
  function forberedAntal(rot = document) {
    $$('input.falt[type="number"]:not([data-nativ]):not([data-antal])', rot).forEach((inp) => {
      inp.dataset.antal = '';
      const fokus = document.activeElement === inp;
      const ram = document.createElement('span'); ram.className = 'antal-falt';
      inp.replaceWith(ram); ram.append(inp);
      ram.insertAdjacentHTML('beforeend', ['-1', '1'].map((r) => `<button type="button" class="antal-knapp" data-antal-steg="${r}" tabindex="-1" aria-hidden="true" title="${r === '1' ? 'Öka' : 'Minska'}"><svg class="ikon" viewBox="0 0 24 24">${ANTAL_SVG[r]}</svg></button>`).join(''));
      if (fokus) inp.focus({ preventScroll: true });
    });
  }
  document.addEventListener('mousedown', (ev) => { if (ev.target.closest && ev.target.closest('[data-antal-steg]')) ev.preventDefault(); });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-antal-steg]'); if (!b) return;
    const inp = b.parentElement.querySelector('input'); if (!inp || inp.disabled || inp.readOnly) return;
    const steg = Number(inp.step) || 1; const min = inp.min !== '' ? Number(inp.min) : -Infinity; const max = inp.max !== '' ? Number(inp.max) : Infinity;
    const nu = Number(inp.value) || 0; const ny = Math.min(max, Math.max(min, nu + steg * Number(b.dataset.antalSteg)));
    if (ny === nu && inp.value !== '') return;
    inp.value = String(ny); inp.removeAttribute('aria-invalid');
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  let antalVantar = false;
  new MutationObserver(() => { if (antalVantar) return; antalVantar = true; queueMicrotask(() => { antalVantar = false; forberedAntal(); }); }).observe(document.body, { childList: true, subtree: true });
  // Datumväljaren (assets/kalender.js) öppnar sin egen kalender vid klick och mellanslag; utan den används webbläsarens
  const tdOppnaKalender = (inp) => { if (window.UPKalender) { UPKalender.oppna(inp, { fokusera: true }); return true; } try { inp.showPicker(); return true; } catch (err) { return false; /* äldre webbläsare: fältet fungerar som vanligt */ } };
  document.addEventListener('click', (ev) => { const inp = tdDatumFalt(ev.target); if (inp && !window.UPKalender) tdOppnaKalender(inp); });
  // Tangentbord: fältets egna delar (år/månad/dag) syns inte under pillret, så pilarna byter hela dagen (Skift/PageUp/PageDown = en vecka)
  // i stället för att tyst ändra året, och Tab hoppar förbi delarna – ett enda stopp, som en knapp.
  const TD_DATUM_STEG = { ArrowUp: 1, ArrowDown: -1, PageUp: 7, PageDown: -7 };
  document.addEventListener('keydown', (ev) => {
    const inp = tdDatumFalt(ev.target); if (!inp || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === ' ') { if (tdOppnaKalender(inp)) ev.preventDefault(); return; }
    if (ev.key in TD_DATUM_STEG) {
      ev.preventDefault();
      const steg = TD_DATUM_STEG[ev.key] * (ev.shiftKey && Math.abs(TD_DATUM_STEG[ev.key]) === 1 ? 7 : 1);
      const fran = inp.value && tolka(inp.value) && !isNaN(tolka(inp.value)) ? inp.value : null;
      // inom rutans min och max (ISO-datum jämförs som text)
      let nytt = fran ? omDagar(steg, fran) : idag(); if (inp.min && nytt < inp.min) nytt = inp.min; if (inp.max && nytt > inp.max) nytt = inp.max;
      inp.value = nytt;
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); return; } // flytta inte mellan osynliga delar
    if (ev.key === 'Tab') {
      const form = inp.form; const mal = form && (ev.shiftKey ? $('#todo-ny', form) : $('button[type="submit"]', form));
      if (mal) { ev.preventDefault(); mal.focus(); }
    }
  });


  /* 10b-kundmöte: presentation och live-kalkyl (själva presentationen finns i mote.js) ---- */
  // Live-kalkylen räknar på paket × antal – affärer med deltagarlista, eget pris eller coaching räknas i offertkortet
  const kanRaknaLive = (a) => !['signerad', 'forlorad'].includes(a.steg) && a.offert && a.offert.eget == null && a.offert.typ !== 'uppfoljning' && !a.offert.deltagare;
  // fokus = affären vars kort valdes i steg 1 (kan sakna live-kalkyl); bilder = valda bilder (null = alla) – överlever omritningar
  const moteUi = { kundId: '', affarId: '', fokus: '', bilder: null };
  const moteAffarAlternativ = (kundId, vald) => {
    const af = kundId ? db.affarer.filter((a) => a.kundId === kundId && kanRaknaLive(a)) : [];
    // Kort text (ingen ellips i knappen); "Rubrik · detalj" visas som rubrik + liten rad i listan (valj.js). Att kalkylen
    // sparas som en ny affär står i dossiern – inte här också.
    return `<option value="">${kundId ? 'Ny affär' : 'Välj kund först'}</option>` + af.map((a) => `<option value="${e(a.id)}" ${vald === a.id ? 'selected' : ''}>${e(a.titel)} · ${e(SALJSTEG.find((x) => x.id === a.steg).namn)} · ${kr(affarVarde(a))}</option>`).join('');
  };
  // Kundmöte är för företag – klubbar har Klubbmotorn i stället (kundsidan visar ingen Kundmöte-knapp för dem)
  const moteKundAlternativ = (vald) => [...db.kunder].filter((k) => k.typ !== 'klubb').sort((a, b) => a.namn.localeCompare(b.namn, 'sv')).map((k) => `<option value="${e(k.id)}" ${vald === k.id ? 'selected' : ''}>${e(k.namn)}</option>`).join('');
  // Rätt affär att räkna på: den valda, annars kundens enda affär som går att räkna live på
  const moteAffarFor = (kundId, affarId) => affarId || (kundId ? (() => { const af = db.affarer.filter((a) => a.kundId === kundId && kanRaknaLive(a)); return af.length === 1 ? af[0].id : null; })() : null);
  // Planera mötet i tre steg (stil: sidor.css avsnitt 09). Allt i EN form (data-form="starta-mote"): korten i steg 1 ställer in
  // samma rullistor (kundId, affarId) som man kan välja i direkt, bildremsan är kryssrutorna name="bild" och dockan har startknappen.
  // Steg 1: affärerna som väntar på ett möte – samma urval och ordning som mötesscenen (kundbesök först, sedan ny kontakt och offert)
  const MOTE_VANTAR = { besok: 0, kontakt: 1, offert: 2 };
  const moteVantar = () => db.affarer.filter((a) => Object.hasOwn(MOTE_VANTAR, a.steg) && kund(a.kundId) && kund(a.kundId).typ !== 'klubb')
    .sort((x, y) => (MOTE_VANTAR[x.steg] - MOTE_VANTAR[y.steg]) || String(y.stegAndrad || '').localeCompare(String(x.stegAndrad || '')));
  const moteStegNamn = (id) => (SALJSTEG.find((s) => s.id === id) || {}).namn || id;
  // Dossierns upplägg: paketet och programmen som ingår i offerten (app, Team Insights, coaching) – samma som kalkylen sedan visar.
  // Bara här: säljtavlans kort och andra rader använder paketText utan programmen.
  const moteUpplagg = (o) => `${paketText(o)}${o.eget != null ? '' : `${o.app ? ' + app' : ''}${o.insights ? ' + Team Insights' : ''}${o.uppfoljning && o.typ !== 'uppfoljning' ? ' + coaching' : ''}`}`;
  const moteDagarISteget = (a) => (a.stegAndrad ? Math.max(0, -dagarTill(a.stegAndrad)) : null);
  // Kortet som är valt: den valda affären, annars kundens första kort
  const moteKortVald = (lista) => {
    if (!moteUi.kundId) return '';
    const fokus = moteUi.fokus || moteUi.affarId;
    if (fokus && lista.some((a) => a.id === fokus && a.kundId === moteUi.kundId)) return fokus;
    const forsta = lista.find((a) => a.kundId === moteUi.kundId); return forsta ? forsta.id : '';
  };
  // Affären som dossiern och dockan visar: kortets affär, den valda i rullistan, annars kundens senast ändrade öppna affär
  const moteAffarVisad = (k) => {
    const af = affarerFor(k.id).filter(arOppen).sort((a, b) => (a.stegAndrad < b.stegAndrad ? 1 : -1));
    return [moteUi.fokus, moteUi.affarId].map((id) => id && af.find((a) => a.id === id)).find(Boolean) || af[0] || null;
  };
  // Korten är ett enkelval (role=radio i en radiogroup, pilarna flyttar valet – keydown-lyssnaren efter startaMote). Ordning: namn,
  // affär, vem + tid i steget, och foten (steg + värde) sist så att fötterna ligger i linje i varje rad. Mittpunkten följer med
  // tiden (.mk-hel) – den hänger aldrig kvar sist på raden när raden bryts.
  // tabb = kortet som Tab når (det valda, annars det första) – roving tabindex som i en vanlig radiogrupp
  const moteKundKort = (a, vald, tabb) => {
    const k = kund(a.kundId); const pk = primarKontakt(k); const d = moteDagarISteget(a); const ar = a.id === vald;
    return `<button type="button" class="mk-kund" role="radio" aria-checked="${ar}" tabindex="${ar || tabb ? 0 : -1}" data-g="mote-vem" data-kund="${e(k.id)}" data-affar="${e(a.id)}" data-steg="${e(a.steg)}">
            <span class="mk-avatar" aria-hidden="true">${e(initialer(k.namn))}</span><span class="mk-bock" aria-hidden="true">${ik('bock')}</span>
            <strong class="mk-kund-namn">${e(k.namn)}</strong><span class="mk-kund-affar">${e(a.titel)}</span>
            <small class="mk-kund-not">${pk ? `${e(pk.namn)} ` : ''}<span class="mk-hel">${pk ? '· ' : ''}${d == null ? 'Väntar på möte' : d ? `${plural(d, 'dag', 'dagar')} i steget` : 'Nytt i steget idag'}</span></small>
            <span class="mk-kund-fot"><span class="mk-stegchip"><i aria-hidden="true"></i>${e(moteStegNamn(a.steg))}</span>${a.offert ? `<b>${kr(affarVarde(a))}</b>` : ''}</span>
            ${(() => { const sn = sannolikhet(a); const p = Math.round(sn.p * 100); return `<span class="mk-chans" title="${e(`Sannolikhet ${p} %`)}"><span class="mk-chans-stapel" aria-hidden="true"><i style="transform:scaleX(${sn.p.toFixed(2)})"></i></span><small>${p} % chans</small></span>`; })()}</button>`;
  };
  const moteVemHtml = () => {
    const lista = moteVantar(); const visas = lista.slice(0, 5); const vald = moteKortVald(visas); const fler = lista.length - visas.length;
    const utanforKorten = !!moteUi.kundId && !visas.some((a) => a.kundId === moteUi.kundId);
    return `<section class="mk-steg mk-vem" aria-labelledby="mk-h-vem">
          <div class="mk-steg-huvud"><span class="mk-nr" aria-hidden="true">1</span><div><h3 id="mk-h-vem">Vem träffar du?</h3><p>${lista.length ? `${plural(lista.length, 'affär väntar', 'affärer väntar')} på ett möte – välj en, eller visa generellt.` : 'Inga affärer väntar på möte just nu – välj bland alla kunder eller visa generellt.'}</p></div></div>
          <div class="mk-kunder" role="radiogroup" aria-label="Vem mötet gäller">${visas.map((a, i) => moteKundKort(a, vald, !i && !vald && !!moteUi.kundId)).join('')}
            <button type="button" class="mk-kund mk-generellt" role="radio" aria-checked="${!moteUi.kundId}" tabindex="${moteUi.kundId && (vald || visas.length) ? -1 : 0}" data-g="mote-vem" data-kund="" data-affar="">
              <span class="mk-avatar" aria-hidden="true">${ik('presentation')}</span><span class="mk-bock" aria-hidden="true">${ik('bock')}</span>
              <strong class="mk-kund-namn">Generellt</strong><span class="mk-kund-affar">Ingen särskild kund</span><small class="mk-kund-not">Presentationen utan kunddata</small></button></div>
          <details class="mk-alla" ${utanforKorten || !lista.length ? 'open' : ''}><summary><span>Välj bland alla kunder${fler ? ` – ${plural(fler, 'affär till väntar', 'affärer till väntar')}` : ''}</span>${ik('chevron')}</summary>
            <div class="mk-alla-inre">
              <div class="mk-falt"><label class="mk-etikett" for="mk-kund">Kund</label><select class="falt" id="mk-kund" name="kundId" data-mote-kund><option value="">Ingen vald – visa generellt</option>${moteKundAlternativ(moteUi.kundId)}</select></div>
              <div class="mk-falt" data-mk-affar-falt ${moteUi.kundId ? '' : 'hidden'}><label class="mk-etikett" for="mk-affar">Affär att räkna på</label><select class="falt" id="mk-affar" name="affarId" data-mote-affar ${moteUi.kundId ? '' : 'disabled'}>${moteAffarAlternativ(moteUi.kundId, moteUi.affarId)}</select>
                <p class="mk-hint" data-mk-hint ${moteUi.affarId ? '' : 'hidden'}>Kalkylen startar från affärens offert och sparas tillbaka dit.</p></div>
            </div></details></section>`;
  };
  // Steg 2: Inför mötet – allt framräknat ur kundens data. Innehållet ritas om efter varje val (moteUppdatera), själva kortet står kvar.
  const inforInnehall = () => {
    const k = moteUi.kundId ? kund(moteUi.kundId) : null;
    // under = en liten andra rad (redan escapad, som text)
    const rad = (em, titel, text, under = '') => `<li>${emo(em, { ruta: 's' })}<span class="mk-rad-text"><small>${e(titel)}</small><strong>${text}</strong>${under ? `<span class="mk-rad-under">${under}</span>` : ''}</span></li>`;
    const huvud = '<div class="mk-steg-huvud"><span class="mk-nr" aria-hidden="true">2</span><div><h3 id="mk-h-infor">Inför mötet</h3></div></div>';
    if (!k) {
      // Antalet som väntar står redan under Vem träffar du? – här bara vad dossiern visar när en kund är vald
      return `${huvud}
          <div class="mk-infor-vem"><span class="mk-avatar mk-avatar-stor mk-avatar-u" aria-hidden="true">${ik('presentation')}</span><div><strong>Generell presentation</strong><small>Ingen kund vald</small></div></div>
          <ul class="mk-infor-lista">
            ${rad(UPEMO.sak.kalkyl, 'Kalkylen', `Startar på ${e(PRISER.paket.basplus.namn)} – paket, antal, tillval och program mellan testerna ändrar du live med prislistan.`)}
            ${rad(UPEMO.sak.offert, 'Spara upplägget', 'Välj kund i mötet – kalkylen sparas som en ny affär och offerten kan skapas direkt.')}
            ${rad(UPEMO.sak.tips, 'Med en kund vald', 'Samlas affären, upplägget, vem du träffar, senaste kontakten och nästa att göra här.')}
          </ul>`;
    }
    const a = moteAffarVisad(k); const d = a ? moteDagarISteget(a) : null;
    const sista = sistaAktivitet(k.id); const pk = primarKontakt(k); const kl = k.viaKlubb ? kund(k.viaKlubb) : null; const lage = omtestLage(k.id);
    const fakta = [k.bransch, k.anstallda ? `${k.anstallda} anställda` : ''].filter(Boolean).join(' · ');
    const fornamn = pk ? String(pk.namn).split(/\s+/)[0] : '';
    // Det som ska hända härnäst: kundens första öppna att göra (med datum), annars affärens nästa steg (samma som säljtavlan)
    const todo = db.todos.filter((t) => t.kundId === k.id && !t.klar).sort((x, y) => String(x.datum || '9').localeCompare(String(y.datum || '9')))[0];
    const ns = !todo && a ? nastaSteg(a) : null;
    const todoNar = todo && todo.datum ? (dagarTill(todo.datum) < 0 ? `förfallen sedan ${datumText(todo.datum, { gemen: true })}` : datumText(todo.datum, { gemen: true })) : '';
    // Ingen öppen affär men en signerad: visa den och testprojektet i stället för "ingen ännu" (det har redan blivit affär)
    const signerade = affarerFor(k.id).filter((x) => x.steg === 'signerad').sort((x, y) => String(y.stegAndrad || '').localeCompare(String(x.stegAndrad || '')));
    const sa = !a ? signerade[0] : null; const sp = sa ? projektForAffar(sa.id) : null;
    const spSteg = sp ? PROJSTEG.find((x) => x.id === sp.steg) : null;
    const spText = sp ? (sp.steg === 'klar' ? 'Testet är genomfört' : `${spSteg ? spSteg.namn : sp.steg}${sp.steg === 'underlag' && sp.underlagStatus === 'returnerat' ? ' – returnerat till sälj' : ''}`) : '';
    // Affären är det valda kortet i steg 1 (titel, steg, värde och tid står där): bara upplägget och offertens läge här.
    // Valt i rullistan eller en annan affär än kortets: hela raden, eftersom inget kort visar den.
    const iKort = !!a && moteKortVald(moteVantar().slice(0, 5)) === a.id;
    const dok = a ? dokFor(a.id, 'offert') : null;
    const dokText = dok ? `Offert ${dok.nummer} · ${dok.status === 'godkand' ? 'godkänd' : dok.oppnad ? `öppnad ${relTid(dok.oppnad)}` : `skapad ${relTid(dok.skapad)}, inte öppnad än`}` : '';
    const affarRad = iKort
      ? rad(UPEMO.sak.offert, 'Upplägget', a.offert ? e(moteUpplagg(a.offert)) : 'Inget upplägg ännu', e(dokText))
      : a
      ? rad(UPEMO.salj[a.steg], 'Öppen affär', `${e(a.titel)} · ${e(moteStegNamn(a.steg))}`, [a.offert ? `${e(moteUpplagg(a.offert))} · ${kr(affarVarde(a))}` : '', d != null ? (d ? `${plural(d, 'dag', 'dagar')} i steget` : 'nytt i steget idag') : '', e(dokText)].filter(Boolean).join(' · '))
      : sa ? `${rad(UPEMO.salj.signerad, 'Senaste affär', `${e(sa.titel)} · Signerad${sa.stegAndrad ? ` ${e(datumText(sa.stegAndrad, { gemen: true }))}` : ''}`, sa.offert ? `${e(moteUpplagg(sa.offert))} · ${kr(affarVarde(sa))}` : '')}${sp ? rad(UPEMO.proj[sp.steg] || UPEMO.proj.underlag, 'Testprojektet', e(spText)) : ''}`
        : rad(UPEMO.sak.pipeline, 'Öppen affär', 'Ingen ännu – kalkylen sparas som en ny affär');
    return `${huvud}
          <div class="mk-infor-vem"><span class="mk-avatar mk-avatar-stor" aria-hidden="true">${e(initialer(k.namn))}</span><div><strong>${e(k.namn)}</strong>${fakta ? `<small>${e(fakta)}</small>` : ''}</div></div>
          <ul class="mk-infor-lista">
            ${affarRad}
            ${rad(UPEMO.sak.kontakt, 'Du träffar', pk ? `${e(pk.namn)}${pk.roll ? `, ${e(pk.roll)}` : ''}` : 'Ingen kontaktperson registrerad')}
            ${rad(UPEMO.akt[sista ? sista.typ : 'anteckning'] || UPEMO.akt.system, 'Senaste kontakten', sista ? e(sista.text.length > 90 ? sista.text.slice(0, 90).trimEnd() + '…' : sista.text) : 'Inget loggat ännu', sista ? e(relTid(sista.tid)) : '')}
            ${todo ? rad(UPEMO.sak.todo, 'Att göra', e(todo.text), e(todoNar)) : ns ? rad(ns.emo, 'Nästa steg i affären', e(ns.text)) : ''}
            ${lage && lage.typ ? rad(lage.typ === 'omtest' ? UPEMO.sak.omtest : UPEMO.sak.uppfoljning, 'Förra testet', `${lage.manader} månader sedan – ${lage.typ === 'omtest' ? 'dags för omtest' : 'läge för uppföljning'}`) : ''}
            ${kl ? rad(UPEMO.sak.klubb, 'Introducerad via', `${e(kl.namn)} – klubben får ${e(kl.klubbavtal ? kl.klubbavtal.procent : Math.round(KLUBBMOTORN.provision * 100))} % ${signerade.length ? 'av ordervärdet' : 'om det blir affär'}`) : ''}
          </ul>
          <div class="mk-infor-fot">
            ${pk && pk.tel ? `<a class="mk-infor-knapp" href="tel:${e(String(pk.tel).replace(/[^\d+]/g, ''))}" title="${e(pk.tel)}">${ik('samtal')}Ring ${e(fornamn)}</a>` : ''}
            ${pk && pk.epost ? `<a class="mk-infor-knapp" href="mailto:${e(pk.epost)}" title="${e(pk.epost)}">${ik('mejl')}Mejla</a>` : ''}
            <a class="mk-infor-knapp mk-infor-lank" href="#/kund/${e(k.id)}">Kundkortet${ik('pil')}</a>
          </div>`;
  };
  const inforMoteHtml = () => `<section class="mk-steg mk-infor" data-infor-mote data-mork-yta aria-labelledby="mk-h-infor"><div class="mk-infor-inre" data-infor-innehall>${inforInnehall()}</div></section>`;
  // Steg 3: bildremsan – stiliserade miniatyrer av presentationens bilder (bara former, ingen kunddata)
  const MK_OGON = '<rect class="a" x="14" y="14" width="12" height="2.6" rx="1.3"/><rect class="d" x="29" y="14" width="30" height="2.6" rx="1.3"/>';
  const MK_RUBRIK = (b) => `${MK_OGON}<rect class="l" x="14" y="23" width="${b}" height="7" rx="3.5"/>`;
  const MK_TRE = (y, h, inre) => [14, 61, 108].map((x) => `<rect class="k" x="${x}" y="${y}" width="38" height="${h}" rx="6"/>${inre(x)}`).join('');
  const MOTE_MINI = {
    titel: `${MK_OGON}<rect class="l" x="14" y="24" width="68" height="8" rx="4"/><rect class="a" x="14" y="36" width="50" height="8" rx="4"/><rect class="d" x="14" y="53" width="72" height="3" rx="1.5"/><rect class="d" x="14" y="60" width="58" height="3" rx="1.5"/><rect class="d" x="14" y="67" width="40" height="3" rx="1.5"/><rect class="f" x="98" y="12" width="48" height="76" rx="8"/><circle class="d" cx="122" cy="39" r="8.5"/><path class="d" d="M106.5 76c1.7-10.6 7.8-16.2 15.5-16.2s13.8 5.6 15.5 16.2z"/>`, // fotot i rundad ram (ingen målad play – bara ▶-knappen ser ut som play)
    citat: '<circle class="f" cx="38" cy="50" r="25"/><path class="a" d="M66 38c0-6 3-10 9-12l1 3c-3 1-5 3-5 6h5v8H66zm16 0c0-6 3-10 9-12l1 3c-3 1-5 3-5 6h5v8H82z"/><rect class="l" x="66" y="52" width="78" height="5" rx="2.5"/><rect class="l" x="66" y="61" width="68" height="5" rx="2.5"/><rect class="l" x="66" y="70" width="44" height="5" rx="2.5"/><rect class="d" x="66" y="81" width="38" height="2.6" rx="1.3"/>',
    varfor: MK_RUBRIK(98) + MK_TRE(40, 46, (x) => `<rect class="a" x="${x + 6}" y="48" width="20" height="8" rx="3"/><rect class="d" x="${x + 6}" y="63" width="26" height="2.4" rx="1.2"/><rect class="d" x="${x + 6}" y="69" width="22" height="2.4" rx="1.2"/><rect class="d" x="${x + 6}" y="75" width="15" height="2.4" rx="1.2"/>`),
    metod: MK_RUBRIK(104) + MK_TRE(40, 46, (x) => `<circle class="a" cx="${x + 11}" cy="51" r="5"/><rect class="l" x="${x + 6}" y="62" width="24" height="3" rx="1.5"/><rect class="d" x="${x + 6}" y="69" width="26" height="2.4" rx="1.2"/><rect class="d" x="${x + 6}" y="75" width="18" height="2.4" rx="1.2"/>`),
    paket: MK_RUBRIK(84) + [[14, 42, 44, 'k'], [61, 37, 51, 'ka'], [108, 42, 44, 'k']].map(([x, y, h, c]) => `<rect class="${c}" x="${x}" y="${y}" width="38" height="${h}" rx="6"/><rect class="d" x="${x + 6}" y="${y + 7}" width="14" height="2.4" rx="1.2"/><rect class="l" x="${x + 6}" y="${y + 13}" width="20" height="6" rx="3"/>${[0, 1, 2].map((j) => `<circle class="a" cx="${x + 8}" cy="${y + 27 + j * 6}" r="1.6"/><rect class="d" x="${x + 12}" y="${y + 26 + j * 6}" width="${18 - j * 3}" height="2.2" rx="1.1"/>`).join('')}`).join(''),
    kalkyl: `${MK_RUBRIK(74)}<rect class="k" x="14" y="38" width="24" height="10" rx="5"/><rect class="ka" x="41" y="38" width="24" height="10" rx="5"/><rect class="k" x="68" y="38" width="24" height="10" rx="5"/><rect class="d" x="14" y="61" width="78" height="2.6" rx="1.3"/><rect class="a" x="14" y="61" width="46" height="2.6" rx="1.3"/><circle class="l" cx="60" cy="62.3" r="4.2"/><rect class="k" x="14" y="73" width="20" height="8" rx="4"/><rect class="k" x="37" y="73" width="24" height="8" rx="4"/><rect class="k" x="64" y="73" width="18" height="8" rx="4"/><rect class="k" x="100" y="12" width="46" height="76" rx="8"/><rect class="d" x="106" y="20" width="26" height="2.4" rx="1.2"/><rect class="l" x="106" y="27" width="32" height="10" rx="3"/><rect class="d" x="106" y="44" width="34" height="2.4" rx="1.2"/><rect class="d" x="106" y="50" width="30" height="2.4" rx="1.2"/><rect class="d" x="106" y="56" width="34" height="2.4" rx="1.2"/><rect class="a" x="106" y="74" width="34" height="8" rx="4"/>`,
    resa: `${MK_RUBRIK(96)}<rect class="d" x="18" y="57" width="124" height="1.8" rx=".9"/>` + [0, 1, 2, 3, 4, 5].map((i) => { const x = 18 + i * 24.8; return `<circle class="${i < 2 ? 'a' : 'r'}" cx="${x.toFixed(1)}" cy="57.9" r="4"/><rect class="l" x="${(x - 8).toFixed(1)}" y="69" width="16" height="2.8" rx="1.4"/><rect class="d" x="${(x - 7).toFixed(1)}" y="75" width="14" height="2.2" rx="1.1"/>`; }).join(''),
    plattform: '<rect class="t" x="20" y="10" width="36" height="80" rx="8"/><rect class="a" x="27" y="20" width="14" height="3" rx="1.5"/><circle class="r" cx="38" cy="45" r="10"/><rect class="d" x="27" y="62" width="22" height="2.6" rx="1.3"/><rect class="d" x="27" y="68" width="18" height="2.6" rx="1.3"/><rect class="d" x="27" y="74" width="22" height="2.6" rx="1.3"/><rect class="a" x="68" y="16" width="12" height="2.6" rx="1.3"/><rect class="d" x="83" y="16" width="34" height="2.6" rx="1.3"/><rect class="l" x="68" y="25" width="50" height="7" rx="3.5"/><rect class="a" x="68" y="35" width="40" height="7" rx="3.5"/>' + [0, 1, 2, 3].map((i) => `<circle class="a" cx="71" cy="${54 + i * 9}" r="2"/><rect class="d" x="77" y="${53 + i * 9}" width="${62 - (i % 2) * 14}" height="2.6" rx="1.3"/>`).join(''),
    team: MK_RUBRIK(70) + MK_TRE(38, 50, (x) => `<circle class="f" cx="${x + 19}" cy="54" r="10"/><rect class="a" x="${x + 12}" y="70" width="14" height="2.4" rx="1.2"/><rect class="l" x="${x + 7}" y="76" width="24" height="3" rx="1.5"/>`),
    fortroende: '<rect class="a" x="62" y="14" width="12" height="2.6" rx="1.3"/><rect class="d" x="77" y="14" width="22" height="2.6" rx="1.3"/><rect class="l" x="26" y="23" width="108" height="7" rx="3.5"/><rect class="l" x="46" y="33" width="68" height="7" rx="3.5"/>' + [35, 65, 95, 125].map((x) => `<circle class="k" cx="${x}" cy="62" r="10"/><circle class="d" cx="${x}" cy="62" r="4.5"/><rect class="d" x="${x - 11}" y="78" width="22" height="2.4" rx="1.2"/>`).join(''),
    nasta: `${MK_RUBRIK(72)}<rect class="d" x="14" y="35" width="76" height="2.6" rx="1.3"/><rect class="d" x="14" y="41" width="58" height="2.6" rx="1.3"/>` + [14, 42, 70].map((x) => `<rect class="k" x="${x}" y="50" width="25" height="22" rx="5"/><circle class="a" cx="${x + 6}" cy="56" r="2.2"/><rect class="d" x="${x + 4}" y="62" width="16" height="2.2" rx="1.1"/>`).join('') + '<rect class="a" x="14" y="78" width="34" height="8" rx="4"/><rect class="ka" x="104" y="12" width="42" height="76" rx="8"/><rect class="d" x="110" y="20" width="22" height="2.4" rx="1.2"/><rect class="l" x="110" y="28" width="28" height="9" rx="3"/><rect class="d" x="110" y="46" width="30" height="2.4" rx="1.2"/><rect class="d" x="110" y="52" width="26" height="2.4" rx="1.2"/><rect class="d" x="110" y="58" width="30" height="2.4" rx="1.2"/>',
  };
  const MK_SPELA = '<svg class="ikon mk-spela" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const MK_KALKYL = '<svg class="ikon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h1.5M12 12h1.5M15.5 12h.01M8.5 16h1.5M12 16h1.5M15.5 16h.01"/></svg>';
  const MK_EXTRA = { kalkyl: 'Live med prislistan', nasta: 'Spara och skapa offerten' };
  const moteBildTal = (n, alla) => (n === alla ? `${alla} bilder` : `${n} av ${alla}`);
  const moteBilderHtml = (bilder) => {
    const valda = moteUi.bilder ? new Set(moteUi.bilder) : null;
    return `<section class="mk-steg mk-bilder" aria-labelledby="mk-h-bilder">
          <div class="mk-steg-huvud"><span class="mk-nr" aria-hidden="true">3</span><div><h3 id="mk-h-bilder">Presentationen</h3><p><span class="mk-mus">Klicka</span><span class="mk-pek">Tryck</span> på en bild för att ta med den eller hoppa över den – <span class="mk-spela-ikon" aria-hidden="true">${MK_SPELA}</span> startar direkt på bilden.</p></div>
            <div class="mk-steg-hoger"><button class="mk-liten" type="button" data-g="bildval" data-alla="1">Markera alla</button><button class="mk-liten" type="button" data-g="bildval" data-alla="0">Markera inga</button></div></div>
          <ol class="mk-remsa">${bilder.map((b, i) => `<li class="mk-bild">
              <label class="mk-bild-val"><input type="checkbox" name="bild" value="${e(b.id)}" ${!valda || valda.has(b.id) ? 'checked' : ''}>
                <span class="mk-mini"><svg viewBox="0 0 160 100" aria-hidden="true" focusable="false">${MOTE_MINI[b.id] || MK_RUBRIK(80)}</svg><span class="mk-mini-bock" aria-hidden="true">${ik('bock')}</span></span>
                <span class="mk-bild-text"><small>${String(i + 1).padStart(2, '0')}</small><span>${e(b.namn)}</span>${MK_EXTRA[b.id] ? `<em>${e(MK_EXTRA[b.id])}</em>` : ''}</span></label>
              <button class="mk-bild-start" type="button" data-g="starta-mote-bild" data-bild="${e(b.id)}" aria-label="Starta på bild ${i + 1}: ${e(b.namn)}" title="Starta på den här bilden">${MK_SPELA}</button></li>`).join('')}
          <li class="mk-tips"><p class="mk-tips-rubrik">I mötet</p>
            <p class="mk-tips-mus"><span class="mk-tangenter"><kbd aria-label="Pil vänster">←</kbd><kbd aria-label="Pil höger">→</kbd></span>byter bild</p>
            <p class="mk-tips-mus"><span class="mk-tangenter"><kbd>K</kbd></span>hoppar till kalkylen</p>
            <p class="mk-tips-mus"><span class="mk-tangenter"><kbd>Esc</kbd></span>lämnar helskärmen – en gång till avslutar</p>
            <p class="mk-tips-pek">Svep åt sidan för att byta bild – kalkylen har en egen knapp överst.</p></li></ol>
        </section>`;
  };
  // Dockan: vem mötet gäller + kalkylen + startknappen. Den följer med längst ner och vilar medan hjältens knappar syns (motescen.js).
  // Bara namnet – affären och vad som sparas står i dossiern, antalet bilder på startknappen.
  const moteDockaVem = () => {
    const k = moteUi.kundId ? kund(moteUi.kundId) : null;
    return k ? `<span class="mk-avatar" aria-hidden="true">${e(initialer(k.namn))}</span><span class="mk-docka-text"><small>Mötet gäller</small><strong>${e(k.namn)}</strong></span>`
      : `<span class="mk-avatar mk-avatar-u" aria-hidden="true">${ik('presentation')}</span><span class="mk-docka-text"><small>Mötet gäller</small><strong>Generell presentation</strong></span>`;
  };
  function visaMote() {
    requestAnimationFrame(moteEfterRitning); // läget efter presentationen och dockans vakna-läge (se startaMote)
    const bilder = window.UPMote ? UPMote.BILDER : [];
    const nValda = moteUi.bilder ? bilder.filter((b) => moteUi.bilder.includes(b.id)).length : bilder.length;
    return `<div class="sidhuvud"><div><span class="overrad">Kundmöte</span><h1>Kundmöte</h1><p>Presentera Uperformance och räkna fram upplägget live – priserna syns bara här i CRM:et, inte på webbplatsen.</p></div></div>
      <form class="mote-start mk" id="mote-plan" data-form="starta-mote" aria-labelledby="mk-h" ${nValda ? '' : 'data-inga-bilder'}>
        <header class="mk-huvud"><p class="mk-ogon">Planera mötet</p><h2 id="mk-h" tabindex="-1">Tre steg – sedan är det <em>din tur.</em></h2>
          <p class="mk-ingress">Presentationen startar i helskärm – när du avslutar är du tillbaka här. Sparar du kalkylen landar du på affären.</p></header>
        <div class="mk-rad">${moteVemHtml()}${inforMoteHtml()}</div>
        <div class="mk-slut">${moteBilderHtml(bilder)}
        <div class="mk-docka-ram"><div class="mk-docka" data-mk-docka>
          <div class="mk-docka-vem" data-mk-vem>${moteDockaVem()}</div>
          <div class="mk-docka-knappar">
            ${window.UPInspelning && UPInspelning.stod() ? `<span data-insp-kund="${e(moteUi.kundId || '')}" data-insp-affar="${e(moteUi.affarId || '')}">${UPInspelning.knappHtml()}</span>` : ''}<button class="mk-knapp mk-knapp-glas" type="button" data-g="starta-mote-kalkyl">${MK_KALKYL}<span class="mk-knapp-text">Öppna kalkylen</span></button>
            <button class="mk-knapp mk-knapp-mint" type="submit" data-mk-start aria-disabled="${!nValda}">${MK_SPELA}<span class="mk-start-text">Starta<span class="mk-bara-bred"> presentation</span></span><span class="mk-start-inga">Välj minst en bild</span><span class="mk-knapp-tal" data-bildval-tal>${moteBildTal(nValda, bilder.length)}</span></button>
          </div></div></div></div>
      </form>`;
  }
  // Steg 1: kortet väljer kund och affär i rullistorna och skickar samma händelse som ett val där (mötesscenen lyssnar på den)
  const valjMoteKund = (kundId, affarId) => {
    const f = $('form[data-form="starta-mote"]', vy); if (!f) return;
    const a = affarId ? affar(affarId) : null;
    moteUi.kundId = kundId; moteUi.fokus = affarId;
    moteUi.affarId = a && kanRaknaLive(a) ? a.id : moteAffarFor(kundId, null) || '';
    f.kundId.value = kundId;
    f.kundId.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Efter ett val: rullistan för affär, korten, dossiern och dockan följer moteUi (bildremsan rörs inte)
  const moteUppdatera = () => {
    const f = $('form[data-form="starta-mote"]', vy); if (!f) return;
    if (f.kundId.value !== moteUi.kundId) f.kundId.value = moteUi.kundId;
    f.affarId.innerHTML = moteAffarAlternativ(moteUi.kundId, moteUi.affarId); f.affarId.disabled = !moteUi.kundId;
    const falt = $('[data-mk-affar-falt]', f); if (falt) falt.hidden = !moteUi.kundId;
    const hint = $('[data-mk-hint]', f); if (hint) hint.hidden = !moteUi.affarId;
    const vald = moteKortVald(moteVantar());
    const kort = $$('.mk-kund', f);
    kort.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.kund ? b.dataset.affar === vald : !moteUi.kundId)));
    const tabb = kort.find((b) => b.getAttribute('aria-checked') === 'true') || kort[0];
    kort.forEach((b) => { b.tabIndex = b === tabb ? 0 : -1; });
    const p = $('[data-infor-innehall]', f); if (p) { p.innerHTML = inforInnehall(); p.setAttribute('data-byt', ''); } // data-byt: det nya innehållet tonar in
    const v = $('[data-mk-vem]', f); if (v) v.innerHTML = moteDockaVem();
  };
  // Tillbaka från presentationen: samma rullning och fokus på knappen man startade från. mote.js ritar om vyn när mötet
  // avslutas, och hjälten (motescen.js) sätts in först efteråt – därför återställs läget i nästa bildruta (moteAterstall i visaMote).
  // fran = knappens väljare om fokus inte står på den (Safari fokuserar inte knappar vid klick, hjältens knappar klickar dockans).
  let moteAter = null;
  const MOTE_STARTKNAPP = '[data-mk-start], .mk-bild-start, [data-g="starta-mote-kalkyl"], [data-ms="starta"], [data-ms="kalkyl"]';
  const moteMal = (el) => {
    if (!el || !el.matches || !vy.contains(el) || !el.matches(MOTE_STARTKNAPP)) return '';
    if (el.matches('[data-mk-start]')) return '[data-mk-start]';
    if (el.matches('.mk-bild-start')) return `.mk-bild-start[data-bild="${sel(el.dataset.bild)}"]`;
    return el.dataset.ms ? `[data-ms="${sel(el.dataset.ms)}"]` : `.mk-docka [data-g="${sel(el.dataset.g)}"]`;
  };
  // Hjältens knappar (data-ms) kan komma några bildrutor efter vyn – då väntar vi in dem en stund, sedan dockans startknapp eller vyn
  // (förut hamnade fokus på body när knappen inte fanns ännu)
  const moteAterstall = (forsok = 0) => {
    if (!moteAter || $('.mote:not([data-stanger])')) return; // presentationen är fortfarande öppen
    const { y, mal } = moteAter;
    if (location.hash !== '#/mote' || vy.classList.contains('vy-in')) { moteAter = null; return; } // sparat och vidare till affären, eller ny vy: börjar överst
    if (!forsok) scrollTo({ top: y, behavior: 'instant' });
    const k = mal && $(mal, vy);
    if (!k && mal && forsok < 12) { requestAnimationFrame(() => moteAterstall(forsok + 1)); return; }
    moteAter = null;
    (k || $('[data-mk-start]', vy) || vy).focus({ preventScroll: true });
  };
  // Mobilen: dockan vaknar först när bildremsan är i bild (sidor.css 09, .mk[data-docka-vaken]) – annars låg den över rubriken
  // "3 Presentationen" och mellan korten i steg 1 och 2. Första läget sätts direkt (ingen tonning när vyn ritas om).
  const MK_DOCKA_MARGINAL = 170; // dockan + flikraden längst ner
  const moteDockObs = 'IntersectionObserver' in window ? new IntersectionObserver((poster) => {
    const p = poster[poster.length - 1]; const f = p.target.isConnected && p.target.closest('.mk'); if (f) f.toggleAttribute('data-docka-vaken', p.isIntersecting);
  }, { rootMargin: `0px 0px -${MK_DOCKA_MARGINAL}px 0px` }) : null;
  const moteEfterRitning = () => {
    moteAterstall();
    const r = $('.mk-remsa', vy); const f = r && r.closest('.mk'); if (!f) return;
    const b = r.getBoundingClientRect(); f.toggleAttribute('data-docka-vaken', !moteDockObs || (b.top < innerHeight - MK_DOCKA_MARGINAL && b.bottom > 0));
    if (moteDockObs) { moteDockObs.disconnect(); moteDockObs.observe(r); }
  };
  const startaMote = (opt, fran = '') => {
    if (!window.UPMote) { toast('Presentationen laddas – försök igen'); return; }
    moteAter = location.hash === '#/mote' ? { y: scrollY, mal: moteMal(document.activeElement) || fran } : null;
    UPMote.starta(opt);
  };
  /* "Hur gick mötet?" (2026-10-24): mote.js öppnar arket när presentationen avslutas med en kund, minst ett bildbyte och inget som
     redan loggats som möte under presentationen (sparad kalkyl eller inspelning) – förut syntes ett hållet möte ingenstans. Spara
     ger en aktivitet av typen möte (tidslinjen, Möten hållna, kundresans Första mötet, chefens möten), en ev. uppföljning i Att göra
     och – när affären står i Ny kontakt – flytten till Kundbesök. Hoppa över sparar inget. Samma utseende som Snabbregistrera. */
  function oppnaMoteLogg({ kundId, affarId = null, visade = 0, alla = 0, minuter = 1, id = '' } = {}) {
    const k = kund(kundId); if (!k || ark.open) return;
    const oppna = affarerFor(k.id).filter(arOppen);
    const a = (affarId && oppna.find((x) => x.id === affarId)) || (oppna.length === 1 ? oppna[0] : null);
    const omfang = `${visade >= alla ? `alla ${alla} bilderna` : `${visade} av ${alla} bilder`} på ${plural(minuter, 'minut', 'minuter')}`;
    oppnaArk(`${snabbTopp('Hur gick mötet?', `${k.namn} – du visade ${omfang}. Spara mötet så står det i tidslinjen och räknas i Möten hållna.`)}
      <div class="snabb-yta"><form data-form="mote-logg" class="ark-kropp" data-kund="${e(k.id)}" data-affar="${e(a ? a.id : '')}" data-id="${e(id)}" data-omfang="${e(omfang)}" novalidate>
        <label><span class="etikett">Vad kom ni fram till? <em>(valfritt)</em></span><textarea class="falt" name="text" rows="3" maxlength="2000" placeholder="Intresse, frågor och vad ni kom överens om"></textarea></label>
        <div class="snabb-folj"><label class="kryss"><input type="checkbox" name="folj"><span>Skapa att göra för uppföljning<small>Hamnar i din lista det datum du väljer</small></span></label>
          <input type="hidden" name="datum" value="${omDagar(3)}" data-utkast>${datumSnabbval('datum', omDagar(3), { etikett: 'Följ upp', aktiv: false })}</div>
        ${a && a.steg === 'kontakt' ? `<label class="kryss"><input type="checkbox" name="flytta" checked><span>Flytta ${e(a.titel)} till Kundbesök<small>Affären står i Ny kontakt – mötet är hållet</small></span></label>` : ''}
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Hoppa över</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}<span>Spara mötet</span></button></div></div>`);
  }
  // Korten i steg 1 är en radiogrupp: pilarna (och Home/End) flyttar fokus och valet, Tab går vidare ut ur gruppen
  vy.addEventListener('keydown', (ev) => {
    const b = ev.target.closest && ev.target.closest('.mk-kunder [role="radio"]'); if (!b || ev.target !== b || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const alla = $$('[role="radio"]', b.parentElement); const i = alla.indexOf(b);
    const steg = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    const mal = ev.key === 'Home' ? 0 : ev.key === 'End' ? alla.length - 1 : steg ? (i + steg + alla.length) % alla.length : -1;
    if (mal < 0) return;
    ev.preventDefault(); alla[mal].focus(); if (alla[mal].getAttribute('aria-checked') !== 'true') alla[mal].click();
  });
  // Inga bilder valda: startknappen säger "Välj minst en bild" – ett tryck leder till bildremsan (ingen toast över dockan)
  const moteVisaRemsan = (f) => {
    const s = $('.mk-bilder', f); if (!s) return;
    s.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    const k = $('[data-g="bildval"][data-alla="1"]', s); if (k) k.focus({ preventScroll: true });
  };

  /* 10c-användare: bara för administratörer i skarpt läge ---------------------------------- */
  /* Loggen filtreras på servern (GET /api/admin/logg, 2026-10-24): typ (segmentet), person, kund, datum och om "hämtade CRM-datan"
     ska med (som standard inte – det är sidans egen inläsning). loggF är filtret, inloggIdag räknar misslyckade inloggningar idag. */
  const adminUi = { anvandare: null, logg: null, loggSlut: false, fel: '', loggFilter: 'alla', bjudFel: '', loggF: { vem: '', kund: '', fran: '', till: '', hamtningar: false }, inloggIdag: null };
  // Verbet står ensamt – substantivet (kund, användare …) kommer från SAMLINGNAMN
  const HANDLING = {
    skapa: 'skapade', andra: 'ändrade', radera: 'raderade', lasa: 'öppnade', 'lasa-allt': 'hämtade CRM-datan', 'fil-lasa': 'öppnade en fil', 'fil-upp': 'laddade upp en fil',
    'begar-kod': 'bad om inloggningskod', 'logga-in': 'loggade in', 'logga-in-misslyckad': 'misslyckades med att logga in', 'logga-ut': 'loggade ut',
    'anvandare-skapa': 'bjöd in', 'anvandare-andra': 'ändrade', aterstall: 'återställde exempeldatan', export: 'exporterade datan',
    makulera: 'makulerade', 'konto-sparrat': 'fick kontot tillfälligt spärrat (för många felaktiga koder)', seed: 'skapade exempeldatan',
    'konto-andra': 'ändrade status eller profil för', 'franvaro-ny': 'lade in frånvaro för', 'franvaro-andra': 'ändrade frånvaro för',
    'franvaro-bort': 'tog bort frånvaro för', 'franvaro-beslut': 'beslutade om ledighet för', 'sessioner-avsluta': 'loggade ut',
    'hav-sparr': 'hävde kontospärren för', 'inbjudan-igen': 'skickade inbjudan igen till', 'logg-export': 'exporterade loggen (CSV)',
    registerutdrag: 'tog fram ett registerutdrag', godkann: 'godkände offerten', signera: 'signerade ordern', skanning: 'körde säkerhetsskanningen',
    'fil-blockerad': 'fick en fil stoppad av filkontrollen', 'fil-varning': 'fick en varning från filskannern', installning: 'ändrade en inställning', rensning: 'rensade',
    'halsa-kontaktad': 'markerade en deltagare som kontaktad i', 'halsa-kontaktad-bort': 'tog bort markeringen kontaktad i',
  };
  // Handlingar där posten står i texten utan samlingens namn ("godkände offerten UP-2026-0101 (Bergmark)")
  const UTAN_SAMLING = new Set(['godkann', 'signera']);
  const SAMLINGNAMN = { kunder: 'kund', affarer: 'affär', projekt: 'projekt', aktiviteter: 'aktivitet', todos: 'att göra', dokument: 'dokument', kundlankar: 'kundlänk', offerter: 'offert/order', halsoformular: 'hälsoformulär', anvandare: 'användare' };
  const LOGG_TYPER = [['alla', 'Alla'], ['andring', 'Ändringar'], ['kund', 'Kunden'], ['inloggning', 'Inloggning'], ['sakerhet', 'Säkerhet']];
  const ROLLNAMN = { salj: 'Sälj', test: 'Testteam', admin: 'Admin (systemkonto)' };
  const INLOGG_FEL = { 'fel-kod': 'fel kod', 'kod-utgangen': 'koden hade gått ut' };
  /* Serverns detalj i klartext: "roll: test, aktiv: false" → "roll Testteam, inaktiverade kontot". Webbläsarens namn (User-Agent) vid
     inloggning och öppning visas inte här (det står i CSV-exporten), och registerutdragets sökord visas inte – bara antalet träffar. */
  function loggDetalj(x) {
    const d = String(x.detalj || '');
    if (!d || ['lasa', 'fil-lasa', 'logga-in'].includes(x.handling)) return '';
    if (x.handling === 'anvandare-andra') {
      return d.split(', ').map((del) => {
        const i = del.indexOf(': '); const k = del.slice(0, i); const v = del.slice(i + 2);
        if (k === 'roll') return `roll ${ROLLNAMN[v] || v}`;
        if (k === 'aktiv') return v === 'true' ? 'aktiverade kontot' : 'inaktiverade kontot';
        if (k === 'admin') return v === 'true' ? 'gav administratörsbehörighet' : 'tog bort administratörsbehörigheten';
        if (k === 'chef') return v === 'true' ? 'gjorde till försäljningschef' : 'inte längre försäljningschef';
        if (k === 'namn') return `nytt namn: ${v}`;
        if (k === 'kort') return `kortnamn: ${v}`;
        return '';
      }).filter(Boolean).join(', ');
    }
    if (x.handling === 'anvandare-skapa') return d.replace(/^roll (\w+)/, (_, r) => `som ${ROLLNAMN[r] || r}`);
    if (x.handling === 'logga-in-misslyckad') return INLOGG_FEL[d] || d;
    if (x.handling === 'registerutdrag') { const m = d.match(/(\d+) träffar$/); return m ? `${m[1]} träffar` : ''; }
    if (x.handling === 'godkann' || x.handling === 'signera') return '';
    // "UP-O-2026-0201 (signerad): Fel antal deltagare" – numret står redan i raden
    if (x.handling === 'makulera') { const m = d.match(/^\S*\s*\(([^)]*)\)(?::\s*(.*))?$/); if (m) return [{ godkand: 'var godkänd', signerad: 'var signerad' }[m[1]] || '', m[2] || ''].filter(Boolean).join(' – '); }
    return d;
  }
  // En loggrad som en mening (säkerhetsloggen i sakerhet.js använder samma text)
  const loggText = (x) => {
    const post = x.samling && x.postId ? postNamn(x.samling, x.postId) : '';
    const detalj = loggDetalj(x);
    return `${vemText(x.vem)} ${HANDLING[x.handling] || x.handling}${post ? ` ${UTAN_SAMLING.has(x.handling) ? '' : `${SAMLINGNAMN[x.samling] || x.samling} `}${post}` : ''}${detalj ? `: ${detalj}` : ''}`;
  };
  const ADMINFEL = { 'sista-admin': 'Det måste finnas minst en aktiv administratör.', 'sig-sjalv': 'Du kan inte inaktivera dig själv.', finns: 'Det finns redan en användare med den e-postadressen.', behorighet: 'Bara administratörer kan ändra användare.' };
  const vemText = (vem) => {
    const v = String(vem || '');
    if (v === 'kund') return 'Kund';
    if (v === 'system') return 'System';
    if (v.startsWith('personal:')) return `${anv(v.slice(9)).namn} (förhandsvisning)`;
    return anv(v).namn === 'Okänd' ? v : anv(v).namn;
  };
  const kortNyckel = (id) => { const s = String(id || ''); return s.length > 14 ? s.slice(0, 6) + '…' : s; };
  // Namnet på posten i stället för dess id, när posten finns i CRM:et (hälsoformulär visas aldrig med namn)
  const postNamn = (samling, id) => {
    const s = String(id || ''); if (!s) return '';
    const kort = (t) => (t.length > 48 ? t.slice(0, 48) + '…' : t);
    if (samling === 'kunder') { const k = kund(s); if (k) return k.namn; }
    if (samling === 'affarer') { const a = affar(s); if (a) return `${a.titel} (${kundNamn(a.kundId)})`; }
    if (samling === 'projekt') { const p = projekt(s); if (p) return kundNamn(p.kundId); }
    if (samling === 'todos') { const t = db.todos.find((x) => x.id === s); if (t) return `”${kort(t.text)}”`; }
    if (samling === 'anvandare') { const u = (adminUi.anvandare || []).find((x) => x.id === s) || db.anvandare.find((x) => x.id === s); if (u) return u.namn; }
    if (samling === 'offerter') { const d = db.offerter[s]; if (d) return `${d.nummer} (${kundNamn(d.kundId)})`; }
    if (samling === 'kundlankar') { const l = db.kundlankar[s]; if (l) return `till ${kundNamn(l.kundId)}`; }
    if (samling === 'dokument') { const d = db.dokument.find((x) => x.id === s); if (d) return d.namn; }
    if (samling === 'aktiviteter') { const x = db.aktiviteter.find((y) => y.id === s); if (x) return `på ${kundNamn(x.kundId)}`; }
    return kortNyckel(s);
  };
  const teamListaHtml = () => `<div class="anvlista">${db.anvandare.filter(arAktiv).map((u) => `<div class="anvrad anvrad-enkel"><span class="avatar ${u.roll === 'test' ? 'avatar-test' : ''}" aria-hidden="true">${e(u.initialer)}</span><span class="anvrad-text"><strong>${e(u.namn)}${u.id === jag ? ' <span class="chip chip-ok">Du</span>' : ''}${u.admin ? ` <span class="chip chip-navy">${emo(UPEMO.roll.admin)}Admin</span>` : ''}</strong><small>${emo(UPEMO.roll[u.roll === 'test' ? 'test' : u.roll === 'admin' ? 'admin' : 'salj'])}${u.roll === 'test' ? 'Testteam' : u.roll === 'admin' ? 'Systemkonto (admin)' : 'Sälj &amp; relation'}${u.chef ? ' · Försäljningschef' : ''}</small></span></div>`).join('')}</div>`;
  // Teamets rakna: antalet administratörer (antalet aktiva står redan i hjältens glaskort)
  const adminAntalText = () => (adminUi.anvandare ? plural(adminUi.anvandare.filter((u) => arAktiv(u) && u.admin).length, 'administratör', 'administratörer') : '');
  function visaAnvandare() {
    const hjalte = (text, extra, knappar = '') => sidhjalte({ ogon: 'Konto och team', titel: 'Användare', klass: 'sidhjalte-anvandare', text, knappar, extra });
    if (!SKARP || !arAdmin()) {
      // Demoläget och personal utan admin: förklaringen i hjälten, teamet under (rollerna räknade ur samma lista)
      const text = !SKARP ? 'Vilka som kan logga in i CRM:et. I den skarpa versionen bjuder en administratör in teamet här – inloggning med e-post och engångskod, inga lösenord att komma ihåg.'
        : 'Vilka som kan logga in i CRM:et – med e-post och engångskod, inga lösenord. Bara administratörer bjuder in och ändrar roller: fråga någon med admin-märket nedan.';
      const team = db.anvandare.filter(arAktiv);
      const tal = [
        glasKort({ emo: UPEMO.sak.team, etikett: 'Teamet', varde: team.length, under: 'aktiva konton' }),
        glasKort({ emo: UPEMO.roll.salj, etikett: 'Sälj & relation', varde: team.filter((u) => u.roll === 'salj').length, under: 'säljare' }),
        glasKort({ emo: UPEMO.roll.test, etikett: 'Testteam', varde: team.filter((u) => u.roll === 'test').length, under: 'testansvariga' }),
      ];
      return `${hjalte(text, `<div class="sidhjalte-tal" data-antal="3">${tal.join('')}</div>`, '<a class="knapp knapp-kontur" href="#/">Till översikten</a>')}
        <section class="kort anv-team-kort"><div class="kort-huvud"><h2>${emo(UPEMO.sak.team, { ruta: 'm' })}Teamet</h2><span class="rakna">${e(plural(team.filter((u) => u.admin).length, 'administratör', 'administratörer'))}</span></div>${teamListaHtml()}</section>`;
    }
    return `${hjalte('Vilka som kan logga in i CRM:et. Inloggningen sker med e-post och engångskod – inga lösenord att komma ihåg.', `<div class="sidhjalte-tal" data-antal="3" data-admin-lage>${adminLageHtml()}</div>`)}
      <div class="rutnat-2 admin-rutnat">
        <div>
          <section class="kort admin-team"><div class="kort-huvud"><h2>${emo(UPEMO.sak.team, { ruta: 'm' })}Teamet</h2><span class="rakna" data-admin-antal>${e(adminAntalText())}</span></div><div class="anvlista" data-admin-lista>${adminListaHtml()}</div></section>
          <section class="kort admin-logg"><div class="kort-huvud"><h2>${ik('klocka')}Senaste händelser</h2><a class="knapp knapp-spok knapp-liten" href="${e(L.admin.loggCsv(loggOpt()) || '#/anvandare')}" download data-logg-csv title="Loggen som CSV (Excel) med filtret nedan – exporten loggas">${ik('ladda-ner')}Exportera loggen</a></div>
            <div class="segment loggfilter" role="group" aria-label="Visa händelser">${LOGG_TYPER.map(([id, t]) => `<button type="button" aria-pressed="${adminUi.loggFilter === id}" data-g="admin-loggfilter" data-filter="${id}">${t}</button>`).join('')}</div>
            ${loggFilterHtml()}
            <div data-admin-logg>${adminLoggHtml()}</div></section>
        </div>
        <div data-sticky-kolumn>
          <section class="kort admin-bjud"><div class="kort-huvud"><h3>${ik('plus')}Bjud in</h3></div>
            <form class="kort-inre falt-grupp" data-form="bjud-in">
              <label><span class="etikett">Namn<span class="krav">*</span></span><input class="falt" name="namn" required data-fel="Skriv namnet – minst 2 tecken" minlength="2" maxlength="100" autocomplete="off"></label>
              <label><span class="etikett">E-post<span class="krav">*</span></span><input class="falt" type="email" name="epost" required data-fel="Skriv en giltig e-postadress, t.ex. namn@foretag.se" maxlength="254" autocomplete="off" inputmode="email" ${adminUi.bjudFel ? 'aria-invalid="true" aria-describedby="bjud-fel"' : ''}>${adminUi.bjudFel ? `<p class="falt-fel" id="bjud-fel" role="alert">${e(adminUi.bjudFel)}</p>` : ''}</label>
              <label><span class="etikett">Roll</span><select class="falt" name="roll"><option value="salj">Sälj &amp; relation</option><option value="test">Testteam</option><option value="admin">Admin (systemkonto, inte säljare)</option></select></label>
              <label class="kryss"><input type="checkbox" name="chef"><span>Försäljningschef<small>Ser teamets försäljning, sätter mål och godkänner ledighet</small></span></label>
              <label class="kryss"><input type="checkbox" name="admin"><span>Administratör<small>Kan bjuda in, ändra roller och inaktivera konton</small></span></label>
              <div><button class="knapp knapp-accent" type="submit">${ik('mejl')}Skicka inbjudan</button></div>
              <p class="falt-hint" style="margin:0">${L.lage.miljo === 'lokal' ? 'Lokalt skickas ingen e-post – inbjudan hamnar som fil i serverns utkorg (sökvägen står i konsolen när servern startar).' : 'Personen får ett mejl med länk till inloggningen.'}</p>
            </form></section>
          <section class="kort admin-register"><div class="kort-huvud"><h3>${ik('sok')}Registerutdrag</h3></div>
            <form class="kort-inre falt-grupp" data-form="registerutdrag" novalidate>
              <p class="falt-hint" style="margin:0">Var en kontaktperson eller deltagare finns i CRM:et (GDPR) – sök på e-post, telefon, personnummer eller namn. Hälsosvar tas inte med.</p>
              <label><span class="etikett">Söker efter</span><input class="falt" name="q" type="search" minlength="3" maxlength="200" autocomplete="off" placeholder="namn@foretag.se"></label>
              <div><button class="knapp knapp-kontur" type="submit">${ik('sok')}Sök</button></div>
              <div data-register-svar></div>
              <p class="falt-hint" style="margin:0">Rättelse görs i kundkortet eller kundlänken. Radering per person är inte byggd än – först ska det bestämmas vad som måste sparas (t.ex. signerade ordrar).</p>
            </form></section>
          ${kanAterstalla() ? `<section class="kort admin-testmiljo"><div class="kort-huvud"><h3>${ik('aterstall')}Testmiljö</h3></div><div class="kort-inre falt-grupp">
            <p style="color:var(--text-2);font-size:.9rem">Ersätt kunder, affärer, projekt och allt annat med exempeldatan. Användarna påverkas inte och en säkerhetskopia tas först.</p>
            <div><button class="knapp knapp-kontur" type="button" data-g="aterstall">${ik('aterstall')}Återställ exempeldata</button></div></div></section>` : ''}
        </div>
      </div>`;
  }
  // Läget (glaskorten i hjälten, [data-admin-lage]): räknas fram ur användarlistan och den hämtade loggen
  function adminLageHtml() {
    const lista = adminUi.anvandare;
    const etiketter = [[UPEMO.sak.team, 'Aktiva konton'], [UPEMO.sak.kontakt, 'Inloggade'], [UPEMO.sak.varning, 'Misslyckade']];
    if (!lista) return etiketter.map(([em, t]) => `<div class="glas" data-hamtar><span class="glas-etikett">${emo(em, { ruta: 's' })}${e(t)}</span><strong class="glas-varde">–</strong><span class="glas-under">Hämtar …</span></div>`).join('');
    const aktivaN = lista.filter(arAktiv).length; const inaktiva = lista.length - aktivaN;
    const vecka = lista.filter((u) => u.senastInloggad && Date.now() - new Date(u.senastInloggad) < 7 * 864e5).length;
    // Dagens inloggningshändelser hämtas för sig (listan nedan kan vara filtrerad) – högst 200, annars "(minst)"
    const idagRader = adminUi.inloggIdag || [];
    const misslyckade = idagRader.filter((x) => x.handling === 'logga-in-misslyckad').length;
    const komplett = !!adminUi.inloggIdag && idagRader.length < 200;
    return glasKort({ emo: etiketter[0][0], etikett: etiketter[0][1], varde: aktivaN, under: inaktiva ? `${plural(inaktiva, 'inaktiverat', 'inaktiverade')}` : 'alla kan logga in' })
      + glasKort({ emo: etiketter[1][0], etikett: etiketter[1][1], varde: vecka, under: 'senaste 7 dygnen' })
      + glasKort({ emo: etiketter[2][0], etikett: etiketter[2][1], varde: misslyckade, under: `inloggningar idag${komplett ? '' : ' (minst)'}`, ton: misslyckade > 0 ? 'rod' : '' });
  }
  function adminListaHtml() {
    if (adminUi.fel) return `<div class="tomt">${e(adminUi.fel)} <button class="knapp knapp-spok knapp-liten" type="button" data-g="admin-ladda">Försök igen</button></div>`;
    if (!adminUi.anvandare) return '<p class="hamtar">Hämtar användare …</p>';
    return adminUi.anvandare.map((u) => {
      const du = u.id === jag; const aktiv = arAktiv(u); const system = u.roll === 'admin';
      const nyss = u.senastInloggad && Date.now() - new Date(u.senastInloggad) < 36e5;
      const senast = u.senastAktiv && (!u.senastInloggad || u.senastAktiv > u.senastInloggad) ? `senast aktiv ${relTid(u.senastAktiv)}` : u.senastInloggad ? `senast inloggad ${relTid(u.senastInloggad)}` : 'har inte loggat in än';
      return `<div class="anvrad" ${aktiv ? '' : 'data-inaktiv'}>
        <span class="avatar ${u.roll === 'test' ? 'avatar-test' : ''}" aria-hidden="true">${e(u.initialer)}</span>
        <span class="anvrad-text"><strong>${e(u.namn)}${du ? ' <span class="chip chip-ok">Du</span>' : ''}${u.admin ? ` <span class="chip chip-navy">${emo(UPEMO.roll.admin)}Admin</span>` : ''}${u.chef ? ' <span class="chip chip-navy">Försäljningschef</span>' : ''}${aktiv ? '' : ' <span class="chip chip-rod">Inaktiv</span>'}${u.sparradSek ? ` <span class="chip chip-rod" title="För många felaktiga koder – hävs automatiskt om ${e(Math.ceil(u.sparradSek / 60))} min">Spärrad</span>` : ''}</strong>
          <small>${e(u.epost)} · <span class="inloggad-prick" ${nyss ? 'data-nyss' : ''} aria-hidden="true"></span>${e(senast)}${u.sessioner ? ` · ${e(plural(u.sessioner, 'inloggad enhet', 'inloggade enheter'))}` : ''}</small></span>
        <span class="anvrad-val">
          <select class="falt anvrad-roll" data-anv-roll="${e(u.id)}" aria-label="Roll för ${e(u.namn)}" ${du && system ? 'disabled' : ''}>${[['salj', 'Sälj'], ['test', 'Testteam'], ['admin', 'Admin (systemkonto)']].map(([v, t]) => `<option value="${v}" ${u.roll === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <label class="kryss anvrad-admin" title="Försäljningschef: ser teamets försäljning (Försäljning), sätter mål och godkänner ledighet"><input type="checkbox" data-anv-chef="${e(u.id)}" ${u.chef ? 'checked' : ''} ${system ? 'disabled' : ''}><span>Försäljningschef</span></label>
          <label class="kryss anvrad-admin"><input type="checkbox" data-anv-admin="${e(u.id)}" ${u.admin ? 'checked' : ''} ${du || system ? 'disabled' : ''}><span>Admin</span></label>
          <button class="knapp knapp-spok knapp-liten" type="button" data-g="anv-konto" data-id="${e(u.id)}" title="Inloggningar, spärr och inbjudan för ${e(u.namn)}">${ik('nyckel')}Inloggning</button>
          ${du ? '' : `<button class="knapp ${aktiv ? 'knapp-spok' : 'knapp-kontur'} knapp-liten" type="button" data-g="anv-aktiv" data-id="${e(u.id)}" data-aktiv="${aktiv ? '0' : '1'}">${aktiv ? 'Inaktivera' : 'Aktivera'}</button>`}
        </span></div>`;
    }).join('') || tom('Inga användare.');
  }
  // Filtret som serverns logg tar (lager.js loggFraga): typen från segmentet, resten från raden under det
  const loggOpt = (extra = {}) => {
    const f = adminUi.loggF;
    return { typ: adminUi.loggFilter === 'alla' ? '' : adminUi.loggFilter, vem: f.vem, kund: f.kund, fran: f.fran, till: f.till, utanHamtningar: !f.hamtningar, ...extra };
  };
  const loggFiltrerad = () => { const f = adminUi.loggF; return adminUi.loggFilter !== 'alla' || !!(f.vem || f.kund || f.fran || f.till); };
  function loggFilterHtml() {
    const f = adminUi.loggF;
    const personer = [...(adminUi.anvandare || db.anvandare)].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
    const kunder = [...db.kunder].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
    const val = (v, t, vald) => `<option value="${e(v)}" ${vald === v ? 'selected' : ''}>${e(t)}</option>`;
    return `<div class="loggfilter-rad" data-logg-filter>
      <label><span class="etikett">Person</span><select class="falt" data-logg-f="vem" aria-label="Visa händelser för person">${val('', 'Alla personer', f.vem)}${val('kund', 'Kunden (kundsidorna)', f.vem)}${personer.map((u) => val(u.id, u.namn, f.vem)).join('')}${val('system', 'System', f.vem)}</select></label>
      <label><span class="etikett">Kund</span><select class="falt" data-logg-f="kund" aria-label="Visa händelser för kund">${val('', 'Alla kunder', f.kund)}${kunder.map((k) => val(k.id, k.namn, f.kund)).join('')}</select></label>
      <label><span class="etikett">Från</span><input class="falt" type="date" data-logg-f="fran" value="${e(f.fran)}" max="${e(f.till || idag())}" aria-label="Från och med"></label>
      <label><span class="etikett">Till</span><input class="falt" type="date" data-logg-f="till" value="${e(f.till)}" ${f.fran ? `min="${e(f.fran)}"` : ''} max="${e(idag())}" aria-label="Till och med"></label>
      </div>
      <div class="loggfilter-fot"><label class="kryss"><input type="checkbox" data-logg-f="hamtningar" ${f.hamtningar ? 'checked' : ''}><span>Visa när CRM:et hämtar datan</span></label>
        <button class="knapp knapp-spok knapp-liten" type="button" data-g="admin-logg-rensa" data-logg-rensa ${loggFiltrerad() || f.hamtningar ? '' : 'hidden'}>${ik('stang')}Rensa filtret</button></div>`;
  }
  function adminLoggHtml() {
    if (!adminUi.logg) return '<p class="hamtar">Hämtar …</p>';
    // Kundens godkännande/signering och administratörens makulering står som egna rader – ändringen av samma dokument i samma
    // stund (servern loggar den också) visas inte två gånger
    const klara = adminUi.logg.filter((x) => UTAN_SAMLING.has(x.handling) || x.handling === 'makulera');
    const synliga = adminUi.logg.filter((x) => !(x.handling === 'andra' && x.samling === 'offerter' && klara.some((y) => y.postId === x.postId && Math.abs(Date.parse(y.tid) - Date.parse(x.tid)) < 10000)));
    if (!synliga.length) return tom(loggFiltrerad() ? 'Inga händelser med det filtret.' : 'Inga händelser ännu.');
    // Slå ihop samma person, handling och post under samma dag – oavsett vad som hände emellan ("ändrade kundlänk … · 35 gånger")
    const grupper = new Map(); const rader = [];
    synliga.forEach((x) => {
      const nyck = `${x.vem}|${x.handling}|${x.samling || ''}|${x.postId || ''}|${lokalISO(new Date(x.tid))}`;
      const g = grupper.get(nyck);
      if (g) { g.antal++; g.forst = x.tid; } else { const ny = { x, antal: 1, forst: x.tid }; grupper.set(nyck, ny); rader.push(ny); }
    });
    const klock = (t) => new Date(t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    let dag = ''; let html = '';
    rader.forEach(({ x, antal, forst }) => {
      const d = lokalISO(new Date(x.tid));
      if (d !== dag) { dag = d; html += `<p class="logg-dag">${e(datumText(d, { ar: true }))}</p>`; }
      const misslyckad = ['logga-in-misslyckad', 'konto-sparrat', 'fil-blockerad'].includes(x.handling);
      const post = x.samling && x.postId ? postNamn(x.samling, x.postId) : '';
      const detalj = loggDetalj(x);
      const spann = antal > 1 && klock(forst) !== klock(x.tid) ? ` (${klock(forst)}–${klock(x.tid)})` : '';
      html += `<div class="loggrad" ${misslyckad ? 'data-varning' : ''}><span class="loggrad-tid" title="${e(new Date(x.tid).toLocaleString('sv-SE'))}">${e(klock(x.tid))}</span>
        <span class="loggrad-text"><strong>${e(vemText(x.vem))}</strong> ${e(HANDLING[x.handling] || x.handling)}${post || (x.samling && !UTAN_SAMLING.has(x.handling)) ? ` <small>${UTAN_SAMLING.has(x.handling) ? '' : `${e(SAMLINGNAMN[x.samling] || x.samling)}${post ? ' ' : ''}`}${e(post)}</small>` : ''}${antal > 1 ? ` <span class="chip">${antal} gånger${e(spann)}</span>` : ''}${detalj ? `<span class="loggrad-detalj">${e(detalj)}</span>` : ''}</span></div>`;
    });
    return `<div class="logglista">${html}</div>
      ${adminUi.loggSlut ? '' : '<div class="logg-fler"><button class="knapp knapp-spok knapp-liten" type="button" data-g="admin-logg-fler">Visa fler</button></div>'}`;
  }
  function ritaAdmin() {
    const lista = $('[data-admin-lista]', vy); if (!lista) return;
    lista.innerHTML = adminListaHtml();
    const n = $('[data-admin-antal]', vy); if (n) n.textContent = adminAntalText();
    const logg = $('[data-admin-logg]', vy); if (logg) logg.innerHTML = adminLoggHtml();
    const lage = $('[data-admin-lage]', vy); if (lage) lage.innerHTML = adminLageHtml();
    $$('[data-g="admin-loggfilter"]', vy).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === adminUi.loggFilter)));
    const csv = $('[data-logg-csv]', vy); if (csv) csv.setAttribute('href', L.admin.loggCsv(loggOpt()) || '#/anvandare');
    const rensa = $('[data-logg-rensa]', vy); if (rensa) rensa.hidden = !(loggFiltrerad() || adminUi.loggF.hamtningar);
  }
  async function laddaAdmin() {
    if (!SKARP || !arAdmin()) return;
    const [lista, logg, idagSvar] = await Promise.all([L.admin.lista(), L.admin.logg(loggOpt({ antal: 40 })), L.admin.logg({ antal: 200, typ: 'inloggning', fran: idag() })]);
    adminUi.fel = lista.ok ? '' : lista.meddelande || 'Kunde inte hämta användarna.';
    if (lista.ok) adminUi.anvandare = lista.anvandare || [];
    if (logg.ok) { adminUi.logg = logg.logg || []; adminUi.loggSlut = adminUi.logg.length < 40; } else if (!adminUi.logg) { adminUi.logg = []; adminUi.loggSlut = true; }
    if (idagSvar.ok) adminUi.inloggIdag = idagSvar.logg || [];
    ritaAdmin();
  }
  // Filtret ändrades: första sidan på nytt (servern filtrerar – "Visa fler" hämtar nästa sida med samma filter)
  let loggOmNr = 0;
  async function laddaLoggOm() {
    const nr = ++loggOmNr;
    const lista = $('[data-admin-logg]', vy); if (lista) lista.setAttribute('aria-busy', 'true');
    const svar = await L.admin.logg(loggOpt({ antal: 40 }));
    if (nr !== loggOmNr) return; // ett nyare filter hann före
    if (lista) lista.removeAttribute('aria-busy');
    if (!svar.ok) { toast(svar.meddelande || 'Kunde inte hämta loggen.', null, 'varning'); return; }
    adminUi.logg = svar.logg || []; adminUi.loggSlut = adminUi.logg.length < 40;
    ritaAdmin();
  }
  async function laddaLogg() {
    const sista = adminUi.logg && adminUi.logg[adminUi.logg.length - 1];
    const svar = await L.admin.logg(loggOpt({ antal: 40, fore: sista ? sista.id : undefined }));
    if (!svar.ok) { toast(svar.meddelande || 'Kunde inte hämta fler händelser.', null, 'varning'); return; }
    adminUi.logg = [...(adminUi.logg || []), ...(svar.logg || [])]; adminUi.loggSlut = (svar.logg || []).length < 40;
    ritaAdmin();
  }
  async function uppdateraAnvandare(id, andring, klarText) {
    const svar = await L.admin.uppdatera(id, andring);
    if (svar.ok) toast(klarText); else toast(ADMINFEL[svar.fel] || svar.meddelande || 'Ändringen kunde inte sparas.', null, 'varning');
    await laddaAdmin();
  }
  // Inloggningen för ett konto (administratören, skarpt läge): inloggade enheter, logga ut en eller alla, häv kontospärren och
  // skicka inbjudan igen. Utloggningen gäller vid personens nästa anrop (högst 15 s) – inloggningssidan säger varför.
  const enhetText = (ua) => {
    const s = String(ua || '');
    const webblasare = /Edg\//.test(s) ? 'Edge' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Webbläsare';
    const system = /iPhone|iPad/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
    return system ? `${webblasare} på ${system}` : webblasare;
  };
  async function anvKontoArk(id) {
    const u = (adminUi.anvandare || []).find((x) => x.id === id); if (!u) return;
    oppnaArk(`${arkHuvud(`Inloggning – ${u.namn}`, u.epost, 'nyckel')}<div class="ark-kropp" data-anv-konto="${e(id)}"><p class="hamtar">Hämtar inloggningarna …</p></div>
      <div class="ark-fot"><button class="knapp knapp-accent" type="button" data-g="stang-ark">Klar</button></div>`);
    const svar = await L.admin.sessioner(id);
    ritaAnvKonto(id, svar);
  }
  function ritaAnvKonto(id, svar) {
    const yta = $(`[data-anv-konto="${sel(id)}"]`); if (!yta) return;
    const u = (adminUi.anvandare || []).find((x) => x.id === id) || anv(id); const aktiv = arAktiv(u);
    if (!svar.ok) { yta.innerHTML = `<p class="falt-hint" role="alert">${e(svar.meddelande || 'Inloggningarna kunde inte hämtas.')}</p>`; return; }
    const lista = svar.sessioner || []; const andra = lista.filter((s) => !s.denna);
    yta.innerHTML = `<p class="etikett">Inloggade enheter <span class="chip">${lista.length}</span></p>
      ${lista.length ? `<div class="anvlista">${lista.map((s) => `<div class="anvrad anvrad-enkel"><span class="anvrad-text"><strong>${e(enhetText(s.klient))}${s.denna ? ' <span class="chip chip-ok">Den här</span>' : ''}</strong>
        <small>Inloggad ${e(relTid(s.skapad))} · senast ${e(relTid(s.senast))}${s.ip ? ` · ${e(s.ip)}` : ''}</small></span>
        ${s.denna ? '' : `<button class="knapp knapp-spok knapp-liten" type="button" data-g="anv-logga-ut" data-id="${e(id)}" data-sid="${e(s.id)}">${ik('logga-ut')}Logga ut</button>`}</div>`).join('')}</div>`
        : `<p class="falt-hint">${e(u.kort || u.namn)} är inte inloggad någonstans just nu.</p>`}
      <div class="knapprad">
        <button class="knapp knapp-kontur knapp-liten" type="button" data-g="anv-logga-ut" data-id="${e(id)}" ${andra.length ? '' : 'disabled'}>${ik('logga-ut')}${id === jag ? 'Logga ut mina andra enheter' : 'Logga ut överallt'}</button>
        ${u.sparradSek ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="anv-hav-sparr" data-id="${e(id)}">${ik('las')}Häv spärren (${e(Math.ceil(u.sparradSek / 60))} min kvar)</button>` : ''}
        ${aktiv && id !== jag ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="anv-inbjudan" data-id="${e(id)}">${ik('mejl')}Skicka inbjudan igen</button>` : ''}
      </div>
      <p class="falt-hint">Utloggningen gäller inom 15 sekunder – personen får veta att en administratör har loggat ut hen och kan logga in igen med en ny kod. Kontot inaktiveras inte.${u.sparradSek ? ' Spärren kommer efter för många felaktiga koder och hävs annars av sig själv.' : ''}</p>`;
  }
  // Registerutdrag (GDPR art. 15): var en kontaktperson eller deltagare förekommer – visas här och laddas ner som JSON
  async function sokRegister(f) {
    const q = String(new FormData(f).get('q') || '').trim();
    if (q.length < 3) { felFalt(f, 'q', 'Skriv minst tre tecken – e-post, telefon, personnummer eller namn'); return; }
    const yta = $('[data-register-svar]', vy); if (yta) yta.innerHTML = '<p class="hamtar">Söker …</p>';
    const svar = await L.admin.registerutdrag(q);
    adminUi.register = svar.ok ? svar : null;
    if (!yta) return;
    if (!svar.ok) { yta.innerHTML = `<p class="falt-hint" role="alert">${e(svar.meddelande || 'Sökningen misslyckades.')}</p>`; return; }
    const t = svar.traffar || [];
    yta.innerHTML = t.length ? `<p class="etikett">${e(plural(t.length, 'träff', 'träffar'))} för ”${e(svar.q)}”</p>
      <div class="anvlista">${t.slice(0, 40).map((x) => `<div class="anvrad anvrad-enkel"><span class="anvrad-text"><strong>${e(x.typ)}${x.kund ? ` · ${e(x.kund)}` : ''}</strong><small>${e(Object.entries(x.uppgifter || {}).filter(([k, v]) => v && k !== 'pnr' && !Array.isArray(v)).map(([, v]) => String(v).slice(0, 80)).join(' · '))}</small></span></div>`).join('')}</div>
      ${t.length > 40 ? `<p class="falt-hint">+ ${t.length - 40} till – alla finns i filen.</p>` : ''}
      <div class="knapprad"><button class="knapp knapp-kontur knapp-liten" type="button" data-g="register-ladda-ner">${ik('ladda-ner')}Ladda ner utdraget (JSON)</button></div>
      <p class="falt-hint">Filen innehåller allt som hittades, även personnummer – skicka den bara till personen själv. Sökningen loggas.</p>`
      : `<p class="falt-hint">Inget hittades för ”${e(svar.q)}”.</p>`;
  }


  /* 10b-dokument: arkivet (#/dokument) ------------------------------------------------------ */
  /* Allt som har skickats till kunderna, kommit in från dem, signerats eller laddats upp – på EN sida. Varje post har samma form
     oavsett källa (dokPoster): offerter och ordrar till kund (db.offerter), kundunderlag via länk (db.kundlankar), överlämningar
     till testteamet (projektens underlag), uppladdade filer och mötesinspelningar (db.dokument) och klubbarnas Klubbmotorn-avtal.
     Sidan läser bara – åtgärderna är de vanliga (ny version, förläng länken, ladda upp …) och detaljerna öppnas i arket.
     Hälsoformulärens svar visas aldrig här, bara hur många som har svarat. #/dokument/<kund-id> visar en kunds dokument.
     Filter, sökning och sortering ritar bara om listan (dokUppdatera) – hjälten står kvar. Stil: sidor.css avsnitt 18. */
  const FACK = [
    { id: 'offert', namn: 'Offerter', ikon: UPEMO.sak.offert, ton: 'is' },
    { id: 'order', namn: 'Ordrar', ikon: UPEMO.sak.order, ton: 'mint' },
    { id: 'avtal', namn: 'Avtal', ikon: UPEMO.sak.signering, ton: 'gul' },
    { id: 'underlag', namn: 'Underlag', ikon: UPEMO.sak.underlag, ton: '' },
    { id: 'mote', namn: 'Inspelningar', ikon: 'mote', ton: 'rod' },
    { id: 'ovrigt', namn: 'Övrigt', ikon: UPEMO.sak.dokument, ton: '' },
  ];
  const fackFor = (id) => FACK.find((f) => f.id === id) || FACK[FACK.length - 1];
  const DOK_LAGEN = [['aktuella', 'Aktuella'], ['vantar', 'Väntar på svar'], ['klar', 'Klara'], ['utgangen', 'Utgångna'], ['arkiv', 'Arkiv']];
  const DOK_SORT = { senast: 'Senast ändrad', utgar: 'Går ut först', kund: 'Kund A–Ö', varde: 'Högst värde' };
  const DOK_ORDNING = { senast: 'Senast ändrade först', utgar: 'Det som går ut först', kund: 'Kunderna i bokstavsordning', varde: 'Högst värde först' };
  const DOK_GRUPP = { fack: 'Per typ', kund: 'Per kund', manad: 'Per månad', ingen: 'Utan grupper' };
  const dokUi = { fack: 'alla', lage: 'aktuella', urval: null, sok: '', sortera: 'senast', gruppera: 'fack', allaAtgarder: false, oppnaEfter: null, vem: null, vemFor: null };
  /* Mina/Alla i arkivet (som Att göra och säljtavlan): en säljare ser sina egna som standard, övriga roller allt. Gäller bara hela
     arkivet – en kunds egen dokumentsida visar alltid allt om kunden. Mitt = affärens ansvarige, projektets testansvarige, och för
     poster utan affär (klubbavtal, filer på kunden) den som laddade upp eller någon av kundens (eller partnernas) säljare. */
  const dokVemNu = (kundId = null) => {
    if (kundId) return 'alla';
    if (dokUi.vemFor !== jag) { dokUi.vem = anv(jag).roll === 'salj' ? 'mina' : 'alla'; dokUi.vemFor = jag; }
    return dokUi.vem;
  };
  const dokKundSaljare = (kundId) => new Set([...affarerFor(kundId), ...db.kunder.filter((x) => x.viaKlubb === kundId).flatMap((x) => affarerFor(x.id))].map((a) => a.ansvarig));
  const dokMin = (p) => {
    const pr = p.projektId ? projekt(p.projektId) : null; if (pr && pr.ansvarigTest === jag) return true;
    const a = p.affarId ? affar(p.affarId) : null; if (a) return a.ansvarig === jag;
    if (p.kalla === 'fil' && p.av === jag) return true;
    return !!p.kundId && dokKundSaljare(p.kundId).has(jag);
  };
  const dokVem = (lista, kundId = null) => (dokVemNu(kundId) === 'mina' ? lista.filter(dokMin) : lista);
  // Glaskortens urval: Godkänt & signerat = offerter/ordrar godkända via länk, Går ut = väntar och går ut inom 7 dagar
  const DOK_URVAL = { signerat: 'Godkänt & signerat via länk', snart: 'Går ut inom 7 dagar' };
  // Ikonen per sorts post: digitala offerter/ordrar, kundlänkar, överlämningar och klubbavtal (filer visar sin filändelse)
  const DK_IKON = { offert: UPEMO.sak.offert, order: UPEMO.sak.order, underlag: UPEMO.sak.lank, projekt: UPEMO.sak.projekt, klubb: UPEMO.sak.klubb, mote: 'mote', pub: 'skold', avtal: UPEMO.sak.signering, ovrigt: UPEMO.sak.dokument };
  const senastAv = (...t) => t.filter(Boolean).map(String).sort().pop() || '';
  const dagIso = (t) => (!t ? '' : String(t).length === 10 ? String(t) : lokalISO(new Date(t)));
  // Datum och klockslag i klartext ("Idag 14:05", "5 okt 09:30"); bara datum när tiden saknas
  const tidText = (t) => { if (!t) return ''; if (String(t).length === 10) return datumText(t, { ar: 'auto' }); const d = new Date(t); return `${datumText(lokalISO(d))} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`; };
  // Exporten (CSV): datum och klockslag som ISO ("2026-10-24 14:05") – aldrig relativt ("för 8 min sedan", "idag")
  const tidUt = (t) => { if (!t) return ''; if (String(t).length === 10) return String(t); const d = new Date(t); return isNaN(d) ? '' : `${lokalISO(d)} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`; };
  const utgarText = (iso) => { const n = dagarTill(iso); return n < 0 ? `gick ut ${datumText(iso, { gemen: true })}` : n === 0 ? 'idag' : n === 1 ? 'imorgon' : `om ${n} dagar`; };

  function dokPoster(kundId = null) {
    const ut = []; const med = (x) => !kundId || x.kundId === kundId;
    // Offerter och ordrar som kunden har fått via länk
    Object.entries(db.offerter || {}).forEach(([token, d]) => {
      if (!med(d)) return;
      const typ = d.typ === 'order' ? 'order' : 'offert'; const a = affar(d.affarId); const m = d.makulerad;
      const klar = dokKlar(d); const utg = dokUtgangen(d);
      // Affären är förlorad eller signerad: ett dokument som aldrig godkändes väntar inte längre på något
      const stangd = !klar && !m && d.status !== 'ersatt' && !!a && !arOppen(a);
      // Godkänd men ersatt av en nyare godkänd version: arkivet, inte Klar (räknas inte två gånger i Godkänt & signerat)
      const ers = dokErsattAv(d); const nyare = d.status === 'ersatt' && !m ? dokNyare(d) : null;
      const lage = d.status === 'ersatt' || m || stangd || ers ? 'arkiv' : klar ? 'klar' : utg ? 'utgangen' : 'vantar';
      const status = m ? DOKSTATUS.makulerad : d.status === 'ersatt' || ers ? DOKSTATUS.ersatt : stangd ? ['Avslutad', 'chip'] : utg ? DOKSTATUS.utgangen : DOKSTATUS[d.status] || DOKSTATUS.skickad;
      const klarOrd = typ === 'order' ? 'Signerad' : 'Godkänd';
      // tid: relativ i listan, absolut i exporten (detaljUt) – samma meningar annars
      const detaljMed = (tid, dag) => (m ? `Makulerad ${dag(dagIso(m.tid))}`
        : ers ? `${klarOrd} ${tid(d.godkand)} · ersatt av ${ers.nummer}`
        : d.status === 'ersatt' ? (nyare ? `Ersatt av ${nyare.nummer}` : 'Ersatt av en nyare version')
        : stangd ? (a.steg === 'forlorad' ? 'Affären är förlorad' : 'Affären signerades utan den här versionen')
        : klar ? null
        : utg ? `Gick ut ${dag(d.giltigTill)}`
        : d.oppnad ? `Öppnad ${tid(d.oppnad)}` : 'Ej öppnad än');
      const detalj = m ? `Makulerad ${datumText(dagIso(m.tid), { gemen: true })}${m.orsak ? ` – ${m.orsak}` : ''}`
        : detaljMed(relTid, (x) => datumText(x, { gemen: true })) || `Av ${(d.godkandAv && d.godkandAv.namn) || 'kunden'} ${relTid(d.godkand)}`;
      ut.push({ id: `o-${token}`, kalla: 'kund', token, fack: typ, kat: typ, titel: `${typ === 'order' ? 'Order' : 'Offert'} ${d.nummer}`, nummer: d.nummer,
        under: d.titel || (a ? a.titel : ''), kundId: d.kundId, affarId: d.affarId, lage, status, detalj, varde: prisaOffert(d.offert).total,
        // exporten (CSV): utan namn och fritext – vem som godkände och makuleringens orsak står bara i CRM:et
        detaljUt: detaljMed(tidUt, tidUt) || `${klarOrd} av kunden ${tidUt(d.godkand)}`, vardeUnder: typ === 'order' ? 'ordervärde' : 'offererat',
        utgar: lage === 'vantar' ? d.giltigTill : null, skapad: d.skapad, tid: senastAv(d.skapad, d.andrad, d.oppnad, d.godkand, m && m.tid), av: a ? a.ansvarig : null });
    });
    // Kundunderlag: länken där kunden fyller i företag och deltagare
    Object.entries(db.kundlankar || {}).forEach(([token, l]) => {
      if (!med(l)) return;
      const a = affar(l.affarId); const utg = lankUtgangen(l); const n = (l.deltagare || []).length;
      const stangd = !l.sparrad && l.status !== 'inskickad' && !!a && !arOppen(a);
      const lage = l.sparrad || stangd ? 'arkiv' : l.status === 'inskickad' ? 'klar' : utg ? 'utgangen' : 'vantar';
      const status = l.sparrad ? ['Spärrad', 'chip'] : stangd ? ['Avslutad', 'chip'] : utg ? ['Utgången', 'chip-rod'] : LANKSTATUS[l.status] || LANKSTATUS.skickad;
      const hl = HALSA && n ? halsoLage(l, db.halsoformular) : null;
      const coaching = !!(a && a.offert && a.offert.typ === 'uppfoljning');
      const varde = !n ? null : coaching ? prisa({ ...a.offert, deltagare: l.deltagare.map((x) => ({ paket: x.paket, tillval: [] })) }).total : summeraUnderlag(l).total;
      const detaljMed = (dag) => [n ? plural(n, 'deltagare', 'deltagare') : 'Inga deltagare än', hl ? `${hl.klara}/${hl.totalt} hälsoformulär` : '', l.sparrad ? `spärrad ${dag(l.sparrad)}` : ''].filter(Boolean).join(' · ');
      const detalj = detaljMed((x) => datumText(x, { gemen: true }));
      ut.push({ id: `l-${token}`, kalla: 'lank', token, fack: 'underlag', kat: 'underlag', titel: 'Kundunderlag', nummer: '', under: a ? a.titel : 'Kundlänk', kundId: l.kundId, affarId: l.affarId,
        lage, status, detalj, detaljUt: detaljMed(tidUt), varde, vardeUnder: 'preliminärt', utgar: lage === 'vantar' ? l.utgar : null, skapad: l.skapad, tid: senastAv(l.skapad, l.andrad, l.oppnad, l.inskickad), av: a ? a.ansvarig : null });
    });
    // Överlämningen från sälj till testteamet (projektets underlag)
    db.projekt.forEach((p) => {
      if (!med(p) || !p.underlag) return;
      const a = affar(p.affarId); const uk = underlagKomplett(p.underlag);
      const status = { ny: ['Ej granskat', 'chip-gul'], komplett: ['Godkänt', 'chip-ok'], returnerat: ['Returnerat', 'chip-rod'] }[p.underlagStatus] || ['Skickat', 'chip-navy'];
      const detaljMed = (dag) => `${uk.klara} av ${uk.totalt} uppgifter${p.testdatum ? ` · testdag ${dag(p.testdatum)}` : ''}`;
      const detalj = p.underlagStatus === 'returnerat' ? p.returKommentar || 'Testteamet behöver en komplettering' : detaljMed((x) => datumText(x, { gemen: true }));
      ut.push({ id: `p-${p.id}`, kalla: 'projekt', projektId: p.id, fack: 'underlag', kat: 'projekt', titel: 'Överlämning till testteamet', nummer: '', under: a ? a.titel : '', kundId: p.kundId, affarId: p.affarId,
        lage: p.underlagStatus === 'komplett' ? 'klar' : 'vantar', status, detalj, detaljUt: p.underlagStatus === 'returnerat' ? 'Testteamet behöver en komplettering' : detaljMed(tidUt), varde: null, utgar: null, skapad: p.skickad || '', tid: senastAv(p.skickad), av: a ? a.ansvarig : null });
    });
    // Uppladdade filer och mötesinspelningar
    db.dokument.forEach((d) => {
      if (!med(d)) return;
      const kat = filKategori(d); const ljud = kat === 'mote';
      // PUB-avtal skapat från mall väntar på signatur tills en signerad kopia har laddats upp på affären
      const pubAffar = d.mall === 'pub' && d.affarId ? affar(d.affarId) : null;
      const vantarSign = d.mall === 'pub' && !!pubAffar && arOppen(pubAffar) && !(pubAffar.check && pubAffar.check.pub) && !db.dokument.some((x) => x.affarId === d.affarId && filKategori(x) === 'pub' && !x.mall);
      ut.push({ id: `f-${d.id}`, kalla: 'fil', filId: d.id, fack: kat === 'pub' ? 'avtal' : kat, kat, titel: d.namn, nummer: '', ext: filAndelse(d.namn), langd: d.langd || 0,
        under: [DOK_KAT[kat], ljud ? langdText(d.langd) : d.mall ? 'från mall' : storlekText(d.storlek)].filter(Boolean).join(' · '), kundId: d.kundId, affarId: d.affarId || null,
        lage: vantarSign ? 'vantar' : 'klar', status: vantarSign ? ['Väntar på signatur', 'chip-gul'] : d.mall ? ['Skapad från mall', 'chip-is'] : [ljud ? 'Inspelad' : 'Uppladdad', 'chip'], detalj: `${anv(d.av).kort} ${relTid(d.tid)}${d.exempel ? ' · exempel' : ''}`, detaljUt: `${tidUt(d.tid)}${d.exempel ? ' · exempel' : ''}`,
        varde: null, utgar: null, skapad: d.tid, tid: d.tid, av: d.av, exempel: !!d.exempel });
    });
    // Klubbarnas Klubbmotorn-avtal
    db.kunder.forEach((k) => {
      if (!k.klubbavtal || (kundId && k.id !== kundId)) return;
      const ka = k.klubbavtal; const st = klubbStat(k); const prov = st.utbetalt + st.attBetala + st.upplupen;
      ut.push({ id: `k-${k.id}`, kalla: 'klubbavtal', fack: 'avtal', kat: 'klubb', titel: 'Klubbmotorn-avtal', nummer: '',
        under: `${ka.procent} % provision · ${ka.form && ka.form !== 'oklart' ? UTBETALNING[ka.form] : 'utbetalning ej vald'}`, kundId: k.id, affarId: null,
        lage: 'klar', status: ['I kraft', 'chip-ok'], detalj: `${plural(st.introducerade, 'företag', 'företag')} introducerade`, detaljUt: `${plural(st.introducerade, 'företag', 'företag')} introducerade`, varde: prov || null, vardeUnder: 'provision',
        utgar: null, skapad: ka.sedan || k.skapad || '', tid: ka.sedan || k.skapad || '', av: null });
    });
    ut.forEach((p) => {
      const k = kund(p.kundId); const a = p.affarId ? affar(p.affarId) : null;
      p.sok = [p.titel, p.nummer, p.under, p.detalj, p.status[0], fackFor(p.fack).namn, DOK_KAT[p.kat], k && k.namn, k && k.orgnr, a && a.titel].filter(Boolean).join(' ').toLowerCase();
    });
    return ut;
  }

  // Filtret: typ (fack), läge och sökning (alla ord ska finnas, i valfri ordning: "nordlast order")
  const dokOrd = (q) => String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const dokMatchar = (p, { fack = dokUi.fack, lage = dokUi.lage, sok = dokUi.sok, urval = dokUi.urval } = {}) => (fack === 'alla' || p.fack === fack)
    && (lage === 'aktuella' ? p.lage !== 'arkiv' : p.lage === lage) && (urval !== 'signerat' || p.kalla === 'kund') && (urval !== 'snart' || (!!p.utgar && dagarTill(p.utgar) <= 7))
    && dokOrd(sok).every((o) => p.sok.includes(o));
  const dokTalAktivt = (t) => (t === 'vantar' ? dokUi.lage === 'vantar' && !dokUi.urval && dokUi.fack === 'alla' : t === 'avtal' ? dokUi.fack === 'avtal' && dokUi.lage === 'aktuella' && !dokUi.urval : dokUi.urval === t);
  // Sortering och gruppering ändrade av knappar: rutorna och valj.js-knapparna visar samma sak (change som inte bubblar – bara valj.js lyssnar)
  // Gruppera per kund finns inte på en kunds egen dokumentsida – där gäller per typ (samma som listan ritas med)
  const dokGrupperaNu = () => (/^#\/dokument\/(?!mallar$)[\w-]+$/.test(location.hash) && dokUi.gruppera === 'kund' ? 'fack' : dokUi.gruppera);
  const synkaDokVal = () => [['[data-dok-sortera]', dokUi.sortera], ['[data-dok-gruppera]', dokGrupperaNu()]].forEach(([q, v]) => { const r = $(q, vy); if (r && r.value !== v) { r.value = v; r.dispatchEvent(new Event('change')); } });
  const dokKundNamn = (p) => (kund(p.kundId) || {}).namn || '';
  function dokSortera(lista) {
    const nyast = (a, b) => (a.tid < b.tid ? 1 : a.tid > b.tid ? -1 : 0);
    const s = dokUi.sortera;
    return [...lista].sort((a, b) => (s === 'utgar' ? String(a.utgar || '9999').localeCompare(String(b.utgar || '9999')) || nyast(a, b)
      : s === 'kund' ? dokKundNamn(a).localeCompare(dokKundNamn(b), 'sv') || nyast(a, b)
      : s === 'varde' ? (b.varde || -1) - (a.varde || -1) || nyast(a, b)
      : nyast(a, b)));
  }
  // Fackets rad under talet: läget i siffror, eller vad facket innehåller
  const fackUnder = (f, lista) => {
    if (!lista.length) return dokUi.lage === 'aktuella' ? 'Inga ännu' : 'Inga i det här läget';
    const del = (n, en, flera) => (n ? plural(n, en, flera) : '');
    const antal = (fn) => lista.filter(fn).length;
    if (f.id === 'avtal') return [del(antal((p) => p.kalla === 'klubbavtal'), 'klubbavtal', 'klubbavtal'), del(antal((p) => p.kat === 'pub'), 'PUB-avtal', 'PUB-avtal'), del(antal((p) => p.kat === 'avtal'), 'avtalsfil', 'avtalsfiler')].filter(Boolean).join(' · ');
    if (f.id === 'underlag') return [del(antal((p) => p.kalla === 'lank'), 'kundlänk', 'kundlänkar'), del(antal((p) => p.kalla === 'projekt'), 'överlämning', 'överlämningar')].filter(Boolean).join(' · ');
    if (f.id === 'mote') { const min = Math.round(sum(lista.map((p) => p.langd)) / 60); return `${plural(lista.length, 'inspelning', 'inspelningar')}${min ? ` · ${min} min` : ''}`; }
    if (f.id === 'ovrigt') return plural(lista.length, 'fil', 'filer');
    const godk = f.id === 'order' ? ['signerad', 'signerade'] : ['godkänd', 'godkända'];
    return [del(antal((p) => p.lage === 'vantar'), 'väntar', 'väntar'), del(antal((p) => p.lage === 'klar' && p.kalla === 'kund'), ...godk), del(antal((p) => p.lage === 'utgangen'), 'utgången', 'utgångna'),
      del(antal((p) => p.lage === 'arkiv'), 'i arkivet', 'i arkivet'), del(antal((p) => p.kalla === 'fil'), 'fil', 'filer')].filter(Boolean).join(' · ');
  };

  /* Att hantera: det som behöver en handling nu, viktigast först – med EN knapp som gör det. Rollen avgör vad som visas
     (testteamet: underlag att granska; sälj: resten). Samma lista ger menyns räknare (uppdateraRaknare). */
  /* Svarstider: hur lång tid kunderna tar på sig, räknat ur dokumenten själva – skapad → öppnad → godkänd/signerad (offerter och
     ordrar) och skapad → öppnad → inskickat (kundunderlag). Medianen, så att en enstaka offert som legat länge inte flyttar det vanliga.
     Med minst SVAR_MIN svar styr den påminnelserna i Att hantera (svarGrans, oppnaGrans); tills dess gäller de fasta gränserna. */
  const SVAR_MIN = 3;
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const dygnMellan = (fran, till) => (fran && till ? Math.max(0, (new Date(till) - new Date(fran)) / 864e5) : null);
  // Ett mätvärde per dokument som gått till kunden: typ, kund, säljaren (affärens ansvarige) och tiderna i dygn
  const svarsMatt = () => [
    ...Object.values(db.offerter || {}).filter((d) => d.skapad).map((d) => ({ typ: d.typ === 'order' ? 'order' : 'offert', kundId: d.kundId, saljare: (affar(d.affarId) || {}).ansvarig || null,
      oppna: dygnMellan(d.skapad, d.oppnad), svar: dygnMellan(d.skapad, d.godkand), beslut: dygnMellan(d.oppnad, d.godkand) })),
    ...Object.values(db.kundlankar || {}).filter((l) => l.skapad).map((l) => { const inne = l.status === 'inskickad' ? l.inskickad : null;
      return { typ: 'underlag', kundId: l.kundId, saljare: (affar(l.affarId) || {}).ansvarig || null, oppna: dygnMellan(l.skapad, l.oppnad), svar: dygnMellan(l.skapad, inne), beslut: dygnMellan(l.oppnad, inne) }; }),
  ];
  function svarstider({ typ = null, kundId = null, saljare = null } = {}) {
    const m = svarsMatt().filter((x) => (!typ || [].concat(typ).includes(x.typ)) && (!kundId || x.kundId === kundId) && (!saljare || x.saljare === saljare));
    const v = (nyckel) => m.map((x) => x[nyckel]).filter((x) => x != null);
    const o = v('oppna'); const sv = v('svar'); const b = v('beslut');
    return { skickade: m.length, oppna: median(o), nOppna: o.length, inomDygn: o.length ? o.filter((x) => x <= 1).length / o.length : 0, svar: median(sv), nSvar: sv.length, beslut: median(b), nBeslut: b.length };
  }
  // Påminnelsernas gränser i hela dagar: medianen + marginal (minst 2 dygn för svar och 1 för öppning, aldrig mindre än medianen själv).
  // För få svar: de fasta 5 dagarna för "Inget svar" och ingen påminnelse om oöppnade dokument.
  function svarGrans(typ = ['offert', 'order']) {
    const t = svarstider({ typ });
    if (t.nBeslut < SVAR_MIN) return { dagar: 5, median: null, n: t.nBeslut };
    return { dagar: Math.min(14, Math.max(3, Math.ceil(t.beslut + Math.max(2, t.beslut)))), median: t.beslut, n: t.nBeslut };
  }
  function oppnaGrans(typ = ['offert', 'order']) {
    const t = svarstider({ typ });
    if (t.nOppna < SVAR_MIN) return { dagar: null, median: null, n: t.nOppna };
    return { dagar: Math.min(7, Math.max(2, Math.ceil(t.oppna + Math.max(1, t.oppna)))), median: t.oppna, n: t.nOppna };
  }
  // Hela kalenderdagar sedan en tidpunkt – samma mått i Att hantera och i arket Svarstider (gränserna är hela dagar)
  const dagarSedan = (t) => -dagarTill(dagIso(t));
  // 0,2 dygn → "5 timmar", 1,3 → "1 dag", 4,6 → "5 dagar"
  const svarLangd = (d) => (d == null ? '–' : d < 1 / 24 ? 'under en timme' : d < .96 ? plural(Math.max(1, Math.round(d * 24)), 'timme', 'timmar') : plural(Math.round(d), 'dag', 'dagar'));
  // Dokumentets egen svarstid (arket): hur lång tid just det här tog – eller har tagit hittills – mot det vanliga
  function svarRad(skapad, oppnad, svar, typ) {
    const t = svarstider({ typ: typ === 'underlag' ? ['underlag'] : ['offert', 'order'] }); const nu = new Date().toISOString();
    const vanligt = (x, n, text) => (x != null && n >= SVAR_MIN ? ` <small>(vanligt${typ === 'underlag' ? '' : ' för offerter och ordrar'}: ${e(text(svarLangd(x)))})</small>` : '');
    const svarOrd = typ === 'underlag' ? 'inskickat' : typ === 'order' ? 'signerad' : 'godkänd';
    let html;
    if (svar) html = `${oppnad ? `öppnad efter ${e(svarLangd(dygnMellan(skapad, oppnad)))} · ` : ''}${svarOrd} efter ${e(svarLangd(dygnMellan(skapad, svar)))}${vanligt(t.svar, t.nSvar, (x) => `${typ === 'underlag' ? 'inskickat' : 'svar'} efter ${x}`)}`;
    else if (oppnad) html = `öppnad efter ${e(svarLangd(dygnMellan(skapad, oppnad)))} · väntat ${e(svarLangd(dygnMellan(oppnad, nu)))} sedan dess${vanligt(t.beslut, t.nBeslut, (x) => `${typ === 'underlag' ? 'inskickat' : 'svar'} ${x} efter öppning`)}`;
    else html = `inte öppnad – skickad för ${e(svarLangd(dygnMellan(skapad, nu)))} sedan${vanligt(t.oppna, t.nOppna, (x) => `öppnas efter ${x}`)}`;
    return html.charAt(0).toUpperCase() + html.slice(1);
  }
  function dokAtgarder(poster, kundId = null, { vem = 'alla' } = {}) {
    const ut = []; const roll = anv(jag).roll === 'test' ? 'test' : 'salj';
    const fnamn = (pk) => (pk ? pk.namn.split(' ')[0] : '');
    const sg = svarGrans(); const og = oppnaGrans(); const ogL = oppnaGrans(['underlag']); const sedan = dagarSedan;
    poster.forEach((p) => {
      const k = kund(p.kundId); const a = p.affarId ? affar(p.affarId) : null; const knamn = k ? k.namn : ''; const pk = primarKontakt(k);
      if ((p.kalla === 'kund' || p.kalla === 'lank') && a && !arOppen(a)) return; // förlorad eller signerad: ingen påminnelse om dokumenten
      if (p.kalla === 'kund' && a) {
        const d = db.offerter[p.token]; const typ = p.fack; const namn = typ === 'order' ? 'ordern' : 'offerten';
        const aktuell = (dokFor(a.id, typ) || {}).token === p.token;
        const nyVersion = `<button class="knapp knapp-accent knapp-liten" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="${e(typ)}">${ik('plus')}Ny version</button>`;
        const paminn = pk && pk.epost ? `<a class="knapp knapp-kontur knapp-liten" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent(`${typ === 'order' ? 'Order' : 'Offert'} ${d.nummer} – Uperformance`)}&amp;body=${encodeURIComponent(`Hej ${fnamn(pk)}!\n\nEn påminnelse om ${namn} (${d.nummer}) – den gäller till ${langtDatum(d.giltigTill)}:\n${dokUrl(p.token)}\n\nVänliga hälsningar\n${anv(a.ansvarig).namn}, Uperformance`)}">${ik('mejl')}Påminn</a>`
          : `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="kopiera-dokument" data-token="${e(p.token)}">${ik('lank')}Kopiera länk</button>`;
        if (p.lage === 'utgangen' && aktuell) ut.push({ prio: 1, roll: 'salj', ton: 'rod', ikon: 'klocka', id: p.id, rubrik: `${p.titel} har gått ut`, text: `${knamn} · kunden kan inte ${typ === 'order' ? 'signera' : 'godkänna'} ${namn}`, knapp: nyVersion });
        else if (p.lage === 'vantar' && p.utgar && dagarTill(p.utgar) <= 5) ut.push({ prio: 2, roll: 'salj', ton: 'gul', ikon: UPEMO.sak.vantar, id: p.id, rubrik: `${p.titel} går ut ${utgarText(p.utgar)}`, text: `${knamn} · ${p.detalj.charAt(0).toLowerCase()}${p.detalj.slice(1)}`, knapp: paminn });
        else if (p.lage === 'vantar' && d.status === 'oppnad' && d.oppnad && sedan(d.oppnad) >= sg.dagar) {
          const ring = pk && pk.tel ? `<a class="knapp knapp-kontur knapp-liten" href="tel:${e(pk.tel.replace(/\s/g, ''))}">${ik('samtal')}Ring ${e(fnamn(pk))}</a>` : paminn;
          // Hur länge den legat jämfört med det vanliga (svarstiderna) – med för få svar som förut
          const legat = `öppnade den för ${plural(sedan(d.oppnad), 'dag', 'dagar')} sedan`;
          ut.push({ prio: 4, roll: 'salj', ton: 'is', ikon: 'samtal', id: p.id, rubrik: `Inget svar på ${namn} ${d.nummer}`, text: sg.median != null ? `${knamn} ${legat} – kunder brukar svara inom ${svarLangd(sg.median)} efter att de öppnat` : `${knamn} öppnade den ${relTid(d.oppnad)}`, knapp: ring });
        } else if (p.lage === 'vantar' && !d.oppnad && og.dagar != null && sedan(d.skapad) >= og.dagar) {
          ut.push({ prio: 4, regel: 'oppnad', roll: 'salj', ton: 'is', ikon: 'mejl', id: p.id, rubrik: `${p.titel} är inte öppnad`, text: `${knamn} · skickad för ${plural(sedan(d.skapad), 'dag', 'dagar')} sedan – kunder brukar öppna inom ${svarLangd(og.median)}`, knapp: paminn });
        }
      } else if (p.kalla === 'lank' && a) {
        const l = db.kundlankar[p.token]; const n = (l.deltagare || []).length;
        if (p.lage === 'utgangen') ut.push({ prio: 1, roll: 'salj', ton: 'rod', ikon: 'klocka', id: p.id, rubrik: 'Kundlänken har gått ut', text: `${knamn} · ${a.titel}`, knapp: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="forlang-lank" data-token="${e(p.token)}">${ik('klocka')}Förläng 30 dagar</button>` });
        else if (p.lage === 'vantar' && p.utgar && dagarTill(p.utgar) <= 5) ut.push({ prio: 2, roll: 'salj', ton: 'gul', ikon: UPEMO.sak.lank, id: p.id, rubrik: `Kundlänken går ut ${utgarText(p.utgar)}`, text: `${knamn} · ${p.status[0].toLowerCase()}`, knapp: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="kopiera-lank" data-token="${e(p.token)}">${ik('lank')}Kopiera länk</button>` });
        else if (p.lage === 'vantar' && !l.oppnad && ogL.dagar != null && sedan(l.skapad) >= ogL.dagar) ut.push({ prio: 4, regel: 'oppnad', roll: 'salj', ton: 'is', ikon: UPEMO.sak.lank, id: p.id, rubrik: 'Kundlänken är inte öppnad', text: `${knamn} · skickad för ${plural(sedan(l.skapad), 'dag', 'dagar')} sedan – kunder brukar öppna inom ${svarLangd(ogL.median)}`, knapp: `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="kopiera-lank" data-token="${e(p.token)}">${ik('lank')}Kopiera länk</button>` });
        else if (p.lage === 'klar' && a.offert.underlag !== p.token && n) ut.push({ prio: 3, roll: 'salj', ton: 'mint', ikon: UPEMO.larm.inne, id: p.id, rubrik: 'Nytt kundunderlag', text: `${knamn} har skickat in ${plural(n, 'deltagare', 'deltagare')}`, knapp: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="anvand-underlag" data-affar="${e(a.id)}" data-token="${e(p.token)}">${ik('bock')}Använd i offerten</button>` });
      } else if (p.kalla === 'projekt') {
        const pr = projekt(p.projektId);
        if (pr.underlagStatus === 'returnerat') ut.push({ prio: 2, roll: 'salj', ton: 'rod', ikon: UPEMO.larm.retur, id: p.id, rubrik: 'Testteamet returnerade underlaget', text: `${knamn} · ${pr.returKommentar || 'komplettering behövs'}`, knapp: `<a class="knapp knapp-kontur knapp-liten" href="#/projekt/${e(pr.id)}">${ik('redigera')}Komplettera</a>` });
        else if (pr.underlagStatus === 'ny') ut.push({ prio: 2, roll: 'test', ton: 'gul', ikon: UPEMO.larm.granska, id: p.id, rubrik: 'Nytt underlag att granska', text: `${knamn} · skickat ${datumText(pr.skickad, { gemen: true })}`, knapp: `<a class="knapp knapp-accent knapp-liten" href="#/projekt/${e(pr.id)}">${ik('underlag')}Granska</a>` });
      } else if (p.kalla === 'klubbavtal' && (!k.klubbavtal.form || k.klubbavtal.form === 'oklart')) {
        ut.push({ prio: 5, roll: 'salj', ton: 'orange', ikon: UPEMO.sak.provision, id: p.id, rubrik: 'Utbetalningsform saknas', text: `${knamn} · kontant eller värde i sponsorpaket?`, knapp: `<a class="knapp knapp-kontur knapp-liten" href="#/kund/${e(k.id)}">${ik('klubb')}Välj form</a>` });
      }
    });
    // PUB-avtalet behövs till överlämningen (kontrollpunkten "PUB-avtal signerat") – saknas det, ladda upp det härifrån
    db.affarer.forEach((a) => {
      if ((kundId && a.kundId !== kundId) || a.steg !== 'underlag' || (a.check || {}).pub || (vem === 'mina' && a.ansvarig !== jag)) return;
      if (db.dokument.some((d) => d.affarId === a.id && filKategori(d) === 'pub' && !d.mall)) return; // signerad kopia uppladdad
      const knamn = kundNamn(a.kundId); const utkast = db.dokument.find((d) => d.affarId === a.id && d.mall === 'pub');
      const ladda = `<label class="knapp knapp-kontur knapp-liten dk-ladda" data-uppladdning data-kund="${e(a.kundId)}" data-affar="${e(a.id)}" data-kategori="pub">${ik('uppladdning')}${utkast ? 'Ladda upp signerat' : 'Ladda upp'}<input type="file" multiple data-uppladdning-falt aria-label="Ladda upp ${utkast ? 'det signerade ' : ''}PUB-avtalet för ${e(knamn)}"></label>`;
      ut.push(utkast ? { prio: 3, roll: 'salj', ton: 'gul', ikon: 'skold', id: `f-${utkast.id}`, rubrik: 'PUB-avtalet väntar på signatur', text: `${knamn} · utkast skapat ${relTid(utkast.tid)}`, knapp: ladda }
        : { prio: 3, roll: 'salj', ton: 'gul', ikon: 'skold', href: `#/affar/${a.id}`, rubrik: 'PUB-avtal saknas', text: `${knamn} · behövs till överlämningen`,
          knapp: `<button class="knapp knapp-accent knapp-liten" type="button" data-g="mall-ny" data-mall="pub" data-affar="${e(a.id)}">${ik('plus')}Från mall</button>${ladda}` });
    });
    return ut.filter((x) => x.roll === roll).sort((a, b) => a.prio - b.prio || a.text.localeCompare(b.text, 'sv'));
  }

  // Byggstenarna: ikonen, raden (dator), kortet (mobil), tabellen och gruppen
  const dokIkon = (p) => `<span class="dokikon dk-ikon" data-kat="${e(p.kat)}"${p.kalla === 'kund' ? ' data-digital title="Skickad till kunden via länk"' : ''}>${p.kalla === 'fil' && p.kat !== 'mote' ? e(p.ext) : ik(DK_IKON[p.kat] || 'dokument')}</span>`;
  const dokChip = (p) => `<span class="chip ${p.status[1]} chip-prick">${e(p.status[0])}</span>`;
  function dokRad(p) {
    const k = kund(p.kundId); const a = p.affarId ? affar(p.affarId) : null;
    const kundUnder = a && a.titel !== p.under ? a.titel : k ? [k.bransch, k.stad].filter(Boolean).join(' · ') : '';
    const n = p.utgar ? dagarTill(p.utgar) : null;
    const datumUnder = p.utgar ? `<small class="kr-under dk-utgar"${n <= 5 ? ' data-snart' : ''}>${n === 0 ? 'Går ut idag' : n === 1 ? 'Går ut imorgon' : `Gäller till ${e(datumText(p.utgar, { gemen: true }))}`}</small>`
      : p.av ? `<small class="kr-under">${e(anv(p.av).kort)}</small>` : '';
    return `<tr class="dk-rad" data-dok="${e(p.id)}" data-lage="${e(p.lage)}">
      <td class="dk-k-dok"><div class="dk-dok">${dokIkon(p)}<div class="dk-dok-text"><button class="dk-namn" type="button" data-g="dok-visa" data-id="${e(p.id)}" title="${e(p.titel)}">${e(p.titel)}</button><small class="kr-under" title="${e(p.under)}">${e(p.under) || '&nbsp;'}</small></div></div></td>
      <td class="dk-k-kund">${k ? `<div class="dk-kund">${loggaRuta(k)}<div class="dk-kund-text"><a class="dk-kundnamn" href="#/kund/${e(k.id)}" title="${e(k.namn)}">${e(k.namn)}</a><small class="kr-under" title="${e(kundUnder)}">${e(kundUnder) || '&nbsp;'}</small></div></div>` : krTom}</td>
      <td class="dk-k-status"><div class="kr-chips">${dokChip(p)}</div><small class="kr-under" title="${e(p.detalj)}">${e(p.detalj)}</small></td>
      <td class="num dk-k-varde">${p.varde ? `<span class="kr-belopp" title="${e(kr(p.varde))}"><span class="kr-b-lang">${kr(p.varde)}</span><span class="kr-b-kort">${krKort(p.varde)}</span></span><small class="kr-under">${e(p.vardeUnder || '')}</small>` : krTom}</td>
      <td class="num dk-k-datum">${p.tid ? `<span class="kr-text" title="${e(tidText(p.tid))}">${e(datumText(dagIso(p.tid)))}</span>` : krTom}${datumUnder}</td></tr>`;
  }
  const dokKort = (p) => {
    const k = kund(p.kundId);
    return `<button class="dk-kort" type="button" data-g="dok-visa" data-id="${e(p.id)}">${dokIkon(p)}<span class="dk-kort-text"><strong>${e(p.titel)}</strong><small>${e([k && k.namn, p.under].filter(Boolean).join(' · '))}</small><small class="dk-kort-detalj">${e(p.detalj)}</small></span>
      <span class="dk-kort-hoger">${dokChip(p)}${p.varde ? `<b>${krKort(p.varde)}</b>` : p.tid ? `<small>${e(datumText(dagIso(p.tid)))}</small>` : ''}</span></button>`;
  };
  const dokTabell = (lista, rubrik) => `<div class="dk-lista kundtabell"><table class="tabell kr-tabell dk-tabell"><caption class="sr">${e(rubrik)}</caption>
      <thead><tr><th class="dk-k-dok" scope="col">Dokument</th><th class="dk-k-kund" scope="col">Kund</th><th class="dk-k-status" scope="col">Status</th><th class="num dk-k-varde" scope="col">Värde</th><th class="num dk-k-datum" scope="col">Senast</th></tr></thead>
      <tbody>${lista.map(dokRad).join('')}</tbody></table></div>
    <div class="kundlista-mobil dk-mobil">${lista.map(dokKort).join('')}</div>`;
  // Grupperna: per typ (de fem senaste i varje när alla visas – "Visa alla" byter typ), per kund, per månad eller en enda lista
  function dokGrupper(lista, kundId) {
    const sok = dokOrd(dokUi.sok).length > 0;
    const g = kundId && dokUi.gruppera === 'kund' ? 'fack' : dokUi.gruppera;
    if (g === 'ingen' || (g === 'fack' && dokUi.fack !== 'alla')) {
      const f = dokUi.fack !== 'alla' ? fackFor(dokUi.fack) : null;
      return [{ nyckel: f ? f.id : 'alla', rubrik: f ? f.namn : 'Alla dokument', text: f ? f.namn : 'Alla dokument', marke: emo(f ? f.ikon : UPEMO.kundtyp.alla, { ruta: 'm', ton: f ? f.ton : '' }), under: f ? fackUnder(f, lista) : DOK_ORDNING[dokUi.sortera], poster: lista, max: Infinity,
        extra: f ? `<button class="kortlank" type="button" data-g="dok-fack" data-fack="alla">Alla typer${ik('pil')}</button>` : '' }];
    }
    if (g === 'fack') return FACK.map((f) => ({ nyckel: f.id, rubrik: f.namn, text: f.namn, marke: emo(f.ikon, { ruta: 'm', ton: f.ton }), under: fackUnder(f, lista.filter((p) => p.fack === f.id)), poster: lista.filter((p) => p.fack === f.id), max: sok ? Infinity : 5,
      fler: (n) => `<button class="kortlank" type="button" data-g="dok-fack" data-fack="${e(f.id)}">Visa alla ${n} ${e(f.namn.toLowerCase())}${ik('pil')}</button>` })).filter((x) => x.poster.length);
    if (g === 'kund') {
      const per = new Map(); lista.forEach((p) => { if (!per.has(p.kundId)) per.set(p.kundId, []); per.get(p.kundId).push(p); });
      const ordning = [...per.entries()].sort((x, y) => (dokUi.sortera === 'kund' ? dokKundNamn(x[1][0]).localeCompare(dokKundNamn(y[1][0]), 'sv') : 0));
      return ordning.map(([id, poster]) => { const k = kund(id); return { nyckel: `kund-${id}`, rubrik: k ? `<a href="#/kund/${e(k.id)}">${e(k.namn)}</a>` : 'Okänd kund', text: k ? k.namn : 'Okänd kund', marke: k ? loggaRuta(k) : emo('sok', { ruta: 'm' }), under: [...new Set(poster.map((p) => fackFor(p.fack).namn))].join(' · '), poster, max: sok ? Infinity : 4,
        fler: (n) => (k ? `<a class="kortlank" href="#/dokument/${e(k.id)}">Alla ${n} för ${e(k.namn)}${ik('pil')}</a>` : '') }; });
    }
    const per = new Map(); lista.forEach((p) => { const m = dagIso(p.tid).slice(0, 7) || 'utan'; if (!per.has(m)) per.set(m, []); per.get(m).push(p); });
    return [...per.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1)).map(([m, poster]) => {
      const d = m === 'utan' ? null : new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1);
      const namn = d ? d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }) : 'Utan datum';
      const rubrikText = namn.charAt(0).toUpperCase() + namn.slice(1);
      return { nyckel: `manad-${m}`, rubrik: e(rubrikText), text: rubrikText, marke: emo('kalender', { ruta: 'm' }), under: [...new Set(poster.map((p) => fackFor(p.fack).namn))].join(' · '), poster, max: Infinity };
    });
  }
  const dokGruppHtml = (gr, i) => {
    const visas = gr.poster.slice(0, gr.max); const fler = gr.poster.length > visas.length && gr.fler ? gr.fler(gr.poster.length) : '';
    return `<section class="kort dk-grupp" data-dk-grupp="${e(gr.nyckel)}"${i ? ' data-dk-efter' : ''}>
      <header class="dk-grupp-huvud">${gr.marke}<div class="dk-grupp-titel"><h2 tabindex="-1">${gr.rubrik}</h2>${gr.under ? `<small>${e(gr.under)}</small>` : ''}</div><span class="dk-grupp-antal" title="${e(plural(gr.poster.length, 'dokument', 'dokument'))}">${gr.poster.length}</span>${gr.extra || ''}</header>
      ${dokTabell(visas, `${gr.text}: ${plural(gr.poster.length, 'dokument', 'dokument')}`)}
      ${fler ? `<div class="dk-grupp-fot">${fler}</div>` : ''}</section>`;
  };
  function dokAtgardHtml(atg) {
    if (!atg.length) return `<section class="kort dk-atgarder" data-dk-lugnt><div class="dk-lugnt">${emo('klar', { ruta: 'm', ton: 'mint' })}<p><strong>Allt är i fas.</strong> Inget har gått ut och inget behöver göras just nu.</p></div></section>`;
    const visas = dokUi.allaAtgarder ? atg : atg.slice(0, 4);
    return `<section class="kort dk-atgarder" aria-labelledby="dk-atg-rubrik">
      <header class="dk-atg-huvud"><h2 id="dk-atg-rubrik">${emo('larm', { ruta: 's', ton: atg.some((x) => x.prio === 1) ? 'rod' : 'gul' })}Att hantera</h2><span class="dk-grupp-antal">${atg.length}</span>
        ${atg.length > 4 ? `<button class="kortlank" type="button" data-g="dok-atgarder" aria-expanded="${dokUi.allaAtgarder}">${dokUi.allaAtgarder ? 'Visa färre' : `Visa alla ${atg.length}`}${ik('pil')}</button>` : ''}</header>
      <div class="dk-atg-lista" data-antal="${visas.length}">${visas.map((x) => `<div class="dk-atgard" data-ton="${e(x.ton)}">${emo(x.ikon, { ruta: 'm', ton: x.ton })}
        <div class="dk-atgard-text">${x.id ? `<button class="dk-atgard-titel" type="button" data-g="dok-visa" data-id="${e(x.id)}">${e(x.rubrik)}</button>` : `<a class="dk-atgard-titel" href="${e(x.href)}">${e(x.rubrik)}</a>`}<small title="${e(x.text)}">${e(x.text)}</small></div>
        <div class="dk-atgard-knapp">${x.knapp}</div></div>`).join('')}</div></section>`;
  }
  // Listan under hjälten: Att hantera + grupperna (eller ett tomläge som säger varför och vad man gör)
  function dokInnehallHtml(alla, kundId) {
    const lista = dokSortera(alla.filter((p) => dokMatchar(p)));
    const vem = dokVemNu(kundId);
    const atg = dokAtgardHtml(dokAtgarder(alla, kundId, { vem }));
    if (!lista.length) {
      const q = dokUi.sok.trim(); const iAlla = alla.filter((p) => dokMatchar(p, { fack: 'alla', lage: 'aktuella' })).length;
      const f = dokUi.fack !== 'alla' ? fackFor(dokUi.fack) : null; const lage = DOK_LAGEN.find(([id]) => id === dokUi.lage)[1];
      const text = q ? `Inget dokument ${f ? `bland ${f.namn.toLowerCase()} ` : ''}matchar ”${q}”${dokUi.lage !== 'aktuella' ? ` i läget ${lage.toLowerCase()}` : ''}.${iAlla ? ` ${plural(iAlla, 'träff', 'träffar')} bland alla aktuella.` : ' Prova nummer, kund, affär eller filnamn.'}`
        : !alla.length ? (kundId ? 'Inga dokument för kunden ännu. Offerter, ordrar, kundunderlag och filer hamnar här när de skapas.' : 'Arkivet är tomt. Offerter, ordrar, kundunderlag och filer hamnar här när de skapas.')
        : dokUi.urval ? `Inget just nu under ”${DOK_URVAL[dokUi.urval]}”.` : `Inga ${f ? f.namn.toLowerCase() : 'dokument'} i läget ${lage.toLowerCase()}.`;
      // Bara mina: teamets dokument finns ett klick bort
      const teamet = vem === 'mina' ? dokPoster(kundId).filter((p) => dokMatchar(p)).length : 0;
      const nollstall = (dokUi.fack !== 'alla' || dokUi.lage !== 'aktuella' || dokUi.urval || q ? '<button class="knapp knapp-kontur knapp-liten" type="button" data-g="dok-nollstall">Visa alla aktuella</button>' : '')
        + (teamet ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="dok-vem" data-vem="alla">${ik('kunder')}Visa teamets (${teamet})</button>` : '');
      return `${atg}<div class="kort kr-tomt dk-tomt">${tom(text, { emo: q ? 'sok' : f ? f.ikon : UPEMO.sak.dokument, ton: 'is', knapp: `${nollstall}${!q ? `<label class="knapp knapp-accent knapp-liten dk-ladda" data-uppladdning data-kund="${e(kundId || '')}" data-affar="">${ik('uppladdning')}Ladda upp<input type="file" multiple data-uppladdning-falt aria-label="Ladda upp dokument"></label>` : ''}` })}</div>`;
    }
    return `${atg}${dokGrupper(lista, kundId).map(dokGruppHtml).join('')}`;
  }
  const dokAntalHtml = (alla, kundId = null) => {
    const lista = dokSortera(alla.filter((p) => dokMatchar(p))); const q = dokUi.sok.trim();
    const urval = dokUi.urval ? `<button class="dk-urval" type="button" data-g="dok-nollstall" title="Visa alla aktuella">${e(DOK_URVAL[dokUi.urval])}${ik('stang')}</button>` : '';
    if (!q) return `${urval}<span class="kr-ordning">${ik(dokUi.sortera === 'utgar' ? 'klocka' : dokUi.sortera === 'kund' ? 'kunder' : dokUi.sortera === 'varde' ? 'pengar' : 'klocka')}${e(DOK_ORDNING[dokUi.sortera])}</span>`;
    const forstaPost = lista.length ? ((dokGrupper(lista, kundId)[0] || {}).poster || [])[0] : null; // samma ordning som raderna
    const forst = forstaPost ? `<span class="kr-enter"><kbd>Enter</kbd><span>öppnar ${e(forstaPost.titel)}</span></span>` : '';
    return `${urval}<span class="kr-traffar"><b>${lista.length}</b> ${lista.length === 1 ? 'träff' : 'träffar'}</span>${forst}`;
  };

  function visaDokument(kundId) {
    const k = kundId ? kund(kundId) : null;
    if (kundId && !k) return detaljSaknas('#/dokument', 'Dokument', 'Kunden finns inte', 'Till alla dokument');
    if (dokUi.fack !== 'alla' && !FACK.some((f) => f.id === dokUi.fack)) dokUi.fack = 'alla';
    const allaPoster = dokPoster(k ? k.id : null); const alla = dokVem(allaPoster, k ? k.id : null);
    const vantar = alla.filter((p) => p.lage === 'vantar'); const digVantar = vantar.filter((p) => p.kalla === 'kund');
    const klara = alla.filter((p) => p.kalla === 'kund' && p.lage === 'klar');
    const snart = vantar.filter((p) => p.utgar && dagarTill(p.utgar) <= 7); const utgangna = alla.filter((p) => p.lage === 'utgangen');
    const avtal = alla.filter((p) => p.fack === 'avtal' && p.lage !== 'arkiv');
    const nKlubb = avtal.filter((p) => p.kalla === 'klubbavtal').length;
    const iLage = alla.filter((p) => dokMatchar(p, { fack: 'alla', sok: '' }));
    const ruta = (f, i) => { const n = iLage.filter((p) => p.fack === f.id);
      return `<button class="kr-ruta dk-ruta" type="button" data-s="${f.id}" style="--i:${i}" data-g="dok-fack" data-fack="${f.id}" aria-pressed="${dokUi.fack === f.id}">
        <span class="kr-ruta-etikett"><i aria-hidden="true"></i><span>${e(f.namn)}</span></span><strong class="kr-ruta-tal" data-tal="${n.length}" data-format="antal">${n.length}</strong><span class="kr-ruta-under">${e(fackUnder(f, n))}</span></button>`; };
    const blick = `<div class="kr-blick dk-blick" role="group" aria-label="Arkivet i en blick – välj en typ för att filtrera listan">
        <div class="kr-blick-huvud"><span class="kr-blick-etikett">Arkivet<span class="kr-blick-lang">&nbsp;i en blick</span></span>
          <button class="kr-alla" type="button" data-g="dok-fack" data-fack="alla" aria-pressed="${dokUi.fack === 'alla'}">${emo(UPEMO.kundtyp.alla)}Alla<b data-dk-alla>${iLage.length}</b></button></div>
        <div class="kr-rutor dk-rutor">${FACK.map(ruta).join('')}</div></div>`;
    const antalLage = (id) => alla.filter((p) => dokMatchar(p, { lage: id, sok: '' })).length;
    const sokrad = `<div class="kr-sokrad dk-sokrad">
        <label class="kr-sok">${ik('sok')}<input type="search" placeholder="Sök nummer, kund, affär eller fil" value="${e(dokUi.sok)}" aria-label="Sök bland dokumenten på nummer, kund, affär, filnamn eller status" data-dok-sok autocomplete="off" enterkeyhint="go"><kbd aria-hidden="true">/</kbd></label>
        <div class="dk-val">${k ? '' : dokVemHtml(allaPoster)}
          <label class="dk-valj"><span>Sortera</span><select class="falt" data-dok-sortera aria-label="Sortera">${Object.entries(DOK_SORT).map(([id, t]) => `<option value="${id}" ${dokUi.sortera === id ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="dk-valj"><span>Gruppera</span><select class="falt" data-dok-gruppera aria-label="Gruppera">${Object.entries(DOK_GRUPP).filter(([id]) => !(k && id === 'kund')).map(([id, t]) => `<option value="${id}" ${(k && dokUi.gruppera === 'kund' ? 'fack' : dokUi.gruppera) === id ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
        <div class="dk-lagen" role="group" aria-label="Läge">${DOK_LAGEN.map(([id, t]) => `<button class="dk-lage" type="button" data-g="dok-lage" data-lage="${id}" aria-pressed="${dokUi.lage === id}"${id === 'utgangen' ? ' data-varm' : ''}>${t}<b data-dk-lage-tal="${id}"${antalLage(id) ? '' : ' data-noll'}>${antalLage(id)}</b></button>`).join('')}</div>
        <p class="kr-antal dk-antal" data-dok-antal aria-live="polite">${dokAntalHtml(alla, k ? k.id : null)}</p>
      </div>`;
    // Svarstiden: kundens egen när den har svarat via länk, annars alla kunders (offerter och ordrar)
    const svA = svarstider({ typ: ['offert', 'order'] }); const svK = k ? svarstider({ typ: ['offert', 'order'], kundId: k.id }) : null;
    const sv = svK && svK.nSvar ? svK : svA;
    const svarKort = { emo: 'matare', etikett: k && sv === svK ? 'Kunden svarar på' : 'Kunderna svarar på', text: sv.nSvar ? svarLangd(sv.svar) : 'Inga svar än', bred: true,
      under: !sv.nSvar ? 'räknas när kunderna börjar godkänna och signera via länk'
        : sv === svK ? `median av ${e(plural(sv.nSvar, 'svar', 'svar'))} · alla kunder: ${e(svarLangd(svA.svar))}` : `median av ${e(plural(sv.nSvar, 'svar', 'svar'))} via länk`,
      extra: sv.nSvar ? `<span class="glas-spar" aria-hidden="true"><span><i></i><small>Skickad</small></span><span><i></i><small>Öppnad</small><em>${e(svarLangd(sv.oppna))}</em></span><span><i></i><small>Svar</small><em>${e(svarLangd(sv.svar))}</em></span></span>` : '',
      knapp: `data-g="dok-svarstider" data-kund="${e(k ? k.id : '')}" aria-haspopup="dialog"` };
    const ladda = `<label class="knapp knapp-accent dk-ladda" data-uppladdning data-kund="${e(k ? k.id : '')}" data-affar="">${ik('uppladdning')}Ladda upp<input type="file" multiple data-uppladdning-falt aria-label="Ladda upp dokument${k ? ` till ${e(k.namn)}` : ''}"></label>`;
    return `${sidhjalte({
        ogon: k ? `<a href="#/dokument">${ik('pil-v')}Alla dokument</a>` : 'Dokumentarkivet', titel: k ? e(k.namn) : 'Dokument', accent: k ? '' : '&amp; avtal', klass: 'sidhjalte-dok', attr: `data-dok-fack="${e(dokUi.fack)}"`,
        text: k ? `Allt som har gått till och kommit in från <a href="#/kund/${e(k.id)}">${e(k.namn)}</a> – offerter, ordrar, avtal, underlag och filer.`
          : 'Offerter, ordrar, avtal, kundunderlag och filer – samlade, sorterade och sökbara på ett ställe.<span class="kr-ingress-mer"> Välj en typ, ett läge eller sök – detaljerna öppnas med ett klick.</span>',
        under: k ? '' : dokFlikar('arkiv'),
        knappar: `${ladda}<button class="knapp knapp-spok" type="button" data-g="dok-export">${ik('stapel')}Exportera listan</button>`,
        tal: [
          { emo: UPEMO.sak.vantar, etikett: 'Väntar på svar', varde: vantar.length, under: digVantar.length ? `${e(krKort(sum(digVantar.map((p) => p.varde))))} i offerter och ordrar` : 'inga offerter ute just nu', knapp: `data-g="dok-tal" data-dk-tal="vantar" aria-pressed="${dokTalAktivt('vantar')}"` },
          { emo: UPEMO.sak.signering, etikett: 'Godkänt & signerat', varde: klara.length, under: klara.length ? `${e(krKort(sum(klara.map((p) => p.varde))))} via länk` : 'inget godkänt via länk än', knapp: `data-g="dok-tal" data-dk-tal="signerat" aria-pressed="${dokTalAktivt('signerat')}"` },
          { emo: 'klocka', etikett: 'Går ut inom 7 dagar', varde: snart.length, under: utgangna.length ? `${plural(utgangna.length, 'har', 'har')} redan gått ut` : 'inget har gått ut', knapp: `data-g="dok-tal" data-dk-tal="snart" aria-pressed="${dokTalAktivt('snart')}"` },
          { emo: UPEMO.sak.klubb, etikett: 'Avtal', varde: avtal.length, under: [nKlubb ? plural(nKlubb, 'klubbavtal', 'klubbavtal') : '', avtal.length - nKlubb ? plural(avtal.length - nKlubb, 'avtalsfil', 'avtalsfiler') : ''].filter(Boolean).join(' · ') || 'inga avtal ännu', knapp: `data-g="dok-tal" data-dk-tal="avtal" aria-pressed="${dokTalAktivt('avtal')}"`, ton: 'orange' },
          svarKort,
        ],
        extra: blick + sokrad,
      })}
      <div class="dk-innehall" data-dok-innehall>${dokInnehallHtml(alla, k ? k.id : null)}</div>`;
  }
  // Mina | Alla med antalet i läget (samma räkning som rutorna)
  const dokVemHtml = (allaPoster) => { const vem = dokVemNu(); const n = (lista) => lista.filter((p) => dokMatchar(p, { fack: 'alla', sok: '' })).length;
    return `<div class="dk-vem" role="group" aria-label="Vems dokument">${[['mina', 'Mina', allaPoster.filter(dokMin)], ['alla', 'Alla', allaPoster]].map(([id, t, l]) => `<button type="button" data-g="dok-vem" data-vem="${id}" aria-pressed="${vem === id}" title="${id === 'mina' ? 'Dokument på dina affärer och kunder' : 'Hela teamets dokument'}">${t}<b data-dk-vem-tal="${id}">${n(l)}</b></button>`).join('')}</div>`; };
  // Nytt filter, läge, sökning eller sortering: bara listan och hjältens lägen ritas om (sökfältet behåller fokus)
  function dokUppdatera(mjukt = false) {
    const ruta = $('[data-dok-innehall]', vy); const hjalte = $('.sidhjalte-dok', vy);
    if (!ruta || !hjalte) { rendera(); return; }
    const kundId = (location.hash.match(/^#\/dokument\/([\w-]+)$/) || [])[1] || null;
    const allaPoster = dokPoster(kundId); const alla = dokVem(allaPoster, kundId);
    const fokus = ruta.contains(document.activeElement) ? document.activeElement : null;
    const fokusSel = fokus && fokus.dataset.g ? `[data-g="${sel(fokus.dataset.g)}"]${fokus.dataset.fack ? `[data-fack="${sel(fokus.dataset.fack)}"]` : ''}` : '';
    ruta.innerHTML = dokInnehallHtml(alla, kundId);
    if (fokus) { const mal = (fokusSel && $(fokusSel, ruta)) || $('.dk-grupp h2', ruta) || $('.dk-tomt button, .dk-tomt input', ruta) || $('.kr-alla', hjalte); if (mal) mal.focus({ preventScroll: true }); }
    hjalte.setAttribute('data-dok-fack', dokUi.fack);
    const iLage = alla.filter((p) => dokMatchar(p, { fack: 'alla', sok: '' }));
    $$('.dk-ruta', hjalte).forEach((b) => {
      const f = fackFor(b.dataset.fack); const n = iLage.filter((p) => p.fack === f.id);
      b.setAttribute('aria-pressed', String(dokUi.fack === f.id));
      const tal = $('.kr-ruta-tal', b); tal.textContent = n.length; tal.dataset.tal = n.length; $('.kr-ruta-under', b).textContent = fackUnder(f, n);
    });
    const allaKnapp = $('.kr-alla', hjalte); allaKnapp.setAttribute('aria-pressed', String(dokUi.fack === 'alla')); $('[data-dk-alla]', allaKnapp).textContent = iLage.length;
    $$('.dk-lage', hjalte).forEach((b) => { const n = alla.filter((p) => dokMatchar(p, { lage: b.dataset.lage, sok: '' })).length; b.setAttribute('aria-pressed', String(b.dataset.lage === dokUi.lage)); $('b', b).textContent = n; $('b', b).toggleAttribute('data-noll', !n); });
    const antal = $('[data-dok-antal]', hjalte); if (antal) antal.innerHTML = dokAntalHtml(alla, kundId);
    const arkivTal = $('[data-dk-arkiv-tal]', hjalte); if (arkivTal) arkivTal.textContent = alla.filter((p) => p.lage !== 'arkiv').length;
    $$('[data-g="dok-vem"]', hjalte).forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.vem === dokVemNu(kundId))); const t = $('b', b); if (t) t.textContent = (b.dataset.vem === 'mina' ? allaPoster.filter(dokMin) : allaPoster).filter((p) => dokMatchar(p, { fack: 'alla', sok: '' })).length; });
    $$('[data-dk-tal]', hjalte).forEach((b) => b.setAttribute('aria-pressed', String(dokTalAktivt(b.dataset.dkTal))));
    if (mjukt && !lugn && ruta.animate) ruta.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    fyllSida();
  }

  /* Detaljerna i arket: läget som en tidslinje, fakta, det som hör ihop (samma affär, versioner) och knapparna för läget.
     tyst: arket ritas om efter en åtgärd (förläng, ny version …) – ingen entré och fokus stannar på samma knapp. */
  /* Arkets toppkort (mörkt, som hjältarna): det viktigaste talet, läget som en ring (dagar kvar, andel klar) och tidslinjen.
     Ringen är en stilla båge (stroke-dasharray via --andel) – ingen loop. */
  const dkRing = (r) => (!r ? '' : `<div class="dk-d-ringruta"><div class="dk-d-ring" data-ton="${e(r.ton || 'mint')}"${(r.andel || 0) <= 0 ? ' data-tom' : ''} style="--andel:${Math.max(0, Math.min(1, r.andel || 0)).toFixed(3)}">
      <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="dk-d-ring-bas" cx="22" cy="22" r="19" pathLength="100"/><circle class="dk-d-ring-del" cx="22" cy="22" r="19" pathLength="100"/></svg>
      <span>${r.ikon ? ik(r.ikon) : `<b>${e(r.tal)}</b>${r.enhet ? `<small>${e(r.enhet)}</small>` : ''}`}</span></div><p>${e(r.text)}</p></div>`);
  // Betalplanen: förskott och slutfaktura som en delad stapel (samma andelar och texter som kundens offert)
  const dkBetal = (fd) => { const fp = Math.round(PRISER.forskott * 100);
    return `<div class="dk-d-betal"><div class="dk-d-betal-stapel" role="img" aria-label="Förskott ${fp} procent och slutfaktura ${100 - fp} procent"><i style="flex:${fp}"></i><i style="flex:${100 - fp}"></i></div>
      <div class="dk-d-betal-delar"><div><span><b>${fp} %</b>Förskott</span><strong>${kr(fd.forskott)}</strong><small>Faktureras när ordern är signerad</small></div>
      <div><span><b>${100 - fp} %</b>Slutfaktura</span><strong>${kr(fd.slut)}</strong><small>Efter testdagen och avstämningen</small></div></div></div>`; };
  const dagarMellan = (fran, till) => Math.max(1, Math.round((midnatt(tolka(dagIso(till))) - midnatt(tolka(dagIso(fran)))) / 864e5));
  const kvarRing = (iso, fran, text) => { const n = dagarTill(iso); return { andel: n / dagarMellan(fran, iso), tal: n, enhet: n === 1 ? 'dag' : 'dagar', text: `kvar – ${text.charAt(0).toLowerCase()}${text.slice(1)}`, ton: n <= 5 ? 'gul' : 'mint' }; };
  /* Svarstiderna i ett ark (glaskortet i Dokument): det vanliga – för alla kunder eller kunden – som en tidslinje, per typ och säljare,
     det som väntar just nu mot det vanliga (klick öppnar dokumentet) och hur påminnelserna räknas. Samma byggstenar som dokumentarket. */
  function dokSvarstider(kundId = null) {
    const k = kundId ? kund(kundId) : null; const omfang = k ? { kundId: k.id } : {};
    const t = svarstider({ typ: ['offert', 'order'], ...omfang }); const alla = svarstider({ typ: ['offert', 'order'] });
    const egen = !!k && t.nSvar > 0; const visa = egen ? t : alla; // toppen: kundens egna svar när de finns, annars alla kunders
    const sg = svarGrans(); const sgL = svarGrans(['underlag']); const og = oppnaGrans(); const ogL = oppnaGrans(['underlag']); const nu = new Date().toISOString();
    const stegHtml = `<ol class="dk-steg"><li data-klar><i aria-hidden="true"></i><strong>Skickad</strong><small>Länken skapas</small></li>
      <li${visa.nOppna ? ' data-klar' : ''}><i aria-hidden="true"></i><strong>Öppnad</strong><small>${visa.nOppna ? `efter ${e(svarLangd(visa.oppna))}` : 'Inget öppnat än'}</small></li>
      <li${visa.nSvar ? ' data-klar' : ''}><i aria-hidden="true"></i><strong>Godkänd eller signerad</strong><small>${visa.nSvar ? `efter ${e(svarLangd(visa.svar))}` : 'Inget svar än'}</small></li></ol>`;
    const typRad = ([typ, namn, ord]) => { const x = svarstider({ typ, ...omfang }); if (!x.skickade) return '';
      return `<div class="dk-d-rad"><span class="dk-d-rad-text"><strong>${e(namn)}</strong><small>${x.nOppna ? `öppnas efter ${e(svarLangd(x.oppna))}` : 'inte öppnad än'}${x.nSvar ? ` · ${e(ord)} efter ${e(svarLangd(x.svar))}` : ''}</small></span><span class="chip">${e(plural(x.nSvar, 'svar', 'svar'))} av ${e(x.skickade)}</span></div>`; };
    const perTyp = [['offert', 'Offerter', 'godkänd'], ['order', 'Ordrar', 'signerad'], ['underlag', 'Kundunderlag', 'inskickat']].map(typRad).join('');
    const saljare = k ? [] : [...new Set(svarsMatt().filter((x) => x.saljare && x.svar != null && x.typ !== 'underlag').map((x) => x.saljare))];
    const perSaljare = saljare.map((id) => { const x = svarstider({ typ: ['offert', 'order'], saljare: id });
      return `<div class="dk-d-rad"><span class="dk-d-rad-text"><strong>${e(anv(id).namn)}</strong><small>svar efter ${e(svarLangd(x.svar))}${x.nOppna ? ` · öppnas efter ${e(svarLangd(x.oppna))}` : ''}</small></span><span class="chip">${e(plural(x.nSvar, 'svar', 'svar'))}</span></div>`; }).join('');
    // Det som väntar: öppnat → tiden sedan öppningen mot medianen från öppnad till svar; inte öppnat → tiden sedan det skickades mot
    // öppningen. Över gränsen räknas i hela dagar, precis som påminnelserna i Att hantera.
    const vantar = dokPoster(k ? k.id : null).filter((p) => p.lage === 'vantar' && (p.kalla === 'kund' || p.kalla === 'lank')).map((p) => {
      const d = p.kalla === 'kund' ? db.offerter[p.token] : db.kundlankar[p.token]; const gr = p.kalla === 'lank' ? sgL : sg; const go = p.kalla === 'lank' ? ogL : og;
      const oppnad = !!d.oppnad; const vantat = dygnMellan(oppnad ? d.oppnad : d.skapad, nu);
      const median = oppnad ? gr.median : go.median; const grans = oppnad ? (gr.median != null ? gr.dagar : null) : go.dagar;
      const over = grans != null && dagarSedan(oppnad ? d.oppnad : d.skapad) >= grans; const svarOrd = p.kalla === 'lank' ? 'inskickat' : 'svar';
      const text = oppnad ? `Öppnad för ${svarLangd(vantat)} sedan${median != null ? ` – vanligt: ${svarOrd} ${svarLangd(median)} efter öppning` : ''}` : `Inte öppnad – skickad för ${svarLangd(vantat)} sedan${median != null ? ` – vanligt: öppnas efter ${svarLangd(median)}` : ''}`;
      return { p, over, norm: grans != null, vantat, text };
    }).sort((x, y) => Number(y.over) - Number(x.over) || y.vantat - x.vantat);
    const vantarHtml = vantar.map(({ p, over, norm, text }) => `<button class="dk-d-hor" type="button" data-g="dok-visa" data-id="${e(p.id)}">${dokIkon(p)}<span class="dk-d-rad-text"><strong>${e(p.titel)}${k ? '' : ` · ${e(kundNamn(p.kundId))}`}</strong><small>${e(text)}</small></span>${!norm ? '' : over ? '<span class="chip chip-gul">Längre än vanligt</span>' : '<span class="chip chip-ok">Inom det vanliga</span>'}</button>`).join('');
    const oppnaRegel = og.dagar != null ? ` <strong>Inte öppnad</strong>: när en offert eller order inte öppnats på ${e(plural(og.dagar, 'dag', 'dagar'))} (de öppnas oftast efter ${e(svarLangd(og.median))}).` : '';
    const regler = sg.median != null
      ? `Påminnelserna i Att hantera följer det vanliga. <strong>Inget svar</strong>: när en öppnad offert eller order legat i ${e(plural(sg.dagar, 'dag', 'dagar'))} (kunderna svarar oftast ${e(svarLangd(sg.median))} efter att de öppnat, plus marginal).${oppnaRegel}`
      : `<strong>Inget svar</strong> gäller ${e(plural(sg.dagar, 'dag', 'dagar'))} efter att kunden öppnat, tills ${SVAR_MIN} offerter eller ordrar är besvarade – då styr medianen.${oppnaRegel}`;
    oppnaArk(`${arkHuvud('Svarstider', k ? `Hur snabbt ${k.namn} svarar – jämfört med alla kunder` : 'Hur snabbt kunderna öppnar och svarar på det som skickas via länk', 'matare')}
      <div class="ark-kropp dk-detalj dk-svar" data-dok-svar>
        <section class="dk-d-topp" data-mork-yta data-fack="offert">
          <div class="dk-d-varde"><span>${egen ? 'Kunden svarar på' : 'Kunderna svarar på'}</span><strong class="dk-d-text">${e(visa.nSvar ? svarLangd(visa.svar) : 'Inga svar än')}</strong>
            <small>${egen ? `median av ${e(plural(t.nSvar, 'svar', 'svar'))} · alla kunder: ${e(svarLangd(alla.svar))}` : alla.nSvar ? `median från skickad till godkänd eller signerad · ${e(plural(alla.nSvar, 'svar', 'svar'))}${k ? ` · ${e(k.namn)} har inte svarat via länk än` : ''}` : 'räknas när kunderna börjar svara via länk'}</small></div>
          ${visa.nOppna ? dkRing({ andel: visa.inomDygn, tal: Math.round(visa.inomDygn * 100), enhet: '%', text: 'Öppnas inom ett dygn', ton: 'mint' }) : ''}
          <div class="dk-d-lage"><span class="chip">${ik('klocka')}Inget svar efter ${e(plural(sg.dagar, 'dag', 'dagar'))}</span><span>${sg.median != null ? 'Påminnelsen följer det vanliga' : `Fast gräns tills ${SVAR_MIN} svar finns`}</span></div>
          ${stegHtml}
        </section>
        ${perTyp ? `<div class="dk-d-block"><h3>Per typ</h3>${perTyp}</div>` : ''}
        ${perSaljare ? `<div class="dk-d-block"><h3>Per säljare</h3>${perSaljare}</div>` : ''}
        <div class="dk-d-block"><h3>Väntar på svar just nu</h3>${vantarHtml || `<p class="dk-d-not">Inget ${k ? `till ${e(k.namn)} ` : ''}väntar på svar just nu.</p>`}</div>
        <div class="dk-d-block"><h3>Så räknas det</h3><p class="dk-d-not">Räknat ur offerter, ordrar och kundunderlag som skickats via länk – tiden från att länken skapades tills kunden öppnade och svarade. Medianen används, så att en enstaka offert som legat länge inte flyttar det vanliga.</p><p class="dk-d-not">${regler}</p></div>
      </div>
      <div class="ark-fot dk-d-fot"><button class="knapp knapp-accent" type="button" data-g="stang-ark">Klar</button></div>`, { bred: true });
  }
  function dokDetalj(id, { tyst = false } = {}) {
    const p = dokPoster().find((x) => x.id === id);
    if (!p) { if (ark.open && $('[data-dok-detalj]', ark)) ark.close(); toast('Dokumentet finns inte längre', null, 'varning'); return; }
    const k = kund(p.kundId); const a = p.affarId ? affar(p.affarId) : null; const f = fackFor(p.fack);
    const fakta = []; let steg = []; let extra = ''; const knappar = []; let topp = null; let betal = '';
    const rad = (etikett, varde) => { if (varde) fakta.push([etikett, varde]); };
    const lank = (href, text) => `<a href="${e(href)}">${e(text)}</a>`;
    const tillAffar = a ? `<a class="knapp knapp-spok" href="#/affar/${e(a.id)}">${ik('salj')}Till affären</a>` : '';
    if (p.kalla === 'kund') {
      const d = db.offerter[p.token]; const typ = p.fack; const namn = typ === 'order' ? 'ordern' : 'offerten'; const m = d.makulerad;
      const klar = dokKlar(d); const utg = dokUtgangen(d); const pk = primarKontakt(k); const fd = fakturaDelar(p.varde);
      steg = [['Skapad', d.skapad, true], ['Öppnad av kunden', d.oppnad, !!d.oppnad], [typ === 'order' ? 'Signerad' : 'Godkänd', d.godkand, klar]];
      const ers = dokErsattAv(d);
      if (m) steg.push(['Makulerad', m.tid, true, 'rod']); else if (d.status === 'ersatt' || ers) steg.push(['Ersatt', ers ? ers.tid : d.andrad, true, 'gra']); else if (utg) steg.push(['Gick ut', d.giltigTill, true, 'rod']);
      topp = { etikett: typ === 'order' ? 'Ordervärde' : 'Offererat värde', tal: p.varde, format: 'kr', under: 'exkl. moms',
        ring: klar ? { andel: 1, ikon: 'bock', text: `${typ === 'order' ? 'Signerad' : 'Godkänd'} ${datumText(dagIso(d.godkand), { gemen: true })}`, ton: 'mint' }
          : p.lage === 'arkiv' ? null : utg ? { andel: 0, tal: 0, enhet: 'dagar', text: `Gick ut ${datumText(d.giltigTill, { gemen: true })}`, ton: 'rod' }
          : kvarRing(d.giltigTill, d.skapad, `Gäller till ${datumText(d.giltigTill, { gemen: true })}`) };
      betal = dkBetal(fd);
      rad('Innehåll', e(paketText(d.offert)));
      if (!klar && p.lage !== 'arkiv') rad('Gäller till', `${e(datumText(d.giltigTill, { ar: true }))}${utg ? ' <span class="chip chip-rod">Utgången</span>' : dagarTill(d.giltigTill) > 1 ? ` <small>(${e(utgarText(d.giltigTill))})</small>` : ''}`);
      if (klar) rad(typ === 'order' ? 'Signerad av' : 'Godkänd av', `${e((d.godkandAv && d.godkandAv.namn) || 'Kunden')}${d.godkandAv && d.godkandAv.roll ? `, ${e(d.godkandAv.roll)}` : ''} <small>${e(tidText(d.godkand))}</small>`);
      if (klar || (p.lage !== 'arkiv' && !utg)) rad('Svarstid', svarRad(d.skapad, d.oppnad, klar ? d.godkand : null, typ));
      if (m) rad('Makulerad', `${e(tidText(m.tid))} av ${e(vemText(m.av))}${m.orsak ? ` – ${e(m.orsak)}` : ''}`);
      if (ers) rad('Ersatt av', `${e(ers.nummer)}${ers.tid ? ` <small>${e(tidText(ers.tid))}</small>` : ''}`);
      if (d.ersatter && d.ersatter.nummer) rad('Ersätter', e(d.ersatter.nummer));
      if (typ === 'order' && d.offertNummer) rad('Bygger på', `Offert ${e(d.offertNummer)}`);
      if (d.kontakt && d.kontakt.namn) rad('Kontakt', `${e(d.kontakt.namn)}${d.kontakt.roll ? `, ${e(d.kontakt.roll)}` : ''}`);
      rad('Säljare', e(d.saljare || ''));
      // Alla versioner av samma sorts dokument på affären
      const versioner = Object.entries(db.offerter).filter(([, x]) => x.affarId === d.affarId && (x.typ === 'order' ? 'order' : 'offert') === typ).sort((x, y) => (x[1].skapad < y[1].skapad ? 1 : -1));
      if (versioner.length > 1) extra += `<div class="dk-d-block"><h3>Versioner</h3>${versioner.map(([t, x]) => { const st = x.makulerad ? DOKSTATUS.makulerad : x.status === 'ersatt' || dokErsattAv(x) ? DOKSTATUS.ersatt : dokUtgangen(x) ? DOKSTATUS.utgangen : DOKSTATUS[x.status] || DOKSTATUS.skickad; const nu = t === p.token;
        return `<div class="dk-d-rad"${nu ? ' aria-current="true"' : ''}><span class="dk-d-rad-text"><strong>${e(x.nummer)}</strong><small>Skapad ${e(datumText(dagIso(x.skapad), { gemen: true }))} · ${kr(prisaOffert(x.offert).total)}</small></span><span class="chip ${st[1]}">${e(st[0])}</span>${nu ? '<span class="dk-d-nu">Visas</span>' : `<button class="knapp knapp-spok knapp-liten" type="button" data-g="dok-visa" data-id="o-${e(t)}">Visa</button>`}</div>`; }).join('')}</div>`;
      const kanNy = a && arOppen(a) && !lastOffert(a) && (dokFor(a.id, typ) || {}).token === p.token && (utg || (!klar && dokAndrad(d, a)));
      if (kanNy) knappar.push(`<button class="knapp knapp-accent" type="button" data-g="skapa-dokument" data-affar="${e(a.id)}" data-typ="${e(typ)}">${ik('plus')}${utg ? 'Skapa ny version' : 'Affären har ändrats – ny version'}</button>`);
      knappar.push(`<a class="knapp ${kanNy ? 'knapp-kontur' : 'knapp-accent'}" href="${e(dokUrl(p.token))}" target="_blank" rel="noopener">${ik('helskarm')}Öppna ${namn}</a>`);
      if (!utg && p.lage !== 'arkiv') knappar.push(`<button class="knapp knapp-kontur" type="button" data-g="kopiera-dokument" data-token="${e(p.token)}">${ik('lank')}Kopiera länk</button>`);
      if (pk && pk.epost && !klar && !utg && p.lage !== 'arkiv') knappar.push(`<a class="knapp knapp-spok" href="mailto:${e(pk.epost)}?subject=${encodeURIComponent(`${typ === 'order' ? 'Order' : 'Offert'} ${d.nummer} – Uperformance`)}&amp;body=${encodeURIComponent(`Hej ${pk.namn.split(' ')[0]}!\n\nHär är ${namn} (${d.nummer}):\n${dokUrl(p.token)}\n\nVänliga hälsningar\n${a ? anv(a.ansvarig).namn : 'Uperformance'}, Uperformance`)}">${ik('mejl')}E-posta</a>`);
      knappar.push(tillAffar);
      if (klar && SKARP && arAdmin()) knappar.push(`<button class="knapp knapp-fara" type="button" data-g="makulera-dokument" data-token="${e(p.token)}" title="Bara för administratörer – åtgärden loggas">Makulera</button>`);
    } else if (p.kalla === 'lank') {
      const l = db.kundlankar[p.token]; const n = (l.deltagare || []).length; const sm = summeraUnderlag(l); const inne = l.status === 'inskickad';
      steg = [['Skapad', l.skapad, true], ['Öppnad av kunden', l.oppnad, !!l.oppnad], ['Kunden fyller i', l.status === 'paborjad' ? l.andrad : '', l.status === 'paborjad' || inne], ['Inskickat', l.inskickad, inne]];
      if (l.sparrad) steg.push(['Spärrad', l.sparrad, true, 'rod']); else if (lankUtgangen(l)) steg.push(['Gick ut', l.utgar, true, 'rod']);
      rad('Deltagare', n ? `${plural(n, 'deltagare', 'deltagare')} <small>${e(Object.entries(sm.perPaket).filter(([, x]) => x).map(([id, x]) => `${(PRISER.paket[id] || {}).namn || id} ${x}`).join(' · '))}</small>` : 'Inga ännu');
      topp = { etikett: n ? 'Preliminärt värde' : 'Deltagare', tal: n ? p.varde : 0, format: n ? 'kr' : 'antal', under: n ? 'exkl. moms · räknat på deltagarna' : 'kunden har inte lagt till någon än',
        ring: inne ? { andel: 1, ikon: 'bock', text: `Inskickat ${datumText(dagIso(l.inskickad), { gemen: true })}`, ton: 'mint' } : l.sparrad ? null
          : lankUtgangen(l) ? { andel: 0, tal: 0, enhet: 'dagar', text: 'Länken har gått ut', ton: 'rod' } : kvarRing(l.utgar, l.skapad, `Länken gäller till ${datumText(l.utgar, { gemen: true })}`) };
      if (!inne && !l.sparrad) rad('Gäller till', `${e(datumText(l.utgar, { ar: true }))}${dagarTill(l.utgar) > 1 ? ` <small>(${e(utgarText(l.utgar))})</small>` : ''}`);
      if (inne) rad('Inskickat', e(tidText(l.inskickad)));
      if (inne || (p.lage === 'vantar' && !l.sparrad)) rad('Svarstid', svarRad(l.skapad, l.oppnad, inne ? l.inskickad : null, 'underlag'));
      if (a) rad('I offerten', a.offert.underlag === p.token ? 'Ja – offerten bygger på underlaget' : inne ? 'Nej – inte använt än' : 'Inte än');
      if (HALSA && n) {
        const hl = halsoLage(l, db.halsoformular);
        extra += `<div class="dk-d-block"><h3>Hälsoformulär</h3><div class="dk-d-matare"><span style="--andel:${hl.totalt ? hl.klara / hl.totalt : 0}"></span></div><p class="dk-d-not">${hl.klara} av ${hl.totalt} deltagare har svarat. Svaren går bara till testteamet – här syns bara läget.</p></div>`;
      }
      if (inne && a && arOppen(a) && a.offert.underlag !== p.token && n) knappar.push(`<button class="knapp knapp-accent" type="button" data-g="anvand-underlag" data-affar="${e(a.id)}" data-token="${e(p.token)}">${ik('bock')}Använd i offerten</button>`);
      if (!l.sparrad && p.lage !== 'arkiv' && !inne && l.utgar && dagarTill(l.utgar) <= 5) knappar.push(`<button class="knapp ${knappar.length ? 'knapp-kontur' : 'knapp-accent'}" type="button" data-g="forlang-lank" data-token="${e(p.token)}">${ik('klocka')}Förläng 30 dagar</button>`);
      if (!l.sparrad && p.lage !== 'arkiv' && !lankUtgangen(l)) knappar.push(`<button class="knapp ${knappar.length ? 'knapp-kontur' : 'knapp-accent'}" type="button" data-g="kopiera-lank" data-token="${e(p.token)}">${ik('lank')}Kopiera länk</button>`);
      if (n) knappar.push(`<button class="knapp knapp-spok" type="button" data-g="visa-deltagare" data-token="${e(p.token)}">${ik('anstallda')}Deltagarlistan</button>`);
      knappar.push(tillAffar);
    } else if (p.kalla === 'projekt') {
      const pr = projekt(p.projektId); const uk = underlagKomplett(pr.underlag); const u = pr.underlag || {};
      steg = [['Skickad till testteamet', pr.skickad, true], [pr.underlagStatus === 'returnerat' ? 'Returnerad' : 'Godkänd av testteamet', '', pr.underlagStatus === 'komplett' || pr.underlagStatus === 'returnerat', pr.underlagStatus === 'returnerat' ? 'rod' : ''], ['Testdag', pr.testdatum, !!pr.testdatum && dagarTill(pr.testdatum) <= 0]];
      topp = { etikett: 'Underlaget', text: `${uk.klara} av ${uk.totalt}`, under: uk.saknas.length ? `uppgifter klara – saknas: ${uk.saknas.join(', ').toLowerCase()}` : 'uppgifter klara – komplett',
        ring: { andel: uk.totalt ? uk.klara / uk.totalt : 0, tal: `${Math.round((uk.totalt ? uk.klara / uk.totalt : 0) * 100)}`, enhet: '%', text: p.status[0], ton: pr.underlagStatus === 'returnerat' ? 'rod' : uk.komplett ? 'mint' : 'gul' } };
      if (pr.testdatum) rad('Testdag', e(datumText(pr.testdatum, { ar: true })));
      if (pr.ansvarigTest) rad('Testansvarig', e(anv(pr.ansvarigTest).namn));
      if (pr.genomforda) rad('Genomförda tester', e(String(pr.genomforda)));
      extra += `<div class="dk-d-block"><h3>Underlaget</h3><dl class="dk-fakta dk-fakta-tat">${UNDERLAG_FALT.map((x) => `<div><dt>${e(x.etikett)}</dt><dd>${u[x.id] ? e(u[x.id]) : '<span class="kr-tom">–</span>'}</dd></div>`).join('')}</dl>
        <div class="dk-d-kontroll">${UNDERLAG_KONTROLL.map((x) => `<span class="chip ${u[x.id] ? 'chip-ok' : 'chip-gul'}">${ik(u[x.id] ? 'bock' : 'varning')}${e(x.etikett)}</span>`).join('')}</div></div>`;
      knappar.push(`<a class="knapp knapp-accent" href="#/projekt/${e(pr.id)}">${ik('projekt')}Till projektet</a>`, tillAffar);
    } else if (p.kalla === 'fil') {
      const d = db.dokument.find((x) => x.id === p.filId); const ljud = p.kat === 'mote';
      // Från mall: dokumentet är skapat i CRM:et, inte uppladdat
      const hur = ljud ? 'inspelad' : d.mall ? 'skapad' : 'uppladdad';
      topp = { etikett: DOK_KAT[p.kat], text: ljud ? langdText(d.langd) || 'Inspelning' : [p.ext, storlekText(d.storlek)].filter(Boolean).join(' · '), under: `${hur} ${datumText(dagIso(d.tid), { gemen: true })} av ${anv(d.av).namn}` };
      rad('Typ', e(DOK_KAT[p.kat]));
      rad(ljud ? 'Längd' : 'Format', e(ljud ? langdText(d.langd) || '–' : [p.ext, storlekText(d.storlek)].filter(Boolean).join(' · ')));
      rad(hur.charAt(0).toUpperCase() + hur.slice(1), `${e(tidText(d.tid))} <small>av ${e(anv(d.av).namn)}</small>`);
      if (d.mall && mallFor(d.mall)) extra += `<div class="dk-d-block"><div class="dokrad dk-d-fil">${dokIkon(p)}<span class="lank-rad-text"><strong>${e(d.namn)}</strong><small>Skapad från mallen ${e(mallFor(d.mall).namn)} – kan laddas ner, skrivas ut och ändras</small></span><button class="knapp knapp-accent knapp-liten" type="button" data-g="oppna-dok" data-id="${e(d.id)}">Öppna</button></div></div>`;
      else extra += `<div class="dk-d-block"><div class="dokrad dk-d-fil">${dokIkon(p)}<span class="lank-rad-text"><strong>${e(d.namn)}</strong><small>${e(p.under)}</small></span><button class="knapp knapp-accent knapp-liten" type="button" data-g="oppna-dok" data-id="${e(d.id)}">Öppna</button></div>
        ${d.exempel ? `<p class="dk-d-not">Exempeldokument – ${SKARP ? 'det finns ingen riktig fil bakom' : 'i prototypen finns ingen riktig fil bakom'}.</p>` : !SKARP ? '<p class="dk-d-not">Prototyp: filen går att öppna under den här sessionen.</p>' : ''}</div>`;
      knappar.push(tillAffar || (k ? `<a class="knapp knapp-spok" href="#/kund/${e(k.id)}">${ik('kunder')}Till kunden</a>` : ''));
    } else if (p.kalla === 'klubbavtal') {
      const ka = k.klubbavtal; const st = klubbStat(k);
      topp = { etikett: 'Provision hittills', tal: st.utbetalt + st.attBetala + st.upplupen, format: 'kr', under: `${ka.procent} % av ordervärdet för företag som klubben introducerar`,
        ring: { andel: st.introducerade ? st.vunna / st.introducerade : 0, tal: st.vunna, enhet: `av ${st.introducerade}`, text: 'Introducerade som blivit kunder', ton: 'orange' } };
      rad('Provision', `${e(ka.procent)} % av ordervärdet <small>för företag som klubben introducerar</small>`);
      rad('Utbetalning', ka.form && ka.form !== 'oklart' ? e(UTBETALNING[ka.form]) : '<span class="chip chip-gul">Inte vald än</span>');
      rad('Avtal sedan', e(datumText(ka.sedan, { ar: true })));
      if (ka.partners) rad('Klubbens partners', e(String(ka.partners)));
      rad('Introducerade', plural(st.introducerade, 'företag', 'företag') + (st.vunna ? ` <small>${st.vunna} har blivit kunder</small>` : ''));
      const prov = [['Utbetalt', st.utbetalt, 'utbetald'], ['Att betala', st.attBetala, 'att-betala'], ['Upplupen', st.upplupen, 'upplupen'], ['Prognos', st.prognos, 'prognos']].filter(([, v]) => v);
      if (prov.length) extra += `<div class="dk-d-block"><h3>Provisionen</h3>${prov.map(([t, v, s]) => `<div class="dk-d-rad"><span class="dk-d-rad-text"><strong>${kr(v)}</strong></span>${kbChip(s)}</div>`).join('')}</div>`;
      if (st.intro.length) extra += `<div class="dk-d-block"><h3>Introducerade företag</h3><div class="dk-d-kunder">${st.intro.slice(0, 8).map((x) => `<a class="chip" href="#/kund/${e(x.id)}">${e(x.namn)}</a>`).join('')}${st.intro.length > 8 ? `<span class="chip">+${st.intro.length - 8}</span>` : ''}</div></div>`;
      knappar.push(`<a class="knapp knapp-accent" href="#/kund/${e(k.id)}">${ik('klubb')}Till klubben</a>`, `<a class="knapp knapp-spok" href="#/klubbmotorn">${ik('mynt')}Klubbmotorn</a>`);
    }
    if (k) rad('Kund', `${lank(`#/kund/${k.id}`, k.namn)}${k.orgnr ? ` <small>${e(k.orgnr)}</small>` : ''}`);
    if (a) rad('Affär', `${lank(`#/affar/${a.id}`, a.titel)} ${stegChip(a)}`);
    // Det som hör ihop: samma affär – eller klubbens egna avtalsfiler
    const alla = dokPoster(p.kundId);
    const hor = alla.filter((x) => x.id !== p.id && (a ? x.affarId === a.id : p.kalla === 'klubbavtal' ? x.fack === 'avtal' : false) && !(p.kalla === 'kund' && x.kalla === 'kund' && x.fack === p.fack)).sort((x, y) => (x.tid < y.tid ? 1 : -1));
    if (hor.length) extra += `<div class="dk-d-block"><h3>${a ? 'Samma affär' : 'Klubbens avtal'}</h3>${hor.map((x) => `<button class="dk-d-hor" type="button" data-g="dok-visa" data-id="${e(x.id)}">${dokIkon(x)}<span class="dk-d-rad-text"><strong>${e(x.titel)}</strong><small>${e(x.detalj)}</small></span>${dokChip(x)}</button>`).join('')}</div>`;
    const fokus = tyst && ark.contains(document.activeElement) ? ['g', 'id', 'token', 'affar', 'typ'].filter((x) => document.activeElement.dataset && document.activeElement.dataset[x]).map((x) => `[data-${x}="${sel(document.activeElement.dataset[x])}"]`).join('') : '';
    const stegHtml = steg.length ? `<ol class="dk-steg">${steg.map(([namn, tid, klar, ton]) => `<li${klar ? ' data-klar' : ''}${ton ? ` data-ton="${ton}"` : ''}><i aria-hidden="true"></i><strong>${e(namn)}</strong><small>${tid ? e(tidText(tid)) : klar ? '' : 'Inte än'}</small></li>`).join('')}</ol>` : '';
    oppnaArk(`${arkHuvud(p.titel, [k && k.namn, p.under].filter(Boolean).join(' · '), DK_IKON[p.kat] || f.ikon)}
      <div class="ark-kropp dk-detalj" data-dok-detalj="${e(p.id)}">
        <section class="dk-d-topp" data-mork-yta data-fack="${e(p.fack)}">
          <div class="dk-d-varde"><span>${e(topp ? topp.etikett : f.namn)}</span>${topp && topp.tal != null ? `<strong data-tal="${e(topp.tal)}" data-format="${e(topp.format)}">${formatera(topp.tal, topp.format)}</strong>` : `<strong class="dk-d-text">${e(topp ? topp.text : p.titel)}</strong>`}${topp && topp.under ? `<small>${e(topp.under)}</small>` : ''}</div>
          ${topp ? dkRing(topp.ring) : ''}
          <div class="dk-d-lage">${dokChip(p)}<span>${e(p.detalj)}</span></div>
          ${stegHtml}
        </section>
        ${betal}
        <dl class="dk-fakta">${fakta.map(([t, v]) => `<div><dt>${e(t)}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${extra}
      </div>
      <div class="ark-fot dk-d-fot">${knappar.filter(Boolean).join('')}</div>`, { bred: true });
    if (!tyst) $$('.dk-d-varde [data-tal]', ark).forEach(raknaUpp); // talet räknas upp när arket öppnas (inte vid omritning)
    if (tyst) {
      $$('.ark-kropp > *, .dk-d-ring-del, .dk-d-betal-stapel i', ark).forEach((x) => { x.style.animation = 'none'; });
      const mal = fokus && $(fokus, ark); if (mal) mal.focus();
    }
  }
  // Export: listan som den är filtrerad (inga personuppgifter – bara dokument, kund, läge, belopp och datum; Detalj utan namn och fritext, detaljUt)
  function dokExport() {
    const kundId = (location.hash.match(/^#\/dokument\/([\w-]+)$/) || [])[1] || null;
    const lista = dokSortera(dokVem(dokPoster(kundId), kundId).filter((p) => dokMatchar(p)));
    if (!lista.length) { toast('Listan är tom – inget att exportera', null, 'varning'); return; }
    const lageNamn = (id) => (DOK_LAGEN.find(([x]) => x === id) || [])[1] || id;
    const rader = [['Typ', 'Dokument', 'Nummer', 'Kund', 'Affär', 'Status', 'Läge', 'Detalj', 'Värde (kr)', 'Skapad', 'Senast ändrad', 'Gäller till'],
      ...lista.map((p) => [fackFor(p.fack).namn, p.titel, p.nummer, dokKundNamn(p), (affar(p.affarId) || {}).titel || '', p.status[0], lageNamn(p.lage), p.detaljUt || '', p.varde ? Math.round(p.varde) : '', dagIso(p.skapad), dagIso(p.tid), p.utgar || ''])];
    const csv = '﻿' + rader.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `uperformance-dokument${kundId ? `-${kundId}` : ''}-${idag()}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`${plural(lista.length, 'rad', 'rader')} exporterade till CSV`, null, 'stapel');
  }
  // Tangenterna: "/" söker, Enter i sökfältet öppnar första träffen, Esc tömmer, pil ned/upp går mellan dokumenten
  document.addEventListener('keydown', (ev) => {
    const sokEl = $('[data-dok-sok]', vy); if (!sokEl || !ev.target.closest || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const rader = () => $$('.dk-namn, .dk-kort', vy).filter((x) => x.getClientRects().length);
    if (ev.key === '/' && !ev.target.closest('input, textarea, select, [contenteditable], dialog') && !document.querySelector('.mote')) { ev.preventDefault(); ev.stopPropagation(); sokEl.focus(); sokEl.select(); return; }
    if (ev.target === sokEl) {
      if (ev.key === 'Enter') { const f = rader()[0]; if (f) { ev.preventDefault(); f.focus(); dokDetalj(f.dataset.id); } }
      else if (ev.key === 'ArrowDown') { const f = rader()[0]; if (f) { ev.preventDefault(); f.focus(); } }
      else if (ev.key === 'Escape' && sokEl.value) { ev.preventDefault(); sokEl.value = ''; dokUi.sok = ''; dokUppdatera(); }
      return;
    }
    const rad = ev.target.closest('.dk-namn, .dk-kort');
    if (!rad || (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp')) return;
    const alla = rader(); const i = alla.indexOf(rad); if (i < 0) return;
    ev.preventDefault();
    const nasta = ev.key === 'ArrowDown' ? alla[i + 1] : i ? alla[i - 1] : sokEl;
    if (nasta) { nasta.focus(); if (nasta !== sokEl) (nasta.closest('tr') || nasta).scrollIntoView({ block: 'nearest' }); }
  });

  /* 10c-mallar: mallar och formulär (#/dokument/mallar) ----------------------------------------------------- */
  /* Mallarna teamet använder: offert och order (digitala – skapas på affären och godkänns via länk), avtal (Klubbmotorn, PUB),
     formulär till kund och deltagare (deltagarlista, hälsoformulär, information och samtycke) och överlämningen till testteamet.
     Varje mall har ett exempel (ur exempeldatan), kan laddas ner (Word) eller skrivas ut (PDF) och skapas ny: fälten fylls i
     från CRM:et (kund, affär, klubbavtal), förhandsvisningen ritas om medan man skriver och det som saknas står i [hakparentes].
     Avtalen är mallar – texten granskas av jurist innan de används skarpt. Ett skapat dokument sparas som utkast på kunden
     (db.dokument med mall + falt) och kan öppnas, laddas ner och ändras. Förslag just nu (mallForslag) pekar ut det som saknas. */
  const MALL_GRUPPER = [
    ['offert', 'Offert & order', 'Skickas till kunden som en länk – kunden godkänner och signerar digitalt.'],
    ['avtal', 'Avtal', 'Fyll i, ladda ner och skriv under. Mallarna granskas av jurist innan de används skarpt.'],
    ['formular', 'Formulär till kund och deltagare', 'Det kunden och deltagarna fyller i inför testdagen.'],
    ['internt', 'Internt', 'Checklistor för teamet.'],
  ];
  const langtDatum = (iso) => { const d = iso ? tolka(String(iso).slice(0, 10)) : null; return d && !isNaN(d) ? d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  const filnamn = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  const mallKontext = (kundId, affarId) => {
    const a = affarId ? affar(affarId) : null; const k = kund(kundId || (a && a.kundId)) || null;
    const l = a ? (a.offert.underlag && db.kundlankar[a.offert.underlag]) || lankFor(a.id) || null : null;
    return { k, a, pk: primarKontakt(k) || {}, l, lf: (l && l.foretag) || {}, p: a ? projektForAffar(a.id) || null : null };
  };
  const ansvarigNamn = (c) => anv((c.a && c.a.ansvarig) || jag).namn;
  const UTB_TEXT = { kontant: 'kontant', sponsorvarde: 'som värde i klubbens sponsorpaket' };
  const KRYSS = '☐'; const KRYSSAD = '☑';

  // Papperet: samma uppbyggnad i förhandsvisningen, utskriften och Word-filen (utkast = mallen markeras som juristgranskad text)
  /* Papperet: rubrikraden i Uperformances mörka yta med U-märket, mallens ton i accenten (data-ton, sätts av tona), uppgifterna i en rad,
     numrerade avsnitt ("1. Parter" → nummerbricka), tabeller, frågor med svarslinjer, signaturrutor per part och sidfot. Tabeller i stället
     för flex där Word-filen ska se likadan ut. sign: { parter: [...], rader: [...] } – en kolumn per part. */
  const mpRubrik = (h) => { const m = String(h).match(/^(\d+)\.\s*(.*)$/); return m ? `<h3><b>${m[1]}</b>${m[2]}</h3>` : `<h3><i aria-hidden="true"></i>${h}</h3>`; };
  const mallPapper = ({ titel, under = '', meta = [], delar = [], not = '', sign = null }) => `<article class="mall-papper">
      <table class="mp-huvud" role="presentation"><tr>
        <td class="mp-huvud-v"><span class="mp-marke"><svg class="mp-u" viewBox="0 0 396 395" aria-hidden="true"><use href="#u-mark"/></svg><span>Uperformance<small>Skadeförebyggande hälsoanalys</small></span></span></td>
        <td class="mp-titel"><span>${under}</span><strong>${titel}</strong></td></tr></table>
      ${meta.length ? `<table class="mp-meta" role="presentation"><tr>${meta.map(([t, x]) => `<td><span>${e(t)}</span><strong>${x}</strong></td>`).join('')}</tr></table>` : ''}
      <div class="mp-kropp">
      ${not ? `<p class="mp-not"><b aria-hidden="true">!</b><span>${not}</span></p>` : ''}
      ${delar.map(([h, x]) => `<section class="mp-del">${h ? mpRubrik(h) : ''}<div class="mp-text">${x}</div></section>`).join('')}
      ${sign ? `<section class="mp-del mp-under"><h3><i aria-hidden="true"></i>${(sign.parter || []).length > 1 ? 'Underskrifter' : 'Underskrift'}</h3><table class="mp-sign" role="presentation"><tr>${(sign.parter || ['']).map((p) => `<td>${p ? `<strong>${p}</strong>` : ''}${sign.rader.map((r) => `<p><span></span><small>${r}</small></p>`).join('')}</td>`).join('')}</tr></table></section>` : ''}
      </div>
      <table class="mp-fot" role="presentation"><tr><td>Uperformance AB · Skadeförebyggande hälsoanalys – byggt på elitidrottens metodik</td><td>${titel}</td></tr></table></article>`;
  // Mallens ton på papperet (accentfärgen i rubrikraden, numren och tabellerna)
  const tona = (html, ton) => String(html || '').replace('<article class="mall-papper">', `<article class="mall-papper" data-ton="${e(ton || 'navy')}">`);
  const JURIST = 'Mall – texten granskas av jurist innan avtalet används. Uppgifter i [hakparentes] fylls i.';
  const SIGN_TVA = (vem) => ({ parter: [vem, 'Uperformance AB'], rader: ['Ort och datum', 'Underskrift', 'Namnförtydligande'] });

  // Offert och order ur affären (samma rader, betalplan och villkor som kundens digitala dokument)
  function offertPapper(a, typ) {
    const k = kund(a.kundId) || {}; const pk = primarKontakt(k) || {}; const o = a.offert; const pr = prisaOffert(o); const fd = fakturaDelar(pr.total);
    const fp = Math.round(PRISER.forskott * 100); const d = dokFor(a.id, typ); const order = typ === 'order';
    // Befintligt dokument med samma innehåll: dess nummer och giltighet. Ändrad affär: en ny version – numret sätts när länken skapas.
    const samma = d && !dokAndrad(d, a);
    const giltig = langtDatum(samma && d.giltigTill ? d.giltigTill : omDagar(order ? 14 : 30));
    const spec = `<table class="mp-tabell"><thead><tr><th>Beskrivning</th><th>Antal</th><th>À-pris</th><th>Summa</th></tr></thead><tbody>${offertRader(o).map((r) => `<tr><td><strong>${e(r.text)}</strong>${r.detalj ? `<small>${e(r.detalj)}</small>` : ''}</td><td>${e(r.antal)}</td><td>${r.apris == null ? 'Offert' : kr(r.apris)}</td><td>${r.summa == null ? 'Offereras' : kr(r.summa)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Summa exkl. moms</td><td>${kr(pr.total)}</td></tr></tfoot></table><p class="mp-liten">Moms tillkommer enligt gällande regler.</p>`;
    return mallPapper({ titel: order ? 'Order' : 'Offert', under: e(samma ? d.nummer : d ? 'Ny version – numret sätts när länken skapas' : 'Numret sätts när länken skapas'),
      meta: [['Till', `${e(k.namn || '')}${k.orgnr ? `<small>Org.nr ${e(k.orgnr)}</small>` : ''}`], ...(pk.namn ? [['Er referens', e(pk.namn)]] : []), ['Vår referens', e(anv(a.ansvarig).namn)], [order ? 'Signeras senast' : 'Giltig till', e(giltig)]],
      delar: [
        [e(a.titel), `<p>${e(order ? `Här är ordern för ${a.titel}. Signera ordern så fakturerar vi förskottet och vårt testteam kontaktar er för att boka testdagen.` : `Tack för ett bra möte. Här är vårt förslag på ${a.titel} för ${k.namn}.`)}</p>`],
        ['Specifikation', spec],
        ['Betalningsplan', `<p>Förskott ${fp} %: <strong>${kr(fd.forskott)}</strong> – faktureras när ordern är signerad.<br>Slutfaktura ${100 - fp} %: <strong>${kr(fd.slut)}</strong> – efter testdagen och avstämning av genomfört mot beställt.</p>`],
        ['Villkor', `<ul><li>Priserna är exklusive moms och gäller per testtillfälle.</li>${order ? '' : `<li>Offerten gäller till och med ${e(giltig)}.</li>`}<li>Förskott om ${fp} % faktureras när ordern är signerad. Resterande belopp faktureras efter testdagen och avstämningen.</li><li>Innan testerna tecknas personuppgiftsbiträdesavtal, och varje deltagare lämnar sitt samtycke.</li><li>Medicinsk data hanteras av extern tredjepart. Ni som arbetsgivare får en sammanställd rapport på organisationsnivå.</li></ul>`],
      ],
      sign: SIGN_TVA(e(k.namn || 'kunden')) });
  }

  const UNDERLAG_KRYSS = UNDERLAG_KONTROLL.map((x) => ({ id: x.id, etikett: x.etikett, typ: 'kryss', valfri: true }));
  const MALLAR = [
    { id: 'offert', grupp: 'offert', namn: 'Offert', ikon: UPEMO.sak.offert, ton: 'is', typ: 'digital', valj: 'oppen', exempel: { affarId: 'a2' },
      kort: 'Förslaget till kunden med specifikation, betalplan och villkor. Kunden godkänner direkt i länken.', nar: 'Kundbesök → Offert skickad', format: ['Digital länk', 'Word', 'PDF'] },
    { id: 'order', grupp: 'offert', namn: 'Order', ikon: UPEMO.sak.order, ton: 'mint', typ: 'digital', valj: 'oppen', exempel: { affarId: 'a1' },
      kort: 'Beställningen som kunden signerar digitalt – med leverans och deltagarbilaga när underlaget är inne.', nar: 'Underlag & samtycke → Order signerad', format: ['Digital länk', 'Word', 'PDF'] },
    { id: 'klubbavtal', grupp: 'avtal', namn: 'Klubbmotorn-avtal', ikon: UPEMO.sak.klubb, ton: 'orange', typ: 'dokument', kategori: 'avtal', valj: 'klubb', exempel: { kundId: 'k1' }, filnamn: 'Avtal Klubbmotorn',
      kort: 'Avtal med en klubb om provision för företag som klubben introducerar.', nar: 'När en klubb ansluter till Klubbmotorn', format: ['Word', 'PDF'],
      falt: [{ id: 'klubb', etikett: 'Klubbens namn' }, { id: 'orgnr', etikett: 'Organisationsnummer' }, { id: 'kontakt', etikett: 'Klubbens kontaktperson' }, { id: 'roll', etikett: 'Kontaktpersonens roll', valfri: true },
        { id: 'procent', etikett: 'Provision (%)', typ: 'number' }, { id: 'form', etikett: 'Utbetalning', typ: 'select', val: [['', 'Inte bestämd ännu'], ['kontant', 'Kontant'], ['sponsorvarde', 'Värde i sponsorpaket']] },
        { id: 'start', etikett: 'Gäller från', typ: 'date' }, { id: 'uppsagning', etikett: 'Uppsägningstid (månader)', typ: 'number' }, { id: 'uperf', etikett: 'Kontaktperson på Uperformance' }],
      fyll: (c) => ({ klubb: c.k.namn, orgnr: c.k.orgnr || '', kontakt: c.pk.namn || '', roll: c.pk.roll || '', procent: c.k.klubbavtal ? c.k.klubbavtal.procent : Math.round(KLUBBMOTORN.provision * 100),
        form: c.k.klubbavtal && UTB_TEXT[c.k.klubbavtal.form] ? c.k.klubbavtal.form : '', start: (c.k.klubbavtal && c.k.klubbavtal.sedan) || idag(), uppsagning: '', uperf: anv(jag).namn }),
      papper: (v, m) => mallPapper({ titel: 'Avtal om Klubbmotorn', under: 'Samarbetsavtal', not: JURIST,
        meta: [['Klubb', m('klubb')], ['Provision', `${m('procent')} %`], ['Gäller från', m('start')]],
        delar: [
          ['1. Parter', `<p><strong>${m('klubb')}</strong>, org.nr ${m('orgnr')} (”Klubben”), kontaktperson ${m('kontakt')}${v.roll ? `, ${e(v.roll)}` : ''}.<br><strong>Uperformance AB</strong> (”Uperformance”), kontaktperson ${m('uperf')}.</p>`],
          ['2. Syfte', '<p>Klubben introducerar företag i sitt nätverk – partner, sponsorer och andra kontakter – för Uperformances hälsokartläggning. Uperformance sköter offert, testdag och uppföljning med företaget.</p>'],
          ['3. Provision', `<p>Klubben får ${m('procent')} % av ordervärdet exklusive moms för varje affär med ett företag som Klubben har introducerat.</p>`],
          ['4. Intjänande och utbetalning', `<p>Provisionen är en prognos så länge affären är öppen, blir upplupen när företaget har signerat ordern och betalas ut när slutfakturan har skickats efter testdagen. Utbetalning sker ${UTB_TEXT[v.form] || mtom('kontant eller som värde i sponsorpaket')}.</p>`],
          ['5. Redovisning', '<p>Uperformance redovisar löpande vilka företag Klubben har introducerat, affärernas läge och provisionen.</p>'],
          ['6. Avtalstid', `<p>Avtalet gäller från ${m('start')} och löper tills vidare med ${m('uppsagning')} månaders ömsesidig uppsägningstid.</p>`],
        ], sign: SIGN_TVA(m('klubb')) }) },
    { id: 'pub', grupp: 'avtal', namn: 'PUB-avtal', ikon: 'skold', ton: 'gul', typ: 'dokument', kategori: 'pub', valj: 'affar', exempel: { affarId: 'a5' }, filnamn: 'PUB-avtal',
      kort: 'Personuppgiftsbiträdesavtal: hur Uperformance behandlar deltagarnas uppgifter åt kunden. Krävs före testdagen.', nar: 'Underlag & samtycke (kontrollpunkt PUB-avtal)', format: ['Word', 'PDF'],
      falt: [{ id: 'kund', etikett: 'Kund (personuppgiftsansvarig)' }, { id: 'orgnr', etikett: 'Organisationsnummer' }, { id: 'kontakt', etikett: 'Kundens kontaktperson' }, { id: 'roll', etikett: 'Kontaktpersonens roll', valfri: true },
        { id: 'epost', etikett: 'Kontaktpersonens e-post', typ: 'email' }, { id: 'antal', etikett: 'Antal deltagare', typ: 'number' }, { id: 'period', etikett: 'Testperiod' },
        { id: 'underbitrade', etikett: 'Underbiträde för medicinsk data' }, { id: 'lagring', etikett: 'Lagringstid efter testdagen' }, { id: 'uperf', etikett: 'Kontaktperson på Uperformance' }],
      fyll: (c) => ({ kund: c.lf.namn || c.k.namn, orgnr: c.lf.orgnr || c.k.orgnr || '', kontakt: c.lf.kontakt || c.pk.namn || '', roll: c.pk.roll || '', epost: c.lf.epost || c.pk.epost || '',
        antal: (c.l && (c.l.deltagare || []).length) || (c.a && (c.a.offert.antal || (c.a.offert.deltagare || []).length)) || '', period: c.lf.period || (c.p && c.p.underlag && c.p.underlag.period) || '',
        underbitrade: '', lagring: '', uperf: c.a ? ansvarigNamn(c) : anv(jag).namn }),
      papper: (v, m) => mallPapper({ titel: 'Personuppgifts&shy;biträdesavtal', under: 'PUB-avtal', not: JURIST,
        meta: [['Kund', m('kund')], ['Deltagare', m('antal')], ['Testperiod', m('period')]],
        delar: [
          ['1. Parter', `<p><strong>${m('kund')}</strong>, org.nr ${m('orgnr')} – personuppgiftsansvarig (”Kunden”), kontaktperson ${m('kontakt')}${v.roll ? `, ${e(v.roll)}` : ''}, ${m('epost')}.<br><strong>Uperformance AB</strong> – personuppgiftsbiträde (”Uperformance”), kontaktperson ${m('uperf')}.</p>`],
          ['2. Ändamål', '<p>Uperformance behandlar personuppgifter för Kundens räkning för att genomföra en hälsokartläggning av Kundens medarbetare: tester, en individuell riskprofil till varje deltagare och en sammanställning på organisationsnivå till Kunden.</p>'],
          ['3. Registrerade och personuppgifter', `<ul><li>Registrerade: Kundens medarbetare som deltar (${m('antal')} personer) under testperioden ${m('period')}.</li><li>Namn, e-post och personnummer (deltagarlistan).</li><li>Svar på hälsoformuläret och testresultat – hälsouppgifter, som är känsliga personuppgifter.</li></ul>`],
          ['4. Uperformances åtaganden', '<ul><li>Behandlar uppgifterna endast enligt Kundens dokumenterade instruktioner och detta avtal.</li><li>Ser till att de som behandlar uppgifterna har tystnadsplikt.</li><li>Vidtar lämpliga tekniska och organisatoriska säkerhetsåtgärder.</li><li>Hjälper Kunden att besvara begäranden från de registrerade.</li><li>Meddelar Kunden utan onödigt dröjsmål vid en personuppgiftsincident.</li><li>Raderar eller återlämnar uppgifterna när uppdraget är slutfört, enligt punkt 6.</li></ul>'],
          ['5. Underbiträden', `<p>Medicinsk data hanteras av extern tredjepart: ${m('underbitrade')}. Uperformance anlitar inga andra underbiträden utan Kundens skriftliga godkännande.</p>`],
          ['6. Kundens insyn och lagring', `<p>Kunden ser vilka deltagare som har svarat på hälsoformuläret, men inte svaren, och får en sammanställd rapport på organisationsnivå. Uppgifterna lagras ${m('lagring')} efter testdagen och raderas därefter.</p>`],
          ['7. Giltighet', '<p>Avtalet gäller så länge Uperformance behandlar personuppgifter för Kundens räkning.</p>'],
        ], sign: SIGN_TVA(m('kund')) }) },
    { id: 'deltagarlista', grupp: 'formular', namn: 'Deltagarlista', ikon: 'anstallda', ton: 'is', typ: 'csv', valj: 'oppen', exempel: {},
      kort: 'En rad per deltagare – namn, e-post, personnummer och paket. Klistras in direkt i kundlänken (Klistra in lista).', nar: 'Underlag & samtycke (kundlänken, steg 2)', format: ['CSV (Excel)'],
      papper: () => mallPapper({ titel: 'Deltagarlista', under: 'Kundunderlag',
        not: 'Fyll i en rad per deltagare och spara som CSV – eller kopiera raderna och klistra in dem i kundlänkens steg 2 (Klistra in lista). Paket: Bas, Bas+ eller Bas++.',
        delar: [['Kolumner', `<table class="mp-tabell"><thead><tr><th>Namn</th><th>E-post</th><th>Personnummer</th><th>Paket</th></tr></thead><tbody>${MALL_EXEMPELRADER.map((r) => `<tr>${r.map((x) => `<td>${e(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="mp-liten">Exempelrader – personnumret skrivs ÅÅÅÅMMDD-NNNN. Uppgifterna skickas bara via den säkra kundlänken.</p>`]] }) },
    { id: 'halsa', grupp: 'formular', namn: 'Hälsoformulär', ikon: 'hjarta', ton: 'rod', typ: 'utskrift', valj: 'oppen', exempel: { affarId: 'a5' }, bara: () => HALSA, filnamn: 'Hälsoformulär',
      kort: 'Frågorna inför testdagen. Varje deltagare svarar själv via en personlig länk – svaren går bara till testteamet.', nar: 'Kundlänken, steg 3 (hälsoformulär)', format: ['Digital länk', 'PDF'],
      falt: [{ id: 'kund', etikett: 'Företag' }, { id: 'period', etikett: 'Testperiod', valfri: true }],
      fyll: (c) => ({ kund: c.lf.namn || (c.k && c.k.namn) || '', period: c.lf.period || '' }),
      papper: (v, m) => mallPapper({ titel: 'Hälsoformulär', under: 'Inför testdagen', not: 'Lämnas direkt till Uperformances testteam – inte till arbetsgivaren.',
        meta: [['Företag', m('kund')], ['Testperiod', v.period ? e(v.period) : 'Bokas med er']],
        delar: [...Object.keys(HALSOGRUPPER).map((g) => [e(HALSOGRUPPER[g]), HALSOFRAGOR.filter((f) => f.grupp === g).map((f) => `<p class="mp-fraga"><span>${e(f.etikett)}${f.enhet ? ` (${e(f.enhet)})` : ''}</span>${f.typ === 'val' ? `<b>${f.val.map(([, t]) => `${KRYSS} ${e(t)}`).join('&nbsp;&nbsp;&nbsp;')}</b>` : '<i></i>'}</p>`).join('')]),
          ['Samtycke', `<p>${KRYSS} Jag samtycker till att Uperformance behandlar uppgifterna ovan för att genomföra min hälsokartläggning.</p>`]],
        sign: { parter: ['Deltagare'], rader: ['Datum', 'Underskrift'] } }) },
    { id: 'info', grupp: 'formular', namn: 'Information och samtycke', ikon: 'anteckning', ton: 'mint', typ: 'dokument', kategori: 'ovrigt', valj: 'affar', exempel: { affarId: 'a5' }, filnamn: 'Information och samtycke',
      kort: 'Information till deltagarna om testerna och personuppgifterna – med samtycke att skriva under.', nar: 'Underlag & samtycke (infodokument)', format: ['Word', 'PDF'],
      falt: [{ id: 'kund', etikett: 'Arbetsgivare' }, { id: 'period', etikett: 'Testperiod' }, { id: 'plats', etikett: 'Plats för testdagen' }, { id: 'uperf', etikett: 'Kontaktperson på Uperformance' }],
      fyll: (c) => ({ kund: c.lf.namn || c.k.namn, period: c.lf.period || (c.p && c.p.underlag && c.p.underlag.period) || '', plats: c.lf.plats || (c.p && c.p.underlag && c.p.underlag.adress) || '', uperf: c.a ? ansvarigNamn(c) : anv(jag).namn }),
      papper: (v, m) => mallPapper({ titel: 'Information till dig som deltar', under: 'Hälsokartläggning',
        meta: [['Arbetsgivare', m('kund')], ['Testperiod', m('period')], ['Plats', m('plats')]],
        delar: [
          ['Vad händer?', `<p>${m('kund')} har beställt en hälsokartläggning av Uperformance. Testerna bygger på elitidrottens testmetodik och visar var riskerna finns innan de blir skador. Efter testdagen får du en individuell riskprofil.</p>`],
          ['Dina uppgifter', '<ul><li>Namn, e-post och personnummer används för att boka och genomföra testerna.</li><li>Hälsoformuläret besvarar du själv via en personlig länk. Svaren går direkt till Uperformances testteam.</li><li>Din arbetsgivare ser bara att du har svarat – inte dina svar – och får en sammanställd rapport på organisationsnivå.</li><li>Medicinsk data hanteras av extern tredjepart.</li></ul>'],
          ['Frågor?', `<p>Kontakta ${m('uperf')} på Uperformance.</p>`],
          ['Samtycke', `<p>${KRYSS} Jag samtycker till att Uperformance behandlar uppgifterna ovan för att genomföra min hälsokartläggning.</p>`],
        ], sign: { parter: ['Deltagare'], rader: ['Namn', 'Datum', 'Underskrift'] } }) },
    { id: 'overlamning', grupp: 'internt', namn: 'Överlämning till testteamet', ikon: UPEMO.sak.underlag, ton: '', typ: 'utskrift', valj: 'affar', exempel: { affarId: 'a1' }, filnamn: 'Överlämning',
      kort: 'Checklistan innan testteamet tar över: kontakt på plats, adress, period och kontrollpunkterna.', nar: 'Underlag & samtycke → Överlämnad', format: ['PDF', 'Word'],
      falt: [{ id: 'kund', etikett: 'Kund' }, { id: 'affar', etikett: 'Affär' }, ...UNDERLAG_FALT.map((f) => ({ id: f.id, etikett: f.etikett, typ: f.textarea ? 'textarea' : f.typ === 'tel' ? 'tel' : 'text', valfri: !f.krav })), ...UNDERLAG_KRYSS],
      // Samma förifyllning som affärens överlämning (projektets underlag när det finns, annars kundunderlaget och checklistan)
      fyll: (c) => { const u = (c.p && c.p.underlag) || overlamningForifylld(c.a); return { kund: c.k.namn, affar: c.a ? c.a.titel : '', kontakt: u.kontakt || '', telefon: u.telefon || '', adress: u.adress || c.lf.plats || '', period: u.period || c.lf.period || '', lokal: u.lokal || '', bransch: u.bransch || c.k.bransch || '', ovrigt: u.ovrigt || '', ...Object.fromEntries(UNDERLAG_KONTROLL.map((x) => [x.id, !!u[x.id]])) }; },
      papper: (v, m) => mallPapper({ titel: 'Överlämning till testteamet', under: 'Checklista',
        meta: [['Kund', m('kund')], ['Affär', m('affar')]],
        delar: [['Uppgifter', UNDERLAG_FALT.map((f) => `<p class="mp-fraga"><span>${e(f.etikett)}</span>${String(v[f.id] || '').trim() ? `<b>${e(v[f.id])}</b>` : f.krav ? mtom('fylls i') : '<i></i>'}</p>`).join('')],
          ['Kontrollpunkter', UNDERLAG_KONTROLL.map((x) => `<p>${v[x.id] ? KRYSSAD : KRYSS} ${e(x.etikett)}</p>`).join('')]] }) },
  ];
  const MALL_EXEMPELRADER = [['Anna Andersson', 'anna.andersson@foretaget.se', 'ÅÅÅÅMMDD-NNNN', 'Bas+'], ['Erik Exempel', 'erik.exempel@foretaget.se', 'ÅÅÅÅMMDD-NNNN', 'Bas']];
  const mtom = (etikett) => `<mark class="mall-tom">[${e(etikett)}]</mark>`;
  const synligaMallar = () => MALLAR.filter((m) => !m.bara || m.bara());
  const mallFor = (id) => MALLAR.find((m) => m.id === id);
  // Fältets värde i dokumentet – eller etiketten i [hakparentes] när det saknas
  const mallVarde = (mall, v) => (id) => {
    const f = (mall.falt || []).find((x) => x.id === id) || { id, etikett: id }; const x = v[id];
    if (x == null || String(x).trim() === '') return mtom(f.etikett);
    if (f.typ === 'date') return e(langtDatum(x) || x);
    if (f.typ === 'select') return e((f.val.find(([k]) => k === x) || [, x])[1]);
    return e(x);
  };
  const mallKvar = (mall, v) => (mall.falt || []).filter((f) => !f.valfri && f.typ !== 'kryss' && !String(v[f.id] ?? '').trim());
  const mallValen = (mall) => (mall.valj === 'klubb' ? klubbar().map((k) => [k.id, k.namn, k.id, null])
    : db.affarer.filter((a) => (mall.valj === 'oppen' ? arOppen(a) : a.steg !== 'forlorad')).sort((x, y) => Number(arOppen(y)) - Number(arOppen(x)) || kundNamn(x.kundId).localeCompare(kundNamn(y.kundId), 'sv'))
      .map((a) => [a.id, `${kundNamn(a.kundId)} – ${a.titel}`, a.kundId, a.id]));
  const mallDokument = (mall, v, c) => tona(mall.typ === 'digital' ? (c.a ? offertPapper(c.a, mall.id) : '') : mall.papper(v, mallVarde(mall, v)), mall.ton);
  const mallTitel = (mall, v, c) => filnamn(`${mall.filnamn || mall.namn} ${(c.k && c.k.namn) || v.kund || v.klubb || ''}`);

  // Ladda ner: Word (HTML som Word öppnar och går att redigera) eller CSV; skriv ut via en utskriftsyta (CSP tillåter inga nya fönster med skript)
  const WORD_CSS = 'body{font-family:Calibri,Arial,sans-serif;color:#0b1520;font-size:10.5pt;line-height:1.5}table{border-collapse:collapse}.mp-huvud{width:100%;background:#0b1520;color:#f6f4ef}.mp-huvud td{padding:16pt 18pt;vertical-align:bottom}.mp-marke{font-weight:bold;font-size:14pt;color:#f6f4ef}.mp-marke small{display:block;font-weight:normal;font-size:8pt;color:#a7d2ff}.mp-titel{text-align:right}.mp-titel span{display:block;font-size:8pt;letter-spacing:1pt;text-transform:uppercase;color:#7ee0c3}.mp-titel strong{display:block;font-size:20pt;color:#ffffff}table.mp-meta{width:100%;background:#f3f1ec}table.mp-meta td{padding:7pt 10pt;vertical-align:top;border-right:2pt solid #ffffff}table.mp-meta span{display:block;color:#5f6a76;font-size:7.5pt;text-transform:uppercase;letter-spacing:.6pt}table.mp-meta strong small{display:block;font-weight:normal;color:#5f6a76}.mp-kropp{padding:0 4pt}.mp-not{background:#fff2d6;color:#7f5500;padding:6pt 8pt;font-size:9pt}.mp-not b{display:none}h3{font-size:12pt;color:#183653;margin:16pt 0 4pt;border-bottom:1pt solid #e6edf5;padding-bottom:3pt}h3 b{color:#0f6e57;margin-right:6pt}h3 i{display:none}.mp-tabell{width:100%}.mp-tabell th{background:#f3f1ec;color:#5f6a76;font-size:7.5pt;text-transform:uppercase;padding:5pt;text-align:left}.mp-tabell td{border-bottom:1px solid #dddddd;padding:5pt;vertical-align:top}.mp-tabell td small{display:block;color:#5f6a76}.mp-tabell tfoot td{font-weight:bold;background:#e0f6ee;color:#0f6e57}.mp-liten{font-size:8.5pt;color:#5f6a76}.mall-tom{background:#fff2d6;color:#7f5500}.mp-fraga span{display:block;color:#5f6a76;font-size:9pt}.mp-fraga i{display:block;border-bottom:1px solid #999999;height:16pt}table.mp-sign{width:100%}table.mp-sign td{width:50%;padding:6pt 14pt 0 0;vertical-align:top}table.mp-sign strong{display:block;color:#183653}table.mp-sign p{margin:18pt 0 0}table.mp-sign span{display:block;border-bottom:1px solid #0b1520;height:1pt}table.mp-sign small{color:#5f6a76;font-size:8pt}table.mp-fot{width:100%;margin-top:18pt;border-top:1px solid #dddddd;font-size:8pt;color:#5f6a76}table.mp-fot td{padding-top:6pt}table.mp-fot td+td{text-align:right}';
  function laddaNerFil(namn, innehall, typ) {
    const url = URL.createObjectURL(new Blob([innehall], { type: typ }));
    const a = Object.assign(document.createElement('a'), { href: url, download: namn });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const laddaNerWord = (titel, html0) => { const html = String(html0).replace(/<svg[\s\S]*?<\/svg>/g, ''); return laddaNerFil(`${titel}.doc`, `﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${e(titel)}</title><style>${WORD_CSS}</style></head><body>${html}</body></html>`, 'application/msword'); };
  // En cell som börjar med = + - @, tab eller CR får en apostrof först – annars kan Excel köra den som en formel (namn kommer från kunder)
  const csvCell = (x) => { const t = String(x ?? ''); return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`; };
  const laddaNerCsv = (titel, rader) => laddaNerFil(`${titel}.csv`, '﻿' + rader.map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  function skrivUtPapper(html) {
    let yta = document.querySelector('body > .mall-utskrift');
    if (!yta) { yta = document.createElement('div'); yta.className = 'mall-utskrift'; yta.setAttribute('aria-hidden', 'true'); document.body.appendChild(yta); }
    yta.innerHTML = html; document.documentElement.setAttribute('data-skriver-mall', '');
    const klar = () => { document.documentElement.removeAttribute('data-skriver-mall'); yta.innerHTML = ''; removeEventListener('afterprint', klar); };
    addEventListener('afterprint', klar); setTimeout(() => print(), 80);
  }

  /* Förslag just nu: dokument som saknas i affärernas läge – ett klick öppnar mallen ifylld */
  function mallForslag() {
    if (anv(jag).roll === 'test') return [];
    const ut = [];
    db.affarer.filter(arOppen).forEach((a) => {
      const kn = kundNamn(a.kundId); const c = a.check || {};
      const harKat = (kat) => db.dokument.some((d) => d.affarId === a.id && filKategori(d) === kat);
      if (afOrderNasta(a)) ut.push({ mall: 'order', affarId: a.id, prio: 1, rubrik: `Order till ${kn}`, text: 'Kontrollpunkterna är klara – ordern är nästa steg' });
      if (a.steg === 'underlag' && !c.pub && !harKat('pub')) ut.push({ mall: 'pub', affarId: a.id, prio: 1, rubrik: `PUB-avtal för ${kn}`, text: 'Behövs till överlämningen – fylls i från affären och kundunderlaget' });
      if ((a.steg === 'besok' || a.steg === 'offert') && !dokFor(a.id, 'offert')) ut.push({ mall: 'offert', affarId: a.id, prio: 2, rubrik: `Offert till ${kn}`, text: `${a.titel} · ${krKort(affarVarde(a))} – ingen offert skickad än` });
      if (a.steg === 'underlag' && !c.info && !db.dokument.some((d) => d.affarId === a.id && d.mall === 'info')) ut.push({ mall: 'info', affarId: a.id, prio: 2, rubrik: `Information och samtycke – ${kn}`, text: 'Kontrollpunkten infodokument är inte klar' });
      if (a.steg === 'underlag' && !lankFor(a.id) && a.offert.eget == null && a.offert.typ !== 'uppfoljning' && !(a.offert.deltagare || []).length) ut.push({ mall: 'deltagarlista', affarId: a.id, prio: 3, rubrik: `Deltagarlista – ${kn}`, text: 'Ingen kundlänk ännu – kunden fyller i deltagarna där' });
    });
    klubbar().filter((k) => k.klubbavtal && !db.dokument.some((d) => d.kundId === k.id && filKategori(d) === 'avtal'))
      .forEach((k) => ut.push({ mall: 'klubbavtal', kundId: k.id, prio: 3, rubrik: `Klubbmotorn-avtal – ${k.namn}`, text: `${k.klubbavtal.procent} % provision sedan ${datumText(k.klubbavtal.sedan, { gemen: true })} – inget avtalsdokument sparat` }));
    return ut.filter((x) => synligaMallar().some((m) => m.id === x.mall)).sort((x, y) => x.prio - y.prio);
  }
  // Hur ofta mallen har använts (dokument, digitala länkar eller kundlänkar)
  const mallAnvand = (mall) => {
    const lista = mall.typ === 'digital' ? Object.values(db.offerter).filter((d) => (d.typ === 'order' ? 'order' : 'offert') === mall.id).map((d) => d.skapad)
      : mall.typ === 'csv' ? Object.values(db.kundlankar).map((l) => l.skapad) : db.dokument.filter((d) => d.mall === mall.id).map((d) => d.tid);
    const senast = lista.filter(Boolean).sort().pop();
    return lista.length ? `Använd ${plural(lista.length, 'gång', 'gånger')} · senast ${datumText(dagIso(senast), { gemen: true })}` : 'Inte använd än';
  };

  function visaMallar() {
    const mallar = synligaMallar(); const forslag = mallForslag();
    // Den sista gruppen fyller raden den hamnar på (4 spalter på dator, 2 på surfplatta) – annars blev en kolumn tom
    const grupperNu = MALL_GRUPPER.filter(([g]) => mallar.some((m) => m.grupp === g)).map(([g]) => mallar.filter((m) => m.grupp === g).length);
    const sistaSpann = (kol) => { let rad = 0; grupperNu.slice(0, -1).forEach((n) => { const sp = Math.min(n, kol); rad = rad + sp > kol ? sp : rad + sp; if (rad === kol) rad = 0; }); const sp = Math.min(grupperNu[grupperNu.length - 1] || 1, kol); return rad + sp > kol ? kol : kol - rad; };
    const spann = `--spann4:${sistaSpann(4)};--spann2:${sistaSpann(2)}`;
    const franMall = db.dokument.filter((d) => d.mall);
    const pubUtkast = db.affarer.filter((a) => arOppen(a) && !(a.check && a.check.pub) && db.dokument.some((d) => d.affarId === a.id && d.mall === 'pub') && !db.dokument.some((d) => d.affarId === a.id && filKategori(d) === 'pub' && !d.mall));
    const kort = (m) => {
      const c = mallKontext((m.exempel || {}).kundId, (m.exempel || {}).affarId);
      const mini = tona(m.typ === 'digital' ? (c.a ? offertPapper(c.a, m.id) : '') : m.papper(m.fyll && c.k ? m.fyll(c) : {}, mallVarde(m, m.fyll && c.k ? m.fyll(c) : {})), m.ton);
      return `<article class="ml-kort" data-ton="${e(m.ton)}">
        <button class="ml-mini" type="button" data-g="mall-exempel" data-mall="${e(m.id)}" aria-label="Visa exempel: ${e(m.namn)}"><span class="ml-mini-inre" aria-hidden="true">${mini}</span><span class="ml-mini-etikett">${ik('helskarm')}Visa exempel</span></button>
        <div class="ml-topp">${emo(m.ikon, { ruta: 'm', ton: m.ton })}<div><h3>${e(m.namn)}</h3><p class="ml-nar">${e(m.nar)}</p></div></div>
        <p class="ml-text">${e(m.kort)}</p>
        <div class="ml-format">${m.format.map((f) => `<span>${e(f)}</span>`).join('')}</div>
        <div class="ml-knappar"><button class="knapp knapp-accent knapp-liten" type="button" data-g="mall-ny" data-mall="${e(m.id)}">${ik('plus')}${m.typ === 'digital' ? `Skapa ${m.id === 'order' ? 'order' : 'offert'}` : m.typ === 'csv' ? 'Skapa kundlänk' : m.typ === 'utskrift' ? 'Fyll i' : 'Skapa ny'}</button>
          <button class="knapp knapp-spok knapp-liten" type="button" data-g="mall-ladda" data-mall="${e(m.id)}" title="${m.typ === 'csv' ? 'Ladda ner tom mall (CSV)' : 'Ladda ner tom mall (Word)'}" aria-label="Ladda ner tom mall: ${e(m.namn)}">${ik('ladda-ner')}<span class="ml-ladda-text" aria-hidden="true">Ladda ner</span></button></div>
        <small class="ml-anvand">${e(mallAnvand(m))}</small></article>`;
    };
    const forslagHtml = forslag.length ? `<section class="kort dk-atgarder ml-forslag" aria-labelledby="ml-forslag-rubrik">
        <header class="dk-atg-huvud"><h2 id="ml-forslag-rubrik">${emo('glodlampa', { ruta: 's', ton: 'gul' })}Förslag just nu</h2><span class="dk-grupp-antal">${forslag.length}</span></header>
        <div class="dk-atg-lista">${forslag.map((x) => { const m = mallFor(x.mall); return `<div class="dk-atgard" data-ton="${e(m.ton || 'is')}">${emo(m.ikon, { ruta: 'm', ton: m.ton })}
          <div class="dk-atgard-text"><button class="dk-atgard-titel" type="button" data-g="mall-ny" data-mall="${e(m.id)}" data-kund="${e(x.kundId || '')}" data-affar="${e(x.affarId || '')}">${e(x.rubrik)}</button><small title="${e(x.text)}">${e(x.text)}</small></div>
          <div class="dk-atgard-knapp"><button class="knapp knapp-accent knapp-liten" type="button" data-g="mall-ny" data-mall="${e(m.id)}" data-kund="${e(x.kundId || '')}" data-affar="${e(x.affarId || '')}">${ik('plus')}${m.typ === 'digital' ? 'Skapa' : m.typ === 'csv' ? 'Kundlänk' : 'Fyll i'}</button></div></div>`; }).join('')}</div></section>`
      : `<section class="kort dk-atgarder" data-dk-lugnt><div class="dk-lugnt">${emo('klar', { ruta: 'm', ton: 'mint' })}<p><strong>Inget saknas just nu.</strong> När en affär behöver ett avtal, en offert eller ett formulär föreslås det här.</p></div></section>`;
    return `${sidhjalte({
        ogon: 'Dokumentarkivet', titel: 'Mallar', accent: '&amp; formulär', klass: 'sidhjalte-mallar',
        text: 'Offert, order, avtal och formulär – med exempel. Ladda ner, skriv ut eller skapa nya med uppgifterna ifyllda från CRM:et.',
        under: dokFlikar('mallar'),
        tal: [
          { emo: 'rutnat', etikett: 'Mallar', varde: mallar.length, under: `${MALL_GRUPPER.filter(([g]) => mallar.some((m) => m.grupp === g)).length} grupper` },
          { emo: 'glodlampa', etikett: 'Förslag just nu', varde: forslag.length, under: forslag.length ? 'dokument som saknas' : 'inget saknas', ton: forslag.length ? '' : '' },
          { emo: UPEMO.sak.dokument, etikett: 'Skapade från mall', varde: franMall.length, under: franMall.length ? 'utkast sparade på kunderna' : 'inga än' },
          { emo: 'skold', etikett: 'PUB att signera', varde: pubUtkast.length, under: pubUtkast.length ? 'utkast utan signerad kopia' : 'inga utkast väntar' },
        ],
      })}
      <div class="dk-innehall ml-innehall">
        ${forslagHtml}
        <div class="ml-grupper">${MALL_GRUPPER.filter(([g]) => mallar.some((m) => m.grupp === g)).map(([g, namn, text]) => `<section class="ml-grupp" style="--n:${mallar.filter((m) => m.grupp === g).length};${spann}" aria-labelledby="ml-g-${g}"><header class="ml-grupp-huvud"><h2 id="ml-g-${g}">${e(namn)}</h2><p>${e(text)}</p></header>
          <div class="ml-rutnat">${mallar.filter((m) => m.grupp === g).map(kort).join('')}</div></section>`).join('')}</div>
      </div>`;
  }
  // Flikarna i dokumenthjälten: arkivet och mallarna
  const dokFlikar = (aktiv) => `<nav class="dk-flikar" aria-label="Dokument"><a href="#/dokument" ${aktiv === 'arkiv' ? 'aria-current="page"' : ''}>${ik('dokument')}Arkiv<b data-dk-arkiv-tal>${dokVem(dokPoster()).filter((p) => p.lage !== 'arkiv').length}</b></a><a href="#/dokument/mallar" ${aktiv === 'mallar' ? 'aria-current="page"' : ''}>${ik('rutnat')}Mallar<b>${synligaMallar().length}</b></a></nav>`;

  /* Arket: exempel (läge 'exempel'), ett sparat dokument (läge 'visa') eller ny/ändra (läge 'ny') – fält till vänster, papperet till höger */
  let mallUi = null;
  /* Utkast i mallarket: det man skrivit sparas (per mall och dokument/affär/kund) när arket stängs utan Spara – Esc, klick på
     bakgrunden eller navigering – och tas fram igen med raden "Fortsätt där du var" och knappen Börja om. Lever under sessionen. */
  const mallUtkast = new Map();
  const mallNyckel = (u) => `${u.mall.id}|${u.dokId || u.affarId || u.kundId || ''}`;
  function oppnaMall(id, { kundId = '', affarId = '', lage = 'ny', dokId = '' } = {}) {
    const mall = mallFor(id); if (!mall) return;
    let v = {};
    if (dokId) { const d = db.dokument.find((x) => x.id === dokId); if (!d) { toast('Dokumentet finns inte längre', null, 'varning'); return; } kundId = d.kundId; affarId = d.affarId || ''; v = { ...(d.falt || {}) }; }
    if (lage === 'exempel') { kundId = (mall.exempel || {}).kundId || ''; affarId = (mall.exempel || {}).affarId || ''; }
    const c = mallKontext(kundId, affarId);
    if (!dokId && mall.fyll && c.k) v = mall.fyll(c);
    mallUi = { mall, lage, kundId: c.k ? c.k.id : '', affarId: c.a ? c.a.id : '', dokId, v };
    const utkast = lage === 'ny' && mallUtkast.get(mallNyckel(mallUi)); if (utkast) { mallUi.v = { ...mallUi.v, ...utkast }; mallUi.fortsatt = true; }
    ritaMallArk();
  }
  function ritaMallArk() {
    const { mall, lage, v } = mallUi; const c = mallKontext(mallUi.kundId, mallUi.affarId);
    const kvar = mallKvar(mall, v); const val = mallValen(mall); const vald = mall.valj === 'klubb' ? mallUi.kundId : mallUi.affarId;
    const valjare = lage === 'ny' ? `<label class="ml-valj"><span class="etikett">${mall.valj === 'klubb' ? 'Klubb' : 'Kund och affär'}<small> – fälten fylls i från CRM:et</small></span><select class="falt" data-ml-val><option value="">${mall.valj === 'klubb' ? 'Välj klubb …' : 'Välj affär …'}</option>${val.map(([id, t]) => `<option value="${e(id)}" ${id === vald ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></label>` : '';
    const falt = lage === 'ny' && mall.falt ? `<div class="ml-falt-lista">${mall.falt.map((f) => {
      const x = v[f.id] ?? ''; const attr = `data-ml-falt="${e(f.id)}" aria-label="${e(f.etikett)}"`;
      if (f.typ === 'kryss') return `<label class="kryss ml-kryss"><input type="checkbox" ${attr} ${x ? 'checked' : ''}><span>${e(f.etikett)}</span></label>`;
      const in_ = f.typ === 'select' ? `<select class="falt" ${attr}>${f.val.map(([k, t]) => `<option value="${e(k)}" ${k === x ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>`
        : f.typ === 'textarea' ? `<textarea class="falt" rows="2" maxlength="1000" ${attr}>${e(x)}</textarea>`
        : `<input class="falt" type="${e(f.typ === 'number' ? 'number' : f.typ || 'text')}" maxlength="300" value="${e(x)}" ${f.typ === 'number' ? 'min="0" step="1"' : ''} ${attr}>`;
      return `<label class="ml-falt${f.typ === 'textarea' ? ' ml-falt-bred' : ''}" ${!f.valfri && !String(x).trim() ? 'data-saknas' : ''}><span class="etikett">${e(f.etikett)}${f.valfri ? '<small> (valfritt)</small>' : ''}</span>${in_}</label>`;
    }).join('')}</div>` : '';
    // Digital (offert/order): affärens läge i stället för fält
    let info = '';
    if (mall.typ === 'digital' && c.a) {
      const d = dokFor(c.a.id, mall.id); const kanOrder = mall.id !== 'order' || c.a.steg === 'underlag' || c.a.steg === 'signerad' || !!dokFor(c.a.id, 'offert');
      info = `<div class="ml-info"><p><strong>${e(paketText(c.a.offert))}</strong><span>${kr(affarVarde(c.a))} exkl. moms · ${e((SALJSTEG.find((s) => s.id === c.a.steg) || {}).namn || '')}</span></p>
        ${d ? `<p class="ml-not">${ik('info')}<span>${mall.id === 'order' ? 'Order' : 'Offert'} ${e(d.nummer)} finns redan (${e((DOKSTATUS[d.status] || DOKSTATUS.skickad)[0].toLowerCase())}). En ny version ersätter den${dokKlar(d) ? ' – den godkända finns kvar som historik' : ''}.</span></p>` : ''}
        ${!kanOrder ? `<p class="ml-not" data-varning>${ik('varning')}<span>Ordern skapas när offerten är godkänd eller underlaget är inne.</span></p>` : ''}</div>`;
    }
    if (mall.typ === 'csv' && c.a) {
      const l = lankFor(c.a.id);
      info = `<div class="ml-info"><p><strong>${e(kundNamn(c.a.kundId))}</strong><span>${l ? `Kundlänken: ${e((LANKSTATUS[l.status] || LANKSTATUS.skickad)[0].toLowerCase())} · ${plural((l.deltagare || []).length, 'deltagare', 'deltagare')}` : 'Ingen kundlänk ännu – den ersätter listan och kontrollerar varje rad'}</span></p></div>`;
    }
    const dok = mallDokument(mall, v, c);
    const forhand = dok ? `<div class="ml-forhand-ram" data-ml-forhand>${dok}</div>` : `<div class="ml-forhand-tom">${emo(mall.ikon, { ruta: 'l', ton: mall.ton })}<p>Välj ${mall.valj === 'klubb' ? 'en klubb' : 'en affär'} – då fylls ${mall.typ === 'digital' ? `${mall.id === 'order' ? 'ordern' : 'offerten'}` : 'dokumentet'} i här.</p></div>`;
    const kvarHtml = lage === 'ny' && mall.falt ? `<p class="ml-kvar" data-ml-kvar ${kvar.length ? '' : 'data-klar'}>${kvarText(kvar)}</p>` : '';
    const banner = lage === 'ny' && mallUi.fortsatt ? `<p class="ml-exempel ml-fortsatt">${ik('redigera')}<span><strong>Fortsätt där du var</strong> – det du skrev senast finns kvar.</span><button class="knapp knapp-spok knapp-liten" type="button" data-g="mall-borja-om">Börja om</button></p>`
      : lage === 'exempel' ? `<p class="ml-exempel">${ik('info')}<span><strong>Exempel</strong> – uppgifterna kommer från exempeldatan. ${mall.typ === 'csv' ? 'Exemplet visar hur raderna ser ut.' : 'Skapa ny för att fylla i ett eget.'}</span></p>`
      : lage === 'visa' ? `<p class="ml-exempel" data-sparad>${ik('dokument')}<span><strong>Sparat utkast</strong> – skapat från mallen ${e(mall.namn)}${(() => { const d = db.dokument.find((x) => x.id === mallUi.dokId); return d ? ` ${e(relTid(d.andrad || d.tid))} av ${e(anv(d.andradAv || d.av).kort)}` : ''; })()}.</span></p>` : '';
    // Knapparna efter läge och typ
    const knappar = [];
    const word = `<button class="knapp knapp-kontur" type="button" data-g="mall-ladda-nu">${ik('ladda-ner')}${mall.typ === 'csv' ? 'Ladda ner (CSV)' : 'Ladda ner (Word)'}</button>`;
    const skriv = mall.typ === 'csv' ? '' : `<button class="knapp knapp-spok" type="button" data-g="mall-skriv" ${dok ? '' : 'disabled'}>${ik('skrivare')}Skriv ut / PDF</button>`;
    if (lage === 'exempel') knappar.push(skriv, word, `<button class="knapp knapp-accent" type="button" data-g="mall-ny" data-mall="${e(mall.id)}">${ik('plus')}Skapa ny</button>`);
    else if (lage === 'visa') knappar.push(skriv, word, `<button class="knapp knapp-accent" type="button" data-g="mall-andra">${ik('redigera')}Ändra</button>`);
    else if (mall.typ === 'digital') {
      const kan = !!c.a && (mall.id !== 'order' || c.a.steg === 'underlag' || c.a.steg === 'signerad' || !!dokFor(c.a.id, 'offert')) && !lastOffert(c.a);
      knappar.push(skriv, word.replace('type="button"', `type="button" ${c.a ? '' : 'disabled'}`), `<button class="knapp knapp-accent" type="button" data-g="mall-digital" ${kan ? '' : 'disabled'}>${ik('lank')}Skapa ${mall.id === 'order' ? 'orderlänk' : 'offertlänk'}</button>`);
    } else if (mall.typ === 'csv') {
      const l = c.a ? lankFor(c.a.id) : null;
      knappar.push(word, l ? `<a class="knapp knapp-accent" href="${e(lankUrl(l.token))}" target="_blank" rel="noopener">${ik('lank')}Öppna kundlänken</a>` : `<button class="knapp knapp-accent" type="button" data-g="mall-lank" ${c.a && arOppen(c.a) ? '' : 'disabled'}>${ik('lank')}Skapa kundlänk</button>`);
    } else if (mall.typ === 'utskrift') {
      knappar.push(word, `<button class="knapp knapp-kontur" type="button" data-g="mall-ga" ${c.a ? '' : 'disabled'}>${ik('pil')}${mall.id === 'halsa' ? 'Skicka via kundlänken' : 'Överlämna på affären'}</button>`, skriv.replace('knapp-spok', 'knapp-accent'));
    } else knappar.push(skriv, word, `<button class="knapp knapp-accent" type="button" data-g="mall-spara" ${mallUi.kundId ? '' : 'disabled'}>${ik('bock')}${mallUi.dokId ? 'Spara ändringarna' : 'Spara på kunden'}</button>`);
    oppnaArk(`${arkHuvud(lage === 'exempel' ? `Exempel: ${mall.namn}` : mall.namn, mall.kort, mall.ikon)}
      <div class="ark-kropp ml-ark" data-ml-ark="${e(mall.id)}" data-lage="${e(lage)}">
        ${banner}
        <div class="ml-ark-rum"${lage === 'ny' && (mall.falt || mall.typ !== 'dokument') ? '' : ' data-bara-papper'}>
          ${lage === 'ny' ? `<div class="ml-ark-falt">${valjare}${info}${kvarHtml}${falt}</div>` : ''}
          <div class="ml-ark-forhand">${forhand}</div>
        </div>
      </div>
      <div class="ark-fot ml-fot">${knappar.filter(Boolean).join('')}</div>`, { bred: true });
  }
  const kvarText = (kvar) => (kvar.length ? `${ik('varning')}<span><strong>${plural(kvar.length, 'uppgift', 'uppgifter')} kvar:</strong> ${e(kvar.map((f) => f.etikett.replace(/\s*\(.*\)$/, '')).join(', '))}</span>` : `${ik('bock')}<span>Allt är ifyllt</span>`);
  // Ett fält ändras: bara papperet och raden "kvar" ritas om (fokus stannar i fältet)
  let mallTick = false;
  function mallAndrat(f) {
    if (!mallUi) return;
    mallUi.v[f.dataset.mlFalt] = f.type === 'checkbox' ? f.checked : f.value; mallUi.andrad = true;
    const ruta = f.closest('.ml-falt'); if (ruta) ruta.toggleAttribute('data-saknas', !String(f.value).trim() && !(mallUi.mall.falt.find((x) => x.id === f.dataset.mlFalt) || {}).valfri);
    if (mallTick) return; mallTick = true;
    requestAnimationFrame(() => {
      mallTick = false; if (!mallUi) return;
      const c = mallKontext(mallUi.kundId, mallUi.affarId);
      const ram = $('[data-ml-forhand]', ark); if (ram) ram.innerHTML = mallDokument(mallUi.mall, mallUi.v, c);
      const kvar = mallKvar(mallUi.mall, mallUi.v); const k = $('[data-ml-kvar]', ark); if (k) { k.innerHTML = kvarText(kvar); k.toggleAttribute('data-klar', !kvar.length); }
    });
  }
  function mallValt(varde) {
    const { mall } = mallUi;
    if (mall.valj === 'klubb') { mallUi.kundId = varde; mallUi.affarId = ''; } else { const a = affar(varde); mallUi.affarId = a ? a.id : ''; mallUi.kundId = a ? a.kundId : ''; }
    const c = mallKontext(mallUi.kundId, mallUi.affarId);
    if (mall.fyll && c.k) mallUi.v = mall.fyll(c);
    ritaMallArk();
    const s = $('[data-ml-val]', ark); if (s) (s._valjKnapp || s).focus();
  }
  function mallSpara() {
    const { mall, v } = mallUi; const c = mallKontext(mallUi.kundId, mallUi.affarId);
    if (!c.k) { toast('Välj kund först', null, 'varning'); return; }
    const html = mallDokument(mall, v, c); const nu = new Date().toISOString();
    mallUtkast.delete(mallNyckel(mallUi)); mallUi.sparad = true;
    let d = mallUi.dokId && db.dokument.find((x) => x.id === mallUi.dokId);
    if (d) {
      d.falt = { ...v }; d.storlek = html.length; d.andrad = nu; d.andradAv = jag;
      // Ny affär eller klubb vald i ett sparat utkast: dokumentet följer med till den kunden (namnet byggs om) och flytten loggas där
      const nyAffar = c.a ? c.a.id : null;
      if (d.kundId !== c.k.id || (d.affarId || null) !== nyAffar) {
        const fran = kund(d.kundId); d.kundId = c.k.id; d.affarId = nyAffar; d.namn = `${mallTitel(mall, v, c)}.doc`;
        logga(`${mall.namn} flyttades${fran && fran.id !== c.k.id ? ` från ${fran.namn}` : ''} hit.`, { kundId: c.k.id, affarId: nyAffar || undefined, typ: 'dokument' });
      } else logga(`${mall.namn} uppdaterades.`, { kundId: d.kundId, affarId: d.affarId || undefined, typ: 'dokument' });
    }
    else {
      d = { id: nyId('d'), kundId: c.k.id, affarId: c.a ? c.a.id : null, kategori: mall.kategori, namn: `${mallTitel(mall, v, c)}.doc`, storlek: html.length, tid: nu, av: jag, mall: mall.id, falt: { ...v } };
      db.dokument.push(d); db.aktiviteter.push({ id: nyId('x'), kundId: c.k.id, affarId: c.a ? c.a.id : undefined, typ: 'dokument', text: `Skapade ${mall.namn} från mall.`, av: jag, tid: nu });
    }
    spara(); ark.close(); rendera();
    const kvar = mallKvar(mall, v).length;
    toast(kvar ? `Sparat – ${plural(kvar, 'uppgift', 'uppgifter')} kvar att fylla i` : `${mall.namn} är sparat på ${c.k.namn}`, { href: '#/dokument', text: 'Visa i Dokument' }, kvar ? 'varning' : UPEMO.sak.dokument);
  }

  /* 11-router ----------------------------------------------------------------------- */
  // Okänd adress: en tydlig sida i stället för en tyst översikt
  // En vänlig hjälte med väg vidare: översikten, sök – eller en av huvudsidorna (glaskorten är länkar med samma tal som menyn)
  function visaSaknas() {
    return sidhjalte({
      ogon: 'Okänd adress', titel: 'Sidan', accent: 'finns inte', klass: 'sidhjalte-saknas saknas',
      text: `Adressen <strong>${e(location.hash || '')}</strong> leder ingenstans – den kan vara gammal eller felstavad. Gå till översikten, sök – eller välj en av sidorna.`,
      knappar: `<a class="knapp knapp-accent" href="#/">${ik('pil-v')}Till översikten</a><button class="knapp knapp-kontur" type="button" data-g="oppna-sok">${ik('sok')}Sök</button>`,
      tal: [
        { emo: UPEMO.kundtyp.alla, etikett: 'Kunder', varde: db.kunder.length, under: 'kunder och klubbar', href: '#/kunder' },
        { emo: UPEMO.sak.pipeline, etikett: 'Säljtavla', varde: db.affarer.filter(arOppen).length, under: 'öppna affärer', href: '#/salj' },
        { emo: UPEMO.sak.projekt, etikett: 'Projekt', varde: db.projekt.filter((p) => p.steg !== 'klar').length, under: 'pågående hos testteamet', href: '#/projekt' },
        // samma tal som menyns räknare (uppdateraRaknare): mina förfallna + idag
        { emo: UPEMO.sak.todo, etikett: 'Att göra', varde: db.todos.filter((t) => !t.klar && t.ansvarig === jag && t.datum && dagarTill(t.datum) <= 0).length, under: 'idag och förfallna', href: '#/att-gora' },
      ],
    });
  }
  // Titel i toppraden: kundens, affärens eller projektets namn i stället för det generiska "Kund"
  const TITEL_FOR = {
    kund: (id) => (kund(id) || {}).namn,
    affar: (id) => (affar(id) || {}).titel,
    projekt: (id) => { const p = projekt(id); return p ? kundNamn(p.kundId) : null; },
    dokument: (id) => (id && kund(id) ? `Dokument · ${kund(id).namn}` : null),
  };
  const VAGAR = [
    [/^#?\/?$/, visaOversikt, 'hem', 'Översikt'],
    [/^#\/kunder$/, visaKunder, 'kunder', 'Kunder'],
    [/^#\/kund\/([\w-]+)$/, visaKund, 'kunder', 'Kund', TITEL_FOR.kund],
    [/^#\/salj$/, visaSalj, 'salj', 'Säljtavla'],
    [/^#\/affar\/([\w-]+)$/, visaAffar, 'salj', 'Affär', TITEL_FOR.affar],
    [/^#\/projekt$/, visaProjektTavla, 'projekt', 'Projekt'],
    [/^#\/projekt\/([\w-]+)$/, visaProjekt, 'projekt', 'Projekt', TITEL_FOR.projekt],
    [/^#\/klubbmotorn$/, visaKlubbmotorn, 'klubbmotorn', 'Klubbmotorn'],
    [/^#\/att-gora$/, visaTodos, 'att-gora', 'Att göra'],
    [/^#\/mote$/, visaMote, 'mote', 'Kundmöte'],
    [/^#\/dokument\/mallar$/, visaMallar, 'dokument', 'Mallar'],
    [/^#\/dokument(?:\/([\w-]+))?$/, visaDokument, 'dokument', 'Dokument', TITEL_FOR.dokument],
    [/^#\/anvandare$/, visaAnvandare, 'anvandare', 'Användare'],
  ];
  const SAKNAS = [null, visaSaknas, '', 'Sidan finns inte'];
  // Vyn fylls till menyns nederkant igen när de första blocken ändrar höjd efter ritningen (typsnitt, räkneverk)
  let fyllT = 0;
  const hojdObs = 'ResizeObserver' in window ? new ResizeObserver(() => { clearTimeout(fyllT); fyllT = setTimeout(fyllSida, 150); }) : null;
  function rendera(nyVy = false) {
    const h = location.hash || '#/';
    const v = VAGAR.find(([re]) => re.test(h)) || SAKNAS;
    const m = v[0] ? h.match(v[0]) || [] : [];
    const scroll = scrollY;
    const tavlaX = !nyVy && $('[data-tavla]', vy) ? $('[data-tavla]', vy).scrollLeft : 0;
    // Omritning i samma vy (Klar, Skjut, Mina/Alla, Visa alla …): fokus som låg i vyn läggs tillbaka på samma kontroll. Har den
    // försvunnit (en avbockad rad) får nästa rads första kontroll fokus, annars vyn – tidigare hamnade fokus på body.
    const aktivt = document.activeElement;
    const fokusFore = !nyVy && aktivt && aktivt !== vy && vy.contains(aktivt) ? oppnarInfo(aktivt) : null;
    const fokusNasta = (() => {
      if (!fokusFore) return null;
      const rad = aktivt.closest('li, tr, .todo, [data-todo], .dk-atgard, .handelse'); let n = rad && rad.nextElementSibling;
      while (n && !n.getClientRects().length) n = n.nextElementSibling;
      const k = n && n.querySelector('a[href], button:not([disabled]), input:not([type=hidden]), [tabindex]:not([tabindex="-1"])');
      return k ? oppnarInfo(k) : null;
    })();
    vy.innerHTML = v[1](...m.slice(1));
    if (fokusFore) {
      const synlig = (x) => !!x && x.getClientRects().length > 0 && !x.closest('[hidden], [inert]');
      const hitta = (info) => (info && info.sel ? $$(info.sel, vy).find(synlig) : null);
      (hitta(fokusFore) || hitta(fokusNasta) || vy).focus({ preventScroll: true });
    }
    forberedAntal(vy);
    if (tavlaX) { const t = $('[data-tavla]', vy); if (t) t.scrollLeft = tavlaX; }
    vy.className = nyVy ? 'vy vy-in' : 'vy';
    // En kollegas profil i chefsvyn hör till Försäljning (ledning.js navTill) – annars vägens eget menyval
    const navNu = LED && LED.navTill ? LED.navTill(v[2]) : v[2];
    $$('[data-nav-till]').forEach((a) => { if (navNu && a.dataset.navTill === navNu) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    // Sidorna som ligger i Mer-arket: Att göra har egen flik för alla, Sälj för sälj och Projekt för testteamet (flikraden i index.html)
    const iMer = ['klubbmotorn', 'mote', 'dokument', 'anvandare', 'chef', 'profil', 'admin', 'sakerhet', 'chatt', document.documentElement.hasAttribute('data-roll-test') ? 'salj' : 'projekt'];
    if (iMer.includes(v[2]) && !(document.documentElement.hasAttribute('data-bara-admin') && ['admin', 'sakerhet'].includes(v[2]))) { const mer = $('.flikrad [data-nav-till="mer"]'); mer && mer.setAttribute('aria-current', 'page'); }
    // På mobilen scrollar stegraden i sidled – visa det aktiva steget (mitt i bild)
    $$('.stegare', vy).forEach((s) => { const aktiv = $('[data-status="aktiv"]', s); if (aktiv && s.scrollWidth > s.clientWidth) s.scrollLeft = Math.max(0, aktiv.offsetLeft - (s.clientWidth - aktiv.offsetWidth) / 2); });
    const titel = (v[4] && v[4](m[1])) || v[3];
    $('[data-topp-titel]').textContent = titel;
    document.title = `${titel} · Uperformance CRM`;
    if (nyVy) { scrollTo(0, 0); vy.focus({ preventScroll: true }); } else scrollTo(0, scroll);
    efterRender(nyVy);
    if (nyVy && v[2] === 'anvandare') laddaAdmin();
    if (v[2] === 'dokument' && dokUi.oppnaEfter) { const id = dokUi.oppnaEfter; dokUi.oppnaEfter = null; dokDetalj(id); }
    else if (ark.open && $('[data-dok-detalj]', ark)) dokDetalj($('[data-dok-detalj]', ark).dataset.dokDetalj, { tyst: true });
    if (nyVy && vantandeKolumn && v[2] === 'salj') { const steg = vantandeKolumn; vantandeKolumn = null; requestAnimationFrame(() => G['till-kolumn']({ dataset: { steg }, matches: () => false })); }
  }
  addEventListener('hashchange', () => { stangSok(); if (ark.open) { sparaUtkast(); ark.close(); } if (vantandeKolumn && !/^#\/salj\b/.test(location.hash)) vantandeKolumn = null; rendera(true); }); // det man hunnit skriva i ett ark blir ett utkast

  /* 11b-rörelse: entréer, räkneverk, 3D-scen, lutning och menymarkör ------------------ */
  let senastFlyttad = null;
  const raknaUpp = (el) => {
    const mal = parseFloat(el.dataset.tal); const f = el.dataset.format || 'antal'; const malText = el.dataset.tal;
    if (!isFinite(mal) || lugn) return;
    const start = performance.now(); const tid = 1400;
    const steg = (t) => {
      // Värdet byttes medan det räknades upp (affärens ordervärde när offerten ändras) – det nya står kvar
      if (!el.isConnected || el.dataset.tal !== malText) return;
      const p = Math.min(1, (t - start) / tid);
      el.textContent = formatera(p < 1 ? mal * (1 - Math.pow(1 - p, 4)) : mal, f);
      if (p < 1) requestAnimationFrame(steg);
    };
    requestAnimationFrame(steg);
  };
  // Prestanda: allt som rör sig hela tiden pausas när det är utanför bild (data-vilar) och när fliken är dold
  const vilaObs = 'IntersectionObserver' in window ? new IntersectionObserver((poster) => poster.forEach((p) => p.target.toggleAttribute('data-vilar', !p.isIntersecting)), { rootMargin: '80px' }) : null;
  document.addEventListener('visibilitychange', () => document.documentElement.toggleAttribute('data-vilar', document.hidden));
  // Toppradens titel döljs medan sidans egen rubrik syns – annars står "Att göra" två gånger på mobilen.
  // Räknas direkt från rubrikens läge (vid varje rendering, rullning och storleksändring) i stället för med en
  // IntersectionObserver, vars första svar ibland kom fel och lät titeln stå kvar ovanför hjältens h1.
  let rubrikTick = false;
  function toppTitelLage() {
    const topp = $('.topprad'); if (!topp) return;
    const th = toppHojd(); if (!th) { topp.removeAttribute('data-h1-synlig'); return; } // dator: toppraden är gömd
    const h1 = $('h1', vy); const r = h1 && h1.getClientRects().length ? h1.getBoundingClientRect() : null;
    topp.toggleAttribute('data-h1-synlig', !!r && r.bottom > th && r.top < innerHeight);
  }
  addEventListener('scroll', () => { if (rubrikTick) return; rubrikTick = true; requestAnimationFrame(() => { rubrikTick = false; toppTitelLage(); }); }, { passive: true });
  addEventListener('resize', () => toppTitelLage());
  function efterRender(nyVy) {
    vy.classList.toggle('utan-intro', !nyVy);
    if (nyVy) {
      let d = 0;
      $$('.sidhuvud, .sidhjalte, .brodsmula, .verktygsrad, .hero3d, .saljpuls, .stegband, .saljverktyg, .kort, .kolumn', vy).forEach((el) => { el.setAttribute('data-in3d', ''); el.style.setProperty('--d', Math.min(d++, 14)); });
      $$('[data-tal]', vy).forEach(raknaUpp);
      const ikon = $('.sido .navlank[aria-current="page"] .ikon'); if (ikon && !lugn) { ikon.removeAttribute('data-hopp'); void ikon.offsetWidth; ikon.setAttribute('data-hopp', ''); }
    }
    if (vilaObs) $$('[data-rorelse], .munk3d, .graf, .stegare, .bana, .chip-alder[data-rorelse], .emo-l, .emo-xl, .larm > .emo', vy).forEach((el) => vilaObs.observe(el)); // .emo: ikonerna som rör sig av sig själva
    const sky = $('[data-skyline]', vy); if (sky) startaSkyline(sky, nyVy);
    const tratt = $('[data-tratt]', vy); if (tratt) startaTratt(tratt);
    if ($('[data-stegband]', vy)) startaStegband();
    document.documentElement.style.setProperty('--topph', toppHojd() + 'px');
    klistraKolumner();
    if (hojdObs) { hojdObs.disconnect(); [...vy.children].slice(0, 3).forEach((el) => hojdObs.observe(el)); }
    clearTimeout(fyllT); fyllT = setTimeout(fyllSida, 700); // en gång till när entréerna och räkneverken lagt sig
    flyttaPuck();
    senastFlyttad = null;
    toppTitelLage();
  }
  // Högerkolumnen följer med vid scroll – men bara om den får plats i fönstret (annars skulle botten aldrig synas)
  // Toppradens höjd – 0 på dator, där den är gömd och verktygen ligger i sidomenyn (se placeraVerktyg)
  function toppHojd() { const t = $('.topprad'); return t && t.getClientRects().length ? t.offsetHeight : 0; }
  function klistraKolumner() {
    const topph = toppHojd();
    $$('[data-sticky-kolumn]', vy).forEach((el) => el.toggleAttribute('data-klistrad', matchMedia('(min-width: 1101px)').matches && el.offsetHeight < innerHeight - topph - 40));
    balanseraAffar();
    balanseraKund();
    fyllSida();
  }
  /* Symmetri på dator: varje vy slutar i samma linje som sidomenyn (sidor.css 06 ger samma luft under). En vy som är kortare än
     fönstret når ändå ner dit – det utpekade innehållet (data-fyll-sida, t.ex. tavlans kolumner) eller sista elementet växer med
     det som fattas. Räknas om vid ritning och storleksändring. */
  function fyllSida() {
    $$('[data-sida-fylld]', vy).forEach((el) => { el.style.removeProperty('min-height'); el.removeAttribute('data-sida-fylld'); });
    if (!matchMedia('(min-width: 1000px)').matches) return;
    const sido = $('.sido'); if (!sido || !sido.getClientRects().length || document.documentElement.hasAttribute('data-sido-dold')) return;
    if (document.documentElement.scrollHeight > innerHeight + 1) return;
    const synliga = [...vy.children].filter((el) => el.getClientRects().length && el.offsetHeight > 2); if (!synliga.length) return;
    // menyns nederkant utan transform (menyn kan vara mitt i sin entré): klisterläget top + höjd
    const sidoNed = (parseFloat(getComputedStyle(sido).top) || 0) + sido.offsetHeight;
    // blockens nederkant utan transform (entréerna glider in med translateY): offsetTop-kedjan, sidan rullar inte här
    const ned = (el) => { let y = el.offsetHeight; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y - scrollY; };
    const saknas = Math.floor(sidoNed - Math.max(...synliga.map(ned)));
    if (saknas <= 0) return;
    const mal = $('[data-fyll-sida]', vy) || synliga[synliga.length - 1];
    mal.style.minHeight = `${mal.offsetHeight + saknas}px`; mal.setAttribute('data-sida-fylld', '');
  }
  /* Kundsidan (visaKund/kundRum, sidor.css 16): kolumnerna slutar i samma linje. Utgångsläget är svängkorten (Att göra, Dokument)
     hemma i sidokolumnen och alla händelser synliga. Är sidokolumnen längre flyttas svängkorten in i huvudkolumnen (före
     tidslinjen) i den kombination som gör kolumnerna jämnast (alla kombinationer prövas – varje kort mäts i båda kolumnernas
     bredd; en flytt kostar lite, så korten bara flyttar när det lönar sig). Är huvudkolumnen längre visar tidslinjen de senaste
     händelserna (minst fyra) och "Visa alla". Till sist sträcks det sista kortet i den kortare kolumnen de sista pixlarna
     (data-kd-jamn). Räknas om vid ritning, storleksändring och när typsnitten laddats. Surfplatta och mobil: CSS. */
  const kdAllaVisas = new Set();
  // Kort som kan fylla ut sin kolumn på ett naturligt sätt: tidslinjen (anteckningsrutan växer) och dokumenten (släppytan växer)
  const KD_FYLLER = new Set(['tidslinje', 'dokument']);
  function balanseraKund() {
    const rum = $('[data-kd-rum]', vy); if (!rum) return;
    const hu = $('[data-kd-huvud]', rum), si = $('[data-kd-sida]', rum), br = $('[data-kd-bred]', rum); if (!hu || !si || !br) return;
    const tl = $('[data-kd-tidslinje]', rum); const tlKort = tl && tl.closest('[data-kd]'); const fler = $('[data-g="kd-fler"]', rum);
    const handelser = tl ? $$('.handelse', tl) : []; const arRubriker = tl ? $$('.tidslinje-ar', tl) : []; const startRad = tl && $('.kd-start', tl);
    // utgångsläget: tidslinjen sist i huvudkolumnen, svängkorten sist i sidokolumnen (Att göra före Dokument), allt synligt
    const svang = $$('[data-kd-svang]', rum).sort((x, y) => (x.dataset.kd === 'attgora' ? -1 : 1) - (y.dataset.kd === 'attgora' ? -1 : 1));
    const aktivtKd = document.activeElement; // kort som flyttas tappar fokus – läggs tillbaka sist i balanseraKund
    if (tlKort && (tlKort.parentNode !== hu || tlKort !== hu.lastElementChild)) hu.append(tlKort);
    svang.forEach((el) => { if (el.parentNode !== si || el !== si.lastElementChild) si.append(el); });
    queueMicrotask(() => { if (aktivtKd && aktivtKd !== document.body && aktivtKd.isConnected && document.activeElement !== aktivtKd) aktivtKd.focus({ preventScroll: true }); });
    [...handelser, ...arRubriker, ...(startRad ? [startRad] : [])].forEach((el) => { el.hidden = false; });
    if (fler) fler.hidden = true;
    rum.removeAttribute('data-kd-jamn'); rum.removeAttribute('data-kd-fyll');
    if (si.hasAttribute('data-kd-mur')) { si.removeAttribute('data-kd-mur'); [...si.children].forEach((el) => { el.style.removeProperty('grid-column'); el.style.removeProperty('grid-row'); el.removeAttribute('data-kd-utfyllt'); }); }
    const allaVisas = kdAllaVisas.has(rum.dataset.kdKund);
    // Hela tidslinjen visas efter "Visa alla": knappen står kvar som "Visa färre" (fokus stannar på den)
    if (allaVisas && fler && handelser.length > 4) { fler.hidden = false; const t = $('[data-kd-fler-text]', fler); if (t) t.textContent = 'Visa färre'; fler.setAttribute('data-farre', ''); }
    else if (fler) fler.removeAttribute('data-farre');
    // kortar tidslinjen till de senaste händelserna (de äldsta döljs först); villkor() avgör när det räcker
    const korta = (minst, villkor) => {
      if (allaVisas || handelser.length <= minst) return;
      let synliga = handelser.length;
      while (synliga > minst && !villkor()) { synliga--; handelser[synliga].hidden = true; if (fler && fler.hidden) fler.hidden = false; }
      if (synliga === handelser.length) return;
      if (startRad) startRad.hidden = true; // tidslinjens början står bara med när hela tidslinjen visas
      arRubriker.forEach((r) => { let n = r.nextElementSibling; while (n && n.classList.contains('handelse') && n.hidden) n = n.nextElementSibling; r.hidden = !n || !n.classList.contains('handelse'); });
      const t = fler && $('[data-kd-fler-text]', fler); if (t) t.textContent = `Visa alla ${handelser.length} händelser`;
    };
    if (!matchMedia('(min-width: 1101px)').matches) { korta(8, () => false); if (matchMedia('(min-width: 720px)').matches) murKund(si); return; }
    // Höjderna mäts en gång (alla kort i båda kolumnernas bredd) och alla placeringar prövas: tidslinjen sist i huvudkolumnen
    // eller i en bred rad under kolumnerna, och varje svängkort hemma eller i huvudkolumnen. Kostnaden är skillnaden mellan
    // kolumnerna – mindre när den kortare kolumnen slutar med ett kort som kan fylla ut – plus lite per flytt.
    const gap = parseFloat(getComputedStyle(si).rowGap) || 16;
    const matt = (el, w) => { const f = el.style.width; el.style.width = `${w}px`; const h = el.offsetHeight + gap; el.style.width = f; return h; };
    const bHu = hu.clientWidth, bSi = si.clientWidth;
    const fasta = [...hu.children].filter((el) => el !== tlKort);
    const huFast = fasta.reduce((s, el) => s + el.offsetHeight + gap, 0);
    const siFast = [...si.children].filter((el) => !svang.includes(el)).reduce((s, el) => s + el.offsetHeight + gap, 0);
    const tlH = tlKort ? tlKort.offsetHeight + gap : 0;
    const hH = new Map(svang.map((el) => [el, matt(el, bHu)])), hS = new Map(svang.map((el) => [el, matt(el, bSi)]));
    const sistIHu = fasta.length ? fasta[fasta.length - 1].dataset.kd : '';
    let val = null;
    for (const iBred of tlKort ? [false, true] : [false]) {
      for (let m = 0; m < 1 << svang.length; m++) {
        let h = huFast + (iBred ? 0 : tlH), s = siFast, kost = iBred ? 40 : 0; const ut = [];
        svang.forEach((el, i) => { if ((m >> i) & 1) { h += hH.get(el); kost += 36; ut.push(el); } else s += hS.get(el); });
        const hemma = svang.filter((el) => !ut.includes(el));
        const sistHu = !iBred && tlKort ? 'tidslinje' : ut.length ? ut[ut.length - 1].dataset.kd : sistIHu;
        const sistSi = hemma.length ? hemma[hemma.length - 1].dataset.kd : 'kontakter';
        const kortare = h < s ? sistHu : sistSi; const diff = Math.abs(h - s);
        const tak = kortare === 'tidslinje' ? 240 : 380; // anteckningsrutan växer högst så här mycket, släppytan lite mer
        kost += KD_FYLLER.has(kortare) ? Math.min(diff, tak) * 0.3 + Math.max(0, diff - tak) : diff;
        if (!val || kost < val.kost) val = { kost, ut, iBred };
      }
    }
    if (val.iBred) br.append(tlKort);
    val.ut.forEach((el) => { if (!val.iBred && tlKort && tlKort.parentNode === hu) hu.insertBefore(el, tlKort); else hu.append(el); });
    // tidslinjen i huvudkolumnen och kolumnen längre: de senaste händelserna (minst fyra); i den breda raden högst åtta
    if (tlKort && tlKort.parentNode === hu) korta(4, () => hu.offsetHeight - si.offsetHeight <= 24); else korta(8, () => false);
    // sista pixlarna: den kortare kolumnens sista kort sträcks – fyller den ut (tidslinje, dokument) får skillnaden vara större
    const skillnad = hu.offsetHeight - si.offsetHeight;
    const sist = (skillnad < 0 ? hu : si).lastElementChild;
    const fyller = !!sist && KD_FYLLER.has(sist.dataset.kd);
    if (Math.abs(skillnad) <= (fyller ? (sist.dataset.kd === 'tidslinje' ? 240 : 400) : 64)) { // andra kort: högst 64 px luft i botten
      rum.setAttribute('data-kd-jamn', '');
      if (Math.abs(skillnad) > 90) rum.setAttribute('data-kd-fyll', skillnad > 0 ? 'sida' : 'huvud');
    }
  }
  /* Surfplatta (720–1100 px): sidokorten i två spalter som slutar så jämnt som möjligt. De två första står överst (vänster,
     höger), resten fördelas så att spalterna blir jämnast (alla kombinationer prövas). Placeringen sätts med grid-column/
     grid-row på ett rutnät med 1 px-rader (data-kd-mur, sidor.css 16); sista kortet i den kortare spalten förlängs när det är
     Dokument (släppytan växer) eller skillnaden är liten. Utan skript: CSS-spalter. */
  function murKund(si) {
    const kort = [...si.children].filter((el) => el.hasAttribute('data-kd') && el.getClientRects().length);
    if (kort.length < 2) return;
    si.setAttribute('data-kd-mur', '');
    const gap = parseFloat(getComputedStyle(si).columnGap) || 16; const h = kort.map((el) => Math.round(el.offsetHeight));
    let bast = null;
    for (let m = 0; m < 1 << (kort.length - 2); m++) {
      const sp = kort.map((_, i) => (i < 2 ? i : (m >> (i - 2)) & 1)); const sum = [0, 0];
      sp.forEach((s, i) => { sum[s] += h[i] + gap; });
      const diff = Math.abs(sum[0] - sum[1]); if (!bast || diff < bast.diff) bast = { diff, sp };
    }
    const pos = [1, 1]; const sist = [-1, -1];
    kort.forEach((el, i) => { const s = bast.sp[i]; el.style.gridColumn = String(s + 1); el.style.gridRow = `${pos[s]} / span ${Math.max(1, h[i])}`; pos[s] += h[i] + Math.round(gap); sist[s] = i; });
    const kortare = pos[0] < pos[1] ? 0 : 1; const i = sist[kortare]; const extra = Math.abs(pos[0] - pos[1]);
    if (i >= 0 && extra > 0 && (kort[i].dataset.kd === 'dokument' || extra <= 48)) {
      kort[i].style.gridRow = `${pos[kortare] - h[i] - Math.round(gap)} / span ${h[i] + extra}`; kort[i].setAttribute('data-kd-utfyllt', '');
    }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => balanseraKund());
  /* Affärssidan (ägare F): kolumnerna görs så jämna som möjligt. Svängkorten (tidslinjen, filerna, ansvarig säljare) står hemma i
     sidokolumnen och flyttas sist i huvudkolumnen när det gör kolumnerna jämnare. I sena lägen (underlag, signerad, förlorad) kan
     offerten ställas i en bred rad under kolumnerna (data-af-kan-bred) när huvudkolumnen annars blir mycket längre. Alla kombinationer
     prövas (högst 2 × 8) på höjderna med alla kort hemma, så valet är detsamma för samma innehåll; varje flytt kostar lite (tidslinjen
     mest – den står helst högt i sidokolumnen) så korten bara flyttar när det lönar sig. Korten flyttas bara när placeringen ändras,
     och en flytt efter första ritningen (storleksändring) spelar inte upp entréanimationen igen. Sidokolumnen följer med vid scroll:
     klistrad överst när den får plats i fönstret, annars nederst. Surfplatta (720–1100 px): murAffar(). Mobil: korten står hemma
     och --af-o styr ordningen. baraKlister: räkna bara om klisterläget och surfplattans spalter (ResizeObserver – flyttar aldrig
     något mellan kolumnerna, så den kan inte slå fram och tillbaka). */
  const afObs = 'ResizeObserver' in window ? new ResizeObserver(() => balanseraAffar(true)) : null;
  let afSenast = null; let afTid = 0;
  // Valet görs om när sidan har satt sig (väljarna i valj.js, typsnitten) – inom 400 ms efter ritningen spelar korten fortfarande sin entré
  const afIgen = () => { const rum = $('[data-af-rum]', vy); if (rum && rum === afSenast) balanseraAffar(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(afIgen);
  addEventListener('load', afIgen);
  const AF_SVANG = { tidslinje: 40, filer: 24, ansvarig: 24 }; // ordningen i kolumnen och vad en flytt kostar (px)
  // Kort som får fylla ut sist i den kortare kolumnen och hur mycket (px): Dokuments uppladdning blir en släppyta, tidslinjens
  // skrivruta växer (projektsidan, som kundsidan) och projektets underlag fördelar luften mellan sina delar. Andra kort högst 64 px.
  const AF_FYLLER = { filer: 400, tidslinje: 240, overlamning: 160 };
  function balanseraAffar(baraKlister = false) {
    const rum = $('[data-af-rum]', vy); if (!rum) { if (afObs) afObs.disconnect(); afSenast = null; return; }
    const hu = $('[data-af-huvud]', rum); const si = $('[data-af-sida]', rum); const br = $('[data-af-bred]', rum); if (!hu || !si || !br) return;
    const bred = matchMedia('(min-width: 1101px)').matches; const platta = !bred && matchMedia('(min-width: 720px)').matches;
    if (!platta) murAffar(si, false);
    if (!baraKlister) {
      // Sträckningen från förra räkningen tas bort först – annars mäts de sträckta höjderna
      rum.removeAttribute('data-af-jamn'); $$('[data-af-sist], [data-af-fyll]', rum).forEach((el) => { el.removeAttribute('data-af-sist'); el.removeAttribute('data-af-fyll'); });
      const tlKort = $('.af-tidslinje', rum); const fler = tlKort && $('[data-af-fler]', tlKort);
      const handelser = tlKort ? $$('.handelse', tlKort) : []; const arRubriker = tlKort ? $$('.tidslinje-ar', tlKort) : [];
      [...handelser, ...arRubriker].forEach((el) => { el.hidden = false; });
      const flerText = (synliga) => { if (!fler) return; const mer = (+fler.dataset.totalt || 0) - synliga; fler.hidden = mer <= 0; const t = $('[data-af-fler-text]', fler); if (t && mer > 0) t.textContent = plural(mer, 'händelse till', 'händelser till'); };
      flerText(handelser.length);
      const ORD = Object.keys(AF_SVANG);
      const svang = $$('[data-af-svang]', rum).sort((x, y) => ORD.indexOf(x.dataset.af) - ORD.indexOf(y.dataset.af));
      // Korten som kan stå i den breda raden flyttar tillsammans (affären: offerten; projektet: hälsoformulären och deltagarlistan)
      const kand = $$('[data-af-kan-bred]', rum); const hem = $('[data-af-hem]', hu);
      const gap = parseFloat(getComputedStyle(si).rowGap) || 16;
      let val = { kost: Infinity, ut: new Set(), iBred: false };
      if (bred) {
        // Ett kort blir högre i den smala sidokolumnen (texten bryts oftare) – varje kort mäts i båda kolumnernas bredd, så valet
        // blir detsamma var korten än står just nu (annars kan en ny räkning efter en flytt välja annorlunda).
        const matt = (el, w) => { const f = el.style.width; el.style.width = `${w}px`; const h = el.offsetHeight + gap; el.style.width = f; return h; };
        const bHu = hu.clientWidth; const bSi = si.clientWidth;
        const hH = new Map([...svang, ...kand].map((el) => [el, matt(el, bHu)]));
        const hS = new Map(svang.map((el) => [el, matt(el, bSi)]));
        const hKand = kand.reduce((x, el) => x + hH.get(el), 0);
        // Kolumnernas höjd utan svängkorten, med de breda korten i huvudkolumnen
        let huBas = hu.offsetHeight; let siBas = si.offsetHeight;
        svang.forEach((el) => { if (el.parentNode === hu) huBas -= hH.get(el); else if (el.parentNode === si) siBas -= hS.get(el); });
        kand.forEach((el) => { if (el.parentNode === br) huBas += hH.get(el); });
        // Sista kortet i en kolumn utan svängkort är det sista fasta – i huvudkolumnen står de breda korten hemma efter markören
        const barnHu = [...hu.children]; const hemIdx = hem ? barnHu.indexOf(hem) : -1;
        const fastaHu = barnHu.filter((el) => el.hasAttribute('data-af') && !svang.includes(el) && !kand.includes(el));
        const fastaSi = [...si.children].filter((el) => el.hasAttribute('data-af') && !svang.includes(el));
        const sistFastHu = (iBred) => (!iBred && kand.length && !fastaHu.some((el) => barnHu.indexOf(el) > hemIdx) ? kand[kand.length - 1].dataset.af
          : fastaHu.length ? fastaHu[fastaHu.length - 1].dataset.af : '');
        const sistFastSi = fastaSi.length ? fastaSi[fastaSi.length - 1].dataset.af : '';
        // Tidslinjen kan kortas (minst två händelser kvar) när dess kolumn blir längst – det som kan döljas räknas av från skillnaden
        const tlDold = handelser.slice(2).reduce((x, el) => x + el.offsetHeight, 0);
        // En tabell som inte ryms i huvudkolumnens bredd (projektets deltagarlista – Pris klipptes, personnumret bröts): då står de
        // breda korten alltid i raden under kolumnerna
        const trangt = kand.some((el) => { const f = el.style.width; el.style.width = `${bHu}px`; const t = $$('.tabell-rulla', el).some((x) => x.scrollWidth > x.clientWidth + 1); el.style.width = f; return t; });
        for (const iBred of kand.length ? (trangt ? [true] : [false, true]) : [false]) {
          for (let m = 0; m < 1 << svang.length; m++) {
            let h = huBas - (iBred ? hKand : 0); let s = siBas; let kost = iBred ? 40 : 0; const ut = new Set(); let sistHu = ''; let sistSi = '';
            svang.forEach((el, i) => { if ((m >> i) & 1) { h += hH.get(el); kost += AF_SVANG[el.dataset.af] || 24; ut.add(el); sistHu = el.dataset.af; } else { s += hS.get(el); sistSi = el.dataset.af; } });
            sistHu = sistHu || sistFastHu(iBred); sistSi = sistSi || sistFastSi;
            let diff = Math.abs(s - h); let kortat = 0;
            const tlIHu = tlKort && svang.includes(tlKort) ? ut.has(tlKort) : !!tlKort && tlKort.parentNode === hu;
            if (tlDold && (tlIHu ? h > s : s > h)) { kortat = Math.min(tlDold, diff); diff -= kortat; }
            // Står ett kort som kan fylla ut (AF_FYLLER) sist i den kortare kolumnen tar det upp skillnaden (data-af-jamn) – då kostar den mindre
            const tak = AF_FYLLER[s < h ? sistSi : sistHu] || 0;
            kost += kortat * .2 + (tak ? Math.min(diff, tak) * .3 + Math.max(0, diff - tak) : diff);
            if (kost < val.kost) val = { kost, ut, iBred };
          }
        }
      }
      const mal = new Map(svang.map((el) => [el, val.ut.has(el) ? hu : si]));
      const kandMal = val.iBred ? br : hu; const kandFlytt = kand.some((el) => el.parentNode !== kandMal);
      if (kandFlytt || svang.some((el) => el.parentNode !== mal.get(el))) {
        const later = afSenast === rum && performance.now() - afTid > 400; // samma ritning: storleksändring – korten är redan synliga
        // Ett kort som flyttas tappar fokus (det lämnar sidan en stund) – fokus läggs tillbaka på samma kontroll. Läses före båda
        // flyttarna: de breda korten (offerten med Räkna live) flyttas först och tappade annars fokus för gott.
        const aktivt = document.activeElement;
        if (kandFlytt) { if (later) kand.forEach((el) => el.removeAttribute('data-in3d')); if (kandMal === br) br.append(...kand); else if (hem) hem.after(...kand); }
        // Svängkorten sist i sin kolumn i fast ordning (tidslinjen, filerna, ansvarig) – i sidokolumnen efter värdet och dokumenten
        svang.forEach((el) => { if (later) el.removeAttribute('data-in3d'); mal.get(el).append(el); });
        if (aktivt && aktivt !== document.body && aktivt.isConnected && document.activeElement !== aktivt) aktivt.focus({ preventScroll: true });
      }
      if (bred && tlKort && (tlKort.parentNode === hu || tlKort.parentNode === si) && handelser.length > 2) {
        /* Tidslinjens kolumn längre än den andra: de äldsta händelserna döljs (minst två står kvar) tills kolumnerna möts, och länken
           räknar dem som finns på kundkortet. Blev kolumnen för kort och kan dess sista kort inte fylla ut, visas den sista igen. */
        const kol = tlKort.parentNode; const annan = kol === hu ? si : hu; let synliga = handelser.length;
        while (synliga > 2 && kol.offsetHeight - annan.offsetHeight > 24) { synliga--; handelser[synliga].hidden = true; }
        const sistKol = [...kol.children].filter((el) => el.hasAttribute('data-af') && el.getClientRects().length).pop();
        if (synliga < handelser.length && kol.offsetHeight < annan.offsetHeight && !(sistKol && AF_FYLLER[sistKol.dataset.af])) { handelser[synliga].hidden = false; synliga++; }
        if (synliga < handelser.length) {
          arRubriker.forEach((r) => { let n = r.nextElementSibling; while (n && n.classList.contains('handelse') && n.hidden) n = n.nextElementSibling; r.hidden = !n || !n.classList.contains('handelse'); });
          flerText(synliga);
        }
      }
      if (bred) {
        /* Jämna slut: kolumnerna sträcks till samma höjd och sista kortet i båda växer in i det som blir över (sidor.css 13) – så
           håller de ihop även när tidslinjens skrivruta fälls ut. Bara när det ryms: Dokument och tidslinjen fyller upp till AF_FYLLER
           (uppladdningen blir en släppyta, data-af-fyll; skrivrutan växer), andra kort högst 64 px. Annars står sidokolumnen kvar och
           följer med vid scroll. */
        const sist = (kol) => [...kol.children].filter((el) => el.hasAttribute('data-af') && el.getClientRects().length).pop();
        const skillnad = hu.offsetHeight - si.offsetHeight; const kortSist = sist(skillnad < 0 ? hu : si);
        const tak = kortSist ? AF_FYLLER[kortSist.dataset.af] || 0 : 0; const fyller = tak > 0;
        if (kortSist && Math.abs(skillnad) >= 2 && Math.abs(skillnad) <= (fyller ? tak : 64)) {
          [sist(hu), sist(si)].forEach((el) => el && el.setAttribute('data-af-sist', ''));
          if (fyller && Math.abs(skillnad) > 90) kortSist.setAttribute('data-af-fyll', '');
          rum.setAttribute('data-af-jamn', '');
        }
      }
      if (afSenast !== rum) { afSenast = rum; afTid = performance.now(); requestAnimationFrame(() => requestAnimationFrame(afIgen)); }
      if (afObs) { afObs.disconnect(); afObs.observe(si); afObs.observe(hu); [...si.children].forEach((el) => afObs.observe(el)); }
    }
    if (platta) murAffar(si, true);
    if (bred) si.style.setProperty('--af-topp', `${Math.round(Math.min(toppHojd() + 16, innerHeight - si.offsetHeight - 16))}px`);
    else si.style.removeProperty('--af-topp');
  }
  /* Surfplatta (720–1100 px): sidokolumnens kort i två spalter under huvudkolumnen, i lägets ordning (--af-o). De två viktigaste
     står överst (vänster, höger) och resten fördelas så att spalterna slutar så jämnt som möjligt (alla kombinationer prövas, högst 8).
     Placeringen sätts med grid-column/grid-row på ett rutnät med 1 px-rader (data-af-mur, sidor.css 13) och räknas om när ett kort
     ändrar höjd (afObs). Går spalterna inte att jämna (få kort, t.ex. projektsidans tre) får sista kortet hela bredden under dem.
     Höjderna mäts i spaltens bredd (sista kortet även i hela bredden) – oberoende av var korten står just nu, så valet står still.
     Utan skript: spalter (columns) som reserv. pa = false tar bort placeringen. */
  function murAffar(si, pa) {
    const barn = [...si.children].filter((el) => el.hasAttribute('data-af'));
    if (!pa) {
      if (si.hasAttribute('data-af-mur')) { si.removeAttribute('data-af-mur'); barn.forEach((el) => { el.style.removeProperty('grid-column'); el.style.removeProperty('grid-row'); }); }
      return;
    }
    const o = (el) => parseInt(el.style.getPropertyValue('--af-o'), 10) || 0;
    const kort = barn.filter((el) => el.getClientRects().length).sort((x, y) => o(x) - o(y));
    const gap = parseFloat(getComputedStyle(si).columnGap) || 16; const halv = (si.clientWidth - gap) / 2;
    const matt = (el, w) => { const f = el.style.width; el.style.width = `${w}px`; const x = el.offsetHeight; el.style.width = f; return x; };
    const h = kort.map((el) => matt(el, halv));
    const fordela = (n) => {
      let b = null;
      for (let m = 0; m < 1 << Math.max(0, n - 2); m++) {
        const sp = kort.slice(0, n).map((_, i) => (i < 2 ? i : (m >> (i - 2)) & 1)); const sum = [0, 0];
        sp.forEach((s, i) => { sum[s] += h[i] + gap; });
        const diff = Math.abs(sum[0] - sum[1]); if (!b || diff < b.diff) b = { diff, sp };
      }
      return b;
    };
    let bast = fordela(kort.length); let hel = 0;
    if (kort.length >= 3) {
      const utan = fordela(kort.length - 1);
      if (utan.diff + 48 < bast.diff) { bast = { diff: utan.diff, sp: [...utan.sp, -1] }; hel = matt(kort[kort.length - 1], si.clientWidth); }
    }
    const pos = [1, 1];
    kort.forEach((el, i) => {
      const s = bast.sp[i]; let gc; let gr;
      if (s < 0) { gc = '1 / -1'; gr = `${Math.max(pos[0], pos[1])} / span ${Math.max(1, hel)}`; } else { gc = `${s + 1}`; gr = `${pos[s]} / span ${Math.max(1, h[i])}`; pos[s] += h[i] + gap; }
      if (el.style.gridColumn !== gc) el.style.gridColumn = gc;
      if (el.style.gridRow !== gr) el.style.gridRow = gr;
    });
    si.setAttribute('data-af-mur', '');
  }
  addEventListener('resize', () => { klistraKolumner(); });
  // Staden vrider sig långsamt av sig själv och följer musen – bara när den syns
  let skylineSlut = null; // den förra stadens slinga avslutas när översikten ritas om
  function startaSkyline(sky, nyVy) {
    if (skylineSlut) { skylineSlut(); skylineSlut = null; }
    if (nyVy && !lugn) requestAnimationFrame(() => requestAnimationFrame(() => sky.setAttribute('data-synlig', '')));
    else sky.setAttribute('data-synlig', '');
    if (lugn) return;
    const hero = sky.closest('[data-hero3d]') || sky;
    let mx = 0, my = 0, cx = 0, cy = 0; const t0 = performance.now();
    hero.addEventListener('pointermove', (ev) => { const r = hero.getBoundingClientRect(); mx = (ev.clientX - r.left) / r.width - .5; my = (ev.clientY - r.top) / r.height - .5; });
    hero.addEventListener('pointerleave', () => { mx = 0; my = 0; });
    skylineSlut = slingaISikte(sky, (t) => {
      cx += (mx - cx) * .05; cy += (my - cy) * .05;
      const sek = (t - t0) / 1000;
      sky.style.setProperty('--rz', (45 + Math.sin(sek * .32) * 6 + cx * 24).toFixed(2) + 'deg');
      sky.style.setProperty('--rx', (57 + Math.sin(sek * .23) * 2.5 - cy * 12).toFixed(2) + 'deg');
    });
  }
  // Kort lutar mot muspekaren och får en ljusreflex
  const kanLuta = matchMedia('(hover: hover) and (pointer: fine)').matches && !lugn;
  let lutar = null;
  const slappLutning = (el) => { el.removeAttribute('data-tiltar'); el.style.removeProperty('--tilt-x'); el.style.removeProperty('--tilt-y'); };
  if (kanLuta) {
    document.addEventListener('pointermove', (ev) => {
      const el = ev.target.closest ? ev.target.closest('[data-tilt]') : null;
      if (lutar && lutar !== el) slappLutning(lutar);
      lutar = el;
      if (!el || dragId || (pekDrag && pekDrag.aktiv)) return;
      const r = el.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width; const y = (ev.clientY - r.top) / r.height;
      const styrka = parseFloat(el.dataset.tilt) || 8;
      el.style.setProperty('--tilt-y', ((x - .5) * styrka).toFixed(2) + 'deg');
      el.style.setProperty('--tilt-x', ((.5 - y) * styrka).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      el.setAttribute('data-tiltar', '');
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { if (lutar) { slappLutning(lutar); lutar = null; } });
  }
  // Krusning från pekaren i sidomenyn och flikraden (en gång, bara transform/opacitet)
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest && ev.target.closest('.navlank, .flikrad a, .flikrad button');
    if (!el || lugn) return;
    const r = el.getBoundingClientRect(); const k = document.createElement('span'); k.className = 'krusning'; k.setAttribute('aria-hidden', 'true');
    const s = Math.max(r.width, r.height) * 2; k.style.cssText = `width:${s}px;height:${s}px;left:${ev.clientX - r.left - s / 2}px;top:${ev.clientY - r.top - s / 2}px`;
    el.appendChild(k); setTimeout(() => k.remove(), 700);
  }, { passive: true });
  // Markören i sidomenyn glider till aktiv sida
  let puckForsta = true;
  function flyttaPuck() {
    const puck = $('[data-nav-puck]'); if (!puck) return;
    const aktiv = $('.sido .navlank[aria-current="page"]');
    if (!aktiv || !aktiv.offsetHeight) { puck.removeAttribute('data-synlig'); return; }
    if (puckForsta) { puck.style.transition = 'none'; puckForsta = false; requestAnimationFrame(() => { puck.style.transition = ''; }); }
    puck.style.transform = `translateY(${aktiv.offsetTop}px)`;
    puck.style.height = aktiv.offsetHeight + 'px';
    puck.setAttribute('data-synlig', '');
  }
  addEventListener('resize', flyttaPuck);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(flyttaPuck);
  addEventListener('load', flyttaPuck);
  // Plusknappen på mobilen göms när man rullar nedåt och kommer tillbaka när man rullar uppåt
  let senastY = scrollY; let fabTick = false;
  addEventListener('scroll', () => {
    if (fabTick) return; fabTick = true;
    requestAnimationFrame(() => { fabTick = false; const y = scrollY; const fab = $('.fab'); if (fab) { if (y > senastY + 6 && y > 120) fab.setAttribute('data-gomd', ''); else if (y < senastY - 6 || y < 120) fab.removeAttribute('data-gomd'); } senastY = y; });
  }, { passive: true });

  // Räknare i sidomenyn, flikraden (bara när något är varmt) och Mer-arket. Ett hopp när värdet ändras.
  const raknareNu = { todo: 0, projekt: 0, dokument: 0 };
  function uppdateraRaknare() {
    const satt = (namn, n, varm) => {
      $$(`[data-rakna="${sel(namn)}"]`).forEach((el) => {
        const fore = el.textContent; el.textContent = n || ''; el.hidden = !n; el.classList.toggle('rakna-varm', !!varm);
        if (fore && String(n || '') !== fore && !lugn) { el.removeAttribute('data-pop'); void el.offsetWidth; el.setAttribute('data-pop', ''); }
      });
      $$(`[data-rakna-mobil="${sel(namn)}"]`).forEach((el) => { el.textContent = varm && n ? n : ''; el.hidden = !(varm && n); });
    };
    satt('kunder', db.kunder.length);
    satt('salj', db.affarer.filter(arOppen).length);
    const attGranska = db.projekt.filter((p) => p.steg === 'underlag' && p.underlagStatus === 'ny').length;
    satt('projekt', db.projekt.filter((p) => p.steg !== 'klar').length, attGranska > 0);
    $$('[data-rakna-mobil="projekt"]').forEach((el) => { el.textContent = attGranska || ''; el.hidden = !attGranska; el.title = attGranska ? `${plural(attGranska, 'underlag', 'underlag')} att granska` : ''; });
    const mina = db.todos.filter((t) => !t.klar && t.ansvarig === jag && t.datum && dagarTill(t.datum) <= 0);
    const forf = mina.filter((t) => dagarTill(t.datum) < 0).length;
    satt('todo', mina.length, forf > 0);
    $$('[data-rakna-mobil="todo"]').forEach((el) => { el.title = forf ? `Att göra: ${mina.length} för idag, varav ${forf} ${forf === 1 ? 'förfallen' : 'förfallna'}` : ''; });
    const dokAtg = dokAtgarder(dokVem(dokPoster()), null, { vem: dokVemNu() });
    satt('dokument', dokAtg.length, dokAtg.some((x) => x.prio === 1));
    raknareNu.todo = mina.length; raknareNu.forfallna = forf; raknareNu.projekt = attGranska; raknareNu.dokument = dokAtg.length;
  }

  /* 12-dialog och toast ------------------------------------------------------------ */
  // Utkast: det inskrivna sparas i minnet (aldrig i webbläsarens lagring) när ett ark stängs utan att sparas
  const utkast = new Map();
  const utkastNyckel = (f) => `${f.dataset.form}|${f.dataset.kund || ''}|${f.dataset.affar || ''}|${f.dataset.projekt || ''}|${f.dataset.id || ''}`;
  // Dolda fält följer bara med när de är märkta data-utkast (snabbanteckningens uppföljningsdatum, som snabbvalen sätter)
  const utkastFalt = (f) => $$('input:not([type=hidden]):not([type=file]), input[type=hidden][data-utkast], textarea, select', f).filter((x) => x.name);
  // Ark som slår ihop samtidiga ändringar (kontaktperson, kunduppgifter – se "Samtidiga ändringar" vid kontaktpersonerna):
  // data-fore på formuläret = postens värden när arket öppnades, som text
  const likaVarde = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
  const arkVarden = (obj, falt) => Object.fromEntries(falt.map((x) => [x, String(obj && obj[x] != null ? obj[x] : '').trim()]));
  const foreVarden = (f) => { try { return JSON.parse(f.dataset.fore || '{}') || {}; } catch (err) { return {}; } };
  function sparaUtkast() {
    const f = $('form[data-form]', ark); if (!f || f.dataset.form === 'spinn') return;
    const falt = utkastFalt(f);
    const skrivet = falt.some((x) => (x.tagName === 'TEXTAREA' || ['text', 'email', 'tel', 'search', ''].includes(x.type)) && x.value.trim() && x.value !== x.defaultValue);
    if (!skrivet) return;
    const lista = falt.map((x) => [x.name, x.type === 'checkbox' || x.type === 'radio' ? (x.checked ? x.value : null) : x.value, x.type]);
    if (f.dataset.fore) lista.fore = foreVarden(f); // värdena utkastet utgick från
    utkast.set(utkastNyckel(f), lista);
  }
  function aterstallUtkast() {
    const f = $('form[data-form]', ark); if (!f) return;
    const sparat = utkast.get(utkastNyckel(f)); if (!sparat) return;
    const falt = utkastFalt(f);
    // Ett utkast skrivet för en annan kund tas inte fram när arket öppnas med en förvald kund (Ny affär/Att göra från en kundsida)
    const forval = falt.find((x) => x.name === 'kundId'); const sparatKund = (sparat.find(([namn]) => namn === 'kundId') || [])[1];
    if (forval && forval.value && sparatKund && sparatKund !== forval.value) return;
    // Sammanslagande ark: ett fält man inte ändrat i utkastet visar det som gäller nu (en kollega kan ha ändrat det), och ett
    // ändrat fält jämförs mot värdet då man började skriva – har en kollega ändrat samma fält syns det som krock när man sparar
    const gammalFore = sparat.fore && f.dataset.fore ? sparat.fore : null; const nyFore = gammalFore ? foreVarden(f) : null;
    sparat.forEach(([namn, varde, typ]) => {
      if (gammalFore && namn in gammalFore) { if (likaVarde(varde, gammalFore[namn])) return; nyFore[namn] = gammalFore[namn]; }
      if (typ === 'checkbox' || typ === 'radio') falt.filter((x) => x.name === namn).forEach((x) => { x.checked = varde != null && x.value === varde; });
      else { const x = falt.find((y) => y.name === namn && y.type === typ) || falt.find((y) => y.name === namn); if (x) { x.value = varde; if (x.tagName === 'SELECT') x.dispatchEvent(new Event('change', { bubbles: true })); } }
    });
    if (nyFore) f.dataset.fore = JSON.stringify(nyFore);
    f.insertAdjacentHTML('afterbegin', `<p class="utkast-hint">${ik('anteckning')}<span>Fortsätt där du var – det du skrev senast finns kvar.</span><button class="knapp knapp-spok knapp-liten" type="button" data-g="rensa-utkast">Börja om</button></p>`);
  }
  function oppnaArk(html, { bred = false } = {}) {
    ark.innerHTML = html;
    forberedAntal(ark);
    ark.toggleAttribute('data-bred', bred);
    // Raderna glider in en gång, 55 ms isär (bara transform och opacitet)
    $$('.ark-kropp > *', ark).forEach((el, i) => el.style.setProperty('--k', Math.min(i, 10)));
    aterstallUtkast();
    if (!ark.open) { arkOppnare = oppnarInfo(document.activeElement); ark.showModal(); }
    const forsta = $('[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select', ark);
    if (forsta && matchMedia('(min-width: 641px)').matches) {
      forsta.focus();
      // En lista (select) får sin knapp av valj.js först efter den här ritningen – flytta då fokus till knappen (den riktiga rutan är dold)
      if (forsta.tagName === 'SELECT') requestAnimationFrame(() => { if (document.activeElement === forsta && forsta._valjKnapp && ark.open) forsta._valjKnapp.focus(); });
    } else if (!forsta) {
      // Bekräftelser och val utan fält: huvudknappen – eller Avbryt när huvudknappen är farlig (raderar, makulerar)
      const knapp = $('.ark-fot .knapp-accent', ark) || $('.ark-fot [data-g="stang-ark"]', ark);
      if (knapp) knapp.focus();
    }
  }
  // Stäng bara när både nedtryckningen och släppet sker på bakgrunden – att markera text och släppa utanför stänger inte
  let nedPaBakgrund = false;
  ark.addEventListener('pointerdown', (ev) => { nedPaBakgrund = ev.target === ark; });
  ark.addEventListener('click', (ev) => {
    if (ev.target === ark && nedPaBakgrund) { sparaUtkast(); ark.close(); }
    nedPaBakgrund = false;
    // En länk till sidan man redan står på (t.ex. "Att göra" i Mer-arket) stänger arket – ingen hashchange sker
    const a = ev.target.closest && ev.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === (location.hash || '#/') && ark.open) ark.close();
  });
  ark.addEventListener('cancel', () => sparaUtkast());
  ark.addEventListener('close', () => {
    if (mallUi && mallUi.lage === 'ny' && mallUi.andrad && !mallUi.sparad) { mallUtkast.set(mallNyckel(mallUi), { ...mallUi.v }); mallUi.andrad = false; }
    ark.removeAttribute('data-bred'); fokusTillbaka();
  });
  /* Fokus tillbaka efter stängt ark. Webbläsaren lämnar tillbaka fokus till knappen som öppnade arket – men har vyn ritats om
     (sparat, flyttat kort) finns knappen inte längre. Då letas samma knapp upp i den nya vyn (samma data-g och data-id/-affar …),
     annars får vyn fokus, så att tangentbordet aldrig hamnar på sidans början. Den som själv flyttar fokus efteråt vinner. */
  let arkOppnare = null;
  function oppnarInfo(el) {
    if (!el || el === document.body || ark.contains(el)) return null;
    const attr = ['g', 'affar', 'id', 'kund', 'token', 'projekt', 'steg', 'flik', 'typ'].filter((k) => el.dataset && el.dataset[k]).map((k) => `[data-${k}="${sel(el.dataset[k])}"]`).join('');
    return { el, sel: attr ? `${el.tagName.toLowerCase()}${attr}` : el.id ? `#${sel(el.id)}` : '' };
  }
  function fokusTillbaka() {
    const info = arkOppnare; arkOppnare = null;
    setTimeout(() => {
      if (ark.open) return;
      const nu = document.activeElement;
      if (nu && nu !== document.body && nu.isConnected && !ark.contains(nu)) return;
      const synlig = (x) => !!x && x.isConnected && x.getClientRects().length > 0 && !x.closest('[hidden], [inert]');
      const kandidat = info && (synlig(info.el) ? info.el : info.sel ? $$(info.sel).find(synlig) : null);
      (kandidat || vy).focus({ preventScroll: true });
    }, 0);
  }
  // sym: ikonnamn eller emoji i en ruta före rubriken
  const arkHuvud = (titel, text = '', sym = '') => `<div class="ark-huvud">${sym ? `<span class="ark-symbol">${symbol(sym, { ruta: 'l' })}</span>` : ''}<div class="ark-rubrik"><h2 id="ark-titel">${e(titel)}</h2>${text ? `<p>${e(text)}</p>` : ''}</div><button class="ikonknapp" type="button" data-g="stang-ark" aria-label="Stäng">${ik('stang')}</button></div>`;
  // Webbläsarens felbubbla syns inte vid en dold select (valj-knappen) och täcker hjälptexter – visa en egen felrad i stället
  let felFokus = false;
  document.addEventListener('invalid', (ev) => {
    const falt = ev.target; const f = falt.form || (falt.closest && falt.closest('form'));
    if (!f || !f.matches('form[data-form]') || !falt.name) return;
    ev.preventDefault();
    felFalt(f, falt.name, falt.dataset.fel || (falt.tagName === 'SELECT' ? 'Välj ett alternativ i listan' : falt.validationMessage || 'Fyll i fältet'), { fokus: !felFokus });
    felFokus = true; setTimeout(() => { felFokus = false; }, 0);
  }, true);
  // Felrad under ett fält (även en dold select bakom valj-knappen) – fokus flyttas dit
  function felFalt(f, namn, text, { fokus = true } = {}) {
    const falt = f.querySelector(`[name="${sel(namn)}"]`); if (!falt) return;
    const id = `fel-${namn}-${Math.random().toString(36).slice(2, 7)}`;
    const ankare = falt._valjKnapp || falt;
    const gammal = ankare.parentElement.querySelector('.falt-fel'); if (gammal) gammal.remove();
    ankare.insertAdjacentHTML('afterend', `<p class="falt-fel" id="${id}" role="alert">${ik('varning')}${e(text)}</p>`);
    falt.setAttribute('aria-invalid', 'true'); falt.setAttribute('aria-describedby', id);
    if (falt._valjKnapp) { falt._valjKnapp.setAttribute('data-ogiltig', ''); falt._valjKnapp.setAttribute('aria-describedby', id); }
    const rensa = () => { const p = document.getElementById(id); if (p) p.remove(); falt.removeAttribute('aria-invalid'); falt.removeAttribute('aria-describedby'); if (falt._valjKnapp) falt._valjKnapp.removeAttribute('aria-describedby'); };
    falt.addEventListener('change', rensa, { once: true }); falt.addEventListener('input', rensa, { once: true });
    if (fokus) (falt._valjKnapp || falt).focus();
  }

  // Toast: ikon eller emoji, valfri rubrik, en åtgärd (länk eller t.ex. Ångra – eller en lista med åtgärder, t.ex. Ångra och
  // Markera klara) och en tidsstapel. Pausar när musen är över, stängs vid klick. ikon 'varning' används för krockar och sparfel i skarpt läge.
  function toast(text, lank, ikon = 'bock', { rubrik = '', tid = 0, atgard = null } = {}) {
    const atgarder = (Array.isArray(atgard) ? atgard : [atgard]).filter(Boolean);
    const t = document.createElement('div');
    t.className = 'toast';
    const varning = ikon === 'varning';
    t.setAttribute('role', varning ? 'alert' : 'status');
    if (varning) t.setAttribute('data-varning', '');
    const ms = tid || (varning ? 6000 : atgarder.length > 1 ? 9000 : lank || atgarder.length ? 6500 : 3600);
    t.style.setProperty('--tid', ms + 'ms');
    t.innerHTML = `<span class="toast-ikon">${symbol(ikon)}</span><span class="toast-text">${rubrik ? `<b>${e(rubrik)}</b>` : ''}<span>${e(text)}</span></span>${lank ? `<a class="toast-atgard" href="${e(lank.href)}">${e(lank.text)}</a>` : ''}${atgarder.map((x, i) => `<button class="toast-atgard" type="button" data-i="${i}">${e(x.text)}</button>`).join('')}<i class="toast-tid" aria-hidden="true"></i>`;
    $('[data-toaster]').appendChild(t);
    let kvar = ms; let start = Date.now(); let timer = 0;
    const ut = () => { clearTimeout(timer); if (t.hasAttribute('data-ut')) return; t.setAttribute('data-ut', ''); setTimeout(() => t.remove(), 320); };
    const kor = () => { start = Date.now(); timer = setTimeout(ut, kvar); };
    t.addEventListener('pointerenter', () => { clearTimeout(timer); kvar -= Date.now() - start; t.setAttribute('data-paus', ''); });
    t.addEventListener('pointerleave', () => { t.removeAttribute('data-paus'); kvar = Math.max(kvar, 1800); kor(); });
    t.addEventListener('click', (ev) => {
      const knapp = ev.target.closest('button.toast-atgard');
      const x = knapp && atgarder[+knapp.dataset.i || 0];
      if (x && typeof x.fn === 'function') x.fn();
      ut();
    });
    kor();
    return t;
  }

  /* Sparstatus i toppraden (skarpt läge): "Sparar …", "Sparat" och "Ej sparat · Försök nu" tills allt är sparat igen */
  let sparLage = 'tyst'; let sparTimerUi = 0; let sparVantar = 0;
  function sparStatus(lage, lofte) {
    const el = $('[data-sparstatus]'); if (!el || !SKARP) return;
    clearTimeout(sparTimerUi);
    if (lage === 'sparar') {
      if (sparLage === 'fel') return; // nätverksfelet ligger kvar tills allt är sparat
      sparVantar++;
      sparTimerUi = setTimeout(() => { if (sparVantar && sparLage !== 'fel') visaSparStatus('sparar'); }, 450);
      Promise.resolve(lofte).then((svar) => { sparVantar = Math.max(0, sparVantar - 1); if (sparLage === 'fel') return; if (svar && svar.ok) { if (!sparVantar) { visaSparStatus('sparat'); sparTimerUi = setTimeout(() => visaSparStatus('tyst'), 2200); } } else if (svar && (svar.status === 0 || svar.status >= 500)) visaSparStatus('fel'); else visaSparStatus('tyst'); });
      return;
    }
    visaSparStatus(lage);
    if (lage === 'sparat') sparTimerUi = setTimeout(() => visaSparStatus('tyst'), 2200);
  }
  function visaSparStatus(lage) {
    const el = $('[data-sparstatus]'); if (!el) return;
    sparLage = lage; el.dataset.lage = lage; el.hidden = lage === 'tyst';
    el.innerHTML = lage === 'sparar' ? `<i class="spar-prick" aria-hidden="true"></i>Sparar …`
      : lage === 'sparat' ? `${ik('bock')}Sparat`
        : lage === 'fel' ? `${ik('varning')}<span>Ej sparat · försöker igen</span><button type="button" data-g="spara-nu">Försök nu</button>` : '';
  }

  const kundAlternativ = (vald) => [...db.kunder].sort((a, b) => a.namn.localeCompare(b.namn, 'sv')).map((k) => `<option value="${e(k.id)}" ${vald === k.id ? 'selected' : ''}>${e(k.namn)}</option>`).join('');
  // Bara aktiva användare (skarpt läge kan ha inaktiverade) – den som redan är vald visas ändå
  const anvAlternativ = (vald) => aktiva(vald).map((u) => `<option value="${e(u.id)}" ${vald === u.id ? 'selected' : ''}>${e(u.namn)}</option>`).join('');
  // Ansvarig säljare: bara roll sälj (testteamet och rena admin-konton är inte säljansvariga)
  const saljAlternativ = (vald) => aktiva(vald).filter((u) => u.roll === 'salj' || u.id === vald).map((u) => `<option value="${e(u.id)}" ${vald === u.id ? 'selected' : ''}>${e(u.namn)}</option>`).join('');
  const klubbAlternativ = (vald) => `<option value="">Ingen – direkt kontakt</option>` + klubbar().filter((k) => k.klubbavtal).map((k) => `<option value="${e(k.id)}" ${vald === k.id ? 'selected' : ''}>${e(k.namn)}</option>`).join('');
  // Snabbval för datum med etikett och valt datum i klartext. aktiv: false = inget är valt förrän kryssrutan bockas i
  const datumSnabbval = (namn, varde, { etikett = '', aktiv = true } = {}) => `<div class="snabbval-rad" ${aktiv ? '' : 'data-vilande'}>${etikett ? `<span class="snabbval-etikett">${e(etikett)}</span>` : ''}<div class="snabbval" data-snabbdatum="${e(namn)}" role="group" aria-label="${e(etikett || 'Datum')}">${[['Idag', 0], ['Imorgon', 1], ['Om 3 dagar', 3], ['Nästa vecka', 7]].map(([t, n]) => `<button type="button" data-g="snabbdatum" data-dagar="${e(n)}" aria-pressed="${aktiv && omDagar(n) === varde}">${t}</button>`).join('')}</div><span class="snabbval-datum" data-snabbval-datum>${e(dagText(varde))}</span></div>`;

  /* 12-snabbarket (ägare S): "+ Ny" (Skapa ny) och Snabbregistrera i samma formspråk som sidorna – en mörk, rundad topp
     (rubrik och flikar med EN glidande markör) och ett ljust ark under med formuläret (sidor.css avsnitt 12). Ett flikbyte
     sker på plats: huvudet står still, markören glider, formuläret glider in från det håll man går åt och arkets höjd följer
     mjukt med; det man hunnit skriva sparas som utkast. Kortkommandon: pilar/Home/End i flikraden, Ctrl/⌘ + Enter sparar,
     Enter i "Att göra" lägger till. */
  const SNABB_MOD = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl';
  const snabbTopp = (titel, text, { ogon = '', flikar = '' } = {}) => `<div class="snabb-topp" data-mork-yta><span class="snabb-handtag" aria-hidden="true"></span>
      <div class="snabb-huvud"><div class="snabb-rubrik">${ogon}<h2 id="ark-titel">${e(titel)}</h2>${text ? `<p>${e(text)}</p>` : ''}</div>
        <button class="snabb-stang" type="button" data-g="stang-ark" aria-label="Stäng">${ik('stang')}</button></div>${flikar}</div>`;
  // Arkets höjd följer mjukt med när innehållet byts i ett öppet ark (en gång, bara arkets höjd – ingen loop)
  let snabbAnim = null;
  function snabbHojd(fore) {
    if (lugn || !fore || !ark.open) return;
    if (snabbAnim) { snabbAnim.cancel(); snabbAnim = null; }
    const nu = ark.getBoundingClientRect().height; if (Math.abs(nu - fore) < 2) return;
    ark.setAttribute('data-snabb-hojd', '');
    const anim = ark.animate([{ height: `${fore}px` }, { height: `${nu}px` }], { duration: 440, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    snabbAnim = anim;
    const klar = () => { if (snabbAnim === anim) { snabbAnim = null; ark.removeAttribute('data-snabb-hojd'); } };
    anim.onfinish = klar; anim.oncancel = klar;
  }

  /* "+ Ny": välj vad du vill skapa – snabbregistreringen blir steg två */
  function oppnaSkapaNy() {
    const val = [
      ['snabb', 'anteckning', UPEMO.akt.anteckning, 'Anteckning', 'Möte, samtal eller mejl på en kund'],
      ['snabb', 'todo', UPEMO.sak.todo, 'Att göra', 'En uppgift med datum och ansvarig'],
      ['ny-affar', '', UPEMO.sak.offert, 'Ny affär', 'Hamnar i säljtavlan med pris från prislistan'],
      ['snabb', 'kund', UPEMO.kundtyp.foretag, 'Ny kund', 'Företag eller klubb, med kontaktperson'],
    ];
    const fore = ark.open ? ark.getBoundingClientRect().height : 0;
    if (fore) sparaUtkast();
    oppnaArk(`${snabbTopp('Skapa ny', 'Vad vill du lägga in?')}
      <div class="snabb-yta"><div class="ark-kropp"><div class="skapa-val">${val.map(([g, flik, em, titel, text], i) => `<button class="skapa-kort" type="button" data-g="${g}" ${flik ? `data-flik="${flik}"` : ''} ${i === 0 ? 'autofocus' : ''}>${emo(em, { ruta: 'l' })}<span><strong>${titel}</strong><small>${text}</small></span>${ik('pil')}</button>`).join('')}</div>
        <p class="falt-hint skapa-tips">${emo(UPEMO.sak.tips)}<span>Kortkommando: tryck <kbd>N</kbd> i säljtavlan för en ny affär, <kbd>${SNABB_MOD}</kbd> + <kbd>K</kbd> för att söka.</span></p></div></div>`);
    snabbHojd(fore);
  }

  /* Snabbregistrering – byggd för mobilen: kund, text, spara. mus: flikbytet kom från ett musklick (då får första fältet fokus) */
  function oppnaSnabb(flik = 'anteckning', { kundId = '', via = '', typ = '', text = '', mus = false } = {}) {
    const flikar = [['anteckning', 'Anteckning', UPEMO.akt.anteckning], ['todo', 'Att göra', UPEMO.sak.todo], ['kund', 'Ny kund', UPEMO.kundtyp.foretag]];
    let i = flikar.findIndex(([id]) => id === flik); if (i < 0) { i = 0; flik = 'anteckning'; }
    const panel = (form) => `data-form="${form}" class="ark-kropp" id="snabb-panel" role="tabpanel" aria-labelledby="snabb-flik-${e(flik)}"`;
    let kropp = '';
    if (flik === 'anteckning') {
      kropp = `<form ${panel('snabb-anteckning')}>
        <label><span class="etikett">Kund<span class="krav">*</span></span><select class="falt" name="kundId" required data-fel="Välj vilken kund anteckningen gäller"><option value="">Välj kund…</option>${kundAlternativ(kundId)}</select></label>
        <div class="snabb-falt"><span class="etikett" id="snabb-akt-typ">Typ av aktivitet</span><div class="typval typval-fyra" role="radiogroup" aria-labelledby="snabb-akt-typ">${['mote', 'samtal', 'anteckning', 'mejl'].map((t, j) => `<label><input type="radio" name="typ" value="${e(t)}" ${j === 0 ? 'checked' : ''}><span>${emo(UPEMO.akt[t])}${AKT_TYP[t]}</span></label>`).join('')}</div></div>
        <label><span class="etikett">Vad hände?<span class="krav">*</span></span><textarea class="falt" name="text" rows="4" required data-fel="Skriv kort vad som hände" placeholder="Träffade Peter på mässan – intresserad av Bas för 40 pers."></textarea></label>
        <div class="snabb-folj"><label class="kryss"><input type="checkbox" name="folj"><span>Skapa att göra för uppföljning<small>Hamnar i din lista det datum du väljer</small></span></label>
        <input type="hidden" name="datum" value="${omDagar(3)}" data-utkast>${datumSnabbval('datum', omDagar(3), { etikett: 'Följ upp', aktiv: false })}</div>
      </form>`;
    } else if (flik === 'todo') {
      kropp = `<form ${panel('snabb-todo')}>
        <label><span class="etikett">Att göra<span class="krav">*</span></span><input class="falt" name="text" required data-fel="Skriv vad som ska göras" placeholder="Skicka offert till…" value="${e(text)}" enterkeyhint="done"></label>
        <div class="falt-rad"><label><span class="etikett">Kund <em>(valfritt)</em></span><select class="falt" name="kundId"><option value="">Ingen kund</option>${kundAlternativ(kundId)}</select></label>
        <label><span class="etikett">Ansvarig</span><select class="falt" name="ansvarig">${anvAlternativ(jag)}</select></label></div>
        <div class="snabb-nar"><span class="etikett" id="snabb-nar-etikett">Datum</span><div class="snabb-nar-rad">${datumSnabbval('datum', omDagar(1))}<input class="falt" type="date" name="datum" value="${omDagar(1)}" min="${omDagar(-365)}" max="${omDagar(730)}" data-fel="Välj ett datum inom två år" aria-labelledby="snabb-nar-etikett"></div></div>
      </form>`;
    } else {
      const klubb = typ === 'klubb';
      kropp = `<form ${panel('snabb-kund')}>
        <div class="snabb-kund-topp"><label><span class="etikett">Namn på företag eller klubb<span class="krav">*</span></span><input class="falt" name="namn" required autocomplete="off" data-fel="Skriv företagets eller klubbens namn"><p class="falt-hint dubblett" data-dubblett hidden></p><input type="hidden" name="anda" value=""></label>
        <div class="snabb-falt"><span class="etikett" id="snabb-kundtyp">Typ</span><div class="typval snabb-typval" role="radiogroup" aria-labelledby="snabb-kundtyp">${[['foretag', 'Företag', UPEMO.kundtyp.foretag], ['klubb', 'Klubb', UPEMO.sak.klubb]].map(([v, t, em]) => `<label><input type="radio" name="typ" value="${v}" ${(v === 'klubb') === klubb ? 'checked' : ''}><span>${emo(em)}${t}</span></label>`).join('')}</div></div></div>
        <div class="falt-rad"><label><span class="etikett">Kontaktperson</span><input class="falt" name="kontakt" autocomplete="off"></label><label><span class="etikett">Roll</span><input class="falt" name="roll"></label></div>
        <div class="falt-rad"><label><span class="etikett">Telefon</span><input class="falt" name="tel" type="tel" inputmode="tel" placeholder="070-123 45 67"></label><label><span class="etikett">E-post</span><input class="falt" name="epost" type="email" inputmode="email" placeholder="namn@foretag.se" data-fel="Skriv en giltig e-postadress, t.ex. namn@foretag.se"></label></div>
        <label data-bara-foretag ${klubb ? 'hidden' : ''}><span class="etikett">Introducerad via klubb</span><select class="falt" name="viaKlubb">${klubbAlternativ(via)}</select><p class="falt-hint">Kopplar kunden till Klubbmotorn – klubben får ${Math.round(KLUBBMOTORN.provision * 100)} % av affärsvärdet om det blir affär.</p></label>
        <p class="falt-hint klubb-hint" data-bara-klubb ${klubb ? '' : 'hidden'}>${emo(UPEMO.sak.klubb)}Klubben hamnar i Klubbmotorn med ${Math.round(KLUBBMOTORN.provision * 100)} % provision – ingen affär skapas. Ange utbetalningsform på klubbsidan.</p>
        <label class="kryss" data-bara-foretag ${klubb ? 'hidden' : ''}><input type="checkbox" name="affar" ${klubb ? '' : 'checked'}><span>Lägg in som ny affär i säljtavlan<small>I steget Ny kontakt, med Bas för 20 personer som start</small></span></label>
        <label><span class="etikett">Anteckning <em>(valfritt)</em></span><textarea class="falt" name="text" rows="2" placeholder="Var träffades ni? Vad är intresset?"></textarea></label>
      </form>`;
    }
    const knappText = { anteckning: ['Spara', ' anteckning'], todo: ['Lägg till', ''], kund: ['Skapa', ' kund'] }[flik];
    const fot = `<div class="ark-fot"><p class="snabb-kbd"><kbd>${SNABB_MOD}</kbd>+<kbd>Enter</kbd><span>${flik === 'todo' ? 'lägger till' : 'sparar'}</span></p><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark" aria-keyshortcuts="${SNABB_MOD === '⌘' ? 'Meta' : 'Control'}+Enter">${ik('bock')}<span>${knappText[0]}<span class="lang-text">${knappText[1]}</span></span></button></div>`;
    // Redan öppet snabbark: byt bara formuläret och foten – huvudet står still och markören glider
    const yta = ark.open && $('.snabb-yta[data-snabb]', ark);
    if (yta) { bytSnabbFlik(yta, i, kropp + fot, mus); return; }
    const fore = ark.open ? ark.getBoundingClientRect().height : 0;
    if (fore) sparaUtkast();
    const flikrad = `<div class="snabb-flikar" role="tablist" aria-label="Vad vill du lägga in?" data-i="${i}" style="--i:${i};--n:${flikar.length}"><span class="snabb-markor" aria-hidden="true"></span>${flikar.map(([id, t, em], j) => `<button type="button" role="tab" id="snabb-flik-${e(id)}" aria-controls="snabb-panel" aria-selected="${j === i}" tabindex="${j === i ? 0 : -1}" data-g="snabb" data-flik="${e(id)}" data-kund="${e(kundId)}" data-via="${e(via)}" data-typ="${e(typ)}">${emo(em)}<span>${t}</span></button>`).join('')}</div>`;
    oppnaArk(`${snabbTopp('Snabbregistrera', SKARP ? 'Allt du lägger in syns direkt för hela teamet.' : 'Sparas i den här webbläsaren – prototyp med exempeldata.', { ogon: `<button class="snabb-ogon" type="button" data-g="skapa-ny">${ik('pil-v')}Skapa ny</button>`, flikar: flikrad })}
      <div class="snabb-yta" data-snabb>${kropp}${fot}</div>`);
    snabbFokus(snabbEfter());
    snabbHojd(fore);
  }
  function bytSnabbFlik(yta, i, html, mus) {
    const lista = $('.snabb-flikar', ark); if (!lista) return;
    const forra = parseInt(lista.dataset.i, 10) || 0;
    if (forra === i && $('form[data-form]', yta)) return;
    sparaUtkast();
    const fore = ark.getBoundingClientRect().height;
    lista.dataset.i = i; lista.style.setProperty('--i', i);
    $$('[role="tab"]', lista).forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    yta.style.setProperty('--dir', i > forra ? 1 : -1);
    yta.setAttribute('data-byte', '');
    yta.innerHTML = html;
    $$('.ark-kropp > *', yta).forEach((el, k) => el.style.setProperty('--k', Math.min(k, 10)));
    aterstallUtkast();
    const f = snabbEfter();
    if (mus) snabbFokus(f);
    snabbHojd(fore);
  }
  // Efter att formuläret ritats (och ett ev. utkast lagts tillbaka): radioknapparna, kundtypens fält och datumvalet stämmer
  function snabbEfter() {
    const f = $('.snabb-yta form[data-form]', ark); if (!f) return null;
    // aterstallUtkast kan lämna en radiogrupp helt urbockad (den sist sparade raden i gruppen är tom) – bocka i den som var vald
    const sparat = utkast.get(utkastNyckel(f));
    if (sparat) sparat.forEach(([namn, varde, typ]) => { if (typ !== 'radio' || varde == null) return; const r = $$('input[type="radio"]', f).find((x) => x.name === namn && x.value === varde); if (r) r.checked = true; });
    if (f.dataset.form === 'snabb-kund') {
      const klubb = ($$('input[name="typ"]', f).find((x) => x.checked) || {}).value === 'klubb';
      $$('[data-bara-foretag]', f).forEach((x) => { x.hidden = klubb; }); $$('[data-bara-klubb]', f).forEach((x) => { x.hidden = !klubb; });
    }
    if (f.dataset.form === 'snabb-todo') snabbDatumSynk(f);
    if (f.dataset.form === 'snabb-anteckning') snabbFoljSynk(f);
    return f;
  }
  // Fokus (bara dator – på mobilen öppnas annars tangentbordet direkt): det fält man börjar med
  function snabbFokus(f) {
    if (!f || !matchMedia('(min-width: 641px)').matches) return;
    const el = f.elements;
    const mal = f.dataset.form === 'snabb-anteckning' ? (el.kundId && !el.kundId.value ? el.kundId : el.text) : f.dataset.form === 'snabb-kund' ? el.namn : el.text;
    // en väljare (valj.js) tar emot fokus i sin knapp – den riktiga rutan är dold
    if (mal) requestAnimationFrame(() => { const m = mal._valjKnapp || mal; if (ark.open && m.isConnected) m.focus({ preventScroll: true }); });
  }
  // Att göra: datumfältet och snabbvalen visar samma datum (ett valt snabbval är tänt)
  function snabbDatumSynk(f) {
    const d = f.elements.datum && f.elements.datum.value;
    $$('[data-g="snabbdatum"]', f).forEach((b) => b.setAttribute('aria-pressed', String(!!d && omDagar(parseInt(b.dataset.dagar, 10)) === d)));
    const t = $('[data-snabbval-datum]', f); if (t) t.textContent = d ? dagText(d) : '';
  }
  // Anteckningens uppföljning: raden vilar tills rutan är ikryssad, och då är det valda datumets snabbval tänt (även efter ett utkast)
  function snabbFoljSynk(f) {
    const folj = f.elements.folj; const rad = $('.snabbval-rad', f); if (!folj || !rad) return;
    const d = f.elements.datum && f.elements.datum.value;
    rad.toggleAttribute('data-vilande', !folj.checked);
    $$('[data-g="snabbdatum"]', rad).forEach((b) => b.setAttribute('aria-pressed', String(folj.checked && !!d && omDagar(parseInt(b.dataset.dagar, 10)) === d)));
    const t = $('[data-snabbval-datum]', rad); if (t && d) t.textContent = dagText(d);
  }
  ark.addEventListener('change', (ev) => { const f = ev.target.closest && ev.target.closest('form[data-form="snabb-todo"]'); if (f && ev.target.name === 'datum') snabbDatumSynk(f); });
  ark.addEventListener('close', () => { if (snabbAnim) snabbAnim.cancel(); });
  // Kortkommandon i snabbarket: pilar/Home/End mellan flikarna, Ctrl/⌘ + Enter sparar, Enter i "Att göra" lägger till
  ark.addEventListener('keydown', (ev) => {
    if (ev.isComposing || !$('.snabb-yta[data-snabb]', ark)) return;
    const flik = ev.target.closest && ev.target.closest('.snabb-flikar [role="tab"]');
    if (flik && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
      const alla = $$('.snabb-flikar [role="tab"]', ark); const j = alla.indexOf(flik); const n = alla.length;
      const mal = ev.key === 'ArrowRight' ? (j + 1) % n : ev.key === 'ArrowLeft' ? (j + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
      if (mal < 0) return;
      ev.preventDefault(); G.snabb(alla[mal]); alla[mal].focus(); return;
    }
    if (ev.key !== 'Enter') return;
    const f = $('.snabb-yta form[data-form]', ark); if (!f) return;
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); f.requestSubmit(); return; }
    if (f.dataset.form === 'snabb-todo' && ev.target === f.elements.text && !ev.shiftKey && !ev.altKey) { ev.preventDefault(); f.requestSubmit(); }
  });
  // Övriga ark med huvudknappen i foten (data-g="skicka-ark", utanför formuläret – därför ingen inbyggd Enter): Enter i ett vanligt
  // fält och Ctrl/⌘ + Enter var som helst i formuläret gör samma sak som knappen. Textrutor får radbrytning med Enter som förut;
  // knappar, kryssrutor, listor och väljarnas egna listor (ligger utanför formuläret) hanterar Enter själva.
  const ENTER_FALT = /^(text|email|tel|number|search|url|date|password)$/;
  ark.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.isComposing || ev.defaultPrevented || ev.altKey || ev.shiftKey || $('.snabb-yta[data-snabb]', ark)) return;
    const f = ev.target.closest && ev.target.closest('form'); const knapp = $('.ark-fot [data-g="skicka-ark"]', ark);
    if (!f || !knapp || knapp.disabled || f !== $('form', ark) || $('[type="submit"]', f)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod && !(ev.target.matches('input') && ENTER_FALT.test(ev.target.type))) return;
    ev.preventDefault(); knapp.click();
  });

  function oppnaNyAffar(kundId = '', steg = '') {
    const k = kundId ? kund(kundId) : null;
    const antal = k && k.anstallda ? k.anstallda : 20;
    oppnaArk(`${arkHuvud('Ny affär', 'Hamnar i säljtavlan. Offerten räknas fram från prislistan.', UPEMO.sak.offert)}
      <form data-form="ny-affar" class="ark-kropp">
        <label><span class="etikett">Kund<span class="krav">*</span></span><select class="falt" name="kundId" required data-fel="Välj vilken kund affären gäller"><option value="">Välj kund…</option>${kundAlternativ(kundId)}</select></label>
        <label><span class="etikett">Rubrik</span><input class="falt" name="titel" placeholder="T.ex. Hälsokartläggning 2027" value="Hälsokartläggning"></label>
        <div class="falt-rad"><label><span class="etikett">Paket</span><select class="falt" name="paket">${Object.entries(PRISER.paket).map(([id, p]) => `<option value="${e(id)}">${p.namn} – ${kr(p.pris)}/pers</option>`).join('')}</select></label>
        <label><span class="etikett">Antal medarbetare</span><input class="falt" type="number" min="1" name="antal" value="${e(antal)}"></label></div>
        <p class="nyaffar-pris" data-nyaffar-pris>≈ ${kr(prisa({ paket: 'bas', antal, tillval: [], app: true }).total)} exkl. moms enligt prislistan <small>(med appen i 12 månader)</small></p>
        <div class="falt-rad"><label><span class="etikett">Steg</span><select class="falt" name="steg">${SALJSTEG.filter((s) => s.id !== 'signerad').map((s) => `<option value="${e(s.id)}" ${steg === s.id ? 'selected' : ''}>${e(s.namn)}</option>`).join('')}</select></label>
        <label><span class="etikett">Ansvarig</span><select class="falt" name="ansvarig">${saljAlternativ(anv(jag).roll === 'salj' ? jag : (db.anvandare.find((u) => u.roll === 'salj' && arAktiv(u)) || anv(jag)).id)}</select></label></div>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('plus')}Skapa affär</button></div>`);
  }
  function uppdateraNyAffarPris() {
    const f = $('form[data-form="ny-affar"]', ark); const p = f && $('[data-nyaffar-pris]', f); if (!p) return;
    const antal = Math.max(1, parseInt(f.antal.value, 10) || 1);
    p.innerHTML = `≈ ${kr(prisa({ paket: f.paket.value, antal, tillval: [], app: true }).total)} exkl. moms enligt prislistan <small>(med appen i 12 månader)</small>`;
  }

  /* Överlämning – sälj fyller i allt testteamet behöver */
  const overlamningForifylld = (a) => {
    const k = a ? kund(a.kundId) : null; if (!a || !k) return {};
    const pk = primarKontakt(k); const kl = a.offert.underlag ? db.kundlankar[a.offert.underlag] : null; const kf = (kl && kl.foretag) || {};
    return { kontakt: kf.kontakt || (pk ? `${pk.namn}${pk.roll ? ', ' + pk.roll : ''}` : ''), telefon: kf.tel || (pk ? pk.tel : ''), adress: kf.plats || '', period: kf.period || '', lokal: '', bransch: k.bransch || '', ovrigt: (kl && kl.meddelande) || '',
      // Deltagarlistan är mottagen först när kundunderlaget är inskickat – ett skickat infodokument (check.info) är inte samma sak
      deltagarlista: ((kl || lankFor(a.id) || {}).status === 'inskickad'), samtycke: !!(a.check && a.check.samtycke), pub: !!(a.check && a.check.pub) };
  };
  /* Underlagets kontakt eller telefon jämförs med kundkortet: kundlänken kan ha ett äldre nummer, eller kontakten kan ha ändrats
     efter överlämningen. Skiljer de sig visas en gul rad med kundkortets uppgifter och "Använd kundkortets" – annars kan
     testteamet få ett annat nummer än det som står på kundkortet. Ritas om när fälten ändras (kontrolleraOverlamning). */
  const telSiffror = (t) => String(t || '').replace(/\D/g, '').replace(/^46(?=7)/, '0');
  function overlamningJamfor(k, kontakt, telefon) {
    const pk = primarKontakt(k); if (!pk || !k) return null;
    const pkNamn = String(pk.namn || '').trim(); const pkKontakt = `${pkNamn}${pk.roll ? ', ' + pk.roll : ''}`;
    const annanKontakt = !!pkNamn && !String(kontakt || '').toLowerCase().includes(pkNamn.toLowerCase());
    const annanTel = !!String(pk.tel || '').trim() && telSiffror(pk.tel) !== telSiffror(telefon);
    if (!annanKontakt && !annanTel) return null;
    const tel = `<strong>${e(pk.tel)}</strong>`; // numret bryts aldrig mitt i
    const html = annanKontakt && annanTel ? `Kundkortet har en annan kontaktperson och ett annat nummer: ${e(pkKontakt)} · ${tel}.`
      : annanTel ? `Kundkortet har ett annat nummer till ${e(pkNamn)}: ${tel}.` : `Kundkortets kontaktperson är ${e(pkKontakt)}.`;
    return { html, kontakt: annanKontakt ? pkKontakt : '', telefon: annanTel ? pk.tel : '' };
  }
  const overlamningJamforHtml = (j) => `${ik('info')}<p>${j.html}</p><button class="knapp knapp-spok knapp-liten" type="button" data-g="overlamning-kundkort" data-kontakt="${e(j.kontakt)}" data-tel="${e(j.telefon)}">Använd kundkortets</button>`;
  // start: värden att börja med (mallen Överlämning → "Överlämna på affären" tar med det som skrivits)
  function oppnaOverlamning(affarId, projektId, start = null) {
    const a = affar(affarId); const k = kund(a.kundId); const p = projektId ? projekt(projektId) : null;
    const u = p ? p.underlag : { ...overlamningForifylld(a), ...(start || {}) };
    const pr = prisa(a.offert);
    oppnaArk(`${arkHuvud(p ? 'Komplettera underlag' : 'Överlämning till testteamet', 'Testteamet har ingen relation till kunden. Allt de behöver ska stå här.', UPEMO.proj.underlag)}
      <form data-form="overlamning" data-affar="${e(a.id)}" data-projekt="${e(p ? p.id : '')}" class="ark-kropp">
        <div class="kort" style="box-shadow:none;background:var(--ben)"><dl class="pengar" style="padding:14px 16px"><div><dt>Kund</dt><dd>${e(k.namn)}</dd></div><div><dt>Beställning</dt><dd style="white-space:normal;text-align:right">${e(a.offert.eget != null ? a.offert.beskrivning : paketText(a.offert))}</dd></div><div><dt>Ordervärde</dt><dd>${kr(pr.total)}</dd></div>${p ? '' : `<div><dt>Förskottsfaktura 25 %</dt><dd>${kr(fakturaDelar(pr.total).forskott)}</dd></div>`}</dl></div>
        ${p && p.returKommentar ? `<div class="retur" style="margin:0">${ik('retur')}<div><strong>Testteamet skrev</strong>${e(p.returKommentar)}</div></div>` : ''}
        ${(() => { const j = overlamningJamfor(k, u.kontakt, u.telefon); return `<div class="falt-jamfor" data-ov-jamfor role="status"${j ? '' : ' hidden'}>${j ? overlamningJamforHtml(j) : ''}</div>`; })()}
        <div class="falt-rad">${UNDERLAG_FALT.filter((f) => !f.textarea).map((f) => `<label><span class="etikett">${e(f.etikett)}${f.krav ? '<span class="krav">*</span>' : ' <em>(valfritt)</em>'}</span><input class="falt" name="${e(f.id)}" type="${f.typ || 'text'}" value="${e(u[f.id] || '')}" ${f.krav ? 'data-krav' : ''} data-etikett="${e(f.etikett)}">${f.hint ? `<p class="falt-hint">${e(f.hint)}</p>` : ''}</label>`).join('')}</div>
        ${UNDERLAG_FALT.filter((f) => f.textarea).map((f) => `<label><span class="etikett">${e(f.etikett)} <em>(valfritt)</em></span><textarea class="falt" name="${e(f.id)}" rows="3">${e(u[f.id] || '')}</textarea></label>`).join('')}
        <div style="display:grid;gap:8px"><span class="etikett">Kontrollpunkter<span class="krav">*</span></span>${UNDERLAG_KONTROLL.map((f) => `<label class="kryss"><input type="checkbox" name="${e(f.id)}" ${u[f.id] ? 'checked' : ''} data-krav data-etikett="${e(f.etikett)}"><span>${e(f.etikett)}</span></label>`).join('')}</div>
      </form>
      <div class="ark-fot ark-fot-status"><p class="chip chip-gul overlamning-status" data-overlamning-status aria-live="polite"></p><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark" data-overlamning-knapp>${ik('pil')}${p ? 'Skicka till testteamet igen' : 'Överlämna till testteamet'}</button></div>`);
    kontrolleraOverlamning();
  }
  // Status nära knappen: vad som saknas. Knappen är "låst" men ett klick visar det första som saknas.
  function kontrolleraOverlamning() {
    const f = $('form[data-form="overlamning"]', ark); if (!f) return null;
    const krav = $$('[data-krav]', f);
    const saknas = krav.filter((el) => !(el.type === 'checkbox' ? el.checked : el.value.trim()));
    const status = $('[data-overlamning-status]', ark);
    const korta = saknas.map((el) => (el.dataset.etikett || '').replace(/ (till kontaktpersonen|för testdagen|eller period|på plats)$/, '').replace(/ med personuppgifter och testval mottagen$/, '').toLowerCase());
    status.textContent = !saknas.length ? 'Allt obligatoriskt är ifyllt ✓' : `${krav.length - saknas.length} av ${krav.length} klara · saknas: ${korta.slice(0, 3).join(', ')}${korta.length > 3 ? ` +${korta.length - 3}` : ''}`;
    status.className = 'chip overlamning-status ' + (!saknas.length ? 'chip-ok' : 'chip-gul');
    const knapp = $('[data-overlamning-knapp]', ark);
    knapp.toggleAttribute('aria-disabled', !!saknas.length); knapp.classList.toggle('knapp-last', !!saknas.length);
    // Jämförelsen med kundkortet följer fälten (raden försvinner när kontakten och numret stämmer)
    const jamfor = $('[data-ov-jamfor]', f); const a = affar(f.dataset.affar);
    if (jamfor && a && f.elements.kontakt && f.elements.telefon) {
      const j = overlamningJamfor(kund(a.kundId), f.elements.kontakt.value, f.elements.telefon.value); const html = j ? overlamningJamforHtml(j) : '';
      if (jamfor.dataset.html !== html) { const hadeFokus = jamfor.contains(document.activeElement); jamfor.innerHTML = html; jamfor.hidden = !j; jamfor.dataset.html = html; if (hadeFokus && f.elements.telefon) f.elements.telefon.focus(); }
    }
    return saknas[0] || null;
  }

  // Affärerna i uppladdningsarkets lista (byggs om när kunden väljs i arket – Dokument laddar upp utan förvald kund)
  const uppladdAffarer = (kundId, vald = '') => `<option value="">Ingen specifik</option>${(kundId ? affarerFor(kundId) : []).map((a) => `<option value="${e(a.id)}" ${vald === a.id ? 'selected' : ''}>${e(a.titel)}</option>`).join('')}`;
  function oppnaUppladdning(files, kundId, affarId, forvaldKategori = '') {
    const lista = [...files];
    if (!lista.length) return;
    const utanKund = !kundId || !kund(kundId);
    const af = utanKund ? [] : affarerFor(kundId);
    // Förval: den enda öppna affären, och en typ gissad från filnamnet (annars Övrigt) – eller typen som knappen gäller (PUB-avtal)
    const oppnaAf = af.filter(arOppen); const forvaldAffar = affarId || (oppnaAf.length === 1 ? oppnaAf[0].id : '');
    const namn = lista.map((f) => f.name).join(' ');
    const kategori = DOK_KAT[forvaldKategori] ? forvaldKategori : /offert/i.test(namn) ? 'offert' : /order/i.test(namn) ? 'order' : /pub|biträde|bitrade/i.test(namn) ? 'pub' : /avtal|kontrakt/i.test(namn) ? 'avtal' : 'ovrigt';
    const tasEmot = lista.filter((f) => !SKARP || filTasEmot(f)).length;
    const kundVal = utanKund ? `<label><span class="etikett">Kund<span class="krav">*</span></span><select class="falt" name="kundId" required data-uppl-kund data-fel="Välj vilken kund dokumentet hör till"><option value="">Välj kund …</option>${[...db.kunder].sort((x, y) => x.namn.localeCompare(y.namn, 'sv')).map((x) => `<option value="${e(x.id)}">${e(x.namn)}${x.typ === 'klubb' ? ' · klubb' : ''}</option>`).join('')}</select></label>` : '';
    oppnaArk(`${arkHuvud('Ladda upp dokument', `${plural(lista.length, 'fil', 'filer')} ${utanKund ? '– välj kund nedan' : `till ${kund(kundId).namn}`}`, 'uppladdning')}
      <form data-form="uppladdning" data-kund="${e(utanKund ? '' : kundId)}" class="ark-kropp">
        ${lista.map((f) => { const ok = !SKARP || filTasEmot(f); return `<div class="dokrad" style="padding:0;border:0"><span class="dokikon">${e(filAndelse(f.name))}</span><span class="lank-rad-text"><strong>${e(f.name)}</strong><small>${Math.max(1, Math.round(f.size / 1024))} kB</small></span>${ok ? '' : '<span class="chip chip-rod" title="Filtypen eller storleken tas inte emot">Tas inte emot</span>'}</div>`; }).join('')}
        ${kundVal}
        <div class="falt-rad"><label><span class="etikett">Typ av dokument</span><select class="falt" name="kategori">${[['offert', 'Offert'], ['order', 'Order'], ['pub', 'PUB-avtal'], ['avtal', 'Avtal'], ['ovrigt', 'Övrigt']].map(([v, t]) => `<option value="${v}" ${kategori === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label><span class="etikett">Hör till affär</span><select class="falt" name="affarId" data-uppl-affar>${uppladdAffarer(utanKund ? '' : kundId, forvaldAffar)}</select></label></div>
        <p class="falt-hint">${SKARP ? 'Filen sparas på servern och kan öppnas av alla inloggade. PDF, bilder, Word, Excel, PowerPoint, text och CSV – högst 25 MB.' : 'Prototyp: filen går att öppna under den här sessionen men sparas inte på någon server.'}</p>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark" ${tasEmot ? '' : 'disabled'}>${ik('uppladdning')}${tasEmot ? `Ladda upp ${plural(tasEmot, 'fil', 'filer')}` : 'Inget att ladda upp'}</button></div>`);
    vantandeFiler = lista;
  }
  let vantandeFiler = [];
  // Filtyper som servern tar emot (server/ARKITEKTUR.md 6.4)
  const FILTYPER = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
  const filTasEmot = (fil) => FILTYPER.includes(fil.type) && fil.size <= 25 * 1024 * 1024;


  /* 13-åtgärder -------------------------------------------------------------------- */
  function flyttaAffar(id, steg, opts = {}) {
    const a = affar(id); if (!a || a.steg === steg) return;
    if (a.steg === 'signerad') { toast('Affären är redan överlämnad till testteamet.'); return; }
    if (steg === 'signerad') { oppnaOverlamning(id); return; }
    const fran = SALJSTEG.find((s) => s.id === a.steg); const franId = a.steg; const franDatum = a.stegAndrad;
    // Ångra lägger tillbaka datumet då affären kom till steget – dagarna i steget, chansen och "står still" blir som förut
    a.steg = steg; a.stegAndrad = opts.angra && opts.datum ? opts.datum : idag(); if (a.forlorad) a.forlorad = null;
    const s = SALJSTEG.find((x) => x.id === steg);
    // Ångra tar bort händelsen om flytten (annars stod både "A → B" och "B → A" i tidslinjen). Skarpt läge: bara admin raderar,
    // då märks händelsen som ångrad i stället.
    let akt = null; const angrad = opts.angra && opts.akt ? db.aktiviteter.find((x) => x.id === opts.akt) : null;
    if (angrad) { if (!SKARP || arAdmin()) db.aktiviteter.splice(db.aktiviteter.indexOf(angrad), 1); else angrad.text = `${angrad.text.replace(/\.$/, '')} (ångrades).`; }
    else akt = logga(`${a.titel}: ${fran ? fran.namn : 'Förlorad'} → ${s.namn}.`, { kundId: a.kundId, affarId: a.id });
    if (!opts.franRect) senastFlyttad = a.id;
    const sparat = spara(); rendera();
    if (opts.franRect) flipFran(a.id, opts.franRect);
    if (opts.fokus) { const n = $(`.affarskort[data-affar="${sel(a.id)}"]`, vy); if (n) n.focus({ preventScroll: true }); }
    // Ångra går bara mellan vanliga säljsteg (inte från förlorad – orsaken skulle försvinna)
    const klar = () => toast(`${kundNamn(a.kundId)} flyttad till ${s.namn}`, null, UPEMO.salj[steg] || 'bock', fran && !opts.angra ? { atgard: { text: 'Ångra', fn: () => flyttaAffar(id, franId, { angra: true, datum: franDatum, akt: akt && akt.id }) } } : {});
    // Skarpt läge: bekräftelsen visas först när servern har sparat – vid krock visar lagret var affären hamnade
    if (!SKARP) klar(); else sparat.then((svar) => { if (svar && svar.ok) klar(); else { const n = $(`.affarskort[data-affar="${sel(id)}"]`, vy); if (n) n.setAttribute('data-glod', ''); } });
  }
  // Kopiera en länk – med reserv när urklippet inte går att nå (då visas länken i ett fält att markera)
  function kopiera(url, falt) {
    const klar = () => toast('Länken är kopierad');
    const reserv = () => {
      try { const f = falt || Object.assign(document.createElement('textarea'), { value: url }); if (!falt) { f.setAttribute('readonly', ''); f.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(f); } f.select(); const ok = document.execCommand('copy'); if (!falt) f.remove(); if (ok) { klar(); return; } } catch (err) { /* visa arket nedan */ }
      toast('Kunde inte kopiera – markera länken och kopiera själv', null, 'varning');
      oppnaArk(`${arkHuvud('Kopiera länken', 'Markera länken och kopiera den (Ctrl + C).', 'lank')}<div class="ark-kropp"><input class="falt" readonly value="${e(url)}" data-markera-allt aria-label="Länk"></div>`);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(klar, reserv); else reserv();
  }
  /* Testdagslistan (2026-10-24): närvarolista inför testdagen – på skärmen (arket, med närvarokryss som sparas på projektet,
     p.narvaro, och föreslår Antal genomförda) och som A4 (skrivUtPapper). Namn, paket och tillval från kundunderlaget, kontakt på
     plats, adress, lokal, bransch och särskilda behov och Övrigt – aldrig personnummer eller e-post. Hälsoflaggorna bara som ett
     aktivt val för testteamet när hälsoformuläret är på (känsliga personuppgifter, GDPR art. 9). Utan deltagarlista: tomma rader. */
  const tdlDeltagare = (p) => {
    const a = affar(p.affarId); const l = a && a.offert.underlag && db.kundlankar[a.offert.underlag];
    return { a, l, lista: l ? l.deltagare || [] : [] };
  };
  const tdlRad = (d) => { const r = prisaDeltagare(d.paket, d.tillval); return { paket: (PRISER.paket[d.paket] || {}).namn || '', tillval: (d.tillval || []).filter((t) => !r.ingar.has(t)).map((t) => PRISER.tillval[t].namn).join(', ') }; };
  const tdlFlaggor = (l, d) => {
    const x = halsoLage(l, db.halsoformular).per[d.id]; const v = x && x.f && x.f.status === 'besvarad' && x.f.svar;
    if (!v) return x && x.f ? 'Inte besvarat' : '';
    return [v.hjartlunga === 'ja' && 'Hjärta/lunga', v.hinder === 'ja-kontakt' && 'Hinder · får kontaktas', v.hinder === 'ja-ingen-kontakt' && 'Hinder · ej kontakt'].filter(Boolean).join(', ');
  };
  function testdagslistaPapper(p, { flaggor = false } = {}) {
    const k = kund(p.kundId); const u = p.underlag || {}; const { a, l, lista } = tdlDeltagare(p);
    const medFlaggor = flaggor && HALSA && anv(jag).roll === 'test' && !!l;
    const n = lista.length || parseInt(projBestallt(a), 10) || 0; const tt = testtidText(p);
    const rader = lista.length ? lista.map((d, i) => { const r = tdlRad(d); return `<tr><td>${i + 1}</td><td><strong>${e(d.namn || '–')}</strong></td><td>${e(r.paket)}</td><td>${e(r.tillval || '–')}</td>${medFlaggor ? `<td>${e(tdlFlaggor(l, d) || '–')}</td>` : ''}<td><span class="mp-ruta"${p.narvaro && p.narvaro[d.id] ? ' data-ok' : ''}>${p.narvaro && p.narvaro[d.id] ? ik('bock') : ''}</span></td></tr>`; })
      : Array.from({ length: Math.min(n || 10, 200) }, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td><td></td><td><span class="mp-ruta"></span></td></tr>`);
    const fakta = [['Lokal och utrustning', u.lokal], ['Bransch och särskilda behov', u.bransch], ['Övrigt till testteamet', u.ovrigt]].filter(([, v]) => String(v || '').trim());
    return tona(mallPapper({
      titel: 'Testdagslista', under: e(k ? k.namn : ''),
      meta: [['Testdag', e(p.testdatum ? `${stor(dagText(p.testdatum))}${tt ? ` · ${tt}` : ''}` : 'Inte bokad')], ['Adress', e(u.adress || '–')],
        ['Kontakt på plats', `${e(u.kontakt || '–')}${u.telefon ? `<small>${e(u.telefon)}</small>` : ''}`], ['Deltagare', e(n ? String(n) : '–')]],
      not: medFlaggor ? 'Innehåller hälsoflaggor – känsliga personuppgifter. Bara för testteamet.' : '',
      delar: [
        ...(fakta.length ? [['Inför testdagen', fakta.map(([t, v]) => `<p class="mp-fraga"><span>${e(t)}</span>${e(v)}</p>`).join('')]] : []),
        ['Deltagare och närvaro', `${lista.length ? '' : '<p class="mp-liten">Underlaget har ingen deltagarlista – fyll i namnen på plats.</p>'}<table class="mp-tabell mp-narvaro"><thead><tr><th>#</th><th>Namn</th><th>Paket</th><th>Tillval</th>${medFlaggor ? '<th>Hälsoflaggor</th>' : ''}<th>Närvaro</th></tr></thead><tbody>${rader.join('')}</tbody></table>`],
      ],
    }), 'mint');
  }
  function oppnaTestdagslista(id) {
    const p = projekt(id); if (!p) return;
    const k = kund(p.kundId); const u = p.underlag || {}; const { a, l, lista } = tdlDeltagare(p); const tt = testtidText(p);
    const kanBocka = ['bokning', 'test'].includes(p.steg);
    const narv = lista.filter((d) => p.narvaro && p.narvaro[d.id]).length;
    const n = lista.length || parseInt(projBestallt(a), 10) || 0;
    const fakta = [
      ['plats', 'Adress', u.adress ? `${e(u.adress)} <a class="pj-karta" href="${e(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.adress)}`)}" target="_blank" rel="noopener noreferrer" title="Öppnar adressen i Google Maps (en tjänst utanför CRM:et)">${ik('plats')}Karta</a>` : ''],
      ['anstallda', 'Kontakt på plats', u.kontakt ? `${e(u.kontakt)}${u.telefon ? ` · <a href="tel:${e(String(u.telefon).replace(/\s/g, ''))}">${e(u.telefon)}</a>` : ''}` : ''],
      ['mote', 'Lokal och utrustning', e(u.lokal || '')], ['info', 'Bransch och särskilda behov', e(u.bransch || '')], ['anteckning', 'Övrigt till testteamet', e(u.ovrigt || '')],
    ].filter(([, , v]) => v);
    oppnaArk(`${arkHuvud('Testdagslista', `${k ? k.namn : ''} · ${p.testdatum ? `${dagText(p.testdatum)}${tt ? `, ${tt}` : ''}` : 'testdagen är inte bokad än'}`, 'todo')}
      <div class="ark-kropp tdl">
        ${fakta.length ? `<dl class="tdl-fakta">${fakta.map(([ikon, t, v]) => `<div><dt>${ik(ikon)}${e(t)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        <div class="tdl-huvud"><strong>Deltagare</strong><span class="chip${narv ? ' chip-is' : ''}" data-tdl-rakna>${lista.length ? `${narv} av ${lista.length} närvarande` : `${plural(n, 'beställd', 'beställda')}`}</span></div>
        ${lista.length ? `<ul class="tdl-lista">${lista.map((d) => { const r = tdlRad(d); return `<li><label class="kryss"><input type="checkbox" data-narvaro="${e(p.id)}" value="${e(d.id)}"${p.narvaro && p.narvaro[d.id] ? ' checked' : ''}${kanBocka ? '' : ' disabled'}><span><strong>${e(d.namn || '–')}</strong><small>${e([r.paket, r.tillval].filter(Boolean).join(' · '))}</small></span></label></li>`; }).join('')}</ul>`
          : `<p class="falt-hint">Underlaget har ingen deltagarlista. Utskriften får ${plural(n || 10, 'tom rad', 'tomma rader')} att fylla i på plats.</p>`}
        ${lista.length && kanBocka ? '<p class="falt-hint">Bocka av den som kommer – antalet föreslås som Antal genomförda när du registrerar testet.</p>' : ''}
        ${HALSA && anv(jag).roll === 'test' && l ? '<label class="kryss tdl-flaggval"><input type="checkbox" data-tdl-flaggor><span>Ta med hälsoflaggorna i utskriften<small>Hälsouppgifter är känsliga personuppgifter – skriv bara ut dem om ni behöver dem på plats.</small></span></label>' : ''}
        <p class="falt-hint tdl-not">${ik('las')}Listan har aldrig personnummer eller e-post.</p>
      </div>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Stäng</button><button class="knapp knapp-accent" type="button" data-g="testdagslista-skriv" data-projekt="${e(p.id)}">${ik('skrivare')}Skriv ut</button></div>`);
  }
  /* Test genomfört (FORM.genomfort – efter en fråga när den bokade dagen ligger framåt): testdatumet blir idag om testet registreras
     före den bokade dagen, och tidslinjen säger båda datumen. Toasten har Ångra (steg, testdatum, antal och appen som förut) och,
     när projektet har egna uppgifter kvar (projektId, t.ex. "Packa utrustning"), "Markera klara". */
  function registreraTest(p, antal, app) {
    const NYCKLAR = ['steg', 'stegAndrad', 'testdatum', 'genomforda', 'apponboarding'];
    const fore = Object.fromEntries(NYCKLAR.map((n) => [n, p[n]]));
    const flyttat = !p.testdatum || dagarTill(p.testdatum) > 0;
    p.genomforda = antal; p.apponboarding = app; p.steg = 'avstamning'; p.stegAndrad = idag();
    if (flyttat) p.testdatum = idag();
    const akt = logga(`Test genomfört ${dagMan(idag())}${flyttat && fore.testdatum ? ` (bokat ${dagMan(fore.testdatum)})` : ''}: ${plural(antal, 'deltagare', 'deltagare')}${app ? ', alla onboardade i appen' : ''}.`, { kundId: p.kundId, affarId: p.affarId });
    spara(); rendera();
    const uppg = projTodos(p); let stangda = [];
    const angra = { text: 'Ångra', fn: () => {
      if (p.steg !== 'avstamning') { toast('Projektet har redan gått vidare – Ångra går inte längre', null, 'varning'); return; }
      NYCKLAR.forEach((n) => { if (fore[n] === undefined) delete p[n]; else p[n] = fore[n]; });
      stangda.forEach((t) => { t.klar = false; t.klarTid = null; }); stangda = [];
      const x = db.aktiviteter.find((y) => y.id === akt.id);
      if (x) { if (!SKARP || arAdmin()) db.aktiviteter.splice(db.aktiviteter.indexOf(x), 1); else x.text = `${x.text.replace(/\.$/, '')} (ångrades).`; }
      spara(); rendera(); toast('Registreringen är ångrad – projektet står i Genomför test igen', null, UPEMO.proj.test);
    } };
    const klara = uppg.length ? { text: uppg.length === 1 ? 'Markera uppgiften klar' : `Markera ${uppg.length} uppgifter klara`, fn: () => {
      stangda = projTodos(p); const nu = new Date().toISOString(); stangda.forEach((t) => { t.klar = true; t.klarTid = nu; });
      spara(); rendera();
      toast(stangda.length === 1 ? `Klar: ${stangda[0].text}` : `${stangda.length} uppgifter för testdagen är klara`, null, 'bock', { atgard: { text: 'Ångra', fn: () => { stangda.forEach((t) => { t.klar = false; t.klarTid = null; }); stangda = []; spara(); rendera(); toast('Uppgifterna är tillbaka på listan'); } } });
    } } : null;
    toast(`Testet är registrerat${flyttat && fore.testdatum ? ` (bokat ${dagMan(fore.testdatum)})` : ''} – dags för avstämning${uppg.length ? `. ${uppg.length === 1 ? `Uppgiften ”${uppg[0].text}” är kvar` : `${uppg.length} uppgifter för testdagen är kvar`}` : ''}`, null, UPEMO.proj.test, { atgard: [angra, klara].filter(Boolean) });
  }

  // Egen bekräftelse i stället för webbläsarens confirm(): ikon, konsekvens och en knapp som utför åtgärden
  function bekrafta({ titel, text, sym = 'varning', knapp, g, data = {}, fara = false, extra = '' }) {
    oppnaArk(`${arkHuvud(titel, '', sym)}<div class="ark-kropp"><p class="bekrafta-text">${e(text)}</p>${extra}</div>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp ${fara ? 'knapp-fara-solid' : 'knapp-accent'}" type="button" data-g="${e(g)}" ${Object.entries(data).map(([k, v]) => `data-${k}="${e(v)}"`).join(' ')}>${e(knapp)}</button></div>`);
  }

  let ev_tangent = false;
  const G = {
    'starta-mote': (el) => { const kundId = el.dataset.kund || null; startaMote({ kundId, affarId: moteAffarFor(kundId, el.dataset.affar || null), start: el.dataset.start || null }); },
    // Kalkylen öppnas i samma urval av bilder som startknappen visar (kalkylen läggs till om den är bortvald)
    'starta-mote-kalkyl': (el) => { const f = el.closest('form'); const valda = new FormData(f).getAll('bild'); startaMote({ kundId: f.kundId.value || null, affarId: moteAffarFor(f.kundId.value, f.affarId.value || null), bilder: window.UPMote ? UPMote.BILDER.map((b) => b.id).filter((id) => id === 'kalkyl' || valda.includes(id)) : undefined, start: 'kalkyl' }, '.mk-docka [data-g="starta-mote-kalkyl"]'); },
    // ▶ på en miniatyr: de valda bilderna (även inga) plus den här – med inget valt visas bara bilden, som kalkylknappen gör
    'starta-mote-bild': (el) => { const f = $('form[data-form="starta-mote"]', vy); const valda = f ? new FormData(f).getAll('bild') : null; if (valda && !valda.includes(el.dataset.bild)) valda.push(el.dataset.bild); startaMote({ kundId: f ? f.kundId.value || null : null, affarId: f ? moteAffarFor(f.kundId.value, f.affarId.value || null) : null, bilder: valda && window.UPMote ? UPMote.BILDER.map((b) => b.id).filter((id) => valda.includes(id)) : undefined, start: el.dataset.bild }, `.mk-bild-start[data-bild="${sel(el.dataset.bild)}"]`); },
    bildval: (el) => { const f = el.closest('form'); $$('[name="bild"]', f).forEach((x) => { x.checked = el.dataset.alla === '1'; }); raknaBildval(f); },
    'mote-vem': (el) => valjMoteKund(el.dataset.kund || '', el.dataset.affar || ''),
    'stang-ark': () => { sparaUtkast(); ark.close(); },
    // Dubblettstoppet i snabbregistreringen: "Skapa ändå" skickar formuläret en gång till förbi kontrollen
    'snabb-kund-anda': (el) => { const f = el.closest('form'); if (!f || !f.elements.anda) return; f.elements.anda.value = '1'; f.requestSubmit(); },
    'skicka-ark': () => { const f = $('form', ark); if (f) f.requestSubmit(); },
    'rensa-utkast': (el) => { const f = el.closest('form'); if (!f) return; utkast.delete(utkastNyckel(f)); const g = f.dataset.form; ark.close(); if (g === 'snabb-anteckning') oppnaSnabb('anteckning'); else if (g === 'snabb-todo') oppnaSnabb('todo'); else if (g === 'snabb-kund') oppnaSnabb('kund'); else if (g === 'ny-affar') oppnaNyAffar(); },
    'skapa-ny': () => oppnaSkapaNy(),
    snabb: (el, ev) => oppnaSnabb(el.dataset.flik || 'anteckning', { kundId: el.dataset.kund || '', via: el.dataset.via || '', typ: el.dataset.typ || '', text: el.dataset.text || '', mus: !!(ev && ev.detail) }),
    snabbdatum: (el) => {
      const f = el.closest('form'); const d = omDagar(parseInt(el.dataset.dagar, 10));
      const falt = $('[name="datum"]', f); if (falt) falt.value = d;
      $$('[data-g="snabbdatum"]', f).forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      const rad = el.closest('.snabbval-rad'); if (rad) { rad.removeAttribute('data-vilande'); const t = $('[data-snabbval-datum]', rad); if (t) t.textContent = dagText(d); }
      const folj = $('[name="folj"]', f); if (folj) folj.checked = true;
    },
    'ny-affar': (el) => oppnaNyAffar(el.dataset.kund || '', el.dataset.steg || ''),
    'andra-affar': (el) => {
      const a = affar(el.dataset.affar); if (!a) return;
      if (lastOffert(a)) { toast(a.steg === 'signerad' ? 'En signerad affär byter inte namn' : 'Återöppna affären först', null, 'las'); return; }
      oppnaArk(`${arkHuvud('Döp om affären', kundNamn(a.kundId), UPEMO.salj[a.steg] || 'redigera')}
        <form data-form="andra-affar" data-affar="${e(a.id)}" class="ark-kropp" novalidate>
          <label><span class="etikett">Affärens namn<span class="krav">*</span></span><input class="falt" name="titel" value="${e(a.titel)}" required maxlength="200" autocomplete="off" enterkeyhint="done" data-fel="Skriv ett namn på affären"></label>
          <p class="falt-hint">Namnet syns på säljtavlan, i Dokument och i nya offerter och ordrar. Dokument som redan har skickats behåller sitt namn.</p></form>
        <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara</button></div>`);
    },
    'ny-todo': (el) => oppnaSnabb('todo', { kundId: el.dataset.kund || '', text: el.dataset.text || '' }),
    'ny-kontakt': (el) => oppnaKontakt(el.dataset.kund),
    'andra-kontakt': (el) => oppnaKontakt(el.dataset.kund, el.dataset.id),
    // Överlämningen: ta kundkortets kontaktperson och/eller telefon i stället för underlagets
    'overlamning-kundkort': (el) => {
      const f = el.closest('form[data-form="overlamning"]'); if (!f) return;
      [['kontakt', el.dataset.kontakt], ['telefon', el.dataset.tel]].forEach(([n, v]) => { const x = f.elements[n]; if (x && v) { x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); } });
      const tel = f.elements.telefon; if (tel) tel.focus();
    },
    // Krock i arket (visaKrockar): behåll det man själv skrev eller ta kollegans värde – fältet jämförs sedan mot kollegans värde
    'krock-val': (el) => {
      const box = el.closest('[data-krock]'); const f = box && box.closest('form[data-fore]'); if (!f) return;
      const x = box.dataset.krock; const falt = f.elements[x]; const fore = foreVarden(f);
      fore[x] = box.dataset.deras; f.dataset.fore = JSON.stringify(fore);
      if (falt && el.dataset.val === 'deras') { falt.value = box.dataset.deras; falt.dispatchEvent(new Event('input', { bubbles: true })); }
      if (falt) { falt.removeAttribute('data-krock-falt'); if (falt.getAttribute('aria-describedby') === box.id) falt.removeAttribute('aria-describedby'); }
      box.remove();
      const nasta = $('[data-krock] button', f);
      (nasta || $('.ark-fot [data-g="skicka-ark"]', ark) || falt).focus();
    },
    'radera-kontakt': (el) => {
      const k = kund(el.dataset.kund); const c = k && (k.kontakter || []).find((x) => x.id === el.dataset.id); if (!c) return;
      const forst = k.kontakter[0] === c && k.kontakter.length > 1;
      bekrafta({ titel: `Ta bort ${c.namn}?`, sym: 'papperskorg', text: `${c.namn} tas bort som kontaktperson på ${k.namn}.${forst ? ` ${k.kontakter[1].namn} blir huvudkontakt.` : ''} Offerter och kundlänkar som redan är skickade påverkas inte.`, knapp: 'Ta bort kontakten', g: 'radera-kontakt-ok', data: { kund: k.id, id: c.id }, fara: true });
    },
    'radera-kontakt-ok': (el) => {
      const k = kund(el.dataset.kund); const i = k ? (k.kontakter || []).findIndex((x) => x.id === el.dataset.id) : -1;
      if (i < 0) { ark.close(); return; }
      const [c] = k.kontakter.splice(i, 1);
      logga(`Kontaktpersonen ${c.namn} togs bort.`, { kundId: k.id });
      const sparat = spara(); ark.close(); rendera();
      const klar = () => toast(`${c.namn} är borttagen`, null, UPEMO.sak.kontakt);
      // Skarpt läge: bekräftelsen först när servern har sparat – vid krock säger lagret det (med Gör om min ändring)
      if (!SKARP) klar(); else sparat.then((svar) => { if (svar && svar.ok) klar(); });
    },
    // Aktiviteter i tidslinjen: ändra (författaren eller admin) och ta bort (med bekräftelse)
    'andra-akt': (el) => {
      const x = db.aktiviteter.find((y) => y.id === el.dataset.id); if (!kanAndraAkt(x)) return;
      oppnaArk(`${arkHuvud('Ändra aktivitet', kundNamn(x.kundId), UPEMO.akt[x.typ])}
        <form data-form="andra-akt" data-id="${e(x.id)}" class="ark-kropp">
          <div class="snabb-falt"><span class="etikett" id="andra-akt-typ">Typ av aktivitet</span><div class="typval typval-fyra" role="radiogroup" aria-labelledby="andra-akt-typ">${AKT_EGNA.map((t) => `<label><input type="radio" name="typ" value="${e(t)}" ${x.typ === t ? 'checked' : ''}><span>${emo(UPEMO.akt[t])}${AKT_TYP[t]}</span></label>`).join('')}</div></div>
          <label><span class="etikett">Vad hände?<span class="krav">*</span></span><textarea class="falt" name="text" rows="5" required data-fel="Skriv vad som hände" autofocus>${e(x.text)}</textarea></label>
          <p class="falt-hint">Skrevs av ${e(anv(x.av).namn)} ${e(relTid(x.tid))}. Tiden och författaren står kvar – tidslinjen visar att den är ändrad.</p></form>
        <div class="ark-fot">${kanRaderaAkt(x) ? `<button class="knapp knapp-fara knapp-liten ark-fot-vanster" type="button" data-g="radera-akt" data-id="${e(x.id)}">${ik('papperskorg')}Ta bort</button>` : ''}<button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara</button></div>`);
    },
    'radera-akt': (el) => {
      const x = db.aktiviteter.find((y) => y.id === el.dataset.id); if (!kanRaderaAkt(x)) return;
      const kort = x.text.length > 80 ? `${x.text.slice(0, 80)}…` : x.text;
      bekrafta({ titel: `Ta bort ${(AKT_TYP[x.typ] || 'aktiviteten').toLowerCase()}?`, sym: 'papperskorg', text: `”${kort}” tas bort från tidslinjen för ${kundNamn(x.kundId)}. Det går inte att ångra.`, knapp: 'Ta bort', g: 'radera-akt-ok', data: { id: x.id }, fara: true });
    },
    'radera-akt-ok': (el) => {
      const i = db.aktiviteter.findIndex((y) => y.id === el.dataset.id); if (i < 0 || !kanRaderaAkt(db.aktiviteter[i])) { ark.close(); return; }
      const [x] = db.aktiviteter.splice(i, 1);
      spara(); ark.close(); rendera(); toast(`${AKT_TYP[x.typ] || 'Aktiviteten'} är borttagen`, null, UPEMO.akt[x.typ] || 'bock');
    },
    // Ta bort en kund: bara när inget annat bygger på den (affärer, projekt, offerter, kundlänkar, introducerade partners).
    // Aktiviteter, att göra och dokument på kunden tas bort i samma handling. Skarpt läge: bara administratörer (serverns regel).
    'radera-kund': (el) => {
      const k = kund(el.dataset.kund); if (!k || !kanRaderaKund()) return;
      const b = kundBeroenden(k);
      if (b.hinder.length) {
        oppnaArk(`${arkHuvud(`${k.namn} kan inte tas bort`, '', 'las')}<div class="ark-kropp"><p class="bekrafta-text">${e(b.hinder.join(', '))} hör till ${k.typ === 'klubb' ? 'klubben' : 'kunden'}. ${affarerFor(k.id).length ? 'Historiken ska finnas kvar – affärer stoppar borttagningen. Markera öppna affärer som förlorade i stället, eller som felregistrerade om kunden är en dubblett (då följer de med).' : db.kunder.some((x) => x.viaKlubb === k.id) ? 'Koppla bort partnerna först (Klubbkoppling på varje partners kundsida) eller låt klubben stå kvar.' : 'Historiken ska finnas kvar.'}</p></div>
          <div class="ark-fot"><button class="knapp knapp-accent" type="button" data-g="stang-ark" autofocus>Jag förstår</button></div>`);
        return;
      }
      bekrafta({ titel: `Ta bort ${k.namn}?`, sym: 'papperskorg', text: `${k.typ === 'klubb' ? 'Klubben' : 'Kunden'} tas bort ur registret${b.foljer.length ? ` tillsammans med ${b.foljer.join(', ')}` : ''}. Det går inte att ångra.`, knapp: `Ta bort ${k.typ === 'klubb' ? 'klubben' : 'kunden'}`, g: 'radera-kund-ok', data: { kund: k.id }, fara: true });
    },
    'radera-kund-ok': (el) => {
      const k = kund(el.dataset.kund); if (!k || !kanRaderaKund() || kundBeroenden(k).hinder.length) { ark.close(); return; }
      const ta = (lista, villkor) => { for (let i = lista.length - 1; i >= 0; i--) if (villkor(lista[i])) lista.splice(i, 1); };
      ta(db.aktiviteter, (x) => x.kundId === k.id); ta(db.todos, (t) => t.kundId === k.id); ta(db.dokument, (d) => d.kundId === k.id); ta(db.affarer, (a) => a.kundId === k.id && felregistrerad(a));
      ta(db.kunder, (x) => x.id === k.id);
      spara(); ark.close(); location.hash = '#/kunder'; toast(`${k.namn} är borttagen ur registret`, null, UPEMO.kundtyp[k.typ === 'klubb' ? 'klubb' : 'foretag']);
    },
    // Säljaren får inte ta bort kunder (skarpt läge): en uppgift till admin, "Ta bort dubblett X" – en gång per kund
    'be-admin-radera': (el) => {
      const k = kund(el.dataset.kund); if (!k) return;
      const admin = db.anvandare.find((u) => (u.admin || u.roll === 'admin') && arAktiv(u));
      if (!admin) { toast('Det finns inget aktivt adminkonto att fråga', null, 'varning'); return; }
      const finns = db.todos.find((t) => !t.klar && t.kundId === k.id && t.ansvarig === admin.id && /^Ta bort dubblett/.test(t.text || ''));
      if (finns) { toast(`${admin.kort || admin.namn} har redan fått uppgiften att ta bort ${k.namn}`, null, 'info'); return; }
      bekrafta({ titel: `Be admin ta bort ${k.namn}?`, sym: 'papperskorg', knapp: 'Skicka till admin', g: 'be-admin-radera-ok', data: { kund: k.id },
        text: `Bara admin tar bort ${k.typ === 'klubb' ? 'klubbar' : 'kunder'}. ${admin.namn} får uppgiften ”Ta bort dubblett ${k.namn}” i Att göra.${affarerFor(k.id).some((a) => !felregistrerad(a)) ? ' Markera kundens affärer som felregistrerade först – annars stoppar de borttagningen.' : ''}` });
    },
    'be-admin-radera-ok': (el) => {
      const k = kund(el.dataset.kund); const admin = db.anvandare.find((u) => (u.admin || u.roll === 'admin') && arAktiv(u)); ark.close(); if (!k || !admin) return;
      db.todos.push({ id: nyId('t'), text: `Ta bort dubblett ${k.namn}`, kundId: k.id, ansvarig: admin.id, datum: idag(), klar: false });
      logga(`${anv(jag).namn} bad admin ta bort ${k.typ === 'klubb' ? 'klubben' : 'kunden'} (dubblett).`, { kundId: k.id });
      spara(); rendera(); toast(`${admin.kort || admin.namn} har fått uppgiften att ta bort ${k.namn}`, null, 'todo');
    },
    'andra-kund': (el) => oppnaKunduppgifter(el.dataset.kund),
    'koppla-klubb': (el) => { const k = kund(el.dataset.id); oppnaArk(`${arkHuvud('Koppla till klubb', 'Vilken klubb öppnade dörren till ' + k.namn + '?', UPEMO.sak.klubb)}
      <form data-form="koppla-klubb" data-kund="${e(k.id)}" class="ark-kropp"><label><span class="etikett">Introducerad via</span><select class="falt" name="viaKlubb">${klubbAlternativ(k.viaKlubb || '')}</select></label>
      <p class="falt-hint">Vunna affärer med kunden ger klubben ${Math.round(KLUBBMOTORN.provision * 100)} % av affärsvärdet enligt Klubbmotorn.</p></form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">Spara</button></div>`); },
    'todo-klar': (el) => {
      if (el.hasAttribute && el.hasAttribute('data-pang')) return; // redan på väg att bockas av
      const t = db.todos.find((x) => x.id === el.dataset.id); if (!t) return;
      const fore = raknareNu.todo;
      t.klar = !t.klar; t.klarTid = t.klar ? new Date().toISOString() : null;
      spara();
      const angra = t.klar ? { atgard: { text: 'Ångra', fn: () => { t.klar = false; t.klarTid = null; spara(); rendera(); toast('Uppgiften är tillbaka på listan'); } } } : {};
      // Sista uppgiften för idag: konfetti över ringen
      const dagenKlar = t.klar && t.ansvarig === jag && fore > 0 && raknareNu.todo === 0;
      const efter = () => { rendera(); toast(dagenKlar ? 'Dagens lista är klar – snyggt jobbat!' : t.klar ? 'Klar – bra jobbat!' : 'Uppgiften är tillbaka på listan', null, dagenKlar ? UPEMO.sak.tomt : 'bock', angra); if (dagenKlar) { const ring = $('.framsteg', vy); if (ring) { const r = ring.getBoundingClientRect(); konfetti(r.left + 30, r.top + 30, 40); } } };
      if (t.klar && !lugn) {
        const rad = el.closest('.todo'); if (rad) rad.setAttribute('data-klar', '');
        el.setAttribute('data-pang', '');
        setTimeout(efter, 560);
      } else efter();
    },
    'todo-skjut': (el) => { const t = db.todos.find((x) => x.id === el.dataset.id); if (!t) return; const fore = t.datum; t.datum = omDagar(1); spara(); rendera(); toast(`Flyttad till imorgon: ${t.text}`, null, UPEMO.grupp.kommande, { atgard: { text: 'Ångra', fn: () => { t.datum = fore; spara(); rendera(); } } }); },
    'fokus-ny-todo': () => { const f = $('#todo-ny'); if (f) { f.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); f.focus({ preventScroll: true }); } },
    // Kundsidans tidslinje: visa alla händelser (kolumnerna balanseras om utan att korta tidslinjen – gäller kunden tills sidan laddas om)
    'tl-val': (el) => { tlVal.set(el.dataset.affar, el.dataset.typ); rendera(); },
    'kd-fler': (el) => { if (kdAllaVisas.has(el.dataset.kund)) kdAllaVisas.delete(el.dataset.kund); else kdAllaVisas.add(el.dataset.kund); balanseraKund(); },
    'fokus-anteckning': (el) => { const f = $(`#ant-${sel(el.dataset.kund)}`); if (f) { f.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); f.focus({ preventScroll: true }); } },
    'todo-forslag': (el) => {
      const f = tdForslag().find((x) => x.nyckel === el.dataset.nyckel); if (!f) { rendera(); return; }
      db.todos.push({ id: nyId('t'), text: f.uppgift, kundId: f.kundId, ...(f.affarId ? { affarId: f.affarId } : {}), ansvarig: jag, datum: idag(), klar: false, forslag: f.nyckel });
      spara(); rendera(); toast('Tillagd – idag', null, todoTyp(f.uppgift)[1]);
    },
    'todo-forslag-dolj': (el) => { forslagDolda.add(el.dataset.nyckel); rendera(); },
    'todo-forslag-alla': () => { todoUi.allaForslag = !todoUi.allaForslag; rendera(); },
    'todo-vem': (el) => { todoUi.vem = el.dataset.vem; rendera(); },
    'todo-klara': () => { todoUi.klara = !todoUi.klara; rendera(); },
    // Veckoremsan: välj en dag (listan visar bara den dagen, snabbraden föreslår datumet) – samma dag igen eller "Visa hela listan" nollställer
    'todo-dag': (el, ev) => {
      const fore = todoUi.dag; const d = el.dataset.dag || null; todoUi.dag = d && fore !== d ? d : null;
      const friDag = !!todoUi.dag && el.hasAttribute('data-fri');
      rendera();
      // En fri dag vald med musen: rakt till snabbraden (datumet är redan satt). Tangentbord och pekskärm stannar i veckan.
      const falt = friDag && ev && ev.detail > 0 && matchMedia('(hover: hover)').matches && $('#todo-ny', vy);
      if (falt) { falt.focus({ preventScroll: true }); falt.setSelectionRange(falt.value.length, falt.value.length); const r = falt.getBoundingClientRect(); if (r.bottom > innerHeight - 24) falt.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); return; }
      const knapp = el.closest('.td-vecka') && $(`.td-vecka [data-dag="${sel(todoUi.dag || fore)}"]`, vy);
      if (knapp) knapp.focus({ preventScroll: true });
      const lista = todoUi.dag && $('[data-td-lista]', vy);
      if (lista) { const r = lista.getBoundingClientRect(); if (r.top > innerHeight * .72) scrollTo({ top: scrollY + r.top - toppHojd() - 24, behavior: lugn ? 'auto' : 'smooth' }); }
    },
    'kund-typ': (el) => kundFiltrera(el.dataset.typ),
    'rensa-kundsok': () => { kundUi.sok = ''; const f = $('[data-kund-sok]', vy); if (f) f.value = ''; kundUppdatera(true); if (f) f.focus(); },
    'salj-vem': (el) => { saljUi.vem = el.dataset.vem; uppdateraSalj(); },
    'salj-vy': (el) => { saljUi.vy = el.dataset.vy; uppdateraSalj(); },
    'salj-filter': (el) => { const f = el.dataset.filter; saljUi.filter = saljUi.filter.includes(f) ? saljUi.filter.filter((x) => x !== f) : [...saljUi.filter, f]; if (el.dataset && el.dataset.vem && saljUi.filter.includes(f)) saljUi.vem = el.dataset.vem; uppdateraSalj(); if (saljUi.filter.includes(f) && el.closest && el.closest('.sidhjalte')) tillTavlan(); },
    'rensa-filter': () => { saljUi.sok = ''; saljUi.filter = []; saljUi.vem = 'alla'; const s = $('[data-salj-sok]', vy); if (s) s.value = ''; uppdateraSalj(); },
    // säljtavlans tom-ruta: ta bort bara sökningen (filtren står kvar)
    'salj-sok-rensa': () => { saljUi.sok = ''; const s = $('[data-salj-sok]', vy); if (s) s.value = ''; uppdateraSalj(); },
    'filter-kall': () => { saljUi.filter = ['kall']; saljUi.vy = 'tavla'; uppdateraSalj(); tillTavlan(); },
    'forslag-alla': (el) => { const p = el.closest('[data-saljpuls]'); const alla = !p.hasAttribute('data-alla-forslag'); p.toggleAttribute('data-alla-forslag', alla); el.textContent = alla ? 'Visa färre' : `Visa alla (${$$('.forslag', p).length})`; },
    'larm-alla': () => { ovUi.allaLarm = !ovUi.allaLarm; rendera(); const b = $('[data-g="larm-alla"]', vy); if (b) b.focus({ preventScroll: true }); },
    'ob-hopp': (el) => obHopp(el.dataset.mal),
    'ob-het': () => { ovUi.hetAlla = !ovUi.hetAlla; rendera(); const b = $('[data-g="ob-het"]', vy); if (b) b.focus({ preventScroll: true }); },
    sortera: (el) => { const k = el.dataset.kol; if (saljUi.sortKol === k) saljUi.sortRikt *= -1; else { saljUi.sortKol = k; saljUi.sortRikt = ['kund', 'nasta', 'ansvarig', 'steg'].includes(k) ? 1 : -1; } uppdateraSaljYta(); const n = $(`[data-g="sortera"][data-kol="${sel(k)}"]`, vy); if (n) n.focus({ preventScroll: true }); },
    'till-kolumn': (el, ev) => {
      if (saljUi.vy !== 'tavla') { saljUi.vy = 'tavla'; uppdateraSalj(); }
      const tavla = $('[data-tavla]', vy); const kol = tavla && $(`.kolumn[data-steg="${sel(el.dataset.steg)}"]`, tavla);
      // filtret ger inga träffar (tom-rutan står i tavlans ställe): visa den i stället för att inte göra något
      if (!kol) { const tomRuta = $('.salj-tom', vy); if (tomRuta) { tillTavlan(); tomRuta.removeAttribute('data-blixt'); void tomRuta.offsetWidth; tomRuta.setAttribute('data-blixt', ''); } return; }
      const tr = tavla.getBoundingClientRect(); const kr_ = kol.getBoundingClientRect();
      tavla.scrollTo({ left: tavla.scrollLeft + kr_.left - tr.left - Math.max(0, (tr.width - kr_.width) / 2), behavior: lugn ? 'auto' : 'smooth' });
      if (tr.top < 0 || tr.top > innerHeight * 0.6) $('[data-stegband]', vy).scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' });
      kol.removeAttribute('data-blixt'); void kol.offsetWidth; kol.setAttribute('data-blixt', '');
      const forsta = $('.affarskort', kol); // Valt med tangentbordet (Enter/mellanslag ger ett klick med detail 0): fokus till kolumnens första kort
      if (forsta && el.matches('.tratt-rad, .ss-steg, .stegband button') && (ev_tangent || (ev && ev.detail === 0))) forsta.focus({ preventScroll: true });
    },
    'till-projkolumn': (el) => {
      const tavla = $('[data-projtavla]', vy); const kol = tavla && $(`.kolumn[data-projsteg="${sel(el.dataset.steg)}"]`, tavla); if (!kol) return;
      const tr = tavla.getBoundingClientRect(); const kr_ = kol.getBoundingClientRect();
      tavla.scrollTo({ left: tavla.scrollLeft + kr_.left - tr.left - Math.max(0, (tr.width - kr_.width) / 2), behavior: lugn ? 'auto' : 'smooth' });
      $$('.stegband-projekt button', vy).forEach((b) => b.toggleAttribute('data-synlig', b === el));
      kol.removeAttribute('data-blixt'); void kol.offsetWidth; kol.setAttribute('data-blixt', '');
    },
    'till-checklista': () => { const c = $('[data-checklista]', vy); if (c) { c.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'center' }); const f = $('input[data-check]:not(:checked):not(:disabled)', c); if (f) f.focus({ preventScroll: true }); } },
    'nasta-steg': (el) => {
      const a = affar(el.dataset.affar); const nasta = SALJSTEG[saljStegIndex(a.steg) + 1]; if (!nasta) return;
      const kort = el.closest('.affarskort'); const rect = kort ? kort.getBoundingClientRect() : null;
      if (nasta.id === 'signerad') { oppnaOverlamning(a.id); return; }
      // fokus följer med kortet (som Shift + →) – tangentbordet tappar inte sin plats på tavlan
      flyttaAffar(a.id, nasta.id, { franRect: rect, fokus: true });
    },
    'skapa-uppfoljning': (el) => {
      const a = affar(el.dataset.affar);
      db.todos.push({ id: nyId('t'), text: 'Följ upp offerten', kundId: a.kundId, ansvarig: a.ansvarig, datum: idag(), klar: false });
      spara(); rendera(); toast(`Att göra skapad för ${anv(a.ansvarig).kort}`, { href: '#/att-gora', text: 'Visa' });
    },
    'visa-forlorade': () => { saljUi.forlorade = !saljUi.forlorade; uppdateraSaljYta(); },
    'visa-klara': () => { projUi.visaKlara = !projUi.visaKlara; rendera(); },
    'flytta-meny': (el) => {
      const a = affar(el.dataset.affar); const k = kund(a.kundId);
      oppnaArk(`${arkHuvud('Flytta affär', `${k.namn} – ${a.titel}`, UPEMO.salj[a.steg] || 'flytta')}<div class="ark-kropp flyttlista">
        ${SALJSTEG.map((s, i) => `<button class="flyttval ${a.steg === s.id ? 'flyttval-nu' : ''}" type="button" data-g="flytta-till" data-affar="${e(a.id)}" data-steg="${e(s.id)}" ${a.steg === s.id ? 'aria-current="step"' : ''} ${i === Math.min(saljStegIndex(a.steg) + 1, SALJSTEG.length - 1) ? 'autofocus' : ''}>${emo(UPEMO.salj[s.id], { ruta: 'm' })}<span><strong>${e(s.namn)}${s.id !== 'signerad' ? ` · ${Math.round((SANNOLIKHET[s.id] || 0) * 100)} %` : ''}</strong><small>${e(s.hint || '')}</small></span>${a.steg === s.id ? '<span class="chip chip-ok">Nu</span>' : ik('pil')}</button>`).join('')}
        <button class="flyttval flyttval-fara" type="button" data-g="forlora" data-affar="${e(a.id)}"><span class="emo emo-ruta emo-m" data-ton="rod" aria-hidden="true">${ik('stang')}</span><span><strong>Markera som förlorad</strong><small>Orsaken sparas på kunden</small></span>${ik('pil')}</button></div>`);
    },
    'flytta-till': (el) => { const a = affar(el.dataset.affar); if (ark.open && el.dataset.steg !== 'signerad') ark.close(); if (el.dataset.steg === 'signerad' && a.steg !== 'signerad') { oppnaOverlamning(a.id); return; } const kort = $(`.affarskort[data-affar="${sel(a.id)}"]`, vy); flyttaAffar(el.dataset.affar, el.dataset.steg, { franRect: kort ? kort.getBoundingClientRect() : null }); },
    forlora: (el) => { const a = affar(el.dataset.affar); oppnaArk(`${arkHuvud('Markera som förlorad', a.titel, 'stang')}
      <form data-form="forlora" data-affar="${e(a.id)}" class="ark-kropp"><label><span class="etikett">Varför blev det inte affär?<span class="krav">*</span></span><textarea class="falt" name="orsak" rows="3" data-fel="Skriv kort varför – det hjälper nästa säljare" placeholder="Pris, timing, valde annan leverantör…"></textarea></label>
      <p class="falt-hint">Orsaken sparas på kunden så att nästa person vet historiken – för en felregistrerad affär räcker kryssrutan.</p>
      <label class="kryss"><input type="checkbox" name="felregistrerad"><span>Felregistrerad / dubblett – räknas inte i statistiken<small>Affären blev aldrig en riktig affär (t.ex. skapad två gånger). Den ligger kvar på kunden men räknas inte som förlorad i vinstgraden.</small></span></label></form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-fara" type="button" data-g="skicka-ark">Markera som förlorad</button></div>`); },
    ateroppna: (el) => { const a = affar(el.dataset.affar); a.steg = 'besok'; a.forlorad = null; a.stegAndrad = idag(); logga(`${a.titel} återöppnades.`, { kundId: a.kundId, affarId: a.id }); spara(); rendera(); toast('Affären är återöppnad – den ligger i Kundbesök', { href: `#/affar/${a.id}`, text: 'Öppna' }); },
    overlamna: (el) => oppnaOverlamning(el.dataset.affar),
    komplettera: (el) => { const p = projekt(el.dataset.projekt); oppnaOverlamning(p.affarId, p.id); },
    'godkann-underlag': (el) => {
      const p = projekt(el.dataset.projekt); p.underlagStatus = 'komplett'; p.steg = 'bokning'; p.stegAndrad = idag();
      stangTodos(p.kundId, /^Granska underlag/);
      logga('Testteamet godkände underlaget. Nästa steg: boka tid med kunden.', { kundId: p.kundId, affarId: p.affarId });
      spara(); rendera(); toast('Underlaget godkänt – dags att boka tid', null, UPEMO.proj.bokning);
    },
    returnera: (el) => { const p = projekt(el.dataset.projekt); const uk = underlagKomplett(p.underlag); oppnaArk(`${arkHuvud('Returnera till sälj', 'Säljaren får en att göra med din kommentar.', 'retur')}
      <form data-form="returnera" data-projekt="${e(p.id)}" class="ark-kropp"><label><span class="etikett">Vad saknas eller är oklart?<span class="krav">*</span></span><textarea class="falt" name="kommentar" rows="4" required data-fel="Skriv vad som saknas eller är oklart">${uk.komplett ? '' : 'Saknas: ' + e(uk.saknas.join(', ')) + '.'}</textarea></label></form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-fara" type="button" data-g="skicka-ark">${ik('retur')}Returnera</button></div>`); },
    // Testdagen som kalenderfil (iCalendar): öppnas i Outlook, Google eller Apple-kalendern. Heldag utan klockslag – med start- och
    // sluttid (p.testtid) en händelse i svensk tid (TZID=Europe/Stockholm med VTIMEZONE, sommartiden följer med). Affärskontakten,
    // adressen, lokalen, bransch och särskilda behov och Övrigt till testteamet – inga deltagaruppgifter. Tecken som , ; \ och
    // radbrytningar skrivs om enligt RFC 5545 och långa rader viks vid 60 tecken (å, ä och ö är två byte – gränsen är 75 byte).
    'testdag-ics': (el) => {
      const p = projekt(el.dataset.projekt); if (!p || !p.testdatum) return;
      const k = kund(p.kundId); const a = affar(p.affarId); const u = p.underlag || {}; const t = p.testtid || {};
      const esc = (x) => String(x || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (y) => `\\${y}`).replace(/\r?\n/g, '\\n');
      const dag = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
      const nasta = new Date(`${p.testdatum}T12:00:00`); nasta.setDate(nasta.getDate() + 1);
      const antal = p.genomforda || (a.offert.deltagare && a.offert.deltagare.length) || a.offert.antal || '';
      const text = [a.titel, a.offert.eget != null ? a.offert.beskrivning : paketText(a.offert), u.kontakt ? `Kontakt på plats: ${u.kontakt}${u.telefon ? `, ${u.telefon}` : ''}` : '',
        u.lokal ? `Lokal: ${u.lokal}` : '', u.bransch ? `Bransch och särskilda behov: ${u.bransch}` : '', u.ovrigt ? `Övrigt: ${u.ovrigt}` : '',
        antal ? `Deltagare: ${antal}` : '', `Testansvarig: ${anv(p.ansvarigTest).namn}`].filter(Boolean).join('\n');
      const vik = (rad) => { const ut = []; let r = rad; while (r.length > 60) { ut.push(r.slice(0, 60)); r = ` ${r.slice(60)}`; } ut.push(r); return ut.join('\r\n'); };
      const tid = (hhmm) => `${dag(p.testdatum)}T${hhmm.replace(':', '')}00`;
      const zon = ['BEGIN:VTIMEZONE', 'TZID:Europe/Stockholm', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
        'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
      const nar = t.start ? [`DTSTART;TZID=Europe/Stockholm:${tid(t.start)}`, t.slut ? `DTEND;TZID=Europe/Stockholm:${tid(t.slut)}` : '']
        : [`DTSTART;VALUE=DATE:${dag(p.testdatum)}`, `DTEND;VALUE=DATE:${dag(lokalISO(nasta))}`];
      const rader = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Uperformance//CRM//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...(t.start ? zon : []), 'BEGIN:VEVENT',
        `UID:${p.id}-${dag(p.testdatum)}@uperformance`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
        ...nar, `SUMMARY:${esc(`Testdag – ${k.namn}`)}`,
        u.adress ? `LOCATION:${esc(u.adress)}` : '', `DESCRIPTION:${esc(text)}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).map(vik);
      laddaNerFil(`Testdag ${k.namn.replace(/[\\/:*?"<>|]/g, '')}.ics`, rader.join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
      toast('Kalenderfilen är nedladdad – öppna den för att lägga in testdagen', null, UPEMO.proj.bokning);
    },
    // Boka om: ett ark med datum och tider – projektet står kvar i Genomför test och ingenting ändras förrän det nya datumet sparas
    // (FORM.boka loggar "Testdagen ombokad från … till …" och har Ångra). Projektets uppgifter kan flyttas lika många dagar.
    omboka: (el) => {
      const p = projekt(el.dataset.projekt); if (!p) return;
      const uppg = projTodos(p).filter((t) => t.datum); const tt = testtidText(p);
      oppnaArk(`${arkHuvud('Boka om testdagen', p.testdatum ? `Bokad ${dagText(p.testdatum)}${tt ? `, ${tt}` : ''}. Projektet står kvar i Genomför test – inget ändras förrän du sparar.` : 'Välj ett nytt testdatum.', UPEMO.proj.bokning)}
        <form class="ark-kropp pj-omboka" data-form="boka" data-projekt="${e(p.id)}" data-omboka>${bokaFalt(p)}
          ${uppg.length ? `<label class="kryss"><input type="checkbox" name="flytta" checked><span>Flytta projektets ${uppg.length === 1 ? 'uppgift' : `${uppg.length} uppgifter`} lika många dagar<small>${e(uppg.map((t) => `${t.text} (${dagText(t.datum)})`).join(' · '))}</small></span></label>` : ''}
        </form>
        <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('kalender')}Spara nytt datum</button></div>`);
    },
    // Bekräftelsen till kunden: e-postprogrammet öppnas med datum, tid, adress och lokal (inget skickas från servern) – loggas när man klickar
    'bekrafta-testdag': (el) => {
      const p = projekt(el.dataset.projekt); const c = p && testdagKontakt(p); if (!c) return;
      const href = el.getAttribute('href');
      p.bekraftad = { tid: new Date().toISOString(), till: c.namn, av: jag, testdatum: p.testdatum, ...(p.testtid ? { testtid: { ...p.testtid } } : {}) };
      logga(`Bekräftelse av testdagen ${dagMan(p.testdatum)}${testtidText(p) ? ` (${testtidText(p)})` : ''} skickad till ${c.namn} via e-post.`, { kundId: p.kundId, affarId: p.affarId, typ: 'mejl' });
      spara(); rendera();
      if (href && href.startsWith('mailto:')) location.href = href;
      toast(`E-posten till ${String(c.namn).split(' ')[0]} öppnas – bifoga kalenderfilen om du vill`, null, 'mejl');
    },
    testdagslista: (el) => oppnaTestdagslista(el.dataset.projekt),
    'testdagslista-skriv': (el) => {
      const p = projekt(el.dataset.projekt); if (!p) return;
      const f = ark.querySelector('[data-tdl-flaggor]');
      skrivUtPapper(testdagslistaPapper(p, { flaggor: !!(f && f.checked) }));
    },
    // Hälsoflaggan "får kontaktas": testteamet markerar att personen är kontaktad. Skarpt läge: servern sparar det på formuläret
    // (UPLager.halsoKontakt – CRM:et skriver aldrig hälsoformulär själv). Aktiviteten nämner ingen hälsouppgift och inget namn.
    'halsa-kontaktad': async (el) => {
      const token = el.dataset.lank; const did = el.dataset.deltagare; const ja = el.dataset.varde === '1';
      const l = db.kundlankar[token]; const d = l && (l.deltagare || []).find((x) => x.id === did); const f = d && d.halsa && db.halsoformular[d.halsa];
      if (!f || anv(jag).roll !== 'test') { toast('Hälsoformuläret finns inte längre', null, 'varning'); return; }
      el.disabled = true;
      if (SKARP) {
        const svar = await L.halsoKontakt(token, did, ja);
        if (!svar.ok) { el.disabled = false; toast(svar.meddelande || 'Kunde inte spara – försök igen', null, 'varning'); return; }
      } else if (ja) f.kontaktad = { tid: new Date().toISOString(), av: jag }; else delete f.kontaktad;
      if (ja) logga('Testteamet har kontaktat en deltagare inför testdagen.', { kundId: l.kundId, affarId: l.affarId, typ: 'samtal' });
      spara(); rendera();
      const nu = $(`[data-g="halsa-kontaktad"][data-deltagare="${sel(did)}"]`, vy); if (nu) nu.focus({ preventScroll: true });
      const fn = String((f.svar && f.svar.namn) || '').split(' ')[0] || 'Deltagaren';
      toast(ja ? `${fn} är markerad som kontaktad` : `${fn} är inte längre markerad som kontaktad`, null, ja ? 'samtal' : 'aterstall');
    },
    // Påminn säljaren om ett returnerat underlag: säljarens uppgift (Komplettera underlag) får dagens datum – eller skapas
    'pamin-saljare': (el) => {
      const p = projekt(el.dataset.projekt); const a = p && affar(p.affarId); if (!a) return;
      const t = db.todos.find((x) => !x.klar && x.ansvarig === a.ansvarig && (x.projektId === p.id || (x.kundId === p.kundId && /^Komplettera underlag/.test(x.text || ''))));
      if (t) { t.datum = idag(); t.paminnd = new Date().toISOString(); if (!t.projektId) t.projektId = p.id; }
      else db.todos.push({ id: nyId('t'), text: `Komplettera underlag till testteamet${p.returKommentar ? `: ${p.returKommentar.slice(0, 70)}` : ''}`, kundId: p.kundId, affarId: p.affarId, projektId: p.id, ansvarig: a.ansvarig, datum: idag(), klar: false });
      p.paminnd = idag();
      logga(`${anv(jag).kort} påminde ${anv(a.ansvarig).kort} om att komplettera underlaget.`, { kundId: p.kundId, affarId: p.affarId });
      spara(); rendera(); toast(`${anv(a.ansvarig).kort} har uppgiften Komplettera underlag till idag`, null, 'klocka');
    },
    // Test genomfört före den bokade dagen: bekräftelsen (FORM.genomfort) skickar hit
    'genomfort-ja': (el) => { const p = projekt(el.dataset.projekt); ark.close(); if (p && p.steg === 'test') registreraTest(p, parseInt(el.dataset.genomforda, 10) || 0, el.dataset.app === '1'); },
    slutfaktura: (el) => {
      const p = projekt(el.dataset.projekt); const a = affar(p.affarId);
      p.steg = 'uppfoljning'; p.stegAndrad = idag(); p.slutfakturaDatum = idag();
      stangTodos(p.kundId, /^Skicka slutfaktura/);
      logga(`Slutfaktura skickad: ${kr(fakturaDelar(affarVarde(a)).slut)} (resterande 75 %).`, { kundId: p.kundId, affarId: a.id });
      const forslag = p.testdatum ? omDagar(60, p.testdatum) : omDagar(30);
      db.todos.push({ id: nyId('t'), text: 'Uppföljningsmöte – boka in', kundId: p.kundId, affarId: a.id, projektId: p.id, ansvarig: a.ansvarig, datum: dagarTill(forslag) < 0 ? idag() : forslag, klar: false });
      const kb = kickback(a);
      spara(); rendera();
      toast(kb ? `Slutfaktura skickad – ${kr(kb.belopp)} blir att betala till ${kb.klubb.namn}` : 'Slutfaktura skickad – uppföljningsmöte lagt i att göra', null, UPEMO.sak.ekonomi);
    },
    'skapa-lank': (el) => {
      const a = affar(el.dataset.affar); const k = kund(a.kundId); const pk = primarKontakt(k); const token = nyToken(); const nu = new Date().toISOString();
      db.kundlankar[token] = { affarId: a.id, kundId: k.id, skapad: nu, andrad: nu, utgar: omDagar(30), status: 'skickad', skickadTill: pk ? pk.epost : '', steg: 1,
        foretag: { namn: k.namn, orgnr: k.orgnr || '', kontakt: pk ? pk.namn : '', epost: pk ? pk.epost : '', tel: pk ? pk.tel : '', faktura: '', period: '', plats: '' },
        standard: { paket: a.offert.paket || 'bas', tillval: [...(a.offert.tillval || [])] }, deltagare: [] };
      logga('Kundlänk för underlag skapad (gäller i 30 dagar).', { kundId: k.id, affarId: a.id });
      // Uppgiften "Offerten är godkänd – skicka kundlänk …" (kundlogiken) är gjord nu
      stangTodos(k.id, /^Offerten är godkänd – skicka kundlänk/);
      spara(); rendera(); toast(pk && pk.epost ? 'Kundlänken är skapad – kopiera eller e-posta den' : pk ? `Kundlänken är skapad – kopiera den (${pk.namn.split(' ')[0]} saknar e-post)` : 'Kundlänken är skapad – kopiera den. Lägg till en kontaktperson så kan du e-posta den', null, UPEMO.sak.lank);
    },
    'kopiera-lank': (el) => { const falt = el.parentElement && el.parentElement.querySelector('input[data-markera-allt]'); kopiera(lankUrl(el.dataset.token), falt); },
    'forlang-lank': (el) => {
      const l = db.kundlankar[el.dataset.token]; if (!l) return;
      l.utgar = omDagar(30); l.andrad = new Date().toISOString();
      logga(`Kundlänken förlängdes till ${datumText(l.utgar, { ar: true })}.`, { kundId: l.kundId, affarId: l.affarId });
      spara(); rendera(); toast(`Länken gäller igen till ${datumText(l.utgar, { ar: true })}`, null, UPEMO.sak.lank);
    },
    'sparra-lank': (el) => { const l = db.kundlankar[el.dataset.token]; bekrafta({ titel: 'Spärra kundlänken?', sym: 'las', text: `Kunden kan inte längre öppna länken.${(l.deltagare || []).length ? ` Deltagarlistan (${plural(l.deltagare.length, 'person', 'personer')}) sparas under Tidigare kundlänkar på affären.` : ''} Du kan skapa en ny länk efteråt.`, knapp: 'Spärra länken', g: 'sparra-lank-ok', data: { token: el.dataset.token }, fara: true }); },
    'sparra-lank-ok': (el) => {
      const l = db.kundlankar[el.dataset.token]; if (!l) return; l.sparrad = idag(); l.andrad = new Date().toISOString();
      logga('Kundlänken spärrades.', { kundId: l.kundId, affarId: l.affarId });
      ark.close(); spara(); rendera(); toast('Länken är spärrad – den finns kvar under Tidigare kundlänkar');
    },
    'visa-deltagare': (el) => {
      const l = db.kundlankar[el.dataset.token]; const sm = summeraUnderlag(l);
      oppnaArk(`${arkHuvud('Deltagarlista', `${kund(l.kundId).namn} · ${plural(sm.antal, 'deltagare', 'deltagare')} · preliminärt ${kr(sm.total)}`, UPEMO.sak.underlag)}<div class="ark-kropp">${deltagarTabell(l)}
        <p class="falt-hint">${SKARP ? 'Personnumren visas maskerade.' : 'Personnumren visas maskerade. I skarp version ser bara behöriga i testteamet hela numret.'}</p></div>`, { bred: true });
    },
    'anvand-underlag': (el) => {
      const a = affar(el.dataset.affar); const l = db.kundlankar[el.dataset.token];
      const deltagare = l.deltagare.map((d) => ({ paket: d.paket, tillval: [...(d.tillval || [])] }));
      // Coaching behåller sin typ – bara deltagarna och antalet uppdateras (annars blev den en vanlig testorder)
      if (a.offert.typ === 'uppfoljning') a.offert = { ...a.offert, deltagare: deltagare.map((d) => ({ paket: d.paket, tillval: [] })), antal: l.deltagare.length, underlag: el.dataset.token };
      else a.offert = { deltagare, underlag: el.dataset.token, antal: l.deltagare.length, app: a.offert.app !== false, insights: !!a.offert.insights, uppfoljning: !!a.offert.uppfoljning };
      a.check = { ...(a.check || {}), info: true };
      stangTodos(a.kundId, /^Granska inskickat kundunderlag/);
      logga(`Offerten bygger nu på kundunderlaget: ${l.deltagare.length} deltagare, ${kr(affarVarde(a))}.`, { kundId: a.kundId, affarId: a.id });
      spara(); rendera(); toast('Offerten är uppdaterad från kundunderlaget', null, UPEMO.larm.inne);
    },
    'manuell-offert': (el) => {
      const a = affar(el.dataset.affar); const n = (a.offert.deltagare || []).length || 1;
      a.offert = { paket: 'bas', antal: n, tillval: [], app: !!a.offert.app, insights: !!a.offert.insights, uppfoljning: !!a.offert.uppfoljning };
      spara(); rendera(); toast('Manuell offert – underlaget finns kvar på länken');
    },
    'visa-tillval': (el) => { const f = el.closest('form'); const r = $('[data-tillval-rutnat]', f); const p = $('[data-tillval-alla]', f); if (r) r.hidden = false; if (p) p.hidden = true; },
    'aterstall-offert': (el) => {
      const a = affar(el.dataset.affar); const d = db.offerter[el.dataset.token]; if (!a || !d || lastOffert(a)) return;
      a.offert = JSON.parse(JSON.stringify(d.offert));
      logga(`Affären återställdes till den godkända offerten ${d.nummer} (${kr(affarVarde(a))}).`, { kundId: a.kundId, affarId: a.id });
      spara(); rendera(); toast(`Affären stämmer igen med offert ${d.nummer}`);
    },
    spinn: (el) => oppnaSpinn(el.dataset.projekt, el.dataset.typ || null),
    'skapa-dokument': (el) => {
      const typ = el.dataset.typ;
      // En ny version ersätter den gällande länken – fråga först, så att en länk som kanske redan är skickad inte slutar gälla i tysthet
      const forra = dokFor(el.dataset.affar, typ);
      if (forra && !dokKlar(forra) && !dokUtgangen(forra) && !el.dataset.ersatt) {
        const namn = typ === 'order' ? 'ordern' : 'offerten';
        bekrafta({ titel: `Ersätta ${namn} ${forra.nummer}?`, sym: typ === 'order' ? 'order' : 'dokument', text: `Länken till ${forra.nummer} slutar gälla – kunden kan inte längre ${typ === 'order' ? 'signera' : 'godkänna'} den${forra.oppnad ? ', och kunden har redan öppnat den' : ''}. Skicka den nya länken till kunden efteråt.`,
          knapp: 'Skapa ny version', g: 'skapa-dokument', data: { affar: el.dataset.affar, typ, ersatt: forra.token, ...(ark.open && $('[data-dok-detalj]', ark) ? { detalj: '1' } : {}) } });
        return;
      }
      const token = skapaDokument(el.dataset.affar, typ);
      // Står man i dokumentarket följer arket med till den nya versionen (annars ritas den ersatta om); efter frågan stängs frågearket
      const detalj = ark.open && $('[data-dok-detalj]', ark); if (detalj) detalj.dataset.dokDetalj = `o-${token}`;
      if (el.dataset.ersatt && ark.open && !detalj) ark.close();
      const sparat = spara(); rendera();
      if (el.dataset.ersatt && el.dataset.detalj) dokDetalj(`o-${token}`);
      const klar = () => { const kv = dokSkapatKvitto(el.dataset.affar, typ); toast(kv.text, { href: dokUrl(token), text: 'Öppna' }, typ === 'order' ? UPEMO.sak.order : UPEMO.sak.offert, kv.atgard ? { atgard: kv.atgard } : {}); };
      // Skarpt läge: länken visas först när servern har sparat dokumentet (vid krock visar lagret en egen varning)
      if (!SKARP) klar(); else sparat.then((svar) => { if (svar && svar.ok && db.offerter[token]) klar(); });
    },
    // Skarpt läge, bara admin: ett godkänt/signerat dokument som blivit fel makuleras på servern (loggas) – med orsak
    'makulera-dokument': (el) => {
      const d = db.offerter[el.dataset.token]; if (!d || !arAdmin()) return;
      const namn = d.typ === 'order' ? 'ordern' : 'offerten';
      oppnaArk(`${arkHuvud(`Makulera ${namn} ${d.nummer}?`, 'Bara för administratörer – åtgärden loggas.', 'varning')}
        <form data-form="makulera" data-token="${e(el.dataset.token)}" class="ark-kropp"><p class="bekrafta-text">Kunden ser att ${namn} inte längre gäller och en ny kan skapas. Godkännandet sparas som historik under Tidigare versioner.</p>
          <label><span class="etikett">Orsak<span class="krav">*</span></span><textarea class="falt" name="orsak" rows="3" required data-fel="Skriv varför dokumentet makuleras" maxlength="500" placeholder="T.ex. fel antal deltagare – ny order skickas"></textarea></label></form>
        <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-fara-solid" type="button" data-g="skicka-ark">Makulera</button></div>`);
    },
    'kopiera-dokument': (el) => kopiera(dokUrl(el.dataset.token)),
    // Dokument (#/dokument): typ, läge (samma igen = tillbaka till Alla/Aktuella), detaljerna, Att hantera, export
    'dok-fack': (el) => { const f = el.dataset.fack; dokUi.fack = f === dokUi.fack && f !== 'alla' ? 'alla' : f; dokUi.urval = null; dokUppdatera(true); },
    'dok-lage': (el) => { const l = el.dataset.lage; dokUi.lage = l === dokUi.lage && l !== 'aktuella' ? 'aktuella' : l; dokUi.urval = null; dokUppdatera(true); },
    // Glaskorten: visar exakt det kortet räknar – samma kort igen går tillbaka till alla aktuella
    'dok-tal': (el) => {
      const t = el.dataset.dkTal;
      const val = { vantar: { fack: 'alla', lage: 'vantar', urval: null }, signerat: { fack: 'alla', lage: 'klar', urval: 'signerat' }, snart: { fack: 'alla', lage: 'vantar', urval: 'snart', sortera: 'utgar', gruppera: 'ingen' }, avtal: { fack: 'avtal', lage: 'aktuella', urval: null } }[t];
      Object.assign(dokUi, dokTalAktivt(t) ? { fack: 'alla', lage: 'aktuella', urval: null } : val); synkaDokVal(); dokUppdatera(true);
    },
    'dok-vem': (el) => { dokVemNu(); dokUi.vem = el.dataset.vem === 'mina' ? 'mina' : 'alla'; dokUi.allaAtgarder = false; dokUppdatera(true); uppdateraRaknare(); },
    'dok-nollstall': () => { Object.assign(dokUi, { fack: 'alla', lage: 'aktuella', urval: null, sok: '' }); const f = $('[data-dok-sok]', vy); if (f) f.value = ''; dokUppdatera(true); },
    'dok-visa': (el) => dokDetalj(el.dataset.id),
    'dok-svarstider': (el) => dokSvarstider(el.dataset.kund || null),
    // Mallar (#/dokument/mallar): ny, exempel, ladda ner (kortet = tom mall, arket = det som visas), skriv ut, spara, ändra, digital länk, kundlänk
    'mall-ny': (el) => oppnaMall(el.dataset.mall, { kundId: el.dataset.kund || '', affarId: el.dataset.affar || '' }),
    'mall-exempel': (el) => oppnaMall(el.dataset.mall, { lage: 'exempel' }),
    'mall-ladda': (el) => {
      const m = mallFor(el.dataset.mall); if (!m) return;
      if (m.typ === 'csv') { laddaNerCsv('Deltagarlista – mall', [['Namn', 'E-post', 'Personnummer', 'Paket']]); toast('Mallen är nedladdad – en rad per deltagare', null, 'ladda-ner'); return; }
      const c = mallKontext((m.exempel || {}).kundId, (m.exempel || {}).affarId);
      const html = tona(m.typ === 'digital' ? (c.a ? offertPapper(c.a, m.id) : '') : m.papper({}, mallVarde(m, {})), m.ton);
      // Offert och order byggs ur en affär – utan exempeldata finns ingen att visa: öppna mallen så att man väljer affär
      if (!html) { toast(`${m.namn} byggs ur en affär – välj affären i mallen`, null, 'varning'); oppnaMall(m.id, { lage: 'ny' }); return; }
      laddaNerWord(`${m.filnamn || m.namn} – ${m.typ === 'digital' ? 'exempel' : 'mall'}`, html); toast('Word-filen är nedladdad', null, 'ladda-ner');
    },
    'mall-ladda-nu': () => {
      if (!mallUi) return; const { mall, v } = mallUi; const c = mallKontext(mallUi.kundId, mallUi.affarId);
      if (mall.typ === 'csv') {
        // Personnummer tas aldrig med i en nedladdad fil – bara namn, e-post och paket ur kundlänken
        const l = c.a ? lankFor(c.a.id) : null; const rader = mallUi.lage === 'exempel' ? MALL_EXEMPELRADER : l ? (l.deltagare || []).map((d) => [d.namn, d.epost, '', (PRISER.paket[d.paket] || {}).namn || '']) : [];
        laddaNerCsv(filnamn(`Deltagarlista ${c.k && mallUi.lage !== 'exempel' ? c.k.namn : 'exempel'}`), [['Namn', 'E-post', 'Personnummer', 'Paket'], ...rader]);
        toast(rader.length && mallUi.lage !== 'exempel' ? `${plural(rader.length, 'deltagare', 'deltagare')} nedladdade – personnummer tas inte med` : 'Mallen är nedladdad', null, 'ladda-ner'); return;
      }
      const html = mallDokument(mall, v, c); if (!html) return;
      laddaNerWord(mallUi.lage === 'exempel' ? `${mall.filnamn || mall.namn} – exempel` : mallTitel(mall, v, c), html); toast('Word-filen är nedladdad', null, 'ladda-ner');
    },
    'mall-skriv': () => { if (!mallUi) return; const html = mallDokument(mallUi.mall, mallUi.v, mallKontext(mallUi.kundId, mallUi.affarId)); if (html) skrivUtPapper(html); },
    'mall-spara': () => { if (mallUi) mallSpara(); },
    'mall-andra': () => { if (!mallUi) return; mallUi.lage = 'ny'; ritaMallArk(); },
    'mall-digital': () => {
      const a = mallUi && affar(mallUi.affarId); if (!a || lastOffert(a)) return;
      // Som skapa-dokument: i skarpt läge visas länken först när servern har sparat dokumentet
      const typ = mallUi.mall.id; const token = skapaDokument(a.id, typ); const sparat = spara(); rendera();
      const klar = () => { dokDetalj(`o-${token}`); const kv = dokSkapatKvitto(a.id, typ); toast(kv.text, { href: dokUrl(token), text: 'Öppna' }, typ === 'order' ? UPEMO.sak.order : UPEMO.sak.offert, kv.atgard ? { atgard: kv.atgard } : {}); };
      if (!SKARP) klar(); else sparat.then((svar) => { if (svar && svar.ok && db.offerter[token]) klar(); });
    },
    'mall-borja-om': () => { if (!mallUi) return; const u = mallUi; mallUtkast.delete(mallNyckel(u)); mallUi = null; oppnaMall(u.mall.id, { kundId: u.kundId, affarId: u.affarId, dokId: u.dokId, lage: 'ny' }); },
    'mall-lank': () => { const a = mallUi && affar(mallUi.affarId); if (!a || lankFor(a.id)) return; G['skapa-lank']({ dataset: { affar: a.id } }); ritaMallArk(); },
    // Till affären – från överlämningsmallen öppnas överlämningen där med det som skrevs i mallen
    'mall-ga': () => {
      const a = mallUi && affar(mallUi.affarId); if (!a) return; const mall = mallUi.mall; const v = { ...mallUi.v }; ark.close();
      const start = {}; UNDERLAG_FALT.forEach((f) => { if (String(v[f.id] || '').trim()) start[f.id] = v[f.id]; }); UNDERLAG_KONTROLL.forEach((x) => { if (v[x.id] != null) start[x.id] = !!v[x.id]; });
      const oppna = () => { if (mall.id === 'overlamning' && a.steg !== 'signerad' && a.steg !== 'forlorad') oppnaOverlamning(a.id, null, start); };
      if (location.hash === `#/affar/${a.id}`) oppna(); else { addEventListener('hashchange', () => setTimeout(oppna, 0), { once: true }); location.hash = `#/affar/${a.id}`; }
    },
    'dok-atgarder': () => { dokUi.allaAtgarder = !dokUi.allaAtgarder; dokUppdatera(); const k = $('[data-g="dok-atgarder"]', vy); if (k) k.focus({ preventScroll: true }); },
    'dok-export': () => dokExport(),
    // Från sökningen: till Dokument och öppna posten där
    'dok-gaa': (el) => { stangSok(); const p = dokPoster().find((x) => x.id === el.dataset.id); const har = location.hash === '#/dokument' || (!!p && location.hash === `#/dokument/${p.kundId}`); if (har) dokDetalj(el.dataset.id); else { dokUi.oppnaEfter = el.dataset.id; location.hash = '#/dokument'; } },
    // Klubbkortets "Nästa steg" när något ska betalas: rulla till klubbens provision(er) i listan, lys upp dem en gång och
    // lägg fokus på "Markera utbetald" (ingen andra knapp för samma sak)
    'kb-visa-betala': (el) => {
      const rader = [...document.querySelectorAll(`#vy .kb-prov[data-status="att-betala"][data-klubb="${sel(el.dataset.klubb)}"]`)];
      if (!rader.length) return;
      rader[0].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      rader.forEach((r) => { r.removeAttribute('data-kb-markerad'); void r.offsetWidth; r.setAttribute('data-kb-markerad', ''); clearTimeout(r.kbTimer); r.kbTimer = setTimeout(() => r.removeAttribute('data-kb-markerad'), 2800); });
      const knapp = rader[0].querySelector('[data-g="kb-betald"]'); if (knapp) knapp.focus({ preventScroll: true });
    },
    // Omritningen tar bort knappen – fokus läggs på samma provision (nu utbetald), så att tangentbordet inte börjar om från toppen
    'kb-underlag': (el) => {
      const kl = kund(el.dataset.klubb); if (!kl || !kl.klubbavtal) return;
      const rader = db.affarer.map((a) => ({ a, kb: kickback(a) })).filter((x) => x.kb && x.kb.klubb.id === kl.id && x.kb.status === 'att-betala');
      if (!rader.length) { toast('Inget att betala ut just nu', null, 'varning'); return; }
      const procentFor = (a) => (a.kickbackProcent != null ? a.kickbackProcent : kl.klubbavtal.procent);
      laddaNerCsv(`Utbetalningsunderlag ${kl.namn.replace(/[\\/:*?"<>|]/g, '')} ${idag()}`, [
        ['Klubb', 'Företag', 'Affär', 'Order signerad', 'Ordervärde (kr, exkl. moms)', 'Provision (%)', 'Att betala (kr)', 'Utbetalningsform'],
        ...rader.map(({ a, kb }) => [kl.namn, kundNamn(a.kundId), a.titel, a.stegAndrad || '', Math.round(affarVarde(a)), procentFor(a), Math.round(kb.belopp), UTBETALNING[kl.klubbavtal.form] || '']),
        ['Summa', '', '', '', '', '', sum(rader.map(({ kb }) => Math.round(kb.belopp))), ''],
      ]);
      toast(`Underlaget är nedladdat – ${plural(rader.length, 'provision', 'provisioner')} att betala ut`, null, 'ladda-ner');
    },
    'kb-betald': (el) => { if (anv(jag).roll === 'test' && !arAdmin()) { toast('Sälj betalar ut provisionen', null, 'varning'); return; } const a = affar(el.dataset.affar); const kb = kickback(a); a.kickbackUtbetald = idag(); logga(`Provision för ${kund(a.kundId).namn} utbetald: ${kr(kb.belopp)}.`, { kundId: kb.klubb.id }); spara(); rendera();
      const rad = document.querySelector(`#vy .kb-prov[data-affar="${sel(a.id)}"] a`); if (rad) rad.focus({ preventScroll: true });
      toast(`${kr(kb.belopp)} markerat som utbetalt till ${kb.klubb.namn}`, null, UPEMO.sak.provision, { atgard: { text: 'Ångra', fn: () => {
        if (a.kickbackUtbetald !== idag()) return;
        a.kickbackUtbetald = null; logga(`Utbetalningen av provisionen för ${kund(a.kundId).namn} ångrades.`, { kundId: kb.klubb.id });
        spara(); rendera(); toast('Provisionen är tillbaka under Att betala', null, UPEMO.sak.provision);
      } } }); },
    'oppna-dok': (el) => {
      // Skarpt läge: uppladdade filer ligger på servern. Demoläget: bara under sessionen (objekt-URL).
      const d = db.dokument.find((x) => x.id === el.dataset.id);
      if (d && d.mall && mallFor(d.mall)) { oppnaMall(d.mall, { dokId: d.id, lage: 'visa' }); return; } // skapat från mall: öppnas i mallarket
      const url = (d && d.fil && L.filer.url(d.id)) || filer.get(el.dataset.id);
      if (url && d && (d.kategori === 'mote' || /^audio\//.test(d.typ || ''))) { // mötesinspelning: spela upp på plats
        const rad = el.closest('.dokrad'); const finns = rad && rad.nextElementSibling && rad.nextElementSibling.matches('.dokspelare');
        if (finns) { rad.nextElementSibling.remove(); el.textContent = 'Öppna'; return; }
        const sp = document.createElement('div'); sp.className = 'dokspelare'; sp.innerHTML = `<audio controls preload="metadata" src="${e(url)}"></audio>`;
        rad.after(sp); el.textContent = 'Stäng'; const a = sp.querySelector('audio'); a.play().catch(() => {}); return;
      }
      if (url) open(url, '_blank', 'noopener');
      else toast(!SKARP ? 'Exempeldokument – i prototypen finns ingen riktig fil bakom.' : d && d.exempel ? 'Exempeldokument – det finns ingen riktig fil bakom.' : 'Det finns ingen fil sparad för dokumentet.');
    },
    'oppna-sok': () => { if (ark.open) { sparaUtkast(); ark.close(); } const s = $('[data-sok]'); s.setAttribute('data-oppen', ''); sokFalt.focus(); sok(sokFalt.value); },
    mer: () => {
      // Flikraden är rollstyrd: sälj har Sälj och Att göra som flikar (Projekt ligger här), testteamet har Projekt och Att göra
      // (Säljtavlan ligger här)
      const arTest = document.documentElement.hasAttribute('data-roll-test');
      const rad = (href, sym, titel, under, extra = '') => `<a class="mer-rad" href="${href}" ${location.hash === href || location.hash.startsWith(href + '/') ? 'aria-current="page"' : ''}><span class="mer-ikon">${ik(sym)}</span><span class="mer-text"><strong>${titel}</strong><small>${under}</small></span>${extra}${ik('flytta')}</a>`;
      const projektChip = raknareNu.projekt ? `<span class="chip chip-gul">${raknareNu.projekt} att granska</span>` : '';
      const baraAdmin = anv(jag).roll === 'admin';
      const saljGrupp = baraAdmin ? '' : `<div class="mer-grupp"><span class="mer-etikett">Sälj &amp; relation</span>
          ${arTest ? rad('#/salj', 'salj', 'Säljtavla', 'Affärerna som kan bli projekt') : ''}
          ${rad('#/mote', 'presentation', 'Kundmöte', 'Presentation och live-kalkyl')}
          ${rad('#/klubbmotorn', 'klubb', 'Klubbmotorn', 'Provisioner och partners via klubbar')}
          ${rad('#/dokument', 'dokument', 'Dokument', 'Offerter, ordrar, avtal och underlag', raknareNu.dokument ? `<span class="chip chip-gul">${raknareNu.dokument} att hantera</span>` : '')}</div>`;
      const admin = arAdmin() ? rad('#/anvandare', 'mote', 'Användare', 'Teamet, roller och loggen') : '';
      const mig2 = anv(jag); const ledning = LED && (LED.arChef(mig2) || LED.arAdm(mig2)) ? `<div class="mer-grupp"><span class="mer-etikett">Ledning</span>${LED.arChef(mig2) ? rad('#/chef', 'krona', 'Försäljning', 'Teamets status, pipeline och mål') : ''}${LED.arAdm(mig2) ? `${rad('#/admin', 'server', 'Adminpanel', 'Konton, roller, data och system')}${rad('#/sakerhet', 'radar', 'Säkerhet', 'Skanna, uppdatera och övervaka')}` : ''}</div>` : '';
      oppnaArk(`${arkHuvud('Mer')}<div class="ark-kropp mer-ark" data-mork-yta>${ledning}
        ${arTest ? `${saljGrupp}${admin ? `<div class="mer-grupp"><span class="mer-etikett">Admin</span>${admin}</div>` : ''}`
        : `${saljGrupp}${baraAdmin ? '' : `<div class="mer-grupp"><span class="mer-etikett">Testteam</span>
          ${rad('#/projekt', 'projekt', 'Projekt', 'Från underlag och test till uppföljning', projektChip)}</div>`}
          ${admin ? `<div class="mer-grupp"><span class="mer-etikett">Admin</span>${admin}</div>` : ''}`}
        ${!SKARP && CHT ? `<div class="mer-grupp"><span class="mer-etikett">Teamet</span>${rad('#/chatt', 'prat', 'Meddelanden', 'Skriv privat eller i grupp med kollegorna', CHT.olastaTotalt() ? `<span class="chip chip-gul">${CHT.olastaTotalt()} olästa</span>` : '')}</div>` : ''}
        <div class="mer-grupp"><span class="mer-etikett">Konto</span>
          ${LED ? `<div class="mer-par"><button class="knapp knapp-kontur" type="button" data-g="lp-status">${ik('puls')}${e(LED.statusText(anv(jag), false))}</button><a class="knapp knapp-kontur" href="#/profil">${ik('anstallda')}Min profil</a></div>` : ''}
          ${SKARP ? `<div class="mer-inloggad">${avatar(jag)}<span class="lank-rad-text"><strong>${e(anv(jag).namn)}</strong><small>${e(rollText(anv(jag)))}</small></span></div>`
            : LED ? `<span class="etikett">Byt konto</span>${LED.kontoListaHtml()}` : `<label><span class="etikett">Inloggad som</span><select class="falt" data-anvandarval>${anvAlternativ(jag)}</select></label>`}
          <div class="mer-par"><a class="knapp knapp-kontur" href="https://www.uperformance.se/">${ik('hem')}Hemsidan</a><button class="knapp knapp-kontur" type="button" data-g="logga-ut">${ik('logga-ut')}Logga ut</button></div>
          ${kanAterstalla() ? `<button class="knapp knapp-spok knapp-bred" type="button" data-g="aterstall">${ik('aterstall')}Återställ exempeldata</button>` : ''}</div></div>`);
    },
    'logga-ut': async () => {
      // Demoläget: tar bort inloggningen i webbläsaren. Skarpt läge: sparar det som väntar och avslutar sessionen på servern.
      await L.loggaUt();
      if (window.UPLamna) UPLamna('logga-in.html?utloggad=1'); else location.href = 'logga-in.html?utloggad=1';
    },
    aterstall: () => {
      if (!kanAterstalla()) { toast(L.lage.aterstallning ? 'Bara en administratör kan återställa exempeldatan.' : 'Återställning är avstängd i den här miljön.', null, 'varning'); return; }
      bekrafta({ titel: 'Återställa exempeldatan?', sym: 'aterstall', text: SKARP ? 'Kunder, affärer, projekt och allt annat ersätts med exempeldatan för alla användare. Användarna påverkas inte och en säkerhetskopia tas först.' : 'Allt du lagt in i prototypen ersätts med exempeldatan. Det går inte att ångra.', knapp: 'Återställ exempeldata', g: 'aterstall-ok', fara: true });
    },
    'aterstall-ok': async (el) => {
      el.disabled = true;
      const svar = await L.aterstallExempeldata();
      if (!svar.ok) { el.disabled = false; toast(svar.meddelande || 'Exempeldatan kunde inte återställas.', null, 'varning'); return; }
      db = svar.db; uppdateraRaknare(); if (ark.open) ark.close(); rendera(true); toast('Exempeldatan är återställd');
    },
    // Användare (bara admin i skarpt läge)
    'anv-aktiv': async (el) => {
      const id = el.dataset.id; const aktiv = el.dataset.aktiv === '1';
      const u = (adminUi.anvandare || []).find((x) => x.id === id);
      if (!aktiv) { bekrafta({ titel: `Inaktivera ${u ? u.namn : 'användaren'}?`, sym: 'las', text: 'Personen loggas ut inom 15 sekunder och får veta att kontot är inaktiverat. Hen kan inte logga in förrän kontot aktiveras igen. Allt personen gjort finns kvar.', knapp: 'Inaktivera', g: 'anv-aktiv-ok', data: { id }, fara: true }); return; }
      el.disabled = true;
      await uppdateraAnvandare(id, { aktiv: true }, `${u ? u.namn : 'Kontot'} är aktiverat igen`);
    },
    'anv-aktiv-ok': async (el) => { const id = el.dataset.id; const u = (adminUi.anvandare || []).find((x) => x.id === id); el.disabled = true; ark.close(); await uppdateraAnvandare(id, { aktiv: false }, `${u ? u.namn : 'Kontot'} är inaktiverat och utloggat`); },
    'anv-konto': (el) => anvKontoArk(el.dataset.id),
    'anv-logga-ut': async (el) => {
      const id = el.dataset.id; const u = (adminUi.anvandare || []).find((x) => x.id === id); el.disabled = true;
      const svar = await L.admin.loggaUt(id, el.dataset.sid || '');
      if (!svar.ok) { el.disabled = false; toast(svar.meddelande || 'Utloggningen misslyckades.', null, 'varning'); return; }
      toast(svar.avslutade ? `${u ? u.kort : 'Kontot'} är utloggad på ${plural(svar.avslutade, 'enhet', 'enheter')} – inom 15 sekunder` : 'Det fanns inget att logga ut', null, 'logga-ut');
      await laddaAdmin(); ritaAnvKonto(id, svar);
    },
    'anv-hav-sparr': async (el) => {
      const id = el.dataset.id; el.disabled = true;
      const svar = await L.admin.havSparr(id);
      if (!svar.ok) { el.disabled = false; toast(svar.meddelande || 'Spärren kunde inte hävas.', null, 'varning'); return; }
      toast(svar.havd ? `Spärren är hävd – ${svar.anvandare.kort} kan begära en ny kod direkt` : 'Kontot var inte spärrat', null, 'las');
      await laddaAdmin(); ritaAnvKonto(id, await L.admin.sessioner(id));
    },
    'anv-inbjudan': async (el) => {
      const id = el.dataset.id; const u = (adminUi.anvandare || []).find((x) => x.id === id); el.disabled = true;
      const svar = await L.admin.inbjudan(id);
      el.disabled = false;
      if (!svar.ok) { toast(svar.meddelande || 'Inbjudan kunde inte skickas.', null, 'varning'); return; }
      toast(`Inbjudan skickad igen till ${u ? u.namn : 'kontot'}${L.lage.miljo === 'lokal' ? ' – den ligger i serverns utkorg' : ''}`, null, 'mejl');
    },
    'register-ladda-ner': () => {
      const r = adminUi.register; if (!r) return;
      const fil = { format: 'uperformance-registerutdrag', sokning: r.q, framtaget: r.tid, framtagetAv: anv(jag).namn, traffar: r.traffar };
      laddaNerFil(`Registerutdrag-${String(r.q).replace(/[^\wåäöÅÄÖ@.-]+/g, '_').slice(0, 40)}-${idag()}.json`, JSON.stringify(fil, null, 2), 'application/json');
    },
    'admin-logg-fler': () => laddaLogg(),
    'admin-ladda': () => laddaAdmin(),
    'admin-loggfilter': (el) => { adminUi.loggFilter = el.dataset.filter; ritaAdmin(); laddaLoggOm(); },
    'admin-logg-rensa': () => {
      adminUi.loggFilter = 'alla'; adminUi.loggF = { vem: '', kund: '', fran: '', till: '', hamtningar: false };
      const rad = $('[data-logg-filter]', vy);
      // change som inte bubblar: väljarens knapp (valj.js) följer med utan att filtret körs en gång per ruta
      if (rad) { rad.querySelectorAll('select').forEach((s) => { s.value = ''; s.dispatchEvent(new Event('change')); }); rad.querySelectorAll('input[type="date"]').forEach((i) => { i.value = ''; i.removeAttribute('min'); }); }
      const k = $('[data-logg-f="hamtningar"]', vy); if (k) k.checked = false;
      ritaAdmin(); laddaLoggOm();
      const forsta = $('[data-g="admin-loggfilter"]', vy); if (forsta) forsta.focus();
    },
    'spara-nu': () => { if (L.forsokNu) L.forsokNu(); else L.synka(); },
  };
  document.addEventListener('click', (ev) => {
    const dr = ev.target.closest('tr[data-dok]');
    if (dr && !ev.target.closest('a, button, label, input')) { const b = $('.dk-namn', dr); if (b) { b.focus({ preventScroll: true }); dokDetalj(dr.dataset.dok); } return; }
    const tr = ev.target.closest('tr[data-href]');
    if (tr && !ev.target.closest('a, button')) { location.hash = tr.dataset.href; return; }
    // Översiktens tratt: hoppa till rätt kolumn när säljtavlan har ritats
    const ts = ev.target.closest('[data-salj-steg]'); if (ts && ev.button === 0 && !(ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey)) vantandeKolumn = ts.dataset.saljSteg;
    const el = ev.target.closest('[data-g]'); if (!el) return;
    const fn = G[el.dataset.g]; if (!fn) return;
    ev.preventDefault(); ev.stopPropagation();
    fn(el, ev);
  });
  // Bildvalet: antalet på startknappen, och valet sparas i moteUi så att det överlever omritningar (null = alla)
  const raknaBildval = (f) => {
    const alla = $$('[name="bild"]', f); const valda = alla.filter((x) => x.checked);
    moteUi.bilder = valda.length === alla.length ? null : valda.map((x) => x.value);
    $$('[data-bildval-tal]', f).forEach((t) => { t.textContent = moteBildTal(valda.length, alla.length); });
    f.toggleAttribute('data-inga-bilder', !valda.length);
    $$('[data-mk-start]', f).forEach((k) => k.setAttribute('aria-disabled', String(!valda.length)));
  };

  /* Formulär */
  const FORM = {
    'starta-mote': (f, d) => {
      const bilder = d.getAll('bild'); if (!bilder.length) { moteVisaRemsan(f); return; }
      startaMote({ kundId: d.get('kundId') || null, affarId: moteAffarFor(d.get('kundId'), d.get('affarId') || null), bilder }, '[data-mk-start]');
    },
    anteckning: (f, d) => {
      const text = String(d.get('text') || '').trim(); if (!text) return;
      if (d.get('folj') && !datumInom(d.get('datum'), 0, 730)) { felFalt(f, 'datum', 'Välj ett uppföljningsdatum från idag och högst två år framåt'); return; }
      const affarId = f.dataset.affar || undefined;
      db.aktiviteter.push({ id: nyId('x'), kundId: f.dataset.kund, ...(affarId ? { affarId } : {}), typ: d.get('typ') || 'anteckning', text, av: jag, tid: new Date().toISOString() });
      if (d.get('folj')) db.todos.push({ id: nyId('t'), text: `Följ upp: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, kundId: f.dataset.kund, ...(affarId ? { affarId } : {}), ansvarig: jag, datum: d.get('datum') || omDagar(3), klar: false });
      spara(); rendera(); toast(`${AKT_SPARAD[d.get('typ')] || AKT_SPARAD.anteckning}${d.get('folj') ? ` – uppföljning ${dagText(d.get('datum') || omDagar(3))} i att göra` : ''}`, null, UPEMO.akt[d.get('typ')] || 'bock');
    },
    'snabb-anteckning': (f, d) => {
      const kundId = d.get('kundId'); const text = String(d.get('text') || '').trim();
      if (!kundId) { felFalt(f, 'kundId', 'Välj vilken kund anteckningen gäller'); return; }
      if (!text) { felFalt(f, 'text', 'Skriv kort vad som hände'); return; }
      db.aktiviteter.push({ id: nyId('x'), kundId, typ: d.get('typ') || 'anteckning', text, av: jag, tid: new Date().toISOString() });
      if (d.get('folj')) db.todos.push({ id: nyId('t'), text: `Följ upp: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, kundId, ansvarig: jag, datum: d.get('datum'), klar: false });
      spara(); ark.close(); rendera(); toast(`${AKT_SPARAD[d.get('typ')] || AKT_SPARAD.anteckning}${d.get('folj') ? ` – uppföljning ${dagText(d.get('datum'))}` : ''}`, { href: `#/kund/${kundId}`, text: 'Visa' }, UPEMO.akt[d.get('typ')] || 'bock');
    },
    // "Hur gick mötet?" efter presentationen (oppnaMoteLogg)
    'mote-logg': (f, d) => {
      const k = kund(f.dataset.kund); if (!k) { ark.close(); return null; }
      if (d.get('folj') && !datumInom(d.get('datum'), 0, 730)) { felFalt(f, 'datum', 'Välj ett uppföljningsdatum från idag och högst två år framåt'); return null; }
      const a = f.dataset.affar ? affar(f.dataset.affar) : null; const affarId = a ? a.id : undefined;
      const text = String(d.get('text') || '').trim();
      const akt = logga(text || `Kundmöte – presentationen visades (${f.dataset.omfang}).`, { kundId: k.id, affarId, typ: 'mote' });
      const poster = [['aktiviteter', akt.id]];
      let todo = null;
      if (d.get('folj')) {
        todo = { id: nyId('t'), text: text ? `Följ upp mötet: ${text.slice(0, 50)}${text.length > 50 ? '…' : ''}` : `Följ upp mötet med ${k.namn}`, kundId: k.id, ...(affarId ? { affarId } : {}), ansvarig: jag, datum: d.get('datum') || omDagar(3), klar: false };
        db.todos.push(todo); poster.push(['todos', todo.id]);
      }
      // Flytten som i säljtavlan (flyttaAffar): steget, datumet i steget och händelsen i tidslinjen
      const flyttad = !!(a && d.get('flytta') && a.steg === 'kontakt');
      if (flyttad) { a.steg = 'besok'; a.stegAndrad = idag(); poster.push(['affarer', a.id], ['aktiviteter', logga(`${a.titel}: Ny kontakt → Kundbesök.`, { kundId: k.id, affarId: a.id }).id]); }
      return sparaFranArk(f, { poster, klar: () => toast(`${AKT_SPARAD.mote}${flyttad ? ` – ${a.titel} står i Kundbesök` : ''}${todo ? ` – uppföljning ${dagText(todo.datum)} i att göra` : ''}`, { href: `#/kund/${k.id}`, text: 'Visa' }, UPEMO.akt.mote), igen: () => FORM['mote-logg'](f, new FormData(f)) });
    },
    'snabb-todo': (f, d) => {
      const text = String(d.get('text') || '').trim(); if (!text) { felFalt(f, 'text', 'Skriv vad som ska göras'); return; }
      if (d.get('datum') && !datumInom(d.get('datum'), -365, 730)) { felFalt(f, 'datum', 'Välj ett datum inom två år'); return; }
      db.todos.push({ id: nyId('t'), text, kundId: d.get('kundId') || null, ansvarig: d.get('ansvarig') || jag, datum: d.get('datum') || null, klar: false });
      spara(); ark.close(); rendera(); toast('Tillagd i att göra', { href: '#/att-gora', text: 'Visa' }, todoTyp(text)[1]);
    },
    'todo-snabb': (f, d) => {
      // novalidate på formuläret: ingen webbläsarbubbla ovanpå vår felrad – felet visas i pillret (sidor.css 11, .td-kommando-falt)
      const text = String(d.get('text') || '').trim(); if (!text) { felFalt(f, 'text', 'Skriv vad som ska göras'); return; }
      if (d.get('datum') && !datumInom(d.get('datum'), -365, 730)) { toast('Datumet ser inte rätt ut – välj ett datum inom två år', null, 'varning'); const df = $('input[name="datum"]', f); if (df) df.focus(); return; }
      // Kundens (eller kontaktens) namn i texten kopplar uppgiften till kunden – då syns den på kundkortet och i kundmötet
      const k = kundIText(text);
      db.todos.push({ id: nyId('t'), text, kundId: k ? k.id : null, ansvarig: jag, datum: d.get('datum') || null, klar: false });
      todoUi.utkast = '';
      spara(); rendera(); const falt = $('#todo-ny'); falt && falt.focus();
      toast(`Tillagd${d.get('datum') ? ` – ${datumText(d.get('datum'), { gemen: true })}` : ''}${k ? ` · ${k.namn}` : ''}`, k ? { href: `#/kund/${k.id}`, text: 'Visa kunden' } : null, todoTyp(text)[1]);
    },
    'snabb-kund': (f, d) => {
      const namn = String(d.get('namn') || '').replace(/\s+/g, ' ').trim(); if (!namn) { felFalt(f, 'namn', 'Skriv företagets eller klubbens namn'); return; }
      // Samma namn (utan skillnad i versaler, mellanslag och AB/Aktiebolag) finns redan: stoppa med Öppna och Skapa ändå
      const dubblett = d.get('anda') ? null : db.kunder.find((x) => namnNyckel(x.namn) === namnNyckel(namn));
      if (dubblett) { visaDubblett(f.elements.namn, { stopp: true }); felFalt(f, 'namn', `${dubblett.namn} finns redan i registret`); return; }
      const ep = String(d.get('epost') || '').trim();
      if (ep && !EPOST_MONSTER.test(ep)) { felFalt(f, 'epost', 'Skriv en giltig e-postadress, t.ex. namn@foretag.se'); return; }
      if (!telOk(d.get('tel'))) { felFalt(f, 'tel', 'Telefonnumret ser inte rätt ut – siffror, mellanslag och + går bra'); return; }
      const k = { id: nyId('k'), namn, typ: d.get('typ'), bransch: '', stad: '', orgnr: '', anstallda: null, viaKlubb: d.get('viaKlubb') || null, skapad: idag(), kontakter: [] };
      if (k.typ === 'klubb') { k.viaKlubb = null; k.klubbavtal = { procent: Math.round(KLUBBMOTORN.provision * 100), form: 'oklart', sedan: idag(), partners: 0 }; }
      if (String(d.get('kontakt') || '').trim()) k.kontakter.push({ id: nyId('p'), namn: d.get('kontakt').trim(), roll: d.get('roll') || '', tel: d.get('tel') || '', epost: d.get('epost') || '' });
      db.kunder.push(k);
      const via = k.viaKlubb ? kund(k.viaKlubb) : null;
      logga(`Ny ${k.typ === 'klubb' ? 'klubb' : 'kund'} registrerad${via ? ` – introducerad via ${via.namn}` : ''}.`, { kundId: k.id });
      if (String(d.get('text') || '').trim()) db.aktiviteter.push({ id: nyId('x'), kundId: k.id, typ: 'anteckning', text: d.get('text').trim(), av: jag, tid: new Date().toISOString() });
      // Affären som kryssrutan lägger in loggas som en vanlig ny affär – och toasten säger att den finns (länk, och Ångra där borttagning är tillåten)
      let ny = null;
      if (d.get('affar') && k.typ === 'foretag') {
        ny = { id: nyId('a'), kundId: k.id, titel: via ? `Introduktion via ${via.namn}` : 'Hälsokartläggning', steg: 'kontakt', ansvarig: anv(jag).roll === 'salj' ? jag : (db.anvandare.find((u) => u.roll === 'salj' && arAktiv(u)) || anv(jag)).id, skapad: idag(), stegAndrad: idag(), check: { info: false, samtycke: false, pub: false, order: false }, offert: { paket: 'bas', antal: 20, tillval: [], app: true, insights: false, uppfoljning: false } };
        db.affarer.push(ny);
      }
      const nyAkt = ny ? logga(`Ny affär: ${ny.titel} (${kr(affarVarde(ny))}).`, { kundId: k.id, affarId: ny.id }) : null;
      spara(); ark.close(); location.hash = `#/kund/${k.id}`;
      const ikon = k.typ === 'klubb' ? UPEMO.sak.klubb : UPEMO.kundtyp.foretag;
      if (!ny) { toast(`${namn} är skapad`, null, ikon); return; }
      const stegNamn = (SALJSTEG.find((x) => x.id === 'kontakt') || {}).namn || 'Ny kontakt';
      const angra = !SKARP || arAdmin() ? { atgard: { text: 'Ångra affären', fn: () => {
        const i = db.affarer.findIndex((x) => x.id === ny.id); if (i < 0 || db.affarer[i].steg !== 'kontakt') return;
        db.affarer.splice(i, 1); const j = db.aktiviteter.indexOf(nyAkt); if (j >= 0) db.aktiviteter.splice(j, 1);
        spara(); rendera(); toast(`Affären är borttagen – ${namn} ligger kvar som kund`, null, ikon);
      } } } : {};
      toast(`${namn} är skapad – och affären ${ny.titel} (${kr(affarVarde(ny))}) ligger i ${stegNamn}`, { href: `#/affar/${ny.id}`, text: 'Öppna affären' }, ikon, angra);
    },
    'ny-affar': (f, d) => {
      const kundId = d.get('kundId'); if (!kundId) { felFalt(f, 'kundId', 'Välj vilken kund affären gäller'); return; }
      const a = { id: nyId('a'), kundId, titel: String(d.get('titel') || '').trim() || 'Hälsokartläggning', steg: d.get('steg'), ansvarig: d.get('ansvarig'), skapad: idag(), stegAndrad: idag(), check: { info: false, samtycke: false, pub: false, order: false }, offert: { paket: d.get('paket'), antal: parseInt(d.get('antal'), 10) || 1, tillval: [], app: true, insights: false, uppfoljning: false } };
      db.affarer.push(a); logga(`Ny affär: ${a.titel} (${kr(affarVarde(a))}).`, { kundId, affarId: a.id });
      spara(); ark.close();
      // Från säljtavlan: stanna kvar och låt det nya kortet lysa upp. Annars: öppna affären.
      if (/^#\/salj/.test(location.hash)) { senastFlyttad = a.id; rendera(); const n = $(`.affarskort[data-affar="${sel(a.id)}"]`, vy); if (n) n.scrollIntoView({ block: 'nearest', inline: 'center', behavior: lugn ? 'auto' : 'smooth' }); toast('Affären är skapad', { href: `#/affar/${a.id}`, text: 'Öppna' }, UPEMO.salj[a.steg]); }
      else { location.hash = `#/affar/${a.id}`; toast('Affären är skapad', null, UPEMO.salj[a.steg]); }
    },
    'andra-kund': (f, d) => {
      const k = kund(f.dataset.kund); if (!k) { ark.close(); return null; }
      const txt = (x) => String(d.get(x) || '').trim();
      const klubbFalt = !!k.klubbavtal && d.has('procent');
      const falt = ['namn', 'bransch', 'stad', 'orgnr', 'anstallda', ...(klubbFalt ? ['procent', 'partners'] : [])];
      const orgIn = txt('orgnr');
      const mitt = { namn: txt('namn'), bransch: txt('bransch'), stad: txt('stad'), orgnr: orgIn.replace(/^(\d{6})-?(\d{4})$/, '$1-$2'), anstallda: txt('anstallda'), ...(klubbFalt ? { procent: txt('procent'), partners: txt('partners') || '0' } : {}) };
      // Bara det man ändrat i arket skrivs – en kollegas ändring av ett annat fält står kvar, samma fält visas som krock vid fältet
      const nu = arkVarden(kundFalt(k), falt); const { satt, krockar } = slaIhopFalt(foreVarden(f), mitt, nu, falt);
      if (krockar.length) { visaKrockar(f, krockar); return null; }
      const har = (x) => Object.prototype.hasOwnProperty.call(satt, x);
      // Allt kontrolleras innan något ändras – ett fel får inte lämna halva ändringen kvar
      if (har('namn')) {
        if (!satt.namn) { felFalt(f, 'namn', k.typ === 'klubb' ? 'Skriv klubbens namn' : 'Skriv företagets namn'); return null; }
        const dubblett = db.kunder.find((x) => x.id !== k.id && namnNyckel(x.namn) === namnNyckel(satt.namn));
        if (dubblett) { felFalt(f, 'namn', `${dubblett.namn} finns redan i registret`); return null; }
      }
      if (har('orgnr') && satt.orgnr && !/^\d{6}-\d{4}$/.test(satt.orgnr)) { felFalt(f, 'orgnr', 'Organisationsnumret ska ha formatet NNNNNN-NNNN'); return null; }
      const anstallda = har('anstallda') && satt.anstallda !== '' ? Number(satt.anstallda) : null;
      if (har('anstallda') && satt.anstallda !== '' && !(Number.isInteger(anstallda) && anstallda >= 0)) { felFalt(f, 'anstallda', 'Skriv ett heltal'); return null; }
      const pr = har('procent') ? Number(satt.procent) : null; const pa = har('partners') ? Number(satt.partners || 0) : null;
      if (har('procent') && !(Number.isInteger(pr) && pr >= 0 && pr <= 50)) { felFalt(f, 'procent', 'Skriv en procent mellan 0 och 50'); return null; }
      if (har('partners') && !(Number.isInteger(pa) && pa >= 0)) { felFalt(f, 'partners', 'Skriv ett heltal'); return null; }
      const andrat = []; const affarer = [];
      const sattFalt = (x, varde, etikett) => { if (String(k[x] ?? '') !== String(varde ?? '')) { andrat.push(etikett); if (varde === null || varde === '') delete k[x]; else k[x] = varde; } };
      if (har('namn')) sattFalt('namn', satt.namn, 'namn');
      if (har('bransch')) sattFalt('bransch', satt.bransch, k.typ === 'klubb' ? 'idrott' : 'bransch');
      if (har('stad')) sattFalt('stad', satt.stad, 'ort');
      if (har('orgnr')) sattFalt('orgnr', satt.orgnr, 'org.nr');
      if (har('anstallda')) sattFalt('anstallda', anstallda, k.typ === 'klubb' ? 'spelare och ledare' : 'anställda');
      if (har('procent') && pr !== k.klubbavtal.procent) {
        // Signerade affärer via klubben behåller procenten de signerades med (kickback läser kickbackProcent)
        db.affarer.filter((a) => a.steg === 'signerad' && klubbFor(a) === k.id && a.kickbackProcent == null).forEach((a) => { a.kickbackKlubb = k.id; a.kickbackProcent = k.klubbavtal.procent; affarer.push(['affarer', a.id]); });
        andrat.push(`provision ${k.klubbavtal.procent} → ${pr} %`); k.klubbavtal.procent = pr;
      }
      if (har('partners') && pa !== (k.klubbavtal.partners || 0)) { andrat.push('partners i nätverket'); k.klubbavtal.partners = pa; }
      const ikon = UPEMO.kundtyp[k.typ === 'klubb' ? 'klubb' : 'foretag'];
      if (!andrat.length) { ark.close(); toast('Inget ändrades', null, ikon); return null; }
      const akt = logga(`Uppgifterna ändrades: ${andrat.join(', ')}.`, { kundId: k.id });
      return sparaFranArk(f, { poster: [['kunder', k.id], ['aktiviteter', akt.id], ...affarer], klar: () => toast('Uppgifterna är sparade', null, ikon), igen: () => FORM['andra-kund'](f, new FormData(f)) });
    },
    'andra-affar': (f, d) => {
      const a = affar(f.dataset.affar); if (!a) { ark.close(); return null; }
      if (lastOffert(a)) { ark.close(); toast('Affären är låst – den byter inte namn', null, 'las'); return null; }
      const titel = String(d.get('titel') || '').replace(/\s+/g, ' ').trim();
      if (!titel) { felFalt(f, 'titel', 'Skriv ett namn på affären'); return null; }
      if (titel.length > 200) { felFalt(f, 'titel', 'Högst 200 tecken'); return null; }
      if (titel === a.titel) { ark.close(); toast('Inget ändrades', null, 'redigera'); return null; }
      const fore = a.titel; a.titel = titel;
      const akt = logga(`Affären döptes om: ${fore} → ${titel}.`, { kundId: a.kundId, affarId: a.id });
      return sparaFranArk(f, { poster: [['affarer', a.id], ['aktiviteter', akt.id]], klar: () => toast(`Affären heter nu ${titel}`, null, UPEMO.salj[a.steg] || 'bock'), igen: () => FORM['andra-affar'](f, new FormData(f)) });
    },
    'ny-kontakt': (f, d) => sparaKontakt(f, d),
    'andra-kontakt': (f, d) => sparaKontakt(f, d),
    'andra-akt': (f, d) => {
      const x = db.aktiviteter.find((y) => y.id === f.dataset.id);
      if (!kanAndraAkt(x)) { ark.close(); toast('Aktiviteten finns inte längre eller får inte ändras av dig', null, 'varning'); return; }
      const text = String(d.get('text') || '').trim(); if (!text) { felFalt(f, 'text', 'Skriv vad som hände'); return; }
      const typ = AKT_EGNA.includes(d.get('typ')) ? d.get('typ') : x.typ;
      if (text === x.text && typ === x.typ) { ark.close(); return; }
      x.text = text; x.typ = typ; x.andrad = new Date().toISOString(); x.andradAv = jag;
      spara(); ark.close(); rendera(); toast('Aktiviteten är ändrad', null, UPEMO.akt[typ] || 'bock');
    },
    'koppla-klubb': (f, d) => {
      const k = kund(f.dataset.kund); const fore = k.viaKlubb || null; const ny = d.get('viaKlubb') || null;
      // Signerade affärer behåller klubben och procenten de signerades med (kickback/klubbFor) – öppna affärer följer den nya kopplingen
      if (fore !== ny) db.affarer.filter((a) => a.kundId === k.id && a.steg === 'signerad' && a.kickbackKlubb === undefined).forEach((a) => {
        const kl = fore && kund(fore); a.kickbackKlubb = fore; a.kickbackProcent = kl && kl.klubbavtal ? kl.klubbavtal.procent : null;
      });
      k.viaKlubb = ny;
      if (fore !== k.viaKlubb) logga(k.viaKlubb ? `Kopplad till ${kund(k.viaKlubb).namn} via Klubbmotorn.` : 'Klubbkopplingen togs bort.', { kundId: k.id });
      spara(); ark.close(); rendera(); toast('Klubbkopplingen är sparad', null, UPEMO.sak.klubb);
    },
    forlora: (f, d) => {
      const a = affar(f.dataset.affar); const orsak = String(d.get('orsak') || '').trim(); const fel = !!d.get('felregistrerad');
      if (!orsak && !fel) { felFalt(f, 'orsak', 'Skriv kort varför – det hjälper nästa säljare'); return; }
      a.steg = 'forlorad'; a.forlorad = { orsak: orsak || 'Felregistrerad / dubblett', datum: idag(), ...(fel ? { felregistrerad: true } : {}) }; a.stegAndrad = idag();
      logga(fel ? `Affären markerades som felregistrerad (räknas inte i statistiken)${orsak ? `: ${orsak}` : '.'}` : `Affären markerades som förlorad: ${orsak}`, { kundId: a.kundId, affarId: a.id });
      spara(); ark.close(); rendera(); toast(fel ? 'Affären är markerad som felregistrerad – den räknas inte i statistiken' : 'Affären är markerad som förlorad', null, 'stang');
    },
    overlamning: (f, d) => {
      const a = affar(f.dataset.affar); const pId = f.dataset.projekt;
      const underlag = {};
      UNDERLAG_FALT.forEach((x) => { underlag[x.id] = String(d.get(x.id) || '').trim(); });
      UNDERLAG_KONTROLL.forEach((x) => { underlag[x.id] = !!d.get(x.id); });
      // Något saknas: visa vad och flytta fokus dit i stället för en låst knapp utan förklaring
      if (!underlagKomplett(underlag).komplett) { const forsta = kontrolleraOverlamning(); if (forsta) { forsta.focus(); forsta.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); } return; }
      if (pId) {
        const p = projekt(pId); const fore = p.underlag || {}; p.underlag = underlag;
        if (p.underlagStatus === 'returnerat') {
          // Rundan sparas (returnerat → kompletterat, testteamets kommentar och vilka fält som ändrades) så att testteamet ser vad
          // som är nytt – fälten får data-andrad i Underlag från sälj. Tidslinjen säger fältnamnen, inga värden.
          const andrade = [...UNDERLAG_FALT.filter((x) => String(fore[x.id] || '').trim() !== underlag[x.id]), ...UNDERLAG_KONTROLL.filter((x) => !!fore[x.id] !== underlag[x.id])];
          p.underlagHistorik = [...(p.underlagHistorik || []), { returnerad: p.returnerad || null, returneradAv: p.returneradAv || null, kommentar: p.returKommentar || '', kompletterad: new Date().toISOString(), kompletteradAv: jag, andradeFalt: andrade.map((x) => x.id) }].slice(-20);
          p.underlagStatus = 'ny'; p.returKommentar = null; p.skickad = idag(); delete p.paminnd;
          stangTodos(p.kundId, /^Komplettera underlag/);
          logga(`Underlaget kompletterades och skickades till testteamet igen${andrade.length ? ` – ändrat: ${andrade.map((x) => x.etikett).join(', ')}` : ' (inga uppgifter ändrade)'}.`, { kundId: p.kundId, affarId: a.id });
        } else logga('Underlaget uppdaterades.', { kundId: p.kundId, affarId: a.id });
        spara(); ark.close(); rendera(); toast('Underlaget är skickat till testteamet', null, UPEMO.proj.underlag);
        return;
      }
      const test = db.anvandare.find((u) => u.roll === 'test' && arAktiv(u)) || anv(jag);
      a.steg = 'signerad'; a.stegAndrad = idag(); a.check = { info: true, samtycke: true, pub: true, order: true }; a.forlorad = null;
      const p = { id: nyId('j'), affarId: a.id, kundId: a.kundId, steg: 'underlag', stegAndrad: idag(), ansvarigTest: test.id, skickad: idag(), underlagStatus: 'ny', underlag };
      db.projekt.push(p);
      logga(`Order signerad – förskottsfaktura 25 % (${kr(fakturaDelar(affarVarde(a)).forskott)}).`, { kundId: a.kundId, affarId: a.id });
      logga(`Underlag skickat till testteamet (${test.kort}).`, { kundId: a.kundId, affarId: a.id });
      stangTodos(a.kundId, /^Ordern är signerad – skicka förskottsfaktura/);
      db.todos.push({ id: nyId('t'), text: 'Skicka förskottsfaktura 25 %', kundId: a.kundId, affarId: a.id, ansvarig: a.ansvarig, datum: idag(), klar: false });
      db.todos.push({ id: nyId('t'), text: 'Granska underlag och boka tid', kundId: a.kundId, affarId: a.id, projektId: p.id, ansvarig: test.id, datum: omDagar(1), klar: false });
      spara(); ark.close(); rendera();
      if (/^#\/salj/.test(location.hash)) firaVinst(a.id);
      toast('Order signerad och överlämnad till testteamet', { href: `#/projekt/${p.id}`, text: 'Visa projekt' }, UPEMO.salj.signerad, { rubrik: kundNamn(a.kundId) });
    },
    returnera: (f, d) => {
      const p = projekt(f.dataset.projekt); const kommentar = String(d.get('kommentar') || '').trim(); if (!kommentar) { felFalt(f, 'kommentar', 'Skriv vad som saknas eller är oklart'); return; }
      const a = affar(p.affarId);
      // När och av vem: statusrutan säger det, och rundan sparas i underlagHistorik när säljaren kompletterar (FORM.overlamning)
      p.underlagStatus = 'returnerat'; p.returKommentar = kommentar; p.returnerad = new Date().toISOString(); p.returneradAv = jag; delete p.paminnd;
      db.todos.push({ id: nyId('t'), text: `Komplettera underlag till testteamet: ${kommentar.slice(0, 70)}`, kundId: p.kundId, affarId: a.id, projektId: p.id, ansvarig: a.ansvarig, datum: idag(), klar: false });
      logga(`Testteamet returnerade underlaget: ${kommentar}`, { kundId: p.kundId, affarId: a.id });
      spara(); ark.close(); rendera(); toast(`Returnerat – ${anv(a.ansvarig).kort} har fått en att göra`, null, UPEMO.larm.retur);
    },
    /* Boka testdagen (steget Boka tid) eller boka om (arket från Boka om, data-omboka): datum, valfri start- och sluttid och en fråga
       till för lördag/söndag. Ombokningen ändrar inte steget, loggar "Testdagen ombokad från … till …", kan flytta projektets uppgifter
       lika många dagar och har Ångra (datum, tid, steg och uppgifterna som förut). */
    boka: (f, d) => {
      const p = projekt(f.dataset.projekt); if (!p) return;
      const datum = d.get('datum'); const start = String(d.get('start') || '').trim(); const slut = String(d.get('slut') || '').trim();
      if (!datumInom(datum, 0, 730)) { felFalt(f, 'datum', 'Välj ett testdatum från idag och högst två år framåt'); return; }
      const KLOCKA = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (start && !KLOCKA.test(start)) { felFalt(f, 'start', 'Skriv starttiden som TT:MM, t.ex. 08:30'); return; }
      if (slut && !KLOCKA.test(slut)) { felFalt(f, 'slut', 'Skriv sluttiden som TT:MM, t.ex. 15:00'); return; }
      if (slut && !start) { felFalt(f, 'start', 'Fyll i starttiden – eller töm sluttiden'); return; }
      if (start && slut && slut <= start) { felFalt(f, 'slut', 'Sluttiden ska vara efter starttiden'); return; }
      // Lördag eller söndag: en fråga till – samma datum en gång till bokar ändå
      if (helgdag(datum) && f.elements.helg && f.elements.helg.value !== datum) { f.elements.helg.value = datum; felFalt(f, 'datum', `${stor(dagText(datum))} är en helgdag – spara igen för att boka den ändå`); return; }
      const ombokning = f.hasAttribute('data-omboka') && !!p.testdatum;
      const NYCKLAR = ['steg', 'stegAndrad', 'testdatum', 'testtid'];
      const fore = Object.fromEntries(NYCKLAR.map((n) => [n, p[n] === undefined ? undefined : JSON.parse(JSON.stringify(p[n]))]));
      const testtid = start ? { start, ...(slut ? { slut } : {}) } : null;
      if (ombokning && fore.testdatum === datum && JSON.stringify(fore.testtid || null) === JSON.stringify(testtid)) { ark.close(); toast('Testdagen är oförändrad'); return; }
      p.testdatum = datum; if (testtid) p.testtid = testtid; else delete p.testtid;
      if (p.steg !== 'test') { p.steg = 'test'; p.stegAndrad = idag(); }
      // Projektets uppgifter (projektId) flyttas lika många dagar som testdagen – aldrig till före idag
      const skift = ombokning ? Math.round((tolka(datum) - tolka(fore.testdatum)) / 864e5) : 0;
      const flyttade = skift && d.get('flytta') ? projTodos(p).filter((t) => t.datum).map((t) => { const gammalt = t.datum; const nytt = omDagar(skift, t.datum); t.datum = dagarTill(nytt) < 0 ? idag() : nytt; return [t, gammalt]; }) : [];
      const tt = testtidText(p); const ttFore = fore.testtid ? testtidText({ testtid: fore.testtid }) : '';
      const flyttText = flyttade.length ? ` – ${flyttade.length === 1 ? 'uppgiften flyttades med' : `${flyttade.length} uppgifter flyttades med`}` : '';
      const akt = logga(ombokning ? `Testdagen ombokad från ${dagMan(fore.testdatum)}${ttFore ? ` ${ttFore}` : ''} till ${dagMan(datum)}${tt ? ` ${tt}` : ''}${flyttText}.`
        : `Testdag bokad ${datumText(datum, { ar: true, gemen: true })}${tt ? `, ${tt}` : ''}.`, { kundId: p.kundId, affarId: p.affarId });
      if (ark.contains(f)) ark.close();
      spara(); rendera();
      const angra = { text: 'Ångra', fn: () => {
        if (p.testdatum !== datum || p.steg !== 'test') { toast('Testdagen har ändrats igen – Ångra går inte längre', null, 'varning'); return; }
        NYCKLAR.forEach((n) => { if (fore[n] === undefined) delete p[n]; else p[n] = fore[n]; });
        flyttade.forEach(([t, gammalt]) => { t.datum = gammalt; });
        const x = db.aktiviteter.find((y) => y.id === akt.id);
        if (x) { if (!SKARP || arAdmin()) db.aktiviteter.splice(db.aktiviteter.indexOf(x), 1); else x.text = `${x.text.replace(/\.$/, '')} (ångrades).`; }
        spara(); rendera(); toast(ombokning ? `Testdagen är tillbaka på ${dagText(fore.testdatum)}` : 'Bokningen är ångrad – projektet står i Boka tid igen', null, UPEMO.proj.bokning);
      } };
      toast(ombokning ? `Testdagen är ombokad till ${dagText(datum)}${tt ? `, ${tt}` : ''}${flyttText}${p.bekraftad ? '. Skicka en ny bekräftelse till kunden' : ''}`
        : `Testdagen är bokad – ${dagText(datum)}${tt ? `, ${tt}` : ''}. Bekräfta till kunden och lägg den i kalendern`, null, UPEMO.proj.bokning, { atgard: angra });
    },
    // Test genomfört: före den bokade dagen frågar arket först (testdatumet blir idag) – registreraTest har Ångra
    genomfort: (f, d) => {
      const p = projekt(f.dataset.projekt); if (!p || p.steg !== 'test') return;
      const antal = parseInt(d.get('genomforda'), 10); if (!Number.isFinite(antal) || antal < 0) { felFalt(f, 'genomforda', 'Ange hur många som genomförde testet'); return; }
      const app = !!d.get('app'); const n = p.testdatum ? dagarTill(p.testdatum) : 0;
      if (n > 0) {
        bekrafta({ titel: 'Registrera testet före testdagen?', sym: UPEMO.proj.test, knapp: 'Ja, testet är genomfört idag', g: 'genomfort-ja', data: { projekt: p.id, genomforda: antal, app: app ? '1' : '' },
          text: `Testdagen är bokad till ${dagText(p.testdatum)} (om ${plural(n, 'dag', 'dagar')}). Registrerar du testet som genomfört nu blir testdatumet idag, ${dagMan(idag())}, och projektet går vidare till avstämning. Du kan ångra direkt efteråt.` });
        return;
      }
      registreraTest(p, antal, app);
    },
    // Avstämning: avvikelsen (genomfört − beställt) sparas på projektet och står i Ekonomi, i slutfakturans kort och i säljarens uppgift
    avstamning: (f, d) => {
      const p = projekt(f.dataset.projekt); const a = affar(p.affarId);
      const kommentar = String(d.get('kommentar') || '').trim();
      const bestallt = parseInt(projBestallt(a), 10); const diff = Number.isFinite(bestallt) ? (p.genomforda || 0) - bestallt : 0;
      const av = diff ? { diff, bestallt, genomforda: p.genomforda || 0, ...(kommentar ? { kommentar } : {}) } : null;
      p.avvikelse = av; p.steg = 'slutfaktura'; p.stegAndrad = idag();
      logga(`Avstämning klar${av ? ` – avvikelse ${avvikelseText(av)} (beställt ${bestallt}, genomfört ${av.genomforda})` : ''}${kommentar ? ': ' + kommentar : '.'}`, { kundId: p.kundId, affarId: p.affarId });
      const rest = `resterande ${Math.round((1 - PRISER.forskott) * 100)} %`;
      db.todos.push({ id: nyId('t'), text: av ? `Skicka slutfaktura (${rest}) – avvikelse ${avvikelseText(av)} mot beställt${kommentar ? `: ${kommentar.slice(0, 80)}` : ', stäm av beloppet'}` : `Skicka slutfaktura (${rest})${kommentar ? ` – ${kommentar.slice(0, 80)}` : ''}`,
        kundId: p.kundId, affarId: p.affarId, projektId: p.id, ansvarig: a.ansvarig, datum: idag(), klar: false });
      spara(); rendera(); toast(`Klar – ${anv(a.ansvarig).kort} skickar slutfakturan${av ? ` (avvikelse ${avvikelseText(av)})` : ''}`, null, UPEMO.proj.avstamning);
    },
    spinn: (f) => {
      const val = lasSpinn(f); if (val.valdaIds && !val.valdaIds.length) return;
      const a = skapaFranTest(f.dataset.projekt, { ...val, steg: 'besok' });
      spara(); ark.close(); location.hash = `#/affar/${a.id}`;
      toast('Affären är skapad och bygger på förra testet', null, UPEMO.sak.omtest);
    },
    uppfoljning: (f, d) => {
      const p = projekt(f.dataset.projekt); const text = String(d.get('text') || '').trim(); if (!text) { felFalt(f, 'text', 'Skriv kort hur mötet gick'); return; }
      p.steg = 'klar'; p.stegAndrad = idag(); p.uppfoljningDatum = idag();
      db.aktiviteter.push({ id: nyId('x'), kundId: p.kundId, affarId: p.affarId, typ: 'mote', text: `Uppföljningsmöte: ${text}`, av: jag, tid: new Date().toISOString() });
      stangTodos(p.kundId, /^Uppföljningsmöte/);
      let ny = null;
      if (d.get('omtest')) { const a = affar(p.affarId); ny = skapaFranTest(p.id, { typ: 'omtest', program: { app: a.offert.app, insights: a.offert.insights }, lank: false, steg: 'besok' }); }
      spara(); rendera(); toast(ny ? 'Projektet är klart – omtest lagt i säljtavlan' : 'Projektet är klart', ny ? { href: `#/affar/${ny.id}`, text: 'Visa affär' } : null, UPEMO.proj.klar);
    },
    uppladdning: (f, d) => {
      const kundId = f.dataset.kund || d.get('kundId'); const affarId = d.get('affarId') || null; const kategori = d.get('kategori');
      if (!kundId || !kund(kundId)) { felFalt(f, 'kundId', 'Välj vilken kund dokumentet hör till'); return; }
      if (affarId && (affar(affarId) || {}).kundId !== kundId) { felFalt(f, 'affarId', 'Affären hör till en annan kund'); return; }
      // Demoläget: filen går att öppna under sessionen (objekt-URL). Skarpt läge: filen sparas på servern.
      const lista = SKARP ? vantandeFiler.filter(filTasEmot) : vantandeFiler;
      const avvisade = vantandeFiler.length - lista.length;
      const uppladdas = [];
      lista.forEach((fil) => {
        const id = nyId('d');
        if (SKARP) uppladdas.push([id, fil]); else filer.set(id, URL.createObjectURL(fil));
        db.dokument.push({ id, kundId, affarId, kategori, namn: fil.name, storlek: fil.size, tid: new Date().toISOString(), av: jag, ...(SKARP ? { fil: true, typ: fil.type } : {}) });
        db.aktiviteter.push({ id: nyId('x'), kundId, affarId, typ: 'dokument', text: `Laddade upp ${fil.name}.`, av: jag, tid: new Date().toISOString() });
      });
      const n = lista.length; vantandeFiler = [];
      if (n) spara();
      ark.close(); rendera();
      if (n) toast(`${n} ${n === 1 ? 'dokument uppladdat' : 'dokument uppladdade'}`, null, UPEMO.sak.dokument);
      if (avvisade) toast(`${avvisade} ${avvisade === 1 ? 'fil' : 'filer'} togs inte emot – PDF, bilder, Word, Excel, PowerPoint, text och CSV upp till 25 MB går bra.`, null, 'varning');
      if (uppladdas.length) laddaUppNarSparat(uppladdas);
    },
    makulera: async (f, d) => {
      const token = f.dataset.token; const dok = db.offerter[token]; const orsak = String(d.get('orsak') || '').trim();
      if (!orsak) { felFalt(f, 'orsak', 'Skriv varför dokumentet makuleras – det sparas i loggen'); return; }
      const knapp = $('[data-g="skicka-ark"]', ark); if (knapp) knapp.disabled = true;
      const svar = await L.admin.makulera(token, orsak);
      if (!svar.ok) { if (knapp) knapp.disabled = false; toast(svar.meddelande || `${dok ? dok.nummer : 'Dokumentet'} kunde inte makuleras.`, null, 'varning'); return; }
      ark.close(); toast(`${dok ? dok.nummer : 'Dokumentet'} är makulerat – det finns kvar under Tidigare versioner`);
    },
    'registerutdrag': (f) => sokRegister(f),
    'bjud-in': async (f, d) => {
      const u = { epost: String(d.get('epost') || '').trim(), namn: String(d.get('namn') || '').trim(), roll: ['test', 'admin'].includes(d.get('roll')) ? d.get('roll') : 'salj', admin: !!d.get('admin') || d.get('roll') === 'admin', chef: !!d.get('chef') && d.get('roll') !== 'admin' };
      if (!u.epost || !u.namn) { f.reportValidity(); return; }
      const knapp = $('button[type="submit"]', f); if (knapp) knapp.disabled = true;
      const svar = await L.admin.skapa(u);
      if (knapp) knapp.disabled = false;
      if (!svar.ok) {
        if (svar.fel === 'finns') { felFalt(f, 'epost', 'Det finns redan en användare med den e-postadressen.'); return; }
        toast(svar.meddelande || 'Inbjudan kunde inte skickas.', null, 'varning'); return;
      }
      f.reset();
      toast(`Inbjudan skickad till ${u.namn}${L.lage.miljo === 'lokal' ? ' – den ligger i serverns utkorg' : ''}`, null, 'mejl');
      laddaAdmin();
    },
  };
  // Inga formulär i CRM:et skickas av webbläsaren – allt hanteras här (ersätter onsubmit="return false")
  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target.closest('form[data-form]'); if (!f) return;
    if (f.hasAttribute('data-sparar')) return; // arket väntar på servern (sparaFranArk) – Enter eller ett dubbelklick skickar inte igen
    const fn = FORM[f.dataset.form]; if (!fn) return;
    const iArk = ark.contains(f); const nyckel = utkastNyckel(f);
    const svar = fn(f, new FormData(f));
    // Sparat och stängt: utkastet behövs inte längre
    const rensa = () => { if (iArk && !ark.open) utkast.delete(nyckel); };
    if (svar && typeof svar.then === 'function') svar.then(rensa); else rensa();
  });
  // Länkrutan: markera hela länken när den får fokus (ersätter onfocus="this.select()")
  document.addEventListener('focusin', (ev) => { if (ev.target.matches && ev.target.matches('[data-markera-allt]')) ev.target.select(); });

  /* Ändringar i fält som sparas direkt */
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('[data-salj-sok]')) { saljUi.sok = t.value; uppdateraSaljYta(); return; }
    if (t.matches('[data-kund-sok]')) { kundUi.sok = t.value; kundUppdatera(); return; }
    if (t.matches('[data-dok-sok]')) { dokUi.sok = t.value; dokUppdatera(); return; }
    if (t.matches('[data-ml-falt]')) { mallAndrat(t); return; }
    if (t.closest('form[data-form="overlamning"]')) { kontrolleraOverlamning(); return; }
    if (t.closest('form[data-form="ny-affar"]')) { uppdateraNyAffarPris(); return; }
    if (t.matches('form[data-form="snabb-kund"] [name="namn"]')) { visaDubblett(t); return; }
    if (t.matches('form[data-form$="-kontakt"] [name="epost"]')) { visaKontaktDubblett(t.form); return; }
    if (t.closest('[data-offert-form]')) { uppdateraOffert(t.closest('[data-offert-form]')); return; }
    if (t.matches('[data-offert-coaching]')) {
      const a = affar(t.dataset.offertCoaching); if (lastOffert(a)) return;
      a.offert.antal = Math.max(1, parseInt(t.value, 10) || 1); spara(); uppdateraPris(a);
      const chip = t.closest('.kort-inre') && t.closest('.kort-inre').querySelector('.chip'); if (chip) chip.innerHTML = `${ik('kompass')}Uppföljning &amp; coaching · ${plural(a.offert.antal, 'deltagare', 'deltagare')} × ${kr(PRISER.uppfoljning)}`;
      return;
    }
    if (t.matches('[data-offert-eget]')) { const a = affar(t.dataset.offertEget); if (lastOffert(a)) return; a.offert.eget = Math.max(0, parseInt(t.value, 10) || 0); spara(); uppdateraPris(a); return; }
    if (t.matches('[data-sok-falt]')) sok(t.value);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    // Testdagslistans närvarokryss: sparas direkt på projektet (p.narvaro) – vyn bakom arket ritas om när arket stängs
    if (t.matches('[data-narvaro]')) {
      const p = projekt(t.dataset.narvaro); if (!p) return;
      const n = { ...(p.narvaro || {}) }; if (t.checked) n[t.value] = true; else delete n[t.value];
      p.narvaro = n; spara(); ritaSenare = true;
      const alla = $$('[data-narvaro]', ark); const r = $('[data-tdl-rakna]', ark); const k = alla.filter((x) => x.checked).length;
      if (r) { r.textContent = `${k} av ${alla.length} närvarande`; r.classList.toggle('chip-is', k > 0); }
      return;
    }
    if (t.closest('form[data-form="overlamning"]')) { kontrolleraOverlamning(); return; }
    if (t.closest('form[data-form="ny-affar"]')) { uppdateraNyAffarPris(); return; }
    if (t.matches('form[data-form="snabb-kund"] [name="typ"]')) { const f = t.closest('form'); const klubb = t.value === 'klubb'; $$('[data-bara-foretag]', f).forEach((x) => { x.hidden = klubb; }); $$('[data-bara-klubb]', f).forEach((x) => { x.hidden = !klubb; }); return; }
    if (t.matches('form[data-form="snabb-anteckning"] [name="folj"], form[data-form="mote-logg"] [name="folj"]')) { snabbFoljSynk(t.closest('form')); return; }
    if (t.matches('form[data-form="starta-mote"] [name="bild"]')) { raknaBildval(t.closest('form')); return; }
    if (t.closest('[data-offert-form]')) { uppdateraOffert(t.closest('[data-offert-form]')); return; }
    if (t.matches('[data-check]')) {
      const a = affar(t.dataset.check);
      // Låst affär (signerad eller förlorad): kontrollpunkterna ändras inte och en förlorad affär återöppnas aldrig av en bock
      if (lastOffert(a)) { t.checked = !t.checked; return; }
      a.check = { ...(a.check || {}), [t.value]: t.checked };
      if (t.checked) logga(`${t.closest('label').querySelector('span').firstChild.textContent.trim()} ✓`, { kundId: a.kundId, affarId: a.id });
      if (t.checked && a.steg !== 'underlag' && saljStegIndex(a.steg) >= 0 && saljStegIndex(a.steg) < saljStegIndex('underlag') && ['info', 'samtycke', 'pub'].includes(t.value)) { a.steg = 'underlag'; a.stegAndrad = idag(); spara(); rendera(); toast('Affären flyttad till Underlag & samtycke', null, UPEMO.salj.underlag); return; }
      spara(); rendera();
      const ruta = $(`input[data-check="${sel(a.id)}"][value="${sel(t.value)}"]`, vy); if (ruta) ruta.focus({ preventScroll: true });
      return;
    }
    if (t.closest('[data-offert-program]')) { const f = t.closest('[data-offert-program]'); const a = affar(f.dataset.offertProgram); if (lastOffert(a)) return; const d = new FormData(f); a.offert = { ...a.offert, app: !!d.get('app'), insights: !!d.get('insights'), uppfoljning: a.offert.typ === 'uppfoljning' ? false : !!d.get('uppfoljning') }; spara(); uppdateraPris(a); return; }
    if (t.closest('form[data-form="spinn"]')) { uppdateraSpinn(); return; }
    if (t.matches('[data-salj-ordning]')) { saljUi.ordning = t.value; uppdateraSaljYta(); return; }
    const valjareIgen = (q) => { const v = $(q, vy); const k = v && (v._valjKnapp || v); if (k) k.focus({ preventScroll: true }); };
    if (t.matches('[data-affar-ansvarig]')) { const a = affar(t.dataset.affarAnsvarig); a.ansvarig = t.value; logga(`Ansvarig säljare: ${anv(t.value).namn}.`, { kundId: a.kundId, affarId: a.id }); spara(); rendera(); valjareIgen(`[data-affar-ansvarig="${sel(a.id)}"]`); toast(`Ansvarig säljare är nu ${anv(t.value).namn}`); return; }
    if (t.matches('[data-proj-ansvarig]')) { const p = projekt(t.dataset.projAnsvarig); p.ansvarigTest = t.value; logga(`Testansvarig: ${anv(t.value).namn}.`, { kundId: p.kundId, affarId: p.affarId }); spara(); rendera(); valjareIgen(`[data-proj-ansvarig="${sel(p.id)}"]`); toast(`Testansvarig är nu ${anv(t.value).namn}`); return; }
    if (t.matches('[data-klubbform]')) { const k = kund(t.dataset.klubbform); k.klubbavtal.form = t.value; logga(`Utbetalningsform för provision: ${UTBETALNING[t.value]}.`, { kundId: k.id }); spara(); rendera(); toast('Utbetalningsformen är sparad', null, UPEMO.sak.klubb); return; }
    if (t.matches('[data-anvandarval]')) { if (!SKARP) bytAnvandare(t.value); return; }
    if (t.matches('[data-logg-f]')) {
      // Adminloggens filter: person, kund, datum och hämtningarna – servern filtrerar, första sidan hämtas om
      const f = t.dataset.loggF;
      if (f === 'hamtningar') adminUi.loggF.hamtningar = t.checked;
      else if (f === 'fran' || f === 'till') {
        const v = /^\d{4}-\d{2}-\d{2}$/.test(t.value) ? t.value : '';
        adminUi.loggF[f] = v;
        const annan = $(`[data-logg-f="${f === 'fran' ? 'till' : 'fran'}"]`, vy);
        if (annan) annan.setAttribute(f === 'fran' ? 'min' : 'max', v || (f === 'fran' ? '' : idag()));
        if (annan && f === 'fran' && !v) annan.removeAttribute('min');
      } else adminUi.loggF[f] = t.value;
      ritaAdmin(); laddaLoggOm();
      return;
    }
    if (t.matches('[data-anv-roll]')) { const u = (adminUi.anvandare || []).find((x) => x.id === t.dataset.anvRoll); const roll = ['test', 'admin'].includes(t.value) ? t.value : 'salj'; uppdateraAnvandare(t.dataset.anvRoll, { roll }, `${u ? u.namn : 'Användaren'} är nu ${roll === 'test' ? 'Testteam' : roll === 'admin' ? 'Admin (systemkonto, inte säljare)' : 'Sälj'}`); return; }
    if (t.matches('[data-anv-chef]')) { const u = (adminUi.anvandare || []).find((x) => x.id === t.dataset.anvChef); uppdateraAnvandare(t.dataset.anvChef, { chef: t.checked }, t.checked ? `${u ? u.namn : 'Användaren'} är nu försäljningschef` : `${u ? u.namn : 'Användaren'} är inte längre försäljningschef`); return; }
    if (t.matches('[data-anv-admin]')) { const u = (adminUi.anvandare || []).find((x) => x.id === t.dataset.anvAdmin); uppdateraAnvandare(t.dataset.anvAdmin, { admin: t.checked }, t.checked ? `${u ? u.namn : 'Användaren'} är nu administratör` : `${u ? u.namn : 'Användaren'} är inte längre administratör`); return; }
    // Kundmötet: ny kund → kundens enda affär med live-kalkyl väljs (valjMoteKund har redan satt moteUi när ett kort klickades)
    if (t.matches('[data-mote-kund]')) { if (t.value !== moteUi.kundId) { moteUi.kundId = t.value; moteUi.fokus = ''; moteUi.affarId = moteAffarFor(t.value, null) || ''; } moteUppdatera(); return; }
    if (t.matches('[data-mote-affar]')) { moteUi.affarId = t.value; moteUi.fokus = ''; moteUppdatera(); return; }
    if (t.matches('[data-ml-val]')) { mallValt(t.value); return; }
    if (t.matches('[data-ml-falt]')) { mallAndrat(t); return; }
    if (t.matches('[data-dok-sortera]')) { dokUi.sortera = t.value; dokUppdatera(true); return; }
    if (t.matches('[data-dok-gruppera]')) { dokUi.gruppera = t.value; dokUppdatera(true); return; }
    // Uppladdning utan förvald kund (Dokument): kundens affärer i listan när kunden väljs – den enda öppna förvald
    if (t.matches('[data-uppl-kund]')) { const s = $('[data-uppl-affar]', t.form); const oppna = affarerFor(t.value).filter(arOppen); if (s) s.innerHTML = uppladdAffarer(t.value, oppna.length === 1 ? oppna[0].id : ''); return; }
    if (t.matches('[data-uppladdning-falt]')) { const z = t.closest('[data-uppladdning]'); oppnaUppladdning(t.files, z.dataset.kund, z.dataset.affar, z.dataset.kategori); t.value = ''; }
  });
  // Ny kund: varna när namnet redan finns (räknat ur kundregistret)
  /* Kontaktpersoner: samma formulär för ny och ändra. Namn krävs; e-post och telefon kontrolleras när de är ifyllda.
     Dubbletter: samma namn eller e-post på kunden stoppar (öppna den befintliga i stället), samma e-post hos en annan kund
     visas som en upplysning med länk – en person kan ha bytt jobb. */
  const telOk = (t) => { const v = String(t || '').trim(); if (!v) return true; const n = v.replace(/\D/g, '').length; return /^[+\d\s()\-–]+$/.test(v) && n >= 7 && n <= 15; };
  const kontaktFel = (k, c, utom) => {
    const fel = {}; const namn = String(c.namn || '').trim(); const epost = String(c.epost || '').trim().toLowerCase();
    const andra = (k.kontakter || []).filter((x) => x.id !== utom);
    if (!namn) fel.namn = 'Skriv kontaktpersonens namn';
    else if (namn.length < 2) fel.namn = 'Namnet behöver minst två tecken';
    else { const lika = andra.find((x) => String(x.namn || '').trim().toLowerCase() === namn.toLowerCase()); if (lika) fel.namn = `${lika.namn} finns redan som kontakt på ${k.namn}`; }
    if (epost && !EPOST_MONSTER.test(epost)) fel.epost = 'Skriv en giltig e-postadress, t.ex. namn@foretag.se';
    else if (epost) { const lika = andra.find((x) => String(x.epost || '').trim().toLowerCase() === epost); if (lika) fel.epost = `${lika.namn} har redan den e-postadressen`; }
    if (!telOk(c.tel)) fel.tel = 'Telefonnumret ser inte rätt ut – siffror, mellanslag och + går bra';
    return fel;
  };
  // Samma e-post hos en annan kund (upplysning, stoppar inte)
  const kontaktAnnanKund = (k, epost) => { const m = String(epost || '').trim().toLowerCase(); if (!m || !EPOST_MONSTER.test(m)) return null;
    for (const x of db.kunder) { if (x.id === k.id) continue; const c = (x.kontakter || []).find((y) => String(y.epost || '').trim().toLowerCase() === m); if (c) return { k: x, c }; } return null; };

  /* Samtidiga ändringar i ett ark (Ändra kontaktperson, Ändra uppgifter). Arket minns värdena när det öppnades (data-fore).
     När man sparar skrivs bara fälten man själv har ändrat – en kollegas ändring av ett annat fält står kvar (förut skrev
     arket tillbaka alla fält och kollegans nya telefon försvann tyst). Sparar en kollega medan arket är öppet visar fält man
     inte rört det nya värdet direkt (synkaOppetArk); har båda ändrat samma fält visas krocken vid fältet: "Magnus ändrade
     telefonen till … – Behåll din / Ta deras". Skarpt läge: arket står kvar tills servern har sparat (sparaFranArk). */
  const KONTAKT_FALT = ['namn', 'roll', 'tel', 'epost'];
  const kundFalt = (k) => ({ namn: k.namn, bransch: k.bransch, stad: k.stad, orgnr: k.orgnr, anstallda: k.anstallda, ...(k.klubbavtal ? { procent: k.klubbavtal.procent, partners: k.klubbavtal.partners || 0 } : {}) });
  const kundFaltNamn = (k) => ['namn', 'bransch', 'stad', 'orgnr', 'anstallda', ...(k.typ === 'klubb' && k.klubbavtal ? ['procent', 'partners'] : [])];
  const ARK_FALT = {
    'andra-kontakt': {
      nu: (f) => { const k = kund(f.dataset.kund); const c = k && (k.kontakter || []).find((x) => x.id === f.dataset.id); return c ? arkVarden(c, KONTAKT_FALT) : null; },
      namn: () => ({ namn: 'namnet', roll: 'rollen', tel: 'telefonen', epost: 'e-postadressen' }),
    },
    'andra-kund': {
      nu: (f) => { const k = kund(f.dataset.kund); return k ? arkVarden(kundFalt(k), Object.keys(foreVarden(f))) : null; },
      namn: (f) => { const klubb = (kund(f.dataset.kund) || {}).typ === 'klubb'; return { namn: 'namnet', bransch: klubb ? 'idrotten' : 'branschen', stad: 'orten', orgnr: 'org.nr', anstallda: klubb ? 'antalet spelare och ledare' : 'antalet anställda', procent: 'provisionen', partners: 'antalet partners' }; },
    },
  };
  // fore = när arket öppnades, mitt = formuläret, nu = posten just nu → fälten som ska skrivas och fälten som krockar
  function slaIhopFalt(fore, mitt, nu, falt) {
    const bas = Object.keys(fore).length ? fore : nu; const satt = {}; const krockar = [];
    falt.forEach((x) => {
      if (!(x in mitt) || likaVarde(mitt[x], bas[x])) return; // inte ändrat i arket – det som gäller nu står kvar
      if (likaVarde(nu[x], bas[x]) || likaVarde(nu[x], mitt[x])) satt[x] = mitt[x];
      else krockar.push({ falt: x, deras: String(nu[x] ?? '') });
    });
    return { satt, krockar };
  }
  // Vem som sparade kunden senast (skarpt läge, serverns andradAv): kollegans förnamn, 'Du' (en annan flik) eller null
  const vemAndrade = (kundId) => {
    const v = L.senastAndrad ? L.senastAndrad('kunder', kundId) : null; if (!v) return null; if (v === jag) return 'Du';
    const u = db.anvandare.find((x) => x.id === v); return u ? u.kort || u.namn : null;
  };
  const krockRad = (vem, namn, deras) => {
    const vad = deras ? `ändrade ${namn} till ”${deras}”` : `tog bort ${namn}`;
    return vem === 'Du' ? `Du ${vad} i en annan flik.` : `${vem || 'Någon annan'} ${vad} medan du hade arket öppet.`;
  };
  function visaKrockar(f, krockar, { fokus = true } = {}) {
    const def = ARK_FALT[f.dataset.form]; const namn = def ? def.namn(f) : {}; const vem = vemAndrade(f.dataset.kund);
    let forsta = null;
    krockar.forEach(({ falt: x, deras }) => {
      const falt = f.elements[x]; if (!falt) return;
      const gammal = $(`[data-krock="${sel(x)}"]`, f); if (gammal) gammal.remove();
      // Under fältets rad (en rad med två fält får rutorna efter varandra) – fältet pekar på rutan
      let efter = falt.closest('.falt-rad') || falt.closest('label') || falt;
      while (efter.nextElementSibling && efter.nextElementSibling.matches('[data-krock]')) efter = efter.nextElementSibling;
      const id = `krock-${x}-${Math.random().toString(36).slice(2, 7)}`;
      efter.insertAdjacentHTML('afterend', `<div class="falt-krock" data-krock="${e(x)}" data-deras="${e(deras)}" id="${id}" role="alert">${ik('varning')}<p>${e(krockRad(vem, namn[x] || x, deras))}</p>
        <div class="falt-krock-val"><button class="knapp knapp-spok knapp-liten" type="button" data-g="krock-val" data-val="min">Behåll din</button><button class="knapp knapp-spok knapp-liten" type="button" data-g="krock-val" data-val="deras">Ta deras</button></div></div>`);
      falt.setAttribute('data-krock-falt', ''); falt.setAttribute('aria-describedby', id);
      if (!forsta) forsta = $(`#${sel(id)} button`, f);
    });
    if (fokus && forsta) forsta.focus();
  }
  // En kollega sparade medan arket var öppet: fält man inte rört tar in det nya värdet (med en rad om det), och har man
  // själv ändrat samma fält visas krocken direkt. Inte medan arket sparar – då är den lokala posten ens egen ändring.
  function synkaOppetArk() {
    const f = ark.open && $('form[data-fore]', ark); if (!f || f.hasAttribute('data-sparar')) return;
    const def = ARK_FALT[f.dataset.form]; const nu = def && def.nu(f); if (!nu) return;
    const fore = foreVarden(f); const krockar = []; let andrat = false;
    Object.keys(fore).forEach((x) => {
      const falt = f.elements[x]; if (!falt || likaVarde(nu[x], fore[x])) return;
      if (likaVarde(falt.value, fore[x])) { falt.value = nu[x]; markeraUppdaterad(f, falt, vemAndrade(f.dataset.kund)); fore[x] = nu[x]; andrat = true; }
      else if (likaVarde(falt.value, nu[x])) { fore[x] = nu[x]; andrat = true; } // kollegan skrev samma sak
      else if (!$(`[data-krock="${sel(x)}"]`, f)) krockar.push({ falt: x, deras: nu[x] });
    });
    if (andrat) f.dataset.fore = JSON.stringify(fore);
    if (krockar.length) visaKrockar(f, krockar, { fokus: false });
  }
  function markeraUppdaterad(f, falt, vem) {
    const ankare = falt.closest('.antal-falt') || falt; const plats = falt.closest('label') || ankare.parentElement;
    const gammal = $('[data-uppdaterad]', plats); if (gammal) gammal.remove();
    ankare.insertAdjacentHTML('afterend', `<p class="falt-hint falt-uppdaterad" data-uppdaterad>${ik('info')}<span>${e(vem === 'Du' ? 'Ändrat i en annan flik just nu' : vem ? `Uppdaterat av ${vem} just nu` : 'Uppdaterat just nu')}</span></p>`);
    falt.addEventListener('input', () => { const p = $('[data-uppdaterad]', plats); if (p) p.remove(); }, { once: true });
  }
  /* Spara från ett ark. Demoläget: direkt. Skarpt läge: arket står kvar med "Sparar …" tills servern har svarat, och
     bekräftelsen visas först när det är sparat (förut kom "… är uppdaterad" och strax efter "Ändringen sparades inte").
     Krock – en kollega hann spara samma kund först: lagret har lagt in kollegans version, och igen() slår ihop på nytt
     mot den (sparar igen eller visar krocken vid fältet). Krocken som arket själv tar hand om ger ingen toast (arkSparar). */
  let arkSparar = null; // { form, poster: Set('samling\0id') }
  function sparaFranArk(f, { poster = [], klar, igen }) {
    const lofte = spara();
    const stang = () => { if (ark.open && ark.contains(f)) ark.close(); rendera(); };
    if (!SKARP) { stang(); klar(); return lofte; }
    const knapp = $('.ark-fot [data-g="skicka-ark"]', ark); const text = knapp ? knapp.innerHTML : '';
    f.setAttribute('data-sparar', '');
    if (knapp) { knapp.setAttribute('aria-disabled', 'true'); knapp.setAttribute('data-sparar', ''); knapp.innerHTML = `${ik('klocka')}Sparar …`; }
    const detta = { form: f, poster: new Set(poster.filter((p) => p && p[1]).map(([s, id]) => `${s}\u0000${id}`)) }; arkSparar = detta;
    return lofte.then((svar) => {
      if (arkSparar === detta) arkSparar = null;
      f.removeAttribute('data-sparar');
      if (knapp && knapp.isConnected) { knapp.removeAttribute('aria-disabled'); knapp.removeAttribute('data-sparar'); knapp.innerHTML = text; }
      const kvar = ark.open && ark.contains(f);
      if (svar && svar.ok) { stang(); klar(); return null; }
      const forsok = Number(f.dataset.forsok || 0);
      if (svar && svar.fel === 'krock' && kvar && forsok < 3) { f.dataset.forsok = String(forsok + 1); return igen(); }
      // Nätverksfel: ändringen ligger kvar och sparas när servern svarar (sparstatusen och lagret säger det)
      if (!svar || svar.status === 0 || svar.status >= 500) { stang(); return null; }
      // Annat (ej tillåtet, ogiltigt): lagret har lagt tillbaka serverns läge och säger varför – det man skrev står kvar i arket
      if (!kvar) rendera();
      return null;
    });
  }
  // Kontaktpersonens ändring i klartext för tidslinjen: "telefon 070-… → 070-…, roll HR-chef → Personalchef"
  const KONTAKT_ETIKETT = { namn: 'namn', roll: 'roll', tel: 'telefon', epost: 'e-post' };
  const kontaktAndrat = (fore, efter) => KONTAKT_FALT.filter((x) => !likaVarde(fore[x], efter[x])).map((x) => {
    const a = String(fore[x] ?? '').trim().slice(0, 80); const b = String(efter[x] ?? '').trim().slice(0, 80);
    return !a ? `${KONTAKT_ETIKETT[x]} ${b} lades till` : !b ? `${KONTAKT_ETIKETT[x]} ${a} togs bort` : `${KONTAKT_ETIKETT[x]} ${a} → ${b}`;
  });
  function oppnaKontakt(kundId, kontaktId = '') {
    const k = kund(kundId); if (!k) return;
    const c = kontaktId ? (k.kontakter || []).find((x) => x.id === kontaktId) : null; if (kontaktId && !c) return;
    const v = c || { namn: '', roll: '', tel: '', epost: '' };
    oppnaArk(`${arkHuvud(c ? 'Ändra kontaktperson' : 'Ny kontaktperson', k.namn, UPEMO.sak.kontakt)}
      <form data-form="${c ? 'andra-kontakt' : 'ny-kontakt'}" data-kund="${e(k.id)}" data-id="${e(c ? c.id : '')}"${c ? ` data-fore="${e(JSON.stringify(arkVarden(c, KONTAKT_FALT)))}"` : ''} class="ark-kropp" novalidate>
        <div class="falt-rad"><label><span class="etikett">Namn<span class="krav">*</span></span><input class="falt" name="namn" value="${e(v.namn)}" required autocomplete="off" data-fel="Skriv kontaktpersonens namn"></label><label><span class="etikett">Roll</span><input class="falt" name="roll" value="${e(v.roll || '')}" placeholder="T.ex. HR-chef"></label></div>
        <div class="falt-rad"><label><span class="etikett">Telefon</span><input class="falt" type="tel" name="tel" value="${e(v.tel || '')}" inputmode="tel" autocomplete="off" placeholder="070-123 45 67"></label><label><span class="etikett">E-post</span><input class="falt" type="email" name="epost" value="${e(v.epost || '')}" inputmode="email" autocomplete="off" placeholder="namn@foretag.se"></label></div>
        <p class="falt-hint dubblett" data-kontakt-dubblett hidden></p></form>
      <div class="ark-fot">${c ? `<button class="knapp knapp-fara knapp-liten ark-fot-vanster" type="button" data-g="radera-kontakt" data-kund="${e(k.id)}" data-id="${e(c.id)}">${ik('papperskorg')}Ta bort</button>` : ''}<button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${c ? `${ik('bock')}Spara` : `${ik('plus')}Lägg till`}</button></div>`);
  }
  /* Kundens uppgifter: namn, bransch/idrott, ort, org.nr och antal – för en klubb också provisionen och nätverkets storlek
     (klubbavtal.partners, som Klubbmotorn räknar med). Är org.nr tomt föreslås det ur ett inskickat kundunderlag. */
  function oppnaKunduppgifter(kundId) {
    const k = kund(kundId); if (!k) return;
    const klubb = k.typ === 'klubb';
    const lf = (() => { const l = Object.values(db.kundlankar || {}).filter((x) => { const a = affar(x.affarId); return a && a.kundId === k.id && x.status === 'inskickad' && x.foretag && x.foretag.orgnr; })
      .sort((x, y) => String(y.inskickad || '').localeCompare(String(x.inskickad || '')))[0]; return l ? l.foretag : null; })();
    const forslagOrg = !k.orgnr && lf ? lf.orgnr : '';
    oppnaArk(`${arkHuvud('Ändra uppgifter', k.namn, klubb ? UPEMO.kundtyp.klubb : UPEMO.kundtyp.foretag)}
      <form data-form="andra-kund" data-kund="${e(k.id)}" data-fore="${e(JSON.stringify(arkVarden(kundFalt(k), kundFaltNamn(k))))}" class="ark-kropp" novalidate>
        <label><span class="etikett">Namn<span class="krav">*</span></span><input class="falt" name="namn" value="${e(k.namn)}" required autocomplete="off" data-fel="Skriv ${klubb ? 'klubbens' : 'företagets'} namn"></label>
        <div class="falt-rad"><label><span class="etikett">${klubb ? 'Idrott' : 'Bransch'}</span><input class="falt" name="bransch" value="${e(k.bransch || '')}" autocomplete="off"></label><label><span class="etikett">Ort</span><input class="falt" name="stad" value="${e(k.stad || '')}" autocomplete="off"></label></div>
        <div class="falt-rad"><label><span class="etikett">Organisationsnummer</span><input class="falt" name="orgnr" value="${e(k.orgnr || forslagOrg)}" inputmode="numeric" placeholder="NNNNNN-NNNN" autocomplete="off"></label><label><span class="etikett">${klubb ? 'Spelare och ledare' : 'Anställda'}</span><input class="falt" type="number" name="anstallda" min="0" max="1000000" step="1" value="${e(k.anstallda ?? '')}"></label></div>
        ${forslagOrg ? '<p class="falt-hint">Org.nr är förifyllt från det inskickade kundunderlaget – kontrollera och spara.</p>' : ''}
        ${klubb && k.klubbavtal ? `<div class="falt-rad"><label><span class="etikett">Provision till klubben (%)</span><input class="falt" type="number" name="procent" min="0" max="50" step="1" value="${e(k.klubbavtal.procent)}"></label><label><span class="etikett">Partners i nätverket</span><input class="falt" type="number" name="partners" min="0" max="100000" step="1" value="${e(k.klubbavtal.partners || 0)}"></label></div>
        <p class="falt-hint">En ändrad procent gäller öppna och nya affärer – signerade affärer behåller provisionen de signerades med.</p>` : ''}
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara</button></div>`);
  }
  function visaKontaktDubblett(f) {
    const p = $('[data-kontakt-dubblett]', f); const k = kund(f.dataset.kund); if (!p || !k) return;
    const annan = kontaktAnnanKund(k, f.elements.epost.value);
    p.hidden = !annan;
    p.innerHTML = annan ? `${ik('info')}<span>${e(annan.c.namn)} hos <a href="#/kund/${e(annan.k.id)}">${e(annan.k.namn)}</a> har samma e-postadress. Lägg till ändå om det är rätt person på ${e(k.namn)}.</span>` : '';
  }
  // Ny och ändrad kontakt hamnar i kundens tidslinje (som borttagen kontakt och ändrade uppgifter) – vem som ändrade står på händelsen
  function sparaKontakt(f, d) {
    const k = kund(f.dataset.kund); if (!k) { ark.close(); return null; }
    const utom = f.dataset.id || null; const mitt = arkVarden({ namn: d.get('namn'), roll: d.get('roll'), tel: d.get('tel'), epost: d.get('epost') }, KONTAKT_FALT);
    k.kontakter = k.kontakter || [];
    const x = utom ? k.kontakter.find((y) => y.id === utom) : null;
    if (utom && !x) { ark.close(); toast(`Kontakten finns inte längre på ${k.namn} – någon har tagit bort den`, null, 'varning'); return null; }
    // Ändra: bara det man ändrat i arket skrivs, och samma fält ändrat av en kollega visas som krock vid fältet
    let c = mitt; let satt = mitt;
    if (x) {
      const nu = arkVarden(x, KONTAKT_FALT); const ihop = slaIhopFalt(foreVarden(f), mitt, nu, KONTAKT_FALT);
      if (ihop.krockar.length) { visaKrockar(f, ihop.krockar); return null; }
      satt = ihop.satt; c = { ...nu, ...satt };
    }
    const fel = kontaktFel(k, c, utom); const forsta = ['namn', 'tel', 'epost'].find((y) => fel[y]);
    ['namn', 'tel', 'epost'].forEach((y) => { if (fel[y]) felFalt(f, y, fel[y], { fokus: y === forsta }); });
    if (forsta) return null;
    let akt;
    if (x) {
      const andrat = kontaktAndrat(arkVarden(x, KONTAKT_FALT), c);
      if (!andrat.length) { ark.close(); toast('Inget ändrades', null, UPEMO.sak.kontakt); return null; }
      const namnFore = x.namn || c.namn;
      Object.assign(x, satt);
      akt = logga(`Kontaktpersonen ${namnFore}: ${andrat.join(', ')}.`, { kundId: k.id });
    } else {
      k.kontakter.push({ id: nyId('p'), ...mitt });
      akt = logga(`Kontaktpersonen ${mitt.namn}${mitt.roll ? ` (${mitt.roll})` : ''} lades till.`, { kundId: k.id });
    }
    return sparaFranArk(f, { poster: [['kunder', k.id], ['aktiviteter', akt.id]], klar: () => toast(`${c.namn} är ${x ? 'uppdaterad' : 'tillagd'}`, null, UPEMO.sak.kontakt), igen: () => sparaKontakt(f, new FormData(f)) });
  }
  // Ta bort kund: vad som hindrar (annat bygger på kunden) och vad som följer med (kundens egna poster)
  const kanRaderaKund = () => !SKARP || arAdmin();
  function kundBeroenden(k) {
    const fel = affarerFor(k.id).filter(felregistrerad).length; const af = affarerFor(k.id).length - fel; const pr = db.projekt.filter((p) => p.kundId === k.id).length;
    const dok = Object.values(db.offerter || {}).filter((d) => d.kundId === k.id).length;
    const lankar = Object.values(db.kundlankar || {}).filter((l) => { const a = affar(l.affarId); return a && a.kundId === k.id; }).length;
    const partners = db.kunder.filter((x) => x.viaKlubb === k.id).length;
    const hinder = [af && plural(af, 'affär', 'affärer'), pr && plural(pr, 'projekt', 'projekt'), dok && plural(dok, 'offert eller order', 'offerter och ordrar'), lankar && plural(lankar, 'kundlänk', 'kundlänkar'), partners && plural(partners, 'introducerad partner', 'introducerade partners')].filter(Boolean);
    const akt = db.aktiviteter.filter((x) => x.kundId === k.id).length; const td = db.todos.filter((t) => t.kundId === k.id).length; const filer = db.dokument.filter((d) => d.kundId === k.id).length;
    const foljer = [fel && plural(fel, 'felregistrerad affär', 'felregistrerade affärer'), akt && plural(akt, 'aktivitet', 'aktiviteter'), td && plural(td, 'att göra', 'att göra'), filer && plural(filer, 'dokument', 'dokument')].filter(Boolean);
    return { hinder, foljer };
  }

  /* Dubblettkontrollen: namnen jämförs utan skillnad i versaler och mellanslag och utan bolagsformen i slutet –
     "Bergmark  Bygg AB " och "Bergmark Bygg Aktiebolag" är samma som "Bergmark Bygg AB". Samma namn stoppar Skapa
     (FORM snabb-kund) med Öppna och Skapa ändå; ett namn som bara liknar ett annat (ingår i det) ger en upplysning. */
  const namnNyckel = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s,.]+(ab|aktiebolag|hb|handelsbolag|kb|kommanditbolag)\.?(\s*\(publ\))?$/u, '').trim();
  function visaDubblett(falt, { stopp = false } = {}) {
    const f = falt.closest('form'); const p = $('[data-dubblett]', f); if (!p) return;
    if (f.elements.anda) f.elements.anda.value = '';
    const q = namnNyckel(falt.value);
    const traff = q.length >= 3 ? db.kunder.find((k) => namnNyckel(k.namn) === q) || (q.length >= 5 ? db.kunder.find((k) => namnNyckel(k.namn).includes(q)) : null) : null;
    const lika = !!traff && namnNyckel(traff.namn) === q;
    p.hidden = !traff;
    // Stoppet: felraden vid fältet säger att kunden finns – här bara frågan och de två vägarna
    p.innerHTML = !traff ? '' : lika && stopp ? `${ik('info')}<span>Är det samma kund? <a href="#/kund/${e(traff.id)}">Öppna ${e(traff.namn)}</a> · <button class="dubblett-knapp" type="button" data-g="snabb-kund-anda">Skapa ändå</button></span>`
      : `${ik('info')}<span>${lika ? 'Det finns redan en kund som heter' : 'Liknar'} <strong>${e(traff.namn)}</strong> – <a href="#/kund/${e(traff.id)}">Öppna</a></span>`;
  }

  function uppdateraOffert(form) {
    const a = affar(form.dataset.offertForm); if (lastOffert(a)) return; const d = new FormData(form);
    a.offert = { paket: d.get('paket'), antal: Math.max(1, parseInt(d.get('antal'), 10) || 1), tillval: d.getAll('tillval'), app: !!d.get('app'), insights: !!d.get('insights'), uppfoljning: !!d.get('uppfoljning') };
    const pr = prisa(a.offert);
    $$('input[name="tillval"]', form).forEach((inp) => {
      const ingar = pr.ingar.has(inp.value); const rad = inp.closest('.kryss');
      rad.toggleAttribute('data-ingar', ingar); inp.disabled = ingar; if (ingar) inp.checked = false;
      const tv = PRISER.tillval[inp.value];
      $(`[data-tv-pris="${sel(inp.value)}"]`, form).textContent = ingar ? 'Ingår' : tv.pris == null ? 'Offert' : kr(tv.pris);
    });
    // Alla tillval ingår (Bas++): visa en rad i stället för en vägg av låsta rutor – rutorna finns kvar
    const allaIngar = Object.keys(PRISER.tillval).every((id) => pr.ingar.has(id));
    const rad = $('[data-tillval-alla]', form); const rutnat = $('[data-tillval-rutnat]', form);
    if (rad && rutnat) { if (allaIngar && rad.hidden) { rad.hidden = false; rutnat.hidden = true; } else if (!allaIngar) { rad.hidden = true; rutnat.hidden = false; } const pn = $('[data-tillval-paket]', rad); if (pn) pn.textContent = (PRISER.paket[a.offert.paket] || {}).namn || ''; }
    a.offert.tillval = $$('input[name="tillval"]:checked', form).map((x) => x.value);
    spara(); uppdateraPris(a);
  }
  // Affärsvärdet, dokumentkortet och kickbacken uppdateras direkt när offerten ändras – med en kort markering
  function uppdateraPris(a) {
    const p = $('[data-affar-pris]'); if (p) p.innerHTML = prisHtml(a);
    const v = $('[data-affar-varde]'); if (v) { v.dataset.tal = String(affarVarde(a)); v.textContent = kr(affarVarde(a)); } // data-tal stoppar en pågående uppräkning
    const dok = $('[data-affar-dok]', vy);
    if (dok) { const ny = dokumentKortHtml(a); if (ny && ny !== senastKort.dok) { const forsta = !senastKort.dok; senastKort.dok = ny; if (!forsta || dokAndradNagon(a)) { dok.outerHTML = ny; lysUpp('[data-affar-dok]'); } } }
    const kb = $('[data-affar-kb]', vy);
    if (kb) { const ny = kb.hasAttribute('data-af-kb') ? affarKbHtml(a) : kickbackHtml(a); if (ny !== senastKort.kb) { senastKort.kb = ny; kb.outerHTML = ny; lysUpp('[data-affar-kb]'); } }
  }
  const senastKort = { dok: '', kb: '' };
  const dokAndradNagon = (a) => ['offert', 'order'].some((t) => { const d = dokFor(a.id, t); return d && dokAndrad(d, a); });
  // Det som just ändrades gör ett litet hopp (transform/opacitet, en gång)
  function lysUpp(selektor) { if (lugn) return; requestAnimationFrame(() => { const el = $(selektor, vy); if (!el) return; el.removeAttribute('data-bytt'); void el.offsetWidth; el.setAttribute('data-bytt', ''); setTimeout(() => el.removeAttribute('data-bytt'), 1400); }); }


  /* Dra och släpp – filer till uppladdningsytan -------------------------------------- */
  let dragId = null;
  document.addEventListener('dragover', (ev) => {
    const zon = ev.target.closest && ev.target.closest('[data-uppladdning]');
    if (zon && ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); zon.setAttribute('data-drag', ''); }
  });
  document.addEventListener('dragleave', (ev) => { const zon = ev.target.closest && ev.target.closest('[data-uppladdning]'); if (zon && !zon.contains(ev.relatedTarget)) zon.removeAttribute('data-drag'); });
  document.addEventListener('drop', (ev) => {
    const zon = ev.target.closest && ev.target.closest('[data-uppladdning]');
    if (zon && ev.dataTransfer.files.length) { ev.preventDefault(); zon.removeAttribute('data-drag'); oppnaUppladdning(ev.dataTransfer.files, zon.dataset.kund, zon.dataset.affar, zon.dataset.kategori); }
  });
  document.addEventListener('dragstart', (ev) => { if (ev.target.closest && ev.target.closest('.affarskort')) ev.preventDefault(); });

  /* Dra affärskort med pekaren: kortet svävar i 3D, lutar efter rörelsen och landar
     med en båge. Pekskärmar använder i stället knapparna på kortet och flyttmenyn. */
  let pekDrag = null; let klickSparr = false;
  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.pointerType === 'touch') return;
    const kort = ev.target.closest && ev.target.closest('.affarskort[data-affar]');
    if (!kort || ev.target.closest('button') || !kort.closest('[data-tavla]')) return;
    const a = affar(kort.dataset.affar); if (!a || a.steg === 'signerad') return;
    pekDrag = { kort, id: kort.dataset.affar, x0: ev.clientX, y0: ev.clientY, mx: ev.clientX, my: ev.clientY, aktiv: false, pekare: ev.pointerId };
  });
  // Bara pekaren som började dra räknas, och bara medan knappen hålls nere – en penna som lyfts utan pointerup (pointercancel)
  // fick annars kortet att sväva och landa vid nästa tryck
  const avbrytOmAktiv = () => { if (pekDrag && pekDrag.aktiv) avbrytPekDrag(); pekDrag = null; };
  document.addEventListener('pointermove', (ev) => {
    if (!pekDrag || ev.pointerId !== pekDrag.pekare) return;
    if (!(ev.buttons & 1)) { avbrytOmAktiv(); return; }
    pekDrag.mx = ev.clientX; pekDrag.my = ev.clientY;
    if (!pekDrag.aktiv && Math.hypot(ev.clientX - pekDrag.x0, ev.clientY - pekDrag.y0) > 6) startaPekDrag();
  });
  document.addEventListener('pointerup', (ev) => { if (pekDrag && ev.pointerId !== pekDrag.pekare) return; if (pekDrag && pekDrag.aktiv) slappPekDrag(); pekDrag = null; });
  document.addEventListener('pointercancel', (ev) => { if (pekDrag && ev.pointerId === pekDrag.pekare) avbrytOmAktiv(); });
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && pekDrag && pekDrag.aktiv) { avbrytPekDrag(); pekDrag = null; } });
  addEventListener('blur', () => { if (pekDrag && pekDrag.aktiv) { avbrytPekDrag(); pekDrag = null; } });
  document.addEventListener('click', (ev) => { if (klickSparr) { ev.preventDefault(); ev.stopPropagation(); klickSparr = false; } }, true);

  function startaPekDrag() {
    const d = pekDrag; const r = d.kort.getBoundingClientRect();
    d.aktiv = true; d.dx = d.x0 - r.left; d.dy = d.y0 - r.top; d.lx = d.mx; d.ly = d.my; d.lut = 0; d.lutX = 0; d.hojd = r.height;
    d.ursprung = r;
    const spoke = d.kort.cloneNode(true);
    spoke.classList.add('svavande'); spoke.removeAttribute('data-tilt'); spoke.removeAttribute('href'); spoke.setAttribute('aria-hidden', 'true');
    spoke.style.width = r.width + 'px';
    document.body.appendChild(spoke); d.spoke = spoke;
    d.kort.setAttribute('data-platshallare', ''); d.kort.removeAttribute('data-tiltar');
    document.body.classList.add('drar');
    d.docka = document.createElement('div'); d.docka.className = 'docka';
    d.docka.innerHTML = `<div class="docka-zon" data-docka="forlora">${ik('stang')}<span>Släpp här för att markera som förlorad</span></div>`;
    document.body.appendChild(d.docka); requestAnimationFrame(() => d.docka && d.docka.setAttribute('data-synlig', ''));
    d.frame = requestAnimationFrame(pekDragLoop);
  }
  function pekDragLoop() {
    const d = pekDrag; if (!d || !d.aktiv) return;
    const vx = d.mx - d.lx; const vy_ = d.my - d.ly; d.lx = d.mx; d.ly = d.my;
    d.lut += (Math.max(-16, Math.min(16, vx * 0.9)) - d.lut) * 0.16;
    d.lutX += (Math.max(-12, Math.min(12, -vy_ * 0.7)) - d.lutX) * 0.16;
    // Över stegbandet krymper kortet och lägger sig under pekaren så att målknappen syns. Kortet hålls inom fönstret.
    const bredd = d.ursprung.width;
    const x = d.overBand ? d.mx - bredd * 0.25 : Math.min(innerWidth - bredd * 0.55, Math.max(-bredd * 0.45, d.mx - d.dx));
    const y = d.overBand ? d.my + 26 : d.my - d.dy;
    d.spoke.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) perspective(900px) rotateZ(${(d.lut * 0.4).toFixed(2)}deg) rotateY(${d.lut.toFixed(2)}deg) rotateX(${d.lutX.toFixed(2)}deg) scale(${d.overBand ? 0.5 : 1.05})`;
    // Rulla tavlan när kortet närmar sig kanten
    const tavla = $('[data-tavla]', vy);
    if (tavla) { const tr = tavla.getBoundingClientRect(); const kant = 80; if (d.mx < tr.left + kant) tavla.scrollLeft -= Math.ceil((tr.left + kant - d.mx) / 4); else if (d.mx > tr.right - kant) tavla.scrollLeft += Math.ceil((d.mx - (tr.right - kant)) / 4); }
    markeraMal();
    d.frame = requestAnimationFrame(pekDragLoop);
  }
  function malUnder() {
    const el = document.elementFromPoint(pekDrag.mx, pekDrag.my);
    // Stegbandet fungerar också som mål: släpp på ett steg för att flytta dit utan att scrolla
    const bandKnapp = el && el.closest('.stegband button[data-steg]');
    const kol = bandKnapp ? $(`.kolumn[data-steg="${sel(bandKnapp.dataset.steg)}"]`, vy) : el && el.closest('.kolumn[data-steg]');
    return { kol, bandKnapp, docka: el && el.closest('[data-docka]') };
  }
  function markeraMal() {
    const d = pekDrag; const { kol, docka, bandKnapp } = malUnder();
    const a = affar(d.id); const giltig = kol && kol.dataset.steg !== a.steg ? kol : null;
    $$('.stegband button[data-over]', vy).forEach((b) => { if (b !== bandKnapp || !giltig) b.removeAttribute('data-over'); });
    if (bandKnapp && giltig) bandKnapp.setAttribute('data-over', '');
    d.overBand = !!bandKnapp;
    d.spoke.toggleAttribute('data-over-band', !!(bandKnapp && giltig));
    if (bandKnapp && giltig) d.spoke.dataset.etikett = `Släpp i ${(SALJSTEG.find((s) => s.id === bandKnapp.dataset.steg) || {}).namn || ''}`;
    $$('.kolumn[data-over]', vy).forEach((k) => { if (k !== giltig) { k.removeAttribute('data-over'); k.style.removeProperty('--lut'); const p = $('.landningsplats', k); if (p) p.remove(); } });
    if (giltig) {
      const r = giltig.getBoundingClientRect(); giltig.style.setProperty('--lut', (((d.mx - (r.left + r.width / 2)) / r.width) * -8).toFixed(2) + 'deg');
      if (!giltig.hasAttribute('data-over')) {
        giltig.setAttribute('data-over', '');
        const plats = document.createElement('div'); plats.className = 'landningsplats'; plats.style.setProperty('--hojd', d.hojd + 'px');
        const lista = $('.kolumn-kort', giltig); lista.insertBefore(plats, lista.firstChild);
      }
    }
    const zon = $('.docka-zon', d.docka); if (zon) zon.toggleAttribute('data-over', !!docka);
  }
  function stadaPekDrag() {
    const d = pekDrag; cancelAnimationFrame(d.frame);
    document.body.classList.remove('drar');
    $$('.kolumn[data-over]', vy).forEach((k) => { k.removeAttribute('data-over'); k.style.removeProperty('--lut'); });
    $$('.landningsplats', vy).forEach((p) => p.remove());
    $$('.stegband button[data-over]', vy).forEach((b) => b.removeAttribute('data-over'));
    if (d.docka) { const dk = d.docka; dk.removeAttribute('data-synlig'); setTimeout(() => dk.remove(), 400); d.docka = null; }
    klickSparr = true; setTimeout(() => { klickSparr = false; }, 0);
    // Kollegors ändringar som kom under dragningen ritas nu (om inget ark öppnades av släppet)
    setTimeout(() => { if (ritaSenare && !ark.open) { ritaSenare = false; rendera(); } }, 900);
  }
  function aterForSpoke(d) {
    const spoke = d.spoke; const fran = spoke.getBoundingClientRect(); const till = d.kort.isConnected ? d.kort.getBoundingClientRect() : d.ursprung;
    const anim = spoke.animate([{ transform: spoke.style.transform }, { transform: `translate3d(${till.left}px, ${till.top}px, 0) scale(1)` }], { duration: lugn ? 1 : 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    anim.onfinish = () => { spoke.remove(); d.kort.removeAttribute('data-platshallare'); };
    void fran;
  }
  function avbrytPekDrag() { const d = pekDrag; stadaPekDrag(); aterForSpoke(d); }
  function slappPekDrag() {
    const d = pekDrag; const { kol, docka } = malUnder(); const spokRect = d.spoke.getBoundingClientRect();
    stadaPekDrag();
    const a = affar(d.id);
    if (docka) {
      d.spoke.animate([{ transform: d.spoke.style.transform, opacity: 1 }, { transform: `${d.spoke.style.transform} translateY(60px) scale(.6)`, opacity: 0 }], { duration: 380, easing: 'ease-in' }).onfinish = () => d.spoke.remove();
      d.kort.removeAttribute('data-platshallare');
      G.forlora({ dataset: { affar: a.id } });
      return;
    }
    if (kol && kol.dataset.steg !== a.steg) {
      if (kol.dataset.steg === 'signerad') { aterForSpoke(d); oppnaOverlamning(a.id); return; }
      d.spoke.remove();
      flyttaAffar(a.id, kol.dataset.steg, { franRect: spokRect });
      return;
    }
    aterForSpoke(d);
  }

  /* Tangentbord i tavlan: pilar mellan kort, Shift + pil flyttar kortet ett steg */
  vy.addEventListener('keydown', (ev) => {
    const tratt = ev.target.closest && ev.target.closest('.tratt-rad[role="button"], .ss-steg');
    if (tratt && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev_tangent = true; G['till-kolumn'](tratt); ev_tangent = false; return; }
    const kort = ev.target.closest && ev.target.closest('.affarskort[data-affar]');
    if (!kort || ev.target !== kort) return;
    const tavla = kort.closest('[data-tavla]'); if (!tavla) return;
    const kolumner = $$('.kolumn', tavla); const kol = kort.closest('.kolumn'); const ki = kolumner.indexOf(kol);
    const iKol = $$('.affarskort', kol); const i = iKol.indexOf(kort);
    const pil = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
    if (ev.shiftKey && pil) {
      ev.preventDefault();
      const a = affar(kort.dataset.affar); const mal = SALJSTEG[saljStegIndex(a.steg) + pil];
      if (!mal || a.steg === 'signerad') return;
      if (mal.id === 'signerad') { oppnaOverlamning(a.id); return; }
      flyttaAffar(a.id, mal.id, { franRect: kort.getBoundingClientRect(), fokus: true });
      return;
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const n = iKol[i + (ev.key === 'ArrowDown' ? 1 : -1)]; if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); } return; }
    if (pil) {
      ev.preventDefault();
      for (let j = ki + pil; j >= 0 && j < kolumner.length; j += pil) {
        const lista = $$('.affarskort', kolumner[j]);
        if (lista.length) { const n = lista[Math.min(i, lista.length - 1)]; n.focus(); n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: lugn ? 'auto' : 'smooth' }); break; }
      }
    }
  });

  /* 13b-live: kunden fyller i sin länk i en annan flik (demoläget) – eller kunder och kollegor
     ändrar något på servern (skarpt läge, hämtas med polling av lager.js) ----------------------- */
  const KROCK = 'Någon annan hann ändra samma sak – din senaste ändring sparades inte. Försök igen.';
  // Demoläget: lagret skickar bara den färska datan – jämför statusarna före och efter (som förut)
  const statusAndringar = (gammal, ny) => {
    const ut = [];
    ['kundlankar', 'offerter', 'halsoformular'].forEach((s) => Object.entries(ny[s] || {}).forEach(([t, x]) => {
      const f = (gammal[s] || {})[t];
      ut.push({ samling: s, id: t, fore: f ? { status: f.status } : null, efter: x });
    }));
    // Projekten: nya och de vars underlag har bytt status (testteamets avisering om nytt eller kompletterat underlag)
    (ny.projekt || []).forEach((x) => {
      const f = (gammal.projekt || []).find((y) => y.id === x.id);
      if (!f || f.underlagStatus !== x.underlagStatus) ut.push({ samling: 'projekt', id: x.id, fore: f ? { underlagStatus: f.underlagStatus, steg: f.steg } : null, efter: x });
    });
    return ut;
  };
  const blev = (x, status) => !!x.efter && x.efter.status === status && (!x.fore || x.fore.status !== status);
  const kundNamn = (id) => (kund(id) || {}).namn || 'Kunden';
  let ritaSenare = false; // ändringen kom medan man skrev, drog ett kort, hade ett ark öppet eller höll ned en knapp
  /* En nedtryckt pekare (mus, penna, finger): vyn ritas inte om mitt i ett klick. När fönstret får fokus pollar lagret redan vid
     mousedown, och kom svaret med kollegors ändringar före mouseup byttes knappen under pekaren ut – klicket försvann (Ny affär
     öppnades inte på första klicket). Omritningen väntar till klicket är hanterat (eller strax efter släppet om inget klick kom). */
  let pekareNere = false; let pekareTimer = 0;
  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return; // högerklick ger inget klick (och släppet kan hamna i snabbmenyn)
    pekareNere = true; clearTimeout(pekareTimer); pekareTimer = setTimeout(pekareUpp, 5000); // reserv om släppet aldrig kom
  }, true);
  const pekareUpp = () => {
    clearTimeout(pekareTimer);
    if (!pekareNere) return; pekareNere = false;
    if (!ritaSenare || (pekDrag && pekDrag.aktiv)) return; // ett släppt affärskort ritar själv om efter landningen (stadaPekDrag)
    let klar = false;
    const rita = () => { if (klar) return; klar = true; document.removeEventListener('click', rita, true); setTimeout(ritaVantande, 0); };
    document.addEventListener('click', rita, true); // capture: körs före klickets handlare, ritningen sker efter dem (setTimeout)
    setTimeout(rita, 120);
  };
  document.addEventListener('pointerup', pekareUpp, true);
  document.addEventListener('pointercancel', pekareUpp, true);
  addEventListener('blur', pekareUpp);
  const listaOppen = () => !!document.querySelector('.valj-knapp[aria-expanded="true"]') || (() => { try { return !!document.querySelector('.kal-panel:popover-open'); } catch (err) { return !!document.querySelector('.kal-panel'); } })();
  // Rita det som väntar när inget hindrar: inget ark, ingen öppen lista, inget fält med fokus, ingen dragning, ingen nedtryckt pekare
  function ritaVantande() {
    if (!ritaSenare || pekareNere) return; if (listaOppen()) { vantaPaLista(); return; }
    const skriverNu = document.activeElement && document.activeElement.closest && document.activeElement.closest('#vy input, #vy textarea');
    if (!ark.open && !skriverNu && !(pekDrag && pekDrag.aktiv)) { ritaSenare = false; rendera(); }
  }
  const vantaPaLista = () => setTimeout(ritaVantande, 500);
  // Krocken säger vad det gällde: "Tellus Redovisning AB: någon annan hann ändra affären – den står nu i Ny kontakt",
  // "Test Ekbacken: Magnus ändrade kunden samtidigt – din ändring av kontakten Test Karin Ek sparades inte."
  // Andra fel (ej tillåtet, ogiltigt) har lagrets egen text – de är inga krockar.
  const krockText = (andrade, meddelande, fel = 'krock') => {
    if (fel !== 'krock') return meddelande || KROCK;
    const x = (andrade || []).find((y) => y.samling === 'affarer' && y.efter);
    if (x) { const s = SALJSTEG.find((t) => t.id === x.efter.steg); return `${kundNamn(x.efter.kundId)}: någon annan hann ändra affären – den står nu i ${s ? s.namn : x.efter.steg === 'forlorad' ? 'Förlorad' : 'sitt tidigare steg'}.`; }
    const t = (andrade || []).find((y) => y.samling === 'todos' && y.efter);
    if (t) return `Någon annan hann ändra ”${t.efter.text}” först.`;
    const kx = (andrade || []).find((y) => y.samling === 'kunder' && y.efter);
    if (kx) {
      const vem = vemAndrade(kx.id); const vad = kundAndring(kx.bas, kx.fore);
      const vemText = vem === 'Du' ? 'du ändrade kunden i en annan flik' : vem ? `${vem} ändrade kunden samtidigt` : 'någon annan hann ändra kunden';
      return `${kx.efter.namn || kundNamn(kx.id)}: ${vemText} – din ändring${vad ? ` av ${vad}` : ''} sparades inte.`;
    }
    return meddelande || KROCK;
  };
  // Vad min ändring av en kund gällde (bas → min): "kontakten Test Karin Ek", "kontaktpersonerna" eller "kunduppgifterna"
  function kundAndring(bas, min) {
    if (!bas || !min) return '';
    const s = (x) => JSON.stringify(x ?? null); const bk = bas.kontakter || []; const mk = min.kontakter || [];
    const kontakter = [...mk.filter((c) => { const b = bk.find((y) => y.id === c.id); return !b || s(b) !== s(c); }), ...bk.filter((b) => !mk.some((c) => c.id === b.id))];
    const ovrigt = Object.keys({ ...bas, ...min }).some((n) => n !== 'kontakter' && s(bas[n]) !== s(min[n]));
    if (kontakter.length === 1 && !ovrigt) return `kontakten ${kontakter[0].namn}`;
    if (kontakter.length && !ovrigt) return 'kontaktpersonerna';
    return ovrigt && !kontakter.length ? 'kunduppgifterna' : '';
  }
  /* Trevägs-sammanslagning av en kund ("Gör om min ändring" efter en krock): det jag ändrade (bas → min) läggs på kundens
     version nu – fälten på toppnivån och kontaktpersonerna per id och per fält. Det kollegan ändrade i övrigt står kvar;
     ändrade vi samma fält gäller mitt (jag har valt att göra om ändringen). En kontakt som kollegan tog bort läggs inte tillbaka. */
  function slaIhopKund(bas, min, nu) {
    const s = (x) => JSON.stringify(x ?? null); const kopia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
    const ut = kopia(nu);
    new Set([...Object.keys(bas), ...Object.keys(min)]).forEach((n) => {
      if (n === 'kontakter' || n === 'id' || s(bas[n]) === s(min[n])) return;
      if (min[n] === undefined) delete ut[n]; else ut[n] = kopia(min[n]);
    });
    const bk = bas.kontakter || []; const mk = min.kontakter || [];
    let lista = (ut.kontakter || []).map((c) => ({ ...c }));
    bk.filter((b) => !mk.some((c) => c.id === b.id)).forEach((b) => { lista = lista.filter((c) => c.id !== b.id); });
    mk.forEach((c) => {
      const b = bk.find((y) => y.id === c.id); const i = lista.findIndex((y) => y.id === c.id);
      if (!b) { if (i < 0) lista.push({ ...c }); return; }
      if (i < 0) return;
      Object.keys({ ...b, ...c }).forEach((f) => { if (s(b[f]) !== s(c[f])) { if (c[f] === undefined) delete lista[i][f]; else lista[i][f] = c[f]; } });
    });
    if (lista.length || ut.kontakter) ut.kontakter = lista;
    return ut;
  }
  // Knappen i krocktoasten för en kund: gör om min ändring på det som gäller nu, med händelserna som hörde till den
  function gorOm(andrade) {
    const kx = (andrade || []).find((y) => y.samling === 'kunder' && y.efter && y.fore && y.bas);
    if (!kx || !kundAndring(kx.bas, kx.fore)) return null;
    const akter = (andrade || []).filter((y) => y.samling === 'aktiviteter' && y.fore && !y.efter && y.fore.kundId === kx.id).map((y) => y.fore);
    return { text: 'Gör om min ändring', fn: () => {
      const k = kund(kx.id); if (!k) { toast('Kunden finns inte längre', null, 'varning'); return; }
      const ny = slaIhopKund(kx.bas, kx.fore, k);
      Object.keys(k).forEach((n) => { delete k[n]; }); Object.assign(k, ny);
      akter.forEach((x) => { if (!db.aktiviteter.some((y) => y.id === x.id)) db.aktiviteter.push({ ...x }); });
      const sparat = spara(); rendera();
      Promise.resolve(sparat).then((svar) => { if (!svar || svar.ok) toast(`${k.namn}: din ändring är sparad`, null, UPEMO.sak.kontakt); });
    } };
  }
  L.prenumerera((h) => {
    if (h.orsak === 'utloggad') return; // lagret skickar vidare till inloggningen
    if (h.orsak === 'natverk') { visaSparStatus('fel'); toast(h.meddelande || 'Kunde inte spara – försöker igen', null, 'varning'); return; }
    if (h.orsak === 'natverk-klart') { sparStatus('sparat'); toast(h.meddelande || 'Allt är sparat igen'); return; }
    const andrade = h.andrade || statusAndringar(db, h.db);
    db = h.db; db.kundlankar = db.kundlankar || {}; db.offerter = db.offerter || {}; db.halsoformular = db.halsoformular || {};
    uppdateraRaknare();
    if (ark.open) synkaOppetArk(); // ett öppet Ändra-ark tar in kollegans värden i fält man inte rört (eller visar krocken)
    // Säljets aviseringar (offerter, kundlänkar) visas inte för testteamet – testteamet får nytt och kompletterat underlag i stället
    const arTestNu = anv(jag).roll === 'test';
    andrade.filter((x) => !arTestNu && x.samling === 'offerter' && (blev(x, 'godkand') || blev(x, 'signerad'))).forEach(({ efter: o }) => toast(`${kundNamn(o.kundId)} ${o.status === 'signerad' ? 'signerade ordern' : 'godkände offerten'} ${o.nummer}`, { href: `#/affar/${o.affarId}`, text: 'Visa' }, o.status === 'signerad' ? UPEMO.sak.signering : 'klar'));
    if (andrade.some((x) => x.samling === 'anvandare')) { fyllAnvandarval(); uppdateraSkal(); if (/^#\/anvandare$/.test(location.hash)) laddaAdmin(); }
    // Skarpt läge: rollbyte, ledighetsbeslut och nya ansökningar som toast (ledning.js)
    if (LED && LED.vidKontoAndring && h.orsak === 'synk') LED.vidKontoAndring(andrade);
    // Bara "senast aktiv" på kontona (servern markerar aktiva konton högst var 2:a minut): menyn är redan uppdaterad – vyn
    // ritas om bara där närvaron står (ledningen, profilerna, adminsidorna och kontrollcentralen)
    const AKTIVITET = ['senastAktiv', 'dagar', 'utloggad'];
    const utanAktivitet = (u) => JSON.stringify(Object.fromEntries(Object.entries(u || {}).filter(([k]) => !AKTIVITET.includes(k))));
    const baraAktivitet = h.orsak === 'synk' && andrade.length && andrade.every((x) => x.samling === 'anvandare' && x.fore && x.efter && utanAktivitet(x.fore) === utanAktivitet(x.efter));
    if (baraAktivitet && !/^#\/(chef|profil|admin|sakerhet|anvandare)/.test(location.hash || '') && !(anv(jag).roll === 'admin' && /^(#\/?)?$/.test(location.hash || ''))) return;
    const skriver = document.activeElement && document.activeElement.closest && document.activeElement.closest('#vy input, #vy textarea, #vy select');
    // En öppen lista eller kalender (valj.js, kalender.js – i översta lagret, utanför #vy) räknas som att man skriver: vyn ritas
    // om när den har stängts, så att valet inte försvinner med rutan
    if (listaOppen()) { ritaSenare = true; vantaPaLista(); }
    else if (pekareNere) ritaSenare = true; // mitt i ett klick – ritas när klicket är hanterat (pekareUpp)
    else if (!ark.open && !skriver && !(pekDrag && pekDrag.aktiv)) { ritaSenare = false; rendera(); }
    else if (skriver && skriver.matches('[data-salj-sok]') && !ark.open) { ritaSenare = false; uppdateraSaljYta(); } // säljtavlan: korten uppdateras och fokus i sökfältet behålls
    else ritaSenare = true;
    andrade.filter((x) => !arTestNu && x.samling === 'kundlankar' && blev(x, 'inskickad')).forEach(({ efter: l }) => toast(`${kundNamn(l.kundId)} har skickat in sitt underlag`, { href: `#/affar/${l.affarId}`, text: 'Visa' }, UPEMO.larm.inne));
    // Testteamet: nytt underlag från sälj (nytt projekt) och kompletterat underlag (returnerat → ny) – bara för projektets
    // testansvarig, eller för hela testteamet när ingen är satt
    if (arTestNu) andrade.filter((x) => x.samling === 'projekt' && x.efter && x.efter.steg === 'underlag' && x.efter.underlagStatus === 'ny' && (!x.fore || x.fore.underlagStatus === 'returnerat') && (!x.efter.ansvarigTest || x.efter.ansvarigTest === jag))
      .forEach(({ efter: p, fore }) => { const a = affar(p.affarId); const s = anv(a ? a.ansvarig : '').kort; toast(fore ? `${s} har kompletterat underlaget – granska igen` : `Nytt underlag från ${s} – granska och boka tid`, { href: `#/projekt/${p.id}`, text: 'Granska' }, UPEMO.proj.underlag, { rubrik: kundNamn(p.kundId) }); });
    // Namnet tas från länken (forifyllt) – svaren skickas bara till testteamet
    if (HALSA) andrade.filter((x) => x.samling === 'halsoformular' && x.fore && blev(x, 'besvarad')).forEach(({ efter: f }) => toast(`${(!SKARP && f.svar && f.svar.namn) || (f.forifyllt && f.forifyllt.namn) || 'En deltagare'} (${kundNamn(f.kundId)}) har svarat på hälsoformuläret`, { href: `#/affar/${f.affarId}`, text: 'Visa' }));
    if (h.orsak === 'konflikt') {
      visaSparStatus('tyst');
      // Arket som sparade tar själv hand om sin krock (slår ihop och sparar igen, eller visar den vid fältet) – bara det andra
      // som inte heller sparades får en toast. Utan arket: toasten säger vad det gällde och kan göra om ändringen på en kund.
      const egen = h.fel === 'krock' && arkSparar && ark.open && ark.contains(arkSparar.form);
      const ovriga = egen ? andrade.filter((x) => !arkSparar.poster.has(`${x.samling}\u0000${x.id}`)) : andrade;
      if (!egen || ovriga.length) toast(krockText(ovriga, h.meddelande, h.fel || 'krock'), null, 'varning', { rubrik: 'Ändringen sparades inte', atgard: h.fel === 'krock' ? gorOm(ovriga) : null });
    }
  });
  ark.addEventListener('close', () => { if (ritaSenare && !pekareNere) { ritaSenare = false; rendera(); } });
  // Den som skrev i ett fält när kollegors ändringar kom: rita när fokus lämnar vyn (men inte mitt i klicket som flyttade fokus)
  vy.addEventListener('focusout', () => setTimeout(() => { if (ritaSenare && !pekareNere && !ark.open && !(pekDrag && pekDrag.aktiv) && !vy.contains(document.activeElement)) { ritaSenare = false; rendera(); } }, 0));

  /* 14-sök och kommandopalett (Ctrl/⌘ K eller /) ------------------------------------------------
     Sökfältet i toppraden: tomt visar det senaste, snabbåtgärder och vyerna; med text söker det kunder,
     kontakter, affärer, projekt, åtgärder och vyer. Ungefärlig träff från tre tecken. Senaste finns bara i minnet. */
  const sokRuta = $('[data-sok]'); const sokFalt = $('[data-sok-falt]'); const traffar = $('[data-sok-traffar]');
  const senaste = []; // [{ href, titel, typ }] – bara i minnet (ingen CRM-data i webbläsarens lagring)
  // Dator: sökfältet, "+ Ny", läget och sparstatus flyttas till sidomenyn och toppraden göms – vyerna får hela höjden.
  // Mobilen har kvar dem i toppraden. Elementen flyttas (inte kopieras), så lyssnare och referenser följer med.
  const toppHoger = $('.topprad-hoger'); const toppNy = toppHoger && $('.knapp-ny', toppHoger);
  const toppChips = [$('[data-sparstatus]'), $('[data-lage-chip]')].filter(Boolean);
  const datorBred = matchMedia('(min-width: 1000px)');
  function placeraVerktyg() {
    const ny = $('[data-sido-ny]'); const lage = $('[data-sido-lage]'); if (!ny || !lage || !toppHoger || !toppNy) return;
    if (datorBred.matches) { lage.before(sokRuta); lage.append(...toppChips); ny.append(toppNy); }
    else { toppHoger.before(sokRuta); toppHoger.prepend(...toppChips); toppHoger.append(toppNy); }
    document.documentElement.style.setProperty('--topph', toppHojd() + 'px');
    klistraKolumner();
  }
  datorBred.addEventListener('change', placeraVerktyg);
  placeraVerktyg();
  // Sidomenyn kan fällas in (dator): menyn glider ut åt vänster och vyn glider efter. FLIP – en enda layoutändring,
  // sedan bara transform (3D-scenerna byter storlek en gång, inte varje bildruta). Valet sparas i webbläsaren (bara utseende).
  const sidoKnapp = $('[data-sido-knapp]'); const huvudEl = $('.huvud'); const sidoEl = $('.sido');
  const sidoDold = () => document.documentElement.hasAttribute('data-sido-dold');
  function sattSido(dold, animera = true, minns = true) {
    const fore = animera && !lugn && datorBred.matches && huvudEl ? huvudEl.getBoundingClientRect().left : null;
    document.documentElement.toggleAttribute('data-sido-dold', dold);
    const text = dold ? 'Visa menyn' : 'Dölj menyn';
    if (sidoKnapp) { sidoKnapp.setAttribute('aria-expanded', String(!dold)); sidoKnapp.setAttribute('aria-label', text); sidoKnapp.title = `${text}  [`; }
    if (sidoEl) sidoEl.inert = dold && datorBred.matches;
    if (minns) { try { localStorage.setItem('up-crm-sido-dold', dold ? '1' : '0'); } catch (err) { /* ingen lagring */ } }
    if (fore != null) {
      const dx = fore - huvudEl.getBoundingClientRect().left;
      if (dx && huvudEl.animate) huvudEl.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
    klistraKolumner();
  }
  if (sidoKnapp) sidoKnapp.addEventListener('click', () => { sidoTillfalligt = false; sattSido(!sidoDold()); }); // eget val: sparas, och sökningen fäller inte in den igen
  sattSido(sidoDold(), false);
  datorBred.addEventListener('change', () => { if (sidoEl) sidoEl.inert = sidoDold() && datorBred.matches; });
  addEventListener('keydown', (ev) => {
    if (ev.key !== '[' || ev.ctrlKey || ev.metaKey || ev.altKey || !datorBred.matches || document.querySelector('.mote')) return;
    if (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable], dialog')) return;
    ev.preventDefault(); sattSido(!sidoDold());
  });
  addEventListener('hashchange', () => {
    const m = location.hash.match(/^#\/(kund|affar|projekt)\/([\w-]+)$/); if (!m) return;
    const titel = m[1] === 'kund' ? (kund(m[2]) || {}).namn : m[1] === 'affar' ? (() => { const a = affar(m[2]); return a ? `${a.titel} · ${kundNamn(a.kundId)}` : null; })() : (() => { const p = projekt(m[2]); return p ? kundNamn(p.kundId) : null; })();
    if (!titel) return;
    const i = senaste.findIndex((x) => x.href === location.hash); if (i >= 0) senaste.splice(i, 1);
    senaste.unshift({ href: location.hash, titel, typ: { kund: 'Kund', affar: 'Affär', projekt: 'Projekt' }[m[1]] }); senaste.length = Math.min(senaste.length, 5);
  });
  const ATGARDER = [['Ny affär', 'ny-affar', '', UPEMO.sak.offert, 'N'], ['Ny kund', 'snabb', 'kund', UPEMO.kundtyp.foretag, ''], ['Ny att göra', 'snabb', 'todo', UPEMO.sak.todo, ''], ['Anteckning', 'snabb', 'anteckning', UPEMO.akt.anteckning, ''], ['Starta kundmöte', 'gaa', '#/mote', UPEMO.sak.mote, '']];
  const VYER_SOK = [['Översikt', '#/', 'hem'], ['Kunder', '#/kunder', 'kunder'], ['Säljtavla', '#/salj', 'salj'], ['Klubbmotorn', '#/klubbmotorn', 'klubb'], ['Kundmöte', '#/mote', 'presentation'], ['Dokument', '#/dokument', 'dokument'], ['Mallar', '#/dokument/mallar', 'rutnat'], ['Projekt', '#/projekt', 'projekt'], ['Att göra', '#/att-gora', 'todo'], ['Försäljningsledning', '#/chef', 'krona'], ['Min profil', '#/profil', 'anstallda'], ['Adminpanel', '#/admin', 'server'], ['Säkerhetshubben', '#/sakerhet', 'radar']];
  // Träff: delsträng, eller från tre tecken alla tecken i rätt ordning ("sgb" hittar Stensund Livs AB … och Skärgårdsbyn)
  const traff = (text, q) => { const t = String(text || '').toLowerCase(); if (t.includes(q)) return true; if (q.length < 3) return false; let i = 0; for (const c of t) { if (c === q[i]) i++; if (i === q.length) return true; } return false; };
  let sokIndex = -1;
  function sok(q) {
    q = String(q || '').trim().toLowerCase();
    const palett = !q && document.activeElement === sokFalt;
    if (!q && !palett) { traffar.hidden = true; sokFalt.setAttribute('aria-expanded', 'false'); return; }
    // Träffarna är inga tabbstopp: de nås med pilarna (aria-activedescendant), Tab lämnar sökningen
    const rad = (inre, typ, attr) => `<a class="sok-traff" role="option" tabindex="-1" ${attr}>${inre}${typ ? `<span class="sok-typ">${typ}</span>` : ''}</a>`;
    const knapp = (inre, typ, attr) => `<button class="sok-traff" type="button" role="option" tabindex="-1" ${attr}>${inre}${typ ? `<span class="sok-typ">${typ}</span>` : ''}</button>`;
    const atgardRad = ([namn, g, varde, em, kbd]) => (g === 'gaa' ? rad(`${emo(em, { ruta: 's' })}<span><strong>${e(namn)}</strong></span>`, 'Åtgärd', `href="${e(varde)}"`) : knapp(`${emo(em, { ruta: 's' })}<span><strong>${e(namn)}</strong></span>${kbd ? `<kbd>${kbd}</kbd>` : ''}`, 'Åtgärd', `data-g="${g}" ${varde ? `data-flik="${varde}"` : ''}`));
    const vyRad = ([namn, href, ikon]) => rad(`<span class="logga-ruta sok-vy">${ik(ikon)}</span><span><strong>${e(namn)}</strong></span>`, 'Gå till', `href="${e(href)}"`);
    let html = '';
    if (palett) {
      if (senaste.length) html += '<p class="sok-grupp">Senaste</p>' + senaste.map((x) => rad(`<span class="logga-ruta">${ik(x.typ === 'Kund' ? 'kunder' : x.typ === 'Affär' ? 'salj' : 'projekt')}</span><span><strong>${e(x.titel)}</strong></span>`, x.typ, `href="${e(x.href)}"`)).join('');
      html += '<p class="sok-grupp">Snabbåtgärder</p>' + ATGARDER.map(atgardRad).join('');
      html += '<p class="sok-grupp">Gå till</p>' + VYER_SOK.map(vyRad).join('');
    } else {
      const har = (...v) => v.some((x) => traff(x, q));
      const k = db.kunder.filter((x) => har(x.namn, x.bransch, x.stad, x.orgnr)).slice(0, 5);
      const c = db.kunder.flatMap((x) => (x.kontakter || []).map((p) => ({ p, k: x }))).filter(({ p }) => har(p.namn, p.epost, p.tel, p.roll)).slice(0, 5);
      const a = db.affarer.filter((x) => har(x.titel, (kund(x.kundId) || {}).namn)).slice(0, 5);
      const pr = db.projekt.filter((x) => har((kund(x.kundId) || {}).namn, (affar(x.affarId) || {}).titel)).slice(0, 4);
      // Dokument: nummer eller filnamn ("UP-2026", "PUB-avtal") – eller flera ord ("order nordlast"). Arkiverade versioner sist.
      const dk = q.length >= 2 ? dokPoster().filter((x) => dokOrd(q).every((o) => x.sok.includes(o)) && (har(x.titel, x.nummer) || dokOrd(q).length > 1)).sort((x, y) => (x.lage === 'arkiv') - (y.lage === 'arkiv') || (x.tid < y.tid ? 1 : -1)).slice(0, 4) : [];
      const atg = ATGARDER.filter(([namn]) => traff(namn, q));
      const vyer = VYER_SOK.filter(([namn]) => traff(namn, q));
      if (k.length) html += '<p class="sok-grupp">Kunder</p>' + k.map((x) => rad(`${loggaRuta(x)}<span><strong>${e(x.namn)}</strong><small>${e([x.bransch, x.stad].filter(Boolean).join(' · '))}</small></span>`, x.typ === 'klubb' ? 'Klubb' : 'Kund', `href="#/kund/${e(x.id)}"`)).join('');
      if (c.length) html += '<p class="sok-grupp">Kontaktpersoner</p>' + c.map(({ p, k: x }) => rad(`<span class="avatar">${e(initialer(p.namn))}</span><span><strong>${e(p.namn)}</strong><small>${e([p.roll, x.namn].filter(Boolean).join(' · '))}</small></span>`, 'Kontakt', `href="#/kund/${e(x.id)}"`)).join('');
      if (a.length) html += '<p class="sok-grupp">Affärer</p>' + a.map((x) => rad(`${x.steg === 'forlorad' ? `<span class="logga-ruta">${ik('stang')}</span>` : emo(UPEMO.salj[x.steg], { ruta: 'm' })}<span><strong>${e(x.titel)}</strong><small>${e(kundNamn(x.kundId))} · ${kr(affarVarde(x))}</small></span>`, 'Affär', `href="#/affar/${e(x.id)}"`)).join('');
      if (pr.length) html += '<p class="sok-grupp">Projekt</p>' + pr.map((x) => rad(`${emo(UPEMO.proj[x.steg], { ruta: 'm' })}<span><strong>${e(kundNamn(x.kundId))}</strong><small>${e((PROJSTEG.find((s) => s.id === x.steg) || {}).namn || '')}${x.testdatum ? ` · test ${e(datumText(x.testdatum, { gemen: true }))}` : ''}</small></span>`, 'Projekt', `href="#/projekt/${e(x.id)}"`)).join('');
      if (dk.length) html += '<p class="sok-grupp">Dokument</p>' + dk.map((x) => knapp(`${dokIkon(x)}<span><strong>${e(x.titel)}</strong><small>${e([kundNamn(x.kundId), x.status[0]].filter(Boolean).join(' · '))}</small></span>`, 'Dokument', `data-g="dok-gaa" data-id="${e(x.id)}"`)).join('');
      if (atg.length) html += '<p class="sok-grupp">Åtgärder</p>' + atg.map(atgardRad).join('');
      if (vyer.length) html += '<p class="sok-grupp">Gå till</p>' + vyer.map(vyRad).join('');
      if (!html) html = `<div class="sok-tom">${emo('sok', { ruta: 'l' })}<p>Inga träffar för ”${e(q)}”.</p><button class="knapp knapp-kontur knapp-liten" type="button" data-g="snabb" data-flik="kund">${ik('plus')}Ny kund</button></div>`;
    }
    traffar.innerHTML = `<div class="sok-lista" role="listbox" id="sok-lista" aria-label="Träffar">${html}</div><p class="sok-fot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> välj</span><span><kbd>↵</kbd> öppna</span><span><kbd>Esc</kbd> stäng</span></p>`;
    $$('.sok-traff', traffar).forEach((x, i) => { x.id = `sok-alt-${i}`; });
    if (sokRuta.closest('.sido')) traffar.style.setProperty('--sok-topp', Math.round(sokRuta.getBoundingClientRect().top) + 'px'); // listan öppnas bredvid sidomenyn
    traffar.hidden = false; sokFalt.setAttribute('aria-expanded', 'true');
    valjTraff(q ? 0 : -1);
  }
  function valjTraff(i) {
    const lista = $$('.sok-traff', traffar); sokIndex = lista.length ? Math.max(-1, Math.min(lista.length - 1, i)) : -1;
    lista.forEach((x, j) => x.setAttribute('aria-selected', String(j === sokIndex)));
    if (sokIndex >= 0) { sokFalt.setAttribute('aria-activedescendant', lista[sokIndex].id); lista[sokIndex].scrollIntoView({ block: 'nearest' }); } else sokFalt.removeAttribute('aria-activedescendant');
  }
  let sidoTillfalligt = false; // sidomenyn visades bara för sökningen
  function stangSok() { if (sidoTillfalligt) { sidoTillfalligt = false; if (datorBred.matches) sattSido(true, true, false); } traffar.hidden = true; sokFalt.value = ''; sokRuta.removeAttribute('data-oppen'); sokFalt.setAttribute('aria-expanded', 'false'); sokFalt.removeAttribute('aria-activedescendant'); }
  function oppnaPalett() { if (document.querySelector('.mote')) return; if (ark.open) { sparaUtkast(); ark.close(); } if (sidoDold() && datorBred.matches) { sattSido(false, true, false); sidoTillfalligt = true; } if (matchMedia('(max-width: 999px)').matches) sokRuta.setAttribute('data-oppen', ''); sokFalt.focus(); sok(sokFalt.value); }
  sokFalt.addEventListener('focus', () => sok(sokFalt.value));
  sokFalt.addEventListener('keydown', (ev) => {
    const lista = $$('.sok-traff', traffar);
    if (ev.key === 'Escape') { stangSok(); sokFalt.blur(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (traffar.hidden) sok(sokFalt.value); valjTraff(sokIndex + 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); valjTraff(sokIndex - 1); return; }
    if (ev.key === 'Enter') { const vald = lista[sokIndex >= 0 ? sokIndex : 0]; if (vald) { ev.preventDefault(); vald.click(); } }
  });
  // Klick på en träff eller en åtgärd stänger listan (åtgärden körs först)
  traffar.addEventListener('click', (ev) => { if (ev.target.closest('a, [data-g]')) setTimeout(stangSok, 0); });
  // Fokus lämnar sökningen (Tab vidare): listan stängs som vid ett klick utanför – förut låg den kvar över vyn. Ett klick i listan
  // flyttar inte fokus från fältet (mousedown), så träffen hinner få sitt klick.
  traffar.addEventListener('mousedown', (ev) => { if (ev.target.closest('.sok-traff')) ev.preventDefault(); });
  traffar.tabIndex = -1; // rullbar lista utan tabbstopp blir annars själv ett tabbstopp (Chrome) – då stannade fokus i listan
  traffar.addEventListener('focusin', (ev) => { if (ev.target === traffar) sokFalt.focus(); });
  sokRuta.addEventListener('focusout', (ev) => {
    const till = ev.relatedTarget; if (!till || sokRuta.contains(till)) return;
    traffar.hidden = true; sokRuta.removeAttribute('data-oppen'); sokFalt.setAttribute('aria-expanded', 'false'); sokFalt.removeAttribute('aria-activedescendant');
  });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('[data-sok]') && !ev.target.closest('[data-g="oppna-sok"]')) { traffar.hidden = true; sokRuta.removeAttribute('data-oppen'); sokFalt.setAttribute('aria-expanded', 'false'); } });
  addEventListener('keydown', (ev) => {
    if (document.querySelector('.mote') || !ev.target.closest) return; // presentationsläget har egna tangenter
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); if (!traffar.hidden && document.activeElement === sokFalt) { stangSok(); sokFalt.blur(); } else oppnaPalett(); return; }
    const skriver = ev.target.closest('input, textarea, select, [contenteditable]');
    const saljSok = $('[data-salj-sok]', vy);
    if (ev.key === '/' && !skriver && !ark.open) { ev.preventDefault(); if (saljSok) { saljSok.focus(); saljSok.select(); return; } oppnaPalett(); }
    if ((ev.key === 'n' || ev.key === 'N') && !skriver && !ark.open && !ev.ctrlKey && !ev.metaKey && !ev.altKey && saljSok) { ev.preventDefault(); oppnaNyAffar(); }
    if (ev.key === 'Escape' && ev.target.matches && ev.target.matches('[data-salj-sok]') && ev.target.value) { ev.target.value = ''; saljUi.sok = ''; uppdateraSaljYta(); }
  });

  /* 15-användare och start ------------------------------------------------------------ */
  // Demoläget: byt användare fritt. Skarpt läge: man är den man loggat in som (ingen växling).
  function bytAnvandare(id) {
    if (SKARP) return;
    jag = id; try { localStorage.setItem('up-crm-jag', id); } catch (err) { /* ignorera */ }
    if (ark.open) ark.close();
    // Förra kontots läge följer inte med: chattens sökning, samtal, svar, bilagor och notis, utkasten i arken och mallarna,
    // sökningens senaste och förslagen man dolt med "Inte nu" – och det nya kontot är aktivt nu
    if (CHT && CHT.nollstall) CHT.nollstall();
    utkast.clear(); mallUtkast.clear(); senaste.length = 0; forslagDolda.clear();
    if (LED && LED.nyInloggning) LED.nyInloggning();
    fyllAnvandarval(); uppdateraRaknare();
    const u = anv(id);
    const start = u.roll === 'test' ? '#/projekt' : null; // admin börjar på kontrollcentralen (#/)
    if (CHT && CHT.kolla) setTimeout(CHT.kolla, 0); // chattens räknare och notiser för det nya kontot direkt
    const lederInte = /^#\/(chef|admin|sakerhet)/.test(location.hash) && !(LED && (u.roll === 'admin' || u.chef || u.admin));
    if (start && (!location.hash || location.hash === '#/' || lederInte)) location.hash = start; else if (lederInte) location.hash = '#/'; else rendera(true);
    toast(`Du är nu inloggad som ${u.namn}`, null, UPEMO.roll[u.roll === 'test' ? 'test' : u.roll === 'admin' ? 'admin' : 'salj']);
  }
  function fyllAnvandarval() {
    const u = anv(jag);
    $$('[data-anvandarval]').forEach((s) => {
      if (SKARP) { s.innerHTML = `<option value="${e(u.id)}" selected>${e(u.namn)} · ${e(rollText(u))}</option>`; s.disabled = true; return; }
      s.innerHTML = db.anvandare.filter((x) => arAktiv(x) || x.id === jag).map((x) => `<option value="${e(x.id)}" ${x.id === jag ? 'selected' : ''}>${e(x.namn)} · ${e(rollText(x))}</option>`).join('');
    });
    const av = $('[data-mig-avatar]'); av.textContent = u.initialer; av.classList.toggle('avatar-test', u.roll === 'test'); av.classList.toggle('avatar-admin', u.roll === 'admin');
    const namn = $('[data-mig-namn]'); if (namn) namn.textContent = u.namn;
    const roll = $('[data-mig-roll]'); if (roll) roll.textContent = SKARP ? rollText(u) : `${rollText(u)} · byt`;
    const kortet = $('.anvandarval'); if (kortet) kortet.setAttribute('data-klar', '');
    // Testteamet: sidomenyn börjar med testteamets del
    document.documentElement.toggleAttribute('data-roll-test', u.roll === 'test');
    if (LED) LED.ritaSido();
    flyttaPuck();
  }
  // Skarpt läge: miljöns namn i stället för "prototyp", och länken till användarna för administratörer
  function uppdateraSkal() {
    $$('[data-admin-lank]').forEach((x) => { x.hidden = !arAdmin(); });
    const chip = $('[data-lage-chip]'); const under = $('[data-varumarke-under]');
    if (SKARP) {
      if (chip) {
        const m = L.lage.miljo;
        chip.hidden = m === 'drift';
        chip.innerHTML = `<span class="chip-lang">${m === 'lokal' ? 'Lokal testmiljö' : 'Testmiljö'}</span><span class="chip-kort">Testmiljö</span>`;
        chip.title = m === 'lokal' ? 'Körs på den här datorn med exempeldata – skriv inte in riktiga personuppgifter.' : 'Testmiljö – skriv inte in riktiga personuppgifter.';
      }
      if (under) under.textContent = 'CRM';
      const sr = $('.anvandarval .sr'); if (sr) sr.textContent = 'Inloggad användare';
    }
    // Chip och undertext visas först när läget är känt (annars syns "prototyp" en stund i skarpt läge)
    if (chip) chip.setAttribute('data-klar', ''); if (under) under.setAttribute('data-klar', '');
  }

  /* 16-byggstenar som presentationsläget (mote.js) och 3D-scenerna använder ---------------- */
  window.UPCRM = {
    get db() { return db; }, get jag() { return jag; }, spara, rendera, kund, affar, skapaDokument, dokUrl, logga, nyId, idag, toast, kr, e, ik, affarVarde, orderMakulerad,
    primarKontakt, dokSkapatKvitto,
    EMO: UPEMO, emo, symbol, krKort, plural, kanRaknaLive, moteAffarFor, oppnaMoteLogg,
    // mötesinspelningen (inspelning.js): sparar ljudfilen som ett dokument på samma sätt som uppladdade filer
    laddaUppNarSparat, registreraFil: (id, url) => { filer.set(id, url); spara(); }, get lage() { return L.lage; },
  };

  /* 16b-ledningen (ledning.js) och adminpanelen/säkerhetshubben (sakerhet.js): vägarna, handlarna och formulären läggs in här */
  const BYGG = {
    get db() { return db; }, get jag() { return jag; }, SKARP, L, e, sel, ik, emo, symbol, UPEMO, kr, krKort, pct, sum, plural, formatera, glasKort, sidhjalte, sparkline, mjukLinje,
    oppnaArk, arkHuvud, bekrafta, toast, stangArk: () => { if (ark.open) ark.close(); }, visaFel: (f, n, t) => felFalt(f, n, t),
    relTid, relKort, datumText, dagText, dagarTill, tolka, lokalISO, idag, omDagar, nyId, $, $$, vy, anv, arAktiv, arAdmin, spara, rendera, logga,
    affarVarde, sannolikhet, kund, affar, initialer, bytAnvandare, fyllAnvandarval, saljUi, avatar, kanAterstalla, rollText,
    harVag: (h) => VAGAR.some(([re]) => re && re.test(h)),
    // Serverns loggrader i klartext (säkerhetsloggen i sakerhet.js, samma text som adminloggen i #/anvandare)
    loggText,
  };
  try { LED = window.UPLedning ? window.UPLedning(BYGG) : null; } catch (err) { console.error('[ledning]', err); LED = null; }
  try { ADM = window.UPAdmin ? window.UPAdmin(BYGG, LED) : null; } catch (err) { console.error('[säkerhet]', err); ADM = null; }
  try { CHT = window.UPChatt ? window.UPChatt(BYGG, LED) : null; } catch (err) { console.error('[chatt]', err); CHT = null; }
  for (const m of [LED, ADM, CHT]) if (m) { VAGAR.push(...(m.vagar || [])); Object.assign(G, m.G || {}); Object.assign(FORM, m.FORM || {}); }

  uppdateraSkal();
  fyllAnvandarval();
  uppdateraRaknare();
  rendera(true);

})();
