import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  storePhoto,
  countPhotos,
  listPhotos,
  listSessionPhotos,
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

describe("listSessionPhotos", () => {
  it("returns only the photos of exactly that session, oldest first", async () => {
    const mineFirst = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      comment: "mine 1",
      sessionId: "session-a",
    });
    await new Promise((r) => setTimeout(r, 2));
    await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      comment: "theirs",
      sessionId: "session-b",
    });
    await new Promise((r) => setTimeout(r, 2));
    const mineSecond = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      comment: "mine 2",
      sessionId: "session-a",
    });

    const mine = await listSessionPhotos(env, "session-a");
    expect(mine.map((p) => p.id)).toEqual([mineFirst, mineSecond]);
    expect(mine.map((p) => p.comment)).toEqual(["mine 1", "mine 2"]);
  });

  it("never returns photos without a session (pre-migration rows)", async () => {
    await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });
    expect(await listSessionPhotos(env, "session-a")).toEqual([]);
    // An empty session id matches nothing either.
    expect(await listSessionPhotos(env, "")).toEqual([]);
  });

  it("stores the session id on the row", async () => {
    const id = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      sessionId: "session-a",
    });
    expect((await getPhoto(env, id))?.session_id).toBe("session-a");
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
