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
                <button class="store-chat-close" id="storeChatClose" type="button" aria-label="Đóng hộp chat">×</button>
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
            <button class="store-chat-launcher" id="storeMessengerLauncher" type="button" aria-expanded="false" aria-controls="storeChatWindow"><span class="store-chat-launcher__icon" aria-hidden="true">▰</span><span>Nhắn cửa hàng</span></button>
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
    let mediaRecorder = null;
    let recordingStream = null;
    let recordingChunks = [];

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
        widget.querySelector('.store-chat-tools').hidden = mode === 'ai';
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
            (data.messages || []).forEach(message => {
                addMessage(message, message.VaiTroGui !== 'ADMIN');
                lastMessageId = Math.max(lastMessageId, Number(message.MaTinNhan) || 0);
            });
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
    function renderAi() {
        if (aiHasMessages) return;
        body.replaceChildren();
        const welcome = make('section', 'store-ai-welcome');
        welcome.append(make('strong', '', 'Trợ lý mua sắm AI'));
        welcome.append(make('p', '', 'Khung chat đã sẵn sàng. Kết nối AI sẽ được bật sau khi cấu hình API an toàn ở máy chủ; hiện chưa gửi câu hỏi tới dịch vụ AI.'));
        body.append(welcome);
        const suggestions = make('div', 'store-ai-suggestions');
        ['Tư vấn chọn vợt', 'Tìm giày cầu lông', 'Hỏi về giao hàng'].forEach(text => {
            const button = make('button', '', text);
            button.type = 'button';
            button.addEventListener('click', () => { input.value = text; input.focus(); });
            suggestions.append(button);
        });
        body.append(suggestions);
        form.hidden = false;
        input.placeholder = 'Nhập câu hỏi cho AI…';
        sendButton.textContent = 'Hỏi';
        setStatus('Chưa kết nối AI · câu hỏi chưa được gửi đi.');
    }
    function sendAiPrompt(event) {
        event.preventDefault();
        const question = input.value.trim();
        if (!question) return;
        if (!aiHasMessages) {
            body.replaceChildren();
            aiHasMessages = true;
        }
        addMessage({ NoiDung: question, NgayTao: new Date().toISOString() }, true);
        const notice = make('p', 'store-chat-note', 'Câu hỏi đang ở giao diện thử nghiệm, chưa được gửi tới AI vì máy chủ chưa được cấu hình API.');
        body.append(notice);
        input.value = '';
        setStatus('AI chưa kết nối — câu hỏi chưa được xử lý.');
        body.scrollTop = body.scrollHeight;
    }

    widget.querySelector('#storeMessengerLauncher').addEventListener('click', () => setMode('messenger'));
    widget.querySelector('#storeAiLauncher').addEventListener('click', () => setMode('ai'));
    widget.querySelector('#storeChatChooseFile').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', event => { stageFiles(event.target.files || []); event.target.value = ''; });
    installEmojiPicker(widget.querySelector('#storeChatEmoji'), widget.querySelector('#storeChatEmojiPicker'), input);
    widget.querySelector('#storeChatRecord').addEventListener('click', event => toggleVoiceRecording(event.currentTarget));
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
    }, 5000);
})();
