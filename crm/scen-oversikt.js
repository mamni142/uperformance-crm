/* Uperformance CRM – översiktens 3D-hjälte: "Arenan" (#/).
   En fullsatt fotbollsarena i kvällsljus med resultattavlan i fokus (den gamla scenen – tratten och glastornen – ligger i
   _underlag/gammal-scen-oversikt/).
   - Planen: högupplöst canvasgräs (2048 px, anisotropi) med klippta ränder, fint brus och skarpa vita linjer (sidlinjer,
     mittlinje, mittcirkel, straff- och målområden, punkter, bågar), mål med stolpar och nät. Runt planen en mörk sarg med
     LED-skyltar som rullar (UV-förskjutning i shadern): "UPERFORMANCE · HÄLSA MED ELITSTANDARD" och blåvita fält.
   - Läktarskålen: rundad rektangel runt planen, öppen mot kameran (närmaste långsidan saknas – där står kameran). Undre och
     övre ring med riktiga trappsteg (sättning + plan, säten och gångar i en texttur), en lysande fasadlist emellan, tak med
     ljuslist och strålkastare i framkanten. Allt i några få sammanslagna geometrier.
   - Publiken: tusentals blåvita supportrar (IFK Göteborgs färger) som InstancedMesh-skyltar som vrids mot kameran i
     vertexshadern, med en egen canvasatlas (åtta poser: armar nere, klappar, armar uppe, halsduk …). Hopp, klapp och "vågen"
     räknas i shadern ur uTid – ingen JS-slinga över instanserna per bildruta.
   - Flaggor: blåvita flaggor (uppdelade plan + stång) som vevas fram och tillbaka och böljar – allt i vertexshadern – några
     stora flaggor och en tifo-banderoll "IFK GÖTEBORG" över bortre långsidans undre ring. Bara klubbens namn och färger –
     inget emblem. Blåvitt pappersregn från övre ringen med jämna mellanrum (shader).
   - RESULTATTAVLAN på bortre långsidans tak: ram i mörk metall, LED-skärm (canvas 2048 × 1024 i en egen shader: diodmönster,
     svag skanning, påslagning med svep) och en rullande remsa under. Innehållet räknas ur window.UPCRM.db (lasData):
     VUNNA – FÖRLORADE som en matchställning, vinstgraden, "Signerat · 90 dagar", "Öppen pipeline" och innevarande månads
     intäkt; remsan visar säljstegen och de senaste månadernas intäkter. Klick på tavlan → #/salj.
   - Kameran: upphöjd sändningsvinkel från närmaste långsidan, intro där kameran svävar in (≈ 3 s), sedan en mycket långsam
     drönarrörelse och musparallax. Strålkastarnas glöd andas svagt.
   Ramning: hindren mäts (översiktens text + "Börja här"-kortet och nyckelremsan på dator, annars hjältens rubrik) och arenan
   ramas i den fria ytan till höger (eller under rubriken på smal skärm) med camera.setViewOffset; duken tonas ut under texten
   och under nyckelremsan (mask: --ov-tona0/1, --ov-botten0/1).
   Prestanda: ständiga rörelser i shaders, inga texturuppladdningar per bildruta (tavlan ritas bara när datan ändras och
   några gånger under påslagningen), instansmängder efter s.kvalitet/s.integrerad, statisk skugga (ritas om bara vid start och
   storleksbyte). Bygget sker i etapper med await – sidan låses aldrig.
   Kontrakt: scener.js (montera(vy) → { avmontera() }) och scen3d.js (varaktig, material, ljus, bloom …). */
import { varaktig, webglFinns, laddaCss } from './scen3d.js?v=5';

// Stilen laddas innan första monteringen (ingen blinkning med ostylad sektion)
await Promise.race([laddaCss('scen-oversikt.css?v=10'), new Promise((r) => setTimeout(r, 2500))]);

/* ---- mått i världen (1 enhet = 10 m) ------------------------------------------------------------------ */
const PL = 5.25, PB = 3.4;                    // planens halva längd (x) och halva bredd (z): 105 × 68 m
const GL = 6.3, GB = 4.3;                     // gräsytan (planen + ytan fram till sargen)
const X0 = 6.15, Z0 = 4.2, R0 = 1.05;         // läktarnas framkant: rundad rektangel
const DEP = 0.13;                             // radernas djup
const NED_N = 12, NED_Y = 0.11, NED_H = 0.066; // undre ringen: rader, framkantens höjd, sättning
const GANG = 0.2;                             // gången mellan ringarna
const UPP_N = 11, UPP_H = 0.088, KANT = 0.07; // övre ringen (brantare)
const D_NED = NED_N * DEP, Y_NED = NED_Y + NED_N * NED_H;
const D_FASAD = D_NED + GANG, Y_FASAD = 1.32;
const D_UPP = D_FASAD + KANT, D_BAK = D_UPP + UPP_N * DEP, Y_UPP = Y_FASAD + UPP_N * UPP_H;
const Y_TAKUNDER = 2.74, Y_TAK = 2.87, D_TAKFRAM = 1.92, D_TAKBAK = 3.52, D_YTTER = 3.4;
const SEKTION = 1.45, HORN_SEK = 3, GANGANDEL = 0.085; // läktarsektioner (en gång i början av varje)
const TIFO_B = 4.6;                           // tifons bredd (bortre långsidan, undre ringen)
// resultattavlan: ram, skärm (2:1 som duken), remsan under – på bortre långsidans tak
const TB = 6.0, TH = 3.16, TD = 0.22, SB = 5.72, SH = 2.86;
const RB = 6.0, RH = 0.4, RSB = 5.72, RSH = 0.27, T_GAP = 0.07;
const T_D = 2.45, T_Z = -(Z0 + T_D), T_Y0 = 3.06, T_LUT = -0.07;
const FOV = 18;
const IFK_BLA = '#0f55b4', IFK_VIT = '#f3f6fa', DIS_FARG = 0x0c1926;
const STILL_T = 21.6;                         // tiden i stillbilden (prefers-reduced-motion): matchen visar målfirandet (stillbild())
const N_MAN = 12;
const KORTNAMN = { kontakt: 'Ny kontakt', besok: 'Kundbesök', offert: 'Offert skickad', underlag: 'Underlag & samtycke' };
const PERIOD = { lang: 'senaste 90 dagarna', kort: '90 dagar' };
const affarText = (n) => `${n} ${n === 1 ? 'affär' : 'affärer'}`;
// "totalt 6 vunna affärer och 1 förlorad" (rätt böjning för 1) – ställningen gäller alla affärer sedan start
const stallningText = (v) => `totalt ${v.vunna} ${v.vunna === 1 ? 'vunnen affär' : 'vunna affärer'} och ${v.forlorade} ${v.forlorade === 1 ? 'förlorad' : 'förlorade'}`;
// U-logotypen (samma sökväg som i index.html / scen3d.js), viewBox 0 0 396 395
const U_SOKVAG = 'M177.5,127.8v88.6c0,7.3,1.6,13,4.7,17.3,3.3,4.1,8.4,6.2,15.5,6.2s12.4-2.1,15.8-6.2c3.4-4.3,5.1-10.1,5.1-17.3v-88.6h49.1v88.6c0,14.9-3.1,27.8-9.3,38.4-6.2,10.5-14.7,18.4-25.5,23.8-10.8,5.3-22.9,8-36.2,8s-25.2-2.7-35.5-8c-10.2-5.3-18.2-13.2-24-23.8-5.8-10.5-8.7-23.3-8.7-38.4v-88.6h49.1Z';

/* ---- hjälpare --------------------------------------------------------------------------------------- */
const DAG = 864e5;
const tolka = (iso) => { if (!iso) return null; const s = String(iso); if (s.length === 10) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); } const d = new Date(s); return isNaN(d) ? null : d; };
const midnatt = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dagarSedan = (iso) => { const d = tolka(iso); return d ? Math.round((midnatt(new Date()) - midnatt(d)) / DAG) : Infinity; };
const summa = (lista) => lista.reduce((a, b) => a + (b || 0), 0);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// hårda mellanslag mellan tal och enhet (bryts aldrig isär i löptext)
const kr = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('sv-SE') + ' kr');
const krKort = (n) => (n >= 999500 ? (n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 }) + ' Mkr' : n >= 1e4 ? Math.round(n / 1000).toLocaleString('sv-SE') + ' tkr' : kr(n));
const pct = (x) => (isFinite(x) ? Math.round(x * 100) + ' %' : '–');
const klamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const utExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const inUt = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const ikon = (namn) => { try { return window.UPCRM.ik(namn); } catch (err) { return ''; } };
// Förutsägbar slump (samma publik varje gång)
function slump(fro = 1) {
  let a = fro >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- data ur UPCRM.db (bara läsning) ----------------------------------------------------------------- */
function lasData() {
  const U = window.UPCRM; const db = U && U.db;
  if (!db || !Array.isArray(db.affarer)) return null;
  const varde = (a) => { try { return U.affarVarde(a) || 0; } catch (err) { return 0; } };
  const affarer = db.affarer;
  const oppen = (a) => a.steg !== 'signerad' && a.steg !== 'forlorad';
  const oppna = affarer.filter(oppen);
  const vunna = affarer.filter((a) => a.steg === 'signerad');
  const forlorade = affarer.filter((a) => a.steg === 'forlorad' && !(a.forlorad && a.forlorad.felregistrerad));

  // Intäkt per månad: signerade affärer efter månaden de signerades (som översiktens intäktsgraf)
  const nu = new Date(); const man = [];
  for (let i = N_MAN - 1; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1);
    man.push({ ar: d.getFullYear(), m: d.getMonth(), kort: d.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', ''),
      namn: d.toLocaleDateString('sv-SE', { month: 'long' }), lang: d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }), varde: 0, antal: 0, nu: i === 0 });
  }
  vunna.forEach((a) => { const d = tolka(a.stegAndrad); if (!d) return; const x = man.find((q) => q.ar === d.getFullYear() && q.m === d.getMonth()); if (x) { x.varde += varde(a); x.antal++; } });

  // Säljstegen (öppna affärer per steg) + signerat senaste 90 dagarna
  const STEG = typeof SALJSTEG !== 'undefined' && Array.isArray(SALJSTEG) ? SALJSTEG // eslint-disable-line no-undef
    : [{ id: 'kontakt', namn: 'Ny kontakt' }, { id: 'besok', namn: 'Kundbesök' }, { id: 'offert', namn: 'Offert skickad' }, { id: 'underlag', namn: 'Underlag & samtycke' }];
  const steg = STEG.filter((s) => s.id !== 'signerad').map((s) => { const af = oppna.filter((a) => a.steg === s.id); return { id: s.id, namn: s.namn || KORTNAMN[s.id] || s.id, antal: af.length, varde: summa(af.map(varde)) }; });
  const v90 = vunna.filter((a) => dagarSedan(a.stegAndrad) <= 90);
  const vunnet = { id: 'vunnet', namn: `Signerat ${PERIOD.lang}`, antal: v90.length, varde: summa(v90.map(varde)) };

  // Nyckeltal (hjältens rutor i bandläget)
  const jag = U.jag;
  const mig = (db.anvandare || []).find((u) => u.id === jag) || { kort: '', roll: 'salj' };
  const pipe = summa(oppna.map(varde));
  const mina = oppna.filter((a) => a.ansvarig === jag);
  const tider = vunna.map((a) => { const s0 = tolka(a.skapad), s1 = tolka(a.stegAndrad); return s0 && s1 ? Math.max(0, Math.round((midnatt(s1) - midnatt(s0)) / DAG)) : null; }).filter((x) => x != null);
  const viaKlubb = oppna.filter((a) => { const k = U.kund(a.kundId); return !!(k && k.viaKlubb); });
  const basta = man.reduce((b, m) => (m.varde > (b ? b.varde : 0) ? m : b), null);
  const kommande = (db.projekt || []).filter((p) => p.steg !== 'klar' && p.testdatum && dagarSedan(p.testdatum) <= 0)
    .sort((a, b) => String(a.testdatum).localeCompare(String(b.testdatum)));
  const nasta = kommande[0] ? { datum: tolka(kommande[0].testdatum), kund: (U.kund(kommande[0].kundId) || {}).namn || '' } : null;

  const d = {
    man, manNu: man[man.length - 1], steg, vunnet, mig, pipe, oppnaAntal: oppna.length,
    mina: { antal: mina.length, varde: summa(mina.map(varde)) },
    vinst: { vunna: vunna.length, forlorade: forlorade.length, grad: vunna.length + forlorade.length ? vunna.length / (vunna.length + forlorade.length) : NaN },
    tid: tider.length ? Math.round(summa(tider) / tider.length) : null,
    klubb: { antal: viaKlubb.length, varde: summa(viaKlubb.map(varde)), andel: pipe ? summa(viaKlubb.map(varde)) / pipe : NaN },
    basta, kommande: kommande.length, nasta,
  };
  // allt som syns på tavlan och remsan – ändras något ritas de om
  d.nyckel = JSON.stringify([d.vinst.vunna, d.vinst.forlorade, Math.round(pipe), d.oppnaAntal, vunnet.antal, Math.round(vunnet.varde),
    man.map((m) => [m.ar, m.m, Math.round(m.varde), m.antal]), steg.map((s) => [s.id, s.namn, s.antal, Math.round(s.varde)])]);
  return d;
}

/* ---- hjältesektionens HTML ---------------------------------------------------------------------------- */
function hjalteHtml(d) {
  const delar = [];
  const vinst = isFinite(d.vinst.grad);
  delar.push(`${esc(stallningText(d.vinst).replace(/^t/, 'T'))}${vinst ? ` – vinstgrad <strong>${esc(pct(d.vinst.grad))}</strong>` : ''}.`);
  if (d.basta) delar.push(`Bästa månaden det senaste året: <strong>${esc(d.basta.lang)}</strong>, <strong>${esc(krKort(d.basta.varde))}</strong>.`);

  const test = d.mig.roll === 'test';
  const ruta1 = test
    ? `<div class="ov-ruta"><dt>${ikon('kalender')}Kommande testdagar</dt><dd><strong data-ov-tal="${d.kommande}" data-ov-format="antal">${d.kommande}</strong>
        <small>${d.nasta ? `Nästa ${esc(d.nasta.datum.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', ''))} · ${esc(d.nasta.kund)}` : 'Inga bokade just nu'}</small></dd></div>`
    : `<div class="ov-ruta"><dt>${ikon('salj')}Dina öppna affärer</dt><dd><strong data-ov-tal="${Math.round(d.mina.varde)}" data-ov-format="krkort">${esc(krKort(d.mina.varde))}</strong>
        <small>${d.mina.antal} av teamets ${d.oppnaAntal} · ${esc(pct(d.pipe ? d.mina.varde / d.pipe : NaN))} av värdet</small></dd>
        <i class="ov-matare" aria-hidden="true"><b style="--andel:${klamp(d.pipe ? d.mina.varde / d.pipe : 0).toFixed(3)}"></b></i></div>`;
  // Hälsningen med namnet står i översiktens sidhuvud direkt under – här bara rubriken
  return `
    <div class="ov-text">
      <p class="ov-ogon"><span class="ov-live" aria-hidden="true"></span>Affärsläget · live<a class="ov-lank" href="#/salj">Säljtavlan${ikon('pil')}</a></p>
      <h2 class="ov-rubrik" id="ov-rubrik"><em>Resultattavlan</em></h2>
      <p class="ov-ingress">${delar.join(' ')}</p>
      <dl class="ov-tal">
        ${ruta1}
        <div class="ov-ruta"><dt>${ikon('trend')}Vinstgrad</dt><dd><strong data-ov-tal="${vinst ? Math.round(d.vinst.grad * 100) : ''}" data-ov-format="pct">${vinst ? esc(pct(d.vinst.grad)) : '–'}</strong>
          <small>${d.vinst.vunna} vunna · ${d.vinst.forlorade} ${d.vinst.forlorade === 1 ? 'förlorad' : 'förlorade'} totalt</small></dd>
          <i class="ov-matare" aria-hidden="true"><b style="--andel:${vinst ? d.vinst.grad.toFixed(3) : 0}"></b></i></div>
        <div class="ov-ruta"><dt>${ikon('klocka')}Tid till order</dt><dd><strong data-ov-tal="${d.tid ?? ''}" data-ov-format="dagar">${d.tid != null ? `${d.tid} d` : '–'}</strong>
          <small>snitt från ny affär till order</small></dd></div>
        <div class="ov-ruta ov-ruta-orange"><dt>${ikon('klubb')}Via klubbar</dt><dd><strong data-ov-tal="${isFinite(d.klubb.andel) ? Math.round(d.klubb.andel * 100) : ''}" data-ov-format="pct">${esc(pct(d.klubb.andel))}</strong>
          <small>av pipelinen · ${d.klubb.antal} ${d.klubb.antal === 1 ? 'affär' : 'affärer'}</small></dd>
          <i class="ov-matare" aria-hidden="true"><b style="--andel:${klamp(isFinite(d.klubb.andel) ? d.klubb.andel : 0).toFixed(3)}"></b></i></div>
      </dl>
    </div>
    <div class="ov-scen" data-ov-scen aria-hidden="true"></div>
    <i class="ov-fog" aria-hidden="true"></i>
    <p class="sr">${esc(sammanfattning(d))}</p>`;
}

function sammanfattning(d) {
  const steg = d.steg.map((s) => `${s.namn}: ${affarText(s.antal)}, ${kr(s.varde)}`).join('; ');
  const man = d.man.slice(-6).map((m) => `${m.lang} ${kr(m.varde)}`).join(', ');
  return `Resultattavlan: ${stallningText(d.vinst)}, vinstgrad ${pct(d.vinst.grad)}. `
    + `Signerat ${PERIOD.lang}: ${kr(d.vunnet.varde)}. Öppen pipeline: ${kr(d.pipe)}. Intäkt ${d.manNu.lang}: ${kr(d.manNu.varde)}. `
    + `Säljstegen: ${steg}. Intäkt per månad: ${man}.`;
}

// Räkneverk för nyckeltalen (bara första visningen)
function raknaUpp(rot) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  rot.querySelectorAll('[data-ov-tal]').forEach((el, i) => {
    const mal = parseFloat(el.dataset.ovTal); const f = el.dataset.ovFormat;
    if (!isFinite(mal) || mal <= 0) return;
    const fmt = (v) => (f === 'krkort' ? krKort(v) : f === 'pct' ? Math.round(v) + ' %' : f === 'dagar' ? Math.round(v) + ' d' : Math.round(v).toLocaleString('sv-SE'));
    const start = performance.now() + 380 + i * 90; const tid = 1500;
    const steg = (t) => {
      if (!el.isConnected) return;
      const p = klamp((t - start) / tid);
      el.textContent = fmt(p < 1 ? mal * utExpo(p) : mal);
      if (p < 1) requestAnimationFrame(steg);
    };
    el.textContent = fmt(0);
    requestAnimationFrame(steg);
  });
}

/* ---- canvas: texturer --------------------------------------------------------------------------------- */
let uVag = null;
function ritaU(ctx, x, y, storlek, farg) {
  if (!uVag) uVag = new Path2D(U_SOKVAG);
  ctx.save(); ctx.translate(x, y); ctx.scale(storlek / 396, storlek / 396);
  ctx.fillStyle = farg; ctx.fill(uVag);
  ctx.beginPath(); ctx.arc(198, 197.5, 188, 0, Math.PI * 2); ctx.lineWidth = 22; ctx.strokeStyle = farg; ctx.stroke();
  ctx.restore();
}
// Typsnitt + spärrning; krymper tills texten ryms i maxB
function typ(ctx, vikt, storlek, spar = 0, familj = 'Poppins') {
  ctx.font = `${vikt} ${Math.round(storlek)}px ${familj}, "Segoe UI", Arial, sans-serif`;
  try { ctx.letterSpacing = `${(spar * storlek).toFixed(1)}px`; } catch (err) { /* äldre webbläsare */ }
}
function passa(ctx, text, maxB, vikt, storlek, spar = 0, familj = 'Poppins') {
  let s = storlek;
  for (let i = 0; i < 40; i++) { typ(ctx, vikt, s, spar, familj); if (ctx.measureText(text).width <= maxB) break; s *= 0.95; }
  return s;
}
const rundRekt = (ctx, x, y, b, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, b, h, r) : ctx.rect(x, y, b, h); };

