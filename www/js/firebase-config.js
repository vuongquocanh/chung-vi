/*
 * Cấu hình Firebase để bật ĐỒNG BỘ ĐÁM MÂY (đăng nhập, dùng chung sổ giữa 2 người, lưu trữ lâu dài).
 *
 * Để trống apiKey = app chạy chế độ chỉ lưu trên thiết bị (như cũ).
 * Cách lấy: Firebase Console → Project settings → Your apps → Web app → "SDK setup and configuration" → Config.
 * Các giá trị này KHÔNG phải mật khẩu — chúng được thiết kế để công khai trong web; dữ liệu được bảo vệ bởi
 * firestore.rules (chỉ thành viên của sổ mới đọc/ghi được).
 */
export default {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
