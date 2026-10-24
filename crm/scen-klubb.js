/* Uperformance CRM – Klubbmotorn i 3D: hjältesektionen först i vyn på #/klubbmotorn.

   En arkitektmodell på ett runt podium i svart pianolack (spegelblank ovansida, tjock lackad kant, infälld fot med
   ljuslist som lyser ned mot "golvet"). Runt Uperformance-märket i mitten står klubbarna i en ring:
     - arenan (gräsplan eller is efter klubbens bransch): fotboll med läktare, halvgenomskinliga tak, strålkastarmaster,
       rullande LED-skyltar och storbildsskärm; ishall med is, sarg, läktarskål, takbågar i borstad metall och glas över
       den bortre halvan (genomskärning) och en kub med skärmar,
     - klubbens partnernätverk som ett tätt stadskvarter på en egen sockel med gator: introducerade partnerföretag
       (kunder med viaKlubb) är glastorn i statusfärg, resten av nätverket (klubbavtal.partners) låga kvarter,
     - kassan (rökt glas med mässingsringar) mellan arenan och märket, med myntstaplar per status: utbetald (guld),
       att betala (glödande guld), upplupen (silver) och prognos (svävande, genomskinliga mynt).
   Ljusbågarna är loopen klubb → företag (introduktion) → Uperformance (affär) → klubbens kassa (provision, mynt).
   I översikten syns bara aktiva affärer och provisionen; vald klubb visar alla sina bågar.
   Allt räknas ur UPCRM.db med samma regler som crm.js (kickback/klubbStat) – inga påhittade tal. Tornens höjd följer
   företagets antal anställda.

   Kontrakt: scener.js (montera(vy) → { avmontera() }) och scen3d.js (varaktig/skapaScen). Stil: scen-klubb.css.
   Hjälten är kompakt (≈ 420 px på dator – kant i kant-läget i crm.css kan ge upp till 480 –, 300 px på mobil) och sammanfogad med vyns sidhuvud (.loop) till ett kort;
   den upprepar inte KPI-radens tal – beloppen per klubb står vid arenorna (mobil: i klubbknapparna).
   Hjältesektionen återanvänds mellan omritningar (samma element flyttas tillbaka först i #vy), så att varken
   WebGL-kontexten eller entréanimationerna startas om. Ändrad data → världen byggs om i samma kontext.
   Sidan låses aldrig av 3D: scenen skapas först efter att vyn ritats och byggs i etapper (byggScen är en generator,
   kor() pausar mellan etapperna); första 3D-bilden tonas in när allt är klart.
   Antalet ljus är konstant från första bilden (inga omkompileringar): arenorna har inga egna punktljus och
   strålkastaren för vald klubb finns hela tiden (styrka 0 när ingen är vald).
   Klick på en arena/ett kvarter (eller klubbknapparna) väljer klubben: podiet vrids som en skivspelare så att klubben
   kommer fram mot betraktaren, kameran går närmare (klubben i ytan till höger om texten), märket sjunker undan, resten
   dämpas, företagen får etiketter och textkolumnen visar klubbens tratt och provision med en knapp som scrollar till
   klubbkortet längre ned. */
import { varaktig, webglFinns, laddaCss, FARG, RoundedBoxGeometry } from './scen3d.js?v=5';

// Stilen laddas innan första monteringen (ingen blinkning med ostylad sektion)
const CSS_FIL = 'scen-klubb.css?v=12';
let cssKlar = false;
await Promise.race([laddaCss(CSS_FIL).then(() => { cssKlar = true; }), new Promise((r) => setTimeout(r, 2500))]);

/* 01-hjälpare -------------------------------------------------------------------------------------- */
const mq = (q) => { try { return matchMedia(q); } catch (err) { return { matches: false }; } };
const LUGN = mq('(prefers-reduced-motion: reduce)');
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sel = (v) => (window.CSS && CSS.escape ? CSS.escape(String(v ?? '')) : String(v ?? '').replace(/["\\]/g, (c) => '\\' + c));
// Samma format som crm.js (kr / krKort)
const kr = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('sv-SE') + ' kr');
const krKort = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 1 }) + ' Mkr' : n >= 1e4 ? Math.round(n / 1000).toLocaleString('sv-SE') + ' tkr' : kr(n));
const ik = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
const klamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const utKub = (x) => 1 - Math.pow(1 - x, 3);
const utBak = (x) => { const c = 1.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
function slump(fro = 1) {
  let a = fro >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const UTBETALNING = { kontant: 'Kontant', sponsorvarde: 'Värde i sponsorpaket', oklart: 'Ej bestämt' };
const STATUSAR = [
  { id: 'utbetald', namn: 'Utbetald', falt: 'utbetalt' },
  { id: 'att-betala', namn: 'Att betala', falt: 'attBetala' },
  { id: 'upplupen', namn: 'Upplupen', falt: 'upplupen' },
  { id: 'prognos', namn: 'Prognos', falt: 'prognos' },
];

/* 02-data: samma regler som crm.js (kickback, klubbStat) --------------------------------------------- */
function lasData() {
  const U = window.UPCRM;
  if (!U || !U.db) return null;
  const db = U.db;
  const kunder = Array.isArray(db.kunder) ? db.kunder : [];
  const affarer = Array.isArray(db.affarer) ? db.affarer : [];
  const projekt = Array.isArray(db.projekt) ? db.projekt : [];
  const kundAv = new Map(kunder.map((k) => [k.id, k]));
  const PROJ = typeof PROJSTEG !== 'undefined' ? PROJSTEG : [];
  const SALJ = typeof SALJSTEG !== 'undefined' ? SALJSTEG : [];
  const projIx = (id) => PROJ.findIndex((x) => x.id === id);
  const saljIx = (id) => SALJ.findIndex((x) => x.id === id);
  const vardeAv = (a) => { try { const v = U.affarVarde(a); return isFinite(v) ? v : 0; } catch (err) { return 0; } };

  // Klubbmotorn: klubbens procent av affärsvärdet (crm.js: kickback)
  // Frusen klubb och procent på signerade affärer (kickbackKlubb/kickbackProcent) som klubbFor/kickback i crm.js
  const klubbFor = (a) => { if (a.kickbackKlubb !== undefined) return a.kickbackKlubb; const k = kundAv.get(a.kundId); return (k && k.viaKlubb) || null; };
  const kickback = (a) => {
    if (!kundAv.get(a.kundId) || a.steg === 'forlorad') return null;
    const klId = klubbFor(a); if (!klId) return null;
    const kl = kundAv.get(klId); if (!kl || !kl.klubbavtal) return null;
    const procent = a.kickbackProcent != null ? a.kickbackProcent : kl.klubbavtal.procent;
    const belopp = Math.round(vardeAv(a) * (procent / 100)); // hela kronor, som kickback() i crm.js
    let status;
    if (a.steg !== 'signerad') status = 'prognos';
    else if (a.kickbackUtbetald) status = 'utbetald';
    else if (typeof U.orderMakulerad === 'function' && U.orderMakulerad(a)) status = 'prognos'; // makulerad order: provisionen vilar (crm.js)
    else {
      const p = projekt.find((x) => x.affarId === a.id);
      status = p && projIx(p.steg) >= projIx('uppfoljning') ? 'att-betala' : 'upplupen';
    }
    return { belopp, status };
  };

  const procent = Math.round((typeof KLUBBMOTORN !== 'undefined' && KLUBBMOTORN && KLUBBMOTORN.provision ? KLUBBMOTORN.provision : 0.1) * 100);
  const klubbar = kunder.filter((k) => k.typ === 'klubb' && k.klubbavtal).map((kl) => {
    const intro = kunder.filter((k) => k.viaKlubb === kl.id);
    const af = affarer.filter((a) => klubbFor(a) === kl.id);
    const vunnaAffarer = af.filter((a) => a.steg === 'signerad');
    const kb = af.map(kickback).filter(Boolean);
    const per = (s) => sum(kb.filter((x) => x.status === s).map((x) => x.belopp));
    const foretag = intro.map((k) => {
      const kaf = af.filter((a) => a.kundId === k.id);
      const signerad = kaf.some((a) => a.steg === 'signerad');
      const oppna = kaf.filter((a) => a.steg !== 'signerad' && a.steg !== 'forlorad').sort((a, b) => saljIx(b.steg) - saljIx(a.steg));
      const tillstand = signerad ? 'signerad' : oppna.length ? 'oppen' : kaf.length ? 'forlorad' : 'ingen';
      const kbs = kaf.map(kickback).filter(Boolean);
      const steg = oppna[0] ? (SALJ.find((x) => x.id === oppna[0].steg) || {}).namn || '' : '';
      return {
        id: k.id, namn: k.namn || '', anstallda: +k.anstallda || 0, tillstand,
        stegText: signerad ? 'Order signerad' : steg || (tillstand === 'forlorad' ? 'Förlorad' : 'Ingen affär än'),
        provision: sum(kbs.filter((x) => x.status !== 'prognos').map((x) => x.belopp)),
        prognos: sum(kbs.filter((x) => x.status === 'prognos').map((x) => x.belopp)),
      };
    });
    const r = {
      id: kl.id, namn: kl.namn || '', bransch: kl.bransch || '', stad: kl.stad || '',
      sedan: kl.klubbavtal.sedan || '', procent: +kl.klubbavtal.procent || 0, form: kl.klubbavtal.form || 'oklart',
      partners: +kl.klubbavtal.partners || 0, introducerade: intro.length,
      dialog: new Set(af.filter((a) => a.steg !== 'forlorad').map((a) => a.kundId)).size,
      vunna: new Set(vunnaAffarer.map((a) => a.kundId)).size,
      varde: sum(vunnaAffarer.map(vardeAv)),
      utbetalt: per('utbetald'), attBetala: per('att-betala'), upplupen: per('upplupen'), prognos: per('prognos'),
      antalPrognos: kb.filter((x) => x.status === 'prognos').length,
      sport: /hockey|bandy|skridsko|curling|konståkning/i.test(`${kl.bransch || ''} ${kl.namn || ''}`) ? 'is' : 'gras',
      foretag,
    };
    r.tillbaka = r.utbetalt + r.attBetala + r.upplupen;
    return r;
  });
  const tot = (f) => sum(klubbar.map((k) => k[f]));
  const d = {
    procent, klubbar,
    tot: {
      tillbaka: tot('tillbaka'), utbetalt: tot('utbetalt'), attBetala: tot('attBetala'), upplupen: tot('upplupen'), prognos: tot('prognos'),
      antalPrognos: tot('antalPrognos'), partners: tot('partners'), introducerade: tot('introducerade'), vunna: tot('vunna'), varde: tot('varde'),
    },
  };
  d.signatur = JSON.stringify(d);
  return d;
}

/* 03-hjältesektionen (HTML) ------------------------------------------------------------------------ */
// Kompakt (≈ 420 px på dator, 300 px på mobil) och sammanfogad med vyns sidhuvud (.loop) nedanför.
// Nyckeltalen står redan i vyns KPI-rad – hjälten upprepar dem inte (beloppen per klubb syns i modellen).
let hjalte = null;     // sektionen – återanvänds mellan omritningar
let data = null;       // senast lästa data
let vald = null;       // vald klubb-id
let lamnad = true;     // vyn har lämnats → nästa montera är ett nytt besök (entré)
let varld = null;      // 3D-tillståndet för den aktiva scenen
let introTimer = 0, markTimer = 0;

function skapaHjalte() {
  const el = document.createElement('section');
  el.className = 'kb3d';
  el.setAttribute('data-scen3d', 'klubb');
  el.setAttribute('aria-label', 'Klubbmotorn i 3D: klubbar, partnerföretag och provision');
  if (!cssKlar) {
    // Reserv om stilen dröjer
    el.style.cssText = 'height:400px;border-radius:30px;background:#0b1520;color:#f6f4ef;overflow:hidden;position:relative';
    laddaCss(CSS_FIL).then(() => { el.style.cssText = ''; });
  }
  el.innerHTML = `
    <div class="kb3d-scenruta">
      <div class="kb3d-duk" data-kb3d-duk></div>
      <div class="kb3d-slojan" aria-hidden="true"></div>
      <div class="kb3d-etiketter" data-kb3d-etiketter aria-hidden="true"></div>
    </div>
    <div class="kb3d-text">
      <div class="kb3d-topp">
        <span class="kb3d-overrubrik"><i class="kb3d-live" aria-hidden="true"></i>Klubbmotorn · live ur CRM:et</span>
        <h2 data-kb3d-rubrik></h2>
        <p class="kb3d-ingress" data-kb3d-ingress></p>
        <ol class="kb3d-steg" data-kb3d-steg></ol>
      </div>
      <div class="kb3d-panel" data-kb3d-panel><div class="kb3d-detalj" data-kb3d-detalj hidden></div></div>
      <div class="kb3d-klubbval" role="group" aria-label="Välj klubb i modellen (pilarna ← → byter, Esc visar alla)" data-kb3d-klubbval></div>
      <p class="kb3d-dold" aria-live="polite" data-kb3d-meddelande></p>
      <div class="kb3d-legend" aria-hidden="true">
        <span><i class="kb3d-mynt kb3d-mynt-utbetald"></i>Utbetald</span>
        <span><i class="kb3d-mynt kb3d-mynt-att-betala"></i>Att betala</span>
        <span><i class="kb3d-mynt kb3d-mynt-upplupen"></i>Upplupen</span>
        <span><i class="kb3d-mynt kb3d-mynt-prognos"></i>Prognos</span>
      </div>
    </div>`;

  el.addEventListener('click', (ev) => {
    const t = ev.target;
    const valj = t.closest('[data-kb3d-valj]');
    if (valj) { valjKlubb(valj.getAttribute('data-kb3d-valj') || null); return; }
    if (t.closest('[data-kb3d-stang]')) { valjKlubb(null); return; }
    const bladdra = t.closest('[data-kb3d-bladdra]');
    if (bladdra) { stegaKlubb(+bladdra.getAttribute('data-kb3d-bladdra')); return; }
    const visa = t.closest('[data-kb3d-visa]');
    if (visa) { visaKlubbkort(visa.getAttribute('data-kb3d-visa')); return; }
    if (t.closest('.kb3d-panel, .kb3d-klubbval, a, button, input, select')) return;
    if (!varld || !data) return;
    const ix = varld.plocka(ev.clientX, ev.clientY);
    if (ix >= 0) valjKlubb(varld.klubbar[ix].id);
    else if (vald) valjKlubb(null);
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && vald) { valjKlubb(null); ev.stopPropagation(); fokusVal(true); return; }
    if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.target.closest('input, textarea, select, [contenteditable]')) {
      ev.preventDefault(); stegaKlubb(ev.key === 'ArrowRight' ? 1 : -1); fokusVal(true);
    }
  });
  return el;
}

const $h = (s) => hjalte && hjalte.querySelector(s);

function uppdateraHjalte(d, nyttBesok) {
  const p = d.procent;
  $h('[data-kb3d-rubrik]').innerHTML = `Klubben öppnar dörren.<br><em>${e(p)} % går tillbaka.</em>`;
  // Så fungerar det – tre steg med samma nummer som märkena i modellen (tornet, märket i mitten, kassan)
  $h('[data-kb3d-ingress]').textContent = d.klubbar.length
    ? 'Så tjänar klubben pengar – räknat direkt ur CRM:et:'
    : 'Inga klubbar har ett Klubbmotorn-avtal ännu. När en klubb får avtal byggs den in i modellen.';
  $h('[data-kb3d-steg]').innerHTML = d.klubbar.length ? [
    ['Klubben tipsar ett partnerföretag', 'tornen vid arenan'],
    ['Företaget blir kund hos Uperformance', d.tot && d.tot.varde ? `märket i mitten · ${krKort(d.tot.varde)} vunnet via klubbar` : 'märket i mitten'],
    [`${p} % av ordern går tillbaka till klubben`, 'mynten i kassan'],
  ].map(([t, var_], i) => `<li><b>${i + 1}</b><span>${e(t)}<small>${e(var_)}</small></span></li>`).join('') : '';
  $h('[data-kb3d-klubbval]').innerHTML = (d.klubbar.length > 1 ? `<button type="button" class="kb3d-val kb3d-val-alla" data-kb3d-valj="" aria-pressed="${!vald}" title="Alla klubbar">Alla</button>` : '') + d.klubbar.map((k) =>
    `<button type="button" class="kb3d-val" data-kb3d-valj="${e(k.id)}" aria-pressed="${vald === k.id}"><i class="kb3d-val-prick kb3d-val-${k.sport}" aria-hidden="true"></i>${e(k.namn)}<span class="kb3d-val-belopp">${e(krKort(k.tillbaka))}<span class="kb3d-dold"> tillbaka</span></span></button>`).join('');
  ritaDetalj(d);
  if (nyttBesok) {
    hjalte.setAttribute('data-intro', '');
    clearTimeout(introTimer);
    introTimer = setTimeout(() => hjalte && hjalte.removeAttribute('data-intro'), 2600);
  }
}

function ritaDetalj(d) {
  const ruta = $h('[data-kb3d-detalj]');
  const k = vald ? d.klubbar.find((x) => x.id === vald) : null;
  hjalte.toggleAttribute('data-vald', !!k);
  hjalte.querySelectorAll('[data-kb3d-klubbval] [data-kb3d-valj]').forEach((b) => b.setAttribute('aria-pressed', String(k ? b.getAttribute('data-kb3d-valj') === k.id : b.getAttribute('data-kb3d-valj') === '')));
  hjalte.querySelectorAll('.kb3d-pin-klubb').forEach((b) => b.toggleAttribute('data-vald', !!k && b.getAttribute('data-kb3d-valj') === k.id));
  const lager = $h('[data-kb3d-etiketter]'); if (lager) lager.toggleAttribute('data-vald', !!k);
  if (!k) { ruta.hidden = true; ruta.innerHTML = ''; return; }
  const sedan = (() => { const dt = new Date(k.sedan); return isNaN(dt) ? '' : dt.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' }); })();
  const max = Math.max(1, k.partners, k.introducerade);
  const steg = [[k.partners, 'partners'], [k.introducerade, 'introducerade'], [k.dialog, 'i dialog'], [k.vunna, 'med avtal']];
  ruta.innerHTML = `
    <div class="kb3d-detalj-topp">
      <span class="kb3d-detalj-ikon kb3d-ikon-${k.sport}">${ik('klubb')}</span>
      <div class="kb3d-detalj-namn"><strong>${e(k.namn)}</strong><small>${e([k.bransch, k.stad].filter(Boolean).join(' · '))}${sedan ? ` · avtal sedan ${e(sedan)}` : ''}</small></div>
      ${d.klubbar.length > 1 ? `<span class="kb3d-bladdra"><button type="button" data-kb3d-bladdra="-1" aria-label="Föregående klubb">${ik('pil')}</button><span>${d.klubbar.indexOf(k) + 1} / ${d.klubbar.length}</span><button type="button" data-kb3d-bladdra="1" aria-label="Nästa klubb">${ik('pil')}</button></span>` : ''}
      <button type="button" class="kb3d-stang" data-kb3d-stang aria-label="Tillbaka till alla klubbar">${ik('stang')}</button>
    </div>
    <ol class="kb3d-tratt" aria-label="Partnernätverket">${steg.map(([n, t], i) => `<li style="--andel:${Math.max(0.05, n / max).toFixed(3)};--i:${i}"><b>${e(n)}</b><span>${t}</span></li>`).join('')}</ol>
    <dl class="kb3d-status">${STATUSAR.map((s) => `<div class="${k[s.falt] ? '' : 'kb3d-noll'}"><dt><i class="kb3d-mynt kb3d-mynt-${s.id}" aria-hidden="true"></i>${s.namn}</dt><dd>${e(kr(k[s.falt]))}</dd></div>`).join('')}</dl>
    <p class="kb3d-detalj-fot">${e(k.procent)} % av affärsvärdet · ${e(UTBETALNING[k.form] || 'Ej bestämt')} · ${e(kr(k.varde))} i vunna affärer</p>
    <div class="kb3d-knappar">
      <button type="button" class="kb3d-knapp" data-kb3d-visa="${e(k.id)}">${ik('pil')}Visa klubbkortet</button>
      <a class="kb3d-knapp kb3d-knapp-spok" href="#/kund/${e(k.id)}">Öppna klubb</a>
    </div>`;
  ruta.hidden = false;
  if (ruta.dataset.klubb !== k.id) { ruta.dataset.klubb = k.id; ruta.style.animation = 'none'; void ruta.offsetWidth; ruta.style.animation = ''; }
}

function valjKlubb(id) {
  if (!data) return;
  const fore = vald;
  vald = id && data.klubbar.some((k) => k.id === id) ? id : null;
  ritaDetalj(data);
  if (varld) varld.valj(vald);
  if (fore !== vald) {
    const k = vald && data.klubbar.find((x) => x.id === vald);
    const med = $h('[data-kb3d-meddelande]');
    if (med) med.textContent = k ? `${k.namn} vald: ${k.introducerade} företag introducerade, ${kr(k.tillbaka)} i provision.` : 'Alla klubbar visas.';
    // det valda chipet syns i raden (den kan skrollas i sidled)
    const chip = hjalte && hjalte.querySelector(`[data-kb3d-klubbval] [data-kb3d-valj="${sel(vald || '')}"]`);
    if (chip) { const rad = chip.parentElement, rr = rad.getBoundingClientRect(), cr = chip.getBoundingClientRect(); // bara i sidled – textkolumnen får aldrig skrollas
      if (cr.left < rr.left) rad.scrollLeft -= rr.left - cr.left + 8; else if (cr.right > rr.right) rad.scrollLeft += cr.right - rr.right + 8; }
  }
}
// ← → och Esc fungerar också när inget annat har fokus (sidan) och hjälten syns – då byter man klubb direkt utan att först klicka
document.addEventListener('keydown', (ev) => {
  if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || !hjalte || !hjalte.isConnected || !data || !data.klubbar.length) return;
  if (document.activeElement && document.activeElement !== document.body) return;
  const r = hjalte.getBoundingClientRect(); if (r.bottom < 80 || r.top > innerHeight - 80) return;
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); stegaKlubb(ev.key === 'ArrowRight' ? 1 : -1); }
  else if (ev.key === 'Escape' && vald) valjKlubb(null);
});
// nästa/föregående klubb (runt om); utan vald klubb börjar ← på den sista och → på den första
function stegaKlubb(steg) {
  if (!data || !data.klubbar.length) return;
  const n = data.klubbar.length, i = vald ? data.klubbar.findIndex((k) => k.id === vald) : (steg > 0 ? -1 : n);
  valjKlubb(data.klubbar[(((i + steg) % n) + n) % n].id);
}
// tangentbordet: fokus följer med till det valda chipet (panelen ritas om och knappen man stod på försvinner)
function fokusVal(tvinga) {
  const chip = hjalte && hjalte.querySelector(`[data-kb3d-klubbval] [aria-pressed="true"]`);
  if (chip && (tvinga || hjalte.contains(document.activeElement))) chip.focus({ preventScroll: true });
}

