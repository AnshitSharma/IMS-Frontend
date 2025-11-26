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

## Recent Bug Fixes & UI Improvements

### Sidebar Navigation (Fixed 2025-11-27)
**Issue**: Sidebar menu items required multiple clicks to navigate, especially when clicking count badges.

**Root Cause**: Nested clickable elements - `<li>` with click handlers contained `<a>` links, and count badges were outside the anchor tags.

**Fix Applied**:
- Restructured all 13 dashboard pages to move styling from `<li>` to `<a>` elements
- Moved count badges inside anchor tags so clicking them triggers navigation
- Updated event handlers in `dashboard.js` to attach to `.menu-item a` instead of `.menu-item`
- Added 100ms timeout before closing sidebar on mobile to ensure navigation completes

**Files Modified**:
- All HTML pages in `pages/dashboard/` (sidebar menu structure)
- `assets/js/dashboard/dashboard.js` (lines 71-80, event handlers)

### API Data Rendering Issues (Fixed 2025-11-27)

#### Servers Page
**Issue**: Server cards not rendering despite API returning data.

**Root Cause**: Container ID mismatch - JavaScript expected `serverCardsGrid` but HTML had `serverGrid`.

**Fix**: Changed container ID in `pages/dashboard/servers.html` line 218.

#### Access Control Page
**Issue**: ACL page showed no data - initialization was exiting early.

**Root Cause**: Missing HTML elements - `acl.js` expected full permissions interface but HTML only had simple user table.

**Fix**: Modified `assets/js/server/acl.js` to detect simple ACL mode and initialize appropriately with new functions:
- `initializeSimpleACLList()` - Handles simple user list mode
- `loadACLUsers()` - Fetches and displays users from API
- `renderACLTable()` - Renders user rows with role badges

#### Tickets Page
**Issue**: Tickets not loading - authentication failing.

**Root Cause**: Token key mismatch - `tickets.js` used `access_token` instead of project standard `bdc_token`.

**Fix**: Updated `getAuthToken()` method in `assets/js/tickets.js` line 499.

### Table Consistency & Responsiveness (Fixed 2025-11-27)

**Issues**:
1. Inconsistent table row heights across different content
2. Tables not responsive on mobile devices
3. Action buttons too small for touch targets
4. Header actions not mobile-friendly

**Fixes Applied**:

1. **Table Row Heights** - Added to `assets/css/globals.css`:
   - `.table-base` and `.components-table` classes with fixed heights (h-14 for headers, h-16 for rows)
   - Updated all component pages to include these classes on tables
   - Updated `dashboard.js` table rendering to include height classes on all `<tr>` and `<td>` elements

2. **Mobile Card View** - Added responsive table CSS:
   - Tables transform to card layout on mobile (<768px)
   - Uses `data-label` attributes to show field names
   - Hides thead and displays each row as a card
   - Automatically hides checkbox column on mobile

3. **Touch Targets** - All interactive elements now meet 44px minimum:
   - Buttons: `min-h-[44px]` class added
   - Action buttons show icon only on mobile, icon + text on desktop using `hidden sm:inline`
   - Enhanced styling with hover states and transitions

4. **Responsive Header Actions**:
   - Header actions stack vertically on mobile, horizontal on desktop
   - Search and filter inputs full-width on mobile
   - Buttons full-width on mobile for better touch accessibility

**Files Modified**:
- `assets/css/globals.css` (lines 395-475, new table and responsive styles)
- `assets/js/dashboard/dashboard.js` (lines 535-560, table rendering with classes and data-labels)
- All 9 component pages in `pages/dashboard/` (table headers and header actions updated)

### Responsive Sidebar Behavior (Fixed 2025-11-27)

**Enhancement**: Improved mobile sidebar with proper transitions and body scroll prevention.

**Added CSS**:
- Sidebar slides off-screen on mobile using `-translate-x-full`
- Active state applies `translate-x-0` for smooth slide-in
- Body scroll locked when sidebar open on mobile using `overflow-hidden`
- Responsive breakpoint at 1024px (lg:)

**Location**: `assets/css/globals.css` lines 455-475

## CSS Build Process

After making changes to `assets/css/globals.css`, rebuild the compiled Tailwind CSS:

```bash
npm run build:css
```

This command runs Tailwind CLI to process `globals.css` and output minified `tailwind.css`.