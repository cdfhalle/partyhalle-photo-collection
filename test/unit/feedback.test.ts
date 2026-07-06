import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  cleanFeedbackMessage,
  cleanFeedbackName,
  cleanFeedbackEmail,
  looksLikeEmail,
  cleanFeedbackPage,
  createFeedback,
  listFeedback,
  countFeedback,
  countOpenFeedback,
  countFeedbackSince,
  setFeedbackResolved,
  deleteFeedback,
  MAX_FEEDBACK_MESSAGE,
} from "@/lib/feedback";

describe("cleanFeedbackMessage", () => {
  it("trims and keeps a normal message", () => {
    expect(cleanFeedbackMessage("  Hilfe!  ")).toBe("Hilfe!");
  });
  it("rejects empty and non-string input", () => {
    expect(cleanFeedbackMessage("   ")).toBeNull();
    expect(cleanFeedbackMessage(undefined)).toBeNull();
    expect(cleanFeedbackMessage(42)).toBeNull();
  });
  it("caps overlong messages", () => {
    const long = "x".repeat(MAX_FEEDBACK_MESSAGE + 100);
    expect(cleanFeedbackMessage(long)).toHaveLength(MAX_FEEDBACK_MESSAGE);
  });
});

describe("cleanFeedbackName", () => {
  it("trims, caps, and nulls empty input", () => {
    expect(cleanFeedbackName(" Anna ")).toBe("Anna");
    expect(cleanFeedbackName("")).toBeNull();
    expect(cleanFeedbackName(null)).toBeNull();
    expect(cleanFeedbackName("y".repeat(200))).toHaveLength(80);
  });
});

describe("cleanFeedbackEmail / looksLikeEmail", () => {
  it("trims, caps, and nulls empty input", () => {
    expect(cleanFeedbackEmail(" anna@gmx.de ")).toBe("anna@gmx.de");
    expect(cleanFeedbackEmail("")).toBeNull();
    expect(cleanFeedbackEmail(null)).toBeNull();
    expect(cleanFeedbackEmail("y".repeat(300))).toHaveLength(254);
  });
  it("keeps typo'd addresses as typed (a human can still read them)", () => {
    expect(cleanFeedbackEmail("anna(at)gmx.de")).toBe("anna(at)gmx.de");
  });
  it("looksLikeEmail gates mailto rendering", () => {
    expect(looksLikeEmail("anna@gmx.de")).toBe(true);
    expect(looksLikeEmail("anna(at)gmx.de")).toBe(false);
    expect(looksLikeEmail("anna@gmx")).toBe(false);
    expect(looksLikeEmail("an na@gmx.de")).toBe(false);
  });
});

describe("cleanFeedbackPage", () => {
  it("accepts internal paths only", () => {
    expect(cleanFeedbackPage("/upload")).toBe("/upload");
    expect(cleanFeedbackPage("//evil.example")).toBeNull();
    expect(cleanFeedbackPage("https://evil.example/x")).toBeNull();
    expect(cleanFeedbackPage("upload")).toBeNull();
    expect(cleanFeedbackPage(7)).toBeNull();
  });
});

describe("createFeedback / listFeedback / counts", () => {
  it("stores a report with its context", async () => {
    const id = await createFeedback(env, {
      message: "Der Upload hängt",
      name: "Anna",
      email: "anna@gmx.de",
      page: "/upload",
      userAgent: "TestBrowser/1.0",
      sessionId: "session-a",
    });
    expect(id).toBeTruthy();

    const rows = await listFeedback(env);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe("Der Upload hängt");
    expect(rows[0].name).toBe("Anna");
    expect(rows[0].email).toBe("anna@gmx.de");
    expect(rows[0].page).toBe("/upload");
    expect(rows[0].user_agent).toBe("TestBrowser/1.0");
    expect(rows[0].session_id).toBe("session-a");
    expect(rows[0].resolved_at).toBeNull();
  });

  it("allows a bare message (everything else null)", async () => {
    await createFeedback(env, { message: "SOS" });
    const [row] = await listFeedback(env);
    expect(row.name).toBeNull();
    expect(row.email).toBeNull();
    expect(row.page).toBeNull();
    expect(row.session_id).toBeNull();
  });

  it("lists open reports before resolved ones, newest first within each", async () => {
    const oldOpen = await createFeedback(env, { message: "old open" });
    await new Promise((r) => setTimeout(r, 2));
    const resolved = await createFeedback(env, { message: "resolved" });
    await new Promise((r) => setTimeout(r, 2));
    const newOpen = await createFeedback(env, { message: "new open" });
    await setFeedbackResolved(env, resolved, true);

    const rows = await listFeedback(env);
    expect(rows.map((r) => r.id)).toEqual([newOpen, oldOpen, resolved]);
  });

  it("counts totals, open reports, and reports in a window", async () => {
    const first = await createFeedback(env, { message: "a", sessionId: "s1" });
    await createFeedback(env, { message: "b", sessionId: "s1" });
    await createFeedback(env, { message: "c", sessionId: "s2" });
    await setFeedbackResolved(env, first, true);

    expect(await countFeedback(env)).toBe(3);
    expect(await countOpenFeedback(env)).toBe(2);
    expect(await countFeedbackSince(env, 0)).toBe(3);
    expect(await countFeedbackSince(env, 0, "s1")).toBe(2);
    expect(await countFeedbackSince(env, 0, "s2")).toBe(1);
    expect(await countFeedbackSince(env, Date.now() + 1000)).toBe(0);
  });
});

describe("setFeedbackResolved / deleteFeedback", () => {
  it("resolves and reopens a report", async () => {
    const id = await createFeedback(env, { message: "flaky" });

    expect(await setFeedbackResolved(env, id, true)).toBe(true);
    let [row] = await listFeedback(env);
    expect(row.resolved_at).toBeGreaterThan(0);

    expect(await setFeedbackResolved(env, id, false)).toBe(true);
    [row] = await listFeedback(env);
    expect(row.resolved_at).toBeNull();
  });

  it("returns false for unknown ids", async () => {
    expect(await setFeedbackResolved(env, "nope", true)).toBe(false);
    expect(await deleteFeedback(env, "nope")).toBe(false);
  });

  it("deletes a report", async () => {
    const id = await createFeedback(env, { message: "bye" });
    expect(await deleteFeedback(env, id)).toBe(true);
    expect(await countFeedback(env)).toBe(0);
  });
});
