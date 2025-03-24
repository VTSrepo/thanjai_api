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
            var datetime = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var productionDao = new ProductionDao();
            var read_connection = null;
            var product_data, set_product_data, user_product;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await productionDao.getReadConnection();
                debug("CreateEmpProduct");
                var production_date;
                if(data.hasOwnProperty('production_date')) {
                    production_date= moment(data.production_date).utc().format("YYYY-MM-DD");
                }
                
                    var get_product_data = await productionDao.GetProduction(read_connection,data.org_id,data.branch_id,data.emp_id, data.product_id,production_date);
                    if(get_product_data.hasOwnProperty('status')) {
                        set_product_data = await categories_data_to_schema_proudction_data_to_create(read_connection, data, datetime);
                       // console.log("set_product_data", set_product_data)
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
                        user_product = await categories_data_to_schema_product_data_to_update(data, get_product_data, datetime);
                        product_data = await productionDao.updateProduction(read_connection, user_product, data.org_id,data.branch_id,data.emp_id, data.product_id,production_date);
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

}

function categories_data_to_schema_proudction_data_to_create(connection, data,datetime){
    return new Promise(async(resolve, reject) => {
        try {
             var production_date =null;
            if(data.hasOwnProperty('production_date')) {
                production_date= moment(data.production_date).utc().format("YYYY-MM-DD");
            }
            var production_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                product_id:data.product_id, 
                emp_id: data.emp_id, 
                production_date:production_date,
                production_qty:data.production_qty,
                damaged_qty:data.damaged_qty,
                remarks:data.remarks,
                updated_by: data.user_id, 
                updated_date: datetime, 
                created_by: data.user_id, 
                created_date: datetime
            }
            debug("production_data", production_data);

            return resolve(production_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_product_data_to_update(data, get_production_data, datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            var production_date =null;
            if(data.hasOwnProperty('production_date')) {
                production_date= moment(data.production_date).utc().format("YYYY-MM-DD");
            }
            var production_data = {
                // org_id: data.org_id, 
                // branch_id: data.branch_id, 
                // product_id:data.product_id, 
                // emp_id: data.emp_id, 
                // production_date:production_date,
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



function categories_data_to_schema_insuranceprice_data_to_create(connection, data, date){
    return new Promise(async(resolve, reject) => {
        try {
            
            var insurance_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                product_id:data.product_id, 
                insurance_type_id:data.insurance_type_id,             
                product_price: data.product_price, 
                invoice_label: data.invoice_label, 
                eff_from: data.eff_from, 
                eff_to: data.eff_to, 
                active_flag: data.active_flag,    
                updated_by: data.user_id, 
                updated_date: date, 
                created_by: data.user_id, 
                created_date: date
            }
            return resolve(insurance_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_insuranceprice_data_to_update(data, get_po_number_data, date) {
    return new Promise(async(resolve, reject) => {
        try {
            var insurance_data_update = {               
                product_price: data.hasOwnProperty('product_price')?data.product_price:get_po_number_data.product_price, 
                invoice_label: data.hasOwnProperty('invoice_label')?data.invoice_label:get_po_number_data.invoice_label, 
               // eff_from: data.hasOwnProperty('eff_from')?data.eff_from:get_po_number_data.eff_from, 
               // eff_to: data.hasOwnProperty('eff_to')?data.eff_to:get_po_number_data.eff_to, 
               //active_flag: data.hasOwnProperty('active_flag')?data.active_flag:get_po_number_data.active_flag,      
                updated_by: data.hasOwnProperty('user_id')?data.user_id:get_po_number_data.updated_by, 
                updated_date: date
            }
            return resolve(insurance_data_update)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_normalprice_data_to_create(connection, data, date){
    return new Promise(async(resolve, reject) => {
        try {
            
            var normal_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                product_id:data.product_id, 
                product_price: data.product_price, 
                mrp_price: data.mrp_price, 
                discount_value: data.discount_value, 
                discount_perc: data.discount_perc, 
                eff_from: data.eff_from, 
                eff_to: data.eff_to, 
                active_flag: data.active_flag,    
                updated_by: data.user_id, 
                updated_date: date, 
                created_by: data.user_id, 
                created_date: date
            }
            return resolve(normal_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_normalprice_data_to_update(data, get_po_number_data, date,datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            var normal_data_update = {               
                product_price: data.hasOwnProperty('product_price')?data.product_price:get_po_number_data.product_price, 
                // eff_to: data.hasOwnProperty('eff_to')?data.eff_to:get_po_number_data.eff_to, 
                prod_name_invoice: data.hasOwnProperty('prod_name_invoice')?data.prod_name_invoice:get_po_number_data.prod_name_invoice,      
               // updated_by: data.hasOwnProperty('user_id')?data.user_id:get_po_number_data.updated_by, 
                updated_date: datetime
            }
            return resolve(normal_data_update)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_product_price_data_to_create(read_connection, data, product_pricing, eff_from, date,datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            var normal_data = {
                org_id: data.org_id,
                branch_id: data.branch_id,
                product_id: product_pricing.product_id,
                product_price: product_pricing.product_price,
                
                eff_from: eff_from,
              
                prod_name_invoice: product_pricing.prod_name_invoice,
           
               // eff_to: (product_pricing.hasOwnProperty('eff_to'))?product_pricing.eff_to:null,
                active_flag: "Y",
               // updated_by: data.user_id,
                updated_date: datetime,
              //  created_by: data.user_id,
                created_date: datetime
           


            }
            return resolve(normal_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}


function categories_data_to_schema_product_price_data_to_default_create(read_connection, data,product_data, eff_from, date,datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            var normal_data = {
                org_id: data.org_id,
                branch_id: data.branch_id,
                product_id: product_data.product_id,
                product_price: data.product_price,
                eff_from: date,
                prod_name_invoice: data.prod_name_invoice,
               // eff_to: (product_pricing.hasOwnProperty('eff_to'))?product_pricing.eff_to:null,
                active_flag: "Y",
                updated_by: data.user_id,
                updated_date: datetime,
                created_by: data.user_id,
                created_date: datetime

            }
            return resolve(normal_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_product_price_data_to_update(read_connection, data, product_pricing, old_previous_date, date, get_product_pricing_data,datetime) {
    return new Promise(async(resolve, reject) => {
        try {
            var normal_data = {
                eff_to: old_previous_date,
                active_flag:"N",
                //updated_by: data.user_id,
                updated_date: datetime
            }
            return resolve(normal_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_product_insurance_price_data_to_create(read_connection, data, product_pricing, old_previous_date, date) {
    return new Promise(async(resolve, reject) => {
        try {
            var normal_data = {
                org_id: data.org_id,
                branch_id: data.branch_id,
                product_id: product_pricing.product_id,
                insurance_type_id: product_pricing.insurance_type,
                product_price: product_pricing.product_price,
                invoice_label: product_pricing.invoice_label,
                eff_from: old_previous_date,
               // eff_to: (product_pricing.hasOwnProperty('eff_to'))?product_pricing.eff_to:null,
                updated_by: data.user_id,
                updated_date: date,
                created_by: data.user_id,
                created_date: date,
                active_flag: "Y"
            }
            return resolve(normal_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_product_insurance_price_data_to_update(read_connection, data, product_pricing, old_previous_date, date, get_product_pricing_data) {
    return new Promise(async(resolve, reject) => {
        try {
            var normal_data = {
                eff_to: old_previous_date,
                updated_by: data.user_id,
                updated_date: date
            }
            return resolve(normal_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

module.exports = {
   ProductionModule
}