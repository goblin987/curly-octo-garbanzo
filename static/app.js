/**
 * Telegram Mini App - Vanilla JavaScript
 * Modern, fast shopping experience
 */

// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Apply Telegram theme
const applyTheme = () => {
    const root = document.documentElement;
    const theme = tg.themeParams;
    
    if (theme.bg_color) root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
    if (theme.text_color) root.style.setProperty('--tg-theme-text-color', theme.text_color);
    if (theme.hint_color) root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
    if (theme.link_color) root.style.setProperty('--tg-theme-link-color', theme.link_color);
    if (theme.button_color) root.style.setProperty('--tg-theme-button-color', theme.button_color);
    if (theme.button_text_color) root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
    if (theme.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
};

// State Management
const state = {
    currentPage: 'shop',
    selectedCity: null,
    selectedDistrict: null,
    selectedType: null,
    products: [],
    basket: [],
    cities: [],
    districts: [],
    productTypes: [],
    userBalance: 0,
    appliedDiscount: null
};

// API Base URL
const API_BASE = window.location.origin;

// API Helper
const api = {
    async get(endpoint) {
        const response = await fetch(`${API_BASE}/api${endpoint}`, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        return response.json();
    },
    
    async post(endpoint, data) {
        const response = await fetch(`${API_BASE}/api${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': tg.initData
            },
            body: JSON.stringify(data)
        });
        return response.json();
    },
    
    async delete(endpoint) {
        const response = await fetch(`${API_BASE}/api${endpoint}`, {
            method: 'DELETE',
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        return response.json();
    }
};

// Toast Notifications
const showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp var(--transition-normal) reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Navigation
const navigateTo = (page) => {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    
    // Show target page
    document.getElementById(`${page}-page`).classList.remove('hidden');
    state.currentPage = page;
    
    // Configure Telegram Back Button
    if (page === 'shop') {
        tg.BackButton.hide();
    } else {
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            if (page === 'basket' || page === 'checkout') {
                navigateTo('shop');
            }
        });
    }
    
    // Update page-specific content
    if (page === 'basket') {
        loadBasket();
    } else if (page === 'checkout') {
        loadCheckout();
    }
    
    tg.HapticFeedback.impactOccurred('light');
};

// Initialize App
const init = async () => {
    try {
        applyTheme();
        
        // Load initial data
        await Promise.all([
            loadCities(),
            loadProductTypes(),
            loadUserBalance()
        ]);
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide loading screen
        document.getElementById('loading-screen').classList.add('hidden');
        
        tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
        console.error('Init error:', error);
        showToast('Failed to load app. Please try again.', 'error');
    }
};

// Setup Event Listeners
const setupEventListeners = () => {
    // City selector
    document.getElementById('city-select').addEventListener('change', (e) => {
        state.selectedCity = e.target.value;
        if (state.selectedCity) {
            loadDistricts(state.selectedCity);
        } else {
            document.getElementById('district-tabs').classList.add('hidden');
            document.getElementById('type-filters').classList.add('hidden');
            document.getElementById('product-grid').innerHTML = '';
        }
    });
    
    // Main Button (for checkout)
    tg.MainButton.onClick(handleMainButtonClick);
};

// Load Cities
const loadCities = async () => {
    try {
        const response = await api.get('/cities');
        if (response.success) {
            state.cities = response.cities;
            renderCitySelector();
        }
    } catch (error) {
        console.error('Load cities error:', error);
    }
};

// Render City Selector
const renderCitySelector = () => {
    const select = document.getElementById('city-select');
    select.innerHTML = '<option value="">Select city...</option>';
    
    state.cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city.id;
        option.textContent = city.name;
        select.appendChild(option);
    });
};

// Load Districts
const loadDistricts = async (cityId) => {
    try {
        const response = await api.get(`/districts/${cityId}`);
        if (response.success) {
            state.districts = response.districts;
            renderDistrictTabs();
        }
    } catch (error) {
        console.error('Load districts error:', error);
    }
};

// Render District Tabs
const renderDistrictTabs = () => {
    const container = document.getElementById('district-tabs');
    container.innerHTML = '';
    
    if (state.districts.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    
    state.districts.forEach(district => {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.textContent = district.name;
        tab.onclick = () => selectDistrict(district.id);
        container.appendChild(tab);
    });
};

// Select District
const selectDistrict = (districtId) => {
    state.selectedDistrict = districtId;
    
    // Update active tab
    document.querySelectorAll('#district-tabs .tab').forEach((tab, index) => {
        tab.classList.toggle('active', state.districts[index].id === districtId);
    });
    
    loadProductTypes();
    tg.HapticFeedback.impactOccurred('light');
};

// Load Product Types
const loadProductTypes = async () => {
    try {
        const response = await api.get('/product-types');
        if (response.success) {
            state.productTypes = response.types;
            renderProductTypeFilters();
            loadProducts(); // Load all products by default
        }
    } catch (error) {
        console.error('Load product types error:', error);
    }
};

// Render Product Type Filters
const renderProductTypeFilters = () => {
    const container = document.getElementById('type-filters');
    container.innerHTML = '';
    
    if (state.productTypes.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    
    // "All" chip
    const allChip = document.createElement('div');
    allChip.className = 'chip active';
    allChip.textContent = 'All';
    allChip.onclick = () => selectProductType(null);
    container.appendChild(allChip);
    
    // Type chips
    state.productTypes.forEach(type => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = `${type.emoji} ${type.name}`;
        chip.onclick = () => selectProductType(type.name);
        container.appendChild(chip);
    });
};

// Select Product Type
const selectProductType = (typeName) => {
    state.selectedType = typeName;
    
    // Update active chip
    document.querySelectorAll('#type-filters .chip').forEach(chip => {
        const isAllChip = chip.textContent === 'All';
        const isActiveChip = typeName === null ? isAllChip : chip.textContent.includes(typeName);
        chip.classList.toggle('active', isActiveChip);
    });
    
    loadProducts();
    tg.HapticFeedback.impactOccurred('light');
};

// Load Products
const loadProducts = async () => {
    try {
        const grid = document.getElementById('product-grid');
        const emptyState = document.getElementById('empty-state');
        
        grid.innerHTML = '<div class="loading-placeholder">Loading products...</div>';
        emptyState.classList.add('hidden');
        
        const params = new URLSearchParams();
        if (state.selectedCity) params.append('city', state.selectedCity);
        if (state.selectedDistrict) params.append('district', state.selectedDistrict);
        if (state.selectedType) params.append('type', state.selectedType);
        if (tg.initDataUnsafe?.user?.id) params.append('user_id', tg.initDataUnsafe.user.id);
        
        const response = await api.get(`/products?${params}`);
        
        if (response.success) {
            state.products = response.products;
            
            if (state.products.length === 0) {
                grid.innerHTML = '';
                emptyState.classList.remove('hidden');
            } else {
                renderProducts();
            }
        }
    } catch (error) {
        console.error('Load products error:', error);
        showToast('Failed to load products', 'error');
    }
};

// Render Products
const renderProducts = () => {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';
    
    state.products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => showProductDetail(product.id);
        
        const priceHTML = product.original_price 
            ? `<span class="product-price-original">€${product.original_price.toFixed(2)}</span>
               <span class="product-price">€${product.price.toFixed(2)}</span>
               <span class="discount-badge">-${product.discount_percent}%</span>`
            : `<span class="product-price">€${product.price.toFixed(2)}</span>`;
        
        card.innerHTML = `
            <div class="product-image-container">
                ${product.has_media 
                    ? `<img src="${API_BASE}/media/${product.id}/thumb.jpg" class="product-image" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div class="product-emoji" style="display:none;">${product.emoji}</div>`
                    : `<div class="product-emoji">${product.emoji}</div>`
                }
                ${product.in_stock === 0 ? '<div class="out-of-stock-badge">OUT OF STOCK</div>' : ''}
            </div>
            <div class="product-info">
                <div class="product-title">${product.emoji} ${product.type}</div>
                <div class="product-size">${product.size}</div>
                <div class="product-price-container">
                    ${priceHTML}
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
};

// Show Product Detail
const showProductDetail = async (productId) => {
    try {
        tg.HapticFeedback.impactOccurred('medium');
        
        const response = await api.get(`/product/${productId}`);
        
        if (response.success) {
            const product = response.product;
            const modal = document.getElementById('product-modal');
            const content = document.getElementById('product-detail-content');
            
            const priceHTML = product.original_price 
                ? `<div class="product-price-container">
                       <span class="product-price-original">€${product.original_price.toFixed(2)}</span>
                       <span class="product-price">€${product.price.toFixed(2)}</span>
                       <span class="discount-badge">-${product.discount_percent}%</span>
                   </div>`
                : `<div class="product-price">€${product.price.toFixed(2)}</div>`;
            
            content.innerHTML = `
                <div class="product-detail">
                    ${product.media && product.media.length > 0
                        ? `<img src="${API_BASE}/media/${product.id}/full.jpg" class="product-detail-image" onerror="this.style.display='none';">`
                        : `<div class="product-image-container"><div class="product-emoji">${product.emoji}</div></div>`
                    }
                    <h2 class="product-detail-title">${product.emoji} ${product.type}</h2>
                    <div class="product-detail-location">📍 ${product.city} - ${product.district}</div>
                    <div class="product-size">${product.size}</div>
                    ${priceHTML}
                    ${product.description ? `<p class="product-detail-description">${product.description}</p>` : ''}
                    <div class="product-detail-actions">
                        <button class="btn-secondary" onclick="closeProductModal()">Close</button>
                        <button class="btn-primary" onclick="addToBasket(${product.id})">Add to Basket 🛒</button>
                    </div>
                </div>
            `;
            
            modal.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Show product detail error:', error);
        showToast('Failed to load product details', 'error');
    }
};

// Close Product Modal
const closeProductModal = () => {
    document.getElementById('product-modal').classList.add('hidden');
    tg.HapticFeedback.impactOccurred('light');
};

// Add to Basket
const addToBasket = async (productId) => {
    try {
        tg.HapticFeedback.notificationOccurred('success');
        showToast('Added to basket!', 'success');
        closeProductModal();
        
        // Refresh basket
        await loadBasket();
        updateBasketBadge();
        
    } catch (error) {
        console.error('Add to basket error:', error);
        showToast('Failed to add to basket', 'error');
    }
};

// Load Basket
const loadBasket = async () => {
    try {
        const response = await api.get('/basket');
        
        if (response.success) {
            state.basket = response.basket;
            renderBasket();
            updateBasketBadge();
        }
    } catch (error) {
        console.error('Load basket error:', error);
    }
};

// Render Basket
const renderBasket = () => {
    const container = document.getElementById('basket-items');
    const emptyState = document.getElementById('empty-basket');
    
    if (state.basket.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        tg.MainButton.hide();
        return;
    }
    
    emptyState.classList.add('hidden');
    container.innerHTML = '';
    
    let subtotal = 0;
    
    state.basket.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'basket-item';
        
        itemEl.innerHTML = `
            <div class="basket-item-image">${item.emoji}</div>
            <div class="basket-item-info">
                <div class="basket-item-title">${item.type}</div>
                <div class="basket-item-location">${item.city} - ${item.district}</div>
            </div>
            <div class="basket-item-price">€${item.price.toFixed(2)}</div>
        `;
        
        container.appendChild(itemEl);
        subtotal += item.price;
    });
    
    // Update totals
    document.getElementById('subtotal').textContent = `€${subtotal.toFixed(2)}`;
    
    if (state.appliedDiscount) {
        document.getElementById('discount-row').classList.remove('hidden');
        document.getElementById('discount-amount').textContent = `-€${state.appliedDiscount.discount_amount.toFixed(2)}`;
        document.getElementById('total').textContent = `€${state.appliedDiscount.final_total.toFixed(2)}`;
    } else {
        document.getElementById('discount-row').classList.add('hidden');
        document.getElementById('total').textContent = `€${subtotal.toFixed(2)}`;
    }
    
    // Show Main Button for checkout
    const total = state.appliedDiscount ? state.appliedDiscount.final_total : subtotal;
    tg.MainButton.setText(`Checkout €${total.toFixed(2)}`);
    tg.MainButton.show();
};

// Update Basket Badge
const updateBasketBadge = () => {
    const fab = document.getElementById('basket-fab');
    const badge = document.getElementById('basket-count');
    
    const count = state.basket.length;
    badge.textContent = count;
    
    if (count > 0) {
        fab.classList.remove('hidden');
    } else {
        fab.classList.add('hidden');
    }
};

// Apply Discount
const applyDiscount = async () => {
    try {
        const input = document.getElementById('discount-input');
        const code = input.value.trim().toUpperCase();
        
        if (!code) {
            showToast('Please enter a discount code', 'error');
            return;
        }
        
        const subtotal = state.basket.reduce((sum, item) => sum + item.price, 0);
        
        const response = await api.post('/discount/validate', {
            code: code,
            total: subtotal
        });
        
        if (response.success && response.valid) {
            state.appliedDiscount = response;
            showToast('Discount applied!', 'success');
            renderBasket();
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            showToast(response.message || 'Invalid discount code', 'error');
            tg.HapticFeedback.notificationOccurred('error');
        }
    } catch (error) {
        console.error('Apply discount error:', error);
        showToast('Failed to apply discount', 'error');
    }
};

// Load User Balance
const loadUserBalance = async () => {
    try {
        const response = await api.get('/user/balance');
        if (response.success) {
            state.userBalance = response.balance;
        }
    } catch (error) {
        console.error('Load balance error:', error);
    }
};

// Load Checkout
const loadCheckout = () => {
    // Update balance display
    document.getElementById('balance-subtitle').textContent = `Balance: €${state.userBalance.toFixed(2)}`;
    
    // Render checkout items
    const container = document.getElementById('checkout-items');
    container.innerHTML = '';
    
    state.basket.forEach(item => {
        const div = document.createElement('div');
        div.className = 'basket-item-title';
        div.textContent = `${item.emoji} ${item.type} - €${item.price.toFixed(2)}`;
        container.appendChild(div);
    });
    
    // Update total
    const total = state.appliedDiscount ? state.appliedDiscount.final_total : state.basket.reduce((sum, item) => sum + item.price, 0);
    document.getElementById('checkout-total').textContent = `€${total.toFixed(2)}`;
};

// Checkout with Balance
const checkoutWithBalance = async () => {
    try {
        tg.HapticFeedback.impactOccurred('heavy');
        showToast('Processing payment with balance...', 'info');
        
        // TODO: Implement actual checkout logic
        // This would call the existing payment.py functions
        
        showToast('Payment processing - this feature will be connected to your existing payment system', 'info');
    } catch (error) {
        console.error('Checkout error:', error);
        showToast('Checkout failed', 'error');
    }
};

// Checkout with Crypto
const checkoutWithCrypto = async () => {
    try {
        tg.HapticFeedback.impactOccurred('heavy');
        showToast('Generating cryptocurrency invoice...', 'info');
        
        // TODO: Implement actual crypto checkout
        // This would call the existing NOWPayments integration
        
        showToast('Crypto payment - this feature will be connected to your existing payment system', 'info');
    } catch (error) {
        console.error('Crypto checkout error:', error);
        showToast('Checkout failed', 'error');
    }
};

// Handle Main Button Click
const handleMainButtonClick = () => {
    if (state.currentPage === 'basket') {
        navigateTo('checkout');
    }
};

// Clear Basket
const clearBasket = async () => {
    try {
        const response = await api.post('/basket/clear');
        
        if (response.success) {
            state.basket = [];
            state.appliedDiscount = null;
            renderBasket();
            updateBasketBadge();
            showToast('Basket cleared', 'success');
        }
    } catch (error) {
        console.error('Clear basket error:', error);
        showToast('Failed to clear basket', 'error');
    }
};

// Initialize on load
window.addEventListener('load', init);

