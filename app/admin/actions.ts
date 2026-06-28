"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { deletePhoto } from "@/lib/photos";

export async function deletePhotoAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePhoto(cfEnv(), id);
  revalidatePath("/admin");
}
