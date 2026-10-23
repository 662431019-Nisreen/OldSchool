"use client";
import { useState, useEffect } from "react";
export default function TableQr({ table }: { table: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    import("qrcode")
      .then((q) =>
        q.toDataURL(location.origin + "/?table=" + table, {
          width: 240,
          margin: 2,
          color: { dark: "#3b2b1e", light: "#ffffff" },
        }),
      )
      .then(setUrl);
  }, [table]);
  return (
    <div className="table-qr">
      <b>OLD SCHOOL • โต๊ะ {table}</b>
      {url && <img src={url} alt={"QR โต๊ะ " + table} />}
      <a href={url} download={"old-school-table-" + table + ".png"}>
        ดาวน์โหลด QR
      </a>
    </div>
  );
}
