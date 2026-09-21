export function rupees(amount: number): string {
  return "₹" + new Intl.NumberFormat("en-IN").format(amount);
}

export function shortDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A reward figure, or an honest placeholder.
 *
 * Roles synced from Keka arrive with a default reward because Keka has no
 * concept of one — HR sets the real figure per role in the Hub. Until then
 * the number is invented, and CONTEXT.md convention 1 is explicit that an
 * invented figure an employee might act on must never be shown as real.
 */
export function rewardLabel(amount: number, confirmed: boolean): string {
  return confirmed ? rupees(amount) : "To be confirmed";
}
