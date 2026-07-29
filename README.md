# Automa VS Code Extension

Một extension gọn nhẹ nhưng mạnh mẽ dành cho hệ sinh thái **Automa**, giúp bạn quản lý, chạy và xem báo cáo các workflow trực tiếp bên trong Visual Studio Code.

## 🚀 Tính năng nổi bật

### 1. Run Workflow siêu tốc
- Hỗ trợ chạy các workflow `.json` ngay lập tức thông qua biểu tượng `Play` trên thanh tiêu đề hoặc qua Menu chuột phải (Context Menu) trong Explorer.
- Kích hoạt ngầm `automa-cli` và mở ra một Background Task hiển thị tiến trình. Bắt lỗi chuẩn xác và thông báo trực quan trên màn hình.

### 2. Workflow Quick Edit (Trình chỉnh sửa nhanh)
- Khác với giao diện JSON khô khan, khi click vào các file có đuôi `*.automa.json`, extension sẽ tự động mở màn hình **Quick Edit**.
- Giao diện form cực kỳ trực quan ở chính giữa màn hình giúp bạn thiết lập `Name`, `Description`, `Trigger Parameters`, `Settings`, `Global Data` một cách nhanh chóng.
- Vẫn cho phép nhấn nút `Show Source` (biểu tượng code `</>`) góc trên bên phải để quay về chế độ sửa JSON thuần.

### 3. Automa Execution Log Viewer
- Mỗi khi `automa-cli` chạy xong, một file log dạng `*.automa-log.json` sẽ được sinh ra.
- Thay vì phải đọc cục JSON khổng lồ, extension cung cấp một Custom Editor dành riêng cho file log, biến chúng thành dạng bảng **Báo cáo thực thi** đẹp mắt (Timeline, Trạng thái thành công/thất bại của từng Block).

---

## ⚙️ Cấu hình (Settings)

Bạn có thể tinh chỉnh cách hoạt động của extension thông qua VS Code Settings (nhấn `Ctrl + ,` và gõ `automa`):

| Tên thiết lập | Mô tả | Mặc định |
|---|---|---|
| `automa.run.useDefaultParameters` | Bỏ qua bước hỏi tham số (interactive prompts) khi chạy workflow. Tự động dùng giá trị mặc định của Trigger. | `false` |
| `automa.preview.defaultOnClick` | Biến màn hình Quick Edit (hoặc Preview) thành trình soạn thảo mặc định khi bạn click vào các file `*.automa.json`. (Nếu tắt, IDE sẽ mở JSON thuần) | `true` |

### ⚙️ Vault Settings (Khuyên dùng cho Workspace)
Để cá nhân hóa một thư mục chứa workflow (gọi là Automa Vault), bạn nên tạo file `.vscode/settings.json` bên trong thư mục đó và cấu hình các thông số sau:

| Tên thiết lập | Mô tả | Mặc định |
|---|---|---|
| `automa.vault.run.defaultBrowser` | Trình duyệt mặc định sẽ dùng để chạy workflow (`chrome`, `edge`, `firefox`, `brave`, `active-tab`) | `chrome` |
| `automa.vault.run.headless` | Chạy trình duyệt ở chế độ ngầm (không mở cửa sổ). | `false` |
| `automa.vault.run.closeBrowserOnFinish` | Tự động đóng trình duyệt sau khi chạy xong. | `false` |
| `automa.vault.run.globalVariables` | Định nghĩa 1 object JSON chứa các biến dùng chung cho cả Vault. Sẽ tự động nối vào tham số `-v` của lệnh. | `{}` |

> 💡 **Lưu ý về thứ tự ưu tiên của biến số (Trigger Parameters):**
> Khi nhấn nút **Run** trên giao diện Preview, hệ thống sẽ chắt lọc tham số theo thứ tự ưu tiên sau: 
> 1. Biến nhập trên Form (Ưu tiên cao nhất).
> 2. Biến trong `globalVariables` ở `settings.json`.
> 3. Giá trị `Default` lưu cố định bên trong file `*.automa.json`.
> 4. Rỗng (Undefined).

> 💡 **Mẹo:** Nếu bạn lỡ cài `defaultOnClick` là `true` nhưng vẫn muốn mở JSON của một file cụ thể, hãy click phải chuột vào file trong cây thư mục Explorer -> Chọn **Open With...** -> Chọn **Text Editor**.

---

## 🛠 Yêu cầu hệ thống

- Visual Studio Code phiên bản `>=1.80.0`
- Đã cài đặt Node.js và module `automa-cli` (nếu chạy local).
