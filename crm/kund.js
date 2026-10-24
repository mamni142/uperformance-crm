/* Uperformance – kundlänk för underlag. Ersätter Excelarket "Kundunderlag".
   Länken är unik per kund (#t=<nyckel>). All data går via window.UPLager (lager.js):
   i demoläget sparas allt i den här webbläsaren (som tidigare), i skarpt läge hämtas och sparas bara
   den här länken via servern, som validerar nyckeln och kör affärslogiken i kundlogik.js.
   Hälsoformuläret kan vara avstängt i skarpt läge (vy.halsoformularPa) – då döljs steg 3 och dess krav.
   Kundvänd sida: inga emoji, SVG-ikoner och Uperformances färger (designriktningen, princip 7). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kr = (n) => Math.round(n || 0).toLocaleString('sv-SE') + ' kr';
  const ik = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const portal = $('#portal');
  const ark = $('[data-ark]');
  const PAKET_ORDNING = ['bas', 'basplus', 'basplusplus'];
  const L = window.UPLager;
  const skarp = !!(L && L.skarp);
  const miljo = (L && L.lage && L.lage.miljo) || 'demo';
  const sel = (v) => (window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));
  const plural = (n, en, flera) => `${n} ${n === 1 ? en : flera}`;

  /* Tillstånd ------------------------------------------------------------------------------ */
  const token = (location.hash.match(/t=([A-Za-z0-9]+)/) || [])[1];
  const KLAR = 5; // steget efter att underlaget är inskickat
  let lank = null;
  let kund = { namn: '' };
  let saljare = { namn: 'Uperformance', kort: 'oss' };
  let halsoformular = {}; // bara status per formulär – svaren syns aldrig här
  let halsaPa = true; // hälsoformuläret (steg 3) – alltid på i demoläget
  let steg = 1;
  let stoppad = false; // länken har slutat gälla medan sidan var öppen
  let lyssnar = false;
  const oppnaTillval = new Set(); // deltagarrader där hela tillvalslistan är utfälld

  const sparstatus = $('[data-sparstatus]');
  const sparSr = $('[data-spar-sr]');
  let senastFel = false;
  // Den synliga statusen läses inte upp (den ändras vid varje inmatning); skärmläsaren får bara fel och "sparat igen"
  const sparText = (text, sparar) => {
    sparstatus.toggleAttribute('data-sparar', sparar === true);
    sparstatus.toggleAttribute('data-sparfel', sparar === 'fel');
    $('span', sparstatus).textContent = text;
    if (sparSr) {
      if (sparar === 'fel') { sparSr.textContent = text; senastFel = true; } else if (senastFel && sparar !== true) { sparSr.textContent = 'Allt är sparat igen'; senastFel = false; }
    }
  };
  const toast = (text, opt) => (window.UPPortal ? UPPortal.toast(text, opt) : null);
  const varna = (text, under) => toast(text, { typ: 'varning', under });

  /* Lägen innan innehållet finns: hämtar, ogiltig länk, nätverksfel -------------------------- */
  const OGILTIG = {
    utgangen: ['Länken har gått ut', 'Länkar till underlaget gäller i 30 dagar. Be din kontaktperson på Uperformance om en ny länk – det ni redan har fyllt i finns kvar hos oss.'],
    sparrad: ['Länken är stängd', 'Uperformance har stängt den här länken. Kontakta din kontaktperson på Uperformance om ni behöver fortsätta.'],
    saknas: ['Länken hittades inte', 'Kontrollera att hela adressen kom med – långa länkar bryts ibland i e-postprogram. Fungerar den ändå inte, kontakta din kontaktperson på Uperformance.'],
  };
  const tillStart = '<div class="knapprad"><a class="knapp knapp-kontur" href="https://www.uperformance.se/">' + ik('hem') + 'Till uperformance.se</a></div>';
  function visaOgiltig(fel) {
    stoppad = true; clearTimeout(sparTimer); clearTimeout(nyttForsok);
    if (ark.open) ark.close();
    $('[data-saker]').hidden = true; sparstatus.hidden = true;
    const [rubrik, text] = OGILTIG[fel] || OGILTIG.saknas;
    portal.innerHTML = `<section class="kort ogiltig" role="alert"><span class="ogiltig-ikon">${ik('las')}</span><h1>${e(rubrik)}</h1><p>${e(text)}</p>${tillStart}</section>`;
  }
  function visaNatverksfel() {
    sparstatus.hidden = true;
    portal.innerHTML = `<section class="kort ogiltig natfel" role="alert"><span class="ogiltig-ikon">${ik('varning')}</span><h1>Kunde inte nå Uperformance</h1>
      <p>Kontrollera internetanslutningen och försök igen. Det ni redan har fyllt i finns kvar.</p>
      <div class="knapprad"><button class="knapp knapp-accent" type="button" data-g="forsok-igen">Försök igen</button></div></section>`;
  }
  const visaHamtar = () => {
    sparstatus.hidden = true;
    portal.innerHTML = '<p class="hamtar" role="status">Hämtar …</p><div class="skelett" aria-hidden="true"><div class="skelett-hjalte"></div><div class="skelett-rad"><i></i><i></i><i></i><i></i></div></div>';
  };

  // Prototyp-/miljötexten överst: demoläget som tidigare, skarpt läge efter miljö
  const varningHtml = (demo) => (!skarp ? `<p class="prototypvarning">${ik('info')}<span>${demo}</span></p>`
    : miljo === 'lokal' ? `<p class="prototypvarning">${ik('info')}<span><strong>Testmiljö</strong> – skriv inte in riktiga personuppgifter. Testa gärna med Skatteverkets testperson <span class="hel">19121212-1212</span>.</span></p>`
      : `<p class="prototypvarning prototypvarning-lugn">${ik('las')}<span>Uppgifterna hanteras enligt personuppgiftsbiträdesavtalet.</span></p>`);

  /* Vyn från lagret: helt vid start, annars bara det servern styr (skriv aldrig över det kunden skriver) */
  function tillampaVy(vy, helt) {
    if (!vy || !vy.lank) return;
    halsaPa = typeof vy.halsoformularPa === 'boolean' ? vy.halsoformularPa : !(L && L.lage && L.lage.halsoformular === false);
    halsoformular = vy.halsoformular || {};
    kund = vy.kund || { namn: '' };
    saljare = vy.saljare || { namn: 'Uperformance', kort: 'oss' };
    if (helt) {
      lank = vy.lank;
      lank.foretag = lank.foretag || {};
      lank.deltagare = lank.deltagare || [];
      lank.standard = lank.standard || { paket: 'bas', tillval: [] };
      lank.standard.tillval = lank.standard.tillval || [];
      steg = lank.status === 'inskickad' ? KLAR : Math.min(lank.steg || 1, 4);
      if (!halsaPa && steg === 3) steg = 4; // lagrat hälsosteg när hälsoformuläret är avstängt
      return;
    }
    ['status', 'inskickad', 'sparrad', 'utgar', 'oppnad'].forEach((k) => { if (vy.lank[k] === undefined) delete lank[k]; else lank[k] = vy.lank[k]; });
    const halsa = {}; (vy.lank.deltagare || []).forEach((d) => { if (d && d.id) halsa[d.id] = d.halsa || null; });
    lank.deltagare.forEach((d) => {
      if (!Object.prototype.hasOwnProperty.call(halsa, d.id)) return; // ny rad som inte hunnit sparas
      if (halsa[d.id]) d.halsa = halsa[d.id]; else delete d.halsa;
    });
  }
  // Läget som syns för kunden och som andra kan ändra (deltagarnas hälsoformulär)
  const halsoSignatur = () => JSON.stringify(lank.deltagare.map((d) => [d.id, (hlage().per[d.id] || {}).status, ((hlage().per[d.id] || {}).f || {}).paminnd || '']));
  function nyttFranServern(vy) {
    if (!lank || stoppad) return;
    const fore = halsoSignatur(); const varPa = halsaPa;
    tillampaVy(vy, false);
    if (lank.status === 'inskickad' && steg !== KLAR) { steg = KLAR; ark.open && ark.close(); rendera(); return; }
    if (halsoSignatur() === fore && halsaPa === varPa) return;
    if (!halsaPa && steg === 3) { steg = 4; rendera(); return; }
    if (skriverNu()) uppdateraLive(); else rendera();
  }
  // Fokus i ett fält (även kryssrutorna i steg 4): uppdateraLive i stället för en hel omritning, så att fokus står kvar –
  // uppdateraLive ritar också om steg 4:s Kvar-lista och skicka-knappen
  const skriverNu = () => !!(document.activeElement && document.activeElement.matches && document.activeElement.matches('input, textarea')) || ark.open;

  /* Spara – autosparning via lagret. Hela underlaget skickas varje gång (servern ändrar bara det som
     skiljer sig), ett anrop i taget, och det som ändras under tiden skickas efteråt. */
  let sparTimer = null; let nyttForsok = null; let pagaende = null; let smutsig = false; let felForsok = 0;
  const VANTA = [2000, 5000, 15000, 30000];
  function andringFranLank() {
    const foretag = {}; FORETAG_FALT.forEach((f) => { foretag[f.id] = String(lank.foretag[f.id] ?? ''); });
    const andring = {
      foretag,
      deltagare: lank.deltagare.map((d) => ({ id: d.id, namn: String(d.namn ?? ''), epost: String(d.epost ?? ''), pnr: String(d.pnr ?? ''), paket: d.paket, tillval: [...(d.tillval || [])] })),
      standard: { paket: lank.standard.paket, tillval: [...(lank.standard.tillval || [])] },
      bekraftelse1: !!lank.bekraftelse1, bekraftelse2: !!lank.bekraftelse2,
      meddelande: String(lank.meddelande ?? ''),
    };
    if (Number.isInteger(lank.steg) && lank.steg >= 1 && lank.steg <= 4) andring.steg = lank.steg;
    return andring;
  }
  function sparaSnart() {
    if (stoppad) return;
    smutsig = true; sparText('Sparar…', true);
    clearTimeout(sparTimer); sparTimer = setTimeout(sparaNu, 450);
  }
  function spara() { if (stoppad) return Promise.resolve(false); smutsig = true; sparText('Sparar…', true); return sparaNu(); }
  // Skickar det som väntar och löser med true när allt är sparat
  function sparaNu() {
    clearTimeout(sparTimer); sparTimer = null; clearTimeout(nyttForsok); nyttForsok = null;
    if (!pagaende) pagaende = sparaSlinga().finally(() => { pagaende = null; });
    return pagaende;
  }
  async function sparaSlinga() {
    while (smutsig && lank && !stoppad) {
      smutsig = false;
      const fore = halsoSignatur();
      const r = await fraga(() => L.kundlank.spara(token, andringFranLank()));
      if (stoppad) return false;
      if (r && r.ok) {
        felForsok = 0;
        if (r.vy) {
          tillampaVy(r.vy, false);
          if (halsoSignatur() !== fore) { if (skriverNu()) uppdateraLive(); else rendera(); }
        }
        continue;
      }
      smutsig = true; // behåll ändringarna
      sparfel(r || { ok: false, fel: 'natverk', status: 0 });
      return false;
    }
    if (!smutsig && !stoppad) sparText('Sparat ' + new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    return !smutsig;
  }
  function sparfel(r) {
    if (r.status === 404 || r.status === 410) { visaOgiltig(r.fel); return; }
    if (r.fel === 'inskickad') { smutsig = false; starta(); return; } // inskickat i en annan flik – visa tacksidan
    if (r.status === 400 || r.status === 403 || r.status === 413) { sparText('Kunde inte spara – kontrollera fälten', 'fel'); varna(felBeskrivning(r), 'Rätta uppgiften så sparas allt automatiskt.'); return; }
    // Nätverksfel, serverfel eller för många anrop: försök igen om en stund
    sparText('Kunde inte spara – försöker igen', 'fel');
    const vanta = r.vantaSek ? r.vantaSek * 1000 : VANTA[Math.min(felForsok, VANTA.length - 1)];
    felForsok++;
    clearTimeout(nyttForsok); nyttForsok = setTimeout(sparaNu, vanta);
  }
  // Det som väntar sparas innan sidan stängs eller döljs; varna om något inte hunnit sparas (skarpt läge)
  addEventListener('pagehide', () => { if (smutsig && !stoppad) sparaNu(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && smutsig && !stoppad) sparaNu(); });
  addEventListener('beforeunload', (ev) => { if (skarp && !stoppad && (smutsig || pagaende)) { ev.preventDefault(); ev.returnValue = ''; } });

  /* Hjälpare ------------------------------------------------------------------------------- */
  const paketNamn = (id) => (PRISER.paket[id] || {}).namn || id;
  // Hälsoläget räknas en gång per omritning (det anropas för varje rad – med många deltagare blev varje tangenttryckning O(n²)).
  // Indata byts bara ut av lagret (lank, halsoformular) eller när rader läggs till/tas bort – nyckeln fångar det, och minnet
  // töms efter den pågående körningen.
  let hlMinne = null;
  const hlage = () => {
    const d = lank.deltagare || []; const nyckel = `${d.length}|${(d[0] || {}).id || ''}|${(d[d.length - 1] || {}).id || ''}`;
    if (!hlMinne || hlMinne.lank !== lank || hlMinne.form !== halsoformular || hlMinne.nyckel !== nyckel) {
      hlMinne = { lank, form: halsoformular, nyckel, v: halsoLage(lank, halsoformular) };
      queueMicrotask(() => { hlMinne = null; });
    }
    return hlMinne.v;
  };
  const hstatus = (status) => HALSOSTATUS[status] || HALSOSTATUS['ej-skickat'];
  const kanSkickas = (d) => !!String(d.namn || '').trim() && EPOST_MONSTER.test(String(d.epost || '').trim());
  const halsoUrl = (t) => new URL(`halsa.html#h=${t}`, location.href).href;
  const datum = (iso) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  const datumLang = (iso) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
  const datumTid = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })} kl. ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`; };
  const sammaDag = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  const tillvalLista = Object.keys(PRISER.tillval);
  const klarhet = () => {
    const s = summeraUnderlag(lank);
    const foretagAndel = 1 - s.foretagFel.filter((f) => f.endsWith('saknas')).length / FORETAG_FALT.length;
    const deltagarAndel = s.antal ? (s.antal - s.varningar) / s.antal : 0;
    if (!halsaPa) return Math.round(((foretagAndel * 0.25 + deltagarAndel * 0.4) / 0.65) * 100);
    const hl = hlage(); const halsoAndel = hl.totalt ? hl.klara / hl.totalt : 0;
    return Math.round((foretagAndel * 0.25 + deltagarAndel * 0.4 + halsoAndel * 0.35) * 100);
  };
  // Lagret avvisar aldrig för väntade fel – men ett oväntat undantag får inte stoppa sidan
  const fraga = async (fn) => { try { return (await fn()) || { ok: false, fel: 'natverk', status: 0 }; } catch (err) { console.error(err); return { ok: false, fel: 'natverk', status: 0 }; } };
  // Vilken rad och vilket fält som stoppade sparningen (svaret har detaljer: { falt: 'deltagare.3.epost', meddelande })
  const FALTNAMN = { namn: 'namn', epost: 'e-post', pnr: 'personnummer', paket: 'paket', id: 'rad-id' };
  function felBeskrivning(r) {
    const d = Array.isArray(r.detaljer) ? r.detaljer.find((x) => x && typeof x.falt === 'string') : null;
    if (!d) return r.meddelande || 'Några uppgifter kunde inte sparas';
    const text = String(d.meddelande || 'ogiltigt värde');
    const rad = /^deltagare\.(\d+)(?:\.(\w+))?$/.exec(d.falt);
    if (rad && lank) {
      const dlt = lank.deltagare[Number(rad[1])];
      return `Rad ${Number(rad[1]) + 1}${dlt && dlt.namn ? ` (${dlt.namn})` : ''}${rad[2] ? ` – ${FALTNAMN[rad[2]] || rad[2]}` : ''}: ${text.charAt(0).toLowerCase() + text.slice(1)}`;
    }
    const ftg = /^foretag\.(\w+)$/.exec(d.falt);
    if (ftg) { const f = FORETAG_FALT.find((x) => x.id === ftg[1]); return `${f ? f.etikett : ftg[1]}: ${text.charAt(0).toLowerCase() + text.slice(1)}`; }
    return r.meddelande || 'Några uppgifter kunde inte sparas';
  }
  // Fel från en åtgärd (skicka hälsoformulär, påminn, skicka in)
  function atgardFel(r) {
    if (r.fel === 'halsoformular-av') { halsaPa = false; if (steg === 3) steg = 4; rendera(); varna('Hälsoformuläret är inte aktiverat', 'Steget är borttaget – ni kan skicka underlaget utan det.'); return; }
    if (r.status === 404 || r.status === 410) { visaOgiltig(r.fel); return; }
    if (r.fel === 'inskickad') { starta(); return; }
    if (r.status === 422 && Array.isArray(r.detaljer) && r.detaljer.length) { rendera(); varna(r.detaljer[0], r.detaljer.length > 1 ? `och ${plural(r.detaljer.length - 1, 'sak till', 'saker till')}` : ''); return; }
    if (r.status === 400) { varna(r.meddelande || 'Uppgifterna kunde inte sparas'); return; }
    varna('Kunde inte nå Uperformance – försök igen', 'Det ni har fyllt i finns kvar.');
  }
  // Första fältet i företagsuppgifterna som saknas eller är fel (för "Nästa steg" och guiden)
  const forstaForetagFalt = (s) => {
    for (const f of FORETAG_FALT) if (s.foretagFel.includes(`${f.etikett} saknas`)) return f.id;
    if (s.foretagFel.some((x) => x.startsWith('Organisationsnumret'))) return 'orgnr';
    if (s.foretagFel.some((x) => x.startsWith('E-postadressen'))) return 'epost';
    return null;
  };
  const vantarPaSvar = (h) => h && (h.status === 'skickad' || h.status === 'oppnad');
  // Påminnelse: tidigast 24 h efter utskick eller förra påminnelsen – direkt om e-postadressen har ändrats
  const epostAndrad = (d, h) => !!(h && h.f && h.f.forifyllt && h.f.forifyllt.epost && String(d.epost || '').trim() && h.f.forifyllt.epost.trim().toLowerCase() !== String(d.epost).trim().toLowerCase());
  const kanPaminnas = (d, h) => {
    if (!vantarPaSvar(h)) return false;
    if (epostAndrad(d, h)) return kanSkickas(d);
    const senast = (h.f && (h.f.paminnd || h.f.skickad)) || '';
    return !senast || Date.now() - new Date(senast).getTime() >= 24 * 3600 * 1000;
  };

  /* Rendering ------------------------------------------------------------------------------
     Samma formspråk som CRM:et: en mörk rundad hjälte överst (hälsning, Nästa steg, framstegsringen och stegen som EN
     glasremsa i hjältens nederkant), under den ljusa ytor med luft – stegets rubrik, vita kort och en mörk summering. */
  const STEG = [
    { nr: 1, namn: 'Företagsuppgifter', kort: 'Företag', ikon: 'byggnad' },
    { nr: 2, namn: 'Deltagare och tester', kort: 'Deltagare', ikon: 'anvandare' },
    { nr: 3, namn: 'Hälsoformulär', kort: 'Hälsa', ikon: 'hjarta' },
    { nr: 4, namn: 'Granska och skicka', kort: 'Skicka', ikon: 'bock' },
  ];
  // Utan hälsoformulär visas stegen 1–3, men de interna numren (1, 2, 4) behålls
  const synligaSteg = () => STEG.filter((x) => halsaPa || x.nr !== 3);
  const visningsNr = (nr) => synligaSteg().findIndex((x) => x.nr === nr) + 1;
  // Stegets rubrik på den ljusa ytan: "Steg 2 av 3", rubrik, ingress och stegets egna knappar till höger
  const panelHuvud = (nr, text, hoger = '') => {
    const x = STEG.find((y) => y.nr === nr); const n = visningsNr(nr);
    return `<header class="kl-huvud"><div class="kl-huvud-text"><p class="kl-ogon"><span class="kl-nr">${n}</span>Steg ${n} av ${synligaSteg().length}</p><h2 tabindex="-1" data-panel-rubrik>${e(x.namn)}</h2><p class="kl-ingress">${text}</p></div>${hoger ? `<div class="kl-huvud-hoger">${hoger}</div>` : ''}</header>`;
  };
  const kortHuvud = (ikon, rubrik, hoger = '', id = '') => `<div class="kl-kort-huvud"><h3 ${id ? `id="${e(id)}"` : ''}><span class="kl-ikon">${ik(ikon)}</span>${rubrik}</h3>${hoger}</div>`;
  // Undertexten i stegremsan räknas fram: hur långt varje steg har kommit
  const stegUnder = (nr, s) => {
    if (nr === 1) return s.foretagFel.length ? `${plural(s.foretagFel.length, 'uppgift', 'uppgifter')} kvar` : 'Alla uppgifter ifyllda';
    if (nr === 2) return !s.antal ? 'Inga deltagare ännu' : `${s.antal - s.varningar} av ${s.antal} klara`;
    if (nr === 3) { const hl = hlage(); return !hl.totalt ? 'Väntar på deltagare' : `${hl.klara} av ${hl.totalt} har svarat`; }
    if (redoAttSkicka(s)) return 'Redo att skicka';
    return s.komplett && (!halsaPa || hlage().alla) ? 'Kvar att bekräfta' : 'Sammanställning och bekräftelse';
  };
  const redoAttSkicka = (s) => s.komplett && (!halsaPa || hlage().alla) && !!lank.bekraftelse1 && !!lank.bekraftelse2;
  const kontaktNamn = () => (saljare.namn && saljare.namn !== 'Uperformance' ? `${saljare.namn} på Uperformance` : 'Uperformance');

  /* Hjältens nyckeltal bredvid ringen (glaspanel): deltagare, hälsoformulär (eller preliminärt värde) och hur länge länken gäller.
     Ritas om när man skriver (uppdateraLive) – samma tal som stegremsan och summeringen. */
  const dagarKvar = () => { const nu = new Date(); nu.setHours(12, 0, 0, 0); return Math.round((new Date(lank.utgar + 'T12:00') - nu) / 864e5); };
  const perPaketText = (s) => PAKET_ORDNING.filter((p) => s.perPaket[p]).map((p) => `${s.perPaket[p]} ${paketNamn(p)}`).join(' · ');
  function faktaHtml(s, klar) {
    const hl = halsaPa ? hlage() : null; const kvar = dagarKvar();
    const KORT = { Hälsoformulär: 'Hälsa', 'Länken gäller': 'Gäller', Preliminärt: 'Värde' };
    const rad = (id, ikon, etikett, tal, under, ton = '') => `<div class="kl-fakta-rad" data-fakta="${id}"${ton ? ` data-ton="${ton}"` : ''}><span class="kl-fakta-ikon">${ik(ikon)}</span><span class="kl-fakta-text"><small><span class="kl-fakta-lang">${etikett}</span>${KORT[etikett] ? `<span class="kl-fakta-kort" aria-hidden="true">${KORT[etikett]}</span>` : ''}</small><strong>${tal}</strong><em>${e(under)}</em></span></div>`;
    return `<div class="kl-fakta" data-fakta-panel>
      ${rad('deltagare', 'anvandare', 'Deltagare', e(s.antal), s.antal ? perPaketText(s) : 'inga tillagda ännu', s.antal && !s.varningar ? 'mint' : '')}
      ${hl ? rad('halsa', 'hjarta', 'Hälsoformulär', `${e(hl.klara)}<span>/${e(hl.totalt)}</span>`, hl.totalt ? 'har svarat' : 'skickas till varje deltagare', hl.alla ? 'mint' : '')
        : rad('varde', 'sparat', 'Preliminärt', e(kr(s.total)), 'exkl. moms')}
      ${klar ? rad('lank', 'bock', 'Inskickat', e(datum(lank.inskickad)), 'till Uperformance', 'mint')
        : rad('lank', 'kalender', 'Länken gäller', `${e(Math.max(0, kvar))}<span> ${kvar === 1 ? 'dag' : 'dagar'}</span>`, `till ${datumLang(lank.utgar)}`, kvar <= 5 ? 'gul' : '')}
    </div>`;
  }
  // Framstegslinjen i toppraden: hur långt underlaget har kommit (transform, ingen ommålning)
  function framsteg(pct) {
    const topp = $('.portal-topp'); if (!topp) return;
    let f = $('.kl-framsteg', topp); if (!f) { topp.insertAdjacentHTML('beforeend', '<div class="kl-framsteg" aria-hidden="true"><i></i></div>'); f = $('.kl-framsteg', topp); }
    f.firstElementChild.style.transform = `scaleX(${(Math.max(0, Math.min(100, pct)) / 100).toFixed(3)})`;
  }
  // Under summeringen (dator): kontakten och vad som händer efter inskickningen – samma steg som efter att underlaget är skickat
  const sidokortHtml = () => {
    const resa = [
      ...(halsaPa ? [['hjarta', 'Hälsoformulären', 'Varje deltagare svarar själv – svaren går direkt till testteamet']] : []),
      ['sparat', 'Offert och order', `${kontaktNamn()} går igenom underlaget och skickar offert och order`],
      ['kalender', 'Testdagen bokas', 'Testteamet kontaktar er och bokar testdagen'],
    ];
    const ini = String(saljare.namn || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    return `<section class="kl-sidokort kl-kontaktkort" aria-label="Din kontakt"><p class="kl-sidokort-etikett">Din kontakt</p>
        <div class="kl-person"><span class="kl-person-ava" aria-hidden="true">${e(ini)}</span><div><strong>${e(saljare.namn || 'Uperformance')}</strong><small>Uperformance AB</small></div></div>
        ${saljare.epost ? `<a class="kl-person-lank" href="mailto:${e(saljare.epost)}">${ik('mejl')}<span>${e(saljare.epost)}</span></a>` : '<p class="kl-sidokort-not">Hör av er till er kontakt om något är oklart – allt ni har fyllt i finns kvar.</p>'}</section>
      ${steg === 4 ? '' : `<section class="kl-sidokort kl-efter" aria-label="Efter att ni skickat"><p class="kl-sidokort-etikett">Efter att ni skickat</p>
        <ol>${resa.map(([ikon, t, u], i) => `<li style="--i:${i}"><span class="kl-efter-ikon">${ik(ikon)}</span><span><strong>${e(t)}</strong><small>${e(u)}</small></span></li>`).join('')}</ol></section>`}`;
  };

  function rendera() {
    if (!lank || stoppad) return;
    const s = summeraUnderlag(lank);
    const fornamn = String(lank.foretag.kontakt || '').trim().split(' ')[0];
    const klar = steg === KLAR;
    const pct = klarhet();
    // Fokus som låg på sidan läggs tillbaka på samma kontroll efter omritningen (paket, tillval, standardval) – eller, om raden
    // togs bort, på nästa rads namnfält. Förut hamnade fokus på body.
    const aktiv = document.activeElement;
    const fokusSel = aktiv && aktiv !== document.body && portal.contains(aktiv) ? (() => {
      const attr = ['g', 'id', 'paket', 'tillval', 'falt', 'foretag', 'steg', 'rad'].filter((k) => aktiv.dataset && aktiv.dataset[k]).map((k) => `[data-${k}="${sel(aktiv.dataset[k])}"]`).join('');
      return attr ? `${aktiv.tagName.toLowerCase()}${attr}` : aktiv.id ? `#${sel(aktiv.id)}` : '';
    })() : '';
    const radFore = fokusSel && aktiv.closest('[data-rad]'); const nastaRad = radFore && radFore.nextElementSibling && radFore.nextElementSibling.dataset ? radFore.nextElementSibling.dataset.rad : null;
    portal.innerHTML = `
      ${varningHtml('<strong>Prototyp.</strong> Skriv inte in riktiga personuppgifter – allt sparas bara i den här webbläsaren. Testa gärna med Skatteverkets testperson <span class="hel">19121212-1212</span>.')}
      <section class="kl-hjalte" data-mork-yta ${klar ? 'data-klar' : ''} aria-labelledby="kl-rubrik">
        <div class="kl-hjalte-text">
          <p class="kl-hjalte-ogon"><span>Kundunderlag</span>${kund.namn ? `<span class="kl-ogon-vem">${e(kund.namn)}</span>` : ''}</p>
          ${klar ? `<h1 id="kl-rubrik">Tack${fornamn ? ` ${e(fornamn)}` : ''}&nbsp;– underlaget är <em>inskickat</em>.</h1>
          <p class="kl-hjalte-ingress">Uppgifterna har kommit fram till Uperformance. Här ser ni vad som händer härnäst – och vad ni skickade.</p>`
            : `<h1 id="kl-rubrik">${fornamn ? `Hej ${e(fornamn)}, välkommen` : 'Välkommen'} till <em>er hälsokartläggning</em>.</h1>
          <p class="kl-hjalte-ingress">Här fyller ni i uppgifterna vi behöver för offert, order och testdag – en rad per anställd, med paket och tillval.${halsaPa ? ' Varje deltagare svarar sedan själv på ett kort hälsoformulär.' : ''} Allt sparas automatiskt, så ni kan gå ifrån och fortsätta senare.</p>
          ${nastaKnapp(s)}`}
        </div>
        <div class="kl-hjalte-sida"><div class="kl-hjalte-ring">${klar ? UPPortal.ring(100, { etikett: 'inskickat', aria: 'Underlaget är inskickat', tyst: true }) : UPPortal.ring(pct)}</div>${faktaHtml(s, klar)}</div>
        ${klar ? resaHtml() : `<nav class="kl-steg" aria-label="Steg" ${halsaPa ? '' : 'data-tre-steg'}>${synligaSteg().map((x, i) => stegKnapp(x, i, s)).join('')}</nav>`}
      </section>
      ${klar ? visaSkickat(s) : `
      <div class="kl-rutnat" data-steg-nu="${steg}">
        <div class="portal-panel kl-panel">${steg === 1 ? visaForetag(s) : steg === 2 ? visaDeltagare() : steg === 3 && halsaPa ? visaHalsa() : visaGranska(s)}</div>
        <div class="kl-sida"><aside class="summering" data-summering aria-label="${steg === 4 ? 'Er beställning' : 'Summering'}">${summeringHtml(s)}</aside>${sidokortHtml()}</div>
      </div>
      ${miniHtml(s, pct)}`}
      <footer class="portal-fot kl-sidfot"><span>${ik('samtal')}<span>${klar ? 'Behöver ni ändra något?' : 'Frågor?'} Kontakta ${e(kontaktNamn())}${saljare.epost ? ` – <a href="mailto:${e(saljare.epost)}">${e(saljare.epost)}</a>` : ''}.</span></span><span>${ik('las')}<span>Uppgifterna hanteras enligt personuppgiftsbiträdesavtalet mellan er och Uperformance.</span></span></footer>`;
    UPPortal.startaRing(); UPPortal.forstaVisning(); framsteg(klar ? 100 : pct);
    nyaRader.clear();
    if (klar && !smutsig) { sparstatus.removeAttribute('data-sparar'); sparstatus.removeAttribute('data-sparfel'); $('span', sparstatus).textContent = 'Inskickat'; }
    bevakaSummering();
    if (fokusSel) { const igen = $(fokusSel, portal) || (nastaRad && $(`[data-rad="${sel(nastaRad)}"] [data-falt="namn"]`, portal)); if (igen) igen.focus({ preventScroll: true }); }
  }
  const stegAndel = (nr, s) => {
    if (nr === 1) return s.foretagFel.length ? Math.max(0, 1 - s.foretagFel.length / FORETAG_FALT.length) : 1;
    if (nr === 2) return s.antal ? (s.antal - s.varningar) / s.antal : 0;
    if (nr === 3) { const hl = hlage(); return hl.totalt ? hl.klara / hl.totalt : 0; }
    return ((lank.bekraftelse1 ? 1 : 0) + (lank.bekraftelse2 ? 1 : 0)) / 2;
  };
  // Pekar på det första som saknas – används i hjältens Nästa steg och i minisumman på mobilen.
  // fokus är en intern väljare för det fält eller den knapp som Nästa steg hoppar till.
  const nastaAtgard = (s) => {
    const hl = hlage();
    if (s.foretagFel.length) { const f = forstaForetagFalt(s); return { text: s.foretagFel.length === 1 ? s.foretagFel[0] : `${s.foretagFel.length} företagsuppgifter saknas`, g: 'steg', steg: 1, fokus: f ? `[data-foretag="${f}"]` : '' }; }
    if (!s.antal) return { text: 'Lägg till deltagarna', g: 'steg', steg: 2, fokus: '[data-g="lagg-till"]' };
    if (s.varningar) { const d = lank.deltagare[s.fel.findIndex((f) => f.length)]; return { text: `${plural(s.varningar, 'deltagarrad', 'deltagarrader')} att komplettera`, g: 'till-rad', id: d.id, steg: 2 }; }
    if (halsaPa && !hl.alla) {
      const ej = lank.deltagare.filter((d) => hl.per[d.id].status === 'ej-skickat').length;
      return ej ? { text: `Skicka hälsoformuläret till ${plural(ej, 'deltagare', 'deltagare')}`, g: 'steg', steg: 3, fokus: '[data-g="skicka-halsa-alla"]' }
        : { text: `Väntar på ${plural(hl.totalt - hl.klara, 'hälsoformulär', 'hälsoformulär')}`, g: 'steg', steg: 3, fokus: '[data-g="paminn-alla"]' };
    }
    if (!lank.bekraftelse1 || !lank.bekraftelse2) return { text: 'Bekräfta och skicka underlaget', g: 'steg', steg: 4, fokus: `[data-bekraftelse="${lank.bekraftelse1 ? 2 : 1}"]` };
    return { text: 'Allt är klart – skicka underlaget', g: 'steg', steg: 4, fokus: '[data-g="skicka"]' };
  };
  const nastaAttr = (n) => `data-g="${e(n.g)}" data-steg="${e(n.steg)}" ${n.id ? `data-id="${e(n.id)}"` : ''} ${n.fokus ? `data-fokus="${e(n.fokus)}"` : ''}`;
  const nastaKnapp = (s) => { const n = nastaAtgard(s); return `<button type="button" class="nasta-knapp" data-nasta-knapp ${nastaAttr(n)}><span><small>Nästa steg</small><strong>${e(n.text)}</strong></span><span class="pil">${ik('pil')}</span></button>`; };
  const stegKnapp = (x, i, s) => {
    const klar = stegKlart(x.nr, s); const aktiv = steg === x.nr;
    return `<button type="button" class="kl-steg-knapp" data-g="steg" data-steg="${x.nr}" style="--i:${i}" ${aktiv ? 'aria-current="step"' : ''} ${klar ? 'data-klar' : ''}><span class="steg-siffra">${klar && !aktiv ? ik('bock') : visningsNr(x.nr)}</span><span class="kl-steg-text"><strong>${e(x.namn)}</strong><em>${e(x.kort)}</em><small data-steg-under>${e(stegUnder(x.nr, s))}</small></span><i class="steg-fyll" style="--f:${stegAndel(x.nr, s).toFixed(3)}" aria-hidden="true"></i></button>`;
  };
  const stegKlart = (nr, s) => (nr === 1 ? !s.foretagFel.length : nr === 2 ? s.antal > 0 && !s.varningar : nr === 3 ? hlage().alla : false);

  /* Steg 1: företagsuppgifterna i tre grupper, med formatfel direkt under fältet ------------- */
  const FORETAG_GRUPPER = [
    { namn: 'Företaget', ikon: 'byggnad', falt: ['namn', 'orgnr', 'faktura'] },
    { namn: 'Kontaktperson', ikon: 'anvandare', falt: ['kontakt', 'epost', 'tel'] },
    { namn: 'Testdagen', ikon: 'kalender', falt: ['period', 'plats'] },
  ];
  // Fält som inte finns i grupperna (om prislistan/datamodellen får fler) hamnar i den första gruppen
  const foretagGrupper = () => {
    const med = new Set(FORETAG_GRUPPER.flatMap((g) => g.falt));
    const rest = FORETAG_FALT.filter((f) => !med.has(f.id)).map((f) => f.id);
    return FORETAG_GRUPPER.map((g, i) => ({ ...g, falt: [...g.falt, ...(i === 0 ? rest : [])].map((id) => FORETAG_FALT.find((f) => f.id === id)).filter(Boolean) }));
  };
  // Formatfel per fält – ett tomt fält är inte fel, det räknas som kvar att fylla i
  const foretagFormatFel = (s) => { const f = {}; s.foretagFel.forEach((x) => { if (x.startsWith('Organisationsnumret')) f.orgnr = x; else if (x.startsWith('E-postadressen')) f.epost = x; }); return f; };
  const gruppKlar = (g, fel) => g.falt.filter((f) => String(lank.foretag[f.id] || '').trim() && !fel[f.id]).length;
  function visaForetag(s) {
    const fel = foretagFormatFel(s);
    const falt = (f) => {
      const id = e(f.id); const v = lank.foretag[f.id] || ''; const ff = String(v).trim() && fel[f.id] ? fel[f.id] : '';
      const attr = `class="falt" id="ftg-${id}" data-foretag="${id}" aria-describedby="ftg-${id}-fel" aria-required="true" ${ff ? 'aria-invalid="true"' : ''}`;
      return `<div class="kl-falt" ${f.textarea ? 'data-bred' : ''} ${String(v).trim() && !fel[f.id] ? 'data-ok' : ''}><label class="etikett" for="ftg-${id}">${e(f.etikett)}<span class="krav" aria-hidden="true">*</span></label>
        ${f.textarea ? `<textarea ${attr} rows="3" maxlength="${f.id === 'faktura' ? 1000 : 300}">${e(v)}</textarea>`
          : `<input ${attr} type="${e(f.typ || 'text')}" maxlength="300" value="${e(v)}" ${f.hint ? `placeholder="${e(f.hint)}"` : ''} autocomplete="${{ epost: 'email', tel: 'tel', kontakt: 'name', namn: 'organization' }[f.id] || 'off'}">`}
        <p class="kl-falt-fel" id="ftg-${id}-fel" data-falt-fel="${id}">${e(ff)}</p></div>`;
    };
    return `${panelHuvud(1, 'Används för offert, order och faktura – och så att testteamet vet vart de ska komma. Alla fält behövs.')}
      ${foretagGrupper().map((g, i) => { const k = gruppKlar(g, fel); return `<section class="kl-kort kl-grupp" aria-labelledby="kl-grupp-${i}">
        ${kortHuvud(g.ikon, e(g.namn), `<span class="kl-raknare" data-grupp-nr="${i}" ${k === g.falt.length ? 'data-klar' : ''}>${k} av ${g.falt.length}</span>`, `kl-grupp-${i}`)}
        <div class="kl-falt-rad">${g.falt.map(falt).join('')}</div></section>`; }).join('')}
      <div class="kl-nav"><span></span><button class="knapp knapp-accent kl-knapp-stor" type="button" data-g="steg" data-steg="2">Nästa: deltagare ${ik('pil')}</button></div>`;
  }

  /* Steg 2: deltagarna ------------------------------------------------------------------- */
  const tillvalChips = (d, prefix = '') => {
    const r = prisaDeltagare(d.paket, d.tillval);
    return tillvalLista.map((t) => {
      const tv = PRISER.tillval[t]; const ingar = r.ingar.has(t); const vald = (d.tillval || []).includes(t) && !ingar;
      return `<button type="button" data-g="${prefix}tillval" data-id="${e(d.id || '')}" data-tillval="${e(t)}" aria-pressed="${vald}" ${ingar ? 'disabled' : ''}>${ingar || vald ? ik('bock') : ''}${e(tv.namn)} · <b>${ingar ? 'ingår' : tv.pris == null ? 'offert' : '+' + e(kr(tv.pris))}</b></button>`;
    }).join('');
  };
  const paketKnappar = (d, prefix = '') => PAKET_ORDNING.map((p) => `<button type="button" data-g="${prefix}paket" data-id="${e(d.id || '')}" data-paket="${e(p)}" aria-pressed="${d.paket === p}">${e(paketNamn(p))}</button>`).join('');
  const valdaTillval = (d) => { const r = prisaDeltagare(d.paket, d.tillval); return (d.tillval || []).filter((t) => PRISER.tillval[t] && !r.ingar.has(t)); };
  const tillvalValdaHtml = (d) => { const v = valdaTillval(d); return v.length ? v.map((t) => `<span class="tillval-vald">${ik('bock')}${e(PRISER.tillval[t].namn)}</span>`).join('') : '<span class="tillval-inga">Inga tillval</span>'; };
  const tillvalVaxlaText = (d) => { const n = valdaTillval(d).length; return oppnaTillval.has(d.id) ? 'Dölj tillval' : `Ändra tillval${n ? ` (${n})` : ''}`; };
  // "saknas" är kvar att fylla i (gul), allt annat är fel (röd)
  const arSaknas = (f) => / saknas$/.test(f);
  const radStatus = (fel) => (fel.length ? fel.map((f) => `<span class="chip ${arSaknas(f) ? 'chip-gul' : 'chip-rod'} chip-prick">${e(f)}</span>`).join('') : `<span class="chip chip-ok">${ik('bock')}Klar</span>`);
  const radLage = (fel) => (!fel.length ? '' : fel.every(arSaknas) ? 'saknas' : 'fel');
  // Vilket fält felet gäller – så att rätt ruta markeras
  const FALT_FEL = { 'Namn saknas': ['namn', 'saknas'], 'E-post saknas': ['epost', 'saknas'], 'Ogiltig e-post': ['epost', 'fel'], 'E-posten finns två gånger': ['epost', 'fel'], 'Personnummer saknas': ['pnr', 'saknas'], 'Ogiltigt personnummer': ['pnr', 'fel'], 'Personnumret finns två gånger': ['pnr', 'fel'] };
  const faltLage = (fel) => { const m = {}; fel.forEach((f) => { const x = FALT_FEL[f]; if (x) m[x[0]] = x[1]; }); return m; };
  const faltAttr = (lage) => (lage === 'fel' ? 'aria-invalid="true"' : lage === 'saknas' ? 'data-saknas' : '');
  const halsaChip = (d) => { const h = hlage().per[d.id] || { status: 'ej-skickat' }; const [txt, cls] = hstatus(h.status); return `${ik('hjarta')}Hälsoformulär <span class="chip ${cls} chip-prick">${e(txt)}</span>`; };
  const radPris = (d) => { const r = prisaDeltagare(d.paket, d.tillval); return `${kr(r.pris)}${r.offert ? ' + offert' : ''}`; };
  const nyaRader = new Set(); // rader som just lagts till – bara de glider in
  const radHtml = (d, fel) => {
    const oppen = oppnaTillval.has(d.id); const m = faltLage(fel); const lage = radLage(fel);
    return `<div class="deltagare" data-rad="${e(d.id)}" ${lage ? `data-varning="${lage}"` : ''} ${nyaRader.has(d.id) ? 'data-ny' : ''}>
      <div class="deltagare-falt">
        <label><span class="kl-radetikett">Namn</span><input class="falt" data-falt="namn" data-id="${e(d.id)}" value="${e(d.namn)}" placeholder="För- och efternamn" maxlength="200" autocomplete="off" ${faltAttr(m.namn)}></label>
        <label><span class="kl-radetikett">E-post</span><input class="falt" type="email" data-falt="epost" data-id="${e(d.id)}" value="${e(d.epost)}" placeholder="namn@foretaget.se" maxlength="254" autocomplete="off" ${faltAttr(m.epost)}></label>
        <label><span class="kl-radetikett">Personnummer</span><input class="falt" data-falt="pnr" data-id="${e(d.id)}" value="${e(d.pnr)}" placeholder="ÅÅÅÅMMDD-NNNN" maxlength="20" inputmode="numeric" autocomplete="off" ${faltAttr(m.pnr)}></label>
      </div>
      <button class="deltagare-ta-bort" type="button" data-g="ta-bort" data-id="${e(d.id)}" aria-label="Ta bort ${e(d.namn || 'deltagaren')}">${ik('stang')}</button>
      <div class="deltagare-val">
        <div class="paketval" role="group" aria-label="Paket">${paketKnappar(d)}</div>
        <div class="tillval-valda" data-tillval-valda aria-label="Valda tillval">${tillvalValdaHtml(d)}</div>
        <button type="button" class="tillval-vaxla" data-g="vaxla-tillval" data-id="${e(d.id)}" aria-expanded="${oppen}" aria-controls="tv-${e(d.id)}"><span>${e(tillvalVaxlaText(d))}</span>${ik('chevron')}</button>
        <div class="tillvalschips" id="tv-${e(d.id)}" role="group" aria-label="Tillval" ${oppen ? '' : 'hidden'}>${tillvalChips(d)}</div>
      </div>
      <div class="deltagare-fot"><div class="deltagare-status" data-rad-status>${radStatus(fel)}</div>${halsaPa ? `<span class="deltagare-halsa" data-rad-halsa>${halsaChip(d)}</span>` : ''}<span class="deltagare-pris" data-rad-pris>${radPris(d)}</span></div>
    </div>`;
  };
  let visaStandard = false; // standardvalet är ihopfällt tills kunden vill ändra det
  const standardText = () => { const st = lank.standard; const tv = valdaTillval(st).map((t) => PRISER.tillval[t].namn); return `${paketNamn(st.paket)} · ${tv.length ? tv.join(', ') : 'inga tillval'}`; };
  function visaDeltagare() {
    const fel = kontrolleraDeltagare(lank.deltagare);
    const st = lank.standard; const n = lank.deltagare.length;
    const knappar = `<button class="knapp knapp-kontur" type="button" data-g="klistra">${ik('klistra')}Klistra in lista</button><button class="knapp knapp-accent" type="button" data-g="lagg-till">${ik('plus')}Lägg till</button>`;
    return `${panelHuvud(2, 'En rad per anställd, med paket och tillval – det som redan ingår i paketet är låst. Enter hoppar till nästa fält; i sista fältet skapas en ny rad.', n ? knappar : '')}
      <section class="kl-kort kl-standard" ${visaStandard ? 'data-oppen' : ''}>
        <button type="button" class="kl-standard-vaxla" data-g="vaxla-standard" aria-expanded="${visaStandard}" aria-controls="kl-standardval"><span class="kl-ikon">${ik('justera')}</span><span class="kl-standard-text"><strong>Standardval för nya rader</strong><small>${e(standardText())}</small></span><span class="kl-standard-andra"><span>${visaStandard ? 'Klar' : 'Ändra'}</span>${ik('chevron')}</span></button>
        <div class="kl-standard-val" id="kl-standardval" role="group" aria-label="Standardval för nya rader" ${visaStandard ? '' : 'hidden'}>
          <p class="kl-standard-not">Nya rader – och inklistrade listor – får det här paketet och de här tillvalen.</p>
          <div class="standardval-rad"><span class="etikett-liten">Paket</span><div class="paketval" role="group" aria-label="Standardpaket">${paketKnappar(st, 'std-')}</div></div>
          <div class="standardval-rad"><span class="etikett-liten">Tillval</span><div class="tillvalschips" role="group" aria-label="Standardtillval">${tillvalChips(st, 'std-')}</div></div>
          <div class="standardval-fot"><button class="knapp knapp-kontur knapp-liten" type="button" data-g="anvand-alla" ${n ? '' : 'disabled title="Lägg till deltagare först"'}>Använd på ${n ? `alla ${n}` : 'alla'}</button></div>
        </div>
      </section>
      <section class="kl-kort kl-lista" aria-label="Deltagare">
        ${n ? '<div class="kl-lista-huvud" aria-hidden="true"><span>Namn</span><span>E-post</span><span>Personnummer</span></div>' : ''}
        <div class="deltagarlista" data-lista>${n ? lank.deltagare.map((d, i) => radHtml(d, fel[i])).join('') + `<button class="knapp knapp-kontur knapp-bred lagg-till-rad" type="button" data-g="lagg-till">${ik('plus')}Lägg till deltagare</button>`
          : `<div class="tom-lista"><span class="kl-ikon kl-ikon-stor">${ik('anvandare')}</span><strong>Inga deltagare ännu</strong><span>Lägg till en i taget, eller klistra in en lista direkt från Excel.</span><div class="knapprad"><button class="knapp knapp-accent" type="button" data-g="lagg-till">${ik('plus')}Lägg till första deltagaren</button><button class="knapp knapp-kontur" type="button" data-g="klistra">${ik('klistra')}Klistra in från Excel</button></div></div>`}</div>
      </section>
      ${halsaPa ? `<p class="kl-not">${ik('hjarta')}<span><strong>Hälsoformulär:</strong> i nästa steg skickar ni en personlig länk till varje deltagare. De svarar själva – svaren går direkt till Uperformance och syns inte för er.</span></p>` : ''}
      <div class="kl-nav"><button class="knapp knapp-spok" type="button" data-g="steg" data-steg="1">${ik('pil-v')}Företagsuppgifter</button><button class="knapp knapp-accent kl-knapp-stor" type="button" data-g="steg" data-steg="${halsaPa ? 3 : 4}">Nästa: ${halsaPa ? 'hälsoformulär' : 'granska'} ${ik('pil')}</button></div>`;
  }

  /* Steg 3: hälsoformuläret (bara när det är aktiverat) -------------------------------------- */
  const halsoRadHtml = (d, h, i) => {
    const [txt, cls] = hstatus(h.status); const f = h.f; const ok = kanSkickas(d);
    const andrad = epostAndrad(d, h); const kan = kanPaminnas(d, h);
    const info = h.status === 'besvarad' ? `Klart ${datum(f.besvarad)} – svaren finns hos Uperformance`
      : h.status === 'ej-skickat' ? (ok ? `Skickas till ${d.epost.trim()}` : 'Namn och en giltig e-postadress behövs först')
      : `${h.status === 'oppnad' ? 'Öppnat' : 'Skickat'} ${datum(f.oppnad || f.skickad)} till ${(f.forifyllt || {}).epost || ''}${f.paminnd ? ` · påmint ${datum(f.paminnd)}` : ''}`;
    const senast = f && (f.paminnd || f.skickad);
    const vantaChip = vantarPaSvar(h) && !kan && senast ? `<span class="chip chip-is chip-prick" title="Ni kan påminna igen 24 timmar efter senaste utskicket">${f.paminnd ? 'Påmint' : 'Skickat'} ${sammaDag(senast) ? 'idag' : 'igår'}</span>` : '';
    // Skarpt läge: den personliga länken går bara till deltagaren (servern skickar den) – arbetsgivaren ser aldrig
    // nyckeln, bara status (h.token är en pseudonym). Demoläget som förut, med kopiera/öppna.
    const knappar = h.status === 'besvarad' ? ''
      : h.status === 'ej-skickat' ? (ok ? `<button class="knapp knapp-mork knapp-liten" type="button" data-g="skicka-halsa" data-id="${e(d.id)}">${ik('mejl')}Skicka</button>` : `<button class="knapp knapp-spok knapp-liten" type="button" data-g="till-rad" data-id="${e(d.id)}">Rätta raden</button>`)
      : `${kan ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="paminn" data-id="${e(d.id)}">${ik('klocka')}${andrad ? 'Påminn på nya adressen' : 'Påminn'}</button>` : vantaChip}${skarp ? '' : `<button class="knapp knapp-spok knapp-liten" type="button" data-g="kopiera-halsa" data-id="${e(d.id)}">${ik('lank')}Kopiera länk</button><a class="knapp knapp-spok knapp-liten" href="${e(halsoUrl(h.token))}" target="_blank" rel="noopener">${ik('oga')}Öppna som deltagare</a>`}`;
    return `<div class="halso-rad" data-halso-rad="${e(d.id)}" ${h.status === 'besvarad' ? 'data-klar' : ''} ${andrad ? 'data-andrad' : ''}><div><strong>${e(d.namn || `Rad ${i + 1}`)}<span class="chip ${cls} chip-prick">${e(txt)}</span></strong><small>${e(info)}</small>${andrad ? `<small class="halso-andrad">E-posten är ändrad till ${e(String(d.epost).trim())} – skicka en påminnelse till den nya adressen.</small>` : ''}</div>${knappar ? `<div class="knapprad">${knappar}</div>` : ''}</div>`;
  };
  // Inte skickade först, sedan de som väntar på svar, sist de som är klara
  const HALSO_ORDNING = { 'ej-skickat': 0, skickad: 1, oppnad: 1, besvarad: 2 };
  function visaHalsa() {
    const hl = hlage();
    const ejSkickade = lank.deltagare.filter((d) => hl.per[d.id].status === 'ej-skickat' && kanSkickas(d));
    const ejSkickatAlla = lank.deltagare.filter((d) => hl.per[d.id].status === 'ej-skickat').length;
    const vantar = lank.deltagare.filter((d) => vantarPaSvar(hl.per[d.id]));
    const paminnbara = vantar.filter((d) => kanPaminnas(d, hl.per[d.id]));
    const andel = hl.totalt ? hl.klara / hl.totalt : 0;
    const epostInfo = !skarp ? `<p class="kl-not">${ik('info')}<span><strong>Prototyp:</strong> inga e-postmeddelanden skickas. Öppna en deltagares länk för att testa formuläret.</span></p>`
      : miljo === 'lokal' ? `<p class="kl-not">${ik('info')}<span><strong>Testmiljö:</strong> e-posten skickas inte på riktigt – meddelandena hamnar i serverns utkorg. Öppna länken därifrån i ett privat fönster för att testa formuläret.</span></p>` : '';
    const status = hl.alla ? 'Alla har svarat – nu kan ni skicka underlaget' : [vantar.length ? `${vantar.length} har inte svarat` : '', ejSkickatAlla ? `${ejSkickatAlla} inte skickat` : ''].filter(Boolean).join(' · ');
    const rader = lank.deltagare.map((d, i) => ({ d, i, h: hl.per[d.id] })).sort((a, b) => (HALSO_ORDNING[a.h.status] - HALSO_ORDNING[b.h.status]) || a.i - b.i);
    return `${panelHuvud(3, 'Frågebatteriet inför testerna. Varje deltagare får en personlig länk och svarar själv – svaren går direkt till Uperformances testteam. Ni ser bara vem som är klar.')}
      <section class="kl-kort">
        ${hl.totalt ? `<div class="halso-oversikt"><div class="halso-tal">${e(hl.klara)}<small>av ${e(hl.totalt)} klara</small></div>
          <div><span class="halso-status">${e(status)}</span>${!hl.alla && vantar.length && paminnbara.length < vantar.length ? `<span class="halso-under">Påminnelser kan skickas 24 timmar efter senaste utskicket.</span>` : ''}<span class="halso-stapel"><i style="transform:scaleX(${andel.toFixed(3)})"></i></span></div>
          ${ejSkickade.length || paminnbara.length ? `<div class="knapprad">${ejSkickade.length ? `<button class="knapp knapp-mork knapp-liten" type="button" data-g="skicka-halsa-alla">${ik('mejl')}Skicka till ${ejSkickade.length === lank.deltagare.length ? 'alla' : plural(ejSkickade.length, 'deltagare', 'deltagare')}</button>` : ''}${paminnbara.length ? `<button class="knapp knapp-kontur knapp-liten" type="button" data-g="paminn-alla">${ik('klocka')}Påminn ${paminnbara.length === 1 ? 'den som inte svarat' : `alla ${paminnbara.length} som inte svarat`}</button>` : ''}</div>` : ''}</div>`
          : `<div class="halso-oversikt" data-tom><span class="halso-status">Lägg till deltagare först</span><span class="halso-under">Hälsoformuläret skickas till varje deltagare på listan.</span><div class="knapprad"><button class="knapp knapp-accent knapp-liten" type="button" data-g="steg" data-steg="2">${ik('anvandare')}Till deltagare</button></div></div>`}
        ${hl.totalt ? `<div class="halso-lista">${rader.map((x) => halsoRadHtml(x.d, x.h, x.i)).join('')}</div>` : ''}
      </section>
      <section class="kl-kort">${kortHuvud('info', 'Det här får deltagarna svara på')}<div class="halso-fragor">${HALSOFRAGOR.map((f) => `<span class="chip">${e(f.kort)}</span>`).join('')}<span class="chip">Samtycke</span></div></section>
      ${epostInfo}
      <div class="kl-nav"><button class="knapp knapp-spok" type="button" data-g="steg" data-steg="2">${ik('pil-v')}Deltagare</button><button class="knapp knapp-accent kl-knapp-stor" type="button" data-g="steg" data-steg="4">Nästa: granska ${ik('pil')}</button></div>`;
  }

  /* Steg 4: granska och skicka – det som är kvar, bekräftelsen och knappen. Beställningen står i summeringen bredvid. */
  // Raderna i beställningen (summeringen i steg 4 och kvittot efter inskickning)
  const sammanstallning = (s) => [
    ...PAKET_ORDNING.filter((p) => s.perPaket[p]).map((p) => ({ namn: paketNamn(p), n: s.perPaket[p], apris: PRISER.paket[p].pris, summa: PRISER.paket[p].pris * s.perPaket[p] })),
    ...Object.entries(s.tillval).map(([t, n]) => ({ namn: '+ ' + PRISER.tillval[t].namn, n, apris: PRISER.tillval[t].pris, summa: PRISER.tillval[t].pris * n })),
    ...(s.hjartkarl ? [{ namn: '+ Hjärt-/kärlpaket', n: s.hjartkarl, apris: null, summa: null }] : []),
  ];
  function visaGranska(s) {
    const varningsRader = lank.deltagare.map((d, i) => ({ d, fel: s.fel[i], i })).filter((x) => x.fel.length);
    const hl = hlage(); const saknasHalsa = halsaPa ? hl.totalt - hl.klara : 0;
    const kanSkicka = redoAttSkicka(s);
    const bakat = halsaPa ? { steg: 3, text: 'Hälsoformulär' } : { steg: 2, text: 'Deltagare' };
    // Samma fel på flera rader blir en rad i checklistan – detaljerna kan fällas ut
    const grupper = new Map();
    varningsRader.forEach((x) => x.fel.forEach((f) => { if (!grupper.has(f)) grupper.set(f, []); grupper.get(f).push(x); }));
    const namnLista = (lista) => { const n = lista.map((x) => String(x.d.namn || '').trim().split(' ')[0] || `rad ${x.i + 1}`); return n.slice(0, 3).join(', ') + (n.length > 3 ? ' …' : ''); };
    const gruppHtml = [...grupper.entries()].map(([fel, lista]) => `<div class="varning-grupp" ${arSaknas(fel) ? 'data-saknas' : ''}><button type="button" data-g="till-rad" data-id="${e(lista[0].d.id)}">${ik('varning')}<span><strong>${e(fel)}</strong> ${lista.length === 1 ? `på rad ${lista[0].i + 1}` : `på ${lista.length} rader`}<small>${e(namnLista(lista))}</small></span><span class="varning-ga"><span>${lista.length === 1 ? 'Gå till raden' : 'Gå till första'}</span>${ik('pil')}</span></button></div>`).join('');
    const antalAtt = s.foretagFel.length + grupper.size + (saknasHalsa ? 1 : 0) + (!s.antal ? 1 : 0);
    // En mening om vad som stoppar knappen – det som är kvar står redan i listan ovanför
    const rutor = (lank.bekraftelse1 ? 0 : 1) + (lank.bekraftelse2 ? 0 : 1);
    const skickaHint = antalAtt ? (rutor ? 'Knappen aktiveras när det som är kvar ovan är klart och båda rutorna är ikryssade.' : 'Knappen aktiveras när det som är kvar ovan är klart.')
      : rutor === 2 ? 'Kryssa i båda rutorna för att skicka.' : 'Kryssa i rutan som är kvar för att skicka.';
    const foretagKnapp = (f) => `<button type="button" ${f.endsWith(' saknas') ? '' : 'data-fel'} data-g="steg" data-steg="1" data-fokus="${e(f.endsWith(' saknas') ? `[data-foretag="${(FORETAG_FALT.find((x) => `${x.etikett} saknas` === f) || {}).id || ''}"]` : f.startsWith('Organisationsnumret') ? '[data-foretag="orgnr"]' : '[data-foretag="epost"]')}">${ik('byggnad')}<span><strong>${e(f)}</strong><small>Företagsuppgifter</small></span><span class="varning-ga"><span>Fyll i</span>${ik('pil')}</span></button>`;
    return `${panelHuvud(4, 'Kontrollera beställningen och bekräfta. När ni skickar tar vi fram offert och order utifrån underlaget.')}
      <section class="kl-kort kl-kontroll" ${antalAtt ? '' : 'data-ok'}>
        ${antalAtt ? `${kortHuvud('varning', 'Kvar innan ni kan skicka', `<span class="kl-raknare">${e(plural(antalAtt, 'sak', 'saker'))}</span>`)}
          <div class="varningslista">${saknasHalsa ? `<button type="button" data-g="steg" data-steg="3">${ik('hjarta')}<span><strong>Hälsoformulär saknas från ${e(plural(saknasHalsa, 'deltagare', 'deltagare'))}</strong><small>Hälsoformulär</small></span><span class="varning-ga"><span>Visa</span>${ik('pil')}</span></button>` : ''}${!s.antal ? `<button type="button" data-g="steg" data-steg="2" data-fokus='[data-g="lagg-till"]'>${ik('anvandare')}<span><strong>Inga deltagare ännu</strong><small>Deltagare och tester</small></span><span class="varning-ga"><span>Lägg till</span>${ik('pil')}</span></button>` : ''}${s.foretagFel.map(foretagKnapp).join('')}${gruppHtml}
          ${varningsRader.length > 1 ? `<details class="varning-detaljer"><summary>Visa alla rader att komplettera (${varningsRader.length})</summary><div>${varningsRader.map((x) => `<button type="button" data-g="till-rad" data-id="${e(x.d.id)}">${ik('varning')}<span>Rad ${x.i + 1}${x.d.namn ? ` (${e(x.d.namn)})` : ''}: ${e(x.fel.join(', '))}</span></button>`).join('')}</div></details>` : ''}</div>`
          : kortHuvud('bock', 'Allt är ifyllt och kontrollerat', `<span class="kl-raknare" data-klar>${e(plural(s.antal, 'deltagare', 'deltagare'))}</span>`)}
      </section>
      <section class="kl-kort kl-bekrafta">
        ${kortHuvud('las', 'Bekräfta')}
        <div class="kl-kryss">
          <label class="kryss"><input type="checkbox" data-bekraftelse="1" ${lank.bekraftelse1 ? 'checked' : ''}><span>Jag har behörighet att beställa för ${e(lank.foretag.namn || kund.namn)}.</span></label>
          <label class="kryss"><input type="checkbox" data-bekraftelse="2" ${lank.bekraftelse2 ? 'checked' : ''}><span>Deltagarna vet att deras namn, e-post och personnummer lämnas till Uperformance för att boka testerna.</span></label>
        </div>
        <div class="kl-falt"><label class="etikett" for="kl-meddelande">Meddelande till Uperformance <em>(valfritt)</em></label><textarea class="falt" id="kl-meddelande" rows="3" data-meddelande maxlength="4000" placeholder="T.ex. två skiftlag, önskar förmiddag…">${e(lank.meddelande || '')}</textarea></div>
      </section>
      <div class="kl-nav kl-skicka"><button class="knapp knapp-spok" type="button" data-g="steg" data-steg="${bakat.steg}">${ik('pil-v')}${bakat.text}</button>
        <div class="granska-skicka">${kanSkicka ? '' : `<p class="skicka-hint" id="skicka-hint">${e(skickaHint)}</p>`}<button class="knapp knapp-accent kl-knapp-stor" type="button" data-g="skicka" ${kanSkicka ? '' : 'disabled aria-describedby="skicka-hint"'}>${ik('bock')}Skicka underlaget</button></div></div>`;
  }

  // Beställningen rad för rad – summeringen i steg 4 och kvittot efter inskickning
  const totalHtml = (s) => `<div class="summering-stor"><span data-summa-total data-varde="${Math.round(s.total)}">${Math.round(s.total).toLocaleString('sv-SE')}</span><small>kr</small></div>`;
  function kvittoHtml(s, rubrik) {
    const rader = sammanstallning(s);
    const paket = rader.filter((r) => !r.namn.startsWith('+')); const tillval = rader.filter((r) => r.namn.startsWith('+'));
    const rad = (r) => `<tr><th scope="row">${e(r.namn.replace(/^\+\s/, ''))}<small>${e(r.n)} × ${r.apris == null ? 'offert' : e(kr(r.apris))}</small></th><td>${r.summa == null ? 'Offereras' : e(kr(r.summa))}</td></tr>`;
    return `<p class="kl-summa-etikett">${e(rubrik)}</p>
      ${rader.length ? `<table class="kl-kvitto">${paket.length ? `<tbody>${paket.map(rad).join('')}</tbody>` : ''}${tillval.length ? `<tbody><tr class="kl-kvitto-grupp"><th colspan="2" scope="rowgroup">Tillval</th></tr>${tillval.map(rad).join('')}</tbody>` : ''}</table>` : '<p class="summering-not">Inga deltagare ännu.</p>'}
      <div class="kl-kvitto-total"><span>Preliminärt ordervärde<small>exkl. moms · ${e(plural(s.antal, 'deltagare', 'deltagare'))}</small></span>${totalHtml(s)}</div>`;
  }
  const PRISNOT = '<p class="summering-not">Priserna följer Uperformances prislista och är preliminära. Slutlig offert bekräftas av Uperformance.</p>';
  function summeringHtml(s) {
    const ram = '<i class="summering-ram" aria-hidden="true"></i>';
    if (steg === 4) return `${ram}${kvittoHtml(s, 'Er beställning')}${PRISNOT}`;
    const max = Math.max(1, ...PAKET_ORDNING.map((p) => s.perPaket[p] || 0));
    return `${ram}<p class="kl-summa-etikett">Preliminärt ordervärde</p>
      ${totalHtml(s)}
      <p class="summering-not kl-summa-under">exkl. moms · ${e(plural(s.antal, 'deltagare', 'deltagare'))}${s.antal ? ` · snitt ${e(kr(s.snitt))}` : ''}</p>
      <div class="fordelning" role="list" aria-label="Deltagare per paket">${PAKET_ORDNING.map((p) => `<div class="fordelning-rad" role="listitem"><span>${e(paketNamn(p))}</span><span class="fordelning-stapel" aria-hidden="true"><i style="transform:scaleX(${((s.perPaket[p] || 0) / max).toFixed(3)})"></i></span><strong>${e(s.perPaket[p] || 0)}</strong></div>`).join('')}</div>
      ${s.hjartkarl ? `<p class="kl-summa-gul">${e(plural(s.hjartkarl, 'deltagare', 'deltagare'))} med Hjärt-/kärlpaket – offereras separat och ingår inte i summan.</p>` : ''}
      ${PRISNOT}`;
  }

  // Mobil: summa, hur långt det har kommit och nästa steg – fast längst ned tills summeringen syns
  function miniHtml(s, pct) {
    const n = nastaAtgard(s);
    return `<div class="mini-summering" data-mini role="region" aria-label="Kort summering">
      <div class="mini-summa"><small>Preliminärt</small><strong data-mini-total>${kr(s.total)}</strong></div>
      <div class="mini-klart"><span data-mini-pct>${pct} % klart</span><i style="--f:${(pct / 100).toFixed(3)}" aria-hidden="true"></i></div>
      <button type="button" class="mini-nasta" data-mini-nasta ${nastaAttr(n)}><span>${e(n.text)}</span>${ik('pil')}</button>
    </div>`;
  }
  let summeringObs = null;
  function bevakaSummering() {
    if (summeringObs) summeringObs.disconnect();
    const sum = $('[data-summering]'); const mini = $('[data-mini]');
    if (!sum || !mini || !('IntersectionObserver' in window)) return;
    summeringObs = new IntersectionObserver((p) => { const m = $('[data-mini]'); if (m) m.toggleAttribute('data-dold', p.some((x) => x.isIntersecting)); });
    summeringObs.observe(sum);
  }

  /* Inskickat: resan härifrån i hjältens remsa, kvittot under hjälten */
  function resaHtml() {
    const resa = [
      { klar: true, text: 'Underlaget är inskickat', under: lank.inskickad ? datumTid(lank.inskickad) : '' },
      ...(halsaPa ? [{ klar: true, text: 'Alla har svarat på hälsoformuläret', under: 'Svaren finns hos Uperformances testteam' }] : []),
      { klar: false, text: 'Offert och order', under: `${kontaktNamn()} går igenom underlaget och skickar offert och order` },
      { klar: false, text: 'Testdagen bokas', under: 'Testteamet kontaktar er och bokar testdagen' },
    ];
    return `<ol class="kl-steg kl-resa" aria-label="Så går det vidare" ${resa.length === 3 ? 'data-tre-steg' : ''}>${resa.map((x, i) => `<li class="kl-steg-knapp" style="--i:${i}" ${x.klar ? 'data-klar' : ''} ${!x.klar && resa[i - 1] && resa[i - 1].klar ? 'aria-current="step"' : ''}><span class="steg-siffra">${x.klar ? ik('bock') : i + 1}</span><span class="kl-steg-text"><strong>${e(x.text)}</strong>${x.under ? `<small>${e(x.under)}</small>` : ''}</span></li>`).join('')}</ol>`;
  }
  function visaSkickat(s) {
    return `<div class="kl-klar"><section class="kl-kort kl-kvitto-kort" aria-label="Det här skickade ni">${kvittoHtml(s, 'Det här skickade ni')}${PRISNOT}</section></div>`;
  }

  /* Delvisa uppdateringar när man skriver – listan ritas inte om ------------------ */
  // Samma element får nya attribut och nytt innehåll (bara när något ändrats) – ett pågående klick på knappen går då fram
  function bytPaPlats(el, html) {
    if (!el || el.outerHTML === html) return;
    const tmp = document.createElement('div'); tmp.innerHTML = html; const ny = tmp.firstElementChild; if (!ny || ny.tagName !== el.tagName) { el.outerHTML = html; return; }
    [...el.attributes].forEach((a) => { if (!ny.hasAttribute(a.name)) el.removeAttribute(a.name); });
    [...ny.attributes].forEach((a) => { if (el.getAttribute(a.name) !== a.value) el.setAttribute(a.name, a.value); });
    if (el.innerHTML !== ny.innerHTML) el.innerHTML = ny.innerHTML;
  }
  function uppdateraLive() {
    if (!lank || stoppad || steg === KLAR) return;
    const s = summeraUnderlag(lank);
    const fokus = document.activeElement;
    lank.deltagare.forEach((d, i) => {
      const rad = $(`[data-rad="${sel(d.id)}"]`); if (!rad) return;
      const varFel = rad.hasAttribute('data-varning'); const lage = radLage(s.fel[i]);
      if (lage) rad.setAttribute('data-varning', lage); else rad.removeAttribute('data-varning');
      if (varFel && !lage && !UPPortal.lugn) { rad.removeAttribute('data-blev-klar'); void rad.offsetWidth; rad.setAttribute('data-blev-klar', ''); }
      $('[data-rad-status]', rad).innerHTML = radStatus(s.fel[i]);
      $('[data-rad-pris]', rad).textContent = radPris(d);
      const h = $('[data-rad-halsa]', rad); if (h) h.innerHTML = halsaChip(d);
      // Rätt ruta markeras – men inte medan man skriver i den (felet visas när man lämnar fältet)
      const m = faltLage(s.fel[i]);
      $$('[data-falt]', rad).forEach((inp) => {
        const l = m[inp.dataset.falt]; const har = inp === fokus;
        if (l !== 'fel') inp.removeAttribute('aria-invalid'); else if (!har) inp.setAttribute('aria-invalid', 'true');
        inp.toggleAttribute('data-saknas', l === 'saknas' && !har);
      });
    });
    if (steg === 1) {
      const fel = foretagFormatFel(s);
      $$('[data-foretag]').forEach((inp) => {
        const id = inp.dataset.foretag; const f = String(inp.value).trim() && fel[id] ? fel[id] : '';
        const p = $(`[data-falt-fel="${sel(id)}"]`);
        if (!f) { inp.removeAttribute('aria-invalid'); if (p) p.textContent = ''; } else if (inp !== fokus) { inp.setAttribute('aria-invalid', 'true'); if (p) p.textContent = f; }
        const ruta = inp.closest('.kl-falt'); if (ruta) ruta.toggleAttribute('data-ok', !!String(inp.value).trim() && !fel[id]);
      });
      const grupper = foretagGrupper();
      $$('[data-grupp-nr]').forEach((el) => { const g = grupper[+el.dataset.gruppNr]; if (!g) return; const k = gruppKlar(g, fel); el.textContent = `${k} av ${g.falt.length}`; el.toggleAttribute('data-klar', k === g.falt.length); });
    }
    const sum = $('[data-summering]');
    if (sum) {
      const fore = $('[data-summa-total]', sum); const gammal = fore ? +fore.dataset.varde : Math.round(s.total);
      const ram = $(':scope > .summering-ram', sum);
      if (ram) { [...sum.childNodes].forEach((n) => { if (n !== ram) n.remove(); }); ram.insertAdjacentHTML('afterend', summeringHtml(s).replace('<i class="summering-ram" aria-hidden="true"></i>', '')); }
      else sum.innerHTML = summeringHtml(s);
      const tal = $('[data-summa-total]', sum); tal.dataset.varde = gammal; tal.textContent = gammal.toLocaleString('sv-SE');
      UPPortal.rakna(tal, Math.round(s.total), { tid: 800 });
    }
    // Steg 4: det som är kvar och skicka-knappen följer med (sista hälsoformuläret kan komma medan man skriver meddelandet)
    if (steg === 4) {
      const tmp = document.createElement('div'); tmp.innerHTML = visaGranska(s);
      ['.kl-kontroll', '.kl-skicka'].forEach((q) => { const ny = $(q, tmp); const gammal = $(q); if (ny && gammal) bytPaPlats(gammal, ny.outerHTML); });
    }
    const pct = klarhet();
    UPPortal.satRing(pct); framsteg(pct);
    const fakta = $('[data-fakta-panel]'); if (fakta) fakta.outerHTML = faktaHtml(s, false);
    const knapp = $('[data-nasta-knapp]'); if (knapp) bytPaPlats(knapp, nastaKnapp(s));
    const mini = $('[data-mini]');
    if (mini) {
      const n = nastaAtgard(s);
      $('[data-mini-total]', mini).textContent = kr(s.total);
      $('[data-mini-pct]', mini).textContent = `${pct} % klart`;
      $('.mini-klart i', mini).style.setProperty('--f', (pct / 100).toFixed(3));
      const mk = $('[data-mini-nasta]', mini); bytPaPlats(mk, `<button type="button" class="mini-nasta" data-mini-nasta ${nastaAttr(n)}><span>${e(n.text)}</span>${ik('pil')}</button>`);
    }
    $$('.kl-steg button').forEach((b) => {
      const nr = +b.dataset.steg; const klar = stegKlart(nr, s); const varKlar = b.hasAttribute('data-klar');
      b.toggleAttribute('data-klar', klar);
      $('.steg-fyll', b).style.setProperty('--f', stegAndel(nr, s).toFixed(3));
      const u = $('[data-steg-under]', b); if (u) u.textContent = stegUnder(nr, s);
      if (klar !== varKlar && nr !== steg) { $('.steg-siffra', b).innerHTML = klar ? ik('bock') : visningsNr(nr); if (klar) { b.removeAttribute('data-ny-klar'); void b.offsetWidth; b.setAttribute('data-ny-klar', ''); } }
    });
  }

  /* Klistra in från Excel: namn, e-post, personnummer (och ev. paket) per rad ------- */
  // Unikt rad-id (servern godtar [A-Za-z0-9_-], högst 40 tecken)
  const nyId = () => {
    const finns = new Set(lank.deltagare.map((d) => d.id)); let id;
    do { id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); } while (finns.has(id) || nyId.senast.has(id));
    nyId.senast.add(id); return id;
  };
  nyId.senast = new Set();
  // Personnummer: i första hand en cell som är ett giltigt personnummer (kontrollsiffra), annars en cell som ser ut
  // som ett med sekel eller skiljetecken. Ett telefonnummer (0701234567) tas aldrig som personnummer.
  const SER_UT_SOM_PNR = /^(?:(?:19|20)\d{6}[-+]?\d{4}|\d{6}[-+]\d{4})$/;
  const SER_UT_SOM_TEL = /^\+?[\d\s()-]{7,}$/;
  function tolkaLista(text) {
    const paketFran = (v) => { const t = String(v || '').trim().toLowerCase(); return t === 'bas++' ? 'basplusplus' : t === 'bas+' ? 'basplus' : t === 'bas' ? 'bas' : null; };
    return text.split(/\r?\n/).map((r) => r.split(/\t|;/).map((c) => c.trim())).filter((c) => c.some(Boolean))
      .filter((c) => !/namn|e-?post/i.test(c.join(' ')) || c.some((x) => x.includes('@')))
      .map((c) => {
        const epost = c.find((x) => x.includes('@')) || '';
        const pnr = c.find((x) => normaliseraPnr(x)) || c.find((x) => SER_UT_SOM_PNR.test(x.replace(/\s/g, ''))) || '';
        const paket = c.map(paketFran).find(Boolean);
        const namn = c.find((x) => x && x !== epost && x !== pnr && !paketFran(x) && !/^\d+$/.test(x) && !SER_UT_SOM_TEL.test(x)) || '';
        // Samma längdgränser som fälten (namn 200, e-post 254, personnummer 20)
        return { id: nyId(), namn: namn.slice(0, 200), epost: epost.slice(0, 254), pnr: (normaliseraPnr(pnr) || pnr).slice(0, 20), paket: paket || lank.standard.paket, tillval: [...lank.standard.tillval] };
      });
  }
  function forhandHtml(nya) {
    if (!nya.length) return '<p class="falt-hint" style="margin:0">Inga rader ännu.</p>';
    const fel = kontrolleraDeltagare([...lank.deltagare, ...nya]).slice(lank.deltagare.length);
    const attRatta = fel.filter((f) => f.length).length;
    const visas = nya.slice(0, 50);
    return `<p class="falt-hint" style="margin:0"><strong>${e(plural(nya.length, 'rad hittades', 'rader hittades'))}</strong>${attRatta ? ` · ${e(plural(attRatta, 'behöver', 'behöver'))} kompletteras efteråt` : ' · alla ser kompletta ut'}</p>
      <div class="tabell-rulla"><table class="klistra-tabell"><thead><tr><th scope="col">Namn</th><th scope="col">E-post</th><th scope="col">Personnummer</th><th scope="col">Paket</th><th scope="col">Status</th></tr></thead><tbody>
        ${visas.map((d, i) => `<tr><td>${e(d.namn || '–')}</td><td>${e(d.epost || '–')}</td><td>${e(d.pnr ? maskeraPnr(d.pnr) : '–')}</td><td>${e(paketNamn(d.paket))}</td><td>${fel[i].length ? `<span class="chip chip-rod chip-prick">${e(fel[i][0])}${fel[i].length > 1 ? ` +${fel[i].length - 1}` : ''}</span>` : '<span class="chip chip-ok chip-prick">Klar</span>'}</td></tr>`).join('')}
      </tbody></table></div>${nya.length > visas.length ? `<p class="falt-hint" style="margin:0">Visar de första ${visas.length}.</p>` : ''}`;
  }
  function oppnaKlistra() {
    ark.innerHTML = `<div class="ark-huvud"><div><h2 id="ark-titel">Klistra in deltagare</h2><p>Kopiera kolumnerna Namn, E-post och Personnummer från Excel och klistra in här. Paket i en fjärde kolumn går också bra.</p></div><button class="ikonknapp" type="button" data-g="stang-ark" aria-label="Stäng">${ik('stang')}</button></div>
      <div class="ark-kropp"><div class="klistra-exempel">Erik Lund	erik.lund@foretaget.se	19121212-1212	Bas+\nSofia Berg	sofia.berg@foretaget.se	...</div>
        <label><span class="sr">Lista</span><textarea class="falt" rows="7" data-klistra-text placeholder="Klistra in här…"></textarea></label><div class="klistra-forhand" data-klistra-forhand aria-live="polite">${forhandHtml([])}</div></div>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="klistra-in" disabled data-klistra-knapp>${ik('plus')}Lägg till</button></div>`;
    ark.showModal(); $('[data-klistra-text]', ark).focus();
  }

  /* Ta bort en rad: bekräftelse när deltagaren har fått sitt hälsoformulär, annars Ångra i toasten ---- */
  function oppnaTaBort(d) {
    const fornamn = String(d.namn || '').trim().split(' ')[0] || 'deltagaren';
    const h = hlage().per[d.id] || {};
    ark.innerHTML = `<div class="ark-huvud"><div><h2 id="ark-titel">Ta bort ${e(String(d.namn || '').trim() || 'deltagaren')}?</h2><p>Raden försvinner från underlaget.</p></div><button class="ikonknapp" type="button" data-g="stang-ark" aria-label="Stäng">${ik('stang')}</button></div>
      <div class="ark-kropp"><p class="ark-varning">${ik('varning')}<span>${e(/[sxz]$/i.test(fornamn) ? fornamn : fornamn + 's')} personliga länk till hälsoformuläret slutar gälla. ${h.status === 'besvarad' ? `${e(fornamn)} har redan svarat – läggs ${e(fornamn)} till igen behöver ett nytt formulär skickas och besvaras.` : `Läggs ${e(fornamn)} till igen skickas ett nytt formulär.`}</span></p></div>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-fara" type="button" data-g="ta-bort-bekrafta" data-id="${e(d.id)}">${ik('papperskorg')}Ta bort</button></div>`;
    ark.showModal(); ($('.ark-fot [data-g="stang-ark"]', ark) || $('[data-g="stang-ark"]', ark)).focus(); // Avbryt först – Ta bort är farlig
  }
  function taBort(d, angra) {
    const index = lank.deltagare.indexOf(d); if (index < 0) return;
    lank.deltagare = lank.deltagare.filter((x) => x !== d);
    oppnaTillval.delete(d.id);
    if (d.halsa) spara(); else sparaSnart();
    rendera();
    // Fokus till samma plats i listan: raden som tog platsen (dess första fält), annars raden ovanför, annars Lägg till deltagare
    const efter = lank.deltagare[index] || lank.deltagare[index - 1];
    const mal = (efter && $(`[data-rad="${sel(efter.id)}"] [data-falt]`)) || $('[data-g="lagg-till"]');
    if (mal) mal.focus({ preventScroll: true });
    const namn = String(d.namn || '').trim() || 'Raden';
    if (!angra) { toast(`${namn} är borttagen`, { under: 'Hälsoformulärets länk gäller inte längre.' }); return; }
    toast(`${namn} är borttagen`, { atgard: { text: 'Ångra', fn: () => {
      if (stoppad || !lank || lank.deltagare.some((x) => x.id === d.id)) return;
      lank.deltagare.splice(Math.min(index, lank.deltagare.length), 0, d); sparaSnart(); rendera();
      const rad = $(`[data-rad="${sel(d.id)}"]`); if (rad) { rad.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); UPPortal.markera(rad); const f = $('[data-falt]', rad); if (f) f.focus({ preventScroll: true }); }
    } } });
  }

  // Hoppa till det fält eller den knapp som Nästa steg pekar på, och markera det kort
  function hoppaTill(selektor) {
    if (!selektor) return false;
    let el = null; try { el = $(selektor); } catch (err) { el = null; }
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true }); UPPortal.markera(el);
    return true;
  }

  /* Händelser ---------------------------------------------------------------------------- */
  const hittaRad = (id) => lank.deltagare.find((d) => d.id === id);
  const vaxla = (lista, v) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  let upptagen = false; // en åtgärd mot servern i taget (skicka, påminn, skicka in)
  const G = {
    steg: (el) => {
      const fore = steg; steg = +el.dataset.steg; if (!halsaPa && steg === 3) steg = 4;
      lank.steg = steg; spara(); rendera();
      if (steg !== fore) UPPortal.panelIn($('.portal-panel'), steg > fore ? 'fram' : 'bak');
      if (hoppaTill(el.dataset.fokus)) return;
      // Till stegets rubrik under hjälten när den inte redan syns i övre delen av fönstret – fokus dit för tangentbord och skärmläsare
      const mal = $('.kl-rutnat');
      if (mal) { const topp = mal.getBoundingClientRect().top; if (topp < 70 || topp > innerHeight * 0.5) scrollTo({ top: topp + scrollY - 88, behavior: lugn ? 'auto' : 'smooth' }); }
      if (steg !== fore && el.closest('.kl-nav, .kl-steg')) { const h = $('[data-panel-rubrik]'); if (h) h.focus({ preventScroll: true }); }
    },
    'vaxla-standard': () => { visaStandard = !visaStandard; rendera(); const k = $('.kl-standard-vaxla'); if (k) k.focus({ preventScroll: true }); },
    paket: (el) => { const d = hittaRad(el.dataset.id); d.paket = el.dataset.paket; sparaSnart(); ritaOmRad(d); },
    tillval: (el) => { const d = hittaRad(el.dataset.id); d.tillval = vaxla(d.tillval || [], el.dataset.tillval); sparaSnart(); ritaOmRad(d); },
    'vaxla-tillval': (el) => {
      const d = hittaRad(el.dataset.id); if (!d) return;
      if (oppnaTillval.has(d.id)) oppnaTillval.delete(d.id); else oppnaTillval.add(d.id);
      ritaOmRad(d);
    },
    'std-paket': (el) => { lank.standard.paket = el.dataset.paket; sparaSnart(); rendera(); },
    'std-tillval': (el) => { lank.standard.tillval = vaxla(lank.standard.tillval, el.dataset.tillval); sparaSnart(); rendera(); },
    'anvand-alla': () => { if (!lank.deltagare.length) return; lank.deltagare.forEach((d) => { d.paket = lank.standard.paket; d.tillval = [...lank.standard.tillval]; }); sparaSnart(); rendera(); toast(`Standardvalet används nu för alla ${lank.deltagare.length}`, { under: `${paketNamn(lank.standard.paket)}${lank.standard.tillval.length ? ' med ' + plural(lank.standard.tillval.length, 'tillval', 'tillval') : ''}` }); },
    'lagg-till': () => {
      const d = { id: nyId(), namn: '', epost: '', pnr: '', paket: lank.standard.paket, tillval: [...lank.standard.tillval] };
      lank.deltagare.push(d); nyaRader.add(d.id); sparaSnart();
      if (steg !== 2) { steg = 2; lank.steg = 2; }
      rendera();
      const falt = $(`[data-rad="${sel(d.id)}"] [data-falt="namn"]`); if (falt) { falt.focus(); falt.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); }
    },
    'ta-bort': (el) => {
      const d = hittaRad(el.dataset.id); if (!d) return;
      const h = hlage().per[d.id] || {};
      // Har deltagaren fått sitt hälsoformulär makuleras det när raden tas bort – fråga först
      if (halsaPa && ['skickad', 'oppnad', 'besvarad'].includes(h.status)) { oppnaTaBort(d); return; }
      taBort(d, true);
    },
    'ta-bort-bekrafta': (el) => { const d = hittaRad(el.dataset.id); ark.close(); if (d) taBort(d, false); },
    'skicka-halsa': (el) => skickaHalsa([hittaRad(el.dataset.id)]),
    'skicka-halsa-alla': () => { const hl = hlage(); skickaHalsa(lank.deltagare.filter((d) => hl.per[d.id].status === 'ej-skickat' && kanSkickas(d))); },
    paminn: (el) => paminn([hittaRad(el.dataset.id)]),
    'paminn-alla': () => { const hl = hlage(); paminn(lank.deltagare.filter((d) => kanPaminnas(d, hl.per[d.id]))); },
    'kopiera-halsa': (el) => {
      const d = hittaRad(el.dataset.id); if (!d || !d.halsa) return; const url = halsoUrl(d.halsa);
      const klar = () => toast(`Länken till ${d.namn} är kopierad`, { under: 'Den är personlig – skicka den bara till deltagaren.' });
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(klar, () => prompt('Kopiera länken:', url)); else prompt('Kopiera länken:', url);
    },
    klistra: () => oppnaKlistra(),
    'klistra-in': () => {
      const nya = tolkaLista($('[data-klistra-text]', ark).value); if (!nya.length) return;
      lank.deltagare.push(...nya); nya.forEach((d) => nyaRader.add(d.id)); ark.close(); sparaSnart();
      if (steg !== 2) { steg = 2; lank.steg = 2; }
      rendera();
      const fel = kontrolleraDeltagare(lank.deltagare).slice(lank.deltagare.length - nya.length).filter((f) => f.length).length;
      toast(`${plural(nya.length, 'deltagare', 'deltagare')} tillagda`, { under: fel ? `${plural(fel, 'rad behöver', 'rader behöver')} kompletteras – de är markerade i listan.` : '' });
    },
    'stang-ark': () => ark.close(),
    'till-rad': (el) => { const fore = steg; steg = 2; lank.steg = 2; rendera(); if (fore !== 2) UPPortal.panelIn($('.portal-panel'), fore > 2 ? 'bak' : 'fram'); const rad = $(`[data-rad="${sel(el.dataset.id)}"]`); if (rad) { rad.scrollIntoView({ block: 'center' }); const tom = $$('input', rad).find((i) => !i.value) || $('input', rad); tom.focus(); UPPortal.markera(tom); } },
    skicka: async (el) => {
      const s = summeraUnderlag(lank); if (!s.komplett || (halsaPa && !hlage().alla) || upptagen) return;
      upptagen = true; el.disabled = true;
      try {
        // Det som väntar sparas först, så att servern kontrollerar exakt det kunden ser
        if (!(await sparaNu())) { el.disabled = false; if (!stoppad) varna('Kunde inte spara – försök igen', 'Underlaget är inte skickat ännu.'); return; }
        const r = await fraga(() => L.kundlank.skickaIn(token));
        if (!r.ok) { el.disabled = false; atgardFel(r); return; }
        tillampaVy(r.vy, true); steg = KLAR;
        rendera(); scrollTo({ top: 0, behavior: lugn ? 'auto' : 'smooth' });
        setTimeout(() => UPPortal.konfettiFran($('[data-ring]')), 900);
      } finally { upptagen = false; }
    },
    'forsok-igen': () => starta(),
  };
  // Varje deltagare får en egen nyckel. Demoläget skickar inget; skarpt läge lägger meddelandet i
  // serverns utkorg (riktig e-post med engångskod kopplas på vid flytten).
  async function skickaHalsa(lista) {
    lista = lista.filter((d) => d && kanSkickas(d)); if (!lista.length || upptagen) return;
    upptagen = true;
    try {
      if (!(await sparaNu())) { if (!stoppad) varna('Kunde inte spara – försök igen'); return; }
      const r = await fraga(() => L.kundlank.skickaHalsa(token, lista.map((d) => d.id)));
      if (!r.ok) { atgardFel(r); return; }
      tillampaVy(r.vy, false); rendera();
      const s = r.skickade || [];
      if (!s.length) { varna('Inget skickades – kontrollera namn och e-post'); return; }
      toast(s.length === 1 ? `Hälsoformuläret är skickat till ${s[0].namn}` : `Hälsoformuläret är skickat till ${s.length} deltagare`, { under: 'Ni ser här när de har svarat.' });
    } finally { upptagen = false; }
  }
  async function paminn(lista) {
    lista = lista.filter((d) => d && d.halsa); if (!lista.length || upptagen) return;
    upptagen = true;
    try {
      if (!(await sparaNu())) { if (!stoppad) varna('Kunde inte spara – försök igen'); return; }
      const r = await fraga(() => L.kundlank.paminn(token, lista.map((d) => d.id)));
      if (!r.ok) { atgardFel(r); return; }
      tillampaVy(r.vy, false); rendera();
      const p = r.paminda || [];
      toast(p.length === 1 ? `Påminnelse skickad till ${p[0].namn}` : p.length ? `Påminnelse skickad till ${p.length} deltagare` : 'Ingen påminnelse behövdes', p.length ? { under: 'Nästa påminnelse kan skickas om 24 timmar.' } : { typ: 'info' });
    } finally { upptagen = false; }
  }

  function ritaOmRad(d) {
    const rad = $(`[data-rad="${sel(d.id)}"]`); if (!rad) return;
    $('.paketval', rad).innerHTML = paketKnappar(d);
    const chips = $('.tillvalschips', rad); chips.innerHTML = tillvalChips(d); chips.hidden = !oppnaTillval.has(d.id);
    $('[data-tillval-valda]', rad).innerHTML = tillvalValdaHtml(d);
    const v = $('.tillval-vaxla', rad); v.setAttribute('aria-expanded', String(oppnaTillval.has(d.id))); $('span', v).textContent = tillvalVaxlaText(d);
    uppdateraLive();
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-g]'); if (!el || el.disabled) return;
    const fn = Object.prototype.hasOwnProperty.call(G, el.dataset.g) ? G[el.dataset.g] : null;
    if (!fn || (!lank && el.dataset.g !== 'forsok-igen')) return;
    ev.preventDefault(); fn(el);
  });
  ark.addEventListener('click', (ev) => { if (ev.target === ark) ark.close(); });
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!lank || stoppad) return;
    if (t.dataset.foretag) { lank.foretag[t.dataset.foretag] = t.value; sparaSnart(); uppdateraLive(); return; }
    if (t.dataset.falt) { const d = hittaRad(t.dataset.id); if (!d) return; d[t.dataset.falt] = t.value; sparaSnart(); uppdateraLive(); return; }
    if (t.matches('[data-meddelande]')) { lank.meddelande = t.value; sparaSnart(); return; }
    if (t.matches('[data-klistra-text]')) {
      const n = tolkaLista(t.value);
      $('[data-klistra-forhand]', ark).innerHTML = forhandHtml(n);
      $('[data-klistra-knapp]', ark).disabled = !n.length;
    }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target; if (!lank || stoppad) return;
    if (t.dataset.bekraftelse) {
      lank['bekraftelse' + t.dataset.bekraftelse] = t.checked; spara(); rendera();
      const ny = $(`[data-bekraftelse="${sel(t.dataset.bekraftelse)}"]`); if (ny) ny.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', (ev) => {
    const t = ev.target; if (ev.key !== 'Enter' || !t.dataset || !t.dataset.falt) return;
    ev.preventDefault();
    const rad = t.closest('[data-rad]'); const falt = $$('[data-falt]', rad); const i = falt.indexOf(t);
    if (i < falt.length - 1) { falt[i + 1].focus(); return; }
    const nasta = rad.nextElementSibling && rad.nextElementSibling.matches('[data-rad]') ? $('[data-falt="namn"]', rad.nextElementSibling) : null;
    if (nasta) nasta.focus(); else G['lagg-till']();
  });
  // Snygga till personnumret när man lämnar fältet – och visa ett formatfel först då (inte mitt i skrivandet)
  document.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!lank || stoppad) return;
    if (t.dataset && t.dataset.falt === 'pnr') { const d = hittaRad(t.dataset.id); const n = normaliseraPnr(t.value); if (d && n && n !== t.value) { t.value = n; d.pnr = n; sparaSnart(); } }
    if (t.dataset && (t.dataset.falt || t.dataset.foretag)) setTimeout(uppdateraLive, 0);
  });

  /* Start: hämta länken via lagret ---------------------------------------------------------- */
  async function starta() {
    if (!token) { visaOgiltig('saknas'); return; }
    if (!L || !L.kundlank) { visaNatverksfel(); return; }
    stoppad = false; smutsig = false;
    visaHamtar();
    const r = await fraga(() => L.kundlank.hamta(token));
    if (!r.ok) {
      if (r.status === 404 || r.status === 410) visaOgiltig(r.fel); else visaNatverksfel();
      return;
    }
    tillampaVy(r.vy, true);
    $('[data-saker]').hidden = false; sparstatus.hidden = false;
    $('[data-saker-text]').textContent = 'Säker länk';
    $('[data-saker-for]').textContent = kund.namn ? ` · endast för ${kund.namn}` : '';
    $('[data-saker]').title = kund.namn ? `Säker länk – endast för ${kund.namn}` : 'Säker länk';
    // Första öppningen sparas (status öppnad) – visa det som förut
    if (r.markeradOppnad) sparText('Sparat ' + new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    rendera();
    // Om CRM:et spärrar länken, eller en deltagare öppnar/svarar på sitt hälsoformulär, medan sidan är öppen
    if (!lyssnar) {
      lyssnar = true;
      L.kundlank.lyssna(token, (h) => {
        if (!h || stoppad || !lank) return;
        if (h.ogiltig) {
          // Tillfälliga fel (nätverk, server) väntar till nästa kontroll; annars har länken slutat gälla
          const f = h.fel && typeof h.fel === 'object' ? h.fel : { fel: h.fel, status: h.status };
          if (f.fel === 'natverk' || f.status === 0 || f.status === 429 || f.status >= 500) return;
          visaOgiltig(f.fel); return;
        }
        if (h.vy) nyttFranServern(h.vy);
      });
    }
  }
  // Nyckeln läses bara vid start – klistras en annan länk in i samma flik byts bara hashen, så sidan laddas om
  addEventListener('hashchange', () => { if ((location.hash.match(/t=([A-Za-z0-9]+)/) || [])[1] !== token) location.reload(); });
  starta();
})();
