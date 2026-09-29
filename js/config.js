/* =========================================================
   CẤU HÌNH SHOP — chỉ cần sửa file này
   ========================================================= */
window.SHOP_CONFIG = {
  shopName: "BloomCard",

  // Link Facebook/Messenger mà nút "Mua ngay" sẽ mở.
  // Mẹo: nếu Page của bạn có username (vd: facebook.com/bloomcard),
  // hãy đổi thành "https://m.me/bloomcard" để mở thẳng khung chat Messenger.
  messengerUrl: "https://www.facebook.com/share/1E9iBfy95s/?mibextid=wwXIfr",

  // Tự động sao chép tin nhắn đặt hàng trước khi mở Messenger
  copyOrderMessage: true,

  // Mẫu tin nhắn đặt hàng. {name}, {price}, {qty}, {total} sẽ được thay tự động.
  orderTemplate:
    "Chào shop, mình muốn mua: {name} — SL: {qty} — Giá: {price}. Shop còn hàng không ạ?"
};
