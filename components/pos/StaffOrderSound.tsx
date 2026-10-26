"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { createArrivalTracker, playOrderChime } from "@/lib/staff-sound";

export function useStaffOrderSound(staffKey: string | null) {
  const audio = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const tracker = useRef(createArrivalTracker());
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [latest, setLatest] = useState("");
  useEffect(() => {
    tracker.current = createArrivalTracker();
    enabledRef.current = false;
    setEnabled(false); setMessage(""); setLatest("");
    return () => {
      enabledRef.current = false;
      const context = audio.current;
      audio.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, [staffKey]);
  const receiveOrders = useCallback((orders: { id: number | string; status: string }[]) => {
    const count = tracker.current(orders);
    if (!count) return;
    setLatest(`มีออเดอร์ใหม่ ${count} รายการ`);
    if (!enabledRef.current) return;
    try {
      if (!audio.current || !playOrderChime(audio.current)) {
        enabledRef.current = false; setEnabled(false);
        setMessage("เสียงถูกพัก กรุณากดเปิดเสียงอีกครั้ง");
      }
    } catch {
      enabledRef.current = false; setEnabled(false);
      setMessage("เล่นเสียงไม่ได้ กรุณากดเปิดเสียงอีกครั้ง");
    }
  }, []);
  const test = async () => {
    try {
      const AudioConstructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioConstructor) throw new Error();
      if (!audio.current || audio.current.state === "closed") audio.current = new AudioConstructor();
      const context = audio.current!;
      await context.resume();
      // The user may leave the staff screen while a resume request is pending.
      if (audio.current !== context) return;
      if (!playOrderChime(context)) throw new Error();
      enabledRef.current = true; setEnabled(true); setMessage("");
    } catch {
      enabledRef.current = false; setEnabled(false);
      setMessage("เปิดเสียงไม่ได้ ตรวจสอบเสียงเครื่อง แล้วลองกดอีกครั้ง");
    }
  };
  const mute = () => {
    enabledRef.current = false; setEnabled(false); setMessage("");
    void audio.current?.suspend().catch(() => {});
  };
  return { receiveOrders, enabled, message, latest, test, mute };
}
export default function StaffOrderSound({ sound }: { sound: ReturnType<typeof useStaffOrderSound> }) {
  return <section className="staff-order-sound" aria-label="เสียงออเดอร์ใหม่">
    <div className="staff-sound-actions">
      <button type="button" className={sound.enabled ? "secondary" : "primary"}
        aria-pressed={sound.enabled} onClick={sound.enabled ? sound.mute : sound.test}>
        {sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        {sound.enabled ? "ปิดเสียงออเดอร์ใหม่" : "เปิดเสียงออเดอร์ใหม่"}
      </button>
      {sound.enabled && <button type="button" className="secondary" onClick={sound.test}>ทดสอบเสียง</button>}
      <span role="status">{sound.latest || (sound.enabled ? "เปิดเสียงแล้ว" : "กดเปิดเสียง 1 ครั้งเมื่อเข้าหน้านี้")}</span>
    </div>
    <small>เปิดหน้าทำงานร้านค้างไว้และเปิดเสียงเครื่อง ขณะล็อกจอหรือปิดเว็บเสียงอาจไม่ดัง</small>
    {sound.message && <p role="alert">{sound.message}</p>}
  </section>;
}
