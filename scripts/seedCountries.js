import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import isoCountries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json' with { type: 'json' };
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { soldierValueFor } from '../src/domain/rules.js';
import { countryRepository } from '../src/repositories/CountryRepository.js';

isoCountries.registerLocale(en);

// Worldometers names the ISO library doesn't recognise. Add more here if the script lists any.
const ISO_OVERRIDES = {
  'DR Congo': 'CD',
  'Congo': 'CG',
  "Côte d'Ivoire": 'CI',
  'Czech Republic (Czechia)': 'CZ',
  'State of Palestine': 'PS',
  'Micronesia': 'FM',
  'Kosovo': 'XK',
  'Caribbean Netherlands': 'BQ',
  'Saint Martin': 'MF',
  'Sint Maarten': 'SX',
  'Turks and Caicos': 'TC',
  'St. Vincent & Grenadines': 'VC',
  'Saint Kitts & Nevis': 'KN',
  'Sao Tome & Principe': 'ST',
  'Wallis & Futuna': 'WF',
  'Saint Pierre & Miquelon': 'PM',
  'Holy See': 'VA',
     'Syria': 'SY',
  'Laos': 'LA',
  'Moldova': 'MD',
  'Réunion': 'RE',
  'Cabo Verde': 'CV',
  'Brunei': 'BN',
  'U.S. Virgin Islands': 'VI',
  'Faeroe Islands': 'FO',
  'British Virgin Islands': 'VG',
  'Saint Barthelemy': 'BL',
  'Falkland Islands': 'FK',
};

const csvPath = path.join(import.meta.dirname, '..', 'data', 'countries.csv');
const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true });

if (!rows.length || !('name' in rows[0]) || !('population' in rows[0])) {
  console.error('countries.csv must have the headers: name,population');
  process.exit(1);
}

const records = [];
const unmatched = [];

for (const row of rows) {
  const name = row.name;
  const population = Number(String(row.population).replace(/[^\d]/g, ''));
  const iso2 = ISO_OVERRIDES[name] || isoCountries.getAlpha2Code(name, 'en');

  if (!iso2 || !population) {
    unmatched.push(name);
    continue;
  }
  records.push({ name, iso2, population, soldierValue: soldierValueFor(population) });
}

await connectDB(env.mongoUri);
await countryRepository.upsertMany(records);
console.log(`Saved ${records.length} countries.`);

if (unmatched.length) {
  console.warn(`Skipped (no ISO code found): ${unmatched.join(', ')}`);
  console.warn('Add them to ISO_OVERRIDES with their 2-letter code and run the script again.');
}

await disconnectDB();