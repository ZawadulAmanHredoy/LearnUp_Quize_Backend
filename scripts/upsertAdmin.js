/**
 * Create the admin account, or reset its password, from ADMIN_USERNAME /
 * ADMIN_PASSWORD in .env without restarting the server.
 *   node scripts/upsertAdmin.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const { hashPassword } = require('../utils/auth');

async function run() {
  const uri = process.env.MONGODB_URI;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!uri) throw new Error('MONGODB_URI is not set in .env');
  if (!adminPassword) throw new Error('ADMIN_PASSWORD is not set in .env');

  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();

  await mongoose.connect(uri);
  const admin = await Admin.findOneAndUpdate(
    { username: adminUsername },
    { username: adminUsername, password: hashPassword(adminPassword), role: 'SUPER_ADMIN' },
    { upsert: true, new: true }
  );
  console.log(`✅ Admin saved: ${admin.username}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
