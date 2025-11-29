/**
 * SidebarManager - Centralized sidebar state management and caching
 * Handles count caching, mobile menu logic, and sidebar updates across all pages
 */

class SidebarManager {
    constructor() {
        this.cache = {};
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.cacheTimestamp = null;
        this.localStorageKey = 'bdc_sidebar_counts';
        this.isInitialized = false;
        this.activeComponent = null;
        this.pendingRequests = new Map(); // Prevent duplicate requests
    }

    /**
     * Initialize sidebar manager
     */
    async init() {
        if (this.isInitialized) return;

        // Load from localStorage first
        this.loadFromLocalStorage();

        // Setup mobile menu handlers
        this.setupMobileMenu();

        // Set active component based on current page
        this.setActiveComponent();

        this.isInitialized = true;
    }

    /**
     * Setup mobile menu event handlers
     */
    setupMobileMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const sidebar = document.querySelector('.sidebar');

        if (!hamburgerBtn || !mobileOverlay || !sidebar) {
            console.warn('Sidebar elements not found for mobile menu setup');
            return;
        }

        // Toggle sidebar on hamburger click
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSidebar();
        });

        // Close sidebar when clicking overlay
        mobileOverlay.addEventListener('click', () => {
            this.closeSidebar();
        });

        // Close sidebar on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                this.closeSidebar();
            }
        });

        // Close sidebar when clicking menu items on mobile
        const menuLinks = sidebar.querySelectorAll('.menu-item a');
        menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                // Only auto-close on mobile
                if (window.innerWidth <= 1024) {
                    setTimeout(() => this.closeSidebar(), 100);
                }
            });
        });

        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Close sidebar if resizing to desktop view
                if (window.innerWidth > 1024 && sidebar.classList.contains('active')) {
                    this.closeSidebar();
                }
            }, 250);
        });
    }

    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const hamburgerBtn = document.getElementById('hamburgerBtn');

        if (!sidebar || !mobileOverlay || !hamburgerBtn) return;

        const isActive = sidebar.classList.toggle('active');
        mobileOverlay.classList.toggle('active', isActive);
        hamburgerBtn.classList.toggle('active', isActive);

        // Prevent body scroll when sidebar is open
        document.body.style.overflow = isActive ? 'hidden' : '';
    }

    /**
     * Close sidebar
     */
    closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const hamburgerBtn = document.getElementById('hamburgerBtn');

        if (sidebar) sidebar.classList.remove('active');
        if (mobileOverlay) mobileOverlay.classList.remove('active');
        if (hamburgerBtn) hamburgerBtn.classList.remove('active');

        document.body.style.overflow = '';
    }

    /**
     * Get component counts with intelligent caching
     * Tier 1: Memory cache (5 min)
     * Tier 2: localStorage cache (30 min)
     * Tier 3: API fetch with debouncing
     */
    async getComponentCounts(forceRefresh = false) {
        // Return cached data if valid and not forcing refresh
        if (!forceRefresh && this.isCacheValid()) {
            console.log('[SidebarManager] Using memory cache for counts');
            return this.cache;
        }

        // Check if request is already pending (debounce)
        if (this.pendingRequests.has('counts') && !forceRefresh) {
            console.log('[SidebarManager] Request already pending, waiting...');
            return this.pendingRequests.get('counts');
        }

        // Create the fetch promise
        const fetchPromise = (async () => {
            try {
                console.log('[SidebarManager] Fetching counts from API...');
                const result = await api.dashboard.getData();

                if (result.success && result.data.component_counts) {
                    this.cache = result.data.component_counts;
                    this.cacheTimestamp = Date.now();
                    this.saveToLocalStorage();
                    console.log('[SidebarManager] Counts cached for 5 minutes');
                    return this.cache;
                }

                console.warn('[SidebarManager] API returned no component counts');
                return this.cache;
            } catch (error) {
                console.error('[SidebarManager] Error fetching counts:', error);
                return this.cache;
            } finally {
                this.pendingRequests.delete('counts');
            }
        })();

        // Store pending request
        this.pendingRequests.set('counts', fetchPromise);

        return fetchPromise;
    }

    /**
     * Smart cache invalidation for specific component types
     * @param {string|null} componentType - Specific type to invalidate, or null for full reset
     */
    invalidateCache(componentType = null) {
        if (componentType && this.cache[componentType]) {
            console.log(`[SidebarManager] Invalidating cache for ${componentType}`);
            delete this.cache[componentType];
        } else {
            console.log('[SidebarManager] Invalidating entire cache');
            this.cache = {};
        }
        this.cacheTimestamp = null;
    }

    /**
     * Update sidebar UI with current counts
     */
    updateSidebarCounts(counts) {
        const components = ['cpu', 'ram', 'storage', 'motherboard', 'nic', 'caddy', 'chassis', 'pciecard', 'hbacard', 'servers'];

        components.forEach(component => {
            const countElement = document.getElementById(`${component}Count`);
            if (countElement && counts && counts[component]) {
                countElement.textContent = counts[component].total || 0;
            }
        });
    }

    /**
     * Set active menu item based on current page
     */
    setActiveComponent() {
        // Remove active class from all menu items
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            item.querySelector('a')?.classList.remove('bg-primary-50', 'border-l-4', 'border-primary');
            item.querySelector('a')?.classList.add('hover:bg-slate-50');
        });

        // Get current page
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';

        // Find and activate current page
        const currentMenuItem = document.querySelector(`[data-component="${page.replace('.html', '')}"]`);
        if (currentMenuItem) {
            currentMenuItem.classList.add('active');
            const link = currentMenuItem.querySelector('a');
            if (link && !page.includes('dashboard')) {
                link.classList.add('bg-primary-50', 'border-l-4', 'border-primary');
                link.classList.remove('hover:bg-slate-50');
                // Update text color to primary
                const span = link.querySelector('span');
                if (span) {
                    span.classList.remove('text-slate-700');
                    span.classList.add('text-primary', 'font-medium');
                }
                // Update icon color
                const icon = link.querySelector('i');
                if (icon) {
                    icon.classList.remove('text-slate-600');
                    icon.classList.add('text-primary');
                }
            }
        }

        this.activeComponent = page.replace('.html', '');
    }

    /**
     * Check if cache is still valid
     */
    isCacheValid() {
        if (!this.cacheTimestamp || Object.keys(this.cache).length === 0) {
            return false;
        }

        const age = Date.now() - this.cacheTimestamp;
        const isValid = age < this.cacheExpiry;

        if (isValid) {
            console.log(`[SidebarManager] Cache age: ${Math.round(age / 1000)}s, expires in ${Math.round((this.cacheExpiry - age) / 1000)}s`);
        }

        return isValid;
    }

    /**
     * Save counts to localStorage for cross-session persistence
     */
    saveToLocalStorage() {
        try {
            const data = {
                counts: this.cache,
                timestamp: this.cacheTimestamp
            };
            localStorage.setItem(this.localStorageKey, JSON.stringify(data));
            console.log('[SidebarManager] Counts saved to localStorage');
        } catch (error) {
            console.warn('[SidebarManager] Failed to save to localStorage:', error);
        }
    }

    /**
     * Load counts from localStorage
     */
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.localStorageKey);
            if (!stored) {
                console.log('[SidebarManager] No cached data in localStorage');
                return;
            }

            const { counts, timestamp } = JSON.parse(stored);
            const age = Date.now() - timestamp;
            const thirtyMinutes = 30 * 60 * 1000;

            if (age < thirtyMinutes) {
                this.cache = counts;
                this.cacheTimestamp = timestamp;
                console.log(`[SidebarManager] Loaded from localStorage (age: ${Math.round(age / 1000)}s)`);
            } else {
                console.log('[SidebarManager] localStorage cache expired');
                localStorage.removeItem(this.localStorageKey);
            }
        } catch (error) {
            console.warn('[SidebarManager] Failed to load from localStorage:', error);
            localStorage.removeItem(this.localStorageKey);
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.cache = {};
        this.cacheTimestamp = null;
        this.pendingRequests.clear();
        localStorage.removeItem(this.localStorageKey);
        console.log('[SidebarManager] All caches cleared');
    }

    /**
     * Get cache statistics for debugging
     */
    getCacheStats() {
        return {
            cachedComponents: Object.keys(this.cache).length,
            cacheAge: this.cacheTimestamp ? Math.round((Date.now() - this.cacheTimestamp) / 1000) : 'N/A',
            cacheValid: this.isCacheValid(),
            activeComponent: this.activeComponent,
            pendingRequests: Array.from(this.pendingRequests.keys())
        };
    }
}

// Create global instance
window.sidebarManager = new SidebarManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.sidebarManager.init());
} else {
    window.sidebarManager.init();
}
