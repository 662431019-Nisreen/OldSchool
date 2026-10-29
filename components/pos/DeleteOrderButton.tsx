"use client";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/client";

type Order = {
  id: number;
  version: number;
  number: string;
  total: number;
  payment: string;
};
type Props = {
  order: Order;
  disabled?: boolean;
  onDelete: (order: Order) => Promise<boolean>;
};

export default function DeleteOrderButton({
  order,
  disabled,
  onDelete,
}: Props) {
  const [snapshot, setSnapshot] = useState<Order | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = "delete-order-title-" + order.id;
  const descriptionId = "delete-order-description-" + order.id;

  useEffect(() => {
    const node = dialog.current;
    if (snapshot && node && !node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
    };
  }, [snapshot]);

  function close() {
    if (pendingRef.current) return;
    dialog.current?.close();
    setSnapshot(null);
    setError("");
  }

  async function remove() {
    if (!snapshot || disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (await onDelete(snapshot)) {
        dialog.current?.close();
        setSnapshot(null);
      } else {
        setError(
          "ยังลบไม่ได้ กรุณาปิดหน้าต่างนี้แล้วตรวจสอบออเดอร์ล่าสุดก่อนลองอีกครั้ง",
        );
      }
    } catch {
      setError("ลบออเดอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="danger order-delete-button"
        type="button"
        aria-label={"ลบออเดอร์ " + order.number}
        disabled={disabled || pending}
        onClick={() => {
          setError("");
          // Keep the displayed version fixed until the user confirms.
          setSnapshot({ ...order });
        }}
      >
        <Trash2 size={15} aria-hidden="true" /> ลบออเดอร์
      </button>
      {snapshot && (
        <dialog
          ref={dialog}
          className="order-delete-dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <h2 id={titleId}>ลบออเดอร์ {snapshot.number}?</h2>
          <div className="order-delete-summary">
            <span>ยอดออเดอร์</span>
            <strong>฿{money(snapshot.total)}</strong>
          </div>
          <p id={descriptionId}>
            ลบเฉพาะออเดอร์นี้และนำยอดออกจากรายงานอย่างถาวร
            กู้คืนผ่านหน้าเว็บไม่ได้ ออเดอร์อื่นยังอยู่เหมือนเดิม
          </p>
          {snapshot.payment === "paid" && (
            <p className="order-delete-warning">
              ออเดอร์นี้ชำระเงินแล้ว การลบข้อมูลไม่ได้คืนเงินให้ลูกค้า
            </p>
          )}
          {error && (
            <p className="order-delete-warning" role="alert">
              {error}
            </p>
          )}
          <div className="order-delete-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={close}
              autoFocus
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="order-delete-confirm"
              disabled={disabled || pending}
              onClick={() => void remove()}
            >
              {pending ? "กำลังลบ…" : "ยืนยันลบ " + snapshot.number}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
