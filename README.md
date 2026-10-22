# StreamSite

För en kund som vill ha en Twitch-lik hemsida.

A creator-first live streaming site in the spirit of Twitch, built with Node.js, Express, MongoDB and EJS.

This first version is deliberately small. Creators sign up and stream from OBS; viewers watch, chat and follow in real time. The folder structure is laid out so the bigger features (VODs, moderation, subscriptions and so on) each have an obvious home.

## What works today

- **Accounts.** Sign up, log in and log out. Every account is also a channel at `/<username>`.
- **Go live from OBS.** Each creator has a private stream key, checked before a stream is accepted.
- **Watch live.** Channel pages play the stream in the browser with low delay. A page left open starts playing by itself when the creator goes live.
- **Chat.** Real-time chat per channel with a Creator badge, slow mode and live viewer counts.
- **Creator profiles.** Display name, bio, links and a channel color that themes the creator's page and cards.
- **Following.** Viewers follow creators, and follower counts show on cards and channel pages.
- **Creator dashboard.** Live status and viewers, stream title and category (viewers see changes instantly), OBS setup with copy buttons, and stream key reset.
- **Homepage.** "Live now" sorted by viewers, plus a "Meet the creators" directory.

## Getting started

You need Node.js 20.12 or newer (22 or 24 LTS recommended, since Node 20 is end-of-life), MongoDB (local, or a free MongoDB Atlas cluster) and OBS Studio.

```bash
npm install
cp .env.example .env    # set SESSION_SECRET, and MONGODB_URI if you use Atlas
npm run seed            # optional: 5 demo creators, password "password123"
npm run dev             # starts the site and restarts it when code changes
```

Then open http://localhost:3000. Use `npm start` to run without auto-restart.

### Going live with OBS

1. Create an account and open **Dashboard**.
2. In OBS, open **Settings > Stream** and set **Service** to **Custom...**.
3. Copy **Server** (`rtmp://localhost/live`) and **Stream Key** from the dashboard into OBS.
4. Press **Start Streaming**. The dashboard switches to **Live** and your channel page starts playing.

Use an H.264 video encoder (x264, or NVENC/QuickSync H.264) with a 2 second keyframe interval. Browsers cannot play HEVC or AV1 from this server.

## How it works

```
OBS --RTMP :1935--> node-media-server --HTTP-FLV :8000--> player in the browser (mpegts.js)
                         |
                         | checks the stream key in MongoDB,
                         | marks the channel live/offline
                         v
                    streamEvents --> Socket.IO :3000 --> chat, viewer counts, live status
                                     Express  :3000 --> pages (EJS), forms, follow API
```

- OBS sends the stream key as `<username>?key=<secret>`. The media server looks up the user and compares the secret. Viewers watch `/live/<username>.flv`, so the secret never reaches them.
- When a stream starts or ends, the media server updates MongoDB and emits an event on `streamEvents`. The socket layer forwards it to everyone on that channel, so pages update without reloading.
- Logins are stored in MongoDB sessions, which Socket.IO shares, so chat knows who is logged in.

## Folder structure

