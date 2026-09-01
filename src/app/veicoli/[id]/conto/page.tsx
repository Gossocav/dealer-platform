import { VehicleEconomicsSheetPage } from "@/components/vehicles/vehicle-economics-sheet-page";

export default async function VehicleEconomicsSheetRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleEconomicsSheetPage vehicleId={id} />;
}
