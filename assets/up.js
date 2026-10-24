/* Uperformance – beteenden för startsidan. Ingen byggprocess, inga beroenden. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kr = (n) => Math.round(n).toLocaleString('sv-SE').replace(/,/g, ' ') + ' kr';

  /* Personaväxel ------------------------------------------------------------ */
  const satPersona = (p) => {
    if (p === 'idrott') html.dataset.persona = 'idrott'; else delete html.dataset.persona;
    $$('[data-persona-knapp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.personaKnapp === (p || 'foretag'))));
    try { localStorage.setItem('up-persona', p); } catch (e) { /* privat läge */ }
  };
  satPersona(html.dataset.persona === 'idrott' ? 'idrott' : 'foretag');
  $$('[data-persona-knapp]').forEach((b) => b.addEventListener('click', () => satPersona(b.dataset.personaKnapp)));

  /* Demo-inloggningen i CRM:et gäller bara så länge man är kvar där: den som går till hemsidan
     loggas ut och får logga in igen via inloggningssidan (pageshow täcker även bakåtknappen) */
  const loggaUtCrm = () => { try { localStorage.removeItem('up-crm-inloggad'); } catch (err) { /* privat läge */ } };
  loggaUtCrm();
  addEventListener('pageshow', loggaUtCrm);

  /* Meny -------------------------------------------------------------------- */
  const topp = $('[data-topp]');
  const merScroll = () => { if (topp) topp.toggleAttribute('data-scrollad', scrollY > 24); };
  addEventListener('scroll', merScroll, { passive: true });
  merScroll();

  // Mobilmenyn växer fram i en cirkel från menyknappen; länkarna glider in en i taget (--i)
  const mobil = $('[data-mobilmeny]');
  const oppna = $('[data-meny-oppna]');
  if (mobil) $$(':scope > a', mobil).forEach((a, i) => a.style.setProperty('--i', i));
  const stangMeny = () => {
    if (!mobil || !mobil.hasAttribute('data-oppen')) return;
    mobil.removeAttribute('data-oppen');
    document.body.removeAttribute('data-meny-oppen');
    if (oppna) { oppna.setAttribute('aria-expanded', 'false'); oppna.setAttribute('aria-label', 'Öppna menyn'); }
    document.body.style.overflow = '';
  };
  const oppnaMeny = () => {
    const b = oppna.getBoundingClientRect();
    mobil.style.setProperty('--ox', `${b.left + b.width / 2}px`);
    mobil.style.setProperty('--oy', `${b.top + b.height / 2}px`);
    mobil.setAttribute('data-oppen', '');
    document.body.setAttribute('data-meny-oppen', '');
    oppna.setAttribute('aria-expanded', 'true'); oppna.setAttribute('aria-label', 'Stäng menyn');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const forsta = $('a', mobil); if (forsta) forsta.focus({ preventScroll: true }); }, 450);
  };
  oppna && mobil && oppna.addEventListener('click', () => { if (mobil.hasAttribute('data-oppen')) stangMeny(); else oppnaMeny(); });
  $('[data-meny-stang]') && $('[data-meny-stang]').addEventListener('click', () => { stangMeny(); oppna && oppna.focus(); });
  // Ankarlänkar stänger menyn; länkar till andra sidor låter den ligga kvar medan sidan tonar ut
  mobil && $$('a', mobil).forEach((a) => a.addEventListener('click', () => { if ((a.getAttribute('href') || '').startsWith('#')) stangMeny(); }));
  addEventListener('pageshow', (ev) => { if (ev.persisted) stangMeny(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mobil && mobil.hasAttribute('data-oppen')) { stangMeny(); oppna && oppna.focus(); } });

  // Markera aktuell sektion i menyn
  const menyLankar = $$('.meny-lista .meny-lank');
  const sektioner = menyLankar.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sektioner.length) {
    const io = new IntersectionObserver((poster) => {
      poster.forEach((p) => {
        if (!p.isIntersecting) return;
        menyLankar.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + p.target.id)));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sektioner.forEach((s) => io.observe(s));
  }

  /* Räkna upp nyckeltal ------------------------------------------------------- */
  const raknaUpp = (el) => {
    const mal = parseFloat(el.dataset.tal);
    const dec = parseInt(el.dataset.decimaler || '0', 10);
    const format = (v) => v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (lugn) { el.textContent = format(mal); return; }
    const start = performance.now();
    const tid = 1600;
    const steg = (t) => {
      const p = Math.min(1, (t - start) / tid);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = format(mal * e);
      if (p < 1) requestAnimationFrame(steg);
    };
    requestAnimationFrame(steg);
  };

  /* Framtoning när block når vyn ---------------------------------------------- */
  const visa = (el) => {
    if (el.hasAttribute('data-synlig')) return;
    el.setAttribute('data-synlig', '');
    $$('[data-tal]', el).forEach(raknaUpp);
  };
  const block = $$('[data-in]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((poster) => {
      poster.forEach((p) => { if (p.isIntersecting) { visa(p.target); io.unobserve(p.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    block.forEach((b) => io.observe(b));
  } else {
    block.forEach(visa);
  }

  // Dekor som rör sig hela tiden pausas utanför bild (data-vilar, modul 15 i up.css): skimrande ord,
  // berättelsens bilder (stjärnor, Ken Burns, skimmer) och paketens ljusramar. Annars målas de om i varje bildruta.
  if ('IntersectionObserver' in window) {
    const vila = new IntersectionObserver((poster) => poster.forEach((p) => p.target.toggleAttribute('data-vilar', !p.isIntersecting)), { rootMargin: '100px 0px' });
    $$('.skimmer, .bs, .paket-rutnat, .sidfot-ord').forEach((el) => vila.observe(el));
  }

  // Filmloopar i korten (modul 21 i up.css): laddas när kortet syns, spelar bara i bild. Reducerad rörelse/dataspar → bara fotot.
  const loopar = $$('video.loopfilm[data-loop]');
  const sparData = navigator.connection && navigator.connection.saveData;
  if (loopar.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches && !sparData) {
    const loopIo = new IntersectionObserver((poster) => poster.forEach((p) => {
      const v = p.target;
      if (p.isIntersecting) {
        if (!v.src) {
          v.src = `${v.dataset.loop}${matchMedia('(max-width: 700px)').matches ? '-sm' : ''}.mp4`;
          v.addEventListener('playing', () => v.setAttribute('data-spelar', ''), { once: true });
        }
        const lova = v.play(); if (lova && lova.catch) lova.catch(() => { /* autoplay nekad – fotot står kvar */ });
      } else if (!v.paused) v.pause();
    }), { rootMargin: '200px 0px' });
    loopar.forEach((v) => loopIo.observe(v));
  }

  // Hjältens bakgrund pausas när den är ur bild – sparar batteri
  const hero = $('[data-hero]');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([p]) => hero.toggleAttribute('data-pausad', !p.isIntersecting)).observe(hero);
  }

  // Hjältescenen lutar lätt efter musen (--sx/--sy, -1…1): riskprofilen vrids i 3D, sidokorten glider – bara med mus
  if (hero && !lugn && matchMedia('(hover: hover)').matches) {
    let ram = 0, mx = 0, my = 0;
    const luta = () => {
      ram = 0;
      $$('.scen', hero).forEach((scen) => {
        const r = scen.getBoundingClientRect();
        if (!r.width) return; // den dolda personans scen
        const sx = Math.max(-1, Math.min(1, (mx - (r.left + r.width / 2)) / (r.width / 2)));
        const sy = Math.max(-1, Math.min(1, (my - (r.top + r.height / 2)) / (r.height / 2)));
        scen.style.setProperty('--sx', sx.toFixed(3));
        scen.style.setProperty('--sy', sy.toFixed(3));
      });
    };
    hero.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!ram) ram = requestAnimationFrame(luta); });
    hero.addEventListener('pointerleave', () => $$('.scen', hero).forEach((s) => { s.style.setProperty('--sx', '0'); s.style.setProperty('--sy', '0'); }));
  }

  /* Film ------------------------------------------------------------------------ */
  const film = $('[data-film]');
  const video = $('[data-film-video]');
  const filmKnapp = $('[data-film-knapp]');
  if (film && video && filmKnapp) {
    let anvandarenPausade = lugn; // med reducerad rörelse startar filmen bara på begäran
    let synlig = false;
    const uppdatera = () => {
      const spelar = !video.paused;
      filmKnapp.setAttribute('aria-pressed', String(spelar));
      $('use', filmKnapp).setAttribute('href', spelar ? '#i-paus' : '#i-play');
      $('[data-film-text]', filmKnapp).textContent = spelar ? 'Pausa film' : 'Spela film';
    };
    const spela = () => { video.preload = 'auto'; const p = video.play(); if (p && p.catch) p.catch(() => {}); };
    video.addEventListener('play', uppdatera);
    video.addEventListener('pause', uppdatera);
    filmKnapp.addEventListener('click', () => {
      if (video.paused) { anvandarenPausade = false; spela(); } else { anvandarenPausade = true; video.pause(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([p]) => {
        synlig = p.isIntersecting;
        if (synlig && !anvandarenPausade) spela();
        if (!synlig && !video.paused) video.pause();
      }, { threshold: 0.25 }).observe(film);
    }
  }

  /* Kontaktformulär ------------------------------------------------------------------ */
  // Sätt data-endpoint på formuläret (t.ex. en Formspree-adress) för att skicka på riktigt.
  const form = $('[data-kontaktformular]');
  if (form) {
    const svar = $('[data-formular-svar]', form);
    const meddela = (typ, text) => { svar.dataset.typ = typ; svar.textContent = text; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const namn = form.elements.namn, epost = form.elements.epost;
      if (!namn.value.trim()) { meddela('fel', 'Skriv ditt namn.'); namn.focus(); return; }
      if (!epost.value.trim() || !epost.checkValidity()) { meddela('fel', 'Skriv en giltig e-postadress.'); epost.focus(); return; }
      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        meddela('info', 'Förhandsversion: formuläret är inte kopplat ännu, så inget har skickats.');
        return;
      }
      const knapp = $('button[type="submit"]', form);
      knapp.disabled = true;
      try {
        const r = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        meddela('ok', 'Tack! Vi hör av oss så snart vi kan.');
      } catch (err) {
        meddela('fel', 'Något gick fel. Försök igen om en stund.');
      } finally {
        knapp.disabled = false;
      }
    });
  }

  /* Berättelsen: bilder som i CRM:ets presentationsläge – raden längst ner visar bildens namn,
     prickar och "3 / 8", och pilarna/prickarna scrollar till föregående/nästa bild ------------------- */
  const berattelse = $('[data-berattelse]');
  if (berattelse) {
    const bilder = $$('.bs', berattelse);
    const aktuell = $('[data-bs-aktuell]', berattelse);
    const raknare = $('[data-bs-raknare]', berattelse);
    const prickar = $('[data-bs-prickar]', berattelse);
    const [bak, fram] = $$('[data-bs-steg]', berattelse);
    bilder.forEach((b, i) => {
      const p = document.createElement('button');
      p.type = 'button'; p.setAttribute('aria-label', `${i + 1}. ${b.dataset.bsNamn}`);
      p.addEventListener('click', () => b.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' }));
      prickar.appendChild(p);
    });
    let index = -1;
    const visaIndex = (i) => {
      if (i === index) return; index = i;
      aktuell.textContent = bilder[i].dataset.bsNamn;
      raknare.textContent = `${i + 1} / ${bilder.length}`;
      [...prickar.children].forEach((p, j) => p.setAttribute('aria-current', String(j === i)));
      bak.disabled = i === 0; fram.disabled = i === bilder.length - 1;
    };
    let ram = 0;
    const uppdatera = () => {
      ram = 0; const mitt = innerHeight * .5; let i = 0;
      bilder.forEach((b, j) => { if (b.getBoundingClientRect().top < mitt) i = j; });
      visaIndex(i);
    };
    [bak, fram].forEach((knapp) => knapp.addEventListener('click', () => {
      const mal = bilder[Math.max(0, Math.min(bilder.length - 1, index + Number(knapp.dataset.bsSteg)))];
      mal.scrollIntoView({ behavior: lugn ? 'auto' : 'smooth', block: 'start' });
    }));
    addEventListener('scroll', () => { if (!ram) ram = requestAnimationFrame(uppdatera); }, { passive: true });
    addEventListener('resize', () => { if (!ram) ram = requestAnimationFrame(uppdatera); });
    uppdatera();
  }

  /* Premiumkorten (Bas+ och Bas++) – gnistor med slumpad plats och fart (antal i data-premium-gnistor, annars 16),
     bockarna tänds i tur och ordning (--j), och på datorer lutar kortet i 3D efter musen medan ett ljus följer
     den (--rx/--ry, --lx/--ly). Bas+ dämpar lutningen med --luta i CSS. Utanför bild pausas allt (data-vilar). ---- */
  $$('[data-premium]').forEach((premium) => {
    const gnistor = $('[data-premium-gnistor]', premium);
    const farger = ['var(--accent)', 'var(--is)', '#fff'];
    const antal = Number(gnistor.dataset.premiumGnistor) || 16;
    for (let i = 0; i < antal; i++) {
      const g = document.createElement('i');
      const t = 3.2 + Math.random() * 3;
      g.style.cssText = `--x:${(4 + Math.random() * 92).toFixed(1)}%;--dx:${Math.round(Math.random() * 60 - 30)}px;--s:${(6 + Math.random() * 8).toFixed(1)}px;--t:${t.toFixed(2)}s;--f:${(-Math.random() * t).toFixed(2)}s;--c:${farger[i % 3]}`;
      gnistor.appendChild(g);
    }
    $$('.paket-lista .ikon', premium).forEach((ikon, i) => ikon.style.setProperty('--j', i));
    if (!lugn && matchMedia('(hover: hover)').matches) {
      let ram = 0, px = 0, py = 0;
      const rita = () => {
        ram = 0;
        const r = premium.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (px - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (py - r.top) / r.height));
        premium.style.setProperty('--lx', `${Math.round(x * premium.offsetWidth)}px`); // ljusfläcken flyttas med translate
        premium.style.setProperty('--ly', `${Math.round(y * premium.offsetHeight)}px`);
        premium.style.setProperty('--ry', `${((x - .5) * 10).toFixed(2)}deg`);
        premium.style.setProperty('--rx', `${((.5 - y) * 8).toFixed(2)}deg`);
      };
      premium.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; if (!ram) ram = requestAnimationFrame(rita); });
      premium.addEventListener('pointerleave', () => { premium.style.setProperty('--rx', '0deg'); premium.style.setProperty('--ry', '0deg'); });
    }
  });

  /* Sidfotens stora ord: en span per bokstav (--k) för framtoningen, plus en kopia i ljusfönstret (.ord-ljus)
     med exakt samma uppdelning så att ljuset hamnar precis på bokstäverna (stil och rörelse i modul 14) */
  const ord = $('.sidfot-ord');
  if (ord) {
    const text = ord.textContent.trim();
    const bokstaver = (klass) => [...text].map((t, k) => `<span class="${klass}" style="--k:${k}">${t}</span>`).join('');
    ord.innerHTML = bokstaver('ord-bokstav') + `<span class="ord-ljus"><span>${bokstaver('ord-bokstav-ljus')}</span></span>`;
  }

  /* Årtal i sidfoten */
  const ar = $('[data-ar]'); if (ar) ar.textContent = String(new Date().getFullYear());
})();
