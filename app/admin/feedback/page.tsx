import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listFeedback, looksLikeEmail } from "@/lib/feedback";
import { setFeedbackResolvedAction, deleteFeedbackAction } from "./actions";
import { FeedbackDeleteButton } from "./FeedbackDeleteButton";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminFeedbackPage() {
  await requireAuth("/admin/feedback");
  const reports = await listFeedback(cfEnv());
  const openCount = reports.filter((r) => r.resolved_at === null).length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Feedback</h1>
          <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-300">
            {openCount === 0 ? "Nichts offen" : `${openCount} offen`} · {reports.length} gesamt
          </p>
        </div>
        <Link href="/admin" className="text-base underline">
          Zurück zum Admin
        </Link>
      </header>

      {reports.length === 0 ? (
        <p className="text-lg text-zinc-600 dark:text-zinc-300">
          Noch keine Hilfe-Anfragen — sehr gut.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((report) => {
            const resolved = report.resolved_at !== null;
            return (
              <li
                key={report.id}
                className={`flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 ${
                  resolved ? "opacity-60" : ""
                }`}
              >
                <p className="text-base whitespace-pre-wrap">{report.message}</p>
                <p className="text-sm text-zinc-500">
                  {[
                    report.name ? `von ${report.name}` : "anonym",
                    report.page,
                    dateFmt.format(report.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {report.email && (
                  <p className="text-sm text-zinc-500">
                    {/* mailto only for plausible addresses; typos still show as text. */}
                    {looksLikeEmail(report.email) ? (
                      <a href={`mailto:${report.email}`} className="underline">
                        {report.email}
                      </a>
                    ) : (
                      report.email
                    )}
                  </p>
                )}
                {report.user_agent && (
                  <p className="text-xs break-all text-zinc-400 dark:text-zinc-500">
                    {report.user_agent}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-4">
                  <form action={setFeedbackResolvedAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <input type="hidden" name="resolved" value={resolved ? "0" : "1"} />
                    <button
                      type="submit"
                      className="text-sm font-medium text-zinc-700 underline dark:text-zinc-200"
                    >
                      {resolved ? "Wieder öffnen" : "Erledigt"}
                    </button>
                  </form>
                  <form action={deleteFeedbackAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <FeedbackDeleteButton />
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
