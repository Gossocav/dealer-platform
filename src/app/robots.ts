import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/public-marketplace";
import { PRIVATE_AREA_PREFIXES, PUBLIC_API_PREFIXES } from "@/lib/private-areas";

// Senza questo file /robots.txt rispondeva 404. Un 404 non blocca Google --
// in assenza di regole assume di poter entrare ovunque -- ma lasciava fuori
// la cosa che serve davvero: l'indirizzo della sitemap, che e' come un motore
// di ricerca scopre le pagine senza doverle inseguire link per link.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();

  return {
    rules: {
      userAgent: "*",
      // Il permesso esplicito sul proxy delle fotografie vince sul divieto
      // generale che copre "/api/": davanti a due regole che si contraddicono
      // i motori seguono la piu' lunga, e "/api/image-proxy" e' piu' lungo di
      // "/api/". Senza questa riga il divieto si sarebbe portato dietro ogni
      // fotografia del sito pubblico.
      // **E il permesso sui file del programma, che sembra superfluo e non lo
      // e'.** Il divieto `/*_rsc` qui sotto cerca quelle quattro lettere
      // **ovunque nell'indirizzo**, non solo fra i parametri. I file
      // costruiti a ogni pubblicazione hanno nomi casuali di tredici
      // caratteri su un alfabeto che comprende il trattino basso -- nella
      // compilazione del 21/09/2026 ce n'erano ventuno con il trattino, del
      // tipo `3f_e45q_7peon.js` -- quindi prima o poi ne esce uno chiamato
      // `ab_rsc7k2x9.js`, e quel giorno chi indicizza non scaricherebbe piu'
      // un pezzo del programma. Senza errori, senza rosso.
      //
      // **Quanto sia probabile non si sa, e non importa**: dipende da quanti
      // file, da che alfabeto e da quante posizioni, e un numero a quattro
      // cifre su tre assunti sarebbe una stima vestita da misura. Basta
      // **raro e possibile**. Un guasto silenzioso e irreversibile si
      // previene anche a uno su un milione, e il motivo e' quello -- che
      // nessuno se ne accorgerebbe -- non la frequenza.
      //
      // `/_next/` e' piu' lungo di `/*_rsc`, e a regole contrastanti vince la
      // piu' lunga: i file del programma restano leggibili e i pacchetti
      // tecnici restano fuori. Verificato con due motori robots indipendenti,
      // caso per caso.
      allow: ["/", "/_next/", ...PUBLIC_API_PREFIXES],
      disallow: [
        // Il gestionale non ha niente da offrire a chi cerca un'auto.
        ...PRIVATE_AREA_PREFIXES.map((prefix) => `${prefix}/`),

        // **I pacchetti tecnici del router, che si mangiavano il 76% delle
        // scansioni.**
        //
        // Misurato in Search Console il 21/09/2026: su 999 indirizzi di
        // esempio forniti da Google, **999 avevano la forma `?_rsc=<token>`**
        // -- circa 2.780 richieste su 3.650 in 45 giorni, spese su pacchetti
        // di pagine di servizio invece che sulle schede. Le prime della
        // classifica erano /privacy, /come-funziona, /login, /termini: le
        // pagine collegate dal pie' di pagina, cioe' da ogni schermata. Le
        // schede auto erano 15 su 999.
        //
        // `_rsc` e' un parametro anti-cache che **il router del browser**
        // attacca agli indirizzi quando prepara la navigazione successiva
        // (`set-cache-busting-search-param.js`, la cui prima riga e'
        // `'use client'`). Il contenuto della pagina viaggia gia' dentro
        // l'HTML, in `self.__next_f`: chi indicizza non ha bisogno di
        // scaricarli.
        //
        // **Verificato con un browser vero prima di scrivere questa riga**:
        // rendendo /privacy e la pagina di una concessionaria con *tutte* le
        // richieste `_rsc` abortite -- 15 e 21 tentate, 15 e 21 abortite,
        // **zero passate** -- il contenuto esce identico byte per byte
        // (59.364 e 486.497 byte di HTML, gli stessi delle rese senza
        // blocco). Una sola resa ne genera **31-39**.
        //
        // **Perche' `/*_rsc` e non `/*_rsc=`**: Next emette tutte e due le
        // forme. Nello stesso file, riga 62 `_rsc=<impronta>` e riga 64
        // `_rsc` nudo, quando l'impronta e' vuota. La regola con l'uguale
        // avrebbe lasciato passare la seconda.
        //
        // **Perche' non fa danno**: la regola prende `_rsc` in qualunque
        // posizione dell'indirizzo, percorso compreso. Tutti e **294 gli
        // indirizzi della sitemap sono stati passati in un motore robots
        // vero (Protego): bloccati 0**. Se un giorno una pagina vera dovesse
        // contenere quelle quattro lettere nel percorso, sparirebbe in
        // silenzio: il guardiano in `pacchetti-del-router-fuori.test.ts`
        // rifa' quel conto a ogni modifica.
        //
        // **Perche' qui dentro e non in un blocco per Googlebot**: quando
        // esiste un gruppo specifico, gli altri vengono ignorati -- un blocco
        // `User-agent: Googlebot` con questa sola riga gli aprirebbe
        // /admin/, /api/ e /dashboard/.
        "/*_rsc",
      ],
    },
    // Niente direttiva "Host": non fa parte dello standard, Google la ignora,
    // e l'unico motore che la legge si aspetta un nome di dominio, non un
    // indirizzo completo come quello che avremmo qui.
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
