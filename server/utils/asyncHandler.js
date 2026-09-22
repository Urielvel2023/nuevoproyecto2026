// Envuelve un handler async de Express para que los errores/rejects
// lleguen al middleware de errores (Express 4 no lo hace automáticamente).
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
