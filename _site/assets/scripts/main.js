(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));


  // Theme toggle
  const themeToggles = $$('.theme-toggle');
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { }
    // Update toggle icons
    themeToggles.forEach(btn => {
      const icon = btn.querySelector('.icon');
      if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    });
  }
  // Initialize theme from saved preference or default to dark
  try {
    const stored = localStorage.getItem('theme');
    setTheme(stored || 'dark');
  } catch { }
  themeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  });

  // Footer year
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Intersection animation
  const products = $$('#product-grid .product');
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add('in-view');
  }, { rootMargin: '0px 0px -10% 0px' }) : null;
  products.forEach((card) => io?.observe(card));

  // Search + filters
  const searchInput = $('#product-search');
  const flavourRoot = $('#flavour-filters');
  const quantityRoot = $('#quantity-filters');
  function applyFilter() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const flavourActives = $$('#flavour-filters input:checked').map((i) => i.value);
    const quantityActives = $$('#quantity-filters input:checked').map((i) => i.value);
    products.forEach((el) => {
      const hay = `${el.dataset.title} ${el.dataset.desc} ${el.dataset.flavour}`;
      const matchesQuery = !q || hay.includes(q);
      const matchesFlavour = !flavourActives.length || flavourActives.every((f) => el.dataset.flavour.includes(f));
      const matchesQuantity = !quantityActives.length || quantityActives.every((qv) => el.dataset.quantity.includes(qv));
      el.style.display = matchesQuery && matchesFlavour && matchesQuantity ? '' : 'none';
    });
  }
  searchInput?.addEventListener('input', applyFilter);
  flavourRoot?.addEventListener('change', applyFilter);
  quantityRoot?.addEventListener('change', applyFilter);


  // Click-toggle filter dropdown menus and close on mouseleave
  $$('.filter-toggle').forEach(btn => {
    const dropdown = btn.closest('.filter-dropdown');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    // Stay open until mouse leaves the whole dropdown area
    dropdown.addEventListener('mouseleave', () => {
      dropdown.classList.remove('open');
    });
  });

  // Mobile Nav Toggle
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !expanded);
      nav.classList.toggle('is-active');
    });
  }

  // Simple prefetch on hover
  const prefetch = (url) => {
    try { const link = Object.assign(document.createElement('link'), { rel: 'prefetch', href: url }); document.head.appendChild(link); } catch (e) { }
  };
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a[href^="http"]'); if (a) prefetch(a.href);
  }, { passive: true });

  // Cart utility functions
  function purgeExpiredCart() {
    const now = Date.now();
    const cart = JSON.parse(localStorage.getItem('biltongCart') || '[]');
    const valid = cart.filter(item => item.timestamp + 48 * 60 * 60 * 1000 > now);
    localStorage.setItem('biltongCart', JSON.stringify(valid));
    return valid;
  }

  function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('biltongCart') || '[]');
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    const badge = document.querySelector('.cart-count');
    if (badge) {
      badge.textContent = count > 0 ? count : '';
    }
  }
  purgeExpiredCart();
  updateCartCount();

  function showAddedFeedback(btn) {
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span>Added!</span>';
    btn.classList.add('added');
    btn.disabled = true;

    // Trigger a small bounce on the cart badge if it exists
    const badge = document.querySelector('.cart-count');
    if (badge) {
      badge.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.3)' },
        { transform: 'scale(1)' }
      ], { duration: 300 });
    }

    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.classList.remove('added');
      btn.disabled = false;
    }, 1500);
  }

  // Quantity selector logic on detail page
  (() => {
    const selector = document.querySelector('.quantity-selector');
    if (!selector) return;
    const input = selector.querySelector('.qty-input');
    const priceEl = document.querySelector('.price');
    const unitPrice = parseFloat(priceEl.dataset.unitPrice);

    function updatePrice(qty) {
      priceEl.textContent = '$' + (unitPrice * qty).toFixed(2);
    }

    // initialize total
    updatePrice(parseInt(input.value, 10));

    selector.querySelector('.minus').addEventListener('click', () => {
      const val = Math.max(1, parseInt(input.value, 10) - 1);
      input.value = val;
      updatePrice(val);
    });
    selector.querySelector('.plus').addEventListener('click', () => {
      const val = parseInt(input.value, 10) + 1;
      input.value = val;
      updatePrice(val);
    });
    input.addEventListener('input', () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      input.value = val;
      updatePrice(val);
    });

    const addToCartBtn = selector.querySelector('.add-to-cart');
    addToCartBtn.addEventListener('click', () => {
      const qty = parseInt(input.value, 10);
      const id = window.location.pathname;
      const title = document.querySelector('h1').textContent.trim();
      const now = Date.now();
      const cart = purgeExpiredCart();
      const existing = cart.find(item => item.id === id);
      if (existing) {
        existing.quantity = qty;
        existing.timestamp = now;
        existing.price = unitPrice;
      } else {
        cart.push({ id, title, quantity: qty, price: unitPrice, timestamp: now });
      }
      localStorage.setItem('biltongCart', JSON.stringify(cart));
      updateCartCount();
      showAddedFeedback(addToCartBtn);
    });
  })();

  // Cart toggle click handler: show cart contents
  const cartToggle = document.getElementById('cart-toggle');
  if (cartToggle) {
    cartToggle.addEventListener('click', () => {
      window.location.href = '/cart/';
    });
  }

  // Add to cart buttons on listing pages
  (function () {
    const buttons = $$('.card-actions .add-to-cart');
    if (!buttons.length) return;
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const title = btn.dataset.title;
        const price = parseFloat(btn.dataset.price);
        const qty = 1;
        const now = Date.now();
        let cart = JSON.parse(localStorage.getItem('biltongCart') || '[]');
        cart = cart.filter(item => item.timestamp + 48 * 60 * 60 * 1000 > now);
        const existing = cart.find(item => item.id === id);
        if (existing) {
          existing.quantity += qty;
          existing.timestamp = now;
          existing.price = price;
        } else {
          cart.push({ id, title, quantity: qty, price, timestamp: now });
        }
        localStorage.setItem('biltongCart', JSON.stringify(cart));

        updateCartCount();
        showAddedFeedback(btn);
      });
    });
  })();

})();

