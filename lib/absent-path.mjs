const ABSENT_CODES = ['ENOENT', 'ENOTDIR'];

export function orWhenAbsent(read, fallback) {
  try {
    return read();
  } catch (error) {
    if (!ABSENT_CODES.includes(error.code)) throw error;
    return fallback;
  }
}
