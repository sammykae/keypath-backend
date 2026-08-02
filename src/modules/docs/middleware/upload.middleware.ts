import multer from 'multer';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const memoryStorage = multer.memoryStorage();

export const uploadSingle = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

export const uploadAvatarFile = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('avatar');

export const uploadImageFile = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('image');
