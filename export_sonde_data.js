const { get } = require("./request");
function exportSondeData(req, res) {
  const sondeCode = req.query.sondeCode;
  console.log("sondeCode is", sondeCode);
  if (!sondeCode || String(sondeCode).length === 0) {
    res.status(400).send("参数错误");
    return;
  }
  const url = `http://172.16.100.36:8087/db/sounding/export/sounding_instrument_new?key=sondeCode&value=${sondeCode}&type=S&query=&projection=`;
  get(url)
    .then((result) => {
      res.status(result.statusCode).send(result.body);
    })
    .catch((error) => {
      console.trace(error);
      res.status(500).send(error.message);
    });
}

module.exports = exportSondeData;
