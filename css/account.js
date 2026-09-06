(function () {
    'use strict';

    const Auth = window.BadmintonAuth;
    const page = document.body.dataset.accountPage;
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
    const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

    const statusMeta = {
        CHO_XAC_NHAN: ['Chờ xác nhận', ''],
        DANG_GIAO: ['Đang giao', 'status-pill--info'],
        HOAN_THANH: ['Hoàn thành', 'status-pill--success'],
        DA_HUY: ['Đã hủy', 'status-pill--danger'],
        CHO_DUYET: ['Chờ duyệt', ''],
        DA_DUYET: ['Đã duyệt', 'status-pill--success'],
        TU_CHOI: ['Từ chối', 'status-pill--danger']
    };

    function formatMoney(value) {
        return money.format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) return '—';
        const parsed = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? String(value) : dateTime.format(parsed);
    }

    function animateMetric(node, target, formatter = (value) => String(Math.round(value))) {
        if (!node) return;
        const finalValue = Number(target) || 0;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { node.textContent = formatter(finalValue); return; }
        const started = performance.now();
        const frame = (now) => {
            const progress = Math.min((now - started) / 680, 1);
            node.textContent = formatter(finalValue * (1 - Math.pow(1 - progress, 3)));
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

    function setBusy(button, busy, label = 'Đang xử lý…') {
        if (!button) return;
        if (busy) {
            button.dataset.busy = 'true';
            button.dataset.originalLabel = button.textContent;
            button.textContent = label;
            button.disabled = true;
        } else {
            delete button.dataset.busy;
            button.textContent = button.dataset.originalLabel || button.textContent;
            button.disabled = false;
        }
    }

    function showStatus(target, message = '', success = false) {
        if (!target) return;
        target.textContent = message;
        target.classList.toggle('is-success', success);
    }

    function setFieldError(input, message = '') {
        const field = input?.closest('.field');
        if (!field) return;
        field.classList.toggle('has-error', Boolean(message));
        input.setAttribute('aria-invalid', String(Boolean(message)));
        const error = field.querySelector(`[data-error-for="${input.id}"]`);
        if (error) error.textContent = message;
    }

    function installPasswordToggles() {
        $$('[data-password-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const input = document.getElementById(button.dataset.passwordToggle);
                if (!input) return;
                const visible = input.type === 'text';
                input.type = visible ? 'password' : 'text';
                button.textContent = visible ? 'Hiện' : 'Ẩn';
                button.setAttribute('aria-label', visible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
            });
        });
    }

    async function initLogin() {
        const form = $('#loginForm');
        const identity = $('#loginIdentity');
        const password = $('#loginPassword');
        const remember = $('#loginRemember');
        const status = $('#loginStatus');
        const submit = $('#loginSubmit');

        if (Auth.getToken()) {
            const user = await Auth.me();
            if (user) {
                window.location.replace(Auth.safeNext(['admin', 'superadmin'].includes(user.role) ? 'admin.html' : 'canhan.html'));
                return;
            }
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            setFieldError(identity);
            setFieldError(password);
            showStatus(status);
            const loginName = identity.value.trim();
            if (!loginName) setFieldError(identity, 'Vui lòng nhập tên đăng nhập hoặc email.');
            if (!password.value) setFieldError(password, 'Vui lòng nhập mật khẩu.');
            if (!loginName || !password.value) return;

            setBusy(submit, true, 'Đang xác thực…');
            try {
                const result = await Auth.login(loginName, password.value, remember.checked);
                showStatus(status, 'Đăng nhập thành công. Đang mở không gian của bạn…', true);
                const fallback = ['admin', 'superadmin'].includes(result.user?.role) ? 'admin.html' : 'canhan.html';
                window.setTimeout(() => window.location.replace(Auth.safeNext(fallback)), 450);
            } catch (error) {
                let message = error.message;
                if (error.code === 'too_many_attempts' && error.payload.retry_after) {
                    message = `${error.message} Thử lại sau ${Math.ceil(error.payload.retry_after / 60)} phút.`;
                }
                showStatus(status, message);
                password.select();
            } finally {
                setBusy(submit, false);
            }
        });
    }

    function passwordScore(value) {
        let score = 0;
        if (value.length >= 8) score += 1;
        if (value.length >= 12) score += 1;
        if (/[A-Za-zÀ-ỹ]/.test(value) && /\d/.test(value)) score += 1;
        if (/[^\w\s]/.test(value)) score += 1;
        return score;
    }

    async function initRegister() {
        const form = $('#registerForm');
        const fullname = $('#registerFullname');
        const username = $('#registerUsername');
        const email = $('#registerEmail');
        const phone = $('#registerPhone');
        const password = $('#registerPassword');
        const confirmPassword = $('#registerConfirm');
        const terms = $('#registerTerms');
        const meter = $('[data-password-meter]');
        const hint = $('[data-password-hint]');
        const status = $('#registerStatus');
        const submit = $('#registerSubmit');

        password.addEventListener('input', () => {
            const score = passwordScore(password.value);
            const colors = ['#c72d19', '#d65d12', '#e98b17', '#177848'];
            meter.style.width = `${score * 25}%`;
            meter.style.background = colors[Math.max(0, score - 1)];
            hint.textContent = ['', 'Mật khẩu còn yếu.', 'Mật khẩu ở mức trung bình.', 'Mật khẩu khá tốt.', 'Mật khẩu mạnh.'][score] || 'Cần ít nhất một chữ cái và một chữ số.';
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            [fullname, username, email, phone, password, confirmPassword].forEach((input) => setFieldError(input));
            showStatus(status);
            let valid = true;
            if (fullname.value.trim().length < 2) { setFieldError(fullname, 'Họ tên cần ít nhất 2 ký tự.'); valid = false; }
            if (!/^[A-Za-z0-9_]{3,30}$/.test(username.value.trim())) { setFieldError(username, 'Tên đăng nhập chưa đúng định dạng.'); valid = false; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { setFieldError(email, 'Email chưa đúng định dạng.'); valid = false; }
            if (phone.value.trim() && !/^(0|\+84)[3-9]\d{8}$/.test(phone.value.trim())) { setFieldError(phone, 'Số điện thoại Việt Nam chưa hợp lệ.'); valid = false; }
            if (password.value.length < 8 || !/[A-Za-zÀ-ỹ]/.test(password.value) || !/\d/.test(password.value)) { setFieldError(password, 'Cần ít nhất 8 ký tự, có chữ và số.'); valid = false; }
            if (confirmPassword.value !== password.value) { setFieldError(confirmPassword, 'Mật khẩu nhập lại chưa khớp.'); valid = false; }
            if (!terms.checked) { showStatus(status, 'Bạn cần đồng ý điều khoản để tạo tài khoản.'); valid = false; }
            if (!valid) return;

            setBusy(submit, true, 'Đang tạo tài khoản…');
            try {
                await Auth.request('/api/dang-ky', {
                    method: 'POST', auth: false,
                    json: {
                        fullname: fullname.value.trim(),
                        username: username.value.trim(),
                        email: email.value.trim(),
                        phone: phone.value.trim(),
                        password: password.value
                    }
                });
                await Auth.login(username.value.trim(), password.value, false);
                showStatus(status, 'Tài khoản đã sẵn sàng. Đang mở hồ sơ của bạn…', true);
                window.setTimeout(() => window.location.replace('canhan.html'), 500);
            } catch (error) {
                showStatus(status, error.message);
            } finally {
                setBusy(submit, false);
            }
        });
    }

    let profileUser = null;
    let selectedAvatarFile = null;
    let avatarCropImage = null, avatarCropBaseScale = 1, avatarCropScale = 1, avatarCropX = 0, avatarCropY = 0, avatarCropDragging = false, avatarCropPointerX = 0, avatarCropPointerY = 0;
    let orderPage = 1;
    let orderTotal = 0;
    let orderItems = [];
    let requestedOrderId = 0;
    let requestedOrderOpened = false;
    const loadedPanels = new Set();

    function bindProfile(user) {
        profileUser = user;
        const name = user.fullname || user.username || 'Thành viên';
        setProfileAvatar(user.avatar, name);
        $('#profileName').textContent = name;
        $('#profileHandle').textContent = `@${user.username}`;
        $('#welcomeName').textContent = name.split(/\s+/).pop();
        animateMetric($('#metricBalance'), user.balance, formatMoney);
        animateMetric($('#metricOrders'), user.stats?.orders);
        animateMetric($('#metricProcessing'), user.stats?.processing);
        animateMetric($('#metricSpent'), user.stats?.spent, formatMoney);
        $('#walletBalance').textContent = formatMoney(user.balance);
        animateMetric($('#loyaltyPoints'), user.stats?.points);
        $('#loyaltyTier').textContent = user.stats?.tier || 'Đồng';
        const tierProgress = Math.max(0, Math.min(100, Number(user.stats?.tier_progress) || 0));
        $('#loyaltyProgress').style.width = `${tierProgress}%`;
        $('#loyaltyProgress').parentElement.setAttribute('aria-valuenow', String(Math.round(tierProgress)));
        $('#loyaltyNext').textContent = user.stats?.next_target
            ? `Còn ${formatMoney(Math.max(0, Number(user.stats.next_target) - Number(user.stats.spent || 0)))} để lên hạng tiếp theo.`
            : 'Bạn đã đạt hạng thành viên cao nhất.';
        animateMetric($('#metricCompleted'), user.stats?.completed);
        animateMetric($('#metricFavorites'), user.stats?.favorites);
        animateMetric($('#metricCancelled'), user.stats?.cancelled);
        const completionRate = user.stats?.orders ? Math.round((Number(user.stats.completed) || 0) / Number(user.stats.orders) * 100) : 0;
        $('#accountCompletionRate').textContent = `${completionRate}%`;
        $('#accountCompletion').style.setProperty('--completion', `${completionRate}%`);
        $('#memberSince').textContent = user.created_at ? formatDate(user.created_at).split(' ')[0] : '—';
        $('#summaryEmail').textContent = user.email || 'Chưa cập nhật';
        $('#summaryPhone').textContent = user.phone || 'Chưa cập nhật';
        $('#summaryAddress').textContent = user.address || 'Chưa cập nhật';
        $('#profileFullname').value = user.fullname || '';
        $('#profileUsername').value = user.username || '';
        $('#profileEmail').value = user.email || '';
        $('#profilePhone').value = user.phone || '';
        $('#profileAddress').value = user.address || '';
        $('#addressCount').textContent = String((user.address || '').length);
        $('#adminEntry').hidden = !['admin', 'superadmin'].includes(user.role);
    }

    function setProfileAvatar(source, name) {
        const fallback = name.trim().charAt(0).toUpperCase() || 'B';
        [$('#profileAvatar'), $('#avatarPreview')].filter(Boolean).forEach((node) => {
            node.textContent = source ? '' : fallback;
            node.style.backgroundImage = source ? `url("${String(source).replace(/"/g, '%22')}")` : '';
            node.classList.toggle('has-image', Boolean(source));
        });
    }

    function clampAvatarPosition() { const canvas=$('#avatarCropCanvas');if(!avatarCropImage||!canvas)return;const halfX=Math.max(0,(avatarCropImage.width*avatarCropScale-canvas.width)/2);const halfY=Math.max(0,(avatarCropImage.height*avatarCropScale-canvas.height)/2);avatarCropX=Math.max(-halfX,Math.min(halfX,avatarCropX));avatarCropY=Math.max(-halfY,Math.min(halfY,avatarCropY)); }
    function drawAvatarCrop() { const canvas=$('#avatarCropCanvas');if(!canvas||!avatarCropImage)return;clampAvatarPosition();const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='#f4ece7';context.fillRect(0,0,canvas.width,canvas.height);const width=avatarCropImage.width*avatarCropScale,height=avatarCropImage.height*avatarCropScale;context.drawImage(avatarCropImage,(canvas.width-width)/2+avatarCropX,(canvas.height-height)/2+avatarCropY,width,height); }
    function openAvatarCrop(file) { const url=URL.createObjectURL(file);const image=new Image();image.onload=()=>{URL.revokeObjectURL(url);avatarCropImage=image;const canvas=$('#avatarCropCanvas');avatarCropBaseScale=Math.max(canvas.width/image.width,canvas.height/image.height);avatarCropScale=avatarCropBaseScale;avatarCropX=0;avatarCropY=0;$('#avatarZoom').value='1';drawAvatarCrop();$('#avatarCropDialog').showModal();};image.onerror=()=>{URL.revokeObjectURL(url);showStatus($('#avatarStatus'),'Không thể đọc ảnh đã chọn. Hãy thử ảnh khác.');};image.src=url; }

    function statusPill(status) {
        const [label, className] = statusMeta[status] || [status || 'Không rõ', ''];
        return element('span', `status-pill ${className}`, label);
    }

    function activateTab(name, moveFocus = false) {
        const tab = $(`[data-account-tab="${name}"]`);
        if (!tab) return;
        $$('[data-account-tab]').forEach((button) => button.setAttribute('aria-selected', String(button === tab)));
        $$('[data-account-panel]').forEach((panel) => { panel.hidden = panel.dataset.accountPanel !== name; });
        if (moveFocus) tab.focus();
        history.replaceState(null, '', `#${name}`);
        if (!loadedPanels.has(name)) {
            loadedPanels.add(name);
            if (name === 'orders') loadOrders();
            if (name === 'wallet') loadWallet();
            if (name === 'security') loadSessions();
        }
    }

    async function loadOrders() {
        const tbody = $('#orderRows');
        tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Đang tải đơn hàng…</td></tr>';
        try {
            const data = await Auth.request('/api/lich-su-don-hang', { method: 'POST', json: { trang: orderPage } });
            orderItems = data.orders || [];
            orderTotal = Number(data.total) || 0;
            renderOrders();
            if (requestedOrderId && !requestedOrderOpened) {
                requestedOrderOpened = true;
                await showOrderDetail(requestedOrderId);
            }
        } catch (error) {
            tbody.innerHTML = '';
            const row = element('tr');
            const cell = element('td', 'empty-cell', error.message);
            cell.colSpan = 6;
            row.appendChild(cell);
            tbody.appendChild(row);
        }
    }

    function renderOrders() {
        const tbody = $('#orderRows');
        const filter = $('#orderFilter').value;
        const items = filter === 'all' ? orderItems : orderItems.filter((order) => order.TrangThai === filter);
        tbody.innerHTML = '';
        if (!items.length) {
            const row = element('tr');
            const cell = element('td', 'empty-cell', filter === 'all' ? 'Bạn chưa có đơn hàng nào.' : 'Không có đơn phù hợp trên trang này.');
            cell.colSpan = 6;
            row.appendChild(cell);
            tbody.appendChild(row);
        }
        items.forEach((order) => {
            const row = element('tr');
            const id = Number(order.MaDH);
            const idCell = element('td');
            idCell.appendChild(element('strong', '', `#${id}`));
            row.append(idCell, element('td', '', formatDate(order.NgayDat)), element('td', '', paymentLabel(order.PhuongThuc)), element('td', '', formatMoney(order.TongTien)));
            const statusCell = element('td');
            statusCell.appendChild(statusPill(order.TrangThai));
            row.appendChild(statusCell);
            const actionCell = element('td');
            const actions = element('div', 'table-actions');
            const detail = element('button', 'table-action', 'Chi tiết');
            detail.type = 'button';
            detail.addEventListener('click', () => showOrderDetail(id));
            actions.appendChild(detail);
            if (order.TrangThai === 'CHO_XAC_NHAN') {
                const cancel = element('button', 'table-action table-action--danger', 'Hủy');
                cancel.type = 'button';
                cancel.addEventListener('click', () => updateOrder(id, 'cancel'));
                actions.appendChild(cancel);
            }
            if (order.TrangThai === 'DANG_GIAO') {
                const received = element('button', 'table-action', 'Đã nhận');
                received.type = 'button';
                received.addEventListener('click', () => updateOrder(id, 'received'));
                actions.appendChild(received);
            }
            actionCell.appendChild(actions);
            row.appendChild(actionCell);
            tbody.appendChild(row);
        });
        const pages = Math.max(1, Math.ceil(orderTotal / 10));
        $('#orderPagination').hidden = orderTotal <= 10;
        $('#orderPageInfo').textContent = `Trang ${orderPage}/${pages}`;
        $('#orderPrev').disabled = orderPage <= 1;
        $('#orderNext').disabled = orderPage >= pages;
    }

    function paymentLabel(value) {
        return { SO_DU: 'Số dư', COD: 'COD', BANKING: 'Chuyển khoản' }[value] || value || '—';
    }

    function safeImage(value) {
        const source = String(value || '').trim();
        if (!source || /^javascript:/i.test(source) || /^data:/i.test(source)) return 'HA/cc-removebg-preview.png';
        return source;
    }

    async function showOrderDetail(orderId) {
        const dialog = $('#orderDialog');
        const content = $('#orderDialogContent');
        content.innerHTML = '';
        content.appendChild(element('h2', '', `Đơn hàng #${orderId}`));
        content.appendChild(element('p', 'empty-state', 'Đang tải chi tiết…'));
        dialog.showModal();
        try {
            const data = await Auth.request(`/api/don-hang/${orderId}`);
            content.innerHTML = '';
            content.appendChild(element('h2', '', `Đơn hàng #${orderId}`));
            const meta = element('div', 'order-detail__meta');
            [
                ['Trạng thái', statusMeta[data.order.TrangThai]?.[0] || data.order.TrangThai],
                ['Thanh toán', paymentLabel(data.order.PhuongThuc)],
                ['Tổng tiền', formatMoney(data.order.TongTien)]
            ].forEach(([label, value]) => {
                const item = element('div'); item.append(element('span', '', label), element('strong', '', value)); meta.appendChild(item);
            });
            content.appendChild(meta);
            const address = element('p', 'empty-state');
            address.style.textAlign = 'left';
            address.textContent = `Giao đến: ${data.order.DiaChiGiao || 'Chưa có địa chỉ'}`;
            content.appendChild(address);
            (data.items || []).forEach((item) => {
                const product = element('div', 'order-product');
                const image = document.createElement('img');
                image.src = safeImage(item.HinhAnh);
                image.alt = '';
                image.loading = 'lazy';
                const info = element('div');
                info.append(element('strong', '', item.TenSP || `Sản phẩm #${item.MaSP}`), element('span', '', `Số lượng: ${item.SoLuong}`));
                product.append(image, info, element('strong', '', formatMoney(Number(item.GiaBan) * Number(item.SoLuong))));
                content.appendChild(product);
            });
        } catch (error) {
            content.innerHTML = '';
            content.append(element('h2', '', `Đơn hàng #${orderId}`), element('p', 'empty-state', error.message));
        }
    }

    async function updateOrder(orderId, action) {
        const isCancel = action === 'cancel';
        const question = isCancel
            ? `Hủy đơn hàng #${orderId}? Nếu đã thanh toán bằng số dư, tiền sẽ được hoàn tự động.`
            : `Xác nhận bạn đã nhận đơn hàng #${orderId}?`;
        if (!window.confirm(question)) return;
        try {
            const data = await Auth.request(isCancel ? '/api/don-hang/huy' : '/api/don-hang/hoan-thanh', {
                method: 'POST', json: { ma_don_hang: orderId }
            });
            showToast(data.message, 'success');
            await loadOrders();
            const fresh = await Auth.me(true);
            if (fresh) bindProfile(fresh);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function loadWallet() {
        const requestList = $('#depositRequests');
        const transactionList = $('#transactionList');
        requestList.innerHTML = '<p class="empty-state">Đang tải yêu cầu…</p>';
        transactionList.innerHTML = '<p class="empty-state">Đang tải giao dịch…</p>';
        const [requestsResult, transactionsResult] = await Promise.allSettled([
            Auth.request('/api/yeu-cau-nap-tien'),
            Auth.request('/api/lich-su-giao-dich')
        ]);
        if (requestsResult.status === 'fulfilled') renderDepositRequests(requestsResult.value.requests || []);
        else requestList.innerHTML = `<p class="empty-state"></p>`, requestList.firstChild.textContent = requestsResult.reason.message;
        if (transactionsResult.status === 'fulfilled') renderTransactions(transactionsResult.value.transactions || []);
        else transactionList.innerHTML = `<p class="empty-state"></p>`, transactionList.firstChild.textContent = transactionsResult.reason.message;
    }

    function showDepositQr(payment) {
        const dialog = $('#depositQrDialog');
        if (!dialog) return;
        $('#depositBank').textContent = [payment.bank_name, payment.bank_code].filter(Boolean).join(' · ') || '—';
        $('#depositAccount').textContent = payment.account_no || '—';
        $('#depositOwner').textContent = payment.account_name || '—';
        $('#depositQrAmount').textContent = formatMoney(payment.amount);
        $('#depositQrAmount').dataset.copyValue = String(Math.round(Number(payment.amount) || 0));
        $('#depositReference').textContent = payment.reference || '—';
        $('#depositQrUnavailable').textContent = payment.configured ? '' : 'Quản trị viên chưa cấu hình tài khoản nhận chuyển khoản.';
        if (payment.configured && payment.qr_url) {
            $('#depositQrImage').src = `${window.API_BASE || ''}${payment.qr_url}`;
            $('#depositQrImage').hidden = false;
        } else {
            $('#depositQrImage').hidden = true;
        }
        dialog.showModal();
    }

    function renderDepositRequests(items) {
        const list = $('#depositRequests');
        list.innerHTML = '';
        if (!items.length) { list.appendChild(element('p', 'empty-state', 'Chưa có yêu cầu nạp tiền.')); return; }
        items.slice(0, 6).forEach((item) => {
            const row = element('div', 'activity-item');
            row.appendChild(element('span', 'activity-item__icon', '₫'));
            const info = element('div');
            info.append(element('strong', '', item.MaThamChieu), element('span', '', `${formatDate(item.NgayTao)} · ${statusMeta[item.TrangThai]?.[0] || item.TrangThai}`));
            row.append(info, element('strong', 'activity-item__amount', formatMoney(item.SoTien)));
            list.appendChild(row);
        });
    }

    function renderTransactions(items) {
        const list = $('#transactionList');
        list.innerHTML = '';
        if (!items.length) { list.appendChild(element('p', 'empty-state', 'Chưa có giao dịch.')); return; }
        items.slice(0, 12).forEach((item) => {
            const positive = ['NAP', 'HOAN_TIEN'].includes(item.LoaiGiaoDich);
            const row = element('div', 'activity-item');
            row.appendChild(element('span', 'activity-item__icon', positive ? '+' : '−'));
            const info = element('div');
            info.append(element('strong', '', item.MoTa || transactionLabel(item.LoaiGiaoDich)), element('span', '', formatDate(item.NgayGD)));
            const amount = element('strong', 'activity-item__amount', `${positive ? '+' : '−'}${formatMoney(Math.abs(Number(item.SoTien)))}`);
            amount.style.color = positive ? 'var(--bs-success)' : 'var(--bs-ink)';
            row.append(info, amount);
            list.appendChild(row);
        });
    }

    function transactionLabel(type) {
        return { NAP: 'Nạp tiền', MUA: 'Thanh toán đơn hàng', HOAN_TIEN: 'Hoàn tiền' }[type] || type;
    }

    async function loadSessions() {
        const list = $('#sessionList');
        list.innerHTML = '<p class="empty-state">Đang tải phiên đăng nhập…</p>';
        try {
            const data = await Auth.request('/api/phien-dang-nhap');
            list.innerHTML = '';
            (data.sessions || []).forEach((session) => {
                const row = element('div', 'session-item');
                row.appendChild(element('span', 'session-item__icon', deviceIcon(session.UserAgent)));
                const info = element('div');
                info.append(element('strong', '', `${deviceName(session.UserAgent)}${session.is_current ? ' · Thiết bị này' : ''}`), element('span', '', `${session.DiaChiIP || 'IP không rõ'} · Hoạt động ${formatDate(session.LanHoatDongCuoi)}`));
                row.appendChild(info);
                if (!session.is_current) {
                    const revoke = element('button', '', 'Thu hồi');
                    revoke.type = 'button';
                    revoke.addEventListener('click', () => revokeSession(Number(session.MaPhien)));
                    row.appendChild(revoke);
                }
                list.appendChild(row);
            });
            if (!list.children.length) list.appendChild(element('p', 'empty-state', 'Không có phiên đang hoạt động.'));
        } catch (error) {
            list.innerHTML = '';
            list.appendChild(element('p', 'empty-state', error.message));
        }
    }

    function deviceName(agent = '') {
        if (/iphone|ipad/i.test(agent)) return 'Safari trên iOS';
        if (/android/i.test(agent)) return 'Trình duyệt Android';
        if (/windows/i.test(agent)) return 'Trình duyệt Windows';
        if (/macintosh|mac os/i.test(agent)) return 'Trình duyệt macOS';
        return 'Trình duyệt web';
    }

    function deviceIcon(agent = '') {
        return /iphone|ipad|android/i.test(agent) ? '▯' : '▭';
    }

    async function revokeSession(id) {
        try {
            const data = await Auth.request(`/api/phien-dang-nhap/${id}`, { method: 'DELETE' });
            showToast(data.message, 'success');
            loadSessions();
        } catch (error) { showToast(error.message, 'error'); }
    }

    function installProfileForms() {
        $('#profileAddress').addEventListener('input', (event) => { $('#addressCount').textContent = String(event.target.value.length); });
        $('#chooseAvatar').addEventListener('click', () => $('#avatarInput').click());
        $('#avatarInput').addEventListener('change', (event) => {
            const file = event.target.files?.[0]; selectedAvatarFile = null; $('#uploadAvatar').disabled = true; showStatus($('#avatarStatus'));
            if (!file) return;
            if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { showStatus($('#avatarStatus'), 'Ảnh phải là JPG, PNG hoặc WebP và không vượt quá 2 MB.'); event.target.value = ''; return; }
            openAvatarCrop(file);
        });
        $('#avatarZoom').addEventListener('input',(event)=>{avatarCropScale=avatarCropBaseScale*Number(event.target.value);drawAvatarCrop();});
        const cropCanvas=$('#avatarCropCanvas');cropCanvas.addEventListener('pointerdown',(event)=>{avatarCropDragging=true;avatarCropPointerX=event.clientX;avatarCropPointerY=event.clientY;cropCanvas.setPointerCapture(event.pointerId);});cropCanvas.addEventListener('pointermove',(event)=>{if(!avatarCropDragging)return;const ratio=cropCanvas.width/cropCanvas.getBoundingClientRect().width;avatarCropX+=(event.clientX-avatarCropPointerX)*ratio;avatarCropY+=(event.clientY-avatarCropPointerY)*ratio;avatarCropPointerX=event.clientX;avatarCropPointerY=event.clientY;drawAvatarCrop();});cropCanvas.addEventListener('pointerup',()=>{avatarCropDragging=false;});cropCanvas.addEventListener('pointercancel',()=>{avatarCropDragging=false;});
        const closeCrop=()=>{$('#avatarCropDialog').close();$('#avatarInput').value='';avatarCropImage=null;};$('#closeAvatarCrop').addEventListener('click',closeCrop);$('#cancelAvatarCrop').addEventListener('click',closeCrop);
        $('#confirmAvatarCrop').addEventListener('click',()=>{const canvas=$('#avatarCropCanvas');canvas.toBlob((blob)=>{if(!blob){showStatus($('#avatarStatus'),'Không thể tạo ảnh đại diện.');return;}selectedAvatarFile=new File([blob],'avatar.jpg',{type:'image/jpeg'});$('#uploadAvatar').disabled=false;const previewUrl=URL.createObjectURL(blob);setProfileAvatar(previewUrl,profileUser?.fullname||profileUser?.username||'B');$('#avatarCropDialog').close();$('#avatarInput').value='';avatarCropImage=null;showStatus($('#avatarStatus'),'Đã chọn vùng ảnh. Nhấn “Lưu ảnh” để hoàn tất.',true);},'image/jpeg',0.9);});
        $('#uploadAvatar').addEventListener('click', async () => {
            if (!selectedAvatarFile) return; const button = $('#uploadAvatar'); setBusy(button, true, 'Đang tải…'); showStatus($('#avatarStatus'));
            try { const form = new FormData(); form.append('avatar', selectedAvatarFile); const response = await fetch(`${window.API_BASE}/api/cap-nhat-anh-dai-dien`, { method: 'POST', headers: { Authorization: `Bearer ${Auth.getToken()}` }, body: form }); const data = await response.json(); if (!response.ok || data.success === false) throw new Error(data.message || 'Không thể cập nhật ảnh.'); selectedAvatarFile = null; $('#avatarInput').value = ''; profileUser.avatar = data.avatar; setProfileAvatar(data.avatar, profileUser.fullname || profileUser.username); showStatus($('#avatarStatus'), data.message, true); await Auth.me(true); }
            catch (error) { showStatus($('#avatarStatus'), error.message); setProfileAvatar(profileUser?.avatar, profileUser?.fullname || profileUser?.username || 'B'); }
            finally { setBusy(button, false); button.disabled = !selectedAvatarFile; }
        });
        $('#profileForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = $('#profileSubmit');
            const status = $('#profileStatus');
            const fullname = $('#profileFullname').value.trim();
            const email = $('#profileEmail').value.trim();
            const phone = $('#profilePhone').value.trim();
            if (fullname.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showStatus(status, 'Vui lòng kiểm tra lại họ tên và email.');
                return;
            }
            setBusy(submit, true, 'Đang lưu…');
            try {
                const data = await Auth.request('/api/cap-nhat-thong-tin', { method: 'POST', json: { fullname, email, phone, address: $('#profileAddress').value.trim() } });
                const user = await Auth.me(true);
                if (user) bindProfile(user);
                showStatus(status, data.message, true);
                showToast(data.message, 'success');
            } catch (error) { showStatus(status, error.message); }
            finally { setBusy(submit, false); }
        });

        $('#depositForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const amount = Number($('#depositAmount').value);
            const status = $('#depositStatus');
            const submit = $('#depositSubmit');
            if (!Number.isFinite(amount) || amount < 10000 || amount > 50000000) {
                showStatus(status, 'Số tiền cần từ 10.000 ₫ đến 50.000.000 ₫.');
                return;
            }
            setBusy(submit, true, 'Đang gửi yêu cầu…');
            try {
                const data = await Auth.request('/api/nap-tien/tao-yeu-cau', { method: 'POST', json: { amount } });
                showStatus(status, `${data.message} Mã: ${data.request.reference}`, true);
                $('#depositForm').reset();
                showDepositQr(data.payment || { configured: false, amount, reference: data.request.reference });
                await loadWallet();
            } catch (error) { showStatus(status, error.message); }
            finally { setBusy(submit, false); }
        });

        $$('[data-amount]').forEach((button) => button.addEventListener('click', () => { $('#depositAmount').value = button.dataset.amount; }));
        const closeDepositQr = () => $('#depositQrDialog')?.close();
        $('#closeDepositQr')?.addEventListener('click', closeDepositQr);
        $('#doneDepositQr')?.addEventListener('click', closeDepositQr);
        $$('[data-copy-target]').forEach((button) => button.addEventListener('click', async () => {
            const target = document.getElementById(button.dataset.copyTarget);
            const value = target?.dataset.copyValue || target?.textContent?.trim() || '';
            try {
                await navigator.clipboard.writeText(value);
                showToast('Đã sao chép thông tin chuyển khoản.', 'success');
            } catch (_) { showToast('Không thể sao chép tự động. Vui lòng chọn và sao chép thủ công.', 'error'); }
        }));
        $('#refreshWallet').addEventListener('click', loadWallet);

        $('#passwordForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const current = $('#currentPassword').value;
            const next = $('#newPassword').value;
            const confirm = $('#confirmNewPassword').value;
            const status = $('#passwordStatus');
            const submit = $('#passwordSubmit');
            if (next.length < 8 || !/[A-Za-zÀ-ỹ]/.test(next) || !/\d/.test(next)) { showStatus(status, 'Mật khẩu mới cần ít nhất 8 ký tự, có chữ và số.'); return; }
            if (next !== confirm) { showStatus(status, 'Mật khẩu nhập lại chưa khớp.'); return; }
            setBusy(submit, true, 'Đang cập nhật…');
            try {
                const data = await Auth.request('/api/doi-mat-khau', { method: 'POST', json: { old_password: current, new_password: next } });
                event.target.reset();
                showStatus(status, data.message, true);
                showToast(data.message, 'success');
                loadSessions();
            } catch (error) { showStatus(status, error.message); }
            finally { setBusy(submit, false); }
        });

        $('#logoutAll').addEventListener('click', async () => {
            if (!window.confirm('Đăng xuất tài khoản khỏi tất cả thiết bị, bao gồm thiết bị này?')) return;
            try { await Auth.request('/api/dang-xuat-tat-ca', { method: 'POST' }); }
            catch (error) { showToast(error.message, 'error'); return; }
            Auth.clearSession();
            window.location.replace('dangnhap.html');
        });
    }

    async function initProfile() {
        const user = await Auth.requireAuth();
        if (!user) return;
        bindProfile(user);
        $('#accountLoading').hidden = true;
        $('#accountShell').hidden = false;
        $('#main-content').setAttribute('aria-busy', 'false');

        $$('[data-account-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.accountTab)));
        $$('[data-open-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.openTab, true)));
        $('#accountLogout').addEventListener('click', () => Auth.logout());
        $('#orderFilter').addEventListener('change', renderOrders);
        $('#orderPrev').addEventListener('click', () => { if (orderPage > 1) { orderPage -= 1; loadOrders(); } });
        $('#orderNext').addEventListener('click', () => { if (orderPage * 10 < orderTotal) { orderPage += 1; loadOrders(); } });
        installProfileForms();

        requestedOrderId = Number(new URLSearchParams(window.location.search).get('order')) || 0;
        const requestedTab = requestedOrderId ? 'orders' : window.location.hash.slice(1);
        activateTab(['overview', 'profile', 'orders', 'wallet', 'security'].includes(requestedTab) ? requestedTab : 'overview');
        if (new URLSearchParams(window.location.search).get('notice') === 'admin-only') showToast('Tài khoản của bạn không có quyền quản trị.', 'warning');
    }

    installPasswordToggles();
    if (page === 'login') initLogin();
    if (page === 'register') initRegister();
    if (page === 'profile') initProfile();
})();
