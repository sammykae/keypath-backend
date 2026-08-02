import http from 'http';
import { connectDB } from './core/config/db';
import { createServer } from './core/http/server';
import { initSocketServer } from './core/socket/socketServer';
import { env } from './core/config/env';

const start = async () => {
  await connectDB();
  const app = createServer();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(parseInt(env.PORT), '0.0.0.0', () => {
    console.log(`Server running on port ${env.PORT}`);
    console.log(`API Docs: http://localhost:${env.PORT}/api-docs`);
  });
};

start();
