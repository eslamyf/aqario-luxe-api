let _io = null;

/**
 * Store socket.io instance
 */
exports.init = (io) => {
  _io = io;
};

/**
 * Get socket.io instance
 */
exports.getIO = () => {
  if (!_io) {
    throw new Error('Socket.io has not been initialized yet');
  }
  return _io;
};
