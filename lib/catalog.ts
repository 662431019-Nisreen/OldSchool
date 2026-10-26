export type Product = {
  id: string;
  name: string;
  en: string;
  category: string;
  price?: number;
  soldOut?: boolean;
  unit?: "cup" | "piece";
  hot?: number;
  cold?: number;
  blend?: number;
  recommended?: boolean;
  hidden?: boolean;
  image?: string;
  sweet?: boolean;
  sweetLevels?: number[];
  description?: string;
};
export const categories = [
  "เมนูแนะนำ",
  "กาแฟ",
  "ชา",
  "มัทฉะ",
  "โซดา",
  "สมูทตี้",
  "มิลค์เชค",
  "น้ำผลไม้",
];
const group = (category: string, rows: any[]) =>
  rows.map(([id, name, en, hot, cold, blend, recommended]) => ({
    id,
    name,
    en,
    category,
    hot,
    cold,
    blend,
    recommended,
    sweet: true,
  }));
export const initialProducts: Product[] = [
  ...group("กาแฟ", [
    ["americano", "อเมริกาโน่", "Americano", 40, 45, null, true],
    ["espresso", "เอสเปรสโซ", "Espresso", 35, 50],
    ["cappuccino", "คาปูชิโน่", "Cappuccino", 45, 55],
    ["latte", "ลาเต้", "Latte", 45, 50, null, true],
    ["coconut-latte", "ลาเต้มะพร้าว", "Coconut Latte", null, 60, null, true],
    ["mocha", "มอคค่า", "Mocha", 55, 60],
    ["caramel", "คาราเมลมัคคิอาโต", "Caramel Macchiato", 55, 60],
    ["orange-coffee", "กาแฟส้ม", "Black Orange", null, 60, null, true],
    ["black-water", "แบล็ก วอเทอร์", "Black Water", null, 60],
    ["honey-lemon", "กาแฟดำน้ำผึ้งมะนาว", "Black Honey Lemon", null, 60],
  ]),
  ...group("ชา", [
    ["thai-tea", "ชาไทย", "Thai Tea", 30, 35, null, true],
    ["thai-cocoa", "ชาไทยโกโก้", "Thai Tea Cocoa", null, 40],
    ["green-cocoa", "ชาเขียวโกโก้", "Green Tea Cocoa", null, 40],
    ["green-milk", "ชาเขียวนมสด", "Green Milk Tea", 30, 35],
    ["peach-tea", "ชาพีช", "Peach Tea", null, 40],
    ["jasmine", "ชามะลิ", "Jasmine Tea", null, 45],
    ["rambutan", "ชาเงาะ", "Rambutan Tea", null, 45],
    ["green-rambutan", "ชาเขียวเงาะ", "Green Rambutan Tea", null, 45],
    ["longan", "ชาลำไย", "Longan Tea", null, 45],
  ]),
  ...group("มัทฉะ", [
    ["pure-matcha", "เพียวมัทฉะ", "Pure Matcha", null, 45],
    ["matcha-latte", "มัทฉะลาเต้", "Matcha Latte", null, 45, null, true],
    ["matcha-coconut", "มัทฉะลาเต้มะพร้าว", "Coconut Matcha Latte", null, 55],
    ["matcha-orange", "มัทฉะส้ม", "Orange Matcha", null, 55],
    ["matcha-strawberry", "มัทฉะสตรอเบอร์รี่", "Strawberry Matcha", null, 55],
    ["matcha-cocoa", "มัทฉะโกโก้", "Matcha Cocoa", null, 55],
  ]),
  ...group("โซดา", [
    ["apple-soda", "แอปเปิ้ลโซดา", "Apple Soda", null, 35],
    ["strawberry-soda", "สตรอเบอร์รี่โซดา", "Strawberry Soda", null, 35],
    ["passion-soda", "เสาวรสโซดา", "Passion Fruit Soda", null, 35],
    ["red-soda", "แดงมะนาวโซดา", "Red Lime Soda", null, 35],
    ["orange-soda", "ส้มโซดา", "Orange Soda", null, 35],
    ["plum-soda", "บ๊วยโซดา", "Plum Soda", null, 35],
    ["peach-soda", "พีชโซดา", "Peach Soda", null, 35],
    ["butterbeer", "บัตเตอร์เบียร์", "Butterbeer", null, 40],
  ]),
  ...group("สมูทตี้", [
    [
      "strawberry-yogurt",
      "สตรอเบอร์รี่โยเกิร์ต",
      "Strawberry Yogurt",
      null,
      null,
      45,
      true,
    ],
    [
      "berry-yogurt",
      "มิกซ์เบอร์รี่โยเกิร์ต",
      "Mixed Berry Yogurt",
      null,
      null,
      45,
    ],
    ["mango-yogurt", "มะม่วงโยเกิร์ต", "Mango Yogurt", null, null, 45],
    ["pipo-yogurt", "ปีโป้โยเกิร์ต", "Pipo Yogurt", null, null, 45],
  ]),
  ...group("มิลค์เชค", [
    ["vanilla-shake", "วานิลลามิลค์เชค", "Vanilla Milkshake", null, null, 55],
    [
      "chocolate-shake",
      "ช็อกโกแลตมิลค์เชค",
      "Chocolate Milkshake",
      null,
      null,
      55,
    ],
    [
      "strawberry-shake",
      "สตรอเบอร์รี่มิลค์เชค",
      "Strawberry Milkshake",
      null,
      null,
      55,
    ],
    ["oreo-shake", "โอรีโอมิลค์เชค", "Oreo Milkshake", null, null, 55],
  ]),
  ...group("น้ำผลไม้", [["orange-juice", "น้ำส้ม", "Orange Juice", null, 45]]),
];
export const variants = (p: Product) =>
  p.price != null
    ? [{ id: "regular", label: "ปกติ", price: p.price }]
    : ([
        p.hot != null ? { id: "hot", label: "ร้อน", price: p.hot } : null,
        p.cold != null ? { id: "cold", label: "เย็น", price: p.cold } : null,
        p.blend != null ? { id: "blend", label: "ปั่น", price: p.blend } : null,
      ].filter(Boolean) as { id: string; label: string; price: number }[]);
export const sweets = [0, 25, 50, 100, 150];
export const basePrice = (p: Product) =>
  Math.min(...variants(p).map((v) => v.price));
export function imageFor(p: Product) {
  if (p.image) return p.image;
  if (p.price != null) return "/assets/logo-coral.png";
  const c = p.category;
  return c === "กาแฟ"
    ? p.id === "orange-coffee"
      ? "/assets/orange-coffee.jpg"
      : p.id === "americano" || p.id === "black-water"
        ? "/assets/black-coffee.jpg"
        : "/assets/latte.jpg"
    : c === "มัทฉะ"
      ? "/assets/matcha.jpg"
      : c === "ชา"
        ? "/assets/thai-tea.jpg"
        : c === "โซดา" || c === "น้ำผลไม้"
          ? "/assets/soda.jpg"
          : "/assets/smoothie.jpg";
}
