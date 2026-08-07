# Automa VS Code Extension - Self Improvement Loop

## 1. Khởi tạo & Quản lý Tiến độ
- Workspace tạm tạo tại `/tmp/loop-workspace-vscode` (nhánh `dev`).
- Kiểm tra linter: Phát hiện lỗi biome parse HTML/Vue syntax ở `workflow-preview.html` và lỗi SVG a11y.
- Kiểm tra TypeScript: OK (Không có lỗi type).

## 2. Deep Code Review (Góc nhìn: SOLID)
**Files phân tích**: `src/commands/CommandManager.ts` & `src/providers/ProviderManager.ts`

**Điểm mù (Blind spots)**:
1. **Vi phạm Open/Closed Principle (OCP)**: Cả `CommandManager` và `ProviderManager` hiện đang đăng ký toàn bộ commands và providers một cách thủ công qua mảng tĩnh. Mỗi khi thêm một tính năng mới (lệnh mới hoặc view mới), bắt buộc phải mở các file này ra và thêm import, đăng ký.
   -> *Giải pháp tiềm năng*: Chuyển sang mô hình Registry hoặc tự động quét (auto-discovery) thông qua Decorator/Metadata, hoặc mỗi module export ra một list tự đăng ký.
2. **Hardcoded Strings**: Các View IDs (ví dụ: `"automa.workflows"`, `"automa.browserProfiles"`) và Command IDs đang bị hardcode rải rác.
   -> *Giải pháp tiềm năng*: Gom toàn bộ ID thành hằng số (constants) để tránh rủi ro typo và dễ refactor.

## 3. Thực thi theo ưu tiên
- **Phase 1 (Fix lỗi)**: 
  - Đã fix `biome.json` thêm `"ignore": ["**/*.html", "**/*.svg"]` để tránh lỗi parse khi chạy `pnpm run check` đối với các file webview chứa Vue syntax `{{...}}`.
- **Phase 2 (Tính năng)**: Ghi nhận điểm mù về SOLID để có thể refactor vào chu kỳ sau.
- **Phase 3 (Test)**: Type checks đều pass (`tsc --noEmit`).

## 4. Cập nhật & Báo cáo
Hoàn tất chu kỳ. Thay đổi được commit và đẩy lên `origin/dev`.
