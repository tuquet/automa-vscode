# Automa CLI Toolkit — Hướng dẫn sử dụng tính năng (User Guide)

**Extension**: Automa CLI Toolkit (`automa-vscode`)
**Publisher**: NguyenDinhTu
**Phiên bản tài liệu**: v0.0.1
**Đối tượng**: Người dùng cuối / Developer sử dụng VS Code để viết workflow, quản lý fleets và thực thi tự động hóa.

---

## Mục lục

1. [Tổng quan Extension](#1-tổng-quan-extension)
2. [Hệ thống File Extension](#2-hệ-thống-file-extension)
3. [Group 1: Custom Visual Editors](#3-group-1-custom-visual-editors)
4. [Group 2: Activity Bar Sidebar Views](#4-group-2-activity-bar-sidebar-views)
5. [Group 3: Context Menu Actions & Commands](#5-group-3-context-menu-actions--commands)
6. [Group 4: Settings & Configuration](#6-group-4-settings--configuration)
7. [Phụ lục: Bảng tổng hợp Commands](#7-phụ-lục-bảng-tổng-hợp-commands)

---

## 1. Tổng quan Extension

**Automa CLI Toolkit** biến VS Code thành trung tâm điều khiển cho toàn bộ hệ sinh thái Automa — từ thiết kế workflow, quản lý browser profile, đến thực thi và giám sát kết quả — mà không cần rời khỏi editor.

Extension tự động kích hoạt khi VS Code khởi động xong (`onStartupFinished`) và thực hiện:
- Hiển thị thông báo chào mừng khi cài lần đầu: *"Automa VS Code Extension is now active!"*
- Khởi chạy **Background Daemon** (`automa-cli serve`) để xử lý công việc chạy ngầm.
- Theo dõi (watch) tất cả các file JSON Automa trong workspace để cung cấp trải nghiệm liền mạch.

### Status Bar Indicator

Extension hiển thị một chỉ báo trạng thái trên thanh trạng thái dưới cùng (bên phải):

| Trạng thái | Hiển thị | Ý nghĩa |
| :--- | :--- | :--- |
| Idle | `◌ Automa: Idle` | Daemon chưa khởi động |
| Starting | `⟳ Automa: Starting` | Daemon đang khởi động |
| Running | `📡 Automa: :8765` | Daemon đang chạy tại port 8765 |
| External | `✓ Automa: :8765` | Tái sử dụng daemon đã chạy sẵn |

> [!TIP]
> Bấm vào chỉ báo trạng thái trên Status Bar để **bật/tắt daemon** nhanh chóng.

---

## 2. Hệ thống File Extension

Automa CLI Toolkit nhận diện và xử lý đặc biệt các định dạng file sau:

| Phần mở rộng | Loại dữ liệu | Trình biên tập mặc định |
| :--- | :--- | :--- |
| `*.automa.json` | Workflow (quy trình tự động hóa) | Workflow Preview |
| `*.fleets.json` / `*.fleet.json` | Fleet (nhóm thực thi song song) | Fleet Preview |
| `*.bprofile.json` / `*.profile.json` | Browser Profile (hồ sơ trình duyệt) | Profile Editor |
| `*.automa-log.json` | Execution Log (nhật ký thực thi) | Log Viewer |
| `*.package.json` | Package (khối block đóng gói) | Package Preview |
| `*.automa-var.json` | Variables | JSON Editor |
| `*.automa-table.json` | Table data | JSON Editor |
| `*.automa-cred.json` | Credentials | JSON Editor |
| `*.automa-folder.json` | Folder structure | JSON Editor |

> [!TIP]
> Khi bạn đặt tên file theo đúng quy ước trên, VS Code sẽ tự động mở file bằng trình biên tập trực quan tương ứng thay vì hiển thị JSON thô.

---

## 3. Group 1: Custom Visual Editors

### 3.1 Workflow Preview

**Mục đích**: Hiển thị trực quan quy trình tự động hóa dưới dạng giao diện card/node có cấu trúc thay vì đọc JSON thô, đồng thời cho phép chỉnh sửa metadata và chạy workflow ngay từ Preview.

**Cách thao tác**:
1. Tạo hoặc mở một file có đuôi `*.automa.json` trong workspace.
2. VS Code tự động mở file bằng **Workflow Preview** (nếu setting `automa.preview.defaultOnClick` đang bật).
3. Giao diện hiển thị gồm **4 tab**:

| Tab | Nội dung |
| :--- | :--- |
| **Trigger Parameters** | Danh sách các tham số kích hoạt (explicit từ BlockTrigger + implicit từ `{{variables.xyz}}`) với ô nhập giá trị. |
| **Global Data** | Trình soạn JSON (CodeMirror) cho biến toàn cục (`globalData`). |
| **Settings** | Trình soạn JSON cho cấu hình workflow (`settings`, `table`, `includedWorkflows`). |
| **Properties** | Metadata tổng quan: tên, mô tả, phiên bản, icon. |

4. **Thanh công cụ phía trên** cung cấp 3 nút hành động:
   - **💾 Save**: Lưu toàn bộ thay đổi metadata ngược vào file JSON.
   - **🔗 Studio**: Mở workflow trên Automa Extension Studio (trình duyệt).
   - **▶ Run**: Chạy workflow ngay với các tham số đã nhập trong tab Trigger Parameters.

> [!NOTE]
> **Auto-Sanitization**: Khi mở file workflow từ cộng đồng hoặc phiên bản cũ, extension tự động sửa chữa:
> - Cấp NanoID 21 ký tự cho các node có ID không hợp lệ (như `n1`, `n2`).
> - Cập nhật kết nối edge handles tương ứng.
> - Gán mặc định `type: 'BlockBasic'` cho node thiếu type.
> - Bổ sung root `id` và `version` nếu thiếu.
>
> Quá trình này diễn ra hoàn toàn tự động, bạn không cần thao tác gì thêm.

**Chuyển đổi giữa Preview ↔ Source Code**:
- Bấm nút **`</>`** (Show Workflow Source) trên thanh tiêu đề Editor để chuyển sang xem JSON thô.
- Bấm nút **👁 Preview** để quay lại giao diện trực quan.

---

### 3.2 Fleet Preview

**Mục đích**: Quản lý trực quan các nhóm thực thi song song (Fleet) — gán Workflow, Browser Profile, cấu hình schedule, và giám sát live execution status.

**Cách thao tác**:
1. Tạo hoặc mở file có đuôi `*.fleets.json`.
2. Giao diện **Fleet Preview** hiển thị:

| Khu vực | Nội dung |
| :--- | :--- |
| **Toolbar** | Chọn chế độ chạy đồng thời (Concurrency Mode: `queue` / `parallel` / `skip`), Global Variables JSON editor, nút Save / Stop / Run. |
| **Members Panel** | Danh sách thành viên — mỗi member đại diện 1 phiên trình duyệt. Hỗ trợ: thêm/xóa member, chọn browser profile từ dropdown, ghi chú mô tả. |
| **Tasks Panel** | Danh sách tác vụ gắn mỗi member. Hỗ trợ: thêm/xóa task, chọn workflow từ dropdown, cấu hình schedule (`on-start` / `cron` / `delay` / `once`), khai báo `depends_on`. |

3. Thay đổi bất kỳ dropdown hay trường nào sẽ đánh dấu file là đã sửa (modified).
4. Bấm **▶ Run** để khởi chạy fleet. Có 2 chế độ khởi chạy (hiện QuickPick):
   - **▶ Run Now**: Chạy fleet ngay lập tức.
   - **🕐 Start Daemon**: Chạy fleet dưới dạng daemon theo lịch (background scheduling).
5. Trong quá trình chạy, trạng thái từng task được **cập nhật real-time** trực tiếp trên giao diện Fleet Preview nhờ luồng telemetry.

> [!IMPORTANT]
> Nếu một ID trong file fleet không còn tồn tại trong workspace (file workflow hoặc profile đã bị xóa), dropdown sẽ hiển thị tiền tố **[Missing]** để cảnh báo mà không làm mất dữ liệu gốc.

---

### 3.3 Profile Editor

**Mục đích**: Chỉnh sửa cấu hình Browser Profile bằng trình soạn JSON có syntax highlighting và validation tích hợp.

**Cách thao tác**:
1. Tạo hoặc mở file có đuôi `*.bprofile.json` hoặc `*.profile.json`.
2. Giao diện **Profile Editor** hiển thị trình soạn CodeMirror toàn màn hình với JSON syntax highlighting.
3. Thanh công cụ:
   - **Format JSON**: Tự động căn chỉnh và format JSON cho dễ đọc.
   - **Save**: Lưu thay đổi vào file.
4. Nếu JSON có lỗi cú pháp, banner cảnh báo đỏ sẽ hiển thị ngay phía trên editor.

> [!TIP]
> Tạo nhiều profile khác nhau (UserAgent, Timezone, Proxy...) để mô phỏng các thiết bị và địa lý khi chạy Fleet song song.

---

### 3.4 Log Viewer

**Mục đích**: Xem nhật ký thực thi workflow dưới dạng timeline có cấu trúc, với khả năng lọc, tìm kiếm và drill-down vào chi tiết từng node.

**Cách thao tác**:
1. Sau khi chạy workflow, file log `*.automa-log.json` sẽ được tạo tự động.
2. Mở file log — VS Code tự động sử dụng **Log Viewer**.
3. Giao diện hiển thị **3 tab**:

| Tab | Nội dung |
| :--- | :--- |
| **Logs** | Timeline thực thi: timestamp (format `vi-VN`), icon trạng thái (🟢 success / 🔴 error / 🟡 stopped), tên block, thời gian xử lý. Bấm vào bất kỳ entry nào để xem JSON chi tiết (highlight.js). |
| **Table** | Bảng dữ liệu kết quả thu thập được (filterable data grid) + Raw JSON view. |
| **Variables** | Danh sách biến dạng Key-Value cards + Raw JSON view sau khi workflow chạy xong. |

4. Sử dụng bộ lọc:
   - **Thanh tìm kiếm**: Gõ tên block để lọc nhanh.
   - **Lọc theo trạng thái**: Chỉ hiển thị node thất bại hoặc thành công.
5. File log **tự động cập nhật** (auto-reload) khi có thay đổi nhờ FileSystemWatcher — hữu ích khi workflow đang chạy.

> [!NOTE]
> Log Viewer là trình biên tập **chỉ đọc** (read-only). Bạn không thể chỉnh sửa nội dung log từ giao diện này.

---

### 3.5 Package Preview

**Mục đích**: Xem và quản lý metadata các khối block đóng gói tái sử dụng (Reusable Package).

**Cách thao tác**:
1. Mở file `*.automa.json` có cấu hình `settings.asBlock = true` (hoặc chứa `inputs`/`outputs`).
2. Extension tự động nhận diện đây là Package (không phải Workflow thông thường) và sử dụng giao diện **Package Preview** với **3 tab**:

| Tab | Nội dung |
| :--- | :--- |
| **Package Interface** | Danh sách Inputs (tên, blockId), Outputs (tên, blockId), và Variables (tên, kiểu, giá trị mặc định) được expose bởi package. |
| **Settings** | Cấu hình package. |
| **Properties** | Metadata: tên, mô tả, phiên bản. |

---

## 4. Group 2: Activity Bar Sidebar Views

Extension đăng ký một **Activity Bar** riêng trên cột trái VS Code với biểu tượng Automa. Bấm vào để mở bảng điều khiển Side Panel chứa 5 mục:

### 4.1 Runners (Trình quản lý tiến trình)

**Mục đích**: Giám sát và điều khiển các tiến trình workflow/fleet đang chạy ngầm trong thời gian thực.

**Giao diện**:
- Mỗi runner hiển thị: **tên workflow/fleet**, **icon trạng thái** (⟳ đang chạy), **thông tin tiến trình**.
- **Badge count** trên tiêu đề view (ví dụ: `2 Active Runner(s)`).
- Tự động cập nhật khi runner bắt đầu hoặc kết thúc.

**Các thao tác**:

| Thao tác | Nút / Lệnh | Mô tả |
| :--- | :--- | :--- |
| Xem log runner | Bấm vào item | Mở và focus terminal chứa log output của runner đó. |
| Dừng tiến trình | 🛑 **Kill / Stop** (icon inline) | Gửi tín hiệu `SIGKILL` qua `tree-kill` để dọn dẹp toàn bộ cây tiến trình. |
| Làm mới danh sách | 🔄 **Refresh** (icon trên tiêu đề) | Quét lại danh sách runner đang hoạt động. |

> [!IMPORTANT]
> Khi bấm **Kill**, toàn bộ cây tiến trình sẽ bị hủy ngay lập tức (bao gồm cả cửa sổ trình duyệt đang mở). Hãy chắc chắn bạn muốn dừng trước khi bấm.

---

### 4.2 Profiles (Duyệt Browser Profile)

**Mục đích**: Duyệt nhanh và tìm kiếm tất cả các file Browser Profile (`*.bprofile.json`, `*.profile.json`) trong workspace.

**Giao diện**:
- Hiển thị danh sách profile với tên trích xuất từ trường `name` trong JSON (fallback về tên file).
- Hiển thị đường dẫn thư mục cha trong description để phân biệt các profile cùng tên.
- Bấm vào item để mở file bằng **Profile Editor**.

**Tìm kiếm**:
- Bấm 🔍 **Search** trên tiêu đề view → nhập từ khóa → danh sách lọc theo tên.
- Bấm **Clear Search** (xuất hiện khi đang lọc) để xóa bộ lọc.

---

### 4.3 Workflows (Duyệt Workflow)

**Mục đích**: Duyệt nhanh tất cả file `*.automa.json` (chỉ Workflow, không bao gồm Package) trong workspace.

**Giao diện & thao tác**: Tương tự Profiles view — hiển thị danh sách workflow theo tên, hỗ trợ tìm kiếm, bấm vào để mở bằng **Workflow Preview**.

---

### 4.4 Packages (Duyệt Package)

**Mục đích**: Duyệt nhanh tất cả file `*.automa.json` có `asBlock = true` (Reusable Package) trong workspace.

**Giao diện & thao tác**: Tương tự Workflows view — bấm vào để mở bằng **Package Preview**.

---

### 4.5 Fleets (Duyệt Fleet)

**Mục đích**: Duyệt nhanh tất cả file `*.fleets.json` / `*.fleet.json` trong workspace.

**Giao diện & thao tác**: Tương tự Workflows view — bấm vào để mở bằng **Fleet Preview**.

---

> [!TIP]
> **Tính năng chung của tất cả Sidebar Views**: Khi bạn thêm, xóa hoặc đổi tên file trong workspace, danh sách sẽ **tự động cập nhật** nhờ `FileSystemWatcher` — không cần Refresh thủ công.

---

## 5. Group 3: Context Menu Actions & Commands

### 5.1 Automa: Run Workflow

**Mục đích**: Thực thi ngay một file workflow trực tiếp từ VS Code mà không cần mở terminal hay gõ lệnh CLI thủ công.

**Cách thao tác**:
1. Trong **Explorer sidebar**, nhấp chuột phải vào file `.json` (không phải log) → chọn **Automa: Run Workflow**.
   - Hoặc bấm nút ▶ trên thanh tiêu đề Editor.
   - Hoặc bấm nút **Run** trong giao diện Workflow Preview.
2. Nếu workflow có **Trigger Parameters** và setting `useDefaultParameters` tắt:
   - VS Code sẽ hiện hộp thoại nhập (Input Prompt) cho từng tham số.
   - Nhập giá trị hoặc bấm Enter để dùng giá trị mặc định.
3. Extension tự động xây dựng lệnh CLI với các flag từ Settings:
   - `--variables` (biến từ form + global variables)
   - `--headless` / `--default-browser` / `--debug` / `--log-path` / `--keep-browser-open`
4. Thanh Status Bar hiển thị spinner `⟳` kèm tên workflow đang chạy.
5. Kết thúc:
   - **Thành công**: Thông báo toast kèm nút **Open Log** để mở Log Viewer.
   - **Thất bại**: Thông báo lỗi kèm exit code.

**Thứ tự ưu tiên giải quyết tham số (Parameter Resolution Hierarchy)**:

| Ưu tiên | Nguồn | Mô tả |
| :--- | :---: | :--- |
| 1 (Cao nhất) | Form Input | Giá trị bạn nhập trong hộp thoại tham số |
| 2 | `globalVariables` | Biến từ setting `automa.vault.run.globalVariables` |
| 3 | Hardcoded Default | Giá trị mặc định trong file `*.automa.json` |
| 4 (Thấp nhất) | Undefined | Bỏ trống |

> [!IMPORTANT]
> Đảm bảo Extension build (`automa-source/build/manifest.json`) tồn tại trước khi chạy. Nếu chưa có, chạy `npm run build:prod-chrome` trong `automa-source/`.

---

### 5.2 Automa: Run Fleet

**Mục đích**: Khởi chạy toàn bộ Fleet — thực thi song song nhiều workflow trên nhiều browser profile cùng lúc.

**Cách thao tác**:
1. Nhấp chuột phải vào file `*.fleets.json` → chọn **Automa: Run Fleet**.
2. VS Code hiện **QuickPick** với 2 lựa chọn:
   - **▶ Run Now**: Chạy fleet ngay lập tức (append flag `--run-now`).
   - **🕐 Start Daemon**: Khởi chạy fleet daemon chạy ngầm theo lịch schedule.
3. Trạng thái thực thi được stream real-time về giao diện Fleet Preview qua luồng telemetry.
4. Để dừng fleet, bấm **⏹ Stop Fleet** trong Fleet Preview hoặc Kill từng runner trong Runners view. Toast thông báo: "Stopped X fleet(s)".

---

### 5.3 Automa: Auto-Fix Workflow ID

**Mục đích**: Tự động sửa/cấp mới NanoID 21 ký tự cho các file workflow có ID không hợp lệ.

**Cách thao tác**:
1. Nhấp chuột phải vào một hoặc nhiều file `*.automa.json` → chọn **Automa: Auto-Fix Workflow ID**.
2. Extension quét root `id` và tất cả node `id`, thay thế ID không khớp regex `/^[A-Za-z0-9_-]{21}$/` bằng NanoID mới và ghi trực tiếp vào file.
3. Hỗ trợ **multi-selection** trong Explorer (chọn nhiều file cùng lúc).

> [!TIP]
> Cực kỳ hữu ích khi import workflow từ cộng đồng Automa cũ — các file này thường dùng ID dạng `n1`, `n2`.

---

### 5.4 Automa: Lint Check Workflow

**Mục đích**: Kiểm tra tính hợp lệ của file workflow theo quy chuẩn Automa, báo lỗi trực tiếp lên panel **Problems** của VS Code.

**Cách thao tác**:
1. Nhấp chuột phải vào file `*.automa.json` → chọn **Automa: Lint Check Workflow**.
2. Extension gọi `npx automa lint "<path>"` và parse kết quả đầu ra.
3. Lỗi và cảnh báo được ánh xạ chính xác đến **dòng và cột** trong file JSON.
4. Kết quả hiển thị trong panel **Problems** (`Ctrl+Shift+M`) với gạch chân lỗi (inline squiggles) ngay trong editor.

**Bảng phân loại mức độ lỗi**:

| Loại kiểm tra | Mức độ | Lý do |
| :--- | :--- | :--- |
| Sai lệch JSON Schema | ⚠️ Warning | Cho phép phác thảo linh hoạt trong môi trường Editor |
| ID không đúng NanoID | ❌ Error | Bắt buộc tuân thủ để VueFlow render đúng |
| Biến chưa khai báo | ⚠️ Warning | Cảnh báo sớm, không chặn luồng làm việc |

> [!NOTE]
> **Triết lý UX**: Trong môi trường Editor, Linter sử dụng mức **Warning** cho hầu hết lỗi cấu trúc. Mức **Error** nghiêm ngặt chỉ áp dụng trong Runner context khi thực thi thực sự.

---

### 5.5 Open in Studio

**Mục đích**: Mở workflow trên giao diện kéo-thả Automa Extension Studio trong trình duyệt thật.

**Cách thao tác**:
1. Trong Workflow Preview, bấm nút **🔗 Studio** trên toolbar.
2. Extension khởi chạy `automa-cli studio <path>` → mở Chromium với Extension → tiêm workflow → mở Studio popup.
3. Thông báo: "Opening workflow in Automa Studio...".

---

### 5.6 Show Source / Show Preview (Toggle)

**Mục đích**: Chuyển đổi qua lại giữa giao diện trực quan và mã nguồn JSON.

| Nút | Xuất hiện khi | Tác dụng |
| :--- | :--- | :--- |
| `</>` Show Source | Đang ở Custom Editor (Preview) | Chuyển sang xem JSON thô |
| 👁 Preview | Đang ở JSON Editor và file đúng định dạng | Chuyển sang giao diện trực quan |

Các cặp toggle: Workflow, Fleet, Log.

---

## 6. Group 4: Settings & Configuration

Mở **File → Preferences → Settings** (hoặc `Ctrl+,`), tìm kiếm `automa` để truy cập.

### 6.1 Editor & Preview

| Setting | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `automa.preview.defaultOnClick` | boolean | `true` | Mở file `*.automa.json` bằng Workflow Preview thay vì JSON Editor. Extension tự động cập nhật `workbench.editorAssociations` khi thay đổi setting này. |

---

### 6.2 Workflow Execution

| Setting | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `automa.run.useDefaultParameters` | boolean | `false` | Bỏ qua hộp thoại nhập tham số, luôn dùng giá trị mặc định. |
| `automa.vault.run.defaultBrowser` | enum | `"chromium"` | Trình duyệt mặc định để chạy workflow. |
| `automa.vault.run.headless` | boolean | `false` | Chạy trình duyệt ở chế độ ẩn. |
| `automa.vault.run.closeBrowserOnFinish` | boolean | `true` | Tự động đóng trình duyệt khi xong. |
| `automa.vault.run.debug` | boolean | `false` | Bật log chi tiết (verbose). |
| `automa.cliPath` | string | `""` | Đường dẫn tuyệt đối tới `automa-cli`. Để trống để tự phát hiện. |
| `automa.browserPathOverride` | string | `""` | Đường dẫn tuyệt đối tới trình duyệt tùy chỉnh. |
| `automa.daemon.port` | number | `8765` | Port cho daemon. Extension tự tìm port trống nếu bị chiếm (probe tới +100). |

**Các giá trị `defaultBrowser` khả dụng**:

| Giá trị | Mô tả |
| :--- | :--- |
| `chromium` | **(Mặc định)** Chromium cô lập do Puppeteer quản lý. An toàn nhất. |
| `chrome` | Google Chrome hệ thống. |
| `edge` | Microsoft Edge. |
| `firefox` | Mozilla Firefox. |
| `brave` | Brave Browser. |
| `active-tab` | Tab đang mở (không mở trình duyệt mới). |

**Cơ chế tự phát hiện CLI Path (Auto-Resolution)**:

Extension tìm `automa-cli` theo thứ tự ưu tiên sau:

| Ưu tiên | Nguồn | Chi tiết |
| :--- | :---: | :--- |
| 1 | `automa.cliPath` | Đường dẫn do bạn chỉ định, thực thi qua `node`. |
| 2 | Monorepo local | Tự tìm `../automa-cli/dist/cli.js` (cấu trúc monorepo). |
| 3 | npx fallback | `npx -y tuquet-automa-cli@latest` (tải từ npm). |

> [!TIP]
> **Với môi trường doanh nghiệp (Corporate)**: Nếu Chromium mặc định bị chặn bởi Group Policy, dùng `automa.browserPathOverride` để trỏ tới Edge:
> ```json
> "automa.browserPathOverride": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
> ```

---

### 6.3 Environment & Logs

| Setting | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `automa.vault.run.globalVariables` | object | `{}` | Biến toàn cục gắn thêm vào mỗi lần chạy. |
| `automa.vault.run.logPath` | string | `""` | Đường dẫn lưu file log. Để trống dùng mặc định. |

**Ví dụ cấu hình Global Variables** (trong `settings.json`):
```json
{
  "automa.vault.run.globalVariables": {
    "$$BASE_URL": "https://staging.myapp.com",
    "$$API_KEY": "sk-test-abc123",
    "$$TIMEOUT": "30000"
  }
}
```

> [!NOTE]
> Biến có tiền tố `$$` là **Global Variable**. Biến từ CLI flag `--variables` sẽ ghi đè (override) biến từ setting này.

### 6.4 Execution Logs Output Channel

Extension tạo một **Output Channel** riêng tên `"Automa Execution Logs"` trong panel Output (`Ctrl+Shift+U`). Tất cả log thực thi được format với timestamp:

```
[2026-08-04T14:30:00.000Z] [INFO] Starting workflow: Auth - Login.automa.json
[2026-08-04T14:30:05.123Z] [ERROR] Node "Click Login" failed: Element not found
```

---

## 7. Phụ lục: Bảng tổng hợp Commands

| Command ID | Tiêu đề hiển thị | Icon | Vị trí |
| :--- | :--- | :--- | :--- |
| `automa.runWorkflow` | Automa: Run Workflow | ▶ | Explorer Context Menu, Editor Title Run |
| `automa.runFleet` | Automa: Run Fleet | ▶ | Explorer Context Menu (`*.fleets.json`), Editor Title Run |
| `automa.fixWorkflowId` | Automa: Auto-Fix Workflow ID | 🔧 | Explorer Context Menu |
| `automa.lintCheck` | Automa: Lint Check Workflow | ☑️ | Explorer Context Menu |
| `automa.openInStudio` | Open in Studio | 🔗 | Workflow Preview Toolbar |
| `automa.showWorkflowSource` | Show Workflow Source | `</>` | Editor Title (trong Workflow Preview) |
| `automa.showWorkflowPreview` | Preview Workflow | 👁 | Editor Title (trên file `*.automa.json`) |
| `automa.showFleetSource` | Show Fleet Source | `</>` | Editor Title (trong Fleet Preview) |
| `automa.showFleetPreview` | Preview Fleet | 👁 | Editor Title (trên file `*.fleets.json`) |
| `automa.showLogSource` | Show Source | `</>` | Editor Title (trong Log Viewer) |
| `automa.showLogPreview` | Open Preview | 👁 | Editor Title (trên file `*.automa-log.json`) |
| `automa.refreshRunners` | Refresh | 🔄 | Runners View title |
| `automa.killRunner` | Kill / Stop | 🛑 | Runners View item inline |
| `automa.showRunnerLog` | Show Runner Log | — | Bấm vào runner item |
| `automa.searchProfiles` | Search | 🔍 | Profiles View title |
| `automa.searchWorkflows` | Search | 🔍 | Workflows View title |
| `automa.searchPackages` | Search | 🔍 | Packages View title |
| `automa.searchFleets` | Search | 🔍 | Fleets View title |
| `automa.clearSearch*` | Clear Search | 🧹 | View title (khi đang lọc) |
| `automa.toggleDaemon` | Toggle Daemon | — | Status Bar click |
