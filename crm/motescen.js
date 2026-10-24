/* Uperformance CRM – mötesscenen överst på #/mote.
   Med WebGL ritar scen-mote.js (three.js, laddas av scener.js) rummet i riktig 3D i [data-ms-rum] och placerar
   platserna vid bordskanten; då döljs CSS-scenen nedan (.ms-scen) och dess timers vilar. Utan WebGL visas den.
   Ett mötesbord i CSS 3D (samma idé som Idealhus CRM:s planeringsbord, men Uperformances värld):
   hologram med U-märket i mitten, presentationsbunten som bläddras, surfplatta med pulslinje, provrör,
   EKG-remsa, stoppur, fotboll, kettlebell, vattenflaska, kaffe och offerten på en skrivplatta.
   Affärer som väntar på ett möte har en plats runt bordet. Platsetiketterna visas inte (användarens önskemål) – kunden väljs
   under "Planera mötet" – men platserna finns kvar i DOM:en: 3D-scenen ger vald kunds plats strålkastaren och skrivplattan.
   Egen fil: sätts in när vyn ritas (crm.js behöver inte ändras) och läser data via window.UPCRM.
   Ständiga animationer rör bara transform/opacitet, pausas utanför bild och stängs av vid minskad rörelse. */
(() => {
  'use strict';
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const forsta = (namn) => String(namn || '').replace(/\s+(AB|HB|KB|IF|BK)$/i, '').split(/\s+/).slice(0, 2).join(' ');
  const initialer = (namn) => String(namn || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((d) => d[0]).join('').toUpperCase();
  const STEG = { kontakt: 'Ny kontakt', besok: 'Kundbesök', offert: 'Offert skickad', underlag: 'Underlag', signerad: 'Signerad' };
  const VANTAR = ['kontakt', 'besok', 'offert'];
  const U = '<svg viewBox="0 0 396 395" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="22" d="M198,10c103.9,0,188,84,188,187.5s-84.1,187.5-188,187.5S10,301,10,197.5,94.1,10,198,10Z"/><path fill="currentColor" d="M177.5,127.8v88.6c0,7.3,1.6,13,4.7,17.3,3.3,4.1,8.4,6.2,15.5,6.2s12.4-2.1,15.8-6.2c3.4-4.3,5.1-10.1,5.1-17.3v-88.6h49.1v88.6c0,14.9-3.1,27.8-9.3,38.4-6.2,10.5-14.7,18.4-25.5,23.8-10.8,5.3-22.9,8-36.2,8s-25.2-2.7-35.5-8c-10.2-5.3-18.2-13.2-24-23.8-5.8-10.5-8.7-23.3-8.7-38.4v-88.6h49.1Z"/></svg>';

  const crm = () => window.UPCRM;
  const knappObs = new WeakMap(); // scen → IntersectionObserver för hjältens startknappar (se bind)
  const valdKund = () => document.querySelector('[data-mote-kund]')?.value || '';
  const valdAffar = () => document.querySelector('[data-mote-affar]')?.value || '';

  // En cylinder av stavar (stående): n stavar runt Y-axeln med ljus som faller från vänster.
  const cylinder = (n, klass) => Array.from({ length: n }, (_, i) => {
    const a = (360 / n) * i;
    return `<i class="${klass}" style="--a:${a}deg;--l:${Math.round(58 + 30 * Math.cos(((a - 50) * Math.PI) / 180))}%"></i>`;
  }).join('');
  // En låda: topp + två synliga sidor (bredd, djup, höjd i px)
  const lada = (klass, w, d, h) => `<span class="ms-lada ${klass}" style="--w:${w}px;--d:${d}px;--h:${h}px"><i class="ms-lada-topp"></i><i class="ms-lada-fram"></i><i class="ms-lada-sida"></i></span>`;

  // Samma urval som korten under "Planera mötet" (moteVantar i crm.js): bara företag, inga klubbar
  // Alla affärer som väntar på möte (hjältens tal räknar alla) – platserna vid bordet tar de sex första (platsAffarer)
  function vantandeAffarer() {
    const c = crm(); if (!c) return [];
    const rang = { besok: 0, kontakt: 1, offert: 2 };
    return (c.db.affarer || []).filter((a) => { const k = VANTAR.includes(a.steg) ? c.kund(a.kundId) : null; return !!k && k.typ !== 'klubb'; })
      .sort((x, y) => (rang[x.steg] - rang[y.steg]) || String(y.stegAndrad || '').localeCompare(String(x.stegAndrad || '')));
  }
  const platsAffarer = () => vantandeAffarer().slice(0, 6);

  function ordHtml() {
    const c = crm(); const db = c ? c.db : { aktiviteter: [], affarer: [] };
    const kId = valdKund();
    const k = kId && c ? c.kund(kId) : null;
    // Ett möte = en kund och en dag: kalkylens Spara och inspelningen loggar också mötesaktiviteter, men räknas inte som fler möten
    const motenAlla = (db.aktiviteter || []).filter((x) => x.typ === 'mote').sort((a, b) => (a.tid < b.tid ? 1 : -1))
      .filter((x, i, l) => l.findIndex((y) => y.kundId === x.kundId && String(y.tid).slice(0, 10) === String(x.tid).slice(0, 10)) === i);
    const moten = motenAlla.length;
    const vantar = vantandeAffarer(); const vantarVarde = c && c.affarVarde ? vantar.reduce((s, a) => s + (a.offert ? c.affarVarde(a) : 0), 0) : 0;
    const dgr = (t) => Math.max(0, Math.round((Date.now() - new Date(t)) / 864e5)); const sedan = (t) => { const d = dgr(t); return d === 0 ? 'idag' : d === 1 ? 'igår' : `${d} d sedan`; };
    const kAff = k && c ? (db.affarer || []).filter((a) => a.kundId === k.id && a.steg !== 'signerad' && a.steg !== 'forlorad').sort((a, b) => String(b.stegAndrad || '').localeCompare(String(a.stegAndrad || '')))[0] : null;
    const kMoten = k ? motenAlla.filter((x) => x.kundId === k.id) : [];
    // Varje kort (2026-10-23, "snyggare och bättre"): etiketten med ikon, talet stort med ett piller bredvid (belopp eller hur länge sedan)
    // och en rad längst ned med vem det gäller – kundens initialer, en liten rubrik och namnet (två rader om det behövs, aldrig …).
    // Allt som kommer ur datan går genom e() här och ingen annanstans.
    const datum = (t) => new Date(t).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    const kundNamn = (id) => { const x = c && c.kund(id); return x ? x.namn : ''; };
    const tal = ({ ikonNamn, ton, etikett, varde, piller, rubrik, namn, vem }) => `<span class="ms-tal" data-ton="${ton}">
        <span class="ms-tal-topp"><i aria-hidden="true">${ikon(ikonNamn)}</i><small>${e(etikett)}</small></span>
        <span class="ms-tal-varde"><b>${e(varde)}</b>${piller ? `<span class="ms-tal-piller">${e(piller)}</span>` : ''}</span>
        <span class="ms-tal-vem">${vem ? `<i aria-hidden="true">${e(initialer(vem))}</i>` : '<i class="ms-tal-tom" aria-hidden="true"></i>'}<span><small>${e(rubrik)}</small><em>${e(namn)}</em></span></span>
      </span>`;
    const forstaVantar = vantar[0] ? kundNamn(vantar[0].kundId) : '', senastKund = motenAlla[0] ? kundNamn(motenAlla[0].kundId) : '';
    const talRad = k
      ? [tal({ ikonNamn: 'affar', ton: 'is', etikett: 'Öppen affär', varde: kAff && kAff.offert && c ? c.krKort(c.affarVarde(kAff)) : '–', piller: kAff ? STEG[kAff.steg] || '' : '',
          rubrik: kAff ? 'Affären' : 'Ingen öppen affär', namn: kAff ? kAff.titel : 'Kalkylen sparas som ny affär', vem: k.namn }),
        tal({ ikonNamn: 'mote', ton: 'mint', etikett: 'Möten med kunden', varde: kMoten.length, piller: kMoten[0] ? sedan(kMoten[0].tid) : 'första mötet',
          rubrik: kMoten[0] ? 'Senaste mötet' : 'Inga möten ännu', namn: kMoten[0] ? datum(kMoten[0].tid) : 'Det här blir det första', vem: kMoten[0] ? k.namn : '' })].join('')
      : [tal({ ikonNamn: 'affar', ton: 'is', etikett: 'Väntar på möte', varde: vantar.length, piller: vantarVarde && c ? c.krKort(vantarVarde) : '',
          rubrik: forstaVantar ? 'Närmast på tur' : 'Inga just nu', namn: forstaVantar ? forsta(forstaVantar) : 'Alla affärer har haft möte', vem: forstaVantar }),
        tal({ ikonNamn: 'mote', ton: 'mint', etikett: 'Möten hållna', varde: moten, piller: motenAlla[0] ? sedan(motenAlla[0].tid) : '',
          rubrik: senastKund ? 'Senaste mötet' : 'Inga möten ännu', namn: senastKund ? forsta(senastKund) : 'Starta presentationen nedan', vem: senastKund })].join('');
    const rubrik = k ? `Nästa möte med<br><em>${e(forsta(k.namn))}.</em>` : 'Redo att<br><em>presentera.</em>';
    // Antalet bilder, affärerna som väntar på möte och – med vald kund – affären, värdet och vem du träffar står i
    // "Planera mötet" under hjälten (korten, dossiern). Här bara det som inte syns där: med vald kund räcker rubriken.
    // Rubriken är vyns h1 (vyns eget sidhuvud döljs när scenen finns, motescen.css) – som sidhjältarna.
    return `<p class="ms-etikett">Kundmöte</p>
      <h1 class="ms-rubrik">${rubrik}</h1>
      ${k ? '' : '<p class="ms-text">Presentera Uperformance och räkna fram upplägget live – för en särskild kund eller helt generellt.</p>'}
      <div class="ms-talrad">${talRad}</div>
      <div class="ms-knappar">
        <button type="button" class="ms-knapp ms-knapp-mint" data-ms="starta">${ikon('play')}Starta presentation</button>
        <button type="button" class="ms-knapp ms-knapp-glas" data-ms="kalkyl">${ikon('kalkyl')}Öppna kalkylen</button>
        ${window.UPFilm ? `<button type="button" class="ms-knapp ms-knapp-glas ms-knapp-film" data-film title="Spela filmen – utan ljud"><span class="ms-film-bild" aria-hidden="true">${ikon('play')}</span>Filmen<small>${e(UPFilm.tid(UPFilm.LANGD))}</small></button>` : ''}
      </div>
      <p class="ms-not"><button type="button" class="ms-planera" data-ms="planera">Planera mötet – välj kund och bilder<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg></button></p>
      <p class="ms-pris"><svg class="ikon" data-i="las" aria-hidden="true"><use href="#i-las"/></svg>Priserna och kalkylen syns bara här i CRM:et – aldrig på webbplatsen.</p>`;
  }
  function ikon(namn) {
    const linje = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    if (namn === 'affar') return linje('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>');
    if (namn === 'mote') return linje('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');
    if (namn === 'play') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h1.5M12 12h1.5M15.5 12h.01M8.5 16h1.5M12 16h1.5M15.5 16h.01"/></svg>';
  }

  // Vald plats: den med vald affär – annars kundens första plats (affärer med deltagarlista o.d. finns inte i affärslistan)
  function valdPlatsAffar(aff) {
    const aId = valdAffar(), kId = valdKund();
    if (aId && aff.some((a) => a.id === aId)) return aId;
    const forsta = kId ? aff.find((a) => a.kundId === kId) : null;
    return forsta ? forsta.id : '';
  }

  function platserHtml() {
    const c = crm(); if (!c) return '';
    const aff = platsAffarer(); const aId = valdPlatsAffar(aff);
    return aff.map((a, n, arr) => {
      const k = c.kund(a.kundId); if (!k) return '';
      // Platserna längs bordets främre kant, som en publik i en båge.
      const v = ((arr.length === 1 ? 90 : 24 + n * (132 / (arr.length - 1))) * Math.PI) / 180;
      const left = 50 + Math.cos(v) * 44, top = 66 + Math.sin(v) * 22;
      return `<button type="button" class="ms-plats${a.id === aId ? ' vald' : ''}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;--n:${n}" data-ms="plats" data-kund="${e(k.id)}" data-affar="${e(a.id)}" title="${e(k.namn)} · ${e(a.titel)}">
        <span class="ms-avatar">${e(initialer(k.namn))}</span><span class="ms-namn">${e(forsta(k.namn))}</span><span class="ms-steg ms-steg-${e(a.steg)}">${e(STEG[a.steg] || a.steg)}</span></button>`;
    }).join('');
  }

  function scenHtml() {
    const bilder = window.UPMote ? UPMote.BILDER : [];
    const bunt = bilder.slice(0, 7).map((b, n) => `<i class="ms-kort" style="--n:${n}"><b>${String(n + 1).padStart(2, '0')}</b><span>${e(b.namn)}</span><em>${U}</em></i>`).join('');
    const ror = [['#e5674f', 78], ['#c43d3d', 64], ['#f0b545', 70], ['#7a5cc7', 58], ['#3aa9c9', 74]]
      .map(([f, h], i) => `<i class="ms-ror" style="--i:${i};--f:${f};--h:${h}%"><b></b></i>`).join('');
    const partiklar = Array.from({ length: 9 }, (_, i) => `<i style="--i:${i};--x:${(i * 37) % 60 - 30}px;--t:${3 + (i % 4) * 0.7}s"></i>`).join('');
    return `<div class="ms-scen" aria-hidden="true"><div class="ms-varld">
      <i class="ms-golv"></i><i class="ms-golv-ring"></i>
      <div class="ms-bord">
        <i class="ms-bord-skugga"></i><i class="ms-bord-fram"></i><i class="ms-bord-sida"></i>
        <i class="ms-skiva"><i class="ms-svep"></i></i>
        <div class="ms-sak ms-holo"><i class="ms-holo-bas"></i><i class="ms-holo-ring"></i><i class="ms-holo-ring ms-holo-ring-2"></i>
          <span class="ms-staende ms-holo-ljus"><i class="ms-holo-kon"></i><i class="ms-holo-u">${U}</i><i class="ms-holo-partiklar">${partiklar}</i></span></div>
        <div class="ms-sak ms-bunt">${bunt}</div>
        <div class="ms-sak ms-platta">${lada('ms-platta-kropp', 132, 92, 6)}<i class="ms-skarm"><b>Hälsoprofil</b><span class="ms-puls"><svg viewBox="0 0 240 40" preserveAspectRatio="none"><path d="M0 22h28l6-10 6 20 6-28 7 30 5-12h26l6-10 6 20 6-28 7 30 5-12h26l6-10 6 20 6-28 7 30 5-12h30"/></svg></span><i class="ms-skarm-rad"></i><i class="ms-skarm-rad ms-kort-rad"></i></i></div>
        <div class="ms-sak ms-ekg"><i class="ms-ekg-papper"><svg viewBox="0 0 200 30" preserveAspectRatio="none"><path d="M0 18h20l4-8 4 14 4-20 5 22 4-8h22l4-8 4 14 4-20 5 22 4-8h22l4-8 4 14 4-20 5 22 4-8h25"/></svg></i></div>
        <div class="ms-sak ms-stall">${lada('ms-stall-kropp', 96, 26, 14)}<span class="ms-staende ms-rorrad">${ror}</span></div>
        <div class="ms-sak ms-klocka"><i class="ms-klocka-ram"></i><i class="ms-klocka-tavla"></i><i class="ms-klocka-visare"></i><i class="ms-klocka-knopp"></i></div>
        <div class="ms-sak ms-platt">${lada('ms-platt-kropp', 104, 136, 3)}<i class="ms-papper"><b>Offert</b><i></i><i></i><i></i><i class="kort"></i><span>Uperformance</span></i><i class="ms-klamma"></i></div>
        <div class="ms-sak ms-penna">${lada('ms-penna-kropp', 92, 7, 7)}</div>
        <div class="ms-sak ms-boll"><i class="ms-skugga"></i><span class="ms-staende"><svg class="ms-boll-svg" viewBox="0 0 100 100"><defs><radialGradient id="ms-boll-sken" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#e9eef3"/><stop offset="1" stop-color="#9aa8b6"/></radialGradient><clipPath id="ms-boll-klipp"><circle cx="50" cy="50" r="46"/></clipPath></defs><circle cx="50" cy="50" r="46" fill="url(#ms-boll-sken)"/><g clip-path="url(#ms-boll-klipp)"><g class="ms-boll-monster" fill="#0b1520"><path d="M50 32l13 9-5 15H42l-5-15z"/><path d="M14 30l12 3 3 13-10 8-11-5z"/><path d="M86 30l-12 3-3 13 10 8 11-5z"/><path d="M30 82l3-12 13-3 4 0 13 3 3 12-9 8H39z" opacity=".95"/><path d="M50 -4l9 6-3 9H44l-3-9z"/></g></g><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(11,21,32,.25)"/><ellipse cx="36" cy="30" rx="14" ry="8" fill="#fff" opacity=".55"/></svg></span></div>
        <div class="ms-sak ms-kettle"><i class="ms-skugga"></i><span class="ms-staende"><i class="ms-kettle-handtag"></i><i class="ms-kettle-kropp"><b>16</b></i></span></div>
        <div class="ms-sak ms-flaska"><i class="ms-skugga"></i><span class="ms-staende"><i class="ms-flaska-kropp"><i class="ms-flaska-vatten"></i><b>${U}</b></i><i class="ms-flaska-kork"></i></span></div>
        <div class="ms-sak ms-kaffe"><i class="ms-fat"></i><i class="ms-skugga"></i><span class="ms-staende ms-kopp">${cylinder(16, 'ms-stav')}<i class="ms-kopp-ora"></i><i class="ms-anga"><i></i><i></i><i></i></i></span></div>
      </div>
    </div></div>`;
  }

  const html = () => `<section class="motescen" data-motescen>
      <div class="ms-ord" data-ms-ord>${ordHtml()}</div>
      <div class="ms-rum" data-ms-rum>${scenHtml()}<div class="ms-platser" data-ms-platser aria-hidden="true">${platserHtml()}</div></div>
    </section>`;

  /* ---- liv: bunten bläddras, bordet följer musen, paus utanför bild ---------------------------- */
  function bind(sek) {
    const rum = sek.querySelector('[data-ms-rum]');
    const varld = sek.querySelector('.ms-varld');
    const bunt = sek.querySelector('.ms-bunt');
    // Skala scenen efter rummets bredd (scenen är ritad för 620 px)
    new ResizeObserver(() => { rum.style.setProperty('--skala', Math.min(1.08, Math.max(0.5, rum.clientWidth / 620)).toFixed(3)); }).observe(rum);
    // Paus utanför bild
    new IntersectionObserver(([p]) => sek.toggleAttribute('data-vilar', !p.isIntersecting)).observe(sek);
    // Startknapparna: medan hjältens knappar syns vilar dockan med samma knappar under "Planera mötet" (sidor.css 09) –
    // aldrig två startknappar i bild. Första läget sätts direkt i sattIn (ingen blinkning vid omritning).
    // Knapparna ritas om med texten (uppdateraOrd) – observatören flyttas då till de nya (knappObs)
    const knappar = sek.querySelector('.ms-knappar');
    const obs = new IntersectionObserver((poster) => { const p = poster[poster.length - 1]; if (p.target.isConnected) sek.toggleAttribute('data-knappar-synliga', p.isIntersecting); });
    knappObs.set(sek, obs);
    if (knappar) obs.observe(knappar);
    if (!lugn) {
      // Bordet vrider sig lite efter musen (bara transform via CSS-variabler)
      rum.addEventListener('pointermove', (ev) => {
        if (ev.pointerType !== 'mouse' || sek.hasAttribute('data-ms-3d-klar')) return;
        const r = rum.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        varld.style.setProperty('--mx', (x * 10).toFixed(2));
        varld.style.setProperty('--my', (y * -6).toFixed(2));
      });
      rum.addEventListener('pointerleave', () => { varld.style.setProperty('--mx', 0); varld.style.setProperty('--my', 0); });
      // Översta kortet i bunten lyfts, vänds och läggs underst
      const tick = setInterval(() => {
        if (!sek.isConnected) { clearInterval(tick); return; }
        if (sek.hasAttribute('data-vilar') || sek.hasAttribute('data-ms-3d-klar') || document.hidden) return;
        const kort = [...bunt.querySelectorAll('.ms-kort')];
        if (kort.length < 2) return;
        const topp = kort.reduce((m, k) => (Number(k.style.getPropertyValue('--n')) > Number(m.style.getPropertyValue('--n')) ? k : m), kort[0]);
        topp.classList.add('lyfts');
        setTimeout(() => {
          kort.forEach((k) => { if (k !== topp) k.style.setProperty('--n', Number(k.style.getPropertyValue('--n')) + 1); });
          topp.style.setProperty('--n', 0); topp.classList.remove('lyfts');
        }, 900);
      }, 3600);
    }
  }

  function uppdateraOrd() {
    const sek = document.querySelector('[data-motescen]'); if (!sek) return;
    sek.querySelector('[data-ms-ord]').innerHTML = ordHtml();
    const obs = knappObs.get(sek); const kn = sek.querySelector('.ms-knappar');
    if (obs && kn) { obs.disconnect(); obs.observe(kn); }
    // Platserna syns inte, men 3D-scenen läser .vald för strålkastaren och skrivplattan vid vald kund
    const aId = valdPlatsAffar(platsAffarer());
    sek.querySelectorAll('.ms-plats').forEach((p) => p.classList.toggle('vald', !!aId && p.dataset.affar === aId));
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-ms]'); if (!t || !t.closest('[data-motescen]')) return;
    const vad = t.dataset.ms;
    if (vad === 'starta') { const f = document.querySelector('[data-form="starta-mote"]'); if (f) (f.requestSubmit ? f.requestSubmit() : f.submit()); return; }
    if (vad === 'kalkyl') { document.querySelector('[data-g="starta-mote-kalkyl"]')?.click(); return; }
    if (vad === 'planera') {
      const mal = document.getElementById('mote-plan'); if (!mal) return;
      mal.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' });
      document.getElementById('mk-h')?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('change', (ev) => { if (ev.target.matches('[data-mote-kund], [data-mote-affar]')) setTimeout(uppdateraOrd, 0); });

  // Sätt in scenen när mötesvyn ritas (och igen om vyn ritas om)
  function sattIn() {
    if (location.hash !== '#/mote' || !window.UPCRM) return;
    const start = document.querySelector('.mote-start');
    if (!start || start.previousElementSibling?.matches('[data-motescen]')) return;
    document.querySelectorAll('[data-motescen]').forEach((s) => s.remove());
    start.insertAdjacentHTML('beforebegin', html());
    const sek = start.previousElementSibling;
    const kn = sek.querySelector('.ms-knappar');
    if (kn) { const r = kn.getBoundingClientRect(); sek.toggleAttribute('data-knappar-synliga', r.bottom > 0 && r.top < innerHeight); }
    bind(sek);
  }
  new MutationObserver(sattIn).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('hashchange', sattIn);
  sattIn();
})();
