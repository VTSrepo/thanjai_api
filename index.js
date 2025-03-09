const app = require("./server");

var list = app.listen(4002, function () {
  console.log("Users listening on port " + process.env.HOST_PORT);
})