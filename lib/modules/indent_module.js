const { IndentDao } = require('../dao/indent_dao');
var debug = require('debug')('v2:indent:module');

var moment = require('moment-timezone');
const { GetRandomPatientID } = require('../../common/app_utils');

const e = require('cors');

class IndentModule {

    createIndentData(data,  query) {
        return new Promise(async (resolve, reject) => {
            var indentDao = new IndentDao();
            var read_connection = null;
            var indent_header_data, set_indent_detail, user_indent_header, eoddata;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            var eod_date;
            try {
                read_connection = await indentDao.getReadConnection();
                // eoddata = await indentDao.getEOD(read_connection,data.org_id,data.branch_id);
                // if(eoddata.length>=1) {
                //     eod_date = eoddata[0].eod_date;
                // }
                // else{
                //     eod_date = date;
                // }
                //console.log(eod_date);
                if(data.hasOwnProperty('indent_number')) {
                    var get_indent_number_data = await indentDao.getIndentNumber(read_connection, data.indent_number);
                    if(get_indent_number_data.hasOwnProperty('status')) {
                        user_indent_header = await categories_data_to_schema_indent_header_data_to_create(read_connection, data, date, eod_date);
                        console.log("EOD :", user_indent_header);
                        indent_header_data = await indentDao.createIndentHeader(read_connection, user_indent_header);
                        set_indent_detail = await InitIndentDetail(read_connection, data, user_indent_header, date);
                        if (read_connection) {
                            await indentDao.releaseReadConnection(read_connection);
                        }
                        return resolve(indent_header_data); 
                    }
                    else{
                        user_indent_header = await categories_data_to_schema_indent_header_data_to_update(data, get_indent_number_data, date);
                        indent_header_data = await indentDao.updateIndentHeader(read_connection, user_indent_header, get_indent_number_data.indent_number);
                        var get_indent_header_detail_data = await indentDao.GetIndentDetails(read_connection, data.org_id, data.branch_id, data.indent_number);
                        if(get_indent_header_detail_data == null) {
                            set_indent_detail = await InitIndentDetail(read_connection, data, user_indent_header, date);
                            if (read_connection) {
                                await indentDao.releaseReadConnection(read_connection);
                            }
                            return resolve(indent_header_data); 
                        }
                        else{
                            set_indent_detail = await UpdateIndentDetail(read_connection, data, user_indent_header, date, get_indent_header_detail_data);
                            if (read_connection) {
                                await indentDao.releaseReadConnection(read_connection);
                            }
                            return resolve(indent_header_data);  
                        }
                    }
                }
                else{
                    user_indent_header = await categories_data_to_schema_indent_header_data_to_create(read_connection, data, date, eod_date);
                    console.log("Indent Header :");
                    indent_header_data = await indentDao.createIndentHeader(read_connection, user_indent_header);
                    set_indent_detail = await InitIndentDetail(read_connection, data, user_indent_header, date);
                    if (read_connection) {
                        await indentDao.releaseReadConnection(read_connection);
                    }
                    var res={
                        "status": 200,
                        "code": 200,
                        "message": "Success",
                        "developerMessage": "Success",
                        "indent":indent_header_data
                    }
                    
                    console.log("Res*********",res);

                    return resolve(res);
                }
            }
            catch (error) {
                console.log("Error in error", error)
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }


   indentSubmission(data,  query) {
        return new Promise(async (resolve, reject) => {
            var indentDao = new IndentDao();
            var read_connection = null;
           var set_indent_detail=null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await indentDao.getReadConnection();                   
                       
                        set_indent_detail = await InitIndentSubmission(read_connection, data,  date);
                        if (read_connection) {
                            await indentDao.releaseReadConnection(read_connection);
                        }
                        return resolve(set_indent_detail); 
                   
              
            }
            catch (error) {
                console.log("Error in error", error)
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    GetIndentList(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indents, get_indent_count;
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                if(query.filter.hasOwnProperty('status') && query.filter.hasOwnProperty('branch_id')  && query.filter.hasOwnProperty('kitchen_id') && query.filter.hasOwnProperty('indent_number') && query.filter.status!=null && query.filter.branch_id!=null && query.filter.kitchen_id!=null && query.filter.indent_number!=null) {
                
                }else if(query.filter.hasOwnProperty('status') && query.filter.hasOwnProperty('kitchen_id') && query.filter.hasOwnProperty('indent_number') && query.filter.status!=null && query.filter.branch_id!=null && query.filter.kitchen_id!=null && query.filter.indent_number!=null) {
                }else if(query.filter.hasOwnProperty('status') && query.filter.status!=null  ) {
                    get_indents = await indentDao.GetIndentListByStatus(connection, org_id,query.filter.status);
                }else{
                    get_indents = await indentDao.GetIndentListByOrgId(connection, org_id);
                }
                if(get_indents.hasOwnProperty('status') && get_indents.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indents);
                }
                else{
                    // for(var i in get_indent) {
                    //     var indent_number = get_indent[i].indent_number;
                    //     var detail_list = await indentDao.GetIndentDetailList(connection, query, indent_number);
                    //     if(detail_list == null) {
                    //         var empty_array = [];
                    //         get_indent[i]["indent_details"] = empty_array;
                    //     }
                    //     else{
                    //         get_indent[i]["indent_details"] = detail_list;
                    //     }
                    }
                   

                    var total_size = get_indents.length;
                    var page_size = get_indents.length//query.skip ? query.skip : total_size;
                    var result_size = get_indents.length//strLimit;
                   // console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        "status": 200,
                        "code": 200,
                        "message": "Success",
                        "developerMessage": "Success",
                        summary, indents: get_indents
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
    

    GetIndentListsByOrgId(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            //var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent, get_indent_count;
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indent = await indentDao.GetIndentListsByOrgId(connection, org_id, query, strPagination);
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                   // get_indent_count = await indentDao.getCountIndentByOrgId(connection, org_id, query);
                    for(var i in get_indent) {
                        var indent_number = get_indent[i].indent_number;
                        var detail_list = await indentDao.GetIndentDetailList(connection, query, indent_number);
                        if(detail_list == null) {
                            var empty_array = [];
                            get_indent[i]["indent_details"] = empty_array;
                        }
                        else{
                            get_indent[i]["indent_details"] = detail_list;
                        }
                    }
                   

                    var total_size = get_indent.length;
                    var page_size = get_indent.length//query.skip ? query.skip : total_size;
                    var result_size = get_indent.length//strLimit;
                  //  var total_size = get_indent_count;
                  //  var page_size = query.skip ? query.skip : get_indent_count;
                   // var result_size = strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    GetIndentDetail(indent_number, org_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var get_indent;
            try {
                connection = await indentDao.getReadConnection();
                get_indent = await indentDao.getIndentNumber(connection, indent_number,org_id);
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                    console.log("GetIndentDetail", get_indent)
                    var detail_list = await indentDao.GetIndentDetailList(connection, query, indent_number);
                    if(detail_list == null) {
                        var empty_array = [];
                        get_indent["indent_details"] = empty_array;
                    }
                    else{
                        get_indent["indent_details"] = detail_list;
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }


    GetSupplierList(org_id,branch_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var get_supplier;
            try {
                connection = await indentDao.getReadConnection();
                get_supplier = await indentDao.getSupplierList(connection, org_id,branch_id);
                if(get_supplier.hasOwnProperty('status') && get_supplier.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_supplier);
                }
                else{
                    var total_size = get_supplier.length;
                    var page_size = get_supplier.length//query.skip ? query.skip : total_size;
                    var result_size = get_supplier.length//strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_supplier
                    }
                    console.log("get_indent", get_supplier)
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    GetSupplierProductList(branch_id,kitchen_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var get_supplier_product;
            try {
                connection = await indentDao.getReadConnection();
                get_supplier_product = await indentDao.getSupplierProductList(connection, branch_id, kitchen_id);
                if(get_supplier_product.hasOwnProperty('status') && get_supplier_product.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_supplier_product);
                }
                else{
                    var total_size = get_supplier_product.length;
                    var page_size = get_supplier_product.length//query.skip ? query.skip : total_size;
                    var result_size = get_supplier_product.length//strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_supplier_product
                    }
                    console.log("get_indent", get_supplier_product)
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    indentGoodsReceipt(data,  query) {
        return new Promise(async (resolve, reject) => {
            var indentDao = new IndentDao();
            var read_connection = null;
            var set_indent_goods=null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await indentDao.getReadConnection();                   
                       
                set_indent_goods = await InitIndentGoods(read_connection, data,  date);
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return resolve({indent_goods_receipts: set_indent_goods}); 
                   
              
            }
            catch (error) {
                console.log("Error in error", error)
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    GetGoodReceiptList(org_id,branch_id,kitchen_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent, get_indent_count;
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
               

                get_indent = await indentDao.getGoodreceiptList(connection, org_id,branch_id,kitchen_id,query.filter.indent_number,query.filter.item_code);
                // if(query.filter.hasOwnProperty('indent_number')) {
           
                //     get_indent = await indentDao.GetIndentListsByStatus(connection, branch_id,kitchen_id,query.filter.indent_number);
                // }else{
                //  get_indent = await indentDao.GetIndentListsByBranchId(connection, branch_id,kitchen_id);
                // }
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                    
                   

                    var total_size = get_indent.length;
                    var page_size = get_indent.length//query.skip ? query.skip : total_size;
                    var result_size = get_indent.length//strLimit;
                    // get_indent_count = await indentDao.getCountIndentByBranchId(connection, branch_id, query);
                    // var total_size = get_indent_count;
                    // var page_size = query.skip ? query.skip : get_indent_count;
                    // var result_size = strLimit;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    GetIndentSupplierScheduleList(org_id,branch_id,kitchen_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent, get_indent_count;
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indent = await indentDao.GetIndentSupplierScheduleList(connection, org_id,branch_id,kitchen_id,query);
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                    var total_size = get_indent.length;
                    var page_size = get_indent.length;
                    var result_size = get_indent.length;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    CreateIndentSuppScheduleList(data,  query) {
        return new Promise(async (resolve, reject) => {
            var indentDao = new IndentDao();
            var read_connection = null;
            var create_indent_supplier_payment=null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await indentDao.getReadConnection();                   
                       
                create_indent_supplier_payment = await InitIndentSupplierPayment(read_connection, data,  date);
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return resolve(create_indent_supplier_payment);
            }
            catch (error) {
                console.log("Error in error", error)
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    CreateReceiptsPayments(data,  query) {
        return new Promise(async (resolve, reject) => {
            var indentDao = new IndentDao();
            var read_connection = null;
            var create_receipts_payments=null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await indentDao.getReadConnection();                   
                       
                create_receipts_payments = await CreateReceiptspayments(read_connection, data,  date);
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return resolve(create_receipts_payments);
            }
            catch (error) {
                console.log("Error in CreateReceiptsPayments", error)
                if (read_connection) {
                    await indentDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }
    GetReceiptsPayments(org_id,branch_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;         
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent, get_indent_count;
            var from_date = moment(query.filter.from_date).utc().format("YYYY-MM-DD");
            var to_date = moment(query.filter.to_date).utc().format("YYYY-MM-DD");
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indent = await indentDao.GetReceiptPayments(connection, org_id,branch_id,query.filter.account_type,from_date,to_date,query);
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                    var total_size = get_indent.length;
                    var page_size = get_indent.length;
                    var result_size = get_indent.length;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    GetIndentSupplierPayments(org_id,branch_id,kitchen_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;         
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent, get_indent_count;
          
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indent = await indentDao.GetIndentSupplierPayments(connection, org_id,branch_id,kitchen_id,query.filter.indent_number,query.filter.supp_inv_number,query);
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                    var total_size = get_indent.length;
                    var page_size = get_indent.length;
                    var result_size = get_indent.length;
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }


    GetGoodReceiptReindentrtList(org_id,branch_id,query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent_goods_receipt_reindentrt, get_indent_count;
            var from_date = moment(query.filter.from_date).utc().format("YYYY-MM-DD");
            var to_date = moment(query.filter.to_date).utc().format("YYYY-MM-DD")
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indent_goods_receipt_reindentrt = await indentDao.GetGoodReceiptReindentrtList(connection, org_id,branch_id,from_date, to_date);
                if(get_indent_goods_receipt_reindentrt.hasOwnProperty('status') && get_indent_goods_receipt_reindentrt.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent_goods_receipt_reindentrt);
                }
                else{
                    var total_size = get_indent_goods_receipt_reindentrt.length;
                    var page_size = get_indent_goods_receipt_reindentrt.length
                    var result_size = get_indent_goods_receipt_reindentrt.length
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent_goods_receipt_reindentrt
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    GetSupplierPaymentReindentrtList(org_id,branch_id,query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_supplier_payment_reindentrt;
            var from_date = moment(query.filter.from_date).utc().format("YYYY-MM-DD");
            var to_date = moment(query.filter.to_date).utc().format("YYYY-MM-DD")
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_supplier_payment_reindentrt = await indentDao.GetSupplierPaymentReindentrtList(connection, org_id,branch_id,from_date, to_date);
                if(get_supplier_payment_reindentrt.hasOwnProperty('status') && get_supplier_payment_reindentrt.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_supplier_payment_reindentrt);
                }
                else{
                    var total_size = get_supplier_payment_reindentrt.length;
                    var page_size = get_supplier_payment_reindentrt.length
                    var result_size = get_supplier_payment_reindentrt.length
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_supplier_payment_reindentrt
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    GetIndentInvoiceSummaryReindentrtList(org_id,branch_id,query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indent_summary_reindentrt;
            var from_date = moment(query.filter.from_date).utc().format("YYYY-MM-DD");
            var to_date = moment(query.filter.to_date).utc().format("YYYY-MM-DD")
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indent_summary_reindentrt = await indentDao.GetIndentInvoiceSummaryReindentrtList(connection, org_id,branch_id,from_date,to_date);
                if(get_indent_summary_reindentrt.hasOwnProperty('status') && get_indent_summary_reindentrt.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent_summary_reindentrt);
                }
                else{
                 

                 for(var i in get_indent_summary_reindentrt) {
                    var kitchen_id = get_indent_summary_reindentrt[i].kitchen_id;
                    var   get_indent_detail_reindentrt = await indentDao.GetIndentInvoiceDetailReindentrtList(connection, org_id,branch_id,kitchen_id,from_date,to_date);
                    if(get_indent_detail_reindentrt == null) {
                        var empty_array = [];
                        get_indent_summary_reindentrt[i]["details"] = empty_array;
                    }
                    else{
                        get_indent_summary_reindentrt[i]["details"] = get_indent_detail_reindentrt;
                    }
                }

                    var total_size = get_indent_summary_reindentrt.length;
                    var page_size = get_indent_summary_reindentrt.length
                    var result_size = get_indent_summary_reindentrt.length
                    console.log("Totalsize :", total_size);
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        summary, results: get_indent_summary_reindentrt
                    }
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await indentDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
}

function generateId(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var indentDao = new IndentDao();
        var indent_invoice, indent_number;
        
        try{
            indent_invoice = await indentDao.getInvoiceNo(connection,data.branch_id, seq_type);
            if(indent_invoice != null) {
                indent_number = indent_invoice.invoice_no;
                return resolve(indent_number);
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

function categories_data_to_schema_indent_header_data_to_create(connection, data, date, eod_date){
    return new Promise(async(resolve, reject) => {
        try {
            var indent_number;
             var seq_type = 'IND';
            indent_number = await generateId(connection, data, seq_type)
            var delivery_by_datetime =null;
            if(data.hasOwnProperty('delivery_by_datetime')) {
                delivery_by_datetime= moment(data.delivery_by_datetime).utc().format("YYYY-MM-DD HH:mm:ss");
            }
            var indent_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                indent_number: indent_number, 
                indent_date: date, 
                kitchen_id: data.kitchen_id, 
                status: data.status, 
                //indent_paid: 0, 
                //goods_rcpt_status: data.goods_rcpt_status,  
                //supp_inv_amt: 0, 
                updated_by: data.user_id, 
                updated_date: date, 
                created_by: data.user_id, 
                created_date: date,
                self_customer:data.self_customer, 
                delivery_by_datetime:delivery_by_datetime, 
                customer_name: data.customer_name,
                customer_address:data.customer_address,
                customer_phone:data.customer_phone,
                customer_pin:data.customer_pin

            }
            return resolve(indent_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_indent_header_data_to_update(data, get_indent_number_data, date) {
    return new Promise(async(resolve, reject) => {
        try {
        
            var indent_data = {
                org_id: get_indent_number_data.org_id, 
                branch_id: get_indent_number_data.branch_id, 
                indent_number: get_indent_number_data.indent_number, 
                indent_date: data.indent_date, 
                kitchen_id: data.kitchen_id, 
                status: "C", 
                paid: 0, 
                value:0,
                balance:0,
                goods_rcpt_status: "P", 
                kitchen_inv_amt: data.kitchen_inv_amt, 
                updated_by: get_indent_number_data.user_id, 
                updated_date: date, 
               // created_by: get_indent_number_data.user_id, 
               // created_date: date,
                self_customer:get_indent_number_data.self_customer, 
                delivery_by_datetime:get_indent_number_data.delivery_by_datetime, 
                customer_name: get_indent_number_data.customer_name,
                customer_address:get_indent_number_data.customer_address,
                customer_phone:get_indent_number_data.customer_phone,
                customer_pin:get_indent_number_data.customer_pin

            }

            return resolve(indent_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function InitIndentDetail(connection, data, indent_header_data, date) {
    return new Promise(async(resolve, reject) => {
        try {
            var indentDao = new IndentDao();
            var indent_detail = []; 
            var net_value = 0, indent_balance = 0;
         console.log("Create detail");
           
            for(var i in data.indent_details) {
                var indent_details = data.indent_details[i];
                console.log("Detail----->",indent_details)
                // var exp_del_date =null;
                // if(indent_details.hasOwnProperty('exp_del_date')) {
                //     exp_del_date= moment(indent_details.exp_del_date).utc().format("YYYY-MM-DD");
                // }

                var indent_detail_data = {
                    org_id: data.org_id, 
                    branch_id: data.branch_id, 
                    indent_number: indent_header_data.indent_number, 
                    indent_date: indent_header_data.indent_date, 
                    kitchen_id: data.kitchen_id, 
                    item_code: indent_details.item_code, 
                    qty_ordered: indent_details.qty_ordered, 
                    item_cost: indent_details.item_cost,
                    mandatory_status:indent_details.mandatory_status,
                   
                 //   item_status:  indent_details.item_status, 
                    //inv_amt:indent_detail.inv_amt,
                    //exp_del_date: exp_del_date,
                   // del_branch_id: indent_details.del_branch_id,
                    //discrepancy_notes:indent_details.discrepancy_notes,
                   // qty_agreed_kitchen:indent_details.qty_agreed_kitchen,
                   // kitchen_remarks: indent_details.kitchen_remarks,
                  //  damage_notes: indent_details.damage_notes,
                    updated_by: data.user_id,
                    updated_date: date, 
                    created_by: data.user_id, 
                    created_date: date,
                  //  item_disc: indent_details.item_disc, 
                    //item_other_charge: indent_details.item_other_charge, 
                    net_value: (indent_details.qty_ordered * indent_details.item_cost),
                    // qty_received: indent_details.qty_received, 
                    // qty_balance: indent_details.qty_ordered, 
                   
                   // supp_inv_amt: 0,
                  
                    
                   
                
                    
                }
               // console.log("First--->",indent_detail_data);
                var set_indent_detail_data = await indentDao.createIndentDetail(connection, indent_detail_data);
                indent_detail.push(set_indent_detail_data);
                net_value += (indent_details.qty_ordered * indent_details.item_cost);
               // net_value += indent_details.net_value;
               // indent_balance = net_value;
            }
            var update_indent_header = {
                value: net_value
            }
            var update_indent_data = await indentDao.updateIndentHeader(connection, update_indent_header, indent_header_data.indent_number);
            
            var return_data = {indent_detail: indent_detail, update_indent_data: update_indent_data}
           
         
            return resolve(return_data);
        }
        catch (error) {
            console.log("Error in InitIndentDetail", error);
            return reject(error);    
        }
    })
}


function InitIndentSubmission(connection, data,  date) {
    return new Promise(async(resolve, reject) => {
        try {
            var indentDao = new IndentDao();
            var indent_detail = []; 
            for(var i in data.indent_headers) {
                var indent_details = data.indent_headers[i];               
                var update_indent_header = {                   
                    updated_by: data.user_id,
                    updated_date: date,
                    indent_status: indent_details.indent_status                 
                }
                var update_indent_data = await indentDao.updateIndentHeader(connection, update_indent_header, indent_details.indent_number);
                indent_detail.push(update_indent_data);
             
            } 
            return resolve(data);
        }
        catch (error) {
            console.log("Error in InitIndentDetail", error);
            return reject(error);    
        }
    })
}



function UpdateIndentDetail(connection, data, indent_header_data, date, get_indent_header_detail_data) {
    return new Promise(async(resolve, reject) => {
        try {
            var indentDao = new IndentDao();
            var indent_detail = [];
         
            for(var i in get_indent_header_detail_data) {
                var indent_details = get_indent_header_detail_data[i];
                var exp_del_date =null;
                if(indent_details.hasOwnProperty('exp_del_date')) {
                    exp_del_date= moment(indent_details.exp_del_date).utc().format("YYYY-MM-DD");
                }
                var indent_detail_data = {
                    item_code: indent_details.item_code, 
                    qty_ordered: indent_details.qty_ordered, 
                    item_cost: indent_details.item_cost, 
                  //  item_disc: indent_details.item_disc, 
                    //item_other_charge: indent_details.item_other_charge, 
                    net_value: indent_details.net_value,
                   // qty_received: indent_details.qty_received, 
                    qty_balance: indent_details.qty_ordered, 
                    item_status:  indent_details.item_status, 
                   // supp_inv_amt: 0,
                    exp_del_date: exp_del_date,
                    remarks: indent_details.remarks,
                    del_branch_id: indent_details.del_branch_id,
                    updated_date: date
                }
                var set_indent_detail_data = await indentDao.updateIndentDetails(connection, indent_detail_data, data.org_id, data.branch_id, indent_header_data.indent_number);
                indent_detail.push(set_indent_detail_data);
            }
            var return_data = {indent_detail: indent_detail}
            return resolve(return_data);
        }
        catch (error) {
            console.log("Error in UpdateIndentDetail", error);
            return reject(error);    
        }
    })
}




function generateReceiptPaymentId(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var indentDao = new IndentDao();
        var receipt_pay, transaction_id;
        
        try{
            receipt_pay = await indentDao.getReceiptPaymentId(connection,data.branch_id, seq_type);
            if(receipt_pay != null) {
                transaction_id = receipt_pay.trans_id;
                return resolve(transaction_id);
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

function CreateReceiptspayments(connection, data,  date) {
    return new Promise(async(resolve, reject) => {
        try {
            var seq_type = 'RCPPAY';
            var get_receipt_payment, create_receipts_payment, trans_id;
            var indentDao = new IndentDao();
            if(data.hasOwnProperty('trans_id') && data.trans_id != null && data.trans_id.length > 0) {
                get_receipt_payment = await indentDao.getReceiptPayData(connection, data.org_id,data.branch_id,data.trans_id);
                if(get_receipt_payment != null) {
                    var trans_date;
                    var voucher_date;
                    if(data.hasOwnProperty('trans_date') && data.trans_date!='') {                  
                        trans_date = moment(data.trans_date).utc().format("YYYY-MM-DD");
                    }
                    else{                        
                        if(get_receipt_payment.trans_date!=null){
                            trans_date = moment(get_receipt_payment.trans_date).utc().format("YYYY-MM-DD");
                            
                        }else{
                            trans_date=null;
                        }
                    }
                    if(data.hasOwnProperty('voucher_date') && data.voucher_date!='') {                  
                        voucher_date = moment(data.voucher_date).utc().format("YYYY-MM-DD");
                    }
                    else{                        
                        if(get_receipt_payment.voucher_date!=null){
                            voucher_date = moment(get_receipt_payment.voucher_date).utc().format("YYYY-MM-DD");
                            
                        }else{
                            voucher_date=null;
                        }
                    }
                    var update_receipt_payments_data = {
                        account_type: data.hasOwnProperty('account_type')?data.account_type:get_receipt_payment.account_type, 
                        account_code: data.hasOwnProperty('account_code')?data.account_code:get_receipt_payment.account_code, 
                        trans_date: trans_date, 
                        account_value: data.hasOwnProperty('account_value')?data.account_value:get_receipt_payment.account_value, 
                        trans_narration: data.hasOwnProperty('trans_narration')?data.trans_narration:get_receipt_payment.trans_narration, 
                        addl_remarks: data.hasOwnProperty('addl_remarks')?data.addl_remarks:get_receipt_payment.addl_remarks, 
                        voucher_num: data.hasOwnProperty('voucher_num')?data.voucher_num:get_receipt_payment.voucher_num, 
                        voucher_date: voucher_date, 
                        rp_for: data.hasOwnProperty('rp_for')?data.rp_for:get_receipt_payment.rp_for, 
                        rp_name_id: data.hasOwnProperty('rp_name_id')?data.rp_name_id:get_receipt_payment.rp_name_id, 
                        rp_name_other: data.hasOwnProperty('rp_name_other')?data.rp_name_other:get_receipt_payment.rp_name_other, 
                        payment_mode: data.hasOwnProperty('payment_mode')?data.payment_mode:get_receipt_payment.payment_mode, 
                        payment_ref: data.hasOwnProperty('payment_ref')?data.payment_ref:get_receipt_payment.payment_ref, 
                        updated_date: date
                    }
                    create_receipts_payment = await indentDao.updateReceiptPayData(connection, update_receipt_payments_data, data.org_id,data.branch_id,data.trans_id);
                    return resolve(create_receipts_payment) 
                }
                else{
                    create_receipts_payment = { status: 500, code: 5001, message: "Sorry, Invalid TransactionId!.", developerMessage: "Sorry, Invalid TransactionId!." };
                    return reject(create_receipts_payment)
                }
            }
            else{
                var trans_id = await generateReceiptPaymentId(connection, data, seq_type);
                console.log("get_max_payment_num", trans_id);
                var trans_date = new Date(data.trans_date);
                var voucher_date;
                if(data.hasOwnProperty('voucher_date') && data.voucher_date!='') {
                  
                    voucher_date = moment(data.voucher_date).utc().format("YYYY-MM-DD");
                }
                else{
                    voucher_date=null;
                    
                }
                console.log("trans_date", trans_date);
                var eod_date = moment(trans_date).utc().format("MMMYYYY");
                eod_date = eod_date.toUpperCase();
                var receipt_pay = trans_id.replace(data.branch_id, '');
                trans_id = `${data.branch_id}${eod_date}${receipt_pay}`;
                console.log("get_max_payment_num111", trans_id)
                var receipt_payments_data = {
                    org_id: data.org_id, 
                    branch_id: data.branch_id, 
                    trans_id: trans_id, 
                    account_type: data.account_type, 
                    account_code: data.account_code, 
                    trans_date: data.trans_date, 
                    account_value: data.account_value, 
                    trans_narration: data.trans_narration, 
                    addl_remarks: data.addl_remarks, 
                    voucher_num: data.voucher_num, 
                    voucher_date: voucher_date, 
                    rp_for: data.rp_for, 
                    rp_name_id: data.rp_name_id, 
                    rp_name_other: data.rp_name_other, 
                    payment_mode: data.payment_mode, 
                    payment_ref: data.payment_ref, 
                    updated_by: data.user_id, 
                    updated_date: date, 
                    created_by: data.user_id,
                    created_date: date
                }
                create_receipts_payment = await indentDao.createReceiptPayData(connection, receipt_payments_data);
                return resolve(create_receipts_payment) 
            }
        }
        catch (error) {
            console.log("Error in InitIndentGoods", error);
            return reject(error);    
        }
    })
}


module.exports = {
    IndentModule,
    generateId
}
