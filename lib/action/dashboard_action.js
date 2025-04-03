const { SendResponse } = require('../../common/app_utils');
const { DashboardModule } = require('../modules/dashboard_module');
var debug = require('debug')('v2:business:actions');

var dashboardModule = new DashboardModule();
class DashboardAction {

    GetProductDashboard(event, context) {
            var org_id = event.pathParameters.org_id; 
            var query = event.queryParameters;
            validate_data(event)       
            .then(function(_response) {
                debug("validate data ", _response);                
                return dashboardModule.getProductDashboard(org_id, query)
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
    DashboardAction,
}