import { Country } from '../models/Country.js';

export class CountryRepository {
  async upsertMany(countries) {
    const operations = countries.map((country) => ({
      updateOne: { filter: { iso2: country.iso2 }, update: { $set: country }, upsert: true },
    }));
    return Country.bulkWrite(operations);
  }

  async findAll() {
    return Country.find().sort({ name: 1 }).lean();
  }

  async findByIso2(iso2) {
    return Country.findOne({ iso2 }).lean();
  }
}

export const countryRepository = new CountryRepository();