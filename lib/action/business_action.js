const { SendResponse } = require('../../common/app_utils');
const { BusinessModule } = require('../modules/business_module');
var debug = require('debug')('v2:business:actions');

var businessModule = new BusinessModule();
class BusinessAction {

    GetBusiness(event, context) {
        var org_id = event.pathParameters.org_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return businessModule.getBusiness(org_id, query)
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

    GetBusinessDetail(event, context) {      
        var bu_id = event.pathParameters.bu_id;
        var org_id = event.pathParameters.org_id;   
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return businessModule.getBusinessDetail(bu_id, org_id,  query)
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

function validate_data(data) {
    return new Promise((resolve, reject) => {
        return resolve(data);
    })
}
module.exports = {
    BusinessAction,
}