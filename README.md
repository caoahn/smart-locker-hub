# Smart Locker Hub

## Cấu hình phần cứng

Frontend gửi lệnh mở tủ tới `IP_HARD_WARE`/`VITE_IP_HARD_WARE`.

Mặc định app gọi:

```env
HARDWARE_OPEN_PATH=/lockers/:boxId/open
```

Nếu id tủ trong database không trùng id relay/firmware, map lại bằng:

```env
HARDWARE_OPEN_PATH=/lockers/:hardwareBoxId/open
HARDWARE_BOX_ID_MAP=1:1,2:4
```

Nếu mỗi tủ nằm ở một IP/board khác nhau:

```env
HARDWARE_BASE_URLS=1:192.168.0.107,2:192.168.0.108
```

Nếu mỗi tủ dùng endpoint riêng, cấu hình:

```env
HARDWARE_OPEN_PATHS=1:/lockers/1/open,2:/relay/two/open
```

Lỗi `POST /lockers/2/open 404` nghĩa là thiết bị không có route đó. Khi tủ #1 mở được nhưng tủ #2 lỗi 404, hãy kiểm tra firmware đã khai báo endpoint cho tủ #2 chưa, tủ #2 có ở IP khác không, hoặc dùng `HARDWARE_BASE_URLS`/`HARDWARE_OPEN_PATHS`/`HARDWARE_BOX_ID_MAP` để map đúng endpoint thật của thiết bị.
