(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));


  // Theme toggle
  const themeToggles = $$('.theme-toggle');
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch {}
    // Update toggle icons
    themeToggles.forEach(btn => {
      const icon = btn.querySelector('.icon');
      if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    });
  }
  // Initialize theme from saved preference or OS setting
  try {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(stored || (prefersDark ? 'dark' : 'light'));
  } catch {}
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


  // Click-toggle filter dropdown menus and close on outside click
  $$('.filter-toggle').forEach(btn => {
    const dropdown = btn.closest('.filter-dropdown');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => {
    $$('.filter-dropdown.open').forEach(dd => dd.classList.remove('open'));
  });

  // Simple prefetch on hover
  const prefetch = (url) => {
    try { const link = Object.assign(document.createElement('link'), { rel: 'prefetch', href: url }); document.head.appendChild(link); } catch (e) {}
  };
document.addEventListener('mouseover', (e) => {
  const a = e.target.closest('a[href^="http"]'); if (a) prefetch(a.href);
}, { passive: true });

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

  // Cart logic: persist items in localStorage for 48h
  function purgeExpiredCart() {
    const now = Date.now();
    const cart = JSON.parse(localStorage.getItem('biltongCart') || '[]');
    const valid = cart.filter(item => item.timestamp + 48 * 60 * 60 * 1000 > now);
    localStorage.setItem('biltongCart', JSON.stringify(valid));
    return valid;
  }
  purgeExpiredCart();

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
    alert(qty + ' item(s) added to cart');
  });
})();

  // Cart toggle click handler: show cart contents
  const cartToggle = document.getElementById('cart-toggle');
  if (cartToggle) {
    cartToggle.addEventListener('click', () => {
      window.location.href = '/cart/';
    });
  }
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
    const qtySpan = document.createElement('span');
    qtySpan.textContent = `x ${item.quantity}`;
    li.appendChild(titleSpan);
    li.appendChild(qtySpan);
    list.appendChild(li);
    total += (item.price || 0) * item.quantity;
  });
  container.appendChild(list);
  const totalEl = document.createElement('div');
  totalEl.className = 'cart-total';
  totalEl.textContent = `Total: $${total.toFixed(2)}`;
  container.appendChild(totalEl);
});
