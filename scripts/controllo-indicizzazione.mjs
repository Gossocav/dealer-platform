#!/usr/bin/env node
/**
 * Guarda il sito vero e dice se l'indicizzazione si e' rotta.
 *
 * **Perche' esiste.** I quattro controlli che proteggevano l'indicizzazione
 * leggevano il *testo del sorgente*. Uno di questi, in `seo-indexing.test.ts`,
 * diceva cosi':
 *
 *     expect(veicolo).toContain("notFound()");
 *
 * Passava dal 3 agosto. E la produzione rispondeva 200 su un'auto inesistente,
 * perche' lo scheletro di caricamento spediva la risposta prima che il
 * programma scoprisse che l'auto non c'era. La regola era scritta, il test la
 * trovava scritta, e il sito faceva un'altra cosa. Nessun controllo poteva
 * accorgersene, perche' nessuno guardava il sito.
 *
 * Questo script guarda il sito. Non legge una riga di codice.
 *
 * **Uso:**
 *   node scripts/controllo-indicizzazione.mjs
 *   SITO=https://anteprima.vercel.app node scripts/controllo-indicizzazione.mjs
 *
 * **Codici di uscita:** 0 se tutto quello che deve reggere regge, 1 se
 * qualcosa si e' rotto, 2 se il sito non risponde affatto.
 *
 * I difetti gia' noti e ancora aperti non fanno fallire il controllo: sono
 * elencati a parte, con il numero del reperto. Un guardiano rosso dal primo
 * giorno lo si impara a ignorare, ed e' peggio di non averlo. Ma se uno di
 * quelli comincia a passare, lo dice forte: vuol dire che e' stato corretto e
 * va promosso fra i controlli veri.
 */

const SITO = (process.env.SITO || "https://www.keyauto.it").replace(/\/$/, "");
const CONCORRENZA = 8;
const TIMEOUT_MS = 30_000;
const FOTO_DA_PROVARE = 5;

/**
 * **Quando rileggere le pagine, in minuti dall'avvio.**
 *
 * Una lettura sola non prende un difetto che va e viene, a nessuna ora.
 * Il 21/09/2026 la home era **piena per 5 minuti e 29 secondi** dopo la
 * pubblicazione -- la copia costruita in fase di compilazione -- e **vuota
 * da li' in poi**, a ogni ricostruzione. Questo lavoro, avviato
 * dall'atterraggio della pubblicazione e con una attesa fissa di 60
 * secondi, guardava **dentro la finestra buona** e si dichiarava riuscito:
 * cieco per costruzione, e verde.
 *
 * Spostare l'attesa "oltre i cinque minuti" cambierebbe il numero e
 * lascerebbe il difetto: sarebbe sempre **una lettura sola a un orario
 * scelto**, tarato su un valore che oggi leggiamo nell'intestazione
 * (`x-nextjs-stale-time: 300`) ma che domani puo' cambiare, e che su
 * un'altra pagina e' gia' diverso. Si legge piu' volte, e basta che **una**
 * lettura trovi la pagina vuota.
 *
 * `RILETTURE=1,6,12` -- minuti, anche con la virgola decimale per le prove.
 * Vuoto: una lettura sola, subito.
 */
const RILETTURE = (process.env.RILETTURE || "0")
  .split(",")
  .map((x) => Number(String(x).trim()))
  .filter((n) => Number.isFinite(n) && n >= 0)
  .sort((a, b) => a - b);

const AVVIO = Date.now();
const attendiFinoAlMinuto = async (minuto) => {
  const quando = AVVIO + minuto * 60_000;
  const mancano = quando - Date.now();
  if (mancano > 0) await new Promise((r) => setTimeout(r, mancano));
};

// ---------------------------------------------------------------- funzioni pure

/** Cosa dichiara robots.txt sulle due cose che contano. */
export function analizzaRobots(testo) {
  const righe = String(testo ?? "").split("\n").map((r) => r.trim());
  return {
    permetteLeFoto: righe.includes("Allow: /api/image-proxy"),
    vietaIlGestionale: righe.includes("Disallow: /dashboard/"),
    dichiaraLaSitemap: righe.some((r) => r.startsWith("Sitemap: ")),
  };
}

