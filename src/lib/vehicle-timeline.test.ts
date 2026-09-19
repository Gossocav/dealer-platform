import { describe, expect, it } from "vitest";
import { getActionDescription } from "@/lib/vehicle-timeline";

/**
 * **La cronologia non dichiara un'origine che non le e' stata data.**
 *
 * Il difetto, trovato il 19/09/2026 cercando un esempio non numerico per la
 * regola del ripiego: la riga di un contatto ricevuto si scriveva
 * `String(metadata.source ?? "marketplace")` e stampava *"Nuovo lead
 * ricevuto (marketplace)."* anche quando l'evento **non portava nessuna
 * origine**. Cioe' la cronologia la inventava.
 *
 * Non stava dicendo il falso, ma **per combinazione**: oggi i contatti
 * nascono solo da `/api/marketplace/lead`, che scrive `source: "marketplace"`
 * -- verificato nella rotta. Il giorno che il gestionale avra' "nuovo
 * contatto", caso gia' previsto in AGENTS.md, quella riga avrebbe cominciato
 * a mentire da sola, e nessuno l'avrebbe smentita: una cronologia si legge e
 * non si controlla.
 *
 * E' la stessa regola che vale ovunque in questo progetto -- `??` e `||` su
 * un valore mostrato sono sempre sospetti, perche' il valore a destra deve
 * rispondere alla stessa domanda di quello a sinistra -- applicata a una
 * **provenienza** invece che a un numero. Su una provenienza pesa di piu':
 * un numero sbagliato qualcuno prima o poi lo ricontrolla, una frase no.
 */
describe("la cronologia del veicolo non inventa l'origine di un contatto", () => {
  it("scrive l'origine quando c'e'", () => {
    expect(getActionDescription("vehicle.lead_received", { source: "marketplace" })).toBe(
      "Nuovo lead ricevuto (marketplace).",
    );
    // Il giorno che ne arriva una diversa, la cronologia dice quella.
    expect(getActionDescription("vehicle.lead_received", { source: "telefono" })).toBe(
      "Nuovo lead ricevuto (telefono).",
    );
  });

  it("tace sull'origine quando non c'e', invece di dichiararne una", () => {
    // Il caso che produceva la bugia.
    expect(getActionDescription("vehicle.lead_received", {})).toBe("Nuovo lead ricevuto.");
    expect(getActionDescription("vehicle.lead_received", { source: null })).toBe("Nuovo lead ricevuto.");
    expect(getActionDescription("vehicle.lead_received", { source: "   " })).toBe("Nuovo lead ricevuto.");
  });

  it("in nessun caso la parola marketplace compare senza che l'evento l'abbia detta", () => {
    // La forma della regola, non l'elenco dei casi: qualunque metadata senza
    // origine non deve produrre quella parola. Se domani qualcuno rimette un
    // ripiego diverso -- "sito", "manuale" -- questo lo prende lo stesso.
    for (const metadata of [{}, { source: null }, { source: "" }, { leadId: "abc" }, { origine: "marketplace" }]) {
      expect(getActionDescription("vehicle.lead_received", metadata)).toBe("Nuovo lead ricevuto.");
    }
  });
});

/**
 * Le altre frasi della cronologia seguono gia' la stessa regola, e restano
 * fissate qui perche' non la perdano: quando il dato manca la frase si
 * accorcia, non si riempie.
 */
describe("le altre righe della cronologia si accorciano invece di riempirsi", () => {
  it("l'invio a cliente nomina il destinatario solo se c'e'", () => {
    expect(getActionDescription("vehicle.sent_to_client", { recipientEmail: "a@b.it" })).toBe(
      "Veicolo inviato via email a a@b.it.",
    );
    expect(getActionDescription("vehicle.sent_to_client", {})).toBe("Veicolo inviato a cliente.");
  });

  it("il cambio di stato nomina i due stati solo se ci sono tutti e due", () => {
    expect(getActionDescription("vehicle.status_changed", { fromStatus: "draft", toStatus: "published" })).toBe(
      "Transizione stato: draft -> published.",
    );
    // Con uno solo dei due non si inventa l'altro.
    expect(getActionDescription("vehicle.status_changed", { toStatus: "published" })).toBe(
      "Lo stato del veicolo è stato aggiornato.",
    );
  });

  it("le immagini si contano solo se il numero c'e'", () => {
    expect(getActionDescription("vehicle.images_updated", { imagesCount: 7 })).toBe(
      "Aggiornate 7 immagini del veicolo.",
    );
    expect(getActionDescription("vehicle.images_updated", {})).toBe(
      "La galleria immagini del veicolo è stata aggiornata.",
    );
  });
});
