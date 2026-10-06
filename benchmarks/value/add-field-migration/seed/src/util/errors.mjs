export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(what, id) {
  return new AppError(404, 'not_found', `${what} ${id} does not exist`);
}

export function invalid(message) {
  return new AppError(422, 'invalid', message);
}
