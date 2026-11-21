// Python original: fastapi.HTTPException
//
// Throw an HttpError anywhere in the code and the error handler in app.js
// turns it into a JSON reply like { "detail": "..." } with the right status
// code. The frontend already reads "detail", so it keeps working unchanged.
export class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}
