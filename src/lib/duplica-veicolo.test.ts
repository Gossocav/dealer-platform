import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copiaDelVeicolo, NON_SI_COPIANO, pianoFotoDellaCopia, type FotoDaDuplicare } from "@/lib/duplica-veicolo";

/**
 * Il difetto che impedisce, verificato sul codice il 16/09/2026: "Duplica"
 * copiava ogni colonna con `select("*")`. La copia di un'auto importata
 * portava targa, telaio, cliente e l'aggancio al sito dell'originale: due
 * auto con la stessa targa, e una copia che la sincronizzazione rileggeva e
 * riscriveva come l'originale -- e che spariva quando spariva lui.
 */
describe("la copia di un'auto non porta le chiavi dell'originale", () => {
  const originale = {
    id: "v-1",
    dealer_id: "d-1",
    brand: "Fiat",
    model: "Panda",
    price: 9500,
    mileage: 12000,
    plate: "GA123BC",
    vin: "ZFA31200003123456",
    customer_id: "c-9",
    import_source: "sito.it",
    import_source_id: "1000",
    import_synced_at: "2026-09-16T00:00:00Z",
    import_missing_since: null,
    origine_dati: { price: { fonte: "sito" } },
    ricerca_testo: "fiat panda",
    status: "published",
    published: true,
    created_at: "2026-01-01",
    updated_at: "2026-09-16",
  };

  it("targa, telaio, cliente, aggancio al sito e provenienza restano all'originale", () => {
    const copia = copiaDelVeicolo(originale, "d-1") as Record<string, unknown>;
    for (const campo of ["plate", "vin", "customer_id", "import_source", "import_source_id", "import_synced_at", "import_missing_since", "ricerca_testo", "id", "created_at", "updated_at"]) {
      expect(campo in copia, `${campo} e' stato copiato`).toBe(false);
    }
    expect(copia.brand).toBe("Fiat");
    expect(copia.price).toBe(9500);
  });

  it("nasce in bozza, della concessionaria che duplica, e non pubblicata", () => {
    const copia = copiaDelVeicolo(originale, "d-2");
    expect(copia.status).toBe("draft");
    expect(copia.published).toBe(false);
    expect(copia.dealer_id).toBe("d-2");
  });

  it("i suoi campi sono del concessionario, non del sito dell'originale", () => {
    // Senza questo la copia avrebbe i segni dell'originale: un campo "dal tuo
    // sito" su un'auto che nessun sito rilegge, e che il concessionario ha
    // scelto lui di creare con quei valori.
    const copia = copiaDelVeicolo(originale, "d-1");
    expect(copia.origine_dati.price).toEqual({ fonte: "dealer" });
    expect(copia.origine_dati.brand).toEqual({ fonte: "dealer" });
    expect(copia.origine_dati.status).toBeUndefined();
    expect(copia.origine_dati.plate).toBeUndefined();
  });

  it("l'elenco di cio' che non si copia contiene le chiavi, e la pagina passa da qui", () => {
    for (const campo of ["plate", "vin", "customer_id", "import_source_id", "origine_dati"]) {
      expect(NON_SI_COPIANO).toContain(campo);
    }
    const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-management-page.tsx"), "utf8");
    expect(pagina).toContain("copiaDelVeicolo(");
    expect(pagina, "la duplicazione costruisce ancora la copia da sola").not.toContain("delete payload.id");
  });
});

/**
 * Il difetto che impedisce, verificato il 25/09/2026 sul codice e sullo schema
 * ricostruito: "Duplica" scriveva le foto della copia con l'`image_url`
 * dell'originale. Per una foto nel nostro archivio quel percorso contiene l'id
 * dell'originale, e il proxy decide se mostrarla guardando quell'auto: venduto
 * l'originale, la copia pubblicata restava senza foto; togliendo la foto dalla
 * copia si cancellava il file dell'originale. Il database non lo fermava: la
 * riga della copia nasce senza esito, e i vincoli guardano solo le "copiate".
 * Valeva gia' per le 6 foto caricate a mano; la copia delle foto da DealerK
 * lo avrebbe esteso a quasi tutte.
 */
