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
                debug("getProductions", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    debug('Sorry, Production Data Not Found!.');
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
                var custQuery = `SELECT e.*, DATE_FORMAT(e.created_date,'%Y-%m-%d')  as created_date, DATE_FORMAT(e.updated_date,'%Y-%m-%d')  as updated_date FROM 
                ${process.env.WRITE_DB_DATABASE}.emp_master e WHERE  ${input} ORDER BY e.emp_name`;
                debug("getEmployees", custQuery)
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
   
    updateProduction(connection, set_product_data, org_id,branch_id,emp_id,product_id,production_date) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.production_data SET ? 
                    WHERE org_id='${org_id}' and branch_id='${branch_id}'and emp_id='${emp_id}'and product_id='${product_id}'and production_date='${production_date}' `, set_product_data);
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



    GetProduction(connection, org_id, branch_id, emp_id, product_id, production_date) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.production_data 
                WHERE org_id='${org_id}' AND branch_id='${branch_id}' AND emp_id='${emp_id}' 
                AND product_id='${product_id}' AND production_date='${production_date}' `;
                console.log("GetProductById", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Product Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Product Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
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
                console.log('GetProductDetail Error :', error)
                return reject(err_code);
            }
        })
    }


    //Old One
   
    GetProductDetail(connection, product_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT p.*FROM ${process.env.WRITE_DB_DATABASE}.product_master p  WHERE p.product_id='${product_id}'`;
                console.log("GetProductDetail", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Product Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Product Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
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
                console.log('GetProductDetail Error :', error)
                return reject(err_code);
            }
        })
    }

    GetProductById(connection, product_id) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.product_master WHERE product_id='${product_id}'`;
                console.log("GetProductById", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Product Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Product Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
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
                console.log('GetProductDetail Error :', error)
                return reject(err_code);
            }
        })
    }



    createProduct(connection, product_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.product_master SET ?`, product_data);
                console.log('COMMIT at createProduct', product_data);
                return resolve(product_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create product error :", err);
                return reject(err_code);
            }
        })
    }

    updateProduct(connection, set_product_data, product_id) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.product_master SET ? WHERE product_id='${product_id}' `, set_product_data);
                console.log('COMMIT at updateProduct', `UPDATE ${process.env.WRITE_DB_DATABASE}.product_master SET ? WHERE product_id='${product_id}' `, set_product_data);
                return resolve(set_product_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updateProduct Error :", err);
                return reject(err_code);
            }
        })
    }


    getGenerateProductId(connection, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT concat(concat(seq_type,branch_id),LPAD(last_seq_no+1,6,'0')) as product_id ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE  seq_type='${seq_type}'`;
                console.log("Get Generate Product ID 746", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,                   
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(branch_id,seq_type),LPAD(0,6,'0')) as product_id ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE  seq_type='${seq_type}'`;

                    console.log("getGenerateProductId", newpatientquery)
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

    GetProductPricing(connection, org_id, branch_id, product_id, previous_date) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${previous_date}' AND eff_to IS NULL AND product_id='${product_id}'`;
                console.log("getCountProductsByOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getCountProductsByOrgId Error :', error)
                return reject(err_code);
            }
        })
    }


    GetProductPricingExisting(connection, org_id, branch_id, product_id, eff_from, insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}'  AND product_id='${product_id}' `;
                console.log("GetProductPricingExisting", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getCountProductsByOrgId Error :', error)
                return reject(err_code);
            }
        })
    }


    GetProductPricingExist(connection, org_id, branch_id, product_id, eff_from,insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}'  AND product_id='${product_id}' `;
                console.log("GetProductPricingExist", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0].count;
                    return resolve(response)
                }
            }
            catch(error) {
                // var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                // console.log('GetProductPricingExist Error :', error)
                // return reject(err_code);
                console.log('Sorry, Appointment Not Found!.', error);
                return resolve(0)
            }
        })
    }

    GetProductPricingCount(connection, org_id, branch_id, product_id, previous_date, insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from<='${previous_date}' AND eff_to IS NULL AND product_id='${product_id}' `;
                console.log("getCountProductsByOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0].count;
                    return resolve(response)
                }
            }
            catch(error) {
                // var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                // console.log('getCountProductsByOrgId Error :', error)
                // return reject(err_code);
                console.log('Sorry, Appointment Not Found!.', queryres);
                return resolve(0)
            }
        })
    }

    createProductPricing(connection, set_product_pricing_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master SET ?`, set_product_pricing_data);
                console.log('COMMIT at createProductPricing', set_product_pricing_data);
                return resolve(set_product_pricing_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("createProductPricing error :", err);
                return reject(err_code);
            }
        })
    }

    updateProductPricing(connection, set_product_pricing_data, org_id, branch_id, product_id, previous_date, insurance_type) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master SET ? WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from<='${previous_date}' AND eff_to IS NULL AND product_id='${product_id}' `, set_product_pricing_data);
                console.log('COMMIT at updateProductPricing');
                return resolve(set_product_pricing_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updateProductPricing Error :", err);
                return reject(err_code);
            }
        })
    }

    updateProductPricingExisting(connection, set_product_pricing_data, org_id, branch_id, product_id, eff_from, insurance_type) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                
                console.log('COMMIT at updateProductPricingExisting',eff_from);
                console.log('COMMIT at updateProductPricingExisting',set_product_pricing_data);
                var dd=`UPDATE ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master SET ? WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}'  AND product_id='${product_id}' `;
                console.log('update query',dd);
                
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.prod_selling_price_master SET ? WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}'  AND product_id='${product_id}' `, set_product_pricing_data);
             
                return resolve(set_product_pricing_data);
            }
            catch (err) {
                var err_code = { status: 200, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updateProductPricingExisting Error :", err);
                return reject(err_code);
            }
        })
    }

    GetProductInsurancePricing(connection, org_id, branch_id, product_id, previous_date, insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from<='${previous_date}' AND eff_to IS NULL AND product_id='${product_id}' `;
                console.log("getCountProductsByOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getCountProductsByOrgId Error :', error)
                return reject(err_code);
            }
        })
    }


    GetProductInsurancePricingExisting(connection, org_id, branch_id, product_id, eff_from, insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}'  AND product_id='${product_id}' `;
                console.log("GetProductInsurancePricingExisting", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
                    return resolve(0)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetProductInsurancePricingExisting Error :', error)
                return reject(err_code);
            }
        })
    }

    GetProductInsurancePricingCount(connection, org_id, branch_id, product_id, previous_date, insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from<='${previous_date}' AND eff_to IS NULL AND product_id='${product_id}' `;
                console.log("getCountProductsByOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Appointment Not Found!.', queryres);
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
                console.log('getCountProductsByOrgId Error :', error)
                return reject(err_code);
            }
        })
    }

    GetProductInsurancePricingExistCount(connection, org_id, branch_id, product_id, eff_from, insurance_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                console.log("GetProductInsurancePricingExist insurance_type", insurance_type)
                var custQuery = `SELECT COUNT(*) AS count FROM ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}' AND product_id='${product_id}' `;
                console.log("GetProductInsurancePricingExist", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, GetProductInsurancePricingExist Not Found!.', queryres);
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
                console.log('GetProductInsurancePricingExist Error :', error)
                return reject(err_code);
            }
        })
    }

    createProductInsurancePricing(connection, set_product_pricing_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master SET ?`, set_product_pricing_data);
                console.log('COMMIT at createProductPricing', set_product_pricing_data);
                return resolve(set_product_pricing_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("createProductPricing error :", err);
                return reject(err_code);
            }
        })
    }

    updateProductInsurancePricing(connection, set_product_pricing_data, org_id, branch_id, product_id, previous_date, insurance_type) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master SET ? WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from<='${previous_date}' AND eff_to IS NULL AND product_id='${product_id}' AND 
                insurance_type_id='${insurance_type}'`, set_product_pricing_data);
                console.log('COMMIT at updateProductPricing');
                return resolve(set_product_pricing_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updateProductPricing Error :", err);
                return reject(err_code);
            }
        })
    }


    updateProductInsurancePricingExisting(connection, set_product_pricing_data, org_id, branch_id, product_id, eff_from, insurance_type) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.Prod_Ins_Selling_Master SET ? WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' AND eff_from='${eff_from}' AND product_id='${product_id}' AND 
                insurance_type_id='${insurance_type}'`, set_product_pricing_data);
                console.log('COMMIT at updateProductPricing');
                return resolve(set_product_pricing_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updateProductPricing Error :", err);
                return reject(err_code);
            }
        })
    }
}

module.exports = {
    ProductionDao
}