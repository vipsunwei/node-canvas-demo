const {
  err,
  baseUrl,
  http: getSondeDataset,
  // getOptionForFuse,
  // getSoundingMsg,
  formatSondeRawDataset,
  formatSondeDataset,
  // formatFuseData,
} = require("./utils");

const resTypeHandlers = {
  sondeRaw: getSondeRaw,
  sonde: getSonde,
  // fuse: getFuse,
};

const resTypeAll = ["sondeRaw", "sonde"];

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
  // const url = `${baseUrl}/api/dataset/view.json`;
  const url = `${baseUrl}/api/report/tkdatasetview`;
  let sondeRawData = undefined;
  // 下标 0：x轴时间，1：温度，2：湿度，3：气压，4：海拔，5：经纬度
  let result = [[], [], [], [], [], []];
  try {
    const { data } = await getSondeDataset(url, { station, tkyid }, "raw");
    sondeRawData = data;
  } catch (error) {
    err(error.message);
    console.trace(error);
    console.log("getSondeRaw报错：url=" + url, "站号=" + station, "探空仪ID=" + tkyid);
  }
  return !sondeRawData ? result : formatSondeRawDataset(sondeRawData);
}

/**
 * 探空仪质控廓线图数据
 * @param {string} station 站号
 * @param {string} tkyid 探空仪编号
 */
async function getSonde(station, tkyid) {
  // const url = `${baseUrl}/api/dataset/view.json`;
  const url = `${baseUrl}/api/report/tkdatasetview`;
  let sondeData = undefined;
  // 下标 0：x轴时间，1：温度，2：湿度，3：气压，4：海拔，5：经纬度
  let result = [[], [[], [], []], [[], [], []], [[], [], []], [[], [], []], []];
  try {
    const { data } = await getSondeDataset(url, { station, tkyid });
    sondeData = data;
  } catch (error) {
    err(error.message);
    console.trace(error);
    console.log("getSonde报错：url=" + url, "站号=" + station, "探空仪ID=" + tkyid);
  }
  return !sondeData ? result : formatSondeDataset(sondeData);
}

/**
 * 熔断器高程（度）图数据(废弃)
 * @description 修改日期：2022/04/14 @author sunwei
 * @description 以后没有熔断数据了，所以不处理fuse数据的获取了
 * @param {string} station 站号
 * @param {string} tkyid 探空仪编号
 */
/** 以后没有熔断数据了，所以不处理fuse数据的获取了 **
async function getFuse(station, tkyid) {
  let fuseData = undefined;
  let result = [[], [], [], []];
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
  return !fuseData ? result : formatFuseData(fuseData, option.startTime);
}
/* */

async function getSondeDataForEcharts(options) {
  const { station, tkyid, resTypeArr } = options;
  const result = {};
  // 2.遍历resType添加到promiseAllArr
  const promiseAllArr = [];
  const resTypeArrFiltration = [];
  resTypeArr.forEach((resType) => {
    // 增加resTypeAll列表，如果参数传递了超出列表范围的值，不做处理
    if (!resTypeAll.includes(resType)) return;
    // 只保留列表内的参数作为返回值对象的key
    resTypeArrFiltration.push(resType);
    const p = resTypeHandlers[resType](station, tkyid);
    promiseAllArr.push(p);
  });
  // 3.得到promiseAllResultArr
  const promiseAllResultArr = await Promise.all(promiseAllArr);
  // 4.以resType为key组装返回数据对象 例如：{"sondeRaw": xxx, "fuse": xxx}
  promiseAllResultArr.forEach((item, i) => {
    result[resTypeArrFiltration[i]] = item;
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

  // 1.resType string to array
  if (options.resType) {
    options.resTypeArr = options.resType.split(",");
  } else {
    options.resTypeArr = ["sondeRaw", "sonde"]; // 默认值
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
