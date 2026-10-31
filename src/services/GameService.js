import { countryRepository } from '../repositories/CountryRepository.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { gameEventRepository } from '../repositories/GameEventRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { buildGameSummary } from './gameView.js';
import { npcTurnRunner } from './NpcTurnRunner.js';
import { Game } from '../domain/Game.js';
import { BattleEngine } from '../domain/BattleEngine.js';
import { shuffle } from '../domain/random.js';
import { ValidationError } from '../domain/errors.js';

export const RIVAL_COUNT = 9;
const PLAYER_COLORS = [
  '#2f6be0', '#d23f3f', '#1b9157', '#d4a00a', '#7a4bd6',
  '#dc6f17', '#1aa3b8', '#c2408f', '#6b7a2a', '#5a6575',
];

export class GameService {
  #countries;
  #games;
  #events;
  #users;
  #engine;
  #npcs;

  constructor({
    countries = countryRepository,
    games = gameRepository,
    events = gameEventRepository,
    users = userRepository,
    engine = new BattleEngine(),
    npcs = npcTurnRunner,
  } = {}) {
    this.#countries = countries;
    this.#games = games;
    this.#events = events;
    this.#users = users;
    this.#engine = engine;
    this.#npcs = npcs;
  }

  async listCountries() {
    return this.#countries.findAll();
  }

  async createGame(ownerId, { iso2, title }) {
    const allCountries = await this.#countries.findAll();
    const chosen = allCountries.find((country) => country.iso2 === iso2);
    if (!chosen) throw new ValidationError('Pick a country from the list.');

    // The player's country first, then 9 random rivals
    const rivals = shuffle(allCountries.filter((country) => country.iso2 !== iso2)).slice(0, RIVAL_COUNT);
    const lineup = [chosen, ...rivals];

    const players = lineup.map((country, index) => ({
      playerId: country.iso2,
      type: index === 0 ? 'human' : 'npc',
      name: index === 0 ? country.name : `NPC ${country.name}`,
      color: PLAYER_COLORS[index],
    }));

    // Every country starts with its full soldier value
    const territories = lineup.map((country) => ({
      iso2: country.iso2,
      name: country.name,
      soldierValue: country.soldierValue,
      ownerPlayerId: country.iso2,
      soldiers: country.soldierValue,
    }));

    const game = await this.#games.create({
      ownerId,
      title: title || `${chosen.name} vs the world`,
      players,
      territories,
      status: 'active',
      turnOrder: shuffle(players.map((player) => player.playerId)), // random first player
      currentTurnIndex: 0,
      round: 1,
      phase: 'PLANNING', // no reinforcements in round 1
      eventSeq: 1,
    });

    await this.#events.append(game._id, [{
      seq: 1,
      round: 1,
      playerId: null,
      type: 'GAME_CREATED',
      payload: { humanCountry: chosen.name, turnOrder: game.turnOrder },
    }]);

    // If an NPC goes first, the NPCs play until it's the human's turn
    await this.#play(game, null);
    return game;
  }

  // ---------- The human's moves. Each returns the events it caused ----------

  reinforce(gameDoc, allocations) {
    return this.#play(gameDoc, (game, me) => game.reinforce(me, allocations));
  }

  transfer(gameDoc, { from, to, count }) {
    return this.#play(gameDoc, (game, me) => game.transfer(me, from, to, count));
  }

  startAttack(gameDoc, { from, to }) {
    return this.#play(gameDoc, (game, me) => game.startAttack(me, from, to));
  }

  rollAttack(gameDoc) {
    return this.#play(gameDoc, (game, me) => game.rollAttack(me));
  }

  stopAttack(gameDoc) {
    return this.#play(gameDoc, (game, me) => game.stopAttack(me));
  }

  conquestMove(gameDoc, { count }) {
    return this.#play(gameDoc, (game, me) => game.conquestMove(me, count));
  }

  endTurn(gameDoc) {
    return this.#play(gameDoc, (game, me) => game.endTurn(me));
  }

  async listEvents(gameId, afterSeq) {
    return this.#events.listAfter(gameId, afterSeq);
  }

  // ---------- Lists ----------

  async listMyGames(userId, query) {
    const result = await this.#games.findForOwner(userId, { search: query.q, ...query });
    return { ...result, items: result.items.map((game) => buildGameSummary(game, userId)) };
  }

  async listPublicGames(viewerId, query) {
    const result = await this.#games.findPublic({ search: query.q, ...query });
    const ownerIds = [...new Set(result.items.map((game) => game.ownerId.toString()))];
    const usernames = await this.#users.findUsernamesByIds(ownerIds);

    return {
      ...result,
      items: result.items.map((game) =>
        buildGameSummary(game, viewerId, usernames.get(game.ownerId.toString()) ?? 'Unknown player')),
    };
  }

  // Load the saved game into the engine, make the move, let any NPCs play,
  // then save the new board and its events. If a rule is broken, the engine
  // throws before anything is saved.
  async #play(gameDoc, action) {
    const game = Game.fromDocument(gameDoc, this.#engine);
    const humanId = gameDoc.players.find((player) => player.type === 'human').playerId;

    if (action) action(game, humanId);
    this.#npcs.runUntilHumanTurn(game);

    const events = game.pullNewEvents();
    if (!events.length) return [];

    gameDoc.set(game.toDocument());
    await this.#games.save(gameDoc);
    await this.#events.append(gameDoc._id, events);
    return events;
  }
}

export const gameService = new GameService();
