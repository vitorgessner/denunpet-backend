import multer from "multer";
import path from "path";
import { AppError } from "../errors/app-error";

// Define onde salvar os arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve("public/images")); // pasta de destino
  },
  filename: (req, file, cb) => {
    // exemplo: 1696012345678-foto.jpg
    cb(null, Date.now() + "-" + file.originalname);
  },
});

export const upload = multer({ storage });

// Aceita apenas imagens (usado pelas ONGs durante a triagem)
export const uploadImages = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image")) return cb(null, true);
    cb(new AppError("ONLY_IMAGES_ALLOWED", 400));
  },
});