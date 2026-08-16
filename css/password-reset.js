(function () {
    'use strict';

    const page = document.body.dataset.passwordPage;
    const status = document.getElementById('passwordResetStatus');
    const setStatus = (message = '', success = false) => {
        status.textContent = message;
        status.classList.toggle('is-success', success);
    };
    const setBusy = (button, busy, label) => {
        if (!button.dataset.label) button.dataset.label = button.querySelector('span')?.textContent || button.textContent;
        button.disabled = busy;
        const text = button.querySelector('span');
        if (text) text.textContent = busy ? label : button.dataset.label;
    };
    const request = async (path, payload) => {
        const response = await fetch(`${window.API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
        return data;
    };

    document.querySelectorAll('[data-reset-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.resetToggle);
            const visible = input.type === 'text';
            input.type = visible ? 'password' : 'text';
            button.textContent = visible ? 'Hiện' : 'Ẩn';
        });
    });

    if (page === 'forgot') {
        const form = document.getElementById('forgotPasswordForm');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            setStatus();
            const email = document.getElementById('forgotEmail').value.trim();
            const error = document.getElementById('forgotEmailError');
            error.textContent = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Vui lòng nhập email hợp lệ.';
            if (error.textContent) return;
            const button = document.getElementById('forgotPasswordSubmit');
            setBusy(button, true, 'Đang gửi…');
            try {
                const data = await request('/api/quen-mat-khau', { email });
                form.reset();
                setStatus(data.message, true);
            } catch (errorRequest) {
                setStatus(errorRequest.message);
            } finally {
                setBusy(button, false, '');
            }
        });
    }

    if (page === 'reset') {
        const token = new URLSearchParams(window.location.search).get('token') || '';
        const form = document.getElementById('resetPasswordForm');
        if (token.length < 40) {
            setStatus('Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu token.');
            document.getElementById('resetPasswordSubmit').disabled = true;
        }
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            setStatus();
            const password = document.getElementById('resetPassword').value;
            const confirm = document.getElementById('resetPasswordConfirm').value;
            document.getElementById('resetPasswordError').textContent = password.length >= 8 && /[A-Za-zÀ-ỹ]/.test(password) && /\d/.test(password) ? '' : 'Mật khẩu cần ít nhất 8 ký tự, có chữ và số.';
            document.getElementById('resetPasswordConfirmError').textContent = password === confirm ? '' : 'Mật khẩu nhập lại chưa khớp.';
            if (document.querySelector('.field__error:not(:empty)')) return;
            const button = document.getElementById('resetPasswordSubmit');
            setBusy(button, true, 'Đang lưu…');
            try {
                const data = await request('/api/dat-lai-mat-khau', { token, password });
                form.reset();
                setStatus(data.message, true);
                window.setTimeout(() => window.location.assign('dangnhap.html'), 1800);
            } catch (errorRequest) {
                setStatus(errorRequest.message);
            } finally {
                setBusy(button, false, '');
            }
        });
    }
}());
