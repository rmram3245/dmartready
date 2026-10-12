# Front page ↔ backend connection

The original responsive DMart landing page is preserved. It loads the bundled React/CSS assets from `index.html` and uses same-origin API calls, so the front page and backend share `http://localhost:3000` without separate CORS configuration.

Connected endpoints:
- `GET /api/health` — server health check
- `GET /api/apk/info` — checks whether an APK is available before showing download flow
- `GET /api/apk/download` — downloads the APK uploaded by admin
- `POST /api/stats/download-click` — records download clicks
- `POST /api/stats/ping` and `/api/stats/leave` — tracks active visitors
- `GET /api/settings/pixel` and `/api/settings/pixel2` — retrieves configured tracking IDs
- `/api/admin/*` — protected admin operations

Run `npm install` then `npm start`. The front page is `http://localhost:3000`; the admin route is `http://localhost:3000/admin`.
