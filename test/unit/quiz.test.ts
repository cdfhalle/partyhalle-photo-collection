import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  validateQuestion,
  sanitizeOptions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  setQuestionEnabled,
  moveQuestion,
  listQuestions,
  listEnabledQuestions,
  getQuestion,
} from "@/lib/quiz";

const base = {
  photoId: "photo-1",
  prompt: "Where?",
  options: ["Berlin", "Hamburg", "Munich"],
  correctIndex: 0,
};

describe("validateQuestion / sanitizeOptions", () => {
  it("drops blank options and caps length", () => {
    expect(sanitizeOptions(["a", "  ", "b", ""])).toEqual(["a", "b"]);
    expect(sanitizeOptions("nope")).toEqual([]);
  });
  it("accepts a valid question", () => {
    const r = validateQuestion(base);
    expect(r.ok).toBe(true);
  });
  it("rejects missing photo/prompt/options and bad correct index", () => {
    expect(validateQuestion({ ...base, photoId: "" }).ok).toBe(false);
    expect(validateQuestion({ ...base, prompt: "  " }).ok).toBe(false);
    expect(validateQuestion({ ...base, options: ["only"] }).ok).toBe(false);
    expect(validateQuestion({ ...base, correctIndex: 9 }).ok).toBe(false);
  });
  it("clamps time limit and points into range", () => {
    const r = validateQuestion({ ...base, timeLimitSecs: 999, points: 1 });
    expect(r.ok && r.value.timeLimitSecs).toBe(120);
    expect(r.ok && r.value.points).toBe(100);
  });
});

describe("createQuestion / list / update / delete", () => {
  it("creates questions with increasing positions and reads them back", async () => {
    const a = await createQuestion(env, base);
    const b = await createQuestion(env, { ...base, prompt: "Who?" });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    const all = await listQuestions(env);
    expect(all.map((q) => q.prompt)).toEqual(["Where?", "Who?"]);
    expect(all[0].position).toBeLessThan(all[1].position);
    expect(all[0].options).toEqual(base.options);
    expect(all[0].enabled).toBe(true);
  });

  it("rejects invalid input", async () => {
    expect(await createQuestion(env, { ...base, options: [] })).toBeNull();
  });

  it("updates content", async () => {
    const id = (await createQuestion(env, base))!;
    const ok = await updateQuestion(env, id, { ...base, prompt: "Edited", correctIndex: 1 });
    expect(ok).toBe(true);
    const q = await getQuestion(env, id);
    expect(q?.prompt).toBe("Edited");
    expect(q?.correctIndex).toBe(1);
  });

  it("toggles enabled and filters the game list", async () => {
    const id = (await createQuestion(env, base))!;
    await setQuestionEnabled(env, id, false);
    expect((await getQuestion(env, id))?.enabled).toBe(false);
    expect(await listEnabledQuestions(env)).toHaveLength(0);
  });

  it("deletes", async () => {
    const id = (await createQuestion(env, base))!;
    await deleteQuestion(env, id);
    expect(await getQuestion(env, id)).toBeNull();
  });
});

describe("moveQuestion", () => {
  it("swaps order with the neighbour", async () => {
    const a = (await createQuestion(env, { ...base, prompt: "A" }))!;
    await createQuestion(env, { ...base, prompt: "B" });
    await moveQuestion(env, a, "down");
    const order = (await listQuestions(env)).map((q) => q.prompt);
    expect(order).toEqual(["B", "A"]);
  });
});
