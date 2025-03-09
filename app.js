const express = require('express');
const bodyParser = require('body-parser');
//const multer = require('multer');
const app = express();


const cors = require('cors');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: '100mb' }))
app.use(cors({origin:'*'}));
const aqp = require('api-query-params');


const { UserAction } = require('./lib/action/user_action');


app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/login', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var userAction = new UserAction();
  event.headers = req.headers;
  event.body = req.body;
  console.log("Login");
  userAction.getUserLogin(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})



module.exports = app;
