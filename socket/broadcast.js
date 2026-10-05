const { forAdmin, forPublic } = require('../utils/sanitize');

const ROOMS = {
  admin: 'room:admin',
  projector: 'room:projector',
  teams: 'room:teams'
};

/**
 * Emit an event to every joined client. The admin room receives the full
 * payload; the projector and team phones receive a copy without answer keys,
 * PINs or session tokens.
 */
function broadcast(io, event, payload, publicPayload) {
  io.to(ROOMS.admin).emit(event, forAdmin(payload));
  io.to(ROOMS.projector).to(ROOMS.teams).emit(event, forPublic(publicPayload ?? payload));
}

module.exports = {
  ROOMS,
  broadcast
};
