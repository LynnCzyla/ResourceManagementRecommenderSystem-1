// backend/scripts/recalculate_availability.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const workloadService = require('../services/workloadService');

async function main() {
  console.log('🚀 Starting bulk availability recalculation...');
  try {
    const results = await workloadService.recalculateBatch();
    console.log(`\n🎉 Successfully recalculated availability for ${results.length} active employees:`);
    console.table(
      results.map(r => ({
        'Employee ID': r.employeeId,
        'Profile ID': r.profileId,
        'Workload (W)': r.W,
        'Availability (A)': r.A,
        'Status': r.status,
        'Utilization (%)': `${r.utilizationRate}%`,
        'Active Tasks': r.activeTasksCount,
      }))
    );
    process.exit(0);
  } catch (err) {
    console.error('❌ Recalculation failed:', err);
    process.exit(1);
  }
}

main();
