/*
 * Cấu hình Firebase để bật ĐỒNG BỘ ĐÁM MÂY (đăng nhập, dùng chung sổ giữa 2 người, lưu trữ lâu dài).
 *
 * Để trống apiKey = app chạy chế độ chỉ lưu trên thiết bị.
 * Cách lấy: Firebase Console → Project settings → Your apps → Web app → "SDK setup and configuration" → Config.
 * Các giá trị này KHÔNG phải mật khẩu — chúng được thiết kế để công khai trong web; dữ liệu được bảo vệ bởi
 * firestore.rules (chỉ thành viên của sổ mới đọc/ghi được).
 */
export default {
  apiKey: 'AIzaSyAfXAUW1oCTxwvdOS-Rvz28tngGeWonTao',
  authDomain: 'chung-vi-7c238.firebaseapp.com',
  projectId: 'chung-vi-7c238',
  storageBucket: 'chung-vi-7c238.firebasestorage.app',
  messagingSenderId: '1027337474459',
  appId: '1:1027337474459:web:2e8a24a1fd29c18960913e',
};
