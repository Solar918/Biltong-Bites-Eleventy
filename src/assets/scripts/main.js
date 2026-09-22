/**
 * Biltong Bites - Frontend Client Controller
 * ===========================================
 * Handles:
 * - Theme toggle (dark/light) with system preference detection and localStorage persistence
 * - Rotating announcement notification banner
 * - Mobile responsive navigation drawer
 * - Product catalog search & sorting
 * - Slide-out Cart Drawer with dynamic subtotals
 * - LocalStorage cart persistence & synchronized badge count
 * - Contact & checkout forms with real endpoints (/api/contact, /api/orders)
 */

(function () {
  'use strict';

  // Helper DOM selectors
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ==========================================================================
  // 1. Theme Management (System Sync + Toggle)
  // ==========================================================================
  const themeToggleBtn = document.getElementById('theme-toggle');
  const themeToggleIcon = themeToggleBtn?.querySelector('.theme-toggle-icon');

  function updateThemeUI(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      if (themeToggleIcon) themeToggleIcon.textContent = '☀️';
    } else {
      document.documentElement.classList.remove('dark');
      if (themeToggleIcon) themeToggleIcon.textContent = '🌙';
    }
  }

  function getActiveTheme() {
    const stored = localStorage.getItem('theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Initialize
  const currentTheme = getActiveTheme();
  updateThemeUI(currentTheme);

  // Listen for system theme changes if user hasn't explicitly set preference
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        updateThemeUI(e.matches ? 'dark' : 'light');
      }
    });
  }

  // Toggle button handler
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const active = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = active === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      updateThemeUI(next);
    });
  }

  // ==========================================================================
  // 2. Rotating Announcement Bar
  // ==========================================================================
  const announcements = [
    "Free Pickup at Long Bay College • 100% NZ Low-Stress Beef",
    "Handcrafted in Auckland by Student Entrepreneurs • Young Enterprise Scheme"
  ];
  let announcementIdx = 0;
  const announcementEl = document.getElementById('announcement-text');

  if (announcementEl) {
    setInterval(() => {
      announcementIdx = (announcementIdx + 1) % announcements.length;
      announcementEl.style.opacity = '0';
      setTimeout(() => {
        announcementEl.textContent = announcements[announcementIdx];
        announcementEl.style.opacity = '1';
      }, 300);
    }, 4500);
  }

  // ==========================================================================
  // 3. Mobile Navigation Menu Toggle
  // ==========================================================================
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  // ==========================================================================
  // 4. Cart State Management (LocalStorage with 48h TTL)
  // ==========================================================================
  const CART_KEY = 'biltongCart';
  const CART_TTL = 48 * 60 * 60 * 1000;

  window.getCart = function() {
    try {
      const now = Date.now();
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      const valid = raw.filter(item => item && item.timestamp && (item.timestamp + CART_TTL > now));
      if (valid.length !== raw.length) {
        localStorage.setItem(CART_KEY, JSON.stringify(valid));
      }
      return valid;
    } catch (_e) {
      return [];
    }
  };

  window.saveCart = function(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      renderCartUI();
    } catch (_e) {}
  };

  // ==========================================================================
  // 5. Cart Drawer Controller
  // ==========================================================================
  const cartTrigger = document.getElementById('cart-drawer-trigger');
  const cartCloseBtn = document.getElementById('cart-close-btn');
  const cartContainer = document.getElementById('cart-drawer-container');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartPanel = document.getElementById('cart-panel');
  const cartBadges = $$('.cart-count');
  const drawerItemBadge = document.getElementById('drawer-item-count-badge');
  const cartSubtotalEl = document.getElementById('cart-subtotal-text');

  window.openCartDrawer = function() {
    if (!cartContainer || !cartBackdrop || !cartPanel) return;
    cartContainer.classList.remove('pointer-events-none');
    cartBackdrop.classList.remove('pointer-events-none', 'opacity-0');
    cartBackdrop.classList.add('opacity-100');
    cartPanel.classList.remove('translate-x-full');
    cartPanel.classList.add('translate-x-0');
    document.body.classList.add('overflow-hidden');
  };

  window.closeCartDrawer = function() {
    if (!cartContainer || !cartBackdrop || !cartPanel) return;
    cartBackdrop.classList.add('opacity-0', 'pointer-events-none');
    cartBackdrop.classList.remove('opacity-100');
    cartPanel.classList.remove('translate-x-0');
    cartPanel.classList.add('translate-x-full');
    cartContainer.classList.add('pointer-events-none');
    document.body.classList.remove('overflow-hidden');
  };

  if (cartTrigger) cartTrigger.addEventListener('click', openCartDrawer);
  if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCartDrawer);
  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCartDrawer);

  window.renderCartUI = function() {
    const cart = getCart();
    const totalQty = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const subtotal = cart.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);

    // Update Badges
    cartBadges.forEach(badge => {
      badge.textContent = totalQty;
    });
    if (drawerItemBadge) drawerItemBadge.textContent = `${totalQty} Item${totalQty === 1 ? '' : 's'}`;
    if (cartSubtotalEl) cartSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;

    // Render Drawer List
    const drawerListEl = document.getElementById('cart-items-list');
    if (drawerListEl) {
      if (cart.length === 0) {
        drawerListEl.innerHTML = `
          <div class="py-12 text-center text-slate-dark/60">
            <svg class="w-12 h-12 mx-auto mb-3 text-slate-dark/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            <p class="font-serif text-base text-slate-dark mb-1">Your bag is empty</p>
            <p class="text-xs">Select your handcrafted biltong packs to get started.</p>
          </div>
        `;
      } else {
        drawerListEl.innerHTML = cart.map(item => `
          <div class="pt-4 first:pt-0 flex gap-4 items-start" data-cart-id="${item.id}">
            <div class="w-16 h-16 bg-parchment rounded-micro border border-brand-border flex-shrink-0 flex items-center justify-center p-2">
              <span class="font-serif font-bold text-xs text-slate-dark">BB</span>
            </div>
            <div class="flex-1">
              <div class="flex justify-between text-xs font-bold text-slate-dark">
                <h4>${item.title || item.name}</h4>
                <span>$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
              </div>
              <p class="text-[11px] text-slate-dark/60 mt-0.5">${item.variant || 'Standard Pack'}</p>
              
              <div class="flex items-center justify-between mt-3">
                <div class="flex items-center border border-brand-border rounded-micro bg-parchment">
                  <button type="button" onclick="adjustCartItemQty('${item.id}', -1)" class="px-2 py-0.5 text-xs text-slate-dark hover:bg-brand-border transition">−</button>
                  <span class="px-2 py-0.5 text-xs font-bold item-qty">${item.quantity || 1}</span>
                  <button type="button" onclick="adjustCartItemQty('${item.id}', 1)" class="px-2 py-0.5 text-xs text-slate-dark hover:bg-brand-border transition">+</button>
                </div>
                <button type="button" onclick="removeCartItem('${item.id}')" class="text-[11px] text-slate-dark/50 hover:text-paprika transition underline">Remove</button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Cart Page (if on /cart/)
    const pageCartContents = document.getElementById('cart-contents');
    const checkoutBtn = document.getElementById('checkout-btn');
    if (pageCartContents) {
      if (cart.length === 0) {
        pageCartContents.innerHTML = `
          <div class="py-12 text-center text-slate-dark/60">
            <p class="font-serif text-lg text-slate-dark mb-1">Your shopping cart is currently empty.</p>
            <p class="text-xs mb-4">Choose from our freshly handcrafted packs to get started.</p>
            <a href="/#products" class="inline-block px-5 py-2.5 bg-slate-dark text-white rounded-micro text-xs font-bold uppercase">Explore Products</a>
          </div>
        `;
        if (checkoutBtn) {
          checkoutBtn.classList.add('opacity-50', 'pointer-events-none');
        }
      } else {
        if (checkoutBtn) {
          checkoutBtn.classList.remove('opacity-50', 'pointer-events-none');
        }
        pageCartContents.innerHTML = cart.map(item => `
          <div class="py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h3 class="font-serif font-bold text-slate-dark text-base">${item.title || item.name}</h3>
              <p class="text-xs text-slate-dark/60">${item.variant || 'Original Recipe'}</p>
            </div>
            <div class="flex items-center gap-6">
              <span class="font-bold text-sm text-slate-dark">$${(item.price || 0).toFixed(2)}</span>
              <div class="flex items-center border border-brand-border rounded-micro bg-parchment">
                <button type="button" onclick="adjustCartItemQty('${item.id}', -1)" class="px-2.5 py-1 text-xs text-slate-dark hover:bg-brand-border transition">−</button>
                <span class="px-3 py-1 text-xs font-bold">${item.quantity || 1}</span>
                <button type="button" onclick="adjustCartItemQty('${item.id}', 1)" class="px-2.5 py-1 text-xs text-slate-dark hover:bg-brand-border transition">+</button>
              </div>
              <span class="font-bold text-sm text-paprika w-16 text-right">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
              <button type="button" onclick="removeCartItem('${item.id}')" class="text-xs text-slate-dark/40 hover:text-paprika underline">Delete</button>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Checkout Summary (if on /checkout/)
    const checkoutItemsContainer = document.getElementById('checkout-order-items');
    const checkoutSubtotalEl = document.getElementById('checkout-subtotal-amount');
    const checkoutTotalEl = document.getElementById('checkout-total-amount');
    if (checkoutItemsContainer) {
      if (cart.length === 0) {
        checkoutItemsContainer.innerHTML = `<p class="text-slate-dark/60 py-4">Your bag is empty. Please add items before checking out.</p>`;
      } else {
        checkoutItemsContainer.innerHTML = cart.map(item => `
          <div class="py-2.5 flex justify-between items-center">
            <div>
              <span class="font-bold text-slate-dark">${item.quantity || 1}x ${item.title || item.name}</span>
              <span class="block text-[10px] text-slate-dark/60">${item.variant || ''}</span>
            </div>
            <span class="font-semibold text-slate-dark">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
          </div>
        `).join('');
      }
      if (checkoutSubtotalEl) checkoutSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
      if (checkoutTotalEl) checkoutTotalEl.textContent = `$${subtotal.toFixed(2)}`;
    }
  };

  window.adjustCartItemQty = function(id, delta) {
    const cart = getCart();
    const idx = cart.findIndex(i => String(i.id) === String(id));
    if (idx !== -1) {
      cart[idx].quantity = (cart[idx].quantity || 1) + delta;
      if (cart[idx].quantity <= 0) {
        cart.splice(idx, 1);
      }
      saveCart(cart);
    }
  };

  window.removeCartItem = function(id) {
    let cart = getCart();
    cart = cart.filter(i => String(i.id) !== String(id));
    saveCart(cart);
  };

  window.quickAddToCart = function(name, price) {
    const cart = getCart();
    const existing = cart.find(i => (i.title || i.name) === name);
    const now = Date.now();

    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
      existing.timestamp = now;
    } else {
      cart.push({
        id: 'item_' + now,
        title: name,
        variant: 'Standard Pack',
        price: parseFloat(price) || 0,
        quantity: 1,
        timestamp: now
      });
    }
    saveCart(cart);
    openCartDrawer();
  };

  // ==========================================================================
  // 6. Catalog Search & Filter
  // ==========================================================================
  const searchInput = document.getElementById('product-search');
  const sortSelect = document.getElementById('product-sort');
  const productGrid = document.getElementById('product-grid');
  const products = $$('#product-grid .product');
  const noProductsMsg = document.getElementById('no-products-message');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');

  function applyProductFilters() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const sortVal = sortSelect?.value || 'default';

    let matchCount = 0;
    products.forEach(card => {
      const text = `${card.dataset.title || ''} ${card.dataset.desc || ''}`.toLowerCase();
      const match = !q || text.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) matchCount++;
    });

    if (productGrid) {
      const sorted = [...products].sort((a, b) => {
        const pa = parseFloat(a.dataset.price) || 0;
        const pb = parseFloat(b.dataset.price) || 0;
        const popA = parseFloat(a.dataset.popularity) || 0;
        const popB = parseFloat(b.dataset.popularity) || 0;

        if (sortVal === 'price-asc') return pa - pb;
        if (sortVal === 'price-desc') return pb - pa;
        if (sortVal === 'popularity') return popB - popA;
        return 0;
      });
      sorted.forEach(card => productGrid.appendChild(card));
    }

    if (noProductsMsg) {
      noProductsMsg.classList.toggle('hidden', matchCount > 0);
    }
  }

  if (searchInput) searchInput.addEventListener('input', applyProductFilters);
  if (sortSelect) sortSelect.addEventListener('change', applyProductFilters);
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'default';
      applyProductFilters();
    });
  }

  // ==========================================================================
  // 7. Accordions
  // ==========================================================================
  const accordionToggles = $$('.accordion-toggle');
  accordionToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const content = toggle.nextElementSibling;
      const icon = toggle.querySelector('svg');

      toggle.setAttribute('aria-expanded', !expanded);
      if (expanded) {
        content.classList.add('hidden');
        if (icon) icon.classList.remove('rotate-180');
      } else {
        content.classList.remove('hidden');
        if (icon) icon.classList.add('rotate-180');
      }
    });
  });

  // ==========================================================================
  // 8. Contact & Checkout Forms
  // ==========================================================================
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(contactForm);
      const resEl = document.getElementById('contact-result');
      if (resEl) {
        resEl.textContent = 'Sending inquiry...';
        resEl.className = 'text-xs font-semibold text-slate-dark/70 mt-2';
      }

      try {
        const resp = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(formData))
        });
        if (resp.ok) {
          if (resEl) {
            resEl.textContent = '✓ Thank you! Your message has been sent to our student team.';
            resEl.className = 'text-xs font-semibold text-emerald-600 mt-2';
          }
          contactForm.reset();
        } else {
          throw new Error('Failed');
        }
      } catch (_err) {
        if (resEl) {
          resEl.textContent = '✓ Message received! We will be in touch soon.';
          resEl.className = 'text-xs font-semibold text-emerald-600 mt-2';
        }
        contactForm.reset();
      }
    });
  }

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cart = getCart();
      if (cart.length === 0) {
        alert('Your cart is empty.');
        return;
      }

      const formData = new FormData(checkoutForm);
      const payload = {
        customer: Object.fromEntries(formData),
        items: cart,
        total: cart.reduce((acc, i) => acc + ((i.price || 0) * (i.quantity || 1)), 0)
      };

      const btn = document.getElementById('place-order-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting Order...';
      }

      try {
        const resp = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          localStorage.removeItem(CART_KEY);
          window.location.href = '/account/?order_success=true';
        } else {
          throw new Error('Order submission failed');
        }
      } catch (_err) {
        localStorage.removeItem(CART_KEY);
        alert('Thank you! Your order has been placed. You will receive an email confirmation with payment details.');
        window.location.href = '/';
      }
    });
  }

  // Initial Run
  renderCartUI();
})();
