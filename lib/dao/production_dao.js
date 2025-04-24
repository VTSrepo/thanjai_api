const mysql = require('../../common/db_utils');
var debug = require('debug')('v2:productions:dao');
const BaseDao = require('./base_dao');

class ProductionDao extends BaseDao {

    getProductions(connection, org_id, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                let input=`p.org_id='${org_id}'`;
                if(query.filter.hasOwnProperty('branch_id') && query.filter.branch_id!=null){
                        input += ` AND p.branch_id = '${query.filter.branch_id}' `;
                 }

                if(query.filter.hasOwnProperty('emp_id') && query.filter.emp_id!=null){
                    input += ` AND p.emp_id = '${query.filter.emp_id}' `;
                }

                if(query.filter.hasOwnProperty('product_id') && query.filter.product_id!=null){
                    input += ` AND p.product_id = '${query.filter.product_id}' `;
                }

                var custQuery = `SELECT p.*, DATE_FORMAT(p.production_date,'%Y-%m-%d')  as production_date,e.emp_name,m.product_name,
                DATE_FORMAT(p.created_date,'%Y-%m-%d')  as created_date, DATE_FORMAT(p.updated_date,'%Y-%m-%d')  as updated_date  FROM ${process.env.WRITE_DB_DATABASE}.production_data p 
                LEFT JOIN ${process.env.WRITE_DB_DATABASE}.emp_master e ON e.emp_id=p.emp_id  
                LEFT JOIN ${process.env.WRITE_DB_DATABASE}.product_master m ON m.product_id=p.product_id 
                WHERE  ${input}`;
                console.log("getProductions", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Production Data Not Found!.');
                    var error_code = { status: 404, code: 4001, message: "Sorry, Production Data Not Found!.", developerMessage: "Sorry, Production Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getProductions Error :', error)
                return reject(err_code);
            }
        })
    }
   

    createProduction(connection, product_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.production_data SET ?`, product_data);
                debug('COMMIT at createProduction', product_data);
                return resolve(product_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("create production error :", err);
                return reject(err_code);
            }
        })
    }

   
    updateProduction(connection, set_product_data, org_id,prod_key) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.production_data SET ? 
                    WHERE org_id='${org_id}'  and prod_key='${prod_key}' `, set_product_data);
                //debug('COMMIT at updateProduct', `UPDATE ${process.env.WRITE_DB_DATABASE}.production_data SET ? WHERE product_id='${product_id}' `, set_product_data);
                return resolve(set_product_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("updateProduct Error :", err);
                return reject(err_code);
            }
        })
    }



    GetProduction(connection, org_id, prod_key) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.production_data 
                WHERE org_id='${org_id}' AND prod_key='${prod_key}'  `;
                console.log("GetProductById", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Product Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Production Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    var _res = JSON.parse(JSON.stringify(queryres));
                    var response = _res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('Get Production Error :', error)
                return reject(err_code);
            }
        })
    }

    getEmployeeDetail(connection, emp_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.emp_master WHERE  emp_id='${emp_id}' `;
                console.log("Employee Details", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Employee Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Employee Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    var _res = JSON.parse(JSON.stringify(queryres));
                    var response = _res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getEmployeeDetail Error :', error)
                return reject(err_code);
            }
        })
    }
    getEmployees(connection, org_id, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                let input=`e.org_id='${org_id}'`;
                if(query.filter.hasOwnProperty('branch_id') && query.filter.branch_id!=null){
                        input += ` AND e.branch_id = '${query.filter.branch_id}' `;
                 }

                if(query.filter.hasOwnProperty('emp_id') && query.filter.emp_id!=null){
                    input += ` AND e.emp_id = '${query.filter.emp_id}' `;
                }
                var custQuery = `SELECT e.*, DATE_FORMAT(e.created_date,'%Y-%m-%d')  as created_date, DATE_FORMAT(e.updated_date,'%Y-%m-%d')  as updated_date, 
                 (SELECT org_name FROM ${process.env.WRITE_DB_DATABASE}.organization_master where  org_id=e.org_id) as org_name,
               (SELECT branch_name FROM ${process.env.WRITE_DB_DATABASE}.branch_master where  branch_id=e.branch_id) as branch_name
               FROM ${process.env.WRITE_DB_DATABASE}.emp_master e WHERE  ${input} ORDER BY e.emp_name`;
               // console.log("getEmployees", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Employee Data Not Found!.');
                    var error_code = { status: 404, code: 4001, message: "Sorry, Employee Data Not Found!.", developerMessage: "Sorry, Production Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getEmployees Error :', error)
                return reject(err_code);
            }
        })
    }


    fetchEmployeeId(connection, branch_id, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }

                var custQuery = `SELECT concat(concat(seq_type,branch_id),LPAD(last_seq_no+1,6,'0')) as emp_id ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;
                console.log("getInvoiceNo", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                        branch_id: branch_id,
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(seq_type,branch_id),LPAD(0,6,'0')) as emp_id ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;

                    console.log("getInvoiceNo", newpatientquery)
                    let queryres_newpatientquery = await connection.query(newpatientquery);
                    if(queryres_newpatientquery.length == 0) {
                        return resolve(null);
                    }
                    else{
                        var _response = JSON.parse(JSON.stringify(queryres_newpatientquery));
                        var newpat_response = _response[0];
                        return resolve(newpat_response);
                    } 
                }
                else{
                    console.log("Already Have")
                    var _res = JSON.parse(JSON.stringify(queryres));
                    var response = _res[0];
                    console.log("Already Have Response", response)
                    await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET last_seq_no=${response.last_seq_no} 
                    WHERE  branch_id='${branch_id}' AND seq_type='${seq_type}'`);
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getInvoiceNo error :', error)
                return reject(err_code);
            }
        })
    }

    fetchProductionId(connection, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }

                var custQuery = `SELECT concat(seq_type,last_seq_no+1) as prod_key ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE  seq_type='${seq_type}'`;
                console.log("getInvoiceNo", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                      
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(seq_type,0) as prod_key ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE seq_type='${seq_type}'`;

                    console.log("getInvoiceNo", newpatientquery)
                    let queryres_newpatientquery = await connection.query(newpatientquery);
                    if(queryres_newpatientquery.length == 0) {
                        return resolve(null);
                    }
                    else{
                        var _response = JSON.parse(JSON.stringify(queryres_newpatientquery));
                        var newpat_response = _response[0];
                        return resolve(newpat_response);
                    } 
                }
                else{
                    console.log("Already Have")
                    var _res = JSON.parse(JSON.stringify(queryres));
                    var response = _res[0];
                    console.log("Already Have Response", response)
                    await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET last_seq_no=${response.last_seq_no} 
                    WHERE   seq_type='${seq_type}'`);
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getInvoiceNo error :', error)
                return reject(err_code);
            }
        })
    }

    createEmployee(connection,employee_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.emp_master SET ?`, employee_data);
                console.log('COMMIT at createEmployee', employee_data);
                return resolve(employee_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create Employee error :", err);
                return reject(err_code);
            }
        })
    }


    updateEmployee(connection, set_employee_data, org_id,branch_id,emp_id) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.emp_master SET ? 
                    WHERE org_id='${org_id}'  and emp_id='${emp_id}' `, set_employee_data);
                console.log('COMMIT at updateProduct', set_employee_data);
                return resolve(set_employee_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("updateEmployee Error :", err);
                return reject(err_code);
            }
        })
    }

 
}

module.exports = {
    ProductionDao
}