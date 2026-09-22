/**
 * Biltong Bites - User Account & Administration Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  const loadingDiv = document.getElementById('account-loading');
  const contentDiv = document.getElementById('account-content');
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  const userRoleBadge = document.getElementById('user-role-badge');
  const logoutBtn = document.getElementById('logout-btn');

  const staffAdminCard = document.getElementById('staff-admin-card');
  const ownerManagementCard = document.getElementById('owner-management-card');
  const usersTableBody = document.getElementById('users-table-body');
  const ordersContainer = document.getElementById('orders-container');
  const ownerAlert = document.getElementById('owner-alert');
  const refreshUsersBtn = document.getElementById('refresh-users-btn');

  // Modal elements
  const modal = document.getElementById('edit-user-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalAlert = document.getElementById('modal-alert');
  const modalForm = document.getElementById('modal-form');
  const modalUserId = document.getElementById('modal-user-id');
  const modalActionType = document.getElementById('modal-action-type');
  const modalRenameFields = document.getElementById('modal-rename-fields');
  const modalNewName = document.getElementById('modal-new-name');
  const modalPasswordFields = document.getElementById('modal-password-fields');
  const modalNewPassword = document.getElementById('modal-new-password');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalSubmitBtn = document.getElementById('modal-submit-btn');

  let currentUser = null;

  // 1. Fetch current profile
  async function loadProfile() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();

      if (!data.authenticated || !data.user) {
        // Not logged in -> redirect to login
        window.location.href = '/login/?redirect=' + encodeURIComponent(window.location.pathname);
        return;
      }

      currentUser = data.user;
      userNameEl.textContent = currentUser.name;
      userEmailEl.textContent = currentUser.email;
      userRoleBadge.textContent = currentUser.role.toUpperCase();

      // Populate editable profile form fields
      const profileNameInput = document.getElementById('profile-name');
      const profilePhoneInput = document.getElementById('profile-phone');
      const profileEmailInput = document.getElementById('profile-email');
      if (profileNameInput) profileNameInput.value = currentUser.name || '';
      if (profilePhoneInput) profilePhoneInput.value = currentUser.phone || '';
      if (profileEmailInput) profileEmailInput.value = currentUser.email || '';

      // Role styling
      if (currentUser.role === 'owner') {
        userRoleBadge.className = 'badge badge-owner';
      } else if (currentUser.role === 'staff') {
        userRoleBadge.className = 'badge badge-staff';
      } else {
        userRoleBadge.className = 'badge badge-pending';
      }

      // Show Admin Dashboard entry card if staff or owner
      if (currentUser.canAccessAdmin) {
        staffAdminCard.style.display = 'block';
      }

      // Show Owner User Management if owner
      if (currentUser.isOwner) {
        ownerManagementCard.style.display = 'block';
        loadUsers();
      }

      // Render orders
      renderOrders(data.orders || []);

      loadingDiv.style.display = 'none';
      contentDiv.style.display = 'block';
    } catch (err) {
      loadingDiv.innerHTML = `<div class="alert alert-danger">Error loading account: ${err.message}</div>`;
    }
  }

  // Profile Form Update Handler
  const profileForm = document.getElementById('profile-form');
  const profileAlert = document.getElementById('profile-alert');
  const saveProfileBtn = document.getElementById('save-profile-btn');

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!profileAlert || !saveProfileBtn) return;
    profileAlert.style.display = 'none';

    const name = (document.getElementById('profile-name')?.value || '').trim();
    const phone = (document.getElementById('profile-phone')?.value || '').trim();
    const currentPassword = document.getElementById('profile-current-password')?.value || '';
    const newPassword = document.getElementById('profile-new-password')?.value || '';

    if (!name) {
      profileAlert.className = 'alert alert-danger';
      profileAlert.textContent = 'Please enter your name.';
      profileAlert.style.display = 'block';
      return;
    }

    if (newPassword && newPassword.length < 6) {
      profileAlert.className = 'alert alert-danger';
      profileAlert.textContent = 'New password must be at least 6 characters.';
      profileAlert.style.display = 'block';
      return;
    }

    if (newPassword && !currentPassword) {
      profileAlert.className = 'alert alert-danger';
      profileAlert.textContent = 'Please enter your current password to set a new password.';
      profileAlert.style.display = 'block';
      return;
    }

    try {
      saveProfileBtn.disabled = true;
      saveProfileBtn.textContent = 'Saving...';

      const res = await fetch('/api/auth/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        profileAlert.className = 'alert alert-danger';
        profileAlert.textContent = data.error || 'Failed to update profile.';
        profileAlert.style.display = 'block';
        return;
      }

      // Update local state
      userNameEl.textContent = name;
      document.getElementById('profile-current-password').value = '';
      document.getElementById('profile-new-password').value = '';
      const passDetails = document.querySelector('.password-change-details');
      if (passDetails) passDetails.open = false;

      profileAlert.className = 'alert alert-success';
      profileAlert.textContent = data.message || 'Profile saved successfully!';
      profileAlert.style.display = 'block';

      setTimeout(() => {
        profileAlert.style.display = 'none';
      }, 5000);
    } catch (err) {
      profileAlert.className = 'alert alert-danger';
      profileAlert.textContent = 'Network error: ' + err.message;
      profileAlert.style.display = 'block';
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = 'Save Profile Changes';
    }
  });

  // 2. Render user's order history
  function renderOrders(orders) {
    if (!ordersContainer) return;

    if (orders.length === 0) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <p style="margin: 0; color: var(--muted); font-size: 1.1rem;">You have not placed any orders yet with this email.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
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
          <td>${new Date(o.created_at).toLocaleDateString()}</td>
          <td>${itemsList || 'Items list unavailable'}</td>
          <td><strong>$${(o.total || 0).toFixed(2)}</strong></td>
          <td>
            <span class="badge ${isCompleted ? 'badge-success' : 'badge-pending'}">
              ${o.status || 'Pending'}
            </span>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    ordersContainer.innerHTML = html;
  }

  // 3. Load all users for Owner
  async function loadUsers() {
    if (!usersTableBody) return;
    try {
      usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">Loading accounts...</td></tr>';
      const res = await fetch('/api/admin/users');
      const data = await res.json();

      if (!res.ok) {
        showOwnerAlert(data.error || 'Failed to load users', 'danger');
        return;
      }

      renderUsersTable(data.users || []);
    } catch (err) {
      showOwnerAlert('Error fetching users: ' + err.message, 'danger');
    }
  }

  function renderUsersTable(users) {
    if (users.length === 0) {
      usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users registered yet.</td></tr>';
      return;
    }

    let html = '';
    users.forEach(u => {
      const isSelf = u.id === currentUser.id;
      const isOwner = u.role === 'owner';
      const isStaff = u.role === 'staff';

      let roleBadgeClass = 'badge-pending';
      if (u.role === 'owner') roleBadgeClass = 'badge-owner';
      if (u.role === 'staff') roleBadgeClass = 'badge-staff';

      html += `
        <tr data-user-id="${u.id}">
          <td><strong>#${u.id}</strong></td>
          <td>
            <strong class="user-row-name">${escapeHtml(u.name)}</strong>
            ${isSelf ? '<span class="badge badge-sm" style="margin-left: 0.35rem; background: var(--surface-raised);">You</span>' : ''}
          </td>
          <td>${escapeHtml(u.email)}</td>
          <td>
            <span class="badge ${roleBadgeClass}">${u.role.toUpperCase()}</span>
          </td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>
          <td style="text-align: right;">
            <div class="admin-actions-group">
              ${!isOwner ? `
                <button class="btn btn-sm ${isStaff ? 'btn-ghost' : 'btn-primary'} toggle-staff-btn" data-id="${u.id}" data-role="${u.role}">
                  ${isStaff ? 'Revoke Staff' : 'Make Staff'}
                </button>
              ` : ''}
              <button class="btn btn-sm btn-ghost rename-user-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">
                Rename
              </button>
              <button class="btn btn-sm btn-ghost reset-pwd-btn" data-id="${u.id}">
                Reset Pwd
              </button>
              ${!isSelf && !isOwner ? `
                <button class="btn btn-sm btn-danger delete-user-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">
                  Delete
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    });

    usersTableBody.innerHTML = html;
    attachUserActionListeners();
  }

  function attachUserActionListeners() {
    // Toggle Staff Role
    document.querySelectorAll('.toggle-staff-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        const currentRole = e.target.getAttribute('data-role');
        const targetRole = currentRole === 'staff' ? 'customer' : 'staff';
        const actionLabel = targetRole === 'staff' ? 'grant Staff privileges to' : 'revoke Staff privileges from';

        if (!confirm(`Are you sure you want to ${actionLabel} this user?`)) return;

        try {
          e.target.disabled = true;
          const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: id, action: 'update_role', role: targetRole }),
          });
          const data = await res.json();
          if (res.ok) {
            showOwnerAlert(data.message, 'success');
            loadUsers();
          } else {
            showOwnerAlert(data.error || 'Failed to update user role', 'danger');
          }
        } catch (err) {
          showOwnerAlert('Error: ' + err.message, 'danger');
        }
      });
    });

    // Rename User modal
    document.querySelectorAll('.rename-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        openRenameModal(id, name);
      });
    });

    // Reset Password modal
    document.querySelectorAll('.reset-pwd-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openPasswordModal(id);
      });
    });

    // Delete User
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');

        if (!confirm(`🚨 Delete user "${name}" (ID #${id}) and all their active sessions? This cannot be undone.`)) {
          return;
        }

        try {
          e.currentTarget.disabled = true;
          const res = await fetch(`/api/admin/users?userId=${id}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          if (res.ok) {
            showOwnerAlert(`User "${name}" deleted successfully.`, 'success');
            loadUsers();
          } else {
            showOwnerAlert(data.error || 'Failed to delete user', 'danger');
          }
        } catch (err) {
          showOwnerAlert('Error deleting user: ' + err.message, 'danger');
        }
      });
    });
  }

  // Modal functions
  function openRenameModal(id, currentName) {
    modalUserId.value = id;
    modalActionType.value = 'rename';
    modalTitle.textContent = `Rename User #${id}`;
    modalNewName.value = currentName;
    modalRenameFields.style.display = 'block';
    modalPasswordFields.style.display = 'none';
    modalAlert.style.display = 'none';
    modal.style.display = 'flex';
    modalNewName.focus();
  }

  function openPasswordModal(id) {
    modalUserId.value = id;
    modalActionType.value = 'reset_password';
    modalTitle.textContent = `Reset Password for User #${id}`;
    modalNewPassword.value = '';
    modalRenameFields.style.display = 'none';
    modalPasswordFields.style.display = 'block';
    modalAlert.style.display = 'none';
    modal.style.display = 'flex';
    modalNewPassword.focus();
  }

  modalCancelBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalAlert.style.display = 'none';

    const userId = modalUserId.value;
    const action = modalActionType.value;
    const payload = { userId, action };

    if (action === 'rename') {
      const name = modalNewName.value.trim();
      if (!name) return;
      payload.name = name;
    } else if (action === 'reset_password') {
      const newPassword = modalNewPassword.value;
      if (newPassword.length < 6) {
        modalAlert.textContent = 'Password must be at least 6 characters.';
        modalAlert.style.display = 'block';
        return;
      }
      payload.newPassword = newPassword;
    }

    try {
      modalSubmitBtn.disabled = true;
      modalSubmitBtn.textContent = 'Saving...';

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        modalAlert.textContent = data.error || 'Failed to update.';
        modalAlert.style.display = 'block';
        return;
      }

      modal.style.display = 'none';
      showOwnerAlert(data.message || 'Updated successfully.', 'success');
      loadUsers();
    } catch (err) {
      modalAlert.textContent = 'Error: ' + err.message;
      modalAlert.style.display = 'block';
    } finally {
      modalSubmitBtn.disabled = false;
      modalSubmitBtn.textContent = 'Save Changes';
    }
  });

  // Logout Handler
  logoutBtn?.addEventListener('click', async () => {
    try {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Logging out...';
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login/';
    } catch (_e) {
      window.location.href = '/login/';
    }
  });

  refreshUsersBtn?.addEventListener('click', loadUsers);

  function showOwnerAlert(msg, type = 'success') {
    if (!ownerAlert) return;
    ownerAlert.className = `alert alert-${type}`;
    ownerAlert.textContent = msg;
    ownerAlert.style.display = 'block';
    setTimeout(() => {
      ownerAlert.style.display = 'none';
    }, 6000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[m]);
  }

  // Load profile on start
  loadProfile();
});
