import { formatMoney } from "@mostrador/shared";

export function totalLabel(cents: number): string {
  return `Total ${formatMoney(cents)}`;
}
