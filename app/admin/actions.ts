"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth";
import { cfEnv } from "@/lib/server";
import { deletePhoto, rotatePhoto, updatePhotoMetadata } from "@/lib/photos";
import {
  cleanComment,
  cleanLocationName,
  sanitizePeople,
  takenAtFromDateInput,
} from "@/lib/metadata";

export async function deletePhotoAction(formData: FormData) {
  if (!(await isAuthenticated())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePhoto(cfEnv(), id);
  revalidatePath("/admin");
}

export async function rotatePhotoAction(id: string, delta: 90 | -90) {
  if (!(await isAuthenticated())) return;
  // Action arguments arrive from the client — re-validate them.
  if (!id || (delta !== 90 && delta !== -90)) return;
  await rotatePhoto(cfEnv(), id, delta);
  revalidatePath("/admin");
}

export interface UpdatePhotoState {
  ok: boolean;
  error?: string;
}

export async function updatePhotoAction(
  _prev: UpdatePhotoState,
  formData: FormData,
): Promise<UpdatePhotoState> {
  if (!(await isAuthenticated())) return { ok: false, error: "Nicht angemeldet." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Foto nicht gefunden." };
  // An empty date input means "clear the date"; anything else must parse —
  // erroring beats silently nulling a date the admin meant to keep.
  const takenAtRaw = formData.get("takenAt");
  const takenAt = takenAtFromDateInput(takenAtRaw);
  if (takenAt === null && typeof takenAtRaw === "string" && takenAtRaw !== "") {
    return { ok: false, error: "Ungültiges Datum." };
  }
  const updated = await updatePhotoMetadata(cfEnv(), id, {
    comment: cleanComment(formData.get("comment")),
    takenAt,
    locationName: cleanLocationName(formData.get("locationName")),
    people: sanitizePeople(formData.get("people")),
  });
  if (!updated) return { ok: false, error: "Foto nicht gefunden." };
  revalidatePath("/admin");
  return { ok: true };
}
