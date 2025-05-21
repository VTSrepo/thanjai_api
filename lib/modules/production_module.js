const { ProductionDao } = require('../dao/production_dao');
var debug = require('debug')('v1:production:module');
const {changeLog} = require('../../common/error_handling');
var moment = require('moment-timezone');
//const { GetRandomPatientID } = require('../../common/app_utils');

class ProductionModule {
    getProductions(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var productionDao = new ProductionDao();
            var connection = null;
            var get_productions
            try {
                connection = await productionDao.getReadConnection();
                debug("query.filter", query);
                
                    get_productions = await productionDao.getProductions(connection, org_id,query);
                    if(get_productions.hasOwnProperty('status') && get_productions.status == 404) {
                        if (connection) {
                            await productionDao.releaseReadConnection(connection);
                        }
                        return resolve(get_productions);
                       
                    }
                    else{
                        var total_size = get_productions.length;
                        var page_size = get_productions.length;
                        var result_size = get_productions.length;
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            summary, productions: get_productions
                        }

                        if (connection) {
                            await productionDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                
            }
            catch(error) {
                if (connection) {
                    await productionDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    getEmployees(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var productionDao = new ProductionDao();
            var connection = null;
            var get_employees
            try {
                connection = await productionDao.getReadConnection();
                debug("query.filter", query);
                
                 get_employees = await productionDao.getEmployees(connection, org_id,query);
                    if(get_employees.hasOwnProperty('status') && get_employees.status == 404) {
                        if (connection) {
                            await productionDao.releaseReadConnection(connection);
                        }
                        return resolve(get_employees);
                       
                    }
                    else{
                        var total_size = get_employees.length;
                        var page_size = get_employees.length;
                        var result_size = get_employees.length;
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            summary, employees: get_employees
                        }

                        if (connection) {
                            await productionDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                
            }
            catch(error) {
                if (connection) {
                    await productionDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    createProduction(data,  query) {
        return new Promise(async (resolve, reject) => {
            
            var today = new Date();
            var datetime = moment(today).format("YYYY-MM-DD HH:mm:ss");
            var productionDao = new ProductionDao();
            var read_connection = null;
            var product_data, set_product_data, user_product;
            var today = new Date();
           // var date = moment(today).format("YYYY-MM-DD");
            try {
                read_connection = await productionDao.getReadConnection();
              //  console.log("CreateEmpProduct");
                var production_date;
                if(data.hasOwnProperty('production_date') && data.production_date!=null) {
                    production_date= moment(data.production_date).format("YYYY-MM-DD");
                }
                if(data.hasOwnProperty('prod_key') && data.prod_key!=null)  {
                    var get_product_data = await productionDao.GetProduction(read_connection,data.org_id,data.prod_key);
                    if(get_product_data.hasOwnProperty('status') && get_product_data.status == 404)  {
                        set_product_data = await categories_data_to_schema_production_data_to_create(read_connection,data,production_date, datetime);
                        console.log("Create", set_product_data)
                        product_data = await productionDao.createProduction(read_connection, set_product_data);
                        if (read_connection) {
                            await productionDao.releaseReadConnection(read_connection);
                        }
                        var final_res={
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            "production":product_data
                        }
                        return resolve(final_res);
                    }
                    else{
                        user_product = await categories_data_to_schema_production_data_to_update(data, get_product_data,production_date, datetime);
                        product_data = await productionDao.updateProduction(read_connection, user_product, data.org_id,data.prod_key);
                        console.log("Update Production>139", user_product)
                       if (read_connection) {
                            await productionDao.releaseReadConnection(read_connection);
                        }
                        var final_res={
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            "production":product_data
                        }
                        return resolve(final_res);
                    }
                }else{
                    console.log("Create Production>152");
                    set_product_data = await categories_data_to_schema_production_data_to_create(read_connection,data,production_date, datetime);
                    console.log("Create Production>152");
                     product_data = await productionDao.createProduction(read_connection, set_product_data);
                     if (read_connection) {
                         await productionDao.releaseReadConnection(read_connection);
                     }
                     var final_res={
                         status: 200, code: 200, 
                         message: "Success", 
                         developerMessage: "Success" ,
                         "production":product_data
                     }
                     return resolve(final_res);
                }
                
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await productionDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    createEmployee(data,  query) {
        return new Promise(async (resolve, reject) => {
           console.log("Module>>",data);
            var today = new Date();
            var datetime = moment(today).format("YYYY-MM-DD HH:mm:ss");
            var productionDao = new ProductionDao();
            var read_connection = null;
            var employee_data, set_employee_data, user_employee;
            var today = new Date();
           // var date = moment(today).format("YYYY-MM-DD");
            try {
                read_connection = await productionDao.getReadConnection();
                if(data.hasOwnProperty('emp_id') && data.emp_id!=null) {
                    var get_employee_data = await productionDao.getEmployeeDetail(read_connection,data.emp_id);
                    if(get_employee_data.hasOwnProperty('status')) {
                        set_employee_data = await categories_data_to_schema_employee_data_to_create(read_connection,data, datetime);
                        employee_data = await productionDao.createEmployee(read_connection, set_employee_data);
                        if (read_connection) {
                            await productionDao.releaseReadConnection(read_connection);
                        }
                        var final_res={
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            "employee":employee_data
                        }
                        return resolve(final_res);
                    }
                    else{
                        user_employee = await categories_data_to_schema_employee_data_to_update(data, get_employee_data, datetime);
                        employee_data = await productionDao.updateEmployee(read_connection, user_employee, data.org_id,data.branch_id,data.emp_id);
                        if (read_connection) {
                            await productionDao.releaseReadConnection(read_connection);
                        }
                        var final_res={
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            "employee":employee_data
                        }
                        return resolve(final_res);
                    }
                }else{
                    set_employee_data = await categories_data_to_schema_employee_data_to_create(read_connection,data, datetime);
                    employee_data = await productionDao.createEmployee(read_connection, set_employee_data);
                    if (read_connection) {
                        await productionDao.releaseReadConnection(read_connection);
                    }
                    var final_res={
                        status: 200, code: 200, 
                        message: "Success", 
                        developerMessage: "Success" ,
                        "employee":employee_data
                    }
                    return resolve(final_res);
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await productionDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

}


function categories_data_to_schema_production_data_to_create(connection,data,production_date,datetime){
    return new Promise(async(resolve, reject) => {
        try {
        //    console.log("Create---->");
          
            var seq_type = 'PRDMON';
            var prod_key = await generateProductionKeyId(connection, data, seq_type)
           
        var employee_data = {
            org_id: data.org_id, 
            branch_id: data.branch_id, 
            prod_key: prod_key, 
            product_id:data.product_id, 
            emp_id: data.emp_id, 
            production_date:production_date,
            start_time:data.start_time,
            end_time:data.end_time,
            production_qty:data.production_qty,
            damaged_qty:data.damaged_qty,
            remarks:data.remarks,
            updated_by: data.user_id, 
            updated_date: datetime, 
            created_by: data.user_id, 
            created_date: datetime
                
               

        }
        console.log("Two",employee_data);
        return resolve(employee_data)

            
        }
        catch (error) {
            return reject(error);    
        }
    })
}


function categories_data_to_schema_production_data_to_update(data, get_production_data,new_production_date, datetime) {        
    return new Promise(async(resolve, reject) => {
        try {
            var production_date;
                if(data.hasOwnProperty('production_date') && new_production_date!=null) {
                    production_date=new_production_date;
                }else{
                    production_date= moment(get_production_data.production_date).format("YYYY-MM-DD");
                }
               // console.log("production_date",production_date)
            var production_data = {
                // org_id: data.org_id, 
                 branch_id: data.hasOwnProperty('branch_id')?data.branch_id:get_production_data.branch_id,  
                 product_id:data.hasOwnProperty('product_id')?data.product_id:get_production_data.product_id, 
                 emp_id: data.hasOwnProperty('emp_id')?data.emp_id:get_production_data.emp_id,
                 production_date:production_date,
                 start_time:data.hasOwnProperty('start_time')?data.start_time:get_production_data.start_time,
                 end_time:data.hasOwnProperty('end_time')?data.end_time:get_production_data.end_time,
                production_qty:data.hasOwnProperty('production_qty')?data.production_qty:get_production_data.production_qty,
                damaged_qty:data.hasOwnProperty('damaged_qty')?data.damaged_qty:get_production_data.damaged_qty,
                remarks:data.hasOwnProperty('remarks')?data.remarks:get_production_data.remarks,
                updated_by: data.user_id, 
                updated_date: datetime
               
            }
           
            return resolve(production_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}
function categories_data_to_schema_employee_data_to_create(connection,data,datetime){
    return new Promise(async(resolve, reject) => {
        try {
            var emp_id;
                var seq_type = 'EMP';
                emp_id = await generateId(connection, data, seq_type)
            var employee_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                emp_id: emp_id, 
                emp_name:data.emp_name,
                active:data.active,
                contact:data.contact,
                updated_by: data.user_id, 
                updated_date: datetime, 
                created_by: data.user_id, 
                created_date: datetime
            }
            console.log("Two",employee_data);
            return resolve(employee_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_employee_data_to_update(data,get_employee_data, datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            
            var employee_data = {
                branch_id:data.hasOwnProperty('branch_id')?data.branch_id:get_employee_data.branch_id,
                emp_name:data.hasOwnProperty('emp_name')?data.emp_name:get_employee_data.emp_name,
                active:data.hasOwnProperty('active')?data.active:get_employee_data.active,
                contact:data.hasOwnProperty('contact')?data.contact:get_employee_data.contact,
                updated_by: data.user_id, 
                updated_date: datetime
               
            }
           
            return resolve(employee_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}
function generateId(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var productionDao = new ProductionDao();
        var employee_detail, emp_id;
        
        try{
            employee_detail = await productionDao.fetchSeqEmpId(connection,data.branch_id, seq_type,data.org_id);
            if(employee_detail != null) {
                emp_id = employee_detail.emp_id;
                return resolve(emp_id);
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
function generateProductionKeyId(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var productionDao = new ProductionDao();
        var production_detail, prod_key;
        
        try{
            production_detail = await productionDao.fetchProductionId(connection, seq_type);
            if(production_detail != null) {
                prod_key = production_detail.prod_key;
                return resolve(prod_key);
            }
            else{
               return generateCategoryId(connection, data, seq_type)
            }
        }
        catch(error) {
            return reject(error)
        }
    })
}



module.exports = {
   ProductionModule,
   generateId,
   generateProductionKeyId
}