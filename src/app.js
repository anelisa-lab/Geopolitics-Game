import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import expressLayouts from 'express-ejs-layouts';
import { isDbConnected } from './config/db.js';
import { sessionMiddleware } from './config/session.js';
import authRoutes from './routes/authRoutes.js';
import pageRoutes from './routes/pageRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Render sits in front of the app as a proxy; this makes secure cookies work there
app.set('trust proxy', 1);

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'https://flagcdn.com'],
    },
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(sessionMiddleware);

// Make the logged-in user and the current page available to every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path; // lets the navbar highlight the page you're on
  next();
});

// Routes
app.get('/', (req, res) => {
  res.render('home', { title: 'Home' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: isDbConnected() ? 'up' : 'down' });
});

app.use(authRoutes);
app.use(pageRoutes);
app.use(gameRoutes);
app.use('/api', apiRoutes);

// Error handling (must stay at the bottom)
app.use(notFound);
app.use(errorHandler);

export default app;
