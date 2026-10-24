/* Uperformance – hälsoformulär för en deltagare (frågebatteriet inför testerna).
   Personlig länk (#h=<nyckel>) som skickas från beställningslänken. Deltagaren svarar själv;
   svaren går till Uperformances testteam – arbetsgivaren ser bara att formuläret är klart.
   All data går via window.UPLager (lager.js): i demoläget sparas allt i webbläsaren (som tidigare),
   i skarpt läge hämtas och sparas bara det här formuläret via servern. I skarpt läge är hälsoformuläret
   avstängt som standard (HALSOFORMULAR=av) – då visas en vänlig sida om att det inte är aktiverat.
   Hälsodata: inga emoji och inga påståenden om bokningar som inte finns – bara det deltagaren behöver. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ik = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const portal = $('#portal');
  const L = window.UPLager;
  const skarp = !!(L && L.skarp);
  const miljo = (L && L.lage && L.lage.miljo) || 'demo';
  const sel = (v) => (window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));
  // Lagret avvisar aldrig för väntade fel – men ett oväntat undantag får inte stoppa sidan
  const fraga = async (fn) => { try { return (await fn()) || { ok: false, fel: 'natverk', status: 0 }; } catch (err) { console.error(err); return { ok: false, fel: 'natverk', status: 0 }; } };

  /* Tillstånd ------------------------------------------------------------------------------- */
  const token = (location.hash.match(/h=([A-Za-z0-9]+)/) || [])[1];
  let form = null; // { status, skickad, oppnad?, besvarad?, forifyllt, svar?, utkast? }
  let foretag = '';
  let period = '';
  let saljare = { namn: 'Uperformance' };
  let svar = {};
  let lage = 'form';
  let visaFel = false;
  let stoppad = false;
  let lyssnar = false;
  let andrade = false; // svaren skickades om efter "Ändra mina svar"
  // Ändringar efter "Ändra mina svar" sparas som utkast – de är inte skickade. Tacksidan visar alltid de skickade svaren (form.svar)
  // och säger till när ett utkast med andra svar väntar; "Fortsätt ändra" tar upp det, Avbryt går tillbaka till de skickade.
  let vantandeUtkast = false;
  const tid = () => new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const sparatText = () => (form && form.status === 'besvarad' && lage === 'form' ? `Utkast sparat ${tid()} – inte skickat` : `Sparat ${tid()}`);
  const fornamn = () => String(svar.namn || '').trim().split(' ')[0];

  const sparstatus = $('[data-sparstatus]');
  const sparSr = $('[data-spar-sr]');
  let senastFel = false;
  // Den synliga statusen läses inte upp vid varje inmatning; skärmläsaren får bara fel och "sparat igen"
  const sparText = (text, sparar) => {
    sparstatus.toggleAttribute('data-sparar', sparar === true);
    sparstatus.toggleAttribute('data-sparfel', sparar === 'fel');
    $('span', sparstatus).textContent = text;
    if (sparSr) {
      if (sparar === 'fel') { sparSr.textContent = text; senastFel = true; } else if (senastFel && sparar !== true) { sparSr.textContent = 'Svaren är sparade igen'; senastFel = false; }
    }
  };
  const toast = (text, opt) => (window.UPPortal ? UPPortal.toast(text, opt) : null);
  const varna = (text, under) => toast(text, { typ: 'varning', under });
  const datumTid = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })} kl. ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`; };

  /* Lägen innan formuläret finns: en mening om varför och en väg vidare ------------------------- */
  const OGILTIG = {
    utgangen: ['Länken har gått ut', 'Länken till hälsoformuläret gällde lika länge som beställningen och har nu gått ut. Kontakta den som skickade den till dig om du fortfarande behöver svara.'],
    makulerad: ['Den här länken gäller inte längre', 'Du kan ha tagits bort från deltagarlistan eller fått en ny länk. Kontakta den som skickade den till dig om du har frågor.'],
    sparrad: ['Länken är stängd', 'Beställningen som formuläret hör till har stängts. Du behöver inte göra något – kontakta den som skickade länken om du har frågor.'],
    saknas: ['Länken hittades inte', 'Kontrollera att hela adressen kom med – långa länkar bryts ibland i e-postprogram. Fungerar den ändå inte, kontakta den som skickade länken till dig.'],
  };
  const tillStart = `<div class="knapprad"><a class="knapp knapp-kontur" href="https://www.uperformance.se/">${ik('hem')}Till uperformance.se</a></div>`;
  const stanna = () => { stoppad = true; clearTimeout(sparTimer); clearTimeout(nyttForsok); $('[data-saker]').hidden = true; sparstatus.hidden = true; };
  function visaOgiltig(fel) {
    stanna();
    const [rubrik, text] = OGILTIG[fel] || OGILTIG.saknas;
    portal.innerHTML = `<section class="kort ogiltig" role="alert"><span class="ogiltig-ikon">${ik('las')}</span><h1>${e(rubrik)}</h1><p>${e(text)}</p>${tillStart}</section>`;
  }
  // Skarpt läge med HALSOFORMULAR=av: koden finns kvar men formuläret används inte
  function visaInteAktiverat() {
    stanna();
    portal.innerHTML = `<section class="kort ogiltig halsa-av"><span class="ogiltig-ikon">${ik('info')}</span><h1>Hälsoformuläret är inte aktiverat</h1>
      <p>Uperformance samlar inte in hälsouppgifter via den här länken just nu. Du behöver inte göra något – har du frågor inför testdagen kan du kontakta den som skickade länken till dig, eller Uperformance.</p>${tillStart}</section>`;
  }
  function visaNatverksfel() {
    sparstatus.hidden = true;
    portal.innerHTML = `<section class="kort ogiltig natfel" role="alert"><span class="ogiltig-ikon">${ik('varning')}</span><h1>Kunde inte nå Uperformance</h1>
      <p>Kontrollera internetanslutningen och försök igen. Det du redan har svarat finns kvar.</p>
      <div class="knapprad"><button class="knapp knapp-accent" type="button" data-g="forsok-igen">Försök igen</button></div></section>`;
  }
  const visaHamtar = () => {
    sparstatus.hidden = true;
    portal.innerHTML = '<p class="hamtar" role="status">Hämtar …</p><div class="skelett" aria-hidden="true"><div class="skelett-hjalte"></div><div class="skelett-rad"><i></i></div></div>';
  };
  const varningHtml = () => (!skarp ? `<p class="prototypvarning">${ik('info')}<span><strong>Prototyp.</strong> Skriv inte in riktiga uppgifter – allt sparas bara i den här webbläsaren.</span></p>`
    : miljo === 'lokal' ? `<p class="prototypvarning">${ik('info')}<span><strong>Testmiljö</strong> – skriv inte in riktiga personuppgifter.</span></p>`
      : `<p class="prototypvarning prototypvarning-lugn">${ik('las')}<span>Uppgifterna hanteras enligt personuppgiftsbiträdesavtalet.</span></p>`);
  const felVy = (r) => {
    if (r.fel === 'halsoformular-av') visaInteAktiverat();
    else if (r.status === 404 || r.status === 410) visaOgiltig(r.fel);
    else return false;
    return true;
  };

  /* Utkast – autosparning via lagret. Hela utkastet skickas varje gång, ett anrop i taget. ------ */
  const TILLATNA = new Set([...HALSOFRAGOR.map((f) => f.id), 'samtycke']);
  // Bara frågornas id och samtycket, text högst 200 tecken (samma regler som kundlogik.js)
  const rentUtkast = () => {
    const ut = {};
    Object.keys(svar).forEach((k) => {
      if (!TILLATNA.has(k)) return;
      if (k === 'samtycke') ut.samtycke = !!svar.samtycke;
      else if (svar[k] != null) ut[k] = String(svar[k]).slice(0, 200);
    });
    return ut;
  };
  let sparTimer = null; let nyttForsok = null; let pagaende = null; let smutsig = false; let felForsok = 0;
  const VANTA = [2000, 5000, 15000, 30000];
  function sparaSnart() {
    if (stoppad) return;
    form.utkast = rentUtkast(); smutsig = true;
    sparText('Sparar…', true);
    clearTimeout(sparTimer); sparTimer = setTimeout(sparaNu, 450);
  }
  function sparaNu() {
    clearTimeout(sparTimer); sparTimer = null; clearTimeout(nyttForsok); nyttForsok = null;
    if (!pagaende) pagaende = sparaSlinga().finally(() => { pagaende = null; });
    return pagaende;
  }
  async function sparaSlinga() {
    while (smutsig && !stoppad) {
      smutsig = false;
      const r = await fraga(() => L.halsa.sparaUtkast(token, rentUtkast()));
      if (stoppad) return false;
      if (r.ok) { felForsok = 0; continue; }
      smutsig = true;
      if (felVy(r)) return false;
      if (r.status === 403) { sparText('Sparas inte i förhandsvisningen', 'fel'); return false; }
      if (r.status === 400 || r.status === 413) { sparText('Kunde inte spara – kontrollera svaren', 'fel'); return false; }
      sparText('Kunde inte spara – försöker igen', 'fel');
      const vanta = r.vantaSek ? r.vantaSek * 1000 : VANTA[Math.min(felForsok, VANTA.length - 1)]; felForsok++;
      clearTimeout(nyttForsok); nyttForsok = setTimeout(sparaNu, vanta);
      return false;
    }
    if (!smutsig && !stoppad) sparText(sparatText());
    return !smutsig;
  }
  addEventListener('pagehide', () => { if (smutsig && !stoppad) sparaNu(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && smutsig && !stoppad) sparaNu(); });
  addEventListener('beforeunload', (ev) => { if (skarp && !stoppad && (smutsig || pagaende)) { ev.preventDefault(); ev.returnValue = ''; } });
  // En annan deltagares länk i samma flik (bara hashen ändras): ladda om, som kundlänken och offerten – annars stod förra
  // deltagarens svar kvar och det som sparades hamnade på fel formulär (pagehide sparar det som väntar på den gamla nyckeln)
  addEventListener('hashchange', () => { if ((location.hash.match(/h=([A-Za-z0-9]+)/) || [])[1] !== token) location.reload(); });

  /* Rendering ---------------------------------------------------------------------------- */
  // Besvarade = ifyllda och giltiga (samma mått som delarna och framstegslinjen) – ringen nådde annars 10/10 med fel kvar
  const besvarade = () => { const fel = kontrolleraHalsosvar(svar); return HALSOFRAGOR.filter((f) => String(svar[f.id] ?? '').trim() && !fel[f.id]).length; };
  const ringAria = (n) => `${n} av ${HALSOFRAGOR.length} frågor besvarade`;
  const GRUPPTEXT = {
    om: 'Kontrollera att uppgifterna stämmer – det vi redan vet är ifyllt.',
    kropp: 'Ungefärliga värden räcker.',
    halsa: 'Svaren hjälper testteamet att förbereda undersökningen.',
  };
  /* Framsteg per del (Om dig, Kropp, Hälsa, Samtycke) – samma tal i delens rubrik, i panelen och i framstegslinjen */
  const DELAR = () => [...Object.keys(HALSOGRUPPER).map((g) => ({ id: g, namn: HALSOGRUPPER[g] })), { id: 'samtycke', namn: 'Samtycke' }];
  const delAndel = (g) => {
    if (g === 'samtycke') return [svar.samtycke ? 1 : 0, 1];
    const fel = kontrolleraHalsosvar(svar); const fr = HALSOFRAGOR.filter((f) => f.grupp === g);
    return [fr.filter((f) => String(svar[f.id] ?? '').trim() && !fel[f.id]).length, fr.length];
  };
  const totalAndel = () => { const d = DELAR().map((x) => delAndel(x.id)); return sum2(d.map((x) => x[0])) / Math.max(1, sum2(d.map((x) => x[1]))); };
  const sum2 = (a) => a.reduce((x, y) => x + y, 0);
  function framsteg(andel) {
    const topp = $('.portal-topp'); if (!topp) return;
    let f = $('.kl-framsteg', topp); if (!f) { topp.insertAdjacentHTML('beforeend', '<div class="kl-framsteg" aria-hidden="true"><i></i></div>'); f = $('.kl-framsteg', topp); }
    f.firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, andel)).toFixed(3)})`;
  }
  // Sidopanelen (dator): delarna med framsteg (klick hoppar dit), knappen, vem som ser svaren och kontakten
  function panelHtml(klart) {
    const n = besvarade();
    const delar = DELAR().map((x, i) => { const [k, t] = delAndel(x.id); const klar = k === t;
      return `<li><button type="button" class="hp-del" data-g="hoppa" data-mal="halsa-del-${x.id}" data-hp-del="${x.id}" ${klar ? 'data-klar' : ''}><span class="hp-nr">${klar ? ik('bock') : i + 1}</span><span class="hp-del-text"><strong>${e(x.namn)}</strong><small data-hp-tal>${k} av ${t}</small></span><i class="hp-del-fyll" style="--f:${(k / t).toFixed(3)}" aria-hidden="true"></i></button></li>`; }).join('');
    const kontakt = saljare && saljare.namn && saljare.namn !== 'Uperformance' ? saljare.namn : '';
    return `<aside class="halsa-panel" aria-label="Ditt formulär">
      <section class="hp-kort hp-status" data-mork-yta>
        <p class="hp-etikett">Ditt formulär</p>
        <div class="hp-summa"><strong data-hp-besvarade>${klart ? HALSOFRAGOR.length : n}<span>/${HALSOFRAGOR.length}</span></strong><small>${klart ? 'alla frågor besvarade' : 'frågor besvarade'}</small></div>
        <ol class="hp-delar">${delar}</ol>
        ${klart ? '<button class="knapp knapp-kontur hp-knapp" type="button" data-g="andra">' + ik('redigera') + 'Ändra mina svar</button>'
          : `<button class="knapp knapp-accent hp-knapp" type="submit" form="halsoform">${ik('bock')}${form.status === 'besvarad' ? 'Spara ändringarna' : 'Skicka mina svar'}</button>`}
      </section>
      <section class="hp-kort hp-vem"><p class="hp-etikett">Vem ser dina svar?</p>
        <div class="hp-vem-rad" data-ja><span>${ik('bock')}</span><div><strong>Uperformances testteam</strong><small>Förbereder undersökningen inför testdagen</small></div></div>
        <div class="hp-vem-rad"><span>${ik('las')}</span><div><strong>${e(foretag || 'Din arbetsgivare')}</strong><small>Ser bara att du är klar – inte dina svar</small></div></div></section>
      ${kontakt ? `<section class="hp-kort hp-kontakt"><p class="hp-etikett">Frågor om testdagen?</p><div class="hp-person"><span aria-hidden="true">${e(kontakt.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase())}</span><div><strong>${e(kontakt)}</strong><small>Uperformance · kontaktperson${foretag ? ` för ${e(foretag)}` : ''}</small></div></div>${saljare.epost ? `<a class="hp-mejl" href="mailto:${e(saljare.epost)}">${ik('mejl')}<span>${e(saljare.epost)}</span></a>` : ''}</section>` : ''}
    </aside>`;
  }
  // Delarna i panelen och i rubrikerna uppdateras medan man fyller i – utan att formuläret ritas om
  function uppdateraDelar() {
    DELAR().forEach((x, i) => {
      const [k, t] = delAndel(x.id); const klar = k === t;
      const r = $(`[data-del-raknare="${x.id}"]`); if (r) { r.textContent = `${k} av ${t}`; r.toggleAttribute('data-klar', klar); }
      const nr = $(`.halsa-nr[data-del="${x.id}"]`); if (nr && nr.hasAttribute('data-klar') !== klar) { nr.toggleAttribute('data-klar', klar); nr.innerHTML = klar ? ik('bock') : i + 1; }
      const p = $(`[data-hp-del="${x.id}"]`);
      if (p) { const varKlar = p.hasAttribute('data-klar'); p.toggleAttribute('data-klar', klar); $('[data-hp-tal]', p).textContent = `${k} av ${t}`; $('.hp-del-fyll', p).style.setProperty('--f', (k / t).toFixed(3)); if (varKlar !== klar) $('.hp-nr', p).innerHTML = klar ? ik('bock') : i + 1; }
    });
    const b = $('[data-hp-besvarade]'); if (b) b.firstChild.textContent = besvarade();
    framsteg(totalAndel());
  }
  // Delen man läser markeras i panelen: den sista vars rubrik har passerat under toppraden (räknas en gång per bildruta)
  let foljTick = false; let foljLas = 0; // efter ett klick i panelen gäller den valda delen tills man själv rullar
  function folj() {
    if (Date.now() < foljLas) return;
    const knappar = [...document.querySelectorAll('.hp-del')]; if (!knappar.length) return;
    const delar = knappar.map((k) => document.getElementById(k.dataset.mal));
    let aktiv = 0; delar.forEach((d, i) => { if (d && d.getBoundingClientRect().top <= 150) aktiv = i; });
    // längst ned på sidan: sista delen
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) aktiv = delar.length - 1;
    knappar.forEach((k, i) => k.toggleAttribute('aria-current', i === aktiv));
  }
  addEventListener('scroll', () => { if (foljTick) return; foljTick = true; requestAnimationFrame(() => { foljTick = false; folj(); }); }, { passive: true });
  // Sista ordet och asterisken hålls ihop, så att stjärnan aldrig hamnar ensam på en rad
  const medKrav = (text) => { const t = String(text); const i = t.lastIndexOf(' '); return i < 0 ? `<span class="hel">${e(t)}<span class="krav">*</span></span>` : `${e(t.slice(0, i + 1))}<span class="hel">${e(t.slice(i + 1))}<span class="krav">*</span></span>`; };
  function faltHtml(f, fel) {
    const v = svar[f.id] ?? ''; const felText = visaFel && fel[f.id];
    if (f.typ === 'val') {
      const not = f.id === 'hinder' && v === 'ja-kontakt' ? `<p class="halsa-not" id="not-${e(f.id)}">${ik('samtal')}<span>Testteamet kan då kontakta dig på telefonnumret du angett.</span></p>`
        : f.id === 'hinder' && v === 'ja-ingen-kontakt' ? `<p class="halsa-not" id="not-${e(f.id)}">${ik('info')}<span>Okej, vi kontaktar dig inte. Berätta gärna för testledaren när du kommer till testet.</span></p>` : '';
      const beskriv = [f.hint ? `hint-${f.id}` : '', not ? `not-${f.id}` : '', felText ? `fel-${f.id}` : ''].filter(Boolean).join(' ');
      return `<fieldset class="valfalt halsa-fraga" data-fraga="${e(f.id)}" ${felText ? 'data-fel' : ''}><legend>${medKrav(f.etikett)}</legend>${f.hint ? `<p class="falt-hint" id="hint-${e(f.id)}" style="margin:0">${e(f.hint)}</p>` : ''}
        <div class="valknappar" role="radiogroup" aria-label="${e(f.etikett)}" ${beskriv ? `aria-describedby="${e(beskriv)}"` : ''} ${felText ? 'aria-invalid="true"' : ''}>${f.val.map(([id, text]) => `<label><input type="radio" name="${e(f.id)}" value="${e(id)}" ${v === id ? 'checked' : ''}><span>${v === id ? ik('bock') : ''}${e(text)}</span></label>`).join('')}</div>
        ${felText ? `<span class="falt-hjalp" id="fel-${e(f.id)}">${e(felText)}</span>` : ''}${not}</fieldset>`;
    }
    const input = `<input class="falt" id="f-${e(f.id)}" name="${e(f.id)}" type="${f.typ === 'number' ? 'text' : e(f.typ)}" value="${e(v)}" maxlength="200" ${f.typ === 'number' ? 'inputmode="decimal"' : ''} ${f.auto ? `autocomplete="${e(f.auto)}"` : ''} ${felText ? `aria-invalid="true" aria-describedby="fel-${e(f.id)}"` : ''} ${f.typ === 'date' ? `max="${new Date().toISOString().slice(0, 10)}"` : ''}>`;
    return `<label class="halsa-falt" data-fraga="${e(f.id)}" ${String(v).trim() && !fel[f.id] ? 'data-ok' : ''}><span class="etikett">${medKrav(f.etikett)}</span>
      ${f.enhet ? `<span class="med-enhet">${input}<span>${e(f.enhet)}</span></span>` : input}
      ${felText ? `<span class="falt-hjalp" id="fel-${e(f.id)}">${e(felText)}</span>` : ''}</label>`;
  }
  function visaFormular() {
    const fel = kontrolleraHalsosvar(svar);
    const grupper = Object.keys(HALSOGRUPPER);
    return `<form class="halsa-form" id="halsoform" data-halsoform novalidate>
      ${grupper.map((g, i) => {
        const fragor = HALSOFRAGOR.filter((f) => f.grupp === g);
        const [k, t] = delAndel(g); const klar = k === t;
        return `<section class="kort halsa-grupp" id="halsa-del-${g}"><div class="panel-huvud"><div><h2><span class="halsa-nr" data-del="${g}" ${klar ? 'data-klar' : ''}>${klar ? ik('bock') : i + 1}</span>${e(HALSOGRUPPER[g])}</h2><p>${e(GRUPPTEXT[g])}</p></div><span class="kl-raknare" data-del-raknare="${g}" ${klar ? 'data-klar' : ''}>${k} av ${t}</span></div>
          <div class="panel-kropp">${g === 'halsa' ? fragor.map((f) => faltHtml(f, fel)).join('') : `<div class="falt-rad">${fragor.map((f) => faltHtml(f, fel)).join('')}</div>`}</div></section>`;
      }).join('')}
      <section class="kort halsa-grupp" id="halsa-del-samtycke"><div class="panel-huvud"><div><h2><span class="halsa-nr" data-del="samtycke" ${svar.samtycke ? 'data-klar' : ''}>${svar.samtycke ? ik('bock') : grupper.length + 1}</span>Samtycke</h2><p>Dina svar går till Uperformances testteam och delas inte med ${e(foretag || 'din arbetsgivare')}.</p></div></div>
        <div class="panel-kropp"><label class="kryss" data-fraga="samtycke" ${visaFel && fel.samtycke ? 'data-fel' : ''}><input type="checkbox" name="samtycke" ${svar.samtycke ? 'checked' : ''} ${visaFel && fel.samtycke ? 'aria-invalid="true" aria-describedby="fel-samtycke"' : ''}><span>Jag samtycker till att Uperformance behandlar uppgifterna ovan för att genomföra min hälsokartläggning.</span></label>
          ${visaFel && fel.samtycke ? `<span class="falt-hjalp" id="fel-samtycke">${e(fel.samtycke)}</span>` : ''}</div>
        <div class="halsa-skicka">${visaFel && Object.keys(fel).length ? `<p class="chip chip-rod chip-prick" style="white-space:normal">${Object.keys(fel).length} ${Object.keys(fel).length === 1 ? 'svar saknas eller behöver rättas' : 'svar saknas eller behöver rättas'}</p>` : `<p class="falt-hint" style="margin:0">Alla frågor behöver besvaras.</p>`}
          <span class="halsa-skicka-knappar">${form.status === 'besvarad' ? '<button class="knapp knapp-spok" type="button" data-g="avbryt-andring">Avbryt</button>' : ''}<button class="knapp knapp-accent" type="submit" data-skicka-svar>${ik('bock')}${form.status === 'besvarad' ? 'Spara ändringarna' : 'Skicka mina svar'}</button></span></div></section>
    </form>`;
  }
  function visaKlart() {
    // Personal som förhandsgranskar får formuläret utan svar – visa då bara att det är klart
    const harSvar = !!form.svar; const sv = form.svar || {};
    const rader = !harSvar ? [] : HALSOFRAGOR.map((f) => [f.etikett.replace(/\?$/, ''), f.typ === 'val' ? svarText(f.id, sv[f.id]) : f.typ === 'date' ? new Date(sv[f.id] + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : `${sv[f.id]}${f.enhet ? ' ' + f.enhet : ''}`]);
    return `<section class="kort skickat" style="margin-top:16px"><div class="skickat-bock">${ik('bock')}</div>
      <h2>${andrade ? 'Dina ändringar är sparade.' : 'Dina svar är skickade.'}</h2>
      <p>Svaren har gått till Uperformances testteam. ${e(foretag || 'Din arbetsgivare')} ser bara att du är klar${period ? ` – testteamet bekräftar testdagen (önskad period: ${e(period)})` : ' – testteamet bekräftar testdagen'}.</p>
      ${vantandeUtkast ? `<p class="halsa-not halsa-utkast" style="text-align:left">${ik('redigera')}<span><strong>Du har ändringar som inte är sparade.</strong> Svaren nedan är de som testteamet har. <button class="knapp knapp-kontur knapp-liten" type="button" data-g="andra">Fortsätt ändra</button></span></p>` : ''}
      ${harSvar && sv.hinder === 'ja-kontakt' ? `<p class="halsa-not" style="text-align:left">${ik('samtal')}<span>Du angav ett medicinskt hinder och att vi får kontakta dig – testteamet kan höra av sig på ${e(sv.tel)}.</span></p>` : ''}
      <ol class="halsa-nu" aria-label="Vad händer nu">
        <li data-klar><span>${ik('bock')}</span><div><strong>Svaren finns hos testteamet</strong><small>De förbereder undersökningen inför testdagen</small></div></li>
        <li><span>2</span><div><strong>Testdagen bekräftas</strong><small>Testteamet bekräftar dag och tid${period ? ` – önskad period: ${e(period)}` : ''}</small></div></li>
        <li><span>3</span><div><strong>Din riskprofil</strong><small>Efter testerna får du en individuell riskprofil</small></div></li>
      </ol>
      ${harSvar ? `<div class="halsa-svar-delar">${Object.keys(HALSOGRUPPER).map((g) => { const fr = HALSOFRAGOR.map((f, i) => [f, rader[i]]).filter(([f]) => f.grupp === g); return `<section class="halsa-svar-del"><h3>${e(HALSOGRUPPER[g])}</h3><dl class="halsa-svar">${fr.map(([, [t, v]]) => `<div><dt>${e(t)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl></section>`; }).join('')}</div>
      <button class="knapp knapp-kontur" type="button" data-g="andra">${ik('redigera')}Ändra mina svar</button>` : `<p class="falt-hint">Svaren visas bara för deltagaren själv och Uperformances testteam.</p>`}
      <p class="falt-hint">${form.besvarad ? `${andrade ? 'Senast sparat' : 'Skickat'} ${e(new Date(form.besvarad).toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' }))}.` : ''}</p></section>`;
  }
  function rendera() {
    if (!form || stoppad) return;
    const n = besvarade(); const pct = Math.round((n / HALSOFRAGOR.length) * 100);
    const klart = lage === 'klart';
    const chips = [`${ik('las')}Personlig länk`, `${ik('hjarta')}Delas inte med arbetsgivaren`, ...(period ? [`${ik('kalender')}Önskad testperiod: ${e(period)}`] : [])];
    portal.innerHTML = `
      ${varningHtml()}
      <section class="valkommen">
        <div>
          <span class="etikett-liten">Hälsoformulär${foretag ? ` · ${e(foretag)}` : ''}</span>
          ${klart ? `<h1>Tack${fornamn() ? ` ${e(fornamn())}` : ''} – du är <em>klar</em>.</h1>
          <p>${form.besvarad ? `Dina svar ${andrade ? 'sparades' : 'skickades'} ${e(datumTid(form.besvarad))}. ` : ''}Svaren finns hos Uperformances testteam – du behöver inte göra något mer.</p>`
            : `<h1>${fornamn() ? `Hej ${e(fornamn())}, några` : 'Några'} frågor <em>inför testdagen</em>.</h1>
          <p>${e(foretag || 'Din arbetsgivare')} planerar en hälsokartläggning med Uperformance. Innan testerna behöver vi veta lite om dig – ${HALSOFRAGOR.length} frågor och ett samtycke.</p>`}
          <div class="valkommen-chips">${chips.map((c) => `<span>${c}</span>`).join('')}</div>
        </div>
        <div class="valkommen-hoger">${UPPortal.ring(klart ? 100 : pct, { tal: klart ? HALSOFRAGOR.length : n, enhet: `/${HALSOFRAGOR.length}`, etikett: 'besvarade', aria: klart ? 'Alla frågor är besvarade' : ringAria(n), tyst: klart })}</div>
      </section>
      <div class="halsa-rum" ${klart ? 'data-klart' : ''}><div class="halsa-huvud">${klart ? visaKlart() : visaFormular()}</div>${panelHtml(klart)}</div>
      <footer class="portal-fot"><span>Frågor om testdagen? Kontakta Uperformance${saljare && saljare.namn && saljare.namn !== 'Uperformance' ? ` – ${e(saljare.namn)} är kontaktperson${foretag ? ` för ${e(foretag)}` : ''}` : ''}${saljare && saljare.epost ? `, <a href="mailto:${e(saljare.epost)}">${e(saljare.epost)}</a>` : ''}.</span><span>Dina svar delas inte med ${e(foretag || 'din arbetsgivare')}.</span></footer>`;
    UPPortal.startaRing(); UPPortal.forstaVisning(); framsteg(klart ? 1 : totalAndel()); folj();
  }
  function uppdateraRing() {
    const n = besvarade(); UPPortal.satRing((n / HALSOFRAGOR.length) * 100, n, ringAria(n)); uppdateraDelar();
  }

  /* Händelser -------------------------------------------------------------------------------- */
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!form || stoppad || !t.name || !t.closest('[data-halsoform]')) return;
    if (t.type === 'radio' || t.type === 'checkbox') return;
    svar[t.name] = t.value; sparaSnart(); uppdateraRing();
    const ruta = t.closest('.halsa-falt'); if (ruta) ruta.toggleAttribute('data-ok', !!String(t.value).trim() && !kontrolleraHalsosvar(svar)[t.name]);
    if (visaFel && t.getAttribute('aria-invalid') && !kontrolleraHalsosvar(svar)[t.name]) { t.removeAttribute('aria-invalid'); const h = t.closest('label').querySelector('.falt-hjalp'); if (h) h.remove(); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target; if (!form || stoppad || !t.name || !t.closest('[data-halsoform]')) return;
    if (t.type === 'radio') svar[t.name] = t.value;
    else if (t.type === 'checkbox') svar[t.name] = t.checked;
    else return;
    sparaSnart();
    // Rita om just den frågan (vald knapp, ev. följdtext) utan att tappa fokus i resten av formuläret
    const f = HALSOFRAGOR.find((x) => x.id === t.name);
    if (f) { const gammal = t.closest('[data-fraga]'); const tmp = document.createElement('div'); tmp.innerHTML = faltHtml(f, kontrolleraHalsosvar(svar)); gammal.replaceWith(tmp.firstElementChild); const vald = $(`input[name="${sel(f.id)}"][value="${sel(t.value)}"]`); if (vald) vald.focus(); }
    // Samtycket: felmarkeringen tas bort på plats (en hel omritning tappade fokus på rutan)
    else if (visaFel && t.name === 'samtycke') { const l = t.closest('label'); t.toggleAttribute('aria-invalid', !t.checked); if (l) { l.removeAttribute('data-fel'); const h = l.querySelector('.falt-hjalp'); if (h && t.checked) h.remove(); } }
    else if (visaFel) rendera();
    uppdateraRing();
  });
  let skickar = false;
  document.addEventListener('submit', async (ev) => {
    if (!ev.target.matches('[data-halsoform]')) return;
    ev.preventDefault();
    if (!form || stoppad || skickar) return;
    const fel = kontrolleraHalsosvar(svar);
    if (Object.keys(fel).length) { visaFelen(fel); return; }
    const varBesvarad = form.status === 'besvarad';
    const knapp = $('[data-skicka-svar]'); skickar = true;
    const knappText = knapp ? knapp.innerHTML : '';
    if (knapp) { knapp.disabled = true; knapp.innerHTML = `${ik('bock')}${varBesvarad ? 'Sparar …' : 'Skickar …'}`; }
    // Utkastet som väntar behövs inte längre – vänta ut ett pågående anrop så att det inte landar efter svaret
    clearTimeout(sparTimer); smutsig = false; if (pagaende) await pagaende;
    const r = await fraga(() => L.halsa.skicka(token, rentUtkast()));
    skickar = false; if (knapp && knapp.isConnected) { knapp.disabled = false; knapp.innerHTML = knappText; }
    if (stoppad) return;
    if (!r.ok) {
      if (felVy(r)) return;
      if (r.status === 422 && r.detaljer && typeof r.detaljer === 'object') { visaFelen(r.detaljer); return; }
      if (r.status === 403) { varna('Sparas inte i förhandsvisningen', 'Formuläret besvaras av deltagaren själv.'); return; }
      varna(r.status === 400 ? (r.meddelande || 'Svaren kunde inte skickas') : 'Kunde inte nå Uperformance – försök igen', 'Dina svar finns kvar på sidan.');
      return;
    }
    if (r.vy && r.vy.formular) form = r.vy.formular;
    else { form.status = 'besvarad'; form.besvarad = new Date().toISOString(); }
    clearTimeout(nyttForsok); vantandeUtkast = false;
    andrade = varBesvarad;
    lage = 'klart'; visaFel = false; sparText(sparatText()); rendera(); scrollTo({ top: 0, behavior: lugn ? 'auto' : 'smooth' });
    if (varBesvarad) toast('Ändringarna är sparade', { under: 'Testteamet ser de nya svaren.' });
    else setTimeout(() => UPPortal.konfettiFran($('.skickat-bock')), 900);
  });
  function visaFelen(fel) {
    visaFel = true; rendera();
    const forsta = $(`[data-fraga="${sel(Object.keys(fel)[0])}"]`);
    if (forsta) { forsta.scrollIntoView({ block: 'center', behavior: lugn ? 'auto' : 'smooth' }); const i = $('input', forsta); if (i) i.focus({ preventScroll: true }); }
    const n = Object.keys(fel).length;
    varna('Några svar saknas eller behöver rättas', `${n} ${n === 1 ? 'fråga är markerad' : 'frågor är markerade'} i rött.`);
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-g]'); if (!el) return;
    if (el.dataset.g === 'forsok-igen') { starta(); return; }
    if (el.dataset.g === 'hoppa') { const m = document.getElementById(el.dataset.mal); if (m) { foljLas = Date.now() + 1100; document.querySelectorAll('.hp-del').forEach((k) => k.toggleAttribute('aria-current', k === el)); m.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' }); const i = $('input:not([type=hidden])', m); if (i) i.focus({ preventScroll: true }); } return; }
    if (!form || stoppad) return;
    if (el.dataset.g === 'avbryt-andring') {
      // Tillbaka till de skickade svaren – utkastet skrivs över med dem, så inget väntar vid nästa besök
      svar = { ...(form.forifyllt || {}), ...(form.svar || {}) }; vantandeUtkast = false; visaFel = false; lage = 'klart';
      clearTimeout(sparTimer); form.utkast = rentUtkast(); smutsig = true; sparaNu();
      rendera(); scrollTo({ top: 0, behavior: lugn ? 'auto' : 'smooth' }); return;
    }
    if (el.dataset.g !== 'andra') return;
    if (vantandeUtkast) { svar = { ...svar, ...(form.utkast || {}) }; vantandeUtkast = false; }
    lage = 'form'; rendera(); scrollTo({ top: 0, behavior: lugn ? 'auto' : 'smooth' });
  });

  /* Start: hämta formuläret via lagret ------------------------------------------------------- */
  async function starta() {
    if (!token) { visaOgiltig('saknas'); return; }
    // Skarpt läge med hälsoformuläret avstängt – ingen anledning att fråga servern
    if (skarp && L.lage && L.lage.halsoformular === false) { visaInteAktiverat(); return; }
    if (!L || !L.halsa) { visaNatverksfel(); return; }
    stoppad = false;
    visaHamtar();
    const r = await fraga(() => L.halsa.hamta(token));
    if (!r.ok || !r.vy || !r.vy.formular) { if (!felVy(r)) visaNatverksfel(); return; }
    const vy = r.vy;
    form = vy.formular;
    foretag = (vy.foretag && vy.foretag.namn) || (vy.kund && vy.kund.namn) || '';
    period = (vy.foretag && vy.foretag.period) || '';
    saljare = vy.saljare || { namn: 'Uperformance' };
    // Besvarat: de skickade svaren gäller; ett utkast med andra svar väntar tills deltagaren väljer Fortsätt ändra
    const besvarat = form.status === 'besvarad';
    svar = { ...(form.forifyllt || {}), ...(form.svar || {}), ...(besvarat ? {} : form.utkast || {}) };
    vantandeUtkast = besvarat && !!form.utkast && Object.keys(form.utkast).some((k) => k !== 'samtycke' && String(form.utkast[k]) !== String((form.svar || {})[k] ?? ''));
    lage = besvarat ? 'klart' : 'form';
    $('[data-saker]').hidden = false; sparstatus.hidden = false;
    $('[data-saker-text]').textContent = 'Personlig länk';
    $('[data-saker-for]').textContent = fornamn() ? ` · ${fornamn()}` : '';
    // Första öppningen sparas (status öppnad) – visa det som förut
    if (r.markeradOppnad) sparText(sparatText());
    rendera();
    // Om länken makuleras (deltagaren tas bort) eller beställningen spärras medan sidan är öppen
    if (!lyssnar && L.halsa.lyssna) {
      lyssnar = true;
      L.halsa.lyssna(token, (h) => {
        if (!h || stoppad || !h.ogiltig) return;
        const f = h.fel && typeof h.fel === 'object' ? h.fel : { fel: h.fel, status: h.status };
        if (f.fel === 'natverk' || f.status === 0 || f.status === 429 || f.status >= 500) return; // tillfälligt – nästa kontroll avgör
        if (f.fel === 'halsoformular-av') visaInteAktiverat(); else visaOgiltig(f.fel);
      });
    }
  }
  starta();
})();
