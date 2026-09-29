/* =========================================================
   Tải sản phẩm + feedback từ Supabase cho trang bán hàng.
   Nếu mất mạng / Supabase lỗi -> dùng dữ liệu dự phòng
   trong js/products.js và js/feedback.js.
   ========================================================= */
(function () {
  "use strict";
  const fallbackP = window.PRODUCTS || [];
  const fallbackF = window.FEEDBACKS || [];

  const toProduct = (r) => ({
    id: r.id, name: r.name, price: r.price, stock: r.stock,
    status: r.stock <= 0 ? "sold" : r.status, badge: r.badge || "",
    images: r.image ? [r.image] : [],
  });

  async function load() {
    if (!window.sb) throw new Error("no client");
    const [p, f] = await Promise.all([
      sb.from("products").select("*").is("deleted_at", null).order("position").order("created_at", { ascending: false }),
      sb.from("feedbacks").select("*").is("deleted_at", null).order("position").order("created_at"),
    ]);
    if (p.error) throw p.error;
    if (f.error) throw f.error;
    window.PRODUCTS = p.data.map(toProduct);
    window.FEEDBACKS = f.data.map((r) => r.image);
  }

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000));
  window.DATA_READY = Promise.race([load(), timeout]).catch((e) => {
    console.warn("Không tải được dữ liệu Supabase, dùng dữ liệu dự phòng:", e);
    window.PRODUCTS = fallbackP;
    window.FEEDBACKS = fallbackF;
  });
})();
