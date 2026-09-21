/**
 * Biltong Bites - Frontend Client Controller
 * ===========================================
 * Handles:
 * - Theme toggling (light / dark mode) with system preference persistence
 * - Product listing search & multi-category tag filtering
 * - Cart lifecycle management (localStorage persistence with 48h TTL)
 * - Detail page dynamic price scaling and cart integration
 * - Shopping cart page rendering with live quantity controls and instant recalculation
 * - Checkout validation, empty-cart guard, and order submission to `/api/orders`
 * - Contact form submissions with async feedback to `/api/contact`
 * - Toast notification banner system
 */

(function () {
  'use strict';

  // Helper DOM selectors
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ==========================================================================
  // Toast Notification System
  // ==========================================================================
  function showToast(message, type = 'success', duration = 3000) {
    let toastContainer = $('#toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : '⚠️'}</span>
      <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ==========================================================================
  // Theme Toggle Management
  // ==========================================================================
  const themeToggles = $$('.theme-toggle');

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch (_e) {}

    themeToggles.forEach(btn => {
      const icon = btn.querySelector('.icon');
      if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    });
  }

  // Initialize theme from saved preference or default to dark
  try {
    const savedTheme = localStorage.getItem('theme');
    setTheme(savedTheme || 'dark');
  } catch (_e) {}

  themeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  });

  // Dynamic copyright year
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ==========================================================================
  // Mobile Navigation Menu Toggle
  // ==========================================================================
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !expanded);
      nav.classList.toggle('is-active');
    });

    // Close mobile nav when clicking any nav link
    $$('.menu a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-active');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ==========================================================================
  // Product Search & Filter Dropdown
  // ==========================================================================
  const products = $$('#product-grid .product');
  const searchInput = $('#product-search');
  const flavourRoot = $('#flavour-filters');
  const quantityRoot = $('#quantity-filters');
  const filterBtn = $('#filter-btn');
  const emptyState = $('#no-products-message');
  const clearFiltersBtn = $('#clear-filters-btn');

  function applyFilters() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const activeFlavours = $$('#flavour-filters input:checked').map(i => i.value);
    const activeQuantities = $$('#quantity-filters input:checked').map(i => i.value);

    let matchCount = 0;

    products.forEach(el => {
      const title = el.dataset.title || '';
      const desc = el.dataset.desc || '';
      const flavour = el.dataset.flavour || '';
      const quantity = el.dataset.quantity || '';

      const hay = `${title} ${desc} ${flavour} ${quantity}`.toLowerCase();
      const matchesSearch = !q || hay.includes(q);
      const matchesFlavour = !activeFlavours.length || activeFlavours.some(f => flavour.includes(f));
      const matchesQuantity = !activeQuantities.length || activeQuantities.some(qv => quantity.includes(qv));

      const isVisible = matchesSearch && matchesFlavour && matchesQuantity;
      el.style.display = isVisible ? '' : 'none';
      if (isVisible) matchCount++;
    });

    if (emptyState) {
      emptyState.style.display = matchCount === 0 ? 'block' : 'none';
    }
  }

  searchInput?.addEventListener('input', applyFilters);
  flavourRoot?.addEventListener('change', applyFilters);
  quantityRoot?.addEventListener('change', applyFilters);

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      $$('#flavour-filters input:checked').forEach(i => (i.checked = false));
      $$('#quantity-filters input:checked').forEach(i => (i.checked = false));
      applyFilters();
    });
  }

  // Filter dropdown toggle & outside click handling
  if (filterBtn) {
    const dropdown = filterBtn.closest('.filter-dropdown');
    filterBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      filterBtn.setAttribute('aria-expanded', isOpen);
    });

    document.addEventListener('click', e => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
        filterBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        filterBtn.setAttribute('aria-expanded', 'false');
        filterBtn.focus();
      }
    });
  }

  // Intersection Observer for staggered card entrance
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -50px 0px', threshold: 0.1 });

    products.forEach(card => observer.observe(card));
  } else {
    products.forEach(card => card.classList.add('in-view'));
  }

  // ==========================================================================
  // Cart Utilities & Storage Management
  // ==========================================================================
  const CART_KEY = 'biltongCart';
  const CART_TTL = 48 * 60 * 60 * 1000; // 48 hours

  function getCart() {
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
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartBadge();
    } catch (_e) {}
  }

  function updateCartBadge() {
    const cart = getCart();
    const count = cart.reduce((acc, item) => acc + (item.quantity || 0), 0);
    const badge = document.querySelector('.cart-count');
    if (badge) {
      badge.textContent = count > 0 ? count : '';
      if (count > 0) {
        badge.animate([
          { transform: 'scale(1)' },
          { transform: 'scale(1.3)' },
          { transform: 'scale(1)' }
        ], { duration: 250 });
      }
    }
  }

  // Run on startup
  updateCartBadge();

  // Button feedback effect
  function triggerButtonFeedback(btn, feedbackText = 'Added!') {
    const originalText = btn.textContent;
    btn.textContent = `✓ ${feedbackText}`;
    btn.classList.add('added');
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('added');
      btn.disabled = false;
    }, 1400);
  }

  // Add-to-cart on catalog cards
  $$('.card-actions .add-to-cart').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const title = btn.dataset.title;
      const price = parseFloat(btn.dataset.price) || 0;
      const now = Date.now();

      const cart = getCart();
      const existing = cart.find(item => item.id === id);
      if (existing) {
        existing.quantity += 1;
        existing.timestamp = now;
        existing.price = price;
      } else {
        cart.push({ id, title, quantity: 1, price, timestamp: now });
      }

      saveCart(cart);
      triggerButtonFeedback(btn);
      showToast(`Added 1x ${title} to your cart.`);
    });
  });

  // ==========================================================================
  // Product Detail Page Quantity Selector
  // ==========================================================================
  (function initProductDetailPage() {
    const detailBox = document.querySelector('.product-detail');
    if (!detailBox) return;

    const qtyInput = detailBox.querySelector('.qty-input');
    const priceEl = detailBox.querySelector('.price');
    const minusBtn = detailBox.querySelector('.minus');
    const plusBtn = detailBox.querySelector('.plus');
    const addBtn = detailBox.querySelector('.add-to-cart');

    if (!priceEl || !qtyInput) return;

    const unitPrice = parseFloat(priceEl.dataset.unitPrice) || 0;

    function refreshPrice() {
      let qty = parseInt(qtyInput.value, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      qtyInput.value = qty;
      priceEl.textContent = `$${(unitPrice * qty).toFixed(2)}`;
    }

    minusBtn?.addEventListener('click', () => {
      const current = parseInt(qtyInput.value, 10) || 1;
      if (current > 1) {
        qtyInput.value = current - 1;
        refreshPrice();
      }
    });

    plusBtn?.addEventListener('click', () => {
      const current = parseInt(qtyInput.value, 10) || 1;
      qtyInput.value = current + 1;
      refreshPrice();
    });

    qtyInput.addEventListener('change', refreshPrice);

    addBtn?.addEventListener('click', () => {
      const qty = parseInt(qtyInput.value, 10) || 1;
      const id = addBtn.dataset.id || window.location.pathname;
      const title = addBtn.dataset.title || detailBox.querySelector('.detail-title')?.textContent.trim() || 'Biltong Pack';
      const now = Date.now();

      const cart = getCart();
      const existing = cart.find(item => item.id === id);
      if (existing) {
        existing.quantity += qty;
        existing.timestamp = now;
        existing.price = unitPrice;
      } else {
        cart.push({ id, title, quantity: qty, price: unitPrice, timestamp: now });
      }

      saveCart(cart);
      triggerButtonFeedback(addBtn);
      showToast(`Added ${qty}x ${title} to your cart.`);
    });
  })();

  // Cart toggle in header redirects to /cart/
  const cartToggleBtn = document.getElementById('cart-toggle');
  if (cartToggleBtn) {
    cartToggleBtn.addEventListener('click', () => {
      window.location.href = '/cart/';
    });
  }

  // ==========================================================================
  // Cart Page Dynamic View & Quantity Editor
  // ==========================================================================
  (function initCartPage() {
    const container = document.getElementById('cart-contents');
    const checkoutBtn = document.getElementById('checkout-btn');
    if (!container) return;

    function renderCartPage() {
      const cart = getCart();
      container.innerHTML = '';

      if (cart.length === 0) {
        container.innerHTML = `
          <div class="empty-cart-state">
            <p class="empty-cart-text">Your shopping cart is currently empty.</p>
            <p><a href="/#products" class="btn">Explore Products</a></p>
          </div>
        `;
        if (checkoutBtn) {
          checkoutBtn.classList.add('disabled');
          checkoutBtn.setAttribute('aria-disabled', 'true');
          checkoutBtn.style.pointerEvents = 'none';
          checkoutBtn.style.opacity = '0.5';
        }
        return;
      }

      if (checkoutBtn) {
        checkoutBtn.classList.remove('disabled');
        checkoutBtn.removeAttribute('aria-disabled');
        checkoutBtn.style.pointerEvents = '';
        checkoutBtn.style.opacity = '1';
      }

      const list = document.createElement('div');
      list.className = 'cart-items-list';

      let total = 0;

      cart.forEach(item => {
        const itemSubtotal = (item.price || 0) * item.quantity;
        total += itemSubtotal;

        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.innerHTML = `
          <div class="cart-col-product">
            <strong>${item.title}</strong>
          </div>
          <div class="cart-col-price">
            $${(item.price || 0).toFixed(2)}
          </div>
          <div class="cart-col-qty">
            <div class="quantity-selector-sm">
              <button type="button" class="btn-qty minus" aria-label="Decrease quantity">−</button>
              <input type="number" class="input-qty" value="${item.quantity}" min="1" max="99" />
              <button type="button" class="btn-qty plus" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <div class="cart-col-subtotal">
            $${itemSubtotal.toFixed(2)}
          </div>
          <div class="cart-col-action">
            <button type="button" class="btn-remove" aria-label="Remove ${item.title}">✕</button>
          </div>
        `;

        // Decrease quantity
        row.querySelector('.minus').addEventListener('click', () => {
          if (item.quantity > 1) {
            item.quantity -= 1;
            item.timestamp = Date.now();
            saveCart(cart);
            renderCartPage();
          }
        });

        // Increase quantity
        row.querySelector('.plus').addEventListener('click', () => {
          item.quantity += 1;
          item.timestamp = Date.now();
          saveCart(cart);
          renderCartPage();
        });

        // Input change
        const input = row.querySelector('.input-qty');
        input.addEventListener('change', () => {
          let val = parseInt(input.value, 10);
          if (isNaN(val) || val < 1) val = 1;
          item.quantity = val;
          item.timestamp = Date.now();
          saveCart(cart);
          renderCartPage();
        });

        // Remove item
        row.querySelector('.btn-remove').addEventListener('click', () => {
          const updated = cart.filter(i => i.id !== item.id);
          saveCart(updated);
          renderCartPage();
          showToast(`Removed ${item.title} from cart.`, 'warning');
        });

        list.appendChild(row);
      });

      container.appendChild(list);

      const totalRow = document.createElement('div');
      totalRow.className = 'cart-total-banner';
      totalRow.innerHTML = `
        <span class="total-label">Estimated Total:</span>
        <span class="total-value">$${total.toFixed(2)} NZD</span>
      `;
      container.appendChild(totalRow);
    }

    renderCartPage();
  })();

  // ==========================================================================
  // Checkout Page & Order Flow
  // ==========================================================================
  (function initCheckoutPage() {
    const checkoutForm = document.getElementById('checkout-form');
    const orderItemsContainer = document.getElementById('checkout-order-items');
    const totalAmountEl = document.getElementById('checkout-total-amount');
    const placeOrderBtn = document.getElementById('place-order-btn');
    const previewEl = document.getElementById('email-preview');

    if (!checkoutForm || !orderItemsContainer || !totalAmountEl) return;

    const cart = getCart();

    // Guard: Prevent placing empty order
    if (cart.length === 0) {
      orderItemsContainer.innerHTML = '<p class="empty-msg">Your cart is currently empty. Please add items before checking out.</p>';
      totalAmountEl.textContent = '$0.00';
      if (placeOrderBtn) {
        placeOrderBtn.disabled = true;
        placeOrderBtn.textContent = 'Cart is Empty';
      }
      return;
    }

    // Render summary list
    let total = 0;
    orderItemsContainer.innerHTML = '';
    cart.forEach(item => {
      const sub = (item.price || 0) * item.quantity;
      total += sub;

      const itemRow = document.createElement('div');
      itemRow.className = 'summary-item-row';
      itemRow.innerHTML = `
        <span class="summary-item-title">${item.title} × ${item.quantity}</span>
        <span class="summary-item-price">$${sub.toFixed(2)}</span>
      `;
      orderItemsContainer.appendChild(itemRow);
    });

    totalAmountEl.textContent = `$${total.toFixed(2)} NZD`;

    // Form submission
    checkoutForm.addEventListener('submit', async e => {
      e.preventDefault();
      const currentCart = getCart();

      if (currentCart.length === 0) {
        showToast('Your cart is empty.', 'warning');
        return;
      }

      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = 'Processing Order...';

      const rawName = checkoutForm.name.value.trim();
      const email = checkoutForm.email.value.trim();
      const phone = checkoutForm.phone.value.trim();

      // Format customer name for database sorting (Last, First) and email greetings (First, Last)
      let dbName = rawName;
      let emailName = rawName;
      const parts = rawName.split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        const first = parts.slice(0, -1).join(' ');
        dbName = `${last} ${first}`;
        emailName = `${first} ${last}`;
      }

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name: dbName,
            emailName,
            phone,
            cart: currentCart,
            total
          })
        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {
          // Clear cart
          localStorage.removeItem(CART_KEY);
          updateCartBadge();

          // Render Success message
          checkoutForm.style.display = 'none';
          if (previewEl) {
            previewEl.innerHTML = `
              <div class="order-success-card">
                <div class="success-icon">✓</div>
                <h3>Order #${data.order_id} Confirmed!</h3>
                <p>Thank you, <strong>${emailName}</strong>! We've reserved your biltong.</p>
                <p>Payment instructions and pickup details have been sent to <strong>${email}</strong>.</p>
                <div class="success-actions">
                  <a href="/" class="btn">Return to Home</a>
                </div>
              </div>
            `;
          }
          showToast(`Order #${data.order_id} successfully placed!`, 'success', 5000);
        } else {
          throw new Error(data.message || 'Failed to complete order.');
        }
      } catch (err) {
        console.error('Order submission error:', err);
        if (previewEl) {
          previewEl.innerHTML = `
            <div class="order-error-banner">
              <strong>Error:</strong> ${err.message || 'Unable to submit your order. Please check your connection and try again.'}
            </div>
          `;
        }
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = 'Place Order & Receive Payment Info';
        showToast('Error processing order. Please try again.', 'warning');
      }
    });
  })();

  // ==========================================================================
  // Contact Form Submission
  // ==========================================================================
  (function initContactForm() {
    const form = document.getElementById('contact-form');
    const resultDiv = document.getElementById('contact-result');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      submitBtn.textContent = 'Sending Message...';
      submitBtn.disabled = true;

      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const message = form.message.value.trim();

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message })
        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {
          if (resultDiv) {
            resultDiv.innerHTML = `
              <div class="alert alert-success">
                <strong>Message sent!</strong> Thanks for getting in touch, ${name}. We'll respond shortly.
              </div>
            `;
          }
          form.reset();
          showToast('Message sent successfully!');
        } else {
          throw new Error(data.error || 'Server error');
        }
      } catch (err) {
        if (resultDiv) {
          resultDiv.innerHTML = `
            <div class="alert alert-danger">
              <strong>Could not send message:</strong> ${err.message}. You can email us directly at biltongbites25@gmail.com.
            </div>
          `;
        }
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  })();

})();
