/* =========================================================
   BloomCard — Trang quản trị (/hello)
   Dữ liệu lưu trực tiếp trên Supabase:
   - bảng products, feedbacks (cột deleted_at = nằm trong "Đã xoá")
   - kho ảnh "images"
   Thêm / sửa / xoá ở đây là trang bán hàng cập nhật ngay.
   ========================================================= */
(function () {
  "use strict";

  const sb = window.sb;
  const BUCKET = window.SUPABASE_BUCKET || "images";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("vi-VN") + "đ";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // ảnh cũ lưu dạng "images/..." (tính từ thư mục gốc web) -> thêm "../" vì trang này nằm trong /hello
  const asset = (u) => (!u || /^(data:|blob:|https?:|\/)/.test(u) ? u : (window.ASSET_BASE || "") + u);
  const ICON_EDIT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  /* ---------- Dữ liệu trong trang ---------- */
  let products = [];   // chưa xoá
  let feedbacks = [];  // chưa xoá
  let trash = [];      // đã xoá (products + feedbacks)
  let trashedOrders = []; // đơn hàng đã xoá
  let orders = [];     // danh sách đơn hàng
  let currentTrashFilter = "products"; // tab đang chọn trong mục Đã xoá

  /* =========================================================
     TRẠNG THÁI LƯU
     ========================================================= */
  let pending = 0;
  function setSave(state) {
    const el = $("#saveState");
    if (!el) return;
    el.classList.toggle("is-warn", state === "error");
    el.classList.toggle("is-busy", state === "busy");
    el.textContent = state === "busy" ? "Đang lưu…" : state === "error" ? "Lưu lỗi — thử lại" : "Đã lưu lên web";
  }
  async function run(task, errMsg = "Không lưu được, kiểm tra mạng rồi thử lại") {
    pending++; setSave("busy");
    try {
      const r = await task();
      pending--; if (!pending) setSave("ok");
      return r;
    } catch (e) {
      pending--; setSave("error");
      console.error(e);
      toast(errMsg);
      throw e;
    }
  }
  const must = (res) => { if (res.error) throw res.error; return res.data; };

  /* =========================================================
     ẢNH: nén + tải lên Supabase Storage
     ========================================================= */
  function readImage(file, maxW) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, maxW / img.width);
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async function uploadImage(dataUrl, folder) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    must(await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }));
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function uploadVideo(file, folder) {
    const ext = (file.name || "video.mp4").split(".").pop().toLowerCase() || "mp4";
    const path = `${folder}/vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    must(await sb.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "video/mp4",
      cacheControl: "31536000",
      upsert: false
    }));
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function removeImage(url) {
    const mark = `/storage/v1/object/public/${BUCKET}/`;
    if (!url || !url.includes(mark)) return;          // ảnh mẫu trong thư mục web -> không xoá
    const path = decodeURIComponent(url.split(mark)[1].split("?")[0]);
    try { await sb.storage.from(BUCKET).remove([path]); } catch (e) { console.warn(e); }
  }

  /* =========================================================
     TẢI DỮ LIỆU
     ========================================================= */
  async function loadAll() {
    if ($("#appLoading")) $("#appLoading").hidden = true;
    $("#appError").hidden = true;
    if ($("#productList") && !products.length) {
      $("#productList").innerHTML = '<div class="state-box state-box--list"><span class="spinner"></span>Đang tải danh sách sản phẩm…</div>';
      if ($("#productEmpty")) $("#productEmpty").hidden = true;
    }
    if ($("#ordersList") && !orders.length) {
      $("#ordersList").innerHTML = '<div class="state-box state-box--list"><span class="spinner"></span>Đang tải danh sách đơn hàng…</div>';
      if ($("#orderEmpty")) $("#orderEmpty").hidden = true;
    }
    if ($("#fbList") && !feedbacks.length) {
      $("#fbList").innerHTML = '<div class="state-box state-box--list"><span class="spinner"></span>Đang tải feedback…</div>';
      if ($("#fbEmpty")) $("#fbEmpty").hidden = true;
    }
    if ($("#trashList") && !trash.length) {
      $("#trashList").innerHTML = '<div class="state-box state-box--list"><span class="spinner"></span>Đang tải danh sách đã xoá…</div>';
      if ($("#trashEmpty")) $("#trashEmpty").hidden = true;
    }
    try {
      const [p, f] = await Promise.all([
        sb.from("products").select("*").order("position").order("created_at", { ascending: false }),
        sb.from("feedbacks").select("*").order("position").order("created_at"),
      ]);
      const P = must(p), F = must(f);
      products = P.filter((x) => !x.deleted_at);
      feedbacks = F.filter((x) => !x.deleted_at);
      trash = [
        ...P.filter((x) => x.deleted_at).map((x) => ({ type: "product", row: x })),
        ...F.filter((x) => x.deleted_at).map((x) => ({ type: "feedback", row: x })),
      ].sort((a, b) => String(b.row.deleted_at).localeCompare(String(a.row.deleted_at)));
      renderProducts(); renderFeedback(); renderTrash();
      await loadOrders();
      setSave("ok");
    } catch (e) {
      console.error(e);
      const msg = String(e.message || e);
      $("#appErrorText").textContent = /relation|does not exist|schema cache/i.test(msg)
        ? "Chưa tạo bảng dữ liệu trên Supabase. Hãy chạy đoạn lệnh SQL trong SQL Editor rồi tải lại trang."
        : "Không tải được dữ liệu. Kiểm tra kết nối mạng rồi thử lại.";
      $("#appError").hidden = false;
    } finally {
      if ($("#appLoading")) $("#appLoading").hidden = true;
    }
  }
  $("#btnRetry").addEventListener("click", loadAll);

  /* =========================================================
     CHUYỂN MỤC
     ========================================================= */
  const ORDER = ["products", "orders", "feedback", "trash"];
  const scrollPos = {};
  let current = null;
  function go(view) {
    if (view === current) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (current) scrollPos[current] = window.scrollY;
    const dir = current ? Math.sign(ORDER.indexOf(view) - ORDER.indexOf(current)) : 0;
    current = view;
    $$(".menu__item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    $$(".view").forEach((v) => {
      const on = v.id === "view-" + view;
      v.classList.toggle("is-active", on);
      v.classList.remove("from-left", "from-right");
      if (on && dir) { void v.offsetWidth; v.classList.add(dir > 0 ? "from-right" : "from-left"); }
    });
    window.scrollTo(0, scrollPos[view] || 0);
    if (view === "trash") renderTrash();
    if (view === "orders") renderOrders();
    // Cập nhật tiêu đề + phụ đề mobile
    const titles = { products: "Sản phẩm", orders: "Đơn hàng", feedback: "Feedback", trash: "Đã xoá" };
    const mtopTitle = $("#mtopTitle");
    const mtopSub = $("#mtopSub");
    if (mtopTitle) mtopTitle.textContent = titles[view] || view;
    if (mtopSub) {
      const src = $("#" + (subIds[view] || ""));
      mtopSub.textContent = src ? src.textContent : "";
    }
    try { history.replaceState(null, "", "#" + view); } catch (e) { }
  }
  $$(".menu__item").forEach((b) => b.addEventListener("click", () => { go(b.dataset.view); closeDrawer(); }));

  // ---- Hamburger Drawer Toggle ----
  function openDrawer() {
    const side = $(".side"), overlay = $("#drawerOverlay");
    if (side) side.classList.add("is-open");
    if (overlay) overlay.classList.add("is-open");
    document.body.classList.add("no-scroll");
  }
  function closeDrawer() {
    const side = $(".side"), overlay = $("#drawerOverlay");
    if (side) side.classList.remove("is-open");
    if (overlay) overlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
  }
  const burgerBtn = $("#burgerBtn");
  if (burgerBtn) burgerBtn.addEventListener("click", openDrawer);
  const drawerOverlay = $("#drawerOverlay");
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  // Vuốt ngang để chuyển mục (điện thoại / iPad)
  (() => {
    let x0 = 0, y0 = 0, t0 = 0, track = false;
    const main = $(".main");
    main.addEventListener("touchstart", (e) => {
      if (document.body.classList.contains("no-scroll") || $(".confirm")) return;
      // Bỏ qua nếu đang chạm vào input hoặc nút bấm (tránh nhầm swipe)
      if (e.target.closest("input, select, textarea, .fgrid img, button, .oitem__actions, .titem__act")) return;
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); track = true;
    }, { passive: true });
    main.addEventListener("touchend", (e) => {
      if (!track) return; track = false;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > 600 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const k = ORDER.indexOf(current) + (dx < 0 ? 1 : -1);
      if (k >= 0 && k < ORDER.length) go(ORDER[k]);
    }, { passive: true });
  })();

  /* =========================================================
     SẢN PHẨM
     ========================================================= */
  // Đồng bộ phụ đề vào thanh trên mobile
  const subIds = { products: "pSummary", orders: "oSummary", feedback: "fSummary", trash: "tSummary" };
  function syncMtopSub() {
    const el = $("#mtopSub");
    if (!el || !current) return;
    const src = $("#" + (subIds[current] || ""));
    el.textContent = src ? src.textContent : "";
  }
  const isSold = (p) => p.status === "sold" || (Number(p.stock) || 0) <= 0;
  function summary() {
    const allCount = products.length;
    const availableCount = products.filter((p) => !isSold(p)).length;
    const soldCount = products.filter((p) => isSold(p)).length;
    $("#pSummary").textContent = `${allCount} card · ${availableCount} còn hàng`;
    syncMtopSub();
    if ($("#pCountAll")) $("#pCountAll").textContent = allCount;
    if ($("#pCountAvailable")) $("#pCountAvailable").textContent = availableCount;
    if ($("#pCountSold")) $("#pCountSold").textContent = soldCount;
  }
  let currentProductFilter = "all";
  function renderProducts() {
    const q = $("#pSearch").value.trim().toLowerCase();
    summary();

    const filtered = products.filter((p) => {
      if (q && !(p.name || "").toLowerCase().includes(q)) return false;
      if (currentProductFilter === "available" && isSold(p)) return false;
      if (currentProductFilter === "sold" && !isSold(p)) return false;
      return true;
    });
    const empty = !filtered.length;
    $("#productEmpty").hidden = !empty;
    // Sắp xếp: còn hàng lên trên, đã bán xuống dưới
    filtered.sort((a, b) => {
      const aSold = isSold(a) ? 1 : 0;
      const bSold = isSold(b) ? 1 : 0;
      return aSold - bSold;
    });
    $("#productList").innerHTML = filtered
      .map((p) => {
        const sold = isSold(p);
        return `
        <article class="pitem ${sold ? "is-sold" : ""}" data-id="${esc(p.id)}">
          <img class="pitem__img" src="${esc(asset(p.image || "images/favicon.svg"))}" alt="" loading="lazy" />
          <div class="pitem__info">
            <div class="pitem__name-wrap">
              <h4 class="pitem__name" title="${esc(p.name)}">${esc(p.name)}</h4>
              ${p.badge ? `<span class="pill pill--badge">${esc(p.badge)}</span>` : ""}
            </div>
            <div class="pitem__meta">
              <b class="pitem__price">${fmt(p.price)}</b>
              <span class="pill pill--status ${sold ? "pill--sold" : ""}">${sold ? "Đã bán" : "Còn hàng"}</span>
              <span class="pill pill--sl">SL: ${sold ? 0 : p.stock}</span>
            </div>
          </div>
          <div class="pitem__qty">
            <button type="button" class="ic" data-act="minus" aria-label="Giảm">−</button>
            <button type="button" class="ic" data-act="plus" aria-label="Tăng">+</button>
          </div>
          <div class="pitem__act">
            <button type="button" class="ic ic--edit" data-act="edit" aria-label="Sửa">${ICON_EDIT}</button>
            <button type="button" class="ic ic--del" data-act="del" aria-label="Xoá">${ICON_DEL}</button>
          </div>
        </article>`;
      }).join("");
  }
  $("#pSearch").addEventListener("input", renderProducts);

  // Tab lọc trạng thái sản phẩm
  $("#productFilterTabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".filter-tab");
    if (!tab) return;
    $$("#productFilterTabs .filter-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    currentProductFilter = tab.dataset.pstatus || "all";
    renderProducts();
  });

  // cập nhật số lượng tại chỗ, gộp nhiều lần bấm thành 1 lần lưu
  const stockTimers = {};
  function patchRow(row, p) {
    const sold = isSold(p);
    row.classList.toggle("is-sold", sold);
    const pill = row.querySelector(".pill--status") || row.querySelector(".pill");
    if (pill) {
      pill.textContent = sold ? "Đã bán" : "Còn hàng";
      pill.classList.toggle("pill--sold", sold);
    }
    const sl = row.querySelector(".pill--sl");
    if (sl) {
      sl.textContent = "SL: " + (sold ? 0 : p.stock);
      sl.classList.remove("bump"); void sl.offsetWidth; sl.classList.add("bump");
    }
    summary();
  }

  $("#productList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const row = b.closest(".pitem");
    const p = products.find((x) => x.id === row.dataset.id); if (!p) return;
    const act = b.dataset.act;

    if (act === "plus" || act === "minus") {
      const prevSold = isSold(p);
      p.stock = Math.max(0, (Number(p.stock) || 0) + (act === "plus" ? 1 : -1));
      p.status = p.stock === 0 ? "sold" : "available";
      const nowSold = isSold(p);
      if (currentProductFilter !== "all" && prevSold !== nowSold) {
        renderProducts();
      } else {
        patchRow(row, p);
      }
      setSave("busy");
      clearTimeout(stockTimers[p.id]);
      stockTimers[p.id] = setTimeout(() => {
        run(async () => must(await sb.from("products").update({ stock: p.stock, status: p.status }).eq("id", p.id)));
      }, 500);
      return;
    }
    if (act === "edit") return openProduct(p);
    if (act === "del") {
      askDelete({ title: "Xoá sản phẩm này?", text: "Có thể khôi phục trong mục Đã xoá.", img: p.image, ok: "Xoá" })
        .then(async (yes) => {
          if (!yes) return;
          const at = new Date().toISOString();
          await run(async () => must(await sb.from("products").update({ deleted_at: at }).eq("id", p.id)));
          products = products.filter((x) => x !== p);
          p.deleted_at = at;
          trash.unshift({ type: "product", row: p });
          renderProducts(); renderTrash();
          toast("Đã xoá sản phẩm", { label: "Hoàn tác", fn: () => restore("product", p.id) });
        }).catch(() => { });
    }
  });

  /* ---------- Form thêm / sửa ---------- */
  let editing = null, formImage = "", formImage2 = "", formVideo = "", formVideoFile = null;

  function setPreview1(src) {
    formImage = src || "";
    const img = $("#pImgPreview"), hint = $("#pImgHint"), del = $("#btnDelImg1");
    if (src) {
      img.src = asset(src); img.hidden = false; hint.hidden = true;
      if (del) del.hidden = false;
    } else {
      img.removeAttribute("src"); img.hidden = true; hint.hidden = false;
      if (del) del.hidden = true;
    }
  }

  function setPreview2(src) {
    formImage2 = src || "";
    const img = $("#pImg2Preview"), hint = $("#pImg2Hint"), del = $("#btnDelImg2");
    if (src) {
      img.src = asset(src); img.hidden = false; hint.hidden = true;
      if (del) del.hidden = false;
    } else {
      img.removeAttribute("src"); img.hidden = true; hint.hidden = false;
      if (del) del.hidden = true;
    }
  }

  function setPreviewVideo(src, file = null) {
    formVideo = src || "";
    formVideoFile = file;
    const vid = $("#pVideoPreview"), hint = $("#pVideoHint"), del = $("#btnDelVideo");
    if (src) {
      vid.src = asset(src); vid.hidden = false; hint.hidden = true;
      vid.play().catch(() => {});
      if (del) del.hidden = false;
    } else {
      try { vid.pause(); } catch (_) {}
      vid.removeAttribute("src"); vid.hidden = true; hint.hidden = false;
      if (del) del.hidden = true;
    }
  }

  function moneyVal(v) { return parseInt(String(v).replace(/\D/g, ""), 10) || 0; }
  function moneyFmt(v) {
    const d = String(v ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  }

  function openProduct(p = null) {
    editing = p;
    $("#pFormTitle").textContent = p ? "Sửa sản phẩm" : "Thêm sản phẩm";
    $("#fName").value = p?.name || "";
    $("#fPrice").value = p ? moneyFmt(p.price) : "";
    $("#fStock").value = p?.stock ?? 1;
    $("#fStatus").value = p && isSold(p) ? "sold" : "available";
    $("#fBadge").value = p?.badge || "";

    setPreview1(p?.image || "");
    setPreview2(p?.image2 || "");
    setPreviewVideo(p?.video || "", null);

    openModal("#pModal");
    setTimeout(() => $("#fName").focus(), 50);
  }
  $("#btnAddProduct").addEventListener("click", () => openProduct(null));

  // Nút xóa ảnh/video trong form
  $("#btnDelImg1")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setPreview1(""); });
  $("#btnDelImg2")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setPreview2(""); });
  $("#btnDelVideo")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setPreviewVideo(""); });

  /* Giá: tự thêm dấu chấm hàng nghìn khi gõ (500000 -> 500.000) */
  $("#fPrice").addEventListener("input", (e) => {
    const el = e.target;
    const digitsBefore = el.value.slice(0, el.selectionStart).replace(/\D/g, "").length;
    el.value = moneyFmt(el.value);
    let pos = 0, seen = 0;                       // giữ con trỏ đúng chỗ
    while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos);
  });

  // Chọn ảnh 1
  $("#pImgInput").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { setPreview1(await readImage(f, 900)); } catch { toast("Không đọc được ảnh 1"); }
    e.target.value = "";
  });

  // Chọn ảnh 2
  $("#pImg2Input")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { setPreview2(await readImage(f, 900)); } catch { toast("Không đọc được ảnh 2"); }
    e.target.value = "";
  });

  // Chọn video
  $("#pVideoInput")?.addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      alert("⚠️ Dung lượng video tối đa là 50MB. Vui lòng nén video hoặc chọn video nhẹ hơn nhé!");
      e.target.value = "";
      return;
    }
    const blobUrl = URL.createObjectURL(f);
    setPreviewVideo(blobUrl, f);
    e.target.value = "";
  });

  $("#pForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!formImage) { toast("Hãy chọn ảnh chính (Ảnh 1) cho card"); return; }
    const btn = $("#pForm button[type=submit]");
    let stock = Math.max(0, parseInt($("#fStock").value, 10) || 0);
    if ($("#fStatus").value === "sold") stock = 0;
    const data = {
      name: $("#fName").value.trim(),
      price: moneyVal($("#fPrice").value),
      stock,
      status: stock === 0 ? "sold" : "available",
      badge: $("#fBadge").value.trim(),
    };
    btn.disabled = true; btn.textContent = "Đang lưu…";
    try {
      await run(async () => {
        const oldImage = editing?.image;
        const oldImage2 = editing?.image2;
        const oldVideo = editing?.video;

        // 1. Upload Ảnh 1
        if (formImage.startsWith("data:")) {
          data.image = await uploadImage(formImage, "products");
        } else {
          data.image = formImage || null;
        }

        // 2. Upload Ảnh 2
        if (formImage2.startsWith("data:")) {
          data.image2 = await uploadImage(formImage2, "products");
        } else {
          data.image2 = formImage2 || null;
        }

        // 3. Upload Video
        if (formVideoFile) {
          btn.textContent = "Đang tải video lên…";
          data.video = await uploadVideo(formVideoFile, "products");
        } else {
          data.video = formVideo || null;
        }

        if (editing) {
          const row = must(await sb.from("products").update(data).eq("id", editing.id).select().single());
          Object.assign(editing, row);
          if (data.image && oldImage && oldImage !== data.image) removeImage(oldImage);
          if (oldImage2 && oldImage2 !== data.image2) removeImage(oldImage2);
          if (oldVideo && oldVideo !== data.video) removeImage(oldVideo);
        } else {
          data.position = products.length ? Math.min(...products.map((x) => x.position || 0)) - 1 : 0;
          const row = must(await sb.from("products").insert(data).select().single());
          products.unshift(row);
        }
      });
      renderProducts(); closeModals();
      toast(editing ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || err);
      if (/image2|video|column/i.test(msg)) {
        alert("⚠️ Cần tạo cột 'image2' và 'video' trong Supabase SQL Editor:\n\nALTER TABLE products ADD COLUMN IF NOT EXISTS image2 TEXT;\nALTER TABLE products ADD COLUMN IF NOT EXISTS video TEXT;\n\nChạy lệnh xong bấm Lưu lại là được nhé!");
      }
    }
    finally { btn.disabled = false; btn.textContent = "Lưu sản phẩm"; }
  });

  /* =========================================================
     ĐƠN HÀNG (ORDERS)
     ========================================================= */
  let currentOrderFilter = "all";
  let viewingOrder = null;

  function mergeLocalOrders() {
    try {
      const local = JSON.parse(localStorage.getItem("bloomcard_orders") || "[]");
      local.forEach((lo) => {
        const id = lo.id || lo.code;
        if (!id) return;
        const existing = orders.find((o) => o.id === id);
        if (!existing) {
          orders.push({
            id: id,
            customer_name: lo.customer_name || lo.name || "Khách hàng",
            phone: lo.phone || "",
            email: lo.email || "",
            street: lo.street || "",
            ward: lo.ward || "",
            district: lo.district || "",
            city: lo.city || "",
            address: lo.address || "",
            items: lo.items || [],
            subtotal: lo.subtotal || lo.total || 0,
            status: lo.status || "pending",
            created_at: lo.createdAt || lo.created_at || new Date().toISOString()
          });
        }
      });
    } catch (e) {}
  }

  async function loadOrders(isRefresh = false) {
    const listEl = $("#ordersList");
    const emptyEl = $("#orderEmpty");
    if (listEl && (!orders.length || isRefresh)) {
      listEl.innerHTML = '<div class="state-box state-box--list"><span class="spinner"></span>Đang tải danh sách đơn hàng…</div>';
      if (emptyEl) emptyEl.hidden = true;
    }
    try {
      if (sb) {
        const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false });
        if (!error && data) {
          // Tách đơn đã soft-delete vào trashedOrders
          orders = data.filter((o) => !o.deleted_at);
          const newTrashed = data.filter((o) => o.deleted_at);
          // Giữ lại các đơn trước chưa có trên Supabase (offline), mới ghép vào
          const existingIds = new Set(newTrashed.map((o) => o.id));
          trashedOrders = [
            ...newTrashed,
            ...trashedOrders.filter((o) => !existingIds.has(o.id))
          ];
        }
      }
    } catch (e) {
      console.warn("Không tải được đơn từ Supabase:", e);
    }
    mergeLocalOrders();
    renderOrders();
    renderTrash();
  }

  function getStatusInfo(status) {
    switch (status) {
      case "completed":
        return { label: "Đã hoàn thành", cls: "order-pill--completed" };
      case "cancelled":
        return { label: "Đã hủy", cls: "order-pill--cancelled" };
      case "pending":
      default:
        return { label: "Chờ xử lý", cls: "order-pill--pending" };
    }
  }

  function renderOrders() {
    const q = ($("#oSearch")?.value || "").trim().toLowerCase();
    const listEl = $("#ordersList");
    const emptyEl = $("#orderEmpty");
    const badgeEl = $("#ordersBadge");
    const summaryEl = $("#oSummary");

    // Đếm số lượng
    const totalAll = orders.length;
    const totalPending = orders.filter((o) => o.status === "pending" || !o.status).length;
    const totalCompleted = orders.filter((o) => o.status === "completed").length;
    const totalCancelled = orders.filter((o) => o.status === "cancelled").length;

    if ($("#countAll")) $("#countAll").textContent = totalAll;
    if ($("#countPending")) $("#countPending").textContent = totalPending;
    if ($("#countCompleted")) $("#countCompleted").textContent = totalCompleted;
    if ($("#countCancelled")) $("#countCancelled").textContent = totalCancelled;

    if (badgeEl) {
      badgeEl.hidden = totalPending === 0;
      badgeEl.textContent = totalPending;
    }

    if (summaryEl) {
      summaryEl.textContent = `${totalAll} đơn hàng · ${totalPending} chờ xử lý · ${totalCompleted} hoàn thành`;
      syncMtopSub();
    }

    // Lọc theo tab
    let filtered = orders.filter((o) => {
      const st = o.status || "pending";
      if (currentOrderFilter === "pending" && st !== "pending") return false;
      if (currentOrderFilter === "completed" && st !== "completed") return false;
      if (currentOrderFilter === "cancelled" && st !== "cancelled") return false;
      return true;
    });

    // Tìm kiếm
    if (q) {
      filtered = filtered.filter((o) => {
        const id = (o.id || "").toLowerCase();
        const name = (o.customer_name || o.name || "").toLowerCase();
        const phone = (o.phone || "").toLowerCase();
        const addr = (o.address || `${o.street || ""} ${o.ward || ""} ${o.district || ""} ${o.city || ""}`).toLowerCase();
        return id.includes(q) || name.includes(q) || phone.includes(q) || addr.includes(q);
      });
    }

    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = filtered.length > 0;

    listEl.innerHTML = filtered.map((o) => {
      const st = o.status || "pending";
      const isCompleted = st === "completed";
      const isCancelled = st === "cancelled";
      const items = Array.isArray(o.items) ? o.items : [];
      const totalAmount = o.subtotal || o.total || 0;

      // Render danh sách sản phẩm tóm tắt
      const itemsHtml = items.slice(0, 3).map((it) => `
        <span class="oitem-prod-badge" title="${esc(it.name)}">
          <img src="${esc(asset(it.image || "images/card-sample.svg"))}" alt="" class="oitem-prod-img" onerror="this.src='../images/card-sample.svg'" />
          <span class="oitem-prod-name">${esc(it.name || "Photocard")}</span>
          <span class="oitem-prod-qty">x${it.qty || 1}</span>
        </span>
      `).join("");

      const moreCount = items.length - 3;
      const moreHtml = moreCount > 0 ? `<span class="oitem-prod-more">+${moreCount} món</span>` : "";

      return `
        <article class="oitem status-${esc(st)}" data-id="${esc(o.id)}">
          <!-- Header: mã đơn + thời gian -->
          <div class="oitem__header">
            <strong class="oitem__id">#${esc(o.id)}</strong>
            <span class="oitem__time">${ago(o.created_at || new Date())}</span>
          </div>

          <!-- Sản phẩm -->
          <div class="oitem__products">
            ${itemsHtml || '<span class="muted msg-code">Không có chi tiết</span>'}
            ${moreHtml}
          </div>

          <!-- Footer: số tiền + nút hành động trên cùng 1 hàng -->
          <div class="oitem__footer">
            <b class="oitem__amount">${fmt(totalAmount)}</b>
            <div class="oitem__actions">
              <button type="button" class="btn btn--sm btn--complete" data-act="complete"
                ${isCompleted ? "disabled" : ""} title="${isCompleted ? "Đã hoàn thành" : "Hoàn thành đơn"}"
                aria-label="Hoàn thành">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ${isCompleted ? "Xong" : "Hoàn thành"}
              </button>
              <button type="button"
                class="btn btn--sm btn--cancel ${isCancelled ? "is-cancelled" : ""}"
                data-act="cancel"
                title="${isCancelled ? "Ấn đúp để xóa đơn" : "Hủy đơn (đúp để xóa)"}"
                aria-label="Hủy">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                ${isCancelled ? "Đã hủy" : "Hủy"}
              </button>
              <button type="button" class="btn btn--sm btn--detail" data-act="detail"
                title="Xem chi tiết đơn hàng" aria-label="Chi tiết">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Chi tiết
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  /* =========================================================
     GỬI EMAIL XÁC NHẬN ĐƠN HÀNG QUA GOOGLE APPS SCRIPT
     ========================================================= */
  const APPS_SCRIPT_MAILER_URL = "https://script.google.com/macros/s/AKfycbzSIz1hJ_FqW4rkF5E4A81dKqsRGn5yCxHBCneJzo6-qqYUQFvT5c1F8WbcHGhfhheNMw/exec";

  function formatFullAddress(order) {
    if (!order) return "--";
    if (order.address && (order.address.includes("Phường/xã") || order.address.includes("Quận/huyện") || order.address.includes("Thành phố/tỉnh"))) {
      return order.address;
    }
    const street = (order.street || "").trim();
    const ward = (order.ward || "").trim();
    const district = (order.district || "").trim();
    const city = (order.city || "").trim();
    const parts = [];
    if (street) parts.push(street);
    if (ward) parts.push(ward.toLowerCase().startsWith("phường/xã") ? ward : `Phường/xã: ${ward}`);
    if (district) parts.push(district.toLowerCase().startsWith("quận/huyện") ? district : `Quận/huyện: ${district}`);
    if (city) parts.push(city.toLowerCase().startsWith("thành phố/tỉnh") ? city : `Thành phố/tỉnh: ${city}`);
    return parts.join(", ") || order.address || [street, ward, district, city].filter(Boolean).join(", ") || "--";
  }

  async function sendOrderConfirmationEmail(order) {
    const email = (order.email || "").trim();
    if (!email || !email.includes("@") || email.includes("khachhang@bloomcard.vn")) {
      return { sent: false, reason: "no_email" };
    }

    try {
      const payload = {
        id: order.id || order.code,
        customer_name: order.customer_name || order.name,
        name: order.name || order.customer_name,
        phone: order.phone,
        email: email,
        street: order.street,
        ward: order.ward,
        district: order.district,
        city: order.city,
        address: formatFullAddress(order),
        items: order.items || [],
        total: order.total || order.subtotal || 0,
        subtotal: order.subtotal || order.total || 0
      };

      await fetch(APPS_SCRIPT_MAILER_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      return { sent: true, email: email };
    } catch (err) {
      console.warn("Lỗi gửi email xác nhận:", err);
      return { sent: false, error: err };
    }
  }

  // Đồng bộ trừ kho / hoàn kho sản phẩm trên Supabase khi đổi trạng thái đơn
  async function syncOrderStockChange(order, fromStatus, toStatus) {
    if (!sb || !order || !Array.isArray(order.items) || !order.items.length) return;

    // 1. Chuyển sang Hoàn thành (completed): Trừ kho trên Supabase & đánh dấu đã bán nếu stock <= 0
    // Chỉ trừ nếu đơn này chưa từng có completed_at (chưa bị trừ kho)
    if (toStatus === "completed" && !order.completed_at) {
      for (const item of order.items) {
        if (!item || !item.id) continue;
        const buyQty = Number(item.qty) || 1;
        const prod = products.find((p) => String(p.id) === String(item.id));
        const currentStock = prod ? (Number(prod.stock) ?? 1) : 1;
        const newStock = Math.max(0, currentStock - buyQty);
        const newStatus = newStock === 0 ? "sold" : "available";

        if (prod) {
          prod.stock = newStock;
          prod.status = newStatus;
        }

        try {
          await run(async () => {
            const res = await sb.from("products").update({
              stock: newStock,
              status: newStatus
            }).eq("id", item.id);
            if (res.error) throw res.error;
          });
        } catch (e) {
          console.warn("Lỗi trừ tồn kho sản phẩm:", item.id, e);
        }
      }
      order.completed_at = new Date().toISOString();
      renderProducts();
      summary();
    }
    // 2. Nếu đơn đã từng hoàn thành (có completed_at) mà bị Hủy hoặc Xóa: Hoàn lại kho trên Supabase & chuyển thành Còn hàng
    else if (order.completed_at && (toStatus === "cancelled" || toStatus === "deleted")) {
      for (const item of order.items) {
        if (!item || !item.id) continue;
        const buyQty = Number(item.qty) || 1;
        const prod = products.find((p) => String(p.id) === String(item.id));
        const currentStock = prod ? (Number(prod.stock) ?? 0) : 0;
        const restoredStock = currentStock + buyQty;

        if (prod) {
          prod.stock = restoredStock;
          prod.status = "available";
        }

        try {
          await run(async () => {
            const res = await sb.from("products").update({
              stock: restoredStock,
              status: "available"
            }).eq("id", item.id);
            if (res.error) throw res.error;
          });
        } catch (e) {
          console.warn("Lỗi hoàn trả tồn kho sản phẩm:", item.id, e);
        }
      }
      order.completed_at = null;
      renderProducts();
      summary();
    }
  }

  async function updateOrderStatus(orderId, newStatus) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const prevStatus = order.status;
    if (prevStatus === newStatus) return;

    order.status = newStatus;
    if (newStatus === "cancelled") order.cancelled_at = new Date().toISOString();

    renderOrders();

    // Đồng bộ tồn kho sản phẩm tương ứng (cập nhật completed_at nếu thành công)
    await syncOrderStockChange(order, prevStatus, newStatus);

    // Cập nhật Supabase
    try {
      if (sb) {
        await sb.from("orders").update({
          status: newStatus,
          completed_at: order.completed_at || null,
          cancelled_at: order.cancelled_at || null
        }).eq("id", orderId);
      }
    } catch (e) {
      console.warn("Lỗi cập nhật trạng thái đơn trên Supabase:", e);
    }

    // Cập nhật localStorage
    try {
      const local = JSON.parse(localStorage.getItem("bloomcard_orders") || "[]");
      const target = local.find((lo) => (lo.id || lo.code) === orderId);
      if (target) {
        target.status = newStatus;
        localStorage.setItem("bloomcard_orders", JSON.stringify(local));
      }
    } catch (e) {}

    // Tự động gửi email xác nhận đơn hàng khi bấm Hoàn thành
    if (newStatus === "completed") {
      const mailRes = await sendOrderConfirmationEmail(order);
      if (mailRes.sent) {
        toast(`Đã hoàn thành đơn #${orderId} & gửi email xác nhận cho khách!`);
      } else {
        toast(`Đã hoàn thành đơn #${orderId} (Khách không cung cấp email)`);
      }
    } else {
      toast(`Đã hủy đơn #${orderId}`);
    }
  }

  async function deleteOrder(orderId) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    // Nếu đơn đã từng hoàn thành (đã bị trừ kho) mà bị xóa, hoàn lại tồn kho
    if (order.completed_at) {
      await syncOrderStockChange(order, "completed", "deleted");
    }

    // Đánh dấu deleted_at và chuyển vào trashedOrders
    order.deleted_at = new Date().toISOString();
    orders = orders.filter((o) => o.id !== orderId);
    trashedOrders.unshift(order);
    renderOrders();
    renderTrash();

    // Cập nhật Supabase (soft-delete bằng trường deleted_at)
    try {
      if (sb) {
        await sb.from("orders").update({ deleted_at: order.deleted_at }).eq("id", orderId);
      }
    } catch (e) {
      // Nếu cột deleted_at chưa tồn tại, xóa hẳn như cũ
      try {
        if (sb) await sb.from("orders").delete().eq("id", orderId);
      } catch (e2) {
        console.warn("Lỗi xóa đơn trên Supabase:", e2);
      }
    }

    // Xóa khỏi localStorage
    try {
      const local = JSON.parse(localStorage.getItem("bloomcard_orders") || "[]");
      const filtered = local.filter((lo) => (lo.id || lo.code) !== orderId);
      localStorage.setItem("bloomcard_orders", JSON.stringify(filtered));
    } catch (e) {}

    toast(`Đã chuyển đơn #${orderId} vào mục Đã xoá`, { label: "Hoàn tác", fn: () => restoreOrder(orderId) });
  }

  async function restoreOrder(orderId) {
    const idx = trashedOrders.findIndex((o) => o.id === orderId);
    if (idx < 0) return;
    const order = trashedOrders[idx];
    order.deleted_at = null;
    order.status = order.status === "cancelled" ? "cancelled" : order.status || "pending";
    trashedOrders.splice(idx, 1);
    orders.unshift(order);
    renderOrders();
    renderTrash();
    // Cập nhật Supabase
    try {
      if (sb) await sb.from("orders").update({ deleted_at: null }).eq("id", orderId);
    } catch (e) { console.warn(e); }
    toast(`Đã khôi phục đơn #${orderId}`);
  }

  function openOrderDetail(order) {
    viewingOrder = order;

    $("#odModalCode").textContent = "#" + order.id;

    const dateStr = order.created_at ? new Date(order.created_at).toLocaleString("vi-VN") : "--";
    if ($("#odModalDate")) $("#odModalDate").textContent = `Đặt lúc: ${dateStr}`;

    if ($("#odCustomerName")) $("#odCustomerName").textContent = order.customer_name || order.name || "--";
    if ($("#odCustomerPhone")) $("#odCustomerPhone").textContent = order.phone || "--";
    if ($("#odCustomerEmail")) $("#odCustomerEmail").textContent = order.email || "Không có";

    // Địa chỉ đầy đủ
    const fullAddress = formatFullAddress(order);
    if ($("#odCustomerAddress")) $("#odCustomerAddress").textContent = fullAddress;

    // Danh sách sản phẩm chi tiết
    const items = Array.isArray(order.items) ? order.items : [];
    const listEl = $("#odProductsList");
    if (listEl) {
      if (items.length > 0) {
        listEl.innerHTML = items.map((it) => {
          const itemPrice = Number(it.price) || 0;
          const itemQty = Number(it.qty) || 1;
          const itemSub = itemPrice * itemQty;
          return `
            <div class="od-prod-row">
              <img src="${esc(asset(it.image || "images/card-sample.svg"))}" alt="" class="od-prod-img" onerror="this.src='../images/card-sample.svg'" />
              <div class="od-prod-info">
                <h4>${esc(it.name || "Photocard")}</h4>
                <span>Đơn giá: ${fmt(itemPrice)}</span>
              </div>
              <div class="od-prod-qty">SL: <b>${itemQty}</b></div>
              <div class="od-prod-sub">${fmt(itemSub)}</div>
            </div>
          `;
        }).join("");
      } else {
        listEl.innerHTML = '<p class="msg-code">Không có chi tiết sản phẩm.</p>';
      }
    }

    const total = order.subtotal || order.total || 0;
    if ($("#odSubtotalVal")) $("#odSubtotalVal").textContent = fmt(total);
    if ($("#odTotalVal")) $("#odTotalVal").textContent = fmt(total);

    openModal("#orderModal");
  }

  // Quản lý bấm đúp (double-click) vào nút HỦY để xóa đơn
  let cancelTimer = null;
  let lastCancelId = null;

  // Lắng nghe dblclick trên danh sách đơn hàng
  $("#ordersList")?.addEventListener("dblclick", async (e) => {
    const btn = e.target.closest('[data-act="cancel"]');
    if (!btn) return;
    const row = btn.closest(".oitem");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;

    if (cancelTimer) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
      lastCancelId = null;
    }

    await deleteOrder(id);
  });

  // Sự kiện danh sách đơn hàng (click)
  $("#ordersList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const row = btn.closest(".oitem");
    if (!row) return;
    const id = row.dataset.id;
    const order = orders.find((o) => o.id === id);
    if (!order) return;

    const act = btn.dataset.act;
    if (act === "complete") {
      await updateOrderStatus(id, "completed");
    } else if (act === "cancel") {
      // Nếu bấm lần 2 liên tiếp nhanh (ấn đúp)
      if (cancelTimer && lastCancelId === id) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
        lastCancelId = null;
        await deleteOrder(id);
        return;
      }

      // Đơn đã hủy từ trước: nếu bấm 1 lần thì chỉ ghi nhớ để chờ xem có ấn đúp xóa không
      if (order.status === "cancelled") {
        lastCancelId = id;
        cancelTimer = setTimeout(() => {
          cancelTimer = null;
          lastCancelId = null;
        }, 320);
        return;
      }

      // Đơn chưa hủy: chờ 280ms để phân biệt bấm 1 lần (hủy) hay ấn đúp (xóa)
      lastCancelId = id;
      cancelTimer = setTimeout(async () => {
        cancelTimer = null;
        lastCancelId = null;
        await updateOrderStatus(id, "cancelled");
      }, 280);
    } else if (act === "detail") {
      openOrderDetail(order);
    }
  });

  // Tìm kiếm đơn hàng
  $("#oSearch")?.addEventListener("input", renderOrders);

  // Tab lọc trạng thái đơn hàng
  $("#orderFilterTabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".filter-tab");
    if (!tab) return;
    $$("#orderFilterTabs .filter-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    currentOrderFilter = tab.dataset.status || "all";
    renderOrders();
  });

  // Nút tải lại danh sách đơn hàng
  $("#btnRefreshOrders")?.addEventListener("click", async () => {
    const btn = $("#btnRefreshOrders");
    if (btn) btn.disabled = true;
    toast("Đang tải lại danh sách đơn hàng…");
    await loadOrders(true);
    if (btn) btn.disabled = false;
    toast("Đã cập nhật đơn hàng mới nhất!");
  });


  /* =========================================================
     FEEDBACK
     ========================================================= */
  function renderFeedback() {
    const F = feedbacks;
    $("#fSummary").textContent = `${F.length} ảnh đang hiện trên web`;
    syncMtopSub();
    $("#fbEmpty").hidden = F.length > 0;
    $("#fbList").innerHTML = F.map((f, i) => `
      <figure class="fitem" data-id="${esc(f.id)}">
        <img src="${esc(asset(f.image))}" alt="Feedback ${i + 1}" loading="lazy" />
        <figcaption><span>#${i + 1}</span><div>
          <button type="button" class="ic" data-act="left" aria-label="Lên trước" ${i === 0 ? "disabled" : ""}>←</button>
          <button type="button" class="ic" data-act="right" aria-label="Ra sau" ${i === F.length - 1 ? "disabled" : ""}>→</button>
          <button type="button" class="ic ic--del" data-act="del" aria-label="Xoá">${ICON_DEL}</button>
        </div></figcaption>
      </figure>`).join("");
  }
  async function addFeedbackFiles(files) {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    let done = 0;
    let pos = feedbacks.length ? Math.max(...feedbacks.map((x) => x.position || 0)) + 1 : 0;
    for (const f of imgs) {
      toast(`Đang tải ảnh ${done + 1}/${imgs.length}…`);
      try {
        await run(async () => {
          const url = await uploadImage(await readImage(f, 1000), "feedback");
          const row = must(await sb.from("feedbacks").insert({ image: url, position: pos++ }).select().single());
          feedbacks.push(row);
        });
        done++;
        renderFeedback();
      } catch (e) { /* đã báo lỗi */ }
    }
    if (done) toast(`Đã thêm ${done} ảnh feedback`);
  }
  $("#fbInput").addEventListener("change", (e) => { addFeedbackFiles(e.target.files); e.target.value = ""; });
  const drop = $("#fbDrop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => addFeedbackFiles(e.dataTransfer.files));

  $("#fbList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".fitem").dataset.id;
    const i = feedbacks.findIndex((x) => x.id === id); if (i < 0) return;
    const f = feedbacks[i];

    if (b.dataset.act === "left" || b.dataset.act === "right") {
      const j = b.dataset.act === "left" ? i - 1 : i + 1;
      if (j < 0 || j >= feedbacks.length) return;
      const g = feedbacks[j];
      [feedbacks[i], feedbacks[j]] = [g, f];
      // đánh lại số thứ tự cho cả danh sách để không bị trùng
      feedbacks.forEach((x, k) => (x._newPos = k));
      renderFeedback();
      const changed = feedbacks.filter((x) => x.position !== x._newPos);
      changed.forEach((x) => (x.position = x._newPos));
      run(async () => {
        for (const x of changed) must(await sb.from("feedbacks").update({ position: x.position }).eq("id", x.id));
      }).catch(() => { });
      return;
    }
    if (b.dataset.act === "del") {
      const yes = await askDelete({ title: "Xoá ảnh feedback này?", text: "Có thể khôi phục trong mục Đã xoá.", img: f.image, wide: true, ok: "Xoá" });
      if (!yes) return;
      const at = new Date().toISOString();
      try {
        await run(async () => must(await sb.from("feedbacks").update({ deleted_at: at }).eq("id", f.id)));
        feedbacks = feedbacks.filter((x) => x !== f);
        f.deleted_at = at;
        trash.unshift({ type: "feedback", row: f });
        renderFeedback(); renderTrash();
        toast("Đã xoá ảnh feedback", { label: "Hoàn tác", fn: () => restore("feedback", f.id) });
      } catch (e) { }
    }
  });

  /* =========================================================
     ĐÃ XOÁ
     ========================================================= */
  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "vừa xong";
    if (m < 60) return m + " phút trước";
    const h = Math.round(m / 60);
    if (h < 24) return h + " giờ trước";
    const d = Math.round(h / 24);
    return d < 30 ? d + " ngày trước" : new Date(iso).toLocaleDateString("vi-VN");
  }
  function renderTrash() {
    const totalP = trash.filter((x) => x.type === "product").length;
    const totalF = trash.filter((x) => x.type === "feedback").length;
    const totalO = trashedOrders.length;
    const totalAll = totalP + totalF + totalO;

    // Cập nhật badge trên menu
    $("#trashBadge").hidden = !totalAll;
    $("#trashBadge").textContent = totalAll;

    // Cập nhật số lượng trên từng tab
    if ($("#trashCountProducts")) $("#trashCountProducts").textContent = totalP;
    if ($("#trashCountOrders")) $("#trashCountOrders").textContent = totalO;
    if ($("#trashCountFeedbacks")) $("#trashCountFeedbacks").textContent = totalF;

    $("#tSummary").textContent = totalAll
      ? `${totalAll} mục đã xoá · bấm Khôi phục để đưa lại lên web`
      : "Nơi giữ những gì bạn đã xoá";
    syncMtopSub();

    // Lọc theo tab đang chọn
    let list;
    if (currentTrashFilter === "products") {
      list = trash.filter((x) => x.type === "product");
    } else if (currentTrashFilter === "feedbacks") {
      list = trash.filter((x) => x.type === "feedback");
    } else {
      list = trashedOrders.map((o) => ({ type: "order", row: o }));
    }

    const isEmpty = !list.length;
    $("#trashEmpty").hidden = !isEmpty;
    $("#btnEmptyTrash").hidden = isEmpty;

    $("#trashList").innerHTML = list.map((t) => {
      const r = t.row;
      if (t.type === "order") {
        const items = Array.isArray(r.items) ? r.items : [];
        const previewImg = items[0]?.image || "";
        const names = items.map((i) => esc(i.name || "Photocard") + (i.qty > 1 ? ` x${i.qty}` : "")).slice(0, 3).join(", ");
        return `
        <article class="titem" data-type="order" data-id="${esc(r.id)}">
          ${previewImg ? `<img class="titem__img" src="${esc(asset(previewImg))}" alt="" loading="lazy" />` : `<div class="titem__img titem__img--placeholder"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>`}
          <div class="titem__info">
            <span class="titem__type titem__type--order">Đơn hàng</span>
            <b>#${esc(r.id)}</b>
            <small>${esc(r.customer_name || "Khách hàng")} · ${fmt(r.subtotal || r.total || 0)}</small>
            ${names ? `<small class="titem__items">${names}</small>` : ""}
            <small>Xoá ${ago(r.deleted_at || r.cancelled_at || r.created_at)}</small>
          </div>
          <div class="titem__act">
            <button type="button" class="btn btn--sm" data-act="restore-order">Khôi phục</button>
            <button type="button" class="ic ic--del" data-act="purge-order" aria-label="Xoá vĩnh viễn">✕</button>
          </div>
        </article>`;
      }
      const isP = t.type === "product";
      return `
      <article class="titem" data-type="${t.type}" data-id="${esc(r.id)}">
        <img class="titem__img ${isP ? "" : "is-wide"}" src="${esc(asset(r.image || "images/favicon.svg"))}" alt="" loading="lazy" />
        <div class="titem__info">
          <span class="titem__type ${isP ? "" : "is-fb"}">${isP ? "Sản phẩm" : "Feedback"}</span>
          <b>${isP ? esc(r.name) : "Ảnh feedback"}</b>
          <small>${isP ? fmt(r.price) + " · " : ""}Xoá ${ago(r.deleted_at)}</small>
        </div>
        <div class="titem__act">
          <button type="button" class="btn btn--sm" data-act="restore">Khôi phục</button>
          <button type="button" class="ic ic--del" data-act="purge" aria-label="Xoá vĩnh viễn">✕</button>
        </div>
      </article>`;
    }).join("");
  }

  // Tab lọc trong mục Đã xoá
  $("#trashFilterTabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".filter-tab");
    if (!tab) return;
    $$("#trashFilterTabs .filter-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    currentTrashFilter = tab.dataset.trashType || "products";
    renderTrash();
  });

  const tableOf = (type) => (type === "product" ? "products" : "feedbacks");

  async function restore(type, id) {
    const t = trash.find((x) => x.type === type && x.row.id === id); if (!t) return;
    try {
      await run(async () => must(await sb.from(tableOf(type)).update({ deleted_at: null }).eq("id", id)));
      t.row.deleted_at = null;
      trash = trash.filter((x) => x !== t);
      if (type === "product") {
        products.push(t.row);
        products.sort((a, b) => (a.position || 0) - (b.position || 0));
      } else {
        feedbacks.push(t.row);
        feedbacks.sort((a, b) => (a.position || 0) - (b.position || 0));
      }
      renderProducts(); renderFeedback(); renderTrash();
      toast(type === "product" ? "Đã khôi phục sản phẩm" : "Đã khôi phục ảnh feedback");
    } catch (e) { }
  }

  $("#trashList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const el = b.closest(".titem"), type = el.dataset.type, id = el.dataset.id;

    // Xử lý đơn hàng
    if (type === "order") {
      if (b.dataset.act === "restore-order") return restoreOrder(id);
      const o = trashedOrders.find((x) => x.id === id); if (!o) return;
      const yes = await askDelete({ title: "Xóa vĩnh viễn đơn hàng?", text: "Không thể khôi phục lại.", ok: "Xóa vĩnh viễn" });
      if (!yes) return;
      try {
        if (sb) await sb.from("orders").delete().eq("id", id);
        trashedOrders = trashedOrders.filter((x) => x.id !== id);
        renderTrash(); toast("Đã xóa vĩnh viễn đơn hàng");
      } catch (e) { }
      return;
    }

    if (b.dataset.act === "restore") return restore(type, id);
    const t = trash.find((x) => x.type === type && x.row.id === id); if (!t) return;
    const yes = await askDelete({ title: "Xoá vĩnh viễn?", text: "Không thể khôi phục lại.", img: t.row.image, wide: type !== "product", ok: "Xoá vĩnh viễn" });
    if (!yes) return;
    try {
      await run(async () => must(await sb.from(tableOf(type)).delete().eq("id", id)));
      removeImage(t.row.image);
      trash = trash.filter((x) => x !== t);
      renderTrash(); toast("Đã xoá vĩnh viễn");
    } catch (e) { }
  });
  $("#btnEmptyTrash").addEventListener("click", async () => {
    let title, text, confirmFn;
    if (currentTrashFilter === "orders") {
      const n = trashedOrders.length;
      title = "Dọn sạch đơn hàng đã xóa?";
      text = `Xóa hẳn ${n} đơn hàng, không thể khôi phục.`;
      confirmFn = async () => {
        if (sb) {
          const ids = trashedOrders.map((o) => o.id);
          for (const id of ids) { try { await sb.from("orders").delete().eq("id", id); } catch (e) { } }
        }
        trashedOrders = [];
        renderTrash();
        toast("Đã dọn sạch đơn hàng đã xóa");
      };
    } else if (currentTrashFilter === "feedbacks") {
      const items = trash.filter((x) => x.type === "feedback");
      title = "Dọn sạch feedback đã xóa?";
      text = `Xóa hẳn ${items.length} ảnh feedback, không thể khôi phục.`;
      confirmFn = async () => {
        await run(async () => must(await sb.from("feedbacks").delete().not("deleted_at", "is", null)));
        items.forEach((t) => removeImage(t.row.image));
        trash = trash.filter((x) => x.type !== "feedback");
        renderTrash(); toast("Đã dọn sạch feedback");
      };
    } else {
      const items = trash.filter((x) => x.type === "product");
      title = "Dọn sạch sản phẩm đã xóa?";
      text = `Xóa hẳn ${items.length} sản phẩm, không thể khôi phục.`;
      confirmFn = async () => {
        await run(async () => must(await sb.from("products").delete().not("deleted_at", "is", null)));
        items.forEach((t) => removeImage(t.row.image));
        trash = trash.filter((x) => x.type !== "product");
        renderTrash(); toast("Đã dọn sạch sản phẩm");
      };
    }
    const yes = await askDelete({ title, text, ok: "Dọn sạch" });
    if (!yes) return;
    try { await confirmFn(); } catch (e) { }
  });

  /* =========================================================
     CÀI ĐẶT — Chế độ bảo trì
     ========================================================= */
  let maintMode = false;

  async function loadMaintenance() {
    try {
      const { data, error } = await sb.from("site_settings")
        .select("value").eq("key", "maintenance_mode").maybeSingle();
      if (!error && data) maintMode = data.value === "true";
    } catch (e) {
      console.warn("site_settings chưa tạo?", e);
    }
    updateMaintUI();
  }

  function updateMaintUI() {
    const toggle = $("#maintToggle");
    const toggleMob = $("#maintToggleMobile");
    const sideMaint = $("#sideMaint");
    const mtopMaint = $(".mtop-maint");

    if (toggle) {
      toggle.checked = maintMode;
      toggle.title = maintMode ? "Đang BẬT bảo trì (bấm để tắt)" : "Đang TẮT bảo trì (bấm để bật)";
    }
    if (toggleMob) {
      toggleMob.checked = maintMode;
      toggleMob.title = maintMode ? "Đang BẬT bảo trì (bấm để tắt)" : "Đang TẮT bảo trì (bấm để bật)";
    }
    if (sideMaint) sideMaint.classList.toggle("is-active", maintMode);
    if (mtopMaint) mtopMaint.classList.toggle("is-active", maintMode);
  }

  async function handleMaintToggle(e) {
    const on = e.target.checked;
    const t1 = $("#maintToggle");
    const t2 = $("#maintToggleMobile");
    if (t1) t1.disabled = true;
    if (t2) t2.disabled = true;

    try {
      await run(async () => {
        const { error } = await sb.from("site_settings")
          .upsert({ key: "maintenance_mode", value: on ? "true" : "false", updated_at: new Date().toISOString() },
                  { onConflict: "key" });
        if (error) throw error;
      });
      maintMode = on;
      updateMaintUI();
      toast(on ? "Đã BẬT bảo trì — website đang tạm đóng" : "Đã TẮT bảo trì — website hoạt động bình thường");
    } catch (err) {
      updateMaintUI();
    } finally {
      if (t1) t1.disabled = false;
      if (t2) t2.disabled = false;
    }
  }

  $("#maintToggle")?.addEventListener("change", handleMaintToggle);
  $("#maintToggleMobile")?.addEventListener("change", handleMaintToggle);

  /* =========================================================
     POPUP XOÁ + MODAL + TOAST
     ========================================================= */
  function askDelete({ title, text, img, wide, ok = "Xoá" }) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "confirm";
      wrap.innerHTML = `
        <div class="confirm__box" role="alertdialog" aria-modal="true" aria-labelledby="cfTitle" aria-describedby="cfText">
          ${img
            ? `<div class="confirm__img ${wide ? "is-wide" : ""}"><img src="${esc(asset(img))}" alt="" /><span class="confirm__ic"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></span></div>`
            : `<div class="confirm__icon">${ICON_DEL.replace(/18/g, "28")}</div>`}
          <h3 id="cfTitle">${esc(title)}</h3>
          <p id="cfText">${esc(text)}</p>
          <div class="confirm__btns">
            <button type="button" class="confirm__no">Giữ lại</button>
            <button type="button" class="confirm__yes">${esc(ok)}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add("is-open"));
      const prevFocus = document.activeElement;
      const noBtn = wrap.querySelector(".confirm__no");
      noBtn.focus();
      const done = (val) => {
        wrap.classList.remove("is-open");
        document.removeEventListener("keydown", onKey, true);
        setTimeout(() => wrap.remove(), 250);
        prevFocus?.focus?.();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); done(false); }
        if (e.key === "Tab") {
          const btns = [...wrap.querySelectorAll("button")];
          const i = btns.indexOf(document.activeElement);
          e.preventDefault();
          btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
      };
      document.addEventListener("keydown", onKey, true);
      noBtn.addEventListener("click", () => done(false));
      wrap.querySelector(".confirm__yes").addEventListener("click", () => done(true));
      wrap.addEventListener("click", (e) => { if (e.target === wrap) done(false); });
    });
  }

  // Kéo xuống để đóng form (điện thoại)
  $$(".modal .sheet").forEach((sheet) => {
    let y0 = null, dy = 0;
    const head = sheet.querySelector(".sheet__head");
    head.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = "none"; }, { passive: true });
    head.addEventListener("touchmove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    head.addEventListener("touchend", () => {
      sheet.style.transition = ""; sheet.style.transform = "";
      if (dy > 110) closeModals();
      y0 = null;
    });
  });
  function openModal(sel) { $(sel).classList.add("is-open"); $(sel).setAttribute("aria-hidden", "false"); document.body.classList.add("no-scroll"); }
  function closeModals() { $$(".modal").forEach((m) => { m.classList.remove("is-open"); m.setAttribute("aria-hidden", "true"); }); document.body.classList.remove("no-scroll"); }
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) closeModals(); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

  let tt;
  function toast(msg, action) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast__act"; b.textContent = action.label;
      b.addEventListener("click", () => { t.classList.remove("is-show"); action.fn(); });
      t.appendChild(b);
    }
    t.classList.toggle("has-action", !!action);
    t.classList.add("is-show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("is-show"), action ? 6000 : 2800);
  }

  // cảnh báo khi đóng trang lúc đang lưu
  window.addEventListener("beforeunload", (e) => {
    if (pending || Object.values(stockTimers).length) { e.preventDefault(); e.returnValue = ""; }
  });

  /* =========================================================
     ĐĂNG NHẬP (Supabase Auth)
     ========================================================= */
  function showApp(user) {
    $("#login").hidden = true;
    $("#app").hidden = false;
    const email = user?.email || "";
    $("#accEmail").textContent = email;
    $("#accEmail").title = email;
    $("#accAvatar").textContent = (email[0] || "A").toUpperCase();
    const start = (location.hash || "#products").slice(1);
    current = null;
    go(["orders", "feedback", "trash"].includes(start) ? start : "products");
    loadAll();
    loadMaintenance();
  }
  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
    setTimeout(() => $("#loginEmail").focus(), 50);
  }

  $("#pwToggle").addEventListener("click", () => {
    const i = $("#loginPass"), show = i.type === "password";
    i.type = show ? "text" : "password";
    $("#pwToggle").textContent = show ? "Ẩn" : "Hiện";
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginErr"), btn = $(".login__btn"), box = $(".login__box");
    err.hidden = true;
    if (!sb) { err.textContent = "Không kết nối được Supabase"; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Đang đăng nhập…";
    const { data, error } = await sb.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPass").value,
    });
    btn.disabled = false; btn.textContent = "Đăng nhập";
    if (error) {
      err.textContent = /invalid|credentials/i.test(error.message) ? "Sai email hoặc mật khẩu"
        : /confirm/i.test(error.message) ? "Tài khoản chưa được xác nhận email"
        : "Không đăng nhập được, kiểm tra mạng rồi thử lại";
      err.hidden = false;
      box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
      $("#loginPass").select();
      return;
    }
    $("#loginPass").value = "";
    showApp(data.user);
  });

  $$("[data-logout]").forEach((b) => b.addEventListener("click", async () => {
    try { await sb.auth.signOut(); } catch (e) { }
    products = []; feedbacks = []; trash = []; orders = []; trashedOrders = [];
    showLogin();
  }));

  (async () => {
    if (!sb) { showLogin(); $("#loginErr").textContent = "Không tải được thư viện Supabase"; $("#loginErr").hidden = false; return; }
    const { data } = await sb.auth.getSession();
    if (data.session) showApp(data.session.user); else showLogin();
    sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") showLogin(); });
  })();
})();
