let _io = null;

/**
 * Store socket.io instance
 */
exports.init = (io) => {
  _io = io;
};

const createDummyIO = () => {
  const dummy = {
    to: () => dummy,
    emit: () => dummy,
    in: () => dummy,
    join: () => dummy,
    leave: () => dummy,
    on: () => dummy,
    use: () => dummy,
  };
  return dummy;
};

exports.getIO = () => {
  if (!_io) {
    console.warn('[Socket Utils] getIO() called but Socket.IO is not initialized yet. Returning dummy fallback.');
    return createDummyIO();
  }
  return _io;
};
