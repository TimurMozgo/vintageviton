/* ==========================================================================
   1. ИНИЦИАЛИЗАЦИЯ И НАСТРОЙКИ СЕРВИСОВ
   ========================================================================== */
const SUPABASE_URL = 'https://gqkijtqclijcadcofrmd.supabase.co';
const SUPABASE_KEY = 'sb_publishable__hvPxJPc24ccZpx5gWMEiw_Q9XbKoUf'; 

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
   5. ЗАГРУЗКА И РЕНДЕРИНГ ОСТАТКОВ (ВИТРИНА)
   ========================================================================== */
async function loadProducts() {
    if (!productsGrid) return;

    try {
        const { data: products, error: prodError } = await supabaseClient
            .from('products')
            .select('*')
            .order('id', { ascending: false });

        if (prodError) throw prodError;

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
            const productVariants = variants.filter(v => v.product_id === product.id);
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

            // Экранируем строку описания, чтобы не сломать onclick
            const safeDescription = product.description ? product.description.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';

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
                    
                    <button class="template-btn" onclick="useAsTemplate('${product.name.replace(/'/g, "\\'")}', ${product.price}, '${JSON.stringify(product.image_url)}', '${safeDescription}')">
                        ИСПОЛЬЗОВАТЬ КАК ЗАГОТОВКУ
                    </button>
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
    
    // Подтягиваем старое описание в наше новое текстовое поле
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
   7. ОБРАБОТКА ФОРМЫ И ДРОП В БАЗУ (МУЛЬТИЗАГРУЗКА КАРТИНОК + n8n)
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
        
        // Получаем текст из поля Описания
        const description = descriptionTextarea ? descriptionTextarea.value : '';
        
        const imageFileInput = document.getElementById('prod-image-file');
        const imageFiles = imageFileInput ? imageFileInput.files : [];
        let imageUrls = []; 

        try {
            // 7.1. Мультизагрузка фоток в Supabase Storage
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

            // 7.2. Пушим запись в 'products'
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

            // 7.3. Сбор размерной сетки
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

            // 7.4. Отправка полного пакета данных нашему Аудитору в n8n
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

            // ОКНО УСПЕХА
            showStatusModal('УСПЕХ!', 'ДРОП И ВСЕ ОСТАТКИ УСПЕШНО СОХРАНЕНЫ!', true);
            
            // Полный сброс формы и переменных
            form.reset();
            window.currentTemplateImageUrl = null;
            
            if (outerwearBlock && pantsBlock) {
                outerwearBlock.style.display = 'block';
                pantsBlock.style.display = 'none';
            }

        } catch (err) {
            // ОКНО КРАША
            showStatusModal('ОШИБКА ОПЕРАЦИИ', err.message, false);
        }
    });
}


/* ==========================================================================
   8. КАСТОМНЫЕ МОДАЛЬНЫЕ ОКНА (ПЛАШКИ) И АВТОЗАПУСК
   ========================================================================== */
// Функция плавного показа нашего окна
function showStatusModal(title, message, isSuccess = true) {
    const modal = document.getElementById('custom-modal');
    if (!modal) return;
    
    const modalContent = modal.querySelector('.modal-content');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    
    if (modalTitle) modalTitle.textContent = title;
    if (modalMessage) modalMessage.textContent = message;
    
    if (modalContent) {
        modalContent.classList.remove('modal-success', 'modal-error');
        modalContent.classList.add(isSuccess ? 'modal-success' : 'modal-error');
    }
    
    modal.classList.add('active');
}

// Вешаем закрытие окна на кнопку
const modalCloseBtn = document.getElementById('modal-close-btn');
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        const modal = document.getElementById('custom-modal');
        if (modal) modal.classList.remove('active');
    });
}

// Запуск фоновых проверок и отрисовки склада при старте
loadProducts();
checkAdminAccess();