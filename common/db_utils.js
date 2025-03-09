const mysql = require('mysql');
var debug = require('debug')('v1:gateway:utils');

const read_config = {
  host: process.env.WRITE_DB_SRV_HOST,
  user: process.env.WRITE_DB_USER,
  password: process.env.WRITE_DB_PASSWORD,
  database: process.env.WRITE_DB_DATABASE,
  port: process.env.WRITE_DB_PORT,
  charset: 'utf8',
  multipleStatements: true,
  connectTimeout: 15000,
  acquireTimeout: 10000,
  debug: false
}

const write_config = {
  host: process.env.WRITE_DB_SRV_HOST,
  user: process.env.WRITE_DB_USER,
  password: process.env.WRITE_DB_PASSWORD,
  database: process.env.WRITE_DB_DATABASE,
  port: process.env.WRITE_DB_PORT,
  charset: 'utf8',
  multipleStatements: true,
  connectTimeout: 15000,
  acquireTimeout: 10000,
  debug: false
}


// _read_connection.connect(function(err) {
//   if (err) {
//     console.error('error connecting read server : ' + err.stack);
//     return;
//   }
//   console.log('read server connected as id ' + readConnection.threadId);
//   return;
// });

// _write_connection.connect(function(err) {
//   if (err) {
//     console.error('error connecting write server: ' + err.stack);
//     return;
//   }
//   console.log('write server connected as id ' + writeConnection.threadId);
//   return;
// });

const writeConnection = () => {
  return new Promise((resolve, reject) => {
    const _write_connection = mysql.createConnection(write_config);
    _write_connection.connect((err) => {
      if (err) reject(err);
      console.log("MySQL pool connected: threadId " + _write_connection.threadId);
      const query = (sql, binding) => {
        return new Promise((resolve, reject) => {
          _write_connection.query(sql, binding, (err, result) => {
            if (err) reject(err);
            resolve(result);
          });
        });
      };
      const release = () => {
        return new Promise((resolve, reject) => {
          if (err) reject(err);
          console.log("MySQL pool released: threadId " + _write_connection.threadId);
          _write_connection.end(error => error ? reject(error) : resolve());

        });
      };
      const begintransaction = () => {
        return new Promise((resolve, reject) => {
          _write_connection.beginTransaction(async (err) => {
            if (err) reject(err);
            console.log("MySQL commit: threadId " + _write_connection.threadId);
            resolve();
          })
        });
      };
      const commit = () => {
        return new Promise((resolve, reject) => {
          if (err) reject(err);
          console.log("MySQL commit: threadId " + _write_connection.threadId);
          resolve(_write_connection.commit());
        });
      };
      const rollback = () => {
        return new Promise((resolve, reject) => {
          if (err) reject(err);
          console.log("MySQL rollback: threadId " + _write_connection.threadId);
          resolve(_write_connection.rollback());
        });
      };
      resolve({
        query,
        release,
        begintransaction,
        commit,
        rollback
      });
    });
  });
};


const readConnection = (sql, binding) => {
  return new Promise((resolve, reject) => {
    const _read_connection = mysql.createConnection(read_config);
    _read_connection.connect((err) => {
      if (err) reject(err);
      console.log("MySQL connected: threadId " + _read_connection.threadId);
      const query = (sql, binding) => {
        return new Promise((resolve, reject) => {
          _read_connection.query(sql, binding, (err, result) => {
            if (err) reject(err);
            resolve(result);
          });
        });
      };
      const release = () => {
        return new Promise((resolve, reject) => {
          if (err) reject(err);
          console.log("MySQL released: threadId " + _read_connection.threadId);
          _read_connection.end(error => error ? reject(error) : resolve());
        });
      };
      resolve({
        query,
        release
      });
    });
  })
};

module.exports = {
  readConnection,
  writeConnection,
};