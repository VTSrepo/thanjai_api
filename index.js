// Settings come from environment variables or a .env file next to this one (see .env.example).
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

// Routine console.log output (SQL, request dumps) is off unless LOG_LEVEL=debug. Errors are always printed.
if ((process.env.LOG_LEVEL || "").toLowerCase() !== "debug") {
  console.log = () => {};
  console.debug = () => {};
}

const app = require("./server");
const port = Number(process.env.HOST_PORT) || 4002;

app.listen(port, () => {
  console.info(`Thanjai API listening on port ${port} (${process.env.ENV || "dev"})`);
});
