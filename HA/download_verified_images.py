"""Tải các ảnh đã đối chiếu thủ công bằng tên/model từ kết quả tìm kiếm ảnh."""

import os
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from HA.app import PROJECT_ROOT, get_db_connection


IMAGES = {
    152: "https://racketlounge.in/cdn/shop/files/Victor_Auraspeed_100X_4ec1b092-a780-40fe-8198-9244c89714df.png?v=1745067377&width=533",
    154: "https://ducansport.vn/images/products/2025/10/29/vot-cau-long-lining-axforce-100-gen-210-200.jpg",
    155: "https://cdn.hvshop.vn/wp-content/uploads/2025/10/victor-drivex-12-zsw.webp",
    157: "https://www.badmintonwarehouse.com/cdn/shop/files/all_ax100zva_452-1_512x769.webp?v=1758942857",
    160: "https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-vd-moonlight-17-hong-trang-noi-dia-trung_1716340781.webp",
    162: "https://product.hstatic.net/1000341630/product/1_df3db0a7cfad460cad99d5d052a0488a_master.jpg",
    166: "https://stand-in.jp/cdn/shop/files/xa-shb88d3w_3.jpg?v=1766380382&width=1445",
    167: "https://ueeshop.ly200-cdn.com/u_file/UPBE/UPBE048/2506/01/products/intshbcfz3l-1png-103525f7f0.webp",
    168: "https://www.sakurasport.com/2866-home_default_big/s82-td-bo-badminton-shoes-men-victor.jpg",
    169: "https://cdn.shopvnb.com/uploads/gallery/giay-cau-long-lining-aytu025-3-chinh-hang_1735614800.webp",
    170: "https://shopvnb.com/uploads/gallery/giay-cau-long-yonex-velo-200-white-deep-ocean-chinh-hang_1742243101.webp",
    175: "https://www.yonex.com/media/catalog/product/m/a/mavis10.png?canvas=600%3A819&fit=bounds&height=819&quality=80&width=600",
    153: "https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-victor-thruster-ryuga-cls-c-chinh-hang_1744251266.webp",
    171: "https://www.onlineshop-beyondbadminton.com.au/cdn/shop/files/PowerCushionAerusZMenSHBAZ2MEXWhiteBlue_Left.webp?v=1770611090",
    172: "https://www.quynhonsport.com/wp-content/uploads/2020/11/84A902C8-5D47-4F80-998E-24315C65B296-scaled.jpeg",
    176: "https://images.elipsport.vn/sources/2019/6/4/ong-cau-long-victor-lark-5-1559636923.png",
}


def suffix(content_type, url):
    kind=content_type.lower()
    if "webp" in kind:return ".webp"
    if "png" in kind:return ".png"
    if "jpeg" in kind or "jpg" in kind:return ".jpg"
    ext=os.path.splitext(urlparse(url).path)[1].lower()
    return ext if ext in {".jpg",".jpeg",".png",".webp"} else ".jpg"


def main():
    output=os.path.join(PROJECT_ROOT,"HA","imported-products");os.makedirs(output,exist_ok=True)
    conn=get_db_connection();cursor=conn.cursor();done=0
    try:
        for product_id,url in IMAGES.items():
            try:
                cursor.execute("SELECT HinhAnh FROM SanPham WHERE MaSP=%s", (product_id,))
                current = cursor.fetchone()
                if current and current[0] and current[0] != "HA/cc-removebg-preview.png":
                    continue
                request=Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"image/avif,image/webp,image/*,*/*","Referer":f"{urlparse(url).scheme}://{urlparse(url).netloc}/"})
                with urlopen(request,timeout=30) as response:
                    payload=response.read();content_type=response.headers.get("Content-Type","")
                if len(payload)<4000 or "image" not in content_type.lower():raise ValueError("không nhận được dữ liệu ảnh")
                ext=suffix(content_type,url);name=f"product-{product_id}{ext}";path=os.path.join(output,name)
                with open(path,"wb") as handle:handle.write(payload)
                relative=f"HA/imported-products/{name}"
                cursor.execute("UPDATE SanPham SET HinhAnh=%s,AnhChiTiet=%s WHERE MaSP=%s",(relative,f'["{relative}"]',product_id))
                done+=1;print(f"Đã tải ảnh sản phẩm #{product_id}")
            except Exception as exc:print(f"Không tải được #{product_id}: {exc}")
        conn.commit();print(f"Hoàn tất {done}/{len(IMAGES)} ảnh đã xác minh.")
    except Exception:
        conn.rollback();raise
    finally:cursor.close();conn.close()


if __name__=="__main__":main()
