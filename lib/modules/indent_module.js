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
            var date = moment(today).format("YYYY-MM-DD");
            var datetime = moment(today).format("YYYY-MM-DD HH:mm:ss");
            var eod_date;
            try {          
                read_connection = await indentDao.getReadConnection();
                if(data.hasOwnProperty('indent_number') && data.indent_number !=null) {
                    var get_indent_number_data = await indentDao.getIndentNumber(read_connection, data.org_id,data.indent_number);
                    if(get_indent_number_data.hasOwnProperty('status') && get_indent_number_data.status == 404) {
                        user_indent_header = await categories_data_to_schema_indent_header_data_to_create(read_connection, data, date, datetime);
                        console.log("EOD : 26", user_indent_header);
                        indent_header_data = await indentDao.createIndentHeader(read_connection, user_indent_header);
                        set_indent_detail = await InitIndentDetail(read_connection, data, user_indent_header, date);
                        if (read_connection) {
                            await indentDao.releaseReadConnection(read_connection);
                        }
                        return resolve(indent_header_data); 
                    }
                    else{
                        console.log("Indent Header :35");
                       var update_indent_header = await categories_data_to_schema_indent_header_data_to_update(data, get_indent_number_data, datetime);
                        indent_header_data = await indentDao.updateIndentHeader(read_connection,update_indent_header, data.indent_number);
                        // var get_indent_header_detail_data = await indentDao.GetIndentDetails(read_connection, data.org_id, data.branch_id, data.indent_number);
                        // if(get_indent_header_detail_data == null) {
                        //     set_indent_detail = await InitIndentDetail(read_connection, data, user_indent_header, date);
                        //     if (read_connection) {
                        //         await indentDao.releaseReadConnection(read_connection);
                        //     }
                        //     var res={
                        //         "status": 200,
                        //         "code": 200,
                        //         "message": "Success",
                        //         "developerMessage": "Success",
                        //         "indent":indent_header_data
                        //     }
                        //     return resolve(res);
                        // }
                        // else{
                            if(data.status=='A'){

                            }else{
                                
                            
                            set_indent_detail = await UpdateIndentDetail(read_connection, data,  datetime);
                            
                            }
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

                            return resolve(res); 
                        }
                    
                }
                else{
                    user_indent_header = await categories_data_to_schema_indent_header_data_to_create(read_connection, data, date, datetime);
                    console.log("Indent Header :77");
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

    GetIndentList(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_indents, get_indent_count;
            try {
                connection = await indentDao.getReadConnection();
                console.log("query.filter", query)
                get_indents = await indentDao.GetIndentListByAll(connection, org_id,query);

                 
                // if(query.filter.hasOwnProperty('status') && query.filter.hasOwnProperty('branch_id')  && query.filter.hasOwnProperty('kitchen_id') && query.filter.hasOwnProperty('indent_number') && query.filter.status!=null && query.filter.branch_id!=null && query.filter.kitchen_id!=null && query.filter.indent_number!=null) {
                //     get_indents = await indentDao.GetIndentListByAll(connection, org_id,query.filter.status,query.filter.branch_id,query.filter.kitchen_id,query.filter.indent_number);
                // }else if(query.filter.hasOwnProperty('status') && query.filter.hasOwnProperty('kitchen_id') && query.filter.hasOwnProperty('indent_number') && query.filter.status!=null && query.filter.branch_id!=null && query.filter.kitchen_id!=null && query.filter.indent_number!=null) {
                // }else if(query.filter.hasOwnProperty('status') && query.filter.status!=null  ) {
                //     get_indents = await indentDao.GetIndentListByStatus(connection, org_id,query.filter.status);
                // }else{
                //     get_indents = await indentDao.GetIndentListByOrgId(connection, org_id);
                // }
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


    GetIndentDetail(indent_number, org_id, query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var get_indent;
            try {
                connection = await indentDao.getReadConnection();
                get_indent = await indentDao.getIndentNumber(connection,org_id, indent_number);
                if(get_indent.hasOwnProperty('status') && get_indent.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indent);
                }
                else{
                    debug("GetIndentDetail", get_indent)
                    var detail_list = await indentDao.GetIndentDetailList(connection, get_indent.indent_number);
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

                    var res = {
                        "status": 200,
                        "code": 200,
                        "message": "Success",
                        "developerMessage": "Success",
                        indent: get_indent
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

    // From date,To date and Status
    GetIndentReport(query) {
        return new Promise(async(resolve, reject) => {
            var indentDao = new IndentDao();
            var connection = null;
            var get_indents;
            console.log("Module");
            try {
                var from_date,to_date;
                var status=null;
              
                if(query.filter.hasOwnProperty('from_date') && query.filter.from_date!=null){
                    from_date = moment(query.filter.from_date).format("YYYY-MM-DD");
                }
                if(query.filter.hasOwnProperty('to_date') && query.filter.to_date!=null){
                    to_date = moment(query.filter.to_date).format("YYYY-MM-DD");
                }

                if(query.filter.hasOwnProperty('status') && query.filter.status!=null){
                    status = query.filter.status;
                }
                connection = await indentDao.getReadConnection();
                get_indents = await indentDao.GetIndentReport(connection,from_date,to_date,status);
                if(get_indents.hasOwnProperty('status') && get_indents.status == 404) {
                    if (connection) {
                        await indentDao.releaseReadConnection(connection);
                    }
                    return resolve(get_indents);
                }
                else{
                    var total_size = get_indents.length;
                    var page_size = get_indents.length;
                    var result_size = get_indents.length;
                    var summary = {
                        filteredsize: page_size, resultsize: result_size, totalsize: total_size
                    };
                    var res = {
                        status: 200, code: 200, 
                        message: "Success", 
                        developerMessage: "Success" ,
                        summary, indents: get_indents
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
            indent_invoice = await indentDao.fetchIndentNo(connection,data.branch_id, seq_type);
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

function categories_data_to_schema_indent_header_data_to_create(connection, data, date, datetime){
    return new Promise(async(resolve, reject) => {
        try {
            var indent_number;
             var seq_type = 'IND';
            indent_number = await generateId(connection, data, seq_type)
            var delivery_by_datetime =null;
            if(data.hasOwnProperty('delivery_by_datetime') && data.delivery_by_datetime!=null && data.delivery_by_datetime.length>3) {
                delivery_by_datetime= moment(data.delivery_by_datetime).utc().format("YYYY-MM-DD HH:mm:ss");
            }
            var indent_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                indent_number: indent_number, 
                indent_date: date, 
                kitchen_id: data.kitchen_id, 
                status: data.status, 
                priority_flag:data.priority_flag,
                updated_by: data.user_id, 
                updated_date: datetime, 
                created_by: data.user_id, 
                created_date: datetime,
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

function categories_data_to_schema_indent_header_data_to_update(data, get_indent_number_data, datetime) {
    return new Promise(async(resolve, reject) => {
        try {
        
            var indent_data = {
                
                status: data.status, 
                updated_by: data.user_id, 
                updated_date: datetime, 
            
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







function UpdateIndentDetail(connection, data, datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            var indentDao = new IndentDao();
            var indent_detail = [];
            var total_net_value=0;
            for(var i in data.indent_details) {
                var indent_detail = data.indent_details[i];
                var get_detail = await indentDao.GetIndentDetail(connection,data.org_id, data.branch_id,data.kitchen_id,data.indent_number,indent_detail.item_code);
                if(get_detail.hasOwnProperty('status') && get_detail.status == 404) {
                    var net_value=(indent_detail.qty_ordered * indent_detail.item_cost);
                     indent_detail_data = {
                        org_id: data.org_id, 
                        branch_id: data.branch_id, 
                        indent_number: data.indent_number, 
                        indent_date: data.indent_date, 
                        kitchen_id: data.kitchen_id, 
                        item_code: indent_detail.item_code, 
                        qty_ordered: indent_detail.qty_ordered, 
                        item_cost: indent_detail.item_cost,
                        mandatory_status:indent_detail.mandatory_status,
                        updated_by: data.user_id,
                        updated_date: datetime, 
                        created_by: data.user_id, 
                        created_date: datetime,
                        net_value: net_value
                    }
               
                    var set_indent_detail_data = await indentDao.createIndentDetail(connection, indent_detail_data);
                    total_net_value += net_value;
                }else{
              
                var indent_detail_data=null;
                if(data.status=="D"){
                    net_value =  (indent_detail.qty_agreed_kitchen * get_detail.item_cost); 
                    indent_detail_data = {
                        qty_agreed_kitchen: indent_detail.qty_agreed_kitchen, 
                        kitchen_remarks: indent_detail.kitchen_remarks,
                        updated_date: datetime,
                        net_value: net_value
                    }
                    total_net_value += net_value;
                }else if(data.status=="R"){
                    console.log("Qty Received...>>",get_detail);
                    console.log("Qty Received...>>",get_detail);
                    var qty_ordered=0;
                    //console.log(parseInt(get_detail.qty_ordered)-parseInt(indent_detail.qty_received));
                    if(get_detail.hasOwnProperty('qty_ordered')) {
                        if(get_detail.qty_ordered != null && get_detail.qty_ordered != '' ) {
                            
                            qty_ordered = get_detail.qty_ordered;
                        }
                        else{
                            qty_ordered = 0;
                         
                        }
                    }
                    else{
                        qty_ordered = 0;
                    }
                    var qty_balance=0
                    console.log("qty_ordered",qty_ordered);
                    console.log("qty_received",indent_detail.qty_received);
                    qty_balance=qty_ordered - indent_detail.qty_received; 
                    console.log("qty_balance",qty_balance)
                    var net_value=0
                     net_value =  (indent_detail.qty_received * get_detail.item_cost); 
                    
                    indent_detail_data = {
                        qty_received: indent_detail.qty_received, 
                        discrepancy_notes: indent_detail.discrepancy_notes,
                        damage_notes:indent_detail.damage_notes,
                        qty_balance:qty_balance,
                        net_value:net_value,
                        updated_date: datetime

                    }
                    total_net_value += net_value;
                }
                console.log(indent_detail_data);
                var set_indent_detail_data = await indentDao.updateIndentDetail(connection, indent_detail_data, data.org_id, data.branch_id, data.indent_number,data.kitchen_id,indent_detail.item_code);
              //  indent_detail.push(set_indent_detail_data);
            } 
            // if(data.status=="R"){
            //     var update_indent_header = {
            //         value: total_net_value
            //     }
            //     indent_header_data = await indentDao.updateIndentHeader(connection, update_indent_header, data.indent_number);
                      
            // }
            }

            if(total_net_value !=0 ){
                var update_indent_header = {
                    value: total_net_value
                }
                indent_header_data = await indentDao.updateIndentHeader(connection, update_indent_header, data.indent_number);
                      
            }
            var return_data = {indent_detail: indent_detail}
            return resolve(return_data);
        }
        catch (error) {
           // console.log("Error in UpdateIndentDetail", error);
            return reject(error);    
        }
    })
}








module.exports = {
    IndentModule,
    generateId
}
