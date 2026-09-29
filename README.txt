BLOOMCARD — TRANG BÁN PHOTOCARD
================================

CẤU TRÚC
  index.html            Trang bán hàng
  hello/index.html      Trang quản trị (mở: <tên-web>/hello/)
  css/style.css         Giao diện trang bán hàng
  css/admin.css         Giao diện trang quản trị
  js/config.js          Link Messenger + mẫu tin nhắn đặt hàng
  js/supabase-config.js Kết nối Supabase (chỉ publishable key)
  js/data.js            Tải sản phẩm + feedback từ Supabase
  js/main.js            Danh sách card, nút Mua ngay, bộ lọc, menu
  js/motion.js          Card chuyển động + sao lấp lánh đầu trang
  js/glide.js           Dải ảnh feedback 3D
  js/admin.js           Trang quản trị
  js/products.js        Sản phẩm dự phòng (khi mất kết nối)
  js/feedback.js        Feedback dự phòng + tốc độ dải feedback
  js/vendor/supabase.js Thư viện Supabase
  images/               Logo, favicon, ảnh card
  supabase-setup.sql    Lệnh tạo bảng + kho ảnh trên Supabase

QUẢN LÝ SẢN PHẨM
  Vào <tên-web>/hello/ đăng nhập bằng tài khoản tạo trong
  Supabase -> Authentication -> Users.
  Thêm / sửa / xoá card và ảnh feedback -> khách thấy ngay.
  Mục "Đã xoá" để khôi phục.

ĐỔI GIAO DIỆN
  Sửa file rồi tải lại lên GitHub. Không bao giờ dán key
  "secret" / "service_role" vào code.
