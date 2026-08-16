"""Tải bộ ảnh chi tiết đã đối chiếu model để dùng trong Swiper."""

import json
import os
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from HA.app import PROJECT_ROOT, get_db_connection


GALLERIES = {
154:["https://ducansport.vn/images/products/2025/10/29/vot-cau-long-lining-axforce-100-gen-210-200.jpg","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-lining-axforce-100-gen-2-chinh-hang_1766950089.webp","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-lining-axforce-100-gen-2-chinh-hang-1_1766950096.webp","https://static.fbshop.vn/wp-content/uploads/2025/11/Vot-Cau-Long-Lining-Axforce-100-Gen-2.png"],
159:["https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-victor-auraspeed-99-j-2026-chinh-hang_1775528187.webp","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-victor-auraspeed-99-j-2026-chinh-hang-2_1775528194.webp","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-victor-auraspeed-99-j-2026-chinh-hang-5_1775528237.webp"],
161:["https://www.directsportseshop.co.uk/images/extralarge/Li-_AYPT311-6.jpg","https://static-01.daraz.com.bd/p/ea6cf8cdc4576c84a0d9b1338823f4f6.jpg"],
168:["https://www.sakurasport.com/2866-home_default_big/s82-td-bo-badminton-shoes-men-victor.jpg","https://www.sakurasport.com/2867-home_default_big/s82-td-bo-badminton-shoes-men-victor.jpg","https://www.sportsraquettes.fr/30555-large_default/chaussures-badminton-victor-s82td-bo-homme.jpg","https://dkjulgymkya8y.cloudfront.net/victor/zh_tw/product-95240_0_20220927153521.webp"],
169:["https://cdn.shopvnb.com/uploads/gallery/giay-cau-long-lining-aytu025-3-chinh-hang_1735614800.webp","https://product.hstatic.net/200000099191/product/tai_xuong__1__704825e1cf4f4b86b25eaa5b499a03d0.jpg","https://down-my.img.susercontent.com/file/cn-11134208-7ras8-m0fenfbkov5z07"],
172:["https://cabasports.vn/wp-content/uploads/2024/05/ong-cau-long-hai-yen-s70-480x480.jpg","https://shopvnb.com/uploads/san_pham/ong-cau-long-hai-yen-s70-1.webp","https://product.hstatic.net/1000392202/product/22_696af994a1b840f385f3c0349def9bc2.jpg","https://phanphoivanphongphamkimloi.com/wp-content/uploads/2025/03/s-70.jpg"],
174:["https://thegioicaulong.vn/wp-content/uploads/2025/10/z7166634668917_b7e356e1720b6e0bb9151feb1ed300f4.jpg","https://thegioicaulong.vn/wp-content/uploads/2025/10/z7166634688314_f31b217e38186f498983b1f7d682aa70.jpg","https://thegioicaulong.vn/wp-content/uploads/2025/10/Vot-pickleball-Selkirk-VANGUARD-Pro-Invikta-37.png"],
152:["https://racketlounge.in/cdn/shop/files/Victor_Auraspeed_100X_4ec1b092-a780-40fe-8198-9244c89714df.png?v=1745067377&width=533","https://cdn.shopify.com/s/files/1/1238/5608/products/VictorAuraspeed100XBadmintonRacket_1496x1995.jpg?v=1652116273","https://jzonebadminton.com/cdn/shop/files/ARS-100X2.jpg?v=1707516097&width=1445"],
153:["https://www.racket-company.com/media/catalog/product/cache/f91328b9f3ebc8bdd8f86512219be676/t/h/thruster-ryuga-cls-jpg-100229-10044_Product.jpg","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-victor-thruster-ryuga-cls-c-chinh-hang_1744251266.webp","https://www.tiarasporting.com/cdn/shop/files/victor-thruster-ryuga-cls-redblack-badminton-racquet-strung-free-grip-1546818.jpg?v=1753342975"],
155:["https://cdn.hstatic.net/products/200000852613/product-142145_4_20250802132340_4dbb31bcc86e4cd6aa8c96df698f29a6.jpg","https://www.gemsports.com.au/cdn/shop/files/victor-drivex-12-zsw-zheng-si-wei-edition-4ug5-badminton-racquet-unstrung-free-grip-2025-new-2154787_2048x.png?v=1756541327","https://shopvnb.com/uploads/gallery/vot-cau-long-victor-drivex-12-zsw-chinh-hang_1761183554.webp"],
156:["https://shop.r10s.jp/haya-spo/cabinet/images8812/yy-ax100tva_1.jpg","https://thethao86store.vn/images/stories/virtuemart/product/481.png","https://www.houseofracket.in/cdn/shop/files/801A0155copy.jpg?v=1759920453","https://votcaulongshop.vn/wp-content/uploads/2025/09/vot-cau-long-yonex-astrox-100-tour-va-vot-cau-long-shop-1.jpg"],
157:["https://www.badmintonwarehouse.com/cdn/shop/files/all_ax100zva_452-1_512x769.webp?v=1758942857","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-yonex-astrox-100zz-va-grayish-beige-chinh-hang_1758152558.webp","https://yonexshop.jp/photo/BDRC/AX100ZVA/z-AX100ZVA_452-1.jpg","https://cdn.shopify.com/s/files/1/2183/6715/files/ALL_AX100ZVA_452-2.jpg?v=1759387689"],
158:["https://luongsport.com/wp-content/uploads/2025/01/vot-cau-long-lining-axforce-90-new-2025-1-768x1024.jpg","https://cdn.hvshop.vn/wp-content/uploads/2024/12/lining-axforce-90-new-2.webp","https://shopvnb.com/uploads/gallery/vot-cau-long-lining-axforce-90-new-loh-kean-yew-2024-chinh-hang_1745521125.jpg","https://www.dasxsport.vn/storage/linh/vot-cau-long-lining-axforce-90-new-loh-kean-yew-2024-chinh-hang-1-1745521133.jpg"],
160:["https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-vd-moonlight-17-hong-trang-noi-dia-trung_1716340781.webp","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-vd-moonlight-17-xanh-trang-noi-dia-trung_1716340482.webp","https://cdn.shopvnb.com/uploads/gallery/vot-cau-long-vd-moonlight-17-hong-trang-noi-dia-trung-1_1716340787.webp"],
162:["https://product.hstatic.net/1000341630/product/1_df3db0a7cfad460cad99d5d052a0488a_master.jpg","https://product.hstatic.net/1000341630/product/38_e07a14d95caa40dd96d8a98dca2b0ebd_master.jpg","https://halisport.com/wp-content/uploads/2022/03/vot-kamito-arrow-speed-10-mau-trang-kmbr20036.jpg","https://meta.vn/Data/image/2021/11/13/vot-cau-long-arrow-speed-10-2.jpg"],
166:["https://stand-in.jp/cdn/shop/files/xa-shb88d3w_3.jpg?v=1766380382&width=1445","https://badmintonmart.com.au/cdn/shop/files/all_shb88d3w-shb88d3wex_ibc.png?v=1727758142&width=3000","https://res.cloudinary.com/da4mrfwne/image/upload/v1719467748/2024/04/88d3w_WT.png"],
167:["https://ueeshop.ly200-cdn.com/u_file/UPBE/UPBE048/2506/01/products/intshbcfz3l-1png-103525f7f0.webp","https://badmintondirect.com/cdn/shop/files/all_shbcfz3-shbcfz3mex-239-1_1_2_1500x.webp?v=1746659949","https://hvshop.vn/wp-content/uploads/2024/10/yonex-shb-comfort-z3-women-2025-2.webp"],
170:["https://shopvnb.com/uploads/gallery/giay-cau-long-yonex-velo-200-white-deep-ocean-chinh-hang_1742243101.webp","https://cdn.shopvnb.com/uploads/gallery/giay-cau-long-yonex-velo-200-off-white-alpine-leaf-chinh-hang_1742242264.webp","https://contents.mediadecathlon.com/m21817642/k%247c0ab90761d8d426a4e7a9980b73d7b5/badminton-shoe-velo-200-indigo-marine-white-yonex-d0c604b6-1e66-413a-b0ac-8a90990a6b4d.html?f=1920x0&format=auto"],
171:["https://www.onlineshop-beyondbadminton.com.au/cdn/shop/files/PowerCushionAerusZMenSHBAZ2MEXWhiteBlue_Left.webp?v=1770611090","https://img.alpen-group.jp/Contents/ProductImages/0/2730920616-0001_7344_LL.jpg","https://www.sakurasport.com/4457-home_default_big/badminton-shoes-power-cushion-aerus-z2-whiteblue-men-yonex.jpg"],
175:["https://www.yonex.com/media/catalog/product/m/a/mavis10.png?canvas=600%3A819&fit=bounds&height=819&quality=80&width=600","https://contents.mediadecathlon.com/m16832340/k%24c206ac789b84f89cb172e25f1ad08b68/badminton-nylon-shuttlecock-mavis-10-3-in-1-white-yonex-28886914-3f28-4270-9e42-0caa38a65bc2.jpg","https://shop.sunriseclick.com/cdn/shop/files/15276_GO_1743587468399.jpg?v=1752483834"],
176:["https://images.elipsport.vn/sources/2019/6/4/ong-cau-long-victor-lark-5-1559636923.png","https://cdn.shopvnb.com/uploads/images/tin_tuc/cau-long-victor-lark-5-3.webp","https://www.static-src.com/wcsstore/Indraprastha/images/catalog/full/catalog-image/84/MTA-182010015/victor_shuttlecock_cock_badminton_victor_lark_5_full02_bzmhqcmk.jpg"],
}


