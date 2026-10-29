import mongoose from 'mongoose';

const countrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    iso2: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z]{2}$/ },
    population: { type: Number, required: true, min: 0 },
    soldierValue: { type: Number, required: true, min: 1, max: 9 },
  },
  { timestamps: true }
);

export const Country = mongoose.model('Country', countrySchema);