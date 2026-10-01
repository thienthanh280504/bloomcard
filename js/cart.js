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

        if (qrImg) {
          qrImg.src = buildVietQRUrl(total, code);
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
      function handleSubmit() {
        if (!validateForm()) {
          // Nếu đang ở bước 2 (mobile), quay lại bước 1 để user sửa
          if (isMobile()) {
            resetToStep1();
          }
          return;
        }

        const name = (document.getElementById("ckName")?.value || "").trim();
        const phone = (document.getElementById("ckPhone")?.value || "").trim();
        const email = (document.getElementById("ckEmail")?.value || "").trim();
        const street = (document.getElementById("ckStreet")?.value || "").trim();
        const ward = (document.getElementById("ckWard")?.value || "").trim();
        const district = (document.getElementById("ckDistrict")?.value || "").trim();
        const city = (document.getElementById("ckCity")?.value || "").trim();
        const address = `${street}, ${ward}, ${district}, ${city}`;

        const items = Cart.getItems();
        const total = Cart.getTotal();

        const order = {
          code: currentOrderCode,
          name,
          phone,
          email,
          address,
          items,
          total,
          shippingMethod: "Chuyển khoản ngân hàng (VietinBank)",
          createdAt: new Date().toISOString()
        };

        // Lưu vào localStorage
        try {
          const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
          orders.unshift(order);
          localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        } catch (err) {}

        // Xoá giỏ hàng
        Cart.clear();
        closeModal();

        // Hiển thị modal thành công
        const successModal = document.getElementById("successModal");
        const successCode = document.getElementById("successCode");
        const successMsgLink = document.getElementById("successMsgLink");

        if (successCode) successCode.textContent = "#" + currentOrderCode;

        // Link nhắn Messenger kèm nội dung đơn hàng
        if (successMsgLink) {
          const itemsListText = items.map((it) => `- ${it.name}`).join("\n");
          const msg = `Chào BloomCard, mình vừa đặt đơn #${currentOrderCode} và đã chuyển khoản:\n${itemsListText}\nTổng tiền: ${formatPrice(total)}\nĐịa chỉ: ${address} - SĐT: ${phone}\nShop xác nhận đơn giúp mình nha!`;
          const fbUrl = (window.SHOP_CONFIG && window.SHOP_CONFIG.messengerUrl) || "https://m.me/bloomcard";
          successMsgLink.href = fbUrl;
          successMsgLink.onclick = () => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(msg).catch(() => {});
            }
          };
        }

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
