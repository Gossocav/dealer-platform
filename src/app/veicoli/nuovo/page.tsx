"use client";

import { useState } from "react";

type VehicleState = {
  brand: string;
  model: string;
  trim: string;
  year: string;
  registrationMonth: string;
  mileage: string;
  fuelType: string;
  transmission: string;
  bodyType: string;
  color: string;
  price: string;
  vatIncluded: string;
  licensePlate: string;
  vin: string;
  description: string;
  listingStatus: "Bozza" | "Pubblicato";
  doors: string;
  seats: string;
  horsepower: string;
  engine: string;
  co2: string;
  emissionClass: string;
  previousOwners: string;
  warranty: string;
  availability: string;
  province: string;
  city: string;
};

const TABS = [
  "Dati principali",
  "Foto",
  "Caratteristiche",
  "Optional",
  "Prezzo",
  "Pubblicazione",
  "Anteprima",
] as const;

type Tab = (typeof TABS)[number];

const sidebarItems = [
  "Dashboard",
  "Veicoli",
  "Nuovo veicolo",
  "Lead",
  "Clienti",
  "Agenda",
  "Statistiche",
  "Impostazioni",
];

export default function NewVehiclePage() {
  const [vehicle, setVehicle] = useState<VehicleState>({
    brand: "Volkswagen",
    model: "Golf",
    trim: "Style",
    year: "2020",
    registrationMonth: "03",
    mileage: "52000",
    fuelType: "Benzina",
    transmission: "Automatico",
    bodyType: "Berlina",
    color: "Bianco",
    price: "21990",
    vatIncluded: "Sì",
    licensePlate: "AB123CD",
    vin: "WVWZZZ1KZLW000000",
    description: "Un usato in ottime condizioni, unico proprietario, tagliandi certificati e tutti gli optional disponibili.",
    listingStatus: "Bozza",
    doors: "5",
    seats: "5",
    horsepower: "150",
    engine: "1.5 TSI",
    co2: "120 g/km",
    emissionClass: "Euro 6",
    previousOwners: "1",
    warranty: "12 mesi",
    availability: "Immediata",
    province: "MI",
    city: "Milano",
  });
  const [activeTab, setActiveTab] = useState<Tab>("Dati principali");
  const [photos, setPhotos] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleChange = (field: keyof VehicleState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setVehicle({ ...vehicle, [field]: event.target.value });
    };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const fileNames = Array.from(files).map((file) => file.name);
    setPhotos((current) => [...current, ...fileNames]);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const files = event.dataTransfer.files;
    if (!files) return;
    const fileNames = Array.from(files).map((file) => file.name);
    setPhotos((current) => [...current, ...fileNames]);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen grid-cols-[280px_1fr] gap-6 px-4 py-6 lg:px-8">
        <aside className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Dealer Manager</p>
            <h2 className="mt-4 text-2xl font-semibold text-slate-900">Concessionaria</h2>
          </div>
          <nav className="space-y-2">
            {sidebarItems.map((item) => (
              <button
                key={item}
                type="button"
                className={`w-full rounded-3xl px-4 py-3 text-left text-sm font-medium transition ${
                  item === "Nuovo veicolo"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-10 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Riepilogo</p>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <StatRow label="Annunci" value="24" />
              <StatRow label="Lead" value="68" />
              <StatRow label="Clienti" value="136" />
            </dl>
          </div>
        </aside>

        <section className="space-y-6">
          <header className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Nuovo veicolo</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Scheda inserimento veicolo</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Inserisci tutti i dettagli e completa la scheda con immagini e dati rilevanti per la vendita.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                  Salva bozza
                </button>
                <button className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                  Pubblica veicolo
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Sezioni</h2>
                    <p className="mt-2 text-sm text-slate-600">Naviga per compilare le informazioni più velocemente.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`w-full rounded-3xl px-4 py-3 text-left text-sm font-semibold transition ${
                        activeTab === tab
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                {activeTab === "Dati principali" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Marca" value={vehicle.brand} onChange={handleChange("brand")} />
                      <Field label="Modello" value={vehicle.model} onChange={handleChange("model")} />
                      <Field label="Versione" value={vehicle.trim} onChange={handleChange("trim")} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Anno" type="number" value={vehicle.year} onChange={handleChange("year")} />
                      <LabelledInput
                        label="Mese immatricolazione"
                        value={`${vehicle.year}-${vehicle.registrationMonth}`}
                        type="month"
                        onChange={(event) => {
                          const [year, month] = event.target.value.split("-");
                          setVehicle({ ...vehicle, year, registrationMonth: month });
                        }}
                      />
                      <Field label="Chilometri" type="number" value={vehicle.mileage} onChange={handleChange("mileage")} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <SelectField label="Alimentazione" value={vehicle.fuelType} onChange={handleChange("fuelType")} options={["Benzina", "Diesel", "Ibrido", "Elettrico"]} />
                      <SelectField label="Cambio" value={vehicle.transmission} onChange={handleChange("transmission")} options={["Manuale", "Automatico", "Semi-automatico"]} />
                      <SelectField label="Carrozzeria" value={vehicle.bodyType} onChange={handleChange("bodyType")} options={["Berlina", "SUV", "Coupé", "Station Wagon"]} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Colore" value={vehicle.color} onChange={handleChange("color")} />
                      <Field label="Targa" value={vehicle.licensePlate} onChange={handleChange("licensePlate")} />
                      <Field label="Telaio/VIN" value={vehicle.vin} onChange={handleChange("vin")} />
                    </div>
                  </div>
                )}

                {activeTab === "Foto" && (
                  <div className="space-y-6">
                    <div
                      className={`rounded-[28px] border-2 border-dashed px-6 py-14 text-center transition ${
                        dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"
                      }`}
                      onDragEnter={() => setDragActive(true)}
                      onDragLeave={() => setDragActive(false)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-700">Drag & Drop</p>
                      <p className="mt-4 text-sm text-slate-600">Trascina qui le foto del veicolo oppure selezionale dal tuo dispositivo.</p>
                      <p className="mt-2 text-xs text-slate-500">Minimo 8 foto consigliate per massimizzare l’impatto dell’annuncio.</p>
                      <label className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
                        Seleziona foto
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">Copertina</p>
                        {photos.length > 0 ? (
                          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 h-40 rounded-3xl bg-slate-200" />
                            <p className="text-sm font-semibold text-slate-900">{photos[0]}</p>
                            <p className="mt-1 text-xs text-slate-500">Questa foto sarà mostrata come immagine principale.</p>
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">Carica almeno una foto per impostare la copertina.</p>
                        )}
                      </div>
                      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">Foto selezionate</p>
                        {photos.length > 0 ? (
                          <ul className="mt-4 space-y-3">
                            {photos.map((photo, index) => (
                              <li key={`${photo}-${index}`} className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <span>{photo}</span>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                                  {index === 0 ? "Copertina" : `#${index + 1}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">Nessuna foto caricata.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "Caratteristiche" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Porte" type="number" value={vehicle.doors} onChange={handleChange("doors")} />
                      <Field label="Posti" type="number" value={vehicle.seats} onChange={handleChange("seats")} />
                      <Field label="Potenza CV" type="number" value={vehicle.horsepower} onChange={handleChange("horsepower")} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Cilindrata" value={vehicle.engine} onChange={handleChange("engine")} />
                      <Field label="Emissioni CO2" value={vehicle.co2} onChange={handleChange("co2")} />
                      <Field label="Classe emissioni" value={vehicle.emissionClass} onChange={handleChange("emissionClass")} />
                    </div>
                  </div>
                )}

                {activeTab === "Optional" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Field label="Proprietari precedenti" type="number" value={vehicle.previousOwners} onChange={handleChange("previousOwners")} />
                      <SelectField label="Garanzia" value={vehicle.warranty} onChange={handleChange("warranty")} options={["12 mesi", "24 mesi", "Garanzia concessionaria"]} />
                      <SelectField label="Disponibilità" value={vehicle.availability} onChange={handleChange("availability")} options={["Immediata", "Entro 7 giorni", "Su richiesta"]} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="Provincia" value={vehicle.province} onChange={handleChange("province")} />
                      <Field label="Città" value={vehicle.city} onChange={handleChange("city")} />
                    </div>
                  </div>
                )}

                {activeTab === "Prezzo" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="Prezzo" type="number" value={vehicle.price} onChange={handleChange("price")} />
                      <SelectField label="IVA esposta" value={vehicle.vatIncluded} onChange={handleChange("vatIncluded")} options={["Sì", "No"]} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Field label="Targa" value={vehicle.licensePlate} onChange={handleChange("licensePlate")} />
                      <Field label="Telaio/VIN" value={vehicle.vin} onChange={handleChange("vin")} />
                    </div>
                  </div>
                )}

                {activeTab === "Pubblicazione" && (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-700">Stato annuncio</p>
                        <div className="flex flex-wrap gap-3">
                          {(["Bozza", "Pubblicato"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setVehicle({ ...vehicle, listingStatus: status })}
                              className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                                vehicle.listingStatus === status
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="descriptionPub" className="mb-2 block text-sm font-medium text-slate-700">
                          Descrizione annuncio
                        </label>
                        <textarea
                          id="descriptionPub"
                          rows={5}
                          value={vehicle.description}
                          onChange={handleChange("description")}
                          className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "Anteprima" && (
                  <div className="space-y-6">
                    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
                      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{vehicle.listingStatus}</p>
                          <h3 className="mt-3 text-3xl font-semibold text-slate-900">{vehicle.brand} {vehicle.model} {vehicle.trim}</h3>
                          <p className="mt-2 text-sm text-slate-600">{vehicle.year} • {vehicle.bodyType} • {vehicle.transmission} • {vehicle.fuelType}</p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <PreviewStat label="Chilometri" value={`${vehicle.mileage} km`} />
                            <PreviewStat label="Potenza" value={`${vehicle.horsepower} CV`} />
                            <PreviewStat label="Emissioni" value={vehicle.co2} />
                          </div>
                        </div>
                        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center">
                          <p className="text-sm uppercase tracking-[0.26em] text-slate-500">Prezzo</p>
                          <p className="mt-4 text-4xl font-semibold text-slate-900">€{vehicle.price}</p>
                          <p className="mt-3 text-sm text-slate-600">IVA {vehicle.vatIncluded === "Sì" ? "esposta" : "non esposta"}</p>
                        </div>
                      </div>
                      <div className="mt-6 rounded-[28px] bg-white p-6">
                        <p className="text-sm font-semibold text-slate-900">Descrizione</p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{vehicle.description}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Stato veicolo</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <StatRow label="Status" value={vehicle.listingStatus} />
                  <StatRow label="Disponibilità" value={vehicle.availability} />
                  <StatRow label="Garanzia" value={vehicle.warranty} />
                </div>
              </div>
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Localizzazione</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <StatRow label="Provincia" value={vehicle.province} />
                  <StatRow label="Città" value={vehicle.city} />
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-sm text-slate-600 shadow-sm">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
