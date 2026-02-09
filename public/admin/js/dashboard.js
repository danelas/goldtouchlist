// Global variables
let currentPage = 1;
const itemsPerPage = 10;
let users = [];
let filteredUsers = [];
let userIdToDelete = null;

// DOM Elements
const usersTableBody = document.getElementById('usersTableBody');
const searchInput = document.getElementById('searchUsers');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const startItemSpan = document.getElementById('startItem');
const endItemSpan = document.getElementById('endItem');
const totalItemsSpan = document.getElementById('totalItems');

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', function() {
    loadUsers();
    setupEventListeners();
});

// Set up event listeners
function setupEventListeners() {
    // Search input debounce
    let searchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(searchUsers, 300);
    });
}

// API base URL
const API_BASE_URL = 'https://pay.goldtouchlist.com';

// Load users from the API
async function loadUsers() {
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/providers/admin/all`, {
            credentials: 'include' // Include cookies for authentication
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        users = data.providers || [];
        filteredUsers = [...users];
        
        updateTable();
        updatePagination();
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Search users based on input
function searchUsers() {
    const searchTerm = searchInput.value.toLowerCase();
    
    if (!searchTerm) {
        filteredUsers = [...users];
    } else {
        filteredUsers = users.filter(user => 
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm)) ||
            (user.phone && user.phone.toLowerCase().includes(searchTerm))
        );
    }
    
    currentPage = 1; // Reset to first page when searching
    updateTable();
    updatePagination();
}

// Update the users table
function updateTable() {
    if (!filteredUsers.length) {
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No users found.
                </td>
            </tr>`;
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedUsers = filteredUsers.slice(start, end);

    usersTableBody.innerHTML = paginatedUsers.map(user => {
        const safeName = escapeHtml(user.name || 'this user');
        return `
        <tr class="hover:bg-gray-50" id="user-row-${user.id}">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">${escapeHtml(user.name || 'N/A')}</div>
                        <div class="text-sm text-gray-500">ID: ${user.id}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${escapeHtml(user.email || 'N/A')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${escapeHtml(user.phone || 'N/A')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${user.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    ${user.is_verified ? 'Verified' : 'Pending'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button onclick="editUser('${user.id}')" class="text-blue-600 hover:text-blue-900 mr-4">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button onclick="confirmDeleteUser('${user.id}', '${safeName.replace(/'/g, "\\'")}')" 
                        class="text-red-600 hover:text-red-900">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    
    // Update pagination buttons
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    
    // Update item counts
    const startItem = filteredUsers.length ? ((currentPage - 1) * itemsPerPage) + 1 : 0;
    const endItem = Math.min(currentPage * itemsPerPage, filteredUsers.length);
    
    startItemSpan.textContent = startItem;
    endItemSpan.textContent = endItem;
    totalItemsSpan.textContent = filteredUsers.length;
}

// Change page
function changePage(direction) {
    const newPage = currentPage + direction;
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    
    if (newPage > 0 && newPage <= totalPages) {
        currentPage = newPage;
        updateTable();
        updatePagination();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Show add user modal
function showAddUserModal() {
    document.getElementById('modalTitle').textContent = 'Add New User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userModal').classList.remove('hidden');
}

// Edit user
function editUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    document.getElementById('name').value = user.name || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('status').value = user.is_verified ? 'active' : 'inactive';
    
    document.getElementById('userModal').classList.remove('hidden');
}

// Close modal
function closeModal() {
    document.getElementById('userModal').classList.add('hidden');
}

// Save user (add/edit)
async function saveUser(event) {
    event.preventDefault();
    
    const userId = document.getElementById('userId').value;
    const isEdit = !!userId;
    
    const userData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        is_verified: document.getElementById('status').value === 'active'
    };
    
    try {
        showLoading(true);
        let response;
        
        if (isEdit) {
            // Update existing user
            response = await fetch(`/api/providers/admin/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });
        } else {
            // Create new user
            response = await fetch('/api/providers/admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save user');
        }
        
        closeModal();
        await loadUsers(); // Refresh the user list
        showNotification(`User ${isEdit ? 'updated' : 'created'} successfully!`, 'success');
    } catch (error) {
        console.error('Error saving user:', error);
        showError(error.message || 'Failed to save user. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Confirm delete user
function confirmDeleteUser(userId, userName) {
    try {
        console.log('Delete button clicked for user:', { userId, userName });
        userIdToDelete = userId;
        
        // Ensure the modal elements exist
        const userNameElement = document.getElementById('userToDelete');
        const deleteModal = document.getElementById('deleteModal');
        
        if (!userNameElement || !deleteModal) {
            console.error('Delete modal elements not found');
            showError('Error: Could not find delete confirmation dialog');
            return;
        }
        
        // Update the modal content
        userNameElement.textContent = userName || 'this user';
        
        // Show the modal
        deleteModal.classList.remove('hidden');
        console.log('Delete confirmation modal shown');
    } catch (error) {
        console.error('Error in confirmDeleteUser:', error);
        showError('Error preparing delete confirmation');
    }
}

// Close delete confirmation modal
function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
    userIdToDelete = null;
}

// Delete user
async function confirmDelete() {
    if (!userIdToDelete) return;
    
    try {
        showLoading(true);
        console.log('Attempting to delete user with ID:', userIdToDelete);
        
        const response = await fetch(`${API_BASE_URL}/api/providers/admin/${encodeURIComponent(userIdToDelete)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            mode: 'cors'
        });
        
        console.log('Delete response status:', response.status);
        
        if (!response.ok) {
            let errorMessage = 'Failed to delete user';
            try {
                const errorData = await response.json();
                console.error('Error response:', errorData);
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        console.log('Delete successful:', result);
        
        closeDeleteModal();
        await loadUsers(); // Refresh the user list
        showNotification(result.message || 'User deleted successfully!', 'success');
    } catch (error) {
        console.error('Error deleting user:', error);
        showError(error.message || 'Failed to delete user. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Refresh users
function refreshUsers() {
    currentPage = 1;
    searchInput.value = '';
    loadUsers();
}

// Show loading state
function showLoading(isLoading) {
    // You can implement a global loading spinner if needed
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if (isLoading) {
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    });
}

// Show success/error notification
function showNotification(message, type = 'success') {
    // You can implement a toast notification system here
    alert(`${type.toUpperCase()}: ${message}`);
}

// Show error message
function showError(message) {
    showNotification(message, 'error');
}

// Logout
function logout() {
    // Implement logout functionality
    window.location.href = '/login';
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
