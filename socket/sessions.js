// In-memory mirror of each team's current single-session token, so the
// buzzer path can check it synchronously without a database round-trip.
const activeSessions = new Map();

function setSession(teamId, sessionToken) {
  if (sessionToken) {
    activeSessions.set(String(teamId), sessionToken);
  } else {
    activeSessions.delete(String(teamId));
  }
}

function isCurrentSession(teamId, sessionToken) {
  return Boolean(sessionToken) && activeSessions.get(String(teamId)) === sessionToken;
}

/**
 * Disconnect every socket still attached to a team's previous session
 */
function revokeTeamSockets(io, teamId, event, message) {
  if (!io) return;
  const room = `team:${teamId}`;
  io.to(room).emit(event, { message });
  io.in(room).disconnectSockets(true);
}

module.exports = {
  setSession,
  isCurrentSession,
  revokeTeamSockets
};