function visaKlubbkort(id) {
  const vy = document.getElementById('vy');
  const lank = vy && vy.querySelector(`.klubbkort a[href="#/kund/${sel(id)}"]`);
  const kort = lank && lank.closest('.klubbkort');
  if (!kort) return;
  kort.scrollIntoView({ behavior: LUGN.matches ? 'auto' : 'smooth', block: 'center' });
  kort.removeAttribute('data-kb3d-markerad'); void kort.offsetWidth; kort.setAttribute('data-kb3d-markerad', '');
  clearTimeout(markTimer);
  markTimer = setTimeout(() => kort.removeAttribute('data-kb3d-markerad'), 2800);
}


/* 04-montering (kontraktet i scener.js) ------------------------------------------------------------ */
let trasig = false;  // byggfel: inga fler försök under sessionen (annars byggs scenen om vid varje omritning)
let startRaf = 0, startTid = 0; // väntande start av 3D-scenen (efter att vyn har ritats)
let senastScroll = 0; // scrolläget före en omritning (se montera)
try { senastScroll = scrollY; addEventListener('scroll', () => { senastScroll = scrollY; }, { passive: true }); } catch (err) { /* ingen window */ }

// Bygget körs i etapper (se byggScen): sidan ritas och svarar mellan etapperna, första 3D-bilden kommer när allt är klart
const motor = varaktig((s) => kor(byggScen(s), s).then((V) => {
  if (!V || s.forstord) return;
  varld = V;
  if (data && V.d !== data) { if (!V.d || V.d.signatur !== data.signatur) V.byggOm(data); else V.d = data; }
  V.valj(vald);
}, (err) => { felIScen(); throw err; }), {
  kamera: { fov: 30, position: [0, 7, 14], mal: [0, 0.3, 0], fjarran: 90 },
  parallax: [0.36, 0.22], andning: 0.05, exponering: 1.0, miljo: 0.42,
  bloom: { styrka: 0.5, radie: 0.42, troskel: 1.08 }, skuggomfang: 5.2,
  // premium (2026-10-23, "fixa ljuspixlarna"): MSAA i halvflyttal var dyrast på inbyggd grafik – FXAA och översampling på dator,
  // glöden i halv upplösning (i kvarts upplösning blev små ljusa reflexer fyrkantiga fläckar)
  msaa: matchMedia('(pointer: coarse)').matches ? 4 : 0, fxaa: true, bloomDel: 1,
  skarpa: (typeof innerWidth === 'number' && innerWidth > 1600) ? 1.25 : 1.5,
});

// Ger tillbaka kontrollen till webbläsaren mellan byggets etapper (rita, ta emot klick och scroll)
const paus = () => new Promise((r) => {
  try { if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') { globalThis.scheduler.yield().then(r, r); return; } } catch (err) { /* reserv nedan */ }
  setTimeout(r, 0);
});
async function kor(gen, s) {
  let r = gen.next();
  while (!r.done) {
    await paus();
    if (s.forstord) { try { gen.return(); } catch (err) { /* ok */ } return null; }
    r = gen.next();
  }
  return r.value;
}

// Byggfel: ingen hjälte med text men utan 3D, och inga nya försök vid varje omritning
function felIScen() {
  trasig = true;
  try { motor.forstor(); } catch (err) { /* redan städad */ }
  if (hjalte) hjalte.remove();
  hjalte = null; varld = null; data = null;
}

function kopplaScen(nyttBesok, andrad) {
  const duk = $h('[data-kb3d-duk]');
  if (!duk) return;
  const s = motor.montera(duk);
  if (!s) { hjalte.remove(); hjalte = null; return; }
  // scen3d sätter position:relative på värden om stilmallen inte hunnit laddas – positionen styrs av scen-klubb.css
  if (duk.style.position) duk.style.removeProperty('position');
  if (varld && varld.s === s) {
    if (andrad && varld.d !== data) varld.byggOm(data);
    else if (nyttBesok) varld.etiketterIgen();
    varld.valj(vald);
    varld.layoutIgen();
  }
}

function planeraStart() {
  if (startRaf || startTid) return;
  // Vyn får rita sin första bild innan 3D-scenen skapas och byggs
  startRaf = requestAnimationFrame(() => {
    startRaf = 0;
    startTid = setTimeout(() => {
      startTid = 0;
      if (trasig || lamnad || !hjalte || !hjalte.isConnected) return;
      try { kopplaScen(false, false); } catch (err) { felIScen(); console.error('[scen-klubb]', err); }
    }, 0);
  });
}
function avbrytStart() { cancelAnimationFrame(startRaf); clearTimeout(startTid); startRaf = 0; startTid = 0; }

export function montera(vy) {
  if (trasig || !webglFinns() || !window.UPCRM || !window.UPCRM.db) return { avmontera() {} };
  const nyData = lasData();
  if (!nyData) return { avmontera() {} };
  const nyttBesok = lamnad; lamnad = false;
  if (nyttBesok) vald = null;
  if (vald && !nyData.klubbar.some((k) => k.id === vald)) vald = null;
  if (!hjalte) hjalte = skapaHjalte();
  const annan = vy.querySelector(':scope > [data-scen3d="klubb"]');
  if (annan && annan !== hjalte) annan.remove();
  // Omritning: crm.js ritade vyn utan sektionen och återställde scrollen; webbläsarens scroll anchoring håller
  // läget när sektionen sätts tillbaka (som i översikten). Längst ned räcker det inte: utan sektionen var sidan
  // kortare, så scrollen klämdes – då återställs läget från FÖRE omritningen (senastScroll, passiv lyssnare; den
  // har ännu inte sett klämningen eftersom scroll-händelser kommer först vid nästa bildruta).
  const klamd = !nyttBesok && senastScroll > scrollY + 1 && scrollY >= document.documentElement.scrollHeight - innerHeight - 1;
  if (vy.firstElementChild !== hjalte) vy.prepend(hjalte);
  // sidhuvudet (.loop) direkt under: hjälten och sidhuvudet blir ett kort
  const nasta = hjalte.nextElementSibling;
  hjalte.toggleAttribute('data-sammanfogad', !!(nasta && nasta.classList.contains('loop')));
  if (klamd) scrollTo(0, senastScroll);
  const andrad = !data || data.signatur !== nyData.signatur;
  data = nyData;
  // omritning med samma data: texten står kvar (fokus i klubbknapparna tappas inte)
  if (andrad || nyttBesok) uppdateraHjalte(data, nyttBesok);
  if (motor.scen) {
    // scenen lever (omritning eller återbesök inom städtiden): canvasen flyttas direkt – inget nytt bygge
    try { kopplaScen(nyttBesok, andrad); } catch (err) { felIScen(); throw err; }
  } else planeraStart();
  return {
    avmontera() {
      lamnad = true;
      avbrytStart();
      motor.vila();
    },
  };
}

/* 05-3D: scenen ----------------------------------------------------------------------------------- */
const MAXK = 16;        // klubbar med egna vikter i ljusbågarnas shader
const KS = 1.22;        // kassans och myntens skala
const TOPP_D = 0.042;   // kvarterssockelns ovansida (tornen och kvarteren står på den)
const ELEV_FOKUS = 0.56;
const TILLSTAND = {
  signerad: { farg: FARG.mint, glas: 0xc9f5e7, ring: 2.2, golv: 0.95, tand: 0.82 },
  oppen: { farg: FARG.is, glas: 0xd6e8ff, ring: 1.5, golv: 0.75, tand: 0.62 },
  forlorad: { farg: FARG.rod, glas: 0xf2d6cf, ring: 0.8, golv: 0.45, tand: 0.3 },
  ingen: { farg: 0xffdcae, glas: 0xc6d2de, ring: 0.6, golv: 0.65, tand: 0.5 },
};
const ORDNING = { signerad: 0, oppen: 1, forlorad: 2, ingen: 3 };

// Generator: varje yield är en paus där webbläsaren får rita och svara (kor() i 04). Ombyggen körs synkront.
function* byggScen(s) {
  const { THREE } = s;
  // glöden får inte spridas från enstaka extremt ljusa reflexer (lack, krom, glas) – de blev ljusa pixlar och fyrkanter
  if (s.bloom) { const hp = s.bloom.materialHighPassFilter; hp.fragmentShader = hp.fragmentShader.replace('vec4( 64.0 )', 'vec4( 1.8 )'); hp.needsUpdate = true; }
  const V = {
    s, THREE, d: null, RP: 4.2, R: 2.6, rK: 1.35,
    klubbar: [], hitboxar: [], etiketter: [], torn: [], block: [], golv: [], paketBagar: [], vald: -1, hover: -1,
    t0: 0, introKlar: false, forstaBygget: true,
    kam: { mal: new THREE.Vector3(0, 0.3, 0), dist: 15, az: 0, elev: 0.6, init: false, basMal: null, basDist: 12, basElev: 0.6 },
    layout: { smal: false, textHoger: 0, w: 1, h: 1 },
    grupp: null, lag: s.kvalitet === 'lag', mobil: s.kvalitet === 'mobil', hog: s.kvalitet === 'hog',
    tmp: { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), sk: new THREE.Vector3(), y: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() },
    vikt: { klubb: new Float32Array(MAXK).fill(1), detalj: new Float32Array(MAXK), mark: new Float32Array(MAXK), alla: 1 },
    miljoFast: [], miljoVarld: [], spegelDolj: [],
    // vridskivan: vald klubb vrids fram mot betraktaren (hela världen roterar kring märket)
    vrid: 0, fokusLokal: new THREE.Vector3(),
  };
  s.vidForstor(() => { if (varld === V) varld = null; });

  /* Miljöreflexer per material: med bara scene.environment ignorerar three.js materialets envMapIntensity
     (scene.environmentIntensity gäller då) – därför sätts envMap uttryckligen där styrkan ska skilja sig.
     Rotationen följer scenens långsamt vridna miljö varje bildruta (ljuset glider över lack och metall). */
  V.miljo = (m, styrka, fast = false) => { m.envMap = s.scene.environment; m.envMapIntensity = styrka; (fast ? V.miljoFast : V.miljoVarld).push(m); return m; };

  /* Strålkastareffekt vid val: allt utanför den valda klubben dämpas mjukt (delade uniforms i alla material).
     Injektionen läggs på innan något kompileras, så inga program tillkommer när en klubb väljs. */
  V.dimmUni = { uKbFokus: { value: new THREE.Vector3() }, uKbDimm: { value: 1 }, uKbR: { value: new THREE.Vector2(2.4, 4.2) }, uKbSpegel: { value: 0 } };
  V.dimmFn = function kbDimm(sh) {
    if (!sh.fragmentShader.includes('#include <opaque_fragment>') || !sh.vertexShader.includes('#include <project_vertex>')) return;
    Object.assign(sh.uniforms, V.dimmUni);
    sh.vertexShader = 'varying vec3 vKbVarld;\n' + sh.vertexShader.replace('#include <project_vertex>', [
      '#include <project_vertex>',
      '\t{ vec4 kbP = vec4( transformed, 1.0 );',
      '#ifdef USE_INSTANCING',
      '\tkbP = instanceMatrix * kbP;',
      '#endif',
      '\tvKbVarld = ( modelMatrix * kbP ).xyz; }'].join('\n'));
    // uKbSpegel = 1 bara i spegelbilden: föremålen tonas ut med höjden, så att foten speglas tydligt och toppen knappt
    // (lacken visar var sakerna står – inga suddiga spökbilder av tornen och märket)
    sh.fragmentShader = 'uniform vec3 uKbFokus;\nuniform float uKbDimm;\nuniform vec2 uKbR;\nuniform float uKbSpegel;\nvarying vec3 vKbVarld;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight *= mix( uKbDimm, 1.0, 1.0 - smoothstep( uKbR.x, uKbR.y, distance( vKbVarld.xz, uKbFokus.xz ) ) );\n' +
      'if ( uKbSpegel > 0.5 ) { float kbH = max( vKbVarld.y, 0.0 ); outgoingLight *= exp( -kbH * 3.2 ) * 0.9 + 0.1 * exp( -kbH * 0.8 ); }\n#include <opaque_fragment>');
  };
  V.dimmbar = (rot) => {
    rot.traverse((o) => {
      const lista = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of lista) if (!m.isShaderMaterial && !m.isSpriteMaterial && !m.isShadowMaterial && !m.userData.kbEgen && m.onBeforeCompile !== V.dimmFn) m.onBeforeCompile = V.dimmFn;
    });
  };

  s.scene.fog = new THREE.FogExp2(FARG.ink, 0.016);
  if (s.ljus) {
    const L = s.ljus;
    L.himmel.intensity = 0.3;
    L.nyckel.intensity = 1.55; L.nyckel.color.set(0xfff0dc); L.nyckel.position.set(4.5, 10.5, 6.5);
    L.nyckel.shadow.intensity = 0.72;
    L.fyll.intensity = 0.36; L.fyll.position.set(-7, 4, 3);
    // kantljuset lågt bakifrån (annars en kraftig ljusfläck i den blanka ytan sett framifrån)
    L.kant.intensity = 1.05; L.kant.position.set(-5, 3.2, -9);
  }
  const varm = new THREE.DirectionalLight(0xff9a4a, 0.7); varm.position.set(8, 3.2, -7);
  s.scene.add(varm);
  // strålkastaren på vald klubb: finns från första bilden (konstant antal ljus), styrka 0 tills en klubb väljs
  V.spot = new THREE.SpotLight(0xffe6c8, 0, 11, 0.36, 0.75, 2);
  V.spot.position.set(0, 6, 2); V.spot.target.position.set(0, 0, 0);
  s.scene.add(V.spot, V.spot.target);

  yield;
  // gemensamma texturer och material (finns kvar mellan ombyggen)
  V.tex = byggTexturer(V);
  yield;
  V.rutnat = s.canvasTextur(1024, 1024, (ctx, b, h) => ritaRutnat(ctx, b, h, V));
  yield;
  V.flodeMat = s.stada(flodesMaterial(THREE, V));
  V.konMat = s.stada(konMaterial(THREE, V, 0xdfeaff, 0.07, true));
  V.konMatSvag = s.stada(konMaterial(THREE, V, 0xe8f2ff, 0.045, true));
  byggSpegel(V);
  yield;
  byggNav(V);
  // damm i strålkastarljuset: glesa, långsamma ljuskorn över modellen (atmosfär och djup)
  const damm = s.partiklar(V.lag ? 24 : V.mobil ? 30 : 64, { centrum: [0, 1.15, 0], omrade: [3.4, 1.05, 3.0], farg: 0xdfeaff, storlek: 0.022, styrka: 1.2, fart: 0.05, opacitet: 0.5 });
  damm.name = 'damm'; damm.userData.ejISpegel = true; s.scene.add(damm);
  V.damm = damm;
  yield;

  yield* byggVarldSteg(V, data);
  V.dimmbar(V.nav.g); V.dimmbar(damm);

  const ndc = new THREE.Vector2(); const rc = new THREE.Raycaster();
  V.plocka = (cx, cy) => {
    if (s.forstord || !V.hitboxar.length) return -1;
    const r = s.canvas.getBoundingClientRect();
    if (r.width < 2) return -1;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    rc.setFromCamera(ndc, s.camera);
    const h = rc.intersectObjects(V.hitboxar, false);
    return h.length ? h[0].object.userData.ix : -1;
  };
  V.valj = (id) => {
    const ix = id ? V.klubbar.findIndex((k) => k.id === id) : -1;
    V.vald = ix;
    for (const k of V.klubbar) if (k.takLed) k.takLed.material = k.ix === ix ? V.M.takLedVald : V.M.takLed;
    for (const et of V.etiketter) et.matt = null;
    if (s.lugn) s.rita();
  };
  V.byggOm = (d) => {
    rivVarld(V);
    byggVarld(V, d);
    V.valj(vald);
    if (s.lugn) s.rita();
  };
  V.etiketterIgen = () => { if (V.lager && !V.lager.firstElementChild) byggEtiketter(V); };
  // hjältens text kan ha ändrat höjd (vald klubb, typsnitt): räkna om kamerans yta
  V.layoutIgen = () => { if (V.layout.w > 1) storlek(V, V.layout.w, V.layout.h); };
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!s.forstord) V.layoutIgen(); }); } catch (err) { /* ok */ }

  s.storlek((w, h) => storlek(V, w, h));
  s.ram((t, dt) => ram(V, t, dt));
  return V;
}

