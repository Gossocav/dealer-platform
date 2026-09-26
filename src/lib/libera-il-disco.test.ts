import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * `scripts/libera-il-disco.sh` cancella, quindi si prova come si prova una
 * cosa che cancella: in una casa finta, con le trappole messe apposta, e
 * guardando cosa resta.
 *
 * Il difetto che questi casi impediscono e' uno solo, con tante facce: che la
 * pulizia tolga qualcosa che non si rifa' -- il repository, la memoria, la
 * versione di Claude Code in uso, il database locale di Supabase -- oppure che
 * dica "niente da togliere" quando non ha potuto guardare. Nasce il
 * 26/09/2026, quando il limite "lo script non lo facciamo" e' stato riaperto:
 * tre giorni fra una pulizia a mano e la successiva (supabase/MIGRAZIONI.md).
 * Molti casi vengono da due riletture ostili dello stesso giorno, che sulle
 * prime stesure avevano riprodotto, fra l'altro, la cancellazione di
 * un'intera cartella di progetto -- memoria compresa -- a partire da un file
 * chiamato ".jsonl".
 *
 * Tutti i casi usano un Docker finto, passato per nome (LIBERA_DOCKER): un
 * test non puo' raggiungere il Docker vero.
 */

// Le prove rosse (togliere una serratura e guardare che un caso cada) si
// fanno su una copia dello script, indicata qui: mai modificando il file del
// repository, che nel frattempo qualcuno potrebbe lanciare. Il 26/09/2026 le
// prime si sono fatte sul file vero, e per qualche istante lo script aveva
// --togli come comportamento di serie.
const SCRIPT = process.env.LIBERA_IL_DISCO_SCRIPT ?? resolve(process.cwd(), "scripts/libera-il-disco.sh");
const ANONIMO = "a".repeat(64);
// Un nome di 64 cifre ma senza l'etichetta dei volumi anonimi: lo crea
// `docker volume create` senza nome. Non e' una prova rimasta sul disco.
const CREATO_A_MANO = "b".repeat(64);
// E il caso rovescio: un volume con un nome a cui qualcuno ha messo
// l'etichetta dei volumi anonimi. Le due condizioni decidono insieme, e questo
// e' il caso in cui si separano: senza, una delle due potrebbe mancare.
const CON_NOME_ED_ETICHETTA = "dati_etichettati";
const VECCHIA = "11111111-1111-1111-1111-111111111111";
const NUOVA = "22222222-2222-2222-2222-222222222222";
const QUARANTA_GIORNI_FA = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

let base = "";
const processi: ChildProcess[] = [];
const bloccate: string[] = [];

afterEach(() => {
  for (const p of processi.splice(0)) p.kill();
  for (const d of bloccate.splice(0)) chmodSync(d, 0o755);
  if (base) rmSync(base, { recursive: true, force: true });
});

function file(percorso: string, contenuto = "x", vecchio = false) {
  mkdirSync(dirname(percorso), { recursive: true });
  writeFileSync(percorso, contenuto);
  if (vecchio) utimesSync(percorso, QUARANTA_GIORNI_FA, QUARANTA_GIORNI_FA);
}

function blocca(percorso: string, modo: number) {
  chmodSync(percorso, modo);
  bloccate.push(percorso);
}

// Il Docker finto: dice quali volumi non usa nessuno -- con il filtro
// dell'etichetta solo quelli che la portano --, quanto pesano, e annota quali
// gli si chiede di togliere. `rotto` sceglie quale risposta non arriva.
function dockerFinto(percorso: string, registro: string, rotto: "" | "info" | "elenco" | "misura" = "") {
  file(
    percorso,
    `#!/bin/sh
case "$1 $2" in
  "info "*) [ "${rotto}" = "info" ] && exit 1; exit 0 ;;
  "system df") [ "${rotto}" = "misura" ] && exit 1
    printf '%s\\n' "Local Volumes space usage:" "" "VOLUME NAME   LINKS   SIZE" "${ANONIMO}   0   40.1MB" "${CREATO_A_MANO}   0   1kB" "supabase_db_dealer-platform   0   81MB" "" "Build cache usage: 0B" ;;
  "volume ls") [ "${rotto}" = "elenco" ] && { echo "permission denied" >&2; exit 1; }
    case "$*" in
      *label=com.docker.volume.anonymous*) printf '%s\\n' "${ANONIMO}" "${CON_NOME_ED_ETICHETTA}" ;;
      *) printf '%s\\n' "${ANONIMO}" "${CREATO_A_MANO}" "supabase_db_dealer-platform" ;;
    esac ;;
  "volume rm") echo "$3" >> "${registro}" ;;
esac
`,
  );
  chmodSync(percorso, 0o755);
}

