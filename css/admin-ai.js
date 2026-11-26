/* Trợ lý AI cho trang quản trị: hỏi đáp phân tích số liệu kinh doanh và ảnh. */
(function () {
    'use strict';

    const Auth = window.BadmintonAuth;
    const panel = document.querySelector('[data-admin-panel="ai"]');
    if (!Auth || !panel) return;

    const $ = (selector) => panel.querySelector(selector);
    const body = $('#adminAiMessages');
    const form = $('#adminAiComposer');
    const input = $('#adminAiInput');
    const sendButton = $('#adminAiSend');
    const status = $('#adminAiStatus');
    const fileInput = $('#adminAiFileInput');
    const pendingList = $('#adminAiPending');
    const MAX_IMAGES = 4;
    const images = [];
    const history = [];
    let busy = false;
    let started = false;
    let snapshotLoaded = false;

    const money = (value) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0)) + 'đ';
    const shortMoney = (value) => {
        const number = Number(value) || 0;
        if (Math.abs(number) >= 1e9) return (number / 1e9).toFixed(1).replace('.0', '') + ' tỷ';
        if (Math.abs(number) >= 1e6) return (number / 1e6).toFixed(1).replace('.0', '') + ' tr';
        if (Math.abs(number) >= 1e3) return Math.round(number / 1e3) + 'k';
        return String(Math.round(number));
    };
    const timeNow = () => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const setStatus = (message, isError = false) => {
        status.textContent = message || '';
        status.classList.toggle('is-error', Boolean(isError));
    };
    const scrollToEnd = () => {
        body.scrollTop = body.scrollHeight;
        requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    };
    const authHeaders = () => ({ Authorization: 'Bearer ' + Auth.getToken() });

    /* ---------- Số liệu đang dùng ---------- */
    function sparkline(trend) {
        const values = trend.map(item => Number(item.revenue) || 0);
        const max = Math.max(...values, 1);
        const width = 140;
        const height = 34;
        const step = values.length > 1 ? width / (values.length - 1) : width;
        const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 3 - (value / max) * (height - 6)).toFixed(1)}`);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('class', 'aai-spark');
        svg.setAttribute('aria-hidden', 'true');
        const area = document.createElementNS(svg.namespaceURI, 'polygon');
        area.setAttribute('points', `0,${height} ${points.join(' ')} ${width},${height}`);
        area.setAttribute('class', 'aai-spark__area');
        const line = document.createElementNS(svg.namespaceURI, 'polyline');
        line.setAttribute('points', points.join(' '));
        line.setAttribute('class', 'aai-spark__line');
        svg.append(area, line);
        return svg;
    }
    function renderSnapshot(snapshot) {
        const box = $('#adminAiKpis');
        box.replaceChildren();
        if (!snapshot) {
            box.append(make('p', 'aai-kpis__empty', 'Chưa đọc được số liệu kinh doanh. AI vẫn phân tích được ảnh và câu hỏi.'));
            return;
        }
        const k = snapshot.kpis;
        const change = k.revenue_change;
        const cards = [
            ['Doanh thu 30 ngày', shortMoney(k.revenue_30), change === null || change === undefined ? 'chưa có kỳ trước' : (change >= 0 ? '▲ ' : '▼ ') + Math.abs(change) + '% so với kỳ trước', change === null || change === undefined ? '' : change >= 0 ? 'is-up' : 'is-down', true],
            ['Đơn 30 ngày', String(k.orders_30), 'kỳ trước ' + k.orders_prev_30 + ' đơn', k.orders_30 >= k.orders_prev_30 ? 'is-up' : 'is-down'],
            ['Tỉ lệ hủy', k.cancel_rate + '%', k.cancelled_30 + ' đơn hủy', k.cancel_rate > 10 ? 'is-down' : ''],
            ['Giá trị đơn TB', shortMoney(k.average_order_30), 'đơn không hủy', ''],
            ['Chờ xác nhận', String(k.pending_orders), k.shipping_orders + ' đơn đang giao', k.pending_orders ? 'is-warn' : ''],
            ['Hết hàng', String(k.out_of_stock), 'trên ' + k.active_products + ' sản phẩm đang bán', k.out_of_stock ? 'is-warn' : ''],
        ];
        cards.forEach(([label, value, note, tone, withSpark]) => {
            const card = make('div', 'aai-kpi ' + (tone || ''));
            card.append(make('span', 'aai-kpi__label', label), make('strong', 'aai-kpi__value', value), make('small', 'aai-kpi__note', note));
            if (withSpark && snapshot.trend?.length) card.append(sparkline(snapshot.trend));
            box.append(card);
        });
    }
    async function loadSnapshot(force = false) {
        if (snapshotLoaded && !force) return;
        snapshotLoaded = true;
        const box = $('#adminAiKpis');
        if (!box.children.length) box.append(make('p', 'aai-kpis__empty', 'Đang tải số liệu…'));
        try {
            const response = await fetch(Auth.apiBase() + '/api/admin/ai/snapshot', { headers: authHeaders() });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) throw new Error(data.message);
            renderSnapshot(data.snapshot);
            $('#adminAiState').textContent = data.configured ? 'Gemini đã kết nối' : 'Chưa có GEMINI_API_KEY';
            $('#adminAiState').classList.toggle('is-off', !data.configured);
        } catch (_) {
            renderSnapshot(null);
            snapshotLoaded = false;
        }
    }

    /* ---------- Ảnh ---------- */
    function renderPending() {
        pendingList.replaceChildren();
        images.forEach((item, index) => {
            const chip = make('span', 'aai-pending');
            const image = make('img');
            image.src = item.url;
            image.alt = 'Ảnh sẽ gửi số ' + (index + 1);
            const remove = make('button', '', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Bỏ ảnh số ' + (index + 1));
            remove.addEventListener('click', () => {
                URL.revokeObjectURL(item.url);
                images.splice(index, 1);
                renderPending();
            });
            chip.append(image, remove);
            pendingList.append(chip);
        });
        pendingList.hidden = !images.length;
    }
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_invalid')); };
            image.src = url;
        });
    }
    async function shrink(file) {
        const image = await loadImage(file);
        // Biểu đồ/ảnh chụp màn hình cần giữ chữ đọc được: cạnh dài tối đa 1600px.
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        if (scale === 1 && file.type === 'image/jpeg' && file.size <= 1.2 * 1024 * 1024) return file;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
        if (!blob) throw new Error('image_invalid');
        return new File([blob], (file.name || 'anh').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    async function addImages(files) {
        const picked = [...files].filter(file => /^image\/(jpeg|png|webp)$/i.test(file.type));
        if (!picked.length) { setStatus('Chỉ nhận ảnh JPG, PNG hoặc WEBP.', true); return; }
        if (images.length + picked.length > MAX_IMAGES) { setStatus('Mỗi lần phân tích tối đa ' + MAX_IMAGES + ' ảnh.', true); return; }
        setStatus('Đang chuẩn bị ảnh…');
        try {
            for (const file of picked) {
                const small = await shrink(file);
                images.push({ file: small, url: URL.createObjectURL(small) });
            }
            setStatus('Đã thêm ' + images.length + ' ảnh. Nhập yêu cầu phân tích rồi bấm Phân tích.');
        } catch (_) {
            setStatus('Không đọc được ảnh này.', true);
        }
        renderPending();
        input.focus({ preventScroll: true });
    }

    /* ---------- Hội thoại ---------- */
    function renderWelcome() {
        body.replaceChildren();
        const welcome = make('section', 'aai-welcome');
        welcome.append(make('strong', '', 'Hỏi về doanh thu, tồn kho, sản phẩm… hoặc gửi ảnh để AI đánh giá'));
        welcome.append(make('p', '', 'AI đọc số liệu tổng hợp 30 ngày của cửa hàng (không gồm tên, email, số điện thoại khách hàng). Ảnh chỉ được gửi tới Gemini để phân tích, không lưu lại.'));
        const grid = make('div', 'aai-starters');
        [
            ['📊', 'Đánh giá doanh thu 30 ngày', 'Đánh giá tình hình doanh thu và đơn hàng 30 ngày qua so với kỳ trước. Điểm nào đáng lo, điểm nào tốt?'],
            ['📦', 'Nên nhập thêm gì?', 'Sản phẩm nào sắp hết hàng mà bán chạy, cần nhập thêm ngay? Ưu tiên thế nào?'],
            ['🧊', 'Xử lý hàng tồn', 'Những sản phẩm tồn kho lâu không bán được nên xử lý thế nào để giải phóng vốn?'],
            ['🎯', 'Kế hoạch khuyến mãi', 'Đề xuất 3 chương trình khuyến mãi/voucher cho tháng tới dựa trên số liệu hiện tại.'],
            ['🖼️', 'Đánh giá ảnh sản phẩm', null],
            ['📈', 'Phân tích ảnh biểu đồ', null],
        ].forEach(([icon, label, prompt]) => {
            const button = make('button', 'aai-starter');
            button.type = 'button';
            button.append(make('span', 'aai-starter__icon', icon), make('span', '', label));
            button.addEventListener('click', () => {
                if (prompt) { input.value = prompt; form.requestSubmit(); return; }
                input.value = label === 'Đánh giá ảnh sản phẩm'
                    ? 'Đánh giá ảnh sản phẩm này để đăng bán: chất lượng ảnh, độ hấp dẫn và cần sửa gì?'
                    : 'Phân tích biểu đồ trong ảnh: xu hướng, điểm bất thường và việc nên làm.';
                fileInput.click();
            });
            grid.append(button);
        });
        welcome.append(grid);
        body.append(welcome);
    }
    function appendRichText(container, text) {
        let list = null;
        String(text || '').split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) { list = null; return; }
            const heading = trimmed.match(/^##\s+(.*)$/);
            const bullet = trimmed.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
            if (heading) {
                list = null;
                container.append(make('h3', 'aai-answer__heading', heading[1].replace(/:$/, '')));
            } else if (bullet) {
                if (!list) { list = make('ul', 'aai-answer__list'); container.append(list); }
                list.append(make('li', '', bullet[1]));
            } else {
                list = null;
                container.append(make('p', '', trimmed));
            }
        });
    }
    function addProducts(container, products) {
        if (!products?.length) return;
        const list = make('div', 'aai-products');
        products.forEach(product => {
            const card = make('a', 'aai-product');
            card.href = 'chitiet.html?id=' + encodeURIComponent(product.MaSP);
            card.target = '_blank';
            card.rel = 'noopener';
            const image = make('img');
            image.src = product.HinhAnh;
            image.alt = '';
            image.loading = 'lazy';
            image.addEventListener('error', () => { image.src = 'HA/cc-removebg-preview.png'; }, { once: true });
            const info = make('span', 'aai-product__info');
            info.append(make('strong', '', product.TenSP || 'Sản phẩm'));
            info.append(make('small', '', money(product.GiaBan) + ' · tồn ' + product.TonKho));
            card.append(image, info);
            list.append(card);
        });
        container.append(list);
    }
    function showSuggestions(items) {
        body.querySelectorAll('.aai-followups').forEach(node => node.remove());
        if (!items?.length) return;
        const box = make('div', 'aai-followups');
        items.forEach(text => {
            const button = make('button', '', text);
            button.type = 'button';
            button.addEventListener('click', () => { if (!busy) { input.value = text; form.requestSubmit(); } });
            box.append(button);
        });
        body.append(box);
    }
    function addQuestion(text, sent) {
        const item = make('article', 'aai-msg aai-msg--me');
        if (sent.length) {
            const grid = make('div', 'aai-photos');
            sent.forEach(entry => {
                const image = make('img');
                image.src = entry.url;
                image.alt = 'Ảnh gửi phân tích';
                image.addEventListener('click', () => window.open(entry.url, '_blank', 'noopener'));
                grid.append(image);
            });
            item.append(grid);
        }
        if (text) item.append(make('p', '', text));
        item.append(make('time', '', timeNow()));
        body.append(item);
        return item;
    }
    function addAnswer(data) {
        const item = make('article', 'aai-msg aai-msg--ai');
        const head = make('div', 'aai-msg__head');
        head.append(make('span', 'aai-msg__badge', '✦ Trợ lý AI'));
        if (data.data_available === false) head.append(make('span', 'aai-msg__warn', 'Không có số liệu DB'));
        const copy = make('button', 'aai-copy', 'Sao chép');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(data.reply.replace(/^##\s+/gm, ''));
                copy.textContent = 'Đã chép ✓';
            } catch (_) { copy.textContent = 'Không chép được'; }
            setTimeout(() => { copy.textContent = 'Sao chép'; }, 1600);
        });
        head.append(copy);
        item.append(head);
        const content = make('div', 'aai-answer');
        appendRichText(content, data.reply);
        item.append(content);
        addProducts(item, data.products);
        item.append(make('time', '', timeNow()));
        body.append(item);
        showSuggestions(data.suggestions);
        if (data.snapshot) renderSnapshot(data.snapshot);
    }
    function addTyping(withImages) {
        const typing = make('div', 'aai-msg aai-msg--ai aai-typing');
        typing.setAttribute('role', 'status');
        const dots = make('span', 'aai-dots');
        dots.append(make('i'), make('i'), make('i'));
        typing.append(dots, make('span', '', withImages ? 'Đang đọc ảnh và số liệu…' : 'Đang phân tích số liệu…'));
        body.append(typing);
        return typing;
    }
    async function submit(event) {
        event.preventDefault();
        const question = input.value.trim();
        if ((!question && !images.length) || busy) return;
        if (!started) { body.replaceChildren(); started = true; }
        body.querySelectorAll('.aai-followups, .aai-error').forEach(node => node.remove());
        const sent = images.splice(0);
        renderPending();
        const bubble = addQuestion(question, sent);
        input.value = '';
        busy = true;
        sendButton.disabled = true;
        const typing = addTyping(sent.length > 0);
        scrollToEnd();
        setStatus('');
        const payload = new FormData();
        payload.append('message', question);
        payload.append('history', JSON.stringify(history.slice(-12)));
        sent.forEach((entry, index) => payload.append('images', entry.file, entry.file.name || ('anh-' + (index + 1) + '.jpg')));
        try {
            const response = await fetch(Auth.apiBase() + '/api/admin/ai/analyze', { method: 'POST', headers: authHeaders(), body: payload });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
                const error = new Error(data.message || 'Chưa kết nối được trợ lý AI.');
                error.status = response.status;
                throw error;
            }
            typing.remove();
            addAnswer(data);
            const note = sent.length ? ' [kèm ' + sent.length + ' ảnh]' : '';
            history.push({ role: 'user', text: (question || 'Gửi ảnh nhờ đánh giá') + note }, { role: 'model', text: data.reply });
        } catch (error) {
            typing.remove();
            bubble.remove();
            input.value = question;
            images.push(...sent);
            renderPending();
            const message = error.status === 429
                ? 'Bạn gửi hơi nhanh, đợi một chút rồi thử lại.'
                : error.status === 401 ? 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.'
                : (error.status ? error.message : 'Không kết nối được máy chủ.');
            body.append(make('p', 'aai-error', message));
            if (body.children.length === 1) started = false;
            setStatus(message, true);
        } finally {
            busy = false;
            sendButton.disabled = false;
            scrollToEnd();
            input.focus({ preventScroll: true });
        }
    }

    /* ---------- Gắn sự kiện ---------- */
    form.addEventListener('submit', submit);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    $('#adminAiAttach').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', event => {
        const files = [...(event.target.files || [])];
        event.target.value = '';
        if (files.length) addImages(files);
    });
    input.addEventListener('paste', event => {
        const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
        if (!files.length) return;
        event.preventDefault();
        addImages(files);
    });
    const dropZone = $('.aai-chat');
    dropZone.addEventListener('dragover', event => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        dropZone.classList.add('is-dragging');
    });
    dropZone.addEventListener('dragleave', event => { if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragging'); });
    dropZone.addEventListener('drop', event => {
        dropZone.classList.remove('is-dragging');
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        addImages(event.dataTransfer.files);
    });
    $('#adminAiRefresh').addEventListener('click', () => loadSnapshot(true));
    $('#adminAiReset').addEventListener('click', () => {
        if (busy) return;
        history.length = 0;
        started = false;
        renderWelcome();
        setStatus('Đã bắt đầu cuộc phân tích mới.');
    });
    body.addEventListener('load', event => {
        if (event.target.tagName === 'IMG' && body.scrollHeight - body.scrollTop - body.clientHeight < 260) scrollToEnd();
    }, true);

    renderWelcome();
    // Tải số liệu khi mục được mở (kể cả khi vào thẳng admin.html#ai).
    new MutationObserver(() => { if (!panel.hidden) loadSnapshot(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    if (!panel.hidden) loadSnapshot();
    window.AdminAI = {
        load: (force = false) => loadSnapshot(force),
    };
})();
