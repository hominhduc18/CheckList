# Checklist Bệnh viện (PWA)

Số hóa bảng checklist hằng ngày cho **nhiều khoa**. Giao diện tiếng Việt, **nền trắng – chữ xanh**.

## Chạy nhanh

```bash
cd E:\CheckList
npm run install:all
npm run seed
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:3001  

### Tài khoản demo (sau `npm run seed`)

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@bv.local` | `Admin@123` |
| Quản lý khoa | `khoa.kham@bv.local` | `Manager@123` |

Nhân viên **không đăng nhập** — chỉ mở link `/r/<mã_phòng>` (quét QR).

## Chức năng

### Nhân viên (QR)
- Tick checklist, Tick tất cả, gõ tên (nhớ + gợi ý)
- Giờ lấy từ server, ghi chú bắt buộc khi thiếu mục
- Ảnh tùy chọn (nén, ≤5 MB)
- Bản bổ sung cùng ca, chống gửi quá nhanh
- **Offline**: lưu tạm “Chờ gửi”, tự gửi lại khi có mạng

### Quản lý / Admin (đăng nhập)
- Lịch sử lọc + ẩn bản ghi nghi ngờ
- Xuất **Excel / CSV / PDF** (đúng bộ lọc)
- Thống kê, lịch tháng (xanh/đỏ/xám), PDF tháng phòng
- Admin: khoa, phòng, mẫu (nhân bản/ẩn/xóa 2 bước), tài khoản, đổi mã QR, audit log
- Tải QR **PNG** và **PDF A5** để in
- Sao lưu DB + xuất JSON toàn bộ

### Tự động (server)
- Nhắc 08:30 nếu phòng chưa có bản trong ngày (ghi log + danh sách email cấu hình)
- Báo cáo Excel cuối tuần / cuối tháng → `server/data/reports/`
- Sao lưu DB 02:00 → `server/data/backups/` (giữ tối thiểu ~5 năm)

## Công nghệ

React + Vite PWA · Express · SQLite · ExcelJS · pdf-lib (Noto Sans) · QRCode · JWT

Không cần cloud. Dữ liệu tại `server/data/checklist.db`.

## In QR

1. Đăng nhập Admin → **Quản trị → Phòng / QR**  
2. Tải **PDF A5** → in dán tại phòng  
3. Đổi mã QR khi cần (mã cũ vô hiệu)

Đặt **URL gốc app** trong Cài đặt trước khi in (vd. `https://checklist.benhvien.vn`).

## Phân quyền server

- Admin: toàn bộ  
- Quản lý khoa: chỉ khoa trong `department_ids`  
- API lịch sử / xuất / thống kê yêu cầu JWT  

## Kiểm thử nhanh

1. Form QR: đủ / thiếu+ghi chú / thiếu không ghi chú  
2. Gửi trùng ca → bản bổ sung  
3. Gửi &lt; 8 giây → 429  
4. Đổi mã QR → link cũ 404  
5. Excel tiếng Việt, sheet Tổng hợp + sheet mẫu  
6. PDF bản ghi + PDF tháng  
7. Offline → Chờ gửi → online tự gửi  
8. Manager chỉ thấy khoa mình  

## Hỏi CNTT / QLCL trước khi chạy thật

1. Dữ liệu được lưu trên máy chủ nào (trong viện / đám mây)?  
2. Thời hạn lưu trữ (đề xuất ≥ 5 năm) và quy trình sao lưu?  
3. Có được dùng dịch vụ email ngoài viện để nhắc việc không?  
4. Chính sách không lưu thông tin bệnh nhân trên checklist?  
5. Ai được cấp tài khoản quản lý / admin?
