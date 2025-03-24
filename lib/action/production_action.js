const { SendResponse } = require('../../common/app_utils');
const { ProductionModule } = require('../modules/production_module');
var debug = require('debug')('v1:production:actions');

var productionModule = new ProductionModule();
class ProductionAction {


    GetProductions(event, context) {
        var org_id = event.pathParameters.org_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productionModule.getProductions( org_id,query)
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
            return productionModule.getEmployees( org_id,query)
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

    CreateProduction(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_create_production(event.body.production)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productionModule.createProduction(body_data.production,  query)
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
            return productionModule.getProductDetail(product_id, query)
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

function validate_data_create_production(product_data) {
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
    ProductionAction,
}