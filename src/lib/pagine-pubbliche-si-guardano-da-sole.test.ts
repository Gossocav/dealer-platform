import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * **I controlli che una macchina puo' fare al posto degli occhi.**
 *
 * Il 19/09/2026 le cinque pagine pubbliche sono state aperte una per una da
 * un telefono. Sono uscite trentadue cose da correggere, e nel riordinarle e'
 * venuta fuori una divisione netta: alcune un test le vede da solo per
 * sempre, altre le vede solo chi guarda lo schermo -- il contrasto di un
 * grigio, un menu che non si chiude, una foto che non si capisce.
 *
 * Questo file contiene **le prime**. Le seconde stanno nel giro a mano
 * descritto in AGENTS.md ("Il giro a mano sulle cinque pagine pubbliche"),
 * una volta al mese e prima di ogni cliente nuovo.
 *
 * Quattro di questi cinque controlli **nascono con un debito**: le cose che
 * trovano oggi sono vere e note, rimandate al lavoro sull'usabilita' da
 * telefono che si fara' tutto insieme. Stanno in elenchi espliciti qui sotto,
 * con il perche'. **Quegli elenchi possono solo accorciarsi**: e' la
 * differenza fra un debito e un'abitudine.
 */

const CARTELLE_PUBBLICHE = ["src/app/(marketplace)", "src/components/marketplace"];

function sorgentiPubbliche(): string[] {
  const trovati = execSync(
    `find ${CARTELLE_PUBBLICHE.map((c) => `"${c}"`).join(" ")} -name '*.tsx' -o -name '*.ts'`,
  )
    .toString()
    .trim()
    .split("\n")
    .filter((percorso) => percorso && !percorso.includes(".test."));
  // Se la ricerca non trova niente, il controllo direbbe "tutto a posto"
  // senza aver guardato un solo file: e' il difetto che AGENTS.md chiama
  // "zero differenze li' vuol dire non guardato".
  expect(trovati.length).toBeGreaterThan(10);
  return trovati;
}

const leggi = (percorso: string) => readFileSync(percorso, "utf8");

// ---------------------------------------------------------------------------
// 1. Il testo che non si legge
// ---------------------------------------------------------------------------

/** Sotto questa misura, su un telefono, si legge solo avvicinandolo agli occhi. */
const MINIMO_LEGGIBILE_PX = 12;

/** `text-[7px]`, `text-[0.65rem]`: le misure scritte a mano nel disegno. */
const MISURA_A_MANO = /\btext-\[([0-9.]+)(px|rem)\]/g;

function inPixel(quanto: string, unita: string): number {
  return unita === "rem" ? Number(quanto) * 16 : Number(quanto);
}

function testoTroppoPiccolo(sorgente: string): string[] {
  return [...sorgente.matchAll(MISURA_A_MANO)]
    .filter(([, quanto, unita]) => inPixel(quanto, unita) < MINIMO_LEGGIBILE_PX)
    .map(([intera]) => intera);
}

/**
 * Il debito di oggi: sei punti in cui il disegno scende sotto i dodici pixel.
 *
 * Sono etichette e sigle -- "KM", "€", i puntini della fotogallery -- non
 * dati che qualcuno deve leggere per decidere. Vanno rialzate lo stesso, e
 * lo si fa nel lavoro sull'usabilita' da telefono: qui restano scritte
 * perche' **nessuna nuova possa aggiungersi senza che si veda**.
 */
const TESTO_PICCOLO_CONOSCIUTO = new Set([
  "src/components/marketplace/vehicle-card.tsx · text-[7px]",
  "src/components/marketplace/tendine-marca-modello.tsx · text-[0.65rem]",
  "src/components/marketplace/spec-showcase.tsx · text-[0.65rem]",
  "src/app/(marketplace)/page.tsx · text-[0.65rem]",
  "src/app/(marketplace)/concessionarie/page.tsx · text-[11px]",
  "src/app/(marketplace)/auto/[id]/page.tsx · text-[0.65rem]",
]);

