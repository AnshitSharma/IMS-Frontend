# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BDC IMS Frontend** - A vanilla JavaScript single-page application (SPA) for datacenter Infrastructure Management System. No frontend framework (React/Vue/Angular), no build process or transpiler. Direct HTML/CSS/JavaScript served via HTTP.

**Key Features:**
- Inventory/component management dashboard
- Ticketing system with workflow approval process
- Server configuration builder (PCPartPicker-style interface)
- Role-based access control (ACL) and permission system
- Authentication via JWT tokens

## Development Commands

```bash
npm run dev        # Start http-server on http://localhost:3000 (-c-1 disables caching)
npm start          # Alias for npm run dev
npm run build      # Not configured yet (placeholder)
```

### Development Flags

**`--dangerously-skip-permissions`**
- Use this flag during local development to skip/bypass permission checks
- Allows testing features without waiting for proper permission verification
- **Only for development** - never use in production or staging environments
- Example: When testing role-based features without full permission setup

## Architecture and Key Systems

### API Configuration
- **Base URL**: `https://shubham.staging.cloudmate.in/bdc_ims/api/api.php`
- **Authentication**: JWT Bearer tokens stored in localStorage (`bdc_token`, `bdc_refresh_token`)
- **Implementation**: Three axios wrappers exist - prefer `ServerAPI` class pattern for new features
  - `assets/js/dashboard/api.js` - `window.api` namespace with token management
  - `assets/js/server/server-api.js` - ES6 `ServerAPI` class (recommended pattern)
  - `assets/js/script.js` - Simple functional approach (legacy)

### Codebase Structure
**Feature-based organization** - Each major feature has dedicated folders with HTML, CSS, and JS:
```
pages/
├── index.html              # Login/registration
├── tickets.html            # Ticketing system
├── dashboard/index.html    # Component inventory view
├── forms/                  # Add/edit component forms
└── server/                 # Configuration, ACL, server builders

assets/
├── css/                    # Organized by feature (dashboard/, forms/, server/)
└── js/                     # Same structure, with dedicated API wrappers per module

components/
└── navbar.js              # Shared reusable navbar component (use this pattern)

data/
├── permissions.json       # Role-based permissions lookup
├── cpu-jsons/, motherboard-jsons/, ram-jsons/, etc.  # Component specifications (large dataset)
```

### Authentication & Permissions Model
- **JWT-based**: Access/refresh token pair, Bearer auth in headers
- **Role-based ACL**: Permissions stored in `data/permissions.json`
- **Key permissions**: `ticket.*`, `server.*`, `component.*` prefixed actions
- **Separation of duties**: Users cannot approve their own tickets (enforced server-side)

### Ticketing System Workflow
Status flow: `draft` → `pending` → `approved` → `in_progress` → `deployed` → `completed`
- Each transition requires specific permissions (documented in `TICKETS_API_REFERENCE.md`)
- Only editable in `draft` status (title, description, priority)
- Includes audit trail with user, timestamp, IP address
- See `TICKETS_API_REFERENCE.md` for complete endpoint specifications

### Component Data Management
Component specifications stored as static JSON files (CPU, RAM, motherboards, NICs, etc.). These are loaded client-side for:
- Server builder component selection
- Compatibility checking
- UUID validation

### UI Patterns

**Toast Notifications** (`assets/js/toast.js`):
```javascript
toast.success('Message');   // Green toast
toast.error('Message');     // Red toast
toast.warning('Message');   // Yellow toast
```

**Shared Navbar Component** (`components/navbar.html`, `components/navbar.js`):
- Reusable across pages - include with `<div id="navbar-placeholder"></div>`
- Auto-displays user info and role
- Includes logout and change password
- See `components/README.md` for integration details and customization

**Form Components** (`assets/js/forms/add-form.js`, `edit-form.js`):
- ES6 class-based implementation
- Handles component form submission with validation

### Data Models

**Tickets**:
- Immutable once submitted (draft → pending)
- Items snapshot component name and specs at creation
- History tracked for all status changes and assignments

**Servers**:
- Configurations stored with UUID identifier
- Include target for ticket-based deployments
- Support role-based visibility (ACL)

## Important Implementation Notes

### Mixed Code Patterns
The codebase uses both:
- **Functional/IIFE patterns** (older code, still in use)
- **ES6 classes** (newer code, preferred for new features - see `ServerAPI`, `AddComponentForm`)

Prefer ES6 classes when adding new modules for better maintainability.

### No Modern Tooling
- No TypeScript, no bundler (Webpack/Vite), no transpiler
- HTML/CSS/JS served directly from files
- axios is the only runtime dependency (HTTP client)
- Font Awesome via CDN for icons

### localStorage Keys
- `bdc_token` - JWT access token
- `bdc_refresh_token` - Refresh token for token rotation
- `bdc_user` - User object (may be deprecated, check with api.js)

### API Response Format
All endpoints return standardized JSON:
```json
{
  "success": true/false,
  "authenticated": true/false,
  "code": 200,
  "message": "...",
  "timestamp": "2025-11-18 14:23:45",
  "data": { /* endpoint-specific */ }
}
```

## Common Development Tasks

### Adding a New Page
1. Create `pages/feature-name/` folder
2. Add `pages/feature-name/index.html` (main page)
3. Create `assets/css/feature-name/` for styles
4. Create `assets/js/feature-name/` for scripts
5. Include shared navbar: `<div id="navbar-placeholder"></div>`
6. Load navbar script and your feature script before closing `</body>`

### Creating a New API Wrapper
Follow the ES6 class pattern from `assets/js/server/server-api.js`:
- Wrap axios with proper error handling
- Manage token in Authorization header
- Return promises for async operations

### Understanding Component Compatibility
Review how `assets/js/server/` modules validate components:
- Load JSON specs from `data/` folder
- Check compatibility against target motherboard
- Validate UUIDs before submission

### Referencing TICKETS_API_REFERENCE.md
Comprehensive API documentation for ticketing endpoints - refer here for:
- Required permissions per endpoint
- Request/response formats with full examples
- Status transition rules and constraints
- Error codes and handling