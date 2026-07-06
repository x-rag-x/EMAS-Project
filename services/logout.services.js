async function doLogout(query = '', type = 'info', time = '0') {
    msgToast('Logging out..........');
    try {
    const token = sessionStorage.getItem('eams_token') || localStorage.getItem('eams_token');

    if (token) {
        await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
        });
    }
    } catch (err) { }
    localStorage.clear();
    sessionStorage.clear();

    if (!query == '')
    window.location.replace(`index.html?logout=${query}&type=${type}&time=${time}`);
}

(function () {
    async function checkSessionExpiry() {
    try {
        const session = await apiCall('GET', '/login-history');
        if (!session || !session.expireTime) return;

        const remainingTime = new Date(session.expireTime).getTime() - Date.now();

        // Already expired
        if (remainingTime <= 0) {
        msgToast('⚠️ Session expired. Logging out...', 'error');
        return setTimeout(() => { doLogout('timeout', 'error'); }, 1000);
        }

        // Sleep until the session should expire
        setTimeout(checkSessionExpiry, Math.max(remainingTime, 0));

    } catch (err) { console.error(err); }
    }
    checkSessionExpiry();
})();