/**
 * Microsoft (Entra ID) sign-in — callback page.
 *
 * This page is the registered redirect URI. Microsoft sends the browser here
 * with ?code=…&state=…; the only job is to hand that pair to the backend, which
 * redeems it server-side and returns the same session payload auth-login
 * returns. No token is ever minted in the browser.
 *
 * Every exit is deliberate: success redirects to the dashboard, anything else
 * shows a plain reason and a way back to the sign-in page.
 */

(function () {
    'use strict';

    const API_URL = window.BDC_CONFIG?.API_BASE_URL
        || 'https://ims.bdcms.bharatdatacenter.com/Ims_backend/api/api.php';
    const STORAGE_KEYS = window.BDC_CONFIG?.STORAGE_KEYS || {
        TOKEN: 'bdc_token',
        REFRESH_TOKEN: 'bdc_refresh_token',
        USER: 'bdc_user',
        REMEMBER_ME: 'bdc_remember_me'
    };

    const statusEl = document.getElementById('callbackStatus');
    const messageEl = document.getElementById('callbackMessage');
    const spinnerEl = document.getElementById('callbackSpinner');
    const actionsEl = document.getElementById('callbackActions');

    function showFailure(message) {
        if (spinnerEl) spinnerEl.classList.add('hidden');
        if (actionsEl) actionsEl.classList.remove('hidden');
        if (statusEl) statusEl.textContent = 'Sign-in failed';
        // textContent, never innerHTML: part of this text can originate from a
        // query string.
        if (messageEl) messageEl.textContent = message;
    }

    function setProgress(message) {
        if (messageEl) messageEl.textContent = message;
    }

    /**
     * Store the session.
     *
     * This mirrors handleLogin() in assets/js/script.js deliberately, including
     * the rule that the refresh token is pinned to sessionStorage even under
     * remember-me — it is a 30-day credential and must not outlive the tab. If
     * that rule changes there, change it here in the same edit.
     */
    function storeSession(data, rememberMe) {
        const storage = rememberMe ? localStorage : sessionStorage;

        if (rememberMe) {
            localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true');
        } else {
            localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        }

        storage.setItem(STORAGE_KEYS.TOKEN, data.tokens.access_token);
        sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.tokens.refresh_token);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        storage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
    }

    async function completeSignIn() {
        const params = new URLSearchParams(window.location.search);

        const oauthError = params.get('error');
        const code = params.get('code');
        const state = params.get('state');

        // The authorization code is single-use, but there is no reason to leave
        // it sitting in the address bar, the history entry or a screenshot.
        try {
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (_) { /* not fatal */ }

        if (oauthError) {
            // Microsoft's own refusal — consent declined, user cancelled, app
            // misconfigured. Its description is the most useful thing we have.
            showFailure(params.get('error_description') || oauthError);
            return;
        }

        if (!code || !state) {
            showFailure('This page is only reachable as part of a Microsoft sign-in.');
            return;
        }

        const rememberMe = sessionStorage.getItem('bdc_ms_remember_me') === 'true';
        sessionStorage.removeItem('bdc_ms_remember_me');

        try {
            const formData = new URLSearchParams();
            formData.append('action', 'auth-microsoft_callback');
            formData.append('code', code);
            formData.append('state', state);
            formData.append('remember_me', rememberMe ? 'true' : 'false');

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            let body = null;
            try {
                body = await response.json();
            } catch (_) { /* handled below */ }

            if (!response.ok || !body || !body.success) {
                showFailure((body && body.message) || 'Microsoft sign-in could not be completed.');
                return;
            }

            storeSession(body.data, rememberMe);

            setProgress('Signed in. Taking you to the dashboard…');
            window.location.replace('pages/dashboard/index.html');

        } catch (_) {
            showFailure('Network error while completing sign-in. Please try again.');
        }
    }

    document.addEventListener('DOMContentLoaded', completeSignIn);
})();
