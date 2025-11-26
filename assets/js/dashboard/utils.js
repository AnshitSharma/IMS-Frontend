/**
 * Utility Functions for BDC Inventory Management System
 */

window.utils = {
    // Show alert notifications
    showAlert(message, type = 'info', title = '', duration = 5000) {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;

        const alertId = 'alert_' + Date.now();
        const alert = document.createElement('div');
        alert.className = `alert ${type}`;
        alert.id = alertId;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        const titles = {
            success: title || 'Success',
            error: title || 'Error',
            warning: title || 'Warning',
            info: title || 'Information'
        };

        alert.innerHTML = `
            <div class="alert-icon">
                <i class="${icons[type]}"></i>
            </div>
            <div class="alert-content">
                <div class="alert-title">${titles[type]}</div>
                <div class="alert-message">${message}</div>
            </div>
            <button class="alert-close" onclick="utils.closeAlert('${alertId}')">
                <i class="fas fa-times"></i>
            </button>
        `;

        alertContainer.appendChild(alert);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.closeAlert(alertId);
            }, duration);
        }

        return alertId;
    },

    // Close specific alert
    closeAlert(alertId) {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.style.transform = 'translateX(100%)';
            alert.style.opacity = '0';
            setTimeout(() => {
                alert.remove();
            }, 300);
        }
    },

    // Show/Hide loading overlay
    showLoading(show = true, message = 'Loading...') {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (!loadingOverlay) return;

        if (show) {
            loadingOverlay.querySelector('p').textContent = message;
            loadingOverlay.style.display = 'flex';
        } else {
            loadingOverlay.style.display = 'none';
        }
    },

    // Format date strings
    formatDate(dateString, format = 'short') {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';

        const options = {
            short: { year: 'numeric', month: 'short', day: 'numeric' },
            long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
            time: { hour: '2-digit', minute: '2-digit' }
        };

        return date.toLocaleDateString('en-US', options[format] || options.short);
    },

    // Format relative time (e.g., "2 hours ago")
    formatRelativeTime(dateString) {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        
        return this.formatDate(dateString);
    },

    // Debounce function for search inputs
    debounce(func, wait, immediate) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    },

    // Generate UUID
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // Validate email format
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Validate MAC address format
    isValidMacAddress(mac) {
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        return macRegex.test(mac);
    },

    // Validate IP address format
    isValidIPAddress(ip) {
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    },

    // Get status text and color
    getStatusInfo(status) {
        const statusMap = {
            0: { text: 'Failed', class: 'failed', icon: 'fas fa-times-circle' },
            1: { text: 'Available', class: 'available', icon: 'fas fa-check-circle' },
            2: { text: 'In Use', class: 'in-use', icon: 'fas fa-play-circle' },
            'Draft': { text: 'Draft', class: 'draft', icon: 'fas fa-pencil-alt' },
            'Finalized': { text: 'Finalized', class: 'finalized', icon: 'fas fa-check-double' },
        };
        return statusMap[status] || { text: status, class: 'unknown', icon: 'fas fa-question-circle' };
    },

    // Create status badge HTML
    createStatusBadge(status) {
        const statusInfo = this.getStatusInfo(status);
        return `
            <span class="status-badge ${statusInfo.class}">
                <i class="${statusInfo.icon}"></i>
                ${statusInfo.text}
            </span>
        `;
    },

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        // Handle null, undefined, or non-string values
        if (text === null || text === undefined) {
            return '';
        }

        // Convert to string if not already a string
        text = String(text);

        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },

    // Truncate text with ellipsis
    truncateText(text, maxLength = 50) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    },

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showAlert('Copied to clipboard', 'success', '', 2000);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                this.showAlert('Copied to clipboard', 'success', '', 2000);
                return true;
            } catch (err) {
                this.showAlert('Failed to copy to clipboard', 'error');
                return false;
            } finally {
                document.body.removeChild(textArea);
            }
        }
    },

    // Confirm dialog
    confirm(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            const modalId = 'confirmModal_' + Date.now();
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = modalId;
            modal.innerHTML = `
                <div class="modal" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>${this.escapeHtml(title)}</h3>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 24px; line-height: 1.6;">${this.escapeHtml(message)}</p>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button class="btn btn-secondary" id="${modalId}_cancel">Cancel</button>
                            <button class="btn btn-danger" id="${modalId}_confirm">Confirm</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            modal.style.display = 'flex';

            const handleConfirm = () => {
                modal.remove();
                resolve(true);
            };

            const handleCancel = () => {
                modal.remove();
                resolve(false);
            };

            document.getElementById(`${modalId}_confirm`).addEventListener('click', handleConfirm);
            document.getElementById(`${modalId}_cancel`).addEventListener('click', handleCancel);
            
            // Close on overlay click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleCancel();
            });

            // Close on Escape key
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                    document.removeEventListener('keydown', handleKeyDown);
                }
            };
            document.addEventListener('keydown', handleKeyDown);
        });
    },

    // Storage helpers
    storage: {
        get(key, defaultValue = null) {
            try {
                const value = localStorage.getItem(key);
                return value ? JSON.parse(value) : defaultValue;
            } catch {
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch {
                return false;
            }
        },

        clear() {
            try {
                localStorage.clear();
                return true;
            } catch {
                return false;
            }
        }
    },

    // URL helpers
    updateURLParams(params) {
        const url = new URL(window.location);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
                url.searchParams.set(key, params[key]);
            } else {
                url.searchParams.delete(key);
            }
        });
        window.history.replaceState({}, '', url);
    },

    getURLParams() {
        const params = {};
        const urlParams = new URLSearchParams(window.location.search);
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
        return params;
    },

    // Theme helpers
    theme: {
        get() {
            return utils.storage.get('theme', 'light');
        },

        set(theme) {
            utils.storage.set('theme', theme);
            document.documentElement.setAttribute('data-theme', theme);
        },

        toggle() {
            const current = this.get();
            const newTheme = current === 'light' ? 'dark' : 'light';
            this.set(newTheme);
            return newTheme;
        },

        init() {
            const theme = this.get();
            document.documentElement.setAttribute('data-theme', theme);
        }
    },

    // Validation helpers
    validate: {
        required(value, fieldName = 'Field') {
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                return `${fieldName} is required`;
            }
            return null;
        },

        minLength(value, min, fieldName = 'Field') {
            if (value && value.length < min) {
                return `${fieldName} must be at least ${min} characters`;
            }
            return null;
        },

        maxLength(value, max, fieldName = 'Field') {
            if (value && value.length > max) {
                return `${fieldName} must not exceed ${max} characters`;
            }
            return null;
        },

        email(value, fieldName = 'Email') {
            if (value && !utils.isValidEmail(value)) {
                return `${fieldName} format is invalid`;
            }
            return null;
        },

        macAddress(value, fieldName = 'MAC Address') {
            if (value && !utils.isValidMacAddress(value)) {
                return `${fieldName} format is invalid (e.g., 00:1A:2B:3C:4D:5F)`;
            }
            return null;
        },

        ipAddress(value, fieldName = 'IP Address') {
            if (value && !utils.isValidIPAddress(value)) {
                return `${fieldName} format is invalid`;
            }
            return null;
        }
    },

    // Animation helpers
    animate: {
        fadeIn(element, duration = 300) {
            element.style.opacity = '0';
            element.style.display = 'block';
            
            let start = null;
            const animate = (timestamp) => {
                if (!start) start = timestamp;
                const progress = (timestamp - start) / duration;
                
                element.style.opacity = Math.min(progress, 1);
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            
            requestAnimationFrame(animate);
        },

        fadeOut(element, duration = 300) {
            let start = null;
            const initialOpacity = parseFloat(getComputedStyle(element).opacity);
            
            const animate = (timestamp) => {
                if (!start) start = timestamp;
                const progress = (timestamp - start) / duration;
                
                element.style.opacity = initialOpacity * (1 - Math.min(progress, 1));
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    element.style.display = 'none';
                }
            };
            
            requestAnimationFrame(animate);
        },

        slideDown(element, duration = 300) {
            element.style.height = '0';
            element.style.overflow = 'hidden';
            element.style.display = 'block';
            
            const targetHeight = element.scrollHeight;
            let start = null;
            
            const animate = (timestamp) => {
                if (!start) start = timestamp;
                const progress = (timestamp - start) / duration;
                
                element.style.height = Math.min(progress * targetHeight, targetHeight) + 'px';
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    element.style.height = 'auto';
                    element.style.overflow = 'visible';
                }
            };
            
            requestAnimationFrame(animate);
        }
    }
};

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    utils.theme.init();
});

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    utils.showAlert('An unexpected error occurred. Please try again.', 'error');
    event.preventDefault();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
}