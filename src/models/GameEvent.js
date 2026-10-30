import mongoose from 'mongoose';

export const EVENT_TYPES = [
  'GAME_CREATED', 'TURN_START', 'REINFORCEMENTS_GRANTED', 'REINFORCE', 'TRANSFER',
  'NPC_DECISION', 'ATTACK_START', 'DICE_ROLL', 'ATTACK_STOPPED', 'ATTACK_FAILED',
  'CONQUEST', 'CONQUEST_MOVE', 'ELIMINATION', 'TURN_END', 'GAME_WON', 'GAME_LOST',
];

const gameEventSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    seq: { type: Number, required: true, min: 1 },   // 1, 2, 3... order within the game
    round: { type: Number, required: true, min: 1 },
    playerId: { type: String, default: null },
    type: { type: String, enum: EVENT_TYPES, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }, // details, e.g. the dice values
    commentary: { type: String, default: null },     // AI battle commentary
    justification: { type: String, default: null },  // why an NPC made its move
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Fast "give me this game's events after #42", and no duplicate numbers
gameEventSchema.index({ gameId: 1, seq: 1 }, { unique: true });

export const GameEvent = mongoose.model('GameEvent', gameEventSchema);