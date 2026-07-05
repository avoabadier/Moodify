import "dotenv/config";
import express from "express";
import cors from "cors";
import moodRouter from "./routes/mood.js";

const app = express();

app.use(cors());
app.use("/api", moodRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Moodify backend listening on http://localhost:${port}`);
});
