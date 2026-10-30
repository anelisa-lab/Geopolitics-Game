import { Game } from '../models/Game.js';

const SORTS = {
  newest: { updatedAt: -1 },
  oldest: { updatedAt: 1 },
  rounds: { round: -1 },
};

// Treat search text as plain text, so symbols like "(" or "*" can't break the query
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class GameRepository {
  async create(data) {
    return Game.create(data);
  }

  // Returns a full Mongoose document so it can be changed and saved
  async findById(id) {
    return Game.findById(id);
  }

  async save(game) {
    return game.save();
  }

  async findForOwner(ownerId, options) {
    return this.#search({ ownerId }, options);
  }

  async findPublic(options) {
    return this.#search({ isPublic: true }, options);
  }

  async #search(baseFilter, { search = '', status, sort = 'newest', page = 1, pageSize = 10 } = {}) {
    const filter = { ...baseFilter };
    if (status) filter.status = status;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ title: pattern }, { 'territories.name': pattern }];
    }

    const [items, total] = await Promise.all([
      Game.find(filter)
        .sort(SORTS[sort] || SORTS.newest)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Game.countDocuments(filter),
    ]);

    return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}

export const gameRepository = new GameRepository();