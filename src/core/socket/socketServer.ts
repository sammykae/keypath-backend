import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env'; 

let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT auth middleware
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, env.JWT_SECRET) as any;
      (socket as any).userId = payload.sub ?? payload._id ?? payload.id;
      (socket as any).role = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;

    // Join personal room so we can target this user
    socket.join(`user:${userId}`);

    // Client joins a thread room to receive messages
    socket.on('join:thread', (threadId: string) => {
      if (typeof threadId === 'string' && threadId.length > 0) {
        socket.join(`thread:${threadId}`);
      }
    });

    socket.on('leave:thread', (threadId: string) => {
      socket.leave(`thread:${threadId}`);
    });

    socket.on('call:start', (data: { threadId: string; callType: 'audio' | 'video'; callerName: string }) => {
      if (typeof data?.threadId !== 'string') return;
      socket.to(`thread:${data.threadId}`).emit('call:incoming', {
        threadId: data.threadId,
        callType: data.callType,
        callerName: data.callerName,
      });
    });

    socket.on('call:end', (data: { threadId: string }) => {
      if (typeof data?.threadId !== 'string') return;
      socket.to(`thread:${data.threadId}`).emit('call:ended', { threadId: data.threadId });
    });

    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function emitToThread(
  threadId: string,
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.to(`thread:${threadId}`).emit(event, data);
}

export function emitToUser(
  userId: string,
  event: string,
  data: unknown
): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}
