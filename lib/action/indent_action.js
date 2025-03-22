const { SendResponse } = require('../../common/app_utils');
const { IndentModule } = require('../modules/indent_module');
var debug = require('debug')('v2:billing:actions');

var indentModule = new IndentModule();
class IndentAction {

    createIndent(event, context) {      
            var body_data = event.body;
            var query = event.queryParameters;
            validate_data_for_create_indent_data(event.body.indent)       
            .then(function(_response) {
                
                return indentModule.createIndentData(body_data.indent,  query)
                
            })
            .then(function(response){
                if(response.hasOwnProperty('status') && (response.status == 404)){
                   // console.log("Error data ", response);
                context.done(null, SendResponse(401, response))
                 } else{
                   // console.log("Success____> ", response);
                context.done(null, SendResponse(200, response));
                }
            })
            .catch(function(err){
                //console.log("Error >>>>>>",err);
                context.done(null, SendResponse(500, err));
            })
        }

    


indentSubmission(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.indentSubmission(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }


    GetIndentList(event, context) {      
       var org_id = event.pathParameters.org_id;
       debug("Org_id",org_id);
       // var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetIndentList(org_id, query)
        })
        .then(function(resindentnse){
            debug("REsponse LIST--->",resindentnse);
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
           // debug("Catch LIST--->",err);
            context.done(null, SendResponse(500, err));
        })
    }

    GetIndentDetail(event, context) {      
        var org_id = event.pathParameters.org_id;
        debug("Detail Org_id",org_id)
        //var indent_number = event.pathParameters.indent_number;
        var query = event.queryParameters;
        validate_data_detail(event,query,org_id)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetIndentDetail(query.filter.indent_number,  org_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetSupplierListByBranchId(event, context) {      
        var org_id = event.pathParameters.org_id;
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetSupplierList(org_id, branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }


    GetSupplierProductList(event, context) {      
        var supplier_id = event.pathParameters.supplier_id;
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetSupplierProductList(branch_id, supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetGoodReceiptList(event, context) {      

        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var supplier_id = event.pathParameters.supplier_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetGoodReceiptList(org_id,branch_id, supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    indentGoodsReceipt(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.indentGoodsReceipt(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetIndentSuppScheduleList(event, context) {      
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var supplier_id = event.pathParameters.supplier_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetIndentSupplierScheduleList(org_id,branch_id, supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    CreateIndentSuppScheduleList(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.CreateIndentSuppScheduleList(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    CreateReceiptsPayments(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.CreateReceiptsPayments(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }


    GetReceiptsPayments(event, context) {      
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;

        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetReceiptsPayments(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }


    GetIndentSupplierPayments(event, context) {      
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var supplier_id = event.pathParameters.supplier_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetIndentSupplierPayments(org_id,branch_id,supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }
    
        GetGoodReceiptReindentrtList(event, context) {
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetGoodReceiptReindentrtList(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetSupplierPaymentReindentrtList(event, context) {
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetSupplierPaymentReindentrtList(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetIndentInvoiceSummaryReindentrtList(event, context) {
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return indentModule.GetIndentInvoiceSummaryReindentrtList(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResponse(401, resindentnse))
            else
            context.done(null, SendResponse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

  
}

function validate_data_for_create_indent_data(apindentintment_data) {
    return new Promise((resolve, reject) => {
        return resolve(apindentintment_data)
    })
}

function validate_data(data) {
    return new Promise((resolve, reject) => {
        return resolve(data);
    })
}

function validate_data_detail(event,data,org_id) {
    return new Promise((resolve, reject) => {
        if(data.filter.hasOwnProperty('indent_number') && data.filter.indent_number!=null  ) {
        }else{

            var err_response = { status: 404, code: 4004, message: "Missing Indent Number.", developerMessage: 'Missing User name.' };
            return reject(err_response);
        }
        if (org_id!=null) {
        }else{
            var err_response = { status: 404, code: 4004, message: "Missing Org ID", developerMessage: 'Missing Org ID' };
            return reject(err_response);
        }
        return resolve(event);
        
    })
}

module.exports = {
    IndentAction,
}