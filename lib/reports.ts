export function bangkokDay(value: string | number | Date = new Date()) {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Bangkok",
  });
}
export function reportRange(params: URLSearchParams) {
  const date = params.get("date") || "",
    month = params.get("month") || "",
    start = params.get("start") || "",
    end = params.get("end") || "";
  const validDay = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number(s.slice(0, 4)) >= 2000 &&
    !isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if ([!!date, !!month, !!(start || end)].filter(Boolean).length > 1)
    throw new Error("เลือกตัวกรองวันที่เพียงรูปแบบเดียว");
  let from = "",
    to = "";
  if (date) {
    if (!validDay(date)) throw new Error("วันที่ไม่ถูกต้อง");
    from = to = date;
  }
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month) || !validDay(month + "-01"))
      throw new Error("เดือนไม่ถูกต้อง");
    from = month + "-01";
    to = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    )
      .toISOString()
      .slice(0, 10);
  }
  if (start || end) {
    if (!validDay(start) || !validDay(end) || start > end)
      throw new Error("กรุณาเลือกวันเริ่มต้นและสิ้นสุดให้ถูกต้อง");
    from = start;
    to = end;
  }
  return {
    from,
    to,
    startUtc: from ? new Date(from + "T00:00:00+07:00").toISOString() : "",
    endUtc: to
      ? new Date(Date.parse(to + "T00:00:00+07:00") + 86400000).toISOString()
      : "",
  };
}
// Preserve the original payment channel, then apply each recorded receipt/refund to its actual channel.
export function paymentSplit(order: any) {
  const split = { cash: 0, qr: 0, unknown: 0 };
  if (order.payment !== "paid") return split;
  const settlements = (order.revisions || []).filter((r: any) => r.settlement);
  const delta = settlements.reduce(
    (s: number, r: any) => s + r.settlement.amount,
    0,
  );
  const channel = (method: string): keyof typeof split =>
    method === "cash" || method === "qr" ? method : "unknown";
  split[channel(order.method)] += order.total - delta;
  for (const r of settlements)
    split[channel(r.settlement.method)] += r.settlement.amount;
  return split;
}
export function summarizeSales(orders: any[]) {
  const summary = {
    sales: 0,
    cash: 0,
    qr: 0,
    unknown: 0,
    pending: 0,
    pendingOrders: 0,
    count: orders.length,
    paidOrders: 0,
    cups: 0,
    pieces: 0,
    subtotal: 0,
    adjustment: 0,
    categories: {} as Record<string, number>,
  };
  for (const o of orders) {
    if (o.payment !== "paid") {
      summary.pending += o.total;
      summary.pendingOrders++;
      continue;
    }
    summary.sales += o.total;
    summary.paidOrders++;
    summary.adjustment += o.adjustment || 0;
    const split = paymentSplit(o);
    summary.cash += split.cash;
    summary.qr += split.qr;
    summary.unknown += split.unknown;
    for (const i of o.items) {
      const amount = i.price * i.qty;
      summary.subtotal += amount;
      summary.categories[i.category] =
        (summary.categories[i.category] || 0) + amount;
      if (i.unit === "piece") summary.pieces += i.qty;
      else summary.cups += i.qty;
    }
  }
  return summary;
}

// Group by the same Bangkok order date used by report filters and totals.
export function summarizeDailySales(
  orders: any[],
  range?: { from: string; to: string },
) {
  const groups = new Map<string, any[]>();
  for (const order of orders) {
    const date = bangkokDay(order.created);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(order);
  }
  // Include zero-order days for a selected day/month or short range. Never allocate unbounded calendars.
  if (range?.from && range.to) {
    const from = Date.parse(range.from + "T00:00:00Z"),
      to = Date.parse(range.to + "T00:00:00Z");
    const days = Math.round((to - from) / 86400000) + 1;
    if (days > 0 && days <= 366)
      for (let time = from; time <= to; time += 86400000) {
        const date = new Date(time).toISOString().slice(0, 10);
        if (!groups.has(date)) groups.set(date, []);
      }
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => ({ date, ...summarizeSales(rows) }));
}
