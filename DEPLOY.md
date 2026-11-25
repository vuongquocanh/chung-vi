# Triển khai Chung Ví — web, mọi thiết bị, lưu đám mây & TestFlight

## Kiến trúc

| Thành phần | Công nghệ | Chi phí |
|---|---|---|
| Web chạy mọi thiết bị (máy tính, Android, iPhone) | PWA tĩnh trong `www/`, host trên **GitHub Pages** | Miễn phí |
| Cài như app, mở khi không có mạng | `manifest.webmanifest` + `sw.js` (service worker) | — |
| Đăng nhập, lưu trữ lâu dài, dùng chung sổ 2 người, đồng bộ realtime | **Firebase Auth + Cloud Firestore** (`www/js/cloud.js`) | Miễn phí (gói Spark) |
| App iOS trên TestFlight | **Capacitor** đóng gói `www/`, build trên Mac của **GitHub Actions** | Apple Developer 99 USD/năm |

Bạn **không cần máy Mac** và **không cần cài Node** trên máy: mọi bước build chạy trên GitHub.

```
www/                    ← toàn bộ web app (đây là thứ được deploy)
  index.html, css/, js/app.js
  js/cloud.js           ← đồng bộ Firebase (tự tắt nếu chưa cấu hình)
  js/firebase-config.js ← điền cấu hình Firebase ở đây
  sw.js, manifest.webmanifest, icons/
assets/icon-1024.png    ← icon app iOS
firestore.rules         ← luật bảo mật dữ liệu
capacitor.config.json   ← cấu hình app iOS
.github/workflows/
  deploy-web.yml        ← tự deploy web khi push
  ios-testflight.yml    ← build iOS + tải lên TestFlight
tools/make_icons.py     ← sinh lại icon
```

---

## A. Đưa code lên GitHub

