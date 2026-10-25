"use client";
import { useRef, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Product, variants, sweets } from "@/lib/catalog";
import { api, money } from "@/lib/client";
type Props = {
  order: any;
  config: any;
  user: any;
  onClose: () => void;
  onSaved: () => Promise<void>;
};
export default function OrderEditor({
  order,
  config,
  user,
  onClose,
  onSaved,
}: Props) {
  const [items, setItems] = useState<any[]>(
    (order?.items || []).map((i: any, index: number) => ({
      ...i,
      originalIndex: index,
      key: crypto.randomUUID(),
    })),
  );
  const [type, setType] = useState(order?.type || "dinein"),
    [table, setTable] = useState(order?.table || 1),
    [adjustment, setAdjustment] = useState(String(order?.adjustment || 0)),
    [reason, setReason] = useState(""),
    [settlementMethod, setSettlementMethod] = useState(""),
    [query, setQuery] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const [idem] = useState(() => crypto.randomUUID());
  const paid = order?.payment === "paid";
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0),
    total = subtotal + Number(adjustment),
    delta = order ? total - order.total : 0;
  const products: Product[] = config.products.filter(
    (p: Product) => !p.hidden && !p.soldOut,
  );
  function update(key: string, change: any) {
    setItems((a) => a.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }
  function add(p: Product) {
    const v = variants(p)[0];
    if (!v) return;
    setItems((a) => [
      ...a,
      {
        key: crypto.randomUUID(),
        productId: p.id,
        name: p.name,
        variant: v.id,
        variantLabel: v.label,
        sweet:
          p.sweet === false
            ? null
            : (p.sweetLevels || sweets).includes(100)
              ? 100
              : (p.sweetLevels || sweets)[0],
        qty: 1,
        price: v.price,
        note: "",
      },
    ]);
    setQuery("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await api(order ? "edit-order" : "counter-order", {
        id: order?.id,
        version: order?.version,
        idem,
        type,
        table: Number(table),
        items,
        adjustment: Number(adjustment),
        reason,
        settlementMethod,
      });
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="overlay" onClick={() => !saving && onClose()}>
      <section
        className="order-editor"
        role="dialog"
        aria-modal="true"
        aria-label={
          order ? "แก้ไขออเดอร์ " + order.number : "เพิ่มออเดอร์หน้าร้าน"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <header className="row">
          <div>
            <h2>
              {order
                ? paid
                  ? "แก้ยอด / บันทึกคืนเงิน"
                  : "แก้ไขออเดอร์"
                : "เพิ่มออเดอร์หน้าร้าน"}
            </h2>
            <p className="muted">
              {order ? order.number : "รับรายการที่ลูกค้าสั่งที่เคาน์เตอร์"}
            </p>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่างออเดอร์"
            disabled={saving}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <fieldset disabled={saving}>
            <div className="editor-fields">
              <label>
                ประเภท
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="dinein">ทานที่ร้าน</option>
                  <option value="takeaway">กลับบ้าน</option>
                </select>
              </label>
              {type === "dinein" && (
                <label>
                  โต๊ะ
                  <select
                    value={table}
                    onChange={(e) => setTable(Number(e.target.value))}
                  >
                    {Array.from({ length: config.tables }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <h3>รายการสินค้า</h3>
            {!items.length && (
              <p className="muted">เลือกเมนูด้านล่างเพื่อเริ่มออเดอร์</p>
            )}
            {items.map((i, index) => {
              const p: Product | undefined = config.products.find(
                  (p: Product) => p.id === i.productId,
                ),
                options = p ? variants(p) : [];
              const oldLine =
                i.originalIndex != null ? order.items[i.originalIndex] : null;
              return (
                <div className="editor-line" key={i.key}>
                  <div className="row">
                    <b>
                      {index + 1}. {i.name}
                    </b>
                    <button
                      type="button"
                      aria-label={"ลบรายการ " + (index + 1)}
                      onClick={() =>
                        setItems((a) => a.filter((x) => x.key !== i.key))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="editor-fields">
                    <label>
                      รูปแบบ
                      <select
                        value={i.variant}
                        onChange={(e) => {
                          const v = options.find(
                            (v) => v.id === e.target.value,
                          )!;
                          update(i.key, {
                            variant: v.id,
                            variantLabel: v.label,
                            price:
                              oldLine?.variant === v.id &&
                              oldLine?.sweet === i.sweet
                                ? oldLine.price
                                : v.price,
                          });
                        }}
                      >
                        {!options.some((v) => v.id === i.variant) && (
                          <option value={i.variant}>
                            {i.variantLabel} (เดิม)
                          </option>
                        )}
                        {options.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {i.sweet !== null && (
                      <label>
                        ความหวาน
                        <select
                          value={i.sweet}
                          onChange={(e) => {
                            const sweet = Number(e.target.value);
                            update(i.key, {
                              sweet,
                              price:
                                oldLine?.sweet === sweet &&
                                oldLine?.variant === i.variant
                                  ? oldLine.price
                                  : options.find((v) => v.id === i.variant)
                                      ?.price || i.price,
                            });
                          }}
                        >
                          {Array.from(
                            new Set([...(p?.sweetLevels || sweets), i.sweet]),
                          ).map((s) => (
                            <option key={s} value={s}>
                              {s}%
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      จำนวน
                      <input
                        aria-label={"จำนวนรายการ " + (index + 1)}
                        type="number"
                        min="1"
                        max="30"
                        required
                        value={i.qty}
                        onChange={(e) =>
                          update(i.key, { qty: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    หมายเหตุ
                    <input
                      maxLength={200}
                      value={i.note}
                      onChange={(e) => update(i.key, { note: e.target.value })}
                    />
                  </label>
                  <div className="row muted">
                    <small>฿{money(i.price)} ต่อหน่วย</small>
                    <b>฿{money(i.price * i.qty)}</b>
                  </div>
                </div>
              );
            })}
            <div className="editor-add">
              <label>
                เพิ่มเมนู
                <input
                  placeholder="ค้นหาเมนูเพื่อเพิ่ม"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="editor-menu-list">
                {products
                  .filter(
                    (p) =>
                      p.name.includes(query) ||
                      p.en?.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      disabled={items.length >= 60}
                      onClick={() => add(p)}
                    >
                      <Plus size={15} />
                      {p.name}
                      <small>฿{money(variants(p)[0]?.price || 0)}</small>
                    </button>
                  ))}
              </div>
            </div>
            <div className="editor-totals">
              <div className="row">
                <span>รวมรายการ</span>
                <b>฿{money(subtotal)}</b>
              </div>
              <label>
                ปรับยอด (บาท: ลดใส่ − / เพิ่มใส่ +)
                <input
                  type="number"
                  step="1"
                  min={-subtotal}
                  max="100000"
                  required
                  value={adjustment}
                  disabled={user.role !== "admin"}
                  onChange={(e) => setAdjustment(e.target.value)}
                />
              </label>
              <label>
                {order ? "เหตุผลที่แก้ไข *" : "เหตุผลปรับราคา"}
                <input
                  maxLength={200}
                  required={!!order || Number(adjustment) !== 0}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เช่น ลูกค้าเปลี่ยนเมนู / ส่วนลดหน้าร้าน"
                />
              </label>
              <div className="row">
                <strong>ยอดสุทธิ</strong>
                <strong>฿{money(total)}</strong>
              </div>
            </div>
            {paid && delta !== 0 && (
              <div className="editor-settlement">
                <b>
                  {delta > 0 ? "ต้องรับเงินเพิ่ม" : "ต้องคืนเงิน"} ฿
                  {money(Math.abs(delta))}
                </b>
                <p>
                  บันทึกเมื่อรับเงินเพิ่มหรือคืนเงินให้ลูกค้าเรียบร้อยแล้ว
                  ระบบไม่ได้โอนเงินให้อัตโนมัติ
                </p>
                <label>
                  วิธีที่ดำเนินการแล้ว
                  <select
                    required
                    value={settlementMethod}
                    onChange={(e) => setSettlementMethod(e.target.value)}
                  >
                    <option value="">เลือกวิธี</option>
                    <option value="cash">เงินสด</option>
                    <option value="qr">QR / โอนธนาคาร</option>
                  </select>
                </label>
              </div>
            )}
            {error && (
              <p className="editor-error" role="alert">
                {error}
              </p>
            )}
            <div className="editor-footer">
              <button type="button" disabled={saving} onClick={onClose}>
                ยกเลิก
              </button>
              <button
                type="submit"
                className="primary"
                disabled={
                  saving ||
                  !items.length ||
                  !Number.isFinite(total) ||
                  total < 0
                }
              >
                {saving
                  ? "กำลังบันทึก..."
                  : paid && delta !== 0
                    ? "ยืนยันดำเนินการแล้วและบันทึกยอด"
                    : "บันทึกออเดอร์ · ฿" + money(total)}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
