const RUFFLE_BASE = new URL('ruffle/', document.baseURI).href;
const SWF_URL = new URL('games/commando-2.swf', document.baseURI).href;

const RUFFLE_CONFIG = {
  publicPath: RUFFLE_BASE,
  letterbox: 'on',
  scale: 'showAll',
  quality: 'high',
  warnOnUnsupportedContent: false,
  logLevel: 'error',
};

let ruffleApi: Promise<RuffleApi> | null = null;

function loadRuffle(): Promise<RuffleApi> {
  if (ruffleApi) return ruffleApi;

  ruffleApi = new Promise<RuffleApi>((resolve, reject) => {
    // Ruffle reads this when the player is created, so it must exist before ruffle.js.
    window.RufflePlayer = { ...window.RufflePlayer, config: RUFFLE_CONFIG };

    const script = document.createElement('script');
    script.src = `${RUFFLE_BASE}ruffle.js`;
    script.async = true;
    script.onload = () => {
      if (!window.RufflePlayer?.newest) {
        reject(new Error('Ruffle loaded but did not expose a player API.'));
        return;
      }
      resolve(window.RufflePlayer as RuffleApi);
    };
    script.onerror = () => reject(new Error('Could not load the Ruffle runtime.'));
    document.head.appendChild(script);
  });

  return ruffleApi;
}

/**
 * Mounts Ruffle and starts the bundled SWF. Resolves once the movie's metadata is
 * available, which is when the loader can be dismissed.
 */
export async function mountGame(stage: HTMLElement): Promise<RufflePlayerElement> {
  const api = await loadRuffle();
  const player = api.newest().createPlayer();
  player.classList.add('game-player');
  stage.appendChild(player);

  await player.ruffle().load({
    url: SWF_URL,
    publicPath: RUFFLE_BASE,
    // The original game was built for Flash Player in a browser; don't grant it
    // JavaScript bridge access to the Activity page.
    allowScriptAccess: false,
  });

  return player;
}