/** Gli indirizzi della sitemap, divisi per tipo, con la data che dichiarano. */
export function analizzaSitemap(xml) {
  const blocchi = String(xml ?? "").match(/<url>[\s\S]*?<\/url>/g) ?? [];
  const voci = blocchi.map((blocco) => {
    const url = (blocco.match(/<loc>([^<]*)<\/loc>/) ?? [])[1] ?? "";
    const data = (blocco.match(/<lastmod>([^<]*)<\/lastmod>/) ?? [])[1] ?? null;
    return { url, data };
  });

  return {
    veicoli: voci.filter((v) => v.url.includes("/auto/")),
    concessionarie: voci.filter((v) => v.url.includes("/concessionarie/")),
    fisse: voci.filter((v) => !v.url.includes("/auto/") && !v.url.includes("/concessionarie/")),
  };
}

/**
 * I gruppi di schede che si chiamano allo stesso modo.
 *
 * Due auto con lo stesso titolo si contendono lo stesso posto su Google, che
 * ne tiene una e scarta l'altra.
 */
export function gruppiDiTitoliUguali(titoli) {
  const conteggio = new Map();
  for (const titolo of titoli) {
    const pulito = String(titolo ?? "").trim();
    if (!pulito) continue;
    conteggio.set(pulito, (conteggio.get(pulito) ?? 0) + 1);
  }
  return [...conteggio.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
}

/**
 * Cosa non va in una scheda veicolo.
 *
 * L'indirizzo canonico deve indicare se stessa: se indica un'altra pagina,
 * stiamo dicendo a Google di non tenere questa.
 */
export function problemiDellaScheda({ url, stato, titolo, canonico, xRobotsTag }) {
  const problemi = [];
  if (stato !== 200) problemi.push(`risponde ${stato}`);
  if (!titolo || !titolo.trim()) problemi.push("senza titolo");
  if (canonico && canonico !== url) problemi.push(`indirizzo canonico diverso: ${canonico}`);
  if (!canonico) problemi.push("senza indirizzo canonico");
  if (xRobotsTag && /noindex/i.test(xRobotsTag)) problemi.push(`intestazione ${xRobotsTag}`);
  return problemi;
}

/**
 * Se l'indirizzo di una fotografia e' di quelli che durano.
 *
 * Due forme sono legittime: "foto" per le nostre, "url" per quelle importate
 * dai siti delle concessionarie, che nel nostro archivio non stanno. Quello
 * che non deve piu' esserci e' un lasciapassare: scadeva dopo un'ora, e un
 * motore di ricerca che archivia l'indirizzo oggi lo ritrova morto domani.
 */
export function problemiDellIndirizzoFoto(src) {
  const valore = String(src ?? "");
  if (!valore.startsWith("/api/image-proxy?")) return ["non passa dal proxy delle immagini"];
  if (/[?&]token=/.test(valore) || /token%3D/i.test(valore)) return ["contiene un lasciapassare che scade"];
  if (!/[?&](foto|url)=/.test(valore)) return ["non dichiara ne' un percorso ne' un indirizzo"];
  return [];
}

/** Il primo indirizzo di fotografia che compare in una pagina. */
export function primaFoto(html) {
  const trovato = String(html ?? "").match(/src="(\/api\/image-proxy\?[^"]+)"/);
  if (!trovato) return null;
  return trovato[1].replace(/&amp;/g, "&");
}

export function estraiTitolo(html) {
  const trovato = String(html ?? "").match(/<title>([^<]*)<\/title>/);
  return trovato ? trovato[1].trim() : "";
}

export function estraiCanonico(html) {
  const trovato = String(html ?? "").match(/<link rel="canonical" href="([^"]*)"/);
  return trovato ? trovato[1] : "";
}

/**
 * Se una pagina chiede ai motori di non indicizzarla.
 *
 * Ne cerca **tutte** le dichiarazioni, non la prima: su una pagina "non
 * trovato" ce ne sono due -- quella scritta da noi e quella che Next inietta
 * da se' -- e guardarne una sola darebbe una risposta a caso su quale delle
 * due e' sparita.
 */
export function chiedeDiNonEssereIndicizzata(html) {
  const dichiarazioni = String(html ?? "").match(/<meta name="robots" content="([^"]*)"/g) ?? [];
  return dichiarazioni.some((riga) => /noindex/i.test(riga));
}

/**
 * Il testo che la pagina serve **senza eseguire niente**: e' quello che vede
 * chi indicizza alla prima passata, e chi non esegue JavaScript.
 *
 * Si tolgono gli script perche' il pacchetto che Next incolla nella pagina
 * contiene tutto il contenuto vero: contandolo, una pagina vuota sembrerebbe
 * piena. E' esattamente l'inganno in cui si cadrebbe misurando la home, che
 * pesa 93.000 byte e ne mostra 63.
 */
