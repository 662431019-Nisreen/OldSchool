"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";
import { deviceSupport } from "./PwaInstallGuide";
import type { useStaffOrderSound } from "./StaffOrderSound";

type Sound = ReturnType<typeof useStaffOrderSound>;
export default function StaffPushPanel({ sound }: { sound: Sound }) {
  const [device, setDevice] = useState<ReturnType<typeof deviceSupport> | null>(
    null,
  );
  const [key, setKey] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mutation = useRef(0),
    working = useRef(false);
  const { setPushActive } = sound;
  useEffect(() => {
    let cancelled = false;
    setDevice(deviceSupport());
    api("push-key")
      .then((d) => {
        if (!cancelled) setKey(d.key);
      })
      .catch(() => {
        if (!cancelled)
          setMessage("ยังตรวจระบบแจ้งเตือนไม่ได้ กรุณาโหลดหน้าใหม่");
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    const check = async () => {
      if (working.current) return;
      const revision = mutation.current;
      try {
        let active = false;
        if (
          "Notification" in window &&
          Notification.permission === "granted" &&
          "serviceWorker" in navigator
        ) {
          const sw = await navigator.serviceWorker.getRegistration("/");
          const sub = await sw?.pushManager.getSubscription();
          if (sub)
            active = !!(
              await api("staff-push-state", { endpoint: sub.endpoint })
            ).registered;
        }
        if (!cancelled && revision === mutation.current) {
          setRegistered(active);
          setPushActive(active);
        }
      } catch {
        if (!cancelled && revision === mutation.current)
          setMessage(
            "ตรวจสถานะเครื่องนี้ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วโหลดหน้าใหม่",
          );
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
      setPushActive(false);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [setPushActive]);
  const supported =
    device?.supported && !device.embedded && (!device.ios || device.standalone);
  const enable = async () => {
    if (working.current) return;
    working.current = true;
    mutation.current++;
    setBusy(true);
    setMessage("");
    // Start both browser permission/AudioContext operations during the same tap gesture.
    try {
      const permission =
        supported && key
          ? Notification.requestPermission()
          : Promise.resolve(null);
      const audio = sound.test();
      const [permissionResult, audioReady] = await Promise.all([
        permission,
        audio,
      ]);
      if (!supported || !key) {
        setMessage(
          audioReady
            ? "เปิดเสียงขณะใช้งานแล้ว ดูวิธีรับแจ้งเตือนตอนล็อกจอในรายละเอียด"
            : "ยังเปิดเสียงไม่ได้ ตรวจสอบการตั้งค่าเครื่อง",
        );
        return;
      }
      if (permissionResult !== "granted")
        throw new Error(
          "ยังไม่ได้อนุญาตแจ้งเตือน ตรวจสิทธิ์ของแอปในการตั้งค่าเครื่อง",
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
        throw new Error("ลงทะเบียนเครื่องไม่สำเร็จ");
      setRegistered(true);
      setPushActive(true);
      setMessage("");
    } catch (error: any) {
      setRegistered(false);
      setPushActive(false);
      setMessage("ยังไม่พร้อมแจ้งตอนล็อกจอ: " + error.message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const disable = async () => {
    if (working.current) return;
    working.current = true;
    mutation.current++;
    setBusy(true);
    setMessage("");
    try {
      const sub =
        "serviceWorker" in navigator
          ? await (
              await navigator.serviceWorker.getRegistration("/")
            )?.pushManager.getSubscription()
          : null;
      await api("staff-push-disable", { endpoint: sub?.endpoint });
      sound.mute();
      setPushActive(false);
      setRegistered(false);
    } catch {
      setMessage("ปิดแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="shop-notifications" aria-label="การแจ้งเตือนร้าน">
      <div className="shop-notification-main">
        {registered ? <CheckCircle2 size={21} /> : <Bell size={21} />}
        <div className="shop-notification-status">
          <b>
            {registered
              ? "เปิดแจ้งเตือนร้านแล้ว"
              : sound.enabled
                ? "แจ้งเตือนเฉพาะตอนเปิดเว็บ"
                : "การแจ้งเตือนร้าน"}
          </b>
          <small>
            {!checked
              ? "กำลังตรวจสอบเครื่องนี้…"
              : registered
                ? "ออเดอร์ใหม่จะแจ้งที่เครื่องนี้ แม้ล็อกจอ"
                : sound.enabled
                  ? "ตอนล็อกจอยังไม่พร้อม ดูวิธีเปิดในรายละเอียด"
                  : "เปิดครั้งเดียวสำหรับเครื่องของร้าน"}
          </small>
        </div>
        {!registered && (
          <button
            type="button"
            className="primary"
            disabled={busy || !checked}
            onClick={enable}
          >
            {busy ? "กำลังเปิด…" : "เปิดแจ้งเตือนร้าน"}
          </button>
        )}
        <details className="shop-notification-details">
          <summary>รายละเอียด</summary>
          <p>
            ระบบจำเครื่องนี้ไว้ ไม่ต้องเปิดใหม่ทุก 12 ชั่วโมง เมื่อกลับเข้าแอป
            ระบบจะตรวจสถานะให้อัตโนมัติ
          </p>
          {!supported && (
            <p>
              {device?.embedded
                ? "เปิดใน Safari ก่อน"
                : "iPad / iPhone: เปิดหน้าแอดมินใน Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม → เปิดไอคอน Old School ร้าน แล้วเข้าสู่ระบบ"}{" "}
              ต้องใช้ iOS/iPadOS 16.4 ขึ้นไป
            </p>
          )}
          {checked && !key && (
            <p>ระบบส่งแจ้งเตือนยังไม่พร้อม ตอนนี้ใช้เสียงขณะเปิดเว็บได้</p>
          )}
          <p>
            เปิดเสียงแจ้งเตือนของเครื่องและตรวจโหมดโฟกัส
            เสียงตอนล็อกจอเป็นเสียงของระบบ
            การออกจากระบบหรือปิดแจ้งเตือนจะหยุดแจ้งที่เครื่องนี้
          </p>
          <div className="shop-notification-tools">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={sound.test}
            >
              ทดสอบเสียง
            </button>
            {(registered || sound.enabled) && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={disable}
              >
                ปิดแจ้งเตือนร้าน
              </button>
            )}
          </div>
        </details>
      </div>
      {(message || sound.message) && (
        <p role="status" className="shop-notification-feedback">
          {message || sound.message}
        </p>
      )}
      {sound.latest && (
        <span className="sr-only" role="status">
          {sound.latest}
        </span>
      )}
    </section>
  );
}
