/**
 * BDC IMS Frontend Configuration
 * Single source of truth for all API endpoints and configuration
 *
 * TO CHANGE API ENDPOINT:
 * Simply update the API_BASE_URL below and refresh the application
 */

window.BDC_CONFIG = {
    // API Configuration
    // Switch between 'bdc_ims' (production) and 'bdc_ims_dev' (development)
    API_BASE_URL: 'https://shubham.staging.cloudmate.in/bdc_ims_dev/api/api.php',

    // Alternative endpoints (uncomment to switch)
    // API_BASE_URL: 'https://shubham.staging.cloudmate.in/bdc_ims/api/api.php',
    // API_BASE_URL: 'http://localhost:8000/api/api.php', // Local development

    // LocalStorage Keys
    STORAGE_KEYS: {
        TOKEN: 'bdc_token',
        REFRESH_TOKEN: 'bdc_refresh_token',
        USER: 'bdc_user',
        THEME: 'theme'
    },

    // Application Settings
    APP_NAME: 'BDC Inventory Management System',
    VERSION: '1.0.0'
};

// Make config immutable to prevent accidental modification
Object.freeze(window.BDC_CONFIG);
Object.freeze(window.BDC_CONFIG.STORAGE_KEYS);

console.log('BDC Config loaded:', window.BDC_CONFIG.API_BASE_URL);