describe("le foto della copia sono sue, mai il file dell'originale", () => {
  const ORIGINALE = "aaaaaaaa-0000-0000-0000-00000000000a";
  const COPIA = "bbbbbbbb-0000-0000-0000-00000000000b";
  const UTENTE = "deadbeef-0000-0000-0000-000000000000";
  const DEALER = "11111111-1111-1111-1111-111111111111";
  const SHA = "c".repeat(64);
  const opzioni = { idCopia: COPIA, idUtente: UTENTE, dealerId: DEALER };

  const esterna: FotoDaDuplicare = {
    image_url: "https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/1/a.jpg",
    origine_url: "https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/1/a.jpg",
    position: 0,
    is_cover: true,
  };
  const copiata: FotoDaDuplicare = {
    image_url: `${DEALER}/${ORIGINALE}/${SHA}.jpg`,
    origine_url: "https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/1/b.jpg",
    copia_esito: "copiata",
    copia_sha256: SHA,
    copia_byte: 145000,
    position: 1,
    is_cover: false,
  };
  const caricataAMano: FotoDaDuplicare = { image_url: `${UTENTE}/${ORIGINALE}/1788634607143-0-foto.jpg`, position: 2, is_cover: false };

  it("una foto esterna si riscrive con la sua origine e senza esito: la copia la fa il programma", () => {
    const [passo] = pianoFotoDellaCopia([{ ...esterna, copia_esito: "sorgente-morta" }], opzioni);
    expect(passo.tipo).toBe("riga");
    if (passo.tipo !== "riga") return;
    expect(passo.riga).toMatchObject({ vehicle_id: COPIA, dealer_id: DEALER, image_url: esterna.image_url, origine_url: esterna.origine_url });
    // La copia e' un'auto nuova: anche una foto data per morta sull'originale
    // si riprova da capo.
    expect("copia_esito" in passo.riga).toBe(false);
  });

  it("una foto copiata si copia sotto l'id della copia, con la sua prova", () => {
    const [passo] = pianoFotoDellaCopia([copiata], opzioni);
    expect(passo.tipo).toBe("copia-file");
    if (passo.tipo !== "copia-file") return;
    expect(passo.da).toBe(copiata.image_url);
    expect(passo.riga.image_url).toBe(passo.a);
    // Le stesse due regole del database (vincolo vehicle_images_copia_verificabile)
    // e dell'archivio (si carica solo nella cartella dell'utente).
    const [primo, secondo, terzo] = passo.a.split("/");
    expect(primo).toBe(UTENTE);
    expect(secondo).toBe(COPIA);
    expect(terzo).toBeTruthy();
    expect(passo.riga).toMatchObject({ origine_url: copiata.origine_url, copia_esito: "copiata", copia_sha256: SHA, copia_byte: 145000 });
  });

  it("una foto caricata a mano si copia sotto l'id della copia, senza origine", () => {
    const [passo] = pianoFotoDellaCopia([caricataAMano], opzioni);
    expect(passo.tipo).toBe("copia-file");
    if (passo.tipo !== "copia-file") return;
    expect(passo.a.split("/").slice(0, 2)).toEqual([UTENTE, COPIA]);
    expect("origine_url" in passo.riga).toBe(false);
    expect("copia_esito" in passo.riga).toBe(false);
  });

  it("nessuna riga della copia punta a un file dell'originale, ne' porta il suo id nel percorso", () => {
    const foto = [esterna, copiata, caricataAMano, { image_url: `${DEALER}/${ORIGINALE}/altro.jpg`, position: 3, is_cover: false }];
    const percorsiOriginale = new Set(foto.map((f) => f.image_url).filter((u) => !/^https?:\/\//.test(u)));
    for (const passo of pianoFotoDellaCopia(foto, opzioni)) {
      if (passo.tipo === "non-copiabile") continue;
      expect(percorsiOriginale.has(passo.riga.image_url), `condivide ${passo.riga.image_url}`).toBe(false);
      if (!/^https?:\/\//.test(passo.riga.image_url)) expect(passo.riga.image_url.split("/")[1]).toBe(COPIA);
    }
  });

  it("un indirizzo completo del nostro archivio si copia come un percorso", () => {
    const [passo] = pianoFotoDellaCopia(
      [{ image_url: `https://abcd.supabase.co/storage/v1/object/public/vehicle-images/${DEALER}/${ORIGINALE}/x.jpg`, position: 0, is_cover: true }],
      opzioni,
    );
    expect(passo.tipo).toBe("copia-file");
    if (passo.tipo === "copia-file") expect(passo.da).toBe(`${DEALER}/${ORIGINALE}/x.jpg`);
  });

  it("un indirizzo nostro che non e' un percorso non si condivide: si salta e si dice", () => {
    const [passo] = pianoFotoDellaCopia([{ image_url: "https://www.keyauto.it/api/image-proxy?foto=x", position: 0, is_cover: true }], opzioni);
    expect(passo.tipo).toBe("non-copiabile");
  });

  it("due foto con lo stesso nome di file restano due file distinti", () => {
    const passi = pianoFotoDellaCopia(
      [
        { image_url: `${UTENTE}/${ORIGINALE}/foto.jpg`, position: 0, is_cover: true },
        { image_url: `${DEALER}/${ORIGINALE}/foto.jpg`, position: 1, is_cover: false },
      ],
      opzioni,
    );
    const destinazioni = passi.flatMap((p) => (p.tipo === "copia-file" ? [p.a] : []));
    expect(new Set(destinazioni).size).toBe(2);
  });

  it("la copertina resta alla prima foto, come prima", () => {
    const passi = pianoFotoDellaCopia([esterna, { ...caricataAMano, is_cover: true }], opzioni);
    const copertine = passi.flatMap((p) => (p.tipo === "non-copiabile" ? [] : [p.riga.is_cover]));
    expect(copertine).toEqual([true, false]);
  });

  it("la pagina passa dal piano, copia il file e guarda l'esito di ogni scrittura", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-management-page.tsx"), "utf8").replace(
      /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(pagina).toMatch(/pianoFotoDellaCopia\(/);
    expect(pagina).toMatch(/\.storage\.from\("vehicle-images"\)\.copy\(/);
    // Prima si scriveva image_url dell'originale cosi' com'era.
    expect(pagina, "la copia riprende image_url dall'originale").not.toMatch(/image_url:\s*image\.image_url/);
    // Prima la scrittura delle foto non guardava il suo esito.
    expect(pagina, "la scrittura delle foto della copia non guarda l'esito").toMatch(
      /const \{ error: \w+ \} = await client\.from\("vehicle_images"\)\.insert\(righe\)/,
    );
  });
});
