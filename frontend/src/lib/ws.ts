import type { ClientMessage, ServerMessage } from '@sealed-deck/mental-poker';
import { wsUrl } from '../config';

/** Thin reconnecting WebSocket client speaking the typed Sealed Deck protocol. */
export class GameSocket {
  private ws: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private closed = false;

  constructor(
    private tableId: string,
    private address: string,
    private onMessage: (msg: ServerMessage) => void,
    private onStatus?: (s: 'connecting' | 'open' | 'closed') => void,
  ) {}

  connect(): void {
    this.onStatus?.('connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.onStatus?.('open');
      this.send({ t: 'hello', tableId: this.tableId, address: this.address });
      for (const m of this.queue) ws.send(JSON.stringify(m));
      this.queue = [];
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data) as ServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      this.onStatus?.('closed');
      if (!this.closed) setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
