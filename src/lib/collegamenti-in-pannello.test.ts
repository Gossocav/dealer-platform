import { describe, expect, it } from "vitest";
import { collegamentiDelDealer } from "@/lib/collegamenti-in-pannello";

describe("collegamentiDelDealer", () => {
  it("mostra soltanto le caselle compilate, nell'ordine stabilito", () => {
    const collegamenti = collegamentiDelDealer({
      website: "https://www.autogepy.it/",
      facebook_url: null,
      instagram_url: "instagram.com/autogepy",
      linkedin_url: "",
    });

    expect(collegamenti.map((c) => c.etichetta)).toEqual(["Sito", "Instagram"]);
  });

  it("aggiunge https:// a chi ha scritto il sito come lo si detta al telefono", () => {
    // I tre campi social non passano dal controllo quando si salva: nel
    // database ci finisce esattamente quello che il concessionario incolla.
    const [collegamento] = collegamentiDelDealer({ facebook_url: "www.facebook.com/delorenzi" });

    expect(collegamento.url).toBe("https://www.facebook.com/delorenzi");
    expect(collegamento.leggibile).toBe("www.facebook.com/delorenzi");
  });

  it("non rende cliccabile un valore che non e' un indirizzo", () => {
    // Il difetto che questo impedisce: "javascript:" salvato in una di queste
    // caselle diventerebbe codice eseguito nel browser di chi lo clicca, e chi
    // clicca nel pannello e' l'amministratore della piattaforma. Le righe
    // scritte prima che il controllo esistesse non sono mai passate di li'.
    expect(collegamentiDelDealer({ website: "javascript:alert(1)" })).toEqual([]);
    expect(collegamentiDelDealer({ instagram_url: "la nostra pagina" })).toEqual([]);
    expect(collegamentiDelDealer({ linkedin_url: "  " })).toEqual([]);
  });

  it("una concessionaria che non ha compilato niente non produce collegamenti", () => {
    expect(collegamentiDelDealer({})).toEqual([]);
  });
});
