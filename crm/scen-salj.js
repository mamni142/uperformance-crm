/* Uperformance CRM – säljtavlans 3D-hjälte: IFK Göteborgs omklädningsrum (#/salj, 2026-10-23).
   Man står i dörren till ett omklädningsrum i kvällsljus. Klädskåp i trä längs vänster och höger vägg och bakväggen: matchtröjor i
   blått och vitt hänger med ryggen och numret ut, skor, handdukar, flaskor, benskydd, tejp och väskor på bänkar och hyllor, en
   ledlist under varje hylla och en nummerskylt över varje skåp. Längre fram i mitten står en taktiktavla på ben. Den visar säljet:
   en rad per steg (Ny kontakt → Order signerad · 90 d) och en planhalva där varje affär är en magnet på sitt steg, med målet längst
   ned = signerad order. Pilar i tusch ritas fram mot målet.
   Framför skåpet till höger om tavlan hänger Gustav Svenssons tröja – SVENSSON 13, hans nummer i IFK Göteborg (trupplistan 2008, och
   samma nummer när han kom tillbaka) – på en trägalge på en displayarm, vänd mot dörren, i ett eget spotljus. Den har volym, veck,
   sömmar och ett blankt tryck, gungar sakta och tar emot en knuff när man hovrar. Bara klubbens namn och färger, aldrig emblemet.
   Stegens text på tavlan är riktiga knappar som crm.js ritar i [data-ss-etiketter] (data-g="till-kolumn" – samma hopp som stegbandet,
   även med tangentbordet). Scenen lägger dem på tavlans rader (skarp text, skärmläsare) och läser stegens tal och affärer ur deras
   data-attribut (data-parlor = JSON) – inget räknas eller hittas på här. Hovra en magnet: kund, affär och värde; klicka: affären öppnas.
   Klick på en rad = klick på stegets knapp. Hovring och stegbandets markering (data-aktiv) tänder raden.
   Intro: rummet tänds – lysrören i taket flimrar igång, ledlisterna i skåpen tänds bakåt, IFK GÖTEBORG lyser upp, spotten på tavlan –
   medan kameran glider in genom dörren; magneterna klickar fast på tavlan en i taget och pilarna ritas fram. Sedan lever rummet:
   damm i ljuskäglan, ånga från duschen, tröjorna rör sig lite, klockan på väggen visar riktig tid. Flyttas en affär (dra och släpp,
   Shift + pil, överlämning) glider magneten till sin nya rad.
   Prestanda: skåpen, listerna och lamporna är några få sammanslagna geometrier; tröjor, skor, flaskor, handdukar och magneter är
   instanser; all ständig rörelse är shaders eller några matriser per bild; skuggan är statisk efter introt. Mjukvaru-WebGL: inga
   skuggor, ingen ånga och inget intro.
   Kontrakt: scener.js (montera(nod) → { avmontera() }, nod = [data-salj-scen]) och scen3d.js (varaktig, bloom, vila, städning).
   CSS: crm/sidor.css avsnitt 04 ("Omklädningsrummet"). Den gamla glastratten ligger i _underlag/gammal-scen-salj/. */
import { varaktig, webglFinns, FARG } from './scen3d.js?v=5';

/* ---- konstanter ---------------------------------------------------------------------------------- */
const STEG_ID = ['kontakt', 'besok', 'offert', 'underlag', 'signerad'];
const FARGER = { kontakt: 0x3d86e0, besok: 0x30a8e8, offert: 0x22c6d8, underlag: 0x2fd8b0, signerad: 0x7ee0c3 };
const hex = (v) => `#${v.toString(16).padStart(6, '0')}`;
// IFK Göteborgs färger – klubbens namn och färger används, aldrig emblemet
const IFK = { bla: 0x1d57a8, morkBla: 0x0e2c5c, vit: 0xf2f4f8 };
// Gustav Svensson i IFK Göteborg: nummer 13 (trupplistan 2008 – hans första period – och samma nummer vid återkomsten)
const GUSTAV = { nummer: '13', namn: 'SVENSSON' };

// Rummet i meter: x = höger, y = upp, z = mot kameran (dörren). Skåpens front står DJUP in från väggen.
const RUM = { x: 2.5, z0: -4.0, z1: 4.4, h: 2.95 };
const SKAP = { djup: 0.5, b: 0.9, h: 2.1, sits: 0.46, hylla: 1.8 };
const SIDA_Z = [1.95, 1.05, 0.15, -0.75, -1.65, -2.55, -3.45];
const BAK_X = [-1.35, -0.45, 0.45, 1.35];
const DUSCH_Z = -3.45;                  // vänster vägg, längst bak: öppningen till duschen (ånga)
const GUSTAV_Z = -0.75;                 // höger vägg – skåpet bredvid tavlan
// nummerskyltarna (skåpens ordning: vänster vägg framifrån, bakväggen, höger vägg bakifrån)
const NUMMER_V = ['1', '3', '4', '5', '6', '7', null];
const NUMMER_B = ['8', '9', '10', '11'];
const NUMMER_H = ['21', '19', '17', '14', GUSTAV.nummer, '16', '20'];   // höger vägg framifrån – index 3 = GUSTAV_Z
// Taktiktavlan: mitten av ytan i (x, y, z), ytan b × h, lutar lite bakåt på sitt stativ
const TAVLA = { b: 2.7, h: 1.62, x: -0.18, y: 0.55 + 1.62 / 2, z: -0.85, lut: -0.08 };
// tavlans indelning i andelar av ytan (0 = vänster/överkant): rubrikrad, fem rader, listan till vänster och planen till höger
const TV = { rad0: 0.125, rad1: 0.975, lista0: 0.025, lista1: 0.505, text0: 0.072, plan0: 0.54, plan1: 0.972, mal: 0.935 };
const RAD_H = (TV.rad1 - TV.rad0) / 5;
const radMitt = (k) => TV.rad0 + (k + 0.5) * RAD_H;
const TEX_B = 2048, TEX_H = Math.round(2048 * TAVLA.h / TAVLA.b);

const klamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const utKub = (p) => 1 - Math.pow(1 - klamp(p), 3);
const inUt = (p) => { p = klamp(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
const utStuds = (p) => { p = klamp(p); const n1 = 7.5625, d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p; if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75; if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375; return n1 * (p -= 2.625 / d1) * p + 0.984375; };
// deterministiskt brus (samma rum varje gång)
const slump = (() => { let f = 1234567; return () => { f = (f * 16807) % 2147483647; return (f - 1) / 2147483646; }; })();

/* ---- data ur etiketterna (crm.js visaSalj) ------------------------------------------------------- */
function lasParlor(text) {
  try { const lista = JSON.parse(text || '[]'); return Array.isArray(lista) ? lista.filter((a) => a && a.i).map((a) => ({ id: String(a.i), varde: +a.v || 0, namn: String(a.n || ''), titel: String(a.t || '') })) : []; } catch (err) { return []; }
}
function lasData(nod) {
  const knappar = [...nod.querySelectorAll('[data-ss-etiketter] .ss-steg')];
  if (knappar.length !== 5) return null;
  const steg = knappar.map((b) => ({ id: b.dataset.steg, namn: (b.querySelector('.ss-lang') || b).textContent.trim(), antal: +b.dataset.antal || 0, varde: +b.dataset.varde || 0, knapp: b, affarer: lasParlor(b.dataset.parlor) }));
  return { steg, nyckel: steg.map((x) => `${x.id}:${x.antal}:${x.varde}:${x.affarer.map((a) => a.id).join('.')}`).join('|') };
}
// Samma gränser som krKort i crm.js: hela kronor under 10 000, tkr upp till avrundat 1 000 tkr, sedan Mkr med en decimal
const krKort = (v) => (v >= 999500 ? `${(v / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} Mkr` : v >= 1e4 ? `${Math.round(v / 1000).toLocaleString('sv-SE')} tkr` : `${Math.round(v).toLocaleString('sv-SE')} kr`);

/* ---- geometri: slå ihop många delar till en (färre ritanrop). Varje del kan bära ett tal (aVarde) till shadern. ---- */
function slaIhop(THREE, delar) {
  let nV = 0, nI = 0;
  for (const { g } of delar) { nV += g.attributes.position.count; nI += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), varde = new Float32Array(nV);
  const idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI);
  let v = 0, i = 0;
  for (const { g, a = 0, uv: uvFn } of delar) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, v * 3); if (n) nor.set(n.array, v * 3);
    if (u) { if (uvFn) for (let k = 0; k < u.count; k++) { const [x, y] = uvFn(u.getX(k), u.getY(k)); uv[(v + k) * 2] = x; uv[(v + k) * 2 + 1] = y; } else uv.set(u.array, v * 2); }
    varde.fill(a, v, v + p.count);
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[i++] = g.index.array[k] + v;
    else for (let k = 0; k < p.count; k++) idx[i++] = v + k;
    v += p.count; g.dispose();
  }
  const ut = new THREE.BufferGeometry();
  ut.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ut.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ut.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); ut.setAttribute('aVarde', new THREE.BufferAttribute(varde, 1));
  ut.setIndex(new THREE.BufferAttribute(idx, 1)); ut.computeBoundingSphere(); ut.computeBoundingBox();
  return ut;
}

