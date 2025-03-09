const { SendResponse } = require('../../common/app_utils');
const { UserModule } = require('../modules/user_module');
var debug = require('debug')('v2:users:actions');

var userModule = new UserModule();
class UserAction {

    getUserLogin(event, context) {      
        //var body_data = event.body;
        //var query = event.queryParameters;
        validate_data_login(event.body)       
        .then(function(_response) {
            console.log("validate data ", _response);
            return userModule.getUserLoginDetail(event.body)
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

    

    CreateUser(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_user_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            return userModule.CreateUser(body_data,  query)
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
    

    GetUserListByBranchId(event, context) {      
        var org_id = event.pathParameters.org_id;
        var branch_id = event.pathParameters.branch_id;
        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return userModule.GetUserList(org_id, branch_id, query)
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

function validate_data_login(userdata) {
    
    return new Promise((resolve, reject) => {
        debug("userdata :", userdata)
      
        if ((!userdata.user.hasOwnProperty('user_id'))) {
            var err_response = { status: 404, code: 4004, message: "Missing User name.", developerMessage: 'Missing User name.' };
            return reject(err_response);
        }
        else if ((!userdata.user.hasOwnProperty('pwd'))) {
            var err_response = { status: 404, code: 4004, message: "Please, Enter the user Password!", developerMessage: 'Please, Enter the user Password!.' };
            return reject(err_response);
        }
        else{
                return resolve(userdata)
            }
    })
}


function validate_data(data) {
    return new Promise((resolve, reject) => {
        return resolve(data);
    })
}
function validate_data_for_create_user_data(user_data) {
    return new Promise((resolve, reject) => {
        return resolve(user_data)
    })
}

module.exports = {
    UserAction,
}