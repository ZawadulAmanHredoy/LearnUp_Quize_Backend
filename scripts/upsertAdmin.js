const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const { hashPassword } = require('../utils/auth');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const adminUsername = (process.env.ADMIN_USERNAME || 'planpostadmin').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('No ADMIN_PASSWORD found in environment variables');
    process.exit(1);
  }
  const hashedPassword = hashPassword(adminPassword);

  const admin = await Admin.findOneAndUpdate(
    { username: adminUsername },
    { username: adminUsername, password: hashedPassword, role: 'SUPER_ADMIN' },
    { upsert: true, new: true }
  );
  console.log(`✅ Admin saved/upserted in database: ${admin.username} (ID: ${admin._id})`);

  // Ensure all teams have a teamId if missing
  const teams = await Team.find({});
  console.log(`Found ${teams.length} teams in database`);
  for (const t of teams) {
    let updated = false;
    if (!t.teamId) {
      t.teamId = `T-${String(t.teamNumber).padStart(2, '0')}`;
      updated = true;
    }
    if (!t.institution) {
      t.institution = 'BUFT';
      updated = true;
    }
    if (updated) {
      await t.save();
      console.log(`Updated team ${t.teamName} with teamId: ${t.teamId}, institution: ${t.institution}`);
    }
  }

  await mongoose.disconnect();
  console.log('Done!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
