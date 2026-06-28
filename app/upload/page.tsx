import { cookies } from "next/headers";
import { cfEnv } from "@/lib/server";
import { verifyUploadCookie } from "@/lib/tokens";
import { UploadForm } from "./UploadForm";
import { DeniedNotice } from "./DeniedNotice";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const env = cfEnv();
  const cookie = (await cookies()).get("pa_upload")?.value;
  const authorized = await verifyUploadCookie(cookie, env.AUTH_SECRET);

  return authorized ? <UploadForm /> : <DeniedNotice />;
}
