/* One reveal per element; content never depends on an animation to be visible. */
(() => {
    if (window.__storeMotionReady) return;
    window.__storeMotionReady = true;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const active = new Set();
    const seen = new WeakSet();
    const selector = '.product-card,.news-card,.wish-card,.account-card,.stat-card,.admin-kpi-card,.top-product-card,.admin-card,.category-card,.san-pham-goi-y-item';
    function enter(node, index = 0) {
        if (preference.matches || !node.animate) return;
        const animation = node.animate([
            { opacity: .4, translate: '0 12px' }, { opacity: 1, translate: '0 0' }
        ], { duration: 420, delay: Math.min(index % 4, 3) * 55, easing: 'cubic-bezier(.2,.7,.2,1)' });
        active.add(animation);
        animation.finished.catch(() => {}).finally(() => active.delete(animation));
    }
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
            observer.unobserve(entry.target); enter(entry.target, index);
        });
    }, { threshold: .08 }) : null;
    function scan(root) {
        const nodes = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
        nodes.forEach(node => {
            if (seen.has(node)) return;
            seen.add(node); observer?.observe(node);
        });
    }
    function start() {
        scan(document);
        new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
                if (node.nodeType === 1) scan(node);
            }
        }).observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button || button.disabled || preference.matches) return;
            button.animate?.([{ scale: '1' }, { scale: '.97' }, { scale: '1' }], { duration: 170 });
        });
    }
    preference.addEventListener('change', () => { if (preference.matches) active.forEach(animation => animation.cancel()); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
