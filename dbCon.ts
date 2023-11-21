import pgPromise from "pg-promise";
const pgp = pgPromise();
const connectionString = process.env.DB_CONNECTION_STRING;
const db = pgp({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default db;

