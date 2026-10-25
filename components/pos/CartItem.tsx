"use client";
import { Minus, Plus } from "lucide-react";
import { imageFor, type Product } from "@/lib/catalog";
import { money } from "@/lib/client";
type Props = {
  line: {
    name: string;
    qty: number;
    price: number;
    variantLabel: string;
    sweet: number;
    note: string;
  };
  product?: Product;
  onEdit: () => void;
  onDecrease: () => void;
  onIncrease: () => void;
};
export default function CartItem({
  line,
  product,
  onEdit,
  onDecrease,
  onIncrease,
}: Props) {
  return (
    <article className="cart-item cart-item-with-photo" aria-label={line.name}>
      <img
        className="cart-item-photo"
        src={product ? imageFor(product) : "/assets/logo.png"}
        alt={line.name}
      />
      <div className="cart-item-info">
        <div className="cart-item-heading">
          <h3>{line.name}</h3>
          <strong>฿{money(line.price * line.qty)}</strong>
        </div>
        <ul className="cart-item-options">
          {line.variantLabel !== "ปกติ" && <li>{line.variantLabel}</li>}
          {product?.sweet !== false && <li>หวาน {line.sweet}%</li>}
          {line.note && <li>{line.note}</li>}
        </ul>
      </div>
      <div className="cart-item-actions">
        <button
          className="cart-edit-action"
          aria-label={"แก้ไข " + line.name}
          onClick={onEdit}
        >
          แก้ไข
        </button>
        <div className="cart-quantity" aria-label={"จำนวน " + line.name}>
          <button aria-label={"ลดจำนวน " + line.name} onClick={onDecrease}>
            <Minus size={21} />
          </button>
          <b aria-live="polite">{line.qty}</b>
          <button
            aria-label={"เพิ่มจำนวน " + line.name}
            disabled={line.qty >= 30}
            onClick={onIncrease}
          >
            <Plus size={21} />
          </button>
        </div>
      </div>
    </article>
  );
}
