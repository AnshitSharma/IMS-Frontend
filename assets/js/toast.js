/**
 * Standardized Toast Notification System for BDC IMS
 * Neutral & Relaxing Color Palette
 */

class ToastNotification {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.init();
    }

    init() {
        // Create toast container if it doesn't exist
        if (!document.querySelector('.toast-container')) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.querySelector('.toast-container');
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in milliseconds (default: 4000)
     */
    show(message, type = 'info', duration = 4000) {
        const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const titleMap = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };

        const toastHtml = `
            <div class="toast toast-${type}" id="${toastId}">
                <div class="toast-icon">
                    <i class="fas ${iconMap[type]}"></i>
                </div>
                <div class="toast-content">
                    <div class="toast-title">${titleMap[type]}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="toastNotification.close('${toastId}')">
                    <i class="fas fa-times"></i>
                </button>
                <div class="toast-progress"></div>
            </div>
        `;

        this.container.insertAdjacentHTML('beforeend', toastHtml);
        const toast = document.getElementById(toastId);
        this.toasts.push(toastId);

        // Trigger entrance animation by setting initial state
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';

        // Animate in
        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease-out';
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
            toast.classList.add('show');
        }, 10);

        // Auto remove after duration
        setTimeout(() => {
            this.close(toastId);
        }, duration);

        return toastId;
    }

    /**
     * Close a specific toast
     * @param {string} toastId - The ID of the toast to close
     */
    close(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.classList.remove('show');
            toast.classList.add('hide');

            // Animate out
            toast.style.transition = 'all 0.3s ease-in';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';

            setTimeout(() => {
                toast.remove();
                this.toasts = this.toasts.filter(id => id !== toastId);
            }, 300);
        }
    }

    /**
     * Close all toasts
     */
    closeAll() {
        this.toasts.forEach(toastId => this.close(toastId));
    }

    /**
     * Show success toast
     * @param {string} message
     */
    success(message, duration = 4000) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error toast
     * @param {string} message
     */
    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning toast
     * @param {string} message
     */
    warning(message, duration = 4500) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info toast
     * @param {string} message
     */
    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    }
}

// Create global instance
const toastNotification = new ToastNotification();

// Create convenient global alias
window.toast = toastNotification;

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastNotification;
}
