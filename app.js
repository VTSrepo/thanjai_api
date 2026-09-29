const express = require("express");
const bodyParser = require("body-parser");
//const multer = require('multer');
const app = express();
const cors = require("cors");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: "100mb" }));
app.use(cors({ origin: "*" }));
const aqp = require("api-query-params");
const { UserAction } = require("./lib/action/user_action");
const { ProductAction } = require("./lib/action/product_action");
const { MasterAction } = require("./lib/action/master_action");
const { BusinessAction } = require("./lib/action/business_action");
const { IndentAction } = require("./lib/action/indent_action");
const { ProductionAction } = require("./lib/action/production_action");
const { DashboardAction } = require("./lib/action/dashboard_action");
const { TimesheetAction } = require("./lib/action/timesheet_action");
const path = require("path");
// Serve static files from the React app build folder under /v1
app.use("/", express.static(path.join(__dirname, "client", "build")));

// Catch-all route to serve index.html for all routes under /v1 (for client-side routing)


app.post("/login", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var userAction = new UserAction();
  event.headers = req.headers;
  event.body = req.body;
  console.log("Login");
  userAction.getUserLogin(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/product/:product_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductDetail(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});
app.post("/product", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
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
      res.send(resmsg.body);
    },
  });
});
app.get("/products/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductMasterOrgId(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/branchproducts/:branch_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProducts(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/prodsellingprice/:product_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetProductSellingPrice(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.post("/sellingprice", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Create Selling Price");
  productAction.CreateProductPricing(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/references/:ref_type", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var masterAction = new MasterAction();
  event.header = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  masterAction.GetReferenceList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/business/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var businessAction = new BusinessAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  businessAction.GetBusiness(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/business/:org_id/:bu_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var businessAction = new BusinessAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  businessAction.GetBusinessDetail(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/category", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productAction = new ProductAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productAction.GetCategoryList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.post("/indent", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var indentAction = new IndentAction();
  event.headers = req.headers;
  event.body = req.body;
  event.queryParameters = aqp(req.query);
  indentAction.createIndent(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});
app.get("/indents/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var indentAction = new IndentAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  indentAction.GetIndentList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/indentdetail/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var indentAction = new IndentAction();
  event.headers = req.headers;
  // event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  indentAction.GetIndentDetail(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/indent-report/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var indentAction = new IndentAction();
  console.log("Indent-report");
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  indentAction.GetIndentReport(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/production-monitoring/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productionAction = new ProductionAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productionAction.GetProductions(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.post("/production-monitoring", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productionAction = new ProductionAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Create Emp Product");
  productionAction.CreateProduction(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/employees/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var productionAction = new ProductionAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  productionAction.GetEmployees(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/product-dashboard/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var dashboardAction = new DashboardAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  dashboardAction.GetProductDashboard(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.post('/employee', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var productionAction = new ProductionAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Create Emp Product");
  productionAction.CreateEmployee(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})
app.get("/production-report/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var dashboardAction = new DashboardAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  dashboardAction.GetProductionReport(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get("/timesheet/:org_id", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var timesheetAction = new TimesheetAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  timesheetAction.GetTimesheets(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.post("/timesheet", function (req, res) {
  var event = { stageVariables: { env: "dev" } };
  var timesheetAction = new TimesheetAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);  
  timesheetAction.CreateTimesheet(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
});

app.get('/branches/:org_id', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var masterAction = new MasterAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  masterAction.GetBranchList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})


app.get('/users/:org_id', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var userAction = new UserAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  userAction.GetUserList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})


app.post('/createuser', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var userAction = new UserAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Create User");
  userAction.CreateUser(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})

app.post('/updateuser', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var userAction = new UserAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Update User");
  userAction.UpdateUser(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})


app.get('/categories', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var masterAction = new MasterAction();
  event.headers = req.headers;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  masterAction.GetCategoryList(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})


app.post('/category', function (req, res) {
  var event = { stageVariables: { 'env': 'dev' } };
  var masterAction = new MasterAction();
  event.headers = req.headers;
  event.body = req.body;
  event.pathParameters = req.params;
  event.queryParameters = aqp(req.query);
  console.log("Create Category");
  masterAction.CreateCategory(event, {
    done: function (rescode, resmsg) {
      res.header(resmsg.headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body)
    }
  })
})

// ---- Branch Master (admin) ----
const { BranchModule } = require("./lib/modules/branch_module");
const branchModule = new BranchModule();
const sendJson = (res, result) => {
  const code = result && result.status ? (result.status === 404 ? 404 : result.status) : 200;
  res.status(code).json(result);
};

app.get("/branch/:org_id/:branch_id", async function (req, res) {
  try {
    sendJson(res, await branchModule.getBranch(req.params.org_id, req.params.branch_id));
  } catch (err) {
    console.error("Get branch failed:", err.message);
    sendJson(res, { status: 500, code: 5001, message: "Sorry, Internal Server Error!." });
  }
});

app.post("/branch", async function (req, res) {
  try {
    const body = req.body || {};
    sendJson(res, await branchModule.saveBranch(body.branch, body.user_id));
  } catch (err) {
    console.error("Save branch failed:", err.message);
    sendJson(res, { status: 500, code: 5001, message: "Sorry, Internal Server Error!." });
  }
});

// ---- Indent invoicing ----
const { InvoiceModule } = require("./lib/modules/invoice_module");
const invoiceModule = new InvoiceModule();
const invoiceError = (res, err) => {
  console.error("Invoice error:", err && err.message);
  sendJson(res, { status: 500, code: 5001, message: "Sorry, Internal Server Error!." });
};

// Report: indents by indent date range (+ optional ordering branch) with invoice / estimated amounts
app.get("/invoices/:org_id", async function (req, res) {
  const { from_date, to_date, branch_id } = req.query;
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  if (!isDate(from_date) || !isDate(to_date)) {
    return sendJson(res, { status: 400, code: 4000, message: "from_date and to_date (YYYY-MM-DD) are required" });
  }
  try {
    sendJson(res, await invoiceModule.listIndents(req.params.org_id, { from_date, to_date, branch_id: branch_id || null }));
  } catch (err) { invoiceError(res, err); }
});

app.get("/invoice/:org_id/:invoice_number", async function (req, res) {
  try {
    sendJson(res, await invoiceModule.getInvoice(req.params.org_id, req.params.invoice_number));
  } catch (err) { invoiceError(res, err); }
});

// Creates the invoice for a received indent (returns the existing one if already generated)
app.post("/invoice/generate", async function (req, res) {
  const { org_id, indent_number, user_id } = req.body || {};
  try {
    sendJson(res, await invoiceModule.generate(org_id, indent_number, user_id));
  } catch (err) { invoiceError(res, err); }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});
module.exports = app;
