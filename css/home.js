/* Trang chủ độc lập: không thay đổi engine tài khoản dùng chung của các trang còn lại. */
(function () {
    'use strict';

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

    const selectors = {
        navToggle: document.getElementById('navToggle'),
        primaryNav: document.getElementById('primaryNav'),
        themeToggle: document.getElementById('themeToggle'),
        productTrack: document.getElementById('newProducts'),
        productPrev: document.getElementById('productPrev'),
        productNext: document.getElementById('productNext')
    };

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
                    return;
                }
                window.location.href = `sanpham.html?q=${encodeURIComponent(query)}`;
            });
        });
    }

    async function setupAccount() {
        const accountLink = document.getElementById('accountLink');
        const accountLabel = document.getElementById('accountLabel');
        const accountAvatar = document.getElementById('accountAvatar');
        if (!window.BadmintonAuth?.getToken?.()) return;
        const user = await window.BadmintonAuth.me();
        if (user) {
            const displayName = String(user.fullname || user.username || 'Tài khoản');
            accountLink.href = 'canhan.html';
            accountLabel.textContent = displayName;
            accountAvatar.textContent = displayName.charAt(0).toUpperCase();
            loadCartCount();
        }
    }

    async function loadCartCount() {
        const base = apiBase();
        const badge = document.getElementById('cartCount');
        const token = window.BadmintonAuth?.getToken?.();
        if (!base || !badge || !token) return;
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
            if (count > 0) {
                badge.textContent = String(count);
                badge.hidden = false;
            }
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

    function productCard(product) {
        const link = document.createElement('a');
        link.className = 'product-card';
        link.href = product.href || 'sanpham.html';

        const media = document.createElement('div');
        media.className = 'product-card__media';
        const badge = document.createElement('span');
        badge.className = 'product-card__badge';
        badge.textContent = 'Đề xuất';
        const image = document.createElement('img');
        image.src = validImageSource(product.image) || 'HA/cc-removebg-preview.png';
        image.alt = product.name;
        image.loading = 'lazy';
        image.decoding = 'async';
        media.append(badge, image);

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
        price.textContent = Number(product.price).toLocaleString('vi-VN') + ' ₫';
        const originalPrice = document.createElement('del');
        originalPrice.className = 'product-card__original-price';
        originalPrice.textContent = Number(product.originalPrice || 0).toLocaleString('vi-VN') + ' ₫';
        originalPrice.hidden = !(Number(product.originalPrice || 0) > Number(product.price || 0));
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
        selectors.productTrack.replaceChildren(...products.map(productCard));
        selectors.productTrack.setAttribute('aria-busy', 'false');
    }

    async function loadProducts() {
        const base = apiBase();
        if (!base) {
            renderProducts(FALLBACK_PRODUCTS);
            return;
        }

        try {
            const controller = new AbortController();
            const timeout = window.setTimeout(function () { controller.abort(); }, 2600);
            const response = await fetch(`${base}/api/san-pham/goi-y?limit=8`, { signal: controller.signal });
            window.clearTimeout(timeout);
            if (!response.ok) throw new Error('API unavailable');
            const data = await response.json();
            if (!data.success || !Array.isArray(data.products) || data.products.length === 0) throw new Error('No products');

            const products = data.products.map(function (item) {
                const id = Number(item.MaSP);
                return {
                    name: String(item.TenSP || 'Sản phẩm cầu lông'),
                    price: Number(item.GiaBan) || 0,
                    originalPrice: Number(item.GiaGoc) || 0,
                    type: String(item.TenDM || item.ThuongHieu || 'Sản phẩm cầu lông'),
                    image: String(item.HinhAnh || ''),
                    href: Number.isInteger(id) && id > 0 ? `chitiet.html?id=${id}` : 'sanpham.html'
                };
            });
            renderProducts(products);
        } catch (error) {
            renderProducts(FALLBACK_PRODUCTS);
        }
    }

    function setupProductControls() {
        function scrollProducts(direction) {
            const distance = Math.min(selectors.productTrack?.clientWidth * 0.86 || 300, 900);
            selectors.productTrack?.scrollBy({ left: direction * distance, behavior: 'smooth' });
        }
        selectors.productPrev?.addEventListener('click', function () { scrollProducts(-1); });
        selectors.productNext?.addEventListener('click', function () { scrollProducts(1); });
    }

    function setCurrentYear() {
        const node = document.getElementById('currentYear');
        if (node) node.textContent = String(new Date().getFullYear());
    }

    setupNavigation();
    setupTheme();
    setupSearch();
    setupAccount();
    setupProductControls();
    setCurrentYear();
    loadProducts();
}());
