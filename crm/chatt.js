/* Uperformance CRM – chatten (#/chatt, #/chatt/<id>), 2026-10-23.
   Privata samtal och grupper mellan kollegorna: skriv, reagera, ändra eller ta bort det egna, bifoga filer och bilder (gemet, dra och släpp eller klistra in –
   varje fil går genom filskannern först), emoji, bjud in fler till en grupp, byt namn och lämna. Olästa räknas per konto (även i
   fliktiteln); när något nytt kommer till dig plingar det mjukt (WebAudio, går att stänga av) och kontokortet i sidomenyn lyser upp
   med avsändaren och texten – ett klick på kortet då öppnar samtalet. Valfritt: avisering på skrivbordet när fliken inte syns.
   Data i db.chatt { kanaler, meddelanden, last, tyst } i demoläget
   (localStorage, flikarna synkar). Bilder sparas nedskalade (JPEG), dokument upp till 900 kB sparas i datan (tak 2,5 MB för alla
   chattfiler), större filer finns bara under sessionen. Skarp version: kräver stöd i servern (samlingen chatt, filer med
   antivirus på servern) – chatten visas inte i skarpt läge än. Laddas före crm.js; crm.js anropar window.UPChatt(K, LED). */
window.UPChatt = (K, LED) => {
  'use strict';
  const { e, ik, sum, plural, oppnaArk, arkHuvud, bekrafta, toast, relTid, nyId, $, $$, SKARP, anv, arAktiv, spara, rendera } = K;
  const db = () => K.db;
  const jag = () => K.jag;
  const mig = () => anv(jag());
  const av = (u, storlek = 'm', narv = true) => (LED ? LED.avatarHtml(u, { storlek, narv }) : `<span class="avatar">${e(u.initialer || '?')}</span>`);
  const C = () => { const d = db(); if (!d.chatt) d.chatt = {}; const c = d.chatt; c.kanaler = c.kanaler || []; c.meddelanden = c.meddelanden || []; c.last = c.last || {}; c.tyst = c.tyst || {}; return c; };
  const kanal = (id) => C().kanaler.find((k) => k.id === id);
  const arMedlem = (k, uid = jag()) => !!k && (k.medlemmar || []).includes(uid);
  const minaKanaler = () => C().kanaler.filter((k) => arMedlem(k));
  const iKanal = (kid) => C().meddelanden.filter((m) => m.kanal === kid).sort((a, b) => (a.tid < b.tid ? -1 : 1));
  const senast = (kid) => { const l = iKanal(kid); return l[l.length - 1] || null; };
  const lastTill = (kid, uid = jag()) => (C().last[uid] || {})[kid] || '';
  const olasta = (kid) => iKanal(kid).filter((m) => !m.system && m.av !== jag() && m.tid > lastTill(kid)).length;
  const olastaTotalt = () => sum(minaKanaler().map((k) => olasta(k.id)));
  const motpart = (k) => (k.typ === 'privat' ? anv((k.medlemmar || []).find((x) => x !== jag()) || jag()) : null);
  const kanalNamn = (k) => (k.typ === 'grupp' ? k.namn || 'Grupp' : motpart(k).namn);
  const markeraLast = (kid) => { const c = C(); c.last[jag()] = { ...(c.last[jag()] || {}), [kid]: new Date().toISOString() }; };
  const tystad = (kid) => (C().tyst[jag()] || []).includes(kid);
  const klocka = (iso) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const lokalDag = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dagRubrik = (iso) => { const d = lokalDag(iso); if (d === K.idag()) return 'Idag'; if (d === K.omDagar(-1)) return 'Igår'; return new Date(iso).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }); };
  const listTid = (iso) => { const d = lokalDag(iso); if (d === K.idag()) return klocka(iso); if (d === K.omDagar(-1)) return 'Igår'; if (Date.now() - Date.parse(iso) < 6 * 864e5) return new Date(iso).toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', ''); return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', ''); };
  const storlek = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString('sv-SE')} kB`);
  const ui = { sok: '', info: false, emoji: false, emojiFlik: 0, bilagor: [], utkast: {}, nya: new Set(), senastKanal: null, svar: null, olastFran: {}, markor: null, andrar: null, saknas: null };
  const reducerad = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // pekskärm: ingen hovring – raden med reaktioner och åtgärder visas när man trycker på ett meddelande
  const pekskarm = () => matchMedia('(hover: none), (pointer: coarse)').matches;
  const rita = () => { if (paChattSidan()) rendera(); ritaFonster(); };
  const sessionFiler = new Map(); // fil-id → URL för filer som bara finns under sessionen
  const lasHjalte = (titel, text) => `<section class="sidhjalte" data-sidhjalte data-mork-yta><div class="sidhjalte-text"><span class="sidhjalte-ogon"><i class="live" aria-hidden="true"></i>Meddelanden</span><h1>${e(titel)}</h1><p class="sidhjalte-ingress">${e(text)}</p><div class="sidhjalte-knappar"><a class="knapp knapp-accent" href="#/">Till översikten</a></div></div></section>`;

  /* 01-texten: länkar, @namn och radbrytningar; meddelanden med bara emoji visas stort */
  const BARA_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;
  // länkarna hittas i råtexten (inte i den escapade), och varje bit escapas för sig: ett citattecken efter adressen följer inte med,
  // och en [[kund:id]] kan aldrig hamna inuti en adress (hakparentes avslutar adressen)
  const URL_RE = /\bhttps?:\/\/[^\s<>"'\[\]]+[^\s<>"'\[\].,;:!?)]/g;
  const formatera = (text) => {
    const radtext = String(text ?? ''); let ut = ''; let i = 0;
    for (const m of radtext.matchAll(URL_RE)) { ut += formateraBit(radtext.slice(i, m.index)); ut += `<a href="${e(m[0])}" target="_blank" rel="noopener noreferrer">${e(m[0])}</a>`; i = m.index + m[0].length; }
    return (ut + formateraBit(radtext.slice(i))).replace(/\n/g, '<br>');
  };
  const formateraBit = (bit) => e(bit)
    .replace(/(^|\s)@([A-ZÅÄÖ][\wåäöÅÄÖ-]+)/g, (m, f, n) => `${f}<span class="ch-omn${mig() && n.toLowerCase() === String(mig().kort || '').toLowerCase() ? ' ch-omn-mig' : ''}">@${n}</span>`)
    .replace(OBJ, (m, typ, id) => { const o = objekt(typ, id); return o ? `<a class="ch-obj" href="${e(o.href)}" data-typ="${typ}">${ik(o.ikon)}<span><b>${e(o.namn)}</b>${o.under ? `<small>${e(o.under)}</small>` : ''}</span></a>` : '<span class="ch-obj ch-obj-borta">Borttagen</span>'; });
  /* 01b-smart: @ nämner en kollega, # länkar en kund eller affär – i texten som [[kund:id]] / [[affar:id]] så att länken följer med
     om namnet ändras – och snabbsvar på det senaste meddelandet. Allt räknas här i webbläsaren, inget skickas någonstans. */
  const OBJ = /\[\[(kund|affar):([\w-]+)\]\]/g;
  const objekt = (typ, id) => {
    const d = db();
    if (typ === 'kund') { const x = (d.kunder || []).find((y) => y.id === id); return x ? { namn: x.namn, href: `#/kund/${x.id}`, ikon: x.typ === 'klubb' ? 'klubb' : 'kunder', under: x.typ === 'klubb' ? 'Klubb' : x.stad || x.bransch || 'Kund' } : null; }
    const a = (d.affarer || []).find((y) => y.id === id); if (!a) return null;
    const ku = (d.kunder || []).find((y) => y.id === a.kundId); return { namn: a.titel || 'Affär', href: `#/affar/${a.id}`, ikon: 'salj', under: ku ? `Affär · ${ku.namn}` : 'Affär' };
  };
  const klartext = (t) => String(t || '').replace(OBJ, (m, typ, id) => { const o = objekt(typ, id); return o ? `#${o.namn}` : '#borttagen'; });
  const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namnerMig = (m) => !!(m && m.text && mig() && mig().kort) && new RegExp(`(^|\\s)@${escRe(mig().kort)}(?![\\wåäöÅÄÖ])`, 'i').test(m.text);
  // snabbsvar: tre förslag på det senaste meddelandet när det är någon annans (enkla regler på svenska – man ändrar innan man skickar)
  function snabbsvar(k) {
    const l = iKanal(k.id).filter((m) => !m.system && !m.borttagen); const sista = l[l.length - 1];
    if (!sista || sista.av === jag()) return [];
    const t = klartext(sista.text).toLowerCase(); const namn = (anv(sista.av) || {}).kort || '';
    if ((sista.filer || []).length && !t.trim()) return ['Tack, jag tittar på det', 'Fick filen 👍', 'Perfekt, tack!'];
    if (/\btack(ar|ade)?\b/.test(t)) return ['Varsågod!', 'Inga problem 👍', 'Kul att det hjälpte'];
    if (t.includes('?')) return /vill du|kan du|ska vi|hinner du|har du tid|kan vi|vill ni/.test(t) ? ['Ja, gärna!', 'Jag kollar och återkommer', 'Tyvärr inte den här gången'] : ['Bra fråga – jag kollar', 'Ja, det stämmer', 'Nej, inte än'];
    if (/bokad|bokat|klar|klart|signerad|signerat|skickat|skickar|fixat|lagt in|godkänd|godkänt|vunnit|vann|kör vi/.test(t)) return ['Toppen, tack!', 'Snyggt jobbat 🙌', 'Perfekt!'];
    return ['👍', 'Tack!', namn ? `Jag återkommer, ${namn}` : 'Jag återkommer'];
  }
  const EMOJI = [
    ['Vanliga', '😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 😎 🤩 🥳 😅 😂 🤣 😇 🤔 🤗 🙌 👏 👍 👎 👌 ✌️ 🤞 💪 🙏 👋 🫶'],
    ['Känslor', '😮 😯 😲 😳 🥺 😢 😭 😤 😡 😴 🤯 😬 🙈 🤝 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✨ 🔥 ⭐ 🎉 🎊 🌟 💥'],
    ['Jobb', '📅 📌 📎 📝 📄 📊 📈 📉 💼 💰 💳 🧾 📞 📱 💻 🖥️ ⏰ ✅ ☑️ ❌ ⚠️ ❓ ❗ 🚀 🎯 🏆 🥇 🤖 🔒 📣'],
    ['Hälsa & sport', '⚽ 🏒 🏃 🚴 🏋️ 🤸 🧘 🥗 🍎 💧 ☕ 🍰 🩺 💊 🫀 🫁 🧠 😷 🤒 🌞 🌧️ ❄️ 🌈 🏖️ ✈️ 🚗 🏠 🏢 🍕 🎂'],
  ];
  const SNABB = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

  /* 02-vyn: samtalen till vänster, tråden i mitten, om samtalet till höger (fälls ut) */
  const gruppAvatar = (k, storlekKlass = '') => { const m = (k.medlemmar || []).filter((x) => x !== jag()).map(anv).slice(0, 2);
    return `<span class="ch-gruppav${storlekKlass ? ` ch-gruppav-${storlekKlass}` : ''}" data-n="${m.length}" aria-hidden="true">${m.map((u) => av(u, 's', false)).join('')}</span>`; };
  function visaChatt(id) {
    if (SKARP) return lasHjalte('Chatten kommer i den skarpa versionen', 'Chatten finns i demoläget. Den skarpa versionen behöver stöd i servern – meddelanden och filer med virusskanning på servern – innan den slås på.');
    if (!mig() || !mig().id) return lasHjalte('Meddelanden', 'Logga in för att se dina samtal.');
    const mina = minaKanaler().map((k) => ({ k, s: senast(k.id) })).sort((a, b) => ((b.s ? b.s.tid : b.k.skapad || '') > (a.s ? a.s.tid : a.k.skapad || '') ? 1 : -1));
    const bred = matchMedia('(min-width: 860px)').matches;
    let k = id ? kanal(id) : null;
    if (k && !arMedlem(k)) k = null;
    // En länk till ett samtal som inte finns (borttaget, fel adress eller någon annans): en rad överst i listan säger det, och på bred
    // skärm öppnas det senaste samtalet i stället – adressen byts utan ett nytt steg i historiken. Raden står kvar tills man väljer
    // ett annat samtal eller stänger den.
    if (id && !k) {
      ui.saknas = { id, visas: null };
      if (bred && mina.length) { k = mina[0].k; ui.saknas.visas = k.id; try { history.replaceState(history.state, '', `#/chatt/${k.id}`); } catch (err) { /* ok */ } }
    } else if (ui.saknas && (k ? k.id : null) !== ui.saknas.visas && !(!id && bred && mina.length && mina[0].k.id === ui.saknas.visas)) ui.saknas = null;
    if (!k && !id && bred && mina.length) k = mina[0].k;
    // läget i tråden före omritningen: var man längst ned följer tråden med, annars står den kvar
    const gammal = $('[data-ch-floede]'); const nyKanal = !gammal || gammal.dataset.kanal !== (k && k.id);
    if (k && ui.senastKanal !== k.id) { ui.emoji = false; ui.bilagor = []; ui.svar = null; ui.olastFran = {}; ui.markor = null; slappAndring(); }
    if (k && olasta(k.id)) { ui.olastFran[k.id] = lastTill(k.id) || '0'; markeraLast(k.id); spara(); setTimeout(uppdateraRaknare, 0); }
    else if (k && nyKanal) delete ui.olastFran[k.id]; // öppnas samtalet igen utan nya meddelanden: ingen gammal linje
    const varNere = nyKanal || gammal.scrollHeight - gammal.scrollTop - gammal.clientHeight < 80; const topp = gammal ? gammal.scrollTop : 0;
    ui.senastKanal = k ? k.id : null;
    requestAnimationFrame(() => efterRitning(varNere, topp, nyKanal));
    const sok = ui.sok.trim().toLowerCase();
    const listan = mina.filter(({ k: x }) => !sok || kanalNamn(x).toLowerCase().includes(sok) || iKanal(x.id).some((m) => klartext(m.text).toLowerCase().includes(sok)));
    const rad = ({ k: x, s }) => {
      const n = olasta(x.id); const p = motpart(x); const vald = k && x.id === k.id;
      const forh = !s ? 'Inga meddelanden än' : s.system ? s.text : `${s.av === jag() ? 'Du: ' : x.typ === 'grupp' ? `${anv(s.av).kort}: ` : ''}${klartext(s.text) || ((s.filer || [])[0] ? ((s.filer[0].typ || '').startsWith('image/') ? 'Skickade en bild' : `Skickade ${s.filer[0].namn}`) : '')}`;
      return `<a class="ch-rad${vald ? ' ch-rad-vald' : ''}${n ? ' ch-rad-olast' : ''}" href="#/chatt/${e(x.id)}"${vald ? ' aria-current="page"' : ''}>
        ${x.typ === 'grupp' ? gruppAvatar(x) : av(p, 'm')}
        <span class="ch-rad-text"><span class="ch-rad-topp"><strong>${e(kanalNamn(x))}</strong><small>${s ? e(listTid(s.tid)) : ''}</small></span>
          <span class="ch-rad-under"><span class="ch-forh">${e(forh)}</span>${n && iKanal(x.id).some((m) => !m.system && m.av !== jag() && m.tid > lastTill(x.id) && namnerMig(m)) ? '<b class="ch-bricka ch-bricka-omn" title="Du är nämnd">@</b>' : ''}${n ? `<b class="ch-bricka">${n}</b>` : tystad(x.id) ? `<span class="ch-tystad" title="Ljudet av">${ik('ljud-av')}</span>` : ''}</span></span></a>`;
    };
    const ljudAv = (() => { try { return localStorage.getItem('up-crm-pling') === 'av'; } catch (err) { return false; } })();
    const avis = aviseringLage();
    const lista = `<aside class="ch-lista" aria-label="Samtal">
        <header class="ch-lista-topp"><div class="ch-lista-titel"><h1>Meddelanden</h1><small>${olastaTotalt() ? plural(olastaTotalt(), 'oläst', 'olästa') : 'Allt är läst'}</small></div>
          <div class="ch-lista-knappar"><button type="button" class="ch-ikonknapp ch-ljudknapp" data-g="ch-pling" aria-pressed="${!ljudAv}" title="${ljudAv ? 'Plinget är av – klicka för att slå på' : 'Plinget är på – klicka för att stänga av'}">${ik(ljudAv ? 'ljud-av' : 'ljud')}</button><button type="button" class="ch-ikonknapp ch-ljudknapp" data-g="chf-minimera-sida" title="Minimera – chatten blir en ikon och följer med mellan sidorna" aria-label="Minimera chatten">${ik('minimera')}</button><button type="button" class="ch-ny" data-g="ch-ny" title="Nytt samtal">${ik('plus')}<span>Nytt</span></button></div></header>
        ${ui.saknas ? `<p class="ch-saknas" role="status"><span class="ch-saknas-ikon">${ik('info')}</span><span><strong>Samtalet finns inte längre</strong><small>Eller så är du inte med i det.${k ? ' Här visas ditt senaste samtal.' : ''}</small></span><button type="button" data-g="ch-saknas-bort" aria-label="Stäng beskedet">${ik('stang')}</button></p>` : ''}
        <label class="ch-sok">${ik('sok')}<input type="search" placeholder="Sök i samtalen …" value="${e(ui.sok)}" data-ch-sok aria-label="Sök i samtalen"></label>
        ${sok ? '' : `<div class="ch-team-ram">${teamRad()}</div>`}
        <nav class="ch-rader">${listan.map(rad).join('') || `<p class="ch-lista-tom">${sok ? 'Inget samtal matchar.' : 'Inga samtal än – starta ett med Nytt.'}</p>`}</nav>
        ${avis === 'saknas' || pekskarm() ? '' : `<button type="button" class="ch-avis-rad" data-g="ch-avisera" role="switch" aria-checked="${avis === 'pa'}"${avis === 'blockerad' ? ' data-blockerad' : ''} title="${e(AVIS_TITEL[avis])}"><span class="ch-avis-ikon">${ik(avis === 'pa' ? 'bjallra' : 'bjallra-av')}</span><span class="ch-avis-text"><strong>Avisering på skrivbordet</strong><small>${e(AVIS_UNDER[avis])}</small></span><i class="chf-vaxel" aria-hidden="true"></i></button>`}
        <div class="chf-tips ch-lista-tips"><span class="chf-tips-ikon">${ik('glodlampa')}</span><span><strong>Tips</strong><small>${pekskarm() ? 'Bifoga filer och bilder med gemet – de virusskannas först. Tryck på ett meddelande för att svara, reagera eller ändra det.' : 'Dra in eller klistra in filer i ett samtal – de virusskannas först. Håll musen över ett meddelande för att svara, reagera eller ändra ditt eget.'} Knappen med minus gör chatten till en ikon som följer med dig.</small></span></div>
      </aside>`;
    const trad = k ? tradHtml(k) : `<div class="ch-tom">${K.emo ? K.emo('prat', { ruta: true }) : ik('prat')}<h2>${mina.length ? 'Välj ett samtal' : 'Starta ditt första samtal'}</h2><p>Skriv privat till en kollega eller samla flera i en grupp. Filer och bilder virusskannas innan de skickas.</p><button type="button" class="knapp knapp-accent" data-g="ch-ny">${ik('plus')}Nytt samtal</button></div>`;
    return `<section class="ch-rum" data-ch-rum data-mork-yta${k ? ' data-oppen' : ''}${k && ui.info ? ' data-info' : ''}>
      ${lista}
      <div class="ch-trad"${k ? ` data-ch-slapp data-kanal="${e(k.id)}"` : ''}>${trad}</div>
      ${k && ui.info ? infoHtml(k) : ''}
    </section>`;
  }
  function floedeHtml(k) {
    const lista = iKanal(k.id); const p = motpart(k); const medl = (k.medlemmar || []).map(anv);
    const motLast = p ? lastTill(k.id, p.id) : '';
    const lastId = p ? ((lista.filter((m) => m.av === jag() && !m.system && m.tid <= motLast).pop()) || {}).id : null;
    let html = ''; let dag = ''; let nyLinje = false; const olastFran = ui.olastFran[k.id];
    lista.forEach((m, i) => {
      const d = lokalDag(m.tid); if (d !== dag) { dag = d; html += `<div class="ch-dag"><span>${e(dagRubrik(m.tid))}</span></div>`; }
      if (!nyLinje && olastFran && m.tid > olastFran && m.av !== jag() && !m.system) { nyLinje = true; html += '<div class="ch-nya-linje" role="separator"><span>Nya meddelanden</span></div>'; }
      html += meddelandeHtml(m, lista[i - 1], lista[i + 1], k, lastId);
    });
    // början av samtalet: medlemmarnas bilder bredvid varandra med ett mjukt sken bakom (inget som snurrar)
    const bilder = k.typ === 'grupp' ? medl.slice(0, 5) : [p];
    const start = `<div class="ch-start"><span class="ch-start-bilder">${bilder.map((u) => av(u, 'l', false)).join('')}${k.typ === 'grupp' && medl.length > 5 ? `<b>+${medl.length - 5}</b>` : ''}</span><strong>${e(kanalNamn(k))}</strong><small>${k.typ === 'grupp' ? `${e(medl.map((u) => u.kort).join(', '))} · skapad ${e(relTid(k.skapad))}` : 'Början på ert samtal'}</small></div>`;
    return `<div class="ch-floede" data-ch-floede data-kanal="${e(k.id)}" role="log" aria-live="polite" aria-label="Meddelanden">${start}${html}</div>`;
  }
  function tradHtml(k) {
    const p = motpart(k); const medl = (k.medlemmar || []).map(anv);
    const under = k.typ === 'privat' ? (LED ? LED.statusText(p) : p.titel || '') : `${plural(medl.length, 'medlem', 'medlemmar')} · ${medl.filter((u) => u.id !== jag() && LED && LED.arAktivNu(u)).length} aktiva nu`;
    return `<header class="ch-trad-topp">
        <a class="ch-tillbaka" href="#/chatt" aria-label="Alla samtal">${ik('pil-v')}</a>
        ${k.typ === 'grupp' ? `<span class="ch-stapel" aria-hidden="true">${medl.filter((x) => x.id !== jag()).slice(0, 4).map((x) => av(x, 's')).join('')}${medl.length > 5 ? `<b>+${medl.length - 5}</b>` : ''}</span>` : `<a href="#/profil/${e(p.id)}" class="ch-topp-av" aria-label="Profilen för ${e(p.namn)}">${av(p, 'm')}</a>`}
        <div class="ch-trad-namn"><strong>${e(kanalNamn(k))}</strong><small>${e(under)}</small></div>
        <div class="ch-trad-knappar">
          ${k.typ === 'grupp' ? `<button type="button" class="ch-ikonknapp ch-tk-extra" data-g="ch-bjud" data-id="${e(k.id)}" title="Bjud in fler">${ik('anvandare-plus')}</button>` : ''}
          <button type="button" class="ch-ikonknapp ch-tk-extra" data-g="ch-tyst" data-id="${e(k.id)}" aria-pressed="${tystad(k.id)}" title="${tystad(k.id) ? 'Slå på ljudet för samtalet' : 'Stäng av ljudet för samtalet'}">${ik(tystad(k.id) ? 'ljud-av' : 'ljud')}</button>
          <button type="button" class="ch-ikonknapp" data-g="ch-info" aria-pressed="${ui.info}" title="Om samtalet">${ik('info')}</button>
          <button type="button" class="ch-ikonknapp ch-tk-extra" data-g="chf-popout" data-id="${e(k.id)}" title="Öppna som flytande fönster som följer med mellan sidorna">${ik('helskarm-ut')}</button>
          <button type="button" class="ch-ikonknapp ch-tk-extra" data-g="chf-minimera-sida" data-id="${e(k.id)}" title="Minimera – chatten blir en ikon och följer med mellan sidorna" aria-label="Minimera chatten">${ik('minimera')}</button>
          ${tradMenyHtml(k)}
        </div></header>
      ${floedeHtml(k)}
      <button type="button" class="ch-ner" data-g="ch-ner" hidden aria-label="Till senaste meddelandet">${ik('chevron')}</button>
      ${skrivHtml(k)}
      <div class="ch-slapp-lager" aria-hidden="true"><span>${ik('uppladdning')}</span><strong>Släpp för att bifoga</strong><small>Filerna virusskannas innan de skickas</small></div>`;
  }
  // Smal skärm (< 860 px): bjud in, ljudet, eget fönster och minimera i en meny bakom Fler val – annars trycks samtalets namn ihop
  // till några bokstäver. Menyn öppnas och stängs utan omritning (G['ch-trad-meny']); valen är samma handlare som knapparna.
  function tradMenyHtml(k) {
    const t = tystad(k.id);
    return `<div class="ch-tk-mer-ram"><button type="button" class="ch-ikonknapp ch-tk-mer" data-g="ch-trad-meny" aria-haspopup="menu" aria-expanded="false" title="Fler val" aria-label="Fler val för samtalet">${ik('mer')}</button>
      <div class="ch-tk-meny" role="menu" aria-label="Fler val" data-mork-yta hidden>
        ${k.typ === 'grupp' ? `<button type="button" role="menuitem" data-g="ch-bjud" data-id="${e(k.id)}">${ik('anvandare-plus')}<span>Bjud in fler</span></button>` : ''}
        <button type="button" role="menuitemcheckbox" aria-checked="${!t}" data-g="ch-tyst" data-id="${e(k.id)}">${ik(t ? 'ljud-av' : 'ljud')}<span>Ljud för samtalet<small>${t ? 'Av – inget pling härifrån' : 'På'}</small></span></button>
        <button type="button" role="menuitem" data-g="chf-popout" data-id="${e(k.id)}">${ik('helskarm-ut')}<span>Öppna som fönster<small>Följer med mellan sidorna</small></span></button>
        <button type="button" role="menuitem" data-g="chf-minimera-sida" data-id="${e(k.id)}">${ik('minimera')}<span>Minimera till en ikon</span></button>
      </div></div>`;
  }
  function stangTradMeny(fokus = false) {
    $$('.ch-tk-meny:not([hidden])').forEach((m) => { m.hidden = true; const b = m.parentElement && $('.ch-tk-mer', m.parentElement); if (b) { b.setAttribute('aria-expanded', 'false'); if (fokus) b.focus({ preventScroll: true }); } });
  }
  function meddelandeHtml(m, fore, nasta, k, lastId) {
    if (m.system) return `<div class="ch-system${ui.nya.has(m.id) ? ' ch-farsk' : ''}"><span>${e(m.text)} · ${e(klocka(m.tid))}</span></div>`;
    const ihop = (a, b) => !!a && !!b && !a.system && !b.system && a.av === b.av && Math.abs(Date.parse(b.tid) - Date.parse(a.tid)) < 5 * 6e4 && lokalDag(a.tid) === lokalDag(b.tid);
    const forst = !ihop(fore, m); const sist = !ihop(m, nasta); const egen = m.av === jag(); const u = anv(m.av);
    const text = m.borttagen ? '' : String(m.text || ''); const bara = !!text && !(m.filer || []).length && BARA_EMOJI.test(text) && [...text.replace(/\s/g, '')].length <= 8;
    const reak = Object.entries(m.reaktioner || {}).filter(([, v]) => v && v.length);
    const andrad = m.andrad && !m.borttagen ? `<small class="ch-andrad" title="Ändrad ${e(new Date(m.andrad).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}">ändrad</small>` : '';
    return `<div class="ch-medd${!egen && namnerMig(m) ? ' ch-namnd' : ''}${egen ? ' ch-egen' : ''}${forst ? ' ch-forst' : ''}${sist ? ' ch-sist' : ''}${ui.nya.has(m.id) ? ' ch-farsk' : ''}${ui.andrar && ui.andrar.mid === m.id ? ' ch-andras' : ''}" data-mid="${e(m.id)}">
      ${egen ? '' : sist ? `<a class="ch-vemav" href="#/profil/${e(u.id)}" aria-label="${e(u.namn)}">${av(u, 's', false)}</a>` : '<span class="ch-vemav"></span>'}
      <div class="ch-innehall">
        ${forst && !egen && k.typ === 'grupp' ? `<span class="ch-vem">${e(u.namn)}</span>` : ''}
        ${m.svar && !m.borttagen ? `<button type="button" class="ch-citat" data-g="ch-till-medd" data-mid="${e(m.svar.mid)}" aria-label="Visa meddelandet som besvaras">${ik('retur')}<span><b>${e(anv(m.svar.av).kort)}</b>${e(m.svar.text)}</span></button>` : ''}
        ${m.borttagen ? '<div class="ch-bubbla ch-borttagen">Meddelandet togs bort</div>' : text ? `<div class="ch-bubbla${bara ? ' ch-bara-emoji' : ''}">${bara ? e(text) : formatera(text)}${andrad}</div>` : andrad}
        ${m.franvaro && !m.borttagen && LED && LED.franvaroKort ? LED.franvaroKort(m.franvaro) : ''}
        ${(m.filer || []).length && !m.borttagen ? `<div class="ch-filer">${m.filer.map(filHtml).join('')}</div>` : ''}
        ${reak.length ? `<div class="ch-reak">${reak.map(([em, v]) => `<button type="button" class="ch-reak-knapp${v.includes(jag()) ? ' ch-reak-min' : ''}" data-g="ch-reagera" data-mid="${e(m.id)}" data-em="${e(em)}" title="${e(v.map((x) => anv(x).kort).join(', '))}">${e(em)}<b>${v.length}</b></button>`).join('')}</div>` : ''}
        ${sist ? `<span class="ch-tid">${e(klocka(m.tid))}${lastId === m.id ? ` · <span class="ch-last">${ik('bock')}Läst</span>` : ''}</span>` : ''}
      </div>
      ${m.borttagen ? '' : `<div class="ch-verktyg" role="group" aria-label="Åtgärder">${SNABB.map((em) => `<button type="button" data-g="ch-reagera" data-mid="${e(m.id)}" data-em="${e(em)}" aria-label="Reagera med ${e(em)}">${e(em)}</button>`).join('')}<i class="ch-vk-sep" aria-hidden="true"></i>
        <button type="button" class="ch-vk-ikon" data-g="ch-svara" data-mid="${e(m.id)}" title="Svara" aria-label="Svara">${ik('retur')}</button>${text ? `<button type="button" class="ch-vk-ikon" data-g="ch-kopiera" data-mid="${e(m.id)}" title="Kopiera texten" aria-label="Kopiera texten">${ik('dokument')}</button>` : ''}${egen ? `<button type="button" class="ch-vk-ikon" data-g="ch-andra" data-mid="${e(m.id)}" title="Ändra" aria-label="Ändra meddelandet">${ik('redigera')}</button><button type="button" class="ch-vk-ikon ch-vk-fara" data-g="ch-ta-bort" data-mid="${e(m.id)}" title="Ta bort" aria-label="Ta bort meddelandet">${ik('papperskorg')}</button>` : ''}</div>`}
    </div>`;
  }
  const filIkon = (f) => ((f.typ || '').startsWith('image/') ? 'bild' : /pdf/.test(f.typ) || /\.pdf$/i.test(f.namn) ? 'dokument' : /sheet|excel|csv/.test(f.typ) || /\.(xlsx?|csv)$/i.test(f.namn) ? 'kalkyl' : /audio/.test(f.typ) ? 'mote' : 'dokument');
  const skannadHtml = (s) => (s ? `<span class="ch-skannad" data-status="${e(s.status)}" title="${e(s.status === 'ren' ? 'Virusskannad – inga hot hittades' : (s.fynd || []).map((x) => x.text).join(' · ') || 'Varning')}">${ik(s.status === 'ren' ? 'skold' : 'varning')}${s.status === 'ren' ? 'Skannad' : 'Varning'}</span>` : '');
  function filHtml(f) {
    const url = f.data || sessionFiler.get(f.id) || '';
    if ((f.typ || '').startsWith('image/') && url) return `<figure class="ch-bild"><button type="button" data-g="ch-bild" data-fid="${e(f.id)}" aria-label="Visa ${e(f.namn)}"><img src="${e(url)}" alt="${e(f.namn)}" loading="lazy" draggable="false"></button><figcaption>${skannadHtml(f.skanning)}</figcaption></figure>`;
    const tagg = url ? `a href="${e(url)}" download="${e(f.namn)}"` : 'div';
    return `<${tagg} class="ch-fil"><span class="ch-fil-ikon">${ik(filIkon(f))}</span><span class="ch-fil-text"><strong>${e(f.namn)}</strong><small>${e(storlek(f.storlek || 0))} · ${url ? 'Ladda ner' : 'Fanns bara under sessionen där den skickades'}</small></span>${skannadHtml(f.skanning)}</${url ? 'a' : 'div'}>`;
  }
  function skrivHtml(k) {
    const till = k.typ === 'privat' ? motpart(k).kort : kanalNamn(k);
    // Ändrar man ett eget meddelande (G['ch-andra']) står texten i rutan, en rad säger vad som ändras och bilagor/snabbsvar väntar
    const andrar = ui.andrar && ui.andrar.kanal === k.id ? C().meddelanden.find((x) => x.id === ui.andrar.mid) : null;
    if (andrar) return `<form class="ch-skriv" data-form="ch-skicka" data-kanal="${e(k.id)}" data-andrar autocomplete="off">
      <div class="ch-svarar ch-andrar">${ik('redigera')}<span><b>Ändrar ditt meddelande</b>${e(String(klartext(andrar.text) || ((andrar.filer || [])[0] || {}).namn || '').slice(0, 120))}</span><button type="button" data-g="ch-andra-bort" aria-label="Avbryt ändringen" title="Avbryt (Esc)">${ik('stang')}</button></div>
      <div class="ch-skriv-rad">
        <span class="ch-ikonknapp ch-andrar-ikon" aria-hidden="true">${ik('redigera')}</span>
        <button type="button" class="ch-ikonknapp" data-g="ch-emoji" aria-expanded="${ui.emoji}" title="Emoji">${ik('smiley')}</button>
        <textarea class="ch-text" name="text" rows="1" maxlength="4000" data-ch-text placeholder="Ändra meddelandet …" aria-label="Ändra meddelandet" aria-autocomplete="list" aria-expanded="false">${e(ui.utkast[k.id] || '')}</textarea>
        <button type="submit" class="ch-skicka" aria-label="Spara ändringen" title="Spara ändringen">${ik('bock')}</button>
      </div>
      ${ui.emoji ? emojiHtml() : ''}
      <p class="ch-tips"><kbd>Enter</kbd> sparar · <kbd>Esc</kbd> avbryter · <kbd>Shift</kbd>+<kbd>Enter</kbd> ny rad</p>
    </form>`;
    return `<form class="ch-skriv" data-form="ch-skicka" data-kanal="${e(k.id)}" autocomplete="off">
      ${ui.svar ? (() => { const o = C().meddelanden.find((x) => x.id === ui.svar); return o ? `<div class="ch-svarar">${ik('retur')}<span><b>Svarar ${e(anv(o.av).kort)}</b>${e(String(klartext(o.text) || ((o.filer || [])[0] || {}).namn || '').slice(0, 120))}</span><button type="button" data-g="ch-svar-bort" aria-label="Avbryt svaret">${ik('stang')}</button></div>` : ''; })() : ''}
      ${ui.bilagor.length ? `<div class="ch-bilagor">${ui.bilagor.map((b) => `<span class="ch-bilaga">${(b.typ || '').startsWith('image/') && (b.data || sessionFiler.get(b.id)) ? `<img src="${e(b.data || sessionFiler.get(b.id))}" alt="">` : `<span class="ch-fil-ikon">${ik(filIkon(b))}</span>`}<span class="ch-bilaga-text"><strong>${e(b.namn)}</strong><small>${e(storlek(b.storlek))}</small></span>${skannadHtml(b.skanning)}<button type="button" class="ch-bilaga-bort" data-g="ch-bort-bilaga" data-id="${e(b.id)}" aria-label="Ta bort ${e(b.namn)}">${ik('stang')}</button></span>`).join('')}</div>` : ''}
      ${(() => { const f = !ui.svar && !ui.andrar && !(ui.utkast[k.id] || '').trim() && !ui.bilagor.length ? snabbsvar(k) : []; return f.length ? `<div class="ch-snabbsvar" role="group" aria-label="Snabbsvar"><span class="ch-snabb-etikett">${ik('gnista')}Snabbsvar</span>${f.map((t) => `<button type="button" data-g="ch-snabbsvar" data-text="${e(t)}">${e(t)}</button>`).join('')}</div>` : ''; })()}
      <div class="ch-skriv-rad">
        <label class="ch-ikonknapp" title="Bifoga filer eller bilder">${ik('gem')}<input type="file" multiple data-ch-fil hidden><span class="sr">Bifoga filer eller bilder</span></label>
        <button type="button" class="ch-ikonknapp" data-g="ch-emoji" aria-expanded="${ui.emoji}" title="Emoji">${ik('smiley')}</button>
        <textarea class="ch-text" name="text" rows="1" maxlength="4000" data-ch-text placeholder="Skriv till ${e(till)} …" aria-label="Meddelande till ${e(till)}" aria-autocomplete="list" aria-expanded="false">${e(ui.utkast[k.id] || '')}</textarea>
        <button type="submit" class="ch-skicka" aria-label="Skicka">${ik('skicka')}</button>
      </div>
      ${ui.emoji ? emojiHtml() : ''}
      <p class="ch-tips"><kbd>Enter</kbd> skickar · <kbd>Shift</kbd>+<kbd>Enter</kbd> ny rad · <kbd>@</kbd> nämn en kollega · <kbd>#</kbd> länka en kund eller affär · <kbd>↑</kbd> ändra ditt senaste · filer virusskannas först</p>
    </form>`;
  }
  const emojiHtml = () => `<div class="ch-emoji" role="dialog" aria-label="Emoji"><div class="ch-emoji-flikar" role="tablist">${EMOJI.map(([namn], i) => `<button type="button" role="tab" aria-selected="${ui.emojiFlik === i}" data-g="ch-emoji-flik" data-i="${i}">${e(namn)}</button>`).join('')}</div>
        <div class="ch-emoji-rutnat">${EMOJI[ui.emojiFlik][1].split(' ').map((em) => `<button type="button" data-g="ch-emoji-in" data-em="${e(em)}" aria-label="${e(em)}">${e(em)}</button>`).join('')}</div></div>`;
  function infoHtml(k) {
    const medl = (k.medlemmar || []).map(anv);
    const filer = iKanal(k.id).flatMap((m) => (m.filer || []).map((f) => ({ f, m }))).reverse().slice(0, 6);
    return `<aside class="ch-info" aria-label="Om samtalet">
      <div class="ch-info-topp">${k.typ === 'grupp' ? gruppAvatar(k, 'l') : av(motpart(k), 'l')}<strong>${e(kanalNamn(k))}</strong><small>${k.typ === 'grupp' ? `Grupp · skapad av ${e(anv(k.skapadAv).kort)} ${e(relTid(k.skapad))}` : e(motpart(k).titel || '')}</small></div>
      ${k.typ === 'grupp' ? `<form class="ch-namnform" data-form="ch-namn" data-kanal="${e(k.id)}"><input class="falt" name="namn" value="${e(k.namn || '')}" maxlength="40" aria-label="Gruppens namn" required><button class="knapp knapp-glas knapp-liten" type="submit">Byt namn</button></form>` : ''}
      <p class="ch-info-rubrik">Medlemmar · ${medl.length}</p>
      <ul class="ch-medlemmar">${medl.map((u) => `<li><a href="#/profil/${e(u.id)}">${av(u, 's')}<span><strong>${e(u.namn)}${u.id === jag() ? ' (du)' : ''}</strong><small>${e(LED ? LED.statusText(u) : u.titel || '')}</small></span></a></li>`).join('')}</ul>
      ${k.typ === 'grupp' ? `<button type="button" class="knapp knapp-glas knapp-liten" data-g="ch-bjud" data-id="${e(k.id)}">${ik('anvandare-plus')}Bjud in fler</button>` : `<a class="knapp knapp-glas knapp-liten" href="#/profil/${e(motpart(k).id)}">${ik('anstallda')}Visa profilen</a>`}
      <p class="ch-info-rubrik">Delade filer</p>
      ${filer.length ? `<ul class="ch-delade">${filer.map(({ f, m }) => `<li>${filHtml(f)}<small>${e(anv(m.av).kort)} · ${e(relTid(m.tid))}</small></li>`).join('')}</ul>` : '<p class="ch-info-tom">Inga filer delade än.</p>'}
      ${k.typ === 'grupp' ? `<button type="button" class="knapp knapp-spok knapp-liten ch-lamna" data-g="ch-lamna" data-id="${e(k.id)}">${ik('logga-ut')}Lämna gruppen</button>` : ''}
    </aside>`;
  }
  // Flödets läge efter en ritning: längst ned (senaste meddelandet) när man stod där eller öppnar samtalet, annars där man var.
  // Introt överst (bilderna och namnet) klipps aldrig av under rubriken: är det bara introt som inte ryms krymper det till en rad,
  // och ryms samtalet då börjar det överst. Rullat innehåll tonar ut under rubriken (data-rullad).
  function placeraFloede(f, nere, topp, ny) {
    if (!f) return;
    const intro = $('.ch-start', f);
    const over = () => f.scrollHeight - f.clientHeight;
    const introSlut = () => (intro ? intro.offsetTop + intro.offsetHeight : 0);
    if (intro && over() > 0 && over() < introSlut()) intro.setAttribute('data-kompakt', '');
    const linje = ny && nere && $('.ch-nya-linje', f); const mal = linje ? linje.offsetTop - 16 : 0;
    if (linje && mal < over()) f.scrollTop = mal <= introSlut() ? 0 : mal; // de olästa ryms inte under linjen – börja vid den
    else f.scrollTop = !nere ? topp : over() > 0 && over() < 24 ? 0 : f.scrollHeight;
    f.toggleAttribute('data-rullad', f.scrollTop > 2);
    const b = $('.ch-ner'); if (b && f.closest('.ch-trad') === b.closest('.ch-trad')) b.hidden = f.scrollHeight - f.scrollTop - f.clientHeight < 220;
  }
  // Efter ritningen: tråden längst ned (eller där man var), skrivrutan anpassar höjden, markören sist i texten
  function efterRitning(varNere, topp, ny) {
    const f = $('[data-ch-floede]');
    placeraFloede(f, varNere || (f && $('.ch-farsk.ch-egen', f)), topp, ny);
    aterstallForslag();
    const t = $('[data-ch-text]'); if (t) { vaxa(t); if (document.activeElement === t) t.setSelectionRange(...markorFor(t)); }
    if (ui.nya.size) setTimeout(() => ui.nya.clear(), 900);
  }
  const vaxa = (t) => { t.style.height = 'auto'; t.style.height = `${Math.min(160, t.scrollHeight)}px`; };
  const fokusText = () => { const t = $('[data-ch-text]'); if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(...markorFor(t)); } };
  // Markören i skrivrutan: var den stod när rutan ritas om (emoji-panelen, en bilaga, ett nytt meddelande i samtalet) – emojin och
  // fokus hamnar där igen, inte först i texten. Sparas vid varje ändring och när rutan tappar fokus, och gäller bara så länge texten
  // är densamma (annars sist i texten som förut). Nollställs när man skickar och när man byter samtal.
  const minnsMarkor = (ev) => {
    const t = ev.target; if (!t || !t.matches || !t.matches('[data-ch-text]')) return; const f = t.closest('form'); if (!f) return;
    ui.markor = { kanal: f.dataset.kanal, a: t.selectionStart ?? t.value.length, b: t.selectionEnd ?? t.value.length, text: t.value };
  };
  ['input', 'keyup', 'pointerup', 'select', 'focusout'].forEach((typ) => document.addEventListener(typ, minnsMarkor, true));
  function markorFor(t) {
    const f = t.closest('form'); const m = ui.markor; const n = t.value.length;
    return m && f && m.kanal === f.dataset.kanal && m.text === t.value ? [Math.min(m.a, n), Math.min(m.b, n)] : [n, n];
  }

  /* 03-filer: bilder skalas ned och sparas, små dokument sparas, stora finns under sessionen */
  const somDataUrl = (fil) => new Promise((ok, fel) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fel(r.error); r.readAsDataURL(fil); });
  const skalaBild = (fil) => new Promise((ok, fel) => {
    const url = URL.createObjectURL(fil); const img = new Image();
    img.onload = () => { const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.84)); };
    img.onerror = () => { URL.revokeObjectURL(url); fel(new Error('Bilden kunde inte läsas')); };
    img.src = url;
  });
  const sparatUtrymme = () => sum(C().meddelanden.flatMap((m) => (m.filer || []).map((f) => (f.data || '').length)));
  async function laggTill(filer) {
    const k = kanal(ui.senastKanal); if (!k) return;
    if (ui.andrar) { toast('Spara eller avbryt ändringen först – filer bifogas till ett nytt meddelande', null, 'info'); return; }
    for (const fil of filer) {
      if (ui.bilagor.length >= 10) { toast('Högst tio filer per meddelande', null, 'varning'); break; }
      const r = window.UPFilskanner ? window.UPFilskanner.resultat(fil) : null;
      const b = { id: nyId('f'), namn: fil.name || 'fil', typ: fil.type || '', storlek: fil.size, skanning: r ? { status: r.status, hash: r.hash, tid: r.tid, fynd: r.fynd } : null };
      try {
        let data = '';
        // bilder skalas ned och sparas som JPEG – filnamnet får .jpg så att en nedladdad fil stämmer med innehållet
        if (/^image\/(png|jpe?g|webp|gif|bmp|avif)$/.test(b.typ)) { data = await skalaBild(fil); b.typ = 'image/jpeg'; b.storlek = Math.round(data.length * 0.75); b.namn = `${b.namn.replace(/\.(png|jpe?g|jfif|webp|gif|bmp|avif)$/i, '') || 'bild'}.jpg`; }
        else if (fil.size <= 900 * 1024) data = await somDataUrl(fil);
        if (data && sparatUtrymme() + sum(ui.bilagor.map((x) => (x.data || '').length)) + data.length <= 2.5e6) b.data = data;
        else sessionFiler.set(b.id, data || URL.createObjectURL(fil));
      } catch (err) { toast(`${fil.name} kunde inte läsas`, null, 'varning'); continue; }
      ui.bilagor.push(b);
    }
    rita(); requestAnimationFrame(fokusText);
  }
  document.addEventListener('change', (ev) => { const t = ev.target; if (t.matches && t.matches('[data-ch-fil]') && t.files && t.files.length) { const f = [...t.files]; t.value = ''; laggTill(f); } });
  document.addEventListener('dragover', (ev) => { const zon = ev.target.closest && ev.target.closest('[data-ch-slapp]'); if (zon && ev.dataTransfer && ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); zon.setAttribute('data-drag', ''); } });
  document.addEventListener('dragleave', (ev) => { const zon = ev.target.closest && ev.target.closest('[data-ch-slapp]'); if (zon && !zon.contains(ev.relatedTarget)) zon.removeAttribute('data-drag'); });
  document.addEventListener('drop', (ev) => { const zon = ev.target.closest && ev.target.closest('[data-ch-slapp]'); if (!zon) return; ev.preventDefault(); zon.removeAttribute('data-drag'); if (ev.dataTransfer && ev.dataTransfer.files.length) laggTill([...ev.dataTransfer.files]); });
  document.addEventListener('paste', (ev) => {
    const t = ev.target; if (!t.matches || !t.matches('[data-ch-text]')) return;
    const filer = [...((ev.clipboardData && ev.clipboardData.files) || [])]; if (!filer.length) return;
    ev.preventDefault();
    (window.UPFilskanner ? window.UPFilskanner.granska(filer, { kalla: 'chatt' }) : Promise.resolve(filer)).then((ok) => { if (ok.length) laggTill(ok); });
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches && t.matches('[data-ch-text]')) {
      const f = t.closest('form'); if (f) ui.utkast[f.dataset.kanal] = t.value; vaxa(t);
      const sv = f && $('.ch-snabbsvar', f); if (sv) sv.hidden = !!t.value.trim();
      const fore = forslag; forslag = forslagFor(t); if (forslag && fore && fore.typ === forslag.typ && fore.start === forslag.start) forslag.i = Math.min(fore.i, forslag.val.length - 1);
      if (forslag && ui.emoji) { ui.emoji = false; const p = $('.ch-emoji', f); if (p) p.remove(); const eb = $('[data-g="ch-emoji"]', f); if (eb) eb.setAttribute('aria-expanded', 'false'); }
      ritaForslag(); return;
    }
    if (t.matches && t.matches('[data-ch-sok]')) { ui.sok = t.value; clearTimeout(sokT); sokT = setTimeout(() => { rendera(); const s = $('[data-ch-sok]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 160); }
  });
  let sokT = 0;
  // @ → kollegorna i samtalet, # → kunder och affärer. Pilar flyttar, Enter eller Tab väljer, Esc stänger. Valda länkar sparas per utkast
  // (ui.lankar) och blir [[kund:id]]/[[affar:id]] när meddelandet skickas.
  let forslag = null;
  ui.lankar = {};
  const narvText = (u) => (LED && LED.statusText ? LED.statusText(u) : u.titel || '');
  function forslagFor(t) {
    const fore = t.value.slice(0, t.selectionStart ?? t.value.length);
    const ma = fore.match(/(^|\s)@([\wåäöÅÄÖ-]{0,20})$/); const mh = !ma && fore.match(/(^|\s)#([^\n#@]{0,30})$/);
    if (!ma && !mh) return null;
    const k = kanal(t.closest('form').dataset.kanal); if (!k) return null;
    const q = (ma ? ma[2] : mh[2]).trim().toLowerCase(); const start = fore.length - (ma ? ma[2] : mh[2]).length - 1;
    let val = [];
    if (ma) val = (k.medlemmar || []).filter((x) => x !== jag()).map(anv).filter((u) => u && (!q || [u.kort, u.namn].some((n) => String(n || '').toLowerCase().split(' ').some((d) => d.startsWith(q)))))
      .map((u) => ({ text: `@${u.kort} `, html: `${av(u, 's')}<span><b>${e(u.namn)}</b><small>${e(narvText(u))}</small></span>` }));
    else {
      const d = db(); const tr = (n) => String(n || '').toLowerCase().includes(q);
      const ku = (d.kunder || []).filter((x) => !q || tr(x.namn)).slice(0, 5).map((x) => ({ text: `#${x.namn} `, token: `[[kund:${x.id}]]`, html: `<span class="ch-forslag-ikon">${ik(x.typ === 'klubb' ? 'klubb' : 'kunder')}</span><span><b>${e(x.namn)}</b><small>${e(x.typ === 'klubb' ? 'Klubb' : `Kund · ${x.stad || x.bransch || ''}`)}</small></span>` }));
      const af = (d.affarer || []).filter((a) => !['forlorad'].includes(a.steg) && (!q || tr(a.titel) || tr(((d.kunder || []).find((x) => x.id === a.kundId) || {}).namn))).slice(0, 4)
        .map((a) => { const kn = ((d.kunder || []).find((x) => x.id === a.kundId) || {}).namn || ''; return { text: `#${a.titel} `, token: `[[affar:${a.id}]]`, html: `<span class="ch-forslag-ikon">${ik('salj')}</span><span><b>${e(a.titel)}</b><small>${e(`Affär · ${kn}`)}</small></span>` }; });
      val = [...ku, ...af].slice(0, 7);
    }
    return val.length ? { t, kanal: k.id, typ: ma ? '@' : '#', start, slut: fore.length, val, i: 0 } : null;
  }
  // efter en omritning (nytt meddelande, bilaga) är skrivrutan en ny – hitta den och visa listan igen om man fortfarande skriver där
  function aterstallForslag() {
    if (!forslag || forslag.t.isConnected) return;
    const kid = forslag.kanal; forslag = null;
    const t = $$('[data-ch-text]').find((x) => x.closest('form') && x.closest('form').dataset.kanal === kid);
    if (t && document.activeElement === t) forslag = forslagFor(t);
    ritaForslag();
  }
  function ritaForslag() {
    const t = forslag && forslag.t; const form = t && t.closest('form');
    $$('.ch-forslag').forEach((x) => { if (!forslag || x.parentNode !== form) x.remove(); });
    $$('[data-ch-text][aria-expanded="true"]').forEach((x) => { if (!forslag || x !== t) x.setAttribute('aria-expanded', 'false'); });
    if (!forslag) return;
    let lista = $('.ch-forslag', form);
    if (!lista) { lista = document.createElement('div'); lista.className = 'ch-forslag'; lista.id = `ch-forslag-${form.dataset.kanal}`; lista.setAttribute('role', 'listbox'); form.appendChild(lista); }
    lista.setAttribute('aria-label', forslag.typ === '@' ? 'Nämn en kollega' : 'Länka en kund eller affär');
    lista.innerHTML = `<p class="ch-forslag-rubrik">${forslag.typ === '@' ? 'Nämn en kollega' : 'Länka en kund eller affär'}<small>↑↓ välj · Enter</small></p>${forslag.val.map((v, i) => `<button type="button" role="option" id="${lista.id}-${i}" aria-selected="${i === forslag.i}" data-ch-forslag="${i}">${v.html}</button>`).join('')}`;
    t.setAttribute('aria-expanded', 'true'); t.setAttribute('aria-controls', lista.id); t.setAttribute('aria-activedescendant', `${lista.id}-${forslag.i}`);
    // aldrig högre än utrymmet ovanför skrivrutan (lågt fönster) – den valda raden hålls i bild
    const flode = $('[data-ch-floede]', form.closest('.ch-trad') || document);
    const plats = flode ? form.getBoundingClientRect().top - flode.getBoundingClientRect().top - 6 : 340;
    lista.style.maxHeight = `${Math.max(120, Math.min(360, Math.round(plats)))}px`;
    const vald = $('[aria-selected="true"]', lista);
    if (vald) { if (vald.offsetTop < lista.scrollTop) lista.scrollTop = vald.offsetTop - 30; else if (vald.offsetTop + vald.offsetHeight > lista.scrollTop + lista.clientHeight) lista.scrollTop = vald.offsetTop + vald.offsetHeight - lista.clientHeight + 6; }
  }
  function valjForslag(i) {
    if (!forslag) return; const { t, start, slut } = forslag; const v = forslag.val[i]; if (!v) return;
    t.value = t.value.slice(0, start) + v.text + t.value.slice(slut);
    const pos = start + v.text.length; t.setSelectionRange(pos, pos);
    const kid = t.closest('form').dataset.kanal; ui.utkast[kid] = t.value;
    if (v.token) (ui.lankar[kid] = ui.lankar[kid] || []).push({ text: v.text.trim(), token: v.token });
    forslag = null; ritaForslag(); vaxa(t); t.focus({ preventScroll: true });
  }
  // när meddelandet skickas: valda #-namn (och kundnamn som skrivits för hand efter #) blir länkar
  function medLankar(kid, text) {
    let ut = text;
    for (const l of [...(ui.lankar[kid] || [])].sort((a, b) => b.text.length - a.text.length)) {
      ut = ut.replace(new RegExp(`(^|\\s)${escRe(l.text)}(?![\\wåäöÅÄÖ])`), (m, f) => `${f}${l.token}`);
    }
    for (const x of [...(db().kunder || [])].sort((a, b) => String(b.namn).length - String(a.namn).length)) {
      ut = ut.replace(new RegExp(`(^|\\s)#${escRe(x.namn)}(?![\\wåäöÅÄÖ])`, 'gi'), (m, f) => `${f}[[kund:${x.id}]]`);
    }
    delete ui.lankar[kid];
    return ut;
  }
  document.addEventListener('pointerdown', (ev) => { const b = ev.target.closest && ev.target.closest('[data-ch-forslag]'); if (!b) return; ev.preventDefault(); valjForslag(+b.dataset.chForslag); });
  document.addEventListener('focusout', (ev) => { if (forslag && ev.target === forslag.t) setTimeout(() => { if (forslag && document.activeElement !== forslag.t) { forslag = null; ritaForslag(); } }, 120); });
  document.addEventListener('scroll', (ev) => { const f = ev.target; if (!f.matches || !f.matches('[data-ch-floede]')) return; f.toggleAttribute('data-rullad', f.scrollTop > 2); const b = $('.ch-ner'); if (b) b.hidden = f.scrollHeight - f.scrollTop - f.clientHeight < 220; }, true);
  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (forslag && t === forslag.t && !ev.isComposing) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const n = forslag.val.length; forslag.i = (forslag.i + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n; ritaForslag(); return; }
      if ((ev.key === 'Enter' && !ev.shiftKey) || (ev.key === 'Tab' && !ev.shiftKey)) { ev.preventDefault(); valjForslag(forslag.i); return; }
      if (ev.key === 'Tab') { forslag = null; ritaForslag(); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); forslag = null; ritaForslag(); return; }
    }
    if (t.matches && t.matches('[data-ch-text]') && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); const f = t.closest('form'); if (f) f.requestSubmit(); return; }
    // ↑ i en tom skrivruta ändrar ditt senaste meddelande i samtalet (som i Slack/Teams)
    if (t.matches && t.matches('[data-ch-text]') && ev.key === 'ArrowUp' && !t.value && !ui.andrar && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.isComposing) {
      const kid = (t.closest('form') || {}).dataset?.kanal; const sista = kid && iKanal(kid).filter((m) => m.av === jag() && !m.system && !m.borttagen).pop();
      if (sista) { ev.preventDefault(); G['ch-andra']({ dataset: { mid: sista.id } }); return; }
    }
    if (ev.key === 'Escape' && ui.emoji && $('.ch-emoji')) { ev.preventDefault(); ui.emoji = false; rita(); fokusText(); return; }
    if (ev.key === 'Escape' && ui.andrar && t.closest && t.closest('form[data-andrar]')) { ev.preventDefault(); ev.stopPropagation(); avbrytAndring(); return; }
    if (ev.key === 'Escape' && $('.ch-tk-meny:not([hidden])')) { ev.preventDefault(); stangTradMeny(true); return; }
    // Fler val-menyn i trådens huvud: pilar flyttar mellan valen
    const meny = t.closest && t.closest('.ch-tk-meny');
    if (meny && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault(); const val = $$('button', meny); const i = val.indexOf(t);
      const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? val.length - 1 : (i + (ev.key === 'ArrowDown' ? 1 : val.length - 1)) % val.length;
      if (val[n]) val[n].focus();
    }
  });
  // Fler val stängs vid ett klick utanför och när ett val har gjorts (valet körs ändå – det är samma data-g som knapparna)
  document.addEventListener('pointerdown', (ev) => { if (!$('.ch-tk-meny:not([hidden])')) return; if (!(ev.target.closest && ev.target.closest('.ch-tk-mer-ram'))) stangTradMeny(); }, true);
  document.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('.ch-tk-meny button')) setTimeout(() => stangTradMeny(), 0); }, true);
  // Pekskärm: ett tryck på ett meddelande visar raden med reaktioner och åtgärder, ett tryck till (eller på ett annat) döljer den
  document.addEventListener('click', (ev) => {
    if (!pekskarm() || !ev.target.closest) return;
    const m = ev.target.closest('.ch-medd');
    $$('.ch-medd[data-verktyg]').forEach((x) => { if (x !== m) x.removeAttribute('data-verktyg'); });
    if (!m || ev.target.closest('a, button, input, textarea, label, .ch-verktyg')) return;
    m.toggleAttribute('data-verktyg');
  });

  /* 04-pling och kontokortet: något nytt till dig → mjukt pling, kortet lyser och visar avsändaren */
  let ljud = null;
  function pling() {
    try { if (localStorage.getItem('up-crm-pling') === 'av') return; } catch (err) { /* ok */ }
    try {
      ljud = ljud || new (window.AudioContext || window.webkitAudioContext)();
      if (ljud.state === 'suspended') ljud.resume();
      const t0 = ljud.currentTime + 0.03; const ut = ljud.createGain(); ut.gain.value = 0.85; ut.connect(ljud.destination);
      // två mjuka toner (E6 → A6) med en svag överton och lång avklingning – som en liten klocka
      [[1318.5, 0], [1760, 0.13]].forEach(([fr, d]) => {
        const g = ljud.createGain(); g.connect(ut);
        for (const [mult, styrka] of [[1, 1], [2, 0.14], [3, 0.04]]) { const o = ljud.createOscillator(); const og = ljud.createGain(); o.type = 'sine'; o.frequency.value = fr * mult; og.gain.value = styrka; o.connect(og); og.connect(g); o.start(t0 + d); o.stop(t0 + d + 1.2); }
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.07, t0 + d + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.1);
      });
    } catch (err) { /* inget ljud i den här webbläsaren */ }
  }
  let effektT = 0; let senasteNotis = null;
  const notisText = (m) => (m.text ? `${namnerMig(m) ? 'nämnde dig · ' : ''}${klartext(m.text).replace(/\s+/g, ' ').slice(0, 80)}` : (m.filer || []).length ? ((m.filer[0].typ || '').startsWith('image/') ? 'Skickade en bild' : 'Skickade en fil') : '');
  function effekt(m, n) {
    const u = anv(m.av); const k = kanal(m.kanal);
    const text = notisText(m);
    senasteNotis = { kanal: m.kanal };
    const kort = $('.anvandarval');
    const synligt = kort && kort.getClientRects().length && matchMedia('(min-width: 1000px)').matches && !document.documentElement.hasAttribute('data-sido-dold');
    if (synligt) {
      let notis = $('.anv-notis', kort);
      if (!notis) { notis = document.createElement('span'); notis.className = 'anv-notis'; notis.setAttribute('aria-hidden', 'true'); kort.appendChild(notis); }
      notis.innerHTML = `<span class="anv-notis-ikon">${ik('prat')}</span><span class="anv-notis-text"><b>${e(u.kort)}${k && k.typ === 'grupp' ? ` · ${e(k.namn)}` : ''}</b><span>${e(text)}</span></span>${n > 1 ? `<i>+${n - 1}</i>` : ''}`;
      kort.removeAttribute('data-ny-chatt'); void kort.offsetWidth; kort.setAttribute('data-ny-chatt', '');
      clearTimeout(effektT); effektT = setTimeout(() => { kort.removeAttribute('data-ny-chatt'); senasteNotis = null; }, 6000);
      const lev = $('[data-ch-levande]') || (() => { const x = document.createElement('p'); x.className = 'sr'; x.setAttribute('data-ch-levande', ''); x.setAttribute('aria-live', 'polite'); document.body.appendChild(x); return x; })();
      lev.textContent = `Nytt meddelande från ${u.namn}: ${text}`;
    } else toast(`${u.kort}: ${text}${n > 1 ? ` (+${n - 1})` : ''}`, { href: `#/chatt/${m.kanal}`, text: 'Öppna' }, 'prat');
  }
  /* 04b-aviseringar på skrivbordet (valfritt, av från början): raden ovanför tipset i samtalslistan slår på dem (dator – på
     mobilen kräver webbläsarna en installerad app) – webbläsaren frågar en gång.
     En avisering kommer bara när fliken inte syns (annars räcker kortet/toasten), aldrig med Stör ej eller från ett tystat samtal,
     och den är tyst (plinget sköter ljudet). Den visar avsändaren och början av meddelandet; ett klick öppnar samtalet. Samma
     samtal ersätter sin förra avisering (tag), så två flikar ger inte dubbla. Valet gäller webbläsaren (up-crm-avisering). */
  const AVISERA = 'up-crm-avisering';
  const AVIS_TITEL = {
    pa: 'Aviseringar på skrivbordet är på – klicka för att stänga av',
    av: 'Avisering på skrivbordet när fliken inte syns – klicka för att slå på',
    blockerad: 'Webbläsaren blockerar aviseringar för sidan – tillåt dem i webbläsarens inställningar',
  };
  const AVIS_UNDER = { pa: 'På – när fliken inte syns', av: 'Av – få veta när något kommer medan du är i en annan flik', blockerad: 'Blockerad i webbläsarens inställningar' };
  function aviseringLage() {
    if (!('Notification' in window)) return 'saknas';
    let pa = false; try { pa = localStorage.getItem(AVISERA) === 'pa'; } catch (err) { /* ok */ }
    if (Notification.permission === 'denied') return 'blockerad';
    return pa && Notification.permission === 'granted' ? 'pa' : 'av';
  }
  const satAvisering = (pa) => { try { if (pa) localStorage.setItem(AVISERA, 'pa'); else localStorage.removeItem(AVISERA); } catch (err) { /* ok */ } };
  function avisera(m, n) {
    if (aviseringLage() !== 'pa' || document.visibilityState === 'visible') return;
    const u = anv(m.av); const k = kanal(m.kanal);
    try {
      const a = new Notification(`${u.namn}${k && k.typ === 'grupp' ? ` · ${k.namn}` : ''}`, { body: `${notisText(m)}${n > 1 ? ` (+${n - 1})` : ''}`, tag: `up-chatt-${m.kanal}`, silent: true });
      a.onclick = () => {
        try { window.focus(); } catch (err) { /* ok */ }
        a.close();
        if (fl.lage === 'oppen' && !paChattSidan()) oppnaFonster(m.kanal); else location.hash = `#/chatt/${m.kanal}`;
      };
    } catch (err) { /* t.ex. Chrome på Android kräver en service worker – då blir det ingen avisering, räknaren och plinget finns kvar */ }
  }
  function uppdateraRaknare() {
    const n = SKARP || !jag() ? 0 : olastaTotalt();
    $$('[data-rakna="chatt"]').forEach((x) => { x.textContent = n ? String(n) : ''; x.hidden = !n; x.toggleAttribute('data-varm', !!n); });
    $$('[data-rakna-mobil="chatt"]').forEach((x) => { x.textContent = n ? String(n) : ''; x.hidden = !n; });
    titelOlasta = n; satTitel();
    const kort = $('.anvandarval'); if (!kort) return;
    let b = $('.anv-olast', kort); if (!b) { b = document.createElement('i'); b.className = 'anv-olast'; b.setAttribute('aria-hidden', 'true'); kort.appendChild(b); }
    b.textContent = n > 9 ? '9+' : String(n || ''); b.hidden = !n;
    // brickan sitter i bildens övre högra hörn och växer åt vänster – den täcker aldrig namnet (kortets mått ändras med fönsterhöjden)
    const bild = $('[data-mig-avatar]', kort);
    if (bild && bild.offsetWidth && bild.offsetParent === kort) { b.style.setProperty('--olast-x', `${bild.offsetLeft + bild.offsetWidth + 3}px`); b.style.setProperty('--olast-y', `${Math.max(0, bild.offsetTop - 6)}px`); }
  }
  // Olästa i fliktiteln: "(3) Säljtavla · Uperformance CRM". crm.js skriver titeln vid varje ritning – den läggs på igen direkt.
  let titelOlasta = 0;
  function satTitel() {
    const ren = document.title.replace(/^\(\d+\+?\) /, ''); const ny = titelOlasta ? `(${titelOlasta > 99 ? '99+' : titelOlasta}) ${ren}` : ren;
    if (document.title !== ny) document.title = ny;
  }
  const titelEl = document.querySelector('head > title');
  if (titelEl && 'MutationObserver' in window) new MutationObserver(satTitel).observe(titelEl, { childList: true, characterData: true, subtree: true });
  const NOTIS = 'up-crm-chatt-notis';
  function kolla() {
    if (SKARP || !jag() || !db() || !db().anvandare) return;
    uppdateraRaknare();
    let sett = {}; try { sett = JSON.parse(localStorage.getItem(NOTIS) || '{}') || {}; } catch (err) { sett = {}; }
    const u = jag(); const fore = sett[u] || '';
    const synlig = document.visibilityState !== 'visible' ? null : paChattSidan() ? ui.senastKanal : fl.lage === 'oppen' && fonster ? fl.kanal : null;
    const hogst = C().meddelanden.reduce((x, m) => (m.tid > x ? m.tid : x), fore);
    if (hogst !== fore) { sett[u] = hogst; try { localStorage.setItem(NOTIS, JSON.stringify(sett)); } catch (err) { /* ok */ } }
    const nya = C().meddelanden.filter((m) => !m.system && m.av !== u && (!fore || m.tid > fore) && m.tid > lastTill(m.kanal) && arMedlem(kanal(m.kanal)) && m.kanal !== synlig && !tystad(m.kanal))
      .sort((a, b) => (a.tid < b.tid ? -1 : 1));
    const fk = fl.kanal && kanal(fl.kanal);
    if (fonster && (nya.length || (fk && arMedlem(fk) && olasta(fk.id)))) ritaFonster(); else ritaIkon();
    if (!nya.length) return;
    if (ikon) { ikon.removeAttribute('data-ny'); void ikon.offsetWidth; ikon.setAttribute('data-ny', ''); }
    if (fl.storEj) return;
    pling(); effekt(nya[nya.length - 1], nya.length); avisera(nya[nya.length - 1], nya.length);
  }
  // Kontobyte i demoläget (crm.js bytAnvandare): förra kontots sökning, öppna samtal, svar, bilagor, utkast och notis följer
  // inte med – det nya kontot börjar med tom sökning, sitt eget senaste samtal och sina egna notiser (kolla körs strax efter)
  function nollstall() {
    ui.bilagor.forEach((b) => sessionFiler.delete(b.id));
    Object.assign(ui, { sok: '', info: false, emoji: false, emojiFlik: 0, bilagor: [], utkast: {}, nya: new Set(), senastKanal: null, svar: null, olastFran: {}, markor: null, andrar: null, saknas: null });
    clearTimeout(effektT); senasteNotis = null;
    const kort = $('.anvandarval'); if (kort) { kort.removeAttribute('data-ny-chatt'); const n = $('.anv-notis', kort); if (n) n.remove(); }
    const lev = $('[data-ch-levande]'); if (lev) lev.textContent = '';
  }
  setTimeout(uppdateraRaknare, 0);
  setTimeout(() => { ritaFonster(); kolla(); }, 1200);
  setInterval(kolla, 3000);
  addEventListener('storage', () => setTimeout(kolla, 250));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kolla(); });
  // Ledningen har beslutat om en ansökan (ledning.js) – kortet under meddelandet visar det nya läget direkt, även i fönstret
  document.addEventListener('up-chatt-andrad', () => { if (!SKARP) { if (paChattSidan()) rendera(); else ritaFonster(); uppdateraRaknare(); } });

  /* 07-chattfönstret ------------------------------------------------------------------------------------------------
     Samma chatt i ett flytande fönster som följer med mellan sidorna: dra i huvudet, ändra storleken i hörnet (webbläsarens eget
     grepp), minimera till en ikon som lägger sig under menyknappen när menyn är infälld (annars nere till höger) – ikonen visar
     olästa och pulserar vid nytt, ett klick ger valen Öppna, Stör ej och Stäng. Stör ej = inget pling och ingen effekt, men
     räknaren fortsätter. På chattsidan (#/chatt) göms fönstret. Läget sparas i webbläsaren (up-crm-chattfonster). */
  const FL = 'up-crm-chattfonster';
  const fl = (() => { try { return { lage: 'stangd', storEj: false, ...(JSON.parse(localStorage.getItem(FL) || '{}') || {}) }; } catch (err) { return { lage: 'stangd', storEj: false }; } })();
  const sparaFl = () => { try { localStorage.setItem(FL, JSON.stringify(fl)); } catch (err) { /* ok */ } };
  let fonster = null; let ikon = null; let ikonMeny = null;
  const paChattSidan = () => /^#\/chatt/.test(location.hash);
  const smal = () => matchMedia('(max-width: 700px)').matches;
  function oppnaFonster(kid) {
    if (SKARP) return;
    if (kid !== undefined) fl.kanal = kid || null;
    fl.lage = 'oppen'; sparaFl(); stangIkonMeny();
    if (paChattSidan()) { (location.hash = senasteSida || '#/'); return; }
    ritaFonster(true); klamFonster({ helt: true }); requestAnimationFrame(() => { const t = fonster && $('[data-ch-text]', fonster); if (t) t.focus({ preventScroll: true }); });
  }
  // Fönstret hålls inom skärmen: minst 100 px syns i sidled och huvudet går alltid att ta tag i (som när man drar det). helt = hela
  // fönstret i bild – när man öppnar det igen (t.ex. Skicka meddelande på en profil) ska det synas, även om det låg nästan utanför.
  function klamFonster({ helt = false } = {}) {
    if (!fonster || smal()) return;
    const b = fonster.offsetWidth; const h = fonster.offsetHeight; if (!b || !h) return;
    const x0 = parseFloat(fonster.style.left) || 0; const y0 = parseFloat(fonster.style.top) || 0;
    const x = Math.round(helt ? Math.max(8, Math.min(innerWidth - b - 8, x0)) : Math.min(innerWidth - 100, Math.max(100 - b, x0)));
    const y = Math.round(helt ? Math.max(8, Math.min(innerHeight - h - 8, y0)) : Math.min(innerHeight - 52, Math.max(0, y0)));
    if (x === Math.round(x0) && y === Math.round(y0)) return;
    fonster.style.left = `${x}px`; fonster.style.top = `${y}px`;
    if (fl.x != null || fl.y != null) { fl.x = x; fl.y = y; sparaFl(); }
  }
  const ORDNING = { online: 0, strax: 1, lunch: 2, mote: 3, upptagen: 4, semester: 5, sjuk: 6, offline: 7 };
  function teamRad() {
    const folk = db().anvandare.filter((u) => arAktiv(u) && u.id !== jag()).map((u) => ({ u, n: LED ? LED.narvaro(u) : { id: 'online', namn: '' } })).sort((a, b) => (ORDNING[a.n.id] ?? 8) - (ORDNING[b.n.id] ?? 8));
    if (!folk.length) return '';
    return `<div class="ch-team" role="group" aria-label="Skriv till någon i teamet">${folk.map(({ u, n }) => `<button type="button" class="ch-person" data-g="ch-skriv-till" data-id="${e(u.id)}" title="Skriv till ${e(u.namn)} – ${e(LED ? LED.statusText(u) : '')}"><span class="ch-person-bild">${av(u, 'm')}</span><strong>${e(u.kort)}</strong><small data-narvaro="${e(n.id)}">${e(n.namn)}</small></button>`).join('')}</div>`;
  }
  function privatKanal(uid) {
    let k = C().kanaler.find((x) => x.typ === 'privat' && (x.medlemmar || []).length === 2 && arMedlem(x) && arMedlem(x, uid));
    if (!k) { k = { id: nyId('c'), typ: 'privat', medlemmar: [jag(), uid], skapad: new Date().toISOString(), skapadAv: jag() }; C().kanaler.push(k); spara(); }
    return k;
  }
  function fonsterLista() {
    const mina = minaKanaler().map((k) => ({ k, s: senast(k.id) })).sort((a, b) => ((b.s ? b.s.tid : b.k.skapad || '') > (a.s ? a.s.tid : a.k.skapad || '') ? 1 : -1));
    const n = olastaTotalt(); const h = new Date().getHours();
    return `<div class="chf-lista">
      <div class="chf-hej"><span class="chf-hej-text"><strong>${h < 10 ? 'God morgon' : h < 17 ? 'Hej' : 'God kväll'}, ${e(mig().kort || mig().namn)}</strong><small>${n ? `Du har ${plural(n, 'oläst meddelande', 'olästa meddelanden')}` : 'Allt är läst – skriv till någon i teamet'}</small></span>${n ? `<b class="chf-hej-tal">${n}</b>` : `<span class="chf-hej-bock">${ik('bock')}</span>`}</div>
      <p class="chf-rubrik">Teamet</p>
      ${teamRad()}
      <p class="chf-rubrik">Samtal<button type="button" class="chf-ny-liten" data-g="ch-ny">${ik('plus')}Nytt</button></p>
      ${mina.map(({ k, s }) => { const o = olasta(k.id); const p = motpart(k);
        const forh = !s ? 'Inga meddelanden än' : s.system ? s.text : `${s.av === jag() ? 'Du: ' : k.typ === 'grupp' ? `${anv(s.av).kort}: ` : ''}${s.borttagen ? 'Meddelandet togs bort' : klartext(s.text) || 'Skickade en fil'}`;
        return `<button type="button" class="ch-rad${o ? ' ch-rad-olast' : ''}" data-g="chf-kanal" data-id="${e(k.id)}">${k.typ === 'grupp' ? gruppAvatar(k) : av(p, 'm')}<span class="ch-rad-text"><span class="ch-rad-topp"><strong>${e(kanalNamn(k))}</strong><small>${s ? e(listTid(s.tid)) : ''}</small></span><span class="ch-rad-under"><span class="ch-forh">${e(forh)}</span>${o ? `<b class="ch-bricka">${o}</b>` : ''}</span></span></button>`; }).join('') || '<p class="ch-lista-tom">Inga samtal än – välj någon i teamet ovanför.</p>'}
      <div class="chf-tips"><span class="chf-tips-ikon">${ik('glodlampa')}</span><span><strong>Tips</strong><small>${pekskarm() ? 'Bifoga filer och bilder med gemet – de virusskannas först. Tryck på ett meddelande för att svara, reagera eller ändra det.' : 'Dra in eller klistra in filer i ett samtal – de virusskannas först. Håll musen över ett meddelande för att svara, reagera eller ändra ditt eget.'}${smal() ? '' : ' Dra i huvudet för att flytta fönstret, i hörnet för att ändra storlek.'}</small></span></div>
    </div>`;
  }
  function ritaFonster(entre = false) {
    if (SKARP || !jag()) { if (fonster) { fonster.remove(); fonster = null; } ritaIkon(); return; }
    ritaIkon();
    if (fl.lage !== 'oppen' || paChattSidan()) { if (fonster) { fonster.remove(); fonster = null; } return; }
    if (!fonster) {
      fonster = document.createElement('section'); fonster.className = 'chf'; fonster.setAttribute('data-mork-yta', ''); fonster.setAttribute('data-ch-rum', ''); fonster.setAttribute('aria-label', 'Chattfönster');
      const b = Math.min(fl.egen && fl.b ? fl.b : 400, innerWidth - 16), h = Math.min(fl.egen && fl.h ? fl.h : 600, innerHeight - 32);
      fonster.style.width = `${b}px`; fonster.style.height = `${h}px`; fonster.dataset.satt = `${b}x${h}`;
      fonster.style.left = `${Math.max(8, Math.min(fl.x ?? innerWidth - b - 28, innerWidth - 120))}px`; fonster.style.top = `${Math.max(8, Math.min(fl.y ?? innerHeight - h - 28, innerHeight - 60))}px`;
      document.body.appendChild(fonster); if (storlekObs) storlekObs.observe(fonster); entre = true;
    }
    const k = fl.kanal && kanal(fl.kanal) && arMedlem(kanal(fl.kanal)) ? kanal(fl.kanal) : null;
    if (fl.kanal && !k) { fl.kanal = null; sparaFl(); } // samtalet finns inte eller är någon annans (t.ex. efter kontobyte) – visa listan
    const gammal = $('[data-ch-floede]', fonster); const nyKanal = !gammal || gammal.dataset.kanal !== (k && k.id);
    if (k && ui.senastKanal !== k.id) { ui.emoji = false; ui.bilagor = []; ui.svar = null; ui.olastFran = {}; ui.markor = null; slappAndring(); }
    if (k && olasta(k.id)) { ui.olastFran[k.id] = lastTill(k.id) || '0'; markeraLast(k.id); spara(); setTimeout(uppdateraRaknare, 0); }
    else if (k && nyKanal) delete ui.olastFran[k.id];
    if (k) ui.senastKanal = k.id;
    const varNere = nyKanal || gammal.scrollHeight - gammal.scrollTop - gammal.clientHeight < 80; const topp = gammal ? gammal.scrollTop : 0;
    const hadeFokus = fonster.contains(document.activeElement) && document.activeElement.matches('[data-ch-text]');
    const p = k ? motpart(k) : null; const n = olastaTotalt();
    fonster.innerHTML = `<header class="chf-topp" data-chf-dra title="Dra för att flytta">
        ${k ? `<button type="button" class="chf-knapp" data-g="chf-lista" aria-label="Alla samtal">${ik('pil-v')}${n ? `<b>${n}</b>` : ''}</button>${k.typ === 'grupp' ? gruppAvatar(k) : av(p, 's')}` : `<span class="chf-logo">${ik('prat')}</span>`}
        <div class="chf-namn"><strong>${e(k ? kanalNamn(k) : 'Meddelanden')}</strong><small>${e(k ? (k.typ === 'privat' ? (LED ? LED.statusText(p) : '') : plural((k.medlemmar || []).length, 'medlem', 'medlemmar')) : n ? plural(n, 'oläst', 'olästa') : 'Alla samtal')}</small></div>
        <div class="chf-knappar">
          <button type="button" class="chf-knapp" data-g="chf-stor-ej" aria-pressed="${!!fl.storEj}" title="${fl.storEj ? 'Stör ej är på – klicka för att slå av' : 'Stör ej'}">${ik(fl.storEj ? 'mane' : 'ljud')}</button>
          <button type="button" class="chf-knapp" data-g="chf-helsida" title="Öppna som sida">${ik('helskarm')}</button>
          <button type="button" class="chf-knapp" data-g="chf-min" title="Minimera">${ik('minimera')}</button>
          <button type="button" class="chf-knapp chf-stang" data-g="chf-stang" title="Stäng">${ik('stang')}</button>
        </div></header>
      ${k ? `<div class="ch-trad" data-ch-slapp data-kanal="${e(k.id)}">${floedeHtml(k)}<button type="button" class="ch-ner" data-g="ch-ner" hidden aria-label="Till senaste meddelandet">${ik('chevron')}</button>${skrivHtml(k)}<div class="ch-slapp-lager" aria-hidden="true"><span>${ik('uppladdning')}</span><strong>Släpp för att bifoga</strong><small>Filerna virusskannas först</small></div></div>` : fonsterLista()}
      <span class="chf-grepp" aria-hidden="true"></span>`;
    if (entre) { fonster.removeAttribute('data-in'); void fonster.offsetWidth; fonster.setAttribute('data-in', ''); clearTimeout(inT); inT = setTimeout(() => fonster && fonster.removeAttribute('data-in'), 900); }
    // höjden efter innehållet (listan ryms utan rullning) tills man själv har ändrat storleken
    if (!fl.egen && !smal()) {
      const lista = $('.chf-lista', fonster); let onskad = 600;
      if (lista) { const cs = getComputedStyle(lista); const barn = [...lista.children]; let inne = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + (parseFloat(cs.rowGap) || 0) * Math.max(0, barn.length - 1);
        for (const b of barn) { const bs = getComputedStyle(b); inne += b.offsetHeight + (b.classList.contains('chf-tips') ? 8 : parseFloat(bs.marginTop) || 0) + (parseFloat(bs.marginBottom) || 0); }
        onskad = Math.round($('.chf-topp', fonster).offsetHeight + inne + 4); }
      const h = Math.max(380, Math.min(innerHeight - 32, onskad)); const topp0 = parseFloat(fonster.style.top) || 0; // layoutmåtten, inte entréns transform
      if (Math.abs(fonster.offsetHeight - h) > 2) { fonster.style.height = `${h}px`; if (topp0 + h > innerHeight - 12) fonster.style.top = `${Math.max(8, innerHeight - h - 16)}px`; }
      fonster.dataset.satt = `${fonster.offsetWidth}x${h}`;
    }
    requestAnimationFrame(() => {
      const f = $('[data-ch-floede]', fonster); placeraFloede(f, varNere || (f && $('.ch-farsk.ch-egen', f)), topp, nyKanal);
      requestAnimationFrame(aterstallForslag);
      const t = $('[data-ch-text]', fonster); if (t) { vaxa(t); if (hadeFokus) { t.focus({ preventScroll: true }); t.setSelectionRange(...markorFor(t)); } }
      if (ui.nya.size) setTimeout(() => ui.nya.clear(), 900);
    });
  }
  // bara en storlek som användaren själv dragit fram sparas (den som fönstret satt efter innehållet står i data-satt)
  // Måtten läses i layouten (offsetWidth) – inte i den transformerade rutan, som är mindre medan fönstret glider in. Efter en ny
  // storlek kläms läget, så att ett fönster som dragits åt sidan och sedan gjorts smalare inte försvinner utanför skärmen.
  const storlekObs = 'ResizeObserver' in window ? new ResizeObserver(() => {
    if (!fonster || smal()) return; const r = { width: fonster.offsetWidth, height: fonster.offsetHeight }; if (!r.width || !r.height) return;
    const [sb, sh] = String(fonster.dataset.satt || '0x0').split('x').map(Number);
    if (Math.abs(r.width - sb) <= 2 && Math.abs(r.height - sh) <= 2) { klamFonster(); return; }
    fl.b = Math.round(r.width); fl.h = Math.round(r.height); fl.egen = true; fonster.dataset.satt = `${fl.b}x${fl.h}`; clearTimeout(storlekT); storlekT = setTimeout(sparaFl, 250);
    klamFonster();
  }) : null;
  let storlekT = 0; let inT = 0;
  // dra fönstret i huvudet (inte i knapparna)
  document.addEventListener('pointerdown', (ev) => {
    const h = ev.target.closest && ev.target.closest('[data-chf-dra]'); if (!h || !fonster || ev.button !== 0 || smal() || ev.target.closest('button, a, input, textarea')) return;
    ev.preventDefault(); const r = fonster.getBoundingClientRect(); const dx = ev.clientX - r.left; const dy = ev.clientY - r.top;
    fonster.setAttribute('data-drar', ''); try { h.setPointerCapture(ev.pointerId); } catch (err) { /* ok */ }
    const flytta = (e2) => { fonster.style.left = `${Math.round(Math.min(innerWidth - 100, Math.max(100 - r.width, e2.clientX - dx)))}px`; fonster.style.top = `${Math.round(Math.min(innerHeight - 52, Math.max(0, e2.clientY - dy)))}px`; };
    const slapp = () => { h.removeEventListener('pointermove', flytta); if (!fonster) return; fonster.removeAttribute('data-drar'); const rr = fonster.getBoundingClientRect(); fl.x = Math.round(rr.left); fl.y = Math.round(rr.top); sparaFl(); };
    h.addEventListener('pointermove', flytta); h.addEventListener('pointerup', slapp, { once: true }); h.addEventListener('pointercancel', slapp, { once: true });
  });
  // ikonen: under menyknappen när menyn är infälld, annars nere till höger
  function ritaIkon() {
    const visa = !SKARP && jag() && fl.lage === 'minimerad' && !paChattSidan();
    if (!visa) { if (ikon) { ikon.remove(); ikon = null; } stangIkonMeny(); return; }
    if (!ikon) { ikon = document.createElement('button'); ikon.type = 'button'; ikon.className = 'chf-ikon'; ikon.setAttribute('data-g', 'chf-ikon'); ikon.setAttribute('aria-haspopup', 'menu'); ikon.setAttribute('data-mork-yta', ''); document.body.appendChild(ikon); }
    const n = olastaTotalt();
    ikon.innerHTML = `<span class="chf-ikon-yta">${ik(fl.storEj ? 'mane' : 'prat')}</span>${n ? `<b>${n > 9 ? '9+' : n}</b>` : ''}`;
    ikon.toggleAttribute('data-stor-ej', !!fl.storEj); ikon.setAttribute('aria-expanded', String(!!ikonMeny));
    ikon.setAttribute('aria-label', `Chatten${n ? `, ${plural(n, 'oläst', 'olästa')}` : ''}${fl.storEj ? ', stör ej' : ''}`); ikon.title = ikon.getAttribute('aria-label');
    placeraIkon();
  }
  function placeraIkon() {
    if (!ikon) return;
    if (fl.ikon && !smal()) {
      ikon.style.left = `${Math.round(Math.max(6, Math.min(innerWidth - 58, fl.ikon.x)))}px`; ikon.style.top = `${Math.round(Math.max(6, Math.min(innerHeight - 58, fl.ikon.y)))}px`;
      ikon.removeAttribute('data-hornet'); if (ikonMeny) placeraMeny(); return;
    }
    const knapp = $('[data-sido-knapp]'); const r = knapp && knapp.getClientRects().length ? knapp.getBoundingClientRect() : null;
    const dold = document.documentElement.hasAttribute('data-sido-dold');
    if (r && r.width && dold && !smal()) { ikon.style.left = `${Math.round(r.left + r.width / 2 - 26)}px`; ikon.style.top = `${Math.round(r.bottom + 14)}px`; ikon.removeAttribute('data-hornet'); }
    else { ikon.style.left = ''; ikon.style.top = ''; ikon.setAttribute('data-hornet', ''); }
    if (ikonMeny) placeraMeny();
  }
  let ikonDrag = null; let senastDragen = 0;
  document.addEventListener('pointerdown', (ev) => {
    const i = ev.target.closest && ev.target.closest('.chf-ikon'); if (!i || ev.button !== 0 || smal()) return;
    const r = i.getBoundingClientRect(); ikonDrag = { x0: ev.clientX, y0: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, flyttad: false };
    try { i.setPointerCapture(ev.pointerId); } catch (err) { /* ok */ }
  });
  document.addEventListener('pointermove', (ev) => {
    if (ikonDrag && ikon) {
      if (!ikonDrag.flyttad && Math.hypot(ev.clientX - ikonDrag.x0, ev.clientY - ikonDrag.y0) < 5) return;
      if (!ikonDrag.flyttad) { ikonDrag.flyttad = true; ikon.setAttribute('data-drar', ''); ikon.style.translate = ''; stangIkonMeny(); }
      ikon.removeAttribute('data-hornet');
      ikon.style.left = `${Math.round(Math.max(6, Math.min(innerWidth - 58, ev.clientX - ikonDrag.dx)))}px`; ikon.style.top = `${Math.round(Math.max(6, Math.min(innerHeight - 58, ev.clientY - ikonDrag.dy)))}px`;
      return;
    }
    if (ev.pointerType !== 'mouse' || reducerad()) return;
    for (const el of [ikon, $('[data-sido-knapp]')]) {
      if (!el || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const dx = ev.clientX - cx, dy = ev.clientY - cy; const d = Math.hypot(dx, dy);
      const nara = d < 90; const styrka = nara ? (1 - d / 90) * 0.22 : 0;
      el.style.translate = nara ? `${(dx * styrka).toFixed(1)}px ${(dy * styrka).toFixed(1)}px` : '';
      el.toggleAttribute('data-nara', nara);
    }
  }, { passive: true });
  const slappIkon = () => {
    if (!ikonDrag) return; const d = ikonDrag; ikonDrag = null; if (!ikon) return;
    ikon.removeAttribute('data-drar');
    if (d.flyttad) { const r = ikon.getBoundingClientRect(); fl.ikon = { x: Math.round(r.left), y: Math.round(r.top) }; sparaFl(); senastDragen = Date.now(); ikon.setAttribute('data-landar', ''); setTimeout(() => ikon && ikon.removeAttribute('data-landar'), 600); }
  };
  document.addEventListener('pointerup', slappIkon); document.addEventListener('pointercancel', slappIkon);
  function stangIkonMeny() { if (ikonMeny) { ikonMeny.remove(); ikonMeny = null; } if (ikon) ikon.setAttribute('aria-expanded', 'false'); }
  function placeraMeny() {
    const r = ikon.getBoundingClientRect(); const m = ikonMeny; const b = m.offsetWidth || 250; const h = m.offsetHeight || 180;
    let x; let y;
    if (ikon.hasAttribute('data-hornet')) { x = r.right - b; y = r.top - h - 10; }
    else {
      // bredvid ikonen – ryms menyn inte till höger öppnas den åt vänster, och nära nederkanten uppåt (slutar vid ikonens nederkant)
      x = r.right + 12; if (x + b > innerWidth - 8) x = r.left - b - 12;
      y = r.top - 8; if (y + h > innerHeight - 8) y = r.bottom - h + 8;
    }
    // alltid hela menyn inom fönstret
    m.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - b - 8, x)))}px`; m.style.top = `${Math.round(Math.max(8, Math.min(innerHeight - h - 8, y)))}px`;
  }
  function visaIkonMeny() {
    if (ikonMeny) { stangIkonMeny(); return; }
    const n = olastaTotalt();
    ikonMeny = document.createElement('div'); ikonMeny.className = 'chf-meny'; ikonMeny.setAttribute('role', 'menu'); ikonMeny.setAttribute('data-mork-yta', '');
    ikonMeny.innerHTML = `<p class="chf-meny-rubrik">Chatten<small>${n ? plural(n, 'oläst meddelande', 'olästa meddelanden') : 'Inga olästa'}</small></p>
      <button type="button" role="menuitem" data-g="chf-oppna">${ik('prat')}<span>Öppna chatten</span></button>
      <button type="button" role="menuitemcheckbox" aria-checked="${!!fl.storEj}" data-g="chf-stor-ej">${ik('mane')}<span>Stör ej<small>${fl.storEj ? 'På – inget pling' : 'Av'}</small></span><i class="chf-vaxel" aria-hidden="true"></i></button>
      ${fl.ikon ? `<button type="button" role="menuitem" data-g="chf-ikon-hem">${ik('aterstall')}<span>Tillbaka under menyknappen</span></button>` : ''}
      <button type="button" role="menuitem" data-g="chf-stang">${ik('stang')}<span>Stäng chatten</span></button>`;
    document.body.appendChild(ikonMeny); ikon.setAttribute('aria-expanded', 'true'); placeraMeny();
    requestAnimationFrame(() => { const f = $('button', ikonMeny); if (f) f.focus({ preventScroll: true }); });
  }
  document.addEventListener('pointerdown', (ev) => { if (ikonMeny && !ikonMeny.contains(ev.target) && !(ikon && ikon.contains(ev.target))) stangIkonMeny(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ikonMeny) { stangIkonMeny(); if (ikon) ikon.focus(); } });
  addEventListener('resize', () => { placeraIkon(); uppdateraRaknare(); if (fonster && !smal()) { const r = fonster.getBoundingClientRect(); if (r.left > innerWidth - 100) fonster.style.left = `${innerWidth - r.width - 16}px`; if (r.top > innerHeight - 52) fonster.style.top = `${Math.max(8, innerHeight - r.height - 16)}px`; klamFonster(); } });
  new MutationObserver(() => { placeraIkon(); setTimeout(placeraIkon, 650); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-sido-dold'] });
  // senaste sidan utanför chatten – dit går man när chatten minimeras eller blir ett fönster (aldrig ut ur CRM:et)
  let senasteSida = paChattSidan() ? '#/' : location.hash || '#/';
  addEventListener('hashchange', () => { if (!paChattSidan()) senasteSida = location.hash || '#/'; setTimeout(() => { const ska = fl.lage === 'oppen' && !paChattSidan(); if (ska !== !!fonster) ritaFonster(ska); else ritaIkon(); }, 0); });
  const minimera = () => {
    if (fonster && !reducerad()) { const f = fonster; fonster = null; f.setAttribute('data-ut', ''); setTimeout(() => f.remove(), 320); }
    fl.lage = 'minimerad'; sparaFl(); ritaFonster();
    if (ikon) { ikon.removeAttribute('data-ny'); void ikon.offsetWidth; ikon.setAttribute('data-landar', ''); setTimeout(() => ikon && ikon.removeAttribute('data-landar'), 700); }
  };
  const stangFonster = () => {
    if (fonster && !reducerad()) { const f = fonster; fonster = null; f.setAttribute('data-ut', ''); setTimeout(() => f.remove(), 320); }
    fl.lage = 'stangd'; sparaFl(); stangIkonMeny(); ritaFonster();
    toast('Chatten är stängd – öppna den igen under Meddelanden', { href: '#/chatt', text: 'Meddelanden' }, 'prat');
  };
  window.UPChattFonster = oppnaFonster;

  /* 05-ark: nytt samtal, bjud in, bild i stort */
  const kollegor = () => db().anvandare.filter((u) => arAktiv(u) && u.id !== jag());
  function nyttArk() {
    const folk = kollegor();
    oppnaArk(`${arkHuvud('Nytt samtal', 'Välj en kollega för ett privat samtal eller flera för en grupp.', 'prat')}
      <form data-form="ch-ny" class="ark-kropp" novalidate>
        <div class="ch-valj" role="group" aria-label="Vem">${folk.map((u) => `<label class="ch-valj-rad"><input type="checkbox" name="vem" value="${e(u.id)}">${av(u, 'm')}<span><strong>${e(u.namn)}</strong><small>${e(LED ? `${LED.roller(u).join(' · ')} · ${LED.statusText(u)}` : u.titel || '')}</small></span><i class="ch-valj-bock">${ik('bock')}</i></label>`).join('')}</div>
        <label><span class="etikett">Gruppens namn (när du väljer flera)</span><input class="falt" name="namn" maxlength="40" placeholder="t.ex. Säljteamet, Projekt Bergmark"></label>
        <label><span class="etikett">Första meddelandet (valfritt)</span><textarea class="falt" name="text" rows="2" maxlength="2000" placeholder="Hej!"></textarea></label>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('prat')}Starta</button></div>`);
  }
  function bjudArk(kid) {
    const k = kanal(kid); if (!k || k.typ !== 'grupp' || !arMedlem(k)) return;
    const folk = kollegor().filter((u) => !arMedlem(k, u.id));
    if (!folk.length) { toast('Alla i teamet är redan med i gruppen', null, 'anstallda'); return; }
    oppnaArk(`${arkHuvud(`Bjud in till ${k.namn}`, 'De som bjuds in ser hela samtalet och kan skriva direkt.', 'anvandare-plus')}
      <form data-form="ch-bjud" data-kanal="${e(k.id)}" class="ark-kropp" novalidate>
        <div class="ch-valj" role="group" aria-label="Vem">${folk.map((u) => `<label class="ch-valj-rad"><input type="checkbox" name="vem" value="${e(u.id)}">${av(u, 'm')}<span><strong>${e(u.namn)}</strong><small>${e(LED ? LED.statusText(u) : u.titel || '')}</small></span><i class="ch-valj-bock">${ik('bock')}</i></label>`).join('')}</div>
      </form>
      <div class="ark-fot"><button class="knapp knapp-spok" type="button" data-g="stang-ark">Avbryt</button><button class="knapp knapp-accent" type="button" data-g="skicka-ark">${ik('anvandare-plus')}Bjud in</button></div>`);
  }
  const systemMedd = (kid, text) => { const m = { id: nyId('m'), kanal: kid, av: jag(), tid: new Date().toISOString(), text, system: true }; C().meddelanden.push(m); ui.nya.add(m.id); return m; };
  const namnLista = (ids) => { const n = ids.map((x) => anv(x).kort); return n.length > 1 ? `${n.slice(0, -1).join(', ')} och ${n[n.length - 1]}` : n[0] || ''; };

  /* 06-handlare och formulär */
  // Ändringen av ett eget meddelande avslutas (sparad, avbruten eller annat samtal): utkastet och dess länkar kommer tillbaka
  function slappAndring() {
    const a = ui.andrar; if (!a) return;
    ui.utkast[a.kanal] = a.utkast; if (a.lankar) ui.lankar[a.kanal] = a.lankar; else delete ui.lankar[a.kanal];
    ui.andrar = null; ui.markor = null;
  }
  function avbrytAndring() { if (!ui.andrar) return; slappAndring(); ui.emoji = false; rita(); requestAnimationFrame(fokusText); }
  const ledKonto = LED && LED.G ? LED.G['lp-konto'] : null;
  const G = {
    'ch-ny': () => nyttArk(),
    'chf-popout': (el) => oppnaFonster(el.dataset.id || ui.senastKanal),
    'ch-skriv-till': (el) => { const k = privatKanal(el.dataset.id); if (el.closest('.chf')) { fl.kanal = k.id; sparaFl(); ritaFonster(); requestAnimationFrame(() => { const t = fonster && $('[data-ch-text]', fonster); if (t) t.focus({ preventScroll: true }); }); } else { location.hash = `#/chatt/${k.id}`; requestAnimationFrame(fokusText); } },
    'chf-kanal': (el) => { fl.kanal = el.dataset.id; sparaFl(); ritaFonster(); requestAnimationFrame(() => { const t = fonster && $('[data-ch-text]', fonster); if (t) t.focus({ preventScroll: true }); }); },
    'chf-lista': () => { fl.kanal = null; sparaFl(); ritaFonster(); },
    'chf-helsida': () => { const k = fl.kanal; fl.lage = 'minimerad'; sparaFl(); location.hash = k ? `#/chatt/${k}` : '#/chatt'; },
    'chf-min': () => minimera(),
    'chf-minimera-sida': (el) => { fl.kanal = el.dataset.id || ui.senastKanal || fl.kanal || null; fl.lage = 'minimerad'; sparaFl(); location.hash = senasteSida || '#/'; setTimeout(() => { ritaFonster(); if (ikon) { ikon.setAttribute('data-landar', ''); setTimeout(() => ikon && ikon.removeAttribute('data-landar'), 700); } }, 60); },
    'chf-stang': () => stangFonster(),
    'chf-oppna': () => oppnaFonster(),
    'chf-ikon': () => { if (Date.now() - senastDragen < 350) return; visaIkonMeny(); },
    'chf-ikon-hem': () => { delete fl.ikon; sparaFl(); stangIkonMeny(); placeraIkon(); },
    'chf-stor-ej': () => { fl.storEj = !fl.storEj; sparaFl(); const oppen = !!ikonMeny; stangIkonMeny(); ritaFonster(); if (oppen) visaIkonMeny(); toast(fl.storEj ? 'Stör ej är på – inget pling, olästa räknas ändå' : 'Stör ej är av', null, fl.storEj ? 'mane' : 'ljud'); },
    'ch-info': () => { ui.info = !ui.info; rita(); },
    'ch-emoji': (el) => {
      // markören sparas innan skrivrutan ritas om – annars hamnar emojin först i texten (den nya rutan har markören på 0)
      const t0 = (el && el.closest && el.closest('form') ? $('[data-ch-text]', el.closest('form')) : null) || $('[data-ch-text]');
      if (t0 && document.activeElement === t0) minnsMarkor({ target: t0 });
      ui.emoji = !ui.emoji; rita();
      requestAnimationFrame(() => { if (ui.emoji) { const b = $('.ch-emoji-rutnat button'); if (b) b.focus({ preventScroll: true }); } else fokusText(); });
    },
    'ch-emoji-flik': (el) => { ui.emojiFlik = +el.dataset.i || 0; rita(); const b = $(`[data-g="ch-emoji-flik"][data-i="${ui.emojiFlik}"]`); if (b) b.focus({ preventScroll: true }); },
    'ch-emoji-in': (el) => {
      const f = el.closest('form'); const t = (f && $('[data-ch-text]', f)) || $('[data-ch-text]'); if (!t) return;
      const [a, b] = document.activeElement === t ? [t.selectionStart ?? t.value.length, t.selectionEnd ?? t.value.length] : markorFor(t);
      t.value = `${t.value.slice(0, a)}${el.dataset.em}${t.value.slice(b)}`; const pos = a + el.dataset.em.length;
      const form = t.closest('form'); if (form) { ui.utkast[form.dataset.kanal] = t.value; ui.markor = { kanal: form.dataset.kanal, a: pos, b: pos, text: t.value }; }
      const sv = form && $('.ch-snabbsvar', form); if (sv) sv.hidden = true;
      t.focus({ preventScroll: true }); t.setSelectionRange(pos, pos); vaxa(t);
    },
    // Ändra ett eget meddelande: texten (länkade kunder/affärer som #namn) hamnar i skrivrutan, Enter sparar (m.andrad, "ändrad"
    // vid meddelandet), Esc eller krysset avbryter. Utkastet man höll på med kommer tillbaka efteråt.
    'ch-andra': (el) => {
      const m = C().meddelanden.find((x) => x.id === el.dataset.mid); if (!m || m.av !== jag() || m.system || m.borttagen || !arMedlem(kanal(m.kanal))) return;
      if (ui.andrar && ui.andrar.mid === m.id) { fokusText(); return; }
      slappAndring();
      const kid = m.kanal; const lankar = [];
      const text = String(m.text || '').replace(OBJ, (x, typ, id) => { const o = objekt(typ, id); if (!o) return '#borttagen'; lankar.push({ text: `#${o.namn}`, token: `[[${typ}:${id}]]` }); return `#${o.namn}`; });
      ui.andrar = { mid: m.id, kanal: kid, utkast: ui.utkast[kid] || '', lankar: ui.lankar[kid] };
      ui.lankar[kid] = lankar; ui.utkast[kid] = text; ui.svar = null; ui.emoji = false; ui.markor = { kanal: kid, a: text.length, b: text.length, text };
      rita(); requestAnimationFrame(fokusText);
    },
    'ch-andra-bort': () => avbrytAndring(),
    'ch-trad-meny': (el) => {
      const ram = el.closest('.ch-tk-mer-ram'); const meny = ram && $('.ch-tk-meny', ram); if (!meny) return;
      const oppna = meny.hidden; stangTradMeny();
      if (oppna) { meny.hidden = false; el.setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => { const f = $('button', meny); if (f) f.focus({ preventScroll: true }); }); }
    },
    'ch-saknas-bort': () => { ui.saknas = null; rita(); requestAnimationFrame(() => { const s = $('[data-ch-sok]'); if (s) s.focus({ preventScroll: true }); }); },
    'ch-reagera': (el) => {
      const m = C().meddelanden.find((x) => x.id === el.dataset.mid); if (!m || !arMedlem(kanal(m.kanal))) return;
      const em = el.dataset.em; m.reaktioner = m.reaktioner || {}; const l = m.reaktioner[em] || [];
      m.reaktioner[em] = l.includes(jag()) ? l.filter((x) => x !== jag()) : [...l, jag()];
      if (!m.reaktioner[em].length) delete m.reaktioner[em];
      spara(); rita();
    },
    'ch-snabbsvar': (el) => {
      const form = el.closest('form'); const t = form && $('[data-ch-text]', form); if (!t) return;
      t.value = el.dataset.text; ui.utkast[form.dataset.kanal] = t.value; vaxa(t);
      const sv = el.closest('.ch-snabbsvar'); if (sv) sv.hidden = true;
      t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length);
    },
    'ch-svara': (el) => { slappAndring(); ui.svar = el.dataset.mid; rita(); requestAnimationFrame(fokusText); },
    'ch-svar-bort': () => { ui.svar = null; rita(); requestAnimationFrame(fokusText); },
    'ch-kopiera': async (el) => { const m = C().meddelanden.find((x) => x.id === el.dataset.mid); if (!m) return; try { await navigator.clipboard.writeText(klartext(m.text)); toast('Texten är kopierad', null, 'bock'); } catch (err) { toast('Kunde inte kopiera', null, 'varning'); } },
    'ch-ta-bort': (el) => {
      const m = C().meddelanden.find((x) => x.id === el.dataset.mid); if (!m || m.av !== jag()) return;
      const kopia = { text: m.text, filer: m.filer, reaktioner: m.reaktioner };
      if (ui.andrar && ui.andrar.mid === m.id) slappAndring();
      m.borttagen = true; m.text = ''; delete m.filer; delete m.reaktioner; spara(); rita();
      toast('Meddelandet togs bort', null, 'papperskorg', { atgard: { text: 'Ångra', fn: () => { delete m.borttagen; Object.assign(m, kopia); if (!m.filer) delete m.filer; if (!m.reaktioner) delete m.reaktioner; spara(); rita(); } } });
    },
    'ch-till-medd': (el) => {
      const mal = $(`.ch-medd[data-mid="${el.dataset.mid}"]`); if (!mal) { toast('Meddelandet finns inte kvar', null, 'info'); return; }
      mal.scrollIntoView({ behavior: reducerad() ? 'auto' : 'smooth', block: 'center' }); mal.classList.remove('ch-blixt'); void mal.offsetWidth; mal.classList.add('ch-blixt');
    },
    'ch-ner': () => { const f = $('[data-ch-floede]'); if (f) f.scrollTo({ top: f.scrollHeight, behavior: reducerad() ? 'auto' : 'smooth' }); },
    'ch-bort-bilaga': (el) => { ui.bilagor = ui.bilagor.filter((b) => b.id !== el.dataset.id); sessionFiler.delete(el.dataset.id); rita(); requestAnimationFrame(fokusText); },
    'ch-tyst': (el) => {
      const c = C(); const l = c.tyst[jag()] || []; const kid = el.dataset.id;
      c.tyst[jag()] = l.includes(kid) ? l.filter((x) => x !== kid) : [...l, kid]; spara(); rita();
      toast(tystad(kid) ? 'Ljudet är av för samtalet' : 'Ljudet är på för samtalet', null, tystad(kid) ? 'ljud-av' : 'ljud');
    },
    'ch-avisera': async () => {
      if (!('Notification' in window)) { toast('Webbläsaren kan inte visa aviseringar', null, 'info'); return; }
      if (aviseringLage() === 'pa') { satAvisering(false); rita(); toast('Aviseringarna på skrivbordet är av', null, 'bjallra-av'); return; }
      let p = Notification.permission;
      if (p === 'default') { try { p = await Notification.requestPermission(); } catch (err) { p = 'denied'; } }
      if (p === 'default') { toast('Aviseringarna slogs inte på – webbläsaren frågar igen nästa gång', null, 'info'); return; } // frågan stängdes utan svar
      if (p !== 'granted') { satAvisering(false); rita(); toast('Webbläsaren blockerar aviseringar för sidan – tillåt dem i webbläsarens inställningar och slå på aviseringen igen', null, 'varning'); return; }
      satAvisering(true); rita();
      toast('Aviseringar är på – när fliken inte syns får du en avisering med avsändaren och början av meddelandet', null, 'bjallra');
    },
    'ch-pling': () => {
      let av2 = false; try { av2 = localStorage.getItem('up-crm-pling') === 'av'; if (av2) localStorage.removeItem('up-crm-pling'); else localStorage.setItem('up-crm-pling', 'av'); } catch (err) { /* ok */ }
      rita(); if (av2) pling(); toast(av2 ? 'Plinget är på' : 'Plinget är av', null, av2 ? 'ljud' : 'ljud-av');
    },
    'ch-bjud': (el) => bjudArk(el.dataset.id),
    'ch-lamna': (el) => { const k = kanal(el.dataset.id); if (!k) return; bekrafta({ titel: `Lämna ${k.namn}?`, sym: 'logga-ut', text: 'Du ser inte längre samtalet. Någon i gruppen kan bjuda in dig igen.', knapp: 'Lämna', g: 'ch-lamna-ok', data: { id: k.id }, fara: true }); },
    'ch-lamna-ok': (el) => {
      const k = kanal(el.dataset.id || (el.closest('[data-id]') || {}).dataset?.id); if (!k) { K.stangArk(); return; }
      systemMedd(k.id, `${mig().kort} lämnade gruppen`); k.medlemmar = k.medlemmar.filter((x) => x !== jag());
      spara(); K.stangArk(); ui.info = false; if (fl.kanal === k.id) { fl.kanal = null; sparaFl(); } if (paChattSidan()) location.hash = '#/chatt'; else ritaFonster(); toast(`Du har lämnat ${k.namn}`, null, 'logga-ut');
    },
    'ch-bild': (el) => {
      const f = C().meddelanden.flatMap((m) => m.filer || []).find((x) => x.id === el.dataset.fid); if (!f) return;
      const url = f.data || sessionFiler.get(f.id); if (!url) return;
      oppnaArk(`${arkHuvud(f.namn, f.skanning && f.skanning.status === 'ren' ? 'Virusskannad – inga hot hittades' : '', 'bild')}<div class="ark-kropp ch-storbild"><img src="${e(url)}" alt="${e(f.namn)}"></div>
        <div class="ark-fot"><a class="knapp knapp-glas" href="${e(url)}" download="${e(f.namn)}">${ik('ladda-ner')}Ladda ner</a><button class="knapp knapp-accent" type="button" data-g="stang-ark">Stäng</button></div>`);
    },
    'lp-konto': (el) => {
      // när kortet visar ett nytt meddelande öppnar ett klick samtalet, annars kontomenyn som vanligt
      const kort = el.closest ? el.closest('.anvandarval') : null;
      if (kort && kort.hasAttribute('data-ny-chatt') && senasteNotis) { kort.removeAttribute('data-ny-chatt'); if (paChattSidan()) location.hash = `#/chatt/${senasteNotis.kanal}`; else oppnaFonster(senasteNotis.kanal); senasteNotis = null; return; }
      if (ledKonto) ledKonto(el);
    },
  };
  const FORM = {
    'ch-skicka': (f, d) => {
      const k = kanal(f.dataset.kanal); if (!k || !arMedlem(k)) return;
      const text = String(d.get('text') || '').trim();
      if (ui.andrar && ui.andrar.kanal === k.id) {
        // ändringen av ett eget meddelande sparas (texten byts, m.andrad = när) – samma länkar som när det skickades
        const m = C().meddelanden.find((x) => x.id === ui.andrar.mid); forslag = null;
        if (!m || m.av !== jag() || m.borttagen) { slappAndring(); rita(); toast('Meddelandet finns inte kvar', null, 'info'); return; }
        const ny = medLankar(k.id, text.slice(0, 4000));
        if (!ny && !(m.filer || []).length) { toast('Skriv något – eller ta bort meddelandet', null, 'varning'); fokusText(); return; }
        const andrat = ny !== String(m.text || '');
        if (andrat) { m.text = ny; m.andrad = new Date().toISOString(); }
        slappAndring(); ui.emoji = false;
        if (andrat) { try { spara(); } catch (err) { toast('Ändringen kunde inte sparas', null, 'varning'); } }
        rita(); requestAnimationFrame(fokusText);
        const mal = $(`.ch-medd[data-mid="${m.id}"]`); if (mal && andrat) { mal.classList.remove('ch-blixt'); void mal.offsetWidth; mal.classList.add('ch-blixt'); }
        return;
      }
      if (!text && !ui.bilagor.length) { fokusText(); return; }
      const m = { id: nyId('m'), kanal: k.id, av: jag(), tid: new Date().toISOString(), text: medLankar(k.id, text.slice(0, 4000)) };
      forslag = null;
      if (ui.bilagor.length) m.filer = ui.bilagor.map(({ id, namn, typ, storlek: s, data, skanning }) => ({ id, namn, typ, storlek: s, ...(data ? { data } : {}), ...(skanning ? { skanning } : {}) }));
      const o = ui.svar && C().meddelanden.find((x) => x.id === ui.svar); if (o) m.svar = { mid: o.id, av: o.av, text: String(klartext(o.text) || ((o.filer || [])[0] || {}).namn || '').slice(0, 140) };
      const knapp = f.querySelector('.ch-skicka');
      if (knapp && !reducerad()) { const r = knapp.getBoundingClientRect(); const p = document.createElement('span'); p.className = 'ch-flyg'; p.setAttribute('aria-hidden', 'true'); p.innerHTML = ik('skicka'); p.style.left = `${r.left + r.width / 2}px`; p.style.top = `${r.top + r.height / 2}px`; document.body.appendChild(p); setTimeout(() => p.remove(), 800); }
      C().meddelanden.push(m); markeraLast(k.id); ui.nya.add(m.id); ui.bilagor = []; ui.utkast[k.id] = ''; ui.emoji = false; ui.svar = null; ui.olastFran = {}; ui.markor = null;
      try { spara(); } catch (err) { toast('Meddelandet kunde inte sparas', null, 'varning'); }
      rita(); requestAnimationFrame(fokusText);
    },
    'ch-ny': (f, d) => {
      const vem = d.getAll('vem').filter((x) => db().anvandare.some((u) => u.id === x));
      if (!vem.length) { toast('Välj minst en kollega', null, 'varning'); return; }
      const namn = String(d.get('namn') || '').trim().slice(0, 40); const text = String(d.get('text') || '').trim();
      let k;
      if (vem.length === 1 && !namn) {
        k = C().kanaler.find((x) => x.typ === 'privat' && arMedlem(x) && arMedlem(x, vem[0]) && x.medlemmar.length === 2);
        if (!k) { k = { id: nyId('c'), typ: 'privat', medlemmar: [jag(), vem[0]], skapad: new Date().toISOString(), skapadAv: jag() }; C().kanaler.push(k); }
      } else {
        k = { id: nyId('c'), typ: 'grupp', namn: namn || [mig().kort, ...vem.map((x) => anv(x).kort)].join(', '), medlemmar: [jag(), ...vem], skapad: new Date().toISOString(), skapadAv: jag() };
        C().kanaler.push(k); systemMedd(k.id, `${mig().kort} skapade gruppen och bjöd in ${namnLista(vem)}`);
      }
      if (text) { const m = { id: nyId('m'), kanal: k.id, av: jag(), tid: new Date().toISOString(), text: text.slice(0, 2000) }; C().meddelanden.push(m); ui.nya.add(m.id); }
      markeraLast(k.id); spara(); K.stangArk(); if (fonster && !paChattSidan()) { fl.kanal = k.id; sparaFl(); ritaFonster(); } else location.hash = `#/chatt/${k.id}`; requestAnimationFrame(fokusText);
    },
    'ch-bjud': (f, d) => {
      const k = kanal(f.dataset.kanal); if (!k || !arMedlem(k)) return;
      const vem = d.getAll('vem').filter((x) => !arMedlem(k, x) && db().anvandare.some((u) => u.id === x));
      if (!vem.length) { toast('Välj vem du vill bjuda in', null, 'varning'); return; }
      k.medlemmar = [...k.medlemmar, ...vem]; systemMedd(k.id, `${mig().kort} bjöd in ${namnLista(vem)}`);
      spara(); K.stangArk(); rita(); toast(`${namnLista(vem)} är med i ${k.namn}`, null, 'anvandare-plus');
    },
    'ch-namn': (f, d) => {
      const k = kanal(f.dataset.kanal); if (!k || k.typ !== 'grupp' || !arMedlem(k)) return;
      const namn = String(d.get('namn') || '').trim().slice(0, 40); if (!namn || namn === k.namn) return;
      k.namn = namn; systemMedd(k.id, `${mig().kort} döpte om gruppen till ${namn}`); spara(); rita(); toast('Gruppen har fått nytt namn', null, 'redigera');
    },
  };
  const vagar = [
    [/^#\/chatt$/, () => visaChatt(null), 'chatt', 'Meddelanden'],
    [/^#\/chatt\/([\w-]+)$/, (id) => visaChatt(id), 'chatt', 'Meddelanden'],
  ];
  return { vagar, G, FORM, kolla, olastaTotalt, nollstall };
};
