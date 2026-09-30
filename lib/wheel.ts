export function segmentAngle(count: number): number {
  return 360 / count;
}
export function jitterFor(count: number): number {
  const max = 180 / count - 6;
  return (Math.random() * 2 - 1) * Math.max(0, max);
}
export function finalRotation(index: number, count: number, jitterDeg = 0): number {
  const seg = segmentAngle(count);
  const maxJitter = Math.max(0, seg / 2 - 6);
  const jitter = Math.max(-maxJitter, Math.min(maxJitter, jitterDeg));
  return 5 * 360 - (index * seg + seg / 2) + jitter;
}
