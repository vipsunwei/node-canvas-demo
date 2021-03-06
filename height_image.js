const { info, warning, err, getDataForHeightImage, generateHeightImageBase64 } = require("./utils.js");

async function heightImageHandler(options) {
  // 原始数据返回结构
  // let rawResult = [[], [], [], [], []];
  // 质控数据返回结构
  // let result = [[], [[], [], []], [[], [], []], [[], [], []], [[], [], []]];
  let data = undefined;
  // let startTime = "";
  try {
    const st = Date.now();
    const res = await getDataForHeightImage(options);
    const d = Date.now() - st;
    info(options, "获取高程图数据", `用时：${d / 1000}秒`);
    data = res.data;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  // 2022/04/14修改：不需要获取熔断器数据了，所需参数也就不需要了
  // startTime = (sondeData && sondeData[0]?.seconds) || startTime;
  // if (options.type === "raw") {
  //   sondeData = !sondeData ? rawResult : formatSondeRawDataset(sondeData);
  // } else {
  //   sondeData = !sondeData ? result : formatSondeDataset(sondeData);
  // }

  /** 2022/04/14修改：不需要获取熔断器数据了，所需参数也就不需要了 **
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
    console.log("getSoundingMsg获取熔断数据时入参：");
    console.log(optionForFuse);
    fuseData = await getSoundingMsg(optionForFuse);
    console.log("返回的熔断数据 -- ", fuseData);
    const d = Date.now() - st;
    info(options, "获取熔断器数据", "用时：" + d / 1000 + "秒");
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  fuseData = !fuseData ? [[], []] : formatFuseData(fuseData, startTime);
  /* */

  // 如果传递参数from = web直接将格式化后的数据返回给浏览器，
  // 否则画图生成base64字符串返回给自动日报程序（泽帆）
  const fdata = data?.code !== 0 ? {} : data?.data || {};
  if (options?.from === "web") {
    return fdata;
  } else {
    let imgBase64 = "";
    try {
      imgBase64 = generateHeightImageBase64(fdata, options);
    } catch (error) {
      err(error.message);
      console.trace(error);
    }
    return imgBase64;
  }
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
