import { GameEvent } from '../models/GameEvent.js';

export class GameEventRepository {
  async append(gameId, events) {
    if (!events.length) return [];
    return GameEvent.insertMany(events.map((event) => ({ ...event, gameId })));
  }

  // Events after a given number, in order. The game page uses this to catch up
  async listAfter(gameId, afterSeq = 0, limit = 500) {
    return GameEvent.find({ gameId, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .limit(limit)
      .lean();
  }
}

export const gameEventRepository = new GameEventRepository();