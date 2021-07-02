const { promisify } = require("util");
const request = require("request");
const post = promisify(request.post);
const get = promisify(request.get);

module.exports = { post, get };
