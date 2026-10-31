import { randomInt } from 'node:crypto';

export class Dice {
  #roll;

  // Real games use secure random numbers. Tests can pass in fixed values instead
  constructor(roll = () => randomInt(1, 7)) {
    this.#roll = roll;
  }

  rollMany(count) {
    return Array.from({ length: count }, () => this.#roll());
  }
}
