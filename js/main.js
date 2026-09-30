/* =========================================================
   BloomCard — logic trang
   ========================================================= */
(function () {
  "use strict";

  const CONFIG = window.SHOP_CONFIG || {};
  let PRODUCTS = window.PRODUCTS || [];
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const formatPrice = (n) => n.toLocaleString("vi-VN") + "đ";
  const findProduct = (id) => PRODUCTS.find((p) => p.id === id) || PRODUCTS[0];

  /* ---------- Render danh sách sản phẩm ---------- */
  function renderProducts(list = PRODUCTS) {
    const grid = $("#productGrid");
    if (!grid) return;

    // Đẩy sản phẩm chưa bán lên trên, sản phẩm đã bán xuống cuối
    const sorted = [...list].sort((a, b) => {
      const aSold = (a.status === "sold" || (a.stock !== undefined && a.stock <= 0)) ? 1 : 0;
      const bSold = (b.status === "sold" || (b.stock !== undefined && b.stock <= 0)) ? 1 : 0;
      return aSold - bSold;
    });

    grid.innerHTML = sorted.map((p) => {
      const sold = p.status === "sold" || (p.stock !== undefined && p.stock <= 0);
      const stock = sold ? 0 : (p.stock ?? 1);
      const badge = sold
        ? `<span class="product__badge product__badge--sold">Đã bán</span>`
        : p.badge ? `<span class="product__badge">${p.badge}</span>` : "";
      return `
        <article class="product ${sold ? "is-sold" : ""}" data-id="${p.id}">
          <div class="product__img" data-zoom="${p.images[0]}">
            ${badge}
            <img src="${p.images[0]}" alt="${p.name}" loading="lazy" />
          </div>
          <div class="product__body">
            <h3 class="product__name">${p.name}</h3>
            <div class="product__foot">
              <div class="product__row">
                <span class="product__price">${formatPrice(p.price)}</span>
                <span class="stock">SL: ${stock}</span>
              </div>
              <a href="#" class="product__buy js-buy" data-product="${p.id}">
                ${sold ? "Đã bán" : `<span>Mua ngay</span><svg class="arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`}
              </a>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  /* ---------- Nút Mua ngay -> Messenger ---------- */
  function buildMessage(p, qty) {
    const tpl = CONFIG.orderTemplate || "Chào shop, mình muốn mua {name}";
    return tpl
      .replace("{name}", p.name)
      .replace("{qty}", qty)
      .replace("{price}", formatPrice(p.price))
      .replace("{total}", formatPrice(p.price * qty));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback cho trình duyệt cũ
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  function handleBuy(e) {
    const btn = e.target.closest(".js-buy");
    if (!btn) return;
    e.preventDefault();

    const url = CONFIG.messengerUrl;
    if (!url) return;

    const p = findProduct(btn.dataset.product);
    if (p && p.status === "sold") return;

    // Mở Messenger ngay trong sự kiện click để không bị chặn popup
    const win = window.open(url, "_blank");
    if (win) win.opener = null;
    else window.location.href = url;   // trình duyệt chặn tab mới -> chuyển trang hiện tại

    if (CONFIG.copyOrderMessage && p) {
      const qty = 1;
      copyText(buildMessage(p, qty)).then((ok) => {
        if (ok) toast("✿ Đã sao chép tin nhắn đặt hàng — dán vào Messenger để gửi nhé!");
      });
    }
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 3500);
  }

  /* ---------- Lightbox ---------- */
  function initLightbox() {
    const lb = $("#lightbox");
    const img = $("#lightboxImg");
    const open = (src) => { img.src = src; lb.classList.add("is-open"); lb.setAttribute("aria-hidden", "false"); };
    const close = () => { lb.classList.remove("is-open"); lb.setAttribute("aria-hidden", "true"); };

    document.addEventListener("click", (e) => {
      const z = e.target.closest("[data-zoom]");
      if (z) open(z.dataset.zoom);
    });
    $("#lightboxClose").addEventListener("click", close);
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  /* ---------- Bộ lọc ---------- */
  const filter = { q: "", inStock: false };

  // bỏ dấu tiếng Việt để tìm kiếm dễ hơn
  const normalize = (str) =>
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

  function applyFilters() {
    const q = normalize(filter.q.trim());
    const list = PRODUCTS.filter((p) => {
      if (filter.inStock && p.status === "sold") return false;
      if (q && !normalize(p.name).includes(q)) return false;
      return true;
    });


    renderProducts(list);
    $("#filterCount").innerHTML = `Hiển thị <b>${list.length}</b> / ${PRODUCTS.length} card`;
    $("#emptyState").hidden = list.length > 0;
    document.dispatchEvent(new CustomEvent("products:updated", { detail: list.length }));
  }

  function initFilters() {
    if (!$("#filterSearch")) return;
    let t;
    $("#filterSearch").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { filter.q = e.target.value; applyFilters(); }, 150);
    });
    $("#filterStock").addEventListener("change", (e) => { filter.inStock = e.target.checked; applyFilters(); });

    applyFilters();
  }

  /* ---------- Trượt ngang sản phẩm (điện thoại / iPad) ---------- */
  function initProductSlider() {
    const grid = $("#productGrid");
    const bar = $("#productsProgress");
    const btn = $("#toggleView");
    if (!grid || !bar || !btn) return;

    const update = () => {
      const max = grid.scrollWidth - grid.clientWidth;
      const ratio = grid.clientWidth / grid.scrollWidth;
      const pos = max > 0 ? grid.scrollLeft / max : 0;
      bar.style.width = Math.max(ratio, 0.12) * 100 + "%";
      bar.style.marginLeft = pos * (1 - Math.max(ratio, 0.12)) * 100 + "%";
    };
    grid.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    let total = PRODUCTS.length;
    const label = () => (grid.classList.contains("is-grid") ? "Thu gọn" : "Xem tất cả");
    btn.textContent = label();
    document.addEventListener("products:updated", (e) => {
      total = e.detail;
      grid.scrollLeft = 0;
      btn.textContent = label();
      btn.parentElement.style.display = total ? "" : "none";
      update();
    });
    btn.addEventListener("click", () => {
      const open = grid.classList.toggle("is-grid");
      btn.textContent = label();
      if (!open) {
        grid.scrollLeft = 0;
        $("#products").scrollIntoView({ behavior: "smooth" });
      }
      update();
    });
  }

  /* ---------- Cách đặt hàng: tự chuyển bước ---------- */
  function initStepsAuto() {
    const wrap = $(".steps");
    if (!wrap) return;
    const steps = $$(".step", wrap);
    if (!steps.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const DELAY = 2600;          // thời gian mỗi bước (ms)
    let index = 0, timer = null, paused = false, visible = false;

    const show = (i) => {
      index = i;
      steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
      wrap.style.setProperty("--p", steps.length > 1 ? i / (steps.length - 1) : 1);
    };
    const next = () => show((index + 1) % steps.length);
    const start = () => { stop(); if (visible && !paused) timer = setInterval(next, DELAY); };
    const stop = () => { clearInterval(timer); timer = null; };

    wrap.classList.add("is-auto");
    show(0);

    // rê chuột / chạm vào bước nào -> sáng bước đó, tạm dừng
    steps.forEach((s, i) => {
      s.addEventListener("mouseenter", () => { paused = true; stop(); show(i); });
      s.addEventListener("click", () => { show(i); start(); });
    });
    wrap.addEventListener("mouseleave", () => { paused = false; start(); });

    // chỉ chạy khi section đang hiển thị
    new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (visible) { show(0); start(); } else stop();
    }, { threshold: 0.35 }).observe(wrap);
  }

  /* ---------- Hỏi đáp: mở 1 câu mỗi lần ---------- */
  function initFaq() {
    const items = $$(".qa");
    items.forEach((it) => {
      $(".qa__q", it).addEventListener("click", () => {
        const open = !it.classList.contains("is-open");
        items.forEach((o) => {
          o.classList.remove("is-open");
          $(".qa__q", o).setAttribute("aria-expanded", "false");
        });
        if (open) {
          it.classList.add("is-open");
          $(".qa__q", it).setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  /* ---------- Menu mobile ---------- */
  function initMenu() {
    const header = $("#header");
    const nav = $("#nav");
    const toggle = $("#menuToggle");
    if (!header || !nav || !toggle) return;

    const setOpen = (open) => {
      header.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
    };
    toggle.addEventListener("click", () => setOpen(!header.classList.contains("is-open")));
    $$("a", nav).forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("click", (e) => { if (!header.contains(e.target)) setOpen(false); });
    window.addEventListener("resize", () => { if (window.innerWidth > 900) setOpen(false); });

    /* Lướt xuống: ẩn navbar — lướt lên: hiện navbar */
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - lastY;
      header.classList.toggle("is-scrolled", y > 10);
      if (header.classList.contains("is-open")) { lastY = y; ticking = false; return; }
      if (y < 80) header.classList.remove("is-hidden");          // gần đầu trang: luôn hiện
      else if (diff > 6) header.classList.add("is-hidden");        // đang lướt xuống
      else if (diff < -6) header.classList.remove("is-hidden");    // đang lướt lên
      if (Math.abs(diff) > 6) lastY = y;
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
      scheduleAutoHide();
    }, { passive: true });
    onScroll();

    /* Điện thoại / iPad: navbar không che sản phẩm */
    const isTouch = window.matchMedia("(hover: none), (max-width: 900px)").matches;
    let idleTimer;
    function scheduleAutoHide() {
      if (!isTouch) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (window.scrollY > 120 && !header.classList.contains("is-open")) header.classList.add("is-hidden");
      }, 2200);   // hiện lại khi lướt lên, rồi tự ẩn sau ~2 giây
    }
    // chạm vào danh sách card / feedback để vuốt -> ẩn navbar ngay
    ["#productGrid", "#glide", ".products-bar"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener("touchstart", () => {
        if (window.scrollY > 120 && !header.classList.contains("is-open")) header.classList.add("is-hidden");
      }, { passive: true });
    });

    /* Tô sáng mục đang xem trên navbar */
    const links = $$("a[href^='#']", nav);
    const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
    if ("IntersectionObserver" in window && sections.length) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
          }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      sections.forEach((s) => io.observe(s));
    }
  }

  /* ---------- Hiện dần khi cuộn ---------- */
  function initReveal() {
    $$(".feature, .steps li, .qa, .faq-intro, .faq-help, .section__head").forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    $$(".reveal").forEach((el) => io.observe(el));
  }

  /* ---------- Khởi chạy ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    initLightbox();
    initMenu();
    initFaq();
    initStepsAuto();
    initReveal();
    document.addEventListener("click", handleBuy);
    $("#year").textContent = new Date().getFullYear();

    // chờ dữ liệu từ Supabase rồi mới vẽ danh sách card
    const grid = $("#productGrid");
    if (grid) grid.classList.add("is-loading");
    await (window.DATA_READY || Promise.resolve());
    PRODUCTS = (window.PRODUCTS || []).sort((a, b) => {
      const aSold = (a.status === "sold" || (a.stock !== undefined && a.stock <= 0)) ? 1 : 0;
      const bSold = (b.status === "sold" || (b.stock !== undefined && b.stock <= 0)) ? 1 : 0;
      return aSold - bSold;
    });
    if (grid) grid.classList.remove("is-loading");
    initProductSlider();
    initFilters();
  });
})();
