import { cfEnv } from "@/lib/server";
import { QuizJoin } from "./QuizJoin";
import { HelpButton } from "@/app/HelpButton";

export const dynamic = "force-dynamic";

// Public player entry for the live quiz. No login — guests join with a PIN + a
// nickname. The PIN can be pre-filled from the QR link (?pin=1234).
export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  const { pin } = await searchParams;
  const gameHost = cfEnv().GAME_HOST;
  return (
    <>
      <QuizJoin gameHost={gameHost} initialPin={pin ?? ""} />
      <HelpButton />
    </>
  );
}
