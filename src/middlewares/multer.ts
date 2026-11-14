import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { Request } from "express";
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
export const MAX_FILES_PER_REQUEST = 10;

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
export const upload = multer({
  storage,
  fileFilter: createFileFilter({ ...IMAGE_TYPES, ...VIDEO_TYPES }),
  limits: { fileSize: MAX_VIDEO_SIZE, files: MAX_FILES_PER_REQUEST },
});

// Aceita apenas imagens (usado pelas ONGs durante a triagem)
export const uploadImages = multer({
  storage,
  fileFilter: createFileFilter(IMAGE_TYPES),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_FILES_PER_REQUEST },
});

// Apaga do disco tudo o que a requisição gravou (chamado quando ela termina em erro)
export function removeUploadedFiles(req: Request) {
  const entry = getUploads(req);

  entry.discarded = true;
  entry.paths.forEach(unlinkQuietly);
  entry.paths = [];
}
