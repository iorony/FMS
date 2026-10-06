/** Cantidades de inventario: nunca convierte un campo vacío en cero. */
export function inventoryQuantity(value: string, allowZero = false): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isFinite(quantity) && (allowZero ? quantity >= 0 : quantity > 0) ? quantity : null;
}

export function assignmentBalance(assignment: { assigned_quantity: number; consumed_quantity: number; returned_quantity: number }): number {
  const balance = Math.round((Number(assignment.assigned_quantity) - Number(assignment.consumed_quantity) - Number(assignment.returned_quantity)) * 100) / 100;
  return balance === 0 ? 0 : balance;
}
