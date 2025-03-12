const { SendResponse } = require('../../common/app_utils');
const { MasterModule } = require('../modules/master_module');
var debug = require('debug')('v2:users:actions');

var masterModule = new MasterModule();
class MasterAction {

    GetReferenceList(event, context) {
        var query = event.queryParameters;
        var ref_type = event.pathParameters.ref_type;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.getReferenceList(ref_type,  query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }
    

    GetOptholParamList(event, context) {
        var query = event.queryParameters;
        var org_id = event.pathParameters.org_id;
        var param_type = event.pathParameters.param_type;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.GetOptholParamList(org_id,param_type,  query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }
    LabTestList(event, context) {
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.getLabTestLists(query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    fetchVitalParams(event, context) {      
        // var body_data = event.body;
         var query = event.queryParameters;
         validate_data(event)       
         .then(function(_response) {
             debug("validate data ", _response);
             console.log('in acction');
             return masterModule.fetchVitalParams(query)
         })
         .then(function(response){
             if(response.hasOwnProperty('status') && (response.status == 404))
             context.done(null, SendResponse(401, response))
             else
             context.done(null, SendResponse(200, response));
         })
         .catch(function(err){
             context.done(null, SendResponse(500, err));
         })
     }


     GetEOD(event, context) {
        var query = event.queryParameters;
        var org_id = event.pathParameters.org_id;
        var branch_id = event.pathParameters.branch_id;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.GetEOD(query,org_id,branch_id)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }
    createEOD(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_eod_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.CreateEod(body_data,  query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404)){
            context.done(null, SendResponse(401, response))
            }
            else{
                //
            context.done(null, SendResponse(200, response));
           
            }
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetBranchList(event, context) {
        var query = event.queryParameters;
        var org_id = event.pathParameters.org_id;
        debug("shan data ", org_id);
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.GetBranchList(query,org_id  )
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    GetAccountListByOrgId(event, context) {      
        var org_id = event.pathParameters.org_id;
      
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.GetAccountList(org_id, query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

    createAccount(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return masterModule.CreateAccount(body_data,  query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(500, err));
        })
    }

}

function validate_data_for_create_eod_data(eod_data) {
    return new Promise((resolve, reject) => {
        return resolve(eod_data)
    })
}

function validate_data(data) {
    
    return new Promise((resolve, reject) => {
        return resolve(data)
    })
}

module.exports = {
    MasterAction
}