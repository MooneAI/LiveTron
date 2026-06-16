# LiveTron

LiveTron is a two-player, phone-first outdoor light-cycle game. Players join the same match with an invite link, ready up, then run outdoors while GPS bearing changes steer clean Tron-style right-angle turns in a shared virtual arena.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Local development works without `DATABASE_URL` using an in-memory store. For production on Vercel, add a Neon database through the Vercel Marketplace and expose `DATABASE_URL`.

## Deploy

1. Push this repo to GitHub.
2. Import the GitHub repo in Vercel.
3. Add Neon from the Vercel Marketplace so `DATABASE_URL` is provisioned.
4. Deploy.

The server initializes the required tables automatically on first request.

## Gameplay Notes

- GPS is used to infer the player's bearing, then the app snaps that bearing to north/east/south/west.
- Swipe controls and on-screen buttons are included for testing and fallback.
- The game is intentionally forgiving: noisy GPS readings and low-accuracy samples are ignored.
- Players should use a clear outdoor space and rely on haptics/audio cues instead of staring at the phone while running.
