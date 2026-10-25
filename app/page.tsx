"use client";
import { useEffect, useState } from "react";
import { api, money, statusNames } from "@/lib/client";
import Storefront from "@/components/pos/Storefront";
import CartItem from "@/components/pos/CartItem";
import ProductDialog from "@/components/pos/ProductDialog";
import OrderEditor from "@/components/pos/OrderEditor";
import TableQr from "@/components/pos/TableQr";
import {
  Coffee,
  ShoppingBag,
  Plus,
  Minus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  Check,
  X,
  Clock,
  MapPin,
  ChevronRight,
  Bell,
  Menu,
  LayoutDashboard,
  ReceiptText,
  LogOut,
  Settings,
  SlidersHorizontal,
  Download,
  Users,
  QrCode,
  CheckCircle2,
  Flame,
  Leaf,
  GlassWater,
  Package,
  Heart,
  Sun,
  Truck,
  Image as ImageIcon,
} from "lucide-react";
import {
  initialProducts,
  categories,
  variants,
  basePrice,
  imageFor,
  sweets,
  Product,
} from "@/lib/catalog";
type Line = {
  key: string;
  productId: string;
  name: string;
  variant: string;
  variantLabel: string;
  sweet: number;
  qty: number;
  price: number;
  note: string;
};
export default function App() {
  const [config, setConfig] = useState<any>({
    name: "OLD SCHOOL",
    subtitle: "Coffee & Good Days",
    open: "08:00",
    close: "18:00",
    products: initialProducts,
    categories: categories.slice(1),
    tables: 12,
    logo: "/assets/logo.png",
    cover: "/assets/hero.jpg",
    accepting: true,
  });
  const [view, setView] = useState("shop"),
    [category, setCategory] = useState("เมนูแนะนำ"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Product | null>(null),
    [variant, setVariant] = useState("cold"),
    [sweet, setSweet] = useState(100),
    [qty, setQty] = useState(1),
    [note, setNote] = useState("");
  const [cart, setCart] = useState<Line[]>([]),
    [cartOpen, setCartOpen] = useState(false),
    [orderType, setOrderType] = useState("dinein"),
    [table, setTable] = useState(0),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [user, setUser] = useState<any>(null),
    [orders, setOrders] = useState<any[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [login, setLogin] = useState(false),
    [adminTab, setAdminTab] = useState("orders"),
    [editing, setEditing] = useState<any>(null),
    [users, setUsers] = useState<any[]>([]),
    [reportDate, setReportDate] = useState(""),
    [reportMonth, setReportMonth] = useState(""),
    [idem, setIdem] = useState(""),
    [setup, setSetup] = useState(false),
    [editingLine, setEditingLine] = useState<string | null>(null);
  const [orderEditor, setOrderEditor] = useState<any>(null);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4000);
  };
  const load = async () => {
    try {
      const d = await api("menu");
      setConfig(d.config);
      setUser(d.user);
      setError("");
      setReady(true);
    } catch (e: any) {
      setError("ยังเชื่อมต่อระบบไม่ได้: " + e.message);
    }
  };
  useEffect(() => {
    load();
    const p = new URLSearchParams(location.search);
    let context: { type: string; table: number } | null = null;
    if (p.get("type") === "takeaway") context = { type: "takeaway", table: 0 };
    else if (p.has("table")) {
      const t = Number(p.get("table"));
      if (Number.isInteger(t) && t > 0) context = { type: "dinein", table: t };
    } else {
      try {
        context = JSON.parse(
          sessionStorage.getItem("os_order_context") || "null",
        );
      } catch {}
    }
    if (
      context &&
      (context.type === "takeaway" ||
        (context.type === "dinein" &&
          Number.isInteger(context.table) &&
          context.table > 0))
    ) {
      setOrderType(context.type);
      setTable(context.type === "takeaway" ? 0 : context.table);
      sessionStorage.setItem("os_order_context", JSON.stringify(context));
    } else {
      setTable(0);
      sessionStorage.removeItem("os_order_context");
    }
    if (p.get("view") === "orders") setView("orders");
    if (location.pathname === "/install") setView("install");
    if (location.pathname === "/cart" || location.pathname === "/checkout") {
      setCartOpen(true);
    }
    if (location.pathname === "/login") setLogin(true);
    if (location.pathname === "/staff" || location.pathname === "/admin") {
      api("menu").then((d) => {
        if (d.user) {
          setView(d.user.role === "admin" ? "admin" : "staff");
          setAdminTab("orders");
          window.history.replaceState(null, "", "/admin");
        } else setLogin(true);
      });
    }
    try {
      setCart(JSON.parse(localStorage.getItem("os_cart") || "[]"));
      const saved = localStorage.getItem("os_idem") || crypto.randomUUID();
      setIdem(saved);
      localStorage.setItem("os_idem", saved);
    } catch {}
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    localStorage.setItem("os_cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (!ready) return;
    const refresh = async () => {
      try {
        const d = await api(
          user && (view === "staff" || view === "admin") ? "orders" : "mine",
        );
        setOrders(d.orders || []);
        setError("");
      } catch (e: any) {
        setError(e.message);
      }
    };
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [view, user, ready]);
  useEffect(() => {
    if (view === "admin" && user?.role === "admin")
      api("admin")
        .then((d) => {
          setConfig(d.config);
          setUsers(d.users);
        })
        .catch((e) => notify(e.message));
  }, [view, user]);
  useEffect(() => {
    if (view === "admin" || view === "staff") return;
    const id = setInterval(() => {
      api("menu")
        .then((d) => setConfig(d.config))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [view]);
  const products: Product[] = config.products;
  const searchResults = products.filter(
    (p) =>
      !p.hidden &&
      (!query.trim() ||
        [p.name, p.en].some((n) =>
          n.toLowerCase().includes(query.trim().toLowerCase()),
        )),
  );
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0),
    count = cart.reduce((s, l) => s + l.qty, 0);
  const openProduct = (p: Product) => {
    if (p.soldOut) {
      notify("สินค้าหมดชั่วคราว");
      return;
    }
    setSelected(p);
    setVariant(
      p.price != null ? "regular" : p.cold != null ? "cold" : variants(p)[0].id,
    );
    setSweet(
      (p.sweetLevels || sweets).includes(100)
        ? 100
        : (p.sweetLevels || sweets)[0],
    );
    setQty(1);
    setNote("");
    setEditingLine(null);
  };
  const add = () => {
    if (!selected) return;
    if (products.find((p) => p.id === selected.id)?.soldOut) {
      notify("สินค้าหมดชั่วคราว");
      return;
    }
    const v = variants(selected).find((v) => v.id === variant)!;
    const line = {
      key: crypto.randomUUID(),
      productId: selected.id,
      name: selected.name,
      variant,
      variantLabel: v.label,
      sweet,
      qty,
      price: v.price,
      note,
    };
    setCart((a) =>
      editingLine
        ? a.map((l) => (l.key === editingLine ? { ...line, key: l.key } : l))
        : [...a, line],
    );
    setSelected(null);
    if (editingLine) setCartOpen(true);
    setEditingLine(null);
    notify("เพิ่ม " + selected.name + " ลงตะกร้าแล้ว");
  };
  const submit = async () => {
    setBusy(true);
    try {
      const d = await api("order", {
        items: cart,
        type: orderType,
        table,
        idem,
      });
      setCart([]);
      setOrders((a) => [d.order, ...a.filter((o) => o.id !== d.order.id)]);
      setCartOpen(false);
      setView("orders");
      const next = crypto.randomUUID();
      setIdem(next);
      localStorage.setItem("os_idem", next);
      notify("รับออเดอร์ " + d.order.number + " แล้ว");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (action: string, data: any) => {
    setBusy(true);
    try {
      const d = await api(action, data);
      if (action === "call")
        notify(
          d.sent
            ? "ส่งแจ้งเตือนแล้ว"
            : "ยังไม่มีอุปกรณ์ที่รับ Push ได้ ลูกค้าดูสถานะบนเว็บได้",
        );
      else notify("บันทึกเรียบร้อย");
      if (action === "config") {
        await load();
        if (user?.role === "admin") {
          const a = await api("admin");
          setConfig(a.config);
        }
      } else {
        const d = await api("orders");
        setOrders(d.orders);
      }
      return true;
    } catch (e: any) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveConfig = async (c: any) => mutate("config", { config: c });
  const enablePush = async () => {
    try {
      if (!("PushManager" in window) || !("Notification" in window)) {
        notify("อุปกรณ์นี้ยังใช้ Push ไม่ได้ ติดตามสถานะผ่านหน้านี้ได้");
        return;
      }
      const { key } = await api("push-key");
      if (!key) {
        notify("ระบบ Push ยังรอตั้งค่าจากผู้ดูแล ติดตามสถานะผ่านเว็บได้");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notify("ยังไม่ได้อนุญาตแจ้งเตือน ติดตามสถานะผ่านเว็บได้");
        return;
      }
      const sw = await navigator.serviceWorker.ready;
      const raw = atob(
        key.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (key.length % 4)) % 4),
      );
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
      await api("subscribe", { subscription: sub.toJSON() });
      notify("เปิดรับแจ้งเตือนแล้ว");
    } catch (e: any) {
      notify("เปิดแจ้งเตือนไม่สำเร็จ: " + e.message);
    }
  };
  const nav = (v: string) => {
    if ((v === "staff" || v === "admin") && !user) {
      setLogin(true);
      return;
    }
    if (v === "admin" && user?.role !== "admin") {
      notify("เฉพาะผู้ดูแลระบบ");
      return;
    }
    setView(v === "staff" && user?.role === "admin" ? "admin" : v);
    if (v === "staff" || v === "admin") setAdminTab("orders");
    setQuery("");
    window.scrollTo(0, 0);
  };
  const filteredOrders = orders.filter(
    (o) =>
      (!reportDate ||
        new Date(o.created).toLocaleDateString("en-CA", {
          timeZone: "Asia/Bangkok",
        }) === reportDate) &&
      (!reportMonth ||
        new Date(o.created)
          .toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
          .startsWith(reportMonth)),
  );
  const paid = filteredOrders.filter((o) => o.payment === "paid");
  const sales = paid.reduce((s, o) => s + o.total, 0);
  const cups = paid.reduce(
    (s, o) =>
      s +
      o.items.reduce(
        (n: number, i: any) => n + (i.unit === "piece" ? 0 : i.qty),
        0,
      ),
    0,
  );
  return (
    <div
      className={
        "app-shell " +
        (view === "staff" || view === "admin" ? "team-shell" : "customer-shell")
      }
    >
      <header className="topbar">
        <a
          className="wordmark"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (view === "staff" || view === "admin") setAdminTab("orders");
            else nav("shop");
          }}
        >
          <img src={config.logo} alt="OLD SCHOOL" />
          <span>
            {config.name}
            <small>
              {view === "staff" || view === "admin"
                ? "สำหรับทีมงานร้าน"
                : "สั่งเครื่องดื่มออนไลน์"}
            </small>
          </span>
        </a>
        <nav>
          {view === "staff" || view === "admin" ? (
            <>
              <button
                className="active"
                onClick={() => {
                  setAdminTab("orders");
                  window.scrollTo(0, 0);
                }}
              >
                หน้าทำงานร้าน
              </button>
              <a
                className="customer-preview-link"
                href="/"
                target="_blank"
                rel="noopener noreferrer"
              >
                ดูหน้าลูกค้า ↗
              </a>
            </>
          ) : (
            <>
              <button
                className={view === "shop" ? "active" : ""}
                onClick={() => nav("shop")}
              >
                เมนูเครื่องดื่ม
              </button>
              <button
                className={view === "orders" ? "active" : ""}
                onClick={() => nav("orders")}
              >
                ออเดอร์ของฉัน
              </button>
            </>
          )}
        </nav>
        {view !== "staff" && view !== "admin" && (
          <button
            className="header-cart"
            aria-label="เปิดตะกร้า"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag size={19} />
            <span>ตะกร้าของฉัน</span>
            <b>{count}</b>
          </button>
        )}
      </header>
      {error && (
        <div className="error-banner">
          {error} <button onClick={load}>ลองใหม่</button>
        </div>
      )}
      {view === "shop" && (
        <Storefront
          config={config}
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          searchResults={searchResults}
          openProduct={openProduct}
          nav={nav}
        />
      )}
      {orderEditor && user && (
        <OrderEditor
          order={orderEditor.order}
          config={config}
          user={user}
          onClose={() => setOrderEditor(null)}
          onSaved={async () => {
            const d = await api("orders");
            setOrders(d.orders);
            notify("บันทึกออเดอร์เรียบร้อย");
          }}
        />
      )}
      {view === "orders" && (
        <main className="workspace narrow">
          <div className="eyebrow">YOUR LITTLE COFFEE MOMENT</div>
          <h1>ออเดอร์ของฉัน</h1>
          <div className="notice">
            <Bell />
            <div>
              <b>ไม่พลาดเมื่อแก้วโปรดพร้อมรับ</b>
              <p>เปิดรับแจ้งเตือน หรือเปิดหน้านี้ไว้เพื่อติดตามสถานะ</p>
            </div>
            <button onClick={enablePush}>เปิดแจ้งเตือน</button>
          </div>
          {!orders.length ? (
            <div className="empty">
              <ShoppingBag size={40} />
              <h2>ยังไม่มีออเดอร์</h2>
              <p>เริ่มต้นวันดี ๆ ด้วยเครื่องดื่มแก้วโปรด</p>
              <button className="primary" onClick={() => nav("shop")}>
                เลือกเครื่องดื่ม
              </button>
            </div>
          ) : (
            orders.map((o) => (
              <article className="order-detail" key={o.id}>
                <div className="row">
                  <div>
                    <small>หมายเลขออเดอร์</small>
                    <h2>{o.number}</h2>
                  </div>
                  <span className={"status " + o.status}>
                    {statusNames[o.status]}
                  </span>
                </div>
                <p>
                  {o.type === "dinein"
                    ? "ทานที่ร้าน • โต๊ะ " + o.table
                    : "รับกลับบ้าน"}{" "}
                  · {new Date(o.created).toLocaleString("th-TH")}
                </p>
                <div className="progress">
                  {Object.entries(statusNames).map(([k, n], i) => (
                    <div
                      className={
                        Object.keys(statusNames).indexOf(o.status) >= i
                          ? "passed"
                          : ""
                      }
                      key={k}
                    >
                      <span>
                        {Object.keys(statusNames).indexOf(o.status) > i ? (
                          <Check size={15} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <small>{n}</small>
                    </div>
                  ))}
                </div>
                {o.items.map((i: any, k: number) => (
                  <div className="line-item" key={k}>
                    <b>
                      {i.qty} × {i.name}
                      <small>
                        {i.variantLabel}
                        {i.sweet !== null ? " · หวาน " + i.sweet + "%" : ""}
                        {i.note ? " · " + i.note : ""}
                      </small>
                    </b>
                    <span>฿{i.price * i.qty}</span>
                  </div>
                ))}
                {!!o.adjustment && (
                  <div className="row">
                    <span>{o.adjustment < 0 ? "ส่วนลด" : "เพิ่มราคา"}</span>
                    <span>
                      {o.adjustment > 0 ? "+" : ""}฿{money(o.adjustment)}
                    </span>
                  </div>
                )}
                <div className="row total">
                  <b>รวมทั้งหมด</b>
                  <b>฿{money(o.total)}</b>
                </div>
                <p className={o.payment === "paid" ? "paid-text" : "muted"}>
                  {o.payment === "paid"
                    ? "✓ ยืนยันชำระเงินแล้ว"
                    : "รอชำระเงินที่เคาน์เตอร์"}
                </p>
                {o.payment !== "paid" && o.method === "qr" && config.bankQr && (
                  <img
                    className="bank-qr"
                    src={config.bankQr}
                    alt="QR ธนาคารร้าน"
                  />
                )}
              </article>
            ))
          )}
        </main>
      )}
      {view === "install" && (
        <main className="workspace narrow">
          <button className="text-button" onClick={() => nav("shop")}>
            <ArrowLeft size={16} /> กลับหน้าร้าน
          </button>
          <h1>พกร้านไว้บนหน้าจอ</h1>
          <div className="panel">
            <h2>เพิ่มลงหน้าจอโฮมบน iPhone</h2>
            <ol className="steps">
              <li>เปิดเว็บไซต์ร้านด้วย Safari</li>
              <li>กดปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”</li>
              <li>กด “เพิ่ม” และเปิด OLD SCHOOL จากไอคอนใหม่</li>
              <li>สั่งเครื่องดื่ม แล้วกด “เปิดแจ้งเตือน” ในหน้าออเดอร์</li>
            </ol>
            <p>
              Web Push บน iPhone ต้องใช้ iOS 16.4
              ขึ้นไปและเปิดจากเว็บแอปที่เพิ่มบนหน้าจอโฮม
            </p>
            <button className="primary" onClick={enablePush}>
              <Bell size={17} /> เปิดแจ้งเตือน
            </button>
          </div>
          <div className="panel">
            <h3>หากเปิดแจ้งเตือนไม่ได้</h3>
            <p>
              เปิดหน้า “ออเดอร์ของฉัน” ไว้
              สถานะจะอัปเดตอัตโนมัติเมื่อมีอินเทอร์เน็ต
              ระบบไม่รองรับการส่งออเดอร์ขณะออฟไลน์
            </p>
          </div>
        </main>
      )}
      {(view === "staff" || view === "admin") && user && (
        <main className="workspace unified-workspace">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">OLD SCHOOL / WORKSPACE</div>
              <h1>หน้าทำงานร้าน</h1>
            </div>
            <button
              className="secondary"
              onClick={async () => {
                await api("logout", {});
                setUser(null);
                setView("shop");
              }}
            >
              <LogOut size={16} /> ออกจากระบบ
            </button>
          </div>
          <div className="workspace-navigation">
            <div
              className="workspace-status-strip"
              aria-label="ออเดอร์ที่กำลังดูแล"
            >
              {["waiting", "making", "ready"].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setAdminTab("orders");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span className={"status " + status}>
                    {statusNames[status]}
                  </span>
                  <b>{orders.filter((o) => o.status === status).length}</b>
                </button>
              ))}
            </div>
            <nav className="tabs workspace-tabs" aria-label="ส่วนงานร้าน">
              {[
                ["orders", "รับออเดอร์"],
                ["history", "ประวัติออเดอร์"],
                ...(user.role === "admin"
                  ? [
                      ["products", "เมนูสินค้า"],
                      ["dashboard", "ยอดขาย"],
                      ["categories", "หมวดหมู่"],
                      ["tables", "โต๊ะ / QR"],
                      ["reports", "รายงาน"],
                      ["users", "พนักงาน"],
                      ["settings", "ตั้งค่าร้าน"],
                    ]
                  : []),
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={adminTab === key ? "chosen" : ""}
                  aria-pressed={adminTab === key}
                  onClick={() => setAdminTab(key)}
                >
                  {label}
                  {key === "orders" &&
                    orders.some((o) => o.status === "waiting") && (
                      <span className="workspace-order-badge">
                        {orders.filter((o) => o.status === "waiting").length}
                      </span>
                    )}
                </button>
              ))}
            </nav>
          </div>
          {adminTab === "orders" || adminTab === "history" ? (
            <>
              <div className="counter-order-toolbar">
                <button
                  className="primary"
                  onClick={() => setOrderEditor({ order: null })}
                >
                  <Plus size={18} /> เพิ่มออเดอร์หน้าร้าน
                </button>
                <span className="muted">
                  ลูกค้าสั่งที่เคาน์เตอร์ รับรายการได้ที่นี่
                </span>
              </div>
              {adminTab === "orders" ? (
                <div className="kanban">
                  {["waiting", "making", "ready"].map((s) => (
                    <section key={s}>
                      <h3>
                        <span className={"status " + s}>{statusNames[s]}</span>
                        <b>{orders.filter((o) => o.status === s).length}</b>
                      </h3>
                      {orders
                        .filter((o) => o.status === s)
                        .map((o) => orderCard(o))}
                      {!orders.some((o) => o.status === s) && (
                        <p className="kanban-empty">ยังไม่มีออเดอร์</p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <div className="order-list">
                  {orders.map((o) => orderCard(o))}
                </div>
              )}
            </>
          ) : user.role === "admin" ? (
            <>
              {(adminTab === "dashboard" || adminTab === "reports") && (
                <>
                  <div className="row filters">
                    <h2>
                      {adminTab === "dashboard"
                        ? "ภาพรวมยอดขาย"
                        : "รายงานยอดขาย"}
                    </h2>
                    <div>
                      <label>
                        รายวัน{" "}
                        <input
                          type="date"
                          value={reportDate}
                          onChange={(e) => {
                            setReportDate(e.target.value);
                            setReportMonth("");
                          }}
                        />
                      </label>
                      <label>
                        รายเดือน{" "}
                        <input
                          type="month"
                          value={reportMonth}
                          onChange={(e) => {
                            setReportMonth(e.target.value);
                            setReportDate("");
                          }}
                        />
                      </label>
                      <button
                        onClick={() => {
                          setReportDate("");
                          setReportMonth("");
                        }}
                      >
                        ทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="stats">
                    {[
                      [money(sales) + " ฿", "ยอดรับชำระแล้ว"],
                      [filteredOrders.length, "จำนวนออเดอร์"],
                      [cups, "จำนวนแก้วที่ชำระแล้ว"],
                      [
                        orders.filter((o) => o.status !== "done").length,
                        "ออเดอร์ที่กำลังดูแล",
                      ],
                    ].map(([v, l]) => (
                      <div className="panel" key={l}>
                        <small>{l}</small>
                        <h2>{v}</h2>
                      </div>
                    ))}
                  </div>
                  <div className="panel">
                    <div className="row">
                      <h3>ยอดขายแยกหมวดหมู่</h3>
                      <button className="secondary" onClick={exportExcel}>
                        <Download size={16} /> ส่งออก Excel
                      </button>
                    </div>
                    {config.categories.map((c: string) => {
                      const amount = paid.reduce(
                        (s, o) =>
                          s +
                          o.items
                            .filter((i: any) => i.category === c)
                            .reduce(
                              (n: number, i: any) => n + i.price * i.qty,
                              0,
                            ),
                        0,
                      );
                      return (
                        <div className="sales-row" key={c}>
                          <b>{c}</b>
                          <div>
                            <span
                              style={{
                                width:
                                  Math.max(
                                    1,
                                    (amount / Math.max(sales, 1)) * 100,
                                  ) + "%",
                              }}
                            />
                          </div>
                          <strong>฿{money(amount)}</strong>
                        </div>
                      );
                    })}
                    <p className="muted">
                      ยอดขายนับเฉพาะออเดอร์ที่ยืนยันชำระเงิน •
                      เวลาที่แสดงเป็นเวลาประเทศไทย
                    </p>
                  </div>
                </>
              )}
              {adminTab === "products" && (
                <>
                  <div className="row">
                    <h2>เมนูทั้งหมด ({products.length})</h2>
                    <button
                      className="primary"
                      onClick={() =>
                        setEditing({
                          id: crypto.randomUUID(),
                          name: "",
                          en: "",
                          category: config.categories[0],
                          cold: 35,
                          sweet: true,
                        })
                      }
                    >
                      <Plus size={17} /> เพิ่มเมนู
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>เมนู</th>
                          <th>หมวดหมู่</th>
                          <th>ราคา</th>
                          <th>สถานะ</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <b>{p.name}</b>
                              <small>{p.en}</small>
                            </td>
                            <td>{p.category}</td>
                            <td>
                              {variants(p)
                                .map((v) => v.label + " ฿" + v.price)
                                .join(" / ")}
                            </td>
                            <td>
                              {p.hidden ? "ซ่อน" : "แสดง"}
                              {p.recommended ? " · แนะนำ" : ""}
                              <label className="stock-toggle">
                                <input
                                  type="checkbox"
                                  checked={!!p.soldOut}
                                  disabled={busy}
                                  aria-label={"สินค้าหมดชั่วคราว " + p.name}
                                  onChange={(e) =>
                                    saveConfig({
                                      ...config,
                                      products: products.map((item) =>
                                        item.id === p.id
                                          ? {
                                              ...item,
                                              soldOut: e.target.checked,
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                />{" "}
                                สินค้าหมดชั่วคราว
                              </label>
                            </td>
                            <td>
                              <button
                                onClick={() =>
                                  setEditing(
                                    /เบเกอรี|bakery/i.test(p.category) &&
                                      p.price == null
                                      ? {
                                          ...p,
                                          price:
                                            p.cold ?? p.hot ?? p.blend ?? 35,
                                          hot: null,
                                          cold: null,
                                          blend: null,
                                          sweet: false,
                                          unit: "piece",
                                        }
                                      : { ...p },
                                  )
                                }
                              >
                                แก้ไข
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {adminTab === "categories" && (
                <div className="panel">
                  <h2>หมวดหมู่และลำดับแสดงผล</h2>
                  {config.categories.map((c: string, i: number) => (
                    <div className="line-item" key={c}>
                      <b>
                        {i + 1}. {c}
                      </b>
                      <div>
                        <button
                          onClick={() => {
                            const name = prompt("ชื่อหมวดหมู่ใหม่", c)?.trim();
                            if (!name || name === c) return;
                            if (config.categories.includes(name)) {
                              notify("มีหมวดหมู่นี้แล้ว");
                              return;
                            }
                            saveConfig({
                              ...config,
                              categories: config.categories.map((n: string) =>
                                n === c ? name : n,
                              ),
                              products: products.map((p) =>
                                p.category === c ? { ...p, category: name } : p,
                              ),
                            });
                          }}
                        >
                          เปลี่ยนชื่อ
                        </button>
                        <button
                          disabled={i === 0}
                          onClick={() => {
                            const a = [...config.categories];
                            [a[i - 1], a[i]] = [a[i], a[i - 1]];
                            saveConfig({ ...config, categories: a });
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={i === config.categories.length - 1}
                          onClick={() => {
                            const a = [...config.categories];
                            [a[i + 1], a[i]] = [a[i], a[i + 1]];
                            saveConfig({ ...config, categories: a });
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => {
                            if (products.some((p) => p.category === c)) {
                              notify("ย้ายเมนูออกจากหมวดนี้ก่อนลบ");
                              return;
                            }
                            saveConfig({
                              ...config,
                              categories: config.categories.filter(
                                (n: string) => n !== c,
                              ),
                            });
                          }}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                  <form
                    className="row form-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const name = String(f.get("name")).trim();
                      if (name && !config.categories.includes(name)) {
                        saveConfig({
                          ...config,
                          categories: [...config.categories, name],
                        });
                        e.currentTarget.reset();
                      }
                    }}
                  >
                    <input
                      name="name"
                      placeholder="ชื่อหมวดหมู่ใหม่"
                      required
                      maxLength={50}
                    />
                    <button className="primary">เพิ่มหมวดหมู่</button>
                  </form>
                </div>
              )}
              {adminTab === "tables" && (
                <div className="panel">
                  <div className="row">
                    <h2>โต๊ะและ QR Code</h2>
                    <label>
                      จำนวนโต๊ะ{" "}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={config.tables}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            tables: Number(e.target.value),
                          })
                        }
                      />
                      <button onClick={() => saveConfig(config)}>บันทึก</button>
                    </label>
                  </div>
                  <p className="muted">
                    QR โต๊ะผูกหมายเลขโต๊ะให้อัตโนมัติ ส่วน QR Takeaway
                    ใช้สำหรับรับกลับบ้าน
                  </p>
                  <div className="qr-grid">
                    <TableQr />
                    {Array.from({ length: config.tables }, (_, i) => (
                      <TableQr key={i} table={i + 1} />
                    ))}
                  </div>
                </div>
              )}
              {adminTab === "users" && (
                <div className="panel">
                  <h2>บัญชีและสิทธิ์พนักงาน</h2>
                  {users.map((u) => (
                    <div className="line-item" key={u.id}>
                      <b>
                        {u.name}
                        <small>
                          {u.id} ·{" "}
                          {u.role === "admin" ? "ผู้ดูแลระบบ" : "พนักงาน"}
                        </small>
                      </b>
                      <select
                        aria-label={"สิทธิ์ " + u.name}
                        disabled={busy || u.id === user.id}
                        value={u.role}
                        onChange={async (e) => {
                          if (
                            await mutate("user-role", {
                              id: u.id,
                              role: e.target.value,
                            })
                          ) {
                            const d = await api("admin");
                            setUsers(d.users);
                          }
                        }}
                      >
                        <option value="staff">พนักงาน</option>
                        <option value="admin">ผู้ดูแลระบบ</option>
                      </select>
                      <button
                        disabled={busy || u.id === user.id}
                        onClick={async () => {
                          if (
                            await mutate("disable-user", {
                              id: u.id,
                              active: !u.active,
                            })
                          ) {
                            const d = await api("admin");
                            setUsers(d.users);
                          }
                        }}
                      >
                        {u.active ? "ปิดบัญชี" : "เปิดบัญชี"}
                      </button>
                    </div>
                  ))}
                  <form
                    className="form-grid"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      if (await mutate("user", f)) {
                        const d = await api("admin");
                        setUsers(d.users);
                      }
                    }}
                  >
                    <label>
                      ชื่อผู้ใช้
                      <input name="id" required minLength={3} />
                    </label>
                    <label>
                      ชื่อแสดง
                      <input name="name" required />
                    </label>
                    <label>
                      รหัสผ่าน
                      <input
                        name="password"
                        type="password"
                        minLength={10}
                        required
                      />
                    </label>
                    <label>
                      สิทธิ์
                      <select name="role">
                        <option value="staff">พนักงาน</option>
                        <option value="admin">ผู้ดูแลระบบ</option>
                      </select>
                    </label>
                    <button className="primary" disabled={busy}>
                      เพิ่มผู้ใช้งาน
                    </button>
                  </form>
                </div>
              )}
              {adminTab === "settings" && (
                <form
                  className="panel form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveConfig(config);
                  }}
                >
                  <h2>ตั้งค่าร้าน</h2>
                  <label>
                    ชื่อร้าน
                    <input
                      value={config.name}
                      onChange={(e) =>
                        setConfig({ ...config, name: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    เวลาเปิด
                    <input
                      type="time"
                      value={config.open}
                      onChange={(e) =>
                        setConfig({ ...config, open: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    เวลาปิด
                    <input
                      type="time"
                      value={config.close}
                      onChange={(e) =>
                        setConfig({ ...config, close: e.target.value })
                      }
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={config.accepting}
                      onChange={(e) =>
                        setConfig({ ...config, accepting: e.target.checked })
                      }
                    />{" "}
                    เปิดรับออเดอร์
                  </label>
                  {[
                    ["logo", "โลโก้"],
                    ["cover", "ภาพปกร้าน"],
                    ["bankQr", "QR รับเงินธนาคาร"],
                  ].map(([key, name]) => (
                    <label key={key}>
                      {name}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={async (e) => {
                          const url = await upload(e.target.files?.[0]);
                          if (url) setConfig({ ...config, [key]: url });
                        }}
                      />
                      {config[key] && (
                        <img
                          className="upload-preview"
                          src={config[key]}
                          alt={name}
                        />
                      )}
                    </label>
                  ))}
                  <button className="primary" disabled={busy}>
                    บันทึกการตั้งค่า
                  </button>
                  <p className="muted">
                    Push ต้องตั้งค่า VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY และ
                    VAPID_SUBJECT ฝั่ง Server
                  </p>
                </form>
              )}
            </>
          ) : null}
        </main>
      )}
      {selected && (
        <ProductDialog
          selected={{
            ...selected,
            soldOut:
              products.find((p) => p.id === selected.id)?.soldOut ??
              selected.soldOut,
          }}
          setSelected={setSelected}
          variant={variant}
          setVariant={setVariant}
          sweet={sweet}
          setSweet={setSweet}
          qty={qty}
          setQty={setQty}
          note={note}
          setNote={setNote}
          ready={ready}
          config={config}
          add={add}
        />
      )}
      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="ตะกร้า"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row drawer-header">
              <h2>
                ตะกร้าของฉัน <small>({count})</small>
              </h2>
              <button onClick={() => setCartOpen(false)} aria-label="ปิดตะกร้า">
                <X />
              </button>
            </div>
            <div className="drawer-body">
              {!cart.length ? (
                <div className="empty">
                  <ShoppingBag size={40} />
                  <h3>ตะกร้ายังว่าง</h3>
                  <button
                    onClick={() => {
                      setCartOpen(false);
                      nav("shop");
                    }}
                  >
                    เลือกเครื่องดื่มแก้วโปรด ↗
                  </button>
                </div>
              ) : (
                cart.map((l) => (
                  <CartItem
                    key={l.key}
                    line={l}
                    product={products.find((p) => p.id === l.productId)}
                    onEdit={() => {
                      const p = products.find((p) => p.id === l.productId);
                      if (!p) {
                        notify("ไม่พบเมนูนี้แล้ว");
                        return;
                      }
                      openProduct(p);
                      setVariant(l.variant);
                      setSweet(l.sweet);
                      setQty(l.qty);
                      setNote(l.note);
                      setEditingLine(l.key);
                      setCartOpen(false);
                    }}
                    onDecrease={() =>
                      setCart((a) =>
                        a.flatMap((x) =>
                          x.key === l.key
                            ? x.qty > 1
                              ? [{ ...x, qty: x.qty - 1 }]
                              : []
                            : [x],
                        ),
                      )
                    }
                    onIncrease={() =>
                      setCart((a) =>
                        a.map((x) =>
                          x.key === l.key
                            ? { ...x, qty: Math.min(30, x.qty + 1) }
                            : x,
                        ),
                      )
                    }
                  />
                ))
              )}
            </div>
            <div className="drawer-footer">
              <div className="row">
                <span>รวมทั้งหมด</span>
                <strong className="price">฿{money(total)}</strong>
              </div>
              {cart.length > 0 && (
                <p className="cart-order-context">
                  {orderType === "takeaway"
                    ? "รับกลับบ้าน · ชำระเงินที่เคาน์เตอร์"
                    : table > 0 && table <= config.tables
                      ? "โต๊ะ " + table + " · ชำระเงินที่เคาน์เตอร์"
                      : "กรุณาสแกน QR ที่โต๊ะ หรือ QR สำหรับกลับบ้านก่อนสั่ง"}
                </p>
              )}
              <button
                className="primary full"
                disabled={
                  !cart.length ||
                  busy ||
                  !ready ||
                  !config.accepting ||
                  (orderType === "dinein" && (!table || table > config.tables))
                }
                onClick={submit}
              >
                {busy ? "กำลังส่งออเดอร์..." : "ยืนยันสั่งเครื่องดื่ม"}
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
        </div>
      )}
      {login && (
        <div className="overlay" onClick={() => setLogin(false)}>
          <form
            className="login-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const f = Object.fromEntries(new FormData(e.currentTarget));
                if (setup) {
                  await api("setup", f);
                  notify("สร้างผู้ดูแลแล้ว เข้าสู่ระบบด้วยชื่อ owner");
                  setSetup(false);
                } else {
                  const d = await api("login", f);
                  setUser(d.user);
                  setLogin(false);
                  setView(d.user.role === "admin" ? "admin" : "staff");
                  setAdminTab("orders");
                  window.history.replaceState(null, "", "/admin");
                }
              } catch (e: any) {
                notify(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <button
              className="close"
              type="button"
              onClick={() => setLogin(false)}
              aria-label="ปิด"
            >
              <X />
            </button>
            <img src={config.logo} alt="OLD SCHOOL" />
            <h2>{setup ? "ตั้งค่าผู้ดูแลครั้งแรก" : "ยินดีต้อนรับกลับ"}</h2>
            <p className="muted">สำหรับทีมงาน OLD SCHOOL</p>
            {setup ? (
              <label>
                Setup key จาก Server
                <input name="secret" type="password" required />
              </label>
            ) : (
              <label>
                ชื่อผู้ใช้
                <input name="username" autoComplete="username" required />
              </label>
            )}
            <label>
              รหัสผ่าน
              <input
                name="password"
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                minLength={setup ? 10 : 1}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy
                ? "กำลังตรวจสอบ..."
                : setup
                  ? "สร้างผู้ดูแล"
                  : "เข้าสู่ระบบ"}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setSetup(!setup)}
            >
              {setup ? "กลับเข้าสู่ระบบ" : "ตั้งค่าร้านครั้งแรก"}
            </button>
          </form>
        </div>
      )}
      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <form
            className="edit-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              const exists = products.some((p) => p.id === editing.id);
              if (
                await saveConfig({
                  ...config,
                  products: exists
                    ? products.map((p) => (p.id === editing.id ? editing : p))
                    : [...products, editing],
                })
              )
                setEditing(null);
            }}
          >
            <div className="row">
              <h2>จัดการเมนู</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="ปิด"
              >
                <X />
              </button>
            </div>
            <label>
              ชื่อไทย
              <input
                value={editing.name}
                required
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              ชื่ออังกฤษ
              <input
                value={editing.en}
                onChange={(e) => setEditing({ ...editing, en: e.target.value })}
              />
            </label>
            <label>
              รายละเอียด
              <input
                value={editing.description || ""}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <label>
              หมวดหมู่
              <select
                value={editing.category}
                onChange={(e) =>
                  setEditing(
                    /เบเกอรี|bakery/i.test(e.target.value)
                      ? {
                          ...editing,
                          category: e.target.value,
                          price:
                            editing.price ??
                            editing.cold ??
                            editing.hot ??
                            editing.blend ??
                            35,
                          hot: null,
                          cold: null,
                          blend: null,
                          sweet: false,
                          unit: "piece",
                        }
                      : { ...editing, category: e.target.value },
                  )
                }
              >
                {config.categories.map((c: string) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              รูปแบบราคา
              <select
                value={editing.price != null ? "regular" : "drink"}
                onChange={(e) =>
                  setEditing(
                    e.target.value === "regular"
                      ? {
                          ...editing,
                          price:
                            editing.price ??
                            editing.cold ??
                            editing.hot ??
                            editing.blend ??
                            35,
                          hot: null,
                          cold: null,
                          blend: null,
                          sweet: false,
                          unit: "piece",
                        }
                      : {
                          ...editing,
                          price: null,
                          cold: editing.price ?? 35,
                          hot: null,
                          blend: null,
                          sweet: true,
                          unit: "cup",
                        },
                  )
                }
              >
                <option value="drink">เครื่องดื่ม — ร้อน / เย็น / ปั่น</option>
                <option value="regular">
                  ราคาปกติ — เบเกอรี่ / สินค้าทั่วไป
                </option>
              </select>
            </label>
            {editing.price != null ? (
              <label>
                ราคาปกติ (บาท)
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  required
                  value={editing.price}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      price:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </label>
            ) : (
              <>
                <div className="form-grid">
                  {[
                    ["hot", "ร้อน"],
                    ["cold", "เย็น"],
                    ["blend", "ปั่น"],
                  ].map(([k, n]) => (
                    <label key={k}>
                      ราคา{n}
                      <input
                        type="number"
                        min={0}
                        value={editing[k] ?? ""}
                        placeholder="เว้นว่าง = ไม่มี"
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            [k]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>{" "}
              </>
            )}

            <label>
              รูปสินค้า
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const url = await upload(e.target.files?.[0]);
                  if (url) setEditing({ ...editing, image: url });
                }}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!editing.recommended}
                onChange={(e) =>
                  setEditing({ ...editing, recommended: e.target.checked })
                }
              />{" "}
              เมนูแนะนำ
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!editing.soldOut}
                onChange={(e) =>
                  setEditing({ ...editing, soldOut: e.target.checked })
                }
              />{" "}
              สินค้าหมดชั่วคราว
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!editing.hidden}
                onChange={(e) =>
                  setEditing({ ...editing, hidden: e.target.checked })
                }
              />{" "}
              ซ่อนจากหน้าร้าน
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={editing.sweet !== false}
                onChange={(e) =>
                  setEditing({ ...editing, sweet: e.target.checked })
                }
              />{" "}
              ให้ลูกค้าเลือกระดับความหวาน
            </label>
            <label>
              ระดับความหวานที่ขาย (คั่นด้วยจุลภาค)
              <input
                defaultValue={(editing.sweetLevels || sweets).join(",")}
                placeholder="0,25,50,100,150"
                onBlur={(e) => {
                  const levels = e.target.value
                    .split(",")
                    .map((v) => Number(v.trim()))
                    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 200);
                  if (levels.length)
                    setEditing({
                      ...editing,
                      sweetLevels: Array.from(new Set(levels)),
                    });
                }}
              />
            </label>
            <div className="row">
              <button
                className="danger"
                type="button"
                onClick={async () => {
                  if (
                    confirm(
                      "ลบเมนู " + editing.name + "? ประวัติออเดอร์เดิมยังอยู่",
                    )
                  )
                    if (
                      await saveConfig({
                        ...config,
                        products: products.filter((p) => p.id !== editing.id),
                      })
                    )
                      setEditing(null);
                }}
              >
                ลบเมนู
              </button>
              <button className="primary" disabled={busy}>
                บันทึกเมนู
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {view === "shop" && count > 0 && !cartOpen && (
        <button
          className="floating-cart"
          onClick={() => {
            setCartOpen(true);
          }}
        >
          <span>
            <ShoppingBag size={18} /> {count} รายการ
          </span>
          <b>ดูตะกร้า · ฿{money(total)}</b>
          <ChevronRight size={18} />
        </button>
      )}
      {view !== "staff" && view !== "admin" && (
        <nav className="customer-bottom-nav" aria-label="เมนูลูกค้า">
          <button
            className={view === "shop" ? "selected" : ""}
            onClick={() => nav("shop")}
          >
            <Coffee size={21} />
            <span>เมนู</span>
          </button>
          <button
            className={view === "orders" ? "selected" : ""}
            onClick={() => nav("orders")}
          >
            <ReceiptText size={21} />
            <span>ออเดอร์ของฉัน</span>
          </button>
          <button
            onClick={() => {
              setCartOpen(true);
            }}
          >
            <span className="bottom-cart-icon">
              <ShoppingBag size={21} />
              {count > 0 && <b>{count}</b>}
            </span>
            <span>ตะกร้า</span>
          </button>
        </nav>
      )}
    </div>
  );
  function orderCard(o: any) {
    return (
      <article className="staff-order" key={o.id}>
        <div className="row">
          <h3>{o.number}</h3>
          <span className={"status " + o.status}>{statusNames[o.status]}</span>
        </div>
        {o.source === "counter" && (
          <small className="counter-order-label">สั่งหน้าร้าน</small>
        )}
        <p className="muted">
          {o.type === "dinein" ? "โต๊ะ " + o.table : "กลับบ้าน"} ·{" "}
          {new Date(o.created).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {o.items.map((i: any, k: number) => (
          <div className="line-item" key={k}>
            <b>
              {i.qty} × {i.name}
              <small>
                {i.variantLabel}
                {i.sweet !== null ? " · หวาน " + i.sweet + "%" : ""}
                {i.note ? " · " + i.note : ""}
              </small>
            </b>
            <span>฿{i.price * i.qty}</span>
          </div>
        ))}
        <div className="row">
          <strong>฿{money(o.total)}</strong>
          <span className={o.payment === "paid" ? "paid-text" : "unpaid"}>
            {o.payment === "paid"
              ? "ชำระแล้ว"
              : o.method === "qr"
                ? "รอ QR ธนาคาร"
                : o.method === "cash"
                  ? "รอเงินสด"
                  : "รอชำระที่เคาน์เตอร์"}
          </span>
        </div>
        {o.adjustment ? (
          <p className="order-adjustment">
            ปรับยอด {o.adjustment > 0 ? "+" : ""}
            {money(o.adjustment)} บาท · {o.adjustmentReason}
          </p>
        ) : null}
        {o.revisions?.length > 0 && (
          <details className="order-revisions">
            <summary>ประวัติแก้ไข ({o.revisions.length})</summary>
            {o.revisions.map((r: any, index: number) => (
              <div key={index}>
                <b>{r.actor}</b> · {new Date(r.at).toLocaleString("th-TH")}
                <p>
                  {r.reason} · ฿{money(r.before.total)} → ฿
                  {money(r.after.total)}
                </p>
                {r.settlement && (
                  <p>
                    {r.delta < 0 ? "บันทึกคืนเงิน" : "บันทึกรับเพิ่ม"} ฿
                    {money(Math.abs(r.delta))} ·{" "}
                    {r.settlement.method === "cash"
                      ? "เงินสด"
                      : "QR / โอนธนาคาร"}
                  </p>
                )}
                <small>
                  {r.after.items
                    .map(
                      (i: any) =>
                        `${i.qty} × ${i.name} (${i.variantLabel}${i.sweet != null ? ` หวาน ${i.sweet}%` : ""})`,
                    )
                    .join(", ")}
                </small>
              </div>
            ))}
          </details>
        )}
        <div className="staff-actions">
          {(o.payment !== "paid" || user?.role === "admin") && (
            <button
              disabled={busy}
              onClick={() => setOrderEditor({ order: o })}
            >
              {o.payment === "paid" ? "แก้ยอด / บันทึกคืนเงิน" : "แก้ไขออเดอร์"}
            </button>
          )}
          {o.payment !== "paid" &&
            ["cash", "qr"].map((method) => (
              <button
                key={method}
                disabled={busy}
                className="secondary"
                onClick={() => {
                  if (
                    confirm(
                      "ยืนยันรับชำระ" +
                        (method === "cash" ? "เงินสด" : " QR ธนาคาร") +
                        " " +
                        money(o.total) +
                        " บาท สำหรับ " +
                        o.number +
                        "?",
                    )
                  )
                    mutate("payment", { id: o.id, version: o.version, method });
                }}
              >
                {method === "cash" ? "รับเงินสด" : "รับ QR ธนาคาร"}
              </button>
            ))}
          {o.status !== "done" && (
            <button
              className="primary"
              disabled={busy || (o.status === "ready" && o.payment !== "paid")}
              onClick={() =>
                mutate("status", {
                  id: o.id,
                  version: o.version,
                  status:
                    Object.keys(statusNames)[
                      Object.keys(statusNames).indexOf(o.status) + 1
                    ],
                })
              }
            >
              {o.status === "waiting"
                ? "เริ่มทำ"
                : o.status === "making"
                  ? "พร้อมรับแล้ว"
                  : "ปิดออเดอร์"}{" "}
              <ChevronRight size={16} />
            </button>
          )}
          {o.status === "ready" && (
            <button
              disabled={busy}
              onClick={() => mutate("call", { id: o.id })}
            >
              <Bell size={16} /> เรียกลูกค้า
            </button>
          )}
        </div>
      </article>
    );
  }
  async function upload(file?: File) {
    if (!file) return null;
    try {
      const f = new FormData();
      f.set("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: f });
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.error);
      notify("อัปโหลดแล้ว กดบันทึกเพื่อใช้งาน");
      return d.url;
    } catch (e: any) {
      notify(e.message);
      return null;
    }
  }
  function exportExcel() {
    window.location.href =
      "/api/export?" +
      new URLSearchParams({ date: reportDate, month: reportMonth }).toString();
  }
}
