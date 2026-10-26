"use client";
import { useRef, useState } from "react";
import { qrContext, type OrderContext } from "@/lib/order-context";

export default function TableContext({ table, type, maxTables, onChange }: {
  table: number; type: string; maxTables: number; onChange: (value: OrderContext) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = (value: string) => {
    const context = qrContext(value.trim(), location.origin, maxTables);
    if (!context) { setError("ไม่พบ QR โต๊ะของร้านนี้ กรุณาสแกน QR ที่โต๊ะ หรือวางลิงก์ที่ได้จาก QR ของร้าน"); return; }
    onChange(context); setError(""); setExpanded(false); setLink("");
  };
  const scan = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = objectUrl; await image.decode();
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { default: jsQR } = await import("jsqr");
      const result = jsQR(pixels.data, pixels.width, pixels.height);
      if (!result) { setError("อ่าน QR ไม่ได้ ลองถ่ายให้ QR อยู่เต็มภาพและชัดเจน หรือวางลิงก์จาก Safari ด้านล่าง"); return; }
      apply(result.data);
    } catch { setError("อ่านภาพไม่ได้ กรุณาลองใหม่ หรือวางลิงก์จาก QR ด้านล่าง"); }
    finally { URL.revokeObjectURL(objectUrl); setBusy(false); if (input.current) input.current.value = ""; }
  };
  const valid = type === "takeaway" || (table > 0 && table <= maxTables);
  return <section className="table-context" aria-label="โต๊ะสำหรับออเดอร์">
    <div className="row"><strong>{type === "takeaway" ? "รับกลับบ้าน" : valid ? `โต๊ะ ${table}` : "ยังไม่ได้สแกนโต๊ะ"}</strong>
      <button type="button" onClick={() => setExpanded(!expanded)}>{valid ? "สแกนโต๊ะใหม่" : "สแกน QR โต๊ะ"}</button></div>
    {(expanded || !valid) && <div className="table-context-tools">
      <p>เปิดจากหน้าจอโฮมแล้ว ให้สแกน QR ในแอปนี้ โดยถ่ายรูป QR ที่โต๊ะ หรือเลือกรูป QR ที่บันทึกไว้</p>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => scan(e.target.files?.[0])} />
      <button className="primary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "กำลังอ่าน QR…" : "ถ่ายรูป / เลือกรูป QR"}</button>
      <details><summary>มีลิงก์ QR จาก Safari แล้ว?</summary>
        <form onSubmit={e => { e.preventDefault(); apply(link); }}><label>วางลิงก์จาก QR ของร้าน<input type="url" required value={link} onChange={e => setLink(e.target.value)} placeholder="https://…/?table=…" /></label><button type="submit">ใช้โต๊ะจากลิงก์</button></form>
      </details>
    </div>}
    {valid && <small>ตรวจสอบโต๊ะก่อนสั่ง หากย้ายโต๊ะให้สแกนใหม่</small>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
