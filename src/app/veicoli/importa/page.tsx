"use client";

import { useEffect, useRef } from "react";
import { VehiclesImportPage } from "@/components/vehicles/vehicles-import-page";

export default function VehiclesImportRoutePage() {
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) {
      return;
    }

    const errorSignals = ["Il feed è valido ma non contiene dati di veicoli.", "Errore durante analisi feed.", "Errore durante l'analisi del feed"];

    const syncFeedAnalysisUi = () => {
      const hasFeedError = Array.from(root.querySelectorAll("p, div, span")).some((element) => {
        const text = element.textContent?.trim() ?? "";
        return errorSignals.some((signal) => text.includes(signal));
      });

      const analysisSections = Array.from(root.querySelectorAll("section")).filter((section) => {
        return (section.textContent ?? "").includes("Analisi feed");
      }) as HTMLElement[];

      const importButton = Array.from(root.querySelectorAll("button")).find((button) => {
        return (button.textContent ?? "").includes("Importa Stock");
      }) as HTMLButtonElement | undefined;

      analysisSections.forEach((section) => {
        if (hasFeedError) {
          section.style.display = "none";
        } else {
          section.style.removeProperty("display");
        }
      });

      if (importButton) {
        if (hasFeedError) {
          importButton.setAttribute("aria-disabled", "true");
          importButton.style.pointerEvents = "none";
          importButton.style.opacity = "0.6";
        } else {
          importButton.removeAttribute("aria-disabled");
          importButton.style.removeProperty("pointer-events");
          importButton.style.removeProperty("opacity");
        }
      }
    };

    syncFeedAnalysisUi();

    const observer = new MutationObserver(() => {
      syncFeedAnalysisUi();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={pageRef}>
      <VehiclesImportPage />
    </div>
  );
}
