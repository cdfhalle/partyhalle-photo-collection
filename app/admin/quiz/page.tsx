import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listPhotos } from "@/lib/photos";
import { listQuestions, listEnabledQuestions } from "@/lib/quiz";
import { parsePeople } from "@/lib/metadata";
import { QuestionEditor, type PhotoOption } from "./QuestionEditor";
import {
  createQuestionAction,
  updateQuestionAction,
  deleteQuestionAction,
  toggleEnabledAction,
  moveQuestionAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function QuizAdminPage() {
  await requireAuth("/admin/quiz");
  const env = cfEnv();
  const [photos, questions, enabled] = await Promise.all([
    listPhotos(env),
    listQuestions(env),
    listEnabledQuestions(env),
  ]);

  const photoOptions: PhotoOption[] = photos.map((p) => ({
    id: p.id,
    comment: p.comment,
    takenAt: p.taken_at,
    locationName: p.location_name,
    people: parsePeople(p.people).map((x) => x.name),
    uploader: p.uploader_name,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Quiz</h1>
          <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-300">
            {questions.length} {questions.length === 1 ? "Frage" : "Fragen"} · {enabled.length} aktiv
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-base text-zinc-700 underline dark:text-zinc-200">
            ← Admin
          </Link>
          <Link
            href="/admin/quiz/present"
            className="min-h-12 rounded-xl bg-pink-600 px-5 py-3 text-base font-semibold text-white hover:bg-pink-700"
          >
            Spiel starten ▶
          </Link>
        </div>
      </header>

      {/* Existing questions */}
      {questions.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-300">
          Noch keine Fragen. Erstelle unten deine erste Quizfrage.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {questions.map((q, idx) => (
            <li
              key={q.id}
              className={`flex flex-col gap-3 rounded-xl border p-4 ${
                q.enabled
                  ? "border-zinc-200 dark:border-zinc-800"
                  : "border-dashed border-zinc-300 opacity-60 dark:border-zinc-700"
              }`}
            >
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photo/${q.photoId}?w=200`}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-lg font-medium">
                    {idx + 1}. {q.prompt}
                  </p>
                  <ul className="flex flex-wrap gap-1.5 text-sm">
                    {q.options.map((o, i) => (
                      <li
                        key={i}
                        className={`rounded-full px-2 py-0.5 ${
                          i === q.correctIndex
                            ? "bg-green-100 font-semibold text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-zinc-100 dark:bg-zinc-800"
                        }`}
                      >
                        {i === q.correctIndex ? "✓ " : ""}
                        {o}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-zinc-500">
                    {q.timeLimitSecs ? `${q.timeLimitSecs}s` : "Standardzeit"} ·{" "}
                    {q.points ? `${q.points} Pkt` : "Standardpunkte"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <form action={moveQuestionAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button type="submit" disabled={idx === 0} className="rounded-md px-2 py-1 underline disabled:opacity-40">
                    ↑
                  </button>
                </form>
                <form action={moveQuestionAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button
                    type="submit"
                    disabled={idx === questions.length - 1}
                    className="rounded-md px-2 py-1 underline disabled:opacity-40"
                  >
                    ↓
                  </button>
                </form>
                <form action={toggleEnabledAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="enabled" value={q.enabled ? "0" : "1"} />
                  <button type="submit" className="rounded-md px-2 py-1 underline">
                    {q.enabled ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </form>
                <form action={deleteQuestionAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <button type="submit" className="rounded-md px-2 py-1 text-red-600 underline">
                    Löschen
                  </button>
                </form>
                <details className="w-full">
                  <summary className="cursor-pointer px-2 py-1 underline">Bearbeiten</summary>
                  <div className="mt-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50">
                    <QuestionEditor
                      photos={photoOptions}
                      action={updateQuestionAction}
                      submitLabel="Änderungen speichern"
                      initial={{
                        id: q.id,
                        photoId: q.photoId,
                        prompt: q.prompt,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        timeLimitSecs: q.timeLimitSecs,
                        points: q.points,
                      }}
                    />
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Add a new question */}
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-2xl font-semibold">Neue Frage</h2>
        <QuestionEditor
          photos={photoOptions}
          action={createQuestionAction}
          submitLabel="Frage hinzufügen"
        />
      </section>
    </main>
  );
}
