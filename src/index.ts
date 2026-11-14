import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.routes';
import reportRouter from './routes/report.routes';
import { errorHandler } from './middlewares/error-handler';
import { UPLOAD_DIR } from './middlewares/multer';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.disable('x-powered-by');

app.use(cors({
  origin: process.env.APP_ORIGIN || 'http://localhost:5173'
}));

// Impede o navegador de "adivinhar" o tipo do conteúdo (ex.: tratar um upload como HTML)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use("/images", express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore' }));

app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/report', reportRouter);

app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server ready at: http://localhost:${PORT}`);
});
