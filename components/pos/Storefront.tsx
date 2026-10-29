"use client";
import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Clock, ChevronRight, Search, X, Plus, Coffee } from "lucide-react";
import { Product, variants, basePrice, imageFor } from "@/lib/catalog";
import { money } from "@/lib/client";
type Props = {
  config: any;
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
  query,
  setQuery,
  category,
  setCategory,
  searchResults,
  openProduct,
  nav,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const pendingCategory = useRef<string | null>(null);
  const activeCategory = useRef(category);
  const groups = useMemo(
    () =>
      query.trim()
        ? [{ name: "ผลการค้นหา", products: searchResults }]
        : ["เมนูแนะนำ", ...config.categories]
            .map((name: string) => ({
              name,
              products: searchResults.filter((p) =>
                name === "เมนูแนะนำ" ? p.recommended : p.category === name,
              ),
            }))
            .filter((g) => g.products.length),
    [query, searchResults, config.categories],
  );
  const groupKey = groups.map((g) => g.name).join("|");
  const goToCategory = (name: string) => {
    const section = sectionRefs.current.get(name);
    if (!section) return;
    const offset =
      (document
        .querySelector(".customer-shell .topbar")
        ?.getBoundingClientRect().height || 56) +
      (barRef.current?.offsetHeight || 45) +
      10;
    window.scrollTo({
      top: Math.max(
        0,
        window.scrollY + section.getBoundingClientRect().top - offset,
      ),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  // Search temporarily replaces the groups; wait for the full menu to render before jumping back.
  useEffect(() => {
    if (query.trim() || !pendingCategory.current) return;
    const target = pendingCategory.current;
    pendingCategory.current = null;
    const id = requestAnimationFrame(() => goToCategory(target));
    return () => cancelAnimationFrame(id);
  }, [query, groupKey]);
  // Follow the heading crossing the bottom of the sticky category bar, in either scroll direction.
  useEffect(() => {
    if (query.trim()) return;
    let frame = 0;
    const names = groupKey.split("|").filter(Boolean);
    const update = () => {
      frame = 0;
      const threshold =
        (barRef.current?.getBoundingClientRect().bottom || 112) + 14;
      let current = names[0];
      for (const name of names) {
        const section = sectionRefs.current.get(name);
        if (section && section.getBoundingClientRect().top <= threshold)
          current = name;
      }
      if (current && activeCategory.current !== current) {
        activeCategory.current = current;
        setCategory(current);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [groupKey, query, setCategory]);
  useEffect(() => {
    activeCategory.current = category;
    const bar = barRef.current;
    if (!bar) return;
    const selected = Array.from(
      bar.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent === category);
    if (selected)
      bar.scrollTo({
        left:
          selected.offsetLeft - (bar.clientWidth - selected.offsetWidth) / 2,
        behavior: "smooth",
      });
  }, [category]);
  const selectCategory = (name: string) => {
    activeCategory.current = name;
    setCategory(name);
    if (query.trim()) {
      pendingCategory.current = name;
      setQuery("");
    } else goToCategory(name);
  };
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
        <div className="restaurant-hours">
          <Clock size={14} />
          <span>
            เวลาเปิด–ปิด {config.open}–{config.close} น.
          </span>
          <span className="order-hint">สั่งแล้วรับที่เคาน์เตอร์</span>
        </div>
      </section>
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
        <div ref={barRef} className="category-bar" aria-label="หมวดหมู่เมนู">
          {["เมนูแนะนำ", ...config.categories].map((name: string) => (
            <button
              key={name}
              aria-pressed={category === name}
              className={category === name ? "chosen" : ""}
              onClick={() => selectCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className={"menu-groups" + (query.trim() ? " is-search" : "")}>
          {groups.map((group) => (
            <section
              key={group.name}
              className="menu-group"
              data-menu-category={group.name}
              aria-label={group.name}
              ref={(node) => {
                if (node) sectionRefs.current.set(group.name, node);
                else sectionRefs.current.delete(group.name);
              }}
            >
              <div className="section-label">
                <div>
                  <h2>{group.name}</h2>
                  <p>
                    {query.trim()
                      ? "เมนูที่ตรงกับ “" + query + "”"
                      : group.name === "เมนูแนะนำ"
                        ? "เมนูที่อยากให้ลองจาก OLD SCHOOL"
                        : "เลือกเมนู แล้วปรับความหวานได้ตามชอบ"}
                  </p>
                </div>
                <span>{group.products.length} เมนู</span>
              </div>
              <div className="product-grid">
                {group.products.map((p) => (
                  <button
                    className={"product-card" + (p.soldOut ? " sold-out" : "")}
                    disabled={!!p.soldOut}
                    key={p.id}
                    onClick={() => openProduct(p)}
                    aria-label={"เลือก " + p.name}
                  >
                    <div className="product-image">
                      <img
                        src={imageFor(p)}
                        alt={p.name}
                        width={800}
                        height={800}
                        loading="lazy"
                      />
                      {p.soldOut && (
                        <span className="sold-out-label">
                          สินค้าหมดชั่วคราว
                        </span>
                      )}
                      {p.recommended && (
                        <span className="recommend">แนะนำ</span>
                      )}
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
            </section>
          ))}
        </div>
        {query.trim() && !searchResults.length && (
          <div className="empty">
            <Search size={32} />
            <h3>ไม่พบเมนูที่ค้นหา</h3>
            <p>ลองค้นหาด้วยชื่ออื่น หรือเลือกหมวดหมู่ด้านบน</p>
            <button
              className="text-button"
              onClick={() => selectCategory("เมนูแนะนำ")}
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
