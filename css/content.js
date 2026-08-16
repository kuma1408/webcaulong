(function () {
    'use strict';
    const base = window.API_BASE || (['localhost','127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:5000' : location.origin);
    const type = document.body.dataset.contentType;
    const escapeText = (value) => String(value || '');

    function injectStyles() {
        const style=document.createElement('style');style.textContent=`
        .db-content-grid{width:min(calc(100% - 28px),1200px);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:34px auto 60px}.db-content-card{overflow:hidden;border:1px solid #f1cbbd;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(96,30,15,.08)}.db-content-card img{width:100%;height:210px;padding:0;object-fit:cover}.db-content-card__body{padding:18px}.db-content-card h2{margin:0 0 9px;color:#351812;font-size:18px}.db-content-card p{color:#765c54;line-height:1.6}.db-content-card a{color:inherit;text-decoration:none}.db-content-card__meta{color:#e43a1d!important;font-size:12px;font-weight:800}.db-guide-list{width:min(calc(100% - 28px),900px);display:grid;gap:18px;margin:35px auto 60px}.db-guide-list article{padding:25px;border:1px solid #f1cbbd;border-radius:18px;background:#fff}.db-guide-list h2{color:#ba2d18}.db-article{width:min(calc(100% - 28px),900px);margin:35px auto 70px;padding:clamp(24px,5vw,58px);border:1px solid #f1cbbd;border-radius:24px;background:#fff;box-shadow:0 18px 50px rgba(96,30,15,.1)}.db-article h1{color:#351812}.db-article__summary{color:#ad351e;font-size:18px;font-weight:700}.db-article__content{white-space:pre-line;line-height:1.85}.db-content-empty{grid-column:1/-1;padding:45px;text-align:center;color:#765c54}@media(max-width:850px){.db-content-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:580px){.db-content-grid{grid-template-columns:1fr}}
        `;document.head.appendChild(style);
    }
    const date = (value) => value ? new Date(String(value).replace(' ','T')).toLocaleDateString('vi-VN') : '';
    async function list() {
        const target = type === 'TIN_TUC' ? document.querySelector('.card-container') : document.querySelector('main');
        if (!target) return;
        target.className = type === 'TIN_TUC' ? 'db-content-grid' : 'db-guide-list';
        target.innerHTML='<p class="db-content-empty">Đang tải nội dung…</p>';
        try {
            const response=await fetch(`${base}/api/noi-dung?loai=${encodeURIComponent(type)}`);const data=await response.json();target.replaceChildren();
            (data.items||[]).forEach((item)=>{const article=document.createElement('article');article.className='db-content-card';const link=document.createElement('a');link.href=`baiviet.html?id=${item.MaBV}`;
                if(item.HinhAnh){const image=document.createElement('img');image.src=item.HinhAnh;image.alt='';image.loading='lazy';link.appendChild(image);}const body=document.createElement('div');body.className='db-content-card__body';const meta=document.createElement('p');meta.className='db-content-card__meta';meta.textContent=type==='TIN_TUC'?date(item.NgayDang):'Hướng dẫn';const title=document.createElement('h2');title.textContent=escapeText(item.TieuDe);const summary=document.createElement('p');summary.textContent=escapeText(item.TomTat);body.append(meta,title,summary);link.appendChild(body);article.appendChild(link);target.appendChild(article);});
            if(!target.childElementCount)target.innerHTML='<p class="db-content-empty">Chưa có nội dung được xuất bản.</p>';
        } catch(_){target.innerHTML='<p class="db-content-empty">Chưa thể tải nội dung.</p>';}
    }
    async function detail() {
        const target=document.getElementById('dbArticle');if(!target)return;const id=new URLSearchParams(location.search).get('id');
        try{const response=await fetch(`${base}/api/noi-dung/${encodeURIComponent(id||'0')}`);const data=await response.json();if(!response.ok)throw new Error();const item=data.item;document.title=`${item.TieuDe} | Badminton Store`;target.replaceChildren();const meta=document.createElement('p');meta.className='db-content-card__meta';meta.textContent=`${item.Loai==='TIN_TUC'?'Tin tức':'Hướng dẫn'} · ${date(item.NgayDang)}`;const title=document.createElement('h1');title.textContent=item.TieuDe;const summary=document.createElement('p');summary.className='db-article__summary';summary.textContent=item.TomTat||'';if(item.HinhAnh){const image=document.createElement('img');image.src=item.HinhAnh;image.alt='';image.style='width:100%;max-height:480px;object-fit:cover;border-radius:16px;margin:18px 0';target.append(meta,title,summary,image);}else target.append(meta,title,summary);const content=document.createElement('div');content.className='db-article__content';content.textContent=item.NoiDung;target.appendChild(content);if(item.NguonURL){const source=document.createElement('p');const link=document.createElement('a');link.href=item.NguonURL;link.target='_blank';link.rel='noopener';link.textContent='Xem nguồn tham khảo';source.appendChild(link);target.appendChild(source);}}catch(_){target.innerHTML='<p>Không tìm thấy nội dung.</p>';}
    }
    injectStyles();if(type)list();else detail();
})();
