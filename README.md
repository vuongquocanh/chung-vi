# Chung Ví 💍

Quản lý chi tiêu cá nhân và dành cho cặp đôi sắp cưới:
- **Chi tiêu:** thu/chi theo tháng, ngân sách theo danh mục, mục tiêu tiết kiệm.
- **Cặp đôi:** tự tính chia đôi chi tiêu chung, và kế hoạch đám cưới gồm chi phí, checklist, khách mời và tiền mừng.

- **Web/PWA:** thư mục `www/` — chạy trên mọi trình duyệt, cài được lên màn hình chính, dùng được khi mất mạng.
- **Đồng bộ đám mây:** Firebase (tuỳ chọn) — đăng nhập, dùng chung sổ hai người, dữ liệu realtime.
- **iOS:** Capacitor + GitHub Actions → TestFlight, không cần máy Mac.

Chạy thử: `python -m http.server 5173 --directory www` rồi mở http://localhost:5173

Hướng dẫn triển khai đầy đủ: **[DEPLOY.md](DEPLOY.md)**
