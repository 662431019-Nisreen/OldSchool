"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Printer, X } from "lucide-react";
import type { Receipt } from "@/lib/receipt";

type Paper = "80" | "58" | "a4";
const amount = (value: number) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const dateTime = (value: string) =>
  new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
async function fetchReceipt(
  id: number,
  signal?: AbortSignal,
): Promise<Receipt> {
  const response = await fetch("/api/pos?action=receipt&id=" + id, {
    cache: "no-store",
    signal,
  });
  const data = (await response.json()) as { receipt: Receipt; error?: string };
  if (!response.ok) throw new Error(data.error || "โหลดใบเสร็จไม่สำเร็จ");
  return data.receipt;
}
// Status transitions also increment version; compare the actual receipt content.
function signature(receipt: Receipt) {
  const { version: _version, ...content } = receipt;
  return JSON.stringify(content);
}

export default function ReceiptDialog({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paper, setPaper] = useState<Paper>("80");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [printedAt, setPrintedAt] = useState("");
  const [heightMm, setHeightMm] = useState(200);
  const dialog = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const lock = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.receiptOpen = "true";
    dialog.current?.focus();
    try {
      const saved = localStorage.getItem("os_receipt_paper");
      if (saved === "80" || saved === "58" || saved === "a4") setPaper(saved);
    } catch {}
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lock.current) close.current();
      if (event.key !== "Tab") return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      if (!controls?.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.receiptOpen;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    setReceipt(null);
    fetchReceipt(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setReceipt(data);
          setPrintedAt(new Date().toISOString());
        }
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  useEffect(() => {
    const element = sheet.current;
    if (!element || paper === "a4") return;
    const measure = () =>
      setHeightMm(Math.ceil((element.offsetHeight * 25.4) / 96) + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [receipt, paper]);

  async function print() {
    if (lock.current || !receipt) return;
    lock.current = true;
    setPrinting(true);
    setNotice("");
    try {
      const latest = await fetchReceipt(id);
      if (signature(latest) !== signature(receipt)) {
        setReceipt(latest);
        setNotice(
          "ออเดอร์มีการแก้ไขแล้ว กรุณาตรวจสอบยอดล่าสุด แล้วกดพิมพ์อีกครั้ง",
        );
        return;
      }
      flushSync(() => {
        setReceipt(latest);
        setPrintedAt(new Date().toISOString());
      });
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (!sheet.current) return;
      // Match the fixed thermal preview width and include padding, in CSS pixels.
      flushSync(() =>
        setHeightMm(Math.ceil((sheet.current!.offsetHeight * 25.4) / 96) + 2),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      window.print();
    } catch (e: any) {
      setError(e.message || "เปิดหน้าต่างพิมพ์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      setReceipt(null);
    } finally {
      lock.current = false;
      setPrinting(false);
    }
  }

  return createPortal(
    <div id="receipt-print-root" onClick={() => !printing && onClose()}>
      <style>{`@page { size: ${paper === "a4" ? "A4" : `${paper}mm ${heightMm}mm`}; margin: ${paper === "a4" ? "12mm" : "0"}; }`}</style>
      <section
        className="receipt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-dialog-title"
        tabIndex={-1}
        ref={dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="receipt-controls receipt-dialog-heading">
          <div>
            <small className="eyebrow">OLD SCHOOL / RECEIPT</small>
            <h2 id="receipt-dialog-title">พิมพ์ใบเสร็จ</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            aria-label="ปิดใบเสร็จ"
          >
            <X size={21} />
          </button>
        </header>
        <div className="receipt-controls receipt-toolbar">
          <label>
            ขนาดกระดาษ
            <select
              value={paper}
              disabled={printing}
              onChange={(event) => {
                const value = event.target.value as Paper;
                setPaper(value);
                try {
                  localStorage.setItem("os_receipt_paper", value);
                } catch {}
              }}
            >
              <option value="80">ใบเสร็จ 80 มม.</option>
              <option value="58">ใบเสร็จ 58 มม.</option>
              <option value="a4">กระดาษ A4</option>
            </select>
          </label>
          <button
            className="primary"
            type="button"
            disabled={loading || printing || !receipt || !!error}
            onClick={print}
          >
            <Printer size={18} />{" "}
            {printing ? "กำลังเตรียมพิมพ์..." : "พิมพ์ / บันทึก PDF"}
          </button>
          <p>
            เลือกเครื่องพิมพ์และขนาดกระดาษให้ตรงกันในหน้าต่างพิมพ์
            หรือเลือกบันทึกเป็น PDF · ปิดหัวกระดาษและท้ายกระดาษของเบราว์เซอร์
          </p>
          {notice && (
            <p className="receipt-notice" role="status">
              {notice}
            </p>
          )}
        </div>
        <div className="receipt-preview">
          {loading && (
            <p className="receipt-controls" role="status">
              กำลังโหลดใบเสร็จ...
            </p>
          )}
          {error && (
            <div className="receipt-controls receipt-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                ลองอีกครั้ง
              </button>
            </div>
          )}
          {receipt && (
            <article
              className="receipt-paper"
              data-paper={paper}
              ref={sheet}
              aria-label={"ใบเสร็จ " + receipt.number}
            >
              <header className="receipt-brand">
                <h1>{receipt.shop.name}</h1>
                {receipt.shop.subtitle && <p>{receipt.shop.subtitle}</p>}
                <h2>ใบเสร็จรับเงิน</h2>
              </header>
              <dl className="receipt-meta">
                <div>
                  <dt>เลขออเดอร์</dt>
                  <dd>{receipt.number}</dd>
                </div>
                <div>
                  <dt>วันที่สั่ง</dt>
                  <dd>{dateTime(receipt.created)}</dd>
                </div>
                <div>
                  <dt>รับสินค้า</dt>
                  <dd>
                    {receipt.type === "takeaway"
                      ? "กลับบ้าน"
                      : "ทานที่ร้าน · โต๊ะ " + receipt.table}
                  </dd>
                </div>
              </dl>
              <table className="receipt-items">
                <thead>
                  <tr>
                    <th>รายการ</th>
                    <th>จำนวน</th>
                    <th>บาท</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <b>{item.name}</b>
                        <small>
                          {[
                            item.variantLabel,
                            item.sweet != null
                              ? "หวาน " + item.sweet + "%"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                        {item.note && <small>หมายเหตุ: {item.note}</small>}
                        <small>หน่วยละ {amount(item.price)} บาท</small>
                      </td>
                      <td>{item.qty}</td>
                      <td>{amount(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="receipt-totals">
                <div>
                  <span>รวมรายการ</span>
                  <b>{amount(receipt.subtotal)}</b>
                </div>
                {receipt.adjustment !== 0 && (
                  <div>
                    <span>
                      {receipt.adjustment < 0 ? "ส่วนลด" : "เพิ่มราคา"}
                    </span>
                    <b>{amount(receipt.adjustment)}</b>
                  </div>
                )}
                <div className="receipt-grand-total">
                  <strong>ยอดชำระสุทธิ</strong>
                  <strong>฿{amount(receipt.total)}</strong>
                </div>
                <p className="receipt-paid">ชำระเงินแล้ว</p>
                {(
                  [
                    ["cash", "เงินสดสุทธิ"],
                    ["qr", "QR / โอนสุทธิ"],
                    ["unknown", "ไม่ระบุช่องทาง"],
                  ] as const
                ).map(
                  ([key, label]) =>
                    receipt.payments[key] !== 0 && (
                      <div key={key}>
                        <span>{label}</span>
                        <b>{amount(receipt.payments[key])}</b>
                      </div>
                    ),
                )}
                {receipt.hasSettlements && (
                  <small>ยอดหลังรับเพิ่ม / คืนเงินที่บันทึกแล้ว</small>
                )}
              </div>
              <footer className="receipt-footer">
                <p>ขอบคุณที่อุดหนุนครับ</p>
                <small>พิมพ์เมื่อ {dateTime(printedAt)}</small>
              </footer>
            </article>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
