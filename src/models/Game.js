import mongoose from 'mongoose';

export const PHASES = ['REINFORCE', 'PLANNING', 'ATTACKING', 'CONQUEST_MOVE', 'GAME_OVER'];
const exactlyTen = (list) => list.length === 10;

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    type: { type: String, enum: ['human', 'npc'], required: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
    eliminated: { type: Boolean, default: false },
  },
  { _id: false }
);

const territorySchema = new mongoose.Schema(
  {
    iso2: { type: String, required: true, match: /^[A-Z]{2}$/ },
    name: { type: String, required: true },
    soldierValue: { type: Number, required: true, min: 1, max: 9 },
    ownerPlayerId: { type: String, required: true },
    soldiers: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const activeAttackSchema = new mongoose.Schema(
  {
    fromIso2: { type: String, required: true },
    toIso2: { type: String, required: true },
    rolls: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const gameSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 60, default: '' },
    status: { type: String, enum: ['active', 'won', 'lost'], default: 'active' },
    round: { type: Number, default: 1, min: 1 },
    phase: { type: String, enum: PHASES, default: 'PLANNING' },
    turnOrder: { type: [String], required: true },
    currentTurnIndex: { type: Number, default: 0, min: 0 },
    players: { type: [playerSchema], validate: [exactlyTen, 'A game needs exactly 10 players'] },
    territories: { type: [territorySchema], validate: [exactlyTen, 'A game needs exactly 10 countries'] },
    activeAttack: { type: activeAttackSchema, default: null },
    pendingReinforcements: { type: Number, default: 0, min: 0 },
    attackUsed: { type: Boolean, default: false },
    winnerPlayerId: { type: String, default: null },
    eventSeq: { type: Number, default: 0, min: 0 },
    isPublic: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    // Stops two requests sent at the same moment (e.g. a double-click) both changing the game
    optimisticConcurrency: true,
  }
);

gameSchema.index({ ownerId: 1, updatedAt: -1 }); // "My games", newest first
gameSchema.index({ status: 1, updatedAt: -1 });  // "Browse games" filtered by status

export const Game = mongoose.model('Game', gameSchema);