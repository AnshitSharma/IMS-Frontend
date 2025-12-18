# API Error Message Display Fix

## Completed: 2025-12-18

### Issue
When the API returned an error response (e.g., `{success: false, message: "Cannot delete system role", code: 403}`), the toast notifications were showing generic messages like "An error occurred while deleting the role" instead of the actual API error message.

### Root Cause
Two issues were identified:

1. **Central API Handler**: When the API returned a non-200 HTTP status code (like 403), the `api.request()` method in `assets/js/dashboard/api.js` was throwing an error with only the HTTP status text (`HTTP 403: Forbidden`) instead of parsing the JSON response body to extract the actual API error message.

2. **Catch Blocks**: Many catch blocks throughout the codebase were using generic fallback messages without checking `error.message` first.

### Solution

#### 1. Fixed Central API Handler (`assets/js/dashboard/api.js`)
Modified the `request()` method to:
- Parse JSON response even for non-ok HTTP responses
- Extract the API error message from the response body
- Throw an error with the actual API message, falling back to HTTP status only if no message is available

```javascript
// Before: Would throw HTTP status text for non-ok responses
if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

// After: Extracts actual API message from response body
let result;
try {
    result = await response.json();
} catch (parseError) {
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    throw parseError;
}

if (!response.ok && !result.success) {
    const errorMessage = result.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
}
```

#### 2. Updated All Catch Blocks
Changed the pattern in all catch blocks from:
```javascript
toast.error('An error occurred while deleting the role');
```
To:
```javascript
toast.error(error.message || 'An error occurred while deleting the role');
```

### Files Modified
- `assets/js/dashboard/api.js` - Central API request handler
- `assets/js/server/acl-manager.js` - Role management (4 catch blocks)
- `assets/js/dashboard/dashboard.js` - Dashboard operations (15+ catch blocks)
- `assets/js/server/server-builder.js` - Server builder (2 catch blocks)
- `assets/js/server/configuration.js` - Component configuration (3 catch blocks)
- `assets/js/forms/edit-form.js` - Edit component form (1 catch block)
- `assets/js/forms/add-form.js` - Add component form (1 catch block)
- `assets/js/dashboard/add-server-form.js` - Add server form (1 catch block)

### Pattern to Follow Going Forward
When handling API errors in catch blocks, always use this pattern:
```javascript
try {
    const result = await api.someOperation();
    if (result.success) {
        toast.success('Operation successful');
    } else {
        toast.error(result.message || 'Operation failed');
    }
} catch (error) {
    console.error('Error description:', error);
    toast.error(error.message || 'Generic fallback message');
}
```

This ensures:
1. API error messages are always displayed to the user
2. Network errors still show meaningful messages
3. Only falls back to generic messages when no specific message is available
