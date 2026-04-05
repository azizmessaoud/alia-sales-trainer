declare module '@met4citizen/talkinghead' {
  export interface TalkingHeadAudioPayload {
    audio?: unknown;
    words?: string[];
    wtimes?: number[];
    wdurations?: number[];
    visemes?: string[];
    vtimes?: number[];
    vdurations?: number[];
  }

  export class TalkingHead {
    constructor(container: HTMLElement, options?: Record<string, unknown>);
    showAvatar(config: { url: string }, onReady?: () => void): void | Promise<void>;
    speakAudio(audio: string | TalkingHeadAudioPayload, options?: Record<string, unknown>): void | Promise<void>;
    stop?(): void;
    stopSpeaking?(): void;
  }
}

declare module '@met4citizen/talkinghead/modules/talkinghead.mjs' {
  export interface TalkingHeadAudioPayload {
    audio?: unknown;
    words?: string[];
    wtimes?: number[];
    wdurations?: number[];
    visemes?: string[];
    vtimes?: number[];
    vdurations?: number[];
  }

  export class TalkingHead {
    constructor(container: HTMLElement, options?: Record<string, unknown>);
    showAvatar(config: { url: string }, onReady?: () => void): void | Promise<void>;
    speakAudio(audio: string | TalkingHeadAudioPayload, options?: Record<string, unknown>): void | Promise<void>;
    stop?(): void;
    stopSpeaking?(): void;
  }
}
