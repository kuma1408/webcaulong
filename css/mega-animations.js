/* ============================================================
   MEGA ANIMATIONS JS ENGINE - webcaulong
   Kích hoạt toàn bộ scroll-reveal, AOS, 3D tilt, counters,
   ripple clicks, parallax, magnetic buttons, và nhiều hơn nữa
   ============================================================ */
(function () {
    'use strict';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // On admin page: disable heavy 3D tilt, parallax, page transitions to prevent lag
    const isAdmin = document.body.classList.contains('admin-body') || document.querySelector('.admin-shell') !== null;

    /* ---- 1. AOS - Scroll Reveal Engine ---- */
    function initAOS() {
        if (reduced) {
            document.querySelectorAll('[data-aos]').forEach(el => {
                el.classList.add('aos-animate');
            });
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
                el.style.transitionDelay = delay + 'ms';
            }
            obs.observe(el);
        });
    }

    /* ---- 2. Auto-tag elements with data-aos ---- */
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
            '.conversion-funnel-card': 'zoom-in',
            '.funnel-step'          : 'fade-left',
            '.section-title'        : 'fade-up',
            '.section-head'         : 'fade-up',
            '.trust-guarantee-strip': 'fade-up',
            '.cart-item'            : 'fade-left',
            '.wishlist-item'        : 'fade-left',
            '.admin-trend-card'     : 'fade-up',
        };

        Object.entries(map).forEach(([selector, animation]) => {
            document.querySelectorAll(selector).forEach((el, i) => {
                if (!el.dataset.aos) {
                    el.dataset.aos = animation;
                    el.dataset.aosDelay = (i % 5) * 80;
                }
            });
        });
    }

    /* ---- 3. 3D Tilt Effect ---- */
    function init3DTilt() {
        if (reduced) return;
        const canHover = window.matchMedia('(hover: hover)').matches;
        if (!canHover) return;

        const tiltTargets = '.product-card, .admin-card, .stat-card, .admin-kpi-card, .category-card, .review-item, .news-card, .brand-chip';

        function attachTilt(el) {
            if (el._tiltReady) return;
            el._tiltReady = true;

            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                const rx = y * -14;
                const ry = x * 14;
                el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
                el.style.transition = 'transform 0.1s linear';
                el.style.zIndex = '5';

                // Dynamic highlight
                const pct = (x + 0.5) * 100;
                el.style.backgroundImage = el.style.backgroundImage || '';
                const shine = el.querySelector('.__tilt-shine');
                if (shine) {
                    shine.style.background = `radial-gradient(circle at ${pct}% ${(y+0.5)*100}%, rgba(255,255,255,0.12) 0%, transparent 70%)`;
                }
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale3d(1,1,1)';
                el.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
                el.style.zIndex = '';
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
                    }
                }));
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    /* ---- 4. Ripple Click Effect ---- */
    function initRipple() {
        if (reduced) return;
        document.addEventListener('click', (e) => {
            const el = e.target.closest('button, .btn, .button, .add-to-cart, .admin-nav button, .tab-btn, .an-pill-btn');
            if (!el) return;

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
            `;
            el.style.position = el.style.position || 'relative';
            el.style.overflow = 'hidden';
            el.appendChild(ripple);
            setTimeout(() => ripple.remove(), 700);
        });
    }

    /* ---- 5. Magnetic Buttons ---- */
    function initMagnetic() {
        if (reduced) return;
        const canHover = window.matchMedia('(hover: hover)').matches;
        if (!canHover) return;

        document.querySelectorAll('.add-to-cart, .btn-primary, .button--primary, .cta-button').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = (e.clientX - rect.left - rect.width / 2) * 0.25;
                const y = (e.clientY - rect.top - rect.height / 2) * 0.25;
                btn.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
                btn.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
            });
        });
    }

    /* ---- 6. Parallax Banner ---- */
    function initParallax() {
        if (reduced) return;
        const banner = document.querySelector('.home-banner, .hero-banner, .hero-section');
        if (!banner) return;

        window.addEventListener('scroll', () => {
            const y = window.scrollY * 0.4;
            banner.style.backgroundPositionY = y + 'px';
        }, { passive: true });
    }

    /* ---- 7. Staggered Number Counters ---- */
    function initCounters() {
        const counters = document.querySelectorAll('[data-count], .admin-kpi-value, .stat-value');
        if (!counters.length) return;

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const target = parseFloat(el.dataset.count || el.textContent.replace(/[^\d.]/g, '')) || 0;
                if (!target || el._counted) return;
                el._counted = true;

                const duration = 1400;
                const start = performance.now();
                const isMoney = el.dataset.count?.includes('.') || el.textContent.includes('đ');

                function step(now) {
                    const p = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - p, 3);
                    const val = target * eased;
                    el.textContent = isMoney
                        ? val.toLocaleString('vi-VN') + ' đ'
                        : Math.round(val).toLocaleString('vi-VN');
                    if (p < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
                obs.unobserve(el);
            });
        }, { threshold: 0.3 });

        counters.forEach(el => obs.observe(el));
    }

    /* ---- 8. Lazy Image Fade-In ---- */
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
    function initScrollProgress() {
        let bar = document.querySelector('.scroll-progress');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'scroll-progress';
            bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0%;z-index:99999;pointer-events:none;border-radius:0 2px 2px 0;';
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
        });
    }

    /* ---- 12. Smooth Page Transitions ---- */
    function initPageTransitions() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;
            background:linear-gradient(135deg,#ff5520,#ffb703);
            z-index:999999;
            opacity:0;
            pointer-events:none;
            transition:opacity 0.3s ease;
        `;
        document.body.appendChild(overlay);

        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.includes('://')) return;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                overlay.style.opacity = '0.15';
                setTimeout(() => { window.location.href = href; }, 250);
            });
        });

        // Fade out on load
        window.addEventListener('pageshow', () => {
            overlay.style.opacity = '0';
        });
    }

    /* ---- BOOT ---- */
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
            initPageTransitions();
        }
        if (!reduced) {
            initRipple(); // Ripple is OK everywhere (lightweight)
        }
        initCounters();
        initLazyImages();
        initScrollProgress();

        // Cleanup will-change after animations complete (prevents VRAM waste)
        setTimeout(() => {
            document.querySelectorAll('.admin-card, .admin-metrics article, .stat-card').forEach(el => {
                el.classList.add('animation-done');
            });
        }, 2000);

        // Re-tag dynamically added elements (only on non-admin)
        if (!isAdmin && typeof MutationObserver !== 'undefined') {
            new MutationObserver(() => {
                tagForAOS();
                initAOS();
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();