/* 05a-texturer -------------------------------------------------------------------------------------- */
function byggTexturer(V) {
  const { s, THREE } = V;
  // Gräsplan 105 × 68 m (+ marginal), randig klippning och linjer
  const gras = s.canvasTextur(1024, 694, (ctx, b, h) => {
    const r = slump(3);
    ctx.fillStyle = '#1d5233'; ctx.fillRect(0, 0, b, h);
    const mx = 56, my = 52, pw = b - 2 * mx, ph = h - 2 * my;
    const ranor = 18;
    for (let i = 0; i < ranor; i++) { ctx.fillStyle = i % 2 ? '#2d7346' : '#266640'; ctx.fillRect(mx + (pw / ranor) * i, 0, pw / ranor + 1, h); }
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'; ctx.fillRect(r() * b, r() * h, 1 + r() * 2, 1 + r() * 2); }
    const ljus = ctx.createRadialGradient(b / 2, h / 2, 0, b / 2, h / 2, b * 0.62);
    ljus.addColorStop(0, 'rgba(255,255,240,0.14)'); ljus.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = ljus; ctx.fillRect(0, 0, b, h);
    const m = pw / 105;
    ctx.strokeStyle = 'rgba(244,248,244,0.92)'; ctx.lineWidth = 3;
    ctx.strokeRect(mx, my, pw, ph);
    ctx.beginPath(); ctx.moveTo(b / 2, my); ctx.lineTo(b / 2, h - my); ctx.stroke();
    ctx.beginPath(); ctx.arc(b / 2, h / 2, 9.15 * m, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(244,248,244,0.95)';
    ctx.beginPath(); ctx.arc(b / 2, h / 2, 4, 0, Math.PI * 2); ctx.fill();
    for (const sida of [-1, 1]) {
      const gx = sida < 0 ? mx : b - mx;
      const ut = (x) => gx - sida * x * m;
      ctx.strokeRect(Math.min(gx, ut(16.5)), h / 2 - 20.16 * m, 16.5 * m, 40.32 * m);
      ctx.strokeRect(Math.min(gx, ut(5.5)), h / 2 - 9.16 * m, 5.5 * m, 18.32 * m);
      ctx.beginPath(); ctx.arc(ut(11), h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
      const v = Math.acos(5.5 / 9.15);
      ctx.beginPath();
      if (sida < 0) ctx.arc(ut(11), h / 2, 9.15 * m, -v, v); else ctx.arc(ut(11), h / 2, 9.15 * m, Math.PI - v, Math.PI + v);
      ctx.stroke();
      ctx.strokeRect(sida < 0 ? gx - 2.2 * m : gx, h / 2 - 3.66 * m, 2.2 * m, 7.32 * m);
    }
    for (const [cx, cy, a0] of [[mx, my, 0], [b - mx, my, Math.PI / 2], [b - mx, h - my, Math.PI], [mx, h - my, Math.PI * 1.5]]) { ctx.beginPath(); ctx.arc(cx, cy, 1 * m, a0, a0 + Math.PI / 2); ctx.stroke(); }
  });
  // Isbana 60 × 30 m: linjer, tekningscirklar, målgårdar och repor (inte vit – isen får sin glans av lacken)
  const is = s.canvasTextur(1024, 512, (ctx, b, h) => {
    const r = slump(9);
    const g = ctx.createRadialGradient(b / 2, h / 2, 0, b / 2, h / 2, b * 0.6);
    g.addColorStop(0, '#e2ebf2'); g.addColorStop(1, '#b7c7d5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      ctx.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(110,130,150,0.14)'; ctx.lineWidth = 0.6 + r() * 1.2;
      const x = r() * b, y = r() * h, a = r() * Math.PI, l = 10 + r() * 60;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 12, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    const m = b / 60;
    const rod = '#c9333a', bla = '#2a5db8';
    ctx.fillStyle = rod; ctx.fillRect(b / 2 - 0.3 * m, 0, 0.6 * m, h);
    ctx.fillStyle = bla; for (const x of [-7.6, 7.6]) ctx.fillRect(b / 2 + x * m - 0.3 * m, 0, 0.6 * m, h);
    ctx.fillStyle = rod; for (const x of [4, 56]) ctx.fillRect(x * m - 1.5, 0, 3, h);
    ctx.strokeStyle = bla; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b / 2, h / 2, 4.5 * m, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = bla; ctx.beginPath(); ctx.arc(b / 2, h / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rod; ctx.lineWidth = 3; ctx.fillStyle = rod;
    for (const x of [10, 50]) for (const y of [-7, 7]) {
      ctx.beginPath(); ctx.arc(x * m, h / 2 + y * m, 4.5 * m, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x * m, h / 2 + y * m, 5, 0, Math.PI * 2); ctx.fill();
    }
    for (const x of [22.4, 37.6]) for (const y of [-7, 7]) { ctx.beginPath(); ctx.arc(x * m, h / 2 + y * m, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(80,150,230,0.55)'; ctx.strokeStyle = rod; ctx.lineWidth = 2;
    for (const [x, rikt] of [[4, 1], [56, -1]]) { ctx.beginPath(); ctx.arc(x * m, h / 2, 1.8 * m, rikt > 0 ? -Math.PI / 2 : Math.PI / 2, rikt > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  });
  // Publik på läktaren (isotropt mönster, upprepas)
  const publik = s.canvasTextur(256, 256, (ctx, b, h) => {
    const r = slump(17);
    ctx.fillStyle = '#132131'; ctx.fillRect(0, 0, b, h);
    const farger = ['#e9edf2', '#e9edf2', '#d9822b', '#ff9a3d', '#7ee0c3', '#a7d2ff', '#f0b545', '#c7ccd2', '#30475f', '#f6f4ef', '#b8574a'];
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y + 6, b, 2);
      for (let x = 0; x < b; x += 4) { if (r() < 0.78) { ctx.fillStyle = farger[(r() * farger.length) | 0]; ctx.globalAlpha = 0.55 + r() * 0.45; ctx.fillRect(x + (r() - 0.5), y + 1 + r() * 1.5, 3, 4); } }
    }
    ctx.globalAlpha = 1;
  });
  publik.wrapS = publik.wrapT = THREE.RepeatWrapping;
  // Strålkastarpanel: 4 × 3 lampor
  const lampa = s.canvasTextur(64, 40, (ctx) => {
    ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, 64, 40);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      const cx = 8 + x * 16, cy = 7 + y * 13;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e9f2ff'); g.addColorStop(1, 'rgba(160,190,230,0.2)');
      ctx.fillStyle = g; ctx.fillRect(cx - 7, cy - 6, 14, 12);
    }
  });
  // Fasad för de låga kvarteren: två–tre våningar med fönsterband och enstaka tända rum (varmt och kallt)
  const fonster = s.canvasTextur(128, 64, (ctx, b, h) => {
    const r = slump(23);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, b, h);
    const rader = 3, kol = 8, rh = h / rader, kb = b / kol;
    for (let y = 0; y < rader; y++) {
      ctx.fillStyle = 'rgba(120,150,185,0.22)'; ctx.fillRect(0, y * rh, b, 2);
      for (let x = 0; x < kol; x++) {
        const p = r();
        if (p < 0.26) {
          const varm = r() < 0.35; const v = 0.45 + r() * 0.4;
          ctx.fillStyle = varm ? `rgba(255,${(196 + r() * 30) | 0},${(140 + r() * 40) | 0},${v})` : `rgba(${(170 + r() * 40) | 0},${(205 + r() * 30) | 0},255,${v})`;
          ctx.fillRect(x * kb + 2, y * rh + 5, kb - 4, rh - 8);
        } else { ctx.fillStyle = 'rgba(110,140,175,0.14)'; ctx.fillRect(x * kb + 2, y * rh + 5, kb - 4, rh - 8); }
      }
    }
  });
  // LED-skyltar runt planen: rullande text (texturen förskjuts i ram())
  const reklam = s.canvasTextur(1024, 48, (ctx, b, h) => {
    ctx.fillStyle = '#060b11'; ctx.fillRect(0, 0, b, h);
    ctx.textBaseline = 'middle'; ctx.font = '600 26px Poppins, sans-serif';
    const delar = [['UPERFORMANCE', '#ffb46b'], ['KLUBBMOTORN', '#d8ecff'], ['HÄLSOTESTER FÖR FÖRETAG OCH KLUBBAR', '#9df0d6']];
    let x = 18;
    for (const [text, farg] of delar) {
      ctx.fillStyle = farg; ctx.fillText(text, x, h / 2 + 1); x += ctx.measureText(text).width + 22;
      ctx.fillStyle = 'rgba(255,190,120,0.8)'; ctx.beginPath(); ctx.arc(x - 11, h / 2, 3, 0, Math.PI * 2); ctx.fill(); x += 12;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (let i = 0; i < b; i += 3) ctx.fillRect(i, 0, 1, h);
    for (let j = 0; j < h; j += 3) ctx.fillRect(0, j, b, 1);
  });
  reklam.wrapS = THREE.RepeatWrapping;
  return { gras, is, publik, lampa, fonster, reklam };
}

/* 05b-shadermaterial: ljusbågar, ljuskäglor och podiets LED-list ------------------------------------- */
// Ljusbågarna: en sammanslagen geometri. Klass 0 = provision (alltid), 1 = aktiv affär (alltid), 2 = detalj (bara vald
// klubb), 3 = markering runt arenan. Vikterna per klubb sätts varje bildruta (mjuka övergångar). Bågar som passerar
// bakom en HTML-etikett dämpas (etiketternas rutor i bildpunkter).
function flodesMaterial(THREE, V) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTid: { value: 0 }, uIntro: { value: 2 }, uAlla: { value: 1 },
      uVikt: { value: V.vikt.klubb }, uDetalj: { value: V.vikt.detalj }, uMark: { value: V.vikt.mark },
      uEt: { value: Array.from({ length: 10 }, () => new THREE.Vector4(-9, -9, -9, -9)) }, uEtAntal: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aFarg; attribute vec4 aFlode; attribute vec3 aInfo;
      uniform float uVikt[${MAXK}]; uniform float uDetalj[${MAXK}]; uniform float uMark[${MAXK}]; uniform float uAlla;
      varying vec3 vFarg; varying vec4 vFlode; varying float vX; varying float vRand; varying float vVikt; varying float vSluten; varying float vMark;
      void main() {
        vFarg = aFarg; vFlode = aFlode; vX = uv.x; vSluten = aInfo.z;
        float vikt = uAlla; vMark = 0.0;
        if ( aInfo.x > -0.5 ) {
          int g = int( clamp( aInfo.x, 0.0, ${MAXK - 1}.0 ) + 0.5 );
          if ( aInfo.y < 1.5 ) vikt = uVikt[ g ];
          else if ( aInfo.y < 2.5 ) vikt = uDetalj[ g ];
          else { vikt = uMark[ g ]; vMark = 1.0; }
        }
        vVikt = vikt;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vRand = abs( dot( normalize( normalMatrix * normal ), normalize( -mv.xyz ) ) );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTid; uniform float uIntro; uniform vec4 uEt[ 10 ]; uniform int uEtAntal;
      varying vec3 vFarg; varying vec4 vFlode; varying float vX; varying float vRand; varying float vVikt; varying float vSluten; varying float vMark;
      void main() {
        if ( vVikt < 0.003 ) discard;
        // vFlode: fart, antal pulser, pulsstyrka, start i entrén
        float visa = clamp( ( uIntro - vFlode.w ) * 2.4, 0.0, 1.0 ) * 1.1;
        float synlig = 1.0 - smoothstep( visa - 0.06, visa, vX );
        float f = fract( vX * vFlode.y - uTid * vFlode.x );
        float puls = pow( f, 10.0 ) * 1.7 + pow( f, 3.0 ) * 0.3;
        // tonas ut mot ändarna (öppna bågar)
        float ender = mix( smoothstep( 0.0, 0.16, vX ) * ( 1.0 - smoothstep( 0.8, 1.0, vX ) ), 1.0, vSluten );
        float bas = mix( 0.07, 0.3, vMark );
        float styrka = ( bas + puls * vFlode.z ) * ender * vVikt * synlig;
        float kant = 0.22 + 0.78 * pow( vRand, 1.7 );
        float et = 1.0;
        for ( int i = 0; i < 10; i++ ) {
          if ( i >= uEtAntal ) break;
          vec4 r = uEt[ i ];
          vec2 q = max( r.xy - gl_FragCoord.xy, gl_FragCoord.xy - r.zw );
          et = min( et, mix( 0.08, 1.0, smoothstep( -2.0, 14.0, max( q.x, q.y ) ) ) );
        }
        gl_FragColor = vec4( vFarg * styrka * kant * et, 0.0 );
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
  });
}

// Ljuskäglor (strålkastare): additiva, tonas ut mot kanten och dämpas utanför vald klubb som resten av modellen
function konMaterial(THREE, V, farg, styrka, uppat) {
  return new THREE.ShaderMaterial({
    uniforms: { uFarg: { value: new THREE.Color(farg) }, uStyrka: { value: styrka }, uTid: { value: 0 }, ...V.dimmUni },
    vertexShader: /* glsl */`
      varying float vY; varying float vRand; varying vec3 vPos; varying vec3 vKbVarld;
      void main() {
        vY = uv.y; vPos = position;
        vKbVarld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vRand = abs( dot( normalize( normalMatrix * normal ), normalize( -mv.xyz ) ) );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFarg; uniform float uStyrka; uniform float uTid; uniform vec3 uKbFokus; uniform float uKbDimm; uniform vec2 uKbR;
      varying float vY; varying float vRand; varying vec3 vPos; varying vec3 vKbVarld;
      void main() {
        float y = ${uppat ? 'vY' : '1.0 - vY'};
        float a = pow( y, 2.0 ) * pow( vRand, 2.2 ) * uStyrka;
        float skimmer = 0.82 + 0.18 * sin( vPos.y * 28.0 + vPos.x * 11.0 + uTid * 1.4 );
        float kb = mix( uKbDimm, 1.0, 1.0 - smoothstep( uKbR.x, uKbR.y, distance( vKbVarld.xz, uKbFokus.xz ) ) );
        gl_FragColor = vec4( uFarg * a * skimmer * kb, 0.0 );
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
  });
}

// Podiets LED-list under kanten: två ljuspunkter med svans jagar varvet runt (uv.x längs röret)
function ledMaterial(THREE, farg) {
  return new THREE.ShaderMaterial({
    uniforms: { uTid: { value: 0 }, uFarg: { value: new THREE.Color(farg) } },
    vertexShader: 'varying float vU; void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform float uTid; uniform vec3 uFarg; varying float vU;
      float jagare( float f ) { float a = fract( f ); return exp( -pow( ( a - 0.5 ) / 0.01, 2.0 ) ) * 4.0 + smoothstep( 0.36, 0.5, a ) * step( a, 0.5 ) * 1.1; }
      void main() { float j = jagare( vU - uTid * 0.03 ) + jagare( vU - uTid * 0.03 + 0.5 ); gl_FragColor = vec4( uFarg * ( 0.9 + j ), 1.0 ); }`,
  });
}

/* 05c-geometrihjälp ---------------------------------------------------------------------------------- */
// Slår ihop geometrier (position, normal, uv) till en – färre ritanrop
function slaIhop(THREE, lista) {
  const delar = lista.filter(Boolean).map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  let antal = 0; for (const g of delar) antal += g.attributes.position.count;
  const pos = new Float32Array(antal * 3), nor = new Float32Array(antal * 3), uv = new Float32Array(antal * 2);
  let o = 0;
  for (const g of delar) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c; g.dispose();
  }
  const ut = new THREE.BufferGeometry();
  ut.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ut.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ut.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ut.computeBoundingSphere();
  return ut;
}
const skalaUv = (g, su, sv = su) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
function normaliseraUv(g) {
  g.computeBoundingBox(); const bb = g.boundingBox; const p = g.attributes.position; const uv = g.attributes.uv;
  const bx = bb.max.x - bb.min.x || 1, by = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / bx, (p.getY(i) - bb.min.y) / by);
  return g;
}
// Rundad rektangel som Shape/Path (centrerad)
function rundRekt(THREE, b, d, r, ArtAv = THREE.Shape) {
  const s = new ArtAv(); const x = -b / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + b - r, y); s.absarc(x + b - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + b, y + d - r); s.absarc(x + b - r, y + d - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + d); s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function ringForm(THREE, b, d, r, tjocklek) {
  const yttre = rundRekt(THREE, b + 2 * tjocklek, d + 2 * tjocklek, r + tjocklek);
  yttre.holes.push(rundRekt(THREE, b, d, r, THREE.Path));
  return yttre;
}
// Stängd 3D-kurva runt en rundad rektangel (rör: markering, takbalk, LED)
function rundRektKurva(THREE, b, d, r, y) {
  const pts = rundRekt(THREE, b, d, r).getSpacedPoints(96); pts.pop();
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, y, p.y)), true, 'centripetal');
}
// Dela upp en extruderad geometri efter materialgrupp: [lock, sidor]
function delaGrupper(THREE, geo) {
  const ut = [];
  for (const gr of geo.groups) {
    const ny = new THREE.BufferGeometry();
    for (const namn of ['position', 'normal', 'uv']) {
      const a = geo.attributes[namn];
      ny.setAttribute(namn, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
    }
    (ut[gr.materialIndex] = ut[gr.materialIndex] || []).push(ny);
  }
  geo.dispose();
  return ut;
}
// Läktare i kanonisk riktning: utåt +x, framkant vid x = 0, längs z (centrerad)
function tribunGeo(THREE, langd, steg, d = 0.06, hs = 0.036, front = 0.03) {
  const f = new THREE.Shape();
  f.moveTo(0, 0); f.lineTo(0, front);
  for (let i = 0; i < steg; i++) {
    const y = front + i * hs;
    f.lineTo((i + 1) * d, y);
    if (i < steg - 1) f.lineTo((i + 1) * d, y + hs);
  }
  const xb = steg * d, yt = front + (steg - 1) * hs;
  f.lineTo(xb, yt + 0.05); f.lineTo(xb + 0.018, yt + 0.05); f.lineTo(xb + 0.018, 0);
  const g = new THREE.ExtrudeGeometry(f, { depth: langd, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -langd / 2);
  return g;
}
const cirkelKurva = (THREE, r, y, n = 160) => new THREE.CatmullRomCurve3(Array.from({ length: n }, (_, i) => new THREE.Vector3(Math.sin((i / n) * Math.PI * 2) * r, y, Math.cos((i / n) * Math.PI * 2) * r)), true);
// Glasvalv mellan ishallens takbågar: ytan längs bågen från t0 till t1 (genomskärning – bara halvan bort från betraktaren)
function valvGlas(THREE, xa, ya, yc, td, t0, t1, nx = 8, nt = 10) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nt; j++) {
    const x = -xa + (2 * xa * i) / nx, t = t0 + ((t1 - t0) * j) / nt;
    pos.push(x, ya + 2 * t * (1 - t) * (yc - ya), (td / 2) * (2 * t - 1)); uv.push(i / nx, j / nt);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b = a + nt + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const vrid = (x, z, v) => [x * Math.cos(v) + z * Math.sin(v), -x * Math.sin(v) + z * Math.cos(v)];
// punkt i världsgruppens koordinater → scenen när vridskivan står i vinkeln v (samma som rotation.y = v)
const rotera = (p, v, ut) => { const c = Math.cos(v), si = Math.sin(v); return ut.set(p.x * c + p.z * si, p.y, -p.x * si + p.z * c); };

/* 05d-podiets material och planreflektionen (hög kvalitet) ------------------------------------------- */
function byggSpegel(V) {
  const { s, THREE } = V;
  const speglar = V.speglar = V.hog;
  V.spegelUni = { uSpegel: { value: null }, uSpegelMatris: { value: new THREE.Matrix4() }, uSpegelStyrka: { value: 1.25 } };
  // Svart pianolack: nästan inga miljöreflexer (planreflektionen står för innehållet), skarpt toppskikt för ljusets glans.
  // Ytans ingraverade mönster (rutnät, kassaringen, urtavlan) är en svag självlysande karta.
  const topp = V.miljo(s.mat('bord', { color: 0x05090f, roughness: 0.17, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xffffff, emissiveMap: V.rutnat, emissiveIntensity: 1 }), speglar ? 0.12 : 0.22, true);
  topp.userData.kbEgen = true;
  topp.onBeforeCompile = (sh) => {
    if (speglar) {
      Object.assign(sh.uniforms, V.spegelUni);
      sh.vertexShader = 'uniform mat4 uSpegelMatris;\nvarying vec4 vSpegelUv;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n\tvSpegelUv = uSpegelMatris * modelMatrix * vec4( transformed, 1.0 );');
      sh.fragmentShader = 'uniform sampler2D uSpegel;\nuniform float uSpegelStyrka;\nvarying vec4 vSpegelUv;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        {
          vec3 spegel = texture2DProj( uSpegel, vSpegelUv ).rgb;
          float ndv = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
          float fres = 0.1 + 0.9 * pow( 1.0 - ndv, 4.0 );
          outgoingLight += spegel * uSpegelStyrka * mix( 0.45, 1.0, fres );
        }
        #include <opaque_fragment>`);
    }
    V.dimmFn(sh);
  };
  topp.customProgramCacheKey = () => `kb-topp-${speglar ? 1 : 0}`;
  V.PM = {
    topp,
    // kanten: samma svarta lack men med mer miljöljus, så att bandet fångar ljuslisterna (föremålet syns som föremål)
    kant: V.miljo(s.mat('bord', { color: 0x07101a, roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }), 0.55, true),
    fot: s.mat('morkMetall', { color: 0x0e141b, roughness: 0.55, side: THREE.DoubleSide }),
    led: s.stada(ledMaterial(THREE, 0xff9a3d)),
    golvsken: s.stada(new THREE.MeshBasicMaterial({ map: s.textur.rund, color: new THREE.Color(0xff8a2a).multiplyScalar(0.34), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
  };
  if (!speglar) return;
  V.spegelRT = s.stada(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
  V.oskarpaRT = s.stada(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
  V.oskarpaMat = s.stada(new THREE.ShaderMaterial({
    uniforms: { tKalla: { value: null }, uRiktning: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `uniform sampler2D tKalla; uniform vec2 uRiktning; varying vec2 vUv;
      void main() { vec4 c = texture2D( tKalla, vUv ) * 0.2270270270;
        c += texture2D( tKalla, vUv + uRiktning * 1.3846153846 ) * 0.3162162162; c += texture2D( tKalla, vUv - uRiktning * 1.3846153846 ) * 0.3162162162;
        c += texture2D( tKalla, vUv + uRiktning * 3.2307692308 ) * 0.0702702703; c += texture2D( tKalla, vUv - uRiktning * 3.2307692308 ) * 0.0702702703;
        gl_FragColor = c; }`,
  }));
  V.oskarpaScen = new THREE.Scene();
  const quad = new THREE.Mesh(s.stada(new THREE.PlaneGeometry(2, 2)), V.oskarpaMat); quad.frustumCulled = false; V.oskarpaScen.add(quad);
  V.oskarpaKam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  V.spegelKam = new THREE.PerspectiveCamera();
  V.spegelUni.uSpegel.value = V.spegelRT.texture;
  V.sp = {
    bias: new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1),
    n: new THREE.Vector3(0, 1, 0), pp: new THREE.Vector3(), kp: new THREE.Vector3(), rot: new THREE.Matrix4(), blick: new THREE.Vector3(), mal: new THREE.Vector3(),
    plan: new THREE.Plane(), klipp: new THREE.Vector4(), q: new THREE.Vector4(),
  };
}
function spegelStorlek(V, w, h) {
  if (!V.speglar) return;
  const pr = V.s.renderer.getPixelRatio(); const f = 0.5;
  const b = Math.max(4, Math.round(w * pr * f)), hh = Math.max(4, Math.round(h * pr * f));
  if (V.spegelRT.width !== b || V.spegelRT.height !== hh) { V.spegelRT.setSize(b, hh); V.oskarpaRT.setSize(b, hh); }
}
// Speglad kamera (ytan y = 0) → halv upplösning → gaussoskärpa. Ytan, det som ligger på den och transmissionsglaset
// ritas inte i spegelbilden (glaset skulle annars kräva ett transmissionspass till).
function ritaSpegel(V) {
  if (!V.speglar) return;
  const { s } = V; const cam = s.camera; const r = s.renderer; const P = V.sp; const sk = V.spegelKam;
  cam.updateMatrixWorld();
  P.kp.setFromMatrixPosition(cam.matrixWorld);
  if (P.kp.y <= 0.01) return;
  spegelStorlek(V, V.layout.w, V.layout.h);
  P.pp.set(P.kp.x, 0, P.kp.z);
  sk.position.copy(P.kp); sk.position.y = -P.kp.y;
  P.rot.extractRotation(cam.matrixWorld);
  P.blick.set(0, 0, -1).applyMatrix4(P.rot).add(P.kp); P.mal.copy(P.blick); P.mal.y = -P.blick.y;
  sk.up.set(0, 1, 0).applyMatrix4(P.rot).reflect(P.n);
  sk.lookAt(P.mal);
  sk.near = cam.near; sk.far = cam.far;
  sk.updateMatrixWorld();
  sk.projectionMatrix.copy(cam.projectionMatrix);
  V.spegelUni.uSpegelMatris.value.copy(P.bias).multiply(sk.projectionMatrix).multiply(sk.matrixWorldInverse);
  // snett närplan: allt under ytan klipps bort
  P.plan.setFromNormalAndCoplanarPoint(P.n, P.pp).applyMatrix4(sk.matrixWorldInverse);
  P.klipp.set(P.plan.normal.x, P.plan.normal.y, P.plan.normal.z, P.plan.constant);
  const pm = sk.projectionMatrix.elements;
  P.q.x = (Math.sign(P.klipp.x) + pm[8]) / pm[0]; P.q.y = (Math.sign(P.klipp.y) + pm[9]) / pm[5]; P.q.z = -1; P.q.w = (1 + pm[10]) / pm[14];
  P.klipp.multiplyScalar(2 / P.klipp.dot(P.q));
  pm[2] = P.klipp.x; pm[6] = P.klipp.y; pm[10] = P.klipp.z + 1 - 0.003; pm[14] = P.klipp.w;
  sk.projectionMatrixInverse.copy(sk.projectionMatrix).invert();
  for (const o of V.spegelDolj) { o.userData.var = o.visible; o.visible = false; }
  V.dimmUni.uKbSpegel.value = 1; // höjdtoningen (se V.dimmFn)
  const etU = V.flodeMat.uniforms.uEtAntal; const etAntal = etU.value; etU.value = 0;
  const forra = r.getRenderTarget(); const skuggAuto = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
  r.setRenderTarget(V.spegelRT); r.clear(true, true, false);
  r.render(s.scene, sk);
  const tx = 1 / V.spegelRT.width, ty = 1 / V.spegelRT.height, radie = 0.5;
  V.oskarpaMat.uniforms.tKalla.value = V.spegelRT.texture; V.oskarpaMat.uniforms.uRiktning.value.set(tx * radie, 0);
  r.setRenderTarget(V.oskarpaRT); r.render(V.oskarpaScen, V.oskarpaKam);
  V.oskarpaMat.uniforms.tKalla.value = V.oskarpaRT.texture; V.oskarpaMat.uniforms.uRiktning.value.set(0, ty * radie);
  r.setRenderTarget(V.spegelRT); r.render(V.oskarpaScen, V.oskarpaKam);
  r.setRenderTarget(forra);
  r.shadowMap.autoUpdate = skuggAuto; r.shadowMap.needsUpdate = true;
  etU.value = etAntal;
  V.dimmUni.uKbSpegel.value = 0;
  for (const o of V.spegelDolj) o.visible = o.userData.var;
}

/* 05e-podiet: spegelblank ovansida, fasad överkant, tjockt lackband, infälld fot med LED-list --------- */
function byggPodium(V) {
  const { s, THREE } = V;
  const RP = V.RP, B = 0.07, BAND = 0.3, IN = 0.36;
  const g = new THREE.Group(); g.name = 'podium';
  const topp = new THREE.Mesh(new THREE.CircleGeometry(RP - B, V.lag ? 96 : 180), V.PM.topp);
  topp.rotation.x = -Math.PI / 2; topp.receiveShadow = true; topp.name = 'podium-topp'; topp.userData.ejISpegel = true;
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const prof = [V2(RP - IN + 0.02, -BAND - 0.035), V2(RP - 0.05, -BAND - 0.035), V2(RP - 0.012, -BAND - 0.024), V2(RP, -BAND), V2(RP, -B)];
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push(V2(RP - B + Math.cos(a) * B, -B + Math.sin(a) * B)); }
  const kant = new THREE.Mesh(new THREE.LatheGeometry(prof, V.lag ? 128 : 240), V.PM.kant); kant.name = 'podium-kant';
  kant.receiveShadow = true;
  // kromlist där fasningen möter bandet
  const list = new THREE.Mesh(new THREE.TorusGeometry(RP + 0.0015, 0.0055, 6, 280), s.material.krom);
  list.rotation.x = -Math.PI / 2; list.position.y = -B - 0.004;
  // infälld fot (skuggspår under kanten) och LED-list som lyser ned mot golvet
  const fotProf = [V2(0.01, -0.6), V2(RP - IN - 0.05, -0.6), V2(RP - IN, -0.56), V2(RP - IN, -BAND - 0.03)];
  const fot = new THREE.Mesh(new THREE.LatheGeometry(fotProf, V.lag ? 96 : 180), V.PM.fot);
  const led = new THREE.Mesh(new THREE.TubeGeometry(cirkelKurva(THREE, RP - IN - 0.014, -BAND - 0.07, 200), 360, 0.011, 6, true), V.PM.led);
  led.name = 'podium-led';
  // ljusspill på "golvet" under podiet (ingen golvyta – bara ljuset)
  const sken = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), V.PM.golvsken);
  sken.rotation.x = -Math.PI / 2; sken.position.y = -0.62; sken.scale.set(RP * 2.7, RP * 2.7, 1); sken.renderOrder = -1; sken.userData.ejISpegel = true;
  g.add(topp, kant, list, fot, led, sken);
  V.grupp.add(g);
}

// Podiets yta: fint rutnät, avenyer från märket ut till klubbarna, kassaringen, märkets ringar och en urtavla vid kanten
function ritaRutnat(ctx, b, h, V) {
  const c = b / 2, R = V.RP - 0.07, sk = c / R;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, b, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(140,185,225,0.2)'; ctx.lineWidth = 1;
  const steg = sk * 0.25;
  for (let x = c % steg; x < b; x += steg) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = c % steg; y < h; y += steg) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(b, y + 0.5); ctx.stroke(); }
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(c, c, c * 0.18, c, c, c * 0.97);
  mask.addColorStop(0, 'rgba(0,0,0,0.55)'); mask.addColorStop(0.55, 'rgba(0,0,0,0.32)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask; ctx.fillRect(0, 0, b, h);
  ctx.restore();
  ctx.fillStyle = '#000'; ctx.globalCompositeOperation = 'destination-over'; ctx.fillRect(0, 0, b, h); ctx.globalCompositeOperation = 'source-over';
  // svagt mintsken kring märket
  const g = ctx.createRadialGradient(c, c, 0, c, c, 1.4 * sk);
  g.addColorStop(0, 'rgba(70,170,150,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
  // avenyer: från märket ut till varje arena och kvarter
  for (const K of V.klubbar || []) {
    const inre = 1.05 * sk;
    for (const [v, ut, farg] of [[K.vinkel, (V.R - K.skala * 0.81 - 0.06) * sk, 'rgba(255,170,100,0.22)'], [K.D.vinkel, (Math.hypot(K.D.pos.x, K.D.pos.z) - K.D.d / 2 - 0.05) * sk, 'rgba(167,210,255,0.16)']]) {
      ctx.strokeStyle = farg; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(c + Math.sin(v) * inre, c + Math.cos(v) * inre); ctx.lineTo(c + Math.sin(v) * ut, c + Math.cos(v) * ut); ctx.stroke();
    }
  }
  // kassaringen (pengarna går runt) och märkets ringar
  ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,150,70,0.5)'; ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.arc(c, c, V.rK * sk, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,170,100,0.22)';
  for (const d of [-0.1, 0.1]) { ctx.beginPath(); ctx.arc(c, c, (V.rK + d) * sk, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(126,224,195,0.5)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(c, c, 1.0 * sk, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(126,224,195,0.28)'; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.arc(c, c, 1.12 * sk, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // urtavla vid kanten
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2, lang = i % 10 === 0, mell = i % 5 === 0;
    const r1 = c * 0.985, r0 = c * (lang ? 0.95 : mell ? 0.963 : 0.973);
    ctx.strokeStyle = lang ? 'rgba(255,190,130,0.6)' : 'rgba(246,244,239,0.26)'; ctx.lineWidth = lang ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(246,244,239,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(c, c, c * 0.992, 0, Math.PI * 2); ctx.stroke();
}

/* 05f-Uperformance i mitten: svarvad sockel, glasskiva och U-märket som vänder sig mot kameran ---------- */
function byggNav(V) {
  const { s, THREE } = V;
  const g = new THREE.Group(); g.name = 'nav';
  const prof = [[0.01, 0], [0.88, 0], [0.92, 0.022], [0.92, 0.1], [0.89, 0.13], [0.77, 0.16], [0.01, 0.16]].map(([x, y]) => new THREE.Vector2(x, y));
  const fot = new THREE.Mesh(s.stada(new THREE.LatheGeometry(prof, 140)), V.miljo(s.mat('bord', { color: 0x0a1420, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }), 0.6, true));
  const kantRing = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.921, 0.008, 8, 180)), s.material.krom); kantRing.rotation.x = -Math.PI / 2; kantRing.position.y = 0.062;
  const skiva = new THREE.Mesh(s.stada(new THREE.CylinderGeometry(0.68, 0.7, 0.06, 120)), s.mat('glas', { attenuationColor: FARG.mint, attenuationDistance: 0.9, thickness: 0.06, roughness: 0.05 }));
  skiva.position.y = 0.19;
  const inlagg = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.79, 0.012, 8, 180)), s.glod(FARG.mint, 1.35));
  inlagg.rotation.x = -Math.PI / 2; inlagg.position.y = 0.161;
  // U-märket: borstad metall på framsidan, navyblå lack på sidorna, ringen i borstad metall med en tunn mintlist längs kanten
  const uMat = V.miljo(s.mat('metall', { color: 0xeef3f8, roughness: 0.26 }), 1.5, true);
  const uSida = V.miljo(s.mat('navy', { color: 0x1d4268, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 }), 1.15, true);
  const ringMat = V.miljo(s.mat('metall', { color: 0xc9d3dd, roughness: 0.3 }), 1.3, true);
  // ringen svarvas här (rundad profil) i stället för motorns extruderade ring – samma form, en bråkdel av byggtiden
  const u = s.uLogga(0.16, { ring: false, material: uMat, sidMaterial: uSida });
  {
    const ri = 177 / 398, ry = 199 / 398, hz = 0.064, rr = 0.011, pts = [];
    const horn = [[ry - rr, hz - rr, 0], [ri + rr, hz - rr, Math.PI / 2], [ri + rr, -hz + rr, Math.PI], [ry - rr, -hz + rr, Math.PI * 1.5]];
    for (const [cx, cz, a0] of horn) for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr)); }
    pts.push(pts[0].clone());
    const ringGeo = s.stada(new THREE.LatheGeometry(pts, V.lag ? 64 : 112)); ringGeo.rotateX(Math.PI / 2);
    u.ring = new THREE.Mesh(ringGeo, ringMat); u.ring.name = 'U-ring'; u.add(u.ring);
  }
  const list = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.503, 0.009, 8, 200)), s.glod(FARG.mint, 1.18)); list.position.z = 0.05;
  const listInre = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.442, 0.006, 8, 200)), s.glod(FARG.mint, 0.85)); listInre.position.z = 0.07;
  u.add(list, listInre);
  u.scale.setScalar(1.5);
  s.skuggor.kasta(u, false);
  const uHallare = new THREE.Group(); uHallare.position.y = 1.34; uHallare.rotation.order = 'YXZ'; uHallare.add(u);
  const uHalo = s.halo(FARG.mint, 2.8, 0.22); uHalo.position.z = -0.4; uHallare.add(uHalo);
  const holoMat = s.mat('holo', { opacity: 0.08 });
  const holo1 = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.64, 0.008, 8, 160)), holoMat);
  const holo2 = new THREE.Mesh(s.stada(new THREE.TorusGeometry(0.56, 0.007, 8, 160)), holoMat);
  holo1.scale.setScalar(1.5); holo2.scale.setScalar(1.5); holo1.position.y = holo2.position.y = 1.34;
  const strale = new THREE.Mesh(s.stada(new THREE.CylinderGeometry(0.42, 0.62, 1.9, 48, 1, true)), s.stada(konMaterial(THREE, V, FARG.mint, 0.07, false)));
  strale.position.y = 0.22 + 0.95;
  const skugga = s.kontaktskugga(2.3, 2.3, 0.6); skugga.position.y = 0.002; skugga.userData.ejISpegel = true;
  const prickar = s.partiklar(V.mobil ? 22 : 36, { centrum: [0, 1.0, 0], omrade: [0.62, 0.8, 0.62], farg: FARG.mint, storlek: 0.045, styrka: 0.9, fart: 0.15, opacitet: 0.7 });
  s.skuggor.kasta(fot);
  g.add(skugga, fot, kantRing, skiva, inlagg, uHallare, holo1, holo2, strale, prickar);
  s.scene.add(g);
  V.nav = { g, u, uHallare, uHalo, holo1, holo2, inlagg, strale, ankare: new THREE.Vector3(0, 2.36, 0) };
}

