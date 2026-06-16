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

/* ==========================================================================
   ГЛOБАЛЬНЫЕ ФУНКЦИИ ИНТЕРФЕЙСА (ДОСТУПНЫ ИЗ ЛЮБОЙ ТОЧКИ И КОЛБЭКОВ ТГ)
   ========================================================================== */

// 1. ЛОГИКА КНОПКИ "УЗНАТЬ БОЛЬШЕ"
window.openProductModal = function(productId) {
    if (!window.currentProducts || window.currentProducts.length === 0) {
        alert("Массив товаров пуст. Дождись загрузки витрины.");
        return;
    }

    const product = window.currentProducts.find(p => String(p.id) === String(productId));
    
    if (!product) {
        alert(`Критический сбой: Товар с ID ${productId} не найден на складе!`);
        return;
    }

    const modalEl = document.getElementById('product-modal');
    const carouselEl = document.getElementById('modal-carousel');
    const titleEl = document.getElementById('product-modal-title');
    const priceEl = document.getElementById('modal-price');
    const descEl = document.getElementById('modal-desc');

    if (!modalEl || !carouselEl || !titleEl || !priceEl || !descEl) {
        alert("Ошибка: В HTML не найдены элементы структуры модального окна!");
        return;
    }

    const images = Array.isArray(product.image_url) ? product.image_url : [product.image_url];
    
    carouselEl.innerHTML = images.map(url => `
        <img src="${url}" class="carousel-item" style="flex: 0 0 100%; width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px;" alt="Дроп" onerror="this.src='https://placehold.co/400x400?text=NO+IMAGE'">
    `).join('');

    titleEl.innerText = product.name;
    priceEl.innerText = `${product.price} UAH`;
    descEl.innerText = product.description || 'Описание отсутствует.';

    modalEl.style.display = 'flex';
};

// 2. ЗАКРЫТИЕ МОДАЛКИ Товара
window.closeModal = function() {
    const modalEl = document.getElementById('product-modal');
    if (modalEl) modalEl.style.display = 'none';
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
        alert("КРИТИЧЕСКАЯ ОШИБКА: Скрипт Supabase SDK не загружен в index.html!");
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
                        window.openProductModal(product.id);
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

                const { data: productData, error: productError } = await supabaseClient
                    .from('products')
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

                if (activeBlock) {
                    activeBlock.querySelectorAll('.size-input').forEach(input => {
                        const sizeName = input.getAttribute('data-size');
                        const stockVal = parseInt(input.value) || 0;
                        
                        if (stockVal > 0) {
                            variantsToInsert.push({
                                product_id: productId,
                                size: sizeName,
                                color: 'Black',
                                stock: stockVal
                            });
                        }
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
});