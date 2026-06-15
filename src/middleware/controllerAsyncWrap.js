const { formatSqliteUserMessage } = require('../config/sqliteUserErrors');

/**
 * Wraps async Express handlers: on rejection, logs and returns JSON { success: false, error }.
 * @param {import('express').RequestHandler} handler
 * @param {{ errorStatus?: number, defaultErrorMessage?: string }} [opts]
 */
function wrapAsyncController(handler, opts = {}) {
  const errorStatus = opts.errorStatus ?? 500;
  const defaultErrorMessage = opts.defaultErrorMessage ?? 'Internal Server Error';
  return async function run(req, res) {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      const mapped = formatSqliteUserMessage(err);
      res.status(errorStatus).json({
        success: false,
        error: mapped || err.message || defaultErrorMessage,
      });
    }
  };
}

module.exports = { wrapAsyncController };
