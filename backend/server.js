require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const articlesRouter = require("./routes/articles");
const refreshRouter = require("./routes/refresh");

const app = express();
const port = Number(process.env.PORT || 3001);

// Allow frontend served by this backend to call the API on the same origin.
// In production, this should be restricted to the appropriate site origin.
app.use(cors());

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Certrec News API is running.",
  });
});

app.use("/api/articles", articlesRouter);
app.use("/api/refresh", refreshRouter);

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

app.listen(port, () => {
  console.log(`Certrec News API running on port ${port}`);
});
