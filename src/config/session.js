import session from 'express-session';
import MongoStore from 'connect-mongo';
import { env } from './env.js';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionMiddleware = session({
  name: 'sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: env.mongoUri,
    collectionName: 'sessions',
    ttl: ONE_WEEK_MS / 1000,
  }),
  cookie: {
    httpOnly: true,           // page scripts can't read the cookie
    sameSite: 'lax',          // other websites can't submit forms as you
    secure: env.isProduction, // HTTPS only on the live site
    maxAge: ONE_WEEK_MS,
  },
});