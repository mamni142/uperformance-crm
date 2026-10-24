/* Uperformance CRM – 3D-motorn: gemensam grund för scenerna (scen-mote.js, scen-klubb.js, scen-oversikt.js).
   three.js r170 ligger lokalt i vendor/three – inget hämtas från nätet. ES-modul; laddas först när en scen behövs (scener.js).

   ─── KONTRAKT ───────────────────────────────────────────────────────────────────────────────────────────────
   import { skapaScen, varaktig, THREE, FARG, laddaCss, webglFinns } from './scen3d.js';

   const s = skapaScen(vard, installningar)   → scenobjekt, eller null om WebGL2 saknas (gör då ingenting).
     vard  = elementet som canvasen läggs i. Canvasen fyller värden (position:absolute; inset:0; pointer-events:none)
             – är värden position:static sätts den till relative. Storleken följer värden (ResizeObserver).
     installningar (alla valfria):
       kamera: { fov: 32, position: [0, 4.6, 9.5], mal: [0, 0.6, 0], nara: 0.1, fjarran: 120 }
       parallax: [0.45, 0.28]  kamerans förskjutning (världsenheter) efter musen – bara fin pekare; [0, 0] = av
       andning: 0.05           kamerans långsamma "andning" (världsenheter)
       exponering: 1           ACES-exponering        miljo: 0.65   scene.environmentIntensity
       miljoToning: true       mint- och isblå ljuslister i miljön (syns i reflexer på glas/metall/lack)
       miljoScen: (THREE, FARG) => Scene   egen miljö (t.ex. mörkt rum med ljuslister) i stället för RoomEnvironment
       miljoOskarpa: 0.035     PMREM-oskärpa för miljön
       bloom: { styrka: 0.6, radie: 0.55, troskel: 0.85 } | false   (räknas i halv upplösning)
       skuggor: true           PCFSoft-skuggor från nyckelljuset      skuggomfang: 6 (skuggkamerans halva bredd)
       ljus: true              standardriggen (himmel + nyckel + fyll + kant); false = inga ljus alls
       maxFps: 60    msaa: 4 (0 i låg kvalitet)    stadaEfter: 45000 ms (vilande/lösgjord scen städas)
       fxaa: false             kantutjämning efter tonmappningen (FXAA) – billig jämfört med MSAA i halvflyttal på inbyggd grafik
                               och fungerar även när pixeltätheten sänks; kombineras med msaa: 0 (och gärna skarpa) på dator
       skarpa: 0               lägsta pixeltäthet på dator (t.ex. 1.5 = översampling på skärmar med täthet 1; tak 1.75)
       vilaEfter: 12000 ms     utan pekare/scroll/tangent så länge ritas högst 30 bilder/s (full takt vid nästa rörelse)
       aterstallningsfrist: 4000 ms   förlorad WebGL-kontext som inte återställs inom fristen → scenen städas
       stillbild: 1.6          tiden t som ritas när prefers-reduced-motion är på
       tona: true              canvasen tonas in när första bilden är ritad
       klass: ''               extra klass på canvasen (den har alltid "scen3d-duk")

   Scenobjektet s:
     s.THREE, s.renderer, s.scene, s.camera, s.composer, s.bloom (UnrealBloomPass), s.canvas
     s.ljus      { himmel: HemisphereLight, nyckel: DirectionalLight (skuggor), fyll, kant }  (null om ljus:false)
     s.material  delade fysikaliska material – KLONA (s.mat) innan du ändrar dem:
                 bord, bordLjus, glas, glasFrost, metall, krom, morkMetall, gjutjarn, plast, plastMork, gummi, papper,
                 skarm, navy, mint, orange, glodMint, glodIs, glodOrange, glodGul, glodRod, glodVit, holo
     s.textur    { brus, borstad, rund, skugga }  (brus/borstad = roughnessMap, rund = mjuk prick, skugga = radiell skugga)
     s.kvalitet  'hog' | 'mobil' | 'lag'  (lag = mjukvaru-WebGL – failIfMajorPerformanceCaveat eller renderarens namn
                 SwiftShader/llvmpipe/Microsoft Basic: halvera partiklar o.d.)     s.lugn = prefers-reduced-motion
                 Test/felsökning: window.UPScen3DKvalitet = 'hog' | 'mobil' | 'lag' före första scenen tvingar nivån.
     s.kamerastyr { position: Vector3, mal: Vector3, parallax: Vector2, andning, av: false } – ändra fritt varje bildruta;
                 av = true → motorn rör inte kameran alls.
     s.mus       { x, y } utjämnad musposition relativt canvasen, −1…1 (0 utan mus)
     s.pekare    Vector2 i NDC (−1…1) + .over (true när pekaren är över canvasen)
     s.ram(fn)            fn(t, dt, s) varje bildruta före ritning (t = sekunder i rörelse, dt ≤ 0,1). Ger avregistrera().
     s.storlek(fn)        fn(bredd, hojd, s) vid varje storleksändring (och direkt). Ger avregistrera().
     s.rita()             rita en bild nu (t.ex. efter en ändring i stillbildsläget)
     s.flytta(nyVard)     flytta canvasen till en ny värd (vyn har ritats om) – samma WebGL-kontext. false om scenen är städad.
     s.vila()             lossa canvasen och pausa; städas efter stadaEfter ms om den inte flyttas tillbaka
     s.forstor() / s.förstör()   städa allt (geometrier, material, texturer, renderer, kontext)
     s.forstord, s.bredd, s.hojd, s.tid, s.aktiv (ritslingan går)
     s.klar               Promise som uppfylls när första bilden är ritad
     s.byggd              Promise som uppfylls när bygget är klart (alla s.vantaPa-löften) – före kompilering och första bild
     s.vantaPa(lofte)     shaders kompileras och första bilden ritas först när löftet är klart (anropas synkront efter skapaScen)
     s.projicera(v)       Vector3 eller Object3D → { x, y, z, syns } i CSS-px relativt värdens övre vänstra hörn
     s.traffa(lista)      raycast mot pekaren → träffar (tom lista om pekaren inte är över canvasen)
     s.canvasTextur(bredd, hojd, rita)  CanvasTexture (sRGB, anisotropi); rita(ctx, b, h). tex.rita([nyFn]) ritar om.
                          Ritas om automatiskt när Poppins/Manrope har laddats.
     s.uLogga(djup = 0.12, { ring: true, material, ringMaterial, sidMaterial })  → Group (diameter 1, framsida mot +z,
                          barn .u och .ring), extruderad från U-logotypens SVG med fasade kanter
     s.rundadLada(b, h, d, radie, segment = 5)  → RoundedBoxGeometry
     s.mat(namn, andringar)  klon av ett delat material med ändringar (städas automatiskt)
     s.miljo(material, styrka)  egen miljöreflex-styrka på ett material (three.js ignorerar annars envMapIntensity när
                          scene.environment används – då gäller scene.environmentIntensity). Rotationen följer scenens.
     s.vidForstor(fn)     fn(s) när scenen städas (vila → stadaEfter, förlorad WebGL-kontext, forstor). Ger avregistrera().
     s.glod(farg, styrka = 3)  MeshBasicMaterial i HDR (toneMapped:false) som fångas av bloom
     s.skuggor  { kasta(obj, ta = true), ta(obj), fangare(b, d, opacitet = 0.35) → osynligt golv som bara visar skugga,
                  omfang(halv, fjarran) }
     s.kontaktskugga(b, d, opacitet = 0.55)  mjuk mörk ellips (plan i XZ) under föremål
     s.halo(farg, storlek = 1, styrka = 2)   additiv ljusfläck (Sprite)
     s.partiklar(antal, { centrum, omrade, farg, storlek, styrka, fart, opacitet })  svävande glödpunkter (Points, animeras själv)
     s.stada(resurs)      lägg något (geometri/material/textur/renderTarget) i städlistan; ger tillbaka resursen

   varaktig(bygg, installningar) → { montera(vard) → s | null, vila(), forstor(), scen }
     Mönstret för vyer som ritas om: första montera skapar scenen och kör bygg(s); nästa montera flyttar canvasen
     (samma kontext). vila() när vyn lämnas; är scenen städad när vyn öppnas igen byggs den på nytt.
     bygg får vara async och bygga i etapper (await mellan föremålen) så att sidan aldrig låses: varaktig väntar in
     löftet (s.vantaPa) – vänta på s.byggd innan scenens egna handtag (t.ex. s.mote) används. Kontrollera s.forstord
     efter varje await. Ett bygge som kastar städar scenen.
   webglFinns() → bool (cachat).   laddaCss(url) → Promise (relativt den här filen, en gång per url).
   FARG = { ink, navy, mint, mintDjup, is, ben, gul, rod, orange } som tal (0xrrggbb).

   Förlorad WebGL-kontext: ritningen hoppar över bilder medan kontexten är borta; återställs den inte inom
   aterstallningsfrist städas scenen (vidForstor körs) och document får händelsen 'scen3d-tappad' med detail.vard =
   värden om scenen syntes (annars null) – scener.js monterar då vyn igen. Pixeltätheten sänks när takten inte hålls och höjs igen (med växande väntetid) när det går lätt.

   Ljus är fysikaliska (r170): DirectionalLight ~1–3, PointLight/SpotLight i candela med decay 2 (t.ex. 4–40 på 1–3 enheters
   avstånd). Skala: bordet ≈ 6–8 enheter brett, kameran ≈ 10 enheter bort. Ritslingan pausas när canvasen inte syns, fliken
   är dold, en modal (dialog/aria-modal/helskärm) täcker sidan eller canvasen lossats; prefers-reduced-motion = en stillbild.
   Bloom och alfa: canvasen är genomskinlig; glöd läggs additivt och alfa räknas om i sista passet så att glöd syns även
   över genomskinlig bakgrund. Inga inline-skript, inga externa URL:er (CSP). */
