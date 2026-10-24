/* Uperformance CRM – prislista, flöden och exempeldata.
   Allt här är påhittat och bara till för prototypen. Kund- och klubbnamn är fiktiva. */
'use strict';

/* Prislista – samma som Uperformance_prislista_kund.pdf (exkl. moms) ------------ */
const PRISER = {
  paket: {
    bas: { namn: 'Bas', pris: 1995, ingar: [] },
    basplus: { namn: 'Bas+', pris: 3495, ingar: ['mobilitet'] },
    basplusplus: { namn: 'Bas++', pris: 5995, ingar: ['prestation', 'styrka', 'hopp', 'mjolksyra', 'mobilitet', 'funktion', 'spirometri', 'hjartkarl'] },
  },
  tillval: {
    prestation: { namn: 'Prestationspaket', pris: 1695, omfattar: ['styrka', 'hopp', 'mjolksyra'] },
    mobilitet: { namn: 'Mobilitetsmätning', pris: 495 },
    styrka: { namn: 'Styrketest', pris: 545 },
    hopp: { namn: 'Hopp-/spänsttest', pris: 545 },
    mjolksyra: { namn: 'Mjölksyretest', pris: 495 },
    funktion: { namn: 'Funktionsscreening', pris: 695 },
    spirometri: { namn: 'Spirometri', pris: 395 },
    hjartkarl: { namn: 'Hjärt-/kärlpaket', pris: null },
  },
  appManad: 49,
  insightsAr: 4995,
  uppfoljning: 895,
  forskott: 0.25,
};

/* Pris för en deltagare: paket + tillval som inte redan ingår. Används av både CRM:et
   och kundlänken så att de alltid räknar lika. Hjärt-/kärlpaketet offereras separat. */
function prisaDeltagare(paketId, tillval) {
  const p = PRISER.paket[paketId] || PRISER.paket.bas;
  const ingar = new Set(p.ingar);
  const valda = new Set(tillval || []);
  if (valda.has('prestation') && !ingar.has('prestation')) PRISER.tillval.prestation.omfattar.forEach((x) => ingar.add(x));
  let pris = p.pris; let offert = false;
  valda.forEach((t) => {
    if (ingar.has(t)) return;
    const tv = PRISER.tillval[t]; if (!tv) return;
    if (tv.pris == null) offert = true; else pris += tv.pris;
  });
  return { pris, offert, ingar };
}

/* Priskalkyl för en hel affär: paket × antal, deltagare med eget paket (kundunderlag),
   uppföljning & coaching eller specialoffert. Används av CRM:et och kundoffert. */
function prisaOffert(o) {
  if (o.eget != null) return { eget: true, per: null, test: o.eget, app: 0, uppf: 0, ins: 0, total: o.eget, engang: o.eget, aterkommande: 0, offert: false, ingar: new Set() };
  if (o.typ === 'uppfoljning') {
    // Uppföljning & coaching: omtest som uppdaterar riskprofilen, pris per person
    const n = o.deltagare && o.deltagare.length ? o.deltagare.length : Math.max(0, parseInt(o.antal, 10) || 0);
    const uppf = PRISER.uppfoljning * n; const app = o.app ? PRISER.appManad * 12 * n : 0; const ins = o.insights ? PRISER.insightsAr : 0;
    return { per: PRISER.uppfoljning, test: 0, app, uppf, ins, total: uppf + app + ins, engang: uppf, aterkommande: app + ins, offert: false, ingar: new Set(), coaching: true, antal: n };
  }
  if (o.deltagare && o.deltagare.length) {
    // Från kundunderlaget: varje deltagare har eget paket och egna tillval
    let test = 0; let offert = false;
    o.deltagare.forEach((d) => { const r = prisaDeltagare(d.paket, d.tillval); test += r.pris; if (r.offert) offert = true; });
    const n = o.deltagare.length;
    const app = o.app ? PRISER.appManad * 12 * n : 0; const uppf = o.uppfoljning ? PRISER.uppfoljning * n : 0; const ins = o.insights ? PRISER.insightsAr : 0;
    return { per: test / n, test, app, uppf, ins, total: test + app + uppf + ins, engang: test + uppf, aterkommande: app + ins, offert, ingar: new Set(), underlag: true };
  }
  const p = PRISER.paket[o.paket] || PRISER.paket.bas;
  const ingar = new Set(p.ingar);
  const valda = new Set(o.tillval || []);
  if (valda.has('prestation') && !ingar.has('prestation')) PRISER.tillval.prestation.omfattar.forEach((x) => ingar.add(x));
  let per = p.pris; let offert = false;
  valda.forEach((t) => {
    if (ingar.has(t)) return;
    const tv = PRISER.tillval[t]; if (!tv) return;
    if (tv.pris == null) offert = true; else per += tv.pris;
  });
  const n = Math.max(0, parseInt(o.antal, 10) || 0);
  const test = per * n;
  const app = o.app ? PRISER.appManad * 12 * n : 0;
  const uppf = o.uppfoljning ? PRISER.uppfoljning * n : 0;
  const ins = o.insights ? PRISER.insightsAr : 0;
  return { per, test, app, uppf, ins, total: test + app + uppf + ins, engang: test + uppf, aterkommande: app + ins, offert, ingar };
}

/* Fakturorna i hela kronor: förskott 25 % och slutfaktura för resten – tillsammans alltid exakt ordervärdet
   (två avrundade halvor kunde annars bli en krona för mycket). Används av CRM:et, kundmötet och kundens offert/order. */
function fakturaDelar(total) {
  const t = Math.round(Number(total) || 0);
  const forskott = Math.round(t * PRISER.forskott);
  return { total: t, forskott, slut: t - forskott };
}

/* Innehåll per paket – från Uperformance_prislista_kund.pdf */
const PAKET_INNEHALL = {
  bas: { rubrik: 'Startpunkten – vet var riskerna finns.', lista: ['Hälsodeklaration', 'BMI', 'Branschanpassat rörlighetstest', 'Individuell riskprofil', 'Blodtester, light', 'Handgreppstyrka', 'UPerformance App (introperiod)'] },
  basplus: { rubrik: 'Djupare bild av hjärta, kärl och rörlighet.', lista: ['Allt i Bas', 'Blodtester, fullständigt', 'Mobilitetsmätning'] },
  basplusplus: { rubrik: 'Vår mest kompletta kartläggning.', lista: ['Allt i Bas', 'Hjärt-/kärlpaket (blodtester, EKG, urintest)', 'Prestationspaket (styrka, hopp, mjölksyra, handgrepp)', 'Funktionsscreening', 'Mobilitetsmätning', 'Spirometri'] },
};

/* Specifikationsrader för en offert: [{ text, detalj, antal, apris, summa, offert }] */
function offertRader(o) {
  const rader = [];
  if (o.eget != null) { rader.push({ text: o.beskrivning || 'Specialoffert', antal: 1, apris: o.eget, summa: o.eget }); return rader; }
  const pr = prisaOffert(o);
  if (o.typ === 'uppfoljning') {
    rader.push({ text: 'Uppföljning & coaching', detalj: 'Omtest som uppdaterar riskprofilen och justerar träningsprogrammet', antal: pr.antal, apris: PRISER.uppfoljning, summa: pr.uppf });
  } else {
    const personer = o.deltagare && o.deltagare.length ? o.deltagare : Array.from({ length: Math.max(0, parseInt(o.antal, 10) || 0) }, () => ({ paket: o.paket, tillval: o.tillval || [] }));
    const perPaket = {}; const tillval = {}; let hjartkarl = 0;
    personer.forEach((d) => {
      const r = prisaDeltagare(d.paket, d.tillval);
      perPaket[d.paket] = (perPaket[d.paket] || 0) + 1;
      (d.tillval || []).forEach((t) => { if (r.ingar.has(t)) return; if (PRISER.tillval[t].pris == null) hjartkarl++; else tillval[t] = (tillval[t] || 0) + 1; });
    });
    ['bas', 'basplus', 'basplusplus'].filter((k) => perPaket[k]).forEach((k) => rader.push({ text: PRISER.paket[k].namn, detalj: PAKET_INNEHALL[k].rubrik, antal: perPaket[k], apris: PRISER.paket[k].pris, summa: PRISER.paket[k].pris * perPaket[k] }));
    Object.entries(tillval).forEach(([t, n]) => rader.push({ text: PRISER.tillval[t].namn, detalj: 'Tillval', antal: n, apris: PRISER.tillval[t].pris, summa: PRISER.tillval[t].pris * n }));
    if (hjartkarl) rader.push({ text: 'Hjärt-/kärlpaket', detalj: 'Blodtester fullständigt, EKG och urintest', antal: hjartkarl, apris: null, summa: null, offert: true });
    if (o.uppfoljning) rader.push({ text: 'Uppföljning & coaching', detalj: 'Ett omtest per person', antal: personer.length, apris: PRISER.uppfoljning, summa: pr.uppf });
  }
  const n = o.typ === 'uppfoljning' ? pr.antal : (o.deltagare && o.deltagare.length ? o.deltagare.length : parseInt(o.antal, 10) || 0);
  if (o.app) rader.push({ text: 'UPerformance App, 12 månader', detalj: 'Riskprofil, träningsprogram och påminnelser mellan testerna', antal: n, apris: PRISER.appManad * 12, summa: pr.app });
  if (o.insights) rader.push({ text: 'Team Insights', detalj: 'Avidentifierad organisationsrapport till HR och ledning, per år', antal: 1, apris: PRISER.insightsAr, summa: pr.ins });
  return rader;
}

