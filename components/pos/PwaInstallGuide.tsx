"use client";
import { useEffect, useState } from "react";
export function deviceSupport() {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as any).standalone;
  const embedded = /Line\/|FBAN|FBAV|Instagram|Messenger|; wv\)/i.test(ua);
  return {
    ios,
    standalone,
    embedded,
    supported:
      isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
  };
}
export default function PwaInstallGuide() {
  const [device, setDevice] = useState<ReturnType<typeof deviceSupport> | null>(
    null,
  );
  useEffect(() => {
    setDevice(deviceSupport());
  }, []);
  return (
    <div className="pwa-guide">
      <h3>ติดตั้ง Old School Coffee</h3>
      {device?.embedded && (
        <p className="pwa-warning">
          กำลังเปิดผ่าน LINE / Messenger หรือเบราว์เซอร์ในแอป ให้เปิดเมนู ⋯
          แล้วเลือกเปิดใน Safari (iPhone/iPad) หรือ Chrome (Android)
        </p>
      )}
      <ol className="steps">
        {device?.ios ? (
          <>
            <li>เปิดเว็บไซต์ร้านใน Safari</li>
            <li>
              กดแชร์ → “เพิ่มไปยังหน้าจอโฮม” หากไม่พบ
              ให้เลื่อนดูรายการหรือแก้ไขเมนูแชร์
            </li>
            <li>กด “เพิ่ม” แล้วเปิด Old School Coffee จากไอคอนบนหน้าจอโฮม</li>
            <li>หากไม่มีโต๊ะ ให้กด “สแกน QR โต๊ะ” ในแอปแล้วถ่ายรูป QR ที่โต๊ะ</li>
            <li>สั่งเครื่องดื่ม แล้วกด “เปิดรับการแจ้งเตือน” ในหน้าออเดอร์</li>
          </>
        ) : (
          <>
            <li>เปิดเว็บไซต์ร้านใน Chrome หรือเบราว์เซอร์ที่รองรับ</li>
            <li>กดเมนู ⋮ → “ติดตั้งแอป” หรือ “เพิ่มลงหน้าจอหลัก”</li>
            <li>เปิดจากไอคอน แล้วกดเปิดรับการแจ้งเตือนในหน้าออเดอร์</li>
          </>
        )}
      </ol>
      <p className="muted">
        iPhone/iPad ต้องใช้ iOS/iPadOS 16.4 ขึ้นไปและเปิดจากหน้าจอโฮม
        แนะนำติดตั้งก่อนสั่งออเดอร์ เพราะ Safari
        และแอปบนหน้าจอโฮมอาจใช้ข้อมูลคนละชุด หากสั่งแล้ว ให้คัดลอกลิงก์ติดตามไว้
        แล้วเปิดแอปจากไอคอน → ออเดอร์ของฉัน → วางลิงก์ติดตามออเดอร์
      </p>
      <p className="muted">
        แม้ไม่ติดตั้งหรือไม่เปิดแจ้งเตือน ยังสั่งและติดตามสถานะผ่านเว็บไซต์ได้
        ระบบต้องใช้อินเทอร์เน็ตในการส่งออเดอร์
      </p>
    </div>
  );
}
