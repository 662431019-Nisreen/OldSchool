"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createArrivalTracker, playOrderChime } from "@/lib/staff-sound";

export function useStaffOrderSound(staffKey: string | null) {
  const audio = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const pushActiveRef = useRef(false);
  const setPushActive = useCallback((value: boolean) => {
    pushActiveRef.current = value;
  }, []);
  const tracker = useRef(createArrivalTracker());
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [latest, setLatest] = useState("");
  useEffect(() => {
    tracker.current = createArrivalTracker();
    pushActiveRef.current = false;
    enabledRef.current = false;
    setEnabled(false);
    setMessage("");
    setLatest("");
    return () => {
      enabledRef.current = false;
      const context = audio.current;
      audio.current = null;
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    };
  }, [staffKey]);
  const receiveOrders = useCallback(
    (orders: { id: number | string; status: string }[]) => {
      const count = tracker.current(orders);
      if (!count) return;
      setLatest(`มีออเดอร์ใหม่ ${count} รายการ`);
      if (!enabledRef.current || pushActiveRef.current) return;
      try {
        if (!audio.current || !playOrderChime(audio.current)) {
          enabledRef.current = false;
          setEnabled(false);
          setMessage("เสียงถูกพัก กรุณากดเปิดเสียงอีกครั้ง");
        }
      } catch {
        enabledRef.current = false;
        setEnabled(false);
        setMessage("เล่นเสียงไม่ได้ กรุณากดเปิดเสียงอีกครั้ง");
      }
    },
    [],
  );
  const test = async () => {
    try {
      const AudioConstructor =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioConstructor) throw new Error();
      if (!audio.current || audio.current.state === "closed")
        audio.current = new AudioConstructor();
      const context = audio.current!;
      await context.resume();
      // The user may leave the staff screen while a resume request is pending.
      if (audio.current !== context) return;
      if (!playOrderChime(context)) throw new Error();
      enabledRef.current = true;
      setEnabled(true);
      setMessage("");
      return true;
    } catch {
      enabledRef.current = false;
      setEnabled(false);
      setMessage("เปิดเสียงไม่ได้ ตรวจสอบเสียงเครื่อง แล้วลองกดอีกครั้ง");
      return false;
    }
  };
  const mute = () => {
    enabledRef.current = false;
    setEnabled(false);
    setMessage("");
    void audio.current?.suspend().catch(() => {});
  };
  return { receiveOrders, enabled, message, latest, test, mute, setPushActive };
}
