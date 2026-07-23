"use client";

import { useMemo, useState } from "react";

type HeroBrandModelFieldsProps = {
  brands: string[];
  brandModelMap: Record<string, string[]>;
  allModels: string[];
};

export function HeroBrandModelFields({ brands, brandModelMap, allModels }: HeroBrandModelFieldsProps) {
  const [selectedBrand, setSelectedBrand] = useState("");

  const modelOptions = useMemo(
    () => (selectedBrand ? brandModelMap[selectedBrand] ?? [] : allModels),
    [selectedBrand, brandModelMap, allModels]
  );

  return (
    <>
      <label className="block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]">
        <span className="block text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">Marca</span>
        <select
          name="brand"
          value={selectedBrand}
          onChange={(event) => setSelectedBrand(event.target.value)}
          style={{ color: "#f8fafc", colorScheme: "dark" }}
          className="mt-0.5 w-full appearance-none bg-transparent text-sm font-semibold outline-none"
        >
          <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
            Qualsiasi marca
          </option>
          {brands.map((brand) => (
            <option key={brand} value={brand} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
              {brand}
            </option>
          ))}
        </select>
      </label>

      <label className="block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]">
        <span className="block text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">Modello</span>
        <select
          name="model"
          defaultValue=""
          style={{ color: "#f8fafc", colorScheme: "dark" }}
          className="mt-0.5 w-full appearance-none bg-transparent text-sm font-semibold outline-none"
        >
          <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
            Qualsiasi modello
          </option>
          {modelOptions.map((model) => (
            <option key={model} value={model} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
