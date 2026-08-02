export function toggleNetworkSelection(
  selected: readonly string[],
  network: string,
  checked: boolean,
): string[] {
  const next = new Set(selected);
  if (checked) next.add(network);
  else next.delete(network);
  return [...next].sort();
}
