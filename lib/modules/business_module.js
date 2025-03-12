const { BusinessDao } = require('../dao/business_dao');
var debug = require('debug')('v2:business:module');
const {changeLog} = require('../../common/error_handling');
var moment = require('moment-timezone');
const { GetRandomPatientID } = require('../../common/app_utils');

function generateParamString(query) {
    var key;
    var keys = new Array();
    var values = new Array();

    for (key in query.filter) {
        if (query.filter.hasOwnProperty(key)) {
            keys.push(key);
            values.push(query.filter[key])
        }
    }
    var strParams = '';

    for (i = 0; i < keys.length; i++) {
        var str = (keys.length - 1 != i) ? ' && ' : '';
        strParams += keys[i] + '=' + values[i] + str

    }
    // console.log('Parameters for query :',strParams)
    return strParams;
}

function generateSortOrder(query) {
    var key;
    var keys = new Array();
    var values = new Array();

    for (key in query.sort) {
        if (query.sort.hasOwnProperty(key)) {
            keys.push(key);
            values.push(query.sort[key])
        }
    }
    var strSortParams = ' ORDER BY ';

    for (i = 0; i < keys.length; i++) {
        var order = (values[i] == '-1') ? 'DESC' : 'ASC';
        var str = (keys.length - 1 != i) ? ', ' : '';
        strSortParams += keys[i] + ' ' + order + str
    }

    // console.log('Parameters for Sorting :',strSortParams)
    return strSortParams;
}

class BusinessModule {

    getBusinessDetail(bu_id, org_id, query) {
        return new Promise(async(resolve, reject) => {
            var businessDao = new BusinessDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var get_business;
            
            try {
                connection = await businessDao.getReadConnection();
                get_business = await businessDao.GetBusinessDetail(connection, bu_id, org_id);
                if(get_business.hasOwnProperty('status') && get_business.status == 404) {
                    if (connection) {
                        await businessDao.releaseReadConnection(connection);
                    }
                    var res={
                        status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            business:get_business
                    }
                    return resolve(res);
                }
                else{
                    if (connection) {
                        await businessDao.releaseReadConnection(connection);
                    }
                    var _response = JSON.parse(JSON.stringify(get_business));
                    var response = _response[0];
                    var res={
                        status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            business:response
                    }
                    return resolve(res)
                }
            }
            catch(error) {
                if (connection) {
                    await businessDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }

    getBusiness(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var businessDao = new BusinessDao();
            var connection = null;
            var today = new Date();
            var date = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_business, get_business_count;
            try {
                connection = await businessDao.getReadConnection();
                debug("query.filter", query)
                if(query.filter.hasOwnProperty('bu_id')) {
                    get_business = await businessDao.GetBusinessDetail(connection, query.filter.bu_id, org_id);
                    if(get_business.hasOwnProperty('status') && get_business.status == 404) {
                        if (connection) {
                            await businessDao.releaseReadConnection(connection);
                        }
                        return resolve(get_business);
                    }
                    else{
                        var total_size = 1;
                        var page_size = 1;
                        var result_size = 1;
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            summary, businesses: get_business
                        }
                        if (connection) {
                            await businessDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                }
                else{
                    get_business = await businessDao.getBusinessbyOrgId(connection, org_id, strPagination);
                    if(get_business.hasOwnProperty('status') && get_business.status == 404) {
                        if (connection) {
                            await businessDao.releaseReadConnection(connection);
                        }
                        return resolve(get_business);
                    }
                    else{
                        get_business_count = await businessDao.getCountBusinessbyOrgId(connection, org_id);
                        var total_size = get_business_count;
                        var page_size = query.skip ? query.skip : get_business_count;
                        var result_size = strLimit;
                        console.log("Totalsize :", total_size);
                        var summary = {
                            filteredsize: page_size, resultsize: result_size, totalsize: total_size
                        };
                        var res = {
                            status: 200, code: 200, 
                            message: "Success", 
                            developerMessage: "Success" ,
                            summary, businesses: get_business
                        }
                        if (connection) {
                            await businessDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                }
            }
            catch(error) {
                if (connection) {
                    await businessDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
}

module.exports = {
   BusinessModule
}