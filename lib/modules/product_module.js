const { ProductDao } = require('../dao/product_dao');
var debug = require('debug')('v2:products:module');
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

class ProductModule {

    getProductDetail(product_id, query) {
        return new Promise(async(resolve, reject) => {
            var productDao = new ProductDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var get_product;
            
            try {
                connection = await productDao.getReadConnection();
                get_product = await productDao.GetProductDetail(connection, product_id);
                if(get_product.hasOwnProperty('status') && get_product.status == 404) {
                    if (connection) {
                        await productDao.releaseReadConnection(connection);
                    }
                    
                    return resolve(get_product);
                }
                else{
                    if (connection) {
                        await productDao.releaseReadConnection(connection);
                    }
                    var res={
                        status: 200, code: 200, 
                        message: "Success", 
                        developerMessage: "Success" ,
                        "product":get_product
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await productDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
    
    getCategoryList(query) {
        return new Promise(async(resolve, reject) => {
            var productDao = new ProductDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_categories, get_products_count;
            try {
                connection = await productDao.getReadConnection();
                debug("query.filter", query);
                


                get_categories = await productDao.getCategoryList(connection);
                    if(get_categories.hasOwnProperty('status') && get_categories.status == 404) {
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(get_categories);
                    }
                    else{
                        //get_products_count = await productDao.getCountProductsByBranchId(connection, branch_id);
                        var total_size = get_categories.length;
                        var page_size = get_categories.length;
                        var result_size = get_categories.length;
                        console.log("Totalsize :", total_size);
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            summary, categories: get_categories
                        }
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                
            }
            catch(error) {
                if (connection) {
                    await productDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }



    getProducts(branch_id, query) {
        return new Promise(async(resolve, reject) => {
            var productDao = new ProductDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_products, get_products_count;
            try {
                connection = await productDao.getReadConnection();
                debug("query.filter", query);
                var eod_date; 
                if(query.filter.hasOwnProperty('eod_date')) {
                 eod_date = moment(query.filter.eod_date).format("YYYY-MM-DD");
                }
               


                if(query.filter.hasOwnProperty('bu_id') ) {
                    debug("query.filter.bu_id",query.filter.bu_id);
                    var get_multiprice_data=await productDao.GetMultiPrice(connection, branch_id, query.filter.bu_id);
                    debug(get_multiprice_data.multi_pricing);
                    get_products = await productDao.getProductsByBranchIdBuId(connection, branch_id, query.filter.bu_id, query,eod_date, get_multiprice_data.multi_pricing);
                    if(get_products.hasOwnProperty('status') && get_products.status == 404) {
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(get_products);
                    }
                    else{
                       // get_products_count = await productDao.getCountProductsByBranchIdBuId(connection, branch_id, query.filter.bu_id, query);
                       var total_size = get_products.length;
                       var page_size = get_products.length;
                       var result_size = get_products.length;
                        console.log("Totalsize :", total_size);
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            summary, results: get_products
                        }
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                }
                else{
                    get_products = await productDao.getProductsByBranchId(connection, branch_id, strPagination);
                    if(get_products.hasOwnProperty('status') && get_products.status == 404) {
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(get_products);
                    }
                    else{
                        //get_products_count = await productDao.getCountProductsByBranchId(connection, branch_id);
                        var total_size = get_products.length;
                        var page_size = get_products.length;
                        var result_size = get_products.length;
                        console.log("Totalsize :", total_size);
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            summary, results: get_products
                        }
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                }
            }
            catch(error) {
                if (connection) {
                    await productDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    getProductSellingPriceList(product_id, query) {
        return new Promise(async(resolve, reject) => {
            var productDao = new ProductDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_products;
            var eod_date;
            try {
                connection = await productDao.getReadConnection();
             
             
            //    var eoddata = await productDao.getEOD(connection, org_id,branch_id);
            //    if(eoddata.length>=1) {
            //     eod_date = eoddata[0].eod_date;
            // }
            // else{
            //     eod_date = date;
            // }
               //debug("query.filter===?", eod_date);
                
               

                    get_products = await productDao.getProductSellingPriceList(connection,product_id,date);
                    if(get_products.hasOwnProperty('status') && get_products.status == 404) {
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(get_products);
                    }
                    else{
                        //get_products_count = await productDao.getCountProductsByBranchId(connection, branch_id);
                        
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            sellingprice: get_products
                        }
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
            
            }
            catch(error) {
                if (connection) {
                    await productDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
    
    getProductsOrgId(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var productDao = new ProductDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_products, get_products_count;
            var returnResponse;
            try {
                connection = await productDao.getReadConnection();
                console.log("query.filter", query);
               
                    get_products = await productDao.getProductsByOrgId(connection, org_id);
                    if(get_products.hasOwnProperty('status') && get_products.status == 404) {
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(get_products);
                    }
                    else{
                       // get_products_count = await productDao.getCountProductsByOrgId(connection, org_id);
                       var total_size = get_products.length;
                       var page_size = get_products.length;
                       var result_size = get_products.length;
                        console.log("Totalsize :", total_size);
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            summary, results: get_products
                        }
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                
            }
            catch(error) {
                if (connection) {
                    await productDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }


    getProductMasterOrgId(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var productDao = new ProductDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_products, get_products_count;
            var returnResponse;
            try {
                connection = await productDao.getReadConnection();
                debug("query.filter", query);
                
                    get_products = await productDao.getProductMasterByOrgId(connection, org_id);
                    if(get_products.hasOwnProperty('status') && get_products.status == 404) {
                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        console.log("No record :", lang);
                        returnResponse = changeLog(1002,lang);
                        return resolve(returnResponse);
                       
                    }
                    else{
                       // get_products_count = await productDao.getCountProductsByOrgId(connection, org_id);
                        var total_size = get_products.length;
                        var page_size = get_products.length;
                        var result_size = get_products.length;
                        console.log("Totalsize :", total_size);
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            summary, products: get_products
                        }

                        if (connection) {
                            await productDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                
            }
            catch(error) {
                if (connection) {
                    await productDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    CreateProduct(data,  query) {
        return new Promise(async (resolve, reject) => {
            
            var today = new Date();
            var datetime = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var productDao = new ProductDao();
            var read_connection = null;
            var product_data, set_product_data, user_product;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            try {
                read_connection = await productDao.getReadConnection();
                console.log("PRoduct Module1");
              
                if(data.hasOwnProperty('product_id')) {
                    var get_product_data = await productDao.GetProductById(read_connection, data.product_id);
                    if(get_product_data.hasOwnProperty('status')) {
                        set_product_data = await categories_data_to_schema_proudct_data_to_create(read_connection, data, date);
                        console.log("set_product_data", set_product_data)
                        // var eoddata = await productDao.getEOD(read_connection, data.org_id, data.branch_id);
                         var eod_date=date;
                        // if(eoddata.length>=1) {
                        //     eod_date = eoddata[0].eod_date;
                        // }
                        // else{
                        //         eod_date = date;
                        // }
                        //Remove EOD using current date
                        product_data = await productDao.createProduct(read_connection, set_product_data);
                        
                        var set_product_pricing_data = await categories_data_to_schema_product_price_data_to_default_create(read_connection,data, product_data, eod_date, date,datetime);
                        var insert_product_pricing_data = await productDao.createProductPricing(read_connection, set_product_pricing_data);
                     
                        if (read_connection) {
                            await productDao.releaseReadConnection(read_connection);
                        }
                        var final_res={
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            "product":product_data
                        }
                        return resolve(final_res);
                    }
                    else{
                        user_product = await categories_data_to_schema_product_data_to_update(data, get_product_data, date);
                        product_data = await productDao.updateProduct(read_connection, user_product, data.product_id);
                        if (read_connection) {
                            await productDao.releaseReadConnection(read_connection);
                        }
                        var final_res={
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            "product":product_data
                        }
                        return resolve(final_res);
                    }
                }
                else{
                   console.log("Product Setup start");
                    set_product_data = await categories_data_to_schema_proudct_data_to_create(read_connection, data, date);
                    console.log("set_product_data", set_product_data)
                    product_data = await productDao.createProduct(read_connection, set_product_data);
                     
                    var set_product_pricing_data = await categories_data_to_schema_product_price_data_to_default_create(read_connection,data, product_data, eod_date, date,datetime);
                    var insert_product_pricing_data = await productDao.createProductPricing(read_connection, set_product_pricing_data);
                 
                    if (read_connection) {
                        await productDao.releaseReadConnection(read_connection);
                    }
                    var final_res={
                        status: 200, code: 200, 
                        message: "Success", 
                        developerMessage: "Success" ,
                        "product":product_data
                    }
                    return resolve(final_res);
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await productDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    CreateProductPricing(data,  query) {
        return new Promise(async (resolve, reject) => {
            
            var today = new Date();
            var datetime = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var productDao = new ProductDao();
            var read_connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            var success_flag = "N";
            var product_pricing_data = [];
            var new_from_date;
            try {
                read_connection = await productDao.getReadConnection();
            
        
                        var input=data;
                        var old_previous_date = data.eff_from;
                        old_previous_date = new Date(old_previous_date);
                        old_previous_date.setDate(old_previous_date.getDate() - 1);
                        old_previous_date = moment(old_previous_date).format("YYYY-MM-DD");
                        new_from_date = moment(data.eff_from).format("YYYY-MM-DD");
                        console.log("old_previous_date", old_previous_date);
                        var check_product_existing_record = await productDao.GetProductPricingExist(read_connection, data.org_id, data.branch_id, data.product_id, new_from_date, data.insurance_type);
                       if(check_product_existing_record==0){
                        var check_product_pricing_count = await productDao.GetProductPricingCount(read_connection, data.org_id, data.branch_id, data.product_id, old_previous_date, data.insurance_type);
                        if(check_product_pricing_count == 0) {                           
                            var set_product_pricing_data = await categories_data_to_schema_product_price_data_to_create(read_connection, data, data, new_from_date, date,datetime);
                            var insert_product_pricing_data = await productDao.createProductPricing(read_connection, set_product_pricing_data);
                            product_pricing_data.push(insert_product_pricing_data);
                        }
                        else {
                            new_from_date = moment(data.eff_from).format("YYYY-MM-DD");
                            var get_product_pricing_data = await productDao.GetProductPricing(read_connection, data.org_id, data.branch_id, data.product_id, old_previous_date, data.insurance_type);
                            var set_update_product_pricing_data = await categories_data_to_schema_product_price_data_to_update(read_connection, data, data, old_previous_date, date, get_product_pricing_data,datetime);
                            var update_product_pricing_data = await productDao.updateProductPricing(read_connection, set_update_product_pricing_data, data.org_id, data.branch_id, data.product_id, old_previous_date, data.insurance_type)
                            var set_product_pricing_data = await categories_data_to_schema_product_price_data_to_create(read_connection, data, data, new_from_date, date,datetime);
                            var insert_product_pricing_data = await productDao.createProductPricing(read_connection, set_product_pricing_data);
                            product_pricing_data.push(insert_product_pricing_data);
                        }
                    }else{
                        var get_product_pricing_existing_data = await productDao.GetProductPricingExisting(read_connection, data.org_id, data.branch_id, data.product_id, new_from_date, data.insurance_type);
                        var set_update_product_pricingexisting_data = await categories_data_to_schema_normalprice_data_to_update(input, get_product_pricing_existing_data,date,datetime);
                        var update_product_pricing_data = await productDao.updateProductPricingExisting(read_connection, set_update_product_pricingexisting_data, data.org_id, data.branch_id, data.product_id, new_from_date, data.insurance_type)
                        product_pricing_data.push(update_product_pricing_data);
                        console.log("Update Price");
                    }

        
                    
                    if (read_connection) {
                        await productDao.releaseReadConnection(read_connection);
                    }
                    var res={
                        "status": 200,
                        "code": 200,
                        "message": "Success",
                        "developerMessage": "Success",
                        "sellingprice":product_pricing_data
                    }
                    return resolve(res)
               
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await productDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }

    CreateProductInsurancePricing(data,  query) {
        return new Promise(async (resolve, reject) => {
            
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var productDao = new ProductDao();
            var read_connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD");
            var success_flag = "N";
            var product_pricing_data = [];
            var new_from_date;
            try {
                read_connection = await productDao.getReadConnection();
                for(var i in data.product_pricing) {
                    debug("data.product_pricing", data.product_pricing[i])
                    if(data.product_pricing[i].eff_from && data.product_pricing[i].eff_from != null && data.product_pricing[i].eff_from.length == 10 ) {
                        debug("data.product_pricing.eff_from", data.product_pricing[i].eff_from.length)
                        if(data.product_pricing[i].insurance_type && data.product_pricing[i].insurance_type != null && data.product_pricing[i].insurance_type.length == 1 ) {
                            debug("data.product_pricing.insurance_type", data.product_pricing[i].insurance_type)
                            success_flag = "Y"
                        }else{
                            debug("data.product_pricing.insurance_type", data.product_pricing[i].insurance_type)
                        }
                    }
                    else{}
                }
                debug("success_flag", success_flag)
                if(success_flag == "Y") {
                    for(var j in data.product_pricing) {
                        var input= data.product_pricing[j];
                        new_from_date = moment(data.product_pricing[j].eff_from).format("YYYY-MM-DD");
                        var old_previous_date = data.product_pricing[j].eff_from;
                        old_previous_date = new Date(old_previous_date);
                        old_previous_date.setDate(old_previous_date.getDate() - 1);
                        old_previous_date = moment(old_previous_date).format("YYYY-MM-DD");
                        console.log("old_previous_date", old_previous_date);
                        var check_product_pricing__exist_count = await productDao.GetProductInsurancePricingExistCount(read_connection, data.org_id, data.branch_id, data.product_pricing[j].product_id, new_from_date, data.product_pricing[j].insurance_type);
                    if(check_product_pricing__exist_count == 0) {
                        var check_product_pricing_count = await productDao.GetProductInsurancePricingCount(read_connection, data.org_id, data.branch_id, data.product_pricing[j].product_id, old_previous_date, data.product_pricing[j].insurance_type);
                        if(check_product_pricing_count == 0) {
                       
                            var set_product_pricing_data = await categories_data_to_schema_product_insurance_price_data_to_create(read_connection, data, data.product_pricing[j], new_from_date, date);
                            var insert_product_pricing_data = await productDao.createProductInsurancePricing(read_connection, set_product_pricing_data);
                            product_pricing_data.push(insert_product_pricing_data);
                        }
                        else {
                            new_from_date = moment(data.product_pricing[j].eff_from).format("YYYY-MM-DD");
                            var get_product_pricing_data = await productDao.GetProductInsurancePricing(read_connection, data.org_id, data.branch_id, data.product_pricing[j].product_id, old_previous_date, data.product_pricing[j].insurance_type);
                            var set_update_product_pricing_data = await categories_data_to_schema_product_insurance_price_data_to_update(read_connection, data, data.product_pricing[j], old_previous_date, date, get_product_pricing_data);
                            var update_product_pricing_data = await productDao.updateProductInsurancePricing(read_connection, set_update_product_pricing_data, data.org_id, data.branch_id, data.product_pricing[j].product_id, old_previous_date, data.product_pricing[j].insurance_type)
                            var set_product_pricing_data = await categories_data_to_schema_product_insurance_price_data_to_create(read_connection, data, data.product_pricing[j], new_from_date, date);
                            var insert_product_pricing_data = await productDao.createProductInsurancePricing(read_connection, set_product_pricing_data);
                            product_pricing_data.push(insert_product_pricing_data);
                        }
                    }else{
                        //update exist
                        var get_product_pricing_exist_data = await productDao.GetProductInsurancePricingExisting(read_connection, data.org_id, data.branch_id, data.product_pricing[j].product_id, new_from_date, data.product_pricing[j].insurance_type);
                        var set_update_product_pricingexisting_data = await categories_data_to_schema_insuranceprice_data_to_update(input, get_product_pricing_exist_data,date);
                        var update_product_pricing_data = await productDao.updateProductInsurancePricingExisting(read_connection, set_update_product_pricingexisting_data, data.org_id, data.branch_id, data.product_pricing[j].product_id, new_from_date)
                        product_pricing_data.push(update_product_pricing_data);
                        console.log("Update Price");

                    }
                    }
                    if (read_connection) {
                        await productDao.releaseReadConnection(read_connection);
                    }
                    return resolve(product_pricing_data)
                }
                else{
                    var err_code = { status: 402, code: 4001, message: "Invalid Data!.", developerMessage:"Invalid Data!." };
                    if (read_connection) {
                        await productDao.releaseReadConnection(read_connection);
                    }
                    return reject(err_code)
                }
            }
            catch (error) {
                debug("error", error)
                if (read_connection) {
                    await productDao.releaseReadConnection(read_connection);
                }
                return reject(error)
            }
        })
    }
}


function generateId(connection, data, seq_type) {
    return new Promise(async(resolve, reject) => {
        var productDao = new ProductDao();
        var product, product_id;
        
        try{
            product = await productDao.getGenerateProductId(connection, seq_type);
            if(product != null) {
                product_id = product.product_id;
                return resolve(product_id);
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

function categories_data_to_schema_proudct_data_to_create(connection, data, date){
    return new Promise(async(resolve, reject) => {
        try {
           console.log("set up",data);
            var product_id;
            var seq_type = 'PRD';
            product_id = await generateId(connection, data, seq_type)
            console.log("product_id", product_id);
            var product_data = {
                org_id: data.org_id, 
                branch_id: data.branch_id, 
                product_id:product_id, 
                product_name: data.product_name, 
                uom: data.uom, 
                bu_id: data.bu_id, 
                stock_in_hand: data.stock_in_hand, 
                min_stock: data.min_stock, 
                max_stock: data.max_stock, 
                reorder_level: data.reorder_level, 
                price_deviation: data.price_deviation, 
                billing_flag: data.billing_flag, 
                account_code: data.account_code, 
                product_price: data.product_price, 
                prod_name_invoice: data.prod_name_invoice,     
                gst_value: data.gst_value,   
                category_code: data.category_code,       
                updated_by: data.user_id, 
                updated_date: date, 
                created_by: data.user_id, 
                created_date: date
            }
            console.log("product_data", product_data);

            return resolve(product_data)
        }
        catch (error) {
            return reject(error);    
        }
    })
}

function categories_data_to_schema_product_data_to_update(data, get_po_number_data, date) {
    return new Promise(async(resolve, reject) => {
        try {
            var po_data = {               
                product_name: data.hasOwnProperty('product_name')?data.product_name:get_po_number_data.product_name, 
                uom: data.hasOwnProperty('uom')?data.uom:get_po_number_data.uom, 
                bu_id: data.hasOwnProperty('bu_id')?data.bu_id:get_po_number_data.bu_id, 
                stock_in_hand: data.hasOwnProperty('stock_in_hand')?data.stock_in_hand:get_po_number_data.stock_in_hand, 
                min_stock: data.hasOwnProperty('min_stock')?data.min_stock:get_po_number_data.min_stock, 
                max_stock: data.hasOwnProperty('max_stock')?data.max_stock:get_po_number_data.max_stock, 
                max_stock: data.hasOwnProperty('max_stock')?data.max_stock:get_po_number_data.max_stock, 
                reorder_level: data.hasOwnProperty('reorder_level')?data.reorder_level:get_po_number_data.reorder_level, 
                price_deviation: data.hasOwnProperty('price_deviation')?data.price_deviation:get_po_number_data.price_deviation, 
                billing_flag: data.hasOwnProperty('billing_flag')?data.billing_flag:get_po_number_data.billing_flag, 
                account_code: data.hasOwnProperty('account_code')?data.account_code:get_po_number_data.account_code, 
                product_price: data.hasOwnProperty('product_price')?data.product_price:get_po_number_data.product_price,
                prod_name_invoice: data.hasOwnProperty('prod_name_invoice')?data.prod_name_invoice:get_po_number_data.prod_name_invoice,
                gst_value: data.hasOwnProperty('gst_value')?data.gst_value:get_po_number_data.gst_value,  
                category_code: data.hasOwnProperty('category_code')?data.category_code:get_po_number_data.category_code,              
                updated_by: data.hasOwnProperty('user_id')?data.user_id:get_po_number_data.updated_by, 
                updated_date: date
            }
            return resolve(po_data)
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
   ProductModule
}