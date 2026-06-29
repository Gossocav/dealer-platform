import { VehicleEditorPage } from "@/components/vehicles/vehicle-editor-page";

export default async function EditVehicleRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleEditorPage mode="edit" vehicleId={id} />;
}
