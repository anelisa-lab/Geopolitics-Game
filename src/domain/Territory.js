import { GameRuleError } from './errors.js';

function assertCount(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new GameRuleError('Soldier numbers must be whole numbers of 0 or more.');
  }
}

export class Territory {
  #iso2;
  #name;
  #soldierValue;
  #ownerPlayerId;
  #soldiers;

  constructor({ iso2, name, soldierValue, ownerPlayerId, soldiers }) {
    this.#iso2 = iso2;
    this.#name = name;
    this.#soldierValue = soldierValue;
    this.#ownerPlayerId = ownerPlayerId;
    this.#soldiers = soldiers;
  }

  get iso2() { return this.#iso2; }
  get name() { return this.#name; }
  get soldierValue() { return this.#soldierValue; }
  get ownerPlayerId() { return this.#ownerPlayerId; }
  get soldiers() { return this.#soldiers; }

  isOwnedBy(playerId) {
    return this.#ownerPlayerId === playerId;
  }

  canAttack() {
    return this.#soldiers >= 2;
  }

  // A country must always keep at least 1 soldier when moving or attacking
  movableSoldiers() {
    return Math.max(0, this.#soldiers - 1);
  }

  addSoldiers(count) {
    assertCount(count);
    this.#soldiers += count;
  }

  removeSoldiers(count) {
    assertCount(count);
    if (count > this.#soldiers) throw new GameRuleError(`${this.#name} doesn't have that many soldiers.`);
    this.#soldiers -= count;
  }

  conquer(newOwnerPlayerId, soldiers) {
    this.#ownerPlayerId = newOwnerPlayerId;
    this.#soldiers = soldiers;
  }

  // Plain object for saving to MongoDB
  toDocument() {
    return {
      iso2: this.#iso2,
      name: this.#name,
      soldierValue: this.#soldierValue,
      ownerPlayerId: this.#ownerPlayerId,
      soldiers: this.#soldiers,
    };
  }
}
