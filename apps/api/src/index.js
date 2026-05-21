import express from 'express';
import cors from 'cors';
import shellRoutes from './routes/shell.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Apex Dev API',
  });
});

app.use('/shell', shellRoutes);

app.listen(PORT, () => {
  console.log(`Apex Dev API running on port ${PORT}`);
});
