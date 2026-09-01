"use client";

import { useEffect, useState } from "react";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { supabase } from "@/lib/supabaseClient";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveVehicleLabel } from "@/lib/public-marketplace";
import type { ContoVenduto } from "@/lib/statistiche-margine";

/**
 * Le vendite della concessionaria, lette una volta sola per chi le mostra.
 *
 * Le usano in due: la pagina Vendite a schermo e il foglio da stampare. Due
 * interrogazioni copiate sarebbero divergute alla prima modifica -- una delle
 * due pagine avrebbe cominciato a dire numeri diversi dall'altra, ed e' il
 * genere di differenza che si scopre solo davanti al commercialista.
 *
 * **Sta in un file `.tsx` di proposito**, anche se non disegna niente: il test
 * `tenant-scoped-queries` ripercorre i `.tsx` del gestionale e pretende che
 * ogni interrogazione dichiari la concessionaria. Spostando questa lettura in
 * un `.ts` uscirebbe da quel controllo senza che nessuno se ne accorga.
 *
 * **Si parte dai veicoli venduti, non dai conti economici.** Un'auto venduta
 * senza conto compilato e' comunque venduta: partendo dai conti sparirebbe
 * dall'elenco, e la pagina direbbe di aver venduto meno di quanto ha venduto.
 */

type RigaLetta = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  plate: string | null;
  vin: string | null;
  vehicle_economics: DatiConto | DatiConto[] | null;
};

type DatiConto = {
  sale_date: string | null;
  sale_price: number | null;
  total_cost: number | null;
  margin: number | null;
};

export type Vendita = ContoVenduto & { targa: string | null };

export type LetturaVendite = {
  vendite: Vendita[];
  dealerName: string;
  caricamento: boolean;
  errore: string | null;
};

function primoConto(valore: RigaLetta["vehicle_economics"]): DatiConto | null {
  return (Array.isArray(valore) ? valore[0] : valore) ?? null;
}

export function useVenditeDellaConcessionaria(): LetturaVendite {
  const [vendite, setVendite] = useState<Vendita[]>([]);
  const [dealerName, setDealerName] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    const carica = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!vivo) return;

      if (!userId) {
        setErrore("Sessione non valida. Effettua di nuovo l'accesso.");
        setCaricamento(false);
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, { activeDealerId: getActiveDealerId() });
      if (!vivo) return;

      if (!dealerId) {
        setErrore("Concessionaria non associata all'utente.");
        setCaricamento(false);
        return;
      }

      const [{ data: concessionaria }, elenco] = await Promise.all([
        supabase.from("dealers").select("legal_name, name").eq("id", dealerId).maybeSingle<{ legal_name: string | null; name: string | null }>(),
        // Letto per intero: e' un elenco di vendite, e uno troncato in
        // silenzio farebbe sparire fatturato senza dirlo.
        caricaTutto<RigaLetta>((da, a) =>
          supabase
            .from("vehicles")
            .select("id, brand, model, version, plate, vin, vehicle_economics(sale_date, sale_price, total_cost, margin)")
            .eq("dealer_id", dealerId)
            .in("status", ["sold", "delivered"])
            .range(da, a)
            .returns<RigaLetta[]>()
        ),
      ]);

      if (!vivo) return;

      setDealerName(String(concessionaria?.legal_name ?? concessionaria?.name ?? "").trim());

      if (elenco.error) {
        setErrore("Non e stato possibile leggere l'elenco delle vendite.");
        setCaricamento(false);
        return;
      }

      setVendite(
        elenco.righe.map((riga) => {
          const conto = primoConto(riga.vehicle_economics);
          return {
            vehicleId: riga.id,
            etichetta: resolveVehicleLabel(riga as never),
            targa: riga.plate ?? riga.vin ?? null,
            saleDate: conto?.sale_date ?? null,
            salePrice: conto?.sale_price ?? null,
            totalCost: conto?.total_cost ?? null,
            margin: conto?.margin ?? null,
          };
        })
      );

      setCaricamento(false);
    };

    void carica();
    return () => {
      vivo = false;
    };
  }, []);

  return { vendite, dealerName, caricamento, errore };
}
