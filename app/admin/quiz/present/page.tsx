import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { listEnabledQuestions } from "@/lib/quiz";
import { makeHostToken } from "@/lib/tokens";
import { DEFAULT_TIME_LIMIT_SECS, DEFAULT_POINTS } from "@/lib/gameScoring";
import { randomPin } from "@/lib/pin";
import type { LoadedQuestion } from "@/lib/gameTypes";
import { Presenter } from "./Presenter";

export const dynamic = "force-dynamic";

const HOST_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

export default async function PresentPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  await requireAuth("/admin/quiz/present");
  const { pin } = await searchParams;

  // Keep the PIN in the URL so a host refresh rejoins the same room.
  if (!pin) {
    redirect(`/admin/quiz/present?pin=${randomPin()}`);
  }

  const env = cfEnv();
  const questions = await listEnabledQuestions(env);
  const loaded: LoadedQuestion[] = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    timeLimitSecs: q.timeLimitSecs ?? DEFAULT_TIME_LIMIT_SECS,
    points: q.points ?? DEFAULT_POINTS,
  }));

  const hostToken = await makeHostToken(pin!, env.AUTH_SECRET, HOST_TTL_MS);

  return (
    <Presenter
      gameHost={env.GAME_HOST}
      pin={pin!}
      hostToken={hostToken}
      questions={loaded}
    />
  );
}
