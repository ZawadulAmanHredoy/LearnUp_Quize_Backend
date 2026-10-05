const os = require('os');
const mongoose = require('mongoose');

/**
 * Private IPv4 addresses of this machine, so the projector can show a join
 * QR code that phones on the venue Wi-Fi can open (Modernize.md §4)
 */
function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

function getHealth(req, res) {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus,
      environment: process.env.NODE_ENV || 'development',
      lanAddresses: getLanAddresses()
    },
    error: null
  });
}

module.exports = {
  getHealth
};
