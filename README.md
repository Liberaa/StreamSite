# StreamSite

För en kund som vill ha en Twitch-lik hemsida.

A creator-first live streaming site in the spirit of Twitch, built with Node.js, Express, MongoDB and EJS.

Creators go live from OBS, from a phone app, or straight from their phone's browser; viewers watch, chat and follow in real time. The folder structure is laid out so the bigger features (VODs, moderation, subscriptions and so on) each have an obvious home.

## What works today

- **Accounts.** Sign up, log in and log out. Every account is also a channel at `/<username>`.
- **Go live from OBS.** Each creator has a private stream key, checked before a stream is accepted.
- **Go live from a phone.** Stream with the phone's camera right in the browser, no app needed. RTMP apps such as Larix Broadcaster work too.
- **Watch live.** Channel pages play the stream with low delay on computers and phones, and start by themselves when the creator goes live.
- **Chat.** Real-time chat per channel with a Creator badge, slow mode and live viewer counts.
- **Creator profiles.** Display name, bio, links and a channel color that themes the creator's page and cards.
- **Following.** Viewers follow creators, and follower counts show on cards and channel pages.
- **Creator dashboard.** Live status and viewers, stream title and category, OBS and phone setup with copy buttons, and stream key reset.

## Getting started

You need Node.js 20.12 or newer (22 or 24 LTS recommended, since Node 20 is end-of-life), MongoDB (local, or a free MongoDB Atlas cluster), and OBS Studio if you stream from a computer.

```bash
npm install             # also downloads ffmpeg, used for streaming from browsers
cp .env.example .env    # set SESSION_SECRET, and MONGODB_URI if you use Atlas
npm run seed            # optional: 5 demo creators, password "password123"
npm run dev             # starts the site and restarts it when code changes
```

Then open http://localhost:3000. Use `npm start` to run without auto-restart.

### Going live with OBS

1. Create an account and open **Dashboard**.
2. In OBS, open **Settings > Stream** and set **Service** to **Custom...**.
3. Copy **Server** and **Stream Key** from the dashboard into OBS.
4. Press **Start Streaming**. The dashboard switches to **Live** and your channel page starts playing.

Use an H.264 video encoder (x264, or NVENC/QuickSync H.264) with a 2 second keyframe interval. Browsers cannot play HEVC or AV1 from this server.

### Going live from a phone

**In the browser, no app.** Browsers only allow the camera on https pages, so in development the server also runs https on port 3443 with its own certificate. The startup log prints the address, for example `https://192.168.1.23:3443`.

1. Connect the phone to the same Wi-Fi as the computer and open that address.
2. The browser warns about the certificate. Choose to continue; it is the development certificate from `storage/dev-https`.
3. Log in, then tap **Go live with camera** on the dashboard.
4. Tap **Turn on camera**, then **Go live**. Keep the page open and the screen on while you stream.

On a real server, the site's normal https address works the same way.

**With an app.** Larix Broadcaster (free for iPhone and Android) and other RTMP apps work with the **Server for phone apps** and **Stream key** from the dashboard, or with the **Full URL** for apps that have a single field.

On Windows, allow Node.js on private networks when the firewall asks, otherwise phones cannot connect.

## How it works

```
OBS / phone app --RTMP :1935--------------------------> node-media-server --+
                                                          (checks the key)  |
phone browser --camera chunks, /ingest.io--> ffmpeg --RTMP--^               |
                                                                            v
viewers <--video /live/<name>.flv-- Express :3000 <------HTTP-FLV :8000-----+
viewers <--chat, viewer counts, live status-- Socket.IO :3000 <-- streamEvents
```

- OBS sends the stream key as `<username>?key=<secret>`. The media server looks up the user and compares the secret, and viewers only ever see `/live/<username>.flv`.
- The phone page records the camera with MediaRecorder and sends half-second chunks over Socket.IO. ffmpeg on the server turns them into a normal stream, so everything downstream works exactly like with OBS.
- The website relays the video to viewers, so it works on https pages and behind proxies, and only the web port has to be public.
- When a stream starts or ends, the media server updates MongoDB and emits an event on `streamEvents`. Sockets forward it, so pages update without reloading.

## Folder structure

