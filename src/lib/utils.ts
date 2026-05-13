export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function getPseudoRating(seed: string) {
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i);
  return Number((4.2 + (total % 8) / 10).toFixed(1));
}
