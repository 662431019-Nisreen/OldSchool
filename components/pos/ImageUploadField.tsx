"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  value?: string;
  label?: string;
  disabled?: boolean;
  onUploaded: (url: string) => void;
  onPendingChange?: (pending: boolean) => void;
};

export default function ImageUploadField({
  value,
  label = "รูปสินค้า",
  disabled = false,
  onUploaded,
  onPendingChange,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const callbacks = useRef({ onUploaded, onPendingChange });
  callbacks.current = { onUploaded, onPendingChange };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
      controller.current?.abort();
      controller.current = null;
      callbacks.current.onPendingChange?.(false);
    };
  }, []);

  async function upload(file?: File) {
    if (!file || disabled) return;
    const requestId = ++sequence.current;
    controller.current?.abort();
    controller.current = null;
    setError("");
    setUploaded(false);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 1024 * 1024
    ) {
      setPending(false);
      callbacks.current.onPendingChange?.(false);
      setError("ยังไม่ได้อัปโหลดรูปใหม่ ใช้ JPG PNG หรือ WebP ขนาดไม่เกิน 1MB");
      return;
    }
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    // Notify the parent before the first await so it can block an early save.
    callbacks.current.onPendingChange?.(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
        signal: nextController.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      const result =
        data !== null && typeof data === "object"
          ? (data as Record<string, unknown>)
          : null;
      const message = typeof result?.error === "string" ? result.error : "";
      const url = typeof result?.url === "string" ? result.url : "";
      if (!response.ok || message)
        throw new Error(message || "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
      if (!url) throw new Error("ไม่ได้รับลิงก์รูปภาพ กรุณาลองใหม่");
      if (
        !mounted.current ||
        requestId !== sequence.current ||
        nextController.signal.aborted
      )
        return;
      callbacks.current.onUploaded(url);
      setUploaded(true);
    } catch (cause) {
      if (
        mounted.current &&
        requestId === sequence.current &&
        !nextController.signal.aborted
      )
        setError(
          cause instanceof Error
            ? cause.message
            : "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่",
        );
    } finally {
      if (mounted.current && requestId === sequence.current) {
        controller.current = null;
        setPending(false);
        callbacks.current.onPendingChange?.(false);
      }
    }
  }

  return (
    <div className="image-upload-field" aria-busy={pending}>
      <label>
        {label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void upload(file);
          }}
        />
      </label>
      {value && <img className="upload-preview" src={value} alt={label} />}
      <div aria-live="polite">
        {pending && <p role="status">กำลังอัปโหลดรูป… กรุณารอก่อนบันทึก</p>}
        {!pending && uploaded && (
          <p role="status">อัปโหลดแล้ว กดบันทึกเพื่อใช้งาน</p>
        )}
      </div>
      {error && (
        <p role="alert">
          {error}
          {value ? " รูปเดิมยังอยู่" : " กรุณาเลือกไฟล์แล้วอัปโหลดใหม่"}
        </p>
      )}
    </div>
  );
}
