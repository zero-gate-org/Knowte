export const APP_NAME = "Cognote";

export const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "ogg",
] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "m4v",
] as const;

export const SUPPORTED_MEDIA_EXTENSIONS = [
  ...SUPPORTED_AUDIO_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
] as const;