/* 05g-världen: podium, arenor, kvarter, torn, kassor, bågar och mynt (byggs om när datan ändras) --------- */
function rivVarld(V) {
  const { s } = V;
  if (!V.grupp) return;
  const delade = new Set([...Object.values(s.material), ...Object.values(s.textur), ...Object.values(V.tex), ...Object.values(V.PM), V.rutnat, V.flodeMat, V.konMat, V.konMatSvag]);
  V.grupp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
    const lista = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of lista) {
      if (delade.has(m)) continue;
      for (const nyckel of Object.keys(m)) { const v = m[nyckel]; if (v && v.isTexture && !delade.has(v)) v.dispose(); }
      m.dispose();
    }
  });
  for (const m of Object.values(V.M || {})) if (!delade.has(m)) m.dispose();
  s.scene.remove(V.grupp);
  V.grupp = null; V.klubbar = []; V.hitboxar = []; V.etiketter = []; V.torn = []; V.block = []; V.golv = []; V.paketBagar = []; V.miljoVarld = [];
  if (V.lager) V.lager.innerHTML = '';
}

// Klubbarna i en ring runt märket: arena, kvarter, arena, kvarter … (arenans långsida längs ringen, lokal −z mot märket).
// Radien väljs så att allt får plats; podiet görs precis så stort att allt ryms med marginal.
function planeraLayout(V, lista) {
  const { THREE } = V;
  const n = lista.length;
  const sk = n <= 3 ? 1 : n === 4 ? 0.9 : n <= 6 ? 0.76 : 0.62;
  const wA = 2.2 * sk, dA = 1.62 * sk, gap = 0.17 * sk;
  const tak = V.lag ? 12 : V.mobil ? 16 : 22;
  const cell = 0.25 * sk;
  const dist = lista.map((k) => {
    const nT = Math.min(12, k.foretag.length);
    const nB = Math.min(tak, Math.max(0, k.partners - k.introducerade));
    const tot = Math.max(4, nT + nB);
    const cols = Math.max(2, Math.ceil(Math.sqrt(tot * 1.3)));
    const rows = Math.max(2, Math.ceil(tot / cols));
    return { nT, nB, cols, rows, cell, w: cols * cell + 0.16 * sk, d: rows * cell + 0.16 * sk };
  });
  const kassaSkala = Math.min(1, sk + 0.1);
  const ksr = 0.215 * KS * kassaSkala;
  const navR = 0.95;
  let R = Math.max(navR + 2 * ksr + 0.26 + dA / 2, 2.5 * sk);
  const vink = (b, r) => 2 * Math.asin(Math.min(0.999, (b / 2 + gap) / r));
  let total = 0;
  for (let i = 0; i < 80 && n; i++) {
    total = dist.reduce((a, D) => a + vink(wA, R) + vink(D.w, R), 0);
    if (total <= Math.PI * 2 * 0.94) break;
    R += 0.1;
  }
  const slack = n ? Math.max(0, Math.min(0.3, (Math.PI * 2 - total) / (2 * n))) : 0;
  const rK = (navR + ksr + (R - dA / 2 - ksr - 0.05)) / 2;
  const horn = (pos, v, b, d) => {
    let m = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [x, z] = vrid((sx * b) / 2, (sz * d) / 2, v); m = Math.max(m, Math.hypot(pos.x + x, pos.z + z)); }
    return m;
  };
  const ut = [];
  let phi = 0.3, RP = 2.4;
  for (let i = 0; i < n; i++) {
    const D = dist[i];
    const aV = phi;
    const pos = new THREE.Vector3(Math.sin(aV) * R, 0, Math.cos(aV) * R);
    const dV = aV + vink(wA, R) / 2 + slack + vink(D.w, R) / 2;
    const Rd = R + Math.max(0, D.d - dA) * 0.3;
    const dPos = new THREE.Vector3(Math.sin(dV) * Rd, 0, Math.cos(dV) * Rd);
    phi = dV + vink(D.w, R) / 2 + slack + vink(wA, R) / 2;
    RP = Math.max(RP, horn(pos, aV, wA + 0.26 * sk, dA + 0.26 * sk), horn(dPos, dV, D.w, D.d));
    ut.push({ pos, vinkel: aV, ut: new THREE.Vector3(Math.sin(aV), 0, Math.cos(aV)), skala: sk, kassaSkala,
      kassaPos: new THREE.Vector3(Math.sin(aV) * rK, 0, Math.cos(aV) * rK), D: { ...D, pos: dPos, vinkel: dV }, mittVinkel: (aV + dV) / 2 });
  }
  return { R, RP: RP + 0.34, rK, sk, klubbar: ut };
}

function varldsMaterial(V) {
  const { s, THREE } = V;
  const mynt = (farg, grov, emissiv = 0x000000, e = 0) => V.miljo(s.stada(new THREE.MeshStandardMaterial({ color: farg, metalness: 1, roughness: grov, roughnessMap: s.textur.brus, emissive: emissiv, emissiveIntensity: e })), 1.25);
  return {
    betong: s.mat('gjutjarn', { color: 0x252d36, roughness: 0.74, metalness: 0.22 }),
    betongLjus: s.mat('gjutjarn', { color: 0x3b4653, roughness: 0.6, metalness: 0.18 }),
    forplan: s.mat('gjutjarn', { color: 0x1d2b2b, roughness: 0.6, metalness: 0.1 }),
    // taket: halvgenomskinlig polykarbonat med stålribbor ovanpå – publiken anas genom taket
    tak: s.mat('plast', { color: 0xd9e6f0, roughness: 0.2, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.5, depthWrite: false }),
    // ishallens glasvalv (bara bortre halvan): nästan klart, fångar miljöns ljuslister
    takGlas: V.miljo(s.stada(new THREE.MeshPhysicalMaterial({ color: 0xd8e6f2, transparent: true, opacity: 0.15, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false })), 1.3),
    reklam: s.stada(new THREE.MeshBasicMaterial({ map: V.tex.reklam, color: new THREE.Color(1, 1, 1).multiplyScalar(1.15) })),
    vitt: s.mat('plast', { color: 0xf2f4f6, roughness: 0.4 }),
    stal: V.miljo(s.mat('metall', { color: 0xc3ccd5, roughness: 0.3 }), 1.0),
    // ishallens takbågar: grafitgrå borstad metall (läses som bärverk, inte som vita trådar under strålkastaren)
    takBage: V.miljo(s.mat('metall', { color: 0x6f7b88, roughness: 0.36 }), 0.75),
    morkStal: s.mat('morkMetall', { color: 0x2b3542 }),
    publik: s.stada(new THREE.MeshStandardMaterial({ map: V.tex.publik, roughness: 0.86, metalness: 0 })),
    // planen lyser lite av sig själv (strålkastarna) – inga punktljus behövs
    gras: s.stada(new THREE.MeshStandardMaterial({ map: V.tex.gras, roughness: 0.9, metalness: 0, emissive: 0xffffff, emissiveMap: V.tex.gras, emissiveIntensity: 0.16 })),
    // isen: blank men inte vit (annars bränner den ut under strålkastaren) – glansen kommer från lacken och miljön
    is: V.miljo(s.stada(new THREE.MeshPhysicalMaterial({ map: V.tex.is, color: 0xa9bac8, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0xffffff, emissiveMap: V.tex.is, emissiveIntensity: 0.025 })), 0.8),
    sargGlas: s.stada(new THREE.MeshPhysicalMaterial({ color: 0xe4f6ff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false })),
    lampa: s.stada(new THREE.MeshBasicMaterial({ map: V.tex.lampa, color: new THREE.Color(1, 1, 1).multiplyScalar(1.7) })),
    takLed: s.glod(0xeef4ff, 1.15),
    takLedVald: s.glod(0xff9a3d, 1.5),
    kubLed: s.glod(0xdfe9ff, 1.0),
    spelareA: s.mat('plast', { color: 0xf3f5f7, roughness: 0.45 }),
    spelareB: s.mat('orange', { color: 0xff8a2a }),
    kon: s.mat('orange', { color: 0xff7a1a, roughness: 0.5 }),
    // mynten: guld och silver i metall med präglad kant; "att betala" har bara en svag glöd i kanten
    guld: mynt(0xd9a441, 0.25),
    glodMynt: mynt(0xf0b545, 0.2, 0xff8a2a, 0.18),
    silver: mynt(0xd2d9e1, 0.28),
    spoke: s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa04a).multiplyScalar(0.8), transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false })),
    massing: V.miljo(s.stada(new THREE.MeshStandardMaterial({ color: 0xc8a771, metalness: 1, roughness: 0.26, roughnessMap: s.textur.borstad })), 1.3),
    // kassan: tunt, svagt rökt glas utan transmission (mynten bakom syns skarpt mot den mörka botten)
    kassaGlas: V.miljo(s.stada(new THREE.MeshPhysicalMaterial({ color: 0x8fa6ba, transparent: true, opacity: 0.11, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false })), 1.05),
    kassaBotten: s.mat('plastMork', { color: 0x070b10, roughness: 0.5 }),
    tornGlas: V.miljo(s.stada(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.08, transmission: 1, thickness: 0.18, ior: 1.45, specularIntensity: 0.85, clearcoat: 0.45, clearcoatRoughness: 0.06, attenuationColor: new THREE.Color(0xa9d4ff), attenuationDistance: 0.8, depthWrite: false })), 0.65),
    tornKant: V.miljo(s.stada(new THREE.MeshPhysicalMaterial({ color: 0xd9ecff, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false })), 1.3),
    tornLed: s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), toneMapped: false })),
    stolpe: V.miljo(s.mat('metall', { color: 0x9aa6b2, roughness: 0.34 }), 0.9),
    karna: s.mat('plastMork', { color: 0x0b121a }),
    golv: s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) })),
    tornRing: s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    kontakt: s.stada(new THREE.MeshBasicMaterial({ map: s.textur.skugga, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    // nätverkets kvarter: mörkt speglande glas med fönsterband (partners som ännu inte introducerats)
    kvarter: V.miljo(s.stada(new THREE.MeshPhysicalMaterial({ color: 0x223244, roughness: 0.16, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xffffff, emissiveMap: V.tex.fonster, emissiveIntensity: 0.85 })), 1.1),
    kvarterTak: s.stada(new THREE.MeshStandardMaterial({ color: 0x1a2531, roughness: 0.5, metalness: 0.4, emissive: new THREE.Color(FARG.is), emissiveIntensity: 0.08 })),
  };
}

function byggVarld(V, d) { for (const steg of byggVarldSteg(V, d)) void steg; } // synkront (ombygge)
function* byggVarldSteg(V, d) {
  const { s, THREE } = V;
  V.d = d;
  const grupp = new THREE.Group(); grupp.name = 'varld';
  V.grupp = grupp; V.miljoVarld = [];
  const klubbData = d ? d.klubbar : [];
  // största klubben (pengar + prognos) på den mest framträdande platsen (längst fram)
  const ordning = klubbData.map((k, i) => ({ k, i })).sort((a, b) => (b.k.tillbaka + b.k.prognos + b.k.introducerade) - (a.k.tillbaka + a.k.prognos + a.k.introducerade));
  const L = planeraLayout(V, ordning.map((o) => o.k));
  V.R = L.R; V.RP = L.RP; V.rK = L.rK;
  V.M = varldsMaterial(V);
  {
    const forkompilera = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), V.M.takLedVald);
    forkompilera.visible = false; forkompilera.name = 'forkompilera-vald'; grupp.add(forkompilera);
  }
  byggPodium(V);
  yield;
  V.klubbar = [];
  for (const [ix, { k, i }] of ordning.entries()) {
    const p = L.klubbar[ix];
    const K = { id: k.id, ix, dataIx: i, data: k, vinkel: p.vinkel, skala: p.skala, pos: p.pos, ut: p.ut, D: p.D, kassaPos: p.kassaPos, kassaSkala: p.kassaSkala, mittVinkel: p.mittVinkel, lyft: 0, list: 0.16, halor: [] };
    byggArena(V, K);
    yield;
    byggKassa(V, K);
    byggDistrikt(V, K);
    V.klubbar.push(K);
    yield;
  }
  byggTornInstanser(V);
  byggBlock(V);
  yield;
  byggFloden(V);
  yield;
  byggMynt(V);
  byggEtiketter(V);
  yield;
  V.rutnat.rita();

  // punkter för kamerans inramning: hela podiet (med kant och fot), tornens toppar och märket
  const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
  V.oversiktPunkter = [P3(0, 2.32, 0)];
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; V.oversiktPunkter.push(P3(Math.sin(a) * V.RP, 0, Math.cos(a) * V.RP), P3(Math.sin(a) * (V.RP - 0.36), -0.6, Math.cos(a) * (V.RP - 0.36))); }
  for (const t of V.torn) V.oversiktPunkter.push(P3(t.pos.x, TOPP_D + t.h + 0.26, t.pos.z));
  for (const K of V.klubbar) {
    const horn = [];
    for (const x of [-1.12, 1.12]) for (const z of [-0.83, 0.83]) for (const y of [0, 1.1]) horn.push(P3(x, y, z).applyMatrix4(K.grupp.matrixWorld));
    V.oversiktPunkter.push(...horn.filter((p) => p.y > 0.5));
    const D = K.D, dh = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [x, z] = vrid((sx * D.w) / 2, (sz * D.d) / 2, D.vinkel); dh.push(P3(D.pos.x + x, 0, D.pos.z + z)); }
    const kassa = [P3(K.kassaPos.x, 0, K.kassaPos.z), P3(K.kassaPos.x, 0.9 * KS, K.kassaPos.z)];
    K.fokusPunkter = [...horn, ...dh, ...kassa, ...K.torn.map((t) => P3(t.pos.x, TOPP_D + t.h + 0.26, t.pos.z))];
    K.fokusMitt = K.pos.clone().add(D.pos).multiplyScalar(0.5);
    K.fokusR = Math.max(1.6, ...K.fokusPunkter.map((p) => Math.hypot(p.x - K.fokusMitt.x, p.z - K.fokusMitt.z))) + 0.15;
  }
  V.fokusCache = {};

  V.dimmbar(grupp);
  s.scene.add(grupp);
  s.skuggor.omfang(V.RP + 0.9, 34);
  // det som inte ritas i spegelbilden: ytan och det som ligger på den, transmissionsglaset och allt självlysande som
  // inte tonas med höjden (ljusbågar, ljuskäglor, glorior, ljuspunkter) – de blev suddiga spökbilder i lacken
  V.spegelDolj = [];
  s.scene.traverse((o) => {
    const m = o.material && !Array.isArray(o.material) ? o.material : null;
    if (o.userData.ejISpegel || o.isSprite || o.isPoints || (o.isMesh && m && (m.transmission > 0 || m.isShaderMaterial))) V.spegelDolj.push(o);
  });
  if (V.layout.w > 1) storlek(V, V.layout.w, V.layout.h);
  // entrén spelas bara första gången scenen byggs
  V.t0 = s.tid;
  V.introKlar = !V.forstaBygget || s.lugn;
  V.forstaBygget = false;
  skrivIntro(V, V.introKlar ? 1 : 0);
}

