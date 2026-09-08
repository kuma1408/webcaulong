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
    function animateMetric(node, target, formatter = (value) => String(Math.round(value))) {
        if (!node) return;
        const finalValue = Number(target) || 0;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            node.textContent = formatter(finalValue);
            return;
        }
        const started = performance.now();
        const duration = 1200;
        const frame = (now) => {
            const progress = Math.min((now - started) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            node.textContent = formatter(finalValue * eased);
            if (progress < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
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

    async function loadDashboard() {
        try {
            const data = await Auth.request('/api/admin/dashboard');
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
            animateMetric($('#healthProducts'), metrics.active_products);
            animateMetric($('#healthUsers'), metrics.active_users);
            animateMetric($('#healthSupport'), metrics.pending_support);
            $('#adminDatabaseSize').textContent = formatBytes(metrics.database_bytes);
            animateMetric($('#adminStringingQueue'), metrics.pending_stringing);
            animateMetric($('#adminActiveVouchers'), metrics.active_vouchers);
            animateMetric($('#adminWishlistItems'), metrics.wishlist_items);
            updateNavBadge($('#navPendingOrders'), metrics.pending_orders);
            updateNavBadge($('#navPendingDeposits'), metrics.pending_deposits);
            updateNavBadge($('#navPendingSupport'), metrics.pending_support);
            renderTrend(data.trend || []);
            renderOrderStatus(data.order_status || []);
            renderCategoryDistribution(data.category_distribution || []);
            renderTopSellingProducts(data.top_products || []);
            renderFunnel(data.funnel || {});
            renderRecentOrders(data.recent_orders || []);
            renderLowStock(data.low_stock_products || []);
            renderActivity(data.activity || []);
            setupAdminChartScrollWatcher();
            if(state.admin?.role==='superadmin'){
                Auth.request('/api/admin/phe-duyet-thay-doi?status=CHO_XEM').then(result=>updateNavBadge($('#navPendingApprovals'),(result.changes||[]).length)).catch(()=>{});
            }
        } catch (error) {
            showToast(error.message, 'error');
            $('#recentOrders').innerHTML = '';
            $('#recentOrders').appendChild(element('p', 'admin-empty', error.message));
        }
    }

    let currentTrendMode = 'revenue';
    let cachedMetricsData = null;
    let cachedTrendData = [];
    let cachedOrderStatusData = [];
    let cachedCategoryData = [];
    let cachedTopProductsData = [];
    let cachedFunnelData = null;
    let trendTogglesBound = false;
    let chartScrollObserver = null;
    let lastChartAnimateTime = 0;

    function bindTrendTogglesOnce() {
        if (trendTogglesBound) return;
        const btnRev = $('#btnTrendRevenue');
        const btnOrd = $('#btnTrendOrders');
        if (btnRev && btnOrd) {
            btnRev.addEventListener('click', () => {
                if (currentTrendMode === 'revenue') return;
                currentTrendMode = 'revenue';
                btnRev.classList.add('is-active');
                btnOrd.classList.remove('is-active');
                renderTrend(cachedTrendData, 'revenue');
            });
            btnOrd.addEventListener('click', () => {
                if (currentTrendMode === 'orders') return;
                currentTrendMode = 'orders';
                btnOrd.classList.add('is-active');
                btnRev.classList.remove('is-active');
                renderTrend(cachedTrendData, 'orders');
            });
            trendTogglesBound = true;
        }
    }

    function setupAdminChartScrollWatcher() {
        if (chartScrollObserver) return;
        const targets = [
            $('.admin-metrics'),
            $('.admin-chart-card'),
            $('.admin-status-card'),
            $('.admin-category-card'),
            $('.admin-top-products-card'),
            $('.admin-funnel')
        ].filter(Boolean);

        if (!targets.length) return;

        chartScrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const now = Date.now();
                const lastTime = Number(entry.target.dataset.lastAnimated || 0);
                if (entry.isIntersecting) {
                    if (entry.target.dataset.chartExited === 'true' && (now - lastTime > 400)) {
                        entry.target.dataset.lastAnimated = String(now);
                        entry.target.dataset.chartExited = 'false';
                        if (entry.target.classList.contains('admin-metrics')) {
                            replayMetricsAnimation();
                        } else if (entry.target.classList.contains('admin-chart-card')) {
                            replaySplineAnimation(entry.target);
                        } else if (entry.target.classList.contains('admin-status-card')) {
                            replayDonutAnimation(entry.target);
                        } else if (entry.target.classList.contains('admin-category-card')) {
                            replayCategoryAnimation(entry.target);
                        } else if (entry.target.classList.contains('admin-top-products-card')) {
                            replayTopProductsAnimation(entry.target);
                        } else if (entry.target.classList.contains('admin-funnel')) {
                            replayFunnelAnimation(entry.target);
                        }
                    }
                } else {
                    entry.target.dataset.chartExited = 'true';
                }
            });
        }, { threshold: 0.12 });

        targets.forEach(t => {
            t.dataset.chartExited = 'false';
            chartScrollObserver.observe(t);
        });
    }

    function replayAllDashboardAnimations() {
        replayMetricsAnimation();
        const splineCard = $('.admin-chart-card');
        if (splineCard) replaySplineAnimation(splineCard);
        const statusCard = $('.admin-status-card');
        if (statusCard) replayDonutAnimation(statusCard);
        const catCard = $('.admin-category-card');
        if (catCard) replayCategoryAnimation(catCard);
        const topCard = $('.admin-top-products-card');
        if (topCard) replayTopProductsAnimation(topCard);
        const funnelCard = $('.admin-funnel');
        if (funnelCard) replayFunnelAnimation(funnelCard);
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
    }

    function replaySplineAnimation(card) {
        const line = card.querySelector('.admin-spline-line');
        const area = card.querySelector('.admin-spline-area');
        const dots = card.querySelectorAll('.admin-svg-dot');
        const totalDisplay = $('#adminRevenue');
        if (line) {
            line.style.animation = 'none';
            line.style.strokeDashoffset = '2200';
            void line.offsetWidth;
            line.style.animation = 'splineLineDraw 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        }
        if (area) {
            area.style.animation = 'none';
            area.style.opacity = '0';
            void area.offsetWidth;
            area.style.animation = 'splineAreaEnter 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        }
        dots.forEach((d, idx) => {
            d.style.animation = 'none';
            d.style.opacity = '0';
            void d.offsetWidth;
            d.style.animation = `adminMetricEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${0.08 + idx * 0.03}s forwards`;
        });
        if (totalDisplay && cachedTrendData.length) {
            const isRev = currentTrendMode === 'revenue';
            const totalVal = cachedTrendData.reduce((sum, item) => sum + (isRev ? (Number(item.revenue) || 0) : (Number(item.orders) || 0)), 0);
            animateMetric(totalDisplay, totalVal, isRev ? formatMoney : (v => String(Math.round(v)) + ' đơn'));
        }
    }

    function replayDonutAnimation(card) {
        const segs = card.querySelectorAll('.admin-donut-seg');
        const center = card.querySelector('#adminStatusTotal');
        segs.forEach((seg, idx) => {
            seg.style.animation = 'none';
            void seg.offsetWidth;
            seg.style.animation = `donutSegDraw 1.1s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.08}s both`;
        });
        if (center && cachedOrderStatusData.length) {
            const total = cachedOrderStatusData.reduce((sum, item) => sum + (Number(item.SoLuong) || 0), 0);
            animateMetric(center, total);
        }
    }

    function replayCategoryAnimation(card) {
        const segs = card.querySelectorAll('.admin-donut-seg');
        const center = card.querySelector('#adminCategoryTotal');
        segs.forEach((seg, idx) => {
            seg.style.animation = 'none';
            void seg.offsetWidth;
            seg.style.animation = `donutSegDraw 1.1s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.08}s both`;
        });
        if (center && cachedCategoryData.length) {
            const total = cachedCategoryData.reduce((sum, item) => sum + (Number(item.TongSP) || 0), 0);
            animateMetric(center, total);
        }
    }

    function replayTopProductsAnimation(card) {
        const fills = card.querySelectorAll('.top-product-bar-fill');
        fills.forEach(f => {
            const targetW = f.dataset.width || '0%';
            f.style.width = '0%';
            f.style.transition = 'none';
            void f.offsetWidth;
            f.style.transition = 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)';
            f.style.width = targetW;
        });
    }

    function replayFunnelAnimation(card) {
        if (!cachedFunnelData) return;
        renderFunnel(cachedFunnelData);
    }

    function formatShortMoney(value) {
        const num = Number(value) || 0;
        if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Tỷ';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + ' Tr';
        if (num >= 1000) return (num / 1000).toFixed(0) + ' k';
        return String(num) + ' đ';
    }

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

        const isRev = currentMode === 'revenue';
        const totalVal = dataItems.reduce((sum, item) => sum + (isRev ? (Number(item.revenue) || 0) : (Number(item.orders) || 0)), 0);
        const metricLabel = $('#adminTrendMetricLabel');
        if (metricLabel) metricLabel.textContent = isRev ? 'Tổng doanh thu 14 ngày' : 'Tổng số đơn 14 ngày';
        const totalDisplay = $('#adminRevenue');
        if (totalDisplay) {
            animateMetric(totalDisplay, totalVal, isRev ? formatMoney : (v => String(Math.round(v)) + ' đơn'));
        }

        // Tinh gia tri max lam tran phu hop
        const rawValues = dataItems.map(item => isRev ? (Number(item.revenue) || 0) : (Number(item.orders) || 0));
        const maxRaw = Math.max(1, ...rawValues);
        let niceMax = maxRaw;
        if (isRev) {
            const step = Math.pow(10, Math.floor(Math.log10(maxRaw)));
            niceMax = Math.ceil((maxRaw * 1.15) / (step / 2)) * (step / 2);
            if (niceMax < 500000) niceMax = 500000;
        } else {
            niceMax = Math.max(4, Math.ceil(maxRaw * 1.25));
        }

        // Thong so SVG Spline
        const svgW = 760;
        const svgH = 220;
        const padLeft = 60;
        const padRight = 24;
        const padTop = 26;
        const padBottom = 38;
        const plotW = svgW - padLeft - padRight;
        const plotH = svgH - padTop - padBottom;

        const points = dataItems.map((item, index) => {
            const val = isRev ? (Number(item.revenue) || 0) : (Number(item.orders) || 0);
            const x = dataItems.length > 1 ? padLeft + (index / (dataItems.length - 1)) * plotW : padLeft + plotW / 2;
            const y = padTop + (1 - (val / niceMax)) * plotH;
            return {
                x,
                y,
                val,
                revenue: Number(item.revenue) || 0,
                orders: Number(item.orders) || 0,
                date: item.date
            };
        });

        // Duong cong Bezier mươt ma
        let lineD = '';
        if (points.length === 1) {
            lineD = `M ${points[0].x - 30} ${points[0].y} L ${points[0].x + 30} ${points[0].y}`;
        } else {
            lineD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i === 0 ? 0 : i - 1];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[i + 2] || p2;
                const cp1x = p1.x + (p2.x - p0.x) / 5.2;
                const cp1y = p1.y + (p2.y - p0.y) / 5.2;
                const cp2x = p2.x - (p3.x - p1.x) / 5.2;
                const cp2y = p2.y - (p3.y - p1.y) / 5.2;
                lineD += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
            }
        }

        const lastX = points[points.length - 1].x;
        const firstX = points[0].x;
        const baseY = (padTop + plotH).toFixed(1);
        const areaD = `${lineD} L ${lastX.toFixed(1)} ${baseY} L ${firstX.toFixed(1)} ${baseY} Z`;

        // 4 luoi ngang voi nhan truc Y
        const gridSteps = [0, 0.333, 0.666, 1];
        const gridLines = gridSteps.map(step => {
            const yVal = padTop + (1 - step) * plotH;
            const labelVal = step * niceMax;
            const text = isRev ? formatShortMoney(labelVal) : String(Math.round(labelVal));
            return `
                <g class="admin-grid-tier">
                    <line class="admin-grid-line" x1="${padLeft}" y1="${yVal.toFixed(1)}" x2="${svgW - padRight}" y2="${yVal.toFixed(1)}" />
                    <text class="admin-grid-label" x="${padLeft - 10}" y="${(yVal + 4).toFixed(1)}" text-anchor="end">${text}</text>
                </g>
            `;
        }).join('');

        // Nhan ngay truc X
        const dateLabels = points.map((p) => {
            const d = new Date(`${p.date}T00:00:00`);
            const label = `${d.getDate()}/${d.getMonth() + 1}`;
            return `<text class="admin-axis-date" x="${p.x.toFixed(1)}" y="${svgH - 12}" text-anchor="middle">${label}</text>`;
        }).join('');

        // Diem tron phan xa
        const dotsMarkup = points.map((p, i) => `
            <g class="admin-svg-dot-group" data-idx="${i}">
                <circle class="admin-svg-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" />
            </g>
        `).join('');

        // Mau gradient cong nghe
        const gradTheme = isRev
            ? {
                stroke1: '#ff7a1a',
                stroke2: '#e9381b',
                fill1: 'rgba(255, 122, 26, 0.38)',
                fill2: 'rgba(233, 56, 27, 0.03)',
                dotGlow: 'rgba(233, 56, 27, 0.6)',
                activeColor: '#ff7a1a'
            }
            : {
                stroke1: '#38bdf8',
                stroke2: '#2563eb',
                fill1: 'rgba(56, 189, 248, 0.38)',
                fill2: 'rgba(37, 99, 235, 0.03)',
                dotGlow: 'rgba(37, 99, 235, 0.6)',
                activeColor: '#38bdf8'
            };

        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'admin-spline-wrapper';
        chartWrapper.innerHTML = `
            <svg class="admin-spline-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${gradTheme.fill1}" />
                        <stop offset="85%" stop-color="${gradTheme.fill2}" />
                        <stop offset="100%" stop-color="transparent" />
                    </linearGradient>
                    <linearGradient id="trendLineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="${gradTheme.stroke1}" />
                        <stop offset="100%" stop-color="${gradTheme.stroke2}" />
                    </linearGradient>
                    <filter id="neonSplineGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="${gradTheme.dotGlow}" flood-opacity="0.55" />
                    </filter>
                </defs>
                <g class="admin-chart-grid">${gridLines}</g>
                <path class="admin-spline-area" d="${areaD}" fill="url(#trendAreaGrad)" />
                <path class="admin-spline-line" d="${lineD}" stroke="url(#trendLineGrad)" filter="url(#neonSplineGlow)" />
                <line class="admin-svg-cursor-line" id="adminTrendCursorLine" x1="0" y1="${padTop}" x2="0" y2="${baseY}" style="display:none;" />
                <circle class="admin-svg-active-dot" id="adminTrendActiveDot" cx="0" cy="0" r="7" style="display:none;" fill="#ffffff" stroke="${gradTheme.activeColor}" stroke-width="3.5" />
                <g class="admin-svg-dots">${dotsMarkup}</g>
                <g class="admin-chart-axis-x">${dateLabels}</g>
            </svg>
            <div class="admin-chart-tooltip" id="adminChartTooltip" style="opacity:0;pointer-events:none;"></div>
            <div class="admin-chart-interactive-cols" id="adminChartInteractiveCols"></div>
        `;
        chart.appendChild(chartWrapper);

        // Vung tuong tac hover mươt ma
        const colsContainer = chartWrapper.querySelector('#adminChartInteractiveCols');
        const tooltip = chartWrapper.querySelector('#adminChartTooltip');
        const cursorLine = chartWrapper.querySelector('#adminTrendCursorLine');
        const activeDot = chartWrapper.querySelector('#adminTrendActiveDot');

        points.forEach((p, idx) => {
            const col = document.createElement('div');
            col.className = 'admin-chart-col-zone';
            const widthPct = 100 / points.length;
            col.style.width = `${widthPct}%`;

            col.addEventListener('mouseenter', () => {
                cursorLine.style.display = 'block';
                cursorLine.setAttribute('x1', p.x.toFixed(1));
                cursorLine.setAttribute('x2', p.x.toFixed(1));
                activeDot.style.display = 'block';
                activeDot.setAttribute('cx', p.x.toFixed(1));
                activeDot.setAttribute('cy', p.y.toFixed(1));

                chartWrapper.querySelectorAll('.admin-svg-dot').forEach((d, i) => {
                    d.classList.toggle('is-highlighted', i === idx);
                });

                const d = new Date(`${p.date}T00:00:00`);
                const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                const dayName = daysOfWeek[d.getDay()] || '';
                const dateStr = `${dayName}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                const aov = p.orders > 0 ? Math.round(p.revenue / p.orders) : 0;

                tooltip.innerHTML = `
                    <div class="chart-tip-header">${dateStr}</div>
                    <div class="chart-tip-row">
                        <span class="tip-dot tip-dot--orange"></span>
                        <span class="tip-label">Doanh thu:</span>
                        <strong class="tip-val tip-val--rev">${formatMoney(p.revenue)}</strong>
                    </div>
                    <div class="chart-tip-row">
                        <span class="tip-dot tip-dot--blue"></span>
                        <span class="tip-label">Đơn hàng:</span>
                        <strong class="tip-val">${p.orders} đơn</strong>
                    </div>
                    ${p.orders > 0 ? `
                    <div class="chart-tip-row chart-tip-row--sub">
                        <span class="tip-label">AOV trung bình:</span>
                        <span class="tip-val">${formatMoney(aov)}</span>
                    </div>` : ''}
                `;

                const wrapperRect = chartWrapper.getBoundingClientRect();
                const tipX = (p.x / svgW) * wrapperRect.width;
                const tipY = (p.y / svgH) * wrapperRect.height;

                tooltip.style.opacity = '1';
                tooltip.style.left = `${Math.max(105, Math.min(wrapperRect.width - 105, tipX))}px`;
                tooltip.style.top = `${Math.max(16, tipY - 14)}px`;
            });

            col.addEventListener('mouseleave', () => {
                cursorLine.style.display = 'none';
                activeDot.style.display = 'none';
                chartWrapper.querySelectorAll('.admin-svg-dot').forEach(d => d.classList.remove('is-highlighted'));
                tooltip.style.opacity = '0';
            });

            colsContainer.appendChild(col);
        });
    }

    function renderOrderStatus(items) {
        if (Array.isArray(items)) cachedOrderStatusData = items;
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

        const normalized = items
            .map((item) => ({
                status: item.TrangThai,
                count: Number(item.SoLuong) || 0,
                title: statusTitles[item.TrangThai] || statusMeta[item.TrangThai]?.[0] || item.TrangThai
            }))
            .filter((item) => item.count > 0);

        const total = normalized.reduce((sum, item) => sum + item.count, 0);

        const donut = $('#adminStatusDonut');
        if (!donut) return;
        donut.innerHTML = '';

        const R = 52;
        const C = 2 * Math.PI * R; // ~326.73
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
                <defs>
                    <filter id="donutGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="currentColor" flood-opacity="0.35" />
                    </filter>
                </defs>
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

        const legend = $('#adminStatusLegend');
        if (!legend) return;
        legend.innerHTML = '';

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
            donut.querySelectorAll('.admin-donut-seg').forEach(seg => {
                seg.classList.remove('is-focus', 'is-dimmed');
            });
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
                    <div class="legend-fill" style="width:${pct}%; background:${color};"></div>
                </div>
            `;

            card.addEventListener('mouseenter', () => {
                card.classList.add('is-active');
                setDonutFocus(item);
            });
            card.addEventListener('mouseleave', () => {
                card.classList.remove('is-active');
                resetDonutFocus();
            });

            legend.appendChild(card);
        });

        if (!normalized.length) {
            legend.appendChild(element('p', 'admin-empty', 'Chưa có đơn hàng phát sinh.'));
        }
    }

    function renderCategoryDistribution(items) {
        if (Array.isArray(items)) cachedCategoryData = items;
        const catList = cachedCategoryData || [];
        const donut = $('#adminCategoryDonut');
        const legend = $('#adminCategoryLegend');
        if (!donut || !legend) return;

        donut.innerHTML = '';
        legend.innerHTML = '';

        if (!catList.length) {
            donut.innerHTML = '<span id="adminCategoryTotal">0</span><small>sản phẩm</small>';
            legend.appendChild(element('p', 'admin-empty', 'Chưa có dữ liệu danh mục.'));
            return;
        }

        const categoryPalette = {
            'Vợt Cầu Lông': '#ff7a1a',
            'Giày Cầu Lông': '#38bdf8',
            'Áo Cầu Lông': '#f43f5e',
            'Váy Cầu Lông': '#ec4899',
            'Quần Cầu Lông': '#a855f7',
            'Túi Vợt': '#10b981',
            'Balo': '#eab308',
            'Phụ Kiện': '#06b6d4'
        };

        const totalItems = catList.reduce((sum, c) => sum + (Number(c.TongSP) || 0), 0);

        const R = 52;
        const C = 2 * Math.PI * R;
        let accumulated = 0;
        const gapPx = catList.length > 1 ? 4 : 0;

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
                    data-sold="${item.DaBan || 0}"
                    data-revenue="${item.DoanhThu || 0}"
                    data-pct="${Math.round(fraction * 100)}"
                    style="--seg-color:${color}; animation-delay: ${idx * 0.08}s;"
                ></circle>
            `;
        });

        const svgHtml = `
            <svg class="admin-donut-svg" viewBox="0 0 144 144">
                <defs>
                    <filter id="catDonutGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="currentColor" flood-opacity="0.35" />
                    </filter>
                </defs>
                <circle class="admin-donut-cyber-ring" cx="72" cy="72" r="66"></circle>
                <circle class="admin-donut-bg" cx="72" cy="72" r="${R}"></circle>
                ${svgSegments.join('')}
            </svg>
        `;

        const centerKpi = document.createElement('div');
        centerKpi.className = 'admin-donut-center';
        centerKpi.innerHTML = `<span id="adminCategoryTotal">${totalItems}</span><small id="adminCategoryLabel">Tổng mẫu</small>`;

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
            donut.querySelectorAll('.admin-donut-seg').forEach(seg => {
                seg.classList.remove('is-focus', 'is-dimmed');
            });
            const totalSpan = centerKpi.querySelector('#adminCategoryTotal');
            const labelSmall = centerKpi.querySelector('#adminCategoryLabel');
            if (totalSpan && labelSmall) {
                totalSpan.textContent = String(totalItems);
                labelSmall.textContent = 'Tổng mẫu';
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
            const rev = Number(item.DoanhThu) || 0;
            const sold = Number(item.DaBan) || 0;

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
                    <div class="legend-fill" style="width:${pct}%; background:${color};"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:10px; color:var(--bs-muted);">
                    <span>Đã bán: <b style="color:var(--bs-ink)">${sold}</b></span>
                    <span>Doanh thu: <b style="color:var(--bs-red)">${formatShortMoney(rev)}</b></span>
                </div>
            `;

            card.addEventListener('mouseenter', () => {
                card.classList.add('is-active');
                setCatFocus(item);
            });
            card.addEventListener('mouseleave', () => {
                card.classList.remove('is-active');
                resetCatFocus();
            });

            legend.appendChild(card);
        });
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

        const maxSold = Math.max(1, ...products.map(p => Number(p.DaBan) || 0));

        products.forEach((prod, index) => {
            const rank = index + 1;
            const rankClass = rank === 1 ? 'top-product-rank--1' : rank === 2 ? 'top-product-rank--2' : rank === 3 ? 'top-product-rank--3' : 'top-product-rank--other';
            const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const sold = Number(prod.DaBan) || 0;
            const rev = Number(prod.DoanhThu) || 0;
            const pct = Math.max(10, Math.round((sold / maxSold) * 100));

            let imgSrc = String(prod.HinhAnh || '').trim();
            if (imgSrc && !/^(?:https?:)?\/\//i.test(imgSrc) && window.API_BASE) {
                imgSrc = `${window.API_BASE.replace(/\/$/, '')}/${imgSrc.replace(/^\//, '')}`;
            }

            const row = document.createElement('div');
            row.className = 'admin-top-product-row';
            row.innerHTML = `
                <div class="top-product-rank ${rankClass}">${rankLabel}</div>
                <img class="top-product-thumb" src="${imgSrc || 'favicon.svg'}" alt="${prod.TenSP || 'Sản phẩm'}" onerror="this.src='favicon.svg'">
                <div class="top-product-info">
                    <span class="top-product-title" title="${prod.TenSP}">${prod.TenSP}</span>
                    <div class="top-product-bar-wrap">
                        <div class="top-product-bar-fill" data-width="${pct}%" style="width: 0%;"></div>
                    </div>
                </div>
                <div class="top-product-stats">
                    <span class="top-product-qty">${sold} đã bán</span>
                    <span class="top-product-rev">${formatShortMoney(rev)}</span>
                </div>
            `;

            container.appendChild(row);
        });

        // Trigger smooth progress bar fill
        requestAnimationFrame(() => {
            setTimeout(() => {
                container.querySelectorAll('.top-product-bar-fill').forEach(fill => {
                    fill.style.width = fill.dataset.width;
                });
            }, 60);
        });
    }

    function renderFunnel(funnel) {
        const users = Number(funnel.registered_users) || 0;
        const carts = Number(funnel.users_with_cart) || 0;
        const buyers = Number(funnel.buyers_30d) || 0;
        const completed = Number(funnel.completed_orders_30d) || 0;
        const base = Math.max(1, users);
        [['#funnelUsers', users], ['#funnelCarts', carts], ['#funnelBuyers', buyers], ['#funnelCompleted30', completed]]
            .forEach(([selector, value]) => animateMetric($(selector), value));

        const cartRate = Math.min(100, Math.round(carts / base * 100));
        const buyerRate = carts ? Math.min(100, Math.round(buyers / carts * 100)) : 0;
        const completedRate = buyers ? Math.min(100, Math.round(completed / buyers * 100)) : 0;

        $('#funnelCartBar').style.setProperty('--funnel-width', `${Math.min(100, carts / base * 100)}%`);
        $('#funnelBuyerBar').style.setProperty('--funnel-width', `${Math.min(100, buyers / base * 100)}%`);
        $('#funnelCompleted30Bar').style.setProperty('--funnel-width', `${Math.min(100, completed / base * 100)}%`);

        // Gắn tỷ lệ chuyển đổi cho từng bước phễu
        const steps = document.querySelectorAll('.admin-funnel__steps > div');
        if (steps.length >= 4) {
            const rates = ['100% người dùng', `${cartRate}% đã thêm giỏ`, `${buyerRate}% tiến hành đặt`, `${completedRate}% giao thành công`];
            steps.forEach((step, i) => {
                let badge = step.querySelector('.admin-funnel__step-rate');
                if (!badge) {
                    badge = element('span', 'admin-funnel__step-rate');
                    step.insertBefore(badge, step.querySelector('i'));
                }
                badge.textContent = rates[i] || '';
            });
        }
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
        const data = await Auth.request('/api/danhmuc', { auth: false });
        state.categories = data.categories || [];
        const select = $('#productCategory');
        state.categories.forEach((category) => {
            const option = element('option', '', category.TenDM);
            option.value = category.MaDM;
            select.appendChild(option);
        });
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
        } catch (error) { emptyRow(tbody, 6, error.message); }
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
        } catch (error) { emptyRow(tbody, 7, error.message); }
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
        catch(error){emptyRow(tbody,6,error.message);}
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
        catch(error){emptyRow(tbody,6,error.message);}
    }

    function renderDeposits(){
        const tbody=$('#depositAdminRows');tbody.innerHTML='';if(!state.deposits.length)emptyRow(tbody,6,'Không có yêu cầu phù hợp.');
        state.deposits.forEach((item)=>{const row=element('tr');row.append(element('td','',item.MaThamChieu));const userCell=element('td');const user=element('div','admin-user-cell');const avatar=element('i','',(item.HoTen||item.TenDangNhap||'U').charAt(0).toUpperCase());const copy=element('div');copy.append(element('strong','',item.HoTen||item.TenDangNhap),element('span','',`@${item.TenDangNhap}`));user.append(avatar,copy);userCell.appendChild(user);row.append(userCell,element('td','',formatDate(item.NgayTao)),element('td','',formatMoney(item.SoTien)));const statusCell=element('td');statusCell.appendChild(badge(item.TrangThai));row.appendChild(statusCell);const actionCell=element('td');const actions=element('div','admin-row-actions');if(item.TrangThai==='CHO_DUYET'){const approve=element('button','','Duyệt');approve.type='button';approve.addEventListener('click',()=>openDepositDialog(item,'DA_DUYET'));const reject=element('button','danger','Từ chối');reject.type='button';reject.addEventListener('click',()=>openDepositDialog(item,'TU_CHOI'));actions.append(approve,reject);}else actions.appendChild(element('span','',formatDate(item.NgayXuLy)));actionCell.appendChild(actions);row.appendChild(actionCell);tbody.appendChild(row);});
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
        catch(error){emptyRow(tbody,6,error.message);}
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
    function renderAudit(items){const tbody=$('#auditRows');tbody.innerHTML='';if(!items.length)emptyRow(tbody,6,'Chưa có hoạt động quản trị.');items.forEach((log)=>{const row=element('tr');const detail=parsedObject(log.ChiTiet);const hasComparison=Boolean(log.DuLieuTruoc);const after=log.DuLieuSau||detail;const changed=hasComparison?[...new Set([...Object.keys(parsedObject(log.DuLieuTruoc)),...Object.keys(parsedObject(after))])].filter(key=>JSON.stringify(parsedObject(log.DuLieuTruoc)[key])!==JSON.stringify(parsedObject(after)[key])):Object.keys(detail);const detailCell=element('td');const summary=element('span','admin-detail-summary',changed.map(key=>fieldLabels[key]||key).join(', ')||'Không có dữ liệu');const view=element('button','admin-detail-button',hasComparison?'Xem trước và sau':'Xem đầy đủ');view.type='button';view.addEventListener('click',()=>openChangeDetail({title:`${actionLabels[log.HanhDong]||log.HanhDong} ${entityLabels[log.DoiTuong]||log.DoiTuong}`,eyebrow:'Chi tiết nhật ký quản trị',meta:[`@${log.TenDangNhap}`,formatDate(log.NgayTao),`${entityLabels[log.DoiTuong]||log.DoiTuong}${log.MaDoiTuong?` #${log.MaDoiTuong}`:''}`,`IP: ${log.DiaChiIP||'—'}`,log.TrangThaiPheDuyet?badgeText(log.TrangThaiPheDuyet):''],before:log.DuLieuTruoc,after,compare:hasComparison,entity:log.DoiTuong,entityId:log.MaDoiTuong,snapshot:{TenDangNhap:log.DoiTuongTenDangNhap,HoTen:log.DoiTuongHoTen,Email:log.DoiTuongEmail,SoDienThoai:log.DoiTuongSoDienThoai,Avatar:log.DoiTuongAvatar}}));detailCell.append(summary,view);const adminCell=element('td');const adminWrap=element('div','admin-user-cell');const adminAvatar=userAvatar({TenDangNhap:log.TenDangNhap,HoTen:log.HoTenAdmin,Avatar:log.AvatarAdmin});const adminCopy=element('div');adminCopy.append(element('strong','',log.HoTenAdmin||log.TenDangNhap),element('span','',`@${log.TenDangNhap}`));adminWrap.append(adminAvatar,adminCopy);adminCell.appendChild(adminWrap);row.append(element('td','',formatDate(log.NgayTao)),adminCell,element('td','',actionLabels[log.HanhDong]||log.HanhDong),element('td','',`${entityLabels[log.DoiTuong]||log.DoiTuong}${log.MaDoiTuong?` #${log.MaDoiTuong}`:''}`),detailCell,element('td','',log.DiaChiIP||'—'));tbody.appendChild(row);});}

    async function loadApprovals(){
        const tbody=$('#approvalRows');emptyRow(tbody,6,'Đang tải thay đổi…');
        try{const data=await Auth.request(`/api/admin/phe-duyet-thay-doi?status=${encodeURIComponent($('#approvalStatus').value)}`);renderApprovals(data.changes||[]);if($('#approvalStatus').value==='CHO_XEM')updateNavBadge($('#navPendingApprovals'),(data.changes||[]).length);}
        catch(error){emptyRow(tbody,6,error.message);}
    }
    function changeSummary(item){const after=item.DuLieuSau||{};if(item.DoiTuong==='YeuCauNapTien')return `${item.HanhDong==='APPROVE'?'Duyệt':'Từ chối'} yêu cầu nạp ${formatMoney(after.SoTien||after.amount||0)}`;if(item.DoiTuong==='SanPham'){if(item.HanhDong==='DELETE')return 'Ngừng bán và đưa tồn kho về 0';const keys=Object.keys(after).filter(key=>!['NgayCapNhat','NgayTao'].includes(key));return `Cập nhật: ${keys.slice(0,4).join(', ')}${keys.length>4?'…':''}`;}return auditDetail(after);}
    function renderApprovals(items){const tbody=$('#approvalRows');tbody.innerHTML='';if(!items.length){emptyRow(tbody,6,'Không có thay đổi phù hợp.');return;}items.forEach(item=>{const row=element('tr');row.append(element('td','',formatDate(item.NgayTao)),element('td','',`@${item.TenDangNhap}`),element('td','',actionLabels[item.HanhDong]||item.HanhDong),element('td','',`${entityLabels[item.DoiTuong]||item.DoiTuong}${item.MaDoiTuong?` #${item.MaDoiTuong}`:''}`));const detail=element('td');detail.appendChild(element('span','admin-detail-summary',changeSummary(item)));const view=element('button','admin-detail-button','Xem thay đổi trước và sau');view.type='button';view.addEventListener('click',()=>openChangeDetail({title:`${actionLabels[item.HanhDong]||item.HanhDong} ${entityLabels[item.DoiTuong]||item.DoiTuong}`,eyebrow:'Đối chiếu thay đổi của Admin',meta:[`@${item.TenDangNhap}`,formatDate(item.NgayTao),`Mã thay đổi #${item.MaThayDoi}`,badgeText(item.TrangThai)],before:item.DuLieuTruoc,after:item.DuLieuSau,compare:Boolean(item.DuLieuTruoc),entity:item.DoiTuong,entityId:item.MaDoiTuong}));detail.appendChild(view);row.appendChild(detail);const action=element('td');const actions=element('div','admin-row-actions');if(item.TrangThai==='CHO_XEM'){const accept=element('button','','Xác nhận');accept.type='button';accept.addEventListener('click',()=>reviewChange(item.MaThayDoi,'XAC_NHAN'));actions.appendChild(accept);if(item.CoTheHoanTac){const undo=element('button','danger','Hoàn tác');undo.type='button';undo.addEventListener('click',()=>reviewChange(item.MaThayDoi,'HOAN_TAC'));actions.appendChild(undo);}}else actions.appendChild(badge(item.TrangThai));action.appendChild(actions);row.appendChild(action);tbody.appendChild(row);});}
    function badgeText(status){return statusMeta[status]?.[0]||status||'Không rõ';}
    async function reviewChange(id,decision){const promptText=decision==='HOAN_TAC'?'Nhập lý do hoàn tác (không bắt buộc):':'Ghi chú xác nhận (không bắt buộc):';const note=window.prompt(promptText,'');if(note===null)return;try{const data=await Auth.request(`/api/admin/phe-duyet-thay-doi/${id}`,{method:'PATCH',json:{decision,note}});showToast(data.message,'success');loadApprovals();if(decision==='HOAN_TAC'){state.loaded.delete('products');state.loaded.delete('deposits');loadDashboard();}}catch(error){showToast(error.message,'error');}}

    async function loadSupport(){const tbody=$('#supportRows');emptyRow(tbody,7,'Đang tải yêu cầu hỗ trợ…');const params=new URLSearchParams({page:state.supportPage,limit:20,status:$('#supportStatus').value,q:$('#supportQuery').value.trim()});try{const data=await Auth.request(`/api/admin/ho-tro?${params}`);state.support=data.requests||[];state.supportTotal=Number(data.total)||0;renderSupport();}catch(error){emptyRow(tbody,7,error.message);}}
    function supportSubject(value){return {TU_VAN_SAN_PHAM:'Tư vấn sản phẩm',DON_HANG:'Đơn hàng',THANH_TOAN:'Thanh toán',TAI_KHOAN:'Tài khoản',BAO_LOI:'Báo lỗi',KHAC:'Khác'}[value]||value||'—';}
    function renderSupport(){const tbody=$('#supportRows');tbody.innerHTML='';if(!state.support.length)emptyRow(tbody,7,'Không có yêu cầu phù hợp.');state.support.forEach(item=>{const row=element('tr');row.append(element('td','',`HT-${String(item.MaYeuCau).padStart(6,'0')}`));const sender=element('td');sender.append(element('strong','',item.HoTen),element('span','admin-detail-summary',`${item.Email}${item.SoDienThoai?` · ${item.SoDienThoai}`:''}`));row.append(sender,element('td','',supportSubject(item.ChuDe)),element('td','admin-support-preview',item.NoiDung),element('td','',formatDate(item.NgayTao)));const status=element('td');status.appendChild(badge(item.TrangThai));row.appendChild(status);const action=element('td');const button=element('button','admin-detail-button','Mở phiếu');button.type='button';button.addEventListener('click',()=>openSupport(item));action.appendChild(button);row.appendChild(action);tbody.appendChild(row);});const pages=Math.max(1,Math.ceil(state.supportTotal/20));$('#supportPageInfo').textContent=`Trang ${state.supportPage}/${pages}`;$('#supportPrev').disabled=state.supportPage<=1;$('#supportNext').disabled=state.supportPage>=pages;const pending=state.support.filter(item=>item.TrangThai==='MOI').length;updateNavBadge($('#navPendingSupport'),pending);}
    function openSupport(item){$('#supportId').value=item.MaYeuCau;$('#supportDialogStatus').value=item.TrangThai;$('#supportAdminNote').value=item.GhiChuAdmin||'';$('#supportDialogTitle').textContent=`Phiếu HT-${String(item.MaYeuCau).padStart(6,'0')}`;const detail=$('#supportDetail');detail.innerHTML='';[['Người gửi',item.HoTen],['Liên hệ',`${item.Email}${item.SoDienThoai?` · ${item.SoDienThoai}`:''}`],['Chủ đề',supportSubject(item.ChuDe)],['Mã đơn',item.MaDonHang||'Không có'],['Kênh phản hồi',item.KenhPhanHoi==='DIEN_THOAI'?'Điện thoại':'Email'],['Nội dung',item.NoiDung],['Tiếp nhận lúc',formatDate(item.NgayTao)]].forEach(([label,value])=>{const fact=element('div');fact.append(element('span','',label),element('strong','',value));detail.appendChild(fact);});setStatus($('#supportFormStatus'));$('#supportDialog').showModal();}
    async function saveSupport(event){event.preventDefault();const id=Number($('#supportId').value);const button=$('#supportSave');setBusy(button,true,'Đang lưu…');try{const data=await Auth.request(`/api/admin/ho-tro/${id}`,{method:'PATCH',json:{status:$('#supportDialogStatus').value,note:$('#supportAdminNote').value.trim()}});$('#supportDialog').close();showToast(data.message,'success');loadSupport();}catch(error){setStatus($('#supportFormStatus'),error.message);}finally{setBusy(button,false);}}

    async function loadContent(){const tbody=$('#contentRows');emptyRow(tbody,5,'Đang tải nội dung…');try{const data=await Auth.request(`/api/admin/noi-dung?loai=${encodeURIComponent($('#contentTypeFilter').value)}`);state.content=data.items||[];renderContent();}catch(error){emptyRow(tbody,5,error.message);}}
    function renderContent(){const tbody=$('#contentRows');tbody.innerHTML='';if(!state.content.length)emptyRow(tbody,5,'Chưa có nội dung. Hãy tạo bài đầu tiên và chọn “Xuất bản ngay”.');state.content.forEach((item)=>{const row=element('tr');const titleCell=element('td');titleCell.append(element('strong','admin-content-title',item.TieuDe),element('span','admin-content-summary',item.TomTat||'Chưa có tóm tắt'));row.append(titleCell,element('td','',item.Loai==='TIN_TUC'?'Tin tức':'Hướng dẫn'),element('td','',formatDate(item.NgayDang)));const status=element('td');status.appendChild(element('span',`admin-badge ${item.TrangThai?'admin-badge--success':'admin-badge--info'}`,item.TrangThai?'Công khai':'Bản nháp'));row.appendChild(status);const action=element('td');const actions=element('div','admin-row-actions');if(item.TrangThai){const preview=element('a','','Xem trên web');preview.href=`baiviet.html?id=${encodeURIComponent(item.MaBV)}`;preview.target='_blank';preview.rel='noopener';actions.appendChild(preview);}const edit=element('button','','Sửa');edit.type='button';edit.addEventListener('click',()=>openContentDialog(item));const toggle=element('button',item.TrangThai?'danger':'',item.TrangThai?'Chuyển về nháp':'Xuất bản');toggle.type='button';toggle.addEventListener('click',()=>saveContentStatus(item,!Boolean(item.TrangThai)));actions.append(edit,toggle);action.appendChild(actions);row.appendChild(action);tbody.appendChild(row);});}
    function syncContentPublishHint(){const checkbox=$('#contentActive');const label=checkbox.closest('label');const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());if(textNode)textNode.textContent=' Xuất bản ngay';let hint=$('#contentPublishHint');if(!hint){hint=element('p','admin-publish-note');hint.id='contentPublishHint';label.insertAdjacentElement('afterend',hint);}hint.textContent=checkbox.checked?'Bài sẽ xuất hiện ngay tại Tin tức/Hướng dẫn sau khi lưu.':'Bài được lưu an toàn dưới dạng bản nháp và chưa hiện với khách hàng.';}
    function openContentDialog(item=null){$('#contentForm').reset();$('#contentId').value=item?.MaBV||'';$('#contentDialogTitle').textContent=item?'Chỉnh sửa nội dung':'Thêm nội dung';$('#contentType').value=item?.Loai||'TIN_TUC';$('#contentTitle').value=item?.TieuDe||'';$('#contentSummary').value=item?.TomTat||'';$('#contentBody').value=item?.NoiDung||'';$('#contentImage').value=item?.HinhAnh||'';renderContentImagePreview();$('#contentSource').value=item?.NguonURL||'';$('#contentActive').checked=item?Boolean(item.TrangThai):true;syncContentPublishHint();setStatus($('#contentFormStatus'));$('#contentDialog').showModal();}
    async function saveContent(event){event.preventDefault();const id=Number($('#contentId').value)||0;const payload={type:$('#contentType').value,title:$('#contentTitle').value.trim(),summary:$('#contentSummary').value.trim(),content:$('#contentBody').value.trim(),image:$('#contentImage').value.trim(),source_url:$('#contentSource').value.trim(),active:$('#contentActive').checked};const button=$('#contentSave');setBusy(button,true,'Đang lưu…');try{const data=await Auth.request(id?`/api/admin/noi-dung/${id}`:'/api/admin/noi-dung',{method:id?'PATCH':'POST',json:payload});$('#contentDialog').close();showToast(data.message,'success');loadContent();}catch(error){setStatus($('#contentFormStatus'),error.message);}finally{setBusy(button,false);}}
    async function saveContentStatus(item,active){try{const data=await Auth.request(`/api/admin/noi-dung/${item.MaBV}`,{method:'PATCH',json:{active}});showToast(data.message,'success');loadContent();}catch(error){showToast(error.message,'error');}}

    async function loadVouchers(){const tbody=$('#voucherRows');emptyRow(tbody,7,'Đang tải voucher…');try{const data=await Auth.request('/api/admin/vouchers');state.vouchers=data.items||[];renderVouchers();}catch(error){emptyRow(tbody,7,error.message);}}
    function renderVouchers(){const tbody=$('#voucherRows');tbody.innerHTML='';if(!state.vouchers.length){emptyRow(tbody,7,'Chưa có voucher.');return;}state.vouchers.forEach(v=>{const row=element('tr');let value=formatMoney(v.GiaTri);if(v.LoaiGiam==='PHAN_TRAM'){value=`${Number(v.GiaTri)}%`;if(v.GiamToiDa)value+=` · tối đa ${formatMoney(v.GiamToiDa)}`;}row.append(element('td','',v.MaVoucher),element('td','',value),element('td','',formatMoney(v.DonToiThieu)),element('td','',`${v.DaSuDung}/${v.SoLuong}`),element('td','',v.NgayHetHan?formatDate(v.NgayHetHan):'Không giới hạn'));const status=element('td');status.append(element('span',`admin-badge ${v.TrangThai?'admin-badge--success':'admin-badge--danger'}`,v.TrangThai?'Hoạt động':'Tạm tắt'));row.append(status);const action=element('td');const toggle=element('button',v.TrangThai?'danger':'',v.TrangThai?'Tắt':'Bật');toggle.type='button';toggle.addEventListener('click',async()=>{try{const data=await Auth.request(`/api/admin/vouchers/${encodeURIComponent(v.MaVoucher)}`,{method:'PATCH',json:{active:!Boolean(v.TrangThai)}});showToast(data.message,'success');loadVouchers();}catch(error){showToast(error.message,'error');}});action.append(toggle);row.append(action);tbody.append(row);});}
    function openVoucherDialog(){const form=$('#voucherForm');form.reset();$('#voucherQuantity').value='100';$('#voucherMinimum').value='0';$('#voucherActive').checked=true;setStatus($('#voucherFormStatus'));$('#voucherDialog').showModal();}
    async function saveVoucher(event){event.preventDefault();const payload={code:$('#voucherCode').value.trim().toUpperCase(),type:$('#voucherType').value,value:$('#voucherValue').value,maximum:$('#voucherMaximum').value||null,minimum:$('#voucherMinimum').value||0,quantity:$('#voucherQuantity').value,starts_at:$('#voucherStarts').value||null,expires_at:$('#voucherExpires').value||null,active:$('#voucherActive').checked};const button=$('#voucherSave');setBusy(button,true,'Đang tạo…');try{const data=await Auth.request('/api/admin/vouchers',{method:'POST',json:payload});$('#voucherDialog').close();showToast(data.message,'success');loadVouchers();}catch(error){setStatus($('#voucherFormStatus'),error.message);}finally{setBusy(button,false);}}

    function installEvents(){
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
        const admin=await Auth.requireAdmin();if(!admin)return;state.admin=admin;
        $('#approvalNav').hidden=admin.role!=='superadmin';
        const name=admin.fullname||admin.username;$('#adminName').textContent=name;$('#adminUsername').textContent=`@${admin.username}`;$('#adminAvatar').textContent=admin.avatar?'':name.charAt(0).toUpperCase();$('#adminAvatar').style.backgroundImage=admin.avatar?`url("${String(admin.avatar).replace(/"/g,'%22')}")`:'';$('#adminAvatar').classList.toggle('has-image',Boolean(admin.avatar));
        $('#adminLoading').hidden=true;$('#adminShell').hidden=false;$('#adminMain').setAttribute('aria-busy','false');installEvents();
        const requested=window.location.hash.slice(1);activateView(pageTitles[requested]?requested:'overview',true);
    }
    init();
})();
