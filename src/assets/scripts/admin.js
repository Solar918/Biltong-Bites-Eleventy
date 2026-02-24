document.addEventListener('DOMContentLoaded', async () => {
  const contentDiv = document.getElementById('admin-content');
  const viewOrdersBtn = document.getElementById('view-orders');
  const viewCustomersBtn = document.getElementById('view-customers');
  const viewCombinedBtn = document.getElementById('view-combined');
  const resetOrdersBtn = document.getElementById('reset-orders-btn');

  const filterCustomer = document.getElementById('filter-customer');
  const filterProduct = document.getElementById('filter-product');

  let rawData = { customers: [], orders: [] };
  let currentView = 'combined'; // orders, customers, combined

  async function loadData() {
    try {
      const res = await fetch('/api/admin/data');
      if (res.status === 401) {
        contentDiv.innerHTML = '<p style="color:red;">Unauthorized. Please refresh and log in.</p>';
        return;
      }
      rawData = await res.json();

      // Sort customers alphabetically by last name (which is the first word since DB stores "Last First")
      if (rawData.customers) {
        rawData.customers.sort((a, b) => a.name.localeCompare(b.name));
      }

      populateCustomerDropdown();
      render();
    } catch (e) {
      contentDiv.innerHTML = `<p style="color:red;">Error loading data: ${e.message}</p>`;
    }
  }

  function populateCustomerDropdown() {
    const defaultOpt = '<option value="">All Customers</option>';
    const opts = rawData.customers.map(c => `<option value="${c.id}">${c.name} (${c.email})</option>`).join('');
    filterCustomer.innerHTML = defaultOpt + opts;
  }

  function render() {
    const selectedCustomerId = filterCustomer.value;
    const filterText = filterProduct.value.toLowerCase();

    // Filter orders
    let filteredOrders = rawData.orders;
    if (selectedCustomerId) {
      filteredOrders = filteredOrders.filter(o => o.customer_id.toString() === selectedCustomerId);
    }
    if (filterText) {
      filteredOrders = filteredOrders.filter(o => {
        return o.cart.some(item => item.title.toLowerCase().includes(filterText));
      });
    }

    // Filter customers (only show customers who match the Orders filter if it's active)
    let filteredCustomers = rawData.customers;
    if (selectedCustomerId) {
      filteredCustomers = filteredCustomers.filter(c => c.id.toString() === selectedCustomerId);
    }
    if (filterText) {
      const validCustomerIds = new Set(filteredOrders.map(o => o.customer_id));
      filteredCustomers = filteredCustomers.filter(c => validCustomerIds.has(c.id));
    }

    if (currentView === 'orders') {
      renderOrders(filteredOrders);
    } else if (currentView === 'customers') {
      renderCustomers(filteredCustomers);
    } else {
      renderCombined(filteredCustomers, filteredOrders);
    }
  }

  function renderOrders(orders) {
    if (orders.length === 0) {
      contentDiv.innerHTML = '<p>No orders found.</p>';
      return;
    }

    let html = `
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border);">
            <th style="padding: 1rem;">Order #</th>
            <th style="padding: 1rem;">Customer</th>
            <th style="padding: 1rem;">Items</th>
            <th style="padding: 1rem;">Total</th>
            <th style="padding: 1rem;">Status</th>
            <th style="padding: 1rem;">Date</th>
            <th style="padding: 1rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    orders.forEach(o => {
      const itemsList = o.cart.map(i => `${i.title} (x${i.quantity})`).join(', ');
      html += `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 1rem;">#${o.id}</td>
          <td style="padding: 1rem;">${o.customer_name}</td>
          <td style="padding: 1rem;">${itemsList}</td>
          <td style="padding: 1rem;">$${o.total.toFixed(2)}</td>
          <td style="padding: 1rem;">
            <span style="padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; background: ${o.status === 'Completed' ? 'var(--accent)' : 'var(--muted)'}; color: white;">
              ${o.status}
            </span>
          </td>
          <td style="padding: 1rem;">${new Date(o.created_at).toLocaleDateString()}</td>
          <td style="padding: 1rem; display: flex; gap: 0.5rem;">
            ${o.status !== 'Completed' ? `<button class="btn complete-btn" data-id="${o.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Complete</button>` : ''}
            <button class="btn btn-ghost delete-btn" data-id="${o.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; color: #ff4444; border-color: #ff4444;">Remove</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    contentDiv.innerHTML = html;
    attachActionListeners();
  }

  function renderCustomers(customers) {
    if (customers.length === 0) {
      contentDiv.innerHTML = '<p>No customers found.</p>';
      return;
    }

    let html = `
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border);">
            <th style="padding: 1rem;">ID</th>
            <th style="padding: 1rem;">Name</th>
            <th style="padding: 1rem;">Email</th>
            <th style="padding: 1rem;">Phone</th>
            <th style="padding: 1rem;">Joined</th>
            <th style="padding: 1rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    customers.forEach(c => {
      html += `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 1rem;">${c.id}</td>
          <td style="padding: 1rem; font-weight: bold;">${c.name}</td>
          <td style="padding: 1rem;"><a href="mailto:${c.email}" style="color: var(--accent);">${c.email}</a></td>
          <td style="padding: 1rem;">${c.phone}</td>
          <td style="padding: 1rem;">${new Date(c.created_at).toLocaleDateString()}</td>
          <td style="padding: 1rem;">
             <button class="btn btn-ghost delete-customer-btn" data-id="${c.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; color: #ff4444; border-color: #ff4444;">Remove</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    contentDiv.innerHTML = html;
    attachActionListeners();
  }

  function renderCombined(customers, orders) {
    if (customers.length === 0) {
      contentDiv.innerHTML = '<p>No data found.</p>';
      return;
    }

    let html = `<div style="display: flex; flex-direction: column; gap: 2rem;">`;

    customers.forEach(c => {
      const custOrders = orders.filter(o => o.customer_id === c.id);
      if (custOrders.length === 0) return; // Skip if filtered out

      html += `
        <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1rem;">
            <div>
              <h2 style="margin: 0; font-size: 1.25rem;">${c.name}</h2>
              <p style="margin: 0; color: var(--muted); font-size: 0.9rem;">${c.email} | ${c.phone}</p>
            </div>
            <div style="text-align: right;">
              <span style="font-weight: bold; color: var(--accent);">${custOrders.length} Order(s)</span>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border);">
                <th style="padding: 0.5rem;">Order #</th>
                <th style="padding: 0.5rem;">Items</th>
                <th style="padding: 0.5rem;">Total</th>
                <th style="padding: 0.5rem;">Status</th>
                <th style="padding: 0.5rem;">Actions</th>
              </tr>
            </thead>
            <tbody>
      `;

      custOrders.forEach(o => {
        const itemsList = o.cart.map(i => `${i.title} (x${i.quantity})`).join(', ');
        html += `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 0.5rem;">#${o.id}</td>
            <td style="padding: 0.5rem;">${itemsList}</td>
            <td style="padding: 0.5rem;">$${o.total.toFixed(2)}</td>
            <td style="padding: 0.5rem;">
              <span style="font-weight: bold; color: ${o.status === 'Completed' ? 'var(--accent)' : 'var(--muted)'};">
                ${o.status}
              </span>
            </td>
            <td style="padding: 0.5rem; display: flex; gap: 0.5rem;">
              ${o.status !== 'Completed' ? `<button class="btn complete-btn" data-id="${o.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Complete</button>` : ''}
              <button class="btn btn-ghost delete-btn" data-id="${o.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; color: #ff4444; border-color: #ff4444;">Remove</button>
            </td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    });

    html += `</div>`;
    contentDiv.innerHTML = html;
    attachActionListeners();
  }

  function attachActionListeners() {
    document.querySelectorAll('.complete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Mark Order #${id} as Completed and send email?`)) {
          e.target.disabled = true;
          e.target.innerText = "Processing...";
          await fetch(`/api/admin/orders/${id}/complete`, { method: 'POST' });
          await loadData();
        }
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Are you sure you want to permanently delete Order #${id}?`)) {
          await fetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
          await loadData();
        }
      });
    });

    document.querySelectorAll('.delete-customer-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm(`Are you sure you want to permanently delete Customer #${id} and ALL of their orders?`)) {
          await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
          await loadData();
        }
      });
    });
  }

  // Event Listeners
  viewOrdersBtn.addEventListener('click', () => {
    currentView = 'orders';
    viewOrdersBtn.classList.remove('btn-ghost');
    viewCustomersBtn.classList.add('btn-ghost');
    viewCombinedBtn.classList.add('btn-ghost');
    render();
  });

  viewCustomersBtn.addEventListener('click', () => {
    currentView = 'customers';
    viewCustomersBtn.classList.remove('btn-ghost');
    viewOrdersBtn.classList.add('btn-ghost');
    viewCombinedBtn.classList.add('btn-ghost');
    render();
  });

  viewCombinedBtn.addEventListener('click', () => {
    currentView = 'combined';
    viewCombinedBtn.classList.remove('btn-ghost');
    viewOrdersBtn.classList.add('btn-ghost');
    viewCustomersBtn.classList.add('btn-ghost');
    render();
  });

  resetOrdersBtn.addEventListener('click', async () => {
    if (confirm("🚨 WARNING: Are you absolutely sure you want to delete ALL orders? The next order will start at #1 again. This cannot be undone.")) {
      try {
        resetOrdersBtn.disabled = true;
        resetOrdersBtn.innerText = "Resetting...";
        const res = await fetch('/api/admin/reset_orders', { method: 'DELETE' });
        if (res.ok) {
          alert('All orders have been deleted and the order ID counter has been reset.');
          await loadData();
        } else {
          const err = await res.json();
          alert('Error resetting orders: ' + err.error);
        }
      } catch (e) {
        alert('Error resetting orders: ' + e.message);
      } finally {
        resetOrdersBtn.disabled = false;
        resetOrdersBtn.innerText = "Reset All Orders";
      }
    }
  });

  filterCustomer.addEventListener('change', render);
  filterProduct.addEventListener('change', render);

  // Initial load
  loadData();
});