/* Arena: gräs (fotboll) eller is (hockey) – lokal x = långsidan, lokal −z mot märket */
function byggArena(V, K) {
  const { s, THREE, M } = V;
  const g = new THREE.Group(); g.name = `arena-${K.id}`;
  g.position.copy(K.pos); g.rotation.y = K.vinkel; g.scale.setScalar(K.skala);
  const ar = new THREE.Group(); // skalas upp i entrén
  g.add(ar);
  K.grupp = g; K.inre = ar;
  const BX = 2.2, BH = 0.12, BZ = 1.62, y0 = BH;
  const bas = new THREE.Mesh(s.rundadLada(BX, BH, BZ, 0.045, 4), M.betong); bas.position.y = BH / 2;
  const forplan = new THREE.Mesh(s.rundadLada(BX - 0.08, 0.012, BZ - 0.08, 0.006, 2), M.forplan); forplan.position.y = BH + 0.004;
  ar.add(bas, forplan);
  s.skuggor.kasta(bas); forplan.receiveShadow = true;
  // sockellist: tunn ljuslist runt sockelns överkant – svag i vila, orange när klubben är vald
  K.listMat = s.glod(0xff9a3d, 0.16);
  const sockelList = new THREE.Mesh(new THREE.TubeGeometry(rundRektKurva(THREE, BX - 0.014, BZ - 0.014, 0.04, BH + 0.001), 180, 0.0055, 5, true), K.listMat);
  ar.add(sockelList);

  const metall = [], morkt = [], tak = [], lampor = [], koner = [], publik = [], tribuner = [], led = [], vitt = [], reklam = [], bagar = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), dummy = new THREE.Object3D(), ett = new THREE.Vector3(1, 1, 1), ned = new THREE.Vector3(0, -1, 0);
  const med = (geo, x, y, z, ry = 0, rx = 0, rz = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.updateMatrix(); return geo.applyMatrix4(dummy.matrix); };
  const halo = (farg, storlek, styrka, pos) => { const h = s.halo(farg, storlek, styrka); h.position.copy(pos); ar.add(h); K.halor.push(h); return h; };
  // ljuskägla från lampan mot planen
  const kagla = (huvud, mal, r0, r1, langdFaktor = 1.05) => {
    const rikt = new THREE.Vector3().subVectors(mal, huvud); const lang = rikt.length() * langdFaktor; rikt.normalize();
    const kon = new THREE.CylinderGeometry(r0, r1, lang, 20, 1, true); kon.translate(0, -lang / 2, 0);
    q.setFromUnitVectors(ned, rikt); m4.compose(huvud, q, ett); koner.push(kon.applyMatrix4(m4));
    return rikt;
  };
  // vilken sida av arenan som vetter mot betraktaren (översiktskameran står på +z)
  const motKamera = Math.cos(K.vinkel) >= 0 ? 1 : -1;

  const blixtPos = []; // platser i publiken där kamerablixtar tänds
  const rb = slump(hash(K.id) + 5);
  if (K.data.sport === 'is') {
    // ---- ishall: rink, sarg med glas, läktarskål, ringbalk med LED, takbågar i borstad metall, glasvalv, kub med skärmar
    const L = 1.3, W = 0.65, RR = 0.18;
    const isGeo = normaliseraUv(new THREE.ShapeGeometry(rundRekt(THREE, L, W, RR), 20)); isGeo.rotateX(-Math.PI / 2);
    const isYta = new THREE.Mesh(isGeo, M.is); isYta.position.y = y0 + 0.012; isYta.receiveShadow = true; ar.add(isYta);
    const sarg = new THREE.ExtrudeGeometry(ringForm(THREE, L, W, RR, 0.016), { depth: 0.032, bevelEnabled: false, curveSegments: 10 });
    sarg.rotateX(-Math.PI / 2); sarg.translate(0, y0 + 0.006, 0); vitt.push(sarg);
    const glas = new THREE.ExtrudeGeometry(ringForm(THREE, L + 0.028, W + 0.028, RR + 0.014, 0.003), { depth: 0.045, bevelEnabled: false, curveSegments: 10 });
    glas.rotateX(-Math.PI / 2); glas.translate(0, y0 + 0.038, 0);
    const glasMesh = new THREE.Mesh(glas, M.sargGlas); glasMesh.renderOrder = 2; ar.add(glasMesh);
    // läktarskål: fyra ringar, högre längre ut
    for (let k = 0; k < 4; k++) {
      const o = 0.07 + k * 0.064, tj = 0.064;
      const ring = new THREE.ExtrudeGeometry(ringForm(THREE, L + 2 * o, W + 2 * o, RR + o, tj), { depth: 0.055 + k * 0.04, bevelEnabled: false, curveSegments: 8 });
      ring.rotateX(-Math.PI / 2); ring.translate(0, y0, 0);
      const [lock, sidor] = delaGrupper(THREE, ring);
      for (const x of lock || []) publik.push(skalaUv(x, 1 / 0.16));
      for (const x of sidor || []) tribuner.push(x);
      const kant = rundRekt(THREE, L + 2 * o + tj, W + 2 * o + tj, RR + o + tj / 2);
      for (let i = 0; i < 9; i++) { const pt = kant.getPointAt(rb()); blixtPos.push(pt.x, y0 + 0.062 + k * 0.04, pt.y); }
    }
    // ringbalk + LED-ring + pelare och ljus i hörnen (borstad metall – ingen svart bur)
    const tb = L + 0.86, td = W + 0.86, tr = RR + 0.4;
    metall.push(new THREE.TubeGeometry(rundRektKurva(THREE, tb, td, tr, y0 + 0.62), 140, 0.011, 6, true));
    led.push(new THREE.TubeGeometry(rundRektKurva(THREE, tb - 0.04, td - 0.04, tr - 0.02, y0 + 0.6), 140, 0.005, 5, true));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = x * (tb / 2 - tr * 0.3), pz = z * (td / 2 - tr * 0.3);
      metall.push(med(new THREE.CylinderGeometry(0.012, 0.015, 0.62, 10), px, y0 + 0.31, pz));
      const huvud = new THREE.Vector3(px * 0.82, y0 + 0.6, pz * 0.82);
      kagla(huvud, new THREE.Vector3(px * 0.2, y0, pz * 0.15), 0.03, 0.3, 1);
      halo(0xf2f7ff, 0.14, 0.7, huvud);
    }
    // kuben över mittcirkeln: mörkt hölje, fyra skärmar med ram, svaga LED-ringar
    const kub = new THREE.Group(); kub.position.set(0, y0 + 0.43, 0);
    kub.add(new THREE.Mesh(s.rundadLada(0.22, 0.13, 0.22, 0.014, 2), M.morkStal));
    K.skarm = skarmTextur(V, K);
    const skarmMat = s.stada(new THREE.MeshBasicMaterial({ map: K.skarm, color: new THREE.Color(1, 1, 1).multiplyScalar(1.05) }));
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.098), skarmMat); p.position.set(Math.sin(i * Math.PI / 2) * 0.1105, 0, Math.cos(i * Math.PI / 2) * 0.1105); p.rotation.y = i * Math.PI / 2; kub.add(p); }
    for (const y of [-0.069, 0.069]) { const r = new THREE.Mesh(s.rundadLada(0.226, 0.007, 0.226, 0.003, 1), M.kubLed); r.position.y = y; kub.add(r); }
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) metall.push(med(new THREE.CylinderGeometry(0.0022, 0.0022, 0.3, 4), x * 0.09, y0 + 0.64, z * 0.09));
    // takbågar: fem bågar tvärs över rinken, fackverk och en nock längs mitten (borstad metall)
    const ya = y0 + 0.62, yc = y0 + 0.95, nockY = ya + 0.165;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.25;
      const bage = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, ya, -td / 2), new THREE.Vector3(x, yc, 0), new THREE.Vector3(x, ya, td / 2));
      bagar.push(new THREE.TubeGeometry(bage, 32, i === 2 ? 0.0105 : 0.0088, 8, false));
      if (i < 4) for (const sida of [-1, 1]) {
        const a = bage.getPoint(sida < 0 ? 0.25 : 0.75), b = new THREE.Vector3(x + 0.25, a.y, a.z);
        const st = new THREE.CylinderGeometry(0.0028, 0.0028, a.distanceTo(b), 5); st.rotateZ(Math.PI / 2); st.translate((a.x + b.x) / 2, a.y, a.z); bagar.push(st);
      }
    }
    bagar.push(med(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 8), 0, nockY, 0, 0, 0, Math.PI / 2));
    // glasvalv över den bortre halvan – genomskärning mot betraktaren
    const valv = new THREE.Mesh(valvGlas(THREE, 0.5, ya, yc, td, motKamera > 0 ? 0 : 0.5, motKamera > 0 ? 0.5 : 1), M.takGlas);
    valv.renderOrder = 3; ar.add(valv);
    ar.add(kub); K.kub = kub;
    K.spelplan = { L: L * 0.8, W: W * 0.75, y: y0 + 0.012 };
  } else {
    // ---- fotbollsarena: gräs, läktare runt om, tak på långsidorna, fyra master, mål, storbildsskärm
    const PW = 1.46, PD = 0.99, L = 1.3, W = 0.84;
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), M.gras); plan.rotation.x = -Math.PI / 2; plan.position.y = y0 + 0.012; plan.receiveShadow = true; ar.add(plan);
    const zf = PD / 2 + 0.02, xf = PW / 2 + 0.02;
    const sidor = [
      { langd: PW, steg: 4, ry: -Math.PI / 2, x: 0, z: zf, tak: true },
      { langd: PW, steg: 4, ry: Math.PI / 2, x: 0, z: -zf, tak: true },
      { langd: PD, steg: 3, ry: 0, x: xf, z: 0, tak: false },
      { langd: PD, steg: 3, ry: Math.PI, x: -xf, z: 0, tak: false },
    ];
    for (const sd of sidor) {
      dummy.position.set(sd.x, y0, sd.z); dummy.rotation.set(0, sd.ry, 0); dummy.updateMatrix();
      const mx = dummy.matrix.clone();
      tribuner.push(tribunGeo(THREE, sd.langd, sd.steg).applyMatrix4(mx));
      for (let i = 0; i < sd.steg; i++) {
        const st = new THREE.BoxGeometry(0.06 * 0.84, 0.007, sd.langd - 0.03);
        skalaUv(st, 0.5, (sd.langd - 0.03) / 0.16);
        st.translate(i * 0.06 + 0.03 + 0.004, 0.03 + i * 0.036 + 0.0035, 0);
        publik.push(st.applyMatrix4(mx));
        for (let j = 0; j < (sd.tak ? 3 : 2); j++) { const v = new THREE.Vector3(i * 0.06 + 0.034, 0.042 + i * 0.036, (rb() - 0.5) * (sd.langd - 0.08)).applyMatrix4(mx); blixtPos.push(v.x, v.y, v.z); }
      }
      if (sd.tak) {
        const d4 = 4 * 0.06;
        const takGeo = new THREE.BoxGeometry(0.27, 0.011, sd.langd + 0.06); takGeo.rotateZ(-0.1); takGeo.translate(d4 / 2 + 0.01, 0.37, 0);
        tak.push(takGeo.applyMatrix4(mx));
        const ledGeo = new THREE.BoxGeometry(0.012, 0.006, sd.langd); ledGeo.translate(-0.025, 0.375, 0); led.push(ledGeo.applyMatrix4(mx));
        for (let z = -sd.langd / 2; z <= sd.langd / 2 + 1e-6; z += sd.langd / 8) {
          const rib = new THREE.BoxGeometry(0.28, 0.01, 0.005); rib.rotateZ(-0.1); rib.translate(d4 / 2 + 0.01, 0.381, z); metall.push(rib.applyMatrix4(mx));
        }
        const balk = new THREE.BoxGeometry(0.008, 0.012, sd.langd + 0.06); balk.translate(-0.004, 0.386, 0); morkt.push(balk.applyMatrix4(mx));
        for (const z of [-0.62, -0.21, 0.21, 0.62]) {
          const pel = new THREE.CylinderGeometry(0.007, 0.009, 0.37, 6); pel.translate(d4 + 0.03, 0.185, z); metall.push(pel.applyMatrix4(mx));
          const stag = new THREE.CylinderGeometry(0.003, 0.003, 0.3, 4); stag.rotateZ(0.95); stag.translate(d4 - 0.09, 0.3, z); metall.push(stag.applyMatrix4(mx));
        }
      }
    }
    for (const sida of [-1, 1]) {
      const x = sida * (L / 2 + 0.006);
      vitt.push(med(new THREE.BoxGeometry(0.005, 0.034, 0.005), x, y0 + 0.012 + 0.017, -0.053));
      vitt.push(med(new THREE.BoxGeometry(0.005, 0.034, 0.005), x, y0 + 0.012 + 0.017, 0.053));
      vitt.push(med(new THREE.BoxGeometry(0.005, 0.005, 0.111), x, y0 + 0.012 + 0.034, 0));
      vitt.push(med(new THREE.BoxGeometry(0.03, 0.003, 0.111), x + sida * 0.015, y0 + 0.012 + 0.034, 0));
    }
    for (const [x, z, len, ry] of [[0, PD / 2 - 0.014, PW - 0.16, 0], [0, -(PD / 2 - 0.014), PW - 0.16, Math.PI], [PW / 2 - 0.02, 0, PD * 0.5, -Math.PI / 2], [-(PW / 2 - 0.02), 0, PD * 0.5, Math.PI / 2]]) {
      const tavla = new THREE.BoxGeometry(len, 0.016, 0.003); skalaUv(tavla, len / 0.55, 1);
      reklam.push(med(tavla, x, y0 + 0.012 + 0.008, z, ry));
    }
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const hojd = 0.98, px = x * 0.94, pz = z * 0.69;
      metall.push(med(new THREE.CylinderGeometry(0.008, 0.016, hojd, 8), px, y0 + hojd / 2, pz));
      const huvud = new THREE.Vector3(px, y0 + hojd, pz), mal = new THREE.Vector3(x * 0.18, y0, z * 0.12);
      dummy.position.copy(huvud); dummy.rotation.set(0, 0, 0); dummy.lookAt(mal); dummy.updateMatrix();
      morkt.push(new RoundedBoxGeometry(0.17, 0.11, 0.022, 2, 0.006).applyMatrix4(dummy.matrix));
      metall.push(new THREE.BoxGeometry(0.12, 0.008, 0.008).translate(0, 0, -0.016).applyMatrix4(dummy.matrix));
      const panel = new THREE.PlaneGeometry(0.152, 0.092); panel.translate(0, 0, 0.0115); lampor.push(panel.applyMatrix4(dummy.matrix));
      const rikt = kagla(huvud, mal, 0.06, 0.42);
      halo(0xf2f7ff, 0.13, 0.75, huvud.clone().addScaledVector(rikt, 0.02));
    }
    K.skarm = skarmTextur(V, K);
    const skarmMat = s.stada(new THREE.MeshBasicMaterial({ map: K.skarm, color: new THREE.Color(1, 1, 1).multiplyScalar(1.1) }));
    const skx = xf + 0.24;
    const sk = new THREE.Group(); sk.position.set(skx, y0 + 0.3, 0); sk.rotation.y = -Math.PI / 2;
    const skRam = new THREE.Mesh(s.rundadLada(0.5, 0.19, 0.03, 0.008, 2), M.morkStal); sk.add(skRam); s.skuggor.kasta(skRam);
    for (const sida of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.165), skarmMat); p.position.z = sida * 0.0155; if (sida < 0) p.rotation.y = Math.PI; sk.add(p); }
    for (const z of [-0.17, 0.17]) metall.push(med(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), skx, y0 + 0.11, z));
    ar.add(sk);
    // agilitykoner på ena planhalvan (sprint och riktningsbyten)
    const konGeo = new THREE.ConeGeometry(0.009, 0.022, 10); konGeo.translate(0, 0.011, 0);
    const kon = new THREE.InstancedMesh(konGeo, M.kon, 7);
    for (let i = 0; i < 7; i++) { m4.makeTranslation(-0.42 + i * 0.045, y0 + 0.012, (i % 2 ? 1 : -1) * 0.03 + 0.2); kon.setMatrixAt(i, m4); }
    kon.castShadow = true; ar.add(kon);
    K.spelplan = { L: L * 0.86, W: W * 0.84, y: y0 + 0.012 };
  }

  // sammanslagna delar → få ritanrop
  const lagg = (lista, mat, skugga = true) => { if (!lista.length) return null; const m = new THREE.Mesh(slaIhop(THREE, lista), mat); if (skugga) s.skuggor.kasta(m); ar.add(m); return m; };
  lagg(tribuner, M.betongLjus);
  const pub = lagg(publik, M.publik); if (pub) pub.castShadow = false;
  lagg(metall, M.stal);
  lagg(bagar, M.takBage);
  lagg(morkt, M.morkStal);
  lagg(tak, M.tak);
  lagg(vitt, M.vitt);
  lagg(lampor, M.lampa, false);
  lagg(reklam, M.reklam, false);
  K.takLed = lagg(led, M.takLed, false);
  if (koner.length) { const k = new THREE.Mesh(slaIhop(THREE, koner), K.data.sport === 'is' ? V.konMatSvag : V.konMat); k.renderOrder = 3; ar.add(k); }

  // kamerablixtar i publiken
  {
    const n = Math.min(blixtPos.length / 3, V.lag ? 18 : 40);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(blixtPos.slice(0, n * 3)), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(geo, s.stada(new THREE.PointsMaterial({ size: 0.07, map: s.textur.rund, color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(1.05), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    pts.frustumCulled = false; ar.add(pts);
    K.blixtar = { pts, n, fas: Array.from({ length: n }, () => rb() * 100), fart: Array.from({ length: n }, () => 0.35 + rb() * 0.9) };
  }

  // spelare (två lag) + boll/puck
  const n = V.lag ? 3 : 5;
  const kropp = new THREE.CapsuleGeometry(0.011, 0.026, 3, 8); kropp.translate(0, 0.024, 0);
  K.spelare = [new THREE.InstancedMesh(kropp, M.spelareA, n), new THREE.InstancedMesh(kropp.clone(), M.spelareB, n)];
  const r = slump(hash(K.id));
  K.rorelse = [];
  for (let lag = 0; lag < 2; lag++) {
    const im = K.spelare[lag]; im.castShadow = true; im.frustumCulled = false; ar.add(im);
    for (let i = 0; i < n; i++) K.rorelse.push({ lag, i, x: 0, z: 0, bx: (r() * 2 - 1) * K.spelplan.L * 0.38 + (lag ? 0.12 : -0.12), bz: (r() * 2 - 1) * K.spelplan.W * 0.36, ax: 0.05 + r() * 0.14, az: 0.04 + r() * 0.1, w1: 0.35 + r() * 0.6, w2: 0.3 + r() * 0.55, f: r() * 6.28 });
  }
  K.boll = new THREE.Mesh(K.data.sport === 'is' ? new THREE.CylinderGeometry(0.006, 0.006, 0.003, 10) : new THREE.SphereGeometry(0.006, 10, 8), K.data.sport === 'is' ? s.material.gummi : M.spelareA);
  ar.add(K.boll);

  // träffyta, kontaktskugga och ankare för etiketterna
  const traff = new THREE.Mesh(new THREE.BoxGeometry(BX + 0.2, 1.1, BZ + 0.2), M.betong);
  traff.position.y = 0.55; traff.visible = false; traff.userData.ix = K.ix; g.add(traff);
  V.hitboxar.push(traff);
  const skugga = s.kontaktskugga(BX + 0.6, BZ + 0.6, 0.7); skugga.position.y = 0.002; skugga.userData.ejISpegel = true; g.add(skugga);
  g.updateMatrixWorld(true);
  K.ankare = new THREE.Vector3(0, K.data.sport === 'is' ? 1.1 : 1.04, 0).applyMatrix4(g.matrixWorld);
  // arena längst fram (efter vridningen): etiketten hänger under arenans framkant (skymmer inte kassan och märket bakom)
  K.ankareNere = K.pos.clone().addScaledVector(K.ut, 0.9 * K.skala).setY(0.05);
  // markeringsringen runt arenan ritas av ljusbågarnas shader (i världskoordinater)
  K.markering = rundRektKurva(THREE, BX + 0.18, BZ + 0.18, 0.12, 0.012);
  for (const p of K.markering.points) p.applyMatrix4(g.matrixWorld);
  V.grupp.add(g);
}

// Storbildsskärmens innehåll: klubbens namn och provisionen tillbaka
function skarmTextur(V, K) {
  const k = K.data;
  return V.s.canvasTextur(512, 256, (ctx, b, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d1824'); g.addColorStop(1, '#05090e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
    ctx.fillStyle = '#d9822b'; ctx.fillRect(0, 0, b, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 12; y < h; y += 4) ctx.fillRect(0, y, b, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8e6e0'; ctx.font = '600 44px Poppins, sans-serif';
    let namn = k.namn.toUpperCase(); while (ctx.measureText(namn).width > b - 40 && namn.length > 4) namn = namn.slice(0, -2) + '…';
    ctx.fillText(namn, b / 2, 62);
    ctx.fillStyle = '#f0a65e'; ctx.font = '600 76px Poppins, sans-serif';
    ctx.fillText(kr(k.tillbaka), b / 2, 148);
    ctx.fillStyle = 'rgba(246,244,239,0.66)'; ctx.font = '700 22px Manrope, sans-serif';
    ctx.fillText(`${k.procent} % TILLBAKA TILL KLUBBEN`, b / 2, 214);
  });
}

/* Kassan: rökt glascylinder med mässingsringar uppe och nere, myntstaplar på mörk botten */
function byggKassa(V, K) {
  const { s, THREE, M } = V;
  const pos = K.kassaPos;
  const ks = KS * K.kassaSkala;
  const g = new THREE.Group(); g.position.copy(pos); g.name = `kassa-${K.id}`; g.scale.setScalar(ks);
  g.rotation.y = K.vinkel;
  const prof = [[0.01, 0], [0.205, 0], [0.215, 0.012], [0.215, 0.055], [0.2, 0.07], [0.01, 0.07]].map(([x, y]) => new THREE.Vector2(x, y));
  const fot = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), M.morkStal); s.skuggor.kasta(fot);
  const botten = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.164, 0.006, 48), M.kassaBotten); botten.position.y = 0.073;
  const ror = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.66, 56, 1, true), M.kassaGlas); ror.position.y = 0.07 + 0.33;
  // mässing: ring nere och uppe, fyra stag
  const listNere = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.008, 10, 64), M.massing); listNere.rotation.x = -Math.PI / 2; listNere.position.y = 0.075;
  const krans = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.011, 12, 64), M.massing); krans.rotation.x = -Math.PI / 2; krans.position.y = 0.73;
  const stag = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.66, 8), M.massing);
    st.position.set(Math.sin(a) * 0.181, 0.07 + 0.33, Math.cos(a) * 0.181); stag.push(st);
  }
  // tunn glödring i kransen: starkare när det finns provision att betala
  const glodMat = s.glod(0xff9a3d, 0.6);
  const glod = new THREE.Mesh(new THREE.TorusGeometry(0.157, 0.0032, 6, 64), glodMat); glod.rotation.x = -Math.PI / 2; glod.position.y = 0.722;
  const krusMat = s.stada(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa04a).multiplyScalar(1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const krus = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.17, 48), krusMat); krus.rotation.x = -Math.PI / 2; krus.position.y = 0.735; krus.visible = false;
  const skugga = s.kontaktskugga(0.72, 0.72, 0.7); skugga.position.y = 0.002; skugga.userData.ejISpegel = true;
  // gnistan som blixtrar till när ett mynt landar
  const gnista = s.halo(0xffc27a, 0.3, 1.3); gnista.position.y = 0.74; gnista.material.opacity = 0;
  g.add(skugga, fot, botten, ror, listNere, krans, ...stag, glod, krus, gnista);
  s.skuggor.kasta(listNere); s.skuggor.kasta(krans);
  V.grupp.add(g);
  K.kassa = { g, pos, ks, topp: pos.clone().setY(0.78 * ks), glodMat, krus, krusMat, gnista, krusStart: -9, botten: 0.076 * ks };
}

