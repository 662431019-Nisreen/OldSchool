"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export default function ResetOrders() {
  const [snapshot, setSnapshot] = useState<{count: number; cutoff: number} | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function preview() {
    setBusy(true);
    setMessage("");
    setConfirmation("");
    try { setSnapshot(await api("reset-orders-preview")); }
    catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!snapshot || busy || confirmation !== "ล้างออเดอร์ทั้งหมด") return;
    if (!window.confirm(`ลบออเดอร์ ${snapshot.count} รายการ รวมยอดขายและประวัติของรายการเหล่านี้บนเว็บไซต์นี้อย่างถาวร? เมนู โต๊ะ และบัญชีผู้ใช้จะยังอยู่`)) return;
    setBusy(true);
    try {
      const result = await api("reset-orders", {cutoff: snapshot.cutoff, confirmation});
      setSnapshot(null);
      setConfirmation("");
      setMessage(`ล้างออเดอร์แล้ว ${result.deleted} รายการ กรุณาโหลดหน้าใหม่เพื่อดูยอดล่าสุด`);
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <details className="panel">
    <summary>ล้างข้อมูลออเดอร์</summary>
    <p>ลบออเดอร์ ยอดขาย ประวัติแก้ไข และแจ้งเตือนของออเดอร์อย่างถาวร เก็บเมนู รูปสินค้า โต๊ะ บัญชี และการแจ้งเตือนเครื่องของร้านไว้</p>
    <p>เมื่อล้างจนไม่มีออเดอร์ คิวถัดไปจะเริ่มที่ OS-0001</p>
    <button type="button" disabled={busy} onClick={preview}>ตรวจสอบก่อนล้างออเดอร์</button>
    {snapshot && <div className="form-grid">
      <p>พบ {snapshot.count} ออเดอร์ (ถึงหมายเลข {snapshot.cutoff}) ออเดอร์ใหม่หลังจากตรวจสอบนี้จะไม่ถูกลบ</p>
      {snapshot.count === 0 && <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await api("restart-order-queue", {}); setMessage("ตั้งค่าคิวถัดไปเป็น OS-0001 แล้ว"); }
        catch (e: any) { setMessage(e.message); }
        finally { setBusy(false); }
      }}>เริ่มคิวใหม่ที่ 1</button>}
      {snapshot.count > 0 && <>
        <label>พิมพ์ “ล้างออเดอร์ทั้งหมด” เพื่อยืนยัน
          <input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" disabled={busy || confirmation !== "ล้างออเดอร์ทั้งหมด"} onClick={reset}>ล้างออเดอร์ถาวร</button>
      </>}
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
