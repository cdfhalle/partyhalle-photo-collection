"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  setQuestionEnabled,
  moveQuestion,
  type QuestionInput,
} from "@/lib/quiz";

function readInput(formData: FormData): QuestionInput {
  return {
    photoId: String(formData.get("photoId") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    options: formData.getAll("option").map((o) => String(o)),
    correctIndex: Number(formData.get("correctIndex") ?? -1),
    timeLimitSecs: emptyToNull(formData.get("timeLimitSecs")),
    points: emptyToNull(formData.get("points")),
  };
}

function emptyToNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  return s ? Number(s) : null;
}

export async function createQuestionAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  await createQuestion(cfEnv(), readInput(formData));
  revalidatePath("/admin/quiz");
}

export async function updateQuestionAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateQuestion(cfEnv(), id, readInput(formData));
  revalidatePath("/admin/quiz");
}

export async function deleteQuestionAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteQuestion(cfEnv(), id);
  revalidatePath("/admin/quiz");
}

export async function toggleEnabledAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setQuestionEnabled(cfEnv(), id, String(formData.get("enabled")) === "1");
  revalidatePath("/admin/quiz");
}

export async function moveQuestionAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (!id || (dir !== "up" && dir !== "down")) return;
  await moveQuestion(cfEnv(), id, dir);
  revalidatePath("/admin/quiz");
}
