# LearnUp Quiz Backend 🚀

Real-time quiz and live tournament backend powered by Node.js, Express, MongoDB, and Socket.IO.

## Tech Stack
- **Runtime**: Node.js
- **Web Framework**: Express 4
- **Real-Time Engine**: Socket.IO
- **Database**: MongoDB + Mongoose
- **Security**: Helmet, CORS

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Purpose |
| :--- | :--- |
| `MONGODB_URI` | MongoDB connection. If unreachable, the server runs on an in-memory store (state is lost on restart). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login. When `ADMIN_PASSWORD` is set, the account is created or its password reset to match on every start. **Set it before the event**; without it the first-start fallback is `admin` / `admin123`. |
| `JWT_SECRET` | Token signing secret. If empty, one is generated into `.jwt-secret` (git-ignored) and reused across restarts. |
| `MAX_UPLOAD_MB` | Largest media upload in MB (default 200). |
| `MEDIA_CACHE_DIR` | Where the server keeps its local copy of uploaded media (default `media-cache/`). |
| `CLIENT_URL`, `CORS_RESTRICT` | CORS is open by default so phones can reach the server over the venue LAN. Set `CORS_RESTRICT=true` to allow only `CLIENT_URL` (comma-separated). |

### 3. Run Development Server
```bash
npm run dev
```
The server listens on `0.0.0.0:5000`, so phones on the same Wi-Fi can reach it at `http://<laptop-ip>:5000`.

### 4. Run Tests
```bash
npm test
```
Covers admin-only access, answer-key hiding, the 10-phone simultaneous buzz (exactly one winner), single-device sessions, server-side scoring, rapid fire, crash recovery of the live state, tie detection, question validation/reorder/import/export, and media upload, streaming and delete rules. Tests run without MongoDB (in-memory store); the GridFS path needs a real database.

## Question Bank & Media
Questions and media are managed from the admin website (**Questions Bank** in the sidebar): create, edit, delete and reorder questions per round, and upload clips for the audio-visual round. MongoDB is the source of truth.

- **First start only:** if the database has no questions, the starter set in `data/questions.json` is loaded and its sample clips (`data/sample-media/`) are uploaded. After that the file is never applied again. Use **Export JSON** / **Import JSON** in the Question Bank for backups.
- **Media storage:** uploads are stored in MongoDB GridFS (bucket `media`) with a `MediaAsset` record. The server also keeps a copy of every file in `media-cache/` and always serves from there, so playback never waits on the database. After a restart or redeploy the copies are rebuilt from GridFS. Without a database (development), the cache folder is the only copy.
- **No buffering on stage:** when the admin logs in, the admin's browser downloads every audio-visual clip into local browser storage (IndexedDB), and every connected projector is told to do the same. The projector plays the local copy, so nothing streams during the round. The admin header shows **Clips: projector N/N**, and loading a clip that isn't downloaded yet asks for confirmation.
- Media ids are content hashes: uploading the same file twice stores it once, and `/media/:id` is cached forever by browsers.
- A file used by a question can't be deleted, and the question currently on stage can't be deleted.
- Upload formats: MP4/WebM/MOV video, MP3/WAV/OGG/M4A audio, JPG/PNG/WebP/GIF images. Limit `MAX_UPLOAD_MB` (default 200). Play the projector in Chrome or Edge.
- **MongoDB Atlas free tier holds 512 MB in total**, so keep clips short and compressed (1080p at a few Mbps is plenty for a projector), or use a paid tier or a local MongoDB for the event.

## Security Model
- **Admin** REST routes (`/questions`, `/event/*`, team writes) require `Authorization: Bearer <admin token>`. Admin socket events are ignored unless the socket joined `room:admin` with a valid admin token.
- **Teams** join with their login token; the server checks it against the team's current session. A new login on another phone disconnects the old one. The buzzing team is taken from the verified session, never from the message.
- **Projector and phones** never receive the answer key, explanations, team PINs or session tokens. The correct option is sent only with `answer:evaluated`.
- Wrong PIN / password attempts are limited to 10 per minute per IP.

## API Endpoints (`/api/v1`)
- `GET /health` — server, database and LAN addresses (used for the join QR code)
- `POST /auth/admin/login`, `POST /auth/team/login` (`{ teamId | teamNumber, pin }`; Team ID is case-insensitive), `POST /auth/team/logout`, `GET /auth/me`
- `GET /teams` (public: names and scores; admin: includes PINs), `POST /teams`, `PUT /teams/:id`, `DELETE /teams/:id`, `POST /teams/:id/reset-session`, `POST /teams/reset-scores` — admin. Teams have `teamName`, `teamNumber`, `teamId` (default `T-<nn>`), `institution`, `teamLead`, `pin`; number and Team ID must be unique
- `PUT /teams/:id/score` / `POST /teams/:id/adjust-score` — admin score correction: `{ delta, roundType }` adds points, `{ roundScores }` overwrites rounds (total follows), `{ score }` overwrites the total
- `GET|POST /questions`, `POST /questions/bulk`, `PUT /questions/reorder`, `GET /questions/export`, `GET|PUT|DELETE /questions/:id`, `DELETE /questions/round/:roundType` (refused while that round is on stage) — admin
- `GET|POST /media` (multipart field `file`), `GET /media/manifest`, `DELETE /media/:id` — admin
- `GET /media/:id` (outside `/api`) — streams a clip with range support; public so the projector can play it
- `GET /event/state`, `POST /event/reset`, `POST /event/seed` — admin

## Socket.IO Events
Clients first emit `join:room` with `{ role: 'admin' | 'projector' | 'team', token }` and receive a `state:sync` snapshot.

- **Admin → server:** `admin:set-stage` (switching to a round puts its first question on stage), `admin:update-welcome` (`{ welcomeConfig: { title, subtitle, badgeText, showQr, showTeams } }`), `admin:update-team-score` (`{ teamId, ... }`, same body as the score endpoint), `admin:set-break`, `admin:end-break`, `admin:load-question`, `admin:show-question` (shows the question text; options are then revealed one by one), `admin:reveal-option`, `admin:start-countdown`, `admin:lock-answer`, `admin:evaluate` (`{ isCorrect }`; points come from the question), `admin:media-control` (`play`/`pause`/`replay`/`seek`/`mute`/`unmute`), `admin:set-active-team`, `admin:open-buzzer` / `admin:close-buzzer` / `admin:reset-buzzer`, `admin:rapid-fire-start` / `-action` / `-stop`, `admin:announce-winner`
- **Team → server:** `team:buzz`, `ping:measure`
- **Media sync:** admin `admin:media-preload` (`{ force }`) → projectors get `media:preload`; projectors report `projector:media-status` → admins get `media:projector-status`; admins and projectors get `media:manifest` on join and whenever the bank changes; admins get `questions:updated`
- **Server → clients:** `stage:updated` / `stage:changed`, `welcome:updated`, `break:started`, `break:ended`, `question:presented`, `question:shown`, `options:updated`, `countdown:tick`, `buzzer:status`, `buzzer:unlocked`, `buzzer:winner`, `buzzer:confirmed`, `buzzer:rejected`, `buzzer:reset`, `answer:locked`, `answer:evaluated`, `media:sync`, `turn:updated`, `rapid-fire:started` / `tick` / `update` / `times-up`, `leaderboard:update`, `winner:celebration` (`{ champion, isTie, tiedTeams, standings }`), `radar:status`, `admin:notice`, `auth:error`, `auth:session_replaced`, `auth:session_revoked`
