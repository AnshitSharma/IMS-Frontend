const fs = require('fs');
const path = require('path');

// Pages to update with their active menu item
const pages = [
    { file: 'index.html', active: 'dashboard' },
    { file: 'ram.html', active: 'ram' },
    { file: 'storage.html', active: 'storage' },
    { file: 'motherboard.html', active: 'motherboard' },
    { file: 'nic.html', active: 'nic' },
    { file: 'caddy.html', active: 'caddy' },
    { file: 'chassis.html', active: 'chassis' },
    { file: 'pciecard.html', active: 'pciecard' },
    { file: 'hbacard.html', active: 'hbacard' },
    { file: 'acl.html', active: 'acl' },
    { file: 'tickets.html', active: 'tickets' }
];

// Sidebar menu structure
const menuItems = [
    { component: 'dashboard', href: 'index.html', icon: 'fas fa-tachometer-alt', label: 'Dashboard', hasCount: false },
    { component: 'cpu', href: 'cpu.html', icon: 'fas fa-bolt', label: 'CPUs', hasCount: true },
    { component: 'ram', href: 'ram.html', icon: 'fas fa-memory', label: 'RAM', hasCount: true },
    { component: 'storage', href: 'storage.html', icon: 'fas fa-hdd', label: 'Storage', hasCount: true },
    { component: 'motherboard', href: 'motherboard.html', icon: 'fas fa-th-large', label: 'Motherboards', hasCount: true },
    { component: 'nic', href: 'nic.html', icon: 'fas fa-network-wired', label: 'Network Cards', hasCount: true },
    { component: 'caddy', href: 'caddy.html', icon: 'fas fa-box', label: 'Caddies', hasCount: true },
    { component: 'chassis', href: 'chassis.html', icon: 'fas fa-server', label: 'Chassis', hasCount: true },
    { component: 'pciecard', href: 'pciecard.html', icon: 'fas fa-credit-card', label: 'PCIe Cards', hasCount: true },
    { component: 'hbacard', href: 'hbacard.html', icon: 'fas fa-plug', label: 'HBA Cards', hasCount: true },
    { component: 'servers', href: 'servers.html', icon: 'fas fa-cubes', label: 'Servers', hasCount: true },
    { component: 'acl', href: 'acl.html', icon: 'fas fa-shield-alt', label: 'Access Control', hasCount: false },
    { component: 'tickets', href: 'tickets.html', icon: 'fas fa-ticket-alt', label: 'Tickets', hasCount: false }
];

function generateMenuItem(item, activeComponent) {
    const isActive = item.component === activeComponent;
    const activeClass = isActive ? ' active' : '';
    const linkClass = isActive
        ? 'px-4 py-3 flex items-center justify-between w-full cursor-pointer bg-primary-50 border-l-4 border-primary transition-colors'
        : 'px-4 py-3 flex items-center justify-between w-full cursor-pointer hover:bg-slate-50 transition-colors';
    const iconColor = isActive ? 'text-primary' : 'text-slate-600';
    const textColor = isActive ? 'text-sm font-medium text-primary' : 'text-sm text-slate-700';

    if (item.hasCount) {
        return `                    <li class="menu-item${activeClass}" data-component="${item.component}">
                        <a href="${item.href}" class="${linkClass}">
                            <div class="flex items-center gap-3">
                                <i class="${item.icon} ${iconColor}"></i>
                                <span class="${textColor}">${item.label}</span>
                            </div>
                            <span class="count text-xs bg-slate-200 px-2 py-1 rounded" id="${item.component}Count">0</span>
                        </a>
                    </li>`;
    } else {
        return `                    <li class="menu-item${activeClass}" data-component="${item.component}">
                        <a href="${item.href}" class="px-4 py-3 flex items-center gap-3 w-full cursor-pointer ${isActive ? 'bg-primary-50 border-l-4 border-primary' : 'hover:bg-slate-50'} transition-colors">
                            <i class="${item.icon} ${iconColor}"></i>
                            <span class="${textColor}">${item.label}</span>
                        </a>
                    </li>`;
    }
}

function generateSidebarMenu(activeComponent) {
    const menuHTML = menuItems.map(item => generateMenuItem(item, activeComponent)).join('\n');
    return `                <ul class="sidebar-menu">
${menuHTML}
                </ul>`;
}

function updatePage(pageFile, activeComponent) {
    const filePath = path.join(__dirname, 'pages', 'dashboard', pageFile);

    try {
        let content = fs.readFileSync(filePath, 'utf8');

        // Find and replace sidebar menu
        const sidebarRegex = /<ul class="sidebar-menu">[\s\S]*?<\/ul>/;
        const newSidebar = generateSidebarMenu(activeComponent);

        content = content.replace(sidebarRegex, newSidebar);

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated ${pageFile}`);
    } catch (error) {
        console.error(`✗ Error updating ${pageFile}:`, error.message);
    }
}

// Run updates
console.log('Updating sidebar navigation...\n');
pages.forEach(page => {
    updatePage(page.file, page.active);
});
console.log('\nSidebar navigation update complete!');
