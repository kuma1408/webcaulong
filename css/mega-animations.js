/* ============================================================
   MEGA ANIMATIONS JS ENGINE - webcaulong
   Kích hoạt toàn bộ scroll-reveal, AOS, 3D tilt, counters,
   ripple clicks, parallax, magnetic buttons, và nhiều hơn nữa
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
    // On admin page: disable heavy 3D tilt, parallax, page transitions to prevent lag
    const isAdmin = document.body.classList.contains('admin-body') || document.querySelector('.admin-shell') !== null;

    /* ---- 1. AOS - Scroll Reveal Engine ---- */
    /* ---- 1. AOS - SCROLL REVEAL ENGINE ---- */
    function initAOS() {
        if (reduced) {
            document.querySelectorAll('[data-aos]').forEach(el => {
                el.classList.add('aos-animate');
            });
            document.querySelectorAll('[data-aos]').forEach(el => el.classList.add('aos-animate'));
            return;
        }

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('aos-animate');
                } else {
                    // re-play on scroll back up
                    if (entry.target.dataset.aosOnce !== 'true') {
                        entry.target.classList.remove('aos-animate');
                    }
                }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('[data-aos]').forEach((el, i) => {
            if (!el.style.transitionDelay) {
                const delay = el.dataset.aosDelay || (i % 6) * 80;
                const delay = el.dataset.aosDelay || (i % 6) * 75;
                el.style.transitionDelay = delay + 'ms';
            }
            obs.observe(el);
        });
    }

    /* ---- 2. Auto-tag elements with data-aos ---- */
    /* ---- 2. AUTO-TAG ELEMENTS WITH DATA-AOS ---- */
    function tagForAOS() {
        const map = {
            '.product-card'         : 'fade-up',
            '.category-card'        : 'fade-up',
            '.playstyle-card'       : 'zoom-in',
            '.brand-chip'           : 'pop-in',
            '.brand-item'           : 'pop-in',
            '.review-item'          : 'fade-up',
            '.news-card'            : 'fade-up',
            '.blog-card'            : 'fade-up',
            '.feature-item'         : 'flip-up',
            '.admin-card'           : 'fade-up',
            '.stat-card'            : 'fade-up',
            '.admin-kpi-card'       : 'fade-up',
            '.product-card, .product-card-upgraded' : 'fade-up',
            '.category-card'         : 'fade-up',
            '.playstyle-card'        : 'zoom-in',
            '.brand-chip'            : 'pop-in',
            '.brand-item'            : 'pop-in',
            '.review-item'           : 'fade-up',
            '.news-card'             : 'fade-up',
            '.blog-card'             : 'fade-up',
            '.feature-item'          : 'flip-up',
            '.admin-card'            : 'fade-up',
            '.stat-card'             : 'fade-up',
            '.admin-kpi-card'        : 'fade-up',
            '.conversion-funnel-card': 'zoom-in',
            '.funnel-step'          : 'fade-left',
            '.section-title'        : 'fade-up',
            '.section-head'         : 'fade-up',
            '.trust-guarantee-strip': 'fade-up',
            '.cart-item'            : 'fade-left',
            '.wishlist-item'        : 'fade-left',
            '.admin-trend-card'     : 'fade-up',
            '.funnel-step'           : 'fade-left',
            '.section-title'         : 'fade-up',
            '.section-head'          : 'fade-up',
            '.service-strip article' : 'pop-in',
            '.cart-item-row'         : 'fade-left',
            '.wishlist-item'         : 'fade-left',
            '.admin-trend-card'      : 'fade-up',
            '.hero-float-badge'      : 'pop-in',
            '.guide'                 : 'fade-up',
        };

        Object.entries(map).forEach(([selector, animation]) => {
            document.querySelectorAll(selector).forEach((el, i) => {
                if (!el.dataset.aos) {
                    el.dataset.aos = animation;
                    el.dataset.aosDelay = (i % 5) * 80;
                    el.dataset.aosDelay = (i % 6) * 75;
                }
            });
        });
    }

    /* ---- 3. 3D Tilt Effect ---- */
    /* ---- 3. 3D HOLOGRAPHIC TILT & SPECULAR SHEEN ---- */
    function init3DTilt() {
        if (reduced) return;
        const canHover = window.matchMedia('(hover: hover)').matches;
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!canHover) return;

        const tiltTargets = '.product-card, .admin-card, .stat-card, .admin-kpi-card, .category-card, .review-item, .news-card, .brand-chip';
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
                const rx = y * -14;
                const ry = x * 14;
                el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
                el.style.transition = 'transform 0.1s linear';
                el.style.zIndex = '5';
                const rx = y * -16;
                const ry = x * 16;
                el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translate3d(0,-6px,0) scale3d(1.025,1.025,1.025)`;
                el.style.transition = 'transform 0.08s linear';
                el.style.zIndex = '6';

                // Dynamic highlight
                const pct = (x + 0.5) * 100;
                el.style.backgroundImage = el.style.backgroundImage || '';
                const shine = el.querySelector('.__tilt-shine');
                if (shine) {
                    shine.style.background = `radial-gradient(circle at ${pct}% ${(y+0.5)*100}%, rgba(255,255,255,0.12) 0%, transparent 70%)`;
                }
                // Di chuyển điểm sáng phản chiếu theo chuột
                const pctX = ((x + 0.5) * 100).toFixed(1);
                const pctY = ((y + 0.5) * 100).toFixed(1);
                shine.style.background = `radial-gradient(circle at ${pctX}% ${pctY}%, rgba(255,255,255,0.22) 0%, rgba(255,85,32,0.08) 35%, transparent 70%)`;
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale3d(1,1,1)';
                el.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
                el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translate3d(0,0,0) scale3d(1,1,1)';
                el.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
                el.style.zIndex = '';
                shine.style.opacity = '0';
            });

            // Add shine layer
            if (!el.querySelector('.__tilt-shine')) {
                const shine = document.createElement('div');
                shine.className = '__tilt-shine';
                shine.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:inherit;transition:background 0.15s ease;';
                el.style.position = el.style.position || 'relative';
                el.appendChild(shine);
            }
        }

        document.querySelectorAll(tiltTargets).forEach(attachTilt);

        // Also watch for dynamically added cards
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(records => {
                records.forEach(r => r.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches(tiltTargets)) attachTilt(node);
                        node.querySelectorAll && node.querySelectorAll(tiltTargets).forEach(attachTilt);
                        if (node.querySelectorAll) node.querySelectorAll(tiltTargets).forEach(attachTilt);
                    }
                }));
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    /* ---- 4. Ripple Click Effect ---- */
    function initRipple() {
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

            // Tính điểm uốn cong parabol (Control Point) lên cao hơn
            const midX = (startX + endX) / 2 + (Math.random() * 60 - 30);
            const midY = Math.min(startX, endY) - 120;

            const duration = 850;
            const start = performance.now();

            function frame(now) {
                const elapsed = now - start;
                const p = Math.min(elapsed / duration, 1);
                // Quadratic bezier: B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
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
                    // Kích hoạt nảy số lượng giỏ hàng
                    triggerCartBounce();
                }
            }
            requestAnimationFrame(frame);
        }

        function triggerCartBounce() {
            const badge = document.querySelector('.bs-cart-count') || document.querySelector('#giohang-count');
            if (badge) {
                badge.classList.remove('cart-badge-bounce', 'is-bouncing');
                void badge.offsetWidth; // trigger reflow
                badge.classList.add('cart-badge-bounce', 'is-bouncing');
                setTimeout(() => {
                    badge.classList.remove('cart-badge-bounce', 'is-bouncing');
                }, 700);
            }
        }
        window.triggerFlyToCart = triggerFly;
        window.triggerCartBounce = triggerCartBounce;

        document.addEventListener('click', (e) => {
            const el = e.target.closest('button, .btn, .button, .add-to-cart, .admin-nav button, .tab-btn, .an-pill-btn');
            if (!el) return;
            const btn = e.target.closest('.add-to-cart, .btn-add-cart, [data-add-cart], .button--accent:has(span), .btn-them-gio, [onclick*="themVaoGio"]');
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            triggerFly(rect.left + rect.width / 2, rect.top + rect.height / 2);
        });
    }

            const ripple = document.createElement('span');
            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px; height: ${size}px;
                left: ${e.clientX - rect.left - size/2}px;
                top: ${e.clientY - rect.top - size/2}px;
                background: rgba(255,255,255,0.35);
                border-radius: 50%;
                pointer-events: none;
                transform: scale(0);
                animation: rippleExpand 0.6s ease forwards;
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
            const ty = Math.sin(angle) * velocity + 280; // Trọng lực kéo rơi xuống
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
            el.style.position = el.style.position || 'relative';
            el.style.overflow = 'hidden';
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 700);
            container.appendChild(piece);
        }

        setTimeout(() => container.remove(), 2600);
    }
    window.triggerConfetti = triggerConfetti;

    // Tự động kích hoạt Confetti khi có panel đặt hàng thành công
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
                <button class="bs-live-ticker__close" id="bsTickerClose" title="Đóng thông báo" aria-label="Đóng">✕</button>
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

            document.getElementById('bsTickerIcon').textContent = ev.icon;
            document.getElementById('bsTickerTitle').textContent = `${ev.name} (${ev.loc})`;
            document.getElementById('bsTickerMsg').textContent = ev.text;
            document.getElementById('bsTickerTime').textContent = ev.time;

            tickerEl.classList.remove('is-hiding');
            tickerEl.classList.add('is-visible');

            // Ẩn sau 5.2 giây
            hideTimer = setTimeout(() => {
                tickerEl.classList.remove('is-visible');
                tickerEl.classList.add('is-hiding');
            }, 5200);
        }

        // Bắt đầu lần đầu sau 4 giây khi vào trang
        setTimeout(() => {
            showNextEvent();
            // Lặp lại mỗi 15 giây
            setInterval(showNextEvent, 15000);
        }, 4000);
    }

    /* ---- 7. SPARKLE & HEART BURST ENGINE ---- */
    function initSparkles() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.wishlist-btn, .heart-btn, [class*="wish"] button, .yeuthich-btn');
            if (!btn) return;

            // Bắn chùm tim và ánh sao
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

    /* ---- 5. Magnetic Buttons ---- */
    /* ---- 8. MAGNETIC BUTTONS ---- */
    function initMagnetic() {
        if (reduced) return;
        const canHover = window.matchMedia('(hover: hover)').matches;
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!canHover) return;

        document.querySelectorAll('.add-to-cart, .btn-primary, .button--primary, .cta-button').forEach(btn => {
        const targets = '.add-to-cart, .btn-primary, .button--primary, .button--accent, .primary-button, .cta-button, .soft-button';

        function attachMagnetic(btn) {
            if (btn._magReady) return;
            btn._magReady = true;

            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = (e.clientX - rect.left - rect.width / 2) * 0.25;
                const y = (e.clientY - rect.top - rect.height / 2) * 0.25;
                btn.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
                const x = (e.clientX - rect.left - rect.width / 2) * 0.28;
                const y = (e.clientY - rect.top - rect.height / 2) * 0.28;
                btn.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1.04)`;
                btn.style.transition = 'transform 0.08s linear';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
                btn.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
                btn.style.transform = 'translate3d(0,0,0) scale(1)';
                btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            });
        });
        }

        document.querySelectorAll(targets).forEach(attachMagnetic);
    }

    /* ---- 6. Parallax Banner ---- */
    /* ---- 9. PARALLAX BANNER ---- */
    function initParallax() {
        if (reduced) return;
        const banner = document.querySelector('.home-banner, .hero-banner, .hero-section');
        const banner = document.querySelector('.home-banner, .hero-banner, .category-banner');
        if (!banner) return;

        window.addEventListener('scroll', () => {
            const y = window.scrollY * 0.4;
            const y = window.scrollY * 0.3;
            banner.style.backgroundPositionY = y + 'px';
        }, { passive: true });
    }

    /* ---- 7. Staggered Number Counters ---- */
    /* ---- 10. STAGGERED NUMBER COUNTERS ---- */
    function initCounters() {
        const counters = document.querySelectorAll('[data-count], .admin-kpi-value, .stat-value');
        const counters = document.querySelectorAll('[data-count], .admin-kpi-value, .stat-value, #metricSpent, #walletBalance');
        if (!counters.length) return;

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const target = parseFloat(el.dataset.count || el.textContent.replace(/[^\d.]/g, '')) || 0;
                const raw = el.dataset.count || el.textContent.replace(/[^\d.]/g, '');
                const target = parseFloat(raw) || 0;
                if (!target || el._counted) return;
                el._counted = true;

                const duration = 1400;
                const duration = 1300;
                const start = performance.now();
                const isMoney = el.dataset.count?.includes('.') || el.textContent.includes('đ');
                const isMoney = el.textContent.includes('₫') || el.textContent.includes('đ') || el.dataset.countIsMoney === 'true';

                function step(now) {
                    const p = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - p, 3);
                    const val = target * eased;
                    el.textContent = isMoney
                        ? val.toLocaleString('vi-VN') + ' đ'
                        ? Math.round(val).toLocaleString('vi-VN') + ' ₫'
                        : Math.round(val).toLocaleString('vi-VN');
                    if (p < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
                obs.unobserve(el);
            });
        }, { threshold: 0.3 });
        }, { threshold: 0.25 });

        counters.forEach(el => obs.observe(el));
    }

    /* ---- 8. Lazy Image Fade-In ---- */
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

    /* ---- 9. Scroll Progress Bar ---- */
    /* ---- 12. SCROLL PROGRESS BAR ---- */
    function initScrollProgress() {
        let bar = document.querySelector('.scroll-progress');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'scroll-progress';
            bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0%;z-index:99999;pointer-events:none;border-radius:0 2px 2px 0;';
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

    /* ---- 10. Wave Title Effect ---- */
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
    /* ---- 13. RIPPLE CLICK EFFECT ---- */
    function initRipple() {
        if (reduced) return;
        document.addEventListener('click', (e) => {
            const el = e.target.closest('button, .btn, .button, .add-to-cart, .admin-nav button, .tab-btn, .page-btn, .bs-chip');
            if (!el) return;

    /* ---- 11. Sparkle on Wishlist Add ---- */
    function initSparkles() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.wishlist-btn, .heart-btn, [class*="wish"] button');
            if (!btn) return;
            for (let i = 0; i < 8; i++) {
                const s = document.createElement('div');
                const angle = (i / 8) * 360;
                const dist = 30 + Math.random() * 30;
                s.style.cssText = `
                    position:fixed;
                    left:${e.clientX}px; top:${e.clientY}px;
                    width:6px; height:6px;
                    border-radius:50%;
                    background:hsl(${Math.random()*60+330},100%,60%);
                    pointer-events:none;
                    z-index:99999;
                    transform:translate(-50%,-50%);
                    animation:sparkle 0.6s ease forwards;
                    --tx:${Math.cos(angle*Math.PI/180)*dist}px;
                    --ty:${Math.sin(angle*Math.PI/180)*dist}px;
                `;
                // Custom keyframe via style element not feasible, use translate
                s.animate([
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                    { transform: `translate(calc(-50% + ${Math.cos(angle*Math.PI/180)*dist}px), calc(-50% + ${Math.sin(angle*Math.PI/180)*dist}px)) scale(0)`, opacity: 0 }
                ], { duration: 600, easing: 'ease-out', fill: 'forwards' });
                document.body.appendChild(s);
                setTimeout(() => s.remove(), 700);
            }
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

    /* ---- 12. Smooth Page Transitions ---- */
    /* ---- 14. SAFE SMOOTH PAGE TRANSITIONS ---- */
    function initPageTransitions() {
        if (reduced) return;
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;
            background:linear-gradient(135deg,#ff5520,#ffb703);
            z-index:999999;
            opacity:0;
            pointer-events:none;
            transition:opacity 0.3s ease;
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
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.includes('://')) return;
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
            if (link.getAttribute('target') === '_blank') return;
            if (href.includes('://') && !href.startsWith(window.location.origin)) return;

            link.addEventListener('click', (e) => {
                e.preventDefault();
                overlay.style.opacity = '0.15';
                setTimeout(() => { window.location.href = href; }, 250);
                if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
                overlay.style.opacity = '1';
                setTimeout(() => { window.location.href = href; }, 180);
            });
        });

        // Fade out on load
        window.addEventListener('pageshow', () => {
            overlay.style.opacity = '0';
        });
    }

    /* ---- BOOT ---- */
    /* ---- BOOT ENGINE ---- */
    function boot() {
        // On admin: skip tagForAOS (CSS handles it), skip heavy features
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
            initRipple(); // Ripple is OK everywhere (lightweight)
            initRipple();
        }
        initCounters();
        initLazyImages();
        initScrollProgress();
        checkOrderSuccessPanel();

        // Cleanup will-change after animations complete (prevents VRAM waste)
        setTimeout(() => {
            document.querySelectorAll('.admin-card, .admin-metrics article, .stat-card').forEach(el => {
                el.classList.add('animation-done');
            });
        }, 2000);

        // Re-tag dynamically added elements (only on non-admin)
        // Re-tag dynamically added products via MutationObserver
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

