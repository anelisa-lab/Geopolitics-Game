export class Player {
  #playerId;
  #name;
  #color;
  #eliminated;

  constructor({ playerId, name, color, eliminated = false }) {
    this.#playerId = playerId;
    this.#name = name;
    this.#color = color;
    this.#eliminated = eliminated;
  }

  get playerId() { return this.#playerId; }
  get name() { return this.#name; }
  get color() { return this.#color; }
  get eliminated() { return this.#eliminated; }

  // Each kind of player answers these differently (polymorphism)
  get type() { throw new Error('Subclasses must define type'); }
  get isNpc() { return false; }
  get displayName() { return this.#name; }

  eliminate() {
    this.#eliminated = true;
  }

  toDocument() {
    return {
      playerId: this.#playerId,
      type: this.type,
      name: this.#name,
      color: this.#color,
      eliminated: this.#eliminated,
    };
  }
}

export class HumanPlayer extends Player {
  get type() { return 'human'; }
  get displayName() { return `${this.name} (you)`; }
}

export class NpcPlayer extends Player {
  get type() { return 'npc'; }
  get isNpc() { return true; }
}

// Turns a saved document back into the right kind of player
export function playerFromDocument(doc) {
  return doc.type === 'human' ? new HumanPlayer(doc) : new NpcPlayer(doc);
}
