const express = require('express');
const app = express();

app.use("/v1", require("./app"))

module.exports = app;