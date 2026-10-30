import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, required: true, unique: true, trim: true,
      minlength: 3, maxlength: 20, match: /^[a-zA-Z0-9_]+$/,
    },
    email: {
      type: String, required: true, unique: true, trim: true, lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true },
    stats: {
      gamesPlayed: { type: Number, default: 0, min: 0 },
      wins: { type: Number, default: 0, min: 0 },
      losses: { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Never send the password hash to the browser
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const User = mongoose.model('User', userSchema);