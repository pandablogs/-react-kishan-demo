import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initCronJobs } from "./utils/cronJobs.js";

connectDB();
initCronJobs();

const PORT = process.env.PORT || 5002;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});