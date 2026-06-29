export type VehicleStatus = "published" | "draft" | "sold" | "review";

export type FuelType = "Benzina" | "Diesel" | "Ibrida" | "Elettrica";
export type TransmissionType = "Manuale" | "Automatico";

export type VehicleInventoryItem = {
  id: string;
  mainImage: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  price: number;
  status: VehicleStatus;
  badge: string;
  fuel: FuelType;
  transmission: TransmissionType;
  leads: number;
  views: number;
  insertedAt: string;
};

export type VehicleFilters = {
  query: string;
  brand: string;
  model: string;
  fuel: string;
  transmission: string;
  status: string;
  priceBand: string;
};

export type VehicleKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
};

export const vehiclesInventoryMock: VehicleInventoryItem[] = [
  {
    id: "vh-001",
    mainImage: "https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&w=1200&q=80",
    brand: "Audi",
    model: "A4",
    version: "Avant 40 TDI S tronic",
    year: 2022,
    price: 36900,
    status: "published",
    badge: "Top Seller",
    fuel: "Diesel",
    transmission: "Automatico",
    leads: 12,
    views: 450,
    insertedAt: "2026-06-20",
  },
  {
    id: "vh-002",
    mainImage: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=80",
    brand: "BMW",
    model: "X1",
    version: "sDrive18i Business",
    year: 2023,
    price: 38900,
    status: "published",
    badge: "Nuovo Arrivo",
    fuel: "Benzina",
    transmission: "Automatico",
    leads: 8,
    views: 330,
    insertedAt: "2026-06-24",
  },
  {
    id: "vh-003",
    mainImage: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=1200&q=80",
    brand: "Mercedes",
    model: "GLA",
    version: "200 d Progressive",
    year: 2021,
    price: 32900,
    status: "sold",
    badge: "Venduta",
    fuel: "Diesel",
    transmission: "Automatico",
    leads: 16,
    views: 610,
    insertedAt: "2026-05-30",
  },
  {
    id: "vh-004",
    mainImage: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80",
    brand: "Volkswagen",
    model: "Golf",
    version: "1.5 eTSI Style",
    year: 2022,
    price: 27900,
    status: "draft",
    badge: "Bozza",
    fuel: "Ibrida",
    transmission: "Automatico",
    leads: 2,
    views: 98,
    insertedAt: "2026-06-26",
  },
  {
    id: "vh-005",
    mainImage: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
    brand: "Toyota",
    model: "C-HR",
    version: "2.0 Hybrid Lounge",
    year: 2024,
    price: 34900,
    status: "published",
    badge: "Ibrida",
    fuel: "Ibrida",
    transmission: "Automatico",
    leads: 11,
    views: 402,
    insertedAt: "2026-06-18",
  },
  {
    id: "vh-006",
    mainImage: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=1200&q=80",
    brand: "Tesla",
    model: "Model 3",
    version: "Long Range AWD",
    year: 2023,
    price: 44900,
    status: "published",
    badge: "Elettrica",
    fuel: "Elettrica",
    transmission: "Automatico",
    leads: 14,
    views: 520,
    insertedAt: "2026-06-15",
  },
  {
    id: "vh-007",
    mainImage: "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=1200&q=80",
    brand: "Ford",
    model: "Kuga",
    version: "2.5 Plug-In Hybrid ST-Line",
    year: 2021,
    price: 25900,
    status: "review",
    badge: "In Revisione",
    fuel: "Ibrida",
    transmission: "Automatico",
    leads: 5,
    views: 180,
    insertedAt: "2026-06-22",
  },
  {
    id: "vh-008",
    mainImage: "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=80",
    brand: "Jeep",
    model: "Compass",
    version: "1.3 Turbo Limited",
    year: 2022,
    price: 29900,
    status: "published",
    badge: "SUV",
    fuel: "Benzina",
    transmission: "Automatico",
    leads: 7,
    views: 240,
    insertedAt: "2026-06-12",
  },
  {
    id: "vh-009",
    mainImage: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80",
    brand: "Mini",
    model: "Countryman",
    version: "Cooper S ALL4",
    year: 2020,
    price: 23900,
    status: "sold",
    badge: "Venduta",
    fuel: "Benzina",
    transmission: "Automatico",
    leads: 10,
    views: 350,
    insertedAt: "2026-05-28",
  },
  {
    id: "vh-010",
    mainImage: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80",
    brand: "Peugeot",
    model: "3008",
    version: "1.5 BlueHDi GT",
    year: 2021,
    price: 26900,
    status: "draft",
    badge: "Aggiornare foto",
    fuel: "Diesel",
    transmission: "Automatico",
    leads: 1,
    views: 66,
    insertedAt: "2026-06-27",
  },
  {
    id: "vh-011",
    mainImage: "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=1200&q=80",
    brand: "Volvo",
    model: "XC40",
    version: "B4 Mild Hybrid Plus",
    year: 2024,
    price: 41900,
    status: "published",
    badge: "Premium",
    fuel: "Ibrida",
    transmission: "Automatico",
    leads: 9,
    views: 310,
    insertedAt: "2026-06-16",
  },
  {
    id: "vh-012",
    mainImage: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=80",
    brand: "Renault",
    model: "Clio",
    version: "TCe 90 Evolution",
    year: 2023,
    price: 18900,
    status: "published",
    badge: "City Car",
    fuel: "Benzina",
    transmission: "Manuale",
    leads: 6,
    views: 205,
    insertedAt: "2026-06-14",
  },
];

