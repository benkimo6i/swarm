// Value noise: a smooth random field, 0..1

const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

export function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const X = xi & 255;
  const Y = yi & 255;
  const a = perm[perm[X] + Y];
  const b = perm[perm[X + 1] + Y];
  const c = perm[perm[X] + Y + 1];
  const d = perm[perm[X + 1] + Y + 1];
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
}
