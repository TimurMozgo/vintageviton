/* ==========================================================================
   ОТЛАДЧИК ДЛЯ TELEGRAM MINI APP (ЕСЛИ КОД КРАШНЕТСЯ — ТЫ УВИДИШЬ ALERT)
   ========================================================================== */
window.onerror = function(message, source, lineno, colno, error) {
    alert(`КРАШ СКРИПТА В ТЕЛЕГЕ:\nОшибка: ${message}\nФайл: ${source}\nСтрока: ${lineno}`);
    return false;
};

// ХАРДКОРНЫЙ ПЕРЕХВАТ СЕТЕВЫХ ОШИБОК (Supabase, Базы данных, CORS)
window.addEventListener('unhandledrejection', function (event) {
    const errorReason = event.reason;
    alert(`СЕТЕВОЙ КРАШ (Supabase/Сеть):\nПричина: ${errorReason?.message || errorReason || 'Неизвестная ошибка сети'}`);
});

// Глобальный кэш для товаров, доступный всем окнам и модалкам
window.currentProducts = [];
window.currentTemplateImageUrl = null;
window.currentTemplateDescription = null;

// Глобальный клиент Supabase (инициализируется при загрузке DOM)
let supabaseClient = null;

// Текущий экран склада: 'active' (в наличии) или 'sold' (продано)
window.currentWarehouseTab = 'active';

