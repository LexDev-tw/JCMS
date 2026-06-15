class HttpError extends Error {
  constructor(statusCode, message, expose = true) {
    super(message);
    this.statusCode = statusCode;
    this.expose = expose;
  }
}

module.exports = { HttpError };
