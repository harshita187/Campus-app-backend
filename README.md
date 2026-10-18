# Campus Bazar API

Backend for **Campus Bazar**, a buy-and-sell marketplace for college students: listings with search and campus filters, JWT login, image uploads, and real-time buyer–seller chat.

**Stack:** Node.js, Express 5, MongoDB (Mongoose 8), Socket.IO, JWT, Joi, Docker, GitHub Actions.

## Features

- **Listings:** create, edit, delete; text search; filters for category, condition, price, urgency and campus ("my campus", "my campus + nearby"); page-based and cursor-based pagination; public listings expire after 30 days.
- **Auth:** signup and login with bcrypt-hashed passwords; a 15-minute access token and a 7-day refresh token in httpOnly cookies; "log out of all devices".
- **Chat:** one conversation per listing and buyer; messages over REST and Socket.IO; only the buyer and the seller can join or read a conversation.
- **Hardening:** Joi validation on every input, rate limits on failed logins and signups, Helmet headers, a CORS allowlist, image-only uploads (JPEG, PNG, WebP, GIF) up to 15 MB.

## Run it

```bash
cp .env.example .env      # then fill in MONGO_URI and JWT_SECRET
npm install
npm run dev               # http://localhost:5001
```

With Docker:

```bash
docker build -t campus-bazar-api .
docker run -p 5001:5001 --env-file .env campus-bazar-api
```

| Variable | Required | Meaning |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Secret used to sign tokens |
| `PORT` | no | Default `5001` |
| `CLIENT_URL`, `CLIENT_URLS` | no | Allowed frontend origins (CORS) |
| `COOKIE_SECURE` | no | `true` behind HTTPS |
| `TRUST_PROXY` | no | Proxies in front of the app; default `1` (Cloud Run). Never `true` |
| `UPLOAD_DIR` | no | Where uploaded images are stored; default `./uploads` |
| `NODE_ENV` | no | `development` adds stack traces to error responses |

