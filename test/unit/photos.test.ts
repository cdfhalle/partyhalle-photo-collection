import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  storePhoto,
  countPhotos,
  listPhotos,
  getPhoto,
  deletePhoto,
  toSlideshowItems,
} from "@/lib/photos";

const jpeg = (() => {
  const bytes = new Uint8Array(40);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
})();

describe("storePhoto / countPhotos", () => {
  it("starts empty", async () => {
    expect(await countPhotos(env)).toBe(0);
  });

  it("stores the original in R2 and a row in D1", async () => {
    const id = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      comment: "hi",
      name: "Anna",
    });
    expect(id).toBeTruthy();
    expect(await countPhotos(env)).toBe(1);

    const row = await env.DB.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first();
    expect(row?.content_type).toBe("image/jpeg");
    expect(row?.comment).toBe("hi");
    expect(row?.uploader_name).toBe("Anna");
    expect(row?.size_bytes).toBe(40);

    const object = await env.PHOTOS_BUCKET.get(row!.object_key as string);
    expect(object).not.toBeNull();
  });

  it("allows null comment and name", async () => {
    const id = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });
    const row = await env.DB
      .prepare("SELECT comment, uploader_name FROM photos WHERE id = ?")
      .bind(id)
      .first();
    expect(row?.comment).toBeNull();
    expect(row?.uploader_name).toBeNull();
  });
});

describe("listPhotos / getPhoto / deletePhoto", () => {
  it("lists photos newest first", async () => {
    const first = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg", comment: "a" });
    await new Promise((r) => setTimeout(r, 2));
    const second = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg", comment: "b" });

    const photos = await listPhotos(env);
    expect(photos.map((p) => p.id)).toEqual([second, first]);
    expect(photos[0].comment).toBe("b");
  });

  it("gets a photo by id, or null when missing", async () => {
    const id = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });
    expect((await getPhoto(env, id))?.id).toBe(id);
    expect(await getPhoto(env, "does-not-exist")).toBeNull();
  });

  it("deletes a photo from D1 and R2", async () => {
    const id = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });
    const photo = await getPhoto(env, id);
    expect(await env.PHOTOS_BUCKET.get(photo!.object_key)).not.toBeNull();

    expect(await deletePhoto(env, id)).toBe(true);
    expect(await getPhoto(env, id)).toBeNull();
    expect(await env.PHOTOS_BUCKET.get(photo!.object_key)).toBeNull();
    expect(await countPhotos(env)).toBe(0);
  });

  it("returns false when deleting an unknown id", async () => {
    expect(await deletePhoto(env, "nope")).toBe(false);
  });
});

describe("toSlideshowItems", () => {
  it("keeps id and comment, drops uploader name, reverses to chronological order", () => {
    // listPhotos order is newest-first; row "1" is newest.
    const rows = [
      {
        id: "1",
        object_key: "photos/1.jpg",
        comment: "hi",
        uploader_name: "Anna",
        content_type: "image/jpeg",
        size_bytes: 1,
        created_at: 2,
      },
      {
        id: "2",
        object_key: "photos/2.jpg",
        comment: null,
        uploader_name: "Bob",
        content_type: "image/jpeg",
        size_bytes: 1,
        created_at: 1,
      },
    ];
    // Oldest ("2") first.
    expect(toSlideshowItems(rows)).toEqual([
      { id: "2", comment: null },
      { id: "1", comment: "hi" },
    ]);
  });
});
