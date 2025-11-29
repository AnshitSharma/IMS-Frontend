import os
import re
from pathlib import Path

# Pages to update (all except cpu.html which is already done)
pages_to_update = [
    'pages/dashboard/ram.html',
    'pages/dashboard/storage.html',
    'pages/dashboard/motherboard.html',
    'pages/dashboard/nic.html',
    'pages/dashboard/caddy.html',
    'pages/dashboard/chassis.html',
    'pages/dashboard/pciecard.html',
    'pages/dashboard/hbacard.html',
    'pages/dashboard/servers.html',
    'pages/dashboard/acl.html',
    'pages/dashboard/tickets.html',
    'pages/dashboard/index.html'
]

# Sidebar HTML to remove
sidebar_pattern = r'''    <!-- Hamburger Menu Button \(Mobile\) -->
    <button class="hamburger-menu fixed top-4 left-4 z-50 lg:hidden bg-white rounded-lg p-2 shadow-md" id="hamburgerBtn"
        aria-label="Toggle Menu">
        <span class="block w-6 h-0\.5 bg-slate-700 mb-1"></span>
        <span class="block w-6 h-0\.5 bg-slate-700 mb-1"></span>
        <span class="block w-6 h-0\.5 bg-slate-700"></span>
    </button>

    <!-- Mobile Overlay -->
    <div class="mobile-overlay fixed inset-0 bg-black/50 z-40 hidden" id="mobileOverlay"></div>'''

# Replacement for hamburger and overlay
replacement_top = '''    <!-- Sidebar Component Placeholder -->
    <div id="sidebar-placeholder"></div>'''

# Sidebar HTML to remove (the full aside element)
sidebar_aside_pattern = r'            <!-- Sidebar -->.*?</aside>'

# Script replacement
old_scripts = '''    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script src="../../assets/js/toast.js"></script>
    <script src="../../assets/js/dashboard/utils.js"></script>
    <script src="../../assets/js/dashboard/api.js"></script>
    <script src="../../assets/js/server/server-api.js"></script>
    <script src="../../assets/js/server/pcpartpicker-builder.js"></script>
    <script src="../../assets/js/server/acl.js"></script>
    <script src="../../assets/js/tickets.js"></script>
    <script src="../../assets/js/dashboard/dashboard.js"></script>
</body>'''

new_scripts = '''    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script src="../../assets/js/toast.js"></script>
    <script src="../../assets/js/dashboard/utils.js"></script>
    <script src="../../assets/js/dashboard/api.js"></script>
    <script src="../../assets/js/server/server-api.js"></script>
    <script src="../../assets/js/server/pcpartpicker-builder.js"></script>
    <script src="../../assets/js/server/acl.js"></script>
    <script src="../../assets/js/tickets.js"></script>
    <!-- Sidebar Component and Manager (must load before dashboard) -->
    <script src="../../components/sidebar-manager.js"></script>
    <script>
        // Load sidebar HTML into placeholder
        async function loadSidebarComponent() {
            try {
                const response = await fetch('../../components/sidebar.html');
                const html = await response.text();
                document.getElementById('sidebar-placeholder').innerHTML = html;
                // Reinitialize sidebar manager after HTML loads
                if (window.sidebarManager) {
                    await window.sidebarManager.init();
                }
            } catch (error) {
                console.error('Failed to load sidebar component:', error);
            }
        }
        loadSidebarComponent();
    </script>
    <script src="../../assets/js/dashboard/dashboard.js"></script>
</body>'''

for page in pages_to_update:
    if not os.path.exists(page):
        print(f"Skipping {page} - file not found")
        continue
    
    print(f"Updating {page}...")
    
    with open(page, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace hamburger and overlay with placeholder
    content = re.sub(sidebar_pattern, replacement_top, content, flags=re.DOTALL)
    
    # Remove the aside sidebar element
    content = re.sub(sidebar_aside_pattern, '', content, flags=re.DOTALL)
    
    # Update scripts
    content = content.replace(old_scripts, new_scripts)
    
    with open(page, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ Updated {page}")

print("\nAll pages updated successfully!")
