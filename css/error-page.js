/* Nút thử lại của trang 500: tách khỏi HTML để không cần inline script. */
(function () {
    'use strict';

    const retryButton = document.getElementById('retryButton');
    if (!retryButton) return;

    retryButton.addEventListener('click', function () {
        retryButton.disabled = true;
        retryButton.textContent = 'Đang thử lại…';
        window.location.reload();
    });
}());
