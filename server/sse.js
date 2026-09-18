/**
 * Hub de Server-Sent Events.
 *
 * Um Set de respostas HTTP abertas. Cada evento vira uma linha `event:` + `data:`
 * enviada para todo mundo. O heartbeat (comentario `:hb`) existe porque proxy e
 * antivirus costumam derrubar conexoes ociosas depois de ~30-60s.
 */

const HEARTBEAT_MS = 25_000;

export function createHub() {
  /** @type {Set<import('http').ServerResponse>} */
  const clients = new Set();

  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': hb\n\n');
      } catch {
        clients.delete(res);
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  function send(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      clients.delete(res);
      return false;
    }
  }

  /** Registra uma resposta como cliente SSE e devolve a funcao de limpeza. */
  function add(req, res, initial) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: nao bufferizar
    });
    res.write('retry: 2000\n\n'); // navegador tenta reconectar a cada 2s
    clients.add(res);

    if (initial) send(res, initial.event, initial.data);

    const drop = () => {
      clients.delete(res);
      try {
        res.end();
      } catch {
        /* ja fechado */
      }
    };
    req.on('close', drop);
    req.on('error', drop);
    return drop;
  }

  function broadcast(event, data) {
    for (const res of clients) send(res, event, data);
  }

  function close() {
    clearInterval(heartbeat);
    for (const res of clients) {
      try {
        res.end();
      } catch {
        /* ja fechado */
      }
    }
    clients.clear();
  }

  return { add, broadcast, close, get size() { return clients.size; } };
}
