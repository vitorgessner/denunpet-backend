import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../errors/app-error";

export const UPLOAD_DIR = path.join(process.cwd(), "public", "images");

// Garante que a pasta de destino existe (ela não é versionada)
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Extensões aceitas e o mimetype esperado para cada uma.
// O nome final do arquivo usa apenas a extensão desta lista, nunca o nome enviado pelo cliente.
const IMAGE_TYPES: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
};

const VIDEO_TYPES: Record<string, string[]> = {
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm"],
  ".mov": ["video/quicktime"],
};

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_REQUEST = 10;

function getExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

export function getMidiaType(filename: string): "image" | "video" {
  return getExtension(filename) in VIDEO_TYPES ? "video" : "image";
}

// Extensão sem o ponto, como é salva em Midia.extension
export function getMidiaExtension(filename: string) {
  return getExtension(filename).slice(1);
}

function createFileFilter(allowed: Record<string, string[]>) {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const mimetypes = allowed[getExtension(file.originalname)];
    if (mimetypes?.includes(file.mimetype)) return cb(null, true);
    cb(new AppError("INVALID_FILE_TYPE", 400));
  };
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Nome aleatório: evita colisão, path traversal e nomes adivinháveis
    cb(null, randomUUID() + getExtension(file.originalname));
  },
});

// Arquivos gravados por requisição. `discarded` indica que a requisição falhou.
const uploads = new WeakMap<Request, { paths: string[]; discarded: boolean }>();

function getUploads(req: Request) {
  let entry = uploads.get(req);
  if (!entry) {
    entry = { paths: [], discarded: false };
    uploads.set(req, entry);
  }
  return entry;
}

function unlinkQuietly(filePath: string) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") console.error("Erro ao deletar arquivo:", filePath, err);
  });
}

// Envolve o diskStorage para saber exatamente o que cada requisição gravou.
// Quando um arquivo é recusado, o multer só apaga os que já tinham terminado de gravar;
// os que terminam depois do erro ficariam órfãos no disco. Aqui eles são apagados ao terminar.
const storage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    diskStorage._handleFile(req, file, (err, info) => {
      if (!err && info?.path) {
        const entry = getUploads(req);
        if (entry.discarded) unlinkQuietly(info.path);
        else entry.paths.push(info.path);
      }
      cb(err, info);
    });
  },
  _removeFile(req, file, cb) {
    diskStorage._removeFile(req, file, cb);
  },
};

// Fotos e vídeos (usado pelo denunciante)
const upload = multer({
  storage,
  fileFilter: createFileFilter({ ...IMAGE_TYPES, ...VIDEO_TYPES }),
  limits: { fileSize: MAX_VIDEO_SIZE, files: MAX_FILES_PER_REQUEST },
});

// Aceita apenas imagens (usado pelas ONGs durante a triagem)
const uploadImages = multer({
  storage,
  fileFilter: createFileFilter(IMAGE_TYPES),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_FILES_PER_REQUEST },
});

// ---- Conferência do conteúdo ----
// Extensão e mimetype são informados pelo cliente. Aqui os primeiros bytes do arquivo salvo
// são comparados com a assinatura do formato, para barrar arquivo renomeado (ex.: .exe -> .png).

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte);

const hasText = (buffer: Buffer, text: string, offset: number) =>
  buffer.toString("latin1", offset, offset + text.length) === text;

// mp4/mov são formados por "caixas": 4 bytes de tamanho + 4 bytes com o tipo da caixa
const MP4_BOXES = ["ftyp"];
const MOV_BOXES = ["ftyp", "moov", "mdat", "wide", "free", "skip"];

const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  ".jpg": (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  ".jpeg": (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  ".png": (buffer) => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ".gif": (buffer) => hasText(buffer, "GIF87a", 0) || hasText(buffer, "GIF89a", 0),
  ".webp": (buffer) => hasText(buffer, "RIFF", 0) && hasText(buffer, "WEBP", 8),
  ".mp4": (buffer) => MP4_BOXES.some((box) => hasText(buffer, box, 4)),
  ".mov": (buffer) => MOV_BOXES.some((box) => hasText(buffer, box, 4)),
  ".webm": (buffer) => startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]),
};

async function hasValidContent(file: Express.Multer.File) {
  const check = SIGNATURES[getExtension(file.filename)];
  if (!check) return false;

  const handle = await fs.promises.open(file.path, "r");
  try {
    const buffer = Buffer.alloc(16);
    await handle.read(buffer, 0, buffer.length, 0);
    return check(buffer);
  } finally {
    await handle.close();
  }
}

async function verifyFileContent(req: Request, res: Response, next: NextFunction) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const results = await Promise.all(files.map(hasValidContent));

  // O error handler apaga os arquivos da requisição
  if (results.includes(false)) return next(new AppError("INVALID_FILE_CONTENT", 400));
  next();
}

// Middlewares prontos para as rotas: upload + conferência do conteúdo
export const uploadMidia: RequestHandler[] = [upload.array("midia", MAX_FILES_PER_REQUEST), verifyFileContent];
export const uploadNgoImages: RequestHandler[] = [uploadImages.array("midia", MAX_FILES_PER_REQUEST), verifyFileContent];

// Apaga do disco tudo o que a requisição gravou (chamado quando ela termina em erro)
export function removeUploadedFiles(req: Request) {
  const entry = getUploads(req);

  entry.discarded = true;
  entry.paths.forEach(unlinkQuietly);
  entry.paths = [];
}