// Gräset: klippta ränder i två gröna toner, brus, ljusa och mörka fläckar, slitage i målgårdarna och skarpa linjer
function ritaGras(ctx, B, H) {
  const k = B / (2 * GL);
  const X = (x) => (x + GL) * k, Z = (z) => (z + GB) * k;
  const r = slump(29);
  // ränder tvärs planen (18 st mellan mållinjerna, fortsätter ut till sargen)
  const rand = (2 * PL) / 18;
  for (let i = -3; i < 22; i++) {
    const x0 = -PL + i * rand;
    ctx.fillStyle = i % 2 ? '#2f7a35' : '#3a8b3f';
    ctx.fillRect(Math.floor(X(x0)), 0, Math.ceil(rand * k) + 1, H);
  }
  // rutigt klippmönster: svaga ränder längs planen ovanpå tvärränderna
  const radB = (2 * PB) / 12;
  for (let j = -2; j < 16; j++) if (j % 2) { ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(0, Z(-PB + j * radB), B, radB * k + 1); }
  // stora, mjuka variationer
  for (let i = 0; i < 26; i++) {
    const x = r() * B, y = r() * H, rad = (0.6 + r() * 1.8) * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const ljus = r() < 0.5;
    g.addColorStop(0, ljus ? 'rgba(170,220,120,.07)' : 'rgba(10,40,15,.09)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // slitage framför målen
  for (const sx of [-1, 1]) {
    const x = X(sx * (PL - 0.45)), y = Z(0), rad = 0.75 * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(150,150,90,.16)'); g.addColorStop(1, 'rgba(150,150,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // målområdena (brunare), mittcirkeln och linjedomarnas spår längs långsidorna
  for (const sx of [-1, 1]) {
    const rz = 0.55 * k; ctx.save(); ctx.translate(X(sx * (PL - 0.14)), Z(0)); ctx.scale(0.55, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rz); g.addColorStop(0, 'rgba(135,112,64,.26)'); g.addColorStop(1, 'rgba(135,112,64,0)');
    ctx.fillStyle = g; ctx.fillRect(-rz, -rz, rz * 2, rz * 2); ctx.restore();
  }
  { const g = ctx.createRadialGradient(X(0), Z(0), 0.15 * k, X(0), Z(0), 1.0 * k); g.addColorStop(0, 'rgba(150,150,90,.11)'); g.addColorStop(1, 'rgba(150,150,90,0)'); ctx.fillStyle = g; ctx.fillRect(X(-1.05), Z(-1.05), 2.1 * k, 2.1 * k); }
  for (const sz of [-1, 1]) { ctx.fillStyle = 'rgba(150,150,95,.09)'; ctx.fillRect(X(-PL + 0.2), Z(sz * (PB + 0.06)) - 0.025 * k, (2 * PL - 0.4) * k, 0.05 * k); }
  // fint brus (en liten bricka som upprepas – billigt att rita)
  const t = document.createElement('canvas'); t.width = t.height = 256;
  const tc = t.getContext('2d'); const img = tc.createImageData(256, 256); const px = img.data;
  for (let i = 0; i < px.length; i += 4) { const v = 128 + (r() - 0.5) * 120; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
  tc.putImageData(img, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.28; ctx.fillStyle = ctx.createPattern(t, 'repeat'); ctx.fillRect(0, 0, B, H); ctx.restore();
  t.width = t.height = 0;
  // linjerna (12 cm – lite bredare i texturen så att de står skarpt även på avstånd)
  ctx.save();
  ctx.strokeStyle = 'rgba(248,251,255,.94)'; ctx.fillStyle = 'rgba(248,251,255,.94)';
  ctx.lineWidth = Math.max(2.2, 0.016 * k); ctx.lineJoin = 'miter';
  const linje = (pts) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); };
  const rekt = (x0, z0, x1, z1) => { ctx.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); };
  const prick = (x, z, rad) => { ctx.beginPath(); ctx.arc(X(x), Z(z), rad * k, 0, Math.PI * 2); ctx.fill(); };
  const bage = (x, z, rad, a0, a1) => { ctx.beginPath(); ctx.arc(X(x), Z(z), rad * k, a0, a1); ctx.stroke(); };
  rekt(-PL, -PB, PL, PB);
  linje([[0, -PB], [0, PB]]);
  bage(0, 0, 0.915, 0, Math.PI * 2);
  prick(0, 0, 0.024);
  for (const sx of [-1, 1]) {
    const x = sx * PL;
    linje([[x, -2.016], [x - sx * 1.65, -2.016], [x - sx * 1.65, 2.016], [x, 2.016]]);
    linje([[x, -0.916], [x - sx * 0.55, -0.916], [x - sx * 0.55, 0.916], [x, 0.916]]);
    prick(x - sx * 1.1, 0, 0.02);
    const a = Math.acos(0.55 / 0.915);
    if (sx < 0) bage(x + 1.1, 0, 0.915, -a, a); else bage(x - 1.1, 0, 0.915, Math.PI - a, Math.PI + a);
    // hörnbågar
    bage(x, -PB, 0.1, sx < 0 ? 0 : Math.PI / 2, sx < 0 ? Math.PI / 2 : Math.PI);
    bage(x, PB, 0.1, sx < 0 ? -Math.PI / 2 : Math.PI, sx < 0 ? 0 : Math.PI * 1.5);
  }
  ctx.restore();
}

// Säten och gångar: övre halvan = sättningen (ryggstöd i blått), nedre halvan = planet (betong); en gång i början av sektionen
function ritaSaten(ctx, B, H) {
  const halv = H / 2, gang = Math.round(B * GANGANDEL);
  const r = slump(5);
  ctx.fillStyle = '#20262e'; ctx.fillRect(0, 0, B, halv);
  ctx.fillStyle = '#3c434c'; ctx.fillRect(0, halv, B, halv);
  // brus i betongen
  for (let i = 0; i < 900; i++) { const g = 50 + r() * 40; ctx.fillStyle = `rgba(${g},${g + 4},${g + 10},.35)`; ctx.fillRect(r() * B, halv + r() * halv, 2 + r() * 6, 1 + r() * 2); }
  const n = 15; const w = (B - gang) / n;
  for (let i = 0; i < n; i++) {
    const x = gang + i * w;
    // ryggstöd (sättningen)
    const g = ctx.createLinearGradient(0, 8, 0, halv - 6);
    g.addColorStop(0, '#3f7fd6'); g.addColorStop(0.5, '#1e5bb0'); g.addColorStop(1, '#123c78');
    ctx.fillStyle = g; rundRekt(ctx, x + w * 0.1, 10, w * 0.8, halv - 18, 8); ctx.fill();
    // sitsen på planet
    ctx.fillStyle = '#174a92'; rundRekt(ctx, x + w * 0.12, halv + 6, w * 0.76, halv * 0.36, 6); ctx.fill();
  }
  // gången: ljusare betong med trappkant
  ctx.fillStyle = '#5a626c'; ctx.fillRect(0, 0, gang, H);
  ctx.fillStyle = '#7a838e'; ctx.fillRect(0, halv - 4, gang, 4); ctx.fillRect(0, H - 4, gang, 4);
}

// Publikens atlas (128 × 256 per pose): tolv poser i kanaler – R = tröja (med skuggning), G = hud, B = hår; alfa = figuren
// 0 armar nere · 1 klappar (händerna ihop) · 2 klappar ovanför huvudet · 3 armarna i V · 4 höger arm uppe · 5 halsduk uppe
// 6 händerna isär (före klappen) · 7 vänster arm uppe · 8–9 halsduken snurras (två lägen) · 10 båda armarna rakt upp (jubel)
// 11 armarna i kors (bortalagets fans när IFK gör mål)
const POSER = 12;
function ritaPublik(ctx, B, H) {
  const fw = B / POSER, sk = fw / 64;
  const R = 'rgb(255,0,0)', G = 'rgb(0,235,0)', HAR = 'rgb(0,0,255)';
  const arm = (pts, farg = R) => { ctx.strokeStyle = farg; ctx.lineWidth = 8.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  const hand = (x, y) => { ctx.fillStyle = G; ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.fill(); };
  const POS = [
    [[[19, 60], [15, 86], [17, 106]], [[45, 60], [49, 86], [47, 106]]],
    [[[19, 60], [11, 80], [29, 73]], [[45, 60], [53, 80], [35, 73]]],
    [[[19, 58], [12, 38], [29, 14]], [[45, 58], [52, 38], [35, 14]]],
    [[[19, 58], [12, 34], [8, 11]], [[45, 58], [52, 34], [56, 11]]],
    [[[19, 60], [15, 86], [17, 106]], [[45, 58], [51, 34], [48, 9]]],
    [[[19, 58], [11, 37], [11, 17]], [[45, 58], [53, 37], [53, 17]]],
    [[[19, 60], [10, 82], [20, 70]], [[45, 60], [54, 82], [44, 70]]],
    [[[19, 58], [13, 34], [16, 9]], [[45, 60], [49, 86], [47, 106]]],
    [[[19, 60], [15, 86], [17, 106]], [[45, 58], [52, 36], [44, 12]]],
    [[[19, 60], [15, 86], [17, 106]], [[45, 58], [52, 36], [44, 12]]],
    [[[19, 58], [15, 33], [20, 6]], [[45, 58], [49, 33], [44, 6]]],
    [[[19, 60], [16, 80], [40, 74]], [[45, 60], [48, 80], [24, 72]]],
  ];
  for (let f = 0; f < POSER; f++) {
    ctx.save(); ctx.translate(f * fw, 0); ctx.scale(sk, H / 128);
    // kroppen (tröjan): ljusare i mitten
    const g = ctx.createLinearGradient(17, 0, 47, 0);
    g.addColorStop(0, 'rgb(170,0,0)'); g.addColorStop(0.45, 'rgb(255,0,0)'); g.addColorStop(1, 'rgb(150,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(16, 60); ctx.quadraticCurveTo(18, 54, 26, 53); ctx.lineTo(38, 53); ctx.quadraticCurveTo(46, 54, 48, 60);
    ctx.lineTo(46, 128); ctx.lineTo(18, 128); ctx.closePath(); ctx.fill();
    // halsen och huvudet
    ctx.fillStyle = G; ctx.fillRect(28.5, 46, 7, 9);
    ctx.beginPath(); ctx.ellipse(32, 39, 9.2, 10.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = HAR; ctx.beginPath(); ctx.ellipse(32, 36.5, 9.6, 8.6, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    ctx.fillRect(22.4, 33, 19.2, 3.6);
    // halsduken (pose 5) – tar tröjans färg (randig i shadern = blåvita block); 8–9: snurras över huvudet i två lägen
    if (f === 5) { ctx.fillStyle = R; rundRekt(ctx, 3, 8, 58, 11, 3); ctx.fill(); }
    if (f === 8 || f === 9) {
      ctx.save(); ctx.translate(44, 12); ctx.rotate(f === 8 ? -0.5 : 0.95);
      ctx.fillStyle = R; rundRekt(ctx, -40, -5, 42, 10, 3); ctx.fill(); ctx.fillRect(-44, -5, 4, 3); ctx.fillRect(-44, 2, 4, 3);
      ctx.restore();
    }
    // armarna (ärmar i tröjans färg) och händerna
    for (const a of POS[f]) { arm(a); const h = a[a.length - 1]; hand(h[0], h[1]); }
    ctx.restore();
  }
}

// Flaggornas atlas: fyra små mönster + en stor flagga (256 × 160 per ruta)
const DESIGNER = 5;
function ritaFlaggor(ctx, B, H) {
  const w = B / DESIGNER;
  const ruta = (i, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(i * w, 0, w, H); ctx.clip(); ctx.translate(i * w, 0); fn(w, H); ctx.restore(); };
  ruta(0, (b, h) => { for (let j = 0; j < 5; j++) { ctx.fillStyle = j % 2 ? IFK_VIT : IFK_BLA; ctx.fillRect((j * b) / 5, 0, b / 5 + 1, h); } });
  ruta(1, (b, h) => { for (let j = 0; j < 5; j++) { ctx.fillStyle = j % 2 ? IFK_VIT : IFK_BLA; ctx.fillRect(0, (j * h) / 5, b, h / 5 + 1); } });
  ruta(2, (b, h) => { ctx.fillStyle = IFK_BLA; ctx.fillRect(0, 0, b, h); ctx.fillStyle = IFK_VIT; ctx.fillRect(0, h * 0.08, b, h * 0.06); ctx.fillRect(0, h * 0.86, b, h * 0.06);
    passa(ctx, 'IFK', b * 0.8, 600, h * 0.62, 0.04); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('IFK', b / 2, h * 0.53); });
  ruta(3, (b, h) => { ctx.fillStyle = IFK_VIT; ctx.fillRect(0, 0, b, h); ctx.fillStyle = IFK_BLA; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b, 0); ctx.lineTo(0, h); ctx.closePath(); ctx.fill(); });
  ruta(4, (b, h) => {
    for (let j = 0; j < 7; j++) { ctx.fillStyle = j % 2 ? IFK_VIT : IFK_BLA; ctx.fillRect((j * b) / 7, 0, b / 7 + 1, h); }
    ctx.fillStyle = IFK_BLA; ctx.fillRect(0, h * 0.3, b, h * 0.4);
    ctx.fillStyle = IFK_VIT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    passa(ctx, 'IFK GÖTEBORG', b * 0.86, 600, h * 0.22, 0.02); ctx.fillText('IFK GÖTEBORG', b / 2, h * 0.515);
  });
}

// Tifon: vertikala blåvita ränder, ett blått mittband och "IFK GÖTEBORG"
function ritaTifo(ctx, B, H) {
  const n = 16; const w = B / n;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? IFK_VIT : IFK_BLA; ctx.fillRect(i * w, 0, w + 1, H); }
  const y0 = H * 0.24, y1 = H * 0.76;
  ctx.fillStyle = IFK_BLA; ctx.fillRect(0, y0, B, y1 - y0);
  ctx.fillStyle = IFK_VIT; ctx.fillRect(0, y0 - 16, B, 12); ctx.fillRect(0, y1 + 4, B, 12);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const s = passa(ctx, 'IFK GÖTEBORG', B * 0.9, 600, (y1 - y0) * 0.78, 0.05);
  ctx.fillText('IFK GÖTEBORG', B / 2, H / 2 + s * 0.03);
}

// LED-skyltarna runt planen: text på marinblått + blåvita fält
function ritaSarg(ctx, B, H) {
  const t1 = Math.round(B * 0.64);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d2748'); g.addColorStop(1, '#081a33');
  ctx.fillStyle = g; ctx.fillRect(0, 0, t1, H);
  ritaU(ctx, 22, H * 0.16, H * 0.68, '#ffffff');
  ctx.textBaseline = 'middle';
  typ(ctx, 600, H * 0.46, 0.12); ctx.fillStyle = '#ffffff'; ctx.fillText('UPERFORMANCE', 22 + H * 0.92, H * 0.54);
  const x2 = 22 + H * 0.92 + ctx.measureText('UPERFORMANCE').width + H * 0.4;
  ctx.fillStyle = '#7ee0c3'; ctx.beginPath(); ctx.arc(x2, H * 0.52, H * 0.07, 0, Math.PI * 2); ctx.fill();
  typ(ctx, 500, H * 0.42, 0.1); ctx.fillStyle = '#cfe4ff'; ctx.fillText('HÄLSA MED ELITSTANDARD', x2 + H * 0.4, H * 0.54);
  const n = 8; const w = (B - t1) / n;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? IFK_VIT : IFK_BLA; ctx.fillRect(t1 + i * w, 0, w + 1, H); }
}

// LED-skyltarna när IFK gör mål: "MÅL!" och "IFK GÖTEBORG" på blått (rullar snabbt under firandet)
function ritaMalSarg(ctx, B, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1466d6'); g.addColorStop(1, '#0a3c8c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, B, H);
  ctx.textBaseline = 'middle'; let x = 24;
  while (x < B) {
    typ(ctx, 700, H * 0.64, 0.06); ctx.fillStyle = '#ffffff'; ctx.fillText('MÅL!', x, H * 0.56); x += ctx.measureText('MÅL!').width + H * 0.55;
    ctx.fillStyle = '#7ee0c3'; ctx.beginPath(); ctx.arc(x - H * 0.28, H * 0.52, H * 0.07, 0, Math.PI * 2); ctx.fill();
    typ(ctx, 600, H * 0.42, 0.12); ctx.fillStyle = '#d6e9ff'; ctx.fillText('IFK GÖTEBORG', x, H * 0.56); x += ctx.measureText('IFK GÖTEBORG').width + H * 0.8;
  }
}

// Målnätet: ett tunt rutnät som upprepas
function ritaNat(ctx, B, H) {
  ctx.clearRect(0, 0, B, H);
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(0, 0, B, 3); ctx.fillRect(0, 0, 3, H);
}

// Storflaggor, takflaggor och hörnflaggor: fem mönster à 512 × 320 (ritas en gång). Bara klubbens namn och färger + vårt eget märke.
// 0 IFK GÖTEBORG · 1 vågräta ränder · 2 "IFK" · 3 diagonalt delad · 4 Uperformance (marinblå med U-märket)
const STOR_DESIGNER = 5;
function ritaStorflaggor(ctx, B, H) {
  const w = B / STOR_DESIGNER;
  const ruta = (i, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(i * w, 0, w, H); ctx.clip(); ctx.translate(i * w, 0); fn(w, H); ctx.restore(); };
  const ranta = (b, h, n, vagrat) => { for (let j = 0; j < n; j++) { ctx.fillStyle = j % 2 ? IFK_VIT : IFK_BLA; if (vagrat) ctx.fillRect(0, (j * h) / n, b, h / n + 1); else ctx.fillRect((j * b) / n, 0, b / n + 1, h); } };
  const text = (t, b, h, y, storlek, spar) => { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; passa(ctx, t, b * 0.84, 700, storlek, spar); ctx.fillText(t, b / 2, y); };
  ruta(0, (b, h) => {
    ranta(b, h, 7, false);
    ctx.fillStyle = IFK_BLA; ctx.fillRect(0, h * 0.3, b, h * 0.4);
    ctx.fillStyle = IFK_VIT; ctx.fillRect(0, h * 0.3, b, h * 0.03); ctx.fillRect(0, h * 0.67, b, h * 0.03);
    text('IFK GÖTEBORG', b, h, h * 0.505, h * 0.19, 0.04);
  });
  ruta(1, (b, h) => ranta(b, h, 5, true));
  ruta(2, (b, h) => {
    ctx.fillStyle = IFK_BLA; ctx.fillRect(0, 0, b, h);
    ctx.fillStyle = IFK_VIT; ctx.fillRect(0, h * 0.08, b, h * 0.05); ctx.fillRect(0, h * 0.87, b, h * 0.05);
    text('IFK', b, h, h * 0.52, h * 0.5, 0.06);
  });
  ruta(3, (b, h) => { ctx.fillStyle = IFK_VIT; ctx.fillRect(0, 0, b, h); ctx.fillStyle = IFK_BLA; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b, 0); ctx.lineTo(0, h); ctx.closePath(); ctx.fill(); });
  ruta(4, (b, h) => {
    const g = ctx.createLinearGradient(0, 0, b, h); g.addColorStop(0, '#22476d'); g.addColorStop(1, '#0d2238');
    ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
    ctx.fillStyle = '#7ee0c3'; ctx.fillRect(0, h * 0.92, b, h * 0.08);
    ritaU(ctx, b / 2 - h * 0.21, h * 0.1, h * 0.42, '#ffffff');
    text('UPERFORMANCE', b, h, h * 0.72, h * 0.12, 0.14);
  });
}

// Spelarnas atlas (128 × 256 per bild, ritad i ett 64 × 128-raster): 0–7 löpsteg (en hel cykel – lår, knä och armar följer en
// sinuskurva), 8 står, 9 skott, 10 jubel (båda armarna upp, i luften), 11 målvakten redo, 12 pekar, 13 bollen, 14 armarna i kors
// (ledarna), 15 jubel med knytnäven, 16 glidtackling, 17 målvaktsdyk, 18 nick (hopp), 19 målvakten håller bollen. Kanaler som publiken: R = tröja (skuggad), G = hud, B = byxor och strumpor; svart med full
// täckning = hår och skor. Bakre armar och ben är mörkare (djup). Shadern ritar en mörk kontur runt figuren (syns mot gräset).
const SPELBILDER = 20;
function ritaSpelare(ctx, B, H) {
  const fw = B / SPELBILDER, sk = fw / 64;
  const lem = (pts, farg, bredd) => { ctx.strokeStyle = farg; ctx.lineWidth = bredd; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  // a = vinkel från lodrätt nedåt (+ framåt, mot +x); π = rakt upp
  const led = (o, a, l) => [o[0] + Math.sin(a) * l, o[1] + Math.cos(a) * l];
  const mitt = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const ben = (hoft, lar, kna, bak) => {
    const k = bak ? 0.6 : 1;
    const knat = led(hoft, lar, 21), fot = led(knat, lar - kna, 22);
    lem([knat, mitt(knat, fot, 0.35)], `rgb(0,${Math.round(205 * k)},0)`, 6.4);   // knäet och smalbenets överdel (hud)
    lem([mitt(knat, fot, 0.3), fot], `rgb(0,0,${Math.round(235 * k)})`, 7);        // strumpan
    lem([hoft, knat], `rgb(0,${Math.round(222 * k)},0)`, 7.8);                       // låret
    ctx.save(); ctx.translate(fot[0], fot[1]); ctx.rotate((kna - lar) * 0.35);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(3.4, 1.6, 6.4, 3.3, 0, 0, Math.PI * 2); ctx.fill(); // skon
    ctx.restore();
  };
  const arm = (axel, a, e, bak) => {
    const k = bak ? 0.58 : 1;
    const armb = led(axel, a, 15.5), hand = led(armb, a + e, 14);
    lem([mitt(axel, armb, 0.5), armb, hand], `rgb(0,${Math.round(220 * k)},0)`, 5.6);   // underarmen (hud)
    lem([axel, mitt(axel, armb, 0.62)], `rgb(${Math.round(245 * k)},0,0)`, 7.6);         // ärmen
    ctx.fillStyle = `rgb(0,${Math.round(230 * k)},0)`; ctx.beginPath(); ctx.arc(hand[0], hand[1], 3.5, 0, Math.PI * 2); ctx.fill();
  };
  const ram = (f, p) => {
    ctx.save(); ctx.translate(f * fw, 0); ctx.scale(sk, H / 128);
    const lut = p.lut ?? 0.08;
    const hoft = [p.hx ?? 32, 76 + (p.bob || 0)];
    const axel = [hoft[0] + Math.sin(lut) * 34, hoft[1] - Math.cos(lut) * 34];
    ben(hoft, p.tB, p.kB, true); arm(axel, p.aB, p.eB, true);
    ben(hoft, p.tF, p.kF, false);
    // tröjan: axlarna bredare än midjan, ljusare i mitten (volym)
    const g = ctx.createLinearGradient(axel[0] - 12, 0, axel[0] + 12, 0);
    g.addColorStop(0, 'rgb(175,0,0)'); g.addColorStop(0.45, 'rgb(255,0,0)'); g.addColorStop(1, 'rgb(160,0,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(axel[0] - 11.5, axel[1] + 1); ctx.quadraticCurveTo(axel[0], axel[1] - 6, axel[0] + 11.5, axel[1] + 1);
    ctx.lineTo(hoft[0] + 9.5, hoft[1] - 5); ctx.lineTo(hoft[0] - 9.5, hoft[1] - 5); ctx.closePath(); ctx.fill();
    // byxorna över lårens överdel
    ctx.fillStyle = 'rgb(0,0,235)'; ctx.beginPath(); ctx.moveTo(hoft[0] - 10.5, hoft[1] - 8); ctx.lineTo(hoft[0] + 10.5, hoft[1] - 8);
    ctx.lineTo(hoft[0] + 11.5, hoft[1] + 8); ctx.lineTo(hoft[0] + 1, hoft[1] + 9); ctx.lineTo(hoft[0], hoft[1] + 4); ctx.lineTo(hoft[0] - 1, hoft[1] + 9); ctx.lineTo(hoft[0] - 11.5, hoft[1] + 8); ctx.closePath(); ctx.fill();
    arm(axel, p.aF, p.eF, false);
    // halsen, huvudet och håret
    const hc = [axel[0] + 1.5 + Math.sin(lut) * 3, axel[1] - 15];
    ctx.fillStyle = 'rgb(0,215,0)'; ctx.fillRect(hc[0] - 3.2, hc[1] + 5, 6.4, 8);
    ctx.fillStyle = 'rgb(0,235,0)'; ctx.beginPath(); ctx.ellipse(hc[0], hc[1], 7.6, 8.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hc[0] - 0.6, hc[1] - 2.6, 8.1, 6.6, 0, Math.PI * 0.98, Math.PI * 2.02); ctx.fill();
    ctx.fillRect(hc[0] - 8.1, hc[1] - 3, 4.6, 6.5);
    ctx.restore();
  };
  // löpsteget: åtta faser av samma cykel (knät böjs i pendeln framåt, armarna i motfas)
  for (let f = 0; f < 8; f++) {
    const fi = (f / 8) * Math.PI * 2, s = Math.sin(fi), c = Math.cos(fi);
    ram(f, { tF: 0.62 * s, tB: -0.62 * s, kF: 0.12 + 1.1 * Math.max(0, c), kB: 0.12 + 1.1 * Math.max(0, -c), aF: -0.78 * s, aB: 0.78 * s, eF: 1.35, eB: 1.35, bob: 1.2 - 2.6 * Math.abs(c), lut: 0.16 });
  }
  ram(8, { tF: 0.07, tB: -0.07, kF: 0.06, kB: 0.04, aF: 0.14, aB: -0.1, eF: 0.32, eB: 0.26, lut: 0.03 });                                         // står
  ram(9, { tF: 0.74, tB: -0.06, kF: 0.22, kB: 0.18, aF: -0.95, aB: 1.2, eF: 0.45, eB: 0.4, lut: -0.12 });                                           // skott
  ram(10, { tF: 0.36, tB: 0.12, kF: 1.05, kB: 0.95, aF: Math.PI - 0.3, aB: Math.PI + 0.24, eF: 0.1, eB: -0.08, bob: -7, lut: -0.04 });             // jubel
  ram(11, { tF: 0.42, tB: -0.3, kF: 0.95, kB: 0.75, aF: 1.3, aB: 1.0, eF: 0.22, eB: 0.32, bob: 6, lut: 0.36 });                                     // målvakten redo
  ram(12, { tF: 0.07, tB: -0.07, kF: 0.05, kB: 0.05, aF: Math.PI / 2 + 0.12, aB: -0.12, eF: 0, eB: 0.22, lut: 0.02 });                             // pekar
  ram(14, { tF: 0.08, tB: -0.08, kF: 0.05, kB: 0.05, aF: 0.32, aB: 0.2, eF: 1.8, eB: 1.9, lut: 0 });                                                // armarna i kors
  ram(15, { tF: 0.55, tB: -0.5, kF: 0.4, kB: 0.95, aF: Math.PI - 0.32, aB: 0.55, eF: 0.45, eB: 1.25, lut: 0.1, bob: -3 });                        // jubel med knytnäven
  ram(16, { hx: 20, tF: 1.25, tB: 0.95, kF: 0.05, kB: 2.3, aF: -0.75, aB: 1.15, eF: 0.4, eB: 0.5, lut: -0.62, bob: 24 });                         // glidtackling
  ram(17, { hx: 16, tF: -0.55, tB: -0.85, kF: 0.25, kB: 0.4, aF: 2.3, aB: 2.05, eF: 0.05, eB: 0.1, lut: 0.85, bob: -8 });                        // målvaktsdyk
  ram(18, { tF: 0.5, tB: 0.12, kF: 1.3, kB: 1.1, aF: 1.35, aB: 1.6, eF: 0.3, eB: 0.25, lut: -0.06, bob: -12 });                                  // nick (i luften)
  ram(19, { tF: 0.07, tB: -0.07, kF: 0.05, kB: 0.05, aF: 0.95, aB: 0.85, eF: 1.25, eB: 1.35, lut: 0.04 });                                        // målvakten håller bollen
  // bollen: vit med mörka fält (R = "tröja", färgas vit i shadern)
  ctx.save(); ctx.translate(13 * fw, 0); ctx.scale(sk, H / 128);
  ctx.fillStyle = 'rgb(255,0,0)'; ctx.beginPath(); ctx.arc(32, 64, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; for (const [x, y, r] of [[32, 58, 8], [13, 53, 6], [51, 53, 6], [21, 82, 6], [43, 82, 6]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// Strålkastarnas ljusstjärna: mjuk kärna, en lång vågrät strimma och en svag lodrät (additiv, ingen färg – tonas i materialet)
function ritaGloria(ctx, B, H) {
  const cx = B / 2, cy = H / 2;
  const fl = (sx, sy, stopp) => {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, B / 2); stopp.forEach(([p, a]) => g.addColorStop(p, `rgba(255,255,255,${a})`));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, B / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  ctx.globalCompositeOperation = 'lighter';
  fl(1, 1, [[0, 1], [0.05, 0.9], [0.14, 0.32], [0.34, 0.08], [1, 0]]);
  fl(1, 0.035, [[0, 0.75], [0.25, 0.28], [0.7, 0.05], [1, 0]]);
  fl(0.03, 0.55, [[0, 0.45], [0.4, 0.1], [1, 0]]);
}

/* Resultattavlan (2048 × 1024). p = räkneverkets läge (0–1) under påslagningen, kompakt = liten tavla i bild (mobil):
   större text, inga brickor. Allt räknas ur datan – inget hittas på. */
function ritaTavla(ctx, B, H, d, p = 1, kompakt = false) {
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#081626'); bg.addColorStop(0.55, '#050d18'); bg.addColorStop(1, '#03070d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, B, H);
  if (!d) return;
  const M = 64, K = kompakt ? 1.3 : 1;
  const P = klamp(p);
  ctx.textBaseline = 'alphabetic';
  // vänster: ställningen (hela bredden i kompakt läge), höger: brickorna i en kolumn
  const VB = kompakt ? B : 1150;
  const cx = VB / 2;
  const sk = ctx.createRadialGradient(cx, H * 0.55, 0, cx, H * 0.55, VB * 0.55);
  sk.addColorStop(0, 'rgba(40,110,200,.17)'); sk.addColorStop(1, 'rgba(40,110,200,0)'); ctx.fillStyle = sk; ctx.fillRect(0, 0, B, H);
  // topp: U-märket + UPERFORMANCE, månaden till höger med live-prick
  const toppH = kompakt ? 196 : 152;
  ritaU(ctx, M, (toppH - 96 * K) / 2, 96 * K, '#ffffff');
  typ(ctx, 600, 60 * K, 0.13); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
  ctx.fillText('UPERFORMANCE', M + 124 * K, toppH / 2 + 21 * K);
  const manText = d.manNu.lang.toUpperCase();
  typ(ctx, 500, 52 * K, 0.08); ctx.fillStyle = '#a7d2ff'; ctx.textAlign = 'right';
  ctx.fillText(manText, B - M, toppH / 2 + 19 * K);
  const mb = ctx.measureText(manText).width;
  ctx.save(); ctx.shadowColor = 'rgba(126,224,195,.7)'; ctx.shadowBlur = 8; ctx.fillStyle = '#7ee0c3';
  ctx.beginPath(); ctx.arc(B - M - mb - 36 * K, toppH / 2 + 2, 12 * K, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const lin = ctx.createLinearGradient(M, 0, B - M, 0);
  lin.addColorStop(0, 'rgba(167,210,255,0)'); lin.addColorStop(0.2, 'rgba(167,210,255,.42)'); lin.addColorStop(0.8, 'rgba(126,224,195,.42)'); lin.addColorStop(1, 'rgba(126,224,195,0)');
  ctx.fillStyle = lin; ctx.fillRect(M, toppH, B - 2 * M, 3);
  ctx.textAlign = 'center';
  // rubriken över ställningen (inte i kompakt läge – där bär live-pricken och månaden toppen)
  if (!kompakt) { typ(ctx, 600, 46, 0.26); ctx.fillStyle = '#7ee0c3'; ctx.fillText('AFFÄRSLÄGET · LIVE', cx, toppH + 78); }
  // ställningen: VUNNA – FÖRLORADE
  const vx = VB * 0.27, fx = VB * 0.73;
  const etY = kompakt ? toppH + 136 : toppH + 166, sifY = kompakt ? 742 : 700, sifS = kompakt ? 470 : 410;
  for (const [x, text, farg] of [[vx, 'VUNNA', 'rgba(156,240,214,.95)'], [fx, 'FÖRLORADE', 'rgba(220,232,246,.8)']]) {
    passa(ctx, text, VB * 0.42, 600, 58 * K, 0.18); ctx.fillStyle = farg; ctx.fillText(text, x, etY);
  }
  ctx.save();
  // siffrorna ritas utan sken: ett sken i texturen blir en prickig gloria av vita pixlar under LED-mönstret
  const sg = ctx.createLinearGradient(0, sifY - sifS * 0.72, 0, sifY); sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#d4e6ff');
  ctx.fillStyle = sg;
  for (const [x, v] of [[vx, d.vinst.vunna], [fx, d.vinst.forlorade]]) { const t = String(Math.round(v * P)); passa(ctx, t, VB * 0.4, 600, sifS, -0.01); ctx.fillText(t, x, sifY); }
  ctx.restore();
  typ(ctx, 500, sifS * 0.5, 0); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText('–', cx, sifY - sifS * 0.13);
  // perioden: ställningen gäller alla affärer sedan start (brickorna bredvid har 90 dagar och månaden)
  const totY = sifY + (kompakt ? 74 : 62);
  typ(ctx, 600, 40 * K, 0.32); ctx.fillStyle = 'rgba(167,210,255,.78)'; ctx.fillText('TOTALT · ALLA AFFÄRER', cx, totY);
  // vinstgraden: mätare + text
  const grad = d.vinst.grad;
  const bb = VB * 0.74, bx = cx - bb / 2, by = totY + (kompakt ? 36 : 34), bh = 16 * K;
  ctx.fillStyle = 'rgba(255,255,255,.1)'; rundRekt(ctx, bx, by, bb, bh, bh / 2); ctx.fill();
  if (isFinite(grad) && grad > 0) {
    const fg = ctx.createLinearGradient(bx, 0, bx + bb, 0); fg.addColorStop(0, '#2f8fd8'); fg.addColorStop(1, '#7ee0c3');
    ctx.save(); ctx.shadowColor = 'rgba(126,224,195,.6)'; ctx.shadowBlur = 8; ctx.fillStyle = fg;
    rundRekt(ctx, bx, by, Math.max(bh, bb * grad * P), bh, bh / 2); ctx.fill(); ctx.restore();
  }
  const gText = isFinite(grad) ? `${Math.round(grad * 100 * P)} %` : '–';
  typ(ctx, 600, 54 * K, 0.2); const etikett = 'VINSTGRAD'; const eB = ctx.measureText(etikett + '  ').width;
  typ(ctx, 600, 66 * K, 0.02); const gB = ctx.measureText(gText).width;
  const gx = cx - (eB + gB) / 2, gy = by + bh + 86 * K;
  ctx.textAlign = 'left'; typ(ctx, 600, 54 * K, 0.2); ctx.fillStyle = 'rgba(167,210,255,.92)'; ctx.fillText(etikett, gx, gy);
  typ(ctx, 600, 66 * K, 0.02); ctx.fillStyle = '#ffffff'; ctx.fillText(gText, gx + eB, gy + 2);
  if (kompakt) return;
  // brickorna i en kolumn till höger
  const kx0 = VB + 8, kb = B - M - kx0, gap = 20, ty0 = toppH + 30, th = (H - ty0 - 30 - 2 * gap) / 3;
  ctx.fillStyle = 'rgba(167,210,255,.14)'; ctx.fillRect(VB - 16, toppH + 40, 2, H - toppH - 80);
  const bricka = [
    ['SIGNERAT · 90 DAGAR', krKort(d.vunnet.varde * P), affarText(d.vunnet.antal), '#7ee0c3'],
    ['ÖPPEN PIPELINE', krKort(d.pipe * P), affarText(d.oppnaAntal), '#5aa8ff'],
    [`INTÄKT ${d.manNu.namn.toUpperCase()}`, krKort(d.manNu.varde * P), affarText(d.manNu.antal), '#a7d2ff'],
  ];
  bricka.forEach(([et, varde, under, accent], i) => {
    const y = ty0 + i * (th + gap);
    const fg = ctx.createLinearGradient(0, y, 0, y + th); fg.addColorStop(0, 'rgba(255,255,255,.08)'); fg.addColorStop(1, 'rgba(255,255,255,.025)');
    ctx.fillStyle = fg; rundRekt(ctx, kx0, y, kb, th, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(167,210,255,.26)'; ctx.lineWidth = 2; rundRekt(ctx, kx0 + 1, y + 1, kb - 2, th - 2, 25); ctx.stroke();
    ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 6; ctx.fillStyle = accent; rundRekt(ctx, kx0 + 34, y + 30, 8, th - 60, 4); ctx.fill(); ctx.restore();
    ctx.textAlign = 'left';
    passa(ctx, et, kb - 96, 600, 58, 0.06); ctx.fillStyle = 'rgba(167,210,255,.96)'; ctx.fillText(et, kx0 + 66, y + 78);
    passa(ctx, varde, kb - 100, 600, 118, -0.01); ctx.fillStyle = '#ffffff'; ctx.fillText(varde, kx0 + 62, y + th - 42);
    const vb = ctx.measureText(varde).width;
    typ(ctx, 600, 44, 0.02, 'Manrope'); ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(220,232,246,.7)';
    if (ctx.measureText(under).width < kb - 130 - vb) ctx.fillText(under, kx0 + kb - 34, y + th - 46);
  });
}

// Remsan under tavlan: säljstegen och de senaste månadernas intäkter (en loop – ritas om bara när datan ändras)
function remsaPoster(d) {
  const poster = d.steg.map((s) => [s.namn.toUpperCase(), `${krKort(s.varde)} · ${affarText(s.antal)}`]);
  poster.push([`SIGNERAT ${PERIOD.lang.toUpperCase()}`, `${krKort(d.vunnet.varde)} · ${affarText(d.vunnet.antal)}`]);
  d.man.slice(-6).forEach((m) => poster.push([`INTÄKT ${m.namn.toUpperCase()} ${m.ar}`, krKort(m.varde)]));
  return poster;
}
const REMSA_H = 128, REMSA_TEXT = 72;
function remsaBredd(ctx, poster) {
  let b = 0;
  for (const [et, v] of poster) { typ(ctx, 600, REMSA_TEXT * 0.82, 0.12); b += ctx.measureText(et).width + 34; typ(ctx, 600, REMSA_TEXT, 0.01); b += ctx.measureText(v).width + 120; }
  return Math.ceil(b);
}
function ritaRemsa(ctx, B, H, poster) {
  ctx.fillStyle = '#03070d'; ctx.fillRect(0, 0, B, H);
  let x = 0; const y = H / 2 + REMSA_TEXT * 0.36;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const [et, v] of poster) {
    typ(ctx, 600, REMSA_TEXT * 0.82, 0.12); ctx.fillStyle = '#a7d2ff'; ctx.fillText(et, x, y - 2); x += ctx.measureText(et).width + 34;
    typ(ctx, 600, REMSA_TEXT, 0.01); ctx.fillStyle = '#ffffff'; ctx.fillText(v, x, y); x += ctx.measureText(v).width + 60;
    ctx.fillStyle = '#7ee0c3'; ctx.beginPath(); ctx.arc(x, H / 2 + 1, 9, 0, Math.PI * 2); ctx.fill(); x += 60;
  }
}

/* ---- geometri ----------------------------------------------------------------------------------------- */
// Samlar trianglar (position, normal, uv, färg) till EN geometri – vridningen kontrolleras mot normalen
function samlare(THREE) {
  const P = [], N = [], U = [], C = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const lagg = (p, n, t, c) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); U.push(t[0], t[1]); C.push(c[0], c[1], c[2]); };
  const tri = (p0, p1, p2, n0, n1, n2, t0, t1, t2, c) => {
    ab.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); ac.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]); ab.cross(ac);
    const d = ab.x * (n0[0] + n1[0] + n2[0]) + ab.y * (n0[1] + n1[1] + n2[1]) + ab.z * (n0[2] + n1[2] + n2[2]);
    lagg(p0, n0, t0, c);
    if (d < 0) { lagg(p2, n2, t2, c); lagg(p1, n1, t1, c); } else { lagg(p1, n1, t1, c); lagg(p2, n2, t2, c); }
  };
  return {
    tri,
    quad(p0, p1, p2, p3, n0, n1, n2, n3, t0, t1, t2, t3, c) { tri(p0, p1, p2, n0, n1, n2, t0, t1, t2, c); tri(p0, p2, p3, n0, n2, n3, t0, t2, t3, c); },
    get antal() { return P.length / 3; },
    geometri() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.computeBoundingSphere();
      return g;
    },
  };
}

/* Banan runt skålen: punkter på läktarnas framkant (avstånd 0) med utåtriktad normal. Börjar vid närmaste långsidans
   vänstra ände, går runt vänster kortsida, bortre långsidan och höger kortsida och slutar vid närmaste långsidans högra
   ände (där står kameran – ingen läktare). u = sektionsnummer (gångarna står i linje genom alla rader). */
function byggBana(per) {
  const horn = [[-(X0 - R0), Z0 - R0, Math.PI / 2], [-(X0 - R0), -(Z0 - R0), Math.PI], [X0 - R0, -(Z0 - R0), Math.PI * 1.5], [X0 - R0, Z0 - R0, 0]];
  const pts = []; let u = 0;
  horn.forEach(([cx, cz, a0], k) => {
    for (let j = 0; j <= per; j++) {
      const a = a0 + (j / per) * (Math.PI / 2);
      pts.push({ cx, cz, nx: Math.cos(a), nz: Math.sin(a), u: u + (j / per) * HORN_SEK, a });
    }
    u += HORN_SEK;
    if (k < 3) { const len = k === 1 ? 2 * (X0 - R0) : 2 * (Z0 - R0); u += Math.max(1, Math.round(len / SEKTION)); }
  });
  return pts;
}
const vid = (p, d, y) => [p.cx + p.nx * (R0 + d), y, p.cz + p.nz * (R0 + d)];

/* ---- 3D-scenen ---------------------------------------------------------------------------------------- */
let senasteData = null;
let api = null;
let vantande = null;     // koppling som väntar på att bygget blir klart
let forstaVisning = true;

const ADD = (THREE) => ({ blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });

// Gemensamma GLSL-bitar: diset (linjärt med vyavståndet, som scene.fog)
const DIS_VS = 'uniform vec3 uDis; varying float vDis;';
const DIS_BER = 'vDis = clamp( ( -mv.z - uDis.x ) / max( uDis.y - uDis.x, 0.001 ), 0.0, 1.0 ) * uDis.z;';
// Kantutjämning för skyltar med alfa (publiken, spelarna): skärpt täckning för alpha-to-coverage när duken har MSAA
// (uA2C = 1), annars en hård tröskel som förut – och blåvita ränder som filtreras mot pixelstorleken (ingen moaré/gnistring)
const TACK_FS = `
  float tackning( float a, float uA2C ) {
    if ( uA2C < 0.5 ) return step( 0.42, a );
    return clamp( ( a - 0.45 ) / max( fwidth( a ), 1e-4 ) + 0.5, 0.0, 1.0 );
  }
  float rand( float f ) {
    float w = fwidth( f );
    float d = 0.25 - abs( fract( f - 0.25 ) - 0.5 );
    return mix( clamp( d / max( w, 1e-4 ) + 0.5, 0.0, 1.0 ), 0.5, smoothstep( 0.3, 0.7, w ) );
  }`;

async function bygg(s) {
  const { THREE } = s;
  const paus = () => new Promise((r) => setTimeout(r, 0));
  const lag = s.kvalitet === 'lag', mobil = s.kvalitet === 'mobil';
  const mangd = lag ? 0.36 : mobil ? 0.55 : s.integrerad ? 0.72 : 1;   // instansmängder
  const d0 = senasteData;
  const V3 = THREE.Vector3;
  const lin = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
  const arena = new THREE.Group(); arena.name = 'arena'; s.scene.add(arena);
  const tid = { value: STILL_T };
  const malUni = { value: new THREE.Vector2(-100, 0) };
  const natTraff = { value: new THREE.Vector3(99, 0, 0) };    // där bollen gick in i nätet (x, höjd, z) – nätet buktar ut där   // senaste målet (uTid, lag) – publiken, bengalerna, pappersregnet och sargen
  // MSAA i duken → alpha-to-coverage för publiken och spelarna (följs i varje bild – motorn kan stänga av MSAA)
  const harMsaa = () => !!(s.composer && s.composer.renderTarget1 && s.composer.renderTarget1.samples > 0);
  const a2c = { value: harMsaa() ? 1 : 0 };
  const dis = { value: new V3(40, 160, 1) }, disFarg = { value: new THREE.Color(DIS_FARG) };
  const anisotropi = s.renderer.capabilities.getMaxAnisotropy();
  const canvas = (b, h, fn, { srgb = true, premult = false } = {}) => {
    const c = document.createElement('canvas'); c.width = b; c.height = h; fn(c.getContext('2d'), b, h);
    const t = s.stada(new THREE.CanvasTexture(c));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = premult; t.anisotropy = anisotropi;
    return t;
  };

  /* ljus: "månljus/strålkastare" snett bakifrån vänster (statisk skugga från taket och läktarna), fyll från kamerans sida */
  if (s.ljus) {
    const L = s.ljus;
    L.nyckel.color.set(0xeef3ff); L.nyckel.intensity = 2.0; L.nyckel.position.set(-12, 15.5, -16);
    L.nyckel.shadow.intensity = 0.62; L.nyckel.shadow.bias = -0.0004; L.nyckel.shadow.normalBias = 0.02;
    L.fyll.color.set(0xd6e4ff); L.fyll.intensity = 1.35; L.fyll.position.set(2, 12, 17);
    L.kant.color.set(0xa9dcff); L.kant.intensity = 0.6; L.kant.position.set(11, 8, -12);
    L.himmel.color.set(0x8fb0d8); L.himmel.groundColor.set(0x1d3a26); L.himmel.intensity = 0.6;
  }
  s.skuggor.omfang(12, 70);
  // Mjukvaru-WebGL (lag): inga skuggor och Lambert i stället för fysikaliska material – shaders kompileras utan
  // KHR_parallel_shader_compile där, så färre och enklare program ger första bilden betydligt tidigare.
  if (lag) { s.renderer.shadowMap.enabled = false; if (s.ljus) s.ljus.nyckel.castShadow = false; }
  const metall = (o, miljoStyrka) => {
    if (lag) { const l = { color: o.color ?? 0xffffff }; if (o.vertexColors) l.vertexColors = true; return s.stada(new THREE.MeshLambertMaterial(l)); }
    const m = s.stada(new THREE.MeshStandardMaterial(o));
    return miljoStyrka != null ? s.miljo(m, miljoStyrka) : m;
  };
  s.scene.fog = new THREE.Fog(DIS_FARG, 40, 160);

  /* ---- etapp 1: marken, planen, målen, sargen ---- */
  const mark = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(30, 24)), s.stada(new THREE.MeshLambertMaterial({ color: 0x0b1117 })));
  mark.rotation.x = -Math.PI / 2; mark.position.y = -0.004; mark.receiveShadow = true;
  const grasTex = canvas(2048, Math.round((2048 * GB) / GL), ritaGras);
  const gras = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(2 * GL, 2 * GB)), s.stada(new THREE.MeshLambertMaterial({ map: grasTex })));
  gras.rotation.x = -Math.PI / 2; gras.receiveShadow = true; gras.name = 'planen';
  arena.add(mark, gras);

  // målen: vita stolpar och ribba (sammanslagna) + nät
  {
    const ram = samlare(THREE), nat = samlare(THREE);
    const vit = lin(0xffffff), gra = lin(0xb8c0c8);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sk = new V3(1, 1, 1);
    const ror = (a, b, r, farg) => {
      const A = new V3(...a), Bv = new V3(...b); const l = A.distanceTo(Bv);
      const g = new THREE.CylinderGeometry(r, r, l, 10, 1, true);
      q.setFromUnitVectors(new V3(0, 1, 0), Bv.clone().sub(A).normalize());
      m4.compose(A.clone().add(Bv).multiplyScalar(0.5), q, sk);
      leggTill(THREE, ram, g, m4, farg);
    };
    const MH = 0.244, MB = 0.366, MD = 0.2;
    for (const sx of [-1, 1]) {
      const x = sx * PL, xb = sx * (PL + MD);
      ror([x, 0, -MB], [x, MH + 0.006, -MB], 0.0075, vit); ror([x, 0, MB], [x, MH + 0.006, MB], 0.0075, vit);
      ror([x, MH, -MB - 0.006], [x, MH, MB + 0.006], 0.0075, vit);
      ror([xb, 0, -MB], [xb, MH * 0.8, -MB], 0.003, gra); ror([xb, 0, MB], [xb, MH * 0.8, MB], 0.003, gra);
      ror([x, MH, -MB], [xb, MH * 0.8, -MB], 0.003, gra); ror([x, MH, MB], [xb, MH * 0.8, MB], 0.003, gra);
      // nätet: tak, baksida, sidor (uv i meter → maskor på 12 cm)
      const n = [0, 1, 0], M = 1 / 0.012;
      nat.quad([x, MH, -MB], [xb, MH * 0.8, -MB], [xb, MH * 0.8, MB], [x, MH, MB], n, n, n, n, [0, 0], [MD * M, 0], [MD * M, 2 * MB * M], [0, 2 * MB * M], vit);
      const nb = [sx, 0, 0];
      // baksidan som ett rutnät (12 × 6) – den buktar ut där bollen träffar (natTraff i shadern)
      const NZ = 12, NYn = 6, HB = MH * 0.8;
      for (let a = 0; a < NZ; a++) for (let b = 0; b < NYn; b++) {
        const z0 = -MB + (2 * MB * a) / NZ, z1 = -MB + (2 * MB * (a + 1)) / NZ, y0 = (HB * b) / NYn, y1 = (HB * (b + 1)) / NYn;
        nat.quad([xb, y0, z0], [xb, y0, z1], [xb, y1, z1], [xb, y1, z0], nb, nb, nb, nb, [(z0 + MB) * M, y0 * M], [(z1 + MB) * M, y0 * M], [(z1 + MB) * M, y1 * M], [(z0 + MB) * M, y1 * M], vit);
      }
      for (const sz of [-1, 1]) {
        const z = sz * MB, ns = [0, 0, sz];
        nat.quad([x, 0, z], [xb, 0, z], [xb, MH * 0.8, z], [x, MH, z], ns, ns, ns, ns, [0, 0], [MD * M, 0], [MD * M, MH * 0.8 * M], [0, MH * M], vit);
      }
    }
    const ramMesh = new THREE.Mesh(s.stada(ram.geometri()), metall({ color: 0xffffff, roughness: 0.32, metalness: 0.1 }));
    ramMesh.castShadow = true;
    const natTex = canvas(64, 64, ritaNat, { srgb: true });
    natTex.wrapS = natTex.wrapT = THREE.RepeatWrapping;
    // nätet: baksidan buktar ut där bollen gick in och dallrar en stund efter målet
    const natMesh = new THREE.Mesh(s.stada(nat.geometri()), s.stada(new THREE.ShaderMaterial({
      uniforms: { uKarta: { value: natTex }, uTid: tid, uMal: malUni, uTraff: natTraff, uDis: dis, uDisFarg: disFarg },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `uniform float uTid; uniform vec2 uMal; uniform vec3 uTraff; ${DIS_VS} varying vec2 vUv;
        void main() {
          vec3 p = position; float s = uTid - uMal.x;
          float amp = step( 0.0, s ) * exp( -s * 1.7 ) * ( 0.62 + 0.38 * cos( s * 15.0 ) ) * 0.055;
          vec2 d = vec2( p.z - uTraff.z, p.y - uTraff.y );
          float w = exp( -dot( d, d ) / 0.016 ) * step( 0.0, p.x * uTraff.x ) * step( ${(PL + 0.1).toFixed(3)}, abs( p.x ) );
          p.x += sign( uTraff.x ) * amp * w;
          vUv = uv; vec4 mv = modelViewMatrix * vec4( p, 1.0 ); ${DIS_BER} gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uKarta; uniform vec3 uDisFarg; varying vec2 vUv; varying float vDis;
        void main() { vec4 c = texture2D( uKarta, vUv ) * vec4( 0.874, 0.91, 0.949, 0.8 ); if ( c.a < 0.01 ) discard; gl_FragColor = vec4( mix( c.rgb, uDisFarg, vDis ), c.a ); }`,
    })));
    arena.add(ramMesh, natMesh);
  }

  // LED-skyltarna (sargen): framsidan mot planen rullar (UV-förskjutning i shadern), baksidan är mörk
  const sargTex = s.canvasTextur(2048, 64, ritaSarg);
  const malSargTex = s.canvasTextur(2048, 64, ritaMalSarg); malSargTex.wrapS = THREE.RepeatWrapping;
  sargTex.wrapS = THREE.RepeatWrapping;
  {
    const SH_ = 0.085, SARG_L = (SH_ * 2048) / 64; // en texturlängd i världen (ingen utdragen text)
    const g = samlare(THREE); let u = 0;
    const seg = [
      [-(PL + 0.26), -(PB + 0.42), PL + 0.26, -(PB + 0.42)], [PL + 0.5, -(PB + 0.16), PL + 0.5, PB + 0.16],
      [PL + 0.26, PB + 0.42, -(PL + 0.26), PB + 0.42], [-(PL + 0.5), PB + 0.16, -(PL + 0.5), -(PB + 0.16)],
    ];
    for (const [x0, z0, x1, z1] of seg) {
      const l = Math.hypot(x1 - x0, z1 - z0); let nx = z1 - z0, nz = -(x1 - x0); const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      if (nx * -(x0 + x1) + nz * -(z0 + z1) < 0) { nx = -nx; nz = -nz; } // mot planens mitt
      const n = [nx, 0, nz]; const u1 = u + l / SARG_L;
      g.quad([x0, 0, z0], [x1, 0, z1], [x1, SH_, z1], [x0, SH_, z0], n, n, n, n, [u, 0], [u1, 0], [u1, 1], [u, 1], [1, 1, 1]);
      u = u1;
    }
    const mat = s.stada(new THREE.ShaderMaterial({
      uniforms: { uKarta: { value: sargTex }, uMalKarta: { value: malSargTex }, uTid: tid, uMal: malUni, uDis: dis, uDisFarg: disFarg },
      side: THREE.DoubleSide,
      vertexShader: `${DIS_VS} varying vec2 vUv; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); ${DIS_BER} gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uKarta, uMalKarta; uniform float uTid; uniform vec2 uMal; uniform vec3 uDisFarg; varying vec2 vUv; varying float vDis;
        void main() {
          vec3 c = gl_FrontFacing ? texture2D( uKarta, vec2( vUv.x + uTid * 0.055, vUv.y ) ).rgb * 1.35 : vec3( 0.018, 0.022, 0.028 );
          float sedan = uTid - uMal.x; float mal = smoothstep( 0.0, 0.2, sedan ) * ( 1.0 - smoothstep( 5.6, 6.6, sedan ) );
          float ifk = mal * ( 1.0 - uMal.y );
          if ( gl_FrontFacing ) c = mix( c, texture2D( uMalKarta, vec2( vUv.x - uTid * 0.22, vUv.y ) ).rgb * ( 1.45 + 0.4 * step( 0.5, fract( uTid * 2.4 ) ) ), ifk );
          gl_FragColor = vec4( mix( c, uDisFarg, vDis ), 1.0 );
        }`,
    }));
    const sarg = new THREE.Mesh(s.stada(g.geometri()), mat); sarg.name = 'sarg';
    arena.add(sarg);
  }
  await paus(); if (s.forstord) return null;

  /* ---- etapp 2: läktarskålen (trappsteg, fasadlist, tak) – tre sammanslagna geometrier ---- */
  const per = lag ? 7 : 12;
  const bana = byggBana(per);
  const stand = samlare(THREE), str = samlare(THREE), glod = samlare(THREE);
  const FARGER = {
    vagg: lin('#18202a'), gang: lin('#3a414a'), fasad: lin('#0e151e'), kant: lin('#4a525c'), bakvagg: lin('#0b1118'), topp: lin('#1b2129'), ytter: lin('#151b23'),
    takfram: lin('#20272f'), taktopp: lin('#2a313a'), takbak: lin('#161c24'), takunder: lin('#0d1218'), stolpe: lin('#2b323b'),
  };
  const prof = [[0, 0, 0, NED_Y, 'vagg']];
  for (let k = 0; k < NED_N; k++) { const y = NED_Y + k * NED_H, d = k * DEP; prof.push([d, y, d + DEP, y, 'steg'], [d + DEP, y, d + DEP, y + NED_H, 'sate']); }
  prof.push([D_NED, Y_NED, D_FASAD, Y_NED, 'gang'], [D_FASAD, Y_NED, D_FASAD, Y_FASAD, 'fasad'], [D_FASAD, Y_FASAD, D_UPP, Y_FASAD, 'kant']);
  for (let k = 0; k < UPP_N; k++) { const d = D_UPP + k * DEP, y = Y_FASAD + k * UPP_H; prof.push([d, y, d, y + UPP_H, 'sate'], [d, y + UPP_H, d + DEP, y + UPP_H, 'steg']); }
  prof.push([D_BAK, Y_UPP, D_BAK, Y_TAKUNDER, 'bakvagg'], [D_BAK, Y_TAKUNDER, D_YTTER, Y_TAKUNDER, 'topp'], [D_YTTER, Y_TAKUNDER, D_YTTER, 0, 'ytter']);
  const takProf = [
    [D_TAKFRAM, Y_TAKUNDER - 0.01, D_TAKFRAM, Y_TAK, 'takfram'], [D_TAKFRAM, Y_TAK, D_TAKBAK, Y_TAK - 0.05, 'taktopp'],
    [D_TAKBAK, Y_TAK - 0.05, D_TAKBAK, Y_TAKUNDER - 0.01, 'takbak'], [D_TAKBAK, Y_TAKUNDER - 0.01, D_TAKFRAM, Y_TAKUNDER - 0.01, 'takunder'],
  ];
  const strimla = (lista) => {
    for (const [dA, yA, dB, yB, del] of lista) {
      const ex = -(yB - yA), ey = dB - dA, l = Math.hypot(ex, ey) || 1; const n2x = ex / l, n2y = ey / l;
      const s_ = del === 'steg' || del === 'sate' ? stand : str;
      const [v0, v1] = del === 'steg' ? [0.03, 0.47] : del === 'sate' ? [0.53, 0.97] : [0, 1];
      const farg = FARGER[del] || [1, 1, 1];
      for (let i = 0; i < bana.length - 1; i++) {
        const a = bana[i], b = bana[i + 1];
        const nA = [a.nx * n2x, n2y, a.nz * n2x], nB = [b.nx * n2x, n2y, b.nz * n2x];
        s_.quad(vid(a, dA, yA), vid(b, dA, yA), vid(b, dB, yB), vid(a, dB, yB), nA, nB, nB, nA, [a.u, v0], [b.u, v0], [b.u, v1], [a.u, v1], farg);
      }
    }
  };
  strimla(prof); strimla(takProf);
  // ändarna mot den öppna långsidan: tvärsnittet stängs (trianguleras)
  const kapa = (lista, farg) => {
    const kontur = [new THREE.Vector2(lista[0][0], lista[0][1]), ...lista.map((x) => new THREE.Vector2(x[2], x[3]))];
    if (kontur[0].distanceTo(kontur[kontur.length - 1]) < 1e-6) kontur.pop();
    const tri = THREE.ShapeUtils.triangulateShape(kontur, []);
    for (const [p, tecken] of [[bana[0], -1], [bana[bana.length - 1], 1]]) {
      const n = [-Math.sin(p.a) * tecken, 0, Math.cos(p.a) * tecken];
      for (const [i, j, k] of tri) {
        const A = kontur[i], B_ = kontur[j], C = kontur[k];
        str.tri(vid(p, A.x, A.y), vid(p, B_.x, B_.y), vid(p, C.x, C.y), n, n, n, [0, 0], [0, 0], [0, 0], farg);
      }
    }
  };
  kapa(prof, lin('#121921')); kapa(takProf, FARGER.takbak);
  // ljuslister: fasadlisten mellan ringarna och takets framkant (HDR – fångas av glöden)
  const band = (d, y0, y1, farg) => {
    for (let i = 0; i < bana.length - 1; i++) {
      const a = bana[i], b = bana[i + 1];
      const nA = [-a.nx, 0, -a.nz], nB = [-b.nx, 0, -b.nz];
      glod.quad(vid(a, d, y0), vid(b, d, y0), vid(b, d, y1), vid(a, d, y1), nA, nB, nB, nA, [0, 0], [1, 0], [1, 1], [0, 1], farg);
    }
  };
  band(D_FASAD - 0.004, Y_FASAD - 0.032, Y_FASAD - 0.022, lin('#5d9dff', 1.0));   // tunn blå list ovanför LED-bandet (under glödtröskeln: tunna linjer flimrar i glöden)
  band(D_TAKFRAM - 0.004, Y_TAKUNDER - 0.004, Y_TAKUNDER + 0.018, lin('#dcecff', 1.15));
  band(D_TAKFRAM - 0.004, Y_TAK - 0.022, Y_TAK - 0.012, lin('#7ee0c3', 1.0));

  // Går längs banan på djupet d och anropar fn(x, z, nx, nz, tx, tz) var steg:e enhet (n = utåt, t = banans riktning)
  const langsBanan = (d, steg, fn) => {
    let rest = steg / 2;
    for (let i = 0; i < bana.length - 1; i++) {
      const a = bana[i], b = bana[i + 1]; const A = vid(a, d, 0), B_ = vid(b, d, 0);
      const len = Math.hypot(B_[0] - A[0], B_[2] - A[2]); if (len < 1e-6) continue;
      const tx = (B_[0] - A[0]) / len, tz = (B_[2] - A[2]) / len;
      while (rest < len) {
        const f = rest / len; const nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f, nl = Math.hypot(nx, nz) || 1;
        fn(A[0] + (B_[0] - A[0]) * f, A[2] + (B_[2] - A[2]) * f, nx / nl, nz / nl, tx, tz);
        rest += steg;
      }
      rest -= len;
    }
  };
  // En tunn stav (quad) från P till Q i planet med normalen n
  const _sa = new V3(), _sb = new V3(), _sn = new V3(), _sp = new V3();
  const stav = (sam, P, Q, n, bredd, farg) => {
    _sa.set(...P); _sb.set(...Q); _sn.set(...n); _sp.subVectors(_sb, _sa).cross(_sn).normalize().multiplyScalar(bredd / 2);
    sam.quad([_sa.x - _sp.x, _sa.y - _sp.y, _sa.z - _sp.z], [_sa.x + _sp.x, _sa.y + _sp.y, _sa.z + _sp.z], [_sb.x + _sp.x, _sb.y + _sp.y, _sb.z + _sp.z], [_sb.x - _sp.x, _sb.y - _sp.y, _sb.z - _sp.z], n, n, n, n, [0, 0], [1, 0], [1, 1], [0, 1], farg);
  };

  // Takets fackverk under framkanten (underramen + diagonaler och hängare) och plåtfalsar på taket – detaljer som syns
  // mot den övre läktaren och i takets ovansida. Allt i stommens sammanslagna geometri.
  {
    const farg = FARGER.stolpe, falsFarg = lin('#3a434e');
    const dF = D_TAKFRAM + 0.025, yO = Y_TAKUNDER - 0.012, yU = Y_TAKUNDER - 0.15;
    let forra = null; let k = 0;
    langsBanan(dF, 0.17, (x, z, nx, nz) => {
      const n = [-nx, 0, -nz]; const P = [x, yO, z], Q = [x, yU, z];
      if (forra) stav(str, k % 2 ? forra.O : forra.U, k % 2 ? Q : P, n, 0.011, farg);
      if (k % 3 === 0) stav(str, P, Q, n, 0.01, farg);
      if (forra) stav(str, forra.U, Q, n, 0.016, farg);                      // underramen
      forra = { O: P, U: Q }; k++;
    });
    const yTak = (d) => Y_TAK - 0.05 * ((d - D_TAKFRAM) / (D_TAKBAK - D_TAKFRAM)) + 0.003;
    langsBanan(D_TAKFRAM, 0.21, (x, z, nx, nz) => {
      const d0 = 0.04, d1 = D_TAKBAK - D_TAKFRAM - 0.04;
      stav(str, [x + nx * d0, yTak(D_TAKFRAM + d0), z + nz * d0], [x + nx * d1, yTak(D_TAKFRAM + d1), z + nz * d1], [0, 1, 0], 0.012, falsFarg);
    });
  }

  // strålkastarna i takets framkant: hus i stommen och en matris av lamphuvuden (egen mesh – de tänds en och en i intron)
  const lampor = [];
  const lampHuvud = samlare(THREE);
  {
    const m4 = new THREE.Matrix4(), o = new THREE.Object3D(), hr = slump(5);
    const pos = (x, z, sikte) => {
      o.position.set(x, Y_TAKUNDER - 0.075, z); o.lookAt(sikte); o.updateMatrix(); m4.copy(o.matrix);
      leggTill(THREE, str, new THREE.BoxGeometry(0.47, 0.13, 0.08), m4, lin('#262d36'));
      const i = lampor.length;
      for (let r_ = 0; r_ < 2; r_++) for (let c = 0; c < 7; c++) {
        const fram = new THREE.Matrix4().makeTranslation((c - 3) * 0.062, (r_ - 0.5) * 0.054, 0.0415); fram.premultiply(m4);
        leggTill(THREE, lampHuvud, new THREE.PlaneGeometry(0.052, 0.044), fram, [i / 16, hr(), 0]);
      }
      lampor.push({ pos: o.position.clone(), sikte: sikte.clone() });
    };
    const zf = -(Z0 + D_TAKFRAM - 0.07), xe = X0 + D_TAKFRAM - 0.07;
    for (const x of [-4.7, -3.0, 3.0, 4.7]) pos(x, zf, new V3(x * 0.55, 0, -0.4));
    for (const sx of [-1, 1]) for (const z of [-1.55, 1.55]) pos(sx * xe, z, new V3(sx * 2.6, 0, z * 0.5));
  }
  // Intron: bankerna tänds en i taget med ett kort flimmer (uIntro = sekunder sedan start; 99 i stillbilden)
  const introUni = { value: s.lugn ? 99 : 0 };
  const LAMPA_START = (i) => 0.3 + i * 0.12;
  const lampMesh = new THREE.Mesh(s.stada(lampHuvud.geometri()), s.stada(new THREE.ShaderMaterial({
    uniforms: { uIntro: introUni, uTid: tid },
    vertexShader: 'attribute vec3 color; varying vec3 vC; void main() { vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform float uIntro, uTid; varying vec3 vC;
      void main() {
        float i = floor( vC.r * 16.0 + 0.5 );
        float p = clamp( ( uIntro - ( 0.3 + i * 0.12 ) ) / 0.32, 0.0, 1.0 );
        float flimmer = step( 0.42, fract( sin( floor( uIntro * 38.0 ) * 12.9898 + vC.g * 78.233 ) * 43758.5453 ) );
        float pa = p >= 1.0 ? 1.0 : p * mix( flimmer, 1.0, p * p );
        float anda = 0.94 + 0.06 * sin( uTid * 0.85 );
        gl_FragColor = vec4( vec3( 1.0, 0.97, 0.92 ) * ( 0.05 + 3.4 * pa * anda * ( 0.9 + 0.1 * vC.g ) ), 1.0 );
      }`,
  })));
  lampMesh.name = 'lamphuvuden';
  arena.add(lampMesh);

  // LED-bandet på fasaden mellan ringarna: samma skylt som sargen, rullar åt andra hållet
  {
    const d = D_FASAD - 0.006, y0 = Y_FASAD - 0.112, y1 = Y_FASAD - 0.038, L = (y1 - y0) * (2048 / 64);
    const g = samlare(THREE); let u = 0;
    for (let i = 0; i < bana.length - 1; i++) {
      const a = bana[i], b = bana[i + 1]; const A = vid(a, d, y0), B_ = vid(b, d, y0);
      const u1 = u + Math.hypot(B_[0] - A[0], B_[2] - A[2]) / L;
      const nA = [-a.nx, 0, -a.nz], nB = [-b.nx, 0, -b.nz];
      g.quad(A, B_, vid(b, d, y1), vid(a, d, y1), nA, nB, nB, nA, [u, 0], [u1, 0], [u1, 1], [u, 1], [1, 1, 1]);
      u = u1;
    }
    const mat = s.stada(new THREE.ShaderMaterial({
      uniforms: { uKarta: { value: sargTex }, uTid: tid, uDis: dis, uDisFarg: disFarg, uIntro: introUni },
      vertexShader: `${DIS_VS} varying vec2 vUv; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); ${DIS_BER} gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uKarta; uniform float uTid, uIntro; uniform vec3 uDisFarg; varying vec2 vUv; varying float vDis;
        void main() {
          float pa = clamp( ( uIntro - 1.4 ) / 0.6, 0.0, 1.0 );
          vec3 c = texture2D( uKarta, vec2( vUv.x - uTid * 0.04, vUv.y ) ).rgb * 1.45 * pa + vec3( 0.01, 0.014, 0.02 );
          gl_FragColor = vec4( mix( c, uDisFarg, vDis ), 1.0 );
        }`,
    }));
    const m = new THREE.Mesh(s.stada(g.geometri()), mat); m.name = 'fasadband';
    arena.add(m);
  }

  // Loger med varmt ljus i fasaden (under LED-bandet) – några släckta, några kallare
  {
    const g = samlare(THREE); const lr = slump(41);
    const d = D_FASAD - 0.005, y0 = Y_NED + 0.1, y1 = Y_NED + 0.2, hb = 0.05;
    langsBanan(d, 0.135, (x, z, nx, nz, tx, tz) => {
      const n = [-nx, 0, -nz]; const v = lr();
      const farg = v < 0.28 ? lin('#141d27') : v < 0.42 ? lin('#cfdcf0', 0.34 + lr() * 0.12) : lin('#ffcf8f', 0.28 + lr() * 0.26);
      g.quad([x - tx * hb, y0, z - tz * hb], [x + tx * hb, y0, z + tz * hb], [x + tx * hb, y1, z + tz * hb], [x - tx * hb, y1, z - tz * hb], n, n, n, n, [0, 0], [1, 0], [1, 1], [0, 1], farg);
    });
    const m = new THREE.Mesh(s.stada(g.geometri()), s.stada(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true })));
    m.name = 'loger';
    arena.add(m);
  }
  const standTex = canvas(512, 256, ritaSaten);
  standTex.wrapS = THREE.RepeatWrapping;
  const standMesh = new THREE.Mesh(s.stada(stand.geometri()), s.stada(new THREE.MeshLambertMaterial({ map: standTex })));
  const strMesh = new THREE.Mesh(s.stada(str.geometri()), metall({ vertexColors: true, roughness: 0.5, metalness: 0.45, roughnessMap: s.textur.borstad }, 0.6));
  const glodMesh = new THREE.Mesh(s.stada(glod.geometri()), s.stada(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  standMesh.castShadow = standMesh.receiveShadow = true; strMesh.castShadow = strMesh.receiveShadow = true;
  standMesh.name = 'laktare'; strMesh.name = 'stomme'; glodMesh.name = 'ljuslister';
  arena.add(standMesh, strMesh, glodMesh);
  await paus(); if (s.forstord) return null;

  /* ---- etapp 3: ljuskäglor, glorior, himlens sken ---- */
  const ljusUni = { uTid: tid, uStyrka: { value: 1 } };
  // ljuskäglorna och pappersregnet byggs inte i mjukvaru-WebGL (lag): färre shaders att kompilera, mindre överritning
  if (!lag) {
    const g = samlare(THREE); const kon = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sk = new V3(1, 1, 1);
    lampor.forEach((l, i) => {
      const fran = l.pos.clone(), till = l.sikte.clone();
      const len = fran.distanceTo(till) * 0.98;
      const geo = new THREE.CylinderGeometry(0.12, 1.7, len, 22, 1, true);
      q.setFromUnitVectors(new V3(0, 1, 0), fran.clone().sub(till).normalize());
      m4.compose(fran.clone().add(till).multiplyScalar(0.5), q, sk);
      const fore = g.antal; leggTill(THREE, g, geo, m4, [i / 16, 0, 0]); kon.push([fore, g.antal]);
    });
    const mat = s.stada(new THREE.ShaderMaterial({
      uniforms: { ...ljusUni, uIntro: introUni }, transparent: true, depthWrite: false, ...ADD(THREE),
      vertexShader: `attribute vec3 color; varying float vV; varying vec3 vN; varying vec3 vVy; varying float vKon;
        void main() { vV = uv.y; vKon = color.r * 16.0; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vVy = normalize( -mv.xyz ); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTid; uniform float uStyrka; uniform float uIntro; varying float vV; varying vec3 vN; varying vec3 vVy; varying float vKon;
        void main() {
          float kant = clamp( abs( dot( normalize( vN ), normalize( vVy ) ) ), 0.0, 1.0 ); kant *= kant * sqrt( kant );
          float v = clamp( vV, 0.0, 1.0 );
          float langs = ( 0.22 + 0.78 * v * sqrt( v ) ) * smoothstep( 0.0, 0.22, v );   // mjuk mot planen – ingen hård kant
          float pa = clamp( ( uIntro - ( 0.3 + floor( vKon + 0.5 ) * 0.12 ) - 0.15 ) / 0.5, 0.0, 1.0 );
          float a = uStyrka * pa * langs * kant * ( 0.86 + 0.14 * sin( uTid * 0.8 + vKon * 1.06 ) );
          gl_FragColor = vec4( vec3( 0.66, 0.78, 0.95 ) * a * 0.24, 1.0 );
        }`,
    }));
    const geo = s.stada(g.geometri());
    const koner = new THREE.Mesh(geo, mat); koner.name = 'ljuskaglor'; koner.renderOrder = 2; koner.frustumCulled = false;
    arena.add(koner);
  }
  // ljusstjärnor vid strålkastarna (kärna + vågrät strimma) – ett material per bank, så att de tänds i samma ordning
  // som lamphuvudena och andas i takt
  const gloriaTex = canvas(256, 256, ritaGloria, { srgb: false });
  const glorior = lampor.map((l, i) => {
    const mat = s.stada(new THREE.SpriteMaterial({ map: gloriaTex, color: new THREE.Color(0), transparent: true, depthWrite: false, toneMapped: false, ...ADD(THREE) }));
    const sp = new THREE.Sprite(mat); sp.scale.set(1.5, 1.5, 1);
    sp.position.copy(l.pos).addScaledVector(l.sikte.clone().sub(l.pos).normalize(), 0.09);
    sp.renderOrder = 3; arena.add(sp);
    return { mat, start: LAMPA_START(i) };
  });
  // himlens sken över arenan (ljus som sprids i diset) – bakom bortre läktaren
  const domMat = s.stada(new THREE.MeshBasicMaterial({ map: s.textur.rund, color: new THREE.Color(0.035, 0.06, 0.1), transparent: true, depthWrite: false, toneMapped: false, fog: false, ...ADD(THREE) }));
  const dom = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(46, 9)), domMat);
  dom.position.set(0, 1.9, -14); dom.renderOrder = -1; arena.add(dom);
  await paus(); if (s.forstord) return null;

  /* ---- etapp 4: resultattavlan ---- */
  let data = d0;
  let kompakt = false, raknaP = s.lugn ? 1 : 0;
  const tavlaTex = s.canvasTextur(2048, 1024, (ctx, b, h) => ritaTavla(ctx, b, h, data, raknaP, kompakt));
  const tavlaUni = { uKarta: { value: tavlaTex }, uTid: tid, uPa: { value: s.lugn ? 1 : 0 }, uLjus: { value: 1.1 }, uCeller: { value: new THREE.Vector2(170, 85) }, uHover: { value: 0 } };
  const LED_FS = `
    float diod( vec2 g ) {
      vec2 f = fract( g ) - 0.5;
      float prick = 1.0 - smoothstep( 0.28, 0.5, length( f ) );
      float aa = clamp( 1.7 - 1.3 * max( fwidth( g.x ), fwidth( g.y ) ), 0.0, 1.0 ); // diodmönstret tonas bort innan det blir moaré
      return mix( 1.0, 0.66 + 0.46 * prick, 0.55 * aa );
    }`;
  const skarmMat = s.stada(new THREE.ShaderMaterial({
    uniforms: tavlaUni,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform sampler2D uKarta; uniform float uTid, uPa, uLjus, uHover; uniform vec2 uCeller; varying vec2 vUv;
      ${LED_FS}
      void main() {
        vec3 c = texture2D( uKarta, vUv ).rgb;
        vec2 g = vUv * uCeller;
        float led = diod( g );
        float sk = ( fract( vUv.y + uTid * 0.07 ) - 0.5 ) * 7.0; float skan = 1.0 + 0.06 * exp( -sk * sk );
        float kant = uPa * 1.3 - 0.15;                         // påslagningen sveper från vänster till höger
        float pa = 1.0 - smoothstep( kant - 0.07, kant + 0.01, vUv.x );
        float fx = ( vUv.x - kant ) * 26.0; float front = exp( -fx * fx ) * ( 1.0 - step( 0.999, uPa ) );
        vec3 col = c * uLjus * ( 1.0 + 0.14 * uHover ) * led * skan * pa;
        col += vec3( 0.012, 0.02, 0.03 ) * ( 1.0 - pa );        // släckt: svagt synliga dioder
        col += vec3( 0.45, 1.5, 1.25 ) * front * 1.4;
        gl_FragColor = vec4( col, 1.0 );
      }`,
  }));
  // remsan: en egen textur som loopar (bredden efter innehållet)
  let remsaTex = null, remsaNyckel = '';
  const remsaUni = { uKarta: { value: null }, uTid: tid, uPa: tavlaUni.uPa, uLjus: { value: 1.08 }, uFonster: { value: 0.5 }, uCeller: { value: new THREE.Vector2(170, 8.5) } };
  const remsaMat = s.stada(new THREE.ShaderMaterial({
    uniforms: remsaUni,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform sampler2D uKarta; uniform float uTid, uPa, uLjus, uFonster; uniform vec2 uCeller; varying vec2 vUv;
      ${LED_FS}
      void main() {
        vec3 c = texture2D( uKarta, vec2( vUv.x * uFonster + uTid * 0.022, vUv.y ) ).rgb;
        float pa = smoothstep( 0.55, 0.9, uPa );
        gl_FragColor = vec4( c * uLjus * diod( vUv * uCeller ) * pa, 1.0 );
      }`,
  }));
  const byggRemsa = (d) => {
    if (!d) return;
    const poster = remsaPoster(d); const nyckel = JSON.stringify(poster);
    if (nyckel === remsaNyckel && remsaTex) return;
    remsaNyckel = nyckel;
    const matt = document.createElement('canvas').getContext('2d');
    const b = Math.min(s.renderer.capabilities.maxTextureSize, 16384, Math.max(512, remsaBredd(matt, poster)));
    const ny = s.canvasTextur(b, REMSA_H, (ctx, bb, hh) => ritaRemsa(ctx, bb, hh, poster));
    ny.wrapS = THREE.RepeatWrapping; ny.generateMipmaps = true; ny.needsUpdate = true;
    if (remsaTex) remsaTex.dispose();
    remsaTex = ny; remsaUni.uKarta.value = ny;
    remsaUni.uFonster.value = ((RSB / RSH) * REMSA_H) / b;
  };
  byggRemsa(data);
  // typsnitten kan ladda efter bygget: remsans bredd mäts då om
  if (document.fonts && document.fonts.load) document.fonts.load('600 62px Poppins').then(() => { if (!s.forstord) { remsaNyckel = ''; byggRemsa(data); s.rita(); } }, () => {});

  const tavla = new THREE.Group(); tavla.name = 'resultattavla';
  tavla.position.set(0, T_Y0, T_Z); tavla.rotation.x = T_LUT;
  // ramen: matt borstad metall – blanka hörn speglade strålkastarringen i miljön som en kantig glödfläck
  const ramMat = lag ? metall({ color: 0x1b222b }) : s.miljo(s.mat('morkMetall', { color: 0x1b222b, roughness: 0.52, metalness: 0.8 }), 0.55);
  const ramRemsa = new THREE.Mesh(s.rundadLada(RB, RH, TD, 0.05, 4), ramMat); ramRemsa.position.y = RH / 2;
  const remsaSkarm = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(RSB, RSH)), remsaMat); remsaSkarm.position.set(0, RH / 2, TD / 2 + 0.003);
  const yT = RH + T_GAP + TH / 2;
  const ram = new THREE.Mesh(s.rundadLada(TB, TH, TD, 0.08, 5), ramMat); ram.position.y = yT;
  const skarm = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(SB, SH)), skarmMat); skarm.position.set(0, yT, TD / 2 + 0.003);
  // ljuslist runt ramens framkant (HDR) – en tunn kontur som fångas av glöden
  const listMat = s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe0ff).multiplyScalar(1.0), toneMapped: false }));
  const lister = samlare(THREE);
  {
    const m4 = new THREE.Matrix4(); const z = TD / 2 + 0.004;
    for (const y of [yT + TH / 2 - 0.035, yT - TH / 2 + 0.035]) { m4.makeTranslation(0, y, z); leggTill(THREE, lister, new THREE.BoxGeometry(TB - 0.22, 0.012, 0.006), m4, [1, 1, 1]); }
  }
  const listMesh = new THREE.Mesh(s.stada(lister.geometri()), listMat);
  tavla.add(ramRemsa, remsaSkarm, ram, skarm, listMesh);
  // bärverket: två ben och en bom ner till taket
  {
    const b = samlare(THREE); const m4 = new THREE.Matrix4(); const farg = lin('#20272f');
    const tak = Y_TAK - 0.05 * ((T_D - D_TAKFRAM) / (D_TAKBAK - D_TAKFRAM));
    for (const x of [-2.1, 2.1]) {
      m4.makeTranslation(x, (tak + T_Y0 + 0.2) / 2, T_Z - 0.16); leggTill(THREE, b, new THREE.BoxGeometry(0.12, T_Y0 + 0.2 - tak, 0.12), m4, farg);
      m4.makeTranslation(x, tak + 0.03, T_Z - 0.16); leggTill(THREE, b, new THREE.BoxGeometry(0.3, 0.06, 0.4), m4, farg);
    }
    m4.makeTranslation(0, T_Y0 + 0.1, T_Z - 0.16); leggTill(THREE, b, new THREE.BoxGeometry(4.6, 0.1, 0.1), m4, farg);
    const ben = new THREE.Mesh(s.stada(b.geometri()), metall({ vertexColors: true, roughness: 0.45, metalness: 0.7 }, 0.7));
    arena.add(ben);
  }
  arena.add(tavla); tavla.updateMatrixWorld(true);
  const traffbara = [ram, skarm, ramRemsa, remsaSkarm];
  // tavlans hörn i världen (för ramningen)
  const tavlaPunkter = [];
  for (const [x, y] of [[-TB / 2, yT + TH / 2 + 0.12], [TB / 2, yT + TH / 2 + 0.12], [-TB / 2, -0.04], [TB / 2, -0.04]]) tavlaPunkter.push(tavla.localToWorld(new V3(x, y, TD / 2)));
  const tavlaMitt = tavla.localToWorld(new V3(0, yT, TD / 2));
  await paus(); if (s.forstord) return null;

  /* ---- etapp 5: publiken ---- */
  const r = slump(77);
  const platser = [];
  {
    const rader = [];
    for (let k = 0; k < NED_N; k++) rader.push({ d: k * DEP + DEP * 0.5, y: NED_Y + k * NED_H, ljus: 1.06 - 0.2 * (k / (NED_N - 1)), ned: true, k });
    // övre ringen står under taket: mörkare längre in (djup i bilden)
    for (let k = 0; k < UPP_N; k++) rader.push({ d: D_UPP + k * DEP + DEP * 0.5, y: Y_FASAD + (k + 1) * UPP_H, ljus: 0.7 - 0.26 * (k / (UPP_N - 1)), ned: false, k });
    let total = 0;
    for (const rad of rader) for (let i = 0; i < bana.length - 1; i++) { const A = vid(bana[i], rad.d, 0), B_ = vid(bana[i + 1], rad.d, 0); total += Math.hypot(B_[0] - A[0], B_[2] - A[2]); }
    total = total * (1 - GANGANDEL) - TIFO_B * NED_N;
    const mal = Math.round(9600 * mangd);
    const bredd = klamp(total / (mal / 0.93), 0.074, 0.12);
    const fyll = Math.min(0.97, mal / (total / bredd));
    for (const rad of rader) {
      let rest = r() * bredd;
      for (let i = 0; i < bana.length - 1; i++) {
        const a = bana[i], b = bana[i + 1];
        const A = vid(a, rad.d, rad.y), B_ = vid(b, rad.d, rad.y);
        const len = Math.hypot(B_[0] - A[0], B_[2] - A[2]);
        let s0 = rest;
        while (s0 < len) {
          const f = s0 / len; s0 += bredd;
          const u = a.u + (b.u - a.u) * f;
          if (u - Math.floor(u) < GANGANDEL + 0.012) continue;                 // gången
          const x = A[0] + (B_[0] - A[0]) * f, z = A[2] + (B_[2] - A[2]) * f;
          if (rad.ned && z < -Z0 + 0.01 && Math.abs(x) < TIFO_B / 2 + 0.06) continue;  // under tifon
          if (r() > fyll) continue;
          const nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f; const nl = Math.hypot(nx, nz) || 1;
          platser.push({ x: x + (r() - 0.5) * bredd * 0.18, y: rad.y, z: z + (r() - 0.5) * 0.012, nx: nx / nl, nz: nz / nl, ljus: rad.ljus, ned: rad.ned, k: rad.k, roll: -1 });
        }
        rest = s0 - len;
      }
    }
    platser.bredd = bredd;
  }
  // bortalagets fans: bortre högra hörnet (orange tröjor, inga IFK-flaggor, armarna i kors när IFK gör mål)
  const arBorta = (p) => p.x > 5.1 && p.z < -3.15;
  // flaggbärare: utspridda små flaggor och storflaggor (6–7 m duk på lång stång) i de främre raderna, symmetriskt
  const flaggor = [], storflaggor = [];
  {
    const nSma = Math.round(210 * mangd);
    for (let i = 0; i < nSma && platser.length; i++) {
      const p = platser[Math.floor(r() * platser.length)];
      if (p.roll === 4 || arBorta(p)) continue;
      p.roll = 4; flaggor.push({ p, stor: false, design: Math.floor(r() * 4) });
    }
    const stora = [[-2.85, 'bort'], [2.85, 'bort'], [-4.45, 'bort'], [4.45, 'bort'], [-2.2, 'v'], [-0.6, 'v'], [1.1, 'v'], [-1.1, 'h'], [0.6, 'h'], [2.2, 'h']];
    if (lag) stora.length = 4;
    for (const [q, sida] of stora) {
      // närmaste plats på rad 1–2 i den undre ringen
      let bast = null, bd = Infinity;
      for (const p of platser) {
        if (!p.ned || p.k < 1 || p.k > 2) continue;
        const dd = sida === 'bort' ? (p.z < -Z0 + 0.01 ? Math.abs(p.x - q) : Infinity) : sida === 'v' ? (p.x < -X0 + 0.01 ? Math.abs(p.z - q) : Infinity) : (p.x > X0 - 0.01 ? Math.abs(p.z - q) : Infinity);
        if (dd < bd) { bd = dd; bast = p; }
      }
      if (bast && bd < 0.5) { bast.roll = 4; storflaggor.push({ p: bast, design: [0, 2, 3, 1][storflaggor.length % 4] }); }
    }
  }
  const N_PUB = platser.length;
  {
    const atlas = canvas(POSER * 128, 256, ritaPublik, { srgb: false, premult: true });
    const geo = s.stada(new THREE.PlaneGeometry(1, 1));
    const aData = new Float32Array(N_PUB * 4), aPlats = new Float32Array(N_PUB * 4);
    const bredd = platser.bredd;
    const pw = bredd * 1.22, ph = Math.min(0.24, bredd * 2.45);
    const mesh = new THREE.InstancedMesh(geo, null, N_PUB);
    const arr = mesh.instanceMatrix.array;
    platser.forEach((p, i) => {
      const sk = 0.9 + r() * 0.2;
      arr.set([pw * sk, 0, 0, 0, 0, ph * sk, 0, 0, p.k === 0 ? 0 : 0.3, 0, 1, 0, p.x, p.y, p.z, 1], i * 16);
      const t = r(); const troja = t < 0.42 ? 0 : t < 0.72 ? 1 : t < 0.88 ? 2 : 3;
      const roll = p.roll === 4 ? 4 : Math.floor(r() * 4);
      aData.set([r(), r(), troja, roll], i * 4);
      const varv = (Math.atan2(p.z, p.x) / (Math.PI * 2) + 1) % 1;
      aPlats.set([varv, p.ljus, Math.floor(varv * 22) / 22, Math.pow(r(), 2.4)], i * 4);
    });
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(aData, 4));
    geo.setAttribute('aPlats', new THREE.InstancedBufferAttribute(aPlats, 4));
    const c = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    mesh.material = s.stada(new THREE.ShaderMaterial({
      uniforms: {
        uTid: tid, uDis: dis, uDisFarg: disFarg, uAtlas: { value: atlas }, uBlixt: { value: lag ? 0 : 1 },
        uGast: { value: c('#e2672f', 1.05) }, uMal: malUni, uBla: { value: c(IFK_BLA, 1.25) }, uVit: { value: c(IFK_VIT, 0.86) }, uMork: { value: c('#1a2433') },
        uHudL: { value: c('#eab996') }, uHudM: { value: c('#6e4630') },
        uHar: { value: [c('#3a281d'), c('#b8935f'), c('#141414'), c('#8c8c8c'), c(IFK_BLA, 1.1)] },
        uLjus: { value: 1.08 }, uA2C: a2c,
      },
      vertexShader: `
        uniform float uTid; uniform float uBlixt; uniform vec3 uBla, uVit, uMork, uHudL, uHudM, uGast; uniform vec3 uHar[5]; uniform float uLjus; uniform vec2 uMal;
        ${DIS_VS}
        attribute vec4 aData;   // fas, tempo, tröja (0 randig, 1 blå, 2 vit, 3 mörk), roll (0 klappar, 1 vinkar, 2 halsduk, 3 står, 4 flagga)
        attribute vec4 aPlats;  // varv runt arenan, ljus, sektion, hud
        varying vec2 vUv; varying float vLx; varying vec3 vTroja; varying float vRandig; varying vec3 vHud; varying vec3 vHar; varying float vLjus; varying float vBlixt;
        float slh( float n ) { return fract( sin( n * 12.9898 ) * 43758.5453 ); }
        void main() {
          vec3 bas = instanceMatrix[3].xyz;
          float b = length( instanceMatrix[0].xyz ), h = length( instanceMatrix[1].xyz );
          float fas = aData.x, tempo = aData.y, troja = aData.z, roll = aData.w;
          float id = float( gl_InstanceID );
          float t = uTid;
          // ramsan: 28 s-cykel – klapp, sedan hopp med armarna uppe; sektionerna lite förskjutna
          float c = mod( t + aPlats.z * 4.0, 28.0 );
          float hopp = step( 12.0, c ) * step( c, 19.0 );
          float takt = t * 2.0 * ( 0.95 + 0.1 * tempo ) + fas * 0.3;
          float slag = fract( takt );
          float ram = 0.0; float y = 0.0;
          // IFK:s mål (uMal = senaste målet: tid, lag – sätts av matchsimuleringen): hela arenan exploderar, bortafansen står still
          float sedan = t - uMal.x;
          float mal = step( 0.05, sedan ) * step( sedan, 7.8 ) * ( 1.0 - uMal.y );
          float borta = step( 5.1, bas.x ) * step( bas.z, -3.15 );
          float snabb = fract( takt * 2.0 );
          if ( mal > 0.5 && borta > 0.5 ) { ram = 11.0; }
          else if ( mal > 0.5 ) {
            ram = roll > 3.5 ? 4.0 : roll < 0.5 ? ( slag < 0.5 ? 10.0 : 3.0 ) : roll < 1.5 ? ( slag < 0.5 ? 4.0 : 7.0 ) : roll < 2.5 ? ( snabb < 0.5 ? 8.0 : 9.0 ) : 10.0;
            y = 0.036 * abs( sin( 3.14159 * takt ) ) * h / 0.2;
          }
          else if ( roll > 3.5 ) { ram = 4.0; y = 0.005 * sin( t * 3.1 + fas * 6.3 ); }
          else if ( hopp > 0.5 ) { ram = roll < 1.5 ? 3.0 : ( roll < 2.5 ? ( snabb < 0.5 ? 8.0 : 9.0 ) : 2.0 ); y = 0.03 * abs( sin( 3.14159 * takt ) ) * h / 0.2; }
          else if ( roll < 0.5 ) { ram = slag < 0.24 ? 1.0 : 6.0; }
          else if ( roll < 1.5 ) { ram = mod( floor( takt * 0.5 + fas * 2.0 ), 2.0 ) < 1.0 ? 4.0 : 7.0; }
          else if ( roll < 2.5 ) { ram = 5.0; y = 0.004 * sin( takt * 3.14159 ); }
          // vågen: var 36:e sekund går den ett varv runt arenan på 13 s
          float vt = mod( t - 3.0, 36.0 );
          float av = fract( aPlats.x - vt / 13.0 + 0.5 ) - 0.5;
          float vag = step( vt, 13.0 ) * exp( -av * av / 0.0011 );
          if ( vag > 0.3 && roll < 3.5 && mal < 0.5 ) ram = 3.0;
          y += 0.045 * vag * h / 0.2;
          // skylten vrids mot kameran runt y-axeln
          vec3 till = cameraPosition - bas; till.y = 0.0; till = normalize( till + vec3( 1e-4, 0.0, 0.0 ) );
          vec3 hoger = vec3( till.z, 0.0, -till.x );
          float klipp = instanceMatrix[2].x;                   // nedre delen döljs ändå av raden framför
          float vy = klipp + uv.y * ( 1.0 - klipp );
          vec3 p = bas + hoger * position.x * b + vec3( 0.0, vy * h + y, 0.0 );
          vUv = vec2( ( ram + uv.x ) / ${POSER}.0, vy ); vLx = uv.x;
          vRandig = troja < 0.5 && borta < 0.5 ? 1.0 : 0.0;
          vTroja = borta > 0.5 ? ( troja < 2.5 ? uGast : uMork ) : troja < 1.5 ? uBla : ( troja < 2.5 ? uVit : uMork );
          vHud = mix( uHudL, uHudM, aPlats.w );
          float hs = slh( id * 0.731 + 3.1 );
          vHar = hs < 0.32 ? uHar[0] : ( hs < 0.56 ? uHar[1] : ( hs < 0.74 ? uHar[2] : ( hs < 0.86 ? uHar[3] : uHar[4] ) ) );
          vLjus = aPlats.y * uLjus * ( 0.86 + 0.28 * slh( id * 1.37 ) );
          // ett strålkastarsvep som går runt läktarna (ett varv på ~32 s), och lite starkare ljus i sektionerna när målet firas
          float sv = fract( aPlats.x - t * 0.031 ) - 0.5;
          vLjus *= 1.0 + 0.42 * exp( -sv * sv / 0.0009 ) + 0.1 * mal * ( 1.0 - borta );
          // mobilkameror: en och annan – många när målet firas
          vBlixt = uBlixt * step( mal > 0.5 && borta < 0.5 ? 0.9972 : 0.99993, slh( id * 0.173 + floor( t * 6.0 ) * 1.91 ) );
          vec4 mv = viewMatrix * vec4( p, 1.0 );
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform vec3 uBla, uVit; uniform vec3 uDisFarg; uniform float uA2C;
        varying vec2 vUv; varying float vLx; varying vec3 vTroja; varying float vRandig; varying vec3 vHud; varying vec3 vHar; varying float vLjus; varying float vBlixt; varying float vDis;
        ${TACK_FS}
        void main() {
          vec4 m = texture2D( uAtlas, vUv );
          float a = tackning( m.a, uA2C );
          float st = rand( vLx * 5.0 + 0.1 );
          if ( a < 0.01 ) discard;
          vec3 troja = vRandig > 0.5 ? mix( uBla, uVit, st ) : vTroja;
          vec3 col = ( m.r * troja + m.g * vHud + m.b * vHar ) / max( m.a, 0.3 );
          col *= vLjus;
          col += vBlixt * vec3( 7.0 ) * step( 0.7, vUv.y );
          gl_FragColor = vec4( mix( col, uDisFarg, vDis ), a );
        }`,
    }));
    mesh.material.alphaToCoverage = true;
    mesh.frustumCulled = false; mesh.name = 'publik';
    arena.add(mesh);
  }
  await paus(); if (s.forstord) return null;

  /* ---- etapp 6: flaggorna, tifon, pappersregnet ---- */
  const ljusRikt = new V3(0.15, 0.8, 0.58).normalize();
  if (flaggor.length) {
    const BR = 0.7, HO = 0.45, NX = 10, NY = 4;
    const g = samlare(THREE); const del = [];
    const n = [0, 0, 1];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x0 = (i / NX) * BR, x1 = ((i + 1) / NX) * BR, y0 = 1 - HO + (j / NY) * HO, y1 = 1 - HO + ((j + 1) / NY) * HO;
      g.quad([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], n, n, n, n, [i / NX, j / NY], [(i + 1) / NX, j / NY], [(i + 1) / NX, (j + 1) / NY], [i / NX, (j + 1) / NY], [0, 0, 0]);
    }
    const duk = g.antal;
    const w = 0.012;
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const nn = [az, 0, -ax];
      g.quad([-w * ax, -0.12, -w * az], [w * ax, -0.12, w * az], [w * ax, 1.02, w * az], [-w * ax, 1.02, -w * az], nn, nn, nn, nn, [0, 0], [1, 0], [1, 1], [0, 1], [1, 0, 0]);
    }
    const geo = s.stada(g.geometri());
    for (let i = 0; i < g.antal; i++) del.push(i < duk ? 0 : 1);
    geo.setAttribute('aDel', new THREE.Float32BufferAttribute(del, 1));
    geo.deleteAttribute('color');
    const N = flaggor.length;
    const mesh = new THREE.InstancedMesh(geo, null, N);
    const aFlagg = new Float32Array(N * 4);
    const m4 = new THREE.Matrix4(), X = new V3(), Y = new V3(0, 1, 0), Z = new V3();
    flaggor.forEach((f, i) => {
      const p = f.p; const sk = f.stor ? 0.46 + r() * 0.06 : 0.17 + r() * 0.04;
      Z.set(-p.nx, 0, -p.nz); X.crossVectors(Y, Z).normalize();
      m4.makeBasis(X, Y, Z).scale(new V3(sk, sk, sk));
      m4.setPosition(p.x - p.nx * 0.02, p.y + platser.bredd * 1.9, p.z - p.nz * 0.02);
      mesh.setMatrixAt(i, m4);
      aFlagg.set([r(), f.stor ? 0.55 + r() * 0.15 : 0.8 + r() * 0.4, f.design, f.stor ? 1 : 0], i * 4);
    });
    geo.setAttribute('aFlagg', new THREE.InstancedBufferAttribute(aFlagg, 4));
    const tex = s.canvasTextur(1280, 160, ritaFlaggor);
    mesh.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uDis: dis, uDisFarg: disFarg, uKarta: { value: tex }, uLjusRikt: { value: ljusRikt } },
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTid; uniform vec3 uLjusRikt;
        ${DIS_VS}
        attribute float aDel; attribute vec4 aFlagg;   // fas, fart, design, stor
        varying vec2 vUv; varying float vDel; varying float vSken; varying float vDesign;
        mat3 rotZ( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 ); }
        mat3 rotY( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c ); }
        void main() {
          float fas = aFlagg.x * 6.2832, fart = aFlagg.y, stor = aFlagg.w;
          float t = uTid * fart;
          float w = 2.4;
          float sving = ( 0.66 - 0.26 * stor ) * sin( t * w + fas );     // flaggan vevas fram och tillbaka kring handen
          float svingV = cos( t * w + fas );
          float vrid = ( 0.55 - 0.25 * stor ) * sin( t * w * 0.5 + fas * 1.3 );
          vec3 p = position; vec3 n = vec3( 0.0, 0.0, 1.0 );
          if ( aDel < 0.5 ) {
            float x = p.x / 0.7;
            float k = 8.0, om = 8.5 * fart + 2.0;
            float amp = ( 0.06 + 0.05 * stor ) * 0.7;
            float ph = k * x - uTid * om + fas;
            float z = amp * x * sin( ph );
            float dz = amp * ( sin( ph ) + k * x * cos( ph ) ) / 0.7;
            float yy = p.y - 0.42 * svingV * x * x * ( 1.0 - 0.45 * stor ) - 0.1 * x * x * ( 1.0 - 0.5 * abs( svingV ) );
            p = vec3( p.x, yy, z );
            n = normalize( vec3( -dz, 0.0, 1.0 ) );
          }
          mat3 R = rotZ( sving ) * rotY( vrid );
          p = R * p; n = R * n;
          vec4 wp = instanceMatrix * vec4( p, 1.0 );
          vec3 wn = normalize( mat3( instanceMatrix ) * n );
          vSken = 0.42 + 0.78 * abs( dot( wn, uLjusRikt ) );
          vUv = uv; vDel = aDel; vDesign = aFlagg.z;
          vec4 mv = viewMatrix * modelMatrix * wp;
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uKarta; uniform vec3 uDisFarg;
        varying vec2 vUv; varying float vDel; varying float vSken; varying float vDesign; varying float vDis;
        void main() {
          vec3 col = vDel > 0.5 ? vec3( 0.3, 0.32, 0.36 ) * vSken : texture2D( uKarta, vec2( ( vDesign + clamp( vUv.x, 0.01, 0.99 ) ) / ${DESIGNER}.0, vUv.y ) ).rgb * vSken * 1.2;
          gl_FragColor = vec4( mix( col, uDisFarg, vDis ), 1.0 );
        }`,
    }));
    mesh.frustumCulled = false; mesh.name = 'flaggor';
    arena.add(mesh);
  }

  // Storflaggor (svingas i stora bågar av supportrar i de främre raderna), takflaggor (fladdrar i vinden längs takets
  // framkant) och hörnflaggor på planen – EN instansierad mesh med tät duk, all rörelse i vertexshadern.
  {
    const FH = 0.62, NX = lag ? 12 : 22, NY = lag ? 6 : 12;
    const g = samlare(THREE); const n = [0, 0, 1];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x0 = i / NX, x1 = (i + 1) / NX, y0 = 1 - FH + (j / NY) * FH, y1 = 1 - FH + ((j + 1) / NY) * FH;
      g.quad([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], n, n, n, n, [x0, j / NY], [x1, j / NY], [x1, (j + 1) / NY], [x0, (j + 1) / NY], [0, 0, 0]);
    }
    const duk = g.antal;
    leggTill(THREE, g, new THREE.CylinderGeometry(0.011, 0.013, 1.3, 6, 1, true).translate(0, 0.43, 0), new THREE.Matrix4(), [1, 0, 0]);
    leggTill(THREE, g, new THREE.SphereGeometry(0.022, 8, 6).translate(0, 1.09, 0), new THREE.Matrix4(), [1, 0, 0]);
    const geo = s.stada(g.geometri());
    geo.setAttribute('aDel', new THREE.Float32BufferAttribute(Array.from({ length: g.antal }, (_, i) => (i < duk ? 0 : 1)), 1));
    geo.deleteAttribute('color');
    const lista = [];
    const Yv = new V3(0, 1, 0);
    // i händerna: duken mot planen, stången svingas kring greppet (origo) – 6–7 m duk
    for (const f of storflaggor) {
      const Z = new V3(-f.p.nx, 0, -f.p.nz), X = new V3().crossVectors(Yv, Z).normalize();
      lista.push({ X, Z, pos: new V3(f.p.x - f.p.nx * 0.03, f.p.y + 0.13, f.p.z - f.p.nz * 0.03), sk: 0.82 + r() * 0.1, typ: 0, design: f.design });
    }
    // takflaggor: vinden blåser åt höger (+x) – stången står på taket, duken mot kameran
    const vind = new V3(1, 0, -0.22).normalize(), Zv = new V3().crossVectors(vind, Yv).normalize();
    const yTak = Y_TAK - 0.05 * (0.12 / (D_TAKBAK - D_TAKFRAM));
    const takPos = [];
    for (const x of [-5.0, -3.75, 3.75, 5.0]) takPos.push([x, -(Z0 + D_TAKFRAM + 0.12)]);
    for (const sx of [-1, 1]) {
      for (const z of [-2.3, -0.8, 0.8, 2.3]) takPos.push([sx * (X0 + D_TAKFRAM + 0.12), z]);
      const a = sx < 0 ? Math.PI * 1.25 : Math.PI * 1.75, rr = R0 + D_TAKFRAM + 0.12;
      takPos.push([sx * (X0 - R0) + Math.cos(a) * rr * (sx < 0 ? 1 : 1), -(Z0 - R0) + Math.sin(a) * rr]);
    }
    takPos.forEach(([x, z], i) => lista.push({ X: vind, Z: Zv, pos: new V3(x, yTak + 0.22 * 0.38, z), sk: 0.38, typ: 1, design: i % 2 ? 4 : [0, 1, 2][(i >> 1) % 3] }));
    // hörnflaggorna
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lista.push({ X: vind, Z: Zv, pos: new V3(sx * PL, 0.22 * 0.12, sz * PB), sk: 0.12, typ: 1, design: 1 });
    const N = lista.length;
    const mesh = new THREE.InstancedMesh(geo, null, N);
    const aStor = new Float32Array(N * 4); const m4 = new THREE.Matrix4();
    lista.forEach((f, i) => {
      m4.makeBasis(f.X, Yv, f.Z).scale(new V3(f.sk, f.sk, f.sk)); m4.setPosition(f.pos); mesh.setMatrixAt(i, m4);
      aStor.set([r(), f.typ, f.design, 0], i * 4);
    });
    geo.setAttribute('aStor', new THREE.InstancedBufferAttribute(aStor, 4));
    const tex = s.canvasTextur(2560, 320, ritaStorflaggor);
    mesh.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uDis: dis, uDisFarg: disFarg, uKarta: { value: tex }, uLjusRikt: { value: ljusRikt } },
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTid; uniform vec3 uLjusRikt;
        ${DIS_VS}
        attribute float aDel; attribute vec4 aStor;   // fas, typ (0 i händerna, 1 i vinden), design
        varying vec2 vUv; varying float vDel; varying float vSken; varying float vDesign; varying float vVeck;
        mat2 rot( float a ) { float c = cos( a ), s = sin( a ); return mat2( c, s, -s, c ); }
        void main() {
          float fas = aStor.x * 6.2832, t = uTid;
          vec3 p = position; vec3 n = vec3( 0.0, 0.0, 1.0 ); float vinkel = 0.0; float veck = 0.0;
          float x = p.x, v = ( 1.0 - p.y ) / ${FH};
          if ( aStor.y < 0.5 ) {
            // svingen: en lugn åtta – stången lutar fram och tillbaka kring greppet, duken släpar efter och faller när svingen vänder
            float w = 1.45 + aStor.x * 0.3;
            vinkel = 0.52 * sin( t * w + fas ) + 0.07 * sin( t * w * 2.0 + fas * 1.7 );
            float fart = cos( t * w + fas );
            if ( aDel < 0.5 ) {
              vec2 q = rot( -0.62 * fart * x ) * ( p.xy - vec2( 0.0, 1.0 ) ); p.xy = q + vec2( 0.0, 1.0 );
              p.y -= 0.24 * x * x * ( 1.0 - 0.75 * abs( fart ) );
              float ph = 6.5 * x - t * 6.0 + fas + v * 1.6; float amp = 0.08 * x;
              p.z += amp * sin( ph );
              veck = 0.08 * sin( ph ) + amp * 6.5 * cos( ph );
            }
          } else if ( aDel < 0.5 ) {
            // i vinden: vågor som löper ut mot kanten, lite tyngd och ett ryck då och då
            float ph1 = 8.5 * x - t * 7.5 + fas, ph2 = 19.0 * x - t * 12.0 + v * 4.0 + fas;
            float a1 = 0.085 * x * ( 0.6 + 0.4 * x ), a2 = 0.026 * x;
            p.z += a1 * sin( ph1 ) + a2 * sin( ph2 );
            veck = a1 * 8.5 * cos( ph1 ) + 0.085 * ( 0.6 + 0.8 * x ) * sin( ph1 ) + a2 * 19.0 * cos( ph2 );
            p.y -= 0.05 * x * x;
            p.x *= 0.965 + 0.035 * sin( t * 3.1 + fas );
          }
          n = normalize( vec3( -veck, 0.0, 1.0 ) );
          p.xy = rot( vinkel ) * p.xy; n.xy = rot( vinkel ) * n.xy;
          vec4 wp = instanceMatrix * vec4( p, 1.0 );
          vec3 wn = normalize( mat3( instanceMatrix ) * n );
          vSken = 0.4 + 0.74 * abs( dot( wn, uLjusRikt ) );
          vVeck = clamp( abs( veck ), 0.0, 1.0 );
          vUv = uv; vDel = aDel; vDesign = aStor.z;
          vec4 mv = viewMatrix * modelMatrix * wp;
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uKarta; uniform vec3 uDisFarg;
        varying vec2 vUv; varying float vDel; varying float vSken; varying float vDesign; varying float vVeck; varying float vDis;
        void main() {
          vec3 col;
          if ( vDel > 0.5 ) col = vec3( 0.58, 0.61, 0.66 ) * vSken;
          else {
            float u = gl_FrontFacing ? vUv.x : 1.0 - vUv.x;     // baksidan visar trycket spegelvänt, som en riktig flagga
            col = texture2D( uKarta, vec2( ( vDesign + clamp( u, 0.004, 0.996 ) ) / ${STOR_DESIGNER}.0, vUv.y ) ).rgb * vSken * 1.12;
            col *= gl_FrontFacing ? 1.0 : 0.82;
            col += vec3( 0.045, 0.055, 0.07 ) * smoothstep( 0.25, 0.9, vVeck );   // satinglans i vecken
          }
          gl_FragColor = vec4( mix( col, uDisFarg, vDis ), 1.0 );
        }`,
    }));
    mesh.frustumCulled = false; mesh.name = 'storflaggor';
    arena.add(mesh);
  }

  // Spelarna: en liten matchsimulering (JS, ~40 figurer – mikrosekunder per bild). Spelarna har fart och tröghet (styrning mot
  // ett mål, begränsad acceleration, de glider undan varandra). Bollhållaren driver framåt och undviker försvarare, två
  // lagkamrater löper in i ytor och anfallarna djupled; närmaste motståndare pressar och nästa täcker passningsvägen.
  // Passningar väljs efter läge (framåt, lagom långt, fri mottagare), långa bollar slås högt och kan nickas, brytningar och
  // glidtacklingar vinner bollen. I läge skjuter man – målvakten dyker: mål, räddning (målvakten håller och spelar ut) eller
  // utanför. IFK:s chans ökar med tiden sedan senaste målet, så det blir mål med jämna mellanrum. Målet firas i hörnet och
  // malUni (tid + lag) driver publiken, bengalerna, pappersregnet och sargen. Domaren, linjedomarna, ledarna och avbytarna
  // följer bollen. Shadern får plats, bild och riktning per figur (aDyn) och bollens rotation (aRot).
  let spelUppdatera = null;
  {
    const FORM = [[-4.85, 0], [-3.4, -2.3], [-3.65, -0.8], [-3.65, 0.8], [-3.4, 2.3], [-1.75, -2.4], [-1.95, -0.8], [-1.95, 0.8], [-1.75, 2.4], [-0.4, -0.75], [-0.3, 0.7]];
    const rnd = slump(4242);
    const fr = (x) => x - Math.floor(x);
    const ss = (a, b, x) => { const q = klamp((x - a) / (b - a)); return q * q * (3 - 2 * q); };
    const mx = (a, b, f) => a + (b - a) * f;
    const avst = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const rikt = (lag) => (lag === 0 ? 1 : -1);                       // anfallsriktningen i x (IFK mot +x)
    const malLinje = (lag) => rikt(lag) * PL;                          // mållinjen laget anfaller
    const form = (p) => (p.lag ? [-FORM[p.nr][0], -FORM[p.nr][1]] : FORM[p.nr]);
    const spelare = [];
    for (let lag = 0; lag < 2; lag++) for (let i = 0; i < 11; i++) {
      const f = lag ? [-FORM[i][0], -FORM[i][1]] : FORM[i];
      spelare.push({ lag, nr: i, gk: i === 0, x: f[0], z: f[1], vx: 0, vz: 0, steg: rnd(), spegel: rikt(lag), hand: '', handT: 0, dykZ: 0, fro: rnd() });
    }
    const malvakt = (lag) => spelare[lag * 11];
    // matchens läge
    const B = { lage: 'agd', agare: null, x: 0, z: 0, y: 0, fran: null, till: null, t0: 0, tid: 1, hojd: 0, slutH: 0, mot: null, snapp: null, utfall: '', rot: 0 };
    const S = { fas: 'avspark', fasT: 0, innehav: 0, malLag: 0, sedanMal: 46, hallT: 0.8, tackT: 0, missar: 0, tid: 0 };
    const avspark = (lag) => {
      spelare.forEach((p) => { const f = form(p); p.x = f[0] * 0.92; p.z = f[1]; p.vx = p.vz = 0; p.hand = ''; });
      const a = spelare[lag * 11 + 10]; a.x = -rikt(lag) * 0.06; a.z = 0;
      Object.assign(B, { lage: 'agd', agare: a, x: 0, z: 0, y: 0 });
      Object.assign(S, { fas: 'avspark', fasT: 0, innehav: lag, hallT: 0.9 });
    };
    avspark(0);
    const narmast = (lag, x, z, utom = null) => { let b = null, bd = 1e9; for (const q of spelare) { if (q.lag !== lag || q === utom || q.gk) continue; const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; b = q; } } return [b, bd]; };
    const tryck = (p) => narmast(1 - p.lag, p.x, p.z)[1];
    const handling = (p, h, t) => { p.hand = h; p.handT = t; };
    const vinn = (p, glid) => { if (glid) handling(p, 'glid', 0.5); Object.assign(B, { lage: 'agd', agare: p, y: 0 }); S.innehav = p.lag; S.hallT = 0.7 + rnd() * 1.1; S.tackT = 0; };
    // ett flygande bollskede: passning, skott eller utspark
    const skjutIvag = (lage, fran, till, tid, hojd, slutH = 0) => Object.assign(B, { lage, fran, till, t0: S.tid, tid: Math.max(0.2, tid), hojd, slutH, agare: null });
    const passa = (a, q) => {
      const d = avst(a, q); const lang = d > 2.3; const fart = lang ? 1.3 : 1.65; const tid = d / fart;
      const till = [klamp(q.x + q.vx * tid * 0.85, -PL + 0.1, PL - 0.1), klamp(q.z + q.vz * tid * 0.85, -PB + 0.08, PB - 0.08)];
      const nick = lang && rnd() < 0.45;
      skjutIvag('pass', [B.x, B.z], till, tid, lang ? 0.2 + d * 0.025 : 0, nick ? 0.15 : 0);
      B.mot = q; B.snapp = null; B.nick = nick;
      // brytning: en motståndare nära passningslinjen kan sticka in en fot (inte på höga bollar)
      if (!lang) {
        let bast = null, bd = 0.13;
        for (const o of spelare) {
          if (o.lag === a.lag || o.gk) continue;
          const ux = till[0] - B.x, uz = till[1] - B.z, L = Math.hypot(ux, uz) || 1;
          const s = ((o.x - B.x) * ux + (o.z - B.z) * uz) / (L * L); if (s < 0.2 || s > 0.85) continue;
          const dd = Math.abs((o.x - B.x) * uz - (o.z - B.z) * ux) / L; if (dd < bd) { bd = dd; bast = [o, s]; }
        }
        if (bast && rnd() < 0.4) { B.snapp = bast[0]; const s = bast[1]; B.till = [mx(B.x, till[0], s), mx(B.z, till[1], s)]; B.tid = tid * s; }
      }
      handling(a, 'skott', 0.24);
    };
    const skjut = (a) => {
      const lag = a.lag, r = rikt(lag); S.skott = true;
      const chans = lag === 0 ? Math.min(0.92, 0.2 + S.missar * 0.17 + (S.sedanMal > 55 ? 0.45 : 0)) : 0;
      const utfall = rnd() < chans ? 'mal' : rnd() < 0.62 ? 'raddning' : 'utanfor';
      const z = (rnd() - 0.5) * 0.56;
      const zMal = utfall === 'utanfor' ? (z < 0 ? -1 : 1) * (0.44 + rnd() * 0.25) : z;
      const tillX = malLinje(lag) + r * (utfall === 'raddning' ? -0.06 : 0.13);
      const d = Math.hypot(tillX - B.x, zMal - B.z);
      skjutIvag('skott', [B.x, B.z], [tillX, zMal], d / 2.7, 0.05 + rnd() * 0.06, utfall === 'mal' ? 0.07 + rnd() * 0.1 : utfall === 'utanfor' ? 0.22 : 0.08);
      B.utfall = utfall;
      handling(a, 'skott', 0.3);
      const mv = malvakt(1 - lag); mv.dykZ = utfall === 'mal' ? -zMal * 0.6 : zMal; handling(mv, 'dyk', B.tid + 0.7);
    };
    const beslut = () => {
      const a = B.agare; const r = rikt(a.lag); const tr = tryck(a);
      if (a.gk) { // målvakten spelar ut till en back
        const backar = spelare.filter((q) => q.lag === a.lag && q.nr >= 1 && q.nr <= 4);
        passa(a, backar[Math.floor(rnd() * backar.length)]); return;
      }
      const tillMal = Math.hypot(malLinje(a.lag) - a.x, a.z);
      if (tillMal < 1.85 && Math.abs(a.z) < 1.35 && (a.lag === 0 ? S.sedanMal > 18 : rnd() < 0.45)) { skjut(a); return; }
      let bast = null, bp = -1e9;
      for (const q of spelare) {
        if (q.lag !== a.lag || q === a || q.gk) continue;
        const d = avst(a, q); if (d < 0.5 || d > 3.6) continue;
        const fram = (q.x - a.x) * r; const fri = Math.min(narmast(1 - a.lag, q.x, q.z)[1], 1.0);
        const p = fram * (0.5 + (a.lag === 0 && S.sedanMal > 45 ? 0.45 : 0)) - Math.abs(d - 1.6) * 0.55 + fri * 1.3 + rnd() * 1.1;
        if (p > bp) { bp = p; bast = q; }
      }
      if (!bast || (tr > 0.55 && rnd() < 0.35)) { S.hallT = 0.5 + rnd() * 0.9; return; } // dribblar vidare
      passa(a, bast);
    };
    // var spelaren vill vara (och hur fort): formationen förskjuts mot bollen, laget med boll flyttar upp
    const malPos = (p, roll) => {
      const r = rikt(p.lag), f = form(p); const har = S.innehav === p.lag;
      if (S.fas === 'mal' || S.fas === 'tillbaka') {
        if (S.fas === 'mal' && p.lag === S.malLag && !p.gk) { const v = p.fro * 6.2832, rr = 0.1 + 0.28 * fr(p.fro * 7.3); return [[rikt(S.malLag) * 4.55 + rr * Math.cos(v), -2.72 + rr * Math.sin(v) * 0.7], 0.62]; }
        return [[f[0] * 0.92, f[1]], S.fas === 'tillbaka' ? 0.42 : 0.18];
      }
      if (S.fas === 'avspark') return [[p.x, p.z], 0.1];
      if (p.gk) { const ix = -r * PL + r * (0.16 + 0.12 * ss(0, 3, Math.abs(B.x + r * PL) < 3 ? 3 - Math.abs(B.x + r * PL) : 0)); return [[ix, klamp(B.z * 0.28, -0.32, 0.32)], 0.36]; }
      let x = f[0] + B.x * 0.42 + (har ? 1.05 : -0.35) * r, z = f[1] * (har ? 1.05 : 0.85) + B.z * 0.3;
      let v = 0.36;
      if (roll === 'agare') { const [o, od] = narmast(1 - p.lag, p.x + r * 0.4, p.z); x = p.x + r * 0.7; z = p.z + 0.35 * Math.sin(S.tid * 0.9 + p.fro * 6) + (o && od < 0.7 ? (p.z > o.z ? 0.5 : -0.5) : 0) - p.z * 0.15; v = 0.4; }
      else if (roll === 'stod') { const a = B.agare || B.mot; if (a) { const sid = p.z > a.z ? 1 : -1; x = a.x + r * (0.9 + p.fro * 0.6); z = a.z + sid * (0.8 + p.fro * 0.5); v = 0.5; } }
      else if (roll === 'djup' && har) { x = mx(x, malLinje(p.lag) - r * 1.1, 0.55); v = 0.55; }
      else if (roll === 'press') { const a = B.agare; if (a) { x = a.x - r * 0.1; z = a.z; } else { x = B.x; z = B.z; } v = 0.64; }
      else if (roll === 'tack') { const a = B.agare; const [m] = a ? narmast(a.lag, a.x + r * 1.2, a.z, a) : [null]; if (a && m) { x = (a.x + m.x) / 2; z = (a.z + m.z) / 2; v = 0.5; } }
      else if (roll === 'mot') { x = B.till[0]; z = B.till[1]; v = 0.6; }
      return [[klamp(x, -PL + 0.15, PL - 0.15), klamp(z, -PB + 0.1, PB - 0.1)], v];
    };
    const styr = (p, m, vmax, dt) => {
      const dx = m[0] - p.x, dz = m[1] - p.z; const d = Math.hypot(dx, dz);
      const v = Math.min(vmax, d * 1.7); const ox = d > 1e-4 ? (dx / d) * v : 0, oz = d > 1e-4 ? (dz / d) * v : 0;
      const dvx = ox - p.vx, dvz = oz - p.vz; const dl = Math.hypot(dvx, dvz); const k = dl > 1.7 * dt ? (1.7 * dt) / dl : 1;
      p.vx += dvx * k; p.vz += dvz * k;
    };
    const steg = (dt) => {
      S.tid += dt; S.fasT += dt; S.sedanMal += dt;
      if (S.fas === 'avspark' && S.fasT > 1.1) { S.fas = 'spel'; S.fasT = 0; }
      if (S.fas === 'mal' && S.fasT > 7.6) { S.fas = 'tillbaka'; S.fasT = 0; skjutIvag('retur', [B.x, B.z], [0, 0], 2.6, 0.42); }
      if (S.fas === 'tillbaka' && S.fasT > 3.2) avspark(1 - S.malLag);
      // roller i spelet
      const roll = new Map();
      if (S.fas === 'spel') {
        const a = B.agare;
        if (a) {
          roll.set(a, 'agare');
          const lagk = spelare.filter((q) => q.lag === a.lag && q !== a && !q.gk).sort((p1, p2) => avst(p1, a) - avst(p2, a));
          lagk.slice(0, 2).forEach((q) => roll.set(q, 'stod'));
          spelare.filter((q) => q.lag === a.lag && q.nr >= 9 && !roll.has(q)).forEach((q) => roll.set(q, 'djup'));
          const mot = spelare.filter((q) => q.lag !== a.lag && !q.gk).sort((p1, p2) => avst(p1, a) - avst(p2, a));
          if (mot[0]) roll.set(mot[0], 'press'); if (mot[1]) roll.set(mot[1], 'tack');
        } else if (B.lage === 'pass') {
          if (B.snapp) roll.set(B.snapp, 'mot'); else if (B.mot) roll.set(B.mot, 'mot');
          const [o] = narmast(B.mot ? 1 - B.mot.lag : 0, B.till[0], B.till[1]); if (o && !roll.has(o)) roll.set(o, 'press');
        }
      }
      for (const p of spelare) {
        const [m, v] = malPos(p, roll.get(p));
        if (!(p.hand === 'glid' || p.hand === 'dyk')) styr(p, m, v, dt);
        else { p.vx *= 1 - 3 * dt; p.vz *= 1 - 3 * dt; if (p.hand === 'dyk') { const mz = klamp(p.dykZ, -0.36, 0.36); p.vz = (mz - p.z) * 5; } }
      }
      // de glider undan varandra
      for (let i = 0; i < spelare.length; i++) for (let j = i + 1; j < spelare.length; j++) {
        const p = spelare[i], q = spelare[j]; const dx = q.x - p.x, dz = q.z - p.z; const d = Math.hypot(dx, dz);
        if (d > 0 && d < 0.2) { const k = ((0.2 - d) / d) * 0.5 * Math.min(1, dt * 8); p.x -= dx * k; p.z -= dz * k; q.x += dx * k; q.z += dz * k; }
      }
      for (const p of spelare) { p.x += p.vx * dt; p.z += p.vz * dt; if (p.handT > 0) { p.handT -= dt; if (p.handT <= 0) p.hand = ''; } }
      // bollen
      if (B.lage === 'agd') {
        const a = B.agare; const fart = Math.hypot(a.vx, a.vz);
        const ux = fart > 0.03 ? a.vx / fart : rikt(a.lag), uz = fart > 0.03 ? a.vz / fart : 0;
        const touch = a.gk ? 0.03 : 0.05 + 0.025 * Math.sin(S.tid * 7 + a.fro * 9);
        B.x = a.x + ux * touch; B.z = a.z + uz * touch; B.y = a.gk ? 0.1 : 0; B.rot -= fart * dt * 48 * (ux >= 0 ? 1 : -1);
        if (S.fas === 'spel') {
          S.hallT -= dt; const tr = tryck(a);
          if (!a.gk && tr < 0.1) { S.tackT += dt; if (S.tackT > 0.38) { S.tackT = 0; const [o] = narmast(1 - a.lag, a.x, a.z); if (o && rnd() < 0.42) vinn(o, true); } } else S.tackT = 0;
          if (B.agare === a && (S.hallT <= 0 || (tr < 0.17 && S.hallT < 0.35 && !a.gk))) beslut();
        }
      } else if (B.lage !== 'nat') {
        const q = klamp((S.tid - B.t0) / B.tid); const e = B.lage === 'skott' ? q : 1 - (1 - q) * (1 - q);
        const px = B.x;
        B.x = mx(B.fran[0], B.till[0], e); B.z = mx(B.fran[1], B.till[1], e); B.y = B.hojd * Math.sin(Math.PI * q) + B.slutH * q;
        B.rot -= (B.x - px) * 60;
        if (B.lage === 'pass' && B.nick && B.mot && q > 0.78 && B.mot.hand !== 'nick') handling(B.mot, 'nick', 0.42);
        if (q >= 1) {
          if (B.lage === 'pass') vinn(B.snapp || B.mot, false);
          else if (B.lage === 'skott') {
            const anf = Math.sign(B.till[0]) > 0 ? 0 : 1;
            if (B.utfall === 'mal') { natTraff.value.set(B.till[0] + rikt(anf) * 0.07, B.slutH, B.till[1]); Object.assign(B, { lage: 'nat', y: 0.02 }); Object.assign(S, { fas: 'mal', fasT: 0, malLag: anf, sedanMal: 0, missar: 0 }); malUni.value.set(tidNu, anf);
              const sk = spelare.filter((p) => p.lag === anf && !p.gk).sort((p1, p2) => avst(p1, B) - avst(p2, B))[0]; if (sk) handling(sk, 'glid', 0); }
            else if (B.utfall === 'raddning') { S.missar++; const mv = malvakt(1 - anf); handling(mv, 'hall', 1.4); vinn(mv, false); S.hallT = 1.5; }
            else { S.missar++; const mv = malvakt(1 - anf); skjutIvag('retur', [B.x, B.z], [mv.x + rikt(mv.lag) * 0.05, mv.z], 1.4, 0.18); B.efter = mv; }
          } else if (B.lage === 'retur') {
            if (B.efter) { const mv = B.efter; B.efter = null; handling(mv, 'hall', 1.2); vinn(mv, false); S.hallT = 1.3; }
            else Object.assign(B, { lage: 'nat', x: 0, z: 0, y: 0 });
          }
        }
      }
    };
    let tidNu = 0, sistaT = null;
    // de andra figurerna: domaren, linjedomarna, ledarna och avbytarna
    const ovriga = [[2, -1], [4, -1], [4, 1], [5, -1], [5, 1]];
    if (!lag) for (let k = 0; k < 3; k++) ovriga.push([6, -1, k], [6, 1, k]);
    // fotograferna på huk bakom målen, ordningsvakterna (gula västar) vända mot publiken och bollkallarna i hörnen
    for (const sida of [-1, 1]) for (let k = 0; k < (lag ? 3 : 6); k++) ovriga.push([7, sida, k]);
    const VAKTER = [[-3.4, -4.12], [-2.0, -4.12], [2.0, -4.12], [3.4, -4.12], [-6.08, -1.7], [-6.08, 1.3], [6.08, -1.7], [6.08, 1.3]];
    for (let k = 0; k < (lag ? 4 : VAKTER.length); k++) ovriga.push([8, 1, k]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ovriga.push([9, sx, sz]);
    ovriga.push([10, 1, 0]);                                                                   // capon
    const ovrigPos = (o, t) => {
      const [roll, sida, k = 0] = o;
      if (roll === 2) { const kk = 0.8 + 0.2 * Math.sin(t * 0.3); return [klamp(B.x - kk, -5.4, 5.4), klamp(B.z + 0.85 * kk, -3.5, 3.5)]; }
      if (roll === 4) return [sida < 0 ? klamp(B.x, -PL + 0.3, 0.25) : klamp(B.x, -0.25, PL - 0.3), sida * (PB + 0.07)];
      if (roll === 5) return [sida * 0.62 + 0.06 * Math.sin(t * 0.4 + sida), -(PB + 0.13)];
      if (roll === 7) { const zs = [-2.05, 2.05, -1.55, 1.55, -1.05, 1.05]; return [sida * (PL + 0.32 + (k % 2) * 0.07), zs[k]]; }
      if (roll === 8) return VAKTER[k];
      if (roll === 9) return [sida * (PL + 0.22), k * (PB + 0.22)];
      if (roll === 10) return [0.05 * Math.sin(t * 0.5), -(PB + 0.66)];
      return [sida * (4.05 + 0.32 * k) + 0.45 * Math.sin(t * (0.38 + 0.05 * k) + k * 2.1), -(PB + 0.56 + 0.05 * k)];
    };
    const ovrigState = ovriga.map(() => ({ x: 0, z: 0, steg: rnd(), spegel: 1, init: false }));
    const N = spelare.length + ovriga.length + 1;
    const aSpel = new Float32Array(N * 4);
    spelare.forEach((p, i) => aSpel.set([p.nr, p.lag, p.gk ? 0 : 1, p.fro], i * 4));
    ovriga.forEach((o, i) => aSpel.set([o[2] || 0, o[0] === 5 || o[0] === 6 ? (o[1] < 0 ? 0 : 1) : 2, o[0], rnd()], (spelare.length + i) * 4));
    aSpel.set([0, 2, 3, 0], (N - 1) * 4);
    const sk = new THREE.Color(), cl = (hex, k = 1) => sk.set(hex).clone().multiplyScalar(k);
    const geo = s.stada(new THREE.PlaneGeometry(1, 1));
    geo.setAttribute('aSpel', new THREE.InstancedBufferAttribute(aSpel, 4));
    const dyn = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); dyn.setUsage(THREE.DynamicDrawUsage);
    const rot = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); rot.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDyn', dyn); geo.setAttribute('aRot', rot);
    const mesh = new THREE.InstancedMesh(geo, null, N);
    const atlas = canvas(SPELBILDER * 128, 256, ritaSpelare, { srgb: false, premult: true });
    mesh.material = s.stada(new THREE.ShaderMaterial({
      uniforms: {
        uDis: dis, uDisFarg: disFarg, uAtlas: { value: atlas }, uA2C: a2c,
        uBla: { value: cl(IFK_BLA, 1.2) }, uVit: { value: cl(IFK_VIT, 0.95) }, uByxIFK: { value: cl('#13336a') },
        uGast: { value: cl('#e2672f') }, uGastByx: { value: cl('#1c2129') }, uMv1: { value: cl('#f2d14b') }, uMv2: { value: cl('#7a63e0') },
        uDomare: { value: cl('#1a1e24') }, uHudL: { value: cl('#e6b592') }, uHudM: { value: cl('#7a4e34') },
        uLedare: { value: cl('#22344a') }, uVastIFK: { value: cl('#c6ff3d') }, uVastGast: { value: cl('#5fd3ff') },
        uFoto: { value: cl('#2c3139') }, uVakt: { value: cl('#e6ff3a') }, uKalle: { value: cl('#27c4d6') },
      },
      vertexShader: `
        uniform vec3 uBla, uByxIFK, uGast, uGastByx, uMv1, uMv2, uDomare, uHudL, uHudM, uLedare, uVastIFK, uVastGast, uFoto, uVakt, uKalle;
        ${DIS_VS}
        attribute vec4 aSpel;   // nummer, lag (0 IFK, 1 gästerna, 2 neutral), roll (0 målvakt, 1 utespelare, 2 domare, 3 boll, 4 linjedomare, 5 ledare, 6 avbytare, 7 fotograf, 8 vakt, 9 bollkalle), slump
        attribute vec4 aDyn;    // x, z, lyft (bollen: höjd), (bild + 1) × riktning
        attribute float aRot;   // bollens rotation
        varying vec2 vUv; varying float vLx; varying vec3 vTroja; varying vec3 vByxor; varying vec3 vHud; varying float vRandig;
        void main() {
          float lag = aSpel.y, roll = aSpel.z;
          float bild = abs( aDyn.w ) - 1.0, spegel = aDyn.w < 0.0 ? -1.0 : 1.0;
          bool ar = roll > 2.5 && roll < 3.5;
          float b = ar ? 0.055 : 0.175, h = ar ? 0.055 : 0.35;
          vec3 pos = vec3( aDyn.x, ar ? aDyn.z : 0.0, aDyn.y );
          vec3 till = cameraPosition - pos; till.y = 0.0; till = normalize( till + vec3( 1e-4, 0.0, 0.0 ) );
          vec3 hoger = vec3( till.z, 0.0, -till.x );
          vec3 p = pos + hoger * position.x * b + vec3( 0.0, ( position.y + 0.5 ) * h - ( ar ? 0.0 : h * 0.075 ) + ( ar ? 0.0 : aDyn.z ), 0.0 );
          float u = spegel > 0.0 ? uv.x : 1.0 - uv.x;
          vec2 lu = vec2( u, uv.y );
          if ( ar ) { vec2 c = lu - 0.5; float cr = cos( aRot ), sr = sin( aRot ); lu = vec2( cr * c.x - sr * c.y, sr * c.x + cr * c.y ) * 0.98 + 0.5; lu.y = 0.25 + lu.y * 0.5; }
          vUv = vec2( ( bild + clamp( lu.x, 0.0, 1.0 ) ) / ${SPELBILDER}.0, lu.y ); vLx = uv.x;
          vRandig = lag < 0.5 && roll > 0.5 && roll < 1.5 ? 1.0 : 0.0;
          vec3 lagTroja = lag < 0.5 ? ( roll < 0.5 ? uMv1 : uBla ) : ( roll < 0.5 ? uMv2 : uGast );
          vTroja = ar ? vec3( 0.95 ) : roll > 9.5 ? uBla * 0.85 : roll > 8.5 ? uKalle : roll > 7.5 ? uVakt : roll > 6.5 ? uFoto : lag > 1.5 ? uDomare : roll > 5.5 ? ( lag < 0.5 ? uVastIFK : uVastGast ) : roll > 4.5 ? uLedare : lagTroja;
          vByxor = roll > 9.5 ? vec3( 0.06, 0.07, 0.09 ) : roll > 8.5 ? uByxIFK : roll > 6.5 ? vec3( 0.07, 0.08, 0.1 ) : lag > 1.5 ? uDomare : roll > 4.5 && roll < 5.5 ? uLedare * 0.6 : lag < 0.5 ? uByxIFK : uGastByx;
          vHud = mix( uHudL, uHudM, step( 0.7, fract( aSpel.w * 13.1 ) ) * 0.85 );
          vec4 mv = viewMatrix * vec4( p, 1.0 );
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform float uA2C; uniform vec3 uBla, uVit, uDisFarg;
        varying vec2 vUv; varying float vLx; varying vec3 vTroja; varying vec3 vByxor; varying vec3 vHud; varying float vRandig; varying float vDis;
        ${TACK_FS}
        void main() {
          vec4 m = texture2D( uAtlas, vUv );
          // mörk kontur runt figuren: täckningen hos grannarna (figuren läses mot gräset även när den är liten)
          vec2 d = vec2( 1.6 / ${SPELBILDER * 128}.0, 1.6 / 256.0 );
          float o = max( max( texture2D( uAtlas, vUv + vec2( d.x, 0.0 ) ).a, texture2D( uAtlas, vUv - vec2( d.x, 0.0 ) ).a ), max( texture2D( uAtlas, vUv + vec2( 0.0, d.y ) ).a, texture2D( uAtlas, vUv - vec2( 0.0, d.y ) ).a ) );
          float a = tackning( m.a, uA2C ), ak = tackning( o, uA2C ) * 0.85;
          if ( max( a, ak ) < 0.01 ) discard;
          float st = rand( vLx * 4.0 + 0.1 );
          vec3 troja = vRandig > 0.5 ? mix( uBla, uVit, st ) : vTroja;
          vec3 col = ( m.r * troja + m.g * vHud + m.b * vByxor ) / max( m.a, 0.3 ) * 1.05;
          col = mix( vec3( 0.012, 0.03, 0.02 ), col, a );
          gl_FragColor = vec4( mix( col, uDisFarg, vDis ), max( a, ak ) );
        }`,
    }));
    mesh.material.alphaToCoverage = true;
    mesh.frustumCulled = false; mesh.name = 'spelare';
    // skuggorna: fyra mjuka ellipser per figur (en per strålkastarbank), bollens blir mindre när den är i luften
    const sGeo = s.stada(new THREE.PlaneGeometry(1, 1));
    const sK = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) sK[i] = i % 4;
    sGeo.setAttribute('aK', new THREE.InstancedBufferAttribute(sK, 1));
    const sDyn = new THREE.InstancedBufferAttribute(new Float32Array(N * 4 * 4), 4); sDyn.setUsage(THREE.DynamicDrawUsage);
    sGeo.setAttribute('aDyn', sDyn);
    const skuggor = new THREE.InstancedMesh(sGeo, null, N * 4);
    skuggor.material = s.stada(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute float aK; attribute vec4 aDyn;   // x, z, längd, styrka
        varying vec2 vUv; varying float vStyrka;
        void main() {
          float l = aDyn.z, w = l * 0.28; vStyrka = aDyn.w;
          float vink = 0.62 + aK * 1.5708; vec2 dir = vec2( cos( vink ), sin( vink ) );
          vec2 c = aDyn.xy + dir * l * 0.42;
          vec2 q = c + dir * position.x * l + vec2( -dir.y, dir.x ) * position.y * w * 2.0;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4( q.x, 0.004, q.y, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv; varying float vStyrka;
        void main() { float d = length( ( vUv - 0.5 ) * 2.0 ); float a = ( 1.0 - smoothstep( 0.35, 1.0, d ) ) * vStyrka; if ( a < 0.004 ) discard; gl_FragColor = vec4( 0.0, 0.015, 0.0, a ); }`,
    }));
    skuggor.frustumCulled = false; skuggor.name = 'spelarskuggor'; skuggor.renderOrder = 1;
    // bollens spår: ett tunt additivt band bakom bollen när den går fort (skott, långa bollar)
    const sparA = { value: new V3() }, sparB = { value: new V3() }, sparS = { value: 0 };
    const spar = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(1, 1)), s.stada(new THREE.ShaderMaterial({
      uniforms: { uA: sparA, uB: sparB, uS: sparS },
      transparent: true, depthWrite: false, ...ADD(THREE),
      vertexShader: `
        uniform vec3 uA, uB; varying vec2 vUv;
        void main() {
          vec3 dir = uB - uA;
          vec3 sida = normalize( cross( dir + vec3( 1e-4, 0.0, 0.0 ), cameraPosition - uB ) ) * 0.011;
          vec3 p = mix( uA, uB, position.x + 0.5 ) + sida * position.y * ( 0.25 + 0.75 * ( position.x + 0.5 ) );
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
        }`,
      fragmentShader: `uniform float uS; varying vec2 vUv;
        void main() { float a = uS * vUv.x * vUv.x * ( 1.0 - abs( vUv.y - 0.5 ) * 2.0 ); if ( a < 0.003 ) discard; gl_FragColor = vec4( vec3( 1.6, 1.7, 1.8 ) * a, a ); }`,
    })));
    spar.frustumCulled = false; spar.name = 'bollspar'; spar.renderOrder = 2;
    arena.add(skuggor, mesh, spar);
    // fotografernas blixtar: en och annan – skurar när det skjuts mot deras mål och när målet firas
    const fotoI = ovriga.map((o, i) => (o[0] === 7 ? i : -1)).filter((i) => i >= 0);
    const bGeo = s.stada(new THREE.PlaneGeometry(1, 1));
    const bDyn = new THREE.InstancedBufferAttribute(new Float32Array(fotoI.length * 4), 4); bDyn.setUsage(THREE.DynamicDrawUsage);
    bGeo.setAttribute('aB', bDyn);
    const blixtar = new THREE.InstancedMesh(bGeo, null, fotoI.length);
    blixtar.material = s.stada(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, ...ADD(THREE),
      vertexShader: `attribute vec4 aB; varying vec2 vUv; varying float vS;
        void main() {
          vS = aB.w; vec3 c = aB.xyz;
          vec3 till = normalize( cameraPosition - c ); vec3 hh = normalize( cross( vec3( 0.0, 1.0, 0.0 ), till ) ); vec3 uu = cross( till, hh );
          float sz = 0.11 * step( 0.01, vS ); vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4( c + ( hh * position.x + uu * position.y ) * sz, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv; varying float vS;
        void main() { float d = length( ( vUv - 0.5 ) * 2.0 ); float a = ( exp( -d * d * 18.0 ) + exp( -d * d * 4.0 ) * 0.3 ) * vS; if ( a < 0.004 ) discard; gl_FragColor = vec4( vec3( 3.4, 3.6, 4.2 ) * a, a ); }`,
    }));
    blixtar.frustumCulled = false; blixtar.name = 'blixtar';
    arena.add(blixtar);
    const blixt = fotoI.map(() => 0);
    // spindelkameran: fyra vajrar från taket (bortre långsidan) och från höga master på närsidan (utanför bild) till kameran
    const ankare = [[-(X0 + 0.5), Y_TAKUNDER - 0.04, -(Z0 + 1.7)], [X0 + 0.5, Y_TAKUNDER - 0.04, -(Z0 + 1.7)], [-(X0 + 1.4), 4.4, Z0 + 3.6], [X0 + 1.4, 4.4, Z0 + 3.6]];
    const vajerPos = new Float32Array(8 * 3);
    const vajerGeo = s.stada(new THREE.BufferGeometry()); vajerGeo.setAttribute('position', new THREE.BufferAttribute(vajerPos, 3));
    const vajrar = new THREE.LineSegments(vajerGeo, s.stada(new THREE.LineBasicMaterial({ color: 0xa9b6c4, transparent: true, opacity: 0.32, depthWrite: false })));
    vajrar.frustumCulled = false; vajrar.name = 'spindelvajrar';
    const spindel = new THREE.Mesh(s.stada(new THREE.BoxGeometry(0.075, 0.05, 0.075)), metall({ color: 0x1b2129, roughness: 0.45, metalness: 0.5 }));
    const lins = new THREE.Mesh(s.stada(new THREE.CylinderGeometry(0.014, 0.018, 0.03, 12)), metall({ color: 0x0b0f14, roughness: 0.2, metalness: 0.7 }));
    lins.position.set(0, -0.035, 0.012); spindel.add(lins);
    const tally = new THREE.Sprite(s.stada(new THREE.SpriteMaterial({ color: 0xff2a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    tally.scale.set(0.035, 0.035, 1); tally.position.set(0.03, 0.03, 0.03); spindel.add(tally);
    spindel.name = 'spindelkamera'; spindel.position.set(0, 1.3, 0.6);
    arena.add(vajrar, spindel);
    // stillbilden (reducerad rörelse): IFK jublar i hörnet, bollen i nätet
    const stillbild = (t) => {
      spelare.forEach((p) => { const f = form(p); if (p.lag === 0 && !p.gk) { const v = p.fro * 6.2832, rr = 0.1 + 0.28 * fr(p.fro * 7.3); p.x = 4.55 + rr * Math.cos(v); p.z = -2.72 + rr * Math.sin(v) * 0.7; } else { p.x = f[0] * 0.92; p.z = f[1]; } p.vx = p.vz = 0; });
      Object.assign(B, { lage: 'nat', x: PL + 0.13, z: -0.1, y: 0.02 }); Object.assign(S, { fas: 'mal', fasT: 2, malLag: 0 }); malUni.value.set(t - 2.6, 0);
    };
    // varje bild: simulera, skriv plats, bild och riktning per figur (samma till skuggorna), bollen och spåret
    const D = dyn.array, SD = sDyn.array, R = rot.array;
    let forraB = [0, 0, 0];
    spelUppdatera = (t, lugn) => {
      tidNu = t;
      const dtR = lugn || sistaT == null ? 0 : klamp(t - sistaT, 0, 0.25);
      if (lugn) { if (S.fas !== 'mal' || S.fasT !== 2) stillbild(t); }
      else { let dt = dtR; while (dt > 1e-4) { const h = Math.min(dt, 1 / 30); steg(h); dt -= h; } }
      sistaT = t;
      const skriv = (k, x, z, lyft, bild, spegel, sl, st) => {
        D[k * 4] = x; D[k * 4 + 1] = z; D[k * 4 + 2] = lyft; D[k * 4 + 3] = (bild + 1) * spegel;
        for (let j = 0; j < 4; j++) { const o = (k * 4 + j) * 4; SD[o] = x; SD[o + 1] = z; SD[o + 2] = sl; SD[o + 3] = st; }
      };
      const dt0 = dtR;
      spelare.forEach((p, k) => {
        const fart = Math.hypot(p.vx, p.vz);
        if (Math.abs(p.vx) > 0.04) p.spegel = p.vx < 0 ? -1 : 1; else if (fart < 0.03) p.spegel = B.x < p.x ? -1 : 1;
        p.steg += dt0 * (1.3 + fart * 3.4);
        let bild = fart > 0.05 ? Math.floor(fr(p.steg) * 8) : p.gk && Math.abs(B.x - p.x) < 4 ? 11 : 8; let lyft = 0;
        if (p.hand === 'skott') bild = 9;
        else if (p.hand === 'glid') bild = 16;
        else if (p.hand === 'dyk') { bild = 17; lyft = 0.02; p.spegel = rikt(p.lag); }
        else if (p.hand === 'nick') { bild = 18; lyft = 0.05 * Math.sin(Math.PI * klamp(1 - p.handT / 0.42)); }
        else if (p.hand === 'hall' || (B.agare === p && p.gk)) bild = 19;
        if (S.fas === 'mal' && p.lag === S.malLag && !p.gk && fart < 0.22 && p.hand !== 'glid') { bild = fr(tidNu * 1.3 + p.fro) < 0.55 ? 10 : 15; lyft = 0.022 * Math.abs(Math.sin(tidNu * 6.5 + p.fro * 6)); }
        if (S.fas === 'mal' && p.lag === S.malLag && p.gk) { bild = 10; lyft = 0.016 * Math.abs(Math.sin(tidNu * 6)); }
        skriv(k, p.x, p.z, lyft, bild, p.spegel, 0.15, 0.24);
      });
      ovriga.forEach((o, i) => {
        const st = ovrigState[i]; const m = ovrigPos(o, t); const k = spelare.length + i;
        if (!st.init) { st.x = m[0]; st.z = m[1]; st.init = true; }
        const k8 = 1 - Math.pow(0.0067, dt0); const nx = mx(st.x, m[0], k8), nz = mx(st.z, m[1], k8);
        const vx = dt0 > 0 ? (nx - st.x) / dt0 : 0; const fart = dt0 > 0 ? Math.hypot(nx - st.x, nz - st.z) / dt0 : 0; st.x = nx; st.z = nz;
        if (Math.abs(vx) > 0.04) st.spegel = vx < 0 ? -1 : 1;
        st.steg += dt0 * (1.3 + fart * 3.4);
        let bild = fart > 0.05 ? Math.floor(fr(st.steg) * 8) : 8;
        if (o[0] === 5) { st.spegel = -o[1]; bild = S.fas === 'mal' && (o[1] < 0 ? 0 : 1) === S.malLag ? 10 : fr(t * 0.13 + i * 0.3) < 0.22 ? 12 : 14; }
        else if (o[0] === 7) { st.spegel = -o[1]; bild = 11; }                                       // fotografen på huk med kameran
        else if (o[0] === 8) { st.spegel = fr(t * 0.07 + i * 0.37) < 0.5 ? 1 : -1; bild = 8; }      // vakten vänder sig ibland mot spelet
        else if (o[0] === 9) { st.spegel = -o[1]; bild = S.fas === 'mal' && rikt(S.malLag) === o[1] ? 10 : 8; }
        else if (o[0] === 10) { const slag = fr(t * 1.05); bild = S.fas === 'mal' ? (slag < 0.5 ? 10 : 15) : slag < 0.25 ? 10 : slag < 0.5 ? 12 : slag < 0.75 ? 15 : 12; st.spegel = fr(t * 0.13) < 0.5 ? 1 : -1; }
        else if (o[0] === 2 && fart < 0.05 && fr(t * 0.11 + 0.3) < 0.16) bild = 12;
        const lyftO = o[0] === 10 ? 0.06 + 0.012 * Math.abs(Math.sin(t * Math.PI * 1.05)) : o[0] === 5 && bild === 10 ? 0.015 * Math.abs(Math.sin(t * 6)) : 0;
        skriv(k, st.x, st.z, lyftO, bild, st.spegel, o[0] === 10 ? 0 : 0.15, o[0] === 10 ? 0 : 0.24);
      });
      fotoI.forEach((i, j) => {
        const o = ovriga[i], st = ovrigState[i];
        const motMal = (B.lage === 'skott' && Math.sign(B.till[0]) === o[1]) || (S.fas === 'mal' && S.fasT < 4.5 && rikt(S.malLag) === o[1]);
        blixt[j] = Math.max(0, blixt[j] - dtR * 16);
        if (!lugn && rnd() < (motMal ? 5 : 0.18) * dtR) blixt[j] = 1;
        bDyn.array.set([st.x - o[1] * 0.03, 0.085, st.z, blixt[j]], j * 4);
      });
      bDyn.needsUpdate = true;
      // spindelkameran glider efter bollen (lite framför, mjukt), vajrarna följer med, lampan blinkar
      const ks = dtR > 0 ? 1 - Math.pow(0.35, dtR) : 0;
      spindel.position.x += (B.x * 0.78 - spindel.position.x) * ks;
      spindel.position.z += (B.z * 0.55 + 0.55 - spindel.position.z) * ks;
      spindel.position.y = 1.28 + 0.08 * Math.sin(t * 0.37);
      spindel.rotation.y = Math.atan2(B.x - spindel.position.x, B.z - spindel.position.z) * 0.25;
      ankare.forEach((a, i) => vajerPos.set([a[0], a[1], a[2], spindel.position.x, spindel.position.y + 0.025, spindel.position.z], i * 6));
      vajerGeo.attributes.position.needsUpdate = true;
      tally.material.opacity = fr(t * 0.9) < 0.55 ? 1 : 0.15;
      skriv(N - 1, B.x, B.z, B.y, 13, 1, 0.035 + B.y * 0.4, 0.3 * klamp(1 - B.y * 4));
      R[N - 1] = B.rot;
      dyn.needsUpdate = true; sDyn.needsUpdate = true; rot.needsUpdate = true;
      sparA.value.set(forraB[0], forraB[2] + 0.02, forraB[1]); sparB.value.set(B.x, B.y + 0.02, B.z);
      sparS.value = ss(0.035, 0.07, Math.hypot(B.x - forraB[0], B.z - forraB[1], B.y - forraB[2])) * 0.55;
      forraB = [mx(forraB[0], B.x, 0.35), mx(forraB[1], B.z, 0.35), mx(forraB[2], B.y, 0.35)];
    };
    spelUppdatera(0, false); sistaT = null;
    // för felsökning: läget och ett mål på beställning (firandet kan provas utan att vänta på slumpen)
    arena.userData.match = { S, B, mal: () => { natTraff.value.set(PL + 0.2, 0.1, -0.1); Object.assign(B, { lage: 'nat', agare: null, x: PL + 0.13, z: -0.1, y: 0.02 }); Object.assign(S, { fas: 'mal', fasT: 0, malLag: 0, sedanMal: 0, missar: 0 }); malUni.value.set(tidNu, 0); } };
  }
  // avbytarbåsen bakom ledarna (bortre långsidan, mellan sidlinjen och skyltarna): mörk bakvägg och sidor, bänk i lagets färg, plexitak
  {
    const bas = samlare(THREE), tak = samlare(THREE); const m4 = new THREE.Matrix4();
    const lada = (sam, cx, cy, cz, bx, by, bz, farg) => { m4.makeTranslation(cx, cy, cz); leggTill(THREE, sam, new THREE.BoxGeometry(bx, by, bz), m4, farg); };
    for (const sx of [-1, 1]) {
      const cx = sx * 0.66, z0 = -(PB + 0.2), z1 = -(PB + 0.38), zm = (z0 + z1) / 2, dz = z0 - z1;
      const vagg = lin(0x16202c), bank = lin(sx < 0 ? IFK_BLA : 0xc4562a, 0.9);
      lada(bas, cx, 0.09, z1, 0.56, 0.18, 0.012, vagg);
      lada(bas, cx - 0.28, 0.09, zm, 0.012, 0.18, dz, vagg); lada(bas, cx + 0.28, 0.09, zm, 0.012, 0.18, dz, vagg);
      lada(bas, cx, 0.032, z1 + 0.045, 0.54, 0.016, 0.055, bank); lada(bas, cx, 0.06, z1 + 0.018, 0.54, 0.055, 0.01, bank);
      lada(tak, cx, 0.186, zm + 0.01, 0.58, 0.008, dz + 0.05, lin(0xcfe6ff));
    }
    lada(bas, 0, 0.03, -(PB + 0.66), 0.2, 0.06, 0.12, lin(0x1b2532));   // capons pall framför klacken
    const basMesh = new THREE.Mesh(s.stada(bas.geometri()), metall({ vertexColors: true, roughness: 0.62, metalness: 0.05 }));
    basMesh.castShadow = true;
    const takMesh = new THREE.Mesh(s.stada(tak.geometri()), s.stada(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.32, roughness: 0.12, metalness: 0.1, depthWrite: false })));
    basMesh.name = 'avbytarbas'; takMesh.name = 'avbytartak';
    arena.add(basMesh, takMesh);
  }
  // tifon över bortre långsidans undre ring – hålls upp av publiken och böljar svagt
  {
    const NX = lag ? 32 : 56, NY = lag ? 10 : 16;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const sv = j / NY, x = -TIFO_B / 2 + (i / NX) * TIFO_B;
      const d = 0.05 + sv * (D_NED - 0.1);
      const y = NED_Y + (d / DEP) * NED_H + 0.15;
      pos.push(x, y, -(Z0 + d)); uv.push(i / NX, sv);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, e = c + 1; idx.push(a, b, e, a, e, c); }
    const geo = s.stada(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeBoundingSphere();
    const lut = Math.atan2(NED_H, DEP);
    const tex = s.canvasTextur(2048, 768, ritaTifo);
    const mat = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uDis: dis, uDisFarg: disFarg, uKarta: { value: tex }, uNorm: { value: new V3(0, Math.cos(lut), Math.sin(lut)) }, uLjus: { value: 0.95 } },
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTid; uniform vec3 uNorm;
        ${DIS_VS}
        varying vec2 vUv; varying float vSken;
        void main() {
          vec3 p = position; float x = p.x; float sv = uv.y;
          float a1 = x * 2.1 + uTid * 0.95 + sv * 2.6, a2 = x * 5.3 - uTid * 1.55 + sv * 5.0, a3 = sv * 9.0 + x * 0.7 - uTid * 0.7;
          float hh = 0.024 * sin( a1 ) + 0.009 * sin( a2 ) + 0.006 * sin( a3 );
          float dx = 0.024 * 2.1 * cos( a1 ) + 0.009 * 5.3 * cos( a2 ) + 0.006 * 0.7 * cos( a3 );
          float ds = 0.024 * 2.6 * cos( a1 ) + 0.009 * 5.0 * cos( a2 ) + 0.006 * 9.0 * cos( a3 );
          p += uNorm * hh;
          vSken = 0.86 + clamp( -dx * 2.2 + ds * 0.9, -0.38, 0.38 );
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uKarta; uniform vec3 uDisFarg; uniform float uLjus; varying vec2 vUv; varying float vSken; varying float vDis;
        void main() { vec3 col = texture2D( uKarta, vUv ).rgb * vSken * uLjus; gl_FragColor = vec4( mix( col, uDisFarg, vDis ), 1.0 ); }`,
    }));
    const tifo = new THREE.Mesh(geo, mat); tifo.name = 'tifo';
    arena.add(tifo);
  }
  // blåvitt pappersregn från övre ringens framkant (bortre långsidan), var 30:e sekund
  if (!lag) {
    const N = Math.round(620 * mangd);
    const geo = s.stada(new THREE.PlaneGeometry(1, 1));
    const aK = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) aK.set([(r() - 0.5) * 9.6, -(Z0 + D_FASAD - 0.04 - r() * 0.18), r(), Y_FASAD + 0.06 + r() * 0.65], i * 4);
    geo.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4));
    const mesh = new THREE.InstancedMesh(geo, null, N);
    mesh.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uMal: malUni, uDis: dis, uDisFarg: disFarg, uBla: { value: new THREE.Color(IFK_BLA).multiplyScalar(1.6) }, uVit: { value: new THREE.Color(0xffffff).multiplyScalar(1.15) } },
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTid; uniform vec2 uMal;
        ${DIS_VS}
        attribute vec4 aK;   // x, z, fas, starthöjd
        varying float vVit; varying float vSken;
        void main() {
          float cyk = ( uTid - uMal.x - 0.4 ) * ( 1.0 - uMal.y ) - uMal.y * 99.0;   // när IFK:s mål firas
          float f = cyk - aK.z * 2.4;
          float y = aK.w - f * ( 0.15 + 0.07 * fract( aK.z * 7.13 ) );
          float lever = step( 0.0, f ) * step( f, 9.0 ) * step( 0.06, y );
          vec3 c = vec3( aK.x + 0.08 * sin( f * 1.6 + aK.z * 40.0 ), y, aK.y + f * 0.055 );
          float spinn = f * ( 4.0 + 4.0 * fract( aK.z * 13.7 ) ) + aK.z * 31.0;
          vec3 till = normalize( cameraPosition - c );
          vec3 hh = normalize( cross( vec3( 0.0, 1.0, 0.0 ), till ) ); vec3 uu = cross( till, hh );
          float s = 0.026 * lever;
          vec3 p = c + ( hh * position.x * cos( spinn ) + uu * position.y ) * s;
          vVit = step( 0.45, fract( aK.z * 91.7 ) );
          vSken = 0.55 + 0.6 * abs( cos( spinn ) );
          vec4 mv = viewMatrix * vec4( p, 1.0 );
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uBla, uVit, uDisFarg; varying float vVit; varying float vSken; varying float vDis;
        void main() { vec3 col = mix( uBla, uVit, vVit ) * vSken; gl_FragColor = vec4( mix( col, uDisFarg, vDis ), 1.0 ); }`,
    }));
    mesh.frustumCulled = false; mesh.name = 'pappersregn';
    arena.add(mesh);
  }
  // bengaler och rök i IFK-klacken bredvid tifon (bortre långsidan) när målet firas: glöden är additiv (blommar i glöden), röken mjuka
  // puffar som stiger, växer och driver ut över planen. Allt i shadern ur uTid (matchklockan som spelarna, +22 s).
  if (!lag) {
    const NF = 9, NR = Math.round(34 * mangd);
    const fl = [];
    for (let i = 0; i < NF; i++) {
      const k = i % 3;
      fl.push([TIFO_B / 2 + 0.3 + (i / (NF - 1)) * 1.8 + (r() - 0.5) * 0.1, NED_Y + k * NED_H + 0.27, -(Z0 + DEP * (k + 0.5)), r()]);   // hålls upp ovanför huvudena
    }
    const TID_GLSL = `
      uniform vec2 uMal;
      float sedanMal( float t ) { return ( t - uMal.x ) - uMal.y * 99.0; }   // sekunder sedan IFK:s senaste mål
      float aktiv( float sm, float fas ) { return smoothstep( 0.4 + fas * 0.9, 1.0 + fas * 0.9, sm ) * ( 1.0 - smoothstep( 8.0, 10.0, sm ) ); }`;
    // glöden
    const gGeo = s.stada(new THREE.PlaneGeometry(1, 1));
    const aF = new Float32Array(NF * 4); fl.forEach((f, i) => aF.set(f, i * 4));
    gGeo.setAttribute('aF', new THREE.InstancedBufferAttribute(aF, 4));
    const glod = new THREE.InstancedMesh(gGeo, null, NF);
    glod.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uMal: malUni },
      transparent: true, depthWrite: false, ...ADD(THREE),
      vertexShader: `
        uniform float uTid; attribute vec4 aF; varying vec2 vUv; varying float vStyrka;
        ${TID_GLSL}
        void main() {
          float t = uTid; float sm = sedanMal( t );
          float fl = 0.72 + 0.16 * sin( t * 31.0 + aF.w * 20.0 ) + 0.12 * sin( t * 17.3 + aF.w * 9.0 );
          vStyrka = aktiv( sm, aF.w ) * fl;
          vec3 c = aF.xyz;
          vec3 till = normalize( cameraPosition - c ); vec3 hh = normalize( cross( vec3( 0.0, 1.0, 0.0 ), till ) ); vec3 uu = cross( till, hh );
          float sz = 0.19 * ( 0.85 + 0.3 * fl ) * step( 0.001, vStyrka );
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4( c + ( hh * position.x + uu * position.y ) * sz, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv; varying float vStyrka;
        void main() {
          float d = length( ( vUv - 0.5 ) * 2.0 ); float k = exp( -d * d * 14.0 ), g = exp( -d * d * 3.6 ) * 0.75;
          float a = ( k + g ) * vStyrka; if ( a < 0.004 ) discard;
          gl_FragColor = vec4( mix( vec3( 3.6, 0.55, 0.38 ), vec3( 4.4, 3.2, 2.1 ), k * k ) * a, a );
        }`,
    }));
    glod.frustumCulled = false; glod.name = 'bengaler';
    // röken
    const rGeo = s.stada(new THREE.PlaneGeometry(1, 1));
    const aR = new Float32Array(NF * NR * 4);
    for (let i = 0; i < NF; i++) for (let j = 0; j < NR; j++) aR.set([fl[i][0], fl[i][1], fl[i][2], fl[i][3] * 0.999 + j / NR], (i * NR + j) * 4);
    rGeo.setAttribute('aR', new THREE.InstancedBufferAttribute(aR, 4));
    const rok = new THREE.InstancedMesh(rGeo, null, NF * NR);
    rok.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uMal: malUni, uDis: dis, uDisFarg: disFarg },
      transparent: true, depthWrite: false,
      vertexShader: `
        uniform float uTid; attribute vec4 aR; varying vec2 vUv; varying float vA; varying vec3 vFarg; varying float vFro;
        ${DIS_VS}
        ${TID_GLSL}
        void main() {
          float t = uTid; float sm = sedanMal( t ); const float E = 3.2;
          float fas = fract( aR.w ); float alder = fract( sm / E + fas ) * E;   // varje puff föds om var 3,2 s
          float fodd = sm - alder;
          float lever = step( 0.5, fodd ) * step( fodd, 9.0 );
          float fl = floor( aR.w ) ;
          vec3 c = aR.xyz + vec3( sin( alder * 1.3 + fas * 40.0 ) * 0.03, alder * 0.12, alder * 0.075 + alder * alder * 0.012 );
          float sz = ( 0.09 + alder * 0.13 ) * lever;
          vec3 till = normalize( cameraPosition - c ); vec3 hh = normalize( cross( vec3( 0.0, 1.0, 0.0 ), till ) ); vec3 uu = cross( till, hh );
          float vr = fas * 6.2832 + alder * 0.4;
          vec2 q = vec2( cos( vr ) * position.x - sin( vr ) * position.y, sin( vr ) * position.x + cos( vr ) * position.y );
          vA = 0.42 * ( 1.0 - alder / E ) * smoothstep( 0.0, 0.35, alder ) * lever;
          vFarg = mix( vec3( 1.25, 0.42, 0.34 ), vec3( 0.46, 0.44, 0.48 ), smoothstep( 0.0, 1.2, alder ) );
          vFro = fas; vUv = uv;
          vec4 mv = viewMatrix * vec4( c + ( hh * q.x + uu * q.y ) * sz, 1.0 );
          ${DIS_BER}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uDisFarg; varying vec2 vUv; varying float vA; varying vec3 vFarg; varying float vFro; varying float vDis;
        void main() {
          vec2 p = ( vUv - 0.5 ) * 2.0; float d = length( p );
          float moln = 0.75 + 0.25 * sin( p.x * 5.0 + vFro * 30.0 ) * sin( p.y * 4.0 - vFro * 20.0 );
          float a = ( 1.0 - smoothstep( 0.2, 1.0, d ) ) * moln * vA; if ( a < 0.004 ) discard;
          gl_FragColor = vec4( mix( vFarg, uDisFarg, vDis ), a );
        }`,
    }));
    rok.frustumCulled = false; rok.name = 'rok'; rok.renderOrder = 3;
    arena.add(rok, glod);
  }
  // mobillampor: var 80:e sekund tänds en våg av ficklampor i publiken (en efter en, vajar sakta) – sedan släcks de
  if (!lag && platser.length) {
    const NL = Math.round(560 * mangd), ph = Math.min(0.24, platser.bredd * 2.45);
    const aL = new Float32Array(NL * 4);
    for (let i = 0; i < NL; i++) { const q = platser[Math.floor(r() * platser.length)]; aL.set([q.x, q.y + ph * 1.02, q.z, r()], i * 4); }
    const geo = s.stada(new THREE.PlaneGeometry(1, 1)); geo.setAttribute('aL', new THREE.InstancedBufferAttribute(aL, 4));
    const lampor = new THREE.InstancedMesh(geo, null, NL);
    lampor.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid },
      transparent: true, depthWrite: false, ...ADD(THREE),
      vertexShader: `
        uniform float uTid; attribute vec4 aL; varying vec2 vUv; varying float vS;
        void main() {
          float c = mod( uTid - 30.0, 80.0 ) - aL.w * 3.0;
          vS = smoothstep( 0.0, 1.2, c ) * ( 1.0 - smoothstep( 13.0, 15.5, c ) ) * ( 0.75 + 0.25 * sin( uTid * 2.0 + aL.w * 40.0 ) );
          vec3 pos = aL.xyz + vec3( 0.012 * sin( uTid * 1.3 + aL.w * 20.0 ), 0.0, 0.0 );
          vec3 till = normalize( cameraPosition - pos ); vec3 hh = normalize( cross( vec3( 0.0, 1.0, 0.0 ), till ) ); vec3 uu = cross( till, hh );
          vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4( pos + ( hh * position.x + uu * position.y ) * 0.15 * step( 0.01, vS ), 1.0 );   // minst ~4 px: mindre ytor missar pixlarna helt (ingen MSAA på dator)
        }`,
      fragmentShader: `varying vec2 vUv; varying float vS;
        void main() { float d = length( ( vUv - 0.5 ) * 2.0 ); float a = ( exp( -d * d * 10.0 ) * 1.3 + exp( -d * d * 3.0 ) * 0.25 ) * vS; if ( a < 0.004 ) discard; gl_FragColor = vec4( vec3( 3.2, 3.3, 3.6 ) * a, a ); }`,   // kärnan 1–2 px, kallt LED-ljus som blommar
    }));
    lampor.frustumCulled = false; lampor.name = 'mobillampor';
    arena.add(lampor);
  }
  // fyrverkerier när IFK gör mål: raketer stiger bakom bortre läktaren och slår ut i blått, vitt och mint vid sidorna av tavlan
  if (!lag) {
    const NR = 10, NS = Math.round(110 * mangd);
    const aRak = new Float32Array(NR * (NS + 1) * 4), aDir = new Float32Array(NR * (NS + 1) * 4);
    let n = 0;
    for (let i = 0; i < NR; i++) {
      const sida = i % 2 ? 1 : -1; const x = sida * (3.7 + r() * 2.4), topp = 3.7 + r() * 1.1, start = 0.5 + i * 0.5 + r() * 0.2, farg = i % 3;
      for (let j = 0; j <= NS; j++) {
        aRak.set([x, topp, start, farg], n * 4);
        if (j === 0) aDir.set([0, 1, 0, -1], n * 4);                                   // raketen själv
        else { const u = r() * 2 - 1, v = r() * Math.PI * 2, w = Math.sqrt(1 - u * u); aDir.set([w * Math.cos(v), u, w * Math.sin(v), 0.7 + r() * 0.5], n * 4); }
        n++;
      }
    }
    const geo = s.stada(new THREE.PlaneGeometry(1, 1));
    geo.setAttribute('aRak', new THREE.InstancedBufferAttribute(aRak, 4)); geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(aDir, 4));
    const fyr = new THREE.InstancedMesh(geo, null, n);
    fyr.material = s.stada(new THREE.ShaderMaterial({
      uniforms: { uTid: tid, uMal: malUni },
      transparent: true, depthWrite: false, ...ADD(THREE),
      vertexShader: `
        uniform float uTid; uniform vec2 uMal; attribute vec4 aRak; attribute vec4 aDir; varying vec2 vUv; varying float vS; varying vec3 vFarg;
        void main() {
          float a = ( uTid - uMal.x ) - aRak.z - uMal.y * 99.0;
          vec3 bas = vec3( aRak.x * 0.92, 2.6, -8.2 ), topp = vec3( aRak.x, aRak.y, -7.9 );
          const float STIG = 1.0;
          vec3 pos; float sz;
          if ( aDir.w < 0.0 ) {   // raketen stiger och slår ut med en kort smäll (en blixt som växer och tonar bort)
            float q = clamp( a / STIG, 0.0, 1.0 ), b = a - STIG; pos = mix( bas, topp, 1.0 - ( 1.0 - q ) * ( 1.0 - q ) );
            if ( b < 0.0 ) { vS = step( 0.0, a ) * 1.2; sz = 0.1; } else { vS = ( 1.0 - smoothstep( 0.0, 0.35, b ) ) * 1.1; sz = 0.25 + b * 2.2; }
          }
          else {
            float b = a - STIG; float e = 1.0 - exp( -b * 2.4 );
            pos = topp + aDir.xyz * aDir.w * 1.5 * e - vec3( 0.0, 0.2 * b * b, 0.0 );
            vS = step( 0.0, b ) * ( 1.0 - smoothstep( 0.7, 2.1, b ) ) * ( 0.65 + 0.35 * sin( b * 34.0 + aDir.w * 60.0 ) );
            sz = 0.18 * ( 1.0 - clamp( b * 0.3, 0.0, 0.6 ) );
          }
          vFarg = aRak.w < 0.5 ? vec3( 0.55, 0.85, 2.4 ) : aRak.w < 1.5 ? vec3( 2.2, 2.25, 2.4 ) : vec3( 0.7, 2.3, 1.7 );
          vec3 till = normalize( cameraPosition - pos ); vec3 hh = normalize( cross( vec3( 0.0, 1.0, 0.0 ), till ) ); vec3 uu = cross( till, hh );
          vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4( pos + ( hh * position.x + uu * position.y ) * sz * step( 0.01, vS ), 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv; varying float vS; varying vec3 vFarg;
        void main() { float d = length( ( vUv - 0.5 ) * 2.0 ); float a = ( exp( -d * d * 14.0 ) + exp( -d * d * 3.5 ) * 0.3 ) * vS; if ( a < 0.004 ) discard; gl_FragColor = vec4( vFarg * a * 2.4, a ); }`,
    }));
    fyr.frustumCulled = false; fyr.name = 'fyrverkerier';
    arena.add(fyr);
  }
  await paus(); if (s.forstord) return null;

  /* ---- kameran: arenan ramas in i den FRIA ytan ----------------------------------------------------------------
     Hindren mäts varje gång: på dator översiktens text (hälsningen + "Börja här"-kortet i .hero3d-text) och nyckelremsan i
     nederkanten, annars hjältens egen rubrik (.ov-text). Kandidatytorna (till höger om texten, under den) prövas och den som
     ger den största resultattavlan vinner. Tavlan och planen ska rymmas; läktarna fortsätter ut över kanterna och tonas
     bort under texten. */
  const tmpKam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  const _v = new V3(), _fram = new V3(), _hoger = new V3(), _upp = new V3(), _r = new V3();
  const kamMal = new V3(0, 1.4, -1.5); let kamDist = 40, kamElev = 0.45;
  let liten = false, ramInfo = null;
  const riktning = (elev, yaw, ut = new V3()) => { ut.set(0, elev, 1).normalize(); const z = ut.z; ut.x = Math.sin(yaw) * z; ut.z = Math.cos(yaw) * z; return ut; };
  function ndcRam(punkter, mal, dist, rikt) {
    tmpKam.position.copy(mal).addScaledVector(rikt, dist); tmpKam.lookAt(mal); tmpKam.updateMatrixWorld(); tmpKam.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, bakom = false;
    for (const p of punkter) { _v.copy(p).project(tmpKam); if (_v.z > 1 || _v.z < -1) bakom = true; x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    return { x0, x1, y0, y1, bakom };
  }
  const ryms = (b) => !b.bakom && b.x0 >= -1 && b.x1 <= 1 && b.y0 >= -1 && b.y1 <= 1;
  function ramaIn(punkter, asp, rikt) {
    tmpKam.aspect = asp; tmpKam.fov = FOV;
    const mal = new V3(); punkter.forEach((p) => mal.add(p)); mal.multiplyScalar(1 / punkter.length);
    let dist = 40;
    for (let varv = 0; varv < 4; varv++) {
      let lo = 4, hi = 300;
      for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (ryms(ndcRam(punkter, mal, mid, rikt))) hi = mid; else lo = mid; }
      dist = hi;
      const b = ndcRam(punkter, mal, dist, rikt);
      _fram.copy(rikt).negate(); _hoger.crossVectors(_fram, tmpKam.up).normalize(); _upp.crossVectors(_hoger, _fram);
      const halvH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist, halvB = halvH * asp;
      mal.addScaledVector(_hoger, ((b.x0 + b.x1) / 2) * halvB * 0.92).addScaledVector(_upp, ((b.y0 + b.y1) / 2) * halvH * 0.92);
    }
    let lo = dist * 0.7, hi = dist * 1.3;
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (ryms(ndcRam(punkter, mal, mid, rikt))) hi = mid; else lo = mid; }
    return { mal, dist: hi };
  }
  function planera(reg) {
    const rw = reg.x1 - reg.x0, rh = reg.y1 - reg.y0;
    if (rw < 120 || rh < 80) return null;
    const asp = rw / rh;
    // bred yta: lägre kamera (panorama); hög yta: lite mer uppifrån så att planen får höjd
    const elev = liten ? 0.3 : klamp(0.4 - 0.08 * (asp - 1), 0.32, 0.48);
    const rikt = riktning(elev, 0);
    // Tavlan är fokus: den, bortre långsidan och planen fram till mittlinjen ska rymmas. Närmaste delen av planen får gå
    // ut under nyckelremsan och planens hörn ut över kanterna (arenan fortsätter utanför bild). Mobilbandet (lågt och
    // brett): tavlan, tifon och bortre halvan av planen.
    const pkt = [...tavlaPunkter];
    if (liten) for (const sx of [-1, 1]) pkt.push(new V3(sx * TIFO_B * 0.5, 0, -(PB + 0.42)));
    else {
      const kx = klamp(0.24 + 0.32 * asp, 0.48, 0.86), kf = klamp(0.6 + 0.2 * asp, 0.78, 0.96);
      for (const sx of [-1, 1]) pkt.push(new V3(sx * PL * kx, 0, PB * 0.15), new V3(sx * PL * kf, 0, -PB));
    }
    const q = ramaIn(pkt, asp, rikt);
    // tavlans bredd i px
    tmpKam.position.copy(q.mal).addScaledVector(rikt, q.dist); tmpKam.lookAt(q.mal); tmpKam.updateMatrixWorld(); tmpKam.aspect = asp; tmpKam.updateProjectionMatrix();
    const a = _v.copy(tavlaPunkter[0]).project(tmpKam).x, b = _r.copy(tavlaPunkter[1]).project(tmpKam).x;
    return { reg, rw, rh, elev, mal: q.mal, dist: q.dist, px: ((b - a) / 2) * rw };
  }
  /* Ramningen planeras i HJÄLTENS koordinater: duken (.ov-scen) beskärs till den yta där arenan syns – allt utanför är ändå
     helt bortmaskat – så att färre pixlar ritas och upplösningen kan hållas hög (skärpan). Arenan fortsätter in bakom texten
     och nyckelremsan och tonas in mjukt där (lång, utjämnad mask i scen-oversikt.css) i stället för att klippas vid texten.
     Beskärningen läggs i --ov-scen-v/-o/-n; när duken byter storlek ramar motorn om (samma plan → ingen slinga). */
  function rama(w, h) {
    const hj = s.vard && s.vard.closest ? s.vard.closest('[data-scen3d="oversikt"]') : null;
    liten = !!hj && hj.hasAttribute('data-ov-smal');
    const cr = s.canvas.getBoundingClientRect();
    const ref = hj ? hj.getBoundingClientRect() : cr;
    const W = hj ? Math.round(ref.width) : w, HH = hj ? Math.round(ref.height) : h;
    if (W < 2 || HH < 2) return;
    let text = null, botten = HH, overlagg = false;
    if (hj && cr.width > 2) {
      const h3 = hj.nextElementSibling && hj.nextElementSibling.classList.contains('hero3d') ? hj.nextElementSibling : null;
      const r3 = h3 ? h3.getBoundingClientRect() : null;
      overlagg = !!r3 && r3.top < ref.bottom - 60 && r3.bottom > ref.top + 60; // dator: hälsningen ligger ovanpå scenen
      const kalla = overlagg ? h3.querySelector('.hero3d-text') : hj.querySelector('.ov-text');
      if (kalla) {
        for (const x of kalla.children) {
          if (!x.offsetHeight) continue;
          const st = getComputedStyle(x); if (st.visibility === 'hidden' || st.display === 'none') continue;
          const rr = x.getBoundingClientRect(); const q = { x0: rr.left - ref.left, x1: rr.right - ref.left, y0: rr.top - ref.top, y1: rr.bottom - ref.top };
          text = text ? { x0: Math.min(text.x0, q.x0), x1: Math.max(text.x1, q.x1), y0: Math.min(text.y0, q.y0), y1: Math.max(text.y1, q.y1) } : q;
        }
      }
      if (overlagg) {
        const remsa = h3.querySelector('.nyckelremsa'); const rr = remsa && remsa.offsetHeight ? remsa.getBoundingClientRect() : null;
        if (rr && rr.top < ref.bottom && rr.top > ref.top + HH * 0.3) botten = rr.top - ref.top;
      }
    }
    const m = liten ? { v: 8, o: 8, n: 10, g: 10 } : { v: 20, o: 24, n: 18, g: 22 };
    const kand = [['hoger', { x0: (text ? text.x1 : 0) + m.g, x1: W - m.v, y0: m.o, y1: botten - m.n }]];
    if (text) kand.push(['under', { x0: m.v, x1: W - m.v, y0: text.y1 + m.g, y1: botten - m.n }]);
    let val = null;
    for (const [typ_, reg] of kand) { const p = planera(reg); if (p && (!val || p.px > val.px * 1.04)) { val = p; val.typ = typ_; } }
    if (!val) { val = planera({ x0: 0, x1: W, y0: 0, y1: HH }); if (val) val.typ = 'hel'; }
    if (!val) return;
    // toningarna (hjältens koordinater): arenan börjar synas en bit in under texten och är hel först en bit till höger om
    // den (masken är långsam i början – texten står på nästan mörk botten); nedtill tonar den ut in i nyckelremsan
    const hoger = val.typ === 'hoger' && text, under = val.typ === 'under' && text;
    let t0 = 0, t1 = 0, b0 = null, b1 = null;
    if (hoger) { t0 = Math.max(0, text.x0 + (text.x1 - text.x0) * 0.3); t1 = Math.min(W - 40, t0 + (text.x1 - t0) / 0.62); }
    else if (under) { t0 = Math.max(0, text.y1 - 36); t1 = Math.min(HH - 40, text.y1 + 46); }
    if (overlagg && botten < HH - 2) { b0 = botten - 34; b1 = Math.min(HH, botten + 52); }
    // duken beskärs: vänster (eller överkant) vid toningens början, nederkant där remsans toning slutar
    const ins = { v: hoger ? Math.floor(t0) : 0, o: under ? Math.floor(t0) : 0, n: b1 != null ? Math.max(0, Math.floor(HH - b1)) : 0 };
    // jämförs mot hjältens egen stil – vyn kan ha ritats om med en ny hjälte (då ska värdena sättas igen)
    if (hj) for (const [k, v] of [['--ov-scen-v', ins.v], ['--ov-scen-o', ins.o], ['--ov-scen-n', ins.n]]) { if (hj.style.getPropertyValue(k) !== `${v}px`) hj.style.setProperty(k, `${v}px`); }
    // dukens läge i hjälten JUST NU (den kan ha den gamla storleken tills ResizeObserver ramar om)
    const L = hj ? cr.left - ref.left : 0, T = hj ? cr.top - ref.top : 0;
    kamElev = val.elev; kamDist = val.dist; kamMal.copy(val.mal);
    riktning(kamElev, 0, _r);
    s.kamerastyr.mal.copy(kamMal); s.kamerastyr.position.copy(kamMal).addScaledVector(_r, kamDist);
    s.kamerastyr.parallax.set(kamDist * (liten ? 0.004 : 0.007), kamDist * (liten ? 0.002 : 0.004));
    s.kamerastyr.andning = kamDist * 0.0012;
    s.camera.fov = FOV; s.camera.near = Math.max(0.5, kamDist * 0.25); s.camera.far = kamDist * 3 + 60;
    s.camera.setViewOffset(val.rw, val.rh, -(val.reg.x0 - L), -(val.reg.y0 - T), w, h);
    s.camera.position.copy(s.kamerastyr.position); s.camera.lookAt(kamMal); s.camera.updateMatrixWorld();
    // diset: diskret, ökar med avståndet bortom planen
    s.scene.fog.near = kamDist * 0.9; s.scene.fog.far = kamDist * 3.4; dis.value.set(s.scene.fog.near, s.scene.fog.far, 1);
    // LED-skärmens diodmönster: en diod ≈ 3 enhetspixlar (aldrig finare än skärmen kan visa – ingen moaré)
    const pr = s.renderer.getPixelRatio() || 1;
    const celler = klamp(Math.round((val.px * pr) / 3.1), 64, 520);
    tavlaUni.uCeller.value.set(celler, celler / 2);
    remsaUni.uCeller.value.set(celler * (RSB / SB), celler * (RSH / SB));
    // liten tavla i bild: större text, inga brickor
    const nyKompakt = val.px < 270;
    if (nyKompakt !== kompakt) { kompakt = nyKompakt; tavlaTex.rita(); }
    // toningen i dukens koordinater: under texten (åt vänster) eller under rubriken (uppåt), och in i nyckelremsan
    if (hj) {
      hj.setAttribute('data-ov-yta', val.typ);
      hj.toggleAttribute('data-ov-tona', !!(hoger || under || overlagg));
      const px = (v) => `${Math.round(v)}px`;
      if (hoger) { hj.style.setProperty('--ov-tona0', px(t0 - L)); hj.style.setProperty('--ov-tona1', px(t1 - L)); }
      else if (under) { hj.style.setProperty('--ov-tona0', px(t0 - T)); hj.style.setProperty('--ov-tona1', px(t1 - T)); }
      else { hj.style.setProperty('--ov-tona0', '0px'); hj.style.setProperty('--ov-tona1', '0px'); }
      if (b0 != null) { hj.style.setProperty('--ov-botten0', px(b0 - T)); hj.style.setProperty('--ov-botten1', px(b1 - T)); }
      else { hj.style.removeProperty('--ov-botten0'); hj.style.removeProperty('--ov-botten1'); }
      const g = s.projicera(tavlaMitt);
      hj.style.setProperty('--ov-gx', `${Math.round(g.x)}px`); hj.style.setProperty('--ov-gy', `${Math.round(g.y)}px`);
      hj.style.setProperty('--ov-gr', `${Math.round(Math.max(160, val.px * 0.85))}px`);
    }
    // glöden: tät och svag – bara ljuskällorna (strålkastare, ljuslister, lamphuvuden) glöder, texten på tavlan står skarp
    if (s.bloom) { const lit = mobil || liten || W < 640; s.bloom.strength = lit ? 0.4 : 0.5; s.bloom.radius = lit ? 0.3 : s.integrerad ? 0.4 : 0.34; s.bloom.threshold = 1.22; }
    ramInfo = { typ: val.typ, px: Math.round(val.px), rw: Math.round(val.rw), rh: Math.round(val.rh), elev: val.elev, dist: +kamDist.toFixed(2), publik: N_PUB, flaggor: flaggor.length, kompakt, text, botten };
    arena.userData.ram = ramInfo; // felsökning
  }

  /* ---- data → tavlan och remsan ---- */
  let dataNyckel = d0 ? d0.nyckel : '';
  function sattData(d) {
    if (!d) return;
    data = d; dataNyckel = d.nyckel;
    tavlaTex.rita(); byggRemsa(d);
  }

  /* ---- pekaren: hovring och klick på tavlan → säljtavlan ---- */
  const raycaster = new THREE.Raycaster(); const _ndc = new THREE.Vector2();
  let lyssnar = null, pekX = 0, pekY = 0, pekNy = false, pekFinns = false, hover = false, hoverMal = 0, ritaPlanerad = false;
  function traffarTavla(cx, cy) {
    const rr = s.canvas.getBoundingClientRect(); if (rr.width < 2 || rr.height < 2) return false;
    _ndc.set(((cx - rr.left) / rr.width) * 2 - 1, -(((cy - rr.top) / rr.height) * 2 - 1));
    if (Math.abs(_ndc.x) > 1 || Math.abs(_ndc.y) > 1) return false;
    s.camera.updateMatrixWorld(); raycaster.setFromCamera(_ndc, s.camera);
    return raycaster.intersectObjects(traffbara, false).length > 0;
  }
  function uppdateraHover() {
    if (!pekNy) return;
    pekNy = false;
    hover = pekFinns && traffarTavla(pekX, pekY);
    hoverMal = hover ? 1 : 0;
    const nod = s.vard; if (nod) { const c = hover ? 'pointer' : ''; if (nod.style.cursor !== c) nod.style.cursor = c; }
  }
  function kopplaPekare(hjalte) {
    if (lyssnar) { lyssnar.nod.removeEventListener('pointermove', lyssnar.flytt); lyssnar.nod.removeEventListener('pointerleave', lyssnar.lamna); lyssnar.nod.removeEventListener('click', lyssnar.klick); }
    // Med reducerad rörelse står ritslingan still: hovringen ritas med en enstaka bild
    const ritaVidLugn = () => { if (s.lugn && !ritaPlanerad) { ritaPlanerad = true; requestAnimationFrame(() => { ritaPlanerad = false; uppdateraHover(); tavlaUni.uHover.value = hoverMal; s.rita(); }); } };
    const flytt = (ev) => { if (ev.pointerType && ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return; pekX = ev.clientX; pekY = ev.clientY; pekNy = true; pekFinns = true; ritaVidLugn(); };
    const lamna = () => { pekFinns = false; pekNy = true; ritaVidLugn(); };
    const klick = (ev) => {
      if (ev.defaultPrevented || ev.target.closest('a, button, input, select, textarea, .ov-text')) return;
      if (traffarTavla(ev.clientX, ev.clientY)) location.hash = '#/salj';
    };
    hjalte.addEventListener('pointermove', flytt, { passive: true });
    hjalte.addEventListener('pointerleave', lamna);
    hjalte.addEventListener('click', klick);
    lyssnar = { nod: hjalte, flytt, lamna, klick };
  }

  s.storlek(rama);

  /* ---- varje bildruta: bara uniforms och kameran (ingen slinga över instanser, inga texturuppladdningar) ---- */
  let t0 = null, raknaSteg = 0;
  const RAKNA = [0.3, 0.58, 0.82, 1];
  const gloriaFarg = new THREE.Color(0xe4eeff), domFarg = new THREE.Color(0.035, 0.06, 0.1);
  s.ram((t, dt) => {
    if (t0 == null) t0 = t;
    const lugn = s.lugn;
    const it = lugn ? 99 : t - t0;
    tid.value = lugn ? STILL_T : t;
    if (spelUppdatera) spelUppdatera(tid.value, lugn);   // matchsimuleringen: spelarna, bollen och skuggorna (~40 figurer)
    uppdateraHover();
    tavlaUni.uHover.value += (hoverMal - tavlaUni.uHover.value) * (lugn || !dt ? 1 : Math.min(1, dt * 9));
    // kameran: svävar in under ~3 s, sedan en mycket långsam drönarrörelse (parallaxen läggs på av motorn)
    const e = lugn ? 0 : 1 - inUt(klamp(it / 3.2));
    const drift = lugn ? 0 : klamp((it - 3.2) / 4);
    const yaw = 0.36 * e + drift * 0.03 * Math.sin(t * 0.045);
    const elev = kamElev + 0.14 * e + drift * 0.012 * Math.sin(t * 0.06 + 1);
    const dist = kamDist * (1 + 0.42 * e + drift * 0.012 * Math.sin(t * 0.037 + 2));
    riktning(elev, yaw, _r);
    s.kamerastyr.mal.copy(kamMal); s.kamerastyr.position.copy(kamMal).addScaledVector(_r, dist);
    // strålkastarna tänds bank för bank (samma ordning som lamphuvudena i shadern) och andas svagt
    introUni.value = lugn ? 99 : it;
    a2c.value = harMsaa() ? 1 : 0;
    const ljusIn = lugn ? 1 : klamp((it - 0.1) / 0.9);
    const anda = 0.93 + 0.07 * Math.sin(t * 0.85);
    for (const gl_ of glorior) gl_.mat.color.copy(gloriaFarg).multiplyScalar((lugn ? 1 : klamp((it - gl_.start) / 0.32)) * anda * 0.95);
    domMat.color.copy(domFarg).multiplyScalar(ljusIn * (0.95 + 0.05 * Math.sin(t * 0.5)));
    ljusUni.uStyrka.value = ljusIn * anda;
    // tavlan slås på med ett svep och räknar upp (canvasen ritas bara några få gånger)
    tavlaUni.uPa.value = lugn ? 1 : klamp((it - 0.7) / 1.2);
    if (!lugn && raknaSteg < RAKNA.length && it >= 1.05 + raknaSteg * 0.3) { raknaP = RAKNA[raknaSteg++]; tavlaTex.rita(); }
    else if (lugn && raknaP < 1) { raknaP = 1; raknaSteg = RAKNA.length; tavlaTex.rita(); }
  });

  const handtag = {
    s,
    omrama(hjalte) { if (s.vard && hjalte.contains(s.vard) && s.bredd > 1 && s.hojd > 1) { rama(s.bredd, s.hojd); s.rita(); } },
    koppla(hjalte, d) {
      if (d && d.nyckel !== dataNyckel) sattData(d);
      kopplaPekare(hjalte);
      if (s.bredd > 1 && s.hojd > 1) rama(s.bredd, s.hojd);
      s.rita();
    },
  };
  return handtag;
}

