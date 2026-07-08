import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  storePhoto,
  countPhotos,
  listPhotos,
  listSessionPhotos,
  getPhoto,
  deletePhoto,
  parseSortParam,
  rotatePhoto,
  sortPhotos,
  updatePhotoMetadata,
  toSlideshowItems,
  DEFAULT_SORT,
  photoFileName,
  toDownloadMetadata,
} from "@/lib/photos";
import { parsePeople } from "@/lib/metadata";

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

describe("toDownloadMetadata", () => {
  it("carries all annotations, with ZIP-matching file names and ISO dates", async () => {
    const takenAt = Date.UTC(2026, 6, 4, 21, 30);
    const id = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      comment: "Prost!",
      name: "Anna",
      takenAt,
      locationName: "Tanzfläche",
      lat: 52.52,
      lng: 13.405,
      people: [{ name: "Bob", x: 0.25, y: 0.75 }],
    });

    const [entry] = toDownloadMetadata(await listPhotos(env));
    expect(entry.file).toBe(`${id}.jpg`);
    expect(entry.file).toBe(photoFileName((await getPhoto(env, id))!));
    expect(entry.comment).toBe("Prost!");
    expect(entry.uploader).toBe("Anna");
    expect(entry.takenAt).toBe(new Date(takenAt).toISOString());
    expect(entry.location).toEqual({ name: "Tanzfläche", lat: 52.52, lng: 13.405 });
    expect(entry.people).toEqual([{ name: "Bob", x: 0.25, y: 0.75 }]);
    expect(Date.parse(entry.uploadedAt)).not.toBeNaN();
  });

  it("uses nulls and an empty people list for unannotated photos", async () => {
    await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });

    const [entry] = toDownloadMetadata(await listPhotos(env));
    expect(entry.comment).toBeNull();
    expect(entry.uploader).toBeNull();
    expect(entry.takenAt).toBeNull();
    expect(entry.location).toBeNull();
    expect(entry.people).toEqual([]);
  });

  it("keeps a partial location (name without coordinates)", async () => {
    await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg", locationName: "Garten" });

    const [entry] = toDownloadMetadata(await listPhotos(env));
    expect(entry.location).toEqual({ name: "Garten", lat: null, lng: null });
  });

  it("mirrors the input order (newest first from listPhotos)", async () => {
    await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg", comment: "alt" });
    await new Promise((r) => setTimeout(r, 2));
    await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg", comment: "neu" });

    const entries = toDownloadMetadata(await listPhotos(env));
    expect(entries.map((e) => e.comment)).toEqual(["neu", "alt"]);
  });
});

describe("toSlideshowItems", () => {
  it("keeps id, comment and rotation, drops uploader name, reverses to chronological order", () => {
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
        rotation: 90,
      },
      {
        id: "2",
        object_key: "photos/2.jpg",
        comment: null,
        uploader_name: "Bob",
        content_type: "image/jpeg",
        size_bytes: 1,
        created_at: 1,
        rotation: null,
      },
    ];
    // Oldest ("2") first; a null rotation normalizes to 0.
    expect(toSlideshowItems(rows)).toEqual([
      { id: "2", comment: null, rotation: 0 },
      { id: "1", comment: "hi", rotation: 90 },
    ]);
  });
});

describe("sortPhotos", () => {
  const row = (
    id: string,
    created_at: number,
    taken_at: number | null = null,
    uploader_name: string | null = null,
  ) => ({ id, created_at, taken_at, uploader_name });
  const ids = (photos: { id: string }[]) => photos.map((p) => p.id);

  it("sorts by upload time in both directions", () => {
    const photos = [row("old", 1), row("new", 3), row("mid", 2)];
    expect(ids(sortPhotos(photos, [{ key: "uploaded", dir: "desc" }]))).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(ids(sortPhotos(photos, [{ key: "uploaded", dir: "asc" }]))).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });

  it("treats a missing capture time as the earliest possible date", () => {
    const photos = [row("undated", 4, null), row("early", 1, 100), row("late", 2, 900)];
    // Descending: undated sinks to the end; ascending: undated comes first.
    expect(ids(sortPhotos(photos, [{ key: "taken", dir: "desc" }]))).toEqual([
      "late",
      "early",
      "undated",
    ]);
    expect(ids(sortPhotos(photos, [{ key: "taken", dir: "asc" }]))).toEqual([
      "undated",
      "early",
      "late",
    ]);
  });

  it("sorts uploader names alphabetically, case-insensitive, nameless as empty", () => {
    const photos = [
      row("bob", 1, null, "bob"),
      row("anna", 2, null, "Anna"),
      row("anon", 3, null, null),
      row("zoe", 4, null, "Zoe"),
    ];
    expect(ids(sortPhotos(photos, [{ key: "uploader", dir: "asc" }]))).toEqual([
      "anon",
      "anna",
      "bob",
      "zoe",
    ]);
    expect(ids(sortPhotos(photos, [{ key: "uploader", dir: "desc" }]))).toEqual([
      "zoe",
      "bob",
      "anna",
      "anon",
    ]);
  });

  it("breaks ties of the first criterion with the second", () => {
    const photos = [
      row("anna-early", 1, 100, "Anna"),
      row("bob", 2, 900, "Bob"),
      row("anna-late", 3, 500, "Anna"),
    ];
    const specs = [
      { key: "uploader", dir: "asc" },
      { key: "taken", dir: "desc" },
    ] as const;
    expect(ids(sortPhotos(photos, [...specs]))).toEqual(["anna-late", "anna-early", "bob"]);
  });

  it("keeps the input order when every criterion ties (stable sort)", () => {
    const photos = [row("first", 1, 500, "Anna"), row("second", 2, 500, "anna")];
    expect(
      ids(
        sortPhotos(photos, [
          { key: "taken", dir: "desc" },
          { key: "uploader", dir: "asc" },
        ]),
      ),
    ).toEqual(["first", "second"]);
  });

  it("does not mutate its input", () => {
    const photos = [row("a", 1), row("b", 2)];
    sortPhotos(photos, [{ key: "uploaded", dir: "desc" }]);
    expect(ids(photos)).toEqual(["a", "b"]);
  });
});

