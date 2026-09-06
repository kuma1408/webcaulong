/* Trang chủ độc lập: không thay đổi engine tài khoản dùng chung của các trang còn lại. */
(function () {
    'use strict';

    const FALLBACK_IMAGE = 'HA/cc-removebg-preview.png';

    const FALLBACK_PRODUCTS = [
        {
            name: 'Vợt Cầu Lông Lining Axforce 10',
            price: 950000,
            type: 'Vợt cầu lông',
            image: 'HA/anh vot/Vợt Cầu Lông Lining Axforce 10 950.000 ₫.png',
            href: 'sanpham.html?q=Lining Axforce 10'
        },
        {
            name: 'Giày Cầu Lông Lining AYAT005-6',
            price: 2330000,
            type: 'Giày cầu lông',
            image: 'HA/Giày/Giày cầu lông Lining AYAT005-6 chính hãng 2.330.000 ₫.png',
            href: 'sanpham.html?q=Lining AYAT005-6'
        },
        {
            name: 'Áo Cầu Lông Lining A320 Nam',
            price: 130000,
            type: 'Trang phục',
            image: 'HA/Áo/Áo Cầu Lông Lining A320 Nam - Hồng Đen 130.000 ₫ .png',
            href: 'sanpham.html?q=Lining A320'
        },
        {
            name: 'Balo Cầu Lông Kawasaki 8245',
            price: 750000,
            type: 'Túi & balo',
            image: 'HA/balo/Balo cầu lông Kawasaki 8245 750.000 ₫ .png',
            href: 'sanpham.html?q=Kawasaki 8245'
        },
        {
            name: 'Túi Cầu Lông Kumpoo KB463',
            price: 820000,
            type: 'Túi & balo',
            image: 'HA/túi/Túi cầu lông Kumpoo KB463 820.000 ₫.png',
            href: 'sanpham.html?q=Kumpoo KB463'
        },
        {
            name: 'Dây Cước Căng Vợt Lining L9',
            price: 60000,
            type: 'Phụ kiện',
            image: 'HA/phụ kien/Dây cước căng vợt Lining L9 60.000 ₫.png',
            href: 'sanpham.html?q=Lining L9'
        },
        {
            name: 'Váy Cầu Lông Kamito Galaxy 1',
            price: 350000,
            type: 'Trang phục',
            image: 'HA/váy/Váy cầu lông Kamito Galaxy 1 KMVS240223 - Navy chính hãng 350.000 ₫.png',
            href: 'sanpham.html?q=Kamito Galaxy 1'
        },
        {
            name: 'Vợt Yonex Nanoflare 1000Z Trắng',
            price: 15000000,
            type: 'Vợt cầu lông',
            image: 'HA/anh vot/Set Vợt Cầu Lông Yonex Nanoflare 1000Z Trắng 15.000.000 ₫.png',
            href: 'sanpham.html?q=Nanoflare 1000Z'
        }
    ];

    const PRICE_FORMATTER = new Intl.NumberFormat('vi-VN');
    const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const SUGGEST_LIMIT = 6;
    const SUGGEST_DEBOUNCE = 260;

    const selectors = {
        siteHeader: document.getElementById('siteHeader'),
        navToggle: document.getElementById('navToggle'),
        primaryNav: document.getElementById('primaryNav'),
        themeToggle: document.getElementById('themeToggle'),
        searchForm: document.getElementById('siteSearch'),
        searchInput: document.getElementById('mainSearch'),
        searchPanel: document.getElementById('searchSuggestions'),
        searchStatus: document.getElementById('searchStatus'),
        productTrack: document.getElementById('newProducts'),
        productPrev: document.getElementById('productPrev'),
        productNext: document.getElementById('productNext'),
        productProgress: document.getElementById('productProgress')
    };

    function formatPrice(value) {
        return PRICE_FORMATTER.format(Math.max(0, Math.round(Number(value) || 0))) + ' ₫';
    }

    function prefersReducedMotion() {
        return Boolean(REDUCED_MOTION?.matches);
    }

    function debounce(fn, wait) {
        let timer = 0;
        return function debounced() {
            const args = arguments;
            window.clearTimeout(timer);
            timer = window.setTimeout(function () { fn.apply(null, args); }, wait);
        };
    }

    function toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function apiBase() {
        const configured = document.querySelector('meta[name="api-base"]')?.content.trim();
        if (configured) return configured.replace(/\/$/, '');
        if (!window.location.hostname || ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
            return 'http://127.0.0.1:5000';
        }
        return window.location.origin;
    }

    function closeNav() {
        document.body.classList.remove('nav-open');
        selectors.navToggle?.setAttribute('aria-expanded', 'false');
        selectors.navToggle?.querySelector('.sr-only')?.replaceChildren('Mở trình đơn');
        selectors.primaryNav?.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
    }

    function setupNavigation() {
        selectors.navToggle?.addEventListener('click', function () {
            const willOpen = !document.body.classList.contains('nav-open');
            document.body.classList.toggle('nav-open', willOpen);
            selectors.navToggle.setAttribute('aria-expanded', String(willOpen));
            selectors.navToggle.querySelector('.sr-only')?.replaceChildren(willOpen ? 'Đóng trình đơn' : 'Mở trình đơn');
        });
        selectors.primaryNav?.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeNav);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeNav();
        });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 900) closeNav();
        });
    }

    function setupHeaderState() {
        const header = selectors.siteHeader;
        if (!header) return;
        const sync = function () {
            header.classList.toggle('is-stuck', window.scrollY > 12);
        };
        sync();
        window.addEventListener('scroll', sync, { passive: true });
    }

    function setupReveal() {
        const targets = document.querySelectorAll('[data-reveal]');
        if (!targets.length) return;
        if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
            targets.forEach(function (node) { node.classList.add('is-revealed'); });
            return;
        }
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-revealed');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
        targets.forEach(function (node) { observer.observe(node); });
    }

    function setupTheme() {
        function syncLabel() {
            const isDark = document.documentElement.dataset.theme === 'dark';
            selectors.themeToggle?.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
        }
        syncLabel();
        selectors.themeToggle?.addEventListener('click', function () {
            const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = nextTheme;
            try { localStorage.setItem('badminton_theme', nextTheme); } catch (error) { /* Trình duyệt chặn lưu cục bộ. */ }
            syncLabel();
        });
    }

    function setupSearch() {
        document.querySelectorAll('.site-search').forEach(function (form) {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                const input = form.querySelector('input[name="q"]');
                const query = input?.value.trim();
                if (!query) {
                    input?.focus();
                    toast('Hãy nhập tên sản phẩm bạn muốn tìm.', 'warning');
                    return;
                }
                window.location.href = `sanpham.html?q=${encodeURIComponent(query)}`;
            });
        });
        setupSuggestions();
    }

    function setupSuggestions() {
        const input = selectors.searchInput;
        const panel = selectors.searchPanel;
        if (!input || !panel) return;

        let items = [];
        let activeIndex = -1;
        let controller = null;
        let lastQuery = '';

        function announce(message) {
            if (selectors.searchStatus) selectors.searchStatus.textContent = message;
        }

        function close() {
            panel.hidden = true;
            panel.replaceChildren();
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            items = [];
            activeIndex = -1;
        }

        function highlight(index) {
            activeIndex = index;
            items.forEach(function (node, position) {
                const isActive = position === index;
                node.classList.toggle('is-active', isActive);
                node.setAttribute('aria-selected', String(isActive));
            });
            if (index >= 0 && items[index]) {
                input.setAttribute('aria-activedescendant', items[index].id);
                items[index].scrollIntoView({ block: 'nearest' });
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        }

        function renderMessage(message) {
            const empty = document.createElement('p');
            empty.className = 'search-suggest__empty';
            empty.textContent = message;
            panel.replaceChildren(empty);
            panel.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            items = [];
            activeIndex = -1;
        }

        function suggestionOption(product, index) {
            const option = document.createElement('li');
            option.className = 'search-suggest__item';
            option.id = `searchSuggestion-${index}`;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.dataset.href = product.href;

            const thumb = document.createElement('img');
            thumb.className = 'search-suggest__thumb';
            thumb.src = validImageSource(product.image) || FALLBACK_IMAGE;
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            thumb.addEventListener('error', function () { thumb.src = FALLBACK_IMAGE; }, { once: true });

            const body = document.createElement('span');
            body.className = 'search-suggest__body';
            const name = document.createElement('strong');
            name.textContent = product.name;
            const meta = document.createElement('small');
            meta.textContent = product.type;
            body.append(name, meta);

            const price = document.createElement('span');
            price.className = 'search-suggest__price';
            price.textContent = formatPrice(product.price);

            option.append(thumb, body, price);
            option.addEventListener('mousedown', function (event) {
                event.preventDefault();
                window.location.href = product.href;
            });
            option.addEventListener('mouseenter', function () { highlight(index); });
            return option;
        }

        function render(products, query) {
            if (!products.length) {
                renderMessage(`Không tìm thấy sản phẩm phù hợp với “${query}”.`);
                announce('Không có gợi ý phù hợp.');
                return;
            }

            const list = document.createElement('ul');
            list.className = 'search-suggest__list';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', 'Gợi ý sản phẩm');
            items = products.map(function (product, index) {
                const option = suggestionOption(product, index);
                list.appendChild(option);
                return option;
            });

            const footer = document.createElement('a');
            footer.className = 'search-suggest__all';
            footer.href = `sanpham.html?q=${encodeURIComponent(query)}`;
            footer.textContent = `Xem tất cả kết quả cho “${query}”`;

            panel.replaceChildren(list, footer);
            panel.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            activeIndex = -1;
            announce(`${products.length} gợi ý sản phẩm.`);
        }

        async function fetchSuggestions(query) {
            const base = apiBase();
            if (!base) return;
            controller?.abort();
            controller = new AbortController();
            const signal = controller.signal;
            const timeout = window.setTimeout(function () { controller.abort(); }, 3200);
            panel.classList.add('is-loading');
            try {
                const response = await fetch(
                    `${base}/api/tim-kiem?q=${encodeURIComponent(query)}&limit=${SUGGEST_LIMIT}`,
                    { signal: signal, headers: { Accept: 'application/json' } }
                );
                if (!response.ok) throw new Error('search_failed');
                const data = await response.json();
                if (query !== lastQuery) return;
                render(mapProducts(data.products), query);
            } catch (error) {
                if (signal.aborted || query !== lastQuery) return;
                renderMessage('Không tải được gợi ý. Nhấn Enter để xem trang kết quả.');
            } finally {
                window.clearTimeout(timeout);
                panel.classList.remove('is-loading');
            }
        }

        const requestSuggestions = debounce(function (query) {
            if (query === lastQuery) fetchSuggestions(query);
        }, SUGGEST_DEBOUNCE);

        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', panel.id);
        input.setAttribute('aria-autocomplete', 'list');

        input.addEventListener('input', function () {
            const query = input.value.trim();
            lastQuery = query;
            if (query.length < 2) {
                controller?.abort();
                close();
                return;
            }
            requestSuggestions(query);
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                close();
                return;
            }
            if (!items.length) return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                highlight((activeIndex + 1) % items.length);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                highlight(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
            } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                window.location.href = items[activeIndex].dataset.href;
            }
        });

        input.addEventListener('focus', function () {
            if (input.value.trim().length >= 2 && panel.childElementCount) {
                panel.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            }
        });

        document.addEventListener('click', function (event) {
            if (!panel.hidden && !panel.contains(event.target) && event.target !== input) close();
        });
    }

    async function setupAccount() {
        const accountLink = document.getElementById('accountLink');
        const accountLabel = document.getElementById('accountLabel');
        const accountAvatar = document.getElementById('accountAvatar');
        if (!window.BadmintonAuth?.getToken?.()) return;

        let user = null;
        try {
            user = await window.BadmintonAuth.me();
        } catch (error) {
            return;
        }
        if (!user) return;

        const displayName = String(user.fullname || user.username || 'Tài khoản');
        if (accountLink) accountLink.href = 'canhan.html';
        if (accountLabel) accountLabel.textContent = displayName;
        if (accountAvatar) accountAvatar.textContent = displayName.charAt(0).toUpperCase();
        loadCartCount();
    }

    function setCartCount(count) {
        const badge = document.getElementById('cartCount');
        if (!badge) return;
        const safe = Math.max(0, Number(count) || 0);
        badge.textContent = String(safe);
        badge.hidden = safe < 1;
    }

    async function loadCartCount() {
        const base = apiBase();
        const token = window.BadmintonAuth?.getToken?.();
        if (!base || !token) return;
        try {
            const controller = new AbortController();
            const timeout = window.setTimeout(function () { controller.abort(); }, 2200);
            const response = await fetch(`${base}/api/gio-hang`, {
                method: 'POST',
                headers: window.BadmintonAuth.getApiHeaders(),
                body: '{}',
                signal: controller.signal
            });
            window.clearTimeout(timeout);
            const data = await response.json();
            const count = Array.isArray(data.items) ? data.items.reduce(function (total, item) {
                return total + Math.max(0, Number(item.SoLuong) || 0);
            }, 0) : 0;
            setCartCount(count);
        } catch (error) {
            // Giỏ hàng vẫn truy cập được; badge chỉ là thông tin bổ trợ.
        }
    }

    function validImageSource(value) {
        if (!value || typeof value !== 'string') return '';
        try {
            const url = new URL(value, document.baseURI);
            return ['http:', 'https:', 'file:'].includes(url.protocol) ? value : '';
        } catch (error) {
            return '';
        }
    }

    function mapProducts(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.map(function (item) {
            const id = Number(item.MaSP);
            const hasId = Number.isInteger(id) && id > 0;
            return {
                id: hasId ? id : 0,
                name: String(item.TenSP || 'Sản phẩm cầu lông'),
                price: Number(item.GiaBan) || 0,
                originalPrice: Number(item.GiaGoc) || 0,
                type: String(item.TenDM || item.ThuongHieu || 'Sản phẩm cầu lông'),
                image: String(item.HinhAnh || ''),
                stock: Number(item.TonKho),
                href: hasId ? `chitiet.html?id=${id}` : 'sanpham.html'
            };
        });
    }

    function discountPercent(product) {
        const original = Number(product.originalPrice) || 0;
        const price = Number(product.price) || 0;
        if (original <= price || price <= 0) return 0;
        return Math.round(((original - price) / original) * 100);
    }

    async function quickAddToCart(product, button) {
        if (!product.id) {
            window.location.href = product.href;
            return;
        }
        if (!window.BadmintonAuth?.getToken?.()) {
            toast('Vui lòng đăng nhập để thêm sản phẩm vào giỏ.', 'warning');
            window.setTimeout(function () {
                window.location.href = 'dangnhap.html?next=trangchu.html';
            }, 900);
            return;
        }
        button.disabled = true;
        button.classList.add('is-busy');
        try {
            const data = await window.BadmintonAuth.request('/api/gio-hang/them', {
                method: 'POST',
                json: { ma_san_pham: product.id, so_luong: 1 }
            });
            toast(data.message || 'Đã thêm vào giỏ hàng.', 'success');
            loadCartCount();
        } catch (error) {
            toast(error?.message || 'Không thêm được sản phẩm vào giỏ.', 'error');
        } finally {
            button.disabled = false;
            button.classList.remove('is-busy');
        }
    }

    async function toggleWishlist(product, button) {
        if (!product.id) return;
        if (!window.BadmintonAuth?.getToken?.()) {
            toast('Vui lòng đăng nhập để lưu sản phẩm yêu thích.', 'warning');
            return;
        }
        const liked = button.getAttribute('aria-pressed') === 'true';
        button.disabled = true;
        try {
            const data = await window.BadmintonAuth.request(`/api/yeu-thich/${product.id}`, {
                method: liked ? 'DELETE' : 'POST'
            });
            const nextLiked = data.liked !== undefined ? Boolean(data.liked) : !liked;
            button.setAttribute('aria-pressed', String(nextLiked));
            button.setAttribute('aria-label', nextLiked ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích');
            toast(data.message || (nextLiked ? 'Đã lưu yêu thích.' : 'Đã bỏ yêu thích.'), 'success');
        } catch (error) {
            toast(error?.message || 'Không cập nhật được yêu thích.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    function productActions(product) {
        const actions = document.createElement('div');
        actions.className = 'product-card__actions';

        const cart = document.createElement('button');
        cart.type = 'button';
        cart.className = 'product-card__action product-card__action--cart';
        cart.textContent = 'Thêm vào giỏ';
        cart.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            quickAddToCart(product, cart);
        });

        const wish = document.createElement('button');
        wish.type = 'button';
        wish.className = 'product-card__action product-card__action--wish';
        wish.setAttribute('aria-pressed', 'false');
        wish.setAttribute('aria-label', 'Lưu vào yêu thích');
        wish.textContent = '♥';
        wish.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleWishlist(product, wish);
        });

        actions.append(cart, wish);
        return actions;
    }

    function productCard(product) {
        const link = document.createElement('a');
        link.className = 'product-card';
        link.href = product.href || 'sanpham.html';

        const media = document.createElement('div');
        media.className = 'product-card__media';
        const image = document.createElement('img');
        image.src = validImageSource(product.image) || FALLBACK_IMAGE;
        image.alt = product.name;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', function () { image.src = FALLBACK_IMAGE; }, { once: true });
        media.appendChild(image);

        const percent = discountPercent(product);
        const badge = document.createElement('span');
        badge.className = percent > 0 ? 'product-card__badge product-card__badge--sale' : 'product-card__badge';
        badge.textContent = percent > 0 ? `-${percent}%` : 'Đề xuất';
        media.appendChild(badge);

        if (Number.isFinite(product.stock) && product.stock <= 0) {
            const stock = document.createElement('span');
            stock.className = 'product-card__stock';
            stock.textContent = 'Tạm hết hàng';
            media.appendChild(stock);
        }

        media.appendChild(productActions(product));

        const info = document.createElement('div');
        info.className = 'product-card__info';
        const type = document.createElement('span');
        type.className = 'product-card__type';
        type.textContent = product.type || 'Sản phẩm cầu lông';
        const title = document.createElement('h3');
        title.textContent = product.name;
        const footer = document.createElement('div');
        footer.className = 'product-card__footer';
        const price = document.createElement('strong');
        price.className = 'product-card__price';
        price.textContent = formatPrice(product.price);
        const originalPrice = document.createElement('del');
        originalPrice.className = 'product-card__original-price';
        originalPrice.textContent = formatPrice(product.originalPrice);
        originalPrice.hidden = percent <= 0;
        const arrow = document.createElement('span');
        arrow.className = 'product-card__arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↗';
        const prices = document.createElement('span');
        prices.className = 'product-card__prices';
        prices.append(originalPrice, price);
        footer.append(prices, arrow);
        info.append(type, title, footer);
        link.append(media, info);
        return link;
    }

    function renderProducts(products) {
        if (!selectors.productTrack) return;
        selectors.productTrack.classList.remove('is-error');
        selectors.productTrack.replaceChildren(...products.map(productCard));
        selectors.productTrack.setAttribute('aria-busy', 'false');
        updateSliderState();
    }

    function renderProductError() {
        const track = selectors.productTrack;
        if (!track) return;
        track.classList.add('is-error');
        track.setAttribute('aria-busy', 'false');

        const box = document.createElement('div');
        box.className = 'product-error';
        const text = document.createElement('p');
        text.textContent = 'Không tải được danh sách gợi ý. Vui lòng thử lại.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button button--accent';
        retry.textContent = 'Tải lại gợi ý';
        retry.addEventListener('click', function () { loadProducts(); });
        box.append(text, retry);
        track.replaceChildren(box);
        updateSliderState();
    }

    function toggleOfflineNotice(visible) {
        const notice = document.getElementById('productNotice');
        if (!notice) return;
        notice.hidden = !visible;
        if (!visible || notice.childElementCount) return;

        const text = document.createElement('span');
        text.textContent = 'Đang hiển thị gợi ý ngoại tuyến vì máy chủ chưa phản hồi.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'product-notice__retry';
        retry.textContent = 'Thử lại';
        retry.addEventListener('click', function () { loadProducts(); });
        notice.append(text, retry);
    }

    async function loadProducts() {
        const track = selectors.productTrack;
        const base = apiBase();
        if (!base) {
            renderProducts(FALLBACK_PRODUCTS);
            toggleOfflineNotice(true);
            return;
        }

        if (track) {
            track.setAttribute('aria-busy', 'true');
            track.classList.remove('is-error');
            const skeletons = [0, 1, 2, 3].map(function () {
                const node = document.createElement('div');
                node.className = 'product-skeleton';
                return node;
            });
            track.replaceChildren(...skeletons);
        }

        try {
            const controller = new AbortController();
            const timeout = window.setTimeout(function () { controller.abort(); }, 3600);
            const response = await fetch(`${base}/api/san-pham/goi-y?limit=8`, {
                signal: controller.signal,
                headers: { Accept: 'application/json' }
            });
            window.clearTimeout(timeout);
            if (!response.ok) throw new Error('API unavailable');
            const data = await response.json();
            const products = mapProducts(data.products);
            if (!data.success || !products.length) throw new Error('No products');
            renderProducts(products);
            toggleOfflineNotice(false);
        } catch (error) {
            if (FALLBACK_PRODUCTS.length) {
                renderProducts(FALLBACK_PRODUCTS);
                toggleOfflineNotice(true);
                return;
            }
            renderProductError();
        }
    }

    function updateSliderState() {
        const track = selectors.productTrack;
        if (!track) return;
        const maxScroll = track.scrollWidth - track.clientWidth;
        const scrolled = track.scrollLeft;
        const canScroll = maxScroll > 4;

        if (selectors.productPrev) selectors.productPrev.disabled = !canScroll || scrolled <= 4;
        if (selectors.productNext) selectors.productNext.disabled = !canScroll || scrolled >= maxScroll - 4;
        if (selectors.productProgress) {
            const ratio = canScroll ? Math.min(1, Math.max(0, scrolled / maxScroll)) : 0;
            selectors.productProgress.style.setProperty('--progress', String(ratio));
            selectors.productProgress.hidden = !canScroll;
            selectors.productProgress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
        }
    }

    function setupProductControls() {
        const track = selectors.productTrack;
        function scrollProducts(direction) {
            const distance = Math.min((track?.clientWidth || 300) * 0.86, 900);
            track?.scrollBy({
                left: direction * distance,
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            });
        }
        selectors.productPrev?.addEventListener('click', function () { scrollProducts(-1); });
        selectors.productNext?.addEventListener('click', function () { scrollProducts(1); });
        track?.addEventListener('scroll', updateSliderState, { passive: true });
        window.addEventListener('resize', updateSliderState);
        updateSliderState();
    }

    function setCurrentYear() {
        const node = document.getElementById('currentYear');
        if (node) node.textContent = String(new Date().getFullYear());
    }

    setupNavigation();
    setupHeaderState();
    setupTheme();
    setupSearch();
    setupAccount();
    setupProductControls();
    setupReveal();
    setCurrentYear();
    loadProducts();
}());
