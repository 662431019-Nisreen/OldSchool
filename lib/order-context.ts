export type OrderContext = { type: "dinein" | "takeaway"; table: number };
export function qrContext(value: string, origin: string, maxTables = 100): OrderContext | null {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.pathname !== "/") return null;
    if (url.searchParams.get("type") === "takeaway") return { type: "takeaway", table: 0 };
    const table = Number(url.searchParams.get("table"));
    return Number.isInteger(table) && table > 0 && table <= maxTables
      ? { type: "dinein", table } : null;
  } catch { return null; }
}
export function contextQuery(context: OrderContext) {
  return context.type === "takeaway" ? "type=takeaway" : "table=" + context.table;
}
