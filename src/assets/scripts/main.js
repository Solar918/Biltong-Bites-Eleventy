(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Theme toggle
  const themeToggle = $('#theme-toggle');
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }
  themeToggle?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(next);
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

  // Modal for project details
  // Modal for product details
  const modal = $('#product-modal');
  const modalTitle = $('#modal-title');
  const modalDesc = $('#modal-desc');
  const modalImg = $('#modal-image');
  const modalLive = $('#modal-live');
  const modalCode = $('#modal-code');
  let lastFocused = null;

  function openModal(slug) {
    lastFocused = document.activeElement;
    const card = $(`.product [data-slug="${CSS.escape(slug)}"]`)?.closest('.product');
    if (!card || !modal) return;
    modalTitle.textContent = $('.card-title', card)?.textContent || '';
    modalDesc.textContent = $('.card-desc', card)?.textContent || '';
    const img = $('img', card);
    if (img) {
      modalImg.src = img.src; modalImg.alt = img.alt; modalImg.hidden = false;
    } else { modalImg.hidden = true; }
    const live = $('a.btn', card); const code = $('a.btn.btn-ghost', card);
    if (live) { modalLive.href = live.href; modalLive.hidden = false; } else modalLive.hidden = true;
    if (code) { modalCode.href = code.href; modalCode.hidden = false; } else modalCode.hidden = true;
    modal.showModal();
    document.body.classList.add('modal-open');
    modal.addEventListener('keydown', onModalKeydown);
  }
  function closeModal() {
    if (!modal) return;
    modal.close();
    document.body.classList.remove('modal-open');
    modal.removeEventListener('keydown', onModalKeydown);
    lastFocused?.focus();
  }
  function onModalKeydown(e) {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') trapFocus(e);
  }
  function trapFocus(e) {
    const focusables = $$('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])', modal).filter((el) => !el.hasAttribute('disabled'));
    if (!focusables.length) return;
    const first = focusables[0]; const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-modal-open]');
    const closeBtn = e.target.closest('[data-modal-close]');
    if (openBtn) openModal(openBtn.dataset.slug);
    if (closeBtn || e.target === modal) closeModal();
  });

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
})();
