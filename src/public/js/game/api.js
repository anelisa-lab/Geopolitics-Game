// Talks to the game's API. Every move returns the new board and the events it caused
export function createApi(gameId) {
  const base = `/api/games/${gameId}`;

  async function request(path, body) {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      // not JSON: keep the generic message below
    }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  return {
    state: () => request('/state'),
    events: (after) => request(`/events?after=${after}`),
    reinforce: (allocations) => request('/reinforce', { allocations }),
    transfer: (from, to, count) => request('/transfer', { from, to, count }),
    attack: (from, to) => request('/attack', { from, to }),
    roll: () => request('/attack/roll', {}),
    stop: () => request('/attack/stop', {}),
    conquestMove: (count) => request('/conquest-move', { count }),
    endTurn: () => request('/end-turn', {}),
  };
}
