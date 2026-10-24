/* Uperformance CRM – mötesrummet på #/mote i riktig 3D (three.js via scen3d.js).
   Ett mörkt mötesrum: vägg med lamellpaneler och väggljus, matta och blankt golv, och i mitten ett mötesbord
   i svart marmor med blank lack, fasade kanter och en inlagd mintlist (plus mintljus under kanten).
   På bordet: hologrammet med den extruderade U-loggan över en glasplint (ringar, ljuskägla, partiklar, skanner),
   presentationsbunten (kort med bildnamnen ur UPMote.BILDER – översta kortet lyfts, visas och läggs underst),
   surfplattan med levande "Hälsoprofil", provrörsställ med blodrör, EKG-remsa, stoppur som tickar, fotboll
   (stympad ikosaeder) som roterar, kettlebell i gjutjärn, vattenflaska i glas, kaffe med ånga och skrivplattan
   med offerten (kundens namn och offertvärde räknas fram ur UPCRM när en kund är vald – inget annat är siffror).
   Platserna (HTML-knapparna i [data-ms-platser], motescen.js) projiceras till bordets främre kant; vald kund får
   en strålkastare och en ljuspuck. Kontrakt: scener.js (montera(rum) → { avmontera() }) och scen3d.js.
   Första bygget startar efter att vyn har visats och sker i etapper (await steg() mellan föremålen, s.etapper = ms per
   etapp) – sidan låses aldrig; scen3d ritar första bilden när bygget är klart (s.byggd). Hög kvalitet: bordsskivan
   speglar rummet (4× MSAA, mip-suddad); annars ger ett ljusstråk hologrammets reflex i lacken.
   Egen CSS: scen-mote.css (laddas här, gäller bara när WebGL-scenen är aktiv: .motescen[data-ms-3d]). */
import { varaktig, THREE, FARG, laddaCss, webglFinns, RoundedBoxGeometry } from './scen3d.js?v=5';

const TAU = Math.PI * 2;
const PI = Math.PI;
const U_SOKVAG = 'M177.5,127.8v88.6c0,7.3,1.6,13,4.7,17.3,3.3,4.1,8.4,6.2,15.5,6.2s12.4-2.1,15.8-6.2c3.4-4.3,5.1-10.1,5.1-17.3v-88.6h49.1v88.6c0,14.9-3.1,27.8-9.3,38.4-6.2,10.5-14.7,18.4-25.5,23.8-10.8,5.3-22.9,8-36.2,8s-25.2-2.7-35.5-8c-10.2-5.3-18.2-13.2-24-23.8-5.8-10.5-8.7-23.3-8.7-38.4v-88.6h49.1Z';
const U_RING = 'M198,10c103.9,0,188,84,188,187.5s-84.1,187.5-188,187.5S10,301,10,197.5,94.1,10,198,10Z';

// Bordet: superellips |x/a|^n + |z/b|^n = 1, skivans ovansida i y = 0, golvet i y = GOLV (1 enhet ≈ 1/3 m)
const BORD = { a: 3.55, b: 1.72, n: 4, tjocklek: 0.15 };
const GOLV = -2.25;

/* ---- små hjälpare --------------------------------------------------------------------------- */
const klamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mjuk = (a, b, v) => { const x = klamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const inut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);
const v2 = (x, y) => new THREE.Vector2(x, y);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
function slump(fro = 1) {
  let a = fro >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- canvas ---------------------------------------------------------------------------------- */
let uVag = null, ringVag = null;
function ritaU(ctx, cx, cy, d, farg, ring = true) {
  if (!uVag) { uVag = new Path2D(U_SOKVAG); ringVag = new Path2D(U_RING); }
  ctx.save();
  ctx.translate(cx - d / 2, cy - d / 2); ctx.scale(d / 396, d / 396);
  ctx.fillStyle = farg; ctx.fill(uVag);
  if (ring) { ctx.lineWidth = 22; ctx.strokeStyle = farg; ctx.stroke(ringVag); }
  ctx.restore();
}
function radbryt(ctx, text, x, y, maxB, radH, maxRader = 3) {
  const ord = String(text || '').split(/\s+/).filter(Boolean); let rad = ''; let n = 0;
  for (let i = 0; i < ord.length; i++) {
    const prov = rad ? rad + ' ' + ord[i] : ord[i];
    if (ctx.measureText(prov).width > maxB && rad) {
      if (n === maxRader - 1) { rad += '…'; break; }
      ctx.fillText(rad, x, y + n * radH); n++; rad = ord[i];
    } else rad = prov;
  }
  if (rad) { ctx.fillText(rad, x, y + n * radH); n++; }
  return y + n * radH;
}
// EKG-kurva (P, QRS, T) för fas 0–1 → ungefär −0,3…1
function ekg(f) {
  f -= Math.floor(f);
  const bump = (c, w, h) => h * Math.exp(-(((f - c) / w) ** 2));
  return bump(0.16, 0.03, 0.12) + bump(0.3, 0.008, -0.16) + bump(0.325, 0.009, 1) + bump(0.35, 0.01, -0.3) + bump(0.58, 0.05, 0.26);
}

/* ---- konturer (superellipser) → kanter, lock och band med analytiska normaler ------------------ */
function superKontur(a, b, n, antal) {
  const M = 2400; const fina = [];
  for (let i = 0; i <= M; i++) {
    const th = (i / M) * TAU; const c = Math.cos(th), s = Math.sin(th);
    fina.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  const lang = [0];
  for (let i = 1; i <= M; i++) lang.push(lang[i - 1] + Math.hypot(fina[i][0] - fina[i - 1][0], fina[i][1] - fina[i - 1][1]));
  const tot = lang[M]; const ut = []; let j = 0;
  for (let k = 0; k < antal; k++) {
    const mal = (k / antal) * tot;
    while (j < M - 1 && lang[j + 1] < mal) j++;
    const f = (mal - lang[j]) / ((lang[j + 1] - lang[j]) || 1);
    ut.push(v2(fina[j][0] + (fina[j + 1][0] - fina[j][0]) * f, fina[j][1] + (fina[j + 1][1] - fina[j][1]) * f));
  }
  return ut;
}
function konturNormaler(k) {
  const N = k.length;
  const n = k.map((p, i) => { const a = k[(i - 1 + N) % N], b = k[(i + 1) % N]; const dx = b.x - a.x, dz = b.y - a.y; const l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; });
  let s = 0; for (let i = 0; i < N; i++) s += n[i][0] * k[i].x + n[i][1] * k[i].y;
  if (s < 0) for (const x of n) { x[0] = -x[0]; x[1] = -x[1]; }
  return n;
}
// Band runt konturen: profil = [[utåt, y, nUtåt, nY], …]
function ringGeo(k, nrm, profil, uv) {
  const N = k.length, P = profil.length;
  const pos = new Float32Array(N * P * 3), nor = new Float32Array(N * P * 3), uvs = new Float32Array(N * P * 2);
  for (let i = 0; i < N; i++) {
    const [nx, nz] = nrm[i];
    for (let j = 0; j < P; j++) {
      const [o, y, nu, ny] = profil[j]; const q = i * P + j;
      const x = k[i].x + nx * o, z = k[i].y + nz * o;
      pos[q * 3] = x; pos[q * 3 + 1] = y; pos[q * 3 + 2] = z;
      const l = Math.hypot(nu, ny) || 1;
      nor[q * 3] = (nx * nu) / l; nor[q * 3 + 1] = ny / l; nor[q * 3 + 2] = (nz * nu) / l;
      const [u, v] = uv ? uv(x, y, z) : [i / N, j / Math.max(1, P - 1)];
      uvs[q * 2] = u; uvs[q * 2 + 1] = v;
    }
  }
  // vänd trianglarna om de pekar inåt
  const a0 = v3(pos[0], pos[1], pos[2]), b0 = v3(pos[P * 3], pos[P * 3 + 1], pos[P * 3 + 2]), d0 = v3(pos[3], pos[4], pos[5]);
  const kors = new THREE.Vector3().subVectors(b0, a0).cross(new THREE.Vector3().subVectors(d0, a0));
  const vand = kors.dot(v3(nor[0], nor[1], nor[2])) < 0;
  const idx = [];
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j, b = i2 * P + j, c = i2 * P + j + 1, d = i * P + j + 1;
      if (vand) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}
function lockGeo(k, y, upp, uv) {
  const tri = THREE.ShapeUtils.triangulateShape(k, []);
  const pos = new Float32Array(k.length * 3), nor = new Float32Array(k.length * 3), uvs = new Float32Array(k.length * 2);
  k.forEach((p, i) => {
    pos[i * 3] = p.x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = p.y; nor[i * 3 + 1] = upp ? 1 : -1;
    const [u, v] = uv ? uv(p.x, y, p.y) : [0, 0]; uvs[i * 2] = u; uvs[i * 2 + 1] = v;
  });
  const idx = [];
  for (const [a, b, c] of tri) {
    const ab = v3(k[b].x - k[a].x, 0, k[b].y - k[a].y), ac = v3(k[c].x - k[a].x, 0, k[c].y - k[a].y);
    const ny = ab.cross(ac).y;
    if ((ny > 0) === upp) idx.push(a, b, c); else idx.push(a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}
const forskjut = (k, nrm, d) => k.map((p, i) => v2(p.x + nrm[i][0] * d, p.y + nrm[i][1] * d));
const bage = (r, cx, cy, fran, till, steg) => Array.from({ length: steg + 1 }, (_, i) => { const f = lerp(fran, till, i / steg); return [cx + r * Math.sin(f), cy + r * Math.cos(f), Math.sin(f), Math.cos(f)]; });
const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([x, y]) => v2(Math.max(0, x), y)), seg);
// Slår ihop delar [geometri, matris] till en geometri (position, normal, uv, index) – färre ritanrop
function slaIhop(delar) {
  const pos = [], nor = [], uvs = [], idx = []; let bas = 0;
  const nm = new THREE.Matrix3(); const v = new THREE.Vector3();
  for (const [g, m] of delar) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('uv');
    nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      uvs.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + bas);
    else for (let i = 0; i < p.count; i++) idx.push(i + bas);
    bas += p.count;
    g.dispose();
  }
  const ut = new THREE.BufferGeometry();
  ut.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ut.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  ut.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ut.setIndex(idx);
  return ut;
}