```
StreamSite/
|-- server.js               Entry point: database, web server, sockets, media server
|-- src/
|   |-- app.js              Express setup: security, static files, sessions, routes
|   |-- config/             .env settings, MongoDB connection, sessions, stream categories
|   |-- models/             Mongoose schemas: User (account + channel), Follow
|   |-- routes/             URL to controller mapping, one file per area
|   |-- controllers/        Request handlers: home, auth, channel, dashboard
|   |-- middleware/         Login checks, security headers, CSRF protection, flash, errors
|   |-- services/           Media server, stream events, viewer counts, media URLs
|   |-- sockets/            Socket.IO setup, chat handlers, room names
|   `-- utils/              Small helpers: forms, formatting, stream keys, redirects
|-- views/
|   |-- partials/           Shared pieces: head, nav, footer, avatar, cards
|   `-- pages/              One template per page
|-- public/                 Static files: css/, js/ (browser scripts), images/
|-- scripts/seed.js         Demo creators for development
`-- storage/                Media server runtime data (created on start, git-ignored)
```

A request flows `routes/` > `middleware/` > `controllers/` > `models/` > `views/`. Anything that is not about a single HTTP request, like the media server or events, lives in `services/`.

## Configuration

All settings live in `.env` (see `.env.example`). Everything has a development default.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Website and Socket.IO port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/streamsite` | Database connection string |
| `SESSION_SECRET` | dev-only value | Signs session cookies. Required in production |
| `TRUST_PROXY` | `false` | Set to `true` behind nginx, Render, Railway and similar |
| `RTMP_PORT` | `1935` | Where OBS sends video |
| `MEDIA_HTTP_PORT` | `8000` | Where browsers load video |
| `MEDIA_BIND` | `0.0.0.0` | Network interface for the media server |
| `MEDIA_LOG_LEVEL` | `warn` | node-media-server logging: `trace` to `error` |
| `MEDIA_PUBLIC_URL` | (derived) | Public playback address, e.g. `https://media.example.com` |
| `RTMP_PUBLIC_URL` | (derived) | Public OBS server address, e.g. `rtmp://ingest.example.com/live` |

## Security in place

- Passwords are hashed with bcrypt. Password hashes and stream keys are never loaded from the database unless a query asks for them.
- Sessions get a new id on login. Cookies are `HttpOnly` and `SameSite=Lax`, plus `Secure` in production.
- Form posts from other websites are rejected (CSRF protection through `Sec-Fetch-Site` and `Origin` checks), and Socket.IO refuses cross-site connections.
- Helmet sets security headers, including a Content Security Policy that only allows this site and the media server.
- Login and sign-up are rate limited. Chat has slow mode, a length limit and strips invisible control characters.
- Redirects after login only go to paths on this site. Templates escape all user content, and chat messages are inserted as text.
- Resetting a stream key immediately ends a stream that uses the old key.
- `services/mediaServer.js` filters requests to the media server, because node-media-server 4.4.3 to 4.4.6 crashes the whole process on malformed stream URLs such as `/live/a%20b.flv`.
  node-media-server is pinned to an exact version in `package.json` because this guard relies on its internals. Re-test the guard before upgrading.

## Known limitations

- When OBS stops, the channel stays live for about 30 seconds. node-media-server keeps the slot open so a creator whose connection drops can resume without viewers losing the stream.
- Chat is not saved. Viewers only see messages sent while their page is open.
- Viewer counts, chat rooms and the media server run in one Node process. Running several servers needs the Socket.IO Redis adapter and a separate media server.
- Playback uses HTTP-FLV through Media Source Extensions. That works in Chrome, Edge, Firefox and desktop Safari, but not on older iPhones. Adding HLS output fixes this.
- Avatars are initials on the creator's color. There are no image uploads yet.

## Where to go next

| Feature | Where it goes |
| --- | --- |
| Chat history, mods, timeouts and bans | `models/ChatMessage.js`, `models/Ban.js`, `sockets/chat.js` |
| Avatar and banner uploads | Upload route in `routes/dashboard.routes.js`, file storage service in `services/` |
| "Followed creator is live" notifications | Listen to `streamEvents` `'live'` in a new `services/notifications.js` |
| Following page and sidebar | `routes/following.routes.js`, reusing `views/partials/stream-card.ejs` |
| Browse by category and search | `routes/browse.routes.js`, using `config/categories.js` |
| Live thumbnails, VODs and HLS | ffmpeg jobs in `services/`, reacting to `streamEvents` |
| Tips and subscriptions | Stripe service in `services/`, webhook route in `routes/` |
| Tests | `tests/` with `node --test` and supertest |

Mount new top-level pages before the channel routes in `routes/index.js`, and add their names to `RESERVED_USERNAMES` in `models/User.js`, so nobody can register a username that hides them.
