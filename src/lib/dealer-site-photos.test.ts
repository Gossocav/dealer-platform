import { describe, expect, it } from "vitest";
import { MAX_FOTO_VEICOLO, nuovoTettoCopieTolte, sostituisciFoto } from "@/lib/dealer-site-photos";
import { chiaveDellaFoto } from "@/lib/identita-foto";

/**
 * La galleria di un'auto importata dal sito, provata per comportamento.
 *
 * Il difetto che questi test impediscono, 25/09/2026: la galleria si
 * confrontava sull'indirizzo intero e si rifaceva per intero appena cambiava
 * una foto o si spostava la copertina. Con le foto copiate nel nostro
 * archivio avrebbe buttato le copie a ogni ritocco del concessionario -- e il
 * 22/08/2026, quando la misura delle foto e' passata da 800 a 1600 px, tutte
 * insieme: 3.233 copie sostituite con DealerK, cioe' il guasto da cui la copia
 * protegge.
 */

const DEALER = "11111111-1111-1111-1111-111111111111";
const ALTRO_DEALER = "22222222-2222-2222-2222-222222222222";
const AUTO = "aaaaaaaa-0000-0000-0000-00000000000a";
const ALTRA_AUTO = "bbbbbbbb-0000-0000-0000-00000000000b";
const dk = (misura: string, nome: string, dominio = "cdn.dealerk.it") =>
  `https://${dominio}/dealer/datafiles/vehicle/images/${misura}/2396/${nome}.jpg`;

type Riga = {
  id: string;
  vehicle_id: string;
  dealer_id: string;
  image_url: string;
  origine_url: string | null;
  position: number;
  is_cover: boolean;
  copia_esito: string | null;
};

/**
 * Un finto archivio che tiene le righe in memoria e fa quello che il database
 * farebbe con i filtri usati da `sostituisciFoto`: abbastanza per vedere cosa
 * resta, cosa si cancella e con quali condizioni.
 */
