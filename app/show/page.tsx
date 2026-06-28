import { requireAuth } from "@/lib/auth";
import { logout } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function ShowPage() {
  await requireAuth("/show");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Diashow</h1>
      <p className="text-xl text-zinc-600 dark:text-zinc-300">
        Die Diashow folgt in einem späteren Schritt.
      </p>
      <form action={logout}>
        <button type="submit" className="text-base text-zinc-500 underline">
          Abmelden
        </button>
      </form>
    </main>
  );
}
