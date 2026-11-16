export {};

declare global {
  interface RuffleLoadOptions {
    url: string;
    publicPath?: string;
    base?: string | null;
    allowScriptAccess?: boolean;
  }

  interface RuffleInstance {
    load(source: string | RuffleLoadOptions): Promise<unknown>;
  }

  interface RufflePlayerElement extends HTMLElement {
    ruffle(): RuffleInstance;
  }

  interface RuffleApi {
    newest(): { createPlayer(): RufflePlayerElement };
  }

  interface RufflePlayerGlobal {
    config?: Record<string, unknown>;
    newest?: RuffleApi['newest'];
  }

  interface Window {
    RufflePlayer?: RufflePlayerGlobal;
  }
}
