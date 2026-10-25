"use client";
import { useState, useEffect } from "react";
export default function TableQr({ table }: { table?: number }) {
  const [url, setUrl] = useState("");
  const label = table ? "โต๊ะ " + table : "Takeaway · รับกลับบ้าน";
  useEffect(() => {
    import("qrcode")
      .then((q) =>
        q.toDataURL(
          location.origin + (table ? "/?table=" + table : "/?type=takeaway"),
          {
            width: 240,
            margin: 2,
            color: { dark: "#3b2b1e", light: "#ffffff" },
          },
        ),
      )
      .then(setUrl);
  }, [table]);
  return (
    <div className="table-qr">
      <b>OLD SCHOOL • {label}</b>
      {url && <img src={url} alt={"QR " + label} />}
      <a
        href={url}
        download={
          "old-school-" + (table ? "table-" + table : "takeaway") + ".png"
        }
      >
        ดาวน์โหลด QR
      </a>
    </div>
  );
}
