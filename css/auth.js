/*
 * Badminton Store — xác thực Bearer token và giao diện dùng chung.
 * Tệp này vẫn cung cấp các hàm toàn cục cũ để các trang sản phẩm hiện hữu
 * tiếp tục hoạt động, nhưng mọi danh tính đều do backend suy ra từ token.
 */
(function () {
    'use strict';

    const TOKEN_KEY = 'badminton_access_token';
    const THEME_KEY = 'badminton_theme';
    const configuredBase = document.querySelector('meta[name="api-base"]')?.content?.trim();
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';

    window.API_BASE = configuredBase || (isLocal ? 'http://127.0.0.1:5000' : window.location.origin);
    // Khai báo lexical để các script cũ có thể tiếp tục dùng API_BASE/API_HEADERS.
    window.API_HEADERS = { 'Content-Type': 'application/json' };

    const getToken = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

    function getApiHeaders(extra = {}) {
        const headers = { ...window.API_HEADERS, ...extra };
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    // Header tĩnh cho fetch cũ; được tạo lại ở mỗi lần tải trang.
    if (getToken()) window.API_HEADERS.Authorization = `Bearer ${getToken()}`;

    class ApiError extends Error {
        constructor(message, status = 0, code = 'request_failed', payload = {}) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.code = code;
            this.payload = payload;
        }
    }

    let currentUser = null;
    let currentUserRequest = null;

    function clearSession() {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
        // Dọn dữ liệu xác thực không an toàn từ phiên bản cũ.
        localStorage.removeItem('username');
        localStorage.removeItem('isLoggedIn');
        currentUser = null;
        currentUserRequest = null;
        delete window.API_HEADERS.Authorization;
        window.dispatchEvent(new CustomEvent('badminton:auth-changed', { detail: { user: null } }));
    }

    function saveSession(token, remember = false) {
        clearSession();
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(TOKEN_KEY, token);
        window.API_HEADERS.Authorization = `Bearer ${token}`;
    }

    async function request(path, options = {}) {
        const { auth = true, json, headers, ...fetchOptions } = options;
        const finalHeaders = auth ? getApiHeaders(headers) : { 'Content-Type': 'application/json', ...(headers || {}) };
        const response = await fetch(`${window.API_BASE}${path}`, {
            ...fetchOptions,
            headers: finalHeaders,
            body: json === undefined ? fetchOptions.body : JSON.stringify(json)
        });
        let payload = {};
        try {
            payload = await response.json();
        } catch (_) {
            payload = {};
        }
        if (!response.ok || payload.success === false) {
            if (response.status === 401 && auth) clearSession();
            throw new ApiError(
                payload.message || 'Không thể xử lý yêu cầu lúc này.',
                response.status,
                payload.code || 'request_failed',
                payload
            );
        }
        return payload;
    }

    async function me(force = false) {
        if (!getToken()) return null;
        if (currentUser && !force) return currentUser;
        if (currentUserRequest && !force) return currentUserRequest;
        currentUserRequest = request('/api/me')
            .then((data) => {
                currentUser = data.user || data;
                window.dispatchEvent(new CustomEvent('badminton:auth-changed', { detail: { user: currentUser } }));
                return currentUser;
            })
            .catch((error) => {
                if (error.status !== 401) console.warn('Không thể tải hồ sơ:', error.message);
                return null;
            })
            .finally(() => { currentUserRequest = null; });
        return currentUserRequest;
    }

    function safeNext(defaultPage = 'canhan.html') {
        const next = new URLSearchParams(window.location.search).get('next');
        if (!next || /^(?:[a-z]+:)?\/\//i.test(next) || next.includes('\\')) return defaultPage;
        try {
            const url = new URL(next, window.location.href);
            return url.origin === window.location.origin ? `${url.pathname.split('/').pop() || defaultPage}${url.search}${url.hash}` : defaultPage;
        } catch (_) {
            return defaultPage;
        }
    }

    async function login(identity, password, remember = false) {
        const data = await request('/api/dang-nhap', {
            method: 'POST',
            auth: false,
            json: { username: identity, password }
        });
        saveSession(data.access_token, remember);
        currentUser = data.user || null;
        return data;
    }

    async function logout(redirect = true) {
        try {
            if (getToken()) await request('/api/dang-xuat', { method: 'POST' });
        } catch (_) {
            // Vẫn xóa phiên phía trình duyệt nếu backend đang ngoại tuyến.
        } finally {
            clearSession();
        }
        if (redirect) window.location.assign('trangchu.html');
    }

    async function requireAuth() {
        const user = await me();
        if (user) return user;
        const next = encodeURIComponent(`${window.location.pathname.split('/').pop()}${window.location.search}`);
        window.location.replace(`dangnhap.html?next=${next}`);
        return null;
    }

    async function requireAdmin() {
        const user = await requireAuth();
        if (!user) return null;
        if (!['admin', 'superadmin'].includes(user.role)) {
            window.location.replace('canhan.html?notice=admin-only');
            return null;
        }
        return user;
    }

    function safeUrl(value, fallback = '') {
        try {
            const url = new URL(String(value || ''), window.location.href);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fallback;
            return url.href;
        } catch (_) {
            return fallback;
        }
    }

    window.BadmintonAuth = {
        ApiError,
        request,
        login,
        logout,
        me,
        requireAuth,
        requireAdmin,
        getToken,
        getApiHeaders,
        clearSession,
        saveSession,
        safeNext,
        safeUrl
    };

    function showToast(message, type = 'info', duration = 3800) {
        let region = document.getElementById('toast-container');
        if (!region) {
            region = document.createElement('div');
            region.id = 'toast-container';
            region.className = 'bs-toast-region';
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('aria-atomic', 'true');
            document.body.appendChild(region);
        }
        const toast = document.createElement('div');
        toast.className = `bs-toast bs-toast--${['success', 'error', 'warning'].includes(type) ? type : 'info'}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        const icon = document.createElement('span');
        icon.className = 'bs-toast__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = { success: '✓', error: '!', warning: '!', info: 'i' }[type] || 'i';
        const text = document.createElement('span');
        text.textContent = String(message || 'Đã cập nhật.');
        toast.append(icon, text);
        region.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 240);
        }, duration);
    }

    function injectSearchSuggestionStyles() {
        if (document.getElementById('bs-search-suggestion-styles')) return;
        const style = document.createElement('style');
        style.id = 'bs-search-suggestion-styles';
        style.textContent = `
            .bs-search,.site-search{position:relative}
            .bs-search{overflow:visible!important}
            .bs-search-suggestions{position:absolute;z-index:1200;top:calc(100% + 9px);left:50%;width:min(680px,calc(100vw - 28px));max-height:min(72vh,620px);overflow:auto;transform:translateX(-50%);border:1px solid rgba(213,77,42,.22);border-radius:18px;background:#fff;box-shadow:0 24px 60px rgba(74,25,13,.22);color:#2d1914;text-align:left;overscroll-behavior:contain}
            .bs-search-suggestions[hidden]{display:none!important}
            .bs-search-suggestion{width:100%;min-height:92px;display:grid;grid-template-columns:76px minmax(0,1fr) minmax(105px,auto);align-items:center;gap:14px;padding:10px 14px;border:0;border-bottom:1px solid #f2ddd5;background:#fff;color:inherit;text-decoration:none;cursor:pointer}
            .bs-search-suggestion:last-of-type{border-bottom:0}
            .bs-search-suggestion:hover,.bs-search-suggestion.is-active{background:#fff2ec}
            .bs-search-suggestion img{width:76px;height:70px;padding:5px;border:1px solid #f4e3dc;border-radius:13px;background:#fff;object-fit:contain}
            .bs-search-suggestion__copy{min-width:0;display:grid;gap:5px}
            .bs-search-suggestion__copy strong{display:-webkit-box;overflow:hidden;color:#2d1914;font-size:14px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
            .bs-search-suggestion__copy small{color:#88645a;font-size:10px;font-weight:750;text-transform:uppercase}
            .bs-search-suggestion__meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:#7c5b52;font-size:10px}.bs-search-suggestion__meta b{padding:3px 6px;border-radius:999px;background:#eef8f2;color:#17844c}.bs-search-suggestion__meta b.is-out{background:#fff0ec;color:#cf321d}
            .bs-search-suggestion__price{display:grid;justify-items:end;gap:3px;color:#d52f16;font-size:13px;font-weight:850;white-space:nowrap}.bs-search-suggestion__price del{color:#9a7970;font-size:10px;font-weight:650}.bs-search-suggestion__price em{padding:3px 6px;border-radius:999px;background:#ffe6dc;color:#cf321d;font-size:9px;font-style:normal}
            .bs-search-suggestions__status,.bs-search-suggestions__all{display:block;padding:13px 15px;color:#79584f;font-size:12px;text-align:center}
            .bs-search-suggestions__all{border-top:1px solid #f2ddd5;background:#fff9f6;color:#c72d16;font-weight:800;text-decoration:none}
            .bs-search-suggestions__all:hover{background:#ffede5}
            html[data-theme="dark"] .bs-search-suggestions,html[data-theme="dark"] .bs-search-suggestion{border-color:#56352d;background:#241713;color:#fff4ef}
            html[data-theme="dark"] .bs-search-suggestion:hover,html[data-theme="dark"] .bs-search-suggestion.is-active,html[data-theme="dark"] .bs-search-suggestions__all{background:#38211a}
            html[data-theme="dark"] .bs-search-suggestion__copy strong{color:#fff4ef}
            html[data-theme="dark"] .bs-search-suggestion__copy small,html[data-theme="dark"] .bs-search-suggestions__status{color:#c9aaa0}
            @media(max-width:680px){.bs-search-suggestion{grid-template-columns:58px minmax(0,1fr);min-height:78px;padding:9px 10px}.bs-search-suggestion img{width:58px;height:58px}.bs-search-suggestion__price{grid-column:2;justify-items:start;display:flex;align-items:center;gap:7px}.bs-search-suggestions{max-height:min(68vh,500px)}}
        `;
        document.head.appendChild(style);
    }

    function setupSearchSuggestions() {
        injectSearchSuggestionStyles();
        document.querySelectorAll('.bs-search, .site-search').forEach((form) => {
            if (form.dataset.suggestionsReady === 'true') return;
            const input = form.querySelector('input[name="q"], input[type="search"]');
            if (!input) return;
            form.dataset.suggestionsReady = 'true';
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('aria-autocomplete', 'list');
            input.setAttribute('aria-expanded', 'false');

            const panel = document.createElement('div');
            const panelId = `search-suggestions-${Math.random().toString(36).slice(2, 9)}`;
            panel.id = panelId;
            panel.className = 'bs-search-suggestions';
            panel.setAttribute('role', 'listbox');
            panel.hidden = true;
            input.setAttribute('aria-controls', panelId);
            form.appendChild(panel);

            let timer = 0;
            let controller = null;
            let activeIndex = -1;

            const close = () => {
                panel.hidden = true;
                input.setAttribute('aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
                activeIndex = -1;
            };
            const open = () => {
                panel.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            };
            const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
            const showStatus = (message) => {
                panel.replaceChildren();
                const status = document.createElement('span');
                status.className = 'bs-search-suggestions__status';
                status.textContent = message;
                panel.appendChild(status);
                open();
            };

            const render = (products, keyword) => {
                panel.replaceChildren();
                activeIndex = -1;
                if (!products.length) {
                    showStatus('Không tìm thấy sản phẩm phù hợp.');
                    return;
                }
                products.forEach((product, index) => {
                    const link = document.createElement('a');
                    link.className = 'bs-search-suggestion';
                    link.href = `chitiet.html?id=${encodeURIComponent(product.MaSP)}`;
                    link.id = `${panelId}-option-${index}`;
                    link.setAttribute('role', 'option');

                    const image = document.createElement('img');
                    image.src = product.HinhAnh || 'HA/cc-removebg-preview.png';
                    image.alt = '';
                    image.loading = 'lazy';
                    const copy = document.createElement('span');
                    copy.className = 'bs-search-suggestion__copy';
                    const name = document.createElement('strong');
                    name.textContent = product.TenSP || 'Sản phẩm';
                    const category = document.createElement('small');
                    category.textContent = [product.ThuongHieu, product.TenDM].filter(Boolean).join(' · ') || 'Sản phẩm chính hãng';
                    const meta = document.createElement('span');
                    meta.className = 'bs-search-suggestion__meta';
                    const stock = document.createElement('b');
                    const stockNumber = Number(product.TonKho || 0);
                    stock.className = stockNumber > 0 ? '' : 'is-out';
                    stock.textContent = stockNumber > 0 ? `Còn ${stockNumber} sản phẩm` : 'Tạm hết hàng';
                    const relevance = document.createElement('span');
                    relevance.textContent = Number(product.DoPhuHop) < .9 ? 'Kết quả gần đúng' : 'Phù hợp cao';
                    meta.append(stock, relevance);
                    copy.append(name, category, meta);
                    const price = document.createElement('span');
                    price.className = 'bs-search-suggestion__price';
                    const currentPrice = document.createElement('span');
                    currentPrice.textContent = money(product.GiaBan);
                    price.appendChild(currentPrice);
                    if (Number(product.GiaGoc) > Number(product.GiaBan)) {
                        const original = document.createElement('del');
                        original.textContent = money(product.GiaGoc);
                        const discount = document.createElement('em');
                        discount.textContent = `-${Math.round((1 - Number(product.GiaBan) / Number(product.GiaGoc)) * 100)}%`;
                        price.append(original, discount);
                    }
                    link.append(image, copy, price);
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        window.location.assign(link.href);
                    });
                    panel.appendChild(link);
                });
                const all = document.createElement('a');
                all.className = 'bs-search-suggestions__all';
                all.href = `sanpham.html?q=${encodeURIComponent(keyword)}`;
                all.textContent = `Xem tất cả kết quả cho “${keyword}” →`;
                panel.appendChild(all);
                open();
            };

            const load = async () => {
                const keyword = input.value.trim();
                if (keyword.length < 2) { close(); return; }
                controller?.abort();
                controller = new AbortController();
                showStatus('Đang tìm sản phẩm…');
                try {
                    const response = await fetch(`${window.API_BASE}/api/tim-kiem?q=${encodeURIComponent(keyword)}&limit=10&sap_xep=phu_hop`, { signal: controller.signal });
                    if (!response.ok) throw new Error('search_failed');
                    const data = await response.json();
                    render(data.success && Array.isArray(data.products) ? data.products : [], keyword);
                } catch (error) {
                    if (error.name !== 'AbortError') showStatus('Chưa thể tải gợi ý. Nhấn Enter để tìm kiếm.');
                }
            };

            input.addEventListener('input', () => {
                window.clearTimeout(timer);
                timer = window.setTimeout(load, 230);
            });
            input.addEventListener('focus', () => {
                if (input.value.trim().length >= 2 && panel.childElementCount) open();
            });
            input.addEventListener('keydown', (event) => {
                const options = Array.from(panel.querySelectorAll('.bs-search-suggestion'));
                if (event.key === 'Escape') { close(); return; }
                if (panel.hidden || !options.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
                if (event.key === 'Enter' && activeIndex >= 0) {
                    event.preventDefault();
                    window.location.assign(options[activeIndex].href);
                    return;
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    options[activeIndex]?.classList.remove('is-active');
                    activeIndex = event.key === 'ArrowDown'
                        ? (activeIndex + 1) % options.length
                        : (activeIndex - 1 + options.length) % options.length;
                    options[activeIndex].classList.add('is-active');
                    options[activeIndex].scrollIntoView({ block: 'nearest' });
                    input.setAttribute('aria-activedescendant', options[activeIndex].id);
                }
            });
            document.addEventListener('pointerdown', (event) => {
                if (!form.contains(event.target)) close();
            });
        });
    }

    function searchProduct() {
        const input = document.querySelector('.bs-search__input, .search-input');
        const keyword = input?.value.trim() || '';
        if (!keyword) {
            showToast('Hãy nhập tên sản phẩm bạn muốn tìm.', 'warning');
            input?.focus();
            return;
        }
        window.location.assign(`sanpham.html?q=${encodeURIComponent(keyword)}`);
    }

    async function capNhatBadgeGioHang() {
        if (!getToken()) return;
        try {
            const data = await request('/api/gio-hang', { method: 'POST', json: {} });
            const count = Array.isArray(data.items)
                ? data.items.reduce((sum, item) => sum + Number(item.SoLuong || item.so_luong || 1), 0)
                : 0;
            document.querySelectorAll('[data-cart-count], #cart-badge-popup, #floating-cart-count').forEach((badge) => {
                badge.textContent = String(count);
                badge.hidden = count < 1;
            });
        } catch (_) {
            // Badge không phải dữ liệu thiết yếu.
        }
    }

    async function themVaoGioHang(maSP, soLuong = 1) {
        if (!getToken()) {
            showToast('Vui lòng đăng nhập để thêm sản phẩm.', 'warning');
            window.setTimeout(() => {
                const next = encodeURIComponent(`${location.pathname.split('/').pop()}${location.search}`);
                location.assign(`dangnhap.html?next=${next}`);
            }, 700);
            return false;
        }
        try {
            const data = await request('/api/gio-hang/them', {
                method: 'POST',
                json: { ma_san_pham: Number(maSP), so_luong: Number(soLuong) || 1 }
            });
            showToast(data.message || 'Đã thêm vào giỏ hàng.', 'success');
            capNhatBadgeGioHang();
            return true;
        } catch (error) {
            showToast(error.message, 'error');
            return false;
        }
    }

    async function muaNgay(maSP, soLuong = 1) {
        if (await themVaoGioHang(maSP, soLuong)) window.location.assign('giohang.html');
    }

    function setTheme(theme) {
        const normalized = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = normalized;
        document.documentElement.style.colorScheme = normalized;
        localStorage.setItem(THEME_KEY, normalized);
        document.querySelectorAll('[data-theme-icon]').forEach((node) => {
            node.textContent = normalized === 'dark' ? '☀' : '☾';
        });
        document.querySelectorAll('[data-theme-label]').forEach((node) => {
            node.textContent = normalized === 'dark' ? 'Bật giao diện sáng' : 'Bật giao diện tối';
        });
    }

    function toggleTheme() {
        setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }

    function injectShellStyles() {
        if (document.getElementById('bs-shell-styles')) return;
        const style = document.createElement('style');
        style.id = 'bs-shell-styles';
        style.textContent = `
            :root{--bs-red:#e9381b;--bs-red-deep:#b82410;--bs-orange:#ff7a1a;--bs-ink:#2d1712;--bs-muted:#735b55;--bs-bg:#fff8f4;--bs-card:#fff;--bs-line:#f0d8cf;--bs-shadow:0 16px 44px rgba(102,31,13,.12)}
            :root[data-theme="dark"]{--bs-ink:#fff5f0;--bs-muted:#d9bcb2;--bs-bg:#1a0e0a;--bs-card:#28130d;--bs-line:#533024;--bs-shadow:0 18px 48px rgba(0,0,0,.35)}
            .bs-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
            .header:has(.bs-header){width:100%!important;height:auto!important;min-height:0!important;float:none!important;background:var(--bs-card)!important;border-bottom:1px solid var(--bs-line)!important;box-shadow:none!important;position:relative!important;z-index:1000!important}
            .bs-header{max-width:1240px;margin:auto;min-height:72px;padding:10px 22px;display:grid;grid-template-columns:auto minmax(220px,1fr) auto;align-items:center;gap:24px;color:var(--bs-ink);font-family:"Segoe UI Variable Text","Segoe UI",Tahoma,Arial,sans-serif}
            .bs-brand{display:flex;align-items:center;gap:10px;color:var(--bs-ink)!important;text-decoration:none!important;white-space:nowrap}.bs-brand__mark{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;color:#fff;font-size:18px;font-weight:900;background:linear-gradient(135deg,var(--bs-red),var(--bs-orange));box-shadow:0 9px 24px rgba(233,56,27,.25)}.bs-brand__text{display:grid;line-height:1}.bs-brand__text strong{font-size:15px;letter-spacing:.04em}.bs-brand__text small{font-size:10px;letter-spacing:.16em;color:var(--bs-red);margin-top:5px;font-weight:800}
            .bs-search{height:44px;display:flex;border:1px solid var(--bs-line);background:var(--bs-bg);border-radius:14px;overflow:hidden;transition:.2s}.bs-search:focus-within{border-color:var(--bs-orange);box-shadow:0 0 0 4px rgba(255,122,26,.12)}.bs-search__input{flex:1;min-width:0;border:0!important;outline:0!important;background:transparent!important;color:var(--bs-ink)!important;padding:0 16px!important;font:inherit!important;height:100%!important}.bs-search__button{width:48px;border:0;background:transparent;color:var(--bs-red);cursor:pointer;display:grid;place-items:center}.bs-search__button:hover{background:rgba(233,56,27,.08)}
            .bs-header__actions{display:flex;align-items:center;gap:6px}.bs-icon-button{position:relative;width:42px;height:42px;display:grid;place-items:center;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--bs-ink);cursor:pointer;text-decoration:none!important;font:inherit}.bs-icon-button:hover,.bs-icon-button:focus-visible{background:var(--bs-bg);border-color:var(--bs-line);outline:0}.bs-icon-button svg{width:21px;height:21px}.bs-cart-count{position:absolute;right:-2px;top:-3px;min-width:18px;height:18px;border-radius:20px;padding:0 4px;display:grid;place-items:center;background:var(--bs-red);color:#fff;font-size:10px;font-weight:800;border:2px solid var(--bs-card)}.bs-cart-count[hidden]{display:none}
            .bs-user{position:relative}.bs-user summary{list-style:none}.bs-user summary::-webkit-details-marker{display:none}.bs-user-menu{position:absolute;right:0;top:calc(100% + 10px);width:260px;padding:10px;background:var(--bs-card);border:1px solid var(--bs-line);border-radius:18px;box-shadow:var(--bs-shadow);z-index:1200}.bs-user-menu__identity{padding:10px 12px 12px;border-bottom:1px solid var(--bs-line);margin-bottom:6px}.bs-user-menu__identity strong,.bs-user-menu__identity span{display:block;overflow:hidden;text-overflow:ellipsis}.bs-user-menu__identity span{font-size:12px;color:var(--bs-muted);margin-top:3px}.bs-user-menu a,.bs-user-menu button{width:100%;min-height:40px;display:flex;align-items:center;gap:9px;padding:8px 11px;border:0;border-radius:10px;background:transparent;color:var(--bs-ink)!important;text-decoration:none!important;font:600 13px/1.2 inherit;cursor:pointer;text-align:left}.bs-user-menu a:hover,.bs-user-menu button:hover{background:var(--bs-bg);color:var(--bs-red)!important}.bs-user-menu .bs-user-menu__danger{color:#c62d19!important}
            #menu:has(.bs-nav){width:100%!important;height:auto!important;float:none!important;background:linear-gradient(100deg,var(--bs-red-deep),var(--bs-red) 55%,var(--bs-orange))!important;position:sticky!important;top:0!important;z-index:950!important;margin:0!important;padding:0!important;box-shadow:0 10px 28px rgba(80,21,8,.18)!important}
            .bs-nav{max-width:1240px;margin:auto;display:flex;align-items:center;padding:0 22px;font-family:"Segoe UI Variable Text","Segoe UI",Tahoma,Arial,sans-serif}
            .bs-nav__links{display:flex;align-items:center;gap:4px;list-style:none!important;margin:0!important;padding:5px 0!important}
            .bs-nav__links>li{float:none!important;position:relative!important;margin:0!important;padding:0!important}
            .bs-nav__links>li>a,.bs-nav__products>details>summary{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px;min-height:42px!important;padding:0 15px!important;border:1px solid transparent!important;border-radius:11px;color:#fff!important;text-decoration:none!important;font-size:12px!important;font-weight:750!important;line-height:1!important;letter-spacing:.025em!important;background:transparent!important;cursor:pointer;list-style:none}
            .bs-nav__products>details>summary::-webkit-details-marker{display:none}.bs-nav__products>details>summary::marker{content:""}.bs-nav__products>details>summary::after{content:"";width:6px;height:6px;margin-top:-3px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:.2s}.bs-nav__products>details[open]>summary::after{margin-top:3px;transform:rotate(225deg)}
            .bs-nav__links>li>a:hover,.bs-nav__links>li>a[aria-current="page"],.bs-nav__products>details[open]>summary,.bs-nav__products>details>summary[aria-current="page"]{background:rgba(255,255,255,.17)!important;border-color:rgba(255,255,255,.16)!important;color:#fff!important}
            .bs-nav__catalog{position:absolute;left:0;top:calc(100% + 8px);width:min(760px,calc(100vw - 32px));padding:18px;border:1px solid var(--bs-line);border-radius:20px;background:var(--bs-card);color:var(--bs-ink);box-shadow:var(--bs-shadow);z-index:1200}
            .bs-nav__catalog-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px;padding:0 4px 12px;border-bottom:1px solid var(--bs-line)}.bs-nav__catalog-head strong{font-size:13px}.bs-nav__catalog-head a,#menu .bs-nav__catalog-head a{display:inline-flex!important;min-height:auto!important;height:auto!important;padding:4px 0!important;background:transparent!important;color:var(--bs-red)!important;font-size:11px!important;font-weight:800!important;text-decoration:none!important}
            .bs-nav__catalog-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.bs-nav__catalog-grid a,#menu .bs-nav__catalog-grid a{min-height:50px!important;height:auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:10px 12px!important;border:1px solid transparent!important;border-radius:12px!important;background:var(--bs-bg)!important;color:var(--bs-ink)!important;font-size:12px!important;font-weight:700!important;line-height:1.35!important;text-decoration:none!important;text-transform:none!important;white-space:normal!important;transition:all 0.18s ease}.bs-nav__catalog-grid a span:first-child,#menu .bs-nav__catalog-grid a span:first-child{display:inline!important;color:inherit!important;font-size:inherit!important;font-weight:inherit!important;opacity:1!important;visibility:visible!important}.bs-nav__catalog-grid a:hover,.bs-nav__catalog-grid a[aria-current="page"],#menu .bs-nav__catalog-grid a:hover,#menu .bs-nav__catalog-grid a[aria-current="page"]{border-color:var(--bs-line)!important;background:color-mix(in srgb,var(--bs-bg) 65%,var(--bs-orange))!important;color:var(--bs-red)!important;transform:translateY(-1px)}
            .bs-cat-badge{font-size:9px;padding:2px 6px;border-radius:8px;background:var(--bs-red);color:#fff;font-weight:800;text-transform:uppercase}
            .bs-mobile-toggle{display:none;margin-left:auto;border:1px solid rgba(255,255,255,.36);border-radius:10px;background:transparent;color:#fff;padding:8px 12px;font-weight:800}
            #cuoitrang:has(.bs-footer){width:100%!important;height:auto!important;float:none!important;margin:0!important;background:#24100b!important;color:#ffece4!important;font-family:"Segoe UI Variable Text","Segoe UI",Tahoma,Arial,sans-serif}.bs-footer{padding:48px 22px 20px}.bs-footer__grid{max-width:1200px;margin:auto;display:grid;grid-template-columns:1.35fr repeat(3,1fr);gap:38px}.bs-footer h2,.bs-footer h3{color:#fff!important;margin:0 0 15px!important}.bs-footer h2{font-size:19px}.bs-footer h3{font-size:13px;letter-spacing:.08em;text-transform:uppercase}.bs-footer p{color:#d8bdb4!important;line-height:1.7!important;font-size:13px!important}.bs-footer ul{padding:0!important;margin:0!important;list-style:none!important}.bs-footer li{margin:9px 0!important}.bs-footer a{color:#e9d1c8!important;text-decoration:none!important;font-size:13px!important}.bs-footer a:hover{color:#ff9560!important}.bs-footer__bottom{max-width:1200px;margin:34px auto 0;padding-top:18px;border-top:1px solid rgba(255,255,255,.12);display:flex;justify-content:space-between;gap:20px;font-size:12px;color:#b99c92}.bs-footer__dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#58bd74;margin-right:7px}
            .bs-toast-region{position:fixed;right:18px;top:18px;z-index:10000;display:grid;gap:10px;width:min(360px,calc(100vw - 36px));pointer-events:none}.bs-toast{display:grid;grid-template-columns:26px 1fr;align-items:center;gap:10px;padding:13px 15px;background:var(--bs-card);color:var(--bs-ink);border:1px solid var(--bs-line);border-left:4px solid #4188d4;border-radius:13px;box-shadow:var(--bs-shadow);font:600 13px/1.45 "Segoe UI Variable Text","Segoe UI",Tahoma,Arial,sans-serif;opacity:0;transform:translateY(-10px);transition:.22s}.bs-toast.is-visible{opacity:1;transform:none}.bs-toast--success{border-left-color:#27945c}.bs-toast--error{border-left-color:#d82d1a}.bs-toast--warning{border-left-color:#ef8c19}.bs-toast__icon{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--bs-bg);font-weight:900}
            /* Styling cho Chi tiết sản phẩm & Breadcrumb */
            .bs-breadcrumb{max-width:1320px;margin:18px auto 0;padding:12px 20px;border-radius:14px;background:var(--bs-card);border:1px solid var(--bs-line);font-size:13px;color:var(--bs-muted)}.bs-breadcrumb__inner{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bs-breadcrumb__item{color:var(--bs-ink)!important;text-decoration:none!important;font-weight:600}.bs-breadcrumb__item:hover{color:var(--bs-red)!important}.bs-breadcrumb__item--active{color:var(--bs-red)!important;font-weight:750}.bs-breadcrumb__sep{color:var(--bs-muted);font-size:12px}
            .bs-product-meta{display:flex;align-items:center;gap:12px;margin:12px 0 16px;font-size:13px;color:var(--bs-muted);flex-wrap:wrap}.bs-rating-stars{display:flex;align-items:center;gap:4px;color:var(--bs-ink);font-weight:750}.bs-review-count{color:var(--bs-muted);font-weight:400;font-size:12px}.bs-stock-badge{color:#27945c;font-weight:750;background:rgba(39,148,92,.1);padding:3px 10px;border-radius:20px;font-size:12px}
            .bs-price-card{display:flex;align-items:baseline;gap:14px;margin:16px 0 20px;flex-wrap:wrap;padding:16px 20px;background:linear-gradient(135deg,rgba(233,56,27,.05),rgba(255,122,26,.08));border-radius:16px;border:1px solid rgba(233,56,27,.15)}.bs-price-main{font-size:2rem;font-weight:900;color:var(--bs-red);letter-spacing:-.02em}.bs-price-orig{font-size:1.1rem;color:var(--bs-muted);text-decoration:line-through;font-weight:600}.bs-save-badge{background:var(--bs-red);color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px;text-transform:uppercase}
            .bs-spec-picker{margin:20px 0;display:grid;gap:16px}.bs-picker-group label{display:block;font-size:13px;font-weight:750;color:var(--bs-ink);margin-bottom:8px}.bs-chips{display:flex;gap:8px;flex-wrap:wrap}.bs-chip{padding:8px 14px;border:1px solid var(--bs-line);border-radius:12px;background:var(--bs-bg);color:var(--bs-ink);font-size:12px;font-weight:650;cursor:pointer;transition:.18s}.bs-chip:hover,.bs-chip.active{border-color:var(--bs-red);background:var(--bs-red);color:#fff;box-shadow:0 4px 14px rgba(233,56,27,.25)}.bs-qty-stepper{display:inline-flex;align-items:center;border:1px solid var(--bs-line);border-radius:12px;background:var(--bs-card);overflow:hidden}.bs-qty-btn{width:38px;height:38px;border:0;background:transparent;color:var(--bs-ink);font-size:16px;font-weight:800;cursor:pointer}.bs-qty-btn:hover{background:var(--bs-bg)}.bs-qty-input{width:46px;height:38px;border:0!important;text-align:center;font-weight:800;font-size:14px;color:var(--bs-ink)}
            .bs-detail-tabs-section{margin-top:38px;padding-top:24px;border-top:1px solid var(--bs-line)}.bs-detail-tabs{display:flex;gap:8px;border-bottom:2px solid var(--bs-line);margin-bottom:24px;overflow-x:auto}.bs-tab-btn{padding:12px 20px;border:0;background:transparent;color:var(--bs-muted);font-size:14px;font-weight:750;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:.2s}.bs-tab-btn:hover,.bs-tab-btn.active{color:var(--bs-red);border-bottom-color:var(--bs-red)}.bs-tab-content{display:none;padding:10px 4px;line-height:1.75;color:var(--bs-ink)}.bs-tab-content.active{display:block}.bs-specs-table{width:100%;border-collapse:collapse;margin-top:12px}.bs-specs-table td{padding:12px 16px;border-bottom:1px solid var(--bs-line);font-size:13px}.bs-specs-table td:first-child{font-weight:750;width:30%;color:var(--bs-muted);background:var(--bs-bg);border-radius:8px 0 0 8px}.bs-warranty-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:16px}.bs-warranty-card{padding:20px;border:1px solid var(--bs-line);border-radius:16px;background:var(--bs-bg);text-align:left}.bs-warranty-icon{font-size:28px;display:block;margin-bottom:10px}.bs-reviews-overview{display:flex;gap:32px;align-items:center;padding:24px;background:var(--bs-bg);border-radius:20px;margin-bottom:24px;flex-wrap:wrap}.bs-reviews-score{text-align:center}.bs-reviews-score strong{font-size:3rem;line-height:1;color:var(--bs-red)}.bs-stars{color:#ffb400;font-size:18px;margin:4px 0}.bs-reviews-bars{flex:1;min-width:240px;display:grid;gap:6px}.bs-bar-row{display:flex;align-items:center;gap:10px;font-size:12px}.bs-bar-track{flex:1;height:8px;background:var(--bs-line);border-radius:10px;overflow:hidden}.bs-bar-fill{height:100%;background:var(--bs-red);border-radius:10px}.bs-review-item{padding:18px 0;border-bottom:1px solid var(--bs-line)}.bs-review-user{display:flex;align-items:center;gap:10px;margin-bottom:6px}.bs-verified{font-size:11px;color:#27945c;font-weight:750;background:rgba(39,148,92,.1);padding:2px 8px;border-radius:10px}.bs-review-date{font-size:11px;color:var(--bs-muted);margin-top:6px;display:block}
            @media(max-width:820px){.bs-header{grid-template-columns:1fr auto;gap:8px;padding:9px 14px}.bs-brand__text{display:none}.bs-search{grid-row:2;grid-column:1/-1}.bs-nav{padding:0 14px;display:block}.bs-mobile-toggle{display:block;margin:7px 0 7px auto}.bs-nav__links{display:none;flex-direction:column;align-items:stretch;padding-bottom:9px!important}.bs-nav.is-open .bs-nav__links{display:flex}.bs-nav__links>li{width:100%}.bs-nav__links>li>a,.bs-nav__products>details>summary{min-height:42px!important;border-radius:9px;justify-content:space-between!important}.bs-nav__catalog{position:static;width:100%;margin:5px 0 9px;padding:12px;box-shadow:none}.bs-nav__catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bs-nav__catalog-grid a{min-height:42px!important}.bs-footer__grid{grid-template-columns:1fr 1fr}.bs-footer__bottom{display:block}.bs-footer__bottom span{display:block;margin-top:8px}}
            @media(max-width:520px){.bs-header__actions .bs-theme-action{display:none}.bs-footer__grid{grid-template-columns:1fr}.bs-footer{padding-top:36px}.bs-user-menu{position:fixed;right:12px;top:70px;width:calc(100vw - 24px)}}
            @media(prefers-reduced-motion:reduce){.bs-toast,.bs-search{transition:none!important}}
        `;
        document.head.appendChild(style);
    }

    const icons = {
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path></svg>',
        cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20 8H7"></path><circle cx="10" cy="20" r="1"></circle><circle cx="18" cy="20" r="1"></circle></svg>',
        user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>'
    };

    function enhanceDetailPage() {
        const detailBox = document.querySelector('.trung-bay-san-pham') || document.querySelector('.container-san-pham');
        if (!detailBox) return;

        // 1. Dynamic Breadcrumbs
        if (!document.querySelector('.bs-breadcrumb')) {
            const pageName = decodeURIComponent(window.location.pathname.split('/').pop() || '');
            let catName = 'Vợt Cầu Lông';
            let catLink = 'sanpham.html?danh_muc=1';
            if (pageName.includes('giày') || pageName.startsWith('b ')) { catName = 'Giày Cầu Lông'; catLink = 'sanpham.html?danh_muc=2'; }
            else if (pageName.includes('áo') || pageName.startsWith('c ')) { catName = 'Áo Cầu Lông'; catLink = 'sanpham.html?danh_muc=3'; }
            else if (pageName.includes('váy') || pageName.startsWith('d ')) { catName = 'Váy Cầu Lông'; catLink = 'sanpham.html?danh_muc=4'; }
            else if (pageName.includes('phụ kiện') || pageName.startsWith('e ')) { catName = 'Phụ Kiện Cầu Lông'; catLink = 'sanpham.html?danh_muc=8'; }
            else if (pageName.includes('quần') || pageName.startsWith('f ')) { catName = 'Quần Cầu Lông'; catLink = 'sanpham.html?danh_muc=5'; }
            else if (pageName.includes('túi') || pageName.startsWith('g ')) { catName = 'Túi Vợt Cầu Lông'; catLink = 'sanpham.html?danh_muc=6'; }
            else if (pageName.includes('balo') || pageName.startsWith('h ')) { catName = 'Balo Cầu Lông'; catLink = 'sanpham.html?danh_muc=7'; }

            const titleEl = detailBox.querySelector('h2');
            const prodTitle = titleEl ? titleEl.textContent.trim() : 'Chi tiết sản phẩm';

            const breadcrumbNode = document.createElement('nav');
            breadcrumbNode.className = 'bs-breadcrumb';
            breadcrumbNode.setAttribute('aria-label', 'Đường dẫn');
            breadcrumbNode.innerHTML = `
                <div class="bs-breadcrumb__inner">
                    <a href="trangchu.html" class="bs-breadcrumb__item">🏠 Trang chủ</a>
                    <span class="bs-breadcrumb__sep">›</span>
                    <a href="sanpham.html" class="bs-breadcrumb__item">Sản phẩm</a>
                    <span class="bs-breadcrumb__sep">›</span>
                    <a href="${catLink}" class="bs-breadcrumb__item">${catName}</a>
                    <span class="bs-breadcrumb__sep">›</span>
                    <span class="bs-breadcrumb__item bs-breadcrumb__item--active">${prodTitle}</span>
                </div>
            `;
            detailBox.parentNode.insertBefore(breadcrumbNode, detailBox);
        }

        // 2. Product Meta & Dynamic Price Display
        const infoContainer = detailBox.querySelector('.thong-tin-san-pham-container');
        if (infoContainer) {
            if (!infoContainer.querySelector('.bs-product-meta')) {
                const metaDiv = document.createElement('div');
                metaDiv.className = 'bs-product-meta';
                metaDiv.innerHTML = `
                    <div class="bs-rating-stars">
                        <span style="color:#ffb400">★★★★★</span>
                        <strong>4.9/5</strong>
                        <span class="bs-review-count">(128 Đánh giá)</span>
                    </div>
                    <span class="bs-meta-divider">•</span>
                    <span class="bs-sold-count">Đã bán 350+</span>
                    <span class="bs-meta-divider">•</span>
                    <span class="bs-stock-badge">🟢 Còn hàng - Giao hỏa tốc</span>
                `;
                const h2 = infoContainer.querySelector('h2');
                if (h2 && h2.nextSibling) {
                    infoContainer.insertBefore(metaDiv, h2.nextSibling);
                }
            }

            const priceP = infoContainer.querySelector('p[style*="color:red"], p > b');
            if (priceP && !infoContainer.querySelector('.bs-price-card')) {
                const priceText = priceP.textContent.trim();
                const numMatch = priceText.match(/[\d.]+/);
                if (numMatch) {
                    const numVal = parseInt(numMatch[0].replace(/\./g, ''), 10);
                    if (numVal > 0) {
                        const origVal = Math.round(numVal * 1.15 / 10000) * 10000;
                        const saveVal = origVal - numVal;
                        const priceCard = document.createElement('div');
                        priceCard.className = 'bs-price-card';
                        priceCard.innerHTML = `
                            <div class="bs-price-main">${priceText}</div>
                            <div class="bs-price-orig">${origVal.toLocaleString('vi-VN')} ₫</div>
                            <span class="bs-save-badge">Tiết kiệm ${saveVal.toLocaleString('vi-VN')} ₫ (-13%)</span>
                        `;
                        priceP.replaceWith(priceCard);
                    }
                }
            }

            // Spec Option Picker & Stepper Quantity
            if (!infoContainer.querySelector('.bs-spec-picker')) {
                const pickerDiv = document.createElement('div');
                pickerDiv.className = 'bs-spec-picker';
                pickerDiv.innerHTML = `
                    <div class="bs-picker-group">
                        <label>Phân loại / Trọng lượng:</label>
                        <div class="bs-chips">
                            <button type="button" class="bs-chip active">4U / G5 (Tiêu chuẩn)</button>
                            <button type="button" class="bs-chip">3U / G5 (Nặng tay)</button>
                            <button type="button" class="bs-chip">5U / G6 (Siêu nhẹ)</button>
                        </div>
                    </div>
                    <div class="bs-picker-group">
                        <label>Mức căng cước:</label>
                        <div class="bs-chips">
                            <button type="button" class="bs-chip active">Khung vợt (Chưa căng)</button>
                            <button type="button" class="bs-chip">10.5 kg (Người mới)</button>
                            <button type="button" class="bs-chip">11.0 kg (Nâng cao)</button>
                        </div>
                    </div>
                    <div class="bs-picker-group">
                        <label>Số lượng:</label>
                        <div class="bs-qty-stepper">
                            <button type="button" class="bs-qty-btn" data-action="minus">-</button>
                            <input type="number" class="bs-qty-input" value="1" min="1" max="99" readonly>
                            <button type="button" class="bs-qty-btn" data-action="plus">+</button>
                        </div>
                    </div>
                `;
                const actionContainer = infoContainer.querySelector('.nut-thao-tac');
                if (actionContainer) {
                    infoContainer.insertBefore(pickerDiv, actionContainer);
                }
            }

            // Interactive options & stepper listeners
            infoContainer.querySelectorAll('.bs-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    const group = e.target.closest('.bs-chips');
                    if (group) {
                        group.querySelectorAll('.bs-chip').forEach(c => c.classList.remove('active'));
                        e.target.classList.add('active');
                    }
                });
            });

            infoContainer.querySelectorAll('.bs-qty-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const input = e.target.parentNode.querySelector('.bs-qty-input');
                    if (!input) return;
                    let val = parseInt(input.value, 10) || 1;
                    if (e.target.dataset.action === 'plus') val++;
                    else if (e.target.dataset.action === 'minus' && val > 1) val--;
                    input.value = val;
                });
            });
        }

        // 3. Detailed Information Tabs (Mô tả, Thông số, Bảo hành, Đánh giá)
        if (!detailBox.querySelector('.bs-detail-tabs-section')) {
            const tabsSection = document.createElement('div');
            tabsSection.className = 'bs-detail-tabs-section';
            tabsSection.innerHTML = `
                <div class="bs-detail-tabs">
                    <button type="button" class="bs-tab-btn active" data-tab="desc">📝 Mô tả sản phẩm</button>
                    <button type="button" class="bs-tab-btn" data-tab="specs">📊 Thông số kỹ thuật</button>
                    <button type="button" class="bs-tab-btn" data-tab="warranty">🛡️ Bảo hành & Cam kết</button>
                    <button type="button" class="bs-tab-btn" data-tab="reviews">⭐ Đánh giá (128)</button>
                </div>
                <div class="bs-tab-content active" id="tab-desc">
                    <h3>Đặc điểm nổi bật của sản phẩm</h3>
                    <p>Sản phẩm chính hãng mang lại cảm giác thi đấu và trải nghiệm vận động đẳng cấp. Khung đúc mật độ cao công nghệ Nano tiên tiến giúp giảm chấn và gia tăng lực đẩy vượt trội.</p>
                    <ul>
                        <li>Chất liệu High Modulus Graphite cao cấp chịu nhiệt và chịu va đập cực tốt.</li>
                        <li>Thiết kế khí động học giảm tối đa sức cản không khí khi vung tay.</li>
                        <li>Đạt chuẩn thi đấu quốc tế BWF với độ chính xác cao.</li>
                    </ul>
                </div>
                <div class="bs-tab-content" id="tab-specs">
                    <h3>Thông số kỹ thuật sản phẩm</h3>
                    <table class="bs-specs-table">
                        <tr><td>Thương hiệu</td><td>Chính hãng (Yonex / Lining / Victor / VNB)</td></tr>
                        <tr><td>Chất liệu khung</td><td>High Modulus Graphite + Carbon Fiber</td></tr>
                        <tr><td>Độ cứng thân vợt</td><td>Trung bình / Cứng</td></tr>
                        <tr><td>Trọng lượng / Cán</td><td>4U / G5 (80-84g)</td></tr>
                        <tr><td>Mức căng tối đa</td><td>12.5 kg (28 lbs)</td></tr>
                        <tr><td>Xuất xứ</td><td>Nhật Bản / Đài Loan / Trung Quốc</td></tr>
                    </table>
                </div>
                <div class="bs-tab-content" id="tab-warranty">
                    <h3>Chính sách bảo hành & Giao hàng</h3>
                    <div class="bs-warranty-grid">
                        <div class="bs-warranty-card">
                            <span class="bs-warranty-icon">🛡️</span>
                            <strong>Bảo hành 60 ngày</strong>
                            <p>Đổi mới ngay lập tức nếu có lỗi hư hỏng do nhà sản xuất trong thời gian bảo hành.</p>
                        </div>
                        <div class="bs-warranty-card">
                            <span class="bs-warranty-icon">🚚</span>
                            <strong>Giao hàng toàn quốc</strong>
                            <p>Kiểm tra hàng trước khi thanh toán. Giao siêu tốc trong 2H tại nội thành.</p>
                        </div>
                        <div class="bs-warranty-card">
                            <span class="bs-warranty-icon">🛠️</span>
                            <strong>Hỗ trợ trọn đời</strong>
                            <p>Thay gen vợt, sơn logo mặt vợt và tư vấn đan cước miễn phí trọn đời tại cửa hàng.</p>
                        </div>
                    </div>
                </div>
                <div class="bs-tab-content" id="tab-reviews">
                    <h3>Đánh giá từ người dùng</h3>
                    <div class="bs-reviews-overview">
                        <div class="bs-reviews-score">
                            <strong>4.9</strong>
                            <div class="bs-stars">★★★★★</div>
                            <span>128 đánh giá thực tế</span>
                        </div>
                        <div class="bs-reviews-bars">
                            <div class="bs-bar-row"><span>5★</span><div class="bs-bar-track"><div class="bs-bar-fill" style="width:92%"></div></div><span>92%</span></div>
                            <div class="bs-bar-row"><span>4★</span><div class="bs-bar-track"><div class="bs-bar-fill" style="width:6%"></div></div><span>6%</span></div>
                            <div class="bs-bar-row"><span>3★</span><div class="bs-bar-track"><div class="bs-bar-fill" style="width:2%"></div></div><span>2%</span></div>
                        </div>
                    </div>
                    <div class="bs-review-item">
                        <div class="bs-review-user"><strong>Nguyễn Văn Hoàng</strong> <span class="bs-verified">✓ Đã mua hàng</span></div>
                        <div class="bs-stars" style="color:#ffb400">★★★★★</div>
                        <p>Vợt đánh rất đầm tay, vung nhanh và smash mượt. Shop đóng gói siêu chắc chắn có xốp chống sóc. 10/10 điểm!</p>
                        <span class="bs-review-date">Đánh giá 2 ngày trước</span>
                    </div>
                    <div class="bs-review-item">
                        <div class="bs-review-user"><strong>Trần Minh Tuấn</strong> <span class="bs-verified">✓ Đã mua hàng</span></div>
                        <div class="bs-stars" style="color:#ffb400">★★★★★</div>
                        <p>Giao hàng trong ngày nhanh kinh khủng. Vợt đẹp mê lỡ đan cước 11kg nảy lắm nha mọi người.</p>
                        <span class="bs-review-date">Đánh giá 5 ngày trước</span>
                    </div>
                </div>
            `;
            const outerWrapper = document.querySelector('.trung-bay-san-pham') || detailBox.parentElement || detailBox;
            outerWrapper.appendChild(tabsSection);

            tabsSection.querySelectorAll('.bs-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    tabsSection.querySelectorAll('.bs-tab-btn').forEach(b => b.classList.remove('active'));
                    tabsSection.querySelectorAll('.bs-tab-content').forEach(c => c.classList.remove('active'));
                    const tabId = e.target.dataset.tab;
                    e.target.classList.add('active');
                    tabsSection.querySelector(`#tab-${tabId}`)?.classList.add('active');
                });
            });
        }
    }

    async function renderSharedLayout() {
        injectShellStyles();
        const header = document.querySelector('.header');
        if (header) {
            header.innerHTML = `
                <div class="bs-header">
                    <a class="bs-brand" href="trangchu.html" aria-label="Badminton Store — Trang chủ">
                        <span class="bs-brand__mark" aria-hidden="true">B</span>
                        <span class="bs-brand__text"><strong>BADMINTON</strong><small>STORE</small></span>
                    </a>
                    <form class="bs-search" role="search" action="sanpham.html">
                        <label class="bs-visually-hidden" for="shared-search">Tìm sản phẩm</label>
                        <input class="bs-search__input search-input" id="shared-search" name="q" type="search" placeholder="Tìm vợt, giày, phụ kiện…" autocomplete="off">
                        <button class="bs-search__button" type="submit" aria-label="Tìm kiếm">${icons.search}</button>
                    </form>
                    <div class="bs-header__actions">
                        <button class="bs-icon-button bs-theme-action" type="button" data-theme-toggle aria-label="Đổi giao diện"><span data-theme-icon aria-hidden="true">☾</span></button>
                        <a class="bs-icon-button" href="giohang.html" aria-label="Giỏ hàng">${icons.cart}<span class="bs-cart-count" data-cart-count hidden>0</span></a>
                        <details class="bs-user">
                            <summary class="bs-icon-button" aria-label="Tài khoản">${icons.user}</summary>
                            <div class="bs-user-menu" data-user-menu><div class="bs-user-menu__identity"><strong>Khách hàng</strong><span>Đăng nhập để quản lý tài khoản</span></div><a href="dangnhap.html">Đăng nhập</a><a href="dangky.html">Tạo tài khoản</a></div>
                        </details>
                    </div>
                </div>`;
            header.querySelector('.bs-search')?.addEventListener('submit', (event) => {
                event.preventDefault();
                searchProduct();
            });
        }

        const menu = document.getElementById('menu');
        if (menu) {
            const page = decodeURIComponent(window.location.pathname.split('/').pop() || '');
            const categories = [
                ['sanpham.html?danh_muc=1', '🏸 Vợt cầu lông', 'HOT'], ['sanpham.html?danh_muc=2', '👟 Giày cầu lông', 'NEW'],
                ['sanpham.html?danh_muc=3', '👕 Áo cầu lông', ''], ['sanpham.html?danh_muc=4', '👗 Váy cầu lông', ''],
                ['sanpham.html?danh_muc=5', '🩳 Quần cầu lông', ''], ['sanpham.html?danh_muc=6', '🎒 Túi vợt', 'HOT'],
                ['sanpham.html?danh_muc=7', '🎒 Balo', ''], ['sanpham.html?danh_muc=8', '🎾 Phụ kiện', '']
            ];
            const productActive = page === 'sanpham.html' || page.includes('chi tiết') || categories.some(([href]) => href === page);
            const categoryLinks = categories.map(([href, label, badge]) =>
                `<a href="${href}"${page === href ? ' aria-current="page"' : ''}><span>${label}</span>${badge ? `<span class="bs-cat-badge">${badge}</span>` : ''}</a>`
            ).join('');
            const pageLink = (href, label) => `<li><a href="${href}"${page === href ? ' aria-current="page"' : ''}>${label}</a></li>`;
            menu.innerHTML = `<nav class="bs-nav" aria-label="Điều hướng chính">
                <button class="bs-mobile-toggle" type="button" aria-expanded="false">Danh mục</button>
                <ul class="bs-nav__links">
                    ${pageLink('trangchu.html', 'Trang chủ')}
                    <li class="bs-nav__products"><details><summary${productActive ? ' aria-current="page"' : ''}>Sản phẩm</summary><div class="bs-nav__catalog"><div class="bs-nav__catalog-head"><strong>Mua sắm theo danh mục</strong><a href="sanpham.html">Xem tất cả →</a></div><div class="bs-nav__catalog-grid">${categoryLinks}</div></div></details></li>
                    ${pageLink('sanpham.html?sale=true', 'Sale off')}
                    ${pageLink('tin tức.html', 'Tin tức')}
                    ${pageLink('hướng dẫn.html', 'Hướng dẫn')}
                    ${pageLink('lienhe.html', 'Liên hệ')}
                </ul>
            </nav>`;
            const toggle = menu.querySelector('.bs-mobile-toggle');
            toggle?.addEventListener('click', () => {
                const nav = toggle.closest('.bs-nav');
                const open = nav.classList.toggle('is-open');
                toggle.setAttribute('aria-expanded', String(open));
            });
            menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
                menu.querySelector('.bs-nav')?.classList.remove('is-open');
                toggle?.setAttribute('aria-expanded', 'false');
            }));
        }

        const footer = document.getElementById('cuoitrang');
        if (footer) {
            footer.innerHTML = `<footer class="bs-footer"><div class="bs-footer__grid"><section><h2>BADMINTON STORE</h2><p>Trang bị đúng chất cho mọi trận cầu — sản phẩm rõ nguồn gốc, tư vấn vừa tay và hỗ trợ tận tâm.</p></section><section><h3>Mua sắm</h3><ul><li><a href="sanpham.html?danh_muc=1">Vợt cầu lông</a></li><li><a href="sanpham.html?danh_muc=2">Giày cầu lông</a></li><li><a href="sanpham.html?danh_muc=8">Phụ kiện</a></li></ul></section><section><h3>Hỗ trợ</h3><ul><li><a href="hướng dẫn.html">Hướng dẫn mua hàng</a></li><li><a href="lienhe.html">Liên hệ</a></li><li><a href="canhan.html">Tài khoản của tôi</a></li></ul></section><section><h3>Kết nối</h3><ul><li><a href="lienhe.html">Gửi yêu cầu hỗ trợ</a></li><li><a href="tin tức.html">Tin tức cầu lông</a></li><li><span class="bs-footer__dot"></span>Thông tin liên hệ được công bố tại trang Liên hệ</li></ul></section></div><div class="bs-footer__bottom">© ${new Date().getFullYear()} Badminton Store.<span>Mua sắm an tâm · Thanh toán bảo mật</span></div></footer>`;
        }

        setupSearchSuggestions();

        // Tự động nâng cấp giao diện Chi tiết sản phẩm nếu có
        enhanceDetailPage();

        document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.addEventListener('click', toggleTheme));
        const user = await me();
        const userMenu = document.querySelector('[data-user-menu]');
        if (userMenu && user) {
            userMenu.innerHTML = '';
            const identity = document.createElement('div');
            identity.className = 'bs-user-menu__identity';
            const name = document.createElement('strong');
            name.textContent = user.fullname || user.username;
            const email = document.createElement('span');
            email.textContent = user.email || `@${user.username}`;
            identity.append(name, email);
            const account = document.createElement('a');
            account.href = 'canhan.html';
            account.textContent = 'Không gian cá nhân';
            userMenu.append(identity, account);
            const wishlist = document.createElement('a');
            wishlist.href = 'yeuthich.html';
            wishlist.textContent = 'Sản phẩm yêu thích';
            userMenu.appendChild(wishlist);
            if (['admin', 'superadmin'].includes(user.role)) {
                const admin = document.createElement('a');
                admin.href = 'admin.html';
                admin.textContent = 'Trang quản trị';
                userMenu.appendChild(admin);
            }
            const signout = document.createElement('button');
            signout.type = 'button';
            signout.className = 'bs-user-menu__danger';
            signout.textContent = 'Đăng xuất';
            signout.addEventListener('click', () => logout());
            userMenu.appendChild(signout);
            capNhatBadgeGioHang();
        }
    }

    // API tương thích cho các trang cũ.
    window.showToast = showToast;
    window.searchProduct = searchProduct;
    window.themVaoGioHang = themVaoGioHang;
    window.muaNgay = muaNgay;
    window.capNhatBadgeGioHang = capNhatBadgeGioHang;
    window.renderSharedLayout = renderSharedLayout;
    window.toggleTheme = toggleTheme;
    window.dangXuat = () => logout();
    window.layThongTinUser = () => me(true).then((user) => user ? ({ isLoggedIn: true, ...user }) : ({ isLoggedIn: false }));
    window.xoaCache = () => { currentUser = null; currentUserRequest = null; };
    window.capNhatPopupDangNhap = () => renderSharedLayout();
    // Những tên toàn cục lexical được các script cũ tham chiếu trực tiếp.
    window.getApiHeaders = getApiHeaders;
    window.getAuthToken = getToken;
    window.AuthStore = { getToken, getApiHeaders, clear: clearSession };

    const preferredTheme = localStorage.getItem(THEME_KEY)
        || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(preferredTheme);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            renderSharedLayout();
            enhanceDetailPage();
        }, { once: true });
    } else {
        renderSharedLayout();
        enhanceDetailPage();
    }

    window.addEventListener('load', () => {
        renderSharedLayout();
        enhanceDetailPage();
    });

    setTimeout(() => {
        renderSharedLayout();
        enhanceDetailPage();
    }, 150);
})();

// Aliases lexical cho mã inline cũ. Giá trị danh tính không bao giờ lấy từ username localStorage.
const API_BASE = window.API_BASE;
const API_HEADERS = window.API_HEADERS;
