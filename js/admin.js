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
  const ICON_EDIT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

  /* ---------- Dữ liệu trong trang ---------- */
  let products = [];   // chưa xoá
  let feedbacks = [];  // chưa xoá
  let trash = [];      // đã xoá (cả 2 loại)

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
    $("#appLoading").hidden = false;
    $("#appError").hidden = true;
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
      setSave("ok");
    } catch (e) {
      console.error(e);
      const msg = String(e.message || e);
      $("#appErrorText").textContent = /relation|does not exist|schema cache/i.test(msg)
        ? "Chưa tạo bảng dữ liệu trên Supabase. Hãy chạy đoạn lệnh SQL trong SQL Editor rồi tải lại trang."
        : "Không tải được dữ liệu. Kiểm tra kết nối mạng rồi thử lại.";
      $("#appError").hidden = false;
    } finally {
      $("#appLoading").hidden = true;
    }
  }
  $("#btnRetry").addEventListener("click", loadAll);

  /* =========================================================
     CHUYỂN MỤC
     ========================================================= */
  const ORDER = ["products", "feedback", "trash", "settings"];
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
    try { history.replaceState(null, "", "#" + view); } catch (e) { }
  }
  $$(".menu__item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));

  // Vuốt ngang để chuyển mục (điện thoại / iPad)
  (() => {
    let x0 = 0, y0 = 0, t0 = 0, track = false;
    const main = $(".main");
    main.addEventListener("touchstart", (e) => {
      if (document.body.classList.contains("no-scroll") || $(".confirm")) return;
      if (e.target.closest("input, select, textarea, .fgrid img")) return;
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
  const isSold = (p) => p.status === "sold" || (Number(p.stock) || 0) <= 0;
  function summary() {
    $("#pSummary").textContent = `${products.length} card · ${products.filter((p) => !isSold(p)).length} còn hàng`;
  }
  function renderProducts() {
    const q = $("#pSearch").value.trim().toLowerCase();
    summary();
    const empty = !products.length;
    $("#productEmpty").hidden = !empty || !!q;
    $("#productList").innerHTML = products
      .filter((p) => !q || (p.name || "").toLowerCase().includes(q))
      .map((p) => {
        const sold = isSold(p);
        return `
        <article class="pitem ${sold ? "is-sold" : ""}" data-id="${esc(p.id)}">
          <img class="pitem__img" src="${esc(asset(p.image || "images/favicon.svg"))}" alt="" loading="lazy" />
          <div class="pitem__info">
            <h4>${esc(p.name)}</h4>
            <div class="pitem__meta">
              <b>${fmt(p.price)}</b>
              <span class="pill ${sold ? "pill--sold" : ""}">${sold ? "Đã bán" : "Còn hàng"}</span>
              <span class="pill pill--sl">SL: ${sold ? 0 : p.stock}</span>
              ${p.badge ? `<span class="pill pill--badge">${esc(p.badge)}</span>` : ""}
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

  // cập nhật số lượng tại chỗ, gộp nhiều lần bấm thành 1 lần lưu
  const stockTimers = {};
  function patchRow(row, p) {
    const sold = isSold(p);
    row.classList.toggle("is-sold", sold);
    const pill = row.querySelector(".pill");
    pill.textContent = sold ? "Đã bán" : "Còn hàng";
    pill.classList.toggle("pill--sold", sold);
    const sl = row.querySelector(".pill--sl");
    sl.textContent = "SL: " + (sold ? 0 : p.stock);
    sl.classList.remove("bump"); void sl.offsetWidth; sl.classList.add("bump");
    summary();
  }

  $("#productList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const row = b.closest(".pitem");
    const p = products.find((x) => x.id === row.dataset.id); if (!p) return;
    const act = b.dataset.act;

    if (act === "plus" || act === "minus") {
      p.stock = Math.max(0, (Number(p.stock) || 0) + (act === "plus" ? 1 : -1));
      p.status = p.stock === 0 ? "sold" : "available";
      patchRow(row, p);
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
  let editing = null, formImage = "";
  function setPreview(src) {
    formImage = src || "";
    $("#pImgPreview").hidden = !src; $("#pImgHint").hidden = !!src;
    if (src) $("#pImgPreview").src = asset(src);
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
    setPreview(p?.image || "");
    openModal("#pModal");
    setTimeout(() => $("#fName").focus(), 50);
  }
  $("#btnAddProduct").addEventListener("click", () => openProduct(null));
  /* Giá: tự thêm dấu chấm hàng nghìn khi gõ (500000 -> 500.000) */
  $("#fPrice").addEventListener("input", (e) => {
    const el = e.target;
    const digitsBefore = el.value.slice(0, el.selectionStart).replace(/\D/g, "").length;
    el.value = moneyFmt(el.value);
    let pos = 0, seen = 0;                       // giữ con trỏ đúng chỗ
    while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos);
  });
  $("#pImgInput").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { setPreview(await readImage(f, 800)); } catch { toast("Không đọc được ảnh này"); }
    e.target.value = "";
  });
  $("#pForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!formImage) { toast("Hãy chọn ảnh card"); return; }
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
        if (formImage.startsWith("data:")) data.image = await uploadImage(formImage, "products");
        if (editing) {
          const row = must(await sb.from("products").update(data).eq("id", editing.id).select().single());
          Object.assign(editing, row);
          if (data.image && oldImage !== data.image) removeImage(oldImage);
        } else {
          data.position = products.length ? Math.min(...products.map((x) => x.position || 0)) - 1 : 0;
          const row = must(await sb.from("products").insert(data).select().single());
          products.unshift(row);
        }
      });
      renderProducts(); closeModals();
      toast(editing ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
    } catch (e) { /* đã báo lỗi */ }
    finally { btn.disabled = false; btn.textContent = "Lưu sản phẩm"; }
  });

  /* =========================================================
     FEEDBACK
     ========================================================= */
  function renderFeedback() {
    const F = feedbacks;
    $("#fSummary").textContent = `${F.length} ảnh đang hiện trên web`;
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
    const n = trash.length;
    $("#trashBadge").hidden = !n; $("#trashBadge").textContent = n;
    $("#tSummary").textContent = n ? `${n} mục · bấm Khôi phục để đưa lại lên web` : "Nơi giữ những gì bạn đã xoá";
    $("#trashEmpty").hidden = n > 0;
    $("#btnEmptyTrash").hidden = !n;
    $("#trashList").innerHTML = trash.map((t) => {
      const isP = t.type === "product", r = t.row;
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
    const yes = await askDelete({ title: "Dọn sạch mục Đã xoá?", text: `Xoá hẳn ${trash.length} mục, không thể khôi phục.`, ok: "Dọn sạch" });
    if (!yes) return;
    try {
      await run(async () => {
        must(await sb.from("products").delete().not("deleted_at", "is", null));
        must(await sb.from("feedbacks").delete().not("deleted_at", "is", null));
      });
      trash.forEach((t) => removeImage(t.row.image));
      trash = []; renderTrash(); toast("Đã dọn sạch");
    } catch (e) { }
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
    const status = $("#maintStatus");
    const text = $("#maintText");
    if (toggle) toggle.checked = maintMode;
    if (status) status.classList.toggle("is-maint", maintMode);
    if (text) text.textContent = maintMode
      ? "⚠ Trang web đang bảo trì — khách không thể truy cập"
      : "Trang web đang hoạt động bình thường";
  }

  const maintToggle = $("#maintToggle");
  if (maintToggle) {
    maintToggle.addEventListener("change", async (e) => {
      const on = e.target.checked;
      e.target.disabled = true;
      try {
        await run(async () => {
          const { error } = await sb.from("site_settings")
            .upsert({ key: "maintenance_mode", value: on ? "true" : "false", updated_at: new Date().toISOString() },
                    { onConflict: "key" });
          if (error) throw error;
        });
        maintMode = on;
        updateMaintUI();
        toast(on ? "Đã bật chế độ bảo trì" : "Đã tắt chế độ bảo trì");
      } catch (err) {
        e.target.checked = maintMode;
        updateMaintUI();
      } finally {
        e.target.disabled = false;
      }
    });
  }

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
    go(["feedback", "trash"].includes(start) ? start : "products");
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
    products = []; feedbacks = []; trash = [];
    showLogin();
  }));

  (async () => {
    if (!sb) { showLogin(); $("#loginErr").textContent = "Không tải được thư viện Supabase"; $("#loginErr").hidden = false; return; }
    const { data } = await sb.auth.getSession();
    if (data.session) showApp(data.session.user); else showLogin();
    sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") showLogin(); });
  })();
})();
