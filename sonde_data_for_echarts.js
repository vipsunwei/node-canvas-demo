const {
  err,
  baseUrl,
  http: getSondeDataset,
  arrayToDistinct,
  uniqueFun,
  filterFields,
  getOptionForFuse,
  getSoundingMsg,
} = require("./utils");
const { get } = require("./request");

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
  }
  return !sondeRawData ? [] : formatSondeDataset(sondeRawData);
}

/**
 * 格式化探空仪数据用于画廓线图
 * @param {array} sondeData 待格式化的探空仪数据数组
 * @returns {array}
 */
function formatSondeDataset(sondeData = []) {
  // 去重
  // sondeRawData = arrayToDistinct(sondeRawData, "seconds");
  sondeData = uniqueFun(sondeData, "seconds");
  // 保留用到的属性，可减小接口返回数据size
  sondeData = sondeData.map((item) =>
    filterFields(item, ["segmemt", "aboveSeaLevel", "temperature", "pressure", "humidity", "seconds"])
  );
  return sondeData;
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
    console.log("getSonde报错：", station, tkyid);
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
  try {
    const option = await getOptionForFuse({ station, tkyid });
    const result = await getSoundingMsg(option);
    fuseData = result;
  } catch (error) {
    err(error.message);
    console.log("getFuse报错:", station, tkyid);
    console.trace(error);
  }
  return fuseData || [];
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

  getSondeDataForEcharts(options)
    .then((result) => {
      res.send(result);
    })
    .catch((error) => {
      err(error.message);
      console.trace(error);
    });
}

module.exports = sondeDataForEcharts;
