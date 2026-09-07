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
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
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
        if (document.querySelector('.sport-back-to-top')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sport-back-to-top';
        button.setAttribute('aria-label', 'Lên đầu trang');
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6M12 8v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        document.body.appendChild(button);
        let ticking = false;
        const sync = () => {
            ticking = false;
            button.classList.toggle('is-visible', window.scrollY > 520);
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
            const target = event.target.closest('button, .button, .btn-filter-apply, .admin-primary');
            if (!target || target.disabled || event.pointerType === 'touch' && event.isPrimary === false) return;
            const rect = target.getBoundingClientRect();
            target.style.setProperty('--press-x', `${event.clientX - rect.left}px`);
            target.style.setProperty('--press-y', `${event.clientY - rect.top}px`);
            target.classList.remove('sport-pressed');
            requestAnimationFrame(() => target.classList.add('sport-pressed'));
            window.setTimeout(() => target.classList.remove('sport-pressed'), 480);
        }, { passive: true });
    }

    function boot() {
        upgradeCards();
        setupDeclarativeCounters();
        setupBackToTop();
        setupPressFeedback();

        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver((records) => {
                records.forEach((record) => record.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) upgradeCards(node);
                }));
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
}());