describe("nessun testo nuovo sotto i dodici pixel", () => {
  it("non aggiunge misure piu' piccole di quelle gia' conosciute", () => {
    const nuovi: string[] = [];
    for (const percorso of sorgentiPubbliche()) {
      for (const misura of testoTroppoPiccolo(leggi(percorso))) {
        const voce = `${percorso} · ${misura}`;
        if (!TESTO_PICCOLO_CONOSCIUTO.has(voce)) nuovi.push(voce);
      }
    }
    expect(nuovi).toEqual([]);
  });

  it("il controllo diventa rosso davanti a una misura nuova", () => {
    // La prova che guarda davvero: senza di questa, un errore nell'espressione
    // qui sopra risponderebbe "tutto a posto" per sempre.
    expect(testoTroppoPiccolo(`<p className="text-[9px] text-slate-500">Targa</p>`)).toEqual(["text-[9px]"]);
    expect(testoTroppoPiccolo(`<p className="text-[0.5rem]">nota</p>`)).toEqual(["text-[0.5rem]"]);
    expect(testoTroppoPiccolo(`<p className="text-[12px] text-[1rem]">va bene</p>`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. I campi che fanno ingrandire la pagina su iPhone
// ---------------------------------------------------------------------------

/**
 * Safari su iPhone **ingrandisce la pagina da solo** quando si tocca un campo
 * il cui testo e' piu' piccolo di sedici pixel. La pagina resta ingrandita
 * anche dopo, il modulo esce dallo schermo di lato, e per vedere il bottone
 * "Invia" bisogna trascinare. Non e' un'opinione di stile: e' il
 * comportamento di iOS, e si evita scrivendo sedici pixel.
 */
const MINIMO_CAMPI_PX = 16;

const CLASSI_SOTTO_I_16 = /\btext-(xs|sm|\[[0-9.]+(?:px|rem)\])\b/g;

function sottoI16(classi: string): string[] {
  return [...classi.matchAll(CLASSI_SOTTO_I_16)]
    .filter(([intera, misura]) => {
      if (misura === "xs" || misura === "sm") return true;
      const [, quanto, unita] = intera.match(/\[([0-9.]+)(px|rem)\]/) ?? [];
      return quanto !== undefined && inPixel(quanto, unita) < MINIMO_CAMPI_PX;
    })
    .map(([intera]) => intera);
}

/**
 * Estrae i tag `<input>`, `<textarea>`, `<select>` **interi**.
 *
 * Il primo tentativo si fermava al primo `>`, e ogni campo con un
 * `onChange={(event) => ...}` veniva troncato **prima** del `className`:
 * quattro campi del modulo della scheda auto risultavano "senza classi", cioe'
 * sani. Qui si conta l'annidamento delle graffe e si ignorano i `>` che stanno
 * dentro un'espressione o dentro una stringa.
 */
function tagDeiCampi(sorgente: string): string[] {
  const tag: string[] = [];
  const apertura = /<(input|textarea|select)\b/g;
  for (const inizio of sorgente.matchAll(apertura)) {
    let profondita = 0;
    let apice = "";
    for (let i = (inizio.index ?? 0) + inizio[0].length; i < sorgente.length; i += 1) {
      const c = sorgente[i];
      if (apice) {
        if (c === apice && sorgente[i - 1] !== "\\") apice = "";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") apice = c;
      else if (c === "{") profondita += 1;
      else if (c === "}") profondita -= 1;
      else if (c === ">" && profondita === 0) {
        tag.push(sorgente.slice(inizio.index ?? 0, i + 1));
        break;
      }
    }
  }
  return tag;
}

/**
 * Le classi applicate a un campo, anche quando arrivano da una funzione
 * dichiarata nello stesso file (`className={getFieldClassName(...)}`): due
 * moduli su tre le costruiscono cosi', e un controllo che non le seguisse
 * guarderebbe solo il terzo.
 */
function classiDelCampo(tag: string, sorgente: string): string {
  const scritte = tag.match(/className="([^"]*)"/);
  if (scritte) return scritte[1];
  const daFunzione = tag.match(/className=\{([A-Za-z0-9_]+)/);
  if (!daFunzione) return "";
  const definizione = sorgente.match(new RegExp(`(?:const|function)\\s+${daFunzione[1]}\\b[\\s\\S]{0,900}`));
  return definizione ? definizione[0] : "";
}

function campiTroppoPiccoli(sorgente: string): string[] {
  return tagDeiCampi(sorgente).flatMap((tag) => sottoI16(classiDelCampo(tag, sorgente)));
}

/**
 * Il debito di oggi: **tutti** i campi dei moduli pubblici sono a quattordici
 * pixel. Non e' una svista in un punto, e' la misura scelta dappertutto, e
 * cambiarla tocca il disegno della registrazione, della demo, della ricerca e
 * della home. Si fa nel lavoro sull'usabilita' da telefono, tutto insieme.
 *
 * L'elenco e' per file e non per campo: conta che **nessun file nuovo** entri.
 */
const CAMPI_PICCOLI_CONOSCIUTI = new Set([
  "src/app/(marketplace)/demo/page.tsx",
  "src/app/(marketplace)/registrazione/dealer-info-request-form.tsx",
  "src/app/(marketplace)/auto/[id]/request-information-form.tsx",
  "src/app/(marketplace)/auto/page.tsx",
  "src/app/(marketplace)/ricerca/page.tsx",
  "src/app/(marketplace)/page.tsx",
  // **Tolto il 20/09/2026, e l'elenco si e' accorciato per davvero.** Quel
  // file aveva tredici campi di filtro; adesso non ne ha nessuno, perche'
  // la pagina della concessionaria non filtra piu' -- si va su `/ricerca`
  // ristretta a lei. Il debito non e' stato spostato: e' sparito insieme al
  // modulo.
]);

describe("nessun modulo nuovo fa ingrandire la pagina su iPhone", () => {
  it("non aggiunge campi sotto i sedici pixel fuori dai file gia' conosciuti", () => {
    const nuovi: string[] = [];
    for (const percorso of sorgentiPubbliche()) {
      if (CAMPI_PICCOLI_CONOSCIUTI.has(percorso)) continue;
      const piccoli = campiTroppoPiccoli(leggi(percorso));
      if (piccoli.length > 0) nuovi.push(`${percorso} · ${[...new Set(piccoli)].join(" ")}`);
    }
    expect(nuovi).toEqual([]);
  });

  it("l'elenco dice il vero: ogni file elencato ha davvero un campo piccolo", () => {
    // Un elenco di eccezioni si rilegge quando cambia il controllo. Se un file
    // viene sistemato e resta scritto qui, l'elenco smette di essere un debito
    // e diventa un'abitudine: questo lo impedisce.
    for (const percorso of CAMPI_PICCOLI_CONOSCIUTI) {
      expect(campiTroppoPiccoli(leggi(percorso)).length, `${percorso} e' gia' a posto: toglilo dall'elenco`).toBeGreaterThan(0);
    }
  });

  it("il controllo vede un campo dentro una funzione e non si ferma su una freccia", () => {
    const conFreccia = `<input type="text" onChange={(event) => setNome(event.target.value)} className="mt-2 w-full text-sm" />`;
    expect(campiTroppoPiccoli(conFreccia)).toEqual(["text-sm"]);

    const daFunzione = `const classiCampo = "rounded-3xl text-xs";\n<input className={classiCampo} />`;
    expect(campiTroppoPiccoli(daFunzione)).toEqual(["text-xs"]);

    expect(campiTroppoPiccoli(`<input className="text-base w-full" />`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. I campi che il telefono sa gia' riempire
// ---------------------------------------------------------------------------

/**
 * `autoComplete` e' la differenza fra digitare col pollice e toccare un
 * suggerimento. Su email e telefono conta il doppio: sono i due campi da cui
 * dipende se la concessionaria potra' richiamare.
 *
 * La lezione piu' utile di questo controllo e' **dove mancava**: il modulo
 * della registrazione li dichiarava tutti e cinque dal primo giorno. Non
 * mancava la competenza -- mancava di averla applicata sul modulo che porta i
 * clienti, quello della scheda auto, dove non ce n'era nemmeno uno.
 */
function campiSenzaSuggerimento(sorgente: string): string[] {
  // Anche i campi scritti come componenti (`<Field type="email" ...>`): la
  // dichiarazione va dove si usa il campo, non dentro l'involucro.
  const elementi = sorgente.matchAll(/<([A-Za-z][A-Za-z0-9]*)\b((?:[^<>{}]|\{[^{}]*\})*?)\/?>/g);
  return [...elementi]
    .filter(([, , attributi]) => /type=["'](email|tel)["']/.test(attributi) && !/autoComplete/.test(attributi))
    .map(([, nome, attributi]) => `<${nome}${(attributi.match(/type=["'](?:email|tel)["']/) ?? [""])[0] ? ` ${attributi.match(/type=["'](?:email|tel)["']/)?.[0]}` : ""}>`);
}

describe("email e telefono si riempiono da soli", () => {
  it("ogni campo email o telefono delle pagine pubbliche dichiara autoComplete", () => {
    const senza: string[] = [];
    for (const percorso of sorgentiPubbliche()) {
      for (const campo of campiSenzaSuggerimento(leggi(percorso))) senza.push(`${percorso} · ${campo}`);
    }
    expect(senza).toEqual([]);
  });

  it("il controllo diventa rosso davanti a un campo nuovo senza suggerimento", () => {
    expect(campiSenzaSuggerimento(`<input type="email" value={email} />`)).toEqual(['<input type="email">']);
    expect(campiSenzaSuggerimento(`<Field label="Telefono" type="tel" value={telefono} />`)).toEqual(['<Field type="tel">']);
    expect(campiSenzaSuggerimento(`<input type="email" autoComplete="email" />`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. L'invio che resta appeso quando cade la rete
// ---------------------------------------------------------------------------

/**
 * Senza `try/catch`, una `fetch` che non parte -- wifi che cade, tunnel,
 * passaggio alla rete mobile -- rifiuta la promessa: la riga che rimette il
 * bottone a posto non viene mai eseguita, e il modulo resta bloccato su
 * "Invio in corso..." **per sempre**. Si esce solo ricaricando la pagina, e
 * ricaricando si perde tutto quello che si era scritto.
 *
 * Il 19/09/2026 mancava su tutti e due i moduli da cui questo sito guadagna:
 * la richiesta informazioni su un'auto e la richiesta di demo -- dove chi
 * arriva in fondo ha anche caricato la visura camerale.
 */
function inviiSenzaRete(sorgente: string): string[] {
  const appesi: string[] = [];
  for (const chiamata of sorgente.matchAll(/await fetch\(/g)) {
    const prima = sorgente.slice(0, chiamata.index);
    // La `fetch` di un modulo sta dentro un `try` aperto poco sopra e non
    // ancora chiuso: si contano i `try` e i `catch` che la precedono.
    const try_ = (prima.match(/\btry\s*\{/g) ?? []).length;
    const catch_ = (prima.match(/\}\s*catch\b/g) ?? []).length;
    if (try_ <= catch_) {
      const riga = prima.split("\n").length;
      appesi.push(`riga ${riga}`);
    }
  }
  return appesi;
}

describe("nessun invio resta appeso se cade la rete", () => {
  it("ogni fetch dei moduli pubblici e' protetta", () => {
    const scoperte: string[] = [];
    for (const percorso of sorgentiPubbliche()) {
      const sorgente = leggi(percorso);
      if (!sorgente.includes("await fetch(")) continue;
      for (const dove of inviiSenzaRete(sorgente)) scoperte.push(`${percorso} · ${dove}`);
    }
    expect(scoperte).toEqual([]);
  });

  it("il controllo diventa rosso davanti a un invio scoperto", () => {
    expect(inviiSenzaRete(`const r = await fetch("/api/x");`)).toEqual(["riga 1"]);
    expect(inviiSenzaRete(`try {\n  const r = await fetch("/api/x");\n} catch {}`)).toEqual([]);
    // Un `try` gia' chiuso non protegge quello che viene dopo.
    expect(inviiSenzaRete(`try { a() } catch {}\nconst r = await fetch("/api/x");`)).toEqual(["riga 2"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Il numero contato su un elenco che ha un tetto
// ---------------------------------------------------------------------------

/**
 * **La regola:** un numero mostrato al visitatore non si conta contando le
 * righe che la pagina ha caricato. Le richieste di questo progetto hanno
 * quasi tutte un tetto -- ventiquattro sulla home, trecento sulla pagina
 * della concessionaria, mille di tetto del database -- e contare sotto un
 * tetto da' un numero **preciso, credibile e sbagliato**.
 *
 * E' costata quattro volte:
 * 1. "veicoli pubblicati" e prezzo medio della scheda concessionaria, contati
 *    sulle prime trecento (19/09/2026, risolto con la vista
 *    `vetrina_per_concessionaria`);
 * 2. **il prezzo minimo**, 7.500 € mentre in vetrina c'era un Ducato a
 *    5.800 €: nessun errore da nessuna parte, solo un limite in una richiesta;
 * 3. il contatore dei filtri della stessa pagina, "300 veicoli" su 420;
 * 4. il ripiego della home, `totalVehicleCount ?? vehicles.length`: quando il
 *    conteggio vero non riesce, annunciava come totale del marketplace le
 *    **ventiquattro** auto delle "ultime arrivate".
 *
 * **Cosa resta fuori da questo controllo, e perche'.** Riconoscere da solo se
 * un elenco e' completo o tagliato vorrebbe dire seguire una variabile dalla
 * richiesta fino allo schermo, attraverso funzioni e file: si e' provato, ed
 * e' esattamente il tipo di controllo che risponde "tutto a posto" perche' ha
 * perso la traccia. Quello che si controlla qui e' piu' piccolo e si spiega
 * in una riga: **`.length` non compare in nessuna delle forme con cui un
 * numero arriva sotto gli occhi di chi guarda**. Un conteggio spostato dentro
 * una funzione sfugge a questa regola -- e li' la difesa e' un'altra:
 * `fraseConteggioVeicoli` **pretende** il totale vero come parametro, quindi
 * non si puo' chiamare senza essersi posti la domanda.
 */
const FORME_DI_UN_NUMERO_MOSTRATO: Array<[RegExp, string]> = [
  [/\{\s*[A-Za-z0-9_.?[\]]*\.length\s*\}/g, "interpolazione nuda"],
  [/\$\{[^}]*?\.length/g, "dentro una frase"],
  [/\b(?:value|count|totale|quanti)\s*[:=]\s*\{?[^,;\n]*?\.length/g, "numero passato per nome"],
];

/** `.length > 0`, `.length === 4`: e' una domanda, non un numero mostrato. */
const SUBITO_UN_CONFRONTO = /^\s*(===|!==|==|!=|>=|<=|>|<|\?|&&|\|\|)/;

function numeriContatiSuUnElenco(sorgente: string): string[] {
  const trovati: string[] = [];
  for (const [forma, nome] of FORME_DI_UN_NUMERO_MOSTRATO) {
    for (const punto of sorgente.matchAll(forma)) {
      // `${veicoli.length}` e' una frase, non un'interpolazione nuda: senza
      // questo salto lo stesso punto verrebbe contato due volte.
      if (nome === "interpolazione nuda" && sorgente[(punto.index ?? 0) - 1] === "$") continue;
      const dopo = sorgente.slice((punto.index ?? 0) + punto[0].length);
      if (!punto[0].trimEnd().endsWith("}") && SUBITO_UN_CONFRONTO.test(dopo)) continue;
      trovati.push(`${nome}: ${punto[0].replace(/\s+/g, " ").trim()}`);
    }
  }
  return trovati;
}

/**
 * L'unica eccezione, e non e' un debito: `brands` nasce da `publishedRows`,
 * che `caricaTutto` legge **per intero** avvisando quando tocca il tetto, e
 * il numero esce con un "+" accanto. E' l'esempio di come si fa, non di cosa
 * si tollera.
 */
const CONTEGGI_LEGITTIMI = new Set([
  "src/app/(marketplace)/page.tsx · numero passato per nome: value: brands.length",
  // **Questo numero non e' mostrato da solo.** `mostrati` entra in
  // `fraseConteggioVeicoli` insieme al totale vero letto dalla vista, ed e'
  // quella funzione a decidere cosa scrivere: se ne mostra meno del totale
  // dice "Prime 300 auto su 420 in vetrina", non "300". Il conteggio su un
  // elenco tagliato qui e' **dichiarato**, che e' l'unico modo in cui puo'
  // stare in una pagina.
  "src/app/(marketplace)/concessionarie/[slug]/page.tsx · interpolazione nuda: {dealerVehicles.length}",
]);

describe("nessun numero mostrato si conta su un elenco con un tetto", () => {
  it("le pagine pubbliche non mostrano conteggi presi dalle righe caricate", () => {
    const sospetti: string[] = [];
    for (const percorso of sorgentiPubbliche()) {
      for (const trovato of numeriContatiSuUnElenco(leggi(percorso))) {
        const voce = `${percorso} · ${trovato}`;
        if (!CONTEGGI_LEGITTIMI.has(voce)) sospetti.push(voce);
      }
    }
    expect(sospetti).toEqual([]);
  });

  it("il controllo diventa rosso davanti ai quattro casi che l'hanno prodotto", () => {
    expect(numeriContatiSuUnElenco(`<p>{veicoli.length} veicoli</p>`)).toEqual([
      "interpolazione nuda: {veicoli.length}",
    ]);
    expect(numeriContatiSuUnElenco("`${risultati.length} veicoli su ${caricati.length}`")).toHaveLength(2);
    expect(numeriContatiSuUnElenco(`<Stat value={totalVehicleCount ?? vehicles.length} />`)).toEqual([
      "numero passato per nome: value={totalVehicleCount ?? vehicles.length",
    ]);
    // Una domanda non e' un numero mostrato: qui non deve dire niente.
    expect(numeriContatiSuUnElenco(`{veicoli.length > 0 ? <Elenco /> : null}`)).toEqual([]);
    expect(numeriContatiSuUnElenco("`${statistiche.length === 4 ? \"a\" : \"b\"}`")).toEqual([]);
  });
});
