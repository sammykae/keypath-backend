import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../../errors/AppError';
import { logger } from '../../logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    logger.warn(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method}`);
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return; 
  }

  logger.error(`${err.message} - ${req.originalUrl} - ${req.method}`);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
  return;
};
