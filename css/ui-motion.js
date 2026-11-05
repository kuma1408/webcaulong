/* One reveal per element; content never depends on an animation to be visible. */
(() => {
    if (window.__storeMotionReady) return;
    window.__storeMotionReady = true;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const active = new Set();
    const seen = new WeakSet();
    const queue = new Set();
    let frame = 0;
    const selector = '.product-card,.product-card-upgraded,.news-card,.wish-card,.account-card,.stat-card,.admin-kpi-card,.top-product-card,.admin-card,.category-card,.san-pham-goi-y-item';
    function enter(node, index = 0) {
        if (preference.matches || !node.animate || node.hasAttribute('data-aos') || !node.isConnected) return;
        const animation = node.animate([
            { opacity: .5, translate: '0 10px' }, { opacity: 1, translate: '0 0' }
        ], { duration: 360, delay: Math.min(index % 4, 3) * 35, easing: 'cubic-bezier(.22,1,.36,1)' });
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
    function flush() {
        frame = 0;
        queue.forEach(root => { if (root.isConnected) scan(root); });
        queue.clear();
    }
    function start() {
        scan(document);
        new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) if (node.nodeType === 1) queue.add(node);
                for (const node of record.removedNodes) {
                    if (node.nodeType !== 1) continue;
                    [node, ...node.querySelectorAll(selector)].forEach(child => {
                        if (!child.isConnected) { observer?.unobserve(child); seen.delete(child); }
                    });
                }
            }
            if (queue.size && !frame) frame = requestAnimationFrame(flush);
        }).observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', event => {
            const button = event.target.closest?.('button');
            if (!button || button.disabled || preference.matches) return;
            const animation = button.animate?.([{ scale: '1' }, { scale: '.97' }, { scale: '1' }], { duration: 170 });
            if (animation) {
                active.add(animation);
                animation.finished.catch(() => {}).finally(() => active.delete(animation));
            }
        });
    }
    preference.addEventListener('change', () => { if (preference.matches) active.forEach(animation => animation.cancel()); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
