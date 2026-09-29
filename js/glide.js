/* =========================================================
   Feedback — Glide carousel 3D
   - Vòng lặp vô hạn, tự chạy liên tục từ trái sang phải
   - Ảnh ở giữa phóng to, hai bên nhỏ dần + nghiêng 3D
   - Hiệu ứng parallax trên ảnh
   - Kéo chuột / vuốt tay có quán tính, bấm để phóng to ảnh
   ========================================================= */
(function () {
  "use strict";

  const CFG = {
    speed: window.FEEDBACK_SPEED ?? 45, // px/giây, dương = trái → phải
    centerScale: 1.18,   // độ phóng to ảnh giữa
    sideScale: 0.78,     // ảnh xa nhất
    tilt: 14,            // độ nghiêng 3D (deg)
    parallax: 6,         // độ lệch ảnh bên trong (px)
    friction: 0.94,      // quán tính khi thả tay (0..1)
  };

  const mod = (n, m) => ((n % m) + m) % m;

  document.addEventListener("DOMContentLoaded", async () => {
    await (window.DATA_READY || Promise.resolve());
    const root = document.getElementById("glide");
    const stage = document.getElementById("glideStage");
    const list = window.FEEDBACKS || [];
    if (!root || !stage) return;
    if (!list.length) {                       // chưa có feedback -> ẩn cả mục
      const sec = document.getElementById("feedback");
      if (sec) sec.hidden = true;
      document.querySelectorAll('a[href="#feedback"]').forEach((a) => (a.hidden = true));
      return;
    }

    let cardW = 240, cardH = 427, gap = 28, step = 268, total = 0;
    let items = [];
    let offset = 0;                 // vị trí cuộn hiện tại
    let velocity = CFG.speed;       // px/giây
    let dragging = false, moved = 0, lastX = 0, lastT = 0, dragVel = 0;
    let nudge = 0;                  // khi bấm nút trước/sau
    let visible = true;

    /* ---------- Dựng thẻ ---------- */
    function build() {
      const w = root.clientWidth;
      if (w < 480) { cardW = Math.round(Math.min(w * 0.78, 320)); gap = 14; CFG.centerScale = 1.06; CFG.sideScale = 0.84; }
      else if (w < 900) { cardW = 340; gap = 22; CFG.centerScale = 1.1; CFG.sideScale = 0.8; }
      else { cardW = 380; gap = 30; CFG.centerScale = 1.14; CFG.sideScale = 0.78; }
      cardH = Math.round(cardW * 3 / 4);   // ảnh cắt đoạn tin nhắn (ngang 4:3)
      step = cardW + gap;
      root.style.setProperty("--card-w", cardW + "px");
      root.style.setProperty("--card-h", cardH + "px");
      root.style.height = Math.round(cardH * CFG.centerScale + 36) + "px";

      // đủ ảnh để lấp kín màn hình + dư 2 thẻ mỗi bên => không bao giờ hở
      const need = Math.ceil(w / step) + 4;
      let srcs = [];
      while (srcs.length < need) srcs = srcs.concat(list);
      total = srcs.length * step;

      stage.innerHTML = srcs.map((src, i) => `
        <figure class="glide__card" data-zoom="${src}">
          <img src="${src}" alt="Feedback khách hàng ${(i % list.length) + 1}" draggable="false" />
        </figure>`).join("");
      items = [...stage.children].map((el) => ({ el, img: el.firstElementChild }));
      render();
    }

    /* ---------- Vẽ từng khung hình ---------- */
    function render() {
      items.forEach((it, i) => {
        // vị trí của thẻ, quấn vòng trong [-total/2, total/2)
        const x = mod(i * step + offset + total / 2, total) - total / 2;
        const d = x / step;                       // khoảng cách tới tâm (tính bằng số thẻ)
        const ad = Math.abs(d);
        const near = Math.exp(-ad * ad * 0.9);    // 1 ở giữa, giảm dần ra hai bên
        const scale = CFG.sideScale + (CFG.centerScale - CFG.sideScale) * near;
        const rot = Math.max(-1, Math.min(1, d)) * -CFG.tilt;
        const z = -ad * 60;

        it.el.style.transform =
          `translate3d(${x}px, 0, ${z}px) rotateY(${rot}deg) scale(${scale})`;
        it.el.style.zIndex = String(1000 - Math.round(ad * 10));
        it.el.style.opacity = ad > 3.2 ? Math.max(0, 1 - (ad - 3.2)) : 1;
        it.el.classList.toggle("is-center", ad < 0.5);
        it.img.style.transform = `translateX(${Math.max(-1, Math.min(1, d)) * -CFG.parallax}px)`;
      });
    }

    /* ---------- Vòng lặp ---------- */
    let prev = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!visible) return;

      if (!dragging) {
        // quán tính rồi mượt dần về tốc độ tự chạy
        velocity = velocity * CFG.friction + CFG.speed * (1 - CFG.friction);
        if (nudge) {
          const s = nudge * 0.12;
          offset += s; nudge -= s;
          if (Math.abs(nudge) < 0.5) nudge = 0;
        }
        offset += velocity * dt;
      }
      render();
    }
    requestAnimationFrame(loop);

    /* ---------- Kéo / vuốt ---------- */
    root.addEventListener("pointerdown", (e) => {
      dragging = true; moved = 0;
      lastX = e.clientX; lastT = performance.now(); dragVel = 0;
      root.classList.add("is-dragging");
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      offset += dx;
      moved += Math.abs(dx);
      const dtt = Math.max(1, now - lastT);
      dragVel = dragVel * 0.6 + (dx / dtt) * 1000 * 0.4;
      lastX = e.clientX; lastT = now;
      if (moved > 6) root.setPointerCapture?.(e.pointerId);
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      velocity = Math.max(-3000, Math.min(3000, dragVel));
      root.classList.remove("is-dragging");
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    // kéo thì không mở ảnh phóng to
    root.addEventListener("click", (e) => {
      if (moved > 6) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    /* ---------- Nút trước / sau ---------- */
    document.getElementById("glidePrev")?.addEventListener("click", () => { nudge -= step; });
    document.getElementById("glideNext")?.addEventListener("click", () => { nudge += step; });

    /* ---------- Tiết kiệm pin khi không nhìn thấy ---------- */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(root);
    }

    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 150); });
    build();
  });
})();
