import './style.css';
import { connectDiscord, isEmbeddedInDiscord } from './discord';
import type { DiscordSession } from './discord';
import { mountGame } from './game';
import { mountTouchControls } from './touch-controls';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const stage = requireElement<HTMLElement>('#stage');
const loader = document.querySelector<HTMLElement>('#loader');
const loaderStatus = document.querySelector<HTMLElement>('#loader-status');
const discordCard = document.querySelector<HTMLElement>('#discord-card');
const previewNote = document.querySelector<HTMLElement>('#preview-note');
const fatal = document.querySelector<HTMLElement>('#fatal');
const fatalMessage = document.querySelector<HTMLElement>('#fatal-message');
const fatalRetry = document.querySelector<HTMLButtonElement>('#fatal-retry');

function setLoaderStatus(text: string): void {
  if (loaderStatus) loaderStatus.textContent = text;
}

function hideLoader(): void {
  loader?.classList.add('is-hidden');
}

function showFatal(message: string): void {
  hideLoader();
  if (!fatal || !fatalMessage) return;
  fatalMessage.textContent = message;
  fatal.hidden = false;
  fatalRetry?.focus();
}

function renderDiscordCard(session: DiscordSession): void {
  if (!discordCard) return;

  const avatar = document.createElement('span');
  avatar.className = 'discord-card__avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = session.user.initial;

  const text = document.createElement('span');
  text.className = 'discord-card__text';

  const name = document.createElement('span');
  name.className = 'discord-card__name';
  name.textContent = session.user.name;

  const status = document.createElement('span');
  status.className = 'discord-card__status';
  status.textContent = session.presence ? 'Status shared on Discord' : 'Signed in to Discord';

  text.append(name, status);
  discordCard.replaceChildren(avatar, text);
  discordCard.hidden = false;
}

function showPreviewNote(): void {
  if (!previewNote) return;
  previewNote.hidden = false;
  window.setTimeout(() => previewNote.classList.add('is-fading'), 9000);
}

async function boot(): Promise<void> {
  if (!isEmbeddedInDiscord()) showPreviewNote();

  const game = mountGame(stage).then((player) => {
    mountTouchControls(player);
    setLoaderStatus('Ready');
    window.setTimeout(hideLoader, 250);
  });

  // Discord auth runs alongside the game so a slow or unavailable client never
  // blocks gameplay.
  const discord = connectDiscord()
    .then((session) => {
      if (session) renderDiscordCard(session);
    })
    .catch((error: unknown) => {
      console.warn('[discord] Activity setup failed; the game remains playable.', error);
    });

  const [gameResult] = await Promise.allSettled([game, discord]);

  if (gameResult.status === 'rejected') {
    const reason = gameResult.reason;
    showFatal(reason instanceof Error ? reason.message : 'Ruffle could not load the game.');
  }
}

fatalRetry?.addEventListener('click', () => window.location.reload());

void boot();
