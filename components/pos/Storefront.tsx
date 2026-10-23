"use client";
import type { Dispatch, SetStateAction } from "react";
import {
  Clock,
  MapPin,
  ChevronRight,
  Search,
  X,
  Plus,
  Coffee,
  ShoppingBag,
} from "lucide-react";
import { Product, variants, basePrice, imageFor } from "@/lib/catalog";
import { money } from "@/lib/client";
type Props = {
  config: any;
  table: number;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: string;
  setCategory: Dispatch<SetStateAction<string>>;
  searchResults: Product[];
  openProduct: (p: Product) => void;
  nav: (v: string) => void;
};
export default function Storefront({
  config,
  table,
  query,
  setQuery,
  category,
  setCategory,
  searchResults,
  openProduct,
  nav,
}: Props) {
  return (
    <main className="customer-storefront">
      <div className="customer-cover">
        <img src={config.cover} alt="ภาพปกร้าน OLD SCHOOL" />
        <span>COFFEE & GOOD DAYS</span>
      </div>
      <section className="restaurant-profile" aria-label="ข้อมูลร้าน">
        <div className="profile-top">
          <img className="restaurant-logo" src={config.logo} alt="โลโก้ร้าน" />
          <span
            className={"availability " + (!config.accepting ? "is-closed" : "")}
          >
            <span />
            {config.accepting ? "เปิดรับออเดอร์" : "ปิดรับออเดอร์ชั่วคราว"}
          </span>
        </div>
        <h1>{config.name}</h1>
        <p className="restaurant-description">กาแฟ • ชา • เครื่องดื่มชงสด</p>
        <div className="restaurant-hours">
          <Clock size={14} />
          <span>
            เวลาเปิด–ปิด {config.open}–{config.close} น.
          </span>
          <span className="order-hint">สั่งแล้วรับที่เคาน์เตอร์</span>
        </div>
      </section>
      <div className="service-location">
        <MapPin size={19} />
        <div>
          <small>กำลังสั่งสำหรับ</small>
          <strong>
            {table
              ? "ทานที่ร้าน · โต๊ะ " + String(table).padStart(2, "0")
              : "ทานที่ร้าน / รับกลับบ้าน"}
          </strong>
        </div>
        <span>
          {table
            ? "เลือกวิธีรับอีกครั้งก่อนสั่ง"
            : "เลือกวิธีรับในขั้นตอนยืนยัน"}
        </span>
      </div>
      <section className="menu-section" id="menu">
        <div className="customer-menu-tools">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="ค้นหาเมนู"
              placeholder="ค้นหาเมนูในร้านนี้"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="ล้างการค้นหา">
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <div className="category-bar" aria-label="หมวดหมู่เมนู">
          {["เมนูแนะนำ", ...config.categories].map((c: string) => (
            <button
              key={c}
              aria-pressed={category === c}
              className={category === c ? "chosen" : ""}
              onClick={() => {
                setCategory(c);
                setQuery("");
                requestAnimationFrame(() =>
                  document
                    .getElementById("menu-results")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="section-label" id="menu-results">
          <div>
            <h2>{query ? "ผลการค้นหา" : category}</h2>
            <p>
              {query
                ? "เมนูที่ตรงกับ “" + query + "”"
                : category === "เมนูแนะนำ"
                  ? "เมนูที่อยากให้ลองจาก OLD SCHOOL"
                  : "เลือกเมนู แล้วปรับความหวานได้ตามชอบ"}
            </p>
          </div>
          <span>{searchResults.length} เมนู</span>
        </div>
        <div className="product-grid">
          {searchResults.map((p) => (
            <button
              className="product-card"
              key={p.id}
              onClick={() => openProduct(p)}
              aria-label={"เลือก " + p.name}
            >
              <div className="product-image">
                <img src={imageFor(p)} alt={p.name} loading="lazy" />
                {p.recommended && <span className="recommend">แนะนำ</span>}
                <span className="image-caption">ภาพประกอบ</span>
              </div>
              <div className="product-content">
                <h3>{p.name}</h3>
                <small>{p.en}</small>
                <div className="product-bottom">
                  <span className="price">
                    {variants(p).length > 1 && <small>เริ่ม </small>}฿
                    {money(basePrice(p))}
                  </span>
                  <span className="add-circle" aria-hidden="true">
                    <Plus size={20} />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {!searchResults.length && (
          <div className="empty">
            <Search size={32} />
            <h3>ไม่พบเมนูที่ค้นหา</h3>
            <p>ลองค้นหาด้วยชื่ออื่น หรือเลือกหมวดหมู่ด้านบน</p>
            <button
              className="text-button"
              onClick={() => {
                setQuery("");
                setCategory("เมนูแนะนำ");
              }}
            >
              กลับไปดูเมนูแนะนำ
            </button>
          </div>
        )}
        <div className="customer-menu-note">
          <Coffee size={17} />
          <span>ชงสดทุกแก้ว · เลือกความหวานได้ก่อนเพิ่มลงตะกร้า</span>
        </div>
      </section>
      <footer className="customer-footer">
        <img src={config.logo} alt="OLD SCHOOL" />
        <p>ขอบคุณที่ให้เราเป็นส่วนหนึ่งของวันดี ๆ</p>
        <small>รูปเครื่องดื่มเป็นภาพประกอบ</small>
        <button onClick={() => nav("install")}>
          เพิ่มร้านลงหน้าจอโฮม <ChevronRight size={13} />
        </button>
      </footer>
    </main>
  );
}
