# Coursera VTT Loader Extension

Tools hỗ trợ học tập trên Coursera với các tính năng:
- **Trích xuất (Extract)** phụ đề gốc từ video.
- **Biên tập (Editor)**: Chỉnh sửa trực tiếp nội dung VTT ngay trên panel.
- **Dịch (Translate)** phụ đề sang tiếng Việt (hoặc ngôn ngữ khác) sử dụng AI (OpenAI hoặc Google Gemini).
- **Hiển thị (Load)** phụ đề song ngữ hoặc phụ đề dịch trực tiếp trên video.
- **Text-to-Speech (TTS):** Đọc phụ đề bằng giọng đọc tự nhiên (sử dụng Browser Speech API).

## 🚀 Cài đặt (Installation)

1. **Tải mã nguồn:**
   - Clone repository này hoặc tải về file ZIP và giải nén.
   ```bash
   git clone https://github.com/minhphongvn/coursera-transcript.git
   ```

2. **Cài đặt vào Chrome/Edge:**
   - Mở trình duyệt và truy cập địa chỉ: `chrome://extensions/`
   - Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
   - Nhấn vào nút **Load unpacked** (Tiện ích đã giải nén).
   - Chọn thư mục chứa mã nguồn extension (thư mục có file `manifest.json`).

## 📖 Hướng dẫn sử dụng (Usage)

Sau khi cài đặt thành công, khi bạn mở một video bài học trên Coursera, một bảng điều khiển (Panel) sẽ xuất hiện ở góc màn hình.

### Các chức năng chính:

1.  **Ô nhập VTT (VTT Editor):**
    - Khung soạn thảo cho phép bạn dán, xem và chỉnh sửa nội dung WebVTT trực tiếp.
    - Nội dung sẽ tự động được lưu lại cho mỗi video.

2.  **📥 Extract (Trích xuất):**
    - Nhấn nút này để trích xuất phụ đề gốc. Nội dung sẽ hiện vào ô VTT Editor.
    - *Lưu ý: Bạn cần đợi video tải xong phụ đề mới có thể trích xuất được.*

3.  **⚙️ Cài đặt (Settings):**
    - Nhấn biểu tượng ⚙️ để mở cài đặt.
    - **Provider:** Chọn dịch vụ AI (OpenAI hoặc Google Gemini).
    - **API Key:** Nhập API Key của bạn (bắt buộc để sử dụng tính năng dịch).
    - **Ngôn ngữ đích:** Nhập `Vietnamese` hoặc tên ngôn ngữ bạn muốn dịch sang.

4.  **📋 Copy Prompt (Sao chép lệnh):**
    - Nếu bạn không có API Key, dùng tính năng này để copy toàn bộ lệnh dịch (Prompt) + phụ đề.
    - Sau đó dán vào ChatGPT hoặc Google Gemini trên web để nhờ dịch thủ công.
    - Dán kết quả dịch ngược lại vào ô VTT Editor.

5.  **🌐 Translate (Dịch):**
    - Sau khi đã Extract và nhập API Key, nhấn nút này để dịch nội dung trong ô Editor.
    - Kết quả dịch sẽ thay thế nội dung trong ô Editor.

6.  **▶️ Load (Hiển thị):**
    - Nhấn nút này để hiển thị phụ đề từ ô Editor lên video.

7.  **🔊 Text-to-Speech (Đọc văn bản):**
    - Bật công tắc **Text-to-Speech** để nghe đọc phụ đề.
    - Sử dụng giọng đọc mặc định của trình duyệt (Browser Text-to-Speech).
    - Điều chỉnh tốc độ đọc ở thanh **Speed**.

### Lưu ý:
- Nếu panel không hiện, hãy thử reload lại trang (F5).
- Đảm bảo bạn có kết nối mạng ổn định để sử dụng dịch vụ AI và TTS.

## 🛠 Troubleshooting (Sửa lỗi)
- **Lỗi "No video found":** Hãy đảm bảo video đã load xong. Thử reload trang.
- **Lỗi API:** Kiểm tra lại API Key và hạn ngạch (quota) của tài khoản OpenAI/Gemini.
