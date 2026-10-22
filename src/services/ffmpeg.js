import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config/index.js';

/**
 * The ffmpeg program used for browser streaming, or null when there is none.
 * FFMPEG_PATH wins; otherwise the copy that the ffmpeg-static package downloads.
 */
export const ffmpegPath = config.ffmpegPath || (ffmpegStatic && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null);
