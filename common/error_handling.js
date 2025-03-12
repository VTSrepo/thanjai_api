function changeLog(error_code, lang) {

    switch (error_code) {

        case 1001:
            return InvalidUser(lang);
        case 1002:
            return InvalidProduct(lang);

     
    }
}

function InvalidUser(lang) {
    var error_code;
    if (lang == 'en') {
        error_code = { status: 401, code: 4001, message: "Sorry,User Not Found or Incorrect Password!.", developerMessage: "Sorry, User Not Found or Incorrect Password!." };
        return error_code;
    }
    else {
        error_code = { status: 401, code: 4001, message: "Sorry, User Not Found or Incorrect Password!.", developerMessage: "Sorry, User Not Found or Incorrect Password!." };
        return error_code;
    }
}


function InvalidProduct(lang) {
    console.log("Product");
    var error_code;
    if (lang == 'en') {
        error_code = { status: 401, code: 4001, message: "Sorry, Product Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
        return error_code;
    }
    else {
        error_code = { status: 401, code: 4001, message: "Sorry, Product Data Not Found!.", developerMessage: "Sorry, Product Data Not Found!." };
        return error_code;
    }
}




module.exports = {
    changeLog
}