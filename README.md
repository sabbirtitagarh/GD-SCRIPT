# GD SCRIPT – Smart Mobile Teleprompter  (v1.1.0)
**Powered by GD TECH ACADEMY** · https://sabbirtitagarh.github.io/hub/

Free, multi-user, white-label teleprompter PWA. Frontend GitHub Pages par, backend Google Apps Script par.
Har user ka apna private workspace hota hai; scripts user ke **apne Google Drive** me save hote hain (owner ke Drive me kabhi nahi).

## Features
- Register / Login / Logout, password reset (email code), account delete
- Script manager: new, edit, duplicate, delete, autosave, search, folders, favourites, recent, TXT import/export
- Teleprompter: font, size, colours, spacing, width, margins, mirror, flip, reverse, focus mode, fullscreen, reading guide, timer, target duration (auto speed), `[[Bookmark]]` sections, keyboard / Bluetooth clicker, Voice Follow
- Recording Studio: camera + mic, script overlay, download, device me save (Drive upload **nahi** hota)
- My Brand Settings: app name, brand name, logo, colours, font, theme, welcome message, restore default
- Google Drive connect (drive.file scope), manual backup/restore, Drive ↔ device sync
- PWA: install, offline shell, update notice
- **4 languages: English, हिन्दी, বাংলা, اردو (Urdu, right-to-left)** – footer ke language picker ya Settings se badlo
- Footer "Powered by GD TECH ACADEMY" har page par (user edit nahi kar sakta)

## Folder structure
```
GD-SCRIPT/
├── index.html login.html register.html dashboard.html editor.html
│   teleprompter.html recording.html settings.html
├── manifest.json  service-worker.js
├── css/   style.css  teleprompter.css
├── js/    config.js lang-loader.js app.js i18n.js lang/(hi.js bn.js ur.js)  scripts.js engine.js voice-match.js teleprompter.js
│          home.js auth.js dashboard.js editor.js settings.js branding.js drive.js recording.js
├── assets/ logo.png  icons/ (72…512, maskable, apple-touch, favicon)
├── backend/ (Google Apps Script files)  Config.gs Util.gs Db.gs Auth.gs Profile.gs Drive.gs Scripts.gs Main.gs appsscript.json
└── docs/   (guides, Hinglish)
```

## Quick start (5 steps)
1. **Backend**: `docs/02-apps-script-deployment.md` – Apps Script project banao, `backend/*` paste karo, `setup()` run karo, Web App deploy karo, `/exec` URL copy karo.
2. **Google OAuth**: `docs/03-google-oauth-drive.md` – Cloud project, Drive API, OAuth client, redirect URI = `/exec` URL.
3. **Frontend config**: `js/config.js` me `API_URL: 'https://script.google.com/macros/s/…/exec'` paste karo.
4. **GitHub Pages**: `docs/01-github-pages.md` – repo me upload karo, Pages on karo.
5. Script Property `FRONTEND_URL` = tumhari GitHub Pages URL; test karo (`docs/08-troubleshooting.md` agar kuch atke).

## Guides
| File | Kya hai |
|---|---|
| docs/01-github-pages.md | GitHub Pages deployment |
| docs/02-apps-script-deployment.md | Apps Script backend deployment |
| docs/03-google-oauth-drive.md | Google OAuth + Drive setup |
| docs/04-pwa-install.md | PWA install guide |
| docs/05-admin-guide.md | Owner / admin guide |
| docs/06-user-guide.md | User guide |
| docs/07-security-backup.md | Security & backup |
| docs/08-troubleshooting.md | Troubleshooting + known limitations |
| docs/09-languages.md | Languages (Hindi / Bengali / Urdu), translation edit/add guide |

Licence/credit: footer credit hata na do – wo app ka hissa hai.

## Purane (v1.0.0) deployment ko upgrade karna
1. Poora naya frontend GitHub par upload karo (purani files replace).
2. Apps Script me `backend/Config.gs` ka content replace karo (Urdu language + font ke liye) → **Deploy → Manage deployments → Edit → New version**.
3. `js/config.js` me apna `API_URL` dobara paste karo (nayi file me khali hota hai).
Details: CHANGELOG.md
