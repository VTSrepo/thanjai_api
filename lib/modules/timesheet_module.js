const { TimesheetDao } = require("../dao/timesheet_dao");
var debug = require("debug")("v1:production:module");
const { changeLog } = require("../../common/error_handling");
var moment = require("moment-timezone");
//const { GetRandomPatientID } = require('../../common/app_utils');

class TimesheetModule {
  getTimesheets(org_id, query) {
    return new Promise(async (resolve, reject) => {
      var timesheetDao = new TimesheetDao();
      var connection = null;
      var get_timesheets;
      try {
        connection = await timesheetDao.getReadConnection();
        debug("query.filter", query);

        get_timesheets = await timesheetDao.getTimesheets(
          connection,
          org_id,
          query
        );
        if (
          get_timesheets.hasOwnProperty("status") &&
          get_timesheets.status == 404
        ) {
          if (connection) {
            await timesheetDao.releaseReadConnection(connection);
          }
          return resolve(get_timesheets);
        } else {
          var total_size = get_timesheets.length;
          var page_size = get_timesheets.length;
          var result_size = get_timesheets.length;
          var summary = {
            filteredsize: page_size,
            resultsize: result_size,
            totalsize: total_size,
          };
          var res = {
            status: 200,
            code: 200,
            message: "Success",
            developerMessage: "Success",
            summary,
            timesheets: get_timesheets,
          };

          if (connection) {
            await timesheetDao.releaseReadConnection(connection);
          }
          return resolve(res);
        }
      } catch (error) {
        if (connection) {
          await timesheetDao.releaseReadConnection(connection);
        }
        return reject(error);
      }
    });
  }

  createTimesheet(data, query) {
    return new Promise(async (resolve, reject) => {
      var today = new Date();
      var datetime = moment(today).utc().format("YYYY-MM-DD HH:mm:ss");
      var timesheetDao = new TimesheetDao();
      var read_connection = null;
      var ts_data, set_ts_data, user_product;
      var today = new Date();
      var date = moment(today).utc().format("YYYY-MM-DD");
      try {
        read_connection = await timesheetDao.getReadConnection();
        debug("CreateTS");
        var cur_date;
        if (data.hasOwnProperty("cur_date")) {
          cur_date = moment(data.cur_date).format("YYYY-MM-DD");
        }

        var get_ts_date = await timesheetDao.GetTimesheet(
          read_connection,
          data.org_id,
          data.branch_id,
          data.emp_id,
          cur_date,
          data.start_time,
          data.end_time
        );
        if (get_ts_date.hasOwnProperty("status")) {
          set_ts_data = await categories_data_to_schema_ts_data_to_create(
            read_connection,
            data,
            datetime
          );
          ts_data = await timesheetDao.createTimesheet(
            read_connection,
            set_ts_data
          );
          if (read_connection) {
            await timesheetDao.releaseReadConnection(read_connection);
          }
          var final_res = {
            status: 200,
            code: 200,
            message: "Success",
            developerMessage: "Success",
            timesheet: ts_data,
          };
          return resolve(final_res);
        } else {
          // user_product =
          //   await categories_data_to_schema_timesheet_data_to_update(
          //     data,
          //     get_ts_date,
          //     datetime
          //   );
          // ts_data = await timesheetDao.updateTimesheet(
          //   read_connection,
          //   user_product,
          //   data.org_id,
          //   data.branch_id,
          //   data.emp_id,
          //   cur_date
          // );
          // if (read_connection) {
          //   await timesheetDao.releaseReadConnection(read_connection);
          // }
          // var final_res = {
          //   status: 200,
          //   code: 200,
          //   message: "Success",
          //   developerMessage: "Success",
          //   timesheet: ts_data,
          // };
          // return resolve(final_res);
          var empty_response = {
            status: 404,
            code: 1001,
            message: "Record Already exist.",
            developerMessage: "Record Already exists",
          };

          if (read_connection) {
            await timesheetDao.releaseReadConnection(read_connection);
          }
          return resolve(empty_response);
        }
      } catch (error) {
        debug("error", error);
        if (read_connection) {
          await timesheetDao.releaseReadConnection(read_connection);
        }
        return reject(error);
      }
    });
  }
}

