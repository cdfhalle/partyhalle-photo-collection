import { cookies } from "next/headers";
import { cfEnv } from "@/lib/server";
import { verifyUploadCookie, verifyHumanCookie } from "@/lib/tokens";
import { turnstileEnabled } from "@/lib/turnstile";
import { UploadForm } from "./UploadForm";
import { DeniedNotice } from "./DeniedNotice";
import { TurnstileGate } from "./TurnstileGate";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const env = cfEnv();
  const jar = await cookies();

  if (!(await verifyUploadCookie(jar.get("pa_upload")?.value, env.AUTH_SECRET))) {
    return <DeniedNotice />;
  }

  // When Turnstile is configured, require a one-time human check per session.
  if (turnstileEnabled(env.TURNSTILE_SECRET_KEY) && env.TURNSTILE_SITE_KEY) {
    if (!(await verifyHumanCookie(jar.get("pa_human")?.value, env.AUTH_SECRET))) {
      return <TurnstileGate siteKey={env.TURNSTILE_SITE_KEY} />;
    }
  }

  return <UploadForm />;
}
