Flow hiện tại sau khi sửa là:

1. **Shipper đăng nhập**
   - Vào `/shipper`.
   - Nhập SĐT khách nhận, email khách nếu có.
   - Chọn một tủ đang `empty`.

2. **Shipper đặt tủ**
   - Frontend gọi RPC `reserve_locker_for_dropoff`.
   - Database kiểm tra:
     - user có role `shipper` hoặc `admin`
     - tủ tồn tại
     - tủ đang trống
     - SĐT hợp lệ
   - Nếu hợp lệ:
     - tạo order trạng thái `reserved`
     - chuyển locker sang `reserved`

3. **Server gửi lệnh mở tủ**
   - Frontend gọi tiếp RPC `request_dropoff_open`.
   - Nếu hợp lệ:
     - order chuyển sang `awaiting_dropoff`
     - locker chuyển sang `awaiting_dropoff`
   - UI shipper hiển thị “Tủ đã mở”.

4. **Shipper bỏ hàng và đóng cửa**
   - Hiện tại đang mô phỏng bằng nút **Cửa đã đóng** trên giao diện shipper.
   - Nút này đại diện cho phần cứng/cảm biến gửi event đóng cửa.
   - Frontend gọi RPC `confirm_dropoff_closed`.

5. **Server sinh OTP**
   - `confirm_dropoff_closed` sẽ:
     - tìm order đang `awaiting_dropoff`
     - sinh OTP 6 số trong database
     - set `otp_expires_at`
     - chuyển order sang `stored`
     - chuyển locker sang `occupied`
     - tạo record trong bảng `notifications`
   - UI shipper hiển thị OTP vừa sinh.

6. **Khách nhận OTP**
   - Hiện tại hệ thống chưa gửi SMS/email thật.
   - OTP được lưu vào `notifications` với trạng thái `queued`.
   - Admin/shipper có thể thấy OTP trong UI.

7. **Khách đến nhận hàng**
   - Khách vào `/locker-terminal`.
   - Nhập mã tủ và OTP.

8. **Thiết bị xác thực OTP**
   - `/locker-terminal` gọi RPC `verify_pickup_otp`.
   - Database kiểm tra:
     - có order `stored` trong tủ không
     - OTP đúng không
     - OTP hết hạn chưa
     - OTP đã dùng chưa
   - Nếu hợp lệ:
     - order sang `pickup_in_progress`
     - locker sang `pickup_in_progress`
     - UI báo tủ đã mở.

9. **Khách lấy hàng và đóng cửa**
   - Hiện tại mô phỏng bằng nút **Cửa đã đóng** trên `/locker-terminal`.
   - Gọi RPC `confirm_pickup_closed`.

10. **Hoàn tất đơn**

- `confirm_pickup_closed` sẽ:
  - order sang `completed`
  - set `picked_up_at`, `completed_at`
  - xoá/disable OTP bằng cách set `otp_code = null`
  - locker về `empty`

Admin hiện tại:

- Xem trạng thái tủ/order.
- Xác nhận thanh toán bằng `markPaid`, chỉ đánh dấu đã thanh toán, không tự hoàn tất đơn.
- Dùng **Master Key** để force reset tủ về `empty` và hoàn tất order đang mở nếu cần.

Role hiện tại:

- User mới mặc định là `customer`.
- `shipper` hoặc `admin` mới tạo được đơn gửi hàng.
- `customer` chủ yếu dùng tra cứu/nhận hàng.
