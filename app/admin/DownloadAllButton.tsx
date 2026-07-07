"use client";

import { useState } from "react";
import { downloadZip } from "client-zip";

export interface DownloadFile {
  id: string;
  name: string;
  lastModified: number; // epoch ms (created_at)
}

// Builds the "all photos" ZIP in the browser: each original is fetched as its
// own request (one R2 read per Worker invocation), so we never hit the
// per-invocation subrequest/memory limits that broke the old server-side route.
export function DownloadAllButton({
  files,
  metadataJson,
  className,
}: {
  files: DownloadFile[];
  metadataJson: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onDownload() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(0);
    try {
      let completed = 0;
      async function* entries() {
        yield { name: "metadata.json", lastModified: new Date(), input: metadataJson };
        for (const f of files) {
          const res = await fetch(`/api/photo/${f.id}`);
          if (!res.ok) throw new Error(`Foto „${f.name}" (${res.status})`);
          const blob = await res.blob();
          yield { name: f.name, lastModified: new Date(f.lastModified), input: blob };
          completed += 1;
          setDone(completed);
        }
      }

      const zip = await downloadZip(entries()).blob();
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = "partyhalle-fotos.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Download fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={onDownload} disabled={busy} className={className}>
        {busy ? `Lädt … ${done}/${files.length}` : "Alle herunterladen (ZIP)"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
