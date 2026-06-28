import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { storePhoto, countPhotos } from "@/lib/photos";

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
