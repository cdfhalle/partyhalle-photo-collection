// The public upload window. Empty/absent bounds mean "no limit on that side".

export function isUploadOpen(
  now: number,
  opensAt?: string | null,
  closesAt?: string | null,
): boolean {
  if (opensAt) {
    const opens = Date.parse(opensAt);
    if (Number.isFinite(opens) && now < opens) return false;
  }
  if (closesAt) {
    const closes = Date.parse(closesAt);
    if (Number.isFinite(closes) && now > closes) return false;
  }
  return true;
}
