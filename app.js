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
const { ProductAction } = require('./lib/action/product_action');
const { MasterAction } = require('./lib/action/master_action');
const { BusinessAction } = require('./lib/action/business_action');






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

app.get('/product/:product_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductDetail(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})
app.post('/product', function (req, res) { 
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Create Product");
  productAction.CreateProduct(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})
app.get('/products/:org_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductMasterOrgId(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})




app.get('/branchproducts/:branch_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProducts(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})

app.get('/productstemp/:branch_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProducts(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})
app.get('/productsorg/:org_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductsOrgId(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})


app.get('/prodsellingprice/:org_id/:branch_id/:product_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductSellingPrice(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})





app.get('/prodsellingprice/:product_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductMasterOrgId(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})

app.get('/references/:ref_type', function (req, res){
  var event = {stageVariables: {'env': 'dev'}};
  var masterAction = new MasterAction();
  event.header = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  masterAction.GetReferenceList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })  
})

app.get('/business/:org_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var businessAction = new BusinessAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  businessAction.GetBusiness(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})

app.get('/business/:org_id/:bu_id', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var businessAction = new BusinessAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  businessAction.GetBusinessDetail(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})

app.get('/category', function (req, res) {
  var event = {stageVariables: {'env': 'dev'}};
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetCategoryList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})


module.exports = app;
