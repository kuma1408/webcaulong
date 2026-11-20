/* =============================================================
   NOVA — chuyển động bổ sung cho cửa hàng (không dùng cho admin)
   Bổ sung, không thay thế ui-motion.js / mega-animations.js:
   - nền aurora, header kính mờ khi cuộn, thanh chỉ báo menu trượt
   - viền gradient xoay + ánh quét cho thẻ, ánh quét cho nút chính
   - ảnh sản phẩm hiện dần (blur-up)
   - con trỏ vòng sáng (chỉ chuột), màn mở đầu một lần mỗi phiên
   Nội dung luôn hiển thị nếu script lỗi; tôn trọng prefers-reduced-motion.
   ============================================================= */
(() => {
    'use strict';
    if (window.__novaReady) return;
    window.__novaReady = true;
    if (/(?:^|\/)admin\.html$/.test(location.pathname)) return;

    const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = () => reduceQuery.matches;
    const root = document.documentElement;
    const store = {
        get(key, area = localStorage) { try { return area.getItem(key); } catch (_) { return null; } },
        set(key, value, area = localStorage) { try { area.setItem(key, value); } catch (_) { /* bỏ qua */ } }
    };

    const CARD_SELECTOR = '.product-card, .product-card-upgraded, .category-card, .playstyle-card, .news-card, .guide-news-card, .wish-card, .account-card, .contact-card, .tech-card, .san-pham-goi-y-item, .service-strip article, .pay-method-card';
    const BUTTON_SELECTOR = '.button--accent, .primary-button, .btn-filter-apply, .bs-search__button, .btn-add-cart, .btn-buy-now, .checkout-btn, .account-form button[type="submit"], .contact-form button[type="submit"], .hero .button';

    /* ---------- Màn mở đầu: một lần mỗi phiên, tối đa ~1,5 giây ---------- */
    function intro() {
        if (reduced() || store.get('nova_intro_seen', sessionStorage) || !document.body) return;
        store.set('nova_intro_seen', '1', sessionStorage);
        const layer = document.createElement('div');
        layer.className = 'nova-intro';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = '<div class="nova-intro__mark">B</div><div class="nova-intro__bar"></div>';
        document.body.appendChild(layer);
        const remove = () => layer.remove();
        layer.addEventListener('animationend', (event) => { if (event.animationName === 'nova-intro-out') remove(); });
        setTimeout(remove, 1800);
    }

    /* ---------- Nền aurora (tắt bằng localStorage nova_aurora = "off") ---------- */
    let aurora = null;
    function ambientEnabled() { return store.get('nova_aurora') !== 'off'; }
    function syncAurora() {
        const on = ambientEnabled() && !reduced();
        document.body.classList.toggle('nova-ambient', on);
        if (on && !aurora) {
            aurora = document.createElement('div');
            aurora.className = 'nova-aurora';
            aurora.setAttribute('aria-hidden', 'true');
            aurora.innerHTML = '<i></i><i></i><i></i>';
            document.body.prepend(aurora);
        }
        if (aurora) aurora.hidden = !on;
    }

    /* ---------- Header kính mờ khi cuộn ---------- */
    function headerGlass() {
        let ticking = false;
        let lastY = window.scrollY;
        const phone = matchMedia('(max-width: 820px)');
        // Đang mở menu tài khoản / thông báo / tìm kiếm thì luôn giữ header.
        const headerBusy = () => Boolean(document.querySelector('.bs-user[open], .bs-notification-widget [aria-expanded="true"], .header:has(.bs-header) :focus'));
        const update = () => {
            ticking = false;
            const y = window.scrollY;
            const scrolled = y > 12;
            root.classList.toggle('nova-scrolled', scrolled);
            document.querySelectorAll('.site-header').forEach((header) => header.classList.toggle('nova-scrolled', scrolled));
            // Điện thoại: ẩn header khi cuộn xuống, hiện lại khi cuộn lên.
            const delta = y - lastY;
            if (!phone.matches || y < 80 || headerBusy()) root.classList.remove('nova-header-hidden');
            else if (Math.abs(delta) > 8) root.classList.toggle('nova-header-hidden', delta > 0 && y > 220);
            if (Math.abs(delta) > 8 || y < 80) lastY = y;
        };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        document.addEventListener('focusin', (event) => { if (event.target.closest?.('.header')) root.classList.remove('nova-header-hidden'); });
        update();
    }

    /* ---------- Thanh mua hàng dính đáy trên trang chi tiết (điện thoại) ---------- */
    function buybar() {
        const buy = document.querySelector('.btn-buy-now');
        const cart = document.querySelector('.btn-add-cart');
        if (!buy || document.querySelector('.nova-buybar') || !('IntersectionObserver' in window)) return;
        const bar = document.createElement('div');
        bar.className = 'nova-buybar';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Mua nhanh');
        bar.innerHTML = '<div class="nova-buybar__price"><small>Giá bán</small><b></b></div>'
            + (cart ? '<button type="button" class="nova-buybar__cart" aria-label="Thêm vào giỏ hàng">🛒</button>' : '<span></span>')
            + '<button type="button" class="nova-buybar__buy">Mua ngay</button>';
        document.body.appendChild(bar);
        document.body.classList.add('nova-has-buybar');
        const price = bar.querySelector('b');
        const priceSource = () => document.querySelector('#productPrice');
        const syncPrice = () => { price.textContent = (priceSource()?.textContent || '').trim(); };
        syncPrice();
        if (priceSource()) new MutationObserver(syncPrice).observe(priceSource(), { childList: true, characterData: true, subtree: true });
        // Đưa nút gốc vào tầm nhìn rồi bấm, để khách thấy lựa chọn cấu hình / thông báo lỗi.
        const press = (target) => {
            target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
            setTimeout(() => target.click(), reduced() ? 0 : 380);
        };
        bar.querySelector('.nova-buybar__buy').addEventListener('click', () => press(buy));
        bar.querySelector('.nova-buybar__cart')?.addEventListener('click', () => press(cart));
        let buyVisible = true;
        const sync = () => bar.classList.toggle('is-shown', !buyVisible && window.scrollY > 360 && Boolean(price.textContent));
        new IntersectionObserver((entries) => { buyVisible = entries[0].isIntersecting; sync(); }, { rootMargin: '0px 0px -80px 0px' }).observe(buy);
        window.addEventListener('scroll', sync, { passive: true });
    }

    /* ---------- Thanh chỉ báo menu trượt ---------- */
    const inkHosts = new WeakSet();
    function navInk() {
        if (reduced()) return;
        document.querySelectorAll('.bs-nav__links, .primary-nav > ul, .primary-nav').forEach((host) => {
            if (inkHosts.has(host) || host.closest('.nova-ink-host')) return;
            const links = [...host.children].map((child) => child.matches('a') ? child : child.querySelector(':scope > a, :scope > button')).filter(Boolean);
            if (links.length < 2) return;
            inkHosts.add(host);
            host.classList.add('nova-ink-host');
            const ink = document.createElement('span');
            ink.className = 'nova-nav-ink';
            ink.setAttribute('aria-hidden', 'true');
            host.appendChild(ink);
            const activeLink = () => links.find((link) => link.matches('.active, .is-active, [aria-current="page"]') || link.parentElement?.matches('.active, .is-active'));
            const moveTo = (link) => {
                if (!link || !link.offsetWidth) { ink.style.opacity = '0'; return; }
                // Không ép position cho host: đo theo khối định vị thực tế của thanh sáng.
                const hostRect = (ink.offsetParent || document.body).getBoundingClientRect();
                const rect = link.getBoundingClientRect();
                const inset = Math.min(14, rect.width * .18);
                ink.style.width = `${rect.width - inset * 2}px`;
                ink.style.transform = `translateX(${rect.left - hostRect.left + inset}px)`;
                ink.style.top = `${rect.bottom - hostRect.top - 5}px`;
                ink.style.bottom = 'auto';
                ink.style.opacity = '1';
            };
            const reset = () => moveTo(activeLink());
            links.forEach((link) => {
                link.addEventListener('mouseenter', () => moveTo(link));
                link.addEventListener('focus', () => moveTo(link));
            });
            host.addEventListener('mouseleave', reset);
            window.addEventListener('resize', reset, { passive: true });
            setTimeout(reset, 120);
        });
    }

    /* ---------- Thẻ, nút, ảnh ---------- */
    function ensurePositioned(node) {
        if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
    }
    function decorate(scope) {
        if (!scope.querySelectorAll) return;
        const all = (selector) => [...(scope.matches?.(selector) ? [scope] : []), ...scope.querySelectorAll(selector)];
        all(CARD_SELECTOR).forEach((card) => {
            if (card.classList.contains('nova-card')) return;
            card.classList.add('nova-card');
            ensurePositioned(card);
            const fx = document.createElement('span');
            fx.className = 'nova-card__fx';
            fx.setAttribute('aria-hidden', 'true');
            card.appendChild(fx);
        });
        all(BUTTON_SELECTOR).forEach((button) => {
            if (button.classList.contains('nova-btn')) return;
            button.classList.add('nova-btn');
            ensurePositioned(button);
            const sheen = document.createElement('span');
            sheen.className = 'nova-btn__sheen';
            sheen.setAttribute('aria-hidden', 'true');
            button.appendChild(sheen);
        });
        if (!reduced()) {
            all('.product-card img, .product-card-upgraded img, .category-card img, .news-card img, .guide-news-card img, .wish-card img, .san-pham-goi-y-item img').forEach((img) => {
                if (img.dataset.novaImg || img.complete) return;
                img.dataset.novaImg = '1';
                img.classList.add('nova-img-wait');
                const done = () => { img.classList.remove('nova-img-wait'); img.classList.add('nova-img-done'); };
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                setTimeout(done, 4000);
            });
        }
    }
    function watchDom() {
        const queue = new Set();
        let frame = 0;
        new MutationObserver((records) => {
            records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) queue.add(node); }));
            if (queue.size && !frame) frame = requestAnimationFrame(() => {
                frame = 0;
                queue.forEach((node) => { if (node.isConnected && !node.matches('.nova-card__fx, .nova-btn__sheen, .nova-cursor')) decorate(node); });
                queue.clear();
                navInk();
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    /* ---------- Con trỏ vòng sáng ---------- */
    function cursor() {
        if (!fine.matches || reduced()) return;
        const ring = document.createElement('div');
        ring.className = 'nova-cursor';
        ring.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ring);
        let x = -100, y = -100, cx = x, cy = y, frame = 0;
        const loop = () => {
            cx += (x - cx) * .22; cy += (y - cy) * .22;
            ring.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
            frame = Math.abs(x - cx) + Math.abs(y - cy) > .3 ? requestAnimationFrame(loop) : 0;
        };
        document.addEventListener('pointermove', (event) => {
            if (event.pointerType !== 'mouse') return;
            x = event.clientX; y = event.clientY;
            ring.classList.add('is-visible');
            const target = event.target;
            const isText = target.closest?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]');
            ring.classList.toggle('is-text', Boolean(isText));
            ring.classList.toggle('is-hover', !isText && Boolean(target.closest?.('a, button, [role="button"], label, select, summary, .nova-card')));
            if (!frame) frame = requestAnimationFrame(loop);
        }, { passive: true });
        document.addEventListener('pointerdown', () => ring.classList.add('is-down'), { passive: true });
        document.addEventListener('pointerup', () => ring.classList.remove('is-down'), { passive: true });
        document.documentElement.addEventListener('mouseleave', () => ring.classList.remove('is-visible'));
    }

    /* ---------- Thanh điều hướng đáy cho điện thoại ---------- */
    const TABS = [
        { href: 'trangchu.html', label: 'Trang chủ', match: /(?:^|\/)(?:trangchu|index)\.html$|\/$/, icon: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>' },
        { href: 'sanpham.html', label: 'Sản phẩm', match: /(?:sanpham|chitiet|sale%20off|sale off|c%E1%BA%A7u%20l%C3%B4ng|cầu lông)/i, icon: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>' },
        { href: 'yeuthich.html', label: 'Yêu thích', match: /yeuthich\.html$/, icon: '<path d="M12 20s-7.5-4.6-9.2-9.4C1.7 7.4 3.8 4 7.3 4c2 0 3.4 1.1 4.7 2.8C13.3 5.1 14.7 4 16.7 4c3.5 0 5.6 3.4 4.5 6.6C19.5 15.4 12 20 12 20Z"/>' },
        { href: 'giohang.html', label: 'Giỏ hàng', match: /giohang\.html$/, icon: '<path d="M3 4h2.2l2.3 11.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.3" r="1.2"/><circle cx="17.5" cy="20.3" r="1.2"/>', badge: true },
        { href: 'canhan.html', label: 'Tài khoản', match: /canhan\.html$/, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4.4-6 8-6s6.6 2 8 6"/>' }
    ];
    function tabbar() {
        const path = decodeURIComponent(location.pathname);
        // Trang đăng nhập/đăng ký và trang chuyển hướng không cần thanh đáy.
        if (/(?:dangnhap|dangky|quenmatkhau|datlaimatkhau|index)\.html$/.test(path) || document.querySelector('.nova-tabbar')) return;
        const bar = document.createElement('nav');
        bar.className = 'nova-tabbar';
        bar.setAttribute('aria-label', 'Điều hướng nhanh');
        bar.innerHTML = TABS.map((tab) => {
            const active = tab.match.test(path) || tab.match.test(location.pathname);
            return `<a href="${tab.href}"${active ? ' class="is-active" aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${tab.icon}</svg><span>${tab.label}</span>${tab.badge ? '<b class="nova-tabbar__badge" hidden></b>' : ''}</a>`;
        }).join('');
        document.body.appendChild(bar);
        document.body.classList.add('nova-has-tabbar');

        // Đồng bộ số lượng giỏ hàng từ huy hiệu trên header.
        const badge = bar.querySelector('.nova-tabbar__badge');
        const syncCount = () => {
            const source = document.querySelector('.bs-cart-count, .cart-count, [data-cart-count]');
            const value = (source?.textContent || '').trim();
            const visible = value && value !== '0' && !(source?.hidden) && getComputedStyle(source).display !== 'none';
            if (visible && badge.textContent !== value && !reduced()) {
                badge.classList.remove('is-bump'); void badge.offsetWidth; badge.classList.add('is-bump');
            }
            badge.textContent = visible ? value : '';
            badge.hidden = !visible;
        };
        syncCount();
        let countFrame = 0;
        new MutationObserver((records) => {
            if (countFrame || records.every((record) => bar.contains(record.target))) return;
            countFrame = requestAnimationFrame(() => { countFrame = 0; syncCount(); });
        }).observe(document.body, { subtree: true, childList: true, characterData: true });

        // Ẩn khi cuộn xuống / khi bàn phím mở, hiện lại khi cuộn lên.
        let lastY = window.scrollY, ticking = false;
        const typing = () => document.activeElement?.matches?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]');
        const update = () => {
            ticking = false;
            const y = window.scrollY, delta = y - lastY;
            if (Math.abs(delta) > 6) {
                bar.classList.toggle('is-hidden', delta > 0 && y > 160);
                lastY = y;
            }
            if (y < 40) bar.classList.remove('is-hidden');
        };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        document.addEventListener('focusin', () => { if (typing()) bar.classList.add('is-hidden'); });
        document.addEventListener('focusout', () => setTimeout(() => { if (!typing()) bar.classList.remove('is-hidden'); }, 120));
    }

    function start() {
        root.classList.add('nova-ready');
        tabbar();
        buybar();
        intro();
        syncAurora();
        headerGlass();
        decorate(document);
        navInk();
        cursor();
        watchDom();
        window.addEventListener('storage', (event) => { if (event.key === 'nova_aurora') syncAurora(); });
        reduceQuery.addEventListener?.('change', syncAurora);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
