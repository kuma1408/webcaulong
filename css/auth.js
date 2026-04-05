 function kiemTraDangNhap() {
        const userInfoDiv = document.getElementById("userInfo");

        // Lấy tên tài khoản đã lưu lúc đăng nhập thành công
        const tkDaLuu = localStorage.getItem('username');

        // Nếu chưa đăng nhập (không có tên trong bộ nhớ)
        if (!tkDaLuu) {
            userInfoDiv.innerHTML = `
                <p style="text-align: center; margin-bottom: 10px; color: #666;">Bạn chưa đăng nhập</p>
                <a href="dangnhap.html" style="display: block; text-align: center; background: linear-gradient(to right, #FF6600, #FFCC00); color: white; padding: 8px 10px; text-decoration: none; border-radius: 5px; font-weight: bold;">Đăng nhập ngay</a>
            `;
            return; // Dừng lại, không chạy xuống dưới nữa
        }

        // Nếu đã đăng nhập, gọi lên Python để lấy thông tin thật
        // Nếu đã đăng nhập, gọi lên Python để lấy thông tin thật
        fetch('https://mei-meiotic-isabelle.ngrok-free.dev/api/thong-tin-user', { // <-- Đã thêm phần đuôi API
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' // <-- Đã thêm thẻ vượt rào (BẮT BUỘC)
            },
            body: JSON.stringify({ username: tkDaLuu }) // Gửi tên tk sang Python
        })
        .then(response => response.json())
        .then(data => {
            if (data.isLoggedIn) {
                // In dữ liệu thật ra màn hình
                userInfoDiv.innerHTML = `
    <p><strong>Tài khoản:</strong> ${data.username}</p>
    <p><strong>Số dư:</strong> <span style="color:red; font-weight:bold;">${data.balance.toLocaleString('vi-VN')} VND</span></p>
    <hr style="border: 0.5px solid #ccc; margin: 10px 0;">
    <center>
        <a href="canhan.html" style="color: #4CAF50; text-decoration: none; font-size: 14px; font-weight: bold; display: block; margin-bottom: 8px;">Vào Trang Cá Nhân</a>
        <a href="#" onclick="dangXuat()" style="color: red; text-decoration: none; font-size: 14px; font-weight: bold;">Đăng xuất</a>
    </center>
`;
            }
        })
        .catch(error => console.error('Lỗi khi lấy dữ liệu:', error));
    }

    // Chức năng Đăng xuất
    function dangXuat() {
        // Xóa sạch bộ nhớ tạm
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
        // Tải lại trang web
        window.location.reload();
    }

    // Tự động chạy hàm khi web tải xong
    document.addEventListener("DOMContentLoaded", kiemTraDangNhap);