describe("parseSortParam", () => {
  it("parses both slots", () => {
    expect(parseSortParam("taken-desc,uploader-asc")).toEqual([
      { key: "taken", dir: "desc" },
      { key: "uploader", dir: "asc" },
    ]);
  });

  it("falls back to the defaults for missing or garbage input", () => {
    expect(parseSortParam(undefined)).toEqual(DEFAULT_SORT);
    expect(parseSortParam("total;garbage")).toEqual(DEFAULT_SORT);
  });

  it("recovers each slot independently", () => {
    expect(parseSortParam("uploader-desc,nonsense-up")).toEqual([
      { key: "uploader", dir: "desc" },
      DEFAULT_SORT[1],
    ]);
    expect(parseSortParam("nonsense,taken-asc")).toEqual([
      DEFAULT_SORT[0],
      { key: "taken", dir: "asc" },
    ]);
  });
});

describe("updatePhotoMetadata", () => {
  it("sets all editable fields and leaves provenance untouched", async () => {
    const id = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      name: "Anna",
      lat: 52.52,
      lng: 13.405,
    });

    expect(
      await updatePhotoMetadata(env, id, {
        comment: "Prost!",
        takenAt: Date.UTC(2026, 6, 4, 12),
        locationName: "Tanzfläche",
        people: [{ name: "Bob", x: 0.25, y: 0.75 }],
      }),
    ).toBe(true);

    const row = (await getPhoto(env, id))!;
    expect(row.comment).toBe("Prost!");
    expect(row.taken_at).toBe(Date.UTC(2026, 6, 4, 12));
    expect(row.location_name).toBe("Tanzfläche");
    expect(parsePeople(row.people)).toEqual([{ name: "Bob", x: 0.25, y: 0.75 }]);
    // Untouched: uploader, coordinates, rotation.
    expect(row.uploader_name).toBe("Anna");
    expect(row.location_lat).toBe(52.52);
    expect(row.location_lng).toBe(13.405);
    expect(row.rotation).toBeNull();
  });

  it("clears fields with nulls and an empty people list", async () => {
    const id = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      comment: "alt",
      takenAt: Date.UTC(2026, 5, 1),
      locationName: "Garten",
      people: [{ name: "Cara", x: 0.5, y: 0.5 }],
    });

    expect(
      await updatePhotoMetadata(env, id, {
        comment: null,
        takenAt: null,
        locationName: null,
        people: [],
      }),
    ).toBe(true);

    const row = (await getPhoto(env, id))!;
    expect(row.comment).toBeNull();
    expect(row.taken_at).toBeNull();
    expect(row.location_name).toBeNull();
    expect(row.people).toBeNull();
  });

  it("returns false for an unknown id", async () => {
    expect(
      await updatePhotoMetadata(env, "nope", {
        comment: null,
        takenAt: null,
        locationName: null,
        people: [],
      }),
    ).toBe(false);
  });
});

describe("rotatePhoto", () => {
  it("cycles clockwise through the four rotations starting from null", async () => {
    const id = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });
    expect(await rotatePhoto(env, id, 90)).toBe(90);
    expect(await rotatePhoto(env, id, 90)).toBe(180);
    expect(await rotatePhoto(env, id, 90)).toBe(270);
    expect(await rotatePhoto(env, id, 90)).toBe(0);
    expect((await getPhoto(env, id))!.rotation).toBe(0);
  });

  it("rotates counter-clockwise from null to 270", async () => {
    const id = await storePhoto(env, { bytes: jpeg, contentType: "image/jpeg" });
    expect(await rotatePhoto(env, id, -90)).toBe(270);
  });

  it("rewrites people coordinates into the rotated display space", async () => {
    const id = await storePhoto(env, {
      bytes: jpeg,
      contentType: "image/jpeg",
      people: [{ name: "Anna", x: 0.25, y: 0.75 }],
    });

    await rotatePhoto(env, id, 90);
    expect(parsePeople((await getPhoto(env, id))!.people)).toEqual([
      { name: "Anna", x: 0.25, y: 0.25 },
    ]);

    // Turning back restores the original coordinates.
    await rotatePhoto(env, id, -90);
    expect(parsePeople((await getPhoto(env, id))!.people)).toEqual([
      { name: "Anna", x: 0.25, y: 0.75 },
    ]);
  });

  it("returns null for an unknown id", async () => {
    expect(await rotatePhoto(env, "nope", 90)).toBeNull();
  });
});
