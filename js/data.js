/* =========================================================
   Tải sản phẩm + feedback từ Supabase cho trang bán hàng.
   Nếu mất mạng / Supabase lỗi -> dùng dữ liệu dự phòng
   trong js/products.js và js/feedback.js.
   ========================================================= */
(function () {
  "use strict";
  const fallbackP = window.PRODUCTS || [];
  const fallbackF = window.FEEDBACKS || [];

  const toProduct = (r) => {
    const images = [r.image, r.image2].filter(Boolean);
    return {
      id: r.id, name: r.name, price: r.price, stock: r.stock,
      status: r.stock <= 0 ? "sold" : r.status, badge: r.badge || "",
      image: r.image || "",
      image2: r.image2 || "",
      video: r.video || "",
      images: images.length ? images : (r.image ? [r.image] : []),
    };
  };

  async function load() {
    if (!window.sb) throw new Error("no client");
    const [p, f, ord] = await Promise.all([
      sb.from("products").select("*").is("deleted_at", null).order("position").order("created_at", { ascending: false }),
      sb.from("feedbacks").select("*").is("deleted_at", null).order("position").order("created_at"),
      sb.from("orders").select("items").eq("status", "pending"),
    ]);
    if (p.error) throw p.error;
    if (f.error) throw f.error;

    // Tính tổng số lượng sản phẩm đang bị giữ trong các đơn Chờ xử lý (pending)
    const heldMap = {};
    if (ord && Array.isArray(ord.data)) {
      ord.data.forEach((o) => {
        const items = Array.isArray(o.items) ? o.items : [];
        items.forEach((it) => {
          if (it && it.id) {
            heldMap[String(it.id)] = (heldMap[String(it.id)] || 0) + (Number(it.qty) || 1);
          }
        });
      });
    }

    const toProductWithHold = (r) => {
      const images = [r.image, r.image2].filter(Boolean);
      const held = heldMap[String(r.id)] || 0;
      const rawStock = Number(r.stock) ?? 1;
      const effectiveStock = Math.max(0, rawStock - held);
      const isSold = r.status === "sold" || rawStock <= 0 || effectiveStock <= 0;

      return {
        id: r.id,
        name: r.name,
        price: r.price,
        stock: isSold ? 0 : effectiveStock,
        status: isSold ? "sold" : (r.status || "available"),
        badge: r.badge || "",
        image: r.image || "",
        image2: r.image2 || "",
        video: r.video || "",
        images: images.length ? images : (r.image ? [r.image] : []),
      };
    };

    window.PRODUCTS = p.data.map(toProductWithHold).sort((a, b) => {
      const aSold = (a.status === "sold" || (a.stock !== undefined && a.stock <= 0)) ? 1 : 0;
      const bSold = (b.status === "sold" || (b.stock !== undefined && b.stock <= 0)) ? 1 : 0;
      return aSold - bSold;
    });
    window.FEEDBACKS = f.data.map((r) => r.image);
  }

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000));
  window.DATA_READY = Promise.race([load(), timeout]).catch((e) => {
    console.warn("Không tải được dữ liệu Supabase, dùng dữ liệu dự phòng:", e);
    window.PRODUCTS = fallbackP;
    window.FEEDBACKS = fallbackF;
  });
})();
