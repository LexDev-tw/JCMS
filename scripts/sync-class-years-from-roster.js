require('dotenv').config();

const { initDatabase } = require('../src/config/database');
const dynamicsService = require('../src/services/dynamicsService');

async function main() {
  await initDatabase();
  const { filled, unchanged } = await dynamicsService.syncMissingClassYearsFromJudicialRoster();
  console.log(
    JSON.stringify(
      {
        filled_count: filled.length,
        unchanged_missing: unchanged,
        filled,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
