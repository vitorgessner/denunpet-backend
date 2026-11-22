import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.routes';
import reportRouter from './routes/report.routes';
import { errorHandler } from './middlewares/error-handler';
import path from "path";

const port = Number(process.env.PORT) || 3001

const app = express();

app.use(cors({
  origin: process.env.APP_ORIGIN || 'http://localhost:5174'
}));

app.use("/images", express.static(path.join(process.cwd(), "public", "images")));

app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/report', reportRouter);

app.use(errorHandler);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server ready at: http://localhost:${port}`);
});
