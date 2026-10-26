const variantNames: Record<string, string> = {
  hot: "ร้อน",
  cold: "เย็น",
  blended: "ปั่น",
};
export const exportDate = (value: string) =>
  new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
export function itemOptions(item: any) {
  const options = [item.variantLabel || variantNames[item.variant] || ""];
  if (item.sweet != null) options.push(`หวาน ${item.sweet}%`);
  if (Array.isArray(item.toppings))
    options.push(
      ...item.toppings
        .map((t: any) => (typeof t === "string" ? t : t.name))
        .filter(Boolean),
    );
  return options.filter(Boolean).join(" · ");
}
export function readableItems(items: any[]) {
  if (!Array.isArray(items) || !items.length) return "—";
  return items
    .map((item) => {
      const unit = item.unit === "piece" ? "ชิ้น" : "แก้ว";
      return `${item.qty} × ${item.name}${itemOptions(item) ? " · " + itemOptions(item) : ""} · ${unit}ละ ${item.price} บาท · รวม ${item.qty * item.price} บาท${item.note ? "\nหมายเหตุ: " + item.note : ""}`;
    })
    .join("\n");
}
