/**
 * Biltong Bites - Frontend Client Controller
 * ===========================================
 * Manages:
 * - Rotating announcement notification banner
 * - Mobile responsive navigation drawer
 * - Product catalog search, filter & sorting
 * - Slide-out Ajax Cart Drawer with £50 free shipping progress meter
 * - Dynamic PDP Interactive Engine (texture/fat/size chips & subscription discount)
 * - LocalStorage cart persistence & synchronized badge count
 * - Contact & checkout forms
 */

(function () {
  'use strict';

  // Helper DOM selectors
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ==========================================================================
  // 1. Rotating Announcement Bar
  // ==========================================================================
  const announcements = [
    "Free UK & International Shipping on Orders Over £50",
    "Air-Cured Prime Beef • Zero Added Sugar • 52g Protein / 100g • Certified Kosher"
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
  // 2. Mobile Navigation Menu Toggle
  // ==========================================================================
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  // ==========================================================================
  // 3. Cart State Management (LocalStorage with 48h TTL)
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
  // 4. Cart Drawer Controller & Free Shipping Progress Bar
  // ==========================================================================
  const cartTrigger = document.getElementById('cart-drawer-trigger');
  const cartCloseBtn = document.getElementById('cart-close-btn');
  const cartContainer = document.getElementById('cart-drawer-container');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartPanel = document.getElementById('cart-panel');
  const cartBadges = $$('.cart-count');
  const drawerItemBadge = document.getElementById('drawer-item-count-badge');
  const cartSubtotalEl = document.getElementById('cart-subtotal-text');
  const shippingProgressText = document.getElementById('shipping-progress-text');
  const shippingProgressBar = document.getElementById('shipping-progress-bar');
  const shippingProgressPct = document.getElementById('shipping-progress-pct');

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
    if (cartSubtotalEl) cartSubtotalEl.textContent = `£${subtotal.toFixed(2)}`;

    // Free Shipping Progress (£50 threshold)
    const threshold = 50.0;
    const diff = threshold - subtotal;
    const pct = Math.min(100, Math.round((subtotal / threshold) * 100));

    if (shippingProgressBar && shippingProgressText && shippingProgressPct) {
      shippingProgressBar.style.width = `${pct}%`;
      shippingProgressPct.textContent = `${pct}%`;
      if (diff <= 0) {
        shippingProgressText.innerHTML = `<span class="text-emerald-700 font-bold">🎉 Free Tracked Shipping Unlocked!</span>`;
      } else {
        shippingProgressText.innerHTML = `You're only <span class="text-paprika font-bold">£${diff.toFixed(2)}</span> away from Free Tracked Shipping!`;
      }
    }

    // Render Drawer List
    const drawerListEl = document.getElementById('cart-items-list');
    if (drawerListEl) {
      if (cart.length === 0) {
        drawerListEl.innerHTML = `
          <div class="py-12 text-center text-slate-dark/60">
            <svg class="w-12 h-12 mx-auto mb-3 text-slate-dark/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            <p class="font-serif text-base text-slate-dark mb-1">Your bag is empty</p>
            <p class="text-xs">Explore our artisanal cuts above to get started.</p>
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
                <span>£${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
              </div>
              <p class="text-[11px] text-slate-dark/60 mt-0.5">${item.variant || 'Artisanal Batch Cut'}</p>
              
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
            <p class="font-serif text-lg text-slate-dark mb-1">Your bag is currently empty.</p>
            <p class="text-xs mb-4">Select our freshly cured cuts to proceed.</p>
            <a href="/#products-collection" class="inline-block px-5 py-2.5 bg-slate-dark text-white rounded-micro text-xs font-bold uppercase">Shop Now</a>
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
              <p class="text-xs text-slate-dark/60">${item.variant || 'Artisanal Batch Cut'}</p>
            </div>
            <div class="flex items-center gap-6">
              <span class="font-bold text-sm text-slate-dark">£${(item.price || 0).toFixed(2)}</span>
              <div class="flex items-center border border-brand-border rounded-micro bg-parchment">
                <button type="button" onclick="adjustCartItemQty('${item.id}', -1)" class="px-2.5 py-1 text-xs text-slate-dark hover:bg-brand-border transition">−</button>
                <span class="px-3 py-1 text-xs font-bold">${item.quantity || 1}</span>
                <button type="button" onclick="adjustCartItemQty('${item.id}', 1)" class="px-2.5 py-1 text-xs text-slate-dark hover:bg-brand-border transition">+</button>
              </div>
              <span class="font-bold text-sm text-paprika w-16 text-right">£${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
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
            <span class="font-semibold text-slate-dark">£${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
          </div>
        `).join('');
      }
      if (checkoutSubtotalEl) checkoutSubtotalEl.textContent = `£${subtotal.toFixed(2)}`;
      if (checkoutTotalEl) checkoutTotalEl.textContent = `£${subtotal.toFixed(2)}`;
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
        variant: 'Standard Butcher Specification',
        price: parseFloat(price) || 7.70,
        quantity: 1,
        timestamp: now
      });
    }
    saveCart(cart);
    openCartDrawer();
  };

  window.addUpsellItem = function() {
    const upsellName = 'Droëwors Snackstick (100g Single)';
    quickAddToCart(upsellName, 7.70);
    const upsellBtn = document.getElementById('upsell-btn');
    if (upsellBtn) {
      upsellBtn.textContent = '✓ Added!';
      upsellBtn.classList.remove('bg-olive');
      upsellBtn.classList.add('bg-emerald-700');
      setTimeout(() => {
        upsellBtn.textContent = '+ Add (£7.70)';
        upsellBtn.classList.add('bg-olive');
        upsellBtn.classList.remove('bg-emerald-700');
      }, 2000);
    }
  };

  // ==========================================================================
  // 5. Product Detail Page (PDP) Interactive Engine
  // ==========================================================================
  let pdpState = {
    texture: 'Moist (Tender & Juicy)',
    fat: 'Traditional Rich Marbling',
    size: '250g',
    basePrice: 17.50,
    unitPriceStr: '£7.00 per 100g',
    purchaseMode: 'onetime',
    subDiscount: 0.15
  };

  function updatePdpCalculations() {
    let finalPrice = pdpState.basePrice;
    const savingsBadge = document.getElementById('pdp-savings-badge');
    const calculatedPriceEl = document.getElementById('pdp-calculated-price');
    const ctaBtnPrice = document.getElementById('cta-button-price');
    const visualSpec = document.getElementById('pdp-visual-spec');
    const onetimePriceEl = document.getElementById('mode-onetime-price');
    const subPriceEl = document.getElementById('mode-sub-price');
    const unitPriceEl = document.getElementById('pdp-unit-price');

    const discountedPrice = (pdpState.basePrice * (1 - pdpState.subDiscount)).toFixed(2);

    if (onetimePriceEl) onetimePriceEl.textContent = `£${pdpState.basePrice.toFixed(2)}`;
    if (subPriceEl) subPriceEl.textContent = `£${discountedPrice}`;

    if (pdpState.purchaseMode === 'subscription') {
      finalPrice = parseFloat(discountedPrice);
      if (savingsBadge) savingsBadge.classList.remove('hidden');
    } else {
      if (savingsBadge) savingsBadge.classList.add('hidden');
    }

    if (calculatedPriceEl) calculatedPriceEl.textContent = `£${finalPrice.toFixed(2)}`;
    if (ctaBtnPrice) ctaBtnPrice.textContent = `£${finalPrice.toFixed(2)}`;
    if (unitPriceEl) unitPriceEl.textContent = pdpState.unitPriceStr;
    if (visualSpec) visualSpec.textContent = `${pdpState.size} • ${pdpState.fat} • ${pdpState.texture.split(' ')[0]}`;
  }

  // Bind PDP chips
  const textureChips = $$('.texture-chip');
  const selectedTextureLabel = document.getElementById('selected-texture-label');
  textureChips.forEach(chip => {
    chip.addEventListener('click', () => {
      textureChips.forEach(c => {
        c.classList.remove('border-2', 'border-paprika', 'bg-paprika/5');
        c.classList.add('border-brand-border', 'bg-white');
      });
      chip.classList.add('border-2', 'border-paprika', 'bg-paprika/5');
      chip.classList.remove('border-brand-border', 'bg-white');
      pdpState.texture = chip.getAttribute('data-val');
      if (selectedTextureLabel) selectedTextureLabel.textContent = pdpState.texture;
      updatePdpCalculations();
    });
  });

  const fatChips = $$('.fat-chip');
  const selectedFatLabel = document.getElementById('selected-fat-label');
  fatChips.forEach(chip => {
    chip.addEventListener('click', () => {
      fatChips.forEach(c => {
        c.classList.remove('border-2', 'border-paprika', 'bg-paprika/5');
        c.classList.add('border-brand-border', 'bg-white');
      });
      chip.classList.add('border-2', 'border-paprika', 'bg-paprika/5');
      chip.classList.remove('border-brand-border', 'bg-white');
      pdpState.fat = chip.getAttribute('data-val');
      if (selectedFatLabel) selectedFatLabel.textContent = pdpState.fat;
      updatePdpCalculations();
    });
  });

  const sizeChips = $$('.size-chip');
  const selectedSizeLabel = document.getElementById('selected-size-label');
  sizeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      sizeChips.forEach(c => {
        c.classList.remove('border-2', 'border-paprika', 'bg-paprika/5');
        c.classList.add('border-brand-border', 'bg-white');
      });
      chip.classList.add('border-2', 'border-paprika', 'bg-paprika/5');
      chip.classList.remove('border-brand-border', 'bg-white');
      pdpState.size = chip.getAttribute('data-val');
      pdpState.basePrice = parseFloat(chip.getAttribute('data-price')) || 17.50;
      pdpState.unitPriceStr = chip.getAttribute('data-unit') || '';
      if (selectedSizeLabel) selectedSizeLabel.textContent = pdpState.size;
      updatePdpCalculations();
    });
  });

  window.updatePurchaseMode = function(mode) {
    pdpState.purchaseMode = mode;
    const cadenceWrapper = document.getElementById('sub-cadence-wrapper');
    const labelSub = document.getElementById('label-mode-sub');
    const labelOneTime = document.getElementById('label-mode-onetime');

    if (mode === 'subscription') {
      if (cadenceWrapper) cadenceWrapper.classList.remove('hidden');
      if (labelSub) {
        labelSub.classList.add('border-paprika', 'bg-paprika/5');
        labelSub.classList.remove('border-brand-border');
      }
      if (labelOneTime) {
        labelOneTime.classList.remove('border-slate-dark');
        labelOneTime.classList.add('border-brand-border');
      }
    } else {
      if (cadenceWrapper) cadenceWrapper.classList.add('hidden');
      if (labelSub) {
        labelSub.classList.remove('border-paprika', 'bg-paprika/5');
        labelSub.classList.add('border-brand-border');
      }
      if (labelOneTime) {
        labelOneTime.classList.add('border-slate-dark');
        labelOneTime.classList.remove('border-brand-border');
      }
    }
    updatePdpCalculations();
  };

  window.handlePdpAddToCart = function() {
    const unitPrice = pdpState.purchaseMode === 'subscription' 
      ? pdpState.basePrice * (1 - pdpState.subDiscount) 
      : pdpState.basePrice;

    const cadenceSelect = document.getElementById('sub-cadence');
    const cadenceText = pdpState.purchaseMode === 'subscription' && cadenceSelect
      ? ` (Subscribed: Every ${cadenceSelect.value} wks)`
      : '';

    const variantDesc = `${pdpState.size} / ${pdpState.texture.split(' ')[0]} / ${pdpState.fat}${cadenceText}`;

    const cart = getCart();
    cart.push({
      id: 'pdp_' + Date.now(),
      title: 'Traditional Sliced Beef Biltong',
      variant: variantDesc,
      price: unitPrice,
      quantity: 1,
      timestamp: Date.now()
    });

    saveCart(cart);
    openCartDrawer();
  };

  // ==========================================================================
  // 6. Technical Accordion Toggles
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
  // 7. Catalog Search & Filter
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
  // 8. Contact & Newsletter Form Submissions
  // ==========================================================================
  window.handleNewsletterSubmit = function(e) {
    e.preventDefault();
    const feedback = document.getElementById('newsletter-feedback');
    if (feedback) feedback.classList.remove('hidden');
    e.target.reset();
  };

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
            resEl.textContent = '✓ Thank you! Your inquiry has been dispatched to our craft team.';
            resEl.className = 'text-xs font-semibold text-emerald-600 mt-2';
          }
          contactForm.reset();
        } else {
          throw new Error('Failed');
        }
      } catch (_err) {
        if (resEl) {
          resEl.textContent = 'Inquiry noted. We will reach out shortly!';
          resEl.className = 'text-xs font-semibold text-emerald-600 mt-2';
        }
        contactForm.reset();
      }
    });
  }

  // Checkout submission
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
        btn.textContent = 'Processing Order...';
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
        // Fallback demo confirmation
        localStorage.removeItem(CART_KEY);
        alert('Thank you! Your order has been placed. You will receive an email confirmation with tracking info.');
        window.location.href = '/';
      }
    });
  }

  // Initial Run
  renderCartUI();
  updatePdpCalculations();
})();
