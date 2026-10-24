/* Uperformance – offert och order till kund (#o=<nyckel>). Dokumentet är låst vid skapandet:
   priser och upplägg kommer från ögonblicksbilden, inte från affären som den ser ut nu.
   All data går via window.UPLager (lager.js): i demoläget sparas allt i webbläsaren (som tidigare),
   i skarpt läge hämtas bara den här offerten från servern, som validerar nyckeln och kör
   godkännandet i kundlogik.js. Kundvänd sida: inga emoji (designriktningen, princip 7). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kr = (n) => Math.round(n || 0).toLocaleString('sv-SE') + ' kr';
  const ik = (namn) => `<svg class="ikon" aria-hidden="true"><use href="#i-${namn}"/></svg>`;
  const datum = (iso, opt = { day: 'numeric', month: 'long', year: 'numeric' }) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00' : iso).toLocaleDateString('sv-SE', opt) : '');
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const yta = $('#offert');
  const ark = $('[data-ark]');
  const L = window.UPLager;
  const skarp = !!(L && L.skarp);
  const miljo = (L && L.lage && L.lage.miljo) || 'demo';

  const lasNyckel = () => (location.hash.match(/o=([A-Za-z0-9]+)/) || [])[1];
  let token = lasNyckel();
  let off = null;
  // Skarpt läge: personal som öppnar kundens länk (inloggad i CRM:et) ser en förhandsvisning – bara kunden godkänner och signerar
  let forhand = null;
  let arOrder = false;
  let ORD = null;
  const idag = new Date().toISOString().slice(0, 10);
  // Ord som skiljer offert och order åt
  const ordFor = (o) => (o && o.typ === 'order'
    ? { namn: 'Order', bestamd: 'ordern', Bestamd: 'Ordern', klar: 'signerad', knapp: 'Signera ordern', kort: 'Signera', pagar: 'Signerar …', klarText: 'Signerad', verb: 'signerade' }
    : { namn: 'Offert', bestamd: 'offerten', Bestamd: 'Offerten', klar: 'godkand', knapp: 'Godkänn offerten', kort: 'Godkänn', pagar: 'Godkänner …', klarText: 'Godkänd', verb: 'godkände' });

  /* Sidhuvudet – samma i alla lägen, även medan sidan hämtas och vid fel ------------------------ */
  const logga = () => `<span class="logga-liten"><svg class="logga-hel" viewBox="0 0 1274.2 395" role="img" aria-label="Uperformance"><use href="#logo"/></svg><svg class="logga-mark" viewBox="0 0 396 395" aria-hidden="true"><use href="#logo" width="1274.2" height="395"/></svg></span>`;
  const skal = (innehall) => { yta.innerHTML = `<div class="offert-verktyg offert-verktyg-enkel">${logga()}</div><div class="offert-yta">${innehall}</div>`; };
  const tillStart = `<a class="knapp knapp-kontur" href="../">${ik('hem')}Till hemsidan</a>`;
  // Ett dokument som inte gäller: en mening om varför, vem man kontaktar och en väg vidare
  function ogiltig(rubrik, text, { ikon = 'dokument', ton = '' } = {}) {
    if (ark.open) ark.close();
    const ref = off ? `<dl class="ogiltig-ref"><div><dt>${e(ORD.namn)}</dt><dd>${e(off.nummer || '–')}</dd></div><div><dt>Till</dt><dd>${e((off.kund && off.kund.namn) || '–')}</dd></div><div><dt>Din kontakt</dt><dd>${e(off.saljare || 'Uperformance')}</dd></div></dl>` : '';
    skal(`<section class="kort ogiltig-offert ${ton}" role="alert"><span class="ogiltig-ikon">${ik(ikon)}</span><h1>${e(rubrik)}</h1><p>${e(text)}</p>${ref}<div class="knapprad">${tillStart}</div></section>`);
  }
  const hittadesInte = () => { off = null; ogiltig('Länken fungerar inte', 'Kontrollera att hela adressen kom med – långa länkar bryts ibland i e-postprogram. Fungerar den ändå inte, be din kontaktperson på Uperformance om en ny länk.'); };
  const visaHamtar = () => skal(`<p class="hamtar" role="status">Hämtar …</p><div class="papper-skelett" aria-hidden="true"><div class="papper-skelett-huvud"></div><div class="papper-skelett-kropp"><i></i><i></i><i></i><i></i></div></div>`);
  function visaNatverksfel() {
    if (ark.open) ark.close();
    skal(`<section class="kort ogiltig-offert natfel" role="alert"><span class="ogiltig-ikon">${ik('varning')}</span><h1>Kunde inte nå Uperformance</h1>
      <p>Kontrollera internetanslutningen och försök igen.</p>
      <div class="knapprad"><button class="knapp knapp-accent" type="button" data-g="forsok-igen">Försök igen</button></div></section>`);
  }
  // Makulerad, ersatt eller utgången: dokumentet visas inte. Ger true om dokumentet inte gäller.
  function visaOmOgiltig() {
    // Makulerat av Uperformance (bara i skarpt läge, av en administratör)
    if (off.makulerad) { ogiltig(`${ORD.Bestamd} gäller inte längre`, `${ORD.namn} ${off.nummer} har makulerats av Uperformance. Kontakta ${off.saljare} på Uperformance om du har frågor.`, { ikon: 'las', ton: 'stangd' }); return true; }
    if (off.status === 'ersatt') { ogiltig('Det finns en nyare version', `${ORD.namn} ${off.nummer} har ersatts av ${off.nyareVersion && off.nyareVersion.nummer ? `${ORD.bestamd === 'ordern' ? 'order' : 'offert'} ${off.nyareVersion.nummer}` : 'en uppdaterad version'}. Kontakta ${off.saljare} på Uperformance så skickar vi den.`); return true; }
    if (off.status !== ORD.klar && off.giltigTill < idag) { ogiltig(`${ORD.Bestamd} har gått ut`, `${ORD.namn} ${off.nummer} gällde till ${datum(off.giltigTill)}. Hör av dig till ${off.saljare} så tar vi fram en ny.`, { ikon: 'klocka' }); return true; }
    return false;
  }
  // Lagret avvisar aldrig för väntade fel – men ett oväntat undantag får inte stoppa sidan
  const fraga = async (fn) => { try { return (await fn()) || { ok: false, fel: 'natverk', status: 0 }; } catch (err) { console.error(err); return { ok: false, fel: 'natverk', status: 0 }; } };
  function toast(text, opt = {}) {
    if (window.UPPortal && UPPortal.toast) { UPPortal.toast(text, opt); return; }
    const t = document.createElement('div'); t.className = 'ptoast';
    t.innerHTML = `<span class="ptoast-ikon">${ik('info')}</span><span class="ptoast-text"><b>${e(text)}</b></span>`;
    $('[data-toaster]').appendChild(t);
    setTimeout(() => { t.setAttribute('data-ut', ''); setTimeout(() => t.remove(), 320); }, 3600);
  }
  const forhandHtml = () => (forhand ? `<p class="prototypvarning" role="note" data-forhand>${ik('las')}<span><strong>Förhandsvisning.</strong> Du är inloggad som ${e(forhand.namn || 'personal')} i Uperformance CRM – så här ser kunden ${ORD.bestamd}. Bara kunden kan ${arOrder ? 'signera' : 'godkänna'} den, via länken.</span></p>` : '');
  /* En godkänd/signerad version som en nyare version har ersatt (ersattAv: kunden godkände den nya) eller som har en nyare version
     (nyareVersion: den nya väntar på kunden). Dokumentet visas som det godkändes – raden säger att det inte gäller längre. */
  const ersattHtml = () => {
    const ny = off.ersattAv || off.nyareVersion; if (!ny || !ny.nummer) return '';
    const verb = arOrder ? 'signerade' : 'godkände';
    return `<p class="prototypvarning" role="note" data-ersatt>${ik('info')}<span><strong>${off.ersattAv ? `Ersatt av ${e(ny.nummer)}` : `En nyare version finns (${e(ny.nummer)})`}</strong> – den här versionen gäller inte längre. ${off.ersattAv ? `Ni ${verb} den nya versionen${off.ersattAv.tid ? ` ${e(datum(off.ersattAv.tid))}` : ''}.` : `Kontakta ${e(off.saljare || 'Uperformance')} om ni inte har fått den.`}</span></p>`;
  };
  const varningHtml = () => forhandHtml() + ersattHtml() + (!skarp ? `<p class="prototypvarning">${ik('info')}<span><strong>Prototyp.</strong> ${ORD.Bestamd} bygger på exempeldata och sparas bara i den här webbläsaren.</span></p>`
    : miljo === 'lokal' ? `<p class="prototypvarning">${ik('info')}<span><strong>Testmiljö</strong> – skriv inte in riktiga personuppgifter.</span></p>`
      : `<p class="prototypvarning prototypvarning-lugn">${ik('las')}<span>Uppgifterna hanteras enligt personuppgiftsbiträdesavtalet.</span></p>`);
  // Godkänn-/signeraknappen: i förhandsvisningen avstängd med förklaring (servern svarar ändå 403)
  const godkannAttr = () => (forhand ? `disabled aria-disabled="true" title="Förhandsvisning – bara kunden kan ${arOrder ? 'signera' : 'godkänna'}"` : '');

  // Vad som händer efter godkännandet – samma steg som i "Så går det till". Bygger offerten redan på deltagarna (kundunderlaget)
  // skickas ingen ny länk för deltagarlistan.
  // harUnderlag/underlagPagar (vyOffert, bara sant/falskt): kundunderlaget på samma affär är inskickat, eller en kundlänk väntar på er
  const medDeltagare = () => !!(off.offert && Array.isArray(off.offert.deltagare) && off.offert.deltagare.length);
  const underlagFinns = () => medDeltagare() || !!off.harUnderlag;
  const deltagareText = () => (medDeltagare() ? 'deltagarna finns redan med i offerten' : 'ert underlag med deltagarna har redan kommit in');
  const vadHanderNu = () => (arOrder
    ? ['Vi fakturerar förskottet – 25 % av ordervärdet.', 'Vårt testteam kontaktar er och bokar testdagen.', 'Efter testdagen: riskprofil till varje medarbetare och slutfaktura efter avstämning.']
    : [underlagFinns() ? `${off.saljare || 'Uperformance'} skickar PUB-avtalet och ordern – ${deltagareText()}.`
      : off.underlagPagar ? 'Fyll i deltagarlistan i den säkra länk ni har fått från Uperformance – ordern bygger på den.' : `${off.saljare || 'Uperformance'} skickar en säker länk där ni fyller i deltagarlistan.`, 'Ni signerar ordern och vi fakturerar förskottet (25 %).', 'Vårt testteam bokar testdagen med er.']);
  // Uperformances kontaktväg (skarpt läge: KONTAKT_EPOST/KONTAKT_TEL, server/konfig.js) – personalens egna adresser visas aldrig här
  const UPK = (L && L.lage && L.lage.kontakt) || null;
  const kontaktVagar = () => [
    UPK && UPK.epost ? { typ: 'mejl', text: UPK.epost, href: `mailto:${UPK.epost}` } : null,
    UPK && UPK.tel ? { typ: 'samtal', text: UPK.tel, href: `tel:${String(UPK.tel).replace(/[^\d+]/g, '')}` } : null,
  ].filter(Boolean);
  const kontaktLopText = () => kontaktVagar().map((x) => ` <a href="${e(x.href)}">${e(x.text)}</a>`).join(' ·');

  /* Sidopanelen (bara på breda skärmar, aldrig i utskriften): läget som en ring (dagar kvar eller klar), summan med
     betalplanen, knappen och innehållet – sektionerna i papperet, den som syns markeras medan man läser. Ingen loop. */
  const dagarMellan = (a, b) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00') - Date.parse(a.slice(0, 10) + 'T12:00')) / 864e5);
  const initialer = (namn) => String(namn || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const ringHtml = (andel, inre, ton = '') => `<div class="op-ring"${ton ? ` data-ton="${ton}"` : ''}${andel <= 0 ? ' data-tom' : ''} style="--andel:${Math.max(0, Math.min(1, andel)).toFixed(3)}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="op-ring-bas" cx="22" cy="22" r="19" pathLength="100"/><circle class="op-ring-del" cx="22" cy="22" r="19" pathLength="100"/></svg><span>${inre}</span></div>`;
  let spion = null;
  function folj() {
    if (spion) spion.disconnect();
    const lankar = [...document.querySelectorAll('[data-op-lank]')]; if (!lankar.length || !('IntersectionObserver' in window)) return;
    const synliga = new Map();
    spion = new IntersectionObserver((poster) => {
      poster.forEach((p) => synliga.set(p.target.id, p.isIntersecting ? p.intersectionRatio : 0));
      const forst = lankar.find((l) => (synliga.get(l.dataset.opLank) || 0) > 0);
      lankar.forEach((l) => l.toggleAttribute('aria-current', l === forst));
    }, { rootMargin: '-80px 0px -45% 0px', threshold: [0, .01, .5] });
    lankar.forEach((l) => { const sek = document.getElementById(l.dataset.opLank); if (sek) spion.observe(sek); });
  }
  // Läsmätaren i verktygsraden: hur långt man har kommit i dokumentet (transform, en gång per bildruta)
  let lasTick = false;
  const lasMatare = () => { const i = document.querySelector('.offert-lasning i'); if (!i) return; const max = document.documentElement.scrollHeight - innerHeight; i.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`; };
  addEventListener('scroll', () => { if (lasTick) return; lasTick = true; requestAnimationFrame(() => { lasTick = false; lasMatare(); }); }, { passive: true });
  addEventListener('resize', lasMatare);

  function rendera() {
    const o = off.offert; const pr = prisaOffert(o); const rader = offertRader(o);
    const antal = o.eget != null ? null : o.typ === 'uppfoljning' ? pr.antal : (o.deltagare && o.deltagare.length ? o.deltagare.length : parseInt(o.antal, 10) || 0);
    const paketIOfferten = o.eget != null || o.typ === 'uppfoljning' ? [] : [...new Set(o.deltagare && o.deltagare.length ? o.deltagare.map((d) => d.paket) : [o.paket])].filter((p) => PRISER.paket[p]);
    // Hur många medarbetare varje paket gäller (räknat ur offerten)
    const perPaket = (p) => (o.deltagare && o.deltagare.length ? o.deltagare.filter((d) => d.paket === p).length : antal);
    const godkand = off.status === ORD.klar;
    const lev = off.leverans || {};
    const harHjartkarl = rader.some((r) => r.offert);
    const fp = Math.round(PRISER.forskott * 100); const fd = fakturaDelar(pr.total);
    const marke = '<svg class="paketkort-marke" viewBox="0 0 396 395" aria-hidden="true"><use href="#logo" width="1274.2" height="395"/></svg>';
    // Deltagarbilagan: orderns deltagare, eller – för en offert som bygger på ert inskickade underlag – samma namn och paket
    // (vyOffert ger bara namn, paket och tillval; aldrig e-post eller personnummer)
    const bilaga = arOrder ? (Array.isArray(off.deltagare) ? off.deltagare : []) : Array.isArray(off.deltagarBilaga) ? off.deltagarBilaga : [];
    const sektioner = [arOrder && ['dok-leverans', 'Leverans'], ['dok-spec', 'Specifikation'], ['dok-betal', 'Betalningsplan'],
      (paketIOfferten.length || o.typ === 'uppfoljning' || o.app || o.insights) && ['dok-ingar', 'Det här ingår'], bilaga.length && ['dok-bilaga', 'Deltagare'],
      ['dok-resa', 'Så går det till'], ['dok-villkor', 'Villkor'], ['dok-signering', godkand ? ORD.klarText : ORD.kort]].filter(Boolean);
    const kvar = dagarMellan(idag, off.giltigTill); const totalt = Math.max(1, dagarMellan(off.skapad || idag, off.giltigTill));
    const panelHtml = () => `<aside class="offert-panel" aria-label="Sammanfattning av ${ORD.bestamd}">
      <section class="op-kort op-status">
        <span class="op-etikett">${ORD.namn} ${e(off.nummer)}</span>
        <div class="op-ringrad">${godkand ? ringHtml(1, ik('bock')) : ringHtml(kvar / totalt, `<b>${e(kvar)}</b><small>${kvar === 1 ? 'dag' : 'dagar'}</small>`, kvar <= 5 ? 'gul' : '')}
          <p>${godkand ? `<strong>${ORD.klarText} ${e(datum(off.godkand, { day: 'numeric', month: 'short' }))}</strong>av ${e((off.godkandAv && off.godkandAv.namn) || 'er')}` : `<strong>kvar att ${arOrder ? 'signera' : 'godkänna'}</strong>${arOrder ? 'signeras senast' : 'gäller till'} ${e(datum(off.giltigTill, { day: 'numeric', month: 'long' }))}`}</p></div>
        <div class="op-summa"><span>${arOrder ? 'Ordervärde' : 'Totalt'} exkl. moms</span><strong data-op-tal="${e(pr.total)}">${kr(pr.total)}</strong></div>
        <div class="op-betal" style="--fp:${fp}"><div class="op-stapel" aria-hidden="true"><i></i><i></i></div><div class="op-betal-rad"><span><b>${fp} %</b>förskott <span class="op-kr">${kr(fd.forskott)}</span></span><span><b>${100 - fp} %</b>slutfaktura <span class="op-kr">${kr(fd.slut)}</span></span></div></div>
        ${godkand ? '' : `<button class="knapp knapp-accent op-godkann" type="button" data-g="godkann" ${godkannAttr()}>${ik('bock')}${ORD.knapp}</button>`}
        <button class="knapp knapp-spok op-skriv" type="button" data-g="skriv-ut">${ik('skrivare')}Skriv ut / spara PDF</button>
      </section>
      <nav class="op-kort op-innehall" aria-label="Innehåll"><span class="op-rubrik">Innehåll</span><ol>${sektioner.map(([id, t], i) => `<li><button type="button" data-g="hoppa" data-op-lank="${id}"><span>${String(i + 1).padStart(2, '0')}</span>${e(t)}</button></li>`).join('')}</ol></nav>
      <section class="op-kort op-kontakt"><span class="op-rubrik">Din kontakt</span><div class="op-person"><span class="op-ava" aria-hidden="true">${e(initialer(off.saljare))}</span><div><strong>${e(off.saljare || 'Uperformance')}</strong><small>Uperformance AB</small></div></div>
        <p>Frågor om ${ORD.bestamd}? Kontakta ${e(off.saljare || 'oss')} på Uperformance.</p>${kontaktVagar().map((x) => `<a class="op-lank" href="${e(x.href)}">${ik(x.typ)}<span>${e(x.text)}</span></a>`).join('')}</section>
    </aside>`;
    const upplagg = o.eget != null ? 'Specialoffert' : o.typ === 'uppfoljning' ? 'Uppföljning & coaching' : paketIOfferten.map((p) => PRISER.paket[p].namn).join(' · ');

    yta.innerHTML = `
      <div class="offert-verktyg">
        ${logga()}
        <span class="chip ${off.ersattAv || (godkand && off.nyareVersion) ? '' : godkand ? 'chip-ok' : 'chip-is'} chip-prick offert-chip">${off.ersattAv ? `Ersatt av ${e(off.ersattAv.nummer)}` : godkand && off.nyareVersion ? `Ersätts av ${e(off.nyareVersion.nummer)}` : godkand ? `${ORD.klarText} ${e(datum(off.godkand, { day: 'numeric', month: 'short' }))}` : `${arOrder ? 'Signeras senast' : 'Gäller till'} ${e(datum(off.giltigTill, { day: 'numeric', month: 'short' }))}`}</span>
        <div class="knapprad">
          <button class="knapp knapp-kontur knapp-liten offert-skriv" type="button" data-g="skriv-ut" title="Skriv ut eller spara som PDF">${ik('skrivare')}<span>Skriv ut / spara PDF</span></button>
          ${godkand ? '' : `<button class="knapp knapp-accent knapp-liten" type="button" data-g="godkann" ${godkannAttr()}>${ik('bock')}<span class="lang-text">${ORD.knapp}</span><span class="kort-text">${ORD.kort}</span></button>`}
        </div>
        <div class="offert-lasning" aria-hidden="true"><i></i></div>
      </div>
      <div class="offert-yta" data-med-panel>
        ${varningHtml()}
        <div class="offert-ram">
        ${panelHtml()}
        <article class="dokument ${arOrder ? 'dokument-order' : ''}" aria-label="${ORD.namn} ${e(off.nummer)}">
          <header class="dok-huvud">
            <span class="dok-logga"><svg viewBox="0 0 1274.2 395" role="img" aria-label="Uperformance"><use href="#logo"/></svg></span>
            <div class="dok-titel"><span>${arOrder ? 'Order' : 'Offert'}</span><strong>${e(off.nummer)}</strong><small>${arOrder && off.offertNummer ? `Avser offert ${e(off.offertNummer)}` : 'Hälsokartläggning med elitstandard'}</small></div>
            <dl class="dok-meta">
              <div><dt>Datum</dt><dd>${e(datum(off.skapad))}</dd></div>
              ${arOrder ? `<div><dt>Testperiod</dt><dd>${e(lev.period || 'Bokas med er')}</dd></div>` : `<div><dt>Giltig till</dt><dd>${e(datum(off.giltigTill))}</dd></div>`}
              ${off.kontakt && off.kontakt.namn ? `<div><dt>Er referens</dt><dd>${e(off.kontakt.namn)}</dd></div>` : ''}
              <div><dt>Vår referens</dt><dd>${e(off.saljare)}</dd></div>
            </dl>
          </header>
          <div class="dok-kropp">
            <section class="dok-parter">
              <div class="dok-part"><span>${arOrder ? 'Beställare' : 'Till'}</span><strong>${e(off.kund.namn)}</strong><p>${off.kund.orgnr ? `Org.nr ${e(off.kund.orgnr)}<br>` : ''}${e(off.kontakt.namn || '')}${off.kontakt.roll ? `, ${e(off.kontakt.roll)}` : ''}<br>${e(off.kontakt.epost || '')}${off.kontakt.tel ? ` · ${e(off.kontakt.tel)}` : ''}</p></div>
              <div class="dok-part"><span>${arOrder ? 'Leverantör' : 'Från'}</span><strong>Uperformance AB</strong><p>Skadeförebyggande hälsoanalys<br>${e(off.saljare)}</p></div>
            </section>
            <section class="dok-intro">
              <h1>${e(off.titel)}</h1>
              <p>${e(arOrder && godkand ? 'Ordern är signerad – här är en sammanställning av det ni har beställt.' : off.intro || (arOrder ? (lev.underlagInskickat ? 'Här är ordern för er hälsokartläggning, baserad på ert inskickade underlag.' : off.offertNummer ? `Här är ordern för er hälsokartläggning, enligt offert ${off.offertNummer}.` : 'Här är ordern för er hälsokartläggning.') : 'Tack för ett bra möte. Här är vårt förslag på hälsokartläggning för er.'))}</p>
              ${arOrder ? '' : '<p>Uperformance bygger på elitidrottens testmetodik för att visa var riskerna finns <em>innan</em> de blir skador, sjukskrivningar och produktionsbortfall – och ger varje medarbetare en individuell riskprofil att agera på.</p>'}
            </section>
            ${arOrder ? `<section class="dok-avsnitt" id="dok-leverans"><h2>Leverans</h2><dl class="leverans">
              <div><dt>Testplats</dt><dd>${e(lev.plats || 'Bestäms tillsammans med er')}</dd></div>
              <div><dt>Önskad period</dt><dd>${e(lev.period || 'Bokas med er')}</dd></div>
              <div><dt>Deltagare</dt><dd>${antal == null ? e(off.offert.beskrivning || '–') : `${e(antal)} medarbetare`}</dd></div>
              <div><dt>Fakturaadress</dt><dd>${e(lev.faktura || 'Enligt ert kundregister')}</dd></div>
              ${lev.underlagInskickat ? `<div data-hel><dt>Underlag</dt><dd>Bygger på ert underlag som skickades in ${e(datum(lev.underlagInskickat))}.</dd></div>` : ''}
            </dl></section>` : ''}
            <section class="dok-sammanfattning">
              <div class="dok-tal dok-tal-stor"><span>Ordervärde exkl. moms</span><strong>${kr(pr.total)}</strong><small>${harHjartkarl ? 'Hjärt-/kärlpaket tillkommer enligt offert' : arOrder ? 'Samtliga delar i ordern' : 'Samtliga delar i offerten'}</small></div>
              <div class="dok-tal"><span>Deltagare</span><strong>${antal == null ? '–' : e(antal)}</strong><small>${antal == null ? '' : 'medarbetare'}</small></div>
              <div class="dok-tal"><span>Upplägg</span><strong style="font-size:1.05rem">${e(upplagg)}</strong><small>${o.app ? 'inkl. UPerformance App' : ''}</small></div>
            </section>
            <section class="dok-avsnitt" id="dok-spec"><h2>Specifikation</h2>
              <div class="spec-rulla"><table class="spec">
                <thead><tr><th scope="col">Beskrivning</th><th scope="col">Antal</th><th scope="col">À-pris</th><th scope="col">Summa</th></tr></thead>
                <tbody>${rader.map((r) => `<tr><td><strong>${e(r.text)}</strong>${r.detalj ? `<small>${e(r.detalj)}</small>` : ''}</td><td>${e(r.antal)}</td><td>${r.apris == null ? 'Offert' : kr(r.apris)}</td><td>${r.summa == null ? 'Offereras' : kr(r.summa)}</td></tr>`).join('')}</tbody>
                <tfoot><tr class="summa"><td>Summa exkl. moms</td><td></td><td></td><td>${kr(pr.total)}</td></tr><tr class="moms"><td colspan="4">Moms tillkommer enligt gällande regler.</td></tr></tfoot>
              </table></div>
              ${harHjartkarl ? '<p class="spec-not">Hjärt-/kärlpaketet (blodtester fullständigt, EKG och urintest) offereras separat och ingår inte i summan.</p>' : ''}
            </section>
            <section class="dok-avsnitt" id="dok-betal"><h2>Betalningsplan</h2>
              <div class="betalplan" style="--fp:${fp}"><div class="betal-stapel" aria-hidden="true"><i></i><i></i></div>
                <div class="betalsteg"><b>${fp} %</b><div><strong>${kr(fakturaDelar(pr.total).forskott)}</strong><span>${arOrder ? 'Förskott – faktureras när ni har signerat ordern.' : 'Förskott – faktureras när ordern är signerad.'}</span></div></div>
                <div class="betalsteg"><b>${100 - fp} %</b><div><strong>${kr(fakturaDelar(pr.total).slut)}</strong><span>Slutfaktura – efter testdagen och avstämning av genomfört mot beställt.</span></div></div>
              </div></section>
            ${paketIOfferten.length || o.typ === 'uppfoljning' || o.app || o.insights ? `<section class="dok-avsnitt" id="dok-ingar"><h2>Det här ingår</h2><div class="paketkort-rad">
              ${paketIOfferten.map((p) => { const n = perPaket(p); return `<div class="paketkort paketkort-paket" data-paket="${e(p)}"><span>Paket</span><h3>${e(PRISER.paket[p].namn)}</h3><p>${e(PAKET_INNEHALL[p].rubrik)}</p>${n ? `<p class="paketkort-for">${ik('anvandare')}För ${e(n)} ${n === 1 ? 'medarbetare' : 'medarbetare'}</p>` : ''}<ul>${PAKET_INNEHALL[p].lista.map((x) => `<li>${ik('bock')}${e(x)}</li>`).join('')}</ul></div>`; }).join('')}
              ${o.typ === 'uppfoljning' ? `<div class="paketkort"><span>Program</span><h3>Uppföljning &amp; coaching</h3>${pr.antal ? `<p class="paketkort-for">${ik('anvandare')}För ${e(pr.antal)} medarbetare</p>` : ''}<ul><li>${ik('bock')}Omtest som uppdaterar riskprofilen</li><li>${ik('bock')}Träningsprogrammet justeras efter utvecklingen</li></ul></div>` : ''}
              ${o.app ? `<div class="paketkort paketkort-program"><span>Program</span><h3>UPerformance App</h3><ul><li>${ik('bock')}Individuell riskprofil</li><li>${ik('bock')}Anpassat träningsprogram</li><li>${ik('bock')}Påminnelser mellan testtillfällena</li></ul><p class="paketkort-fot">${ik('kalender')}${antal ? `${e(antal)} medarbetare · ` : ''}12 månader</p>${marke}</div>` : ''}
              ${o.insights ? `<div class="paketkort paketkort-program"><span>Program</span><h3>Team Insights</h3><ul><li>${ik('bock')}Avidentifierad rapport till HR och ledning</li><li>${ik('bock')}Utveckling över tid</li><li>${ik('bock')}Jämförelse mot branschsnittet</li></ul>${marke}</div>` : ''}
            </div></section>` : ''}
            ${bilaga.length ? `<section class="dok-avsnitt" id="dok-bilaga"><h2>Bilaga: deltagare</h2>${arOrder ? '' : `<p class="falt-hint">Offerten bygger på ert inskickade underlag med ${e(bilaga.length)} deltagare.</p>`}<div class="spec-rulla"><table class="spec deltagarbilaga"><thead><tr><th scope="col">#</th><th scope="col">Namn</th><th scope="col">Paket</th><th scope="col">Tillval</th></tr></thead>
              <tbody>${bilaga.map((d, i) => { const r = prisaDeltagare(d.paket, d.tillval); const tv = (d.tillval || []).filter((t) => !r.ingar.has(t) && PRISER.tillval[t]).map((t) => PRISER.tillval[t].namn); return `<tr><td>${e(i + 1)}</td><td><strong>${e(d.namn || '–')}</strong></td><td>${e((PRISER.paket[d.paket] || {}).namn || '')}</td><td>${e(tv.join(', ') || '–')}</td></tr>`; }).join('')}</tbody></table></div>
              <p class="falt-hint">Personnummer och e-post hanteras separat och visas inte i ${ORD.bestamd}.</p></section>` : ''}
            <section class="dok-avsnitt" id="dok-resa"><h2>Så går det till</h2>
              <ol class="dok-resa">
                <li ${godkand ? 'data-klar' : 'data-nu'}>${godkand ? '' : '<em class="resa-nu">Nästa steg</em>'}<strong>${arOrder ? 'Signerad order' : 'Godkänd offert'}</strong>${arOrder ? 'Ni signerar ordern digitalt eller med underskrift.' : 'Ni godkänner offerten digitalt eller med underskrift.'}</li>
                <li ${godkand ? 'data-nu' : ''}>${godkand ? '<em class="resa-nu">Nästa steg</em>' : ''}<strong>${arOrder ? 'Förskott' : 'Underlag &amp; samtycke'}</strong>${arOrder ? 'Vi fakturerar 25 % av ordervärdet.' : medDeltagare() ? 'Deltagarna finns med i offerten – PUB-avtal och samtycken.' : off.harUnderlag ? 'Ert underlag med deltagarna har kommit in – PUB-avtal och samtycken.' : off.underlagPagar ? 'Deltagarlistan i er säkra länk, PUB-avtal och samtycken.' : 'Deltagarlista via säker länk, PUB-avtal och samtycken.'}</li>
                <li><strong>${arOrder ? 'Samtycke' : 'Order'}</strong>${arOrder ? 'PUB-avtal och samtycken är klara före testdagen.' : 'Ordern signeras och förskottet faktureras.'}</li>
                <li><strong>Testdag</strong>Vårt testteam bokar tid med er och onboardar alla i appen.</li>
                <li><strong>Resultat</strong>Riskprofil till varje medarbetare, sammanställning till er.</li>
                <li><strong>Uppföljning</strong>Uppföljningsmöte ungefär två månader senare.</li>
              </ol></section>
            <section class="dok-avsnitt" id="dok-villkor"><h2>Villkor</h2>
              <ul class="villkor">
                <li>Priserna är exklusive moms och gäller per testtillfälle.</li>
                ${arOrder ? `${(() => { const grund = [off.offertNummer ? `offert ${e(off.offertNummer)}` : '', lev.underlagInskickat || (off.deltagare && off.deltagare.length) ? 'ert inskickade underlag' : ''].filter(Boolean); return grund.length ? `<li>Ordern bygger på ${grund.join(' och ')}.</li>` : ''; })()}<li>Efter testdagen stämmer vi av genomfört mot beställt innan slutfakturan skickas.</li>` : `<li>Offerten gäller till och med ${e(datum(off.giltigTill))}.</li>`}
                <li>Förskott om 25 % faktureras när ordern är signerad. Resterande belopp faktureras efter testdagen och avstämningen.</li>
                <li>Innan testerna tecknas personuppgiftsbiträdesavtal, och varje deltagare lämnar sitt samtycke.</li>
                <li>Medicinsk data hanteras av extern tredjepart. Ni som arbetsgivare får en sammanställd rapport på organisationsnivå.</li>
                ${harHjartkarl ? '<li>Hjärt-/kärlpaket offereras separat.</li>' : ''}
              </ul></section>
            <section class="dok-avsnitt dok-signering" id="dok-signering">
              ${godkand ? `<div class="stampel"><span class="stampel-ikon">${ik('bock')}</span><div><strong>${ORD.klarText} av ${e(off.godkandAv.namn)}${off.godkandAv.roll ? `, ${e(off.godkandAv.roll)}` : ''}</strong><span>${e(datum(off.godkand, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} · ${arOrder ? 'digital signering' : 'digitalt godkännande'}</span></div></div>
                <div class="vad-hander"><strong>Vad händer nu?</strong><ol>${vadHanderNu().map((t, i) => `<li><span>${i + 1}</span>${e(t)}</li>`).join('')}</ol><p>Frågor? Kontakta ${e(off.saljare || 'Uperformance')} på Uperformance.</p></div>`
                : `<div class="godkann"><div><strong>${arOrder ? 'Signera ordern' : 'Redo att sätta igång?'}</strong><p>${arOrder ? 'När ordern är signerad fakturerar vi förskottet och vårt testteam kontaktar er för att boka testdagen.' : underlagFinns() ? `Godkänn offerten digitalt, så skickar vi PUB-avtalet och ordern – ${deltagareText()}.` : off.underlagPagar ? 'Godkänn offerten digitalt och fyll i deltagarlistan i er säkra länk – sedan skickar vi PUB-avtalet och ordern.' : 'Godkänn offerten digitalt, så skickar vi länken för deltagarlista och samtycke.'}</p></div><div class="godkann-hoger"><span class="godkann-summa"><small>${arOrder ? 'Ordervärde' : 'Totalt'} exkl. moms</small><b>${kr(pr.total)}</b></span><button class="knapp knapp-accent" type="button" data-g="godkann" ${godkannAttr()}>${ik('bock')}${ORD.knapp}</button></div></div>
                  <div class="signatur"><div>Ort och datum</div><div>Ort och datum</div><div>Underskrift, ${e(off.kund.namn)}</div><div>Underskrift, Uperformance AB</div><div>Namnförtydligande</div><div>Namnförtydligande</div></div>`}
            </section>
          </div>
          <footer class="dok-fot"><span>Uperformance AB · Skadeförebyggande hälsoanalys – byggt på elitidrottens metodik</span><span>${ORD.namn} ${e(off.nummer)}</span></footer>
        </article>
        </div>
        <p class="falt-hint offert-fragor">Frågor om ${ORD.bestamd}? Kontakta ${e(off.saljare)} på Uperformance${kontaktLopText() ? ` –${kontaktLopText()}` : ''}.</p>
      </div>`;
    if (window.UPPortal && !lugn && !yta.hasAttribute('data-visad')) document.querySelectorAll('[data-op-tal], .dok-tal-stor strong').forEach((el) => { el.dataset.varde = '0'; UPPortal.rakna(el, pr.total, { format: (v) => kr(v) }); });
    yta.setAttribute('data-visad', '');
    folj(); lasMatare();
  }
  // Hur godkännandet sparas: i demoläget som tidigare (BankID i skarp drift), i skarpt läge det som faktiskt sparas
  const signeringsInfo = () => (!skarp ? `I skarp version sker ${arOrder ? 'signeringen' : 'godkännandet'} med BankID.` : `Ditt namn, din roll och tidpunkten sparas som ${arOrder ? 'din signering' : 'ditt godkännande'}.`);

  function oppnaGodkann() {
    if (forhand) { toast(`Förhandsvisning – bara kunden kan ${arOrder ? 'signera' : 'godkänna'} ${ORD.bestamd}.`, { typ: 'info' }); return; }
    ark.innerHTML = `<div class="ark-huvud"><div><h2 id="ark-titel">${arOrder ? 'Signera order' : 'Godkänn offert'} <span class="op-nr">${e(off.nummer)}</span></h2><p>${e(off.kund.namn)} · ${kr(prisaOffert(off.offert).total)} exkl. moms</p></div><button class="ikonknapp" type="button" data-g="stang" aria-label="Stäng">${ik('stang')}</button></div>
      <form class="ark-kropp" data-godkann-form>
        <div class="falt-rad"><label><span class="etikett">Ditt namn<span class="krav">*</span></span><input class="falt" name="namn" required maxlength="200" value="${e(off.kontakt.namn || '')}" autocomplete="name"></label>
        <label><span class="etikett">Roll</span><input class="falt" name="roll" maxlength="200" value="${e(off.kontakt.roll || '')}"></label></div>
        <label class="kryss"><input type="checkbox" name="behorig" required data-behorig><span>Jag har behörighet att beställa för ${e(off.kund.namn)} och ${arOrder ? 'signerar ordern enligt villkoren' : 'godkänner offerten och villkoren'}.</span></label>
        <p class="falt-hint" style="margin:0">${e(signeringsInfo())}</p>
        <p class="ark-fel" role="alert" data-ark-fel hidden></p>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="bekrafta" data-bekrafta>${ik('bock')}<span>${arOrder ? 'Signera' : 'Godkänn'}</span></button></div>`;
    ark.showModal();
    // Dator: fokus på namnet (förifyllt) – mobilen väntar med tangentbordet tills man trycker i ett fält
    const namn = $('[data-godkann-form] [name="namn"]', ark); if (namn && matchMedia('(min-width: 641px)').matches) namn.focus();
  }

  // Godkännandet (status, aktivitet, affärens steg och att göra) görs av lagret – i demoläget i
  // webbläsaren, i skarpt läge på servern – med samma logik (kundlogik.js).
  // Fel visas inne i arket: toasten ligger under det modala arket och syns inte där.
  let skickar = false;
  const fokusStampel = () => { const st = document.querySelector('.stampel'); if (!st) return false; st.setAttribute('tabindex', '-1'); st.focus({ preventScroll: true }); return true; };
  async function godkann() {
    const f = $('[data-godkann-form]', ark); if (!f || !f.reportValidity() || skickar) return;
    const d = new FormData(f); const knapp = $('[data-bekrafta]', ark); const felRuta = $('[data-ark-fel]', ark);
    const uppgifter = { namn: String(d.get('namn') || '').trim(), roll: String(d.get('roll') || '').trim(), behorig: !!$('[data-behorig]', f).checked };
    const visaFel = (text) => { if (felRuta) { felRuta.textContent = text; felRuta.hidden = false; } };
    skickar = true;
    if (felRuta) felRuta.hidden = true;
    const knappText = knapp ? knapp.innerHTML : '';
    if (knapp) { knapp.disabled = true; knapp.setAttribute('aria-busy', 'true'); knapp.innerHTML = `${ik('bock')}<span>${ORD.pagar}</span>`; }
    const r = await fraga(() => L.offert.godkann(token, uppgifter));
    skickar = false;
    if (knapp && knapp.isConnected) { knapp.disabled = false; knapp.removeAttribute('aria-busy'); knapp.innerHTML = knappText; }
    if (r.ok && r.vy && r.vy.offert) {
      off = r.vy.offert; off.kund = off.kund || {}; off.kontakt = off.kontakt || {}; off.offert = off.offert || {};
      ark.close(); rendera();
      const st = document.querySelector('.stampel');
      // Knappen som öppnade arket finns inte längre – fokus på kvittensen (stämpeln), så att tangentbord och skärmläsare följer med
      if (st) { fokusStampel(); scrollTo({ top: st.getBoundingClientRect().top + scrollY - 140, behavior: lugn ? 'auto' : 'smooth' }); if (window.UPPortal) setTimeout(() => UPPortal.konfettiFran(st), 700); }
      toast(`${ORD.Bestamd} är ${arOrder ? 'signerad' : 'godkänd'}`, { under: `Tack! ${off.saljare || 'Uperformance'} har fått beskedet.` });
      return;
    }
    // Redan klar, ersatt eller utgången: hämta om – sidan visar läget som det är nu
    if (r.fel === 'redan-klar' || r.fel === 'ersatt' || r.fel === 'utgangen') { ark.close(); await hamta(); if (!fokusStampel()) { const h = document.querySelector('.ogiltig-offert h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } } if (r.fel === 'redan-klar') toast(r.meddelande || 'Dokumentet är redan klart.', { typ: 'info' }); return; }
    if (r.status === 404) { hittadesInte(); return; }
    if (r.status === 400) { visaFel(r.meddelande || 'Namn och behörighet behövs.'); return; }
    // Personal som förhandsgranskar (inloggad i CRM:et): servern tar inte emot ett godkännande – säg varför, inget har skickats
    if (r.status === 403) { visaFel(r.meddelande || `Bara kunden kan ${arOrder ? 'signera' : 'godkänna'} – du är inloggad som personal.`); if (r.fel === 'forhandsvisning' && !forhand) { forhand = { namn: '' }; rendera(); } return; }
    visaFel('Kunde inte nå Uperformance – kontrollera anslutningen och försök igen. Inget har skickats.');
  }

  // Hämta dokumentet via lagret (markerar det som öppnat första gången)
  async function hamta() {
    if (!token) { hittadesInte(); return; }
    if (!L || !L.offert) { visaNatverksfel(); return; }
    visaHamtar();
    const r = await fraga(() => L.offert.hamta(token));
    if (!r.ok || !r.vy || !r.vy.offert) { if (r.ok || r.status === 404 || r.status === 410) hittadesInte(); else visaNatverksfel(); return; }
    off = r.vy.offert; arOrder = off.typ === 'order'; ORD = ordFor(off); forhand = r.forhandsvisning || null;
    off.kund = off.kund || {}; off.kontakt = off.kontakt || {}; off.offert = off.offert || {};
    document.title = `${ORD.namn} ${off.nummer} · Uperformance`;
    if (visaOmOgiltig()) return;
    rendera();
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-g]'); if (!el || el.disabled) return;
    if (el.dataset.g === 'forsok-igen') { hamta(); return; }
    if (!off) return;
    if (el.dataset.g === 'hoppa') { const sek = document.getElementById(el.dataset.opLank); if (sek) { sek.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' }); sek.setAttribute('tabindex', '-1'); sek.focus({ preventScroll: true }); } return; }
    ({ 'skriv-ut': () => print(), godkann: oppnaGodkann, stang: () => ark.close(), bekrafta: godkann }[el.dataset.g] || (() => {}))();
  });
  ark.addEventListener('click', (ev) => { if (ev.target === ark) ark.close(); });
  // Enter i namn- eller rollfältet godkänner som knappen – annars skickades formuläret av webbläsaren
  // (sidan laddades om och namnet hamnade i adressen)
  ark.addEventListener('submit', (ev) => { if (!ev.target.matches('[data-godkann-form]')) return; ev.preventDefault(); if (off) godkann(); });
  // En ny länk i samma flik (bara hashen ändras): hämta det nya dokumentet
  addEventListener('hashchange', () => {
    const ny = lasNyckel(); if (ny === token) return;
    token = ny; off = null; if (ark.open) ark.close(); scrollTo(0, 0); hamta();
  });

  hamta();
})();
