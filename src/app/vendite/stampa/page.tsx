import { Suspense } from "react";
import { SalesReportPrintPage } from "@/components/dashboard/sales-report-print-page";

export default function VenditeStampaRoutePage() {
  // L'anno si legge dall'indirizzo: senza involucro la compilazione statica
  // si ferma su useSearchParams.
  return (
    <Suspense fallback={null}>
      <SalesReportPrintPage />
    </Suspense>
  );
}
