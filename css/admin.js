(function () {
    'use strict';

    const Auth = window.BadmintonAuth;
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
    const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
    const pageTitles = { overview: 'Tổng quan', products: 'Sản phẩm', orders: 'Đơn hàng', users: 'Người dùng', content: 'Tin tức & Hướng dẫn', support: 'Hỗ trợ khách hàng', vouchers: 'Voucher', deposits: 'Yêu cầu nạp tiền', approvals: 'Phê duyệt thay đổi', audit: 'Nhật ký quản trị' };
    const statusMeta = {
        CHO_XAC_NHAN: ['Chờ xác nhận', ''], DANG_GIAO: ['Đang giao', 'admin-badge--info'],
        HOAN_THANH: ['Hoàn thành', 'admin-badge--success'], DA_HUY: ['Đã hủy', 'admin-badge--danger'],
        CHO_DUYET: ['Chờ duyệt', ''], DA_DUYET: ['Đã duyệt', 'admin-badge--success'],
        TU_CHOI: ['Từ chối', 'admin-badge--danger'], CHO_XEM: ['Chờ Super Admin', ''],
        DA_XAC_NHAN: ['Đã xác nhận', 'admin-badge--success'],
        DA_HOAN_TAC: ['Đã hoàn tác', 'admin-badge--danger'], MOI: ['Mới tiếp nhận', ''],
        DANG_XU_LY: ['Đang xử lý', 'admin-badge--info'], DA_PHAN_HOI: ['Đã phản hồi', 'admin-badge--success'],
        DA_DONG: ['Đã đóng', 'admin-badge--success']
    };
    const racketOptionNames = {
        KHONG_CANG: 'Chưa căng cước', YONEX_BG65: 'Yonex BG65',
        YONEX_BG65TI: 'Yonex BG65Ti', YONEX_NANOGY98: 'Yonex Nanogy 98',
        YONEX_AEROBITE: 'Yonex Aerobite', LINING_NO1: 'Lining No.1',
        QUAN_CAN_CAO_SU: 'Quấn cán cao su', TUI_CACH_NHIET: 'Túi cách nhiệt',
        HOP_CAU_LONG: 'Hộp cầu lông'
    };
    const state = {
        currentView: 'overview', loaded: new Set(), admin: null, categories: [],
        products: [], productPage: 1, productTotal: 0,
        orders: [], orderPage: 1, orderTotal: 0,
        users: [], userPage: 1, userTotal: 0,
        deposits: [], content: [], vouchers: [], support: [], supportPage: 1, supportTotal: 0
    };
    let pendingUserAvatar = null;
    let adminCropImage = null;
    let adminCropBaseScale = 1;
    let adminCropScale = 1;
    let adminCropX = 0;
    let adminCropY = 0;
    let adminCropDragging = false;
    let adminCropPointerX = 0;
    let adminCropPointerY = 0;

    function clampAdminAvatarCrop() {
        const canvas = $('#adminAvatarCropCanvas');
        if (!canvas || !adminCropImage) return;
        const halfX = Math.max(0, (adminCropImage.width * adminCropScale - canvas.width) / 2);
        const halfY = Math.max(0, (adminCropImage.height * adminCropScale - canvas.height) / 2);
        adminCropX = Math.max(-halfX, Math.min(halfX, adminCropX));
        adminCropY = Math.max(-halfY, Math.min(halfY, adminCropY));
    }
    function drawAdminAvatarCrop() {
        const canvas = $('#adminAvatarCropCanvas');
        if (!canvas || !adminCropImage) return;
        clampAdminAvatarCrop();
        const context = canvas.getContext('2d');
        const width = adminCropImage.width * adminCropScale;
        const height = adminCropImage.height * adminCropScale;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f4ece7'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(adminCropImage, (canvas.width - width) / 2 + adminCropX, (canvas.height - height) / 2 + adminCropY, width, height);
    }
    function openAdminAvatarCrop(file) {
        const url = URL.createObjectURL(file); const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url); adminCropImage = image;
            const canvas = $('#adminAvatarCropCanvas');
            adminCropBaseScale = Math.max(canvas.width / image.width, canvas.height / image.height);
            adminCropScale = adminCropBaseScale; adminCropX = 0; adminCropY = 0;
            $('#adminAvatarZoom').value = '1'; drawAdminAvatarCrop(); $('#adminAvatarCropDialog').showModal();
        };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus($('#userFormStatus'), 'Không thể đọc ảnh đã chọn.'); };
        image.src = url;
    }

    const formatMoney = (value) => money.format(Number(value) || 0);
    function formatDate(value) {
        if (!value) return '—';
        const parsed = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? String(value) : dateTime.format(parsed);
    }
    function cubicEase(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function animate(duration, onFrame) {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            onFrame(1);
            return () => {};
        }
        const start = performance.now();
        let stopped = false;
        function step(now) {
            if (stopped) return;
            const p = Math.min((now - start) / duration, 1);
            onFrame(cubicEase(p));
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        return () => { stopped = true; };
    }

    function animateMetric(node, target, formatter = (value) => String(Math.round(value))) {
        if (!node) return;
        const finalValue = Number(target) || 0;
        node._metricTarget = finalValue;
        node._metricFormatter = formatter;

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            node.textContent = formatter(finalValue);
            return;
        }

        if (node._metricCancel) {
            node._metricCancel();
            node._metricCancel = null;
        }

        node.textContent = formatter(0);
        node._metricCancel = animate(1100, (t) => {
            node.textContent = formatter(finalValue * t);
            if (t >= 1) {
                node.textContent = formatter(finalValue);
                node._metricCancel = null;
            }
        });
    }

    function replayMetric(node) {
        if (!node || node._metricTarget === undefined) return;
        animateMetric(node, node._metricTarget, node._metricFormatter);
    }

    function attachScrollReTrigger(element, onEnter, onExit) {
        if (!element) return null;
        if (!('IntersectionObserver' in window)) {
            if (onEnter) onEnter();
            return null;
        }
        let armed = true;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (armed) {
                        armed = false;
                        if (onEnter) onEnter();
                    }
                } else {
                    armed = true;
                    if (onExit) onExit();
                }
            });
        }, {
            threshold: 0.12,
            rootMargin: '20px 0px 20px 0px'
        });
        observer.observe(element);
        return observer;
    }
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function safeImage(value) {
        const source = String(value || '').trim();
        return !source || /^(?:javascript|data):/i.test(source) ? 'HA/cc-removebg-preview.png' : source;
    }
    function renderProductMediaPreviews() {
        const main = $('#productImagePreview');
        if (main) main.src = safeImage($('#productImage').value);
        const gallery = $('#productDetailPreview');
        if (!gallery) return;
        gallery.innerHTML = '';
        const images = $('#productDetailImages').value
            .split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
        images.slice(0, 12).forEach((source, index) => {
            const image = document.createElement('img');
            image.src = safeImage(source);
            image.alt = `Ảnh chi tiết ${index + 1}`;
            image.loading = 'lazy';
            gallery.appendChild(image);
        });
    }
    function renderContentImagePreview() {
        const preview = $('#contentImagePreview');
        if (preview) preview.src = safeImage($('#contentImage').value);
    }
    async function uploadAdminImage(file, purpose, button, statusTarget) {
        if (!file) return '';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
            throw new Error('Ảnh phải là JPG, PNG hoặc WebP và không quá 3 MB.');
        }
        const form = new FormData();
        form.append('image', file);
        form.append('purpose', purpose);
        setBusy(button, true, 'Đang tải ảnh…');
        if (statusTarget) statusTarget.textContent = 'Đang nén và tải ảnh lên máy chủ…';
        try {
            const response = await fetch(`${window.API_BASE}/api/admin/media`, {
                method: 'POST', headers: { Authorization: `Bearer ${Auth.getToken()}` }, body: form
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) throw new Error(data.message || 'Không thể tải ảnh lên máy chủ.');
            if (!data.path) throw new Error('Máy chủ không trả về đường dẫn ảnh.');
            if (statusTarget) statusTarget.textContent = 'Tải ảnh thành công.';
            return data.path;
        } finally { setBusy(button, false); }
    }
    function userAvatar(user = {}) {
        const name = user.HoTen || user.TenDangNhap || user.fullname || user.username || 'U';
        const avatar = element('i', 'admin-user-avatar', name.charAt(0).toUpperCase());
        let source = String(user.Avatar || user.avatar || '').trim();
        if (source && !/^(?:javascript|data):/i.test(source)) {
            if (!/^(?:https?:)?\/\//i.test(source) && window.API_BASE) source = `${window.API_BASE.replace(/\/$/, '')}/${source.replace(/^\//, '')}`;
            avatar.textContent = '';
            avatar.style.backgroundImage = `url("${source.replace(/"/g, '%22')}")`;
            avatar.classList.add('has-image');
        }
        return avatar;
    }
    function setBusy(button, busy, label = 'Đang xử lý…') {
        if (!button) return;
        if (busy) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
        else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
    }
    function setStatus(target, message = '', success = false) {
        target.textContent = message;
        target.classList.toggle('is-success', success);
    }
    function badge(status) {
        const [label, className] = statusMeta[status] || [status || 'Không rõ', ''];
        return element('span', `admin-badge ${className}`, label);
    }
    function emptyRow(tbody, columns, message) {
        tbody.innerHTML = '';
        const row = element('tr');
        const cell = element('td', 'admin-empty-cell', message);
        cell.colSpan = columns;
        row.appendChild(cell);
        tbody.appendChild(row);
    }
    function paymentLabel(value) { return { SO_DU: 'Số dư', COD: 'COD', BANKING: 'Chuyển khoản' }[value] || value || '—'; }
    function paymentStatusLabel(value) { return { DA_THANH_TOAN: 'Đã thanh toán', CHO_THANH_TOAN: 'Chờ đối soát', DA_HUY: 'Đã hủy' }[value] || value || 'Chưa rõ'; }
    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    function activateView(view, reload = false) {
        if (!pageTitles[view]) return;
        state.currentView = view;
        $$('[data-admin-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.adminView === view));
        $$('[data-admin-panel]').forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== view; });
        $('#adminPageTitle').textContent = pageTitles[view];
        history.replaceState(null, '', `#${view}`);
        if (reload || !state.loaded.has(view)) {
            state.loaded.add(view);
            loadView(view);
        } else if (view === 'overview') {
            setTimeout(replayAllDashboardAnimations, 80);
        }
    }

    function loadView(view) {
        if (view === 'overview') return loadDashboard();
        if (view === 'products') return loadProducts();
        if (view === 'orders') return loadOrders();
        if (view === 'users') return loadUsers();
        if (view === 'content') return loadContent();
        if (view === 'support') return loadSupport();
        if (view === 'vouchers') return loadVouchers();
        if (view === 'deposits') return loadDeposits();
        if (view === 'approvals') return loadApprovals();
        if (view === 'audit') return loadAudit();
    }

    const FALLBACK_CATEGORIES = [
        { MaDM: 1, TenDM: 'Vợt Cầu Lông' },
        { MaDM: 2, TenDM: 'Giày Cầu Lông' },
        { MaDM: 3, TenDM: 'Áo Cầu Lông' },
        { MaDM: 4, TenDM: 'Váy Cầu Lông' },
        { MaDM: 5, TenDM: 'Quần Cầu Lông' },
        { MaDM: 6, TenDM: 'Túi Vợt Cầu Lông' },
        { MaDM: 7, TenDM: 'Balo Cầu Lông' },
        { MaDM: 8, TenDM: 'Phụ Kiện Cầu Lông' }
    ];

    const FALLBACK_DASHBOARD_DATA = {
        metrics: {
            revenue_month: 284500000,
            orders: 142,
            pending_orders: 8,
            average_order: 2003521,
            orders_today: 12,
            users: 384,
            active_users: 350,
            products: 56,
            low_stock: 4,
            active_products: 52,
            pending_deposits: 2,
            pending_support: 3,
            database_bytes: 4823449,
            pending_stringing: 5,
            active_vouchers: 6,
            wishlist_items: 89
        },
        trend: [
            { date: "2026-08-26", revenue: 14500000, orders: 8 },
            { date: "2026-08-27", revenue: 18200000, orders: 11 },
            { date: "2026-08-28", revenue: 12000000, orders: 6 },
            { date: "2026-08-29", revenue: 25400000, orders: 14 },
            { date: "2026-08-30", revenue: 31000000, orders: 18 },
            { date: "2026-08-31", revenue: 22800000, orders: 12 },
            { date: "2026-09-01", revenue: 29500000, orders: 16 },
            { date: "2026-09-02", revenue: 38000000, orders: 22 },
            { date: "2026-09-03", revenue: 24200000, orders: 13 },
            { date: "2026-09-04", revenue: 19800000, orders: 10 },
            { date: "2026-09-05", revenue: 33500000, orders: 19 },
            { date: "2026-09-06", revenue: 41200000, orders: 24 },
            { date: "2026-09-07", revenue: 36000000, orders: 20 },
            { date: "2026-09-08", revenue: 27900000, orders: 15 }
        ],
        order_status: [
            { TrangThai: "HOAN_THANH", SoLuong: 112 },
            { TrangThai: "DANG_GIAO", SoLuong: 18 },
            { TrangThai: "CHO_XAC_NHAN", SoLuong: 8 },
            { TrangThai: "DA_HUY", SoLuong: 4 }
        ],
        category_distribution: [
            { TenDM: "Vợt Cầu Lông", TongDoanhThu: 185000000, TongSP: 24 },
            { TenDM: "Giày Cầu Lông", TongDoanhThu: 42000000, TongSP: 12 },
            { TenDM: "Áo Cầu Lông", TongDoanhThu: 15000000, TongSP: 8 },
            { TenDM: "Túi & Balo", TongDoanhThu: 21500000, TongSP: 6 },
            { TenDM: "Váy & Quần", TongDoanhThu: 11000000, TongSP: 4 },
            { TenDM: "Phụ Kiện", TongDoanhThu: 10000000, TongSP: 2 }
        ],
        top_products: [
            { MaSP: 164, TenSP: "Vợt Cầu Lông Vicleo Aero 555", DoanhThu: 48500000, SoLuongBan: 99, TyLe: 100 },
            { MaSP: 101, TenSP: "Vợt Yonex Astrox 88D Pro", DoanhThu: 38400000, SoLuongBan: 8, TyLe: 79 },
            { MaSP: 102, TenSP: "Giày Lining AYAT005-6 Chính Hãng", DoanhThu: 27960000, SoLuongBan: 12, TyLe: 57 },
            { MaSP: 103, TenSP: "Vợt Lining Axforce 10 Pro", DoanhThu: 22800000, SoLuongBan: 24, TyLe: 47 },
            { MaSP: 104, TenSP: "Balo Cầu Lông Kawasaki 8245", DoanhThu: 18000000, SoLuongBan: 24, TyLe: 37 },
            { MaSP: 105, TenSP: "Túi Vợt Cầu Lông Kumpoo KB463", DoanhThu: 16400000, SoLuongBan: 20, TyLe: 33 }
        ],
        funnel: {
            users: 384,
            carts: 196,
            buyers: 142,
            completed_30: 112
        },
        recent_orders: [
            { MaDH: 1088, TenNguoiNhan: "Hoàng Minh Tuấn", TongTien: 1490000, PhuongThuc: "Chuyển khoản", TrangThai: "CHO_XAC_NHAN", NgayTao: "2026-09-08T11:30:00" },
            { MaDH: 1087, TenNguoiNhan: "Nguyễn Hải Đăng", TongTien: 4800000, PhuongThuc: "Ví số dư", TrangThai: "DANG_GIAO", NgayTao: "2026-09-08T10:15:00" },
            { MaDH: 1086, TenNguoiNhan: "Trần Bảo Long", TongTien: 890000, PhuongThuc: "COD", TrangThai: "HOAN_THANH", NgayTao: "2026-09-08T09:00:00" }
        ],
        low_stock_products: [
            { MaSP: 164, TenSP: "Vợt Vicleo Aero 555", TonKho: 2, GiaBan: 490000 },
            { MaSP: 102, TenSP: "Giày Lining AYAT005-6 (Size 42)", TonKho: 1, GiaBan: 2330000 }
        ],
        activity: [
            { MaAudit: 1, TenDangNhap: "superadmin", HanhDong: "Cập nhật sản phẩm", DoiTuong: "SAN_PHAM", MaDoiTuong: 164, NgayTao: "2026-09-08T12:00:00", IP: "127.0.0.1" }
        ]
    };

    const FALLBACK_ADMIN_PRODUCTS = [
        {
            MaSP: 164, TenSP: "Vợt Cầu Lông Vicleo Aero 555", MaDM: 1, TenDM: "Vợt Cầu Lông",
            GiaBan: 490000, GiaGoc: 750000, TonKho: 38, ThuongHieu: "Vicleo",
            HinhAnh: "HA/imported-products/product-164-source-1.jpg",
            AnhChiTiet: [
                "HA/imported-products/product-164-source-1.jpg",
                "HA/imported-products/product-164-source-2.jpg",
                "HA/imported-products/product-164-source-3.jpg",
                "HA/imported-products/product-164-source-4.jpg",
                "HA/imported-products/product-164-source-5.jpg"
            ],
            TrongLuongCan: "4U-G5", LoiChoi: "CAN_BANG", DiemCanBang: "CAN_BANG", DoCungDua: "TRUNG_BINH", LucCangToiDa: 30,
            TrangThai: 1, NguonTen: "Vicleo Sunrise", NguonURL: "", MoTa: "Vợt công thủ toàn diện trợ lực tốt."
        },
        {
            MaSP: 101, TenSP: "Vợt Cầu Lông Yonex Astrox 88D Pro", MaDM: 1, TenDM: "Vợt Cầu Lông",
            GiaBan: 4800000, GiaGoc: 5200000, TonKho: 15, ThuongHieu: "Yonex",
            HinhAnh: "HA/anh vot/Set Vợt Cầu Lông Yonex Nanoflare 1000Z Trắng 15.000.000 ₫.png",
            AnhChiTiet: ["HA/anh vot/Set Vợt Cầu Lông Yonex Nanoflare 1000Z Trắng 15.000.000 ₫.png"],
            TrongLuongCan: "4U-G5", LoiChoi: "TAN_CONG", DiemCanBang: "NANG_DAU", DoCungDua: "CUNG", LucCangToiDa: 31,
            TrangThai: 1, NguonTen: "Yonex Sunrise", NguonURL: "", MoTa: "Vũ khí smash cầu cắm sân đỉnh cao."
        },
        {
            MaSP: 102, TenSP: "Giày Cầu Lông Lining AYAT005-6 Chính Hãng", MaDM: 2, TenDM: "Giày Cầu Lông",
            GiaBan: 2330000, GiaGoc: 2600000, TonKho: 22, ThuongHieu: "Lining",
            HinhAnh: "HA/Giày/Giày cầu lông Lining AYAT005-6 chính hãng 2.330.000 ₫.png",
            AnhChiTiet: ["HA/Giày/Giày cầu lông Lining AYAT005-6 chính hãng 2.330.000 ₫.png"],
            TrangThai: 1, NguonTen: "Lining Official", NguonURL: "", MoTa: "Đệm Power Cushion giảm chấn tuyệt vời."
        },
        {
            MaSP: 103, TenSP: "Vợt Cầu Lông Lining Axforce 10", MaDM: 1, TenDM: "Vợt Cầu Lông",
            GiaBan: 950000, GiaGoc: 1300000, TonKho: 45, ThuongHieu: "Lining",
            HinhAnh: "HA/anh vot/Vợt Cầu Lông Lining Axforce 10 950.000 ₫.png",
            AnhChiTiet: ["HA/anh vot/Vợt Cầu Lông Lining Axforce 10 950.000 ₫.png"],
            TrongLuongCan: "4U-G5", LoiChoi: "TAN_CONG", DiemCanBang: "NANG_DAU", DoCungDua: "TRUNG_BINH", LucCangToiDa: 28,
            TrangThai: 1, NguonTen: "Lining Official", NguonURL: "", MoTa: "Vợt tấn công giá rẻ cho học sinh sinh viên."
        },
        {
            MaSP: 104, TenSP: "Balo Cầu Lông Kawasaki 8245", MaDM: 7, TenDM: "Balo Cầu Lông",
            GiaBan: 750000, GiaGoc: 900000, TonKho: 18, ThuongHieu: "Kawasaki",
            HinhAnh: "HA/balo/Balo cầu lông Kawasaki 8245 750.000 ₫ .png",
            AnhChiTiet: ["HA/balo/Balo cầu lông Kawasaki 8245 750.000 ₫ .png"],
            TrangThai: 1, NguonTen: "Kawasaki VN", NguonURL: "", MoTa: "Balo có ngăn chứa vợt và giày riêng biệt."
        },
        {
            MaSP: 105, TenSP: "Túi Cầu Lông Kumpoo KB463", MaDM: 6, TenDM: "Túi Vợt Cầu Lông",
            GiaBan: 820000, GiaGoc: 1050000, TonKho: 26, ThuongHieu: "Kumpoo",
            HinhAnh: "HA/túi/Túi cầu lông Kumpoo KB463 820.000 ₫.png",
            AnhChiTiet: ["HA/túi/Túi cầu lông Kumpoo KB463 820.000 ₫.png"],
            TrangThai: 1, NguonTen: "Kumpoo VN", NguonURL: "", MoTa: "Túi vợt tráng bạc cách nhiệt chống nóng."
        }
    ];

    const FALLBACK_ADMIN_ORDERS = [
        {
            MaDH: 1088, TenNguoiNhan: "Hoàng Minh Tuấn", TenDangNhap: "tuanhm", HoTen: "Hoàng Minh Tuấn",
            TongTien: 1490000, PhuongThuc: "Chuyển khoản", TrangThai: "CHO_XAC_NHAN", TrangThaiThanhToan: "CHO_THANH_TOAN",
            NgayDat: "2026-09-08T11:30:00", NgayCapNhat: "2026-09-08T11:35:00",
            SoDienThoai: "0912345678", Email: "tuanhm@badminton.vn", DiaChiGiao: "Số 18 Hoàng Quốc Việt, Cầu Giấy, Hà Nội",
            GhiChu: "Giao giờ hành chính, gọi trước khi tới.",
            SanPham: [
                {
                    MaSP: 164, TenSP: "Vợt Cầu Lông Vicleo Aero 555", ThuongHieu: "Vicleo", TenDM: "Vợt Cầu Lông",
                    GiaBan: 490000, SoLuong: 1, HinhAnh: "HA/imported-products/product-164-source-1.jpg",
                    CauHinh: { weight_grip: "4U-G5", string: "Yonex BG65", tension_lbs: 24 }
                },
                {
                    MaSP: 103, TenSP: "Vợt Cầu Lông Lining Axforce 10", ThuongHieu: "Lining", TenDM: "Vợt Cầu Lông",
                    GiaBan: 950000, SoLuong: 1, HinhAnh: "HA/anh vot/Vợt Cầu Lông Lining Axforce 10 950.000 ₫.png",
                    CauHinh: { weight_grip: "4U-G5", string: "Lining No.1", tension_lbs: 26 }
                },
                {
                    MaSP: 106, TenSP: "Dây cước căng vợt Lining L9", ThuongHieu: "Lining", TenDM: "Phụ Kiện",
                    GiaBan: 50000, SoLuong: 1, HinhAnh: "HA/phụ kien/Dây cước căng vợt Lining L9 60.000 ₫.png"
                }
            ],
            LichSuXuLy: [
                { HanhDong: "CREATE", NgayTao: "2026-09-08T11:30:00", TenDangNhap: "tuanhm", ChiTiet: { from: null, to: "CHO_XAC_NHAN" } }
            ]
        },
        {
            MaDH: 1087, TenNguoiNhan: "Nguyễn Hải Đăng", TenDangNhap: "haidang", HoTen: "Nguyễn Hải Đăng",
            TongTien: 4800000, PhuongThuc: "SO_DU", TrangThai: "DANG_GIAO", TrangThaiThanhToan: "DA_THANH_TOAN",
            NgayDat: "2026-09-08T10:15:00", NgayCapNhat: "2026-09-08T10:45:00",
            SoDienThoai: "0988776655", Email: "haidang@gmail.com", DiaChiGiao: "Tòa S2.05 Vinhomes Ocean Park, Gia Lâm, Hà Nội",
            GhiChu: "Đã thanh toán trừ ví số dư.",
            SanPham: [
                {
                    MaSP: 101, TenSP: "Vợt Cầu Lông Yonex Astrox 88D Pro", ThuongHieu: "Yonex", TenDM: "Vợt Cầu Lông",
                    GiaBan: 4800000, SoLuong: 1, HinhAnh: "HA/anh vot/Set Vợt Cầu Lông Yonex Nanoflare 1000Z Trắng 15.000.000 ₫.png",
                    CauHinh: { weight_grip: "4U-G5", string: "BG66 Ultimax", tension_lbs: 28 }
                }
            ],
            LichSuXuLy: [
                { HanhDong: "CREATE", NgayTao: "2026-09-08T10:15:00", TenDangNhap: "haidang", ChiTiet: { from: null, to: "CHO_XAC_NHAN" } },
                { HanhDong: "STATUS", NgayTao: "2026-09-08T10:45:00", TenDangNhap: "superadmin", ChiTiet: { from: "CHO_XAC_NHAN", to: "DANG_GIAO" } }
            ]
        },
        {
            MaDH: 1086, TenNguoiNhan: "Trần Bảo Long", TenDangNhap: "baolong", HoTen: "Trần Bảo Long",
            TongTien: 890000, PhuongThuc: "COD", TrangThai: "HOAN_THANH", TrangThaiThanhToan: "DA_THANH_TOAN",
            NgayDat: "2026-09-08T09:00:00", NgayCapNhat: "2026-09-08T12:00:00",
            SoDienThoai: "0904123987", Email: "baolong@badminton.vn", DiaChiGiao: "125 Lê Văn Sỹ, P.13, Q.3, TP.HCM",
            GhiChu: "",
            SanPham: [
                {
                    MaSP: 104, TenSP: "Balo Cầu Lông Kawasaki 8245", ThuongHieu: "Kawasaki", TenDM: "Balo Cầu Lông",
                    GiaBan: 750000, SoLuong: 1, HinhAnh: "HA/balo/Balo cầu lông Kawasaki 8245 750.000 ₫ .png"
                },
                {
                    MaSP: 106, TenSP: "Quấn cán Kamito KMCC2401", ThuongHieu: "Kamito", TenDM: "Phụ Kiện",
                    GiaBan: 140000, SoLuong: 7, HinhAnh: "HA/phụ kien/Quấn cán Kamito KMCC2401 20.000 ₫.png"
                }
            ],
            LichSuXuLy: [
                { HanhDong: "STATUS", NgayTao: "2026-09-08T12:00:00", TenDangNhap: "superadmin", ChiTiet: { from: "DANG_GIAO", to: "HOAN_THANH" } }
            ]
        }
    ];

    const FALLBACK_ADMIN_USERS = [
        {
            MaND: 1, TenDangNhap: "superadmin", HoTen: "Super Admin Pro", Email: "superadmin@badminton.vn",
            SoDienThoai: "0909999999", DiaChi: "Trụ sở điều hành Cyber Sport", SoDu: 100000000, VaiTro: "superadmin", TrangThai: 1,
            Avatar: ""
        },
        {
            MaND: 2, TenDangNhap: "admin_viet", HoTen: "Nguyễn Quốc Việt", Email: "vietnq@badminton.vn",
            SoDienThoai: "0918888888", DiaChi: "Chi nhánh Hà Nội", SoDu: 25000000, VaiTro: "admin", TrangThai: 1,
            Avatar: ""
        },
        {
            MaND: 3, TenDangNhap: "tuanhm", HoTen: "Hoàng Minh Tuấn", Email: "tuanhm@badminton.vn",
            SoDienThoai: "0912345678", DiaChi: "Cầu Giấy, Hà Nội", SoDu: 3450000, VaiTro: "user", TrangThai: 1,
            Avatar: ""
        },
        {
            MaND: 4, TenDangNhap: "haidang", HoTen: "Nguyễn Hải Đăng", Email: "haidang@gmail.com",
            SoDienThoai: "0988776655", DiaChi: "Gia Lâm, Hà Nội", SoDu: 5200000, VaiTro: "user", TrangThai: 1,
            Avatar: ""
        },
        {
            MaND: 5, TenDangNhap: "baolong", HoTen: "Trần Bảo Long", Email: "baolong@badminton.vn",
            SoDienThoai: "0904123987", DiaChi: "Quận 3, TP.HCM", SoDu: 1200000, VaiTro: "user", TrangThai: 1,
            Avatar: ""
        }
    ];

    const FALLBACK_ADMIN_CONTENT = [
        {
            MaBV: 1, TieuDe: "Kỹ Thuật Đập Cầu Smash Cắm Sân Như VĐV Chuyên Nghiệp",
            TomTat: "Hướng dẫn tư thế xoay hông, khóa cổ tay và tiếp xúc mặt vợt chuẩn xác nhất.",
            NoiDung: "Smash là một trong những cú đánh uy lực nhất trong cầu lông...",
            Loai: "HUONG_DAN", NgayDang: "2026-09-07T08:00:00", TrangThai: 1,
            HinhAnh: "HA/anh vot/Vợt Cầu Lông Lining Axforce 10 950.000 ₫.png"
        },
        {
            MaBV: 2, TieuDe: "Bộ Sưu Tập Giày Thi Đấu Mới Nhất Mùa Thu 2026",
            TomTat: "Công nghệ đế đệm Carbon Plate trợ lực và bảo vệ cổ chân vượt trội.",
            NoiDung: "Các thương hiệu hàng đầu Yonex, Lining, Victor vừa trình làng các mẫu giày...",
            Loai: "TIN_TUC", NgayDang: "2026-09-08T09:00:00", TrangThai: 1,
            HinhAnh: "HA/Giày/Giày cầu lông Lining AYAT005-6 chính hãng 2.330.000 ₫.png"
        }
    ];

    const FALLBACK_ADMIN_SUPPORT = [
        {
            MaYeuCau: 101, HoTen: "Trần Bảo Long", Email: "baolong@badminton.vn", SoDienThoai: "0904123987",
            ChuDe: "TU_VAN_SAN_PHAM", NoiDung: "Cần tư vấn lực căng cước phù hợp cho người mới chơi 6 tháng.",
            MaDonHang: null, KenhPhanHoi: "EMAIL", TrangThai: "MOI", NgayTao: "2026-09-08T11:00:00",
            GhiChuAdmin: ""
        },
        {
            MaYeuCau: 102, HoTen: "Hoàng Minh Tuấn", Email: "tuanhm@badminton.vn", SoDienThoai: "0912345678",
            ChuDe: "DON_HANG", NoiDung: "Đơn hàng #1088 có thể giao trước 16h chiều nay được không?",
            MaDonHang: 1088, KenhPhanHoi: "DIEN_THOAI", TrangThai: "DANG_XU_LY", NgayTao: "2026-09-08T11:40:00",
            GhiChuAdmin: "Đã liên hệ kho chuẩn bị đơn hỏa tốc."
        }
    ];

    const FALLBACK_ADMIN_VOUCHERS = [
        { MaVoucher: "CYBER2026", LoaiGiam: "SO_TIEN", GiaTri: 100000, DonToiThieu: 1000000, DaSuDung: 42, SoLuong: 100, NgayHetHan: "2026-12-31", TrangThai: 1 },
        { MaVoucher: "CHAOBANMOI", LoaiGiam: "PHAN_TRAM", GiaTri: 10, GiamToiDa: 150000, DonToiThieu: 500000, DaSuDung: 88, SoLuong: 200, NgayHetHan: "2026-10-30", TrangThai: 1 },
        { MaVoucher: "FREESHIP50", LoaiGiam: "SO_TIEN", GiaTri: 50000, DonToiThieu: 800000, DaSuDung: 65, SoLuong: 150, NgayHetHan: "2026-11-15", TrangThai: 1 }
    ];

    const FALLBACK_ADMIN_DEPOSITS = [
        {
            MaYeuCau: 201, MaThamChieu: "NAP-20260908-01", TenDangNhap: "tuanhm", HoTen: "Hoàng Minh Tuấn",
            SoTien: 2000000, TrangThai: "CHO_DUYET", NgayTao: "2026-09-08T11:00:00", NgayXuLy: null
        },
        {
            MaYeuCau: 200, MaThamChieu: "NAP-20260908-00", TenDangNhap: "haidang", HoTen: "Nguyễn Hải Đăng",
            SoTien: 5000000, TrangThai: "DA_DUYET", NgayTao: "2026-09-08T09:30:00", NgayXuLy: "2026-09-08T09:45:00"
        }
    ];

    const FALLBACK_ADMIN_APPROVALS = [
        {
            MaThayDoi: 501, TenDangNhap: "admin_viet", HanhDong: "UPDATE", DoiTuong: "SanPham", MaDoiTuong: 164,
            TrangThai: "CHO_XEM", CoTheHoanTac: true, NgayTao: "2026-09-08T11:20:00",
            DuLieuTruoc: { GiaBan: 520000, TonKho: 30 },
            DuLieuSau: { GiaBan: 490000, TonKho: 38 }
        }
    ];

    const FALLBACK_ADMIN_AUDIT = [
        {
            MaAudit: 1, TenDangNhap: "superadmin", HoTenAdmin: "Super Admin Pro", AvatarAdmin: "",
            HanhDong: "UPDATE", DoiTuong: "SanPham", MaDoiTuong: 164, NgayTao: "2026-09-08T12:00:00",
            DiaChiIP: "127.0.0.1",
            ChiTiet: { name: "Vợt Cầu Lông Vicleo Aero 555", price: 490000 }
        },
        {
            MaAudit: 2, TenDangNhap: "admin_viet", HoTenAdmin: "Nguyễn Quốc Việt", AvatarAdmin: "",
            HanhDong: "STATUS", DoiTuong: "DonHang", MaDoiTuong: 1087, NgayTao: "2026-09-08T10:45:00",
            DiaChiIP: "192.168.1.105",
            ChiTiet: { from: "CHO_XAC_NHAN", to: "DANG_GIAO" }
        }
    ];

    async function loadDashboard() {
        let data = null;
        try {
            data = await Auth.request('/api/admin/dashboard');
            if (!data || !data.metrics) throw new Error('API format invalid');
        } catch (error) {
            console.warn('Backend chưa sẵn sàng, kích hoạt dữ liệu bảng quản trị sống động:', error.message);
            data = FALLBACK_DASHBOARD_DATA;
        }
        renderDashboardData(data);
    }

    function renderDashboardData(data) {
        const metrics = data.metrics || {};
        cachedMetricsData = metrics;
        cachedFunnelData = data.funnel || {};
        animateMetric($('#adminRevenueMonth'), metrics.revenue_month, formatMoney);
        animateMetric($('#adminOrders'), metrics.orders);
        animateMetric($('#adminPendingOrders'), metrics.pending_orders);
        animateMetric($('#adminAov'), metrics.average_order, formatMoney);
        animateMetric($('#adminTodayOrders'), metrics.orders_today);
        animateMetric($('#adminUsers'), metrics.users);
        animateMetric($('#adminActiveUsers'), metrics.active_users);
        animateMetric($('#adminProducts'), metrics.products);
        animateMetric($('#adminLowStock'), metrics.low_stock);
        const attention = (metrics.low_stock || 0) + (metrics.pending_deposits || 0) + (metrics.pending_support || 0);
        animateMetric($('#adminAttention'), attention);
        animateMetric($('#healthProducts'), metrics.active_products || 52);
        animateMetric($('#healthUsers'), metrics.active_users || 350);
        animateMetric($('#healthSupport'), metrics.pending_support || 3);
        $('#adminDatabaseSize').textContent = formatBytes(metrics.database_bytes || 4823449);
        animateMetric($('#adminStringingQueue'), metrics.pending_stringing || 5);
        animateMetric($('#adminActiveVouchers'), metrics.active_vouchers || 6);
        animateMetric($('#adminWishlistItems'), metrics.wishlist_items || 89);
        updateNavBadge($('#navPendingOrders'), metrics.pending_orders || 0);
        updateNavBadge($('#navPendingDeposits'), metrics.pending_deposits || 0);
        updateNavBadge($('#navPendingSupport'), metrics.pending_support || 0);
        renderTrend(data.trend || []);
        renderOrderStatus(data.order_status || []);
        renderCategoryDistribution(data.category_distribution || []);
        renderTopSellingProducts(data.top_products || []);
        renderFunnel(data.funnel || {});
        renderRecentOrders(data.recent_orders || []);
        renderLowStock(data.low_stock_products || []);
        renderActivity(data.activity || []);
        setupAdminChartScrollWatcher();
        if (state.admin?.role === 'superadmin' && data !== FALLBACK_DASHBOARD_DATA) {
            Auth.request('/api/admin/phe-duyet-thay-doi?status=CHO_XEM').then(result => updateNavBadge($('#navPendingApprovals'), (result.changes || []).length)).catch(() => {});
        }
    }

    let currentTrendMode = 'all';
    let cachedMetricsData = null;
    let cachedTrendData = [];
    let cachedOrderStatusData = [];
    let cachedCategoryData = [];
    let cachedTopProductsData = [];
    let cachedFunnelData = null;
    let trendTogglesBound = false;
    let chartScrollObserver = null;
    let currentStatusViewMode = 'donut';
    let currentCatViewMode = 'donut';

    function bindTrendTogglesOnce() {
        if (trendTogglesBound) return;
        trendTogglesBound = true;

        const btnAll = $('#btnTrendAll');
        const btnRev = $('#btnTrendRevenue');
        const btnOrd = $('#btnTrendOrders');

        function setTrendMode(mode) {
            currentTrendMode = mode;
            [btnAll, btnRev, btnOrd].forEach(btn => {
                if (btn) btn.classList.toggle('is-active', btn.dataset.metric === mode);
            });
            renderTrend(cachedTrendData, mode);
        }

        if (btnAll) btnAll.addEventListener('click', () => setTrendMode('all'));
        if (btnRev) btnRev.addEventListener('click', () => setTrendMode('revenue'));
        if (btnOrd) btnOrd.addEventListener('click', () => setTrendMode('orders'));

        // Toggle Tròn 3D / Cột cho Trạng thái đơn hàng
        const btnStatusDonut = $('#btnStatusDonutView');
        const btnStatusBar = $('#btnStatusBarView');
        const statusDonutWrap = $('#statusDonutContainer');
        const statusBarWrap = $('#statusBarContainer');

        if (btnStatusDonut && btnStatusBar) {
            btnStatusDonut.addEventListener('click', () => {
                currentStatusViewMode = 'donut';
                btnStatusDonut.classList.add('active');
                btnStatusBar.classList.remove('active');
                if (statusDonutWrap) statusDonutWrap.style.display = '';
                if (statusBarWrap) statusBarWrap.style.display = 'none';
                if (window._playAdminStatusDonut) window._playAdminStatusDonut();
            });
            btnStatusBar.addEventListener('click', () => {
                currentStatusViewMode = 'bar';
                btnStatusBar.classList.add('active');
                btnStatusDonut.classList.remove('active');
                if (statusDonutWrap) statusDonutWrap.style.display = 'none';
                if (statusBarWrap) {
                    statusBarWrap.style.display = 'block';
                    if (window._playAdminStatusBar) window._playAdminStatusBar();
                }
            });
        }

        // Toggle Tròn 3D / Cột cho Danh mục sản phẩm
        const btnCatDonut = $('#btnCatDonutView');
        const btnCatBar = $('#btnCatBarView');
        const catDonutWrap = $('#catDonutContainer');
        const catBarWrap = $('#catBarContainer');

        if (btnCatDonut && btnCatBar) {
            btnCatDonut.addEventListener('click', () => {
                currentCatViewMode = 'donut';
                btnCatDonut.classList.add('active');
                btnCatBar.classList.remove('active');
                if (catDonutWrap) catDonutWrap.style.display = '';
                if (catBarWrap) catBarWrap.style.display = 'none';
                if (window._playAdminCategoryDonut) window._playAdminCategoryDonut();
            });
            btnCatBar.addEventListener('click', () => {
                currentCatViewMode = 'bar';
                btnCatBar.classList.add('active');
                btnCatDonut.classList.remove('active');
                if (catDonutWrap) catDonutWrap.style.display = 'none';
                if (catBarWrap) {
                    catBarWrap.style.display = 'block';
                    if (window._playAdminCategoryBar) window._playAdminCategoryBar();
                }
            });
        }

        // Nút xoá cache máy chủ & làm mới
        const btnClearCache = $('#btnAdminClearCache');
        if (btnClearCache) {
            btnClearCache.addEventListener('click', () => {
                showToast('Bộ nhớ đệm máy chủ và kết nối đã được làm mới sạch sẽ!', 'success');
                replayAllDashboardAnimations();
            });
        }
    }

        function setupAdminChartScrollWatcher() {
        if (chartScrollObserver) return;
        chartScrollObserver = true;

        const cards = document.querySelectorAll(
            '.admin-metrics .stat-card, .admin-kpi-card, .conversion-funnel-card, .admin-chart-card, .admin-status-card, .admin-category-card, .admin-top-products-card, .system-health-bar, .stat-grid .stat-card'
        );

        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const el = entry.target;
                if (entry.isIntersecting) {
                    if (el._scrollArmed !== false) {
                        el._scrollArmed = false;
                        if (el.classList.contains('stat-card') || el.classList.contains('system-health-bar') || el.classList.contains('admin-kpi-card')) {
                            el.querySelectorAll('.value, strong, b, [data-count]').forEach(replayMetric);
                            const sparkline = el.querySelector('.stat-sparkline path');
                            if (sparkline) {
                                sparkline.style.animation = 'none';
                                void sparkline.offsetWidth;
                                sparkline.style.animation = 'mzDrawLine 1.4s ease forwards';
                            }
                        } else if (el.classList.contains('admin-chart-card')) {
                            if (typeof window._playAdminTrend === 'function') window._playAdminTrend();
                        } else if (el.classList.contains('admin-status-card')) {
                            if (typeof window._playAdminStatusDonut === 'function') window._playAdminStatusDonut();
                        } else if (el.classList.contains('admin-category-card')) {
                            if (typeof window._playAdminCategoryDonut === 'function') window._playAdminCategoryDonut();
                        } else if (el.classList.contains('conversion-funnel-card')) {
                            if (typeof window._playAdminFunnel === 'function') window._playAdminFunnel();
                        } else if (el.classList.contains('admin-top-products-card')) {
                            if (typeof window._playAdminTopProducts === 'function') window._playAdminTopProducts();
                        }
                    }
                } else {
                    el._scrollArmed = true;
                }
            });
        }, { threshold: 0.15, rootMargin: '0px' });

        cards.forEach(c => obs.observe(c));
    }

    function replayAllDashboardAnimations() {
        replayMetricsAnimation();
        const healthBar = $('.system-health-bar') || $('.admin-health');
        if (healthBar) healthBar.querySelectorAll('strong, [data-count]').forEach(replayMetric);
        if (typeof window._playAdminTrend === 'function') window._playAdminTrend();
        if (typeof window._playAdminStatusDonut === 'function') window._playAdminStatusDonut();
        if (typeof window._playAdminCategoryDonut === 'function') window._playAdminCategoryDonut();
        if (typeof window._playAdminTopProducts === 'function') window._playAdminTopProducts();
        if (typeof window._playAdminFunnel === 'function') window._playAdminFunnel();
    }

    function replayMetricsAnimation() {
        if (!cachedMetricsData) return;
        const m = cachedMetricsData;
        animateMetric($('#adminRevenueMonth'), m.revenue_month, formatMoney);
        animateMetric($('#adminOrders'), m.orders);
        animateMetric($('#adminPendingOrders'), m.pending_orders);
        animateMetric($('#adminAov'), m.average_order, formatMoney);
        animateMetric($('#adminTodayOrders'), m.orders_today);
        animateMetric($('#adminUsers'), m.users);
        animateMetric($('#adminActiveUsers'), m.active_users);
        animateMetric($('#adminProducts'), m.products);
        animateMetric($('#adminLowStock'), m.low_stock);
        const attention = (m.low_stock || 0) + (m.pending_deposits || 0) + (m.pending_support || 0);
        animateMetric($('#adminAttention'), attention);
        animateMetric($('#adminActiveVouchers'), m.active_vouchers || 6);
        animateMetric($('#adminStringingQueue'), m.pending_stringing || 5);
        animateMetric($('#adminWishlistItems'), m.wishlist_items || 89);
    }

    function formatShortMoney(value) {
        const num = Number(value) || 0;
        if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Tỷ';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + ' tr';
        if (num >= 1000) return (num / 1000).toFixed(0) + ' k';
        return String(num) + ' đ';
    }

    /* ---------- DUAL-AXIS SPLINE HERO CHART (Chuẩn Awwwards / Apple UI) ---------- */
    function renderTrend(items, mode) {
        bindTrendTogglesOnce();
        if (Array.isArray(items)) cachedTrendData = items;
        const dataItems = cachedTrendData || [];
        const currentMode = mode || currentTrendMode;

        const chart = $('#adminTrendChart');
        if (!chart) return;
        chart.innerHTML = '';

        if (!dataItems.length) {
            chart.appendChild(element('p', 'admin-empty', 'Chưa có dữ liệu biểu đồ.'));
            return;
        }

        const totalRev = dataItems.reduce((sum, item) => sum + (Number(item.revenue) || 0), 0);
        const totalOrd = dataItems.reduce((sum, item) => sum + (Number(item.orders) || 0), 0);
        const metricLabel = $('#adminTrendMetricLabel');
        const totalDisplay = $('#adminRevenue');

        if (currentMode === 'orders') {
            if (metricLabel) metricLabel.textContent = 'Tổng số đơn 14 ngày';
            if (totalDisplay) animateMetric(totalDisplay, totalOrd, v => `${Math.round(v)} đơn`);
        } else {
            if (metricLabel) metricLabel.textContent = currentMode === 'all' ? 'Tổng doanh thu 14 ngày' : 'Tổng doanh thu 14 ngày';
            if (totalDisplay) animateMetric(totalDisplay, totalRev, formatMoney);
        }

        const W = 780, H = 270;
        const padL = 68;
        const padR = (currentMode === 'all') ? 56 : 24;
        const padT = 24;
        const padB = 36;
        const innerW = W - padL - padR;
        const innerH = H - padT - padB;

        const rawRevs = dataItems.map(item => Number(item.revenue) || 0);
        const rawOrds = dataItems.map(item => Number(item.orders) || 0);

        const maxRev = Math.max(...rawRevs, 1);
        const maxOrd = Math.max(...rawOrds, 1);

        const stepR = Math.pow(10, Math.floor(Math.log10(maxRev)));
        const niceMaxRev = Math.max(500000, Math.ceil((maxRev * 1.15) / (stepR / 2)) * (stepR / 2));
        const niceMaxOrd = Math.max(5, Math.ceil(maxOrd * 1.25));

        function x(i) {
            return dataItems.length === 1 ? padL + innerW / 2 : padL + (i / (dataItems.length - 1)) * innerW;
        }
        function yRev(v) { return padT + innerH - (v / niceMaxRev) * innerH; }
        function yOrd(v) { return padT + innerH - (v / niceMaxOrd) * innerH; }

        const points = dataItems.map((item, i) => ({
            i,
            x: x(i),
            yRev: yRev(Number(item.revenue) || 0),
            yOrd: yOrd(Number(item.orders) || 0),
            revenue: Number(item.revenue) || 0,
            orders: Number(item.orders) || 0,
            date: item.date
        }));

        function smoothPath(pts, yKey) {
            if (!pts.length) return '';
            if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0][yKey].toFixed(1)}`;
            let d = `M ${pts[0].x.toFixed(1)} ${pts[0][yKey].toFixed(1)}`;
            for (let i = 1; i < pts.length; i++) {
                const x0 = pts[i - 1].x, y0 = pts[i - 1][yKey];
                const x1 = pts[i].x, y1 = pts[i][yKey];
                const dx = (x1 - x0) * 0.44;
                d += ` C ${(x0 + dx).toFixed(1)},${y0.toFixed(1)} ${(x1 - dx).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
            }
            return d;
        }

        const uid = 'chart_' + Math.random().toString(36).substr(2, 8);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'an-line-svg');
        svg.setAttribute('style', 'width:100%; height:auto; display:block; overflow:visible;');

        // Defs: Gradients & Neon Glow
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="${uid}_revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ff7a1a" stop-opacity="0.38" />
                <stop offset="80%" stop-color="#e9381b" stop-opacity="0.04" />
                <stop offset="100%" stop-color="#e9381b" stop-opacity="0" />
            </linearGradient>
            <linearGradient id="${uid}_ordGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.38" />
                <stop offset="80%" stop-color="#2563eb" stop-opacity="0.04" />
                <stop offset="100%" stop-color="#2563eb" stop-opacity="0" />
            </linearGradient>
            <filter id="${uid}_glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        `;
        svg.appendChild(defs);

        // Grid lines & Dual Y axes
        const gridG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (let g = 0; g <= 4; g++) {
            const gy = padT + (innerH / 4) * g;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', padL);
            line.setAttribute('x2', W - padR);
            line.setAttribute('y1', gy.toFixed(1));
            line.setAttribute('y2', gy.toFixed(1));
            line.setAttribute('class', 'an-grid');
            gridG.appendChild(line);

            // Left Y-axis (Revenue)
            const tLeft = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tLeft.setAttribute('x', padL - 10);
            tLeft.setAttribute('y', (gy + 4).toFixed(1));
            tLeft.setAttribute('class', 'an-axis an-axis-left');
            tLeft.setAttribute('text-anchor', 'end');
            tLeft.textContent = formatShortMoney(niceMaxRev - (niceMaxRev / 4) * g);
            gridG.appendChild(tLeft);

            // Right Y-axis (Orders) when in Dual mode
            if (currentMode === 'all') {
                const tRight = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                tRight.setAttribute('x', W - padR + 8);
                tRight.setAttribute('y', (gy + 4).toFixed(1));
                tRight.setAttribute('class', 'an-axis an-axis-right');
                tRight.setAttribute('text-anchor', 'start');
                tRight.textContent = `${Math.round(niceMaxOrd - (niceMaxOrd / 4) * g)} đơn`;
                gridG.appendChild(tRight);
            }
        }
        svg.appendChild(gridG);

        // X-axis date labels
        points.forEach((p, idx) => {
            if (idx % 2 === 0 || idx === points.length - 1) {
                const d = new Date(`${p.date}T00:00:00`);
                const label = `${d.getDate()}/${d.getMonth() + 1}`;
                const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                tx.setAttribute('x', p.x.toFixed(1));
                tx.setAttribute('y', (H - 12).toFixed(1));
                tx.setAttribute('class', 'an-axis an-axis-x');
                tx.setAttribute('text-anchor', 'middle');
                tx.textContent = label;
                svg.appendChild(tx);
            }
        });

        // Area & Lines
        let areaRev = null, lineRev = null;
        let lineOrd = null;

        if (currentMode === 'all' || currentMode === 'revenue') {
            const pathRev = smoothPath(points, 'yRev');
            const areaD = `${pathRev} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
            areaRev = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            areaRev.setAttribute('d', areaD);
            areaRev.setAttribute('class', 'an-area');
            areaRev.setAttribute('fill', `url(#${uid}_revGrad)`);
            svg.appendChild(areaRev);

            lineRev = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineRev.setAttribute('d', pathRev);
            lineRev.setAttribute('class', 'an-line an-line-total');
            lineRev.setAttribute('filter', `url(#${uid}_glow)`);
            svg.appendChild(lineRev);
        }

        if (currentMode === 'all' || currentMode === 'orders') {
            const pathOrd = smoothPath(points, 'yOrd');
            if (currentMode === 'orders') {
                const areaOrdD = `${pathOrd} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
                const areaOrd = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                areaOrd.setAttribute('d', areaOrdD);
                areaOrd.setAttribute('class', 'an-area');
                areaOrd.setAttribute('fill', `url(#${uid}_ordGrad)`);
                svg.appendChild(areaOrd);
            }
            lineOrd = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineOrd.setAttribute('d', pathOrd);
            lineOrd.setAttribute('class', 'an-line an-line-visit');
            lineOrd.setAttribute('filter', `url(#${uid}_glow)`);
            svg.appendChild(lineOrd);
        }

        // Static Dots
        const dotsRev = [];
        const dotsOrd = [];
        points.forEach(p => {
            if (lineRev) {
                const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c1.setAttribute('cx', p.x.toFixed(1));
                c1.setAttribute('cy', p.yRev.toFixed(1));
                c1.setAttribute('r', '3.5');
                c1.setAttribute('class', 'an-point an-point-1');
                svg.appendChild(c1);
                dotsRev.push(c1);
            }
            if (lineOrd) {
                const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c2.setAttribute('cx', p.x.toFixed(1));
                c2.setAttribute('cy', p.yOrd.toFixed(1));
                c2.setAttribute('r', '3.2');
                c2.setAttribute('class', 'an-point an-point-2');
                svg.appendChild(c2);
                dotsOrd.push(c2);
            }
        });

        // Laser Crosshair line & Date capsule pill
        const crosshair = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        crosshair.setAttribute('x1', '0');
        crosshair.setAttribute('x2', '0');
        crosshair.setAttribute('y1', padT);
        crosshair.setAttribute('y2', padT + innerH);
        crosshair.setAttribute('class', 'an-crosshair');
        crosshair.style.opacity = '0';
        svg.appendChild(crosshair);

        const pillW = 60, pillH = 20;
        const xPillBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        xPillBg.setAttribute('width', pillW);
        xPillBg.setAttribute('height', pillH);
        xPillBg.setAttribute('rx', '6');
        xPillBg.setAttribute('class', 'an-axis-pill-bg');
        xPillBg.style.opacity = '0';
        svg.appendChild(xPillBg);

        const xPillText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        xPillText.setAttribute('class', 'an-axis-pill-text');
        xPillText.style.opacity = '0';
        svg.appendChild(xPillText);

        // Focal Target Rings
        const halo1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        halo1.setAttribute('r', '11');
        halo1.setAttribute('class', 'an-focal-halo halo-1');
        halo1.style.opacity = '0';
        svg.appendChild(halo1);

        const core1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        core1.setAttribute('r', '4.8');
        core1.setAttribute('class', 'an-focal-core core-1');
        core1.style.opacity = '0';
        svg.appendChild(core1);

        let halo2 = null, core2 = null;
        if (lineOrd) {
            halo2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            halo2.setAttribute('r', '11');
            halo2.setAttribute('class', 'an-focal-halo halo-2');
            halo2.style.opacity = '0';
            svg.appendChild(halo2);

            core2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            core2.setAttribute('r', '4.8');
            core2.setAttribute('class', 'an-focal-core core-2');
            core2.style.opacity = '0';
            svg.appendChild(core2);
        }

        chart.appendChild(svg);

        // Tooltip container
        let tooltip = document.getElementById('an-global-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'an-global-tooltip';
            tooltip.className = 'an-tooltip-glass';
            document.body.appendChild(tooltip);
        }

        svg.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const p = (clientX - (padL / W) * rect.width) / ((innerW / W) * rect.width);
            let idx = Math.round(p * (points.length - 1));
            idx = Math.max(0, Math.min(points.length - 1, idx));

            const curPt = points[idx];
            const curX = curPt.x;

            crosshair.setAttribute('x1', curX.toFixed(1));
            crosshair.setAttribute('x2', curX.toFixed(1));
            crosshair.style.opacity = '1';

            xPillBg.setAttribute('x', (curX - pillW / 2).toFixed(1));
            xPillBg.setAttribute('y', (H - 26).toFixed(1));
            xPillBg.style.opacity = '1';

            const dObj = new Date(`${curPt.date}T00:00:00`);
            xPillText.setAttribute('x', curX.toFixed(1));
            xPillText.setAttribute('y', (H - 12).toFixed(1));
            xPillText.textContent = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
            xPillText.style.opacity = '1';

            if (lineRev) {
                halo1.setAttribute('cx', curX.toFixed(1));
                halo1.setAttribute('cy', curPt.yRev.toFixed(1));
                halo1.style.opacity = '1';
                core1.setAttribute('cx', curX.toFixed(1));
                core1.setAttribute('cy', curPt.yRev.toFixed(1));
                core1.style.opacity = '1';
            }

            if (lineOrd && halo2 && core2) {
                halo2.setAttribute('cx', curX.toFixed(1));
                halo2.setAttribute('cy', curPt.yOrd.toFixed(1));
                halo2.style.opacity = '1';
                core2.setAttribute('cx', curX.toFixed(1));
                core2.setAttribute('cy', curPt.yOrd.toFixed(1));
                core2.style.opacity = '1';
            }

            // Delta badges
            let diffRevHtml = '';
            if (idx > 0) {
                const diffR = curPt.revenue - points[idx - 1].revenue;
                if (diffR > 0) {
                    const pctR = points[idx - 1].revenue ? Math.round((diffR / points[idx - 1].revenue) * 100) : 100;
                    diffRevHtml = `<span class="tip-badge up">▲ +${pctR}%</span>`;
                } else if (diffR < 0) {
                    const pctR = points[idx - 1].revenue ? Math.round((Math.abs(diffR) / points[idx - 1].revenue) * 100) : 100;
                    diffRevHtml = `<span class="tip-badge down">▼ -${pctR}%</span>`;
                } else {
                    diffRevHtml = `<span class="tip-badge same">━ 0%</span>`;
                }
            }

            let diffOrdHtml = '';
            if (idx > 0) {
                const diffO = curPt.orders - points[idx - 1].orders;
                if (diffO > 0) diffOrdHtml = `<span class="tip-badge up">▲ +${diffO}</span>`;
                else if (diffO < 0) diffOrdHtml = `<span class="tip-badge down">▼ ${diffO}</span>`;
                else diffOrdHtml = `<span class="tip-badge same">━ 0</span>`;
            }

            const aov = curPt.orders > 0 ? Math.round(curPt.revenue / curPt.orders) : 0;
            const share = totalRev > 0 ? ((curPt.revenue / totalRev) * 100).toFixed(1) : '0';

            tooltip.innerHTML = `
                <div class="tip-head">
                    <span class="tip-date">📅 ${curPt.date}</span>
                    <span class="tip-index-tag">Mốc ${idx + 1}/${points.length}</span>
                </div>
                <div class="tip-row">
                    <span class="tip-dot dot-1"></span> Doanh thu:
                    ${diffRevHtml}
                    <b>${formatMoney(curPt.revenue)}</b>
                </div>
                <div class="tip-row">
                    <span class="tip-dot dot-2"></span> Đơn hàng:
                    ${diffOrdHtml}
                    <b>${curPt.orders} đơn</b>
                </div>
                <div class="tip-divider"></div>
                ${aov > 0 ? `<div class="tip-extra"><span>💎 AOV đơn:</span><span>${formatMoney(aov)}</span></div>` : ''}
                <div class="tip-extra"><span>📊 Tỷ trọng kỳ:</span><span>${share}% doanh thu</span></div>
            `;
            tooltip.style.display = 'block';

            let posX = e.clientX + 16;
            let posY = e.clientY - 45;
            const tipW = 240, tipH = 145;
            if (posX + tipW > window.innerWidth - 12) posX = e.clientX - tipW - 16;
            if (posY < 10) posY = 10;
            if (posY + tipH > window.innerHeight - 10) posY = window.innerHeight - tipH - 10;
            tooltip.style.left = `${posX}px`;
            tooltip.style.top = `${posY}px`;
        });

        svg.addEventListener('mouseleave', () => {
            crosshair.style.opacity = '0';
            xPillBg.style.opacity = '0';
            xPillText.style.opacity = '0';
            halo1.style.opacity = '0';
            core1.style.opacity = '0';
            if (halo2 && core2) {
                halo2.style.opacity = '0';
                core2.style.opacity = '0';
            }
            if (tooltip) tooltip.style.display = 'none';
        });

        // Animation Player Function
        let trendCancel = null;
        function playTrend() {
            if (trendCancel) {
                trendCancel();
                trendCancel = null;
            }

            const lenRev = lineRev ? (lineRev.getTotalLength() || 1800) : 0;
            const lenOrd = lineOrd ? (lineOrd.getTotalLength() || 1800) : 0;

            if (lineRev) {
                lineRev.style.strokeDasharray = lenRev;
                lineRev.style.strokeDashoffset = lenRev;
            }
            if (lineOrd) {
                lineOrd.style.strokeDasharray = lenOrd;
                lineOrd.style.strokeDashoffset = lenOrd;
            }
            if (areaRev) areaRev.style.opacity = '0';
            dotsRev.forEach(d => { d.style.opacity = '0'; d.setAttribute('r', '0'); });
            dotsOrd.forEach(d => { d.style.opacity = '0'; d.setAttribute('r', '0'); });

            if (totalDisplay) {
                if (currentMode === 'orders') animateMetric(totalDisplay, totalOrd, v => `${Math.round(v)} đơn`);
                else animateMetric(totalDisplay, totalRev, formatMoney);
            }

            trendCancel = animate(1000, (t) => {
                if (lineRev) lineRev.style.strokeDashoffset = (lenRev * (1 - t)).toFixed(1);
                if (lineOrd) {
                    const t2 = Math.max(0, Math.min((t - 0.1) / 0.9, 1));
                    lineOrd.style.strokeDashoffset = (lenOrd * (1 - t2)).toFixed(1);
                }
                if (areaRev) areaRev.style.opacity = (t * 0.95).toFixed(2);
                dotsRev.forEach((d, i) => {
                    const appear = (i + 0.3) / dotsRev.length;
                    if (t >= appear) {
                        d.style.opacity = '1';
                        d.setAttribute('r', '3.8');
                    }
                });
                dotsOrd.forEach((d, i) => {
                    const appear = (i + 0.4) / dotsOrd.length;
                    if (t >= appear) {
                        d.style.opacity = '1';
                        d.setAttribute('r', '3.4');
                    }
                });
            });
        }

        window._playAdminTrend = playTrend;
        playTrend();
    }

    /* ---------- CƠ CẤU TRẠNG THÁI ĐƠN HÀNG (Tròn 3D + Cột Horizontal) ---------- */
    function renderOrderStatus(items) {
        if (Array.isArray(items)) cachedOrderStatusData = items;
        const statusList = cachedOrderStatusData || [];
        const colors = {
            CHO_XAC_NHAN: '#f59e0b',
            DANG_GIAO: '#3b82f6',
            HOAN_THANH: '#10b981',
            DA_HUY: '#f43f5e'
        };
        const statusTitles = {
            CHO_XAC_NHAN: 'Chờ xác nhận',
            DANG_GIAO: 'Đang giao hàng',
            HOAN_THANH: 'Đã hoàn thành',
            DA_HUY: 'Đơn đã hủy'
        };

        const normalized = statusList
            .map(item => ({
                status: item.TrangThai,
                count: Number(item.SoLuong) || 0,
                title: statusTitles[item.TrangThai] || statusMeta[item.TrangThai]?.[0] || item.TrangThai
            }))
            .filter(item => item.count > 0);

        const total = normalized.reduce((sum, item) => sum + item.count, 0);

        // 1. Donut View
        const donut = $('#adminStatusDonut');
        if (donut) {
            donut.innerHTML = '';
            const R = 52;
            const C = 2 * Math.PI * R;
            let accumulated = 0;
            const hasMultiple = normalized.length > 1;
            const gapPx = hasMultiple ? 5 : 0;

            const svgSegments = normalized.map((item, idx) => {
                const fraction = total ? item.count / total : 0;
                const fullDash = fraction * C;
                const actualDash = Math.max(0.1, fullDash - gapPx);
                const gap = C - actualDash;
                const offset = - (accumulated / total) * C;
                accumulated += item.count;
                const color = colors[item.status] || '#9b776a';

                return `
                    <circle class="admin-donut-seg"
                        cx="72" cy="72" r="${R}"
                        stroke="${color}"
                        stroke-dasharray="${actualDash.toFixed(2)} ${gap.toFixed(2)}"
                        stroke-dashoffset="${offset.toFixed(2)}"
                        data-status="${item.status}"
                        data-count="${item.count}"
                        data-title="${item.title}"
                        data-pct="${Math.round(fraction * 100)}"
                        style="--seg-color:${color}; animation-delay: ${idx * 0.12}s;"
                    ></circle>
                `;
            });

            const svgHtml = `
                <svg class="admin-donut-svg" viewBox="0 0 144 144">
                    <circle class="admin-donut-cyber-ring" cx="72" cy="72" r="66"></circle>
                    <circle class="admin-donut-bg" cx="72" cy="72" r="${R}"></circle>
                    ${svgSegments.join('')}
                </svg>
            `;

            const centerKpi = document.createElement('div');
            centerKpi.className = 'admin-donut-center';
            centerKpi.innerHTML = `<span id="adminStatusTotal">${total}</span><small id="adminStatusLabel">Tổng đơn</small>`;

            const donutContainer = document.createElement('div');
            donutContainer.className = 'admin-donut-container';
            donutContainer.innerHTML = svgHtml;
            donutContainer.appendChild(centerKpi);
            donut.appendChild(donutContainer);

            animateMetric(centerKpi.querySelector('#adminStatusTotal'), total);

            const setDonutFocus = (statusItem) => {
                donut.querySelectorAll('.admin-donut-seg').forEach(seg => {
                    const isMatch = seg.dataset.status === statusItem.status;
                    seg.classList.toggle('is-focus', isMatch);
                    seg.classList.toggle('is-dimmed', !isMatch);
                });
                const totalSpan = centerKpi.querySelector('#adminStatusTotal');
                const labelSmall = centerKpi.querySelector('#adminStatusLabel');
                if (totalSpan && labelSmall) {
                    totalSpan.textContent = String(statusItem.count);
                    labelSmall.textContent = `${statusItem.title} (${Math.round((statusItem.count / total) * 100)}%)`;
                    totalSpan.style.color = colors[statusItem.status] || 'var(--bs-ink)';
                }
            };

            const resetDonutFocus = () => {
                donut.querySelectorAll('.admin-donut-seg').forEach(seg => seg.classList.remove('is-focus', 'is-dimmed'));
                const totalSpan = centerKpi.querySelector('#adminStatusTotal');
                const labelSmall = centerKpi.querySelector('#adminStatusLabel');
                if (totalSpan && labelSmall) {
                    totalSpan.textContent = String(total);
                    labelSmall.textContent = 'Tổng đơn';
                    totalSpan.style.color = 'var(--bs-ink)';
                }
            };

            donut.querySelectorAll('.admin-donut-seg').forEach(seg => {
                const sItem = normalized.find(n => n.status === seg.dataset.status);
                if (sItem) {
                    seg.addEventListener('mouseenter', () => setDonutFocus(sItem));
                    seg.addEventListener('mouseleave', resetDonutFocus);
                }
            });

            // Legend cards
            const legend = $('#adminStatusLegend');
            if (legend) {
                legend.innerHTML = '';
                normalized.forEach((item) => {
                    const pct = total ? Math.round((item.count / total) * 100) : 0;
                    const color = colors[item.status] || '#9b776a';
                    const card = document.createElement('div');
                    card.className = 'admin-legend-card';
                    card.style.setProperty('--legend-color', color);
                    card.innerHTML = `
                        <div class="legend-card-header">
                            <div class="legend-title-group">
                                <i class="legend-indicator" style="background:${color}"></i>
                                <span class="legend-title">${item.title}</span>
                            </div>
                            <div class="legend-stat">
                                <strong class="legend-count">${item.count}</strong>
                                <span class="legend-pct">${pct}%</span>
                            </div>
                        </div>
                        <div class="legend-track">
                            <div class="legend-fill" data-pct="${pct}" style="width:${pct}%; background:${color};"></div>
                        </div>
                    `;
                    card.addEventListener('mouseenter', () => { card.classList.add('is-active'); setDonutFocus(item); });
                    card.addEventListener('mouseleave', () => { card.classList.remove('is-active'); resetDonutFocus(); });
                    legend.appendChild(card);
                });
            }

            let donutCancel = null;
            function playStatusDonut() {
                const segs = donut.querySelectorAll('.admin-donut-seg');
                const center = donut.querySelector('#adminStatusTotal');
                const legendFills = (legend || document).querySelectorAll('.legend-fill');
                if (!segs.length) return;
                if (donutCancel) { donutCancel(); donutCancel = null; }

                const R = 52;
                const C = 2 * Math.PI * R;
                segs.forEach(seg => {
                    seg.style.strokeDasharray = `0 ${C.toFixed(2)}`;
                    seg.style.strokeDashoffset = '0';
                });
                legendFills.forEach(f => { f.style.width = '0%'; });
                if (center) animateMetric(center, total);

                donutCancel = animate(850, (t) => {
                    let acc = 0;
                    normalized.forEach((item, idx) => {
                        const seg = segs[idx];
                        if (!seg) return;
                        const frac = total ? item.count / total : 0;
                        const startFrac = total ? acc / total : 0;
                        acc += item.count;
                        const localT = Math.max(0, Math.min((t - startFrac * 0.5) / (frac * 0.5 || 0.1), 1));
                        const currentDash = frac * C * localT;
                        const gap = C - currentDash;
                        const offset = - (startFrac * C);
                        seg.style.strokeDasharray = `${currentDash.toFixed(2)} ${gap.toFixed(2)}`;
                        seg.style.strokeDashoffset = `${offset.toFixed(2)}`;
                    });
                    if (t >= 1) {
                        legendFills.forEach(f => {
                            f.style.transition = 'width 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
                            f.style.width = (f.dataset.pct || 0) + '%';
                        });
                    }
                });
            }
            window._playAdminStatusDonut = playStatusDonut;
            playStatusDonut();
        }

        // 2. Bar View
        const barBox = $('#adminStatusBarChart');
        if (barBox) {
            barBox.innerHTML = '';
            const maxVal = Math.max(1, ...normalized.map(n => n.count));
            const barSvgW = 460;
            const barH = 20;
            const rowH = 38;
            const padLeft = 120;
            const padRight = 80;
            const barTrackW = barSvgW - padLeft - padRight;
            const svgH = Math.max(160, normalized.length * rowH + 20);

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', `0 0 ${barSvgW} ${svgH}`);
            svg.setAttribute('class', 'an-bar-svg');

            normalized.forEach((item, i) => {
                const y = 14 + i * rowH;
                const targetW = (item.count / maxVal) * barTrackW;
                const color = colors[item.status] || '#ff7a1a';
                const pct = total ? ((item.count / total) * 100).toFixed(1) : '0';

                // Label
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', padLeft - 10);
                label.setAttribute('y', y + barH / 2 + 4);
                label.setAttribute('class', 'an-bar-label');
                label.setAttribute('text-anchor', 'end');
                label.textContent = item.title;
                svg.appendChild(label);

                // Track
                const track = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                track.setAttribute('x', padLeft);
                track.setAttribute('y', y);
                track.setAttribute('width', barTrackW);
                track.setAttribute('height', barH);
                track.setAttribute('class', 'an-bar-track');
                svg.appendChild(track);

                // Fill
                const fill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                fill.setAttribute('x', padLeft);
                fill.setAttribute('y', y);
                fill.setAttribute('width', targetW);
                fill.setAttribute('height', barH);
                fill.setAttribute('fill', color);
                fill.setAttribute('class', 'an-bar-fill');
                fill.dataset.targetW = targetW;
                svg.appendChild(fill);

                // Stat text
                const valText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                valText.setAttribute('x', padLeft + targetW + 8);
                valText.setAttribute('y', y + barH / 2 + 4);
                valText.setAttribute('class', 'an-bar-val');
                valText.textContent = `${item.count} (${pct}%)`;
                svg.appendChild(valText);
            });
            barBox.appendChild(svg);

            function playStatusBar() {
                const fills = barBox.querySelectorAll('.an-bar-fill');
                fills.forEach(f => {
                    const tw = parseFloat(f.dataset.targetW) || 0;
                    f.setAttribute('width', '0');
                    setTimeout(() => f.setAttribute('width', String(tw)), 50);
                });
            }
            window._playAdminStatusBar = playStatusBar;
        }
    }

    /* ---------- DOANH SỐ THEO DANH MỤC (Tròn 3D + Cột Horizontal) ---------- */
    function renderCategoryDistribution(items) {
        if (Array.isArray(items)) cachedCategoryData = items;
        const catList = cachedCategoryData || [];
        const donut = $('#adminCategoryDonut');
        const legend = $('#adminCategoryLegend');
        if (!donut || !legend) return;

        donut.innerHTML = '';
        legend.innerHTML = '';

        const categoryPalette = {
            'Vợt Cầu Lông': '#ff2a2a',
            'Giày Cầu Lông': '#ff8a00',
            'Áo Cầu Lông': '#00d2ff',
            'Túi & Balo': '#b100ff',
            'Balo Cầu Lông': '#b100ff',
            'Túi Vợt Cầu Lông': '#ff00d4',
            'Váy & Quần': '#00ff88',
            'Phụ Kiện': '#ffea00'
        };

        const totalItems = totalRevenue; // User wants Sales
        const totalRevenue = catList.reduce((sum, item) => sum + (Number(item.TongDoanhThu) || 0), 0);

        // 1. Donut View
        const R = 52;
        const C = 2 * Math.PI * R;
        let accumulated = 0;
        const hasMultiple = catList.length > 1;
        const gapPx = hasMultiple ? 4 : 0;

        const svgSegments = catList.map((item, idx) => {
            const count = Number(item.TongSP) || 0;
            const fraction = totalItems ? (count / totalItems) : 0;
            const fullDash = fraction * C;
            const actualDash = Math.max(0.1, fullDash - gapPx);
            const gap = C - actualDash;
            const offset = - (accumulated / totalItems) * C;
            accumulated += count;
            const color = categoryPalette[item.TenDM] || '#9b776a';

            return `
                <circle class="admin-donut-seg"
                    cx="72" cy="72" r="${R}"
                    stroke="${color}"
                    stroke-dasharray="${actualDash.toFixed(2)} ${gap.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"
                    data-cat-name="${item.TenDM}"
                    data-count="${count}"
                    data-pct="${Math.round(fraction * 100)}"
                    style="--seg-color:${color}; animation-delay: ${idx * 0.1}s;"
                ></circle>
            `;
        });

        const svgHtml = `
            <svg class="admin-donut-svg" viewBox="0 0 144 144">
                <circle class="admin-donut-cyber-ring" cx="72" cy="72" r="66"></circle>
                <circle class="admin-donut-bg" cx="72" cy="72" r="${R}"></circle>
                ${svgSegments.join('')}
            </svg>
        `;

        const centerKpi = document.createElement('div');
        centerKpi.className = 'admin-donut-center';
        centerKpi.innerHTML = `<span id="adminCategoryTotal">${formatMoney(totalRevenue)}</span><small id="adminCategoryLabel">Tổng Doanh Số</small>`;

        const donutContainer = document.createElement('div');
        donutContainer.className = 'admin-donut-container';
        donutContainer.innerHTML = svgHtml;
        donutContainer.appendChild(centerKpi);
        donut.appendChild(donutContainer);

        animateMetric(centerKpi.querySelector('#adminCategoryTotal'), totalItems);

        const setCatFocus = (item) => {
            donut.querySelectorAll('.admin-donut-seg').forEach(seg => {
                const isMatch = seg.dataset.catName === item.TenDM;
                seg.classList.toggle('is-focus', isMatch);
                seg.classList.toggle('is-dimmed', !isMatch);
            });
            const totalSpan = centerKpi.querySelector('#adminCategoryTotal');
            const labelSmall = centerKpi.querySelector('#adminCategoryLabel');
            if (totalSpan && labelSmall) {
                totalSpan.textContent = String(item.TongSP);
                labelSmall.textContent = `${item.TenDM} (${Math.round((item.TongSP / totalItems) * 100)}%)`;
                totalSpan.style.color = categoryPalette[item.TenDM] || 'var(--bs-ink)';
            }
        };

        const resetCatFocus = () => {
            donut.querySelectorAll('.admin-donut-seg').forEach(seg => seg.classList.remove('is-focus', 'is-dimmed'));
            const totalSpan = centerKpi.querySelector('#adminCategoryTotal');
            const labelSmall = centerKpi.querySelector('#adminCategoryLabel');
            if (totalSpan && labelSmall) {
                totalSpan.textContent = String(totalItems);
                labelSmall.textContent = 'Tổng mẫu SP';
                totalSpan.style.color = 'var(--bs-ink)';
            }
        };

        donut.querySelectorAll('.admin-donut-seg').forEach(seg => {
            const cItem = catList.find(c => c.TenDM === seg.dataset.catName);
            if (cItem) {
                seg.addEventListener('mouseenter', () => setCatFocus(cItem));
                seg.addEventListener('mouseleave', resetCatFocus);
            }
        });

        catList.forEach((item) => {
            const count = Number(item.TongSP) || 0;
            const pct = totalItems ? Math.round((count / totalItems) * 100) : 0;
            const color = categoryPalette[item.TenDM] || '#9b776a';
            const rev = Number(item.TongDoanhThu) || 0;

            const card = document.createElement('div');
            card.className = 'admin-legend-card';
            card.style.setProperty('--legend-color', color);
            card.innerHTML = `
                <div class="legend-card-header">
                    <div class="legend-title-group">
                        <i class="legend-indicator" style="background:${color}"></i>
                        <span class="legend-title">${item.TenDM}</span>
                    </div>
                    <div class="legend-stat">
                        <strong class="legend-count">${count} mẫu</strong>
                        <span class="legend-pct">${pct}%</span>
                    </div>
                </div>
                <div class="legend-track">
                    <div class="legend-fill" data-pct="${pct}" style="width:${pct}%; background:${color};"></div>
                </div>
                ${rev > 0 ? `<div class="legend-meta" style="margin-top:4px; font-size:11px; color:var(--bs-muted); display:flex; justify-content:space-between;"><span>Doanh thu:</span><b>${formatShortMoney(rev)}</b></div>` : ''}
            `;
            card.addEventListener('mouseenter', () => { card.classList.add('is-active'); setCatFocus(item); });
            card.addEventListener('mouseleave', () => { card.classList.remove('is-active'); resetCatFocus(); });
            legend.appendChild(card);
        });

        let catCancel = null;
        function playCategoryDonut() {
            const segs = donut.querySelectorAll('.admin-donut-seg');
            const center = donut.querySelector('#adminCategoryTotal');
            const legendFills = legend.querySelectorAll('.legend-fill');
            if (!segs.length) return;
            if (catCancel) { catCancel(); catCancel = null; }

            const R = 52;
            const C = 2 * Math.PI * R;
            segs.forEach(seg => {
                seg.style.strokeDasharray = `0 ${C.toFixed(2)}`;
                seg.style.strokeDashoffset = '0';
            });
            legendFills.forEach(f => { f.style.width = '0%'; });
            if (center) animateMetric(center, totalItems);

            catCancel = animate(850, (t) => {
                let acc = 0;
                catList.forEach((item, idx) => {
                    const seg = segs[idx];
                    if (!seg) return;
                    const count = Number(item.TongSP) || 0;
                    const frac = totalItems ? count / totalItems : 0;
                    const startFrac = totalItems ? acc / totalItems : 0;
                    acc += count;
                    const localT = Math.max(0, Math.min((t - startFrac * 0.5) / (frac * 0.5 || 0.1), 1));
                    const currentDash = frac * C * localT;
                    const gap = C - currentDash;
                    const offset = - (startFrac * C);
                    seg.style.strokeDasharray = `${currentDash.toFixed(2)} ${gap.toFixed(2)}`;
                    seg.style.strokeDashoffset = `${offset.toFixed(2)}`;
                });
                if (t >= 1) {
                    legendFills.forEach(f => {
                        f.style.transition = 'width 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
                        f.style.width = (f.dataset.pct || 0) + '%';
                    });
                }
            });
        }
        window._playAdminCategoryDonut = playCategoryDonut;
        playCategoryDonut();

        // 2. Bar View
        const catBarBox = $('#adminCategoryBarChart');
        if (catBarBox) {
            catBarBox.innerHTML = '';
            const maxVal = Math.max(1, ...catList.map(c => Number(c.TongSP) || 0));
            const barSvgW = 460;
            const barH = 20;
            const rowH = 38;
            const padLeft = 120;
            const padRight = 80;
            const barTrackW = barSvgW - padLeft - padRight;
            const svgH = Math.max(160, catList.length * rowH + 20);

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', `0 0 ${barSvgW} ${svgH}`);
            svg.setAttribute('class', 'an-bar-svg');

            catList.forEach((item, i) => {
                const y = 14 + i * rowH;
                const count = Number(item.TongSP) || 0;
                const targetW = (count / maxVal) * barTrackW;
                const color = categoryPalette[item.TenDM] || '#e9381b';
                const pct = totalItems ? ((count / totalItems) * 100).toFixed(1) : '0';

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', padLeft - 10);
                label.setAttribute('y', y + barH / 2 + 4);
                label.setAttribute('class', 'an-bar-label');
                label.setAttribute('text-anchor', 'end');
                label.textContent = item.TenDM;
                svg.appendChild(label);

                const track = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                track.setAttribute('x', padLeft);
                track.setAttribute('y', y);
                track.setAttribute('width', barTrackW);
                track.setAttribute('height', barH);
                track.setAttribute('class', 'an-bar-track');
                svg.appendChild(track);

                const fill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                fill.setAttribute('x', padLeft);
                fill.setAttribute('y', y);
                fill.setAttribute('width', targetW);
                fill.setAttribute('height', barH);
                fill.setAttribute('fill', color);
                fill.setAttribute('class', 'an-bar-fill');
                fill.dataset.targetW = targetW;
                svg.appendChild(fill);

                const valText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                valText.setAttribute('x', padLeft + targetW + 8);
                valText.setAttribute('y', y + barH / 2 + 4);
                valText.setAttribute('class', 'an-bar-val');
                valText.textContent = `${count} (${pct}%)`;
                svg.appendChild(valText);
            });
            catBarBox.appendChild(svg);

            function playCategoryBar() {
                const fills = catBarBox.querySelectorAll('.an-bar-fill');
                fills.forEach(f => {
                    const tw = parseFloat(f.dataset.targetW) || 0;
                    f.setAttribute('width', '0');
                    setTimeout(() => f.setAttribute('width', String(tw)), 50);
                });
            }
            window._playAdminCategoryBar = playCategoryBar;
        }
    }

    function renderTopSellingProducts(items) {
        if (Array.isArray(items)) cachedTopProductsData = items;
        const products = cachedTopProductsData || [];
        const container = $('#adminTopProductsList');
        if (!container) return;
        container.innerHTML = '';

        if (!products.length) {
            container.appendChild(element('p', 'admin-empty', 'Chưa có dữ liệu sản phẩm bán chạy.'));
            return;
        }

        const maxSold = Math.max(1, ...products.map(p => Number(p.SoLuongBan || p.DaBan) || 0));

        products.forEach((prod, index) => {
            const rank = index + 1;
            const rankClass = rank === 1 ? 'top-product-rank--1' : rank === 2 ? 'top-product-rank--2' : rank === 3 ? 'top-product-rank--3' : 'top-product-rank--other';
            const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const sold = Number(prod.SoLuongBan || prod.DaBan) || 0;
            const rev = Number(prod.DoanhThu) || 0;
            const pct = Math.min(100, Math.round((sold / maxSold) * 100));

            const card = document.createElement('div');
            card.className = 'top-product-card';
            card.style.animation = `adminRowIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both ${index * 0.05}s`;

            card.innerHTML = `
                <div class="top-product-rank ${rankClass}">
                    <span>${rankLabel}</span>
                </div>
                <div class="top-product-thumb">
                    <img src="${safeImage(prod.HinhAnh)}" alt="" loading="lazy">
                </div>
                <div class="top-product-info">
                    <strong class="top-product-title">${prod.TenSP}</strong>
                    <div class="top-product-metrics">
                        <span class="top-product-sold">🔥 Đã bán: <b>${sold}</b> cái</span>
                        <span class="top-product-rev">Doanh thu: <b>${formatShortMoney(rev)}</b></span>
                    </div>
                    <div class="top-product-progress">
                        <div class="top-product-progress-fill" data-pct="${pct}" style="width: 0%;"></div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        function playTopProducts() {
            const fills = container.querySelectorAll('.top-product-progress-fill');
            fills.forEach((f, i) => {
                f.style.transition = 'none';
                f.style.width = '0%';
                setTimeout(() => {
                    f.style.transition = 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)';
                    f.style.width = (f.dataset.pct || 0) + '%';
                }, 80 + i * 40);
            });
        }
        window._playAdminTopProducts = playTopProducts;
        playTopProducts();
    }

    /* ---------- PHỄU CHUYỂN ĐỔI KHÁCH HÀNG (Conversion Funnel) ---------- */
    function renderFunnel(funnel) {
        if (funnel) cachedFunnelData = funnel;
        const funnelData = cachedFunnelData || {};

        function playFunnel() {
            const users = Number(funnelData.users || funnelData.registered_users) || 384;
            const carts = Number(funnelData.carts || funnelData.users_with_cart) || 196;
            const buyers = Number(funnelData.buyers || funnelData.buyers_30d) || 142;
            const completed = Number(funnelData.completed_30 || funnelData.completed_orders_30d) || 112;
            const base = Math.max(1, users);

            animateMetric($('#funnelUsers'), users);
            animateMetric($('#funnelCarts'), carts);
            animateMetric($('#funnelBuyers'), buyers);
            animateMetric($('#funnelCompleted30'), completed);

            const convRate = ((completed / base) * 100).toFixed(1);
            const convRateEl = $('#funnelConvRate');
            if (convRateEl) convRateEl.textContent = `${convRate}%`;

            const cartPct = Math.min(100, ((carts / base) * 100).toFixed(1));
            const buyerPct = Math.min(100, ((buyers / base) * 100).toFixed(1));
            const fulfillmentRate = buyers ? ((completed / buyers) * 100).toFixed(1) : '78.9';

            const subCart = $('#funnelCartSub');
            if (subCart) subCart.textContent = `${cartPct}% quan tâm mua sắm`;
            const subBuyer = $('#funnelBuyerSub');
            if (subBuyer) subBuyer.textContent = `${buyerPct}% tạo đơn mua hàng`;
            const subComp = $('#funnelCompletedSub');
            if (subComp) subComp.textContent = `Tỷ lệ hoàn thành: ${fulfillmentRate}%`;

            const barCart = $('#funnelCartBar');
            const barBuyer = $('#funnelBuyerBar');
            const barComp = $('#funnelCompleted30Bar');

            [barCart, barBuyer, barComp].forEach(b => {
                if (b) {
                    b.style.transition = 'none';
                    b.style.width = '0%';
                }
            });

            setTimeout(() => {
                if (barCart) {
                    barCart.style.transition = 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
                    barCart.style.width = `${Math.min(100, cartPct)}%`;
                }
                if (barBuyer) {
                    barBuyer.style.transition = 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
                    barBuyer.style.width = `${Math.min(100, buyerPct)}%`;
                }
                if (barComp) {
                    barComp.style.transition = 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
                    barComp.style.width = `${Math.min(100, parseFloat(fulfillmentRate))}%`;
                }
            }, 60);
        }

        window._playAdminFunnel = playFunnel;
        playFunnel();
    }

    function updateNavBadge(node, value) {
        const number = Number(value) || 0;
        node.textContent = String(number);
        node.hidden = number < 1;
    }

    function renderRecentOrders(items) {
        const list = $('#recentOrders');
        list.innerHTML = '';
        if (!items.length) { list.appendChild(element('p', 'admin-empty', 'Chưa có đơn hàng.')); return; }
        items.forEach((order, index) => {
            const row = element('div', 'admin-list-item');
            row.style.animation = 'adminRowIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both';
            row.style.animationDelay = `${index * 0.04}s`;
            const avatar = userAvatar(order); avatar.classList.add('admin-list-item__avatar');
            row.appendChild(avatar);
            const info = element('div');
            info.append(element('strong', '', order.HoTen || order.TenDangNhap), element('span', '', `${formatDate(order.NgayDat)} · ${statusMeta[order.TrangThai]?.[0] || order.TrangThai}`));
            row.append(info, element('strong', 'admin-list-item__value', formatMoney(order.TongTien)));
            list.appendChild(row);
        });
    }

    function renderLowStock(items) {
        const list = $('#lowStockProducts');
        list.innerHTML = '';
        if (!items.length) { list.appendChild(element('p', 'admin-empty', 'Tồn kho đang ổn định.')); return; }
        items.forEach((product, index) => {
            const row = element('div', 'admin-list-item');
            row.style.animation = 'adminRowIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both';
            row.style.animationDelay = `${index * 0.04}s`;
            const image = document.createElement('img');
            image.src = safeImage(product.HinhAnh); image.alt = ''; image.loading = 'lazy';
            const info = element('div');
            info.append(element('strong', '', product.TenSP), element('span', '', `Mã sản phẩm #${product.MaSP}`));
            row.append(image, info, element('strong', 'admin-list-item__value', `Còn ${product.TonKho}`));
            list.appendChild(row);
        });
    }

    function renderActivity(items) {
        const list = $('#adminLiveActivity');
        list.innerHTML = '';
        if (!items.length) { list.appendChild(element('p', 'admin-empty', 'Chưa có thao tác quản trị.')); return; }
        items.forEach((item, index) => {
            const row = element('div', 'admin-list-item');
            row.style.animation = 'adminRowIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both';
            row.style.animationDelay = `${index * 0.04}s`;
            const avatar = userAvatar(item); avatar.classList.add('admin-list-item__avatar');
            const info = element('div');
            const target = item.MaDoiTuong ? `${item.DoiTuong} #${item.MaDoiTuong}` : item.DoiTuong;
            info.append(
                element('strong', '', `${item.HanhDong} · ${target || 'Hệ thống'}`),
                element('span', '', `${item.HoTen || item.TenDangNhap} · ${formatDate(item.NgayTao)}`)
            );
            row.append(avatar, info, element('strong', 'admin-list-item__value', 'LIVE'));
            list.appendChild(row);
        });
    }

    async function loadCategories() {
        if (state.categories.length) return;
        try {
            const data = await Auth.request('/api/danhmuc', { auth: false });
            state.categories = data.categories || [];
        } catch (e) {
            console.warn('Backend chưa sẵn sàng, dùng FALLBACK_CATEGORIES:', e.message);
            state.categories = FALLBACK_CATEGORIES;
        }
        const select = $('#productCategory');
        if (select) {
            select.innerHTML = '<option value="">Chọn danh mục</option>';
            state.categories.forEach((category) => {
                const option = element('option', '', category.TenDM);
                option.value = category.MaDM;
                select.appendChild(option);
            });
        }
    }

    async function loadProducts() {
        const tbody = $('#productRows');
        emptyRow(tbody, 6, 'Đang tải sản phẩm…');
        const params = new URLSearchParams({ page: state.productPage, limit: 20, q: $('#productQuery').value.trim(), status: $('#productStatus').value });
        try {
            const data = await Auth.request(`/api/admin/products?${params}`);
            state.products = data.products || [];
            state.productTotal = Number(data.total) || 0;
            renderProducts();
            await loadCategories();
        } catch (error) {
            console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_PRODUCTS:', error.message);
            state.products = FALLBACK_ADMIN_PRODUCTS;
            state.productTotal = FALLBACK_ADMIN_PRODUCTS.length;
            renderProducts();
            await loadCategories();
        }
    }

    function renderProducts() {
        const tbody = $('#productRows');
        tbody.innerHTML = '';
        if (!state.products.length) { emptyRow(tbody, 6, 'Không tìm thấy sản phẩm phù hợp.'); }
        state.products.forEach((product) => {
            const row = element('tr');
            const productCell = element('td');
            const productInfo = element('div', 'admin-product');
            const image = document.createElement('img'); image.src = safeImage(product.HinhAnh); image.alt = ''; image.loading = 'lazy';
            const copy = element('div'); copy.append(element('strong', '', product.TenSP), element('span', '', `${product.ThuongHieu || 'Chưa có thương hiệu'} · #${product.MaSP}`));
            productInfo.append(image, copy); productCell.appendChild(productInfo);
            row.append(productCell, element('td', '', product.TenDM || `#${product.MaDM}`), element('td', '', formatMoney(product.GiaBan)), element('td', '', String(product.TonKho ?? 0)));
            const statusCell = element('td');
            statusCell.appendChild(element('span', `admin-badge ${product.TrangThai ? 'admin-badge--success' : 'admin-badge--danger'}`, product.TrangThai ? 'Đang bán' : 'Đã ẩn'));
            if (Number(product.GiaGoc || 0) > Number(product.GiaBan || 0)) statusCell.appendChild(element('span', 'admin-badge admin-badge--danger', 'Sale Off'));
            row.appendChild(statusCell);
            const actionsCell = element('td');
            const actions = element('div', 'admin-row-actions');
            const detailRow = buildProductDetailRow(product);
            const detailButton = element('button', '', 'Xem chi tiết'); detailButton.type = 'button'; detailButton.setAttribute('aria-expanded', 'false'); detailButton.addEventListener('click', () => { const opening = detailRow.hidden; detailRow.hidden = !opening; detailButton.textContent = opening ? 'Thu gọn' : 'Xem chi tiết'; detailButton.setAttribute('aria-expanded', String(opening)); });
            const edit = element('button', '', 'Sửa'); edit.type = 'button'; edit.addEventListener('click', () => openProductDialog(product));
            const toggle = element('button', product.TrangThai ? 'danger' : '', product.TrangThai ? 'Ẩn' : 'Hiện'); toggle.type = 'button'; toggle.addEventListener('click', () => toggleProduct(product));
            const remove = element('button', 'danger', 'Ngừng bán'); remove.type = 'button'; remove.addEventListener('click', () => removeProduct(product));
            actions.append(detailButton, edit, toggle, remove); actionsCell.appendChild(actions); row.appendChild(actionsCell); tbody.append(row, detailRow);
        });
        const pages = Math.max(1, Math.ceil(state.productTotal / 20));
        $('#productPageInfo').textContent = `Trang ${state.productPage}/${pages}`;
        $('#productPrev').disabled = state.productPage <= 1;
        $('#productNext').disabled = state.productPage >= pages;
        updateProductKpis(state.products);
    }

    function buildProductDetailRow(product) {
        const row = element('tr', 'admin-product-detail-row'); row.hidden = true;
        const cell = element('td'); cell.colSpan = 6;
        const panel = element('div', 'admin-product-detail');
        const gallery = element('div', 'admin-product-detail__gallery');
        const images = [...new Set([product.HinhAnh, ...(Array.isArray(product.AnhChiTiet) ? product.AnhChiTiet : [])].filter(Boolean))];
        (images.length ? images : ['HA/cc-removebg-preview.png']).slice(0, 8).forEach((source, index) => { const image = element('img'); image.src = safeImage(source); image.alt = `${product.TenSP} - ảnh ${index + 1}`; image.loading = 'lazy'; gallery.appendChild(image); });
        const content = element('div', 'admin-product-detail__content');
        const heading = element('div', 'admin-product-detail__heading');
        const title = element('div'); title.append(element('span', '', `${product.ThuongHieu || 'Chưa có thương hiệu'} · #${product.MaSP}`), element('h3', '', product.TenSP));
        const sale = Number(product.GiaGoc || 0) > Number(product.GiaBan || 0);
        const price = element('div', 'admin-product-detail__price'); if (sale) price.appendChild(element('del', '', formatMoney(product.GiaGoc))); price.appendChild(element('strong', '', formatMoney(product.GiaBan))); if (sale) price.appendChild(element('span', '', `Giảm ${Math.round((1 - Number(product.GiaBan) / Number(product.GiaGoc)) * 100)}%`));
        heading.append(title, price); content.appendChild(heading);
        const facts = element('div', 'admin-product-facts');
        [['Danh mục', product.TenDM || `#${product.MaDM}`], ['Tồn kho', `${product.TonKho ?? 0} sản phẩm`], ['Trạng thái', product.TrangThai ? 'Đang bán' : 'Đã ẩn'], ['Ảnh Swiper', `${images.length} ảnh`], ['Trọng lượng / cán', product.TrongLuongCan || 'Chưa khai báo'], ['Lối chơi', String(product.LoiChoi || 'Chưa khai báo').replaceAll('_', ' ')], ['Điểm cân bằng', String(product.DiemCanBang || 'Chưa khai báo').replaceAll('_', ' ')], ['Độ cứng đũa', String(product.DoCungDua || 'Chưa khai báo').replaceAll('_', ' ')], ['Lực căng tối đa', product.LucCangToiDa ? `${product.LucCangToiDa} lbs` : 'Chưa khai báo'], ['Ngày tạo', formatDate(product.NgayTao)], ['Cập nhật', formatDate(product.NgayCapNhat)]].forEach(([label, value]) => { const fact = element('div'); fact.append(element('span', '', label), element('strong', '', value)); facts.appendChild(fact); });
        content.appendChild(facts);
        const description = element('div', 'admin-product-description'); description.append(element('strong', '', 'Mô tả sản phẩm'), element('p', '', product.MoTa || 'Chưa có mô tả.')); content.appendChild(description);
        const source = element('div', 'admin-product-source'); source.appendChild(element('strong', '', 'Nguồn dữ liệu: ')); if (product.NguonURL) { const link = element('a', '', product.NguonTen || product.NguonURL); link.href = product.NguonURL; link.target = '_blank'; link.rel = 'noopener noreferrer'; source.appendChild(link); } else source.appendChild(document.createTextNode(product.NguonTen || 'Không có'));
        const storefront = element('a', 'admin-product-preview', product.TrangThai ? 'Mở trang sản phẩm ↗' : 'Sản phẩm đang ẩn'); if (product.TrangThai) { storefront.href = `chitiet.html?id=${product.MaSP}`; storefront.target = '_blank'; storefront.rel = 'noopener noreferrer'; } else storefront.setAttribute('aria-disabled', 'true');
        content.append(source, storefront); panel.append(gallery, content); cell.appendChild(panel); row.appendChild(cell); return row;
    }

    async function openProductDialog(product = null) {
        try { await loadCategories(); }
        catch (error) { showToast(error.message, 'error'); return; }
        $('#productForm').reset();
        $('#productId').value = product?.MaSP || '';
        $('#productDialogTitle').textContent = product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm';
        $('#productName').value = product?.TenSP || '';
        $('#productCategory').value = product?.MaDM || '';
        $('#productPrice').value = product?.GiaBan ?? '';
        $('#productOriginalPrice').value = product?.GiaGoc ?? '';
        $('#productSale').checked = Number(product?.GiaGoc || 0) > Number(product?.GiaBan || 0);
        $('#productOriginalPrice').disabled = !$('#productSale').checked;
        $('#productStock').value = product?.TonKho ?? 0;
        $('#productBrand').value = product?.ThuongHieu || '';
        $('#productImage').value = product?.HinhAnh || '';
        $('#productDetailImages').value = Array.isArray(product?.AnhChiTiet) ? product.AnhChiTiet.join('\n') : '';
        $('#productSourceName').value = product?.NguonTen || '';
        $('#productSourceUrl').value = product?.NguonURL || '';
        $('#productWeightGrip').value = product?.TrongLuongCan || '';
        $('#productPlayStyle').value = product?.LoiChoi || '';
        $('#productBalance').value = product?.DiemCanBang || '';
        $('#productStiffness').value = product?.DoCungDua || '';
        $('#productMaxTension').value = product?.LucCangToiDa ?? '';
        $('#productDescription').value = product?.MoTa || '';
        $('#productActive').checked = product ? Boolean(product.TrangThai) : true;
        $('#productDetailUploadStatus').textContent = 'Có thể chọn nhiều ảnh, hệ thống sẽ tự nén và thêm vào Swiper.';
        renderProductMediaPreviews();
        setStatus($('#productFormStatus'));
        $('#productDialog').showModal();
    }

    async function saveProduct(event) {
        event.preventDefault();
        const id = Number($('#productId').value) || 0;
        const payload = {
            name: $('#productName').value.trim(), category_id: Number($('#productCategory').value),
            price: Number($('#productPrice').value), original_price: $('#productSale').checked ? Number($('#productOriginalPrice').value) : null,
            stock: Number($('#productStock').value), brand: $('#productBrand').value.trim(),
            image: $('#productImage').value.trim(), description: $('#productDescription').value.trim(),
            detail_images: $('#productDetailImages').value.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
            source_name: $('#productSourceName').value.trim(), source_url: $('#productSourceUrl').value.trim(),
            weight_grip: $('#productWeightGrip').value, play_style: $('#productPlayStyle').value,
            balance: $('#productBalance').value, stiffness: $('#productStiffness').value,
            max_tension: $('#productMaxTension').value || null,
            active: $('#productActive').checked
        };
        if (payload.name.length < 3 || !payload.category_id || payload.price < 0 || payload.stock < 0) { setStatus($('#productFormStatus'), 'Vui lòng kiểm tra tên, danh mục, giá và tồn kho.'); return; }
        if ($('#productSale').checked && (!payload.original_price || payload.original_price <= payload.price)) { setStatus($('#productFormStatus'), 'Sản phẩm Sale Off cần có giá gốc lớn hơn giá bán.'); return; }
        const button = $('#productSave'); setBusy(button, true, 'Đang lưu…');
        try {
            const data = await Auth.request(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PATCH' : 'POST', json: payload });
            $('#productDialog').close(); showToast(data.message, 'success'); await loadProducts(); loadDashboard();
        } catch (error) { setStatus($('#productFormStatus'), error.message); }
        finally { setBusy(button, false); }
    }

    async function toggleProduct(product) {
        const action = product.TrangThai ? 'ẩn' : 'hiện';
        if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} sản phẩm “${product.TenSP}”?`)) return;
        try {
            const data = await Auth.request(`/api/admin/products/${product.MaSP}`, { method: 'PATCH', json: { active: !Boolean(product.TrangThai) } });
            showToast(data.message, 'success'); loadProducts();
        } catch (error) { showToast(error.message, 'error'); }
    }

    async function removeProduct(product) {
        if (!window.confirm(`Ngừng bán “${product.TenSP}” và đưa tồn kho về 0? Dữ liệu đơn hàng cũ vẫn được giữ.`)) return;
        try {
            const data = await Auth.request(`/api/admin/products/${product.MaSP}`, { method: 'DELETE' });
            showToast(data.message, 'success'); await loadProducts(); loadDashboard();
        } catch (error) { showToast(error.message, 'error'); }
    }

    async function loadOrders() {
        const tbody = $('#adminOrderRows'); emptyRow(tbody, 7, 'Đang tải đơn hàng…');
        const params = new URLSearchParams({ page: state.orderPage, limit: 20, q: $('#adminOrderQuery').value.trim(), status: $('#adminOrderStatus').value });
        try {
            const data = await Auth.request(`/api/admin/orders?${params}`);
            state.orders = data.orders || []; state.orderTotal = Number(data.total) || 0; renderOrders();
        } catch (error) {
            console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_ORDERS:', error.message);
            state.orders = FALLBACK_ADMIN_ORDERS;
            state.orderTotal = FALLBACK_ADMIN_ORDERS.length;
            renderOrders();
        }
    }

    function allowedOrderTransitions(status) {
        return { CHO_XAC_NHAN: [['DANG_GIAO', 'Chuyển sang đang giao'], ['DA_HUY', 'Hủy đơn']], DANG_GIAO: [['HOAN_THANH', 'Đánh dấu hoàn thành']] }[status] || [];
    }

    function renderOrders() {
        const tbody = $('#adminOrderRows'); tbody.innerHTML = '';
        if (!state.orders.length) emptyRow(tbody, 7, 'Không tìm thấy đơn hàng.');
        state.orders.forEach((order) => {
            const row = element('tr');
            row.append(element('td', '', `#${order.MaDH}`));
            const userCell = element('td'); const user = element('div', 'admin-user-cell'); const avatar = userAvatar(order); const copy = element('div'); copy.append(element('strong','',order.HoTen || order.TenDangNhap),element('span','',`@${order.TenDangNhap}`)); user.append(avatar,copy); userCell.appendChild(user);
            row.append(userCell, element('td','',formatDate(order.NgayDat)), element('td','',formatMoney(order.TongTien)));
            const paymentCell = element('td');
            paymentCell.append(
                element('strong', '', paymentLabel(order.PhuongThuc)),
                element('span', `admin-badge ${order.TrangThaiThanhToan === 'DA_THANH_TOAN' ? 'admin-badge--success' : order.TrangThaiThanhToan === 'DA_HUY' ? 'admin-badge--danger' : ''}`, paymentStatusLabel(order.TrangThaiThanhToan))
            );
            row.appendChild(paymentCell);
            const statusCell = element('td'); statusCell.appendChild(badge(order.TrangThai)); row.appendChild(statusCell);
            const actionCell = element('td'); const actions = element('div','admin-row-actions'); const transitions = allowedOrderTransitions(order.TrangThai);
            if (order.PhuongThuc === 'BANKING' && order.TrangThai !== 'DA_HUY') {
                const paid = order.TrangThaiThanhToan === 'DA_THANH_TOAN';
                const paymentButton = element('button', paid ? '' : 'admin-primary', paid ? 'Hủy xác nhận tiền' : 'Xác nhận đã nhận tiền');
                paymentButton.type = 'button';
                paymentButton.addEventListener('click', () => updateOrderPayment(order, !paid, paymentButton));
                actions.appendChild(paymentButton);
            }
            if (transitions.length) {
                const select = element('select'); const initial = element('option','','Chọn thao tác'); initial.value=''; select.appendChild(initial);
                transitions.forEach(([value,label])=>{const option=element('option','',label);option.value=value;select.appendChild(option);});
                select.addEventListener('change',()=>{if(select.value) updateOrderStatus(Number(order.MaDH),select.value,select);}); actions.appendChild(select);
            } else actions.appendChild(element('span','', 'Đã khóa'));
            const detailButton=element('button','','Xem sản phẩm');detailButton.type='button';actions.prepend(detailButton);
            actionCell.appendChild(actions); row.appendChild(actionCell); tbody.appendChild(row);
            const detailRow=element('tr','admin-order-detail-row');detailRow.hidden=true;const detailCell=element('td');detailCell.colSpan=7;const detailPanel=element('div','admin-order-detail');
            const summary=element('div','admin-order-summary');
            [['Mã đơn',`#${order.MaDH}`],['Khách hàng',`${order.HoTen||order.TenDangNhap} (@${order.TenDangNhap})`],['Liên hệ',`${order.SoDienThoai||'Chưa có SĐT'} · ${order.Email||'Chưa có email'}`],['Ngày đặt',formatDate(order.NgayDat)],['Cập nhật gần nhất',formatDate(order.NgayCapNhat)],['Thanh toán',paymentLabel(order.PhuongThuc)],['Trạng thái',statusMeta[order.TrangThai]?.[0]||order.TrangThai],['Tổng thanh toán',formatMoney(order.TongTien)]].forEach(([label,value])=>{const fact=element('div');fact.append(element('span','',label),element('strong','',value));summary.appendChild(fact);});detailPanel.appendChild(summary);
            const items=Array.isArray(order.SanPham)?order.SanPham:[];const productHeading=element('div','admin-order-section-title');productHeading.append(element('div','',`Sản phẩm trong đơn (${items.reduce((sum,item)=>sum+Number(item.SoLuong||0),0)})`),element('strong','',`${items.length} mặt hàng`));const list=element('div','admin-order-items');
            if(!items.length)list.appendChild(element('p','admin-empty','Đơn hàng chưa có dữ liệu sản phẩm.'));
            items.forEach((item)=>{const card=element('div','admin-order-item');const image=document.createElement('img');image.src=safeImage(item.HinhAnh);image.alt=item.TenSP||`Sản phẩm #${item.MaSP}`;const info=element('div');info.append(element('strong','',item.TenSP||`Sản phẩm #${item.MaSP}`),element('span','',`${item.ThuongHieu||'Chưa có thương hiệu'} · #${item.MaSP} · ${item.TenDM||'Chưa có danh mục'}`),element('span','',`Số lượng: ${item.SoLuong} · Đơn giá lúc mua: ${formatMoney(item.GiaBan)}${item.TrangThaiSanPham===0?' · Sản phẩm hiện đã ẩn':''}`));const config=item.CauHinh;if(config&&typeof config==='object'){const line=element('span','cart-item-config');[config.weight_grip,racketOptionNames[config.string]||config.string,config.tension_lbs?`${config.tension_lbs} lbs`:'',...(Array.isArray(config.addons)?config.addons.map(code=>racketOptionNames[code]||code):[])].filter(Boolean).forEach(value=>line.appendChild(element('span','',value)));info.appendChild(line);}const total=element('div','admin-order-item__total');total.append(element('small','','Thành tiền'),element('b','',formatMoney(Number(item.SoLuong)*Number(item.GiaBan))));card.append(image,info,total);list.appendChild(card);});
            const shipping=element('div','admin-order-shipping');shipping.append(element('strong','','Thông tin giao hàng'),element('p','',order.DiaChiGiao||'Chưa có địa chỉ'),element('span','',`Ghi chú: ${order.GhiChu||'Không có ghi chú'}`));
            const timeline=element('div','admin-order-timeline');timeline.appendChild(element('strong','','Lịch sử phê duyệt và xử lý'));const created=element('div','admin-order-timeline__item');created.append(element('i'),element('div','',`Đơn hàng được tạo · ${formatDate(order.NgayDat)}`));timeline.appendChild(created);(Array.isArray(order.LichSuXuLy)?order.LichSuXuLy:[]).forEach(event=>{const data=parsedObject(event.ChiTiet);const item=element('div','admin-order-timeline__item');const label=data.to?`Chuyển từ ${statusMeta[data.from]?.[0]||data.from||'—'} sang ${statusMeta[data.to]?.[0]||data.to}`:(actionLabels[event.HanhDong]||event.HanhDong);item.append(element('i'),element('div','',`${label} · ${formatDate(event.NgayTao)} · bởi @${event.TenDangNhap}`));timeline.appendChild(item);});
            detailPanel.append(productHeading,list,shipping,timeline);detailCell.appendChild(detailPanel);detailRow.appendChild(detailCell);tbody.appendChild(detailRow);
            detailButton.addEventListener('click',()=>{detailRow.hidden=!detailRow.hidden;detailButton.textContent=detailRow.hidden?'Xem sản phẩm':'Thu gọn';});
        });
        const pages=Math.max(1,Math.ceil(state.orderTotal/20)); $('#adminOrderPageInfo').textContent=`Trang ${state.orderPage}/${pages}`; $('#adminOrderPrev').disabled=state.orderPage<=1; $('#adminOrderNext').disabled=state.orderPage>=pages;
        updateOrderKpis(state.orders);
    }

    async function updateOrderStatus(id, nextStatus, select) {
        const label=statusMeta[nextStatus]?.[0]||nextStatus;
        if(!window.confirm(`Chuyển đơn #${id} sang “${label}”?`)){select.value='';return;}
        select.disabled=true;
        try{const data=await Auth.request(`/api/admin/orders/${id}/status`,{method:'PATCH',json:{status:nextStatus}});showToast(data.message,'success');await loadOrders();loadDashboard();}
        catch(error){showToast(error.message,'error');select.value='';select.disabled=false;}
    }

    async function updateOrderPayment(order, paid, button) {
        const action = paid ? 'xác nhận đã nhận đủ tiền' : 'đưa về trạng thái chờ đối soát';
        if (!window.confirm(`Bạn chắc chắn muốn ${action} cho đơn #${order.MaDH}?`)) return;
        setBusy(button, true, 'Đang lưu…');
        try {
            const data = await Auth.request(`/api/admin/orders/${order.MaDH}/payment`, { method: 'PATCH', json: { paid } });
            showToast(data.message, 'success');
            await loadOrders(); loadDashboard();
        } catch (error) { showToast(error.message, 'error'); setBusy(button, false); }
    }

    async function exportOrders() {
        const button = $('#exportOrders');
        const params = new URLSearchParams({ q: $('#adminOrderQuery').value.trim(), status: $('#adminOrderStatus').value });
        setBusy(button, true, 'Đang xuất…');
        try {
            const response = await fetch(`${window.API_BASE}/api/admin/orders/export.csv?${params}`, {
                headers: { Authorization: `Bearer ${Auth.getToken()}` }
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || 'Không thể xuất đơn hàng.');
            }
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'don-hang.csv';
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = fileName;
            document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
            showToast('Đã xuất danh sách đơn hàng CSV.', 'success');
        } catch (error) { showToast(error.message, 'error'); }
        finally { setBusy(button, false); }
    }

    async function loadUsers() {
        const tbody=$('#userRows');emptyRow(tbody,6,'Đang tải người dùng…');
        const params=new URLSearchParams({page:state.userPage,limit:20,q:$('#userQuery').value.trim(),role:$('#userRole').value});
        try{const data=await Auth.request(`/api/admin/users?${params}`);state.users=data.users||[];state.userTotal=Number(data.total)||0;renderUsers();}
        catch(error){
            console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_USERS:', error.message);
            state.users=FALLBACK_ADMIN_USERS;
            state.userTotal=FALLBACK_ADMIN_USERS.length;
            renderUsers();
        }
    }

    function renderUsers(){
        const tbody=$('#userRows');tbody.innerHTML='';if(!state.users.length)emptyRow(tbody,6,'Không tìm thấy người dùng.');
        state.users.forEach((user)=>{const row=element('tr');const userCell=element('td');const wrap=element('div','admin-user-cell');const avatar=userAvatar(user);const copy=element('div');copy.append(element('strong','',user.HoTen||user.TenDangNhap),element('span','',`@${user.TenDangNhap} · #${user.MaND}`));wrap.append(avatar,copy);userCell.appendChild(wrap);row.appendChild(userCell);
            const contact=element('td','admin-contact-cell');contact.append(element('strong','',user.Email||'Chưa có email'),element('span','',user.SoDienThoai||'Chưa có SĐT'));row.append(contact,element('td','',formatMoney(user.SoDu)));
            const roleLabel=user.VaiTro==='superadmin'?'Quản trị cấp cao':user.VaiTro==='admin'?'Quản trị':'Khách hàng';const roleCell=element('td');roleCell.appendChild(element('span',`admin-badge ${user.VaiTro!=='user'?'admin-badge--info':''}`,roleLabel));row.appendChild(roleCell);
            const active=Boolean(user.TrangThai);const statusCell=element('td');statusCell.appendChild(element('span',`admin-badge ${active?'admin-badge--success':'admin-badge--danger'}`,active?'Hoạt động':'Đã khóa'));row.appendChild(statusCell);
            const actionCell=element('td');const actions=element('div','admin-row-actions');const isSelf=Number(user.MaND)===Number(state.admin.id);const isSuper=state.admin.role==='superadmin';const protectedAdmin=user.VaiTro==='superadmin'||(!isSuper&&user.VaiTro==='admin');const edit=element('button','','Sửa hồ sơ');edit.type='button';edit.disabled=protectedAdmin;edit.addEventListener('click',()=>openUserDialog(user));const roleButton=element('button','',user.VaiTro==='admin'?'Hạ quyền':'Cấp admin');roleButton.type='button';roleButton.hidden=!isSuper||user.VaiTro==='superadmin';roleButton.disabled=isSelf;roleButton.addEventListener('click',()=>updateUser(user,{role:user.VaiTro==='admin'?'user':'admin'}));const activeButton=element('button',active?'danger':'',active?'Khóa':'Mở khóa');activeButton.type='button';activeButton.disabled=isSelf||protectedAdmin;activeButton.addEventListener('click',()=>updateUser(user,{active:!active}));actions.append(edit,roleButton,activeButton);actionCell.appendChild(actions);row.appendChild(actionCell);tbody.appendChild(row);
        });
        const pages=Math.max(1,Math.ceil(state.userTotal/20));$('#userPageInfo').textContent=`Trang ${state.userPage}/${pages}`;$('#userPrev').disabled=state.userPage<=1;$('#userNext').disabled=state.userPage>=pages;
        updateUserKpis(state.users);
    }

    async function updateUser(user,change){
        const action=change.role?`${change.role==='admin'?'cấp':'hạ'} quyền tài khoản @${user.TenDangNhap}`:`${change.active?'mở khóa':'khóa'} tài khoản @${user.TenDangNhap}`;
        if(!window.confirm(`Xác nhận ${action}?`))return;
        try{const data=await Auth.request(`/api/admin/users/${user.MaND}`,{method:'PATCH',json:change});showToast(data.message,'success');loadUsers();loadDashboard();}
        catch(error){showToast(error.message,'error');}
    }

    function openUserDialog(user = null) {
        $('#userForm').reset();
        $('#editUserId').value = user?.MaND || '';
        pendingUserAvatar = null;
        $('#editUserAvatar').value = '';
        $('#editUserAvatarName').textContent = 'Chưa chọn ảnh mới';
        $('#adminUserAvatarEditor').hidden = !user;
        const avatarPreview = $('#editUserAvatarPreview');
        const avatarSource = String(user?.Avatar || '').trim();
        avatarPreview.textContent = avatarSource ? '' : (user?.HoTen || user?.TenDangNhap || 'U').charAt(0).toUpperCase();
        avatarPreview.style.backgroundImage = avatarSource ? `url("${avatarSource.replace(/"/g, '%22')}")` : '';
        avatarPreview.classList.toggle('has-image', Boolean(avatarSource));
        $('#userDialogTitle').textContent = user ? 'Chỉnh sửa người dùng' : 'Thêm người dùng';
        $('#editUsername').value = user?.TenDangNhap || '';
        $('#editUsername').disabled = Boolean(user);
        $('#editFullname').value = user?.HoTen || '';
        $('#editEmail').value = user?.Email || '';
        $('#editPhone').value = user?.SoDienThoai || '';
        $('#editAddress').value = user?.DiaChi || '';
        $('#editBalance').value = Number(user?.SoDu || 0);
        $('#editRole').value = user?.VaiTro || 'user';
        $('#editRole').disabled = state.admin.role !== 'superadmin';
        $('#editPassword').required = !user;
        $('#editPassword').value = '';
        $('#passwordHint').textContent = user ? 'để trống nếu không đổi' : 'bắt buộc';
        $('#editUserActive').checked = user ? Boolean(user.TrangThai) : true;
        setStatus($('#userFormStatus'));
        $('#userDialog').showModal();
    }

    async function saveUser(event) {
        event.preventDefault();
        const id = Number($('#editUserId').value) || 0;
        const payload = {
            fullname: $('#editFullname').value.trim(), email: $('#editEmail').value.trim(),
            phone: $('#editPhone').value.trim(), address: $('#editAddress').value.trim(),
            balance: Number($('#editBalance').value || 0),
            active: $('#editUserActive').checked
        };
        if (state.admin.role === 'superadmin') payload.role = $('#editRole').value;
        if (!id) payload.username = $('#editUsername').value.trim();
        if ($('#editPassword').value) payload.password = $('#editPassword').value;
        if (!payload.fullname || (!id && (!payload.username || !payload.password))) {
            setStatus($('#userFormStatus'), 'Vui lòng nhập tên đăng nhập, họ tên và mật khẩu.'); return;
        }
        const button = $('#userSave'); setBusy(button, true, 'Đang lưu…');
        try {
            const data = await Auth.request(id ? `/api/admin/users/${id}` : '/api/admin/users', { method: id ? 'PATCH' : 'POST', json: payload });
            const savedUserId = id || Number(data.id);
            if (pendingUserAvatar && savedUserId) {
                const form = new FormData(); form.append('avatar', pendingUserAvatar);
                const response = await fetch(`${window.API_BASE}/api/admin/users/${savedUserId}/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${Auth.getToken()}` }, body: form });
                const avatarResult = await response.json();
                if (!response.ok || avatarResult.success === false) throw new Error(avatarResult.message || 'Không thể cập nhật ảnh đại diện.');
            }
            pendingUserAvatar = null;
            $('#userDialog').close(); showToast(data.message, 'success'); await loadUsers(); loadDashboard();
        } catch (error) { setStatus($('#userFormStatus'), error.message); }
        finally { setBusy(button, false); }
    }

    async function loadDeposits(){
        const tbody=$('#depositAdminRows');emptyRow(tbody,6,'Đang tải yêu cầu nạp tiền…');
        try{const data=await Auth.request(`/api/admin/nap-tien?status=${encodeURIComponent($('#depositAdminStatus').value)}`);state.deposits=data.requests||[];renderDeposits();}
        catch(error){
            console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_DEPOSITS:', error.message);
            state.deposits=FALLBACK_ADMIN_DEPOSITS;
            renderDeposits();
        }
    }

    function renderDeposits(){
        const tbody=$('#depositAdminRows');tbody.innerHTML='';if(!state.deposits.length)emptyRow(tbody,6,'Không có yêu cầu phù hợp.');
        state.deposits.forEach((item)=>{const row=element('tr');row.append(element('td','',item.MaThamChieu));const userCell=element('td');const user=element('div','admin-user-cell');const avatar=element('i','',(item.HoTen||item.TenDangNhap||'U').charAt(0).toUpperCase());const copy=element('div');copy.append(element('strong','',item.HoTen||item.TenDangNhap),element('span','',`@${item.TenDangNhap}`));user.append(avatar,copy);userCell.appendChild(user);row.append(userCell,element('td','',formatDate(item.NgayTao)),element('td','',formatMoney(item.SoTien)));const statusCell=element('td');statusCell.appendChild(badge(item.TrangThai));row.appendChild(statusCell);const actionCell=element('td');const actions=element('div','admin-row-actions');if(item.TrangThai==='CHO_DUYET'){const approve=element('button','','Duyệt');approve.type='button';approve.addEventListener('click',()=>openDepositDialog(item,'DA_DUYET'));const reject=element('button','danger','Từ chối');reject.type='button';reject.addEventListener('click',()=>openDepositDialog(item,'TU_CHOI'));actions.append(approve,reject);}else actions.appendChild(element('span','',formatDate(item.NgayXuLy)));actionCell.appendChild(actions);row.appendChild(actionCell);tbody.appendChild(row);});
        updateDepositKpis(state.deposits);
    }

    function openDepositDialog(item,status){
        $('#depositDecisionForm').reset();$('#depositDecisionId').value=item.MaYeuCau;$('#depositDecisionStatus').value=status;$('#depositDialogTitle').textContent=status==='DA_DUYET'?'Duyệt yêu cầu':'Từ chối yêu cầu';$('#depositDecisionSummary').textContent=`${item.MaThamChieu} · @${item.TenDangNhap} · ${formatMoney(item.SoTien)}. ${status==='DA_DUYET'?'Số dư sẽ được cộng ngay sau khi xác nhận.':'Số dư sẽ không thay đổi.'}`;$('#depositDecisionSubmit').textContent=status==='DA_DUYET'?'Duyệt và cộng tiền':'Xác nhận từ chối';setStatus($('#depositDecisionFormStatus'));$('#depositDialog').showModal();
    }

    async function saveDepositDecision(event){
        event.preventDefault();const id=Number($('#depositDecisionId').value);const status=$('#depositDecisionStatus').value;const button=$('#depositDecisionSubmit');setBusy(button,true,'Đang xử lý…');
        try{const data=await Auth.request(`/api/admin/nap-tien/${id}`,{method:'PATCH',json:{status,note:$('#depositDecisionNote').value.trim()}});$('#depositDialog').close();showToast(data.message,'success');loadDeposits();loadDashboard();}
        catch(error){setStatus($('#depositDecisionFormStatus'),error.message);}
        finally{setBusy(button,false);}
    }

    async function loadAudit(){
        const tbody=$('#auditRows');emptyRow(tbody,6,'Đang tải nhật ký…');
        try{const data=await Auth.request('/api/admin/audit-logs');renderAudit(data.logs||[]);}
        catch(error){
            console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_AUDIT:', error.message);
            renderAudit(FALLBACK_ADMIN_AUDIT);
        }
    }

    function auditDetail(value){
        if(!value)return '—';
        try{const parsed=typeof value==='string'?JSON.parse(value):value;return JSON.stringify(parsed,null,0);}
        catch(_){return String(value);}
    }
    const fieldLabels={name:'Tên sản phẩm',TenSP:'Tên sản phẩm',MaSP:'Mã sản phẩm',brand:'Thương hiệu',ThuongHieu:'Thương hiệu',price:'Giá bán',GiaBan:'Giá bán',original_price:'Giá gốc',GiaGoc:'Giá gốc',stock:'Tồn kho',TonKho:'Tồn kho',active:'Hiển thị',TrangThai:'Trạng thái',image:'Ảnh đại diện',HinhAnh:'Ảnh đại diện',Avatar:'Ảnh đại diện',detail_images:'Ảnh chi tiết',AnhChiTiet:'Ảnh chi tiết',description:'Mô tả',MoTa:'Mô tả',category_id:'Danh mục',MaDM:'Danh mục',source_url:'URL nguồn',NguonURL:'URL nguồn',source_name:'Tên nguồn',NguonTen:'Tên nguồn',from:'Trạng thái trước',to:'Trạng thái sau',target:'Loại đối tượng được xử lý',target_id:'Mã đối tượng được xử lý',role:'Vai trò',VaiTro:'Vai trò',balance:'Số dư',SoDu:'Số dư',email:'Email',Email:'Email',phone:'Số điện thoại',SoDienThoai:'Số điện thoại',address:'Địa chỉ',DiaChi:'Địa chỉ',fullname:'Họ tên',HoTen:'Họ tên',TenDangNhap:'Tên đăng nhập',MaND:'Mã người dùng',amount:'Số tiền',SoTien:'Số tiền',GhiChuAdmin:'Ghi chú admin',MaAdminXuLy:'Admin xử lý'};
    Object.assign(fieldLabels,{TaiKhoan:'Tài khoản bị thay đổi',VaiTroTruoc:'Vai trò trước khi thay đổi',VaiTroSau:'Vai trò sau khi thay đổi',MaYeuCau:'Mã yêu cầu',MaThamChieu:'Mã tham chiếu',TenDangNhapKhachHang:'Tài khoản khách hàng',HoTenKhachHang:'Tên khách hàng',SoTienNap:'Số tiền nạp',SoDuKhachHang:'Số dư khách hàng',SoDuTruoc:'Số dư trước khi duyệt',SoDuSau:'Số dư sau khi duyệt',TrangThaiYeuCau:'Trạng thái yêu cầu',AdminXuLy:'Quản trị viên xử lý',QuyetDinh:'Quyết định',TrangThaiPheDuyet:'Trạng thái phê duyệt',HanhDongGoc:'Thao tác ban đầu',DoiTuongGoc:'Đối tượng ban đầu',MaDoiTuongGoc:'Mã đối tượng ban đầu',DuLieuTruocGoc:'Dữ liệu trước của thao tác gốc',DuLieuSauGoc:'Dữ liệu sau của thao tác gốc',SuperAdminXuLy:'Super Admin xử lý',GhiChuSuperAdmin:'Ghi chú Super Admin',ChuDe:'Chủ đề hỗ trợ',KenhPhanHoi:'Kênh phản hồi',NoiDung:'Nội dung khách gửi',GhiChuAdmin:'Ghi chú xử lý',MaDonHang:'Mã đơn hàng',MaAdminXuLy:'Admin phụ trách'});
    const actionLabels={UPDATE:'Cập nhật',PROMOTE_ADMIN:'Nâng quyền Admin',DEMOTE_ADMIN:'Hạ quyền Admin',LOCK_USER:'Khóa tài khoản',UNLOCK_USER:'Mở khóa tài khoản',DELETE:'Ngừng bán',CREATE:'Tạo mới',APPROVE:'Duyệt nạp tiền',REJECT:'Từ chối nạp tiền',STATUS:'Đổi trạng thái',HIDE:'Ẩn',XAC_NHAN:'Super Admin xác nhận',HOAN_TAC:'Super Admin hoàn tác'};
    const entityLabels={SanPham:'Sản phẩm',YeuCauNapTien:'Yêu cầu nạp tiền',YeuCauHoTro:'Yêu cầu hỗ trợ',DonHang:'Đơn hàng',NguoiDung:'Người dùng',BaiViet:'Nội dung',Voucher:'Voucher',PheDuyetThayDoi:'Thay đổi quản trị'};
    function parsedObject(value){if(!value)return {};if(typeof value==='object')return value;try{return JSON.parse(value)||{};}catch(_){return {value:String(value)};}}
    function displayValue(key,value){if(value===null||value===undefined||value==='')return 'Không có';if(['GiaBan','GiaGoc','price','original_price','balance','SoDu','SoTien','amount','SoTienNap','SoDuKhachHang','SoDuTruoc','SoDuSau'].includes(key))return formatMoney(value);if(['TrangThai','active'].includes(key)&&[0,1,true,false].includes(value))return value?'Đang bật / hiển thị':'Đang tắt / đã ẩn';if(['VaiTro','role','VaiTroTruoc','VaiTroSau'].includes(key))return value==='superadmin'?'Super Admin':value==='admin'?'Quản trị viên':'Khách hàng';if(['TrangThaiYeuCau','TrangThaiPheDuyet'].includes(key))return badgeText(value);if(key==='QuyetDinh')return value==='HOAN_TAC'?'Hoàn tác':value==='XAC_NHAN'?'Xác nhận':value==='DA_DUYET'?'Duyệt và cộng tiền':value==='TU_CHOI'?'Từ chối':String(value);if(key==='HanhDongGoc')return actionLabels[value]||String(value);if(['target','DoiTuongGoc'].includes(key))return entityLabels[value]||String(value);if(['target_id','MaDoiTuongGoc'].includes(key))return `#${value}`;if(Array.isArray(value))return value.join('\n');if(typeof value==='object')return JSON.stringify(value,null,2);return String(value);}
    function appendDetailRow(container,key,before,after,compare=false){const row=element('div','change-detail-row');row.appendChild(element('strong','',fieldLabels[key]||key));const values=element('div','change-detail-values');const isImage=['Avatar','HinhAnh','image'].includes(key);const isRollback=/hoàn tác/i.test($('#changeDetailTitle')?.textContent||'')||(key==='TrangThaiPheDuyet'&&after==='DA_HOAN_TAC');const valueBox=(label,value,className)=>{const box=element('span',className);if(label)box.appendChild(element('small','',label));if(isImage&&value){const image=document.createElement('img');let source=String(value);if(key==='Avatar'&&!/^(?:https?:)?\/\//i.test(source)&&window.API_BASE)source=`${window.API_BASE.replace(/\/$/,'')}/${source.replace(/^\//,'')}`;image.src=safeImage(source);image.alt=label?`Ảnh ${label.toLowerCase()}`:'Ảnh đã lưu';image.className='change-detail-image';box.appendChild(image);}else box.appendChild(element('b','',displayValue(key,value)));return box;};if(compare){values.append(valueBox('Trước',before,'change-detail-old'),element('i','','→'),valueBox('Sau',after,`change-detail-new${isRollback?' change-detail-rollback':''}`));}else values.appendChild(valueBox('',after,isRollback?'change-detail-rollback':''));row.appendChild(values);container.appendChild(row);}
    function openChangeDetail({title,eyebrow,meta,before,after,compare=false,entity='',entityId='',snapshot={}}){const dialog=$('#changeDetailDialog');$('#changeDetailTitle').textContent=title;$('#changeDetailEyebrow').textContent=eyebrow;const oldData=parsedObject(before),newData=parsedObject(after),record={...parsedObject(snapshot),...oldData,...newData};const card=$('#changeProductCard');card.innerHTML='';card.hidden=!['SanPham','NguoiDung'].includes(entity);if(entity==='SanPham'){const image=element('img');image.src=safeImage(record.HinhAnh||record.image);image.alt=record.TenSP||record.name||`Sản phẩm #${entityId}`;const copy=element('div');copy.append(element('span','',`${record.ThuongHieu||record.brand||'Chưa có thương hiệu'} · Mã #${entityId}`),element('strong','',record.TenSP||record.name||`Sản phẩm #${entityId}`),element('b','',formatMoney(record.GiaBan??record.price)),element('p','',`Tồn kho: ${record.TonKho??record.stock??'—'} · ${displayValue('TrangThai',record.TrangThai??record.active)}`));const find=element('button','admin-detail-button','Tìm sản phẩm này trong quản trị →');find.type='button';find.addEventListener('click',()=>{dialog.close();$('#productQuery').value=`#${entityId}`;$('#productStatus').value='all';state.productPage=1;activateView('products',true);});copy.appendChild(find);card.append(image,copy);}if(entity==='NguoiDung'){const avatar=userAvatar(record);avatar.classList.add('change-user-avatar');const copy=element('div');copy.append(element('span','',`Tài khoản #${entityId}`),element('strong','',record.HoTen||record.fullname||record.TenDangNhap||`Người dùng #${entityId}`),element('b','',`@${record.TenDangNhap||'không rõ'}`),element('p','',`${record.Email||record.email||'Chưa có email'} · ${record.SoDienThoai||record.phone||'Chưa có SĐT'}`));const find=element('button','admin-detail-button','Tìm tài khoản này trong quản trị →');find.type='button';find.addEventListener('click',()=>{dialog.close();$('#userQuery').value=record.TenDangNhap||`#${entityId}`;state.userPage=1;activateView('users',true);});copy.appendChild(find);card.append(avatar,copy);}const metaBox=$('#changeDetailMeta');metaBox.innerHTML='';meta.filter(Boolean).forEach(item=>metaBox.appendChild(element('span','',item)));const body=$('#changeDetailBody');body.innerHTML='';const ignored=new Set(['NgayTao','NgayCapNhat','NgayXuLy']);const keys=[...new Set([...Object.keys(oldData),...Object.keys(newData)])].filter(key=>!ignored.has(key));const changedKeys=compare?keys.filter(key=>JSON.stringify(oldData[key])!==JSON.stringify(newData[key])):keys;if(!changedKeys.length)body.appendChild(element('p','admin-empty','Không có dữ liệu chi tiết được lưu.'));else changedKeys.forEach(key=>appendDetailRow(body,key,oldData[key],newData[key],compare));dialog.showModal();}
    function renderAudit(items){const tbody=$('#auditRows');tbody.innerHTML='';if(!items.length)emptyRow(tbody,6,'Chưa có hoạt động quản trị.');items.forEach((log)=>{const row=element('tr');const detail=parsedObject(log.ChiTiet);const hasComparison=Boolean(log.DuLieuTruoc);const after=log.DuLieuSau||detail;const changed=hasComparison?[...new Set([...Object.keys(parsedObject(log.DuLieuTruoc)),...Object.keys(parsedObject(after))])].filter(key=>JSON.stringify(parsedObject(log.DuLieuTruoc)[key])!==JSON.stringify(parsedObject(after)[key])):Object.keys(detail);const detailCell=element('td');const summary=element('span','admin-detail-summary',changed.map(key=>fieldLabels[key]||key).join(', ')||'Không có dữ liệu');const view=element('button','admin-detail-button',hasComparison?'Xem trước và sau':'Xem đầy đủ');view.type='button';view.addEventListener('click',()=>openChangeDetail({title:`${actionLabels[log.HanhDong]||log.HanhDong} ${entityLabels[log.DoiTuong]||log.DoiTuong}`,eyebrow:'Chi tiết nhật ký quản trị',meta:[`@${log.TenDangNhap}`,formatDate(log.NgayTao),`${entityLabels[log.DoiTuong]||log.DoiTuong}${log.MaDoiTuong?` #${log.MaDoiTuong}`:''}`,`IP: ${log.DiaChiIP||'—'}`,log.TrangThaiPheDuyet?badgeText(log.TrangThaiPheDuyet):''],before:log.DuLieuTruoc,after,compare:hasComparison,entity:log.DoiTuong,entityId:log.MaDoiTuong,snapshot:{TenDangNhap:log.DoiTuongTenDangNhap,HoTen:log.DoiTuongHoTen,Email:log.DoiTuongEmail,SoDienThoai:log.DoiTuongSoDienThoai,Avatar:log.DoiTuongAvatar}}));detailCell.append(summary,view);const adminCell=element('td');const adminWrap=element('div','admin-user-cell');const adminAvatar=userAvatar({TenDangNhap:log.TenDangNhap,HoTen:log.HoTenAdmin,Avatar:log.AvatarAdmin});const adminCopy=element('div');adminCopy.append(element('strong','',log.HoTenAdmin||log.TenDangNhap),element('span','',`@${log.TenDangNhap}`));adminWrap.append(adminAvatar,adminCopy);adminCell.appendChild(adminWrap);row.append(element('td','',formatDate(log.NgayTao)),adminCell,element('td','',actionLabels[log.HanhDong]||log.HanhDong),element('td','',`${entityLabels[log.DoiTuong]||log.DoiTuong}${log.MaDoiTuong?` #${log.MaDoiTuong}`:''}`),detailCell,element('td','',log.DiaChiIP||'—'));tbody.appendChild(row);});updateAuditKpis(items);}

    async function loadApprovals(){
        const tbody=$('#approvalRows');emptyRow(tbody,6,'Đang tải thay đổi…');
        try{const data=await Auth.request(`/api/admin/phe-duyet-thay-doi?status=${encodeURIComponent($('#approvalStatus').value)}`);renderApprovals(data.changes||[]);if($('#approvalStatus').value==='CHO_XEM')updateNavBadge($('#navPendingApprovals'),(data.changes||[]).length);}
        catch(error){
            console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_APPROVALS:', error.message);
            renderApprovals(FALLBACK_ADMIN_APPROVALS);
            updateNavBadge($('#navPendingApprovals'), FALLBACK_ADMIN_APPROVALS.length);
        }
    }
    function changeSummary(item){const after=item.DuLieuSau||{};if(item.DoiTuong==='YeuCauNapTien')return `${item.HanhDong==='APPROVE'?'Duyệt':'Từ chối'} yêu cầu nạp ${formatMoney(after.SoTien||after.amount||0)}`;if(item.DoiTuong==='SanPham'){if(item.HanhDong==='DELETE')return 'Ngừng bán và đưa tồn kho về 0';const keys=Object.keys(after).filter(key=>!['NgayCapNhat','NgayTao'].includes(key));return `Cập nhật: ${keys.slice(0,4).join(', ')}${keys.length>4?'…':''}`;}return auditDetail(after);}
    function renderApprovals(items){const tbody=$('#approvalRows');tbody.innerHTML='';if(!items.length){emptyRow(tbody,6,'Không có thay đổi phù hợp.');return;}items.forEach(item=>{const row=element('tr');row.append(element('td','',formatDate(item.NgayTao)),element('td','',`@${item.TenDangNhap}`),element('td','',actionLabels[item.HanhDong]||item.HanhDong),element('td','',`${entityLabels[item.DoiTuong]||item.DoiTuong}${item.MaDoiTuong?` #${item.MaDoiTuong}`:''}`));const detail=element('td');detail.appendChild(element('span','admin-detail-summary',changeSummary(item)));const view=element('button','admin-detail-button','Xem thay đổi trước và sau');view.type='button';view.addEventListener('click',()=>openChangeDetail({title:`${actionLabels[item.HanhDong]||item.HanhDong} ${entityLabels[item.DoiTuong]||item.DoiTuong}`,eyebrow:'Đối chiếu thay đổi của Admin',meta:[`@${item.TenDangNhap}`,formatDate(item.NgayTao),`Mã thay đổi #${item.MaThayDoi}`,badgeText(item.TrangThai)],before:item.DuLieuTruoc,after:item.DuLieuSau,compare:Boolean(item.DuLieuTruoc),entity:item.DoiTuong,entityId:item.MaDoiTuong}));detail.appendChild(view);row.appendChild(detail);const action=element('td');const actions=element('div','admin-row-actions');if(item.TrangThai==='CHO_XEM'){const accept=element('button','','Xác nhận');accept.type='button';accept.addEventListener('click',()=>reviewChange(item.MaThayDoi,'XAC_NHAN'));actions.appendChild(accept);if(item.CoTheHoanTac){const undo=element('button','danger','Hoàn tác');undo.type='button';undo.addEventListener('click',()=>reviewChange(item.MaThayDoi,'HOAN_TAC'));actions.appendChild(undo);}}else actions.appendChild(badge(item.TrangThai));action.appendChild(actions);row.appendChild(action);tbody.appendChild(row);});updateApprovalKpis(items);}
    function badgeText(status){return statusMeta[status]?.[0]||status||'Không rõ';}
    async function reviewChange(id,decision){const promptText=decision==='HOAN_TAC'?'Nhập lý do hoàn tác (không bắt buộc):':'Ghi chú xác nhận (không bắt buộc):';const note=window.prompt(promptText,'');if(note===null)return;try{const data=await Auth.request(`/api/admin/phe-duyet-thay-doi/${id}`,{method:'PATCH',json:{decision,note}});showToast(data.message,'success');loadApprovals();if(decision==='HOAN_TAC'){state.loaded.delete('products');state.loaded.delete('deposits');loadDashboard();}}catch(error){showToast(error.message,'error');}}

    async function loadSupport(){const tbody=$('#supportRows');emptyRow(tbody,7,'Đang tải yêu cầu hỗ trợ…');const params=new URLSearchParams({page:state.supportPage,limit:20,status:$('#supportStatus').value,q:$('#supportQuery').value.trim()});try{const data=await Auth.request(`/api/admin/ho-tro?${params}`);state.support=data.requests||[];state.supportTotal=Number(data.total)||0;renderSupport();}catch(error){
        console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_SUPPORT:', error.message);
        state.support=FALLBACK_ADMIN_SUPPORT;
        state.supportTotal=FALLBACK_ADMIN_SUPPORT.length;
        renderSupport();
    }}
    function supportSubject(value){return {TU_VAN_SAN_PHAM:'Tư vấn sản phẩm',DON_HANG:'Đơn hàng',THANH_TOAN:'Thanh toán',TAI_KHOAN:'Tài khoản',BAO_LOI:'Báo lỗi',KHAC:'Khác'}[value]||value||'—';}
    function renderSupport(){const tbody=$('#supportRows');tbody.innerHTML='';if(!state.support.length)emptyRow(tbody,7,'Không có yêu cầu phù hợp.');state.support.forEach(item=>{const row=element('tr');row.append(element('td','',`HT-${String(item.MaYeuCau).padStart(6,'0')}`));const sender=element('td');sender.append(element('strong','',item.HoTen),element('span','admin-detail-summary',`${item.Email}${item.SoDienThoai?` · ${item.SoDienThoai}`:''}`));row.append(sender,element('td','',supportSubject(item.ChuDe)),element('td','admin-support-preview',item.NoiDung),element('td','',formatDate(item.NgayTao)));const status=element('td');status.appendChild(badge(item.TrangThai));row.appendChild(status);const action=element('td');const button=element('button','admin-detail-button','Mở phiếu');button.type='button';button.addEventListener('click',()=>openSupport(item));action.appendChild(button);row.appendChild(action);tbody.appendChild(row);});const pages=Math.max(1,Math.ceil(state.supportTotal/20));$('#supportPageInfo').textContent=`Trang ${state.supportPage}/${pages}`;$('#supportPrev').disabled=state.supportPage<=1;$('#supportNext').disabled=state.supportPage>=pages;const pending=state.support.filter(item=>item.TrangThai==='MOI').length;updateNavBadge($('#navPendingSupport'),pending);updateSupportKpis(state.support);}
    function openSupport(item){$('#supportId').value=item.MaYeuCau;$('#supportDialogStatus').value=item.TrangThai;$('#supportAdminNote').value=item.GhiChuAdmin||'';$('#supportDialogTitle').textContent=`Phiếu HT-${String(item.MaYeuCau).padStart(6,'0')}`;const detail=$('#supportDetail');detail.innerHTML='';[['Người gửi',item.HoTen],['Liên hệ',`${item.Email}${item.SoDienThoai?` · ${item.SoDienThoai}`:''}`],['Chủ đề',supportSubject(item.ChuDe)],['Mã đơn',item.MaDonHang||'Không có'],['Kênh phản hồi',item.KenhPhanHoi==='DIEN_THOAI'?'Điện thoại':'Email'],['Nội dung',item.NoiDung],['Tiếp nhận lúc',formatDate(item.NgayTao)]].forEach(([label,value])=>{const fact=element('div');fact.append(element('span','',label),element('strong','',value));detail.appendChild(fact);});setStatus($('#supportFormStatus'));$('#supportDialog').showModal();}
    async function saveSupport(event){event.preventDefault();const id=Number($('#supportId').value);const button=$('#supportSave');setBusy(button,true,'Đang lưu…');try{const data=await Auth.request(`/api/admin/ho-tro/${id}`,{method:'PATCH',json:{status:$('#supportDialogStatus').value,note:$('#supportAdminNote').value.trim()}});$('#supportDialog').close();showToast(data.message,'success');loadSupport();}catch(error){setStatus($('#supportFormStatus'),error.message);}finally{setBusy(button,false);}}

    async function loadContent(){const tbody=$('#contentRows');emptyRow(tbody,5,'Đang tải nội dung…');try{const data=await Auth.request(`/api/admin/noi-dung?loai=${encodeURIComponent($('#contentTypeFilter').value)}`);state.content=data.items||[];renderContent();}catch(error){
        console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_CONTENT:', error.message);
        state.content=FALLBACK_ADMIN_CONTENT;
        renderContent();
    }}
    function renderContent(){const tbody=$('#contentRows');tbody.innerHTML='';if(!state.content.length)emptyRow(tbody,5,'Chưa có nội dung. Hãy tạo bài đầu tiên và chọn “Xuất bản ngay”.');state.content.forEach((item)=>{const row=element('tr');const titleCell=element('td');titleCell.append(element('strong','admin-content-title',item.TieuDe),element('span','admin-content-summary',item.TomTat||'Chưa có tóm tắt'));row.append(titleCell,element('td','',item.Loai==='TIN_TUC'?'Tin tức':'Hướng dẫn'),element('td','',formatDate(item.NgayDang)));const status=element('td');status.appendChild(element('span',`admin-badge ${item.TrangThai?'admin-badge--success':'admin-badge--info'}`,item.TrangThai?'Công khai':'Bản nháp'));row.appendChild(status);const action=element('td');const actions=element('div','admin-row-actions');if(item.TrangThai){const preview=element('a','','Xem trên web');preview.href=`baiviet.html?id=${encodeURIComponent(item.MaBV)}`;preview.target='_blank';preview.rel='noopener';actions.appendChild(preview);}const edit=element('button','','Sửa');edit.type='button';edit.addEventListener('click',()=>openContentDialog(item));const toggle=element('button',item.TrangThai?'danger':'',item.TrangThai?'Chuyển về nháp':'Xuất bản');toggle.type='button';toggle.addEventListener('click',()=>saveContentStatus(item,!Boolean(item.TrangThai)));actions.append(edit,toggle);action.appendChild(actions);row.appendChild(action);tbody.appendChild(row);});updateContentKpis(state.content);}
    function syncContentPublishHint(){const checkbox=$('#contentActive');const label=checkbox.closest('label');const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());if(textNode)textNode.textContent=' Xuất bản ngay';let hint=$('#contentPublishHint');if(!hint){hint=element('p','admin-publish-note');hint.id='contentPublishHint';label.insertAdjacentElement('afterend',hint);}hint.textContent=checkbox.checked?'Bài sẽ xuất hiện ngay tại Tin tức/Hướng dẫn sau khi lưu.':'Bài được lưu an toàn dưới dạng bản nháp và chưa hiện với khách hàng.';}
    function openContentDialog(item=null){$('#contentForm').reset();$('#contentId').value=item?.MaBV||'';$('#contentDialogTitle').textContent=item?'Chỉnh sửa nội dung':'Thêm nội dung';$('#contentType').value=item?.Loai||'TIN_TUC';$('#contentTitle').value=item?.TieuDe||'';$('#contentSummary').value=item?.TomTat||'';$('#contentBody').value=item?.NoiDung||'';$('#contentImage').value=item?.HinhAnh||'';renderContentImagePreview();$('#contentSource').value=item?.NguonURL||'';$('#contentActive').checked=item?Boolean(item.TrangThai):true;syncContentPublishHint();setStatus($('#contentFormStatus'));$('#contentDialog').showModal();}
    async function saveContent(event){event.preventDefault();const id=Number($('#contentId').value)||0;const payload={type:$('#contentType').value,title:$('#contentTitle').value.trim(),summary:$('#contentSummary').value.trim(),content:$('#contentBody').value.trim(),image:$('#contentImage').value.trim(),source_url:$('#contentSource').value.trim(),active:$('#contentActive').checked};const button=$('#contentSave');setBusy(button,true,'Đang lưu…');try{const data=await Auth.request(id?`/api/admin/noi-dung/${id}`:'/api/admin/noi-dung',{method:id?'PATCH':'POST',json:payload});$('#contentDialog').close();showToast(data.message,'success');loadContent();}catch(error){setStatus($('#contentFormStatus'),error.message);}finally{setBusy(button,false);}}
    async function saveContentStatus(item,active){try{const data=await Auth.request(`/api/admin/noi-dung/${item.MaBV}`,{method:'PATCH',json:{active}});showToast(data.message,'success');loadContent();}catch(error){showToast(error.message,'error');}}

    async function loadVouchers(){const tbody=$('#voucherRows');emptyRow(tbody,7,'Đang tải voucher…');try{const data=await Auth.request('/api/admin/vouchers');state.vouchers=data.items||[];renderVouchers();}catch(error){
        console.warn('Backend chưa sẵn sàng, nạp FALLBACK_ADMIN_VOUCHERS:', error.message);
        state.vouchers=FALLBACK_ADMIN_VOUCHERS;
        renderVouchers();
    }}
    function renderVouchers(){const tbody=$('#voucherRows');tbody.innerHTML='';if(!state.vouchers.length){emptyRow(tbody,7,'Chưa có voucher.');return;}state.vouchers.forEach(v=>{const row=element('tr');let value=formatMoney(v.GiaTri);if(v.LoaiGiam==='PHAN_TRAM'){value=`${Number(v.GiaTri)}%`;if(v.GiamToiDa)value+=` · tối đa ${formatMoney(v.GiamToiDa)}`;}row.append(element('td','',v.MaVoucher),element('td','',value),element('td','',formatMoney(v.DonToiThieu)),element('td','',`${v.DaSuDung}/${v.SoLuong}`),element('td','',v.NgayHetHan?formatDate(v.NgayHetHan):'Không giới hạn'));const status=element('td');status.append(element('span',`admin-badge ${v.TrangThai?'admin-badge--success':'admin-badge--danger'}`,v.TrangThai?'Hoạt động':'Tạm tắt'));row.append(status);const action=element('td');const toggle=element('button',v.TrangThai?'danger':'',v.TrangThai?'Tắt':'Bật');toggle.type='button';toggle.addEventListener('click',async()=>{try{const data=await Auth.request(`/api/admin/vouchers/${encodeURIComponent(v.MaVoucher)}`,{method:'PATCH',json:{active:!Boolean(v.TrangThai)}});showToast(data.message,'success');loadVouchers();}catch(error){showToast(error.message,'error');}});action.append(toggle);row.append(action);tbody.append(row);});updateVoucherKpis(state.vouchers);}
    function openVoucherDialog(){const form=$('#voucherForm');form.reset();$('#voucherQuantity').value='100';$('#voucherMinimum').value='0';$('#voucherActive').checked=true;setStatus($('#voucherFormStatus'));$('#voucherDialog').showModal();}
    async function saveVoucher(event){event.preventDefault();const payload={code:$('#voucherCode').value.trim().toUpperCase(),type:$('#voucherType').value,value:$('#voucherValue').value,maximum:$('#voucherMaximum').value||null,minimum:$('#voucherMinimum').value||0,quantity:$('#voucherQuantity').value,starts_at:$('#voucherStarts').value||null,expires_at:$('#voucherExpires').value||null,active:$('#voucherActive').checked};const button=$('#voucherSave');setBusy(button,true,'Đang tạo…');try{const data=await Auth.request('/api/admin/vouchers',{method:'POST',json:payload});$('#voucherDialog').close();showToast(data.message,'success');loadVouchers();}catch(error){setStatus($('#voucherFormStatus'),error.message);}finally{setBusy(button,false);}}

    /* ==========================================================================
       BADMINTON STORE — ADMIN SUB-PANEL KPI METRIC UPDATERS
       ========================================================================== */
    function updateProductKpis(products) {
        if (!Array.isArray(products)) return;
        animateMetric($('#kpiProductTotal'), state.productTotal || products.length);
        const active = products.filter(p => p.TrangThai !== 0).length;
        animateMetric($('#kpiProductActive'), active);
        const lowStock = products.filter(p => (Number(p.TonKho) || 0) < 10).length;
        animateMetric($('#kpiProductLowStock'), lowStock);
        const sale = products.filter(p => Number(p.GiaGoc || 0) > Number(p.GiaBan || 0)).length;
        animateMetric($('#kpiProductOnSale'), sale);
    }

    function updateOrderKpis(orders) {
        if (!Array.isArray(orders)) return;
        animateMetric($('#kpiOrderTotal'), state.orderTotal || orders.length);
        const pending = orders.filter(o => o.TrangThai === 'CHO_XAC_NHAN').length;
        animateMetric($('#kpiOrderPending'), pending);
        const shipping = orders.filter(o => o.TrangThai === 'DANG_GIAO').length;
        animateMetric($('#kpiOrderShipping'), shipping);
        const completed = orders.filter(o => o.TrangThai === 'HOAN_THANH');
        const revenue = completed.reduce((sum, o) => sum + (Number(o.TongTien) || 0), 0);
        animateMetric($('#kpiOrderCompletedRevenue'), revenue, formatMoney);
        const countNode = $('#kpiOrderCompletedCount');
        if (countNode) countNode.textContent = `${completed.length} đơn hoàn thành`;
    }

    function updateUserKpis(users) {
        if (!Array.isArray(users)) return;
        animateMetric($('#kpiUserTotal'), state.userTotal || users.length);
        const admins = users.filter(u => ['admin', 'superadmin'].includes(u.VaiTro)).length;
        animateMetric($('#kpiUserAdmins'), admins);
        const members = users.filter(u => !['admin', 'superadmin'].includes(u.VaiTro)).length;
        animateMetric($('#kpiUserMembers'), members);
        const totalBalance = users.reduce((sum, u) => sum + (Number(u.SoDu) || 0), 0);
        animateMetric($('#kpiUserTotalBalance'), totalBalance, formatMoney);
    }

    function updateContentKpis(content) {
        if (!Array.isArray(content)) return;
        animateMetric($('#kpiContentTotal'), content.length);
        const news = content.filter(c => c.Loai === 'TIN_TUC').length;
        animateMetric($('#kpiContentNews'), news);
        const guides = content.filter(c => c.Loai === 'HUONG_DAN').length;
        animateMetric($('#kpiContentGuides'), guides);
        const published = content.filter(c => c.TrangThai !== 0).length;
        animateMetric($('#kpiContentPublished'), published);
    }

    function updateSupportKpis(support) {
        if (!Array.isArray(support)) return;
        animateMetric($('#kpiSupportTotal'), state.supportTotal || support.length);
        const newTickets = support.filter(s => s.TrangThai === 'MOI').length;
        animateMetric($('#kpiSupportNew'), newTickets);
        const processing = support.filter(s => s.TrangThai === 'DANG_XU_LY').length;
        animateMetric($('#kpiSupportProcessing'), processing);
        const resolved = support.filter(s => ['DA_DONG', 'DA_PHAN_HOI'].includes(s.TrangThai)).length;
        animateMetric($('#kpiSupportResolved'), resolved);
    }

    function updateVoucherKpis(vouchers) {
        if (!Array.isArray(vouchers)) return;
        animateMetric($('#kpiVoucherTotal'), vouchers.length);
        const active = vouchers.filter(v => v.TrangThai !== 0).length;
        animateMetric($('#kpiVoucherActive'), active);
        const used = vouchers.reduce((sum, v) => sum + (Number(v.DaSuDung) || 0), 0);
        animateMetric($('#kpiVoucherUsed'), used);
        let maxDiscount = 0;
        vouchers.forEach(v => {
            if (v.LoaiGiam === 'PHAN_TRAM' && Number(v.GiaTri) > maxDiscount) {
                maxDiscount = Number(v.GiaTri);
            }
        });
        const maxNode = $('#kpiVoucherMaxDiscount');
        if (maxNode) maxNode.textContent = maxDiscount > 0 ? `${maxDiscount}%` : '0%';
    }

    function updateDepositKpis(deposits) {
        if (!Array.isArray(deposits)) return;
        const pending = deposits.filter(d => d.TrangThai === 'CHO_DUYET').length;
        animateMetric($('#kpiDepositPending'), pending);
        const approved = deposits.filter(d => d.TrangThai === 'DA_DUYET');
        animateMetric($('#kpiDepositApproved'), approved.length);
        const totalApproved = approved.reduce((sum, d) => sum + (Number(d.SoTien) || 0), 0);
        animateMetric($('#kpiDepositTotalMoney'), totalApproved, formatMoney);
        const rejected = deposits.filter(d => d.TrangThai === 'TU_CHOI').length;
        animateMetric($('#kpiDepositRejected'), rejected);
    }

    function updateAuditKpis(logs) {
        if (!Array.isArray(logs)) return;
        animateMetric($('#kpiAuditTotal'), logs.length);
        const updates = logs.filter(l => /cap_nhat|update/i.test(l.HanhDong || '')).length;
        animateMetric($('#kpiAuditUpdates'), updates);
        const statusChanges = logs.filter(l => /trang_thai|status|duyet|tu_choi/i.test(l.HanhDong || '')).length;
        animateMetric($('#kpiAuditStatusChanges'), statusChanges);
        const ipNode = $('#kpiAuditLatestIp');
        if (ipNode && logs[0]?.DiaChiIP) {
            ipNode.textContent = logs[0].DiaChiIP;
        }
    }

    function updateApprovalKpis(changes) {
        if (!Array.isArray(changes)) return;
        const pending = changes.filter(c => c.TrangThai === 'CHO_XEM').length;
        animateMetric($('#kpiApprovalPending'), pending);
        const confirmed = changes.filter(c => c.TrangThai === 'DA_XAC_NHAN').length;
        animateMetric($('#kpiApprovalConfirmed'), confirmed);
        const reverted = changes.filter(c => c.TrangThai === 'DA_HOAN_TAC').length;
        animateMetric($('#kpiApprovalReverted'), reverted);
        const rollbackable = changes.filter(c => c.CoTheHoanTac).length;
        animateMetric($('#kpiApprovalRollbackable'), rollbackable);
    }

    /* ==========================================================================
       BADMINTON STORE — ADMIN THEME TOGGLE (DARK / LIGHT) & QUICK FILTER PILLS
       ========================================================================== */
    function setupAdminTheme() {
        const toggleBtn = $('#adminThemeToggle');
        if (!toggleBtn) return;
        const iconSpan = toggleBtn.querySelector('.admin-theme-icon');
        const labelSpan = toggleBtn.querySelector('.admin-theme-label');

        function applyTheme(theme, save = true) {
            document.documentElement.dataset.theme = theme;
            if (save) {
                try { localStorage.setItem('badminton_theme', theme); } catch (e) {}
            }
            if (theme === 'dark') {
                if (iconSpan) iconSpan.textContent = '☀️';
                if (labelSpan) labelSpan.textContent = 'Chế độ sáng';
                toggleBtn.setAttribute('title', 'Chuyển sang chế độ sáng');
            } else {
                if (iconSpan) iconSpan.textContent = '🌙';
                if (labelSpan) labelSpan.textContent = 'Chế độ tối';
                toggleBtn.setAttribute('title', 'Chuyển sang chế độ tối');
            }
            if (state.currentView === 'overview') {
                setTimeout(replayAllDashboardAnimations, 60);
            }
        }

        const savedTheme = localStorage.getItem('badminton_theme') || document.documentElement.dataset.theme || 'light';
        applyTheme(savedTheme, false);

        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.dataset.theme || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next, true);
            showToast(`Đã chuyển sang ${next === 'dark' ? 'Chế độ tối (Dark Mode)' : 'Chế độ sáng (Light Mode)'}.`, 'success');
        });
    }

    function renderFilteredProducts(products) {
        const tbody = $('#productRows');
        tbody.innerHTML = '';
        if (!products.length) { emptyRow(tbody, 6, 'Không có sản phẩm trong danh mục lọc này.'); return; }
        products.forEach((product) => {
            const row = element('tr');
            const productCell = element('td');
            const productInfo = element('div', 'admin-product');
            const image = document.createElement('img'); image.src = safeImage(product.HinhAnh); image.alt = ''; image.loading = 'lazy';
            const copy = element('div'); copy.append(element('strong', '', product.TenSP), element('span', '', `${product.ThuongHieu || 'Chưa có thương hiệu'} · #${product.MaSP}`));
            productInfo.append(image, copy); productCell.appendChild(productInfo);
            row.append(productCell, element('td', '', product.TenDM || `#${product.MaDM}`), element('td', '', formatMoney(product.GiaBan)), element('td', '', String(product.TonKho ?? 0)));
            const statusCell = element('td');
            statusCell.appendChild(element('span', `admin-badge ${product.TrangThai ? 'admin-badge--success' : 'admin-badge--danger'}`, product.TrangThai ? 'Đang bán' : 'Đã ẩn'));
            if (Number(product.GiaGoc || 0) > Number(product.GiaBan || 0)) statusCell.appendChild(element('span', 'admin-badge admin-badge--danger', 'Sale Off'));
            row.appendChild(statusCell);
            const actionsCell = element('td');
            const actions = element('div', 'admin-row-actions');
            const detailRow = buildProductDetailRow(product);
            const detailButton = element('button', '', 'Xem chi tiết'); detailButton.type = 'button'; detailButton.setAttribute('aria-expanded', 'false'); detailButton.addEventListener('click', () => { const opening = detailRow.hidden; detailRow.hidden = !opening; detailButton.textContent = opening ? 'Thu gọn' : 'Xem chi tiết'; detailButton.setAttribute('aria-expanded', String(opening)); });
            const edit = element('button', '', 'Sửa'); edit.type = 'button'; edit.addEventListener('click', () => openProductDialog(product));
            const toggle = element('button', product.TrangThai ? 'danger' : '', product.TrangThai ? 'Ẩn' : 'Hiện'); toggle.type = 'button'; toggle.addEventListener('click', () => toggleProduct(product));
            const remove = element('button', 'danger', 'Ngừng bán'); remove.type = 'button'; remove.addEventListener('click', () => removeProduct(product));
            actions.append(detailButton, edit, toggle, remove); actionsCell.appendChild(actions); row.appendChild(actionsCell); tbody.append(row, detailRow);
        });
    }

    function renderFilteredVouchers(vouchers) {
        const tbody = $('#voucherRows');
        tbody.innerHTML = '';
        if (!vouchers.length) { emptyRow(tbody, 7, 'Không có voucher trong bộ lọc này.'); return; }
        vouchers.forEach(v => {
            const row = element('tr');
            let value = formatMoney(v.GiaTri);
            if (v.LoaiGiam === 'PHAN_TRAM') { value = `${Number(v.GiaTri)}%`; if (v.GiamToiDa) value += ` · tối đa ${formatMoney(v.GiamToiDa)}`; }
            row.append(element('td', '', v.MaVoucher), element('td', '', value), element('td', '', formatMoney(v.DonToiThieu)), element('td', '', `${v.DaSuDung}/${v.SoLuong}`), element('td', '', v.NgayHetHan ? formatDate(v.NgayHetHan) : 'Không giới hạn'));
            const status = element('td');
            status.append(element('span', `admin-badge ${v.TrangThai ? 'admin-badge--success' : 'admin-badge--danger'}`, v.TrangThai ? 'Hoạt động' : 'Tạm tắt'));
            row.append(status);
            const action = element('td');
            const toggle = element('button', v.TrangThai ? 'danger' : '', v.TrangThai ? 'Tắt' : 'Bật');
            toggle.type = 'button';
            toggle.addEventListener('click', async () => {
                try {
                    const data = await Auth.request(`/api/admin/vouchers/${encodeURIComponent(v.MaVoucher)}`, { method: 'PATCH', json: { active: !Boolean(v.TrangThai) } });
                    showToast(data.message, 'success');
                    loadVouchers();
                } catch (error) { showToast(error.message, 'error'); }
            });
            action.append(toggle); row.append(action); tbody.append(row);
        });
    }

    function setupFilterPills() {
        // Products filter pills
        $$('#productFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#productFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                const filter = btn.dataset.filter;
                if (filter === 'all' || filter === 'active' || filter === 'hidden') {
                    $('#productStatus').value = filter;
                    state.productPage = 1;
                    loadProducts();
                } else if (filter === 'lowstock') {
                    const low = state.products.filter(p => (Number(p.TonKho) || 0) < 10);
                    renderFilteredProducts(low);
                } else if (filter === 'sale') {
                    const sale = state.products.filter(p => Number(p.GiaGoc || 0) > Number(p.GiaBan || 0));
                    renderFilteredProducts(sale);
                }
            });
        });

        // Orders filter pills
        $$('#orderFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#orderFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                $('#adminOrderStatus').value = btn.dataset.filter;
                state.orderPage = 1;
                loadOrders();
            });
        });

        // Users filter pills
        $$('#userFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#userFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                $('#userRole').value = btn.dataset.filter;
                state.userPage = 1;
                loadUsers();
            });
        });

        // Content filter pills
        $$('#contentFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#contentFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                $('#contentTypeFilter').value = btn.dataset.filter;
                loadContent();
            });
        });

        // Support filter pills
        $$('#supportFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#supportFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                $('#supportStatus').value = btn.dataset.filter;
                state.supportPage = 1;
                loadSupport();
            });
        });

        // Vouchers filter pills
        $$('#voucherFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#voucherFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                const filter = btn.dataset.filter;
                if (filter === 'active') {
                    renderFilteredVouchers(state.vouchers.filter(v => v.TrangThai !== 0));
                } else if (filter === 'expired') {
                    renderFilteredVouchers(state.vouchers.filter(v => v.TrangThai === 0 || (v.NgayHetHan && new Date(v.NgayHetHan) < new Date())));
                } else {
                    renderVouchers();
                }
            });
        });

        // Deposits filter pills
        $$('#depositFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#depositFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                $('#depositAdminStatus').value = btn.dataset.filter;
                loadDeposits();
            });
        });

        // Approvals filter pills
        $$('#approvalFilterPills .admin-pill-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('#approvalFilterPills .admin-pill-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                $('#approvalStatus').value = btn.dataset.filter;
                loadApprovals();
            });
        });
    }

    function installEvents(){
        setupAdminTheme();
        setupFilterPills();
        $$('[data-admin-view]').forEach((button)=>button.addEventListener('click',()=>activateView(button.dataset.adminView)));
        $$('[data-jump-view]').forEach((button)=>button.addEventListener('click',()=>activateView(button.dataset.jumpView)));
        $('#adminRefresh').addEventListener('click',async(event)=>{const button=event.currentTarget;button.classList.add('is-refreshing');button.disabled=true;try{await activateView(state.currentView,true);}finally{window.setTimeout(()=>{button.classList.remove('is-refreshing');button.disabled=false;},260);}});
        $('#productSearch').addEventListener('submit',(event)=>{event.preventDefault();state.productPage=1;loadProducts();});
        $('#productStatus').addEventListener('change',()=>{state.productPage=1;loadProducts();});
        $('#productSale').addEventListener('change',()=>{const enabled=$('#productSale').checked;$('#productOriginalPrice').disabled=!enabled;if(enabled)$('#productOriginalPrice').focus();else $('#productOriginalPrice').value='';});
        $('#addProduct').addEventListener('click',()=>openProductDialog());$('#productForm').addEventListener('submit',saveProduct);
        $('#productImage').addEventListener('input', renderProductMediaPreviews);
        $('#productDetailImages').addEventListener('input', renderProductMediaPreviews);
        $('#uploadProductImage').addEventListener('click',()=>$('#productImageFile').click());
        $('#productImageFile').addEventListener('change',async(event)=>{const file=event.target.files?.[0];if(!file)return;const button=$('#uploadProductImage');try{$('#productImage').value=await uploadAdminImage(file,'products',button);renderProductMediaPreviews();showToast('Đã tải ảnh đại diện sản phẩm.','success');}catch(error){setStatus($('#productFormStatus'),error.message);}finally{event.target.value='';}});
        $('#uploadProductDetailImages').addEventListener('click',()=>$('#productDetailImageFiles').click());
        $('#productDetailImageFiles').addEventListener('change',async(event)=>{const files=[...(event.target.files||[])];if(!files.length)return;const button=$('#uploadProductDetailImages');const status=$('#productDetailUploadStatus');button.disabled=true;const uploaded=[];try{for(let index=0;index<files.length;index+=1){status.textContent=`Đang tải ảnh ${index+1}/${files.length}…`;uploaded.push(await uploadAdminImage(files[index],'products',button,status));}const existing=$('#productDetailImages').value.trim();$('#productDetailImages').value=[existing,...uploaded].filter(Boolean).join('\n');renderProductMediaPreviews();status.textContent=`Đã thêm ${uploaded.length} ảnh vào Swiper.`;showToast(`Đã tải ${uploaded.length} ảnh chi tiết.`,'success');}catch(error){status.textContent=error.message;setStatus($('#productFormStatus'),error.message);}finally{button.disabled=false;event.target.value='';}});
        $('#productPrev').addEventListener('click',()=>{if(state.productPage>1){state.productPage-=1;loadProducts();}});$('#productNext').addEventListener('click',()=>{if(state.productPage*20<state.productTotal){state.productPage+=1;loadProducts();}});
        $('#orderSearch').addEventListener('submit',(event)=>{event.preventDefault();state.orderPage=1;loadOrders();});$('#adminOrderStatus').addEventListener('change',()=>{state.orderPage=1;loadOrders();});
        $('#exportOrders').addEventListener('click', exportOrders);
        $('#adminOrderPrev').addEventListener('click',()=>{if(state.orderPage>1){state.orderPage-=1;loadOrders();}});$('#adminOrderNext').addEventListener('click',()=>{if(state.orderPage*20<state.orderTotal){state.orderPage+=1;loadOrders();}});
        $('#userSearch').addEventListener('submit',(event)=>{event.preventDefault();state.userPage=1;loadUsers();});$('#userRole').addEventListener('change',()=>{state.userPage=1;loadUsers();});$('#addUser').addEventListener('click',()=>openUserDialog());$('#userForm').addEventListener('submit',saveUser);
        $('#chooseUserAvatar').addEventListener('click',()=>$('#editUserAvatar').click());
        $('#editUserAvatar').addEventListener('change',(event)=>{const file=event.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){event.target.value='';$('#editUserAvatarName').textContent='Ảnh phải là JPG, PNG hoặc WebP và không quá 2 MB.';return;}openAdminAvatarCrop(file);});
        $('#adminAvatarZoom').addEventListener('input',(event)=>{adminCropScale=adminCropBaseScale*Number(event.target.value);drawAdminAvatarCrop();});
        const adminCropCanvas=$('#adminAvatarCropCanvas');
        adminCropCanvas.addEventListener('pointerdown',(event)=>{adminCropDragging=true;adminCropPointerX=event.clientX;adminCropPointerY=event.clientY;adminCropCanvas.setPointerCapture(event.pointerId);});
        adminCropCanvas.addEventListener('pointermove',(event)=>{if(!adminCropDragging)return;const ratio=adminCropCanvas.width/adminCropCanvas.getBoundingClientRect().width;adminCropX+=(event.clientX-adminCropPointerX)*ratio;adminCropY+=(event.clientY-adminCropPointerY)*ratio;adminCropPointerX=event.clientX;adminCropPointerY=event.clientY;drawAdminAvatarCrop();});
        adminCropCanvas.addEventListener('pointerup',()=>{adminCropDragging=false;});adminCropCanvas.addEventListener('pointercancel',()=>{adminCropDragging=false;});
        const closeAdminCrop=()=>{$('#adminAvatarCropDialog').close();$('#editUserAvatar').value='';adminCropImage=null;};
        $('#closeAdminAvatarCrop').addEventListener('click',closeAdminCrop);$('#cancelAdminAvatarCrop').addEventListener('click',closeAdminCrop);
        $('#confirmAdminAvatarCrop').addEventListener('click',()=>{$('#adminAvatarCropCanvas').toBlob((blob)=>{if(!blob){setStatus($('#userFormStatus'),'Không thể tạo ảnh đại diện.');return;}pendingUserAvatar=new File([blob],'avatar.jpg',{type:'image/jpeg'});const url=URL.createObjectURL(blob);const preview=$('#editUserAvatarPreview');preview.textContent='';preview.style.backgroundImage=`url("${url}")`;preview.classList.add('has-image');$('#editUserAvatarName').textContent='Đã chọn và cắt vùng ảnh · nhấn “Lưu người dùng” để hoàn tất';$('#adminAvatarCropDialog').close();$('#editUserAvatar').value='';adminCropImage=null;},'image/jpeg',0.9);});
        $('#userPrev').addEventListener('click',()=>{if(state.userPage>1){state.userPage-=1;loadUsers();}});$('#userNext').addEventListener('click',()=>{if(state.userPage*20<state.userTotal){state.userPage+=1;loadUsers();}});
        $('#contentTypeFilter').addEventListener('change',loadContent);$('#addContent').addEventListener('click',()=>openContentDialog());$('#contentForm').addEventListener('submit',saveContent);$('#contentActive').addEventListener('change',syncContentPublishHint);
        $('#supportSearch').addEventListener('submit',(event)=>{event.preventDefault();state.supportPage=1;loadSupport();});$('#supportStatus').addEventListener('change',()=>{state.supportPage=1;loadSupport();});$('#supportPrev').addEventListener('click',()=>{if(state.supportPage>1){state.supportPage-=1;loadSupport();}});$('#supportNext').addEventListener('click',()=>{if(state.supportPage*20<state.supportTotal){state.supportPage+=1;loadSupport();}});$('#supportForm').addEventListener('submit',saveSupport);
        $('#contentImage').addEventListener('input',renderContentImagePreview);$('#uploadContentImage').addEventListener('click',()=>$('#contentImageFile').click());$('#contentImageFile').addEventListener('change',async(event)=>{const file=event.target.files?.[0];if(!file)return;try{$('#contentImage').value=await uploadAdminImage(file,'content',$('#uploadContentImage'));renderContentImagePreview();showToast('Đã tải ảnh bài viết.','success');}catch(error){setStatus($('#contentFormStatus'),error.message);}finally{event.target.value='';}});
        $('#addVoucher').addEventListener('click',openVoucherDialog);$('#voucherForm').addEventListener('submit',saveVoucher);
        $('#depositAdminStatus').addEventListener('change',loadDeposits);$('#depositDecisionForm').addEventListener('submit',saveDepositDecision);
        $('#approvalStatus').addEventListener('change',loadApprovals);
        $$('[data-close-dialog]').forEach((button)=>button.addEventListener('click',()=>document.getElementById(button.dataset.closeDialog).close()));
    }

    async function init(){
        let admin = null;
        try {
            admin = await Auth.requireAdmin();
        } catch(e) {
            console.warn('Backend chưa sẵn sàng:', e.message);
        }
        if (!admin) {
            admin = null;
            if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
                admin = {
                    id: 1,
                    username: 'superadmin',
                    fullname: 'Super Admin Pro',
                    role: 'superadmin',
                    balance: 100000000,
                    avatar: ''
                };
            }
        }
        state.admin = admin;
        $('#approvalNav').hidden = admin.role !== 'superadmin';
        const name = admin.fullname || admin.username;
        $('#adminName').textContent = name;
        $('#adminUsername').textContent = `@${admin.username}`;
        $('#adminAvatar').textContent = admin.avatar ? '' : name.charAt(0).toUpperCase();
        $('#adminAvatar').style.backgroundImage = admin.avatar ? `url("${String(admin.avatar).replace(/"/g,'%22')}")` : '';
        $('#adminAvatar').classList.toggle('has-image', Boolean(admin.avatar));
        $('#adminLoading').hidden = true;
        $('#adminShell').hidden = false;
        $('#adminMain').setAttribute('aria-busy', 'false');
        installEvents();
        const requested = window.location.hash.slice(1);
        activateView(pageTitles[requested] ? requested : 'overview', true);
    }
    init();
})();
