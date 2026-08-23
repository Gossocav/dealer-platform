import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-management-page.tsx"), "utf8");

// Con un catalogo importato dal sito della concessionaria -- centocinque
// vetture -- pubblicare una per una significa centocinque clic. La selezione
// multipla c'era gia', ma l'unica azione di gruppo era eliminare.
describe("pubblicazione di gruppo dei veicoli", () => {
  it("il pulsante c'e', accanto a quello di eliminazione", () => {
    expect(pagina).toContain("Pubblica selezionati (${selectedCount})");
    expect(pagina).toContain("onClick={handlePublishSelected}");
  });

  it("dice che sta lavorando, invece di sembrare bloccato", () => {
    expect(pagina).toContain('bulkPublishing ? "Pubblicazione in corso..."');
  });

  // Le stesse verifiche della pubblicazione singola: un veicolo con la scheda
  // incompleta non deve finire sul marketplace solo perche' era selezionato.
  it("controlla ogni veicolo come farebbe uno per uno", () => {
    const funzione = pagina.slice(
      pagina.indexOf("const handlePublishSelected"),
      pagina.indexOf("const handleDeleteSelected")
    );

    expect(funzione).toContain("evaluateVehicleHealth");
    expect(funzione).toContain("validateVehicleStatusTransitionForCrud");
    expect(funzione).toContain('.eq("dealer_id", currentDealerId)');
  });

  // Uno incompleto non deve fermare gli altri: si salta e si riferisce.
  it("un veicolo saltato non interrompe il gruppo", () => {
    const funzione = pagina.slice(
      pagina.indexOf("const handlePublishSelected"),
      pagina.indexOf("const handleDeleteSelected")
    );

    expect(funzione).toContain("saltati.push");
    expect(funzione).toMatch(/saltati\.push\([\s\S]{0,200}?continue;/);
  });

  // Il tetto del piano invece vale per tutti quelli dopo: continuare
  // significherebbe accumulare rifiuti identici.
  it("quando finisce lo spazio del piano si ferma e lo dice", () => {
    const funzione = pagina.slice(
      pagina.indexOf("const handlePublishSelected"),
      pagina.indexOf("const handleDeleteSelected")
    );

    expect(funzione).toContain('updateError.message.includes("limite di")');
    expect(funzione).toContain("break;");
  });

  it("alla fine riporta quanti ne ha pubblicati", () => {
    expect(pagina).toContain("Pubblicati ${pubblicati} veicoli su ${daPubblicare.length}.");
  });

  it("chiede conferma prima di far comparire le auto sul sito pubblico", () => {
    expect(pagina).toContain("Compariranno sul marketplace pubblico.");
  });
});
