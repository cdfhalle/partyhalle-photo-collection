import { requireAuth } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { cfEnv } from "@/lib/server";
import { countPhotos } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAuth("/admin");
  const count = await countPhotos(cfEnv());

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <p className="text-xl text-zinc-700 dark:text-zinc-200">
        {count} {count === 1 ? "Foto" : "Fotos"} hochgeladen.
      </p>
      <p className="text-lg text-zinc-600 dark:text-zinc-300">
        Galerie und Download folgen in einem späteren Schritt.
      </p>
      <form action={logout}>
        <button type="submit" className="text-base text-zinc-500 underline">
          Abmelden
        </button>
      </form>
    </main>
  );
}
