import { VehicleDeliverySheetPage } from "@/components/vehicles/vehicle-delivery-sheet-page";

export default async function VehicleDeliverySheetRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleDeliverySheetPage vehicleId={id} />;
}
