db = db.getSiblingDB("nexusforge");

db.createCollection("logs");
db.createCollection("job_history");
db.createCollection("job_outputs");

db.logs.createIndex({ createdAt: -1 });
db.job_history.createIndex({ createdAt: -1 });
db.job_outputs.createIndex({ jobId: 1 });
