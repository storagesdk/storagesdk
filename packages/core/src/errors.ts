export type StorageErrorCode =
  | 'NotFound'
  | 'NotSupported'
  | 'Conflict'
  | 'Unauthorized'
  | 'InvalidArgument'
  | 'Aborted'
  | 'Provider';

export interface StorageErrorInit {
  code: StorageErrorCode;
  message?: string;
  cause?: unknown;
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(init: StorageErrorInit) {
    super(init.message ?? init.code, { cause: init.cause });
    this.name = 'StorageError';
    this.code = init.code;
  }
}
