import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/UserRepository.js';
import { ValidationError } from '../domain/errors.js';

const SALT_ROUNDS = 12;

export class AuthService {
  #users;

  constructor(users = userRepository) {
    this.#users = users;
  }

  async signup({ username, email, password }) {
    if (await this.#users.findByUsername(username)) {
      throw new ValidationError('That username is taken. Try another one.');
    }
    if (await this.#users.findByEmail(email)) {
      throw new ValidationError('An account with that email already exists. Try logging in.');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    try {
      const user = await this.#users.create({ username, email, passwordHash });
      return { id: user._id.toString(), username: user.username };
    } catch (err) {
      // Two sign-ups with the same name at the same moment: the unique index catches it
      if (err.code === 11000) throw new ValidationError('That username or email is already in use.');
      throw err;
    }
  }

  async login({ username, password }) {
    const user = await this.#users.findByUsername(username);
    const passwordMatches = user && (await bcrypt.compare(password, user.passwordHash));

    // The same message either way, so attackers can't find out which usernames exist
    if (!passwordMatches) throw new ValidationError('Invalid username or password.');

    return { id: user._id.toString(), username: user.username };
  }
}

export const authService = new AuthService();