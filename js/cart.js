/* =========================================================
   BloomCard — Giỏ hàng (Cart) — Chuyển khoản ngân hàng
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "bloomcard_cart";
  const ORDERS_KEY = "bloomcard_orders";

  /* ---- Thông tin ngân hàng ---- */
  const BANK_ID = "ICB";                   // Mã ngân hàng VietinBank trên VietQR
  const BANK_ACCOUNT = "104882437853";
  const BANK_NAME = "PHAM THI THAO VI";

  const formatPrice = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /**
   * Tạo URL ảnh QR từ VietQR API
   * @param {number} amount - Số tiền
   * @param {string} addInfo - Nội dung chuyển khoản
   */
  function buildVietQRUrl(amount, addInfo) {
    const params = new URLSearchParams({
      accountName: BANK_NAME,
    });
    if (amount > 0) params.set("amount", amount);
    if (addInfo) params.set("addInfo", addInfo);
    return `https://img.vietqr.io/image/${BANK_ID}-${BANK_ACCOUNT}-compact2.png?${params.toString()}`;
  }

  /* ---- Thông báo Telegram khi có đơn hàng ---- */
  const TELEGRAM_BOT_TOKEN = "8901761384:AAFPdwOZcPo_i2QpJJtuz4VwW5hdBNZxYQs";
  const TELEGRAM_CHAT_ID = "8598018302";

  /**
   * Gửi thông báo đơn hàng mới qua Telegram Bot
   * @param {Object} order - Dữ liệu đơn hàng vừa tạo
   */
  async function sendTelegramOrderNotification(order) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !order) return;

    try {
      const itemsList = (order.items || [])
        .map((it, idx) => `  ${idx + 1}. <b>${esc(it.name)}</b> (x${it.qty || 1}) — <code>${formatPrice((Number(it.price) || 0) * (Number(it.qty) || 1))}</code>`)
        .join("\n");

      const timeStr = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });

      const message =
