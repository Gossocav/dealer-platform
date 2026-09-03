import { PeriziaPage } from "@/components/perizie/perizia-page";

export default async function PeriziaRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PeriziaPage periziaId={id} />;
}
