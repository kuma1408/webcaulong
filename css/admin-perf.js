/* ================================================================
   ADMIN PERFORMANCE JS - Lightweight, no-lag animations
   Chỉ làm những gì CSS không làm được: ripple, counter, tabs
   ================================================================ */
(function () {
    'use strict';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- 1. RIPPLE CLICK trên mọi button ---- */
    function initRipple() {
        if (reduced) return;
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('button, .admin-primary, .an-pill-btn');
            if (!btn) return;
            var rect = btn.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height) * 1.5;
            var ripple = document.createElement('span');
            ripple.className = 'adm-ripple';
            ripple.style.cssText = [
                'position:absolute',
                'border-radius:50%',
                'background:rgba(255,255,255,0.22)',
                'pointer-events:none',
                'width:' + size + 'px',
                'height:' + size + 'px',
                'left:' + (e.clientX - rect.left - size / 2) + 'px',
                'top:' + (e.clientY - rect.top - size / 2) + 'px',
                'transform:scale(0)',
                'animation:adm-ripple 0.55s ease forwards'
            ].join(';');
            btn.style.position = btn.style.position || 'relative';
            btn.style.overflow = 'hidden';
            btn.appendChild(ripple);
            setTimeout(function () { ripple.remove(); }, 600);
        });
    }

    /* ---- 2. ANIMATED NUMBER COUNTERS ---- */
    function initCounters() {
        var counters = document.querySelectorAll(
            '.admin-metrics strong, .admin-kpi-value, [data-count]'
        );
        if (!counters.length) return;

        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting || entry.target._counted) return;
                entry.target._counted = true;

                var el = entry.target;
                var raw = (el.dataset.count || el.textContent || '0');
                var cleaned = raw.replace(/[^\d.]/g, '');
                var target = parseFloat(cleaned) || 0;
                if (!target) return;

                // Detect suffix
                var suffix = raw.replace(/[\d.,]/g, '').trim();
                var isMoney = suffix.includes('đ') || raw.includes('đ') || raw.includes(',');
                var duration = 1200;
                var start = null;

                function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

                function step(ts) {
                    if (!start) start = ts;
                    var p = Math.min((ts - start) / duration, 1);
                    var val = target * easeOutCubic(p);
                    if (isMoney) {
                        el.textContent = Math.round(val).toLocaleString('vi-VN') + ' đ';
                    } else {
                        el.textContent = Math.round(val).toLocaleString('vi-VN') + (suffix && !isMoney ? suffix : '');
                    }
                    if (p < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
                obs.unobserve(el);
            });
        }, { threshold: 0.4 });

        counters.forEach(function (el) { obs.observe(el); });
    }

    /* ---- 3. SCROLL PROGRESS ---- */
    function initScrollProgress() {
        var bar = document.createElement('div');
        bar.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'height:3px', 'width:0%',
            'z-index:99999', 'pointer-events:none', 'border-radius:0 2px 2px 0',
            'background:linear-gradient(90deg,#ff5520,#ff8a00,#ffb703)',
            'transition:width 0.1s linear'
        ].join(';');
        document.body.prepend(bar);

        window.addEventListener('scroll', function () {
            var h = document.documentElement.scrollHeight - window.innerHeight;
            bar.style.width = (h > 0 ? (window.scrollY / h * 100) : 0) + '%';
        }, { passive: true });
    }

    /* ---- 4. TABLE ROW CLICK HIGHLIGHT ---- */
    function initTableRows() {
        document.addEventListener('click', function (e) {
            var row = e.target.closest('.admin-table-card tbody tr');
            if (!row) return;
            var prev = row.closest('table').querySelector('tr.adm-selected');
            if (prev) prev.classList.remove('adm-selected');
            row.classList.add('adm-selected');
        });

        // Inject selected style
        var style = document.createElement('style');
        style.textContent = '.adm-selected { background: rgba(255,85,32,0.07) !important; }';
        document.head.appendChild(style);
    }

    /* ---- 5. FLOATING LABEL INPUTS ---- */
    function initInputAnimations() {
        document.querySelectorAll('.admin-field input, .admin-field textarea').forEach(function (inp) {
            function update() {
                var label = inp.previousElementSibling;
                if (label && label.tagName === 'LABEL') {
                    if (inp.value) label.classList.add('has-value');
                    else label.classList.remove('has-value');
                }
            }
            inp.addEventListener('input', update);
            inp.addEventListener('change', update);
            update();
        });
    }

    /* ---- 6. SIDEBAR NAV RIPPLE ---- */
    function initNavEffects() {
        document.querySelectorAll('.admin-nav button').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                // Flash the button briefly
                btn.style.transform = 'translateX(8px) scale(0.98)';
                setTimeout(function () { btn.style.transform = ''; }, 200);
            });
        });
    }

    /* ---- 7. CARD ENTRANCE ON SECTION SWITCH ---- */
    function initSectionTransitions() {
        // Watch for newly shown sections (when admin tabs switch)
        var obs = new MutationObserver(function (records) {
            records.forEach(function (r) {
                r.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    // Animate child cards
                    var cards = node.querySelectorAll('.admin-card, .admin-metrics article');
                    cards.forEach(function (card, i) {
                        card.style.animation = 'none';
                        // Force reflow
                        void card.offsetHeight;
                        card.style.animation = 'adm-card-in 0.4s cubic-bezier(0.16,1,0.3,1) ' + (i * 0.06) + 's both';
                    });
                    // Animate table rows
                    var rows = node.querySelectorAll('.admin-table-card tbody tr');
                    rows.forEach(function (row, i) {
                        row.style.animation = 'none';
                        void row.offsetHeight;
                        row.style.animation = 'adm-fade-left 0.35s cubic-bezier(0.16,1,0.3,1) ' + (i * 0.04 + 0.1) + 's both';
                    });
                });
            });
        });

        var workspace = document.querySelector('.admin-workspace');
        if (workspace) {
            obs.observe(workspace, { childList: true, subtree: true });
        }
    }

    /* ---- 8. HOVER TOOLTIP cho icon buttons ---- */
    function initTooltips() {
        var style = document.createElement('style');
        style.textContent = [
            '.adm-tip { position:relative; }',
            '.adm-tip::after {',
            '  content: attr(data-tip);',
            '  position:absolute; bottom:calc(100% + 7px); left:50%;',
            '  transform:translateX(-50%) scale(0.85);',
            '  background:rgba(20,10,5,0.92); color:#fff;',
            '  font-size:11px; font-weight:700; padding:5px 10px;',
            '  border-radius:7px; white-space:nowrap; pointer-events:none;',
            '  opacity:0; transition:opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);',
            '  z-index:9999;',
            '}',
            '.adm-tip:hover::after { opacity:1; transform:translateX(-50%) scale(1); }'
        ].join('\n');
        document.head.appendChild(style);

        // Auto-tag sidebar nav buttons
        document.querySelectorAll('.admin-nav button').forEach(function (btn) {
            var text = btn.querySelector('span:not(:first-child)');
            if (text) {
                btn.classList.add('adm-tip');
                btn.setAttribute('data-tip', text.textContent.trim());
            }
        });
    }

    /* ---- 9. SMART CLEANUP: remove will-change after load ---- */
    function cleanupWillChange() {
        setTimeout(function () {
            document.querySelectorAll('[style*="will-change"]').forEach(function (el) {
                el.style.willChange = 'auto';
            });
        }, 2500);
    }

    /* ---- BOOT ---- */
    function boot() {
        initRipple();
        initScrollProgress();
        initTableRows();
        initInputAnimations();
        initNavEffects();
        initSectionTransitions();
        if (!reduced) initTooltips();
        initCounters();
        cleanupWillChange();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();

