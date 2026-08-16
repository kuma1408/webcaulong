"""Nhập danh mục tham khảo công khai ngày 09-08-2026, không sao chép mô tả/ảnh nguồn."""

from HA.app import get_db_connection


RACKETS_FB = "https://fbshop.vn/vot-cau-long/"
FB_HOME = "https://fbshop.vn/"
HV_HOME = "https://hvshop.vn/"
SHUTTLES_FB = "https://fbshop.vn/qua-cau-long/page/2/"
VNB_99J = "https://shopvnb.com/vot-cau-long-victor-auraspeed-99-j-2026-chinh-hang.html"

PRODUCTS = [
    (1,"Vợt Cầu Lông Victor Auraspeed 100X B 2026","Victor",3700000,4350000,HV_HOME),
    (1,"Vợt Cầu Lông Victor Thruster Ryuga CLS I","Victor",1350000,1450000,HV_HOME),
    (1,"Vợt Cầu Lông Lining Axforce 100 Gen 2","Lining",5900000,6780000,FB_HOME),
    (1,"Vợt Cầu Lông Victor DriveX 12 ZSW","Victor",4300000,None,FB_HOME),
    (1,"Vợt Cầu Lông Yonex Astrox 100 Tour VA","Yonex",4065050,4279000,FB_HOME),
    (1,"Vợt Cầu Lông Yonex Astrox 100ZZ","Yonex",5599000,6718800,FB_HOME),
    (1,"Vợt Cầu Lông Lining Axforce 90 New Loh Kean Yew 2025","Lining",4420000,6120000,FB_HOME),
    (1,"Vợt Cầu Lông Victor Auraspeed 99 J 2026","Victor",4190000,5028000,VNB_99J),
    (1,"Vợt Cầu Lông VS Moonlight 17","VS",599000,720000,RACKETS_FB),
    (1,"Vợt Cầu Lông Lining Axforce Cannon Rabbit 2026","Lining",950000,981818,RACKETS_FB),
    (1,"Vợt Cầu Lông Kamito Arrow Speed 10","Kamito",790000,990000,RACKETS_FB),
    (1,"Vợt Cầu Lông Vicleo Aero 111","Vicleo",239000,None,RACKETS_FB),
    (1,"Vợt Cầu Lông Vicleo Aero 555","Vicleo",239000,None,RACKETS_FB),
    (1,"Vợt Cầu Lông Vicleo Aero 333","Vicleo",239000,None,RACKETS_FB),
    (2,"Giày Cầu Lông Yonex 88 Dial 3 Wide 2025","Yonex",3059000,None,FB_HOME),
    (2,"Giày Cầu Lông Yonex Power Cushion Comfort Z3 New 2025","Yonex",2850000,None,FB_HOME),
    (2,"Giày Cầu Lông Victor S82 TD BO","Victor",1200000,1520000,FB_HOME),
    (2,"Giày Cầu Lông Lining AYTU025-3","Lining",1200000,None,FB_HOME),
    (2,"Giày Cầu Lông Yonex Velo 200","Yonex",649000,778000,FB_HOME),
    (2,"Giày Cầu Lông Yonex Aerus Z Men","Yonex",2680000,2849000,FB_HOME),
    (8,"Ống Cầu Lông Hải Yến S70","Hải Yến",300000,342000,SHUTTLES_FB),
    (8,"Ống Cầu Lông Ba Sao Cộng","Ba Sao",235000,None,SHUTTLES_FB),
    (8,"Ống Cầu Lông VNBC 3in1","VNBC",240000,None,SHUTTLES_FB),
    (8,"Ống Cầu Lông Nhựa Yonex Mavis 10","Yonex",300000,None,SHUTTLES_FB),
    (8,"Quả Cầu Lông Victor Lark 5","Victor",290000,None,SHUTTLES_FB),
]


def source_name(url):
    if "shopvnb" in url: return "ShopVNB"
    if "hvshop" in url: return "HVShop"
    return "FBShop"


def main():
    conn=get_db_connection();cursor=conn.cursor(dictionary=True);created=0
    try:
        for category,name,brand,price,original,url in PRODUCTS:
            cursor.execute("SELECT MaSP FROM SanPham WHERE TenSP=%s LIMIT 1",(name,))
            if cursor.fetchone(): continue
            description=(f"Sản phẩm {brand} được bổ sung từ danh mục tham khảo công khai. "
                         "Giá cần được quản trị viên kiểm tra lại với nguồn trước khi xác nhận bán.")
            cursor.execute("""INSERT INTO SanPham
                (MaDM,TenSP,MoTa,GiaBan,GiaGoc,TonKho,HinhAnh,ThuongHieu,AnhChiTiet,TrangThai,NguonURL,NguonTen)
                VALUES (%s,%s,%s,%s,%s,10,%s,%s,'[]',1,%s,%s)""",
                (category,name,description,price,original,"HA/cc-removebg-preview.png",brand,url,source_name(url)))
            created+=1
        conn.commit();print(f"Đã bổ sung {created} sản phẩm; bỏ qua {len(PRODUCTS)-created} sản phẩm trùng tên.")
    except Exception:
        conn.rollback();raise
    finally:
        cursor.close();conn.close()


if __name__=="__main__": main()
