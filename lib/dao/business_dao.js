const mysql = require('../../common/db_utils');
var debug = require('debug')('v2:business:dao');
const BaseDao = require('./base_dao');

class BusinessDao extends BaseDao {

    generateSplitResults(connection, table_name) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                var sql_query  = `SHOW COLUMNS FROM ${process.env.WRITE_DB_DATABASE}.${table_name}`;
                debug("generateSplitResults :", sql_query);
                let queryres = await connection.query(sql_query);
                return resolve(queryres);
            } catch (err) {
                debug('getCouponDetail :', err)
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getCouponDetail DB Error ', err)
                return reject(err_code);
            }  
        })
    }

    getBusinessbyOrgId(connection, org_id, strPagination) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.business_unit_master WHERE org_id='${org_id}' LIMIT ${strPagination}`;
                debug("getBusinessbyOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Business Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Business Data Not Found!.", developerMessage: "Sorry, Business Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getBusinessbyOrgId Error :', error)
                return reject(err_code);
            }
        })
    }

    getCountBusinessbyOrgId(connection, org_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT COUNT(*) as count FROM ${process.env.WRITE_DB_DATABASE}.business_unit_master WHERE org_id='${org_id}'`;
                debug("getCountAppointmentMobileByBranchId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0].count;
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getCountAppointmentMobileByBranchId Error :', error)
                return reject(err_code);
            }
        })
    }

    GetBusinessDetail(connection, bu_id, org_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.business_unit_master WHERE org_id='${org_id}' AND bu_id='${bu_id}'`;
                debug("getBusinessbyOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Business Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Business Data Not Found!.", developerMessage: "Sorry, Business Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getBusinessbyOrgId Error :', error)
                return reject(err_code);
            }
        })
    }
}

module.exports = {
    BusinessDao
}