export const defaultVehicleFilters: VehicleFilters = {
  query: "",
  brand: "all",
  model: "all",
  fuel: "all",
  transmission: "all",
  status: "all",
  priceBand: "all",
};

export const priceBandOptions = [
  { value: "all", label: "Tutti i prezzi" },
  { value: "0-20000", label: "Fino a EUR 20.000" },
  { value: "20001-30000", label: "EUR 20.001 - EUR 30.000" },
  { value: "30001-40000", label: "EUR 30.001 - EUR 40.000" },
  { value: "40001-plus", label: "Oltre EUR 40.000" },
] as const;

export const statusOptions = [
  { value: "all", label: "Tutti gli stati" },
  { value: "published", label: "Pubblicato" },
  { value: "draft", label: "Bozza" },
  { value: "sold", label: "Venduto" },
  { value: "review", label: "In revisione" },
] as const;

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatVehicleStatus(status: VehicleStatus): string {
  if (status === "published") return "Pubblicato";
  if (status === "draft") return "Bozza";
  if (status === "sold") return "Venduto";
  return "In revisione";
}

function inPriceBand(price: number, band: string): boolean {
  if (band === "all") return true;
  if (band === "0-20000") return price <= 20000;
  if (band === "20001-30000") return price >= 20001 && price <= 30000;
  if (band === "30001-40000") return price >= 30001 && price <= 40000;
  return price >= 40001;
}

export function filterVehicles(list: VehicleInventoryItem[], filters: VehicleFilters): VehicleInventoryItem[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return list.filter((vehicle) => {
    const searchable = `${vehicle.brand} ${vehicle.model} ${vehicle.version}`.toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesBrand = filters.brand === "all" || vehicle.brand === filters.brand;
    const matchesModel = filters.model === "all" || vehicle.model === filters.model;
    const matchesFuel = filters.fuel === "all" || vehicle.fuel === filters.fuel;
    const matchesTransmission = filters.transmission === "all" || vehicle.transmission === filters.transmission;
    const matchesStatus = filters.status === "all" || vehicle.status === filters.status;
    const matchesPriceBand = inPriceBand(vehicle.price, filters.priceBand);

    return matchesQuery && matchesBrand && matchesModel && matchesFuel && matchesTransmission && matchesStatus && matchesPriceBand;
  });
}

export function vehicleOptionSets(list: VehicleInventoryItem[]) {
  const brands = Array.from(new Set(list.map((item) => item.brand))).sort();
  const models = Array.from(new Set(list.map((item) => item.model))).sort();
  const fuelTypes = Array.from(new Set(list.map((item) => item.fuel))).sort();
  const transmissionTypes = Array.from(new Set(list.map((item) => item.transmission))).sort();

  return {
    brands,
    models,
    fuelTypes,
    transmissionTypes,
  };
}

export function vehicleKpis(list: VehicleInventoryItem[]): VehicleKpi[] {
  const published = list.filter((item) => item.status === "published").length;
  const drafts = list.filter((item) => item.status === "draft").length;
  const sold = list.filter((item) => item.status === "sold").length;
  const leads = list.reduce((sum, item) => sum + item.leads, 0);

  return [
    { id: "published", label: "Veicoli pubblicati", value: String(published), delta: "+6% mese" },
    { id: "drafts", label: "Bozze", value: String(drafts), delta: "Da completare" },
    { id: "sold", label: "Venduti", value: String(sold), delta: "+2 questa settimana" },
    { id: "leads", label: "Lead ricevuti", value: String(leads), delta: "Totale portfolio" },
  ];
}
