/* Uperformance CRM – ledningen (2026-10-23): närvaro och profiler för alla konton, försäljningschefens översikt (#/chef) och
   bytet mellan chefsvy och säljvy. Adminpanelen och säkerhetshubben ligger i sakerhet.js.
   Laddas före crm.js (som mote.js). crm.js anropar window.UPLedning(K) när allt är definierat och tar in vägarna (vagar),
   handlarna (G) och formulären (FORM). K = crm.js byggstenar (se "16-byggstenar" i crm.js).
   Roller: roll = salj | test | admin, chef: true = försäljningschef (Gustav Svensson är både säljare och försäljningschef).
   Demoläget har full funktion (allt sparas i den här webbläsaren). I skarpt läge kommer kontona från servern och allt som rör
   kontot – status, profil och bild, mål, arbetsdagar, frånvaro och ledighetsbeslut – sparas där (server/api-konto.js via
   UPLager.konto; svaret tas in i db direkt). Servern sätter också senast aktiv och dagarna man jobbat (auth.js). Det finns ingen
   chatt i skarpt läge: ansökningar syns för ledningen under Försäljning (räknaren) och beslut kommer som toast (vidKontoAndring). */
window.UPLedning = (K) => {
  'use strict';
  const { e, ik, kr, krKort, pct, sum, plural, glasKort, sparkline, oppnaArk, arkHuvud, bekrafta, toast, relTid, datumText,
    dagarTill, idag, omDagar, nyId, sel, $, $$, SKARP, anv, arAktiv, spara, rendera, logga, affarVarde, sannolikhet, kund } = K;
  const db = () => K.db;
  const jag = () => K.jag;
  const mig = () => anv(jag());
  const L = K.L;

  /* 01-roller ------------------------------------------------------------------------------------------ */
  // Försäljningschef = chef-flaggan (servern har den också sedan 2026-10-24) – administratören leder via arAdm (kanLeda)
  const arChef = (u) => !!u && arAktiv(u) && u.chef === true;
  const arAdm = (u) => !!u && arAktiv(u) && (u.roll === 'admin' || !!u.admin);
  const kanLeda = () => arChef(mig()) || arAdm(mig());
  const ROLL = { salj: 'Sälj', test: 'Testteam', admin: 'Admin' };
  const roller = (u) => [u.roll === 'admin' ? null : ROLL[u.roll] || 'Sälj', u.chef ? 'Försäljningschef' : null, u.roll === 'admin' || u.admin ? 'Admin' : null].filter(Boolean);
  const rollChips = (u) => roller(u).map((r) => `<span class="lp-roll" data-roll="${e(r)}">${e(r)}</span>`).join('');
  const saljare = () => db().anvandare.filter((u) => arAktiv(u) && u.roll === 'salj');

  /* 02-närvaro: statusen man sätter själv + när man senast var aktiv i CRM:et ------------------------------ */
  const NARV = typeof NARVARO !== 'undefined' ? NARVARO : [{ id: 'online', namn: 'Online', farg: '#3fd59b', ikon: 'bock', under: '' }];
  const OFFLINE = NARV.find((x) => x.id === 'offline') || { id: 'offline', namn: 'Offline', farg: '#6b7785', ikon: 'mane' };
  // Skarpt läge: "Online" kräver att personen har gjort något i CRM:et den senaste halvtimmen och inte loggat ut efteråt
  // (servern sätter senastAktiv högst var 2:a minut och utloggad vid utloggning) – annars visas Offline
  const VARIT_AKTIV_MS = 30 * 6e4;
  const harVaritAktiv = (u) => !!u.senastAktiv && Date.now() - Date.parse(u.senastAktiv) < VARIT_AKTIV_MS && !(u.utloggad && u.utloggad >= u.senastAktiv);
  // Statusen som andra ser: osynlig visas som offline, en status med sluttid som har passerat är Online igen
  const narvaro = (u, somAndra = true) => {
    const st = (u && u.status) || {};
    let kod = st.kod || 'online';
    if (st.till && Date.parse(st.till) < Date.now()) kod = 'online';
    if (kod === 'osynlig' && somAndra && u.id !== jag()) return OFFLINE;
    if (SKARP && kod === 'online' && u.id !== jag() && !harVaritAktiv(u)) return OFFLINE;
    return NARV.find((x) => x.id === kod) || NARV[0];
  };
  const statusText = (u, somAndra = true) => { const n = narvaro(u, somAndra); const st = u.status || {}; const giltig = !st.till || Date.parse(st.till) > Date.now(); return giltig && st.text && n.id !== 'offline' ? `${n.namn} · ${st.text}` : n.namn; };
  // Den inloggade är alltid aktiv nu; osynlig (och offline från servern) visas utan tid för andra – i kort, profil, varningar,
  // rapporten och adminens kontokort (sakerhet.js). Osynlig med passerad sluttid är Online igen och visar tiden som vanligt.
  const doljTid = (u) => !!u && u.id !== jag() && ['osynlig', 'offline'].includes((u.status || {}).kod) && narvaro(u).id === 'offline';
  const arAktivNu = (u) => narvaro(u).id !== 'offline' && (u.id === jag() || (!!u.senastAktiv && Date.now() - Date.parse(u.senastAktiv) < 5 * 6e4));
  const aktivText = (u) => (u.id === jag() ? 'Aktiv i CRM:et nu' : doljTid(u) ? 'Offline' : !u.senastAktiv ? 'Har inte loggat in ännu' : arAktivNu(u) ? 'Aktiv i CRM:et nu' : `Senast aktiv ${relTid(u.senastAktiv)}`);
  // Profilbild eller initialer, med en prick i statusens färg
  const avatarHtml = (u, { storlek = 'm', narv = true } = {}) => {
    const n = narv ? narvaro(u) : null;
    return `<span class="lp-avatar lp-avatar-${storlek}${u.roll === 'test' ? ' lp-avatar-test' : ''}${u.roll === 'admin' ? ' lp-avatar-admin' : ''}"${n ? ` data-narvaro="${e(n.id)}" style="--narv:${e(n.farg)}"` : ''} aria-hidden="true">`
      + `${u.bild ? `<img src="${e(u.bild)}" alt="" draggable="false">` : `<span>${e(u.initialer || '?')}</span>`}${n ? '<i class="lp-prick"></i>' : ''}</span>`;
  };
  const narvChip = (u, somAndra = true) => { const n = narvaro(u, somAndra); return `<span class="lp-narv" style="--narv:${e(n.farg)}"><i aria-hidden="true"></i>${e(statusText(u, somAndra))}</span>`; };

  // Aktivitet: den inloggade markeras som aktiv när hen klickar eller skriver (högst en gång i minuten) – i demoläget per webbläsare
  let senastMarkerad = 0;
  const markeraAktiv = () => {
    if (SKARP || Date.now() - senastMarkerad < 60000) return;
    const u = mig(); if (!u || !u.id) return;
    senastMarkerad = Date.now(); u.senastAktiv = new Date().toISOString();
    const d = idag(); if (!(u.dagar || []).includes(d)) u.dagar = [...(u.dagar || []).slice(-119), d];
    spara();
  };
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, markeraAktiv, { passive: true, capture: true }));
  setTimeout(markeraAktiv, 400);
  // Kontobyte i demoläget (crm.js bytAnvandare): det nya kontot är aktivt nu – spärren på en minut gällde det förra kontot
  // (profilen sa annars "för 10 min sedan" direkt efter bytet)
  const nyInloggning = () => { senastMarkerad = 0; markeraAktiv(); };

  // Sidomenyn: statusknappen under användarkortet och pricken på avataren (crm.js fyllAnvandarval anropar)
  function ritaSido() {
    const u = mig(); if (!u || !u.id) return;
    const n = narvaro(u, false);
    $$('[data-lp-status]').forEach((b) => { b.style.setProperty('--narv', n.farg); b.innerHTML = `<i aria-hidden="true"></i><span>${e(statusText(u, false))}</span>${ik('chevron')}`; b.setAttribute('aria-label', `Din status: ${statusText(u, false)}. Ändra status`); });
    const rad = $('[data-mig-roll]');
    if (rad) rad.innerHTML = `<i class="anv-prick" style="--narv:${e(n.farg)}" aria-hidden="true"></i>${e(statusText(u, false))}<span class="anv-roll"> · ${e(roller(u)[0] || '')}</span>`;
    const kortet = $('.anvandarval'); if (kortet) kortet.setAttribute('aria-label', `${u.namn}, ${statusText(u, false)}. Konton och status`);
    const av = $('[data-mig-avatar]');
    if (av) {
      av.setAttribute('data-narvaro', n.id); av.style.setProperty('--narv', n.farg);
      av.innerHTML = u.bild ? `<img src="${e(u.bild)}" alt="" draggable="false">` : e(u.initialer || '?');
      av.toggleAttribute('data-bild', !!u.bild);
    }
    document.documentElement.toggleAttribute('data-roll-chef', arChef(u));
    document.documentElement.toggleAttribute('data-roll-admin', arAdm(u));
    document.documentElement.toggleAttribute('data-bara-admin', u.roll === 'admin');
    raknaAnsokningar();
    $$('[data-lp-chef]').forEach((x) => { x.hidden = !arChef(u); });
    $$('[data-lp-admin]').forEach((x) => { x.hidden = !arAdm(u); });
    $$('[data-lp-leda]').forEach((x) => { x.hidden = !(arChef(u) || arAdm(u)); });
    vaxelLage();
    anpassaSido();
  }
  // Sidomenyn ska alltid rymmas utan att skrolla: blir den för lång (fler menyval för chef och admin, låg skärm) blir den tätare i
  // två steg (data-sido-tat 1 = lägre rader, 2 = utan gruppnamn). Mäts igen när fönstret ändras och när typsnitten har laddats.
  function anpassaSido() {
    const sido = $('#sidomeny'); if (!sido || !sido.getClientRects().length) return;
    const html = document.documentElement; const nav = $('nav', sido);
    // fotens nederkant mot menyns (menyns dekorativa sken under botten räknas inte) och navigeringens egen höjd
    const fot = $('.sido-fot', sido);
    const over = () => (fot && fot.getBoundingClientRect().bottom > sido.getBoundingClientRect().bottom - 4) || (nav && nav.scrollHeight > nav.clientHeight + 1);
    html.removeAttribute('data-sido-tat');
    for (const steg of ['1', '2', '3']) { if (!over()) break; html.setAttribute('data-sido-tat', steg); }
  }
  let sidoT = 0;
  addEventListener('resize', () => { clearTimeout(sidoT); sidoT = setTimeout(anpassaSido, 120); });
  try { document.fonts.ready.then(() => anpassaSido()); } catch (err) { /* ok */ }

  /* 02b-kontomenyn: kortet i sidomenyn öppnar en panel med ditt konto (status, profil) och alla konton med profilbild, status,
     roller och när de senast var aktiva – i demoläget byter ett klick konto. Panelen reser sig med en mjuk 3D-rörelse och raderna
     glider in; pilarna flyttar mellan raderna, Esc stänger. Samma lista används i Mer-arket på mobilen (kontoListaHtml). */
  const kontoRad = (u, { knapp = !SKARP, aktiv = false } = {}) => {
    const n = narvaro(u); const tagg = knapp && !aktiv ? 'button' : 'div';
    return `<${tagg} class="lp-konto-rad${aktiv ? ' lp-konto-jag' : ''}"${tagg === 'button' ? ` type="button" data-g="lp-byt" data-id="${e(u.id)}"` : ''} style="--narv:${e(n.farg)}">
      ${avatarHtml(u, { storlek: 'm' })}<span class="lp-konto-text"><strong title="${e(u.namn)}">${e(u.namn)}</strong><small class="lp-konto-roller">${roller(u).map((r) => e(r)).join(' · ')}</small>
        <span class="lp-konto-status"><i aria-hidden="true"></i><b>${e(n.namn)}</b>${n.id === 'offline' && doljTid(u) ? '' : `<span class="${arAktivNu(u) ? 'lp-aktiv-nu' : ''}">· ${e(arAktivNu(u) ? 'aktiv nu' : u.senastAktiv ? relTid(u.senastAktiv) : '–')}</span>`}</span></span>
      ${aktiv ? '<span class="lp-konto-bock" aria-label="Inloggad">' + ik('bock') + '</span>' : ''}</${tagg}>`;
  };
  function kontoListaHtml() {
    const u = mig(); const andra = db().anvandare.filter((x) => arAktiv(x) && x.id !== u.id);
    return `<div class="lp-konto-lista" role="list">${[u, ...andra].map((x, i) => `<div role="listitem" style="--i:${i}">${kontoRad(x, { aktiv: x.id === u.id })}</div>`).join('')}</div>`;
  }
  let kontoPanel = null;
  function stangKonto(fokus = true) {
    if (!kontoPanel) return; const p = kontoPanel; kontoPanel = null; document.documentElement.removeAttribute('data-konto-oppen');
    p.setAttribute('data-stanger', ''); setTimeout(() => p.remove(), 220);
    const k = $('.anvandarval'); if (k) { k.setAttribute('aria-expanded', 'false'); if (fokus) k.focus({ preventScroll: true }); }
  }
  function kontoMeny() {
    if (kontoPanel) { stangKonto(); return; }
    const kort = $('.anvandarval'); if (!kort) return;
    const u = mig(); const n = narvaro(u, false); const st = u.status || {};
    const ram = document.createElement('div'); ram.className = 'lp-konto-ram';
    const p = document.createElement('div');
    p.className = 'lp-konto'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Konton och status'); p.setAttribute('data-mork-yta', '');
    p.innerHTML = `
      <div class="lp-konto-topp" style="--narv:${e(n.farg)}">
        <button type="button" class="lp-konto-stang" data-lp-konto-stang aria-label="Stäng" title="Stäng (Esc)">${ik('stang')}</button>
        <span class="lp-konto-bild"><span class="lp-konto-ring" aria-hidden="true"></span>${avatarHtml(u, { storlek: 'l', narv: false })}</span><div class="lp-konto-du"><small>Inloggad som</small><strong title="${e(u.namn)}">${e(u.namn)}</strong><span class="lp-konto-roll">${roller(u).map((r) => `<span class="lp-roll" data-roll="${e(r)}">${e(r)}</span>`).join('')}</span></div>
        <button type="button" class="lp-konto-statusknapp" data-g="lp-status" style="--narv:${e(n.farg)}"><i aria-hidden="true"></i><span>${e(statusText(u, false))}</span>${ik('redigera')}</button>
      </div>
      <div class="lp-konto-snabb">${NARV.filter((x) => x.valbar !== false).map((x) => `<button type="button" class="lp-konto-snabbval" data-g="lp-snabbstatus" data-kod="${e(x.id)}" style="--narv:${e(x.farg)}" title="${e(x.namn)}" aria-label="Status: ${e(x.namn)}" aria-pressed="${x.id === n.id && !st.till}">${ik(x.ikon)}</button>`).join('')}</div>
      <div class="lp-konto-grupp"><p class="lp-konto-rubrik"><span>${SKARP ? 'Teamet' : 'Byt konto'}</span><small>${SKARP ? 'Status och senast aktiv' : 'Demo: logga in som någon annan i teamet'}</small></p>
      ${kontoListaHtml()}</div>
      <div class="lp-konto-fot"><a class="lp-konto-lank" href="#/profil" title="Min profil">${ik('anstallda')}<span>Min profil</span></a>${kanLeda() && !SKARP ? `<button type="button" class="lp-konto-lank" data-g="lp-ny-anstalld" title="Lägg till konto">${ik('anvandare-plus')}<span>Nytt konto</span></button>` : ''}<button type="button" class="lp-konto-lank" data-g="logga-ut" title="Logga ut">${ik('logga-ut')}<span>Logga ut</span></button></div>`;
    const sido = kort.closest('.sido'); const s = sido && sido.getBoundingClientRect();
    if (s && s.width >= 180 && s.height >= 300) {
      ram.setAttribute('data-i-sido', '');
      Object.assign(ram.style, { left: `${s.left}px`, top: `${s.top}px`, width: `${s.width}px`, height: `${s.height}px` });
      ram.style.setProperty('--r', getComputedStyle(sido).borderTopLeftRadius || '22px');
    } else { // reserv: en ruta ovanför kortet
      const r = kort.getBoundingClientRect(); const bredd = Math.min(Math.max(r.width + 40, 330), innerWidth - 24);
      Object.assign(ram.style, { left: `${Math.max(12, Math.min(r.left, innerWidth - bredd - 12))}px`, width: `${bredd}px`, top: '12px', height: `${Math.max(300, r.top - 22)}px` });
    }
    ram.appendChild(p); document.body.appendChild(ram);
    // tätare i två steg tills allt syns – först därefter rullar kontolistan (många konton)
    const lista = $('.lp-konto-lista', p); p.setAttribute('data-mater', '');
    for (const steg of ['1', '2']) { if (!lista || lista.scrollHeight <= lista.clientHeight + 1) break; p.setAttribute('data-tat', steg); }
    if (lista && lista.scrollHeight > lista.clientHeight + 1) p.setAttribute('data-rulla', '');
    p.removeAttribute('data-mater');
    ram.addEventListener('pointerdown', (ev) => { if (ev.target === ram) stangKonto(false); });
    $('[data-lp-konto-stang]', p).addEventListener('click', () => stangKonto());
    kontoPanel = ram; kort.setAttribute('aria-expanded', 'true'); document.documentElement.setAttribute('data-konto-oppen', '');
    requestAnimationFrame(() => { const f = $('.lp-konto-rad:not(.lp-konto-jag), .lp-konto-statusknapp', p); if (f) f.focus({ preventScroll: true }); });
  }
  document.addEventListener('pointerdown', (ev) => { if (kontoPanel && !kontoPanel.contains(ev.target) && !ev.target.closest('.anvandarval')) stangKonto(false); }, true);
  document.addEventListener('keydown', (ev) => {
    if (!kontoPanel) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stangKonto(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const alla = $$('button, a', kontoPanel); const i = alla.indexOf(document.activeElement);
      const n = alla[(i + (ev.key === 'ArrowDown' ? 1 : -1) + alla.length) % alla.length]; if (n) { ev.preventDefault(); n.focus(); }
    }
  }, true);
  addEventListener('hashchange', () => stangKonto(false));
  addEventListener('resize', () => stangKonto(false));

  /* 03-bytet mellan chefsvy och säljvy (för den som är både säljare och chef) --------------------------- */
  // Profilerna hör till båda vyerna: läget man kom ifrån står kvar (chefen som öppnar en säljares profil från #/chef är kvar i
  // chefsvyn, och Försäljning är markerad i menyn – navTill), annars gäller säljvyn
  const CHEFSVAGAR = /^#\/(chef|profil)/;
  let senastSalj = '#/', senastChef = '#/chef', lageNu = /^#\/chef/.test(location.hash || '') ? 'chef' : 'salj';
  addEventListener('hashchange', () => {
    const h = location.hash || '#/';
    if (/^#\/chef/.test(h)) { senastChef = h; lageNu = 'chef'; } else if (!CHEFSVAGAR.test(h)) { lageNu = 'salj'; if (!/^#\/(admin|sakerhet|anvandare)/.test(h)) senastSalj = h; }
    vaxelLage();
  });
  const chefslage = () => { const h = location.hash || ''; return /^#\/chef/.test(h) || (/^#\/profil/.test(h) && lageNu === 'chef' && kanLeda()); };
  // Menyvalet som ska vara markerat (crm.js rendera): en kollegas profil i chefsvyn hör till Försäljning
  const navTill = (vag) => { const m = (location.hash || '').match(/^#\/profil\/([\w-]+)$/); return vag === 'profil' && m && m[1] !== jag() && chefslage() ? 'chef' : vag; };
  function vaxelLage() {
    const chef = chefslage();
    document.documentElement.toggleAttribute('data-vy-chef', chef);
    $$('[data-vy-vaxel]').forEach((v) => { v.hidden = !arChef(mig()) || mig().roll === 'test'; v.setAttribute('data-lage', chef ? 'chef' : 'salj'); $$('button', v).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.vy === 'chef') === chef))); });
  }
  function bytVy(till) {
    const chef = till === 'chef'; const nu = chefslage();
    if (chef === nu) return;
    const vy = $('#vy');
    if (vy && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      vy.setAttribute('data-vy-byte', chef ? 'till-chef' : 'till-salj');
      clearTimeout(bytVy.t); bytVy.t = setTimeout(() => vy.removeAttribute('data-vy-byte'), 900);
    }
    location.hash = chef ? senastChef : senastSalj;
    toast(chef ? 'Chefsvy – teamets försäljning' : 'Säljvy – din egen försäljning', null, chef ? 'krona' : 'trend');
  }

  /* 04-försäljningen per säljare ------------------------------------------------------------------------ */
  const OPPNA = ['kontakt', 'besok', 'offert', 'underlag'];
  const STEGNAMN = Object.fromEntries((typeof SALJSTEG !== 'undefined' ? SALJSTEG : []).map((s) => [s.id, s.namn]));
  const dagarSedan = (iso) => (iso ? -dagarTill(String(iso).slice(0, 10)) : 999);
  const inom = (iso, dagar) => !!iso && dagarSedan(iso) <= dagar && dagarSedan(iso) >= 0;
  // Arbete = händelser i tidslinjerna. Frånvaro, ansökningar och beslut loggas som typ 'franvaro' (demoläget) och räknas aldrig
  // som aktivitet, jobbad dag eller kalenderhändelse – och visas inte i teamets tidslinjer (crm.js översikten filtrerar samma typ)
  const arbete = (a) => !!a && a.typ !== 'franvaro';
  function stat(u) {
    const af = db().affarer.filter((a) => a.ansvarig === u.id);
    const oppna = af.filter((a) => OPPNA.includes(a.steg));
    const vunna = af.filter((a) => a.steg === 'signerad');
    const forlorade = af.filter((a) => a.steg === 'forlorad' && !(a.forlorad && a.forlorad.felregistrerad)); // felregistrerade räknas inte (crm.js raknasForlorad)
    const v90 = vunna.filter((a) => inom(a.stegAndrad, 90)), f90 = forlorade.filter((a) => inom(a.stegAndrad, 90));
    const akt = db().aktiviteter.filter((x) => x.av === u.id && arbete(x));
    const perDag = Array.from({ length: 14 }, (_, i) => akt.filter((x) => dagarSedan(x.tid) === 13 - i).length);
    const todos = db().todos.filter((t) => t.ansvarig === u.id && !t.klar);
    const mal = +u.mal || 0;
    return {
      u, af, oppna, vunna,
      pipeline: sum(oppna.map(affarVarde)), viktat: sum(oppna.map((a) => affarVarde(a) * sannolikhet(a).p)),
      vunnet90: sum(v90.map(affarVarde)), vinstgrad: v90.length + f90.length ? v90.length / (v90.length + f90.length) : (vunna.length + forlorade.length ? vunna.length / (vunna.length + forlorade.length) : null),
      perSteg: OPPNA.map((s) => ({ id: s, antal: oppna.filter((a) => a.steg === s).length, varde: sum(oppna.filter((a) => a.steg === s).map(affarVarde)) })),
      stilla: oppna.filter((a) => dagarSedan(a.stegAndrad || a.skapad) >= 14),
      akt7: perDag.slice(7).reduce((x, y) => x + y, 0), perDag,
      moten90: akt.filter((x) => x.typ === 'mote' && inom(x.tid, 90)).length,
      offerter90: Object.values(db().offerter || {}).filter((o) => o.typ === 'offert' && inom(o.skapad, 90) && (db().affarer.find((a) => a.id === o.affarId) || {}).ansvarig === u.id).length,
      forfallna: todos.filter((t) => t.datum && t.datum < idag()), todos,
      mal, malKvartal: mal * 3, malAndel: mal ? sum(v90.map(affarVarde)) / (mal * 3) : null,
    };
  }

  /* 05-försäljningschefens översikt (#/chef) ------------------------------------------------------------ */
  const chefUi = { filter: 'alla' };
  function visaChef() {
    const u = mig();
    if (!kanLeda()) return lasHjalte('Försäljningsledning', 'Översikten över teamets försäljning är till för försäljningschefen.');
    const team = saljare(); const S = team.map(stat);
    const tot = { pipeline: sum(S.map((x) => x.pipeline)), viktat: sum(S.map((x) => x.viktat)), vunnet: sum(S.map((x) => x.vunnet90)), mal: sum(S.map((x) => x.malKvartal)) };
    const vg = (() => { const v = S.flatMap((x) => x.vunna.filter((a) => inom(a.stegAndrad, 90))).length, f = db().affarer.filter((a) => a.steg === 'forlorad' && !(a.forlorad && a.forlorad.felregistrerad) && inom(a.stegAndrad, 90) && team.some((t) => t.id === a.ansvarig)).length; return v + f ? v / (v + f) : null; })();
    const aktivaNu = team.filter((t) => !['semester', 'sjuk', 'offline'].includes(narvaro(t).id)).length;
    const utan = db().affarer.filter((a) => OPPNA.includes(a.steg) && (!a.ansvarig || !arAktiv(anv(a.ansvarig)) || anv(a.ansvarig).namn === 'Okänd'));
    const hals = (() => { const t = new Date().getHours(); return t < 10 ? 'God morgon' : t < 17 ? 'Hej' : 'God kväll'; })();
    const hjalte = `
      <section class="sidhjalte lp-chefhjalte" data-sidhjalte data-mork-yta>
        <div class="sidhjalte-text">
          <span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Försäljningsledning · live ur CRM:et</span>
          <h1>${e(hals)}, ${e(u.kort || u.namn)}. <em>Så går teamet.</em></h1>
          <p class="sidhjalte-ingress">${plural(team.length, 'säljare', 'säljare')} · ${aktivaNu} i tjänst nu · ${plural(S.reduce((x, y) => x + y.oppna.length, 0), 'öppen affär', 'öppna affärer')}${utan.length ? ` · <strong class="lp-varm">${plural(utan.length, 'affär', 'affärer')} utan ansvarig</strong>` : ''}</p>
          <div class="sidhjalte-knappar">
            <button class="knapp knapp-accent" type="button" data-g="lp-ny-anstalld">${ik('anvandare-plus')}Lägg till säljare</button>
            <button class="knapp knapp-glas" type="button" data-g="lp-mal">${ik('mal')}Sätt mål</button>
            <button class="knapp knapp-glas" type="button" data-g="lp-rapport">${ik('ladda-ner')}Exportera rapport</button>
          </div>
        </div>
        <div class="sidhjalte-tal" data-antal="4">${[
          glasKort({ emo: 'portfolj', etikett: 'Teamets pipeline', varde: tot.pipeline, format: 'krkort', under: `${plural(S.reduce((x, y) => x + y.oppna.length, 0), 'affär', 'affärer')} öppna`, href: '#/salj' }),
          glasKort({ emo: 'mal', etikett: 'Viktad prognos', varde: tot.viktat, format: 'krkort', under: 'värde × chansen att vinna' }),
          glasKort({ emo: 'medalj', etikett: 'Vunnet 90 dagar', varde: tot.vunnet, format: 'krkort', under: tot.mal ? `${pct(tot.vunnet / tot.mal)} av kvartalsmålet ${krKort(tot.mal)}` : 'inget mål satt', extra: tot.mal ? `<span class="lp-glasmatare" style="--andel:${Math.min(1, tot.vunnet / tot.mal).toFixed(3)}" aria-hidden="true"><i></i></span>` : '' }),
          glasKort({ emo: 'trend', etikett: 'Vinstgrad 90 d', text: vg == null ? '–' : pct(vg), under: 'vunna av avgjorda affärer' }),
        ].join('')}</div>
      </section>`;
    // teamet just nu
    const filtrerade = S.filter((x) => chefUi.filter === 'alla' || (chefUi.filter === 'tillganglig' ? ['online'].includes(narvaro(x.u).id) : chefUi.filter === 'upptagen' ? ['upptagen', 'mote', 'strax', 'lunch'].includes(narvaro(x.u).id) : ['semester', 'sjuk', 'offline'].includes(narvaro(x.u).id)));
    const filterKnapp = (id, namn) => `<button type="button" class="lp-filter" data-g="lp-chef-filter" data-filter="${id}" aria-pressed="${chefUi.filter === id}">${namn}</button>`;
    const max = Math.max(1, ...S.map((x) => x.pipeline));
    const kort = filtrerade.map((x) => saljkort(x, max)).join('') || `<p class="lp-tom">Ingen i teamet har den statusen just nu.</p>`;
    return `${hjalte}
      <section class="lp-band" data-mork-yta aria-labelledby="lp-h-team">
        <header class="lp-band-huvud"><div><p class="lp-ogon">01 · Teamet</p><h2 id="lp-h-team">Teamet <em>just nu</em></h2><p class="lp-ingress">Status, aktivitet i CRM:et, pipeline och mål per säljare – klicka för profilen.</p></div>
          <div class="lp-filterrad" role="group" aria-label="Visa">${filterKnapp('alla', 'Alla')}${filterKnapp('tillganglig', 'Tillgängliga')}${filterKnapp('upptagen', 'Upptagna')}${filterKnapp('borta', 'Borta')}</div></header>
        <div class="lp-saljrutnat">${kort}</div>
      </section>
      ${narvaroBand()}
      <section class="lp-band lp-kalband" data-mork-yta aria-labelledby="lp-h-tkal"><header class="lp-band-huvud"><div><p class="lp-ogon">03 · Kalender</p><h2 id="lp-h-tkal">Teamets <em>kalender</em></h2><p class="lp-ingress">Möten, samtal, uppgifter, testdagar och ledighet – för hela teamet eller en person, per månad eller år. Ansökningar om ledighet godkänns här.</p></div></header>${kalenderHtml({ nyckel: 'chef', personer: db().anvandare.filter((x) => arAktiv(x) && x.roll !== 'admin') })}</section>
      <div class="lp-tvakol">
        <section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="lp-h-upp"><header class="lp-band-huvud"><div><p class="lp-ogon">04 · Att agera på</p><h2 id="lp-h-upp">Behöver din <em>uppmärksamhet</em></h2></div></header>${uppmarksamhet(S, utan)}</section>
        <section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="lp-h-pipe"><header class="lp-band-huvud"><div><p class="lp-ogon">05 · Pipeline</p><h2 id="lp-h-pipe">Pipeline <em>per säljare</em></h2></div></header>${pipePerSaljare(S)}</section>
      </div>
      <div class="lp-tvakol">
        <section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="lp-h-akt"><header class="lp-band-huvud"><div><p class="lp-ogon">06 · Aktivitet</p><h2 id="lp-h-akt">Aktivitet <em>14 dagar</em></h2></div></header>${aktivitetKarta()}</section>
        <section class="lp-band lp-band-halv" data-mork-yta aria-labelledby="lp-h-topp"><header class="lp-band-huvud"><div><p class="lp-ogon">07 · Resultat</p><h2 id="lp-h-topp">Topplistan <em>90 dagar</em></h2></div></header>${topplista(S)}</section>
      </div>`;
  }
  // Säljarkortet: vem och status, tre tal, kvartalsmålet i klartext, affärerna per steg (namn, antal, värde), aktiviteten per
  // dag den senaste veckan (veckodagar under staplarna) och det som behöver göras – knapparna står alltid längst ned
  const STEG_KORT = { kontakt: 'Kontakt', besok: 'Besök', offert: 'Offert', underlag: 'Underlag' };
  function saljkort(x, max) {
    const { u } = x; const n = narvaro(u);
    const maxV = Math.max(1, ...x.perSteg.map((s) => s.varde));
    const vecka = x.perDag.slice(7); const maxD = Math.max(1, ...vecka);
    const varningar = [x.stilla.length ? `<span class="lp-varning">${ik('klocka')}${plural(x.stilla.length, 'affär står still', 'affärer står still')} (14+ d)</span>` : '', x.forfallna.length ? `<span class="lp-varning">${ik('larm')}${plural(x.forfallna.length, 'förfallen uppgift', 'förfallna uppgifter')}</span>` : ''].join('');
    return `<article class="lp-saljare" data-narvaro="${e(n.id)}" style="--narv:${e(n.farg)}">
      <a class="lp-saljare-topp" href="#/profil/${e(u.id)}">${avatarHtml(u, { storlek: 'l' })}<span class="lp-saljare-namn"><strong>${e(u.namn)}</strong><small>${e(u.titel || roller(u).join(' · '))}</small></span>${ik('pil')}</a>
      <div class="lp-saljare-status">${narvChip(u)}${doljTid(u) ? '' : `<span class="lp-aktiv${arAktivNu(u) ? ' lp-aktiv-nu' : ''}">${e(aktivText(u))}</span>`}</div>
      <dl class="lp-saljare-tal">
        <div title="Värdet av alla öppna affärer"><dt>Pipeline</dt><dd>${e(krKort(x.pipeline))}</dd><span class="lp-stapel" style="--andel:${(x.pipeline / max).toFixed(3)}" aria-hidden="true"><i></i></span></div>
        <div title="Affärer som inte är vunna eller förlorade"><dt>Öppna affärer</dt><dd>${x.oppna.length}</dd></div>
        <div title="Signerade ordrar de senaste 90 dagarna"><dt>Vunnet 90 d</dt><dd>${e(krKort(x.vunnet90))}</dd></div>
      </dl>
      ${x.mal ? `<div class="lp-mal" title="Kvartalsmål ${e(kr(x.malKvartal))} (månadsmål × 3)"><span class="lp-mal-text"><span>Kvartalsmål: <b>${e(krKort(x.vunnet90))}</b> av ${e(krKort(x.malKvartal))}</span><strong>${e(pct(x.malAndel || 0))}</strong></span><span class="lp-malstapel" style="--andel:${Math.min(1, x.malAndel || 0).toFixed(3)}" aria-hidden="true"><i></i></span></div>`
        : `<button type="button" class="lp-mal lp-mal-tom" data-g="lp-mal" data-id="${e(u.id)}">${ik('mal')}Inget mål – sätt ett</button>`}
      <div class="lp-sk-del"><p class="lp-sk-rubrik">Öppna affärer per steg<span>${e(krKort(x.pipeline))}</span></p>
        <div class="lp-sk-steg">${x.perSteg.map((s) => `<span class="lp-sk-stegruta" data-steg="${e(s.id)}"${s.antal ? '' : ' data-tom'} title="${e(STEGNAMN[s.id] || s.id)}: ${plural(s.antal, 'affär', 'affärer')} värda ${e(kr(s.varde))}"><i style="--andel:${(s.varde / maxV).toFixed(3)}" aria-hidden="true"></i><b>${s.antal}</b><small>${e(STEG_KORT[s.id] || STEGNAMN[s.id] || s.id)}</small><em>${s.antal ? e(krKort(s.varde)) : '–'}</em></span>`).join('')}</div></div>
      <div class="lp-sk-del"><p class="lp-sk-rubrik">Aktivitet senaste veckan<span>${plural(x.akt7, 'händelse', 'händelser')}</span></p>
        <div class="lp-sk-vecka">${vecka.map((v, i) => { const iso = omDagar(i - 6); return `<span title="${e(`${VDAG[veckodag(iso) - 1]} ${kortDatum(iso)}: ${plural(v, 'händelse', 'händelser')}`)}"${i === 6 ? ' data-idag' : ''}><i style="--v:${(v / maxD).toFixed(3)}"${v ? '' : ' data-noll'}></i><small>${i === 6 ? 'Idag' : VDAG[veckodag(iso) - 1].slice(0, 2)}</small></span>`; }).join('')}</div></div>
      ${varningar ? `<div class="lp-varningar">${varningar}</div>` : ''}
      <div class="lp-saljare-knappar">
        <button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-salj-for" data-id="${e(u.id)}">${ik('salj')}Säljtavla</button>
        <button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-uppgift" data-id="${e(u.id)}">${ik('plus')}Uppgift</button>
        ${!SKARP && u.id !== jag() ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-chatta" data-id="${e(u.id)}">${ik('prat')}Skriv</button>` : `<a class="knapp knapp-glas knapp-liten" href="#/profil/${e(u.id)}">${ik('anstallda')}Profil</a>`}
      </div>
    </article>`;
  }
  function uppmarksamhet(S, utan) {
    const rader = [];
    for (const p of db().anvandare.filter((x) => arAktiv(x) && x.id !== jag())) for (const f of (p.franvaro || []).filter((x) => fvStatus(x) === 'ansokt')) rader.push({ vikt: 6, u: p, ikon: FRANVARO[f.typ].ikon, ton: 'is', text: `<strong>${e(p.kort)}</strong> ansöker om ${e(FRANVARO[f.typ].namn.toLowerCase())} ${e(periodText(f))}`, under: e(f.notering || 'Väntar på ditt beslut'),
      knappar: `<button type="button" class="knapp knapp-accent knapp-liten" data-g="lp-fv-godkann" data-id="${e(p.id)}" data-fid="${e(f.id)}">Godkänn</button><button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-fv-neka" data-id="${e(p.id)}" data-fid="${e(f.id)}">Neka</button>` });
    for (const a of utan) rader.push({ vikt: 5, ikon: 'varning', ton: 'rod', text: `<strong>${e(a.titel)}</strong> saknar ansvarig säljare`, under: (kund(a.kundId) || {}).namn || '', knappar: `<button type="button" class="knapp knapp-accent knapp-liten" data-g="lp-fordela" data-affar="${e(a.id)}">Fördela</button>` });
    for (const x of S) {
      for (const a of x.stilla) rader.push({ vikt: 3 + Math.min(2, dagarSedan(a.stegAndrad || a.skapad) / 30), u: x.u, ikon: 'klocka', ton: 'gul', text: `<strong>${e(a.titel)}</strong> har stått i ${e((STEGNAMN[a.steg] || a.steg).toLowerCase())} i ${dagarSedan(a.stegAndrad || a.skapad)} dagar`, under: `${e(x.u.kort)} · ${e((kund(a.kundId) || {}).namn || '')} · ${e(krKort(affarVarde(a)))}`,
        knappar: `<button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-pamin" data-affar="${e(a.id)}">Påminn</button><button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-fordela" data-affar="${e(a.id)}">Fördela om</button><a class="knapp knapp-spok knapp-liten" href="#/affar/${e(a.id)}">Öppna</a>` });
      if (x.forfallna.length) rader.push({ vikt: 2.5, u: x.u, ikon: 'larm', ton: 'gul', text: `<strong>${e(x.u.kort)}</strong> har ${plural(x.forfallna.length, 'förfallen uppgift', 'förfallna uppgifter')}`, under: x.forfallna.slice(0, 2).map((t) => `”${e(t.text)}”`).join(' · '), knappar: `<a class="knapp knapp-glas knapp-liten" href="#/profil/${e(x.u.id)}">Se uppgifterna</a>` });
      if (x.u.senastAktiv && !doljTid(x.u) && dagarSedan(x.u.senastAktiv) >= 2 && !['semester', 'sjuk'].includes(narvaro(x.u).id)) rader.push({ vikt: 2, u: x.u, ikon: 'puls', ton: 'is', text: `<strong>${e(x.u.kort)}</strong> har inte varit aktiv i CRM:et på ${dagarSedan(x.u.senastAktiv)} dagar`, under: aktivText(x.u), knappar: `<a class="knapp knapp-glas knapp-liten" href="#/profil/${e(x.u.id)}">Profil</a>` });
      if (x.mal && x.malAndel != null && x.malAndel < 0.5) rader.push({ vikt: 1.5, u: x.u, ikon: 'mal', ton: 'is', text: `<strong>${e(x.u.kort)}</strong> ligger på ${e(pct(x.malAndel))} av kvartalsmålet`, under: `${e(krKort(x.vunnet90))} av ${e(krKort(x.malKvartal))} – ${e(krKort(x.viktat))} i viktad pipeline`, knappar: `<button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-salj-for" data-id="${e(x.u.id)}">Pipeline</button>` });
    }
    rader.sort((a, b) => b.vikt - a.vikt);
    if (!rader.length) return `<div class="lp-lugnt">${ik('skold')}<div><strong>Allt ser bra ut</strong><small>Inga stilla affärer, förfallna uppgifter eller affärer utan ansvarig.</small></div></div>`;
    const TYP = { varning: 'Saknar ansvarig', klocka: 'Affär står still', larm: 'Förfallna uppgifter', puls: 'Inte aktiv', mal: 'Kvartalsmål', flyg: 'Ledighet att godkänna', kaffe: 'Ledighet att godkänna', glodlampa: 'Ledighet att godkänna', termometer: 'Sjukanmälan' };
    return `<p class="lp-forklaring">Det viktigaste först: ledighet att godkänna, affärer utan ansvarig eller som står still, förfallna uppgifter, inaktivitet och mål under 50 %.</p><ul class="lp-upp">${rader.slice(0, 7).map((r) => `<li class="lp-upp-rad" data-ton="${r.ton}"><span class="lp-upp-ikon">${ik(r.ikon)}</span>${r.u ? avatarHtml(r.u, { storlek: 's' }) : ''}<span class="lp-upp-text"><small class="lp-upp-typ">${e(TYP[r.ikon] || 'Att göra')}</small><span>${r.text}</span><small>${r.under}</small></span><span class="lp-upp-knappar">${r.knappar}</span></li>`).join('')}</ul>${rader.length > 7 ? `<p class="lp-fler">+ ${rader.length - 7} till</p>` : ''}`;
  }
  // Pipeline per säljare: en rad per säljare med stapeln uppdelad på stegen (värdet står i delen när den är bred nog), antal
  // affärer, totalen och den viktade prognosen; under raderna teamets summa i fyra rutor och förklaringen
  function pipePerSaljare(S) {
    const max = Math.max(1, ...S.map((x) => x.pipeline));
    const tot = { varde: sum(S.map((x) => x.pipeline)), viktat: sum(S.map((x) => x.viktat)), antal: sum(S.map((x) => x.oppna.length)) };
    const legend = `<div class="lp-legend">${OPPNA.map((s) => `<span><i data-steg="${s}"></i>${e(STEGNAMN[s] || s)}</span>`).join('')}</div>`;
    return `<p class="lp-forklaring">Värdet av öppna affärer, uppdelat på säljsteget de står i. Längre stapel = mer i pipeline. <b>Viktat</b> = värdet × chansen att vinna.</p>
      <div class="lp-pipe">${S.map((x) => `<button type="button" class="lp-pipe-rad" data-g="lp-salj-for" data-id="${e(x.u.id)}" aria-label="${e(x.u.namn)}: ${e(kr(x.pipeline))} i pipeline – visa i säljtavlan">
        <span class="lp-pipe-vem">${avatarHtml(x.u, { storlek: 's' })}<span><strong>${e(x.u.kort)}</strong><small>${plural(x.oppna.length, 'öppen affär', 'öppna affärer')}</small></span></span>
        <span class="lp-pipe-spar"><span class="lp-pipe-fyll" style="--andel:${(x.pipeline / max).toFixed(3)}">${x.perSteg.filter((s) => s.varde > 0).map((s) => `<i data-steg="${e(s.id)}" style="flex:${s.varde}" title="${e(STEGNAMN[s.id])}: ${plural(s.antal, 'affär', 'affärer')} · ${e(kr(s.varde))}">${s.varde / max > 0.16 ? `<b>${e(krKort(s.varde))}</b>` : ''}</i>`).join('')}</span></span>
        <span class="lp-pipe-summa"><strong>${e(krKort(x.pipeline))}</strong><small>viktat ${e(krKort(x.viktat))}</small></span></button>`).join('')}</div>
      ${legend}
      <dl class="lp-pipe-tot">
        <div><dt>Teamets pipeline</dt><dd>${e(krKort(tot.varde))}</dd></div>
        <div><dt>Viktad prognos</dt><dd>${e(krKort(tot.viktat))}</dd></div>
        <div><dt>Öppna affärer</dt><dd>${tot.antal}</dd></div>
        <div><dt>Snittaffär</dt><dd>${tot.antal ? e(krKort(tot.varde / tot.antal)) : '–'}</dd></div>
      </dl>`;
  }
  // Aktivitet 14 dagar: en rad per person, en ruta per dag (veckodag och datum ovanför, helger dovare, idag markerad), antalet i
  // rutan, summan till höger och en skala Färre–Fler; under kartan de senaste händelserna med sin typ
  function aktivitetKarta() {
    const folk = db().anvandare.filter((u) => arAktiv(u) && u.roll !== 'admin');
    const dagar = Array.from({ length: 14 }, (_, i) => omDagar(i - 13));
    const per = (u, d) => db().aktiviteter.filter((x) => x.av === u.id && arbete(x) && String(x.tid).slice(0, 10) === d).length;
    const varden = folk.map((u) => dagar.map((d) => per(u, d))); const max = Math.max(1, ...varden.flat());
    const senaste = [...db().aktiviteter].filter((x) => arbete(x) && folk.some((u) => u.id === x.av)).sort((a, b) => (a.tid < b.tid ? 1 : -1)).slice(0, 3);
    const typ = (t) => KAL_TYP[t === 'mote' ? 'mote' : t === 'samtal' ? 'samtal' : 'aktivitet'];
    return `<p class="lp-forklaring">Händelser i tidslinjerna per person och dag – möten, samtal, mejl och anteckningar. Mörkare ruta = fler händelser.</p>
      <div class="lp-karta" data-summa style="--dagar:${dagar.length}" role="table" aria-label="Aktivitet per dag">
        <span class="lp-karta-hörn"></span>${dagar.map((d, i) => `<span class="lp-karta-dag${veckodag(d) >= 6 ? ' lp-karta-helg' : ''}${i === 13 ? ' lp-karta-nu' : ''}"><small>${e(VDAG[veckodag(d) - 1].slice(0, 2))}</small><b>${+d.slice(8)}</b></span>`).join('')}<span class="lp-karta-sumrubrik">Summa</span>
        ${folk.map((u, r) => `<a class="lp-karta-vem" href="#/profil/${e(u.id)}">${avatarHtml(u, { storlek: 's', narv: false })}<span>${e(u.kort)}</span></a>${varden[r].map((v, c) => `<i class="${veckodag(dagar[c]) >= 6 ? 'lp-karta-helg' : ''}${c === 13 ? ' lp-karta-nu' : ''}" style="--v:${(v / max).toFixed(3)}" title="${e(u.kort)} · ${e(datumText(dagar[c]))}: ${plural(v, 'händelse', 'händelser')}">${v || ''}</i>`).join('')}<strong class="lp-karta-sum">${sum(varden[r])}</strong>`).join('')}
      </div>
      <div class="lp-karta-skala" aria-hidden="true"><span>Färre</span>${[0.1, 0.35, 0.6, 0.85, 1].map((v) => `<i style="--v:${v}"></i>`).join('')}<span>Fler</span></div>
      <p class="lp-del">Senaste händelserna</p>
      <ul class="lp-om-senast">${senaste.map((x) => { const t = typ(x.typ); return `<li style="--k:${t.farg}"><span class="lp-om-sikon">${ik(t.ikon)}</span><span><strong>${e(anv(x.av).kort)}: ${e(String(x.text).slice(0, 90))}${String(x.text).length > 90 ? '…' : ''}</strong><small>${e(t.namn)} · ${e((kund(x.kundId) || {}).namn || '')}${x.kundId ? ' · ' : ''}${e(relTid(x.tid))}</small></span>${x.kundId ? `<a class="lk-h-lank" href="#/kund/${e(x.kundId)}" aria-label="Öppna kunden">${ik('pil')}</a>` : ''}</li>`; }).join('')}</ul>`;
  }
  function topplista(S) {
    const rad = [...S].sort((a, b) => b.vunnet90 - a.vunnet90); const max = Math.max(1, ...rad.map((x) => x.vunnet90));
    return `<div class="lp-topp" role="table" aria-label="Topplistan 90 dagar"><div class="lp-topp-rad lp-topp-huvud" role="row"><span role="columnheader">Säljare</span><span role="columnheader">Vunnet</span><span role="columnheader">Möten</span><span role="columnheader">Offerter</span><span role="columnheader">Vinstgrad</span></div>
      ${rad.map((x, i) => `<div class="lp-topp-rad" role="row"><span role="cell" class="lp-topp-vem"><b>${i + 1}</b>${avatarHtml(x.u, { storlek: 's', narv: false })}<a class="lp-topp-namn" href="#/profil/${e(x.u.id)}" title="Profilen för ${e(x.u.namn)}">${e(x.u.kort)}<span class="lp-stapel" style="--andel:${(x.vunnet90 / max).toFixed(3)}" aria-hidden="true"><i></i></span></a></span>
        <strong role="cell">${e(krKort(x.vunnet90))}</strong><span role="cell">${x.moten90}</span><span role="cell">${x.offerter90}</span><span role="cell">${x.vinstgrad == null ? '–' : e(pct(x.vinstgrad))}</span></div>`).join('')}</div>
      <p class="lp-not">Vunnet = signerade ordrar de senaste 90 dagarna. Möten = mötesanteckningar i tidslinjen. Offerter = skickade offerter.</p>`;
  }

  /* 06-profilsidan (#/profil och #/profil/<id>) ---------------------------------------------------------- */
  const kanAndra = (u) => u.id === jag() || kanLeda();
  function visaProfil(id) {
    const u = id ? db().anvandare.find((x) => x.id === id) : mig();
    if (!u) return lasHjalte('Profil', 'Kontot finns inte (längre).');
    const egen = u.id === jag(); const x = u.roll === 'salj' ? stat(u) : null;
    const akt = [...db().aktiviteter].filter((a) => a.av === u.id && arbete(a)).sort((a, b) => (a.tid < b.tid ? 1 : -1));
    const per30 = Array.from({ length: 30 }, (_, i) => akt.filter((a) => dagarSedan(a.tid) === 29 - i).length);
    const n = narvaro(u, !egen);
    const kontakt = [u.epost ? `<a class="lp-kontakt" href="mailto:${e(u.epost)}">${ik('mejl')}${e(u.epost)}</a>` : '', u.tel ? `<a class="lp-kontakt" href="tel:${e(String(u.tel).replace(/[^\d+]/g, ''))}">${ik('samtal')}${e(u.tel)}</a>` : ''].join('');
    // nyckeltalen efter roll – varje profil har en högersida (säljare: försäljningen, testteamet: projekten, admin: systemet)
    const tal = (() => {
      if (x) return [
        glasKort({ emo: 'portfolj', etikett: 'Pipeline', varde: x.pipeline, format: 'krkort', under: plural(x.oppna.length, 'öppen affär', 'öppna affärer') }),
        glasKort({ emo: 'mal', etikett: 'Viktad prognos', varde: x.viktat, format: 'krkort', under: 'värde × chans' }),
        glasKort({ emo: 'medalj', etikett: 'Vunnet 90 d', varde: x.vunnet90, format: 'krkort', under: x.mal ? `${pct(x.malAndel)} av ${krKort(x.malKvartal)}` : 'inget mål satt' }),
        glasKort({ emo: 'trend', etikett: 'Vinstgrad', text: x.vinstgrad == null ? '–' : pct(x.vinstgrad), under: 'vunna av avgjorda' }),
      ];
      if (u.roll === 'test') {
        const pr = db().projekt.filter((p) => p.ansvarigTest === u.id || !p.ansvarigTest);
        // Kommande = bokade tester som inte är registrerade (Test genomfört sätter testdatumet till idag) – som översikten och projekttavlan
        const pagar = pr.filter((p) => p.steg !== 'klar'); const kommande = pr.filter((p) => p.testdatum && p.testdatum >= idag() && foreTest(p));
        const klara = pr.filter((p) => ['avstamning', 'slutfaktura', 'uppfoljning', 'klar'].includes(p.steg));
        return [
          glasKort({ emo: 'projekt', etikett: 'Pågående projekt', varde: pagar.length, under: 'från underlag till uppföljning' }),
          glasKort({ emo: 'kalender', etikett: 'Kommande testdagar', varde: kommande.length, under: kommande[0] ? `nästa ${datumText(kommande.sort((a, b) => a.testdatum.localeCompare(b.testdatum))[0].testdatum, { gemen: true })}` : 'inga bokade' }),
          glasKort({ emo: 'stetoskop', etikett: 'Genomförda test', varde: klara.length, under: 'avstämda eller klara' }),
          glasKort({ emo: 'puls', etikett: 'Aktivitet 30 d', varde: sum(per30), under: 'händelser i tidslinjerna' }),
        ];
      }
      const aktiva = db().anvandare.filter(arAktiv); const S = db().sakerhet || {}; const h = (S.historik || [])[0];
      return [
        glasKort({ emo: 'anstallda', etikett: 'Konton', varde: aktiva.length, under: `${aktiva.filter(arAktivNu).length} ${aktiva.filter(arAktivNu).length === 1 ? 'aktiv' : 'aktiva'} nu` }),
        glasKort({ emo: 'skold', etikett: 'Säkerhetspoäng', text: h ? `${h.poang} / 100` : 'Ej skannat', under: h ? `skannat ${relTid(h.tid)}` : 'kör en skanning', href: '#/sakerhet' }),
        glasKort({ emo: 'databas', etikett: 'Poster', varde: ['kunder', 'affarer', 'projekt', 'aktiviteter', 'todos', 'dokument'].reduce((s2, k) => s2 + (db()[k] || []).length, 0), under: 'i CRM:et' }),
        glasKort({ emo: 'puls', etikett: 'Händelser 7 d', varde: db().aktiviteter.filter((a) => arbete(a) && Date.now() - Date.parse(a.tid) < 7 * 864e5).length, under: 'i hela teamet' }),
      ];
    })();
    const sedan = u.start ? `I teamet sedan ${new Date(u.start).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}` : '';
    const hjalte = `
      <section class="sidhjalte lp-profilhjalte" data-sidhjalte data-mork-yta style="--narv:${e(n.farg)}">
        <div class="lp-profil-vanster">
          <div class="lp-profil-id">
            <div class="lp-profil-bild" data-narvaro="${e(n.id)}"><span class="lp-profil-ring" aria-hidden="true"></span>${avatarHtml(u, { storlek: 'xl', narv: false })}<i class="lp-profil-prick" title="${e(n.namn)}" aria-hidden="true"></i>
              ${kanAndra(u) ? `<label class="lp-kamera" title="Byt profilbild">${ik('kamera')}<span class="sr">Byt profilbild för ${e(u.namn)}</span><input type="file" accept="image/*" data-lp-bild="${e(u.id)}" hidden></label>` : ''}</div>
            <div class="lp-profil-namn">
              <span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>${egen ? 'Din profil' : 'Profil'}</span>
              <h1>${e(u.namn)}</h1>
              <p class="lp-profil-titel">${e(u.titel || roller(u).join(' · '))}</p>
              <div class="lp-profil-rad">${rollChips(u)}${narvChip(u, !egen)}</div>
            </div>
          </div>
          <div class="lp-profil-info">
            <span class="lp-profil-fakta${arAktivNu(u) ? ' lp-aktiv-nu' : ''}">${ik('puls')}${e(aktivText(u))}</span>
            ${sedan ? `<span class="lp-profil-fakta">${ik('kalender')}${e(sedan)}</span>` : ''}
            ${kontakt}
          </div>
          <div class="lp-profil-knappar">
            ${egen ? `<button class="knapp knapp-accent" type="button" data-g="lp-status">${ik('puls')}Ändra status</button>` : ''}
            ${kanAndra(u) ? `<button class="knapp knapp-glas" type="button" data-g="lp-andra-profil" data-id="${e(u.id)}">${ik('redigera')}Ändra profil</button>` : ''}
            ${u.roll === 'salj' ? `<button class="knapp knapp-glas" type="button" data-g="lp-salj-for" data-id="${e(u.id)}">${ik('salj')}${egen ? 'Min säljtavla' : 'Säljtavla'}</button>` : ''}
            ${!egen && !SKARP && arAktiv(u) ? `<button class="knapp knapp-accent" type="button" data-g="lp-chatta" data-id="${e(u.id)}">${ik('prat')}Skicka meddelande</button><button class="knapp knapp-glas" type="button" data-g="lp-logga-in-som" data-id="${e(u.id)}">${ik('logga-ut')}Logga in som ${e(u.kort)}</button>` : ''}
          </div>
        </div>
        <div class="sidhjalte-tal" data-antal="4">${tal.join('')}</div>
      </section>`;
    const kalender = u.roll !== 'admin' ? `<section class="lp-band lp-kalband" data-mork-yta aria-labelledby="lp-h-kal"><header class="lp-band-huvud"><div><p class="lp-ogon">Kalender</p><h2 id="lp-h-kal">${egen ? 'Min <em>kalender</em>' : `${e(u.kort)}s <em>kalender</em>`}</h2><p class="lp-ingress">${egen ? 'Möten, uppgifter, testdagar och ledighet. Ansök om semester eller sjukanmäl dig här – försäljningschefen godkänner ledigheten.' : `Det ${e(u.kort)} har inbokat och har gjort, och ledigheten.${kanLeda() ? ' Ansökningar godkänns här eller under Försäljning.' : ''}`}</p></div></header>${kalenderHtml({ nyckel: `profil-${u.id}`, personer: [u], u })}</section>` : '';
    return `${hjalte}<div class="lp-tvakol">${omKortHtml(u, egen, akt)}${arbeteHtml(u, akt, per30)}</div>${kalender}`;
  }
  const lasHjalte = (titel, text) => `<section class="sidhjalte" data-sidhjalte data-mork-yta><div class="sidhjalte-text"><span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Ledning</span><h1>${e(titel)}</h1><p class="sidhjalte-ingress">${e(text)}</p><div class="sidhjalte-knappar"><a class="knapp knapp-accent" href="#/">Till översikten</a></div></div></section>`;

  /* 07-ark: status, profil, ny anställd, mål, uppgift, fördela -------------------------------------------- */
  const tillTid = (val) => { if (!val) return null; const d = new Date(); if (val === 'dag') { d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d.toISOString(); } return new Date(Date.now() + (+val) * 6e4).toISOString(); };
  /* Status Sjuk/Semester lägger in frånvaro för idag (demoläget – servern gör samma sak, statusFranvaro i api-konto.js): Sjuk gäller
     direkt, Semester är en ansökan som försäljningschefen godkänner (den som leder får den godkänd direkt, som när hen lägger in
     frånvaro). Byts statusen samma dag tas den automatiska raden bort – utom när någon annan redan har beslutat om den.
     Ger den nya raden (för besked till chefen och toasten), annars null. */
  function statusFranvaro(u, kod) {
    const d = idag();
    u.franvaro = (u.franvaro || []).filter((f) => !(f.auto && f.fran === d && f.till === d && f.typ !== kod && !(f.beslutAv && f.beslutAv !== u.id)));
    if (!['sjuk', 'semester'].includes(kod) || u.roll === 'admin' || franvaroPa(u, d)) return null; // systemkontot har ingen frånvaro
    const nu = new Date().toISOString(); const leda = kanLeda();
    const post = { id: nyId('fv'), typ: kod, fran: d, till: d, auto: true, skapad: nu, status: kod === 'sjuk' || leda ? 'godkand' : 'ansokt', ...(kod === 'semester' && leda ? { beslutAv: u.id, beslutTid: nu } : {}) };
    u.franvaro.push(post);
    if (post.status === 'ansokt') {
      for (const c of chefer()) chattTill(c.id, `Ansökan: semester idag (${kortDatum(d)}) – jag satte statusen Semester.`, { franvaro: { uid: u.id, fid: post.id } });
      logga(`${u.namn} ansökte om semester ${kortDatum(d)} (statusen Semester).`, { typ: 'franvaro' });
    }
    return post;
  }
  // Toasten efter statusbytet: säger till när statusen Semester blev en ansökan (båda lägena)
  const statusToast = (u, kod, ny) => {
    const ansokan = ny && ny.typ === 'semester' && fvStatus(ny) === 'ansokt';
    toast(ansokan ? `Din status: ${statusText(u, false)} – ansökan om semester idag är skickad till försäljningschefen` : `Din status: ${statusText(u, false)}`, null, ansokan ? 'skicka' : (NARV.find((x) => x.id === kod) || {}).ikon || 'bock');
  };
  // Skarpt läge: servern lägger in raden – den nya raden är den automatiska för idag som inte fanns före sparningen
  const nyAutoRad = (u, fore) => (u.franvaro || []).find((f) => f.auto && f.fran === idag() && !fore.has(f.id)) || null;
  function statusArk() {
    const u = mig(); const nu = narvaro(u, false); const st = u.status || {};
    oppnaArk(`${arkHuvud('Din status', 'Syns för teamet i sidomenyn, på din profil och i försäljningschefens översikt.', 'puls')}
      <form data-form="lp-status" class="ark-kropp">
        <div class="lp-statusval" role="radiogroup" aria-label="Status">${NARV.filter((x) => x.valbar !== false).map((x) => `<label class="lp-statuspill" style="--narv:${e(x.farg)}"><input type="radio" name="kod" value="${e(x.id)}" ${x.id === nu.id ? 'checked' : ''}><span class="lp-statusikon">${ik(x.ikon)}</span><span class="lp-statustext"><strong>${e(x.namn)}</strong><small>${e(x.under || '')}</small></span></label>`).join('')}</div>
        <div class="falt-rad"><label><span class="etikett">Meddelande (valfritt)</span><input class="falt" name="text" maxlength="60" autocomplete="off" placeholder="t.ex. Tillbaka 14:00" value="${e(st.text || '')}"></label>
        <label><span class="etikett">Tillbaka till Online</span><select class="falt" name="till"><option value="">Inte automatiskt</option><option value="30">Om 30 minuter</option><option value="60">Om en timme</option><option value="240">Om fyra timmar</option><option value="dag">Vid arbetsdagens slut</option></select></label></div>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara status</button></div>`);
  }
  // Profilbild: beskärs till en kvadrat och skalas till 320 px (JPEG) – sparas på kontot
  function lasBild(fil) {
    return new Promise((ok, fel) => {
      if (!fil || !/^image\//.test(fil.type)) { fel(new Error('Välj en bildfil (JPG, PNG eller WebP).')); return; }
      if (fil.size > 15 * 1024 * 1024) { fel(new Error('Bilden är för stor (högst 15 MB).')); return; }
      const url = URL.createObjectURL(fil); const img = new Image();
      img.onload = () => { const s = Math.min(img.naturalWidth, img.naturalHeight); const c = document.createElement('canvas'); c.width = c.height = 320; const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 320, 320); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.86)); };
      img.onerror = () => { URL.revokeObjectURL(url); fel(new Error('Bilden kunde inte läsas.')); };
      img.src = url;
    });
  }
  document.addEventListener('change', async (ev) => {
    const inp = ev.target.closest && ev.target.closest('input[type=file][data-lp-bild]'); if (!inp || !inp.files || !inp.files[0]) return;
    const u = db().anvandare.find((x) => x.id === inp.dataset.lpBild); if (!u || !kanAndra(u)) return;
    try {
      const data = await lasBild(inp.files[0]);
      if (inp.closest('[data-lp-bildfalt]')) { const f = inp.closest('form'); f.elements.bild.value = data; const p = $('[data-lp-forhand]', f); if (p) p.innerHTML = `<img src="${e(data)}" alt="">`; return; }
      if (SKARP) { if (!(await sparaKonto(() => L.konto.andra(u.id, { bild: data }), 'Profilbilden kunde inte sparas.'))) { inp.value = ''; return; } } else { u.bild = data; spara(); }
      ritaSido(); rendera(); toast(u.id === jag() ? 'Din profilbild är uppdaterad' : `Profilbilden för ${u.kort} är uppdaterad`, null, 'kamera');
    } catch (err) { toast(err.message, null, 'varning'); }
    inp.value = '';
  });
  // Målarket: beloppet bredvid fältet skrivs ut med tusentalsavgränsare medan man skriver (300 000 kr – inte "30000" bakom −/+).
  // Frånvaroarket: Till och med följer Från – min är alltid Från, och hamnar Till före Från flyttas den med (input + change, så
  // att datumväljaren i assets/kalender.js visar samma dag).
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!t || !t.closest) return;
    if (t.matches('form[data-form="lp-mal"] input[name^="mal-"]')) {
      const b = $('[data-lp-malkr]', t.closest('.lp-malrad') || t.form); if (b) b.textContent = kr(Math.max(0, Math.round(+t.value || 0)));
    }
  });
  const synkaTill = (ev) => {
    const fran = ev.target; if (!fran || !fran.matches || !fran.matches('form[data-form="lp-franvaro"] [name="fran"]')) return;
    const till = fran.form && fran.form.elements.till; if (!till) return;
    const giltig = /^\d{4}-\d{2}-\d{2}$/.test(fran.value);
    till.min = giltig ? fran.value : (till.dataset.min || '');
    if (giltig && (!till.value || till.value < fran.value)) {
      till.value = fran.value;
      till.dispatchEvent(new Event('input', { bubbles: true })); till.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  document.addEventListener('input', synkaTill);
  document.addEventListener('change', synkaTill);
  // fokus: fältet som får fokus när arket öppnas ("Berätta om dig" → presentationen, markören sist)
  function profilArk(u, { fokus = '' } = {}) {
    const leda = kanLeda(); const adm = arAdm(mig());
    // Skarpt läge: namnet ändras av en administratör, e-posten är inloggningen och rollerna ägs av servern (#/anvandare)
    const namnLast = SKARP && !adm;
    oppnaArk(`${arkHuvud(u.id === jag() ? 'Ändra din profil' : `Ändra ${u.namn}`, 'Namn, titel, kontaktuppgifter, bild och presentation.', 'redigera')}
      <form data-form="lp-profil" data-id="${e(u.id)}" class="ark-kropp" novalidate>
        <div class="lp-bildfalt" data-lp-bildfalt><span class="lp-forhand" data-lp-forhand>${u.bild ? `<img src="${e(u.bild)}" alt="">` : `<span>${e(u.initialer)}</span>`}</span>
          <div><label class="knapp knapp-kontur knapp-liten">${ik('kamera')}Välj bild<input type="file" accept="image/*" data-lp-bild="${e(u.id)}" hidden></label>
          ${u.bild ? `<button type="button" class="knapp knapp-spok knapp-liten" data-g="lp-ta-bort-bild">Ta bort bilden</button>` : ''}<p class="falt-hint">Beskärs till en kvadrat, 320 × 320 px.</p></div>
          <input type="hidden" name="bild" value="${e(u.bild || '')}"></div>
        <div class="falt-rad"><label><span class="etikett">Namn<span class="krav">*</span></span><input class="falt" name="namn" value="${e(u.namn)}" required autocomplete="off" data-fel="Skriv namnet"${namnLast ? ' readonly aria-describedby="lp-namn-hint"' : ''}>${namnLast ? '<span class="falt-hint" id="lp-namn-hint">Namnet ändras av en administratör.</span>' : ''}</label>
          <label><span class="etikett">Titel</span><input class="falt" name="titel" value="${e(u.titel || '')}" maxlength="80" autocomplete="off" placeholder="t.ex. Säljare"></label></div>
        <div class="falt-rad">${SKARP ? '' : `<label><span class="etikett">E-post</span><input class="falt" type="email" name="epost" value="${e(u.epost || '')}" autocomplete="off"></label>`}
          <label><span class="etikett">Telefon</span><input class="falt" type="tel" name="tel" value="${e(u.tel || '')}" maxlength="40" inputmode="tel" autocomplete="off"></label></div>
        <label><span class="etikett">Om ${u.id === jag() ? 'dig' : u.kort}</span><textarea class="falt" name="om" rows="3" maxlength="400" placeholder="Vad du jobbar med och hur man når dig bäst">${e(u.om || '')}</textarea></label>
        ${SKARP && adm ? '<p class="falt-hint">Roller, försäljningschef och e-postadressen (inloggningen) ändras under <a href="#/anvandare">Användare</a>.</p>' : ''}
        ${leda && u.roll !== 'admin' && !SKARP ? `<fieldset class="lp-rollval"><legend class="etikett">Roller</legend>
          <label class="kryss"><input type="radio" name="roll" value="salj" ${u.roll === 'salj' ? 'checked' : ''}><span>Sälj</span></label>
          <label class="kryss"><input type="radio" name="roll" value="test" ${u.roll === 'test' ? 'checked' : ''}><span>Testteam</span></label>
          <label class="kryss"><input type="checkbox" name="chef" ${u.chef ? 'checked' : ''}><span>Försäljningschef</span></label>
          ${adm ? `<label class="kryss"><input type="checkbox" name="admin" ${u.admin ? 'checked' : ''}><span>Admin</span></label>` : ''}</fieldset>` : ''}
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara</button></div>`);
    const falt = fokus && $(`[data-ark] form[data-form="lp-profil"] [name="${sel(fokus)}"]`);
    if (falt) { falt.focus({ preventScroll: false }); if (typeof falt.setSelectionRange === 'function') falt.setSelectionRange(falt.value.length, falt.value.length); }
  }
  function nyAnstalldArk() {
    if (!kanLeda()) { toast('Bara försäljningschefen eller en administratör lägger till konton.', null, 'las'); return; }
    if (SKARP) { if (arAdm(mig())) toast('I den skarpa versionen bjuds nya konton in under Användare.', { href: '#/anvandare', text: 'Användare' }, 'anvandare-plus'); else toast('Nya konton bjuds in av en administratör.', null, 'anvandare-plus'); return; }
    const adm = arAdm(mig());
    oppnaArk(`${arkHuvud('Lägg till anställd', 'Kontot syns direkt i teamet och kan logga in i demon.', 'anvandare-plus')}
      <form data-form="lp-ny-anstalld" class="ark-kropp" novalidate>
        <div class="lp-bildfalt" data-lp-bildfalt><span class="lp-forhand" data-lp-forhand><span>${ik('kamera')}</span></span>
          <div><label class="knapp knapp-kontur knapp-liten">${ik('kamera')}Välj profilbild<input type="file" accept="image/*" data-lp-bild="ny" hidden></label><p class="falt-hint">Valfritt – kan läggas till senare.</p></div>
          <input type="hidden" name="bild" value=""></div>
        <div class="falt-rad"><label><span class="etikett">Namn<span class="krav">*</span></span><input class="falt" name="namn" required autocomplete="off" data-fel="Skriv namnet" placeholder="Förnamn Efternamn"></label>
          <label><span class="etikett">Titel</span><input class="falt" name="titel" autocomplete="off" placeholder="t.ex. Säljare"></label></div>
        <div class="falt-rad"><label><span class="etikett">E-post<span class="krav">*</span></span><input class="falt" type="email" name="epost" required autocomplete="off" data-fel="Skriv en giltig e-postadress" placeholder="namn@foretag.se"></label>
          <label><span class="etikett">Telefon</span><input class="falt" type="tel" name="tel" inputmode="tel" autocomplete="off" placeholder="070-123 45 67"></label></div>
        <fieldset class="lp-rollval"><legend class="etikett">Roll</legend>
          <label class="kryss"><input type="radio" name="roll" value="salj" checked><span>Sälj</span></label>
          <label class="kryss"><input type="radio" name="roll" value="test"><span>Testteam</span></label>
          <label class="kryss"><input type="checkbox" name="chef"><span>Försäljningschef</span></label>
          ${adm ? '<label class="kryss"><input type="checkbox" name="admin"><span>Admin</span></label>' : ''}</fieldset>
        <div class="falt-rad"><label><span class="etikett">Månadsmål (säljare)</span><input class="falt" type="number" name="mal" min="0" step="10000" placeholder="t.ex. 200000"></label>
          <label><span class="etikett">Börjar</span><input class="falt" type="date" name="start" value="${e(idag())}"></label></div>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('anvandare-plus')}Lägg till</button></div>`);
  }
  function malArk(id) {
    if (!kanLeda()) return;
    const lista = id ? [anv(id)] : saljare();
    oppnaArk(`${arkHuvud(id ? `Mål för ${anv(id).namn}` : 'Sätt mål', 'Månadsmål i kronor (ordervärde). Kvartalsmålet är tre månader.', 'mal')}
      <form data-form="lp-mal" class="ark-kropp">${lista.map((u) => `<label class="lp-malrad">${avatarHtml(u, { storlek: 's', narv: false })}<span class="lp-malnamn">${e(u.namn)}<small>${e(u.titel || '')}</small></span><input class="falt" type="number" min="0" step="10000" name="mal-${e(u.id)}" value="${e(u.mal || '')}" placeholder="0" aria-label="Månadsmål för ${e(u.namn)}"><span class="lp-malkr"><b data-lp-malkr>${e(kr(+u.mal || 0))}</b>per månad</span></label>`).join('')}</form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara mål</button></div>`);
  }
  function uppgiftArk(id) {
    const u = anv(id); const af = db().affarer.filter((a) => a.ansvarig === id && OPPNA.includes(a.steg));
    oppnaArk(`${arkHuvud(`Uppgift till ${u.namn}`, 'Hamnar i säljarens Att göra.', 'todo')}
      <form data-form="lp-uppgift" data-id="${e(id)}" class="ark-kropp" novalidate>
        <label><span class="etikett">Vad ska göras?<span class="krav">*</span></span><input class="falt" name="text" required autocomplete="off" data-fel="Skriv uppgiften" placeholder="t.ex. Ring Peter om offerten"></label>
        <div class="falt-rad"><label><span class="etikett">Affär (valfritt)</span><select class="falt" name="affarId"><option value="">Ingen</option>${af.map((a) => `<option value="${e(a.id)}">${e(a.titel)} · ${e((kund(a.kundId) || {}).namn || '')}</option>`).join('')}</select></label>
        <label><span class="etikett">När</span><input class="falt" type="date" name="datum" value="${e(idag())}" min="${e(omDagar(-1))}" max="${e(omDagar(365))}"></label></div>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('plus')}Lägg till</button></div>`);
  }
  function fordelaArk(affarId) {
    const a = db().affarer.find((x) => x.id === affarId); if (!a) return;
    oppnaArk(`${arkHuvud('Fördela affären', `${a.titel} · ${(kund(a.kundId) || {}).namn || ''}`, 'flytta')}
      <form data-form="lp-fordela" data-affar="${e(a.id)}" class="ark-kropp">
        <div class="lp-fordelning" role="radiogroup" aria-label="Ansvarig säljare">${saljare().map((u) => { const x = stat(u); return `<label class="lp-fordel">${'<input type="radio" name="ansvarig" value="' + e(u.id) + '"' + (a.ansvarig === u.id ? ' checked' : '') + '>'}${avatarHtml(u, { storlek: 'm' })}<span><strong>${e(u.namn)}</strong><small>${e(statusText(u))} · ${plural(x.oppna.length, 'öppen affär', 'öppna affärer')} · ${e(krKort(x.pipeline))}</small></span></label>`; }).join('')}</div>
        <label class="kryss"><input type="checkbox" name="pamin" checked><span>Lägg en uppgift hos den nya säljaren</span></label>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Fördela</button></div>`);
  }
  // Rapporten: teamet som CSV (inga personuppgifter utöver säljarnas namn)
  function rapport() {
    const cell = (v) => { const s = String(v ?? ''); const t = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rader = [['Säljare', 'Status', 'Senast aktiv', 'Öppna affärer', 'Pipeline (kr)', 'Viktad prognos (kr)', 'Vunnet 90 d (kr)', 'Kvartalsmål (kr)', 'Andel av mål', 'Vinstgrad', 'Stilla affärer', 'Förfallna uppgifter', 'Aktiviteter 7 d']];
    for (const x of saljare().map(stat)) rader.push([x.u.namn, statusText(x.u), x.u.senastAktiv && !doljTid(x.u) ? new Date(x.u.senastAktiv).toLocaleString('sv-SE') : '', x.oppna.length, Math.round(x.pipeline), Math.round(x.viktat), Math.round(x.vunnet90), x.malKvartal || '', x.malAndel == null ? '' : pct(x.malAndel), x.vinstgrad == null ? '' : pct(x.vinstgrad), x.stilla.length, x.forfallna.length, x.akt7]);
    const blob = new Blob(['﻿' + rader.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Uperformance-team-${idag()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Teamrapporten är nedladdad (CSV)', null, 'ladda-ner');
  }

  /* 07b-närvaro och schema (#/chef) ------------------------------------------------------------------------------
     Arbetsdagar per vecka (u.arbetsdagar, 1 = måndag … 7 = söndag, standard mån–fre), frånvaro (u.franvaro: semester, sjuk, ledig,
     utbildning) och dagar personen har jobbat = dagar med inloggning (u.dagar, sätts av markeraAktiv) eller händelser i tidslinjerna.
     Fyra veckor åt gången: två bakåt, den här och nästa – pilarna flyttar en vecka. Klick på en dag lägger in eller ändrar frånvaro. */
  const FRANVARO = { semester: { namn: 'Semester', farg: '#4fb3ff', ikon: 'flyg' }, sjuk: { namn: 'Sjuk', farg: '#e07a9a', ikon: 'termometer' }, ledig: { namn: 'Ledig', farg: '#a3adbb', ikon: 'kaffe' }, utbildning: { namn: 'Utbildning', farg: '#a98bff', ikon: 'glodlampa' } };
  const VDAG = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
  const arbetsdagar = (u) => (Array.isArray(u.arbetsdagar) ? u.arbetsdagar : [1, 2, 3, 4, 5]);
  const veckodag = (iso) => ((new Date(`${iso}T12:00:00`).getDay() + 6) % 7) + 1;
  const isoDag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const veckaNr = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const v1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - v1) / 864e5 - 3 + ((v1.getDay() + 6) % 7)) / 7); };
  const franvaroPa = (u, iso) => (u.franvaro || []).find((f) => fvStatus(f) !== 'nekad' && f.fran <= iso && iso <= (f.till || f.fran));
  const jobbadeDagar = (u) => { const s = new Set(u.dagar || []); for (const a of db().aktiviteter) if (a.av === u.id && a.tid && arbete(a)) s.add(String(a.tid).slice(0, 10)); return s; };
  const schemaText = (u) => { const d = arbetsdagar(u).slice().sort((a, b) => a - b); if (!d.length) return 'Inga arbetsdagar'; return d.length > 2 && d.every((x, i) => !i || x === d[i - 1] + 1) ? `${VDAG[d[0] - 1]}–${VDAG[d[d.length - 1] - 1].toLowerCase()}` : d.map((x, i) => (i ? VDAG[x - 1].toLowerCase() : VDAG[x - 1])).join(', '); };
  const kortDatum = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
  const periodText = (f) => (!f.till || f.till === f.fran ? kortDatum(f.fran) : `${kortDatum(f.fran)}–${kortDatum(f.till)}`);
  const narvUi = { skift: 0 };
  function narvaroBand() {
    const folk = db().anvandare.filter((u) => arAktiv(u) && u.roll !== 'admin');
    const idagS = idag(); const nu = new Date(`${idagS}T12:00:00`);
    const start = new Date(nu); start.setDate(nu.getDate() - ((nu.getDay() + 6) % 7) - 14 + narvUi.skift * 7);
    const dagar = Array.from({ length: 28 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return isoDag(d); });
    const rad = (u) => {
      const jobbat = jobbadeDagar(u); const plan = arbetsdagar(u); let jobbN = 0, planN = 0, franN = 0;
      const celler = dagar.map((iso) => {
        const vd = veckodag(iso); const fr = franvaroPa(u, iso); const planerad = plan.includes(vd); const ar = iso === idagS;
        let lage, titel;
        if (fr) { lage = 'franvaro'; titel = `${FRANVARO[fr.typ].namn}${fvStatus(fr) === 'ansokt' ? ' (ansökt – väntar på godkännande)' : ''}${fr.notering ? ` – ${fr.notering}` : ''}`; if (planerad && fvStatus(fr) === 'godkand') franN++; }
        else if (iso > idagS) { lage = planerad ? 'plan' : 'fri'; titel = planerad ? 'Planerad arbetsdag' : 'Ledig enligt schemat'; }
        else if (jobbat.has(iso)) { lage = planerad ? 'jobbat' : 'extra'; titel = planerad ? 'Jobbade – inloggad eller aktiv i CRM:et' : 'Jobbade en dag utanför schemat'; }
        else { lage = planerad ? (ar ? 'idag' : 'tom') : 'fri'; titel = planerad ? (ar ? 'Idag – inte inloggad ännu' : 'Ingen inloggning eller aktivitet registrerad') : 'Ledig enligt schemat'; }
        if (planerad && !fr && iso <= idagS) { planN++; if (jobbat.has(iso)) jobbN++; }
        const text = `${u.kort} · ${VDAG[vd - 1].toLowerCase()} ${kortDatum(iso)}: ${titel}`;
        return `<button type="button" class="lp-dag" role="gridcell" data-lage="${lage}"${fr ? ` data-typ="${e(fr.typ)}" data-franvaro="${e(fr.id)}" style="--f:${FRANVARO[fr.typ].farg}"` : ''}${ar ? ' data-idag' : ''}${vd >= 6 ? ' data-helg' : ''} ${fr && fvStatus(fr) === 'ansokt' ? ' data-ansokt' : ''} data-g="lp-dag" data-id="${e(u.id)}" data-dag="${iso}" title="${e(text)}" aria-label="${e(text)}">${fr ? ik(FRANVARO[fr.typ].ikon) : lage === 'jobbat' || lage === 'extra' ? '<i></i>' : ''}</button>`;
      }).join('');
      const andel = planN ? jobbN / planN : null;
      return `<div class="lp-schema-rad" role="row"><button type="button" class="lp-schema-vem" data-g="lp-schema" data-id="${e(u.id)}" title="Schema och frånvaro för ${e(u.namn)}">${avatarHtml(u, { storlek: 's' })}<span><strong>${e(u.kort)}</strong><small>${e(schemaText(u))}</small></span></button>${celler}
        <span class="lp-schema-sum" role="gridcell" title="Jobbade arbetsdagar till och med idag (utan frånvaro)">${planN ? `<b>${jobbN}<small>/${planN}</small></b><i style="--andel:${andel.toFixed(3)}" aria-hidden="true"></i>` : '<b>–</b>'}${franN ? `<em>${plural(franN, 'dag frånvaro', 'dagar frånvaro')}</em>` : ''}</span></div>`;
    };
    const veckor = [0, 7, 14, 21].map((i) => `<span class="lp-schema-v${dagar.slice(i, i + 7).includes(idagS) ? ' lp-schema-v-nu' : ''}">V ${veckaNr(dagar[i])}<small>${kortDatum(dagar[i])}–${kortDatum(dagar[i + 6])}</small></span>`).join('');
    const dagRad = dagar.map((iso) => `<span class="lp-schema-d${iso === idagS ? ' lp-schema-d-nu' : ''}${veckodag(iso) >= 6 ? ' lp-schema-d-helg' : ''}">${VDAG[veckodag(iso) - 1][0]}<b>${+iso.slice(8)}</b></span>`).join('');
    const borta = folk.map((u) => ({ u, f: franvaroPa(u, idagS) })).filter((x) => x.f);
    // Kommande frånvaro: nekade ansökningar står inte med, väntande är märkta "ansökt" (randiga, som i kalendern)
    const kommande = folk.flatMap((u) => (u.franvaro || []).filter((f) => fvStatus(f) !== 'nekad' && f.fran > idagS && f.fran <= omDagar(30)).map((f) => ({ u, f }))).sort((a, b) => a.f.fran.localeCompare(b.f.fran));
    const chipAnsokt = (f) => (fvStatus(f) === 'ansokt' ? ' lp-franvaro-ansokt' : '');
    const chipTitel = (x) => `${x.u.namn}: ${FRANVARO[x.f.typ].namn.toLowerCase()} ${periodText(x.f)}${fvStatus(x.f) === 'ansokt' ? ' – ansökt, väntar på beslut' : ''}`;
    const legend = [['jobbat', 'Jobbade'], ['plan', 'Planerad'], ['tom', 'Ingen aktivitet'], ...Object.entries(FRANVARO).map(([k, v]) => [`franvaro-${k}`, v.namn, v.farg])];
    return `<section class="lp-band lp-narvband" data-mork-yta aria-labelledby="lp-h-narv">
      <header class="lp-band-huvud"><div><p class="lp-ogon">02 · Närvaro</p><h2 id="lp-h-narv">Vem jobbar <em>när</em></h2><p class="lp-ingress">Arbetsdagar enligt schemat, dagar med inloggning eller aktivitet i CRM:et och frånvaro – klicka på en dag för att lägga in frånvaro.</p></div>
        <div class="lp-narv-verktyg"><div class="lp-narv-bladdra" role="group" aria-label="Byt veckor"><button type="button" class="lp-narv-pil" data-g="lp-narv-skift" data-steg="-1" aria-label="En vecka bakåt">${ik('pil-v')}</button><button type="button" class="lp-filter" data-g="lp-narv-skift" data-steg="0" aria-pressed="${narvUi.skift === 0}">Idag</button><button type="button" class="lp-narv-pil" data-g="lp-narv-skift" data-steg="1" aria-label="En vecka framåt">${ik('pil')}</button></div>
          <button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-franvaro">${ik('plus')}Frånvaro</button></div></header>
      <div class="lp-narv-lage">${borta.length ? borta.map((x) => `<span class="lp-franvaro-chip${chipAnsokt(x.f)}" style="--f:${FRANVARO[x.f.typ].farg}" title="${e(chipTitel(x))}">${ik(FRANVARO[x.f.typ].ikon)}${e(x.u.kort)} · ${e(FRANVARO[x.f.typ].namn.toLowerCase())} idag${fvStatus(x.f) === 'ansokt' ? ' · ansökt' : ''}</span>`).join('') : `<span class="lp-franvaro-chip lp-franvaro-alla">${ik('bock')}Alla i tjänst idag</span>`}
        ${kommande.slice(0, 3).map((x) => `<span class="lp-franvaro-chip lp-franvaro-kommande${chipAnsokt(x.f)}" style="--f:${FRANVARO[x.f.typ].farg}" title="${e(chipTitel(x))}">${ik('kalender')}${e(x.u.kort)} · ${e(FRANVARO[x.f.typ].namn.toLowerCase())} ${e(periodText(x.f))}${fvStatus(x.f) === 'ansokt' ? ' · ansökt' : ''}</span>`).join('')}</div>
      <div class="lp-schema-ram"><div class="lp-schema" role="grid" aria-label="Närvaro fyra veckor">
        <div class="lp-schema-rad lp-schema-huvud" role="row"><span></span>${veckor}<span class="lp-schema-sumrubrik">Jobbat</span></div>
        <div class="lp-schema-rad lp-schema-dagar" role="row"><span></span>${dagRad}<span></span></div>
        ${folk.map(rad).join('')}</div></div>
      <div class="lp-schema-legend">${legend.map(([k, t, f]) => `<span><i data-lage="${k.startsWith('franvaro') ? 'franvaro' : k}"${f ? ` style="--f:${f}"` : ''}></i>${e(t)}</span>`).join('')}</div>
    </section>`;
  }
  function schemaArk(id) {
    const u = db().anvandare.find((x) => x.id === id); if (!u || !kanLeda()) return;
    const fv = (u.franvaro || []).filter((f) => (f.till || f.fran) >= omDagar(-60)).sort((a, b) => b.fran.localeCompare(a.fran));
    oppnaArk(`${arkHuvud(`Schema för ${u.namn}`, 'Arbetsdagarna och frånvaron syns i närvaron i försäljningsledningen och på profilen.', 'kalender')}
      <form data-form="lp-schema" data-id="${e(u.id)}" class="ark-kropp">
        <fieldset class="lp-veckodagar"><legend class="etikett">Arbetsdagar</legend>${VDAG.map((d, i) => `<label class="lp-veckodag"><input type="checkbox" name="dag" value="${i + 1}" ${arbetsdagar(u).includes(i + 1) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</fieldset>
        <div class="lp-fv-huvud"><span class="etikett">Frånvaro</span><button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-franvaro" data-id="${e(u.id)}">${ik('plus')}Lägg till</button></div>
        ${fv.length ? `<ul class="lp-fv-lista">${fv.map((f) => `<li style="--f:${FRANVARO[f.typ].farg}"><span class="lp-fv-ikon">${ik(FRANVARO[f.typ].ikon)}</span><span><strong>${e(FRANVARO[f.typ].namn)} · ${e(periodText(f))}</strong><small>${e(f.notering || (f.auto ? 'Från statusen' : '–'))}</small></span><button type="button" class="knapp knapp-spok knapp-liten" data-g="lp-franvaro" data-id="${e(u.id)}" data-fid="${e(f.id)}">Ändra</button></li>`).join('')}</ul>` : '<p class="lp-tom">Ingen frånvaro inlagd.</p>'}
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('bock')}Spara schemat</button></div>`);
  }
  /* 07c-kalendern och ledigheten -------------------------------------------------------------------------------------
     En kalender per person (profilen) och en för teamet (försäljningsledningen) med samma underlag: möten, samtal och andra
     händelser i tidslinjerna, uppgifter (Att göra), testdagar och uppföljningar, frånvaro och dagar man jobbat. Lägen: månad
     och år, en vald dag visas bredvid. Ledighet: var och en lägger in sin egen – sjukdom gäller direkt (anmälan), semester,
     ledigt och utbildning är en ansökan (status ansokt) som försäljningschefen eller en administratör godkänner eller nekar.
     Ansökan och beslutet skickas som chattmeddelanden (privat samtal), så att den andra får plinget. */
  const KAL_TYP = {
    mote: { namn: 'Möte', farg: '#b49cff', ikon: 'mote' }, samtal: { namn: 'Samtal', farg: '#4fb3ff', ikon: 'samtal' },
    aktivitet: { namn: 'Aktivitet', farg: '#7ee0c3', ikon: 'puls' }, uppgift: { namn: 'Uppgift', farg: '#ffc857', ikon: 'todo' },
    testdag: { namn: 'Testdag', farg: '#ff9ecb', ikon: 'stetoskop' }, uppfoljning: { namn: 'Uppföljning', farg: '#5fd4e8', ikon: 'omtest' },
  };
  const fvStatus = (f) => f.status || 'godkand';
  const FV_STATUS = { ansokt: 'Väntar på godkännande', godkand: 'Godkänd', nekad: 'Nekad' };
  /* Vad andra ser av frånvaron (2026-10-24, samma regel som servern – kontoForTittare i server/api-konto.js): typ, beslut, skäl och
     anteckning ser bara personen själv och den som leder. Kollegor ser "Frånvarande" med perioden – aldrig sjukfrånvaro (en
     hälsouppgift, GDPR art. 9) eller nekade ansökningar. */
  const FRANVARANDE = { namn: 'Frånvarande', farg: '#a3adbb', ikon: 'kalender' };
  const serFranvaro = (p) => !!p && (p.id === jag() || kanLeda());
  const synligFranvaro = (p) => (p.franvaro || []).filter((f) => serFranvaro(p) || (f.typ !== 'sjuk' && fvStatus(f) !== 'nekad'));
  const fvTyp = (p, f) => (serFranvaro(p) && FRANVARO[f.typ]) || FRANVARANDE;
  // Statusen i klartext, med vem som beslutade och när (Mina ansökningar, dagens lista, kortet i chatten)
  const fvLage = (p, f) => {
    const s = fvStatus(f);
    if (s === 'ansokt') return FV_STATUS.ansokt;
    if (f.typ === 'sjuk' && s === 'godkand' && (!f.beslutAv || f.beslutAv === p.id)) return 'Sjukanmäld';
    return `${FV_STATUS[s]}${f.beslutAv && f.beslutAv !== p.id ? ` av ${anv(f.beslutAv).kort}` : ''}${f.beslutTid && f.beslutAv && f.beslutAv !== p.id ? ` · ${relTid(f.beslutTid)}` : ''}`;
  };
  const lokalDag = (iso) => isoDag(new Date(iso));
  const MANAD = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Testet är inte registrerat än (steg underlag, bokning eller test) – efter Test genomfört är testdagen genomförd
  const foreTest = (p) => ['underlag', 'bokning', 'test'].includes(p.steg);
  function kalHandelser(personer, fran, till) {
    const ids = new Set(personer.map((u) => u.id)); const ut = [];
    for (const a of db().aktiviteter) {
      if (!ids.has(a.av) || !a.tid || !arbete(a)) continue; const d = lokalDag(a.tid); if (d < fran || d > till) continue;
      ut.push({ dag: d, tid: a.tid, typ: a.typ === 'mote' ? 'mote' : a.typ === 'samtal' ? 'samtal' : 'aktivitet', vem: a.av, text: a.text, kundId: a.kundId, lank: a.kundId ? `#/kund/${a.kundId}` : '' });
    }
    for (const t of db().todos) {
      if (!ids.has(t.ansvarig) || !t.datum || t.datum < fran || t.datum > till) continue;
      ut.push({ dag: t.datum, typ: /möte|besök|träff|presentation/i.test(t.text) ? 'mote' : 'uppgift', planerad: !t.klar, klar: !!t.klar, vem: t.ansvarig, text: t.text, kundId: t.kundId, lank: '#/att-gora' });
    }
    for (const p of db().projekt) {
      const a = db().affarer.find((x) => x.id === p.affarId); const vem = [p.ansvarigTest, a && a.ansvarig].find((x) => ids.has(x)); if (!vem) continue;
      const k = kund(p.kundId);
      // Testdagen: planerad tills testet är registrerat, sedan klar (genomförd) – med klockslaget när det är bokat
      const tt = p.testtid && p.testtid.start ? (p.testtid.slut ? `${p.testtid.start}–${p.testtid.slut}` : `från ${p.testtid.start}`) : '';
      if (p.testdatum && p.testdatum >= fran && p.testdatum <= till) ut.push({ dag: p.testdatum, typ: 'testdag', planerad: foreTest(p) && p.testdatum >= idag(), klar: !foreTest(p), vem, text: `Testdag${k ? ` hos ${k.namn}` : ''}${tt ? ` · ${tt}` : ''}`, kundId: p.kundId, lank: `#/projekt/${p.id}` });
      if (p.uppfoljningDatum && p.uppfoljningDatum >= fran && p.uppfoljningDatum <= till) ut.push({ dag: p.uppfoljningDatum, typ: 'uppfoljning', planerad: p.uppfoljningDatum >= idag(), vem, text: `Uppföljning${k ? ` med ${k.namn}` : ''}`, kundId: p.kundId, lank: `#/projekt/${p.id}` });
    }
    return ut.sort((a, b) => (`${a.dag}${a.tid || 'T99'}` < `${b.dag}${b.tid || 'T99'}` ? -1 : 1));
  }
  // Frånvaron en dag – det tittaren får se (synligFranvaro); nekade bara i den egna kalendern (överstrukna)
  const franvaroIn = (personer, iso, { nekade = false } = {}) => personer.flatMap((u) => synligFranvaro(u).filter((f) => (nekade || fvStatus(f) !== 'nekad') && f.fran <= iso && iso <= (f.till || f.fran)).map((f) => ({ u, f })));
  // Godkända frånvarodagar på arbetsdagar inom perioden
  const franvaroDagar = (personer, fran, till) => { let n = 0; for (const u of personer) for (const f of synligFranvaro(u)) { if (fvStatus(f) !== 'godkand') continue; const d = new Date(`${f.fran > fran ? f.fran : fran}T12:00:00`); const slut = (f.till || f.fran) < till ? f.till || f.fran : till; for (; isoDag(d) <= slut; d.setDate(d.getDate() + 1)) if (arbetsdagar(u).includes(veckodag(isoDag(d)))) n++; } return n; };
  const kalUi = {};
  const kalLage = (nyckel) => (kalUi[nyckel] = kalUi[nyckel] || { manad: idag().slice(0, 7), lage: 'manad', dag: idag(), vem: 'alla' });
  function kalenderHtml({ nyckel, personer, u = null }) {
    const st = kalLage(nyckel); const visa = st.vem !== 'alla' ? personer.filter((x) => x.id === st.vem) : personer;
    st.personer = personer.map((p) => p.id); // kalenderfilen (lp-franvaro-ics) tar med samma personer som kalendern visar
    const [ar, man] = st.manad.split('-').map(Number);
    const forsta = new Date(ar, man - 1, 1); const start = new Date(forsta); start.setDate(1 - ((forsta.getDay() + 6) % 7));
    const veckor = Math.ceil((((forsta.getDay() + 6) % 7) + new Date(ar, man, 0).getDate()) / 7);
    const dagar = Array.from({ length: veckor * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return isoDag(d); });
    const fran = st.lage === 'ar' ? `${ar}-01-01` : dagar[0]; const till = st.lage === 'ar' ? `${ar}-12-31` : dagar[dagar.length - 1];
    const handelser = kalHandelser(visa, fran, till); const perDag = {}; for (const h of handelser) (perDag[h.dag] = perDag[h.dag] || []).push(h);
    const idagS = idag(); const ensam = visa.length === 1 ? visa[0] : null; const jobbat = ensam ? jobbadeDagar(ensam) : new Set();
    // Den egna kalendern visar också nekade ansökningar (överstrukna) och listan Mina ansökningar
    const egen = !!u && u.id === jag();
    const fvMark = (p, f) => { const s = fvStatus(f); return !serFranvaro(p) ? '' : s === 'ansokt' ? ' (ansökt)' : s === 'nekad' ? ' (nekad)' : ''; };
    const cell = (iso) => {
      const h = perDag[iso] || []; const fv = franvaroIn(visa, iso, { nekade: egen }); const vd = veckodag(iso);
      const typer = [...new Set(h.map((x) => x.typ))];
      const titel = [`${VDAG[vd - 1]} ${kortDatum(iso)}`, ...fv.map(({ u: p, f }) => `${visa.length > 1 ? `${p.kort}: ` : ''}${fvTyp(p, f).namn}${fvMark(p, f)}`), h.length ? plural(h.length, 'händelse', 'händelser') : ''].filter(Boolean).join(' · ');
      const giltig = fv.filter(({ f }) => fvStatus(f) !== 'nekad');
      return `<button type="button" class="lk-dag${iso.slice(0, 7) !== st.manad ? ' lk-utanfor' : ''}${vd >= 6 ? ' lk-helg' : ''}${iso === idagS ? ' lk-idag' : ''}" data-g="lk-dag" data-nyckel="${e(nyckel)}" data-dag="${iso}" aria-pressed="${iso === st.dag}" title="${e(titel)}" aria-label="${e(titel)}">
        <span class="lk-nr">${+iso.slice(8)}</span>${ensam && iso <= idagS && jobbat.has(iso) && !giltig.length ? '<i class="lk-jobbat" aria-hidden="true"></i>' : ''}
        ${fv.length ? `<span class="lk-fv">${fv.slice(0, 2).map(({ u: p, f }) => { const t = fvTyp(p, f); const s = serFranvaro(p) ? fvStatus(f) : ''; return `<span class="lk-fv-band${s === 'ansokt' ? ' lk-ansokt' : s === 'nekad' ? ' lk-nekad' : ''}" style="--f:${t.farg}">${ik(t.ikon)}<b>${e(visa.length > 1 ? p.kort : t.namn)}</b></span>`; }).join('')}${fv.length > 2 ? `<b class="lk-fler">+${fv.length - 2}</b>` : ''}</span>` : ''}
        ${h.length ? `<span class="lk-chips">${h.slice(0, 2).map((x) => `<span class="lk-chip" style="--k:${KAL_TYP[x.typ].farg}">${e(KAL_TYP[x.typ].namn)}${x.kundId && kund(x.kundId) ? ` · ${e(kund(x.kundId).namn.replace(/ (AB|IF|BK)$/, ''))}` : ''}</span>`).join('')}</span><span class="lk-prickar">${typer.slice(0, 4).map((t) => `<i style="--k:${KAL_TYP[t].farg}"></i>`).join('')}${h.length > 2 ? `<b>+${h.length - 2}</b>` : ''}</span>` : ''}
      </button>`;
    };
    const vd = st.dag; const hDag = kalHandelser(visa, vd, vd); const fvDag = franvaroIn(visa, vd, { nekade: egen });
    const vantarForst = (x) => (fvStatus(x.f) === 'ansokt' ? 0 : 1);
    // Väntande ansökningar (för den som leder: att godkänna). I den egna kalendern: Mina ansökningar = de som väntar plus beslut de
    // senaste 30 dagarna (godkänd/nekad, av vem och när) – så syns beslutet även när dagen inte är vald.
    const ansokningar = egen
      ? (u.franvaro || []).filter((f) => f.typ !== 'sjuk' && (!f.av || f.av === u.id) && (fvStatus(f) === 'ansokt' || (f.beslutTid && f.beslutAv && f.beslutAv !== u.id && Date.now() - Date.parse(f.beslutTid) < 30 * 864e5)))
        .map((f) => ({ u, f })).sort((a, b) => vantarForst(a) - vantarForst(b) || String(b.f.beslutTid || b.f.fran).localeCompare(String(a.f.beslutTid || a.f.fran)))
      : visa.filter(serFranvaro).flatMap((p) => (p.franvaro || []).filter((f) => fvStatus(f) === 'ansokt').map((f) => ({ u: p, f }))).sort((a, b) => a.f.fran.localeCompare(b.f.fran));
    const knappar = (p, f) => {
      const s = fvStatus(f);
      if (s === 'ansokt' && kanLeda() && p.id !== jag()) return `<button type="button" class="knapp knapp-accent knapp-liten" data-g="lp-fv-godkann" data-id="${e(p.id)}" data-fid="${e(f.id)}">${ik('bock')}Godkänn</button><button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-fv-neka" data-id="${e(p.id)}" data-fid="${e(f.id)}">Neka</button>`;
      if (kanLeda() || (p.id === jag() && (s === 'ansokt' || f.typ === 'sjuk'))) return `<button type="button" class="knapp knapp-spok knapp-liten" data-g="lp-franvaro" data-id="${e(p.id)}" data-fid="${e(f.id)}">${ik('redigera')}Ändra</button>`;
      return '';
    };
    // En frånvarorad: för personen själv och ledningen typ, status (vem som beslutade och när), skäl och anteckning – kollegor ser
    // bara "Frånvarande" och perioden
    const fvRad = ({ u: p, f }) => { const ser = serFranvaro(p); const t = fvTyp(p, f); const s = fvStatus(f);
      return `<li class="lk-fvrad" data-status="${ser ? s : 'dold'}" style="--f:${t.farg}"><span class="lk-fv-ikon">${ik(t.ikon)}</span>
      <span class="lk-fv-text"><strong>${visa.length > 1 || !u ? `${e(p.kort)} · ` : ''}${e(t.namn)} ${e(periodText(f))}</strong>${ser ? `<small><span class="lk-status" data-status="${s}">${e(fvLage(p, f))}</span>${f.beslutSkal && s === 'nekad' ? ` · ”${e(f.beslutSkal)}”` : ''}${f.notering ? ` · ${e(f.notering)}` : ''}</small>` : ''}</span>
      <span class="lk-fv-knappar">${knappar(p, f)}</span></li>`; };
    const hRad = (h) => `<li class="lk-hrad" style="--k:${KAL_TYP[h.typ].farg}"><span class="lk-h-ikon">${ik(KAL_TYP[h.typ].ikon)}</span>
      <span class="lk-h-text"><strong>${e(String(h.text).slice(0, 90))}${String(h.text).length > 90 ? '…' : ''}</strong><small>${e(KAL_TYP[h.typ].namn)}${h.tid ? ` · ${e(new Date(h.tid).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }))}` : h.planerad ? ' · planerad' : h.klar ? (h.typ === 'testdag' ? ' · genomförd' : ' · klar') : ''}${h.kundId && kund(h.kundId) ? ` · ${e(kund(h.kundId).namn)}` : ''}${visa.length > 1 ? ` · ${e(anv(h.vem).kort)}` : ''}</small></span>
      ${h.lank ? `<a class="lk-h-lank" href="${e(h.lank)}" aria-label="Öppna">${ik('pil')}</a>` : ''}</li>`;
    const dagText = (() => { const t = new Date(`${vd}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }); return vd === idagS ? `Idag, ${t}` : stor(t); })();
    const sidKnappar = egen
      ? `<button type="button" class="knapp knapp-accent knapp-liten" data-g="lp-franvaro" data-id="${e(jag())}" data-dag="${e(vd >= idagS ? vd : idagS)}">${ik('flyg')}Ansök om ledighet</button>${!franvaroIn([u], idagS).some(({ f }) => f.typ === 'sjuk') ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-sjuk">${ik('termometer')}Sjukanmäl idag</button>` : ''}`
      : kanLeda() ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-franvaro" data-id="${e(u ? u.id : st.vem !== 'alla' ? st.vem : '')}" data-dag="${e(vd)}">${ik('plus')}Lägg in frånvaro</button>` : '';
    const vantande = ansokningar.filter((x) => fvStatus(x.f) === 'ansokt').length;
    const ansokLista = ansokningar.length ? `<div class="lk-ansok"${egen ? ' data-mina' : ''}><p class="lk-sida-rubrik">${egen ? 'Mina ansökningar' : kanLeda() ? 'Att godkänna' : 'Ansökningar'} <b>${egen ? (vantande ? `${vantande} väntar` : ansokningar.length) : ansokningar.length}</b></p>${egen ? '<p class="lk-ansok-not">Väntande och beslut de senaste 30 dagarna.</p>' : ''}<ul class="lk-lista">${ansokningar.map(fvRad).join('')}</ul></div>` : '';
    const nav = `<div class="lk-nav"><div class="lp-narv-bladdra" role="group" aria-label="Byt ${st.lage === 'ar' ? 'år' : 'månad'}"><button type="button" class="lp-narv-pil" data-g="lk-bladdra" data-nyckel="${e(nyckel)}" data-steg="-1" aria-label="Föregående">${ik('pil-v')}</button><strong class="lk-period">${st.lage === 'ar' ? ar : `${stor(MANAD[man - 1])} ${ar}`}</strong><button type="button" class="lp-narv-pil" data-g="lk-bladdra" data-nyckel="${e(nyckel)}" data-steg="1" aria-label="Nästa">${ik('pil')}</button></div>
      <button type="button" class="lp-filter" data-g="lk-idag" data-nyckel="${e(nyckel)}">Idag</button>
      <div class="lk-lagen" role="group" aria-label="Visa">${[['manad', 'Månad'], ['ar', 'År']].map(([l, t]) => `<button type="button" class="lp-filter" data-g="lk-lage" data-nyckel="${e(nyckel)}" data-lage="${l}" aria-pressed="${st.lage === l}">${t}</button>`).join('')}</div>
      <button type="button" class="lp-filter lk-ics" data-g="lp-franvaro-ics" data-nyckel="${e(nyckel)}" title="Ledigheten och de planerade testdagarna, uppföljningarna och mötena från idag och ett år framåt – som kalenderfil för Outlook, Google eller Apple">${ik('ladda-ner')}<span>Kalenderfil</span></button></div>`;
    const vem = personer.length > 1 ? `<div class="lk-vem" role="group" aria-label="Vems kalender">${[{ id: 'alla', kort: 'Hela teamet' }, ...personer].map((p) => `<button type="button" class="lk-vem-knapp" data-g="lk-vem" data-nyckel="${e(nyckel)}" data-id="${e(p.id)}" aria-pressed="${st.vem === p.id}">${p.id === 'alla' ? `<span class="lk-vem-alla">${ik('anstallda')}</span>` : avatarHtml(p, { storlek: 's' })}<span>${e(p.kort)}</span></button>`).join('')}</div>` : '';
    let rutnat; let sida;
    if (st.lage === 'ar') {
      rutnat = `<div class="lk-ar">${MANAD.map((mn, mi) => { const f1 = new Date(ar, mi, 1); const off = (f1.getDay() + 6) % 7; const n = new Date(ar, mi + 1, 0).getDate(); const mm = String(mi + 1).padStart(2, '0');
        return `<button type="button" class="lk-mini${`${ar}-${mm}` === idagS.slice(0, 7) ? ' lk-mini-nu' : ''}" data-g="lk-till-manad" data-nyckel="${e(nyckel)}" data-manad="${ar}-${mm}" aria-label="Visa ${e(mn)} ${ar}"><strong>${e(stor(mn))}</strong><span class="lk-mini-rutnat">${'<i class="lk-mini-tom"></i>'.repeat(off)}${Array.from({ length: n }, (_, di) => { const iso = `${ar}-${mm}-${String(di + 1).padStart(2, '0')}`; const fv = franvaroIn(visa, iso)[0]; const hn = (perDag[iso] || []).length;
          return `<i${fv ? ` data-fv${fvStatus(fv.f) === 'ansokt' && serFranvaro(fv.u) ? ' data-ansokt' : ''} style="--f:${fvTyp(fv.u, fv.f).farg}"` : hn ? ` data-h style="--v:${Math.min(1, hn / 3).toFixed(2)}"` : ''}${iso === idagS ? ' data-idag' : ''}></i>`; }).join('')}</span></button>`; }).join('')}</div>`;
      const n = (t) => handelser.filter((h) => h.typ === t).length;
      sida = `<aside class="lk-sida">${ansokLista}<p class="lk-sida-rubrik">${ar} i siffror</p><dl class="lk-siffror">${[['Möten', n('mote'), 'mote'], ['Samtal', n('samtal'), 'samtal'], ['Testdagar', n('testdag'), 'testdag'], ['Uppgifter', n('uppgift'), 'uppgift']].map(([t, v, k]) => `<div style="--k:${KAL_TYP[k].farg}"><dt>${e(t)}</dt><dd>${v}</dd></div>`).join('')}<div style="--k:#4fb3ff"><dt>Frånvarodagar</dt><dd>${franvaroDagar(visa, `${ar}-01-01`, `${ar}-12-31`)}</dd></div></dl>${sidKnappar ? `<div class="lk-sida-knappar">${sidKnappar}</div>` : ''}</aside>`;
    } else {
      rutnat = `<div class="lk-manad" role="grid"><span class="lk-vh lk-vh-v">V</span>${VDAG.map((d, i) => `<span class="lk-vh${i >= 5 ? ' lk-helg' : ''}">${d}</span>`).join('')}
        ${Array.from({ length: veckor }, (_, w) => `<span class="lk-vnr">${veckaNr(dagar[w * 7])}</span>${dagar.slice(w * 7, w * 7 + 7).map(cell).join('')}`).join('')}</div>`;
      sida = `<aside class="lk-sida" aria-live="polite"><p class="lk-sida-rubrik lk-dagrubrik">${e(dagText)}</p>
        ${fvDag.length ? `<ul class="lk-lista">${fvDag.map(fvRad).join('')}</ul>` : ''}
        ${hDag.length ? `<ul class="lk-lista">${hDag.map(hRad).join('')}</ul>` : `<p class="lk-tom">${ik('kalender')}${fvDag.length ? 'Inga möten eller uppgifter.' : 'Inget inbokat den här dagen.'}</p>`}
        ${sidKnappar ? `<div class="lk-sida-knappar">${sidKnappar}</div>` : ''}${ansokLista}</aside>`;
    }
    const legend = `<div class="lk-legend">${Object.values(KAL_TYP).map((t) => `<span><i style="--k:${t.farg}"></i>${e(t.namn)}</span>`).join('')}<span><i class="lk-legend-fv"></i>Frånvaro</span>${visa.some(serFranvaro) ? '<span><i class="lk-legend-ansokt"></i>Ansökt ledighet</span>' : ''}${egen ? '<span><i class="lk-legend-nekad"></i>Nekad</span>' : ''}${ensam ? '<span><i class="lk-legend-jobbat"></i>Jobbade</span>' : ''}</div>`;
    return `<div class="lk" data-lk="${e(nyckel)}" data-lage="${st.lage}">${vem}<div class="lk-topp">${nav}</div><div class="lk-kropp"><div class="lk-huvud">${rutnat}${legend}</div>${sida}</div></div>`;
  }
  // Privat chattmeddelande (ansökan och beslut) – skapar samtalet om det inte finns. extra.franvaro = { uid, fid } ritar kortet
  // med ansökan under meddelandet (franvaroKort – Godkänn/Neka för den som leder, annars beslutet)
  function chattTill(uid, text, extra = {}) {
    if (SKARP || !uid || uid === jag()) return null; const d = db(); d.chatt = d.chatt || {}; const c = d.chatt; c.kanaler = c.kanaler || []; c.meddelanden = c.meddelanden || [];
    let k = c.kanaler.find((x) => x.typ === 'privat' && (x.medlemmar || []).length === 2 && x.medlemmar.includes(jag()) && x.medlemmar.includes(uid));
    if (!k) { k = { id: nyId('c'), typ: 'privat', medlemmar: [jag(), uid], skapad: new Date().toISOString(), skapadAv: jag() }; c.kanaler.push(k); }
    if (text) c.meddelanden.push({ id: nyId('m'), kanal: k.id, av: jag(), tid: new Date().toISOString(), text, ...(extra.franvaro ? { franvaro: { uid: extra.franvaro.uid, fid: extra.franvaro.fid } } : {}) });
    return k;
  }
  // Chatten (sidan och det flytande fönstret) ritar om sig när ledningen har ändrat något som syns där (kortet med ansökan)
  const ritaChatt = () => document.dispatchEvent(new CustomEvent('up-chatt-andrad'));
  // De som får ansökan i chatten (demoläget): försäljningscheferna. Administratören ser väntande ansökningar i kontrollcentralens förslag.
  const chefer = () => db().anvandare.filter((x) => x.id !== jag() && arChef(x));
  // Genitiv: Magnus ansökan, Dales ansökan
  const gen = (namn) => (/[sxz]$/i.test(String(namn || '')) ? String(namn || '') : `${namn}s`);
  const fvNamn = (f) => `${FRANVARO[f.typ] ? FRANVARO[f.typ].namn.toLowerCase() : 'frånvaro'} ${periodText(f)}`;
  // Beslutet (demoläget): den sökande får det i chatten (med skälet när ansökan nekas) och de andra i ledningen får besked, så att
  // deras "Ansökan …" inte står obesvarad. Ger läget före beslutet (Ångra).
  function beslut(u, f, status, skal = '') {
    f.status = status; f.beslutAv = jag(); f.beslutTid = new Date().toISOString();
    if (status === 'nekad' && skal) f.beslutSkal = skal; else delete f.beslutSkal;
    const text = fvNamn(f); const ref = { franvaro: { uid: u.id, fid: f.id } };
    logga(`${mig().namn} ${status === 'godkand' ? 'godkände' : 'nekade'} ${u.namn}s ansökan om ${text}.`, { typ: 'franvaro' });
    chattTill(u.id, `${status === 'godkand' ? 'Godkänd' : 'Nekad'}: din ansökan om ${text}.${status === 'nekad' ? (skal ? ` Skäl: ${skal}` : ' Hör av dig så hittar vi en annan lösning.') : ' Den syns nu i närvaron och i din kalender.'}`, ref);
    for (const c of chefer().filter((x) => x.id !== u.id)) chattTill(c.id, `${gen(u.kort)} ansökan om ${text} är ${status === 'godkand' ? 'godkänd' : 'nekad'} av ${mig().kort}.`, ref);
    raknaAnsokningar();
  }
  // Ångra ett beslut (toasten): ansökan väntar igen. Demo: rättelse i chatten till den sökande och de andra i ledningen. Skarpt läge:
  // servern tillåter det bara för den som beslutade och inom tio minuter (POST …/beslut { status: 'ansokt' }).
  async function angraBeslut(uid, fid) {
    const u = db().anvandare.find((x) => x.id === uid); const f = u && (u.franvaro || []).find((x) => x.id === fid);
    if (!f || fvStatus(f) === 'ansokt') return;
    if (SKARP) { if (!(await sparaKonto(() => L.konto.beslut(uid, fid, 'ansokt'), 'Beslutet kunde inte ångras.'))) return; }
    else {
      if (f.beslutAv !== jag()) { toast('Bara den som beslutade kan ångra beslutet', null, 'las'); return; }
      const vad = fvStatus(f) === 'godkand' ? 'godkännandet' : 'nekandet'; const ref = { franvaro: { uid: u.id, fid: f.id } };
      f.status = 'ansokt'; delete f.beslutAv; delete f.beslutTid; delete f.beslutSkal;
      logga(`${mig().namn} ångrade ${vad} av ${u.namn}s ansökan om ${fvNamn(f)}.`, { typ: 'franvaro' });
      chattTill(u.id, `Rättelse: ${vad} av din ansökan om ${fvNamn(f)} är ångrat – ansökan väntar på beslut igen.`, ref);
      for (const c of chefer().filter((x) => x.id !== u.id)) chattTill(c.id, `Rättelse: ${gen(u.kort)} ansökan om ${fvNamn(f)} väntar på beslut igen.`, ref);
      spara();
    }
    raknaAnsokningar(); rendera(); ritaChatt();
    toast(`Beslutet är ångrat – ${gen(u.kort)} ansökan väntar på beslut igen`, null, 'retur');
  }
  // Efter ett beslut får rubriken på bandet (eller kortet i chatten) fokus – inte nästa ansökans Godkänn, så att Enter två gånger
  // inte godkänner nästa ansökan också
  const beslutsFokus = (el) => {
    const kort = el && el.closest && el.closest('[data-lp-chkort]'); if (kort) return `[data-lp-chkort="${sel(kort.dataset.lpChkort)}"]`;
    const band = el && el.closest && el.closest('.lp-band'); const h = band && $('h2[id]', band); return h ? `#${sel(h.id)}` : null;
  };
  const fokusPa = (valjare) => { const m = valjare && $(valjare); if (!m) return; if (!m.hasAttribute('tabindex')) m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); };
  // Någon annan i ledningen hann före (eller ansökan ändrades i en annan flik): säg det och visa läget som det är nu
  const redanBeslutad = (f) => { toast(`Ansökan är redan ${fvStatus(f) === 'godkand' ? 'godkänd' : 'nekad'}${f.beslutAv ? ` av ${f.beslutAv === jag() ? 'dig' : anv(f.beslutAv).kort}` : ''}`, null, 'varning'); rendera(); ritaChatt(); };
  async function fattaBeslut(u, f, status, { skal = '', fokus = null } = {}) {
    const uid = u.id; const fid = f.id; const text = fvNamn(f);
    if (SKARP) { if (!(await sparaKonto(() => L.konto.beslut(uid, fid, status, skal), 'Beslutet kunde inte sparas.'))) { rendera(); ritaChatt(); return false; } raknaAnsokningar(); }
    else { beslut(u, f, status, skal); spara(); }
    K.stangArk(); rendera(); ritaChatt(); fokusPa(fokus);
    const angra = { text: 'Ångra', fn: () => angraBeslut(uid, fid) };
    if (status === 'godkand') toast(`${u.kort}: ${text} är godkänd`, null, 'bock', { atgard: angra });
    else toast(SKARP ? `${u.kort}: ${text} är nekad – beslutet syns i ${gen(u.kort)} kalender` : `${u.kort}: ${text} är nekad – ${u.kort} har fått besked i chatten`, null, SKARP ? 'kalender' : 'prat', { atgard: angra });
    return true;
  }
  // Neka: ett litet ark med ett valfritt skäl (följer med beslutet i chatten och syns i den sökandes kalender)
  function nekaArk(u, f, fokus) {
    oppnaArk(`${arkHuvud(`Neka ${gen(u.kort)} ansökan`, `${FRANVARO[f.typ].namn} ${periodText(f)}${f.notering ? ` – ”${f.notering}”` : ''}`, 'kalender')}
      <form data-form="lp-fv-neka" data-id="${e(u.id)}" data-fid="${e(f.id)}" data-fokus="${e(fokus || '')}" class="ark-kropp" novalidate>
        <label><span class="etikett">Skäl (valfritt)</span><textarea class="falt" name="skal" rows="3" maxlength="200" placeholder="t.ex. Två i teamet är redan lediga den veckan – går veckan efter?"></textarea></label>
        <p class="falt-hint">${SKARP ? `${e(u.kort)} ser beslutet och skälet i sin kalender.` : `${e(u.kort)} får beslutet och skälet i chatten och ser det i sin kalender. Utan skäl står det ”Hör av dig så hittar vi en annan lösning.”`}</p>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('stang')}Neka ansökan</button></div>`);
  }
  /* Kortet under ett chattmeddelande om ledighet (demoläget, chatt.js anropar): ansökan med typ och period, och för den som leder
     Godkänn och Neka direkt (samma handlare som under Försäljning). När beslutet är fattat visar kortet beslutet – vem och när.
     Bara personen själv och ledningen ser kortet (samma regel som kalendern). */
  function franvaroKort(ref) {
    if (!ref || !ref.uid || !ref.fid) return '';
    const p = db().anvandare.find((x) => x.id === ref.uid); const f = p && (p.franvaro || []).find((x) => x.id === ref.fid);
    const attr = `data-lp-chkort="${e(ref.fid)}" tabindex="-1"`;
    if (p && !serFranvaro(p)) return '';
    if (!f) return `<div class="lp-chkort" ${attr} data-status="borta"><span class="lp-chkort-ikon">${ik('kalender')}</span><span class="lp-chkort-text"><strong>Ansökan finns inte längre</strong><small>Den har återkallats eller tagits bort</small></span></div>`;
    const t = FRANVARO[f.typ] || FRANVARANDE; const s = fvStatus(f);
    const knappar = s === 'ansokt' && kanLeda() && p.id !== jag()
      ? `<span class="lp-chkort-knappar"><button type="button" class="knapp knapp-accent knapp-liten" data-g="lp-fv-godkann" data-id="${e(p.id)}" data-fid="${e(f.id)}">${ik('bock')}Godkänn</button><button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-fv-neka" data-id="${e(p.id)}" data-fid="${e(f.id)}">Neka</button></span>` : '';
    return `<div class="lp-chkort" ${attr} data-status="${s}" style="--f:${t.farg}"><span class="lp-chkort-ikon">${ik(t.ikon)}</span><span class="lp-chkort-text"><strong>${p.id === jag() ? '' : `${e(p.kort)} · `}${e(t.namn)} ${e(periodText(f))}</strong><small><span class="lk-status" data-status="${s}">${e(fvLage(p, f))}</span>${f.beslutSkal && s === 'nekad' ? ` · ”${e(f.beslutSkal)}”` : ''}</small></span>${knappar}</div>`;
  }
  // Ansökningar som väntar – räknaren vid Försäljning i menyn (för den som godkänner)
  function raknaAnsokningar() {
    const n = kanLeda() ? db().anvandare.reduce((s, u) => s + (u.franvaro || []).filter((f) => fvStatus(f) === 'ansokt' && u.id !== jag()).length, 0) : 0;
    $$('[data-rakna="chef"]').forEach((x) => { x.textContent = n ? String(n) : ''; x.hidden = !n; x.toggleAttribute('data-varm', !!n); });
  }
  function franvaroArk({ id = '', dag = '', fid = '' } = {}) {
    const leda = kanLeda();
    const folk = db().anvandare.filter((x) => arAktiv(x) && x.roll !== 'admin');
    const u = folk.find((x) => x.id === (id || (leda ? '' : jag()))) || (leda ? null : mig());
    if (!leda && (!u || u.id !== jag())) return;
    const f = u && fid ? (u.franvaro || []).find((x) => x.id === fid) : null;
    if (f && !leda && fvStatus(f) !== 'ansokt' && f.typ !== 'sjuk') { toast(SKARP ? 'Beslutad ledighet ändras av försäljningschefen – hör av dig till chefen' : 'Beslutad ledighet ändras av försäljningschefen – skriv till chefen i chatten', null, 'las'); return; }
    const typ = f ? f.typ : 'semester'; const ansokan = !leda;
    oppnaArk(`${arkHuvud(f ? 'Ändra frånvaro' : ansokan ? 'Ansök om ledighet' : 'Lägg in frånvaro', ansokan ? 'Semester, ledigt och utbildning godkänns av försäljningschefen. Sjukdom gäller direkt.' : 'Syns i närvaron och kalendern – planerade dagar räknas inte som missade.', 'kalender')}
      <form data-form="lp-franvaro" data-fid="${e(f ? f.id : '')}" class="ark-kropp" novalidate>
        ${leda ? `<label><span class="etikett">Vem</span><select class="falt" name="vem">${folk.map((x) => `<option value="${e(x.id)}" ${x.id === (u ? u.id : '') ? 'selected' : ''}>${e(x.namn)}</option>`).join('')}</select></label>` : `<input type="hidden" name="vem" value="${e(jag())}">`}
        <div class="lp-fv-typer" role="radiogroup" aria-label="Typ av frånvaro">${Object.entries(FRANVARO).map(([k, v]) => `<label class="lp-fv-typ" style="--f:${v.farg}"><input type="radio" name="typ" value="${k}" ${k === typ ? 'checked' : ''}><span>${ik(v.ikon)}${e(v.namn)}<small>${ansokan ? (k === 'sjuk' ? 'gäller direkt' : 'ansökan') : 'godkänd direkt'}</small></span></label>`).join('')}</div>
        <div class="falt-rad"><label><span class="etikett">Från<span class="krav">*</span></span><input class="falt" type="date" name="fran" value="${e(f ? f.fran : dag || idag())}" min="${e(omDagar(-365))}" max="${e(omDagar(730))}" required data-fel="Välj första dagen"></label>
          <label><span class="etikett">Till och med</span><input class="falt" type="date" name="till" value="${e(f ? f.till || f.fran : dag || idag())}" min="${e(f ? f.fran : dag || idag())}" data-min="${e(omDagar(-365))}" max="${e(omDagar(730))}"></label></div>
        <label><span class="etikett">${ansokan ? 'Meddelande till chefen (valfritt)' : 'Anteckning (valfritt)'}</span><input class="falt" name="notering" maxlength="60" autocomplete="off" placeholder="t.ex. Vabb, kurs i Stockholm" value="${e(f ? f.notering || '' : '')}"></label>
        ${ansokan ? `<p class="falt-hint">${SKARP ? 'Försäljningschefen ser ansökan under Försäljning. Beslutet syns i din kalender (Mina ansökningar) – och som ett meddelande här när det kommer.' : 'Chefen får ansökan i chatten och under Försäljning. Beslutet syns i din kalender (Mina ansökningar) och i chatten.'}</p>`
          : `<p class="falt-hint">${SKARP ? 'Lägger du in frånvaro åt någon annan ser hen den i sin kalender och får ett besked i CRM:et.' : 'Lägger du in frånvaro åt någon annan får hen besked i chatten.'}</p>`}
      </form>
      <div class="ark-fot">${f ? `<button class="knapp knapp-spok knapp-fara" type="button" data-g="lp-franvaro-bort" data-id="${e(u.id)}" data-fid="${e(f.id)}">${ik('papperskorg')}${!leda && fvStatus(f) === 'ansokt' ? 'Återkalla' : 'Ta bort'}</button>` : ''}<button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik(ansokan ? 'skicka' : 'bock')}${ansokan && !f ? 'Skicka' : 'Spara'}</button></div>`);
  }

  /* 07d-profilens kort: om personen och arbetet ------------------------------------------------------------------- */
  const AKT_TYP = (typ) => (typ === 'mote' ? 'mote' : typ === 'samtal' ? 'samtal' : 'aktivitet');
  const TYP_PLURAL = { mote: 'Möten', samtal: 'Samtal', aktivitet: 'Aktiviteter' };
  function omKortHtml(u, egen, akt) {
    const x = u.roll === 'salj' ? stat(u) : null;
    const arTot = u.start ? Math.max(0, (Date.now() - Date.parse(u.start)) / (365.25 * 864e5)) : null;
    const tidText = arTot == null ? '–' : arTot >= 1 ? `${Math.floor(arTot)} år${Math.round((arTot % 1) * 12) ? ` ${Math.round((arTot % 1) * 12)} mån` : ''}` : `${Math.max(1, Math.round(arTot * 12))} mån`;
    const manadNu = idag().slice(0, 7);
    const vunnetManad = x ? sum(db().affarer.filter((a) => a.ansvarig === u.id && a.steg === 'signerad' && String(a.stegAndrad || '').slice(0, 7) === manadNu).map(affarVarde)) : 0;
    const andel = x && u.mal ? Math.min(1, vunnetManad / u.mal) : null;
    const nasta = synligFranvaro(u).filter((f) => fvStatus(f) !== 'nekad' && (f.till || f.fran) >= idag()).sort((a, b) => a.fran.localeCompare(b.fran))[0];
    const tel = String(u.tel || '').replace(/[^\d+]/g, '');
    const ruta = (ikon, etikett, innehall, klass = '') => `<div class="lp-om-ruta${klass}"><span class="lp-om-ikon">${ik(ikon)}</span><div class="lp-om-innehall"><small>${e(etikett)}</small>${innehall}</div></div>`;
    const kontakt = `<div class="lp-om-kontakt">
      ${u.epost ? `<div class="lp-om-kanal"><span class="lp-om-ikon">${ik('mejl')}</span><span><small>E-post</small><strong>${e(u.epost)}</strong></span><a class="lp-om-mini" href="mailto:${e(u.epost)}" title="Skicka e-post" aria-label="Skicka e-post till ${e(u.namn)}">${ik('mejl')}</a><button type="button" class="lp-om-mini" data-g="lp-kopiera" data-text="${e(u.epost)}" title="Kopiera" aria-label="Kopiera e-postadressen">${ik('dokument')}</button></div>` : ''}
      ${tel ? `<div class="lp-om-kanal"><span class="lp-om-ikon">${ik('samtal')}</span><span><small>Telefon</small><strong>${e(u.tel)}</strong></span><a class="lp-om-mini" href="tel:${e(tel)}" title="Ring" aria-label="Ring ${e(u.namn)}">${ik('samtal')}</a><button type="button" class="lp-om-mini" data-g="lp-kopiera" data-text="${e(u.tel)}" title="Kopiera" aria-label="Kopiera telefonnumret">${ik('dokument')}</button></div>` : ''}
      ${!egen && !SKARP && arAktiv(u) ? `<button type="button" class="lp-om-chatta" data-g="lp-chatta" data-id="${e(u.id)}">${ik('prat')}<span>Skicka meddelande till ${e(u.kort)}<small>${e(statusText(u))}</small></span>${ik('pil')}</button>` : ''}
    </div>`;
    const dagar = `<span class="lp-om-veckodagar" aria-label="Arbetsdagar: ${e(schemaText(u))}">${VDAG.map((d, i) => `<i${arbetsdagar(u).includes(i + 1) ? ' data-pa' : ''}>${d[0]}</i>`).join('')}</span>`;
    const rutor = [
      ruta('anstallda', 'Roller', `<span class="lp-om-chips">${rollChips(u)}</span>`),
      ruta('kalender', 'I teamet', `<strong>${e(tidText)}</strong><em>${u.start ? `sedan ${e(new Date(u.start).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }))}` : ''}</em>`),
      x ? ruta('mal', `Månadsmål ${MANAD[+manadNu.slice(5) - 1]}`, u.mal ? `<strong>${e(krKort(vunnetManad))} <span>av ${e(krKort(u.mal))}</span></strong><span class="lp-om-matare" style="--andel:${(andel || 0).toFixed(3)}" aria-hidden="true"><i></i></span><em>${e(pct(andel || 0))} av målet${kanLeda() ? ` · <button type="button" class="lp-textknapp" data-g="lp-mal" data-id="${e(u.id)}">Ändra</button>` : ''}</em>` : `<strong>Inget satt</strong>${kanLeda() ? `<em><button type="button" class="lp-textknapp" data-g="lp-mal" data-id="${e(u.id)}">Sätt mål</button></em>` : ''}`)
        : ruta('puls', 'Senast aktiv', `<strong>${e(aktivText(u))}</strong><em>${e(statusText(u, !egen))}</em>`),
      u.roll !== 'admin' ? ruta('flyg', 'Arbetsdagar', `${dagar}<em>${nasta ? `<span class="lp-franvaro-chip${fvStatus(nasta) === 'ansokt' && serFranvaro(u) ? ' lp-franvaro-ansokt' : ''}" style="--f:${fvTyp(u, nasta).farg}">${e(fvTyp(u, nasta).namn)} ${e(periodText(nasta))}${fvStatus(nasta) === 'ansokt' && serFranvaro(u) ? ' · ansökt' : ''}</span>` : 'Ingen frånvaro inlagd'}${kanLeda() ? ` · <button type="button" class="lp-textknapp" data-g="lp-schema" data-id="${e(u.id)}">Ändra</button>` : ''}</em>`)
        : ruta('skold', 'Ansvar', '<strong>Konton och säkerhet</strong><em>Adminpanelen och säkerhetshubben</em>'),
    ].join('');
    const senast = akt.slice(0, 4);
    return `<section class="lp-band lp-band-halv lp-omkort" data-mork-yta aria-labelledby="lp-h-om"><header class="lp-band-huvud"><div><p class="lp-ogon">Om</p><h2 id="lp-h-om">${egen ? 'Om <em>dig</em>' : `Om <em>${e(u.kort)}</em>`}</h2></div>${kanAndra(u) ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="lp-andra-profil" data-id="${e(u.id)}">${ik('redigera')}Ändra</button>` : ''}</header>
      ${u.om ? `<blockquote class="lp-om-citat"><span aria-hidden="true">”</span>${e(u.om)}</blockquote>` : egen ? `<button type="button" class="lp-om-skriv" data-g="lp-andra-profil" data-id="${e(u.id)}" data-fokus="om">${ik('redigera')}<span><strong>Berätta om dig</strong><small>Några rader om vad du jobbar med och hur man når dig bäst – syns för hela teamet.</small></span>${ik('pil')}</button>` : `<p class="lp-om-ingen">${e(u.kort)} har inte skrivit någon presentation än.</p>`}
      ${kontakt}
      <div class="lp-om-rutor">${rutor}</div>
      <p class="lp-del">Senast i tidslinjerna</p>
      ${senast.length ? `<ul class="lp-om-senast">${senast.map((a) => { const t = KAL_TYP[AKT_TYP(a.typ)]; return `<li style="--k:${t.farg}"><span class="lp-om-sikon">${ik(t.ikon)}</span><span><strong>${e(String(a.text).slice(0, 96))}${String(a.text).length > 96 ? '…' : ''}</strong><small>${e(t.namn)} · ${e((kund(a.kundId) || {}).namn || '')}${a.kundId ? ' · ' : ''}${e(relTid(a.tid))}</small></span>${a.kundId ? `<a class="lk-h-lank" href="#/kund/${e(a.kundId)}" aria-label="Öppna kunden">${ik('pil')}</a>` : ''}</li>`; }).join('')}</ul>` : '<p class="lp-tom">Inget i tidslinjerna ännu.</p>'}
    </section>`;
  }
  function arbeteHtml(u, akt, per30) {
    const x = u.roll === 'salj' ? stat(u) : null;
    const nu30 = sum(per30); const fore30 = akt.filter((a) => dagarSedan(a.tid) >= 30 && dagarSedan(a.tid) < 60).length; const diff = nu30 - fore30;
    const todos = db().todos.filter((t) => t.ansvarig === u.id && !t.klar).sort((a, b) => String(a.datum || '9').localeCompare(String(b.datum || '9')));
    const forf = todos.filter((t) => t.datum && t.datum < idag());
    const proj = u.roll === 'test' ? db().projekt.filter((p) => p.ansvarigTest === u.id && p.steg !== 'klar') : [];
    const max = Math.max(1, ...per30);
    const typer = { mote: 0, samtal: 0, aktivitet: 0 }; for (const a of akt) if (dagarSedan(a.tid) < 30) typer[AKT_TYP(a.typ)]++;
    const tal = (ikon, etikett, varde, under, ton = '') => `<div class="lp-arb-tal"${ton ? ` data-ton="${ton}"` : ''}><span class="lp-om-ikon">${ik(ikon)}</span><small>${e(etikett)}</small><strong>${varde}</strong><em>${under}</em></div>`;
    const datumChip = (d) => { if (!d) return '<span class="lp-arb-datum">Utan datum</span>'; const n = dagarTill(d); return `<span class="lp-arb-datum" data-lage="${n < 0 ? 'sen' : n === 0 ? 'idag' : 'snart'}">${n < 0 ? `${plural(-n, 'dag', 'dagar')} sen` : n === 0 ? 'Idag' : n === 1 ? 'Imorgon' : e(kortDatum(d))}</span>`; };
    const stegIndex = (s) => OPPNA.indexOf(s);
    return `<section class="lp-band lp-band-halv lp-arbkort" data-mork-yta aria-labelledby="lp-h-arb"><header class="lp-band-huvud"><div><p class="lp-ogon">Arbete</p><h2 id="lp-h-arb">Aktivitet <em>och arbete</em></h2></div><span class="lp-band-tal">Senaste 30 dagarna</span></header>
      <div class="lp-arb-trio">
        ${tal('puls', 'Händelser', nu30, diff ? `${diff > 0 ? '+' : '−'}${Math.abs(diff)} mot förra 30 d` : 'som förra 30 d', diff > 0 ? 'mint' : diff < 0 ? 'gul' : '')}
        ${x ? tal('portfolj', 'Öppna affärer', x.oppna.length, e(krKort(x.pipeline)) + ' i pipeline') : tal('projekt', 'Pågående projekt', proj.length, proj.length ? 'från underlag till uppföljning' : 'inga just nu')}
        ${tal('todo', 'Att göra', todos.length, forf.length ? `${plural(forf.length, 'förfallen', 'förfallna')}` : 'inget förfallet', forf.length ? 'rod' : '')}
      </div>
      <div class="lp-arb-graf" role="img" aria-label="${e(`${plural(nu30, 'händelse', 'händelser')} de senaste 30 dagarna`)}">
        <div class="lp-arb-staplar">${per30.map((v, i) => { const iso = omDagar(i - 29); return `<span class="lp-arb-stapel${veckodag(iso) >= 6 ? ' lp-arb-helg' : ''}${i === 29 ? ' lp-arb-idag' : ''}" style="--v:${(v / max).toFixed(3)};--i:${i}" title="${e(`${VDAG[veckodag(iso) - 1]} ${kortDatum(iso)}: ${plural(v, 'händelse', 'händelser')}`)}"><i></i>${v ? `<b>${v}</b>` : ''}</span>`; }).join('')}</div>
        <div class="lp-arb-axel">${[0, 7, 14, 21, 29].map((i) => `<span style="--i:${i}">${i === 29 ? 'Idag' : e(kortDatum(omDagar(i - 29)))}</span>`).join('')}</div>
        <div class="lp-arb-typer">${Object.entries(typer).map(([k, v]) => `<span style="--k:${KAL_TYP[k].farg}"><i></i>${e(TYP_PLURAL[k])} <b>${v}</b></span>`).join('')}</div>
      </div>
      ${x && x.oppna.length ? `<p class="lp-del">Öppna affärer</p><ul class="lp-arb-lista">${x.oppna.sort((a, b) => affarVarde(b) - affarVarde(a)).slice(0, 4).map((a) => { const si = stegIndex(a.steg); const p = sannolikhet(a).p;
        return `<li><a href="#/affar/${e(a.id)}"><span class="lp-arb-steg" aria-label="${e(STEGNAMN[a.steg] || a.steg)}">${OPPNA.map((s, i) => `<i data-steg="${e(s)}"${i <= si ? ' data-pa' : ''}></i>`).join('')}</span><span class="lp-arb-text"><strong>${e(a.titel)}</strong><small>${e((kund(a.kundId) || {}).namn || '')} · ${e(STEGNAMN[a.steg] || a.steg)} · ${e(pct(p))} chans</small></span><strong class="lp-arb-varde">${e(krKort(affarVarde(a)))}</strong></a></li>`; }).join('')}</ul>` : ''}
      <p class="lp-del">Att göra${todos.length ? ` <small>${todos.length}</small>` : ''}</p>
      ${todos.length ? `<ul class="lp-arb-lista">${todos.slice(0, 4).map((t) => `<li><a href="#/att-gora"><span class="lp-arb-cirkel${t.datum && t.datum < idag() ? ' lp-arb-sen' : ''}" aria-hidden="true"></span><span class="lp-arb-text"><strong>${e(t.text)}</strong><small>${t.kundId && kund(t.kundId) ? e(kund(t.kundId).namn) : 'Ingen kund'}</small></span>${datumChip(t.datum)}</a></li>`).join('')}</ul>` : `<p class="lp-tom">${ik('bock')} Inga öppna uppgifter.</p>`}
    </section>`;
  }

  /* 07e-skarpt läge: kontot sparas av servern -------------------------------------------------------------------
     sparaKonto(gor, felText, form) kör ett anrop till UPLager.konto (svaret är redan intaget i db), låser arkets knapp under
     tiden och visar felet – vid fältfel i formuläret vid fältet. Ger svaret, eller null när inget sparades. */
  const kontoFel = (svar, standard) => (svar.fel === 'natverk' ? 'Kunde inte nå servern – ingenting sparades. Försök igen.' : svar.fel !== 'serverfel' && svar.meddelande ? svar.meddelande : standard);
  async function sparaKonto(gor, felText, form = null) {
    const knapp = $('[data-ark] [data-g="skicka-ark"]'); if (knapp) knapp.disabled = true;
    let svar;
    try { svar = await gor(); } finally { if (knapp) knapp.disabled = false; }
    if (svar && svar.ok) return svar;
    if (!svar || svar.status === 401) return null; // lagret är på väg till inloggningen
    const d = form && Array.isArray(svar.detaljer) ? svar.detaljer.find((x) => x && x.falt && form.elements[String(x.falt).split('.')[0]]) : null;
    if (d) K.visaFel(form, String(d.falt).split('.')[0], d.meddelande); else toast(kontoFel(svar, felText), null, 'varning');
    return null;
  }
  /* Ändringar på kontona som kommer via polling (skarpt läge, crm.js anropar): den egna rollen (toast, rätt vy och allt hämtas
     om – servern visar andras konton olika för olika roller), beslut om de egna ansökningarna och – för den som leder – nya
     ansökningar. Ersätter chattmeddelandena i demoläget. */
  function vidKontoAndring(andrade) {
    if (!SKARP || !Array.isArray(andrade)) return;
    const fvText = (f) => `${FRANVARO[f.typ] ? FRANVARO[f.typ].namn.toLowerCase() : 'frånvaro'} ${periodText(f)}`;
    for (const x of andrade) {
      if (x.samling !== 'anvandare' || !x.fore || !x.efter) continue;
      const fore = x.fore; const nu = x.efter;
      if (x.id === jag()) {
        if (fore.roll !== nu.roll || !!fore.admin !== !!nu.admin || !!fore.chef !== !!nu.chef) {
          toast(`Din roll är nu ${roller(nu).join(' · ')}`, null, nu.roll === 'test' ? 'stetoskop' : 'anstallda', { rubrik: 'Administratören har ändrat dina roller' });
          const h = location.hash || '#/';
          if ((/^#\/chef/.test(h) && !(arChef(nu) || arAdm(nu))) || (/^#\/(admin|sakerhet|anvandare)/.test(h) && !arAdm(nu)) || (/^#\/(projekt|salj)/.test(h) && nu.roll === 'admin')) location.hash = '#/';
          L.hamtaOm();
        }
        // Beslut, ångrade beslut och frånvaro som någon annan har lagt in, ändrat eller tagit bort i min kalender
        const kal = { href: '#/profil', text: 'Kalendern' };
        const annan = (id) => !!id && id !== jag();
        for (const f of nu.franvaro || []) {
          const g = (fore.franvaro || []).find((y) => y.id === f.id);
          if (g && fvStatus(g) === 'ansokt' && fvStatus(f) !== 'ansokt') toast(`${f.beslutAv ? anv(f.beslutAv).kort : 'Ledningen'} ${fvStatus(f) === 'godkand' ? 'godkände' : 'nekade'} din ansökan om ${fvText(f)}${f.beslutSkal && fvStatus(f) === 'nekad' ? ` – ”${f.beslutSkal}”` : ''}`, kal, fvStatus(f) === 'godkand' ? 'bock' : 'kalender');
          else if (g && fvStatus(g) !== 'ansokt' && fvStatus(f) === 'ansokt') toast(`Beslutet om din ansökan om ${fvText(f)} är ångrat – den väntar på beslut igen`, kal, 'retur');
          else if (!g && annan(f.av)) toast(`${anv(f.av).kort} har lagt in ${fvText(f)} åt dig`, kal, FRANVARO[f.typ] ? FRANVARO[f.typ].ikon : 'kalender');
          else if (g && annan(f.av) && (g.typ !== f.typ || g.fran !== f.fran || (g.till || g.fran) !== (f.till || f.fran))) toast(`${anv(f.av).kort} har ändrat din frånvaro till ${fvText(f)}`, kal, 'kalender');
        }
        for (const g of fore.franvaro || []) if (!(nu.franvaro || []).some((f) => f.id === g.id) && (annan(g.av) || (annan(g.beslutAv) && fvStatus(g) !== 'ansokt'))) toast(`Ledningen har tagit bort ${fvText(g)} ur din kalender`, kal, 'kalender');
      } else if (kanLeda()) {
        for (const f of nu.franvaro || []) {
          const g = (fore.franvaro || []).find((y) => y.id === f.id);
          if (fvStatus(f) === 'ansokt' && !(g && fvStatus(g) === 'ansokt')) toast(`${nu.kort} ansöker om ${fvText(f)}`, { href: '#/chef', text: 'Granska' }, FRANVARO[f.typ] ? FRANVARO[f.typ].ikon : 'kalender');
          // Någon annan i ledningen har beslutat – ansökan ska inte stå obesvarad hos mig
          else if (g && fvStatus(g) === 'ansokt' && fvStatus(f) !== 'ansokt' && f.beslutAv && f.beslutAv !== jag()) toast(`${anv(f.beslutAv).kort} ${fvStatus(f) === 'godkand' ? 'godkände' : 'nekade'} ${gen(nu.kort)} ansökan om ${fvText(f)}`, null, fvStatus(f) === 'godkand' ? 'bock' : 'kalender');
        }
      }
    }
    raknaAnsokningar();
  }

  /* 08-handlare och formulär ---------------------------------------------------------------------------- */
  const G = {
    'lp-status': () => { stangKonto(false); statusArk(); },
    'lp-konto': () => kontoMeny(),
    'lp-byt': (el) => { stangKonto(false); if (!SKARP && K.bytAnvandare && el.dataset.id !== jag()) K.bytAnvandare(el.dataset.id); },
    'lp-snabbstatus': async (el) => {
      let u = mig(); let ny = null; const kod = el.dataset.kod;
      if (SKARP) {
        const fore = new Set((u.franvaro || []).map((f) => f.id));
        if (!(await sparaKonto(() => L.konto.andra(u.id, { status: { kod } }), 'Statusen kunde inte sparas.'))) return;
        u = mig(); ny = nyAutoRad(u, fore); raknaAnsokningar();
      } else { u.status = { kod }; ny = statusFranvaro(u, kod); spara(); }
      ritaSido();
      if (kontoPanel) { $$('[data-g="lp-snabbstatus"]', kontoPanel).forEach((b) => b.setAttribute('aria-pressed', String(b === el))); const n = narvaro(u, false); const sk = $('.lp-konto-statusknapp', kontoPanel); if (sk) { sk.style.setProperty('--narv', n.farg); $('span', sk).textContent = statusText(u, false); } const t = $('.lp-konto-topp', kontoPanel); if (t) t.style.setProperty('--narv', n.farg); }
      if (/^#\/(chef|profil|admin)/.test(location.hash)) rendera();
      statusToast(u, kod, ny);
    },
    'lp-vy': (el) => bytVy(el.dataset.vy),
    'lp-chef-filter': (el) => { chefUi.filter = el.dataset.filter; rendera(); },
    'lp-ny-anstalld': () => { stangKonto(false); nyAnstalldArk(); },
    'lp-andra-profil': (el) => { const u = db().anvandare.find((x) => x.id === el.dataset.id); if (u && kanAndra(u)) profilArk(u, { fokus: el.dataset.fokus || '' }); },
    'lp-ta-bort-bild': (el) => { const f = el.closest('form') || $('[data-ark] form'); if (!f) return; f.elements.bild.value = ''; const p = $('[data-lp-forhand]', f); const u = anv(f.dataset.id); if (p) p.innerHTML = `<span>${e(u.initialer)}</span>`; el.remove(); },
    'lp-mal': (el) => malArk(el.dataset.id || ''),
    'lp-uppgift': (el) => uppgiftArk(el.dataset.id),
    'lp-fordela': (el) => fordelaArk(el.dataset.affar),
    'lp-pamin': (el) => {
      const a = db().affarer.find((x) => x.id === el.dataset.affar); if (!a || !a.ansvarig) return;
      const u = anv(a.ansvarig);
      db().todos.push({ id: nyId('t'), text: `Ta nästa steg i ${a.titel} (påminnelse från ${mig().kort})`, kundId: a.kundId, affarId: a.id, ansvarig: a.ansvarig, datum: idag(), klar: false });
      logga(`${mig().namn} påminde ${u.namn} om affären ${a.titel}.`, { kundId: a.kundId, affarId: a.id });
      spara(); rendera(); toast(`${u.kort} har fått en påminnelse i Att göra`, null, 'larm');
    },
    'lp-salj-for': (el) => { if (K.saljUi) K.saljUi.vem = el.dataset.id; location.hash = '#/salj'; },
    'lp-rapport': () => rapport(),
    'lp-narv-skift': (el) => { const s = +el.dataset.steg; narvUi.skift = s ? Math.max(-26, Math.min(12, narvUi.skift + s)) : 0; rendera(); const f = $(`[data-g="lp-narv-skift"][data-steg="${s}"]`); if (f) f.focus({ preventScroll: true }); },
    'lp-schema': (el) => schemaArk(el.dataset.id),
    'lp-franvaro': (el) => franvaroArk({ id: el.dataset.id || '', fid: el.dataset.fid || '', dag: el.dataset.dag || '' }),
    'lp-dag': (el) => { if (!kanLeda()) return; franvaroArk({ id: el.dataset.id, dag: el.dataset.dag, fid: el.dataset.franvaro || '' }); },
    'lp-fv-godkann': async (el) => {
      const u = db().anvandare.find((x) => x.id === el.dataset.id); const f = u && (u.franvaro || []).find((x) => x.id === el.dataset.fid); if (!f || !kanLeda() || u.id === jag()) return;
      if (fvStatus(f) !== 'ansokt') { redanBeslutad(f); return; }
      await fattaBeslut(u, f, 'godkand', { fokus: beslutsFokus(el) });
    },
    'lp-fv-neka': (el) => {
      const u = db().anvandare.find((x) => x.id === el.dataset.id); const f = u && (u.franvaro || []).find((x) => x.id === el.dataset.fid); if (!f || !kanLeda() || u.id === jag()) return;
      if (fvStatus(f) !== 'ansokt') { redanBeslutad(f); return; }
      nekaArk(u, f, beslutsFokus(el));
    },
    'lp-sjuk': async () => {
      const u = mig(); const d = idag(); if (franvaroIn([u], d).some(({ f }) => f.typ === 'sjuk')) return;
      // Skarpt läge: servern sparar sjukdagen och sätter statusen Sjuk (ingen aktivitet i tidslinjen – sjukfrånvaro är en hälsouppgift)
      if (SKARP) { if (!(await sparaKonto(() => L.konto.franvaro(u.id, { typ: 'sjuk', fran: d, till: d }), 'Sjukanmälan kunde inte sparas.'))) return; ritaSido(); rendera(); toast('Du är sjukanmäld för idag – krya på dig', null, 'termometer'); return; }
      const post = { id: nyId('fv'), typ: 'sjuk', fran: d, till: d, status: 'godkand', skapad: new Date().toISOString() };
      u.franvaro = [...(u.franvaro || []), post]; u.status = { kod: 'sjuk' };
      for (const c of chefer()) chattTill(c.id, `Sjukanmälan: jag är sjuk idag (${kortDatum(d)}).`, { franvaro: { uid: u.id, fid: post.id } });
      logga(`${u.namn} sjukanmälde sig för ${kortDatum(d)}.`, { typ: 'franvaro' });
      spara(); ritaSido(); rendera(); toast('Du är sjukanmäld för idag – krya på dig', null, 'termometer');
    },
    'lp-chatta': (el) => { const k = chattTill(el.dataset.id, ''); if (!k) return; spara(); if (window.UPChattFonster) window.UPChattFonster(k.id); else location.hash = `#/chatt/${k.id}`; },
    'lp-kopiera': async (el) => { try { await navigator.clipboard.writeText(el.dataset.text || ''); toast('Kopierat', null, 'bock'); } catch (err) { toast('Kunde inte kopiera', null, 'varning'); } },
    'lk-dag': (el) => { const st = kalLage(el.dataset.nyckel); st.dag = el.dataset.dag; st.manad = st.dag.slice(0, 7); rendera(); },
    'lk-bladdra': (el) => { const st = kalLage(el.dataset.nyckel); const s = +el.dataset.steg; if (st.lage === 'ar') st.manad = `${+st.manad.slice(0, 4) + s}${st.manad.slice(4)}`; else st.manad = isoDag(new Date(+st.manad.slice(0, 4), +st.manad.slice(5) - 1 + s, 1)).slice(0, 7); rendera(); },
    'lk-idag': (el) => { const st = kalLage(el.dataset.nyckel); st.manad = idag().slice(0, 7); st.dag = idag(); rendera(); },
    'lk-lage': (el) => { const st = kalLage(el.dataset.nyckel); st.lage = el.dataset.lage; rendera(); },
    'lk-vem': (el) => { const st = kalLage(el.dataset.nyckel); st.vem = el.dataset.id; rendera(); },
    'lk-till-manad': (el) => { const st = kalLage(el.dataset.nyckel); st.manad = el.dataset.manad; st.lage = 'manad'; st.dag = st.manad === idag().slice(0, 7) ? idag() : `${st.manad}-01`; rendera(); },
    // Kalendern som kalenderfil (iCalendar) för Outlook, Google eller Apple: ledigheten och de planerade testdagarna, uppföljningarna
    // och mötena för dem kalendern visar (hela teamet eller en person), från idag och ett år framåt. Heldagar. Samma escape och
    // radvikning som testdagens fil (crm.js testdag-ics). Bara det tittaren får se (synligFranvaro): kollegors frånvaro heter
    // "Frånvarande", andras sjukdagar blir "Frånvarande" även för ledningen (hälsouppgift), nekade följer aldrig med och väntande
    // ansökningar bara för den som får se dem (märkta "ansökt", preliminära). Godkänd ledighet visas som Borta i Outlook.
    'lp-franvaro-ics': (el) => {
      const st = kalLage(el.dataset.nyckel); const alla = (st.personer || []).map((id) => db().anvandare.find((x) => x.id === id)).filter(Boolean);
      const visa = st.vem !== 'alla' ? alla.filter((x) => x.id === st.vem) : alla; if (!visa.length) return;
      const fran = idag(); const slutDag = new Date(`${fran}T12:00:00`); slutDag.setFullYear(slutDag.getFullYear() + 1); const till = isoDag(slutDag);
      const esc = (x) => String(x || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (y) => `\\${y}`).replace(/\r?\n/g, '\\n');
      const vik = (rad) => { const ut = []; let r = rad; while (r.length > 60) { ut.push(r.slice(0, 60)); r = ` ${r.slice(60)}`; } ut.push(r); return ut.join('\r\n'); };
      const dag = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
      const dagEfter = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 1); return isoDag(d); };
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(36); };
      const flera = visa.length > 1 || visa[0].id !== jag();
      const handelser = [];
      const ny = ({ uid, start, slut, titel, text, borta = false, prelim = false }) => handelser.push(['BEGIN:VEVENT', `UID:${uid}@uperformance`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dag(start)}`, `DTEND;VALUE=DATE:${dag(dagEfter(slut))}`, `SUMMARY:${esc(titel)}`, text ? `DESCRIPTION:${esc(text)}` : '',
        prelim ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED', borta ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT', borta ? `X-MICROSOFT-CDO-BUSYSTATUS:${prelim ? 'TENTATIVE' : 'OOF'}` : '', 'END:VEVENT']);
      for (const p of visa) {
        for (const f of synligFranvaro(p)) {
          const s = fvStatus(f); const slut = f.till || f.fran;
          if (s === 'nekad' || slut < fran || f.fran > till || (s === 'ansokt' && !serFranvaro(p))) continue;
          const namn = f.typ === 'sjuk' && p.id !== jag() ? FRANVARANDE.namn : fvTyp(p, f).namn;
          ny({ uid: `fv-${f.id}`, start: f.fran < fran ? fran : f.fran, slut, titel: `${flera ? `${p.namn} – ` : ''}${namn}${s === 'ansokt' ? ' (ansökt)' : ''}`, text: s === 'ansokt' ? 'Ansökan väntar på godkännande.' : '', borta: true, prelim: s === 'ansokt' });
        }
      }
      for (const h of kalHandelser(visa, fran, till)) {
        if (!h.planerad || !['testdag', 'uppfoljning', 'mote'].includes(h.typ)) continue;
        const k = h.kundId ? kund(h.kundId) : null;
        ny({ uid: `${h.typ}-${dag(h.dag)}-${hash(`${h.vem}|${h.text}|${h.lank}`)}`, start: h.dag, slut: h.dag, titel: `${h.text}${flera ? ` – ${anv(h.vem).kort}` : ''}`, text: [KAL_TYP[h.typ].namn, k ? k.namn : '', `Ansvarig: ${anv(h.vem).namn}`].filter(Boolean).join('\n') });
      }
      if (!handelser.length) { toast('Ingen ledighet eller planerad testdag, uppföljning eller möte från idag och ett år framåt', null, 'kalender'); return; }
      const rader = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Uperformance//CRM//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(visa.length > 1 ? 'Uperformance – teamet' : `Uperformance – ${visa[0].namn}`)}`, ...handelser.flat(), 'END:VCALENDAR'].filter(Boolean).map(vik);
      const blob = new Blob([rader.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${visa.length > 1 ? 'Teamets kalender' : `Kalender ${visa[0].namn}`.replace(/[\\/:*?"<>|]/g, '')}.ics`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast(`Kalenderfilen är nedladdad (${plural(handelser.length, 'händelse', 'händelser')}) – öppna den i Outlook, Google eller Apple-kalendern`, null, 'kalender');
    },
    'lp-franvaro-bort': async (el) => {
      const u = db().anvandare.find((x) => x.id === el.dataset.id); if (!u) return;
      const f = (u.franvaro || []).find((x) => x.id === el.dataset.fid); if (!f) return;
      if (!(kanLeda() || (u.id === jag() && (fvStatus(f) === 'ansokt' || f.typ === 'sjuk')))) return;
      if (SKARP) {
        if (!(await sparaKonto(() => L.konto.taBortFranvaro(u.id, f.id), 'Frånvaron kunde inte tas bort.'))) return;
        raknaAnsokningar(); K.stangArk(); ritaSido(); rendera(); toast(u.id === jag() ? (fvStatus(f) === 'ansokt' ? 'Ansökan är återkallad' : 'Borttagen') : `Frånvaron för ${u.kort} är borttagen`, null, 'kalender');
        return;
      }
      u.franvaro = u.franvaro.filter((x) => x !== f);
      logga(`${mig().namn} tog bort frånvaron för ${u.namn} (${fvNamn(f)}).`, { typ: 'franvaro' });
      // Besked: personen när ledningen tar bort något i hens kalender, chefen när en ansökan återkallas
      if (u.id !== jag()) chattTill(u.id, `${mig().kort} tog bort ${fvNamn(f)} ur din kalender.`);
      else if (fvStatus(f) === 'ansokt') for (const c of chefer()) chattTill(c.id, `Jag återkallade min ansökan om ${fvNamn(f)}.`, { franvaro: { uid: u.id, fid: f.id } });
      raknaAnsokningar(); spara(); K.stangArk(); rendera(); ritaChatt(); toast(u.id === jag() ? (fvStatus(f) === 'ansokt' ? 'Ansökan är återkallad' : 'Borttagen') : `Frånvaron för ${u.kort} är borttagen – ${u.kort} har fått besked i chatten`, null, 'kalender');
    },
    'lp-logga-in-som': (el) => { if (!SKARP && K.bytAnvandare) K.bytAnvandare(el.dataset.id); },
  };
  const FORM = {
    'lp-schema': async (f, d) => {
      const u = db().anvandare.find((x) => x.id === f.dataset.id); if (!u || !kanLeda()) return;
      const nya = d.getAll('dag').map(Number).filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b);
      if (SKARP) {
        if (!(await sparaKonto(() => L.konto.andra(u.id, { arbetsdagar: nya }), 'Schemat kunde inte sparas.'))) return;
        K.stangArk(); rendera(); toast(`Schemat för ${u.kort}: ${schemaText(u).toLowerCase()}`, null, 'kalender'); return;
      }
      const fore = schemaText(u); u.arbetsdagar = nya;
      if (schemaText(u) !== fore) logga(`${mig().namn} ändrade arbetsdagarna för ${u.namn} till ${schemaText(u).toLowerCase()}.`);
      spara(); K.stangArk(); rendera(); toast(`Schemat för ${u.kort}: ${schemaText(u).toLowerCase()}`, null, 'kalender');
    },
    'lp-franvaro': async (f, d) => {
      const leda = kanLeda();
      const u = db().anvandare.find((x) => x.id === d.get('vem')); if (!u || (!leda && u.id !== jag())) return;
      const fran = String(d.get('fran') || ''); const till = String(d.get('till') || '') || fran; const typ = FRANVARO[d.get('typ')] ? d.get('typ') : 'ledig';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fran)) { K.visaFel(f, 'fran', 'Välj första dagen'); return; }
      if (till < fran) { K.visaFel(f, 'till', 'Sista dagen kan inte vara före den första'); return; }
      const fid = f.dataset.fid; const gammal = fid ? db().anvandare.flatMap((x) => x.franvaro || []).find((x) => x.id === fid) : null;
      const krock = (u.franvaro || []).find((x) => x.id !== fid && fvStatus(x) !== 'nekad' && x.fran <= till && fran <= (x.till || x.fran));
      if (krock) { K.visaFel(f, 'fran', `Krockar med ${FRANVARO[krock.typ].namn.toLowerCase()} ${periodText(krock)}`); return; }
      const nu = new Date().toISOString(); const ansokan = !leda && typ !== 'sjuk';
      const not = String(d.get('notering') || '').trim().slice(0, 60);
      // Skarpt läge: servern sätter status (ansökan eller godkänd) och beslutet – ingen aktivitet och ingen chatt
      if (SKARP) {
        const svar = await sparaKonto(() => L.konto.franvaro(u.id, { fid: fid || null, typ, fran, till, notering: not }), 'Frånvaron kunde inte sparas.', f);
        if (!svar) return;
        const ny = svar.franvaro || { typ, fran, till, status: ansokan ? 'ansokt' : 'godkand' };
        raknaAnsokningar(); K.stangArk(); ritaSido(); rendera();
        toast(ny.status === 'ansokt' ? 'Ansökan är skickad – försäljningschefen ser den under Försäljning' : `${u.id === jag() ? 'Du' : u.kort}: ${FRANVARO[typ].namn.toLowerCase()} ${periodText(ny)}`, null, ny.status === 'ansokt' ? 'skicka' : FRANVARO[typ].ikon);
        return;
      }
      // av = den som lade in frånvaron åt någon annan (som servern) – den är ingen ansökan och står inte under Mina ansökningar
      const post = { id: fid || nyId('fv'), typ, fran, till, status: ansokan ? 'ansokt' : 'godkand', skapad: (gammal && gammal.skapad) || nu, ...(leda ? { beslutAv: jag(), beslutTid: nu } : {}), ...(leda && u.id !== jag() ? { av: jag() } : {}) };
      if (not) post.notering = not;
      for (const x of db().anvandare) x.franvaro = (x.franvaro || []).filter((y) => y.id !== post.id);
      u.franvaro = [...(u.franvaro || []), post];
      const ref = { franvaro: { uid: u.id, fid: post.id } };
      // Ansökan (med kortet Godkänn/Neka) till cheferna; lägger ledningen in eller ändrar något åt någon annan får personen besked
      if (!leda) for (const c of chefer()) chattTill(c.id, `${typ === 'sjuk' ? 'Sjukanmälan' : fid ? 'Ändrad ansökan' : 'Ansökan'}: ${fvNamn(post)}${not ? ` – ${not}` : ''}.`, ref);
      else if (u.id !== jag()) chattTill(u.id, `${gammal ? `${mig().kort} har ändrat din frånvaro till` : `${mig().kort} har lagt in`} ${fvNamn(post)} åt dig${not ? ` – ${not}` : ''}.${gammal && fvStatus(gammal) === 'ansokt' ? ' Din ansökan är därmed godkänd.' : ''} Den syns i din kalender.`, ref);
      logga(`${mig().namn} ${ansokan ? 'ansökte om' : fid ? 'ändrade frånvaron till' : 'lade in'} ${fvNamn(post)}${u.id !== jag() ? ` för ${u.namn}` : ''}.`, { typ: 'franvaro' });
      raknaAnsokningar(); spara(); K.stangArk(); rendera(); ritaChatt();
      toast(ansokan ? 'Ansökan är skickad – chefen får den i chatten' : `${u.id === jag() ? 'Du' : u.kort}: ${fvNamn(post)}${u.id !== jag() ? ` – ${u.kort} har fått besked i chatten` : ''}`, null, ansokan ? 'skicka' : FRANVARO[typ].ikon);
    },
    // Neka med ett valfritt skäl (arket från nekaArk)
    'lp-fv-neka': async (f, d) => {
      const u = db().anvandare.find((x) => x.id === f.dataset.id); const fv = u && (u.franvaro || []).find((x) => x.id === f.dataset.fid);
      if (!fv || !kanLeda() || u.id === jag()) { K.stangArk(); return; }
      if (fvStatus(fv) !== 'ansokt') { K.stangArk(); redanBeslutad(fv); return; }
      const skal = String(d.get('skal') || '').trim().replace(/\s+/g, ' ').slice(0, 200);
      await fattaBeslut(u, fv, 'nekad', { skal, fokus: f.dataset.fokus || null });
    },
    'lp-status': async (f, d) => {
      const u = mig(); const kod = d.get('kod') || 'online';
      const status = { kod, text: String(d.get('text') || '').trim().slice(0, 60), till: kod === 'online' ? null : tillTid(d.get('till')) };
      if (!status.text) delete status.text; if (!status.till) delete status.till;
      let ny = null; let jagNu = u;
      if (SKARP) {
        const fore = new Set((u.franvaro || []).map((x) => x.id));
        if (!(await sparaKonto(() => L.konto.andra(u.id, { status }), 'Statusen kunde inte sparas.', f))) return;
        jagNu = mig(); ny = nyAutoRad(jagNu, fore); raknaAnsokningar();
      } else { u.status = status; ny = statusFranvaro(u, kod); spara(); }
      K.stangArk(); ritaSido(); rendera(); statusToast(jagNu, kod, ny);
    },
    'lp-profil': async (f, d) => {
      const u = db().anvandare.find((x) => x.id === f.dataset.id); if (!u || !kanAndra(u)) return;
      const namn = String(d.get('namn') || '').trim(); if (!namn) { K.visaFel(f, 'namn', 'Skriv namnet'); return; }
      // Skarpt läge: titel, telefon, presentation och bild till servern; namnet (bara administratören) via admin-API:t
      if (SKARP) {
        const andring = { titel: String(d.get('titel') || '').trim(), tel: String(d.get('tel') || '').trim(), om: String(d.get('om') || '').trim().slice(0, 400), bild: d.get('bild') || null };
        if (!(await sparaKonto(() => L.konto.andra(u.id, andring), 'Profilen kunde inte sparas.', f))) return;
        if (namn !== u.namn && arAdm(mig())) { const s2 = await L.admin.uppdatera(u.id, { namn }); if (!s2.ok && s2.status !== 401) toast(kontoFel(s2, 'Namnet kunde inte ändras.'), null, 'varning'); }
        K.stangArk(); K.fyllAnvandarval(); rendera(); toast(u.id === jag() ? 'Din profil är sparad' : `Profilen för ${u.namn} är sparad`);
        return;
      }
      const epost = String(d.get('epost') || '').trim(); if (epost && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) { K.visaFel(f, 'epost', 'E-postadressen ser inte rätt ut'); return; }
      if (epost && db().anvandare.some((x) => x.id !== u.id && String(x.epost || '').toLowerCase() === epost.toLowerCase())) { K.visaFel(f, 'epost', 'Någon annan i teamet har den adressen'); return; }
      Object.assign(u, { namn, kort: namn.split(/\s+/)[0], initialer: K.initialer(namn), titel: String(d.get('titel') || '').trim(), epost, tel: String(d.get('tel') || '').trim(), om: String(d.get('om') || '').trim().slice(0, 400), bild: d.get('bild') || null });
      if (kanLeda() && u.roll !== 'admin' && d.get('roll')) {
        const fore = roller(u).join(' · ');
        u.roll = d.get('roll') === 'test' ? 'test' : 'salj'; u.chef = d.get('chef') === 'on';
        if (arAdm(mig())) u.admin = d.get('admin') === 'on';
        if (roller(u).join(' · ') !== fore) logga(`${mig().namn} ändrade rollerna för ${u.namn}: ${roller(u).join(', ')}.`);
        if (u.id === jag() && !kanLeda()) location.hash = '#/';
      }
      spara(); K.stangArk(); K.fyllAnvandarval(); rendera(); toast(u.id === jag() ? 'Din profil är sparad' : `Profilen för ${u.namn} är sparad`);
    },
    'lp-ny-anstalld': (f, d) => {
      if (!kanLeda()) return;
      const namn = String(d.get('namn') || '').trim(); const epost = String(d.get('epost') || '').trim();
      if (!namn) { K.visaFel(f, 'namn', 'Skriv namnet'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) { K.visaFel(f, 'epost', 'Skriv en giltig e-postadress'); return; }
      if (db().anvandare.some((x) => String(x.epost || '').toLowerCase() === epost.toLowerCase())) { K.visaFel(f, 'epost', 'Det finns redan ett konto med den adressen'); return; }
      const roll = d.get('roll') === 'test' ? 'test' : 'salj';
      const u = { id: nyId('u'), namn, kort: namn.split(/\s+/)[0], initialer: K.initialer(namn), roll, chef: d.get('chef') === 'on', admin: arAdm(mig()) && d.get('admin') === 'on',
        titel: String(d.get('titel') || '').trim() || (roll === 'test' ? 'Testteam' : 'Säljare'), epost, tel: String(d.get('tel') || '').trim(), mal: roll === 'salj' ? Math.max(0, +d.get('mal') || 0) : 0,
        start: d.get('start') || idag(), bild: d.get('bild') || null, status: { kod: 'online' }, skapad: new Date().toISOString(), skapadAv: jag() };
      db().anvandare.push(u);
      logga(`${mig().namn} lade till ${u.namn} i teamet (${roller(u).join(', ')}).`);
      spara(); K.stangArk(); K.fyllAnvandarval(); location.hash = `#/profil/${u.id}`;
      toast(`${u.namn} är tillagd i teamet`, `#/profil/${u.id}`, 'anvandare-plus');
    },
    'lp-mal': async (f, d) => {
      let n = 0;
      if (SKARP) {
        // Ett anrop per säljare vars mål ändrats – servern kontrollerar att den som sparar leder teamet
        for (const [k, v] of [...d.entries()]) {
          if (!k.startsWith('mal-')) continue; const u = db().anvandare.find((x) => x.id === k.slice(4)); if (!u) continue;
          const m = Math.max(0, Math.round(+v || 0)); if ((u.mal || 0) === m) continue;
          if (!(await sparaKonto(() => L.konto.andra(u.id, { mal: m }), `Målet för ${u.kort} kunde inte sparas.`))) { rendera(); return; }
          n++;
        }
        K.stangArk(); rendera(); toast(n ? 'Målen är sparade' : 'Inga ändringar', null, 'mal'); return;
      }
      for (const [k, v] of d.entries()) { if (!k.startsWith('mal-')) continue; const u = db().anvandare.find((x) => x.id === k.slice(4)); if (!u) continue; const m = Math.max(0, Math.round(+v || 0)); if ((u.mal || 0) !== m) { u.mal = m; n++; } }
      if (n) logga(`${mig().namn} uppdaterade säljmålen.`);
      spara(); K.stangArk(); rendera(); toast(n ? 'Målen är sparade' : 'Inga ändringar', null, 'mal');
    },
    'lp-uppgift': (f, d) => {
      const text = String(d.get('text') || '').trim(); if (!text) { K.visaFel(f, 'text', 'Skriv uppgiften'); return; }
      const a = db().affarer.find((x) => x.id === d.get('affarId'));
      const u = anv(f.dataset.id);
      db().todos.push({ id: nyId('t'), text, kundId: a ? a.kundId : null, affarId: a ? a.id : null, ansvarig: u.id, datum: d.get('datum') || idag(), klar: false, fran: jag() });
      spara(); K.stangArk(); rendera(); toast(`Uppgiften ligger hos ${u.kort}`, null, 'todo');
    },
    'lp-fordela': (f, d) => {
      const a = db().affarer.find((x) => x.id === f.dataset.affar); const ny = d.get('ansvarig'); if (!a || !ny) return;
      const fore = a.ansvarig; if (fore === ny) { K.stangArk(); return; }
      a.ansvarig = ny;
      logga(`${mig().namn} fördelade affären till ${anv(ny).namn}${fore ? ` (från ${anv(fore).namn})` : ''}.`, { kundId: a.kundId, affarId: a.id });
      if (d.get('pamin') === 'on') db().todos.push({ id: nyId('t'), text: `Ta över ${a.titel} – fördelad av ${mig().kort}`, kundId: a.kundId, affarId: a.id, ansvarig: ny, datum: idag(), klar: false });
      spara(); K.stangArk(); rendera(); toast(`${a.titel} ligger nu hos ${anv(ny).kort}`, `#/affar/${a.id}`, 'flytta');
    },
  };

  /* 09-vägar ---------------------------------------------------------------------------------------- */
  const vagar = [
    [/^#\/chef$/, visaChef, 'chef', 'Försäljningsledning'],
    [/^#\/profil$/, () => visaProfil(null), 'profil', 'Min profil'],
    [/^#\/profil\/([\w-]+)$/, (id) => visaProfil(id), 'profil', 'Profil', (id) => (anv(id) || {}).namn || 'Profil'],
  ];
  return { vagar, G, FORM, ritaSido, avatarHtml, kontoListaHtml, stangKonto, narvaro, statusText, roller, arChef, arAdm, kanLeda, stat, saljare, aktivText, arAktivNu, vidKontoAndring, nyInloggning, doljTid, navTill, franvaroKort };
};
