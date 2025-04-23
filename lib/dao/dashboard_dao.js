const mysql = require("../../common/db_utils");
var debug = require("debug")("v2:business:dao");
const BaseDao = require("./base_dao");

class DashboardDao extends BaseDao {
  generateSplitResults(connection, table_name) {
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
        var sql_query = `SHOW COLUMNS FROM ${process.env.WRITE_DB_DATABASE}.${table_name}`;
        debug("generateSplitResults :", sql_query);
        let queryres = await connection.query(sql_query);
        return resolve(queryres);
      } catch (err) {
        debug("getCouponDetail :", err);
        var err_code = {
          status: 500,
          code: 5001,
          message: "Sorry, Internal Server Error!.",
          developerMessage: "Sorry, Internal Server Error!.",
        };
        debug("getCouponDetail DB Error ", err);
        return reject(err_code);
      }
    });
  }

  getProductDashboard(connection, filter, org_id) {
    return new Promise(async (resolve, reject) => {
      try {
        var custQuery = "";
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!",
            developerMessage: "DB Connection Failed!",
          };
          return reject(err_code);
        }
        if (filter.type === "productwise") {
          custQuery = `SELECT 
          b.product_name,
          SUM(a.production_qty) AS total_produced_qty,
          SUM(a.damaged_qty) AS total_damaged_qty
          FROM 
              ${process.env.WRITE_DB_DATABASE}.production_data a join product_master b on a.product_id = b.product_id
          where a.production_date Between ${filter.start_date} and ${filter.end_date}
          GROUP BY 
              b.product_name
          `;
        }
        if (filter.type == "employeewise") {
          custQuery = `SELECT 
          b.emp_name,
          SUM(a.production_qty) AS total_produced_qty,
          SUM(a.damaged_qty) AS total_damaged_qty
          FROM 
              ${process.env.WRITE_DB_DATABASE}.production_data a join emp_master b on a.emp_id = b.emp_id
          where a.production_date Between ${filter.start_date} and ${filter.end_date}
          GROUP BY 
              b.emp_name
          `;
        }
        debug("getBusinessbyOrgId", custQuery);
        let queryres = await connection.query(custQuery);
        if (queryres.length == 0) {
          debug("Sorry, Dashboard Data Not Found!.", queryres);
          var error_code = {
            status: 404,
            code: 4001,
            message: "Sorry, Dashboard Data Not Found!.",
            developerMessage: "Sorry, Dashboard Data Not Found!.",
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
        debug("getBusinessbyOrgId Error :", error);
        return reject(err_code);
      }
    });
  }

  getProductionReport(connection, filter, org_id) {
    return new Promise(async (resolve, reject) => {
      try {
        var custQuery = "";
        if (connection == null) {
          var err_code = {
            status: 500,
            code: 5001,
            message: "DB Connection Failed!",
            developerMessage: "DB Connection Failed!",
          };
          return reject(err_code);
        }        
        if (!filter.emp_id) {
          console.log('null')
          filter.emp_id = null;
        }
        if (!filter.product_id) {
          console.log('null')
          filter.product_id = null;
        }

        custQuery = `SELECT a.* , b.emp_name, c.product_name, DATE_FORMAT(a.production_date,'%Y-%m-%d')  as production_date 
          FROM ${process.env.WRITE_DB_DATABASE}.production_data a, ${process.env.WRITE_DB_DATABASE}.emp_master b, ${process.env.WRITE_DB_DATABASE}.product_master c
          where a.production_date Between ${filter.start_date} and ${filter.end_date} 
          and  a.emp_id=b.emp_id and a.product_id=c.product_id
          and a.emp_id = if (${filter.emp_id} is null, a.emp_id , ${filter.emp_id}) 
          and a.product_Id= if (${filter.product_id} is null, a.product_id, ${filter.product_id})
          `;        
        debug("getBusinessbyOrgId", custQuery);
        let queryres = await connection.query(custQuery);
        if (queryres.length == 0) {
          debug("Sorry, Report Data Not Found!.", queryres);
          var error_code = {
            status: 404,
            code: 4001,
            message: "Sorry, Report Data Not Found!.",
            developerMessage: "Sorry, Report Data Not Found!.",
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
        debug("getBusinessbyOrgId Error :", error);
        return reject(err_code);
      }
    });
  }
}

module.exports = {
  DashboardDao,
};
