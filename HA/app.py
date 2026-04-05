from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector

app = Flask(__name__)
CORS(app)


def get_db_connection():
    conn = mysql.connector.connect(
        host="localhost",
        user="root",
        password="nhap_mat_khau_cua_ban_vao_day",
        database="shop_caulong"
    )
    return conn


# ==========================================
# 1. API ĐĂNG NHẬP
# ==========================================
@app.route('/api/dang-nhap', methods=['POST'])
def dang_nhap():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM NguoiDung WHERE TenDangNhap = %s AND MatKhau = %s", (username, password))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user:
        return jsonify({"success": True, "message": "Đăng nhập thành công!", "user_id": user['MaND']})
    else:
        return jsonify({"success": False, "message": "Sai tài khoản hoặc mật khẩu!"})


# ==========================================
# 2. API TẠO TÀI KHOẢN (ĐĂNG KÝ)
# ==========================================
@app.route('/api/dang-ky', methods=['POST'])
def dang_ky():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    fullname = data.get('fullname')

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Cố gắng lưu tài khoản mới vào database
        cursor.execute("INSERT INTO NguoiDung (TenDangNhap, MatKhau, HoTen) VALUES (%s, %s, %s)",
                       (username, password, fullname))
        conn.commit()  # Bắt buộc phải có commit() để lưu thay đổi vào CSDL
        return jsonify({"success": True, "message": "Tạo tài khoản thành công!"})
    except mysql.connector.IntegrityError:
        # Lỗi IntegrityError xảy ra khi tên đăng nhập bị trùng (do ta đã cài UNIQUE trong SQL)
        return jsonify({"success": False, "message": "Tên đăng nhập này đã có người sử dụng!"})
    finally:
        cursor.close()
        conn.close()


# ==========================================
# 3. API LẤY THÔNG TIN (CHO TRANG CHỦ & TRANG CÁ NHÂN)
# ==========================================
@app.route('/api/thong-tin-user', methods=['POST'])
def lay_thong_tin_nguoi_dung():
    data = request.get_json()
    username = data.get('username')

    if not username:
        return jsonify({"isLoggedIn": False})

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    # Lấy thêm HoTen và NgayTaoTaiKhoan
    cursor.execute("SELECT MaND, TenDangNhap, HoTen, SoDu, NgayTaoTaiKhoan FROM NguoiDung WHERE TenDangNhap = %s",
                   (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user:
        return jsonify({
            "isLoggedIn": True,
            "id": user['MaND'],
            "username": user['TenDangNhap'],
            "fullname": user['HoTen'],
            "balance": float(user['SoDu']),
            # Chuyển ngày giờ thành chuỗi dễ đọc
            "created_at": user['NgayTaoTaiKhoan'].strftime("%d/%m/%Y") if user['NgayTaoTaiKhoan'] else "Không rõ"
        })
    else:
        return jsonify({"isLoggedIn": False})


if __name__ == '__main__':
    app.run(debug=True, port=5000)