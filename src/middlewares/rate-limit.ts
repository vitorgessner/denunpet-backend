import { Request, Response, NextFunction } from 'express';

type Options = {
  windowMs: number;
  max: number;
};

// Limitador simples em memória (por IP) para dificultar força bruta em login/cadastro.
// Serve para uma única instância do servidor; com várias instâncias use um store compartilhado.
export function rateLimit({ windowMs, max }: Options) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Limpa as entradas expiradas para o Map não crescer indefinidamente
  const cleanup = setInterval(() => {
    const now = Date.now();
    hits.forEach((entry, key) => {
      if (entry.resetAt <= now) hits.delete(key);
    });
  }, windowMs);
  cleanup.unref();

  return function (req: Request, res: Response, next: NextFunction) {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ code: 'TOO_MANY_REQUESTS' });
    }

    next();
  };
}
