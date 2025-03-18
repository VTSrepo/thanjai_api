const mysql = require('../../common/db_utils');
var debug = require('debug')('v2:indent:dao');
const BaseDao = require('./base_dao');

class IndentDao extends BaseDao {

    getInvoiceNo(connection, branch_id, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }

                var custQuery = `SELECT concat(concat(seq_type,branch_id),LPAD(last_seq_no+1,6,'0')) as invoice_no ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;
                console.log("getInvoiceNo", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                        branch_id: branch_id,
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(seq_type,branch_id),LPAD(0,6,'0')) as invoice_no ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;

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
                    WHERE  branch_id='${branch_id}' AND seq_type='${seq_type}'`);
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

    getIndentNumber(connection, indent_number) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT  d.org_id,d.branch_id,b.branch_name,d.indent_number,d.kitchen_id,d.status,(SELECT ref_desc FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master where ref_type='POSTA' and ref_code=d.status) as status_name
                ,d.value,d.paid,d.balance,d.goods_rcpt_status,(SELECT ref_desc FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master where ref_type='POSTA' and ref_code=d.goods_rcpt_status) as goods_rcpt_status_name,
                d.kitchen_inv_amt,DATE_FORMAT(d.indent_date,'%Y-%m-%d') as indent_date,d.updated_by,d.updated_date,d.created_by,d.created_date FROM ${process.env.WRITE_DB_DATABASE}.indent_header d 
                INNER JOIN ${process.env.WRITE_DB_DATABASE}.branch_master b ON d.branch_id=b.branch_id WHERE d.indent_number='${indent_number}'`;
                console.log("getPoNumber", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Data Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry,Data Not Available!.", developerMessage: "Sorry,Data Not Available!." };
                    return resolve(error_code)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getPoNumber error :', error)
                return reject(err_code);
            }
        })
    }
    createIndentHeader(connection, indent_header_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.indent_header SET ?`, indent_header_data);
                console.log('COMMIT at createIndentHeader');
                return resolve(indent_header_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create po error :", err);
                return reject(err_code);
            }
        })
    }

    createIndentDetail(connection, set_indent_detail) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.indent_detail SET ?`, set_indent_detail);
                console.log('COMMIT at createIndentDetail');
                return resolve(set_indent_detail);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create Indent detail error :", err);
                return reject(err_code);
            }
        })
    }

    updateIndentHeader(connection, update_indent_header, indent_number) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.indent_header SET ? WHERE indent_number='${indent_number}'`, update_indent_header);
                
                console.log('COMMIT at updatePo'+update_indent_header);
                return resolve(update_indent_header);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updatePoHeader Error :", err);
                return reject(err_code);
            }
        })
    }

    GetIndentListsByBranchId(connection, branch_id,kitchen_id, query, strPagination) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery, inv_status;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.indent_header WHERE branch_id='${branch_id}' and kitchen_id='${kitchen_id}'`;
                console.log("GetPoListsByBranchId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Po Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoListsByBranchId error :', error)
                return reject(err_code);
            }
        })
    }


    GetPoListsByStatus(connection, branch_id,kitchen_id, status,query, strPagination) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
             
                custQuery = `SELECT  d.org_id,d.branch_id,b.branch_name,d.indent_number,d.kitchen_id,d.status,(SELECT ref_desc FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master where ref_type='POSTA' and ref_code=d.status) as status_name
                ,d.value,d.paid,d.balance,d.goods_rcpt_status,(SELECT ref_desc FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master where ref_type='POSTA' and ref_code=d.goods_rcpt_status) as goods_rcpt_status_name,
                d.kitchen_inv_amt,DATE_FORMAT(d.indent_date,'%Y-%m-%d') as indent_date,d.updated_by,d.updated_date,d.created_by,d.created_date FROM ${process.env.WRITE_DB_DATABASE}.indent_header d 
                INNER JOIN ${process.env.WRITE_DB_DATABASE}.branch_master b ON d.branch_id=b.branch_id  WHERE d.branch_id='${branch_id}' and d.kitchen_id='${kitchen_id}' and d.status='${status}'`;
                console.log("GetPoListsByStatus", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Po Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoListsByStatus error :', error)
                return reject(err_code);
            }
        })
    }

    getCountPoByBranchId(connection, branch_id, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery, inv_status;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT COUNT(*) as count FROM ${process.env.WRITE_DB_DATABASE}.indent_header WHERE branch_id='${branch_id}'`;
                console.log("getCountPoByBranchId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Po Not Found!.', queryres);
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
                console.log('getCountPoByBranchId error :', error)
                return reject(err_code);
            }
        })
    }

    GetPoListsByOrgId(connection, org_id, query, strPagination) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery, inv_status;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.indent_header WHERE org_id='${org_id}'`;
                console.log("GetPoListsByOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Po Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoListsByOrgId error :', error)
                return reject(err_code);
            }
        })
    }

    GetPoDetailList(connection, query, indent_number) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
               // custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.indent_detail INNER JOIN tbl_branch WHERE indent_number='${indent_number}'`;

               custQuery = `SELECT d.org_id,d.branch_id,b.branch_name,d.indent_number,d.kitchen_id,d.item_code,p.product_name,d.qty_ordered,d.item_cost, 
               DATE_FORMAT(d.indent_date,'%Y-%m-%d') as indent_date,d.item_disc,d.item_other_charge,d.net_value,(SELECT ref_desc FROM ${process.env.WRITE_DB_DATABASE}.vts_ref_master where ref_type='ITMSTA' and ref_code=d.item_status) as item_status_name,
               d.qty_received,d.qty_balance,d.item_status,d.kitchen_inv_amt,d.exp_del_date,d.remarks,d.del_branch_id,(SELECT branch_name FROM ${process.env.WRITE_DB_DATABASE}.branch_master where  branch_id=del_branch_id) as del_branch_name,
               d.updated_by,d.updated_date,d.created_by,d.created_date  FROM ${process.env.WRITE_DB_DATABASE}.indent_detail d inner join 
               ${process.env.WRITE_DB_DATABASE}.branch_master b on d.branch_id=b.branch_id inner join ${process.env.WRITE_DB_DATABASE}.Product_Master p on d.item_code=p.product_id WHERE d.indent_number='${indent_number}'`;

                console.log("GetPoDetailList", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Po Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(error_code)
                }
                else{
                    return resolve(queryres)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoListsByOrgId error :', error)
                return reject(err_code);
            }
        })
    }

    getCountPoByOrgId(connection, org_id, query) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery, inv_status;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT COUNT(*) as count FROM ${process.env.WRITE_DB_DATABASE}.indent_header WHERE org_id='${org_id}'`;
                console.log("getCountPoByOrgId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Po Not Found!.', queryres);
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
                console.log('getCountPoByOrgId error :', error)
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
               
                var custQuery = `SELECT DATE_FORMAT(eod_date,'%Y-%m-%d') as eod_date, org_id, branch_id, active_flag FROM 
                ${process.env.WRITE_DB_DATABASE}.Swastha_EOD_OPS where active_flag='Y' and org_id='${org_id}' AND  branch_id='${branch_id}'`;
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
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    getPoGoodReceipt(connection, branch_id, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                //eceipt Num is continous number (1,2,3) for combination of Primary Key org_id,branch_id,kitchen_id,indent_number & item_code.  
                var custQuery = `SELECT concat(concat(seq_type,branch_id),LPAD(last_seq_no+1,4,'0')) as invoice_no ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;
                console.log("getPoGoodReceipt", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                        branch_id: branch_id,
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(seq_type,branch_id),LPAD(0,4,'0')) as invoice_no ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;

                    console.log("getPoGoodReceipt", newpatientquery)
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
                    WHERE  branch_id='${branch_id}' AND seq_type='${seq_type}'`);
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getPoGoodReceipt error :', error)
                return reject(err_code);
            }
        })
    }

    createPoGoods(connection, insert_po_goods_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt SET ?`, insert_po_goods_data);
                console.log('COMMIT at createPoDetail');
                return resolve(insert_po_goods_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create po detail error :", err);
                return reject(err_code);
            }
        })
    }

    updatePoDetail(connection, update_indent_detail, org_id, branch_id, indent_num, kitchen_id, item_code) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.indent_detail SET ? WHERE indent_number='${indent_num}' 
                and org_id='${org_id}' AND branch_id='${branch_id}' AND indent_number='${indent_num}' 
                AND kitchen_id='${kitchen_id}' AND item_code='${item_code}'`, update_indent_detail);
                console.log('COMMIT at updatePoDetail');
                return resolve(update_indent_detail);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updatePoDetail Error :", err);
                return reject(err_code);
            }
        })
    }

    GetPoDetail(connection, org_id, branch_id, indent_num, kitchen_id, item_code) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery, inv_status;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.indent_detail WHERE org_id='${org_id}' AND branch_id='${branch_id}' AND indent_number='${indent_num}' 
                AND kitchen_id='${kitchen_id}' AND item_code='${item_code}'`;
                console.log("GetPoDetail", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, GetPoDetail Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(null)
                }
                else{
                    var respose = JSON.parse(JSON.stringify(queryres));
                    var response = respose[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoDetail error :', error)
                return reject(err_code);
            }
        })
    }

    GetPoDetailPendingCount(connection, org_id, branch_id,kitchen_id, indent_number ) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT COUNT(*) as count FROM ${process.env.WRITE_DB_DATABASE}.indent_detail WHERE org_id='${org_id}' AND branch_id='${branch_id}' AND indent_number='${indent_number}' and item_status='P' 
                AND kitchen_id='${kitchen_id}'`;
                console.log("GetPoDetailPendingCount", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var response = null;
                    return resolve(error_code)
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres))
                    var response = res[0].count;
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getCountPatientbyBranchId error :', error)
                return reject(err_code);
            }
        })
    }

    GetPoHeaderData(connection, org_id, branch_id,kitchen_id, indent_number) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.indent_header WHERE org_id='${org_id}' AND branch_id='${branch_id}' 
                and kitchen_id='${kitchen_id}' and indent_number='${indent_number}'`;
                console.log("GetPoHeaderData", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, GetPoHeaderData Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(null)
                }
                else{
                    var respose = JSON.parse(JSON.stringify(queryres));
                    var response = respose[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoHeaderData error :', error)
                return reject(err_code);
            }
        })
    }

    GetDetailInvAmt(connection, kitchen_id, indent_number) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT sum(kitchen_inv_amt) as count FROM ${process.env.WRITE_DB_DATABASE}.indent_detail WHERE  kitchen_id='${kitchen_id}' and indent_number='${indent_number}'`;
                console.log("GetSupplierInvAmt", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                  
                    return resolve(0)
                }
                else{
                    var respose = JSON.parse(JSON.stringify(queryres));
                    var response = respose[0].count;
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetSupplierInvAmt error :', error)
                return reject(err_code);
            }
        })
    }

    GetSupplierInvAmt(connection, indent_number, kitchen_id, supp_inv_number) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT sum(gr_kitchen_inv_amt) as count FROM ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt WHERE supp_inv_number='${supp_inv_number}' 
                and kitchen_id='${kitchen_id}' and indent_number='${indent_number}'`;
                console.log("GetSupplierInvAmt", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, GetSupplierInvAmt Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(0)
                }
                else{
                    var respose = JSON.parse(JSON.stringify(queryres));
                    var response = respose[0].count;
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetSupplierInvAmt error :', error)
                return reject(err_code);
            }
        })
    }

    createPoPaymentSchedule(connection, po_supplier_payment_schedule_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule SET ?`, po_supplier_payment_schedule_data);
                console.log('COMMIT at createPoPaymentSchedule');
                return resolve(po_supplier_payment_schedule_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create createPoPaymentSchedule error :", err);
                return reject(err_code);
            }
        })
    }


    getMaxReceiptNumber(connection,  org_id, branch_id, kitchen_id, indent_number,item_code) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT max(receipt_num) AS receipt_num FROM ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt WHERE org_id='${org_id}' AND 
                branch_id='${branch_id}' and  kitchen_id='${kitchen_id}' AND indent_number='${indent_number}' AND item_code='${item_code}'`;
                
                console.log("getMaxReceiptNumber", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Billing Not Found!.', queryres);
                    return resolve(null)
                }
                else{
                    var _response = JSON.parse(JSON.stringify(queryres));
                    var response = _response[0];
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getBillingByBranchId Error :', error)
                return reject(err_code);
            }
        })
    }

    getGoodreceiptListGrpbyinvno(connection,  org_id, branch_id, kitchen_id, indent_number) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `SELECT supp_inv_number,sum(gr_kitchen_inv_amt) as gr_kitchen_inv_amt FROM ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt
                  where org_id='${org_id}' and branch_id='${branch_id}' and kitchen_id='${kitchen_id}' and indent_number='${indent_number}' group by supp_inv_number `;

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
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    getSuppPaymentData(connection, org_id, branch_id, kitchen_id, indent_number, supp_inv_number) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule WHERE org_id='${org_id}' AND branch_id='${branch_id}' 
                and kitchen_id='${kitchen_id}' and indent_number='${indent_number}' AND supplier_invoice_num='${supp_inv_number}'`;
                console.log("getSuppPaymentData", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, getSuppPaymentData Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(null)
                }
                else{
                    var respose = JSON.parse(JSON.stringify(queryres));
                    var response = respose[0];
                    return resolve(response)
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getSuppPaymentData error :', error)
                return reject(err_code);
            }
        })
    }

    updatePoPaymentSchedule(connection, po_supplier_payment_schedule_update_data, data, supp_inv_number) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule SET ? WHERE org_id='${data.org_id}' AND 
                branch_id='${data.branch_id}' and kitchen_id='${data.kitchen_id}' and indent_number='${data.indent_number}' AND 
                supplier_invoice_num='${supp_inv_number}'`, po_supplier_payment_schedule_update_data);
                console.log('COMMIT at updatePoDetail--->',po_supplier_payment_schedule_update_data, data, supp_inv_number);
                return resolve(po_supplier_payment_schedule_update_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updatePoDetail Error :", err);
                return reject(err_code);
            }
        })
    }

    GetPoDetails(connection, org_id, branch_id, indent_num) {
        return new Promise(async(resolve, reject)=> {
            try{
                var custQuery, inv_status;
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.indent_detail WHERE org_id='${org_id}' AND branch_id='${branch_id}' AND indent_number='${indent_num}'`;
                console.log("GetPoDetail", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, GetPoDetail Not Found!.', queryres);
                    var error_code = { status: 404, code: 4001, message: "Sorry, Data Not Found!.", developerMessage: "Sorry, Data Not Found!." };
                    return resolve(null)
                }
                else{
                    return resolve(queryres);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('GetPoDetail error :', error)
                return reject(err_code);
            }
        })
    }

    updatePoDetails(connection, update_indent_detail, org_id, branch_id, indent_num) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.indent_detail SET ? WHERE 
                org_id='${org_id}' AND branch_id='${branch_id}' AND indent_number='${indent_num}'`, update_indent_detail);
                console.log('COMMIT at updatePoDetails');
                return resolve(update_indent_detail);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updatePoDetails Error :", err);
                return reject(err_code);
            }
        })
    }
    
    getGoodreceiptList(connection,  org_id, branch_id, kitchen_id, indent_number, item_code) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `SELECT org_id,branch_id,kitchen_id,indent_number,DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date,item_code,receipt_num,gr_qty_received,
                DATE_FORMAT(receipt_date,'%Y-%m-%d') as receipt_date,supp_inv_number,gr_kitchen_inv_amt,DATE_FORMAT(supp_inv_date,'%Y-%m-%d') as  supp_inv_date FROM ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt 
                where org_id='${org_id}' and branch_id='${branch_id}' and kitchen_id='${kitchen_id}' and indent_number='${indent_number}' and item_code='${item_code}' ORDER BY indent_number,item_code,receipt_num `;

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
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    GetPoSupplierScheduleList(connection, org_id,branch_id,kitchen_id,query) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                if(query.filter.payment_status) {
                    custQuery = `SELECT *,DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date, DATE_FORMAT(payment_date,'%Y-%m-%d') as payment_date
                    FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    kitchen_id='${kitchen_id}' and Payment_status='${query.filter.payment_status}' ORDER BY payment_date`;
                }
                else{
                    custQuery = `SELECT *,DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date, DATE_FORMAT(payment_date,'%Y-%m-%d') as payment_date
                    FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    kitchen_id='${kitchen_id}'   ORDER BY payment_date`; 
                }

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
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    getMaxPoSupplierPayment(connection, kitchen_id, indent_number, supplier_invoice_num) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }
                var custQuery = `SELECT max(payment_num) AS payment_num FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment WHERE kitchen_id='${kitchen_id}' 
                AND indent_number='${indent_number}' AND supplier_invoice_num='${supplier_invoice_num}'`;
                
                console.log("getMaxReceiptNumber", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log('Sorry, Billing Not Found!.', queryres);
                    return resolve(null)
                }
                else{
                    var _response = JSON.parse(JSON.stringify(queryres));
                    var response = _response[0];
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getBillingByBranchId Error :', error)
                return reject(err_code);
            }
        })
    }

    createPoSupplierPayment(connection, po_supplier_payment_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment SET ?`, po_supplier_payment_data);
                console.log('COMMIT at createPoSupplierPayment');
                return resolve(po_supplier_payment_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create createPoSupplierPayment error :", err);
                return reject(err_code);
            }
        })
    }

    GetPoSupplierSchedule(connection, org_id,branch_id,indent_number, kitchen_id,supplier_invoice_num) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                custQuery = `SELECT *,DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date, DATE_FORMAT(payment_date,'%Y-%m-%d') as payment_date
                    FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    kitchen_id='${kitchen_id}' and indent_number='${indent_number}' AND supplier_invoice_num='${supplier_invoice_num}'`; 

                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    updatePoPaySchedule(connection, update_po_supplier_payment_schedule_data, data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule SET ? WHERE org_id='${data.org_id}' AND 
                branch_id='${data.branch_id}' and kitchen_id='${data.kitchen_id}' and indent_number='${data.indent_number}' AND 
                supplier_invoice_num='${data.supplier_invoice_num}'`, update_po_supplier_payment_schedule_data);
                console.log('COMMIT at updatePoDetail');
                return resolve(update_po_supplier_payment_schedule_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("updatePoDetail Error :", err);
                return reject(err_code);
            }
        })
    }

    getPoSupplierPayment(connection, org_id, branch_id, indent_number, kitchen_id, supplier_invoice_num, payment_num) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                custQuery = `SELECT *,DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date, DATE_FORMAT(payment_date,'%Y-%m-%d') as payment_date
                    FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    kitchen_id='${kitchen_id}' and indent_number='${indent_number}' AND supplier_invoice_num='${supplier_invoice_num}' AND payment_num='${payment_num}'`; 

                console.log(custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    updatePoSupplierPayment(connection, po_supplier_payment_data, org_id, branch_id, indent_number, kitchen_id, supplier_invoice_num, payment_num) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment SET ? WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                kitchen_id='${kitchen_id}' and indent_number='${indent_number}' AND supplier_invoice_num='${supplier_invoice_num}' AND payment_num='${payment_num}'`, po_supplier_payment_data);
                console.log('COMMIT at updatePoSupplierPayment');
                return resolve(po_supplier_payment_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create updatePoSupplierPayment error :", err);
                return reject(err_code);
            }
        })
    }

    GetPoSupplierScheduleCount(connection, org_id,branch_id,indent_number, kitchen_id) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                custQuery = `SELECT COUNT(*) as count
                    FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    kitchen_id='${kitchen_id}' and indent_number='${indent_number}' AND payment_status <>'P'`; 

                console.log("GetPoSupplierScheduleCount",custQuery);
                
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0].count;
                    return resolve(response);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    getReceiptPayData(connection, org_id, branch_id, trans_id) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                custQuery = `SELECT * FROM ${process.env.WRITE_DB_DATABASE}.Rcpt_Pay_Details  WHERE org_id='${org_id}' and branch_id='${branch_id}' 
                and trans_id='${trans_id}'`; 
                console.log(custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch (err) {
                console.log(err);
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in getReceiptPayData:", err);
                return reject(err_code);
            }
        })
    }

    createReceiptPayData(connection, receipt_payments_data) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.Rcpt_Pay_Details SET ?`, receipt_payments_data);
                console.log('COMMIT at createReceiptPayData');
                return resolve(receipt_payments_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create createReceiptPayData error :", err);
                return reject(err_code);
            }
        })
    }

    updateReceiptPayData(connection, receipt_payments_data, org_id, branch_id, trans_id) {
        return new Promise(async(resolve, reject) => {
            try {
                if(connection == null ) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage:"DB Connection Failed!." };
                    return reject (err_code)
                }
                await connection.query(`UPDATE ${process.env.WRITE_DB_DATABASE}.Rcpt_Pay_Details SET ? WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                trans_id='${trans_id}'`, receipt_payments_data);
                console.log('COMMIT at updateReceiptPayData');
                return resolve(receipt_payments_data);
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log("create updateReceiptPayData error :", err);
                return reject(err_code);
            }
        })
    }

    getReceiptPaymentId(connection, branch_id, seq_type) {
        return new Promise(async(resolve, reject)=> {
            try{
                if(connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!", developerMessage:"DB Connection Failed!"};
                    return reject(err_code);
                }

                var custQuery = `SELECT concat(concat(branch_id),LPAD(last_seq_no+1,6,'0')) as trans_id ,last_seq_no+1 as last_seq_no 
                FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;
                console.log("getReceiptPaymentId", custQuery)
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    console.log("Firtst time");
                    var new_patient_data = {
                        seq_type: seq_type,
                        branch_id: branch_id,
                        last_seq_no: 0,
                        branch_pad: 'Y'
                    }
                    await connection.query(`INSERT INTO ${process.env.WRITE_DB_DATABASE}.vts_seq_generator SET ?`, new_patient_data);

                    var newpatientquery = `SELECT concat(concat(branch_id),LPAD(1,5,'0')) as trans_id ,last_seq_no as last_seq_no 
                    FROM ${process.env.WRITE_DB_DATABASE}.vts_seq_generator WHERE branch_id='${branch_id}' AND seq_type='${seq_type}'`;

                    console.log("getReceiptPaymentId", newpatientquery)
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
                    WHERE  branch_id='${branch_id}' AND seq_type='${seq_type}'`);
                    return resolve(response);
                }
            }
            catch(error) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage:"Sorry, Internal Server Error!." };
                console.log('getReceiptPaymentId error :', error)
                return reject(err_code);
            }
        })
    }

    GetReceiptPayments(connection, org_id,branch_id,account_type,from_date,to_date,query) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                
                    custQuery = `SELECT *, DATE_FORMAT(trans_date,'%Y-%m-%d') as trans_date, DATE_FORMAT(voucher_date,'%Y-%m-%d') as voucher_date,
                    (select ref_desc from ${process.env.WRITE_DB_DATABASE}.vts_ref_master e  where e.ref_code=payment_mode and e.ref_type="PAYMOD") as payment_mode_name  
                    FROM ${process.env.WRITE_DB_DATABASE}.Rcpt_Pay_Details  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    account_type='${account_type}' and trans_date between '${from_date}' and '${to_date}'   ORDER BY trans_date`; 
                

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
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }

    GetPoSupplierPayments(connection, org_id,branch_id,kitchen_id,indent_number,supplier_invoice_num,query) {
        return new Promise(async (resolve, reject) => {
            try {
                var custQuery;
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                
                    custQuery = `SELECT *, DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date, DATE_FORMAT(payment_date,'%Y-%m-%d') as payment_date,
                    (select ref_desc from ${process.env.WRITE_DB_DATABASE}.vts_ref_master e  where e.ref_code=payment_mode and e.ref_type="PAYMOD") as payment_mode_name  
                    FROM ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment  WHERE org_id='${org_id}' and branch_id='${branch_id}' and 
                    kitchen_id='${kitchen_id}' and indent_number='${indent_number}' and supplier_invoice_num='${supplier_invoice_num}'    ORDER BY payment_date`; 
                

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
                console.log("Fetch patient advance :", err);
                return reject(err_code);
            }
        })
    }
    
     GetGoodReceiptReportList(connection, org_id,branch_id,from_date, to_date) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
         
                var custQuery = `select d.supplier_name,a.indent_number,a.indent_date, c.supp_inv_number,c.supp_inv_date,e.product_name,
                b.qty_ordered,c.gr_qty_received,b.qty_balance,f.ref_desc item_status,g.ref_desc goods_rcpt_status
                from  ${process.env.WRITE_DB_DATABASE}.indent_header a,  ${process.env.WRITE_DB_DATABASE}.indent_detail b,  ${process.env.WRITE_DB_DATABASE}.PO_Goods_Receipt c,
                ${process.env.WRITE_DB_DATABASE}.Supplier_Master d,  ${process.env.WRITE_DB_DATABASE}.Product_Master e,  ${process.env.WRITE_DB_DATABASE}.vts_ref_master f,
                ${process.env.WRITE_DB_DATABASE}. vts_ref_master g
                where a.org_id='${org_id}' and a.branch_id='${branch_id}' and a.indent_number=b.indent_number and b.indent_number=c.indent_number and b.item_code=c.item_code
                and a.kitchen_id=d.kitchen_id and b.item_code=e.product_id and b.item_status=f.ref_code and f.ref_type="ITMSTA"
                and a.goods_rcpt_status=g.ref_code and g.ref_type="GRSTA" and a.indent_date between '${from_date}' and '${to_date}'
                order by d.supplier_name,a.indent_number,b.item_code,c.receipt_num`;
                
                console.log("GetGoodReceiptReportList Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 500, code: 5001, message: "Sorry, Data Not Available!.", developerMessage: "Sorry, Data Not Available!." };
                    console.log("GetGoodReceiptReportList:", error_code);
                    return resolve(error_code);
                }
                else{
                    return resolve(queryres); 
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetGoodReceiptReportList:", err);
                return reject(err_code);
            }
        })
    }

    GetSupplierPaymentReportList(connection, org_id,branch_id,from_date, to_date) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `Select c.supplier_name,a.indent_number,a.indent_date,b.supplier_invoice_num,b.supp_inv_date,e.payment_date,b.kitchen_inv_amt,b.kitchen_inv_amt_paid,
                b.kitchen_inv_amt_bal,d.ref_desc status,if(b.payment_status="U","Not Fully Paid","Fully Paid") payment_status,
                e.payment_value, f.ref_desc payment_mode, e.payment_desc FROM  ${process.env.WRITE_DB_DATABASE}.indent_header a,  ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule b,
                ${process.env.WRITE_DB_DATABASE}. Supplier_Master c,  ${process.env.WRITE_DB_DATABASE}.vts_ref_master d,
                ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment e,  ${process.env.WRITE_DB_DATABASE}.vts_ref_master f 
                WHERE a.kitchen_id=c.kitchen_id and a.org_id=c.org_id and a.org_id='${org_id}' 
                and a.branch_id='${branch_id}' and a.indent_number=b.indent_number and a.status=d.ref_code and d.ref_type="POSTA"
                and b.indent_number=e.indent_number and b.supplier_invoice_num = e.supplier_invoice_num and b.kitchen_id=e.kitchen_id
                and e.payment_mode=f.ref_code and f.ref_type="PAYMOD" and a.indent_date between '${from_date}' and '${to_date}'
                order by c.supplier_name, a.indent_number, b.supplier_invoice_num, e.payment_num`;
                
                console.log("GetSupplierPaymentReportList Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 500, code: 5001, message: "Sorry, Data Not Available!.", developerMessage: "Sorry, Data Not Available!." };
                    console.log("GetSupplierPaymentReportList:", error_code);
                    return resolve(error_code);
                }
                else{
                    return resolve(queryres); 
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetSupplierPaymentReportList:", err);
                return reject(err_code);
            }
        })
    }

    GetPoInvoiceSummaryReportList(connection, org_id,branch_id,from_date,to_date) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                // var custQuery = `Select c.kitchen_id,c.supplier_name,sum(b.kitchen_inv_amt) kitchen_inv_amt ,sum(b.kitchen_inv_amt_paid) kitchen_inv_amt_paid,
                // sum(b.kitchen_inv_amt_bal) kitchen_inv_amt_bal from indent_header a, PO_Supplier_Payment_schedule b, Supplier_Master c 
                // where a.kitchen_id=c.kitchen_id and  a.org_id=b.org_id  and                    
                // a.org_id=b.org_id and a.branch_id='${branch_id}' and a.indent_number=b.indent_number  and a.indent_date between '${from_date}' and '${to_date}'  
                // group by c.supplier_name ,c.kitchen_id  order by c.supplier_name`;  
                   
           
                var custQuery = ` Select c.kitchen_id,c.supplier_name,sum(b.kitchen_inv_amt) kitchen_inv_amt ,sum(b.kitchen_inv_amt_paid) kitchen_inv_amt_paid,
                sum(b.kitchen_inv_amt_bal) kitchen_inv_amt_bal
                from ${process.env.WRITE_DB_DATABASE}.indent_header a, ${process.env.WRITE_DB_DATABASE}.PO_Supplier_Payment_schedule b, ${process.env.WRITE_DB_DATABASE}.Supplier_Master c
                where a.kitchen_id=c.kitchen_id and a.org_id=c.org_id and a.org_id=b.org_id and a.branch_id=b.branch_id and
                a.indent_number=b.indent_number  and a.indent_date between '${from_date}' and '${to_date}' and a.org_id='${org_id}' and a.branch_id='${branch_id}'
                group by c.supplier_name,c.kitchen_id    
               order by c.supplier_name`;
                
                console.log("GetPoSummaryReportList Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 500, code: 5001, message: "Sorry, Data Not Available!.", developerMessage: "Sorry, Data Not Available!." };
                    console.log("GetPoSummaryReportList:", error_code);
                    return resolve(error_code);
                }
                else{
                    return resolve(queryres); 
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetPoSummaryReportList:", err);
                return reject(err_code);
            }
        })
    }

    GetPoInvoiceDetailReportList(connection, org_id,branch_id,kitchen_id,from_date,to_date) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
              /*  var custQuery = `     Select c.supplier_name,a.indent_number,a.indent_date,b.supplier_invoice_num,b.payment_date,b.kitchen_inv_amt,b.kitchen_inv_amt_paid,
                b.kitchen_inv_amt_bal,d.ref_desc status,e.ref_desc goods_rcpt_status
                 ,if(b.payment_status="U","Not Fully Paid","Fully Paid") payment_status
                from indent_header a, PO_Supplier_Payment_schedule b, Supplier_Master c, vts_ref_master d, vts_ref_master e
                where a.kitchen_id='${kitchen_id}' and a.org_id='${org_id}' and a.org_id=b.org_id and a.branch_id='${branch_id}' and a.indent_number=b.indent_number 
                and a.status=d.ref_code and d.ref_type="POSTA" and 
                a.goods_rcpt_status=e.ref_code and e.ref_type="GRSTA" and a.indent_date between '${from_date}' and '${to_date}'
                order by c.supplier_name, a.indent_number`;  */
                   

                var custQuery = `Select c.supplier_name,a.indent_number,a.indent_date,b.supplier_invoice_num,b.payment_date,b.kitchen_inv_amt,b.kitchen_inv_amt_paid,
                 b.kitchen_inv_amt_bal,d.ref_desc status,e.ref_desc goods_rcpt_status
                ,if(b.payment_status="U","Not Fully Paid","Fully Paid") payment_status
                from indent_header a, PO_Supplier_Payment_schedule b, Supplier_Master c, vts_ref_master d, vts_ref_master e
   where a.kitchen_id=c.kitchen_id and 
       a.org_id=c.org_id and
       a.org_id=b.org_id and a.branch_id=b.branch_id  and a.indent_number=b.indent_number 
       and 
       a.status=d.ref_code and d.ref_type="POSTA" and
       a.indent_date between '${from_date}' and '${to_date}' and 
       a.goods_rcpt_status=e.ref_code and e.ref_type="GRSTA"   and a.kitchen_id='${kitchen_id}'  and a.org_id='${org_id}' and a.branch_id='${branch_id}'
       order by c.supplier_name, a.indent_number`;
                
                console.log("GetPoSummaryReportList Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    var error_code = { status: 500, code: 5001, message: "Sorry, Data Not Available!.", developerMessage: "Sorry, Data Not Available!." };
                    console.log("GetPoSummaryReportList:", error_code);
                    return resolve(error_code);
                }
                else{
                    return resolve(queryres); 
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetPoSummaryReportList:", err);
                return reject(err_code);
            }
        })
    }
   
    GetFromEmailData(connection, org_id, branch_id) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `Select branch_name, branch_address, branch_contact_num, branch_email_id 
                from branch_master where org_id='${org_id}' and branch_id='${branch_id}'`;
                
                console.log("GetFromEmailData Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response); 
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetFromEmailData:", err);
                return reject(err_code);
            }
        })
    }

    GetToEmailData(connection, org_id, kitchen_id) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `Select supplier_name, supplier_address,supplier_contact_num,supplier_email_id
                from Supplier_Master where org_id='${org_id}'  and kitchen_id='${kitchen_id}'`;
                
                console.log("GetToEmailData Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetToEmailData:", err);
                return reject(err_code);
            }
        })
    }

    GetPoData(connection, indent_number) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `Select *, DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date from indent_header where indent_number='${indent_number}'`;
                
                console.log("GetPoEmailData Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetPoEmailData:", err);
                return reject(err_code);
            }
        })
    }

    GetPoEmailData(connection, org_id, indent_number) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `Select indent_number, DATE_FORMAT(indent_date,'%Y-%m-%d') as indent_date from indent_header where org_id='${org_id}' and indent_number='${indent_number}' and status="S"`;
                
                console.log("GetPoEmailData Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    var res = JSON.parse(JSON.stringify(queryres));
                    var response = res[0];
                    return resolve(response);
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetPoEmailData:", err);
                return reject(err_code);
            }
        })
    }

    GetPoEmailBodyData(connection, org_id, indent_number) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `select  b.product_name, a.qty_ordered,DATE_FORMAT(exp_del_date,'%Y-%m-%d') as exp_del_date, remarks,c.branch_name, 
                'NA' AS 'unit_price', 'NA' AS 'amount' from indent_detail a, Product_Master b, branch_master c, indent_header d
                where a.org_id='${org_id}' and a.indent_number ='${indent_number}' and d.status="S" and a.indent_number=d.indent_number and a.org_id=d.org_id 
                and a.branch_id=d.branch_id and a.kitchen_id=d.kitchen_id and a.item_code=b.product_id  and a.del_branch_id=c.branch_id`;
                
                console.log("GetPoEmailBodyData Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetPoEmailBodyData:", err);
                return reject(err_code);
            }
        })
    }

    GetPoEmailFooterData(connection, org_id, indent_number) {
        return new Promise(async (resolve, reject) => {
            try {
                if (connection == null) {
                    var err_code = { status: 500, code: 5001, message: "DB Connection Failed!.", developerMessage: "DB Connection Failed!." };
                    return reject(err_code)
                }
                var custQuery = `Select branch_name, branch_address, branch_contact_num, branch_email_id from branch_master where org_id='${org_id}' and branch_id in 
                ( select distinct  del_branch_id from indent_detail a, indent_header b where a.org_id='${org_id}' and a.indent_number ='${indent_number}' and b.status="S"
                     and a.indent_number=b.indent_number and a.org_id=b.org_id and a.branch_id=b.branch_id and a.kitchen_id=b.kitchen_id)`;
                
                console.log("GetPoEmailFooterData Query", custQuery);
                let queryres = await connection.query(custQuery);
                if(queryres.length == 0) {
                    return resolve(null);
                }
                else{
                    return resolve(queryres);
                }
            }
            catch (err) {
                var err_code = { status: 500, code: 5001, message: "Sorry, Internal Server Error!.", developerMessage: "Sorry, Internal Server Error!." };
                console.log("Error in GetPoEmailFooterData:", err);
                return reject(err_code);
            }
        })
    }
}

module.exports = {
    IndentDao
}