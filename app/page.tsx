import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">PartyHalle</h1>
      <p className="text-xl leading-relaxed text-zinc-600 dark:text-zinc-300">
        Willkommen! Fotos lädst du über den QR-Code oder den Link aus deiner
        Einladung hoch.
      </p>
      <p className="text-base text-zinc-500">
        <Link href="/login" className="underline">
          Anmelden
        </Link>{" "}
        (für die Organisation)
      </p>
    </main>
  );
}
