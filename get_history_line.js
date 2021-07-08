const {
  warning,
  err,
  getLastSondeDataByStation,
  formatSondeDataByStation,
  getDataSetHandler,
  deepObjectMerge,
} = require("./utils.js");

async function getHistoryLineHandler(stationArr) {
  const promiseArr = [];
  stationArr.forEach((station) => {
    const p = getLastSondeDataByStation(station);
    promiseArr.push(p);
  });
  const sondeDataArr = await Promise.all(promiseArr);
  const sondeData = formatSondeDataByStation(sondeDataArr, stationArr);
  const options = [];
  Object.values(sondeData).forEach((sonde) => {
    options.push({ station: sonde.stationNum, tkyid: sonde.tkyid });
  });
  let res = {};
  try {
    const dataSet = await getDataSetHandler(options);
    res = deepObjectMerge(sondeData, dataSet);
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  return res;
}

/**
 * 获取历史轨迹
 * @param req.body.stations 站号字符串，多站使用英文逗号拼接
 */
function getHistoryLine(req, res) {
  const options = req?.body;

  const stations = options.stations;
  if (!stations || typeof stations !== "string") {
    res.status(400).send('参数必须是站号字符串，多个以英文逗号(,)拼接，例如："12345,34534,65778,33455,35566"');
    warning('参数必须是站号字符串，多个以英文逗号(,)拼接，例如："12345,34534,65778,33455,35566"');
    return;
  }
  const stationArr = stations.split(",");
  const st = Date.now();
  getHistoryLineHandler(stationArr)
    .then((result) => {
      res.send(result);
      const dt = Date.now() - st;
      console.log("gethistoryline 用时：", dt / 1000, "秒");
    })
    .catch((error) => {
      err("报错信息：", error.message);
      console.trace(error);
      res.status(500).send(error);
    });
}

module.exports = getHistoryLine;
