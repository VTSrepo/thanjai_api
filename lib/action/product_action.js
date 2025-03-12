const { SendResponse } = require('../../common/app_utils');
const { ProductModule } = require('../modules/product_module');
var debug = require('debug')('v2:product:actions');

var productModule = new ProductModule();
class ProductAction {

   
    GetProducts(event, context) {
        var branch_id = event.pathParameters.branch_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.getProducts(branch_id, query)
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



    GetCategoryList(event, context) {
       
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.getCategoryList( query)
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

    

    GetProductsOrgId(event, context) {
        var org_id = event.pathParameters.org_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.getProductsOrgId(org_id, query)
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

    GetProductMasterOrgId(event, context) {
        var org_id = event.pathParameters.org_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.getProductMasterOrgId(org_id, query)
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

    GetProductSellingPrice(event, context) {
        var org_id = event.pathParameters.org_id; 
        var branch_id = event.pathParameters.branch_id;
        var product_id = event.pathParameters.product_id; 
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.getProductSellingPriceList(org_id,branch_id,product_id, query)
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

    GetProductDetail(event, context) {      
        var product_id = event.pathParameters.product_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.getProductDetail(product_id, query)
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
    CreateProduct(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_product_data(event.body.product)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.CreateProduct(body_data.product,  query)
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
    
    CreateProductPricing(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_product_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.CreateProductPricing(body_data,  query)
        })
        .then(function(response){
            if(response.hasOwnProperty('status') && (response.status == 404))
            context.done(null, SendResponse(401, response))
            else
            context.done(null, SendResponse(200, response));
        })
        .catch(function(err){
            context.done(null, SendResponse(200, err));
        })
    }

    CreateProductInsurancePricing(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_product_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return productModule.CreateProductInsurancePricing(body_data,  query)
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

function validate_data_for_create_product_data(product_data) {
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
    ProductAction,
}