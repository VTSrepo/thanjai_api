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
        const uid = String((body_data && body_data.user && body_data.user.user_id) || '').trim();
        if (!/^[A-Za-z0-9._@-]{3,50}$/.test(uid)) {
            return context.done(null, SendResponse(400, { status: 400, code: 4000,
                message: "User ID must be 3-50 characters: letters, numbers, . _ - @ (no spaces)",
                developerMessage: "Invalid user_id" }));
        }
        body_data.user.user_id = uid;
        validate_data_for_create_user_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            // record who made the change (the logged-in admin), not the user being saved
            const acting = (event.user && event.user.user_id) || body_data.user.user_id;
            return userModule.CreateUser({ ...body_data.user, _acting: acting },  query)
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
    


    UpdateUser(event, context) {      
        var body_data = event.body;
        var query = event.queryParameters;
        validate_data_for_create_user_data(event.body)       
        .then(function(_response) {
            debug("validate data ", _response);
            // record who made the change (the logged-in admin), not the user being saved
            const acting = (event.user && event.user.user_id) || body_data.user.user_id;
            return userModule.UpdateUser({ ...body_data.user, _acting: acting },  query)
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

    GetUserList(event, context) {      
        var org_id = event.pathParameters.org_id;

        var query = event.queryParameters;
        validate_data(event)       
        .then(function(_response) {
            debug("validate data ", _response);
            return userModule.GetUserList(org_id, query)
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