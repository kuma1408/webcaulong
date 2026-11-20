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
        const update = () => {
            ticking = false;
            const scrolled = window.scrollY > 12;
            root.classList.toggle('nova-scrolled', scrolled);
            document.querySelectorAll('.site-header').forEach((header) => header.classList.toggle('nova-scrolled', scrolled));
        };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        update();
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
                const hostRect = host.getBoundingClientRect();
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

    function start() {
        root.classList.add('nova-ready');
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