import * as THREE from './vendor/three/three.module.min.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from './vendor/three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from './vendor/three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from './vendor/three/addons/loaders/SVGLoader.js';

export { THREE, EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass, RoundedBoxGeometry, SVGLoader };

export const FARG = { ink: 0x0b1520, navy: 0x183653, mint: 0x7ee0c3, mintDjup: 0x0f6e57, is: 0xa7d2ff, ben: 0xf6f4ef, gul: 0xf0b545, rod: 0xe5674f, orange: 0xd9822b };

// U-logotypen (samma sökväg som i index.html / motescen.js), viewBox 0 0 396 395, mitt (198, 197.5)
const U_SOKVAG = 'M177.5,127.8v88.6c0,7.3,1.6,13,4.7,17.3,3.3,4.1,8.4,6.2,15.5,6.2s12.4-2.1,15.8-6.2c3.4-4.3,5.1-10.1,5.1-17.3v-88.6h49.1v88.6c0,14.9-3.1,27.8-9.3,38.4-6.2,10.5-14.7,18.4-25.5,23.8-10.8,5.3-22.9,8-36.2,8s-25.2-2.7-35.5-8c-10.2-5.3-18.2-13.2-24-23.8-5.8-10.5-8.7-23.3-8.7-38.4v-88.6h49.1Z';

const mq = (q) => { try { return matchMedia(q); } catch (err) { return { matches: false, addEventListener() {}, removeEventListener() {} }; } };
const LUGN = mq('(prefers-reduced-motion: reduce)');
const FIN_PEKARE = mq('(hover: hover) and (pointer: fine)');
const GROV_PEKARE = mq('(pointer: coarse)');

// FXAA (klassisk) på de färdiga sRGB-värdena efter OutputPass; alfa från mittpixeln (duken är genomskinlig)
const FXAA_GLSL = `uniform sampler2D tDiffuse; uniform vec2 uPx; varying vec2 vUv;
void main(){
  vec4 m = texture2D(tDiffuse, vUv);
  vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uPx).rgb;
  vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uPx).rgb;
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lNW = dot(nw, L), lNE = dot(ne, L), lSW = dot(sw, L), lSE = dot(se, L), lM = dot(m.rgb, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // låg kontrast (texturer, text på tavlor, tyg) lämnas orörd – bara tydliga kanter jämnas ut
  if (lMax - lMin < max(0.07, lMax * 0.2)) { gl_FragColor = m; return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uPx;
  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lB = dot(b, L);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, m.a);
}`;

/* ---- hjälp på modulnivå ---------------------------------------------------------------------- */
let webglCache = null;
export function webglFinns() {
  if (webglCache !== null) return webglCache;
  if (typeof WebGL2RenderingContext === 'undefined') return (webglCache = false);
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webglCache = !!gl;
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (err) { webglCache = false; }
  return webglCache;
}

const cssLaddade = new Map();
export function laddaCss(href) {
  const url = new URL(href, import.meta.url).href;
  if (cssLaddade.has(url)) return cssLaddade.get(url);
  const finns = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === url);
  const lank = finns || document.createElement('link');
  const klar = new Promise((r) => {
    if (finns && finns.sheet) { r(); return; }
    lank.addEventListener('load', () => r(), { once: true });
    lank.addEventListener('error', () => r(), { once: true });
  });
  if (!finns) { lank.rel = 'stylesheet'; lank.href = url; document.head.appendChild(lank); }
  cssLaddade.set(url, klar);
  return klar;
}

// Typsnitten för canvastexturer (sidan laddar dem via Google Fonts; canvas måste vänta på dem)
const TYPSNITT = ['600 40px Poppins', '500 40px Poppins', '400 40px Poppins', '700 40px Manrope', '600 40px Manrope', '500 40px Manrope'];
let typsnittLofte = null;
const typsnittKlara = () => {
  if (!document.fonts) return true;
  try { return TYPSNITT.every((f) => document.fonts.check(f)); } catch (err) { return true; }
};
const laddaTypsnitt = () => typsnittLofte || (typsnittLofte = document.fonts
  ? Promise.all(TYPSNITT.map((f) => document.fonts.load(f).catch(() => null))).then(() => undefined)
  : Promise.resolve());

// Förutsägbar slump (samma brus varje gång)
function slump(fro = 1) {
  let a = fro >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Mjuka normaler med veckvinkel för icke-indexerad geometri (ExtrudeGeometry ger platta normaler):
   ytor som möts i mindre vinkel än `grader` delar normal → runda kanter och fasningar blir släta, skarpa kanter förblir skarpa. */
function mjukaNormaler(geo, grader = 45) {
  const pos = geo.getAttribute('position');
  if (!pos || geo.index) return geo;
  const n = pos.count; const grans = Math.cos((grader * Math.PI) / 180);
  const yta = new Float32Array(n * 3); // ytnormal (areaviktad) per hörn
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
    for (let j = 0; j < 3; j++) { yta[(i + j) * 3] = ab.x; yta[(i + j) * 3 + 1] = ab.y; yta[(i + j) * 3 + 2] = ab.z; }
  }
  const grupper = new Map();
  const nyckel = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < n; i++) { const k = nyckel(i); let g = grupper.get(k); if (!g) grupper.set(k, (g = [])); g.push(i); }
  const ut = new Float32Array(n * 3); const ni = new THREE.Vector3(), nj = new THREE.Vector3(), sum = new THREE.Vector3();
  for (const g of grupper.values()) {
    for (const i of g) {
      ni.set(yta[i * 3], yta[i * 3 + 1], yta[i * 3 + 2]); const li = ni.length() || 1;
      sum.set(0, 0, 0);
      for (const j of g) {
        nj.set(yta[j * 3], yta[j * 3 + 1], yta[j * 3 + 2]); const lj = nj.length() || 1;
        if (ni.dot(nj) / (li * lj) >= grans) sum.add(nj);
      }
      if (sum.lengthSq() === 0) sum.copy(ni);
      sum.normalize(); ut[i * 3] = sum.x; ut[i * 3 + 1] = sum.y; ut[i * 3 + 2] = sum.z;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(ut, 3));
  return geo;
}

