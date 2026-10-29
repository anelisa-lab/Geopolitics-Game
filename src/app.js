import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import expressLayouts from 'express-ejs-layouts';
import { isDbConnected } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(import.meta.dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.render('home', { title: 'Home' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: isDbConnected() ? 'up' : 'down' });
});

// Error handling (must stay at the bottom)
app.use(notFound);
app.use(errorHandler);

export default app;