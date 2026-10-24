/* Uperformance CRM – filmen (window.UPFilm): Uperformance på en minut, utan ljud (Higgsfield, 2026-10-24, källa i _underlag/film/).
   En biografspelare i CRM:ets mörka formspråk som delas av presentationen (mote.js: knappen Filmen, F och bilden Filmen) och
   Kundmöte-sidan (hjältens och dockans knapp Filmen). Varje element med data-film öppnar den (data-film-kapitel = kapitel 0–7).
   <dialog> med showModal: översta lagret – även över presentationens helskärm – och allt bakom är inert (3D-scenerna pausar
   själva när en modal dialog är öppen, scen3d.js skymd()). Kapitlen = filmens rubriker, bara det sajten säger. Inga emoji. */
(() => {
  'use strict';
  const LANGD = 62.6;
  // Klipp i börjar (i − 1) × 7,2 s in och tonas in under 0,8 s – kapitlet startar när klippet står helt i bild
  const KAPITEL = [
    'Hälsa med elitstandard', 'Testmetodik från elitidrotten', 'Vi mäter innan det gör ont', 'Rörlighet och funktion',
    'Samma testbatteri – för hela arbetsplatsen', 'En egen riskprofil', 'Insikter för företaget', 'Två arenor. En metod.',
  ].map((namn, i) => ({ namn, t: i ? i * 7.2 + 0.8 : 0 }));
  const MAPP = 'film/';
  const POSTER = `${MAPP}uperformance-film.jpg`;
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const tid = (s) => { const x = Math.max(0, Math.round(s || 0)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
  const kapitelVid = (s) => { let k = 0; KAPITEL.forEach((x, i) => { if (s >= x.t - 0.4) k = i; }); return k; };
  // Mobil med pekskärm eller dataspar: 720p (5,9 MB). Annars 1080p (15,5 MB) – mötet visas oftast på en stor skärm.
  const kalla = () => {
    const spar = navigator.connection && navigator.connection.saveData;
    return `${MAPP}uperformance-film${spar || matchMedia('(max-width: 700px) and (pointer: coarse)').matches ? '-720' : ''}.mp4`;
  };

  const linje = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
  const IK = {
    spela: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    paus: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
    om: linje('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    stang: linje('<path d="M18 6 6 18M6 6l12 12"/>'),
    helskarm: linje('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    helskarmUt: linje('<path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
    film: linje('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none"/>'),
    u: '<svg viewBox="0 0 396 395" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="20" d="M198,10c103.9,0,188,84,188,187.5s-84.1,187.5-188,187.5S10,301,10,197.5,94.1,10,198,10Z"/><path fill="currentColor" d="M177.5,127.8v88.6c0,7.3,1.6,13,4.7,17.3,3.3,4.1,8.4,6.2,15.5,6.2s12.4-2.1,15.8-6.2c3.4-4.3,5.1-10.1,5.1-17.3v-88.6h49.1v88.6c0,14.9-3.1,27.8-9.3,38.4-6.2,10.5-14.7,18.4-25.5,23.8-10.8,5.3-22.9,8-36.2,8s-25.2-2.7-35.5-8c-10.2-5.3-18.2-13.2-24-23.8-5.8-10.5-8.7-23.3-8.7-38.4v-88.6h49.1-.1Z"/></svg>',
  };

  let st = null; // den öppna spelaren

  const html = (iMote) => `<div class="film-inre" data-film-inre tabindex="-1">
      <div class="film-topp">
        <span class="film-ogon"><i aria-hidden="true">${IK.u}</i>Filmen</span>
        <h2 class="film-titel" id="film-titel">Hälsa med elitstandard <em>– på en minut</em></h2>
        <span class="film-nu" data-film-nu aria-hidden="true"></span>
        <button class="film-knapp film-stang" type="button" data-film-g="stang">${IK.stang}<span>${iMote ? 'Tillbaka till presentationen' : 'Stäng'}</span></button>
      </div>
      <div class="film-scen"><div class="film-ram">
        <video class="film-video" playsinline muted preload="auto" poster="${POSTER}" aria-describedby="film-kapitel-rubrik" disablepictureinpicture></video>
        <button class="film-stor" type="button" data-film-g="spela" aria-label="Spela filmen">${IK.spela}</button>
        <div class="film-slut" data-film-slut hidden>
          <button class="film-knapp film-knapp-glas" type="button" data-film-g="igen">${IK.om}<span>Spela igen</span></button>
          <button class="film-knapp film-knapp-mint" type="button" data-film-g="stang">${iMote ? 'Tillbaka till presentationen' : 'Stäng filmen'}</button>
        </div>
      </div></div>
      <div class="film-kontroller">
        <button class="film-knapp film-rund" type="button" data-film-g="spela" aria-label="Pausa" data-film-spela>${IK.paus}</button>
        <div class="film-tidlinje" data-film-tidlinje role="slider" tabindex="0" aria-label="Tid i filmen" aria-valuemin="0" aria-valuemax="${Math.ceil(LANGD)}" aria-valuenow="0" aria-valuetext="0:00 av ${tid(LANGD)}">
          <span class="film-spar"><i class="film-buffrat" data-film-buffrat></i><i class="film-spelat" data-film-spelat></i>${KAPITEL.slice(1).map((k) => `<i class="film-streck" style="left:${(k.t / LANGD * 100).toFixed(2)}%"></i>`).join('')}</span>
          <span class="film-knopp" data-film-knopp></span>
        </div>
        <span class="film-tid" data-film-tid><b>0:00</b> / ${tid(LANGD)}</span>
        <button class="film-knapp film-rund" type="button" data-film-g="om" aria-label="Börja om">${IK.om}</button>
        <button class="film-knapp film-rund" type="button" data-film-g="helskarm" aria-label="Helskärm" data-film-helskarm>${IK.helskarm}</button>
      </div>
      <h3 class="sr" id="film-kapitel-rubrik">Filmens kapitel: ${KAPITEL.map((k) => k.namn).join(', ')}.</h3>
      <ol class="film-kapitel" aria-label="Kapitel">${KAPITEL.map((k, i) => `<li><button type="button" data-film-g="kapitel" data-kapitel="${i}" style="--k:${i}" aria-label="Kapitel ${i + 1}: ${k.namn} (${tid(k.t)})">
          <span class="film-kap-bild" aria-hidden="true"><i data-film-kapfyll></i></span><span class="film-kap-text"><small>${String(i + 1).padStart(2, '0')} · ${tid(k.t)}</small><span>${k.namn}</span></span></button></li>`).join('')}</ol>
    </div>`;

  /* ---- uppdatering: tid, knopp, kapitel, knappar ---- */
  function rita() {
    if (!st) return;
    const v = st.video; const t = v.currentTime || 0; const p = Math.min(1, t / (v.duration || LANGD));
    st.spelat.style.transform = `scaleX(${p.toFixed(4)})`;
    st.knopp.style.transform = `translateX(${(p * st.tidlinje.clientWidth).toFixed(1)}px)`;
    st.tidEl.innerHTML = `<b>${tid(t)}</b> / ${tid(v.duration || LANGD)}`;
    const k = kapitelVid(t);
    st.tidlinje.setAttribute('aria-valuenow', String(Math.round(t)));
    st.tidlinje.setAttribute('aria-valuetext', `${tid(t)} av ${tid(v.duration || LANGD)} – ${KAPITEL[k].namn}`);
    if (k !== st.kap) {
      st.kap = k;
      st.nu.textContent = `${String(k + 1).padStart(2, '0')} · ${KAPITEL[k].namn}`;
      st.kapKnappar.forEach((b, i) => { b.toggleAttribute('data-aktiv', i === k); b.toggleAttribute('data-sett', i < k); if (i === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }
    // Kapitlets egen mätare (bara det aktiva kortet)
    const nasta = KAPITEL[k + 1] ? KAPITEL[k + 1].t : (v.duration || LANGD);
    const kp = Math.min(1, Math.max(0, (t - KAPITEL[k].t) / (nasta - KAPITEL[k].t)));
    const fyll = st.kapKnappar[k] && $('[data-film-kapfyll]', st.kapKnappar[k]); if (fyll) fyll.style.transform = `scaleX(${kp.toFixed(3)})`;
  }
  function slinga() { st && (st.raf = 0); if (!st) return; rita(); if (!st.video.paused) st.raf = requestAnimationFrame(slinga); }
  function buffrat() {
    if (!st) return; const v = st.video; const b = v.buffered; let slut = 0;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5) slut = Math.max(slut, b.end(i));
    st.buffrat.style.transform = `scaleX(${Math.min(1, slut / (v.duration || LANGD)).toFixed(3)})`;
  }
  function lage() {
    if (!st) return; const v = st.video; const spelar = !v.paused && !v.ended;
    st.el.toggleAttribute('data-spelar', spelar);
    st.el.toggleAttribute('data-slut', v.ended);
    $('[data-film-slut]', st.el).hidden = !v.ended;
    const k = st.spelaKnapp; k.innerHTML = spelar ? IK.paus : IK.spela; k.setAttribute('aria-label', spelar ? 'Pausa' : 'Spela');
    if (spelar && !st.raf) st.raf = requestAnimationFrame(slinga);
    vakna();
  }
  // Under uppspelningen vilar kontrollerna efter 2,6 s utan rörelse (biograf) – fokus med tangentbordet håller dem framme (CSS)
  function vakna() {
    if (!st) return; clearTimeout(st.vilaTimer); st.el.removeAttribute('data-vilar-kontroller');
    if (!st.video.paused) st.vilaTimer = setTimeout(() => st && !st.video.paused && st.el.setAttribute('data-vilar-kontroller', ''), 2600);
  }

  /* ---- handlingar ---- */
  const spela = () => { const p = st.video.play(); if (p && p.catch) p.catch(() => lage()); };
  const vaxla = () => { if (st.video.paused || st.video.ended) spela(); else st.video.pause(); };
  /* Servrar utan Range (den lokala förhandsvisningen python -m http.server) kan inte söka – seekable blir [0, 0] och kapitlen
     startade om filmen. Då hämtas filmen en gång som blob och tiden sätts när den är laddad (CSP: media-src blob:).
     GitHub Pages, Vercel och den skarpa servern har Range, där händer det aldrig. */
  const kanSoka = (v, s) => { for (let i = 0; i < v.seekable.length; i++) if (s >= v.seekable.start(i) - 0.1 && s <= v.seekable.end(i) + 0.1) return true; return false; };
  function helFilm(s) {
    st.malTid = s; if (st.laddarHel) return;
    st.laddarHel = true; const nu = st; const v = st.video;
    fetch(v.currentSrc || kalla()).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then((b) => {
      if (st !== nu) return;
      const spelade = !v.paused && !v.ended; nu.blobUrl = URL.createObjectURL(b);
      v.addEventListener('loadedmetadata', () => { if (st !== nu) return; v.currentTime = nu.malTid; rita(); if (spelade) spela(); }, { once: true });
      v.src = nu.blobUrl;
    }).catch(() => { nu.laddarHel = false; });
  }
  const hoppa = (s) => {
    const v = st.video; const mal = Math.max(0, Math.min((v.duration || LANGD) - 0.05, s));
    if (v.readyState >= 1 && !st.blobUrl && !kanSoka(v, mal)) helFilm(mal); else v.currentTime = mal;
    rita(); vakna();
  };
  const tillKapitel = (i) => { hoppa(KAPITEL[Math.max(0, Math.min(KAPITEL.length - 1, i))].t); if (st.video.paused || st.video.ended) spela(); };
  function helskarm() {
    const inre = $('[data-film-inre]', st.el);
    if (document.fullscreenElement === inre) document.exitFullscreen().catch(() => {});
    else if (inre.requestFullscreen) inre.requestFullscreen().catch(() => {});
    else if (st.video.webkitEnterFullscreen) st.video.webkitEnterFullscreen(); // iPhone: bara videon kan gå till helskärm
  }
  const vidHelskarm = () => {
    if (!st) return; const pa = document.fullscreenElement === $('[data-film-inre]', st.el); const k = $('[data-film-helskarm]', st.el);
    k.innerHTML = pa ? IK.helskarmUt : IK.helskarm; k.setAttribute('aria-label', pa ? 'Avsluta helskärm' : 'Helskärm');
    requestAnimationFrame(rita); // knoppens läge följer tidslinjens nya bredd
  };

  // Tidslinjen: dra eller klicka med pekaren, pilar/Home/End med tangentbordet (role=slider)
  function tidlinjeDrag(ev) {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const tl = st.tidlinje; const r = tl.getBoundingClientRect(); const varSpelar = !st.video.paused;
    const till = (x) => hoppa(((Math.min(r.right, Math.max(r.left, x)) - r.left) / r.width) * (st.video.duration || LANGD));
    tl.setPointerCapture(ev.pointerId); st.video.pause(); till(ev.clientX); st.el.setAttribute('data-drar', '');
    const flytt = (e2) => till(e2.clientX);
    const slut = () => { tl.removeEventListener('pointermove', flytt); tl.removeEventListener('pointerup', slut); tl.removeEventListener('pointercancel', slut); st && st.el.removeAttribute('data-drar'); if (st && varSpelar) spela(); };
    tl.addEventListener('pointermove', flytt); tl.addEventListener('pointerup', slut); tl.addEventListener('pointercancel', slut);
  }

  function klick(ev) {
    if (!st) return;
    if (performance.now() - (st.vaknadeTid || 0) < 700) return; // pekskärm: första trycket i vila tar bara fram kontrollerna
    const el = ev.target.closest('[data-film-g]');
    if (!el) { if (ev.target === st.video) vaxla(); return; } // klick på bilden = spela/pausa (som en biograf)
    const g = el.dataset.filmG;
    if (g === 'spela') vaxla();
    else if (g === 'stang') stang();
    else if (g === 'om' || g === 'igen') { hoppa(0); spela(); }
    else if (g === 'kapitel') tillKapitel(+el.dataset.kapitel);
    else if (g === 'helskarm') helskarm();
  }
  function tangent(ev) {
    if (!st) return;
    // Allt stannar i spelaren: presentationens pilar, CRM:ets kortkommandon (/, N, [, Ctrl K) och Esc som avslutar mötet
    ev.stopPropagation();
    const k = ev.key; const knapp = ev.target.closest && ev.target.closest('button');
    vakna();
    if (k === 'Escape') return; // dialogen stänger sig själv (cancel → close); i helskärm lämnar webbläsaren först den
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return; // Ctrl F/P, Alt ← osv. är webbläsarens (Alt ← = bakåt, stänger filmen)
    if ((k === ' ' || k === 'k' || k === 'K') && !(knapp && k === ' ')) { ev.preventDefault(); vaxla(); }
    else if (k === 'ArrowRight' || k === 'ArrowLeft') { ev.preventDefault(); hoppa(st.video.currentTime + (k === 'ArrowRight' ? 5 : -5)); }
    else if (k === 'PageDown' || k === 'n' || k === 'N') { ev.preventDefault(); if (st.kap < KAPITEL.length - 1) tillKapitel(st.kap + 1); } // presentationsklickerns "nästa"
    else if (k === 'PageUp' || k === 'p' || k === 'P') { ev.preventDefault(); tillKapitel(st.video.currentTime - KAPITEL[st.kap].t > 2 ? st.kap : st.kap - 1); }
    else if (k === 'Home' && !knapp) { ev.preventDefault(); hoppa(0); }
    else if (k === 'End' && !knapp) { ev.preventDefault(); hoppa((st.video.duration || LANGD) - 0.1); }
    else if (k === 'f' || k === 'F') { ev.preventDefault(); helskarm(); }
    else if (/^[1-8]$/.test(k)) { ev.preventDefault(); tillKapitel(+k - 1); }
  }

  function spelaFilm({ kapitel = 0, fran = document.activeElement } = {}) {
    if (st && !st.el.isConnected) stadat(); // en spelare som revs bort med presentationen städas först
    if (st) { tillKapitel(kapitel); return; }
    const mote = document.querySelector('.mote:not([data-stanger])');
    const dlg = document.createElement('dialog');
    dlg.className = 'film'; dlg.setAttribute('aria-labelledby', 'film-titel');
    if (lugn) dlg.setAttribute('data-lugn', '');
    dlg.innerHTML = html(!!mote);
    // I presentationen ligger spelaren i presentationens element (helskärmen visar bara det elementets innehåll)
    (document.fullscreenElement || mote || document.body).appendChild(dlg);
    const video = $('video', dlg);
    st = { el: dlg, video, fran, kap: -1, raf: 0, vilaTimer: 0, tidlinje: $('[data-film-tidlinje]', dlg), knopp: $('[data-film-knopp]', dlg), spelat: $('[data-film-spelat]', dlg),
      buffrat: $('[data-film-buffrat]', dlg), tidEl: $('[data-film-tid]', dlg), nu: $('[data-film-nu]', dlg), spelaKnapp: $('[data-film-spela]', dlg), kapKnappar: $$('[data-film-g="kapitel"]', dlg) };
    ['play', 'pause', 'ended', 'playing'].forEach((h) => video.addEventListener(h, lage));
    video.addEventListener('timeupdate', () => { if (video.paused) rita(); });
    video.addEventListener('seeked', rita);
    video.addEventListener('progress', buffrat); video.addEventListener('loadedmetadata', () => { rita(); buffrat(); });
    video.addEventListener('error', () => { if (st) { st.el.setAttribute('data-fel', ''); st.nu.textContent = 'Filmen kunde inte laddas – kontrollera anslutningen'; } });
    dlg.addEventListener('click', klick);
    dlg.addEventListener('keydown', tangent);
    dlg.addEventListener('pointermove', vakna, { passive: true });
    // Pekskärm: vilande kontroller tar inga tryck (CSS) – trycket väcker dem, och klicket som följer gör ingenting (klick)
    dlg.addEventListener('pointerdown', (ev) => { if (!st) return; st.vaknadeTid = ev.pointerType !== 'mouse' && st.el.hasAttribute('data-vilar-kontroller') ? performance.now() : 0; vakna(); }, { passive: true });
    dlg.addEventListener('focusin', vakna);
    st.tidlinje.addEventListener('pointerdown', tidlinjeDrag);
    dlg.addEventListener('close', stadat);
    document.addEventListener('fullscreenchange', vidHelskarm);
    addEventListener('resize', rita);
    document.documentElement.setAttribute('data-film-oppen', '');
    // Bakåtknappen stänger filmen (en egen post i historiken, adressen ändras inte) – i presentationen står mötet kvar (mote.js vidBakat)
    // Nyckeln är unik per öppning: en gammal upFilm-post (omladdning, bakåt + framåt) får aldrig tas för den här spelarens
    st.nyckel = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    history.pushState({ ...(history.state || {}), upFilm: st.nyckel }, '');
    addEventListener('popstate', vidBakat);
    dlg.showModal();
    video.src = kalla();
    if (KAPITEL[kapitel] && kapitel) video.addEventListener('loadedmetadata', () => { if (st && st.video === video) hoppa(KAPITEL[kapitel].t); }, { once: true });
    rita(); lage();
    spela();
    // Fokus på spelaren, inte på Pausa: öppnad med tangentbordet gav knappen :focus-visible och kontrollerna vilade aldrig
    $('[data-film-inre]', dlg).focus({ preventScroll: true });
  }
  // Stängningen: först ur filmens helskärm (presentationens egen helskärm står kvar), sedan dialogen
  // nu = städa direkt (presentationen avslutas och tar bort elementet – då hinner close-händelsen inte komma)
  function stang({ nu = false } = {}) {
    if (!st) return;
    if (nu) { if (st.el.open) st.el.close(); stadat(); return; }
    const inre = $('[data-film-inre]', st.el);
    if (document.fullscreenElement === inre) document.exitFullscreen().catch(() => {}).finally(() => st && st.el.open && st.el.close());
    else if (st.el.open) st.el.close();
  }
  let viaBakat = false;
  function vidBakat() { if (!st || (history.state && history.state.upFilm === st.nyckel)) return; viaBakat = true; stang(); }
  function stadat() {
    if (!st) return;
    const { el, video, fran, raf, vilaTimer, nyckel, blobUrl } = st; st = null;
    cancelAnimationFrame(raf); clearTimeout(vilaTimer);
    video.pause(); video.removeAttribute('src'); video.load(); // laddningen avbryts – ingen film som fortsätter i bakgrunden
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    document.removeEventListener('fullscreenchange', vidHelskarm); removeEventListener('resize', rita); removeEventListener('popstate', vidBakat);
    // Stängd med knappen eller Esc: filmens post i historiken tas bort (med bakåtknappen är den redan borta)
    if (!viaBakat && history.state && history.state.upFilm === nyckel) history.back();
    viaBakat = false;
    document.documentElement.removeAttribute('data-film-oppen');
    if (!lugn) { el.setAttribute('data-stanger', ''); setTimeout(() => el.remove(), 260); } else el.remove();
    // Fokus tillbaka på knappen man kom från – eller samma knapp i en omritad vy (data-film), annars presentationen/vyn
    const synlig = (x) => !!x && x.isConnected && x.getClientRects().length > 0 && !x.closest('[inert]');
    const mal = [fran, document.querySelector('.mote:not([data-stanger]) [data-film]'), document.querySelector('#vy [data-film]')].find(synlig)
      || document.querySelector('.mote:not([data-stanger])') || document.getElementById('vy');
    if (mal) mal.focus({ preventScroll: true });
  }

  // Varje element med data-film öppnar filmen (presentationens topprad och bild, hjälten och dockan på Kundmöte-sidan)
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-film]'); if (!el || ev.defaultPrevented) return;
    ev.preventDefault(); spelaFilm({ kapitel: +(el.dataset.filmKapitel || 0), fran: el });
  });

  window.UPFilm = { KAPITEL, LANGD, POSTER, LITEN: `${MAPP}uperformance-film-liten.jpg`, IKON: IK.film, tid, spela: spelaFilm, stang, get oppen() { return !!st; } };
})();
