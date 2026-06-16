/* ==========================================================================
   ОТЛАДЧИК ДЛЯ TELEGRAM MINI APP (ЕСЛИ КОД КРАШНЕТСЯ — ТЫ УВИДИШЬ ALERT)
   ========================================================================== */
window.onerror = function(message, source, lineno, colno, error) {
    alert(`КРАШ СКРИПТА В ТЕЛЕГЕ:\nОшибка: ${message}\nФайл: ${source}\nСтрока: ${lineno}`);
    return false;
};

    // ==========================================
    // 1. РЕНДЕР КАРТОЧЕК НА ВИТРИНЕ
    // ==========================================
    function renderProducts(products) {
        const container = document.getElementById('products-list');
        if (!container) return;

        // Сохраняем глобально, чтобы модалка имела доступ к актуальным данным
        window.currentProducts = products; 

        if (!products || products.length === 0) {
            container.innerHTML = '<p class="loading-text">СКЛАД ПУСТ ИЛИ ИДЕТ ЗАГРУЗКА...</p>';
            return;
        }

        container.innerHTML = products.map(product => {
            // Берем первую картинку для превью дропа
            const firstImage = Array.isArray(product.image_url) ? product.image_url[0] : product.image_url;
            const displayImage = firstImage || 'https://placehold.co/400x400?text=NO+IMAGE';

            return `
                <div class="product-card" style="background: #1e1e24; border: 1px solid #2d2d38; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
                    <img src="${displayImage}" alt="${product.name}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px;">
                    <h3 style="margin: 10px 0 5px 0; font-size: 16px; color: #fff;">${product.name}</h3>
                    <div style="color: #00e676; font-weight: bold; margin-bottom: 10px;">${product.price} UAH</div>
                    
                    <button onclick="window.openProductModal('${product.id}')" style="width: 100%; padding: 10px; background: #7c4dff; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Узнать больше</button>
                </div>
            `;
        }).join('');
    }

    // ==========================================
    // 2. ЛОГИКА ОТКРЫТИЯ МОДАЛКИ (С ПОЛНЫМ ДЕБАГОМ)
    // ==========================================
    window.openProductModal = function(productId) {
        console.log("Клик сработал! Ищем товар с ID:", productId); // Увидим в консоли
        
        try {
            if (!window.currentProducts || window.currentProducts.length === 0) {
                alert("Ошибка: База товаров пуста или еще не подгрузилась.");
                return;
            }

            const product = window.currentProducts.find(p => String(p.id) === String(productId));
            
            if (!product) {
                alert(`Товар с ID ${productId} не найден в локальном кэше.`);
                return;
            }

            // Вытягиваем элементы из HTML
            const modalEl = document.getElementById('product-modal');
            const carouselEl = document.getElementById('modal-carousel');
            const titleEl = document.getElementById('product-modal-title'); // Новый айдишник из HTML
            const priceEl = document.getElementById('modal-price');
            const descEl = document.getElementById('modal-desc');

            // Ловим жуков на лету, если HTML опять не совпадает
            if (!modalEl) throw new Error("Нет контейнера 'product-modal'");
            if (!carouselEl) throw new Error("Нет контейнера 'modal-carousel'");
            if (!titleEl) throw new Error("Нет контейнера 'product-modal-title'");
            if (!priceEl) throw new Error("Нет контейнера 'modal-price'");
            if (!descEl) throw new Error("Нет контейнера 'modal-desc'");

            // Рендерим галерею картинок дропа
            const images = Array.isArray(product.image_url) ? product.image_url : [product.image_url];
            carouselEl.innerHTML = images.map(url => `
                <img src="${url}" style="flex: 0 0 100%; width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px;" onerror="this.src='https://placehold.co/400x400?text=NO+IMAGE'">
            `).join('');

            // Заполняем текстовые поля шмотки
            titleEl.innerText = product.name;
            priceEl.innerText = `${product.price} UAH`;
            descEl.innerText = product.description || 'Описание отсутствует.';

            // Открываем модалку на экран
            modalEl.style.display = 'flex';
            console.log("Модальное окно успешно открыто!");

        } catch (error) {
            alert(`Критический стоп логики: ${error.message}`);
        }
    };

    // ==========================================
    // 3. ФУНКЦИЯ ЗАКРЫТИЯ МОДАЛКИ
    // ==========================================
    window.closeModal = function() {
        const modalEl = document.getElementById('product-modal');
        if (modalEl) {
            modalEl.style.display = 'none';
        }
    };

