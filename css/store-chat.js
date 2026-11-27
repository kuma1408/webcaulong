(function () {
    'use strict';

    if (document.body.classList.contains('admin-body') || document.getElementById('storeChatWidget')) return;
    const Auth = window.BadmintonAuth;
    if (!Auth) return;

    const widget = document.createElement('aside');
    widget.className = 'store-chat-widget';
    widget.id = 'storeChatWidget';
    widget.innerHTML = `
        <div class="store-chat-window" id="storeChatWindow" data-chat-mode="messenger" role="dialog" aria-modal="false" aria-label="Nhắn tin với cửa hàng" hidden>
            <header class="store-chat-window__head">
                <div class="store-chat-window__identity"><strong id="storeChatTitle">Nhắn tin với cửa hàng</strong><span id="storeChatSubtitle">Phản hồi trực tiếp từ đội ngũ Badminton Store</span></div>
                <div class="store-chat-window__actions">
                    <button class="store-chat-close store-chat-resize" id="storeChatResize" type="button" aria-pressed="false" aria-label="Phóng to khung chat" title="Phóng to">⤢</button>
                    <button class="store-chat-close" id="storeChatClose" type="button" aria-label="Đóng hộp chat">×</button>
                </div>
            </header>
            <div class="store-chat-messages" id="storeChatBody" aria-live="polite"></div>
            <form class="store-chat-composer" id="storeChatComposer">
                <div class="store-chat-tools">
                    <button type="button" class="store-chat-tool" id="storeChatEmoji" aria-label="Chèn emoji">☺</button>
                    <button type="button" class="store-chat-tool" id="storeChatChooseFile" aria-label="Đính kèm ảnh hoặc tệp">＋</button>
                    <input id="storeChatFileInput" type="file" accept="image/jpeg,image/png,image/webp,audio/*,application/pdf,text/plain,text/csv,application/json,.docx,.xlsx,.pptx" multiple hidden>
                    <button type="button" class="store-chat-tool" id="storeChatRecord" aria-label="Ghi âm tin nhắn thoại">🎙</button>
                    <div class="store-chat-emoji-picker" id="storeChatEmojiPicker" hidden></div>
                    <div class="store-chat-pending" id="storeChatPendingFiles"></div>
                </div>
                <label class="bs-visually-hidden" for="storeChatInput">Tin nhắn</label>
                <textarea id="storeChatInput" maxlength="2000" rows="2" placeholder="Nhập tin nhắn…"></textarea>
                <button id="storeChatSend" type="submit">Gửi</button>
                <p class="store-chat-status" id="storeChatStatus" role="status"></p>
            </form>
        </div>
        <div class="store-chat-launchers">
            <button class="store-chat-launcher store-chat-launcher--ai" id="storeAiLauncher" type="button" aria-expanded="false" aria-controls="storeChatWindow"><span class="store-chat-launcher__icon" aria-hidden="true">✦</span><span>Hỏi AI</span></button>
            <button class="store-chat-launcher" id="storeMessengerLauncher" type="button" aria-expanded="false" aria-controls="storeChatWindow"><span class="store-chat-launcher__icon" aria-hidden="true">▰</span><span>Nhắn cửa hàng</span><b class="store-chat-badge" id="storeChatUnreadBadge" hidden></b></button>
        </div>`;
    document.body.appendChild(widget);

    const panel = widget.querySelector('#storeChatWindow');
    const body = widget.querySelector('#storeChatBody');
    const form = widget.querySelector('#storeChatComposer');
    const input = widget.querySelector('#storeChatInput');
    const sendButton = widget.querySelector('#storeChatSend');
    const status = widget.querySelector('#storeChatStatus');
    const fileInput = widget.querySelector('#storeChatFileInput');
    const pendingFiles = [];
    const attachmentUrls = new Map();
    let activeMode = null;
    let lastMessageId = 0;
    let loading = false;
    let aiHasMessages = false;
    let aiBusy = false;
    const aiHistory = [];
    const aiImages = [];
    const AI_MAX_IMAGES = 3;
    const messengerAccept = fileInput.accept;
    let mediaRecorder = null;
    let recordingStream = null;
    let recordingChunks = [];
    const Notify = () => window.BadmintonChatNotify;
    const unreadBadge = widget.querySelector('#storeChatUnreadBadge');
    let lastNotifiedId = null; // null = chưa có mốc; lần kiểm tra đầu không kêu
    let unreadPolling = false;
    const EXPAND_KEY = 'store_chat_expanded';

    function showUnread(count) {
        const value = Math.max(0, Number(count) || 0);
        unreadBadge.hidden = !value;
        unreadBadge.textContent = value > 9 ? '9+' : String(value);
        widget.querySelector('#storeMessengerLauncher').setAttribute(
            'aria-label', value ? `Nhắn cửa hàng, ${value} tin nhắn chưa đọc` : 'Nhắn cửa hàng'
        );
        Notify()?.setUnread(value);
    }
    const messengerInView = () => activeMode === 'messenger' && !panel.hidden && document.visibilityState === 'visible';

    async function pollUnread() {
        if (unreadPolling || !Auth.getToken()) return;
        if (messengerInView()) return; // hộp thư đang mở: loadCustomerMessages tự đánh dấu đã đọc
        if (Notify()?.isMobileDevice && document.visibilityState !== 'visible') return;
        unreadPolling = true;
        try {
            const data = await Auth.request('/api/chat/chua-doc');
            const lastId = Number(data.last_id) || 0;
            if (lastNotifiedId !== null && data.unread > 0 && lastId > lastNotifiedId) Notify()?.ting();
            lastNotifiedId = Math.max(lastNotifiedId || 0, lastId);
            showUnread(data.unread);
        } catch (_) {
            /* Lỗi mạng tạm thời: thử lại ở lần sau. */
        } finally {
            unreadPolling = false;
        }
    }

    function setExpanded(expanded) {
        panel.classList.toggle('is-expanded', expanded);
        const toggle = widget.querySelector('#storeChatResize');
        toggle.setAttribute('aria-pressed', String(expanded));
        toggle.setAttribute('aria-label', expanded ? 'Thu nhỏ khung chat' : 'Phóng to khung chat');
        toggle.title = expanded ? 'Thu nhỏ' : 'Phóng to';
        toggle.textContent = expanded ? '⤡' : '⤢';
        try { localStorage.setItem(EXPAND_KEY, expanded ? '1' : '0'); } catch (_) { /* chế độ riêng tư */ }
    }

    const loginHref = () => 'dangnhap.html?next=' + encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search + window.location.hash);
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const addNote = (message) => body.append(make('p', 'store-chat-note', message));
    const setStatus = (message, isError = false) => {
        status.textContent = message;
        status.style.color = isError ? '#d83225' : '';
    };
    function addMessage(message, mine) {
        const item = make('article', 'store-chat-message' + (mine ? ' is-mine' : ''));
        if (message.NoiDung) item.append(make('p', '', message.NoiDung));
        const time = make('time', '', message.NgayTao ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(message.NgayTao.replace(' ', 'T'))) : 'Vừa xong');
        item.append(time);
        (message.TepDinhKem || []).forEach(file => renderAttachment(item, file));
        body.append(item);
    }
    function renderAttachment(container, file) {
        const card = make('div', 'store-chat-attachment');
        const link = make('button', 'store-chat-file-link', 'Đang tải tệp…');
        link.type = 'button';
        link.disabled = true;
        card.append(link);
        container.append(card);
        const cached = attachmentUrls.get(file.MaTep);
        const mount = (url) => {
            link.disabled = false;
            link.textContent = file.TenTepTin + ' · ' + Math.max(1, Math.ceil(Number(file.KichThuoc || 0) / 1024)) + ' KB';
            if (file.MimeType.startsWith('image/')) {
                const image = make('img', 'store-chat-attachment__image');
                image.src = url;
                image.alt = file.TenTepTin;
                card.prepend(image);
                link.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
            } else if (file.MimeType.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.className = 'store-chat-audio';
                audio.controls = true;
                audio.preload = 'metadata';
                audio.src = url;
                card.prepend(audio);
            }
            link.addEventListener('click', () => {
                if (file.MimeType.startsWith('image/')) return;
                const download = document.createElement('a');
                download.href = url;
                download.download = file.TenTepTin;
                download.click();
            });
        };
        if (cached) { mount(cached); return; }
        fetch(Auth.apiBase() + '/api/chat/attachments/' + encodeURIComponent(file.MaTep), {
            headers: { Authorization: 'Bearer ' + Auth.getToken() }
        }).then(response => {
            if (!response.ok) throw new Error('Tệp không còn khả dụng');
            return response.blob();
        }).then(blob => {
            const url = URL.createObjectURL(blob);
            attachmentUrls.set(file.MaTep, url);
            mount(url);
        }).catch(() => { link.disabled = true; link.textContent = 'Không tải được tệp: ' + file.TenTepTin; });
    }
    function renderPendingFiles() {
        const list = widget.querySelector('#storeChatPendingFiles');
        list.replaceChildren();
        if (activeMode === 'ai') {
            renderAiPendingImages(list);
            return;
        }
        pendingFiles.forEach((file, index) => {
            const item = make('span', 'store-chat-pending__item', file.name);
            const remove = make('button', '', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Bỏ ' + file.name);
            remove.addEventListener('click', () => {
                pendingFiles.splice(index, 1);
                renderPendingFiles();
            });
            item.append(remove);
            list.append(item);
        });
    }
    function stageFiles(files) {
        const additions = [...files];
        if (pendingFiles.length + additions.length > 5 || pendingFiles.reduce((sum, file) => sum + file.size, 0) + additions.reduce((sum, file) => sum + file.size, 0) > 5 * 1024 * 1024) {
            setStatus('Tối đa 5 tệp và tổng dung lượng 5 MB mỗi tin.', true);
            return;
        }
        if (additions.some(file => file.size > 2 * 1024 * 1024)) {
            setStatus('Mỗi tệp chat tối đa 2 MB.', true);
            return;
        }
        pendingFiles.push(...additions);
        renderPendingFiles();
        setStatus(pendingFiles.length ? 'Đã đính kèm ' + pendingFiles.length + ' tệp.' : '');
    }
    function installEmojiPicker(button, picker, target) {
        const emojis = ['😀','😃','😄','😁','😆','😊','🙂','😉','😍','🥰','😎','🤔','👍','👏','🙏','🎉','❤️','🔥','🏸','⚡','✅','💯'];
        emojis.forEach(emoji => {
            const option = make('button', '', emoji);
            option.type = 'button';
            option.addEventListener('click', () => {
                const start = target.selectionStart;
                target.setRangeText(emoji, start, target.selectionEnd, 'end');
                target.focus();
                picker.hidden = true;
            });
            picker.append(option);
        });
        button.addEventListener('click', () => { picker.hidden = !picker.hidden; });
    }
    function stopRecordingUi(button) {
        mediaRecorder = null;
        recordingChunks = [];
        if (recordingStream) recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
        button.textContent = '🎙';
        button.classList.remove('is-recording');
        button.setAttribute('aria-label', 'Ghi âm tin nhắn thoại');
    }
    async function toggleVoiceRecording(button) {
        if (mediaRecorder?.state === 'recording') { mediaRecorder.stop(); return; }
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            setStatus('Trình duyệt này chưa hỗ trợ ghi âm. Bạn vẫn có thể chọn tệp âm thanh.', true);
            return;
        }
        try {
            recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferred = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported?.(type));
            mediaRecorder = new MediaRecorder(recordingStream, preferred ? { mimeType: preferred } : undefined);
            recordingChunks = [];
            mediaRecorder.addEventListener('dataavailable', event => { if (event.data.size) recordingChunks.push(event.data); });
            mediaRecorder.addEventListener('stop', () => {
                const mime = mediaRecorder?.mimeType || recordingChunks[0]?.type || 'audio/webm';
                const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
                const blob = new Blob(recordingChunks, { type: mime });
                if (blob.size) stageFiles([new File([blob], 'ghi-am-' + Date.now() + '.' + ext, { type: mime })]);
                stopRecordingUi(button);
            }, { once: true });
            mediaRecorder.start();
            button.textContent = '■';
            button.classList.add('is-recording');
            button.setAttribute('aria-label', 'Dừng ghi âm');
            setStatus('Đang ghi âm… nhấn nút đỏ để kết thúc.');
            window.setTimeout(() => { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); }, 60_000);
        } catch (_) {
            stopRecordingUi(button);
            setStatus('Không truy cập được micro. Hãy cấp quyền micro cho trình duyệt.', true);
        }
    }
    function showLoginPrompt() {
        body.replaceChildren();
        addNote('Đăng nhập để gửi tin và xem phản hồi riêng từ đội ngũ cửa hàng.');
        const link = make('a', 'store-chat-launcher', 'Đăng nhập để nhắn tin');
        link.href = loginHref();
        link.style.alignSelf = 'center';
        link.style.textDecoration = 'none';
        body.append(link);
        form.hidden = true;
    }
    function setMode(mode) {
        activeMode = mode;
        panel.dataset.chatMode = mode;
        panel.hidden = false;
        widget.querySelector('#storeMessengerLauncher').setAttribute('aria-expanded', String(mode === 'messenger'));
        widget.querySelector('#storeAiLauncher').setAttribute('aria-expanded', String(mode === 'ai'));
        widget.querySelector('#storeChatTitle').textContent = mode === 'ai' ? 'Trợ lý AI' : 'Nhắn tin với cửa hàng';
        widget.querySelector('#storeChatSubtitle').textContent = mode === 'ai' ? 'Hỏi nhanh về sản phẩm và mua sắm' : 'Tin nhắn riêng với đội ngũ Badminton Store';
        widget.querySelector('.store-chat-tools').hidden = false;
        fileInput.accept = mode === 'ai' ? 'image/jpeg,image/png,image/webp' : messengerAccept;
        widget.querySelector('#storeChatChooseFile').setAttribute('aria-label', mode === 'ai' ? 'Gửi ảnh cho trợ lý AI' : 'Đính kèm ảnh hoặc tệp');
        status.classList.toggle('store-ai-status', mode === 'ai');
        status.textContent = '';
        if (mode === 'ai') {
            pendingFiles.splice(0);
            renderPendingFiles();
            renderAi();
        }
        else {
            input.placeholder = 'Nhập tin nhắn…';
            sendButton.textContent = 'Gửi';
            aiHasMessages = false;
            aiHistory.length = 0;
            clearAiImages();
            renderPendingFiles();
            lastMessageId = 0;
            loadCustomerMessages(true);
        }
    }
    async function loadCustomerMessages(initial = false) {
        if (activeMode !== 'messenger' || loading) return;
        if (!Auth.getToken()) {
            showLoginPrompt();
            return;
        }
        loading = true;
        const wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
        try {
            const data = await Auth.request('/api/chat?after=' + (initial ? 0 : lastMessageId));
            form.hidden = false;
            if (initial) {
                body.replaceChildren();
                if (!data.messages?.length) addNote('Xin chào! Bạn có thể gửi câu hỏi tại đây. Tin nhắn sẽ được lưu trong tài khoản để Admin phản hồi.');
            }
            const incoming = (data.messages || []).filter(message => message.VaiTroGui === 'ADMIN');
            (data.messages || []).forEach(message => {
                addMessage(message, message.VaiTroGui !== 'ADMIN');
                lastMessageId = Math.max(lastMessageId, Number(message.MaTinNhan) || 0);
            });
            if (!initial && incoming.length && document.visibilityState !== 'visible') Notify()?.ting();
            lastNotifiedId = Math.max(lastNotifiedId || 0, lastMessageId);
            showUnread(0);
            if (initial || wasAtBottom) body.scrollTop = body.scrollHeight;
            if (initial) input.focus();
        } catch (error) {
            if (error.status === 401) showLoginPrompt();
            else {
                if (initial) {
                    body.replaceChildren();
                    addNote(error.message || 'Chưa tải được hộp thư. Vui lòng thử lại sau.');
                }
                setStatus('Có thể cần cập nhật máy chủ để bật hộp thư.', true);
            }
        } finally {
            loading = false;
        }
    }
    async function sendCustomerMessage(event) {
        event.preventDefault();
        const message = input.value.trim();
        if ((!message && !pendingFiles.length) || activeMode !== 'messenger') return;
        sendButton.disabled = true;
        setStatus('Đang gửi…');
        try {
            if (pendingFiles.length) {
                const payload = new FormData();
                payload.append('message', message);
                pendingFiles.forEach(file => payload.append('files', file, file.name));
                const response = await fetch(Auth.apiBase() + '/api/chat/messages', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + Auth.getToken() },
                    body: payload
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || result.success === false) throw new Error(result.message || 'Chưa gửi được tin nhắn.');
                pendingFiles.splice(0);
                renderPendingFiles();
            } else {
                await Auth.request('/api/chat/messages', { method: 'POST', json: { message } });
            }
            input.value = '';
            setStatus('');
            await loadCustomerMessages(false);
        } catch (error) {
            setStatus(error.message || 'Chưa gửi được tin nhắn.', true);
        } finally {
            sendButton.disabled = false;
            input.focus();
        }
    }
    const timeNow = () => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    const money = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0) + 'đ';
    const scrollToEnd = () => {
        body.scrollTop = body.scrollHeight;
        requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    };
    // Ảnh tải xong sau khi đã cuộn sẽ làm khung cao thêm: cuộn lại nếu đang ở cuối.
    body.addEventListener('load', event => {
        if (event.target.tagName === 'IMG' && activeMode === 'ai' && body.scrollHeight - body.scrollTop - body.clientHeight < 260) scrollToEnd();
    }, true);

    function clearAiImages() {
        aiImages.splice(0).forEach(item => URL.revokeObjectURL(item.url));
    }
    function renderAiPendingImages(list) {
        aiImages.forEach((item, index) => {
            const chip = make('span', 'store-ai-pending');
            const image = make('img');
            image.src = item.url;
            image.alt = 'Ảnh sẽ gửi số ' + (index + 1);
            const remove = make('button', '', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Bỏ ảnh số ' + (index + 1));
            remove.addEventListener('click', () => {
                URL.revokeObjectURL(item.url);
                aiImages.splice(index, 1);
                renderPendingFiles();
            });
            chip.append(image, remove);
            list.append(chip);
        });
    }
    function loadImageElement(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_invalid')); };
            image.src = url;
        });
    }
    // Ảnh điện thoại thường 3-8 MB: thu nhỏ còn cạnh dài 1280px trước khi gửi.
    async function shrinkImage(file) {
        const image = await loadImageElement(file);
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        if (scale === 1 && file.type === 'image/jpeg' && file.size <= 900 * 1024) return file;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (!blob) throw new Error('image_invalid');
        return new File([blob], (file.name || 'anh').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    async function stageAiImages(files) {
        const images = [...files].filter(file => /^image\/(jpeg|png|webp)$/i.test(file.type));
        if (!images.length) {
            setStatus('Chỉ gửi được ảnh JPG, PNG hoặc WEBP.', true);
            return;
        }
        if (aiImages.length + images.length > AI_MAX_IMAGES) {
            setStatus('Mỗi câu hỏi gửi tối đa ' + AI_MAX_IMAGES + ' ảnh.', true);
            return;
        }
        setStatus('Đang chuẩn bị ảnh…');
        try {
            for (const file of images) {
                const small = await shrinkImage(file);
                aiImages.push({ file: small, url: URL.createObjectURL(small) });
            }
            setStatus('Đã thêm ' + aiImages.length + ' ảnh. Bạn có thể hỏi thêm về ảnh rồi bấm Hỏi.');
        } catch (_) {
            setStatus('Không đọc được ảnh này, bạn thử ảnh khác nhé.', true);
        }
        renderPendingFiles();
        input.focus({ preventScroll: true });
    }
    function renderAi() {
        if (aiHasMessages) return;
        body.replaceChildren();
        const welcome = make('section', 'store-ai-welcome');
        welcome.append(make('strong', '', '✦ Trợ lý mua sắm AI'));
        welcome.append(make('p', '', 'Hỏi cách chọn vợt, giày, phụ kiện, hoặc gửi ảnh (vợt, giày, cước…) để AI nhận diện và gợi ý sản phẩm. AI có thể nhầm; đơn hàng và thanh toán hãy bấm "Nhắn cửa hàng".'));
        body.append(welcome);
        const suggestions = make('div', 'store-ai-suggestions');
        const photo = make('button', 'store-ai-suggestion--photo', '📷 Gửi ảnh để AI tư vấn');
        photo.type = 'button';
        photo.addEventListener('click', () => fileInput.click());
        suggestions.append(photo);
        ['Tư vấn vợt cho người mới, dưới 1 triệu', 'Nên chọn giày cầu lông thế nào?', 'Vợt công thủ toàn diện nào đáng mua?'].forEach(text => {
            const button = make('button', '', text);
            button.type = 'button';
            button.addEventListener('click', () => { input.value = text; form.requestSubmit(); });
            suggestions.append(button);
        });
        body.append(suggestions);
        form.hidden = false;
        input.placeholder = 'Hỏi AI, hoặc dán/kéo ảnh vào đây…';
        sendButton.textContent = 'Hỏi';
        setStatus('');
    }
    function appendAiText(container, text) {
        let list = null;
        String(text || '').split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) { list = null; return; }
            const bullet = trimmed.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
            if (bullet) {
                if (!list) {
                    list = make('ul', 'store-ai-list');
                    container.append(list);
                }
                list.append(make('li', '', bullet[1]));
            } else {
                list = null;
                container.append(make('p', '', trimmed));
            }
        });
    }
    function addAiProducts(container, products) {
        if (!products?.length) return;
        const list = make('div', 'store-ai-products');
        products.forEach(product => {
            const card = make('a', 'store-ai-product');
            card.href = 'chitiet.html?id=' + encodeURIComponent(product.MaSP);
            const media = make('span', 'store-ai-product__media');
            const image = make('img');
            image.src = product.HinhAnh;
            image.alt = product.TenSP || 'Sản phẩm';
            image.loading = 'lazy';
            image.addEventListener('error', () => { image.src = 'HA/cc-removebg-preview.png'; }, { once: true });
            media.append(image);
            if (product.GiaGoc) {
                const percent = Math.round((1 - Number(product.GiaBan) / Number(product.GiaGoc)) * 100);
                if (percent > 0) media.append(make('em', 'store-ai-product__badge', '-' + percent + '%'));
            }
            const info = make('span', 'store-ai-product__info');
            if (product.ThuongHieu) info.append(make('small', 'store-ai-product__brand', product.ThuongHieu));
            info.append(make('strong', '', product.TenSP || 'Sản phẩm'));
            const price = make('span', 'store-ai-product__price', money(product.GiaBan));
            if (product.GiaGoc) price.append(make('s', '', money(product.GiaGoc)));
            info.append(price);
            info.append(make('span', 'store-ai-product__cta' + (product.ConHang ? '' : ' is-out'), product.ConHang ? 'Xem chi tiết →' : 'Tạm hết hàng'));
            card.append(media, info);
            list.append(card);
        });
        container.append(list);
    }
    function showAiSuggestions(items) {
        body.querySelectorAll('.store-ai-followups').forEach(node => node.remove());
        if (!items?.length) return;
        const box = make('div', 'store-ai-suggestions store-ai-followups');
        items.forEach(text => {
            const button = make('button', '', text);
            button.type = 'button';
            button.addEventListener('click', () => {
                if (aiBusy) return;
                input.value = text;
                form.requestSubmit();
            });
            box.append(button);
        });
        body.append(box);
    }
    function addAiQuestion(text, images) {
        const item = make('article', 'store-chat-message is-mine');
        if (images.length) {
            const grid = make('div', 'store-ai-photos store-ai-photos--' + Math.min(images.length, 3));
            images.forEach(entry => {
                const image = make('img');
                image.src = entry.url;
                image.alt = 'Ảnh bạn gửi';
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
    function addAiAnswer(data) {
        const item = make('article', 'store-chat-message store-ai-answer');
        item.append(make('span', 'store-ai-answer__label', '✦ Trợ lý AI'));
        appendAiText(item, data.reply);
        addAiProducts(item, data.products);
        item.append(make('time', '', timeNow()));
        body.append(item);
        showAiSuggestions(data.suggestions);
    }
    function addAiTyping(withImages) {
        const typing = make('div', 'store-chat-message store-ai-typing');
        typing.setAttribute('role', 'status');
        const dots = make('span', 'store-ai-dots');
        dots.append(make('i'), make('i'), make('i'));
        typing.append(dots, make('span', '', withImages ? 'Đang xem ảnh và soạn câu trả lời…' : 'Trợ lý đang trả lời…'));
        body.append(typing);
        return typing;
    }
    async function sendAiPrompt(event) {
        event.preventDefault();
        const question = input.value.trim();
        if ((!question && !aiImages.length) || aiBusy) return;
        if (!aiHasMessages) {
            body.replaceChildren();
            aiHasMessages = true;
        }
        body.querySelectorAll('.store-ai-followups, .store-ai-error').forEach(node => node.remove());
        const images = aiImages.splice(0);
        renderPendingFiles();
        const bubble = addAiQuestion(question, images);
        input.value = '';
        aiBusy = true;
        sendButton.disabled = true;
        const typing = addAiTyping(images.length > 0);
        scrollToEnd();
        setStatus('');
        const payload = new FormData();
        payload.append('message', question);
        payload.append('history', JSON.stringify(aiHistory.slice(-16)));
        images.forEach((entry, index) => payload.append('images', entry.file, entry.file.name || ('anh-' + (index + 1) + '.jpg')));
        try {
            const response = await fetch(Auth.apiBase() + '/api/ai/chat', { method: 'POST', body: payload });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
                const error = new Error(data.message || 'Chưa kết nối được trợ lý AI.');
                error.status = response.status;
                throw error;
            }
            typing.remove();
            addAiAnswer(data);
            const photoNote = images.length ? ' [kèm ' + images.length + ' ảnh]' : '';
            aiHistory.push({ role: 'user', text: (question || 'Gửi ảnh nhờ tư vấn') + photoNote }, { role: 'model', text: data.reply });
        } catch (error) {
            typing.remove();
            bubble.remove();
            input.value = question;
            aiImages.push(...images);
            renderPendingFiles();
            const message = error.status === 429
                ? 'Bạn hỏi hơi nhanh, đợi một chút rồi thử lại nhé.'
                : (error.message && error.status ? error.message : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
            body.append(make('p', 'store-chat-note store-ai-error', message));
            if (body.children.length === 1) aiHasMessages = false;
            setStatus(message, true);
        } finally {
            aiBusy = false;
            sendButton.disabled = false;
            scrollToEnd();
            input.focus({ preventScroll: true });
        }
    }

    widget.querySelector('#storeMessengerLauncher').addEventListener('click', () => setMode('messenger'));
    widget.querySelector('#storeAiLauncher').addEventListener('click', () => setMode('ai'));
    widget.querySelector('#storeChatChooseFile').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', event => {
        const files = [...(event.target.files || [])];
        event.target.value = '';
        if (activeMode === 'ai') stageAiImages(files);
        else stageFiles(files);
    });
    input.addEventListener('paste', event => {
        const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
        if (!files.length || !activeMode) return;
        event.preventDefault();
        if (activeMode === 'ai') stageAiImages(files);
        else stageFiles(files);
    });
    panel.addEventListener('dragover', event => {
        if (activeMode !== 'ai' || !event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        panel.classList.add('is-dragging');
    });
    panel.addEventListener('dragleave', event => {
        if (!panel.contains(event.relatedTarget)) panel.classList.remove('is-dragging');
    });
    panel.addEventListener('drop', event => {
        panel.classList.remove('is-dragging');
        if (activeMode !== 'ai' || !event.dataTransfer?.files?.length) return;
        event.preventDefault();
        stageAiImages(event.dataTransfer.files);
    });
    installEmojiPicker(widget.querySelector('#storeChatEmoji'), widget.querySelector('#storeChatEmojiPicker'), input);
    widget.querySelector('#storeChatRecord').addEventListener('click', event => toggleVoiceRecording(event.currentTarget));
    widget.querySelector('#storeChatResize').addEventListener('click', () => setExpanded(!panel.classList.contains('is-expanded')));
    try { if (localStorage.getItem(EXPAND_KEY) === '1') setExpanded(true); } catch (_) { /* bỏ qua */ }
    widget.querySelector('#storeChatClose').addEventListener('click', () => {
        panel.hidden = true;
        activeMode = null;
        widget.querySelectorAll('.store-chat-launcher').forEach(button => button.setAttribute('aria-expanded', 'false'));
    });
    form.addEventListener('submit', (event) => activeMode === 'ai' ? sendAiPrompt(event) : sendCustomerMessage(event));
    window.addEventListener('badminton:auth-changed', () => {
        lastMessageId = 0;
        if (activeMode === 'messenger') loadCustomerMessages(true);
    });
    window.setInterval(() => {
        if (activeMode === 'messenger' && !document.hidden) loadCustomerMessages(false);
        else if (activeMode === 'messenger' && !Notify()?.isMobileDevice) loadCustomerMessages(false);
    }, 5000);
    // Kiểm tra tin mới khi hộp chat đóng hoặc đang ở chế độ AI.
    window.setInterval(pollUnread, 12000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollUnread(); });
    window.addEventListener('badminton:auth-changed', () => { lastNotifiedId = null; showUnread(0); pollUnread(); });
    window.setTimeout(pollUnread, 1500);
})();
