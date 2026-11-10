# Commando 2 — Discord Activity

Plays the original Commando 2 Flash game inside Discord, using [Ruffle](https://ruffle.rs) as the Flash Player emulator. It runs as a Discord Activity, and Discord lists the Activity on the player's profile by default. With a small server for the OAuth token exchange (included for Node and Cloudflare Workers), it also publishes custom Rich Presence details, state and play time. The game itself is fully static, so GitHub Pages is enough for the default profile presence.

- `public/games/commando-2.swf` — the original game (moved here from the repo root so Vite serves it).
- `src/game.ts` — loads the self-hosted Ruffle build and the SWF.
- `src/discord.ts` — Activity handshake, OAuth token exchange, `setActivity` Rich Presence.
- `server/` — Express server with `/api/token` and the production build, plus the Vite dev middleware for the same route.

## Run it locally

Requires Node.js 20.19+ or 22.12+ (22 LTS recommended).

```bash
npm install
cp .env.example .env   # fill in your Discord app credentials
npm run dev            # http://localhost:3000
```

The game is playable in a normal browser tab. Discord-specific pieces only run when the page is launched inside Discord's Activity iframe, so a local tab shows a short "browser preview" note instead of a profile status.

To test the production server exactly as deployed:

```bash
npm run preview        # builds, then serves dist/ on http://localhost:3000
```

`npm start` serves the existing build with `PORT` (default `3000`). It reads `.env` automatically when present.

## Discord app setup

1. Create an app at <https://discord.com/developers/applications> and copy its **Application ID** and **Client Secret** into `.env`:

   ```
   VITE_DISCORD_CLIENT_ID=your_application_id
   DISCORD_CLIENT_ID=your_application_id
   DISCORD_CLIENT_SECRET=your_client_secret
   ```

2. **OAuth2 → Redirects**: add `https://127.0.0.1` as a placeholder. The Embedded App SDK completes the redirect itself, but Discord requires at least one redirect URI.

3. **Activities → Settings**: enable **Activities**. This also creates the default **Launch** entry-point command used from the App Launcher.

4. **Activities → URL Mappings**: map prefix `/` to a public HTTPS origin for your app. For local development, expose port 3000 with a tunnel and use the tunnel hostname:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   # or: ngrok http 3000
   ```

   Then use the generated hostname (no `https://`, no trailing slash) as the target.

5. Launch the Activity from a Discord server's App Launcher (or a DM/group DM where the app is installed). A non-distributed app can only be launched by you and your developer team. Developer Mode (User Settings → Advanced) makes the App Launcher easier to find.

The browser never sees the client secret: `src/discord.ts` sends the one-time OAuth `code` to `/api/token`, and `server/token.mjs` exchanges it with Discord.

### Deploying

There are two levels of presence:

- **Default Activity presence — no backend needed.** While a player is in the Activity, Discord shows the app and its icon on their profile. A static host such as GitHub Pages is enough.
- **Custom presence — details, state, elapsed timer.** This calls `setActivity()`, which needs an OAuth token exchange with the app's client secret. That requires a server (Node or the included Cloudflare Worker), so it is not available on static hosting.

`VITE_TOKEN_ENDPOINT` controls this: it defaults to `/api/token`, and `none` disables the auth flow so a static build never calls a route that does not exist.

`VITE_DISCORD_CLIENT_ID` (and optional `VITE_PRESENCE_LARGE_IMAGE`) are compiled into the client, so they must be present when `npm run build` runs. The client secret must not be. `DISCORD_CLIENT_SECRET` is read only by the server.

#### GitHub Pages (static, default presence only)

`.github/workflows/pages.yml` builds the game and publishes `dist/` on every push to `main`. Asset URLs are relative, so a project site at `https://<user>.github.io/<repo>/` works.

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or run the workflow manually) and wait for the deploy.
3. Add the Activity URL mapping in the Discord Developer Portal: prefix `/`, target `<user>.github.io/<repo>` — no protocol, and a directory path is supported. A user/root site is just `<user>.github.io`.
4. Enable Activities for the app, then launch it from the App Launcher.

The workflow sets `VITE_TOKEN_ENDPOINT: none`, so the client skips the OAuth prompt and the missing `/api/token` call. Players still get the Activity on their profile; they do not get the custom details, state or elapsed timer. To show those, deploy the Cloudflare Worker or a Node server instead.

