"use client";

import { ArrowDownAZ, ArrowUpAZ, ChevronDown, Copy, Eye, Pencil, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate, type VehicleListItem, type VehicleSortState } from "@/lib/vehicles";

type VehiclesTableProps = {
  items: VehicleListItem[];
  sort: VehicleSortState;
  selectedVehicleIds: string[];
  allVisibleSelected: boolean;
  onToggleSelect: (vehicleId: string) => void;
  onToggleSelectAll: () => void;
  onSortChange: (field: VehicleSortState["field"]) => void;
  onDuplicate: (vehicleId: string) => void;
  onTogglePublished: (vehicle: VehicleListItem) => void;
  onDelete: (vehicleId: string) => void;
  busyVehicleId: string | null;
};

function statusClasses(status: VehicleListItem["status"]) {
  if (status === "published") return "bg-emerald-100 text-emerald-700";
  if (status === "sold") return "bg-slate-200 text-slate-700";
  if (status === "draft") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function SortHeader({
  label,
  field,
  sort,
  onSortChange,
}: {
  label: string;
  field: VehicleSortState["field"];
  sort: VehicleSortState;
  onSortChange: (field: VehicleSortState["field"]) => void;
}) {
  const isActive = sort.field === field;

  return (
    <button
      type="button"
      onClick={() => onSortChange(field)}
      className="inline-flex items-center gap-1 text-left font-semibold text-slate-500 hover:text-slate-700"
    >
      {label}
      {isActive ? (
        sort.direction === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />
      ) : null}
    </button>
  );
}

const VOCE_MENU =
  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

// I cinque pulsanti stavano in fila nella colonna "Azioni". A larghezza di
// laptop la colonna non li conteneva e andavano a capo uno per riga: ogni riga
// diventava alta piu' di 150px e sullo schermo entravano quattro veicoli.
// Ora la colonna occupa un pulsante solo e la riga e' alta quanto la foto.
//
// Il menu e' posizionato con position: fixed e non in assoluto dentro la
// cella: la tabella scorre di lato dentro un contenitore con overflow, che
// ritaglierebbe anche in verticale qualunque cosa esca dalla cella. Fixed
// sfugge al ritaglio, ma non segue lo scorrimento: per questo si chiude quando
// la pagina scorre o la finestra cambia misura.
function RowActionsMenu({
  vehicle,
  isBusy,
  onDuplicate,
  onTogglePublished,
  onDelete,
}: {
  vehicle: VehicleListItem;
  isBusy: boolean;
  onDuplicate: (vehicleId: string) => void;
  onTogglePublished: (vehicle: VehicleListItem) => void;
  onDelete: (vehicleId: string) => void;
}) {
  const [posizione, setPosizione] = useState<{ top: number; left: number } | null>(null);
  const bottoneRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const aperto = posizione !== null;

  const chiudi = useCallback(() => setPosizione(null), []);

  const apri = useCallback(() => {
    const bottone = bottoneRef.current;
    if (!bottone) return;

    const rect = bottone.getBoundingClientRect();
    const larghezzaMenu = 208;
    const altezzaStimata = 232;
    const spazioSotto = window.innerHeight - rect.bottom;

    setPosizione({
      // Sotto al pulsante, oppure sopra quando in fondo allo schermo non ci sta.
      top: spazioSotto < altezzaStimata ? Math.max(8, rect.top - altezzaStimata) : rect.bottom + 6,
      // Allineato a destra col pulsante, senza uscire dal bordo sinistro.
      left: Math.max(8, Math.min(rect.right - larghezzaMenu, window.innerWidth - larghezzaMenu - 8)),
    });
  }, []);

  useEffect(() => {
    if (!aperto) return undefined;

    const suClic = (evento: MouseEvent) => {
      const bersaglio = evento.target as Node;
      if (menuRef.current?.contains(bersaglio) || bottoneRef.current?.contains(bersaglio)) return;
      chiudi();
    };
    const suTasto = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") chiudi();
    };

    document.addEventListener("mousedown", suClic);
    document.addEventListener("keydown", suTasto);
    window.addEventListener("scroll", chiudi, true);
    window.addEventListener("resize", chiudi);

    return () => {
      document.removeEventListener("mousedown", suClic);
      document.removeEventListener("keydown", suTasto);
      window.removeEventListener("scroll", chiudi, true);
      window.removeEventListener("resize", chiudi);
    };
  }, [aperto, chiudi]);

  const esegui = (azione: () => void) => {
    chiudi();
    azione();
  };

  return (
    <>
      <button
        ref={bottoneRef}
        type="button"
        onClick={() => (aperto ? chiudi() : apri())}
        aria-haspopup="menu"
        aria-expanded={aperto}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        Azioni <ChevronDown className={`h-3.5 w-3.5 transition ${aperto ? "rotate-180" : ""}`} />
      </button>

      {aperto ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Azioni per ${vehicle.brand} ${vehicle.model}`}
          style={{ top: posizione.top, left: posizione.left }}
          className="fixed z-50 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-300/50"
        >
          <Link href={`/veicoli/${vehicle.id}`} role="menuitem" className={VOCE_MENU} onClick={chiudi}>
            <Eye className="h-4 w-4" /> Visualizza
          </Link>
          <Link href={`/veicoli/modifica/${vehicle.id}`} role="menuitem" className={VOCE_MENU} onClick={chiudi}>
            <Pencil className="h-4 w-4" /> Modifica
          </Link>
          <button type="button" role="menuitem" disabled={isBusy} onClick={() => esegui(() => onDuplicate(vehicle.id))} className={VOCE_MENU}>
            <Copy className="h-4 w-4" /> Duplica
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isBusy || vehicle.status === "sold"}
            onClick={() => esegui(() => onTogglePublished(vehicle))}
            className={VOCE_MENU}
          >
            <Rocket className="h-4 w-4" /> {vehicle.status === "published" ? "Metti in bozza" : "Pubblica"}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isBusy}
            onClick={() => esegui(() => onDelete(vehicle.id))}
            className={`${VOCE_MENU} text-red-700 hover:bg-red-50`}
          >
            <Trash2 className="h-4 w-4" /> Elimina
          </button>
        </div>
      ) : null}
    </>
  );
}

export function VehiclesTable({
  items,
  sort,
  selectedVehicleIds,
  allVisibleSelected,
  onToggleSelect,
  onToggleSelectAll,
  onSortChange,
  onDuplicate,
  onTogglePublished,
  onDelete,
  busyVehicleId,
}: VehiclesTableProps) {
  return (
    <section className="dashboard-fade-up overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-y-2 p-2 text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  aria-label="Seleziona tutti i veicoli visibili"
                />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Veicolo" field="brand" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                {/* Ordina ancora sulla colonna year: l'anno e' ricavato dalla
                    data di immatricolazione, quindi le due ordinano identico. */}
                <SortHeader label="Immatricolazione" field="year" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Prezzo" field="price" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Stato" field="status" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Badge</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Lead</th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Chilometri" field="mileage" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Inserimento" field="created_at" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.map((vehicle) => {
              const isBusy = busyVehicleId === vehicle.id;
              const isSelected = selectedVehicleIds.includes(vehicle.id);

              return (
                <tr key={vehicle.id} className="rounded-2xl bg-slate-50 text-slate-700">
                  <td className="rounded-l-2xl px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(vehicle.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      aria-label={`Seleziona ${vehicle.brand} ${vehicle.model}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {/* La colonna "Veicolo" e' l'unica con due righe di testo:
                        senza una larghezza minima le altre colonne se la
                        mangiano e marca, modello e allestimento finiscono
                        appiccicati alla data di immatricolazione. */}
                    <div className="flex min-w-[240px] items-center gap-3">
                      {vehicle.mainImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={vehicle.mainImageUrl} alt={vehicle.model} loading="lazy" decoding="async" className="h-14 w-20 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          N/A
                        </div>
                      )}
                      <div>
                        <p className="break-words font-semibold text-slate-900">
                          {vehicle.brand} {vehicle.model}
                        </p>
                        <p className="break-words text-xs text-slate-500">{vehicle.version}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{vehicle.registration}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">{vehicle.priceLabel}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(vehicle.status)}`}>
                      {vehicle.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3">{vehicle.badge}</td>
                  <td className="px-3 py-3">{vehicle.leadCount}</td>
                  <td className="whitespace-nowrap px-3 py-3">{vehicle.mileageLabel}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(vehicle.insertedAt)}</td>
                  <td className="rounded-r-2xl px-3 py-3">
                    <RowActionsMenu
                      vehicle={vehicle}
                      isBusy={isBusy}
                      onDuplicate={onDuplicate}
                      onTogglePublished={onTogglePublished}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