// 1. ЛОГИКА КНОПКИ "УЗНАТЬ БОЛЬШЕ" — СТАБИЛЬНЫЙ ОВЕРЛЕЙ ДЛЯ ТЕКСТА И БЕЗБАГОВЫЙ ФУЛЛСКРИН
window.openProductModal = function(productId) {
    // Проверка 1: Загружен ли кэш товаров
    if (!window.currentProducts || window.currentProducts.length === 0) {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showAlert("Массив товаров пуст. Дождись полной загрузки витрины.");
        } else {
            alert("Массив товаров пуст. Дождись загрузки витрины.");
        }
        return;
    }

    // Жесткий поиск по ID с приведением к строке и нижнему регистру
    const product = window.currentProducts.find(p => String(p.id).toLowerCase() === String(productId).toLowerCase());
    
    // Проверка 2: Нашелся ли товар на складе
    if (!product) {
        const errorMsg = `Критический сбой: Товар с ID ${productId} не найден на складе! Всего в кэше: ${window.currentProducts.length}`;
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showAlert(errorMsg);
        } else {
            alert(errorMsg);
        }
        return;
    }

    // Ищем элементы структуры модалки в HTML
    const modalEl = document.getElementById('product-modal');
    const carouselEl = document.getElementById('modal-carousel');
    const titleEl = document.getElementById('product-modal-title');
    const priceEl = document.getElementById('modal-price');
    const descEl = document.getElementById('modal-desc');

    // Проверка 3: Проверяем, все ли ID элементов созданы в твоем index.html
    if (!modalEl || !carouselEl || !titleEl || !priceEl || !descEl) {
        let missingElements = [];
        if (!modalEl) missingElements.push('product-modal');
        if (!carouselEl) missingElements.push('modal-carousel');
        if (!titleEl) missingElements.push('product-modal-title');
        if (!priceEl) missingElements.push('modal-price');
        if (!descEl) missingElements.push('modal-desc');

        const htmlError = "Ошибка структуры HTML. Не найдены элементы: " + missingElements.join(', ');
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showAlert(htmlError);
        } else {
            alert(htmlError);
        }
        return;
    }

    // === ЖЕСТКИЙ СБРОС И СТАБИЛИЗАЦИЯ КАРУСЕЛИ ДЛЯ ТЕЛЕГРАМА ===
    carouselEl.scrollLeft = 0; 
    carouselEl.style.display = 'flex';
    carouselEl.style.overflowX = 'auto';
    carouselEl.style.scrollSnapType = 'x mandatory'; 
    carouselEl.style.webkitOverflowScrolling = 'touch'; 
    carouselEl.style.scrollbarWidth = 'none'; 

    // === ФОТКИ: ЧИСТАЯ ГЕНЕРАЦИЯ БЕЗ КОНФЛИКТНЫХ ИНЛАЙН-СТИЛЕЙ ===
    const images = Array.isArray(product.image_url) ? product.image_url : [product.image_url];
    
    carouselEl.innerHTML = images.map(url => `
        <img src="${url}" class="carousel-item" 
             style="scroll-snap-align: start; -webkit-touch-callout: default; pointer-events: auto;" 
             alt="Дроп" onerror="this.src='https://placehold.co/400x400?text=NO+IMAGE'">
    `).join('');

    // === ИДЕАЛЬНЫЙ ФУЛЛСКРИН ДЛЯ ФОТО: СВЕЖИЙ ОБРАБОТЧИК ПРИ КАЖДОМ ОТКРЫТИИ МОДАЛКИ ===
    // Сбрасываем старый таймер, если он завис
    if (carouselEl.clickTimer) {
        clearTimeout(carouselEl.clickTimer);
        carouselEl.clickTimer = null;
    }

    // Вешаем чистый onclick напрямую (он затирает старые листенеры и работает без сбоев)
    carouselEl.onclick = function(e) {
        const clickedImg = e.target.closest('img');
        if (!clickedImg) return;

        // ПРОВЕРКА НА ДВОЙНОЙ ТАП
        if (e.detail === 2) { 
            if (carouselEl.clickTimer) {
                clearTimeout(carouselEl.clickTimer);
                carouselEl.clickTimer = null;
            }
            
            // Создаем независимый оверлей для фуллскрина фото вне карточки
            const fsOverlay = document.createElement('div');
            fsOverlay.id = 'global-fullscreen-overlay';
            fsOverlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: #000000 !important;
                z-index: 999999999 !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                cursor: pointer;
            `;

            const fsImg = document.createElement('img');
            fsImg.src = clickedImg.src;
            fsImg.style.cssText = `
                width: 100vw !important;
                height: 100vh !important;
                object-fit: contain !important;
                touch-action: none !important;
            `;

            fsOverlay.appendChild(fsImg);
            document.body.appendChild(fsOverlay);
            document.body.style.overflow = 'hidden';

            fsOverlay.onclick = function() {
                fsOverlay.remove();
                document.body.style.overflow = '';
            };
            
        } else if (e.detail === 1) {
            // Одиночный тап — листаем картинки по кругу
            carouselEl.clickTimer = setTimeout(() => {
                const imgs = Array.from(carouselEl.querySelectorAll('img'));
                const currentIndex = imgs.indexOf(clickedImg);
                
                if (currentIndex !== -1) {
                    if (currentIndex < imgs.length - 1) {
                        carouselEl.scrollTo({
                            left: carouselEl.offsetWidth * (currentIndex + 1),
                            behavior: 'smooth'
                        });
                    } else {
                        carouselEl.scrollTo({
                            left: 0,
                            behavior: 'smooth'
                        });
                    }
                }
                carouselEl.clickTimer = null; 
            }, 250);
        }
    };

    // === АВТО-ГЕНЕРАЦИЯ ТОЧЕК ДЛЯ СКРОЛЛА КАРТИНOК ===
    let dotsContainer = document.getElementById('modal-dots');
    if (!dotsContainer) {
        dotsContainer = document.createElement('div');
        dotsContainer.id = 'modal-dots';
        dotsContainer.className = 'carousel-dots';
        const wrapper = carouselEl.closest('.carousel-wrapper') || carouselEl;
        wrapper.after(dotsContainer);
    }
    
    dotsContainer.innerHTML = images.map((_, index) => `
        <span class="dot ${index === 0 ? 'active' : ''}"></span>
    `).join('');

    carouselEl.onscroll = () => {
        const scrollIndex = Math.round(carouselEl.scrollLeft / carouselEl.offsetWidth);
        const dots = dotsContainer.querySelectorAll('.dot');
        dots.forEach((dot, idx) => {
            if (idx === scrollIndex) dot.classList.add('active');
            else dot.classList.remove('active');
        });
    };

    // Наполнили заголовок
    titleEl.innerText = product.name;
    
    // === ОПИСАНИЕ: БАЗОВАЯ КОМПАКТНАЯ СТРУКТУРА В КАРТОЧКЕ ===
    const fullText = product.description || 'Описание отсутствует.';
    
    descEl.innerHTML = `
        <div class="desc-wrapper">
            <div class="desc-scroll-box short-view" id="modal-desc-box">${fullText}</div>
            <div class="toggle-desc-btn" id="modal-desc-toggle">Развернуть описание ↓</div>
        </div>
    `;

    // === КРИТИЧЕСКИЙ ФИКС ТАЙМИНГА: СНАЧАЛА ВКЛЮЧАЕМ ВИДИМОСТЬ МОДАЛКИ ===
    modalEl.style.setProperty('display', 'flex', 'important');
    modalEl.classList.add('active'); 

    // === ЛОГИКА ДИНАМИЧЕСКОГО СВЕРХНАДЕЖНОГО ПОЛНОЭКРАННОГО ОПИСАНИЯ ===
    const descBox = document.getElementById('modal-desc-box');
    const descToggle = document.getElementById('modal-desc-toggle');
    
    if (descBox && descToggle) {
        if (descBox.scrollHeight > 80) {
            descToggle.style.display = 'block'; 
            
            descToggle.onclick = function(e) {
                e.stopPropagation(); 

                // Создаем изолированный полноэкранный слой-оверлей
                const textOverlay = document.createElement('div');
                textOverlay.id = 'global-text-fullscreen';
                textOverlay.style.cssText = `
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: #0d0d0d !important;
                    z-index: 999999999 !important;
                    display: flex !important;
                    flex-direction: column !important;
                    box-sizing: border-box !important;
                    padding: 70px 20px 90px 20px !important;
                `;

                // Независимая кнопка копирования в шапке оверлея
                const copyBtn = document.createElement('div');
                copyBtn.innerText = 'КОПИРОВАТЬ';
                copyBtn.style.cssText = `
                    position: absolute !important;
                    top: 15px !important;
                    right: 20px !important;
                    background: rgba(179, 136, 255, 0.1) !important;
                    border: 1px solid rgba(179, 136, 255, 0.4) !important;
                    color: #b388ff !important;
                    padding: 8px 16px !important;
                    font-size: 11px !important;
                    font-family: monospace !important;
                    font-weight: bold !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    z-index: 1000000001 !important;
                    text-transform: uppercase !important;
                `;

                copyBtn.onclick = function(evt) {
                    evt.stopPropagation();
                    navigator.clipboard.writeText(fullText).then(() => {
                        copyBtn.innerText = 'ГОТОВО! ✓';
                        copyBtn.style.color = '#00ff88';
                        copyBtn.style.borderColor = '#00ff88';
                        setTimeout(() => {
                            copyBtn.innerText = 'КОПИРОВАТЬ';
                            copyBtn.style.color = '#b388ff';
                            copyBtn.style.borderColor = 'rgba(179, 136, 255, 0.4)';
                        }, 1500);
                    });
                };

                // Отдельный изолированный контейнер для скроллинга текста
                const scrollContainer = document.createElement('div');
                scrollContainer.style.cssText = `
                    width: 100% !important;
                    height: 100% !important;
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                    color: #ffffff !important;
                    font-size: 15px !important;
                    line-height: 1.6 !important;
                    text-align: left !important;
                    -webkit-overflow-scrolling: touch !important;
                    user-select: text !important;
                    -webkit-user-select: text !important;
                `;
                scrollContainer.innerText = fullText;

                // Независимая кнопка закрытия (СВЕРНУТЬ) в самом низу оверлея
                const closeBtn = document.createElement('div');
                closeBtn.innerText = 'СВЕРНУТЬ ↑';
                closeBtn.style.cssText = `
                    position: absolute !important;
                    bottom: 25px !important;
                    left: 5% !important;
                    width: 90% !important;
                    background: #111111 !important;
                    border: 2px solid #b388ff !important;
                    color: #b388ff !important;
                    border-radius: 8px !important;
                    padding: 14px 0 !important;
                    font-size: 14px !important;
                    font-weight: bold !important;
                    text-align: center !important;
                    cursor: pointer !important;
                    z-index: 1000000001 !important;
                    box-shadow: 0 0 15px rgba(179, 136, 255, 0.4) !important;
                    text-transform: uppercase !important;
                `;

                closeBtn.onclick = function(evt) {
                    evt.stopPropagation();
                    textOverlay.remove();
                    document.body.style.overflow = '';
                };

                // Собираем элементы внутри оверлея
                textOverlay.appendChild(copyBtn);
                textOverlay.appendChild(scrollContainer);
                textOverlay.appendChild(closeBtn);
                document.body.appendChild(textOverlay);

                // Блокируем скролл заднего фона карточки
                document.body.style.overflow = 'hidden';
            };
        } else {
            descToggle.style.display = 'none'; 
        }
    }

    // === ДИНАМИЧЕСКАЯ СЕТКА ВЫБОРА РАЗМЕРОВ ===
    let sizesContainer = document.getElementById('modal-sizes');
    if (!sizesContainer) {
        sizesContainer = document.createElement('div');
        sizesContainer.id = 'modal-sizes';
        sizesContainer.className = 'size-selection-container'; 
        priceEl.before(sizesContainer);
    }

    const availableSizes = product.sizes || ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

    sizesContainer.innerHTML = `
        <div class="size-title" style="font-family: monospace; font-size: 11px; color: #888; font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Выберите размер:</div>
        <div class="size-grid">
            ${availableSizes.map(size => `
                <div class="size-btn" data-size="${size}">${size}</div>
            `).join('')}
        </div>
    `;

    sizesContainer.querySelectorAll('.size-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            sizesContainer.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };
    });

    priceEl.innerText = `${product.price} UAH`;

    const modalContentEl = modalEl.querySelector('.modal-content') || modalEl;
    modalContentEl.onclick = function(event) {
        event.stopPropagation(); 
    };
};

// 2. ЗАКРЫТИЕ МОДАЛКИ ТОВАРA — ПОЛНАЯ СИНХРОНИЗАЦИЯ И СБРОС
window.closeModal = function() {
    const modalEl = document.getElementById('product-modal');
    
    if (modalEl) {
        modalEl.classList.remove('active');
        
        // СЕЙФГАРД: Если закрыли модалку, убираем фуллскрин у картинок, если он был активен
        const activeFullscreenImg = modalEl.querySelector('img.fullscreen-mode');
        if (activeFullscreenImg) {
            activeFullscreenImg.classList.remove('fullscreen-mode');
        }
        
        const descBox = document.getElementById('modal-desc-box');
        const descToggle = document.getElementById('modal-desc-toggle');
        
        if (descBox) {
            descBox.classList.remove('full-view');
            descBox.classList.add('short-view');
            descBox.scrollTop = 0;
        }
        if (descToggle) {
            descToggle.classList.remove('floating-btn');
            descToggle.innerText = 'Развернуть описание ↓';
        }
        
        document.body.style.overflow = '';
        modalEl.style.overflowY = 'auto'; // Возвращаем дефолтный скролл модалки
        
        setTimeout(() => {
            if (modalEl && modalEl.style) {
                modalEl.style.setProperty('display', 'none', 'important');
            }
        }, 200);
    }
};

// 3. ЛОГИКА КНОПКИ "ПРОДАНО" — ИСПРАВЛЕНА ДЛЯ ТЕЛЕГРАМА
window.markAsSold = function(productId) {
    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.showPopup === 'function') {
        window.Telegram.WebApp.showPopup({
            title: 'Аудит склада',
            message: 'Перенести этот товар в архив проданных?',
            buttons: [
                { id: 'yes', type: 'destructive', text: 'Да, продано' },
                { id: 'no', type: 'cancel', text: 'Отмена' }
            ]
        }, function(buttonId) { // Убрали async, сделали обычную функцию
            if (buttonId === 'yes') {
                // Запускаем асинхронную операцию безопасно для Telegram API
                window.executeMarkAsSold(productId).catch(err => {
                    alert('Ошибка внутри операции: ' + err.message);
                });
            }
        });
    } else {
        if (confirm('Перенести в проданные?')) {
            window.executeMarkAsSold(productId).catch(err => {
                alert('Ошибка внутри операции: ' + err.message);
            });
        }
    }
};

// 3.2 ЛОГИКА КНОПКИ "ВЫСТАВИТЬ СНОВА" — ДЛЯ АВТОМАТИЧЕСКОГО КАМБЭКА НА ВИТРИНУ
window.markAsActive = function(productId) {
    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.showPopup === 'function') {
        window.Telegram.WebApp.showPopup({
            title: 'Аудит склада',
            message: 'Вернуть этот товар обратно на витрину в категорию активных?',
            buttons: [
                { id: 'yes', type: 'default', text: 'Да, выставить' },
                { id: 'no', type: 'cancel', text: 'Отмена' }
            ]
        }, function(buttonId) {
            if (buttonId === 'yes') {
                window.executeMarkAsActive(productId).catch(err => {
                    alert('Ошибка восстановления: ' + err.message);
                });
            }
        });
    } else {
        if (confirm('Вернуть товар на витрину?')) {
            window.executeMarkAsActive(productId).catch(err => {
                alert('Ошибка восстановления: ' + err.message);
            });
        }
    }
};

// 4.2 ИСПОЛНЕНИЕ АПДЕЙТА СТАТУСА НА "ACTIVE" В БАЗЕ
window.executeMarkAsActive = async function(productId) {
    if (!supabaseClient) throw new Error("Клиент Supabase не инициализирован");

    const { error } = await supabaseClient
        .from('products')
        .update({ status: 'active' }) // Меняем статус обратно на витрину
        .eq('id', productId);

    if (error) throw error;

    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.showAlert('Товар успешно вернулся на витрину!');
    } else {
        alert('Товар успешно вернулся на витрину!');
    }
    
    window.loadProducts(); // Перерисовываем склад, чтобы карточка исчезла из проданных
};

// 4. ИСПОЛНЕНИЕ АПДЕЙТА СТАТУСА В БАЗЕ
window.executeMarkAsSold = async function(productId) {
    try {
        if (!supabaseClient) throw new Error("Клиент Supabase не инициализирован");

        const { error } = await supabaseClient
            .from('products')
            .update({ status: 'sold' })
            .eq('id', productId);

        if (error) throw error;

        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showAlert('Товар успешно списан!');
        } else {
            alert('Товар успешно списан!');
        }
        
        // Перезапускаем сборку склада
        window.loadProducts(); 
    } catch (err) {
        alert('Ошибка смены статуса: ' + err.message);
    }
};

// 5. РАБОТА С ШАБЛОНАМИ ЗАГOTOВОК
window.useAsTemplate = function(name, price, imageUrlsRaw, descriptionRaw) {
    const adminPanel = document.getElementById('admin-panel');
    const catalogContainer = document.getElementById('store-front');
    
    if (catalogContainer && adminPanel) {
        catalogContainer.style.display = 'none';
        adminPanel.style.display = 'block';
    }

    const nameInput = document.getElementById('prod-name');
    const priceInput = document.getElementById('prod-price');
    const descriptionTextarea = document.getElementById('prod-description'); // ID приведен к HTML-стандарту

    if (nameInput) nameInput.value = name;
    if (priceInput) priceInput.value = price;
    if (descriptionTextarea) descriptionTextarea.value = descriptionRaw || '';
    
    try {
        window.currentTemplateImageUrl = JSON.parse(imageUrlsRaw);
    } catch(e) {
        window.currentTemplateImageUrl = imageUrlsRaw;
    }

    document.querySelectorAll('.size-input').forEach(input => input.value = 0);
    window.showStatusModal('ЗАГОТОВКА', `Шаблон для "${name}" успешно подтянут! Измени остатки и дропай.`, true);
};

// 6. СИСТЕМНЫЕ ВСПЛЫВАЮЩИЕ ОКНА СТАТУСА
window.showStatusModal = function(title, message, isSuccess = true) {
    const modal = document.getElementById('custom-modal');
    if (!modal) {
        alert(`${title} - ${message}`);
        return;
    }
    
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    
    if (modalTitle) modalTitle.textContent = title;
    if (modalMessage) modalMessage.textContent = message;
    
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
        closeBtn.style.background = isSuccess ? '#00e676' : '#e53935';
    }
    
    modal.classList.add('active');
};


/* ==========================================================================
   ОСНОВНОЙ СТАРТ ПРИ ПРОГРУЗКЕ DOM СТРУКТУРЫ В ТЕЛЕГРАМЕ
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {

    const SUPABASE_URL = 'https://gqkijtqclijcadcofrmd.supabase.co';
    const SUPABASE_KEY = 'sb_publishable__hvPxJPc24ccZpx5gWMEiw_Q9XbKoUf'; 

    if (!window.supabase) {
        alert("КРИТИЧЕСКАЯ ОШИБКА: Скрипт Supabase SDK не загружен in index.html!");
        return;
    }

    // Инициализируем глобальный клиент базы данных
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Инициализация Telegram WebApp API
    const tg = window.Telegram.WebApp;
    if (tg) { 
        tg.ready(); 
        tg.expand(); 
    }

    const userTelegramId = tg.initDataUnsafe?.user?.id || 6088315974; 

    // Элементы интерфейса
    const catalogContainer = document.getElementById('store-front');
    const adminPanel = document.getElementById('admin-panel');
    const categorySelect = document.getElementById('prod-category');
    const outerwearBlock = document.getElementById('sizes-outerwear-block');
    const pantsBlock = document.getElementById('sizes-pants-block');
    const descriptionTextarea = document.getElementById('prod-description'); // Исправлен ID

    // Кнопки переключения экранов
    const btnToAdmin = document.getElementById('toggle-to-admin');
    const btnToCatalog = document.getElementById('toggle-to-catalog');

    // Кнопки переключения папок склада (В НАЛИЧИИ / ПРОДАНО)
    const tabActive = document.getElementById('tab-active');
    const tabSold = document.getElementById('tab-sold');

    // --- ДОБАВЛЕНО: ЛОГИКА ТАПА ПО КНОПКАМ-РАЗМЕРАМ ---
    // Находим все карточки размеров и вешаем переключение серого цвета при клике
    document.querySelectorAll('.stock-item').forEach(item => {
        item.addEventListener('click', function() {
            this.classList.toggle('active-size');
        });
    });

    // Навигация (Категории шмота)
    if (categorySelect && outerwearBlock && pantsBlock) {
        categorySelect.addEventListener('change', (e) => {
            if (e.target.value === 'outerwear') {
                outerwearBlock.style.display = 'block';
                pantsBlock.style.display = 'none';
            } else {
                outerwearBlock.style.display = 'none';
                pantsBlock.style.display = 'block';
            }
        });
    }

    // Навигация (Витрина <-> Панель Управления)
    if (btnToAdmin && catalogContainer && adminPanel) {
        btnToAdmin.addEventListener('click', () => { 
            catalogContainer.style.display = 'none'; 
            adminPanel.style.display = 'block'; 
        });
    }

    if (btnToCatalog && catalogContainer && adminPanel) {
        btnToCatalog.addEventListener('click', () => { 
            adminPanel.style.display = 'none'; 
            catalogContainer.style.display = 'block'; 
            window.loadProducts(); 
        });
    }

    // ЛОГИКА ТАБОВ: Слушаем клики по папкам «В наличии» и «Продано»
    if (tabActive && tabSold) {
        tabActive.addEventListener('click', () => {
            window.currentWarehouseTab = 'active'; // Переключаем режим на активные
            tabActive.classList.add('active');     // Зажигаем фиолетовый неон
            tabSold.classList.remove('active');   // Гасим соседнюю кнопку
            window.loadProducts();                // Перезапускаем сборщик карточек
        });

        tabSold.addEventListener('click', () => {
            window.currentWarehouseTab = 'sold';   // Переключаем режим на проданные
            tabSold.classList.add('active');       // Зажигаем фиолетовый неон
            tabActive.classList.remove('active');  // Гасим соседнюю кнопку
            window.loadProducts();                // Перезапускаем сборщик карточек
        });
    }

    // Фейс-контроль доступа к Админке дропов
    async function checkAdminAccess() {
        if (!btnToAdmin) return; 
        if (!tg.initDataUnsafe?.user?.id) {
            btnToAdmin.style.display = 'block';
            return;
        }
        try {
            const { data: admin, error } = await supabaseClient
                .from('admins')
                .select('*')
                .eq('telegram_id', userTelegramId)
                .maybeSingle();

            if (admin) {
                btnToAdmin.style.display = 'block';
            } else {
                btnToAdmin.style.display = 'none';
            }
        } catch (err) { 
            btnToAdmin.style.display = 'block';
        }
    }

    // ГЛАВНЫЙ СБОРЩИК КАРТОЧЕК ДЛЯ СЕТКИ ОСТАТКОВ (С ДИНАМИЧЕСКИМ ФИЛЬТРОМ)
    window.loadProducts = async function() {
        const productsGrid = document.getElementById('products-list');
        if (!productsGrid) return;

        try {
            // Запрашиваем товары, проверяя текущую активную папку
            const { data: products, error: prodError } = await supabaseClient
                .from('products')
                .select('*')
                .eq('status', window.currentWarehouseTab || 'active') // Динамический статус!
                .order('id', { ascending: false });

            if (prodError) throw prodError;

            window.currentProducts = products || [];

            if (!products || products.length === 0) {
                // Умный текст пустой папки
                const emptyText = (window.currentWarehouseTab === 'sold') ? 'АРХИВ ПРОДАННЫХ ПУСТ' : 'СКЛАД ПУСТ';
                productsGrid.innerHTML = `<p class="loading-text">${emptyText}</p>`;
                return;
            }

            const { data: variants, error: varError } = await supabaseClient
                .from('product_variants')
                .select('product_id, stock, size');
                
            if (varError) throw varError;

            productsGrid.innerHTML = '';

            products.forEach(product => {
                try {
                    const productVariants = (variants || []).filter(v => v && String(v.product_id) === String(product.id));
                    const totalStock = productVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
                    
                    const stockStatusLine = productVariants.length > 0 
                        ? productVariants.map(v => `${v.size}: ${v.stock}шт`).join(' | ')
                        : 'Размеры не указаны';

                    // Настройка бэджика статуса шмотки на карточке
                    let statusBadge = '';
                    if ((window.currentWarehouseTab || 'active') === 'active') {
                        // В папке "В НАЛИЧИИ" плашка на картинке больше не нужна — карточка будет чистой
                        statusBadge = ''; 
                    } else {
                        // Плашка показывается ОФИЦИАЛЬНО ТОЛЬКО во вкладке "ПРОДАНО"
                        statusBadge = '<span class="status-badge out-of-stock" style="background: #e53935; border-color: #ff1744;">ПРОДАНО</span>';
                    }

                    const displayImgUrl = Array.isArray(product.image_url) 
                        ? product.image_url[0] 
                        : (product.image_url || 'https://placehold.co/400x400?text=VINTAGE');

                    const card = document.createElement('div');
                    card.className = 'product-card';
                    
                    card.innerHTML = `
                        <div class="product-img-wrapper">
                            ${statusBadge}
                            <img src="${displayImgUrl}" alt="${product.name}" onerror="this.src='https://placehold.co/400x400?text=VINTAGE'">
                        </div>
                        <div class="product-info">
                            <h3 class="product-name">${product.name}</h3>
                            <div class="product-price">${product.price} UAH</div>
                            <div class="stock-info-text">${stockStatusLine}</div>
                            <div class="card-buttons" style="display: flex; gap: 8px; margin-top: 12px; position: relative; z-index: 999;"></div>
                        </div>
                    `;

                    // Кнопка Узнать больше
                    const btnMore = document.createElement('button');
                    btnMore.className = 'btn-more';
                    btnMore.innerText = 'Узнать больше';
                    btnMore.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        
                        window.openProductModal(String(product.id));
                    });

                    const buttonsContainer = card.querySelector('.card-buttons');
                    if (buttonsContainer) {
                        buttonsContainer.appendChild(btnMore);
                        
                        // ЕСЛИ ПАПКА "В НАЛИЧИИ" — вешаем кнопку "Продано"
                        if ((window.currentWarehouseTab || 'active') === 'active') {
                            const btnSold = document.createElement('button');
                            btnSold.className = 'btn-sold';
                            btnSold.innerText = 'Продано';
                            btnSold.addEventListener('click', (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                window.markAsSold(product.id);
                            });
                            buttonsContainer.appendChild(btnSold);
                        } 
                        // ЕСЛИ ПАПКА "ПРОДАНО" — вешаем зелёную кнопку возврата на витрину!
                        else {
                            const btnRestock = document.createElement('button');
                            btnRestock.className = 'btn-sold';
                            btnRestock.innerText = 'Выставить снова';
                            btnRestock.style.background = '#00e676'; // Фирменный зелёный неон
                            btnRestock.style.color = '#000';
                            btnRestock.style.borderColor = '#00e676';
                            btnRestock.addEventListener('click', (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                window.markAsActive(product.id); // Эта функция вернет статус active
                            });
                            buttonsContainer.appendChild(btnRestock);
                        }
                    }

                    productsGrid.appendChild(card);

                } catch (cardError) {
                    console.error("Ошибка отдельной карточки:", cardError.message);
                }
            });

        } catch (err) {
            alert('Глобальная ошибка склада: ' + err.message);
            productsGrid.innerHTML = '<p class="loading-text">ОШИБКА ЗАГРУЗКИ СКЛАДА</p>';
        }
    };

    // ОБРАБОТКА И ОТПРАВКА ФОРМЫ ДРОПА В БАЗУ И N8N
    const form = document.getElementById('add-product-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); 

            const nameInput = document.getElementById('prod-name');
            const priceInput = document.getElementById('prod-price');
            
            if (!nameInput || !priceInput) return;

            const name = nameInput.value;
            const price = parseFloat(priceInput.value);
            const category = categorySelect ? categorySelect.value : 'outerwear';
            const description = descriptionTextarea ? descriptionTextarea.value : '';
            
            const imageFileInput = document.getElementById('prod-image-file');
            const imageFiles = imageFileInput ? imageFileInput.files : [];
            let imageUrls = []; 

            try {
                if (imageFiles && imageFiles.length > 0) {
                    for (let i = 0; i < imageFiles.length; i++) {
                        const file = imageFiles[i];
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${Date.now()}_${i}.${fileExt}`;
                        const filePath = `${fileName}`;

                        const { error: uploadError } = await supabaseClient
                            .storage
                            .from('products')
                            .upload(filePath, file);

                        if (uploadError) throw uploadError;

                        const { data: urlData } = supabaseClient
                            .storage
                            .from('products')
                            .getPublicUrl(filePath);

                        imageUrls.push(urlData.publicUrl);
                    }
                } else if (window.currentTemplateImageUrl) {
                    imageUrls = Array.isArray(window.currentTemplateImageUrl) 
                        ? window.currentTemplateImageUrl 
                        : [window.currentTemplateImageUrl];
                } else {
                    window.showStatusModal('ВНИМАНИЕ', 'Пожалуйста, выберите хотя бы один file фотографии!', false);
                    return;
                }

                // === ИСПРАВЛЕННЫЙ БЛОК ИНСЕРТА ТОВАРA ===
                const { data: productData, error: productError } = await supabaseClient
                    .from('products') // Оставляем строго один раз!
                    .insert([{ 
                        name: name, 
                        price: price, 
                        image_url: imageUrls, 
                        description: description 
                    }])
                    .select()
                    .single();

                if (productError) throw productError;
                const productId = productData.id;

                const activeBlock = category === 'outerwear' ? outerwearBlock : pantsBlock;
                const variantsToInsert = [];

                // --- ИЗМЕНЕНО: СБОРДАННЫХ С НОВЫХ КНОПОК-ПЛАШЕК ---
                if (activeBlock) {
                    // Ищем только те плашки, которые юзер нажал (у которых есть класс .active-size)
                    activeBlock.querySelectorAll('.stock-item.active-size').forEach(item => {
                        const sizeName = item.getAttribute('data-size');
                        
                        variantsToInsert.push({
                            product_id: productId,
                            size: sizeName,
                            color: 'Black',
                            stock: 1 // По умолчанию ставим 1 шт на склад для выбранных размеров
                        });
                    });
                }

                if (variantsToInsert.length > 0) {
                    const { error: variantsError } = await supabaseClient
                        .from('product_variants')
                        .insert(variantsToInsert);

                    if (variantsError) throw variantsError;
                }

                // Логика Аудитора в n8n
                try {
                    const activeSizesText = variantsToInsert.map(v => `${v.size}: ${v.stock}шт`).join(' | ');
                    const N8N_WEBHOOK_URL = 'https://tiktiok.xyz/webhook-test/new-drop'; 

                    await fetch(N8N_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'new_product',
                            product_id: productId, 
                            name: name,
                            price: price,
                            description: description, 
                            images: imageUrls, 
                            sizes: activeSizesText || 'Размеры не указаны',
                            admin_telegram_id: userTelegramId
                        })
                    });
                } catch (n8nErr) {
                    console.error('Ошибка n8n вебхука:', n8nErr.message);
                }

                window.showStatusModal('УСПЕХ!', 'ДРОП И ВСЕ ОСТАТКИ УСПЕШНО СОХРАНЕНЫ!', true);
                
                form.reset();
                window.currentTemplateImageUrl = null;
                
                // --- ДОБАВЛЕНО: СБРОС КНОПОК ПОСЛЕ УСПЕШНОЙ ОТПРАВКИ ---
                document.querySelectorAll('.stock-item').forEach(item => {
                    item.classList.remove('active-size'); // тушим серый цвет у всех кнопок
                });

                if (outerwearBlock && pantsBlock) {
                    outerwearBlock.style.display = 'block';
                    pantsBlock.style.display = 'none';
                }

            } catch (err) {
                window.showStatusModal('ОШИБКА ОПЕРАЦИИ', err.message, false);
            }
        });
    }

    // Слушатель для кнопки закрытия системной модалки статуса
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('custom-modal');
            if (modal) modal.classList.remove('active'); 
        });
    }

    // Запуск процессов
    window.loadProducts();
    checkAdminAccess();

    // ЛОГИКА ЖИВОГО ПОИСКА И ПОДСКАЗОК
    const searchInput = document.getElementById('search-input');
    const suggestionsBox = document.getElementById('search-suggestions');

    if (searchInput && suggestionsBox) {
        
        // 1. ОТСЛЕЖИВАЕМ ВВОД СИМВОЛОВ (ПОДКАЗКИ)
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            // Если в строке пусто — прячем подсказки и сбрасываем фильтр (показываем всё)
            if (!query) {
                suggestionsBox.innerHTML = '';
                suggestionsBox.style.display = 'none';
                filterAndRenderProducts(''); 
                return;
            }

            // Ищем совпадения по названию в нашем загруженном кэше товаров
            const matches = (window.currentProducts || []).filter(product => 
                product.name.toLowerCase().includes(query)
            );

            if (matches.length === 0) {
                suggestionsBox.innerHTML = '<div class="suggestion-item" style="cursor:default;">Ничего не найдено</div>';
                suggestionsBox.style.display = 'block';
                return;
            }

            // Собираем элементы подсказок (показываем максимум 5 штук, чтобы не спамить экран)
            suggestionsBox.innerHTML = matches.slice(0, 5).map(product => `
                <div class="suggestion-item" data-id="${product.id}" data-name="${product.name}">
                    <span>${product.name}</span>
                    <span class="suggestion-price">${product.price} UAH</span>
                </div>
            `).join('');
            
            suggestionsBox.style.display = 'block';

            // Вешаем клик на каждую подсказку
            suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    const selectedName = item.getAttribute('data-name');
                    searchInput.value = selectedName; // Подставляем имя в инпут
                    suggestionsBox.innerHTML = '';    // Прячем подсказки
                    suggestionsBox.style.display = 'none';
                    
                    filterAndRenderProducts(selectedName.toLowerCase().trim()); // Фильтруем витрину
                });
            });
        });

        // 2. ФИЛЬТРАЦИЯ ПРИ НАЖАТИИ ENTER В СТРОКЕ ПОИСКА
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.toLowerCase().trim();
                suggestionsBox.innerHTML = '';
                suggestionsBox.style.display = 'none';
                filterAndRenderProducts(query);
            }
        });

        // Клик мимо поиска закрывает подсказки
        document.addEventListener('click', (e) => {
            if (searchInput && suggestionsBox) {
                if (e.target !== searchInput && e.target !== suggestionsBox) {
                    suggestionsBox.innerHTML = '';
                    suggestionsBox.style.display = 'none'; // Теперь всё чётко!
                }
            }
        });
    }

    // 3. ФУНКЦИЯ ДИНАМИЧЕСКОЙ ФИЛЬТРАЦИИ КАРТОЧЕК НА ЭКРАНЕ
    function filterAndRenderProducts(query) {
        const cards = document.querySelectorAll('.product-card');
        let foundAny = false;

        cards.forEach(card => {
            const productName = card.querySelector('.product-name')?.innerText.toLowerCase() || '';
            
            if (productName.includes(query)) {
                card.style.display = 'block'; // Показываем карточку
                foundAny = true;
            } else {
                card.style.display = 'none';  // Прячем карточку
            }
        });

        // Если скрыли вообще всё, выводим заглушку "Ничего не найдено" в сетку
        let noResultMsg = document.getElementById('search-no-results');
        if (!foundAny && query !== '') {
            if (!noResultMsg) {
                noResultMsg = document.createElement('p');
                noResultMsg.id = 'search-no-results';
                noResultMsg.className = 'loading-text';
                noResultMsg.innerText = 'НЕТ СОВПАДЕНИЙ ПО ЗАПРОСУ';
                document.getElementById('products-list').appendChild(noResultMsg);
            }
        } else {
            if (noResultMsg) noResultMsg.remove();
        }
    }
});