/* Kvarteret: klubbens partnernätverk på en egen sockel med gator. Introducerade företag blir torn (i mitten, med
   luft emellan), övriga partners låga hus. Sockelns gator och kantlinje är en svagt självlysande karta. */
function byggDistrikt(V, K) {
  const { s, THREE } = V;
  const D = K.D;
  const tex = s.canvasTextur(256, Math.max(96, Math.round((256 * D.d) / D.w)), (ctx, b, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, b, h);
    const sx = b / D.w, sz = h / D.d;
    const x0 = (D.w / 2 - (D.cols * D.cell) / 2) * sx, z0 = (D.d / 2 - (D.rows * D.cell) / 2) * sz;
    ctx.strokeStyle = 'rgba(150,190,230,0.34)'; ctx.lineWidth = 1.3;
    for (let i = 0; i <= D.cols; i++) { const x = x0 + i * D.cell * sx; ctx.beginPath(); ctx.moveTo(x, z0 - 4); ctx.lineTo(x, h - z0 + 4); ctx.stroke(); }
    for (let j = 0; j <= D.rows; j++) { const z = z0 + j * D.cell * sz; ctx.beginPath(); ctx.moveTo(x0 - 4, z); ctx.lineTo(b - x0 + 4, z); ctx.stroke(); }
    // gatlyktor i korsningarna
    ctx.fillStyle = 'rgba(255,214,160,0.75)';
    for (let i = 0; i <= D.cols; i++) for (let j = 0; j <= D.rows; j++) { ctx.beginPath(); ctx.arc(x0 + i * D.cell * sx, z0 + j * D.cell * sz, 1.6, 0, Math.PI * 2); ctx.fill(); }
    // kantlinje
    ctx.strokeStyle = 'rgba(167,210,255,0.42)'; ctx.lineWidth = 1.5;
    const r = 0.07 * K.skala * sx, m = 3;
    ctx.beginPath(); ctx.moveTo(m + r, m); ctx.lineTo(b - m - r, m); ctx.arcTo(b - m, m, b - m, m + r, r); ctx.lineTo(b - m, h - m - r); ctx.arcTo(b - m, h - m, b - m - r, h - m, r);
    ctx.lineTo(m + r, h - m); ctx.arcTo(m, h - m, m, h - m - r, r); ctx.lineTo(m, m + r); ctx.arcTo(m, m, m + r, m, r); ctx.stroke();
  });
  const mat = V.miljo(s.mat('bord', { color: 0x0a121b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85 }), 0.3);
  const geo = new THREE.ExtrudeGeometry(rundRekt(THREE, D.w, D.d, 0.07 * K.skala), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
  normaliseraUv(geo); geo.rotateX(-Math.PI / 2); geo.translate(0, 0.006, 0);
  const sockel = new THREE.Mesh(geo, mat); sockel.name = `kvarter-${K.id}`;
  sockel.position.copy(D.pos); sockel.rotation.y = D.vinkel; sockel.receiveShadow = true; sockel.castShadow = true;
  const skugga = s.kontaktskugga(D.w + 0.35, D.d + 0.35, 0.55); skugga.position.set(D.pos.x, 0.002, D.pos.z); skugga.rotation.z = D.vinkel; skugga.userData.ejISpegel = true;
  const traff = new THREE.Mesh(new THREE.BoxGeometry(D.w, 0.7, D.d), V.M.betong);
  traff.position.set(D.pos.x, 0.35, D.pos.z); traff.rotation.y = D.vinkel; traff.visible = false; traff.userData.ix = K.ix; traff.updateMatrixWorld(true);
  V.hitboxar.push(traff);
  V.grupp.add(sockel, skugga, traff);
  K.sockel = sockel;

  // celler: torn i mitten (helst inte grannar), låga hus i resten
  const celler = [];
  for (let j = 0; j < D.rows; j++) for (let i = 0; i < D.cols; i++) {
    const x = (i - (D.cols - 1) / 2) * D.cell, z = (j - (D.rows - 1) / 2) * D.cell;
    celler.push({ i, j, x, z, d: Math.hypot(x / D.w, z / D.d) });
  }
  celler.sort((a, b) => a.d - b.d);
  const foretag = K.data.foretag.slice().sort((a, b) => (ORDNING[a.tillstand] ?? 9) - (ORDNING[b.tillstand] ?? 9) || b.anstallda - a.anstallda).slice(0, D.nT);
  const tornCeller = [];
  for (const c of celler) {
    if (tornCeller.length >= foretag.length) break;
    if (tornCeller.some((o) => Math.abs(o.i - c.i) <= 1 && Math.abs(o.j - c.j) <= 1)) continue;
    tornCeller.push(c); c.tagen = true;
  }
  for (const c of celler) { if (tornCeller.length >= foretag.length) break; if (!c.tagen) { tornCeller.push(c); c.tagen = true; } }
  const varld = (x, z) => { const [wx, wz] = vrid(x, z, D.vinkel); return new THREE.Vector3(D.pos.x + wx, 0, D.pos.z + wz); };
  K.torn = foretag.map((f, n) => {
    const c = tornCeller[n];
    const ant = f.anstallda || 30;
    const h = (0.42 + 0.62 * klamp((Math.log10(Math.max(5, ant)) - 1) / (Math.log10(250) - 1))) * Math.max(0.8, K.skala);
    return { f, pos: varld(c.x, c.z), h, vinkel: D.vinkel, tillstand: f.tillstand, klubb: K, vaxt: 1, sk: K.skala, avst: c.d };
  });
  const r = slump(hash(K.id) + 99);
  const lediga = celler.filter((c) => !c.tagen);
  for (let i = lediga.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lediga[i], lediga[j]] = [lediga[j], lediga[i]]; }
  K.block = lediga.slice(0, D.nB).map((c) => {
    const p = varld(c.x + (r() - 0.5) * 0.03 * K.skala, c.z + (r() - 0.5) * 0.03 * K.skala);
    return { x: p.x, z: p.z, b: D.cell * (0.5 + r() * 0.26), d: D.cell * (0.5 + r() * 0.26), h: (0.045 + r() * r() * 0.15) * K.skala, rot: D.vinkel, avst: c.d, klubb: K };
  });
}