`🛍️ <b>ĐƠN HÀNG MỚI TỪ BLOOMCARD!</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>Mã đơn:</b> <code>#${esc(order.id || order.code)}</code>
👤 <b>Khách hàng:</b> ${esc(order.customer_name || order.name || "Không rõ")}
📞 <b>Điện thoại:</b> <code>${esc(order.phone || "Không có")}</code>
📧 <b>Email:</b> ${esc(order.email && order.email !== "khachhang@bloomcard.vn" ? order.email : "Không cung cấp")}
📍 <b>Địa chỉ:</b> ${esc(order.address || [order.street, order.ward, order.district, order.city].filter(Boolean).join(", "))}

📦 <b>Sản phẩm đặt:</b>
${itemsList || "  (Không có thông tin)"}

💰 <b>Tổng thanh toán:</b> <b>${formatPrice(order.total || order.subtotal || 0)}</b>
🚚 <b>Phí vận chuyển:</b> Khách thanh toán khi nhận hàng
💳 <b>Phương thức:</b> ${esc(order.shippingMethod || "Chuyển khoản ngân hàng VietinBank")}
⏰ <b>Thời gian đặt:</b> ${timeStr}`;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML"
        })
      });
      console.log("Đã gửi thông báo đơn hàng qua Telegram:", order.id || order.code);
    } catch (err) {
      console.warn("Lỗi gửi thông báo đơn hàng Telegram:", err);
    }
  }

  const Cart = {
    // Lấy danh sách sản phẩm trong giỏ
    getItems() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        console.error("Lỗi đọc giỏ hàng:", e);
        return [];
      }
    },

    // Lưu danh sách sản phẩm
    saveItems(items) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (e) {
        console.error("Lỗi lưu giỏ hàng:", e);
      }
      this.updateNavText();
    },

    // Thêm sản phẩm vào giỏ (SL cố định là 1 cho mỗi card)
    addItem(product) {
      if (!product || !product.id) return "error";
      const items = this.getItems();
      const existing = items.find((it) => String(it.id) === String(product.id));

      if (existing) {
        return "already_in_cart";
      }

      const img = (product.images && product.images[0]) || product.image || "images/card-sample.svg";
      const meta = product.badge ? product.badge : "Photocard chính hãng";

      items.push({
        id: String(product.id),
        name: product.name || "Photocard",
        price: Number(product.price) || 0,
        image: img,
        meta: meta,
        qty: 1
      });

      this.saveItems(items);
      return "added";
    },

    // Xoá sản phẩm khỏi giỏ
    removeItem(productId) {
      let items = this.getItems();
      items = items.filter((it) => String(it.id) !== String(productId));
      this.saveItems(items);
      return items;
    },

    // Xoá toàn bộ giỏ
    clear() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      this.updateNavText();
    },

    // Tổng số lượng món trong giỏ
    getCount() {
      const items = this.getItems();
      return items.length;
    },

    // Tổng tiền
    getTotal() {
      const items = this.getItems();
      return items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
    },

    // Cập nhật số lượng giỏ hàng trên navbar: Icon + số nằm trong hình tròn
    updateNavText() {
      const count = this.getCount();
      const badges = document.querySelectorAll("#cartBadge, .cart-badge");
      if (badges.length > 0) {
        badges.forEach((b) => {
          b.textContent = count;
          b.classList.remove("is-bumped");
          void b.offsetWidth;
          b.classList.add("is-bumped");
          setTimeout(() => b.classList.remove("is-bumped"), 250);
        });
      } else {
        const navCartBtns = document.querySelectorAll(".header__buy, #headerCartBtn");
        navCartBtns.forEach((btn) => {
          btn.innerHTML = `
            <svg class="header__cart-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 10h19"></path>
              <path d="M4.5 10l1.6 8.2a2 2 0 0 0 2 1.8h7.8a2 2 0 0 0 2-1.8L19.5 10"></path>
              <path d="M8.8 13.2L10.6 3.8"></path>
              <path d="M15.2 13.2L13.4 3.8"></path>
            </svg>
            <span class="cart-badge" id="cartBadge">${count}</span>
          `;
        });
      }
    },

    // Render trang giỏ hàng (nếu đang ở cart.html)
    renderCartPage() {
      const listEl = document.getElementById("cartItemsList");
      const subtotalEl = document.getElementById("cartSubtotal");
      const emptyEl = document.getElementById("cartEmpty");
      const contentEl = document.getElementById("cartContent");
      const checkoutBtn = document.getElementById("btnCheckout");

      if (!listEl || !subtotalEl) return;

      const items = this.getItems();
      const total = this.getTotal();

      if (items.length === 0) {
        if (contentEl) contentEl.style.display = "none";
        if (emptyEl) emptyEl.style.display = "block";
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
      }

      if (contentEl) contentEl.style.display = "grid";
      if (emptyEl) emptyEl.style.display = "none";
      if (checkoutBtn) checkoutBtn.disabled = false;

      // Cập nhật tạm tính
      subtotalEl.textContent = formatPrice(total);

      // Render từng sản phẩm: SL cố định 1, không có nút tăng/giảm
      listEl.innerHTML = items.map((item) => `
        <article class="cart-item" data-id="${esc(item.id)}">
          <div class="cart-item__media">
            <img src="${esc(item.image)}" alt="${esc(item.name)}" class="cart-item__img" onerror="this.src='images/card-sample.svg'" />
          </div>
          <div class="cart-item__info">
            <h3 class="cart-item__title">${esc(item.name)}</h3>
          </div>
          <div class="cart-item__side">
            <span class="cart-item__qty-text">SL: 1</span>
            <button type="button" class="cart-item__del" data-action="delete" data-id="${esc(item.id)}">Xóa</button>
          </div>
        </article>
      `).join("");
    },

    // ================================================================
    // Khởi tạo sự kiện checkout chuyển khoản
    // ================================================================
    initCartEvents() {
      const listEl = document.getElementById("cartItemsList");
      if (listEl) {
        listEl.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-action='delete']");
          if (!btn) return;
          const id = btn.dataset.id;

          const card = btn.closest(".cart-item");
          if (card) {
            card.style.opacity = "0";
            card.style.transform = "translateX(-15px)";
            card.style.transition = "all 0.25s ease";
            setTimeout(() => {
              this.removeItem(id);
              this.renderCartPage();
            }, 250);
          } else {
            this.removeItem(id);
            this.renderCartPage();
          }
        });
      }

      // ---------- Elements ----------
      const checkoutBtn = document.getElementById("btnCheckout");
      const checkoutModal = document.getElementById("checkoutModal");
      const checkoutClose = document.getElementById("checkoutClose");
      const checkoutForm = document.getElementById("checkoutForm");
      const checkoutTotalReview = document.getElementById("checkoutTotalReview");
      const checkoutGrandTotal = document.getElementById("checkoutGrandTotal");

      // Cancel buttons
      const checkoutCancel = document.getElementById("checkoutCancel");
      const checkoutCancelDesktop = document.getElementById("checkoutCancelDesktop");

      // Mobile 2-step elements
      const colForm = document.getElementById("ckColForm");
      const colQR = document.getElementById("ckColQR");
      const btnNext = document.getElementById("ckBtnNext");
      const btnBack = document.getElementById("ckBtnBack");
      const btnConfirmMobile = document.getElementById("ckBtnConfirmMobile");
      const steps = document.querySelectorAll(".ck-steps__item");

      // QR elements
      const qrImg = document.getElementById("ckQRImg");
      const qrAmount = document.getElementById("ckQRAmount");
      const qrContent = document.getElementById("ckQRContent");
      const orderCodeEl = document.getElementById("ckOrderCode");
      const copyBtn = document.getElementById("ckCopyAccount");
      const copyText = document.getElementById("ckCopyText");

      if (!checkoutBtn || !checkoutModal) return;

      // Sinh mã đơn hàng
      let currentOrderCode = "";

      function generateOrderCode() {
        currentOrderCode = "BC" + Math.floor(100000 + Math.random() * 900000);
        return currentOrderCode;
      }

      // Kiểm tra mobile/tablet
      function isMobile() {
        return window.innerWidth <= 768;
      }

      // Reset về bước 1 (mobile)
      function resetToStep1() {
        if (colForm) {
          colForm.classList.remove("is-hidden");
        }
        if (colQR) {
          colQR.classList.remove("is-visible");
        }
        if (steps.length >= 2) {
          steps[0].classList.add("is-active");
          steps[1].classList.remove("is-active");
        }
      }

      // Chuyển sang bước 2 (mobile)
      function goToStep2() {
        if (colForm) colForm.classList.add("is-hidden");
        if (colQR) colQR.classList.add("is-visible");
        if (steps.length >= 2) {
          steps[0].classList.remove("is-active");
          steps[1].classList.add("is-active");
        }
        // Scroll modal lên đầu
        const dialog = checkoutModal.querySelector(".ck-modal__dialog");
        if (dialog) dialog.scrollTop = 0;
      }

      // Validate form
      function validateForm() {
        const requiredFields = [
          { id: "ckName", label: "Tên người nhận" },
          { id: "ckPhone", label: "Số điện thoại" },
          { id: "ckStreet", label: "Số nhà, tên đường" },
          { id: "ckWard", label: "Phường / xã" },
          { id: "ckDistrict", label: "Quận / huyện" },
          { id: "ckCity", label: "Thành phố / tỉnh" },
        ];

        let valid = true;
        let firstError = null;

        requiredFields.forEach(({ id }) => {
          const el = document.getElementById(id);
          if (el) {
            const val = el.value.trim();
            if (!val) {
              el.classList.add("is-error");
              valid = false;
              if (!firstError) firstError = el;
            } else {
              el.classList.remove("is-error");
            }
          }
        });

        if (!valid && firstError) {
          firstError.focus();
        }

        return valid;
      }

      // Cập nhật QR
      function updateQR() {
        const total = Cart.getTotal();
        const code = currentOrderCode;
        const url = buildVietQRUrl(total, code);

        const qrLoading = document.getElementById("ckQRLoading");
        const qrFallback = document.getElementById("ckQRFallback");
        const qrLink = document.getElementById("ckQRLink");

        if (qrImg) {
          // Reset trạng thái
          qrImg.style.display = "none";
          if (qrLoading) qrLoading.style.display = "block";
          if (qrFallback) qrFallback.style.display = "none";
          if (qrLink) qrLink.href = url;

          qrImg.onload = () => {
            qrImg.style.display = "block";
            if (qrLoading) qrLoading.style.display = "none";
            if (qrFallback) qrFallback.style.display = "none";
          };

          qrImg.onerror = () => {
            qrImg.style.display = "none";
            if (qrLoading) qrLoading.style.display = "none";
            if (qrFallback) qrFallback.style.display = "block";
          };

          qrImg.src = url;
        }

        if (qrAmount) {
          qrAmount.textContent = formatPrice(total);
        }
        if (qrContent) {
          qrContent.textContent = code;
        }
      }

      // ---------- Mở modal ----------
      checkoutBtn.addEventListener("click", () => {
        const items = this.getItems();
        if (items.length === 0) return;

        const code = generateOrderCode();
        const total = this.getTotal();

        // Cập nhật mã đơn + giá
        if (orderCodeEl) orderCodeEl.textContent = code;
        if (checkoutTotalReview) checkoutTotalReview.textContent = formatPrice(total);
        if (checkoutGrandTotal) checkoutGrandTotal.textContent = formatPrice(total);

        // Cập nhật QR
        updateQR();

        // Reset bước
        resetToStep1();

        // Mở modal
        checkoutModal.classList.add("is-open");
        checkoutModal.setAttribute("aria-hidden", "false");

        const firstInput = checkoutModal.querySelector("input");
        if (firstInput) firstInput.focus();
      });

      // ---------- Đóng modal ----------
      const closeModal = () => {
        checkoutModal.classList.remove("is-open");
        checkoutModal.setAttribute("aria-hidden", "true");
        resetToStep1();
      };

      if (checkoutClose) checkoutClose.addEventListener("click", closeModal);
      if (checkoutCancel) checkoutCancel.addEventListener("click", closeModal);
      if (checkoutCancelDesktop) checkoutCancelDesktop.addEventListener("click", closeModal);
      checkoutModal.addEventListener("click", (e) => {
        if (e.target === checkoutModal) closeModal();
      });

      // ---------- Đóng modal thành công ----------
      const successModal = document.getElementById("successModal");
      const successClose = document.getElementById("successClose");
      const closeSuccess = () => {
        if (successModal) {
          successModal.classList.remove("is-open");
          successModal.setAttribute("aria-hidden", "true");
        }
        window.location.href = "index.html";
      };
      if (successClose) successClose.addEventListener("click", closeSuccess);
      if (successModal) {
        successModal.addEventListener("click", (e) => {
          if (e.target === successModal) closeSuccess();
        });
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && successModal && successModal.classList.contains("is-open")) {
          closeSuccess();
        }
      });

      // ---------- Mobile: Tiếp theo → bước 2 ----------
      if (btnNext) {
        btnNext.addEventListener("click", () => {
          if (!validateForm()) return;
          goToStep2();
        });
      }

      // ---------- Mobile: Quay lại → bước 1 ----------
      if (btnBack) {
        btnBack.addEventListener("click", () => {
          resetToStep1();
        });
      }

      // ---------- Sao chép STK ----------
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(BANK_ACCOUNT).then(() => {
              copyBtn.classList.add("is-copied");
              if (copyText) copyText.textContent = "Đã sao chép!";
              setTimeout(() => {
                copyBtn.classList.remove("is-copied");
                if (copyText) copyText.textContent = "Sao chép số tài khoản";
              }, 2500);
            }).catch(() => {
              fallbackCopy();
            });
          } else {
            fallbackCopy();
          }

          function fallbackCopy() {
            const ta = document.createElement("textarea");
            ta.value = BANK_ACCOUNT;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try {
              document.execCommand("copy");
              copyBtn.classList.add("is-copied");
              if (copyText) copyText.textContent = "Đã sao chép!";
              setTimeout(() => {
                copyBtn.classList.remove("is-copied");
                if (copyText) copyText.textContent = "Sao chép số tài khoản";
              }, 2500);
            } catch (err) {}
            document.body.removeChild(ta);
          }
        });
      }

      // ---------- Clear error on input ----------
      checkoutModal.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("input", () => {
          inp.classList.remove("is-error");
        });
      });

      // ---------- Xử lý submit (Desktop + Mobile confirm) ----------
      async function handleSubmit() {
        if (!validateForm()) {
          // Nếu đang ở bước 2 (mobile), quay lại bước 1 để user sửa
          if (isMobile()) {
            resetToStep1();
          }
          return;
        }

        const submitBtns = [
          checkoutForm ? checkoutForm.querySelector("button[type='submit']") : null,
          document.getElementById("ckBtnConfirmMobile")
        ].filter(Boolean);

        submitBtns.forEach((b) => {
          b.disabled = true;
          b.dataset.prevText = b.textContent;
          b.textContent = "Đang xử lý...";
        });

        const name = (document.getElementById("ckName")?.value || "").trim();
        const phone = (document.getElementById("ckPhone")?.value || "").trim();
        const rawEmail = (document.getElementById("ckEmail")?.value || "").trim();
        const email = rawEmail || "khachhang@bloomcard.vn";
        const street = (document.getElementById("ckStreet")?.value || "").trim();
        const ward = (document.getElementById("ckWard")?.value || "").trim();
        const district = (document.getElementById("ckDistrict")?.value || "").trim();
        const city = (document.getElementById("ckCity")?.value || "").trim();
        const address = `${street}, ${ward}, ${district}, ${city}`;

        const items = Cart.getItems();
        const total = Cart.getTotal();

        // Kiểm tra tồn kho thực tế trên Supabase trước khi tạo đơn
        try {
          if (window.sb && items.length > 0) {
            const itemIds = items.map((it) => it.id);
            const [prodsRes, pendingOrdersRes] = await Promise.all([
              window.sb.from("products").select("id, name, stock, status").in("id", itemIds),
              window.sb.from("orders").select("items").eq("status", "pending")
            ]);

            if (prodsRes && Array.isArray(prodsRes.data)) {
              const pendingHeldMap = {};
              (pendingOrdersRes.data || []).forEach((o) => {
                (o.items || []).forEach((it) => {
                  if (it && it.id) {
                    pendingHeldMap[String(it.id)] = (pendingHeldMap[String(it.id)] || 0) + (Number(it.qty) || 1);
                  }
                });
              });

              for (const it of items) {
                const prod = prodsRes.data.find((p) => String(p.id) === String(it.id));
                if (prod) {
                  const held = pendingHeldMap[String(prod.id)] || 0;
                  const rawStock = Number(prod.stock) ?? 1;
                  const available = Math.max(0, rawStock - held);
                  const isSold = prod.status === "sold" || rawStock <= 0 || available <= 0;
                  const buyQty = Number(it.qty) || 1;

                  if (isSold || available < buyQty) {
                    alert(`Rất tiếc, sản phẩm "${it.name}" vừa có khách đặt trước hoặc không còn đủ số lượng.`);
                    submitBtns.forEach((b) => {
                      b.disabled = false;
                      if (b.dataset.prevText) b.textContent = b.dataset.prevText;
                    });
                    return;
                  }
                }
              }
            }
          }
        } catch (checkErr) {
          console.warn("Lỗi kiểm tra hàng tồn trước khi đặt:", checkErr);
        }

        const order = {
          id: currentOrderCode,
          code: currentOrderCode,
          customer_name: name,
          name,
          phone,
          email,
          street,
          ward,
          district,
          city,
          address,
          items,
          subtotal: total,
          total,
          status: "pending",
          shippingMethod: "Chuyển khoản ngân hàng (VietinBank)",
          createdAt: new Date().toISOString()
        };

        // 1. Lưu vào localStorage (backup / test local)
        try {
          const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
          orders.unshift(order);
          localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        } catch (err) {}

        // 2. Lưu vào Supabase orders table
        try {
          if (window.sb) {
            await window.sb.from("orders").insert({
              id: currentOrderCode,
              customer_name: name,
              phone: phone,
              email: email,
              street: street,
              ward: ward,
              district: district,
              city: city,
              items: items,
              subtotal: total,
              status: "pending"
            });
          } else if (window.SUPABASE_URL && window.SUPABASE_KEY) {
            await fetch(`${window.SUPABASE_URL}/rest/v1/orders`, {
              method: "POST",
              headers: {
                apikey: window.SUPABASE_KEY,
                Authorization: `Bearer ${window.SUPABASE_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                id: currentOrderCode,
                customer_name: name,
                phone: phone,
                email: email,
                street: street,
                ward: ward,
                district: district,
                city: city,
                items: items,
                subtotal: total,
                status: "pending"
              })
            });
          }
        } catch (sbErr) {
          console.warn("Lỗi đồng bộ đơn hàng lên Supabase:", sbErr);
        }

        // 3. Gửi thông báo đến Telegram Bot
        sendTelegramOrderNotification(order).catch((tgErr) => {
          console.warn("Lỗi gửi thông báo Telegram:", tgErr);
        });

        submitBtns.forEach((b) => {
          b.disabled = false;
          if (b.dataset.prevText) b.textContent = b.dataset.prevText;
        });

        // Xoá giỏ hàng
        Cart.clear();
        closeModal();

        // Hiển thị modal thành công
        const successModal = document.getElementById("successModal");
        const successCode = document.getElementById("successCode");

        if (successCode) successCode.textContent = "#" + currentOrderCode;

        if (successModal) {
          successModal.classList.add("is-open");
          successModal.setAttribute("aria-hidden", "false");
        } else {
          alert(`Đặt hàng thành công! Mã đơn: #${currentOrderCode}. Shop sẽ kiểm tra chuyển khoản và gửi hàng sớm.`);
          window.location.href = "index.html";
        }
      }

      // Desktop form submit
      if (checkoutForm) {
        checkoutForm.addEventListener("submit", (e) => {
          e.preventDefault();
          handleSubmit();
        });
      }

      // Mobile confirm button
      if (btnConfirmMobile) {
        btnConfirmMobile.addEventListener("click", () => {
          handleSubmit();
        });
      }
    }
  };

  window.Cart = Cart;

  // Tự động cập nhật nút navbar khi nạp trang
  document.addEventListener("DOMContentLoaded", () => {
    Cart.updateNavText();
    if (document.getElementById("cartItemsList")) {
      Cart.renderCartPage();
      Cart.initCartEvents();
    }
  });
})();
