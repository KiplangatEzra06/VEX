(() => {
    const storedPreference = localStorage.getItem('vex-theme-preference');
    const preference = ['system', 'light', 'dark'].includes(storedPreference)
        ? storedPreference
        : 'system';
    const isDark = preference === 'dark'
        || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
        themeColor.content = isDark ? '#0A141C' : '#F4F7FA';
    }
})();
