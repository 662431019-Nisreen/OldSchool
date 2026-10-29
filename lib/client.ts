export const money = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(n);
export const statusNames: Record<string, string> = {
  waiting: "รอทำ",
  making: "กำลังทำ",
  ready: "พร้อมรับ",
  done: "เสร็จสิ้น",
};
export async function api(action: string, body?: any, signal?: AbortSignal) {
  const r = await fetch(
    "/api/pos" + (body ? "" : "?action=" + action),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
          signal,
        }
      : { cache: "no-store", signal },
  );
  const d: any = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(d.error || "เกิดข้อผิดพลาด"), {
      status: r.status,
    });
  return d;
}