// Di solito il repository sta fuori dalla casa (/workspaces contro
// /home/codespace), e una sua cartella verrebbe fermata gia' dalla serratura
// "fuori dalla casa". Con `repoInCasa` lo si mette dentro, perche' la
// serratura "sotto il repository" venga provata davvero e non solo scritta.
function preparaCasa({ repoInCasa = false } = {}) {
  base = mkdtempSync(join(tmpdir(), "libera-il-disco-"));
  const casa = join(base, "casa");
  const repo = repoInCasa ? join(casa, "progetti/repo") : join(base, "repo");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, ".git"), { recursive: true });
  cpSync(SCRIPT, join(repo, "scripts/libera-il-disco.sh"));
  file(join(repo, "importante/lavoro-non-commesso.txt"), "non si tocca");

  // Claude Code da terminale, con due voci che non sono versioni.
  const versioni = join(casa, ".local/share/claude/versions");
  for (const v of ["2.1.279", "2.1.280", "2.1.281", "latest", "2.1.282.tmp"]) file(join(versioni, v));
  mkdirSync(join(casa, ".local/bin"), { recursive: true });
  symlinkSync(join(versioni, "2.1.280"), join(casa, ".local/bin/claude"));

  // Estensione: VS Code e' tornato alla 2.1.281 e ha dichiarato obsolete le
  // due piu' recenti. "La piu' alta" terrebbe proprio quella scartata.
  const estensioni = join(casa, ".vscode-remote/extensions");
  for (const v of ["2.1.281", "2.1.282", "2.1.283"]) file(join(estensioni, `anthropic.claude-code-${v}-linux-x64/package.json`));
  file(join(estensioni, "extensions.json"), '[{"relativeLocation":"anthropic.claude-code-2.1.281-linux-x64"}]');
  // .obsolete nomina anche la 2.1.281, che extensions.json dichiara in uso: quando
  // i due file si contraddicono vince la dichiarazione, e l'estensione resta.
  file(join(estensioni, ".obsolete"), '{"anthropic.claude-code-2.1.281-linux-x64":true,"anthropic.claude-code-2.1.282-linux-x64":true,"anthropic.claude-code-2.1.283-linux-x64":true}');

  const progetto = join(casa, ".claude/projects/progetto");
  file(join(progetto, `${VECCHIA}.jsonl`), "{}", true);
  file(join(progetto, `${VECCHIA}/subagents/a.jsonl`), "{}", true);
  file(join(progetto, `${NUOVA}.jsonl`), "{}");
  file(join(progetto, "memory/MEMORY.md"), "indice", true);
  file(join(progetto, "memory/vecchia.jsonl"), "{}", true);

  file(join(casa, ".npm/_cacache/x"));
  file(join(casa, ".npm/_npx/y"));
  file(join(casa, ".npm/tieni.txt"));
  file(join(casa, ".cache/ms-playwright/chromium/z"));
  file(join(casa, ".cache/altro/tieni"));

  const bin = join(base, "bin");
  const registro = join(base, "docker-tolti.txt");
  dockerFinto(join(bin, "docker"), registro);

  return { repo, casa, versioni, estensioni, progetto, bin, registro, docker: join(bin, "docker") };
}

type Casa = ReturnType<typeof preparaCasa>;