/* ---- texturer (ritas en gång i canvas) ------------------------------------------------------------ */
// Trä: varm valnöt med ådring längs fibern (lodrätt)
function ritaTra(ctx, b, h) {
  const g = ctx.createLinearGradient(0, 0, b, 0); g.addColorStop(0, '#6b4429'); g.addColorStop(0.5, '#7a4f31'); g.addColorStop(1, '#684128');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 220; i++) {
    const x0 = slump() * b, amp = 2 + slump() * 9, fas = slump() * 6, ljus = slump() < 0.5;
    ctx.strokeStyle = ljus ? `rgba(196, 140, 92, ${0.05 + slump() * 0.12})` : `rgba(40, 22, 10, ${0.08 + slump() * 0.16})`;
    ctx.lineWidth = 0.6 + slump() * 2.2; ctx.beginPath();
    for (let y = 0; y <= h; y += 8) { const x = x0 + Math.sin(y / (40 + amp * 9) + fas) * amp; if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) { const x = slump() * b, y = slump() * h; const r = ctx.createRadialGradient(x, y, 0, x, y, 6 + slump() * 10); r.addColorStop(0, 'rgba(45, 24, 10, .45)'); r.addColorStop(1, 'rgba(45, 24, 10, 0)'); ctx.fillStyle = r; ctx.fillRect(x - 20, y - 20, 40, 40); }
}
// Golv: mörk slipad betong/epoxi med små korn och svaga fogar
function ritaGolv(ctx, b, h) {
  ctx.fillStyle = '#1d232b'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 16000; i++) { const x = slump() * b, y = slump() * h, l = slump(); ctx.fillStyle = l < 0.5 ? `rgba(255,255,255,${0.02 + l * 0.05})` : `rgba(0,0,0,${0.05 + (l - 0.5) * 0.14})`; ctx.fillRect(x, y, 1 + slump() * 2, 1 + slump() * 2); }
  ctx.strokeStyle = 'rgba(0, 0, 0, .35)'; ctx.lineWidth = 3;
  for (let x = 0; x <= b; x += b / 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += h / 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b, y); ctx.stroke(); }
}
// Gummimattan i mitten: IFK-blå med vita kantränder
function ritaMatta(ctx, b, h) {
  ctx.fillStyle = '#123f80'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(0, 0, 0, ${0.04 + slump() * 0.08})`; ctx.fillRect(slump() * b, slump() * h, 2, 2); }
  ctx.fillStyle = 'rgba(240, 244, 250, .9)';
  ctx.fillRect(b * 0.04, 0, b * 0.025, h); ctx.fillRect(b * 0.935, 0, b * 0.025, h);
  ctx.fillRect(b * 0.08, 0, b * 0.008, h); ctx.fillRect(b * 0.912, 0, b * 0.008, h);
}
// Bakväggen: IFK:s blåvita ränder (målade), mörkare upptill och nedtill
function ritaRander(ctx, b, h) {
  const n = 14;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#e9edf3' : '#1d57a8'; ctx.fillRect((i / n) * b, 0, b / n + 1, h); }
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(6, 12, 22, .55)'); g.addColorStop(0.35, 'rgba(6, 12, 22, .1)'); g.addColorStop(1, 'rgba(6, 12, 22, .5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
}
// Väggarna i övrigt: mörk marinblå målad betong
function ritaVagg(ctx, b, h) {
  ctx.fillStyle = '#14243a'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = `rgba(255,255,255,${slump() * 0.025})`; ctx.fillRect(slump() * b, slump() * h, 2, 2); }
}
// Skåpens bakstycke: blått tyg med fin vävstruktur
function ritaTyg(ctx, b, h) {
  ctx.fillStyle = '#1a4a8f'; ctx.fillRect(0, 0, b, h);
  for (let y = 0; y < h; y += 3) { ctx.fillStyle = `rgba(0, 0, 0, ${0.05 + (y % 6 ? 0 : 0.05)})`; ctx.fillRect(0, y, b, 1); }
  for (let x = 0; x < b; x += 3) { ctx.fillStyle = 'rgba(255, 255, 255, .025)'; ctx.fillRect(x, 0, 1, h); }
}
// Nummerskyltarna: en atlas med vita skyltar (marinblå siffror)
const SKYLT = { kol: 6, rad: 4, b: 1024, h: 512 };
function ritaSkyltar(ctx, b, h, lista) {
  ctx.clearRect(0, 0, b, h);
  const cb = b / SKYLT.kol, ch = h / SKYLT.rad;
  lista.forEach((t, i) => {
    const x = (i % SKYLT.kol) * cb, y = Math.floor(i / SKYLT.kol) * ch;
    ctx.fillStyle = '#eef1f6'; ctx.beginPath(); ctx.roundRect(x + 6, y + 6, cb - 12, ch - 12, 14); ctx.fill();
    ctx.fillStyle = '#0e2c5c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (t === GUSTAV.nummer) {
      ctx.font = '700 58px Poppins, sans-serif'; ctx.fillText(t, x + cb / 2, y + ch * 0.4);
      ctx.font = '600 22px Poppins, sans-serif'; ctx.fillText(GUSTAV.namn, x + cb / 2, y + ch * 0.76);
    } else { ctx.font = '700 70px Poppins, sans-serif'; ctx.fillText(t, x + cb / 2, y + ch / 2 + 2); }
  });
}
// Tröjans siluett (galgen i överkant): bål med ärmar, rund hals. b × h = cellen.
function trojaForm(ctx, x, y, b, h) {
  const p = (fx, fy) => [x + fx * b, y + fy * h];
  ctx.beginPath();
  ctx.moveTo(...p(0.38, 0.04)); ctx.quadraticCurveTo(...p(0.5, 0.12), ...p(0.62, 0.04)); // halsringning
  ctx.lineTo(...p(0.8, 0.08)); ctx.quadraticCurveTo(...p(0.92, 0.13), ...p(0.995, 0.3)); // axel → ärm
  ctx.lineTo(...p(0.86, 0.37)); ctx.lineTo(...p(0.8, 0.27));                               // ärmens nederkant → ärmhål
  ctx.lineTo(...p(0.81, 0.97)); ctx.quadraticCurveTo(...p(0.5, 1.0), ...p(0.19, 0.97));   // sida → fåll
  ctx.lineTo(...p(0.2, 0.27)); ctx.lineTo(...p(0.14, 0.37)); ctx.lineTo(...p(0.005, 0.3));
  ctx.quadraticCurveTo(...p(0.08, 0.13), ...p(0.2, 0.08)); ctx.closePath();
}
// Tröjans rygg: blåvita ränder, blå ärmar, mörk krage, numret (och namnet) i marinblått med vit kant
function ritaTrojaRygg(ctx, x, y, b, h, nummer, namn, jacka) {
  ctx.save(); trojaForm(ctx, x, y, b, h); ctx.clip();
  if (jacka) { // träningsjacka: marinblå med vita ränder på ärmarna
    ctx.fillStyle = '#0f2747'; ctx.fillRect(x, y, b, h);
    ctx.fillStyle = 'rgba(240,244,250,.92)'; for (const s of [-1, 1]) { ctx.save(); ctx.translate(x + b * (s < 0 ? 0.1 : 0.9), y + h * 0.22); ctx.rotate(s * 0.75); ctx.fillRect(-b * 0.012, -h * 0.12, b * 0.012, h * 0.24); ctx.fillRect(b * 0.01, -h * 0.12, b * 0.012, h * 0.24); ctx.restore(); }
  } else {
    const n = 9; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#f2f4f8' : '#1d57a8'; ctx.fillRect(x + b * (0.2 + (i / n) * 0.6), y, b * 0.6 / n + 1, h); }
    ctx.fillStyle = '#1d57a8'; ctx.fillRect(x, y, b * 0.205, h); ctx.fillRect(x + b * 0.795, y, b * 0.205, h); // ärmarna
    ctx.fillStyle = '#f2f4f8'; for (const s of [0, 1]) { ctx.save(); ctx.translate(x + b * (s ? 0.93 : 0.07), y + h * 0.335); ctx.rotate(s ? -0.48 : 0.48); ctx.fillRect(-b * 0.075, -h * 0.008, b * 0.15, h * 0.016); ctx.restore(); } // ärmkant
  }
  // veck och skugga: mörkare mot sidorna, ljus mitt
  const g = ctx.createLinearGradient(x, 0, x + b, 0); g.addColorStop(0, 'rgba(0,0,0,.32)'); g.addColorStop(0.22, 'rgba(0,0,0,.05)'); g.addColorStop(0.5, 'rgba(255,255,255,.06)'); g.addColorStop(0.78, 'rgba(0,0,0,.05)'); g.addColorStop(1, 'rgba(0,0,0,.32)');
  ctx.fillStyle = g; ctx.fillRect(x, y, b, h);
  for (let i = 0; i < 5; i++) { const fx = 0.3 + slump() * 0.4; const v = ctx.createLinearGradient(x + b * (fx - 0.04), 0, x + b * (fx + 0.04), 0); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,.09)'); v.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = v; ctx.fillRect(x + b * (fx - 0.04), y + h * 0.45, b * 0.08, h * 0.55); }
  ctx.fillStyle = '#0e2c5c'; ctx.beginPath(); ctx.ellipse(x + b * 0.5, y + h * 0.055, b * 0.13, h * 0.035, 0, 0, Math.PI); ctx.fill(); // kragen bak
  ctx.restore();
  if (!nummer) return;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  if (namn) {
    ctx.font = `700 ${Math.round(h * 0.075)}px Poppins, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(h * 0.006)}px`;
    ctx.lineWidth = h * 0.016; ctx.strokeStyle = '#f2f4f8'; ctx.strokeText(namn, x + b * 0.5, y + h * 0.29);
    ctx.fillStyle = '#0e2c5c'; ctx.fillText(namn, x + b * 0.5, y + h * 0.29);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  ctx.font = `700 ${Math.round(h * (namn ? 0.38 : 0.42))}px Poppins, sans-serif`;
  const ny = y + h * (namn ? 0.7 : 0.66);
  ctx.lineWidth = h * 0.028; ctx.strokeStyle = '#f2f4f8'; ctx.strokeText(nummer, x + b * 0.5, ny);
  ctx.fillStyle = '#0e2c5c'; ctx.fillText(nummer, x + b * 0.5, ny);
  ctx.restore();
}
/* Gustavs tröja i 3D (2026-10-23, "gör en riktig tröja som är 3D … som inte ser platt och fejk ut"): bålen är ett slutet rör runt
   galgen och ärmarna egna rör, så texturerna är "utrullade". Bålens karta: u = runt om (0 = vänster sida, 0,25 = mitt bak – ryggen mot
   dörren, 0,5 = höger sida, 0,75 = mitt fram), v = uppifrån (axelsömmen) och ned (fållen). Dukens mått ger samma antal bildpunkter per
   meter på bredden och höjden (2048 × 1800 ≈ 0,84 m runt om × 0,76 m). Ränder (nio per sida) med tonat mönster och små skiftningar,
   marinblå sidopaneler i nätväv med vit passpoal, ribbad krage, nacketikett IFK GÖTEBORG, sömmar, skuggor vid kragen, sidorna och fållen,
   och namn och nummer i flera lager (skugga, mörk ytterkant, vit kant, ljus fas och marinblått). Samma ritning ger tre kartor: 'farg',
   'hojd' (normalkartan: maskor, nätväv, sömmar, veck och trycket upphöjt) och 'glans' (trycket är blankare än tyget). */
const GU = { bak: 0.25, fram: 0.75, panel: 0.045, namnV: 0.218, numV: 0.6 };
function ritaGustavTorso(ctx, b, h, lager = 'farg') {
  const F = lager === 'farg', HO = lager === 'hojd';
  const gra = (v) => `rgb(${v},${v},${v})`;
  let fro = 131; const rnd = () => { fro = (fro * 16807) % 2147483647; return (fro - 1) / 2147483646; }; // egen följd – rör inte rummets slump
  const X = (u) => u * b, Y = (v) => v * h;
  const linje = (pts, bredd, stil, streck) => { ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v)))); ctx.lineWidth = bredd; ctx.strokeStyle = stil; ctx.setLineDash(streck || []); ctx.stroke(); ctx.setLineDash([]); };
  const mjukt = (px, fn) => { ctx.save(); ctx.filter = `blur(${Math.max(1.5, px).toFixed(1)}px)`; ctx.lineCap = 'round'; fn(); ctx.restore(); };
  const som = (pts) => {
    if (F) { const st = [h * 0.006, h * 0.0046]; ctx.save(); ctx.translate(0, h * 0.0012); linje(pts, h * 0.0016, 'rgba(255, 255, 255, .3)', st); ctx.restore(); linje(pts, h * 0.0016, 'rgba(8, 24, 52, .45)', st); }
    else if (HO) linje(pts, Math.max(1.5, h * 0.004), gra(152));
  };
  const SIDOR = [0, 0.5, 1]; // sidosömmarna (u)
  ctx.fillStyle = F ? '#1c53a3' : gra(HO ? 128 : 255); ctx.fillRect(0, 0, b, h);
  if (F) {
    for (const [u0, u1] of [[GU.panel, 0.5 - GU.panel], [0.5 + GU.panel, 1 - GU.panel]]) {
      const n = 9, w = (u1 - u0) / n; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#eef1f6' : '#1c53a3'; ctx.fillRect(X(u0 + i * w), 0, X(w) + 1, h); }
    }
    ctx.save(); ctx.globalAlpha = 0.055; ctx.strokeStyle = '#0a2350'; ctx.lineWidth = Math.max(1, b * 0.0013);
    for (let k = -h; k < b + h; k += b * 0.0095) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k - h * 0.55, h); ctx.stroke(); }
    ctx.restore();
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(0, 0, 0, .04)' : 'rgba(255, 255, 255, .035)'; ctx.fillRect(rnd() * b, rnd() * h, 2, 2); }
  }
  // sidopanelerna i nätväv: marinblå (färgen) / små hål (höjden), vit passpoal mot ränderna
  for (const us of SIDOR) {
    const u0 = Math.max(0, us - GU.panel), u1 = Math.min(1, us + GU.panel);
    if (F) { ctx.fillStyle = '#0e2c5c'; ctx.fillRect(X(u0), 0, X(u1 - u0), h); }
    if (F || HO) {
      ctx.fillStyle = F ? 'rgba(0, 6, 20, .5)' : gra(100); const st = h * 0.0075;
      for (let r = 0, y = Y(0.1); y < h; y += st, r++) for (let x = X(u0) + (r % 2 ? st / 2 : 0); x < X(u1); x += st) ctx.fillRect(x, y, Math.max(1, st * 0.42), Math.max(1, st * 0.42));
    }
    for (const ue of [us - GU.panel, us + GU.panel]) if (ue > 0 && ue < 1) {
      if (F) linje([[ue, 0.08], [ue, 1]], h * 0.004, '#eef2f8'); else if (HO) linje([[ue, 0.08], [ue, 1]], Math.max(1.5, h * 0.005), gra(150));
      som([[ue + (ue > us ? 0.006 : -0.006), 0.09], [ue + (ue > us ? 0.006 : -0.006), 0.96]]);
    }
  }
  // kragen: ribbad marinblå kant runt nacken bak och fram, en vit rand under; nacketiketten under kragen bak
  for (const [uc, bredd, djup] of [[GU.bak, 0.07, 0.028], [GU.fram, 0.075, 0.032]]) {
    if (F) {
      ctx.fillStyle = '#0e2c5c'; ctx.beginPath(); ctx.roundRect(X(uc - bredd), -h * 0.01, X(bredd * 2), Y(djup) + h * 0.01, h * 0.01); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, .1)'; for (let x = X(uc - bredd); x < X(uc + bredd); x += h * 0.0065) ctx.fillRect(x, 0, h * 0.0024, Y(djup));
      ctx.fillStyle = '#eef2f8'; ctx.fillRect(X(uc - bredd), Y(djup), X(bredd * 2), h * 0.004);
    } else if (HO) { ctx.fillStyle = gra(140); ctx.fillRect(X(uc - bredd), 0, X(bredd * 2), Y(djup)); ctx.fillStyle = gra(116); for (let x = X(uc - bredd); x < X(uc + bredd); x += Math.max(2, h * 0.0065)) ctx.fillRect(x, 0, Math.max(1, h * 0.0024), Y(djup)); }
  }
  if (F) {
    const cx = X(GU.bak), cy = Y(0.058), eb = h * 0.17, eh = h * 0.028;
    ctx.fillStyle = 'rgba(14, 44, 92, .92)'; ctx.beginPath(); ctx.roundRect(cx - eb / 2, cy - eh / 2, eb, eh, eh * 0.3); ctx.fill();
    ctx.fillStyle = '#eef2f8'; ctx.font = `700 ${Math.round(h * 0.0155)}px Poppins, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(h * 0.0026).toFixed(1)}px`;
    ctx.fillText('IFK GÖTEBORG', cx, cy + h * 0.001); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // skuggor: under kragen, mot sidorna (där tyget vänder), vid axelsömmen och fållen; svaga lodräta veck nedtill
    mjukt(h * 0.012, () => { ctx.fillStyle = 'rgba(0, 0, 0, .16)'; ctx.beginPath(); ctx.ellipse(X(GU.bak), Y(0.03), X(0.085), Y(0.045), 0, 0, Math.PI * 2); ctx.fill(); });
    for (const us of SIDOR) { const g = ctx.createLinearGradient(X(us - 0.12), 0, X(us + 0.12), 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(X(us - 0.12), 0, X(0.24), h); }
    const gt = ctx.createLinearGradient(0, 0, 0, Y(0.07)); gt.addColorStop(0, 'rgba(0,0,0,.18)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gt; ctx.fillRect(0, 0, b, Y(0.07));
    const gf = ctx.createLinearGradient(0, Y(0.86), 0, h); gf.addColorStop(0, 'rgba(0,0,0,0)'); gf.addColorStop(1, 'rgba(0,0,0,.16)'); ctx.fillStyle = gf; ctx.fillRect(0, Y(0.86), b, Y(0.14));
    for (let i = 0; i < 8; i++) { const u = 0.06 + rnd() * 0.88; const v = ctx.createLinearGradient(X(u - 0.015), 0, X(u + 0.015), 0); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,.07)'); v.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = v; ctx.fillRect(X(u - 0.015), Y(0.45), X(0.03), Y(0.55)); }
  } else if (HO) {
    // vecken: korta veck där tyget hänger över galgens axlar, lodräta veck nedtill och rynkor i armhålorna
    mjukt(h * 0.008, () => {
      for (const uc of [GU.bak, GU.fram]) for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) linje([[uc + s * (0.09 + k * 0.03), 0.02 + k * 0.012], [uc + s * (0.05 + k * 0.03), 0.09 + k * 0.02]], h * 0.008, gra(k % 2 ? 146 : 112));
        linje([[uc + s * 0.19, 0.12], [uc + s * 0.15, 0.2]], h * 0.007, gra(114)); linje([[uc + s * 0.18, 0.15], [uc + s * 0.14, 0.22]], h * 0.006, gra(142));
      }
      for (let i = 0; i < 12; i++) { const u = 0.06 + (i / 12) * 0.9 + rnd() * 0.02; linje([[u, 0.5 + rnd() * 0.1], [u + (rnd() - 0.5) * 0.01, 1]], h * 0.016, gra(i % 2 ? 146 : 110)); }
    });
  }
  // sömmarna: axelsömmen överst och dubbelsömmen vid fållen
  som([[0, 0.009], [1, 0.009]]); som([[0, 0.966], [1, 0.966]]); som([[0, 0.979], [1, 0.979]]);
  // namnet och numret på ryggen: tryck i lager (färgen), upphöjt (höjden), blankt (glansen)
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  // k.smal: trycket smalnas av (kondenserad stil) – mitten står kvar på ryggens mitt
  const skikt = (text, fs, v, spar, k) => {
    ctx.font = `800 ${Math.round(h * fs)}px Poppins, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(h * spar).toFixed(1)}px`;
    const F0 = h * fs, sx = k.smal || 1;
    ctx.save(); ctx.translate(X(GU.bak), Y(v)); ctx.scale(sx, 1);
    const tx = 0, ty = 0;
    if (F) {
      mjukt(F0 * 0.04, () => { ctx.lineJoin = 'round'; ctx.lineWidth = F0 * k.yttre; ctx.strokeStyle = 'rgba(0, 8, 24, .35)'; ctx.strokeText(text, tx + F0 * 0.02, ty + F0 * 0.035); });
      ctx.lineWidth = F0 * k.yttre; ctx.strokeStyle = '#0a1f45'; ctx.strokeText(text, tx, ty);
      ctx.lineWidth = F0 * k.vit; ctx.strokeStyle = '#f6f8fb'; ctx.strokeText(text, tx, ty);
      ctx.fillStyle = 'rgba(150, 190, 255, .65)'; ctx.fillText(text, tx - F0 * 0.012, ty - F0 * 0.012);
      const g = ctx.createLinearGradient(0, ty - F0 * 0.75, 0, ty); g.addColorStop(0, '#1b4a8f'); g.addColorStop(1, '#0a2250');
      ctx.fillStyle = g; ctx.fillText(text, tx, ty);
    } else {
      const [vk, vf] = HO ? [164, 182] : [118, 96];
      ctx.lineWidth = F0 * k.yttre; ctx.strokeStyle = gra(vk); ctx.strokeText(text, tx, ty);
      ctx.fillStyle = gra(vf); ctx.fillText(text, tx, ty);
    }
    ctx.restore();
  };
  skikt(GUSTAV.namn, 0.088, GU.namnV, 0.0025, { yttre: 0.17, vit: 0.1, smal: 0.74 });
  skikt(GUSTAV.nummer, 0.37, GU.numV, -0.004, { yttre: 0.085, vit: 0.055 });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}
// Ärmen utrullad: u = runt om (0 och 1 = sömmen under ärmen), v = från axeln ned till mudden (marinblå med vit rand)
function ritaGustavArm(ctx, b, h, lager = 'farg') {
  const F = lager === 'farg', HO = lager === 'hojd';
  const gra = (v) => `rgb(${v},${v},${v})`;
  let fro = 271; const rnd = () => { fro = (fro * 16807) % 2147483647; return (fro - 1) / 2147483646; };
  if (F) {
    const g = ctx.createLinearGradient(0, 0, b, 0); g.addColorStop(0, '#143a77'); g.addColorStop(0.5, '#1f59ab'); g.addColorStop(1, '#143a77'); ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
    ctx.save(); ctx.globalAlpha = 0.055; ctx.strokeStyle = '#0a2350'; ctx.lineWidth = 1; for (let k = -h; k < b + h; k += b * 0.037) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k - h * 0.55, h); ctx.stroke(); } ctx.restore();
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(0, 0, 0, .04)' : 'rgba(255, 255, 255, .035)'; ctx.fillRect(rnd() * b, rnd() * h, 2, 2); }
    ctx.fillStyle = '#0e2c5c'; ctx.fillRect(0, h * 0.84, b, h * 0.16);
    ctx.fillStyle = '#eef2f8'; ctx.fillRect(0, h * 0.895, b, h * 0.022);
    ctx.fillStyle = 'rgba(255, 255, 255, .1)'; for (let x = 0; x < b; x += 7) ctx.fillRect(x, h * 0.84, 2.5, h * 0.16);
    const gt = ctx.createLinearGradient(0, 0, 0, h * 0.2); gt.addColorStop(0, 'rgba(0,0,0,.2)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gt; ctx.fillRect(0, 0, b, h * 0.2);
    ctx.setLineDash([h * 0.018, h * 0.014]); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(8, 24, 52, .45)';
    for (const y of [h * 0.835]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b, y); ctx.stroke(); }
    for (const x of [b * 0.012, b * 0.988]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.84); ctx.stroke(); }
    ctx.setLineDash([]);
  } else if (HO) {
    ctx.fillStyle = gra(128); ctx.fillRect(0, 0, b, h);
    ctx.save(); ctx.filter = `blur(${Math.max(1.5, b * 0.02).toFixed(1)}px)`; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const x = b * (0.1 + i * 0.16); ctx.strokeStyle = gra(i % 2 ? 146 : 110); ctx.lineWidth = b * 0.05; ctx.beginPath(); ctx.moveTo(x, h * 0.1); ctx.lineTo(x + b * 0.12, h * 0.8); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = gra(140); ctx.fillRect(0, h * 0.84, b, h * 0.16); ctx.fillStyle = gra(116); for (let x = 0; x < b; x += 4) ctx.fillRect(x, h * 0.84, 1.5, h * 0.16);
    ctx.fillStyle = gra(150); ctx.fillRect(0, h * 0.832, b, 2); ctx.fillRect(b * 0.008, 0, 2, h * 0.84); ctx.fillRect(b * 0.988, 0, 2, h * 0.84);
  } else { ctx.fillStyle = gra(255); ctx.fillRect(0, 0, b, h); }
}
// Höjd (gråskala på duken) → normalkarta på samma duk. Tygets maskor läggs till här (ett fint rutmönster). styrka = lutning per gråsteg.
function hojdTillNormal(ctx, b, h, styrka) {
  const src = ctx.getImageData(0, 0, b, h).data, ut = ctx.createImageData(b, h), d = ut.data;
  const H = new Float32Array(b * h);
  for (let i = 0, y = 0; y < h; y++) for (let x = 0; x < b; x++, i++) H[i] = src[i * 4] + (((x + (y >> 1)) & 1) ? 4 : -4);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const i = y * b + x;
    const l = H[y * b + Math.max(0, x - 1)], r = H[y * b + Math.min(b - 1, x + 1)], o = H[Math.max(0, y - 1) * b + x], n = H[Math.min(h - 1, y + 1) * b + x];
    const nx = (l - r) * styrka, ny = (n - o) * styrka, k = 1 / Math.hypot(nx, ny, 1); // duken är upp och ned mot texturens v
    d[i * 4] = (nx * k * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * k * 0.5 + 0.5) * 255; d[i * 4 + 2] = (k * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(ut, 0, 0);
}
// Fotbollen: vit med marinblå och blå paneler (ekvirektangulär karta)
function ritaBoll(ctx, b, h) {
  ctx.fillStyle = '#f3f5f8'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 14; i++) {
    const x = ((i * 0.618) % 1) * b, y = (0.15 + ((i * 0.37) % 0.7)) * h, r = h * 0.09;
    ctx.fillStyle = i % 3 ? '#0e2c5c' : '#1d57a8'; ctx.beginPath();
    for (let k = 0; k < 5; k++) { const v = (k / 5) * Math.PI * 2 + i; ctx.lineTo(x + Math.cos(v) * r * 1.6, y + Math.sin(v) * r); }
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(14,44,92,.35)'; ctx.lineWidth = 2; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, (i / 8) * h); ctx.bezierCurveTo(b * 0.3, (i / 8) * h + 20, b * 0.7, (i / 8) * h - 20, b, (i / 8) * h); ctx.stroke(); }
}
// Handduken: vit frotté med två blå ränder
function ritaHandduk(ctx, b, h) {
  ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${slump() * 0.05})`; ctx.fillRect(slump() * b, slump() * h, 2, 2); }
  ctx.fillStyle = '#1d57a8'; ctx.fillRect(0, h * 0.18, b, h * 0.08); ctx.fillRect(0, h * 0.74, b, h * 0.08);
}
// Väskan: marinblå med vit rand
function ritaVaska(ctx, b, h) {
  ctx.fillStyle = '#10264a'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(255,255,255,${slump() * 0.03})`; ctx.fillRect(slump() * b, slump() * h, 2, 2); }
  ctx.fillStyle = '#e8edf4'; ctx.fillRect(0, h * 0.42, b, h * 0.06);
}
// Klockans urtavla: vit med streck och siffror
function ritaUrtavla(ctx, b, h) {
  const cx = b / 2, cy = h / 2, r = b / 2;
  ctx.fillStyle = '#f4f5f7'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0e2c5c'; for (let i = 0; i < 60; i++) { const v = (i / 60) * Math.PI * 2; const l = i % 5 ? 0.05 : 0.11; ctx.lineWidth = i % 5 ? 3 : 8; ctx.beginPath(); ctx.moveTo(cx + Math.sin(v) * r * 0.9, cy - Math.cos(v) * r * 0.9); ctx.lineTo(cx + Math.sin(v) * r * (0.9 - l), cy - Math.cos(v) * r * (0.9 - l)); ctx.stroke(); }
  ctx.fillStyle = '#0e2c5c'; ctx.font = `600 ${Math.round(r * 0.17)}px Poppins, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const v = (i / 12) * Math.PI * 2; ctx.fillText(String(i), cx + Math.sin(v) * r * 0.66, cy - Math.cos(v) * r * 0.66); }
}
// Kakel i duschen: små vita plattor med fogar
function ritaKakel(ctx, b, h) {
  ctx.fillStyle = '#9aa7b6'; ctx.fillRect(0, 0, b, h);
  const s = b / 8; for (let y = 0; y < h; y += s) for (let x = 0; x < b; x += s) { ctx.fillStyle = `rgb(${222 + slump() * 14}, ${228 + slump() * 12}, ${236 + slump() * 10})`; ctx.fillRect(x + 2, y + 2, s - 4, s - 4); }
}
// "IFK GÖTEBORG" över bakväggens skåp: bakgrundsbelysta bokstäver (vita med blått sken)
function ritaIfkText(ctx, b, h) {
  ctx.clearRect(0, 0, b, h);
  ctx.font = `700 ${Math.round(h * 0.62)}px Poppins, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(h * 0.12)}px`;
  // ett mjukt blått sken bakom (eget lager, svagt) och skarpa vita bokstäver med en tunn blå kant ovanpå
  ctx.save(); ctx.shadowColor = 'rgba(110, 170, 255, .85)'; ctx.shadowBlur = h * 0.16; ctx.fillStyle = 'rgba(120, 175, 255, .5)';
  ctx.fillText('IFK GÖTEBORG', b / 2, h / 2 + h * 0.03); ctx.restore();
  ctx.lineJoin = 'round'; ctx.lineWidth = h * 0.035; ctx.strokeStyle = 'rgba(150, 196, 255, .55)'; ctx.strokeText('IFK GÖTEBORG', b / 2, h / 2 + h * 0.03);
  ctx.fillStyle = '#ffffff'; ctx.fillText('IFK GÖTEBORG', b / 2, h / 2 + h * 0.03);
}

