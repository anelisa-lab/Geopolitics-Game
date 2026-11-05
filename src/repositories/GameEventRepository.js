import { GameEvent } from '../models/GameEvent.js';

export class GameEventRepository {
  async append(gameId, events) {
    if (!events.length) return [];
    return GameEvent.insertMany(events.map((event) => ({ ...event, gameId })));
  }
  // One player's events of the given types, for their game summary
  async findForPlayer(gameId, playerId, types) {
    return GameEvent.find({ gameId, playerId, type: { $in: types } }).select('type payload').lean();
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