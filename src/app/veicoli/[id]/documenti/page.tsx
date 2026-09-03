import { ArchivioDocumentiPage } from "@/components/documenti/archivio-documenti-page";

export default async function DocumentiVetturaRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArchivioDocumentiPage vehicleId={id} />;
}
