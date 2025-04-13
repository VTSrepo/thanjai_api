const { DashboardDao } = require('../dao/dashboard_dao');
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

class DashboardModule {   

    getProductDashboard(org_id, query) {
        return new Promise(async(resolve, reject) => {
            var dashboardDao = new DashboardDao();
            var connection = null;            
            var strSkip = (query.skip ? query.skip : 0);
            var strLimit = (query.limit ? query.limit : 2000);
            var strPagination = strSkip + ',' + strLimit;
            var get_business;
            try {
                connection = await dashboardDao.getReadConnection();
                debug("query.filter", query)
                if(query.filter.hasOwnProperty('start_date')) {                    
                    get_business = await dashboardDao.getProductDashboard(connection, query.filter, org_id);
                    if(get_business.hasOwnProperty('status') && get_business.status == 404) {
                        if (connection) {
                            await dashboardDao.releaseReadConnection(connection);
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
                            summary, dashboard: get_business
                        }
                        if (connection) {
                            await dashboardDao.releaseReadConnection(connection);
                        }
                        return resolve(res)
                    }
                }
                else{
                    var res = {
                        status: 204, code: 201, 
                        message: "No Data Available", 
                        developerMessage: "Success" ,                        
                    }
                    if (connection) {
                        await dashboardDao.releaseReadConnection(connection);
                    }
                    return reject(res)
                }
            }
            catch(error) {
                if (connection) {
                    await dashboardDao.releaseReadConnection(connection);
                }
                return reject(error)
            }
        })
    }
}

module.exports = {
    DashboardModule
}