"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cfEnv } from "@/lib/server";
import { tokenMatches, makeSessionCookie } from "@/lib/tokens";
import { SESSION_COOKIE, SESSION_TTL_MS, safeNext } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next") as string | null);
  const env = cfEnv();

  if (!tokenMatches(password, env.APP_PASSWORD)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const cookie = await makeSessionCookie(env.AUTH_SECRET, SESSION_TTL_MS);
  (await cookies()).set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