function finto(righe: Riga[], opzioni: { letturaFallita?: boolean } = {}) {
  const tabella = righe.map((r) => ({ ...r }));
  const scritture: string[] = [];
  const cancellazioni: Array<{ filtri: Record<string, unknown> }> = [];
  const fileTolti: string[] = [];
  let nuovoId = 0;

  const client = {
    from() {
      return {
        select() {
          const filtri: Array<(r: Riga) => boolean> = [];
          const catena = {
            eq(colonna: keyof Riga, valore: unknown) {
              filtri.push((r) => r[colonna] === valore);
              return catena;
            },
            in(colonna: keyof Riga, valori: unknown[]) {
              filtri.push((r) => valori.includes(r[colonna]));
              return Promise.resolve({ data: tabella.filter((r) => filtri.every((f) => f(r))), error: null });
            },
            order() {
              if (opzioni.letturaFallita) return Promise.resolve({ data: null, error: { message: "timeout" } });
              const dati = tabella.filter((r) => filtri.every((f) => f(r))).sort((a, b) => a.position - b.position);
              return Promise.resolve({ data: dati, error: null });
            },
          };
          return catena;
        },
        delete() {
          const filtri: Record<string, unknown> = {};
          const catena = {
            eq(colonna: string, valore: unknown) {
              filtri[colonna] = valore;
              return catena;
            },
            in(colonna: string, valori: unknown[]) {
              filtri[colonna] = valori;
              cancellazioni.push({ filtri: { ...filtri } });
              scritture.push("delete");
              for (let i = tabella.length - 1; i >= 0; i -= 1) {
                const r = tabella[i];
                if (r.dealer_id === filtri.dealer_id && (valori as string[]).includes(r.id)) tabella.splice(i, 1);
              }
              return Promise.resolve({ error: null });
            },
          };
          return catena;
        },
        update(valori: Partial<Riga>) {
          const filtri: Record<string, unknown> = {};
          const catena = {
            eq(colonna: string, valore: unknown) {
              filtri[colonna] = valore;
              if (filtri.id && filtri.dealer_id) {
                scritture.push("update");
                const r = tabella.find((x) => x.id === filtri.id && x.dealer_id === filtri.dealer_id);
                if (r) Object.assign(r, valori);
                return Promise.resolve({ error: null });
              }
              return catena;
            },
          };
          return catena;
        },
        insert(nuove: Array<Partial<Riga>>) {
          scritture.push("insert");
          for (const n of nuove) {
            nuovoId += 1;
            const riga = n as Riga;
            tabella.push({ ...riga, id: riga.id ?? `nuova-${nuovoId}`, origine_url: riga.origine_url ?? null, copia_esito: riga.copia_esito ?? null });
          }
          return Promise.resolve({ error: null });
        },
      };
    },
    storage: {
      from() {
        return {
          remove(percorsi: string[]) {
            fileTolti.push(...percorsi);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };

  const galleria = (auto = AUTO) =>
    tabella
      .filter((r) => r.vehicle_id === auto)
      .sort((a, b) => a.position - b.position);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, tabella, scritture, cancellazioni, fileTolti, galleria };
}

const copiata = (id: string, nome: string, position: number, extra: Partial<Riga> = {}): Riga => ({
  id,
  vehicle_id: AUTO,
  dealer_id: DEALER,
  image_url: `${DEALER}/${AUTO}/${nome}-sha.jpg`,
  origine_url: dk("800x0", nome),
  position,
  is_cover: position === 0,
  copia_esito: "copiata",
  ...extra,
});
const esterna = (id: string, nome: string, position: number, extra: Partial<Riga> = {}): Riga => ({
  id,
  vehicle_id: AUTO,
  dealer_id: DEALER,
  image_url: dk("1600x0", nome),
  origine_url: dk("1600x0", nome),
  position,
  is_cover: position === 0,
  copia_esito: null,
  ...extra,
});

describe("una foto si riconosce per identita', non per indirizzo", () => {
  it("la stessa foto in due misure e con due domini e' la stessa foto", () => {
    expect(chiaveDellaFoto(dk("800x0", "a"))).toBe(chiaveDellaFoto(dk("1600x0", "a", "nuovo.dealerk.it")));
    expect(chiaveDellaFoto(dk("800x0", "a"))).not.toBe(chiaveDellaFoto(dk("800x0", "b")));
  });

  it("la cartella resta nella chiave: due concessionarie possono avere file con lo stesso nome", () => {
    const altra = "https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/9999/a.jpg";
    expect(chiaveDellaFoto(altra)).not.toBe(chiaveDellaFoto(dk("1600x0", "a")));
  });
});

describe("la galleria si rifa' foto per foto, e le copie restano", () => {
  it("se la galleria e' gia' quella giusta non si tocca niente", async () => {
    const f = finto([esterna("1", "a", 0), esterna("2", "b", 1)]);
    const esito = await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a"), dk("1600x0", "b")]);
    expect(esito.esito).toBe("invariata");
    expect(f.scritture).toEqual([]);
  });

  // Il caso del 22/08/2026: cambia la misura, non la foto.
  it("un cambio di misura non butta via le copie: si aggiorna solo l'origine", async () => {
    const f = finto([copiata("1", "a", 0), copiata("2", "b", 1)]);
    const esito = await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a"), dk("1600x0", "b")]);
    expect(esito.esito).toBe("aggiornata");
    expect(f.cancellazioni).toEqual([]);
    expect(f.galleria().map((r) => [r.id, r.image_url, r.origine_url])).toEqual([
      ["1", `${DEALER}/${AUTO}/a-sha.jpg`, dk("1600x0", "a")],
      ["2", `${DEALER}/${AUTO}/b-sha.jpg`, dk("1600x0", "b")],
    ]);
  });

  it("una copertina spostata cambia posizione e copertina, non cancella niente", async () => {
    const f = finto([copiata("1", "a", 0), copiata("2", "b", 1)]);
    await sostituisciFoto(f.client, DEALER, AUTO, [dk("800x0", "b"), dk("800x0", "a")]);
    expect(f.cancellazioni).toEqual([]);
    expect(f.galleria().map((r) => [r.id, r.position, r.is_cover])).toEqual([
      ["2", 0, true],
      ["1", 1, false],
    ]);
  });

  it("una foto sostituita sul sito: si toglie solo quella, e la nuova entra con la sua origine", async () => {
    const f = finto([copiata("1", "a", 0), copiata("2", "b", 1)]);
    const esito = await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a"), dk("1600x0", "c")]);
    expect(esito).toMatchObject({ esito: "aggiornata", tolte: 1, tolteCopiate: 1, inserite: 1 });
    const g = f.galleria();
    expect(g.map((r) => r.id)).toEqual(["1", "nuova-1"]);
    expect(g[1]).toMatchObject({ image_url: dk("1600x0", "c"), origine_url: dk("1600x0", "c"), position: 1, is_cover: false });
  });

  it("una foto non ancora copiata segue l'origine anche nell'indirizzo mostrato", async () => {
    const f = finto([esterna("1", "a", 0, { image_url: dk("800x0", "a"), origine_url: dk("800x0", "a") })]);
    await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a")]);
    expect(f.galleria()[0]).toMatchObject({ id: "1", image_url: dk("1600x0", "a"), origine_url: dk("1600x0", "a") });
  });

  it("la cancellazione e' limitata alle righe di quell'auto di quella concessionaria", async () => {
    const intrusa: Riga = { ...esterna("9", "a", 0), vehicle_id: ALTRA_AUTO, dealer_id: ALTRO_DEALER };
    const f = finto([esterna("1", "x", 0), intrusa]);
    await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "y")]);
    expect(f.cancellazioni).toEqual([{ filtri: { dealer_id: DEALER, id: ["1"] } }]);
    expect(f.tabella.some((r) => r.id === "9")).toBe(true);
  });

  it("resta il tetto di venti foto a veicolo, e la stessa foto in due misure conta una volta", async () => {
    const f = finto([]);
    const urls = [dk("800x0", "a"), dk("1600x0", "a"), ...Array.from({ length: 30 }, (_, i) => dk("1600x0", `f${i}`))];
    await sostituisciFoto(f.client, DEALER, AUTO, urls);
    expect(f.galleria()).toHaveLength(MAX_FOTO_VEICOLO);
    expect(f.galleria().filter((r) => chiaveDellaFoto(r.image_url) === chiaveDellaFoto(dk("1600x0", "a")))).toHaveLength(1);
  });

  it("una galleria che non si e' potuta leggere non si tocca: non letta non e' vuota", async () => {
    const f = finto([copiata("1", "a", 0)], { letturaFallita: true });
    const esito = await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "z")]);
    expect(esito.esito).toBe("non-letta");
    expect(f.scritture).toEqual([]);
  });
});

