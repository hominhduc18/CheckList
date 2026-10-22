import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema, uploadDir, dataDir } from './db.js';
import { router } from './routes.js';
import { authRouter } from './authRoutes.js';
import { adminRouter } from './adminRoutes.js';
import { statsRouter } from './statsRoutes.js';
import { startScheduler } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

// Múi giờ nhắc việc
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

initSchema();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api', router);
app.use('/api/admin', adminRouter);
app.use('/api/stats', statsRouter);
app.use('/uploads', express.static(uploadDir));

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

export { app };
export default app;

if (!process.env.VERCEL && !process.env.NOW_REGION) {
  const server = app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT}`);
    console.log(`DB: ${path.join(dataDir, 'checklist.db')}`);
    startScheduler();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Cổng ${PORT} đang bị chiếm. Đóng tiến trình cũ rồi chạy lại:\n` +
          `  netstat -ano | findstr :${PORT}\n` +
          `  taskkill /PID <pid> /F`
      );
      process.exit(1);
    }
    throw err;
  });
}
