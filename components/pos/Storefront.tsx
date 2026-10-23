"use client";
import type { Dispatch, SetStateAction } from "react";
import {
  Coffee,
  ArrowUpRight,
  Heart,
  Clock,
  MapPin,
  ChevronRight,
  Search,
  X,
  Flame,
  Leaf,
  GlassWater,
  Plus,
} from "lucide-react";
import { Product, variants, basePrice, imageFor } from "@/lib/catalog";
import { money } from "@/lib/client";
type Props = {
  config: any;
  table: number;
  setCartOpen: Dispatch<SetStateAction<boolean>>;
  setCheckout: Dispatch<SetStateAction<boolean>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: string;
  setCategory: Dispatch<SetStateAction<string>>;
  searchResults: Product[];
  openProduct: (p: Product) => void;
  nav: (v: string) => void;
  setLogin: Dispatch<SetStateAction<boolean>>;
};
function IconCategory({ name }: { name: string }) {
  return name === "กาแฟ" ? (
    <Coffee size={17} />
  ) : name === "มัทฉะ" || name === "ชา" ? (
    <Leaf size={17} />
  ) : name === "เมนูแนะนำ" ? (
    <Flame size={17} />
  ) : (
    <GlassWater size={17} />
  );
}
export default function Storefront({
  config,
  table,
  setCartOpen,
  setCheckout,
  query,
  setQuery,
  category,
  setCategory,
  searchResults,
  openProduct,
  nav,
  setLogin,
}: Props) {
  return (
    <main>
      <section
        className="hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(24,21,17,.78),rgba(24,21,17,.12)),url(${config.cover})`,
        }}
      >
        <div className="hero-inner">
          <div className="eyebrow light">
            <span /> A LITTLE COFFEE. A GOOD DAY.
          </div>
          <h1>
            แก้วโปรดของคุณ
            <br />
            ความสุขของเรา<span>.</span>
          </h1>
          <p>
            ค่อย ๆ จิบ แล้วปล่อยให้วันนี้เป็นวันดี ๆ<br />
            กาแฟหอม ๆ และเครื่องดื่มที่ตั้งใจทำทุกแก้ว
          </p>
          <a href="#menu" className="cream-btn">
            เลือกเครื่องดื่มแก้วโปรด <ArrowUpRight size={18} />
          </a>
          <div className="hero-foot">
            <span>
              <Coffee size={15} /> FRESHLY MADE, ALWAYS
            </span>
            <span>EST. GOOD DAYS</span>
          </div>
        </div>
        <div className="hero-stamp">
          BREWED WITH
          <Heart size={22} />
          GOOD VIBES
        </div>
      </section>
      <div className="shop-info">
        <div className="shop-avatar">
          <img src={config.logo} alt="โลโก้ร้าน" />
        </div>
        <div className="shop-name">
          <h2>
            {config.name} <span>COFFEE</span>
          </h2>
          <p>
            <span className={"dot " + (!config.accepting ? "closed" : "")} />
            {config.accepting ? "พร้อมรับออเดอร์" : "ปิดรับออเดอร์ชั่วคราว"}
            <i /> <Clock size={13} />
            {config.open} – {config.close} น.
          </p>
        </div>
        <button
          className="table-pill"
          onClick={() => {
            setCartOpen(true);
            setCheckout(true);
          }}
        >
          <MapPin size={17} />
          {table
            ? "โต๊ะ " + String(table).padStart(2, "0")
            : "เลือกโต๊ะ / กลับบ้าน"}
          <ChevronRight size={15} />
        </button>
      </div>
      <section className="menu-section" id="menu">
        <div className="menu-heading">
          <div>
            <div className="eyebrow">MADE FOR YOUR EVERYDAY</div>
            <h2>
              วันนี้ ดื่มอะไรดี<span>?</span>
            </h2>
            <p>เลือกแก้วที่ใช่ แล้วให้เราดูแลความอร่อย</p>
          </div>
          <label className="search">
            <Search size={18} />
            <input
              placeholder="ค้นหาเครื่องดื่มที่ชอบ..."
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
        <div className="category-bar">
          {["เมนูแนะนำ", ...config.categories].map((c: string) => (
            <button
              key={c}
              className={category === c ? "chosen" : ""}
              onClick={() => {
                setCategory(c);
                setQuery("");
              }}
            >
              <IconCategory name={c} />
              {c}
            </button>
          ))}
        </div>
        <div className="section-label">
          <h3>
            {query
              ? "ผลการค้นหา"
              : category === "เมนูแนะนำ"
                ? "แก้วโปรดที่อยากให้ลอง"
                : category}
            <span>{searchResults.length} เมนู</span>
          </h3>
          <span className="small-label">GOOD COFFEE, GOOD MOOD.</span>
        </div>
        <div className="product-grid">
          {searchResults.map((p) => (
            <button
              className="product-card"
              key={p.id}
              onClick={() => openProduct(p)}
            >
              <div className="product-image">
                <img src={imageFor(p)} alt={p.name} loading="lazy" />
                {p.recommended && (
                  <span className="recommend">
                    <Flame size={12} /> เมนูแนะนำ
                  </span>
                )}
                <span className="image-caption">ภาพประกอบ</span>
                <span className="add-circle">
                  <Plus size={21} />
                </span>
              </div>
              <div className="product-content">
                <small>{p.en}</small>
                <h3>{p.name}</h3>
                <div className="product-bottom">
                  <span className="price">฿{money(basePrice(p))}</span>
                  <span>
                    {variants(p)
                      .map((v) => v.label)
                      .join(" / ")}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {!searchResults.length && (
          <div className="empty">
            <Search />
            <h3>ยังไม่พบเครื่องดื่มที่ค้นหา</h3>
            <p>ลองชื่ออื่น หรือเลือกหมวดหมู่ด้านบน</p>
          </div>
        )}
        <div className="warm-note">
          <Coffee size={26} />
          <div>
            <strong>ทุกแก้ว ทำด้วยความตั้งใจ</strong>
            <p>เลือกระดับความหวานที่ชอบ แล้วให้เราชงแก้วโปรดให้คุณ</p>
          </div>
          <span>ENJOY YOUR LITTLE MOMENT ↗</span>
        </div>
      </section>
      <footer>
        <b>OLD SCHOOL</b>
        <p>Good coffee. Good company. Good days.</p>
        <div>
          <button onClick={() => nav("install")}>วิธีเพิ่มลงหน้าจอโฮม</button>
          <span>•</span>
          <button onClick={() => setLogin(true)}>เข้าสู่ระบบร้าน</button>
        </div>
        <small>
          รูปเครื่องดื่มเป็นภาพประกอบ • ราคาหน้าร้านรวมตามตัวเลือกที่เลือก
        </small>
      </footer>
    </main>
  );
}
