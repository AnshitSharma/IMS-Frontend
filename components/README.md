# Shared Components

## Navbar Component

The navbar component is a reusable navigation header that can be included in any page.

### Usage

1. **Add the placeholder in your HTML:**

```html
<body>
    <!-- Shared Navigation Header -->
    <div id="navbar-placeholder"></div>

    <!-- Your page content here -->
</body>
```

2. **Load the required scripts (in order):**

```html
<!-- Before closing </body> tag -->
<script src="../dashboard/js/api.js"></script>
<script src="../components/navbar.js"></script>
<script src="your-page-script.js"></script>
```

### Features

- **User Info Display**: Automatically shows logged-in user's name and role
- **Dropdown Menu**: User avatar with dropdown containing:
  - Change Password
  - Logout
- **Global Search**: Search input (can be customized per page)
- **Automatic Authentication**: Handles logout and token clearing

### Customization

If you need to customize the navbar behavior in your page:

```javascript
// Access the shared navbar instance
if (window.sharedNavbar) {
    // Override global search handler
    window.sharedNavbar.handleGlobalSearch = function(query) {
        // Your custom search logic
        console.log('Searching for:', query);
    };

    // Update user display
    window.sharedNavbar.updateUserDisplay({
        name: 'John Doe',
        primary_role: 'Administrator'
    });
}
```

### File Structure

```
components/
├── navbar.html    # Navbar HTML template
├── navbar.js      # Navbar JavaScript logic
└── README.md      # This file
```

### Dependencies

- `../dashboard/js/api.js` - Required for user authentication
- Font Awesome 6.0.0 - For icons
- Dashboard CSS - For navbar styling

### Pages Using Shared Navbar

- `server/configuration.html` - Server component selection
- Add more pages here as they are updated...

### Migration Guide

To migrate an existing page to use the shared navbar:

1. Replace the hardcoded navbar HTML with `<div id="navbar-placeholder"></div>`
2. Add `<script src="../components/navbar.js"></script>` before your page script
3. Remove navbar initialization code from your page's JavaScript:
   - Remove `initializeUserInfo()` method
   - Remove dropdown toggle event listeners
   - Remove change password event listener
   - Remove logout event listener
4. Keep page-specific functionality (filters, back buttons, etc.)

### Example: Before and After

**Before (configuration.html):**
```html
<nav class="navbar">
    <!-- 50+ lines of navbar HTML -->
</nav>
```

**After (configuration.html):**
```html
<div id="navbar-placeholder"></div>
```

**Before (configuration.js):**
```javascript
initializeUserInfo() { /* ... */ }
setupEventListeners() {
    // Dropdown toggle
    // Change password
    // Logout
    // ... navbar stuff
}
```

**After (configuration.js):**
```javascript
// Navbar is handled by shared navbar.js
// Just keep page-specific event listeners
```
