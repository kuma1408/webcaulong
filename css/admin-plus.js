/* =============================================================
   ADMIN PLUS — tiện ích & hiệu ứng cho trang quản trị
   1. Bảng lệnh nhanh (Ctrl/⌘ + K): chuyển mục, thêm mới, xuất CSV…
   2. Phím tắt: Alt+1…9 chuyển mục, "/" tìm trong mục, Shift+R làm mới
   3. Sắp xếp bảng bằng cách bấm tiêu đề cột (chữ, số, tiền, ngày)
   4. Hiệu ứng chuyển mục mượt, thẻ xuất hiện lần lượt
   5. Tự động làm mới tổng quan mỗi 60 giây (bật/tắt, có ghi nhớ)
   6. Cảnh báo khi đóng hộp thoại đang có thay đổi chưa lưu
   ============================================================= */
(() => {
    'use strict';
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const AUTO_KEY = 'badminton_admin_autorefresh';
    const admin = () => window.BadmintonAdmin;
    const store = {
        get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* bỏ qua */ } }
    };
    const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

    /* ---------- 1. Bảng lệnh nhanh ---------- */
    const VIEW_ICONS = { overview: '⌂', products: '◇', orders: '□', users: '◎', content: '✎', support: '✉', chat: '💬', notifications: '◉', vouchers: '%', deposits: '₫', approvals: '✓', 'supplemental-evidence': '📎', audit: '≡' };
    function clickIfEnabled(selector, view) {
        return () => {
            const run = () => { const node = $(selector); if (node && !node.disabled) node.click(); };
            if (view && admin()?.currentView() !== view) { admin()?.activateView(view); setTimeout(run, 160); } else run();
        };
    }
    function buildCommands() {
        const views = admin()?.views() || {};
        const navButtons = new Map($$('[data-admin-view]').map((button) => [button.dataset.adminView, button]));
        const commands = Object.entries(views)
            .filter(([view]) => !navButtons.get(view)?.hidden)
            .map(([view, title]) => ({ group: 'Đi tới', view, icon: VIEW_ICONS[view] || '•', label: title, keywords: view, run: () => admin()?.activateView(view) }));
        const actions = [
            ['＋', 'Thêm sản phẩm mới', 'them san pham product', clickIfEnabled('#addProduct', 'products')],
            ['＋', 'Thêm người dùng', 'them nguoi dung user tai khoan', clickIfEnabled('#addUser', 'users')],
            ['＋', 'Viết bài tin tức / hướng dẫn', 'them bai viet noi dung content', clickIfEnabled('#addContent', 'content')],
            ['%', 'Tạo voucher khuyến mãi', 'them voucher ma giam gia', clickIfEnabled('#addVoucher', 'vouchers')],
            ['⇩', 'Xuất đơn hàng ra CSV', 'xuat csv export don hang excel', clickIfEnabled('#exportOrders', 'orders')],
            ['↻', 'Làm mới dữ liệu mục hiện tại', 'lam moi refresh reload', () => admin()?.refresh()],
            ['◐', 'Đổi chế độ sáng / tối', 'giao dien theme sang toi dark light', clickIfEnabled('#adminThemeToggle')],
            ['⏱', 'Bật/tắt tự động làm mới tổng quan', 'tu dong auto refresh', () => toggleAutoRefresh()],
            ['↗', 'Mở cửa hàng', 'cua hang store trang chu', () => window.open('trangchu.html', '_blank', 'noopener')],
            ['⎋', 'Đăng xuất', 'dang xuat logout', clickIfEnabled('#adminLogout')]
        ].map(([icon, label, keywords, run]) => ({ group: 'Thao tác', icon, label, keywords, run }));
        return commands.concat(actions);
    }

    let palette = null;
    let paletteItems = [];
    let paletteIndex = 0;
    let lastFocus = null;
    function ensurePalette() {
        if (palette) return palette;
        palette = document.createElement('div');
        palette.className = 'ap-palette';
        palette.hidden = true;
        palette.innerHTML = `
            <div class="ap-palette__backdrop" data-ap-close></div>
            <div class="ap-palette__panel" role="dialog" aria-modal="true" aria-label="Bảng lệnh nhanh">
                <div class="ap-palette__search">
                    <span aria-hidden="true">⌕</span>
                    <input type="text" id="apPaletteInput" placeholder="Tìm mục hoặc thao tác… (ví dụ: voucher, xuất csv)" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="apPaletteList" aria-autocomplete="list">
                    <kbd>Esc</kbd>
                </div>
                <ul class="ap-palette__list" id="apPaletteList" role="listbox"></ul>
                <div class="ap-palette__foot">
                    <span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span>
                    <span><kbd>Alt</kbd>+<kbd>1…9</kbd> chuyển mục</span><span><kbd>/</kbd> tìm trong mục</span><span><kbd>Shift</kbd>+<kbd>R</kbd> làm mới</span>
                </div>
            </div>`;
        document.body.appendChild(palette);
        const input = $('#apPaletteInput', palette);
        input.addEventListener('input', () => renderPalette(input.value));
        input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!paletteItems.length) return;
                paletteIndex = (paletteIndex + (event.key === 'ArrowDown' ? 1 : -1) + paletteItems.length) % paletteItems.length;
                highlightPalette();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                runPaletteItem(paletteIndex);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closePalette();
            } else if (event.key === 'Tab') {
                event.preventDefault();
            }
        });
        palette.addEventListener('click', (event) => {
            if (event.target.closest('[data-ap-close]')) closePalette();
            const item = event.target.closest('[data-ap-index]');
            if (item) runPaletteItem(Number(item.dataset.apIndex));
        });
        palette.addEventListener('pointermove', (event) => {
            const item = event.target.closest('[data-ap-index]');
            if (item && Number(item.dataset.apIndex) !== paletteIndex) { paletteIndex = Number(item.dataset.apIndex); highlightPalette(false); }
        });
        return palette;
    }
    function renderPalette(query) {
        const list = $('#apPaletteList', palette);
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        paletteItems = buildCommands().filter((command) => {
            const haystack = normalize(`${command.label} ${command.keywords} ${command.group}`);
            return terms.every((term) => haystack.includes(term));
        });
        paletteIndex = 0;
        list.replaceChildren();
        if (!paletteItems.length) {
            const empty = document.createElement('li');
            empty.className = 'ap-palette__empty';
            empty.textContent = 'Không tìm thấy lệnh phù hợp.';
            list.appendChild(empty);
            return;
        }
        let group = '';
        const visibleViews = $$('[data-admin-view]').filter((button) => !button.hidden).map((button) => button.dataset.adminView);
        paletteItems.forEach((command, index) => {
            if (command.group !== group) {
                group = command.group;
                const heading = document.createElement('li');
                heading.className = 'ap-palette__group';
                heading.setAttribute('role', 'presentation');
                heading.textContent = group;
                list.appendChild(heading);
            }
            const item = document.createElement('li');
            item.className = 'ap-palette__item';
            item.id = `apItem${index}`;
            item.dataset.apIndex = String(index);
            item.setAttribute('role', 'option');
            item.style.setProperty('--ap-i', String(Math.min(index, 12)));
            const icon = document.createElement('span');
            icon.className = 'ap-palette__icon';
            icon.textContent = command.icon;
            const label = document.createElement('span');
            label.textContent = command.label;
            item.append(icon, label);
            if (command.view) {
                const position = visibleViews.indexOf(command.view);
                if (position >= 0 && position < 9) {
                    const hint = document.createElement('kbd');
                    hint.textContent = `Alt ${position + 1}`;
                    item.appendChild(hint);
                }
            }
            list.appendChild(item);
        });
        highlightPalette();
    }
    function highlightPalette(scroll = true) {
        $$('.ap-palette__item', palette).forEach((item) => {
            const active = Number(item.dataset.apIndex) === paletteIndex;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-selected', String(active));
            if (active && scroll) item.scrollIntoView({ block: 'nearest' });
        });
        $('#apPaletteInput', palette).setAttribute('aria-activedescendant', `apItem${paletteIndex}`);
    }
    function openPalette() {
        if (!admin()) return;
        ensurePalette();
        lastFocus = document.activeElement;
        palette.hidden = false;
        requestAnimationFrame(() => palette.classList.add('is-open'));
        const input = $('#apPaletteInput', palette);
        input.value = '';
        renderPalette('');
        input.focus();
    }
    function closePalette() {
        if (!palette || palette.hidden) return;
        palette.classList.remove('is-open');
        setTimeout(() => { palette.hidden = true; }, reduced() ? 0 : 160);
        if (lastFocus?.isConnected) lastFocus.focus();
    }
    function runPaletteItem(index) {
        const command = paletteItems[index];
        if (!command) return;
        closePalette();
        setTimeout(() => command.run(), 30);
    }

    /* ---------- 2. Phím tắt ---------- */
    const isTyping = (target) => target?.closest?.('input, textarea, select, [contenteditable="true"]');
    function installShortcuts() {
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                if (palette && !palette.hidden) closePalette(); else openPalette();
                return;
            }
            if (document.querySelector('dialog[open]') || (palette && !palette.hidden)) return;
            if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
                const buttons = $$('[data-admin-view]').filter((button) => !button.hidden);
                const target = buttons[Number(event.code.slice(5)) - 1];
                if (target) { event.preventDefault(); target.click(); target.focus({ preventScroll: true }); }
                return;
            }
            if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key === '/') {
                const panel = $('[data-admin-panel]:not([hidden])');
                const search = panel && $('input[type="search"], .admin-search input', panel);
                if (search) { event.preventDefault(); search.focus(); search.select(); }
            } else if (event.key === 'R' && event.shiftKey) {
                event.preventDefault();
                $('#adminRefresh')?.click();
            }
        });
    }
    function installPaletteButton() {
        const actions = $('.admin-topbar__actions');
        if (!actions || $('#apPaletteButton')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'apPaletteButton';
        button.className = 'ap-palette-trigger';
        button.setAttribute('aria-label', 'Mở bảng lệnh nhanh');
        button.title = 'Bảng lệnh nhanh';
        button.innerHTML = `<span aria-hidden="true">⌕</span><span class="ap-palette-trigger__text">Tìm nhanh</span><kbd>${isMac ? '⌘' : 'Ctrl'} K</kbd>`;
        button.addEventListener('click', openPalette);
        actions.prepend(button);
    }

    /* ---------- 3. Sắp xếp bảng ---------- */
    function cellValue(cell) {
        const text = (cell?.innerText || '').trim();
        if (!text || text === '—') return { type: 'empty', value: '' };
        const date = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (date) {
            const time = text.match(/(\d{1,2}):(\d{2})/) || [];
            const year = Number(date[3].length === 2 ? `20${date[3]}` : date[3]);
            return { type: 'number', value: new Date(year, Number(date[2]) - 1, Number(date[1]), Number(time[1] || 0), Number(time[2] || 0)).getTime() };
        }
        const numeric = text.replace(/[#₫đ%\s.]/gi, '').replace(',', '.');
        if (/^-?\d+(\.\d+)?$/.test(numeric)) return { type: 'number', value: Number(numeric) };
        return { type: 'text', value: normalize(text) };
    }
    function sortTable(table, columnIndex, header) {
        const tbody = table.tBodies[0];
        if (!tbody) return;
        const rows = [...tbody.rows];
        const isCompanion = (row) => row.cells.length === 1 && row.cells[0].colSpan > 1;
        if (rows.length < 2 || isCompanion(rows[0])) return;
        // Dòng chi tiết (một ô gộp cột) đi kèm dòng chính ngay phía trên, nên được di chuyển cùng nhau.
        const groups = [];
        rows.forEach((row) => {
            if (isCompanion(row) && groups.length) groups[groups.length - 1].extra.push(row);
            else groups.push({ row, extra: [] });
        });
        if (groups.length < 2) return;
        const direction = header.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        $$('th[aria-sort]', table).forEach((th) => th.removeAttribute('aria-sort'));
        header.setAttribute('aria-sort', direction);
        const factor = direction === 'ascending' ? 1 : -1;
        const keyed = groups.map((group, index) => ({ ...group, index, key: cellValue(group.row.cells[columnIndex]) }));
        keyed.sort((a, b) => {
            if (a.key.type === 'empty' || b.key.type === 'empty') return a.key.type === b.key.type ? a.index - b.index : a.key.type === 'empty' ? 1 : -1;
            if (a.key.type === 'number' && b.key.type === 'number') return (a.key.value - b.key.value) * factor || a.index - b.index;
            return String(a.key.value).localeCompare(String(b.key.value), 'vi') * factor || a.index - b.index;
        });
        const first = new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));
        tbody.append(...keyed.flatMap((item) => [item.row, ...item.extra]));
        if (reduced()) return;
        keyed.forEach(({ row }) => {
            const delta = first.get(row) - row.getBoundingClientRect().top;
            if (delta) row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
        });
    }
    function prepareTables(scope = document) {
        $$('.admin-table-wrap table, table.admin-table', scope).forEach((table) => {
            const headers = $$('thead th', table);
            headers.forEach((th, index) => {
                if (th.dataset.apSortable || /thao tác|hành động|chuyển trạng thái|^$/i.test(th.textContent.trim())) return;
                th.dataset.apSortable = 'true';
                th.classList.add('ap-sortable');
                th.tabIndex = 0;
                th.title = 'Bấm để sắp xếp';
                const activate = () => sortTable(table, index, th);
                th.addEventListener('click', activate);
                th.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
            });
            const tbody = table.tBodies[0];
            if (tbody && !tbody.dataset.apWatch) {
                tbody.dataset.apWatch = 'true';
                // Dữ liệu mới thay thế: bỏ trạng thái sắp xếp cũ và cho hàng mới trượt vào.
                new MutationObserver(() => {
                    $$('th[aria-sort]', table).forEach((th) => th.removeAttribute('aria-sort'));
                    if (reduced()) return;
                    [...tbody.rows].slice(0, 20).forEach((row, i) => {
                        if (row.dataset.apIn) return;
                        row.dataset.apIn = '1';
                        row.style.setProperty('--ap-row', String(i));
                        row.classList.add('ap-row-in');
                    });
                }).observe(tbody, { childList: true });
            }
        });
    }

    /* ---------- 4. Chuyển mục mượt ---------- */
    function installViewTransitions() {
        $$('[data-admin-panel]').forEach((panel) => {
            new MutationObserver(() => {
                if (panel.hidden || reduced()) return;
                panel.classList.remove('ap-panel-in');
                void panel.offsetWidth;
                panel.classList.add('ap-panel-in');
                const top = $('.admin-topbar')?.getBoundingClientRect().top ?? 0;
                if (top < 0) window.scrollTo({ top: Math.max(0, window.scrollY + top - 12), behavior: 'smooth' });
            }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
        });
        // Thanh chỉ báo trượt theo mục đang chọn trong sidebar.
        const nav = $('#adminNavigation');
        if (!nav) return;
        const indicator = document.createElement('span');
        indicator.className = 'ap-nav-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        nav.appendChild(indicator);
        const move = () => {
            const active = $('[data-admin-view].is-active', nav);
            if (!active || active.hidden || nav.classList.contains('is-collapsed') && getComputedStyle(nav).display === 'none') { indicator.style.opacity = '0'; return; }
            indicator.style.opacity = '1';
            indicator.style.transform = `translateY(${active.offsetTop}px)`;
            indicator.style.height = `${active.offsetHeight}px`;
        };
        $$('[data-admin-view]', nav).forEach((button) => new MutationObserver(move).observe(button, { attributes: true, attributeFilter: ['class', 'hidden'] }));
        window.addEventListener('resize', move, { passive: true });
        setTimeout(move, 50);
    }

    /* ---------- 5. Tự động làm mới tổng quan ---------- */
    let autoTimer = 0;
    let countdownTimer = 0;
    let nextRefreshAt = 0;
    const AUTO_INTERVAL = 60000;
    function autoEnabled() { return store.get(AUTO_KEY) === 'on'; }
    function scheduleAuto() {
        clearTimeout(autoTimer);
        clearInterval(countdownTimer);
        const toggle = $('#apAutoRefresh');
        if (toggle) toggle.setAttribute('aria-pressed', String(autoEnabled()));
        if (!autoEnabled()) { updateCountdown(); return; }
        nextRefreshAt = Date.now() + AUTO_INTERVAL;
        countdownTimer = setInterval(updateCountdown, 1000);
        updateCountdown();
        autoTimer = setTimeout(() => {
            if (!document.hidden && admin()?.currentView() === 'overview' && !document.querySelector('dialog[open]')) admin().refresh();
            scheduleAuto();
        }, AUTO_INTERVAL);
    }
    function updateCountdown() {
        const label = $('#apAutoRefresh .ap-auto__label');
        if (!label) return;
        if (!autoEnabled()) { label.textContent = 'Tự làm mới: tắt'; return; }
        const seconds = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
        label.textContent = `Tự làm mới · ${seconds}s`;
    }
    function toggleAutoRefresh() {
        store.set(AUTO_KEY, autoEnabled() ? 'off' : 'on');
        scheduleAuto();
        window.showToast?.(autoEnabled() ? 'Đã bật tự động làm mới tổng quan mỗi 60 giây.' : 'Đã tắt tự động làm mới.', 'info');
    }
    function installAutoRefresh() {
        const container = $('.health-actions');
        if (!container || $('#apAutoRefresh')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'apAutoRefresh';
        button.className = 'btn-health-action ap-auto';
        button.title = 'Tự động tải lại số liệu tổng quan mỗi 60 giây';
        button.innerHTML = '<span class="ap-auto__dot" aria-hidden="true"></span><span class="ap-auto__label">Tự làm mới: tắt</span>';
        button.addEventListener('click', toggleAutoRefresh);
        container.prepend(button);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && autoEnabled()) scheduleAuto(); });
        scheduleAuto();
    }

    /* ---------- 6. Cảnh báo thay đổi chưa lưu ---------- */
    const DIRTY_MESSAGE = 'Bạn có thay đổi chưa lưu. Đóng hộp thoại và bỏ các thay đổi này?';
    function installDirtyGuard() {
        $$('dialog.admin-dialog').forEach((dialog) => {
            const form = $('form', dialog);
            if (!form || dialog.dataset.apGuard) return;
            dialog.dataset.apGuard = 'true';
            let dirty = false;
            form.addEventListener('input', (event) => { if (event.isTrusted) dirty = true; });
            form.addEventListener('change', (event) => { if (event.isTrusted) dirty = true; });
            form.addEventListener('submit', () => { dirty = false; });
            new MutationObserver(() => { if (dialog.open) dirty = false; }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
            dialog.addEventListener('cancel', (event) => {
                if (dirty && !window.confirm(DIRTY_MESSAGE)) event.preventDefault();
                else dirty = false;
            });
            dialog.addEventListener('click', (event) => {
                const closer = event.target.closest('[data-close-dialog]');
                if (!closer || !dirty) return;
                if (!window.confirm(DIRTY_MESSAGE)) { event.stopImmediatePropagation(); event.preventDefault(); }
                else dirty = false;
            }, true);
        });
    }

    function start() {
        const shell = $('#adminShell');
        if (!shell) return;
        installShortcuts();
        const boot = () => {
            if (shell.dataset.apReady) return;
            shell.dataset.apReady = 'true';
            installPaletteButton();
            installViewTransitions();
            installAutoRefresh();
            installDirtyGuard();
            prepareTables();
        };
        if (!shell.hidden) boot();
        else new MutationObserver((_, observer) => { if (!shell.hidden) { observer.disconnect(); boot(); } }).observe(shell, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
