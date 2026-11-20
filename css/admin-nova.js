/* =============================================================
   ADMIN NOVA — chuyển động bổ sung cho trang quản trị
   (aurora nền, topbar kính mờ + đồng hồ, spotlight thẻ, số liệu nảy,
   tiêu đề chuyển mượt, ánh quét nút chính). Bổ sung admin-plus.js,
   không thay thế. Tôn trọng prefers-reduced-motion.
   ============================================================= */
(() => {
    'use strict';
    if (window.__adminNovaReady) return;
    window.__adminNovaReady = true;

    const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = () => reduceQuery.matches;
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const SPOT_SELECTOR = '.admin-kpi-card, .stat-card, .admin-card, .system-health-bar, .top-product-card, .funnel-step';
    const VALUE_SELECTOR = '.admin-kpi-card strong, .stat-card .value, .health-val, .step-count';

    /* ---------- Nền aurora ---------- */
    let aurora = null;
    function syncAurora() {
        const on = !reduced();
        document.body.classList.toggle('an-ambient', on);
        if (on && !aurora) {
            aurora = document.createElement('div');
            aurora.className = 'an-aurora';
            aurora.setAttribute('aria-hidden', 'true');
            aurora.innerHTML = '<i></i><i></i><i></i>';
            document.body.prepend(aurora);
        }
        if (aurora) aurora.hidden = !on;
    }

    /* ---------- Topbar: kính mờ khi cuộn, đường sáng, đồng hồ ---------- */
    function topbar() {
        const bar = $('.admin-topbar');
        if (!bar) return;
        if (!$('.an-topbar-line', bar)) {
            const line = document.createElement('span');
            line.className = 'an-topbar-line';
            line.setAttribute('aria-hidden', 'true');
            bar.appendChild(line);
        }
        let ticking = false;
        const update = () => { ticking = false; document.body.classList.toggle('an-scrolled', window.scrollY > 8); };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        update();

        const actions = $('.admin-topbar__actions', bar);
        if (!actions || $('.an-clock', actions)) return;
        const clock = document.createElement('span');
        clock.className = 'an-clock';
        clock.setAttribute('aria-hidden', 'true');
        actions.prepend(clock);
        const days = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const pad = (n) => String(n).padStart(2, '0');
        const tick = () => {
            const now = new Date();
            clock.innerHTML = `<span class="an-clock__date">${days[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}</span><span class="an-clock__sep"></span><b>${pad(now.getHours())}:${pad(now.getMinutes())}</b>`;
        };
        tick();
        setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000);
    }

    /* ---------- Spotlight theo con trỏ ---------- */
    function spotlight(scope = document) {
        if (!fine.matches || reduced()) return;
        $$(SPOT_SELECTOR, scope).forEach((card) => {
            if (card.classList.contains('an-spot-host')) return;
            card.classList.add('an-spot-host');
            if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
            const spot = document.createElement('span');
            spot.className = 'an-spot';
            spot.setAttribute('aria-hidden', 'true');
            card.appendChild(spot);
        });
    }
    function trackPointer() {
        if (!fine.matches) return;
        let source = null, x = 0, y = 0, frame = 0;
        const paint = () => {
            frame = 0;
            // Cập nhật mọi thẻ lồng nhau đang chứa con trỏ (thẻ cha lẫn thẻ con).
            for (let host = source?.closest?.('.an-spot-host'); host; host = host.parentElement?.closest('.an-spot-host')) {
                const spot = host.querySelector(':scope > .an-spot');
                if (!spot) continue;
                const rect = host.getBoundingClientRect();
                spot.style.setProperty('--an-x', `${x - rect.left}px`);
                spot.style.setProperty('--an-y', `${y - rect.top}px`);
            }
        };
        document.addEventListener('pointermove', (event) => {
            source = event.target; x = event.clientX; y = event.clientY;
            if (!frame) frame = requestAnimationFrame(paint);
        }, { passive: true });
    }

    /* ---------- Số liệu nảy khi đổi (chờ hiệu ứng đếm số dừng hẳn) ---------- */
    const settled = new WeakMap();
    const timers = new WeakMap();
    function bump(node) {
        if (reduced() || !node.isConnected || node.closest('[hidden]')) return;
        node.classList.remove('an-bump');
        void node.offsetWidth;
        node.classList.add('an-bump');
    }
    function watchValues() {
        $$(VALUE_SELECTOR).forEach((node) => settled.set(node, node.textContent.trim()));
        new MutationObserver((records) => {
            const touched = new Set();
            records.forEach((record) => {
                const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
                const node = element?.closest?.(VALUE_SELECTOR);
                if (node) touched.add(node);
            });
            touched.forEach((node) => {
                clearTimeout(timers.get(node));
                timers.set(node, setTimeout(() => {
                    const value = node.textContent.trim();
                    if (settled.get(node) === value) return;
                    settled.set(node, value);
                    bump(node);
                }, 180));
            });
        }).observe($('#adminShell') || document.body, { subtree: true, childList: true, characterData: true });
    }

    /* ---------- Tiêu đề trang chuyển mượt ---------- */
    function titleSwap() {
        const title = $('#adminPageTitle');
        if (!title) return;
        let last = title.textContent;
        new MutationObserver(() => {
            if (title.textContent === last || reduced()) { last = title.textContent; return; }
            last = title.textContent;
            title.classList.remove('an-title-in');
            void title.offsetWidth;
            title.classList.add('an-title-in');
        }).observe(title, { childList: true, characterData: true, subtree: true });
    }

    /* ---------- Ánh quét cho nút chính ---------- */
    function sheen(scope = document) {
        $$('.admin-primary', scope).forEach((button) => {
            if ($(':scope > .an-sheen', button)) return;
            const span = document.createElement('span');
            span.className = 'an-sheen';
            span.setAttribute('aria-hidden', 'true');
            button.appendChild(span);
        });
    }

    function watchDom() {
        const queue = new Set();
        let frame = 0;
        new MutationObserver((records) => {
            records.forEach((record) => record.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && !node.matches('.an-spot, .an-sheen, .an-clock, .an-clock *')) queue.add(node);
            }));
            if (queue.size && !frame) frame = requestAnimationFrame(() => {
                frame = 0;
                queue.forEach((node) => {
                    if (!node.isConnected) return;
                    spotlight(node.parentElement || node);
                    sheen(node.parentElement || node);
                });
                queue.clear();
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    function start() {
        if (!document.body.classList.contains('admin-body')) return;
        syncAurora();
        topbar();
        spotlight();
        trackPointer();
        sheen();
        watchValues();
        titleSwap();
        watchDom();
        reduceQuery.addEventListener?.('change', syncAurora);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
