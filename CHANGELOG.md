# Changelog

## 1.1.0
- New: Urdu (اردو, right-to-left) + Hindi + Bengali + English across all screens, toasts, dialogs and server messages (`js/lang/`, `js/i18n.js`, `docs/09-languages.md`).
- New: language picker in the footer of every page (works before login) and in Settings.
- New: Urdu/Arabic font option; Urdu text auto-aligns right in the teleprompter; Voice Follow understands Urdu diacritics.
- Fix: bookmark labels overlapped script text in the teleprompter when "Show bookmark labels" was off.
- Fix: first service-worker install no longer reloads the page (form input was cleared).
- Fix: target-time feature now explains when the requested time is impossible instead of silently clamping.
- Backend: `LANGS_UI` includes `ur`, `FONTS` includes `noto-naskh-urdu` → **deploy a New version in Apps Script**.

## 1.0.0
- First release.
