import { Request, Response, NextFunction } from 'express';
import * as jwt from '../utils/jwt';
import { UserType } from '@prisma/client';

export function authenticated(userType?: UserType) {
  return function (req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).send();

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).send();

    const payload = jwt.verify(token);

    if (!payload || !Number.isInteger(Number(payload.sub))) {
      return res.status(401).send();
    }
    if (userType && payload?.type !== userType) {
      return res.status(403).send();
    }

    (req as any).user = payload;
    next();
  };
}
