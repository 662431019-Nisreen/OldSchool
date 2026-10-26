import XLSX from "xlsx-js-style";
/** Preserve real numbers while wrapping long human-readable audit snapshots. */
export function exportSheet(rows: Record<string, any>[], headers: string[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const widths = headers.map((header) => {
    if (/รายการ(ก่อน|หลัง)แก้/.test(header)) return 64;
    if (/เหตุผล|หมายเหตุ|ตัวเลือก/.test(header)) return 34;
    if (/วันที่|เวลา/.test(header)) return 28;
    if (header === "เมนู") return 28;
    return Math.max(16, Math.min(30, header.length * 1.7 + 3));
  });
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  sheet["!rows"] = [
    { hpt: 32 },
    ...rows.map((row) => {
      const lines = Math.max(
        1,
        ...headers.map((key, i) =>
          String(row[key] ?? "")
            .split("\n")
            .reduce(
              (count, line) =>
                count + Math.max(1, Math.ceil((line.length * 1.5) / widths[i])),
              0,
            ),
        ),
      );
      return { hpt: Math.min(409, Math.max(30, lines * 17 + 10)) };
    }),
  ];
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const position = XLSX.utils.decode_cell(address);
    cell.s =
      position.r === 0
        ? {
            font: {
              name: "Tahoma",
              sz: 11,
              bold: true,
              color: { rgb: "FFFFFF" },
            },
            fill: { fgColor: { rgb: "64421E" } },
            alignment: { vertical: "center", wrapText: true },
          }
        : {
            font: { name: "Tahoma", sz: 11, color: { rgb: "302A24" } },
            fill: { fgColor: { rgb: position.r % 2 ? "FFFFFF" : "FAF7F0" } },
            alignment: { vertical: "top", wrapText: true },
          };
    if (position.r > 0 && cell.t === "n") cell.z = "#,##0.##;[Red]-#,##0.##";
  }
  return sheet;
}
