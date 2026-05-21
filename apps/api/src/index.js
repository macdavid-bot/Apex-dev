import express from 'express';
import cors from 'cors';

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

app.listen(PORT, () => {
  console.log(`Apex Dev API running on port ${PORT}`);
});
