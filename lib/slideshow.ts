// Pure ordering helpers for the slideshow (unit-testable, no React).

export interface SlideItem {
  id: string;
  comment: string | null;
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
