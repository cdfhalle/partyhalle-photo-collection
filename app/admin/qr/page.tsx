import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { requireAuth } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { uploadEntryUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export default async function QrPage() {
  await requireAuth("/admin/qr");

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = uploadEntryUrl(`${proto}://${host}`, cfEnv().UPLOAD_TOKEN);
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Upload-QR-Code</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-300">
        Diesen Code an die Gäste austeilen — Scannen öffnet die Upload-Seite.
      </p>
      <div
        className="rounded-2xl bg-white p-4"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="break-all text-sm text-zinc-500">{url}</p>
      <Link href="/admin" className="text-base underline">
        Zurück zum Admin
      </Link>
    </main>
  );
}