describe("il file di una foto tolta si cancella solo se nessun'altra riga lo usa", () => {
  it("il file nostro di una foto tolta si cancella", async () => {
    const f = finto([copiata("1", "a", 0), copiata("2", "b", 1)]);
    const esito = await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a")]);
    expect(f.fileTolti).toEqual([`${DEALER}/${AUTO}/b-sha.jpg`]);
    expect(esito).toMatchObject({ fileTolti: 1 });
  });

  // Il caso di "Duplica" prima della correzione: due auto sullo stesso file.
  it("un file usato anche da un'altra auto resta", async () => {
    const condiviso = `${DEALER}/${AUTO}/b-sha.jpg`;
    const f = finto([
      copiata("1", "a", 0),
      copiata("2", "b", 1),
      { ...copiata("7", "b", 0), vehicle_id: ALTRA_AUTO, image_url: condiviso },
    ]);
    await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a")]);
    expect(f.fileTolti).toEqual([]);
    expect(f.tabella.find((r) => r.id === "7")?.image_url).toBe(condiviso);
  });

  it("un indirizzo esterno non e' un file nostro: non si chiede di cancellarlo", async () => {
    const f = finto([esterna("1", "a", 0), esterna("2", "b", 1)]);
    await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a")]);
    expect(f.fileTolti).toEqual([]);
  });
});

describe("il tetto delle foto copiate tolte ferma la galleria, non la tronca", () => {
  // La rete per un cambio dei nomi dei file da parte di DealerK: tutte le
  // copie cambierebbero identita' insieme.
  it("oltre il tetto la galleria resta com'e', e l'esito lo dice", async () => {
    const f = finto(Array.from({ length: 5 }, (_, i) => copiata(String(i), `v${i}`, i)));
    const tetto = { restanti: 3 };
    const esito = await sostituisciFoto(
      f.client,
      DEALER,
      AUTO,
      Array.from({ length: 5 }, (_, i) => dk("1600x0", `rinominata${i}`)),
      tetto,
    );
    expect(esito).toEqual({ esito: "fermata-dal-tetto", tolteCopiate: 5, restanti: 3 });
    expect(f.scritture).toEqual([]);
    expect(tetto.restanti).toBe(3);
  });

  it("sotto il tetto la galleria si aggiorna e il conto scende", async () => {
    const f = finto([copiata("1", "a", 0), copiata("2", "b", 1)]);
    const tetto = nuovoTettoCopieTolte();
    const prima = tetto.restanti;
    await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "a")], tetto);
    expect(tetto.restanti).toBe(prima - 1);
  });

  it("le foto non copiate non consumano il tetto", async () => {
    const f = finto([esterna("1", "a", 0), esterna("2", "b", 1)]);
    const tetto = { restanti: 0 };
    const esito = await sostituisciFoto(f.client, DEALER, AUTO, [dk("1600x0", "c")], tetto);
    expect(esito.esito).toBe("aggiornata");
  });
});
