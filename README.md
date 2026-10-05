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

### 3. Run Development Server
```bash
npm run dev
```

### API Endpoints
- `GET /health` - Server & database health status
- `GET /api/v1/quizzes` - List all quizzes
- `GET /api/v1/quizzes/:id` - Fetch quiz by ID or code
- `POST /api/v1/quizzes` - Create new quiz

### Socket.IO Events
- Client emit `ping` -> Server emits `pong`
- Client emit `join_room` with `{ room, userName }`
- Client emit `leave_room` with `{ room, userName }`
- Server emits `user_joined`, `user_left`