const register = new Set(); // aktiva scener (felsökning: window.UPScen3D)
// Vissa grafikkort (t.ex. Intel via ANGLE/D3D11) ger en helt svart bild när MSAA-målet kombineras med bloom.
// Första bilderna kontrolleras; upptäcks felet stängs MSAA av – för den scenen och för alla senare på sidan.
let msaaTrasig = false;
try { window.UPScen3D = { get scener() { return [...register]; } }; } catch (err) { /* ingen window */ }

/* ---- varaktig: en scen som överlever omritningar --------------------------------------------- */
export function varaktig(bygg, installningar = {}) {
  let s = null;
  return {
    montera(vard) {
      if (s && !s.forstord) { s.flytta(vard); return s; }
      s = skapaScen(vard, installningar);
      if (!s) return null;
      const denna = s;
      denna.vidForstor(() => { if (s === denna) s = null; }); // städad scen hålls inte kvar i minnet
      let svar;
      try { svar = bygg(denna); } catch (err) { denna.forstor(); s = null; throw err; }
      // Bygger scenen i etapper (async bygg): shaders och första bilden väntar tills den är klar (s.byggd)
      if (svar && typeof svar.then === 'function') {
        denna.vantaPa(Promise.resolve(svar).catch((err) => {
          if (!denna.forstord) { console.error('[scen3d] bygget av scenen misslyckades:', err); denna.forstor(); }
          throw err;
        }));
      }
      return denna;
    },
    vila() { if (s && !s.forstord) s.vila(); },
    forstor() { if (s) s.forstor(); s = null; },
    get scen() { return s && !s.forstord ? s : null; },
  };
}