export function testoServito(html) {
  const senzaScript = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ");
  return senzaScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Una pagina pubblica ha un contenuto: un titolo di primo livello e del testo
 * vero, senza bisogno di eseguire niente.
 *
 * **Il difetto che questa domanda avrebbe visto, e nessuna delle altre.** Il
 * 20/09/2026 la home serviva **63 caratteri** -- "Verifica autenticazione..."
 * e nient'altro -- a chiunque non eseguisse JavaScript, cioe' anche alla
 * prima passata di chi indicizza. Tutto il resto del sito stava bene. Tre
 * controlli sorvegliavano proprio quel difetto e sono rimasti verdi: due
 * leggono il sorgente (e il sorgente era giusto: la stessa compilazione fatta
 * altrove produceva la pagina intera), e questo -- l'unico che guarda il sito
 * vero -- chiedeva soltanto cose che la pagina *dichiara*: robots, canonico,
 * sitemap, fotografie. Non chiedeva mai se la pagina **avesse qualcosa
 * dentro**.
 *
 * La soglia e' bassa apposta: la pagina piu' scarna del sito
 * (`/concessionarie`) ne serve 1.216, e la home rotta ne serviva 63. Fra i
 * due numeri ci sta comodo un confine che non suona mai a vuoto.
 */
export function servaUnContenuto(html, minimoCaratteri = 500) {
  const testo = testoServito(html);
  const titoli = (String(html ?? "").match(/<h1[\s>]/g) ?? []).length;
  const segnaposto = /Verifica autenticazione|Reindirizzamento\.\.\./.test(testo);
  return {
    testo: testo.length,
    titoli,
    segnaposto,
    va: testo.length >= minimoCaratteri && titoli >= 1 && !segnaposto,
  };
}

/** Gli identificativi delle auto linkate in una pagina di catalogo. */
export function idDelleSchede(html) {
  const trovati = String(html ?? "").match(/href="\/auto\/([a-f0-9-]{36})"/g) ?? [];
  return [...new Set(trovati.map((t) => t.replace(/.*\/auto\//, "").replace(/"$/, "")))];
}

// ---------------------------------------------------------------- rete

async function leggi(percorso, opzioni = {}) {
  const risposta = await fetch(`${SITO}${percorso}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "KeyAuto-ControlloIndicizzazione/1.0" },
    ...opzioni,
  });
  return risposta;
}

/**
 * La chiave di IndexNow, letta dal repository e non scritta qui.
 *
 * Copiarla in questo file vorrebbe dire tenerne due, e il giorno in cui una
 * delle due cambia il controllo direbbe che va tutto bene mentre non va. Se la
 * cartella non c'e' -- il controllo puo' girare anche fuori dal repository --
 * la verifica si salta invece di fallire.
 */
async function chiaveIndexNowNelRepository() {
  try {
    const { readdirSync } = await import("node:fs");
    const trovati = readdirSync("public").filter((nome) => /^[0-9a-f]{8,128}\.txt$/i.test(nome));
    return trovati.length === 1 ? trovati[0].replace(/\.txt$/i, "") : null;
  } catch {
    return null;
  }
}

async function aBlocchi(elementi, lavoro) {
  const risultati = [];
  for (let i = 0; i < elementi.length; i += CONCORRENZA) {
    const fetta = elementi.slice(i, i + CONCORRENZA);
    risultati.push(...(await Promise.all(fetta.map(lavoro))));
  }
  return risultati;
}

// ---------------------------------------------------------------- esecuzione

const rotti = [];
const noti = [];
const risolti = [];
const righe = [];

/** "1 difetto" e non "1 difetti": un guardiano che scrive male si legge male. */
function plurale(quanti, singolare, plurali) {
  return `${quanti} ${quanti === 1 ? singolare : plurali}`;
}

function segna(esito, titolo, dettaglio = "") {
  const simbolo = esito === "ok" ? "ok  " : esito === "rotto" ? "ROTTO" : "noto";
  righe.push(`  ${simbolo.padEnd(6)} ${titolo}${dettaglio ? ` — ${dettaglio}` : ""}`);
}

function deveReggere(condizione, titolo, dettaglio = "") {
  if (condizione) {
    segna("ok", titolo);
  } else {
    rotti.push(titolo);
    segna("rotto", titolo, dettaglio);
  }
}

/** Un difetto gia' noto: non fa fallire, ma se guarisce lo si vuole sapere. */
function difettoNoto(condizioneRisolta, titolo, reperto, dettaglio = "") {
  if (condizioneRisolta) {
    risolti.push(`${titolo} (${reperto})`);
    segna("ok", `${titolo} — RISOLTO, va promosso a controllo vero (${reperto})`);
  } else {
    noti.push(`${titolo} (${reperto})`);
    segna("noto", titolo, `${dettaglio} — ${reperto}, gia' noto`);
  }
}

async function main() {
  console.log(`\nControllo dell'indicizzazione su ${SITO}\n`);

  // --- robots.txt
  const robotsRisposta = await leggi("/robots.txt");
  if (!robotsRisposta.ok) {
    console.error(`Il sito non risponde: /robots.txt da' ${robotsRisposta.status}.`);
    process.exit(2);
  }
  const robots = analizzaRobots(await robotsRisposta.text());
  deveReggere(robots.permetteLeFoto, "robots.txt lascia passare le fotografie");
  deveReggere(robots.vietaIlGestionale, "robots.txt tiene fuori il gestionale");
  deveReggere(robots.dichiaraLaSitemap, "robots.txt indica la sitemap");

  // --- sitemap
  const sitemapRisposta = await leggi("/sitemap.xml");
  deveReggere(sitemapRisposta.ok, "la sitemap risponde", `stato ${sitemapRisposta.status}`);
  const sitemap = analizzaSitemap(await sitemapRisposta.text());
  deveReggere(sitemap.veicoli.length > 0, "la sitemap elenca delle auto");
  deveReggere(
    sitemap.fisse.every((v) => !v.data),
    "le pagine fisse non dichiarano una data inventata",
    `${sitemap.fisse.filter((v) => v.data).length} su ${sitemap.fisse.length} ne dichiarano una`
  );

  // --- ogni pagina pubblica serve davvero qualcosa
  //
  // La domanda piu' semplice di tutte, e l'unica che mancava: **la pagina ha
  // qualcosa dentro?** Il 20/09/2026 la home ne serviva 63 caratteri con
  // tutto il resto del sito sano, e nessuno dei controlli esistenti poteva
  // vederlo. Il motivo per cui va qui e non in un controllo nuovo: la
  // famiglia che questo lavoro sorveglia e' "cosa vede chi indicizza", e
  // "niente" e' la risposta peggiore possibile.
  const dealerDiProva = (sitemap.concessionarie[0]?.url ?? "").replace(SITO, "");
  const schedaDiProva = (sitemap.veicoli[0]?.url ?? "").replace(SITO, "");
  const daGuardare = ["/", "/auto", "/ricerca", "/concessionarie", dealerDiProva, schedaDiProva].filter(Boolean);

  const guardaIlContenuto = async (minuto) => {
    const quando = RILETTURE.length > 1 ? ` (al minuto ${minuto})` : "";
    for (const percorso of daGuardare) {
      const risposta = await leggi(percorso);
      const esito = servaUnContenuto(await risposta.text());
      deveReggere(
        esito.va,
        `${percorso === "/" ? "la home" : percorso} serve un contenuto${quando}`,
        esito.segnaposto
          ? `mostra il segnaposto dell'attesa al posto della pagina (${esito.testo} caratteri, ${esito.titoli} titoli)`
          : `${esito.testo} caratteri di testo e ${esito.titoli} titoli, senza eseguire niente`
      );
    }
  };

  await attendiFinoAlMinuto(RILETTURE[0]);
  await guardaIlContenuto(RILETTURE[0]);

  // --- il catalogo, pagina per pagina
  const idCatalogo = new Set();
  for (let pagina = 1; pagina <= 100; pagina += 1) {
    const risposta = await leggi(pagina === 1 ? "/auto" : `/auto?page=${pagina}`);
    const trovati = idDelleSchede(await risposta.text());
    if (trovati.length === 0) break;
    trovati.forEach((id) => idCatalogo.add(id));
  }

  const idSitemap = new Set(sitemap.veicoli.map((v) => v.url.replace(/.*\/auto\//, "")));
  const mancanti = [...idCatalogo].filter((id) => !idSitemap.has(id));
  const inPiu = [...idSitemap].filter((id) => !idCatalogo.has(id));

  deveReggere(
    mancanti.length === 0 && inPiu.length === 0,
    `sitemap e catalogo dicono la stessa cosa (${idCatalogo.size} auto)`,
    `${mancanti.length} nel catalogo ma non in sitemap, ${inPiu.length} il contrario`
  );

  // --- ogni scheda: stato, titolo, indirizzo canonico, intestazioni
  const schede = await aBlocchi([...idCatalogo], async (id) => {
    const url = `${SITO}/auto/${id}`;
    try {
      const risposta = await leggi(`/auto/${id}`);
      const html = await risposta.text();
      return {
        id,
        url,
        stato: risposta.status,
        titolo: estraiTitolo(html),
        canonico: estraiCanonico(html),
        xRobotsTag: risposta.headers.get("x-robots-tag"),
        foto: primaFoto(html),
      };
    } catch (errore) {
      return { id, url, stato: 0, titolo: "", canonico: "", xRobotsTag: null, foto: null, errore: String(errore) };
    }
  });

  const schedeRotte = schede
    .map((scheda) => ({ scheda, problemi: problemiDellaScheda(scheda) }))
    .filter((r) => r.problemi.length > 0);

  deveReggere(
    schedeRotte.length === 0,
    `tutte le ${schede.length} schede rispondono con titolo e indirizzo canonico propri`,
    schedeRotte.slice(0, 3).map((r) => `${r.scheda.id}: ${r.problemi.join(", ")}`).join(" | ")
  );

  // --- le fotografie
  const indirizziFoto = [...new Set(schede.map((s) => s.foto).filter(Boolean))];
  deveReggere(indirizziFoto.length > 0, "le schede mostrano delle fotografie");

  const fotoConIndirizzoStorto = indirizziFoto
    .map((src) => ({ src, problemi: problemiDellIndirizzoFoto(src) }))
    .filter((r) => r.problemi.length > 0);

  deveReggere(
    fotoConIndirizzoStorto.length === 0,
    "gli indirizzi delle fotografie durano nel tempo",
    fotoConIndirizzoStorto.slice(0, 2).map((r) => r.problemi.join(", ")).join(" | ")
  );

  const provini = indirizziFoto.slice(0, FOTO_DA_PROVARE);
  const esitiFoto = await aBlocchi(provini, async (src) => {
    try {
      const risposta = await leggi(src);
      return {
        src,
        stato: risposta.status,
        tipo: risposta.headers.get("content-type") ?? "",
        xRobotsTag: risposta.headers.get("x-robots-tag"),
      };
    } catch (errore) {
      return { src, stato: 0, tipo: "", xRobotsTag: null, errore: String(errore) };
    }
  });

  const fotoRotte = esitiFoto.filter((f) => f.stato !== 200 || !f.tipo.startsWith("image/"));
  deveReggere(
    fotoRotte.length === 0,
    `le fotografie provate arrivano davvero (${provini.length} su ${indirizziFoto.length})`,
    fotoRotte.slice(0, 2).map((f) => `stato ${f.stato}, tipo ${f.tipo || "assente"}`).join(" | ")
  );

  const fotoNascoste = esitiFoto.filter((f) => f.xRobotsTag && /noindex/i.test(f.xRobotsTag));
  deveReggere(fotoNascoste.length === 0, "le fotografie non dicono ai motori di ignorarle");

  // --- le pagine che non dovrebbero esistere
  //
  // Qui si guardava lo stato HTTP e si pretendeva un 404. Era la domanda
  // sbagliata, e la documentazione di Next lo dice: quando la risposta viene
  // servita a pezzi -- e lo e', perche' c'e' uno scheletro di caricamento --
  // le intestazioni partono prima che il programma sappia che la pagina non
  // esiste, quindi **lo stato resta 200 per costruzione**. Next lo compensa
  // iniettando un "noindex", e per questo, sempre secondo la documentazione,
  // "non porta a indicizzazione".
  //
  // La cosa da sorvegliare non e' quindi il 404, che non arrivera' mai: e' che
  // il "noindex" ci sia. Se un giorno sparisse -- per una modifica ai metadati
  // o per un cambio di Next -- allora si', queste pagine finirebbero
  // nell'indice, e nessuno se ne accorgerebbe.
  const inesistente = await leggi("/auto/00000000-0000-0000-0000-000000000000");
  deveReggere(
    chiedeDiNonEssereIndicizzata(await inesistente.text()),
    "un'auto che non esiste chiede di non essere indicizzata",
    `risponde ${inesistente.status} e non lo dichiara`
  );

  const oltreLUltima = await leggi("/auto?page=9999");
  const htmlOltre = await oltreLUltima.text();
  deveReggere(
    chiedeDiNonEssereIndicizzata(htmlOltre),
    "il catalogo oltre l'ultima pagina chiede di non essere indicizzato",
    `risponde ${oltreLUltima.status} e non lo dichiara`
  );
  deveReggere(
    estraiCanonico(htmlOltre) === "",
    "una pagina di catalogo che non esiste non si dichiara originale",
    `dichiara ${estraiCanonico(htmlOltre)}`
  );

  // --- la chiave con cui segnaliamo le novita' a Bing
  //
  // IndexNow funziona cosi': il motore chiede il file `/<chiave>.txt` e si
  // aspetta di trovarci dentro la stessa chiave con cui firmiamo le
  // segnalazioni. Se il file sparisse dal sito, o non corrispondesse piu',
  // **ogni segnalazione verrebbe rifiutata in silenzio** -- la
  // sincronizzazione continuerebbe a dichiararsi riuscita e le auto nuove
  // resterebbero invisibili, esattamente come prima di averlo.
  const chiaveLocale = await chiaveIndexNowNelRepository();

  if (chiaveLocale) {
    const rispostaChiave = await leggi(`/${chiaveLocale}.txt`);
    const contenuto = rispostaChiave.ok ? (await rispostaChiave.text()).trim() : "";
    deveReggere(
      contenuto === chiaveLocale,
      "la chiave di IndexNow e' pubblicata e corrisponde",
      rispostaChiave.ok ? "il file c'e' ma dice un'altra cosa" : `il file risponde ${rispostaChiave.status}`
    );
  }

  // --- le riletture successive della stessa domanda
  //
  // Stanno qui e non subito dopo la prima perche' il resto dei controlli
  // riempie l'attesa invece di sprecarla: quando arrivano, sono gia' passati
  // alcuni minuti dall'avvio.
  for (const minuto of RILETTURE.slice(1)) {
    await attendiFinoAlMinuto(minuto);
    await guardaIlContenuto(minuto);
  }

  // --- difetti gia' noti, riportati ma non fatali
  const doppioni = gruppiDiTitoliUguali(schede.map((s) => s.titolo));
  const schedeConDoppione = doppioni.reduce((somma, [, n]) => somma + n, 0);
  difettoNoto(
    doppioni.length === 0,
    "nessuna scheda si chiama come un'altra",
    "reperto 05",
    `${schedeConDoppione} schede in ${doppioni.length} gruppi`
  );

  // --- il verdetto
  console.log(righe.join("\n"));
  console.log("");

  const riassunto = [
    `## Controllo dell'indicizzazione — ${SITO}`,
    "",
    "```",
    righe.join("\n"),
    "```",
    "",
    rotti.length > 0
      ? `**${plurale(rotti.length, "controllo rotto", "controlli rotti")}.** Qualcosa che funzionava ha smesso di funzionare.`
      : "**Tutto quello che deve reggere, regge.**",
    noti.length > 0 ? `\n${plurale(noti.length, "difetto gia' noto", "difetti gia' noti")} e ancora aperti: ${noti.join(", ")}.` : "",
    risolti.length > 0
      ? `\n**${plurale(risolti.length, "difetto noto risulta risolto", "difetti noti risultano risolti")}**: vanno promossi a controlli veri, togliendoli dall'elenco dei noti in \`scripts/controllo-indicizzazione.mjs\`.`
      : "",
  ].join("\n");

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${riassunto}\n`);
  }

  if (rotti.length > 0) {
    console.log(`Esito: ${plurale(rotti.length, "controllo rotto", "controlli rotti")}.\n`);
    process.exit(1);
  }

  // "Tutto regge" con un difetto aperto accanto e' un riepilogo che dice il
  // falso: il lavoro non fallisce -- e' voluto, un guardiano rosso dal primo
  // giorno lo si impara a ignorare -- ma non si dichiara neanche a posto.
  console.log(
    noti.length === 0
      ? "Esito: tutto regge.\n"
      : `Esito: nessuna regressione, ma ${plurale(noti.length, "difetto noto e' ancora aperto", "difetti noti sono ancora aperti")}.\n`
  );
}

// Solo quando lo si esegue, non quando i test lo importano per le funzioni.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((errore) => {
    console.error(`Il controllo non e' riuscito a girare: ${errore}`);
    process.exit(2);
  });
}
