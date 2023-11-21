import pgPromise from "pg-promise";
const pgp = pgPromise();
const connectionString = 'postgresql://flashfpldb_user:jFhDJIJJ3C3KzhirjH5FGiCQutwnK3HA@dpg-ck1gvoeru70s73dpd9q0-a.frankfurt-postgres.render.com/flashfpldb';
const db = pgp({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default db;

