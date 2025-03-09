const mysql = require('../../common/db_utils');
var debug = require('debug')('v2:users:dao');
const BaseDao = require('./base_dao');

class UserDao extends BaseDao {

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

   
    getUserLogin(connection, userdata) {
        return new Promise(async(resolve, reject)=> {
            try{
                var response ;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                const user_id=userdata.user_id;
                const pwd=userdata.pwd;
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.user_master WHERE user_id='${user_id}' AND 
               pwd='${pwd}'`;
               console.log(custQuery)
              
                let queryres = await connection.query(custQuery);
             
                if(queryres.length == 0) {
                    var empty_response= { status: 404, code: 1001, message: "No record", developerMessage:"No record"};
                   
                    return resolve(empty_response);
                  
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    response = res[0];
                    console.log(response)
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getUserLog Error :', error)
                return reject(err_code);
            }
        })
    }


    getUserList(connection, org_id,branch_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
            var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.User_Master U  INNER JOIN  ${process.env.WRITE_DB_DATABASE}.Branch_Master B on B.branch_id=U.branch_id WHERE  U.user_status='Y' and U.org_id='${org_id}' AND  U.branch_id='${branch_id}'`;
                debug("geUserList", custQuery)
            
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var invoice_lists = [];
                    return resolve(invoice_lists);
                }
                else{
                    return resolve(queryres);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('geUserList error :', error)
                return reject(err_code);
            }
        })
    }


    createUser(connection, user_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.User_Master SET ?`, user_data);
                debug('COMMIT at createUser', user_data);
                return resolve(user_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("create user error :", err);
                return reject(err_code);
            }
        })
    }

    updateUser(connection, set_user_data, user_id) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.User_Master SET ? WHERE user_id='${user_id}' `, set_user_data);
               
                return resolve(set_user_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug("updateUser Error :", err);
                return reject(err_code);
            }
        })
    }

    getUserId(connection, user_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.User_Master U  INNER JOIN  ${process.env.WRITE_DB_DATABASE}.Branch_Master B on B.branch_id=U.branch_id WHERE  U.user_id='${user_id}'`;
                debug("geUserId", custQuery)
               
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, User Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Patient Not Found!.", developerMessage: "Sorry, Patient Not Found!." };
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
                debug('geUserId Error :', error)
                return reject(err_code);
            }
        })
    }

   
    getMenuLists(connection, user_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `select c.menu_id,ifnull(b.access_flag,"N") access_flag
                from ${process.env.WRITE_DB_DATABASE}.Swastha_Role_Menu_Master a inner join ${process.env.WRITE_DB_DATABASE}.User_Access_Master b 
                on a.role_id=b.role_id and b.user_id='${user_id}' 
                right join ${process.env.WRITE_DB_DATABASE}.Swastha_Menu_Master c on a.menu_id=c.menu_id
                order by access_flag`;
                // var custQuery = `select a.menu_id,"Y" as  access_status from ${process.env.WRITE_DB_DATABASE}.Swastha_Role_Menu_Master a, ${process.env.WRITE_DB_DATABASE}.User_Access_Master b
                // where a.role_id=b.role_id and b.user_id='${user_id}'
                // union all
                // select menu_id,"N" as  access_status from ${process.env.WRITE_DB_DATABASE}.Swastha_Menu_Master c
                // where not exists (select 1 from ${process.env.WRITE_DB_DATABASE}.Swastha_Role_Menu_Master e, ${process.env.WRITE_DB_DATABASE}.User_Access_Master f
                // where e.role_id=f.role_id and f.user_id='${user_id}' and  c.menu_id=e.menu_id )`;
                
            
                debug("getMenuLists", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var invoice_lists = [];
                    return resolve(invoice_lists);
                }
                else{
                    return resolve(queryres);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                debug('getPatientInvoiceLists error :', error)
                return reject(err_code);
            }
        })
    }


    getGenerateUserId(connection, branch_id, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT concat(concat(branch_id),LPAD(last_seq_no+1,4,'0')) as user_id ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;
                debug("getGenerateUserId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                        branch_id: branch_id,
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(branch_id),LPAD(0,4,'0')) as user_id ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;

                    debug("getGenerateUserId", newpatientquery)
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
                    debug("Already Have Response", response)
                    await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.Swastha_Seq_Generator SET last_seq_no=${response.last_seq_no} 
                    WHERE  branch_id='${branch_id}' AND seq_type='${seq_type}'`);
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


}

module.exports = {
    UserDao
}