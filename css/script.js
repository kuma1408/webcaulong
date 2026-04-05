// Thay đổi hình ảnh chính khi nhấn vào hình nhỏ
function changeMainImage(thumbnail) {
    const mainImage = document.getElementById("mainProductImage");
    mainImage.src = thumbnail.src;
    mainImage.alt = thumbnail.alt;
}

// Cấu hình Swiper
const swiper = new Swiper('.swiper-container', {
    slidesPerView: 4,
    spaceBetween: 10,
    navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
    },
});
