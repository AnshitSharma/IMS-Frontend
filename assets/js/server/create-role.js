document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.querySelector('.close-button');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (closeButton && modalOverlay) {
        closeButton.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    }

    const categoryHeaders = document.querySelectorAll('.category-header');
    categoryHeaders.forEach(header => {
        header.addEventListener('click', (event) => {
            // Prevent collapsing when clicking on the checkbox or its label
            if (event.target.type === 'checkbox' || event.target.tagName === 'LABEL') {
                return;
            }
            const permissionsList = header.nextElementSibling;
            if (permissionsList.style.display === 'block') {
                permissionsList.style.display = 'none';
            } else {
                permissionsList.style.display = 'block';
            }
        });
    });

    const selectAllCheckboxes = document.querySelectorAll('input[id^="select-all-"]');
    selectAllCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (event) => {
            const permissionsList = event.target.closest('.permission-category').querySelector('.permissions-list');
            const permissionCheckboxes = permissionsList.querySelectorAll('input[type="checkbox"]');
            permissionCheckboxes.forEach(permissionCheckbox => {
                permissionCheckbox.checked = event.target.checked;
            });
        });
    });
});