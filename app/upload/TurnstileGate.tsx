"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; action?: string; callback: (token: string) => void },
  ) => string;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// One-time human check before the upload form. On success our Worker verifies
// the token and sets the "human" cookie, then we refresh to reveal the form.
export function TurnstileGate({ siteKey }: { siteKey: string }) {
  const router = useRouter();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    async function onToken(token: string) {
      setStatus("verifying");
      const body = new FormData();
      body.set("token", token);
      const res = await fetch("/api/upload/verify", { method: "POST", body });
      if (cancelled) return;
      if (res.ok) router.refresh();
      else setStatus("error");
    }

    function renderWidget() {
      if (cancelled || !widgetRef.current || !window.turnstile) return;
      window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        action: "upload",
        callback: onToken,
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      document.getElementById(SCRIPT_ID)?.addEventListener("load", renderWidget);
    }

    return () => {
      cancelled = true;
    };
  }, [siteKey, router]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Kurz bestätigen</h1>
      <p className="text-xl text-zinc-600 dark:text-zinc-300">
        Bitte bestätige, dass du kein Roboter bist.
      </p>
      <div ref={widgetRef} />
      {status === "verifying" && <p className="text-zinc-500">Wird geprüft …</p>}
      {status === "error" && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          Bestätigung fehlgeschlagen. Bitte lade die Seite neu.
        </p>
      )}
    </main>
  );
}