// Cart page rendering
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cart-contents');
  if (!container) return;
  const cart = JSON.parse(localStorage.getItem('biltongCart') || '[]');
  if (!cart.length) {
    container.textContent = 'Your cart is empty';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'cart-items';
  let total = 0;
  cart.forEach(item => {
    const li = document.createElement('li');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = item.title;

    // Quantity controls
    const qtyContainer = document.createElement('div');
    qtyContainer.className = 'quantity-selector';
    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'qty-btn minus';
    minusBtn.setAttribute('aria-label', 'Decrease quantity');
    minusBtn.textContent = '−';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'qty-input';
    input.value = item.quantity;
    input.min = 1;
    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'qty-btn plus';
    plusBtn.setAttribute('aria-label', 'Increase quantity');
    plusBtn.textContent = '+';
    qtyContainer.append(minusBtn, input, plusBtn);

    // Remove-from-cart button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.setAttribute('aria-label', 'Remove item');
    removeBtn.textContent = '🗑️';
    removeBtn.addEventListener('click', () => {
      // remove item from cart and update UI
      let cartData = JSON.parse(localStorage.getItem('biltongCart') || '[]');
      cartData = cartData.filter(i => i.id !== item.id);
      localStorage.setItem('biltongCart', JSON.stringify(cartData));
      li.remove();
      recalcTotal();
      // Update global badge
      const badge = document.querySelector('.cart-count');
      const count = cartData.reduce((acc, item) => acc + item.quantity, 0);
      if (badge) badge.textContent = count > 0 ? count : '';
    });

    // Unit price for this line
    const unitSpan = document.createElement('span');
    unitSpan.textContent = `$${item.price.toFixed(2)}`;
    // Price for this line (unit price * quantity)
    const priceSpan = document.createElement('span');
    priceSpan.textContent = `$${(item.price * item.quantity).toFixed(2)}`;

    // Handlers to update quantity
    function updateLine(q) {
      const now = Date.now();
      const cartData = JSON.parse(localStorage.getItem('biltongCart') || '[]');
      const it = cartData.find(i => i.id === item.id);
      if (it) {
        it.quantity = q;
        it.timestamp = now;
        localStorage.setItem('biltongCart', JSON.stringify(cartData));
        input.value = q;
        priceSpan.textContent = `$${(item.price * q).toFixed(2)}`;
        recalcTotal();
        // Update global badge
        const badge = document.querySelector('.cart-count');
        const count = cartData.reduce((acc, item) => acc + item.quantity, 0);
        if (badge) badge.textContent = count > 0 ? count : '';
      }
    }
    minusBtn.addEventListener('click', () => updateLine(Math.max(1, parseInt(input.value, 10) - 1)));
    plusBtn.addEventListener('click', () => updateLine(parseInt(input.value, 10) + 1));
    input.addEventListener('input', () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      updateLine(v);
    });

    li.append(titleSpan, unitSpan, qtyContainer, priceSpan, removeBtn);
    list.append(li);
    total += (item.price || 0) * item.quantity;
  });
  container.appendChild(list);
  const totalEl = document.createElement('div');
  totalEl.className = 'cart-total';
  totalEl.textContent = `Total: $${total.toFixed(2)}`;
  container.appendChild(totalEl);
  // Recalculate cart total after quantity changes
  function recalcTotal() {
    const data = JSON.parse(localStorage.getItem('biltongCart') || '[]');
    const sum = data.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    totalEl.textContent = `Total: $${sum.toFixed(2)}`;
  }
});

