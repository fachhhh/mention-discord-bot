import pkg from "pg";
import { ENV } from "../config/env.js";

const { Pool } = pkg;

export const pool = new Pool({
  host: ENV.DB_HOST,
  port: ENV.DB_PORT,
  database: ENV.DB_NAME,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  ssl: { require: true }
});

pool.on("connect", () => {
  console.log("Connected to DB");
});