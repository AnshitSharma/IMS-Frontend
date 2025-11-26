function initializeAddServerForm() {
    const createServerForm = document.getElementById('createServerForm');
    if (createServerForm) {
        // Prevent multiple submissions
        if (createServerForm.dataset.initialized) {
            return;
        }
        createServerForm.dataset.initialized = true;

        createServerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serverName = document.getElementById('serverName').value.trim();
            const description = document.getElementById('description').value.trim();
            const startWith = document.getElementById('startWith').value;

            if (!serverName) {
                utils.showAlert('Please enter a server name', 'warning');
                return;
            }

            try {
                utils.showLoading(true, 'Creating server...');
                const result = await api.servers.createConfig(serverName, description, startWith);
                if (result.success) {
                    utils.showAlert('Server created successfully!', 'success');
                    dashboard.closeModal();
                    dashboard.loadServerList();
                } else {
                    utils.showAlert(api.utils.formatError(result), 'error');
                }
            } catch (error) {
                utils.showAlert('An error occurred while creating the server.', 'error');
                console.error('Create server error:', error);
            } finally {
                utils.showLoading(false);
            }
        });
    const cancelButton = createServerForm.querySelector('button[type="button"]');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                dashboard.closeModal();
            });
        }
    }
}