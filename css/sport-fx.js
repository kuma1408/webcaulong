(function () {
    'use strict';

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)');

    /* Công thức easing bắt buộc của bộ nhận diện chuyển động. */
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
        function step(timestamp) {
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

    function attachTilt(card) {
        if (!card || card.dataset.sportTiltReady === 'true' || !canHover?.matches || reducedMotion?.matches) return;
        card.dataset.sportTiltReady = 'true';
        card.classList.add('sport-tilt');

        const glare = document.createElement('span');
        glare.className = 'sport-card-glare';
        glare.setAttribute('aria-hidden', 'true');
        card.appendChild(glare);

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
            const rotateX = -((mouseY - centerY) / rect.height) * 15;
            const rotateY = ((mouseX - centerX) / rect.width) * 15;
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
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
            glare.style.removeProperty('--glare-x');
            glare.style.removeProperty('--glare-y');
        });
    }

    const tiltSelector = [
        '[data-tilt]',
        '.product-card',
        '.product-card-upgraded',
        '.category-card',
        '.playstyle-card',
        '.admin-metrics article',
        '.account-metrics article',
        '.loyalty-card',
        '.account-performance'
    ].join(',');

    function upgradeCards(root = document) {
        if (root.matches?.(tiltSelector)) attachTilt(root);
        root.querySelectorAll?.(tiltSelector).forEach(attachTilt);
    }

    function setupDeclarativeCounters() {
        const counters = [...document.querySelectorAll('[data-count]')];
        if (!counters.length) return;
        const run = (node) => {
            if (node.dataset.counted === 'true') return;
            node.dataset.counted = 'true';
            const value = Number(node.dataset.count || 0);
            const suffix = node.dataset.countSuffix || '';
            const prefix = node.dataset.countPrefix || '';
            if (!suffix && !prefix) {
                animateCountUp(node, value, Number(node.dataset.countDuration) || 1200);
                return;
            }
            const numeric = document.createElement('span');
            node.replaceChildren(prefix, numeric, suffix);
            animateCountUp(numeric, value, Number(node.dataset.countDuration) || 1200);
        };
        if (reducedMotion?.matches || typeof IntersectionObserver !== 'function') {
            counters.forEach(run);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                run(entry.target);
                observer.unobserve(entry.target);
            });
        }, { threshold: .35 });
        counters.forEach((counter) => observer.observe(counter));
    }

    function setupBackToTop() {
        // auth.js từng tạo một nút riêng. Dọn bản cũ trước khi tạo nút dùng chung
        // để mọi trang chỉ có duy nhất một điều khiển cuộn lên đầu.
        document.querySelectorAll('#bsBackToTop, .bs-back-to-top').forEach((node) => node.remove());
        if (document.querySelector('.sport-back-to-top')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sport-back-to-top';
        button.setAttribute('aria-label', 'Lên đầu trang');
        button.setAttribute('title', 'Lên đầu trang');
        button.innerHTML = `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <defs>
                    <linearGradient id="b2t-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#ff6b3d"/>
                        <stop offset="100%" stop-color="#f5b84b"/>
                    </linearGradient>
                </defs>
                <circle class="progress-bg" cx="24" cy="24" r="20"/>
                <circle class="progress-bar" cx="24" cy="24" r="20"/>
            </svg>
            <svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 14 6-6 6 6M12 8v11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        document.body.appendChild(button);
        const progressBar = button.querySelector('circle.progress-bar');
        const perimeter = 2 * Math.PI * 20; // 125.66

        let ticking = false;
        const sync = () => {
            ticking = false;
            const scrollY = window.scrollY;
            button.classList.toggle('is-visible', scrollY > 120);
            if (progressBar) {
                const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
                const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
                progressBar.style.strokeDashoffset = String(perimeter * (1 - progress));
            }
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(sync);
            }
        }, { passive: true });
        sync();
        button.addEventListener('click', () => window.scrollTo({
            top: 0,
            behavior: reducedMotion?.matches ? 'auto' : 'smooth'
        }));
    }

    function setupPressFeedback() {
        document.addEventListener('pointerdown', (event) => {
            const target = event.target.closest('button, .button, .btn-filter-apply, .admin-primary, .product-card__action--cart');
            if (!target || target.disabled || (event.pointerType === 'touch' && event.isPrimary === false)) return;
            const rect = target.getBoundingClientRect();
            target.style.setProperty('--press-x', `${event.clientX - rect.left}px`);
            target.style.setProperty('--press-y', `${event.clientY - rect.top}px`);
            target.classList.remove('sport-pressed');
            requestAnimationFrame(() => target.classList.add('sport-pressed'));
            window.setTimeout(() => target.classList.remove('sport-pressed'), 480);
        }, { passive: true });
    }

    function setupScrollReveal() {
        if (reducedMotion?.matches || typeof IntersectionObserver !== 'function') return;
        const revealSelector = [
            '.service-strip article',
            '.category-card',
            '.playstyle-card',
            '.guide__visual',
            '.guide__content',
            '.product-grid > *',
            '.danh-sach-san-pham-grid > *'
        ].join(',');

        const nodes = document.querySelectorAll(revealSelector);
        if (!nodes.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('sport-reveal', 'is-revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        nodes.forEach((node, idx) => {
            node.classList.add('sport-reveal');
            node.style.transitionDelay = `${(idx % 4) * 0.08}s`;
            observer.observe(node);
        });
    }

    function setupAmbientParticles() {
        if (reducedMotion?.matches || window.innerWidth < 768) return;
        if (document.querySelector('.sport-ambient-canvas')) return;

        const canvas = document.createElement('canvas');
        canvas.className = 'sport-ambient-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.prepend(canvas);

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }, { passive: true });

        const particleCount = 28;
        const particles = Array.from({ length: particleCount }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 2.2 + 0.8,
            speedY: -(Math.random() * 0.45 + 0.15),
            speedX: (Math.random() - 0.5) * 0.35,
            opacity: Math.random() * 0.45 + 0.15,
            glow: Math.random() > 0.6,
            hue: Math.random() > 0.4 ? 'rgba(255, 107, 61,' : 'rgba(245, 184, 75,'
        }));

        let animFrame = 0;
        let isVisible = true;

        document.addEventListener('visibilitychange', () => {
            isVisible = !document.hidden;
            if (isVisible && !animFrame) animFrame = requestAnimationFrame(renderLoop);
        });

        const renderLoop = () => {
            if (!isVisible) {
                animFrame = 0;
                return;
            }
            ctx.clearRect(0, 0, width, height);

            particles.forEach((p) => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.y < -10) {
                    p.y = height + 10;
                    p.x = Math.random() * width;
                }
                if (p.x < -10) p.x = width + 10;
                if (p.x > width + 10) p.x = -10;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `${p.hue} ${p.opacity})`;
                if (p.glow) {
                    ctx.shadowColor = 'rgba(255, 107, 61, 0.6)';
                    ctx.shadowBlur = 8;
                } else {
                    ctx.shadowBlur = 0;
                }
                ctx.fill();
            });

            animFrame = requestAnimationFrame(renderLoop);
        };

        animFrame = requestAnimationFrame(renderLoop);
    }

    function setupCartBounceFeedback() {
        const bounceCart = () => {
            const badge = document.getElementById('cartCount') || document.querySelector('.cart-count, .cart-badge');
            if (badge) {
                badge.classList.remove('cart-bounce');
                void badge.offsetWidth;
                badge.classList.add('cart-bounce');
                window.setTimeout(() => badge.classList.remove('cart-bounce'), 700);
            }
        };

        window.addEventListener('cart-updated', bounceCart);
        document.addEventListener('click', (event) => {
            if (event.target.closest('.product-card__action--cart, .them-vao-gio, .btn-add-cart')) {
                window.setTimeout(bounceCart, 300);
            }
        });
    }

    function boot() {
        upgradeCards();
        setupDeclarativeCounters();
        setupBackToTop();
        setupPressFeedback();
        setupScrollReveal();
        setupAmbientParticles();
        setupCartBounceFeedback();

        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver((records) => {
                records.forEach((record) => record.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) upgradeCards(node);
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        upgradeCards(node);
                    }
                }));
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
}());
