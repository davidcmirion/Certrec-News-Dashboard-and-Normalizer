require("dotenv").config();

const express = require("express");
const cors = require("cors");

const articlesRouter = require("./routes/articles");

const app = express();
const port = Number(process.env.PORT || 3001);

// Development setting: lets the current frontend call this API.
// Before public deployment, we will restrict this to the real site address.
app.use(cors());

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Certrec News API is running.",
  });
});

app.use("/api/articles", articlesRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

app.listen(port, () => {
  console.log(`Certrec News API running on port ${port}`);
});
