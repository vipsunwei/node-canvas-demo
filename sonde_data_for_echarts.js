const {
  err,
  baseUrl,
  http: getSondeDataset,
  getOptionForFuse,
  getSoundingMsg,
  formatSondeDataset,
  formatFuseData,
} = require("./utils");

const resTypeHandlers = {
  sondeRaw: getSondeRaw,
  sonde: getSonde,
  fuse: getFuse,
};

/**
 * 探空仪非质控廓线图数据
 * @param {string} station 站号
 * @param {string} tkyid 探空仪编号
 */
async function getSondeRaw(station, tkyid) {
  // const url = `${baseUrl}/api/dataset/view.json?station=${station}&tkyid=${tkyid}&type=raw`;
  // let sondeRawData = undefined;
  // try {
  //   const { body } = await get(url);
  //   sondeRawData = body;
  // } catch (error) {
  //   err(error.message);
  //   console.trace(error);
  // }
  const url = `${baseUrl}/api/dataset/view.json`;
  let sondeRawData = undefined;
  try {
    const { data } = await getSondeDataset(url, { station, tkyid }, "raw");
    sondeRawData = data;
  } catch (error) {
    err(error.message);
    console.trace(error);
    console.log("getSondeRaw报错：url=" + url, "站号=" + station, "探空仪ID=" + tkyid);
  }
  return !sondeRawData ? [] : formatSondeDataset(sondeRawData);
}

/**
 * 探空仪质控廓线图数据
 * @param {string} station 站号
 * @param {string} tkyid 探空仪编号
 */
async function getSonde(station, tkyid) {
  const url = `${baseUrl}/api/dataset/view.json`;
  let sondeData = undefined;
  try {
    const { data } = await getSondeDataset(url, { station, tkyid });
    sondeData = data;
  } catch (error) {
    err(error.message);
    console.trace(error);
    console.log("getSonde报错：url=" + url, "站号=" + station, "探空仪ID=" + tkyid);
  }
  return !sondeData ? [] : formatSondeDataset(sondeData);
}

/**
 * 熔断器高程（度）图数据
 * @param {string} station 站号
 * @param {string} tkyid 探空仪编号
 */
async function getFuse(station, tkyid) {
  let fuseData = undefined;
  let option = {};
  try {
    option = await getOptionForFuse({ station, tkyid });
    console.log("station:" + station, "tkyid:" + tkyid, "getSoundingMsg 参数：", JSON.stringify(option));
    const result = await getSoundingMsg(option);
    fuseData = result;
  } catch (error) {
    err(error.message);
    console.log("getFuse报错:", station, tkyid);
    console.trace(error);
  }
  return !fuseData ? [] : formatFuseData(fuseData, option.startTime);
}

async function getSondeDataForEcharts(options) {
  const { station, tkyid, resTypeArr } = options;
  const result = {};
  // 2.遍历resType添加到promiseAllArr
  const promiseAllArr = [];
  resTypeArr.forEach((resType) => {
    const p = resTypeHandlers[resType](station, tkyid);
    promiseAllArr.push(p);
  });
  // 3.得到promiseAllResultArr
  const promiseAllResultArr = await Promise.all(promiseAllArr);
  // 4.以resType中每一项为key组装返回数据对象 {"sondeRaw": xxx, "fuse": xxx}
  promiseAllResultArr.forEach((item, i) => {
    result[resTypeArr[i]] = item;
  });

  return result;
}

/**
 * 根据入参判断需要请求哪些数据
 * @param req.body.resType 可选项："sonderaw,sonde,fuse" 默认不传或传空字符串返回所有可画图的数据
 * @param req.body.station 站号
 * @param req.body.tkyid 探空仪编号
 */
function sondeDataForEcharts(req, res) {
  const options = req?.body;
  if (!options.station) {
    res.status(400).send("parameter 'station' is empty!");
    warning("parameter 'station' is empty!");
    return;
  }
  if (!options.tkyid) {
    res.status(400).send("parameter 'tkyid' is empty!");
    warning("parameter 'tkyid' is empty!");
    return;
  }
  const resTypePool = ["sondeRaw", "sonde", "fuse"];
  // 1.resType string to array
  if (options.resType) {
    options.resTypeArr = options.resType.split(",");
  } else {
    options.resTypeArr = resTypePool;
  }
  const st = Date.now();
  getSondeDataForEcharts(options)
    .then((result) => {
      res.send(result);
      const dt = Date.now() - st;
      console.log(
        "站号=" + options.station,
        "探空仪ID=" + options.tkyid,
        "sondeDataForEcharts 用时：",
        dt / 1000,
        "秒"
      );
    })
    .catch((error) => {
      err(error.message);
      console.trace(error);
    });
}

module.exports = sondeDataForEcharts;
