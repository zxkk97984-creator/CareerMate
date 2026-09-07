/** 头像 base64 Data URL 长度上限（约 1.8M 字符 ≈ 1.35MB 二进制） */
export const MAX_AVATAR_DATA_URL_LENGTH = 1_800_000;

/** 上传前允许的原始图片体积上限（客户端压缩前校验） */
export const MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024;

/** 允许上传的图片 MIME 类型 */
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