/* ---- skapaScen ----------------------------------------------------------------------------- */
export function skapaScen(vardIn, inst = {}) {
  if (!vardIn || typeof WebGL2RenderingContext === 'undefined') return null;

  // Kontext: helst hårdvara; mjukvaru-WebGL (t.ex. SwiftShader) ger låg kvalitet
  const attr = { alpha: true, antialias: false, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false };
  let canvas = document.createElement('canvas');
  let gl = null; let mjukvara = false;
  try { gl = canvas.getContext('webgl2', { ...attr, failIfMajorPerformanceCaveat: true }); } catch (err) { gl = null; }
  if (!gl) {
    canvas = document.createElement('canvas');
    try { gl = canvas.getContext('webgl2', attr); } catch (err) { gl = null; }
    mjukvara = !!gl;
  }
  if (!gl) { webglCache = false; return null; }
  webglCache = true;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: false, premultipliedAlpha: true, stencil: false, powerPreference: 'high-performance' });
  } catch (err) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }

  // Mjukvaru-WebGL känns också igen på renderarens namn (failIfMajorPerformanceCaveat räcker inte alltid)
  let namn = '';
  if (!mjukvara) {
    try {
      namn = String(gl.getParameter(gl.RENDERER) || '');
      if (/^(WebKit WebGL|Mozilla)$/i.test(namn)) { const info = gl.getExtension('WEBGL_debug_renderer_info'); if (info) namn = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || namn); }
    } catch (err) { namn = ''; }
    if (/SwiftShader|llvmpipe|softpipe|Basic Render|Microsoft Basic/i.test(namn)) mjukvara = true;
  }
  const lugnVidStart = LUGN.matches;
  const tvingad = typeof window.UPScen3DKvalitet === 'string' && /^(hog|mobil|lag)$/.test(window.UPScen3DKvalitet) ? window.UPScen3DKvalitet : null; // test/felsökning
  const kvalitet = tvingad || (mjukvara ? 'lag' : GROV_PEKARE.matches ? 'mobil' : 'hog');
  // Inbyggd grafik (Intel, AMD-APU, Apple, mobil-GPU): samma kvalitetsnivå men lättare tunga delar (realtidsspegel, skuggkarta,
  // skuggor i varje bild) så att full upplösning – skärpan – kan behållas. Test: window.UPScen3DIntegrerad = true/false.
  const integrerad = typeof window.UPScen3DIntegrerad === 'boolean' ? window.UPScen3DIntegrerad
    : /Intel|Iris|UHD Graphics|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+|Mali|Adreno|PowerVR|Apple/i.test(namn);
  const prTak = kvalitet === 'lag' ? 1 : kvalitet === 'mobil' ? 1.25 : 1.75;
  // inst.skarpa: lägsta pixeltäthet på dator (översampling på skärmar med låg täthet – skarpare kanter och publik). Den
  // dynamiska upplösningen nedan sänker ändå (aldrig under 1) om takten inte hålls.
  const prMal = Math.min(Math.max(window.devicePixelRatio || 1, kvalitet === 'hog' ? (inst.skarpa || 0) : 0), prTak);
  let pr = prMal;
  const stadaEfter = inst.stadaEfter ?? window.UPScen3DStada ?? 45000;
  const minIntervall = 1000 / (inst.maxFps || (kvalitet === 'lag' ? 30 : 60));

  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = inst.exponering ?? 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = inst.skuggor !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Skuggorna ritas om i varje bild de första sekunderna (bygget, intron, storleksbyten) och sedan i en lugnare takt
  // (skuggTakt ms, 0 = varje bild) – föremålen rör sig långsamt, och skuggkartan är en av de dyraste delarna.
  renderer.shadowMap.autoUpdate = false;
  const skuggTakt = inst.skuggTakt ?? (integrerad || kvalitet !== 'hog' ? 220 : 0);
  renderer.setPixelRatio(pr);

  canvas.className = 'scen3d-duk' + (inst.klass ? ' ' + inst.klass : '');
  canvas.setAttribute('aria-hidden', 'true');
  const tona = inst.tona !== false && !lugnVidStart;
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;${tona ? 'opacity:0;transition:opacity .9s cubic-bezier(.22,1,.36,1);' : ''}`;

  /* scen, kamera, miljö */
  const scene = new THREE.Scene();
  const k = inst.kamera || {};
  const camera = new THREE.PerspectiveCamera(k.fov ?? 32, 1, k.nara ?? 0.1, k.fjarran ?? 120);
  const kamerastyr = {
    position: new THREE.Vector3(...(k.position || [0, 4.6, 9.5])),
    mal: new THREE.Vector3(...(k.mal || [0, 0.6, 0])),
    parallax: new THREE.Vector2(...(inst.parallax || [0.45, 0.28])),
    andning: inst.andning ?? 0.05,
    av: false,
  };
  camera.position.copy(kamerastyr.position);
  camera.lookAt(kamerastyr.mal);

  const resurser = new Set();
  const stada = (r) => { if (r) resurser.add(r); return r; };

  const pmrem = new THREE.PMREMGenerator(renderer);
  // Egen miljöscen (t.ex. ett mörkt rum med ljuslister) i stället för RoomEnvironment
  const egenMiljo = typeof inst.miljoScen === 'function' ? inst.miljoScen(THREE, FARG) : null;
  const rum = egenMiljo || new RoomEnvironment();
  if (!egenMiljo && inst.miljoToning !== false) {
    const lista = (farg, styrka, pos, skala) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(farg).multiplyScalar(styrka) }));
      m.position.set(...pos); m.scale.set(...skala); rum.add(m);
    };
    lista(FARG.mint, 16, [-14.5, 8, -7], [0.2, 1.1, 10]);   // mint list till vänster bakom
    lista(FARG.is, 12, [13.5, 6, 7], [0.2, 0.9, 9]);        // isblå list till höger framför
    lista(0xffe9cf, 10, [0, 17, -12], [12, 0.5, 0.2]);       // varm takkant bakom
  }
  const miljoRT = pmrem.fromScene(rum, inst.miljoOskarpa ?? 0.035);
  if (egenMiljo) {
    egenMiljo.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => m.dispose()); });
  } else rum.dispose();
  pmrem.dispose();
  stada(miljoRT);
  scene.environment = miljoRT.texture;
  scene.environmentIntensity = inst.miljo ?? 0.65;

  /* ljus */
  let ljus = null;
  const skuggKarta = kvalitet === 'hog' && !integrerad ? 2048 : 1024;
  if (inst.ljus !== false) {
    const himmel = new THREE.HemisphereLight(FARG.is, FARG.ink, 0.35);
    const nyckel = new THREE.DirectionalLight(0xfff3e4, 2.4);
    nyckel.position.set(4, 8, 5);
    nyckel.castShadow = renderer.shadowMap.enabled;
    nyckel.shadow.mapSize.set(skuggKarta, skuggKarta);
    nyckel.shadow.bias = -0.0003;
    nyckel.shadow.normalBias = 0.025;
    const halv = inst.skuggomfang ?? 6;
    Object.assign(nyckel.shadow.camera, { left: -halv, right: halv, top: halv, bottom: -halv, near: 0.5, far: 40 });
    nyckel.shadow.camera.updateProjectionMatrix();
    const fyll = new THREE.DirectionalLight(FARG.is, 0.55);
    fyll.position.set(-6, 3, 2);
    const kant = new THREE.DirectionalLight(FARG.mint, 1.1);
    kant.position.set(-2, 4.5, -7);
    scene.add(himmel, nyckel, nyckel.target, fyll, kant);
    ljus = { himmel, nyckel, fyll, kant };
  }

  /* texturer: brus (roughness), borstad metall, mjuk prick, radiell skugga */
  const anisotropi = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function canvasAv(b, h, rita) { const c = document.createElement('canvas'); c.width = b; c.height = h; rita(c.getContext('2d'), b, h); return c; }
  const brus = stada(new THREE.CanvasTexture(canvasAv(256, 256, (ctx, b, h) => {
    const r = slump(7); const img = ctx.createImageData(b, h); const d = img.data;
    // lågfrekvent fläckighet + finkorn → roughness 0,82–1,0 × materialets värde
    const grov = Array.from({ length: 17 * 17 }, () => r());
    const las = (x, y) => grov[(y % 17) * 17 + (x % 17)];
    for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
      const gx = (x / b) * 16, gy = (y / h) * 16; const ix = Math.floor(gx), iy = Math.floor(gy); const fx = gx - ix, fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (las(ix, iy) * (1 - sx) + las(ix + 1, iy) * sx) * (1 - sy) + (las(ix, iy + 1) * (1 - sx) + las(ix + 1, iy + 1) * sx) * sy;
      const g = Math.round(255 * (0.82 + v * 0.13 + (r() - 0.5) * 0.06));
      const i = (y * b + x) * 4; d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  })));
  brus.wrapS = brus.wrapT = THREE.RepeatWrapping; brus.repeat.set(3, 3); brus.anisotropy = anisotropi;
  const borstad = stada(new THREE.CanvasTexture(canvasAv(256, 256, (ctx, b, h) => {
    const r = slump(11); ctx.fillStyle = 'rgb(225,225,225)'; ctx.fillRect(0, 0, b, h);
    for (let y = 0; y < h; y++) { const g = Math.round(200 + r() * 55); ctx.fillStyle = `rgba(${g},${g},${g},${0.35 + r() * 0.5})`; ctx.fillRect(0, y, b, 1); }
    for (let i = 0; i < 260; i++) { const g = Math.round(185 + r() * 70); ctx.fillStyle = `rgba(${g},${g},${g},.55)`; ctx.fillRect(r() * b, r() * h, 20 + r() * 120, 1); }
  })));
  borstad.wrapS = borstad.wrapT = THREE.RepeatWrapping; borstad.anisotropy = anisotropi;
  const rund = stada(new THREE.CanvasTexture(canvasAv(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.75)'); g.addColorStop(0.6, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  })));
  rund.colorSpace = THREE.SRGBColorSpace;
  const skuggaTex = stada(new THREE.CanvasTexture(canvasAv(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,.55)'); g.addColorStop(0.75, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  })));
  const textur = { brus, borstad, rund, skugga: skuggaTex };

  /* delade material */
  const P = (o) => stada(new THREE.MeshPhysicalMaterial(o));
  const S = (o) => stada(new THREE.MeshStandardMaterial(o));
  const glod = (farg, styrka = 3) => stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(farg).multiplyScalar(styrka), toneMapped: false }));
  const material = {
    bord: P({ color: 0x0f1b27, roughness: 0.34, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.07, roughnessMap: brus }),
    bordLjus: P({ color: 0xe8e3d8, roughness: 0.48, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18, roughnessMap: brus }),
    glas: P({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.4, ior: 1.5, specularIntensity: 1, attenuationColor: new THREE.Color(0xd8f3ea), attenuationDistance: 2.5, envMapIntensity: 1.2 }),
    glasFrost: P({ color: 0xf2fbff, metalness: 0, roughness: 0.32, transmission: 1, thickness: 0.6, ior: 1.45, attenuationColor: new THREE.Color(0xcfe6ff), attenuationDistance: 1.8 }),
    metall: S({ color: 0xd3dae1, metalness: 1, roughness: 0.3, roughnessMap: borstad }),
    krom: S({ color: 0xf2f5f8, metalness: 1, roughness: 0.06 }),
    morkMetall: S({ color: 0x2a3440, metalness: 0.9, roughness: 0.36, roughnessMap: borstad }),
    gjutjarn: S({ color: 0x1b1e22, metalness: 0.55, roughness: 0.84, roughnessMap: brus }),
    plast: P({ color: 0xf1f3f5, roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    plastMork: P({ color: 0x141c26, roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.22 }),
    gummi: S({ color: 0x0f1317, roughness: 0.93, metalness: 0 }),
    papper: S({ color: 0xf4f2ec, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    skarm: P({ color: 0x03070c, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }),
    navy: P({ color: FARG.navy, roughness: 0.45, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.2 }),
    mint: P({ color: FARG.mint, roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    orange: P({ color: FARG.orange, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    glodMint: glod(FARG.mint, 3.2),
    glodIs: glod(FARG.is, 3),
    glodOrange: glod(0xff9a3d, 3.2),
    glodGul: glod(FARG.gul, 3),
    glodRod: glod(FARG.rod, 3),
    glodVit: glod(0xffffff, 2.6),
    holo: stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(FARG.mint).multiplyScalar(1.5), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })),
  };
  const mat = (namn, andringar = {}) => {
    const bas = material[namn];
    if (!bas) throw new Error(`scen3d: okänt material "${namn}"`);
    const m = stada(bas.clone());
    for (const [nyckel, varde] of Object.entries(andringar)) {
      if (m[nyckel] && m[nyckel].isColor && !(varde && varde.isColor)) m[nyckel].set(varde);
      else m[nyckel] = varde;
    }
    if ('envMapIntensity' in andringar) miljo(m, andringar.envMapIntensity); // annars ignorerar three.js styrkan
    return m;
  };
  /* Miljöreflex per material: med bara scene.environment ignorerar three.js materialets envMapIntensity
     (scene.environmentIntensity gäller då). miljo(m, styrka) sätter envMap uttryckligen så att styrkan gäller;
     rotationen följer scene.environmentRotation varje bildruta. */
  const miljoMat = new Set();
  const miljo = (m, styrka) => {
    if (!m || !m.isMeshStandardMaterial || !scene.environment) return m;
    m.envMap = scene.environment;
    if (styrka !== undefined) m.envMapIntensity = styrka;
    m.envMapRotation.copy(scene.environmentRotation);
    miljoMat.add(m);
    return m;
  };
  const synkaMiljo = () => {
    const r = scene.environmentRotation;
    for (const m of miljoMat) if (!m.envMapRotation.equals(r)) m.envMapRotation.copy(r);
  };

  /* efterbehandling: MSAA → bloom (halv upplösning) → ACES + sRGB + alfa */
  const msaa = msaaTrasig ? 0 : (inst.msaa ?? (kvalitet === 'lag' ? 0 : 4));
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: msaa });
  rt.texture.name = 'scen3d.rt';
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let bloom = null;
  if (inst.bloom !== false) {
    const b = inst.bloom || {};
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.styrka ?? 0.6, b.radie ?? 0.55, b.troskel ?? 0.85);
    // Glöden räknas från CSS-storleken (inte enhetspixlar) → halv upplösning internt, billigt på högupplösta skärmar
    const bloomStorlek = bloom.setSize.bind(bloom);
    // Inbyggd grafik: glöden räknas i kvarts upplösning (den är mjuk ändå) – på Intel var glöden den enskilt dyraste delen
    // inst.bloomDel: egen delning (1 = halv upplösning). Med översampling (skarpa) blir kvarts upplösning för grov: tunna ljuslinjer
    // fångas ibland och ibland inte – fyrkantiga glödfläckar som blinkar.
    const bloomDel = inst.bloomDel ?? (integrerad ? 2 : 1);
    bloom.setSize = (w, h) => { const p = (renderer.getPixelRatio() || 1) * bloomDel; bloomStorlek(Math.max(4, Math.round(w / p)), Math.max(4, Math.round(h / p))); };
    // Ogiltiga pixlar (NaN – t.ex. Intel/ANGLE D3D11 med MSAA) får inte nå glöden: oskärpan sprider dem över hela bilden,
    // som då blir svart. max/min tar bort NaN (D3D: ger den giltiga operanden) och tak för extremt starka värden.
    const hp = bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = min( max( texture2D( tDiffuse, vUv ), vec4( 0.0 ) ), vec4( 64.0 ) );');
    // Lägg glöden additivt utan att röra alfa (annars blir den genomskinliga bakgrunden svart)
    Object.assign(bloom.blendMaterial, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    composer.addPass(bloom);
  }
  const utPass = new OutputPass();
  // Alfa = minst ljusstyrkan, så att glöd och additiva effekter syns över genomskinlig bakgrund (giltig förmultiplicerad färg)
  utPass.material.fragmentShader = utPass.material.fragmentShader.replace(/\}\s*$/,
    '\tgl_FragColor.a = clamp( max( gl_FragColor.a, max( gl_FragColor.r, max( gl_FragColor.g, gl_FragColor.b ) ) ), 0.0, 1.0 );\n}\n');
  composer.addPass(utPass);
  // inst.fxaa: kantutjämningen sist i kedjan (se kontraktet); pixelstorleken följer dukens storlek och pixeltäthet
  let fxaa = null;
  if (inst.fxaa) {
    fxaa = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uPx: { value: new THREE.Vector2(1 / 1024, 1 / 1024) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: FXAA_GLSL });
    composer.addPass(fxaa);
  }

  /* tillstånd */
  let vard = vardIn;
  let bredd = 0, hojd = 0;
  let forstord = false, vilar = false, forlorad = false, synlig = true, skymdNu = false, kompilerad = false, harRitat = false;
  let lugn = lugnVidStart;
  let nastaKoll = 0, kollKvar = 3, aterstallningar = 0; // hälsokontrollen av efterbehandlingen (se halsokoll)
  let skuggFull = 0, senastSkugga = 0, langsamma = 0;
  let raf = 0, senast = 0, senastRitad = 0, t = 0, stadTimer = 0, behoverStill = true;
  let ramTider = 0, ramAntal = 0, startadVid = 0, forstaBild = 0, sanktVid = 0, hojVanta = 20000;
  let forlustTimer = 0, tappats = false;
  // Ingen aktivitet (pekare, scroll, tangent) på en stund → 30 bilder/s i stället för 60 (sparar batteri)
  let senastAktivitet = performance.now();
  const vilaEfter = inst.vilaEfter ?? 45000;
  const ramFn = new Set();
  const storlekFn = new Set();
  let klarLos; const klar = new Promise((r) => { klarLos = r; });
  // Bygge i etapper: löften som ska vara klara innan shaders kompileras och första bilden ritas
  const vantan = [];
  let byggdLos; const byggd = new Promise((r) => { byggdLos = r; });
  const vantaPa = (lofte) => { if (lofte && typeof lofte.then === 'function') vantan.push(lofte); return lofte; };

  const mus = { x: 0, y: 0 };
  const musMal = { x: 0, y: 0 };
  const pekare = new THREE.Vector2(0, 0); pekare.over = false;
  const pek = { x: 0, y: 0, ny: false, finns: false };
  const _v = new THREE.Vector3(), _fram = new THREE.Vector3(), _hoger = new THREE.Vector3(), _upp = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();

  function placeraCanvas(nyVard) {
    vard = nyVard;
    try { if (getComputedStyle(vard).position === 'static') vard.style.position = 'relative'; } catch (err) { /* frånkopplad */ }
    if (canvas.parentNode !== vard) vard.appendChild(canvas);
  }

  function anpassa(tvinga = false) {
    nastaKoll = 0; kollKvar = Math.max(kollKvar, 2); // hälsokontroll av första bilderna efter ändringen
    skuggFull = Math.max(skuggFull, performance.now() + 400);
    if (forstord) return false;
    const w = Math.round(vard.clientWidth), h = Math.round(vard.clientHeight);
    if (w < 2 || h < 2) return false;
    if (!tvinga && w === bredd && h === hojd && renderer.getPixelRatio() === pr) return false;
    bredd = w; hojd = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    if (fxaa) fxaa.material.uniforms.uPx.value.set(1 / Math.max(1, Math.round(w * pr)), 1 / Math.max(1, Math.round(h * pr)));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const fn of storlekFn) { try { fn(w, h, s); } catch (err) { console.error('[scen3d] storlek-funktion:', err); } }
    behoverStill = true;
    return true;
  }

  function uppdateraPekare() {
    if (!pek.ny || !pek.finns) return;
    pek.ny = false;
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const nx = ((pek.x - r.left) / r.width) * 2 - 1;
    const ny = ((pek.y - r.top) / r.height) * 2 - 1;
    pekare.set(nx, -ny);
    pekare.over = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    musMal.x = Math.max(-1, Math.min(1, nx));
    musMal.y = Math.max(-1, Math.min(1, ny));
  }

  function uppdateraKamera(tid, dt) {
    uppdateraPekare();
    if (dt > 0) {
      mus.x = THREE.MathUtils.damp(mus.x, musMal.x, 3.2, dt);
      mus.y = THREE.MathUtils.damp(mus.y, musMal.y, 3.2, dt);
    }
    const ks = kamerastyr;
    if (ks.av) return;
    _fram.subVectors(ks.mal, ks.position).normalize();
    _hoger.crossVectors(_fram, camera.up).normalize();
    _upp.crossVectors(_hoger, _fram);
    const ax = (Math.sin(tid * 0.21) + 0.5 * Math.sin(tid * 0.13 + 2)) * ks.andning;
    const ay = Math.sin(tid * 0.29 + 1.3) * ks.andning * 0.6;
    camera.position.copy(ks.position)
      .addScaledVector(_hoger, mus.x * ks.parallax.x + ax)
      .addScaledVector(_upp, -mus.y * ks.parallax.y + ay);
    camera.lookAt(ks.mal);
  }

  function ritaRam(tid, dt) {
    if (forstord || forlorad || bredd < 2 || hojd < 2 || !kompilerad) return false;
    uppdateraKamera(tid, dt);
    for (const fn of ramFn) {
      try { fn(tid, dt, s); } catch (err) { ramFn.delete(fn); console.error('[scen3d] ram-funktionen gav fel och togs bort:', err); }
    }
    if (miljoMat.size) synkaMiljo();
    if (gl.isContextLost()) { forlorad = true; stoppa(); return false; }
    if (renderer.shadowMap.enabled) {
      const nuS = performance.now();
      if (!harRitat || nuS < skuggFull || !skuggTakt || nuS - senastSkugga >= skuggTakt) { renderer.shadowMap.needsUpdate = true; senastSkugga = nuS; }
    }
    try { composer.render(dt); } catch (err) {
      if (gl.isContextLost()) { forlorad = true; stoppa(); return false; }
      throw err;
    }
    halsokoll();
    if (!harRitat) {
      harRitat = true;
      forstaBild = performance.now();
      skuggFull = forstaBild + 4000;
      canvas.setAttribute('data-klar', '');
      try { document.documentElement.setAttribute('data-3d', ''); } catch (err) { /* ingen DOM */ }
      if (tona) canvas.style.opacity = '1';
      klarLos(s);
    }
    return true;
  }

  // Hälsokontroll av efterbehandlingen (se msaaTrasig): ger kompositören svart bild men inte en direkt ritning
  // återskapas målen; händer det igen stängs MSAA av. Körs tätt efter start/flytt/storleksändring och sedan var 3:e sekund.
  // Läser bara en tunn vågrät rand genom bildens mitt (readPixels tvingar grafikkortet att vänta – hela bilden gav ett ryck).
  function ljusIBild() {
    const w = gl.drawingBufferWidth, H = gl.drawingBufferHeight; if (!w || !H) return { tackt: 0, max: 0 };
    const h = Math.min(H, 24), y = Math.max(0, (H >> 1) - 12);
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let tackt = 0, max = 0, sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 7) { n++; if (px[i + 3] > 10) { tackt++; const m = Math.max(px[i], px[i + 1], px[i + 2]); sum += m; if (m > max) max = m; } }
    return { tackt: tackt / (n || 1), max, medel: sum / (n || 1) };
  }
  function halsokoll() {
    const nu = performance.now();
    if (kollKvar <= 0 || nu < nastaKoll) return;
    kollKvar--; nastaKoll = nu + 1500;
    try {
      const komp = ljusIBild();
      if (komp.tackt < 0.01 || komp.medel > 12) return; // inget ritat än, eller en riktig bild
      renderer.setRenderTarget(null); renderer.render(scene, camera);
      const direkt = ljusIBild();
      if (direkt.max <= 30 || direkt.medel < komp.medel * 3 + 4) return; // scenen är faktiskt mörk
      aterstallningar++;
      const avMsaa = aterstallningar >= 2;
      if (avMsaa) msaaTrasig = true;
      for (const m of [composer.renderTarget1, composer.renderTarget2]) { if (avMsaa) m.samples = 0; m.dispose(); }
      console.info(avMsaa ? '[scen3d] svart bild igen – MSAA avstängt för scenerna på sidan' : '[scen3d] svart bild från efterbehandlingen – målen återskapade');
      composer.render(0);
      nastaKoll = nu + 500; kollKvar = Math.max(kollKvar, 2); // kontrollera snart igen att det hjälpte
    } catch (err) { /* kontrollen får aldrig stoppa ritningen */ }
  }

  function ritaStill() {
    if (ritaRam(inst.stillbild ?? 1.6, 0)) behoverStill = false;
  }

  function skymd() {
    const fs = document.fullscreenElement;
    if (fs && !fs.contains(canvas)) return true;
    let modal = null;
    try { modal = document.querySelector('dialog:modal'); } catch (err) { modal = document.querySelector('dialog[open]'); }
    if (!modal) modal = document.querySelector('[aria-modal="true"]:not(dialog)');
    return !!modal && !modal.contains(canvas);
  }

  const kanKora = () => !forstord && !vilar && !forlorad && !lugn && kompilerad && synlig && !skymdNu && !document.hidden && canvas.isConnected && bredd > 1 && hojd > 1;

  function slinga(nu) {
    raf = 0;
    if (!kanKora()) return;
    raf = requestAnimationFrame(slinga);
    const vilsam = nu - senastAktivitet > vilaEfter;
    const intervall = vilsam ? Math.max(minIntervall, 1000 / 30) : minIntervall;
    if (nu - senastRitad < intervall - 2) return;
    const dt = Math.min(0.1, Math.max(0, (nu - senast) / 1000));
    senast = nu;
    // Dynamisk upplösning: håller det inte takten sänks pixeltätheten (aldrig under 1); går det lätt höjs den igen.
    // Mäts först en stund efter första bilden och efter varje start (shaderkompilering och uppstart hackar).
    if (senastRitad && forstaBild && nu - forstaBild > 3000 && nu - startadVid > 1500) {
      ramTider += nu - senastRitad; ramAntal++;
      if (ramTider > 2500) {
        const snitt = ramTider / ramAntal;
        const langsam = snitt > Math.max(28, intervall * 1.6) && pr > 1;
        langsamma = langsam ? langsamma + 1 : 0;
        if (langsam && langsamma >= 2) {
          langsamma = 0;
          pr = Math.max(1, pr - 0.25); anpassa(true);
          if (nu - sanktVid < hojVanta * 2) hojVanta = Math.min(160000, hojVanta * 2); // höjningen höll inte – vänta längre nästa gång
          sanktVid = nu;
        } else if (snitt < intervall * 1.12 && pr < prMal && nu - sanktVid > hojVanta) { pr = Math.min(prMal, pr + 0.25); anpassa(true); sanktVid = nu - hojVanta * 0.75; }
        ramTider = 0; ramAntal = 0;
      }
    } else { ramTider = 0; ramAntal = 0; }
    senastRitad = nu;
    t += dt;
    ritaRam(t, dt);
  }
  function starta() {
    if (raf || !kanKora()) return;
    senast = performance.now(); senastRitad = 0; ramTider = 0; ramAntal = 0; startadVid = senast;
    raf = requestAnimationFrame(slinga);
  }
  function stoppa() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function kontroll() {
    if (forstord) return;
    if (!canvas.isConnected) {
      stoppa();
      if (!stadTimer) stadTimer = setTimeout(forstor, stadaEfter);
      return;
    }
    if (stadTimer && !vilar) { clearTimeout(stadTimer); stadTimer = 0; }
    skymdNu = skymd();
    if (lugn) {
      stoppa();
      if (behoverStill && synlig && !document.hidden) ritaStill();
      return;
    }
    if (kanKora()) starta(); else stoppa();
  }

  /* observatörer och lyssnare */
  const ro = new ResizeObserver(() => {
    if (forstord) return;
    if (anpassa()) {
      // rita direkt så att den nya storleken aldrig visas tom
      if (lugn) ritaStill(); else if (kanKora()) ritaRam(t, 0);
    }
  });
  const io = new IntersectionObserver((poster) => {
    const p = poster[poster.length - 1];
    synlig = p.isIntersecting;
    kontroll();
  }, { rootMargin: '120px' });
  const vidSynlighet = () => kontroll();
  const vidLugn = () => { lugn = LUGN.matches; behoverStill = true; kontroll(); };
  const vidPek = (ev) => {
    if (ev.pointerType && ev.pointerType !== 'mouse' && ev.pointerType !== 'pen') return;
    pek.x = ev.clientX; pek.y = ev.clientY; pek.ny = true; pek.finns = true;
  };
  const vidLamna = () => { musMal.x = 0; musMal.y = 0; pekare.over = false; pek.finns = false; };
  // Förlorad WebGL-kontext: vänta på återställning en stund; kommer den inte städas scenen (vidForstor) och
  // händelsen scen3d-tappad skickas – scener.js monterar då vyn igen (ny kontext) eller låter den falla tillbaka.
  const vidForlorad = (ev) => {
    ev.preventDefault(); forlorad = true; stoppa();
    clearTimeout(forlustTimer);
    forlustTimer = setTimeout(() => {
      if (!forlorad || forstord) return;
      const visades = canvas.isConnected && !vilar ? vard : null; // bara en scen som syns monteras igen
      forstor();
      try { document.dispatchEvent(new CustomEvent('scen3d-tappad', { detail: { canvas, vard: visades } })); } catch (err) { /* ok */ }
    }, inst.aterstallningsfrist ?? 4000);
  };
  const vidAterstalld = () => { clearTimeout(forlustTimer); tappats = true; forlorad = false; behoverStill = true; anpassa(true); kontroll(); };
  const vidAktivitet = () => { senastAktivitet = performance.now(); };
  const AKTIVITET = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'scroll'];
  const anvandMus = FIN_PEKARE.matches;

  document.addEventListener('visibilitychange', vidSynlighet);
  document.addEventListener('fullscreenchange', vidSynlighet);
  LUGN.addEventListener('change', vidLugn);
  if (anvandMus) {
    addEventListener('pointermove', vidPek, { passive: true });
    document.documentElement.addEventListener('mouseleave', vidLamna);
  }
  canvas.addEventListener('webglcontextlost', vidForlorad);
  canvas.addEventListener('webglcontextrestored', vidAterstalld);
  for (const typ of AKTIVITET) addEventListener(typ, vidAktivitet, { passive: true, capture: true });
  const vakt = setInterval(kontroll, 700); // modaler, helskärm och lösgjord canvas har inga pålitliga händelser

  placeraCanvas(vardIn);
  ro.observe(vard);
  io.observe(canvas);
  anpassa(true);

  // Kompilera shaders utan att låsa sidan (efter att byggaren lagt in sina föremål), sedan första bilden
  queueMicrotask(async () => {
    if (forstord) return;
    // async bygg: vänta in alla etapper (sidan ritas och svarar under tiden); misslyckat bygge → ingen kompilering
    while (vantan.length) {
      try { await Promise.all(vantan.splice(0)); } catch (err) { byggdLos(s); return; }
      if (forstord) { byggdLos(s); return; }
    }
    if (integrerad) lattareGlas();
    byggdLos(s);
    try {
      const forra = renderer.getRenderTarget();
      renderer.setRenderTarget(composer.readBuffer); // samma shadervarianter som när scenen ritas i efterbehandlingen
      const lofte = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(forra);
      await lofte;
    } catch (err) { /* kompileras vid första ritningen i stället */ }
    if (forstord) return;
    kompilerad = true;
    behoverStill = true;
    anpassa();
    if (lugn) kontroll();
    else { if (!document.hidden && canvas.isConnected) ritaRam(t, 0); kontroll(); }
  });

  /* publika hjälpare */
  // Inbyggd grafik: glas med "transmission" tvingar three.js att rita hela scenen en extra gång per bild. Där byts det (före
  // kompileringen) mot genomskinligt glas med miljöreflexer – nästan samma utseende, en bråkdel av kostnaden. Scener som lägger
  // till glas senare kan anropa s.lattareGlas(objekt).
  function lattareGlas(rot = scene) {
    if (!integrerad || !rot) return;
    rot.traverse((o) => {
      const lista = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of lista) {
        if (!m || !(m.transmission > 0)) continue;
        const ton = m.attenuationColor && m.color ? m.color.clone().lerp(m.attenuationColor, 0.35) : null;
        m.transmission = 0; m.transparent = true; m.depthWrite = false;
        m.opacity = Math.min(m.opacity ?? 1, 0.18 + (m.roughness || 0) * 0.5);
        if (ton) m.color.copy(ton);
        m.envMapIntensity = Math.max(m.envMapIntensity ?? 1, 1.4);
        m.needsUpdate = true;
      }
    });
  }
  function canvasTextur(b, h, rita) {
    const c = document.createElement('canvas'); c.width = b; c.height = h;
    const ctx = c.getContext('2d');
    const tex = stada(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropi;
    let fn = rita;
    tex.ctx = ctx;
    tex.rita = (nyFn) => {
      if (nyFn) fn = nyFn;
      ctx.save(); ctx.clearRect(0, 0, b, h);
      try { if (fn) fn(ctx, b, h, tex); } finally { ctx.restore(); }
      tex.needsUpdate = true;
      return tex;
    };
    tex.rita();
    if (!typsnittKlara()) laddaTypsnitt().then(() => { if (!forstord) { tex.rita(); if (lugn) ritaStill(); } });
    return tex;
  }

  let uGeo = null; // cache per djup
  function uLogga(djup = 0.12, alt = {}) {
    const S_ = 398; // ringens yttre diameter i SVG-enheter → 1 enhet
    const D = djup * S_;
    const nyckel = `${djup}|${alt.ring !== false}`;
    if (!uGeo || uGeo.nyckel !== nyckel) {
      const bevel = { bevelEnabled: true, bevelThickness: Math.min(D * 0.22, 6), bevelSize: 2.6, bevelOffset: -0.4, bevelSegments: kvalitet === 'hog' ? 5 : 3 };
      const forma = (geo) => { geo.translate(-198, -197.5, -D / 2); geo.rotateX(Math.PI); geo.scale(1 / S_, 1 / S_, 1 / S_); mjukaNormaler(geo, 48); return stada(geo); };
      const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 396 395"><path d="${U_SOKVAG}"/></svg>`);
      const uFormer = data.paths.flatMap((p) => SVGLoader.createShapes(p));
      const u = forma(new THREE.ExtrudeGeometry(uFormer, { depth: D, curveSegments: 18, ...bevel }));
      let ring = null;
      if (alt.ring !== false) {
        const yttre = new THREE.Shape(); yttre.absellipse(198, 197.5, 199, 198.5, 0, Math.PI * 2, false, 0);
        const inre = new THREE.Path(); inre.absellipse(198, 197.5, 177, 176.5, 0, Math.PI * 2, true, 0);
        yttre.holes.push(inre);
        ring = forma(new THREE.ExtrudeGeometry(yttre, { depth: D * 0.8, curveSegments: 72, ...bevel, bevelThickness: Math.min(D * 0.18, 5), bevelSize: 2.2 }));
      }
      uGeo = { nyckel, u, ring };
    }
    const grupp = new THREE.Group();
    grupp.name = 'U-logga';
    const yta = alt.material || material.krom;
    const sida = alt.sidMaterial || yta;
    grupp.u = new THREE.Mesh(uGeo.u, [yta, sida]);
    grupp.add(grupp.u);
    if (uGeo.ring) {
      const rYta = alt.ringMaterial || yta;
      grupp.ring = new THREE.Mesh(uGeo.ring, [rYta, alt.sidMaterial || rYta]);
      grupp.add(grupp.ring);
    }
    return grupp;
  }

  const rundadLada = (b, h, d, radie = 0.05, segment = 5) => stada(new RoundedBoxGeometry(b, h, d, segment, Math.max(0.0001, Math.min(radie, Math.min(b, h, d) / 2 - 0.0001))));

  const skuggor = {
    kasta(obj, ta = true) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (ta) o.receiveShadow = true; } }); return obj; },
    ta(obj) { obj.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }); return obj; },
    fangare(b = 20, d = 20, opacitet = 0.35) {
      const m = new THREE.Mesh(stada(new THREE.PlaneGeometry(b, d)), stada(new THREE.ShadowMaterial({ opacity: opacitet, transparent: true, depthWrite: false })));
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.name = 'skuggfangare';
      return m;
    },
    omfang(halv, fjarran = 40) {
      if (!ljus) return;
      Object.assign(ljus.nyckel.shadow.camera, { left: -halv, right: halv, top: halv, bottom: -halv, far: fjarran });
      ljus.nyckel.shadow.camera.updateProjectionMatrix();
    },
  };

  function kontaktskugga(b = 1, d = 1, opacitet = 0.55) {
    const m = new THREE.Mesh(stada(new THREE.PlaneGeometry(b, d)), stada(new THREE.MeshBasicMaterial({ map: skuggaTex, transparent: true, opacity: opacitet, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.name = 'kontaktskugga';
    return m;
  }

  function halo(farg = FARG.mint, storlek = 1, styrka = 2) {
    const sp = new THREE.Sprite(stada(new THREE.SpriteMaterial({ map: rund, color: new THREE.Color(farg).multiplyScalar(styrka), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    sp.scale.set(storlek, storlek, 1);
    return sp;
  }

  function partiklar(antal = 120, alt = {}) {
    const { centrum = [0, 1.4, 0], omrade = [4, 1.6, 3], farg = FARG.mint, storlek = 0.05, styrka = 2.2, fart = 0.12, opacitet = 0.9 } = alt;
    const n = Math.max(1, kvalitet === 'lag' ? Math.ceil(antal / 2) : antal);
    const r = slump(n * 13 + 5);
    const bas = new Float32Array(n * 3), fas = new Float32Array(n), hast = new Float32Array(n);
    const pos = new Float32Array(n * 3), farger = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      bas[i * 3] = centrum[0] + (r() * 2 - 1) * omrade[0];
      bas[i * 3 + 1] = r() * 2 * omrade[1];
      bas[i * 3 + 2] = centrum[2] + (r() * 2 - 1) * omrade[2];
      fas[i] = r() * Math.PI * 2; hast[i] = 0.55 + r() * 0.9;
    }
    const g = stada(new THREE.BufferGeometry());
    const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const fargAttr = new THREE.BufferAttribute(farger, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', posAttr); g.setAttribute('color', fargAttr);
    const m = stada(new THREE.PointsMaterial({ size: storlek, map: rund, color: new THREE.Color(farg).multiplyScalar(styrka), vertexColors: true, transparent: true, opacity: opacitet, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false }));
    const p = new THREE.Points(g, m);
    p.frustumCulled = false; p.name = 'partiklar';
    const hojdSpann = 2 * omrade[1];
    const uppdatera = (tid) => {
      for (let i = 0; i < n; i++) {
        const y = (bas[i * 3 + 1] + tid * fart * hast[i]) % hojdSpann;
        const f = y / hojdSpann; // 0 nere → 1 uppe: tona in/ut i kanterna
        const kant = Math.min(1, f * 5, (1 - f) * 4);
        pos[i * 3] = bas[i * 3] + Math.sin(tid * 0.4 * hast[i] + fas[i]) * 0.12;
        pos[i * 3 + 1] = centrum[1] - omrade[1] + y;
        pos[i * 3 + 2] = bas[i * 3 + 2] + Math.cos(tid * 0.33 * hast[i] + fas[i]) * 0.1;
        const glimt = kant * (0.55 + 0.45 * Math.sin(tid * 1.7 * hast[i] + fas[i] * 3));
        farger[i * 3] = farger[i * 3 + 1] = farger[i * 3 + 2] = Math.max(0, glimt);
      }
      posAttr.needsUpdate = true; fargAttr.needsUpdate = true;
    };
    uppdatera(inst.stillbild ?? 1.6);
    p.userData.avregistrera = ram((tid) => { if (p.parent) uppdatera(tid); });
    return p;
  }

  function projicera(mal) {
    if (mal && mal.isObject3D) mal.getWorldPosition(_v); else _v.copy(mal);
    camera.updateMatrixWorld();
    _v.project(camera);
    const x = ((_v.x + 1) / 2) * bredd, y = ((1 - _v.y) / 2) * hojd;
    return { x, y, z: _v.z, syns: _v.z > -1 && _v.z < 1 && x >= 0 && x <= bredd && y >= 0 && y <= hojd };
  }

  function traffa(lista, rekursivt = true) {
    if (!pekare.over) return [];
    raycaster.setFromCamera(pekare, camera);
    return raycaster.intersectObjects(Array.isArray(lista) ? lista : [lista], rekursivt);
  }

  function ram(fn) { ramFn.add(fn); return () => ramFn.delete(fn); }
  const forstorFn = new Set();
  function vidForstor(fn) { forstorFn.add(fn); return () => forstorFn.delete(fn); }
  function storlek(fn) { storlekFn.add(fn); if (bredd > 1) { try { fn(bredd, hojd, s); } catch (err) { console.error('[scen3d] storlek-funktion:', err); } } return () => storlekFn.delete(fn); }

  function rita() { if (lugn || !raf) ritaRam(lugn ? (inst.stillbild ?? 1.6) : t, 0); }

  function flytta(nyVard) {
    nastaKoll = 0; // hälsokontroll av första bilden efter ändringen
    if (forstord || !nyVard) return false;
    clearTimeout(stadTimer); stadTimer = 0;
    vilar = false;
    placeraCanvas(nyVard);
    ro.disconnect(); ro.observe(nyVard);
    io.unobserve(canvas); io.observe(canvas);
    synlig = true;
    anpassa(true);
    // första bilden direkt (canvasen har nyss flyttats/ändrat storlek)
    if (lugn) ritaStill(); else if (kompilerad && !document.hidden) ritaRam(t, 0);
    kontroll();
    return true;
  }

  function vila() {
    if (forstord) return;
    vilar = true;
    stoppa();
    canvas.remove();
    clearTimeout(stadTimer);
    stadTimer = setTimeout(forstor, stadaEfter);
  }

  function forstor() {
    if (forstord) return;
    forstord = true;
    stoppa();
    clearTimeout(stadTimer); clearInterval(vakt); clearTimeout(forlustTimer);
    for (const typ of AKTIVITET) removeEventListener(typ, vidAktivitet, { capture: true });
    const kontextBorta = gl.isContextLost();
    ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', vidSynlighet);
    document.removeEventListener('fullscreenchange', vidSynlighet);
    LUGN.removeEventListener('change', vidLugn);
    removeEventListener('pointermove', vidPek);
    document.documentElement.removeEventListener('mouseleave', vidLamna);
    canvas.removeEventListener('webglcontextlost', vidForlorad);
    canvas.removeEventListener('webglcontextrestored', vidAterstalld);
    ramFn.clear(); storlekFn.clear();
    scene.traverse((o) => {
      if (o.geometry) resurser.add(o.geometry);
      const lista = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of lista) {
        resurser.add(m);
        for (const nyckel of Object.keys(m)) { const v = m[nyckel]; if (v && v.isTexture) resurser.add(v); }
        if (m.uniforms) for (const u of Object.values(m.uniforms)) { if (u && u.value && u.value.isTexture) resurser.add(u.value); }
      }
      if (o.isLight && o.shadow && o.shadow.map) resurser.add(o.shadow.map);
    });
    // Efter en förlorad (och återställd) kontext hör resurserna till den gamla kontexten: dispose() skulle bara ge
    // varningar – GPU-minnet släpps ändå när kontexten stängs nedan.
    const disponera = !kontextBorta && !tappats;
    for (const r of resurser) {
      if (disponera) { try { r.dispose(); } catch (err) { /* redan städad */ } }
      // canvasarna bakom texturerna (CanvasTexture, canvasTextur) släpps direkt – annars ligger pixlarna kvar i minnet
      const bild = r && r.isTexture ? r.image : null;
      if (bild && typeof HTMLCanvasElement !== 'undefined' && bild instanceof HTMLCanvasElement) { bild.width = 0; bild.height = 0; r.image = null; }
      if (r && r.isTexture && r.ctx) { r.ctx = null; r.rita = () => r; }
    }
    resurser.clear();
    if (disponera) {
      for (const pass of composer.passes) { try { pass.dispose?.(); } catch (err) { /* ok */ } }
      try { composer.dispose(); } catch (err) { /* ok */ }
    }
    scene.clear();
    scene.environment = null;
    try { renderer.dispose(); } catch (err) { /* ok */ }
    if (!gl.isContextLost()) { try { renderer.forceContextLoss(); } catch (err) { /* ok */ } }
    canvas.remove();
    register.delete(s);
    miljoMat.clear();
    for (const fn of forstorFn) { try { fn(s); } catch (err) { console.error('[scen3d] vidForstor-funktion:', err); } }
    forstorFn.clear();
  }

  const s = {
    THREE, renderer, scene, camera, composer, bloom, canvas, ljus, material, textur, kvalitet, integrerad, lattareGlas, kamerastyr, mus, pekare, klar, byggd, vantaPa,
    get lugn() { return lugn; },
    get forstord() { return forstord; },
    get bredd() { return bredd; },
    get hojd() { return hojd; },
    get tid() { return t; },
    get aktiv() { return !!raf; },
    get vard() { return vard; },
    ram, storlek, rita, flytta, vila, forstor, förstör: forstor, vidForstor,
    projicera, traffa, canvasTextur, uLogga, rundadLada, mat, miljo, glod, skuggor, kontaktskugga, halo, partiklar, stada,
  };
  register.add(s);
  return s;
}
