const fs = require('fs');
const path = require('path');

// Component pages that have tables
const componentPages = [
    'cpu.html', 'ram.html', 'storage.html', 'motherboard.html',
    'nic.html', 'caddy.html', 'chassis.html', 'pciecard.html', 'hbacard.html'
];

function updateTableHeaders(content) {
    // Update table class to include table-base, components-table, and table-responsive
    content = content.replace(
        /<table class="components-table w-full" id="componentsTable">/g,
        '<table class="w-full table-base components-table table-responsive" id="componentsTable">'
    );

    // Update th elements to include h-14 and align-middle classes
    content = content.replace(
        /<th class="px-4 py-3 text-left text-sm font-semibold text-slate-700">/g,
        '<th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 h-14 align-middle">'
    );

    // Update the checkbox th as well
    content = content.replace(
        /<th class="px-4 py-3 text-left">/g,
        '<th class="px-4 py-3 text-left h-14 align-middle">'
    );

    return content;
}

function updatePage(pageFile) {
    const filePath = path.join(__dirname, 'pages', 'dashboard', pageFile);

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;

        content = updateTableHeaders(content);

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✓ Updated ${pageFile}`);
        } else {
            console.log(`○ No changes needed for ${pageFile}`);
        }
    } catch (error) {
        console.error(`✗ Error updating ${pageFile}:`, error.message);
    }
}

// Run updates
console.log('Updating table headers and classes...\n');
componentPages.forEach(page => {
    updatePage(page);
});
console.log('\nTable header update complete!');
