import { describe, expect, it, vi } from "vitest";
import { caricaTutto, RIGHE_MASSIME, RIGHE_PER_BLOCCO } from "@/lib/carica-tutto";

function elencoFinto(quante: number) {
  const tutte = Array.from({ length: quante }, (_, i) => ({ id: i }));
  return vi.fn(async (da: number, a: number) => ({ data: tutte.slice(da, a + 1), error: null }));
}

describe("leggere un elenco per intero", () => {
  it("con poche righe fa una richiesta sola", async () => {
    const blocco = elencoFinto(12);
    const esito = await caricaTutto(blocco);

    expect(esito.righe).toHaveLength(12);
    expect(esito.troncato).toBe(false);
    expect(blocco).toHaveBeenCalledTimes(1);
  });

  // Il caso che conta: il database si ferma a mille e non lo dice.
  it("supera il muro delle mille righe", async () => {
    const blocco = elencoFinto(2500);
    const esito = await caricaTutto(blocco);

    expect(esito.righe).toHaveLength(2500);
    expect(esito.troncato).toBe(false);
    expect(blocco).toHaveBeenCalledTimes(3);
  });

  it("un elenco esattamente lungo un blocco non ne fa perdere nessuna", async () => {
    const esito = await caricaTutto(elencoFinto(RIGHE_PER_BLOCCO));

    expect(esito.righe).toHaveLength(RIGHE_PER_BLOCCO);
    expect(esito.troncato).toBe(false);
  });

  // Meglio dirlo che mostrare un elenco incompleto in silenzio.
  it("quando tocca il tetto lo dichiara", async () => {
    const esito = await caricaTutto(elencoFinto(RIGHE_MASSIME + 500));

    expect(esito.righe).toHaveLength(RIGHE_MASSIME);
    expect(esito.troncato).toBe(true);
  });

  it("un errore interrompe subito e viene restituito", async () => {
    const blocco = vi.fn(async () => ({ data: null, error: { message: "database non raggiungibile" } }));
    const esito = await caricaTutto(blocco);

    expect(esito.error?.message).toBe("database non raggiungibile");
    expect(esito.righe).toHaveLength(0);
    expect(blocco).toHaveBeenCalledTimes(1);
  });

  it("un elenco vuoto non fa girare a vuoto", async () => {
    const blocco = elencoFinto(0);
    const esito = await caricaTutto(blocco);

    expect(esito.righe).toHaveLength(0);
    expect(esito.troncato).toBe(false);
    expect(blocco).toHaveBeenCalledTimes(1);
  });
});
