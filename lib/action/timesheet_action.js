const { SendResponse } = require('../../common/app_utils');
const { TimesheetModule } = require('../modules/timesheet_module');
var debug = require('debug')('v1:production:actions');

var timesheetModule = new TimesheetModule();
class TimesheetAction {


    GetTimesheets(event, context) {
        var org_id = event.pathParameters.org_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return timesheetModule.getTimesheets( org_id,query)
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
    GetEmployees(event, context) {
        var org_id = event.pathParameters.org_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return timesheetModule.getEmployees( org_id,query)
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

    CreateTimesheet(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        console.log('inside action')
        validate_data_create_timesheet(event.body.timesheet)       
        .then(function(_response) {
            debug("validate data ", _response);
            return timesheetModule.createTimesheet(body_data.timesheet,  query)
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
    

   //Old
    
    GetProductDetail(event, context) {      
        var product_id = event.pathParameters.product_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return timesheetModule.getProductDetail(product_id, query)
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

function validate_data_create_timesheet(product_data) {
    return new Promise((resolve, reject) => {
        return resolve(product_data)
    })
}
function validate_data(data) {
    return new Promise((resolve, reject) => {
        return resolve(data);
    })
}
module.exports = {
    TimesheetAction,
}