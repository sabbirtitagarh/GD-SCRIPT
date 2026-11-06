/** GD SCRIPT – home.js: landing page (index.html) */
(async function () {
  'use strict';
  const GDS = window.GDS;
  if (GDS.auth.isUser() || GDS.auth.isGuest()) { location.replace('dashboard.html'); return; }
  await GDS.init({ page: 'home', auth: 'none', nav: false });
  GDS.$('#btnGuest').addEventListener('click', () => { GDS.auth.guest(); location.href = 'dashboard.html'; });
})();
