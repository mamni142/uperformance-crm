/* Uperformance CRM – filreglerna (2026-10-24). EN källa för kontrollen av uppladdade filer: webbläsarens filskanner
   (filskanner.js, med förlopp per steg) och servern (server/api-crm.js, POST /api/filer/:id – där kan kontrollen inte
   kringgås). Bara ECMAScript: inga window, document, Blob eller Node-moduler – byten in som Uint8Array (Node: Buffer).
   Fynd: { allvar: 'blockera' | 'varna' | 'lag', text }. Blockera = filen tas inte emot; varna/lag = släpps igenom med en
   markering. Servern är strängare än webbläsaren på en punkt: innehållet måste stämma med filtypen (typFynd).
   Det här är en grundkontroll – i drift ska servern dessutom skanna med ett antivirusprogram (ClamAV, server/FLYTT.md). */
(function (rot, fabrik) {
  const R = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = R; else rot.UPFilregler = R;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX = 25 * 1024 * 1024;
  const FARLIG = /\.(exe|com|bat|cmd|scr|pif|msi|msp|msix|appx|dll|sys|cpl|ocx|jar|jse?|vbe?|vbs|wsf|wsh|ps1|psm1|psd1|hta|lnk|url|reg|inf|scf|iso|img|vhdx?|apk|dmg|pkg|sh|bash|command|run|bin|elf|deb|rpm|appimage|gadget|chm|xll|wll|xlam|ppam)$/i;
  const MAKRO = /\.(docm|dotm|xlsm|xltm|xlsb|pptm|potm|ppsm|sldm)$/i;
  const TEXT = /\.(txt|csv|json|md|xml|html?|svg|ics|vcf|rtf|log)$/i;
  const RIKTNING = /[‪-‮⁦-⁩‎‏]/;
  const tecken = (b, fran, n) => { let s = ''; for (let i = fran; i < Math.min(b.length, fran + n); i++) s += String.fromCharCode(b[i]); return s; };
  // Byten som text (en byte = ett tecken) – för mönster i innehållet
  const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(b.length, i + 0x8000))); return s; };
  const storlek = (n) => (n >= 1048576 ? `${(n / 1048576).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024)).toLocaleString('sv-SE')} kB`);
  // [filändelser, stämmer innehållet?, namn]
  const SIGNATUR = [
    [/\.pdf$/i, (b) => tecken(b, 0, 5) === '%PDF-', 'PDF'],
    [/\.png$/i, (b) => b[0] === 0x89 && tecken(b, 1, 3) === 'PNG', 'PNG-bild'],
    [/\.jpe?g$/i, (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'JPEG-bild'],
    [/\.gif$/i, (b) => tecken(b, 0, 4) === 'GIF8', 'GIF-bild'],
    [/\.webp$/i, (b) => tecken(b, 0, 4) === 'RIFF' && tecken(b, 8, 4) === 'WEBP', 'WebP-bild'],
    [/\.(heic|heif|avif|mp4|m4a|mov)$/i, (b) => tecken(b, 4, 4) === 'ftyp', 'bild/film'],
    [/\.(docx|xlsx|pptx|odt|ods|odp|zip|docm|xlsm|pptm|dotm|xltm|potm|ppsm)$/i, (b) => b[0] === 0x50 && b[1] === 0x4b && [3, 5, 7].includes(b[2]), 'Office-/zip-fil'],
    [/\.(doc|xls|ppt|msg)$/i, (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0, 'äldre Office-fil'],
    [/\.(webm|mkv)$/i, (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3, 'WebM'],
    [/\.mp3$/i, (b) => tecken(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), 'MP3'],
    [/\.wav$/i, (b) => tecken(b, 0, 4) === 'RIFF' && tecken(b, 8, 4) === 'WAVE', 'WAV'],
    [/\.(ogg|oga)$/i, (b) => tecken(b, 0, 4) === 'OggS', 'Ogg'],
  ];
  // EICAR-testsignaturen byggs vid körning – annars skulle själva källfilen kunna larma hos ett antivirusprogram
  const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS', '-TEST-FILE!$H+H*'].join('');
  const fynd = () => { const f = []; f.blockera = (text) => f.push({ allvar: 'blockera', text }); f.varna = (text) => f.push({ allvar: 'varna', text }); f.lag = (text) => f.push({ allvar: 'lag', text }); return f; };

  /* 1. Namn och storlek */
  function namnFynd(namn, storl) {
    const f = fynd(); const n = String(namn || 'fil');
    if (RIKTNING.test(n)) f.blockera('Filnamnet har dolda riktningstecken som kan gömma den riktiga filändelsen');
    if (FARLIG.test(n)) {
      const d = n.toLowerCase().split('.'); const fore = d.length > 2 ? d[d.length - 2] : '';
      f.blockera(/^(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|csv|zip)$/.test(fore) ? `Dubbel filändelse – filen låtsas vara en .${fore} men är en .${d[d.length - 1]} (kan köra program)` : `Filtypen .${d[d.length - 1]} kan köra program och tas inte emot`);
    }
    if (storl > MAX) f.blockera(`Filen är ${storlek(storl)} – högst ${storlek(MAX)} tas emot`);
    if (!storl) f.varna('Filen är tom');
    return f;
  }
  /* 2. Filändelsen mot signaturen i de första byten */
  function signaturFynd(namn, huvud, storl) {
    const f = fynd(); const n = String(namn || '');
    const sig = SIGNATUR.find(([re]) => re.test(n));
    if (sig && storl && huvud.length && !sig[1](huvud)) f.varna(`Innehållet ser inte ut som en ${sig[2]} – filen kan vara omdöpt`);
    if (TEXT.test(n) && huvud.includes(0)) f.varna('Textfilen innehåller binärdata');
    return f;
  }
  /* 3. Körbar kod (Windows, Linux, Mac, skript) och makron/program i zip-baserade filer (Office) */
  function korbar(huvud) {
    const ord = huvud.length >= 4 ? ((huvud[0] << 24) | (huvud[1] << 16) | (huvud[2] << 8) | huvud[3]) >>> 0 : 0;
    if (huvud[0] === 0x4d && huvud[1] === 0x5a) return 'Filen är ett Windows-program (körbar kod)';
    if (huvud[0] === 0x7f && tecken(huvud, 1, 3) === 'ELF') return 'Filen är ett Linux-program (körbar kod)';
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(ord)) return 'Filen är ett Mac-program (körbar kod)';
    return '';
  }
  function kodFynd(namn, huvud, zipText) {
    const f = fynd(); const n = String(namn || '');
    const k = korbar(huvud);
    if (k) f.blockera(k);
    else if (tecken(huvud, 0, 2) === '#!' && !TEXT.test(n)) f.blockera('Filen är ett skript som kan köras');
    if (huvud[0] === 0x50 && huvud[1] === 0x4b && zipText) {
      // zip-baserat (Office m.fl.): filnamnen i arkivet ligger okomprimerade – leta efter makron och program
      if (/vbaProject\.bin/i.test(zipText)) f.blockera('Office-filen innehåller makron (VBA)');
      const prog = zipText.match(/[\w\-./ ]{1,80}\.(exe|scr|bat|cmd|com|js|vbs|ps1|hta|jar|msi|lnk|dll)(?=[\x00-\x1f])/i);
      if (prog) f.blockera(`Arkivet innehåller ett program (${prog[0].split('/').pop()})`);
    }
    if (MAKRO.test(n) && !f.some((x) => /makron/.test(x.text))) f.varna('Filtypen kan innehålla makron – öppna den bara om du litar på avsändaren');
    return f;
  }
  /* 4. Innehållet: testviruset EICAR, skript i HTML/SVG, startåtgärder och JavaScript i PDF, formler i CSV.
     CSV: formler som kör program (cmd|, DDE, MSEXCEL …) stoppas – de har ingen användning i CRM:et och kollegor öppnar filen
     i Excel. Formler som hämtar från eller länkar till webben får en varning, andra formler (=SUMMA …) en låg varning. */
  // En cell börjar efter radbrytning eller avgränsare; formeln får inte gå över i nästa cell ([^;,\t\r\n])
  const CELL = '(?:^|[;,\\t\\r\\n])[ \\t]*"?[ \\t]*';
  const CSV_KOR = new RegExp(`${CELL}[=+@-][^;,\\t\\r\\n]{0,200}?\\b(?:cmd|msexcel|powershell|pwsh|mshta|rundll32|regsvr32|wscript|cscript)\\s*\\|`, 'i');
  const CSV_DDE = new RegExp(`${CELL}[=+@-][ \\t]*DDE(?:AUTO)?[ \\t]*\\(|\\bDDEAUTO\\b`, 'i');
  const CSV_WEBB = new RegExp(`${CELL}[=+@-][^;,\\t\\r\\n]{0,80}?\\b(?:HYPERLINK|HYPERLÄNK|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTFEED|WEBSERVICE|WEBBTJÄNST|FILTERXML)[ \\t]*\\(`, 'i');
  const CSV_FORMEL = new RegExp(`${CELL}(?:=[^\\r\\n;,]|[+@-][ \\t]*[A-Za-zÅÄÖåäö_][\\w.]*[ \\t]*\\()`);
  function csvFynd(text) {
    const f = fynd();
    if (CSV_KOR.test(text) || CSV_DDE.test(text)) f.blockera('CSV-filen innehåller formler som kör program i Excel (cmd/DDE) – den tas inte emot');
    else if (CSV_WEBB.test(text)) f.varna('CSV-filen innehåller formler som hämtar från eller länkar till webben (t.ex. HYPERLINK) – öppna den med försiktighet');
    else if (CSV_FORMEL.test(text)) f.lag('CSV-filen innehåller formler (t.ex. =SUMMA) – de räknas när filen öppnas i Excel');
    return f;
  }
  function innehallFynd(namn, text, typ) {
    const f = fynd(); const n = String(namn || ''); const t = String(text || '');
    if (t.includes(EICAR)) f.blockera('Testviruset EICAR hittades (standardfilen för att prova antivirusskydd)');
    if (/\.(html?|svg|xml)$/i.test(n) || /^\s*<(?:!doctype|html|svg)/i.test(t.slice(0, 300))) { if (/<script\b|javascript:|\son[a-z]+\s*=/i.test(t)) f.blockera('Filen innehåller skript (HTML/SVG med kod)'); }
    if (t.startsWith('%PDF-')) {
      if (/\/Launch\b/.test(t)) f.blockera('PDF:en försöker starta ett program (/Launch)');
      if (/\/(JavaScript|JS)\b/.test(t)) f.varna('PDF:en innehåller JavaScript');
      if (/\/EmbeddedFile\b/.test(t)) f.varna('PDF:en har inbäddade filer');
    }
    if (/\.csv$/i.test(n) || typ === 'text/csv') f.push(...csvFynd(t));
    return f;
  }

  /* Serverns kontroll av filtypen: vad innehållet är (de första byten) mot den typ som klienten anger (Content-Type).
     Windows skickar ofta en CSV som application/vnd.ms-excel – därför godtas text för den typen när namnet slutar på .csv. */
  function innehallsTyp(b) {
    if (!b || !b.length) return 'tom';
    if (korbar(b)) return 'program';
    if (tecken(b, 0, 5) === '%PDF-') return 'pdf';
    if (b[0] === 0x89 && tecken(b, 1, 3) === 'PNG') return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (tecken(b, 0, 4) === 'RIFF' && tecken(b, 8, 4) === 'WEBP') return 'webp';
    if (tecken(b, 0, 4) === 'RIFF' && tecken(b, 8, 4) === 'WAVE') return 'wav';
    if (b[0] === 0x50 && b[1] === 0x4b && [3, 5, 7].includes(b[2])) return 'zip';
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
    if (tecken(b, 4, 4) === 'ftyp') return 'mp4';
    if (tecken(b, 0, 4) === 'OggS') return 'ogg';
    if (tecken(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
    if (!b.subarray(0, 8192).includes(0)) return 'text';
    return 'okand';
  }
  // Lösenordsskyddade Office-filer (även .docx/.xlsx) är OLE-behållare – därför godtas båda formerna för Office
  const TYP_INNEHALL = {
    'application/pdf': ['pdf'], 'image/png': ['png'], 'image/jpeg': ['jpeg'], 'image/webp': ['webp'],
    'text/plain': ['text', 'tom'], 'text/csv': ['text', 'tom'],
    'application/msword': ['ole', 'zip'], 'application/vnd.ms-excel': ['ole', 'zip'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip', 'ole'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zip', 'ole'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['zip', 'ole'],
    'audio/webm': ['webm'], 'audio/mp4': ['mp4'], 'audio/ogg': ['ogg'], 'audio/mpeg': ['mp3'], 'audio/wav': ['wav'],
  };
  const INNEHALL_NAMN = { pdf: 'en PDF', png: 'en PNG-bild', jpeg: 'en JPEG-bild', webp: 'en WebP-bild', wav: 'ljud (WAV)', zip: 'ett zip-arkiv', ole: 'en äldre Office-fil', webm: 'ljud (WebM)', mp4: 'ljud eller film (MP4)', ogg: 'ljud (Ogg)', mp3: 'ljud (MP3)', text: 'text', tom: 'en tom fil', okand: 'okända binärdata', program: 'ett program' };
  function typFynd(typ, namn, huvud) {
    const f = fynd(); const ok = TYP_INNEHALL[typ];
    if (!ok) return f; // okända typer stoppas redan av listan över tillåtna typer
    // PDF-standarden tillåter skräp före huvudet (inom de första 1 024 byten)
    const inne = typ === 'application/pdf' && !korbar(huvud) && tecken(huvud, 0, 1024).includes('%PDF-') ? 'pdf' : innehallsTyp(huvud);
    const tillatna = typ === 'application/vnd.ms-excel' && /\.csv$/i.test(String(namn || '')) ? [...ok, 'text', 'tom'] : ok;
    if (inne !== 'program' && !tillatna.includes(inne)) f.blockera(`Innehållet stämmer inte med filtypen (${typ}) – filen ser ut att vara ${INNEHALL_NAMN[inne] || 'något annat'}`);
    return f;
  }
  const status = (lista) => (lista.some((x) => x.allvar === 'blockera') ? 'blockerad' : lista.length ? 'varning' : 'ren');

  /* Hela kontrollen på en gång (servern): { fynd, status }. bytes = hela filen. */
  function granska({ namn, typ = '', bytes }) {
    const b = bytes || new Uint8Array(0);
    const huvud = b.subarray(0, 4096);
    const text = latin1(b.subarray(0, Math.min(b.length, 8 * 1024 * 1024)));
    const alla = [...namnFynd(namn, b.length), ...typFynd(typ, namn, huvud), ...signaturFynd(namn, huvud, b.length),
      ...kodFynd(namn, huvud, huvud[0] === 0x50 && huvud[1] === 0x4b ? text : ''), ...innehallFynd(namn, text, typ)];
    const sedda = new Set(); const fl = alla.filter((x) => { const k = x.allvar + x.text; if (sedda.has(k)) return false; sedda.add(k); return true; }).map(({ allvar, text: t }) => ({ allvar, text: t }));
    return { fynd: fl, status: status(fl) };
  }

  return { MAX, FARLIG, MAKRO, TEXT, SIGNATUR, EICAR, latin1, storlek, namnFynd, signaturFynd, kodFynd, innehallFynd, csvFynd, innehallsTyp, typFynd, granska, status };
});
