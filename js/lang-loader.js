/**
 * GD SCRIPT – language loader (runs first on every page).
 * Reads the saved interface language and, for hi / bn / ur, loads js/lang/<code>.js before the app starts,
 * so the page never flashes in English. Sets lang and dir (Urdu is right-to-left) on <html>.
 */
(function () {
  'use strict';
  var code = 'en';
  try { var v = JSON.parse(localStorage.getItem('gds.lang')); if (typeof v === 'string') code = v; } catch (e) { /* storage blocked */ }
  if (['en', 'hi', 'bn', 'ur'].indexOf(code) < 0) code = 'en';
  window.GDS_BOOT_LANG = code;
  var root = document.documentElement;
  root.lang = code;
  root.dir = code === 'ur' ? 'rtl' : 'ltr';
  if (code !== 'en') document.write('<script src="js/lang/' + code + '.js"><\/script>');
})();
