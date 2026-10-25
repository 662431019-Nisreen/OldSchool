"use client";
import type { Dispatch, SetStateAction } from "react";
import { ShoppingBag, Plus, Minus, X } from "lucide-react";
import { Product, variants, imageFor, sweets } from "@/lib/catalog";
type Setter<T> = Dispatch<SetStateAction<T>>;
type Props = {
  selected: Product;
  setSelected: Setter<Product | null>;
  variant: string;
  setVariant: Setter<string>;
  sweet: number;
  setSweet: Setter<number>;
  qty: number;
  setQty: Setter<number>;
  note: string;
  setNote: Setter<string>;
  ready: boolean;
  config: any;
  add: () => void;
};
export default function ProductDialog({
  selected,
  setSelected,
  variant,
  setVariant,
  sweet,
  setSweet,
  qty,
  setQty,
  note,
  setNote,
  ready,
  config,
  add,
}: Props) {
  return (
    <div className="overlay" onClick={() => setSelected(null)}>
      <section
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-label={selected.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close"
          aria-label="ปิด"
          onClick={() => setSelected(null)}
        >
          <X />
        </button>
        <div className="modal-photo">
          <img src={imageFor(selected)} alt={selected.name} />
        </div>
        <div className="modal-body">
          <small className="eyebrow">{selected.en}</small>
          <div className="row">
            <h2>{selected.name}</h2>
            <b className="price">
              ฿{variants(selected).find((v) => v.id === variant)?.price}
            </b>
          </div>
          <p className="muted">
            {selected.description || "ชงสดใหม่ทุกแก้ว เลือกรูปแบบที่คุณชอบ"}
          </p>
          <h4>
            รูปแบบเครื่องดื่ม <span>เลือก 1</span>
          </h4>
          <div className="choice-row">
            {variants(selected).map((v) => (
              <button
                className={variant === v.id ? "chosen" : ""}
                onClick={() => setVariant(v.id)}
                key={v.id}
              >
                {v.label}
                <small>฿{v.price}</small>
              </button>
            ))}
          </div>
          {selected.sweet !== false && (
            <>
              <h4>
                ระดับความหวาน <span>เลือก 1</span>
              </h4>
              <div className="choice-row sweet-row">
                {(selected.sweetLevels || sweets).map((s) => (
                  <button
                    className={sweet === s ? "chosen" : ""}
                    key={s}
                    onClick={() => setSweet(s)}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="note-label">
            หมายเหตุถึงร้าน
            <input
              placeholder="เช่น น้ำแข็งน้อย (ไม่เพิ่มท็อปปิ้ง)"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <div className="quantity">
              <button
                aria-label="ลดจำนวน"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
              >
                <Minus size={16} />
              </button>
              <b>{qty}</b>
              <button
                aria-label="เพิ่มจำนวน"
                disabled={qty >= 30}
                onClick={() => setQty(qty + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className="primary"
              disabled={!ready || !config.accepting}
              onClick={add}
            >
              <ShoppingBag size={17} />
              เพิ่มลงตะกร้า{" "}
              <span>
                ฿
                {(variants(selected).find((v) => v.id === variant)?.price ||
                  0) * qty}
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
