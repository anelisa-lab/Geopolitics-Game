import { countryRepository } from '../repositories/CountryRepository.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { gameEventRepository } from '../repositories/GameEventRepository.js';
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

  constructor({ countries = countryRepository, games = gameRepository, events = gameEventRepository } = {}) {
    this.#countries = countries;
    this.#games = games;
    this.#events = events;
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

    // Day 5: if an NPC goes first, NpcTurnRunner will play until it's the human's turn
    return game;
  }
}

export const gameService = new GameService();