import { cookies } from "next/headers";
import { cfEnv } from "@/lib/server";
import { verifyUploadCookie, verifyHumanCookie } from "@/lib/tokens";
import { turnstileEnabled } from "@/lib/turnstile";
import { UploadForm } from "./UploadForm";
import { DeniedNotice } from "./DeniedNotice";
import { TurnstileGate } from "./TurnstileGate";
import { HelpButton } from "@/app/HelpButton";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const env = cfEnv();
  const jar = await cookies();

  let body = <UploadForm />;
  if (!(await verifyUploadCookie(jar.get("pa_upload")?.value, env.AUTH_SECRET))) {
    body = <DeniedNotice />;
  } else if (
    // When Turnstile is configured, require a one-time human check per session.
    turnstileEnabled(env.TURNSTILE_SECRET_KEY) &&
    env.TURNSTILE_SITE_KEY &&
    !(await verifyHumanCookie(jar.get("pa_human")?.value, env.AUTH_SECRET))
  ) {
    body = <TurnstileGate siteKey={env.TURNSTILE_SITE_KEY} />;
  }

  // The help button is on every state of this page — including the denied one,
  // where "my link doesn't work" is exactly the report we want to receive.
  return (
    <>
      {body}
      <HelpButton />
    </>
  );
}
