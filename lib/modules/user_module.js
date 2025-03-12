const { UserDao } = require('../dao/user_dao');
var debug = require('debug')('v2:users:module');
const {changeLog} = require('../../common/error_handling');
var moment = require('moment-timezone');
const { GetRandomPatientID } = require('../../common/app_utils');

function generateParamString(query) {
    var key;
    var keys = new Array();
    var values = new Array();

    for (key in query.filter) {
        if (query.filter.hasOwnProperty(key)) {
            keys.push(key);
            values.push(query.filter[key])
        }
    }
    var strParams = '';

    for (i = 0; i < keys.length; i++) {
        var str = (keys.length - 1 != i) ? ' && ' : '';
        strParams += keys[i] + '=' + values[i] + str

    }
    // console.log('Parameters for query :',strParams)
    return strParams;
}

function generateSortOrder(query) {
    var key;
    var keys = new Array();
    var values = new Array();

    for (key in query.sort) {
        if (query.sort.hasOwnProperty(key)) {
            keys.push(key);
            values.push(query.sort[key])
        }
    }
    var strSortParams = ' ORDER BY ';

    for (i = 0; i < keys.length; i++) {
        var order = (values[i] == '-1') ? 'DESC' : 'ASC';
        var str = (keys.length - 1 != i) ? ', ' : '';
        strSortParams += keys[i] + ' ' + order + str
    }

    // console.log('Parameters for Sorting :',strSortParams)
    return strSortParams;
}

class UserModule {

