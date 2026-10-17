const db = require('better-sqlite3')('data/pfm.sqlite3'); 
db.exec("UPDATE proactive_insights SET status = 'active' WHERE status = 'dismissed';");
console.log("Reset successful");
