const { tokenValidate } = require('../api/auth_api');

exports.SendResponse = function (status, body) {
  var response = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "DELETE, PUT,POST,GET",
      "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"

    },
    statusCode: status,
    body: JSON.stringify(body),

  };
  return response;
};

exports.authValidate = function (req, res, next) {
  // console.log("Headers Authorization:", req.headers);
  var _token = req.headers.authorization;
  var token_auth = _token.substring(7)

  // console.log("Token :", token_auth)
  tokenValidate(token_auth)
    .then(function (response) {
      // console.log("Token Auth Response:", response.client.clientId);
      var clientId = response.client.clientId;
      var merchant_id = clientId.substring(0,4);
      // console.log("Merchant Id :", merchant_id);
      req.headers['merchant_id'] = merchant_id
      next();
    })
    .catch(function (error) {
      // console.log("ERROR for auth123123132",error)
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
      res.send(error);
      return;
    })
}

exports.GetRandomPatientID = function () {
  var text = "";	// prefix
  var possible = "0123456789";
  var maxchars = 6;

  var prefixLen = text.length;
  var requiredLen = (maxchars - prefixLen);

  //console.log("Prefix length : ", text.length);
  for (var i = 0; i < requiredLen; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

exports.GetRandomEventID = function () {
  var text = "";	// prefix
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
      var maxchars = 8;
    
      var prefixLen = text.length;
      var requiredLen = (maxchars - prefixLen);
    
      //console.log("Prefix length : ", text.length);
      for (var i = 0; i < requiredLen; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    
      return text;
    
}

exports.GetRandomCourseID = function () {
  var text = "";	// prefix
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
      var maxchars = 8;
    
      var prefixLen = text.length;
      var requiredLen = (maxchars - prefixLen);
    
      //console.log("Prefix length : ", text.length);
      for (var i = 0; i < requiredLen; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    
      return text;
    
}