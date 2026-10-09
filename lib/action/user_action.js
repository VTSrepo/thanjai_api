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

// Role must exist, be active and be meant for the user's type
const checkRole = async (u) => {
    if (!u || !u.role_id) return null;
    const { roleModule, clearCache } = require('../modules/role_module');
    const conn = await roleModule.getReadConnection();
    try {
        const [r] = await conn.query(`SELECT scope, status FROM role_master WHERE org_id = ? AND role_id = ?`, [u.org_id, u.role_id]);
        clearCache();
        if (!r || r.status !== 'A') return 'Choose an active role';
        if (u.user_type && r.scope !== u.user_type) return 'This role is for a different user type';
        return null;
    } finally {
        await roleModule.releaseReadConnection(conn);
    }
};

function validate_data_for_create_user_data(user_data) {
    return new Promise(async (resolve, reject) => {
        const u = user_data && user_data.user;
        if (u && u.user_type && !['A', 'O', 'K', 'B', 'X'].includes(u.user_type)) {
            return reject({ status: 400, code: 4000, message: 'Choose a valid user type' });
        }
        try {
            const msg = await checkRole(u);
            if (msg) return reject({ status: 400, code: 4000, message: msg });
        } catch (e) {
            return reject({ status: 500, code: 5001, message: 'Sorry, Internal Server Error!.' });
        }
        return resolve(user_data);
    })
}

module.exports = {
    UserAction,
}