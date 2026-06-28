import { login } from "@/app/auth-actions";
import { safeNext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const hasError = params.error === "1";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Anmelden</h1>
      <form action={login} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="password" className="text-lg font-medium">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          className="min-h-14 rounded-xl border border-zinc-300 bg-white px-4 text-lg text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
        {hasError && (
          <p role="alert" className="text-base text-red-600 dark:text-red-400">
            Falsches Passwort.
          </p>
        )}
        <button
          type="submit"
          className="min-h-14 rounded-xl bg-zinc-900 px-6 text-lg font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Anmelden
        </button>
      </form>
    </main>
  );
}
