import { User } from '../models/User.js';

export class UserRepository {
  async create({ username, email, passwordHash }) {
    return User.create({ username, email, passwordHash });
  }

  // Includes the password hash: only the login code uses this
  async findByUsername(username) {
    return User.findOne({ username }).lean();
  }

  async findByEmail(email) {
    return User.findOne({ email: email.toLowerCase() }).lean();
  }

  // Safe to show on pages: no password hash
  async findById(id) {
    return User.findById(id).select('-passwordHash').lean();
  }
    // Returns a Map of userId → username for many users in one query
  async findUsernamesByIds(ids) {
    const users = await User.find({ _id: { $in: ids } }).select('username').lean();
    return new Map(users.map((user) => [user._id.toString(), user.username]));
  }
}

export const userRepository = new UserRepository();