/* =========================================================
   Hiệu ứng chuyển động card ở hero + sao 4 cánh vàng
   - Máy tính: rê chuột lên card
   - Điện thoại / iPad: vuốt trên card, hoặc nghiêng máy (con quay)
   - Không tương tác: card tự lắc nhẹ
   ========================================================= */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", () => {
    const visual = document.querySelector(".hero__visual");
    const card = document.getElementById("heroCard");
    const layer = document.getElementById("sparkles");
    if (!visual || !card || !layer || reduceMotion) return;

    const shine = card.querySelector(".card-3d__shine");
    const MAX_TILT = 16;          // độ nghiêng tối đa
    const MAX_SPARKLES = 36;      // giới hạn số sao cùng lúc
    const isTouch = window.matchMedia("(hover: none)").matches;

    // tilt hiện tại và tilt mục tiêu (-0.5 .. 0.5)
    let cur = { x: 0, y: 0 };
    let target = { x: 0, y: 0 };
    let lastInput = 0;            // thời điểm tương tác gần nhất
    let lastSpawn = 0;
    let visible = true;

    /* ---------- Sao 4 cánh ---------- */
    function spawnSparkle(x, y, big) {
      if (layer.childElementCount >= MAX_SPARKLES) return;
      const s = document.createElement("span");
      s.className = "sparkle";
      const size = (big ? 24 : 14) + Math.random() * (big ? 16 : 10);
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.setProperty("--size", size + "px");
      s.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      s.style.setProperty("--dy", Math.sin(angle) * dist - 15 + "px");
      s.style.setProperty("--dur", 0.8 + Math.random() * 0.7 + "s");
      s.addEventListener("animationend", () => s.remove());
      layer.appendChild(s);
    }

    // vị trí ngẫu nhiên quanh viền card (toạ độ trong .hero__visual)
    function spawnAroundCard(count, big) {
      const v = visual.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      for (let i = 0; i < count; i++) {
        const edge = Math.random();
        let x, y;
        if (edge < 0.5) {
          x = c.left + Math.random() * c.width;
          y = Math.random() < 0.5 ? c.top : c.bottom;
        } else {
          x = Math.random() < 0.5 ? c.left : c.right;
          y = c.top + Math.random() * c.height;
        }
        x += (Math.random() - 0.5) * 30;
        y += (Math.random() - 0.5) * 30;
        spawnSparkle(x - v.left, y - v.top, big);
      }
    }

    /* ---------- Chuột / cảm ứng (Pointer Events) ---------- */
    function onPointer(e) {
      const r = visual.getBoundingClientRect();
      target.x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
      target.y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
      lastInput = performance.now();

      // sao theo tay/chuột
      if (lastInput - lastSpawn > 45) {
        spawnSparkle(e.clientX - r.left, e.clientY - r.top, Math.random() < 0.35);
        lastSpawn = lastInput;
      }
    }
    visual.addEventListener("pointermove", onPointer);
    visual.addEventListener("pointerdown", (e) => {
      onPointer(e);
      spawnAroundCard(8, true); // chạm vào -> bung sao
    });
    visual.addEventListener("pointerleave", () => { lastInput = 0; });

    // Cuộn trên điện thoại vẫn nhận vị trí ngón tay
    visual.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (t) onPointer(t);
    }, { passive: true });

    /* ---------- Nghiêng máy (điện thoại / iPad) ---------- */
    let baseBeta = null;
    function onOrientation(e) {
      if (e.gamma == null || e.beta == null) return;
      if (baseBeta === null) baseBeta = e.beta; // lấy góc cầm máy ban đầu làm gốc
      target.x = Math.max(-0.5, Math.min(0.5, e.gamma / 60));
      target.y = Math.max(-0.5, Math.min(0.5, (e.beta - baseBeta) / 60));
      lastInput = performance.now();
    }
    function enableOrientation() {
      window.addEventListener("deviceorientation", onOrientation);
    }
    if (isTouch && "DeviceOrientationEvent" in window) {
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        // iOS / iPadOS: phải xin quyền sau một lần chạm
        const ask = () => {
          DeviceOrientationEvent.requestPermission()
            .then((res) => { if (res === "granted") enableOrientation(); })
            .catch(() => {});
          document.removeEventListener("touchend", ask);
        };
        document.addEventListener("touchend", ask, { once: true });
      } else {
        enableOrientation(); // Android
      }
    }

    /* ---------- Chỉ chạy khi hero đang hiển thị ---------- */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(visual);
    }

    /* ---------- Vòng lặp chuyển động ---------- */
    let ambientTimer = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      if (!visible) return;

      // không có tương tác 1.5s -> card tự lắc nhẹ
      if (now - lastInput > 1500) {
        target.x = Math.sin(now / 1800) * 0.28;
        target.y = Math.cos(now / 2300) * 0.2;
      }

      const px = cur.x, py = cur.y;
      cur.x += (target.x - cur.x) * 0.08;
      cur.y += (target.y - cur.y) * 0.08;

      card.style.transform =
        `perspective(900px) rotateY(${cur.x * MAX_TILT * 2}deg) rotateX(${-cur.y * MAX_TILT * 2}deg)`;
      if (shine) shine.style.backgroundPosition = `${50 + cur.x * 100}% ${50 + cur.y * 100}%`;

      // card chuyển động càng nhanh -> càng nhiều sao
      const speed = Math.hypot(cur.x - px, cur.y - py);
      if (speed > 0.004 && Math.random() < Math.min(0.6, speed * 60)) spawnAroundCard(1, speed > 0.012);

      // sao lấp lánh nền
      if (now - ambientTimer > 550) {
        spawnAroundCard(1, false);
        ambientTimer = now;
      }
    }
    requestAnimationFrame(loop);
  });
})();
