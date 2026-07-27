/* Layovered — cookie consent banner + GA4 Consent Mode control.
 * Analytics stays DENIED until the user accepts (set as default in each page's
 * <head>). This script shows the banner, records the choice in localStorage, and
 * updates GA4 consent accordingly. DPDP-aligned: no non-essential analytics
 * before consent, and the choice can be changed any time via window.lyvCookieSettings().
 */
(function () {
  'use strict';
  var KEY = 'lyv_consent';           // 'granted' | 'denied'
  var BRAND = '#ff4c00', INK = '#1f271b', LINE = '#e5e7eb';

  function gtagSafe() {
    if (typeof window.gtag === 'function') window.gtag.apply(window, arguments);
  }

  function apply(choice) {
    gtagSafe('consent', 'update', {
      analytics_storage: choice === 'granted' ? 'granted' : 'denied'
    });
  }

  function save(choice) {
    try { localStorage.setItem(KEY, choice); } catch (e) {}
    apply(choice);
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function removeBanner() {
    var el = document.getElementById('lyv-cookie-banner');
    if (el) el.parentNode.removeChild(el);
  }

  function injectStyles() {
    if (document.getElementById('lyv-cookie-style')) return;
    var css =
      '#lyv-cookie-banner{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
      'background:#fff;border-top:1px solid ' + LINE + ';box-shadow:0 -6px 24px rgba(0,0,0,.08);' +
      'padding:16px 20px;display:flex;gap:16px;align-items:center;justify-content:center;' +
      'flex-wrap:wrap;font-family:"Nunito Sans",-apple-system,Segoe UI,Helvetica,Arial,sans-serif}' +
      '#lyv-cookie-banner p{margin:0;color:' + INK + ';font-size:14px;line-height:1.5;max-width:640px}' +
      '#lyv-cookie-banner a{color:' + BRAND + ';text-decoration:underline}' +
      '#lyv-cookie-banner .lyv-actions{display:flex;gap:10px;flex-shrink:0}' +
      '#lyv-cookie-banner button{font:inherit;font-weight:700;font-size:14px;cursor:pointer;' +
      'border-radius:10px;padding:10px 18px;border:1px solid ' + LINE + ';background:#fff;color:' + INK + '}' +
      '#lyv-cookie-banner button.lyv-accept{background:' + BRAND + ';border-color:' + BRAND + ';color:#fff}' +
      '#lyv-cookie-banner button:focus-visible{outline:2px solid ' + BRAND + ';outline-offset:2px}' +
      '@media(max-width:640px){#lyv-cookie-banner{flex-direction:column;align-items:stretch;text-align:center}' +
      '#lyv-cookie-banner .lyv-actions{justify-content:center}}';
    var s = document.createElement('style');
    s.id = 'lyv-cookie-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function showBanner() {
    if (document.getElementById('lyv-cookie-banner')) return;
    injectStyles();
    var bar = document.createElement('div');
    bar.id = 'lyv-cookie-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie consent');
    bar.innerHTML =
      '<p>We use cookies to understand how the site is used and to improve it. ' +
      'Analytics run only if you accept. See our ' +
      '<a href="/privacy-policy.html">Privacy Policy</a>.</p>' +
      '<div class="lyv-actions">' +
      '<button type="button" class="lyv-decline">Decline</button>' +
      '<button type="button" class="lyv-accept">Accept</button>' +
      '</div>';
    (document.body || document.documentElement).appendChild(bar);
    bar.querySelector('.lyv-accept').addEventListener('click', function () {
      save('granted'); removeBanner();
    });
    bar.querySelector('.lyv-decline').addEventListener('click', function () {
      save('denied'); removeBanner();
    });
  }

  // Let users change their mind (e.g. a footer "Cookie settings" link:
  // <a href="#" onclick="lyvCookieSettings();return false;">Cookie settings</a>)
  window.lyvCookieSettings = function () { showBanner(); };

  function init() {
    var choice = stored();
    if (choice === 'granted' || choice === 'denied') {
      apply(choice);          // re-assert on every load
      return;                 // no banner once a choice exists
    }
    showBanner();             // first visit → ask
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
