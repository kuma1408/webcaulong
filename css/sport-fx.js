/* ==========================================================================
   BADMINTON STORE — SPORT FX & ANIMATION SUITE
   Đồng bộ toàn diện với dự án mẫu F:\web_ban_khoa_hoc:
   1. Two-Tier Scroll Reveal Observer Engine (Tự động kích hoạt lại khi cuộn lên/xuống)
   2. Number Count-up Engine với cơ chế Re-trigger khi cuộn
   3. Progress Bar Player với dải Shimmer động
   4. Top Scroll Progress Bar trên đỉnh trang
   5. Nút Lên đầu trang (Floating Back-to-Top) với chuyển động mượt mà
   6. Click Ripple Ink trên toàn bộ nút và thẻ
   7. 3D Card Tilt & Specular Glare phản chiếu ánh sáng
   ========================================================================== */
(function () {
    'use strict';

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    const RESET_MARGIN = '600px 0px 600px 0px';

    /* ---------- 1. COUNT-UP ENGINE VỚI RE-TRIGGER KHI CUỘN ---------- */
    function animateCountUp(element, targetValue, duration = 1200) {
        if (!element) return;
        const numericTarget = Number(targetValue) || 0;
        const decimalPlaces = String(targetValue).includes('.')
            ? Math.min(2, String(targetValue).split('.')[1].length)
            : 0;
        if (reducedMotion?.matches) {
            element.textContent = numericTarget.toLocaleString('vi-VN');
            return;
        }
        let startTime = null;
        const startValue = 0;
        const token = (parseInt(element.dataset.countToken || '0', 10) + 1);
        element.dataset.countToken = String(token);

        function step(timestamp) {
            if (element.dataset.countToken !== String(token)) return;
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = Number((startValue + (numericTarget - startValue) * easeProgress).toFixed(decimalPlaces));
            element.textContent = current.toLocaleString('vi-VN');
            if (progress < 1.0) {
                requestAnimationFrame(step);
            } else {
                element.textContent = numericTarget.toLocaleString('vi-VN');
            }
        }
        requestAnimationFrame(step);
    }
    window.animateCountUp = animateCountUp;

    function setupDeclarativeCounters() {
        const counters = [...document.querySelectorAll('[data-count]')];
        if (!counters.length) return;

        function runCount(el) {
            if (!el.dataset.targetNum) {
                el.dataset.targetNum = el.dataset.count || el.textContent.replace(/[^\d]/g, '');
            }
            const end = parseInt(el.dataset.targetNum, 10);
            if (!end || end > 1000000000) return;
            const suffix = el.dataset.countSuffix || '';
            const prefix = el.dataset.countPrefix || '';
            const duration = Number(el.dataset.countDuration) || 1200;

            const start = performance.now();
            const token = (parseInt(el.dataset.countToken || '0', 10) + 1);
            el.dataset.countToken = String(token);

            (function step(now) {
                if (el.dataset.countToken !== String(token)) return;
                const p = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = prefix + Math.round(end * eased).toLocaleString('vi-VN') + suffix;
                if (p < 1) requestAnimationFrame(step);
            })(start);
        }

        if (reducedMotion?.matches || typeof IntersectionObserver !== 'function') {
            counters.forEach(runCount);
            return;
        }

        // Vào khung nhìn: đếm lên
        const co = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) runCount(e.target);
            });
        }, { threshold: 0.25 });

        // Ra xa khung nhìn (vượt RESET_MARGIN): reset để cuộn lại thì số chạy lại
        const coReset = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) {
                    e.target.dataset.countToken = String(parseInt(e.target.dataset.countToken || '0', 10) + 1);
                    const suffix = e.target.dataset.countSuffix || '';
                    const prefix = e.target.dataset.countPrefix || '';
                    e.target.textContent = prefix + '0' + suffix;
                }
            });
        }, { rootMargin: RESET_MARGIN });

        counters.forEach((el) => {
            co.observe(el);
            coReset.observe(el);
        });
    }

    /* ---------- 2. REVEAL ON SCROLL ENGINE (2-TIER HYSTERESIS) ---------- */
    let enterObserver = null;
    let exitObserver = null;
    const revealTimers = new WeakMap();

    function playReveal(node) {
        if (node.classList.contains('revealed')) return;
        clearTimeout(revealTimers.get(node));
        const delay = parseInt(node.dataset.revealDelay || '0', 10);
        if (!delay) {
            node.classList.add('revealed');
            return;
        }
        revealTimers.set(node, setTimeout(() => {
            node.classList.add('revealed');
        }, delay));
    }

    function resetReveal(node) {
        clearTimeout(revealTimers.get(node));
        node.classList.remove('revealed');
    }

    function onEnter(entries) {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const node = entry.target;
            node.style.setProperty('--reveal-dir', entry.boundingClientRect.top > 0 ? '1' : '-1');
            playReveal(node);
        });
    }

    function onExit(entries) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) return;
            if (!entry.target.hasAttribute('data-reveal-once')) {
                resetReveal(entry.target);
            }
        });
    }

    function getObservers() {
        if (!enterObserver && typeof IntersectionObserver === 'function') {
            enterObserver = new IntersectionObserver(onEnter, {
                threshold: 0.05,
                rootMargin: '0px 0px 60px 0px',
            });
            exitObserver = new IntersectionObserver(onExit, {
                threshold: 0,
                rootMargin: RESET_MARGIN,
            });
        }
    }

    function observeReveal(el) {
        if (!el || el._revealObserved) return;
        el._revealObserved = true;
        if (reducedMotion?.matches || typeof IntersectionObserver !== 'function') {
            el.classList.add('revealed');
            return;
        }
        getObservers();
        if (enterObserver && exitObserver) {
            enterObserver.observe(el);
            exitObserver.observe(el);
        }
    }

    function setupAutoReveal() {
        // Tự động gán hiệu ứng trượt vào cho thẻ sản phẩm, thẻ thống kê, khối nội dung
        const targets = [
            '.product-card',
            '.product-card-upgraded',
            '.category-card',
            '.playstyle-card',
            '.stat-card',
            '.admin-card',
            '.conversion-funnel-card',
            '.funnel-step',
            '.feature-item',
            '.brand-chip',
            '.review-item',
            '.section-head'
        ].join(',');

        document.querySelectorAll(targets).forEach((card, i) => {
            if (!card.hasAttribute('data-reveal')) {
                card.setAttribute('data-reveal', 'up');
                card.dataset.revealDelay = String(Math.min(i % 4, 3) * 50);
            }
            observeReveal(card);
        });

        // Bảng dữ liệu: các dòng đầu trượt vào so le nhẹ nhàng
        document.querySelectorAll('.data-table tbody, .admin-table-card tbody').forEach((tbody) => {
            [...tbody.rows].slice(0, 12).forEach((tr, i) => {
                if (!tr.hasAttribute('data-reveal')) {
                    tr.setAttribute('data-reveal', 'left');
                    tr.dataset.revealDelay = String(i * 35);
                }
                observeReveal(tr);
            });
        });
    }

    /* ---------- 3. PROGRESS BAR WIDTH ON SCROLL ---------- */
    function setupBarWidths() {
        const bars = [...document.querySelectorAll('[data-bar-width], .funnel-bar-fill')];
        if (!bars.length) return;

        bars.forEach((bar) => {
            const target = Math.max(0, Math.min(parseFloat(bar.dataset.barWidth || bar.style.width) || 0, 100));
            if (reducedMotion?.matches || typeof IntersectionObserver !== 'function') {
                bar.style.width = target + '%';
                return;
            }
            bar.style.width = '0%';
            new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) bar.style.width = target + '%';
                });
            }, { threshold: 0.25 }).observe(bar);

            new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) bar.style.width = '0%';
                });
            }, { rootMargin: RESET_MARGIN }).observe(bar);
        });
    }

    /* ---------- 4. TOP SCROLL PROGRESS BAR ---------- */
    function setupScrollProgress() {
        let bar = document.querySelector('.scroll-progress');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'scroll-progress';
            document.body.appendChild(bar);
        }

        let ticking = false;
        function updateProgress() {
            const h = document.documentElement.scrollHeight - window.innerHeight;
            const y = window.scrollY;
            const pct = h > 0 ? Math.min(100, (y / h) * 100) : 0;
            bar.style.width = pct + '%';
            ticking = false;
        }

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(updateProgress);
                ticking = true;
            }
        }, { passive: true });
        updateProgress();
    }

    /* ---------- 5. FLOATING BACK TO TOP BUTTON ---------- */
    function setupFloatingBackToTop() {
        let toTop = document.querySelector('.sport-back-to-top, .to-top');
        if (!toTop) {
            toTop = document.createElement('button');
            toTop.className = 'sport-back-to-top';
            toTop.type = 'button';
            toTop.setAttribute('aria-label', 'Cuộn lên đầu trang');
            toTop.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
            document.body.appendChild(toTop);
        }

        toTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        window.addEventListener('scroll', () => {
            toTop.classList.toggle('show', window.scrollY > 350);
        }, { passive: true });
    }

    /* ---------- 6. CLICK RIPPLE INK FEEDBACK ---------- */
    function setupRippleFeedback() {
        document.addEventListener('click', (e) => {
            const el = e.target.closest('button, .button, .btn-health-action, .primary-nav > a, .admin-nav button, .tab-nav a, .soft-button');
            if (!el || el.disabled) return;

            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const ink = document.createElement('span');
            ink.className = 'ripple-ink';
            ink.style.width = ink.style.height = size + 'px';
            ink.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ink.style.top = (e.clientY - rect.top - size / 2) + 'px';

            el.style.position = el.style.position || 'relative';
            el.style.overflow = 'hidden';
            el.appendChild(ink);
            setTimeout(() => { ink.remove(); }, 650);
        });
    }

    /* ---------- 7. 3D CARD TILT & SPECULAR GLARE ---------- */
    function attachTilt(card) {
        if (!card || card.dataset.sportTiltReady === 'true' || !canHover?.matches || reducedMotion?.matches) return;
        card.dataset.sportTiltReady = 'true';
        card.classList.add('sport-tilt');

        let glare = card.querySelector('.sport-card-glare');
        if (!glare) {
            glare = document.createElement('span');
            glare.className = 'sport-card-glare';
            glare.setAttribute('aria-hidden', 'true');
            card.appendChild(glare);
        }

        let frame = 0;
        let pointerX = 0;
        let pointerY = 0;

        const render = () => {
            frame = 0;
            const rect = card.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const mouseX = pointerX - rect.left;
            const mouseY = pointerY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = -((mouseY - centerY) / rect.height) * 12;
            const rotateY = ((mouseX - centerX) / rect.width) * 12;
            card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
            glare.style.setProperty('--glare-x', `${mouseX}px`);
            glare.style.setProperty('--glare-y', `${mouseY}px`);
        };

        card.addEventListener('pointerenter', (event) => {
            if (event.pointerType === 'touch') return;
            pointerX = event.clientX;
            pointerY = event.clientY;
            card.classList.add('is-tilting');
            render();
        });
        card.addEventListener('pointermove', (event) => {
            if (event.pointerType === 'touch') return;
            pointerX = event.clientX;
            pointerY = event.clientY;
            if (!frame) frame = requestAnimationFrame(render);
        });
        card.addEventListener('pointerleave', () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            card.classList.remove('is-tilting');
            card.style.transform = '';
        });
    }

    const tiltSelector = [
        '[data-tilt]',
        '.product-card',
        '.product-card-upgraded',
        '.category-card',
        '.playstyle-card',
        '.stat-card',
        '.feature-item'
    ].join(',');

    function upgradeCards(root = document) {
        if (root.matches?.(tiltSelector)) attachTilt(root);
        root.querySelectorAll?.(tiltSelector).forEach(attachTilt);
    }

    /* ---------- BOOTSTRAP ---------- */
    function boot() {
        upgradeCards();
        setupDeclarativeCounters();
        setupAutoReveal();
        setupBarWidths();
        setupScrollProgress();
        setupFloatingBackToTop();
        setupRippleFeedback();

        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver((records) => {
                records.forEach((record) => record.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        upgradeCards(node);
                        setupAutoReveal();
                    }
                }));
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();


    // --- STUNNING FX INJECTION ---
    function setupPremiumAnimations() {
        // 1. Magnetic Buttons
        const buttons = document.querySelectorAll('.button--primary, .btn-primary, .add-to-cart');
        buttons.forEach(btn => {
            btn.addEventListener('mousemove', e => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px) scale(1.05)`;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
            });
        });

        // 2. Parallax Banner
        const banner = document.querySelector('.hero-banner, .home-banner');
        if (banner) {
            window.addEventListener('scroll', () => {
                banner.style.backgroundPosition = `center ${window.scrollY * 0.4}px`;
            }, { passive: true });
        }

        // 3. Staggered Fade Up
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('mz-visible');
                } else {
                    entry.target.classList.remove('mz-visible');
                }
            });
        }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('.product-card, .section-title, .brand-item, .news-card, .review-item, .admin-card, .stat-card, .admin-kpi-card').forEach((el, index) => {
            if (!el.classList.contains('mz-hidden')) {
                el.classList.add('mz-hidden');
                // Calculate position in row roughly
                const delay = (index % 5) * 0.08;
                el.style.transitionDelay = `${delay}s, ${delay}s`;
                observer.observe(el);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPremiumAnimations);
    } else {
        setupPremiumAnimations();
    }
