/* Thông báo tin nhắn mới: tiếng "ting" + chấm đỏ/số trên tab trình duyệt.
 *
 * - Máy tính: vẫn kêu khi tab đang mở ở nền hoặc cửa sổ bị thu nhỏ (chỉ cần
 *   chưa đóng hẳn tab).
 * - Điện thoại/máy tính bảng: chỉ kêu khi người dùng đang nhìn trang. Đã thoát
 *   trình duyệt hoặc chuyển sang tab khác thì im lặng.
 * - Trình duyệt chặn phát âm thanh trước lần chạm/bấm đầu tiên trên trang, nên
 *   âm thanh được "mở khóa" ở tương tác đầu tiên.
 */
(function () {
    'use strict';
    if (window.BadmintonChatNotify) return;

    const isMobileDevice = (() => {
        if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
            return navigator.userAgentData.mobile;
        }
        const ua = navigator.userAgent || '';
        if (/Android|iPhone|iPod|iPad|Mobile|IEMobile|Opera Mini/i.test(ua)) return true;
        // iPadOS báo là "Macintosh" nhưng có màn hình cảm ứng.
        return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    })();

    let audioContext = null;
    let lastTingAt = 0;
    let unreadCount = 0;
    let baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');
    let originalIconHref = null;
    let badgeIconUrl = null;
    let badgeIconFor = -1;

    function getAudioContext() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return null;
        if (!audioContext) audioContext = new Context();
        return audioContext;
    }

    function unlockAudio() {
        const context = getAudioContext();
        if (context && context.state === 'suspended') context.resume().catch(() => {});
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
        window.addEventListener(type, unlockAudio, { passive: true, capture: true });
    });

    function shouldPlaySound() {
        if (isMobileDevice) return document.visibilityState === 'visible';
        return true;
    }

    /** Tiếng chuông "ting": hai họa âm sine tắt dần, khoảng 0,9 giây. */
    function ting() {
        if (!shouldPlaySound()) return false;
        const now = Date.now();
        if (now - lastTingAt < 1500) return false; // nhiều tin dồn về cùng lúc chỉ kêu một lần
        const context = getAudioContext();
        if (!context) return false;
        if (context.state === 'suspended') context.resume().catch(() => {});
        lastTingAt = now;
        const start = context.currentTime + 0.01;
        const master = context.createGain();
        master.gain.setValueAtTime(0.0001, start);
        master.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
        master.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
        master.connect(context.destination);
        [[1318.5, 1], [2637, 0.35], [3951, 0.12]].forEach(([frequency, level]) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(level, start);
            oscillator.connect(gain);
            gain.connect(master);
            oscillator.start(start);
            oscillator.stop(start + 0.95);
        });
        return true;
    }

    function iconLink() {
        let link = document.querySelector('link[rel~="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.href = 'favicon.svg';
            document.head.appendChild(link);
        }
        if (originalIconHref === null) originalIconHref = link.getAttribute('href') || 'favicon.svg';
        return link;
    }

    function drawBadgeIcon(count) {
        return new Promise((resolve) => {
            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext('2d');
            const paintDot = () => {
                context.beginPath();
                context.arc(size - 17, 17, 16, 0, Math.PI * 2);
                context.fillStyle = '#ef2b2b';
                context.fill();
                context.lineWidth = 4;
                context.strokeStyle = '#ffffff';
                context.stroke();
                const label = count > 9 ? '9+' : String(count);
                context.fillStyle = '#ffffff';
                context.font = `bold ${label.length > 1 ? 17 : 21}px system-ui, sans-serif`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(label, size - 17, 18);
                resolve(canvas.toDataURL('image/png'));
            };
            const image = new Image();
            image.onload = () => {
                try { context.drawImage(image, 0, 0, size, size); } catch (_) { /* bỏ qua ảnh lỗi */ }
                paintDot();
            };
            image.onerror = paintDot;
            image.src = new URL(originalIconHref || 'favicon.svg', document.baseURI).href;
        });
    }

    async function setUnread(count) {
        const next = Math.max(0, Number(count) || 0);
        unreadCount = next;
        const current = document.title.replace(/^\(\d+\+?\)\s*/, '');
        if (current) baseTitle = current;
        document.title = next ? `(${next > 99 ? '99+' : next}) ${baseTitle}` : baseTitle;
        const link = iconLink();
        if (!next) {
            link.setAttribute('href', originalIconHref);
            badgeIconFor = -1;
            return;
        }
        const key = Math.min(next, 10);
        if (badgeIconFor !== key || !badgeIconUrl) {
            badgeIconUrl = await drawBadgeIcon(next);
            badgeIconFor = key;
        }
        if (unreadCount) link.setAttribute('href', badgeIconUrl);
    }

    window.BadmintonChatNotify = {
        isMobileDevice,
        ting,
        setUnread,
        getUnread: () => unreadCount,
        /** Gọi khi có tin mới: kêu (theo quy tắc thiết bị) và cập nhật số trên tab. */
        notify(count) {
            if (count !== undefined) setUnread(count);
            return ting();
        },
    };
})();
