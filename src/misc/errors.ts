export const DOES_NOT_SUPPORT_FETCH = 0;

export class YacdError extends Error {
  constructor(
    public message: string,
    public code?: string | number,
  ) {
    super(message);
  }
}

export const errors = {
  [DOES_NOT_SUPPORT_FETCH]: {
    message: 'Browser not supported!',
    detail: 'This browser does not support "fetch", please choose another one.',
  },
  default: {
    message: 'Oops, something went wrong!',
  },
};

export type Err = { code?: number; message?: string };

export function deriveMessageFromError(err: any) {
  if (!err) return errors.default;
  const { code } = err;
  if (typeof code === 'number' && errors[code]) {
    return errors[code];
  }
  if (err && typeof err.message === 'string' && err.message) {
    return {
      message: errors.default.message,
      detail: err.message,
    };
  }
  return errors.default;
}
