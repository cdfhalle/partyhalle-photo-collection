/** A short numeric room code for the live quiz (e.g. "4821"). */
export function randomPin(digits = 4): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(Math.floor(min + Math.random() * (max - min)));
}
