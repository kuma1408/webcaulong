/* =============================================================
   MOTION PLUS — hiệu ứng bổ sung cho cửa hàng (không dùng cho admin)
   1. Tiêu đề hero bay lên từng chữ        6. Shimmer khi ảnh sản phẩm đang tải
   2. Đèn rọi theo con trỏ trong hero      7. Tia lửa / lông cầu khi bấm nút chính
   3. Quả cầu lông bay vòng cung qua hero  8. Placeholder ô tìm kiếm tự gõ gợi ý
   4. Gạch chân tiêu đề khi cuộn tới       9. Số lượng giỏ hàng nảy khi thay đổi
   5. Viền phát sáng theo con trỏ trên thẻ
   Nội dung luôn hiển thị kể cả khi script lỗi; mọi hiệu ứng tôn trọng
   prefers-reduced-motion.
   ============================================================= */
(() => {
    'use strict';
    if (window.__motionPlusReady) return;
    window.__motionPlusReady = true;
    if (document.body?.classList.contains('admin-body') || /(?:^|\/)admin\.html$/.test(location.pathname)) return;

    const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = () => reduceQuery.matches;
    const root = document.documentElement;

    /* ---------- 1. Tách chữ tiêu đề hero ---------- */
    function splitHeroTitle() {
        const title = document.querySelector('.hero h1, .hero-title, .page-hero h1');
        if (!title || title.dataset.mpSplit || reduced()) return;
        title.dataset.mpSplit = 'true';
        title.classList.add('mp-split');
        let index = 0;
        const walk = (node) => {
            [...node.childNodes].forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    const parts = child.textContent.split(/(\s+)/);
                    const fragment = document.createDocumentFragment();
                    parts.forEach((part) => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { fragment.appendChild(document.createTextNode(part)); return; }
                        const span = document.createElement('span');
                        span.className = 'mp-word';
                        span.style.setProperty('--mp-i', String(index++));
                        span.textContent = part;
                        fragment.appendChild(span);
                    });
                    child.replaceWith(fragment);
                } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
                    // Chữ gradient (background-clip:text) được animate nguyên khối để không mất màu.
                    if (child.matches('em, .gradient-text-animated, [class*="gradient"]')) {
                        child.classList.add('mp-word');
                        child.style.setProperty('--mp-i', String(index++));
                    } else {
                        walk(child);
                    }
                }
            });
        };
        walk(title);
    }

    /* ---------- 2. Đèn rọi theo con trỏ ---------- */
    function heroSpotlight() {
        const hero = document.querySelector('.hero');
        if (!hero || !finePointer.matches) return;
        hero.classList.add('mp-spot');
        let frame = 0; let x = 0; let y = 0;
        hero.addEventListener('pointermove', (event) => {
            const rect = hero.getBoundingClientRect();
            x = event.clientX - rect.left; y = event.clientY - rect.top;
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                hero.style.setProperty('--mp-x', `${x}px`);
                hero.style.setProperty('--mp-y', `${y}px`);
            });
        }, { passive: true });
        hero.addEventListener('pointerenter', () => hero.style.setProperty('--mp-spot-o', '1'));
        hero.addEventListener('pointerleave', () => hero.style.setProperty('--mp-spot-o', '0'));
    }

    /* ---------- 3. Quả cầu lông bay vòng cung ---------- */
    const SHUTTLE_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="mpCork" x1="0" x2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5a1f"/></linearGradient></defs><path d="M20 3 8 24h24z" fill="#fff" opacity=".95"/><path d="M14 13h12M11.5 18.5h17" stroke="#d9dee7" stroke-width="1.2"/><path d="M20 3v21M14 13l-3 11M26 13l3 11" stroke="#c7ced9" stroke-width=".9"/><rect x="11" y="23" width="18" height="4" rx="1.5" fill="#ff7a3d"/><path d="M11 27h18a9 9 0 0 1-18 0z" fill="url(#mpCork)"/></svg>`;
    function shuttleFlight() {
        const hero = document.querySelector('.hero');
        if (!hero || reduced() || !('offsetPath' in document.body.style)) return;
        const stage = document.createElement('div');
        stage.className = 'mp-shuttle-stage';
        stage.setAttribute('aria-hidden', 'true');
        stage.innerHTML = `<svg class="mp-trail" preserveAspectRatio="none"><defs><linearGradient id="mpTrailGradient" x1="0" x2="1"><stop offset="0" stop-color="#ff5a1f" stop-opacity="0"/><stop offset=".6" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient></defs><path/></svg><div class="mp-shuttle">${SHUTTLE_SVG}</div>`;
        hero.appendChild(stage);
        const trail = stage.querySelector('.mp-trail path');
        const shuttle = stage.querySelector('.mp-shuttle');
        let timer = 0; let visible = true;
        const fly = () => {
            if (!visible || document.hidden || reduced()) return schedule();
            const w = hero.clientWidth; const h = hero.clientHeight;
            if (w < 360) return;
            const fromLeft = Math.random() > 0.35;
            const sx = fromLeft ? -40 : w + 40; const ex = fromLeft ? w + 40 : -40;
            const sy = h * (0.55 + Math.random() * 0.3); const ey = h * (0.35 + Math.random() * 0.35);
            const peak = h * (0.02 + Math.random() * 0.12);
            const d = `M ${sx} ${sy} Q ${w / 2} ${peak - h * 0.25} ${ex} ${ey}`;
            trail.setAttribute('d', d);
            stage.querySelector('.mp-trail').setAttribute('viewBox', `0 0 ${w} ${h}`);
            shuttle.style.setProperty('--mp-path', `path("${d}")`);
            stage.classList.remove('is-flying');
            void stage.offsetWidth;
            stage.classList.add('is-flying');
            schedule();
        };
        const schedule = () => { clearTimeout(timer); timer = setTimeout(fly, 7000 + Math.random() * 6000); };
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(hero);
        }
        setTimeout(fly, 1600);
        shuttle.addEventListener('animationend', () => stage.classList.remove('is-flying'));
        hero.querySelectorAll('.button--accent').forEach((button) => button.addEventListener('pointerenter', () => {
            if (!stage.classList.contains('is-flying')) fly();
        }));
    }

    /* ---------- 4. Gạch chân tiêu đề + đánh dấu vùng đã cuộn tới ---------- */
    function inViewMarkers() {
        const headings = document.querySelectorAll('.section-heading h2, .guide__content h2, .page-title, .section-title');
        // Chỉ thêm gạch chân cho tiêu đề chưa dùng ::after (tránh ghi đè trang trí có sẵn).
        headings.forEach((heading) => { if (getComputedStyle(heading, '::after').content === 'none') heading.classList.add('mp-heading'); });
        const targets = [...headings, ...document.querySelectorAll('.section, .service-strip, .playstyle-card, [data-reveal]')];
        if (!('IntersectionObserver' in window)) { targets.forEach(t => t.classList.add('is-inview', 'mp-inview')); return; }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add(entry.target.classList.contains('mp-heading') ? 'is-inview' : 'mp-inview');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
        targets.forEach((target) => observer.observe(target));
    }

    /* ---------- 5. Viền phát sáng theo con trỏ ---------- */
    const GLOW_SELECTOR = '.product-card, .product-card-upgraded, .category-card, .playstyle-card, .news-card, .blog-card, .wish-card, .service-strip article';
    function glowCards() {
        if (!finePointer.matches) return;
        document.addEventListener('pointermove', (event) => {
            const card = event.target.closest?.(GLOW_SELECTOR);
            if (!card) return;
            if (!card.classList.contains('mp-glow')) {
                card.classList.add('mp-glow');
                const ring = document.createElement('span');
                ring.className = 'mp-glow-ring';
                ring.setAttribute('aria-hidden', 'true');
                card.appendChild(ring);
            }
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mp-gx', `${event.clientX - rect.left}px`);
            card.style.setProperty('--mp-gy', `${event.clientY - rect.top}px`);
        }, { passive: true });
    }

    /* ---------- 6. Shimmer ảnh đang tải ---------- */
    const MEDIA_SELECTOR = '.product-card__media, .img-container, .wish-media, .news-card__media';
    function markLoading(scope) {
        scope.querySelectorAll?.(`${MEDIA_SELECTOR}`).forEach((media) => {
            const img = media.querySelector('img');
            if (!img || img.complete || media.dataset.mpImg) return;
            media.dataset.mpImg = '1';
            media.classList.add('mp-img-loading');
            const done = () => media.classList.remove('mp-img-loading');
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
        });
    }

    /* ---------- 7. Tia lửa khi bấm nút chính ---------- */
    const SPARK_SELECTOR = '.button--accent, .btn-primary, .add-to-cart, .btn-add-cart, [data-add-cart], .hero__feature, button[type="submit"]';
    const COLORS = ['#ff5a1f', '#ff8a45', '#ffd166', '#ffffff', '#2fd47a'];
    function sparks() {
        document.addEventListener('pointerdown', (event) => {
            if (reduced() || event.button !== 0) return;
            const target = event.target.closest?.(SPARK_SELECTOR);
            if (!target || target.disabled) return;
            const count = 10;
            for (let i = 0; i < count; i += 1) {
                const spark = document.createElement('span');
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
                const distance = 28 + Math.random() * 30;
                spark.className = i % 3 === 0 ? 'mp-spark mp-spark--feather' : 'mp-spark';
                spark.style.left = `${event.clientX}px`;
                spark.style.top = `${event.clientY}px`;
                spark.style.setProperty('--mp-dx', `${Math.cos(angle) * distance}px`);
                spark.style.setProperty('--mp-dy', `${Math.sin(angle) * distance}px`);
                spark.style.setProperty('--mp-r', `${(angle * 180) / Math.PI + 90}deg`);
                spark.style.setProperty('--mp-c', COLORS[i % COLORS.length]);
                document.body.appendChild(spark);
                spark.addEventListener('animationend', () => spark.remove(), { once: true });
                setTimeout(() => spark.remove(), 1000);
            }
        }, { passive: true });
    }

    /* ---------- 8. Placeholder ô tìm kiếm tự gõ ---------- */
    const SEARCH_HINTS = ['Tìm vợt Yonex Astrox…', 'Giày Lining bám sân…', 'Vợt cho người mới chơi…', 'Cước BG65 căng 10kg…', 'Balo Kawasaki 2 ngăn…'];
    function typingPlaceholder() {
        const input = document.querySelector('#mainSearch, .site-search input[type="search"]');
        if (!input || reduced()) return;
        const original = input.getAttribute('placeholder') || '';
        input.classList.add('mp-typing');
        let hint = 0; let char = 0; let deleting = false; let timer = 0;
        const paused = () => document.activeElement === input || input.value || document.hidden;
        const tick = () => {
            if (paused()) { input.setAttribute('placeholder', original); timer = setTimeout(tick, 1200); return; }
            const text = SEARCH_HINTS[hint];
            char += deleting ? -1 : 1;
            input.setAttribute('placeholder', `${text.slice(0, char)}${char % 2 ? '|' : ' '}`);
            let delay = deleting ? 35 : 75;
            if (!deleting && char >= text.length) { deleting = true; delay = 1700; }
            else if (deleting && char <= 0) { deleting = false; hint = (hint + 1) % SEARCH_HINTS.length; delay = 380; }
            timer = setTimeout(tick, delay);
        };
        timer = setTimeout(tick, 2200);
        input.addEventListener('focus', () => { clearTimeout(timer); input.setAttribute('placeholder', original); timer = setTimeout(tick, 1200); });
    }

    /* ---------- 9. Số lượng giỏ hàng nảy khi thay đổi ---------- */
    function cartBump() {
        const watch = (badge) => {
            if (badge.dataset.mpWatch) return;
            badge.dataset.mpWatch = '1';
            let last = badge.textContent;
            new MutationObserver(() => {
                if (badge.textContent === last) return;
                last = badge.textContent;
                if (reduced()) return;
                badge.classList.remove('mp-bump'); void badge.offsetWidth; badge.classList.add('mp-bump');
            }).observe(badge, { childList: true, characterData: true, subtree: true });
        };
        const scan = () => document.querySelectorAll('.bs-cart-count, #cartCount, .cart-link__count, .cart-count').forEach(watch);
        scan();
        return scan;
    }

    function start() {
        root.classList.add('mp-ready');
        splitHeroTitle();
        heroSpotlight();
        shuttleFlight();
        inViewMarkers();
        glowCards();
        markLoading(document);
        sparks();
        typingPlaceholder();
        const rescanCart = cartBump();
        let frame = 0;
        new MutationObserver(() => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                markLoading(document);
                rescanCart();
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
