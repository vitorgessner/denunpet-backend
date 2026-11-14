import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { logger } from '../config/logger';
import { AppError } from '../errors/app-error';
import * as z from 'zod';

const SENSITIVE_FIELDS = ['password', 'confirmPassword', 'token'];

// Nunca gravar senha em log
function redactBody(body: unknown) {
  if (!body || typeof body !== 'object') return body;

  const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  SENSITIVE_FIELDS.forEach((field) => {
    if (field in copy) copy[field] = '[REDACTED]';
  });
  return copy;
}

const MULTER_ERROR_CODES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'FILE_TOO_LARGE',
  LIMIT_FILE_COUNT: 'TOO_MANY_FILES',
  LIMIT_UNEXPECTED_FILE: 'TOO_MANY_FILES',
};

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // A stack só vai na resposta quando pedido explicitamente (NODE_ENV=development)
  const isDev = process.env.NODE_ENV === 'development';

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      errors: error.issues.reduce(
        (obj, { path, message }) => ({
          ...obj,
          [path.join('.')]: message,
        }),
        {}
      ),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      code: error.messageCode,
      data: error.data,
    });
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      code: MULTER_ERROR_CODES[error.code] ?? 'UPLOAD_ERROR',
    });
  }

  // JSON inválido no corpo da requisição (express.json)
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Registro não encontrado em update/delete
    if (error.code === 'P2025') {
      return res.status(404).json({ code: 'NOT_FOUND' });
    }
    // Violação de campo único
    if (error.code === 'P2002') {
      return res.status(409).json({ code: 'CONFLICT' });
    }
  }

  logger.error(
    {
      error,
      url: req.originalUrl,
      method: req.method,
      body: redactBody(req.body),
    },
    'Erro inesperado'
  );

  res.status(500).json({
    code: 'INTERNAL_ERROR',
    ...(isDev && { stack: error.stack }),
  });
}
