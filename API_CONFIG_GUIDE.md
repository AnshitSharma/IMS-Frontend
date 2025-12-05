# API Configuration Guide

## Overview
All API endpoints in the BDC IMS Frontend are now centrally managed through a single configuration file.

## How to Switch API Endpoints

### Quick Change (Recommended)
Edit **`assets/js/config.js`** and change the `API_BASE_URL`:

```javascript
window.BDC_CONFIG = {
    // Switch between these options:

    // Option 1: Development API
    API_BASE_URL: 'https://shubham.staging.cloudmate.in/bdc_ims_dev/api/api.php',

    // Option 2: Production API (uncomment to use)
    // API_BASE_URL: 'https://shubham.staging.cloudmate.in/bdc_ims/api/api.php',

    // Option 3: Local Development (uncomment to use)
    // API_BASE_URL: 'http://localhost:8000/api/api.php',
};
```

### After Changing the URL:
1. **Save** the `config.js` file
2. **Clear localStorage**: Open browser console and run:
   ```javascript
   localStorage.clear();
   ```
3. **Refresh** the page
4. **Re-login** to get a new JWT token for the correct API endpoint

### Important Notes
- JWT tokens are **endpoint-specific** - you cannot use a token from `bdc_ims` with `bdc_ims_dev` or vice versa
- Always clear localStorage and re-login after switching endpoints
- The config file is loaded **before** all other scripts, ensuring consistency

## Files Updated
The following files now use the centralized config:

### JavaScript Files:
- `assets/js/tickets.js`
- `assets/js/dashboard/api.js`
- `assets/js/script.js`
- `assets/js/server/server-api.js`

### HTML Files with config.js:
- `index.html` (Login page)
- `pages/dashboard/index.html`
- `pages/dashboard/tickets.html`

## Troubleshooting

### Getting 401 Unauthorized Errors?
**Solution**: You're likely using a token from the wrong endpoint.
1. Clear localStorage: `localStorage.clear()`
2. Refresh and login again

### Config not working?
**Check**:
1. Is `config.js` loaded **before** other scripts in the HTML?
2. Check browser console for `BDC Config loaded: [URL]` message
3. Ensure no browser cache is interfering (hard refresh: Ctrl+Shift+R)

### Need to use different endpoints for different features?
Not recommended, but if needed, you can override in specific files by replacing:
```javascript
this.baseURL = window.BDC_CONFIG?.API_BASE_URL || 'fallback-url';
```
with a hardcoded URL.

## Current Configuration
**Active Endpoint**: `bdc_ims_dev`
**Full URL**: `https://shubham.staging.cloudmate.in/bdc_ims_dev/api/api.php`

---

**Last Updated**: 2025-12-05
**Version**: 1.0.0