function esegui(c: Casa, argomenti: string[] = [], { casa = c.casa, docker = c.docker } = {}) {
  const r = spawnSync("bash", [join(c.repo, "scripts/libera-il-disco.sh"), ...argomenti], {
    env: { ...process.env, HOME: casa, LIBERA_DOCKER: docker, PATH: `${c.bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return { stato: r.status, uscita: `${r.stdout}${r.stderr}` };
}

const intatto = (c: Casa) => readFileSync(join(c.repo, "importante/lavoro-non-commesso.txt"), "utf8");
const tolti = (c: Casa) => (existsSync(c.registro) ? readFileSync(c.registro, "utf8").trim().split("\n") : []);

describe("libera il disco: cosa toglie e cosa tiene", () => {
  it("senza --togli guarda e basta: stampa l'elenco, volumi compresi, e non toglie niente", () => {
    const c = preparaCasa();
    const r = esegui(c);

    expect(r.stato).toBe(0);
    expect(r.uscita).toContain(join(c.versioni, "2.1.279"));
    expect(r.uscita).toContain(`volume ${ANONIMO}`);
    expect(r.uscita).toContain("Niente e' stato tolto");
    expect(existsSync(join(c.versioni, "2.1.279"))).toBe(true);
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(true);
    expect(tolti(c)).toEqual([]);
  });

  it("con --togli toglie solo cio' che si rifa', e tiene tutto il resto", () => {
    const c = preparaCasa();
    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(0);
    expect(r.uscita).toContain("Tolto.");
    // Claude Code da terminale: la piu' recente e quella a cui punta `claude`;
    // le voci che non sono versioni non si toccano e non contano.
    expect(existsSync(join(c.versioni, "2.1.279"))).toBe(false);
    expect(existsSync(join(c.versioni, "2.1.280"))).toBe(true);
    expect(existsSync(join(c.versioni, "2.1.281"))).toBe(true);
    expect(existsSync(join(c.versioni, "latest"))).toBe(true);
    expect(existsSync(join(c.versioni, "2.1.282.tmp"))).toBe(true);
    // Estensione: via le due dichiarate obsolete, resta quella in uso.
    expect(existsSync(join(c.estensioni, "anthropic.claude-code-2.1.281-linux-x64"))).toBe(true);
    expect(existsSync(join(c.estensioni, "anthropic.claude-code-2.1.282-linux-x64"))).toBe(false);
    expect(existsSync(join(c.estensioni, "anthropic.claude-code-2.1.283-linux-x64"))).toBe(false);
    // Trascritti: via il vecchio con la sua cartella, restano il recente e la memoria.
    expect(existsSync(join(c.progetto, `${VECCHIA}.jsonl`))).toBe(false);
    expect(existsSync(join(c.progetto, VECCHIA))).toBe(false);
    expect(existsSync(join(c.progetto, `${NUOVA}.jsonl`))).toBe(true);
    expect(existsSync(join(c.progetto, "memory/MEMORY.md"))).toBe(true);
    expect(existsSync(join(c.progetto, "memory/vecchia.jsonl"))).toBe(true);
    // Cache: via quelle nominate, resta il resto.
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(false);
    expect(existsSync(join(c.casa, ".npm/_npx"))).toBe(false);
    expect(existsSync(join(c.casa, ".cache/ms-playwright"))).toBe(false);
    expect(existsSync(join(c.casa, ".npm/tieni.txt"))).toBe(true);
    expect(existsSync(join(c.casa, ".cache/altro/tieni"))).toBe(true);
    // Docker: solo il volume anonimo davvero anonimo.
    expect(tolti(c)).toEqual([ANONIMO]);
    expect(intatto(c)).toBe("non si tocca");
  });

  // La ricerca dei processi non deve trovare se stessa: un `ps | grep` con il
  // percorso nella propria riga di comando farebbe sembrare tutto "in uso".
  it("tiene una versione su cui gira un processo, e toglie quella che nessuno usa", async () => {
    const c = preparaCasa();
    const vecchia = join(c.versioni, "2.1.279");
    processi.push(spawn("bash", ["-c", `exec -a "${vecchia}" sleep 30`], { stdio: "ignore" }));
    await new Promise((fatto) => setTimeout(fatto, 200));

    // Guardando non deve nemmeno comparire nell'elenco. E' qui che il primo
    // controllo si separa dal secondo, che si rifa' solo prima di togliere:
    // con il solo secondo, l'elenco annuncerebbe una cosa che poi non fa.
    expect(esegui(c).uscita).not.toContain(vecchia);

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(0);
    expect(existsSync(vecchia)).toBe(true);
  });

  // L'estensione di VS Code non compare nella riga di comando di nessuno: il
  // processo che la usa ne carica una libreria nativa, e la si vede solo nelle
  // sue mappe di memoria. Trovato il 26/09/2026 sulla macchina vera.
  //
  // Il caso lo riproduce cosi': una libreria di sistema copiata dentro
  // l'estensione e caricata da un processo con LD_PRELOAD. Non con Python: il
  // suo mmap tiene il file aperto per conto suo, e a trovarlo sarebbe la
  // serratura dei file aperti, non quella delle mappe.
  it("tiene un'estensione obsoleta di cui un processo ha caricato una libreria", async () => {
    const c = preparaCasa();
    const libreria = ["/lib/x86_64-linux-gnu/libm.so.6", "/usr/lib/x86_64-linux-gnu/libm.so.6", "/lib64/libm.so.6", "/usr/lib64/libm.so.6"].find((p) => existsSync(p));
    expect(libreria, "serve una libreria di sistema da caricare").toBeTruthy();
    const caricata = join(c.estensioni, "anthropic.claude-code-2.1.283-linux-x64/resources/nativa.node");
    mkdirSync(dirname(caricata), { recursive: true });
    cpSync(libreria as string, caricata);
    processi.push(spawn("sleep", ["30"], { stdio: "ignore", env: { ...process.env, LD_PRELOAD: caricata } }));
    await new Promise((fatto) => setTimeout(fatto, 300));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(0);
    expect(existsSync(caricata)).toBe(true);
    expect(existsSync(join(c.estensioni, "anthropic.claude-code-2.1.282-linux-x64"))).toBe(false);
  });

  // La memoria si riconosce da MEMORY.md, non dal nome: il pacchetto next ha
  // due cartelle "memory", e con la regola "un rifiuto ferma tutto" un next
  // nella cache di npx avrebbe bloccato ogni pulizia per sempre.
  it("una cartella che si chiama memory dentro una cache non ferma niente", () => {
    const c = preparaCasa();
    file(join(c.casa, ".npm/_npx/abc/node_modules/next/dist/server/memory/cache.js"));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(0);
    expect(existsSync(join(c.casa, ".npm/_npx"))).toBe(false);
  });
});

describe("libera il disco: le serrature", () => {
  // La prima stesura prendeva come "cartella della stessa sessione" il nome
  // del trascritto senza ".jsonl": per un file chiamato ".jsonl" era la
  // cartella del progetto intera, memoria compresa. Uscita verde.
  // Una cartella di sessione che e' un collegamento non si segue e non si
  // toglie: il trascritto vecchio se ne va, il collegamento resta.
  it("la cartella di una sessione che e' un collegamento non si tocca", () => {
    const c = preparaCasa();
    rmSync(join(c.progetto, VECCHIA), { recursive: true });
    symlinkSync(join(c.casa, ".cache/altro"), join(c.progetto, VECCHIA));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(0);
    expect(existsSync(join(c.progetto, `${VECCHIA}.jsonl`))).toBe(false);
    expect(existsSync(join(c.progetto, VECCHIA))).toBe(true);
    expect(existsSync(join(c.casa, ".cache/altro/tieni"))).toBe(true);
  });

  it("un file chiamato '.jsonl' non trascina via la cartella del progetto", () => {
    const c = preparaCasa();
    file(join(c.progetto, ".jsonl"), "{}", true);

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(0);
    expect(existsSync(join(c.progetto, "memory/MEMORY.md"))).toBe(true);
    expect(existsSync(join(c.progetto, `${NUOVA}.jsonl`))).toBe(true);
  });

  // Un nome con un "a capo" spezzato in due righe dava come percorso la
  // cartella del progetto. Adesso i nomi viaggiano interi, e un percorso con
  // un "a capo" viene rifiutato: allora non si toglie niente.
  it("un nome con un 'a capo' dentro non spezza i percorsi, e ferma tutto", () => {
    const c = preparaCasa();
    file(join(c.casa, ".claude/projects", "progetto\naltro", `${VECCHIA}.jsonl`), "{}", true);

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(1);
    expect(r.uscita).toContain("RIFIUTATO (percorso non valido)");
    expect(existsSync(join(c.progetto, "memory/MEMORY.md"))).toBe(true);
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(true);
    expect(tolti(c)).toEqual([]);
  });

  // La trappola e' la cartella genitrice collegata, non il candidato: un
  // collegamento come candidato `rm` lo toglie senza seguirlo, e il test non
  // proverebbe niente. Con ~/.cache collegata al repository, togliere
  // ~/.cache/ms-playwright vorrebbe dire togliere una cartella del repository.
  it("rifiuta cio' che porta dentro il repository, e allora non toglie niente", () => {
    const c = preparaCasa({ repoInCasa: true });
    file(join(c.repo, "strumenti/ms-playwright/nota.txt"), "del repository");
    rmSync(join(c.casa, ".cache"), { recursive: true });
    symlinkSync(join(c.repo, "strumenti"), join(c.casa, ".cache"));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(1);
    expect(r.uscita).toContain("RIFIUTATO (sotto il repository)");
    expect(r.uscita).toContain("FERMATO: con un rifiuto non si toglie niente");
    expect(readFileSync(join(c.repo, "strumenti/ms-playwright/nota.txt"), "utf8")).toBe("del repository");
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(true);
    expect(existsSync(join(c.versioni, "2.1.279"))).toBe(true);
    expect(tolti(c)).toEqual([]);
  });

  it("rifiuta cio' che porta fuori dalla casa dell'utente", () => {
    const c = preparaCasa();
    const fuori = join(base, "fuori");
    file(join(fuori, "ms-playwright/nota.txt"), "di un altro");
    rmSync(join(c.casa, ".cache"), { recursive: true });
    symlinkSync(fuori, join(c.casa, ".cache"));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(1);
    expect(r.uscita).toContain("RIFIUTATO (fuori dalla casa dell'utente)");
    expect(readFileSync(join(fuori, "ms-playwright/nota.txt"), "utf8")).toBe("di un altro");
  });

  it("rifiuta un percorso che porta alla casa stessa", () => {
    const c = preparaCasa();
    rmSync(join(c.casa, ".npm/_npx"), { recursive: true });
    symlinkSync(c.casa, join(c.casa, ".npm/_npx"));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(1);
    expect(r.uscita).toContain("RIFIUTATO (percorso pericoloso)");
    expect(existsSync(join(c.casa, ".npm/tieni.txt"))).toBe(true);
  });

  it("rifiuta un percorso che porta a una cartella della memoria", () => {
    const c = preparaCasa();
    rmSync(join(c.casa, ".cache/ms-playwright"), { recursive: true });
    symlinkSync(join(c.progetto, "memory"), join(c.casa, ".cache/ms-playwright"));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(1);
    expect(r.uscita).toContain("RIFIUTATO (cartella della memoria)");
    expect(existsSync(join(c.progetto, "memory/MEMORY.md"))).toBe(true);
  });

  it("rifiuta una cartella che contiene una cartella della memoria", () => {
    const c = preparaCasa();
    file(join(c.casa, ".npm/_npx/pacchetto/memory/MEMORY.md"), "indice");

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(1);
    expect(r.uscita).toContain("RIFIUTATO (contiene una cartella della memoria)");
    expect(existsSync(join(c.casa, ".npm/_npx/pacchetto/memory/MEMORY.md"))).toBe(true);
  });

  it("lanciato da standard input non parte: non saprebbe dov'e' il repository", () => {
    const c = preparaCasa();
    const r = spawnSync("bash", ["-s", "--", "--togli"], {
      input: readFileSync(join(c.repo, "scripts/libera-il-disco.sh")),
      env: { ...process.env, HOME: c.casa, LIBERA_DOCKER: c.docker },
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).toContain("FERMATO");
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(true);
  });

  it("fuori da un repository non parte", () => {
    const c = preparaCasa();
    renameSync(join(c.repo, ".git"), join(c.repo, "non-git"));

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(2);
    expect(r.uscita).toContain("non trovo il repository");
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(true);
  });

  it("senza una casa utilizzabile non parte, anche quando '/' e' scritta in un altro modo", () => {
    const c = preparaCasa();
    for (const casa of ["/", "/.", "//", "/tmp/.."]) {
      const r = esegui(c, ["--togli"], { casa });
      expect(r.stato, casa).toBe(2);
      expect(r.uscita, casa).toContain("FERMATO");
    }
    expect(tolti(c)).toEqual([]);
  });
});

describe("libera il disco: quando non ha potuto guardare lo dice", () => {
  it("Docker che non risponde: i volumi sono NON guardati, uscita 3, il resto si toglie", () => {
    const c = preparaCasa();
    const rotto = join(c.bin, "docker-muto");
    dockerFinto(rotto, c.registro, "info");

    const r = esegui(c, ["--togli"], { docker: rotto });

    expect(r.stato).toBe(3);
    expect(r.uscita).toContain("NON GUARDATO: volumi Docker: Docker non risponde");
    expect(existsSync(join(c.casa, ".npm/_cacache"))).toBe(false);
  });

  it("l'elenco dei volumi che non si legge: NON guardato, uscita 3", () => {
    const c = preparaCasa();
    const rotto = join(c.bin, "docker-senza-elenco");
    dockerFinto(rotto, c.registro, "elenco");

    const r = esegui(c, [], { docker: rotto });

    expect(r.stato).toBe(3);
    expect(r.uscita).toContain("NON GUARDATO: volumi Docker: l'elenco non si legge");
  });

  it("Docker che non c'e' non e' un guasto: niente da guardare, uscita 0", () => {
    const c = preparaCasa();
    const r = esegui(c, [], { docker: join(base, "nessun-docker") });

    expect(r.stato).toBe(0);
    expect(r.uscita).toContain("Docker non c'e'");
  });

  // Un totale a cui manca una misura non e' un totale: "1, 0 MB" sarebbe un
  // numero con la faccia di una misura.
  it("se i pesi dei volumi non arrivano, il totale dice che non si sa", () => {
    const c = preparaCasa();
    const rotto = join(c.bin, "docker-senza-misura");
    dockerFinto(rotto, c.registro, "misura");

    const r = esegui(c, [], { docker: rotto });

    expect(r.stato).toBe(0);
    expect(r.uscita).toContain("peso totale non noto");
    expect(r.uscita).not.toContain("0 MB in tutto");
  });

  it("una cartella che non si legge rende l'elenco incompleto, e lo dice", () => {
    const c = preparaCasa();
    blocca(c.versioni, 0o000);

    const r = esegui(c);

    expect(r.stato).toBe(3);
    expect(r.uscita).toContain("NON GUARDATO: versioni di Claude Code");
  });

  it("se extensions.json non si legge, le estensioni non si toccano, e lo dice", () => {
    const c = preparaCasa();
    blocca(join(c.estensioni, "extensions.json"), 0o000);

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(3);
    expect(r.uscita).toContain("NON GUARDATO: estensioni");
    expect(existsSync(join(c.estensioni, "anthropic.claude-code-2.1.282-linux-x64"))).toBe(true);
  });

  // Una cancellazione che non riesce non ferma le altre, e l'uscita lo dice.
  it("una cancellazione fallita non ferma le altre: uscita 4", () => {
    const c = preparaCasa();
    const chiusa = join(c.casa, ".npm/_cacache/chiusa");
    file(join(chiusa, "f"));
    blocca(chiusa, 0o555);

    const r = esegui(c, ["--togli"]);

    expect(r.stato).toBe(4);
    expect(r.uscita).toContain("NON TOLTO");
    expect(existsSync(join(c.casa, ".cache/ms-playwright"))).toBe(false);
    expect(tolti(c)).toEqual([ANONIMO]);
  });
});
