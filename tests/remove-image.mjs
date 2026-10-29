import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "oldschool-remove-image-"));
try {
  await build({
    stdin: {
      contents: `
        import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { imageFor } from "./lib/catalog.ts";
        import Storefront from "./components/pos/Storefront.tsx";
        import ProductDialog from "./components/pos/ProductDialog.tsx";
        import CartItem from "./components/pos/CartItem.tsx";
        const noop=()=>{};
        const product=image=>({id:"qa-photo",name:"ทดสอบลบรูป",en:"Photo test",category:"กาแฟ",cold:35,sweet:false,image});
        export const image=value=>imageFor(product(value));
        export const removedRegular=()=>imageFor({...product(""),price:35});
        export function storefront(image,cover="",logo="") {
          const p=product(image);
          return renderToStaticMarkup(createElement(Storefront,{
            config:{name:"Photo test",categories:["กาแฟ"],cover,logo,open:"10:00",close:"22:00",accepting:true},
            query:"",setQuery:noop,category:"กาแฟ",setCategory:noop,searchResults:[p],openProduct:noop,nav:noop
          }));
        }
        export function dialog(image) {
          return renderToStaticMarkup(createElement(ProductDialog,{
            selected:product(image),setSelected:noop,variant:"cold",setVariant:noop,
            sweet:100,setSweet:noop,qty:1,setQty:noop,note:"",setNote:noop,
            ready:true,config:{accepting:true},add:noop
          }));
        }
        export function cart(image) {
          return renderToStaticMarkup(createElement(CartItem,{
            line:{name:"ทดสอบลบรูป",qty:1,price:35,variantLabel:"เย็น",sweet:100,note:""},
            product:product(image),onEdit:noop,onDecrease:noop,onIncrease:noop
          }));
        }
      `,
      resolveDir: root,
      sourcefile: "remove-image-entry.tsx",
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: join(temp, "render.cjs"),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  const { default: renderer } = await import(
    pathToFileURL(join(temp, "render.cjs"))
  );
  const url = "/api/images/11111111-1111-4111-8111-111111111111";
  assert.equal(
    renderer.image(undefined),
    "/assets/latte.jpg",
    "legacy defaults remain available for untouched products",
  );
  assert.equal(renderer.image(url), url, "uploaded images remain unchanged");
  assert.equal(
    renderer.image(""),
    "",
    "explicit removal must not fall back to an old stock photo",
  );
  assert.equal(
    renderer.removedRegular(),
    "",
    "explicit removal also applies to regular-price products",
  );
  const removed = JSON.parse(JSON.stringify({ image: "" }));
  assert.equal(
    renderer.image(removed.image),
    "",
    "the removal marker survives saving and reloading JSON",
  );
  for (const view of ["storefront", "dialog", "cart"]) {
    const blank = renderer[view]("");
    assert.equal(
      (blank.match(/<img\b/g) || []).length,
      0,
      view + " must render a neutral placeholder without a broken empty image",
    );
    assert.ok(
      blank.includes("product-image-placeholder"),
      view + " must identify the empty image visually",
    );
    assert.ok(
      !blank.includes("/assets/latte.jpg"),
      view + " must not restore the old sample image",
    );
    assert.ok(
      !/\bsrc=""/.test(blank),
      view + " must not request an empty image URL",
    );
    const withImage = renderer[view](url);
    assert.ok(
      withImage.includes(`src="${url}"`),
      view + " must still render uploaded images",
    );
  }
  const storeWithoutCover = renderer.storefront("");
  assert.ok(
    !storeWithoutCover.includes("customer-cover"),
    "removed shop cover must not leave a cover frame",
  );
  assert.ok(
    !storeWithoutCover.includes("restaurant-logo"),
    "removed logo must not produce an empty image",
  );
  const storeWithCover = renderer.storefront(
    "",
    "/assets/hero.jpg",
    "/assets/logo-coral.png",
  );
  assert.ok(storeWithCover.includes('src="/assets/hero.jpg"'));
  assert.ok(storeWithCover.includes('src="/assets/logo-coral.png"'));
  console.log(
    "PASS: removed product images persist as empty, card/dialog/cart show neutral placeholders, legacy/uploaded images remain, and cleared cover/logo avoid empty image requests",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
