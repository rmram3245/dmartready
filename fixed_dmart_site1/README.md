# DMart website + admin backend (local testing)

This package keeps the existing React landing page and `/admin` UI, and adds the backend API those screens expect.

## Requirements
- Node.js 24.x (configured in `.nvmrc` and `package.json`)
- npm

If you use nvm, run `nvm install` followed by `nvm use` in this folder before installing dependencies. Netlify also uses `.nvmrc` to select the project's Node.js version.

## Start on a computer
1. Extract the ZIP to a folder.
2. Open a terminal/Command Prompt in that folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000` for the website and `http://localhost:3000/admin` for admin.
6. Use the generated password in the separate `dmart_admin_password.txt` file, then change it from the admin panel.

## Start on Android
Install Termux from a trusted source, copy/extract the ZIP into a writable Termux folder, then run:

```sh
pkg update
pkg install nodejs unzip
unzip fixed_dmart_site.zip -d dmart-site
cd dmart-site
npm install
npm start
```

Open `http://127.0.0.1:3000` in the phone browser. Keep Termux running while testing.

## Admin features
- Password-protected admin login with signed expiring tokens and login throttling
- Upload, inspect, download, and remove an APK (limit configured by `MAX_APK_SIZE_MB`)
- Download click counts and active visitor count
- Configure/remove two Facebook Pixel IDs
- Change admin password
- Login attempt history

## Data and configuration
- `.env` is pre-created for local testing with a randomly generated admin password and secrets. The password is provided separately in `dmart_admin_password.txt`.
- Uploaded APK files go into `uploads/apk/`.
- Admin settings and counters are persisted in `server-data/store.json`.
- This local build uses persistent JSON storage, so PostgreSQL is not required to test locally. `DATABASE_URL` is retained in `.env` for compatibility/reference but is not used by this version.
- Before public hosting, replace local settings, configure your actual domain in `CORS_ORIGIN`, use HTTPS, and move to a database with backups. Do not publish `.env` or `dmart_admin_password.txt`.

## Notes
- The original landing page is an APK-download promotion page, not a full shopping cart. The backend supports its existing API contract; it does not invent a checkout flow.
- The `assets/` folder contains placeholders for image assets that were missing from the supplied bundle. Replace them with your licensed/original artwork if needed.