#### Cloudflare Workers

`wrangler.jsonc` serves the built `dist/` as static assets from Cloudflare's CDN and runs `worker/index.mjs` for `/api/token`, the security headers and the SPA fallback.

```bash
npm install
npm run build          # VITE_DISCORD_CLIENT_ID must be in .env first
npx wrangler login
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npm run deploy:cf
```

Wrangler prints the deployed `https://<name>.<subdomain>.workers.dev` URL (or use a custom domain). Use that origin's hostname as the target in the Discord **Activities → URL Mappings** page. To test the Worker locally instead of the Node server:

```bash
cp .dev.vars.example .dev.vars   # add the same two values, this file is gitignored
npm run dev:cf                   # builds, then wrangler dev on http://localhost:8787
```

The 14 MB Ruffle WASM files are under Cloudflare's 25 MiB per-asset limit and are cached by the CDN like any other static file.

#### Node host

Run `npm run build`, then `npm start` with `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` set as server-side environment variables. Point the Activity URL mapping at that HTTPS origin.

## Rich Presence (the profile status)

When the Activity opens and the player accepts the authorization prompt, the client requests `identify` and `rpc.activities.write`, then calls `discordSdk.commands.setActivity()` with:

- type `0` — the profile header shows **Playing** + your app's name (set in the Developer Portal)
- details `Playing Commando 2`
- state `Flash classic, emulated with Ruffle`
- a start timestamp — Discord renders the elapsed play time

Discord also shows the app icon and an Activity entry on the player's profile by default just by being in the Activity. The custom lines above make it specific to the game. If the player declines the scope, the game still works and only the default Activity presence remains.

On a static deployment (GitHub Pages) the custom lines are not sent at all, because the token exchange has nowhere to run. The default Activity entry is still what friends see on the profile.

To show game art, upload an image under **Rich Presence → Art Assets** in the Developer Portal and set its asset key (or any public https image URL) in `.env`:

```
VITE_PRESENCE_LARGE_IMAGE=commando-2-cover
```

The image is used as `large_image` in `buildActivity()` in `src/discord.ts`.

## Controls and requirements

On desktop: WASD or arrow keys move, W/up jumps, S/down crouches, the mouse aims and shoots, and Q/E switch weapons. Click the player once to give it keyboard focus and to unmute audio.

On touch devices the Activity adds a virtual D-pad in the bottom-left and Q/E weapon buttons in the bottom-right. The pad supports diagonals, so holding up+right runs and jumps at once. Taps and drags on the game area itself are passed through to Ruffle as mouse aim and fire. Append `?touch=1` to the URL to preview the controls in a desktop browser.

Ruffle is installed from npm (`@ruffle-rs/ruffle`) and copied into `public/ruffle/` by `scripts/sync-ruffle.mjs` on `install`, `dev` and `build`. It is served from your own origin so the Activity does not depend on a CDN. To try newer Flash compatibility, install the nightly build:

```bash
npm install --save-dev @ruffle-rs/ruffle@nightly
```

## Troubleshooting

- **`/api/token` returns 503** — `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` are missing from `.env` (restart the dev server after editing it).
- **Blank or black game area** — the Ruffle WASM files must be served with the `application/wasm` MIME type. Both the Vite dev server and the Express server do this; a custom proxy in front of the app may not.
- **No audio** — browsers require a click before audio. Click the game once; Ruffle's unmute overlay also works.
- **Activity does not launch** — Activities need an HTTPS public origin, an enabled Activity, and a URL mapping. `http://localhost` cannot be embedded by Discord.
- **Presence shows only the app icon** — the player likely declined `rpc.activities.write`, or the build has `VITE_TOKEN_ENDPOINT=none` (expected on GitHub Pages). Check the scope list in `authorize()` and relaunch to re-prompt, or deploy the Worker/Node server for custom lines.
- **Game runs slowly** — Ruffle emulates Flash in WebAssembly. Closing other Activities/streams and using the desktop client helps.

## Credits and rights

Commando 2 is a Miniclip game; the SWF in this repository is their content, and Ruffle is an independent open-source Flash emulator. Make sure you have permission to redistribute and run the game publicly before deploying it.
