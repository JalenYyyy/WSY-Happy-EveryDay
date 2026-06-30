import sharp from "sharp";

const imageTypes = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;

export type AllowedImageMimeType = (typeof imageTypes)[keyof typeof imageTypes];

export const allowedImageTypes = new Set<AllowedImageMimeType>(Object.values(imageTypes));

const extensionByMimeType: Record<AllowedImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function detectImageMimeType(buffer: Buffer): AllowedImageMimeType | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return imageTypes.png;
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return imageTypes.jpeg;
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return imageTypes.webp;
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return imageTypes.gif;
  }

  return null;
}

export function getImageExtension(mimeType: AllowedImageMimeType) {
  return extensionByMimeType[mimeType];
}

export const avatarUploadLimitBytes = 10 * 1024 * 1024;
export const avatarStoredLimitBytes = 2 * 1024 * 1024;

export async function prepareAvatarImage(buffer: Buffer, mimeType: AllowedImageMimeType) {
  if (mimeType === imageTypes.gif) {
    if (buffer.length > avatarStoredLimitBytes) {
      throw new Error("GIF 头像不能超过 2MB，请换一张图或先压缩后再上传");
    }

    return {
      buffer,
      mimeType,
      extension: getImageExtension(mimeType),
    };
  }

  let quality = 82;
  let output = await sharp(buffer)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

  while (output.length > avatarStoredLimitBytes && quality > 55) {
    quality -= 7;
    output = await sharp(buffer)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  }

  if (output.length > avatarStoredLimitBytes) {
    throw new Error("头像处理后仍然过大，请换一张更简单的图片再试");
  }

  return {
    buffer: output,
    mimeType: imageTypes.webp,
    extension: getImageExtension(imageTypes.webp),
  };
}