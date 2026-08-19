const { getDatabase } = require('../packages/database/src/client/sqlite');

const db = getDatabase();

const tableInfo = db.prepare("PRAGMA table_info(usuarios);").all();

console.log(tableInfo);