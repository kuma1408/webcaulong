/* ============================================================
   MEGA ANIMATIONS JS ENGINE - Badminton Store
   Kích hoạt toàn bộ:
   1. Fly-to-Cart Shuttlecock Arc Animation
   2. Confetti Celebration Cannon
   3. Live Social Proof Ticker (Thông báo mua hàng sống động)
   4. 3D Holographic Tilt & Specular Light Sheen
   5. Heart & Star Sparkle Burst khi yêu thích
   6. Two-Tier Scroll Reveal (AOS) & Staggered Cascades
   7. Smooth Number Count-Up Engine
   8. Magnetic Button Physics & Sweep Light
   9. Neon Scroll Progress Bar & Dynamic Parallax
   10. Ripple Ink Click Feedback
   ============================================================ */
(function () {
    'use strict';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Trên trang admin: tắt các hiệu ứng nặng (3D tilt, parallax) để tối ưu hiệu suất
    const isAdmin = document.body.classList.contains('admin-body') || document.querySelector('.admin-shell') !== null;

    /* ---- 1. AOS - SCROLL REVEAL ENGINE ---- */
    function initAOS() {
        if (reduced) {
            document.querySelectorAll('[data-aos]').forEach(el => el.classList.add('aos-animate'));
            return;
        }

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('aos-animate');
                } else {
                    if (entry.target.dataset.aosOnce !== 'true') {
                        entry.target.classList.remove('aos-animate');
                    }
                }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('[data-aos]').forEach((el, i) => {
            if (!el.style.transitionDelay) {
                const delay = el.dataset.aosDelay || (i % 6) * 75;
                el.style.transitionDelay = delay + 'ms';
            }
            obs.observe(el);
        });
    }

    /* ---- 2. AUTO-TAG ELEMENTS WITH DATA-AOS ---- */
    function tagForAOS() {
        const map = {
            '.product-card, .product-card-upgraded': 'fade-up',
            '.category-card': 'fade-up',
            '.playstyle-card': 'zoom-in',
            '.brand-chip': 'pop-in',
            '.brand-item': 'pop-in',
            '.review-item': 'fade-up',
            '.news-card': 'fade-up',
            '.blog-card': 'fade-up',
            '.feature-item': 'flip-up',
            '.admin-card': 'fade-up',
            '.stat-card': 'fade-up',
            '.admin-kpi-card': 'fade-up',
            '.conversion-funnel-card': 'zoom-in',
            '.funnel-step': 'fade-left',
            '.section-title': 'fade-up',
            '.section-head': 'fade-up',
            '.trust-guarantee-strip': 'fade-up',
            '.service-strip article': 'pop-in',
            '.cart-item, .cart-item-row': 'fade-left',
            '.wishlist-item': 'fade-left',
            '.admin-trend-card': 'fade-up',
            '.hero-float-badge': 'pop-in',
            '.guide': 'fade-up',
        };

        Object.entries(map).forEach(([selector, animation]) => {
            document.querySelectorAll(selector).forEach((el, i) => {
                if (!el.dataset.aos) {
                    el.dataset.aos = animation;
                    el.dataset.aosDelay = (i % 6) * 75;
                }
            });
        });
    }

    /* ---- 3. 3D HOLOGRAPHIC TILT & SPECULAR SHEEN ---- */
    function init3DTilt() {
        if (reduced) return;
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!canHover) return;

        const tiltTargets = '.product-card, .product-card-upgraded, .playstyle-card, .category-card, .service-strip article, .review-item, .brand-chip, .hero-float-badge';

        function attachTilt(el) {
            if (el._tiltReady) return;
            el._tiltReady = true;

            // Đảm bảo có lớp bóng gương phản chiếu (specular sheen)
            let shine = el.querySelector('.__tilt-shine');
            if (!shine) {
                shine = document.createElement('div');
                shine.className = '__tilt-shine';
                shine.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:3;transition:background 0.12s ease, opacity 0.25s ease;opacity:0;';
                el.style.position = el.style.position || 'relative';
                el.appendChild(shine);
            }

            el.addEventListener('mouseenter', () => {
                shine.style.opacity = '1';
            });

            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                const rx = y * -16;
                const ry = x * 16;
                el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translate3d(0,-6px,0) scale3d(1.025,1.025,1.025)`;
                el.style.transition = 'transform 0.08s linear';
                el.style.zIndex = '6';

                // Di chuyển điểm sáng phản chiếu theo chuột
                const pctX = ((x + 0.5) * 100).toFixed(1);
                const pctY = ((y + 0.5) * 100).toFixed(1);
                shine.style.background = `radial-gradient(circle at ${pctX}% ${pctY}%, rgba(255,255,255,0.22) 0%, rgba(255,85,32,0.08) 35%, transparent 70%)`;
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translate3d(0,0,0) scale3d(1,1,1)';
                el.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
                el.style.zIndex = '';
                shine.style.opacity = '0';
            });
        }

        document.querySelectorAll(tiltTargets).forEach(attachTilt);

        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(records => {
                records.forEach(r => r.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches(tiltTargets)) attachTilt(node);
                        if (node.querySelectorAll) node.querySelectorAll(tiltTargets).forEach(attachTilt);
                    }
                }));
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    /* ---- 4. FLY-TO-CART SHUTTLECOCK ANIMATION ---- */
    function initFlyToCart() {
        if (reduced) return;

        function getCartTarget() {
            return document.querySelector('.bs-cart-count') ||
                   document.querySelector('#giohang-count') ||
                   document.querySelector('.bs-icon-button svg, .cart-icon, a[href*="giohang"]');
        }

        function triggerFly(startX, startY) {
            const cartTarget = getCartTarget();
            if (!cartTarget) return;

            const cartRect = cartTarget.getBoundingClientRect();
            const endX = cartRect.left + cartRect.width / 2;
            const endY = cartRect.top + cartRect.height / 2;

            const shuttle = document.createElement('div');
            shuttle.className = 'fly-to-cart-shuttlecock';
            shuttle.textContent = '🏸';
            shuttle.style.left = startX + 'px';
            shuttle.style.top = startY + 'px';
            document.body.appendChild(shuttle);

            // Điểm uốn cong parabol (Control Point)
            const midX = (startX + endX) / 2 + (Math.random() * 60 - 30);
            const midY = Math.min(startY, endY) - 120;

            const duration = 850;
            const start = performance.now();

            function frame(now) {
                const elapsed = now - start;
                const p = Math.min(elapsed / duration, 1);
                const t = p;
                const inv = 1 - t;
                const curX = inv * inv * startX + 2 * inv * t * midX + t * t * endX;
                const curY = inv * inv * startY + 2 * inv * t * midY + t * t * endY;

                const scale = 1.3 - 0.7 * t;
                const rot = t * 720;
                shuttle.style.transform = `translate3d(${curX - startX}px, ${curY - startY}px, 0) scale(${scale}) rotate(${rot}deg)`;
                shuttle.style.opacity = String(1 - 0.3 * t);

                if (p < 1) {
                    requestAnimationFrame(frame);
                } else {
                    shuttle.remove();
                    triggerCartBounce();
                }
            }
            requestAnimationFrame(frame);
        }

        function triggerCartBounce() {
            const badge = document.querySelector('.bs-cart-count') || document.querySelector('#giohang-count');
            if (badge) {
                badge.classList.remove('cart-badge-bounce', 'is-bouncing');
                void badge.offsetWidth; // force reflow
                badge.classList.add('cart-badge-bounce', 'is-bouncing');
                setTimeout(() => {
                    badge.classList.remove('cart-badge-bounce', 'is-bouncing');
                }, 700);
            }
        }

        window.triggerFlyToCart = triggerFly;
        window.triggerCartBounce = triggerCartBounce;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.add-to-cart, .btn-add-cart, [data-add-cart], .btn-them-gio, [onclick*="themVaoGio"]');
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            triggerFly(rect.left + rect.width / 2, rect.top + rect.height / 2);
        });
    }

    /* ---- 5. CONFETTI CELEBRATION ENGINE ---- */
    function triggerConfetti(originX, originY) {
        if (reduced) return;
        const x = originX ?? window.innerWidth / 2;
        const y = originY ?? window.innerHeight * 0.38;

        const container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);

        const colors = ['#ff5520', '#ffb703', '#00f5a0', '#00f2fe', '#ff3b30', '#ffffff', '#e040fb'];
        const count = 55;

        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            const color = colors[Math.floor(Math.random() * colors.length)];
            const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
            const velocity = 180 + Math.random() * 320;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity + 280;
            const rot = (Math.random() * 1080 - 540) + 'deg';
            const w = 7 + Math.random() * 8;
            const h = 5 + Math.random() * 10;

            piece.style.cssText = `
                left: ${x}px;
                top: ${y}px;
                width: ${w}px;
                height: ${h}px;
                background: ${color};
                --tx: ${tx.toFixed(1)}px;
                --ty: ${ty.toFixed(1)}px;
                --rot: ${rot};
                animation: confettiBlast ${1.4 + Math.random() * 0.8}s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
            `;
            container.appendChild(piece);
        }

        setTimeout(() => container.remove(), 2600);
    }
    window.triggerConfetti = triggerConfetti;

    function checkOrderSuccessPanel() {
        const panel = document.getElementById('successPanel');
        if (panel) {
            const obs = new MutationObserver(() => {
                if (panel.style.display !== 'none' && panel.classList.contains('is-celebrating')) {
                    triggerConfetti();
                }
            });
            obs.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    }

    /* ---- 6. LIVE SOCIAL PROOF TICKER ---- */
    function initSocialProofTicker() {
        if (reduced || isAdmin) return;
        if (sessionStorage.getItem('bs_ticker_dismissed') === 'true') return;

        const events = [
            { name: 'Thành Long', loc: 'Hà Nội', text: 'vừa đặt mua Vợt Yonex Astrox 100ZZ Kurenai', time: '1 phút trước', icon: '🏸' },
            { name: 'Minh Tuấn', loc: 'TP. Hồ Chí Minh', text: 'vừa đặt mua Giày Lining Blade Pro 2026', time: '3 phút trước', icon: '👟' },
            { name: 'Bảo Ngọc', loc: 'Đà Nẵng', text: 'vừa thêm Vợt Victor Thruster Ryuga II vào giỏ', time: '5 phút trước', icon: '🔥' },
            { name: 'Hoàng Quân', loc: 'Hải Phòng', text: 'vừa đánh giá 5 sao cho Túi cầu lông Yonex Pro', time: '8 phút trước', icon: '⭐' },
            { name: 'Đức Anh', loc: 'Cần Thơ', text: 'vừa áp mã giảm giá 50.000 ₫ thành công', time: '11 phút trước', icon: '⚡' },
            { name: 'Khánh Vy', loc: 'Bình Dương', text: 'vừa đặt mua Vợt Yonex Nanoflare 800 Pro', time: '14 phút trước', icon: '🏸' },
        ];

        let index = 0;
        let tickerEl = null;
        let hideTimer = null;

        function createTicker() {
            tickerEl = document.createElement('div');
            tickerEl.className = 'bs-live-ticker';
            tickerEl.innerHTML = `
                <div class="bs-live-ticker__avatar" id="bsTickerIcon">🏸</div>
                <div class="bs-live-ticker__body">
                    <div class="bs-live-ticker__title" id="bsTickerTitle">Khách hàng vừa mua</div>
                    <p class="bs-live-ticker__message" id="bsTickerMsg">Đang tải thông tin...</p>
                    <span class="bs-live-ticker__time" id="bsTickerTime">Vừa xong</span>
                </div>
                <button class="bs-live-ticker__close" id="bsTickerClose" type="button" title="Đóng thông báo" aria-label="Đóng">✕</button>
            `;
            document.body.appendChild(tickerEl);

            document.getElementById('bsTickerClose').addEventListener('click', () => {
                tickerEl.classList.remove('is-visible');
                tickerEl.classList.add('is-hiding');
                sessionStorage.setItem('bs_ticker_dismissed', 'true');
                if (hideTimer) clearTimeout(hideTimer);
            });
        }

        function showNextEvent() {
            if (sessionStorage.getItem('bs_ticker_dismissed') === 'true') return;
            if (!tickerEl) createTicker();

            const ev = events[index % events.length];
            index++;

            const iconEl = document.getElementById('bsTickerIcon');
            const titleEl = document.getElementById('bsTickerTitle');
            const msgEl = document.getElementById('bsTickerMsg');
            const timeEl = document.getElementById('bsTickerTime');

            if (iconEl) iconEl.textContent = ev.icon;
            if (titleEl) titleEl.textContent = `${ev.name} (${ev.loc})`;
            if (msgEl) msgEl.textContent = ev.text;
            if (timeEl) timeEl.textContent = ev.time;

            tickerEl.classList.remove('is-hiding');
            tickerEl.classList.add('is-visible');

            hideTimer = setTimeout(() => {
                if (tickerEl) {
                    tickerEl.classList.remove('is-visible');
                    tickerEl.classList.add('is-hiding');
                }
            }, 5200);
        }

        setTimeout(() => {
            showNextEvent();
            setInterval(showNextEvent, 15000);
        }, 4000);
    }

    /* ---- 7. SPARKLE & HEART BURST ENGINE ---- */
    function initSparkles() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.wishlist-btn, .heart-btn, [class*="wish"] button, .yeuthich-btn');
            if (!btn) return;

            const emojis = ['❤️', '💖', '✨', '✦', '⭐'];
            for (let i = 0; i < 9; i++) {
                const s = document.createElement('div');
                const angle = (i / 9) * 360 + (Math.random() * 20 - 10);
                const dist = 38 + Math.random() * 32;
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];

                s.textContent = emoji;
                s.style.cssText = `
                    position: fixed;
                    left: ${e.clientX}px; top: ${e.clientY}px;
                    font-size: ${14 + Math.random() * 10}px;
                    pointer-events: none;
                    z-index: 999999;
                    transform: translate(-50%, -50%);
                    line-height: 1;
                    user-select: none;
                `;
                document.body.appendChild(s);

                const tx = Math.cos(angle * Math.PI / 180) * dist;
                const ty = Math.sin(angle * Math.PI / 180) * dist;

                s.animate([
                    { transform: 'translate(-50%, -50%) scale(0.6) rotate(0deg)', opacity: 1 },
                    { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(1.3) rotate(${Math.random() * 40 - 20}deg)`, opacity: 0 }
                ], { duration: 750, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' });

                setTimeout(() => s.remove(), 800);
            }
        });
    }

    /* ---- 8. MAGNETIC BUTTONS ---- */
    function initMagnetic() {
        if (reduced) return;
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!canHover) return;

        const targets = '.add-to-cart, .btn-primary, .button--primary, .button--accent, .primary-button, .cta-button, .soft-button';

        function attachMagnetic(btn) {
            if (btn._magReady) return;
            btn._magReady = true;

            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = (e.clientX - rect.left - rect.width / 2) * 0.28;
                const y = (e.clientY - rect.top - rect.height / 2) * 0.28;
                btn.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1.04)`;
                btn.style.transition = 'transform 0.08s linear';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translate3d(0,0,0) scale(1)';
                btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            });
        }

        document.querySelectorAll(targets).forEach(attachMagnetic);
    }

    /* ---- 9. PARALLAX BANNER ---- */
    function initParallax() {
        if (reduced) return;
        const banner = document.querySelector('.home-banner, .hero-banner, .category-banner');
        if (!banner) return;

        window.addEventListener('scroll', () => {
            const y = window.scrollY * 0.3;
            banner.style.backgroundPositionY = y + 'px';
        }, { passive: true });
    }

    /* ---- 10. STAGGERED NUMBER COUNTERS ---- */
    function initCounters() {
        const counters = document.querySelectorAll('[data-count], .admin-kpi-value, .stat-value, #metricSpent, #walletBalance');
        if (!counters.length) return;

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const raw = el.dataset.count || el.textContent.replace(/[^\d.]/g, '');
                const target = parseFloat(raw) || 0;
                if (!target || el._counted) return;
                el._counted = true;

                const duration = 1300;
                const start = performance.now();
                const isMoney = el.textContent.includes('₫') || el.textContent.includes('đ') || el.dataset.countIsMoney === 'true';

                function step(now) {
                    const p = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - p, 3);
                    const val = target * eased;
                    el.textContent = isMoney
                        ? Math.round(val).toLocaleString('vi-VN') + ' ₫'
                        : Math.round(val).toLocaleString('vi-VN');
                    if (p < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
                obs.unobserve(el);
            });
        }, { threshold: 0.25 });

        counters.forEach(el => obs.observe(el));
    }

    /* ---- 11. LAZY IMAGE FADE-IN ---- */
    function initLazyImages() {
        document.querySelectorAll('img[loading="lazy"]').forEach(img => {
            img.classList.add('lazy-load');
            if (img.complete) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
            }
        });
    }

    /* ---- 12. SCROLL PROGRESS BAR ---- */
    function initScrollProgress() {
        let bar = document.querySelector('.scroll-progress');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'scroll-progress';
            bar.style.cssText = `
                position: fixed;
                top: 0; left: 0;
                height: 3.5px;
                width: 0%;
                z-index: 999999;
                pointer-events: none;
                background: linear-gradient(90deg, #ff5520, #ff8a45, #ffd166, #00f5a0);
                box-shadow: 0 0 14px rgba(255, 85, 32, 0.6);
                border-radius: 0 3px 3px 0;
                transition: width 0.08s linear;
            `;
            document.body.prepend(bar);
        }
        window.addEventListener('scroll', () => {
            const h = document.documentElement.scrollHeight - window.innerHeight;
            bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
        }, { passive: true });
    }

    /* ---- 13. WAVE TITLE EFFECT ---- */
    function initWaveTitles() {
        document.querySelectorAll('.section-title, h2.section-heading').forEach(el => {
            const text = el.textContent;
            if (el._waved || text.length > 60) return;
            el._waved = true;
            el.innerHTML = text.split('').map((c, i) =>
                c === ' '
                    ? ' '
                    : `<span style="display:inline-block;animation:waveText 2s ease-in-out ${i * 0.05}s infinite">${c}</span>`
            ).join('');
        });
    }

    /* ---- 14. RIPPLE CLICK EFFECT ---- */
    function initRipple() {
        if (reduced) return;
        document.addEventListener('click', (e) => {
            const el = e.target.closest('button, .btn, .button, .add-to-cart, .admin-nav button, .tab-btn, .page-btn, .bs-chip');
            if (!el) return;

            const ripple = document.createElement('span');
            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px; height: ${size}px;
                left: ${e.clientX - rect.left - size/2}px;
                top: ${e.clientY - rect.top - size/2}px;
                background: rgba(255, 85, 32, 0.28);
                border-radius: 50%;
                pointer-events: none;
                transform: scale(0);
                animation: rippleExpand 0.6s ease forwards;
            `;
            el.style.position = el.style.position || 'relative';
            el.style.overflow = 'hidden';
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 650);
        });
    }

    /* ---- 15. SAFE SMOOTH PAGE TRANSITIONS ---- */
    function initPageTransitions() {
        if (reduced) return;
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: linear-gradient(135deg, rgba(233,71,35,0.12), rgba(255,107,53,0.08));
            backdrop-filter: blur(2px);
            z-index: 999999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.24s ease;
        `;
        document.body.appendChild(overlay);

        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
            if (link.getAttribute('target') === '_blank') return;
            if (href.includes('://') && !href.startsWith(window.location.origin)) return;

            link.addEventListener('click', (e) => {
                if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
                overlay.style.opacity = '1';
                setTimeout(() => { window.location.href = href; }, 180);
            });
        });

        window.addEventListener('pageshow', () => {
            overlay.style.opacity = '0';
        });
    }

    /* ---- BOOT ENGINE ---- */
    function boot() {
        if (!isAdmin) {
            tagForAOS();
            initAOS();
        }
        if (!reduced && !isAdmin) {
            init3DTilt();
            initMagnetic();
            initParallax();
            initWaveTitles();
            initSparkles();
            initFlyToCart();
            initSocialProofTicker();
            initPageTransitions();
        }
        if (!reduced) {
            initRipple();
        }
        initCounters();
        initLazyImages();
        initScrollProgress();
        checkOrderSuccessPanel();

        setTimeout(() => {
            document.querySelectorAll('.admin-card, .admin-metrics article, .stat-card').forEach(el => {
                el.classList.add('animation-done');
            });
        }, 2000);

        if (!isAdmin && typeof MutationObserver !== 'undefined') {
            new MutationObserver(() => {
                tagForAOS();
                initAOS();
                init3DTilt();
                initMagnetic();
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
