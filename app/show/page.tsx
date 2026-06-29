import { requireAuth } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listPhotos, toSlideshowItems } from "@/lib/photos";
import { Slideshow } from "./Slideshow";

export const dynamic = "force-dynamic";

export default async function ShowPage() {
  await requireAuth("/show");
  const items = toSlideshowItems(await listPhotos(cfEnv()));
  return <Slideshow initial={items} />;
}