function byggTornInstanser(V) {
  const { s, THREE, M } = V;
  const alla = V.klubbar.flatMap((K) => K.torn);
  V.torn = alla;
  const n = Math.max(1, alla.length);
  const im = (geo, mat, antal = n, skugga = true) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, antal)); m.frustumCulled = false; m.count = antal === n ? alla.length : antal; if (skugga) { m.castShadow = true; m.receiveShadow = true; } V.grupp.add(m); return m; };
  const enhet = (geo) => { geo.translate(0, 0.5, 0); return geo; };
  const ramGeo = (b, tj, hoj) => { const geo = new THREE.ExtrudeGeometry(ringForm(THREE, b - 2 * tj, b - 2 * tj, 0.004, tj), { depth: hoj, bevelEnabled: false, curveSegments: 2 }); geo.rotateX(-Math.PI / 2); return geo; };
  V.ti = {
    pod: im(s.rundadLada(0.24, 0.03, 0.24, 0.01, 3).translate(0, 0.015, 0), M.morkStal),
    karna: im(enhet(new THREE.BoxGeometry(0.13, 1, 0.13)), M.karna),
    glas: im(enhet(s.rundadLada(0.2, 1, 0.2, 0.016, 3)), M.tornGlas),
    stolpe: im(enhet(new THREE.BoxGeometry(0.011, 1, 0.011)), M.stolpe, alla.length * 4),
    lock: im(s.rundadLada(0.212, 0.016, 0.212, 0.006, 2).translate(0, 0.008, 0), M.stolpe),
    kant: im(ramGeo(0.212, 0.007, 0.024), M.tornKant, n, false),
    tekn: im(s.rundadLada(0.07, 0.04, 0.055, 0.006, 2).translate(0, 0.02, 0), M.morkStal),
    led: im(ramGeo(0.204, 0.004, 0.008), M.tornLed, n, false),
    ant: im(new THREE.CylinderGeometry(0.0032, 0.0055, 0.16, 6).translate(0, 0.08, 0), M.stal),
    ring: im(new THREE.RingGeometry(0.17, 0.19, 48).rotateX(-Math.PI / 2), M.tornRing, n, false),
    skugga: im(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.kontakt, n, false),
  };
  V.ti.stolpe.count = alla.length * 4;
  V.ti.ring.renderOrder = 2; V.ti.skugga.renderOrder = 1; V.ti.kant.renderOrder = 3;
  V.ti.ring.userData.ejISpegel = V.ti.skugga.userData.ejISpegel = true;
  for (const [namn, m] of Object.entries(V.ti)) m.name = `torn-${namn}`;
  // våningar: samma fönsterband på alla torn (tända i statusfärg, släckta svagt synliga)
  V.golv = [];
  for (const t of alla) { const st = Math.max(3, Math.floor((t.h - 0.05) / 0.052)); for (let k = 0; k < st; k++) V.golv.push({ t, y: 0.075 + k * 0.052 }); }
  const golv = new THREE.InstancedMesh(new THREE.BoxGeometry(0.188, 0.0065, 0.188), M.golv, Math.max(1, V.golv.length));
  golv.count = V.golv.length; golv.frustumCulled = false; golv.name = 'torn-golv'; V.grupp.add(golv); V.ti.golv = golv;
  const c = new THREE.Color();
  for (const m of [V.ti.glas, V.ti.ring, V.ti.led, golv]) m.setColorAt(0, c.set(0xffffff));
  alla.forEach((t, i) => {
    const T = TILLSTAND[t.tillstand] || TILLSTAND.ingen;
    V.ti.glas.setColorAt(i, c.set(T.glas));
    V.ti.ring.setColorAt(i, c.set(T.farg).multiplyScalar(T.ring / 2.6));
    V.ti.led.setColorAt(i, c.set(T.farg).multiplyScalar(T.ring / 1.6));
  });
  const r = slump(77);
  V.golv.forEach((gv, i) => {
    const T = TILLSTAND[gv.t.tillstand] || TILLSTAND.ingen;
    gv.tand = r() < T.tand; gv.styrka = T.golv * (0.55 + r() * 0.6);
    golv.setColorAt(i, c.set(T.farg).multiplyScalar(gv.tand ? gv.styrka / 2.2 : 0.15));
  });
  for (const m of [V.ti.glas, V.ti.ring, V.ti.led, golv]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  // flygvarningsljus på antennerna
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, alla.length);
  V.flyg = new THREE.Points(geo, s.stada(new THREE.PointsMaterial({ size: 0.08, map: s.textur.rund, color: new THREE.Color(FARG.rod).multiplyScalar(1.3), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
  V.flyg.frustumCulled = false; V.grupp.add(V.flyg);
}

function byggBlock(V) {
  const { s, THREE, M } = V;
  const alla = V.klubbar.flatMap((K) => K.block);
  V.block = alla;
  const n = Math.max(1, alla.length);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  V.kvarter = new THREE.InstancedMesh(geo, M.kvarter, n);
  V.kvarter.count = alla.length; V.kvarter.frustumCulled = false; V.kvarter.castShadow = true; V.kvarter.receiveShadow = true;
  const c = new THREE.Color();
  V.kvarter.setColorAt(0, c.set(0xffffff));
  alla.forEach((b, i) => V.kvarter.setColorAt(i, c.setHSL(0.58, 0.16, 0.58 + ((i * 37) % 10) / 34)));
  if (V.kvarter.instanceColor) V.kvarter.instanceColor.needsUpdate = true;
  V.kvarter.name = 'kvarter-hus';
  const takGeo = new THREE.BoxGeometry(1, 1, 1); takGeo.translate(0, 0.5, 0);
  V.kvarterTak = new THREE.InstancedMesh(takGeo, M.kvarterTak, n);
  V.kvarterTak.count = alla.length; V.kvarterTak.frustumCulled = false; V.kvarterTak.name = 'kvarter-tak';
  V.grupp.add(V.kvarter, V.kvarterTak);
  // noder: en liten lampa på varje tak (signalen sprider sig ut från klubben)
  const pos = new Float32Array(n * 3);
  alla.forEach((b, i) => { pos[i * 3] = b.x; pos[i * 3 + 1] = TOPP_D + b.h + 0.02; pos[i * 3 + 2] = b.z; });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  pg.setDrawRange(0, alla.length);
  V.noder = new THREE.Points(pg, s.stada(new THREE.PointsMaterial({ size: 0.065, map: s.textur.rund, color: new THREE.Color(FARG.is).multiplyScalar(1.05), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  V.noder.frustumCulled = false; V.grupp.add(V.noder);
}

/* Ljusbågarna (en sammanslagen geometri), ljuspaketen och mynten */
function byggFloden(V) {
  const { THREE } = V;
  const C = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const upp = new THREE.Vector3(0, 1, 0);
  const lista = [];
  const seg = V.lag ? 44 : 72, rs = V.lag ? 5 : 6;
  const NAV = new THREE.Vector3(0, 1.3, 0);
  V.paketBagar = [];
  for (const K of V.klubbar) {
    const k = K.data;
    for (const t of K.torn) {
      const topp = t.pos.clone().setY(TOPP_D + t.h + 0.24);
      // introduktion: klubb → företag (bara vald klubb)
      const mot = t.pos.clone().sub(K.pos).setY(0).normalize();
      const fran = K.pos.clone().addScaledVector(mot, 0.82 * K.skala).setY(0.42 * K.skala);
      const intro = new THREE.CubicBezierCurve3(fran, fran.clone().addScaledVector(upp, 0.42).addScaledVector(mot, 0.12), topp.clone().addScaledVector(upp, 0.42), topp);
      lista.push({ kurva: intro, farg: C(FARG.is, 0.95), fart: 0.22, streck: 1, styrka: 1.6, start: 0.18, grupp: K.ix, klass: 2 });
      V.paketBagar.push({ kurva: intro, fart: 0.22, streck: 1, farg: C(FARG.is, 1), grupp: K.ix, klass: 2 });
      // affär: företag → Uperformance (öppen = aktiv, syns i översikten; signerad = bara vald klubb)
      if (t.tillstand === 'signerad' || t.tillstand === 'oppen') {
        const sign = t.tillstand === 'signerad';
        const rikt = t.pos.clone().setY(0).normalize();
        const slut = NAV.clone().addScaledVector(rikt, 0.4);
        const avst = topp.distanceTo(slut);
        const affar = new THREE.CubicBezierCurve3(topp, topp.clone().addScaledVector(upp, 0.4 + avst * 0.14), slut.clone().addScaledVector(rikt, avst * 0.34).addScaledVector(upp, 0.45 + avst * 0.08), slut);
        lista.push({ kurva: affar, farg: sign ? C(FARG.mint, 1.4) : C(FARG.is, 1.0), fart: sign ? 0.45 : 0.24, streck: sign ? 2 : 1, styrka: sign ? 2.6 : 1.9, start: 0.4, grupp: K.ix, klass: sign ? 2 : 1 });
        V.paketBagar.push({ kurva: affar, fart: sign ? 0.45 : 0.24, streck: sign ? 2 : 1, farg: sign ? C(FARG.mint, 1.2) : C(FARG.is, 0.85), grupp: K.ix, klass: sign ? 2 : 1 });
      }
    }
    // provision: Uperformance → klubbens kassa (alltid)
    const verklig = k.utbetalt + k.attBetala + k.upplupen;
    if (verklig > 0 || k.prognos > 0) {
      const rikt = K.kassa.pos.clone().setY(0).normalize();
      const start = new THREE.Vector3(0, 0.95, 0).addScaledVector(rikt, 0.5);
      const slut = K.kassa.topp.clone().setY(0.8 * K.kassa.ks);
      const prov = new THREE.CubicBezierCurve3(start, start.clone().addScaledVector(upp, 0.55).addScaledVector(rikt, 0.18), slut.clone().addScaledVector(upp, 0.7), slut);
      const aktiv = k.attBetala > 0, real = verklig > 0;
      const fart = aktiv ? 0.4 : real ? 0.28 : 0.16, streck = aktiv ? 3 : real ? 2 : 1;
      lista.push({ kurva: prov, farg: C(0xff9a3d, real ? 1.4 : 0.75), fart, streck, styrka: aktiv ? 3.0 : real ? 2.1 : 1.1, start: 0.62, grupp: K.ix, klass: 0 });
      K.prov = { kurva: prov, fart, streck, spoke: !real, senast: [] };
    } else K.prov = null;
    // markeringsring runt arenan (vald eller hovrad klubb)
    lista.push({ kurva: K.markering, sluten: true, farg: C(0xff9a3d, 1.5), fart: 0.08, streck: 16, styrka: 1.4, start: 0, grupp: K.ix, klass: 3, seg: 180, radie: 0.008 });
  }
  // kassaringen och märkets ring
  lista.push({ kurva: cirkelKurva(THREE, V.rK, 0.012, 128), sluten: true, farg: C(0xff9a3d, 0.9), fart: 0.03, streck: 5, styrka: 2.2, start: 0.05, grupp: -1, klass: 0, seg: 240, radie: 0.006 });

  let antal = 0;
  const delar = lista.map((b) => {
    const t = new THREE.TubeGeometry(b.kurva, b.seg || seg, b.radie || 0.015, rs, !!b.sluten);
    const g = t.toNonIndexed(); t.dispose(); antal += g.attributes.position.count; return [g, b];
  });
  const pos = new Float32Array(antal * 3), nor = new Float32Array(antal * 3), uv = new Float32Array(antal * 2);
  const farg = new Float32Array(antal * 3), flode = new Float32Array(antal * 4), info = new Float32Array(antal * 3);
  let o = 0;
  for (const [g, b] of delar) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < c; i++) {
      const j = o + i;
      farg[j * 3] = b.farg.r; farg[j * 3 + 1] = b.farg.g; farg[j * 3 + 2] = b.farg.b;
      flode[j * 4] = b.fart; flode[j * 4 + 1] = b.streck; flode[j * 4 + 2] = b.styrka; flode[j * 4 + 3] = b.start || 0;
      info[j * 3] = b.grupp ?? -1; info[j * 3 + 1] = b.klass || 0; info[j * 3 + 2] = b.sluten ? 1 : 0;
    }
    o += c; g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aFarg', new THREE.BufferAttribute(farg, 3)); geo.setAttribute('aFlode', new THREE.BufferAttribute(flode, 4)); geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  V.floden = new THREE.Mesh(geo, V.flodeMat); V.floden.frustumCulled = false; V.floden.renderOrder = 4; V.floden.name = 'ljusbagar';
  V.grupp.add(V.floden);

  // ljuspaket i pulsernas spetsar + svans efter de flygande mynten
  let np = 0; for (const b of V.paketBagar) np += b.streck;
  let ns = 0; for (const K of V.klubbar) if (K.prov) ns += K.prov.streck * 4;
  const punkter = (antal2, storlek) => {
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, antal2) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, antal2) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setDrawRange(0, antal2);
    const p = new THREE.Points(pg, V.s.stada(new THREE.PointsMaterial({ size: storlek, map: V.s.textur.rund, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
    p.frustumCulled = false; p.renderOrder = 5; V.grupp.add(p); return p;
  };
  V.paket = punkter(np, 0.1); V.paket.name = 'ljuspaket';
  V.svans = punkter(ns, 0.07); V.svans.name = 'myntsvans';
}

// Mynt: svarvade med upphöjd, präglad kant. Tre staplar per kassa (utbetald, att betala, upplupen) på mörk botten;
// prognos svävar ovanför som genomskinliga mynt. Flygande mynt i guld på provisionsbågarna.
function byggMynt(V) {
  const { THREE, M } = V;
  const mp = [[0, -0.006], [0.046, -0.006], [0.0505, -0.0042], [0.0505, 0.0042], [0.046, 0.006], [0.0405, 0.006], [0.038, 0.0032], [0, 0.0032]].map(([x, y]) => new THREE.Vector2(x, y));
  const myntGeo = new THREE.LatheGeometry(mp, V.lag ? 18 : 32); myntGeo.scale(KS, KS, KS);
  const maxBelopp = Math.max(0, ...V.klubbar.flatMap((K) => [K.data.utbetalt, K.data.attBetala, K.data.upplupen]));
  const maxPrognos = Math.max(0, ...V.klubbar.map((K) => K.data.prognos));
  const antalFor = (belopp, max, tak) => (belopp > 0 && max > 0 ? Math.max(1, Math.round((belopp / max) * tak)) : 0);
  const stap = { utbetald: [], 'att-betala': [], upplupen: [], prognos: [] };
  const KOL = { utbetald: 0, 'att-betala': 1, upplupen: 2 };
  for (const K of V.klubbar) {
    const r = slump(hash(K.id) + 3);
    const ks = K.kassa.ks;
    let hogst = K.kassa.botten;
    for (const [st, belopp] of [['utbetald', K.data.utbetalt], ['att-betala', K.data.attBetala], ['upplupen', K.data.upplupen]]) {
      const n = antalFor(belopp, maxBelopp, 22);
      // kolumnerna i en triangel, "att betala" närmast betraktaren (översiktskameran står på +z)
      const a = (KOL[st] - 1) * (Math.PI * 2 / 3);
      const cx = K.kassa.pos.x + Math.sin(a) * 0.072 * ks, cz = K.kassa.pos.z + Math.cos(a) * 0.072 * ks;
      let y = K.kassa.botten + 0.0062 * ks;
      for (let i = 0; i < n; i++) { stap[st].push({ K, x: cx + (r() - 0.5) * 0.006, y, z: cz + (r() - 0.5) * 0.006, rot: r() * 6.28 }); y += 0.0124 * KS * K.kassaSkala; }
      hogst = Math.max(hogst, y);
    }
    K.stapelTopp = hogst;
    const np2 = antalFor(K.data.prognos, maxPrognos, 9);
    for (let i = 0; i < np2; i++) stap.prognos.push({ K, x: K.kassa.pos.x + (r() - 0.5) * 0.03, y: hogst + 0.05 + i * 0.018 * KS, z: K.kassa.pos.z + (r() - 0.5) * 0.03, rot: r() * 6.28, lut: (r() - 0.5) * 0.14, svav: r() * 6.28 });
  }
  V.staplar = {};
  const matFor = { utbetald: M.guld, 'att-betala': M.glodMynt, upplupen: M.silver, prognos: M.spoke };
  for (const st of Object.keys(stap)) {
    const lista2 = stap[st].sort((a, b) => a.y - b.y); // alla kassor fylls samtidigt i entrén
    const im = new THREE.InstancedMesh(myntGeo, matFor[st], Math.max(1, lista2.length));
    im.count = 0; im.frustumCulled = false; im.name = `mynt-${st}`; if (st !== 'prognos') { im.castShadow = true; im.receiveShadow = true; }
    V.grupp.add(im); V.staplar[st] = { im, lista: lista2 };
  }
  let nf = 0, ns = 0;
  for (const K of V.klubbar) if (K.prov) { if (K.prov.spoke) ns += K.prov.streck; else nf += K.prov.streck; }
  V.flygMynt = new THREE.InstancedMesh(myntGeo, M.glodMynt, Math.max(1, nf)); V.flygMynt.count = nf; V.flygMynt.frustumCulled = false; V.flygMynt.name = 'mynt-flyger';
  V.spokMynt = new THREE.InstancedMesh(myntGeo, M.spoke, Math.max(1, ns)); V.spokMynt.count = ns; V.spokMynt.frustumCulled = false;
  V.grupp.add(V.flygMynt, V.spokMynt);
}

/* Projicerade HTML-etiketter */
function byggEtiketter(V) {
  const lager = hjalte && hjalte.querySelector('[data-kb3d-etiketter]');
  V.lager = lager;
  if (!lager) return;
  const d = V.d;
  const html = [];
  for (const K of V.klubbar) {
    const k = K.data;
    html.push(`<button type="button" class="kb3d-pin kb3d-pin-klubb${k.attBetala > 0 ? ' kb3d-pin-betala' : ''}" data-kb3d-valj="${e(k.id)}" data-kb3d-pin="k${K.ix}" tabindex="-1"><span class="kb3d-pin-inre"><span class="kb3d-pin-namn"><i class="kb3d-val-prick kb3d-val-${k.sport}"></i>${e(k.namn)}</span><span class="kb3d-pin-belopp">${k.tillbaka > 0 ? `${e(kr(k.tillbaka))}<small> provision</small>` : '<small class="kb3d-pin-noll">ingen provision än</small>'}${k.attBetala > 0 ? `<em class="kb3d-pin-betala-tagg" title="${e(kr(k.attBetala))} att betala">att betala</em>` : ''}</span><span class="kb3d-pin-under">${e(k.introducerade)} ${k.introducerade === 1 ? 'företag' : 'företag'} introducerade${k.vunna ? ` · ${e(k.vunna)} ${k.vunna === 1 ? 'har blivit kund' : 'har blivit kunder'}` : ''}</span></span></button>`);
    K.torn.forEach((t, j) => {
      const f = t.f;
      const belopp = f.provision > 0 ? `${kr(f.provision)} till klubben` : f.prognos > 0 ? `prognos ${kr(f.prognos)}` : '';
      html.push(`<a class="kb3d-pin kb3d-pin-foretag kb3d-pin-${f.tillstand}" href="#/kund/${e(f.id)}" tabindex="-1" title="Öppna ${e(f.namn)}" data-kb3d-pin="t${K.ix}-${j}"><span class="kb3d-pin-inre"><span class="kb3d-pin-namn">${e(f.namn)}</span><span class="kb3d-pin-under">${e(f.stegText)}${belopp ? ` · ${e(belopp)}` : ''}</span></span></a>`);
    });
  }
  // märkena 1 och 3: ett introducerat företag (det första tornet hos klubben som har flest) och kassan hos klubben med mest provision
  const medTorn = [...V.klubbar].filter((K) => K.torn.length).sort((a, b) => b.torn.length - a.torn.length)[0];
  const medKassa = [...V.klubbar].filter((K) => K.kassa).sort((a, b) => b.data.tillbaka - a.data.tillbaka)[0];
  if (medTorn) html.push(`<span class="kb3d-pin kb3d-pin-steg" data-kb3d-pin="steg1"><span class="kb3d-pin-inre"><span class="kb3d-pin-namn"><b class="kb3d-nr">1</b><span class="kb3d-steg-text">Klubben tipsar</span></span></span></span>`);
  if (medKassa) html.push(`<span class="kb3d-pin kb3d-pin-steg" data-kb3d-pin="steg3"><span class="kb3d-pin-inre"><span class="kb3d-pin-namn"><b class="kb3d-nr">3</b><span class="kb3d-steg-text">${e(d.procent)} % tillbaka</span></span></span></span>`);
  // märke 2 vid Uperformance-märket i mitten: samma lilla etikett som 1 och 3 (beloppet vunnet via klubbar står i hjältens steg 2)
  html.push(`<span class="kb3d-pin kb3d-pin-steg kb3d-pin-nav" data-kb3d-pin="nav"><span class="kb3d-pin-inre"><span class="kb3d-pin-namn"><b class="kb3d-nr">2</b><span class="kb3d-steg-text">Blir kund</span></span></span></span>`);
  lager.innerHTML = html.join('');
  const finns = (namn) => lager.querySelector(`[data-kb3d-pin="${namn}"]`);
  V.etiketter = [];
  for (const K of V.klubbar) {
    V.etiketter.push({ el: finns(`k${K.ix}`), K, ankare: K.ankare, klubb: -1, egen: K.ix, prio: 0, glapp: 14, x: -1, y: -1, syns: null, lyft: 0 });
    K.torn.forEach((t, j) => V.etiketter.push({ el: finns(`t${K.ix}-${j}`), ankare: t.pos.clone().setY(TOPP_D + t.h + 0.3), klubb: K.ix, egen: K.ix, prio: 2, glapp: 10, x: -1, y: -1, syns: null, lyft: 0 }));
  }
  // märke 2 sitter vid mittplattformens framkant (under märket – ovanför det krockade det med skyltarna högst upp)
  V.etiketter.push({ el: finns('nav'), ankare: new V.THREE.Vector3(0, 0.5, 1.0), klubb: -1, egen: -1, prio: 2, glapp: 9, x: -1, y: -1, syns: null, lyft: 0 });
  if (medTorn && finns('steg1')) { const t = medTorn.torn[0]; V.etiketter.push({ el: finns('steg1'), ankare: t.pos.clone().setY(TOPP_D + t.h + 0.12), klubb: -1, egen: -1, prio: 3, glapp: 9, x: -1, y: -1, syns: null, lyft: 0 }); }
  if (medKassa && finns('steg3')) V.etiketter.push({ el: finns('steg3'), ankare: medKassa.kassa.topp.clone().setY(medKassa.kassa.topp.y + 0.12), klubb: -1, egen: -1, prio: 3, glapp: 9, x: -1, y: -1, syns: null, lyft: 0 });
  if (vald) lager.querySelectorAll('.kb3d-pin-klubb').forEach((b) => b.toggleAttribute('data-vald', b.getAttribute('data-kb3d-valj') === vald));
}

/* 06-entrén, kameran och varje bildruta ------------------------------------------------------------ */
function skrivIntro(V, p) {
  const { m, q, p: P, sk: S, y: Y, v: Vt } = V.tmp;
  const vaxt = (fordrojning, langd = 0.9) => klamp((p * 2.8 - fordrojning) / langd);
  // arenor reser sig, kvarterens socklar lyfts upp
  for (const K of V.klubbar) {
    const a = utBak(vaxt(0.15 + K.ix * 0.22));
    K.inre.scale.set(1, Math.max(0.001, a), 1);
    K.inre.visible = a > 0.002;
    K.sockel.scale.set(1, Math.max(0.001, utKub(vaxt(0.25 + K.ix * 0.22, 0.6))), 1);
  }
  // tornen växer (kärna, glas, hörnstolpar, våningar; tak med glaskant, teknikbox, ljuslist och antenn)
  if (V.torn.length) {
    const ti = V.ti;
    const fp = V.flyg.geometry.attributes.position;
    V.torn.forEach((t, i) => {
      const a = utKub(vaxt(0.55 + t.klubb.ix * 0.2 + t.avst * 0.6));
      const h = Math.max(0.001, t.h * a), sk = t.sk, y0 = TOPP_D, syn = a > 0.01 ? 1 : 0.001;
      q.setFromAxisAngle(Y, t.vinkel);
      ti.pod.setMatrixAt(i, m.compose(P.set(t.pos.x, y0, t.pos.z), q, S.set(sk, Math.max(0.001, a), sk)));
      ti.karna.setMatrixAt(i, m.compose(P.set(t.pos.x, y0 + 0.03, t.pos.z), q, S.set(sk, h * 0.99, sk)));
      ti.glas.setMatrixAt(i, m.compose(P.set(t.pos.x, y0 + 0.03, t.pos.z), q, S.set(sk, h, sk)));
      for (let c = 0; c < 4; c++) {
        Vt.set((c & 1 ? 1 : -1) * 0.0985 * sk, 0, (c & 2 ? 1 : -1) * 0.0985 * sk).applyQuaternion(q);
        ti.stolpe.setMatrixAt(i * 4 + c, m.compose(P.set(t.pos.x + Vt.x, y0 + 0.03, t.pos.z + Vt.z), q, S.set(sk, h, sk)));
      }
      const tak = y0 + 0.03 + h;
      ti.lock.setMatrixAt(i, m.compose(P.set(t.pos.x, tak, t.pos.z), q, S.set(sk, syn, sk)));
      ti.kant.setMatrixAt(i, m.compose(P.set(t.pos.x, tak + 0.012, t.pos.z), q, S.set(sk, syn, sk)));
      ti.led.setMatrixAt(i, m.compose(P.set(t.pos.x, tak - 0.018, t.pos.z), q, S.set(sk, syn, sk)));
      Vt.set(0.035 * sk, 0, -0.03 * sk).applyQuaternion(q);
      ti.tekn.setMatrixAt(i, m.compose(P.set(t.pos.x + Vt.x, tak + 0.014, t.pos.z + Vt.z), q, S.set(sk, syn, sk)));
      Vt.set(-0.055 * sk, 0, 0.05 * sk).applyQuaternion(q);
      ti.ant.setMatrixAt(i, m.compose(P.set(t.pos.x + Vt.x, tak + 0.014, t.pos.z + Vt.z), q, S.set(sk, Math.max(0.001, a), sk)));
      ti.ring.setMatrixAt(i, m.compose(P.set(t.pos.x, y0 + 0.002, t.pos.z), q, S.setScalar(Math.max(0.001, a) * sk)));
      ti.skugga.setMatrixAt(i, m.compose(P.set(t.pos.x, y0 + 0.001, t.pos.z), q, S.set(0.34 * sk, 1, 0.34 * sk)));
      t.vaxt = a;
      fp.setXYZ(i, t.pos.x + Vt.x, tak + 0.014 + 0.165 * sk * a, t.pos.z + Vt.z);
    });
    fp.needsUpdate = true;
    V.golv.forEach((gv, i) => {
      const t = gv.t; const syns = gv.y < t.h * t.vaxt;
      q.setFromAxisAngle(Y, t.vinkel);
      ti.golv.setMatrixAt(i, m.compose(P.set(t.pos.x, TOPP_D + gv.y, t.pos.z), q, S.set(syns ? t.sk : 0.0001, 1, syns ? t.sk : 0.0001)));
    });
    for (const k of Object.keys(ti)) ti[k].instanceMatrix.needsUpdate = true;
  }
  // kvarterens hus
  V.block.forEach((b, i) => {
    const a = utKub(vaxt(0.35 + b.klubb.ix * 0.2 + b.avst * 0.8, 0.7));
    b.vaxt = a;
    q.setFromAxisAngle(Y, b.rot);
    const h = Math.max(0.001, b.h * a);
    V.kvarter.setMatrixAt(i, m.compose(P.set(b.x, TOPP_D, b.z), q, S.set(b.b, h, b.d)));
    V.kvarterTak.setMatrixAt(i, m.compose(P.set(b.x, TOPP_D + h, b.z), q, S.set(b.b * 0.84, a > 0.02 ? 0.006 : 0.0001, b.d * 0.84)));
  });
  V.kvarter.instanceMatrix.needsUpdate = true; V.kvarterTak.instanceMatrix.needsUpdate = true;
  // myntstaplarna fylls på
  const fyll = p >= 1 ? 1 : klamp(p * 1.6 - 0.62);
  for (const st of Object.keys(V.staplar)) {
    const { im, lista } = V.staplar[st];
    im.count = Math.min(lista.length, Math.floor(lista.length * fyll + (p >= 1 ? 1 : 0)));
    if (st !== 'prognos') {
      lista.forEach((c, i) => { q.setFromAxisAngle(Y, c.rot); im.setMatrixAt(i, m.compose(P.set(c.x, c.y, c.z), q, S.setScalar(c.K.kassaSkala))); });
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

/* Kameran: modellen ramas in i ytan till höger om texten (bred) eller hela duken (staplad). Projektionen
   förskjuts med setViewOffset så att ytan är kamerans "hela bild" – sedan räcker det att få punkterna inom −1…1. */
function storlek(V, w, h) {
  const { s, THREE } = V;
  V.layout.w = w; V.layout.h = h;
  let smal = w < 560, textHoger = 0, toppNere = 0, valUppe = h;
  const t = hjalte && hjalte.querySelector('.kb3d-text');
  const cr = s.canvas.getBoundingClientRect();
  if (t && cr.width > 2) {
    let stapel = false;
    try { stapel = getComputedStyle(t).display === 'contents'; } catch (err) { /* frånkopplad */ }
    if (stapel) {
      // mobil: rubriken ligger överst i scenen och klubbknapparna nederst
      smal = true;
      const tp = hjalte.querySelector('.kb3d-topp'), kv = hjalte.querySelector('.kb3d-klubbval');
      if (tp) toppNere = klamp(tp.getBoundingClientRect().bottom - cr.top, 0, h * 0.42);
      if (kv && kv.offsetHeight) valUppe = klamp(kv.getBoundingClientRect().top - cr.top, h * 0.6, h);
    } else { const tr = t.getBoundingClientRect(); if (tr.width > 2) textHoger = klamp(tr.right - cr.left, 0, w * 0.62); }
  }
  V.layout.smal = smal; V.layout.textHoger = smal ? 0 : textHoger;
  const rad = hjalte && hjalte.querySelector('[data-kb3d-klubbval]');
  if (rad) rad.toggleAttribute('data-skrollar', rad.scrollWidth > rad.clientWidth + 2);
  // etiketter får inte hamna över rubriken eller klubbknapparna (mobil)
  V.layout.etikettTopp = smal ? toppNere + 2 : 2;
  V.layout.etikettBotten = smal ? valUppe - 2 : h - 2;
  const reg = smal ? { x0: 2, x1: w - 2, y0: Math.max(20, toppNere - 6), y1: Math.min(h - 4, valUppe + 10) } : { x0: textHoger + 4, x1: w - 14, y0: 44, y1: h - 12 };
  const rw = Math.max(40, reg.x1 - reg.x0), rh = Math.max(40, reg.y1 - reg.y0);
  V.region = reg;
  const cam = s.camera;
  cam.fov = smal ? 32 : 28;
  cam.setViewOffset(rw, rh, -reg.x0, -reg.y0, w, h);
  const pk = V.provkamera || (V.provkamera = new THREE.PerspectiveCamera());
  pk.fov = cam.fov; pk.aspect = rw / rh; pk.near = cam.near; pk.far = cam.far; pk.updateProjectionMatrix();
  V.fokusCache = {};
  spegelStorlek(V, w, h);
  if (!V.oversiktPunkter) return;
  // bred och låg yta: lägre kamera (modellen blir en bred ellips som fyller ytan)
  const elev = smal ? 0.5 : 0.44;
  const r = rama(V, V.oversiktPunkter, elev, 0, smal ? { x0: -1.04, x1: 1.04, y0: -0.98, y1: 0.98 } : { x0: -0.98, x1: 0.98, y0: -0.98, y1: 0.98 });
  V.kam.basMal = r.mal; V.kam.basDist = r.dist; V.kam.basElev = elev;
  if (!V.kam.init) {
    V.kam.dist = V.kam.basDist * (V.introKlar ? 1 : 1.3); V.kam.mal.copy(V.kam.basMal);
    V.kam.az = V.introKlar ? 0 : -0.45; V.kam.elev = V.introKlar ? elev : 0.86; V.kam.init = true;
  }
}

// Kortaste avstånd där alla punkter ryms inom gränserna (NDC i ytan), med målet förskjutet så att bilden centreras
function rama(V, punkter, elev, az, b) {
  const { THREE } = V; const kam = V.provkamera; const p = V.tmp.v3;
  const rikt = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
  const mal = new THREE.Vector3();
  for (const q of punkter) mal.add(q);
  mal.multiplyScalar(1 / Math.max(1, punkter.length));
  const hoger = new THREE.Vector3(), upp = new THREE.Vector3(), fram = new THREE.Vector3();
  const box = (d) => {
    kam.position.copy(mal).addScaledVector(rikt, d); kam.lookAt(mal); kam.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, bakom = false;
    for (const q of punkter) { p.copy(q).project(kam); if (p.z > 1 || p.z < -1) bakom = true; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return { x0, x1, y0, y1, bakom };
  };
  let dist = 12;
  for (let varv = 0; varv < 5; varv++) {
    let lo = 1.2, hi = 90;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; const r = box(mid); if (!r.bakom && r.x0 >= b.x0 && r.x1 <= b.x1 && r.y0 >= b.y0 && r.y1 <= b.y1) hi = mid; else lo = mid; }
    dist = hi;
    const r = box(dist);
    const cx = (r.x0 + r.x1) / 2 - (b.x0 + b.x1) / 2, cy = (r.y0 + r.y1) / 2 - (b.y0 + b.y1) / 2;
    fram.copy(rikt).negate(); hoger.crossVectors(fram, kam.up).normalize(); upp.crossVectors(hoger, fram);
    const halvH = Math.tan(THREE.MathUtils.degToRad(kam.fov / 2)) * dist, halvB = halvH * kam.aspect;
    mal.addScaledVector(hoger, cx * halvB * 0.9).addScaledVector(upp, cy * halvH * 0.9);
  }
  return { mal, dist };
}

// Vald klubb: vridskivan vrider klubben fram mot betraktaren och kameran går närmare (klubben mitt i ytan till höger
// om texten). Ramen räknas på klubbens punkter i slutläget; zoomen begränsas så att grannarna inte hamnar under texten.
function fokusFor(V, K) {
  const nyckel = `${K.ix}|${V.layout.w}|${V.layout.h}|${V.layout.textHoger}`;
  if (!V.fokusCache[nyckel]) {
    const v = -K.mittVinkel;
    const pts = K.fokusPunkter.map((p) => rotera(p, v, new V.THREE.Vector3()));
    const b = V.layout.smal ? { x0: -0.94, x1: 0.94, y0: -0.92, y1: 0.5 } : { x0: -0.8, x1: 0.8, y0: -0.9, y1: 0.42 };
    const r = rama(V, pts, ELEV_FOKUS, 0, b);
    V.fokusCache[nyckel] = { mal: r.mal, dist: Math.max(2.6, r.dist, V.kam.basDist * 0.5) };
  }
  return V.fokusCache[nyckel];
}

const sstep = (a, b, x) => { const t = klamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function dimmFaktor(V, p) {
  const u = V.dimmUni, f = V.fokusLokal;
  const d = Math.hypot(p.x - f.x, p.z - f.z);
  return u.uKbDimm.value + (1 - u.uKbDimm.value) * (1 - sstep(u.uKbR.value.x, u.uKbR.value.y, d));
}

function ram(V, t, dt) {
  const { s } = V;
  const T = V.tmp;
  const lugn = s.lugn;
  // entrén
  let intro = 1;
  if (!V.introKlar) {
    intro = lugn ? 1 : klamp((t - V.t0) / 3.4);
    skrivIntro(V, intro);
    if (intro >= 1) V.introKlar = true;
  }
  const lager = V.lager;
  if (lager && intro > 0.62 && !lager.hasAttribute('data-klar')) lager.setAttribute('data-klar', '');
  const kd = dt > 0 ? 1 - Math.exp(-dt * 3.2) : 1;
  const KV = V.vald >= 0 ? V.klubbar[V.vald] : null;

  // vridskivan: vald klubb vrids fram (kortaste vägen), tillbaka till grundläget när ingen är vald
  {
    const varv = Math.PI * 2;
    let mal = KV ? -KV.mittVinkel : 0;
    mal += Math.round((V.vrid - mal) / varv) * varv;
    const kv = lugn || dt <= 0 ? 1 : 1 - Math.exp(-dt * 2.3);
    V.vrid += (mal - V.vrid) * kv;
    if (Math.abs(mal - V.vrid) < 1e-4) V.vrid = Math.atan2(Math.sin(mal), Math.cos(mal));
    if (V.grupp) V.grupp.rotation.y = V.vrid;
  }

  // kameran: översikt eller fokus på vald klubb
  const kam = V.kam;
  if (kam.basMal) {
    const malMal = T.v2;
    let dist, az, elev;
    if (KV) { const fk = fokusFor(V, KV); malMal.copy(fk.mal); dist = fk.dist; az = 0; elev = ELEV_FOKUS; }
    else { malMal.copy(kam.basMal); dist = kam.basDist; az = 0; elev = kam.basElev; }
    const k = dt > 0 ? 1 - Math.exp(-dt * (V.introKlar ? 2.0 : 0.85)) : (V.introKlar ? 1 : 0);
    kam.mal.lerp(malMal, k); kam.dist += (dist - kam.dist) * k; kam.az += (az - kam.az) * k; kam.elev += (elev - kam.elev) * k;
    const a = kam.az + (lugn ? 0 : Math.sin(t * 0.06) * 0.06 * (KV ? 0.4 : 1));
    V.kamAz = a; V.kamElev = kam.elev;
    const ks = s.kamerastyr;
    ks.mal.copy(kam.mal);
    ks.position.set(kam.mal.x + Math.sin(a) * Math.cos(kam.elev) * kam.dist, kam.mal.y + Math.sin(kam.elev) * kam.dist, kam.mal.z + Math.cos(a) * Math.cos(kam.elev) * kam.dist);
    // motorn läser kamerastyr före ram-funktionerna: en stillbild (minskad rörelse) eller första bilden skulle annars
    // ritas med förra lägets kamera – sätt kameran direkt då (ingen parallax/andning att bevara i de lägena)
    if (lugn || dt <= 0) { s.camera.position.copy(ks.position); s.camera.lookAt(ks.mal); s.camera.updateMatrixWorld(); }
  }

  // hovring (bara mus): träffytor under pekaren, inte bakom texten
  let hov = -1;
  if (s.pekare.over && V.introKlar && V.hitboxar.length) {
    const px = ((s.pekare.x + 1) / 2) * V.layout.w;
    if (V.layout.smal || px > V.layout.textHoger) { const h = s.traffa(V.hitboxar, false); if (h.length) hov = h[0].object.userData.ix; }
  }
  // pekaren över modellen (inte texten): skyltarna viker undan så att animeringen syns – den man pekar på står kvar
  const pekar = !!(s.pekare.over && V.introKlar && !V.layout.smal && ((s.pekare.x + 1) / 2) * V.layout.w > V.layout.textHoger);
  if (lager && pekar !== V.pekar) { V.pekar = pekar; lager.toggleAttribute('data-pekar', pekar); }
  if (hov !== V.hover) {
    V.hover = hov;
    const duk = hjalte && hjalte.querySelector('[data-kb3d-duk]'); if (duk) duk.style.cursor = hov >= 0 ? 'pointer' : '';
    if (lager) lager.querySelectorAll('.kb3d-pin-klubb').forEach((el) => el.toggleAttribute('data-hover', el.getAttribute('data-kb3d-pin') === `k${hov}`));
  }

  // bågarnas vikter per klubb (mjuka övergångar mellan översikt och vald klubb)
  const W = V.vikt;
  const n = Math.min(MAXK, V.klubbar.length);
  for (let g = 0; g < n; g++) {
    W.klubb[g] += ((!KV || KV.ix === g ? 1 : 0.08) - W.klubb[g]) * kd;
    W.detalj[g] += ((KV && KV.ix === g ? 1 : 0) - W.detalj[g]) * kd;
    W.mark[g] += ((KV && KV.ix === g ? 1 : V.hover === g ? 0.6 : 0) - W.mark[g]) * Math.min(1, kd * 1.6);
  }
  W.alla += ((KV ? 0.3 : 1) - W.alla) * kd;
  const u = V.flodeMat.uniforms;
  u.uTid.value = t; u.uIntro.value = V.introKlar ? 2 : intro; u.uAlla.value = W.alla;
  V.konMat.uniforms.uTid.value = t; V.konMatSvag.uniforms.uTid.value = t;
  V.PM.led.uniforms.uTid.value = t;

  // strålkastareffekt: allt utom vald klubb (och märket) dämpas, strålkastaren tänds över arenan
  const du = V.dimmUni;
  const dimmMal = KV ? 0.2 : 1;
  if (KV) {
    if (du.uKbDimm.value > 0.97) V.fokusLokal.copy(KV.fokusMitt); else V.fokusLokal.lerp(KV.fokusMitt, kd);
    du.uKbR.value.set(KV.fokusR, KV.fokusR + 1.8);
  }
  rotera(V.fokusLokal, V.vrid, du.uKbFokus.value);
  du.uKbDimm.value += (dimmMal - du.uKbDimm.value) * kd;
  if (Math.abs(du.uKbDimm.value - dimmMal) < 0.002) du.uKbDimm.value = dimmMal;
  const sp = V.spot;
  sp.intensity += ((KV ? (KV.data.sport === 'is' ? 12 : 18) : 0) - sp.intensity) * kd;
  if (KV) {
    T.v2.copy(KV.pos).addScaledVector(KV.ut, 1.4); rotera(T.v2, V.vrid, T.v); T.v.y = 5.4;
    if (sp.intensity < 0.5) sp.position.copy(T.v); else sp.position.lerp(T.v, kd);
    rotera(KV.pos, V.vrid, T.v);
    sp.target.position.lerp(T.v, sp.intensity < 0.5 ? 1 : kd); sp.target.updateMatrixWorld();
  }
  for (const K of V.klubbar) {
    const mal = KV ? (KV === K ? 0.045 : -0.03) : 0;
    K.lyft += (mal - K.lyft) * kd; K.grupp.position.y = K.lyft;
    const ls = KV === K ? 2.6 : V.hover === K.ix ? 1.3 : 0.16;
    K.list += (ls - K.list) * Math.min(1, kd * 1.5); K.listMat.color.setRGB(1, 0.6, 0.24).multiplyScalar(K.list);
    if (K.halor.length) { const f = dimmFaktor(V, K.pos); for (const h of K.halor) h.material.opacity = f; }
  }

  // märket: vänder sig mot kameran, lutar framsidan mot kamerans höjd och vaggar lugnt
  const N = V.nav;
  N.uHallare.rotation.y = (V.kamAz || 0) + (lugn ? 0.1 : Math.sin(t * 0.32) * 0.22);
  N.uHallare.rotation.x = -Math.min(0.42, (V.kamElev || 0.6) * 0.58) + (lugn ? 0 : Math.sin(t * 0.5) * 0.03);
  N.fokus = (N.fokus || 0) + ((KV ? 1 : 0) - (N.fokus || 0)) * kd;
  N.uHallare.position.y = 1.34 - N.fokus * 0.42 + (lugn ? 0 : Math.sin(t * 0.9) * 0.035);
  N.uHallare.scale.setScalar(1 - N.fokus * 0.32);
  N.holo1.scale.setScalar(1.5 * (1 - N.fokus * 0.32)); N.holo2.scale.copy(N.holo1.scale);
  N.holo1.rotation.set(Math.PI / 2 + Math.sin(t * 0.4) * 0.35, t * 0.5, 0);
  N.holo2.rotation.set(Math.PI / 2 + Math.cos(t * 0.33) * 0.5, -t * 0.42, 0.3);
  N.holo1.position.y = N.holo2.position.y = N.uHallare.position.y;

  // LED-skyltarna rullar
  if (!lugn) V.tex.reklam.offset.x = (t * 0.035) % 1;

  // arenor: spelare, boll/puck, kuben i ishallen, kamerablixtar
  for (const K of V.klubbar) {
    const pl = K.spelplan, lista = K.rorelse;
    for (const r of lista) {
      r.x = klamp(r.bx + Math.sin(t * r.w1 + r.f) * r.ax, -pl.L / 2, pl.L / 2);
      r.z = klamp(r.bz + Math.sin(t * r.w2 + r.f * 1.3) * r.az, -pl.W / 2, pl.W / 2);
      K.spelare[r.lag].setMatrixAt(r.i, T.m.makeTranslation(r.x, pl.y, r.z));
    }
    K.spelare[0].instanceMatrix.needsUpdate = true; K.spelare[1].instanceMatrix.needsUpdate = true;
    const tid = t / 1.4, steg = Math.floor(tid), fr = tid - steg;
    const a = lista[(steg * 3) % lista.length], b = lista[(steg * 3 + 4) % lista.length];
    const e2 = fr * fr * (3 - 2 * fr);
    K.boll.position.set(a.x + (b.x - a.x) * e2, pl.y + 0.006 + (K.data.sport === 'is' ? 0 : Math.sin(fr * Math.PI) * 0.03), a.z + (b.z - a.z) * e2);
    if (K.kub) K.kub.rotation.y = lugn ? 0.4 : t * 0.25;
    if (K.blixtar && K.blixtar.n) {
      const B = K.blixtar, ca = B.pts.geometry.attributes.color;
      for (let i = 0; i < B.n; i++) { const v = lugn ? 0 : Math.pow(Math.max(0, Math.sin(t * B.fart[i] * 2.1 + B.fas[i])), 30) * 0.9; ca.setXYZ(i, v, v, v); }
      ca.needsUpdate = true;
    }
  }

  // tornens våningar tänds och släcks, flygvarningsljus blinkar, ringarna andas
  if (V.torn.length) {
    if (!lugn && V.golv.length && (V.nastaGolv || 0) < t) {
      V.nastaGolv = t + 0.28;
      const i = Math.floor(Math.random() * V.golv.length), gv = V.golv[i];
      const TS = TILLSTAND[gv.t.tillstand] || TILLSTAND.ingen;
      gv.tand = !gv.tand;
      V.ti.golv.setColorAt(i, T.c.set(TS.farg).multiplyScalar(gv.tand ? gv.styrka / 2.2 : 0.15));
      V.ti.golv.instanceColor.needsUpdate = true;
    }
    const fa = V.flyg.geometry.attributes.color;
    V.torn.forEach((tt, i) => { const f = (t * 0.62 + i * 0.37) % 1; const v = (f < 0.09 ? 1 : f < 0.16 ? 0.25 : 0.06) * (tt.vaxt > 0.9 ? 1 : 0); fa.setXYZ(i, v, v, v); });
    fa.needsUpdate = true;
    V.M.tornRing.color.setScalar(1.0 + Math.sin(t * 1.6) * 0.12);
  }

  // nätverket: en signal sprider sig utåt från klubbens mitt i kvarteret
  if (V.block.length) {
    const ca = V.noder.geometry.attributes.color;
    V.block.forEach((b, i) => {
      const fas = (((t * 0.17 - b.avst * 0.9 + b.klubb.ix * 0.31) % 1) + 1) % 1;
      const v = (0.2 + 0.9 * Math.exp(-(fas * 9) * (fas * 9))) * (b.vaxt || 0) * (!KV || KV === b.klubb ? 1 : 0.25);
      ca.setXYZ(i, v, v, v);
    });
    ca.needsUpdate = true;
  }

  // ljuspaket i pulsernas spetsar (samma vikter som bågarna)
  if (V.paketBagar.length) {
    const pa = V.paket.geometry.attributes.position, fa = V.paket.geometry.attributes.color;
    const visa = V.introKlar ? 1 : klamp((intro - 0.4) * 3);
    let j = 0;
    for (const b of V.paketBagar) {
      const g = Math.min(MAXK - 1, b.grupp);
      const ar = (b.klass === 2 ? W.detalj[g] : W.klubb[g]) * visa;
      for (let mm = 0; mm < b.streck; mm++) {
        const x = ((((mm + t * b.fart) / b.streck) % 1) + 1) % 1;
        b.kurva.getPointAt(x, T.v);
        const kant = Math.min(1, x * 8, (1 - x) * 8) * ar;
        pa.setXYZ(j, T.v.x, T.v.y, T.v.z); fa.setXYZ(j, b.farg.r * kant, b.farg.g * kant, b.farg.b * kant); j++;
      }
    }
    pa.needsUpdate = true; fa.needsUpdate = true;
  }

  // mynt flyger från märket och landar i kassan (svans efter sig); krusning och gnista när de landar
  let fi = 0, si = 0, sv = 0;
  const myntSyns = V.introKlar || intro > 0.75;
  const svPos = V.svans.geometry.attributes.position, svFarg = V.svans.geometry.attributes.color;
  for (const K of V.klubbar) {
    const P = K.prov;
    if (P) {
      const ar = W.klubb[Math.min(MAXK - 1, K.ix)];
      for (let mm = 0; mm < P.streck; mm++) {
        const x = ((((mm + t * P.fart) / P.streck) % 1) + 1) % 1;
        const forra = P.senast[mm] ?? x;
        if (!lugn && x < forra && V.introKlar && !P.spoke) K.kassa.krusStart = t; // spetsen passerade slutet → landning
        P.senast[mm] = x;
        P.kurva.getPointAt(Math.min(x, 0.999), T.v);
        const inne = x > 0.985 || !myntSyns;
        T.q.setFromEuler(T.e.set(t * 3.1 + mm, t * 2.3 + mm * 2, 0.4));
        T.m.compose(T.v, T.q, T.sk.setScalar(inne ? 0.0001 : 1.15 * Math.min(1, x * 14)));
        if (P.spoke) V.spokMynt.setMatrixAt(si++, T.m); else V.flygMynt.setMatrixAt(fi++, T.m);
        for (let k = 1; k <= 4; k++) {
          const xs = x - k * 0.014;
          const synligS = !inne && xs > 0 ? (1 - k / 5) * ar * (P.spoke ? 0.4 : 1) : 0;
          P.kurva.getPointAt(klamp(xs, 0, 0.999), T.v3);
          svPos.setXYZ(sv, T.v3.x, T.v3.y, T.v3.z); svFarg.setXYZ(sv, 1.05 * synligS, 0.55 * synligS, 0.2 * synligS); sv++;
        }
      }
    }
    const alder = t - K.kassa.krusStart;
    if (alder >= 0 && alder < 1) { K.kassa.krus.visible = true; K.kassa.krus.scale.setScalar(1 + alder * 2.6); K.kassa.krusMat.opacity = (1 - alder) * 0.8; }
    else K.kassa.krus.visible = false;
    const flash = alder >= 0 && alder < 0.6 ? 1 - alder / 0.6 : 0;
    K.kassa.gnista.material.opacity = 0.7 * flash * flash * dimmFaktor(V, K.kassa.pos);
    K.kassa.gnista.scale.setScalar(0.14 + (1 - flash) * 0.16);
    K.kassa.glodMat.color.setRGB(1, 0.6, 0.24).multiplyScalar((K.data.attBetala > 0 ? 1.3 + Math.sin(t * 3) * 0.3 : 0.55) + flash * 2.2);
  }
  if (sv) { svPos.needsUpdate = true; svFarg.needsUpdate = true; }
  if (V.flygMynt.count) V.flygMynt.instanceMatrix.needsUpdate = true;
  if (V.spokMynt.count) V.spokMynt.instanceMatrix.needsUpdate = true;
  V.M.glodMynt.emissiveIntensity = lugn ? 0.18 : 0.14 + Math.sin(t * 3) * 0.08;
  // prognosmynten svävar ovanför staplarna
  const prog = V.staplar && V.staplar.prognos;
  if (prog && prog.im.count) {
    prog.lista.forEach((c, i) => {
      T.q.setFromEuler(T.e.set(c.lut + Math.sin(t * 0.8 + c.svav) * 0.12, c.rot + t * 0.4, 0));
      T.m.compose(T.v.set(c.x, c.y + Math.sin(t * 1.1 + c.svav) * 0.012, c.z), T.q, T.sk.setScalar(c.K.kassaSkala));
      prog.im.setMatrixAt(i, T.m);
    });
    prog.im.instanceMatrix.needsUpdate = true;
  }

  // etiketterna följer sina ankare; etiketter som skulle krocka lyfts uppåt (ledlinjen blir längre)
  const vanster = V.layout.smal ? -1 : V.layout.textHoger + 10;
  const synliga = T.synliga || (T.synliga = []); synliga.length = 0;
  for (const et of V.etiketter) {
    if (!et.el) continue;
    const K = et.K;
    // ankaret följer vridskivan. Klubbens etikett: ovanför arenan, eller under framkanten för arenan längst fram –
    // får den inte plats på sin sida (den kompakta hjälten) prövas den andra.
    let p, nere = false;
    if (K && V.layout.smal) { rotera(K.pos, V.vrid, T.v); T.v.y = 0.62 * K.skala; T.v.z -= 0.5 * K.skala; p = s.projicera(T.v); }
    else if (K) {
      const pu = s.projicera(rotera(et.ankare, V.vrid, T.v)), pn = s.projicera(rotera(K.ankareNere, V.vrid, T.v));
      const hh = (et.matt ? et.matt.h : 52) + et.glapp, mrg = 6;
      const ryms = (q, ned) => (ned ? q.y + hh <= V.layout.etikettBotten - mrg : q.y - hh >= V.layout.etikettTopp + mrg);
      const fram = Math.cos(K.vinkel + V.vrid) > 0.7;
      nere = fram ? ryms(pn, true) || !ryms(pu, false) : !ryms(pu, false) && ryms(pn, true);
      // hysteres: byt inte sida för en bildpunkt
      if (et.nere !== undefined && nere !== et.nere && Math.abs((nere ? pn.y + hh - V.layout.etikettBotten : V.layout.etikettTopp - (pu.y - hh)) ) < 3) nere = et.nere;
      p = nere ? pn : pu;
    } else p = s.projicera(rotera(et.ankare, V.vrid, T.v));
    if (nere !== et.nere) { et.el.classList.toggle('kb3d-pin-nere', nere); et.nere = nere; }
    // vald klubb: bara dess företag har etiketter (klubben själv beskrivs i panelen, övriga är dämpade)
    const syns = p.syns && p.x > vanster && (et.klubb < 0 || et.klubb === V.vald) && !(V.layout.smal && (et.egen < 0 || K)) && !(K && KV);
    if (syns !== et.syns) { et.el.toggleAttribute('data-dold', !syns); et.syns = syns; et.matt = null; }
    const dimmad = !!KV && et.klubb < 0 && et.egen >= 0 && et.egen !== KV.ix;
    if (dimmad !== et.dimmad) { et.el.toggleAttribute('data-dimmad', dimmad); et.dimmad = dimmad; }
    if (!p.syns) continue;
    const x = Math.round(p.x * 2) / 2, y = Math.round(p.y * 2) / 2;
    if (x !== et.x || y !== et.y) { et.el.style.transform = `translate3d(${x}px, ${y}px, 0)`; et.x = x; et.y = y; }
    if (syns) synliga.push(et);
  }
  synliga.sort((a, b) => a.prio - b.prio || b.y - a.y);
  const lagda = T.lagda || (T.lagda = []); lagda.length = 0;
  // märket i mitten är ett hinder: klubbarnas och företagens skyltar lyfts förbi det (stegmärkena är små och får stå nära)
  let marke = null;
  if (V.nav && !KV) {
    const mv = T.mv || (T.mv = new V.THREE.Vector3()), mh = T.mh || (T.mh = new V.THREE.Vector3());
    V.nav.uHallare.getWorldPosition(mv); const c = s.projicera(mv);
    mh.setFromMatrixColumn(s.camera.matrixWorld, 0).multiplyScalar(0.82).add(mv); const q = s.projicera(mh);
    const R = Math.hypot(q.x - c.x, q.y - c.y);
    if (c.syns || R > 0) marke = { x0: c.x - R, x1: c.x + R, y0: c.y - R, y1: c.y + R * 0.9 };
  }
  const ER = u.uEt.value, pr = s.renderer.getPixelRatio(), H = V.layout.h;
  let ne = 0;
  for (const et of synliga) {
    if (!et.matt) { const r = et.el.firstElementChild.getBoundingClientRect(); et.matt = { b: r.width + 6, h: r.height + 4 }; }
    const { b, h } = et.matt;
    let lyft = 0;
    const ruta = () => (et.nere ? { x0: et.x - b / 2, x1: et.x + b / 2, y0: et.y + et.glapp, y1: et.y + et.glapp + h } : { x0: et.x - b / 2, x1: et.x + b / 2, y0: et.y - et.glapp - h - lyft, y1: et.y - et.glapp - lyft });
    let r = ruta();
    const hinder = marke && et.prio < 3 ? [marke, ...lagda] : lagda;
    for (let forsok = 0; forsok < 6 && !et.nere; forsok++) {
      const krock = hinder.find((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
      if (!krock) break;
      lyft += r.y1 - krock.y0 + 3; r = ruta();
    }
    // sticker den upp ovanför ytan (den kompakta hjälten): skjut ned den in i ytan i stället för att gömma den
    let krockar = false;
    if (!et.nere && r.y0 < V.layout.etikettTopp + 4) { lyft -= V.layout.etikettTopp + 4 - r.y0; r = ruta(); krockar = et.prio > 0 && lagda.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0); }
    if (!krockar) lagda.push(r);
    const marg = et.ute ? 8 : 0; // hysteres: ingen fladder i kanten
    const ute = krockar || r.y0 < V.layout.etikettTopp + marg || r.y1 > V.layout.etikettBotten - marg || r.x0 < vanster - 4 + marg || r.x1 > V.layout.w + 2 - marg;
    if (ute !== et.ute) { et.el.toggleAttribute('data-ute', ute); et.ute = ute; }
    lyft = Math.round(lyft);
    if (lyft !== et.lyft) { et.el.style.setProperty('--lyft', `${lyft}px`); et.lyft = lyft; }
    // ljusbågar bakom etiketten dämpas (rutan i bildpunkter, y uppåt)
    if (!ute && !et.dimmad && ne < 10) ER[ne++].set(r.x0 * pr, (H - r.y1) * pr, r.x1 * pr, (H - r.y0) * pr);
  }
  u.uEtAntal.value = ne;

  // miljön vrids långsamt: ljuslisterna glider över lack, metall och glas
  s.scene.environmentRotation.y = lugn ? 0.5 : 0.5 + t * 0.03;
  for (const m of V.miljoFast) m.envMapRotation.copy(s.scene.environmentRotation);
  for (const m of V.miljoVarld) m.envMapRotation.copy(s.scene.environmentRotation);

  ritaSpegel(V);
}
