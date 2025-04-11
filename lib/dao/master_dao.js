const mysql = require('../../common/db_utils');
var debug = require('debug')('v2:masters:dao');
const BaseDao = require('./base_dao');

class MasterDao extends BaseDao {

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

    getMasterReference(connection, ref_type, query, strPagination) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                if(query.filter.ref_code) {
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master WHERE ref_type='${ref_type}' AND ref_code='${query.filter.ref_code}' 
                    LIMIT ${strPagination}`;
                }
                else{
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master WHERE ref_type='${ref_type}' LIMIT ${strPagination}`; 
                }
                debug("getMasterReference", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Data Not Available!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Data Not Available!.", developerMessage: "Data Not Available!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getMasterReference error :', error)
                return reject(err_code);
            }
        })
    }

    getCountMasterReference(connection, ref_type, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                if(query.filter.ref_code) {
                    custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master WHERE ref_type='${ref_type}' AND ref_code='${query.filter.ref_code}'`;
                }
                else{
                    custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master WHERE ref_type='${ref_type}'`; 
                }
                debug("getCountMasterReference", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
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
                debug('getCountMasterReference error :', error)
                return reject(err_code);
            }
        })
    }

    getOptholParam(connection, org_id, param_type, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                if(query.filter.param_code) {
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Opthol_Param_Master WHERE org_id='${org_id}' AND param_type='${param_type}' AND param_code='${query.filter.param_code}'`;
                    
                }
                else{
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Opthol_Param_Master WHERE org_id='${org_id}' AND param_type='${param_type}' `;
                }
               
                let queryres = await connection.query(custQuery);
                debug("getOptholParam", queryres)
                if(queryres.length == 0) {
                    debug('Data Not Available!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Data Not Available!.", developerMessage: "Data Not Available!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getOptholParam error :', error)
                return reject(err_code);
            }
        })
    }

    getLabTestLists(connection, query, strPagination) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                if(query.filter.branch_id) {
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master WHERE branch_id='${query.filter.branch_id}'  
                    LIMIT ${strPagination}`;
                }
                else if(query.filter.org_id) {
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master WHERE org_id='${query.filter.org_id}' 
                    LIMIT ${strPagination}`;
                }
                else if(query.filter.test_id) {
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master WHERE test_id='${query.filter.test_id}' 
                    LIMIT ${strPagination}`;
                }
                else{
                    custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master`; 
                }
                debug("getLabTestLists", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Data Not Available!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Data Not Available!.", developerMessage: "Data Not Available!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getLabTestLists error :', error)
                return reject(err_code);
            }
        })
    }



    getCountLabTestLists(connection, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                if(query.filter.branch_id) {
                    custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master WHERE branch_id='${query.filter.branch_id}'`;
                }
                else if(query.filter.org_id) {
                    custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master WHERE org_id='${query.filter.org_id}'`;
                }
                else if(query.filter.test_id) {
                    custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master WHERE test_id='${query.filter.test_id}'`;
                }
                else{
                    custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.Lab_Test_Master`; 
                }
                debug("getCountLabTestLists", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
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
                debug('getCountLabTestLists error :', error)
                return reject(err_code);
            }
        })
    }

    getVitalParams(connection) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                //console.log('in dao');
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Patient_Key_Health_Param_Master`;
                console.log(custQuery);
                let queryres = await connection.query(custQuery);
                if (queryres.length == 0) {
                    debug('Sorry, Details Not Found!.', queryres);
                    return resolve(null)
                }
                else {
                    var _response = JSON.parse(JSON.stringify(queryres));
                    var response = _response;
                    console.log(response);
                    return resolve(response);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                debug("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }



    getEOD(connection,org_id,branch_id) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                //console.log('in dao');
                var custQuery = `SELECT DATE_FORMAT(eod_date,'%Y-%m-%d') as eod_date, org_id, branch_id, active_flag FROM ${process.env.WRITE_DB_DATABASE}.vts_eod_ops where active_flag='Y' and org_id='${org_id}' AND  branch_id='${branch_id}'`;
                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var invoice_lists = [];
                    return resolve(invoice_lists);
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                debug("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    getBranches(connection,org_id,query) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }

                let input=`org_id='${org_id}'`;
                if(query.filter.hasOwnProperty('branch_type') && query.filter.branch_type!=null){
                        input += ` AND branch_type = '${query.filter.branch_type}' `;
                }
                //console.log('in dao');
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.branch_master where ${input}`;
                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 404, code: 4001, message: "Sorry, Branch Data Not Found!.", developerMessage: "Sorry, Branch Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                debug("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }
    getCategoryList(connection,query) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }

                // let input=`org_id='${org_id}'`;
                // if(query.filter.hasOwnProperty('branch_type') && query.filter.branch_type!=null){
                //         input += ` AND branch_type = '${query.filter.branch_type}' `;
                // }
                //console.log('in dao');
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.category_master `;
                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 404, code: 4001, message: "Sorry, Category Data Not Found!.", developerMessage: "Sorry, Category Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                debug("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

   
    getAccounts(connection,org_id) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                //console.log('in dao');
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.account_master where org_id='${org_id}' `;
                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 404, code: 4001, message: "Sorry, Account Data Not Found!.", developerMessage: "Sorry, Account Data Not Found!." };
                    return resolve(error_code)
                 
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                debug("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    getAccountsByAccountType(connection,org_id,account_type) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                //console.log('in dao');
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.account_master where org_id='${org_id}'  and account_type='${account_type}'`;
                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var invoice_lists = [];
                    return resolve(invoice_lists);
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                debug("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }
    
    createEOD(connection, eod_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_eod_ops SET ?`, eod_data);
                debug('COMMIT at createEOD', eod_data);
                return resolve(eod_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("create createEOD error :", err);
                return reject(err_code);
            }
        })
    }


  
    updateEOD(connection,  eod_date) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.vts_eod_ops SET active_flag='C' WHERE eod_date='${eod_date}' `);
               
                return resolve(eod_date);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("updateEOD Error :", err);
                return reject(err_code);
            }
        })
    }

    
    getCategoryDetail(connection, category_code) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.category_master WHERE category_code='${category_code}'`;
                debug("getCategoryDetail", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Account Not Available!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Category Not Available!.", developerMessage: "Sorry, Category Not Available!." };
                    return resolve(error_code)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getAccountDetail Error :', error)
                return reject(err_code);
            }
        })
    }

    createCategory(connection, category_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                console.log("Category Dao");
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.category_master SET ?`, category_data);
               return resolve(category_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("createCategory error :", err);
                return reject(err_code);
            }
        })
    }

    updateCategory(connection, set_category_data, category_code) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.category_master SET ? WHERE category_code='${category_code}' `, set_category_data);
               
                return resolve(set_category_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("updateAccount Error :", err);
                return reject(err_code);
            }
        })
    }
    getAccountDetail(connection, account_code) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Account_Master WHERE account_code='${account_code}'`;
                debug("getAccountDetail", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Account Not Available!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Account Not Available!.", developerMessage: "Sorry, Account Not Available!." };
                    return resolve(error_code)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getAccountDetail Error :', error)
                return reject(err_code);
            }
        })
    }

    createAccount(connection, account_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.account_master SET ?`, account_data);
                debug('COMMIT at createAccount', account_data);
                return resolve(account_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("createAccount error :", err);
                return reject(err_code);
            }
        })
    }

    updateAccount(connection, set_account_data, account_code) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.account_master SET ? WHERE account_code='${account_code}' `, set_account_data);
               
                return resolve(set_account_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("updateAccount Error :", err);
                return reject(err_code);
            }
        })
    }
   
    generateMaxAccountCode(connection, org_id, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }

                var custQuery = `SELECT concat(concat(branch_id,seq_type),LPAD(last_seq_no+1,4,'0')) as account_code ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator WHERE branch_id='${org_id}' AND seq_type='${seq_type}'`;
                debug("getInvoiceNo", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                        branch_id: org_id,
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(branch_id,seq_type),LPAD(1,4,'0')) as account_code ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator WHERE branch_id='${org_id}' AND seq_type='${seq_type}'`;

                    debug("getInvoiceNo", newpatientquery)
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
                    debug("Already Have")
                    var _res = JSON.parse(JSON.stringify(queryres));
                    var response = _res[0];
                    debug("Already Have Response", response, response.last_seq_no, org_id, seq_type)
                    await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator SET last_seq_no=${response.last_seq_no} 
                    WHERE  branch_id='${org_id}' AND seq_type='${seq_type}'`);
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getInvoiceNo error :', error)
                return reject(err_code);
            }
        })
    }


    fetchCategoryId(connection,  seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }

                var custQuery = `SELECT concat(seq_type,LPAD(last_seq_no+1,6,'0')) as category_code ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE seq_type='${seq_type}'`;
                console.log("fetchCategoryId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                    
                        last_seq_no: 0,
                        branch_pad: 'N'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(seq_type,LPAD(0,6,'0')) as category_code ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE  seq_type='${seq_type}'`;

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

    // getDailyInventoryList(connection,org_id,branch_id,old_eod_date) {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             if (connection == null) {
    //                 var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
    //                 return reject(err_code)
    //             }
    //             //console.log('in dao');
    //             var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Daily_inventory where org_id='${org_id}'  and branch_id='${branch_id}' and trans_date='${old_eod_date}'`;
    //             console.log(custQuery);
                
    //             let queryres = await connection.query(custQuery);
    //             if(queryres.length == 0) {
    //                 var invoice_lists = [];
    //                 return resolve(invoice_lists);

    //             }
    //             else{
    //                 return resolve(queryres);
    //             }
    //         }
    //         catch (err) {
    //             console.log(err);
    //             var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
    //             debug("getDailyInventoryList :", err);
    //             return reject(err_code);
    //         }
    //     })
    // }


    // getDailyInventoryReceivedQty(connection,org_id,branch_id,old_eod_date,product_id) {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             if (connection == null) {
    //                 var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
    //                 return reject(err_code)
    //             }
    //             //console.log('in dao');
    //             var custQuery = `SELECT sum(if(isnull(gr_qty_received),0,gr_qty_received)) as received_qty  
    //             FROM ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt where org_id='${org_id}'  and branch_id='${branch_id}' 
    //             and receipt_date='${old_eod_date}' and Item_code='${product_id}'`;
    //             console.log(custQuery);
                
    //             let queryres = await connection.query(custQuery);
    //             if(queryres.length == 0) {
    //                // var invoice_lists = [];
    //                 return resolve(0);

    //             }
    //             else{
    //                 var _response = JSON.parse(JSON.stringify(queryres));
    //                 var response = _response[0].received_qty;
    //                 return resolve(response);
    //             }
    //         }
    //         catch (err) {
    //             console.log(err);
    //             var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
    //             debug("getDailyInventoryList :", err);
    //             return reject(err_code);
    //         }
    //     })
    // }

    // getDailyInventoryInvoicedQty(connection,org_id,branch_id,old_eod_date,product_id) {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             if (connection == null) {
    //                 var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
    //                 return reject(err_code)
    //             }
                

    //             var custQuery = `Select sum(if(isnull(product_qty),0,product_qty)) as Invoiced_qty  
    //             from ${process.env.WRITE_DB_DATABASE}.Billing_Detail a, ${process.env.WRITE_DB_DATABASE}.Billing_Header b 
    //             where a.org_id='${org_id}' and a.branch_id='${branch_id}' 
    //             and a.org_id=b.org_id and a.branch_id=b.branch_id and a.invoice_no=b.invoice_no 
    //             and  b.inv_date='${old_eod_date}'  and a.product_id='${product_id}'`;
    //             let queryres = await connection.query(custQuery);
    //             if(queryres.length == 0) {
    //                // var invoice_lists = [];
    //                 return resolve(0);

    //             }
    //             else{
    //                 var _response = JSON.parse(JSON.stringify(queryres));
    //                 var response = _response[0].Invoiced_qty;
    //                 return resolve(response);
    //             }
    //         }
    //         catch (err) {
    //             console.log(err);
    //             var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
    //             debug("getDailyInventoryInvoicedQty :", err);
    //             return reject(err_code);
    //         }
    //     })
    // }

    // updateDailyInventory(connection,org_id, branch_id, old_eod_date,product_id,receivedQty,invoicedQty){

    //     return new Promise(async(resolve, reject) => {
    //         try {
    //             if(connection == null ) {
    //                 var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
    //                 return reject (err_code)
    //             }
    //             await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.Swastha_Daily_inventory  set received_stock = ${receivedQty},  sold_stock=${invoicedQty} where org_id='${org_id}' and branch_id='${branch_id}' and trans_date='${old_eod_date}' and product_id='${product_id}'`);
    //             return resolve(product_id);
    //         }
    //         catch (err) {
    //             var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
    //             debug("updateAccount Error :", err);
    //             return reject(err_code);
    //         }
    //     })
    // }
   
}

module.exports = {
    MasterDao
}