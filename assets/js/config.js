/**
 * BDC IMS Frontend Configuration
 * Single source of truth for all API endpoints and configuration
 *
 * TO CHANGE API ENDPOINT:
 * Simply update the API_BASE_URL below and refresh the application
 */

window.BDC_CONFIG = {
    // API Configuration
    API_BASE_URL: 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php',
    FRONTEND_LOGIN_URL: 'https://ims.bdcms.bharatdatacenter.com/Ims_frontend/',

    // Alternative endpoints (uncomment to switch)
    // API_BASE_URL: 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php',
    // API_BASE_URL: 'http://localhost:8000/api/api.php', // Local development

    // LocalStorage Keys
    STORAGE_KEYS: {
        TOKEN: 'bdc_token',
        REFRESH_TOKEN: 'bdc_refresh_token',
        USER: 'bdc_user',
        THEME: 'theme',
        REMEMBER_ME: 'bdc_remember_me'
    },

    // Application Settings
    APP_NAME: 'BDC Inventory Management System',
    VERSION: '1.0.0',

    // Set to true ONLY during local development to enable debug logging.
    // SECURITY: Never deploy with DEBUG_MODE: true — debug logs expose internal
    // state (user objects, permission names, API request details) in the console.
    DEBUG_MODE: false
};

// Make config immutable to prevent accidental modification
Object.freeze(window.BDC_CONFIG);
Object.freeze(window.BDC_CONFIG.STORAGE_KEYS);
