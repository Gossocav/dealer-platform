import Link from "next/link";
import { Children, type ReactNode } from "react";
import { fraseConteggioVeicoli } from "@/lib/dealer-vehicle-filters";

type DealerVehicleSearchProps = {
  /** Le schede gia' disegnate dal server. */
  children: ReactNode;
  /** Il nome della concessionaria, per dire su cosa si sta per cercare. */
  nomeConcessionaria: string;
  /** Il suo identificativo: e' cio' che restringe la ricerca. */
  idConcessionaria: string;
  /** Quante ne ha in vetrina davvero, contate dal database, o `null`. */
  totaleInVetrina: number | null;
  /** Quante se ne stanno mostrando in questa pagina. */
  mostrati: number;
};

/**
 * L'elenco delle auto di una concessionaria, e il modo di cercarci dentro.
 *
 * **Qui non si filtra piu', e la ragione vale la pena leggerla per intera**
 * perche' e' costata un ramo buttato.
 *
 * C'erano tredici campi che filtravano **nel browser**, sulle auto gia'
 * caricate. Con 133 funzionava; il giorno che questa pagina sara' divisa in
 * pagine da ventiquattro, il browser ne avrebbe in mano ventiquattro e
 * scriverebbe "12 auto su 133" avendone guardate ventiquattro -- lo stesso
 * difetto del prezzo minimo calcolato sulle prime trecento, su questa
 * stessa pagina.
 *
 * Farli filtrare dal database e' stato provato davvero
 * (`prova/filtri-al-server-costano-l-indicizzazione`, 20/09/2026) e
 * **scartato con i numeri in mano**: leggere l'indirizzo obbliga la pagina a
 * ricostruirsi a ogni visita, misurato 0,3-0,6 secondi contro 0,07, con
 * `Cache-Control: no-store`. E' testualmente la condizione che il
 * 06/09/2026 aveva lasciato 124 schede in "Rilevata, ma attualmente non
 * indicizzata": su una pagina che esiste per farsi trovare, il prezzo era
 * troppo alto.
 *
 * Quindi: **una ricerca sola per tutto il sito.** Questa pagina resta
 * statica e mostra le auto; chi vuole filtrarle va su `/ricerca` ristretta a
 * questa concessionaria, che filtra gia' nel database, e' gia' paginata, e
 * la' il costo dinamico e' giusto perche' non e' la pagina che Google
 * indicizza per prima.
 */
export function DealerVehicleSearch({
  children,
  nomeConcessionaria,
  idConcessionaria,
  totaleInVetrina,
  mostrati,
}: DealerVehicleSearchProps) {
  const schede = Children.toArray(children);

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Il conteggio vero, letto dalla vista: e' l'informazione per cui
            uno e' entrato su questa pagina. */}
        <p className="text-sm text-slate-400">{fraseConteggioVeicoli(mostrati, totaleInVetrina, 0)}</p>

        {/* **Il pulsante dice cosa fa, non solo "Filtra".** Porta su
            un'altra pagina, e un cambio di pagina che non era annunciato
            sembra un errore: con il numero e il nome dentro, chi lo tocca sa
            gia' dove sta andando e su cosa. */}
        <Link
          href={`/ricerca?dealer=${encodeURIComponent(idConcessionaria)}`}
          className="inline-flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
        >
          {totaleInVetrina === null
            ? `Filtra le auto di ${nomeConcessionaria}`
            : `Filtra tra le ${totaleInVetrina} auto di ${nomeConcessionaria}`}
        </Link>
      </div>

      {schede.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center text-slate-400">
          Questa concessionaria non ha veicoli in vetrina.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{schede}</div>
      )}
    </section>
  );
}
