/**
 * Premium Telegram Mini App
 * Duck Demo Bot Style - Sequential Selection Flow
 */

// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Apply Telegram theme
const applyTheme = () => {
    const theme = tg.themeParams;
    // Override with dark theme for premium look
    document.documentElement.style.setProperty('--tg-theme-bg-color', theme.bg_color || '#0F0F0F');
};

// State Management
const state = {
    selectedCity: null,
    selectedCityName: null,
    selectedProduct: null,
    selectedProductEmoji: null,
    selectedDistrict: null,
    selectedDistrictName: null,
    selectedVariation: null,
    
    cities: [],
    products: [],
    districts: [],
    variations: [],
    allProducts: []
};

// API Base URL
const API_BASE = window.location.origin;

// API Helper
const api = {
    async get(endpoint) {
        const response = await fetch(`${API_BASE}/api${endpoint}`, {
            headers: { 'X-Telegram-Init-Data': tg.initData }
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
        toast.style.animation = 'slideDown var(--transition-normal) reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
    
    tg.HapticFeedback.notificationOccurred(type === 'error' ? 'error' : 'success');
};

// Initialize App
const init = async () => {
    try {
        applyTheme();
        
        // Load cities
        await loadCities();
        
        // Hide loading screen
        document.getElementById('loading-screen').classList.add('hidden');
        
        tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
        console.error('Init error:', error);
        showToast('Failed to load app. Please try again.', 'error');
    }
};

// Load Cities
const loadCities = async () => {
    try {
        const response = await api.get('/cities');
        if (response.success && response.cities) {
            state.cities = response.cities;
            renderCities();
        }
    } catch (error) {
        console.error('Load cities error:', error);
        showToast('Failed to load cities', 'error');
    }
};

// Render Cities
const renderCities = () => {
    const container = document.getElementById('city-list');
    container.innerHTML = '';
    
    state.cities.forEach(city => {
        const btn = document.createElement('button');
        btn.textContent = city.name;
        btn.onclick = () => selectCity(city.id, city.name);
        container.appendChild(btn);
    });
};

// Select City
const selectCity = async (cityId, cityName) => {
    state.selectedCity = cityId;
    state.selectedCityName = cityName;
    
    // Reset downstream selections
    state.selectedProduct = null;
    state.selectedDistrict = null;
    state.selectedVariation = null;
    
    // Update UI
    highlightSelected('city-list', cityName);
    hideSection('district-section');
    hideSection('variation-section');
    hideSection('selected-section');
    hideOrderButton();
    
    // Load products for this city
    await loadProducts(cityId);
    
    tg.HapticFeedback.impactOccurred('light');
};

// Load Products
const loadProducts = async (cityId) => {
    try {
        const response = await api.get(`/products?city=${cityId}`);
        if (response.success && response.products) {
            state.allProducts = response.products;
            
            // Get unique product types
            const uniqueTypes = {};
            response.products.forEach(p => {
                if (!uniqueTypes[p.type]) {
                    uniqueTypes[p.type] = {
                        name: p.type,
                        emoji: p.emoji || '📦'
                    };
                }
            });
            
            state.products = Object.values(uniqueTypes);
            
            if (state.products.length > 0) {
                renderProducts();
                showSection('product-section');
            } else {
                showToast('No products available in this city', 'error');
            }
        }
    } catch (error) {
        console.error('Load products error:', error);
        showToast('Failed to load products', 'error');
    }
};

// Render Products
const renderProducts = () => {
    const container = document.getElementById('product-list');
    container.innerHTML = '';
    
    state.products.forEach(product => {
        const btn = document.createElement('button');
        btn.textContent = `${product.emoji} ${product.name}`;
        btn.onclick = () => selectProduct(product.name, product.emoji);
        container.appendChild(btn);
    });
};

// Select Product
const selectProduct = async (productType, emoji) => {
    state.selectedProduct = productType;
    state.selectedProductEmoji = emoji;
    
    // Reset downstream selections
    state.selectedDistrict = null;
    state.selectedVariation = null;
    
    // Update UI
    highlightSelected('product-list', productType);
    hideSection('variation-section');
    hideSection('selected-section');
    hideOrderButton();
    
    // Load districts for this product in selected city
    await loadDistricts(state.selectedCity, productType);
    
    tg.HapticFeedback.impactOccurred('light');
};

// Load Districts
const loadDistricts = async (cityId, productType) => {
    try {
        // Filter products to get unique districts for this city+product
        const filteredProducts = state.allProducts.filter(p => 
            p.type === productType && p.in_stock > 0
        );
        
        const uniqueDistricts = {};
        filteredProducts.forEach(p => {
            if (!uniqueDistricts[p.district]) {
                uniqueDistricts[p.district] = p.district;
            }
        });
        
        state.districts = Object.values(uniqueDistricts);
        
        if (state.districts.length > 0) {
            renderDistricts();
            showSection('district-section');
        } else {
            showToast('No districts available for this product', 'error');
        }
    } catch (error) {
        console.error('Load districts error:', error);
        showToast('Failed to load districts', 'error');
    }
};

// Render Districts
const renderDistricts = () => {
    const container = document.getElementById('district-list');
    container.innerHTML = '';
    
    state.districts.forEach(district => {
        const btn = document.createElement('button');
        btn.textContent = district;
        btn.onclick = () => selectDistrict(district);
        container.appendChild(btn);
    });
};

// Select District
const selectDistrict = (districtName) => {
    state.selectedDistrict = districtName;
    state.selectedDistrictName = districtName;
    
    // Reset downstream selections
    state.selectedVariation = null;
    
    // Update UI
    highlightSelected('district-list', districtName);
    hideSection('selected-section');
    hideOrderButton();
    
    // Load variations for this city+product+district
    loadVariations(state.selectedCity, state.selectedProduct, districtName);
    
    tg.HapticFeedback.impactOccurred('light');
};

// Load Variations
const loadVariations = (cityId, productType, district) => {
    // Filter products to get variations (different sizes/prices)
    const variations = state.allProducts.filter(p => 
        p.type === productType && 
        p.district === district &&
        p.in_stock > 0
    );
    
    state.variations = variations;
    
    if (variations.length > 0) {
        renderVariations();
        showSection('variation-section');
    } else {
        showToast('No variations available', 'error');
    }
};

// Render Variations
const renderVariations = () => {
    const container = document.getElementById('variation-list');
    container.innerHTML = '';
    
    state.variations.forEach(variation => {
        const btn = document.createElement('button');
        btn.textContent = `${variation.size} — €${variation.price.toFixed(2)}`;
        btn.onclick = () => selectVariation(variation);
        container.appendChild(btn);
    });
};

// Select Variation
const selectVariation = (variation) => {
    state.selectedVariation = variation;
    
    // Update UI
    highlightSelected('variation-list', variation.size);
    
    // Show selected section
    renderSelected();
    showSection('selected-section');
    showOrderButton();
    
    tg.HapticFeedback.impactOccurred('medium');
};

// Render Selected
const renderSelected = () => {
    const container = document.getElementById('selected-details');
    const v = state.selectedVariation;
    
    container.innerHTML = `
        <div class="selected-item">${state.selectedProductEmoji} ${state.selectedProduct} — ${v.size}</div>
        <div class="selected-detail">
            <span>Stock:</span>
            <span>${v.in_stock}</span>
        </div>
        <div class="selected-detail">
            <span>Price:</span>
            <span class="selected-price">€${v.price.toFixed(2)}</span>
        </div>
        <div class="selected-detail">
            <span>City:</span>
            <span>${state.selectedCityName}</span>
        </div>
        <div class="selected-detail">
            <span>District:</span>
            <span>${state.selectedDistrictName}</span>
        </div>
        <div class="selected-description">
            ${state.selectedProductEmoji} ${v.size} • Includes updates for 12 months.
        </div>
    `;
};

// Order Button Click
document.getElementById('order-btn').onclick = () => {
    showConfirmModal();
    tg.HapticFeedback.impactOccurred('heavy');
};

// Show Confirmation Modal
const showConfirmModal = () => {
    const v = state.selectedVariation;
    const modal = document.getElementById('confirm-modal');
    const details = document.getElementById('confirm-details');
    
    details.innerHTML = `
        <div class="confirm-row">
            <span class="confirm-label">${state.selectedCityName} — ${state.selectedDistrictName}</span>
        </div>
        <div class="confirm-row">
            <span class="confirm-label">${state.selectedProductEmoji} ${state.selectedProduct} — ${v.size}</span>
        </div>
        <div class="confirm-row total">
            <span class="confirm-label">Price</span>
            <span class="confirm-value">€${v.price.toFixed(2)}</span>
        </div>
        <div class="confirm-notice">
            Your order will be reserved for 30 minutes after confirmation.
        </div>
    `;
    
    modal.classList.remove('hidden');
};

// Close Confirmation Modal
const closeConfirmModal = () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    tg.HapticFeedback.impactOccurred('light');
};

// Confirm Order
const confirmOrder = async () => {
    try {
        closeConfirmModal();
        showToast('Creating payment...', 'info');
        
        const userId = tg.initDataUnsafe?.user?.id || 0;
        const productId = state.selectedVariation.id;
        
        const response = await api.post('/order', {
            product_id: productId,
            user_id: userId
        });
        
        if (response.success) {
            // Open payment URL
            if (response.payment_url) {
                tg.openLink(response.payment_url);
                showToast('Payment page opened!', 'success');
            } else {
                showToast('Order created! Payment link will be sent to bot.', 'success');
            }
        } else {
            showToast(response.message || 'Order failed', 'error');
        }
    } catch (error) {
        console.error('Confirm order error:', error);
        showToast('Failed to create order', 'error');
    }
};

// UI Helper Functions
const showSection = (sectionId) => {
    document.getElementById(sectionId).classList.remove('hidden');
};

const hideSection = (sectionId) => {
    document.getElementById(sectionId).classList.add('hidden');
};

const showOrderButton = () => {
    document.getElementById('order-btn').classList.remove('hidden');
};

const hideOrderButton = () => {
    document.getElementById('order-btn').classList.add('hidden');
};

const highlightSelected = (containerId, text) => {
    const container = document.getElementById(containerId);
    const buttons = container.querySelectorAll('button');
    
    buttons.forEach(btn => {
        if (btn.textContent.includes(text)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
};

// Initialize on load
window.addEventListener('load', init);

// Make functions globally accessible
window.closeConfirmModal = closeConfirmModal;
window.confirmOrder = confirmOrder;
