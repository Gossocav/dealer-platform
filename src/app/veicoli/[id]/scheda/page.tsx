import { VehicleSheetPage } from "@/components/vehicles/vehicle-sheet-page";

export default async function VehicleSheetRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleSheetPage vehicleId={id} />;
}
