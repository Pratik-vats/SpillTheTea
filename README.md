# ☕ SpillTheTea — Anonymous Real-Time Chat

A fully anonymous, real-time chat application where users can say anything without creating an account. No sign-ups, no emails, no passwords — just connect and start spilling.

> **Live:** [spill-the-tea-green.vercel.app](https://spill-the-tea-green.vercel.app)

---

## ✨ Features

- **100% Anonymous** — No accounts, no tracking. Every user gets a random numeric ID and a fun tea-themed nickname
- **Real-Time Messaging** — Powered by WebSockets (Socket.IO) for instant message delivery
- **Live Online Counter** — See how many people are in the room
- **Join/Leave Notifications** — Know when someone enters or leaves
- **Chat History** — Last 1,000 messages are persisted and loaded on connect
- **Anti-Spam Protection** — Rate limiting (5 messages per 10 seconds) prevents flooding
- **Connection Cap** — Max 5 connections per IP to prevent resource abuse
- **Auto-Reconnect** — Seamlessly reconnects if the connection drops
- **Graceful Degradation** — Falls back to in-memory storage if the database is temporarily unreachable
- **Mobile Responsive** — Clean, modern UI that works on all screen sizes

---

## 🛠 Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Frontend** | React 18, Vite 5, Vanilla CSS |
| **Backend** | Node.js, Express 4, Socket.IO 4 |
| **Database** | MongoDB (Mongoose 8) |
| **Security** | Helmet, CORS, rate limiting, input validation |
| **Hosting** | Vercel (frontend) + Render (backend) |

---

## 📁 Project Structure

```
anon-chat/
├── frontend/                    # React SPA (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx   # Main chat container
│   │   │   ├── Message.jsx      # Individual message bubble
│   │   │   ├── MessageInput.jsx # Text input with send button
│   │   │   ├── OnlineCounter.jsx# Live user count display
│   │   │   └── SystemMessage.jsx# Join/leave notifications
│   │   ├── hooks/
│   │   │   └── useChat.js       # All socket logic & state management
│   │   ├── services/
│   │   │   └── socket.js        # Socket.IO client instance
│   │   ├── App.jsx              # Root component
│   │   ├── main.jsx             # Entry point
│   │   └── global.css           # All styles (glassmorphism theme)
│   └── package.json
│
├── backend/                     # Node.js API + WebSocket server
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js      # MongoDB connection + auto-reconnect
│   │   ├── middleware/
│   │   │   └── security.js      # Message validation & IP extraction
│   │   ├── models/
│   │   │   └── Message.js       # Mongoose schema
│   │   ├── services/
│   │   │   ├── messageManager.js# Persistence + 1000-message retention
│   │   │   ├── rateLimiter.js   # Per-socket sliding window rate limiter
│   │   │   └── userManager.js   # Session tracking + connection caps
│   │   ├── sockets/
│   │   │   └── chatSocket.js    # Socket.IO event handlers
│   │   ├── app.js               # Express setup (health check, CORS)
│   │   └── server.js            # Entry point (HTTP + Socket.IO + DB)
│   ├── .env.example             # Environment variable template
│   └── package.json
│
├── render.yaml                  # Render deployment blueprint
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **MongoDB** — local instance or [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/anon-chat.git
cd anon-chat
```

### 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your MongoDB connection string:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/anon-chat
CLIENT_URL=http://localhost:5173
```

Start the backend:

```bash
npm run dev    # with hot-reload (nodemon)
# or
npm start      # production mode
```

### 3. Set up the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — you should see the chat room with a green "Connected" indicator.

> **Tip:** Open two browser tabs to test real-time messaging between anonymous users.

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|:---------|:--------|:------------|
| `PORT` | `5000` | Server port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/anon-chat` | MongoDB connection string |
| `CLIENT_URL` | `http://localhost:5173` | Allowed CORS origin(s), comma-separated |
| `MAX_CONNECTIONS_PER_IP` | `5` | Max simultaneous WebSocket connections per IP |
| `RATE_LIMIT_MAX_MESSAGES` | `5` | Messages allowed per rate limit window |
| `RATE_LIMIT_WINDOW_MS` | `10000` | Rate limit window in milliseconds |
| `MAX_MESSAGE_LENGTH` | `500` | Max characters per message |
| `MAX_STORED_MESSAGES` | `1000` | Message retention cap in the database |

### Frontend

| Variable | Default | Description |
|:---------|:--------|:------------|
| `VITE_SERVER_URL` | `http://localhost:5000` | Backend server URL (baked in at build time) |

---

## 🌐 Deployment

### Backend → [Render](https://render.com)

1. Push your code to GitHub
2. Create a new **Web Service** on Render
3. Set **Root Directory** to `backend`
4. Set **Build Command** to `npm install`
5. Set **Start Command** to `npm start`
6. Add environment variables:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = your Atlas connection string
   - `CLIENT_URL` = your Vercel frontend URL
   - Other rate-limiting vars as needed

> Alternatively, use the included `render.yaml` blueprint for one-click setup.

### Frontend → [Vercel](https://vercel.com)

1. Import your GitHub repo on Vercel
2. Set **Root Directory** to `frontend`
3. Framework preset will auto-detect as **Vite**
4. Add environment variable:
   - `VITE_SERVER_URL` = your Render backend URL
5. Deploy

### Post-Deploy Checklist

- [ ] Set `CLIENT_URL` on Render to your Vercel URL (no trailing slash)
- [ ] Set `VITE_SERVER_URL` on Vercel to your Render URL
- [ ] Whitelist `0.0.0.0/0` on MongoDB Atlas Network Access (Render IPs are dynamic)
- [ ] Verify the `/health` endpoint returns `{"status":"ok"}`

---

## 🏗 Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│                 │  ◄──────────────────────►   │                  │
│   React SPA     │      (Socket.IO)           │   Node.js API    │
│   (Vercel CDN)  │                            │   (Render)       │
│                 │                            │                  │
└─────────────────┘                            └────────┬─────────┘
                                                        │
                                                        │ Mongoose
                                                        ▼
                                               ┌──────────────────┐
                                               │   MongoDB Atlas  │
                                               │   (Free M0)      │
                                               └──────────────────┘
```

**Key design decisions:**

- **Separation of concerns** — Socket logic, rate limiting, user management, and message persistence are each in their own service module
- **Graceful degradation** — If MongoDB is unreachable, the chat continues using an in-memory buffer. When the DB reconnects, buffered messages are automatically flushed to MongoDB
- **Auto-reconnect** — Exponential backoff reconnection (1s → 2s → 4s → ... → 30s cap) with keep-alive pings every 4 minutes
- **No persistent identity** — Deliberately stores the bare minimum: a numeric user ID, nickname, message text, and timestamp. No IPs, no cookies, no fingerprints

---

## 🛡 Security

| Protection | Implementation |
|:-----------|:---------------|
| **Helmet** | Sets security headers (HSTS, X-Content-Type-Options, etc.) |
| **CORS** | Locked to the configured `CLIENT_URL` origin(s) |
| **Rate Limiting** | Sliding window per socket — 5 msgs / 10s |
| **Connection Cap** | Max 5 connections per IP address |
| **Input Validation** | Messages trimmed, length-checked, control characters stripped |
| **Payload Size** | Socket.IO `maxHttpBufferSize` capped at 20KB |
| **XSS Prevention** | Messages rendered as plain text via React (no `dangerouslySetInnerHTML`) |

---

## 📊 Capacity (Free Tier)

| Metric | Safe Range | Hard Limit |
|:-------|:-----------|:-----------|
| Concurrent users | 50–200 | ~500 |
| Messages/second | 10–25 | ~50 |
| Stored messages | ~1.5M | 512MB (Atlas M0) |

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
