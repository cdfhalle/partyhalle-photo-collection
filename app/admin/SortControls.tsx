"use client";

import { useRouter } from "next/navigation";
import type { SortDir, SortKey, SortSpec } from "@/lib/photos";

const KEY_LABELS: Record<SortKey, string> = {
  uploaded: "Hochgeladen",
  taken: "Aufgenommen",
  uploader: "Name",
};

// Natural direction when a criterion is picked: dates newest-first, names A–Z.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  uploaded: "desc",
  taken: "desc",
  uploader: "asc",
};

// Two sort slots (criterion + direction each); the choice lives in the URL, so
// it survives reloads and the server re-renders the sorted grid.
export function SortControls({
  primary,
  secondary,
}: {
  primary: SortSpec;
  secondary: SortSpec;
}) {
  const router = useRouter();

  function apply(first: SortSpec, second: SortSpec) {
    router.replace(`/admin?sort=${first.key}-${first.dir},${second.key}-${second.dir}`, {
      scroll: false,
    });
  }

  const select =
    "min-h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";
  const dirBtn =
    "flex min-h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

  function slot(
    spec: SortSpec,
    update: (next: SortSpec) => void,
    labels: { select: string; dir: string },
  ) {
    return (
      <span className="inline-flex items-center gap-1">
        <select
          value={spec.key}
          onChange={(e) => {
            const key = e.target.value as SortKey;
            update({ key, dir: DEFAULT_DIR[key] });
          }}
          aria-label={labels.select}
          className={select}
        >
          {(Object.keys(KEY_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {KEY_LABELS[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => update({ ...spec, dir: spec.dir === "desc" ? "asc" : "desc" })}
          aria-label={labels.dir}
          title={spec.dir === "desc" ? "absteigend" : "aufsteigend"}
          className={dirBtn}
        >
          {spec.dir === "desc" ? "↓" : "↑"}
        </button>
      </span>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
      Sortieren nach:{" "}
      {slot(primary, (next) => apply(next, secondary), {
        select: "Erstes Sortierkriterium",
        dir: "Erste Sortierrichtung umkehren",
      })}
      <span>dann:</span>
      {slot(secondary, (next) => apply(primary, next), {
        select: "Zweites Sortierkriterium",
        dir: "Zweite Sortierrichtung umkehren",
      })}
    </p>
  );
}
