// Admin-authored multiple-choice quiz questions. Pure validation helpers are
// exported separately so they stay unit-testable without a DB.

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_PROMPT = 200;
export const MAX_OPTION_LEN = 120;

export interface QuizQuestionRow {
  id: string;
  photo_id: string;
  prompt: string;
  options: string; // JSON array of strings
  correct_index: number;
  position: number;
  time_limit_secs: number | null;
  points: number | null;
  enabled: number; // 0 | 1
  created_at: number;
}

export interface QuizQuestion {
  id: string;
  photoId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  position: number;
  timeLimitSecs: number | null;
  points: number | null;
  enabled: boolean;
  createdAt: number;
}

export interface QuestionInput {
  photoId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  timeLimitSecs?: number | null;
  points?: number | null;
}

/** Trim options, drop blanks, cap length + count. */
export function sanitizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const o of raw) {
    if (typeof o !== "string") continue;
    const t = o.trim().slice(0, MAX_OPTION_LEN);
    if (t) out.push(t);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

export type ValidationResult =
  | { ok: true; value: Required<Omit<QuestionInput, "timeLimitSecs" | "points">> & {
      timeLimitSecs: number | null;
      points: number | null;
    } }
  | { ok: false; error: string };

/** Validate a question before create/update. Never trusts caller input. */
export function validateQuestion(input: QuestionInput): ValidationResult {
  const photoId = String(input.photoId ?? "").trim();
  if (!photoId) return { ok: false, error: "photo_required" };

  const prompt = String(input.prompt ?? "").trim().slice(0, MAX_PROMPT);
  if (!prompt) return { ok: false, error: "prompt_required" };

  const options = sanitizeOptions(input.options);
  if (options.length < MIN_OPTIONS) return { ok: false, error: "need_options" };

  const correctIndex = Number(input.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return { ok: false, error: "bad_correct" };
  }

  const timeLimitSecs = normPositiveInt(input.timeLimitSecs, 5, 120);
  const points = normPositiveInt(input.points, 100, 100000);

  return { ok: true, value: { photoId, prompt, options, correctIndex, timeLimitSecs, points } };
}

function normPositiveInt(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

const SELECT =
  "id, photo_id, prompt, options, correct_index, position, time_limit_secs, points, enabled, created_at";

function toQuestion(row: QuizQuestionRow): QuizQuestion {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(row.options);
    if (Array.isArray(parsed)) options = parsed.filter((o) => typeof o === "string");
  } catch {
    options = [];
  }
  return {
    id: row.id,
    photoId: row.photo_id,
    prompt: row.prompt,
    options,
    correctIndex: row.correct_index,
    position: row.position,
    timeLimitSecs: row.time_limit_secs,
    points: row.points,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

/** Create a question at the end of the list. Returns the new id, or null if invalid. */
export async function createQuestion(
  env: { DB: D1Database },
  input: QuestionInput,
): Promise<string | null> {
  const valid = validateQuestion(input);
  if (!valid.ok) return null;
  const v = valid.value;

  const id = crypto.randomUUID();
  const posRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM quiz_questions",
  ).first<{ pos: number }>();
  const position = posRow?.pos ?? 0;

  await env.DB.prepare(
    `INSERT INTO quiz_questions
       (id, photo_id, prompt, options, correct_index, position, time_limit_secs, points, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      id,
      v.photoId,
      v.prompt,
      JSON.stringify(v.options),
      v.correctIndex,
      position,
      v.timeLimitSecs,
      v.points,
      Date.now(),
    )
    .run();
  return id;
}

/** Update an existing question's content. Returns false if invalid/missing. */
export async function updateQuestion(
  env: { DB: D1Database },
  id: string,
  input: QuestionInput,
): Promise<boolean> {
  const valid = validateQuestion(input);
  if (!valid.ok) return false;
  const v = valid.value;

  const res = await env.DB.prepare(
    `UPDATE quiz_questions
       SET photo_id = ?, prompt = ?, options = ?, correct_index = ?, time_limit_secs = ?, points = ?
     WHERE id = ?`,
  )
    .bind(v.photoId, v.prompt, JSON.stringify(v.options), v.correctIndex, v.timeLimitSecs, v.points, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function setQuestionEnabled(
  env: { DB: D1Database },
  id: string,
  enabled: boolean,
): Promise<void> {
  await env.DB.prepare("UPDATE quiz_questions SET enabled = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, id)
    .run();
}

export async function deleteQuestion(env: { DB: D1Database }, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM quiz_questions WHERE id = ?").bind(id).run();
}

/** Swap a question with its neighbour in the given direction. */
export async function moveQuestion(
  env: { DB: D1Database },
  id: string,
  dir: "up" | "down",
): Promise<void> {
  const current = await env.DB.prepare(`${`SELECT ${SELECT}`} FROM quiz_questions WHERE id = ?`)
    .bind(id)
    .first<QuizQuestionRow>();
  if (!current) return;

  const neighbour = await env.DB.prepare(
    dir === "up"
      ? `SELECT ${SELECT} FROM quiz_questions WHERE position < ? ORDER BY position DESC LIMIT 1`
      : `SELECT ${SELECT} FROM quiz_questions WHERE position > ? ORDER BY position ASC LIMIT 1`,
  )
    .bind(current.position)
    .first<QuizQuestionRow>();
  if (!neighbour) return;

  await env.DB.batch([
    env.DB.prepare("UPDATE quiz_questions SET position = ? WHERE id = ?").bind(neighbour.position, current.id),
    env.DB.prepare("UPDATE quiz_questions SET position = ? WHERE id = ?").bind(current.position, neighbour.id),
  ]);
}

/** All questions (admin view), ordered. */
export async function listQuestions(env: { DB: D1Database }): Promise<QuizQuestion[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT} FROM quiz_questions ORDER BY position ASC`,
  ).all<QuizQuestionRow>();
  return (results ?? []).map(toQuestion);
}

/** Enabled questions in play order (used to launch a game). */
export async function listEnabledQuestions(env: { DB: D1Database }): Promise<QuizQuestion[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT} FROM quiz_questions WHERE enabled = 1 ORDER BY position ASC`,
  ).all<QuizQuestionRow>();
  return (results ?? []).map(toQuestion);
}

export async function getQuestion(
  env: { DB: D1Database },
  id: string,
): Promise<QuizQuestion | null> {
  const row = await env.DB.prepare(`SELECT ${SELECT} FROM quiz_questions WHERE id = ?`)
    .bind(id)
    .first<QuizQuestionRow>();
  return row ? toQuestion(row) : null;
}
