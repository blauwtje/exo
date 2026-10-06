export class HttpError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const badRequest = (field, message) => new HttpError(400, 'invalid_input', message, field);
export const unauthenticated = () => new HttpError(401, 'unauthenticated', 'sign in first');
export const forbidden = (message = 'admin role required') => new HttpError(403, 'forbidden', message);
export const notFound = (entity, id) => new HttpError(404, 'not_found', `${entity} ${id} not found`);
export const conflict = (field, message) => new HttpError(409, 'conflict', message, field);

export function toResponse(error) {
  if (!(error instanceof HttpError)) {
    return { status: 500, body: { error: { code: 'internal', message: 'unexpected error' } } };
  }
  const body = { code: error.code, message: error.message };
  if (error.field) body.field = error.field;
  return { status: error.status, body: { error: body } };
}
