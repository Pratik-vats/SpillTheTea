<div align="center">
  <h1>☕ SpillTheTea</h1>
  <p><strong>Anonymous Real-Time Chat Rooms. No names. No accounts. Just spill.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node" />
    <img src="https://img.shields.io/badge/Socket.IO-Realtime-010101?style=flat-square&logo=socket.io" alt="Socket.IO" />
    <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat-square&logo=mongodb" alt="MongoDB" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
  </p>
</div>

---

A fully anonymous, real-time chat application where users can converse without creating an account. Built with a modern, glassmorphic **Dark Ceramic** theme, it offers a seamless, secure, and highly aesthetically pleasing chat experience.

> **Live Demo:** [spill-the-tea-green.vercel.app](https://spill-the-tea-green.vercel.app)

---

## 📑 Table of Contents
- [✨ Features](#-features)
- [🎨 UI & Design](#-ui--design)
- [🛠 Tech Stack](#-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
- [⚙️ Environment Variables](#️-environment-variables)
- [🌐 Deployment](#-deployment)
- [🏗 Architecture & Security](#-architecture--security)
- [📄 License](#-license)

---

## ✨ Features

- **100% Anonymous:** No sign-ups, emails, or tracking. Users are assigned a random numeric ID and a fun, tea-themed nickname.
- **Multiple Rooms:** Chat in the permanent "Global Lounge" or create your own public/private rooms. Share invite links effortlessly.
- **Real-Time Messaging:** Powered by WebSockets (`Socket.IO`) for instant, ultra-low latency message delivery.
- **Live Online Counter:** See exactly how many users are actively "brewing" in your current room.
- **Chat History:** The last 1,000 messages are safely persisted and instantly loaded upon connection.
- **Anti-Spam & Security:** Strict rate limiting (5 messages per 10 seconds), max 5 connections per IP, and payload caps.
- **Resilient Infrastructure:** Auto-reconnect with exponential backoff and graceful fallback to in-memory storage if the database ever goes offline.

---

## 🎨 UI & Design

The application features a bespoke **Dark Ceramic** theme designed to feel premium and immersive:
- **Glassmorphism:** Frosted glass effects (`backdrop-filter`) on the message composer and sidebars.
- **Dynamic Backgrounds:** A subtle, seamless tea-themed SVG pattern that elegantly contrasts with glowing accents.
- **Custom Typography:** Uses *Caveat* for signature handwritten branding and *Inter* for perfectly legible chat text.
- **Responsive Layout:** A collapsible sidebar and fluid message containers ensure a flawless experience on both desktop and mobile.

---

## 🛠 Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Frontend** | React 18, Vite 5, Vanilla CSS |
| **Backend** | Node.js, Express 4, Socket.IO 4 |
| **Database** | MongoDB (Mongoose 8) |
| **Security** | Helmet, CORS, custom rate limiting, input validation |
| **Hosting** | Vercel (Frontend) & Render (Backend) |

---

## 📁 Project Structure

```text
anon-chat/
├── frontend/                    # React SPA (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx   # Main chat container & header
│   │   │   ├── Message.jsx      # Individual message bubble
│   │   │   ├── MessageInput.jsx # Text input with glassmorphism
│   │   │   ├── OnlineCounter.jsx# Live user count display
│   │   │   ├── Sidebar.jsx      # Room navigation
│   │   │   └── SystemMessage.jsx# Join/leave notifications
│   │   ├── hooks/
│   │   │   └── useChat.js       # Socket logic & state management
│   │   ├── services/
│   │   │   └── socket.js        # Socket.IO client instance
│   │   ├── App.jsx              # Root layout component
│   │   ├── main.jsx             # Entry point
│   │   └── global.css           # Design system & theme styles
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
- **MongoDB** — local instance or [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier supported)

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
npm run dev    # Development with hot-reload (nodemon)
# or
npm start      # Production mode
```

### 3. Set up the frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You should see the chat room with a green "Connected" indicator.

> **Pro Tip:** Open two browser tabs to test real-time messaging between anonymous users instantly.

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

1. Push your code to GitHub.
2. Create a new **Web Service** on Render.
3. Set **Root Directory** to `backend`.
4. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
5. Add the following environment variables:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = your Atlas connection string
   - `CLIENT_URL` = your Vercel frontend URL
   - *Any other rate-limiting variables as needed.*

> Alternatively, use the included `render.yaml` blueprint for a one-click setup.

### Frontend → [Vercel](https://vercel.com)

1. Import your GitHub repo on Vercel.
2. Set **Root Directory** to `frontend`.
3. The framework preset will automatically be detected as **Vite**.
4. Add the environment variable:
   - `VITE_SERVER_URL` = your Render backend URL
5. Deploy.

### Post-Deploy Checklist

- [ ] Set `CLIENT_URL` on Render to your Vercel URL (no trailing slash).
- [ ] Set `VITE_SERVER_URL` on Vercel to your Render URL.
- [ ] Whitelist `0.0.0.0/0` on MongoDB Atlas Network Access (Render IPs are dynamic).
- [ ] Verify the `/health` endpoint returns `{"status":"ok"}`.

---

## 🏗 Architecture & Security

### System Flow
```text
┌─────────────────┐         WebSocket          ┌──────────────────┐
│                 │  ◄──────────────────────►  │                  │
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

### Key Design Decisions

- **Separation of Concerns:** Socket logic, rate limiting, user management, and message persistence are decoupled into modular services.
- **Graceful Degradation:** If MongoDB is unreachable, the chat continues using an in-memory buffer. When the DB reconnects, buffered messages are safely flushed to MongoDB.
- **Auto-Reconnect:** Exponential backoff reconnection (1s → 2s → 4s → ... → 30s cap) with keep-alive pings every 4 minutes guarantees stability.
- **No Persistent Identity:** Deliberately stores the bare minimum: a numeric user ID, nickname, message text, and timestamp. No IPs, cookies, or fingerprints are logged.

### Security Implementations

| Protection | Implementation |
|:-----------|:---------------|
| **Helmet** | Enforces strict security headers (HSTS, X-Content-Type-Options). |
| **CORS** | Locked strictly to the configured `CLIENT_URL` origin(s). |
| **Rate Limiting** | Sliding window per socket (default: 5 msgs / 10s). |
| **Connection Cap** | Maximum 5 concurrent connections per IP address. |
| **Input Validation** | Messages are trimmed, length-checked, and stripped of control characters. |
| **Payload Limits** | Socket.IO `maxHttpBufferSize` capped at 20KB to prevent memory exhaustion. |
| **XSS Prevention** | Messages safely rendered as plain text via React (no `dangerouslySetInnerHTML`). |

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