def ext(content_type,url):
    kind=content_type.lower()
    if "webp" in kind:return ".webp"
    if "png" in kind:return ".png"
    if "jpeg" in kind:return ".jpg"
    suffix=os.path.splitext(urlparse(url).path)[1].lower()
    return suffix if suffix in {".jpg",".jpeg",".png",".webp"} else ".jpg"


def main():
    folder=os.path.join(PROJECT_ROOT,"HA","imported-products");os.makedirs(folder,exist_ok=True)
    conn=get_db_connection();cursor=conn.cursor(dictionary=True);downloaded=0
    try:
        for product_id,urls in GALLERIES.items():
            cursor.execute("SELECT HinhAnh FROM SanPham WHERE MaSP=%s",(product_id,));row=cursor.fetchone();gallery=[]
            if row and row.get("HinhAnh") and not row["HinhAnh"].endswith("cc-removebg-preview.png"):gallery.append(row["HinhAnh"])
            for index,url in enumerate(urls,1):
                try:
                    req=Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"image/avif,image/webp,image/*,*/*","Referer":f"{urlparse(url).scheme}://{urlparse(url).netloc}/"})
                    with urlopen(req,timeout=25) as response:data=response.read();content_type=response.headers.get("Content-Type","")
                    if len(data)<4000 or "image" not in content_type.lower():raise ValueError("dữ liệu không phải ảnh")
                    suffix=ext(content_type,url);filename=f"product-{product_id}-detail-{index}{suffix}";path=os.path.join(folder,filename)
                    with open(path,"wb") as handle:handle.write(data)
                    relative=f"HA/imported-products/{filename}"
                    if relative not in gallery:gallery.append(relative)
                    downloaded+=1
                except Exception as exc:print(f"Bỏ ảnh #{product_id}.{index}: {exc}")
            if gallery:
                current_image = (row or {}).get("HinhAnh") or ""
                if not current_image or current_image.endswith("cc-removebg-preview.png"):
                    cursor.execute(
                        "UPDATE SanPham SET HinhAnh=%s, AnhChiTiet=%s WHERE MaSP=%s",
                        (gallery[0], json.dumps(gallery, ensure_ascii=False), product_id),
                    )
                else:
                    cursor.execute(
                        "UPDATE SanPham SET AnhChiTiet=%s WHERE MaSP=%s",
                        (json.dumps(gallery, ensure_ascii=False), product_id),
                    )
                print(f"Swiper #{product_id}: {len(gallery)} ảnh")
        conn.commit();print(f"Đã tải thêm {downloaded} ảnh chi tiết.")
    except Exception:
        conn.rollback();raise
    finally:cursor.close();conn.close()


if __name__=="__main__":main()