Secrets come only from environment variables. `.env` is git-ignored.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | – | Create an account |
| POST | `/api/auth/login` | – | Get an access token (+ httpOnly cookies) |
| POST | `/api/auth/refresh` | refresh cookie | New access token |
| POST | `/api/auth/logout` | – | Clear cookies on this device |
| POST | `/api/auth/logout-all` | yes | End every session of this user, including open chat sockets |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/products` | optional | Search and filter listings (page or cursor) |
| GET | `/api/products/:id` | – | One listing |
| POST / PUT / DELETE | `/api/products[/:id]` | yes (owner) | Create, edit, delete a listing |
| GET | `/api/products/stats/summary` | – | Marketplace stats for the home page |
| POST | `/api/uploads/images` | yes | Upload one image |
| POST | `/api/chat/conversations/product/:productId` | yes | Start (or reopen) a chat about a listing |
| GET | `/api/chat/conversations` | yes | My conversations |
| GET / POST | `/api/chat/conversations/:id/messages` | yes (participant) | Read / send messages |

**Socket.IO events:** connect with `auth: { token }`; then `chat:joinConversation`, `chat:sendMessage`; the server emits `chat:newMessage` and `chat:activity`.

## Tests

```bash
npm test
```

38 tests with `node:test`, `supertest`, `socket.io-client` and an **in-memory MongoDB** (`mongodb-memory-server`), so they never touch a real database and run the same way in GitHub Actions. They cover auth and token revocation (HTTP and sockets), rate limits, chat permissions and the chat race condition, upload safety, the error handler, campus filters, both pagination modes, the startup migrations, and two **MongoDB profiler** checks that the main queries read only about one page of index keys and documents.

Every important fix was checked with a *mutation test*: undo the fix, and its test must fail. All 11 did.

## Design decisions

### 1. Starting a chat is race-safe

Two "start chat" requests that arrive together (a double-click, two tabs) used to both run *find → not found → create*. The unique index on `{productId, buyerId, sellerId}` then rejected the second insert and the user saw a 500 error. A test that fires 8 requests in parallel reproduced it (`E11000 duplicate key`).

The fix is one atomic **upsert** (`findOneAndUpdate` with `upsert: true`). If two upserts still collide on the unique index, the loser catches `E11000` and reads the conversation the winner created. Exactly one request gets `201 Created`; the others get `200` with the same conversation. The unique index is the real guarantee; the upsert removes the error path.

### 2. Tokens: short access token, revocable sessions

- The access token lives 15 minutes; the refresh token lives 7 days. Both are httpOnly cookies, and the access token is also returned in JSON for the SPA's `Authorization` header.
- **Refresh tokens are rejected as access tokens.** Both are signed with the same secret, so without a `type` check a 7-day refresh token worked on every API route. A test proved it (`200` instead of `401`). Bad, expired or wrong-type refresh cookies now get `401`, never `500`.
- **"Log out of all devices" is immediate.** Each user has a `refreshTokenVersion`; every token carries the version it was issued with. Logout-all increases the version, and every request (HTTP and Socket.IO handshake) compares the two, so old access tokens stop working at once instead of after up to 15 minutes. The cost is one lookup of the user by `_id` (primary-key index) per authenticated request.
- **Open chat sockets are closed too.** A socket checked its token only when it connected, so logout-all also disconnects every socket in the user's `user:<id>` room. (With several server instances, this needs a shared Socket.IO adapter such as Redis to reach the other instances.)

### 3. Listing queries are index-backed

- Indexes follow the **ESR rule**: **E**quality fields first (`status`, `category`, `campusKey`, `collegeId`), then the **S**ort fields (`createdAt`, `_id`); `createdAt` also carries the 30-day **R**ange filter.
- **Campus filters use an exact match on `campusKey`** (a normalized copy of the campus name: trimmed, single spaces, lower case) instead of a case-insensitive regex, which cannot use an index well. "MNIT Jaipur" and "  mnit   jaipur " now match.
- Every sort ends with **`_id` as a tie-breaker**, so listings with the same `createdAt` (or price) always come back in the same order and never appear on two pages.
- A profiler test checks the real "my campus" request: it reads its listings straight from the `campusKey` index, with no in-memory sort and no listings from other campuses.

### 4. Two pagination modes

- **Page mode** (`?page=3&limit=12`), used by the website: `skip/limit` plus a total count.
- **Cursor mode** (`?cursor=...`, with `sort=newest` or `oldest`): every response includes `nextCursor`, an opaque value holding the last item's `createdAt` and `_id`. The next query asks for "items after this one" (`createdAt < c OR (createdAt = c AND _id < id)`). MongoDB cannot turn that `OR` into index bounds by itself, so the query also adds the plain range `createdAt <= c`, which lets the index jump straight to the cursor. A profiler test shows page 20 reads at most 16 index keys and documents (about 240 without the range).

### 5. Uploads cannot become web pages

The old upload code trusted the browser's file type and kept the client's file name, and files were served from the API's own domain. An HTML or JavaScript file labelled `image/png` could be uploaded and opened as a page that runs scripts as the API (stored XSS). Now the server accepts only JPEG, PNG, WebP and GIF, saves each file under a random name with the extension that matches its accepted type, and serves uploads with `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`. SVG is refused because it can contain scripts.

### 6. Rate limits that cannot lock everyone out

Behind Cloud Run, every request arrives from Google's front end, so without `trust proxy` the old limiter saw one IP for all users: about 100 requests in 15 minutes from anyone blocked login (and `/me`) for everyone. Now the app trusts exactly one proxy hop, failed logins are limited per IP **and** email (successful ones are not counted), signups per IP, and normal signed-in requests are not limited at all.

### 7. Errors are safe and specific

Malformed ids and schema-validation errors return `400` (naming the field, never echoing its value), duplicates `409`, upload problems `400`/`413`. Responses for real server errors say only "Internal server error"; details go to the server log. Stack traces are sent only when `NODE_ENV=development`.

### 8. Data migrations run before the server opens

Campus filters depend on `campusKey`, so `index.js` connects, runs the migrations (backfill old listings, build the new indexes, drop the ones they replace) and only then starts listening. On Cloud Run, traffic arrives only after the port opens. Each step touches only documents that still need it, so running twice is safe, and the backfill keeps each listing's `updatedAt`.

### 9. Real-time chat

The Socket.IO handshake verifies the JWT. Each user joins `user:<id>`, and only the buyer and the seller can join `conversation:<id>`. Event handlers validate their input and catch their own errors, because a rejected promise inside a socket handler is unhandled and would crash the Node process. A test calls every handler with junk input.

## What I would change at larger scale

- **Rate limiting** keeps counts in memory, so with several server instances each counts separately. Use a shared store such as Redis.
- **Socket.IO** with several instances needs the Redis adapter, so messages and logout-all reach users connected to other instances.
- **Uploads** are stored on the server's disk; object storage (for example S3) would survive redeploys and scale out.
- **Free-text campus search** (`campusQ`) is a substring regex and cannot use an index; a search index (for example Atlas Search) would fix that.
- **Page mode** counts all matching listings on every request; at large scale, cursor mode without a total is cheaper.
- The SPA keeps the access token in `localStorage`; keeping it only in memory (and relying on the refresh cookie) would reduce what an XSS bug could steal.
