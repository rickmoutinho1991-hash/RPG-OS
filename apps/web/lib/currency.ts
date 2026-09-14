export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}