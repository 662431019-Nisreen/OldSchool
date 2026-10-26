"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/client";
import PwaInstallGuide, { deviceSupport } from "./PwaInstallGuide";
export default function PushPanel({ orders }: { orders: any[] }) {
  const [device, setDevice] = useState<ReturnType<typeof deviceSupport> | null>(
      null,
    ),
    [key, setKey] = useState<string | null>(null),
    [checked, setChecked] = useState(false),
    [registered, setRegistered] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = orders.filter((o) => o.status !== "done"),
    tokens = active.map((o) => o.token).sort(),
    tokenKey = tokens.join(",");
  useEffect(() => {
    setDevice(deviceSupport());
    api("push-key")
      .then((d) => setKey(d.key))
      .catch(() =>
        setMessage("ตรวจสอบระบบแจ้งเตือนไม่สำเร็จ ติดตามสถานะผ่านหน้านี้ได้"),
      )
      .finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (
          !("serviceWorker" in navigator) ||
          !("Notification" in window) ||
          Notification.permission !== "granted"
        ) {
          if (!cancelled) setRegistered([]);
          return;
        }
        const sw = await navigator.serviceWorker.getRegistration("/");
        const sub = await sw?.pushManager.getSubscription();
        if (sub) {
          const d = await api("push-registration", { endpoint: sub.endpoint });
          if (!cancelled) setRegistered(d.registered);
        } else if (!cancelled) setRegistered([]);
      } catch {
        if (!cancelled) setRegistered([]);
      }
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tokenKey]);
  const complete =
    tokens.length > 0 && tokens.every((t) => registered.includes(t));
  const canPush =
    device?.supported && !device.embedded && (!device.ios || device.standalone);
  async function enable() {
    if (busy || !key || !canPush || !tokens.length) return;
    setBusy(true);
    setMessage("");
    try {
      // Permission request is deliberately before any await, preserving the tap gesture on Safari.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setRegistered([]);
        setMessage(
          "ยังไม่ได้อนุญาตแจ้งเตือน หากเคยปฏิเสธ ให้เปลี่ยนสิทธิ์ในตั้งค่าของเบราว์เซอร์/อุปกรณ์ ติดตามออเดอร์ผ่านหน้านี้ได้",
        );
        return;
      }
      const sw = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error("Service Worker ยังไม่พร้อม กรุณาโหลดหน้าใหม่")),
            10000,
          ),
        ),
      ]);
      let sub = await sw.pushManager.getSubscription();
      const raw = Uint8Array.from(
        atob(
          key.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (key.length % 4)) % 4),
        ),
        (c) => c.charCodeAt(0),
      );
      if (sub?.options.applicationServerKey) {
        const old = new Uint8Array(sub.options.applicationServerKey);
        if (old.length !== raw.length || old.some((x, i) => x !== raw[i])) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub)
        sub = await sw.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: raw,
        });
      const d = await api("subscribe", { subscription: sub.toJSON(), tokens });
      if (!d.ok || !tokens.every((t) => d.registered?.includes(t)))
        throw new Error("ยังลงทะเบียนออเดอร์ไม่ครบ");
      setRegistered(d.registered);
      setMessage(
        "ลงทะเบียนรับแจ้งเตือนสำหรับออเดอร์นี้แล้ว การแสดงแจ้งเตือนขึ้นอยู่กับการเชื่อมต่อและการตั้งค่าของอุปกรณ์",
      );
    } catch (e: any) {
      setRegistered([]);
      setMessage(
        "ยังเปิดแจ้งเตือนไม่สำเร็จ: " +
          e.message +
          " ติดตามสถานะผ่านเว็บไซต์ได้",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!orders.length) return null;
  return (
    <div className="push-panel">
      <div className="push-panel-heading">
        <Bell size={21} />
        <div>
          <b>แจ้งเมื่อเครื่องดื่มพร้อมรับ</b>
          <p>ปิดหน้าเว็บได้หลังลงทะเบียนรับแจ้งเตือนสำเร็จ</p>
        </div>
      </div>
      {!device || !checked ? (
        <p className="muted">กำลังตรวจสอบการรองรับแจ้งเตือน...</p>
      ) : !active.length ? (
        <p className="muted">
          ออเดอร์เสร็จสิ้นแล้ว ไม่ต้องเปิดแจ้งเตือนเพิ่มเติม
        </p>
      ) : !canPush ? (
        <>
          <p className="pwa-warning">
            {device.embedded
              ? "เปิดใน Safari หรือ Chrome ก่อน เพื่อใช้งานการแจ้งเตือน"
              : device.ios && !device.standalone
                ? "iPhone / iPad: เพิ่มเว็บไซต์ลงหน้าจอโฮม แล้วเปิดจากไอคอนก่อนรับแจ้งเตือน"
                : "อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับ Web Push ติดตามสถานะผ่านเว็บไซต์ได้ตามปกติ"}
          </p>
          <details>
            <summary>วิธีติดตั้งและเปิดจากเบราว์เซอร์ที่รองรับ</summary>
            <PwaInstallGuide />
          </details>
        </>
      ) : !key ? (
        <p className="pwa-warning">
          ระบบแจ้งเตือนยังไม่พร้อม ติดตามสถานะออเดอร์ผ่านหน้านี้ได้
        </p>
      ) : (
        <button
          className="primary"
          disabled={busy || complete}
          onClick={enable}
        >
          {busy
            ? "กำลังลงทะเบียน..."
            : complete
              ? "ลงทะเบียนแจ้งเตือนออเดอร์นี้แล้ว"
              : "เปิดรับการแจ้งเตือน"}
        </button>
      )}
      {message && (
        <p role="status" className="push-feedback">
          {message}
        </p>
      )}
      <p className="muted">
        หากไม่รับแจ้งเตือน ให้ดูหมายเลขคิวและสถานะบนหน้านี้ได้เสมอ
      </p>
    </div>
  );
}