/* ---- shaders: hologramyta och ljuskägla --------------------------------------------------------- */
function holoMaterial(farg, styrka = 1.5) {
  return new THREE.ShaderMaterial({
    uniforms: { tid: { value: 1.6 }, farg: { value: new THREE.Color(farg) }, styrka: { value: styrka } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; vec4 mv = viewMatrix * w; vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float tid; uniform vec3 farg; uniform float styrka; varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        f = pow(f, 1.5);
        float linjer = 0.62 + 0.38 * sin(vY * 150.0 - tid * 5.0);
        float svep = smoothstep(0.1, 0.0, abs(fract(vY * 0.55 - tid * 0.32) - 0.5) - 0.38);
        float flimmer = 0.93 + 0.07 * sin(tid * 31.0) * sin(tid * 7.3);
        vec3 c = farg * styrka * (0.34 + 1.45 * f + 0.8 * svep) * linjer * flimmer;
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
function kagleMaterial(farg, styrka = 1, linjer = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { tid: { value: 1.6 }, farg: { value: new THREE.Color(farg) }, styrka: { value: styrka }, linjer: { value: linjer } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float tid; uniform vec3 farg; uniform float styrka; uniform float linjer; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float h = vUv.y;
        float tona = smoothstep(0.0, 0.06, h) * pow(1.0 - h, 1.6);
        float kant = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float band = mix(1.0, 0.72 + 0.28 * sin(h * 46.0 - tid * 3.2), linjer);
        float strimmor = mix(1.0, 0.8 + 0.2 * sin(vUv.x * 188.5 + tid * 0.7), linjer);
        vec3 c = farg * styrka * tona * band * strimmor * (0.18 + 0.82 * pow(kant, 1.4));
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

/* ---- miljön: ett mörkt mötesrum med ljuslister (det som speglas i lack, krom och glas) ---------------
   Ersätter motorns ljusa RoomEnvironment: mörka väggar, armaturens ljuslist rakt ovanför bordet, tre varma
   väggljus bakom bordet, en mint- och en isblå list på sidorna och en svag ljusyta bakom kameran. */
function morktRum(THREE, F) {
  const rum = new THREE.Scene();
  const lada = new THREE.BoxGeometry(1, 1, 1);
  const yta = (farg, styrka, pos, skala, sida = THREE.FrontSide) => {
    const m = new THREE.Mesh(lada, new THREE.MeshBasicMaterial({ color: new THREE.Color(farg).multiplyScalar(styrka), side: sida }));
    m.position.set(...pos); m.scale.set(...skala); rum.add(m); return m;
  };
  yta(0x0b1017, 1, [0, 3.4, 0], [30, 13, 24], THREE.BackSide);       // väggar och tak
  yta(0x06080b, 1, [0, -2.85, 0], [29.8, 0.1, 23.8]);                  // golvet
  yta(0x15110d, 1, [0, 3, -11.85], [29.8, 11, 0.1]);                   // bakväggen (varm ek i mörker)
  for (const x of [-7.4, -1.4, 4.6]) {                                 // väggljusen bakom bordet
    yta(0xffc68f, 0.55, [x, 3.2, -11.7], [2.6, 5.2, 0.1]);
    yta(0xffd2a0, 1.6, [x, 5.4, -11.65], [1.5, 1.6, 0.1]);
    yta(0xfff0dc, 9, [x, 6.6, -11.6], [0.5, 0.18, 0.1]);
  }
  yta(0xfff1de, 10, [0.25, 7.2, -0.2], [4.6, 0.06, 0.34]);               // armaturens ljuslist ovanför bordet
  yta(F.mint, 7, [0.25, 7.15, 0.1], [4.6, 0.04, 0.04]);
  yta(F.mint, 3.2, [-14.8, 3.2, -2], [0.1, 0.5, 10]);                  // mintlist till vänster
  yta(F.is, 2.6, [14.8, 3.6, 3], [0.1, 0.5, 9]);                       // isblå list till höger
  yta(0xdfe8f2, 0.5, [0, 3.2, 11.85], [12, 3.6, 0.1]);                 // svag ljusyta bakom kameran
  yta(0x9fb6cc, 0.16, [0, 9.8, 0], [18, 0.1, 14]);                     // takets svaga ljus
  return rum;
}

/* ---- motorn: en scen som överlever omritningar av vyn ------------------------------------------ */
// Bygget sker i etapper: mellan föremålen lämnas tråden tillbaka (scheduler.yield / setTimeout) så att sidan
// ritas och svarar under tiden. scen3d väntar in bygget innan shaders kompileras och första bilden ritas.
const AVBRUTEN = new Error('scen-mote: bygget avbröts (scenen städades)');
const paus = () => new Promise((klar) => {
  const sch = globalThis.scheduler;
  if (sch && typeof sch.yield === 'function') sch.yield().then(klar, klar); else setTimeout(klar, 0);
});
const motor = varaktig(bygg, {
  kamera: { fov: 24, position: [0.3, 3.6, 9.4], mal: [0.3, 0.35, 0.1], nara: 0.1, fjarran: 80 },
  parallax: [0.42, 0.24],
  andning: 0.05,
  exponering: 1.16,
  miljo: 0.9,
  miljoScen: morktRum,
  miljoOskarpa: 0.025,
  // glöden i halv upplösning även på inbyggd grafik: i kvarts upplösning blev små ljusa reflexer fyrkantiga fläckar
  bloom: { styrka: 0.3, radie: 0.24, troskel: 1.25 }, bloomDel: 1,
  // kantutjämning: MSAA i halvflyttal var det dyraste på inbyggd grafik (var tredje bild blev lång) – FXAA på dator, MSAA på mobil
  msaa: matchMedia('(pointer: coarse)').matches ? 4 : 0, fxaa: true,
  skuggomfang: 6.5,
  // skuggan är statisk efter de första sekunderna: det som rör sig (hologrammet, ringarna, skannern) är glöd och kastar ingen
  // skugga – med en ny skuggkarta var 220:e ms på inbyggd grafik blev var trettonde bild lång (hack i mötesrummet)
  skuggTakt: 1e9,
  klass: 'ms-duk',
});

async function bygg(s) {
  const { scene } = s;
  // s.etapper: ms per etapp (felsökning – visar att ingen etapp låser sidan länge)
  s.etapper = []; let etappStart = performance.now();
  const steg = async () => { s.etapper.push(Math.round(performance.now() - etappStart)); await paus(); if (s.forstord) throw AVBRUTEN; etappStart = performance.now(); };
  const hog = s.kvalitet === 'hog';
  // Realtidsspegeln i bordsskivan (rummet ritas två gånger per bild) bara på kraftfull grafik – annars det mjuka ljusstråket
  const spegel = hog && !s.integrerad;
  const ani = Math.min(8, s.renderer.capabilities.getMaxAnisotropy());
  const ramar = []; // (t, dt) → void, körs i en enda s.ram
  const ram = (fn) => ramar.push(fn);

  function tex(b, h, rita, { srgb = true, upprepa = false } = {}) {
    const c = document.createElement('canvas'); c.width = b; c.height = h;
    rita(c.getContext('2d'), b, h);
    const t = s.stada(new THREE.CanvasTexture(c));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ani;
    if (upprepa) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const geo = (g) => s.stada(g);
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo(g), m); o.position.set(x, y, z); return o; };
  const fys = (o) => s.stada(new THREE.MeshPhysicalMaterial(o));
  const std = (o) => s.stada(new THREE.MeshStandardMaterial(o));
  const additiv = (farg, styrka = 1, map = s.textur.rund, opacitet = 1) => s.stada(new THREE.MeshBasicMaterial({ map, color: new THREE.Color(farg).multiplyScalar(styrka), transparent: true, opacity: opacitet, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const kontakt = (b, d, op, x, z, rot = 0, y = 0.0015) => { const k = s.kontaktskugga(b, d, op); k.position.set(x, y, z); k.rotation.z = rot; k.userData.ingenSkugga = true; k.userData.ejSpegel = true; return k; };
  // Miljöreflexens styrka per material (three.js ignorerar annars envMapIntensity när scene.environment används)
  const miljo = (m, styrka) => { if (s.miljo) return s.miljo(m, styrka); m.envMap = scene.environment; m.envMapIntensity = styrka; return m; };
  miljo(s.material.krom, 1); miljo(s.material.metall, 0.9); miljo(s.material.morkMetall, 0.7);

  /* ---- ljus ---------------------------------------------------------------------------------- */
  const L = s.ljus;
  L.himmel.intensity = 0.28; L.himmel.color.set(0x9cc2e6); L.himmel.groundColor.set(0x04070b);
  L.nyckel.color.set(0xfff0dc); L.nyckel.intensity = 2.2; L.nyckel.position.set(1.6, 10, 2.2); // takljus snett framifrån
  L.nyckel.shadow.radius = 4; L.nyckel.shadow.bias = -0.00025;
  L.fyll.color.set(0xa7d2ff); L.fyll.intensity = 0.36; L.fyll.position.set(-5, 4, 7);
  L.kant.color.set(0xb4e8f0); L.kant.intensity = 1.7; L.kant.position.set(-2, 1.1, -9); // lågt bakifrån: kantljus utan spegling i bordet
  s.skuggor.omfang(6.4, 32);
  // armaturen ovanför bordet lägger en mjuk ljuspöl på skivan
  const takLjus = new THREE.SpotLight(0xfff1e0, 11, 0, 0.72, 0.95, 2);
  takLjus.position.set(0.25, 2.2, -0.2); takLjus.target.position.set(0.25, 0, 0.05); scene.add(takLjus, takLjus.target);

  /* ---- rummet: golv, matta, vägg med lameller och väggljus ----------------------------------- */
  const rum = new THREE.Group(); rum.name = 'rum'; scene.add(rum);
  const golvTex = tex(512, 512, (ctx, b, h) => {
    const g = ctx.createRadialGradient(b / 2, h * 0.52, 0, b / 2, h * 0.52, b * 0.5);
    g.addColorStop(0, '#152230'); g.addColorStop(0.3, '#0e1822'); g.addColorStop(0.62, '#080e15'); g.addColorStop(1, '#030508');
    ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
  });
  const golv = mesh(new THREE.PlaneGeometry(64, 34), fys({ map: golvTex, roughness: 0.55, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.4, roughnessMap: s.textur.brus }), 0, GOLV, 2);
  golv.rotation.x = -PI / 2; golv.receiveShadow = true; golv.userData.ingenSkugga = true;
  rum.add(golv);
  // matta under bordet med en tunn mintkant
  const mattaK = superKontur(5.0, 3.05, 3.4, hog ? 180 : 120); const mattaN = konturNormaler(mattaK);
  // luggen: fina fibrer i två toner (färg) + bruset i roughness – mattan får struktur i ljuset
  const luggTex = tex(512, 512, (ctx, b, h) => {
    const r = slump(23); ctx.fillStyle = '#0d1218'; ctx.fillRect(0, 0, b, h);
    for (let i = 0; i < 9000; i++) {
      const x = r() * b, y = r() * h, l = 2 + r() * 5, v = r();
      ctx.strokeStyle = v < 0.5 ? `rgba(40,52,64,${0.25 + r() * 0.35})` : `rgba(3,5,8,${0.3 + r() * 0.4})`;
      ctx.lineWidth = 0.8 + r() * 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * l, y + (r() - 0.5) * l); ctx.stroke();
    }
  }, { upprepa: true });
  luggTex.repeat.set(1.4, 1.4);
  const mattaMat = miljo(std({ color: 0xffffff, map: luggTex, roughness: 1, metalness: 0, roughnessMap: s.textur.brus }), 0.25);
  const matta = new THREE.Group();
  const mattaUv = (x, y, z) => [x * 0.4, z * 0.4];
  matta.add(new THREE.Mesh(geo(lockGeo(forskjut(mattaK, mattaN, -0.02), GOLV + 0.022, true, mattaUv)), mattaMat));
  matta.add(new THREE.Mesh(geo(ringGeo(mattaK, mattaN, [[-0.02, GOLV + 0.022, 0.4, 1], [0, GOLV + 0.016, 1, 0.3], [0, GOLV + 0.001, 1, 0]], mattaUv)), mattaMat));
  matta.add(new THREE.Mesh(geo(ringGeo(mattaK, mattaN, [[-0.16, GOLV + 0.0235, 0, 1], [-0.19, GOLV + 0.0235, 0, 1]])), s.glod(FARG.mint, 0.5)));
  matta.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.ingenSkugga = true; } });
  rum.add(matta);

  // väggen: mörk bakgrund + vertikala lameller (instanser) med väggljus, svagt mintsken vid golvet
  const VAGG_Z = -6.1;
  const bak = mesh(new THREE.PlaneGeometry(64, 16), std({ color: 0x05080c, roughness: 1 }), 0, GOLV + 8, VAGG_Z - 0.08);
  bak.userData.ingenSkugga = true; rum.add(bak);
  const lamellAntal = hog ? 130 : 76; const lamellSteg = hog ? 0.24 : 0.4;
  const lamellGeo = s.rundadLada(lamellSteg * 0.72, 8.4, 0.13, 0.055, 2);
  const lamellMat = std({ color: 0x2c2522, roughness: 0.6, metalness: 0, roughnessMap: s.textur.brus });
  // Väggljus som bågar ("scallops") från dolda armaturer i taket – räknas i världskoordinater i shadern (inga extra ljus)
  const VAGGLJUS_X = [-7.4, -1.4, 4.6];
  lamellMat.onBeforeCompile = (sh) => {
    sh.uniforms.skenFarg = { value: new THREE.Color(0xffc68f).multiplyScalar(0.34) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVarld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 vp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\n vp = instanceMatrix * vp;\n#endif\n vVarld = ( modelMatrix * vp ).xyz; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVarld;\nuniform vec3 skenFarg;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float sken = 0.0;
        ${VAGGLJUS_X.map((x) => `{ float dx = vVarld.x - (${x.toFixed(2)});
          float kant = 1.45 - 0.42 * dx * dx;
          float ned = kant - vVarld.y;
          float inne = smoothstep( 0.0, 0.28, ned );
          float bredd = 0.55 + max( ned, 0.0 ) * 0.33;
          sken += inne * exp( -max( ned, 0.0 ) * 0.42 ) * exp( -( dx * dx ) / ( bredd * bredd ) ) * ( 1.0 + 1.6 * exp( -max( ned, 0.0 ) * 3.5 ) ); }`).join('\n')}
        totalEmissiveRadiance += skenFarg * sken * ( 0.45 + 0.55 * clamp( normal.z, 0.0, 1.0 ) );
      }`);
  };
  lamellMat.customProgramCacheKey = () => 'lamellsken';
  const lameller = new THREE.InstancedMesh(lamellGeo, lamellMat, lamellAntal);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < lamellAntal; i++) { mtx.makeTranslation((i - lamellAntal / 2) * lamellSteg, GOLV + 4.2, VAGG_Z); lameller.setMatrixAt(i, mtx); }
  lameller.instanceMatrix.needsUpdate = true; lameller.receiveShadow = true; lameller.userData.ingenSkugga = true;
  rum.add(lameller);
  const sockelSken = mesh(new THREE.PlaneGeometry(40, 3.2), additiv(FARG.mint, 0.07), 0, GOLV + 0.006, VAGG_Z + 1.2);
  sockelSken.rotation.x = -PI / 2; rum.add(sockelSken);
  // ljuset som faller ner på golvet vid väggen
  for (const x of VAGGLJUS_X) { const p = mesh(new THREE.PlaneGeometry(3.2, 2.2), additiv(0xffc68f, 0.12), x, GOLV + 0.008, VAGG_Z + 0.9); p.rotation.x = -PI / 2; rum.add(p); }

  // Armaturen: en svart linjär pendel ovanför bordet med varm ljuslist undertill och en tunn mintlinje längs sidan
  const armatur = new THREE.Group(); armatur.name = 'armatur'; armatur.position.set(0.25, 2.32, -0.2); scene.add(armatur);
  {
    const profil = miljo(s.mat('morkMetall', { color: 0x10151b, roughness: 0.34 }), 0.8);
    const LA = 4.6; // armaturens längd
    const kroppA = new THREE.Mesh(s.rundadLada(LA, 0.1, 0.22, 0.03, 3), profil); armatur.add(kroppA);
    const diffusor = mesh(new THREE.BoxGeometry(LA - 0.14, 0.014, 0.12), s.glod(0xfff1de, 1.8), 0, -0.048, 0); armatur.add(diffusor);
    const mintLinje = mesh(new THREE.BoxGeometry(LA - 0.1, 0.012, 0.006), s.glod(FARG.mint, 2.6), 0, -0.02, 0.112); armatur.add(mintLinje);
    // gavlar i borstad aluminium och en skuggfog ovanpå profilen
    const gavelMat = miljo(s.mat('metall', { color: 0xb9c3cc, roughness: 0.26 }), 1);
    for (const sx of [-1, 1]) armatur.add(new THREE.Mesh(s.rundadLada(0.035, 0.108, 0.226, 0.012, 2), gavelMat).translateX(sx * (LA / 2 + 0.012)));
    armatur.add(mesh(new THREE.BoxGeometry(LA - 0.2, 0.006, 0.14), s.mat('morkMetall', { color: 0x06090c, roughness: 0.6 }), 0, 0.053, 0));
    for (const x of [-LA / 2 + 0.35, LA / 2 - 0.35]) {
      const vajer = mesh(new THREE.CylinderGeometry(0.004, 0.004, 6, 6), s.material.krom, x, 3.05, 0); armatur.add(vajer);
      armatur.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 16), s.material.krom, x, 0.075, 0));
    }
    armatur.traverse((o) => { if (o.isMesh) o.userData.ingenSkugga = true; });
  }

  await steg();

  /* ---- bordet ------------------------------------------------------------------------------ */
  const bord = new THREE.Group(); bord.name = 'bord'; scene.add(bord);
  const kontur = superKontur(BORD.a, BORD.b, BORD.n, hog ? 300 : 200); const knrm = konturNormaler(kontur);
  const uvBord = (x, y, z) => [x / (2 * BORD.a) + 0.5, z / (2 * BORD.b) + 0.5 + y * 0.18];
  const marmor = tex(1024, 512, ritaMarmor, { upprepa: true });
  await steg();
  // Svart marmor under blank lack: mörk karta (ådrorna syns svagt), låg miljöreflex så att skivan inte gråar
  const bordMat = miljo(fys({ map: marmor, color: 0xaab3bb, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, roughnessMap: s.textur.brus, specularIntensity: 0.55 }), 0.2);
  const rTopp = 0.05, rBotten = 0.03, T = BORD.tjocklek;
  const profil = [...bage(rTopp, -rTopp, -rTopp, 0, PI / 2, hog ? 8 : 5), [0, -T + rBotten, 1, 0], ...bage(rBotten, -rBotten, -T + rBotten, PI / 2, PI, hog ? 5 : 3)];
  // Skivans ovansida: hög kvalitet speglar rummet på riktigt (spegla()); annars ger det mörka rummets ljuslister
  // djupet (starkare miljöreflex i lacken).
  const toppMat = miljo(s.stada(bordMat.clone()), spegel ? 0.16 : 0.5);
  const topp = new THREE.Mesh(geo(lockGeo(forskjut(kontur, knrm, -rTopp), 0, true, uvBord)), toppMat);
  const skiva = [
    new THREE.Mesh(geo(ringGeo(kontur, knrm, profil, uvBord)), bordMat),
    topp,
    new THREE.Mesh(geo(lockGeo(forskjut(kontur, knrm, -rBotten), -T, false, uvBord)), bordMat),
  ];
  for (const m of skiva) { m.castShadow = true; m.receiveShadow = true; bord.add(m); }
  // inlagd mintlist i skivan (som en löparbana) + mintljus under kanten
  const lista = new THREE.Mesh(geo(ringGeo(kontur, knrm, [[-0.15, 0.0009, 0, 1], [-0.166, 0.0009, 0, 1]])), s.glod(FARG.mint, 1.5));
  lista.userData.ingenSkugga = true; lista.userData.ejSpegel = true; bord.add(lista);
  const sargMat = s.mat('morkMetall', { color: 0x1a222b, roughness: 0.42 });
  const sargK = forskjut(kontur, knrm, -0.3);
  bord.add(new THREE.Mesh(geo(ringGeo(sargK, knrm, [[0, -T, 1, 0], [0, -T - 0.16, 1, 0]])), sargMat));
  bord.add(new THREE.Mesh(geo(lockGeo(sargK, -T - 0.16, false)), sargMat));
  const led = new THREE.Mesh(geo(ringGeo(sargK, knrm, [[0.004, -T - 0.012, 1, 0], [0.004, -T - 0.034, 1, 0]])), s.glod(FARG.mint, 3.2));
  led.userData.ingenSkugga = true; bord.add(led);
  // fot: en mörk monolit
  const fotK = superKontur(1.5, 0.52, 3, 120); const fotN = konturNormaler(fotK);
  bord.add(new THREE.Mesh(geo(ringGeo(fotK, fotN, [[0, -T - 0.16, 1, 0], [0, GOLV + 0.06, 1, 0], [0.06, GOLV + 0.04, 1, 0.4], [0.06, GOLV, 1, 0]])), s.mat('morkMetall', { color: 0x141b23, roughness: 0.5 })));
  // ljuset från ledlisten på golvet + kontaktskugga under foten
  const ledSken = mesh(new THREE.PlaneGeometry(2 * BORD.a + 1.6, 2 * BORD.b + 1.6), additiv(FARG.mint, 0.09), 0, GOLV + 0.03, 0);
  ledSken.rotation.x = -PI / 2; rum.add(ledSken);
  rum.add(kontakt(4.6, 2.2, 0.85, 0, 0, 0, GOLV + 0.03));

  await steg();

  /* ---- hologrammet i mitten ----------------------------------------------------------------- */
  const holo = new THREE.Group(); holo.name = 'hologram'; holo.position.set(0, 0, -0.18); scene.add(holo);
  {
    holo.add(new THREE.Mesh(geo(lathe([[0, 0], [0.6, 0], [0.632, 0.008], [0.648, 0.03], [0.645, 0.058], [0.628, 0.074], [0.6, 0.082], [0.548, 0.082], [0.545, 0.09], [0, 0.09]], 96)), s.mat('morkMetall', { color: 0x222c37, roughness: 0.32 })));
    const fotList = new THREE.Mesh(geo(new THREE.TorusGeometry(0.63, 0.0055, 8, 160)), s.glod(FARG.mint, 2.6));
    fotList.rotation.x = PI / 2; fotList.position.y = 0.058; holo.add(fotList);
    const glas = mesh(new THREE.CylinderGeometry(0.53, 0.54, 0.075, 96), miljo(s.mat('glas', { attenuationColor: 0x9ff0d8, attenuationDistance: 0.9, thickness: 0.08, roughness: 0.04 }), 1.3), 0, 0.128, 0);
    glas.userData.ingenSkugga = true; holo.add(glas);
    const inre = new THREE.Mesh(geo(new THREE.TorusGeometry(0.46, 0.011, 10, 128)), s.glod(FARG.mint, 3)); inre.rotation.x = PI / 2; inre.position.y = 0.118; holo.add(inre);
    for (const [r, f] of [[0.21, FARG.is], [0.33, FARG.mint]]) {
      const l = new THREE.Mesh(geo(new THREE.TorusGeometry(r, 0.0035, 6, 96)), s.glod(f, 1.4)); l.rotation.x = PI / 2; l.position.y = 0.167; holo.add(l);
    }
    holo.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.02, 48), s.glod(FARG.mint, 2.4), 0, 0.172, 0));
    const linsHalo = s.halo(FARG.mint, 0.9, 1.4); linsHalo.position.y = 0.2; holo.add(linsHalo);
  }
  // HUD-ring projicerad på marmorn runt plinten
  const hudTex = tex(512, 512, (ctx, b) => {
    const c = b / 2; ctx.translate(c, c);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU; const lang = i % 10 === 0 ? 26 : i % 5 === 0 ? 16 : 9; ctx.lineWidth = i % 10 === 0 ? 3 : 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 236, Math.sin(a) * 236); ctx.lineTo(Math.cos(a) * (236 - lang), Math.sin(a) * (236 - lang)); ctx.stroke(); }
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 196, 0, TAU); ctx.stroke();
    ctx.lineWidth = 8; ctx.setLineDash([60, 22, 8, 22]); ctx.beginPath(); ctx.arc(0, 0, 180, 0.2, TAU - 0.2); ctx.stroke(); ctx.setLineDash([]);
  });
  const hud = mesh(new THREE.PlaneGeometry(2.2, 2.2), additiv(FARG.mint, 0.42, hudTex, 0.9), 0, 0.0025, 0);
  hud.rotation.x = -PI / 2; hud.userData.ejSpegel = true; holo.add(hud);
  const hudSken = mesh(new THREE.PlaneGeometry(3.4, 3.4), additiv(FARG.mint, 0.12), 0, 0.002, 0); hudSken.rotation.x = -PI / 2; hudSken.userData.ejSpegel = true; holo.add(hudSken);
  // ljuskägla, logga, gyroringar, skanner, partiklar och mintljus
  const kagla = mesh(new THREE.CylinderGeometry(0.62, 0.13, 1.7, 64, 1, true), kagleMaterial(FARG.mint, 0.75), 0, 0.18 + 0.85, 0);
  holo.add(kagla);
  const loggaMat = holoMaterial(FARG.mint, 0.95);
  const logga = s.uLogga(0.15, { material: loggaMat });
  logga.scale.setScalar(0.86); logga.position.y = 1.08; holo.add(logga);
  const karna = s.halo(FARG.mint, 1.3, 0.45); karna.position.y = 1.08; holo.add(karna);
  const gyro = [];
  for (const [r, lut, f, st] of [[0.6, 1.25, FARG.mint, 0.9], [0.68, -1.05, FARG.is, 0.7]]) {
    const g = new THREE.Group(); g.position.y = 1.08; g.rotation.x = lut;
    g.add(new THREE.Mesh(geo(new THREE.TorusGeometry(r, 0.0042, 6, 160, TAU * 0.82)), s.glod(f, st)));
    g.add(mesh(new THREE.SphereGeometry(0.016, 12, 8), s.glod(f, st * 3), r, 0, 0));
    holo.add(g); gyro.push(g);
  }
  const skanner = mesh(new THREE.RingGeometry(0.34, 0.46, 96), additiv(FARG.mint, 1.1, null, 0.5), 0, 0.5, 0);
  skanner.rotation.x = -PI / 2; holo.add(skanner);
  holo.add(s.partiklar(hog ? 80 : 44, { centrum: [0, 1.0, 0], omrade: [0.34, 0.82, 0.34], farg: FARG.mint, storlek: 0.04, styrka: 2.6, fart: 0.16 }));
  const holoLjus = new THREE.PointLight(FARG.mint, 6, 0, 2); holoLjus.position.set(0, 0.75, 0); holo.add(holoLjus);
  ram((t) => {
    // U:et pendlar lugnt runt kamerariktningen (aldrig kantvy) – vänt mot kameran i stillbilden och när scenen startar
    logga.rotation.y = Math.sin((t - 1.6) * 0.36) * 0.62 + Math.sin((t - 1.6) * 0.97) * 0.05;
    logga.rotation.x = Math.sin(t * 0.53) * 0.05;
    logga.position.y = 1.08 + Math.sin(t * 1.1) * 0.045;
    karna.position.y = logga.position.y;
    loggaMat.uniforms.tid.value = t; kagla.material.uniforms.tid.value = t;
    gyro[0].rotation.z = t * 0.5; gyro[1].rotation.z = -t * 0.36; gyro[0].rotation.y = Math.sin(t * 0.3) * 0.2;
    hud.rotation.z = t * 0.06;
    const f = (t * 0.32) % 1; skanner.position.y = 0.3 + f * 1.45; skanner.material.opacity = Math.sin(f * PI) * 0.55; skanner.scale.setScalar(1 - f * 0.25);
    holoLjus.intensity = 5.2 + Math.sin(t * 1.7) * 0.9 + Math.sin(t * 5.3) * 0.25;
  });
  // Utan riktig spegel (mobil/låg kvalitet): hologrammets reflex i lacken – ett mjukt ljusstråk från plinten fram till
  // där U:et speglas sett från kameran (räknas om varje bild, så det följer kamerans andning och parallax)
  if (!spegel) {
    const strakTex = tex(64, 256, (ctx, b, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.3, 'rgba(255,255,255,.5)'); g.addColorStop(0.7, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
      ctx.globalCompositeOperation = 'destination-in';
      const m = ctx.createLinearGradient(0, 0, b, 0);
      m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.3, 'rgba(0,0,0,.7)'); m.addColorStop(0.5, 'rgba(0,0,0,1)'); m.addColorStop(0.7, 'rgba(0,0,0,.7)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = m; ctx.fillRect(0, 0, b, h);
    });
    const strakGeo = geo(new THREE.PlaneGeometry(1, 1)); strakGeo.rotateX(-PI / 2);
    const strak = new THREE.Mesh(strakGeo, additiv(FARG.mint, 0.55, strakTex, 1)); strak.userData.ingenSkugga = true; scene.add(strak);
    const ljusStrak = new THREE.Mesh(strakGeo, additiv(0xe6fff6, 0.35, strakTex, 1)); ljusStrak.userData.ingenSkugga = true; scene.add(ljusStrak);
    ram((t) => {
      const c = s.camera.position; const hU = logga.position.y;
      const tt = c.y / (c.y + hU);
      const z0 = holo.position.z + 0.6, z1 = klamp(c.z + tt * (holo.position.z - c.z), z0 + 0.35, BORD.b - 0.22);
      const x1 = c.x + tt * (holo.position.x - c.x);
      strak.position.set(x1 * 0.5, 0.0026, (z0 + z1) / 2); strak.scale.set(0.95, 1, z1 - z0);
      ljusStrak.position.set(x1 * 0.5, 0.0028, (z0 + z1) / 2); ljusStrak.scale.set(0.32, 1, (z1 - z0) * 0.8);
      const puls = 0.85 + 0.15 * Math.sin(t * 1.7);
      strak.material.opacity = puls; ljusStrak.material.opacity = puls;
    });
  }

  await steg();

  /* ---- presentationsbunten ------------------------------------------------------------------- */
  const bilder = (window.UPMote && Array.isArray(window.UPMote.BILDER) && window.UPMote.BILDER.length) ? window.UPMote.BILDER : [{ namn: 'Kundmöte' }];
  const KB = 0.88, KD = 0.58, KT = 0.012;
  const bunt = new THREE.Group(); bunt.name = 'bunt'; bunt.position.set(-2.22, 0, -0.52); bunt.rotation.y = 0.2; scene.add(bunt);
  const kantMat = s.mat('mint', { roughness: 0.55, clearcoat: 0.2 });
  const kortGeo = s.rundadLada(KB, KT, KD, 0.008, 2);
  const ytGeo = geo(new THREE.PlaneGeometry(KB - 0.012, KD - 0.012)); ytGeo.rotateX(-PI / 2);
  const bakGeo = geo(new THREE.PlaneGeometry(KB - 0.012, KD - 0.012)); bakGeo.rotateX(PI / 2);
  const bakTex = tex(512, 340, (ctx, b, h) => {
    const g = ctx.createLinearGradient(0, 0, b, h); g.addColorStop(0, '#163049'); g.addColorStop(1, '#0a1622'); ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
    ctx.strokeStyle = 'rgba(126,224,195,.35)'; ctx.lineWidth = 3; ctx.strokeRect(18, 18, b - 36, h - 36);
    ritaU(ctx, b / 2, h / 2, 120, 'rgba(167,210,255,.85)');
  });
  const bakMat = std({ map: bakTex, roughness: 0.4 });
  const kort = bilder.map((bild, i) => {
    const ytTex = s.canvasTextur(512, 340, (ctx, b, h) => ritaKort(ctx, b, h, bild.namn, i + 1, bilder.length));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(kortGeo, kantMat));
    const yta = new THREE.Mesh(ytGeo, fys({ map: ytTex, roughness: 0.5, clearcoat: 0.22, clearcoatRoughness: 0.3, polygonOffset: true, polygonOffsetFactor: -1 })); yta.position.y = KT / 2 + 0.0004; g.add(yta);
    const baksida = new THREE.Mesh(bakGeo, bakMat); baksida.position.y = -KT / 2 - 0.0004; g.add(baksida);
    const r = slump(i * 7 + 3);
    g.userData.jit = { x: (r() - 0.5) * 0.03, z: (r() - 0.5) * 0.03, ry: (r() - 0.5) * 0.07 };
    bunt.add(g); return g;
  });
  bunt.add(kontakt(1.15, 0.85, 0.6, 0, 0));
  const NK = kort.length; const PERIOD = 6.4;
  const slotY = (slot) => KT / 2 + slot * (KT + 0.0015);
  ram((t) => {
    const cyk = Math.floor(t / PERIOD); const p = (t / PERIOD) - cyk;
    const topp = ((cyk % NK) + NK) % NK;
    const hoj = mjuk(0.66, 0.86, p); // de andra lyfts ett steg när kortet går in underst
    for (let k = 0; k < NK; k++) {
      const g = kort[k]; const j = g.userData.jit;
      const franToppen = (((k - cyk) % NK) + NK) % NK;
      if (k !== topp || NK === 1) {
        g.position.set(j.x, slotY(NK - 1 - franToppen + (NK > 1 ? hoj : 0)), j.z); g.rotation.set(0, j.ry, 0);
        continue;
      }
      // kortet som visas: lyfts, vänds mot kunden, vänds över och läggs underst
      const yT = slotY(NK - 1), yB = slotY(0);
      let x = 0, y = yT, z = 0, rx = 0;
      if (p < 0.18) { const f = inut(p / 0.18); x = 0.12 * f; y = lerp(yT, yT + 0.55, f); z = 0.3 * f; rx = 1.0 * f; }
      else if (p < 0.5) { const f = (p - 0.18) / 0.32; x = 0.12; y = yT + 0.55 + Math.sin(f * PI) * 0.035; z = 0.3; rx = 1.0 + Math.sin(f * PI) * 0.04; }
      else if (p < 0.66) { const f = inut((p - 0.5) / 0.16); x = lerp(0.12, 0.36, f); y = yT + 0.55 + Math.sin(f * PI) * 0.12; z = lerp(0.3, 0.22, f); rx = 1.0 + PI * f; }
      else if (p < 0.86) { const f = inut((p - 0.66) / 0.2); x = lerp(0.36, 1.02, f); y = lerp(yT + 0.55, yB, f); z = lerp(0.22, 0.02, f); rx = lerp(1.0 + PI, PI, f); }
      else { const f = inut((p - 0.86) / 0.14); x = lerp(1.02, 0, f); y = yB; z = 0.02 * (1 - f); rx = PI; }
      g.position.set(j.x + x, y, j.z + z); g.rotation.set(rx, j.ry * (1 - mjuk(0, 0.18, p)), 0);
    }
  });

  await steg();

  /* ---- surfplattan med levande hälsoprofil ---------------------------------------------------- */
  const PB = 0.94, PH = 0.64, PT = 0.026;
  const platta = new THREE.Group(); platta.name = 'surfplatta'; platta.position.set(-1.42, 0, 0.5); platta.rotation.y = 0.32; platta.scale.setScalar(1.08); scene.add(platta);
  const plattaKropp = new THREE.Group(); plattaKropp.rotation.x = 1.05; platta.add(plattaKropp);
  const kropp = new THREE.Mesh(s.rundadLada(PB, PT, PH, 0.024, 3), miljo(s.mat('metall', { color: 0x5b646f, roughness: 0.32 }), 0.9)); kropp.position.set(0, PT / 2, -PH / 2); plattaKropp.add(kropp);
  const svartGlas = mesh(new THREE.PlaneGeometry(PB - 0.018, PH - 0.018), miljo(s.mat('skarm'), 0.8), 0, PT + 0.0006, -PH / 2); svartGlas.rotation.x = -PI / 2; plattaKropp.add(svartGlas);
  const skarmInfo = { kund: '' };
  const skarmTex = s.canvasTextur(640, 420, (ctx, b, h) => ritaSkarm(ctx, b, h, s.tid || 1.6, skarmInfo.kund));
  const skarm = mesh(new THREE.PlaneGeometry(PB - 0.075, PH - 0.075), fys({ color: 0x000000, emissive: 0xffffff, emissiveMap: skarmTex, emissiveIntensity: 1.18, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, polygonOffset: true, polygonOffsetFactor: -1 }), 0, PT + 0.0012, -PH / 2);
  skarm.rotation.x = -PI / 2; plattaKropp.add(skarm);
  const skarmSken = s.halo(0x8fe9d2, 1.2, 0.25); skarmSken.position.set(0, 0.42, 0.18); platta.add(skarmSken);
  // fodral som stöd bakom plattan
  const fodralMat = fys({ color: 0x1b3550, roughness: 0.82, sheen: 0.6, sheenColor: new THREE.Color(0x3d6a91), sheenRoughness: 0.7 });
  const stod = new THREE.Mesh(s.rundadLada(PB * 0.9, 0.012, 0.36, 0.005, 2), fodralMat); stod.position.set(0, 0.155, -0.43); stod.rotation.x = -0.62; platta.add(stod);
  const fodralBotten = new THREE.Mesh(s.rundadLada(PB * 0.9, 0.012, 0.3, 0.005, 2), fodralMat); fodralBotten.position.set(0, 0.006, -0.2); platta.add(fodralBotten);
  platta.add(kontakt(1.2, 0.95, 0.55, 0, -0.18));
  let senastSkarm = -1;
  ram((t) => { if (t - senastSkarm >= (hog ? 1 / 20 : 1 / 12) || t < senastSkarm) { senastSkarm = t; skarmTex.rita(); } });

  /* ---- provrörsställ med blodrör --------------------------------------------------------------- */
  const stall = new THREE.Group(); stall.name = 'provror'; stall.position.set(1.32, 0, -0.98); stall.rotation.y = -0.12; stall.scale.setScalar(1.18); scene.add(stall);
  {
    // matt, svagt mintfärgad akryl (inte vit plast som bränner ut i ljuset)
    const plast = miljo(fys({ color: 0x8fa9a6, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.25, sheenColor: new THREE.Color(0xbff3e4) }), 0.45);
    const SB = 1.12, SD = 0.34;
    const toppPlatta = new THREE.Mesh(s.rundadLada(SB, 0.03, SD, 0.012, 2), plast); toppPlatta.position.y = 0.3; stall.add(toppPlatta);
    const bottenPlatta = new THREE.Mesh(s.rundadLada(SB, 0.026, SD, 0.01, 2), plast); bottenPlatta.position.y = 0.013; stall.add(bottenPlatta);
    for (const x of [-SB / 2 + 0.018, SB / 2 - 0.018]) { const gavel = new THREE.Mesh(s.rundadLada(0.036, 0.3, SD, 0.012, 2), plast); gavel.position.set(x, 0.165, 0); stall.add(gavel); }
    const halMat = std({ color: 0x2c3540, roughness: 0.7 });
    const halGeo = geo(new THREE.CircleGeometry(0.042, 24)); halGeo.rotateX(-PI / 2);
    // rör: [lockfärg, innehåll, fyllnad, etikett] – lila EDTA, guld serum (gel), grå glukos, ljusblå citrat, grön heparin
    const ROR = [['#7a5cc7', 'blod', 0.72, 'EDTA'], ['#f0b545', 'serum', 0.7, 'SERUM'], ['#9aa4ae', 'blod', 0.66, 'NaF'], ['#3aa9c9', 'blod', 0.7, 'CITRAT'], ['#2fa37a', 'blod', 0.68, 'HEPARIN'], ['#7a5cc7', 'blod', 0.7, 'EDTA'], ['#f0b545', 'serum', 0.72, 'SERUM']];
    const platser = [];
    for (let rad = 0; rad < 2; rad++) for (let i = 0; i < 6; i++) platser.push([-0.43 + i * 0.172 + rad * 0.04, rad === 0 ? 0.075 : -0.075]);
    const fyllda = [0, 1, 2, 3, 4, 7, 9];
    const rorR = 0.034, rorH = 0.5;
    const rorGeo = geo(lathe([[0, 0.002], [0.014, 0.003], [0.026, 0.01], [0.032, 0.024], [rorR, 0.045], [rorR, rorH], [rorR - 0.004, rorH], [rorR - 0.004, 0.045], [0.027, 0.024], [0.02, 0.012], [0, 0.008]], hog ? 32 : 20));
    const rorMat = miljo(s.mat('glas', { thickness: 0.012, attenuationDistance: 6, roughness: 0.03, ior: 1.52 }), 1.35);
    // etiketter med streckkod, provtyp och Uperformance-rand (en per provtyp)
    const etiketter = new Map();
    const etikettMat = (typ, lock) => {
      if (etiketter.has(typ)) return etiketter.get(typ);
      const t = tex(256, 160, (ctx, b, h) => {
        ctx.fillStyle = '#f7f6f1'; ctx.fillRect(0, 0, b, h);
        ctx.fillStyle = lock; ctx.fillRect(0, 0, b, 18);
        ctx.fillStyle = '#183653'; ctx.fillRect(0, h - 12, b, 12);
        ctx.fillStyle = '#0b1520'; ctx.font = '700 30px Manrope, sans-serif'; ctx.fillText(typ, 18, 54);
        const r = slump(typ.length * 31 + 7); let x = 18; ctx.fillStyle = '#111';
        while (x < b - 20) { const w = 1 + Math.floor(r() * 3.4); ctx.fillRect(x, 70, w, 52); x += w + 1 + Math.floor(r() * 3); }
        ctx.fillStyle = 'rgba(17,17,17,.6)'; ctx.font = '600 15px Manrope, sans-serif'; ctx.fillText('UP · 0' + (typ.length * 1379 % 9000 + 1000), 18, 140);
      });
      const m = std({ map: t, roughness: 0.78, side: THREE.DoubleSide });
      etiketter.set(typ, m); return m;
    };
    const etikettGeo = geo(new THREE.CylinderGeometry(rorR + 0.0016, rorR + 0.0016, 0.17, 24, 1, true, -1.3, 2.6));
    // venblod: djupt rött med lite inre sken (ljuset sprids i blodet) och blank yta mot glaset
    const blodMat = miljo(fys({ color: 0xa0141f, emissive: 0x42060b, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.6, sheenColor: new THREE.Color(0xd23040), sheenRoughness: 0.35 }), 0.9);
    const koagelMat = miljo(fys({ color: 0x4a0a10, roughness: 0.2, clearcoat: 0.8 }), 0.8);
    const gelMat = fys({ color: 0xe9e4d2, roughness: 0.35, clearcoat: 0.5 });
    const serumMat = miljo(fys({ color: 0xf1c04e, roughness: 0.06, clearcoat: 1, emissive: 0x6a4200, emissiveIntensity: 0.35 }), 0.9);
    platser.forEach(([x, z], n) => {
      const hal = new THREE.Mesh(halGeo, halMat); hal.position.set(x, 0.3155, z); stall.add(hal);
      const fi = fyllda.indexOf(n); if (fi < 0) return;
      const [lock, typ, fyll, namn] = ROR[fi % ROR.length];
      // etiketterna vetter snett bakåt (en remsa syns i kanten) – blodet och serumet syns framifrån
      const g = new THREE.Group(); g.position.set(x, 0.026, z); g.rotation.y = PI * 0.72 + ((n % 3) - 1) * 0.2 + (fi % 2 ? 0.12 : -0.08); stall.add(g);
      const glas = new THREE.Mesh(rorGeo, rorMat); glas.userData.ingenSkugga = true; g.add(glas);
      const ri = rorR - 0.0055; const fh = rorH * fyll;
      if (typ === 'serum') {
        g.add(new THREE.Mesh(geo(lathe([[0, 0.012], [0.022, 0.014], [ri, 0.04], [ri, fh * 0.48], [0, fh * 0.48]], 24)), koagelMat));
        g.add(mesh(new THREE.CylinderGeometry(ri, ri, 0.04, 24), gelMat, 0, fh * 0.48 + 0.02, 0));
        g.add(mesh(new THREE.CylinderGeometry(ri, ri, fh * 0.42, 24), serumMat, 0, fh * 0.48 + 0.04 + fh * 0.21, 0));
      } else {
        g.add(new THREE.Mesh(geo(lathe([[0, 0.012], [0.022, 0.014], [ri, 0.04], [ri, fh], [ri - 0.004, fh + 0.003], [0, fh + 0.004]], 24)), blodMat));
      }
      g.userData.etikett = etikettMat(namn, lock);
      const lockGr = new THREE.Group(); lockGr.position.y = rorH - 0.018; g.add(lockGr);
      const lockMat = fys({ color: lock, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 });
      const rafflor = []; for (let i = 0; i <= 12; i++) rafflor.push([rorR + 0.011 + (i % 2 ? 0.0025 : 0), (i / 12) * 0.075]);
      lockGr.add(new THREE.Mesh(geo(lathe([[0, 0], [rorR + 0.006, 0], ...rafflor, [rorR + 0.008, 0.082], [rorR - 0.004, 0.086], [0.016, 0.084], [0, 0.082]], hog ? 40 : 24)), lockMat));
      lockGr.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 16), s.material.gummi, 0, 0.085, 0));
      const etikett = new THREE.Mesh(etikettGeo, g.userData.etikett); etikett.position.y = 0.2; g.add(etikett);
    });
    stall.add(kontakt(1.5, 0.62, 0.6, 0, 0));
  }

  await steg();

  /* ---- EKG-remsan ------------------------------------------------------------------------------ */
  {
    // rosa millimeterpapper (5 mm-rutor tydliga, 1 mm svaga) med en kraftig svart kurva – sju slag och en rullad ände
    const ekgTex = tex(2048, 256, (ctx, b, h) => {
      ctx.fillStyle = '#f7d3cc'; ctx.fillRect(0, 0, b, h);
      const mm = 12.8;
      ctx.strokeStyle = 'rgba(226,96,84,.22)'; ctx.lineWidth = 1.2;
      for (let x = 0; x < b; x += mm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += mm) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(214,72,60,.62)'; ctx.lineWidth = 2.6;
      for (let x = 0; x < b; x += mm * 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += mm * 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(11,21,32,.75)'; ctx.font = '700 22px Manrope, sans-serif'; ctx.fillText('II', 18, 36); ctx.fillText('25 mm/s', b - 120, 36);
      ctx.strokeStyle = '#0d0f12'; ctx.lineWidth = 7.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      for (let x = 0; x <= b; x += 1.5) { const y = h * 0.64 - ekg(x / 292 + 0.08) * h * 0.5; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    });
    const LEN = 1.7, BR = 0.3, SEG = 160;
    const g = new THREE.PlaneGeometry(LEN, BR, SEG, 1); g.rotateX(-PI / 2);
    const pos = g.getAttribute('position');
    const rakt = 0.2, r0 = 0.07; // vänstra änden rullas upp (bort från skrivplattans bana)
    for (let i = 0; i < pos.count; i++) {
      const x0 = pos.getX(i); const u = x0 / LEN + 0.5;
      let x = x0, y = 0.003 + Math.max(0, Math.sin(u * 13) * 0.005);
      if (u < rakt) { const vinkel = ((rakt - u) * LEN) / r0; const r = r0 * (1 - 0.055 * vinkel); x = (rakt - 0.5) * LEN - Math.sin(vinkel) * r; y = 0.003 + r0 - Math.cos(vinkel) * r; }
      pos.setX(i, x); pos.setY(i, y);
    }
    g.computeVertexNormals();
    const remsa = new THREE.Mesh(geo(g), std({ map: ekgTex, roughness: 0.82, side: THREE.DoubleSide }));
    remsa.position.set(-0.42, 0, 1.12); remsa.rotation.y = 0.2; scene.add(remsa);
    scene.add(kontakt(1.85, 0.46, 0.35, -0.42, 1.12, 0.2));
  }

  /* ---- stoppuret (tickande visare) ------------------------------------------------------------- */
  const klocka = new THREE.Group(); klocka.name = 'stoppur'; klocka.position.set(2.58, 0, 0.66); klocka.rotation.y = -0.46; klocka.scale.setScalar(1.2); scene.add(klocka);
  const visare = new THREE.Group(); const litenVisare = new THREE.Group();
  {
    const krom = s.material.krom;
    klocka.add(new THREE.Mesh(geo(lathe([[0, 0], [0.2, 0], [0.236, 0.01], [0.256, 0.03], [0.264, 0.055], [0.26, 0.08], [0.248, 0.096], [0.234, 0.104], [0.222, 0.104], [0.218, 0.092], [0, 0.092]], hog ? 96 : 56)), krom));
    // urtavlan: matt vit med svarta streck och siffror (ingen lack som bränner ut i ljuset)
    const urtavlaTex = s.canvasTextur(512, 512, ritaUrtavla);
    const tavla = mesh(new THREE.CircleGeometry(0.216, 72), std({ map: urtavlaTex, color: 0xcfd6dc, roughness: 0.6 }), 0, 0.0925, 0); tavla.rotation.x = -PI / 2; klocka.add(tavla);
    const R = 0.62; const th = Math.asin(0.224 / R);
    const glas = mesh(new THREE.SphereGeometry(R, 64, 10, 0, TAU, 0, th), miljo(s.mat('glas', { thickness: 0.02, roughness: 0.02, attenuationDistance: 10, specularIntensity: 0.45 }), 0.75), 0, 0.103 - R * Math.cos(th), 0);
    glas.userData.ingenSkugga = true; klocka.add(glas);
    const rod = std({ color: 0xd8402f, roughness: 0.35, metalness: 0.2 });
    visare.position.y = 0.097; klocka.add(visare);
    visare.add(mesh(new THREE.BoxGeometry(0.009, 0.004, 0.25), rod, 0, 0, -0.075));
    visare.add(mesh(new THREE.ConeGeometry(0.009, 0.03, 4), rod, 0, 0, -0.213).rotateX(-PI / 2));
    const motvikt = new THREE.Mesh(geo(new THREE.TorusGeometry(0.014, 0.004, 6, 20)), rod); motvikt.rotation.x = PI / 2; motvikt.position.z = 0.045; visare.add(motvikt);
    visare.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16), krom, 0, 0.002, 0));
    litenVisare.position.set(0, 0.096, 0.082); klocka.add(litenVisare);
    litenVisare.add(mesh(new THREE.BoxGeometry(0.005, 0.002, 0.045), std({ color: 0x183653, roughness: 0.4 }), 0, 0, -0.018));
    // krona med bygel och knapp
    const hals = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 16), krom, 0, 0.052, -0.282); hals.rotation.x = PI / 2; klocka.add(hals);
    const kr = []; for (let i = 0; i <= 10; i++) kr.push([0.042 + (i % 2 ? 0.004 : 0), (i / 10) * 0.045]);
    const krona = mesh(lathe([[0, 0], ...kr, [0, 0.045]], 32), krom, 0, 0.052, -0.305); krona.rotation.x = -PI / 2; klocka.add(krona);
    const bygel = new THREE.Mesh(geo(new THREE.TorusGeometry(0.05, 0.009, 10, 32)), krom); bygel.position.set(0, 0.052, -0.39); bygel.rotation.x = 0.2; klocka.add(bygel);
    const knapp = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 16), krom, Math.sin(0.75) * 0.27, 0.055, -Math.cos(0.75) * 0.27); knapp.rotation.set(PI / 2, 0, -0.75); klocka.add(knapp);
    klocka.add(kontakt(0.75, 0.75, 0.6, 0, -0.03));
  }
  ram((t) => {
    const f = t - Math.floor(t);
    const steg = Math.floor(t) - 1 + (1 - Math.exp(-f * 38) * Math.cos(f * 46));
    visare.rotation.y = -(steg / 60) * TAU;
    litenVisare.rotation.y = -(t / 1800) * TAU;
  });

  await steg();

  /* ---- fotbollen (stympad ikosaeder med sömmar) på ett kromstativ -------------------------------- */
  const boll = new THREE.Group(); boll.name = 'fotboll'; boll.position.set(-1.18, 0, -1.1); scene.add(boll);
  const bollKropp = new THREE.Group(); bollKropp.position.y = 0.39; boll.add(bollKropp);
  {
    const [vit, svart] = fotbollGeometrier(0.36, hog ? 6 : 4);
    bollKropp.add(new THREE.Mesh(geo(vit), miljo(fys({ color: 0xe9edf0, roughness: 0.46, clearcoat: 0.75, clearcoatRoughness: 0.22, roughnessMap: s.textur.brus }), 0.7)));
    bollKropp.add(new THREE.Mesh(geo(svart), miljo(fys({ color: 0x0d1115, roughness: 0.44, clearcoat: 0.75, clearcoatRoughness: 0.22 }), 0.7)));
    const stativ = new THREE.Mesh(geo(new THREE.TorusGeometry(0.14, 0.014, 12, 64)), s.material.krom); stativ.rotation.x = PI / 2; stativ.position.y = 0.05; boll.add(stativ);
    boll.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.036, 48), s.mat('morkMetall', { color: 0x252e38 }), 0, 0.018, 0));
    boll.add(kontakt(0.95, 0.95, 0.65, 0, 0));
  }
  ram((t) => { bollKropp.rotation.set(0.35 + Math.sin(t * 0.17) * 0.12, t * 0.32, 0.12); });

  /* ---- kettlebell i gjutjärn ------------------------------------------------------------------ */
  const kettle = new THREE.Group(); kettle.name = 'kettlebell'; kettle.position.set(2.98, 0, -0.5); kettle.rotation.y = -0.42; scene.add(kettle);
  {
    kettle.add(new THREE.Mesh(geo(lathe([[0, 0], [0.17, 0], [0.205, 0.008], [0.245, 0.035], [0.282, 0.09], [0.302, 0.17], [0.306, 0.24], [0.292, 0.32], [0.255, 0.4], [0.2, 0.46], [0.12, 0.505], [0.04, 0.52], [0, 0.521]], hog ? 72 : 40)), s.mat('gjutjarn', { color: 0x1a1d21, roughness: 0.8 })));
    const bana = new THREE.CatmullRomCurve3([v3(-0.21, 0.36, 0), v3(-0.245, 0.5, 0), v3(-0.235, 0.64, 0), v3(-0.16, 0.75, 0), v3(0, 0.79, 0), v3(0.16, 0.75, 0), v3(0.235, 0.64, 0), v3(0.245, 0.5, 0), v3(0.21, 0.36, 0)]);
    kettle.add(new THREE.Mesh(geo(new THREE.TubeGeometry(bana, 64, 0.046, 16, false)), s.mat('gjutjarn', { color: 0x23272c, roughness: 0.5, metalness: 0.65 })));
    const mark = s.uLogga(0.07, { ring: false, material: s.mat('mint', { roughness: 0.35 }), sidMaterial: s.mat('mint', { color: FARG.mintDjup }) });
    mark.scale.setScalar(0.24); mark.position.set(0, 0.23, 0.296); kettle.add(mark);
    kettle.add(kontakt(0.85, 0.85, 0.75, 0, 0));
  }

  await steg();

  /* ---- vattenflaskan i glas ------------------------------------------------------------------- */
  const flaska = new THREE.Group(); flaska.name = 'flaska'; flaska.position.set(2.28, 0, -1.12); flaska.scale.setScalar(1.06); scene.add(flaska);
  {
    const ytter = [[0, 0.0], [0.1, 0], [0.116, 0.008], [0.122, 0.03], [0.122, 0.48], [0.115, 0.55], [0.094, 0.6], [0.068, 0.628], [0.058, 0.655], [0.058, 0.7]];
    const inner = [[0.05, 0.7], [0.05, 0.655], [0.06, 0.628], [0.086, 0.6], [0.107, 0.55], [0.114, 0.48], [0.114, 0.03], [0.1, 0.016], [0, 0.016]];
    const glas = new THREE.Mesh(geo(lathe([...ytter, ...inner], hog ? 64 : 40)), miljo(s.mat('glas', { thickness: 0.03, attenuationColor: 0xd6f1ff, attenuationDistance: 3, roughness: 0.03 }), 1.35));
    glas.userData.ingenSkugga = true; flaska.add(glas);
    const vatten = new THREE.Mesh(geo(lathe([[0, 0.018], [0.1, 0.018], [0.112, 0.03], [0.112, 0.4], [0, 0.4]], hog ? 64 : 40)), fys({ color: 0xffffff, transmission: 1, thickness: 0.22, ior: 1.33, roughness: 0.02, attenuationColor: new THREE.Color(FARG.mint), attenuationDistance: 0.55, specularIntensity: 1 }));
    vatten.userData.ingenSkugga = true; flaska.add(vatten);
    const yta = new THREE.Mesh(geo(new THREE.TorusGeometry(0.111, 0.0028, 6, 64)), s.glod(0xdffaf2, 0.9)); yta.rotation.x = PI / 2; yta.position.y = 0.4; flaska.add(yta);
    const kork = new THREE.Group(); kork.position.y = 0.66; flaska.add(kork);
    const korkR = []; for (let i = 0; i <= 14; i++) korkR.push([0.066 + (i % 2 ? 0.003 : 0), 0.01 + (i / 14) * 0.07]);
    kork.add(new THREE.Mesh(geo(lathe([[0, 0], [0.064, 0], ...korkR, [0.062, 0.088], [0, 0.09]], 48)), s.mat('metall', { color: 0xc9d1d8, roughness: 0.26 })));
    kork.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.004, 32), s.mat('mint', { roughness: 0.4 }), 0, 0.091, 0));
    const trycTex = s.canvasTextur(256, 512, (ctx, b) => {
      ritaU(ctx, b / 2, 150, 120, 'rgba(255,255,255,.92)');
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 22px Poppins, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('UPERFORMANCE', b / 2, 262);
    });
    const tryck = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.1235, 0.1235, 0.36, 40, 1, true, -0.85, 1.7)), std({ map: trycTex, transparent: true, roughness: 0.55, depthWrite: false }));
    tryck.position.y = 0.26; tryck.userData.ingenSkugga = true; tryck.userData.ejSpegel = true; flaska.add(tryck);
    flaska.add(kontakt(0.5, 0.5, 0.55, 0, 0));
  }

  /* ---- kaffe på fat med ånga ------------------------------------------------------------------ */
  const kaffe = new THREE.Group(); kaffe.name = 'kaffe'; kaffe.position.set(-2.78, 0, 0.62); kaffe.scale.setScalar(0.8); scene.add(kaffe);
  const anga = [];
  {
    const porslin = miljo(fys({ color: 0xeeebe4, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.06, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) }), 0.8);
    kaffe.add(new THREE.Mesh(geo(lathe([[0, 0.012], [0.098, 0.012], [0.104, 0], [0.13, 0], [0.136, 0.012], [0.235, 0.026], [0.292, 0.044], [0.31, 0.054], [0.306, 0.06], [0.29, 0.058], [0.232, 0.042], [0.14, 0.031], [0, 0.03]], hog ? 72 : 48)), porslin));
    const kopp = new THREE.Group(); kopp.position.y = 0.03; kaffe.add(kopp);
    kopp.add(new THREE.Mesh(geo(lathe([[0, 0], [0.068, 0], [0.074, 0.009], [0.096, 0.013], [0.13, 0.05], [0.15, 0.11], [0.157, 0.17], [0.158, 0.2], [0.154, 0.206], [0.149, 0.2], [0.146, 0.17], [0.138, 0.112], [0.116, 0.052], [0.07, 0.024], [0, 0.022]], hog ? 72 : 48)), porslin));
    const kaffeTex = tex(256, 256, (ctx, b) => {
      const g = ctx.createRadialGradient(b / 2, b / 2, 0, b / 2, b / 2, b / 2);
      g.addColorStop(0, '#3a2014'); g.addColorStop(0.55, '#5a3420'); g.addColorStop(0.82, '#8a5a36'); g.addColorStop(0.95, '#b78558'); g.addColorStop(1, '#6b4127');
      ctx.fillStyle = g; ctx.fillRect(0, 0, b, b);
      const r = slump(3); for (let i = 0; i < 240; i++) { ctx.fillStyle = `rgba(214,170,120,${r() * 0.18})`; ctx.beginPath(); ctx.arc(r() * b, r() * b, r() * 3, 0, TAU); ctx.fill(); }
    });
    const yta = mesh(new THREE.CircleGeometry(0.145, 48), fys({ map: kaffeTex, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 }), 0, 0.165, 0); yta.rotation.x = -PI / 2; kopp.add(yta);
    const ora = new THREE.Mesh(geo(new THREE.TorusGeometry(0.052, 0.015, 12, 32, PI * 1.2)), porslin); ora.position.set(0.168, 0.11, 0); ora.rotation.z = -PI * 0.6; kopp.add(ora);
    const sked = new THREE.Group(); sked.position.set(0.21, 0.05, 0.1); sked.rotation.set(0, -0.6, 0.06); kaffe.add(sked);
    const skal = mesh(new THREE.SphereGeometry(0.034, 20, 12), s.material.krom, 0, 0.004, 0); skal.scale.set(1, 0.24, 1.55); sked.add(skal);
    sked.add(mesh(new THREE.BoxGeometry(0.014, 0.005, 0.17), s.material.krom, 0, 0.01, -0.13));
    kaffe.add(kontakt(0.8, 0.8, 0.6, 0, 0));
    const angTex = tex(128, 256, (ctx, b, h) => {
      ctx.filter = 'blur(7px)';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.55 - i * 0.12})`; ctx.lineWidth = 16 - i * 4; ctx.beginPath();
        for (let y = h - 14; y > 12; y -= 4) { const x = b / 2 + Math.sin(y * 0.035 + i * 1.9) * (14 + (h - y) * 0.06); if (y === h - 14) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
    });
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(s.stada(new THREE.SpriteMaterial({ map: angTex, color: 0xe6eef3, transparent: true, opacity: 0, depthWrite: false })));
      sp.position.set(0, 0.25, 0); kaffe.add(sp); anga.push(sp);
    }
  }
  ram((t) => {
    for (let i = 0; i < anga.length; i++) {
      const sp = anga[i]; const f = ((t / 3.8) + i / anga.length) % 1;
      sp.position.set(Math.sin(t * 0.9 + i * 1.7) * 0.035 * f, 0.26 + f * 0.62, Math.cos(t * 0.7 + i) * 0.02 * f);
      sp.scale.set(0.16 + f * 0.26, 0.34 + f * 0.42, 1);
      sp.material.opacity = Math.pow(Math.sin(f * PI), 1.4) * 0.2;
      sp.material.rotation = (i % 2 ? 1 : -1) * f * 0.5;
    }
  });

  await steg();

  /* ---- skrivplattan med offerten och pennan --------------------------------------------------- */
  // Hemma: framför hologrammet till höger. Vald kund → plattan lyfts och glider fram till kundens plats (se platserna).
  const SKRIV_HEM = { x: 1.12, z: 0.8, rot: -0.2 };
  const skriv = new THREE.Group(); skriv.name = 'skrivplatta'; skriv.position.set(SKRIV_HEM.x, 0, SKRIV_HEM.z); skriv.rotation.y = SKRIV_HEM.rot; skriv.scale.setScalar(1.16); scene.add(skriv);
  const offertInfo = { kund: '', titel: '', varde: '' };
  let skrivKontakt = null;
  const offertTex = s.canvasTextur(600, 800, (ctx, b, h) => ritaOffert(ctx, b, h, offertInfo));
  {
    const SD = 1.04;
    const skivaS = new THREE.Mesh(s.rundadLada(0.78, 0.024, SD, 0.02, 3), miljo(fys({ map: tex(512, 512, ritaValnot), roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.12 }), 0.6)); skivaS.position.y = 0.012; skriv.add(skivaS);
    const under = mesh(new THREE.PlaneGeometry(0.66, 0.88), s.mat('papper', { color: 0xd6d3cc }), 0.012, 0.0246, 0.04); under.rotation.set(-PI / 2, 0, 0.035); skriv.add(under);
    const papperGeo = new THREE.PlaneGeometry(0.66, 0.88, 1, 16); papperGeo.rotateX(-PI / 2);
    const pp = papperGeo.getAttribute('position'); for (let i = 0; i < pp.count; i++) { const z = pp.getZ(i); pp.setY(i, Math.max(0, (z - 0.3) * 0.06) ** 1.6); }
    papperGeo.computeVertexNormals();
    const papper = new THREE.Mesh(geo(papperGeo), miljo(std({ map: offertTex, color: 0xd9d6cf, roughness: 0.88, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), 0.35)); papper.position.set(0, 0.0262, 0.05); skriv.add(papper);
    const krom = s.material.krom;
    const klamma = new THREE.Mesh(s.rundadLada(0.34, 0.022, 0.1, 0.009, 2), krom); klamma.position.set(0, 0.036, -SD / 2 + 0.07); skriv.add(klamma);
    const arm = new THREE.Mesh(s.rundadLada(0.28, 0.012, 0.16, 0.006, 2), krom); arm.position.set(0, 0.046, -SD / 2 + 0.12); arm.rotation.x = 0.08; skriv.add(arm);
    const gang = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 16), krom, 0, 0.044, -SD / 2 + 0.04); gang.rotation.z = PI / 2; skriv.add(gang);
    skrivKontakt = kontakt(1.05, 1.3, 0.6, 0, 0); skriv.add(skrivKontakt);
    // pennan
    const penna = new THREE.Group(); penna.position.set(0.5, 0.022, 0.18); penna.rotation.y = 0.5; skriv.add(penna);
    const lack = fys({ color: FARG.navy, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
    const kroppP = mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 24), lack); kroppP.rotation.x = PI / 2; penna.add(kroppP);
    const spets = mesh(new THREE.ConeGeometry(0.02, 0.07, 24), krom, 0, 0, 0.285); spets.rotation.x = PI / 2; penna.add(spets);
    const band = mesh(new THREE.CylinderGeometry(0.0225, 0.0225, 0.02, 24), s.mat('mint', { roughness: 0.3, metalness: 0.4 }), 0, 0, -0.12); band.rotation.x = PI / 2; penna.add(band);
    penna.add(mesh(new THREE.SphereGeometry(0.0205, 16, 10), krom, 0, 0, -0.25));
    const clip = new THREE.Mesh(s.rundadLada(0.008, 0.006, 0.17, 0.003, 2), krom); clip.position.set(0, 0.026, -0.17); penna.add(clip);
    skriv.add(kontakt(0.7, 0.12, 0.4, 0.5, 0.18, -0.5, 0.0265));
  }

  await steg();

  /* ---- konferensstolar: kanalsydd läderrygg, sits i tre dynor, armstöd i borstad aluminium,
     gaskolv i krom och pelarfot med fem armar och hjul. Alla stolar ritas som instanser (4 ritanrop). --- */
  {
    const delar = { lader: [], alu: [], plast: [], krom: [] };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SK = new THREE.Vector3(1, 1, 1);
    const lagg = (typ, g, x, y, z, rx = 0, ry = 0, rz = 0) => { Q.setFromEuler(E.set(rx, ry, rz)); delar[typ].push([g, new THREE.Matrix4().compose(P.set(x, y, z), Q, SK)]); };
    const lada = (b, h, d, r, seg = 3) => new RoundedBoxGeometry(b, h, d, seg, Math.min(r, Math.min(b, h, d) / 2 - 0.0005));
    const SB = 1.56, SD = 1.38, SY = 1.38; // sitsens bredd, djup och höjd över golvet (1 enhet ≈ 1/3 m)
    // sitsen: tre dynor + skal under
    for (let i = 0; i < 3; i++) lagg('lader', lada(SB / 3 - 0.012, 0.2, SD, 0.08, 4), (i - 1) * (SB / 3), SY - 0.1, 0.02);
    lagg('plast', lada(SB * 0.97, 0.1, SD * 0.95, 0.04), 0, SY - 0.24, 0);
    // ryggen: sex kanaler längs en båge, lutad bakåt, med skal bakom
    const RY = SY + 0.98, RZ = -SD / 2 + 0.02, LUT = -0.17;
    for (let i = 0; i < 6; i++) {
      const v = (i - 2.5) * 0.172; const x = Math.sin(v) * 1.5, z = RZ + (1 - Math.cos(v)) * 1.5;
      lagg('lader', lada(0.245, 1.6, 0.18, 0.08, 4), x, RY, z, LUT, -v, 0);
    }
    lagg('lader', lada(SB * 0.98, 0.2, 0.2, 0.09, 4), 0, RY + 0.86, RZ + 0.02, LUT); // ryggens överkant (vulst)
    lagg('plast', lada(SB * 1.0, 1.72, 0.07, 0.05), 0, RY - 0.02, RZ - 0.12, LUT);
    lagg('alu', lada(0.42, 0.5, 0.06, 0.02), 0, SY - 0.06, RZ - 0.18, -0.3); // ryggens fäste
    // armstöden: stolpe, bärarm och dyna
    for (const sx of [-1, 1]) {
      const ax = sx * (SB / 2 + 0.09);
      lagg('alu', lada(0.07, 0.62, 0.13, 0.025), ax, SY + 0.12, 0.05);
      lagg('alu', lada(0.07, 0.05, 0.92, 0.02), ax, SY + 0.44, -0.12);
      lagg('lader', lada(0.15, 0.07, 0.72, 0.03), ax, SY + 0.5, 0.0);
    }
    // gaskolven och pelarfoten
    lagg('krom', new THREE.CylinderGeometry(0.06, 0.06, 0.62, 20), 0, SY - 0.6, 0);
    lagg('plast', new THREE.CylinderGeometry(0.1, 0.11, 0.42, 24), 0, 0.5, 0);
    lagg('alu', new THREE.CylinderGeometry(0.17, 0.2, 0.14, 28), 0, 0.27, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.31; const ca = Math.cos(a), sa = Math.sin(a);
      lagg('alu', lada(0.92, 0.09, 0.13, 0.035), ca * 0.52, 0.25, -sa * 0.52, 0, a, -0.07);
      lagg('plast', lada(0.1, 0.12, 0.1, 0.03), ca * 0.98, 0.18, -sa * 0.98, 0, a, 0);
      lagg('plast', new THREE.CylinderGeometry(0.09, 0.09, 0.11, 18), ca * 0.98, 0.09, -sa * 0.98, 0, a, PI / 2);
    }
    const material = {
      lader: miljo(fys({ color: 0x1a2532, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.34, sheen: 1, sheenColor: new THREE.Color(0x6f93b6), sheenRoughness: 0.42, roughnessMap: s.textur.brus }), 0.7),
      alu: miljo(s.mat('metall', { color: 0xc6ced6, roughness: 0.28 }), 1),
      plast: miljo(fys({ color: 0x0c1015, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }), 0.5),
      krom: s.material.krom,
    };
    // [x, z, vridning]: två på bortre långsidan (en utdragen), en vid varje gavel
    const STOLAR = [[-1.95, -2.66, 0.12], [2.08, -3.02, -0.34], [-4.32, 0.08, PI / 2 - 0.14], [4.34, -0.18, -PI / 2 + 0.1]];
    const mt = new THREE.Matrix4();
    for (const [typ, lista] of Object.entries(delar)) {
      const g = geo(slaIhop(lista));
      const im = new THREE.InstancedMesh(g, material[typ], STOLAR.length);
      STOLAR.forEach(([x, z, r], i) => { im.setMatrixAt(i, mt.compose(P.set(x, GOLV, z), Q.setFromEuler(E.set(0, r, 0)), SK)); });
      im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.name = 'stolar-' + typ;
      scene.add(im);
    }
    for (const [x, z] of STOLAR) rum.add(kontakt(2.1, 2.1, 0.7, x, z, 0, GOLV + 0.03));
  }

  await steg();

  /* ---- luftens partiklar (damm i ljuset) ------------------------------------------------------ */
  scene.add(s.partiklar(hog ? 60 : 30, { centrum: [0.6, 1.4, -0.4], omrade: [5.5, 1.4, 3], farg: 0xffefd8, storlek: 0.03, styrka: 0.75, fart: 0.035, opacitet: 0.45 }));

  /* ---- platserna: projicerade HTML-knappar; vald plats får strålkastare, ljuspöl, ring och offerten ---- */
  const valSpot = new THREE.SpotLight(0xe6fff6, 0, 0, 0.3, 0.8, 2);
  valSpot.position.set(0, 4.6, 2.2); scene.add(valSpot, valSpot.target);
  const puck = new THREE.Group(); scene.add(puck);
  // mjuk mintfärgad ljuspöl på skivan framför platsen (syns ovanför knappen) med en ljusare kärna
  const pol = mesh(new THREE.PlaneGeometry(2.3, 2.3), additiv(FARG.mint, 0.7, s.textur.rund, 0)); pol.rotation.x = -PI / 2; pol.position.y = 0.003; pol.userData.ejSpegel = true; puck.add(pol);
  const polKarna = mesh(new THREE.PlaneGeometry(0.8, 0.8), additiv(0xe6fff6, 0.42, s.textur.rund, 0)); polKarna.rotation.x = -PI / 2; polKarna.position.y = 0.0032; polKarna.userData.ejSpegel = true; puck.add(polKarna);
  const strale = mesh(new THREE.CylinderGeometry(0.06, 0.62, 3.2, 48, 1, true), kagleMaterial(0xdffcf2, 0, 0), 0, 1.6, 0); puck.add(strale);
  // ringen vid bordskanten där kunden sitter (avataren "sitter" i den)
  const kantRing = new THREE.Group(); scene.add(kantRing);
  const ringA = mesh(new THREE.RingGeometry(0.3, 0.318, 96), additiv(FARG.mint, 2.8, null, 0)); ringA.rotation.x = -PI / 2; ringA.position.y = 0.0036; ringA.userData.ejSpegel = true; kantRing.add(ringA);
  const ringB = mesh(new THREE.RingGeometry(0.39, 0.396, 96), additiv(FARG.mint, 1.6, null, 0)); ringB.rotation.x = -PI / 2; ringB.position.y = 0.0036; ringB.userData.ejSpegel = true; kantRing.add(ringB);
  const ringSken = mesh(new THREE.CircleGeometry(0.42, 48), additiv(FARG.mint, 0.5, s.textur.rund, 0)); ringSken.rotation.x = -PI / 2; ringSken.position.y = 0.0034; ringSken.userData.ejSpegel = true; kantRing.add(ringSken);
  const platsRingar = Array.from({ length: 6 }, () => { const m = mesh(new THREE.RingGeometry(0.2, 0.212, 64), additiv(FARG.is, 1.6, null, 0)); m.rotation.x = -PI / 2; m.position.y = 0.0032; m.visible = false; m.userData.ejSpegel = true; scene.add(m); return m; });

  // tl: noder (knapparna), ankare (bordskanten), kant (ringen innanför kanten), pol (ljuspölen längre in)
  const tl = { noder: [], ankare: [], kant: [], pol: [], vald: -1, hover: -1, styrka: 0, mal: v3(0, 0, 0.8), nu: v3(0, 0, 0.8), kantMal: v3(0, 0, 1.4), kantNu: v3(0, 0, 1.4), sig: '', kollad: -1, pos: new WeakMap(), orig: new WeakMap() };
  const vardNoder = () => { const v = s.vard; return { rum: v || null, sek: v ? v.closest('[data-motescen]') : null }; };
  // Den fria ytan: breda skärmar har texten till vänster ovanpå canvasen – x0 = textens högerkant i rummet
  function friYta() {
    const { sek, rum } = vardNoder(); const ord = sek && sek.querySelector('.ms-ord');
    if (!ord || !rum) return { x0: 0 };
    const ro = ord.getBoundingClientRect(), rr = rum.getBoundingClientRect();
    const bredvid = ro.width > 0 && ro.bottom > rr.top + 40 && ro.right > rr.left + 10 && ro.right - rr.left < rr.width * 0.75;
    return { x0: bredvid ? ro.right - rr.left : 0 };
  }
  // Platsernas bana: bordets främre långsida strax utanför kanten (bara där kanten vetter mot kameran)
  const bana = (() => {
    const A = BORD.a + 0.1, B = BORD.b + 0.1, M = 900; const pts = [];
    const pos = (th) => { const c = Math.cos(th), sn = Math.sin(th); return [A * Math.sign(c) * Math.abs(c) ** (2 / BORD.n), B * Math.sign(sn) * Math.abs(sn) ** (2 / BORD.n)]; };
    for (let i = 0; i <= M; i++) {
      const th = lerp(0.02, PI - 0.02, i / M); const [x, z] = pos(th); const [x1, z1] = pos(th + 0.002); const [x0, z0] = pos(th - 0.002);
      const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
      const p = { x, z, nx: tz / l, nz: -tx / l };
      if (p.nz > 0.6) pts.push(p);
    }
    const lang = [0];
    for (let i = 1; i < pts.length; i++) lang.push(lang[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const M2 = pts.length - 1; const tot = lang[M2];
    const vid = (sl) => {
      let j = 0; while (j < M2 - 1 && lang[j + 1] < sl) j++;
      const f = klamp((sl - lang[j]) / ((lang[j + 1] - lang[j]) || 1)); const a = pts[j], b = pts[j + 1];
      const nx = lerp(a.nx, b.nx, f), nz = lerp(a.nz, b.nz, f), nl = Math.hypot(nx, nz) || 1;
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), nx: nx / nl, nz: nz / nl };
    };
    return { tot, vid };
  })();
  const MARGINAL = 22; // px mellan etikett och kortets kant (plus kamerans förskjutning mot vald plats)
  function beraknaAnkare() {
    const n = tl.noder.length; tl.ankare = []; tl.kant = []; tl.pol = [];
    const w = s.bredd, h = s.hojd; if (!n || w < 2) return;
    const { x0 } = friYta();
    const halv = Math.max(24, ...tl.noder.map((nod) => nod.offsetWidth / 2 || 24));
    const vMin = x0 + halv + 8, vMax = w - halv - MARGINAL;
    const xAv = (pk) => s.projicera(v3(pk.x, 0.02, pk.z));
    const syns = (pk) => { const q = xAv(pk); return q.x >= vMin && q.x <= vMax && q.y > 30 && q.y < h - 30; };
    // den synliga delen av banan, utgående från punkten närmast den fria ytans mitt …
    const STEG = 120; const mittPx = (Math.max(x0, 0) + w) / 2;
    let mitt = 0, bast = Infinity;
    for (let i = 0; i <= STEG; i++) { const d = Math.abs(xAv(bana.vid((i / STEG) * bana.tot)).x - mittPx); if (d < bast) { bast = d; mitt = i; } }
    let v0 = mitt, v1 = mitt;
    while (v0 > 0 && syns(bana.vid(((v0 - 1) / STEG) * bana.tot))) v0--;
    while (v1 < STEG && syns(bana.vid(((v1 + 1) / STEG) * bana.tot))) v1++;
    const a0 = (v0 / STEG) * bana.tot, a1 = (v1 / STEG) * bana.tot;
    // … där platserna sprids med lagom avstånd, centrerade i den fria ytan – alla på samma båge
    const L = Math.min(a1 - a0, (n - 1) * 2.3);
    const c = klamp((mitt / STEG) * bana.tot, a0 + L / 2, a1 - L / 2);
    const pkt = Array.from({ length: n }, (_, i) => bana.vid(n === 1 ? c : lerp(c - L / 2, c + L / 2, i / (n - 1))));
    // krockar knapparna (i både x- och y-led)? då hamnar varannan plats en rad längre fram (lägre i bild)
    const ruta = (pk, i, extra = 0) => {
      const q = s.projicera(v3(pk.x + pk.nx * extra, 0.02, pk.z + pk.nz * extra)); const nod = tl.noder[i];
      const b = nod.offsetWidth || 48, hh = nod.offsetHeight || 48;
      return { x0: q.x - b / 2, x1: q.x + b / 2, y0: q.y - 24, y1: q.y - 24 + hh };
    };
    const krock = (a, b) => a.x0 < b.x1 - 2 && b.x0 < a.x1 - 2 && a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2;
    let stagga = false;
    for (let i = 0; i < n - 1 && !stagga; i++) stagga = krock(ruta(pkt[i], i), ruta(pkt[i + 1], i + 1));
    const smal = w < 560;
    pkt.forEach((pk, i) => {
      const extra = stagga && i % 2 ? (smal ? 0.6 : 0.8) : 0;
      tl.ankare.push(v3(pk.x + pk.nx * extra, 0.02, pk.z + pk.nz * extra));
      tl.kant.push(v3(pk.x - pk.nx * 0.42, 0, pk.z - pk.nz * 0.42));
      tl.pol.push(v3(pk.x - pk.nx * 1.12, 0, pk.z - pk.nz * 1.12));
    });
  }
  function placeraPlatser() {
    for (let i = 0; i < tl.noder.length && i < tl.ankare.length; i++) {
      const p = s.projicera(tl.ankare[i]); const nod = tl.noder[i];
      const x = Math.round(p.x * 2) / 2, y = Math.round(p.y * 2) / 2;
      const forra = tl.pos.get(nod);
      if (!forra || forra[0] !== x || forra[1] !== y) { nod.style.left = x + 'px'; nod.style.top = y + 'px'; tl.pos.set(nod, [x, y]); }
    }
  }
  function lasVal() {
    const kId = document.querySelector('[data-mote-kund]')?.value || '';
    const aId = document.querySelector('[data-mote-affar]')?.value || '';
    let vald = tl.noder.findIndex((n) => n.classList.contains('vald'));
    if (vald < 0 && kId) vald = tl.noder.findIndex((n) => n.dataset.kund === kId);
    const sig = `${kId}|${aId}|${vald}|${tl.noder.length}`;
    if (sig === tl.sig) return;
    tl.sig = sig; tl.vald = vald;
    // offerten och skärmen visar bara uppgifter som finns i CRM:et
    const c = window.UPCRM; let kund = null, affar = null, varde = '';
    try {
      if (c && kId) kund = c.kund(kId) || null;
      const affId = aId || (vald >= 0 ? tl.noder[vald].dataset.affar : '');
      if (c && kund && affId) { const a = c.affar(affId); if (a && a.kundId === kund.id) affar = a; }
      if (affar && affar.offert && c.affarVarde) varde = c.kr(c.affarVarde(affar));
    } catch (err) { kund = kund || null; affar = null; varde = ''; }
    offertInfo.kund = kund ? kund.namn : ''; offertInfo.titel = affar ? affar.titel : ''; offertInfo.varde = varde;
    skarmInfo.kund = kund ? kund.namn : '';
    offertTex.rita(); skarmTex.rita();
    if (vald >= 0 && tl.pol[vald]) { tl.mal.copy(tl.pol[vald]); tl.kantMal.copy(tl.kant[vald]); }
  }

  // Skrivplattan med offerten: lyfts och glider fram till vald kund (inom en fri fil framför hologrammet)
  const skrivAnim = { fran: v3(SKRIV_HEM.x, 0, SKRIV_HEM.z), till: v3(SKRIV_HEM.x, 0, SKRIV_HEM.z), franRot: SKRIV_HEM.rot, tillRot: SKRIV_HEM.rot, p: 1 };
  function skrivMal() {
    if (tl.vald < 0 || !tl.pol[tl.vald]) return [SKRIV_HEM.x, SKRIV_HEM.z, SKRIV_HEM.rot];
    const p = tl.pol[tl.vald]; const x = klamp(p.x, 0.62, 1.6);
    return [x, 0.86, klamp((p.x - x) * 0.22, -0.42, 0.42) - 0.06];
  }
  function flyttaSkriv(dt) {
    const [mx, mz, mr] = skrivMal(); const a = skrivAnim;
    if (Math.abs(mx - a.till.x) > 0.005 || Math.abs(mz - a.till.z) > 0.005 || Math.abs(mr - a.tillRot) > 0.005) {
      a.fran.set(skriv.position.x, 0, skriv.position.z); a.franRot = skriv.rotation.y;
      a.till.set(mx, 0, mz); a.tillRot = mr; a.p = dt > 0 ? 0 : 1;
    }
    if (a.p < 1) a.p = Math.min(1, a.p + dt / 1.2);
    const f = inut(a.p); const lyft = Math.sin(a.p * PI); const sida = Math.sign(a.till.x - a.fran.x) || 1;
    skriv.position.set(lerp(a.fran.x, a.till.x, f), lyft * 0.24, lerp(a.fran.z, a.till.z, f));
    skriv.rotation.set(-lyft * 0.1, lerp(a.franRot, a.tillRot, f), -lyft * 0.06 * sida);
    if (skrivKontakt) skrivKontakt.material.opacity = 0.6 * (1 - lyft * 0.75);
  }

  const kamSkift = v3(0, 0, 0);
  ram((t, dt) => {
    // valet läses om två gånger i sekunden (billigt) – och direkt vid change/klick (se lyssna())
    if (t - tl.kollad > 0.5 || t < tl.kollad) { tl.kollad = t; lasVal(); }
    const harVal = tl.vald >= 0 && !!tl.pol[tl.vald];
    if (dt > 0) {
      tl.styrka = THREE.MathUtils.damp(tl.styrka, harVal ? 1 : 0, 3.2, dt);
      for (const ax of ['x', 'z']) { tl.nu[ax] = THREE.MathUtils.damp(tl.nu[ax], tl.mal[ax], 4.5, dt); tl.kantNu[ax] = THREE.MathUtils.damp(tl.kantNu[ax], tl.kantMal[ax], 6, dt); }
    } else { tl.styrka = harVal ? 1 : 0; tl.nu.copy(tl.mal); tl.kantNu.copy(tl.kantMal); }
    const st = tl.styrka; const puls = 0.86 + 0.14 * Math.sin(t * 2.4);
    puck.position.set(tl.nu.x, 0, tl.nu.z); puck.visible = st > 0.003;
    pol.material.opacity = 0.75 * st * puls; polKarna.material.opacity = 0.55 * st * puls;
    strale.material.uniforms.styrka.value = 0.12 * st;
    kantRing.position.set(tl.kantNu.x, 0, tl.kantNu.z); kantRing.visible = st > 0.003;
    const vag = (t * 0.55) % 1;
    ringA.material.opacity = 0.95 * st; ringSken.material.opacity = 0.45 * st * puls;
    ringB.scale.setScalar(1 + vag * 0.55); ringB.material.opacity = st * (1 - vag) * 0.9;
    valSpot.intensity = 42 * st;
    valSpot.position.set(tl.nu.x * 0.8, 4.4, tl.nu.z + 1.6); valSpot.target.position.set(tl.nu.x, 0, tl.nu.z);
    for (let i = 0; i < platsRingar.length; i++) {
      const m = platsRingar[i]; const p = tl.kant[i];
      m.visible = !!p && i !== tl.vald;
      if (m.visible) { m.position.set(p.x, 0.0032, p.z); m.material.opacity = (i === tl.hover ? 0.9 : 0.22) * (0.8 + 0.2 * Math.sin(t * 1.6 + i)); }
    }
    flyttaSkriv(dt);
    // kameran förskjuts lite mot vald plats
    const mx = harVal ? klamp((tl.nu.x - kamBas.mal.x) * 0.14, -0.3, 0.3) : 0;
    if (dt > 0) kamSkift.x = THREE.MathUtils.damp(kamSkift.x, mx, 2.2, dt); else kamSkift.x = mx;
    kam.position.copy(kamBas.pos).add(kamSkift); kam.mal.copy(kamBas.mal).add(kamSkift);
    placeraPlatser();
  });

  /* ---- kameran: bordet i den fria ytan (till höger om texten på breda skärmar), ändarna får beskäras ---- */
  const kam = s.kamerastyr;
  const kamBas = { pos: v3(0.3, 3.6, 9.4), mal: v3(0.3, 0.35, 0.1) };
  function stallKamera(w, h) {
    const cam = s.camera;
    const { x0 } = friYta(); const bredvid = x0 > 0;
    const vanster = bredvid ? Math.max(0, x0 - 70) : 0;
    const fri = Math.max(200, w - vanster);
    const smal = fri < 640;
    const nedre = smal && !bredvid ? 60 : 0; // mobil: raden med vald kund ligger under bordet
    const cx = bredvid ? vanster + fri * 0.5 : w / 2, cy = (h - nedre) / 2;
    const elev = THREE.MathUtils.degToRad(smal ? 36 : bredvid ? 21 : 25);
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const hh = h - nedre;
    const ppu = bredvid ? Math.min(fri / 5.5, hh / 3.2) : Math.min(fri / (smal ? 7.3 : 6.9), hh / (smal ? 3.6 : 3.5));
    const Wf = 2 * Math.max(cx, w - cx), Hf = 2 * Math.max(cy, h - cy);
    const d = (Hf / 2 / ppu) / tanH;
    kamBas.mal.set(bredvid ? 0.4 : 0, smal ? 0.3 : 0.26, smal ? 0.05 : 0.18);
    kamBas.pos.set(kamBas.mal.x, kamBas.mal.y + Math.sin(elev) * d, kamBas.mal.z + Math.cos(elev) * d);
    kam.position.copy(kamBas.pos).add(kamSkift); kam.mal.copy(kamBas.mal).add(kamSkift);
    kam.parallax.set(smal ? 0.16 : 0.42, smal ? 0.08 : 0.24);
    armatur.visible = !smal; // smal bild: armaturen blir bara ett streck – ljuset (och reflexen i miljön) finns kvar
    if (Math.abs(Wf - w) > 2 || Math.abs(Hf - h) > 2) { cam.aspect = Wf / Hf; cam.setViewOffset(Wf, Hf, cx < w / 2 ? Wf - w : 0, cy < h / 2 ? Hf - h : 0, w, h); }
    else { cam.clearViewOffset(); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    cam.position.copy(kam.position); cam.lookAt(kam.mal); cam.updateMatrixWorld();
  }
  s.storlek((w, h) => { stallKamera(w, h); beraknaAnkare(); placeraPlatser(); });

  /* ---- spegling i den lackade skivan (hög kvalitet): rummet ritas spegelvänt i halv upplösning en gång per bild.
     Glas och dekaler i skivans plan ligger i lager 1 (syns för kameran men inte i spegeln). --------------------- */
  if (spegel) spegla(s, topp, toppMat);
  s.camera.layers.enable(1);
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isSprite) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (o.userData.ejSpegel || (m && (m.transmission || 0) > 0)) o.layers.set(1);
  });

  /* ---- dimma: djup i det mörka rummet (glöd och dekaler påverkas inte) ------------------------- */
  scene.fog = new THREE.FogExp2(0x060b11, 0.02);
  scene.traverse((o) => {
    const lista = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of lista) if (m.blending === THREE.AdditiveBlending || m.isShaderMaterial) m.fog = false;
  });

  // glöden får inte spridas från enstaka extremt ljusa reflexer (krom, glas): de blev fyrkantiga fläckar på inbyggd grafik
  if (s.bloom) { const hp = s.bloom.materialHighPassFilter; hp.fragmentShader = hp.fragmentShader.replace('vec4( 64.0 )', 'vec4( 4.0 )'); hp.needsUpdate = true; }

  /* ---- alla ram-funktioner i en ---------------------------------------------------------------- */
  s.ram((t, dt) => { for (const fn of ramar) fn(t, dt); });

  // Skuggor: bara ogenomskinliga föremål kastar och tar emot; glöd, glas och dekaler gör det inte
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.ingenSkugga) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m.isMeshBasicMaterial || m.isShaderMaterial || m.transparent || (m.transmission || 0) > 0) return;
    o.castShadow = true; o.receiveShadow = true;
  });

  /* ---- koppling till vyn (anropas vid varje montering, även efter omritning) ------------------- */
  function hover(ev) { const i = tl.noder.indexOf(ev.currentTarget); tl.hover = ev.type === 'pointerenter' ? i : -1; }
  s.mote = {
    koppla(rumNod, sekNod) {
      for (const n of tl.noder) { n.removeEventListener('pointerenter', hover); n.removeEventListener('pointerleave', hover); }
      tl.noder = [...rumNod.querySelectorAll('.ms-plats')];
      for (const n of tl.noder) {
        n.addEventListener('pointerenter', hover); n.addEventListener('pointerleave', hover);
        if (!tl.orig.has(n)) tl.orig.set(n, [n.style.left, n.style.top]); // CSS-scenens platser (om WebGL faller bort)
      }
      tl.sig = ''; tl.hover = -1; tl.rum = rumNod; tl.sek = sekNod;
      if (s.bredd > 1) stallKamera(s.bredd, s.hojd);
      beraknaAnkare(); placeraPlatser(); lasVal();
      if (tl.vald >= 0 && tl.pol[tl.vald] && tl.styrka < 0.01) { tl.nu.copy(tl.pol[tl.vald]); tl.kantNu.copy(tl.kant[tl.vald]); }
      // den platta CSS-scenen döljs (tas inte bort) när WebGL har ritat
      const css = rumNod.querySelector('.ms-scen');
      if (css) {
        const dolj = (mjukt) => {
          if (!css.isConnected) return;
          const klart = () => { css.style.visibility = 'hidden'; if (sekNod) sekNod.setAttribute('data-ms-3d-klar', ''); };
          if (!mjukt) { klart(); return; }
          css.style.transition = 'opacity .7s cubic-bezier(.22,1,.36,1)'; css.style.opacity = '0';
          setTimeout(() => { if (css.isConnected) klart(); }, 760);
        };
        if (s.canvas.hasAttribute('data-klar')) dolj(false); else s.klar.then(() => dolj(true));
      }
      if (s.lugn) s.rita();
    },
    las() { tl.sig = ''; lasVal(); if (s.lugn) s.rita(); },
  };
  // Städas scenen (vyn lämnad en stund, eller WebGL-kontexten förlorad) släpps vyns noder; syns vyn fortfarande
  // visas CSS-scenen igen med platserna där den hade dem.
  if (s.vidForstor) s.vidForstor(() => {
    for (const n of tl.noder) { n.removeEventListener('pointerenter', hover); n.removeEventListener('pointerleave', hover); }
    const { rum, sek } = tl;
    if (sek && sek.isConnected) {
      sek.removeAttribute('data-ms-3d'); sek.removeAttribute('data-ms-3d-klar');
      const css = rum && rum.querySelector('.ms-scen');
      if (css) { css.style.visibility = ''; css.style.opacity = ''; css.style.transition = ''; }
      for (const n of tl.noder) { const o = tl.orig.get(n); if (o) { n.style.left = o[0]; n.style.top = o[1]; } }
    }
    tl.noder = []; tl.rum = null; tl.sek = null; s.mote = null;
  });
}

