import { Request, Response } from 'express';
import { userRepository } from '../../repositories/user.repository';
import { userService } from '../../services/user.service';
import { UserType } from '@prisma/client';
import * as z from 'zod';
import { isValidCnpj, isValidCpf } from '../../utils/document';

const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

// E-mail sempre em minúsculas: Joao@x.com e joao@x.com são a mesma conta
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(72),
});

const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    // bcrypt ignora tudo depois de 72 bytes
    password: z.string().min(6).max(72),
    name: z.string().trim().min(1).max(150),
    phone: z.string().max(20).optional(),
    cpf: z.string().regex(CPF_REGEX).refine(isValidCpf, { message: 'CPF inválido' }).optional().nullable(),
    cnpj: z.string().regex(CNPJ_REGEX).refine(isValidCnpj, { message: 'CNPJ inválido' }).optional().nullable(),
    type: z.enum([UserType.USER, UserType.ONG]),
  })
  .refine((data) => data.type !== UserType.USER || !!data.cpf, {
    message: 'CPF é obrigatório para usuários',
    path: ['cpf'],
  })
  .refine((data) => data.type !== UserType.ONG || !!data.cnpj, {
    message: 'CNPJ é obrigatório para organizações',
    path: ['cnpj'],
  })
  // Cada tipo de conta guarda apenas o seu documento
  .transform((data) => ({
    ...data,
    phone: data.phone || undefined,
    cpf: data.type === UserType.USER ? data.cpf : null,
    cnpj: data.type === UserType.ONG ? data.cnpj : null,
  }));

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(401).json({ code: 'INVALID_CREDENTIALS' });

  const token = await userService.login(parsed.data.email, parsed.data.password);

  if (!token) return res.status(401).json({ code: 'INVALID_CREDENTIALS' });

  return res.json({ token });
}

export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);
  const { user } = await userService.register(data);

  return res.status(201).json({
    token: userService.generateToken(user),
  });
}

export async function getLoggedUser(req: Request, res: Response) {
  const userId = Number((req as any).user.sub);

  const user = await userRepository.findById(userId);

  if (!user) {
    return res.status(404).json({ code: 'USER_NOT_FOUND' });
  }

  return res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type
  });
}
