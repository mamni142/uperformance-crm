/* Uperformance CRM – presentationsläge för kundmöten (window.UPMote).
   En helskärmspresentation med material från grundpresentationen och en live-kalkyl.
   Priserna finns bara här i CRM:et – inte på den publika webbplatsen. Inga emoji här (kundvänd yta). */
(() => {
  'use strict';
  // CRM:ets byggstenar (window.UPCRM) – hämtas när mötet startar, eftersom crm.js laddas efter den här filen
  let C, e, kr, ik;
  const koppla = () => { C = window.UPCRM; ({ e, kr, ik } = C); };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BILDER = [
    { id: 'titel', namn: 'Hälsa med elitstandard' },
    { id: 'film', namn: 'Filmen' },
    { id: 'citat', namn: 'Vår mission' },
    { id: 'varfor', namn: 'Varför kartlägga hälsan?' },
    { id: 'metod', namn: 'Så fungerar kartläggningen' },
    { id: 'paket', namn: 'Paketen' },
    { id: 'kalkyl', namn: 'Räkna på ert upplägg' },
    { id: 'resa', namn: 'Så går det till' },
    { id: 'plattform', namn: 'All data. Ett ställe.' },
    { id: 'team', namn: 'Teamet' },
    { id: 'fortroende', namn: 'Förtroende' },
    { id: 'nasta', namn: 'Nästa steg' },
  ];

  let st = null; // tillståndet för en pågående presentation

  /* Bilderna ------------------------------------------------------------------------- */
  const tillvalLista = Object.keys(PRISER.tillval);
  const antalNu = () => Math.max(1, Math.min(5000, parseInt(st.kalk.antal, 10) || 1));
  const reglageP = (n) => Math.min(100, Math.max(0, ((n - 5) / (500 - 5)) * 100));
  // Valen: paket, antal, tillval och program. Ritas om bit för bit – aldrig reglaget eller sifferfältet medan man använder dem.
  const paketvalHtml = () => ['bas', 'basplus', 'basplusplus'].map((id) => `<button type="button" data-m="paket" data-varde="${id}" aria-pressed="${st.kalk.paket === id}"><strong>${e(PRISER.paket[id].namn)}</strong><small>${kr(PRISER.paket[id].pris)}</small></button>`).join('');
  const tillvalHtml = () => {
    const k = st.kalk; const ingar = prisaDeltagare(k.paket, k.tillval).ingar;
    return tillvalLista.map((t) => { const tv = PRISER.tillval[t]; const inne = ingar.has(t); const vald = k.tillval.includes(t) && !inne; return `<button type="button" data-m="tillval" data-varde="${t}" aria-pressed="${vald}" ${inne ? 'disabled' : ''}>${inne || vald ? ik('bock') : ''}${e(tv.namn)} · ${inne ? 'ingår' : tv.pris == null ? 'offert' : kr(tv.pris)}</button>`; }).join('');
  };
  const programHtml = () => {
    const k = st.kalk;
    return `<button type="button" data-m="program" data-varde="app" aria-pressed="${!!k.app}">${k.app ? ik('bock') : ''}UPerformance App · ${kr(PRISER.appManad)}/mån</button>
            <button type="button" data-m="program" data-varde="uppfoljning" aria-pressed="${!!k.uppfoljning}">${k.uppfoljning ? ik('bock') : ''}Uppföljning &amp; coaching · ${kr(PRISER.uppfoljning)}/pers</button>
            <button type="button" data-m="program" data-varde="insights" aria-pressed="${!!k.insights}">${k.insights ? ik('bock') : ''}Team Insights · ${kr(PRISER.insightsAr)}/år</button>`;
  };
  // Summan: ordervärde, rader, betalplan och sparandet
  const summaInre = () => {
    const k = { ...st.kalk, antal: antalNu() }; const pr = prisaOffert(k); const rader = offertRader(k); const n = antalNu();
    return `<span class="mote-summa-etikett">Ordervärde första året · exkl. moms</span>
          <div class="mote-summa-tal"><span data-m-total>${Math.round(pr.total).toLocaleString('sv-SE')}</span><small>kr</small></div>
          <p class="mote-summa-per">≈ ${kr(n ? pr.total / n : 0)} per medarbetare</p>
          <div class="mote-rader">${rader.map((r) => `<div><span>${e(r.text)}${r.antal > 1 ? ` · ${r.antal} st` : ''}</span><b>${r.summa == null ? 'Offert' : kr(r.summa)}</b></div>`).join('')}</div>
          <div class="mote-betal"><div>Förskott 25 %<b>${kr(fakturaDelar(pr.total).forskott)}</b></div><div>Efter testdagen 75 %<b>${kr(fakturaDelar(pr.total).slut)}</b></div></div>
          ${sparaHtml()}
          <p class="mote-not">Vägledande pris enligt prislistan. Slutligt pris bekräftas i offerten.${pr.offert ? ' Hjärt-/kärlpaketet offereras separat och ingår inte i summan.' : ''}</p>`;
  };
  const kalkylHtml = () => {
    const k = st.kalk; const n = antalNu(); const kundObj = st.kundId ? C.kund(st.kundId) : null;
    return `<div class="mote-innehall">
      <span class="mote-eyebrow in">Räkna på ert upplägg</span>
      <h2 class="mote-rubrik in" style="--i:1;font-size:clamp(1.6rem, 1rem + 1.8vw, 2.6rem);max-width:26ch">Så här skulle det se ut för ${e(kundObj ? kundObj.namn : 'er')}.</h2>
      <div class="mote-kalkyl">
        <div class="mote-val in" style="--i:2">
          <div><h4>Paket per medarbetare</h4><div class="mote-paketval" data-m-del="paket">${paketvalHtml()}</div></div>
          <div><h4 id="mote-antal-rubrik">Antal medarbetare</h4><div class="mote-antal"><input type="range" min="5" max="500" value="${Math.min(500, Math.max(5, n))}" style="--p:${reglageP(n)}%" aria-labelledby="mote-antal-rubrik" data-m-antal-reglage><input type="number" min="1" max="5000" value="${e(k.antal)}" aria-label="Antal medarbetare" inputmode="numeric" data-m-antal></div></div>
          <div><h4>Tillval</h4><div class="mote-chips" data-m-del="tillval">${tillvalHtml()}</div></div>
          <div><h4>Mellan testerna</h4><div class="mote-chips" data-m-del="program">${programHtml()}</div></div>
        </div>
        <aside class="mote-summa in" style="--i:3" data-m-summa>${summaInre()}</aside>
      </div>
      <button type="button" class="mote-minisumma" data-m="till-summa"><span>Ordervärde · exkl. moms</span><b data-m-minitotal>${kr(prisaOffert({ ...k, antal: n }).total)}</b></button></div>`;
  };
  // Kunder att spara på: företag (inte klubbar), med deras affärer som går att räkna live på
  const sparValHtml = () => {
    const kunder = [...C.db.kunder].filter((k) => k.typ !== 'klubb').sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
    return `<label class="sr" for="mote-kund">Spara på kund och affär</label><select id="mote-kund" data-m-kund><option value="">Välj kund att spara på…</option>${kunder.map((k) => {
      const af = C.db.affarer.filter((a) => a.kundId === k.id && C.kanRaknaLive(a));
      return af.length ? `<optgroup label="${e(k.namn)}">${af.map((a) => `<option value="${e(k.id)}|${e(a.id)}" ${st.valtSpar === `${k.id}|${a.id}` ? 'selected' : ''}>${e(a.titel)} · befintlig affär</option>`).join('')}<option value="${e(k.id)}|" ${st.valtSpar === `${k.id}|` ? 'selected' : ''}>Ny affär · ${e(k.namn)}</option></optgroup>`
        : `<option value="${e(k.id)}|" ${st.valtSpar === `${k.id}|` ? 'selected' : ''}>${e(k.namn)} · ny affär</option>`;
    }).join('')}</select>`;
  };
  // Förvald kund utan förvald affär men med affärer att räkna på: säljaren väljer befintlig eller ny affär (annars blev varje
  // sparning en ny dubblettaffär "Hälsokartläggning")
  const kundensAffarer = () => (st.kundId && !st.affarId && !st.sparadAffar ? C.db.affarer.filter((a) => a.kundId === st.kundId && C.kanRaknaLive(a)) : []);
  const sparAffarValHtml = (af) => `<label class="sr" for="mote-kund">Spara på affär</label><select id="mote-kund" data-m-kund>${af.map((a, i) => `<option value="${e(st.kundId)}|${e(a.id)}" ${(st.valtSpar ? st.valtSpar === `${st.kundId}|${a.id}` : i === 0) ? 'selected' : ''}>${e(a.titel)} · ${e((SALJSTEG.find((s) => s.id === a.steg) || {}).namn || 'befintlig affär')}</option>`).join('')}<option value="${e(st.kundId)}|" ${st.valtSpar === `${st.kundId}|` ? 'selected' : ''}>Ny affär · ${e(C.kund(st.kundId).namn)}</option></select>`;
  const sparaEtikett = () => {
    if (st.affarId) { const a = C.affar(st.affarId); return a ? `Spara på ${a.titel}` : 'Spara på affären'; }
    if (st.kundId && !st.valtSpar) { const af = kundensAffarer(); return af.length ? `Spara på ${af[0].titel}` : `Spara på ${C.kund(st.kundId).namn}`; }
    if (st.valtSpar) { const [kId, aId] = st.valtSpar.split('|'); const a = aId && C.affar(aId); return a ? `Spara på ${a.titel}` : `Spara på ${(C.kund(kId) || {}).namn || 'kunden'}`; }
    return 'Spara som affär';
  };
  // Ingen kontaktperson (eller ingen e-post): en rad och två fält – annars går länken bara att kopiera (som raden i Till kunden)
  const kontaktHtml = (k) => {
    const pk = k && C.primarKontakt ? C.primarKontakt(k) : null; if (!k || (pk && pk.epost)) return '';
    return `<form class="mote-kontakt" data-m-kontakt novalidate><p>${ik('info')}<span>${pk ? `${e(pk.namn)} saknar e-post` : 'Ingen kontaktperson'} – lägg till ${pk ? 'den' : 'en'} så kan du e-posta länken.</span></p>
      <div class="mote-kontakt-rad">${pk ? '' : '<input class="falt" name="namn" placeholder="Namn" aria-label="Kontaktpersonens namn" autocomplete="off" maxlength="200">'}<input class="falt" name="epost" type="email" inputmode="email" placeholder="namn@foretag.se" aria-label="Kontaktpersonens e-post" autocomplete="off" maxlength="254"><button class="knapp knapp-kontur knapp-liten mote-knapp-ljus" type="submit">${ik('plus')}Lägg till</button></div></form>`;
  };
  const sparaHtml = () => {
    if (st.sparadAffar) {
      const a = C.affar(st.sparadAffar);
      return `<div class="mote-spara"><p class="mote-sparad">${ik('bock')}Sparat på ${e(C.kund(a.kundId).namn)} – ${e(a.titel)}</p>
        <button class="knapp knapp-kontur knapp-liten mote-knapp-ljus" type="button" data-m="spara">Uppdatera affären</button>
        ${st.offertToken ? `<a class="knapp knapp-accent" href="${e(C.dokUrl(st.offertToken))}" target="_blank" rel="noopener">${ik('dokument')}Öppna offerten</a>` : `<button class="knapp knapp-accent" type="button" data-m="offert" ${st.skaparOffert ? 'disabled' : ''}>${ik('dokument')}${st.skaparOffert ? 'Sparar offerten …' : 'Skapa offert nu'}</button>`}${kontaktHtml(C.kund(a.kundId))}</div>`;
    }
    const af = kundensAffarer();
    return `<div class="mote-spara">${!st.kundId ? sparValHtml() : af.length ? sparAffarValHtml(af) : ''}
      <button class="knapp knapp-accent" type="button" data-m="spara">${ik('plus')}<span>${e(sparaEtikett())}</span></button></div>`;
  };

  function bildHtml(id) {
    const kundObj = st.kundId ? C.kund(st.kundId) : null;
    switch (id) {
      case 'titel': return `<div class="mote-titel"><img src="bilder/film-poster.jpg" alt=""></div><div class="mote-innehall">
        <span class="mote-eyebrow in">Uperformance</span><h1 class="mote-rubrik in" style="--i:1">Hälsa med <em>elitstandard.</em></h1>
        <p class="mote-ingress in" style="--i:2">Elitidrottens testmetodik – för hela arbetsplatsen. Vi visar var riskerna finns innan de blir skador, sjukskrivningar och produktionsbortfall.</p>
        ${kundObj ? `<p class="mote-for in" style="--i:3"><span>Förslag för</span><strong>${e(kundObj.namn)}</strong></p>` : ''}</div>`;
      // Filmen (film.js): affischen öppnar biografspelaren, kapitlen hoppar direkt dit – filmens egna rubriker, inget mer
      case 'film': return window.UPFilm ? `<div class="mote-innehall mote-film">
        <div class="mote-film-text"><span class="mote-eyebrow in">Filmen</span><h2 class="mote-rubrik in" style="--i:1">Hälsa med elitstandard – <em>på en minut.</em></h2>
          <p class="mote-ingress in" style="--i:2">Från elitidrottens testmetodik till hela arbetsplatsen.</p>
          <ol class="mote-film-kapitel in" style="--i:3">${UPFilm.KAPITEL.map((k, i) => `<li><button type="button" data-film data-film-kapitel="${i}"><small>${String(i + 1).padStart(2, '0')}</small><span>${e(k.namn)}</span></button></li>`).join('')}</ol></div>
        <button type="button" class="mote-film-ram in" style="--i:2" data-film aria-label="Spela filmen – ${e(UPFilm.tid(UPFilm.LANGD))}"><img src="${e(UPFilm.POSTER)}" alt="" decoding="async">
          <span class="mote-film-spela" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>
          <span class="mote-film-langd" aria-hidden="true">${ik('film')}Spela filmen<b>${e(UPFilm.tid(UPFilm.LANGD))}</b></span></button></div>` : '';
      case 'citat': return `<div class="mote-innehall mote-citat"><img class="in" src="bilder/gustav-skog-gra.jpg" alt="Gustav Svensson" decoding="async"><figure class="in" style="--i:1"><blockquote><p>Vi hjälper företag att minska sjukfrånvaro och öka produktiviteten genom förebyggande hälsoarbete.</p></blockquote><figcaption><strong>Gustav Svensson</strong>Vd, Uperformance · f.d. landslagsspelare och lagkapten i IFK Göteborg</figcaption></figure></div>`;
      case 'varfor': return `<div class="mote-innehall"><span class="mote-eyebrow in">Varför kartlägga hälsan?</span><h2 class="mote-rubrik in" style="--i:1">Sjukfrånvaro kostar mer än de flesta räknar med.</h2>
        <div class="mote-tal">
          <div class="mote-talkort in" style="--i:2"><strong data-m-tal="4.2" data-dec="1">4,2 Mkr</strong><p>Total kostnad för sjukfrånvaro under ett år för ett företag med 30 anställda, 40 000 kr i månadslön och 5 sjukdagar per person.</p><small>Källa: if.se</small></div>
          <div class="mote-talkort in" style="--i:3"><strong data-m-tal="25" data-suffix=" %">25 %</strong><p>uppger besvär kopplade till arbetet – trötthet, smärta, rygg och nacke, oro och utmattning.</p><small>Källa: Arbetsmiljöverket</small></div>
          <div class="mote-talkort in" style="--i:4"><strong>×3</strong><p>Stressade medarbetare är tre gånger mer benägna att byta jobb.</p><small>Källa: Harvard Business Review</small></div>
        </div></div>`;
      case 'metod': return `<div class="mote-innehall"><span class="mote-eyebrow in">Metoden</span><h2 class="mote-rubrik in" style="--i:1">Hälsokartläggning som medarbetarna uppskattar.</h2>
        <div class="mote-steg">
          <div class="mote-stegkort in" style="--i:2"><b>1</b><h3>Personlig hälsoanalys</h3><p>Varje medarbetares värden analyseras av vårt team, som bedömer hälsoläget och identifierar risker.</p></div>
          <div class="mote-stegkort in" style="--i:3"><b>2</b><h3>Personlig återkoppling</h3><p>En personlig digital journal med resultat, trender och praktiska hälsoråd.</p></div>
          <div class="mote-stegkort in" style="--i:4"><b>3</b><h3>Insikter för företaget</h3><p>Sammanställd hälsodata, trender och rekommenderade åtgärder på organisationsnivå.</p></div>
        </div></div>`;
      case 'paket': return `<div class="mote-innehall"><span class="mote-eyebrow in">Paketen</span><h2 class="mote-rubrik in" style="--i:1">Tre nivåer – alla bygger på Bas.</h2>
        <div class="mote-paket" data-paket-rutnat>${['bas', 'basplus', 'basplusplus'].map((p, i) => {
          // Bas+ och Bas++ har samma premiumeffekter som på hemsidan (assets/up.css modul 20): kometer runt kanten, glöd, ljus
          // som följer musen, gnistor, ljussvep, "++" som snurrar och bockar som tänds – Bas++ starkast, Bas+ lite svagare
          const premium = p !== 'bas'; const plus = p === 'basplus' ? 1 : p === 'basplusplus' ? 2 : 0;
          const lager = premium ? `<span class="premium-glod" aria-hidden="true"><i></i></span><span class="premium-ljus" aria-hidden="true"></span><span class="premium-gnistor" aria-hidden="true" data-premium-gnistor="${plus === 2 ? 16 : 8}"></span><span class="premium-ram" aria-hidden="true"></span><span class="premium-svep" aria-hidden="true"></span>${plus === 2 ? '<span class="paket-mark premium-mark">Premium</span>' : ''}` : '';
          const namn = plus ? `Bas<span class="premium-plus">${'<span>+</span>'.repeat(plus)}</span>` : e(PRISER.paket[p].namn);
          return `<div class="mote-paketkort in ${premium ? 'paket-premium' : ''} ${plus === 1 ? 'premium-svagare' : ''}" style="--i:${i + 2}" ${premium ? 'data-premium' : ''}>${lager}<span class="paket-niva">${['Grundpaket', 'Utökat', 'Komplett'][i]}</span><h3>${namn}</h3><div class="pris">${kr(PRISER.paket[p].pris).replace(/\s?kr$/, '')}<small>kr / medarbetare</small></div><ul class="paket-lista">${PAKET_INNEHALL[p].lista.map((x, j) => `<li>${ik('bock', `style="--j:${j}"`)}${e(x)}</li>`).join('')}</ul></div>`;
        }).join('')}</div></div>`;
      case 'kalkyl': return kalkylHtml();
      case 'resa': return `<div class="mote-innehall"><span class="mote-eyebrow in">Så går det till</span><h2 class="mote-rubrik in" style="--i:1">Från första möte till uppföljning.</h2>
        <ol class="mote-resa in" style="--i:2"><li><strong>Offert</strong>Ni får offerten och godkänner digitalt.</li><li><strong>Underlag</strong>Deltagarlista via säker länk, PUB-avtal och samtycke.</li><li><strong>Order</strong>Ordern signeras, 25 % i förskott.</li><li><strong>Testdag</strong>Vårt testteam kommer till er och onboardar alla i appen.</li><li><strong>Resultat</strong>Riskprofil till varje medarbetare, rapport till er.</li><li><strong>Uppföljning</strong>Uppföljningsmöte efter ungefär två månader.</li></ol></div>`;
      case 'plattform': return `<div class="mote-innehall mote-plattform"><img class="in" src="bilder/app.png" alt="UPerformance-plattformen"><div><span class="mote-eyebrow in" style="--i:1">UPerformance App &amp; plattform</span><h2 class="mote-rubrik in" style="--i:2">All data. <em>Ett ställe.</em></h2>
        <ul class="mote-punkter in" style="--i:3"><li>${ik('bock')}Personlig digital journal med resultat och trender</li><li>${ik('bock')}Anpassat träningsprogram och påminnelser mellan testerna</li><li>${ik('bock')}Följ utvecklingen över tid</li><li>${ik('bock')}Sammanställd rapport på organisationsnivå</li></ul></div></div>`;
      case 'team': return `<div class="mote-innehall"><span class="mote-eyebrow in">Sprungna ur idrotten</span><h2 class="mote-rubrik in" style="--i:1">Ett team i världsklass.</h2>
        <div class="mote-team">
          <div class="mote-person in" style="--i:2"><img src="bilder/gustav.jpg" alt="Gustav Svensson" style="object-position:74% 30%"><div><span>Vd</span><h3>Gustav Svensson</h3><p>Landslagsspelare 2009–2021, f.d. lagkapten i IFK Göteborg.</p></div></div>
          <div class="mote-person in" style="--i:3"><img src="bilder/dale.jpg" alt="Dale Reese" style="object-position:64% 30%"><div><span>Testansvarig</span><h3>Dale Reese</h3><p>25+ år inom internationell elitsport, tidigare i Svenska Fotbollförbundet.</p></div></div>
          <div class="mote-person in" style="--i:4"><img src="bilder/roger.jpg" alt="Roger Mellin" style="object-position:66% 30%"><div><span>Medgrundare</span><h3>Roger Mellin</h3><p>20+ år inom svensk läkemedels- och medtechindustri.</p></div></div>
        </div></div>`;
      case 'fortroende': return `<div class="mote-innehall" style="text-align:center"><span class="mote-eyebrow in">Förtroende</span><h2 class="mote-rubrik in" style="--i:1;margin-inline:auto">Används av organisationer med högt ställda krav.</h2>
        <div class="mote-loggor">${[['bp', 'Brommapojkarna'], ['dif', 'Djurgården Hockey'], ['hammarby', 'Hammarby'], ['varnamo', 'IFK Värnamo']].map(([f, n], i) => `<figure class="in" style="--i:${i + 2}"><img src="bilder/loggor/${f}.png" alt="" style="--i:${i}"><figcaption>${e(n)}</figcaption></figure>`).join('')}</div></div>`;
      case 'nasta': return nastaHtml();
      default: return '';
    }
  }
  // Nästa steg: sammanfattningen i en mening, tre steg och ett summakort till höger (samma prisaOffert som kalkylen)
  function nastaHtml() {
    const k = { ...st.kalk, antal: antalNu() }; const pr = prisaOffert(k);
    // Bara tillval som inte redan ingår i paketet nämns
    // Tillval med pris enligt offert (hjärt-/kärlpaketet) står en gång – i parentesen efter listan
    const extra = k.tillval.filter((t) => !pr.ingar.has(t) && !(pr.offert && PRISER.tillval[t].pris == null)).map((t) => PRISER.tillval[t].namn.toLowerCase());
    return `<div class="mote-innehall mote-nasta"><div><span class="mote-eyebrow in">Nästa steg</span><h2 class="mote-rubrik in" style="--i:1">Redo att sätta igång?</h2>
        <p class="mote-ingress in" style="--i:2">${e(PRISER.paket[k.paket].namn)} för ${e(k.antal)} medarbetare${extra.length ? ' med ' + e(extra.join(', ')) : ''}${pr.offert ? ' (hjärt-/kärlpaket enligt offert)' : ''} – ${kr(pr.total)} exkl. moms första året.</p>
        <ol class="mote-resa mote-resa-3 in" style="--i:3"><li><strong>Idag</strong>Ni får offerten i en säker länk.</li><li><strong>Inom en vecka</strong>Deltagarlista och samtycke via länk.</li><li><strong>Testdag</strong>Vi bokar en dag som passar er verksamhet.</li></ol>
        <div class="in mote-nasta-spara" style="--i:4">${sparaHtml()}</div></div>
      <aside class="mote-nasta-summa in" style="--i:3"><span class="mote-summa-etikett">Ert upplägg</span>
        <dl><div><dt>Paket</dt><dd>${e(PRISER.paket[k.paket].namn)}</dd></div><div><dt>Medarbetare</dt><dd>${e(k.antal)}</dd></div>${extra.length ? `<div><dt>Tillval</dt><dd>${e(extra.join(', '))}</dd></div>` : ''}${k.app ? `<div><dt>App</dt><dd>12 månader</dd></div>` : ''}</dl>
        <div class="mote-summa-tal">${Math.round(pr.total).toLocaleString('sv-SE')}<small>kr</small></div>
        <div class="mote-betal"><div>Förskott 25 %<b>${kr(fakturaDelar(pr.total).forskott)}</b></div><div>Efter testdagen<b>${kr(fakturaDelar(pr.total).slut)}</b></div></div></aside></div>`;
  }

  /* Rendering och navigering ----------------------------------------------------------- */
  const toppHtml = () => `<div class="mote-topp"><span class="mote-logga"><svg aria-hidden="true"><use href="#u-mark"/></svg>Uperformance</span>${st.kundId ? `<span class="mote-kund"><i></i>${e(C.kund(st.kundId).namn)}</span>` : ''}
        <div class="mote-hoger">${window.UPInspelning && UPInspelning.stod() ? `<span data-insp-kund="${e(st.kundId || '')}" data-insp-affar="${e(st.affarId || '')}">${UPInspelning.knappHtml('mote-knapp-insp')}</span>` : ''}${window.UPFilm ? `<button class="mote-knapp mote-knapp-film" type="button" data-film title="Spela filmen (F)">${ik('film')}<span>Filmen</span></button>` : ''}${st.bilder.includes('kalkyl') ? `<button class="mote-knapp" type="button" data-m="till" data-bild="kalkyl">${ik('pengar')}<span>Kalkyl</span></button>` : ''}<button class="mote-knapp mote-helskarm" type="button" data-m="helskarm" aria-label="${document.fullscreenElement ? 'Avsluta helskärm' : 'Helskärm'}">${ik(document.fullscreenElement ? 'helskarm-ut' : 'helskarm')}<span>${document.fullscreenElement ? 'Avsluta helskärm' : 'Helskärm'}</span></button><button class="mote-knapp" type="button" data-m="avsluta" aria-label="Avsluta presentationen">${ik('stang')}<span>Avsluta</span></button></div></div>`;
  function rendera() {
    const aktuella = st.bilder;
    st.el.innerHTML = `${toppHtml()}
      <div class="mote-scen">${aktuella.map((id, i) => `<section class="mote-bild ${id === 'titel' ? 'mote-bild-titel' : ''}" data-bild="${id}" data-lage="${i < st.index ? 'fore' : i > st.index ? 'efter' : 'aktiv'}" aria-hidden="${i !== st.index}" aria-label="${e(BILDER.find((b) => b.id === id).namn)}">${bildHtml(id)}</section>`).join('')}</div>
      <div class="mote-botten"><span class="mote-bildnamn" data-m-namn></span>
        <div class="mote-prickar">${aktuella.map((id, i) => `<button type="button" class="${id === 'kalkyl' ? 'kalkyl-prick' : ''}" data-m="till" data-index="${i}" aria-label="${e(BILDER.find((b) => b.id === id).namn)}"></button>`).join('')}</div>
        <span class="mote-raknare" data-m-raknare></span>
        <button class="mote-pil" type="button" data-m="bak" aria-label="Föregående">${ik('pil-v')}</button><button class="mote-pil" type="button" data-m="fram" aria-label="Nästa">${ik('pil')}</button></div>
      <div class="mote-toaster" data-m-toaster aria-live="polite"></div>`;
    visa(st.index, true);
    bevakaSumma();
    if (window.UPInspelning) UPInspelning.flytta(st.el); // inspelningskortet följer med när presentationen ritas om
  }
  function visa(index, forsta) {
    const n = st.bilder.length; const fore = st.index; st.index = Math.max(0, Math.min(n - 1, index));
    // Bildbytena och de visade bilderna räknas för "Hur gick mötet?" (avsluta)
    if (!forsta && st.index !== fore) st.byten++;
    st.visade.add(st.index);
    // Dolda bilder är inerta – Tab och skärmläsare stannar på den bild som visas
    $$('.mote-bild', st.el).forEach((b, i) => { b.dataset.lage = i < st.index ? 'fore' : i > st.index ? 'efter' : 'aktiv'; b.setAttribute('aria-hidden', String(i !== st.index)); b.inert = i !== st.index; if (i === st.index) b.scrollTop = 0; });
    $$('.mote-prickar button', st.el).forEach((p, i) => p.setAttribute('aria-current', String(i === st.index)));
    $('[data-m-namn]', st.el).textContent = BILDER.find((b) => b.id === st.bilder[st.index]).namn;
    $('[data-m-raknare]', st.el).textContent = `${st.index + 1} / ${n}`;
    $('[data-m="bak"]', st.el).disabled = st.index === 0; $('[data-m="fram"]', st.el).disabled = st.index === n - 1;
    const aktiv = $$('.mote-bild', st.el)[st.index];
    if (!forsta || st.index === 0) $$('[data-m-tal]', aktiv).forEach(raknaUpp);
    $$('[data-paket-rutnat]', st.el).forEach((r) => r.toggleAttribute('data-vilar', r.closest('.mote-bild') !== aktiv)); // premiumkortens kometer står still på dolda bilder
    $$('[data-premium]:not([data-premium-klar])', aktiv).forEach(premiumKort);
  }
  // Premiumkorten på paketbilden: gnistor med slumpad plats/fart, lutning och ljus efter musen (som assets/up.js)
  function premiumKort(kort) {
    kort.setAttribute('data-premium-klar', '');
    const gnistor = $('[data-premium-gnistor]', kort); const farger = ['var(--accent)', 'var(--is)', '#fff'];
    const antal = gnistor ? Number(gnistor.dataset.premiumGnistor) || 16 : 0;
    for (let i = 0; i < antal; i++) {
      const g = document.createElement('i'); const t = 3.2 + Math.random() * 3;
      g.style.cssText = `--x:${(4 + Math.random() * 92).toFixed(1)}%;--dx:${Math.round(Math.random() * 60 - 30)}px;--s:${(6 + Math.random() * 8).toFixed(1)}px;--t:${t.toFixed(2)}s;--f:${(-Math.random() * t).toFixed(2)}s;--c:${farger[i % 3]}`;
      gnistor.appendChild(g);
    }
    if (lugn || !matchMedia('(hover: hover)').matches) return;
    let ram = 0, px = 0, py = 0;
    const rita = () => {
      ram = 0; const r = kort.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (px - r.left) / r.width)), y = Math.min(1, Math.max(0, (py - r.top) / r.height));
      kort.style.setProperty('--lx', `${Math.round(x * kort.offsetWidth)}px`); kort.style.setProperty('--ly', `${Math.round(y * kort.offsetHeight)}px`);
      kort.style.setProperty('--ry', `${((x - .5) * 10).toFixed(2)}deg`); kort.style.setProperty('--rx', `${((.5 - y) * 8).toFixed(2)}deg`);
    };
    kort.addEventListener('pointermove', (ev) => { px = ev.clientX; py = ev.clientY; if (!ram) ram = requestAnimationFrame(rita); });
    kort.addEventListener('pointerleave', () => { kort.style.setProperty('--rx', '0deg'); kort.style.setProperty('--ry', '0deg'); });
  }
  const raknaUpp = (el) => {
    const mal = parseFloat(el.dataset.mTal); const dec = parseInt(el.dataset.dec || '0', 10); const suffix = el.dataset.suffix ?? ' Mkr';
    const fmt = (v) => v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
    if (lugn) { el.textContent = fmt(mal); return; }
    const t0 = performance.now(); const steg = (t) => { const p = Math.min(1, (t - t0 - 500) / 1300); el.textContent = fmt(mal * (p <= 0 ? 0 : 1 - Math.pow(1 - p, 4))); if (p < 1) requestAnimationFrame(steg); };
    requestAnimationFrame(steg);
  };
  // Minisumman (mobil) döljs när det riktiga summakortet syns – samma belopp ska inte stå två gånger
  function bevakaSumma() {
    if (st.summaObs) st.summaObs.disconnect();
    const summa = $('[data-m-summa]', st.el); const mini = $('.mote-minisumma', st.el);
    if (!summa || !mini || !('IntersectionObserver' in window)) return;
    st.summaObs = new IntersectionObserver(([p]) => mini.toggleAttribute('data-dold', p.isIntersecting), { threshold: .25 });
    st.summaObs.observe(summa);
  }
  // Fokus sätts tillbaka på motsvarande knapp efter en omritning (annars hamnar det på body och mellanslag byter bild)
  const fokusNyckel = () => { const f = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-m]'); return f && st.el.contains(f) ? { m: f.dataset.m, varde: f.dataset.varde || '' } : null; };
  const aterFokus = (n, rot) => { if (!n) return; const ny = $(`[data-m="${n.m}"]${n.varde ? `[data-varde="${n.varde}"]` : ''}`, rot || st.el); if (ny && !ny.disabled) ny.focus({ preventScroll: true }); };
  // del: 'summa' (antal ändrat), 'val' (paket/tillval/program) eller 'allt' (sparat, offert)
  function uppdateraKalkyl(del = 'allt') {
    const nyckel = fokusNyckel();
    const nasta = $('.mote-bild[data-bild="nasta"]', st.el); if (nasta) nasta.innerHTML = nastaHtml();
    const bild = $('.mote-bild[data-bild="kalkyl"]', st.el); if (!bild) { aterFokus(nyckel); return; }
    if (del === 'val' || del === 'allt') {
      const p = $('[data-m-del="paket"]', bild); if (p) p.innerHTML = paketvalHtml();
      const t = $('[data-m-del="tillval"]', bild); if (t) t.innerHTML = tillvalHtml();
      const g = $('[data-m-del="program"]', bild); if (g) g.innerHTML = programHtml();
    }
    const summa = $('[data-m-summa]', bild);
    const fore = parseInt(((summa && $('[data-m-total]', summa)) || {}).textContent?.replace(/\D/g, '') || '0', 10);
    if (summa) summa.innerHTML = summaInre();
    const till = Math.round(prisaOffert({ ...st.kalk, antal: antalNu() }).total);
    const mini = $('[data-m-minitotal]', bild); if (mini) mini.textContent = kr(till);
    const el = summa && $('[data-m-total]', summa);
    if (el && !lugn && fore !== till) { const t0 = performance.now(); const steg = (t) => { if (!el.isConnected) return; const p = Math.min(1, (t - t0) / 600); el.textContent = Math.round(fore + (till - fore) * (1 - Math.pow(1 - p, 3))).toLocaleString('sv-SE'); if (p < 1) requestAnimationFrame(steg); }; requestAnimationFrame(steg); }
    aterFokus(nyckel);
  }
  // Egna notiser – CRM:ets toaster ligger under presentationen (och syns inte i helskärm). Returnerar notisen så att texten kan bytas.
  function meddela(text, { varning = false, kvar = false, atgard = null } = {}) {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', varning ? 'alert' : 'status');
    if (varning) t.setAttribute('data-varning', '');
    t.innerHTML = `<span class="toast-ikon">${ik(varning ? 'varning' : 'bock')}</span><span class="toast-text"><span>${e(text)}</span></span>${atgard ? `<button class="toast-atgard" type="button">${e(atgard.text)}</button>` : ''}`;
    $('[data-m-toaster]', st.el).appendChild(t);
    const ut = () => { t.setAttribute('data-ut', ''); setTimeout(() => t.remove(), 320); };
    if (atgard) $('.toast-atgard', t).addEventListener('click', () => { atgard.fn(); ut(); });
    if (!kvar) setTimeout(ut, atgard ? 6500 : 3200);
    return { el: t, byt: (ny, opt = {}) => { const s = $('.toast-text span', t); if (s) s.textContent = ny; t.toggleAttribute('data-varning', !!opt.varning); setTimeout(ut, 3200); } };
  }

  function spara() {
    if (!st.kundId || kundensAffarer().length) {
      const val = $('[data-m-kund]', st.el);
      // Valet bredvid knappen man tryckte på (st.valtSpar sätts vid varje ändring) – inte den första väljaren i presentationen
      const v = st.valtSpar || (val && val.value) || '';
      if (!v) { if (val) (val._valjKnapp || val).focus(); meddela('Välj vilken kund kalkylen ska sparas på', { varning: true }); return false; }
      const [kId, aId] = v.split('|'); st.kundId = kId; st.affarId = aId || null;
    }
    const db = C.db; const k = { paket: st.kalk.paket, antal: antalNu(), tillval: [...st.kalk.tillval], app: !!st.kalk.app, insights: !!st.kalk.insights, uppfoljning: !!st.kalk.uppfoljning };
    st.kalk.antal = k.antal;
    let a = st.sparadAffar ? C.affar(st.sparadAffar) : st.affarId ? C.affar(st.affarId) : null;
    if (a) a.offert = k;
    else {
      a = { id: C.nyId('a'), kundId: st.kundId, titel: 'Hälsokartläggning', steg: 'besok', ansvarig: C.jag, skapad: C.idag(), stegAndrad: C.idag(), check: { info: false, samtycke: false, pub: false, order: false }, offert: k };
      db.affarer.push(a);
    }
    st.sparadAffar = a.id; st.affarId = a.id;
    C.logga(`Upplägget räknades fram på kundmöte: ${PRISER.paket[k.paket].namn} för ${k.antal} medarbetare, ${kr(C.affarVarde(a))}.`, { kundId: a.kundId, affarId: a.id, typ: 'mote' });
    st.offertToken = null; // en ny kalkyl kräver en ny offert
    C.spara(); meddela(`Sparat på ${C.kund(a.kundId).namn} – ${a.titel}`);
    $('.mote-topp', st.el).outerHTML = toppHtml(); uppdateraKalkyl('allt');
    return true;
  }
  function skapaOffert() {
    if (st.skaparOffert) return; // väntar på servern (skarpt läge)
    if (!st.sparadAffar && !spara()) return;
    const a = C.affar(st.sparadAffar); if (!a) return;
    // Samma regel som Till kunden och Mallar (crm.js dokSkapatKvitto): affären står kvar i sitt steg tills offerten är skickad
    const token = C.skapaDokument(a.id, 'offert');
    const sparat = C.spara();
    if (!(window.UPLager && UPLager.skarp)) {
      st.offertToken = token; meddela('Offerten är skapad – öppna den och visa kunden direkt'); foreslaKlar(a.id); uppdateraKalkyl('allt');
      return;
    }
    // Skarpt läge: länken visas först när servern har sparat offerten – samma notis byter text när svaret kommer
    const mote = st; mote.skaparOffert = true; const notis = meddela('Sparar offerten …', { kvar: true }); uppdateraKalkyl('allt');
    Promise.resolve(sparat).then((svar) => {
      mote.skaparOffert = false;
      if (st !== mote) return; // mötet avslutades under tiden
      // Krock: lagret har tagit bort offerten igen – annars finns den (vid nätverksfel sparas den så snart det går)
      if (C.db.offerter[token]) { st.offertToken = token; notis.byt(svar && svar.ok ? 'Offerten är skapad – öppna den och visa kunden direkt' : 'Kunde inte nå servern – offerten sparas så snart det går', { varning: !(svar && svar.ok) }); if (svar && svar.ok) foreslaKlar(a.id); }
      else notis.byt('Offerten kunde inte sparas – försök igen', { varning: true });
      uppdateraKalkyl('allt');
    });
  }

  // En öppen egen uppgift om offerten ("Skicka offert till Tellus") föreslås som klar – samma som CRM:ets toast efter en ny offert
  function foreslaKlar(affarId) {
    const kv = C.dokSkapatKvitto && C.dokSkapatKvitto(affarId, 'offert'); if (!kv || !kv.todo) return;
    meddela(`Uppgiften ”${kv.todo.text}” är kvar i Att göra`, { atgard: { text: 'Markera klar', fn: () => { kv.atgard.fn(); meddela('Uppgiften är avbockad'); } } });
  }
  // Kunden saknar kontaktperson eller e-post: lägg till den här i mötet, annars går offertlänken bara att kopiera
  function sparaKontakt(form) {
    const k = C.kund(st.kundId || (st.sparadAffar && C.affar(st.sparadAffar).kundId)); if (!k) return;
    const pk = C.primarKontakt(k); const d = new FormData(form);
    const namn = String(d.get('namn') || (pk ? pk.namn : '')).trim(); const epost = String(d.get('epost') || '').trim();
    if (!namn) { const f = form.elements.namn; if (f) f.focus(); meddela('Skriv kontaktpersonens namn', { varning: true }); return; }
    if (!EPOST_MONSTER.test(epost)) { form.elements.epost.focus(); meddela('Skriv en giltig e-postadress, t.ex. namn@foretag.se', { varning: true }); return; }
    k.kontakter = k.kontakter || [];
    if (pk) { pk.epost = epost; C.logga(`Kontaktpersonen ${pk.namn} fick e-post ${epost}.`, { kundId: k.id }); }
    else { k.kontakter.push({ id: C.nyId('p'), namn, roll: '', tel: '', epost }); C.logga(`Kontaktpersonen ${namn} lades till på kundmötet.`, { kundId: k.id }); }
    C.spara(); meddela(`${pk ? pk.namn : namn} är kontaktperson – länkarna kan e-postas`);
    $('.mote-topp', st.el).outerHTML = toppHtml(); uppdateraKalkyl('allt');
  }
  function hanteraKlick(ev) {
    const el = ev.target.closest('[data-m]'); if (!el || !st) return;
    const g = el.dataset.m; const k = st.kalk;
    if (g === 'fram') visa(st.index + 1);
    else if (g === 'bak') visa(st.index - 1);
    else if (g === 'till') visa(el.dataset.index != null ? +el.dataset.index : st.bilder.indexOf(el.dataset.bild));
    else if (g === 'avsluta') avsluta();
    else if (g === 'helskarm') { if (document.fullscreenElement) { st.helskarmKnapp = true; document.exitFullscreen().catch(() => {}); } else if (st.el.requestFullscreen) st.el.requestFullscreen().catch(() => {}); }
    else if (g === 'paket') { k.paket = el.dataset.varde; uppdateraKalkyl('val'); }
    else if (g === 'tillval') { const t = el.dataset.varde; k.tillval = k.tillval.includes(t) ? k.tillval.filter((x) => x !== t) : [...k.tillval, t]; uppdateraKalkyl('val'); }
    else if (g === 'program') { k[el.dataset.varde] = !k[el.dataset.varde]; uppdateraKalkyl('val'); }
    else if (g === 'till-summa') { const s = $('.mote-bild[data-bild="kalkyl"] .mote-summa', st.el); if (s) s.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' }); }
    else if (g === 'spara') spara();
    else if (g === 'offert') skapaOffert();
  }
  function hanteraInmatning(ev) {
    const t = ev.target; if (!st) return;
    if (t.matches('[data-m-antal-reglage]')) {
      // Reglaget ritas aldrig om under dragningen – bara sifferfältet, summan och nästa-bilden
      st.kalk.antal = +t.value; t.style.setProperty('--p', reglageP(+t.value) + '%');
      const nr = $('[data-m-antal]', st.el); if (nr) nr.value = t.value;
      if (!st.ram) st.ram = requestAnimationFrame(() => { st.ram = 0; if (st) uppdateraKalkyl('summa'); });
      return;
    }
    if (t.matches('[data-m-antal]')) {
      // Medan man skriver: bara summan räknas om (fältet skrivs aldrig över). Gränserna 1–5000 sätts när man lämnar fältet.
      const v = parseInt(t.value, 10);
      if (ev.type === 'input') { if (v > 0) { st.kalk.antal = Math.min(5000, v); const r = $('[data-m-antal-reglage]', st.el); if (r) { r.value = Math.min(500, Math.max(5, v)); r.style.setProperty('--p', reglageP(v) + '%'); } clearTimeout(st.tid); st.tid = setTimeout(() => st && uppdateraKalkyl('summa'), 120); } return; }
      const ratt = Math.max(1, Math.min(5000, v || 1)); st.kalk.antal = ratt; if (String(ratt) !== t.value) t.value = ratt;
      uppdateraKalkyl('summa');
      return;
    }
    if (t.matches('[data-m-kund]') && ev.type === 'change') { st.valtSpar = t.value; const knapp = $('[data-m="spara"] span', t.closest('.mote-spara')); if (knapp) knapp.textContent = sparaEtikett(); }
  }
  function hanteraTangent(ev) {
    if (!st) return;
    const iFalt = ev.target.closest && ev.target.closest('input, select, textarea, [role="listbox"]');
    if (ev.key === 'Escape') { if (!document.fullscreenElement && !(ev.target.closest && ev.target.closest('[popover], [role="listbox"], .insp-kort'))) { ev.preventDefault(); avsluta(); } return; }
    // Reglage, sifferfält och väljare har egna piltangenter – då byts aldrig bild
    if (iFalt || (ev.key === ' ' && ev.target.closest && ev.target.closest('button, a'))) return;
    if (['ArrowRight', 'PageDown', ' '].includes(ev.key)) { ev.preventDefault(); visa(st.index + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(ev.key)) { ev.preventDefault(); visa(st.index - 1); }
    else if (ev.key === 'Home') visa(0);
    else if (ev.key === 'End') visa(st.bilder.length - 1);
    else if ((ev.key === 'k' || ev.key === 'K') && st.bilder.includes('kalkyl')) visa(st.bilder.indexOf('kalkyl'));
    else if ((ev.key === 'f' || ev.key === 'F') && window.UPFilm && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); UPFilm.spela({ fran: $('.mote-knapp-film', st.el) }); }
  }
  /* Svep med fingret mellan bilderna. Bilderna har touch-action: pan-y (mote.css) – lodrätt rullar webbläsaren, vågrätt är vårt.
     Tar webbläsaren ändå över gesten kommer pointercancel i stället för pointerup: då räknas svepet från senaste pointermove. */
  let svep = null;
  const svepStart = (ev) => { if (ev.pointerType !== 'touch' || !ev.isPrimary || ev.target.closest('input, button, select, textarea, a, [role="listbox"], .insp-kort, .film')) { svep = null; return; } svep = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY }; };
  const svepFlytt = (ev) => { if (svep && ev.pointerId === svep.id) { svep.sx = ev.clientX; svep.sy = ev.clientY; } };
  const svepSlut = (ev) => {
    if (!svep || ev.pointerId !== svep.id || !st) return;
    const avbrutet = ev.type === 'pointercancel'; const dx = (avbrutet ? svep.sx : ev.clientX) - svep.x; const dy = (avbrutet ? svep.sy : ev.clientY) - svep.y; svep = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) visa(st.index + (dx < 0 ? 1 : -1));
  };
  // Helskärmsknappen visar rätt läge (in/ut). Lämnades helskärmen med Esc (eller webbläsarens egen knapp) – inte med vår knapp –
  // säger en notis att Esc en gång till avslutar: i helskärm går första Esc alltid åt till att lämna den (hanteraTangent).
  const helskarmByte = () => {
    if (!st) return; const pa = !!document.fullscreenElement;
    // Filmen öppen: Esc lämnade helskärmen men nästa Esc stänger filmen, inte presentationen – ingen notis då
    if (!pa && st.iHelskarm && !st.helskarmKnapp && !(window.UPFilm && UPFilm.oppen) && matchMedia('(hover: hover)').matches) meddela('Helskärmen är av – tryck Esc en gång till för att avsluta presentationen');
    st.iHelskarm = pa; st.helskarmKnapp = false;
    const k = $('.mote-helskarm', st.el); if (!k) return; k.innerHTML = `${ik(pa ? 'helskarm-ut' : 'helskarm')}<span>${pa ? 'Avsluta helskärm' : 'Helskärm'}</span>`; k.setAttribute('aria-label', pa ? 'Avsluta helskärm' : 'Helskärm');
  };

  function starta({ kundId = null, affarId = null, bilder = BILDER.map((b) => b.id), start = null, antal = null } = {}) {
    const forraNyckel = st ? st.histNyckel : null;
    if (st) avsluta(true);
    koppla();
    const a = affarId ? C.affar(affarId) : null; const kundObj = kundId ? C.kund(kundId) : a ? C.kund(a.kundId) : null;
    const fran = a && a.offert && a.offert.paket && !a.offert.deltagare && a.offert.eget == null && a.offert.typ !== 'uppfoljning' ? a.offert : null;
    const el = document.createElement('div'); el.className = 'mote'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Kundmöte'); el.tabIndex = -1;
    st = {
      el, kundId: kundObj ? kundObj.id : null, affarId: a ? a.id : null, sparadAffar: null, offertToken: null, valtSpar: '',
      bilder: bilder && bilder.length ? bilder : BILDER.map((b) => b.id), index: 0, forraFokus: document.activeElement, inerta: [],
      startTid: Date.now(), startIso: new Date().toISOString(), byten: 0, visade: new Set(), iHelskarm: false, helskarmKnapp: false,
      kalk: fran ? { paket: fran.paket, antal: fran.antal, tillval: [...(fran.tillval || [])], app: !!fran.app, insights: !!fran.insights, uppfoljning: !!fran.uppfoljning }
        : { paket: 'basplus', antal: antal || (kundObj && kundObj.anstallda) || 25, tillval: [], app: true, insights: false, uppfoljning: false },
    };
    if (start) st.index = Math.max(0, st.bilder.indexOf(start));
    document.body.appendChild(el); document.body.style.overflow = 'hidden';
    // Allt bakom presentationen blir inert – fokus och Tab stannar i mötet
    [...document.body.children].forEach((c) => { if (c !== el && !c.inert && c.tagName !== 'SCRIPT') { c.inert = true; st.inerta.push(c); } });
    rendera();
    // bildernas foton avkodas i förväg (utanför huvudtråden): första gången en bild visades avkodades fotot mitt i 3D-övergången
    // och övergången hackade (bild 2, Vår mission)
    el.querySelectorAll('.mote-bild img').forEach((im) => { try { im.decoding = 'async'; if (im.decode) im.decode().catch(() => {}); } catch (err) { /* ok */ } });
    el.addEventListener('click', hanteraKlick); el.addEventListener('input', hanteraInmatning); el.addEventListener('change', hanteraInmatning);
    el.addEventListener('submit', (ev) => { const f = ev.target.closest && ev.target.closest('[data-m-kontakt]'); if (!f) return; ev.preventDefault(); sparaKontakt(f); });
    el.addEventListener('pointerdown', svepStart); el.addEventListener('pointermove', svepFlytt, { passive: true }); el.addEventListener('pointerup', svepSlut); el.addEventListener('pointercancel', svepSlut);
    addEventListener('keydown', hanteraTangent);
    document.addEventListener('fullscreenchange', helskarmByte);
    // Telefonens/webbläsarens bakåtknapp stänger presentationen (en egen post i historiken – adressen ändras inte, vyn står kvar)
    // Unik nyckel per presentation: en kvarglömd upMote-post (omladdning, bakåt + framåt) tas aldrig för den här, och en gammal
    // upFilm (film.js) följer inte med in. En omstart (avsluta(true) + starta) behåller sin post.
    if (forraNyckel && history.state && history.state.upMote === forraNyckel) st.histNyckel = forraNyckel;
    else {
      const { upFilm, ...rest } = history.state || {};
      st.histNyckel = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      history.pushState({ ...rest, upMote: st.histNyckel }, '');
    }
    addEventListener('popstate', vidBakat);
    const fram = $('[data-m="fram"]', el); (fram && !fram.disabled ? fram : el).focus({ preventScroll: true });
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  let viaBakat = false;
  // Står historiken kvar på presentationens post har bara något ovanpå stängts (filmen, film.js) – mötet fortsätter
  function vidBakat() { if (!st || (history.state && history.state.upMote === st.histNyckel)) return; viaBakat = true; try { avsluta(); } finally { viaBakat = false; } }
  // Har mötet redan loggats som möte under presentationen – en sparad kalkyl eller en sparad inspelning (aktivitet typ möte)?
  const moteLoggat = () => !!st.sparadAffar || C.db.aktiviteter.some((x) => x.kundId === st.kundId && x.typ === 'mote' && String(x.tid || '') >= st.startIso);
  function avsluta(tyst) {
    if (!st) return;
    if (window.UPFilm && UPFilm.oppen) UPFilm.stang({ nu: true }); // filmen ligger i presentationens element – städas innan det tas bort
    const el = st.el; const sparad = st.sparadAffar; const forra = st.forraFokus; const data = (forra && forra.dataset) || {}; const bakat = viaBakat;
    /* "Hur gick mötet?" (crm.js oppnaMoteLogg): kund vald, minst ett bildbyte och inget loggat som möte under presentationen. Inte
       heller när en inspelning finns kvar – sparas den loggar den mötet, och arket skulle lägga sig över inspelningskortet. */
    const logg = !tyst && st.kundId && st.byten > 0 && !moteLoggat() && !(window.UPInspelning && UPInspelning.lage) && C.oppnaMoteLogg
      ? { kundId: st.kundId, affarId: st.affarId || null, visade: st.visade.size, alla: st.bilder.length, minuter: Math.max(1, Math.round((Date.now() - st.startTid) / 60000)), id: String(st.startTid) } : null;
    removeEventListener('keydown', hanteraTangent); document.removeEventListener('fullscreenchange', helskarmByte); removeEventListener('popstate', vidBakat);
    // Stängd med Avsluta/Esc: historikens post för presentationen tas bort (tyst = en ny presentation startar och behåller posten)
    if (!tyst && !bakat && history.state && history.state.upMote === st.histNyckel) {
      if (sparad && location.hash !== `#/affar/${sparad}`) { const { upMote, ...rest } = history.state; history.replaceState(Object.keys(rest).length ? rest : null, ''); } else history.back();
    }
    if (st.summaObs) st.summaObs.disconnect();
    st.inerta.forEach((c) => { c.inert = false; });
    const utHelskarm = document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : null;
    document.body.style.overflow = ''; st = null;
    // Inspelningskortet följer med ut ur presentationen (alla lägen – även samtycke och klar). Presentationen märks som stängd först,
    // så att kortet inte letar sig tillbaka in i den.
    if (!tyst) el.setAttribute('data-stanger', '');
    if (window.UPInspelning && UPInspelning.lage) UPInspelning.flytta(document.body);
    if (tyst) { el.remove(); return; }
    setTimeout(() => el.remove(), 420);
    // Knappen man startade från, samma knapp i den omritade vyn (data-g eller hjältens data-ms), Kundmöte-sidans startknapp, annars vyn
    const vy = document.getElementById('vy');
    const synlig = (x) => !!x && x.isConnected && x.getClientRects().length > 0 && !x.closest('[inert], [hidden]');
    const hittaForra = () => [forra, data.g && vy && vy.querySelector(`[data-g="${CSS.escape(data.g)}"]`), data.ms && vy && vy.querySelector(`[data-ms="${CSS.escape(data.ms)}"]`),
      location.hash === '#/mote' && vy && vy.querySelector('[data-mk-start]')].find(synlig) || vy;
    // Har något sparats landar säljaren på affären (fokus på vyn) – utom med bakåtknappen: då står man kvar där mötet startades och
    // notisen leder till affären (annars blev "bakåt" en ny sida framåt). Annars där mötet startades, fokus tillbaka på knappen.
    if (sparad && !bakat && location.hash !== `#/affar/${sparad}`) location.hash = `#/affar/${sparad}`;
    else {
      C.rendera(); const ny = hittaForra(); if (ny) ny.focus({ preventScroll: true });
      const a = sparad && bakat && location.hash !== `#/affar/${sparad}` ? C.affar(sparad) : null;
      if (a) C.toast(`Kalkylen är sparad på ${(C.kund(a.kundId) || {}).namn || 'kunden'} – ${a.titel}`, { href: `#/affar/${a.id}`, text: 'Visa affär' }, C.EMO && C.EMO.akt ? C.EMO.akt.mote : 'bock');
    }
    // Fokus (och arket) först när helskärmen har stängts och vyn har satt sig (affärssidans kolumner flyttar kort två bildrutor
    // efter ritningen): i helskärm är allt utanför presentationen dolt, och fokus hamnade på body när presentationen togs bort
    const ater = () => {
      if (st) return; // en ny presentation har startat
      const nu = document.activeElement;
      if (!nu || nu === document.body || !nu.isConnected || el.contains(nu)) { const m = hittaForra(); if (m) m.focus({ preventScroll: true }); }
      if (logg) C.oppnaMoteLogg(logg);
    };
    const efter = () => requestAnimationFrame(() => requestAnimationFrame(ater));
    if (utHelskarm) utHelskarm.then(efter); else efter();
  }

  // meddela: inspelningen (inspelning.js) skriver i presentationens toaster när kortet ligger i presentationen
  window.UPMote = { BILDER, starta, avsluta, meddela: (text, opt) => (st ? meddela(text, opt) : null), get oppen() { return !!st; } };
})();
