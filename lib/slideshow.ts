// Pure ordering and formatting helpers for the slideshow (unit-testable, no React).

import type { Person } from "@/lib/metadata";

export interface SlideItem {
  id: string;
  comment: string | null;
  // Admin display rotation (0/90/180/270); part of the image URL's cache key.
  rotation: number;
  uploaderName: string | null;
  takenAt: number | null; // epoch ms
  locationName: string | null;
  // Parsed server-side; coordinates are normalized 0-1 in displayed (rotated) space.
  people: Person[];
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

/**
 * One small line under the comment: "11.07.2026 · Gartenlokal · von Conrad".
 * Only the fields that exist appear; null when there is nothing to show.
 * Date only (no time): many photos are scanned prints from past decades.
 */
export function formatSlideMeta(
  item: Pick<SlideItem, "uploaderName" | "takenAt" | "locationName">,
): string | null {
  const parts = [
    item.takenAt !== null ? dateFmt.format(item.takenAt) : null,
    item.locationName,
    item.uploaderName ? `von ${item.uploaderName}` : null,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(" · ") : null;
}

export interface PersonLabel {
  person: Person;
  // Marker line length class: horizontal neighbors cycle 0→1→2 so their
  // labels sit at staggered heights instead of colliding.
  tier: 0 | 1 | 2;
  // Faces near the top edge get the label below the point instead of above.
  below: boolean;
}

export function layoutPeopleLabels(people: Person[]): PersonLabel[] {
  return people
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((person, i) => ({ person, tier: (i % 3) as 0 | 1 | 2, below: person.y < 0.15 }));
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Deterministic shuffle: order depends only on each item's id + the seed, so it
 * is stable across re-renders, and newly added photos slot into a fixed position
 * without reordering the ones already in the rotation.
 */
export function seededShuffle<T extends { id: string }>(items: T[], seed: number): T[] {
  return items
    .map((item) => ({ item, key: hashCode(`${item.id}:${seed}`) }))
    .sort((a, b) => a.key - b.key || (a.item.id < b.item.id ? -1 : 1))
    .map((entry) => entry.item);
}

/** Index of the item with the given id, or 0 if not found / no id. */
export function indexOfId(items: { id: string }[], id: string | null | undefined): number {
  if (!id) return 0;
  const index = items.findIndex((item) => item.id === id);
  return index >= 0 ? index : 0;
}
