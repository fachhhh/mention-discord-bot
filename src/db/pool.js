import pkg from "pg";
import { ENV } from "../config/env.js";

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: ENV.DB_URL,
  ssl: { require: true }
});