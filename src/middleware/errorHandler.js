function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.statusCode ?? err.status ?? 500;
  const expose = err.expose === true || status < 500;
  const message = expose ? err.message : 'Internal Server Error';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
