/**
 * Biltong Bites - Admin Dashboard Controller
 * ===========================================
 * Handles:
 * - Fetching order & customer metrics from `/api/admin/data`
 * - KPI summary cards calculation (Total Revenue, Pending, Completed, Customers)
 * - Multi-view toggles: Combined View, Orders Only, Customers Only
 * - Real-time filtering by specific customer and product keyword
 * - Order completion action with email dispatch trigger
 * - Individual order deletion and customer cascading deletion
 * - Full database orders reset with sequence zeroing
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // DOM Elements
  const contentDiv = document.getElementById('admin-content');
  const viewOrdersBtn = document.getElementById('view-orders');
  const viewCustomersBtn = document.getElementById('view-customers');
  const viewCombinedBtn = document.getElementById('view-combined');
  const resetOrdersBtn = document.getElementById('reset-orders-btn');
  const filterCustomer = document.getElementById('filter-customer');
  const filterProduct = document.getElementById('filter-product');

  // Application State
  let rawData = { customers: [], orders: [] };
  let currentView = 'combined'; // 'combined' | 'orders' | 'customers'

  // ==========================================================================
  // Data Fetching
  // ==========================================================================
  async function loadData() {
    try {
      contentDiv.innerHTML = '<div class="admin-loading"><p>Loading dashboard metrics...</p></div>';
      const res = await fetch('/api/admin/data');

      if (res.status === 401) {
        contentDiv.innerHTML = `
          <div class="admin-alert admin-alert-danger">
            <strong>Unauthorized:</strong> Please reload the page and provide valid admin credentials.
          </div>
        `;
        return;
      }

      rawData = await res.json();

      // Sort customers alphabetically by name
      if (rawData.customers) {
        rawData.customers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      populateCustomerDropdown();
      render();
    } catch (e) {
      contentDiv.innerHTML = `
        <div class="admin-alert admin-alert-danger">
          <strong>Error loading dashboard:</strong> ${e.message}
        </div>
      `;
    }
  }

  // ==========================================================================
  // Dropdown Population & Stats
  // ==========================================================================
  function populateCustomerDropdown() {
    if (!filterCustomer) return;
    const defaultOpt = '<option value="">All Customers</option>';
    const opts = (rawData.customers || []).map(c => `
      <option value="${c.id}">${c.name} (${c.email})</option>
    `).join('');
    filterCustomer.innerHTML = defaultOpt + opts;
  }

  function renderStats(orders, customers) {
    const totalRev = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingOrders = orders.filter(o => o.status !== 'Completed').length;
    const completedOrders = orders.filter(o => o.status === 'Completed').length;

    return `
      <div class="admin-stats-grid">
        <div class="stat-card">
          <span class="stat-title">Total Revenue</span>
          <span class="stat-val">$${totalRev.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Active / Pending</span>
          <span class="stat-val stat-val-pending">${pendingOrders}</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Completed Orders</span>
          <span class="stat-val stat-val-success">${completedOrders}</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Unique Customers</span>
          <span class="stat-val">${customers.length}</span>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // View Rendering
  // ==========================================================================
  function render() {
    const selectedCustomerId = filterCustomer ? filterCustomer.value : '';
    const filterText = filterProduct ? filterProduct.value.toLowerCase().trim() : '';

    // Filter orders
    let filteredOrders = rawData.orders || [];
    if (selectedCustomerId) {
      filteredOrders = filteredOrders.filter(o => o.customer_id.toString() === selectedCustomerId);
    }
    if (filterText) {
      filteredOrders = filteredOrders.filter(o => {
        return (o.cart || []).some(item => (item.title || '').toLowerCase().includes(filterText));
      });
    }

    // Filter customers
    let filteredCustomers = rawData.customers || [];
    if (selectedCustomerId) {
      filteredCustomers = filteredCustomers.filter(c => c.id.toString() === selectedCustomerId);
    }
    if (filterText) {
      const validCustomerIds = new Set(filteredOrders.map(o => o.customer_id));
      filteredCustomers = filteredCustomers.filter(c => validCustomerIds.has(c.id));
    }

    const statsHtml = renderStats(rawData.orders || [], rawData.customers || []);

    if (currentView === 'orders') {
      contentDiv.innerHTML = statsHtml + renderOrdersTable(filteredOrders);
    } else if (currentView === 'customers') {
      contentDiv.innerHTML = statsHtml + renderCustomersTable(filteredCustomers);
    } else {
      contentDiv.innerHTML = statsHtml + renderCombinedCards(filteredCustomers, filteredOrders);
    }

    attachActionListeners();
  }

  function renderOrdersTable(orders) {
    if (orders.length === 0) {
      return '<div class="admin-empty">No orders found matching the filter criteria.</div>';
    }

    let html = `
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    orders.forEach(o => {
      const itemsList = (o.cart || []).map(i => `${i.title} (×${i.quantity})`).join(', ');
      const isCompleted = o.status === 'Completed';

      html += `
        <tr>
          <td><strong>#${o.id}</strong></td>
          <td>
            <strong>${o.customer_name || 'Anonymous'}</strong><br>
            <span class="admin-subtext">${o.customer_email || ''}</span>
          </td>
          <td>${itemsList}</td>
          <td><strong>$${(o.total || 0).toFixed(2)}</strong></td>
          <td>
            <span class="badge ${isCompleted ? 'badge-success' : 'badge-pending'}">
              ${o.status || 'Pending'}
            </span>
          </td>
          <td>${new Date(o.created_at).toLocaleDateString()}</td>
          <td style="text-align: right;">
            <div class="admin-actions-group">
              ${!isCompleted ? `<button class="btn btn-sm btn-primary complete-btn" data-id="${o.id}">Complete</button>` : ''}
              <button class="btn btn-sm btn-danger delete-btn" data-id="${o.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    return html;
  }

  function renderCustomersTable(customers) {
    if (customers.length === 0) {
      return '<div class="admin-empty">No customers found matching the filter criteria.</div>';
    }

    let html = `
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Registered</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    customers.forEach(c => {
      html += `
        <tr>
          <td>#${c.id}</td>
          <td><strong>${c.name}</strong></td>
          <td><a href="mailto:${c.email}" class="admin-link">${c.email}</a></td>
          <td>${c.phone || 'N/A'}</td>
          <td>${new Date(c.created_at).toLocaleDateString()}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm btn-danger delete-customer-btn" data-id="${c.id}">Remove</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    return html;
  }

  function renderCombinedCards(customers, orders) {
    if (customers.length === 0) {
      return '<div class="admin-empty">No records found matching criteria.</div>';
    }

    let html = `<div class="admin-combined-list">`;

    customers.forEach(c => {
      const custOrders = orders.filter(o => o.customer_id === c.id);
      if (custOrders.length === 0) return;

      html += `
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">${c.name}</h3>
              <p class="admin-card-subtitle">${c.email} • ${c.phone}</p>
            </div>
            <div class="admin-card-badge">
              ${custOrders.length} Order(s)
            </div>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
      `;

      custOrders.forEach(o => {
        const itemsList = (o.cart || []).map(i => `${i.title} (×${i.quantity})`).join(', ');
        const isCompleted = o.status === 'Completed';

        html += `
          <tr>
            <td><strong>#${o.id}</strong></td>
            <td>${itemsList}</td>
            <td><strong>$${(o.total || 0).toFixed(2)}</strong></td>
            <td>
              <span class="badge ${isCompleted ? 'badge-success' : 'badge-pending'}">
                ${o.status || 'Pending'}
              </span>
            </td>
            <td style="text-align: right;">
              <div class="admin-actions-group">
                ${!isCompleted ? `<button class="btn btn-sm btn-primary complete-btn" data-id="${o.id}">Complete</button>` : ''}
                <button class="btn btn-sm btn-danger delete-btn" data-id="${o.id}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table></div></div>`;
    });

    html += `</div>`;
    return html;
  }

  // ==========================================================================
  // Action Handlers
  // ==========================================================================
  function attachActionListeners() {
    // Complete order
    document.querySelectorAll('.complete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Mark Order #${id} as Completed and send notification email?`)) {
          e.target.disabled = true;
          e.target.textContent = 'Updating...';
          await fetch(`/api/admin/orders/${id}/complete`, { method: 'POST' });
          await loadData();
        }
      });
    });

    // Delete single order
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Are you sure you want to permanently delete Order #${id}?`)) {
          await fetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
          await loadData();
        }
      });
    });

    // Delete customer
    document.querySelectorAll('.delete-customer-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Delete Customer #${id} and ALL their linked orders?`)) {
          await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
          await loadData();
        }
      });
    });
  }

  // View Switchers
  viewOrdersBtn?.addEventListener('click', () => {
    currentView = 'orders';
    viewOrdersBtn.classList.remove('btn-ghost');
    viewCustomersBtn.classList.add('btn-ghost');
    viewCombinedBtn.classList.add('btn-ghost');
    render();
  });

  viewCustomersBtn?.addEventListener('click', () => {
    currentView = 'customers';
    viewCustomersBtn.classList.remove('btn-ghost');
    viewOrdersBtn.classList.add('btn-ghost');
    viewCombinedBtn.classList.add('btn-ghost');
    render();
  });

  viewCombinedBtn?.addEventListener('click', () => {
    currentView = 'combined';
    viewCombinedBtn.classList.remove('btn-ghost');
    viewOrdersBtn.classList.add('btn-ghost');
    viewCustomersBtn.classList.add('btn-ghost');
    render();
  });

  // Reset database orders
  resetOrdersBtn?.addEventListener('click', async () => {
    if (confirm('🚨 DANGER: Delete ALL orders from the database and reset the order numbering? This cannot be undone.')) {
      try {
        resetOrdersBtn.disabled = true;
        resetOrdersBtn.textContent = 'Resetting...';
        const res = await fetch('/api/admin/reset_orders', { method: 'DELETE' });
        if (res.ok) {
          alert('All orders have been cleared.');
          await loadData();
        } else {
          const err = await res.json();
          alert('Failed to reset orders: ' + err.error);
        }
      } catch (e) {
        alert('Reset error: ' + e.message);
      } finally {
        resetOrdersBtn.disabled = false;
        resetOrdersBtn.textContent = 'Reset All Orders';
      }
    }
  });

  filterCustomer?.addEventListener('change', render);
  filterProduct?.addEventListener('input', render);

  // Initial fetch
  loadData();
});
