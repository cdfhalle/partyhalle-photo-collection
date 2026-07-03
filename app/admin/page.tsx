import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { deletePhotoAction } from "./actions";
import { DeleteButton } from "./DeleteButton";
import { cfEnv } from "@/lib/server";
import { listPhotos } from "@/lib/photos";
import { parsePeople } from "@/lib/metadata";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export default async function AdminPage() {
  await requireAuth("/admin");
  const photos = await listPhotos(cfEnv());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-300">
            {photos.length} {photos.length === 1 ? "Foto" : "Fotos"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/qr" className="text-base text-zinc-700 underline dark:text-zinc-200">
            QR-Code
          </Link>
          {photos.length > 0 && (
            <a
              href="/api/admin/download"
              className="min-h-12 rounded-xl bg-zinc-900 px-5 py-3 text-base font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Alle herunterladen (ZIP)
            </a>
          )}
          <form action={logout}>
            <button type="submit" className="text-base text-zinc-500 underline">
              Abmelden
            </button>
          </form>
        </div>
      </header>

      {photos.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-300">Noch keine Fotos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              <Link
                href={`/show?start=${photo.id}`}
                title="Präsentation ab hier starten"
                aria-label="Diashow ab diesem Foto starten"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photo/${photo.id}?w=400`}
                  alt={photo.comment ?? "Foto"}
                  className="aspect-square w-full object-cover"
                />
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-3">
                {photo.comment && <p className="text-base">{photo.comment}</p>}
                {(photo.taken_at || photo.location_name) && (
                  <p className="text-sm text-zinc-500">
                    {[
                      photo.taken_at ? dateFmt.format(photo.taken_at) : null,
                      photo.location_name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {(() => {
                  const people = parsePeople(photo.people);
                  return people.length ? (
                    <p className="text-sm text-zinc-500">
                      👤 {people.map((p) => p.name).join(", ")}
                    </p>
                  ) : null;
                })()}
                {photo.uploader_name && (
                  <p className="text-sm text-zinc-500">von {photo.uploader_name}</p>
                )}
                <form action={deletePhotoAction} className="mt-3">
                  <input type="hidden" name="id" value={photo.id} />
                  <DeleteButton />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
