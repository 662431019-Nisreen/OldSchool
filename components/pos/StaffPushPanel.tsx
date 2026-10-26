"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/client";
import { deviceSupport } from "./PwaInstallGuide";

export default function StaffPushPanel() {
  const [device, setDevice] = useState<ReturnType<typeof deviceSupport> | null>(
    null,
  );
  const [key, setKey] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setDevice(deviceSupport());
    api("push-key")
      .then((d) => {
        if (!cancelled) setKey(d.key);
      })
      .catch(() => {
        if (!cancelled)
          setMessage("ตรวจสอบระบบ Push ไม่ได้ กรุณาลองโหลดหน้าใหม่");
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    const check = async () => {
      try {
        if (
          !("Notification" in window) ||
          Notification.permission !== "granted" ||
          !("serviceWorker" in navigator)
        ) {
          if (!cancelled) setRegistered(false);
          return;
        }
        const sw = await navigator.serviceWorker.getRegistration("/");
        const sub = await sw?.pushManager.getSubscription();
        const result = sub
          ? await api("staff-push-state", { endpoint: sub.endpoint })
          : null;
        if (!cancelled) setRegistered(!!result?.registered);
      } catch {
        if (!cancelled) setRegistered(false);
      }
    };
    check();
    const visible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(check, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const supported =
    device?.supported && !device.embedded && (!device.ios || device.standalone);
  const enable = async () => {
    if (busy || !supported || !key) return;
    setBusy(true);
    setMessage("");
    try {
      // Keep permission request directly inside the explicit button gesture.
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "ยังไม่ได้อนุญาตแจ้งเตือน กรุณาตรวจสิทธิ์แจ้งเตือนในการตั้งค่าเครื่อง",
        );
      const sw = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("ระบบยังไม่พร้อม กรุณาโหลดหน้าใหม่")),
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
      const result = await api("staff-push-register", {
        subscription: sub.toJSON(),
      });
      if (!result.ok || !result.registered)
        throw new Error("ลงทะเบียนอุปกรณ์ไม่สำเร็จ");
      setRegistered(true);
      setMessage(
        "ลงทะเบียนเครื่องนี้แล้ว ออเดอร์ใหม่จะส่งแจ้งเตือนมาที่เครื่องนี้ แม้ล็อกจอ ทั้งนี้ขึ้นอยู่กับอินเทอร์เน็ตและการตั้งค่าเครื่อง",
      );
    } catch (error: any) {
      setRegistered(false);
      setMessage("ยังเปิด Push ไม่สำเร็จ: " + error.message);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const sub = await (
        await navigator.serviceWorker.getRegistration("/")
      )?.pushManager.getSubscription();
      if (sub) await api("staff-push-disable", { endpoint: sub.endpoint });
      // Keep the browser subscription: customer order alerts may share this device.
      setRegistered(false);
      setMessage("ปิด Push ออเดอร์ใหม่บนเครื่องนี้แล้ว");
    } catch {
      setMessage("ปิด Push ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="staff-push-panel" aria-label="แจ้งเตือนร้านขณะล็อกจอ">
      <div className="push-panel-heading">
        <Bell size={21} />
        <div>
          <b>แจ้งออเดอร์ใหม่ แม้ล็อกจอ</b>
          <p>สำหรับ iPad / เครื่องของร้าน</p>
        </div>
      </div>
      {!device || !checked ? (
        <p>กำลังตรวจสอบ…</p>
      ) : !supported ? (
        <>
          <p>
            iPad: เปิดหน้าแอดมินใน Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม
            แล้วเปิดจากไอคอนและเข้าสู่ระบบก่อนกดเปิด Push
          </p>
          <small>
            ต้องใช้ iPadOS 16.4 ขึ้นไป หากเคยติดตั้งหน้าลูกค้าไว้
            ให้เพิ่มหน้าแอดมินเป็นอีกไอคอนชื่อ Old School ร้าน
          </small>
        </>
      ) : !key ? (
        <p>ระบบ Push ยังไม่พร้อม กรุณาลองใหม่ภายหลัง</p>
      ) : (
        <button
          type="button"
          className={registered ? "secondary" : "primary"}
          disabled={busy}
          onClick={registered ? disable : enable}
        >
          {busy
            ? "กำลังดำเนินการ…"
            : registered
              ? "ปิด Push ออเดอร์ใหม่บนเครื่องนี้"
              : "เปิด Push ออเดอร์ใหม่บนเครื่องนี้"}
        </button>
      )}
      {registered && (
        <p className="staff-push-confirmed">
          ลงทะเบียนรับ Push ออเดอร์ใหม่บนเครื่องนี้แล้ว
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <small>
        เสียงแจ้งเตือนใช้เสียงของระบบ iPad เปิดเสียงแจ้งเตือนและตรวจโหมดโฟกัส /
        ห้ามรบกวน การออกจากระบบหรือหมดเวลาเข้าสู่ระบบ (12 ชั่วโมง) จะหยุด Push
        ให้เข้าสู่ระบบและเปิด Push ใหม่ก่อนเริ่มงาน
      </small>
    </section>
  );
}
