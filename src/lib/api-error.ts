export const API_ERRORS = {
  QR_NOT_FOUND: "This QR code does not exist.",
  QR_NOT_ACTIVE: "This QR code is not active.",
  QR_ALREADY_ACTIVE: "This QR code is already activated.",
  INVALID_QR_ID: "This QR ID is not valid.",
  INVALID_DESTINATION: "The destination you entered is not valid.",
  MERCHANT_NOT_FOUND: "Merchant not found.",
  TEMPLATE_NOT_FOUND: "Template not found.",
  UNAUTHORIZED: "You are not signed in.",
  FORBIDDEN: "You are not allowed to do that.",
  VALIDATION_ERROR: "Please check the details you entered.",
  RATE_LIMITED: "Too many requests. Please try again shortly.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string; details?: unknown } };
export type ApiOkBody<T> = { data: T };

/** Server / client-safe error carrying a stable machine code. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, status: number, details?: unknown, message?: string) {
    super(message ?? API_ERRORS[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