/* ---- taktikskärmens bild: glaskort per steg, planen med neonlinjer, rubrikrad (stegens text är knappar ovanpå) ---- */
function ritaTavla(ctx, b, h, d) {
  const X = (f) => f * b, Y = (f) => f * h;
  // bakgrund: djup smaragd med ett mjukt ljus uppe till vänster och ett fint punktraster – en digital taktikskärm
  const g = ctx.createLinearGradient(0, 0, b, h); g.addColorStop(0, '#0d251f'); g.addColorStop(0.55, '#091b17'); g.addColorStop(1, '#061311');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
  const ljus = ctx.createRadialGradient(X(0.18), Y(0.02), 0, X(0.18), Y(0.02), X(0.75)); ljus.addColorStop(0, 'rgba(126, 224, 195, .11)'); ljus.addColorStop(1, 'rgba(126, 224, 195, 0)');
  ctx.fillStyle = ljus; ctx.fillRect(0, 0, b, h);
  ctx.fillStyle = 'rgba(255, 255, 255, .03)'; for (let y = 24; y < h; y += 30) for (let x = 24; x < b; x += 30) ctx.fillRect(x, y, 2, 2);
  // rubrikraden: bara ett svagt glasband och ljuslinjen under – texten (U-märket, SÄLJTAVLAN, LIVE, öppet värde och datum) är riktig
  // text ovanpå skärmen (.ss-rubrik), annars blev den några suddiga pixlar när tavlan är liten i bild
  { const gb = ctx.createLinearGradient(0, Y(0.012), 0, Y(0.1)); gb.addColorStop(0, 'rgba(255, 255, 255, .045)'); gb.addColorStop(1, 'rgba(255, 255, 255, .01)');
    ctx.fillStyle = gb; ctx.beginPath(); ctx.roundRect(X(TV.lista0), Y(0.014), X(TV.plan1 - TV.lista0), Y(0.082), 22); ctx.fill(); }
  const lin = ctx.createLinearGradient(X(TV.lista0), 0, X(TV.plan1), 0); lin.addColorStop(0, 'rgba(126, 224, 195, 0)'); lin.addColorStop(0.3, 'rgba(126, 224, 195, .35)'); lin.addColorStop(1, 'rgba(167, 210, 255, 0)');
  ctx.fillStyle = lin; ctx.fillRect(X(TV.lista0), Y(0.103), X(TV.plan1 - TV.lista0), 2);
  // korten: ett glaskort per steg med en lysande kant i stegets färg och en mätare (värdet mot det största öppna steget)
  const max = d ? Math.max(1, ...d.steg.slice(0, 4).map((x) => x.varde)) : 1;
  STEG_ID.forEach((id, k) => {
    const farg = hex(FARGER[id]);
    const x0 = X(TV.lista0), x1 = X(TV.lista1), y0 = Y(TV.rad0 + k * RAD_H + 0.008), y1 = Y(TV.rad0 + (k + 1) * RAD_H - 0.008);
    const kg = ctx.createLinearGradient(0, y0, 0, y1); kg.addColorStop(0, 'rgba(255, 255, 255, .1)'); kg.addColorStop(1, 'rgba(255, 255, 255, .03)');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 24); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .09)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.shadowColor = farg; ctx.shadowBlur = 18; ctx.fillStyle = farg; ctx.beginPath(); ctx.roundRect(x0 + 14, y0 + 20, 8, y1 - y0 - 40, 4); ctx.fill(); ctx.restore();
    const st = d && d.steg[k]; const andel = !st ? 0 : k === 4 ? (st.antal ? 1 : 0) : st.varde / max;
    const mx0 = X(TV.text0), mx1 = x1 - 26, my = y1 - 30;
    ctx.fillStyle = 'rgba(255, 255, 255, .08)'; ctx.beginPath(); ctx.roundRect(mx0, my, mx1 - mx0, 10, 5); ctx.fill();
    if (andel > 0) {
      const w = Math.max(14, (mx1 - mx0) * klamp(andel));
      const mg = ctx.createLinearGradient(mx0, 0, mx0 + w, 0); mg.addColorStop(0, farg); mg.addColorStop(1, '#e8fff8');
      ctx.save(); ctx.shadowColor = farg; ctx.shadowBlur = 14; ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(mx0, my, w, 10, 5); ctx.fill(); ctx.restore();
    }
  });
  // planen: mörk gräsyta med mjukt ljus, neonvita linjer med mint sken, målet längst ned (= signerad order)
  const px0 = X(TV.plan0), px1 = X(TV.plan1), py0 = Y(TV.rad0), py1 = Y(TV.mal), pb = px1 - px0, ph = py1 - py0, mx = (px0 + px1) / 2;
  const gras = ctx.createLinearGradient(0, py0, 0, Y(TV.rad1)); gras.addColorStop(0, '#0f3528'); gras.addColorStop(1, '#0b2a20');
  ctx.fillStyle = gras; ctx.beginPath(); ctx.roundRect(px0 - 14, py0 - 14, pb + 28, Y(TV.rad1) - py0 + 10, 22); ctx.fill();
  const gl = ctx.createRadialGradient(mx, py0 + ph * 0.45, 0, mx, py0 + ph * 0.45, pb * 0.8); gl.addColorStop(0, 'rgba(126, 224, 195, .07)'); gl.addColorStop(1, 'rgba(126, 224, 195, 0)');
  ctx.fillStyle = gl; ctx.fillRect(px0 - 14, py0 - 14, pb + 28, Y(TV.rad1) - py0 + 10);
  // radernas linjer över planen (där magneterna står) – tunna och svaga
  ctx.fillStyle = 'rgba(255, 255, 255, .06)'; for (let k = 0; k < 4; k++) ctx.fillRect(px0 + 16, Y(radMitt(k)) - 1, pb - 32, 2);
  ctx.save(); ctx.strokeStyle = 'rgba(236, 255, 248, .86)'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(126, 224, 195, .6)'; ctx.shadowBlur = 12;
  ctx.strokeRect(px0, py0, pb, ph);
  ctx.beginPath(); ctx.arc(mx, py0, pb * 0.135, 0, Math.PI); ctx.stroke();
  const sb = pb * 0.59, sd = ph * 0.3; ctx.strokeRect(mx - sb / 2, py1 - sd, sb, sd);
  const mb = pb * 0.27, md = ph * 0.1; ctx.strokeRect(mx - mb / 2, py1 - md, mb, md);
  ctx.beginPath(); ctx.arc(mx, py1 - ph * 0.2, pb * 0.135, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
  for (const [cx, a0, a1] of [[px0, 0, Math.PI / 2], [px1, Math.PI / 2, Math.PI]]) { ctx.beginPath(); ctx.arc(cx, py1, 16, a0 - Math.PI / 2, a1 - Math.PI / 2, false); ctx.stroke(); }
  ctx.fillStyle = 'rgba(236, 255, 248, .9)'; ctx.beginPath(); ctx.arc(mx, py0, 7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(mx, py1 - ph * 0.2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // målet: nätet glöder i mint
  const gb = pb * 0.16, gd = Y(TV.rad1) - py1 - 6;
  const ng = ctx.createLinearGradient(0, py1, 0, py1 + gd); ng.addColorStop(0, 'rgba(126, 224, 195, .2)'); ng.addColorStop(1, 'rgba(126, 224, 195, .04)');
  ctx.fillStyle = ng; ctx.fillRect(mx - gb / 2, py1, gb, gd);
  ctx.save(); ctx.beginPath(); ctx.rect(mx - gb / 2, py1, gb, gd); ctx.clip(); ctx.strokeStyle = 'rgba(126, 224, 195, .35)'; ctx.lineWidth = 2;
  for (let x = -gd; x < gb + gd; x += 14) { ctx.beginPath(); ctx.moveTo(mx - gb / 2 + x, py1); ctx.lineTo(mx - gb / 2 + x + gd, py1 + gd); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx - gb / 2 + x + gd, py1); ctx.lineTo(mx - gb / 2 + x, py1 + gd); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = '#c9f5e7'; ctx.lineWidth = 6; ctx.shadowColor = 'rgba(126, 224, 195, .9)'; ctx.shadowBlur = 16; ctx.strokeRect(mx - gb / 2, py1, gb, gd); ctx.restore();
}

/* ---- scenen ------------------------------------------------------------------------------------- */
let api = null;
let senasteData = null;

async function bygg(s) {
  const { THREE } = s;
  const lag = s.kvalitet === 'lag', mobil = s.kvalitet === 'mobil', inbyggd = !!s.integrerad;
  const direktStart = s.lugn || lag;
  const andas = () => new Promise((r) => setTimeout(r, 0)); // låt sidan andas mellan etapperna
  const rum = new THREE.Group(); rum.name = 'omkladningsrum'; s.scene.add(rum);
  s.scene.background = null;
  const additiv = (m) => Object.assign(m, { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const tex = (b, h, rita, upprepa) => { const t = s.canvasTextur(b, h, rita); if (upprepa) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...upprepa); } return t; };
  const std = (opt) => s.stada(new THREE.MeshStandardMaterial(opt));
  const ljusGrupper = []; // { mat, bas: Color, niva() } – lampor och ledlister som tänds i introt
  // mipmap-bias på materialets karta: läses en halv–en nivå skarpare (tavlans linjer, tröjornas nummer, skyltarna)
  const skarpKarta = (sh, bias) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${bias.toFixed(2)} )`)); };
  const skarp = (mat, bias = -0.65) => { const fore = mat.onBeforeCompile; mat.onBeforeCompile = (sh, rr) => { if (fore) fore(sh, rr); skarpKarta(sh, bias); };
    const nyckel = mat.customProgramCacheKey; mat.customProgramCacheKey = () => `${nyckel ? nyckel.call(mat) : ''}|skarp${bias}`; return mat; };
  const glodMat = (farg, styrka) => { const m = s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(farg).multiplyScalar(styrka), toneMapped: false })); return m; };

  /* Miljön för reflexer (golv, tavlans blanka yta, krom): ett mörkt rum med takets ljuslister och varma skåplister. Byggs en gång. */
  const miljoTex = (() => {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x05080d);
    const delar = [];
    const panel = (farg, styrka, pos, b, h, rotX = 0) => {
      const geo = new THREE.PlaneGeometry(b, h), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(farg).multiplyScalar(styrka), side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rotX) m.rotation.x = rotX; else m.lookAt(0, 1.2, 0); sc.add(m); delar.push(geo, mat);
    };
    for (const x of [-1.2, 0, 1.2]) panel(0xeaf2ff, 3.2, [x, 2.74, 0], 0.12, 8, Math.PI / 2);
    panel(0xffc98a, 1.6, [-2.4, 1.75, 0], 0.05, 7); panel(0xffc98a, 1.6, [2.4, 1.75, 0], 0.05, 7);
    panel(0x1d57a8, 0.6, [0, 1.4, -4], 5, 2.6); panel(0x8fb9ff, 1.2, [0, 2.45, -3.9], 3.6, 0.3);
    panel(0x223348, 0.5, [0, -0.2, 0], 6, 9, Math.PI / 2);
    const gen = new THREE.PMREMGenerator(s.renderer);
    const rt = gen.fromScene(sc, 0.02);
    gen.dispose(); delar.forEach((x) => x.dispose());
    return s.stada(rt).texture;
  })();
  const miljo = (m, styrka) => { m.envMap = miljoTex; m.envMapIntensity = styrka; return m; };

  /* ljuset: svagt himmelsljus, takets nyckelljus (statisk skugga), varma punktljus vid skåpen och spottar på tavlan och tröjan */
  if (s.ljus) {
    s.ljus.himmel.color.set(0x9fb8d8); s.ljus.himmel.groundColor.set(0x1b140e); s.ljus.himmel.intensity = 0.4;
    s.ljus.nyckel.position.set(0.6, 6.5, 2.2); s.ljus.nyckel.target.position.set(0, 0, -1); s.ljus.nyckel.intensity = 0.9;
    if (s.ljus.nyckel.target.parent !== s.scene) s.scene.add(s.ljus.nyckel.target);
    s.ljus.fyll.position.set(-3, 2.2, 4); s.ljus.fyll.intensity = 0.22;
    s.ljus.kant.visible = false;
    s.skuggor.omfang(5.2, 14);
  }
  const ljusBas = s.ljus ? { himmel: 0.4, nyckel: 0.9, fyll: 0.22 } : null;
  const varmV = new THREE.PointLight(0xffc690, 0, 6, 2); varmV.position.set(-1.9, 2.15, 0.7);
  const varmH = new THREE.PointLight(0xffc690, 0, 6, 2); varmH.position.set(1.8, 2.1, -1.4);
  const varmV2 = new THREE.PointLight(0xffc690, 0, 5, 2); varmV2.position.set(-1.75, 2.05, -2.5);
  const varmH2 = new THREE.PointLight(0xffc690, 0, 5, 2); varmH2.position.set(1.75, 2.05, -2.9);
  rum.add(varmV, varmH, varmV2, varmH2);
  const spotTavla = new THREE.SpotLight(0xf1f5ff, 0, 0, 0.5, 0.65, 2);
  spotTavla.position.set(TAVLA.x + 1.15, RUM.h - 0.04, TAVLA.z + 1.45); spotTavla.target.position.set(TAVLA.x, TAVLA.y - 0.1, TAVLA.z); rum.add(spotTavla, spotTavla.target);
  const spotTroja = new THREE.SpotLight(0xffe2bd, 0, 0, 0.36, 0.7, 2);
  rum.add(spotTroja, spotTroja.target);

  /* ---- golv, väggar, tak ---- */
  const golvMat = miljo(std({ map: tex(2048, 2048, ritaGolv, [2.5, 4.2]), roughness: 0.34, metalness: 0, roughnessMap: s.textur.brus }), 0.85);
  const golv = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(RUM.x * 2, RUM.z1 - RUM.z0)), golvMat);
  golv.rotation.x = -Math.PI / 2; golv.position.set(0, 0, (RUM.z0 + RUM.z1) / 2); golv.receiveShadow = true; rum.add(golv);
  const matta = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(1.7, RUM.z1 - RUM.z0 - 1.0)), std({ map: tex(256, 1024, ritaMatta), roughness: 0.88 }));
  matta.rotation.x = -Math.PI / 2; matta.position.set(TAVLA.x, 0.004, (RUM.z0 + RUM.z1) / 2 + 0.3); matta.receiveShadow = true; rum.add(matta);
  const vaggMat = std({ map: tex(512, 512, ritaVagg, [3, 2]), roughness: 0.92 });
  const vagg = (b, h, pos, rotY) => { const m = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(b, h)), vaggMat); m.position.set(...pos); m.rotation.y = rotY; m.receiveShadow = true; rum.add(m); return m; };
  vagg(RUM.z1 - RUM.z0, RUM.h, [-RUM.x, RUM.h / 2, (RUM.z0 + RUM.z1) / 2], Math.PI / 2);
  vagg(RUM.z1 - RUM.z0, RUM.h, [RUM.x, RUM.h / 2, (RUM.z0 + RUM.z1) / 2], -Math.PI / 2);
  // bakväggen: blåvita ränder
  const bakvagg = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(RUM.x * 2, RUM.h)), std({ map: tex(1024, 512, ritaRander), roughness: 0.8 }));
  bakvagg.position.set(0, RUM.h / 2, RUM.z0); rum.add(bakvagg);
  const tak = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(RUM.x * 2, RUM.z1 - RUM.z0)), std({ color: 0x0a111b, roughness: 0.95 }));
  tak.rotation.x = Math.PI / 2; tak.position.set(0, RUM.h, (RUM.z0 + RUM.z1) / 2); rum.add(tak);
  // framväggen med dörren: syns bara i introt, när kameran glider in genom dörröppningen. Gruppen flyttas i sidled så att
  // öppningen alltid står där kameran passerar (rama sätter x).
  const DORR = { b: 1.3, h: 2.36 };
  const framvagg = new THREE.Group(); framvagg.position.z = RUM.z1; rum.add(framvagg);
  { const fMat = s.stada(new THREE.MeshStandardMaterial({ map: vaggMat.map, color: 0xb8c4d2, roughness: 0.9, side: THREE.DoubleSide }));
    const del = (b, h, x, y) => { const m = new THREE.Mesh(s.stada(new THREE.BoxGeometry(b, h, 0.12)), fMat); m.position.set(x, y, 0); framvagg.add(m); };
    del(4, RUM.h + 0.4, -DORR.b / 2 - 2, (RUM.h + 0.4) / 2); del(4, RUM.h + 0.4, DORR.b / 2 + 2, (RUM.h + 0.4) / 2); del(DORR.b, RUM.h + 0.4 - DORR.h, 0, DORR.h + (RUM.h + 0.4 - DORR.h) / 2);
    const karm = (b, h, x, y) => { const m = new THREE.Mesh(s.stada(new THREE.BoxGeometry(b, h, 0.16)), std({ color: 0x0e2c5c, roughness: 0.5 })); m.position.set(x, y, 0); framvagg.add(m); };
    karm(0.07, DORR.h, -DORR.b / 2 + 0.035, DORR.h / 2); karm(0.07, DORR.h, DORR.b / 2 - 0.035, DORR.h / 2); karm(DORR.b, 0.07, 0, DORR.h - 0.035); }
  await andas(); if (s.forstord) return null;

  /* ---- skåpen: trästomme, blått bakstycke, sits med dyna, hylla, ledlist, krokar och nummerskylt ---- */
  // Varje skåp byggs i egna koordinater (x = bredd, y = upp, +z = ut mot rummet, fronten i z = 0) och flyttas till sin plats.
  const skapLista = []; // { m: Matrix4, nummer, ordning, sida, z/x }
  const placering = (sida, p) => {
    const m = new THREE.Matrix4();
    if (sida === 'v') m.makeRotationY(Math.PI / 2).setPosition(-RUM.x + SKAP.djup, 0, p);
    else if (sida === 'h') m.makeRotationY(-Math.PI / 2).setPosition(RUM.x - SKAP.djup, 0, p);
    else m.makeTranslation(p, 0, RUM.z0 + SKAP.djup);
    return m;
  };
  SIDA_Z.forEach((z, i) => { if (z !== DUSCH_Z) skapLista.push({ m: placering('v', z), nummer: NUMMER_V[i], ordning: i, sida: 'v', p: z }); });
  BAK_X.forEach((x, i) => skapLista.push({ m: placering('b', x), nummer: NUMMER_B[i], ordning: 7 + i, sida: 'b', p: x }));
  SIDA_Z.forEach((z, i) => skapLista.push({ m: placering('h', z), nummer: NUMMER_H[i], ordning: i, sida: 'h', p: z, gustav: z === GUSTAV_Z }));
  const trad = [], tyg = [], dynor = [], morkt = [], lister = [], metall = [], skyltar = [], spill = [];
  const skyltText = skapLista.map((x) => x.nummer || '');
  const lada = (b, h, d, x, y, z, m, lista, a = 0, uv) => { const g = new THREE.BoxGeometry(b, h, d); g.translate(x, y, z); g.applyMatrix4(m); lista.push({ g, a, uv }); };
  skapLista.forEach((sk, n) => {
    const { m } = sk; const B = SKAP.b, H = SKAP.h, D = SKAP.djup, t = 0.026;
    // sidor (delas med grannen – var andra ritas dubbelt, osynligt), tak, botten och hylla
    lada(t, H, D, -B / 2, H / 2, -D / 2, m, trad); lada(t, H, D, B / 2, H / 2, -D / 2, m, trad);
    lada(B + t, 0.05, D + 0.02, 0, H + 0.025, -D / 2 + 0.01, m, trad);
    lada(B - t, 0.022, D - 0.04, 0, SKAP.hylla, -D / 2 - 0.02, m, trad);
    lada(B - t, 0.06, D - 0.02, 0, SKAP.sits - 0.05, -D / 2, m, trad);       // sitsens stomme
    lada(B - t, SKAP.sits - 0.08, 0.02, 0, (SKAP.sits - 0.08) / 2, -0.03, m, trad); // frontlist under sitsen
    lada(B - t, 0.12, 0.02, 0, H - 0.04, -0.015, m, trad);                     // skylthyllan överst
    // bakstycket (blått tyg) och mörkret under sitsen
    lada(B - t, H - SKAP.sits, 0.012, 0, SKAP.sits + (H - SKAP.sits) / 2, -D + 0.008, m, tyg);
    lada(B - t, SKAP.sits - 0.1, 0.01, 0, (SKAP.sits - 0.1) / 2 + 0.02, -D + 0.01, m, morkt);
    // dynan (rundad)
    const dyna = s.rundadLada(B - t - 0.03, 0.055, D - 0.06, 0.02, 3); dyna.translate(0, SKAP.sits + 0.005, -D / 2 + 0.005); dyna.applyMatrix4(m); dynor.push({ g: dyna });
    // ledlisten under hyllan (tänds i introt bakåt i rummet – a = ordningen) och krokarna
    lada(B - 0.08, 0.01, 0.016, 0, SKAP.hylla - 0.017, -0.06, m, lister, 0.25 + sk.ordning * 0.11);
    for (const kx of [-0.22, 0, 0.22]) { const k = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8); k.rotateX(Math.PI / 2); k.translate(kx, 1.66, -D + 0.045); k.applyMatrix4(m); metall.push({ g: k }); }
    // nummerskylten: en ruta i atlasen
    const cell = n; const cu = (cell % SKYLT.kol) / SKYLT.kol, cv = Math.floor(cell / SKYLT.kol) / SKYLT.rad;
    const sg = new THREE.PlaneGeometry(0.2, 0.085); sg.translate(0, H - 0.04, 0.0005); sg.applyMatrix4(m);
    skyltar.push({ g: sg, uv: (u, v) => [cu + u / SKYLT.kol, 1 - cv - (1 - v) / SKYLT.rad] });
  });
  // ljusfallet från ledlisten på skåpets bakstycke (ett plan per skåp, additivt, starkast under hyllan)
  skapLista.forEach((sk) => { const g = new THREE.PlaneGeometry(SKAP.b - 0.06, SKAP.hylla - SKAP.sits - 0.04); g.translate(0, SKAP.sits + (SKAP.hylla - SKAP.sits) / 2, -SKAP.djup + 0.018); g.applyMatrix4(sk.m); spill.push({ g, a: 0.25 + sk.ordning * 0.11 }); });
  // hörnen bak (mellan bakväggens skåp och sidoskåpen) – en träpanel
  for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.2, SKAP.h + 0.05, SKAP.djup); g.translate(sx * (BAK_X[3] + SKAP.b / 2 + 0.1), (SKAP.h + 0.05) / 2, RUM.z0 + SKAP.djup / 2); trad.push({ g }); }
  // listen ovanför skåpen (varm ljuslist som löper runt rummet)
  for (const sx of [-1, 1]) lada(0.03, 0.012, 5.6, 0, 0, 0, new THREE.Matrix4().makeTranslation(sx * (RUM.x - SKAP.djup + 0.02), SKAP.h + 0.07, RUM.z0 + 0.3 + 2.8), lister, 0.15);
  const traMat = std({ map: tex(1024, 1024, ritaTra), roughness: 0.52, metalness: 0, roughnessMap: s.textur.brus }); miljo(traMat, 0.35);
  const skapTra = new THREE.Mesh(slaIhop(THREE, trad), traMat); skapTra.castShadow = true; skapTra.receiveShadow = true; rum.add(skapTra);
  const tygMat = std({ map: tex(256, 256, ritaTyg, [2, 3]), roughness: 0.9 });
  const skapTyg = new THREE.Mesh(slaIhop(THREE, tyg), tygMat); skapTyg.receiveShadow = true; rum.add(skapTyg);
  const dynMat = miljo(std({ color: 0x0f2346, roughness: 0.42, metalness: 0 }), 0.6);
  const skapDyna = new THREE.Mesh(slaIhop(THREE, dynor), dynMat); skapDyna.receiveShadow = true; rum.add(skapDyna);
  rum.add(new THREE.Mesh(slaIhop(THREE, morkt), std({ color: 0x070b12, roughness: 1 })));
  const kromMat = miljo(std({ color: 0xd8dde4, roughness: 0.22, metalness: 1 }), 1.2);
  rum.add(new THREE.Mesh(slaIhop(THREE, metall), kromMat));
  const skyltTex = s.canvasTextur(SKYLT.b, SKYLT.h, (ctx, b, h) => ritaSkyltar(ctx, b, h, skyltText));
  const skyltMat = skarp(std({ map: skyltTex, roughness: 0.4, transparent: true, alphaTest: 0.3 }));
  rum.add(new THREE.Mesh(slaIhop(THREE, skyltar), skyltMat));
  // ledlisterna: varmt ljus som tänds i ordning (aVarde = när) och flimrar till lite när de slår på
  const listUni = { uIn: { value: direktStart ? 99 : 0 }, uTid: { value: 0 }, uFarg: { value: new THREE.Color(0xffc690).multiplyScalar(1.7) } };
  const listMat = s.stada(new THREE.ShaderMaterial({ uniforms: listUni, toneMapped: false,
    vertexShader: 'attribute float aVarde; varying float vV; void main(){ vV = aVarde; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uIn; uniform float uTid; uniform vec3 uFarg; varying float vV;
      void main(){ float p = clamp((uIn - vV) * 3.0, 0.0, 1.0); float fl = step(0.45, fract(sin(floor(uTid * 18.0) + vV * 91.7) * 43758.5));
        float pa = p >= 1.0 ? 1.0 : p * mix(0.25, 1.0, fl); gl_FragColor = vec4(uFarg * pa, 1.0); }` }));
  rum.add(new THREE.Mesh(slaIhop(THREE, lister), listMat));
  const spillMat = additiv(s.stada(new THREE.ShaderMaterial({ uniforms: listUni, toneMapped: false,
    vertexShader: 'attribute float aVarde; varying float vV; varying vec2 vUv; void main(){ vV = aVarde; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uIn; uniform vec3 uFarg; varying float vV; varying vec2 vUv;
      void main(){ float p = clamp((uIn - vV) * 3.0, 0.0, 1.0); float y = vUv.y * vUv.y * vUv.y; float x = smoothstep(0.0, 0.35, vUv.x) * smoothstep(0.0, 0.35, 1.0 - vUv.x);
        gl_FragColor = vec4(uFarg * 0.16, p * y * (0.35 + 0.65 * x)); }` })));
  const spillMesh = new THREE.Mesh(slaIhop(THREE, spill), spillMat); spillMesh.renderOrder = 1; rum.add(spillMesh);
  await andas(); if (s.forstord) return null;

  /* ---- duschen: en öppning i vänster vägg längst bak, kakel och ånga som driver ut ---- */
  const duschM = placering('v', DUSCH_Z);
  const kakelMat = std({ map: tex(256, 256, ritaKakel, [3, 6]), roughness: 0.25 }); miljo(kakelMat, 0.6);
  const dusch = [];
  { const g = new THREE.BoxGeometry(SKAP.b, SKAP.h + 0.05, 0.02); g.translate(0, (SKAP.h + 0.05) / 2, -SKAP.djup + 0.01); g.applyMatrix4(duschM); dusch.push({ g }); }
  for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.02, SKAP.h + 0.05, SKAP.djup); g.translate(sx * SKAP.b / 2, (SKAP.h + 0.05) / 2, -SKAP.djup / 2); g.applyMatrix4(duschM); dusch.push({ g }); }
  rum.add(new THREE.Mesh(slaIhop(THREE, dusch), kakelMat));
  const duschLjus = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(SKAP.b - 0.1, 0.03)), glodMat(0xdfeaff, 2.2));
  duschLjus.position.set(-RUM.x + 0.06, SKAP.h - 0.08, DUSCH_Z); duschLjus.rotation.y = Math.PI / 2; rum.add(duschLjus);
  const anga = [];
  if (!lag) {
    const angaMat = () => s.stada(new THREE.SpriteMaterial({ map: s.textur.rund, color: 0xdbe6f2, transparent: true, opacity: 0, depthWrite: false }));
    for (let i = 0; i < (mobil || inbyggd ? 9 : 14); i++) { const sp = new THREE.Sprite(angaMat()); sp.userData = { fas: i / 14 + slump() * 0.05, x: slump(), z: slump() - 0.5 }; rum.add(sp); anga.push(sp); }
  }

  /* ---- taket: tre långa ljuslister (lysrör) och nedljus över skåpen ---- */
  const takLister = [];
  [-1.15, 0, 1.15].forEach((x, i) => {
    // lysrören slutar en bit före dörren: närmast kameran bländade de i bildens överkant
    const g = new THREE.Mesh(s.stada(new THREE.BoxGeometry(0.09, 0.02, 5.6)), glodMat(0xeef4ff, 0));
    g.position.set(x, RUM.h - 0.012, RUM.z0 + 0.4 + 2.8); rum.add(g);
    const ram = new THREE.Mesh(s.stada(new THREE.BoxGeometry(0.13, 0.03, 5.65)), std({ color: 0x1a2330, roughness: 0.6, metalness: 0.5 }));
    ram.position.set(x, RUM.h - 0.006, g.position.z); rum.add(ram);
    takLister.push({ mesh: g, start: 0.2 + i * 0.28, bas: new THREE.Color(0xeef4ff).multiplyScalar(1.55) });
  });
  const nedljus = [];
  for (const sx of [-1, 1]) for (const z of SIDA_Z) { const g = new THREE.CircleGeometry(0.055, 18); g.rotateX(Math.PI / 2); g.translate(sx * (RUM.x - SKAP.djup - 0.32), RUM.h - 0.002, z); nedljus.push({ g, a: 0.3 + (2 - z) * 0.06 }); }
  rum.add(new THREE.Mesh(slaIhop(THREE, nedljus), listMat));

  /* ---- taket och golvet: ventilationsdon, sprinklers, högtalare, golvbrunn och en brandsläckare ---- */
  const galler = (ctx, b, h) => { ctx.fillStyle = '#c9d0d8'; ctx.fillRect(0, 0, b, h); ctx.fillStyle = '#1a2129'; for (let y = 10; y < h - 8; y += 12) ctx.fillRect(10, y, b - 20, 6); ctx.strokeStyle = '#8b96a3'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, b - 6, h - 6); };
  const ventMat = std({ map: s.canvasTextur(256, 256, galler), roughness: 0.6, metalness: 0.3 });
  const ventiler = [];
  for (const x of [-0.58, 0.58]) for (const z of [-2.7, -0.7, 1.3]) { const g = new THREE.PlaneGeometry(0.42, 0.42); g.rotateX(Math.PI / 2); g.translate(x, RUM.h - 0.004, z); ventiler.push({ g }); }
  rum.add(new THREE.Mesh(slaIhop(THREE, ventiler), ventMat));
  const sprink = [];
  for (const x of [-1.6, 1.6]) for (const z of [-3.0, -1.2, 0.6, 2.4]) { const a = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10); a.translate(x, RUM.h - 0.025, z); const b = new THREE.CylinderGeometry(0.03, 0.03, 0.004, 14); b.translate(x, RUM.h - 0.052, z); const r = new THREE.CylinderGeometry(0.035, 0.035, 0.006, 14); r.translate(x, RUM.h - 0.003, z); sprink.push({ g: a }, { g: b }, { g: r }); }
  rum.add(new THREE.Mesh(slaIhop(THREE, sprink), kromMat));
  const hogtalare = (ctx, b, h) => { ctx.fillStyle = '#e8ecf1'; ctx.beginPath(); ctx.arc(b / 2, h / 2, b / 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(30,38,48,.55)'; for (let y = 8; y < h; y += 9) for (let x = 8; x < b; x += 9) if (Math.hypot(x - b / 2, y - h / 2) < b * 0.4) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); } };
  const hogMat = std({ map: s.canvasTextur(128, 128, hogtalare), roughness: 0.55, transparent: true, alphaTest: 0.4 });
  for (const [x, z] of [[-0.6, 0.3], [0.6, -1.7]]) { const m = new THREE.Mesh(s.stada(new THREE.CircleGeometry(0.11, 24)), hogMat); m.rotation.x = Math.PI / 2; m.position.set(x, RUM.h - 0.005, z); rum.add(m); }
  { const brunn = (ctx, b, h) => { ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(b / 2, h / 2, b / 2 - 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0e1318'; for (let k = 0; k < 9; k++) { const y = h * (0.2 + k * 0.075); const w = Math.sqrt(Math.max(0, (b / 2 - 10) ** 2 - (y - h / 2) ** 2)) * 2; ctx.fillRect(b / 2 - w / 2, y, w, 6); } ctx.strokeStyle = '#6c7682'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(b / 2, h / 2, b / 2 - 5, 0, Math.PI * 2); ctx.stroke(); };
    const m = new THREE.Mesh(s.stada(new THREE.CircleGeometry(0.12, 28)), miljo(std({ map: s.canvasTextur(128, 128, brunn), roughness: 0.35, metalness: 0.8, transparent: true, alphaTest: 0.3 }), 0.8));
    m.rotation.x = -Math.PI / 2; m.position.set(TAVLA.x + 0.95, 0.003, TAVLA.z + 1.25); m.receiveShadow = true; rum.add(m); }
  { const sl = new THREE.Group(); sl.position.set(RUM.x - 0.62, 0, RUM.z0 + 0.3); rum.add(sl);
    const kropp = new THREE.Mesh(s.stada(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 20)), miljo(std({ color: 0xc8231c, roughness: 0.32 }), 0.7)); kropp.position.y = 0.28; sl.add(kropp);
    const topp = new THREE.Mesh(s.stada(new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), kropp.material); topp.position.y = 0.53; sl.add(topp);
    const ventil = new THREE.Mesh(s.stada(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 10)), std({ color: 0x1a1d22, roughness: 0.4, metalness: 0.6 })); ventil.position.y = 0.6; sl.add(ventil);
    const slang = new THREE.Mesh(s.stada(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.6, 0), new THREE.Vector3(0.09, 0.55, 0.02), new THREE.Vector3(0.1, 0.3, 0.03), new THREE.Vector3(0.085, 0.16, 0.02)]), 16, 0.008, 6)), std({ color: 0x14161a, roughness: 0.7 })); sl.add(slang);
    const ram = new THREE.Mesh(s.stada(new THREE.BoxGeometry(0.2, 0.03, 0.16)), std({ color: 0x2a2f36, roughness: 0.6 })); ram.position.y = 0.015; sl.add(ram); }

  /* ---- IFK GÖTEBORG över bakväggens skåp och klockan ---- */
  const fris = new THREE.Mesh(s.stada(new THREE.BoxGeometry(RUM.x * 2 - 0.84, 0.36, 0.06)), std({ color: 0x0b1a33, roughness: 0.6 }));
  fris.position.set(0, SKAP.h + 0.64, RUM.z0 + 0.03); rum.add(fris);
  const ifkTex = s.canvasTextur(2048, 256, ritaIfkText);
  const ifkMat = skarp(s.stada(new THREE.MeshBasicMaterial({ map: ifkTex, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(0) })), -0.6);
  const ifk = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(2.7, 0.3375)), ifkMat); ifk.position.set(0, SKAP.h + 0.64, RUM.z0 + 0.065); rum.add(ifk);
  const klocka = new THREE.Group(); klocka.position.set(1.62, SKAP.h + 0.64, RUM.z0 + 0.075); rum.add(klocka);
  klocka.scale.setScalar(1.18);
  { const ring = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.135, 0.014, 12, 56)), kromMat); klocka.add(ring);
    const tavla = new THREE.Mesh(s.stada(new THREE.CircleGeometry(0.13, 56)), skarp(std({ map: s.canvasTextur(512, 512, ritaUrtavla), roughness: 0.5 }), -0.7)); tavla.position.z = -0.005; klocka.add(tavla); }
  const visare = (l, b, farg) => { const g = new THREE.BoxGeometry(b, l, 0.004); g.translate(0, l / 2 - 0.012, 0); const m = new THREE.Mesh(s.stada(g), std({ color: farg, roughness: 0.5 })); m.position.z = 0.004; klocka.add(m); return m; };
  const timVisare = visare(0.07, 0.009, 0x0e2c5c), minVisare = visare(0.1, 0.006, 0x0e2c5c), sekVisare = visare(0.11, 0.0025, 0xe5674f);
  sekVisare.position.z = 0.007;
  await andas(); if (s.forstord) return null;

  /* ---- tröjorna i skåpen (instanser): ryggen ut, numret syns; några träningsjackor och tomma galgar ---- */
  // Atlas 4 × 5 celler: 0–18 tröjor med skåpens nummer, 19 = träningsjacka. Gustavs tröja har en egen textur i högre upplösning.
  const ATLAS = { kol: 4, rad: 5, cb: 320, ch: 400 };
  const JACKA = ATLAS.kol * ATLAS.rad - 1;
  const trojNummer = skapLista.map((x) => x.nummer);
  const atlasNummer = [...new Set(trojNummer.filter((t) => t && t !== GUSTAV.nummer))].slice(0, JACKA);
  const trojAtlas = s.canvasTextur(ATLAS.kol * ATLAS.cb, ATLAS.rad * ATLAS.ch, (ctx, b, h) => {
    ctx.clearRect(0, 0, b, h);
    for (let i = 0; i < ATLAS.kol * ATLAS.rad; i++) { const x = (i % ATLAS.kol) * ATLAS.cb, y = Math.floor(i / ATLAS.kol) * ATLAS.ch;
      if (i === JACKA) ritaTrojaRygg(ctx, x + 8, y + 8, ATLAS.cb - 16, ATLAS.ch - 16, null, null, true);
      else if (atlasNummer[i]) ritaTrojaRygg(ctx, x + 8, y + 8, ATLAS.cb - 16, ATLAS.ch - 16, atlasNummer[i]); }
  });
  // tygets form: ett rutnät som buktar (bål rundad, fållen lite utåt, axlarna sluttar) – siluetten kommer ur texturens alfa
  const trojGeo = (() => {
    const g = new THREE.PlaneGeometry(0.62, 0.775, 14, 18); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const fy = (0.3875 - y) / 0.775; const fx = x / 0.31;
      const buk = Math.cos(fx * Math.PI * 0.5) * 0.045 * (0.4 + 0.6 * Math.min(1, fy * 3)); const vag = Math.sin(fx * 9 + fy * 4) * 0.006 * fy;
      p.setZ(i, buk + vag); p.setY(i, y - Math.abs(fx) * 0.02 * (1 - fy)); }
    g.translate(0, -0.3875, 0); g.computeVertexNormals(); return s.stada(g); // origo i galgens krok (överkant)
  })();
  const svajUni = { uTid: { value: 0 } };
  const svaj = (m, instans) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTid = svajUni.uTid; sh.uniforms.uFas = m.userData.fas || { value: 0 };
      sh.vertexShader = `uniform float uTid; uniform float uFas;\n${instans ? 'attribute vec2 aAtlas;\n' : ''}${sh.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fasS = uFas + ${instans ? 'float(gl_InstanceID) * 1.37' : '0.0'};
          float ned = clamp(-position.y / 0.78, 0.0, 1.0);
          transformed.z += sin(uTid * 0.9 + fasS) * 0.018 * ned * ned;
          transformed.x += sin(uTid * 0.63 + fasS * 1.7) * 0.006 * ned;`)
        .replace('#include <uv_vertex>', instans ? `#include <uv_vertex>\n  vMapUv = vMapUv * vec2(${(1 / ATLAS.kol).toFixed(5)}, ${(1 / ATLAS.rad).toFixed(5)}) + aAtlas;` : '#include <uv_vertex>');
    };
    m.customProgramCacheKey = () => (instans ? 'troja-instans' : 'troja-gustav');
    return m;
  };
  const trojMat = skarp(svaj(std({ map: trojAtlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 }), true), -0.5);
  const hangare = skapLista.filter((x) => !x.gustav);
  const trojor = new THREE.InstancedMesh(trojGeo, trojMat, hangare.length);
  const aAtlas = new Float32Array(hangare.length * 2);
  const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sk = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  let antalTrojor = 0;
  hangare.forEach((sk, i) => {
    // var femte skåp: träningsjacka; var sjunde: tom galge (ingen tröja) – annars tröjan med skåpets nummer
    const variant = i % 7 === 5 ? 'tom' : i % 5 === 3 ? 'jacka' : 'troja';
    if (variant === 'tom') return;
    const cell = variant === 'jacka' || atlasNummer.indexOf(sk.nummer) < 0 ? JACKA : atlasNummer.indexOf(sk.nummer);
    aAtlas[antalTrojor * 2] = (cell % ATLAS.kol) / ATLAS.kol; aAtlas[antalTrojor * 2 + 1] = 1 - (Math.floor(cell / ATLAS.kol) + 1) / ATLAS.rad;
    _l.compose(_p.set(0, 1.705, -SKAP.djup + 0.17), _q.setFromEuler(_e.set(0, (slump() - 0.5) * 0.12, 0)), _sk.set(1, 1, 1));
    trojor.setMatrixAt(antalTrojor++, _m.multiplyMatrices(sk.m, _l));
  });
  trojor.count = antalTrojor;
  trojGeo.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(aAtlas, 2));
  rum.add(trojor);
  // galgarna (krom) i varje skåp – också där tröjan saknas
  const galgGeo = (() => {
    const kurva = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.2, -0.07, 0), new THREE.Vector3(-0.1, -0.025, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, -0.025, 0), new THREE.Vector3(0.2, -0.07, 0)]);
    const a = new THREE.TubeGeometry(kurva, 20, 0.006, 6, false);
    const krok = new THREE.TorusGeometry(0.022, 0.0035, 6, 16, Math.PI * 1.4); krok.rotateZ(-Math.PI * 0.2); krok.translate(0, 0.035, 0);
    const stang = new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6); stang.translate(0, 0.01, 0);
    return s.stada(slaIhop(THREE, [{ g: a }, { g: krok }, { g: stang }]));
  })();
  const galgar = new THREE.InstancedMesh(galgGeo, kromMat, skapLista.length);
  skapLista.forEach((sk, i) => { _l.compose(_p.set(0, 1.705, -SKAP.djup + 0.17), _q.identity(), _sk.set(1, 1, 1)); galgar.setMatrixAt(i, _m.multiplyMatrices(sk.m, _l)); });
  rum.add(galgar);

  /* ---- Gustavs tröja i 3D: SVENSSON 13 på en trägalge med vridbar krok, på en kromstång som går rakt ut från hans skåp ----
     (2026-10-23, "den ska se verklig ut", "man ska se vad den hänger på", "gör en riktig tröja som är 3D … inte platt och fejk")
     Bålen är ett slutet rör med volym (tvärsnittet en ellips som är tunnast vid axelsömmen, där galgen ligger inuti, och fylligast över
     bröstet), nackhål med en ribbad krage runt (djupare fram), fållen lite längre i mitten; ärmarna är egna rör som hänger snett nedåt
     med rundad axel och öppen mudd (insidan mörkare). Ingen utklippt yta – kanterna är riktig geometri. Tyget har maskor, nätväv, sömmar
     och veck (normalkarta) och ett blankt tryck (råhetskarta), MeshPhysicalMaterial med sheen. Den gungar sakta (fjäder i JS), tyget släpar
     efter och vågor rinner nedåt (shader), ett ljussvep går över trycket var nionde sekund, och den kastar skugga. Hovra: skylten (Gustav
     Svensson, nummer 13) och en liten knuff; klick: en större knuff. Reducerad rörelse: stilla. */
  const gustavSkap = skapLista.find((x) => x.gustav);
  for (let i = 0; i < 5; i++) slump(); // resten av rummet får samma slumpföljd som när tröjan ritades med ritaTrojaRygg
  // stången i skåpets koordinater: x, höjd, från staget (z0) ut till kulan (z1); kroken hänger på z = krok; tröjan vriden mot dörren
  const GD = { x: 0.05, y: 1.985, z0: -0.1, z1: 0.43, krok: 0.35, vinkel: 1.0, skala: 1.2 };
  const stor = !mobil && !lag;
  const tygKarta = (b, h, rita, linjar) => { const t = s.canvasTextur(b, h, rita); if (linjar) t.colorSpace = THREE.NoColorSpace; return t; };
  const torsoTex = tygKarta(stor ? 2048 : 1024, stor ? 1800 : 900, (ctx, b, h) => ritaGustavTorso(ctx, b, h, 'farg'));
  const torsoNormal = lag ? null : tygKarta(1024, 900, (ctx, b, h) => { ritaGustavTorso(ctx, b, h, 'hojd'); hojdTillNormal(ctx, b, h, 0.03); }, true);
  const torsoGlans = lag ? null : tygKarta(1024, 900, (ctx, b, h) => ritaGustavTorso(ctx, b, h, 'glans'), true);
  const armTex = tygKarta(512, 512, (ctx, b, h) => ritaGustavArm(ctx, b, h, 'farg'));
  const armNormal = lag ? null : tygKarta(256, 256, (ctx, b, h) => { ritaGustavArm(ctx, b, h, 'hojd'); hojdTillNormal(ctx, b, h, 0.03); }, true);
  // formen (tröjans koordinater: origo i galgens mitt, y uppåt, +z = ryggen mot dörren)
  const jamn = (a, b, x) => { const u = klamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const GK = { L: 0.76, a0: 0.198, a1: 0.206, brost: 0.042 };
  const galgY = (x) => -0.06 * Math.pow(Math.min(1, Math.abs(x) / 0.17), 1.4);                       // galgens mittlinje
  const axelY = (x) => 0.018 + galgY(x) - Math.max(0, Math.abs(x) - 0.17) * 0.5;                      // axelsömmen strax över galgen
  const nacke = (x) => 1 - jamn(0.045, 0.088, Math.abs(x));                                             // 1 i nackhålet
  const gustavGeo = (() => {
    const NU = 120, NV = 72, S = 720;
    const px = new Float32Array(S + 1), pz = new Float32Array(S + 1), cum = new Float32Array(S + 1);
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, a = GK.a0 + (GK.a1 - GK.a0) * v;
      const kropp = GK.brost * jamn(0, 0.22, v) * (1 - 0.3 * v);
      // tvärsnittet: x = −a·cos θ, z = b·sin θ. Överst är b nästan noll (axelsömmen) utom i nackhålet; strax under ligger galgen
      // inuti (en tunn lins), sedan bröstets volym. Punkterna läggs med lika långt mellan sig (texturen sträcks inte vid sidorna).
      for (let k = 0; k <= S; k++) {
        const th = (k / S) * Math.PI * 2, x = -a * Math.cos(th), ax = Math.abs(x);
        const lins = 0.016 * (1 - jamn(0.15, 0.2, ax)) * jamn(0, 0.025, v) * (1 - jamn(0.12, 0.25, v));
        const hal = 0.022 * nacke(x) * (1 - jamn(0, 0.07, v));
        px[k] = x; pz[k] = (Math.max(kropp, lins, hal) + 0.0012) * Math.sin(th);
        cum[k] = k ? cum[k - 1] + Math.hypot(px[k] - px[k - 1], pz[k] - pz[k - 1]) : 0;
      }
      let k = 0;
      for (let i = 0; i <= NU; i++) {
        const mal = (i / NU) * cum[S];
        while (k < S - 1 && cum[k + 1] < mal) k++;
        const f = (mal - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
        const x = px[k] + (px[k + 1] - px[k]) * f; let z = pz[k] + (pz[k + 1] - pz[k]) * f;
        const ax = Math.abs(x), bak = (i / NU) < 0.5;
        const yT = axelY(x) - nacke(x) * (bak ? 0.02 : 0.06), yF = -GK.L - 0.014 * (1 - (x / a) * (x / a));
        // veck: mjuka lodräta veck nedtill och korta veck där tyget hänger över galgens axlar
        const veck = 0.0065 * Math.sin(x * 30 + 1.3 + (bak ? 0 : 2)) * jamn(0.4, 1, v) + 0.0035 * Math.sin((ax * 2.4 + v * 0.9) * 34) * (1 - jamn(0.08, 0.3, v)) * jamn(0.05, 0.1, ax);
        z += (bak ? 1 : -1) * veck * jamn(0.02, 0.12, v);
        pos.push(x * (1 + 0.03 * v * v), yT + (yF - yT) * v, z); uv.push(i / NU, 1 - v);
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals(); return s.stada(g);
  })();
  // ärmarna: rör som hänger snett nedåt från axeln (rundad överst, öppen mudd), lite tillplattade och med veck
  const armar = [-1, 1].map((sida) => {
    const NU = 40, NV = 26, L = 0.26;
    const p0 = new THREE.Vector3(sida * 0.15, axelY(0.15) - 0.035, 0);
    const d = new THREE.Vector3(sida * 0.42, -1, 0.08).normalize();
    const w = new THREE.Vector3(-d.y * sida, d.x * sida, 0).normalize(), kz = new THREE.Vector3(0, 0, 1);
    const pos = [], uv = [], idx = [], kant = [];
    for (let j = 0; j <= NV; j++) {
      const t = j / NV, kupol = Math.sqrt(jamn(0, 0.14, t));
      const c = p0.clone().addScaledVector(d, L * t); c.z += 0.012 * t;
      for (let i = 0; i <= NU; i++) {
        const f = Math.PI + (i / NU) * Math.PI * 2; // sömmen under ärmen
        const rw = (0.066 - 0.012 * t) * kupol * (1 + 0.05 * Math.sin(f * 3 + t * 9) * t), rd = (0.024 + 0.006 * t) * kupol;
        const p = c.clone().addScaledVector(w, rw * Math.cos(f)).addScaledVector(kz, rd * Math.sin(f));
        pos.push(p.x, p.y, p.z); uv.push(i / NU, 1 - t);
        if (j === NV) kant.push(p.clone().addScaledVector(d, -0.004));
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, e2 = c + 1; if (sida > 0) idx.push(a, b, c, b, e2, c); else idx.push(a, c, b, b, c, e2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals(); kant.pop();
    return { geo: s.stada(g), kant };
  });
  // rörelsen i shadern (delas av bålen, ärmarna, kragen och muddarna): vågor som rinner nedåt och tyget som släpar efter gungningen
  const gustavUni = { uTid: { value: 0 }, uPitch: { value: 0 }, uRoll: { value: 0 }, uGlans: { value: -1 }, uGlod: { value: 0 } };
  const gustavRorelse = (sh) => {
    Object.assign(sh.uniforms, gustavUni);
    sh.vertexShader = `uniform float uTid; uniform float uPitch; uniform float uRoll;\n${sh.vertexShader}`
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float gNed = clamp(-position.y / 0.78, 0.0, 1.0), gFx = position.x / 0.31, gAmp = gNed * gNed;
        float gA1 = position.y * 9.0 + uTid * 1.9 + gFx * 1.4, gA2 = position.y * 15.0 + uTid * 2.7 - gFx * 2.1;
        float gBas = sin(gA1) * 0.008 + sin(gA2) * 0.0035 + sin(uTid * 0.9 + 0.8) * 0.012 + uPitch * 0.12;
        float gDzdy = (cos(gA1) * 0.072 + cos(gA2) * 0.0525) * gAmp - gBas * 2.564 * gNed;
        float gDzdx = (cos(gA1) * 0.0361 - cos(gA2) * 0.0237) * gAmp;
        objectNormal = normalize(objectNormal - vec3(gDzdx, gDzdy, 0.0) * objectNormal.z);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += gBas * gAmp;
        transformed.x += (sin(uTid * 0.63 + 1.4) * 0.004 - uRoll * 0.12) * gNed;`);
  };
  // tyget: insidan mörkare, ett svagt sken när man hovrar (uGlod) och ljussvepet över trycket (uGlans 0–1, bara bålen)
  const trojMaterial = (map, normalMap, roughnessMap, nyckel, glans) => {
    const m = lag ? std({ map, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 })
      : miljo(s.stada(new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap, roughness: roughnessMap ? 0.92 : 0.86,
        metalness: 0, sheen: 0.55, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xa9c6ff), side: THREE.DoubleSide })), 0.32);
    m.onBeforeCompile = (sh) => {
      gustavRorelse(sh);
      sh.fragmentShader = `uniform float uGlans; uniform float uGlod;\n${sh.fragmentShader}`
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (!gl_FrontFacing) diffuseColor.rgb *= 0.32;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * uGlod * 0.1;
          ${glans ? `#ifdef USE_ROUGHNESSMAP
          if (uGlans >= 0.0 && gl_FrontFacing) {
            float gTryck = 1.0 - smoothstep(0.5, 0.75, texture2D(roughnessMap, vRoughnessMapUv).g);
            float gQ = (vMapUv.x * 2.0 + (1.0 - vMapUv.y) - (uGlans * 2.2 - 0.1)) / 0.08;
            totalEmissiveRadiance += vec3(0.8, 0.9, 1.0) * exp(-gQ * gQ) * (0.05 + 0.3 * gTryck);
          }
          #endif` : ''}`);
    };
    m.customProgramCacheKey = () => nyckel;
    return skarp(m, -0.5);
  };
  const gustavMat = trojMaterial(torsoTex, torsoNormal, torsoGlans, 'gustav-torso', true);
  const armMat = trojMaterial(armTex, armNormal, null, 'gustav-arm', false);
  const gustav = new THREE.Group(); gustav.name = 'gustav';
  const gustavTroja = new THREE.Mesh(gustavGeo, gustavMat); gustavTroja.scale.setScalar(GD.skala); gustavTroja.name = 'gustav-troja';
  for (const a of armar) gustavTroja.add(new THREE.Mesh(a.geo, armMat));
  // kragen (ribbad ring runt nackhålet – djupare fram) och muddarna (ring runt ärmens öppning)
  const ribbTex = tex(128, 16, (ctx, b, h) => { ctx.fillStyle = '#0e2c5c'; ctx.fillRect(0, 0, b, h); ctx.fillStyle = 'rgba(255, 255, 255, .13)'; for (let i = 0; i < b; i += 8) ctx.fillRect(i, 0, 3, h); }, [36, 1]);
  const ribbMat = std({ map: ribbTex, roughness: 0.82, metalness: 0 });
  ribbMat.onBeforeCompile = gustavRorelse; ribbMat.customProgramCacheKey = () => 'gustav-ribb';
  { const pk = []; for (let i = 0; i < 48; i++) { const f = (i / 48) * Math.PI * 2, x = 0.083 * Math.cos(f), z = 0.0235 * Math.sin(f); pk.push(new THREE.Vector3(x, axelY(x) - nacke(x) * (z > 0 ? 0.02 : 0.06) + 0.002, z)); }
    gustavTroja.add(new THREE.Mesh(s.stada(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pk, true), 96, 0.0078, 8, true)), ribbMat)); }
  for (const a of armar) gustavTroja.add(new THREE.Mesh(s.stada(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(a.kant, true), 48, 0.0062, 8, true)), ribbMat));
  // galgen: lackat trä (ligger inne i axlarna), kroken i krom vrider sig mot stången (vinkelrätt mot den)
  const galgTra = miljo(std({ color: 0x7a4a24, roughness: 0.34, metalness: 0 }), 0.55);
  const gustavGalge = new THREE.Group(); gustavGalge.scale.setScalar(GD.skala);
  { const kurva = new THREE.CatmullRomCurve3([-0.17, -0.12, -0.06, 0, 0.06, 0.12, 0.17].map((x) => new THREE.Vector3(x, galgY(x), 0)));
    const ande = (a) => { const g = new THREE.SphereGeometry(0.0105, 12, 8); g.translate(a, galgY(a), 0); return { g }; };
    gustavGalge.add(new THREE.Mesh(s.stada(slaIhop(THREE, [{ g: new THREE.TubeGeometry(kurva, 32, 0.0105, 10, false) }, ande(-0.17), ande(0.17)])), galgTra));
    const krok = new THREE.TorusGeometry(0.026, 0.0035, 10, 26, Math.PI * 1.45); krok.rotateZ(-Math.PI * 0.22); krok.translate(0, 0.04, 0);
    const hals = new THREE.CylinderGeometry(0.0042, 0.0042, 0.018, 10); hals.translate(0, 0.009, 0);
    const bricka = new THREE.CylinderGeometry(0.009, 0.009, 0.004, 14); bricka.translate(0, 0.004, 0);
    const krokMesh = new THREE.Mesh(s.stada(slaIhop(THREE, [{ g: krok }, { g: hals }, { g: bricka }])), kromMat); krokMesh.rotation.y = -GD.vinkel;
    gustavGalge.add(krokMesh); }
  gustav.add(gustavTroja, gustavGalge);
  // stången: kromrör rakt ut från skåpet under skylthyllan med en kula i änden, ett stag upp till skåpets tak och en fläns där
  { const L = GD.z1 - GD.z0, r = 0.0085;
    const stang = new THREE.CylinderGeometry(r, r, L, 16); stang.rotateX(Math.PI / 2); stang.translate(0, 0, GD.z0 + L / 2);
    const kula = new THREE.SphereGeometry(0.016, 18, 12); kula.translate(0, 0, GD.z1);
    const knut = new THREE.SphereGeometry(r * 1.25, 14, 10); knut.translate(0, 0, GD.z0);
    const stag = new THREE.CylinderGeometry(r, r, SKAP.h - GD.y, 14); stag.translate(0, (SKAP.h - GD.y) / 2, GD.z0);
    const flans = new THREE.CylinderGeometry(0.024, 0.024, 0.006, 20); flans.translate(0, SKAP.h - GD.y - 0.003, GD.z0);
    const stangMesh = new THREE.Mesh(s.stada(slaIhop(THREE, [{ g: stang }, { g: kula }, { g: knut }, { g: stag }, { g: flans }])), kromMat); stangMesh.name = 'gustav-stang';
    new THREE.Matrix4().multiplyMatrices(gustavSkap.m, new THREE.Matrix4().makeTranslation(GD.x, GD.y, 0)).decompose(stangMesh.position, stangMesh.quaternion, stangMesh.scale);
    rum.add(stangMesh); if (s.ljus) s.skuggor.kasta(stangMesh, false); }
  // kroken hänger över stången: stångens mitt ligger 0,054 över galgens origo (gånger skalan)
  { const lokal = new THREE.Matrix4().compose(_p.set(GD.x, GD.y - 0.054 * GD.skala, GD.krok), _q.setFromEuler(_e.set(0, GD.vinkel, 0)), _sk.set(1, 1, 1));
    new THREE.Matrix4().multiplyMatrices(gustavSkap.m, lokal).decompose(gustav.position, gustav.quaternion, gustav.scale); }
  const gustavBasQ = gustav.quaternion.clone();
  rum.add(gustav);
  if (s.ljus) s.skuggor.kasta(gustav, false);
  const _gp = new THREE.Vector3(); gustav.updateMatrixWorld(); gustavTroja.getWorldPosition(_gp);
  spotTroja.position.set(_gp.x - 0.7, RUM.h - 0.05, _gp.z + 1.0); spotTroja.target.position.set(_gp.x, _gp.y - 0.4, _gp.z);
  // ljuskäglan: starkast en bit ned och vid kanterna (som ljus i damm), osynlig vid lampan; dammet svävar inne i den
  const straleFran = spotTroja.position.clone(), straleTill = new THREE.Vector3(_gp.x, _gp.y - 0.6, _gp.z);
  const gustavStrale = lag ? null : (() => {
    const l = straleFran.distanceTo(straleTill);
    const g = new THREE.CylinderGeometry(0.035, 0.46, l, 40, 1, true); g.translate(0, -l / 2, 0);
    const uni = { uStyrka: { value: 0 }, uTid: { value: 0 }, uFarg: { value: new THREE.Color(0xffe4c4) } };
    const mat = additiv(s.stada(new THREE.ShaderMaterial({ uniforms: uni, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 vp = modelViewMatrix * vec4(position, 1.0); vV = normalize(-vp.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * vp; }',
      fragmentShader: 'uniform vec3 uFarg; uniform float uStyrka; uniform float uTid; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float kant = abs(dot(vN, vV)); kant = kant * kant; float ned = 1.0 - vY; float lang = smoothstep(0.08, 0.5, ned) * (1.0 - smoothstep(0.82, 1.0, ned)); float liv = 0.88 + 0.12 * sin(uTid * 0.6 + vY * 7.0); gl_FragColor = vec4(uFarg, uStyrka * (0.35 + kant) * lang * liv * 0.085); }' })));
    const m = new THREE.Mesh(s.stada(g), mat); m.position.copy(straleFran); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), straleTill.clone().sub(straleFran).normalize()); m.renderOrder = 5; m.name = 'gustav-strale';
    rum.add(m); return uni;
  })();
  const dammMitt = straleFran.clone().lerp(straleTill, 0.62);
  const gustavDamm = lag ? null : s.partiklar(mobil || inbyggd ? 18 : 34, { centrum: [dammMitt.x, dammMitt.y, dammMitt.z], omrade: [0.26, 0.42, 0.26], farg: 0xffe9cf, storlek: 0.021, styrka: 1.35, fart: 0.025, opacitet: 0.75 });
  if (gustavDamm) rum.add(gustavDamm);
  await andas(); if (s.forstord) return null;

  /* ---- sakerna: skor, flaskor, handdukar, väskor, benskydd, tejp, strumpor, bollar, koner, bollnät ---- */
  // fotbollsskon: sidoprofil som extruderas, sula och dobbar i samma geometri
  const skoGeo = (() => {
    const f = new THREE.Shape();
    f.moveTo(-0.14, 0.012); f.lineTo(0.13, 0.012); f.quadraticCurveTo(0.165, 0.016, 0.16, 0.045); f.quadraticCurveTo(0.13, 0.075, 0.05, 0.08);
    f.lineTo(-0.06, 0.1); f.quadraticCurveTo(-0.13, 0.115, -0.15, 0.085); f.quadraticCurveTo(-0.16, 0.04, -0.14, 0.012);
    const g = new THREE.ExtrudeGeometry(f, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10 });
    g.translate(0, 0, -0.0375);
    const delar = [{ g }];
    for (const [x, z] of [[-0.11, -0.025], [-0.11, 0.025], [-0.02, -0.03], [-0.02, 0.03], [0.07, -0.03], [0.07, 0.03], [0.12, 0]]) { const d = new THREE.CylinderGeometry(0.006, 0.008, 0.012, 8); d.translate(x, -0.004, z); delar.push({ g: d }); }
    return s.stada(slaIhop(THREE, delar));
  })();
  const sakMat = (opt) => miljo(std({ roughness: 0.55, metalness: 0, ...opt }), 0.5);
  const skor = new THREE.InstancedMesh(skoGeo, sakMat({ roughness: 0.35 }), 30);
  // sulan i kontrastfärg (egna instanser med samma matriser) – skon läses som en fotbollssko även på avstånd
  const sulGeo = (() => { const g = s.rundadLada(0.31, 0.016, 0.09, 0.006, 2); g.translate(0.005, 0.004, 0); return s.stada(g); })();
  const sulor = new THREE.InstancedMesh(sulGeo, sakMat({ roughness: 0.5 }), 30);
  const SKOFARG = [[0x111418, 0xf2f4f8], [0xf2f4f8, 0x1d57a8], [0x1d57a8, 0xf2f4f8], [0x0e2c5c, 0xe5674f], [0x111418, 0xf08a24], [0xc9ced6, 0x111418], [0x1d57a8, 0x111418]];
  let nSko = 0;
  const lagSko = (m, x, z, rot, farg, y = 0) => { if (nSko >= 30) return; _l.compose(_p.set(x, y + 0.012, z), _q.setFromEuler(_e.set(0, rot, 0)), _sk.set(1, 1, 1)); _m.multiplyMatrices(m, _l); skor.setMatrixAt(nSko, _m); sulor.setMatrixAt(nSko, _m); skor.setColorAt(nSko, new THREE.Color(farg[0])); sulor.setColorAt(nSko++, new THREE.Color(farg[1])); };
  // flaskor (svarvad profil + kork)
  const flaskGeo = (() => {
    const pts = [[0, 0], [0.034, 0], [0.036, 0.01], [0.036, 0.17], [0.03, 0.2], [0.018, 0.215], [0.018, 0.235], [0, 0.235]].map(([x, y]) => new THREE.Vector2(x, y));
    return s.stada(new THREE.LatheGeometry(pts, 14));
  })();
  const flaskor = new THREE.InstancedMesh(flaskGeo, sakMat({ roughness: 0.25 }), 24);
  let nFlaska = 0;
  const lagFlaska = (m, x, y, z, farg, liggande = 0) => { if (nFlaska >= 24) return; _l.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(liggande ? Math.PI / 2 : 0, liggande, 0)), _sk.set(1, 1, 1)); flaskor.setMatrixAt(nFlaska, _m.multiplyMatrices(m, _l)); flaskor.setColorAt(nFlaska++, new THREE.Color(farg)); };
  // vikta handdukar (rundade lådor med ränder)
  const handdukGeo = s.stada(s.rundadLada(0.3, 0.055, 0.21, 0.02, 3));
  const handdukar = new THREE.InstancedMesh(handdukGeo, sakMat({ map: tex(256, 256, ritaHandduk), roughness: 0.95 }), 24);
  let nHandduk = 0;
  const lagHandduk = (m, x, y, z, rot, hog = 1, farg = 0xffffff) => { for (let k = 0; k < hog && nHandduk < 24; k++) { _l.compose(_p.set(x, y + 0.028 + k * 0.052, z), _q.setFromEuler(_e.set(0, rot + k * 0.06, 0)), _sk.set(1, 1, 1)); handdukar.setMatrixAt(nHandduk, _m.multiplyMatrices(m, _l)); handdukar.setColorAt(nHandduk++, new THREE.Color(Array.isArray(farg) ? farg[k % farg.length] : farg)); } };
  // väskor på hyllorna
  const vaskGeo = s.stada(s.rundadLada(0.55, 0.26, 0.3, 0.07, 4));
  const vaskor = new THREE.InstancedMesh(vaskGeo, sakMat({ map: tex(128, 128, ritaVaska), roughness: 0.7 }), 16);
  let nVaska = 0;
  const lagVaska = (m, x, y, z, rot) => { if (nVaska >= 16) return; _l.compose(_p.set(x, y + 0.13, z), _q.setFromEuler(_e.set(0, rot, 0)), _sk.set(1, 1, 1)); vaskor.setMatrixAt(nVaska++, _m.multiplyMatrices(m, _l)); };
  // benskydd (kupade), tejprullar och hoprullade strumpor
  const benGeo = (() => { const g = new THREE.CylinderGeometry(0.055, 0.045, 0.2, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84); g.rotateZ(Math.PI / 2); g.translate(0, 0.03, 0); return s.stada(g); })();
  const benskydd = new THREE.InstancedMesh(benGeo, sakMat({ color: 0x1d57a8, roughness: 0.4, side: THREE.DoubleSide }), 12);
  let nBen = 0;
  const lagBen = (m, x, y, z, rot) => { if (nBen >= 12) return; _l.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, rot, 0)), _sk.set(1, 1, 1)); benskydd.setMatrixAt(nBen++, _m.multiplyMatrices(m, _l)); };
  const tejpGeo = (() => { const g = new THREE.CylinderGeometry(0.034, 0.034, 0.025, 18, 1, false); g.translate(0, 0.0125, 0); return s.stada(g); })();
  const tejp = new THREE.InstancedMesh(tejpGeo, sakMat({ color: 0xf4f5f7, roughness: 0.6 }), 12);
  let nTejp = 0;
  const lagTejp = (m, x, y, z) => { if (nTejp >= 12) return; _l.compose(_p.set(x, y, z), _q.identity(), _sk.set(1, 1, 1)); tejp.setMatrixAt(nTejp++, _m.multiplyMatrices(m, _l)); };
  const strumpGeo = (() => { const g = new THREE.SphereGeometry(0.045, 14, 10); g.scale(1.35, 0.8, 1); g.translate(0, 0.036, 0); return s.stada(g); })();
  const strumpor = new THREE.InstancedMesh(strumpGeo, sakMat({ roughness: 0.95 }), 16);
  let nStrumpa = 0;
  const lagStrumpa = (m, x, y, z, farg) => { if (nStrumpa >= 16) return; _l.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, slump() * 3, 0)), _sk.set(1, 1, 1)); strumpor.setMatrixAt(nStrumpa, _m.multiplyMatrices(m, _l)); strumpor.setColorAt(nStrumpa++, new THREE.Color(farg)); };
  // fyll skåpen (i skåpets egna koordinater) – varierat men aldrig slumpat olika från gång till gång
  const sitsY = SKAP.sits + 0.035;
  skapLista.forEach((sk, i) => {
    const { m } = sk; const v = i % 6;
    lagSko(m, -0.17, 0.12, -Math.PI / 2 + 0.12, SKOFARG[i % SKOFARG.length], 0); lagSko(m, -0.06, 0.13, -Math.PI / 2 - 0.05, SKOFARG[i % SKOFARG.length], 0);
    if (v === 0 || v === 3) lagHandduk(m, 0.18, sitsY, -0.24, 0.1, v === 0 ? 2 : 1);
    if (v === 1) { lagFlaska(m, 0.25, sitsY, -0.12, i % 2 ? 0xf2f4f8 : 0x1d57a8); lagBen(m, -0.15, sitsY, -0.2, 0.3); lagBen(m, -0.04, sitsY, -0.24, -0.1); }
    if (v === 2) { lagTejp(m, 0.22, sitsY, -0.2); lagTejp(m, 0.27, sitsY, -0.12); lagStrumpa(m, -0.1, sitsY, -0.22, 0x1d57a8); lagStrumpa(m, 0.0, sitsY, -0.18, 0xf2f4f8); }
    if (v === 4) { lagFlaska(m, -0.25, sitsY, -0.2, 0xf2f4f8); lagHandduk(m, 0.12, sitsY, -0.22, -0.2, 1); }
    if (v === 5) { lagStrumpa(m, 0.2, sitsY, -0.2, 0x1d57a8); lagFlaska(m, 0.05, sitsY + 0.035, -0.14, 0x1d57a8, 1.4); }
    if (i === 2) lagHandduk(m, -0.12, sitsY, -0.22, 0.05, 3, [0xd8f04a, 0xff8a2a, 0xd8f04a]); // träningsvästar
    if (i % 3 !== 2) lagVaska(m, (i % 2 ? 0.1 : -0.08), SKAP.hylla + 0.011, -0.25, (i % 2 ? 0.08 : -0.06));
  });
  // på golvet framför tavlan och vid skåpen: flaskor i en back, koner, bollar och ett bollnät
  const golvM = new THREE.Matrix4();
  for (let k = 0; k < 6; k++) lagFlaska(golvM, TAVLA.x + 1.53 + (k % 3) * 0.085, 0.07, TAVLA.z + 0.42 + Math.floor(k / 3) * 0.085, k % 2 ? 0xf2f4f8 : 0x1d57a8);
  const back = new THREE.Mesh(s.stada(s.rundadLada(0.3, 0.07, 0.2, 0.012, 2)), sakMat({ color: 0x0e2c5c, roughness: 0.6 }));
  back.position.set(TAVLA.x + 1.615, 0.035, TAVLA.z + 0.462); back.castShadow = true; rum.add(back);
  lagSko(golvM, TAVLA.x - 1.55, TAVLA.z + 0.9, 0.5, SKOFARG[0]); lagSko(golvM, TAVLA.x - 1.45, TAVLA.z + 1.0, 0.75, SKOFARG[0]);
  lagHandduk(golvM, -1.62, 0.0, 0.4, 0.4, 1);
  [skor, sulor, flaskor, handdukar, vaskor, benskydd, tejp, strumpor].forEach((im) => { im.castShadow = !lag; im.receiveShadow = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.instanceMatrix.needsUpdate = true; rum.add(im); });
  skor.count = nSko; sulor.count = nSko; flaskor.count = nFlaska; handdukar.count = nHandduk; vaskor.count = nVaska; benskydd.count = nBen; tejp.count = nTejp; strumpor.count = nStrumpa;
  const konGeo = (() => { const pts = [[0, 0.002], [0.1, 0.002], [0.1, 0.012], [0.03, 0.17], [0.0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y)); return s.stada(new THREE.LatheGeometry(pts, 20)); })();
  const koner = new THREE.InstancedMesh(konGeo, sakMat({ roughness: 0.6 }), 7);
  for (let k = 0; k < 7; k++) { _l.compose(_p.set(TAVLA.x - 1.62, k * 0.022, TAVLA.z + 0.5), _q.identity(), _sk.set(1, 1, 1)); koner.setMatrixAt(k, _l); koner.setColorAt(k, new THREE.Color(0xf08a24)); }
  koner.instanceColor.needsUpdate = true; koner.castShadow = true; rum.add(koner);
  const bollTex = tex(512, 256, ritaBoll);
  const bollGeo = s.stada(new THREE.SphereGeometry(0.11, 28, 18));
  const bollMat = miljo(std({ map: bollTex, roughness: 0.38 }), 0.7);
  const bollar = new THREE.InstancedMesh(bollGeo, bollMat, 9);
  const bollPos = [[TAVLA.x - 0.95, TAVLA.z + 0.75, 0.4], [TAVLA.x + 1.05, TAVLA.z + 1.15, 1.9], [1.55, -3.0, 2.4], [1.7, -3.15, 0.3], [1.48, -3.22, 1.1], [1.62, -3.0, 0.2]];
  bollPos.forEach(([x, z, r], k) => { _l.compose(_p.set(x, 0.11 + (k >= 5 ? 0.17 : 0), z), _q.setFromEuler(_e.set(r, r * 0.7, 0)), _sk.set(1, 1, 1)); bollar.setMatrixAt(k, _l); });
  bollar.count = bollPos.length; bollar.castShadow = true; bollar.receiveShadow = true; rum.add(bollar);
  // bollnätet i hörnet bak till höger: en påse av glest nät runt bollarna
  const nat = new THREE.Mesh(s.stada(new THREE.SphereGeometry(0.34, 14, 10)), s.stada(new THREE.MeshStandardMaterial({ color: 0x0e2c5c, wireframe: true, transparent: true, opacity: 0.55, roughness: 1 })));
  nat.scale.set(1, 0.9, 1); nat.position.set(1.6, 0.28, -3.1); rum.add(nat);
  await andas(); if (s.forstord) return null;

  /* ---- taktiktavlan: en digital taktikskärm på sitt stativ ---- */
  const tavlaGrupp = new THREE.Group(); tavlaGrupp.name = 'taktiktavla';
  tavlaGrupp.position.set(TAVLA.x, TAVLA.y, TAVLA.z); tavlaGrupp.rotation.x = TAVLA.lut;
  rum.add(tavlaGrupp);
  // ramen: tunn, mörk anodiserad aluminium med en ljus fasad metallkant bakom
  const ramMat = miljo(std({ color: 0x151a21, roughness: 0.36, metalness: 0.75 }), 0.9);
  const kantMat = miljo(std({ color: 0xb4bdc8, roughness: 0.26, metalness: 1 }), 1.1);
  const benMat = miljo(std({ color: 0x272d36, roughness: 0.34, metalness: 0.85 }), 1.0);
  const ram = new THREE.Mesh(s.stada(s.rundadLada(TAVLA.b + 0.07, TAVLA.h + 0.07, 0.045, 0.02, 4)), ramMat); ram.castShadow = true; tavlaGrupp.add(ram);
  const ramKant = new THREE.Mesh(s.stada(s.rundadLada(TAVLA.b + 0.08, TAVLA.h + 0.08, 0.02, 0.022, 4)), kantMat); ramKant.position.z = -0.014; tavlaGrupp.add(ramKant);
  // skärmen: självlysande (spotten tvättar aldrig ur den), tänds med ett svep från mitten; texturen läses lite skarpare (bias)
  let tavlaData = senasteData;
  const tavlaTex = s.canvasTextur(TEX_B, TEX_H, (ctx, b, h) => ritaTavla(ctx, b, h, tavlaData));
  const skarmUni = { uKarta: { value: tavlaTex }, uIn: { value: direktStart ? 1 : 0 }, uLjus: { value: 1.32 } };
  const ytMat = s.stada(new THREE.ShaderMaterial({ uniforms: skarmUni, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uKarta; uniform float uIn; uniform float uLjus; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(uKarta, vUv, -0.7).rgb;
        float d = abs(vUv.y - 0.5), kant = uIn * 0.53;
        float oppen = 1.0 - smoothstep(kant - 0.012, kant, d);
        float x = (d - kant) * 70.0; float linje = exp(-x * x) * (1.0 - smoothstep(0.85, 1.0, uIn));
        gl_FragColor = vec4(c * oppen * uLjus + vec3(0.5, 0.95, 0.82) * linje * 1.4, 1.0);
      }` }));
  const yta = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(TAVLA.b, TAVLA.h)), ytMat); yta.position.z = 0.0235; tavlaGrupp.add(yta);
  // glaset: en svag reflex upptill och ett ljussvep som glider över skärmen var nionde sekund
  const glasUni = { uTid: { value: 0 }, uIn: skarmUni.uIn };
  const glasMat = additiv(s.stada(new THREE.ShaderMaterial({ uniforms: glasUni, toneMapped: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTid; uniform float uIn; varying vec2 vUv;
      void main(){
        float sv = vUv.x + vUv.y * 0.55; float p = fract(uTid / 9.0) * 3.2 - 0.9; float x = (sv - p) * 9.0;
        float a = (exp(-x * x) * 0.065 + smoothstep(0.6, 1.0, vUv.y) * 0.02) * step(0.99, uIn);
        gl_FragColor = vec4(vec3(0.86, 0.95, 1.0), a);
      }` })));
  const glas = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(TAVLA.b, TAVLA.h)), glasMat); glas.position.z = 0.0262; glas.renderOrder = 8; tavlaGrupp.add(glas);
  // listen under skärmen med en liten mint statuslampa
  const list = new THREE.Mesh(s.stada(s.rundadLada(TAVLA.b * 0.42, 0.045, 0.05, 0.018, 3)), ramMat); list.position.set(0, -TAVLA.h / 2 - 0.068, 0.004); tavlaGrupp.add(list);
  const lampa = new THREE.Mesh(s.stada(new THREE.CircleGeometry(0.0065, 14)), glodMat(0x7ee0c3, 2.6)); lampa.position.set(TAVLA.b * 0.18, -TAVLA.h / 2 - 0.068, 0.0302); tavlaGrupp.add(lampa);
  // stativet: två framben och ett bakben (A-form) i mörk metall, tvärslå och fötter
  const stativ = new THREE.Group(); stativ.position.set(TAVLA.x, 0, TAVLA.z); rum.add(stativ);
  const ben = (x0, z0, x1, y1, z1) => { const a = new THREE.Vector3(x0, 0, z0), b = new THREE.Vector3(x1, y1, z1); const l = a.distanceTo(b);
    const m = new THREE.Mesh(s.stada(s.rundadLada(0.028, l, 0.028, 0.008, 2)), benMat); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; stativ.add(m);
    const fot = new THREE.Mesh(s.stada(new THREE.CylinderGeometry(0.032, 0.036, 0.016, 16)), std({ color: 0x0e1116, roughness: 0.7 })); fot.position.set(x0, 0.008, z0); stativ.add(fot); };
  const topp = TAVLA.y + TAVLA.h / 2 + 0.05;
  ben(-TAVLA.b / 2 - 0.07, 0.16, -TAVLA.b / 2 - 0.07, topp, -0.05); ben(TAVLA.b / 2 + 0.07, 0.16, TAVLA.b / 2 + 0.07, topp, -0.05); ben(0, -0.85, 0, topp - 0.08, -0.1);
  const tvar = new THREE.Mesh(s.stada(s.rundadLada(TAVLA.b - 0.3, 0.022, 0.022, 0.008, 2)), benMat); tvar.position.set(0, 0.42, 0.12); stativ.add(tvar);
  // korten: hovring (eller en magnet som landar) tänder kortets kant i stegets färg – bara kortet, ingen rand över hela skärmen
  const kortB = (TV.lista1 - TV.lista0) * TAVLA.b, kortH = (RAD_H - 0.016) * TAVLA.h;
  const radSken = STEG_ID.map((id, k) => {
    const uni = { uFarg: { value: new THREE.Color(FARGER[id]) }, uStyrka: { value: 0 }, uStorlek: { value: new THREE.Vector2(kortB + 0.04, kortH + 0.04) } };
    const mat = additiv(s.stada(new THREE.ShaderMaterial({ uniforms: uni, toneMapped: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uFarg; uniform float uStyrka; uniform vec2 uStorlek; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * uStorlek; vec2 q = abs(p) - (uStorlek * 0.5 - vec2(0.02)) + vec2(0.012);
          float dd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.012;
          float kant = exp(-abs(dd) * 220.0); float fyll = (1.0 - smoothstep(-0.004, 0.0, dd)) * 0.16;
          gl_FragColor = vec4(uFarg * 1.15, uStyrka * (kant * 0.95 + fyll));
        }` })));
    const m = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(kortB + 0.04, kortH + 0.04)), mat);
    m.position.set(-TAVLA.b / 2 + ((TV.lista0 + TV.lista1) / 2) * TAVLA.b, TAVLA.h / 2 - TAVLA.h * radMitt(k), 0.025); m.renderOrder = 5; tavlaGrupp.add(m);
    return { uni, hover: 0, aktiv: 0, ping: 0 };
  });
  // passningslinjerna: ljusbanor mot målet där två ljuspulser i taget rinner fram; ritas fram i introt
  const pilUni = { uRita: { value: direktStart ? 1 : 0 }, uTid: { value: 0 } };
  const pilMat = additiv(s.stada(new THREE.ShaderMaterial({ uniforms: pilUni, toneMapped: false,
    vertexShader: 'attribute float aVarde; varying vec2 vUv; varying float vV; void main(){ vUv = uv; vV = aVarde; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uRita; uniform float uTid; varying vec2 vUv; varying float vV;
      void main(){
        float fram = clamp(uRita * 1.6 - vV * 0.15, 0.0, 1.0); if (vUv.x > fram) discard;
        float tvar = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float bas = smoothstep(0.0, 0.7, tvar) * 0.3;
        float p1 = fract(uTid * 0.22 + vV * 0.31); float x1 = (vUv.x - p1) * 10.0;
        float p2 = fract(uTid * 0.22 + vV * 0.31 + 0.5); float x2 = (vUv.x - p2) * 10.0;
        float puls = (exp(-x1 * x1) + exp(-x2 * x2)) * smoothstep(0.0, 0.5, tvar);
        float spets = step(0.999, vUv.x) * 0.95;
        vec3 col = mix(vec3(0.75, 0.9, 1.0), vec3(0.49, 0.88, 0.76), vUv.x);
        gl_FragColor = vec4(col * (1.0 + puls * 0.9), clamp(bas + puls * 0.95 + spets, 0.0, 1.0));
      }` })));
  const pilar = (() => {
    const bit = (fx, fy) => new THREE.Vector3(-TAVLA.b / 2 + fx * TAVLA.b, TAVLA.h / 2 - fy * TAVLA.h, 0.025);
    const vagar = [
      [[0.6, radMitt(0) + 0.02], [0.57, (radMitt(0) + radMitt(1)) / 2], [0.66, radMitt(1) - 0.02]],
      [[0.86, radMitt(1) + 0.02], [0.9, (radMitt(1) + radMitt(2)) / 2], [0.8, radMitt(2) - 0.02]],
      [[0.64, radMitt(2) + 0.02], [0.6, (radMitt(2) + radMitt(3)) / 2], [0.7, radMitt(3) - 0.025]],
      [[0.85, radMitt(3) + 0.02], [0.84, radMitt(3) + 0.09], [0.77, TV.mal - 0.035]],
    ];
    const delar = [];
    vagar.forEach((vag, i) => {
      const kurva = new THREE.QuadraticBezierCurve3(bit(...vag[0]), bit(...vag[1]), bit(...vag[2]));
      const n = 48, w = 0.0095; const pos = [], uv = [], ind = [];
      for (let k = 0; k <= n; k++) { const t = k / n; const p = kurva.getPoint(t), d = kurva.getTangent(t); const nx = -d.y, ny = d.x; pos.push(p.x + nx * w, p.y + ny * w, p.z, p.x - nx * w, p.y - ny * w, p.z); uv.push(t * 0.995, 0, t * 0.995, 1); if (k < n) ind.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); }
      const sp = kurva.getPoint(1), d = kurva.getTangent(1), nx = -d.y, ny = d.x, b0 = pos.length / 3;
      pos.push(sp.x + d.x * 0.045, sp.y + d.y * 0.045, sp.z, sp.x + nx * 0.03 - d.x * 0.01, sp.y + ny * 0.03 - d.y * 0.01, sp.z, sp.x - nx * 0.03 - d.x * 0.01, sp.y - ny * 0.03 - d.y * 0.01, sp.z);
      uv.push(1, 0.5, 1, 0, 1, 1); ind.push(b0, b0 + 2, b0 + 1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, j) => (j % 3 === 2 ? 1 : 0)), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); delar.push({ g, a: i * 1.6 });
    });
    const m = new THREE.Mesh(slaIhop(THREE, delar), pilMat); m.renderOrder = 6; tavlaGrupp.add(m); return m;
  })();
  // markörerna: en per affär – mörk kärna, ring i stegets färg, vit mittpunkt och en ring som pulserar ut (skarp i alla storlekar,
  // ritad i shadern), storleken efter affärens värde. Hovring och landning tänder den.
  const MAX_M = 60;
  const tokenGeo = s.stada(new THREE.PlaneGeometry(1, 1));
  const tokenFas = new Float32Array(MAX_M), tokenGlod = new Float32Array(MAX_M);
  for (let i = 0; i < MAX_M; i++) tokenFas[i] = (i * 0.37) % 1;
  tokenGeo.setAttribute('aFas', new THREE.InstancedBufferAttribute(tokenFas, 1));
  const glodAttr = new THREE.InstancedBufferAttribute(tokenGlod, 1); glodAttr.setUsage(THREE.DynamicDrawUsage); tokenGeo.setAttribute('aGlod', glodAttr);
  const tokenUni = { uTid: { value: 0 } };
  const tokenMat = s.stada(new THREE.ShaderMaterial({ uniforms: tokenUni, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `attribute float aFas; attribute float aGlod; varying vec2 vUv; varying vec3 vFarg; varying float vFas; varying float vGlod;
      void main(){ vUv = uv; vFarg = instanceColor; vFas = aFas; vGlod = aGlod; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTid; varying vec2 vUv; varying vec3 vFarg; varying float vFas; varying float vGlod;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p) * 1.3;
        float aa = fwidth(r) * 1.1;
        float skiva = 1.0 - smoothstep(0.62 - aa, 0.62 + aa, r);
        float ring = smoothstep(0.45 - aa, 0.45 + aa, r) * skiva;
        float prick = 1.0 - smoothstep(0.15 - aa, 0.15 + aa, r);
        float pf = fract(uTid * 0.45 + vFas); float pr = 0.62 + pf * 0.6; float px = (r - pr) * 24.0;
        float puls = exp(-px * px) * (1.0 - pf) * (0.3 + vGlod * 0.7);
        float sken = (1.0 - smoothstep(0.62, 1.25, r)) * step(0.62, r) * (0.16 + vGlod * 0.42);
        vec3 col = vec3(0.025, 0.06, 0.07) * (skiva - ring) + vFarg * ring * (1.2 + vGlod * 0.6) + vec3(1.0) * prick * 1.05 + vFarg * (puls + sken) * 1.3;
        float a = clamp(skiva + puls + sken, 0.0, 1.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
      }` }));
  const magneter = new THREE.InstancedMesh(tokenGeo, tokenMat, MAX_M); magneter.count = 0; magneter.renderOrder = 7; magneter.frustumCulled = false;
  magneter.setColorAt(0, new THREE.Color(1, 1, 1));
  tavlaGrupp.add(magneter);

  /* ---- ljuskäglorna (damm i ljuset) och skuggor ---- */
  const kagla = (fran, till, radie, farg, styrka) => {
    const l = fran.distanceTo(till);
    const g = new THREE.CylinderGeometry(0.02, radie, l, 28, 1, true); g.translate(0, -l / 2, 0);
    const uni = { uFarg: { value: new THREE.Color(farg) }, uStyrka: { value: 0 } };
    const mat = additiv(s.stada(new THREE.ShaderMaterial({ uniforms: uni, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 vp = modelViewMatrix * vec4(position, 1.0); vV = normalize(-vp.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * vp; }',
      fragmentShader: 'uniform vec3 uFarg; uniform float uStyrka; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float kant = abs(dot(vN, vV)); kant = kant * kant; gl_FragColor = vec4(uFarg, uStyrka * kant * vY * vY * 0.065); }' })));
    const m = new THREE.Mesh(s.stada(g), mat); m.position.copy(fran); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), till.clone().sub(fran).normalize()); m.renderOrder = 5; rum.add(m);
    return uni;
  };
  const kaglaTavla = null; // skärmen lyser själv – ingen ljuskägla framför den
  const kaglaTroja = null; // ingen synlig kägla vid tröjan – den bländade i bildens överkant
  const damm = lag ? null : s.partiklar(mobil || inbyggd ? 40 : 80, { centrum: [TAVLA.x, 1.55, TAVLA.z + 0.9], omrade: [1.6, 1.0, 1.0], farg: 0xe8f0ff, storlek: 0.018, styrka: 1.1, fart: 0.04, opacitet: 0.45 });
  if (damm) rum.add(damm);
  if (s.ljus) { s.skuggor.kasta(tavlaGrupp); s.skuggor.kasta(stativ); }
  // mjuka kontaktskuggor under stativets fötter och backen
  for (const [x, z, b, d] of [[TAVLA.x, TAVLA.z - 0.3, 2.6, 1.3], [TAVLA.x + 1.615, TAVLA.z + 0.46, 0.45, 0.32], [1.6, -3.1, 0.9, 0.8]]) { const k = s.kontaktskugga(b, d, 0.5); k.position.set(x, 0.006, z); rum.add(k); }

  /* glöden får inte spridas från enstaka extremt ljusa reflexer (fyrkantiga fläckar) – kantutjämningen är motorns (fxaa: true) */
  if (s.bloom) { const hp = s.bloom.materialHighPassFilter; hp.fragmentShader = hp.fragmentShader.replace('vec4( 64.0 )', 'vec4( 5.0 )'); hp.needsUpdate = true; }

  /* additiva material från hjälparna får inte heller röra alfa */
  s.scene.traverse((o) => { const m = o.material; if (m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending) additiv(m); });

  /* ---- kameran: tavlan (och Gustavs tröja) ramas in i ytan till höger om hjältens text ---- */
  // vidvinkel som i ett riktigt omklädningsrum – mer av skåpen, taket och golvet runt tavlan
  const FOV = { dator: 52, smal: 50 };
  // hur stor del av den fria ytan kompositionen (tavlan + tröjan) får ta: luft runt om så att rummet syns (dator), tätt på mobilen
  const FYLL = { dator: 0.84, smal: 0.97 };
  const kamRikt = new THREE.Vector3(0.07, 0.16, 1).normalize();
  const KAM_Z_MAX = RUM.z1 - 0.3;
  const tmpKam = new THREE.PerspectiveCamera(44, 1, 0.05, 60);
  const _v = new THREE.Vector3(), _hoger = new THREE.Vector3(), _upp = new THREE.Vector3(), _fram = new THREE.Vector3();
  const ramTavla = [], ramTroja = []; let ramPunkter = ramTavla;
  const lokalTillVarld = (obj, x, y, z) => obj.localToWorld(new THREE.Vector3(x, y, z));
  function samlaRamPunkter() {
    ramTavla.length = 0; ramTroja.length = 0; rum.updateMatrixWorld(true);
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) ramTavla.push(lokalTillVarld(tavlaGrupp, x * (TAVLA.b + 0.1), y * (TAVLA.h + 0.1) + (y < 0 ? -0.05 : 0.02), 0));
    for (const [x, y] of [[-0.33, 0.05], [0.33, 0.05], [-0.25, -0.8], [0.25, -0.8]]) ramTroja.push(lokalTillVarld(gustavTroja, x, y, 0));
  }
  function ndcRam(mal, dist, fov) {
    tmpKam.fov = fov; tmpKam.position.copy(mal).addScaledVector(kamRikt, dist); tmpKam.lookAt(mal); tmpKam.updateMatrixWorld(); tmpKam.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, bakom = false;
    for (const p of ramPunkter) { _v.copy(p).project(tmpKam); if (_v.z > 1 || _v.z < -1) bakom = true; x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    return { x0, x1, y0, y1, bakom };
  }
  let smal = false, kamDist = 4, kamFov = FOV.dator;
  const basKam = { pos: new THREE.Vector3(), mal: new THREE.Vector3() };
  const et = { lista: [], cache: new Map(), hover: -1, rot: null, placerad: false };
  let etiketterBas = null;
  function rama(w, h) {
    if (!ramTavla.length) samlaRamPunkter();
    smal = w < 560;
    // smal duk (mobilbandet): bara tavlan ramas in, så att raderna blir läsbara – tröjan syns i kanten när den får plats
    ramPunkter = smal ? ramTavla : [...ramTavla, ...ramTroja];
    // Dator: duken går över hela hjälten, även under texten (sidor.css 04). Kompositionen står i ytan till höger om texten, och rummet
    // tonas in under texten som arenan på översikten: osynligt under textens första tredjedel, helt framme strax efter texten
    // (--ss-tona0/1 i dukens koordinater), och ut mot remsan nedtill (--ss-botten0).
    let fri0 = 0;
    try {
      const txt = s.vard && s.vard.parentElement ? s.vard.parentElement.querySelector(':scope > .sidhjalte-text') : null;
      const b = s.vard ? s.vard.getBoundingClientRect() : null;
      let t0 = 0, t1 = 0;
      if (txt && b && innerWidth >= 900) {
        const a = txt.getBoundingClientRect();
        // textens verkliga högerkant (ingressen är smalare än spalten)
        const hoger = Math.max(a.left + 40, ...[...txt.children].map((x) => x.getBoundingClientRect().right));
        const tx0 = a.left - b.left, tx1 = hoger - b.left;
        if (tx1 > 0) { fri0 = klamp(tx1 + 28, 0, w * 0.6); t0 = Math.max(0, tx0 + (tx1 - tx0) * 0.3); t1 = Math.min(w - 40, t0 + (tx1 - t0) / 0.62); }
      }
      if (s.vard) { s.vard.style.setProperty('--ss-tona0', `${Math.round(t0)}px`); s.vard.style.setProperty('--ss-tona1', `${Math.round(t1)}px`); s.vard.style.setProperty('--ss-botten0', `${Math.round(h - (smal ? 30 : 64))}px`); }
    } catch (err) { fri0 = 0; }
    const marg = smal ? { v: 10, h: 10, t: 14, b: 12 } : { v: 18, h: Math.round(klamp(w * 0.04, 20, 48)), t: Math.round(klamp(h * 0.07, 18, 40)), b: 18 };
    const reg = { x0: fri0 + marg.v, x1: w - marg.h, y0: marg.t, y1: h - marg.b };
    const rw = Math.max(40, reg.x1 - reg.x0), rh = Math.max(40, reg.y1 - reg.y0);
    tmpKam.aspect = rw / rh;
    const mal = new THREE.Vector3(TAVLA.x + 0.25, TAVLA.y - 0.05, TAVLA.z);
    let fov = smal ? FOV.smal : FOV.dator;
    for (let varv = 0; varv < 5; varv++) {
      let lo = 1.2, hi = 30;
      for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; const b = ndcRam(mal, mid, fov); const g = smal ? FYLL.smal : FYLL.dator; if (!b.bakom && b.x0 >= -g && b.x1 <= g && b.y0 >= -g && b.y1 <= g) hi = mid; else lo = mid; }
      kamDist = hi;
      // kameran får inte gå ut genom dörren: vidga i stället synfältet
      const kz = mal.z + kamRikt.z * kamDist;
      if (kz > KAM_Z_MAX && fov < 74) { fov += 3; continue; }
      const b = ndcRam(mal, kamDist, fov);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      _fram.copy(kamRikt).negate(); _hoger.crossVectors(_fram, tmpKam.up).normalize(); _upp.crossVectors(_hoger, _fram);
      const halvH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * kamDist, halvB = halvH * tmpKam.aspect;
      mal.addScaledVector(_hoger, cx * halvB * 0.9).addScaledVector(_upp, cy * halvH * 0.9);
    }
    kamFov = fov;
    s.kamerastyr.mal.copy(mal);
    s.kamerastyr.position.copy(mal).addScaledVector(kamRikt, kamDist);
    basKam.mal.copy(mal); basKam.pos.copy(s.kamerastyr.position);
    framvagg.position.x = basKam.pos.x + kamRikt.x * 0.6;
    s.kamerastyr.parallax.set(smal ? 0.06 : 0.12, smal ? 0.03 : 0.06);
    s.kamerastyr.andning = smal ? 0.006 : 0.01;
    s.camera.fov = fov;
    s.camera.setViewOffset(rw, rh, -reg.x0, -reg.y0, w, h);
    s.camera.updateProjectionMatrix();
    if (s.bloom) { s.bloom.strength = smal || mobil ? 0.3 : 0.32; s.bloom.radius = 0.24; s.bloom.threshold = 1.05; }
    etiketterBas = null;
  }
  s.storlek(rama);

  /* ---- etiketterna: stegens knappar ligger på tavlans rader (följer tavlan med transform – ingen layout per bild) ---- */
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const radRuta = (k) => { // radens textruta i tavlans koordinater: från prickens högerkant till listans högerkant, ovanför mätaren
    const y0 = TV.rad0 + k * RAD_H + RAD_H * 0.08, y1 = TV.rad0 + (k + 1) * RAD_H - RAD_H * 0.24;
    return { x0: TV.text0 - 0.005, x1: TV.lista1 - 0.015, y0, y1 };
  };
  const ytPunkt = (fx, fy, ut) => { ut.set(-TAVLA.b / 2 + fx * TAVLA.b, TAVLA.h / 2 - fy * TAVLA.h, 0.02); return tavlaGrupp.localToWorld(ut); };
  const matRuta = (r) => { const a = s.projicera(ytPunkt(r.x0, r.y0, _a)), b = s.projicera(ytPunkt(r.x1, r.y1, _b)); return { x: a.x, y: a.y, b: Math.max(1, b.x - a.x), h: Math.max(1, b.y - a.y) }; };
  const matRad = (k) => matRuta(radRuta(k));
  // rubrikraden överst på skärmen (glasbandet i texturen): riktig text som följer tavlan med transform
  const RUB = { x0: TV.lista0 + 0.008, x1: TV.plan1 - 0.008, y0: 0.016, y1: 0.094 };
  const rubrik = document.createElement('div');
  rubrik.className = 'ss-rubrik'; rubrik.setAttribute('aria-hidden', 'true');
  rubrik.innerHTML = '<span class="ss-rub-u">U</span><strong>Säljtavlan</strong><span class="ss-rub-live"><i></i>Live</span>'
    + '<span class="ss-rub-hoger"><span class="ss-rub-chip" data-ton="mint" data-ss-rub-oppet></span><span class="ss-rub-chip" data-ss-rub-dag></span></span>';
  const rubOppet = rubrik.querySelector('[data-ss-rub-oppet]'), rubDag = rubrik.querySelector('[data-ss-rub-dag]');
  let rubBas = null, rubNyckel = '';
  function rubrikText(d) {
    const oppet = d ? d.steg.slice(0, 4).reduce((sum, x) => sum + x.varde, 0) : 0;
    rubOppet.textContent = d ? `Öppet ${krKort(oppet)}` : ''; rubOppet.hidden = !d;
    rubDag.textContent = new Date().toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  }
  function raknaBas() {
    if (!et.lista.length || s.bredd < 2) return;
    // grundmåtten från grundkameran (utan musens parallax och andning): knapparnas storlek och textstorlek sätts en gång
    const cam = s.camera; const sp = cam.position.clone(), sq = cam.quaternion.clone();
    cam.position.copy(basKam.pos); cam.lookAt(basKam.mal); cam.updateMatrixWorld(); tavlaGrupp.updateMatrixWorld(true);
    etiketterBas = et.lista.map((n, k) => matRad(k));
    rubBas = matRuta(RUB);
    cam.position.copy(sp); cam.quaternion.copy(sq); cam.updateMatrixWorld();
    rubrik.style.width = `${rubBas.b.toFixed(1)}px`; rubrik.style.height = `${rubBas.h.toFixed(1)}px`;
    rubrik.style.setProperty('--ss-rub-h', `${rubBas.h.toFixed(1)}px`);
    rubrik.toggleAttribute('data-smal', rubBas.b < 330); // smal tavla: datumet får inte plats
    rubNyckel = '';
    const radH = etiketterBas[0].h, radB = etiketterBas[0].b;
    if (et.rot) {
      et.rot.style.setProperty('--ss-rad-h', `${radH.toFixed(1)}px`); et.rot.style.setProperty('--ss-rad-b', `${radB.toFixed(1)}px`);
      et.rot.toggleAttribute('data-ss-tat', radH < 28);   // namn och värde på en rad
      et.rot.toggleAttribute('data-ss-kort', radB < 150);  // kortnamnen (Kontakt, Besök …)
    }
    et.lista.forEach((n, k) => { n.style.width = `${etiketterBas[k].b.toFixed(1)}px`; n.style.height = `${etiketterBas[k].h.toFixed(1)}px`; });
    et.cache = new Map();
  }
  function uppdateraEtiketter(it) {
    if (!et.lista.length || !et.lista[0].isConnected) return;
    if (!etiketterBas) raknaBas();
    if (!etiketterBas) return;
    et.lista.forEach((n, k) => {
      const nu = matRad(k), bas = etiketterBas[k];
      const sx = nu.b / bas.b, sy = nu.h / bas.h;
      const nyckel = `${nu.x.toFixed(1)}|${nu.y.toFixed(1)}|${sx.toFixed(3)}|${sy.toFixed(3)}`;
      if (et.cache.get(n) !== nyckel) { et.cache.set(n, nyckel); n.style.transform = `translate3d(${nu.x.toFixed(1)}px, ${nu.y.toFixed(1)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`; }
      const ska = it > 2.15 + k * 0.12;
      if (ska !== n.hasAttribute('data-synlig')) n.toggleAttribute('data-synlig', ska);
      const hov = et.hover === k || hoverRad === k;
      if (hov !== n.hasAttribute('data-hover')) n.toggleAttribute('data-hover', hov);
    });
    if (rubBas) {
      const nu = matRuta(RUB);
      const nyckel = `${nu.x.toFixed(1)}|${nu.y.toFixed(1)}|${(nu.b / rubBas.b).toFixed(3)}|${(nu.h / rubBas.h).toFixed(3)}`;
      if (nyckel !== rubNyckel) { rubNyckel = nyckel; rubrik.style.transform = `translate3d(${nu.x.toFixed(1)}px, ${nu.y.toFixed(1)}px, 0) scale(${(nu.b / rubBas.b).toFixed(4)}, ${(nu.h / rubBas.h).toFixed(4)})`; }
      const ska = it > 1.95;
      if (ska !== rubrik.hasAttribute('data-synlig')) rubrik.toggleAttribute('data-synlig', ska);
    }
    if (!et.placerad) { et.placerad = true; if (et.rot) et.rot.setAttribute('data-ss-placerad', ''); }
  }

  /* ---- magnetens skylt: kund, affär och värde vid pekaren (bara mus – samma uppgifter finns på korten i tavlan) ---- */
  const tips = document.createElement('div');
  tips.className = 'ss-tips'; tips.setAttribute('aria-hidden', 'true');
  const tipsSteg = document.createElement('small'), tipsNamn = document.createElement('strong'), tipsText = document.createElement('span');
  const tipsFot = document.createElement('span'), tipsVarde = document.createElement('b'), tipsHint = document.createElement('em');
  tipsFot.className = 'ss-tips-fot'; tipsHint.textContent = 'Klicka för att öppna';
  tipsFot.append(tipsVarde, tipsHint);
  tips.append(tipsSteg, tipsNamn, tipsText, tipsFot);
  let tipsId = '';
  function visaTips(p) {
    if (!p) { if (tipsId) { tipsId = ''; tips.removeAttribute('data-synlig'); } return; }
    if (tipsId !== p.id) {
      tipsId = p.id;
      tipsNamn.textContent = p.namn || 'Affär';
      tipsSteg.textContent = senasteData && senasteData.steg[p.k] ? senasteData.steg[p.k].namn : '';
      tipsText.textContent = p.titel || ''; tipsText.hidden = !p.titel;
      tipsVarde.textContent = krKort(p.varde);
      tips.style.setProperty('--farg', hex(FARGER[STEG_ID[p.k]] || FARG.mint));
      tipsFot.hidden = false;
      tips.setAttribute('data-synlig', '');
    }
    placeraTips(s.projicera(magnetVarld(p, _a)));
  }
  // Gustavs tröja: samma skylt, utan värde och klick
  function visaTrojTips() {
    if (tipsId !== 'gustav') {
      tipsId = 'gustav';
      tipsSteg.textContent = 'IFK Göteborg'; tipsNamn.textContent = 'Gustav Svensson';
      tipsText.textContent = 'Nummer 13 – i truppen 2008 och efter återkomsten'; tipsText.hidden = false; tipsFot.hidden = true;
      tips.style.setProperty('--farg', '#8ab8ff');
      tips.setAttribute('data-synlig', '');
    }
    placeraTips(s.projicera(gustavTroja.localToWorld(_a.set(0, 0.02, 0.02))));
  }
  function placeraTips(q) {
    const b = tips.offsetWidth || 180, h = tips.offsetHeight || 70;
    const x = klamp(q.x, b / 2 + 6, Math.max(b / 2 + 6, s.bredd - b / 2 - 6));
    const under = q.y - h - 18 < 6;
    tips.style.transform = `translate3d(${x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0) translate(-50%, ${under ? '16px' : 'calc(-100% - 16px)'})`;
  }

  /* ---- pekaren: hovring och klick på raderna och magneterna (duken släpper igenom pekaren – vi lyssnar på noden) ---- */
  const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let hoverRad = -1, hoverMagnet = null, hoverTroja = false, pekNy = false, pekX = 0, pekY = 0, pekFinns = false, lyssnar = null, ritaPlanerad = false;
  const traffaRad = (cx, cy) => {
    const r = s.canvas.getBoundingClientRect();
    if (r.width < 2 || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return -1;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    s.camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, s.camera);
    const h = raycaster.intersectObject(yta, false)[0];
    if (!h || !h.uv) return -1;
    const fy = 1 - h.uv.y; if (fy < TV.rad0 || fy > TV.rad1) return -1;
    return klamp(Math.floor((fy - TV.rad0) / RAD_H), 0, 4);
  };
  const traffaMagnet = (cx, cy) => {
    const r = s.canvas.getBoundingClientRect(); if (r.width < 2) return null;
    const x = cx - r.left, y = cy - r.top; let bast = null, bastD = Infinity;
    for (const p of magnetLista.values()) {
      if (p.ut || (p.resa && p.resa.intro)) continue;
      const q = s.projicera(magnetVarld(p, _b)); const radie = Math.max(10, p.pxRadie + 5); const dd = Math.hypot(q.x - x, q.y - y);
      if (dd < radie && dd < bastD) { bast = p; bastD = dd; }
    }
    return bast;
  };
  const traffaTroja = (cx, cy) => {
    const r = s.canvas.getBoundingClientRect();
    if (r.width < 2 || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    s.camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, s.camera);
    return raycaster.intersectObject(gustavTroja, true).length > 0; // bålen, ärmarna, kragen och muddarna
  };
  function kopplaPekare(nod) {
    if (lyssnar) { const l = lyssnar; l.nod.removeEventListener('pointermove', l.flytt); l.nod.removeEventListener('pointerleave', l.lamna); l.nod.removeEventListener('click', l.klick); l.av.forEach((f) => f()); }
    const ritaVidLugn = () => { if (s.lugn && !ritaPlanerad) { ritaPlanerad = true; requestAnimationFrame(() => { ritaPlanerad = false; s.rita(); }); } };
    const flytt = (ev) => { if (ev.pointerType && ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return; pekX = ev.clientX; pekY = ev.clientY; pekNy = true; pekFinns = true; ritaVidLugn(); };
    const lamna = () => { pekFinns = false; pekNy = true; ritaVidLugn(); };
    const klick = (ev) => {
      if (ev.defaultPrevented || ev.target.closest('.ss-steg, a, button')) return;
      const p = traffaMagnet(ev.clientX, ev.clientY);
      if (p) { location.hash = `#/affar/${encodeURIComponent(p.id)}`; return; }
      const k = traffaRad(ev.clientX, ev.clientY);
      if (k >= 0 && et.lista[k]) { et.lista[k].click(); return; }
      if (traffaTroja(ev.clientX, ev.clientY)) knuffa(0.22);
    };
    nod.addEventListener('pointermove', flytt, { passive: true });
    nod.addEventListener('pointerleave', lamna);
    nod.addEventListener('click', klick);
    const av = [];
    et.lista.forEach((n, k) => {
      const in_ = () => { et.hover = k; ritaVidLugn(); }; const ut = () => { if (et.hover === k) et.hover = -1; ritaVidLugn(); };
      for (const [typ, fn] of [['pointerenter', in_], ['pointerleave', ut], ['focus', in_], ['blur', ut]]) { n.addEventListener(typ, fn); av.push(() => n.removeEventListener(typ, fn)); }
    });
    lyssnar = { nod, flytt, lamna, klick, av };
  }
  function uppdateraHovring() {
    if (!pekNy && !pekFinns) return;
    pekNy = false;
    hoverMagnet = pekFinns ? traffaMagnet(pekX, pekY) : null;
    hoverRad = hoverMagnet ? hoverMagnet.k : pekFinns ? traffaRad(pekX, pekY) : -1;
    const troja = !hoverMagnet && hoverRad < 0 && pekFinns && traffaTroja(pekX, pekY);
    if (troja && !hoverTroja) knuffa(0.1);
    hoverTroja = troja;
    const n = s.vard; if (n) n.style.cursor = hoverMagnet || hoverRad >= 0 ? 'pointer' : '';
    if (hoverTroja) visaTrojTips(); else visaTips(hoverMagnet);
  }

  /* ---- data → magneternas mål ---- */
  const magnetLista = new Map(); // id → { id, k, j, n, r, namn, titel, varde, fx, fy, fran, resa, ut, land, pxRadie }
  let introT0 = null, tNu = 0, dataNyckel = '';
  // magnetens plats på tavlan (andelar): på sin rads linje över planen, i två led när raden är full; signerat = i målet
  function malPlats(p) {
    const k = p.k, n = Math.max(1, p.n);
    if (k === 4) { // i straffområdet/målet: tätt packade
      const per = Math.min(n, 8), led = Math.floor(p.j / per), i = p.j % per, cnt = Math.min(per, n - led * per);
      const x0 = 0.745 - (cnt - 1) * 0.0175; return { fx: x0 + i * 0.035, fy: radMitt(4) - 0.012 + led * 0.042 - (n > 8 ? 0.02 : 0) };
    }
    const per = n > 11 ? Math.ceil(n / 2) : n, led = Math.floor(p.j / per), i = p.j % per, cnt = Math.min(per, n - led * per);
    const bredd = TV.plan1 - TV.plan0 - 0.07, steg = Math.min(0.06, bredd / Math.max(1, cnt));
    const x0 = (TV.plan0 + TV.plan1) / 2 - ((cnt - 1) * steg) / 2;
    return { fx: x0 + i * steg, fy: radMitt(k) + (n > 11 ? (led ? 0.026 : -0.026) : 0) };
  }
  const magnetRadie = (v, max) => 0.026 + 0.016 * Math.sqrt(klamp(max > 0 ? v / max : 0));
  function sattData(d, direkt = false) {
    if (!d) return;
    const maxV = Math.max(0, ...d.steg.flatMap((x) => x.affarer.map((a) => a.varde)));
    const nya = new Set();
    const forsta = introT0 == null && !magnetLista.size;
    d.steg.forEach((st, k) => st.affarer.forEach((a, j) => {
      nya.add(a.id);
      const r = magnetRadie(a.varde, maxV) * (k === 4 ? 0.8 : 1);
      let p = magnetLista.get(a.id);
      if (!p) {
        p = { id: a.id, k, j, n: st.affarer.length, r, namn: a.namn, titel: a.titel, varde: a.varde, fx: 0, fy: 0, fran: null, resa: null, ut: null, land: 0, pxRadie: 8, farg: new THREE.Color(FARGER[st.id]), fargMal: new THREE.Color(FARGER[st.id]) };
        magnetLista.set(a.id, p);
        Object.assign(p, malPlats(p));
        if (!direkt) p.resa = { t0: forsta ? null : tNu, fordrojning: forsta ? 2.0 + k * 0.16 + j * 0.07 : 0, dur: 0.55, intro: true };
      } else {
        const bytt = p.k !== k || p.j !== j || p.n !== st.affarer.length;
        const fore = { fx: p.fx, fy: p.fy };
        Object.assign(p, { k, j, n: st.affarer.length, r, namn: a.namn, titel: a.titel, varde: a.varde, ut: null });
        p.fargMal.set(FARGER[st.id]);
        const mal = malPlats(p);
        if (bytt && !direkt) p.resa = { t0: tNu, fordrojning: 0, dur: Math.abs(mal.fy - fore.fy) > 0.05 ? 1.1 : 0.5, fran: fore, lyft: Math.abs(mal.fy - fore.fy) > 0.05 };
        Object.assign(p, mal);
        if (direkt) p.farg.copy(p.fargMal);
      }
    }));
    for (const p of magnetLista.values()) if (!nya.has(p.id) && !p.ut) p.ut = { t0: tNu };
    dataNyckel = d.nyckel;
    tipsId = '';
    tavlaData = d; tavlaTex.rita(); rubrikText(d);
  }
  const _mv = new THREE.Vector3();
  // magnetens nuvarande plats i världen (för skylten och träffen)
  function magnetVarld(p, ut) { ut.set(-TAVLA.b / 2 + (p.vx ?? p.fx) * TAVLA.b, TAVLA.h / 2 - (p.vy ?? p.fy) * TAVLA.h, 0.03 + (p.vz || 0)); return tavlaGrupp.localToWorld(ut); }
  const _mq = new THREE.Quaternion(), _ms = new THREE.Vector3(), _mm = new THREE.Matrix4(), _c = new THREE.Color(), Z_AXEL = new THREE.Vector3(0, 0, 1);
  function uppdateraMagneter(t, dt, lugn) {
    let n = 0;
    const pxPerM = s.hojd / (2 * Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2)) * Math.max(0.5, kamDist));
    for (const p of magnetLista.values()) {
      let fx = p.fx, fy = p.fy, z = 0, skala = 1, vrid = 0;
      if (p.resa && !lugn) {
        const R = p.resa; if (R.t0 == null) R.t0 = t;
        const u = (t - R.t0 - R.fordrojning) / R.dur;
        if (u < 0) { if (R.intro) skala = 0; else if (R.fran) { fx = R.fran.fx; fy = R.fran.fy; } }
        else if (u >= 1) { p.resa = null; p.land = 1; radSken[p.k].ping = Math.min(1, radSken[p.k].ping + 0.5); }
        else if (R.intro) { // klickar fast: kommer framifrån, studsar mot tavlan
          z = (1 - utStuds(u)) * 0.35; skala = Math.min(1, u * 4); vrid = (1 - u) * 1.6;
        } else { // glider över tavlan; mellan raderna lyfts den lite
          const e = inUt(u); fx = R.fran.fx + (p.fx - R.fran.fx) * e; fy = R.fran.fy + (p.fy - R.fran.fy) * e; if (R.lyft) z = Math.sin(e * Math.PI) * 0.06;
        }
      }
      if (p.ut) { const u = klamp((t - p.ut.t0) / 0.45); skala *= 1 - u; z += u * 0.1; if (u >= 1 || lugn) { magnetLista.delete(p.id); continue; } }
      p.vx = fx; p.vy = fy; p.vz = z;
      if (dt > 0) { p.farg.lerp(p.fargMal, Math.min(1, dt * 2.5)); p.land = Math.max(0, p.land - dt * 2.4); } else { p.farg.copy(p.fargMal); p.land = 0; }
      if (n >= MAX_M) continue;
      const hov = p === hoverMagnet ? 1 : radSken[p.k].hover * 0.5;
      const studs = p.land > 0 ? Math.sin((1 - p.land) * Math.PI) * 0.3 : 0;
      const r = p.r * skala * (1 + hov * 0.18 + studs);
      _mv.set(-TAVLA.b / 2 + fx * TAVLA.b, TAVLA.h / 2 - fy * TAVLA.h, 0.0268 + z);
      _mq.setFromAxisAngle(Z_AXEL, vrid);
      const q = Math.max(1e-4, r * 4.2);
      _mm.compose(_mv, _mq, _ms.set(q, q, 1));
      magneter.setMatrixAt(n, _mm);
      magneter.setColorAt(n, p.farg);
      tokenGlod[n] = Math.min(1, hov + p.land * 0.8);
      p.pxRadie = r * pxPerM;
      n++;
    }
    magneter.count = n;
    magneter.instanceMatrix.needsUpdate = true; glodAttr.needsUpdate = true;
    if (magneter.instanceColor) magneter.instanceColor.needsUpdate = true;
  }

  /* ---- varje bildruta ---- */
  const nivaFor = (it, start, langd = 0.5) => klamp((it - start) / langd);
  // lysrör: flimrar ett par gånger innan de står stadigt
  const lysror = (it, start, t, fas) => { const u = it - start; if (u < 0) return 0; if (u > 0.55) return 1; const f = Math.sin(fas * 37.3 + Math.floor(t * 30) * 12.9898) * 43758.5453; return (f - Math.floor(f)) > 0.45 ? 0.9 : 0.08; };
  const _tidNu = new Date();
  let senastKlocka = -1;
  // Gustavs tröja: gungar på armen (fjäder och dämpning mot en långsam, lite oregelbunden rörelse), en knuff ger fart; glansen sveper över
  // trycket när spotten tänts och sedan var nionde sekund (och direkt vid en knuff). Returnerar spottens nivå.
  const gS = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, glans0: null, hov: 0 };
  const _gq = new THREE.Quaternion(), _ge = new THREE.Euler();
  function knuffa(styrka) {
    if (s.lugn) return;
    gS.vp += styrka; gS.vr += styrka * 0.45 * (Math.sin(tNu * 7.1) > 0 ? 1 : -1); gS.vy += styrka * 0.6;
    if (gS.glans0 == null || (tNu - gS.glans0) % 9 > 1.6) gS.glans0 = tNu;
    s.rita();
  }
  function uppdateraGustav(t, dt, lugn, it, niva) {
    const d = lugn ? 0 : Math.min(0.05, dt || 0);
    if (d > 0) {
      const mp = Math.sin(t * 0.47) * 0.02 + Math.sin(t * 0.29 + 1.3) * 0.012, mr = Math.sin(t * 0.36 + 0.6) * 0.012, my = Math.sin(t * 0.23 + 2.1) * 0.035;
      gS.vp += ((mp - gS.p) * 5.5 - gS.vp * 1.2) * d; gS.p += gS.vp * d;
      gS.vr += ((mr - gS.r) * 7 - gS.vr * 1.4) * d; gS.r += gS.vr * d;
      gS.vy += ((my - gS.y) * 3.5 - gS.vy * 1.0) * d; gS.y += gS.vy * d;
    }
    gustav.quaternion.copy(gustavBasQ).multiply(_gq.setFromEuler(_ge.set(lugn ? 0 : gS.p, lugn ? 0 : gS.y, lugn ? 0 : gS.r)));
    gustavUni.uTid.value = lugn ? 1.3 : t; gustavUni.uPitch.value = lugn ? 0 : gS.vp; gustavUni.uRoll.value = lugn ? 0 : gS.vr;
    if (gS.glans0 == null && !lugn && it > 2.2) gS.glans0 = t;
    let g = -1; if (!lugn && gS.glans0 != null) { const u = (t - gS.glans0) % 9; if (u < 1.6) g = u / 1.6; }
    gustavUni.uGlans.value = g;
    gS.hov += ((hoverTroja ? 1 : 0) - gS.hov) * (lugn || !dt ? 1 : Math.min(1, dt * 6));
    gustavUni.uGlod.value = gS.hov;
    if (gustavDamm) gustavDamm.visible = niva > 0.2;
    if (gustavStrale) { gustavStrale.uStyrka.value = niva * (1 + 0.35 * gS.hov); gustavStrale.uTid.value = lugn ? 0 : t; }
    return niva * (1 + 0.25 * gS.hov);
  }
  if (senasteData) sattData(senasteData, direktStart);
  s.ram((t, dt) => {
    tNu = t;
    const lugn = s.lugn;
    if (introT0 == null) introT0 = t;
    const it = lugn || direktStart ? 99 : t - introT0;
    const f = lugn || !dt ? 1 : Math.min(1, dt * 9);

    // intro: kameran glider in genom dörren och sänker sig mot sin plats
    const ks = s.kamerastyr;
    if (!lugn && it < 3.2) { const e = 1 - inUt(it / 3.2); s.camera.userData.intro = e; ks.position.copy(ks.mal).addScaledVector(kamRikt, kamDist + 1.2 * e); ks.position.y += 0.08 * e; }
    else if (s.camera.userData.intro !== 0) { s.camera.userData.intro = 0; ks.position.copy(ks.mal).addScaledVector(kamRikt, kamDist); }

    // ljuset tänds: lysrören, ledlisterna bakåt, IFK GÖTEBORG och spottarna
    let tak = 0;
    takLister.forEach((l, i) => { const v = lugn || direktStart ? 1 : lysror(it, l.start, t, i); tak += v; l.mesh.material.color.copy(l.bas).multiplyScalar(v); });
    tak /= takLister.length;
    listUni.uIn.value = lugn || direktStart ? 99 : Math.max(0, it - 0.55); listUni.uTid.value = t;
    const rumNiva = lugn || direktStart ? 1 : klamp(tak * 0.8 + nivaFor(it, 0.6, 1.2) * 0.2);
    if (s.ljus) { s.ljus.himmel.intensity = ljusBas.himmel * (0.25 + 0.75 * rumNiva); s.ljus.nyckel.intensity = ljusBas.nyckel * rumNiva; s.ljus.fyll.intensity = ljusBas.fyll * (0.3 + 0.7 * rumNiva); }
    const skapNiva = lugn || direktStart ? 1 : nivaFor(it, 0.9, 1.0);
    varmV.intensity = 5 * skapNiva; varmH.intensity = 5 * skapNiva; varmV2.intensity = 3.2 * skapNiva; varmH2.intensity = 3.2 * skapNiva;
    const ifkNiva = lugn || direktStart ? 1 : nivaFor(it, 1.45, 0.7);
    ifkMat.color.setScalar(1.12 * ifkNiva * (0.97 + 0.03 * Math.sin(t * 2.1)));
    const spotNiva = lugn || direktStart ? 1 : nivaFor(it, 1.75, 0.35);
    spotTavla.intensity = 9 * spotNiva; spotTroja.intensity = 5.2 * uppdateraGustav(t, dt, lugn, it, lugn || direktStart ? 1 : nivaFor(it, 2.0, 0.4));
    if (kaglaTavla) kaglaTavla.uStyrka.value = spotNiva; if (kaglaTroja) kaglaTroja.uStyrka.value = spotTroja.intensity / 6;
    if (damm) damm.visible = spotNiva > 0.2;
    duschLjus.material.color.setScalar(2.2 * rumNiva);

    // tavlan: pilarna ritas fram, radernas sken (hovring, stegbandet, landning)
    // skärmen tänds (svep från mitten) när rummets ljus är på; sedan pilarna och markörerna
    skarmUni.uIn.value = lugn || direktStart ? 1 : klamp((it - 1.55) / 0.85);
    glasUni.uTid.value = lugn ? 0 : t; tokenUni.uTid.value = lugn ? 0.4 : t;
    pilUni.uRita.value = lugn || direktStart ? 1 : klamp((it - 2.5) / 1.4); pilUni.uTid.value = lugn ? 0 : t;
    radSken.forEach((r, k) => {
      const knapp = et.lista[k];
      const aktiv = knapp && knapp.hasAttribute('data-aktiv') ? 1 : 0, hov = et.hover === k || hoverRad === k ? 1 : 0;
      r.hover += (hov - r.hover) * f; r.aktiv += (aktiv - r.aktiv) * f; if (dt > 0) r.ping = Math.max(0, r.ping - dt * 1.4);
      r.uni.uStyrka.value = r.hover * 0.8 + r.ping * 0.4;
    });

    // tröjorna rör sig sakta, ångan driver ut ur duschen, klockan går
    svajUni.uTid.value = lugn ? 1.3 : t;
    for (const sp of anga) {
      const u = lugn ? sp.userData.fas : (t * 0.075 + sp.userData.fas) % 1;
      sp.position.set(-RUM.x + 0.15 + u * 1.25 + sp.userData.x * 0.25, 1.15 + u * 1.1 + sp.userData.x * 0.3, DUSCH_Z + sp.userData.z * 0.6 + u * 0.35);
      const st = 0.35 + u * 1.15; sp.scale.set(st, st, 1);
      sp.material.opacity = Math.sin(u * Math.PI) * 0.12 * rumNiva;
    }
    const sek = Math.floor(performance.now() / 1000);
    if (sek !== senastKlocka) {
      senastKlocka = sek; _tidNu.setTime(Date.now());
      const h = _tidNu.getHours() % 12, mi = _tidNu.getMinutes(), se = _tidNu.getSeconds();
      timVisare.rotation.z = -((h + mi / 60) / 12) * Math.PI * 2; minVisare.rotation.z = -((mi + se / 60) / 60) * Math.PI * 2; sekVisare.rotation.z = -(se / 60) * Math.PI * 2;
    }

    uppdateraHovring();
    uppdateraMagneter(t, dt, lugn);
    uppdateraEtiketter(it);
    if (hoverMagnet) visaTips(hoverMagnet); else if (hoverTroja) visaTrojTips();
  });

  // felsökning (mätskripten): sätt window.UPSaljFelsok = {} före besöket – då får den rummet, scenen och magneterna
  if (window.UPSaljFelsok && typeof window.UPSaljFelsok === 'object') Object.assign(window.UPSaljFelsok, { rum, s, magnetLista, gustav, gustavTroja, knuffa });
  return {
    koppla(nod, d) {
      const rot = nod.querySelector('[data-ss-etiketter]');
      et.lista = rot ? [...rot.querySelectorAll('.ss-steg')] : [];
      et.cache = new Map(); et.hover = -1; et.rot = rot; et.placerad = !!(rot && rot.hasAttribute('data-ss-placerad'));
      etiketterBas = null;
      if (tips.parentNode !== nod) nod.appendChild(tips);
      if (rubrik.parentNode !== nod) nod.appendChild(rubrik);
      rubrikText(d || senasteData);
      hoverMagnet = null; hoverTroja = false; visaTips(null);
      const igang = introT0 != null && tNu - introT0 > 3;
      if (igang || direktStart) { rubrik.setAttribute('data-direkt', ''); rubrik.setAttribute('data-synlig', ''); requestAnimationFrame(() => requestAnimationFrame(() => rubrik.removeAttribute('data-direkt')));
        rot && rot.setAttribute('data-direkt', ''); et.lista.forEach((n) => n.setAttribute('data-synlig', '')); requestAnimationFrame(() => requestAnimationFrame(() => rot && rot.removeAttribute('data-direkt'))); }
      if (d && d.nyckel !== dataNyckel) sattData(d, s.lugn);
      else if (d) senasteData = d;
      kopplaPekare(nod);
      nod.setAttribute('data-ss-rum', '');
      if (s.bredd > 1 && s.hojd > 1) rama(s.bredd, s.hojd);
      try { document.fonts.ready.then(() => { if (et.lista[0] && et.lista[0].isConnected) { etiketterBas = null; } }); } catch (err) { /* ok */ }
      nod.setAttribute('data-ss-3d', '');
      s.klar.then(() => { if (nod.isConnected) nod.setAttribute('data-ss-klar', ''); });
      s.rita();
      if (igang || direktStart) { try { s.camera.updateMatrixWorld(); uppdateraEtiketter(99); } catch (err) { /* nästa bildruta placerar dem */ } }
    },
    omrama() { if (s.bredd > 1 && s.hojd > 1) { rama(s.bredd, s.hojd); s.rita(); } },
  };
}

