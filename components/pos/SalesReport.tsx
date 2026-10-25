"use client";
import { useEffect, useState } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { money, statusNames } from "@/lib/client";
import { bangkokDay, paymentSplit } from "@/lib/reports";
export default function SalesReport() {
  const [mode, setMode] = useState("day"),
    [date, setDate] = useState(() => bangkokDay()),
    [month, setMonth] = useState(() => bangkokDay().slice(0, 7)),
    [start, setStart] = useState(() => bangkokDay()),
    [end, setEnd] = useState(() => bangkokDay());
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const params = new URLSearchParams(
    mode === "day"
      ? { date }
      : mode === "month"
        ? { month }
        : mode === "range"
          ? { start, end }
          : {},
  ).toString();
  const invalid =
    mode === "day"
      ? !date
      : mode === "month"
        ? !month
        : mode === "range"
          ? !start || !end || start > end
          : false;
  useEffect(() => {
    const controller = new AbortController();
    setPage(0);
    setData(null);
    setError("");
    setLoading(true);
    if (invalid) {
      setError(
        "กรุณาเลือกช่วงวันที่ให้ครบ และวันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น",
      );
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const r = await fetch("/api/pos?action=report&" + params, {
          cache: "no-store",
          signal: controller.signal,
        });
        const d: any = await r.json();
        if (!r.ok) throw new Error(d.error || "โหลดข้อมูลไม่สำเร็จ");
        if (!controller.signal.aborted) {
          setData(d);
          setError("");
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          setError(e.message);
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [params, invalid, retry]);
  const s = data?.summary;
  const rows = data?.orders || [];
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const shownPage = Math.min(page, pageCount - 1);
  const period =
    mode === "all"
      ? "ทั้งหมด"
      : mode === "day"
        ? (date === bangkokDay() ? "วันนี้ · " : "") + date
        : mode === "month"
          ? month
          : start + " ถึง " + end;
  return (
    <section className="sales-report" aria-label="ยอดขายและรายงาน">
      <div className="report-heading">
        <div>
          <small className="eyebrow">SALES & REPORTS</small>
          <h2>ยอดขายและรายงาน</h2>
          <p className="muted">{period}</p>
        </div>
        <button
          className="primary"
          disabled={loading || !!error || !data}
          onClick={() => {
            window.location.href = "/api/export?" + params;
          }}
        >
          <Download size={17} /> ส่งออก Excel
        </button>
      </div>
      <div className="panel report-filter">
        <div className="report-presets">
          {[
            ["day", "รายวัน"],
            ["month", "รายเดือน"],
            ["range", "ช่วงวันที่"],
            ["all", "ทั้งหมด"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={mode === key ? "chosen" : ""}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => {
              setDate(bangkokDay());
              setMode("day");
            }}
          >
            วันนี้
          </button>
        </div>
        <div className="report-date-fields">
          {mode === "day" && (
            <label>
              วันที่
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onInput={(e) => setDate(e.currentTarget.value)}
              />
            </label>
          )}
          {mode === "month" && (
            <label>
              เดือน
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                onInput={(e) => setMonth(e.currentTarget.value)}
              />
            </label>
          )}
          {mode === "range" && (
            <>
              <label>
                ตั้งแต่วันที่
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  onInput={(e) => setStart(e.currentTarget.value)}
                />
              </label>
              <label>
                ถึงวันที่
                <input
                  type="date"
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  onInput={(e) => setEnd(e.currentTarget.value)}
                />
              </label>
            </>
          )}
        </div>
        <p className="report-basis">
          เลือกตามวันที่สั่งออเดอร์ (เวลาประเทศไทย) ·
          ยอดสุทธิรวมการแก้ไขล่าสุดของออเดอร์ในช่วงนี้
        </p>
      </div>
      {loading && (
        <p role="status" className="panel">
          กำลังโหลดรายงาน...
        </p>
      )}
      {error && (
        <div className="panel" role="alert">
          <p className="editor-error">{error}</p>
          {!invalid && (
            <button onClick={() => setRetry((n) => n + 1)}>ลองอีกครั้ง</button>
          )}
        </div>
      )}
      {!loading && !error && s && (
        <>
          <div className="stats report-stats">
            {[
              ["฿" + money(s.sales), "ยอดรับชำระสุทธิ"],
              [String(s.count), "จำนวนออเดอร์"],
              [String(s.cups), "จำนวนแก้วที่ชำระแล้ว"],
              [
                "฿" + money(s.pending),
                "ยอดรอชำระ · " + s.pendingOrders + " ออเดอร์",
              ],
            ].map(([value, label]) => (
              <div className="panel" key={label}>
                <small>{label}</small>
                <h2>{value}</h2>
              </div>
            ))}
          </div>
          <div className="report-payments">
            <div className="panel">
              <small>เงินสดสุทธิ</small>
              <h3>฿{money(s.cash)}</h3>
            </div>
            <div className="panel">
              <small>โอนสุทธิ</small>
              <h3>฿{money(s.qr)}</h3>
            </div>
            {s.unknown !== 0 && (
              <div className="panel">
                <small>ไม่ระบุวิธีชำระ</small>
                <h3>฿{money(s.unknown)}</h3>
              </div>
            )}
            <div className="panel">
              <small>เบเกอรี่ / สินค้าเป็นชิ้นที่ชำระแล้ว</small>
              <h3>{s.pieces} ชิ้น</h3>
            </div>
          </div>
          <p className="report-basis">
            เงินสดและโอนเป็นยอดหลังรับเพิ่ม/คืนเงินตามช่องทางที่บันทึกไว้
          </p>
          <div className="panel">
            <h3>
              ยอดขายแยกหมวดหมู่ <small className="muted">ก่อนปรับยอด</small>
            </h3>
            {Object.entries(s.categories as Record<string, number>).length ? (
              Object.entries(s.categories as Record<string, number>)
                .sort((a, b) => b[1] - a[1])
                .map(([name, amount]) => (
                  <div className="sales-row" key={name}>
                    <b>{name}</b>
                    <div>
                      <span
                        style={{
                          width:
                            Math.min(
                              100,
                              (amount / Math.max(s.subtotal, 1)) * 100,
                            ) + "%",
                        }}
                      />
                    </div>
                    <strong>฿{money(amount)}</strong>
                  </div>
                ))
            ) : (
              <p className="muted">ยังไม่มียอดชำระในช่วงนี้</p>
            )}
            <div className="report-reconcile">
              <div className="row">
                <span>รวมก่อนปรับยอด</span>
                <b>฿{money(s.subtotal)}</b>
              </div>
              <div className="row">
                <span>ส่วนลด / เพิ่มราคา</span>
                <b>
                  {s.adjustment > 0 ? "+" : ""}฿{money(s.adjustment)}
                </b>
              </div>
              <div className="row">
                <strong>ยอดรับชำระสุทธิ</strong>
                <strong>฿{money(s.sales)}</strong>
              </div>
            </div>
          </div>
          <div className="panel report-order-panel">
            <div className="row">
              <h3>รายการขายและประวัติปรับยอด</h3>
              <small className="muted">
                {rows.length} ออเดอร์ · {s.paidOrders} ชำระแล้ว
              </small>
            </div>
            {!rows.length ? (
              <p className="report-empty">ไม่มีออเดอร์ในช่วงที่เลือก</p>
            ) : (
              <>
                <div className="report-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ออเดอร์ / เวลา</th>
                        <th>โต๊ะ / ประเภท</th>
                        <th>รายการ / ประวัติ</th>
                        <th>ชำระเงิน</th>
                        <th>ยอดสุทธิ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .slice(shownPage * 25, shownPage * 25 + 25)
                        .map((o: any) => {
                          const split = paymentSplit(o);
                          return (
                            <tr key={o.id}>
                              <td>
                                <b>{o.number}</b>
                                <small>
                                  {new Date(o.created).toLocaleString("th-TH", {
                                    timeZone: "Asia/Bangkok",
                                  })}
                                </small>
                                <span className={"status " + o.status}>
                                  {statusNames[o.status]}
                                </span>
                              </td>
                              <td>
                                {o.type === "dinein"
                                  ? "โต๊ะ " + o.table
                                  : "กลับบ้าน"}
                                <small>
                                  {o.source === "counter"
                                    ? "สั่งหน้าร้าน"
                                    : "สแกน QR"}
                                </small>
                              </td>
                              <td>
                                <details>
                                  <summary>
                                    {o.items.reduce(
                                      (n: number, i: any) => n + i.qty,
                                      0,
                                    )}{" "}
                                    รายการสินค้า
                                    {o.revisions?.length
                                      ? " · แก้ไข " +
                                        o.revisions.length +
                                        " ครั้ง"
                                      : ""}
                                  </summary>
                                  <div className="report-items">
                                    {o.items.map((i: any, k: number) => (
                                      <p key={k}>
                                        {i.qty} × {i.name} · {i.variantLabel}
                                        {i.sweet != null
                                          ? " · หวาน " + i.sweet + "%"
                                          : ""}
                                        {i.note ? " · " + i.note : ""}
                                      </p>
                                    ))}
                                    {!!o.adjustment && (
                                      <p>
                                        ปรับยอด {o.adjustment > 0 ? "+" : ""}
                                        {money(o.adjustment)} บาท ·{" "}
                                        {o.adjustmentReason}
                                      </p>
                                    )}
                                    {o.revisions?.map((r: any, k: number) => (
                                      <div className="report-revision" key={k}>
                                        <b>
                                          {r.actor} ·{" "}
                                          {new Date(r.at).toLocaleString(
                                            "th-TH",
                                            { timeZone: "Asia/Bangkok" },
                                          )}
                                        </b>
                                        <p>{r.reason}</p>
                                        <p>
                                          ฿{money(r.before.total)} → ฿
                                          {money(r.after.total)}
                                        </p>
                                        {r.settlement && (
                                          <p>
                                            {r.delta < 0
                                              ? "คืนเงิน"
                                              : "รับเพิ่ม"}{" "}
                                            ฿
                                            {money(
                                              Math.abs(r.settlement.amount),
                                            )}{" "}
                                            ·{" "}
                                            {r.settlement.method === "cash"
                                              ? "เงินสด"
                                              : "โอน"}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </td>
                              <td>
                                {o.payment !== "paid" ? (
                                  <span className="unpaid">ยังไม่ชำระ</span>
                                ) : (
                                  <>
                                    <span className="paid-text">ชำระแล้ว</span>
                                    {split.cash !== 0 && (
                                      <small>เงินสด ฿{money(split.cash)}</small>
                                    )}
                                    {split.qr !== 0 && (
                                      <small>โอน ฿{money(split.qr)}</small>
                                    )}
                                    {split.unknown !== 0 && (
                                      <small>
                                        ไม่ระบุ ฿{money(split.unknown)}
                                      </small>
                                    )}
                                  </>
                                )}
                              </td>
                              <td>
                                <strong>฿{money(o.total)}</strong>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="report-pagination">
                  <button
                    aria-label="หน้าก่อนหน้า"
                    disabled={shownPage === 0}
                    onClick={() => setPage(shownPage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    หน้า {shownPage + 1} / {pageCount}
                  </span>
                  <button
                    aria-label="หน้าถัดไป"
                    disabled={shownPage + 1 >= pageCount}
                    onClick={() => setPage(shownPage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
