import { requireAuth } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listPhotos, toSlideshowItems } from "@/lib/photos";
import { Slideshow } from "./Slideshow";

export const dynamic = "force-dynamic";

export default async function ShowPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  await requireAuth("/show");
  const items = toSlideshowItems(await listPhotos(cfEnv()));
  const { start } = await searchParams;
  return <Slideshow initial={items} startId={start} />;
}
