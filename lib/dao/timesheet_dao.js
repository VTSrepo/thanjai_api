const mysql = require("../../common/db_utils");
var debug = require("debug")("v2:timesheet:dao");
const BaseDao = require("./base_dao");

class TimesheetDao extends BaseDao {
  getTimesheets(connection, org_id, query) {
    return new Promise(async (resolve, reject) => {
      try {
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!",
            developerMessage: "DB Connection Failed!",
          };
          return reject(err_code);
        }
        let input = `p.org_id='${org_id}'`;
        if (
          query.filter.hasOwnProperty("branch_id") &&
          query.filter.branch_id != null
        ) {
          input += ` AND p.branch_id = '${query.filter.branch_id}' `;
        }

        if (
          query.filter.hasOwnProperty("emp_id") &&
          query.filter.emp_id != null
        ) {
          input += ` AND p.emp_id = '${query.filter.emp_id}' `;
        }

        var custQuery = `SELECT p.*, DATE_FORMAT(p.cur_date,'%Y-%m-%d')  as cur_date,e.emp_name,
                DATE_FORMAT(p.created_date,'%Y-%m-%d')  as created_date, DATE_FORMAT(p.updated_date,'%Y-%m-%d')  as updated_date  FROM ${process.env.WRITE_DB_DATABASE}.emp_timesheet p 
                LEFT JOIN ${process.env.WRITE_DB_DATABASE}.emp_master e ON e.emp_id=p.emp_id
                WHERE  ${input}`;
        debug("getProductions", custQuery);
        let queryres = await connection.query(custQuery);
        if (queryres.length == 0) {
          debug("Sorry, Timehseet Data Not Found!.");
          var error_code = {
            status: 404,
            code: 4001,
            message: "Sorry, Production Data Not Found!.",
            developerMessage: "Sorry, Production Data Not Found!.",
          };
          return resolve(error_code);
        } else {
          return resolve(queryres);
        }
      } catch (error) {
        var err_code = {
          status: 500,
          code: 5001,
          message: "Sorry, Internal Server Error!.",
          developerMessage: "Sorry, Internal Server Error!.",
        };
        debug("getProductions Error :", error);
        return reject(err_code);
      }
    });
  }
  getEmployees(connection, org_id, query) {
    return new Promise(async (resolve, reject) => {
      try {
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!",
            developerMessage: "DB Connection Failed!",
          };
          return reject(err_code);
        }
        let input = `e.org_id='${org_id}'`;
        if (
          query.filter.hasOwnProperty("branch_id") &&
          query.filter.branch_id != null
        ) {
          input += ` AND e.branch_id = '${query.filter.branch_id}' `;
        }

        if (
          query.filter.hasOwnProperty("emp_id") &&
          query.filter.emp_id != null
        ) {
          input += ` AND e.emp_id = '${query.filter.emp_id}' `;
        }
        var custQuery = `SELECT e.*, DATE_FORMAT(e.created_date,'%Y-%m-%d')  as created_date, DATE_FORMAT(e.updated_date,'%Y-%m-%d')  as updated_date FROM 
                ${process.env.WRITE_DB_DATABASE}.emp_master e WHERE  ${input} ORDER BY e.emp_name`;
        debug("getEmployees", custQuery);
        let queryres = await connection.query(custQuery);
        if (queryres.length == 0) {
          debug("Sorry, Employee Data Not Found!.");
          var error_code = {
            status: 404,
            code: 4001,
            message: "Sorry, Employee Data Not Found!.",
            developerMessage: "Sorry, Production Data Not Found!.",
          };
          return resolve(error_code);
        } else {
          return resolve(queryres);
        }
      } catch (error) {
        var err_code = {
          status: 500,
          code: 5001,
          message: "Sorry, Internal Server Error!.",
          developerMessage: "Sorry, Internal Server Error!.",
        };
        debug("getEmployees Error :", error);
        return reject(err_code);
      }
    });
  }

  createTimesheet(connection, product_data) {
    return new Promise(async (resolve, reject) => {
      try {
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!.",
            developerMessage: "DB Connection Failed!.",
          };
          return reject(err_code);
        }
        await connection.query(
          `INSERT INTO ${process.env.WRITE_DB_DATABASE}.emp_timesheet SET ?`,
          product_data
        );

        debug("COMMIT at createTimesheet", product_data);
        return resolve(product_data);
      } catch (err) {
        var err_code = {
          status: 500,
          code: 5001,
          message: "Sorry, Internal Server Error!.",
          developerMessage: "Sorry, Internal Server Error!.",
        };
        console.log("create production error :", err);
        return reject(err_code);
      }
    });
  }

  updateTimesheet(
    connection,
    set_product_data,
    org_id,
    branch_id,
    emp_id,
    cur_date
  ) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("insine dao");
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!.",
            developerMessage: "DB Connection Failed!.",
          };
          return reject(err_code);
        }
        console.log("insine dao1");
        await connection.query(
          `UPDATE ${process.env.WRITE_DB_DATABASE}.emp_timesheet SET ? 
                    WHERE org_id='${org_id}' and branch_id='${branch_id}'and emp_id='${emp_id}'and cur_date='${cur_date}' `,
          set_product_data
        );
        //debug('COMMIT at updateProduct', `UPDATE ${process.env.WRITE_DB_DATABASE}.production_data SET ? WHERE product_id='${product_id}' `, set_product_data);
        return resolve(set_product_data);
      } catch (err) {
        var err_code = {
          status: 500,
          code: 5001,
          message: "Sorry, Internal Server Error!.",
          developerMessage: "Sorry, Internal Server Error!.",
        };
        debug("updateProduct Error :", err);
        return reject(err_code);
      }
    });
  }

  GetTimesheet(connection, org_id, branch_id, emp_id, cur_date) {
    return new Promise(async (resolve, reject) => {
      try {
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!",
            developerMessage: "DB Connection Failed!",
          };
          return reject(err_code);
        }
        var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.emp_timesheet 
                WHERE org_id='${org_id}' AND branch_id='${branch_id}' AND emp_id='${emp_id}' 
                AND cur_date='${cur_date}' `;
        console.log("GetProductById", custQuery);
        let queryres = await connection.query(custQuery);
        if (queryres.length == 0) {
          console.log("Sorry, Timesheet Data Not Found!.", queryres);
          var error_code = {
            status: 404,
            code: 4001,
            message: "Sorry, Timesheet Data Not Found!.",
            developerMessage: "Sorry, Timesheet Data Not Found!.",
          };
          return resolve(error_code);
        } else {
          var _res = JSON.parse(JSON.stringify(queryres));
          var response = _res[0];
          return resolve(response);
        }
      } catch (error) {
        var err_code = {
          status: 500,
          code: 5001,
          message: "Sorry, Internal Server Error!.",
          developerMessage: "Sorry, Internal Server Error!.",
        };
        console.log("Timesheet Error :", error);
        return reject(err_code);
      }
    });
  }
}

module.exports = {
  TimesheetDao,
};
