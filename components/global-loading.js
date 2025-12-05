/**
 * Global Loading Manager
 * Unified loading system for the entire application
 * Handles API calls, page transitions, and manual loading states
 */

class GlobalLoadingManager {
    constructor() {
        this.activeRequests = 0;
        this.isManualLoading = false;
        this.overlay = null;
        this.messageElement = null;
        this.spinnerElement = null;
        this.currentMessage = 'Loading...';
        this.init();
    }

    init() {
        // Create loading overlay on page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createOverlay());
        } else {
            this.createOverlay();
        }

        // Setup axios interceptors for automatic API loading
        this.setupAxiosInterceptors();
    }

    createOverlay() {
        // Check if overlay already exists
        if (document.getElementById('globalLoadingOverlay')) {
            this.overlay = document.getElementById('globalLoadingOverlay');
            this.messageElement = this.overlay.querySelector('.loading-message');
            this.spinnerElement = this.overlay.querySelector('.loading-spinner');
            return;
        }

        // Create overlay HTML - Clean, modern design matching project theme
        const overlay = document.createElement('div');
        overlay.id = 'globalLoadingOverlay';
        overlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] hidden transition-all duration-300 ease-out';

        overlay.innerHTML = `
            <div class="relative">
                <!-- Main loading card -->
                <div class="bg-surface-card rounded-xl shadow-2xl border border-border p-8 min-w-[280px] max-w-sm">
                    <!-- Spinner with server icon -->
                    <div class="relative mx-auto mb-5 w-20 h-20 flex items-center justify-center">
                        <!-- Single spinning ring -->
                        <div class="absolute inset-0 rounded-full border-3 border-border border-t-primary animate-spin"></div>

                        <!-- Center server icon -->
                        <div class="relative z-10 w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                            <i class="fas fa-server text-white text-lg"></i>
                        </div>
                    </div>

                    <!-- Loading text -->
                    <div class="text-center space-y-2">
                        <h3 class="loading-message text-lg font-semibold text-text-primary">
                            Loading...
                        </h3>
                        <p class="text-text-secondary text-sm">
                            Connecting to server
                        </p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.messageElement = overlay.querySelector('.loading-message');
        this.spinnerElement = overlay.querySelector('.loading-spinner');
    }

    show(message = 'Loading...') {
        if (!this.overlay) {
            this.createOverlay();
        }

        this.isManualLoading = true;
        this.currentMessage = message;

        if (this.messageElement) {
            this.messageElement.textContent = message;
        }

        // Show overlay with fade-in
        this.overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            this.overlay.style.opacity = '1';
        });
    }

    hide() {
        this.isManualLoading = false;

        // Only hide if no active API requests
        if (this.activeRequests === 0 && this.overlay) {
            this.overlay.style.opacity = '0';
            setTimeout(() => {
                if (this.activeRequests === 0 && !this.isManualLoading) {
                    this.overlay.classList.add('hidden');
                }
            }, 300); // Match transition duration
        }
    }

    showLoading(show = true, message = 'Loading...') {
        if (show) {
            this.show(message);
        } else {
            this.hide();
        }
    }

    isLoading() {
        return !this.overlay?.classList.contains('hidden') || this.activeRequests > 0 || this.isManualLoading;
    }

    setupAxiosInterceptors() {
        // Wait for axios to be available
        const setupInterceptors = () => {
            if (typeof axios === 'undefined') {
                setTimeout(setupInterceptors, 100);
                return;
            }

            // Request interceptor
            axios.interceptors.request.use(
                (config) => {
                    this.activeRequests++;

                    // Don't show loading for silent requests
                    if (!config.silent) {
                        const message = config.loadingMessage || 'Loading...';
                        if (this.messageElement) {
                            this.messageElement.textContent = message;
                        }

                        if (!this.isManualLoading && this.overlay) {
                            this.overlay.classList.remove('hidden');
                            requestAnimationFrame(() => {
                                this.overlay.style.opacity = '1';
                            });
                        }
                    }

                    return config;
                },
                (error) => {
                    this.activeRequests--;
                    if (this.activeRequests === 0 && !this.isManualLoading) {
                        this.hide();
                    }
                    return Promise.reject(error);
                }
            );

            // Response interceptor
            axios.interceptors.response.use(
                (response) => {
                    this.activeRequests--;
                    if (this.activeRequests === 0 && !this.isManualLoading) {
                        this.hide();
                    }
                    return response;
                },
                (error) => {
                    this.activeRequests--;
                    if (this.activeRequests === 0 && !this.isManualLoading) {
                        this.hide();
                    }
                    return Promise.reject(error);
                }
            );
        };

        setupInterceptors();
    }

    // Reset all loading states (useful for navigation)
    reset() {
        this.activeRequests = 0;
        this.isManualLoading = false;
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            setTimeout(() => {
                this.overlay.classList.add('hidden');
            }, 300);
        }
    }
}

// Create global instance
window.globalLoading = new GlobalLoadingManager();

// Expose global functions for backward compatibility
window.showLoading = (show = true, message = 'Loading...') => {
    window.globalLoading.showLoading(show, message);
};

window.hideLoading = () => {
    window.globalLoading.hide();
};
