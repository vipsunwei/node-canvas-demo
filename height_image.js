const {
  info,
  warning,
  err,
  getDataForImage,
  getOptionForFuse,
  getSoundingMsg,
  generateHeightImageBase64,
  formatSondeDataset,
  formatFuseData,
  formatSondeRawDataset,
} = require("./utils.js");

async function heightImageHandler(options) {
  // 原始数据返回结构
  let rawResult = [[], [], [], [], []];
  // 质控数据返回结构
  let result = [[], [[], [], []], [[], [], []], [[], [], []], [[], [], []]];
  let sondeData = undefined;
  let startTime = "";
  try {
    const st = Date.now();
    const res = await getDataForImage(options);
    const d = Date.now() - st;
    info(options, options.type === "raw" ? "获取探空仪原始数据" : "获取探空仪质控数据", `用时：${d / 1000}秒`);
    sondeData = res.data;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  startTime = (sondeData && sondeData[0]?.seconds) || startTime;
  if (options.type === "raw") {
    sondeData = !sondeData ? rawResult : formatSondeRawDataset(sondeData);
  } else {
    sondeData = !sondeData ? result : formatSondeDataset(sondeData);
  }

  // 获取熔断器数据所需参数
  let optionForFuse = {};
  try {
    const st = Date.now();
    optionForFuse = await getOptionForFuse(options);
    const d = Date.now() - st;
    info(options, "获取开始与结束时间", `用时：${d / 1000}秒`);
    // console.log(startTime, optionForFuse.startTime, optionForFuse.endTime);
    if (!startTime) {
      startTime = optionForFuse.startTime;
    }
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  // 获取熔断器数据
  let fuseData = undefined;
  try {
    const st = Date.now();
    fuseData = await getSoundingMsg(optionForFuse);
    const d = Date.now() - st;
    info(options, "获取熔断器数据", "用时：" + d / 1000 + "秒");
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  fuseData = !fuseData ? [[], []] : formatFuseData(fuseData, startTime);
  // console.log("返回的数据 -- ", fuseData);
  let imgBase64 = "";
  try {
    imgBase64 = generateHeightImageBase64(sondeData, fuseData, options);
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  return imgBase64;
}

/**
 * 处理/heightImage 路由请求
 * @param req.body.station
 * @param req.body.tkyid
 */
function heightImage(req, res) {
  const options = req?.body;
  if (!options || !options.station) {
    res.status(400).send("parameter 'station' is empty!");
    warning("parameter 'station' is empty!");
    return;
  }
  if (!options || !options.tkyid) {
    res.status(400).send("parameter 'tkyid' is empty!");
    warning("parameter 'tkyid' is empty!");
    return;
  }
  const st = Date.now();
  heightImageHandler(options)
    .then((result) => {
      res.send(result);
      const d = Date.now() - st;
      info(options, "生成高程图", `接口总用时：${d / 1000}秒`);
    })
    .catch((error) => {
      err("500 报错信息： " + error.message);
      console.trace(error);
      res.status(500).send(error);
    });
}

module.exports = heightImage;