/* Personnummer: ÅÅÅÅMMDD-NNNN med kontrollsiffra (Luhn). Samordningsnummer (dag + 60) godtas. */
// Kontrollsiffran (Luhn) över tio siffror – samma för personnummer och organisationsnummer
const luhnGiltig = (tio) => { let summa = 0; for (let i = 0; i < 10; i++) { let x = +tio[i] * (i % 2 === 0 ? 2 : 1); if (x > 9) x -= 9; summa += x; } return summa % 10 === 0; };
const PNR_MONSTER = /^(\d{2})?(\d{2})(\d{2})(\d{2})([-+]?)(\d{4})$/;
const pnrDatumOk = (m) => { const manad = +m[3], dag = +m[4] > 60 ? +m[4] - 60 : +m[4]; return manad >= 1 && manad <= 12 && dag >= 1 && dag <= 31; };
function normaliseraPnr(varde) {
  const m = String(varde || '').replace(/\s/g, '').match(PNR_MONSTER);
  if (!m) return null;
  let sekel = m[1];
  if (!sekel) { const nu = new Date().getFullYear() % 100; sekel = m[5] === '+' || +m[2] > nu - 15 ? '19' : '20'; } // anställda är minst 15 år
  if (!pnrDatumOk(m)) return null;
  if (!luhnGiltig(m[2] + m[3] + m[4] + m[6])) return null;
  return `${sekel}${m[2]}${m[3]}${m[4]}-${m[6]}`;
}
// Varför ett personnummer inte godtas, i klartext (samma kontroller som normaliseraPnr). Alla texter börjar med "Ogiltigt personnummer".
function pnrFelText(varde) {
  const m = String(varde || '').replace(/\s/g, '').match(PNR_MONSTER);
  if (!m) return 'Ogiltigt personnummer – skriv ÅÅÅÅMMDD-NNNN';
  if (!pnrDatumOk(m)) return 'Ogiltigt personnummer – datumet stämmer inte';
  if (!luhnGiltig(m[2] + m[3] + m[4] + m[6])) return 'Ogiltigt personnummer – kontrollsiffran stämmer inte';
  return null;
}
const maskeraPnr = (pnr) => (pnr ? String(pnr).slice(0, 8) + '-••••' : '');

/* Kundunderlag – ersätter Excelarket (Kunduppgifter, Beställning, Summering) -------- */
const FORETAG_FALT = [
  { id: 'namn', etikett: 'Företagsnamn' },
  { id: 'orgnr', etikett: 'Organisationsnummer', hint: 'NNNNNN-NNNN' },
  { id: 'kontakt', etikett: 'Kontaktperson' },
  { id: 'epost', etikett: 'E-post till kontaktpersonen', typ: 'email' },
  { id: 'tel', etikett: 'Telefon till kontaktpersonen', typ: 'tel' },
  { id: 'faktura', etikett: 'Fakturaadress', textarea: true },
  { id: 'period', etikett: 'Önskat testdatum eller period' },
  { id: 'plats', etikett: 'Önskad testplats eller adress' },
];
const EPOST_MONSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function kontrolleraForetag(f) {
  const fel = FORETAG_FALT.filter((x) => !String((f && f[x.id]) || '').trim()).map((x) => `${x.etikett} saknas`);
  if (f && f.orgnr && !/^\d{6}-?\d{4}$/.test(String(f.orgnr).trim())) fel.push('Organisationsnumret ska ha formatet NNNNNN-NNNN');
  if (f && f.epost && !EPOST_MONSTER.test(String(f.epost).trim())) fel.push('E-postadressen till kontaktpersonen ser inte rätt ut');
  return fel;
}
// Varningar som inte stoppar inskickningen: ett organisationsnummer i rätt format vars kontrollsiffra (Luhn) inte stämmer.
// Exempeldatans organisationsnummer är påhittade och har med flit fel kontrollsiffra (då kan de inte tillhöra ett riktigt företag).
function foretagVarningar(f) {
  const v = []; const org = String((f && f.orgnr) || '').trim();
  if (/^\d{6}-?\d{4}$/.test(org) && !luhnGiltig(org.replace('-', ''))) v.push('Kontrollsiffran i organisationsnumret stämmer inte – kontrollera numret');
  return v;
}
// Samma kontroller som kolumnen "Kontroll" i Excelarket.
// Skarpt läge: säljarna får personnumren maskerade (ÅÅÅÅMMDD-••••) och servern räknar pnrStatus (server/personnummer.js) –
// då gäller statusen, eftersom numret inte går att kontrollera här. Ett nytt nummer som någon skriver in kontrolleras som vanligt.
const PNR_STATUS_FEL = { saknas: 'Personnummer saknas', ogiltigt: 'Ogiltigt personnummer – kontrollera numret', dubbel: 'Personnumret finns två gånger' };
const pnrMaskerat = (d) => typeof d.pnrStatus === 'string' && String(d.pnr || '').includes('•');
function kontrolleraDeltagare(lista) {
  const pnrAntal = {}; const epostAntal = {};
  lista.forEach((d) => {
    const p = pnrMaskerat(d) ? null : normaliseraPnr(d.pnr); if (p) pnrAntal[p] = (pnrAntal[p] || 0) + 1;
    const m = String(d.epost || '').trim().toLowerCase(); if (m) epostAntal[m] = (epostAntal[m] || 0) + 1;
  });
  return lista.map((d) => {
    const fel = [];
    if (!String(d.namn || '').trim()) fel.push('Namn saknas');
    const m = String(d.epost || '').trim().toLowerCase();
    if (!m) fel.push('E-post saknas'); else if (!EPOST_MONSTER.test(m)) fel.push('Ogiltig e-post'); else if (epostAntal[m] > 1) fel.push('E-posten finns två gånger');
    if (pnrMaskerat(d)) { if (PNR_STATUS_FEL[d.pnrStatus]) fel.push(PNR_STATUS_FEL[d.pnrStatus]); }
    else if (!String(d.pnr || '').trim()) fel.push('Personnummer saknas');
    else { const p = normaliseraPnr(d.pnr); if (!p) fel.push(pnrFelText(d.pnr) || 'Ogiltigt personnummer'); else if (pnrAntal[p] > 1) fel.push('Personnumret finns två gånger'); }
    return fel;
  });
}
// Samma siffror som fliken "Summering"
function summeraUnderlag(lank) {
  const lista = (lank && lank.deltagare) || [];
  const perPaket = { bas: 0, basplus: 0, basplusplus: 0 };
  const tillval = {}; let total = 0; let hjartkarl = 0;
  lista.forEach((d) => {
    const r = prisaDeltagare(d.paket, d.tillval);
    perPaket[d.paket] = (perPaket[d.paket] || 0) + 1; total += r.pris;
    (d.tillval || []).forEach((t) => { if (r.ingar.has(t)) return; if (t === 'hjartkarl') hjartkarl++; else tillval[t] = (tillval[t] || 0) + 1; });
  });
  const fel = kontrolleraDeltagare(lista);
  const foretagFel = kontrolleraForetag(lank && lank.foretag);
  const varningar = fel.filter((x) => x.length).length;
  return { antal: lista.length, perPaket, tillval, hjartkarl, total, snitt: lista.length ? total / lista.length : 0, fel, varningar, foretagFel, foretagVarningar: foretagVarningar(lank && lank.foretag), komplett: lista.length > 0 && !varningar && !foretagFel.length };
}

/* Hälsoformulär – frågebatteriet som varje deltagare besvarar innan testerna ----------
   Ligger under beställningslänken men besvaras av deltagaren själv via en personlig länk
   (halsa.html#h=<nyckel>). Svaren går till Uperformances testteam – arbetsgivaren ser bara status. */
