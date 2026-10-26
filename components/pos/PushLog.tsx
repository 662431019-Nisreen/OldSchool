"use client";
import { useState } from "react";
import { api } from "@/lib/client";
const labels: Record<string, string> = {
  queued: "รอส่ง",
  sending: "กำลังส่ง / ยังไม่ทราบผล",
  accepted: "บริการ Push รับคำขอแล้ว",
  failed: "ส่งไม่สำเร็จ",
  expired: "อุปกรณ์หมดอายุ",
  no_devices: "ยังไม่มีอุปกรณ์ลงทะเบียน",
  not_configured: "ระบบ Push ยังไม่พร้อม",
  duplicate: "ข้ามคำขอซ้ำ",
  skipped: "ข้ามเพราะสถานะเปลี่ยนหรือแจ้งเตือนเก่าแล้ว",
};
export default function PushLog({ id }: { id: number }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      const d = await api("push-logs&id=" + id);
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <details
      className="push-log"
      onToggle={(e) => {
        if (e.currentTarget.open) load();
      }}
    >
      <summary>ผลการแจ้งเตือน</summary>
      <p>
        “รับคำขอแล้ว” หมายถึงบริการ Push รับข้อมูลแล้ว
        ยังไม่ใช่การยืนยันว่าอุปกรณ์แสดงหรือเปิดอ่าน
      </p>
      {error && <p>{error}</p>}
      {!data && !error && <p>กำลังโหลด...</p>}
      {data && !data.events.length && (
        <p>ยังไม่มีประวัติการส่งสำหรับออเดอร์นี้</p>
      )}
      {data?.events.map((event: any) => (
        <div key={event.id}>
          <b>
            {event.kind === "staff_new"
              ? "ออเดอร์ใหม่ → ทีมร้าน"
              : event.kind === "manual"
                ? "พนักงานเรียกซ้ำ"
                : "แจ้งลูกค้าอัตโนมัติ"}
          </b>{" "}
          · {labels[event.status] || event.status}
          <small>{new Date(event.created).toLocaleString("th-TH")}</small>
          {data.deliveries
            .filter((d: any) => d.event_id === event.id)
            .map((d: any, i: number) => (
              <p key={i}>
                {labels[d.status] || d.status}
                {d.http_status ? " · HTTP " + d.http_status : ""}
                {d.error ? " · " + d.error : ""}
              </p>
            ))}
        </div>
      ))}
      <button type="button" onClick={load}>
        โหลดผลล่าสุด
      </button>
    </details>
  );
}
