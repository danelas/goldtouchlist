'use strict';

let users = [];
let filtered = [];
let userIdToDelete = null;

const els = {
  tbody: document.getElementById('usersTBody'),
  search: document.getElementById('searchInput'),
  refresh: document.getElementById('refreshBtn'),
  alert: document.getElementById('alert'),
  modal: document.getElementById('deleteModal'),
  modalName: document.getElementById('userToDeleteName'),
  cancelDelete: document.getElementById('cancelDeleteBtn'),
  confirmDelete: document.getElementById('confirmDeleteBtn'),
};

function showAlert(message, type = 'success') {
  if (!els.alert) return;
  els.alert.textContent = message;
  els.alert.className = '';
  els.alert.classList.add('mb-4', 'px-4', 'py-3', 'rounded-md');
  if (type === 'success') {
    els.alert.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
  } else {
    els.alert.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
  }
  els.alert.classList.remove('hidden');
  setTimeout(() => {
    els.alert.classList.add('hidden');
  }, 4000);
}

async function loadUsers() {
  try {
    els.tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Loading users...</td></tr>';
    const res = await fetch('/api/providers/admin/all', { credentials: 'include' });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.error || `Failed to load users (${res.status})`);
    }
    const data = await res.json();
    users = Array.isArray(data.providers) ? data.providers : [];
    filtered = [...users];
    render();
  } catch (e) {
    console.error('loadUsers error', e);
    els.tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to load users</td></tr>';
    showAlert(e.message || 'Failed to load users', 'error');
  }
}

function render() {
  const rows = filtered.map(u => {
    const safe = h => (h ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const status = u.is_verified ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Verified</span>' : '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>';
    return `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900">${safe(u.name || 'N/A')}</div>
          <div class="text-xs text-gray-500">ID: ${safe(u.id)}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-900">${safe(u.email || 'N/A')}</div></td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-900">${safe(u.phone || 'N/A')}</div></td>
        <td class="px-6 py-4 whitespace-nowrap">${status}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button data-action="delete" data-id="${safe(u.id)}" data-name="${safe(u.name || 'this user')}" class="text-red-600 hover:text-red-900">
            <i class="fas fa-trash"></i> Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
  els.tbody.innerHTML = rows || '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No users found.</td></tr>';
}

function filterUsers(term) {
  const q = term.trim().toLowerCase();
  if (!q) { filtered = [...users]; render(); return; }
  filtered = users.filter(u =>
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.email && u.email.toLowerCase().includes(q)) ||
    (u.phone && String(u.phone).toLowerCase().includes(q)) ||
    (u.id && String(u.id).toLowerCase().includes(q))
  );
  render();
}

function openDeleteModal(id, name) {
  userIdToDelete = id;
  els.modalName.textContent = name || 'this user';
  els.modal.classList.remove('hidden');
}

function closeDeleteModal() {
  els.modal.classList.add('hidden');
  userIdToDelete = null;
}

async function deleteUser() {
  if (!userIdToDelete) return;
  try {
    const res = await fetch(`/api/providers/admin/${encodeURIComponent(userIdToDelete)}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    const body = await safeJson(res);
    if (!res.ok) {
      throw new Error(body?.error || body?.message || `Failed to delete (${res.status})`);
    }
    showAlert(body?.message || 'User deleted successfully');
    closeDeleteModal();
    await loadUsers();
  } catch (e) {
    console.error('deleteUser error', e);
    showAlert(e.message || 'Failed to delete user', 'error');
  }
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

function setupEvents() {
  els.search.addEventListener('input', debounce(() => filterUsers(els.search.value), 250));
  els.refresh.addEventListener('click', () => loadUsers());
  els.cancelDelete.addEventListener('click', () => closeDeleteModal());
  els.confirmDelete.addEventListener('click', () => deleteUser());
  els.tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const name = btn.getAttribute('data-name');
    openDeleteModal(id, name);
  });
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadUsers();
});
