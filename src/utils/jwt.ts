import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

const JWT_EXPIRES_IN = '1d';
const JWT_ALGORITHM = 'HS256';
const EXAMPLE_SECRET = 'super-secret';

// Sem fallback: com um segredo padrão conhecido qualquer pessoa conseguiria forjar tokens
function loadSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET não definido. Configure a variável no arquivo .env');
  }

  const isWeak = secret === EXAMPLE_SECRET || secret.length < 32;

  if (isWeak && process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET fraco. Em produção use um valor aleatório com pelo menos 32 caracteres'
    );
  }
  if (isWeak) {
    logger.warn(
      'JWT_SECRET fraco ou igual ao do .env.example. Troque antes de publicar o projeto'
    );
  }

  return secret;
}

const JWT_SECRET = loadSecret();

export function sign(payload: object) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
  });
}

export function verify(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as any;
  } catch {
    return null;
  }
}