const HALSOFRAGOR = [
  { id: 'namn', grupp: 'om', etikett: 'Namn', kort: 'Namn', typ: 'text', auto: 'name' },
  { id: 'fodd', grupp: 'om', etikett: 'Födelsedag', kort: 'Födelsedag', typ: 'date', auto: 'bday' },
  { id: 'epost', grupp: 'om', etikett: 'E-postadress', kort: 'E-post', typ: 'email', auto: 'email' },
  { id: 'tel', grupp: 'om', etikett: 'Telefonnummer', kort: 'Telefon', typ: 'tel', auto: 'tel' },
  { id: 'titel', grupp: 'om', etikett: 'Arbetstitel', kort: 'Arbetstitel', typ: 'text', auto: 'organization-title' },
  { id: 'vikt', grupp: 'kropp', etikett: 'Vikt', kort: 'Vikt', typ: 'number', enhet: 'kg', min: 30, max: 250 },
  { id: 'langd', grupp: 'kropp', etikett: 'Längd', kort: 'Längd', typ: 'number', enhet: 'cm', min: 120, max: 230 },
  { id: 'ben', grupp: 'kropp', etikett: 'Dominant ben', kort: 'Dominant ben', typ: 'val', val: [['hoger', 'Höger'], ['vanster', 'Vänster'], ['bada', 'Båda']] },
  { id: 'hjartlunga', grupp: 'halsa', etikett: 'Har du några hjärt- eller lungproblem?', kort: 'Hjärt-/lungproblem', typ: 'val', val: [['ja', 'Ja'], ['nej', 'Nej']] },
  { id: 'hinder', grupp: 'halsa', etikett: 'Har du något medicinskt hinder för en något ansträngande undersökning?', kort: 'Medicinskt hinder', hint: 'Om ja – kan vi kontakta dig?', typ: 'val', val: [['ja-kontakt', 'Ja'], ['ja-ingen-kontakt', 'Ja, men vill inte bli kontaktad'], ['nej', 'Nej']] },
];
const HALSOGRUPPER = { om: 'Om dig', kropp: 'Kropp', halsa: 'Hälsa' };
const HALSOSTATUS = { 'ej-skickat': ['Inte skickat', 'chip'], skickad: ['Skickat', 'chip-navy'], oppnad: ['Öppnat', 'chip-is'], besvarad: ['Klart', 'chip-ok'] };
const svarText = (fraga, varde) => { const f = HALSOFRAGOR.find((x) => x.id === fraga); const v = f && f.val && f.val.find(([id]) => id === varde); return v ? v[1] : varde || ''; };

