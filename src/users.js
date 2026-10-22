import { pool } from "./db.js";

// Deletes a user's account by the name in the request query.
export async function deleteUser(req, res) {
  await pool.query("DELETE FROM users WHERE name = '" + req.query.name + "'");
  res.send("deleted");
}
