"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { setFeedbackResolved, deleteFeedback } from "@/lib/feedback";

export async function setFeedbackResolvedAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setFeedbackResolved(cfEnv(), id, formData.get("resolved") === "1");
  revalidatePath("/admin/feedback");
}

export async function deleteFeedbackAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteFeedback(cfEnv(), id);
  revalidatePath("/admin/feedback");
}
