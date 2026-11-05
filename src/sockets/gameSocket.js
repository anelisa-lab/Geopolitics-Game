// Live spectating (bonus feature): everyone with a game open is told the moment
// a move is saved, and can see how many people are watching.
//
// Sockets here are read-only. The only thing a browser can say is "I'm watching
// this game". Every move still goes through the logged-in, checked API routes.

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const roomFor = (gameId) => `game:${gameId}`;

let io = null;

export function setupGameSockets(server) {
  io = server;

  io.on('connection', (socket) => {
    socket.on('watch', (gameId) => {
      if (typeof gameId !== 'string' || !OBJECT_ID.test(gameId)) return; // ignore anything odd

      // One game per browser tab: leave any game this tab was watching before
      for (const room of [...socket.rooms]) {
        if (room.startsWith('game:')) socket.leave(room);
      }
      socket.join(roomFor(gameId));
      sendViewerCount(gameId);
    });

    // When a tab closes, tell the others in its game that there's one viewer fewer
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('game:')) setImmediate(() => sendViewerCount(room.slice('game:'.length)));
      }
    });
  });
}

function sendViewerCount(gameId) {
  const viewers = io.sockets.adapter.rooms.get(roomFor(gameId))?.size ?? 0;
  io.to(roomFor(gameId)).emit('viewers', viewers);
}

// Called after every saved move. Browsers then fetch the new moves through the normal API,
// so each person still only gets what they're allowed to see
export function notifyGameUpdated(gameId, lastSeq) {
  io?.to(roomFor(gameId)).emit('game:updated', { lastSeq });
}