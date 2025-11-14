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
})();
})();