    getUserLoginDetail(data) {
        return new Promise(async (resolve, reject) => {
            var userDao = new UserDao();
            var read_connection = null;
            var get_user; 
            var access_menu;
            var returnResponse;
            var lang;       
            try {
               
                read_connection = await userDao.getReadConnection();
                console.log("Mddule")
                get_user = await userDao.getUserLogin(read_connection, data.user);
                console.log("User Module >>",get_user);
                if (get_user.hasOwnProperty('status') && get_user.status == 404) {
                    if (read_connection) {
                        await userDao.releaseReadConnection(read_connection);
                    }
                    returnResponse = changeLog(get_user.code,lang);
                    return resolve(returnResponse);
                }
                else{
                    debug("Get User Login Details", get_user, );
                    var user_data = await categories_schema_to_data_user(get_user);
                    console.log(user_data);
                    var final_res = { 
                        status: 200, code: 200, 
                        message: "Successfully Login", 
                        developerMessage: "Successfully Login" ,
                        user:user_data
                      
                    };
                    return resolve(final_res);
                }
            }
            catch (error) {
                if (read_connection) {
                    await userDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }


    CreateUser(data,  query) {
        return new Promise(async (resolve, reject) => {
            var userDao = new UserDao();
            var read_connection = null;
            var user_data, set_user_data, user_user;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await userDao.getReadConnection();

               if(data.hasOwnProperty('user_id')) {
                    var get_user_data = await userDao.getUserId(read_connection, data.user_id);
                    if(get_user_data.hasOwnProperty('status')) {
                        set_user_data = await categories_data_to_schema_user_data_to_create(read_connection, data, date);
                        debug("set_user_data", set_user_data)
                        user_data = await userDao.createUser(read_connection, set_user_data);
                        if (read_connection) {
                            await userDao.releaseReadConnection(read_connection);
                        }
                        return resolve(user_data); 
                    }
                    else{
                        user_user = await categories_data_to_schema_user_data_to_update(data, get_user_data, date);
                        user_data = await userDao.updateUser(read_connection, user_user, data.user_id);
                        if (read_connection) {
                            await userDao.releaseReadConnection(read_connection);
                        }
                        return resolve(user_data); 
                    }
                }
                else{
                    set_user_data = await categories_data_to_schema_user_data_to_create(read_connection, data, date);
                    debug("set_user_data", set_user_data)
                    user_data = await userDao.createUser(read_connection, set_user_data);
                    if (read_connection) {
                        await userDao.releaseReadConnection(read_connection);
                    }
                    return resolve(user_data);
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await userDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    GetUserList(org_id,branch_id, query) {
        return new Promise(async(resolve, reject) => {
            var userDao = new UserDao();
            var connection = null;
            var get_users;
            try {
                connection = await userDao.getReadConnection();
                if(query.filter.hasOwnProperty('user_id')) {
                    get_users = await userDao.getUserId(connection, query.filter.user_id);
                }else{
                    get_users = await userDao.getUserList(connection, org_id,branch_id);
                }
                
                if(get_users.hasOwnProperty('status') && get_users.status == 404) {
                    if (connection) {
                        await userDao.releaseReadConnection(connection);
                    }
                    return resolve(get_users);
                }
                else{
                    var total_size = get_users.length;
                    var page_size = get_users.length//query.skip ? query.skip : total_size;
                    var result_size = get_users.length//strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_users
                    }
                    debug("GetUSerList", get_users)
                    if (connection) {
                        await userDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await userDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
}

function generateId(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var userDao = new UserDao();
        var user, user_id;
        
        try{
            user = await userDao.getGenerateUserId(connection,data.branch_id, seq_type);
            if(user != null) {
                user_id = user.user_id;
                return resolve(user_id);
            }
            else{
               return generateId(connection, data, seq_type)
            }
        }
        catch(error) {
            return reject(error)
        }
    })
}

function categories_data_to_schema_user_data_to_create(connection, data, date){
    return new Promise(async(resolve, reject) => {
        try {
           
            var user_id;
            var seq_type = 'USR';
            user_id = await generateId(connection, data, seq_type)
            var pf_start_date=null;
            if(data.hasOwnProperty('pf_start_date') && data.pf_start_date!='' && data.pf_start_date!=null) {                  
                pf_start_date = moment(data.pf_start_date).utc().format("YYYY-MM-DD");
            }
            var dob=null;
            if(data.hasOwnProperty('dob') && data.dob!='' && data.dob!=null) {                  
                dob = moment(data.dob).utc().format("YYYY-MM-DD");
            }
            var doj=null;
            if(data.hasOwnProperty('doj') && data.doj!='' && data.doj!=null) {                  
                doj = moment(data.doj).utc().format("YYYY-MM-DD");
            }
            debug("user_id", user_id)
            var user_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                user_id:user_id, 
                user_name: data.user_name, 
                dob: dob,
                doj: doj,
              
                mobile_no: data.mobile_no,
                home_contact_no: data.home_contact_no,
                residence_address: data.residence_address,
                email_id: data.email_id,
                aadhar_no: data.aadhar_no,
                pan_no: data.pan_no,
                passport: data.passport,
                signature: data.signature,
                bank_account_no: data.bank_account_no,                 
                ifsc_code: data.ifsc_code,
                bank_name: data.bank_name,
                bank_address: data.bank_address,
                attached_branch: data.attached_branch,
                pf_employee: data.pf_employee,
                pf_start_date: pf_start_date,
                pf_number: data.pf_number,
                user_type: data.user_type,
                user_status: data.user_status,
                pwd:  data.pwd,
                updated_by: data.user_id, 
                updated_date: date, 
                created_by: data.user_id, 
                created_date: date
            }
            return resolve(user_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}


function categories_data_to_schema_user_data_to_update(data, get_user_data, date) {
    return new Promise(async(resolve, reject) => {
        var pf_start_date=null;
        if(data.hasOwnProperty('pf_start_date') && data.pf_start_date!='' && data.pf_start_date!=null) {                  
            pf_start_date = moment(data.pf_start_date).utc().format("YYYY-MM-DD");
        }
        var dob;
        if(data.hasOwnProperty('dob') && data.dob!='' && data.dob!=null) {                  
            dob = moment(data.dob).utc().format("YYYY-MM-DD");
        }
        var doj=null;
        if(data.hasOwnProperty('doj') && data.doj!='' && data.doj!=null) {                  
            doj = moment(data.doj).utc().format("YYYY-MM-DD");
        }
        try {
            var user_data = {
               
                user_name: data.hasOwnProperty('user_name')?data.user_name:get_user_data.user_name, 
                dob:dob,
                doj:doj,
                mobile_no: data.hasOwnProperty('mobile_no') ? data.mobile_no : get_user_data.mobile_no,
                home_contact_no: data.hasOwnProperty('home_contact_no') ? data.home_contact_no : get_user_data.home_contact_no,
                residence_address: data.hasOwnProperty('residence_address') ? data.residence_address : get_user_data.residence_address,
                email_id: data.hasOwnProperty('email_id') ? data.email_id : get_user_data.email_id,
                aadhar_no: data.hasOwnProperty('aadhar_no') ? data.aadhar_no : get_user_data.aadhar_no,
                pan_no: data.hasOwnProperty('pan_no') ? data.pan_no : get_user_data.pan_no,
                passport: data.hasOwnProperty('passport') ? data.passport : get_user_data.passport,
                signature: data.hasOwnProperty('signature') ? data.signature : get_user_data.signature,
                bank_account_no: data.hasOwnProperty('bank_account_no') ? data.bank_account_no : get_user_data.bank_account_no,
                ifsc_code: data.hasOwnProperty('ifsc_code') ? data.ifsc_code : get_user_data.ifsc_code,
                bank_name: data.hasOwnProperty('bank_name') ? data.bank_name : get_user_data.bank_name,
                bank_address: data.hasOwnProperty('bank_address') ? data.bank_address : get_user_data.bank_address,
                attached_branch: data.hasOwnProperty('attached_branch') ? data.attached_branch : get_user_data.attached_branch,
                pf_employee: data.hasOwnProperty('pf_employee') ? data.pf_employee : get_user_data.pf_employee,
                pf_start_date: pf_start_date,
                pf_number: data.hasOwnProperty('pf_number') ? data.pf_number : get_user_data.pf_number,
                user_type: data.hasOwnProperty('user_type') ? data.user_type : get_user_data.user_type,
                user_status: data.hasOwnProperty('user_status') ? data.user_status : get_user_data.user_status,
             //   pwd: data.hasOwnProperty('pwd') ? data.user_name : get_user_data.pwd,
                updated_by: data.hasOwnProperty('user_id')?data.user_id:get_user_data.updated_by, 
                updated_date: date
            }
            return resolve(user_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_schema_to_data_user(userdata) {
    return new Promise((resolve, reject) => {
        var categorydata = {
            user_id: userdata.user_id,          
            user_name: userdata.user_name,
            user_status: userdata.user_status,   
            org_id:userdata.org_id,
            branch_id:userdata.branch_id,
            user_type:userdata.user_type        
            
        }
        return resolve(categorydata)
    })
}

module.exports = {
   UserModule
}