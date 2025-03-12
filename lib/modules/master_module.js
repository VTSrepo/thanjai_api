const { MasterDao } = require('../dao/master_dao');
var debug = require('debug')('v2:masters:module');
const {changeLog} = require('../../common/error_handling');
var moment = require('moment-timezone');

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

class MasterModule {

    getReferenceList(ref_type, query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
            var get_reference, get_reference_count;
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            try {
                read_connection = await masterDao.getReadConnection();
                get_reference = await masterDao.getMasterReference(read_connection, ref_type, query, strPagination);
                if (get_reference.hasOwnProperty('status') && get_reference.status == 404) {
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(get_reference);
                }
                else{
                    get_reference_count = await masterDao.getCountMasterReference(read_connection, ref_type, query);

                    var total_size = get_reference_count;
                    var page_size = query.skip ? query.skip : get_reference_count;
                    var result_size = strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                       
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        status: 200, code: 200, 
                        message: "Success", 
                        developerMessage: "Success" ,
                        summary, refences: get_reference
                    }
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(res);
                    
                }
            }
            catch (error) {
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    GetOptholParamList(org_id,param_type, query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
            var get_param;
           // var strSkip = (query.skip ? query.skip : 0);
          //  var strLimit = (query.limit ? query.limit : 2000);
           // var strPagination = strSkip + ',' + strLimit;
            try {
                read_connection = await masterDao.getReadConnection();
                get_param = await masterDao.getOptholParam(read_connection, org_id, param_type, query);
                if (get_param.hasOwnProperty('status') && get_param.status == 404) {
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(get_param);
                }
                else{
                   // get_reference_count = await masterDao.getCountMasterReference(read_connection, ref_type, query);

                    var total_size = get_param.length;
                    var page_size = get_param.length;;
                    var result_size = get_param.length;;
                    console.log("Param Totalsize :", get_param);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_param
                    }
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(res);
                    
                }
            }
            catch (error) {
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    getLabTestLists(query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
            var get_lat_test, get_lat_test_count;
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            try {
                read_connection = await masterDao.getReadConnection();
                get_lat_test = await masterDao.getLabTestLists(read_connection, query, strPagination);
                if (get_lat_test.hasOwnProperty('status') && get_lat_test.status == 404) {
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(get_lat_test);
                }
                else{
                    get_lat_test_count = await masterDao.getCountLabTestLists(read_connection, query);

                    var total_size = get_lat_test_count;
                    var page_size = query.skip ? query.skip : get_lat_test_count;
                    var result_size = strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_lat_test
                    }
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(res);
                    
                }
            }
            catch (error) {
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    fetchVitalParams(query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
           // var adv_payment_data, set_pat_adv_payment_data;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await masterDao.getReadConnection();
                console.log('n modle')                
                //set_pat_adv_payment_data = await categories_data_to_schema_advance_payment_data_to_create(read_connection, data, date);
                var get_vital_params = await masterDao.getVitalParams(read_connection);
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return resolve(get_vital_params);
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }


    GetEOD(query,org_id,branch_id) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
           
            try {
                read_connection = await masterDao.getReadConnection();
                console.log('n modle')                
                //set_pat_adv_payment_data = await categories_data_to_schema_advance_payment_data_to_create(read_connection, data, date);
                var get_eod_params = await masterDao.getEOD(read_connection,org_id,branch_id);
                if(get_eod_params.hasOwnProperty('status') && get_eod_params.status == 404) {
                    if (connection) {
                        await masterDao.releaseReadConnection(connection);
                    }
                    return resolve(get_eod_params);
                }
                else{
                    var total_size = get_eod_params.length;
                    var page_size = get_eod_params.length//query.skip ? query.skip : total_size;
                    var result_size = get_eod_params.length//strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_eod_params
                    }
                    debug("GetEOD", get_eod_params)
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(res)
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    CreateEod(data,  query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
            var eod_data, set_eod_data, update_eod,new_eod_data;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            var old_eod_date,new_eod_date;
            try {
                read_connection = await masterDao.getReadConnection();

                     old_eod_date=data.eod_date;
                     new_eod_date=data.new_eod_date;
                    set_eod_data = await categories_data_to_schema_eod_data_to_create(read_connection, data, date);
                    debug("set_eod_data", set_eod_data)
                   // updateEOD
                   if(data.hasOwnProperty('eod_date')){
                    if(data.eod_date == ""){
                    
                    }else{
                        debug("update", data.eod_date)
                        update_eod = await masterDao.updateEOD(read_connection, data.eod_date);
                    }
                }
                    eod_data = await masterDao.createEOD(read_connection, set_eod_data);
                    
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }

                    generateInventory(data,new_eod_date,old_eod_date)

                    
                    return resolve(eod_data);
                }
            
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }




    // CreateBatchProcessByEOD(data,  query) {
    //     return new Promise(async (resolve, reject) => {
    //         var masterDao = new MasterDao();
    //         var read_connection = null;
    //         var eod_data, set_eod_data, update_eod, update_good_receipt;
    //         var today = new Date();
    //         var date = moment(today).utc().format("YYYY-MM-DD");
    //         try {
    //             read_connection = await masterDao.getReadConnection();

             
                
    //             update_good_receipt = await masterDao.updateGoodReceiptInventory(read_connection, data.org_id, data.branch_id, data.old_previous_date);
                    
                   
    //                 if (read_connection) {
    //                     await masterDao.releaseReadConnection(read_connection);
    //                 }
    //                 return resolve(eod_data);
    //             }
            
    //         catch (error) {
    //             debug("error", error)
    //             if (read_connection) {
    //                 await masterDao.releaseReadConnection(read_connection);
    //             }
    //             return reject(error)
    //         }
    //     })
    // }


    GetBranchList(query,org_id) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
           
            try {
                read_connection = await masterDao.getReadConnection();
                console.log('n modle')                
                //set_pat_adv_payment_data = await categories_data_to_schema_advance_payment_data_to_create(read_connection, data, date);
                var get_branches = await masterDao.getBranches(read_connection,org_id);
                if(get_branches.hasOwnProperty('status') && get_branches.status == 404) {
                    if (connection) {
                        await masterDao.releaseReadConnection(connection);
                    }
                    return resolve(get_branches);
                }
                else{
                    var total_size = get_branches.length;
                    var page_size = get_branches.length//query.skip ? query.skip : total_size;
                    var result_size = get_branches.length//strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_branches
                    }
                    debug("GetEOD", get_branches)
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(res)
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    GetAccountList(org_id,query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
            var get_accounts;
            try {
                read_connection = await masterDao.getReadConnection();
                console.log('n modle')                
                //set_pat_adv_payment_data = await categories_data_to_schema_advance_payment_data_to_create(read_connection, data, date);
                if(query.filter.hasOwnProperty('account_type')) {
                    get_accounts = await masterDao.getAccountsByAccountType(read_connection,org_id, query.filter.account_type);
                }else{
                    get_accounts = await masterDao.getAccounts(read_connection,org_id);
                }
                if(get_accounts.hasOwnProperty('status') && get_accounts.status == 404) {
                    if (connection) {
                        await masterDao.releaseReadConnection(connection);
                    }
                    return resolve(get_accounts);
                }
                else{
                    var total_size = get_accounts.length;
                    var page_size = get_accounts.length//query.skip ? query.skip : total_size;
                    var result_size = get_accounts.length//strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_accounts
                    }
                    debug("get Accounts", get_accounts)
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(res)
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

  CreateAccount(data,  query) {
        return new Promise(async (resolve, reject) => {
            var masterDao = new MasterDao();
            var read_connection = null;
            var master_data, set_master_data, user_master;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await masterDao.getReadConnection();

              
                if(data.hasOwnProperty('account_code') && (data.account_code != null && data.account_code.length >3)) {
                    var get_master_data = await masterDao.getAccountDetail(read_connection, data.account_code);
                    if(get_master_data.hasOwnProperty('status')) {
                        set_master_data = await categories_data_to_schema_master_to_create(read_connection, data, date);
                        debug("get_master_data", set_master_data)
                        master_data = await masterDao.createAccount(read_connection, set_master_data);
                        if (read_connection) {
                            await masterDao.releaseReadConnection(read_connection);
                        }
                        return resolve(master_data); 
                    }
                    else{
                        user_master = await categories_data_to_schema_master_to_update(data, get_master_data, date);
                        master_data = await masterDao.updateAccount(read_connection, user_master, data.account_code);
                        if (read_connection) {
                            await masterDao.releaseReadConnection(read_connection);
                        }
                        return resolve(master_data); 
                    }
                }
                else{
                    set_master_data = await categories_data_to_schema_master_to_create(read_connection, data, date);
                    debug("set_doctor_data", set_master_data)
                    master_data = await masterDao.createAccount(read_connection, set_master_data);
                    if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
                    return resolve(master_data);
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await masterDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }
   
}






function generateInventory (data, new_eod_date,old_eod_date){
    return new Promise(async(resolve, reject) => {
        var read_connection = null;
        var masterDao = new MasterDao();
        debug("******>Start --->", new_eod_date)
        try {
      
            read_connection = await masterDao.getReadConnection();
           

            
           /* 1 ====================================================================
                    Goods Receipt update  (  Incoming Inventory )
                    Parameters : org_id,branch_id, old_eod_date ( Example 2022-11-01
                    ======================================================================= */
                    debug("******>generateInventory", new_eod_date)
                var dailyInventoryList=  await masterDao.getDailyInventoryList(read_connection, data.org_id, data.branch_id, old_eod_date);
                    //Loop
                    for(var i in dailyInventoryList) {
                        var product_id = dailyInventoryList[i].product_id;
                        debug("Product Id ->", product_id);
                        var receivedQty=  await masterDao.getDailyInventoryReceivedQty(read_connection, data.org_id, data.branch_id, old_eod_date,product_id); 
                        debug("Receive QTY ->", receivedQty);
                        var invoicedQty=  await masterDao.getDailyInventoryInvoicedQty(read_connection,data.org_id, data.branch_id, old_eod_date,product_id); 
                        debug("Invoice QTY ->", invoicedQty);
                        await masterDao.updateDailyInventory(read_connection,data.org_id, data.branch_id, old_eod_date,product_id,receivedQty,invoicedQty)
                    }
                //End Loop
                  // var eod_data = await masterDao.updateGoodReceiptInventory(read_connection, data.org_id, data.branch_id, old_eod_date);
                   //var  update_good_receipt =
                 /* 2====================================================================
                    Invoice update (Sold)   (  outgoing Inventory )
                    Parameters : org_id,branch_id, old_eod_date ( Example 2022-11-01)
                    ======================================================================= */
                  //  var eod_data = await masterDao.updateInvoiceInventory(read_connection, data.org_id, data.branch_id,old_eod_date);
                    //var  update_invoice_inventory =
                  /* 3  =======================================================================================
                    Invoice update (Sold)   (  outgoing Inventory )  -   For Mapped product like Dialysis
                    Parameters : org_id,branch_id, old_eod_date ( Example 2022-11-01)
                    =========================================================================================*/
                   // var eod_data = await masterDao.updateInvoiceProductInventory(read_connection, data.org_id, data.branch_id, old_eod_date);        
                    // var  update_invoice_product_inventory =
                 /* 4 ====================================================================
                    Invoice closing stock
                    Parameters : org_id,branch_id, old_eod_date 
                    =======================================================================*/
                    var eod_data = await masterDao.updateInvoiceCloseStockInventory(read_connection, data.org_id, data.branch_id, old_eod_date); 
                    //var  update_invoice_close_stock =       
                   /*5 ====================================================================
                    Creating Inventory Base for New EOD Date & setting opening balance
                    Parameters : org_id,branch_id, new_eod_date,old_eod_date
                    ====================================================================*/
                     var eod_data = await masterDao.createInventoryBase(read_connection, data.org_id, data.branch_id,new_eod_date, old_eod_date);        
                     if (read_connection) {
                        await masterDao.releaseReadConnection(read_connection);
                    }
            return resolve(eod_data)
        }
        catch (error) {
            debug("******>Error Inventory --->", error)
            if (read_connection) {
                await masterDao.releaseReadConnection(read_connection);
            }
            return resolve(error);    
        }
    })
}




function categories_data_to_schema_eod_data_to_create(connection, data, date){
    return new Promise(async(resolve, reject) => {
        try {
           
            var eod_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                eod_date:data.new_eod_date, 
                active_flag: "Y", 
                updated_by: data.user_id, 
                updated_date: date, 
                created_by: data.user_id, 
                created_date: date
            }
            return resolve(eod_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function generateMaxAccountCode(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var masterDao = new MasterDao();
        var get_payment_data, account_code;
        var org_id = `${data.org_id}`
        try{
            get_payment_data = await masterDao.generateMaxAccountCode(connection,org_id, seq_type);
            if(get_payment_data != null) {
                account_code = get_payment_data.account_code;
                return resolve(account_code);
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

function categories_data_to_schema_master_to_create(connection, data,  date){
    return new Promise(async(resolve, reject) => {
        try {
            var account_code;
            var seq_type = `ACC${data.account_type}`;
            account_code = await generateMaxAccountCode(connection, data, seq_type)
            var account_data = {
                org_id: data.org_id, 
                account_type: data.account_type, 
                account_code: account_code, 
                account_desc: data.account_desc, 
                active_flag: (data.active_flag)?data.active_flag:"Y", 
                updated_by: (data.hasOwnProperty('user_id'))?data.user_id:null, 
                updated_date: date, 
                created_by: (data.hasOwnProperty('user_id'))?data.user_id:null, 
                created_date: date
            }
            return resolve(account_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_master_to_update(data, get_master_data, date){
    return new Promise(async(resolve, reject) => {
        try {
         
            var account_data = {
                account_desc: data.hasOwnProperty('account_desc')?data.account_desc:get_master_data.account_desc,
                active_flag:  data.hasOwnProperty('active_flag')?data.active_flag:get_master_data.active_flag,
                updated_by : (data.hasOwnProperty('user_id'))?data.user_id:null,  
                updated_date: date
                
            }
            return resolve(account_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

module.exports = {
   MasterModule
}