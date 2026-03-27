import RoomClient from "@/src/components/RoomClient";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RoomClient id={id} />;
}