const motor = varaktig(async (s) => { api = null; const a = await bygg(s); if (!s.forstord) api = a; }, {
  kamera: { fov: 44, position: [0, 1.9, 3.4], mal: [-0.1, 1.3, -0.85], nara: 0.05, fjarran: 40 },
  parallax: [0.12, 0.06], andning: 0.01, exponering: 1.0, miljo: 0.5, miljoToning: false, skuggor: true, skuggomfang: 5.2,
  // skärpan: översampling 1,25 och FXAA på dator i stället för MSAA (dyrt på inbyggd grafik), glöden i halv upplösning – 1,5 gav
  // långa bilder i 1920 px på Intel
  skarpa: (typeof innerWidth === 'number' && innerWidth > 1600) ? 1.25 : 1.5, msaa: matchMedia('(pointer: coarse)').matches ? 4 : 0, fxaa: true, bloomDel: 1,
  skuggTakt: 1e9, bloom: { styrka: 0.32, radie: 0.24, troskel: 1.05 },
});

/* ---- montering (scener.js) ---------------------------------------------------------------------------- */
// Första gången byggs scenen när vyn har ritats och sidan är ledig (låser aldrig tavlan); vid omritning flyttas duken direkt.
let misslyckad = false, vantar = null, lageObs = null;
const efterMalning = (fn, fordrojning = 0) => {
  let a = 0, b = 0, c = 0, avbruten = false;
  a = requestAnimationFrame(() => { b = setTimeout(() => { if (avbruten) return; if (typeof requestIdleCallback === 'function') c = requestIdleCallback(fn, { timeout: 120 }); else fn(); }, fordrojning); });
  return () => { avbruten = true; cancelAnimationFrame(a); clearTimeout(b); if (c && typeof cancelIdleCallback === 'function') cancelIdleCallback(c); };
};
// Mjukvaru-WebGL (SwiftShader, llvmpipe – inget grafikkort): första bygget låser sidan i ett par sekunder, och då fastnade
// förslagskortens entré under hjälten halvvägs. Där väntar bygget tills entrén har spelat klart. Kontrollen görs en gång.
let mjukvaraCache = null;
function mjukvaruWebgl() {
  if (mjukvaraCache !== null) return mjukvaraCache;
  mjukvaraCache = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) mjukvaraCache = true;
    else {
      let namn = String(gl.getParameter(gl.RENDERER) || '');
      const info = gl.getExtension('WEBGL_debug_renderer_info'); if (info) namn = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || namn);
      mjukvaraCache = /SwiftShader|llvmpipe|softpipe|Basic Render|Microsoft Basic/i.test(namn);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (err) { mjukvaraCache = false; }
  return mjukvaraCache;
}
// hur länge förslagskortens entré (sidor.css modul 04, sf-in) har kvar att spela, i ms – högst 1,6 s
function entreKvar() {
  let ms = 0;
  try {
    document.querySelectorAll('#vy .salj-forslag .sf-kort').forEach((k) => k.getAnimations().forEach((an) => {
      const t = an.effect && an.effect.getComputedTiming(); if (!t || an.playState === 'finished') return;
      ms = Math.max(ms, (Number(t.endTime) || 0) - (Number(an.currentTime) || 0));
    }));
  } catch (err) { ms = 0; }
  return Math.min(1600, Math.max(0, ms));
}
function anslut(nod, d) {
  if (!nod.isConnected) return;
  let s = null;
  try { s = motor.montera(nod); } catch (err) { console.error('[scen-salj] montera:', err); s = null; }
  if (!s) { misslyckad = true; nod.removeAttribute('data-ss-3d'); nod.setAttribute('data-ss-utan3d', ''); return; }
  // bygget är asynkront (rummet byggs i etapper): koppla när det är klart – och bara om noden fortfarande gäller
  if (api) api.koppla(nod, d);
  else s.byggd.then(() => { if (api && nod.isConnected) api.koppla(nod, senasteData || d); }, () => { misslyckad = true; nod.setAttribute('data-ss-utan3d', ''); });
}
export function montera(nod) {
  if (!nod) return { avmontera() {} };
  if (!webglFinns() || misslyckad) { nod.setAttribute('data-ss-utan3d', ''); return { avmontera() {} }; }
  const d = lasData(nod);
  if (!d) { nod.setAttribute('data-ss-utan3d', ''); return { avmontera() {} }; }
  senasteData = d;
  if (vantar) { vantar(); vantar = null; }
  if (motor.scen) anslut(nod, d);
  else { const kvar = entreKvar(); vantar = efterMalning(() => { vantar = null; anslut(nod, d); }, kvar && mjukvaruWebgl() ? kvar + 120 : 0); }
  if (lageObs) lageObs.disconnect();
  let senastB = 0;
  lageObs = new ResizeObserver(() => { const b = nod.clientWidth; if (Math.abs(b - senastB) < 1) return; senastB = b; if (api && motor.scen) api.omrama(); });
  lageObs.observe(nod);
  return { avmontera() { if (vantar) { vantar(); vantar = null; } if (lageObs) { lageObs.disconnect(); lageObs = null; } motor.vila(); } };
}
