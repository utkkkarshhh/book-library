const { Pool } = require("pg");

// const db = new Pool({
//     user: "postgres",
//     host: "localhost",
//     database: "books",
//     password: "utkarsh",
//     port: 8000,
//   });

const db = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to PostgreSQL:", err);
  } else {
    console.log("Connected to PostgreSQL Successfully");
  }
});

module.exports = db;