// Lägger till en (indexerad eller oindexerad) geometri i en samlare med en transform och en färg
function leggTill(THREE, sam, geo, m, c) {
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const pos = geo.attributes.position, nor = geo.attributes.normal, uvA = geo.attributes.uv, idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const hamta = (i) => {
    const k = idx ? idx.getX(i) : i;
    p.fromBufferAttribute(pos, k).applyMatrix4(m); q.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
    return [[p.x, p.y, p.z], [q.x, q.y, q.z], uvA ? [uvA.getX(k), uvA.getY(k)] : [0, 0]];
  };
  for (let i = 0; i + 2 < n; i += 3) { const a = hamta(i), b = hamta(i + 1), d = hamta(i + 2); sam.tri(a[0], b[0], d[0], a[1], b[1], d[1], a[2], b[2], d[2], c); }
  geo.dispose();
}

const motor = varaktig((s) => {
  api = null;
  return bygg(s).then((h) => {
    if (!h || s.forstord) return;
    api = h;
    s.vidForstor(() => { if (api === h) api = null; });
    if (vantande) { const { hjalte, d } = vantande; vantande = null; if (hjalte.isConnected) h.koppla(hjalte, d); }
  });
}, {
  kamera: { fov: FOV, position: [0, 14, 40], mal: [0, 1.4, -1.5], nara: 1, fjarran: 260 },
  parallax: [0, 0], andning: 0.03, exponering: 1.06, miljo: 0.55,
  // mörk arenamiljö för reflexerna i metallen: en ring av strålkastare högt upp och en grön plan nedanför
  miljoScen: (THREE) => {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x04080e);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf2ff).multiplyScalar(5) }));
      m.position.set(Math.cos(a) * 10, 6, Math.sin(a) * 10); m.lookAt(0, 6, 0); sc.add(m);
    }
    const golv = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2f6b3a).multiplyScalar(0.4) }));
    golv.rotation.x = -Math.PI / 2; golv.position.y = -3; sc.add(golv);
    const himmel = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1a3150).multiplyScalar(0.5) }));
    himmel.rotation.x = Math.PI / 2; himmel.position.y = 14; sc.add(himmel);
    return sc;
  },
  bloom: { styrka: 0.5, radie: 0.34, troskel: 1.22 }, skuggomfang: 12,
  // Skärpan: översampling (minst 1,5 × pixeltätheten) i stället för MSAA – på inbyggd grafik var MSAA-målet i halvflyttal den
  // enskilt dyraste delen (21 ms mot 8 ms per bild), och översamplingen jämnar även ut publikens och linjernas mönster.
  // Mobiler (grov pekare) räknar i lägre upplösning och har billig MSAA i grafikkretsen – där behålls MSAA (och publikens alpha-to-coverage).
  // premium (2026-10-23): FXAA efter tonmappningen (bara tydliga kanter – tavlans text och publiken smetas inte ut) och översampling
  // efter skärmbredd: 1,5 upp till 1600 px, 1,25 på bredare (fler pixlar)
  skarpa: (typeof innerWidth === 'number' && innerWidth > 1600) ? 1.25 : 1.5, msaa: matchMedia('(pointer: coarse)').matches ? 4 : 0, fxaa: true, bloomDel: 1,
  skuggTakt: 1e9, // statisk skugga: ritas om bara de första sekunderna och efter storleksbyten
});