1. Tạo tài khoản tại https://github.com (nếu chưa có).
2. Cài **GitHub Desktop** (https://desktop.github.com) — dễ nhất trên Windows, không cần gõ lệnh git.
3. GitHub Desktop → *File → Add local repository* → chọn thư mục `D:\ClaudeProject\Dashboard` → khi được hỏi, chọn *create a repository*.
4. Commit → *Publish repository*. Nên để repo **Public**, vì:
   - GitHub Pages miễn phí cho repo public.
   - Phút chạy máy Mac của GitHub Actions **miễn phí cho repo public** (repo private bị tính gấp 10 lần).
   - Trong code không có bí mật nào: cấu hình Firebase vốn được thiết kế để công khai, còn khoá Apple nằm trong *Secrets*.

## B. Đưa web lên mạng (GitHub Pages)

1. Repo trên GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Vào tab **Actions** → chạy workflow *Deploy web (GitHub Pages)* (hoặc push bất kỳ thay đổi nào trong `www/`).
3. Sau khoảng 1 phút, web có ở địa chỉ `https://<tên-github>.github.io/<tên-repo>/`.

**Cài như app trên từng thiết bị:**
- **iPhone/iPad:** mở bằng Safari → nút Chia sẻ → *Thêm vào MH chính*.
- **Android:** Chrome → menu ⋮ → *Cài đặt ứng dụng*.
- **Máy tính:** Chrome/Edge → biểu tượng cài đặt trên thanh địa chỉ.

## C. Bật lưu trữ đám mây & dùng chung sổ (Firebase)

Nếu chưa cấu hình, dữ liệu chỉ nằm trong trình duyệt của từng máy. Các bước để bật đồng bộ:

1. Vào https://console.firebase.google.com → **Add project** (có thể tắt Google Analytics).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**.
3. **Build → Firestore Database → Create database** → chọn location `asia-southeast1 (Singapore)` → **production mode**.
4. Mở tab **Rules** của Firestore → xóa hết nội dung → dán toàn bộ file [`firestore.rules`](firestore.rules) → **Publish**.
5. ⚙️ **Project settings → General → Your apps → biểu tượng Web `</>`** → đặt tên "Chung Ví" → *Register app* → copy các giá trị trong `firebaseConfig` vào [`www/js/firebase-config.js`](www/js/firebase-config.js):
   ```js
   export default {
     apiKey: 'AIza...',
     authDomain: 'ten-du-an.firebaseapp.com',
     projectId: 'ten-du-an',
     storageBucket: 'ten-du-an.appspot.com',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123',
   };
   ```
6. **Authentication → Settings → Authorized domains → Add domain** → thêm `<tên-github>.github.io`.
7. Commit và push → web tự deploy lại.

**Cách dùng:**
- Người thứ nhất: **Cài đặt → Đồng bộ đám mây → Tạo tài khoản**. Dữ liệu đang có trên máy sẽ được chuyển lên đám mây, và app hiện ra một **mã mời 8 ký tự**.
- Người ấy: tạo tài khoản riêng → nhập mã mời → **Tham gia**. Từ lúc này hai người cùng xem và sửa một sổ, thay đổi hiện ra gần như ngay lập tức trên mọi thiết bị.
- Sửa khi mất mạng vẫn được: dữ liệu tự đẩy lên khi có mạng lại.
- Gói miễn phí của Firebase cho phép 50.000 lượt đọc và 20.000 lượt ghi mỗi ngày, cùng 1 GB lưu trữ. Mức này dư sức cho vài gia đình.

> Bảo mật: `firestore.rules` chỉ cho **thành viên của sổ** đọc/ghi dữ liệu. Người có mã mời chỉ được *tự thêm mình* vào sổ (tối đa 4 người).

## D. App iOS trên TestFlight

### Cần có
- Tài khoản **Apple Developer Program** (99 USD/năm): https://developer.apple.com/programs/enroll — đăng ký được bằng ứng dụng *Apple Developer* trên iPhone.

### Thiết lập một lần
1. **Đăng ký Bundle ID:** https://developer.apple.com/account/resources/identifiers → **+** → *App IDs* → *App* → Bundle ID *Explicit*, ví dụ `com.tenban.chungvi`.
2. **Tạo app trên App Store Connect:** https://appstoreconnect.apple.com → *Apps* → **+ New App** → Platform iOS, tên "Chung Ví" (nếu bị trùng tên thì đổi, ví dụ "Chung Ví – Sổ đôi ta"), ngôn ngữ Vietnamese, chọn Bundle ID vừa tạo, SKU `chungvi`.
3. **Tạo API key:** App Store Connect → *Users and Access → Integrations → App Store Connect API → Team Keys* → **+** → quyền **Admin** → *Generate*.
   - Tải file `AuthKey_XXXXXX.p8`. Apple chỉ cho tải **một lần**.
   - Ghi lại **Key ID** và **Issuer ID** (hiện ở đầu trang).
4. **Tạo khoá ký chứng chỉ:** mở PowerShell rồi chạy lệnh dưới. Khi được hỏi passphrase, nhấn Enter hai lần để bỏ trống.
   ```powershell
   ssh-keygen -t rsa -b 2048 -m PEM -f "$HOME\chungvi_cert_key"
   ```
   - File `chungvi_cert_key` (không có đuôi) là khoá bí mật. Hãy cất giữ cẩn thận và **không commit** lên GitHub.
   - Workflow dùng khoá này để tạo chứng chỉ phân phối một lần rồi **tái sử dụng** ở mọi lần build sau. Apple giới hạn số chứng chỉ phân phối, nên đừng làm mất khoá.
5. **Thêm vào GitHub:** repo → *Settings → Secrets and variables → Actions*.
   - Tab **Secrets → New repository secret**:

     | Tên | Giá trị |
     |---|---|
     | `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
     | `APP_STORE_CONNECT_KEY_IDENTIFIER` | Key ID |
     | `APP_STORE_CONNECT_PRIVATE_KEY` | toàn bộ nội dung file `.p8` (mở bằng Notepad, copy cả dòng BEGIN/END) |
     | `CERTIFICATE_PRIVATE_KEY` | toàn bộ nội dung file `chungvi_cert_key` |

   - Tab **Variables → New repository variable**: `BUNDLE_ID` = `com.tenban.chungvi`.

### Build & phát hành
1. GitHub → **Actions → iOS → TestFlight → Run workflow** → nhập phiên bản (ví dụ `1.0.0`) → *Run*. Hoặc push một tag `v1.0.0`.
2. Workflow chạy khoảng 15–25 phút trên máy Mac của GitHub, gồm các bước:
   - tạo project iOS bằng Capacitor;
   - gắn icon và số phiên bản;
   - ký ứng dụng;
   - build file `.ipa` và tải lên App Store Connect.

   Số build tự tăng theo mỗi lần chạy.
3. Trên App Store Connect → **TestFlight**, chờ build xử lý xong (5–30 phút).
   - **Internal Testing:** tạo nhóm → thêm người thử (tối đa 100 người, phải là thành viên team App Store Connect) → họ nhận email mời.
   - **External Testing:** tối đa 10.000 người, chia sẻ được qua link công khai. Lần đầu phải qua *Beta App Review* của Apple (thường dưới 1–2 ngày).
4. Người thử cài ứng dụng **TestFlight** từ App Store → bấm vào lời mời → cài Chung Ví.

> Nếu có máy Mac (không bắt buộc), có thể build tay:
> 1. `npm install`
> 2. `npx cap add ios`
> 3. `npm run ios:sync`
> 4. `npx cap open ios`
> 5. Trong Xcode chọn *Product → Archive → Distribute App*.

## E. Chạy thử trên máy

```powershell
python -m http.server 5173 --directory www
```
Sau đó mở http://localhost:5173.

## Lưu ý
- Sau khi bật Firebase, dữ liệu nằm trên đám mây, còn mỗi máy giữ một bản sao để dùng khi mất mạng. Nút **Sao lưu (JSON)** trong Cài đặt vẫn dùng được để lưu một bản riêng.
- **Đăng nhập** một tài khoản đã có trên máy mới: dữ liệu đám mây sẽ thay cho dữ liệu trên máy đó.
- **Tạo tài khoản mới:** dữ liệu trên máy được chuyển lên đám mây.
- **Tham gia bằng mã mời:** máy sẽ hiển thị sổ chung thay cho sổ cũ.
- Nếu hai người cùng sửa **một mục** (ví dụ cùng bảng chi phí cưới) trong cùng một lúc, bản lưu sau sẽ thắng. Riêng giao dịch được lưu từng cái riêng nên không bị đè lên nhau.
- Muốn có app Android trên Google Play: thêm `@capacitor/android` và một workflow tương tự. Hiện tại PWA đã cài được trên Android.
