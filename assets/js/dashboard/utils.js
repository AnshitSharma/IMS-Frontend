/**
 * Utility Functions for BDC Inventory Management System
 */

window.utils = {
    /**
     * Show a notification. Always a toast.
     *
     * `toast.js` loads before this file on every page that loads it, and assigns
     * `window.toast` at top level, so the old `#alertContainer` DOM fallback that
     * used to live here could never run — it was deleted rather than left as a
     * second, drifting notification renderer.
     *
     * `title` is accepted and ignored. The toast API takes no title, so it has
     * been dropped on every page since toasts were adopted; the parameter stays
     * only because callers pass it positionally before `duration`.
     */
    showAlert(message, type = 'info', title = '', duration = 5000) {
        switch (type) {
            case 'success':
                return window.toast.success(message, duration);
            case 'error':
                return window.toast.error(message, duration);
            case 'warning':
                return window.toast.warning(message, duration);
            case 'info':
            default:
                return window.toast.info(message, duration);
        }
    },

    // Show/Hide loading. The global loading manager (components/global-loading.js)
    // is the only loading UI in the app; the per-page #loadingOverlay it replaced
    // is gone, along with the fallback that used to drive it.
    showLoading(show = true, message = 'Loading...') {
        if (window.globalLoading) {
            window.globalLoading.showLoading(show, message);
        }
    },

    // Check if loading is currently visible
    isLoading() {
        return window.globalLoading ? window.globalLoading.isLoading() : false;
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

    // Render a value as a JS literal safe to drop into an inline onclick
    // attribute. escapeHtml() alone is not enough: it turns ' into &#039;, which
    // the browser decodes back to a real quote before the handler is parsed, so a
    // value containing one would still break out of the string. JS-escape first,
    // then HTML-escape the attribute delimiters. Absent values become `null` so
    // the receiving parameter falls back to its default.
    jsArg(value) {
        if (value === null || value === undefined || value === '') return 'null';
        const js = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `'${js.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}'`;
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
            this.showAlert('Failed to copy to clipboard', 'error');
            return false;
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
                <div class="modal-content max-w-md mx-4">
                    <div class="modal-header">
                        <h3 class="text-xl font-semibold text-text-primary">${this.escapeHtml(title)}</h3>
                    </div>
                    <div class="modal-body">
                        <p class="mb-6 text-text-secondary leading-relaxed">${this.escapeHtml(message)}</p>
                        <div class="flex gap-3 justify-end">
                            <button class="btn-secondary" id="${modalId}_cancel">Cancel</button>
                            <button class="btn-danger" id="${modalId}_confirm">Confirm</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Trigger animation
            setTimeout(() => {
                modal.style.opacity = '1';
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.style.transform = 'scale(1)';
                    content.style.opacity = '1';
                }
            }, 10);

            const handleConfirm = () => {
                modal.style.opacity = '0';
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.style.transform = 'scale(0.95)';
                    content.style.opacity = '0';
                }
                setTimeout(() => {
                    modal.remove();
                    resolve(true);
                }, 200);
            };

            const handleCancel = () => {
                modal.style.opacity = '0';
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.style.transform = 'scale(0.95)';
                    content.style.opacity = '0';
                }
                setTimeout(() => {
                    modal.remove();
                    resolve(false);
                }, 200);
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
    /**
     * Where each component type's ims-data spec file lives, as a URL.
     *
     * Served by dashboard-type-manifest, whose spec_url comes straight from
     * ComponentSpecPaths.php — the one map entitled to say. There were five
     * hand-typed copies of this in the frontend and three of them had already
     * lost `serverplatform`, in one case under a comment claiming it mirrored
     * the PHP file. ims-data filenames are irregular BY DESIGN
     * (Cpu-details-level-3.json, chasis-level-3.json with its load-bearing
     * typo), so a copy that drifts fails as a silent 404, not as an error.
     *
     * Fetched once per page and cached as a promise, so concurrent callers
     * share one request.
     *
     * @returns {Promise<Object<string,string>>} type -> URL, {} if unavailable
     */
    specPaths() {
        if (!this._specPathsPromise) {
            this._specPathsPromise = (async () => {
                try {
                    const result = await window.api.request('dashboard-type-manifest');
                    const types = result?.data?.types || [];
                    const paths = {};
                    types.forEach(entry => {
                        if (entry.type && entry.spec_url) {
                            paths[entry.type] = '/' + String(entry.spec_url).replace(/^\/+/, '');
                        }
                    });
                    if (Object.keys(paths).length) return paths;
                } catch (error) {
                    console.warn('[specPaths] manifest unavailable, using fallback', error);
                }
                return Object.assign({}, utils.SPEC_PATHS_FALLBACK);
            })();
        }
        return this._specPathsPromise;
    },

    /** One type's spec URL, or null. */
    async specPathFor(componentType) {
        if (!componentType) return null;
        const paths = await utils.specPaths();
        return paths[String(componentType).toLowerCase()] || null;
    },

    /**
     * Last resort only — used when the manifest cannot be reached (offline, a
     * user without dashboard.view, a backend that predates spec_url). Kept in
     * step with ComponentSpecPaths.php by hand; the API is the authority.
     */
    SPEC_PATHS_FALLBACK: {
        cpu: '/ims-data/cpu/Cpu-details-level-3.json',
        motherboard: '/ims-data/motherboard/motherboard-level-3.json',
        ram: '/ims-data/ram/ram_detail.json',
        storage: '/ims-data/storage/storage-level-3.json',
        nic: '/ims-data/nic/nic-level-3.json',
        caddy: '/ims-data/caddy/caddy_details.json',
        pciecard: '/ims-data/pciecard/pci-level-3.json',
        risercard: '/ims-data/risercard/riser-level-3.json',
        hbacard: '/ims-data/hbacard/hbacard-level-3.json',
        sfp: '/ims-data/sfp/sfp-level-3.json',
        chassis: '/ims-data/chassis/chasis-level-3.json',
        serverplatform: '/ims-data/serverplatform/server-platform-level-3.json'
    },

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
        },

        // Point the toggle icon at the CURRENT theme: sun while dark (click for light),
        // moon while light. A page without the icon is fine -- nothing to update.
        updateIcon(theme) {
            const icon = document.getElementById('themeToggleIcon');
            if (!icon) return;
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        },

        /**
         * Apply the stored theme and wire the toggle button.
         *
         * This used to be a 60-odd-line IIFE pasted at the bottom of seventeen pages, in
         * three textual variants that all behaved identically. It is called automatically
         * on DOMContentLoaded below, so a page needs no theme script of its own -- just
         * the #themeToggleBtn / #themeToggleIcon markup.
         *
         * Idempotent, and deliberately so: navbar.js injects its markup by fetch, i.e.
         * AFTER this has already run and found no button, so it calls this again once the
         * button exists. The flag is what stops a page that somehow mounts twice from
         * registering two click listeners and toggling the theme straight back.
         */
        mountToggle() {
            this.init();
            const btn = document.getElementById('themeToggleBtn');
            if (!btn || btn.dataset.themeToggleBound === '1') return;
            btn.dataset.themeToggleBound = '1';
            this.updateIcon(this.get());

            btn.addEventListener('click', () => {
                btn.classList.add('toggling');
                setTimeout(() => btn.classList.remove('toggling'), 300);

                const newTheme = this.toggle();
                this.updateIcon(newTheme);

                if (typeof toast !== 'undefined') {
                    toast.success(newTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled', 2000);
                }
            });
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
    },

    // Logger utility — gates debug output on BDC_CONFIG.DEBUG_MODE.
    // SECURITY: Use utils.logger.log() instead of bare console.log() for any output
    // that could expose internal state (user objects, tokens, permission names).
    // console.error is always active as errors signal genuine failures, not debug traces.
    logger: {
        log(...args) {
            if (window.BDC_CONFIG && window.BDC_CONFIG.DEBUG_MODE) {
                console.log(...args);
            }
        },
        warn(...args) {
            if (window.BDC_CONFIG && window.BDC_CONFIG.DEBUG_MODE) {
                console.warn(...args);
            }
        },
        error(...args) {
            console.error(...args);
        }
    },

    // The 12 component types and their display names, in sidebar order. Keys
    // match VALID_COMPONENT_TYPES in the backend. This is the only copy: the
    // shared component page takes its <title> and heading from here, and so does
    // the vendor "sells" picker.
    componentLabels: {
        cpu: 'CPUs',
        ram: 'RAM',
        storage: 'Storage',
        motherboard: 'Motherboards',
        nic: 'Network Cards',
        caddy: 'Caddies',
        chassis: 'Chassis',
        pciecard: 'PCIe Cards',
        risercard: 'Riser Cards',
        hbacard: 'HBA Cards',
        sfp: 'SFP Modules',
        serverplatform: 'Server Compute Platforms'
    },

    // Which page this is, as the slug the rest of the app keys off.
    //
    // The 12 component inventories were 12 near-identical HTML files; they are now
    // one page, component.html?type=cpu, so the slug comes from the query string
    // there and from the filename everywhere else. The old per-type URLs still
    // exist as redirects, so a bookmark or an old link keeps working.
    currentPageSlug() {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        if (page === 'component.html') {
            const type = new URLSearchParams(window.location.search).get('type');
            return this.componentLabels[type] ? type : null;
        }
        return page.replace('.html', '');
    }
};

// Initialize theme and wire its toggle on page load. mountToggle() calls init() itself,
// so the theme is applied whether or not the page has a toggle button.
document.addEventListener('DOMContentLoaded', () => {
    utils.theme.mountToggle();
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