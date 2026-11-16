import { DiscordSDK } from '@discord/embedded-app-sdk';

export type DiscordUser = {
  id: string;
  name: string;
  /** Initial used for the local avatar badge (no external image requests inside Discord). */
  initial: string;
};

export type DiscordSession = {
  user: DiscordUser;
  /** True when custom Rich Presence was accepted by the Discord client. */
  presence: boolean;
  startedAt: number;
};

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;

// Custom Rich Presence needs an OAuth code exchange, which requires a server.
// Static hosts (e.g. GitHub Pages) set this to "none": Discord still shows the
// Activity on the player's profile by default, but the custom details/state and
// elapsed timer cannot be set without the token exchange.
const TOKEN_ENDPOINT = ((import.meta.env.VITE_TOKEN_ENDPOINT as string | undefined) ?? '/api/token').trim();
const CUSTOM_PRESENCE_ENABLED = TOKEN_ENDPOINT !== '' && TOKEN_ENDPOINT.toLowerCase() !== 'none';

/**
 * Discord launches Activities in an iframe and appends frame_id/instance_id to the
 * URL. A plain browser tab never has them, which lets the page stay playable
 * outside Discord.
 */
export function isEmbeddedInDiscord(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('frame_id') || params.has('instance_id');
}

/**
 * Runs the Activity handshake: wait for Discord, authorize with the scopes we need,
 * exchange the one-time code for an access token on our server, authenticate, then
 * publish Rich Presence so the player's Discord profile shows what they're playing.
 */
export async function connectDiscord(): Promise<DiscordSession | null> {
  if (!isEmbeddedInDiscord()) return null;
  if (!CUSTOM_PRESENCE_ENABLED) return null;
  if (!CLIENT_ID) {
    throw new Error('VITE_DISCORD_CLIENT_ID is not set, so Discord cannot authorize this Activity.');
  }

  const sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'rpc.activities.write'],
  });

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!tokenResponse.ok) {
    if (tokenResponse.status === 503) {
      throw new Error('Discord is not configured on the server (missing client ID or secret).');
    }
    throw new Error(`Discord token exchange failed (HTTP ${tokenResponse.status}).`);
  }

  const tokenBody = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenBody.access_token) {
    throw new Error('Discord token exchange returned no access token.');
  }

  const auth = await sdk.commands.authenticate({ access_token: tokenBody.access_token });
  const startedAt = Math.floor(Date.now() / 1000);
  const displayName = auth.user.global_name?.trim() || auth.user.username;

  let presence = false;
  try {
    await sdk.commands.setActivity({ activity: buildActivity(startedAt) });
    presence = true;
  } catch (error) {
    // Presence needs rpc.activities.write; if the user declines it the game still works.
    console.warn('[discord] Rich Presence was not accepted by Discord.', error);
  }

  return {
    user: {
      id: auth.user.id,
      name: displayName,
      initial: (displayName.trim()[0] ?? '?').toUpperCase(),
    },
    presence,
    startedAt,
  };
}

function buildActivity(startedAt: number) {
  const largeImage = import.meta.env.VITE_PRESENCE_LARGE_IMAGE as string | undefined;

  return {
    // 0 = "Playing", so the profile header reads "Playing <app name>".
    type: 0,
    details: 'Playing Commando 2',
    state: 'Flash classic, emulated with Ruffle',
    timestamps: { start: startedAt },
    ...(largeImage
      ? { assets: { large_image: largeImage, large_text: 'Commando 2' } }
      : {}),
  };
}