function categories_data_to_schema_ts_data_to_create(
  connection,
  data,
  datetime
) {
  return new Promise(async (resolve, reject) => {
    try {
      var cur_date = null;
      if (data.hasOwnProperty("cur_date") && data.cur_date != null) {
        cur_date = moment(data.cur_date).format("YYYY-MM-DD HH:mm:ss");
      }

      var production_data = {
        org_id: data.org_id,
        branch_id: data.branch_id,
        emp_id: data.emp_id,
        cur_date: cur_date,
        start_time: data.start_time,
        end_time: data.end_time,
        emp_id: data.emp_id,
        updated_by: data.user_id,
        updated_date: datetime,
        created_by: data.user_id,
        created_date: datetime,
      };
      debug("production_data", production_data);
      console.log(production_data);
      return resolve(production_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_timesheet_data_to_update(
  data,
  get_production_data,
  datetime
) {
  return new Promise(async (resolve, reject) => {
    try {
      var cur_date = null;
      if (data.hasOwnProperty("cur_date")) {
        cur_date = moment(data.cur_date).utc().format("YYYY-MM-DD");
      }
      var production_data = {
        start_time: data.start_time,
        end_time: data.end_time,
        updated_by: data.user_id,
        updated_date: datetime,
      };

      return resolve(production_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_insuranceprice_data_to_create(
  connection,
  data,
  date
) {
  return new Promise(async (resolve, reject) => {
    try {
      var insurance_data = {
        org_id: data.org_id,
        branch_id: data.branch_id,
        product_id: data.product_id,
        insurance_type_id: data.insurance_type_id,
        product_price: data.product_price,
        invoice_label: data.invoice_label,
        eff_from: data.eff_from,
        eff_to: data.eff_to,
        active_flag: data.active_flag,
        updated_by: data.user_id,
        updated_date: date,
        created_by: data.user_id,
        created_date: date,
      };
      return resolve(insurance_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_insuranceprice_data_to_update(
  data,
  get_po_number_data,
  date
) {
  return new Promise(async (resolve, reject) => {
    try {
      var insurance_data_update = {
        product_price: data.hasOwnProperty("product_price")
          ? data.product_price
          : get_po_number_data.product_price,
        invoice_label: data.hasOwnProperty("invoice_label")
          ? data.invoice_label
          : get_po_number_data.invoice_label,
        // eff_from: data.hasOwnProperty('eff_from')?data.eff_from:get_po_number_data.eff_from,
        // eff_to: data.hasOwnProperty('eff_to')?data.eff_to:get_po_number_data.eff_to,
        //active_flag: data.hasOwnProperty('active_flag')?data.active_flag:get_po_number_data.active_flag,
        updated_by: data.hasOwnProperty("user_id")
          ? data.user_id
          : get_po_number_data.updated_by,
        updated_date: date,
      };
      return resolve(insurance_data_update);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_normalprice_data_to_create(
  connection,
  data,
  date
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data = {
        org_id: data.org_id,
        branch_id: data.branch_id,
        product_id: data.product_id,
        product_price: data.product_price,
        mrp_price: data.mrp_price,
        discount_value: data.discount_value,
        discount_perc: data.discount_perc,
        eff_from: data.eff_from,
        eff_to: data.eff_to,
        active_flag: data.active_flag,
        updated_by: data.user_id,
        updated_date: date,
        created_by: data.user_id,
        created_date: date,
      };
      return resolve(normal_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_normalprice_data_to_update(
  data,
  get_po_number_data,
  date,
  datetime
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data_update = {
        product_price: data.hasOwnProperty("product_price")
          ? data.product_price
          : get_po_number_data.product_price,
        // eff_to: data.hasOwnProperty('eff_to')?data.eff_to:get_po_number_data.eff_to,
        prod_name_invoice: data.hasOwnProperty("prod_name_invoice")
          ? data.prod_name_invoice
          : get_po_number_data.prod_name_invoice,
        // updated_by: data.hasOwnProperty('user_id')?data.user_id:get_po_number_data.updated_by,
        updated_date: datetime,
      };
      return resolve(normal_data_update);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_product_price_data_to_create(
  read_connection,
  data,
  product_pricing,
  eff_from,
  date,
  datetime
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data = {
        org_id: data.org_id,
        branch_id: data.branch_id,
        product_id: product_pricing.product_id,
        product_price: product_pricing.product_price,

        eff_from: eff_from,

        prod_name_invoice: product_pricing.prod_name_invoice,

        // eff_to: (product_pricing.hasOwnProperty('eff_to'))?product_pricing.eff_to:null,
        active_flag: "Y",
        // updated_by: data.user_id,
        updated_date: datetime,
        //  created_by: data.user_id,
        created_date: datetime,
      };
      return resolve(normal_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_product_price_data_to_default_create(
  read_connection,
  data,
  ts_data,
  eff_from,
  date,
  datetime
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data = {
        org_id: data.org_id,
        branch_id: data.branch_id,
        product_id: ts_data.product_id,
        product_price: data.product_price,
        eff_from: date,
        prod_name_invoice: data.prod_name_invoice,
        // eff_to: (product_pricing.hasOwnProperty('eff_to'))?product_pricing.eff_to:null,
        active_flag: "Y",
        updated_by: data.user_id,
        updated_date: datetime,
        created_by: data.user_id,
        created_date: datetime,
      };
      return resolve(normal_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_product_price_data_to_update(
  read_connection,
  data,
  product_pricing,
  old_previous_date,
  date,
  get_product_pricing_data,
  datetime
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data = {
        eff_to: old_previous_date,
        active_flag: "N",
        //updated_by: data.user_id,
        updated_date: datetime,
      };
      return resolve(normal_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_product_insurance_price_data_to_create(
  read_connection,
  data,
  product_pricing,
  old_previous_date,
  date
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data = {
        org_id: data.org_id,
        branch_id: data.branch_id,
        product_id: product_pricing.product_id,
        insurance_type_id: product_pricing.insurance_type,
        product_price: product_pricing.product_price,
        invoice_label: product_pricing.invoice_label,
        eff_from: old_previous_date,
        // eff_to: (product_pricing.hasOwnProperty('eff_to'))?product_pricing.eff_to:null,
        updated_by: data.user_id,
        updated_date: date,
        created_by: data.user_id,
        created_date: date,
        active_flag: "Y",
      };
      return resolve(normal_data);
    } catch (error) {
      return reject(error);
    }
  });
}

function categories_data_to_schema_product_insurance_price_data_to_update(
  read_connection,
  data,
  product_pricing,
  old_previous_date,
  date,
  get_product_pricing_data
) {
  return new Promise(async (resolve, reject) => {
    try {
      var normal_data = {
        eff_to: old_previous_date,
        updated_by: data.user_id,
        updated_date: date,
      };
      return resolve(normal_data);
    } catch (error) {
      return reject(error);
    }
  });
}

module.exports = {
  TimesheetModule,
};