// Födelsedag (ÅÅÅÅ-MM-DD) ur ett personnummer – förifyller formuläret
function fodelsedagFranPnr(pnr) {
  const p = normaliseraPnr(pnr); if (!p) return '';
  return `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;
}
const alderFran = (fodd, nu = new Date()) => {
  const d = new Date(fodd + 'T12:00:00'); if (isNaN(d)) return null;
  let ar = nu.getFullYear() - d.getFullYear();
  if (nu.getMonth() < d.getMonth() || (nu.getMonth() === d.getMonth() && nu.getDate() < d.getDate())) ar--;
  return ar;
};
// Ger { fältid: felmeddelande } – tomt objekt när allt är rätt
function kontrolleraHalsosvar(s) {
  const fel = {}; s = s || {};
  HALSOFRAGOR.forEach((f) => { if (!String(s[f.id] ?? '').trim()) fel[f.id] = f.typ === 'val' ? 'Välj ett svar' : `${f.etikett} saknas`; });
  // Felet säger varför (testpersonen 19121212-1212 ger t.ex. en förifylld födelsedag över 100 år)
  if (s.fodd && !fel.fodd) { const a = alderFran(s.fodd); if (a == null || a < 15 || a > 100) fel.fodd = a == null ? 'Kontrollera födelsedagen' : 'Kontrollera födelsedagen – åldern ska vara mellan 15 och 100 år'; }
  if (s.epost && !fel.epost && !EPOST_MONSTER.test(String(s.epost).trim())) fel.epost = 'E-postadressen ser inte rätt ut';
  if (s.tel && !fel.tel) { const n = String(s.tel).replace(/\D/g, '').length; if (n < 7 || n > 15) fel.tel = 'Telefonnumret ser inte rätt ut'; }
  ['vikt', 'langd'].forEach((id) => {
    const f = HALSOFRAGOR.find((x) => x.id === id); const v = parseFloat(String(s[id] || '').replace(',', '.'));
    if (s[id] && !fel[id] && (isNaN(v) || v < f.min || v > f.max)) fel[id] = `${f.etikett} ska vara mellan ${f.min} och ${f.max} ${f.enhet}`;
  });
  if (!s.samtycke) fel.samtycke = 'Samtycket behövs för att vi ska kunna göra testerna';
  return fel;
}
// Läget för en beställningslänks hälsoformulär: status per deltagare och hur många som är klara
function halsoLage(lank, formular) {
  const per = {}; let klara = 0;
  const lista = (lank && lank.deltagare) || [];
  lista.forEach((d) => {
    const f = d.halsa && formular ? formular[d.halsa] : null;
    const status = f && !f.makulerad ? f.status : 'ej-skickat';
    per[d.id] = { status, token: f && !f.makulerad ? d.halsa : null, f: f && !f.makulerad ? f : null };
    if (status === 'besvarad') klara++;
  });
  const saknas = lista.filter((d) => per[d.id].status !== 'besvarad');
  return { per, klara, totalt: lista.length, saknas, alla: lista.length > 0 && !saknas.length };
}

/* Flöden – från flodesschema-uperformance.pdf ------------------------------------- */
const SALJSTEG = [
  { id: 'kontakt', namn: 'Ny kontakt', hint: 'Första kontakt eller introduktion' },
  { id: 'besok', namn: 'Kundbesök', hint: 'Behov kartläggs, offert tas fram' },
  { id: 'offert', namn: 'Offert skickad', hint: 'Väntar på besked' },
  { id: 'underlag', namn: 'Underlag & samtycke', hint: 'Infodokument, samtycke, PUB-avtal', kontroll: true },
  { id: 'signerad', namn: 'Order signerad', hint: 'Förskottsfaktura 25 %' },
];

const PROJSTEG = [
  { id: 'underlag', namn: 'Underlag mottaget', agare: 'kontroll', hint: 'Kontroll: komplett?' },
  { id: 'bokning', namn: 'Boka tid', agare: 'test', hint: 'Testteamet kontaktar kunden direkt' },
  { id: 'test', namn: 'Genomför test', agare: 'test', hint: 'Inkl. app-onboarding' },
  { id: 'avstamning', namn: 'Avstämning', agare: 'kontroll', hint: 'Genomfört mot beställt' },
  { id: 'slutfaktura', namn: 'Slutfaktura', agare: 'salj', hint: 'Resterande belopp' },
  { id: 'uppfoljning', namn: 'Uppföljningsmöte', agare: 'salj', hint: 'Cirka två månader efter testet' },
  { id: 'klar', namn: 'Klar', agare: 'salj', hint: '' },
];

const AGARE = { salj: 'Sälj', test: 'Testteam', kontroll: 'Kontrollpunkt' };

/* Överlämning från sälj till testteamet. Testteamet har ingen relation till kunden,
   så underlaget ska vara komplett innan det skickas. */
const UNDERLAG_FALT = [
  { id: 'kontakt', etikett: 'Kontaktperson på plats', krav: true },
  { id: 'telefon', etikett: 'Telefon till kontaktpersonen', krav: true, typ: 'tel' },
  { id: 'adress', etikett: 'Adress för testdagen', krav: true },
  { id: 'period', etikett: 'Önskat datum eller period', krav: true },
  { id: 'lokal', etikett: 'Lokal och utrustning på plats', krav: false, hint: 'T.ex. konferensrum, eluttag, parkering' },
  { id: 'bransch', etikett: 'Bransch och särskilda behov', krav: false, hint: 'T.ex. tunga lyft, skiftarbete' },
  { id: 'ovrigt', etikett: 'Övrigt till testteamet', krav: false, textarea: true },
];
const UNDERLAG_KONTROLL = [
  { id: 'deltagarlista', etikett: 'Deltagarlista med personuppgifter och testval mottagen' },
  { id: 'samtycke', etikett: 'Samtycken insamlade' },
  { id: 'pub', etikett: 'PUB-avtal signerat' },
];

/* Klubbmotorn – antaganden från Klubbmotorn.pdf (räkneexempel, inte bekräftade) */
const KLUBBMOTORN = { provision: 0.10, antagenKonvertering: 0.20, antagenSnittaffar: 50000 };

/* Exempeldata ------------------------------------------------------------------------- */
// Närvaro (2026-10-23): statusen man sätter på sitt konto – syns i sidomenyn, på profilen och i försäljningschefens översikt.
// Osynlig visas som Offline för andra; Offline sätts aldrig själv (valbar: false).
const NARVARO = [
  { id: 'online', namn: 'Online', under: 'Tillgänglig', farg: '#3fd59b', ikon: 'bock' },
  { id: 'upptagen', namn: 'Upptagen', under: 'Stör inte', farg: '#ff6b6b', ikon: 'minus-cirkel' },
  { id: 'mote', namn: 'I möte', under: 'Kundmöte eller internt', farg: '#a98bff', ikon: 'mote' },
  { id: 'strax', namn: 'Strax tillbaka', under: 'Snart vid datorn igen', farg: '#ffc857', ikon: 'klocka' },
  { id: 'lunch', namn: 'Lunch', under: 'Tillbaka efter lunch', farg: '#ff9f43', ikon: 'kaffe' },
  { id: 'semester', namn: 'Semester', under: 'Ledig – inga möten', farg: '#4fb3ff', ikon: 'flyg' },
  { id: 'sjuk', namn: 'Sjuk', under: 'Borta idag', farg: '#e07a9a', ikon: 'termometer' },
  { id: 'osynlig', namn: 'Osynlig', under: 'Visas som offline för andra', farg: '#8a96a6', ikon: 'oga-av' },
  { id: 'offline', namn: 'Offline', under: '', farg: '#6b7785', ikon: 'mane', valbar: false },
];

function skapaExempeldata() {
  const idag = new Date(); idag.setHours(12, 0, 0, 0);
  const dag = (n) => { const d = new Date(idag); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const tid = (n, h = 10, m = 0) => { const d = new Date(idag); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };
  // Testdagar ligger på vardagar: en lördag eller söndag flyttas till måndagen efter (datumen räknas från dagen exempeldatan skapas)
  const helg = (iso) => [0, 6].includes(new Date(`${iso}T12:00:00`).getDay());
  const vardag = (n) => { let i = n; while (helg(dag(i))) i++; return dag(i); };
  const dagenFore = (iso) => { const d = new Date(`${iso}T12:00:00`); do d.setDate(d.getDate() - 1); while ([0, 6].includes(d.getDay())); return d.toISOString().slice(0, 10); };
  const TESTDAG_J1 = vardag(9);

  // Teamet (2026-10-23): Gustav är säljare och försäljningschef (byter mellan chefsvy och säljvy), Magnus Andreasson säljare,
  // Dale testansvarig och en administratör (adminpanelen och säkerhetshubben). Roller: roll = salj | test | admin, chef = försäljningschef.
  // Status (närvaro), senast aktiv och månadsmål är exempel – i demoläget sätter var och en sin status själv (profilen, sidomenyn).
  const anvandare = [
    { id: 'gs', namn: 'Gustav Svensson', kort: 'Gustav', initialer: 'GS', roll: 'salj', chef: true, titel: 'Säljare och försäljningschef',
      epost: 'gustav.svensson@exempel.se', tel: '070-100 10 10', mal: 300000, status: { kod: 'online' }, senastAktiv: tid(0, 9, 40), start: dag(-900) },
    { id: 'ma', namn: 'Magnus Andreasson', kort: 'Magnus', initialer: 'MA', roll: 'salj', titel: 'Säljare',
      epost: 'magnus.andreasson@exempel.se', tel: '070-200 20 20', mal: 250000, status: { kod: 'mote', text: 'Kundbesök' }, senastAktiv: tid(0, 8, 55), start: dag(-420) },
    { id: 'dr', namn: 'Dale Reese', kort: 'Dale', initialer: 'DR', roll: 'test', titel: 'Testansvarig',
      epost: 'dale.reese@exempel.se', tel: '070-300 30 30', status: { kod: 'online' }, senastAktiv: tid(0, 10, 5), start: dag(-900) },
    { id: 'ad', namn: 'Administratör', kort: 'Admin', initialer: 'AD', roll: 'admin', admin: true, titel: 'Systemadministratör',
      epost: 'admin@exempel.se', status: { kod: 'osynlig' }, senastAktiv: tid(-1, 16, 20), start: dag(-900) },
  ];
  // Närvaron i försäljningsledningen: arbetsdagar (1 = måndag … 7 = söndag), frånvaro och dagar med inloggning de senaste sex
  // veckorna (exempel). Bara demokontot Magnus har exempel på frånvaro.
  const veckodag = (iso) => ((new Date(`${iso}T12:00:00`).getDay() + 6) % 7) + 1;
  for (const u of anvandare) { u.arbetsdagar = [1, 2, 3, 4, 5]; u.franvaro = []; }
  anvandare[1].franvaro = [{ id: 'fv1', typ: 'ledig', fran: dag(-11), till: dag(-11), notering: 'Kompledigt' }, { id: 'fv2', typ: 'semester', fran: dag(9), till: dag(13) }];
  for (const u of anvandare) {
    u.dagar = Array.from({ length: 42 }, (_, i) => dag(-42 + i)).filter((d) => u.arbetsdagar.includes(veckodag(d)) && !u.franvaro.some((f) => f.fran <= d && d <= f.till));
    if (String(u.senastAktiv).slice(0, 10) === dag(0)) u.dagar.push(dag(0));
  }

  const kunder = [
    // Klubbar med Klubbmotorn-avtal
    { id: 'k1', namn: 'Ekviken IF', typ: 'klubb', bransch: 'Fotboll · herr och dam', stad: 'Stockholm', orgnr: '802400-1111', anstallda: 64, viaKlubb: null, skapad: dag(-420),
      klubbavtal: { procent: 10, form: 'kontant', sedan: dag(-300), partners: 38 },
      kontakter: [{ id: 'p1', namn: 'Lina Holm', roll: 'Kommersiell chef', epost: 'lina.holm@ekvikenif.se', tel: '070-111 22 33' }, { id: 'p2', namn: 'Tobias Ek', roll: 'Fystränare A-lag', epost: 'tobias.ek@ekvikenif.se', tel: '070-111 44 55' }] },
    { id: 'k2', namn: 'Hagvik Hockey', typ: 'klubb', bransch: 'Ishockey', stad: 'Göteborg', orgnr: '852000-2222', anstallda: 41, viaKlubb: null, skapad: dag(-260),
      klubbavtal: { procent: 10, form: 'sponsorvarde', sedan: dag(-200), partners: 24 },
      kontakter: [{ id: 'p3', namn: 'Martin Sjö', roll: 'Partneransvarig', epost: 'martin.sjo@hagvikhockey.se', tel: '073-222 11 00' }] },
    { id: 'k3', namn: 'Norrstrand BK', typ: 'klubb', bransch: 'Fotboll', stad: 'Umeå', orgnr: '894000-3333', anstallda: 22, viaKlubb: null, skapad: dag(-40),
      klubbavtal: { procent: 10, form: 'oklart', sedan: dag(-30), partners: 17 },
      kontakter: [{ id: 'p4', namn: 'Sara Lind', roll: 'Klubbdirektör', epost: 'sara.lind@norrstrandbk.se', tel: '076-333 22 11' }] },

    // Företag
    { id: 'k4', namn: 'Nordlast Logistik AB', typ: 'foretag', bransch: 'Lager & logistik', stad: 'Stockholm', orgnr: '556700-4444', anstallda: 120, viaKlubb: 'k1', skapad: dag(-150),
      kontakter: [{ id: 'p5', namn: 'Johanna Berg', roll: 'HR-chef', epost: 'johanna.berg@nordlast.se', tel: '070-444 55 66' }, { id: 'p6', namn: 'Ali Rahimi', roll: 'Platschef lager', epost: 'ali.rahimi@nordlast.se', tel: '070-444 77 88' }] },
    { id: 'k5', namn: 'Bergmark Bygg AB', typ: 'foretag', bransch: 'Bygg', stad: 'Stockholm', orgnr: '556800-5555', anstallda: 45, viaKlubb: 'k1', skapad: dag(-60),
      kontakter: [{ id: 'p7', namn: 'Peter Bergmark', roll: 'Vd', epost: 'peter@bergmarkbygg.se', tel: '070-555 66 77' }] },
    { id: 'k6', namn: 'Solvik Energi AB', typ: 'foretag', bransch: 'Energi', stad: 'Göteborg', orgnr: '556900-6666', anstallda: 80, viaKlubb: 'k2', skapad: dag(-190),
      kontakter: [{ id: 'p8', namn: 'Emelie Strand', roll: 'HR-partner', epost: 'emelie.strand@solvikenergi.se', tel: '073-666 77 88' }] },
    { id: 'k7', namn: 'Tellus Redovisning AB', typ: 'foretag', bransch: 'Redovisning', stad: 'Stockholm', orgnr: '556100-7777', anstallda: 22, viaKlubb: null, skapad: dag(-20),
      kontakter: [{ id: 'p9', namn: 'Karin Öst', roll: 'Kontorschef', epost: 'karin.ost@tellusredovisning.se', tel: '070-777 88 99' }] },
    { id: 'k8', namn: 'Västkust Åkeri AB', typ: 'foretag', bransch: 'Transport', stad: 'Kungsbacka', orgnr: '556200-8888', anstallda: 65, viaKlubb: 'k2', skapad: dag(-75),
      kontakter: [{ id: 'p10', namn: 'Henrik Dahl', roll: 'Trafikchef', epost: 'henrik.dahl@vastkustakeri.se', tel: '073-888 99 00' }] },
    { id: 'k9', namn: 'Kvarnholm Fastigheter AB', typ: 'foretag', bransch: 'Fastighet', stad: 'Nacka', orgnr: '556300-9999', anstallda: 30, viaKlubb: null, skapad: dag(-400),
      kontakter: [{ id: 'p11', namn: 'Oskar Wiik', roll: 'Vd', epost: 'oskar.wiik@kvarnholmfast.se', tel: '070-999 00 11' }] },
    { id: 'k10', namn: 'Mälarhamnen Lager AB', typ: 'foretag', bransch: 'Lager & logistik', stad: 'Västerås', orgnr: '556400-1010', anstallda: 150, viaKlubb: 'k1', skapad: dag(-6),
      kontakter: [{ id: 'p12', namn: 'Nadia Karlsson', roll: 'HR-ansvarig', epost: 'nadia.karlsson@malarhamnen.se', tel: '070-101 01 01' }] },
    { id: 'k11', namn: 'Hedby Verkstad AB', typ: 'foretag', bransch: 'Tillverkning', stad: 'Umeå', orgnr: '556500-1111', anstallda: 55, viaKlubb: 'k3', skapad: dag(-12), kontakter: [] },
    { id: 'k12', namn: 'Ljung & Partners Advokatbyrå', typ: 'foretag', bransch: 'Juridik', stad: 'Stockholm', orgnr: '556600-1212', anstallda: 18, viaKlubb: null, skapad: dag(-110),
      kontakter: [{ id: 'p13', namn: 'Cecilia Ljung', roll: 'Delägare', epost: 'cecilia@ljungpartners.se', tel: '070-121 21 21' }] },
    { id: 'k13', namn: 'Fjällgren Konsult AB', typ: 'foretag', bransch: 'Konsult', stad: 'Solna', orgnr: '556700-1313', anstallda: 35, viaKlubb: 'k1', skapad: dag(-45),
      kontakter: [{ id: 'p14', namn: 'David Fjällgren', roll: 'Vd', epost: 'david@fjallgren.se', tel: '070-131 31 31' }] },
    { id: 'k14', namn: 'Aska Tandvård AB', typ: 'foretag', bransch: 'Vård', stad: 'Mölndal', orgnr: '556800-1414', anstallda: 25, viaKlubb: 'k2', skapad: dag(-9),
      kontakter: [{ id: 'p15', namn: 'Maria Aska', roll: 'Klinikchef', epost: 'maria@askatandvard.se', tel: '073-141 41 41' }] },
    { id: 'k16', namn: 'Granö Bil AB', typ: 'foretag', bransch: 'Fordonshandel', stad: 'Täby', orgnr: '556100-1616', anstallda: 28, viaKlubb: 'k1', skapad: dag(-240),
      kontakter: [{ id: 'p16', namn: 'Jonas Granö', roll: 'Vd', epost: 'jonas@granobil.se', tel: '070-161 61 61' }] },
    { id: 'k15', namn: 'Stensund Livs AB', typ: 'foretag', bransch: 'Livsmedel', stad: 'Umeå', orgnr: '556900-1515', anstallda: 90, viaKlubb: 'k3', skapad: dag(-12), kontakter: [] },
  ];

  const tomCheck = { info: false, samtycke: false, pub: false, order: false };
  const helCheck = { info: true, samtycke: true, pub: true, order: true };
  const affarer = [
    { id: 'a1', kundId: 'k4', titel: 'Hälsokartläggning lager & kontor', steg: 'signerad', ansvarig: 'gs', skapad: dag(-120), stegAndrad: dag(-18), check: helCheck,
      offert: { paket: 'basplus', antal: 60, tillval: [], app: true, insights: true, uppfoljning: false } },
    { id: 'a2', kundId: 'k5', titel: 'Riskprofil för hela bolaget', steg: 'offert', ansvarig: 'gs', skapad: dag(-50), stegAndrad: dag(-9), check: tomCheck,
      offert: { paket: 'basplusplus', antal: 45, tillval: [], app: true, insights: false, uppfoljning: false } },
    { id: 'a3', kundId: 'k6', titel: 'Hälsokartläggning drift & fält', steg: 'signerad', ansvarig: 'ma', skapad: dag(-170), stegAndrad: dag(-70), check: helCheck,
      offert: { paket: 'bas', antal: 80, tillval: ['prestation'], app: true, insights: false, uppfoljning: true } },
    { id: 'a4', kundId: 'k7', titel: 'Friskvårdssatsning 2027', steg: 'besok', ansvarig: 'ma', skapad: dag(-18), stegAndrad: dag(-4), check: tomCheck,
      offert: { paket: 'bas', antal: 22, tillval: [], app: true, insights: false, uppfoljning: false } },
    { id: 'a5', kundId: 'k8', titel: 'Förarhälsa och rörlighet', steg: 'underlag', ansvarig: 'gs', skapad: dag(-70), stegAndrad: dag(-5), check: { info: true, samtycke: true, pub: false, order: false },
      offert: { paket: 'basplus', antal: 65, tillval: ['funktion'], app: true, insights: false, uppfoljning: false } },
    { id: 'a6', kundId: 'k9', titel: 'Hälsokartläggning 2025', steg: 'signerad', ansvarig: 'gs', skapad: dag(-390), stegAndrad: dag(-360), check: helCheck,
      offert: { paket: 'bas', antal: 30, tillval: [], app: true, insights: false, uppfoljning: false } },
    { id: 'a7', kundId: 'k9', titel: 'Omtest och Team Insights', steg: 'offert', ansvarig: 'gs', skapad: dag(-14), stegAndrad: dag(-3), check: tomCheck,
      offert: { paket: 'basplus', antal: 30, tillval: [], app: true, insights: true, uppfoljning: false } },
    { id: 'a8', kundId: 'k10', titel: 'Introduktion via Ekviken IF', steg: 'kontakt', ansvarig: 'ma', skapad: dag(-6), stegAndrad: dag(-6), check: tomCheck,
      offert: { paket: 'bas', antal: 150, tillval: [], app: true, insights: false, uppfoljning: false } },
    { id: 'a9', kundId: 'k12', titel: 'Hälsokartläggning kontor', steg: 'forlorad', ansvarig: 'ma', skapad: dag(-100), stegAndrad: dag(-60), check: tomCheck,
      forlorad: { orsak: 'Valde att vänta till nästa budgetår', datum: dag(-60) },
      offert: { paket: 'bas', antal: 18, tillval: [], app: false, insights: false, uppfoljning: false } },
    { id: 'a10', kundId: 'k13', titel: 'Riskprofil & prestation', steg: 'signerad', ansvarig: 'gs', skapad: dag(-40), stegAndrad: dag(-2), check: helCheck,
      offert: { paket: 'bas', antal: 35, tillval: ['prestation', 'spirometri'], app: true, insights: false, uppfoljning: false } },
    { id: 'a11', kundId: 'k14', titel: 'Introduktion via Hagvik Hockey', steg: 'kontakt', ansvarig: 'ma', skapad: dag(-9), stegAndrad: dag(-9), check: tomCheck,
      offert: { paket: 'bas', antal: 25, tillval: [], app: true, insights: false, uppfoljning: false } },
    { id: 'a12', kundId: 'k1', titel: 'Försäsongsscreening A-lag', steg: 'signerad', ansvarig: 'gs', skapad: dag(-365), stegAndrad: dag(-340), check: helCheck, typ: 'idrott',
      offert: { eget: 148000, beskrivning: 'Screening 28 spelare enligt förbundets krav, benchmark mot jämförelsetal' } },
    { id: 'a13', kundId: 'k16', titel: 'Hälsokartläggning verkstad & sälj', steg: 'signerad', ansvarig: 'gs', skapad: dag(-230), stegAndrad: dag(-210), check: helCheck, kickbackUtbetald: dag(-120),
      offert: { underlag: 'Gr8nBi1Kx4Pq7Wm2Zt5Hy9Ra', antal: 12, app: true, insights: false, uppfoljning: false,
        deltagare: [...Array(9).fill(0).map(() => ({ paket: 'bas', tillval: ['mobilitet'] })), ...Array(3).fill(0).map(() => ({ paket: 'basplus', tillval: [] }))] } },
  ];

  const projekt = [
    { id: 'j1', affarId: 'a1', kundId: 'k4', steg: 'test', ansvarigTest: 'dr', skickad: dag(-17), underlagStatus: 'komplett', testdatum: TESTDAG_J1, testtid: { start: '08:00', slut: '16:00' },
      underlag: { kontakt: 'Ali Rahimi, platschef', telefon: '070-444 77 88', adress: 'Lagervägen 12, Stockholm', period: 'Vecka 41–42', lokal: 'Konferensrum Plan 2, 12 platser', bransch: 'Tunga lyft, mycket stående arbete', ovrigt: 'Två skiftlag – dela upp testet på förmiddag och eftermiddag.', deltagarlista: true, samtycke: true, pub: true } },
    { id: 'j2', affarId: 'a3', kundId: 'k6', steg: 'uppfoljning', slutfakturaDatum: dag(-35), ansvarigTest: 'dr', skickad: dag(-68), underlagStatus: 'komplett', testdatum: dag(-40), genomforda: 77, apponboarding: true,
      underlag: { kontakt: 'Emelie Strand, HR', telefon: '073-666 77 88', adress: 'Energigatan 3, Göteborg', period: 'Augusti', lokal: 'Personalrum', bransch: 'Fältpersonal med mycket bilkörning', ovrigt: '', deltagarlista: true, samtycke: true, pub: true } },
    { id: 'j3', affarId: 'a6', kundId: 'k9', steg: 'klar', ansvarigTest: 'dr', skickad: dag(-358), underlagStatus: 'komplett', testdatum: dag(-330), genomforda: 30, apponboarding: true, uppfoljningDatum: dag(-270),
      underlag: { kontakt: 'Oskar Wiik', telefon: '070-999 00 11', adress: 'Kvarnholmsvägen 5, Nacka', period: 'November', lokal: 'Styrelserum', bransch: 'Kontor', ovrigt: '', deltagarlista: true, samtycke: true, pub: true } },
    { id: 'j4', affarId: 'a10', kundId: 'k13', steg: 'underlag', ansvarigTest: 'dr', skickad: dag(-2), underlagStatus: 'returnerat', returKommentar: 'Adress och kontaktperson på plats saknas. Är det Solna-kontoret eller hos kund?',
      underlag: { kontakt: '', telefon: '070-131 31 31', adress: '', period: 'Oktober', lokal: '', bransch: 'Konsulter, mycket stillasittande', ovrigt: '', deltagarlista: true, samtycke: true, pub: true } },
    { id: 'j5', affarId: 'a12', kundId: 'k1', steg: 'klar', ansvarigTest: 'dr', skickad: dag(-338), underlagStatus: 'komplett', testdatum: dag(-320), genomforda: 28, apponboarding: true, uppfoljningDatum: dag(-262),
      underlag: { kontakt: 'Tobias Ek, fystränare', telefon: '070-111 44 55', adress: 'Ekvikens IP', period: 'Januari', lokal: 'Omklädningsrum och konstgräs', bransch: 'Elitfotboll, förbundets krav', ovrigt: '', deltagarlista: true, samtycke: true, pub: true } },
    { id: 'j6', affarId: 'a13', kundId: 'k16', steg: 'klar', ansvarigTest: 'dr', skickad: dag(-209), underlagStatus: 'komplett', testdatum: dag(-190), genomforda: 12, apponboarding: true, uppfoljningDatum: dag(-130),
      underlag: { kontakt: 'Jonas Granö', telefon: '070-161 61 61', adress: 'Bilvägen 8, Täby', period: 'Mars', lokal: 'Showroom efter stängning', bransch: 'Verkstad', ovrigt: '', deltagarlista: true, samtycke: true, pub: true } },
  ];

  // Löpnummer ur datumet för exempeldokumenten från förra året (2026 har redan UP-2026-0101 och UP-O-2026-0201, och testerna
  // skapar UP-O-2026-0202 – därför börjar de på 0102 och 0203 om de skulle hamna i 2026)
  const exNr = (typ, n, i = 0) => { const ar = new Date(tid(n)).getFullYear(); const lop = i + (ar === 2026 ? (typ === 'order' ? 2 : 1) : 0);
    return typ === 'order' ? `UP-O-${ar}-${String(201 + lop).padStart(4, '0')}` : `UP-${ar}-${String(101 + lop).padStart(4, '0')}`; };
  const NR_A6 = exNr('offert', -372); const NR_A12 = exNr('offert', -350, new Date(tid(-372)).getFullYear() === new Date(tid(-350)).getFullYear() ? 1 : 0); const NR_A12_ORDER = exNr('order', -342);
  const aktiviteter = [
    { id: 'x1', kundId: 'k4', typ: 'mote', text: 'Kundbesök hos Johanna och Ali. Stort fokus på rygg och axlar i lagret. De vill ha med kontoret också.', av: 'gs', tid: tid(-118, 13) },
    { id: 'x2', kundId: 'k4', typ: 'system', text: 'Order signerad – förskottsfaktura 25 % skickad.', av: 'gs', tid: tid(-18, 15) },
    { id: 'x3', kundId: 'k4', typ: 'system', text: 'Underlaget godkändes av testteamet. Testdag bokad.', av: 'dr', tid: tid(-12, 9) },
    { id: 'x4', kundId: 'k5', typ: 'samtal', text: 'Peter ringde tillbaka – vill jämföra med företagshälsovården de har i dag. Återkommer efter ledningsmöte.', av: 'gs', tid: tid(-3, 11) },
    { id: 'x5', kundId: 'k5', typ: 'anteckning', text: 'Introducerad av Lina Holm på Ekvikens partnerlunch.', av: 'gs', tid: tid(-58, 12) },
    { id: 'x6', kundId: 'k8', typ: 'mejl', text: 'Skickade infodokument för personuppgifter och testval. PUB-avtal kommer från deras jurist.', av: 'gs', tid: tid(-5, 16) },
    { id: 'x7', kundId: 'k7', typ: 'mote', text: 'Första möte med Karin. Små team, vill ha något som känns personligt. Förslag: Bas + app.', av: 'ma', tid: tid(-4, 10) },
    { id: 'x8', kundId: 'k9', typ: 'mote', text: 'Uppföljningsmöte efter testdagen. Nöjda, vill göra omtest nästa år.', av: 'gs', tid: tid(-270, 14) },
    { id: 'x9', kundId: 'k9', typ: 'samtal', text: 'Oskar vill köra omtest och lägga till Team Insights för ledningsgruppen.', av: 'gs', tid: tid(-14, 9) },
    { id: 'x10', kundId: 'k10', typ: 'anteckning', text: 'Lina på Ekviken presenterade oss för Nadia. Varm lead – 150 anställda i lager.', av: 'ma', tid: tid(-6, 15) },
    { id: 'x11', kundId: 'k13', typ: 'system', text: 'Testteamet returnerade underlaget: adress och kontaktperson på plats saknas.', av: 'dr', tid: tid(-1, 10) },
    { id: 'x12', kundId: 'k1', typ: 'mote', text: 'Genomgång av Klubbmotorn med Lina. De bjuder in oss till partnerlunchen i oktober.', av: 'gs', tid: tid(-25, 12) },
    { id: 'x13', kundId: 'k2', typ: 'samtal', text: 'Martin vill ta provisionen som sponsorvärde i stället för kontant.', av: 'ma', tid: tid(-30, 14) },
    { id: 'x14', kundId: 'k6', typ: 'system', text: 'Test genomfört: 77 av 80 deltagare. Avstämning klar.', av: 'dr', tid: tid(-38, 16) },
    { id: 'x20', kundId: 'k6', typ: 'system', text: 'Slutfaktura skickad (resterande 75 %).', av: 'ma', tid: tid(-35, 10) },
    { id: 'x15', kundId: 'k12', typ: 'system', text: 'Affären markerades som förlorad: Valde att vänta till nästa budgetår.', av: 'ma', tid: tid(-60, 11) },
    { id: 'x16', kundId: 'k3', typ: 'mote', text: 'Avtal om Klubbmotorn klart. Sara skickar lista på partners.', av: 'gs', tid: tid(-30, 13) },
    { id: 'x18', kundId: 'k1', typ: 'system', text: 'Provision för Granö Bil AB utbetald till Ekviken IF.', av: 'gs', tid: tid(-120, 10) },
    { id: 'x19', kundId: 'k16', typ: 'mote', text: 'Uppföljningsmöte – Jonas vill ha omtest om ett år.', av: 'gs', tid: tid(-130, 13) },
    { id: 'x21', kundId: 'k1', typ: 'mote', text: 'Uppföljningsmöte med Tobias: två spelare följs upp för fotleden. Vill göra ny screening inför nästa säsong.', av: 'gs', tid: tid(-262, 13) },
    { id: 'x17', kundId: 'k14', typ: 'anteckning', text: 'Martin på Hagvik introducerade oss. Maria vill ha ett samtal i oktober.', av: 'ma', tid: tid(-9, 10) },
    // Kundernas svar via länk 2025 (samma text som kundlogik.js skriver när kunden godkänner eller signerar)
    { id: 'x22', kundId: 'k9', affarId: 'a6', typ: 'dokument', text: `Oskar Wiik godkände offert ${NR_A6} (${prisaOffert(affarer.find((x) => x.id === 'a6').offert).total.toLocaleString('sv-SE')} kr exkl. moms).`, av: 'kund', tid: tid(-368, 15) },
    { id: 'x23', kundId: 'k1', affarId: 'a12', typ: 'dokument', text: `Tobias Ek godkände offert ${NR_A12} (${prisaOffert(affarer.find((x) => x.id === 'a12').offert).total.toLocaleString('sv-SE')} kr exkl. moms).`, av: 'kund', tid: tid(-346, 10) },
    { id: 'x24', kundId: 'k1', affarId: 'a12', typ: 'dokument', text: `Lina Holm signerade order ${NR_A12_ORDER} (${prisaOffert(affarer.find((x) => x.id === 'a12').offert).total.toLocaleString('sv-SE')} kr exkl. moms).`, av: 'kund', tid: tid(-340, 9) },
  ];

  const todos = [
    // projektId: uppgiften hör till projektet – den följer med när testdagen bokas om och föreslås som klar när testet är registrerat
    { id: 't1', text: 'Komplettera underlag till testteamet: adress och kontaktperson', kundId: 'k13', ansvarig: 'gs', datum: dag(0), klar: false, projektId: 'j4' },
    { id: 't2', text: 'Ring Peter om offerten', kundId: 'k5', ansvarig: 'gs', datum: dag(-1), klar: false },
    { id: 't3', text: 'Boka första möte med Nadia', kundId: 'k10', ansvarig: 'ma', datum: dag(1), klar: false },
    { id: 't4', text: 'Påminn om PUB-avtalet', kundId: 'k8', ansvarig: 'gs', datum: dag(2), klar: false },
    { id: 't5', text: 'Uppföljningsmöte med Emelie – boka in', kundId: 'k6', ansvarig: 'ma', datum: dag(0), klar: false, projektId: 'j2' },
    { id: 't6', text: 'Packa utrustning för Nordlast', kundId: 'k4', affarId: 'a1', ansvarig: 'dr', datum: dagenFore(TESTDAG_J1), klar: false, projektId: 'j1' },
    { id: 't7', text: 'Hämta partnerlista från Sara', kundId: 'k3', ansvarig: 'gs', datum: dag(5), klar: false },
    { id: 't8', text: 'Förbered partnerlunch Ekviken', kundId: 'k1', ansvarig: 'gs', datum: dag(12), klar: false },
    { id: 't9', text: 'Skicka offert till Tellus', kundId: 'k7', ansvarig: 'ma', datum: dag(3), klar: false },
  ];

  const dokument = [
    { id: 'd1', kundId: 'k4', affarId: 'a1', kategori: 'offert', namn: 'Offert Nordlast Bas+.pdf', storlek: 184000, tid: tid(-110), av: 'gs', exempel: true },
    { id: 'd2', kundId: 'k4', affarId: 'a1', kategori: 'order', namn: 'Order Nordlast signerad.pdf', storlek: 212000, tid: tid(-18), av: 'gs', exempel: true },
    { id: 'd3', kundId: 'k4', affarId: 'a1', kategori: 'pub', namn: 'PUB-avtal Nordlast.pdf', storlek: 96000, tid: tid(-20), av: 'gs', exempel: true },
    { id: 'd4', kundId: 'k5', affarId: 'a2', kategori: 'offert', namn: 'Offert Bergmark Bas++.pdf', storlek: 190000, tid: tid(-9), av: 'gs', exempel: true },
    { id: 'd5', kundId: 'k9', affarId: 'a6', kategori: 'order', namn: 'Order Kvarnholm 2025.pdf', storlek: 150000, tid: tid(-360), av: 'gs', exempel: true },
    { id: 'd6', kundId: 'k1', kategori: 'ovrigt', namn: 'Avtal Klubbmotorn Ekviken IF.pdf', storlek: 120000, tid: tid(-300), av: 'gs', exempel: true },
  ];


  // En kundlänk som kunden har börjat fylla i (Västkust Åkeri, affär a5)
  const kundlankar = {
    Vk7Qm2xR9pLt4Wn8Zc3Hs6Ya: {
      affarId: 'a5', kundId: 'k8', skapad: tid(-6, 9), andrad: tid(-1, 15), utgar: dag(24), status: 'paborjad', oppnad: tid(-5, 8), steg: 2,
      skickadTill: 'henrik.dahl@vastkustakeri.se',
      foretag: { namn: 'Västkust Åkeri AB', orgnr: '556200-8888', kontakt: 'Henrik Dahl', epost: 'henrik.dahl@vastkustakeri.se', tel: '073-888 99 00', faktura: '', period: 'Vecka 44', plats: 'Hamnvägen 4, Kungsbacka' },
      standard: { paket: 'basplus', tillval: ['funktion'] },
      deltagare: [
        { id: 'd1', namn: 'Erik Lund', epost: 'erik.lund@vastkustakeri.se', pnr: '', paket: 'basplus', tillval: ['funktion'] },
        { id: 'd2', namn: 'Sofia Berg', epost: 'sofia.berg@vastkustakeri.se', pnr: '', paket: 'basplus', tillval: ['funktion'] },
        { id: 'd3', namn: 'Mikael Holm', epost: 'mikael.holm@vastkustakeri.se', pnr: '', paket: 'basplusplus', tillval: [] },
        { id: 'd4', namn: 'Jenny Ek', epost: 'jenny.ek@vastkustakeri.se', pnr: '', paket: 'basplus', tillval: ['funktion', 'prestation'] },
        { id: 'd5', namn: 'Ahmed Karimi', epost: 'ahmed.karimi@vastkustakeri', pnr: '', paket: 'basplus', tillval: ['funktion', 'hjartkarl'] },
      ],
    },
    Gr8nBi1Kx4Pq7Wm2Zt5Hy9Ra: {
      affarId: 'a13', kundId: 'k16', skapad: tid(-226, 9), andrad: tid(-214, 15), utgar: dag(-196), status: 'inskickad', oppnad: tid(-225, 8), inskickad: tid(-214, 15), steg: 3,
      foretag: { namn: 'Granö Bil AB', orgnr: '556100-1616', kontakt: 'Jonas Granö', epost: 'jonas@granobil.se', tel: '070-161 61 61', faktura: 'Granö Bil AB, Bilvägen 8, 183 60 Täby', period: 'Mars', plats: 'Bilvägen 8, Täby' },
      standard: { paket: 'bas', tillval: ['mobilitet'] },
      deltagare: [
        { id: 'g1', namn: 'Anders Nilsson', epost: 'anders.nilsson@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g2', namn: 'Maria Lindqvist', epost: 'maria.lindqvist@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g3', namn: 'Johan Ek', epost: 'johan.ek@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g4', namn: 'Elin Sandberg', epost: 'elin.sandberg@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g5', namn: 'Oskar Åberg', epost: 'oskar.aberg@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g6', namn: 'Sara Nyström', epost: 'sara.nystrom@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g7', namn: 'Peter Holm', epost: 'peter.holm@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g8', namn: 'Emma Falk', epost: 'emma.falk@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g9', namn: 'Daniel Berg', epost: 'daniel.berg@granobil.se', pnr: '', paket: 'bas', tillval: ['mobilitet'] },
        { id: 'g10', namn: 'Hanna Lund', epost: 'hanna.lund@granobil.se', pnr: '', paket: 'basplus', tillval: [] },
        { id: 'g11', namn: 'Mattias Ström', epost: 'mattias.strom@granobil.se', pnr: '', paket: 'basplus', tillval: [] },
        { id: 'g12', namn: 'Lisa Wikström', epost: 'lisa.wikstrom@granobil.se', pnr: '', paket: 'basplus', tillval: [] },
      ],
    },
  };


  // Hälsoformulär: Granö har svarat (underlaget är inskickat), Västkust är på väg
  const halsoformular = {};
  const hNyckel = (lt, id) => ('H' + id + lt).replace(/[^A-Za-z0-9]/g, '').slice(0, 22);
  const lagaFormular = (lt, d, status, dagar, svar) => {
    const l = kundlankar[lt]; const t = hNyckel(lt, d.id); d.halsa = t;
    halsoformular[t] = {
      lank: lt, deltagare: d.id, kundId: l.kundId, affarId: l.affarId, status, skickad: tid(dagar - 2, 9), andrad: tid(dagar, 12),
      forifyllt: { namn: d.namn, epost: d.epost, fodd: fodelsedagFranPnr(d.pnr) },
      ...(status !== 'skickad' ? { oppnad: tid(dagar, 10) } : {}),
      ...(svar ? { besvarad: tid(dagar, 12), svar: { namn: d.namn, epost: d.epost, samtycke: true, ...svar } } : {}),
    };
  };
  const svar = ([fodd, tel, titel, vikt, langd, ben, hjartlunga, hinder]) => ({ fodd, tel, titel, vikt, langd, ben, hjartlunga, hinder });
  [
    ['1971-04-12', '070-161 20 01', 'Verkstadschef', '88', '181', 'hoger', 'nej', 'nej'],
    ['1984-09-03', '070-161 20 02', 'Bilförsäljare', '64', '168', 'hoger', 'nej', 'nej'],
    ['1990-01-22', '070-161 20 03', 'Mekaniker', '82', '179', 'vanster', 'nej', 'nej'],
    ['1988-06-15', '070-161 20 04', 'Servicerådgivare', '59', '165', 'hoger', 'nej', 'nej'],
    ['1995-11-30', '070-161 20 05', 'Mekaniker', '76', '183', 'bada', 'nej', 'nej'],
    ['1979-02-08', '070-161 20 06', 'Ekonomiansvarig', '70', '172', 'hoger', 'ja', 'ja-kontakt'],
    ['1966-07-19', '070-161 20 07', 'Reservdelslager', '95', '178', 'hoger', 'nej', 'ja-kontakt'],
    ['1992-03-27', '070-161 20 08', 'Bilförsäljare', '61', '170', 'vanster', 'nej', 'nej'],
    ['1987-12-05', '070-161 20 09', 'Mekaniker', '84', '185', 'hoger', 'nej', 'nej'],
    ['1983-05-11', '070-161 20 10', 'Administratör', '66', '169', 'hoger', 'nej', 'nej'],
    ['1975-08-24', '070-161 20 11', 'Försäljningschef', '91', '188', 'hoger', 'ja', 'nej'],
    ['1998-10-02', '070-161 20 12', 'Bilrekond', '57', '163', 'bada', 'nej', 'ja-ingen-kontakt'],
  ].forEach((x, i) => lagaFormular('Gr8nBi1Kx4Pq7Wm2Zt5Hy9Ra', kundlankar.Gr8nBi1Kx4Pq7Wm2Zt5Hy9Ra.deltagare[i], 'besvarad', -218 + (i % 4), svar(x)));
  const vk = kundlankar.Vk7Qm2xR9pLt4Wn8Zc3Hs6Ya.deltagare;
  lagaFormular('Vk7Qm2xR9pLt4Wn8Zc3Hs6Ya', vk[0], 'besvarad', -2, svar(['1986-03-14', '073-100 20 30', 'Lastbilschaufför', '86', '182', 'hoger', 'nej', 'nej']));
  lagaFormular('Vk7Qm2xR9pLt4Wn8Zc3Hs6Ya', vk[1], 'oppnad', -1);
  lagaFormular('Vk7Qm2xR9pLt4Wn8Zc3Hs6Ya', vk[2], 'skickad', -1);
  lagaFormular('Vk7Qm2xR9pLt4Wn8Zc3Hs6Ya', vk[3], 'besvarad', -1, svar(['1993-08-09', '073-100 20 31', 'Transportledare', '63', '167', 'vanster', 'nej', 'ja-kontakt']));

  // En offert som skickats till Bergmark Bygg (affär a2) och som kunden har öppnat
  const bergmark = affarer.find((x) => x.id === 'a2');
  const offerter = {
    Of7Bm2Kq9Xw4Rt8Zp3Hn6Vy: {
      typ: 'offert', affarId: 'a2', kundId: 'k5', nummer: 'UP-2026-0101', skapad: tid(-9, 11), andrad: tid(-8, 9), giltigTill: dag(21), status: 'oppnad', oppnad: tid(-8, 9),
      titel: bergmark.titel, offert: JSON.parse(JSON.stringify(bergmark.offert)),
      kund: { namn: 'Bergmark Bygg AB', orgnr: '556800-5555' }, kontakt: { namn: 'Peter Bergmark', roll: 'Vd', epost: 'peter@bergmarkbygg.se', tel: '070-555 66 77' }, saljare: 'Gustav Svensson',
      intro: 'Tack för ett bra möte. Här är vårt förslag på en komplett hälsokartläggning för hela bolaget – med extra fokus på rörlighet och belastning i byggarbetet.',
    },
    Or4Nl9Qx2Wk7Tz5Hm8Pb3Cv: {
      typ: 'order', affarId: 'a1', kundId: 'k4', nummer: 'UP-O-2026-0201', skapad: tid(-19, 10), andrad: tid(-18, 14), giltigTill: dag(-5), status: 'signerad', oppnad: tid(-19, 13), godkand: tid(-18, 14), godkandAv: { namn: 'Johanna Berg', roll: 'HR-chef' },
      titel: 'Hälsokartläggning lager & kontor', offert: JSON.parse(JSON.stringify(affarer.find((x) => x.id === 'a1').offert)),
      kund: { namn: 'Nordlast Logistik AB', orgnr: '556700-4444' }, kontakt: { namn: 'Johanna Berg', roll: 'HR-chef', epost: 'johanna.berg@nordlast.se', tel: '070-444 55 66' }, saljare: 'Gustav Svensson', offertNummer: null,
      intro: 'Här är ordern för hälsokartläggning lager & kontor. Signera ordern så fakturerar vi förskottet och vårt testteam kontaktar er för att boka testdagen.',
      leverans: { plats: 'Lagervägen 12, Stockholm', period: 'Vecka 41–42', faktura: 'Nordlast Logistik AB\nFakturor, Box 400\n120 30 Stockholm', underlagInskickat: null }, deltagare: null,
    },
    // Två affärer från 2025 som gick hela vägen via länk – svarstiderna i Dokument räknas ur dem, Nordlasts order och kundunderlagen
    Ok2Kv7Wm4Xr9Tb3Zn6Hq8Lp: {
      typ: 'offert', affarId: 'a6', kundId: 'k9', nummer: NR_A6, skapad: tid(-372, 10), andrad: tid(-368, 15), giltigTill: dag(-342), status: 'godkand', oppnad: tid(-371, 8, 30), godkand: tid(-368, 15), godkandAv: { namn: 'Oskar Wiik', roll: 'Vd' },
      titel: 'Hälsokartläggning 2025', offert: JSON.parse(JSON.stringify(affarer.find((x) => x.id === 'a6').offert)),
      kund: { namn: 'Kvarnholm Fastigheter AB', orgnr: '556300-9999' }, kontakt: { namn: 'Oskar Wiik', roll: 'Vd', epost: 'oskar.wiik@kvarnholmfast.se', tel: '070-999 00 11' }, saljare: 'Gustav Svensson',
      intro: 'Tack för mötet. Här är vårt förslag på en hälsokartläggning för hela kontoret.',
    },
    Ok5Ek8Wq3Xs6Tm9Zr2Hv4Lb: {
      typ: 'offert', affarId: 'a12', kundId: 'k1', nummer: NR_A12, skapad: tid(-350, 13), andrad: tid(-346, 10), giltigTill: dag(-320), status: 'godkand', oppnad: tid(-349, 19), godkand: tid(-346, 10), godkandAv: { namn: 'Tobias Ek', roll: 'Fystränare A-lag' },
      titel: 'Försäsongsscreening A-lag', offert: JSON.parse(JSON.stringify(affarer.find((x) => x.id === 'a12').offert)),
      kund: { namn: 'Ekviken IF', orgnr: '802400-1111' }, kontakt: { namn: 'Tobias Ek', roll: 'Fystränare A-lag', epost: 'tobias.ek@ekvikenif.se', tel: '070-111 44 55' }, saljare: 'Gustav Svensson',
      intro: 'Här är vårt förslag på försäsongsscreening för A-laget – 28 spelare enligt förbundets krav.',
    },
    Or8Ek3Wn6Xq2Tz7Hs4Pm9Cv: {
      typ: 'order', affarId: 'a12', kundId: 'k1', nummer: NR_A12_ORDER, skapad: tid(-342, 10), andrad: tid(-340, 9), giltigTill: dag(-328), status: 'signerad', oppnad: tid(-342, 12), godkand: tid(-340, 9), godkandAv: { namn: 'Lina Holm', roll: 'Kommersiell chef' },
      titel: 'Försäsongsscreening A-lag', offert: JSON.parse(JSON.stringify(affarer.find((x) => x.id === 'a12').offert)),
      kund: { namn: 'Ekviken IF', orgnr: '802400-1111' }, kontakt: { namn: 'Lina Holm', roll: 'Kommersiell chef', epost: 'lina.holm@ekvikenif.se', tel: '070-111 22 33' }, saljare: 'Gustav Svensson', offertNummer: NR_A12,
      intro: 'Här är ordern för försäsongsscreeningen. Signera ordern så fakturerar vi förskottet och testteamet bokar dagen med er.',
      leverans: { plats: 'Ekvikens IP', period: 'Januari', faktura: 'Ekviken IF', underlagInskickat: null }, deltagare: null,
    },
  };

  // Chatten (exempel): säljteamet, ett privat samtal med Dale och hela teamet – ett par olästa till Gustav så att plinget hörs
  const chatt = {
    kanaler: [
      { id: 'c1', typ: 'grupp', namn: 'Säljteamet', medlemmar: ['gs', 'ma'], skapad: tid(-20, 9), skapadAv: 'gs' },
      { id: 'c2', typ: 'privat', medlemmar: ['gs', 'dr'], skapad: tid(-12, 11), skapadAv: 'dr' },
      { id: 'c3', typ: 'grupp', namn: 'Hela Uperformance', medlemmar: ['gs', 'ma', 'dr', 'ad'], skapad: tid(-6, 9), skapadAv: 'ad' },
    ],
    meddelanden: [
      { id: 'm1', kanal: 'c3', av: 'ad', tid: tid(-6, 9, 1), text: 'Admin skapade gruppen och bjöd in Gustav, Magnus och Dale', system: true },
      { id: 'm2', kanal: 'c3', av: 'ad', tid: tid(-6, 9, 3), text: 'Välkomna till chatten! Här skriver vi privat eller i grupp. Filer och bilder virusskannas innan de skickas.' },
      { id: 'm3', kanal: 'c3', av: 'dr', tid: tid(-6, 9, 20), text: 'Toppen 🙌' },
      { id: 'm4', kanal: 'c1', av: 'ma', tid: tid(-1, 16, 5), text: 'Jag har ett första möte med Tellus Redovisning på torsdag. Vill du vara med, @Gustav?' },
      { id: 'm5', kanal: 'c1', av: 'gs', tid: tid(-1, 16, 12), text: 'Gärna! Vi kör presentationen i Kundmöte tillsammans.', reaktioner: { '👍': ['ma'] } },
      { id: 'm6', kanal: 'c1', av: 'ma', tid: tid(0, 8, 58), text: 'Bra, jag har lagt in mötet. Förslaget blir Bas + app.' },
      { id: 'm7', kanal: 'c2', av: 'dr', tid: tid(-2, 13, 20), text: 'Underlaget för Nordlast ser komplett ut – jag bokar testdagen när samtycket är klart.' },
      { id: 'm8', kanal: 'c2', av: 'gs', tid: tid(-2, 13, 31), text: 'Perfekt, tack Dale!' },
      { id: 'm9', kanal: 'c2', av: 'dr', tid: tid(0, 9, 47), text: 'Testdagen hos Nordlast är bokad. Jag skickar kallelsen till deltagarna i veckan.' },
    ],
    last: { gs: { c1: tid(-1, 16, 12), c2: tid(-2, 13, 31), c3: tid(-6, 9, 30) }, ma: { c1: tid(0, 8, 58), c3: tid(-6, 9, 30) }, dr: { c2: tid(0, 9, 47), c3: tid(-6, 9, 20) }, ad: { c3: tid(-6, 9, 3) } },
    tyst: {},
  };
  return { version: 9, chatt, anvandare, kunder, affarer, projekt, aktiviteter, todos, dokument, kundlankar, offerter, halsoformular };
}
