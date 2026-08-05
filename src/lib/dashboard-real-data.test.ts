import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function tuttiITsx(cartella: string): string[] {
  const trovati: string[] = [];

  for (const voce of readdirSync(resolve(process.cwd(), cartella))) {
    const percorso = join(cartella, voce);
    if (statSync(resolve(process.cwd(), percorso)).isDirectory()) {
      trovati.push(...tuttiITsx(percorso));
    } else if (voce.endsWith(".tsx")) {
      trovati.push(percorso);
    }
  }

  return trovati;
}

/**
 * Ogni file che disegna una pagina del pannello concessionario, cercato invece
 * che elencato: un elenco scritto a mano dimentica la pagina aggiunta domani,
 * che e' esattamente quella che tornerebbe a mostrare un nome finto.
 */
function paginePannello() {
  const pagine = [...tuttiITsx("src/app"), ...tuttiITsx("src/components")].filter((percorso) =>
    read(percorso).includes("<DealerDashboardShell"),
  );

  expect(pagine.length, "nessuna pagina del pannello trovata").toBeGreaterThan(5);
  return pagine;
}

const shell = read("src/components/layout/dealer-dashboard-shell.tsx");
const topbar = read("src/components/layout/dealer-topbar.tsx");

// Il concessionario entrava nel proprio pannello e in alto a destra leggeva
// "Dealer Console" -- e sulla pagina Lead il nome di un'altra azienda,
// "Gossocar Premium Motors". Su tutte le pagine tranne Impostazioni.
describe("il pannello mostra il nome vero della concessionaria", () => {
  it("nessuna pagina scrive piu' un nome a mano", () => {
    for (const percorso of paginePannello()) {
      const sorgente = read(percorso);
      expect(sorgente, `${percorso} scrive un nome finto`).not.toContain('dealerName="');
    }
  });

  it("il guscio se lo va a prendere da solo", () => {
    expect(shell).toContain('.from("dealers")');
    expect(shell).toContain("setResolvedDealerName");
  });

  // Impostazioni deve poterlo ancora passare: dopo il salvataggio ha il nome
  // nuovo prima che il guscio possa rileggerlo.
  it("una pagina puo' ancora imporre il nome, e vince", () => {
    expect(shell).toContain("dealerName?.trim() || resolvedDealerName");
  });

  it("senza nome non inventa niente", () => {
    expect(shell).toContain('|| "Concessionaria"');
  });
});

describe("le iniziali nascono dal nome, non sono scritte a mano", () => {
  it("nessuna pagina impone piu' iniziali finte", () => {
    for (const percorso of paginePannello()) {
      expect(read(percorso), `${percorso} impone delle iniziali`).not.toContain('avatarInitials="');
    }
  });

  it("il guscio le ricava dal nome", () => {
    expect(shell).toContain("function toInitials");
    expect(shell).toContain("toInitials(nomeMostrato)");
  });
});

// In alto c'era un campanello con un numero scritto a mano -- "3" su tre
// pagine, "0" sulle altre -- e nessuna azione al clic. Il componente che legge
// le notifiche vere esisteva gia', scritto e funzionante, e non era mai stato
// collegato a niente.
describe("il campanello mostra le notifiche vere", () => {
  it("la barra usa il campanello vero", () => {
    expect(topbar).toContain("NotificationBell");
  });

  it("nessuna pagina passa piu' un numero di notifiche", () => {
    for (const percorso of paginePannello()) {
      expect(read(percorso), `${percorso} passa un conteggio`).not.toContain("unreadNotifications");
    }
    expect(shell).not.toContain("unreadNotifications");
    expect(topbar).not.toContain("unreadNotifications");
  });
});

describe("via i comandi che non fanno quello che promettono", () => {
  // Un campo "Cerca veicolo, lead o cliente" senza nessun comportamento
  // collegato: ci si poteva scrivere e premere invio senza che succedesse
  // niente.
  it("il campo di ricerca finto non c'e' piu'", () => {
    expect(topbar).not.toContain("Cerca veicolo, lead o cliente");
    expect(topbar).not.toContain('type="search"');
  });

  // Sopra ogni titolo compariva la scritta "Dashboard title", un segnaposto
  // rimasto dal disegno iniziale.
  it("il segnaposto sopra il titolo non c'e' piu'", () => {
    expect(topbar).not.toContain("Dashboard title");
  });
});