/* ---- planspegel för bordsskivan (samma metod som three.js Reflector: spegelkamera + snett närplan) ----- */
function spegla(s, yta, material) {
  const { renderer, camera } = s;
  // MSAA (inga trappsteg på tunna kanter) + mipmappar: lacken suddar reflexen via mip-nivån i stället för glesa
  // prov – lamellväggens ränder blir inte moaré och små ljusa detaljer blir inte pixliga block
  const rt = s.stada(new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true, samples: 4 }));
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const kam = new THREE.PerspectiveCamera(); kam.layers.set(0);
  const matris = new THREE.Matrix4();
  const normal = new THREE.Vector3(0, 1, 0), punkt = new THREE.Vector3(0, 0, 0);
  const vy = new THREE.Vector3(), mal = new THREE.Vector3(), blick = new THREE.Vector3(), kamPos = new THREE.Vector3(), rot = new THREE.Matrix4();
  const plan = new THREE.Plane(), klipp = new THREE.Vector4(), q = new THREE.Vector4();
  const uni = { speglingKarta: { value: rt.texture }, speglingMatris: { value: matris }, speglingStyrka: { value: 6.5 }, speglingSteg: { value: new THREE.Vector2(0.002, 0.002) } };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 speglingMatris;\nvarying vec4 vSpegel;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSpegel = speglingMatris * modelMatrix * vec4( transformed, 1.0 );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D speglingKarta;\nuniform float speglingStyrka;\nuniform vec2 speglingSteg;\nvarying vec4 vSpegel;')
      .replace('#include <opaque_fragment>', `{
        vec2 suv = vSpegel.xy / vSpegel.w;
        // glansig spegling: fem prov på en mjukare mip-nivå (lackens råhet styr suddet)
        // proven ligger inom en texel på den valda mip-nivån → mjuk tältfiltrering, inga spökkopior av tunna ljuslinjer
        float mip = 0.8 + 3.0 * roughnessFactor;
        vec2 d = speglingSteg * exp2( mip ) * 0.45;
        vec3 sp = texture2D( speglingKarta, suv, mip ).rgb * 0.36
          + ( texture2D( speglingKarta, suv + vec2( d.x, d.y ), mip ).rgb + texture2D( speglingKarta, suv - vec2( d.x, d.y ), mip ).rgb
            + texture2D( speglingKarta, suv + vec2( d.x, -d.y ), mip ).rgb + texture2D( speglingKarta, suv - vec2( d.x, -d.y ), mip ).rgb ) * 0.16;
        sp = min( sp, vec3( 1.4 ) ); // heta punkter (ljuslister) blir inte blockiga fläckar i glöden
        float nv = saturate( dot( normalize( vViewPosition ), normal ) );
        float fr = 0.07 + 0.93 * pow( 1.0 - nv, 5.0 );
        outgoingLight += sp * fr * speglingStyrka;
      }
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'bordspegel';
  material.needsUpdate = true;
  let behovs = true;
  s.ram(() => { behovs = true; });
  s.storlek((w, h) => {
    const pr = renderer.getPixelRatio();
    const rb = Math.max(2, Math.round(w * pr * 0.5)), rh = Math.max(2, Math.round(h * pr * 0.5));
    rt.setSize(rb, rh);
    uni.speglingSteg.value.set(1.2 / rb, 1.2 / rh);
  });
  yta.onBeforeRender = (r, scene, cam) => {
    if (!behovs || cam !== camera) return;
    behovs = false;
    // spegelkameran: kamerans position och blickriktning speglade i skivans plan
    kamPos.setFromMatrixPosition(cam.matrixWorld);
    vy.subVectors(punkt, kamPos);
    if (vy.dot(normal) > 0) return;
    vy.reflect(normal).negate().add(punkt);
    rot.extractRotation(cam.matrixWorld);
    blick.set(0, 0, -1).applyMatrix4(rot).add(kamPos);
    mal.subVectors(punkt, blick).reflect(normal).negate().add(punkt);
    kam.position.copy(vy);
    kam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    kam.lookAt(mal);
    kam.far = cam.far;
    kam.updateMatrixWorld();
    kam.projectionMatrix.copy(cam.projectionMatrix);
    matris.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matris.multiply(kam.projectionMatrix).multiply(kam.matrixWorldInverse);
    // snett närplan: inget under skivan kommer med i spegeln
    plan.setFromNormalAndCoplanarPoint(normal, punkt).applyMatrix4(kam.matrixWorldInverse);
    klipp.set(plan.normal.x, plan.normal.y, plan.normal.z, plan.constant);
    const p = kam.projectionMatrix.elements;
    q.x = (Math.sign(klipp.x) + p[8]) / p[0];
    q.y = (Math.sign(klipp.y) + p[9]) / p[5];
    q.z = -1;
    q.w = (1 + p[10]) / p[14];
    klipp.multiplyScalar(2 / klipp.dot(q));
    p[2] = klipp.x; p[6] = klipp.y; p[10] = klipp.z + 1 - 0.003; p[14] = klipp.w;
    // rita spegelbilden (skuggorna räknas inte om)
    yta.visible = false;
    const forraMal = r.getRenderTarget(); const forraSkugga = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt);
    r.state.buffers.depth.setMask(true);
    if (r.autoClear === false) r.clear();
    r.render(scene, kam);
    r.shadowMap.autoUpdate = forraSkugga;
    r.setRenderTarget(forraMal);
    yta.visible = true;
  };
}

/* ---- ritning av texturer ------------------------------------------------------------------------ */
function ritaMarmor(ctx, b, h) {
  const r = slump(41);
  ctx.fillStyle = '#0b131b'; ctx.fillRect(0, 0, b, h);
  for (let i = 0; i < 110; i++) {
    const x = r() * b, y = r() * h, rad = 30 + r() * 200; const ljus = r() < 0.55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, ljus ? `rgba(64,86,106,${0.05 + r() * 0.08})` : `rgba(2,5,9,${0.12 + r() * 0.14})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const ader = [];
  const adra = (x, y, vinkel, steg, bredd, alfa, niva) => {
    const pts = [[x, y]];
    for (let i = 0; i < steg; i++) {
      vinkel += (r() - 0.5) * 0.2 + Math.sin(i * 0.09) * 0.025;
      x += Math.cos(vinkel) * 6; y += Math.sin(vinkel) * 6; pts.push([x, y]);
      if (niva < 2 && r() < 0.014) adra(x, y, vinkel + (r() < 0.5 ? 1 : -1) * (0.45 + r() * 0.8), (steg * (0.2 + r() * 0.3)) | 0, bredd * 0.55, alfa * 0.8, niva + 1);
    }
    ader.push({ pts, bredd, alfa });
  };
  for (let i = 0; i < 5; i++) adra(-30 + r() * b * 0.25, r() * h, -0.5 + r() * 0.45, 230, 1.3 + r() * 1.6, 0.32 + r() * 0.36, 0);
  for (let i = 0; i < 4; i++) adra(r() * b, -20, 1.2 + r() * 0.6, 120, 0.9, 0.25, 1);
  for (let i = 0; i < 16; i++) adra(r() * b, r() * h, r() * TAU, (24 + r() * 50) | 0, 0.5, 0.08 + r() * 0.12, 2);
  // varje åder ritas i korta bitar med bredd och styrka som andas längs vägen (som i riktig marmor)
  const lager = (skala, alfaSkala) => {
    const c = document.createElement('canvas'); c.width = b; c.height = h; const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    for (const a of ader) {
      const fas = r() * 10;
      for (let k = 1; k < a.pts.length; k++) {
        const v = 0.5 + 0.5 * Math.sin(k * 0.07 + fas) * Math.sin(k * 0.023 + fas * 2);
        x.lineWidth = a.bredd * skala * (0.35 + 1.1 * v);
        x.strokeStyle = `rgba(208,218,226,${Math.min(1, a.alfa * alfaSkala * (0.3 + 0.9 * v))})`;
        x.beginPath(); x.moveTo(a.pts[k - 1][0], a.pts[k - 1][1]); x.lineTo(a.pts[k][0], a.pts[k][1]); x.stroke();
      }
    }
    return c;
  };
  ctx.save(); ctx.filter = 'blur(10px)'; ctx.drawImage(lager(7, 0.12), 0, 0); ctx.filter = 'blur(2.5px)'; ctx.drawImage(lager(2.2, 0.22), 0, 0); ctx.restore();
  ctx.drawImage(lager(0.8, 0.36), 0, 0);
}
function ritaValnot(ctx, b, h) {
  const r = slump(9);
  ctx.fillStyle = '#3a2416'; ctx.fillRect(0, 0, b, h);
  for (let y = 0; y < h; y++) {
    const v = Math.sin(y * 0.07 + Math.sin(y * 0.011) * 5) * 0.5 + 0.5;
    ctx.fillStyle = `hsla(24, 40%, ${13 + v * 13 + r() * 3}%, ${0.4 + r() * 0.25})`; ctx.fillRect(0, y, b, 1);
  }
  for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(20,10,4,${r() * 0.35})`; ctx.fillRect(r() * b, r() * h, 2 + r() * 14, 1); }
}
function ritaKort(ctx, b, h, namn, nr, tot) {
  const g = ctx.createLinearGradient(0, 0, b, h); g.addColorStop(0, '#1a3a59'); g.addColorStop(0.55, '#0f2438'); g.addColorStop(1, '#091520');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
  const sk = ctx.createRadialGradient(b * 0.88, h * 0.08, 0, b * 0.88, h * 0.08, b * 0.62);
  sk.addColorStop(0, 'rgba(126,224,195,.32)'); sk.addColorStop(1, 'rgba(126,224,195,0)'); ctx.fillStyle = sk; ctx.fillRect(0, 0, b, h);
  ctx.fillStyle = '#7ee0c3'; ctx.font = '700 20px Manrope, sans-serif';
  ctx.fillText(`${String(nr).padStart(2, '0')} / ${String(tot).padStart(2, '0')}`, 34, 52);
  ctx.fillStyle = '#ffffff'; ctx.font = '600 42px Poppins, sans-serif';
  radbryt(ctx, namn, 34, 130, b - 70, 48, 3);
  ctx.fillStyle = 'rgba(167,210,255,.6)'; ctx.font = '600 14px Poppins, sans-serif';
  try { ctx.letterSpacing = '3px'; } catch (err) { /* äldre webbläsare */ }
  ctx.fillText('UPERFORMANCE', 34, h - 34);
  try { ctx.letterSpacing = '0px'; } catch (err) { /* äldre webbläsare */ }
  ritaU(ctx, b - 54, h - 46, 38, 'rgba(167,210,255,.85)');
  ctx.strokeStyle = 'rgba(167,210,255,.2)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, b - 2, h - 2);
}
function ritaSkarm(ctx, b, h, tid, kund) {
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1d30'); g.addColorStop(1, '#06121e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
  const sk = ctx.createRadialGradient(b * 0.85, 0, 0, b * 0.85, 0, b * 0.7); sk.addColorStop(0, 'rgba(126,224,195,.2)'); sk.addColorStop(1, 'rgba(126,224,195,0)'); ctx.fillStyle = sk; ctx.fillRect(0, 0, b, h);
  ritaU(ctx, 46, 46, 38, '#7ee0c3');
  ctx.fillStyle = '#ffffff'; ctx.font = '600 30px Poppins, sans-serif'; ctx.fillText('Hälsoprofil', 78, 56);
  ctx.fillStyle = 'rgba(246,244,239,.6)'; ctx.font = '600 17px Manrope, sans-serif';
  ctx.fillText(kund || 'Idrottsmedicinska tester', 80, 82);
  const puls = 0.5 + 0.5 * Math.sin(tid * 4);
  ctx.fillStyle = `rgba(126,224,195,${0.45 + 0.55 * puls})`; ctx.beginPath(); ctx.arc(b - 92, 44, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7ee0c3'; ctx.font = '700 16px Manrope, sans-serif'; ctx.fillText('LIVE', b - 78, 50);
  // pulskurvan med svepande markör (som en monitor)
  const px = 30, py = 104, pb = b - 60, ph = 150;
  ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.strokeStyle = 'rgba(126,224,195,.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(px, py, pb, ph, 16); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(167,210,255,.08)'; ctx.lineWidth = 1;
  for (let x = px + 24; x < px + pb; x += 24) { ctx.beginPath(); ctx.moveTo(x, py + 8); ctx.lineTo(x, py + ph - 8); ctx.stroke(); }
  const svep = ((tid * 0.32) % 1) * pb;
  ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, pb, ph, 16); ctx.clip();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // glöd utan shadowBlur (billigt): bred genomskinlig linje under en smal
  const kurva = (fran, till, fas, alfa) => {
    ctx.beginPath();
    for (let x = fran; x <= till; x += 2) { const y = py + ph * 0.66 - ekg(x / 150 + fas) * ph * 0.52; if (x === fran) ctx.moveTo(px + x, y); else ctx.lineTo(px + x, y); }
    ctx.strokeStyle = `rgba(126,224,195,${alfa * 0.16})`; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = `rgba(126,224,195,${alfa * 0.3})`; ctx.lineWidth = 6.5; ctx.stroke();
    ctx.strokeStyle = `rgba(160,240,215,${alfa})`; ctx.lineWidth = 3; ctx.stroke();
  };
  const fasNy = Math.floor(tid * 0.32) * (pb / 150);
  kurva(0, Math.max(2, svep), fasNy, 1);
  if (svep + 26 < pb) kurva(Math.ceil(svep + 26), pb, fasNy - pb / 150, 0.32);
  ctx.fillStyle = '#e8fff8';
  ctx.beginPath(); ctx.arc(px + svep, py + ph * 0.66 - ekg(svep / 150 + fasNy) * ph * 0.52, 5, 0, TAU); ctx.fill();
  ctx.restore();
  // testbatteriet (namn, inga värden)
  const TEST = ['Blodprov', 'EKG', 'Rörlighet', 'Styrka', 'Kondition', 'Agility'];
  ctx.font = '600 21px Manrope, sans-serif';
  TEST.forEach((namn, i) => {
    const kb = (pb + 12) / 3 - 12;
    const kx = px + (i % 3) * (kb + 12), ky = py + ph + 20 + Math.floor(i / 3) * 58;
    ctx.fillStyle = 'rgba(126,224,195,.07)'; ctx.strokeStyle = 'rgba(126,224,195,.22)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(kx, ky, kb, 46, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7ee0c3'; ctx.beginPath(); ctx.arc(kx + 22, ky + 23, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(214,232,240,.72)'; ctx.fillText(namn, kx + 38, ky + 30);
  });
}
function ritaUrtavla(ctx, b) {
  const c = b / 2; const R = b / 2;
  const g = ctx.createRadialGradient(c, c * 0.8, 0, c, c, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.85, '#eef2f5'); g.addColorStop(1, '#cfd8e0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, b);
  ctx.save(); ctx.translate(c, c);
  for (let i = 0; i < 300; i++) {
    const a = (i / 300) * TAU - PI / 2; const stor = i % 25 === 0, mellan = i % 5 === 0;
    const r1 = R - 10, r2 = r1 - (stor ? 30 : mellan ? 18 : 9);
    ctx.strokeStyle = stor ? '#0b1520' : mellan ? '#1d2a38' : 'rgba(29,42,56,.65)'; ctx.lineWidth = stor ? 4 : mellan ? 2.4 : 1.2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke();
  }
  ctx.fillStyle = '#0b1520'; ctx.font = '600 32px Poppins, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * TAU - PI / 2; ctx.fillText(String(i * 5), Math.cos(a) * (R - 74), Math.sin(a) * (R - 74)); }
  ctx.strokeStyle = '#7ee0c3'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R - 7, -PI / 2, -PI / 2 + TAU / 12); ctx.stroke();
  ritaU(ctx, 0, -78, 44, '#183653');
  ctx.fillStyle = '#183653'; ctx.font = '600 15px Poppins, sans-serif'; ctx.fillText('UPERFORMANCE', 0, -38);
  ctx.translate(0, 98); // liten urtavla för minuterna
  ctx.strokeStyle = 'rgba(11,21,32,.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.stroke();
  for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU - PI / 2; const l = i % 5 === 0 ? 10 : 5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 48); ctx.lineTo(Math.cos(a) * (48 - l), Math.sin(a) * (48 - l)); ctx.stroke(); }
  ctx.restore();
}
function ritaOffert(ctx, b, h, info) {
  // stor typografi: kundens namn och offertvärdet ska gå att läsa på bordet
  ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, b, h);
  ritaU(ctx, 66, 66, 52, '#183653');
  ctx.fillStyle = '#183653'; ctx.font = '600 28px Poppins, sans-serif'; ctx.fillText('Uperformance', 104, 76);
  ctx.textAlign = 'right'; ctx.fillStyle = '#0f6e57'; ctx.font = '800 20px Manrope, sans-serif'; ctx.fillText('OFFERT', b - 40, 74); ctx.textAlign = 'left';
  ctx.fillStyle = '#7ee0c3'; ctx.fillRect(40, 112, b - 80, 6);
  let y = 196;
  ctx.fillStyle = '#0b1520'; ctx.font = '700 58px Poppins, sans-serif';
  if (info.kund) {
    y = radbryt(ctx, info.kund, 40, y, b - 80, 62, 2);
    if (info.titel) { ctx.fillStyle = 'rgba(11,21,32,.66)'; ctx.font = '600 27px Manrope, sans-serif'; y = radbryt(ctx, info.titel, 40, y + 4, b - 80, 34, 2); }
  } else {
    ctx.fillText('Offert', 40, y); y += 26;
    ctx.fillStyle = '#d6dde4'; ctx.fillRect(40, y, 300, 16); y += 34;
  }
  y = Math.max(y + 18, 340);
  const vB = [250, 190, 280, 210], hB = [90, 70, 100, 80];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#e1e6eb'; ctx.fillRect(40, y + i * 52, b - 80, 2);
    ctx.fillStyle = '#c6cfd8'; ctx.fillRect(40, y + i * 52 + 18, vB[i], 13); ctx.fillRect(b - 40 - hB[i], y + i * 52 + 18, hB[i], 13);
  }
  y += 4 * 52 + 14;
  ctx.fillStyle = '#0b1520'; ctx.fillRect(40, y, b - 80, 4); y += 70;
  if (info.varde) {
    ctx.fillStyle = 'rgba(11,21,32,.66)'; ctx.font = '700 24px Manrope, sans-serif'; ctx.fillText('Offertvärde', 40, y - 30);
    ctx.textAlign = 'right'; ctx.fillStyle = '#0b1520'; ctx.font = '700 60px Poppins, sans-serif'; ctx.fillText(info.varde, b - 40, y + 26); ctx.textAlign = 'left';
    ctx.fillStyle = '#7ee0c3'; ctx.fillRect(b - 40 - Math.min(b - 80, ctx.measureText(info.varde).width), y + 40, Math.min(b - 80, ctx.measureText(info.varde).width), 6);
  } else { ctx.fillStyle = '#7ee0c3'; ctx.fillRect(40, y - 16, 200, 16); ctx.fillStyle = '#0b1520'; ctx.fillRect(b - 40 - 150, y - 20, 150, 22); }
  ctx.strokeStyle = 'rgba(11,21,32,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(40, h - 64); ctx.lineTo(300, h - 64); ctx.stroke();
  ctx.fillStyle = 'rgba(11,21,32,.55)'; ctx.font = '700 18px Manrope, sans-serif'; ctx.fillText('Signatur', 40, h - 36);
}

/* ---- fotbollens geometri: 12 svarta femhörningar + 20 vita sexhörningar, pressade mot en sfär med sömmar */
function fotbollGeometrier(R, delar) {
  const ico = new THREE.IcosahedronGeometry(1, 0); const pos = ico.getAttribute('position');
  const horn = []; const index = new Map(); const ytor = [];
  for (let i = 0; i < pos.count; i += 3) {
    const f = [];
    for (let j = 0; j < 3; j++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i + j); const k = v.toArray().map((x) => x.toFixed(3)).join(',');
      if (!index.has(k)) { index.set(k, horn.length); horn.push(v); }
      f.push(index.get(k));
    }
    ytor.push(f);
  }
  ico.dispose();
  const grannar = horn.map(() => new Set());
  for (const [a, b, c] of ytor) { grannar[a].add(b).add(c); grannar[b].add(a).add(c); grannar[c].add(a).add(b); }
  const P = (a, b, t) => horn[a].clone().lerp(horn[b], t);
  const polygoner = [];
  horn.forEach((v, i) => {
    const n = [...grannar[i]]; const axel = v.clone().normalize();
    const ref = horn[n[0]].clone().sub(v); ref.sub(axel.clone().multiplyScalar(ref.dot(axel))).normalize();
    const ref2 = new THREE.Vector3().crossVectors(axel, ref);
    const vinkel = (j) => { const d = horn[j].clone().sub(v); return Math.atan2(d.dot(ref2), d.dot(ref)); };
    n.sort((x, y) => vinkel(x) - vinkel(y));
    polygoner.push({ pts: n.map((j) => P(i, j, 1 / 3)), svart: true });
  });
  for (const [a, b, c] of ytor) polygoner.push({ pts: [P(a, b, 1 / 3), P(a, b, 2 / 3), P(b, c, 1 / 3), P(b, c, 2 / 3), P(c, a, 1 / 3), P(c, a, 2 / 3)], svart: false });
  const T = [0, 0.3, 0.55, 0.72, 0.83, 0.9, 0.945, 0.975, 1];
  const djup = 0.028;
  const samla = { vit: { pos: [], nor: [], idx: [] }, svart: { pos: [], nor: [], idx: [] } };
  const q = new THREE.Vector3();
  for (const poly of polygoner) {
    const k = poly.pts.length; const C = new THREE.Vector3(); poly.pts.forEach((p) => C.add(p)); C.divideScalar(k);
    const n0 = new THREE.Vector3().subVectors(poly.pts[0], C).cross(new THREE.Vector3().subVectors(poly.pts[1], C));
    if (n0.dot(C) < 0) poly.pts.reverse(); // moturs sett utifrån
    const B = [];
    for (let i = 0; i < k; i++) for (let sI = 0; sI < delar; sI++) B.push(poly.pts[i].clone().lerp(poly.pts[(i + 1) % k], sI / delar));
    const K = B.length; const p = []; const ix = [];
    for (const t of T) {
      const fur = djup * (klamp((t - 0.84) / 0.16) ** 1.7);
      for (let j = 0; j < K; j++) { q.copy(C).lerp(B[j], t).normalize().multiplyScalar(R * (1 - fur)); p.push(q.x, q.y, q.z); }
    }
    for (let r = 0; r < T.length - 1; r++) for (let j = 0; j < K; j++) {
      const a = r * K + j, b = r * K + ((j + 1) % K), c = (r + 1) * K + ((j + 1) % K), d = (r + 1) * K + j;
      ix.push(a, d, c, a, c, b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
    const mal = poly.svart ? samla.svart : samla.vit; const bas = mal.pos.length / 3;
    for (const x of p) mal.pos.push(x);
    for (const x of g.getAttribute('normal').array) mal.nor.push(x);
    for (const x of ix) mal.idx.push(x + bas);
    g.dispose();
  }
  return [samla.vit, samla.svart].map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3)); g.setIndex(m.idx);
    return g;
  });
}

/* ---- montering ---------------------------------------------------------------------------------- */
// Val i formuläret (kund/affär) eller klick på en plats → läs om valet direkt (scenen kollar också själv två gånger i sekunden)
let lyssnar = false;
function lyssna() {
  if (lyssnar) return; lyssnar = true;
  const las = () => setTimeout(() => { const s = motor.scen; if (s && s.mote) s.mote.las(); }, 40);
  document.addEventListener('change', (ev) => { if (ev.target && ev.target.matches && ev.target.matches('[data-mote-kund], [data-mote-affar]')) las(); });
  document.addEventListener('click', (ev) => { if (ev.target && ev.target.closest && ev.target.closest('[data-motescen] [data-ms="plats"]')) las(); });
}

export function montera(rum) {
  if (!rum || !webglFinns()) return { avmontera() {} };
  const sek = rum.closest('[data-motescen]');
  let slappt = false;
  if (sek) sek.setAttribute('data-ms-3d', '');
  lyssna();
  const kor = () => {
    if (slappt || !rum.isConnected) return;
    let s = null;
    try { s = motor.montera(rum); } catch (err) { console.error('[scen-mote] kunde inte bygga scenen:', err); s = null; }
    if (!s) { if (sek) sek.removeAttribute('data-ms-3d'); return; }
    // första bygget sker i etapper – rummet kopplas när scenen är byggd (vid omritning är den redan det)
    s.byggd.then(() => {
      if (slappt || !rum.isConnected) return;
      if (s.forstord || !s.mote) { if (sek && !motor.scen) sek.removeAttribute('data-ms-3d'); return; }
      s.mote.koppla(rum, sek);
    });
  };
  laddaCss('./scen-mote.css?v=3').then(() => {
    if (slappt || !rum.isConnected) return;
    // Finns scenen flyttas canvasen direkt; annars byggs den först när vyn har hunnit visas (låser aldrig sidan)
    if (motor.scen) kor(); else requestAnimationFrame(() => setTimeout(kor, 0));
  });
  return { avmontera() { slappt = true; motor.vila(); } };
}
