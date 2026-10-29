import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Geopolitics Game is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;