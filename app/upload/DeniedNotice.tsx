export function DeniedNotice() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Kein Zugang</h1>
      <p className="text-xl leading-relaxed text-zinc-600 dark:text-zinc-300">
        Bitte öffne diese Seite über den QR-Code oder den Link aus deiner
        Einladung. Nur darüber kannst du Fotos hochladen.
      </p>
    </main>
  );
}
