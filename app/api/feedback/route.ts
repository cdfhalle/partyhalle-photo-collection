import { NextRequest, NextResponse } from "next/server";
import { cfEnv, cfCtx } from "@/lib/server";
import { verifySidCookie, SID_COOKIE } from "@/lib/tokens";
import {
  cleanFeedbackMessage,
  cleanFeedbackName,
  cleanFeedbackEmail,
  cleanFeedbackPage,
  countFeedback,
  countFeedbackSince,
  createFeedback,
} from "@/lib/feedback";
import { notifyFeedback } from "@/lib/ntfy";

export const dynamic = "force-dynamic";

// Deliberately NOT gated behind the upload capability cookie: the most likely
// help request is "my invite link doesn't work", i.e. exactly the guests who
// can't get that cookie. Abuse is bounded instead: text-only, length-capped,
// per-device and global rate limits, and a hard total cap.
const WINDOW_MS = 1000 * 60 * 10;
const PER_SESSION_LIMIT = 5; // per device (sid cookie) per window
const GLOBAL_LIMIT = 20; // across everyone per window (also bounds ntfy pings)
const TOTAL_CAP = 500;

export async function POST(req: NextRequest) {
  const env = cfEnv();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const message = cleanFeedbackMessage(body.message);
  if (!message) {
    return NextResponse.json({ error: "no_message" }, { status: 400 });
  }
  const name = cleanFeedbackName(body.name);
  const email = cleanFeedbackEmail(body.email);
  const page = cleanFeedbackPage(body.page);

  if ((await countFeedback(env)) >= TOTAL_CAP) {
    return NextResponse.json({ error: "full" }, { status: 429 });
  }
  const since = Date.now() - WINDOW_MS;
  if ((await countFeedbackSince(env, since)) >= GLOBAL_LIMIT) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const sid = await verifySidCookie(req.cookies.get(SID_COOKIE)?.value, env.AUTH_SECRET);
  if (sid && (await countFeedbackSince(env, since, sid)) >= PER_SESSION_LIMIT) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const id = await createFeedback(env, {
    message,
    name,
    email,
    page,
    userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    sessionId: sid,
  });

  // Ping the host's phone after the response is sent; failures are swallowed
  // inside notifyFeedback — the report is already stored either way.
  cfCtx().waitUntil(
    notifyFeedback(env.NTFY_URL, { message, name, email, page }, env.NTFY_TOKEN).then((ok) =>
      console.log(`[ntfy] published: ${ok}`),
    ),
  );

  return NextResponse.json({ id }, { status: 201 });
}
