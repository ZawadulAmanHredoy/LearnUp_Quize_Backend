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
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin account stored securely in MongoDB upon initialization. Set in `.env`. |
| `JWT_SECRET` | Token signing secret. If empty, one is generated into `.jwt-secret` (git-ignored) and reused across restarts. |
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
Covers admin-only access, answer-key hiding, the 10-phone simultaneous buzz (exactly one winner), single-device sessions, server-side scoring, rapid fire, crash recovery of the live state, and tie detection.

## Audio-Visual Round Media
All clips live in **`public/media/`** in this repo and are served at `http://<server>:5000/media/<file>`. The projector loads them from there, so adding a clip never needs a frontend change.

To add a clip:
1. Copy the file into `public/media/`, e.g. `public/media/flag_quiz.mp4`. Use simple file names (no spaces).
2. Reference it in `data/questions.json`:
   ```json
   {
     "roundType": "AUDIO_VISUAL",
     "order": 3,
     "questionText": "Which country's anthem is this?",
     "mediaType": "AUDIO",
     "mediaUrl": "/media/flag_quiz.mp3",
     "options": [{ "label": "A", "text": "..." }, { "label": "B", "text": "..." }, { "label": "C", "text": "..." }, { "label": "D", "text": "..." }],
     "correctOptionIndex": 1,
     "points": 15,
     "negativePoints": 0
   }
   ```
   `mediaType` is `VIDEO`, `AUDIO` or `IMAGE`. A full `https://...` URL also works, but needs internet at the venue.
3. Restart the server. It logs a warning for any question whose file is missing, the admin's AV deck marks it **⚠ file missing**, and `npm test` fails until the file is there.

Formats: **MP4 (H.264 + AAC)** or **WebM** for video, **MP3** for audio, JPG/PNG/WebP for images. Play the projector in Chrome or Edge. Keep each file well under 100 MB (GitHub's per-file limit); for larger clips use Git LFS or copy them onto the event laptop directly.

## Security Model
- **Admin** REST routes (`/questions`, `/event/*`, team writes) require `Authorization: Bearer <admin token>`. Admin socket events are ignored unless the socket joined `room:admin` with a valid admin token.
- **Teams** join with their login token; the server checks it against the team's current session. A new login on another phone disconnects the old one. The buzzing team is taken from the verified session, never from the message.
- **Projector and phones** never receive the answer key, explanations, team PINs or session tokens. The correct option is sent only with `answer:evaluated`.
- Wrong PIN / password attempts are limited to 10 per minute per IP.

## API Endpoints (`/api/v1`)
- `GET /health` — server, database and LAN addresses (used for the join QR code)
- `POST /auth/admin/login`, `POST /auth/team/login`, `POST /auth/team/logout`, `GET /auth/me`
- `GET /teams` (public: names and scores; admin: includes PINs), `POST /teams`, `PUT /teams/:id`, `DELETE /teams/:id`, `POST /teams/:id/reset-session`, `POST /teams/reset-scores` — admin
- `GET|POST /questions`, `POST /questions/bulk`, `GET|PUT|DELETE /questions/:id` — admin
- `GET /event/state`, `POST /event/reset`, `POST /event/seed` — admin

## Socket.IO Events
Clients first emit `join:room` with `{ role: 'admin' | 'projector' | 'team', token }` and receive a `state:sync` snapshot.

- **Admin → server:** `admin:set-stage`, `admin:set-break`, `admin:end-break`, `admin:load-question`, `admin:show-question` (AV: reveal after media), `admin:reveal-option`, `admin:start-countdown`, `admin:lock-answer`, `admin:evaluate` (`{ isCorrect }`; points come from the question), `admin:media-control` (`play`/`pause`/`replay`/`seek`/`mute`/`unmute`), `admin:set-active-team`, `admin:open-buzzer` / `admin:close-buzzer` / `admin:reset-buzzer`, `admin:rapid-fire-start` / `-action` / `-stop`, `admin:announce-winner`
- **Team → server:** `team:buzz`, `ping:measure`
- **Server → clients:** `stage:updated`, `break:started`, `break:ended`, `question:presented`, `question:shown`, `options:updated`, `countdown:tick`, `buzzer:status`, `buzzer:unlocked`, `buzzer:winner`, `buzzer:confirmed`, `buzzer:rejected`, `buzzer:reset`, `answer:locked`, `answer:evaluated`, `media:sync`, `turn:updated`, `rapid-fire:started` / `tick` / `update` / `times-up`, `leaderboard:update`, `winner:celebration` (`{ champion, isTie, tiedTeams, standings }`), `radar:status`, `admin:notice`, `auth:error`, `auth:session_replaced`, `auth:session_revoked`