/* ---- montering (scener.js) ---------------------------------------------------------------------------- */
/* Hjältens HTML sätts in direkt (billigt). WebGL-scenen byggs först när vyn har ritats och sidan är ledig – den
   blockerar aldrig resten av översikten (bygget går i etapper). Finns scenen redan (omritning, tillbaka till vyn) flyttas
   duken direkt. */
let lageObs = null, vilarObs = null, vantar = null, webglMisslyckades = false;
// Första gången laddas modulen efter att vyn redan visats (import() är asynkron) – då vecklas bandet ut mjukt i stället för
// att knuffa ned sidan i ett ryck. Senare visningar monteras före första målningen och behöver inget.
let forstaMontering = true;
const efterMalning = (fn) => {
  let a = 0, b = 0, c = 0, avbruten = false;
  a = requestAnimationFrame(() => {
    b = setTimeout(() => {
      if (avbruten) return;
      if (typeof requestIdleCallback === 'function') c = requestIdleCallback(fn, { timeout: 600 }); else fn();
    }, 0);
  });
  return () => { avbruten = true; cancelAnimationFrame(a); clearTimeout(b); if (c && typeof cancelIdleCallback === 'function') cancelIdleCallback(c); };
};
function anslut(hjalte, d) {
  if (!hjalte.isConnected) return;
  const scenNod = hjalte.querySelector('[data-ov-scen]');
  let s = null;
  try { s = motor.montera(scenNod); } catch (err) { console.error('[scen-oversikt] montera:', err); s = null; }
  if (!s) { webglMisslyckades = true; hjalte.remove(); return; } // ingen tom sektion; försöks inte igen den här sidvisningen
  // scen3d sätter position:relative på värden om stilmallen inte hunnit laddas – positionen styrs av scen-oversikt.css
  if (scenNod.style.position) scenNod.style.removeProperty('position');
  if (api && api.s === s) api.koppla(hjalte, d);
  else vantande = { hjalte, d };               // bygget pågår: kopplas när det är klart
}
export function montera(vy) {
  if (!webglFinns() || webglMisslyckades) return { avmontera() {} };
  const d = lasData();
  if (!d) return { avmontera() {} };
  senasteData = d;
  let hjalte = vy.querySelector(':scope > [data-scen3d="oversikt"]');
  if (!hjalte) {
    hjalte = document.createElement('section');
    hjalte.className = 'ov-hjalte';
    hjalte.setAttribute('data-scen3d', 'oversikt');
    hjalte.setAttribute('aria-labelledby', 'ov-rubrik');
    hjalte.innerHTML = hjalteHtml(d);
    if (forstaMontering && !matchMedia('(prefers-reduced-motion: reduce)').matches) hjalte.setAttribute('data-ov-veckla', '');
    vy.prepend(hjalte);
  }
  forstaMontering = false;
  // Läget sätts härifrån (samma gräns som i CSS:en) så att 3D-ramningen vet om det: < 640 px = mobilbandet
  const sattLage = () => {
    const b = hjalte.clientWidth; const smal = !!b && b < 640;
    const l = smal ? 'smal' : 'bred';
    if (hjalte.getAttribute('data-ov-lage') === l && smal === hjalte.hasAttribute('data-ov-smal')) return;
    hjalte.setAttribute('data-ov-lage', l); hjalte.toggleAttribute('data-ov-smal', smal);
    if (api) api.omrama(hjalte);
  };
  sattLage();
  if (lageObs) lageObs.disconnect();
  lageObs = new ResizeObserver(sattLage); lageObs.observe(hjalte);
  // Ständiga CSS-animationer (live-pricken) vilar när hjälten inte syns
  if (vilarObs) vilarObs.disconnect();
  vilarObs = new IntersectionObserver((poster) => { const p = poster[poster.length - 1]; hjalte.toggleAttribute('data-vilar', !p.isIntersecting); });
  vilarObs.observe(hjalte);
  if (forstaVisning) { hjalte.setAttribute('data-ov-intro', ''); raknaUpp(hjalte); forstaVisning = false; }
  if (vantar) { vantar(); vantar = null; }
  if (motor.scen) anslut(hjalte, d);                       // scenen finns: flytta duken (billigt)
  else vantar = efterMalning(() => { vantar = null; anslut(hjalte, d); });
  return { avmontera() {
    if (vantar) { vantar(); vantar = null; }
    vantande = null;
    if (lageObs) { lageObs.disconnect(); lageObs = null; } if (vilarObs) { vilarObs.disconnect(); vilarObs = null; }
    motor.vila();
  } };
}
