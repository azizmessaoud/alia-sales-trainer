declare module '@met4citizen/talkinghead' {
  export class TalkingHead {
    constructor(container: HTMLElement, options?: Record<string, unknown>);
    showAvatar(config: { url: string }, onReady?: () => void): void;
    speakAudio(url: string, options?: Record<string, unknown>): Promise<void>;
    stopSpeaking?(): void;
  }
}
