/** The capability URL the QR code encodes: scanning it opens the upload page. */
export function uploadEntryUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/api/upload/enter?t=${encodeURIComponent(token)}`;
}