// Checkout page email flow
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('checkout-form');
  if (!form) return;
  const preview = document.getElementById('email-preview');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const rawName = form.name.value.trim();

    // Split name for DB (Last First) and Email (First Last)
    let dbName = rawName;
    let emailName = rawName;
    const nameParts = rawName.split(' ').filter(Boolean);
    if (nameParts.length > 1) {
      const last = nameParts.pop();
      const first = nameParts.join(' ');
      dbName = `${last} ${first}`;
      emailName = `${first} ${last}`;
    }

    const cart = JSON.parse(localStorage.getItem('biltongCart') || '[]');
    let body = `Thank you for your order!\n\nPlease complete your payment to our bank account:\n\nAccount Name: Biltong Bites\nAccount Number: 12345678\nSort Code: 00-00-00\n\nOrder details:\n`;
    let total = 0;
    cart.forEach(item => {
      body += `- ${item.title} x ${item.quantity} @ $${item.price.toFixed(2)}\n`;
      total += item.price * item.quantity;
    });
    body += `\nTotal: $${total.toFixed(2)}\n\nCheers,\nBiltong Bites Team`;

    try {
      // Send to our new API endpoint
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: dbName, emailName, phone, cart, total })
      });
      console.log('Order successfully sent to server.');
      // Clear cart after successful order
      localStorage.removeItem('biltongCart');
      const badge = document.querySelector('.cart-count');
      if (badge) badge.textContent = '';

      // Show success message instead of opening mail client
      if (preview) {
        preview.innerHTML = `<div style="padding: 1rem; background-color: rgba(76, 175, 80, 0.1); border: 1px solid #4CAF50; border-radius: 4px; color: #4CAF50; margin-top: 1rem;">
          <strong>Order successful!</strong><br>
          We've received your order and payment details have been sent to <em>${email}</em>.
        </div>`;
      }
      form.reset();
    } catch (err) {
      console.error('Failed to submit order to API:', err);
      if (preview) preview.textContent = "There was an error processing your order. Please try again.";
    }
  });
});

// Contact form submission
document.addEventListener('DOMContentLoaded', () => {
  const contactForm = document.getElementById('contact-form');
  if (!contactForm) return;
  const resultDiv = document.getElementById('contact-result');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = "Sending...";
    submitBtn.disabled = true;

    const name = contactForm.name.value.trim();
    const email = contactForm.email.value.trim();
    const message = contactForm.message.value.trim();

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });

      if (res.ok) {
        resultDiv.innerHTML = `<div style="padding: 1rem; background-color: rgba(76, 175, 80, 0.1); border: 1px solid #4CAF50; border-radius: 4px; color: #4CAF50;">
          <strong>Message Sent!</strong><br>
          Thank you for reaching out. We will get back to you shortly.
        </div>`;
        contactForm.reset();
      } else {
        const err = await res.json();
        resultDiv.innerHTML = `<div style="color: red; padding: 1rem; border: 1px solid red; border-radius: 4px;">Failed to send: ${err.error || 'Unknown error'}</div>`;
      }
    } catch (err) {
      resultDiv.innerHTML = `<div style="color: red; padding: 1rem; border: 1px solid red; border-radius: 4px;">An error occurred. Please try again.</div>`;
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
});
