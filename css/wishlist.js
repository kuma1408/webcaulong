(function(){
    'use strict';
    const Auth=window.BadmintonAuth;
    const grid=document.getElementById('wishlistGrid');
    const title=document.getElementById('wishlistTitle');
    const money=value=>`${Number(value||0).toLocaleString('vi-VN')} ₫`;

    function empty(message='Bạn chưa lưu sản phẩm nào.'){
        grid.replaceChildren();
        const state=document.createElement('p'); state.className='wishlist-state'; state.textContent=message+' ';
        const link=document.createElement('a'); link.href='sanpham.html'; link.textContent='Khám phá sản phẩm'; state.appendChild(link);
        grid.appendChild(state); title.textContent='0 sản phẩm đã lưu';
    }

    function card(product){
        const id=Number(product.MaSP); const article=document.createElement('article'); article.className='wish-card'; article.dataset.id=id;
        const href=`chitiet.html?id=${encodeURIComponent(id)}`; const media=document.createElement('a'); media.className='wish-media'; media.href=href; media.setAttribute('aria-label',`Xem chi tiết ${product.TenSP||'sản phẩm'}`);
        const image=document.createElement('img'); image.src=Auth.safeUrl(product.HinhAnh,'HA/cc-removebg-preview.png'); image.alt=String(product.TenSP||'Sản phẩm cầu lông'); image.loading='lazy'; image.decoding='async'; media.appendChild(image);
        const body=document.createElement('div'); body.className='wish-body'; const brand=document.createElement('span'); brand.className='wish-brand'; brand.textContent=product.ThuongHieu||product.TenDM||'Chính hãng';
        const heading=document.createElement('h3'); const link=document.createElement('a'); link.href=href; link.textContent=product.TenSP||'Sản phẩm'; heading.appendChild(link);
        const price=document.createElement('div'); price.className='wish-price'; const current=document.createElement('strong'); current.textContent=money(product.GiaBan); price.appendChild(current);
        if(Number(product.GiaGoc)>Number(product.GiaBan)){const old=document.createElement('del');old.textContent=money(product.GiaGoc);price.appendChild(old)}
        const actions=document.createElement('div'); actions.className='wish-actions';
        const detail=document.createElement('a'); detail.className='wish-detail'; detail.href=href; detail.textContent='Xem chi tiết'; detail.setAttribute('aria-label',`Xem chi tiết ${product.TenSP||'sản phẩm'}`);
        const remove=document.createElement('button'); remove.type='button'; remove.className='wish-remove'; remove.textContent='Bỏ lưu'; remove.addEventListener('click',()=>removeItem(article,id));
        const cart=document.createElement('button'); cart.type='button'; cart.className='wish-cart'; cart.textContent='Thêm giỏ'; cart.addEventListener('click',()=>addCart(cart,id));
        actions.append(detail,remove,cart); body.append(brand,heading,price,actions); article.append(media,body); return article;
    }

    async function load(){
        grid.innerHTML='<p class="wishlist-state">Đang tải sản phẩm yêu thích…</p>';
        try{const data=await Auth.request('/api/yeu-thich');const products=Array.isArray(data.products)?data.products:[];if(!products.length){empty();return}grid.replaceChildren(...products.map(card));title.textContent=`${products.length} sản phẩm đã lưu`}
        catch(error){empty(error.message||'Không thể tải danh sách yêu thích.')}
    }
    async function removeItem(article,id){article.classList.add('is-removing');try{await Auth.request(`/api/yeu-thich/${id}`,{method:'DELETE'});article.remove();const count=grid.querySelectorAll('.wish-card').length;if(!count)empty();else title.textContent=`${count} sản phẩm đã lưu`;window.showToast?.('Đã bỏ sản phẩm khỏi danh sách.','success')}catch(error){article.classList.remove('is-removing');window.showToast?.(error.message||'Không thể bỏ sản phẩm.','error')}}
    async function addCart(button,id){button.disabled=true;try{await Auth.request('/api/gio-hang/them',{method:'POST',json:{ma_san_pham:id,so_luong:1}});window.showToast?.('Đã thêm sản phẩm vào giỏ hàng.','success');window.capNhatBadgeGioHang?.()}catch(error){window.showToast?.(error.message||'Không thể thêm vào giỏ.','error')}finally{button.disabled=false}}
    async function init(){const user=await Auth.me();if(!user){location.replace(`dangnhap.html?next=${encodeURIComponent('yeuthich.html')}`);return}document.getElementById('wishlistRefresh')?.addEventListener('click',load);await load()}
    document.addEventListener('DOMContentLoaded',init);
})();
