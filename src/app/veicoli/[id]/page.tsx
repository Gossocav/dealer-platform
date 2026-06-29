import { VehicleDetailPage } from "@/components/vehicles/vehicle-detail-page";

export default async function VehicleDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleDetailPage vehicleId={id} />;
}
