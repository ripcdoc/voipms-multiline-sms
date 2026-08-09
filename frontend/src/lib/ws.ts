export interface WsEvent<T = unknown> {
  event: string;
  payload: T;
}

export function connectWs(onMessage: (event: WsEvent) => void): () => void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.onmessage = (raw) => {
    try {
      onMessage(JSON.parse(raw.data));
    } catch {
      // ignore malformed frames
    }
  };

  return () => socket.close();
}