```
StreamSite/
|-- server.js               Entry point: database, web servers, sockets, media server
|-- src/
|   |-- app.js              Express setup: security, static files, video relay, sessions, routes
|   |-- config/             .env settings, MongoDB, sessions, categories, dev https certificate
|   |-- models/             Mongoose schemas: User (account + channel), Follow
|   |-- routes/             URL to controller mapping, one file per area, plus the video relay
|   |-- controllers/        Request handlers: home, auth, channel, dashboard
|   |-- middleware/         Login checks, security headers, CSRF protection, flash, errors
|   |-- services/           Media server, ffmpeg, stream events, viewer counts, media URLs
|   |-- sockets/            Socket.IO: chat and live status, browser streaming (ingest.js)
|   `-- utils/              Small helpers: forms, formatting, network, stream keys, redirects
|-- views/
|   |-- partials/           Shared pieces: head, nav, footer, avatar, cards
|   `-- pages/              One template per page
|-- public/                 Static files: css/, js/ (browser scripts), images/
|-- scripts/seed.js         Demo creators for development
`-- storage/                Runtime data and the dev certificate (created on start, git-ignored)
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
| `DEV_HTTPS_PORT` | `3443` | Development https for phones. Empty turns it off; never used in production |
| `RTMP_PORT` | `1935` | Where OBS and phone apps send video |
| `MEDIA_HTTP_PORT` | `8000` | Internal video port that the website relays |
| `MEDIA_BIND` | `0.0.0.0` | Network interface for the media server |
| `MEDIA_LOG_LEVEL` | `warn` | node-media-server logging: `trace` to `error` |
| `MEDIA_PUBLIC_URL` | (unset) | Serve video from a separate media server or CDN instead of the relay |
| `RTMP_PUBLIC_URL` | (derived) | Public OBS server address, e.g. `rtmp://ingest.example.com/live` |
| `FFMPEG_PATH` | (ffmpeg-static) | Use another ffmpeg for browser streaming |
| `BROWSER_STREAM_LIMIT` | `4` | Browser streams at the same time. Each uses about one CPU core |

## Security in place

- Passwords are hashed with bcrypt. Password hashes and stream keys are never loaded from the database unless a query asks for them.
- Sessions get a new id on login. Cookies are `HttpOnly` and `SameSite=Lax`, plus `Secure` in production.
- Form posts from other websites are rejected (CSRF protection through `Sec-Fetch-Site` and `Origin` checks), and Socket.IO refuses cross-site connections.
- Helmet sets security headers, including a Content Security Policy. The referrer policy is `same-origin`, which keeps the `Origin` header that the CSRF check relies on.
- Browser streaming only accepts logged-in creators on this site. The server's ffmpeg publishes with a single-use token, so stream keys never appear on a command line.
- Login and sign-up are rate limited. Chat has slow mode, a length limit and strips invisible control characters.
- Redirects after login only go to paths on this site. Templates escape all user content, and chat messages are inserted as text.
- Resetting a stream key immediately ends a stream that uses the old key.
- `services/mediaServer.js` filters requests to the media server, because node-media-server 4.4.3 to 4.4.6 crashes the whole process on malformed stream URLs such as `/live/a%20b.flv`.
  node-media-server is pinned to an exact version in `package.json` because this guard relies on its internals. Re-test the guard before upgrading.

## Known limitations

- When OBS or a phone app stops, the channel stays live for about 30 seconds, so a creator whose connection drops can resume without viewers losing the stream. "End stream" in the browser ends it at once.
- Browser streaming re-encodes video on the server, about one CPU core per stream. iPhones record MP4, which adds roughly a second of delay.
- Streaming from a phone's browser needs the page open and the screen on. A locked phone pauses the camera.
- Safari on iPhone can be strict about self-signed certificates. If the stream will not start there during development, trust the certificate from `storage/dev-https/cert.pem` on the phone, or reach the site through an https tunnel.
- Chat is not saved. Viewers only see messages sent while their page is open.
- Viewer counts, chat rooms and the media server run in one Node process. Running several servers needs the Socket.IO Redis adapter and a separate media server.
- Watching needs Media Source Extensions: Chrome, Edge, Firefox, desktop Safari, Android, and iPhone with iOS 17.1 or newer.
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
