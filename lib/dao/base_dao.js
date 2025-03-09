const mysql = require('../../common/db_utils');
var debug = require('debug')('v2:base:dao');

module.exports = class BaseDao {
    constructor() {
    }
    getWriteConnection() {
        return new Promise(async(resolve, reject) => {
            try {
                var write_connection = await mysql.writeConnection();
                return resolve(write_connection);
            }
            catch(error){
                return reject(error);
            }
        })

    }

    getReadConnection() {
        return new Promise(async(resolve, reject) => {
            try {
                var read_connection = mysql.readConnection();
                return resolve(read_connection);
            }
            catch(error){
                return reject(error);
            }
        })
    }

    releaseReadConnection(connection) {
        return new Promise(async(resolve, reject) => {
            try{
                    if (connection != null) {
                        var conn = await connection.release();
                        return resolve(conn);
                  }
                }   
                catch(error){
                    return reject(error)
                }
        })

    }

    initBeginTransaction(connection) {
        return new Promise(async(resolve, reject) => {
            try {
               var begin_transaction = connection.begintransaction();
                return resolve(begin_transaction);
            }
            catch(error){
                return reject(error);
            }
        })

    }

    commitTransaction(connection) {
        return new Promise(async(resolve, reject) => {
            try {
                var commit_transaction = connection.commit();
                return resolve(commit_transaction)
             }
             catch(error){
                 return reject(error);
             }
        })
    }

    rollbackTransaction(connection) {
        return new Promise(async(resolve, reject) => {
            try {
                var rollback_transaction = connection.rollback();
                return resolve(rollback_transaction)
            }
            catch(error){
                return reject(error);
            }
        })
    }

    releaseWriteConnection(connection) {
        return new Promise(async(resolve, reject) => {
            try{
                if (connection != null) {
                    var release_write_connection = connection.release();
                    return resolve(release_write_connection)
                }
            }
            catch(error){
                return reject(error)
            }
        })
    }
}
