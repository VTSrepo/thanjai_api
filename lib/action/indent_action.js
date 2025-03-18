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
                    console.log("Error data ", _response);
                context.done(null, SendResponse(401, response))
                 } else{
                    console.log("Success____> ", response);
                context.done(null, SendResponse(200, response));
                }
            })
            .catch(function(err){
                console.log("Error >>>>>>",err);
                context.done(null, SendResponse(500, err));
            })
        }

    


indentSubmission(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.indentSubmission(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetIndentListsByOrgId(event, context) {      
        var org_id = event.pathParameters.org_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetIndentListsByOrgId(org_id,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetIndentListsByBranchId(event, context) {      
        var kitchen_id = event.pathParameters.kitchen_id;
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetIndentListsByBranchId(branch_id, kitchen_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetIndentDetail(event, context) {      
        var indent_number = event.pathParameters.indent_number;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetIndentDetail(indent_number,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetSupplierListByBranchId(event, context) {      
        var org_id = event.pathParameters.org_id;
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetSupplierList(org_id, branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }


    GetSupplierProductList(event, context) {      
        var supplier_id = event.pathParameters.supplier_id;
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetSupplierProductList(branch_id, supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetGoodReceiptList(event, context) {      

        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var supplier_id = event.pathParameters.supplier_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetGoodReceiptList(org_id,branch_id, supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    indentGoodsReceipt(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.indentGoodsReceipt(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetIndentSuppScheduleList(event, context) {      
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var supplier_id = event.pathParameters.supplier_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetIndentSupplierScheduleList(org_id,branch_id, supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    CreateIndentSuppScheduleList(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.CreateIndentSuppScheduleList(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    CreateReceiptsPayments(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_indent_data(event.body)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.CreateReceiptsPayments(body_data,  query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }


    GetReceiptsPayments(event, context) {      
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;

        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetReceiptsPayments(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }


    GetIndentSupplierPayments(event, context) {      
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var supplier_id = event.pathParameters.supplier_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetIndentSupplierPayments(org_id,branch_id,supplier_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }
    
        GetGoodReceiptReindentrtList(event, context) {
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetGoodReceiptReindentrtList(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetSupplierPaymentReindentrtList(event, context) {
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetSupplierPaymentReindentrtList(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
        })
    }

    GetIndentInvoiceSummaryReindentrtList(event, context) {
        var org_id = event.pathParameters.org_id;       
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_resindentnse) {
            debug("validate data ", _resindentnse);
            return indentModule.GetIndentInvoiceSummaryReindentrtList(org_id,branch_id, query)
        })
        .then(function(resindentnse){
            if(resindentnse.hasOwnProperty('status') && (resindentnse.status == 404))
            context.done(null, SendResindentnse(401, resindentnse))
            else
            context.done(null, SendResindentnse(200, resindentnse));
        })
        .catch(function(err){
            context.done(null, SendResindentnse(500, err));
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

module.exports = {
    IndentAction,
}