// Ждем, пока Телеграм полностью прогрузит весь HTML-скелет
document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       1. ИНИЦИАЛИЗАЦИЯ И НАСТРОЙКИ СЕРВИСОВ
       ========================================================================== */
    const SUPABASE_URL = 'https://gqkijtqclijcadcofrmd.supabase.co';
    const SUPABASE_KEY = 'sb_publishable__hvPxJPc24ccZpx5gWMEiw_Q9XbKoUf'; 

    if (!window.supabase) {
        alert("КРИТИЧЕСКАЯ ОШИБКА: Скрипт Supabase SDK не загружен в index.html!");
        return;
    }

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Инициализация Telegram WebApp SDK
    const tg = window.Telegram.WebApp;
    if (tg) { 
        tg.ready(); 
        tg.expand(); 
    }

    // Telegram ID текущего пользователя (дефолт для тестов на ПК)
    const userTelegramId = tg.initDataUnsafe?.user?.id || 6088315974; 

    // Глобальные переменные для хранения данных из заготовки
    window.currentTemplateImageUrl = null;
    window.currentTemplateDescription = null;
    window.currentProducts = []; // Инициализируем пустой массив


    /* ==========================================================================
       2. ДОСТУП К DOM ЭЛЕМЕНТАМ ИНТЕРФЕЙСА
       ========================================================================== */
    const catalogContainer = document.getElementById('store-front');
    const adminPanel = document.getElementById('admin-panel');
    const productsGrid = document.getElementById('products-list');

    // Кнопки переключения экранов
    const btnToAdmin = document.getElementById('toggle-to-admin');
    const btnToCatalog = document.getElementById('toggle-to-catalog');

    // Категории, блоки размеров и ОПИСАНИЕ
    const categorySelect = document.getElementById('prod-category');
    const outerwearBlock = document.getElementById('sizes-outerwear-block');
    const pantsBlock = document.getElementById('sizes-pants-block');
    const descriptionTextarea = document.getElementById('product-description');


    /* ==========================================================================
       3. УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ И НАВИГАЦИЯ
       ========================================================================== */
    // Динамическое переключение сеток размеров при смене категории
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

    // Кнопки переключения экранов (Витрина <-> Админка)
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
            loadProducts(); // Обновляем склад при возвращении
        });
    }


    /* ==========================================================================
       4. СЛУЖЕБНЫЕ И ОПЕРАЦИОННЫЕ ФУНКЦИИ СКЛАДА
       ========================================================================== */
    async function checkAdminAccess() {
        if (!btnToAdmin) return; 

        if (!tg.initDataUnsafe?.user?.id) {
            console.log("LOG: Тест на ПК — Фейс-контроль пройден автоматически.");
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
                console.log("LOG: Админ найден в базе Supabase!");
                btnToAdmin.style.display = 'block';
            } else {
                console.log("LOG: Обычный клиент. Прячем админку.");
                btnToAdmin.style.display = 'none';
            }
        } catch (err) { 
            console.error('Ошибка проверки прав в базе:', err.message); 
            btnToAdmin.style.display = 'block';
        }
    }


    /* ==========================================================================
       5. ЗАГРУЗКА И РЕНДЕРИНГ ОСТАТКОВ (ВИТРИНА) - ИСПРАВЛЕННАЯ ВЕРСИЯ
       ========================================================================== */
    async function loadProducts() {
        if (!productsGrid) return;

        try {
            const { data: products, error: prodError } = await supabaseClient
                .from('products')
                .select('*')
                .eq('status', 'active') 
                .order('id', { ascending: false });

            if (prodError) throw prodError;

            // Сохраняем строго массив товаров в глобальный кэш
            window.currentProducts = products || [];

            if (!products || products.length === 0) {
                productsGrid.innerHTML = '<p class="loading-text">СКЛАД ПУСТ</p>';
                return;
            }

            const { data: variants, error: varError } = await supabaseClient
                .from('product_variants')
                .select('product_id, stock, size');
                
            if (varError) throw varError;

            productsGrid.innerHTML = '';

            products.forEach(product => {
                const productVariants = variants.filter(v => String(v.product_id) === String(product.id));
                const totalStock = productVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
                
                const stockStatusLine = productVariants.length > 0 
                    ? productVariants.map(v => `${v.size}: ${v.stock}шт`).join(' | ')
                    : 'Размеры не указаны';

                const isAvailable = totalStock > 0;
                const statusBadge = isAvailable 
                    ? '<span class="status-badge in-stock">В НАЛИЧИИ</span>' 
                    : '<span class="status-badge out-of-stock">РАСПРОДАНО</span>';

                const displayImgUrl = Array.isArray(product.image_url) 
                    ? product.image_url[0] 
                    : product.image_url;

                const card = document.createElement('div');
                card.className = 'product-card';
                
                // Исправлена структура: добавлен закрывающий тег </div> для .product-info
                card.innerHTML = `
                    <div class="product-img-wrapper">
                        ${statusBadge}
                        <img src="${displayImgUrl}" alt="${product.name}" onerror="this.src='https://placehold.co/400x400?text=VINTAGE'">
                    </div>
                    <div class="product-info">
                        <h3 class="product-name">${product.name}</h3>
                        <div class="product-price">${product.price} UAH</div>
                        
                        <div class="stock-info-text">${stockStatusLine}</div>
                        
                        <div class="card-buttons" style="display: flex; gap: 8px; margin-top: 12px;">
                            <button class="btn-more" onclick="window.openProductModal('${product.id}')" style="flex: 1; padding: 10px; background: #5c6bc0; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                                Узнать больше
                            </button>
                            <button class="btn-sold" onclick="window.markAsSold('${product.id}')" style="flex: 1; padding: 10px; background: #e53935; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                                Продано
                            </button>
                        </div>
                    </div>
                `;
                productsGrid.appendChild(card);
            });
        } catch (err) {
            console.error('Ошибка склада:', err.message);
            productsGrid.innerHTML = '<p class="loading-text">ОШИБКА ЗАГРУЗКИ СКЛАДА</p>';
        }
    }

    /* ==========================================================================
       6. РАБОТА С ЗАГОТОВКАМИ (МАГИЯ ШАБЛОНОВ)
       ========================================================================== */
    window.useAsTemplate = function(name, price, imageUrlsRaw, descriptionRaw) {
        if (catalogContainer && adminPanel) {
            catalogContainer.style.display = 'none';
            adminPanel.style.display = 'block';
        }

        const nameInput = document.getElementById('prod-name');
        const priceInput = document.getElementById('prod-price');

        if (nameInput) nameInput.value = name;
        if (priceInput) priceInput.value = price;
        
        if (descriptionTextarea) {
            descriptionTextarea.value = descriptionRaw || '';
        }
        
        try {
            window.currentTemplateImageUrl = JSON.parse(imageUrlsRaw);
        } catch(e) {
            window.currentTemplateImageUrl = imageUrlsRaw;
        }

        const sizeInputs = document.querySelectorAll('.size-input');
        sizeInputs.forEach(input => input.value = 0);

        showStatusModal('ЗАГОТОВКА', `Шаблон для "${name}" успешно подтянут! Измени остатки и дропай.`, true);
    };


    /* ==========================================================================
       7. ОБРАБОТКА ФОРМЫ И ДРОП В БАЗУ
       ========================================================================== */
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

                        const { data: uploadData, error: uploadError } = await supabaseClient
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
                    showStatusModal('ВНИМАНИЕ', 'Пожалуйста, выберите хотя бы один файл фотографии!', false);
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
                    const inputs = activeBlock.querySelectorAll('.size-input');
                    inputs.forEach(input => {
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

                try {
                    const activeSizesText = variantsToInsert
                        .map(v => `${v.size}: ${v.stock}шт`)
                        .join(' | ');

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
                    console.log('Пакет успешно доставлен Аудитору в n8n!');
                } catch (n8nErr) {
                    console.error('Ошибка n8n:', n8nErr.message);
                }

                showStatusModal('УСПЕХ!', 'ДРОП И ВСЕ ОСТАТКИ УСПЕШНО СОХРАНЕНЫ!', true);
                
                form.reset();
                window.currentTemplateImageUrl = null;
                
                if (outerwearBlock && pantsBlock) {
                    outerwearBlock.style.display = 'block';
                    pantsBlock.style.display = 'none';
                }

            } catch (err) {
                showStatusModal('ОШИБКА ОПЕРАЦИИ', err.message, false);
            }
        });
    }


    /* ==========================================================================
       8. ВСПЛЫВАЮЩИЕ ОКНА, ДЕТАЛИ И ЭКСПОРТ ДЛЯ ИНТЕРФЕЙСА
       ========================================================================== */
    function showStatusModal(title, message, isSuccess = true) {
        const modal = document.getElementById('custom-modal');
        if (!modal) {
            alert(`${title} - ${message}`);
            return;
        }
        
        const modalContent = modal.querySelector('.modal-content');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        
        if (modalTitle) modalTitle.textContent = title;
        if (modalMessage) modalMessage.textContent = message;
        
        if (modalContent) {
            modalContent.classList.remove('modal-success', 'modal-error');
            document.getElementById('modal-close-btn').style.background = isSuccess ? '#00e676' : '#e53935';
        }
        
        modal.classList.add('active');
    }

    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('custom-modal');
            if (modal) modal.remove();
        });
    }

    // ЛОГИКА КНОПКИ "ПРОДАНО" (Экспортируем в window)
    window.markAsSold = function(productId) {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showPopup({
                title: 'Аудит склада',
                message: 'Перенести этот товар в архив проданных?',
                buttons: [
                    { id: 'yes', type: 'destructive', text: 'Да, продано' },
                    { id: 'no', type: 'cancel', text: 'Отмена' }
                ]
            }, async (buttonId) => {
                if (buttonId === 'yes') {
                    await executeMarkAsSold(productId);
                }
            });
        } else {
            if (confirm('Перенести в проданные?')) {
                executeMarkAsSold(productId);
            }
        }
    };

    async function executeMarkAsSold(productId) {
        try {
            const { error } = await supabaseClient
                .from('products')
                .update({ status: 'sold' })
                .eq('id', productId);

            if (error) throw error;

            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.showAlert('Товар успешно списан!');
            }
            loadProducts(); 
        } catch (err) {
            alert('Ошибка смены статуса: ' + err.message);
        }
    }

    // ЛОГИКА КНОПКИ "УЗНАТЬ БОЛЬШЕ" (Экспортируем в window + убираем жесткое сравнение)
    window.openProductModal = function(productId) {
        if (!window.currentProducts || window.currentProducts.length === 0) {
            alert("Массив товаров пуст. Дождись загрузки витрины.");
            return;
        }

        // Кастуем оба ID к строке String(), чтобы избежать несовпадения типов int и string!
        const product = window.currentProducts.find(p => String(p.id) === String(productId));
        
        if (!product) {
            alert(`Критический сбой: Товар с ID ${productId} не найден на складе!`);
            return;
        }

        const images = Array.isArray(product.image_url) ? product.image_url : [product.image_url];
        
        const carouselHtml = images.map(url => `
            <img src="${url}" class="carousel-item" style="flex: 0 0 100%; width: 100%; max-height: 280px; object-fit: cover; border-radius: 12px;" alt="Дроп" onerror="this.src='https://placehold.co/400x400?text=NO+IMAGE'">
        `).join('');

        // Набиваем уникальные элементы данными
        document.getElementById('modal-carousel').innerHTML = carouselHtml;
        document.getElementById('product-modal-title').innerText = product.name;
        document.getElementById('modal-price').innerText = `${product.price} UAH`;
        document.getElementById('modal-desc').innerText = product.description || 'Описание отсутствует.';

        document.getElementById('product-modal').style.display = 'flex';
    };

    window.closeModal = function() {
        document.getElementById('product-modal').style.display = 'none';
    };

    // Автозапуск
    loadProducts();
    checkAdminAccess();
});